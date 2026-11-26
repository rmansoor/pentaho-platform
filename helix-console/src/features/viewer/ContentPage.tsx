import { ContentFrame } from './ContentFrame';
import { t } from '../../i18n';

/** Only same-origin content under /pentaho/ is shown; anything else is refused. */
export function safeContentUrl(url: string): string | null {
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin !== window.location.origin) return null;
    if (!parsed.pathname.startsWith('/pentaho/')) return null;
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return null;
  }
}

/** A plugin page opened by URL (mantle_openTab, openURL, urlCommand). */
export function ContentPage({ url, title }: { url: string; title: string }) {
  const src = safeContentUrl(url);
  return (
    <div className="-mx-4 -mb-6 flex h-[calc(100dvh-var(--hx-topbar-h))] flex-col md:-mx-8">
      <header className="px-4 pb-3 md:px-8">
        <h1 className="m-0 truncate text-[22px] font-extrabold tracking-[-0.02em]">{title || t('files.viewer.content')}</h1>
      </header>
      <div className="min-h-0 flex-1 border-t border-divider bg-surface">
        {src ? (
          <ContentFrame src={src} title={title || t('files.viewer.content')} />
        ) : (
          <p role="alert" className="m-0 p-8 text-fg-muted">
            {t('files.viewer.outside')}
          </p>
        )}
      </div>
    </div>
  );
}
