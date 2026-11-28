import type { ReactNode } from 'react';
import type { RepoItem } from '../../api/repo';

export type SortDir = 'asc' | 'desc';

export interface Sort {
  key: string;
  dir: SortDir;
}

/** One table column: how it renders, how it sorts, and how wide it is. */
export interface Column {
  key: string;
  label: string;
  /** CSS grid track, e.g. "minmax(0,1fr)". */
  track: string;
  align?: 'start' | 'end';
  render: (item: RepoItem) => ReactNode;
  compare: (a: RepoItem, b: RepoItem) => number;
  /** Direction of the first click; dates and sizes read best newest/largest first. */
  firstDir?: SortDir;
}

export const DEFAULT_SORT: Sort = { key: 'name', dir: 'asc' };

export const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const byTitle = (a: RepoItem, b: RepoItem) => collator.compare(a.title, b.title);

/** Folders first (as in the GWT console), then by the chosen column; name breaks ties. */
export function sortItems(items: readonly RepoItem[], sort: Sort, columns: readonly Column[]): RepoItem[] {
  const column = columns.find((c) => c.key === sort.key);
  const compare = column?.compare ?? byTitle;
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    if (a.folder !== b.folder) return a.folder ? -1 : 1;
    return dir * compare(a, b) || byTitle(a, b);
  });
}

export function nextSort(current: Sort, column: Column): Sort {
  if (current.key === column.key) return { key: column.key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { key: column.key, dir: column.firstDir ?? 'asc' };
}

/** Folders by name, for the tree. */
export function sortByName(items: readonly RepoItem[]): RepoItem[] {
  return sortItems(items, DEFAULT_SORT, []);
}
