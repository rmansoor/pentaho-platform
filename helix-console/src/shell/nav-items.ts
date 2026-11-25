import type { LucideIcon } from 'lucide-react';
import { CalendarClock, Database, FolderClosed, House, Settings } from 'lucide-react';

export interface NavItem {
  to: '/home' | '/files' | '/schedules' | '/datasources' | '/admin';
  label: string;
  icon: LucideIcon;
}

/**
 * The console's areas, in rail order (Helix Console Rebuild, "Navigation").
 * Permission-based visibility (canSchedule, hasDataAccess, canAdminister) arrives with the
 * bootstrap endpoint; until then every area is listed.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/home', label: 'Home', icon: House },
  { to: '/files', label: 'Files', icon: FolderClosed },
  { to: '/schedules', label: 'Schedules', icon: CalendarClock },
  { to: '/datasources', label: 'Data sources', icon: Database },
  { to: '/admin', label: 'Administration', icon: Settings },
];
