import { useMemo, useState, type ReactNode } from 'react';
import { CalendarPlus, Ellipsis, FolderOpen, RefreshCw, Share2, Trash2 } from 'lucide-react';
import { Button, IconButton, Menu } from '@helix/ui';
import { useFolder } from '../../api/repo-context';
import type { RepoItem } from '../../api/repo';
import { FILE_COLUMNS } from './columns';
import { FilesLayout, SelectionCount } from './FilesLayout';
import { FileTable, FileTableSkeleton, type Selection } from './FileTable';
import { ancestorsOf, DEFAULT_FOLDER, lastSegment, rootLabel } from './paths';
import { QueryError } from './QueryError';
import { DEFAULT_SORT, nextSort, sortItems, type Sort } from './sorting';
import { useTrashActions } from './use-trash-actions';

export interface FilesPageProps {
  path: string;
  onNavigate: (path: string) => void;
  onOpenTrash: () => void;
}

const NO_SELECTION: Selection = { selected: new Set(), anchor: null };

/** Files area: folder tree, sortable file table and a selection toolbar (Atlas, Helix Files mockup). */
export function FilesPage({ path, onNavigate, onOpenTrash }: FilesPageProps) {
  const folder = useFolder(path);
  const { moveToTrash } = useTrashActions();
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [selection, setSelection] = useState<Selection & { path: string }>({ path, ...NO_SELECTION });

  // Selection belongs to one folder; moving to another clears it.
  const current = selection.path === path ? selection : NO_SELECTION;
  const items = useMemo(() => (folder.data ? sortItems(folder.data.children, sort, FILE_COLUMNS) : []), [folder.data, sort]);
  const selectedItems = items.filter((i) => current.selected.has(i.id));
  const title = rootLabel(path) ?? folder.data?.folder.title ?? lastSegment(path);

  function open(item: RepoItem) {
    if (item.folder) onNavigate(item.path);
    // Files open in the report viewer or a content tab, which are not built yet.
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

const NOT_YET = 'Coming with the next console milestone';
const disabledLook = 'aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

function Toolbar({
  selected,
  total,
  refreshing,
  onRefresh,
  onOpen,
  onTrash,
}: {
  selected: RepoItem[];
  total?: number;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (item: RepoItem) => void;
  onTrash: () => void;
}) {
  const single = selected.length === 1 ? selected[0] : undefined;
  const canOpen = single?.folder === true;
  const openReason = !single ? 'Select one item to open it' : canOpen ? undefined : 'Opening files arrives with the report viewer';

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
      <PendingAction label="Share" icon={<Share2 size={15} aria-hidden="true" />} />
      <PendingAction label="Schedule" icon={<CalendarPlus size={15} aria-hidden="true" />} />
      <Menu
        items={[
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

/** Shown so the layout matches the design; explains itself instead of silently doing nothing. */
function PendingAction({ label, icon }: { label: string; icon: ReactNode }) {
  return (
    <Button size="sm" icon={icon} aria-disabled="true" title={NOT_YET} className={disabledLook}>
      {label}
    </Button>
  );
}
