import type { DataSource, DataSourceSource } from '../datasources';

/** The sample install's data sources (matches a fresh Pentaho Server 11.1). */
const SAMPLE: DataSource[] = [
  { kind: 'jdbc', id: 'AgileBI', detail: 'MonetDB · localhost:50006/pentaho-instaview' },
  { kind: 'jdbc', id: 'SampleData', detail: 'Hypersonic · localhost:9001/SampleData (JNDI)' },
  { kind: 'analysis', id: 'SampleData', downloadUrl: '#SampleData.mondrian.xml' },
  { kind: 'analysis', id: 'SteelWheels', downloadUrl: '#SteelWheels.mondrian.xml' },
  { kind: 'metadata', id: 'steel-wheels.xmi', downloadUrl: '#steel-wheels.xmi' },
];

export function createFixtureDataSourceSource(initial: DataSource[] = SAMPLE): DataSourceSource {
  const items = structuredClone(initial);
  return {
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
