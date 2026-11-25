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

export interface DataSourceSource {
  list(signal?: AbortSignal): Promise<DataSource[]>;
  remove(source: DataSource): Promise<void>;
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

export const dataSourceKeys = { all: ['datasources'] as const };

export function useDataSourceSource() {
  return useContext(Context);
}

export function useDataSources() {
  const source = useContext(Context);
  return useQuery({ queryKey: dataSourceKeys.all, queryFn: ({ signal }) => source.list(signal) });
}
