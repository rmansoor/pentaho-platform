import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Code2, Database, Download, FileSpreadsheet, Pencil, Plus, RefreshCw, Search, Share2, Table2, Trash2, type LucideIcon } from 'lucide-react';
import { Button, Card, Dialog, IconButton, cn, toast } from '@helix/ui';
import { datasetKeys, describeError, useDatasets, useDatasetSource, useWizardSources, type DatasetSummary, type SourceType } from '../../api/datasets';
import { ShareDialog } from './ShareDialog';
import { QueryError } from '../files/QueryError';
import { formatDateTime } from '../files/format';
import { t } from '../../i18n';

const ICON: Record<SourceType, LucideIcon> = { FILE: FileSpreadsheet, SQL: Code2, TABLES: Table2 };

const selectClass = 'h-9 rounded-control border border-border bg-surface px-2.5 text-[13.5px] text-fg';

/**
 * Datasets: what each one reads, who owns it, when it changed and whether it is published; filter,
 * create, edit, share, export and delete. The Data Source Wizard's sources not yet upgraded are listed too.
 */
export function DatasetsPage({ onCreate, onEdit }: { onCreate: () => void; onEdit: (id: string) => void }) {
  const datasets = useDatasets();
  const api = useDatasetSource();
  const queryClient = useQueryClient();
  const wizard = useWizardSources();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<SourceType | ''>('');
  const [owner, setOwner] = useState('');
  const [status, setStatus] = useState<'' | 'published' | 'draft'>('');
  const [deleting, setDeleting] = useState<DatasetSummary | null>(null);
  const [sharing, setSharing] = useState<DatasetSummary | null>(null);

  const exportDefinition = async (d: DatasetSummary) => {
    try {
      const { definition } = await api.get(d.id);
      const file = `${d.id}.dataset.json`;
      const url = URL.createObjectURL(new Blob([JSON.stringify(definition, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = file;
      a.click();
      URL.revokeObjectURL(url);
      toast(t('datasets.exported', { name: d.name, file }));
    } catch (e) {
      toast(describeError(e), { tone: 'danger' });
    }
  };

  const remove = useMutation({
    mutationFn: (d: DatasetSummary) => api.remove(d.id, d.version),
    onSuccess: (_, d) => {
      toast(t('datasets.deleted', { name: d.name }));
      setDeleting(null);
    },
    onError: (e: Error) => toast(t('datasets.deleteFailed', { message: describeError(e) }), { tone: 'danger' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: datasetKeys.all }),
  });

  const owners = useMemo(() => [...new Set((datasets.data ?? []).map((d) => d.owner).filter((o): o is string => !!o))].sort(), [datasets.data]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (datasets.data ?? []).filter(
      (d) =>
        (!q || [d.name, d.description, d.owner].some((v) => (v ?? '').toLowerCase().includes(q))) &&
        (!type || d.sourceType === type) &&
        (!owner || d.owner === owner) &&
        (!status || (status === 'published') === !!d.published),
    );
  }, [datasets.data, query, type, owner, status]);
  // The wizard's sources a dataset hasn't published: still to be upgraded.
  const legacy = useMemo(() => {
    const ours = new Set((datasets.data ?? []).map((d) => d.published?.domainId).filter(Boolean));
    const q = query.trim().toLowerCase();
    return (wizard.data ?? []).filter((id) => !ours.has(id) && (!q || id.toLowerCase().includes(q)));
  }, [wizard.data, datasets.data, query]);
  const filtering = !!(type || owner || status);

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
          <div role="group" aria-label={t('datasets.filters.label')} className="flex flex-wrap items-center gap-2">
            <select aria-label={t('datasets.filters.type')} value={type} onChange={(e) => setType(e.target.value as SourceType | '')} className={selectClass}>
              <option value="">{t('datasets.filters.anyType')}</option>
              {(['FILE', 'SQL', 'TABLES'] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`datasets.source.${s}`)}
                </option>
              ))}
            </select>
            <select aria-label={t('datasets.filters.owner')} value={owner} onChange={(e) => setOwner(e.target.value)} className={selectClass}>
              <option value="">{t('datasets.filters.anyOwner')}</option>
              {owners.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <select aria-label={t('datasets.filters.status')} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={selectClass}>
              <option value="">{t('datasets.filters.anyStatus')}</option>
              <option value="published">{t('datasets.status.published')}</option>
              <option value="draft">{t('datasets.status.draft')}</option>
            </select>
          </div>
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
          <p className="m-0 px-[18px] py-12 text-center text-fg-muted">{datasets.data.length || filtering ? t('datasets.noMatch') : t('datasets.none')}</p>
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
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-semibold hover:underline">{d.name}</span>
                      <span
                        title={d.published ? t('datasets.publishedAs', { name: d.published.catalogName }) : undefined}
                        className={cn(
                          'shrink-0 rounded-full px-2 py-px text-[11.5px] font-semibold',
                          d.published ? 'bg-success-bg text-success-fg' : 'bg-divider text-fg-muted',
                        )}
                      >
                        {d.published ? t('datasets.status.published') : t('datasets.status.draft')}
                      </span>
                    </span>
                    {d.description && <span className="truncate text-[13px] text-fg-soft">{d.description}</span>}
                    <span className="truncate text-[12.5px] text-fg-muted">{details.join(' · ')}</span>
                  </button>
                  <IconButton size="sm" variant="ghost" aria-label={t('datasets.editNamed', { name: d.name })} title={t('common.edit')} onClick={() => onEdit(d.id)}>
                    <Pencil size={16} aria-hidden="true" />
                  </IconButton>
                  <IconButton size="sm" variant="ghost" aria-label={t('datasets.shareNamed', { name: d.name })} title={t('datasets.shareNamed', { name: d.name })} onClick={() => setSharing(d)}>
                    <Share2 size={16} aria-hidden="true" />
                  </IconButton>
                  <IconButton size="sm" variant="ghost" aria-label={t('datasets.exportNamed', { name: d.name })} title={t('datasets.exportNamed', { name: d.name })} onClick={() => void exportDefinition(d)}>
                    <Download size={16} aria-hidden="true" />
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

      {legacy.length > 0 && !type && !owner && status !== 'published' && (
        <Card className="overflow-hidden">
          <div className="border-b border-divider px-[18px] py-3">
            <h2 className="m-0 text-[15px] font-bold">{t('datasets.wizard.title')}</h2>
            <p className="m-0 text-[12.5px] text-fg-muted">{t('datasets.wizard.intro')}</p>
          </div>
          <ul aria-label={t('datasets.wizard.title')} className="m-0 list-none p-0">
            {legacy.map((id) => (
              <li key={id} className="flex items-center gap-3 border-t border-divider px-[18px] py-2.5 first:border-t-0">
                <span aria-hidden="true" className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-divider text-fg-muted">
                  <Database size={16} />
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">{id.replace(/\.xmi$/, '')}</span>
                <span className="shrink-0 rounded-full bg-warning-bg px-2 py-px text-[11.5px] font-semibold text-warning-fg">{t('datasets.wizard.notUpgraded')}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <ShareDialog dataset={sharing} onClose={() => setSharing(null)} />
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
