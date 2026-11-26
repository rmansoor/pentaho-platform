import { ApiError } from '../http';
import { parseMailConfig, parseRolePermissions, type AdminSource, type MailConfig } from '../admin';

/** The sample install's users and roles. */
const USERS: Record<string, string[]> = {
  admin: ['Administrator'],
  suzy: ['Power User'],
  pat: ['Business Analyst'],
  tiffany: ['Report Author'],
  bob: ['Report Author'],
};
const ROLES = ['Administrator', 'Business Analyst', 'Power User', 'Report Author', 'Schedule Power User'];

export function createFixtureAdminSource(): AdminSource & { passwords: Map<string, string>; savedMail: () => MailConfig } {
  const users = new Map(Object.entries(structuredClone(USERS)));
  const roles = new Set(ROLES);
  const passwords = new Map<string, string>([['admin', 'password']]);
  const PERMS = [
    ['org.pentaho.repository.read', 'Read Content'],
    ['org.pentaho.repository.create', 'Create Content'],
    ['org.pentaho.repository.execute', 'Execute'],
    ['org.pentaho.scheduler.manage', 'Schedule Content'],
    ['org.pentaho.security.publish', 'Publish Content'],
    ['org.pentaho.security.administerSecurity', 'Administer Security'],
  ];
  const grants = new Map<string, string[]>([
    ['Administrator', PERMS.map(([id]) => id!)],
    ['Authenticated', ['org.pentaho.repository.read']],
    ['Business Analyst', ['org.pentaho.security.publish']],
    ['Power User', ['org.pentaho.repository.read', 'org.pentaho.repository.create', 'org.pentaho.scheduler.manage']],
  ]);
  let mail: MailConfig = parseMailConfig({ authenticate: true, smtpPort: 25, smtpProtocol: 'smtp', authMechanism: 'XOAUTH2', clientId: '' });
  const need = (user: string) => {
    const r = users.get(user);
    if (!r) throw new ApiError(404, user, `No user ${user}`);
    return r;
  };

  return {
    passwords,
    savedMail: () => mail,
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
    async getRolePermissions() {
      return parseRolePermissions(
        {
          assignments: [...grants].map(([roleName, logicalRoles]) => ({ roleName, logicalRoles, immutable: roleName === 'Administrator' })),
          localizedRoleNames: PERMS.map(([roleName, localizedName]) => ({ roleName, localizedName })),
        },
        [...roles],
      );
    },
    async setRolePermissions(role, ids) {
      if (role === 'Administrator') throw new ApiError(403, role, 'The Administrator role cannot be changed.');
      grants.set(role, [...ids]);
    },
    getMailConfig: async () => structuredClone(mail),
    async setMailConfig(config) {
      mail = structuredClone(config);
    },
    // A host named "smtp.example.com" works; anything else fails, like an unreachable server.
    testMail: async (config) => config.smtpHost === 'smtp.example.com',
    async deleteRoles(names) {
      names.forEach((n) => roles.delete(n));
      for (const [u, r] of users) users.set(u, r.filter((role) => !names.includes(role)));
    },
  };
}
