import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Boxes, Cable, Database, Download, FileCode2, Plus, RefreshCw, Search, Trash2, type LucideIcon } from 'lucide-react';
import { Button, Card, cn, Dialog, IconButton, toast } from '@helix/ui';
import {
  DATA_SOURCE_LABEL,
  dataSourceKeys,
  useDataSources,
  useDataSourceSource,
  type DataSource,
  type DataSourceKind,
} from '../../api/datasources';
import { QueryError } from '../files/QueryError';

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

  const remove = useMutation({
    mutationFn: (source: DataSource) => api.remove(source),
    onSuccess: (_, source) => {
      toast(`Deleted ${DATA_SOURCE_LABEL[source.kind].toLowerCase()} "${source.id}"`);
      setDeleting(null);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: dataSourceKeys.all }),
    onError: (e: Error) => toast(`Couldn't delete: ${e.message}`, { tone: 'danger' }),
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
        <h1 className="m-0 min-w-0 flex-1 text-[28px] font-extrabold tracking-[-0.02em]">Data sources</h1>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={15} aria-hidden="true" />}
          aria-disabled="true"
          title="New connections and the data source wizard come with the next console milestone"
          className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        >
          New data source
        </Button>
      </header>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-divider px-[18px] py-3.5">
          <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-control border border-border bg-surface px-3 sm:max-w-[320px]">
            <Search size={15} className="text-fg-muted" aria-hidden="true" />
            <span className="sr-only">Search data sources</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name"
              className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-muted"
            />
          </label>
          <div role="group" aria-label="Filter by type" className="flex flex-wrap gap-1">
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
                {k ? `${DATA_SOURCE_LABEL[k]}${counts[k] ? ` · ${counts[k]}` : ''}` : 'All'}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <IconButton size="sm" variant="ghost" aria-label="Refresh" title="Refresh" onClick={() => void sources.refetch()}>
            <RefreshCw size={16} aria-hidden="true" className={sources.isFetching ? 'animate-spin motion-reduce:animate-none' : undefined} />
          </IconButton>
        </div>

        {sources.isPending ? (
          <p className="m-0 px-[18px] py-10 text-fg-muted">Loading data sources…</p>
        ) : sources.isError ? (
          <QueryError error={sources.error} onRetry={() => void sources.refetch()} />
        ) : visible.length === 0 ? (
          <p className="m-0 px-[18px] py-12 text-center text-fg-muted">
            {sources.data.length ? 'No data sources match.' : 'No data sources yet.'}
          </p>
        ) : (
          <ul aria-label="Data sources" className="m-0 list-none p-0">
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
                      {DATA_SOURCE_LABEL[source.kind]}
                      {source.detail ? ` · ${source.detail}` : ''}
                    </span>
                  </span>
                  {source.downloadUrl && (
                    <a
                      href={source.downloadUrl}
                      download
                      aria-label={`Export ${source.id}`}
                      title="Export"
                      className="grid size-9 place-items-center rounded-control text-fg-soft hover:bg-accent-soft hover:text-fg"
                    >
                      <Download size={16} aria-hidden="true" />
                    </a>
                  )}
                  <IconButton
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${source.id}`}
                    title="Delete"
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

      <Dialog
        open={deleting !== null}
        onClose={() => !remove.isPending && setDeleting(null)}
        title={`Delete "${deleting?.id ?? ''}"?`}
        description={
          deleting?.kind === 'jdbc'
            ? 'Reports, models and schedules that use this connection will stop working.'
            : 'Reports and analyses built on it will stop working. Export it first if you may need it again.'
        }
        actions={
          <>
            <Button size="sm" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button size="sm" variant="danger" onClick={() => deleting && remove.mutate(deleting)}>
              Delete
            </Button>
          </>
        }
      />
    </div>
  );
}
