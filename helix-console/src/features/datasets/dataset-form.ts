import type { MessageKey } from '../../i18n';
import type { Aggregation, Column, ColumnType, Definition, Model, Sample, SourceType } from '../../api/datasets';

/** The separators offered for CSV files; '' lets the server detect it. */
export const DELIMITERS = [
  { value: '', label: 'datasets.editor.delimiters.auto' },
  { value: ',', label: 'datasets.editor.delimiters.comma' },
  { value: ';', label: 'datasets.editor.delimiters.semicolon' },
  { value: '\t', label: 'datasets.editor.delimiters.tab' },
  { value: '|', label: 'datasets.editor.delimiters.pipe' },
] as const satisfies ReadonlyArray<{ value: string; label: MessageKey }>;

export const ENCODINGS = ['', 'UTF-8', 'ISO-8859-1', 'windows-1252', 'UTF-16'] as const;

/** What the source step edits. */
export interface DatasetForm {
  name: string;
  description: string;
  sourceType: SourceType;
  connection: string;
  sql: string;
  /** Comma-separated table names. */
  tables: string;
  /** The uploaded file's stored name, once uploaded or when editing. */
  filePath: string;
  /** The uploaded file's own name, for display. */
  fileName: string;
  headerRow: boolean;
  delimiter: string;
  encoding: string;
}

/** A column as the columns step shows it. */
export interface ColumnRow {
  name: string;
  table?: string;
  sourceName: string;
  type: ColumnType;
  label: string;
  keep: boolean;
}

export const emptyForm = (): DatasetForm => ({
  name: '',
  description: '',
  sourceType: 'FILE',
  connection: '',
  sql: '',
  tables: '',
  filePath: '',
  fileName: '',
  headerRow: true,
  delimiter: '',
  encoding: '',
});

export function formFrom(d: Definition): DatasetForm {
  const s = d.source;
  return {
    ...emptyForm(),
    name: d.name ?? '',
    description: d.description ?? '',
    sourceType: s?.type ?? 'FILE',
    connection: s?.type === 'FILE' ? '' : (s?.connection ?? ''),
    sql: s?.sql ?? '',
    tables: (s?.tables ?? []).join(', '),
    filePath: s?.file?.path ?? '',
    fileName: s?.file?.originalName ?? s?.file?.path ?? '',
    headerRow: s?.file?.headerRow ?? true,
    delimiter: s?.file?.delimiter ?? '',
    encoding: s?.file?.encoding ?? '',
  };
}

export const tableList = (tables: string) =>
  tables
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

export type FormProblems = Partial<Record<'name' | 'file' | 'connection' | 'sql' | 'tables', MessageKey>>;

/** What must be filled in before the source can be previewed. `hasNewFile`: a file is chosen but not uploaded yet. */
export function problems(form: DatasetForm, hasNewFile: boolean): FormProblems {
  const p: FormProblems = {};
  if (!form.name.trim()) p.name = 'datasets.editor.problems.name';
  if (form.sourceType === 'FILE') {
    if (!hasNewFile && !form.filePath) p.file = 'datasets.editor.problems.file';
  } else {
    if (!form.connection) p.connection = 'datasets.editor.problems.connection';
    if (form.sourceType === 'SQL' && !form.sql.trim()) p.sql = 'datasets.editor.problems.sql';
    if (form.sourceType === 'TABLES' && tableList(form.tables).length === 0) p.tables = 'datasets.editor.problems.tables';
  }
  return p;
}

/**
 * The definition to store: `base`'s fields this console doesn't edit (model, security, refresh…)
 * kept, the source rebuilt from the form. A file keeps its staging table while it stays the same file.
 */
export function definitionFrom(form: DatasetForm, base?: Definition, columns?: Column[], model?: Model): Definition {
  const old = base?.source;
  let source: Definition['source'];
  if (form.sourceType === 'FILE') {
    const sameFile = old?.type === 'FILE' && old.file?.path === form.filePath;
    source = {
      type: 'FILE',
      ...(sameFile && old?.connection ? { connection: old.connection } : {}),
      file: {
        format: 'CSV',
        path: form.filePath,
        ...(sameFile && old?.file?.originalName ? { originalName: old.file.originalName } : {}),
        headerRow: form.headerRow,
        ...(form.delimiter ? { delimiter: form.delimiter } : {}),
        ...(form.encoding ? { encoding: form.encoding } : {}),
        ...(sameFile && old?.file?.stagingTable ? { stagingTable: old.file.stagingTable } : {}),
      },
    };
  } else if (form.sourceType === 'SQL') {
    source = { type: 'SQL', connection: form.connection, sql: form.sql.trim() };
  } else {
    source = { type: 'TABLES', connection: form.connection, tables: tableList(form.tables) };
  }
  const description = form.description.trim();
  const { description: _old, ...rest } = base ?? { name: '' };
  return {
    ...rest,
    schemaVersion: base?.schemaVersion ?? 1,
    name: form.name.trim(),
    ...(description ? { description } : {}),
    source,
    columns: columns ?? base?.columns ?? [],
    ...(model ?? base?.model ? { model: model ?? base?.model } : {}),
  };
}

/** The sample's columns, keeping the label, type and choice already made for a column of the same name. */
export function columnRowsFrom(sample: Sample, existing: Column[] = []): ColumnRow[] {
  const known = new Map(existing.map((c) => [`${c.table ?? ''}\u0000${c.sourceName ?? c.name}`, c]));
  const keepAll = existing.length === 0;
  return sample.columns.map((c) => {
    const before = known.get(`${c.table ?? ''}\u0000${c.name}`);
    return {
      name: before?.name ?? c.name,
      ...(c.table ? { table: c.table } : {}),
      sourceName: c.name,
      type: before?.type ?? c.type,
      label: before?.label ?? '',
      keep: keepAll || !!before,
    };
  });
}

/** The kept columns, as the definition stores them. */
export function columnsFrom(rows: ColumnRow[]): Column[] {
  return rows
    .filter((r) => r.keep)
    .map((r) => ({
      name: r.name,
      ...(r.table ? { table: r.table } : {}),
      sourceName: r.sourceName,
      type: r.type,
      ...(r.label.trim() ? { label: r.label.trim() } : {}),
    }));
}

// ------------------------------------------------------------------------------------------------
// The model: what analysis tools slice by (dimensions) and total (measures).

export interface DimensionRow {
  name: string;
  /** Column names, top level first. */
  levels: string[];
  time: boolean;
}

export interface MeasureRow {
  name: string;
  column: string;
  aggregation: Aggregation;
  format: string;
}

export interface ModelForm {
  dimensions: DimensionRow[];
  measures: MeasureRow[];
}

export const isNumeric = (type: ColumnType) => type === 'INTEGER' || type === 'DECIMAL';
/** A column as people see it: its label, else its name. */
export const columnLabel = (r: ColumnRow) => r.label.trim() || r.name;

/** What the server's modeler suggests, as the Data Source Wizard did: every kept column a dimension, numeric ones also summed. */
export function suggestModel(rows: ColumnRow[]): ModelForm {
  const kept = rows.filter((r) => r.keep);
  return {
    dimensions: kept.map((r) => ({ name: columnLabel(r), levels: [r.name], time: false })),
    measures: kept.filter((r) => isNumeric(r.type)).map((r) => ({ name: columnLabel(r), column: r.name, aggregation: 'SUM', format: '' })),
  };
}

/** The stored model, for editing; the suggestion when there is none yet. */
export function modelFormFrom(model: Model | undefined, rows: ColumnRow[]): ModelForm {
  if (!model || (model.dimensions.length === 0 && model.measures.length === 0)) return suggestModel(rows);
  return keepKeptColumns(
    {
      dimensions: model.dimensions.map((d) => ({ name: d.name, levels: [...d.levels], time: !!d.time })),
      measures: model.measures.map((m) => ({ name: m.name, column: m.column, aggregation: m.aggregation ?? 'SUM', format: m.format ?? '' })),
    },
    rows,
  );
}

/** The model without what names a column that is no longer kept (a dimension left with no level goes too). */
export function keepKeptColumns(model: ModelForm, rows: ColumnRow[]): ModelForm {
  const kept = new Set(rows.filter((r) => r.keep).map((r) => r.name));
  return {
    dimensions: model.dimensions.flatMap((d) => {
      const levels = d.levels.filter((l) => !l || kept.has(l));
      // Gone only when every column it named is gone; one still being filled in stays.
      return d.levels.some(Boolean) && !levels.some(Boolean) ? [] : [{ ...d, levels }];
    }),
    measures: model.measures.filter((m) => !m.column || kept.has(m.column)),
  };
}

export type ModelProblems = Partial<Record<string, MessageKey>>;

/**
 * What must be fixed before saving, by field: `dimensions.0.name`, `dimensions.0.levels`,
 * `measures.1.column`… Names are required and unique among dimensions and among measures.
 */
export function modelProblems(model: ModelForm, rows: ColumnRow[]): ModelProblems {
  const p: ModelProblems = {};
  const types = new Map(rows.map((r) => [r.name, r.type]));
  const seen = (names: string[], i: number) => names.slice(0, i).some((n) => n.toLowerCase() === names[i]!.toLowerCase());
  const dims = model.dimensions.map((d) => d.name.trim());
  model.dimensions.forEach((d, i) => {
    if (!dims[i]) p[`dimensions.${i}.name`] = 'datasets.editor.problems.modelName';
    else if (seen(dims, i)) p[`dimensions.${i}.name`] = 'datasets.editor.problems.duplicateName';
    if (!d.levels.some(Boolean)) p[`dimensions.${i}.levels`] = 'datasets.editor.problems.levels';
  });
  const measures = model.measures.map((m) => m.name.trim());
  model.measures.forEach((m, i) => {
    if (!measures[i]) p[`measures.${i}.name`] = 'datasets.editor.problems.modelName';
    else if (seen(measures, i)) p[`measures.${i}.name`] = 'datasets.editor.problems.duplicateName';
    if (!m.column) p[`measures.${i}.column`] = 'datasets.editor.problems.measureColumn';
    else if ((m.aggregation === 'SUM' || m.aggregation === 'AVERAGE') && !isNumeric(types.get(m.column) ?? 'STRING')) {
      p[`measures.${i}.column`] = 'datasets.editor.problems.numericAggregation';
    }
  });
  return p;
}

/** The model as the definition stores it. */
export function modelFrom(form: ModelForm): Model {
  return {
    dimensions: form.dimensions.map((d) => ({ name: d.name.trim(), levels: d.levels.filter(Boolean), ...(d.time ? { time: true } : {}) })),
    measures: form.measures.map((m) => ({
      name: m.name.trim(),
      column: m.column,
      aggregation: m.aggregation,
      ...(m.format.trim() ? { format: m.format.trim() } : {}),
    })),
  };
}
