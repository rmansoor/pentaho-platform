import { useMemo, useState, type DragEvent } from 'react';
import { CalendarPlus, Ellipsis, FolderOpen, Info, RefreshCw, Share2, Star, Trash2 } from 'lucide-react';
import { Button, IconButton, Menu } from '@helix/ui';
import { useFolder, useSchedulableExtensions } from '../../api/repo-context';
import { extensionOfPath } from '../../api/repo';
import { ScheduleSheet } from '../schedules/ScheduleSheet';
import { UploadDialog } from './UploadDialog';
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
import { t } from '../../i18n';

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
  const [dropped, setDropped] = useState<File[] | null>(null);
  const [dragOver, setDragOver] = useState(false);

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

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

  return (
    <div
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length) setDropped(Array.from(e.dataTransfer.files));
      }}
      className={dragOver ? 'rounded-card outline-2 outline-dashed outline-accent outline-offset-4' : undefined}
    >
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
          secondary={{ label: t('files.goToPublic'), onClick: () => onNavigate(DEFAULT_FOLDER) }}
        />
      ) : items.length === 0 ? (
        <p className="m-0 px-[18px] py-12 text-center text-fg-muted">{t('files.empty')}</p>
      ) : (
        <FileTable
          label={t('files.filesIn', { folder: title })}
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
      <UploadDialog open={dropped !== null} folder={path} initialFiles={dropped ?? undefined} onClose={() => setDropped(null)} />
    </FilesLayout>
    </div>
  );
}

function Breadcrumb({ path, folderTitle, onNavigate }: { path: string; folderTitle?: string; onNavigate: (path: string) => void }) {
  const crumbs = ancestorsOf(path);
  return (
    <nav aria-label={t('files.breadcrumb')}>
      <ol className="m-0 flex list-none flex-wrap items-center gap-1 p-0 text-[13px] text-fg-muted">
        <li>{t('files.title')}</li>
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
    ? t('files.reasons.scheduleSelect')
    : single.folder
      ? t('files.reasons.scheduleFolder')
      : canSchedule
        ? undefined
        : t('files.reasons.scheduleType');
  const openReason = !single ? t('files.reasons.open') : undefined;

  return (
    <>
      <SelectionCount selected={selected.length} total={total} />
      <div className="flex-1" />
      <IconButton size="sm" variant="ghost" aria-label={t('common.refresh')} title={t('common.refresh')} onClick={onRefresh}>
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
        {t('files.open')}
      </Button>
      <Button
        size="sm"
        icon={<Share2 size={15} aria-hidden="true" />}
        aria-disabled={!single}
        title={single ? undefined : t('files.reasons.share')}
        onClick={() => single && onProperties(single, 'sharing')}
        className={disabledLook}
      >
        {t('files.share')}
      </Button>
      <Button
        size="sm"
        icon={<CalendarPlus size={15} aria-hidden="true" />}
        aria-disabled={!canSchedule}
        title={scheduleReason}
        onClick={() => canSchedule && single && onSchedule(single)}
        className={disabledLook}
      >
        {t('files.schedule')}
      </Button>
      <Menu
        items={[
          {
            label: t('files.properties'),
            icon: <Info size={15} aria-hidden="true" />,
            onSelect: () => single && onProperties(single, 'general'),
            disabled: !single,
            reason: t('files.reasons.properties'),
          },
          {
            label: isFavorite ? t('files.removeFavorite') : t('files.addFavorite'),
            icon: <Star size={15} aria-hidden="true" />,
            onSelect: () => single && toggleFavorite.mutate({ path: single.path, title: single.title, kind: single.kind }),
            disabled: !single,
            reason: t('files.reasons.favorite'),
          },
          {
            label: t('files.moveToTrash', { count: selected.length }),
            icon: <Trash2 size={15} aria-hidden="true" />,
            onSelect: onTrash,
            disabled: selected.length === 0,
            reason: t('files.reasons.trash'),
            tone: 'danger',
          },
        ]}
        trigger={(props) => (
          <IconButton size="sm" aria-label={t('files.moreActions')} title={t('files.moreActions')} {...props}>
            <Ellipsis size={16} aria-hidden="true" />
          </IconButton>
        )}
      />
    </>
  );
}

