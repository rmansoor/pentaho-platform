import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Download, ExternalLink, LayoutPanelLeft, Share2, Star } from 'lucide-react';
import { Button, IconButton } from '@helix/ui';
import { useOpeners, useRepoSource, useSchedulableExtensions } from '../../api/repo-context';
import { ScheduleSheet } from '../schedules/ScheduleSheet';
import { extensionOfPath, kindOf, openUrl, toPathId, type RepoItem } from '../../api/repo';
import { parsePickList, recordRecent, serializePickList, usePickList, useToggleFavorite } from '../../api/pick-lists';
import { API_ROOT } from '../../api/http';
import { displayFolder } from '../files/columns';
import { PropertiesSheet } from '../files/PropertiesSheet';
import { ContentFrame } from './ContentFrame';
import { ReportViewer } from './ReportViewer';
import { t } from '../../i18n';

export interface ViewerPageProps {
  path: string;
  /** Display title from where the file was opened; falls back to the file name. */
  title?: string;
  onOpenFolder: (path: string) => void;
}

/** Reports open in the console's viewer unless the person chose the plugin's (remembered per browser). */
const CLASSIC_KEY = 'helix.reportViewer.classic';
const readClassic = () => {
  try {
    return localStorage.getItem(CLASSIC_KEY) === 'true';
  } catch {
    return false;
  }
};
const writeClassic = (on: boolean) => {
  try {
    if (on) localStorage.setItem(CLASSIC_KEY, 'true');
    else localStorage.removeItem(CLASSIC_KEY);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
};

const titleOf = (path: string) => {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
};

/**
 * Opens a repository file with the plugin that renders it, in one frame inside the shell (the
 * plan's "one frame deep"). The URL is the one the GWT console uses: /api/repos/{id}/{perspective}.
 */
export function ViewerPage({ path, title: givenTitle, onOpenFolder }: ViewerPageProps) {
  const openers = useOpeners();
  const source = useRepoSource();
  const queryClient = useQueryClient();
  const favorites = usePickList('favorites');
  const toggleFavorite = useToggleFavorite();
  const [sharing, setSharing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const schedulable = useSchedulableExtensions();
  const recorded = useRef<string | null>(null);
  const [classic, setClassic] = useState(readClassic);

  const folder = path.slice(0, path.lastIndexOf('/')) || '/';
  const title = givenTitle || titleOf(path);
  const ext = extensionOfPath(path);
  const perspective = openers.data?.[ext];
  const url = perspective ? openUrl(path, perspective) : undefined;
  const isFavorite = !!favorites.data?.some((f) => f.fullPath === path);
  // Pentaho reports get the console's own viewer; everything else the plugin's page.
  const isReport = ext === 'prpt' && !!url;
  const builtIn = isReport && !classic;
  const item: RepoItem = { id: path, path, name: path.slice(path.lastIndexOf('/') + 1), title, folder: false, hidden: false, kind: kindOf(path), created: null, modified: null };

  // Opening a file records it in Recent, shared with the GWT console.
  useEffect(() => {
    if (!url || recorded.current === path) return;
    recorded.current = path;
    void (async () => {
      try {
        const next = recordRecent(parsePickList(await source.getUserSetting('recent')), path, title);
        await source.setUserSetting('recent', serializePickList(next));
        await queryClient.invalidateQueries({ queryKey: ['user-settings', 'recent'] });
      } catch {
        // Recents are a convenience; a failure here must not get in the way of the report.
      }
    })();
  }, [url, path, title, source, queryClient]);

  return (
    <div className="-mx-4 -mb-6 flex h-[calc(100dvh-var(--hx-topbar-h))] flex-col md:-mx-8">
      <header className="flex flex-wrap items-center gap-3 px-4 pb-3 md:px-8">
        <div className="min-w-0 flex-1">
          <nav aria-label={t('files.breadcrumb')} className="text-[13px] text-fg-muted">
            <a
              href={`?path=${encodeURIComponent(folder)}`}
              onClick={(e) => {
                e.preventDefault();
                onOpenFolder(folder);
              }}
              className="text-fg-muted no-underline hover:text-accent hover:underline"
            >
              {displayFolder(folder)}
            </a>
          </nav>
          <h1 className="m-0 truncate text-[22px] font-extrabold tracking-[-0.02em]">{title}</h1>
        </div>
        <IconButton
          size="sm"
          variant="ghost"
          aria-label={isFavorite ? t('files.removeFavorite') : t('files.addFavorite')}
          aria-pressed={isFavorite}
          title={isFavorite ? t('files.removeFavorite') : t('files.addFavorite')}
          onClick={() => toggleFavorite.mutate({ path, title, kind: item.kind })}
        >
          <Star size={16} aria-hidden="true" className={isFavorite ? 'fill-highlight text-highlight' : undefined} />
        </IconButton>
        <Button size="sm" icon={<Share2 size={15} aria-hidden="true" />} onClick={() => setSharing(true)}>
          {t('files.share')}
        </Button>
        {schedulable.data?.includes(ext) && (
          <Button size="sm" icon={<CalendarPlus size={15} aria-hidden="true" />} onClick={() => setScheduling(true)}>
            {t('files.schedule')}
          </Button>
        )}
        {isReport && (
          <Button
            size="sm"
            variant="ghost"
            icon={<LayoutPanelLeft size={15} aria-hidden="true" />}
            title={classic ? t('files.viewer.builtInHint') : t('files.viewer.classicHint')}
            onClick={() => {
              writeClassic(!classic);
              setClassic(!classic);
            }}
          >
            {classic ? t('files.viewer.builtIn') : t('files.viewer.classic')}
          </Button>
        )}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener"
            className="inline-flex h-9 items-center gap-2 rounded-control border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-fg no-underline hover:bg-accent-soft"
          >
            <ExternalLink size={15} aria-hidden="true" />
            {t('files.viewer.newWindow')}
          </a>
        )}
      </header>

      <div className="min-h-0 flex-1 border-t border-divider bg-surface">
        {openers.isPending ? (
          <p className="m-0 p-8 text-fg-muted">{t('common.loading')}</p>
        ) : builtIn ? (
          <ReportViewer key={path} file={path} title={title} />
        ) : url ? (
          <ContentFrame
            key={url}
            src={url}
            title={title}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <p className="m-0 font-bold">{ext ? t('files.viewer.noViewer', { ext }) : t('files.viewer.noViewerUnknown')}</p>
            <p className="m-0 max-w-[50ch] text-fg-muted">
              {t('files.viewer.noViewerHint')}
            </p>
            <a
              href={`${API_ROOT}/repo/files/${toPathId(path)}/download`}
              className="inline-flex h-9 items-center gap-2 rounded-control bg-accent px-3.5 text-[13px] font-bold text-accent-ink no-underline hover:bg-accent-hover"
            >
              <Download size={15} aria-hidden="true" />
              {t('files.viewer.download')}
            </a>
          </div>
        )}
      </div>

      <PropertiesSheet item={sharing ? item : null} initialTab="sharing" onClose={() => setSharing(false)} />
      <ScheduleSheet target={scheduling ? { kind: 'new', file: path, title } : null} onClose={() => setScheduling(false)} />
    </div>
  );
}
