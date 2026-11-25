import { z } from 'zod';
import { getJson, send, sendOk } from './http';

/*
 * Repository browsing over the platform REST API:
 *   GET /api/repo/files/{pathId}/tree?depth=1&showHidden=false&filter=*
 * which returns a RepositoryFileTreeDto { file, children[] } of RepositoryFileDto.
 *
 * The JAXB JSON provider sends dates as epoch-millisecond strings, may send booleans and
 * numbers as strings, and may collapse a one-element list into a bare object. The schemas
 * below absorb all three.
 */

const boolish = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === 'true');

const numberish = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v) => (v === undefined || v === '' ? undefined : Number(v)));

const dateish = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === '') return null;
    const ms = typeof v === 'number' ? v : /^\d+$/.test(v) ? Number(v) : Date.parse(v);
    return Number.isFinite(ms) ? new Date(ms) : null;
  });

const fileDtoSchema = z.object({
  id: z.string().nullish(),
  name: z.string(),
  path: z.string(),
  title: z.string().nullish(),
  description: z.string().nullish(),
  folder: boolish,
  hidden: boolish,
  fileSize: numberish,
  createdDate: dateish,
  lastModifiedDate: dateish,
  owner: z.string().nullish(),
  creatorId: z.string().nullish(),
  deletedDate: dateish,
  originalParentFolderPath: z.string().nullish(),
});

/** GET /repo/files/deleted: {repositoryFileDto: null | dto | dto[]}. */
const deletedWrapperSchema = z.object({
  repositoryFileDto: z
    .union([fileDtoSchema, z.array(fileDtoSchema)])
    .nullish()
    .transform((v) => (v == null ? [] : Array.isArray(v) ? v : [v])),
});

interface TreeDtoInput {
  file: z.input<typeof fileDtoSchema>;
  children?: TreeDtoInput | TreeDtoInput[];
}
interface TreeDto {
  file: z.output<typeof fileDtoSchema>;
  children: TreeDto[];
}

const treeDtoSchema: z.ZodType<TreeDto, TreeDtoInput> = z.lazy(() =>
  z.object({
    file: fileDtoSchema,
    children: z
      .union([treeDtoSchema, z.array(treeDtoSchema)])
      .optional()
      .transform((c) => (c === undefined ? [] : Array.isArray(c) ? c : [c])),
  }),
);

export type FileKind =
  | 'folder'
  | 'report'
  | 'interactive-report'
  | 'analysis'
  | 'dashboard'
  | 'transformation'
  | 'job'
  | 'action'
  | 'link'
  | 'file';

export interface RepoItem {
  /** Repository id; what the trash, restore and delete endpoints take. */
  id: string;
  path: string;
  name: string;
  /** Localized display name; falls back to the file name without its extension. */
  title: string;
  description?: string;
  folder: boolean;
  hidden: boolean;
  kind: FileKind;
  size?: number;
  created: Date | null;
  modified: Date | null;
  /** Not sent by the tree endpoint today (it lives in the file's ACL); kept for when it is. */
  owner?: string;
  /** Set for items in the trash. */
  deleted?: Date;
  /** For items in the trash: the folder it was deleted from. */
  originalFolder?: string;
}

export interface RepoFolder {
  folder: RepoItem;
  children: RepoItem[];
}

const KIND_BY_EXTENSION: Record<string, FileKind> = {
  prpt: 'report',
  prpti: 'interactive-report',
  xanalyzer: 'analysis',
  wcdf: 'dashboard',
  xcdf: 'dashboard',
  ktr: 'transformation',
  kjb: 'job',
  xaction: 'action',
  url: 'link',
};

export const KIND_LABEL: Record<FileKind, string> = {
  folder: 'Folder',
  report: 'Report',
  'interactive-report': 'Interactive report',
  analysis: 'Analysis',
  dashboard: 'Dashboard',
  transformation: 'Transformation',
  job: 'Job',
  action: 'Action sequence',
  link: 'Link',
  file: 'File',
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function toItem(dto: z.output<typeof fileDtoSchema>): RepoItem {
  const ext = extensionOf(dto.name);
  const kind: FileKind = dto.folder ? 'folder' : (KIND_BY_EXTENSION[ext] ?? 'file');
  const bare = !dto.folder && ext ? dto.name.slice(0, -(ext.length + 1)) : dto.name;
  return {
    id: dto.id || dto.path,
    path: dto.path,
    name: dto.name,
    title: dto.title?.trim() || bare || dto.path,
    description: dto.description || undefined,
    folder: dto.folder,
    hidden: dto.hidden,
    kind,
    // Folders report fileSize -1.
    size: dto.folder || dto.fileSize === undefined || dto.fileSize < 0 ? undefined : dto.fileSize,
    created: dto.createdDate,
    // Folders come back with an empty lastModifiedDate; their creation date is the best we have.
    modified: dto.lastModifiedDate ?? dto.createdDate,
    owner: dto.owner || dto.creatorId || undefined,
    deleted: dto.deletedDate ?? undefined,
    originalFolder: dto.originalParentFolderPath || undefined,
  };
}

/** Parses the trash listing. Exported for tests. */
export function parseTrashResponse(json: unknown): RepoItem[] {
  return deletedWrapperSchema.parse(json).repositoryFileDto.map(toItem);
}

/** Parses one tree response into the folder and its direct children. Exported for tests. */
export function parseFolderResponse(json: unknown): RepoFolder {
  const tree = treeDtoSchema.parse(json);
  return { folder: toItem(tree.file), children: tree.children.map((c) => toItem(c.file)) };
}

/** Repository path ("/public/Steel Wheels") to the REST path id (":public:Steel Wheels"), URL-encoded. */
export function toPathId(path: string): string {
  const id = path.replace(/:/g, '\t').replace(/\//g, ':');
  return encodeURIComponent(id || ':');
}

/*
 * Sharing. Permission ordinals follow RepositoryFilePermission: READ 0, WRITE 1, DELETE 2,
 * ACL_MANAGEMENT 3, ALL 4. A single permission arrives as a string, several as an array.
 */
export type Permission = 'read' | 'write' | 'delete' | 'manage';
export const PERMISSIONS: readonly Permission[] = ['read', 'write', 'delete', 'manage'];
const ORDINAL: Record<Permission, string> = { read: '0', write: '1', delete: '2', manage: '3' };
const ALL_ORDINAL = '4';

export interface AclEntry {
  recipient: string;
  kind: 'user' | 'role';
  permissions: Set<Permission>;
  /** False for entries the server adds for display (the Administrator role); never sent back. */
  modifiable: boolean;
}

export interface FileAcl {
  owner: string;
  ownerKind: 'user' | 'role';
  /** When true, `entries` are the effective ones inherited from the parent folder. */
  inheriting: boolean;
  entries: AclEntry[];
}

const stringList = z
  .union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))])
  .nullish()
  .transform((v) => (v == null ? [] : (Array.isArray(v) ? v : [v]).map(String)));

const aclDtoSchema = z.object({
  owner: z.string().nullish(),
  ownerType: numberish,
  entriesInheriting: boolish,
  aces: z
    .union([
      z.object({ recipient: z.string(), recipientType: numberish, modifiable: boolish, permissions: stringList }),
      z.array(z.object({ recipient: z.string(), recipientType: numberish, modifiable: boolish, permissions: stringList })),
    ])
    .nullish()
    .transform((v) => (v == null ? [] : Array.isArray(v) ? v : [v])),
});

/** Parses GET /repo/files/{id}/acl. Exported for tests. */
export function parseAclResponse(json: unknown): FileAcl {
  const dto = aclDtoSchema.parse(json);
  return {
    owner: dto.owner ?? '',
    ownerKind: dto.ownerType === 1 ? 'role' : 'user',
    inheriting: dto.entriesInheriting,
    entries: dto.aces.map((ace) => ({
      recipient: ace.recipient,
      kind: ace.recipientType === 1 ? 'role' : 'user',
      modifiable: ace.modifiable,
      permissions: ace.permissions.includes(ALL_ORDINAL)
        ? new Set(PERMISSIONS)
        : new Set(PERMISSIONS.filter((p) => ace.permissions.includes(ORDINAL[p]))),
    })),
  };
}

/**
 * Body for PUT /repo/files/{id}/acl. Server quirk: the DTO's list setter resets
 * entriesInheriting to false, so turning inheritance on means sending no `aces` at all;
 * sending entries turns it off. Display-only entries are dropped.
 */
export function aclRequestBody(acl: FileAcl): string {
  const base = { owner: acl.owner, ownerType: acl.ownerKind === 'role' ? 1 : 0 };
  if (acl.inheriting) return JSON.stringify({ ...base, entriesInheriting: true });
  const aces = acl.entries
    .filter((e) => e.modifiable && e.permissions.size > 0)
    .map((e) => ({
      recipient: e.recipient,
      recipientType: e.kind === 'role' ? 1 : 0,
      modifiable: true,
      permissions:
        e.permissions.size === PERMISSIONS.length ? [ALL_ORDINAL] : PERMISSIONS.filter((p) => e.permissions.has(p)).map((p) => ORDINAL[p]),
    }));
  return JSON.stringify({ ...base, aces, entriesInheriting: false });
}

/** Per-file flags kept as repository metadata. */
export interface FileFlags {
  hidden: boolean;
  schedulable: boolean;
}

const metadataSchema = z.object({
  stringKeyStringValueDto: z
    .union([z.object({ key: z.string(), value: z.string().nullish() }), z.array(z.object({ key: z.string(), value: z.string().nullish() }))])
    .nullish()
    .transform((v) => (v == null ? [] : Array.isArray(v) ? v : [v])),
});

export function parseMetadataResponse(json: unknown): FileFlags {
  const entries = metadataSchema.parse(json).stringKeyStringValueDto;
  const get = (key: string) => entries.find((e) => e.key === key)?.value;
  return { hidden: get('_PERM_HIDDEN') === 'true', schedulable: get('_PERM_SCHEDULABLE') !== 'false' };
}

export interface Recipients {
  users: string[];
  roles: string[];
}

/** How a restore went; the server can refuse the original folder (no write access there). */
export type RestoreOutcome =
  /** Back in its original folder. */
  | 'restored'
  /** Can't go back; it can go to the user's home folder with no name clashes. */
  | 'home-available'
  /** Can't go back; the home folder already has items with the same names. */
  | 'home-conflict';

/** What to do with name clashes when restoring to the home folder (server MODE_* values). */
export const OVERWRITE_MODE = { replace: 1, keepBoth: 2, skip: 3 } as const;
export type OverwriteMode = (typeof OVERWRITE_MODE)[keyof typeof OVERWRITE_MODE];

/** Where the Files screens read from and write to. Swapped for a fixture in tests and `npm run dev:mock`. */
export interface RepoSource {
  listFolder(path: string, signal?: AbortSignal): Promise<RepoFolder>;
  listTrash(signal?: AbortSignal): Promise<RepoItem[]>;
  moveToTrash(ids: string[]): Promise<void>;
  /** Without `mode`, restores to the original folder; with it, to the user's home folder. */
  restore(ids: string[], mode?: OverwriteMode): Promise<RestoreOutcome>;
  deletePermanently(ids: string[]): Promise<void>;
  getAcl(path: string, signal?: AbortSignal): Promise<FileAcl>;
  setAcl(path: string, acl: FileAcl): Promise<void>;
  getFlags(path: string, signal?: AbortSignal): Promise<FileFlags>;
  setFlags(path: string, flags: FileFlags): Promise<void>;
  /** Users and roles that permissions can be granted to. */
  listRecipients(signal?: AbortSignal): Promise<Recipients>;
}

// The file endpoints take a comma-separated list of ids as a plain-text body.
const idList = (ids: string[]) => ({ body: ids.join(','), contentType: 'text/plain' });

export const httpRepoSource: RepoSource = {
  async listFolder(path, signal) {
    const query = 'depth=1&showHidden=false&filter=*';
    const json = await getJson(`/repo/files/${toPathId(path)}/tree?${query}`, z.unknown(), signal);
    return parseFolderResponse(json);
  },
  async listTrash(signal) {
    return parseTrashResponse(await getJson('/repo/files/deleted', z.unknown(), signal));
  },
  async moveToTrash(ids) {
    await sendOk('PUT', '/repo/files/delete', idList(ids));
  },
  async restore(ids, mode) {
    const query = mode === undefined ? '' : `?overwriteMode=${mode}`;
    const response = await send('PUT', `/repo/files/restore${query}`, idList(ids));
    // 406 and 307 both mean "not the original folder, but home works"; 409 means clashes there.
    if (response.ok) return 'restored';
    if (response.status === 406 || response.status === 307) return 'home-available';
    if (response.status === 409) return 'home-conflict';
    throw new Error(`Restore failed (${response.status})`);
  },
  async deletePermanently(ids) {
    await sendOk('PUT', '/repo/files/deletepermanent', idList(ids));
  },
  async getAcl(path, signal) {
    return parseAclResponse(await getJson(`/repo/files/${toPathId(path)}/acl`, z.unknown(), signal));
  },
  async setAcl(path, acl) {
    await sendOk('PUT', `/repo/files/${toPathId(path)}/acl`, { body: aclRequestBody(acl), contentType: 'application/json' });
  },
  async getFlags(path, signal) {
    return parseMetadataResponse(await getJson(`/repo/files/${toPathId(path)}/metadata`, z.unknown(), signal));
  },
  async setFlags(path, flags) {
    const body = JSON.stringify({
      stringKeyStringValueDto: [
        { key: '_PERM_HIDDEN', value: String(flags.hidden) },
        { key: '_PERM_SCHEDULABLE', value: String(flags.schedulable) },
      ],
    });
    await sendOk('PUT', `/repo/files/${toPathId(path)}/metadata`, { body, contentType: 'application/json' });
  },
  async listRecipients(signal) {
    const usersSchema = z.object({ users: stringList });
    const rolesSchema = z.object({ roles: stringList });
    const [users, roles] = await Promise.all([
      getJson('/userrolelist/permission-users', usersSchema, signal),
      getJson('/userrolelist/permission-roles', rolesSchema, signal),
    ]);
    return { users: users.users, roles: roles.roles };
  },
};
