import type { LucideIcon } from 'lucide-react';
import type { MessageKey } from '../i18n';
import { CalendarClock, Database, FolderClosed, House, Settings, Table2 } from 'lucide-react';

export interface NavItem {
  to: '/home' | '/files' | '/schedules' | '/datasets' | '/datasources' | '/admin';
  /** Message key of the label; call t() at render time. */
  label: MessageKey;
  icon: LucideIcon;
}

/**
 * The console's areas, in rail order (Helix Console Rebuild, "Navigation").
 * Permission-based visibility (canSchedule, hasDataAccess, canAdminister) arrives with the
 * bootstrap endpoint; until then every area is listed.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/home', label: 'shell.nav.home', icon: House },
  { to: '/files', label: 'shell.nav.files', icon: FolderClosed },
  { to: '/schedules', label: 'shell.nav.schedules', icon: CalendarClock },
  { to: '/datasets', label: 'shell.nav.datasets', icon: Table2 },
  { to: '/datasources', label: 'shell.nav.datasources', icon: Database },
  { to: '/admin', label: 'shell.nav.admin', icon: Settings },
];
