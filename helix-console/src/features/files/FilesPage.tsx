import { useMemo, useState, type ReactNode } from 'react';
import { CalendarPlus, Ellipsis, FolderOpen, RefreshCw, Share2 } from 'lucide-react';
import { Button, Card, IconButton } from '@helix/ui';
import { ApiError, LOGIN_URL } from '../../api/http';
import { useFolder } from '../../api/repo-context';
import type { RepoItem } from '../../api/repo';
import { FileTable, FileTableSkeleton } from './FileTable';
import { FolderTree } from './FolderTree';
import { ancestorsOf, DEFAULT_FOLDER, lastSegment, rootLabel } from './paths';
import { DEFAULT_SORT, nextSort, sortItems, type Sort } from './sorting';

export interface FilesPageProps {
  path: string;
  onNavigate: (path: string) => void;
}

/** Files area: folder tree, sortable file table and a selection toolbar (Atlas, Helix Files mockup). */
export function FilesPage({ path, onNavigate }: FilesPageProps) {
  const folder = useFolder(path);
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [selection, setSelection] = useState<{ path: string; selected: Set<string>; anchor: string | null }>({
    path,
    selected: new Set(),
    anchor: null,
  });

  // Selection belongs to one folder; moving to another clears it.
  const current = selection.path === path ? selection : { path, selected: new Set<string>(), anchor: null };

  const items = useMemo(
    () => (folder.data ? sortItems(folder.data.children, sort) : []),
    [folder.data, sort],
  );
  const selectedItems = items.filter((i) => current.selected.has(i.path));
  const title = rootLabel(path) ?? folder.data?.folder.title ?? lastSegment(path);

  function open(item: RepoItem) {
    if (item.folder) onNavigate(item.path);
    // Files open in the report viewer or a content tab, which are not built yet.
  }

  return (
    <div className="flex flex-col gap-5 pt-1">
      <header className="min-w-0">
        <Breadcrumb path={path} folderTitle={folder.data?.folder.title} onNavigate={onNavigate} />
        <h1 className="m-0 mt-0.5 truncate text-[28px] font-extrabold tracking-[-0.02em]">{title}</h1>
      </header>

      <div className="flex flex-wrap items-start gap-5">
        <Card className="max-w-full flex-[1_1_220px] p-3 md:max-w-[260px]">
          <FolderTree currentPath={path} onSelect={onNavigate} />
        </Card>

        <Card className="min-w-0 flex-[999_1_460px] overflow-hidden">
          <Toolbar
            selected={selectedItems}
            total={folder.data?.children.length}
            refreshing={folder.isFetching && !folder.isPending}
            onRefresh={() => void folder.refetch()}
            onOpen={open}
          />
          <div className="overflow-x-auto" aria-busy={folder.isPending}>
            {folder.isPending ? (
              <FileTableSkeleton />
            ) : folder.isError ? (
              <FolderError error={folder.error} onRetry={() => void folder.refetch()} onGoHome={() => onNavigate(DEFAULT_FOLDER)} />
            ) : items.length === 0 ? (
              <p className="m-0 px-[18px] py-12 text-center text-fg-muted">This folder is empty.</p>
            ) : (
              <FileTable
                label={`Files in ${title}`}
                items={items}
                sort={sort}
                onSort={(key) => setSort((s) => nextSort(s, key))}
                selected={current.selected}
                anchor={current.anchor}
                onSelectionChange={(selected, anchor) => setSelection({ path, selected, anchor })}
                onOpen={open}
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Breadcrumb({
  path,
  folderTitle,
  onNavigate,
}: {
  path: string;
  folderTitle?: string;
  onNavigate: (path: string) => void;
}) {
  const crumbs = ancestorsOf(path);
  return (
    <nav aria-label="Breadcrumb">
      <ol className="m-0 flex list-none flex-wrap items-center gap-1 p-0 text-[13px] text-fg-muted">
        <li>Files</li>
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          const label = rootLabel(crumb) ?? (last && folderTitle ? folderTitle : lastSegment(crumb));
          return (
            <li key={crumb} className="flex items-center gap-1">
              <span aria-hidden="true">/</span>
              {last ? (
                <span aria-current="page">{label}</span>
              ) : (
                <a
                  href={`?path=${encodeURIComponent(crumb)}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(crumb);
                  }}
                  className="text-fg-muted no-underline hover:text-accent hover:underline"
                >
                  {label}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

const NOT_YET = 'Coming with the next console milestone';

function Toolbar({
  selected,
  total,
  refreshing,
  onRefresh,
  onOpen,
}: {
  selected: RepoItem[];
  total?: number;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (item: RepoItem) => void;
}) {
  const single = selected.length === 1 ? selected[0] : undefined;
  const canOpen = single?.folder === true;
  const openReason = !single
    ? 'Select one item to open it'
    : canOpen
      ? undefined
      : 'Opening files arrives with the report viewer';

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-divider px-[18px] py-3.5">
      <span className="font-bold" aria-live="polite">
        {selected.length > 0
          ? `${selected.length} selected`
          : total === undefined
            ? ''
            : `${total} ${total === 1 ? 'item' : 'items'}`}
      </span>
      <div className="flex-1" />
      <IconButton
        size="sm"
        variant="ghost"
        aria-label="Refresh"
        title="Refresh"
        onClick={onRefresh}
      >
        <RefreshCw size={16} aria-hidden="true" className={refreshing ? 'animate-spin motion-reduce:animate-none' : undefined} />
      </IconButton>
      <Button
        size="sm"
        variant="primary"
        icon={<FolderOpen size={15} aria-hidden="true" />}
        aria-disabled={!canOpen}
        title={openReason}
        onClick={() => canOpen && single && onOpen(single)}
        className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
      >
        Open
      </Button>
      <PendingAction label="Share" icon={<Share2 size={15} aria-hidden="true" />} />
      <PendingAction label="Schedule" icon={<CalendarPlus size={15} aria-hidden="true" />} />
      <IconButton
        size="sm"
        aria-label="More actions"
        aria-disabled="true"
        title={NOT_YET}
        className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
      >
        <Ellipsis size={16} aria-hidden="true" />
      </IconButton>
    </div>
  );
}

/** Shown so the layout matches the design; explains itself instead of silently doing nothing. */
function PendingAction({ label, icon }: { label: string; icon: ReactNode }) {
  return (
    <Button
      size="sm"
      icon={icon}
      aria-disabled="true"
      title={NOT_YET}
      className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
    >
      {label}
    </Button>
  );
}

function FolderError({ error, onRetry, onGoHome }: { error: Error; onRetry: () => void; onGoHome: () => void }) {
  const api = error instanceof ApiError ? error : undefined;
  if (api?.signedOut) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 px-[18px] py-12 text-center">
        <p className="m-0 font-bold">You're signed out</p>
        <p className="m-0 max-w-[48ch] text-fg-muted">Sign in to the Pentaho Server, then try again.</p>
        <div className="flex gap-2">
          <a
            href={LOGIN_URL}
            className="inline-flex h-9 items-center rounded-control bg-accent px-3.5 text-[13px] font-bold text-accent-ink no-underline hover:bg-accent-hover"
          >
            Sign in
          </a>
          <Button size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      </div>
    );
  }
  const [heading, detail] = api?.unreachable
    ? ["Couldn't reach the Pentaho Server", 'Check that the server is running, then try again.']
    : api && (api.status === 403 || api.status === 404)
      ? ["This folder isn't available", "It may have been moved or deleted, or you don't have access to it."]
      : ["Couldn't load this folder", error.message];
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-[18px] py-12 text-center">
      <p className="m-0 font-bold">{heading}</p>
      <p className="m-0 max-w-[48ch] text-fg-muted">{detail}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="primary" onClick={onRetry}>
          Try again
        </Button>
        <Button size="sm" onClick={onGoHome}>
          Go to Public
        </Button>
      </div>
    </div>
  );
}
