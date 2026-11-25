import { KIND_LABEL, type RepoItem } from '../../api/repo';

export type SortKey = 'name' | 'kind' | 'modified' | 'size';
export type SortDir = 'asc' | 'desc';
export interface Sort {
  key: SortKey;
  dir: SortDir;
}

export const DEFAULT_SORT: Sort = { key: 'name', dir: 'asc' };

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function compareBy(key: SortKey, a: RepoItem, b: RepoItem): number {
  switch (key) {
    case 'name':
      return collator.compare(a.title, b.title);
    case 'kind':
      return collator.compare(KIND_LABEL[a.kind], KIND_LABEL[b.kind]);
    case 'modified':
      return (a.modified?.getTime() ?? 0) - (b.modified?.getTime() ?? 0);
    case 'size':
      return (a.size ?? -1) - (b.size ?? -1);
  }
}

/** Folders first (as in the GWT console), then by the chosen column; name breaks ties. */
export function sortItems(items: readonly RepoItem[], sort: Sort): RepoItem[] {
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    if (a.folder !== b.folder) return a.folder ? -1 : 1;
    return dir * compareBy(sort.key, a, b) || collator.compare(a.title, b.title);
  });
}

/** First click sorts ascending (dates and sizes newest/largest first); a second click flips. */
export function nextSort(current: Sort, key: SortKey): Sort {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: key === 'modified' || key === 'size' ? 'desc' : 'asc' };
}
