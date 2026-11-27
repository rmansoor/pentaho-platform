import { DatasetError, type Definition, type DatasetSource, type DatasetSummary, type Sample, type Stored } from '../datasets';

/** Rows the fixture's sources return when sampled. */
const ORDERS: Sample = {
  columns: [
    { name: 'ORDERNUMBER', type: 'INTEGER', sourceType: 'INTEGER', nullable: false, table: 'ORDERS' },
    { name: 'ORDERDATE', type: 'DATE', sourceType: 'DATE', nullable: true, table: 'ORDERS' },
    { name: 'STATUS', type: 'STRING', sourceType: 'VARCHAR', nullable: true, table: 'ORDERS' },
    { name: 'AMOUNT', type: 'DECIMAL', sourceType: 'DECIMAL', nullable: true, table: 'ORDERS' },
  ],
  rows: [
    [10100, '2026-01-06', 'Shipped', 10223.83],
    [10101, '2026-01-09', 'Shipped', 10549.01],
    [10102, '2026-01-10', 'On Hold', 5494.78],
  ],
  truncated: true,
};

const FILE_SAMPLE: Sample = {
  columns: [
    { name: 'region', type: 'STRING', sourceType: undefined },
    { name: 'month', type: 'DATE', sourceType: 'MM/dd/yyyy' },
    { name: 'units', type: 'INTEGER', sourceType: '#' },
    { name: 'revenue', type: 'DECIMAL', sourceType: '#.#' },
  ],
  rows: [
    ['EMEA', '2026-01-01', 120, 4410.5],
    ['NA', '2026-01-01', 98, 3920.25],
  ],
  truncated: false,
};

const SAMPLE_DATASETS: Definition[] = [
  {
    schemaVersion: 1,
    id: 'orders',
    name: 'Orders',
    description: 'Steel Wheels orders',
    owner: 'admin',
    source: { type: 'TABLES', connection: 'SampleData', tables: ['ORDERS'] },
    columns: [{ name: 'ORDERNUMBER', table: 'ORDERS', type: 'INTEGER' }],
  },
  {
    schemaVersion: 1,
    id: 'regional-sales',
    name: 'Regional sales',
    owner: 'suzy',
    source: { type: 'FILE', connection: 'Hibernate', file: { format: 'CSV', path: 'regional-sales-a1b2c3.csv', headerRow: true, stagingTable: 'DS_REGIONAL_SALES_MOKX3K2O' } },
    columns: [],
  },
];

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'dataset';

export type FixtureDatasetSource = DatasetSource & {
  /** Every call, in order: "create orders", "stage orders"… */
  calls: string[];
  /** The stored definitions, by id. */
  stored: Map<string, Stored & { updated: string }>;
  /** When set, the next sample fails with this error. */
  failNextSample?: DatasetError;
};

export function createFixtureDatasetSource(initial: Definition[] = SAMPLE_DATASETS, { delayMs = 0 } = {}): FixtureDatasetSource {
  const stored = new Map<string, Stored & { updated: string }>();
  let clock = 0;
  const wait = () => (delayMs ? new Promise((r) => setTimeout(r, delayMs)) : Promise.resolve());
  const put = (definition: Definition) => {
    const entry = { definition: structuredClone(definition), version: String(++clock), updated: new Date(Date.UTC(2026, 10, 20, 9, clock)).toISOString() };
    stored.set(definition.id!, entry);
    return { definition: structuredClone(entry.definition), version: entry.version };
  };
  initial.forEach(put);
  const find = (id: string) => {
    const s = stored.get(id);
    if (!s) throw new DatasetError(404, 'not-found', `No dataset with id "${id}"`);
    return s;
  };
  const check = (id: string, version: string) => {
    if (find(id).version !== version) throw new DatasetError(412, 'stale-version', 'The dataset changed since it was read');
  };

  const source: FixtureDatasetSource = {
    calls: [],
    stored,
    async list() {
      await wait();
      return [...stored.values()]
        .map(
          (s): DatasetSummary => ({
            id: s.definition.id!,
            name: s.definition.name,
            description: s.definition.description,
            owner: s.definition.owner,
            sourceType: s.definition.source?.type,
            version: s.version,
            updated: s.updated,
          }),
        )
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async get(id) {
      await wait();
      const s = find(id);
      return { definition: structuredClone(s.definition), version: s.version };
    },
    async create(definition) {
      await wait();
      if (!definition.name?.trim()) throw new DatasetError(400, 'invalid-definition', 'A dataset needs a name', 'name');
      let id = definition.id ?? slug(definition.name);
      for (let n = 2; stored.has(id); n++) id = `${slug(definition.name)}-${n}`;
      source.calls.push(`create ${id}`);
      return put({ schemaVersion: 1, owner: 'admin', ...definition, id });
    },
    async update(id, definition, version) {
      await wait();
      check(id, version);
      source.calls.push(`update ${id}`);
      return put({ ...definition, id });
    },
    async remove(id, version) {
      await wait();
      check(id, version);
      source.calls.push(`delete ${id}`);
      stored.delete(id);
    },
    async sample(id) {
      await wait();
      const d = find(id).definition;
      source.calls.push(`sample ${id}`);
      if (source.failNextSample) {
        const e = source.failNextSample;
        source.failNextSample = undefined;
        throw e;
      }
      return structuredClone(d.source?.type === 'FILE' ? FILE_SAMPLE : ORDERS);
    },
    async stage(id, version) {
      await wait();
      check(id, version);
      const d = structuredClone(find(id).definition);
      if (d.source?.type !== 'FILE' || !d.source.file) throw new DatasetError(400, 'invalid-request', 'Only FILE sources are loaded into staging tables', 'source.type');
      source.calls.push(`stage ${id}`);
      const table = `DS_${id.toUpperCase().replace(/-/g, '_')}_${clock.toString(36).toUpperCase()}`;
      d.source.connection = 'Hibernate';
      d.source.file.stagingTable = table;
      const { version: next } = put(d);
      return {
        version: next,
        table: {
          connection: 'Hibernate',
          table,
          rows: 2,
          columns: FILE_SAMPLE.columns.map((c) => ({ sourceName: c.name, name: c.name.toUpperCase(), type: c.type, sqlType: c.type === 'STRING' ? 'VARCHAR(4)' : c.type })),
          warnings: [],
        },
      };
    },
    async upload(file) {
      await wait();
      source.calls.push(`upload ${file.name}`);
      return `${slug(file.name.replace(/\.[^.]+$/, ''))}-fixture.csv`;
    },
    async connections() {
      return ['AgileBI', 'SampleData'];
    },
    async tables(connection) {
      await wait();
      if (connection !== 'SampleData') throw new DatasetError(422, 'source-failed', `The database refused the request: connection "${connection}" is down`);
      const t = (name: string, type = 'TABLE') => ({ schema: 'PUBLIC', name, type, qualifiedName: name });
      return { tables: [t('CUSTOMERS'), t('EMPLOYEES'), t('ORDERDETAILS'), t('ORDERS'), t('PRODUCTS'), t('BIG_ORDERS', 'VIEW')], truncated: false };
    },
  };
  return source;
}
