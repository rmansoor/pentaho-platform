import { useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@helix/ui';
import type { RepoItem } from '../../api/repo';
import type { Column, Sort } from './sorting';

export interface Selection {
  selected: ReadonlySet<string>;
  anchor: string | null;
}

export interface FileTableProps {
  label: string;
  columns: readonly Column[];
  items: RepoItem[];
  sort: Sort;
  onSort: (column: Column) => void;
  selection: Selection;
  /** Called with the new selection (item ids) after a click or key press. */
  onSelectionChange: (selection: { selected: Set<string>; anchor: string | null }) => void;
  onOpen?: (item: RepoItem) => void;
  /** Delete key on a selected row. */
  onDelete?: () => void;
}

/**
 * Sortable item grid. Click selects; Ctrl/Cmd+click toggles; Shift+click selects a range.
 * Arrow keys move, Space toggles, Enter or double-click opens, Delete removes.
 */
export function FileTable({
  label,
  columns,
  items,
  sort,
  onSort,
  selection,
  onSelectionChange,
  onOpen,
  onDelete,
}: FileTableProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const { selected, anchor } = selection;
  const template = { gridTemplateColumns: columns.map((c) => c.track).join(' ') };
  const select = (ids: Iterable<string>, nextAnchor: string | null) =>
    onSelectionChange({ selected: new Set(ids), anchor: nextAnchor });

  function range(toId: string): string[] {
    const from = anchor ? items.findIndex((i) => i.id === anchor) : -1;
    const to = items.findIndex((i) => i.id === toId);
    if (from < 0) return [toId];
    const [lo, hi] = from < to ? [from, to] : [to, from];
    return items.slice(lo, hi + 1).map((i) => i.id);
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    select(next, id);
  }

  function onRowClick(e: MouseEvent, item: RepoItem) {
    if (e.shiftKey) select(range(item.id), anchor ?? item.id);
    else if (e.metaKey || e.ctrlKey) toggle(item.id);
    else select([item.id], item.id);
  }

  function focusRow(index: number) {
    const rows = bodyRef.current?.querySelectorAll<HTMLElement>('[role="row"]');
    rows?.item(Math.max(0, Math.min(index, rows.length - 1)))?.focus();
  }

  function onRowKeyDown(e: KeyboardEvent, item: RepoItem, index: number) {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End': {
        const nextIndex =
          e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : index + (e.key === 'ArrowDown' ? 1 : -1);
        const next = items[nextIndex];
        if (!next) return;
        if (e.shiftKey) select(range(next.id), anchor ?? item.id);
        else select([next.id], next.id);
        focusRow(nextIndex);
        break;
      }
      case ' ':
        toggle(item.id);
        break;
      case 'Enter':
        onOpen?.(item);
        break;
      case 'Delete':
      case 'Backspace':
        if (!onDelete) return;
        if (!selected.has(item.id)) select([item.id], item.id);
        onDelete();
        break;
      case 'a':
        if (!(e.metaKey || e.ctrlKey)) return;
        select(
          items.map((i) => i.id),
          anchor,
        );
        break;
      case 'Escape':
        select([], null);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  // One tab stop: the anchor row, else the first.
  const tabStop = items.some((i) => i.id === anchor) ? anchor : items[0]?.id;

  return (
    <div role="grid" aria-label={label} aria-multiselectable="true" aria-rowcount={items.length + 1} className="min-w-[560px]">
      <div role="rowgroup">
        <div role="row" aria-rowindex={1} className="grid gap-3 px-[18px] py-2.5" style={template}>
          {columns.map((col) => {
            const active = sort.key === col.key;
            return (
              <div
                key={col.key}
                role="columnheader"
                aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                className={cn(col.align === 'end' && 'text-right')}
              >
                <button
                  type="button"
                  onClick={() => onSort(col)}
                  className={cn(
                    '-mx-1 inline-flex items-center gap-1 rounded-[6px] px-1 py-0.5 text-[12.5px] font-semibold',
                    active ? 'text-fg' : 'text-fg-muted hover:text-fg',
                  )}
                >
                  {col.label}
                  {active &&
                    (sort.dir === 'asc' ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />)}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div role="rowgroup" ref={bodyRef}>
        {items.map((item, index) => {
          const isSelected = selected.has(item.id);
          return (
            <div
              key={item.id}
              role="row"
              aria-rowindex={index + 2}
              aria-selected={isSelected}
              tabIndex={item.id === tabStop ? 0 : -1}
              onClick={(e) => onRowClick(e, item)}
              onDoubleClick={() => onOpen?.(item)}
              onKeyDown={(e) => onRowKeyDown(e, item, index)}
              style={template}
              className={cn(
                'group/row grid cursor-default items-center gap-3 border-t border-divider px-[18px] py-2.5 select-none',
                'focus-visible:-outline-offset-2',
                isSelected ? 'bg-accent-soft' : 'hover:bg-bg',
              )}
            >
              {columns.map((col) => (
                <div key={col.key} role="gridcell" className={cn('flex min-w-0', col.align === 'end' && 'justify-end')}>
                  {col.render(item)}
                </div>
              ))}
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
        <div
          key={i}
          className="grid grid-cols-[minmax(0,2.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.6fr)] items-center gap-3 border-t border-divider px-[18px] py-2.5"
        >
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
