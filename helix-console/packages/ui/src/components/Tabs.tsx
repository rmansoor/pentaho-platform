import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface TabsProps<T extends string> {
  label: string;
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  children: (id: T) => ReactNode;
}

/** ARIA tabs with automatic activation: Left/Right/Home/End move and select. */
export function Tabs<T extends string>({ label, tabs, value, onChange, children }: TabsProps<T>) {
  const base = useId();
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((t) => t.id === value);
    const next =
      e.key === 'ArrowRight'
        ? tabs[(index + 1) % tabs.length]
        : e.key === 'ArrowLeft'
          ? tabs[(index - 1 + tabs.length) % tabs.length]
          : e.key === 'Home'
            ? tabs[0]
            : e.key === 'End'
              ? tabs.at(-1)
              : undefined;
    if (!next) return;
    e.preventDefault();
    onChange(next.id);
    listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(`${base}-tab-${next.id}`)}`)?.focus();
  }

  return (
    <div className="flex flex-col gap-5">
      <div ref={listRef} role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex gap-1 border-b border-divider">
        {tabs.map((tab) => {
          const selected = tab.id === value;
          return (
            <button
              key={tab.id}
              id={`${base}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${base}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={cn(
                '-mb-px h-10 border-b-2 px-3 text-[13.5px] font-semibold',
                selected ? 'border-accent text-accent' : 'border-transparent text-fg-muted hover:text-fg',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${base}-panel-${value}`} aria-labelledby={`${base}-tab-${value}`} tabIndex={0} className="outline-none">
        {children(value)}
      </div>
    </div>
  );
}
