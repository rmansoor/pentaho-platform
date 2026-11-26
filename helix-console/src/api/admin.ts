import { createContext, createElement, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, getJson, send } from './http';

/*
 * Users and roles (/api/userroledao). Lists come back as {users: string | string[]} /
 * {roles: ...}. Bulk parameters are tab-separated query parameters. Passwords may be sent as
 * "ENC:" + base64 so they never appear as plain text in logs; the server decodes them.
 * Validation failures (weak password, existing user) come back as 400/403 with the reason in a
 * PUC_VALIDATION_ERROR_MESSAGE header.
 */

const list = (key: 'users' | 'roles') =>
  z.object({ [key]: z.union([z.string(), z.array(z.string())]).nullish() }).transform((o) => {
    const v = (o as Record<string, string | string[] | null | undefined>)[key];
    return v == null ? [] : Array.isArray(v) ? v : [v];
  });

const tabs = (names: string[]) => encodeURIComponent(names.join('\t'));
export const encodePassword = (password: string) => `ENC:${btoa(String.fromCharCode(...new TextEncoder().encode(password)))}`;

async function put(path: string, body?: unknown) {
  const response = await send('PUT', path, body === undefined ? {} : { body: JSON.stringify(body), contentType: 'application/json' });
  if (!response.ok) {
    const reason = response.headers.get('PUC_VALIDATION_ERROR_MESSAGE');
    throw new ApiError(response.status, path, reason || `${response.status} ${response.statusText}`.trim());
  }
}

/** Mail server settings (/api/emailconfig). OAuth fields are carried through unchanged. */
export interface MailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpProtocol: string;
  useSsl: boolean;
  useStartTls: boolean;
  authenticate: boolean;
  userId: string;
  password: string;
  defaultFrom: string;
  fromName: string;
  /** Everything else the server sent (authMechanism, clientId, …), returned as-is on save. */
  rest: Record<string, unknown>;
}

const MAIL_KEYS = ['smtpHost', 'smtpPort', 'smtpProtocol', 'useSsl', 'useStartTls', 'authenticate', 'userId', 'password', 'defaultFrom', 'fromName'] as const;

export function parseMailConfig(json: unknown): MailConfig {
  const o = (json ?? {}) as Record<string, unknown>;
  const rest = Object.fromEntries(Object.entries(o).filter(([k]) => !(MAIL_KEYS as readonly string[]).includes(k)));
  const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : '');
  const bool = (k: string) => o[k] === true || o[k] === 'true';
  return {
    smtpHost: str('smtpHost'),
    smtpPort: Number(o.smtpPort ?? 25) || 25,
    smtpProtocol: str('smtpProtocol') || 'smtp',
    useSsl: bool('useSsl'),
    useStartTls: bool('useStartTls'),
    authenticate: bool('authenticate'),
    userId: str('userId'),
    password: str('password'),
    defaultFrom: str('defaultFrom'),
    fromName: str('fromName'),
    rest,
  };
}

export function mailConfigBody(config: MailConfig): string {
  const { rest, ...fields } = config;
  return JSON.stringify({ ...rest, ...fields });
}

/** The test endpoint answers a message key; note the server's spelling of SUCESS. */
export const mailTestPassed = (result: string) => /EmailTester\.SUC+ESS/.test(result);

/** What each role may do (/api/userroledao/logicalRoleMap). */
export interface RolePermissions {
  /** Permission id ("org.pentaho.scheduler.manage") and its localized name ("Schedule Content"). */
  permissions: { id: string; label: string }[];
  roles: { name: string; granted: string[]; immutable: boolean }[];
}

const asList = <T,>(v: T | T[] | null | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

export function parseRolePermissions(json: unknown, allRoles: string[] = []): RolePermissions {
  const o = (json ?? {}) as { assignments?: unknown; localizedRoleNames?: unknown };
  const assignments = asList(o.assignments as Record<string, unknown> | Record<string, unknown>[]).map((a) => ({
    name: String(a.roleName),
    granted: asList(a.logicalRoles as string | string[]).map(String),
    immutable: a.immutable === true || a.immutable === 'true',
  }));
  const permissions = asList(o.localizedRoleNames as Record<string, unknown> | Record<string, unknown>[]).map((p) => ({
    id: String(p.roleName),
    label: String(p.localizedName ?? p.roleName),
  }));
  const known = new Set(assignments.map((a) => a.name));
  const missing = allRoles.filter((r) => !known.has(r)).map((name) => ({ name, granted: [] as string[], immutable: false }));
  return {
    permissions,
    roles: [...assignments, ...missing].sort((a, b) => Number(b.immutable) - Number(a.immutable) || a.name.localeCompare(b.name)),
  };
}

export interface AdminSource {
  listUsers(signal?: AbortSignal): Promise<string[]>;
  listRoles(signal?: AbortSignal): Promise<string[]>;
  rolesOf(user: string, signal?: AbortSignal): Promise<string[]>;
  membersOf(role: string, signal?: AbortSignal): Promise<string[]>;
  createUser(name: string, password: string): Promise<void>;
  deleteUsers(names: string[]): Promise<void>;
  /** Sets another user's password; the server asks for the administrator's own password too. */
  setPassword(user: string, password: string, administratorPassword: string): Promise<void>;
  /** The signed-in user changes their own password. */
  changeOwnPassword(user: string, oldPassword: string, newPassword: string): Promise<void>;
  assignRoles(user: string, roles: string[]): Promise<void>;
  removeRoles(user: string, roles: string[]): Promise<void>;
  createRole(name: string): Promise<void>;
  deleteRoles(names: string[]): Promise<void>;
  getRolePermissions(signal?: AbortSignal): Promise<RolePermissions>;
  /** Replaces one role's permissions. */
  setRolePermissions(role: string, permissionIds: string[]): Promise<void>;
  getMailConfig(signal?: AbortSignal): Promise<MailConfig>;
  setMailConfig(config: MailConfig): Promise<void>;
  /** Sends a test email with these (unsaved) settings; true when the server reports success. */
  testMail(config: MailConfig): Promise<boolean>;
}

const BASE = '/userroledao';

export const httpAdminSource: AdminSource = {
  listUsers: async (signal) => (await getJson(`${BASE}/users`, list('users'), signal)).sort(),
  listRoles: async (signal) => (await getJson(`${BASE}/roles`, list('roles'), signal)).sort(),
  rolesOf: async (user, signal) => getJson(`${BASE}/userRoles?userName=${encodeURIComponent(user)}`, list('roles'), signal),
  membersOf: async (role, signal) => getJson(`${BASE}/roleMembers?roleName=${encodeURIComponent(role)}`, list('users'), signal),
  createUser: (name, password) => put(`${BASE}/createUser`, { userName: name, password: encodePassword(password) }),
  deleteUsers: (names) => put(`${BASE}/deleteUsers?userNames=${tabs(names)}`),
  setPassword: (user, password, administratorPassword) =>
    put(`${BASE}/updatePassword`, {
      userName: user,
      password: encodePassword(password),
      administratorPassword: encodePassword(administratorPassword),
    }),
  changeOwnPassword: (user, oldPassword, newPassword) =>
    put(`${BASE}/user`, { userName: user, oldPassword: encodePassword(oldPassword), newPassword: encodePassword(newPassword) }),
  assignRoles: (user, roles) => put(`${BASE}/assignRoleToUser?userName=${encodeURIComponent(user)}&roleNames=${tabs(roles)}`),
  removeRoles: (user, roles) => put(`${BASE}/removeRoleFromUser?userName=${encodeURIComponent(user)}&roleNames=${tabs(roles)}`),
  createRole: (name) => put(`${BASE}/createRole?roleName=${encodeURIComponent(name)}`),
  deleteRoles: (names) => put(`${BASE}/deleteRoles?roleNames=${tabs(names)}`),
  async getRolePermissions(signal) {
    const [map, roles] = await Promise.all([
      getJson(`${BASE}/logicalRoleMap?locale=${encodeURIComponent(navigator.language || 'en')}`, z.unknown(), signal),
      getJson(`${BASE}/roles`, list('roles'), signal),
    ]);
    return parseRolePermissions(map, roles);
  },
  setRolePermissions: (role, permissionIds) => put(`${BASE}/roleAssignments`, { assignments: [{ roleName: role, logicalRoles: permissionIds }] }),
  getMailConfig: async (signal) => parseMailConfig(await getJson('/emailconfig/getEmailConfig', z.unknown(), signal)),
  async setMailConfig(config) {
    const response = await send('PUT', '/emailconfig/setEmailConfig', { body: mailConfigBody(config), contentType: 'application/json' });
    if (!response.ok) throw new ApiError(response.status, '/emailconfig/setEmailConfig', `The settings were not saved (${response.status}).`);
  },
  async testMail(config) {
    const response = await send('PUT', '/emailconfig/sendEmailTest', { body: mailConfigBody(config), contentType: 'application/json', accept: 'text/plain' });
    if (!response.ok) throw new ApiError(response.status, '/emailconfig/sendEmailTest', `The test could not run (${response.status}).`);
    return mailTestPassed(await response.text());
  },
};

const Context = createContext<AdminSource>(httpAdminSource);

export function AdminSourceProvider({ source, children }: { source: AdminSource; children: ReactNode }) {
  return createElement(Context.Provider, { value: source }, children);
}

export const adminKeys = {
  all: ['admin'] as const,
  mail: ['admin', 'mail'] as const,
  permissions: ['admin', 'permissions'] as const,
  users: ['admin', 'users'] as const,
  roles: ['admin', 'roles'] as const,
  rolesOf: (user: string) => ['admin', 'rolesOf', user] as const,
  membersOf: (role: string) => ['admin', 'membersOf', role] as const,
};

export const useAdminSource = () => useContext(Context);

export function useUsers() {
  const s = useAdminSource();
  return useQuery({ queryKey: adminKeys.users, queryFn: ({ signal }) => s.listUsers(signal) });
}
export function useRoles() {
  const s = useAdminSource();
  return useQuery({ queryKey: adminKeys.roles, queryFn: ({ signal }) => s.listRoles(signal) });
}
export function useRolesOf(user: string | null) {
  const s = useAdminSource();
  return useQuery({ queryKey: adminKeys.rolesOf(user ?? ''), queryFn: ({ signal }) => s.rolesOf(user!, signal), enabled: !!user });
}
export function useMembersOf(role: string | null) {
  const s = useAdminSource();
  return useQuery({ queryKey: adminKeys.membersOf(role ?? ''), queryFn: ({ signal }) => s.membersOf(role!, signal), enabled: !!role });
}

export function useMailConfig() {
  const s = useAdminSource();
  return useQuery({ queryKey: adminKeys.mail, queryFn: ({ signal }) => s.getMailConfig(signal) });
}

export function useRolePermissions() {
  const s = useAdminSource();
  return useQuery({ queryKey: adminKeys.permissions, queryFn: ({ signal }) => s.getRolePermissions(signal) });
}
