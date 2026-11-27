import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Code2, FileSpreadsheet, Pencil, Plus, RefreshCw, Search, Table2, Trash2, type LucideIcon } from 'lucide-react';
import { Button, Card, Dialog, IconButton, toast } from '@helix/ui';
import { datasetKeys, describeError, useDatasets, useDatasetSource, type DatasetSummary, type SourceType } from '../../api/datasets';
import { QueryError } from '../files/QueryError';
import { formatDateTime } from '../files/format';
import { t } from '../../i18n';

const ICON: Record<SourceType, LucideIcon> = { FILE: FileSpreadsheet, SQL: Code2, TABLES: Table2 };

/** Datasets: what each one reads, who owns it and when it changed; create, edit and delete. */
export function DatasetsPage({ onCreate, onEdit }: { onCreate: () => void; onEdit: (id: string) => void }) {
  const datasets = useDatasets();
  const api = useDatasetSource();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [deleting, setDeleting] = useState<DatasetSummary | null>(null);

  const remove = useMutation({
    mutationFn: (d: DatasetSummary) => api.remove(d.id, d.version),
    onSuccess: (_, d) => {
      toast(t('datasets.deleted', { name: d.name }));
      setDeleting(null);
    },
    onError: (e: Error) => toast(t('datasets.deleteFailed', { message: describeError(e) }), { tone: 'danger' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: datasetKeys.all }),
  });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (datasets.data ?? []).filter(
      (d) => !q || [d.name, d.description, d.owner].some((v) => (v ?? '').toLowerCase().includes(q)),
    );
  }, [datasets.data, query]);

  return (
    <div className="flex flex-col gap-5 pt-1">
      <header className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.02em]">{t('datasets.title')}</h1>
          <p className="m-0 text-fg-muted">{t('datasets.intro')}</p>
        </div>
        <Button variant="primary" size="sm" icon={<Plus size={15} aria-hidden="true" />} onClick={onCreate}>
          {t('datasets.newDataset')}
        </Button>
      </header>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-divider px-[18px] py-3.5">
          <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-control border border-border bg-surface px-3 sm:max-w-[360px]">
            <Search size={15} className="text-fg-muted" aria-hidden="true" />
            <span className="sr-only">{t('datasets.search')}</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('datasets.searchPlaceholder')}
              className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-muted"
            />
          </label>
          <div className="flex-1" />
          <IconButton size="sm" variant="ghost" aria-label={t('common.refresh')} title={t('common.refresh')} onClick={() => void datasets.refetch()}>
            <RefreshCw size={16} aria-hidden="true" className={datasets.isFetching ? 'animate-spin motion-reduce:animate-none' : undefined} />
          </IconButton>
        </div>

        {datasets.isPending ? (
          <p className="m-0 px-[18px] py-10 text-fg-muted">{t('datasets.loading')}</p>
        ) : datasets.isError ? (
          <QueryError error={datasets.error} onRetry={() => void datasets.refetch()} />
        ) : visible.length === 0 ? (
          <p className="m-0 px-[18px] py-12 text-center text-fg-muted">{datasets.data.length ? t('datasets.noMatch') : t('datasets.none')}</p>
        ) : (
          <ul aria-label={t('datasets.title')} className="m-0 list-none p-0">
            {visible.map((d) => {
              const Icon = d.sourceType ? ICON[d.sourceType] : Table2;
              const details = [
                d.sourceType ? t(`datasets.source.${d.sourceType}`) : t('datasets.source.none'),
                d.owner ? t('datasets.ownedBy', { owner: d.owner }) : null,
                t('datasets.updated', { date: formatDateTime(new Date(d.updated)) ?? '' }),
              ].filter(Boolean);
              return (
                <li key={d.id} className="flex items-center gap-3 border-t border-divider px-[18px] py-2.5 first:border-t-0">
                  <span aria-hidden="true" className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-accent-soft text-accent">
                    <Icon size={16} />
                  </span>
                  <button type="button" onClick={() => onEdit(d.id)} className="flex min-w-0 flex-1 flex-col text-left">
                    <span className="truncate font-semibold hover:underline">{d.name}</span>
                    {d.description && <span className="truncate text-[13px] text-fg-soft">{d.description}</span>}
                    <span className="truncate text-[12.5px] text-fg-muted">{details.join(' · ')}</span>
                  </button>
                  <IconButton size="sm" variant="ghost" aria-label={t('datasets.editNamed', { name: d.name })} title={t('common.edit')} onClick={() => onEdit(d.id)}>
                    <Pencil size={16} aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    size="sm"
                    variant="ghost"
                    aria-label={t('datasets.deleteNamed', { name: d.name })}
                    title={t('common.delete')}
                    onClick={() => setDeleting(d)}
                    className="text-danger-fg"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Dialog
        open={deleting !== null}
        onClose={() => !remove.isPending && setDeleting(null)}
        title={t('datasets.deleteTitle', { name: deleting?.name ?? '' })}
        description={t('datasets.deleteDescription')}
        actions={
          <>
            <Button size="sm" onClick={() => setDeleting(null)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" variant="danger" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>
              {t('common.delete')}
            </Button>
          </>
        }
      />
    </div>
  );
}
