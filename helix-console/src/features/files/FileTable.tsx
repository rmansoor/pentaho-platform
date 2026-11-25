import { useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@helix/ui';
import { KIND_LABEL, type RepoItem } from '../../api/repo';
import { FileKindIcon } from './FileKindIcon';
import { formatDate, formatDateTime, formatSize } from './format';
import type { Sort, SortKey } from './sorting';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'kind', label: 'Type' },
  { key: 'modified', label: 'Modified' },
  { key: 'size', label: 'Size' },
];

const GRID_COLS = 'grid grid-cols-[minmax(0,2.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.6fr)] gap-3';

export interface FileTableProps {
  label: string;
  items: RepoItem[];
  sort: Sort;
  onSort: (key: SortKey) => void;
  selected: ReadonlySet<string>;
  /** Called with the new selection after a click or key press. */
  onSelectionChange: (paths: Set<string>, anchor: string | null) => void;
  anchor: string | null;
  onOpen: (item: RepoItem) => void;
}

/**
 * Sortable file grid. Click selects; Ctrl/Cmd+click toggles; Shift+click selects a range.
 * Arrow keys move, Space toggles, Enter or double-click opens.
 */
export function FileTable({ label, items, sort, onSort, selected, onSelectionChange, anchor, onOpen }: FileTableProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  function rangeSelection(toPath: string): Set<string> {
    const from = anchor ? items.findIndex((i) => i.path === anchor) : -1;
    const to = items.findIndex((i) => i.path === toPath);
    if (from < 0) return new Set([toPath]);
    const [lo, hi] = from < to ? [from, to] : [to, from];
    return new Set(items.slice(lo, hi + 1).map((i) => i.path));
  }

  function onRowClick(e: MouseEvent, item: RepoItem) {
    if (e.shiftKey) {
      onSelectionChange(rangeSelection(item.path), anchor ?? item.path);
    } else if (e.metaKey || e.ctrlKey) {
      const next = new Set(selected);
      if (next.has(item.path)) next.delete(item.path);
      else next.add(item.path);
      onSelectionChange(next, item.path);
    } else {
      onSelectionChange(new Set([item.path]), item.path);
    }
  }

  function focusRow(index: number) {
    const rows = bodyRef.current?.querySelectorAll<HTMLElement>('[role="row"]');
    rows?.item(Math.max(0, Math.min(index, rows.length - 1)))?.focus();
  }

  function onRowKeyDown(e: KeyboardEvent, item: RepoItem, index: number) {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        const nextIndex = index + (e.key === 'ArrowDown' ? 1 : -1);
        const next = items[nextIndex];
        if (!next) return;
        if (e.shiftKey) onSelectionChange(rangeSelection(next.path), anchor ?? item.path);
        else onSelectionChange(new Set([next.path]), next.path);
        focusRow(nextIndex);
        break;
      }
      case 'Home':
      case 'End': {
        const nextIndex = e.key === 'Home' ? 0 : items.length - 1;
        const next = items[nextIndex];
        if (!next) return;
        onSelectionChange(new Set([next.path]), next.path);
        focusRow(nextIndex);
        break;
      }
      case ' ': {
        const next = new Set(selected);
        if (next.has(item.path)) next.delete(item.path);
        else next.add(item.path);
        onSelectionChange(next, item.path);
        break;
      }
      case 'Enter':
        onOpen(item);
        break;
      case 'a':
        if (!(e.metaKey || e.ctrlKey)) return;
        onSelectionChange(new Set(items.map((i) => i.path)), anchor);
        break;
      case 'Escape':
        onSelectionChange(new Set(), null);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  // One tab stop: the anchor row, else the first.
  const tabStop = items.some((i) => i.path === anchor) ? anchor : items[0]?.path;

  return (
    <div role="grid" aria-label={label} aria-multiselectable="true" aria-rowcount={items.length + 1} className="min-w-[560px]">
      <div role="rowgroup">
        <div role="row" aria-rowindex={1} className={cn(GRID_COLS, 'px-[18px] py-2.5')}>
          {COLUMNS.map((col) => {
            const active = sort.key === col.key;
            return (
              <div
                key={col.key}
                role="columnheader"
                aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                className={cn(col.key === 'size' && 'text-right')}
              >
                <button
                  type="button"
                  onClick={() => onSort(col.key)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-[6px] px-1 py-0.5 -mx-1 text-[12.5px] font-semibold',
                    active ? 'text-fg' : 'text-fg-muted hover:text-fg',
                  )}
                >
                  {col.label}
                  {active &&
                    (sort.dir === 'asc' ? (
                      <ArrowUp size={13} aria-hidden="true" />
                    ) : (
                      <ArrowDown size={13} aria-hidden="true" />
                    ))}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div role="rowgroup" ref={bodyRef}>
        {items.map((item, index) => {
          const isSelected = selected.has(item.path);
          return (
            <div
              key={item.path}
              role="row"
              aria-rowindex={index + 2}
              aria-selected={isSelected}
              tabIndex={item.path === tabStop ? 0 : -1}
              onClick={(e) => onRowClick(e, item)}
              onDoubleClick={() => onOpen(item)}
              onKeyDown={(e) => onRowKeyDown(e, item, index)}
              className={cn(
                GRID_COLS,
                'group/row cursor-default items-center border-t border-divider px-[18px] py-2.5 select-none',
                'focus-visible:-outline-offset-2',
                isSelected ? 'bg-accent-soft' : 'hover:bg-bg',
              )}
            >
              <div role="gridcell" className="flex min-w-0 items-center gap-3">
                <FileKindIcon kind={item.kind} className="group-aria-selected/row:bg-surface" />
                <span className="truncate font-semibold" title={item.description ?? item.title}>
                  {item.title}
                </span>
              </div>
              <div role="gridcell" className="truncate text-fg-muted">
                {KIND_LABEL[item.kind]}
              </div>
              <div role="gridcell" className="truncate text-fg-muted" title={formatDateTime(item.modified)}>
                {formatDate(item.modified)}
              </div>
              <div role="gridcell" className="truncate text-right text-fg-muted tabular-nums">
                {item.folder ? '' : formatSize(item.size)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Placeholder rows while a folder loads. */
export function FileTableSkeleton() {
  return (
    <div aria-hidden="true" className="min-w-[560px]">
      <div className="h-[42px]" />
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className={cn(GRID_COLS, 'items-center border-t border-divider px-[18px] py-2.5')}>
          <div className="flex items-center gap-3">
            <span className="size-[30px] rounded-[9px] bg-divider" />
            <span className="h-3 rounded bg-divider" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
          </div>
          <span className="h-3 w-3/5 rounded bg-divider" />
          <span className="h-3 w-3/5 rounded bg-divider" />
          <span />
        </div>
      ))}
    </div>
  );
}
