import { useMemo, useState } from 'react';
import { RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { Button, Dialog, IconButton, toast } from '@helix/ui';
import { useTrash } from '../../api/repo-context';
import { OVERWRITE_MODE, type OverwriteMode, type RepoItem } from '../../api/repo';
import { TRASH_COLUMNS } from './columns';
import { FilesLayout, SelectionCount } from './FilesLayout';
import { FileTable, FileTableSkeleton, type Selection } from './FileTable';
import { TRASH_NODE } from './FolderTree';
import { QueryError } from './QueryError';
import { nextSort, sortItems, type Sort } from './sorting';
import { useTrashActions } from './use-trash-actions';
import { t } from '../../i18n';

export interface TrashPageProps {
  onOpenFolder: (path: string) => void;
}

const NO_SELECTION: Selection = { selected: new Set(), anchor: null };

type Pending =
  | { kind: 'delete'; items: RepoItem[] }
  | { kind: 'empty'; items: RepoItem[] }
  | { kind: 'home-available'; items: RepoItem[] }
  | { kind: 'home-conflict'; items: RepoItem[] };

/** Deleted files: restore them, delete them permanently, or empty the trash. */
export function TrashPage({ onOpenFolder }: TrashPageProps) {
  const trash = useTrash();
  const { restore, deletePermanently } = useTrashActions();
  const [sort, setSort] = useState<Sort>({ key: 'deleted', dir: 'desc' });
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);
  const [pending, setPending] = useState<Pending | null>(null);

  const items = useMemo(() => (trash.data ? sortItems(trash.data, sort, TRASH_COLUMNS) : []), [trash.data, sort]);
  const selectedItems = items.filter((i) => selection.selected.has(i.id));
  const clear = () => setSelection(NO_SELECTION);

  function startRestore(toRestore: RepoItem[]) {
    if (!toRestore.length) return;
    restore.mutate(
      { items: toRestore },
      {
        onSuccess: (outcome) => {
          if (outcome === 'restored') {
            clear();
            const first = toRestore[0]!;
            toast(t('files.actions.restored', { count: toRestore.length, name: first.title }), {
              action: first.originalFolder
                ? { label: t('files.show'), onClick: () => onOpenFolder(first.originalFolder!) }
                : undefined,
            });
          } else {
            setPending({ kind: outcome, items: toRestore });
          }
        },
      },
    );
  }

  function restoreHome(mode: OverwriteMode) {
    if (!pending) return;
    const toRestore = pending.items;
    restore.mutate(
      { items: toRestore, mode },
      {
        onSuccess: () => {
          setPending(null);
          clear();
          toast(t('files.actions.restoredHome', { count: toRestore.length }));
        },
      },
    );
  }

  function confirmDelete() {
    if (!pending) return;
    deletePermanently.mutate(pending.items, {
      onSuccess: () => {
        setPending(null);
        clear();
      },
    });
  }

  const working = restore.isPending || deletePermanently.isPending;
  const closeDialog = () => !working && setPending(null);

  return (
    <FilesLayout
      eyebrow={<p className="m-0 text-[13px] text-fg-muted">{t('files.title')}</p>}
      title={t('files.trash')}
      treePath={TRASH_NODE}
      onOpenFolder={onOpenFolder}
      onOpenTrash={() => {}}
      busy={trash.isPending}
      toolbar={
        <>
          <SelectionCount selected={selectedItems.length} total={trash.data?.length} />
          <div className="flex-1" />
          <IconButton size="sm" variant="ghost" aria-label={t('common.refresh')} title={t('common.refresh')} onClick={() => void trash.refetch()}>
            <RefreshCw size={16} aria-hidden="true" />
          </IconButton>
          <Button
            size="sm"
            variant="primary"
            icon={<RotateCcw size={15} aria-hidden="true" />}
            aria-disabled={!selectedItems.length || working}
            title={selectedItems.length ? undefined : t('files.trashPage.restoreReason')}
            onClick={() => !working && startRestore(selectedItems)}
            className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          >
            {t('files.trashPage.restore')}
          </Button>
          <Button
            size="sm"
            variant="danger-outline"
            icon={<Trash2 size={15} aria-hidden="true" />}
            aria-disabled={!selectedItems.length || working}
            title={selectedItems.length ? undefined : t('files.trashPage.deleteReason')}
            onClick={() => selectedItems.length && !working && setPending({ kind: 'delete', items: selectedItems })}
            className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          >
            {t('files.trashPage.deletePermanently')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-disabled={!items.length || working}
            title={items.length ? undefined : t('files.trashPage.emptyReason')}
            onClick={() => items.length && !working && setPending({ kind: 'empty', items })}
            className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          >
            {t('files.trashPage.emptyTrash')}
          </Button>
        </>
      }
    >
      {trash.isPending ? (
        <FileTableSkeleton />
      ) : trash.isError ? (
        <QueryError error={trash.error} onRetry={() => void trash.refetch()} />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-[18px] py-14 text-center">
          <Trash2 size={28} className="text-fg-muted" aria-hidden="true" />
          <p className="m-0 font-bold">{t('files.trashPage.empty')}</p>
          <p className="m-0 text-fg-muted">{t('files.trashPage.emptyHint')}</p>
        </div>
      ) : (
        <FileTable
          label={t('files.trashPage.items')}
          columns={TRASH_COLUMNS}
          items={items}
          sort={sort}
          onSort={(column) => setSort((s) => nextSort(s, column))}
          selection={selection}
          onSelectionChange={setSelection}
          onOpen={(item) => startRestore([item])}
          onDelete={() => selectedItems.length && setPending({ kind: 'delete', items: selectedItems })}
        />
      )}

      <Dialog
        open={pending?.kind === 'delete' || pending?.kind === 'empty'}
        onClose={closeDialog}
        dismissible={!working}
        title={pending?.kind === 'empty' ? t('files.trashPage.emptyTitle') : t('files.trashPage.deleteTitle', { count: pending?.items.length ?? 0 })}
        description={
          pending?.kind === 'empty'
            ? t('files.trashPage.emptyDescription', { count: pending.items.length })
            : t('files.trashPage.deleteDescription')
        }
        actions={
          <>
            <Button size="sm" onClick={closeDialog} aria-disabled={working}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" variant="danger" onClick={confirmDelete} aria-disabled={working}>
              {pending?.kind === 'empty' ? t('files.trashPage.emptyTrash') : t('files.trashPage.deletePermanently')}
            </Button>
          </>
        }
      />

      <Dialog
        open={pending?.kind === 'home-available'}
        onClose={closeDialog}
        dismissible={!working}
        title={t('files.trashPage.homeTitle')}
        description={t('files.trashPage.homeDescription')}
        actions={
          <>
            <Button size="sm" onClick={closeDialog}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" variant="primary" onClick={() => restoreHome(OVERWRITE_MODE.keepBoth)} aria-disabled={working}>
              {t('files.trashPage.restoreHome')}
            </Button>
          </>
        }
      />

      <Dialog
        open={pending?.kind === 'home-conflict'}
        onClose={closeDialog}
        dismissible={!working}
        title={t('files.trashPage.conflictTitle')}
        description={t('files.trashPage.conflictDescription')}
        actions={
          <>
            <Button size="sm" onClick={closeDialog}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" onClick={() => restoreHome(OVERWRITE_MODE.skip)} aria-disabled={working}>
              {t('files.trashPage.skip')}
            </Button>
            <Button size="sm" onClick={() => restoreHome(OVERWRITE_MODE.replace)} aria-disabled={working}>
              {t('files.trashPage.replace')}
            </Button>
            <Button size="sm" variant="primary" onClick={() => restoreHome(OVERWRITE_MODE.keepBoth)} aria-disabled={working}>
              {t('files.trashPage.keepBoth')}
            </Button>
          </>
        }
      />
    </FilesLayout>
  );
}
