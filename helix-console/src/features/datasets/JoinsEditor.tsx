import { useId } from 'react';
import { Checkbox } from '@helix/ui';
import type { Sample } from '../../api/datasets';
import { factTable, joinsWithFact, tableColumns, type JoinProblems, type JoinRow } from './dataset-form';
import { t, type MessageKey } from '../../i18n';

const controlClass = 'h-8 rounded-control border border-border bg-surface px-2 text-fg aria-[invalid=true]:border-danger-fg';
/** "PUBLIC.ORDERS" -> "ORDERS": the schema is noise here. */
const short = (table: string) => table.slice(table.lastIndexOf('.') + 1);

/**
 * How several tables join: a fact table, and each other table joined to it on a column of each.
 * One row per other table, so the joins always form a star.
 */
export function JoinsEditor({
  tables,
  sample,
  joins,
  onChange,
  problems,
  checked,
}: {
  tables: string[];
  sample: Sample;
  joins: JoinRow[];
  onChange: (joins: JoinRow[]) => void;
  problems: JoinProblems;
  checked: boolean;
}) {
  const id = useId();
  const fact = factTable(joins) ?? tables[0] ?? '';
  const set = (i: number, patch: Partial<JoinRow>) => onChange(joins.map((j, k) => (k === i ? { ...j, ...patch } : j)));
  const problem = (key: string) => (checked ? problems[key] : undefined);

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3 rounded-card border border-border p-3.5">
      <div>
        <h2 id={`${id}-title`} className="m-0 text-[15px] font-bold">
          {t('datasets.editor.joins.title')}
        </h2>
        <p className="m-0 text-[12.5px] text-fg-muted">{t('datasets.editor.joins.hint')}</p>
      </div>
      <label className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{t('datasets.editor.joins.fact')}</span>
        <select value={fact} onChange={(e) => onChange(joinsWithFact(e.target.value, tables, sample, joins))} className={controlClass}>
          {tables.map((table) => (
            <option key={table} value={table}>
              {short(table)}
            </option>
          ))}
        </select>
      </label>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {joins.map((j, i) => {
          const names = { fact: short(j.fromTable), table: short(j.toTable) };
          return (
            <li key={j.toTable} aria-label={t('datasets.editor.joins.join', { table: names.table })} className="flex flex-wrap items-start gap-2 text-[13.5px]">
              <Choice
                label={t('datasets.editor.joins.factColumn', names)}
                value={j.fromColumn}
                options={tableColumns(sample, j.fromTable)}
                prefix={names.fact}
                problem={problem(`joins.${i}.fromColumn`)}
                onChange={(fromColumn) => set(i, { fromColumn })}
              />
              <span className="pt-1.5 text-fg-muted">{t('datasets.editor.joins.equals')}</span>
              <Choice
                label={t('datasets.editor.joins.tableColumn', names)}
                value={j.toColumn}
                options={tableColumns(sample, j.toTable)}
                prefix={names.table}
                problem={problem(`joins.${i}.toColumn`)}
                onChange={(toColumn) => set(i, { toColumn })}
              />
              <span className="pt-1">
                <Checkbox label={t('datasets.editor.joins.outer')} aria-label={t('datasets.editor.joins.outerNamed', names)} checked={j.outer} onChange={(outer) => set(i, { outer })} />
              </span>
            </li>
          );
        })}
      </ul>
      {problem('joins') && <p className="m-0 text-[12.5px] text-danger-fg">{t(problem('joins')!)}</p>}
    </section>
  );
}

function Choice({
  label,
  value,
  options,
  prefix,
  problem,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  prefix: string;
  problem?: MessageKey;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5">
        <span className="font-mono text-[12.5px] text-fg-soft">{prefix}.</span>
        <select
          aria-label={label}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? id : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={controlClass}
        >
          <option value="">{t('datasets.editor.model.chooseColumn')}</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </span>
      {problem && (
        <span id={id} className="text-[12px] text-danger-fg">
          {t(problem)}
        </span>
      )}
    </span>
  );
}
