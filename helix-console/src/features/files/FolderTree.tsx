import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronRight, LoaderCircle } from 'lucide-react';
import { cn } from '@helix/ui';
import { useFolder } from '../../api/repo-context';
import { ancestorsOf, ROOT_FOLDERS } from './paths';
import { DEFAULT_SORT, sortItems } from './sorting';

export interface FolderTreeProps {
  /** The folder shown in the table. */
  currentPath: string;
  onSelect: (path: string) => void;
}

/**
 * Lazy folder tree following the ARIA tree pattern: one tab stop, arrow keys move between
 * visible items, Right/Left expand and collapse, Enter or Space opens the folder.
 * Children load when a node is first expanded and share the cache with the file table.
 */
export function FolderTree({ currentPath, onSelect }: FolderTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(ancestorsOf(currentPath)));
  const [focusPath, setFocusPath] = useState(currentPath);
  const treeRef = useRef<HTMLUListElement>(null);

  // Opening a folder (from the tree, table or breadcrumb) reveals it and its subfolders.
  useEffect(() => {
    setExpanded((prev) => {
      const missing = ancestorsOf(currentPath).filter((p) => !prev.has(p));
      return missing.length ? new Set([...prev, ...missing]) : prev;
    });
    setFocusPath(currentPath);
  }, [currentPath]);

  const setOpen = (path: string, open: boolean) =>
    setExpanded((prev) => {
      if (prev.has(path) === open) return prev;
      const next = new Set(prev);
      if (open) next.add(path);
      else next.delete(path);
      return next;
    });

  function visibleItems(): HTMLElement[] {
    return Array.from(treeRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []);
  }

  function focusItem(el: HTMLElement | undefined) {
    if (!el) return;
    setFocusPath(el.dataset.path ?? '');
    el.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    const target = e.target as HTMLElement;
    if (target.getAttribute('role') !== 'treeitem') return;
    const path = target.dataset.path ?? '';
    const items = visibleItems();
    const index = items.indexOf(target);
    const isOpen = target.getAttribute('aria-expanded') === 'true';
    const isBranch = target.hasAttribute('aria-expanded');

    switch (e.key) {
      case 'ArrowDown':
        focusItem(items[index + 1]);
        break;
      case 'ArrowUp':
        focusItem(items[index - 1]);
        break;
      case 'Home':
        focusItem(items[0]);
        break;
      case 'End':
        focusItem(items.at(-1));
        break;
      case 'ArrowRight':
        if (isBranch && !isOpen) setOpen(path, true);
        else if (isOpen) focusItem(items[index + 1]);
        break;
      case 'ArrowLeft':
        if (isOpen) setOpen(path, false);
        else focusItem(items.find((el) => el.dataset.path === target.dataset.parent));
        break;
      case 'Enter':
      case ' ':
        onSelect(path);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  return (
    <ul ref={treeRef} role="tree" aria-label="Folders" className="m-0 flex list-none flex-col gap-0.5 p-0" onKeyDown={onKeyDown}>
      {ROOT_FOLDERS.map((root) => (
        <TreeNode
          key={root.path}
          path={root.path}
          label={root.label}
          level={1}
          currentPath={currentPath}
          focusPath={focusPath}
          expanded={expanded}
          setOpen={setOpen}
          onSelect={onSelect}
          onFocusPath={setFocusPath}
        />
      ))}
    </ul>
  );
}

interface TreeNodeProps {
  path: string;
  label: string;
  level: number;
  parent?: string;
  currentPath: string;
  focusPath: string;
  expanded: Set<string>;
  setOpen: (path: string, open: boolean) => void;
  onSelect: (path: string) => void;
  onFocusPath: (path: string) => void;
}

function TreeNode(props: TreeNodeProps) {
  const { path, label, level, parent, currentPath, focusPath, expanded, setOpen, onSelect, onFocusPath } = props;
  const isOpen = expanded.has(path);
  const { data, isPending, isError } = useFolder(path, isOpen);
  const subfolders = data ? sortItems(data.children.filter((c) => c.folder), DEFAULT_SORT) : [];
  // Until loaded we don't know whether a folder has subfolders, so it stays expandable.
  const isLeaf = data !== undefined && subfolders.length === 0;
  const selected = path === currentPath;

  return (
    <li
      role="treeitem"
      aria-level={level}
      aria-selected={selected}
      aria-expanded={isLeaf ? undefined : isOpen}
      aria-busy={isOpen && isPending ? true : undefined}
      data-path={path}
      data-parent={parent}
      tabIndex={path === focusPath ? 0 : -1}
      onFocus={(e) => {
        if (e.target === e.currentTarget) onFocusPath(path);
      }}
      className="group/item outline-none"
    >
      <div
        onClick={() => onSelect(path)}
        style={{ paddingLeft: 4 + (level - 1) * 16 }}
        className={cn(
          'flex h-9 cursor-pointer items-center gap-1 rounded-[8px] pr-2.5',
          'group-focus-visible/item:outline-2 group-focus-visible/item:outline-focus',
          selected ? 'bg-accent-soft font-bold text-accent' : 'hover:bg-bg',
        )}
      >
        <span
          aria-hidden="true"
          onClick={(e) => {
            if (isLeaf) return;
            e.stopPropagation();
            setOpen(path, !isOpen);
          }}
          className={cn('grid size-6 shrink-0 place-items-center rounded-[6px]', !isLeaf && 'hover:bg-divider')}
        >
          {isOpen && isPending ? (
            <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" />
          ) : isLeaf ? null : (
            <ChevronRight size={14} className={cn('transition-transform motion-reduce:transition-none', isOpen && 'rotate-90')} />
          )}
        </span>
        <span className="truncate">{label}</span>
      </div>

      {isOpen && subfolders.length > 0 && (
        <ul role="group" className="m-0 flex list-none flex-col gap-0.5 p-0">
          {subfolders.map((child) => (
            <TreeNode
              key={child.path}
              {...props}
              path={child.path}
              label={child.title}
              level={level + 1}
              parent={path}
            />
          ))}
        </ul>
      )}
      {isOpen && isError && (
        <div style={{ paddingLeft: 32 + (level - 1) * 16 }} className="py-1 text-[12.5px] text-danger-fg">
          Couldn't load folders
        </div>
      )}
    </li>
  );
}
