import { useEffect, type ReactNode } from 'react';
import { cn, Toaster } from '@helix/ui';
import { useLayoutStore } from './layout-store';
import { NAV_RAIL_ID, NavRail } from './NavRail';
import { TopBar } from './TopBar';
import { CommandPalette } from './CommandPalette';
import { BridgeHost } from '../compat/BridgeHost';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Atlas shell: brand rail on the left, top bar and content on the right.
 * From 768 px up the rail is docked and collapsible (Ctrl/Cmd+B); below that it is a drawer.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const railCollapsed = useLayoutStore((s) => s.railCollapsed);
  const toggleRail = useLayoutStore((s) => s.toggleRail);
  const drawerOpen = useLayoutStore((s) => s.drawerOpen);
  const setDrawerOpen = useLayoutStore((s) => s.setDrawerOpen);
  const setPaletteOpen = useLayoutStore((s) => s.setPaletteOpen);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key.toLowerCase() === 'b' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        toggleRail();
      } else if (e.key === 'Escape' && useLayoutStore.getState().drawerOpen) {
        setDrawerOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleRail, setDrawerOpen, setPaletteOpen]);

  return (
    <div className="flex h-dvh overflow-hidden bg-bg text-fg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      <div className="hidden shrink-0 md:block">
        <NavRail collapsed={railCollapsed} onToggleCollapsed={toggleRail} />
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-[rgb(15_18_48/0.5)]"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 shadow-overlay">
            <NavRail
              id={`${NAV_RAIL_ID}-drawer`}
              collapsed={false}
              variant="drawer"
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar drawerOpen={drawerOpen} onOpenDrawer={() => setDrawerOpen(true)} />
        <main
          id="main"
          tabIndex={-1}
          className={cn('min-h-0 flex-1 overflow-auto px-4 pb-6 md:px-8', 'focus:outline-none')}
        >
          {children}
        </main>
      </div>
      <Toaster />
      <CommandPalette />
      <BridgeHost />
    </div>
  );
}
