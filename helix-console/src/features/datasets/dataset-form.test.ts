import { describe, expect, it } from 'vitest';
import {
  columnRowsFrom,
  columnsFrom,
  definitionFrom,
  emptyForm,
  formFrom,
  keepKeptColumns,
  modelFormFrom,
  modelFrom,
  modelProblems,
  problems,
  suggestModel,
  type ColumnRow,
} from './dataset-form';
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
      model: { dimensions: [], measures: [{ name: 'Revenue', column: 'revenue' }] },
      source: { type: 'FILE', connection: 'Hibernate', file: { path: 'a.csv', stagingTable: 'DS_A_1' } },
    };
    const sql = definitionFrom({ ...emptyForm(), name: ' Orders ', sourceType: 'SQL', connection: 'SampleData', sql: ' SELECT 1 ' }, base);
    expect(sql).toMatchObject({ id: 'orders', owner: 'suzy', name: 'Orders', model: { dimensions: [], measures: [{ name: 'Revenue', column: 'revenue' }] } });
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

  describe('the model', () => {
    const row = (name: string, type: ColumnRow['type'], keep = true, label = ''): ColumnRow => ({ name, sourceName: name, type, label, keep });
    const rows = [row('region', 'STRING'), row('units', 'INTEGER'), row('revenue', 'DECIMAL', true, 'Revenue'), row('note', 'STRING', false)];

    it('suggests what the server’s modeler does: kept columns as dimensions, numbers also summed', () => {
      expect(suggestModel(rows)).toEqual({
        dimensions: [
          { name: 'region', levels: ['region'], time: false },
          { name: 'units', levels: ['units'], time: false },
          { name: 'Revenue', levels: ['revenue'], time: false },
        ],
        measures: [
          { name: 'units', column: 'units', aggregation: 'SUM', format: '' },
          { name: 'Revenue', column: 'revenue', aggregation: 'SUM', format: '' },
        ],
      });
    });

    it('edits a stored model, or starts from the suggestion when there is none', () => {
      expect(modelFormFrom(undefined, rows)).toEqual(suggestModel(rows));
      expect(modelFormFrom({ dimensions: [], measures: [] }, rows)).toEqual(suggestModel(rows));
      const stored = { dimensions: [{ name: 'Where', levels: ['region'], time: true }], measures: [{ name: 'Avg', column: 'revenue', aggregation: 'AVERAGE' as const, format: '0.0' }] };
      expect(modelFormFrom(stored, rows)).toEqual({
        dimensions: [{ name: 'Where', levels: ['region'], time: true }],
        measures: [{ name: 'Avg', column: 'revenue', aggregation: 'AVERAGE', format: '0.0' }],
      });
      expect(modelFrom(modelFormFrom(stored, rows))).toEqual(stored);
    });

    it('drops what names a column that is no longer kept', () => {
      const model = {
        dimensions: [
          { name: 'Where', levels: ['region', 'note'], time: false },
          { name: 'Notes', levels: ['note'], time: false },
          { name: 'New', levels: [''], time: false },
        ],
        measures: [
          { name: 'N', column: 'note', aggregation: 'COUNT' as const, format: '' },
          { name: 'U', column: 'units', aggregation: 'SUM' as const, format: '' },
        ],
      };
      expect(keepKeptColumns(model, rows)).toEqual({
        dimensions: [
          { name: 'Where', levels: ['region'], time: false },
          { name: 'New', levels: [''], time: false },
        ],
        measures: [{ name: 'U', column: 'units', aggregation: 'SUM', format: '' }],
      });
    });

    it('wants names, unique ones, levels, and numbers for sums and averages', () => {
      expect(modelProblems(suggestModel(rows), rows)).toEqual({});
      expect(
        modelProblems(
          {
            dimensions: [
              { name: ' ', levels: ['region'], time: false },
              { name: 'Region', levels: [''], time: false },
              { name: 'region ', levels: ['units'], time: false },
            ],
            measures: [
              { name: 'Count', column: 'region', aggregation: 'COUNT', format: '' },
              { name: 'Sum', column: 'region', aggregation: 'SUM', format: '' },
              { name: 'count', column: '', aggregation: 'SUM', format: '' },
            ],
          },
          rows,
        ),
      ).toEqual({
        'dimensions.0.name': 'datasets.editor.problems.modelName',
        'dimensions.1.levels': 'datasets.editor.problems.levels',
        'dimensions.2.name': 'datasets.editor.problems.duplicateName',
        'measures.1.column': 'datasets.editor.problems.numericAggregation',
        'measures.2.name': 'datasets.editor.problems.duplicateName',
        'measures.2.column': 'datasets.editor.problems.measureColumn',
      });
    });

    it('stores the model with the definition, and keeps a stored one when none is given', () => {
      const model = modelFrom(suggestModel(rows));
      expect(definitionFrom(emptyForm(), undefined, [], model).model).toEqual(model);
      expect(definitionFrom(emptyForm(), { name: 'A', model }).model).toEqual(model);
      expect(definitionFrom(emptyForm(), { name: 'A' })).not.toHaveProperty('model');
    });
  });
});
