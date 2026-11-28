import { IntlMessageFormat } from 'intl-messageformat';
import { en } from './en';

/*
 * Translations.
 *
 * English (./en) is the source catalog; other languages mirror its shape exactly (the Catalog type
 * makes a missing or extra key a type error). Messages use ICU MessageFormat, so plurals and
 * selections follow each language's rules: "{count, plural, one {# run} other {# runs}}".
 * In ICU an apostrophe only escapes before { } # |, so "can't" needs no escaping.
 *
 * The language is the user's Pentaho locale (GET /api/system/locale), read once before the app
 * renders. Changing it saves it on the server (POST /api/system/locale, as PUC's language menu does)
 * and reloads, so the server-rendered parts (report prompts, embedded GWT pages) switch too. Because
 * the language never changes while the app is running, t() can be called anywhere, including plain
 * functions that build sentences, but not at module load (before the language is known).
 */

type Shape<T> = { [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };
export type Catalog = Shape<typeof en>;

type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Paths<typeof en>;

export type Values = Record<string, string | number | Date | boolean | null | undefined>;

export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
] as const;
export type Language = (typeof LANGUAGES)[number]['code'];

const loaders: Record<Exclude<Language, 'en'>, () => Promise<Catalog>> = {
  de: () => import('./de').then((m) => m.de),
};

let language: Language = 'en';
let intlLocale = 'en-US';
let messages: Catalog = en;
const compiled = new Map<string, IntlMessageFormat>();

function lookup(catalog: Catalog, key: string): string | undefined {
  let node: unknown = catalog;
  for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
  return typeof node === 'string' ? node : undefined;
}

/** The message for `key` in the current language, with `values` filled in. */
export function t(key: MessageKey, values?: Values): string {
  let format = compiled.get(key);
  if (!format) {
    const text = lookup(messages, key) ?? lookup(en, key) ?? key;
    format = new IntlMessageFormat(text, intlLocale);
    compiled.set(key, format);
  }
  return String(format.format(values as Record<string, string | number | Date | boolean>));
}

/** The current language code ("en", "de"). */
export const currentLanguage = (): Language => language;
/** The BCP 47 locale for Intl formatters ("en-US", "de-DE"). */
export const currentLocale = (): string => intlLocale;

/** "de_DE" / "de-DE" / "de" -> a supported language, or null. */
export function languageOf(locale: string | null | undefined): Language | null {
  const code = (locale ?? '').trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return LANGUAGES.some((l) => l.code === code) ? (code as Language) : null;
}

/** Switches the language in place. The app calls this once, before rendering; tests call it freely. */
export async function applyLanguage(locale: string): Promise<Language> {
  const next = languageOf(locale) ?? 'en';
  messages = next === 'en' ? en : await loaders[next]();
  language = next;
  // Keep the region when it belongs to the language ("en_GB" -> "en-GB"); otherwise a sensible default.
  const normalized = locale.trim().replace(/_/g, '-');
  intlLocale = languageOf(normalized) === next && normalized.includes('-') ? normalized : next === 'en' ? 'en-US' : `${next}-${next.toUpperCase()}`;
  compiled.clear();
  if (typeof document !== 'undefined') document.documentElement.lang = intlLocale;
  return next;
}
