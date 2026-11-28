import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Boxes, Cable, Database, Download, FileCode2, Pencil, Plus, RefreshCw, Search, Trash2, type LucideIcon } from 'lucide-react';
import { Button, Card, cn, Dialog, IconButton, toast } from '@helix/ui';
import {
  dataSourceLabel,
  dataSourceKeys,
  useDataSources,
  useDataSourceSource,
  type DataSource,
  type DataSourceKind,
} from '../../api/datasources';
import { QueryError } from '../files/QueryError';
import { ConnectionSheet, type ConnectionTarget } from './ConnectionSheet';
import { t } from '../../i18n';

const ICON: Record<DataSourceKind, LucideIcon> = { jdbc: Cable, analysis: Boxes, metadata: FileCode2, dsw: Database };
const ORDER: DataSourceKind[] = ['jdbc', 'analysis', 'metadata', 'dsw'];

/** Data sources: database connections, analysis schemas and metadata models, with export and delete. */
export function DataSourcesPage() {
  const sources = useDataSources();
  const api = useDataSourceSource();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'' | DataSourceKind>('');
  const [deleting, setDeleting] = useState<DataSource | null>(null);
  const [editing, setEditing] = useState<ConnectionTarget | null>(null);

  const remove = useMutation({
    mutationFn: (source: DataSource) => api.remove(source),
    onSuccess: (_, source) => {
      toast(t('datasources.deleted', { kind: source.kind, name: source.id }));
      setDeleting(null);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: dataSourceKeys.all }),
    onError: (e: Error) => toast(t('datasources.deleteFailed', { message: e.message }), { tone: 'danger' }),
  });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (sources.data ?? [])
      .filter((s) => (!kind || s.kind === kind) && (!q || s.id.toLowerCase().includes(q) || (s.detail ?? '').toLowerCase().includes(q)))
      .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.id.localeCompare(b.id));
  }, [sources.data, query, kind]);

  const counts = useMemo(() => {
    const c: Partial<Record<DataSourceKind, number>> = {};
    for (const s of sources.data ?? []) c[s.kind] = (c[s.kind] ?? 0) + 1;
    return c;
  }, [sources.data]);

  return (
    <div className="flex flex-col gap-5 pt-1">
      <header className="flex flex-wrap items-end gap-3">
        <h1 className="m-0 min-w-0 flex-1 text-[28px] font-extrabold tracking-[-0.02em]">{t('datasources.title')}</h1>
        <Button variant="primary" size="sm" icon={<Plus size={15} aria-hidden="true" />} onClick={() => setEditing({ kind: 'new' })}>
          {t('datasources.newConnection')}
        </Button>
      </header>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-divider px-[18px] py-3.5">
          <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-control border border-border bg-surface px-3 sm:max-w-[320px]">
            <Search size={15} className="text-fg-muted" aria-hidden="true" />
            <span className="sr-only">{t('datasources.search')}</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('datasources.searchPlaceholder')}
              className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-muted"
            />
          </label>
          <div role="group" aria-label={t('datasources.filter')} className="flex flex-wrap gap-1">
            {(['', ...ORDER] as const).map((k) => (
              <button
                key={k || 'all'}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  'h-8 rounded-full px-3 text-[12.5px] font-semibold',
                  kind === k ? 'bg-accent text-accent-ink' : 'bg-divider text-fg-soft hover:bg-accent-soft',
                )}
              >
                {k ? (counts[k] ? t('datasources.kindCount', { kind: dataSourceLabel(k), count: counts[k] }) : dataSourceLabel(k)) : t('datasources.all')}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <IconButton size="sm" variant="ghost" aria-label={t('common.refresh')} title={t('common.refresh')} onClick={() => void sources.refetch()}>
            <RefreshCw size={16} aria-hidden="true" className={sources.isFetching ? 'animate-spin motion-reduce:animate-none' : undefined} />
          </IconButton>
        </div>

        {sources.isPending ? (
          <p className="m-0 px-[18px] py-10 text-fg-muted">{t('datasources.loading')}</p>
        ) : sources.isError ? (
          <QueryError error={sources.error} onRetry={() => void sources.refetch()} />
        ) : visible.length === 0 ? (
          <p className="m-0 px-[18px] py-12 text-center text-fg-muted">
            {sources.data.length ? t('datasources.noMatch') : t('datasources.none')}
          </p>
        ) : (
          <ul aria-label={t('datasources.title')} className="m-0 list-none p-0">
            {visible.map((source) => {
              const Icon = ICON[source.kind];
              return (
                <li key={`${source.kind}:${source.id}`} className="flex items-center gap-3 border-t border-divider px-[18px] py-2.5 first:border-t-0">
                  <span aria-hidden="true" className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-accent-soft text-accent">
                    <Icon size={16} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold">{source.id}</span>
                    <span className="truncate text-[12.5px] text-fg-muted">
                      {dataSourceLabel(source.kind)}
                      {source.detail ? ` · ${source.detail}` : ''}
                    </span>
                  </span>
                  {source.downloadUrl && (
                    <a
                      href={source.downloadUrl}
                      download
                      aria-label={t('datasources.exportNamed', { name: source.id })}
                      title={t('datasources.export')}
                      className="grid size-9 place-items-center rounded-control text-fg-soft hover:bg-accent-soft hover:text-fg"
                    >
                      <Download size={16} aria-hidden="true" />
                    </a>
                  )}
                  {source.kind === 'jdbc' && (
                    <IconButton size="sm" variant="ghost" aria-label={t('datasources.editNamed', { name: source.id })} title={t('common.edit')} onClick={() => setEditing({ kind: 'edit', name: source.id })}>
                      <Pencil size={16} aria-hidden="true" />
                    </IconButton>
                  )}
                  <IconButton
                    size="sm"
                    variant="ghost"
                    aria-label={t('datasources.deleteNamed', { name: source.id })}
                    title={t('common.delete')}
                    onClick={() => setDeleting(source)}
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

      <ConnectionSheet target={editing} onClose={() => setEditing(null)} />
      <Dialog
        open={deleting !== null}
        onClose={() => !remove.isPending && setDeleting(null)}
        title={t('datasources.deleteTitle', { name: deleting?.id ?? '' })}
        description={
          deleting?.kind === 'jdbc'
            ? t('datasources.deleteConnection')
            : t('datasources.deleteModel')
        }
        actions={
          <>
            <Button size="sm" onClick={() => setDeleting(null)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" variant="danger" onClick={() => deleting && remove.mutate(deleting)}>
              {t('common.delete')}
            </Button>
          </>
        }
      />
    </div>
  );
}
