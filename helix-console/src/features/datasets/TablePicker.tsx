import { useId, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Checkbox, cn } from '@helix/ui';
import { describeError, useConnectionTables } from '../../api/datasets';
import { tableList } from './dataset-form';
import { t, type MessageKey } from '../../i18n';

const inputClass = 'h-10 w-full rounded-control border border-border-strong bg-surface px-3 text-fg';

/**
 * The tables of a TABLES source, picked from what the connection lists. `value` is the form's
 * comma-separated list, in the order chosen. If the connection can't be listed, names are typed.
 */
export function TablePicker({
  connection,
  value,
  onChange,
  problem,
}: {
  connection: string;
  value: string;
  onChange: (value: string) => void;
  problem?: MessageKey;
}) {
  const id = useId();
  const listing = useConnectionTables(connection);
  const [filter, setFilter] = useState('');
  const chosen = useMemo(() => tableList(value), [value]);
  const listed = listing.data?.tables;

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const known = new Set((listed ?? []).map((tb) => tb.qualifiedName));
    // Names chosen before (typed, or from an earlier listing) stay visible and ticked.
    const extra = chosen.filter((n) => !known.has(n)).map((n) => ({ qualifiedName: n, name: n, type: 'TABLE' as string, schema: undefined as string | undefined }));
    return [...extra, ...(listed ?? [])].filter((tb) => !q || tb.qualifiedName.toLowerCase().includes(q));
  }, [listed, chosen, filter]);

  const toggle = (name: string, on: boolean) => onChange((on ? [...chosen, name] : chosen.filter((n) => n !== name)).join(', '));

  const problemLine = problem && (
    <span id={`${id}-problem`} className="text-[12.5px] text-danger-fg">
      {t(problem)}
    </span>
  );

  if (!connection || listing.isError) {
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="font-semibold">
          {t('datasets.editor.tables')}
        </label>
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={!connection}
          aria-describedby={`${id}-hint${problem ? ` ${id}-problem` : ''}`}
          aria-invalid={problem ? true : undefined}
          className={cn(inputClass, 'disabled:opacity-60')}
        />
        <span id={`${id}-hint`} className="text-[12.5px] text-fg-muted">
          {!connection
            ? t('datasets.editor.tablesFirstConnection')
            : `${t('datasets.editor.tablesFailed', { message: describeError(listing.error).replace(/\.?$/, '.') })} ${t('datasets.editor.tablesHint')}`}
        </span>
        {problemLine}
      </div>
    );
  }

  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" aria-describedby={`${id}-hint${problem ? ` ${id}-problem` : ''}`}>
      <legend className="mb-1.5 p-0 font-semibold">{t('datasets.editor.tables')}</legend>
      <span id={`${id}-hint`} className="text-[12.5px] text-fg-muted">
        {t('datasets.editor.tablesPick')} {t('datasets.editor.tablesSelected', { count: chosen.length })}
      </span>
      {listing.isPending ? (
        <p className="m-0 text-fg-muted">{t('datasets.editor.tablesLoading')}</p>
      ) : (
        <div className="overflow-hidden rounded-card border border-border">
          <label className="flex h-10 items-center gap-2 border-b border-divider px-3">
            <Search size={15} className="text-fg-muted" aria-hidden="true" />
            <span className="sr-only">{t('datasets.editor.tablesFilter')}</span>
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('datasets.editor.tablesFilterPlaceholder')}
              className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-muted"
            />
          </label>
          {visible.length === 0 ? (
            <p className="m-0 px-3 py-4 text-fg-muted">{listed?.length ? t('datasets.editor.tablesNoMatch') : t('datasets.editor.tablesNone')}</p>
          ) : (
            <ul className="m-0 max-h-[280px] list-none overflow-y-auto p-0">
              {visible.map((tb) => (
                <li key={tb.qualifiedName} className="border-t border-divider px-3 py-1.5 first:border-t-0">
                  <Checkbox
                    checked={chosen.includes(tb.qualifiedName)}
                    onChange={(on) => toggle(tb.qualifiedName, on)}
                    label={
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-[13px]">{tb.qualifiedName}</span>
                        {tb.type === 'VIEW' && (
                          <span className="rounded-full bg-divider px-2 py-px text-[11px] font-semibold text-fg-soft">{t('datasets.editor.view')}</span>
                        )}
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {listing.data?.truncated && <span className="text-[12.5px] text-fg-muted">{t('datasets.editor.tablesTruncated')}</span>}
      {problemLine}
    </fieldset>
  );
}
