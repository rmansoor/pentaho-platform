import {
  ChartColumn,
  File,
  FileText,
  Folder,
  LayoutDashboard,
  Link,
  Shuffle,
  Table2,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@helix/ui';
import type { FileKind } from '../../api/repo';

const ICONS: Record<FileKind, LucideIcon> = {
  folder: Folder,
  report: FileText,
  'interactive-report': Table2,
  analysis: ChartColumn,
  dashboard: LayoutDashboard,
  transformation: Shuffle,
  job: Workflow,
  action: Zap,
  link: Link,
  file: File,
};

/** Atlas file badge: a tinted rounded square. Dashboards take the Ember tint, as in the mockup. */
export function FileKindIcon({ kind, className }: { kind: FileKind; className?: string }) {
  const Icon = ICONS[kind];
  const tone =
    kind === 'dashboard'
      ? 'bg-danger-bg text-danger-fg'
      : kind === 'folder'
        ? 'bg-divider text-fg-soft'
        : 'bg-accent-soft text-accent';
  return (
    <span aria-hidden="true" className={cn('grid size-[30px] shrink-0 place-items-center rounded-[9px]', tone, className)}>
      <Icon size={16} strokeWidth={2} />
    </span>
  );
}
