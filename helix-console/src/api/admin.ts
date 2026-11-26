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

export interface AdminSource {
  listUsers(signal?: AbortSignal): Promise<string[]>;
  listRoles(signal?: AbortSignal): Promise<string[]>;
  rolesOf(user: string, signal?: AbortSignal): Promise<string[]>;
  membersOf(role: string, signal?: AbortSignal): Promise<string[]>;
  createUser(name: string, password: string): Promise<void>;
  deleteUsers(names: string[]): Promise<void>;
  /** Sets another user's password; the server asks for the administrator's own password too. */
  setPassword(user: string, password: string, administratorPassword: string): Promise<void>;
  assignRoles(user: string, roles: string[]): Promise<void>;
  removeRoles(user: string, roles: string[]): Promise<void>;
  createRole(name: string): Promise<void>;
  deleteRoles(names: string[]): Promise<void>;
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
  assignRoles: (user, roles) => put(`${BASE}/assignRoleToUser?userName=${encodeURIComponent(user)}&roleNames=${tabs(roles)}`),
  removeRoles: (user, roles) => put(`${BASE}/removeRoleFromUser?userName=${encodeURIComponent(user)}&roleNames=${tabs(roles)}`),
  createRole: (name) => put(`${BASE}/createRole?roleName=${encodeURIComponent(name)}`),
  deleteRoles: (names) => put(`${BASE}/deleteRoles?roleNames=${tabs(names)}`),
};

const Context = createContext<AdminSource>(httpAdminSource);

export function AdminSourceProvider({ source, children }: { source: AdminSource; children: ReactNode }) {
  return createElement(Context.Provider, { value: source }, children);
}

export const adminKeys = {
  all: ['admin'] as const,
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
