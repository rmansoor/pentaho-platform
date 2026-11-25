import { z } from 'zod';
import { getJson } from './http';

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
  id: z.string().optional(),
  name: z.string(),
  path: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  folder: boolish,
  hidden: boolish,
  fileSize: numberish,
  createdDate: dateish,
  lastModifiedDate: dateish,
  owner: z.string().optional(),
  creatorId: z.string().optional(),
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
  owner?: string;
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
    path: dto.path,
    name: dto.name,
    title: dto.title?.trim() || bare || dto.path,
    description: dto.description || undefined,
    folder: dto.folder,
    hidden: dto.hidden,
    kind,
    size: dto.folder ? undefined : dto.fileSize,
    created: dto.createdDate,
    modified: dto.lastModifiedDate,
    owner: dto.owner || dto.creatorId || undefined,
  };
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

/** Where the Files screen reads from. Swapped for a fixture in tests and in `npm run dev:mock`. */
export interface RepoSource {
  listFolder(path: string, signal?: AbortSignal): Promise<RepoFolder>;
}

export const httpRepoSource: RepoSource = {
  async listFolder(path, signal) {
    const query = 'depth=1&showHidden=false&filter=*';
    const json = await getJson(`/repo/files/${toPathId(path)}/tree?${query}`, z.unknown(), signal);
    return parseFolderResponse(json);
  },
};
