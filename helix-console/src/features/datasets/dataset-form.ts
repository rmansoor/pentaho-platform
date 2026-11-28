import type { MessageKey } from '../../i18n';
import type { Aggregation, Column, ColumnType, Definition, Model, Relationship, Sample, SourceType } from '../../api/datasets';

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
export function definitionFrom(form: DatasetForm, base?: Definition, columns?: Column[], model?: Model, relationships?: Relationship[]): Definition {
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
    // Joins only mean something between several tables.
    relationships: form.sourceType === 'TABLES' && tableList(form.tables).length > 1 ? (relationships ?? base?.relationships ?? []) : [],
  };
}

/** The sample's columns, keeping the label, type and choice already made for a column of the same name. */
export function columnRowsFrom(sample: Sample, existing: Column[] = []): ColumnRow[] {
  const known = new Map(existing.map((c) => [`${c.table ?? ''}\u0000${c.sourceName ?? c.name}`, c]));
  const keepAll = existing.length === 0;
  // Names are unique in a dataset: a column name a later table repeats gets that table's name in front.
  const taken = new Set(existing.map((c) => c.name));
  return sample.columns.map((c) => {
    const before = known.get(`${c.table ?? ''}\u0000${c.name}`);
    let name = before?.name ?? c.name;
    if (!before && taken.has(name) && c.table) name = `${c.table.slice(c.table.lastIndexOf('.') + 1)}_${c.name}`;
    taken.add(name);
    return {
      name,
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

/**
 * A first model: numbers are summed measures, everything else (and numbers that identify, such as
 * ORDERNUMBER or YEAR_ID) a dimension, each column one or the other, since dimensions and measures
 * share names. With several tables, measures come from the fact table only.
 */
export function suggestModel(rows: ColumnRow[], fact?: string): ModelForm {
  const kept = rows.filter((r) => r.keep);
  // Numbers that identify rather than count (ORDERNUMBER, CUSTOMER_ID, YEAR_ID…) are for slicing by, not adding up.
  const identifies = (r: ColumnRow) => /(^|_)id$|[a-z]id$|number$|code$|key$|(^|_)no$/i.test(r.sourceName || r.name);
  const measure = (r: ColumnRow) => isNumeric(r.type) && !identifies(r) && (!fact || r.table === fact);
  return {
    dimensions: kept.filter((r) => !measure(r)).map((r) => ({ name: columnLabel(r), levels: [r.name], time: false })),
    measures: kept.filter(measure).map((r) => ({ name: columnLabel(r), column: r.name, aggregation: 'SUM', format: '' })),
  };
}

/** The stored model, for editing; the suggestion when there is none yet. */
export function modelFormFrom(model: Model | undefined, rows: ColumnRow[], fact?: string): ModelForm {
  if (!model || (model.dimensions.length === 0 && model.measures.length === 0)) return suggestModel(rows, fact);
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
export function modelProblems(model: ModelForm, rows: ColumnRow[], fact?: string): ModelProblems {
  const p: ModelProblems = {};
  const types = new Map(rows.map((r) => [r.name, r.type]));
  const tables = new Map(rows.map((r) => [r.name, r.table]));
  // Dimensions and measures share one set of names, as the server checks.
  const all = [...model.dimensions.map((d) => d.name.trim()), ...model.measures.map((m) => m.name.trim())];
  const seenAt = (i: number) => all.slice(0, i).some((n) => n.toLowerCase() === all[i]!.toLowerCase());
  const dims = model.dimensions.map((d) => d.name.trim());
  model.dimensions.forEach((d, i) => {
    if (!dims[i]) p[`dimensions.${i}.name`] = 'datasets.editor.problems.modelName';
    else if (seenAt(i)) p[`dimensions.${i}.name`] = 'datasets.editor.problems.duplicateName';
    if (!d.levels.some(Boolean)) p[`dimensions.${i}.levels`] = 'datasets.editor.problems.levels';
    else if (fact && new Set(d.levels.filter(Boolean).map((l) => tables.get(l))).size > 1) {
      p[`dimensions.${i}.levels`] = 'datasets.editor.problems.levelsOneTable';
    }
  });
  const measures = model.measures.map((m) => m.name.trim());
  model.measures.forEach((m, i) => {
    if (!measures[i]) p[`measures.${i}.name`] = 'datasets.editor.problems.modelName';
    else if (seenAt(dims.length + i)) p[`measures.${i}.name`] = 'datasets.editor.problems.duplicateName';
    if (!m.column) p[`measures.${i}.column`] = 'datasets.editor.problems.measureColumn';
    else if ((m.aggregation === 'SUM' || m.aggregation === 'AVERAGE') && !isNumeric(types.get(m.column) ?? 'STRING')) {
      p[`measures.${i}.column`] = 'datasets.editor.problems.numericAggregation';
    } else if (fact && tables.get(m.column) !== fact) {
      p[`measures.${i}.column`] = 'datasets.editor.problems.measureFact';
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

// ------------------------------------------------------------------------------------------------
// Joins between several tables: a star, every other table joined to the fact table.

export interface JoinRow {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  /** Keep fact rows that have no match (a left outer join). */
  outer: boolean;
}

/** The columns of each table, from the sample. */
export const tableColumns = (sample: Sample, table: string) => sample.columns.filter((c) => c.table === table).map((c) => c.name);

/**
 * A first guess: the first table is the fact table, joined to each other table on a column both have
 * (preferring ones that look like keys: …ID, …NUMBER, …CODE, …KEY).
 */
export function suggestJoins(tables: string[], sample: Sample): JoinRow[] {
  const [fact, ...others] = tables;
  if (!fact) return [];
  const factColumns = tableColumns(sample, fact);
  const keyish = (c: string) => /(id|number|code|key|no)$/i.test(c);
  return others.map((t) => {
    const shared = tableColumns(sample, t).filter((c) => factColumns.includes(c));
    const column = shared.find(keyish) ?? shared[0] ?? '';
    return { fromTable: fact, fromColumn: column, toTable: t, toColumn: column, outer: false };
  });
}

/**
 * One join per table other than the fact table: the stored ones (read from the many side) where they
 * start at the fact table, else the guess. The fact table is the stored one, else the first table.
 */
export function joinRowsFrom(relationships: Relationship[] | undefined, tables: string[], sample: Sample): JoinRow[] {
  const stored: JoinRow[] = (relationships ?? []).map((r) =>
    r.cardinality === 'ONE_TO_MANY'
      ? { fromTable: r.toTable, fromColumn: r.toColumn, toTable: r.fromTable, toColumn: r.fromColumn, outer: r.joinType === 'LEFT_OUTER' }
      : { fromTable: r.fromTable, fromColumn: r.fromColumn, toTable: r.toTable, toColumn: r.toColumn, outer: r.joinType === 'LEFT_OUTER' },
  );
  const fact = stored[0] && tables.includes(stored[0].fromTable) ? stored[0].fromTable : tables[0];
  return fact ? joinsWithFact(fact, tables, sample, stored) : [];
}

/** The joins with `fact` as the fact table: kept where they already start there, guessed for the rest. */
export function joinsWithFact(fact: string, tables: string[], sample: Sample, current: JoinRow[] = []): JoinRow[] {
  return suggestJoins([fact, ...tables.filter((t) => t !== fact)], sample).map(
    (guess) => current.find((j) => j.fromTable === fact && j.toTable === guess.toTable) ?? guess,
  );
}

/** The fact table: where the joins start. */
export const factTable = (joins: JoinRow[]) => joins[0]?.fromTable || undefined;

export type JoinProblems = Partial<Record<string, MessageKey>>;

/** What stops the joins forming a star: `joins.0.fromColumn`…, or `joins` for a table left out. */
export function joinProblems(joins: JoinRow[], tables: string[]): JoinProblems {
  const p: JoinProblems = {};
  const fact = factTable(joins);
  const seen = new Set<string>();
  joins.forEach((j, i) => {
    if (!j.fromColumn) p[`joins.${i}.fromColumn`] = 'datasets.editor.problems.joinColumn';
    if (!j.toColumn) p[`joins.${i}.toColumn`] = 'datasets.editor.problems.joinColumn';
    if (j.fromTable !== fact) p[`joins.${i}.fromTable`] = 'datasets.editor.problems.joinFact';
    else if (!j.toTable || j.toTable === fact || seen.has(j.toTable)) p[`joins.${i}.toTable`] = 'datasets.editor.problems.joinOnce';
    seen.add(j.toTable);
  });
  if (tables.some((t) => t !== fact && !seen.has(t))) p.joins = 'datasets.editor.problems.joinMissing';
  return p;
}

/** The joins as the definition stores them. */
export const relationshipsFrom = (joins: JoinRow[]): Relationship[] =>
  joins.map((j) => ({
    fromTable: j.fromTable,
    fromColumn: j.fromColumn,
    toTable: j.toTable,
    toColumn: j.toColumn,
    joinType: j.outer ? 'LEFT_OUTER' : 'INNER',
    cardinality: 'MANY_TO_ONE',
  }));
