import { createContext, createElement, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, getJson, getResponse, PLUGIN_ROOT, send } from './http';

/*
 * Datasets, from the data-access plugin's v2 API (/pentaho/plugin/data-access/api/v2/datasets; the
 * OpenAPI document is at /pentaho/plugin/data-access/api/v2/openapi.json):
 *   GET    /datasets                      -> {datasets: [summary]}
 *   POST   /datasets                      definition -> 201, definition, ETag
 *   GET    /datasets/{id}                 -> definition, ETag (the version)
 *   PUT    /datasets/{id}   If-Match      definition -> definition, ETag
 *   DELETE /datasets/{id}   If-Match      -> 204
 *   POST   /datasets/{id}/sample?limit=   -> {columns, rows, truncated}
 *   POST   /datasets/{id}/stage  If-Match -> {connection, table, rows, columns, warnings}, ETag
 *   POST   /datasets/{id}/stage?async=true  If-Match -> 202 job; GET .../stage follows it, DELETE .../stage stops it
 *   GET    /connections/{name}/tables     -> {tables: [{schema?, name, type, qualifiedName}], truncated}
 *   GET    /settings/staging              -> {connection?, schema?, saved: {...}, defaults: {...}}
 *   PUT    /settings/staging  {connection?, schema?} (administrators) -> the same
 * Errors are {code, message, path?, problems?: [{path, message}]}.
 *   PUT    /datasets/{id}/file?name= If-Match  the file as the body -> definition, ETag (413 too large, 415 not CSV)
 */

const BASE = `${PLUGIN_ROOT}/data-access/api/v2/datasets`;

export const COLUMN_TYPES = ['STRING', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'TIMESTAMP'] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];
export type SourceType = 'FILE' | 'SQL' | 'TABLES';

export interface FileSource {
  format?: 'CSV';
  path: string;
  /** The uploaded file's name on the uploader's computer; set by the server. */
  originalName?: string;
  encoding?: string;
  delimiter?: string;
  enclosure?: string;
  headerRow?: boolean;
  stagingTable?: string;
}

export interface Source {
  type: SourceType;
  connection?: string;
  tables?: string[];
  sql?: string;
  file?: FileSource;
}

export interface Column {
  name: string;
  table?: string;
  sourceName?: string;
  type: ColumnType;
  label?: string;
  description?: string;
  format?: string;
  hidden?: boolean;
}

/** A dataset definition. Fields this console doesn't edit (model, security, refresh…) are kept as they are. */
export interface Definition {
  schemaVersion?: number;
  id?: string;
  name: string;
  description?: string;
  owner?: string;
  source?: Source;
  columns?: Column[];
  [other: string]: unknown;
}

export interface Stored {
  definition: Definition;
  /** The ETag; sent back as If-Match on every change. */
  version: string;
}

export interface DatasetSummary {
  id: string;
  name: string;
  description?: string;
  owner?: string;
  sourceType?: SourceType;
  version: string;
  updated: string;
}

export interface SourceColumn {
  name: string;
  type: ColumnType;
  sourceType?: string;
  nullable?: boolean;
  table?: string;
}

export interface Sample {
  columns: SourceColumn[];
  rows: Array<Array<string | number | boolean | null>>;
  truncated: boolean;
}

export interface StagedTable {
  connection: string;
  table: string;
  rows: number;
  columns: Array<{ sourceName: string; name: string; type: ColumnType; sqlType: string }>;
  warnings: string[];
}

export interface ConnectionTable {
  schema?: string;
  name: string;
  /** TABLE or VIEW. */
  type: string;
  /** What a TABLES source lists: "schema.name", or "name" without a schema. */
  qualifiedName: string;
}

export interface TableList {
  tables: ConnectionTable[];
  truncated: boolean;
}

export interface StagingSettings {
  connection?: string;
  schema?: string;
}

/** Where uploaded files are loaded: in effect, as saved, and the server's settings.xml defaults. */
export interface StagingState extends StagingSettings {
  saved: StagingSettings;
  defaults: StagingSettings;
}

export interface LoadJob {
  id: string;
  state: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  rowsRead: number;
  rowsLoaded: number;
  table?: StagedTable;
  /** When it succeeded: the dataset's new version. */
  version?: string;
  error?: { code: string; message: string; path?: string };
}

export interface Problem {
  path: string;
  message: string;
}

/** An error the datasets API explained: its code, the field at fault and every problem found. */
export class DatasetError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly path?: string,
    readonly problems: Problem[] = [],
  ) {
    super(message);
    this.name = 'DatasetError';
  }
}

const columnType = z.enum(COLUMN_TYPES);
const summarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  owner: z.string().optional(),
  sourceType: z.enum(['FILE', 'SQL', 'TABLES']).optional(),
  version: z.string(),
  updated: z.string(),
});
const listSchema = z.object({ datasets: z.array(summarySchema) });
const definitionSchema = z.looseObject({ name: z.string() }) as unknown as z.ZodType<Definition>;
const sampleSchema = z.object({
  columns: z.array(
    z.object({ name: z.string(), type: columnType, sourceType: z.string().optional(), nullable: z.boolean().optional(), table: z.string().optional() }),
  ),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  truncated: z.boolean(),
});
const stagedSchema = z.object({
  connection: z.string(),
  table: z.string(),
  rows: z.number(),
  columns: z.array(z.object({ sourceName: z.string(), name: z.string(), type: columnType, sqlType: z.string() })),
  warnings: z.array(z.string()),
});
/** An optional string the server may send as null: read as absent. */
const optionalString = z
  .string()
  .nullish()
  .transform((v) => v ?? undefined);
const tableListSchema = z.object({
  tables: z.array(z.object({ schema: optionalString, name: z.string(), type: z.string(), qualifiedName: z.string() })),
  truncated: z.boolean(),
});
const stagingSettingsSchema = z.object({ connection: optionalString, schema: optionalString });
const stagingStateSchema = stagingSettingsSchema.extend({ saved: stagingSettingsSchema, defaults: stagingSettingsSchema });
const loadJobSchema = z.object({
  id: z.string(),
  state: z.enum(['RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED']),
  rowsRead: z.number(),
  rowsLoaded: z.number(),
  table: stagedSchema.optional(),
  version: z.string().optional(),
  error: z.object({ code: z.string(), message: z.string(), path: z.string().optional() }).optional(),
});
const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  path: z.string().optional(),
  problems: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

const enc = encodeURIComponent;
/** `"3"` or `W/"3"` -> `3`. */
const versionOf = (response: Response) => (response.headers.get('ETag') ?? '').replace(/^W\//, '').replace(/^"|"$/g, '');
const ifMatch = (version: string) => `"${version}"`;

/** The response's JSON, or a DatasetError built from its error body. */
async function read<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const type = response.headers.get('Content-Type') ?? '';
  const body: unknown = type.includes('json') ? await response.json().catch(() => null) : null;
  if (!response.ok) {
    const error = errorSchema.safeParse(body);
    if (error.success) {
      throw new DatasetError(response.status, error.data.code, error.data.message, error.data.path, error.data.problems ?? []);
    }
    throw new ApiError(response.status, response.url, `${response.status} ${response.statusText}`.trim());
  }
  return schema.parse(body);
}

export interface DatasetSource {
  list(signal?: AbortSignal): Promise<DatasetSummary[]>;
  get(id: string, signal?: AbortSignal): Promise<Stored>;
  create(definition: Definition): Promise<Stored>;
  update(id: string, definition: Definition, version: string): Promise<Stored>;
  remove(id: string, version: string): Promise<void>;
  sample(id: string, limit?: number): Promise<Sample>;
  /** Loads a FILE dataset's file into its staging table; the dataset's version changes. */
  stage(id: string, version: string): Promise<{ table: StagedTable; version: string }>;
  /** Starts loading a FILE dataset's file in the background. */
  startLoad(id: string, version: string): Promise<LoadJob>;
  /** The dataset's running or last background load. */
  loadStatus(id: string): Promise<LoadJob>;
  /** Asks the running background load to stop. */
  cancelLoad(id: string): Promise<LoadJob>;
  /** Uploads the dataset's CSV file; the server records it in `source.file` and the version changes. */
  uploadFile(id: string, version: string, file: File): Promise<Stored>;
  /** Database connection names, for SQL and TABLES sources. */
  connections(signal?: AbortSignal): Promise<string[]>;
  /** The tables and views on a connection, for a TABLES source. */
  tables(connection: string, signal?: AbortSignal): Promise<TableList>;
  /** Where uploaded files are loaded. */
  staging(signal?: AbortSignal): Promise<StagingState>;
  /** Administrators: change where uploaded files are loaded; empty values go back to the server's defaults. */
  setStaging(settings: StagingSettings): Promise<StagingState>;
}

export const httpDatasetSource: DatasetSource = {
  async list(signal) {
    return (await getJson(BASE, listSchema, signal)).datasets;
  },
  async get(id, signal) {
    const response = await getResponse(`${BASE}/${enc(id)}`, signal);
    return { definition: await read(response, definitionSchema), version: versionOf(response) };
  },
  async create(definition) {
    const response = await send('POST', BASE, { body: JSON.stringify(definition), contentType: 'application/json', accept: 'application/json' });
    return { definition: await read(response, definitionSchema), version: versionOf(response) };
  },
  async update(id, definition, version) {
    const response = await send('PUT', `${BASE}/${enc(id)}`, {
      body: JSON.stringify(definition),
      contentType: 'application/json',
      accept: 'application/json',
      headers: { 'If-Match': ifMatch(version) },
    });
    return { definition: await read(response, definitionSchema), version: versionOf(response) };
  },
  async remove(id, version) {
    const response = await send('DELETE', `${BASE}/${enc(id)}`, { accept: 'application/json', headers: { 'If-Match': ifMatch(version) } });
    if (!response.ok) await read(response, z.unknown());
  },
  async sample(id, limit = 100) {
    const response = await send('POST', `${BASE}/${enc(id)}/sample?limit=${limit}`, { accept: 'application/json' });
    return read(response, sampleSchema);
  },
  async stage(id, version) {
    const response = await send('POST', `${BASE}/${enc(id)}/stage`, { accept: 'application/json', headers: { 'If-Match': ifMatch(version) } });
    return { table: await read(response, stagedSchema), version: versionOf(response) };
  },
  async startLoad(id, version) {
    const response = await send('POST', `${BASE}/${enc(id)}/stage?async=true`, { accept: 'application/json', headers: { 'If-Match': ifMatch(version) } });
    return read(response, loadJobSchema);
  },
  async loadStatus(id) {
    return read(await getResponse(`${BASE}/${enc(id)}/stage`), loadJobSchema);
  },
  async cancelLoad(id) {
    return read(await send('DELETE', `${BASE}/${enc(id)}/stage`, { accept: 'application/json' }), loadJobSchema);
  },
  async uploadFile(id, version, file) {
    const response = await send('PUT', `${BASE}/${enc(id)}/file?name=${enc(file.name)}`, {
      body: file,
      contentType: file.type || 'text/csv',
      accept: 'application/json',
      headers: { 'If-Match': ifMatch(version) },
    });
    return { definition: await read(response, definitionSchema), version: versionOf(response) };
  },
  async connections(signal) {
    const items = z.object({
      Item: z
        .union([z.string(), z.array(z.string())])
        .nullish()
        .transform((v) => (v == null ? [] : Array.isArray(v) ? v : [v])),
    });
    return (await getJson(`${PLUGIN_ROOT}/data-access/api/datasource/jdbc/connection`, items, signal)).Item.sort((a, b) => a.localeCompare(b));
  },
  async staging(signal) {
    return read(await getResponse(`${PLUGIN_ROOT}/data-access/api/v2/settings/staging`, signal), stagingStateSchema);
  },
  async setStaging(settings) {
    const response = await send('PUT', `${PLUGIN_ROOT}/data-access/api/v2/settings/staging`, {
      body: JSON.stringify(settings),
      contentType: 'application/json',
      accept: 'application/json',
    });
    return read(response, stagingStateSchema);
  },
  async tables(connection, signal) {
    return read(await getResponse(`${PLUGIN_ROOT}/data-access/api/v2/connections/${enc(connection)}/tables`, signal), tableListSchema);
  },
};

const Context = createContext<DatasetSource>(httpDatasetSource);

export function DatasetSourceProvider({ source, children }: { source: DatasetSource; children: ReactNode }) {
  return createElement(Context.Provider, { value: source }, children);
}

export const datasetKeys = {
  all: ['datasets'] as const,
  one: (id: string) => ['datasets', 'one', id] as const,
  connections: ['datasets', 'connections'] as const,
  tables: (connection: string) => ['datasets', 'tables', connection] as const,
  staging: ['datasets', 'staging'] as const,
};

export function useDatasetSource() {
  return useContext(Context);
}

export function useDatasets() {
  const source = useContext(Context);
  return useQuery({ queryKey: datasetKeys.all, queryFn: ({ signal }) => source.list(signal) });
}

export function useDataset(id: string | undefined) {
  const source = useContext(Context);
  return useQuery({ queryKey: datasetKeys.one(id ?? ''), queryFn: ({ signal }) => source.get(id!, signal), enabled: !!id, staleTime: 0 });
}

export function useConnectionNames(enabled = true) {
  const source = useContext(Context);
  return useQuery({ queryKey: datasetKeys.connections, queryFn: ({ signal }) => source.connections(signal), enabled });
}

export function useConnectionTables(connection: string, enabled = true) {
  const source = useContext(Context);
  return useQuery({
    queryKey: datasetKeys.tables(connection),
    queryFn: ({ signal }) => source.tables(connection, signal),
    enabled: enabled && !!connection,
    retry: false,
  });
}

/** The API's explanation of an error, for display. */
export function describeError(error: unknown): string {
  if (error instanceof DatasetError) {
    const first = error.problems[0];
    return first && error.problems.length > 1 ? `${error.message} (+${error.problems.length - 1})` : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
