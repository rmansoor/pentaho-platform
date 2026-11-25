import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { CalendarClock, Clock, Database, FolderClosed, Star, Trash2, type LucideIcon } from 'lucide-react';
import { Card, IconButton } from '@helix/ui';
import { usePickList, useToggleFavorite, type PickItem } from '../../api/pick-lists';
import { KIND_LABEL } from '../../api/repo';
import { displayFolder } from '../files/columns';
import { FileKindIcon } from '../files/FileKindIcon';
import { QueryError } from '../files/QueryError';

export interface HomePageProps {
  /** Opens a folder in Files (files open in their folder until the viewer exists). */
  onOpenFolder: (path: string) => void;
}

const QUICK_ACTIONS: { to: '/files' | '/files/trash' | '/schedules' | '/datasources'; label: string; detail: string; icon: LucideIcon }[] = [
  { to: '/files', label: 'Browse files', detail: 'Reports, dashboards and folders', icon: FolderClosed },
  { to: '/schedules', label: 'Schedules', detail: 'Scheduled reports and their output', icon: CalendarClock },
  { to: '/datasources', label: 'Data sources', detail: 'Connections and models', icon: Database },
  { to: '/files/trash', label: 'Trash', detail: 'Restore deleted items', icon: Trash2 },
];

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** "5 minutes ago", "yesterday", "3 weeks ago". */
export function timeAgo(ms: number, now = Date.now()): string {
  const seconds = Math.round((ms - now) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

const parentOf = (path: string) => path.slice(0, path.lastIndexOf('/')) || '/';

/** Work page: quick ways in, then the user's favorites and recently opened files. */
export function HomePage({ onOpenFolder }: HomePageProps) {
  const favorites = usePickList('favorites');
  const recents = usePickList('recent');
  const toggleFavorite = useToggleFavorite();
  const favoritePaths = new Set(favorites.data?.map((f) => f.fullPath));

  const open = (item: PickItem) => onOpenFolder(item.kind === 'folder' ? item.fullPath : parentOf(item.fullPath));

  const star = (item: PickItem) => {
    const on = favoritePaths.has(item.fullPath);
    return (
      <IconButton
        size="sm"
        variant="ghost"
        aria-label={on ? `Remove ${item.title} from favorites` : `Add ${item.title} to favorites`}
        aria-pressed={on}
        title={on ? 'Remove from favorites' : 'Add to favorites'}
        onClick={() => toggleFavorite.mutate({ path: item.fullPath, title: item.title, kind: item.kind })}
      >
        <Star size={16} aria-hidden="true" className={on ? 'fill-highlight text-highlight' : undefined} />
      </IconButton>
    );
  };

  return (
    <div className="flex flex-col gap-7 pt-1">
      <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.02em]">Home</h1>

      <nav aria-label="Quick actions" className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        {QUICK_ACTIONS.map(({ to, label, detail, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="group flex items-center gap-3.5 rounded-card bg-surface p-4 text-fg no-underline shadow-card hover:ring-2 hover:ring-accent-soft"
          >
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent">
              <Icon size={19} strokeWidth={1.9} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="font-bold">{label}</span>
              <span className="truncate text-[12.5px] text-fg-muted">{detail}</span>
            </span>
          </Link>
        ))}
      </nav>

      <div className="grid gap-5 lg:grid-cols-2">
        <PickListCard
          title="Favorites"
          icon={<Star size={16} aria-hidden="true" />}
          query={favorites}
          empty="Star a file or folder in Files to keep it here."
          renderMeta={(item) => `${KIND_LABEL[item.kind]} · ${displayFolder(parentOf(item.fullPath))}`}
          onOpen={open}
          action={star}
        />
        <PickListCard
          title="Recent"
          icon={<Clock size={16} aria-hidden="true" />}
          query={recents}
          empty="Files you open appear here."
          renderMeta={(item) => `${displayFolder(parentOf(item.fullPath))}${item.lastUse ? ` · ${timeAgo(item.lastUse)}` : ''}`}
          onOpen={open}
          action={star}
        />
      </div>
    </div>
  );
}

function PickListCard({
  title,
  icon,
  query,
  empty,
  renderMeta,
  onOpen,
  action,
}: {
  title: string;
  icon: ReactNode;
  query: ReturnType<typeof usePickList>;
  empty: string;
  renderMeta: (item: PickItem) => string;
  onOpen: (item: PickItem) => void;
  action: (item: PickItem) => ReactNode;
}) {
  const headingId = `home-${title.toLowerCase()}`;
  return (
    <Card className="flex flex-col overflow-hidden">
      <h2 id={headingId} className="m-0 flex items-center gap-2 border-b border-divider px-[18px] py-3.5 text-[15px] font-bold">
        <span className="text-fg-muted">{icon}</span>
        {title}
      </h2>
      {query.isPending ? (
        <p className="m-0 px-[18px] py-8 text-fg-muted">Loading…</p>
      ) : query.isError ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <p className="m-0 px-[18px] py-8 text-center text-fg-muted">{empty}</p>
      ) : (
        <ul aria-labelledby={headingId} className="m-0 list-none p-0">
          {query.data.map((item) => (
            <li key={item.fullPath} className="flex items-center gap-3 border-t border-divider px-[18px] py-2 first:border-t-0">
              <button
                type="button"
                onClick={() => onOpen(item)}
                title={item.kind === 'folder' ? `Open ${item.title}` : `Show ${item.title} in its folder`}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-[8px] py-1 text-left"
              >
                <FileKindIcon kind={item.kind} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold">{item.title}</span>
                  <span className="truncate text-[12.5px] text-fg-muted">{renderMeta(item)}</span>
                </span>
              </button>
              {action(item)}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
