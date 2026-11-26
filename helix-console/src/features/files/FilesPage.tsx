import { useMemo, useState } from 'react';
import { CalendarPlus, Ellipsis, FolderOpen, Info, RefreshCw, Share2, Star, Trash2 } from 'lucide-react';
import { Button, IconButton, Menu } from '@helix/ui';
import { useFolder, useSchedulableExtensions } from '../../api/repo-context';
import { extensionOfPath } from '../../api/repo';
import { ScheduleSheet } from '../schedules/ScheduleSheet';
import { usePickList, useToggleFavorite } from '../../api/pick-lists';
import type { RepoItem } from '../../api/repo';
import { FILE_COLUMNS } from './columns';
import { FilesLayout, SelectionCount } from './FilesLayout';
import { FileTable, FileTableSkeleton, type Selection } from './FileTable';
import { ancestorsOf, DEFAULT_FOLDER, lastSegment, rootLabel } from './paths';
import { PropertiesSheet, type PropertiesTab } from './PropertiesSheet';
import { QueryError } from './QueryError';
import { DEFAULT_SORT, nextSort, sortItems, type Sort } from './sorting';
import { useTrashActions } from './use-trash-actions';

export interface FilesPageProps {
  path: string;
  onNavigate: (path: string) => void;
  onOpenTrash: () => void;
  onOpenFile: (path: string, title: string) => void;
}

const NO_SELECTION: Selection = { selected: new Set(), anchor: null };

/** Files area: folder tree, sortable file table and a selection toolbar (Atlas, Helix Files mockup). */
export function FilesPage({ path, onNavigate, onOpenTrash, onOpenFile }: FilesPageProps) {
  const folder = useFolder(path);
  const { moveToTrash } = useTrashActions();
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [selection, setSelection] = useState<Selection & { path: string }>({ path, ...NO_SELECTION });
  const [properties, setProperties] = useState<{ item: RepoItem; tab: PropertiesTab } | null>(null);
  const [scheduling, setScheduling] = useState<RepoItem | null>(null);

  // Selection belongs to one folder; moving to another clears it.
  const current = selection.path === path ? selection : NO_SELECTION;
  const items = useMemo(() => (folder.data ? sortItems(folder.data.children, sort, FILE_COLUMNS) : []), [folder.data, sort]);
  const selectedItems = items.filter((i) => current.selected.has(i.id));
  const title = rootLabel(path) ?? folder.data?.folder.title ?? lastSegment(path);

  function open(item: RepoItem) {
    if (item.folder) onNavigate(item.path);
    else onOpenFile(item.path, item.title);
  }

  function trash(itemsToTrash: RepoItem[]) {
    if (!itemsToTrash.length) return;
    moveToTrash.mutate(itemsToTrash, { onSuccess: () => setSelection({ path, ...NO_SELECTION }) });
  }

  return (
    <FilesLayout
      eyebrow={<Breadcrumb path={path} folderTitle={folder.data?.folder.title} onNavigate={onNavigate} />}
      title={title}
      treePath={path}
      onOpenFolder={onNavigate}
      onOpenTrash={onOpenTrash}
      busy={folder.isPending}
      toolbar={
        <Toolbar
          selected={selectedItems}
          total={folder.data?.children.length}
          refreshing={folder.isFetching && !folder.isPending}
          onRefresh={() => void folder.refetch()}
          onOpen={open}
          onTrash={() => trash(selectedItems)}
          onProperties={(item, tab) => setProperties({ item, tab })}
          onSchedule={(item) => setScheduling(item)}
        />
      }
    >
      {folder.isPending ? (
        <FileTableSkeleton />
      ) : folder.isError ? (
        <QueryError
          error={folder.error}
          onRetry={() => void folder.refetch()}
          secondary={{ label: 'Go to Public', onClick: () => onNavigate(DEFAULT_FOLDER) }}
        />
      ) : items.length === 0 ? (
        <p className="m-0 px-[18px] py-12 text-center text-fg-muted">This folder is empty.</p>
      ) : (
        <FileTable
          label={`Files in ${title}`}
          columns={FILE_COLUMNS}
          items={items}
          sort={sort}
          onSort={(column) => setSort((s) => nextSort(s, column))}
          selection={current}
          onSelectionChange={(next) => setSelection({ path, ...next })}
          onOpen={open}
          onDelete={() => trash(selectedItems.length ? selectedItems : [])}
        />
      )}
      <PropertiesSheet item={properties?.item ?? null} initialTab={properties?.tab} onClose={() => setProperties(null)} />
      <ScheduleSheet target={scheduling ? { kind: 'new', file: scheduling.path, title: scheduling.title } : null} onClose={() => setScheduling(null)} />
    </FilesLayout>
  );
}

function Breadcrumb({ path, folderTitle, onNavigate }: { path: string; folderTitle?: string; onNavigate: (path: string) => void }) {
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

const disabledLook = 'aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

function Toolbar({
  selected,
  total,
  refreshing,
  onRefresh,
  onOpen,
  onTrash,
  onProperties,
  onSchedule,
}: {
  selected: RepoItem[];
  total?: number;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (item: RepoItem) => void;
  onTrash: () => void;
  onProperties: (item: RepoItem, tab: PropertiesTab) => void;
  onSchedule: (item: RepoItem) => void;
}) {
  const single = selected.length === 1 ? selected[0] : undefined;
  const canOpen = !!single;
  const favorites = usePickList('favorites');
  const toggleFavorite = useToggleFavorite();
  const isFavorite = !!single && !!favorites.data?.some((f) => f.fullPath === single.path);
  const schedulable = useSchedulableExtensions();
  const canSchedule = !!single && !single.folder && !!schedulable.data?.includes(extensionOfPath(single.path));
  const scheduleReason = !single
    ? 'Select one report or transformation to schedule it'
    : single.folder
      ? "Folders can't be scheduled"
      : canSchedule
        ? undefined
        : "This type of file can't be scheduled";
  const openReason = !single ? 'Select one item to open it' : undefined;

  return (
    <>
      <SelectionCount selected={selected.length} total={total} />
      <div className="flex-1" />
      <IconButton size="sm" variant="ghost" aria-label="Refresh" title="Refresh" onClick={onRefresh}>
        <RefreshCw size={16} aria-hidden="true" className={refreshing ? 'animate-spin motion-reduce:animate-none' : undefined} />
      </IconButton>
      <Button
        size="sm"
        variant="primary"
        icon={<FolderOpen size={15} aria-hidden="true" />}
        aria-disabled={!canOpen}
        title={openReason}
        onClick={() => canOpen && single && onOpen(single)}
        className={disabledLook}
      >
        Open
      </Button>
      <Button
        size="sm"
        icon={<Share2 size={15} aria-hidden="true" />}
        aria-disabled={!single}
        title={single ? undefined : 'Select one item to share it'}
        onClick={() => single && onProperties(single, 'sharing')}
        className={disabledLook}
      >
        Share
      </Button>
      <Button
        size="sm"
        icon={<CalendarPlus size={15} aria-hidden="true" />}
        aria-disabled={!canSchedule}
        title={scheduleReason}
        onClick={() => canSchedule && single && onSchedule(single)}
        className={disabledLook}
      >
        Schedule
      </Button>
      <Menu
        items={[
          {
            label: 'Properties',
            icon: <Info size={15} aria-hidden="true" />,
            onSelect: () => single && onProperties(single, 'general'),
            disabled: !single,
            reason: 'Select one item to see its properties',
          },
          {
            label: isFavorite ? 'Remove from favorites' : 'Add to favorites',
            icon: <Star size={15} aria-hidden="true" />,
            onSelect: () => single && toggleFavorite.mutate({ path: single.path, title: single.title, kind: single.kind }),
            disabled: !single,
            reason: 'Select one item to add it to favorites',
          },
          {
            label: selected.length > 1 ? `Move ${selected.length} items to trash` : 'Move to trash',
            icon: <Trash2 size={15} aria-hidden="true" />,
            onSelect: onTrash,
            disabled: selected.length === 0,
            reason: 'Select items to move them to trash',
            tone: 'danger',
          },
        ]}
        trigger={(props) => (
          <IconButton size="sm" aria-label="More actions" title="More actions" {...props}>
            <Ellipsis size={16} aria-hidden="true" />
          </IconButton>
        )}
      />
    </>
  );
}

