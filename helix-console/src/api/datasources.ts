import { createContext, useContext, type ReactNode, createElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { getJson, PLUGIN_ROOT, send } from './http';

/*
 * Data sources from the data-access plugin (/pentaho/plugin/data-access/api/datasource):
 *   jdbc/connection, analysis/catalog, metadata/domain, dsw/domain -> {"Item": string | string[]}
 *   jdbc/connection/{name} -> connection details (databaseType.name, hostname, port, accessType)
 *   DELETE <list>/{id}; analysis and metadata GET <list>/{id} download the definition.
 * Data source wizard (DSW) models are also listed as metadata domains; they are shown once, as DSW.
 */

const BASE = `${PLUGIN_ROOT}/data-access/api/datasource`;

export type DataSourceKind = 'jdbc' | 'analysis' | 'metadata' | 'dsw';

export const DATA_SOURCE_LABEL: Record<DataSourceKind, string> = {
  jdbc: 'Database connection',
  analysis: 'Analysis',
  metadata: 'Metadata',
  dsw: 'Data source wizard',
};

export interface DataSource {
  kind: DataSourceKind;
  id: string;
  /** Connection type, host and database for JDBC; the file for the others. */
  detail?: string;
  /** Same-origin URL that downloads the definition, where the server offers one. */
  downloadUrl?: string;
}

const itemsSchema = z.object({
  Item: z
    .union([z.string(), z.array(z.string())])
    .nullish()
    .transform((v) => (v == null ? [] : Array.isArray(v) ? v : [v])),
});

const connectionSchema = z.object({
  name: z.string(),
  accessType: z.string().nullish(),
  hostname: z.string().nullish(),
  databasePort: z.union([z.string(), z.number()]).nullish(),
  databaseName: z.string().nullish(),
  databaseType: z.object({ name: z.string().nullish(), shortName: z.string().nullish() }).nullish(),
});

/** "Hypersonic · localhost:9001/SampleData (JNDI)". Exported for tests. */
export function describeConnection(json: unknown): string {
  const c = connectionSchema.parse(json);
  const type = c.databaseType?.name ?? c.databaseType?.shortName ?? 'Database';
  const where = [c.hostname, c.databasePort].filter(Boolean).join(':');
  const target = [where, c.databaseName].filter(Boolean).join('/');
  const access = c.accessType && c.accessType !== 'NATIVE' ? ` (${c.accessType})` : '';
  return target ? `${type} · ${target}${access}` : `${type}${access}`;
}

const enc = encodeURIComponent;
const PATHS: Record<DataSourceKind, string> = {
  jdbc: 'jdbc/connection',
  analysis: 'analysis/catalog',
  metadata: 'metadata/domain',
  dsw: 'dsw/domain',
};

export interface DatabaseType {
  name: string;
  shortName: string;
  accessTypes: string[];
  defaultPort?: number;
}

/** A JDBC connection as edited in the console. `raw` keeps every server field we don't edit. */
export interface ConnectionForm {
  name: string;
  typeShortName: string;
  access: 'NATIVE' | 'JNDI';
  host: string;
  port: string;
  /** Database name, or the JNDI name for JNDI access. */
  database: string;
  username: string;
  /** Blank keeps the saved password when editing. */
  password: string;
  raw: Record<string, unknown>;
}

export function connectionBody(form: ConnectionForm, types: DatabaseType[]): string {
  const type = types.find((t) => t.shortName === form.typeShortName);
  return JSON.stringify({
    attributes: {},
    extraOptions: {},
    connectionPoolingProperties: {},
    ...form.raw,
    name: form.name.trim(),
    databaseType: { ...((form.raw.databaseType as object) ?? {}), name: type?.name ?? form.typeShortName, shortName: form.typeShortName },
    accessType: form.access,
    hostname: form.access === 'JNDI' ? '' : form.host.trim(),
    databasePort: form.access === 'JNDI' ? '' : form.port.trim(),
    databaseName: form.database.trim(),
    username: form.access === 'JNDI' ? '' : form.username,
    password: form.access === 'JNDI' ? '' : form.password,
  });
}

export function connectionFormFrom(raw: Record<string, unknown>): ConnectionForm {
  const type = (raw.databaseType ?? {}) as { shortName?: string };
  return {
    name: String(raw.name ?? ''),
    typeShortName: type.shortName ?? 'GENERIC',
    access: raw.accessType === 'JNDI' ? 'JNDI' : 'NATIVE',
    host: String(raw.hostname ?? ''),
    port: raw.databasePort == null ? '' : String(raw.databasePort),
    database: String(raw.databaseName ?? ''),
    username: String(raw.username ?? ''),
    password: '',
    raw,
  };
}

export interface DataSourceSource {
  list(signal?: AbortSignal): Promise<DataSource[]>;
  remove(source: DataSource): Promise<void>;
  databaseTypes(signal?: AbortSignal): Promise<DatabaseType[]>;
  getConnection(name: string, signal?: AbortSignal): Promise<ConnectionForm>;
  /** Tries the connection on the server; never throws for a failed connection. */
  testConnection(body: string): Promise<{ ok: boolean; message: string }>;
  saveConnection(name: string, body: string): Promise<void>;
}

export const httpDataSourceSource: DataSourceSource = {
  async list(signal) {
    const names = async (kind: DataSourceKind) => (await getJson(`${BASE}/${PATHS[kind]}`, itemsSchema, signal)).Item;
    const [jdbc, analysis, metadata, dsw] = await Promise.all([names('jdbc'), names('analysis'), names('metadata'), names('dsw')]);
    const dswSet = new Set(dsw);
    const connections = await Promise.all(
      jdbc.map(async (id) => {
        let detail: string | undefined;
        try {
          detail = describeConnection(await getJson(`${BASE}/jdbc/connection/${enc(id)}`, z.unknown(), signal));
        } catch {
          detail = undefined;
        }
        return { kind: 'jdbc' as const, id, detail };
      }),
    );
    return [
      ...connections,
      ...analysis.map((id) => ({ kind: 'analysis' as const, id, downloadUrl: `${BASE}/analysis/catalog/${enc(id)}` })),
      ...metadata
        .filter((id) => !dswSet.has(id))
        .map((id) => ({ kind: 'metadata' as const, id, downloadUrl: `${BASE}/metadata/domain/${enc(id)}` })),
      ...dsw.map((id) => ({ kind: 'dsw' as const, id, downloadUrl: `${BASE}/dsw/${enc(id)}/download` })),
    ];
  },
  async databaseTypes(signal) {
    const schema = z.object({
      dbTypes: z
        .union([z.array(z.record(z.string(), z.unknown())), z.record(z.string(), z.unknown())])
        .transform((v) => (Array.isArray(v) ? v : [v])),
    });
    const { dbTypes } = await getJson(`${PLUGIN_ROOT}/data-access/api/dialect/getDatabaseTypes`, schema, signal);
    return dbTypes
      .map((t) => ({
        name: String(t.name),
        shortName: String(t.shortName),
        accessTypes: (Array.isArray(t.supportedAccessTypes) ? t.supportedAccessTypes : [t.supportedAccessTypes]).map(String).filter((a) => a === 'NATIVE' || a === 'JNDI'),
        defaultPort: Number(t.defaultDatabasePort) > 0 ? Number(t.defaultDatabasePort) : undefined,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  async getConnection(name, signal) {
    return connectionFormFrom((await getJson(`${BASE}/jdbc/connection/${enc(name)}`, z.record(z.string(), z.unknown()), signal)) as Record<string, unknown>);
  },
  async testConnection(body) {
    const response = await send('PUT', `${PLUGIN_ROOT}/data-access/api/connection/test`, { body, contentType: 'application/json', accept: 'text/plain' });
    const text = (await response.text()).trim();
    // Success is a sentence; failure is the server's generic HTML error page.
    return response.ok ? { ok: true, message: text || 'Connected.' } : { ok: false, message: '' };
  },
  async saveConnection(name, body) {
    const response = await send('PUT', `${BASE}/jdbc/connection/${enc(name)}`, { body, contentType: 'application/json' });
    if (!response.ok) throw new Error(response.status === 304 ? 'Nothing changed.' : `The connection was not saved (${response.status}).`);
  },
  async remove(source) {
    const response = await send('DELETE', `${BASE}/${PATHS[source.kind]}/${enc(source.id)}`);
    // JDBC answers 304 when nothing was removed.
    if (!response.ok) throw new Error(response.status === 304 ? 'Nothing was removed' : `Delete failed (${response.status})`);
  },
};

const Context = createContext<DataSourceSource>(httpDataSourceSource);

export function DataSourceSourceProvider({ source, children }: { source: DataSourceSource; children: ReactNode }) {
  return createElement(Context.Provider, { value: source }, children);
}

export const dataSourceKeys = { all: ['datasources'] as const, types: ['datasources', 'types'] as const };

export function useDataSourceSource() {
  return useContext(Context);
}

export function useDataSources() {
  const source = useContext(Context);
  return useQuery({ queryKey: dataSourceKeys.all, queryFn: ({ signal }) => source.list(signal) });
}

export function useDatabaseTypes(enabled = true) {
  const source = useContext(Context);
  return useQuery({ queryKey: dataSourceKeys.types, queryFn: ({ signal }) => source.databaseTypes(signal), enabled, staleTime: Infinity });
}
