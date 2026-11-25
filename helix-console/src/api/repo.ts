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
};
