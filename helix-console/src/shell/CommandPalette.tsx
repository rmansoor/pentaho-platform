import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { PanelLeft, Search, Star, Trash2 } from 'lucide-react';
import { cn } from '@helix/ui';
import { usePickList } from '../api/pick-lists';
import { useSession } from '../api/repo-context';
import { useLayoutStore } from './layout-store';
import { NAV_ITEMS } from './nav-items';
import { t } from '../i18n';

interface Command {
  id: string;
  label: string;
  group: string;
  icon: ReactNode;
  keywords?: string;
  run: () => void;
}

/** Ctrl/Cmd+K: jump to an area, a favorite, or run a shell command, by typing. */
export function CommandPalette() {
  const open = useLayoutStore((s) => s.paletteOpen);
  const setOpen = useLayoutStore((s) => s.setPaletteOpen);
  const toggleRail = useLayoutStore((s) => s.toggleRail);
  const navigate = useNavigate();
  const favorites = usePickList('favorites');
  const session = useSession();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setQuery('');
      setActive(0);
      dialog.showModal();
      // The input mounts before the dialog opens, so autoFocus alone can miss; focus it now.
      inputRef.current?.focus();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (to: string, search?: Record<string, string>) => () => void navigate({ to, search } as never);
    const areas = NAV_ITEMS.filter((n) => n.to !== '/admin' || session.data?.isAdministrator !== false).map((n) => ({
      id: `go:${n.to}`,
      label: t('shell.palette.goTo', { area: t(n.label) }),
      group: t('shell.areas'),
      icon: <n.icon size={16} aria-hidden="true" />,
      run: go(n.to),
    }));
    const favs = (favorites.data ?? []).map((f) => ({
      id: `fav:${f.fullPath}`,
      label: f.title,
      group: t('shell.palette.favorites'),
      keywords: f.fullPath,
      icon: <Star size={16} aria-hidden="true" />,
      run: f.kind === 'folder' ? go('/files', { path: f.fullPath }) : go('/view', { path: f.fullPath, title: f.title }),
    }));
    return [
      ...areas,
      { id: 'go:trash', label: t('shell.palette.goToTrash'), group: t('shell.areas'), icon: <Trash2 size={16} aria-hidden="true" />, run: go('/files/trash') },
      ...favs,
      { id: 'rail', label: t('shell.palette.toggleRail'), group: t('shell.palette.view'), keywords: 'sidebar rail', icon: <PanelLeft size={16} aria-hidden="true" />, run: toggleRail },
    ];
  }, [favorites.data, session.data, navigate, toggleRail]);

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return commands.filter((c) => words.every((w) => `${c.label} ${c.keywords ?? ''} ${c.group}`.toLowerCase().includes(w)));
  }, [commands, query]);

  const choose = (command: Command | undefined) => {
    if (!command) return;
    setOpen(false);
    command.run();
  };

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, results.length - 1));
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0));
    else if (e.key === 'Enter') choose(results[active]);
    else return;
    e.preventDefault();
  }

  let lastGroup = '';
  return (
    <dialog
      ref={dialogRef}
      aria-label={t('shell.palette.label')}
      onCancel={(e) => {
        e.preventDefault();
        setOpen(false);
      }}
      onClick={(e) => e.target === dialogRef.current && setOpen(false)}
      className="mx-auto mt-[12vh] w-[min(560px,calc(100vw-32px))] rounded-card border-0 bg-surface p-0 text-fg shadow-overlay backdrop:bg-[rgb(15_18_48/0.45)]"
    >
      {open && (
        <div className="flex flex-col">
          <div className="flex items-center gap-2.5 border-b border-divider px-4">
            <Search size={17} className="text-fg-muted" aria-hidden="true" />
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
              aria-label={t('shell.palette.search')}
              placeholder={t('shell.palette.placeholder')}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              className="h-14 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-muted"
            />
            <kbd className="font-mono text-[11px] text-fg-muted">Esc</kbd>
          </div>
          <ul id={listId} role="listbox" aria-label={t('shell.palette.commands')} className="m-0 max-h-[50vh] list-none overflow-y-auto p-1.5">
            {results.length === 0 && <li className="px-3 py-6 text-center text-fg-muted">{t('shell.palette.empty')}</li>}
            {results.map((command, index) => {
              const header = command.group !== lastGroup ? command.group : null;
              lastGroup = command.group;
              return (
                <li key={command.id} role="presentation">
                  {header && <div className="px-3 pt-2.5 pb-1 text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">{header}</div>}
                  <div
                    id={`${listId}-${command.id}`}
                    role="option"
                    aria-selected={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(command)}
                    className={cn(
                      'flex h-10 cursor-pointer items-center gap-3 rounded-[8px] px-3',
                      index === active ? 'bg-accent-soft text-fg' : 'text-fg-soft',
                    )}
                  >
                    <span className="text-fg-muted">{command.icon}</span>
                    <span className="truncate">{command.label}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </dialog>
  );
}
