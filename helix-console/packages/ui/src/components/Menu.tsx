import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** Why it is disabled; shown as a tooltip. */
  reason?: string;
  tone?: 'default' | 'danger';
}

export interface MenuProps {
  /** Renders the trigger; spread the props onto a button. */
  trigger: (props: {
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
    'aria-controls': string;
    onClick: () => void;
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
    ref: (el: HTMLButtonElement | null) => void;
  }) => ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
}

/** Menu button (WAI-ARIA menu pattern): arrows move, Enter selects, Escape closes and returns focus. */
export function Menu({ trigger, items, align = 'end' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef<'first' | 'last'>('first');

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const enabled = menuItems();
    (focusOnOpen.current === 'first' ? enabled[0] : enabled.at(-1))?.focus();
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  function menuItems(): HTMLElement[] {
    return Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
  }

  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const list = menuItems();
    const index = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') list[(index + 1) % list.length]?.focus();
    else if (e.key === 'ArrowUp') list[(index - 1 + list.length) % list.length]?.focus();
    else if (e.key === 'Home') list[0]?.focus();
    else if (e.key === 'End') list.at(-1)?.focus();
    else if (e.key === 'Escape' || e.key === 'Tab') {
      close(e.key === 'Escape');
      if (e.key === 'Tab') return;
    } else return;
    e.preventDefault();
  }

  return (
    <div className="relative inline-flex">
      {trigger({
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': menuId,
        onClick: () => {
          focusOnOpen.current = 'first';
          setOpen((o) => !o);
        },
        onKeyDown: (e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            focusOnOpen.current = e.key === 'ArrowDown' ? 'first' : 'last';
            setOpen(true);
          }
        },
        ref: (el) => {
          buttonRef.current = el;
        },
      })}
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          onKeyDown={onMenuKeyDown}
          className={cn(
            'absolute top-[calc(100%+6px)] z-30 flex min-w-[200px] flex-col rounded-[12px] bg-surface p-1.5 shadow-overlay',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-disabled={item.disabled || undefined}
              title={item.disabled ? item.reason : undefined}
              onClick={() => {
                if (item.disabled) return;
                close();
                item.onSelect();
              }}
              className={cn(
                'flex h-9 items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[13.5px] outline-none',
                'focus-visible:bg-accent-soft hover:bg-accent-soft',
                item.tone === 'danger' ? 'text-danger-fg' : 'text-fg',
                item.disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
