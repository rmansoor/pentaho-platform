import { Menu, Plus, Search } from 'lucide-react';
import { Button, IconButton } from '@helix/ui';
import { NAV_RAIL_ID } from './NavRail';

export interface TopBarProps {
  onOpenDrawer: () => void;
  drawerOpen: boolean;
}

/** One top bar: menu (small screens), search entry point and the New button. */
export function TopBar({ onOpenDrawer, drawerOpen }: TopBarProps) {
  return (
    <header className="flex h-topbar shrink-0 items-center gap-3 px-4 md:px-8">
      <IconButton
        variant="ghost"
        aria-label="Open menu"
        aria-controls={`${NAV_RAIL_ID}-drawer`}
        aria-expanded={drawerOpen}
        onClick={onOpenDrawer}
        className="md:hidden"
      >
        <Menu size={20} aria-hidden="true" />
      </IconButton>

      <div className="flex-1" />

      {/* Opens the command palette once it exists; a visible stub for now. */}
      <button
        type="button"
        className="hidden h-[42px] w-[300px] max-w-full items-center gap-2 rounded-[12px] border border-border bg-surface px-3.5 text-left text-fg-muted sm:flex"
      >
        <Search size={16} strokeWidth={2} aria-hidden="true" />
        <span className="flex-1">Search Helix</span>
        <kbd className="font-mono text-[11px]">Ctrl K</kbd>
      </button>
      <Button variant="primary" icon={<Plus size={16} strokeWidth={2.4} aria-hidden="true" />}>
        New
      </Button>
    </header>
  );
}
