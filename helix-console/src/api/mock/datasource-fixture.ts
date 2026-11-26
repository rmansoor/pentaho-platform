import { connectionFormFrom, type DataSource, type DataSourceSource } from '../datasources';

/** The sample install's data sources (matches a fresh Pentaho Server 11.1). */
const SAMPLE: DataSource[] = [
  { kind: 'jdbc', id: 'AgileBI', detail: 'MonetDB · localhost:50006/pentaho-instaview' },
  { kind: 'jdbc', id: 'SampleData', detail: 'Hypersonic · localhost:9001/SampleData (JNDI)' },
  { kind: 'analysis', id: 'SampleData', downloadUrl: '#SampleData.mondrian.xml' },
  { kind: 'analysis', id: 'SteelWheels', downloadUrl: '#SteelWheels.mondrian.xml' },
  { kind: 'metadata', id: 'steel-wheels.xmi', downloadUrl: '#steel-wheels.xmi' },
];

export function createFixtureDataSourceSource(initial: DataSource[] = SAMPLE): DataSourceSource & { saved: Array<Record<string, unknown>> } {
  const items = structuredClone(initial);
  const connections = new Map<string, Record<string, unknown>>([
    ['SampleData', { name: 'SampleData', databaseType: { name: 'Hypersonic', shortName: 'HYPERSONIC' }, accessType: 'JNDI', databaseName: 'SampleData', password: null, attributes: { keep: 'me' } }],
  ]);
  const saved: Array<Record<string, unknown>> = [];
  return {
    saved,
    async databaseTypes() {
      return [
        { name: 'Generic database', shortName: 'GENERIC', accessTypes: ['NATIVE', 'JNDI'] },
        { name: 'Hypersonic', shortName: 'HYPERSONIC', accessTypes: ['NATIVE', 'JNDI'], defaultPort: 9001 },
        { name: 'PostgreSQL', shortName: 'POSTGRESQL', accessTypes: ['NATIVE', 'JNDI'], defaultPort: 5432 },
      ];
    },
    async getConnection(name) {
      const c = connections.get(name);
      if (!c) throw new Error(`No connection ${name}`);
      return connectionFormFrom(structuredClone(c));
    },
    // Host "db.example.com" connects; anything else fails.
    async testConnection(body) {
      const c = JSON.parse(body) as Record<string, unknown>;
      return c.hostname === 'db.example.com' || c.accessType === 'JNDI'
        ? { ok: true, message: `Connection to database [ ${String(c.databaseName)} ] succeeded` }
        : { ok: false, message: '' };
    },
    async saveConnection(name, body) {
      const c = JSON.parse(body) as Record<string, unknown>;
      saved.push(c);
      connections.set(name, c);
      if (!items.some((i) => i.kind === 'jdbc' && i.id === name)) items.push({ kind: 'jdbc', id: name, detail: String((c.databaseType as { name: string }).name) });
    },
    async list() {
      return structuredClone(items);
    },
    async remove(source) {
      const index = items.findIndex((i) => i.kind === source.kind && i.id === source.id);
      if (index < 0) throw new Error('Nothing was removed');
      items.splice(index, 1);
    },
  };
}
