import { t } from '../../i18n';

export const DEFAULT_FOLDER = '/public';

export const ROOT_FOLDERS = [
  { path: '/home', get label() { return t('files.roots.home'); } },
  { path: '/public', get label() { return t('files.roots.public'); } },
] as const;

/** Normalises a user-supplied path: leading slash, no trailing slash, no empty segments. */
export function normalizePath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts.length ? `/${parts.join('/')}` : '/';
}

export function parentOf(path: string): string | null {
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= 1) return null;
  return `/${parts.slice(0, -1).join('/')}`;
}

/** "/public/Steel Wheels/Reports" → ["/public", "/public/Steel Wheels", "/public/Steel Wheels/Reports"]. */
export function ancestorsOf(path: string): string[] {
  const parts = path.split('/').filter(Boolean);
  return parts.map((_, i) => `/${parts.slice(0, i + 1).join('/')}`);
}

export function rootLabel(path: string): string | undefined {
  return ROOT_FOLDERS.find((r) => r.path === path)?.label;
}

export function lastSegment(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts.at(-1) ?? '/';
}
