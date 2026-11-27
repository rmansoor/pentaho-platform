import { describe, expect, it } from 'vitest';
import { columnRowsFrom, columnsFrom, definitionFrom, emptyForm, formFrom, problems } from './dataset-form';
import type { Definition, Sample } from '../../api/datasets';

const sample: Sample = {
  columns: [
    { name: 'ID', type: 'INTEGER', table: 'ORDERS' },
    { name: 'AMOUNT', type: 'DECIMAL', table: 'ORDERS' },
    { name: 'NOTE', type: 'STRING', table: 'ORDERS' },
  ],
  rows: [],
  truncated: false,
};

describe('dataset form', () => {
  it('says what each kind of source still needs', () => {
    expect(problems(emptyForm(), false)).toEqual({ name: 'datasets.editor.problems.name', file: 'datasets.editor.problems.file' });
    expect(problems({ ...emptyForm(), name: 'x' }, true)).toEqual({});
    expect(problems({ ...emptyForm(), name: 'x', sourceType: 'SQL', sql: ' ' }, false)).toEqual({
      connection: 'datasets.editor.problems.connection',
      sql: 'datasets.editor.problems.sql',
    });
    expect(problems({ ...emptyForm(), name: 'x', sourceType: 'TABLES', connection: 'c', tables: ' , ' }, false)).toEqual({
      tables: 'datasets.editor.problems.tables',
    });
  });

  it('builds the source and keeps what this console does not edit', () => {
    const base: Definition = {
      schemaVersion: 1,
      id: 'orders',
      name: 'Old',
      description: 'gone',
      owner: 'suzy',
      model: { measures: [{ name: 'Revenue' }] },
      source: { type: 'FILE', connection: 'Hibernate', file: { path: 'a.csv', stagingTable: 'DS_A_1' } },
    };
    const sql = definitionFrom({ ...emptyForm(), name: ' Orders ', sourceType: 'SQL', connection: 'SampleData', sql: ' SELECT 1 ' }, base);
    expect(sql).toMatchObject({ id: 'orders', owner: 'suzy', name: 'Orders', model: { measures: [{ name: 'Revenue' }] } });
    expect(sql.description).toBeUndefined();
    expect(sql.source).toEqual({ type: 'SQL', connection: 'SampleData', sql: 'SELECT 1' });

    const tables = definitionFrom({ ...emptyForm(), name: 'T', sourceType: 'TABLES', connection: 'c', tables: 'a, sales.b ,' });
    expect(tables.source).toEqual({ type: 'TABLES', connection: 'c', tables: ['a', 'sales.b'] });
  });

  it('keeps a file’s staging table only while it is the same file', () => {
    const base: Definition = { name: 'A', source: { type: 'FILE', connection: 'Hibernate', file: { path: 'a.csv', stagingTable: 'DS_A_1' } } };
    const form = { ...formFrom(base), delimiter: ';' };
    expect(definitionFrom(form, base).source).toEqual({
      type: 'FILE',
      connection: 'Hibernate',
      file: { format: 'CSV', path: 'a.csv', headerRow: true, delimiter: ';', stagingTable: 'DS_A_1' },
    });
    expect(definitionFrom({ ...form, filePath: 'b.csv' }, base).source).toEqual({
      type: 'FILE',
      file: { format: 'CSV', path: 'b.csv', headerRow: true, delimiter: ';' },
    });
  });

  it('reads an existing definition back into the form', () => {
    expect(formFrom({ name: 'Q', source: { type: 'TABLES', connection: 'c', tables: ['a', 'b'] } })).toMatchObject({
      sourceType: 'TABLES',
      connection: 'c',
      tables: 'a, b',
    });
  });

  it('keeps every column of a new source, and earlier choices for a source seen before', () => {
    expect(columnRowsFrom(sample).every((r) => r.keep)).toBe(true);

    const rows = columnRowsFrom(sample, [{ name: 'ID', table: 'ORDERS', sourceName: 'ID', type: 'STRING', label: 'Order' }]);
    expect(rows.map((r) => [r.sourceName, r.keep, r.type, r.label])).toEqual([
      ['ID', true, 'STRING', 'Order'],
      ['AMOUNT', false, 'DECIMAL', ''],
      ['NOTE', false, 'STRING', ''],
    ]);
    expect(columnsFrom(rows)).toEqual([{ name: 'ID', table: 'ORDERS', sourceName: 'ID', type: 'STRING', label: 'Order' }]);
  });
});
