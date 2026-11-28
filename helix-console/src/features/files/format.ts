import { currentLocale } from '../../i18n';

// Built on first use, in the console's language (known only after start-up).
let formats: { locale: string; date: Intl.DateTimeFormat; dateTime: Intl.DateTimeFormat; number: Intl.NumberFormat } | null = null;
function fmt() {
  const locale = currentLocale();
  if (formats?.locale !== locale) {
    formats = {
      locale,
      date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }),
      dateTime: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
      number: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
    };
  }
  return formats;
}

export function formatDate(date: Date | null): string {
  return date ? fmt().date.format(date) : '—';
}

export function formatDateTime(date: Date | null): string | undefined {
  return date ? fmt().dateTime.format(date) : undefined;
}

export function formatSize(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${fmt().number.format(Number((bytes / (1024 * 1024)).toFixed(1)))} MB`;
}
