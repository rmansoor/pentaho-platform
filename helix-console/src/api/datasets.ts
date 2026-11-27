import { createContext, createElement, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, CONTEXT_ROOT, getJson, getResponse, PLUGIN_ROOT, send } from './http';
import { t } from '../i18n';

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
 *   GET    /connections/{name}/tables     -> {tables: [{schema?, name, type, qualifiedName}], truncated}
 * Errors are {code, message, path?, problems?: [{path, message}]}.
 * Files are uploaded first through the platform's UploadService, which answers with the stored name.
 */

const BASE = `${PLUGIN_ROOT}/data-access/api/v2/datasets`;
const UPLOAD = `${CONTEXT_ROOT}/UploadService`;

export const COLUMN_TYPES = ['STRING', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'TIMESTAMP'] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];
export type SourceType = 'FILE' | 'SQL' | 'TABLES';

export interface FileSource {
  format?: 'CSV';
  path: string;
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
const tableListSchema = z.object({
  tables: z.array(z.object({ schema: z.string().optional(), name: z.string(), type: z.string(), qualifiedName: z.string() })),
  truncated: z.boolean(),
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
  /** Uploads a file for a FILE source; resolves with the name to put in `source.file.path`. */
  upload(file: File): Promise<string>;
  /** Database connection names, for SQL and TABLES sources. */
  connections(signal?: AbortSignal): Promise<string[]>;
  /** The tables and views on a connection, for a TABLES source. */
  tables(connection: string, signal?: AbortSignal): Promise<TableList>;
}

/** "Monthly Orders (2026).csv" -> "monthly-orders-2026-k3j9x2.csv": unique, and safe as a plain file name. */
export function uploadName(file: string, random = Math.random().toString(36).slice(2, 8)): string {
  const plain = file.slice(Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\')) + 1);
  const dot = plain.lastIndexOf('.');
  const ext = dot > 0 ? plain.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) : 'csv';
  const base = (dot > 0 ? plain.slice(0, dot) : plain)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${base || 'upload'}-${random}.${ext || 'csv'}`;
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
  async upload(file) {
    const name = uploadName(file.name);
    const form = new FormData();
    form.append('uploadFormElement', file, file.name);
    // Not temporary: the dataset can be loaded again from the same file later.
    const response = await send('POST', `${UPLOAD}?file_name=${enc(name)}&mark_temporary=false`, { body: form, accept: 'text/plain' });
    const text = (await response.text()).trim();
    // The servlet answers 200 with the stored name on success, and 200 with an error sentence otherwise.
    if (!response.ok || text !== name) throw new Error(text && text.length < 300 ? text : t('datasets.errors.uploadFailed', { status: response.status }));
    return name;
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
