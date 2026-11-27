import { useId, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CheckCircle2, Code2, FileSpreadsheet, Table2, type LucideIcon } from 'lucide-react';
import { Button, Card, Checkbox, cn, toast } from '@helix/ui';
import {
  COLUMN_TYPES,
  datasetKeys,
  DatasetError,
  describeError,
  useConnectionNames,
  useDataset,
  useDatasetSource,
  type ColumnType,
  type Sample,
  type SourceType,
  type StagedTable,
  type Stored,
} from '../../api/datasets';
import { QueryError } from '../files/QueryError';
import {
  columnRowsFrom,
  columnsFrom,
  definitionFrom,
  DELIMITERS,
  emptyForm,
  ENCODINGS,
  formFrom,
  problems,
  type ColumnRow,
  type DatasetForm,
} from './dataset-form';
import { t, type MessageKey } from '../../i18n';

const inputClass = 'h-10 w-full rounded-control border border-border-strong bg-surface px-3 text-fg';
const SOURCE_TYPES: Array<{ type: SourceType; icon: LucideIcon }> = [
  { type: 'FILE', icon: FileSpreadsheet },
  { type: 'SQL', icon: Code2 },
  { type: 'TABLES', icon: Table2 },
];
const STEPS: MessageKey[] = ['datasets.editor.steps.source', 'datasets.editor.steps.columns', 'datasets.editor.steps.finish'];
const PREVIEW_ROWS = 20;

/** Create a dataset, or edit one (`id`): its source, then its columns, then save (and load a file). */
export function DatasetEditorPage({ id, onDone }: { id?: string; onDone: () => void }) {
  const existing = useDataset(id);
  if (id && existing.isPending) return <p className="m-0 py-10 text-fg-muted">{t('datasets.loading')}</p>;
  if (id && existing.isError) return <QueryError error={existing.error} onRetry={() => void existing.refetch()} secondary={{ label: t('datasets.editor.back'), onClick: onDone }} />;
  return <Editor key={id ?? 'new'} initial={existing.data} onDone={onDone} />;
}

function Editor({ initial, onDone }: { initial?: Stored; onDone: () => void }) {
  const api = useDatasetSource();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<DatasetForm>(() => (initial ? formFrom(initial.definition) : emptyForm()));
  const [file, setFile] = useState<File | null>(null);
  const [stored, setStored] = useState<Stored | undefined>(initial);
  const [sample, setSample] = useState<Sample | null>(null);
  const [rows, setRows] = useState<ColumnRow[]>([]);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [staged, setStaged] = useState<StagedTable | null>(null);
  const formId = useId();
  const connections = useConnectionNames(form.sourceType !== 'FILE');
  const found = problems(form, file !== null);
  const update = (patch: Partial<DatasetForm>) => setForm((f) => ({ ...f, ...patch }));
  const refreshList = () => queryClient.invalidateQueries({ queryKey: datasetKeys.all });

  const preview = useMutation({
    mutationFn: async () => {
      let filePath = form.filePath;
      if (form.sourceType === 'FILE' && file) {
        filePath = await api.upload(file);
        update({ filePath });
        setFile(null);
      }
      const definition = definitionFrom({ ...form, filePath }, stored?.definition);
      const next = stored ? await api.update(stored.definition.id!, definition, stored.version) : await api.create(definition);
      setStored(next);
      void refreshList();
      return { next, sample: await api.sample(next.definition.id!) };
    },
    onMutate: () => setError(null),
    onSuccess: ({ next, sample }) => {
      setSample(sample);
      setRows(columnRowsFrom(sample, next.definition.columns));
      setStep(1);
    },
    onError: setError,
  });

  const save = useMutation({
    mutationFn: async () => {
      const definition = definitionFrom(form, stored!.definition, columnsFrom(rows));
      let next = await api.update(stored!.definition.id!, definition, stored!.version);
      let table: StagedTable | null = null;
      if (form.sourceType === 'FILE') {
        const loaded = await api.stage(next.definition.id!, next.version);
        table = loaded.table;
        next = { definition: next.definition, version: loaded.version };
      }
      setStored(next);
      return table;
    },
    onMutate: () => setError(null),
    onSuccess: (table) => {
      void refreshList();
      void queryClient.invalidateQueries({ queryKey: datasetKeys.one(stored!.definition.id!) });
      toast(t('datasets.editor.saved', { name: form.name.trim() }));
      if (table) setStaged(table);
      else onDone();
    },
    onError: setError,
  });

  const startPreview = () => {
    setChecked(true);
    if (Object.keys(found).length === 0) preview.mutate();
  };
  const kept = rows.filter((r) => r.keep).length;
  const title = initial ? t('datasets.editor.editTitle', { name: initial.definition.name }) : t('datasets.editor.newTitle');

  return (
    <div className="flex flex-col gap-5 pt-1">
      <header className="flex flex-col gap-2">
        <button type="button" onClick={onDone} className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-fg-soft hover:text-fg">
          <ArrowLeft size={15} aria-hidden="true" />
          {t('datasets.editor.back')}
        </button>
        <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.02em]">{title}</h1>
        <ol aria-label={t('datasets.editor.stepOf', { step: step + 1, count: STEPS.length })} className="m-0 flex list-none flex-wrap gap-2 p-0">
          {STEPS.map((label, i) => (
            <li
              key={label}
              aria-current={i === step ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-full px-3 py-1 text-[12.5px] font-semibold',
                i === step ? 'bg-accent text-accent-ink' : i < step ? 'bg-accent-soft text-accent' : 'bg-divider text-fg-muted',
              )}
            >
              <span aria-hidden="true">{i + 1}</span>
              {t(label)}
            </li>
          ))}
        </ol>
      </header>

      {error !== null && <ErrorPanel error={error} />}

      {step === 0 && (
        <Card className="flex flex-col gap-5 p-[18px]">
          <Field label={t('datasets.editor.name')} problem={checked ? found.name : undefined}>
            {(props) => <input {...props} value={form.name} onChange={(e) => update({ name: e.target.value })} className={inputClass} />}
          </Field>
          <Field label={t('datasets.editor.description')} hint={t('datasets.editor.descriptionHint')}>
            {(props) => (
              <textarea {...props} rows={2} value={form.description} onChange={(e) => update({ description: e.target.value })} className={cn(inputClass, 'h-auto py-2')} />
            )}
          </Field>

          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 p-0 font-semibold">{t('datasets.editor.sourceType')}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {SOURCE_TYPES.map(({ type, icon: Icon }) => (
                <label
                  key={type}
                  className={cn(
                    'flex cursor-pointer flex-col gap-1.5 rounded-card border p-3.5',
                    form.sourceType === type ? 'border-accent bg-accent-soft' : 'border-border hover:border-border-strong',
                  )}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <input
                      type="radio"
                      name={`${formId}-source`}
                      value={type}
                      checked={form.sourceType === type}
                      onChange={() => update({ sourceType: type })}
                      aria-labelledby={`${formId}-${type}`}
                      aria-describedby={`${formId}-${type}-hint`}
                      className="accent-[var(--hx-accent)]"
                    />
                    <Icon size={16} aria-hidden="true" className="text-accent" />
                    <span id={`${formId}-${type}`}>{t(`datasets.source.${type}`)}</span>
                  </span>
                  <span id={`${formId}-${type}-hint`} className="text-[12.5px] text-fg-muted">
                    {t(`datasets.editor.sourceHint.${type}`)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {form.sourceType === 'FILE' ? (
            <FileFields form={form} file={file} onFile={setFile} update={update} problem={checked ? found.file : undefined} />
          ) : (
            <>
              <Field label={t('datasets.editor.connection')} problem={checked ? found.connection : undefined} hint={connections.data?.length === 0 ? t('datasets.editor.noConnections') : undefined}>
                {(props) => (
                  <select {...props} value={form.connection} onChange={(e) => update({ connection: e.target.value })} className={inputClass}>
                    <option value="">{t('datasets.editor.chooseConnection')}</option>
                    {(connections.data ?? []).map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              {form.sourceType === 'SQL' ? (
                <Field label={t('datasets.editor.sql')} hint={t('datasets.editor.sqlHint')} problem={checked ? found.sql : undefined}>
                  {(props) => (
                    <textarea
                      {...props}
                      rows={6}
                      spellCheck={false}
                      value={form.sql}
                      onChange={(e) => update({ sql: e.target.value })}
                      className={cn(inputClass, 'h-auto py-2 font-mono text-[13px]')}
                    />
                  )}
                </Field>
              ) : (
                <Field label={t('datasets.editor.tables')} hint={t('datasets.editor.tablesHint')} problem={checked ? found.tables : undefined}>
                  {(props) => <input {...props} value={form.tables} onChange={(e) => update({ tables: e.target.value })} className={inputClass} />}
                </Field>
              )}
            </>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-divider pt-4">
            <Button variant="primary" size="sm" onClick={startPreview} disabled={preview.isPending}>
              {preview.isPending ? t('datasets.editor.previewing') : t('datasets.editor.preview')}
            </Button>
            {!stored && <span className="text-[12.5px] text-fg-muted">{t('datasets.editor.draftNote')}</span>}
          </div>
        </Card>
      )}

      {step === 1 && sample && (
        <Card className="flex flex-col gap-4 p-[18px]">
          <p className="m-0 text-fg-soft">{t('datasets.editor.columnsIntro')}</p>
          <ColumnsTable rows={rows} onChange={setRows} />
          <SampleGrid sample={sample} />
          <div className="flex flex-wrap items-center gap-3 border-t border-divider pt-4">
            <Button size="sm" onClick={() => setStep(0)}>
              {t('datasets.editor.previous')}
            </Button>
            <Button variant="primary" size="sm" disabled={kept === 0} onClick={() => setStep(2)}>
              {t('datasets.editor.next')}
            </Button>
            {kept === 0 && <span className="text-[12.5px] text-danger-fg">{t('datasets.editor.noColumns')}</span>}
          </div>
        </Card>
      )}

      {step === 2 && !staged && (
        <Card className="flex flex-col gap-3 p-[18px]">
          <h2 className="m-0 text-[17px] font-bold">{t('datasets.editor.summary')}</h2>
          <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5">
            <dt className="text-fg-muted">{t('datasets.editor.name')}</dt>
            <dd className="m-0 font-semibold">{form.name.trim()}</dd>
            <dt className="text-fg-muted">{t('datasets.editor.steps.source')}</dt>
            <dd className="m-0">
              {t(`datasets.source.${form.sourceType}`)}
              {form.sourceType !== 'FILE' && form.connection ? ` · ${form.connection}` : ''}
            </dd>
            <dt className="text-fg-muted">{t('datasets.editor.steps.columns')}</dt>
            <dd className="m-0">{t('datasets.editor.summaryColumns', { count: kept, total: rows.length })}</dd>
          </dl>
          {form.sourceType === 'FILE' && <p className="m-0 text-[13px] text-fg-muted">{t('datasets.editor.summaryFile')}</p>}
          <div className="flex flex-wrap items-center gap-3 border-t border-divider pt-4">
            <Button size="sm" onClick={() => setStep(1)} disabled={save.isPending}>
              {t('datasets.editor.previous')}
            </Button>
            <Button variant="primary" size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending
                ? form.sourceType === 'FILE'
                  ? t('datasets.editor.loadingFile')
                  : t('datasets.editor.saving')
                : form.sourceType === 'FILE'
                  ? t('datasets.editor.saveAndLoad')
                  : t('datasets.editor.save')}
            </Button>
          </div>
        </Card>
      )}

      {staged && (
        <Card className="flex flex-col gap-3 p-[18px]" role="status">
          <p className="m-0 flex items-center gap-2 font-semibold">
            <CheckCircle2 size={18} aria-hidden="true" className="text-success-fg" />
            {t('datasets.editor.loaded', { count: staged.rows, table: staged.table })}
          </p>
          {staged.warnings.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="m-0 flex items-center gap-2 text-[13px] font-semibold">
                <AlertTriangle size={15} aria-hidden="true" className="text-warning-fg" />
                {t('datasets.editor.warnings')}
              </p>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[13px] text-fg-soft">
                {staged.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="border-t border-divider pt-4">
            <Button variant="primary" size="sm" onClick={onDone}>
              {t('datasets.editor.done')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function FileFields({
  form,
  file,
  onFile,
  update,
  problem,
}: {
  form: DatasetForm;
  file: File | null;
  onFile: (file: File | null) => void;
  update: (patch: Partial<DatasetForm>) => void;
  problem?: MessageKey;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Field
        label={t('datasets.editor.file')}
        problem={problem}
        hint={!file && form.filePath ? `${t('datasets.editor.currentFile', { name: form.filePath })} ${t('datasets.editor.replaceFile')}` : undefined}
      >
        {(props) => (
          <input
            {...props}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            className="text-fg file:mr-3 file:h-9 file:cursor-pointer file:rounded-control file:border file:border-border-strong file:bg-surface file:px-3 file:font-semibold file:text-fg"
          />
        )}
      </Field>
      <Checkbox label={t('datasets.editor.headerRow')} checked={form.headerRow} onChange={(headerRow) => update({ headerRow })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('datasets.editor.delimiter')}>
          {(props) => (
            <select {...props} value={form.delimiter} onChange={(e) => update({ delimiter: e.target.value })} className={inputClass}>
              {DELIMITERS.map((d) => (
                <option key={d.label} value={d.value}>
                  {t(d.label)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('datasets.editor.encoding')}>
          {(props) => (
            <select {...props} value={form.encoding} onChange={(e) => update({ encoding: e.target.value })} className={inputClass}>
              {ENCODINGS.map((enc) => (
                <option key={enc || 'auto'} value={enc}>
                  {enc || t('datasets.editor.encodingAuto')}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
    </div>
  );
}

function ColumnsTable({ rows, onChange }: { rows: ColumnRow[]; onChange: (rows: ColumnRow[]) => void }) {
  const set = (i: number, patch: Partial<ColumnRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full border-collapse text-left text-[13.5px]">
        <thead className="bg-divider/50 text-[12px] font-semibold text-fg-muted uppercase">
          <tr>
            <th className="w-16 px-3 py-2">{t('datasets.editor.include')}</th>
            <th className="px-3 py-2">{t('datasets.editor.column')}</th>
            <th className="px-3 py-2">{t('datasets.editor.label')}</th>
            <th className="px-3 py-2">{t('datasets.editor.type')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.table ?? ''}.${r.sourceName}`} className={cn('border-t border-divider', !r.keep && 'text-fg-muted')}>
              <td className="px-3 py-1.5">
                <Checkbox aria-label={t('datasets.editor.includeNamed', { name: r.sourceName })} checked={r.keep} onChange={(keep) => set(i, { keep })} />
              </td>
              <td className="px-3 py-1.5">
                <span className="font-mono text-[12.5px]">{r.sourceName}</span>
                {r.table && <span className="block text-[11.5px] text-fg-muted">{r.table}</span>}
              </td>
              <td className="px-3 py-1.5">
                <input
                  aria-label={t('datasets.editor.labelNamed', { name: r.sourceName })}
                  value={r.label}
                  placeholder={r.sourceName}
                  disabled={!r.keep}
                  onChange={(e) => set(i, { label: e.target.value })}
                  className="h-8 w-full min-w-[140px] rounded-control border border-border bg-surface px-2 text-fg disabled:opacity-60"
                />
              </td>
              <td className="px-3 py-1.5">
                <select
                  aria-label={t('datasets.editor.typeNamed', { name: r.sourceName })}
                  value={r.type}
                  disabled={!r.keep}
                  onChange={(e) => set(i, { type: e.target.value as ColumnType })}
                  className="h-8 rounded-control border border-border bg-surface px-2 text-fg disabled:opacity-60"
                >
                  {COLUMN_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`datasets.editor.types.${type}`)}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SampleGrid({ sample }: { sample: Sample }) {
  return (
    <section aria-label={t('datasets.editor.sampleTitle')} className="flex flex-col gap-2">
      <h2 className="m-0 text-[14px] font-bold">{t('datasets.editor.sampleTitle')}</h2>
      {sample.rows.length === 0 ? (
        <p className="m-0 text-fg-muted">{t('datasets.editor.noRows')}</p>
      ) : (
        <div className="max-h-[360px] overflow-auto rounded-card border border-border">
          <table className="w-full border-collapse text-left font-mono text-[12.5px]">
            <thead className="sticky top-0 bg-surface">
              <tr>
                {sample.columns.map((c) => (
                  <th
                    key={`${c.table ?? ''}.${c.name}`}
                    className={cn('border-b border-divider px-3 py-2 whitespace-nowrap', (c.type === 'INTEGER' || c.type === 'DECIMAL') && 'text-right')}
                  >
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sample.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                <tr key={i} className="border-t border-divider">
                  {row.map((v, j) => (
                    <td key={j} className={cn('px-3 py-1.5 whitespace-nowrap', typeof v === 'number' && 'text-right', v === null && 'text-fg-muted')}>
                      {v === null ? '—' : String(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(sample.truncated || sample.rows.length > PREVIEW_ROWS) && <p className="m-0 text-[12.5px] text-fg-muted">{t('datasets.editor.sampleMore')}</p>}
    </section>
  );
}

function ErrorPanel({ error }: { error: unknown }) {
  const stale = error instanceof DatasetError && error.code === 'stale-version';
  const problemList = error instanceof DatasetError ? error.problems : [];
  return (
    <div role="alert" className="flex flex-col gap-1.5 rounded-card border border-danger-fg/30 bg-danger-bg px-4 py-3 text-danger-fg">
      <p className="m-0 font-semibold">{stale ? t('datasets.errors.stale') : describeError(error)}</p>
      {problemList.length > 1 && (
        <ul className="m-0 flex list-disc flex-col gap-0.5 pl-5 text-[13px]">
          {problemList.map((p) => (
            <li key={`${p.path}:${p.message}`}>
              {p.path ? <code>{p.path}</code> : null} {p.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type FieldProps = { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean };

function Field({ label, hint, problem, children }: { label: string; hint?: string; problem?: MessageKey; children: (props: FieldProps) => ReactNode }) {
  const id = useId();
  const described = [hint ? `${id}-hint` : '', problem ? `${id}-problem` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      {children({ id, 'aria-describedby': described, 'aria-invalid': problem ? true : undefined })}
      {hint && (
        <span id={`${id}-hint`} className="text-[12.5px] text-fg-muted">
          {hint}
        </span>
      )}
      {problem && (
        <span id={`${id}-problem`} className="text-[12.5px] text-danger-fg">
          {t(problem)}
        </span>
      )}
    </div>
  );
}
