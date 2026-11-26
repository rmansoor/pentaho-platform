import { Link } from '@tanstack/react-router';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn, HelixMark } from '@helix/ui';
import { NAV_ITEMS } from './nav-items';
import { UserMenu } from './UserMenu';
import { useSession } from '../api/repo-context';
import { t } from '../i18n';

export const NAV_RAIL_ID = 'helix-nav-rail';

export interface NavRailProps {
  /** Icons only. Ignored in the drawer, which is always expanded. */
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  /** `docked` sits beside the content (desktop); `drawer` slides over it (small screens). */
  variant?: 'docked' | 'drawer';
  onNavigate?: () => void;
  id?: string;
}

/**
 * The Atlas brand rail: navy, carries Helix on every screen. Collapses to a 64 px icon rail so
 * the content gets the full width; labels stay in the DOM for screen readers and show as
 * tooltips on hover.
 */
export function NavRail({
  collapsed: collapsedProp,
  onToggleCollapsed,
  variant = 'docked',
  onNavigate,
  id = NAV_RAIL_ID,
}: NavRailProps) {
  const collapsed = variant === 'docked' && collapsedProp;
  const session = useSession();
  // Administration only for administrators; shown while unknown so the rail doesn't jump.
  const items = NAV_ITEMS.filter((n) => n.to !== '/admin' || session.data?.isAdministrator !== false);

  return (
    <nav
      id={id}
      aria-label={t('shell.areas')}
      data-collapsed={collapsed}
      className={cn(
        'flex h-full flex-col gap-1 bg-rail px-3.5 py-5 text-rail-fg-strong',
        'transition-[width] duration-200 ease-out motion-reduce:transition-none',
        collapsed ? 'w-rail-collapsed px-2.5' : 'w-rail-expanded',
      )}
    >
      <div className={cn('flex h-11 items-center gap-2.5 pb-5', collapsed ? 'justify-center' : 'px-2')}>
        <HelixMark size={28} />
        <span className={cn('text-xl font-extrabold tracking-[-0.02em]', collapsed && 'sr-only')}>Helix</span>
      </div>

      <ul className="flex flex-col gap-1" role="list">
        {items.map(({ to, label: key, icon: Icon }) => {
          const label = t(key);
          return (
          <li key={to}>
            <Link
              to={to}
              onClick={onNavigate}
              title={collapsed ? label : undefined}
              className={cn(
                'flex h-11 items-center gap-3 rounded-control text-rail-fg no-underline',
                'hover:bg-rail-hover hover:text-rail-fg-strong',
                'data-[status=active]:bg-rail-active data-[status=active]:font-semibold data-[status=active]:text-rail-fg-strong',
                collapsed ? 'justify-center px-0' : 'px-3',
              )}
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              <span className={cn(collapsed && 'sr-only')}>{label}</span>
            </Link>
          </li>
          );
        })}
      </ul>

      <div className="mt-auto flex flex-col gap-2 border-t border-rail-divider pt-3">
        {variant === 'docked' && onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-controls={id}
            aria-expanded={!collapsed}
            title={t('shell.toggleMenuHint', { action: t(collapsed ? 'shell.expandMenu' : 'shell.collapseMenu') })}
            className={cn(
              'flex h-10 items-center gap-3 rounded-control text-[13px] text-rail-fg',
              'hover:bg-rail-hover hover:text-rail-fg-strong',
              collapsed ? 'justify-center px-0' : 'px-3',
            )}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} strokeWidth={1.8} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={18} strokeWidth={1.8} aria-hidden="true" />
            )}
            <span className={cn(collapsed && 'sr-only')}>{t(collapsed ? 'shell.expandMenu' : 'shell.collapseMenu')}</span>
          </button>
        )}
        <UserMenu collapsed={collapsed} />
      </div>
    </nav>
  );
}
