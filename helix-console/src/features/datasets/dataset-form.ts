import type { MessageKey } from '../../i18n';
import type { Column, ColumnType, Definition, Sample, SourceType } from '../../api/datasets';

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
export function definitionFrom(form: DatasetForm, base?: Definition, columns?: Column[]): Definition {
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
