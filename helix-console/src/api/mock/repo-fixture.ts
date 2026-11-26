import {
  OVERWRITE_MODE,
  parseFolderResponse,
  parseTrashResponse,
  type FileAcl,
  type FileFlags,
  type OverwriteMode,
  type RepoSource,
} from '../repo';

/*
 * A small sample repository in the JSON shape the server returns, so the fixture exercises the
 * real parser. Used by tests and by `npm run dev:mock` for working on screens without a server.
 */

type Node = { name: string; owner?: string; modified: string; size?: number; children?: Node[] };

const day = (iso: string) => String(Date.parse(`${iso}T09:00:00Z`));

const TREE: Node = {
  name: '',
  modified: day('2026-01-05'),
  children: [
    {
      name: 'home',
      modified: day('2026-01-05'),
      children: [
        {
          name: 'admin',
          owner: 'admin',
          modified: day('2026-11-20'),
          children: [
            { name: 'Q3 review.prpt', owner: 'admin', modified: day('2026-11-20'), size: 48_213 },
            { name: 'Drafts', owner: 'admin', modified: day('2026-10-02'), children: [] },
          ],
        },
        { name: 'suzy', owner: 'suzy', modified: day('2026-09-14'), children: [] },
      ],
    },
    {
      name: 'public',
      modified: day('2026-01-05'),
      children: [
        {
          name: 'Steel Wheels',
          owner: 'admin',
          modified: day('2026-08-27'),
          children: [
            {
              name: 'Dashboards',
              owner: 'tiffany',
              modified: day('2026-06-09'),
              children: [
                { name: 'Territory Sales.wcdf', owner: 'tiffany', modified: day('2026-06-09'), size: 6_120 },
                { name: 'Customer Map.wcdf', owner: 'tiffany', modified: day('2026-06-03'), size: 5_870 },
              ],
            },
            {
              name: 'Data Integration',
              owner: 'pat',
              modified: day('2026-05-21'),
              children: [
                { name: 'Load orders.ktr', owner: 'pat', modified: day('2026-05-21'), size: 31_004 },
                { name: 'Nightly refresh.kjb', owner: 'pat', modified: day('2026-05-20'), size: 12_377 },
              ],
            },
            {
              name: 'Reports',
              owner: 'admin',
              modified: day('2026-08-27'),
              children: [
                { name: 'Buyer Report.prpt', owner: 'admin', modified: day('2026-08-27'), size: 61_442 },
                { name: 'Income Statement.prpt', owner: 'admin', modified: day('2026-08-14'), size: 54_118 },
                { name: 'Inventory List.prpt', owner: 'suzy', modified: day('2026-07-02'), size: 39_850 },
                { name: 'Top Customers.prpt', owner: 'suzy', modified: day('2026-07-02'), size: 42_731 },
                { name: 'Product Sales.prpti', owner: 'pat', modified: day('2026-06-18'), size: 18_904 },
                { name: 'Order Status.xanalyzer', owner: 'pat', modified: day('2026-06-11'), size: 9_216 },
              ],
            },
          ],
        },
        { name: 'Operations', owner: 'admin', modified: day('2026-03-30'), children: [] },
      ],
    },
  ],
};

// Same shape as a Pentaho 11.1 server: native booleans, folders with fileSize -1 and an empty
// lastModifiedDate, dates as epoch-millisecond strings, and no owner in tree responses.
function dto(node: Node, path: string, extra: Record<string, unknown> = {}) {
  const folder = node.children !== undefined;
  return {
    id: `id:${path}`,
    name: node.name,
    path: path || '/',
    folder,
    hidden: false,
    fileSize: folder ? -1 : (node.size ?? 0),
    createdDate: node.modified,
    lastModifiedDate: folder ? '' : node.modified,
    ...extra,
  };
}

interface Trashed {
  node: Node;
  originalFolder: string;
  deleted: string;
}

export interface FixtureOptions {
  delayMs?: number;
  /** Folders the signed-in user can't write to: restoring into them is refused, as on a real server. */
  readOnlyFolders?: string[];
  /** Items already in the trash: [repository path, deleted ISO date]. */
  trash?: Array<[string, string]>;
  /** Name of the signed-in user, for their home folder. */
  user?: string;
  /** Per-user settings as stored on the server (e.g. favorites JSON). */
  settings?: Record<string, string>;
  /** Whether the signed-in user is an administrator (default true). */
  administrator?: boolean;
}

const ADMIN_ENTRY = { recipient: 'Administrator', kind: 'role' as const, modifiable: false, permissions: new Set(['read', 'write', 'delete', 'manage'] as const) };
const DEFAULT_ENTRIES = () => [{ recipient: 'Authenticated', kind: 'role' as const, modifiable: true, permissions: new Set(['read'] as const) }];

/** An in-memory repository. Each call gets its own copy, so tests don't affect each other. */
export function createFixtureRepoSource(options: FixtureOptions = {}): RepoSource {
  const root: Node = structuredClone(TREE);
  const trash: Trashed[] = [];
  const user = options.user ?? 'admin';
  // Explicit ACLs by path; anything absent inherits (effectively Authenticated: read).
  const acls = new Map<string, { owner: string; entries: FileAcl['entries'] }>();
  const flags = new Map<string, FileFlags>();
  const settings = new Map(Object.entries(options.settings ?? {}));
  const effectiveEntries = (path: string): FileAcl['entries'] => {
    for (let p: string | null = path; p; p = p === '/' ? null : p.slice(0, p.lastIndexOf('/')) || '/') {
      const explicit = acls.get(p);
      if (explicit) return explicit.entries;
    }
    return DEFAULT_ENTRIES();
  };
  const wait = () => (options.delayMs ? new Promise((r) => setTimeout(r, options.delayMs)) : Promise.resolve());

  const find = (path: string): Node | undefined => {
    let node: Node | undefined = root;
    for (const part of path.split('/').filter(Boolean)) node = node?.children?.find((c) => c.name === part);
    return node;
  };
  const split = (path: string) => {
    const at = path.lastIndexOf('/');
    return { parent: path.slice(0, at) || '/', name: path.slice(at + 1) };
  };
  const pathOfId = (id: string) => id.replace(/^id:/, '');
  const detach = (path: string): Node => {
    const { parent, name } = split(path);
    const folder = find(parent);
    const index = folder?.children?.findIndex((c) => c.name === name) ?? -1;
    if (!folder?.children || index < 0) throw new Error(`Nothing at ${path}`);
    return folder.children.splice(index, 1)[0]!;
  };
  const attach = (folderPath: string, node: Node, mode: OverwriteMode) => {
    const folder = find(folderPath);
    if (!folder?.children) throw new Error(`No folder at ${folderPath}`);
    const clash = folder.children.findIndex((c) => c.name === node.name);
    if (clash >= 0) {
      if (mode === OVERWRITE_MODE.skip) return;
      if (mode === OVERWRITE_MODE.replace) folder.children.splice(clash, 1);
      else node.name = node.name.replace(/(\.[^.]+)?$/, (ext) => ` (copy)${ext}`);
    }
    folder.children.push(node);
  };
  const trashedById = (id: string) => trash.findIndex((t) => `id:trash:${t.originalFolder}/${t.node.name}` === id);

  for (const [path, deleted] of options.trash ?? []) {
    trash.push({ node: detach(path), originalFolder: split(path).parent, deleted: day(deleted) });
  }

  return {
    async listFolder(path) {
      await wait();
      const node = find(path);
      if (!node || node.children === undefined) throw new Error(`No folder at ${path}`);
      const base = path === '/' ? '' : path;
      const children = node.children.map((c) => ({ file: dto(c, `${base}/${c.name}`) }));
      return parseFolderResponse({ file: dto(node, path), children });
    },
    async listTrash() {
      await wait();
      const files = trash.map((t) =>
        dto(t.node, `/home/${user}/.trash/pho:x/${t.node.name}`, {
          id: `id:trash:${t.originalFolder}/${t.node.name}`,
          originalParentFolderPath: t.originalFolder,
          deletedDate: t.deleted,
        }),
      );
      return parseTrashResponse({ repositoryFileDto: files.length ? files : null });
    },
    async moveToTrash(ids) {
      await wait();
      for (const id of ids) {
        const path = pathOfId(id);
        trash.push({ node: detach(path), originalFolder: split(path).parent, deleted: String(Date.now()) });
      }
    },
    async restore(ids, mode) {
      await wait();
      const items = ids.map((id) => trash[trashedById(id)]).filter((t): t is Trashed => !!t);
      if (mode === undefined) {
        if (items.some((t) => options.readOnlyFolders?.includes(t.originalFolder))) {
          const home = find(`/home/${user}`);
          const clash = items.some((t) => home?.children?.some((c) => c.name === t.node.name));
          return clash ? 'home-conflict' : 'home-available';
        }
      }
      for (const t of items) {
        trash.splice(trash.indexOf(t), 1);
        attach(mode === undefined ? t.originalFolder : `/home/${user}`, t.node, mode ?? OVERWRITE_MODE.keepBoth);
      }
      return 'restored';
    },
    async deletePermanently(ids) {
      await wait();
      for (const id of ids) {
        const index = trashedById(id);
        if (index >= 0) trash.splice(index, 1);
      }
    },
    async getAcl(path) {
      await wait();
      if (!find(path)) throw new Error(`Nothing at ${path}`);
      const explicit = acls.get(path);
      const entries = (explicit?.entries ?? effectiveEntries(split(path).parent)).map((e) => ({ ...e, permissions: new Set(e.permissions) }));
      return { owner: explicit?.owner ?? 'admin', ownerKind: 'user', inheriting: !explicit, entries: [...entries, ADMIN_ENTRY] };
    },
    async setAcl(path, acl) {
      await wait();
      if (acl.inheriting) acls.delete(path);
      else acls.set(path, { owner: acl.owner, entries: acl.entries.filter((e) => e.modifiable && e.permissions.size) });
    },
    async getFlags(path) {
      await wait();
      return { ...(flags.get(path) ?? { hidden: false, schedulable: true }) };
    },
    async setFlags(path, next) {
      await wait();
      flags.set(path, { ...next });
    },
    async listRecipients() {
      await wait();
      return {
        users: ['admin', 'bob', 'pat', 'suzy', 'tiffany'],
        roles: ['Anonymous', 'Authenticated', 'Business Analyst', 'Power User', 'Report Author'],
      };
    },
    async getUserSetting(key) {
      await wait();
      return settings.get(key) ?? null;
    },
    async setUserSetting(key, value) {
      await wait();
      settings.set(key, value);
    },
    async getSession() {
      return { userName: user, isAdministrator: options.administrator ?? true };
    },
  };
}
