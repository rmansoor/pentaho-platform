import { ApiError } from '../http';
import type { AdminSource } from '../admin';

/** The sample install's users and roles. */
const USERS: Record<string, string[]> = {
  admin: ['Administrator'],
  suzy: ['Power User'],
  pat: ['Business Analyst'],
  tiffany: ['Report Author'],
  bob: ['Report Author'],
};
const ROLES = ['Administrator', 'Business Analyst', 'Power User', 'Report Author', 'Schedule Power User'];

export function createFixtureAdminSource(): AdminSource & { passwords: Map<string, string> } {
  const users = new Map(Object.entries(structuredClone(USERS)));
  const roles = new Set(ROLES);
  const passwords = new Map<string, string>([['admin', 'password']]);
  const need = (user: string) => {
    const r = users.get(user);
    if (!r) throw new ApiError(404, user, `No user ${user}`);
    return r;
  };

  return {
    passwords,
    listUsers: async () => [...users.keys()].sort(),
    listRoles: async () => [...roles].sort(),
    rolesOf: async (user) => [...need(user)],
    membersOf: async (role) => [...users].filter(([, r]) => r.includes(role)).map(([u]) => u).sort(),
    async createUser(name, password) {
      if (users.has(name)) throw new ApiError(400, name, 'A user with that name already exists.');
      users.set(name, []);
      passwords.set(name, password);
    },
    async deleteUsers(names) {
      names.forEach((n) => users.delete(n));
    },
    async setPassword(user, password, administratorPassword) {
      need(user);
      if (administratorPassword !== passwords.get('admin')) throw new ApiError(403, user, 'The administrator password is incorrect.');
      passwords.set(user, password);
    },
    async changeOwnPassword(user, oldPassword, newPassword) {
      if (passwords.get(user) !== oldPassword) throw new ApiError(400, user, 'Your current password is incorrect.');
      passwords.set(user, newPassword);
    },
    async assignRoles(user, add) {
      const r = need(user);
      add.forEach((role) => !r.includes(role) && r.push(role));
    },
    async removeRoles(user, remove) {
      users.set(user, need(user).filter((role) => !remove.includes(role)));
    },
    async createRole(name) {
      if (roles.has(name)) throw new ApiError(400, name, 'A role with that name already exists.');
      roles.add(name);
    },
    async deleteRoles(names) {
      names.forEach((n) => roles.delete(n));
      for (const [u, r] of users) users.set(u, r.filter((role) => !names.includes(role)));
    },
  };
}
