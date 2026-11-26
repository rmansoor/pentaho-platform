import { kindLabel, type RepoItem } from '../../api/repo';
import { FileKindIcon } from './FileKindIcon';
import { formatDate, formatDateTime, formatSize } from './format';
import { rootLabel } from './paths';
import { collator, type Column } from './sorting';
import { t } from '../../i18n';

const time = (d: Date | null | undefined) => d?.getTime() ?? 0;

export const nameColumn: Column = {
  key: 'name',
  get label() {
    return t('files.columns.name');
  },
  track: 'minmax(0,2.6fr)',
  compare: (a, b) => collator.compare(a.title, b.title),
  render: (item) => (
    <span className="flex min-w-0 items-center gap-3">
      <FileKindIcon kind={item.kind} className="group-aria-selected/row:bg-surface" />
      <span className="truncate font-semibold" title={item.description ?? item.title}>
        {item.title}
      </span>
    </span>
  ),
};

export const kindColumn: Column = {
  key: 'kind',
  get label() {
    return t('files.columns.type');
  },
  track: 'minmax(0,1fr)',
  compare: (a, b) => collator.compare(kindLabel(a.kind), kindLabel(b.kind)),
  render: (item) => <span className="truncate text-fg-muted">{kindLabel(item.kind)}</span>,
};

export const modifiedColumn: Column = {
  key: 'modified',
  get label() {
    return t('files.columns.modified');
  },
  track: 'minmax(0,1fr)',
  firstDir: 'desc',
  compare: (a, b) => time(a.modified) - time(b.modified),
  render: (item) => (
    <span className="truncate text-fg-muted" title={formatDateTime(item.modified)}>
      {formatDate(item.modified)}
    </span>
  ),
};

export const sizeColumn: Column = {
  key: 'size',
  get label() {
    return t('files.columns.size');
  },
  track: 'minmax(0,0.6fr)',
  align: 'end',
  firstDir: 'desc',
  compare: (a, b) => (a.size ?? -1) - (b.size ?? -1),
  render: (item) => <span className="truncate text-fg-muted tabular-nums">{item.folder ? '' : formatSize(item.size)}</span>,
};

/** "/public/Steel Wheels/Reports" shown as "Public / Steel Wheels / Reports". */
export function displayFolder(path: string | undefined): string {
  if (!path) return t('common.none');
  const parts = path.split('/').filter(Boolean);
  return parts.map((p, i) => (i === 0 ? (rootLabel(`/${p}`) ?? p) : p)).join(' / ');
}

export const originalFolderColumn: Column = {
  key: 'origin',
  get label() {
    return t('files.columns.originalLocation');
  },
  track: 'minmax(0,1.6fr)',
  compare: (a, b) => collator.compare(a.originalFolder ?? '', b.originalFolder ?? ''),
  render: (item) => (
    <span className="truncate text-fg-muted" title={item.originalFolder}>
      {displayFolder(item.originalFolder)}
    </span>
  ),
};

export const deletedColumn: Column = {
  key: 'deleted',
  get label() {
    return t('files.columns.deleted');
  },
  track: 'minmax(0,1fr)',
  firstDir: 'desc',
  compare: (a, b) => time(a.deleted) - time(b.deleted),
  render: (item) => (
    <span className="truncate text-fg-muted" title={formatDateTime(item.deleted ?? null)}>
      {formatDate(item.deleted ?? null)}
    </span>
  ),
};

export const FILE_COLUMNS: readonly Column[] = [nameColumn, kindColumn, modifiedColumn, sizeColumn];
export const TRASH_COLUMNS: readonly Column[] = [nameColumn, originalFolderColumn, deletedColumn, kindColumn];

export type { RepoItem };
