import { afterEach, describe, expect, it } from 'vitest';
import { IntlMessageFormat } from 'intl-messageformat';
import { applyLanguage, currentLanguage, currentLocale, languageOf, t, type Catalog } from '.';
import { en } from './en';
import { de } from './de';

type Ast = ReturnType<IntlMessageFormat['getAst']>;

/** Every message as [key, text]. */
function flatten(node: Catalog | Record<string, unknown>, prefix = ''): [string, string][] {
  return Object.entries(node).flatMap(([k, v]) =>
    typeof v === 'string' ? [[`${prefix}${k}`, v] as [string, string]] : flatten(v as Record<string, unknown>, `${prefix}${k}.`),
  );
}

/** The argument names a message uses, including inside plural and select branches. */
function argumentsOf(ast: Ast, into = new Set<string>()): Set<string> {
  for (const el of ast) {
    if ('value' in el && typeof el.value === 'string' && el.type !== 0 /* literal */) into.add(el.value);
    if ('options' in el) for (const option of Object.values(el.options)) argumentsOf(option.value, into);
  }
  return into;
}

describe('catalogs', () => {
  const english = new Map(flatten(en));
  const german = new Map(flatten(de));

  it('have the same keys', () => {
    expect([...german.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it('parse as ICU messages and use the same placeholders in every language', () => {
    // The check itself sees placeholders nested in plural branches.
    expect([...argumentsOf(new IntlMessageFormat(en.files.actions.restored, 'en').getAst())].sort()).toEqual(['count', 'name']);
    const problems: string[] = [];
    for (const [key, text] of english) {
      const enArgs = argumentsOf(new IntlMessageFormat(text, 'en').getAst());
      const deText = german.get(key)!;
      let deArgs: Set<string>;
      try {
        deArgs = argumentsOf(new IntlMessageFormat(deText, 'de').getAst());
      } catch (e) {
        problems.push(`${key}: ${(e as Error).message}`);
        continue;
      }
      if ([...enArgs].sort().join() !== [...deArgs].sort().join()) problems.push(`${key}: en {${[...enArgs]}} vs de {${[...deArgs]}}`);
    }
    expect(problems).toEqual([]);
  });
});

describe('t', () => {
  afterEach(() => applyLanguage('en'));

  it('fills in values and follows plural rules', () => {
    expect(t('files.itemCount', { count: 1 })).toBe('1 item');
    expect(t('files.itemCount', { count: 3 })).toBe('3 items');
    expect(t('files.moveToTrash', { count: 0 })).toBe('Move to trash');
    expect(t('datasources.deleted', { kind: 'jdbc', name: 'AgileBI' })).toBe('Deleted database connection "AgileBI"');
  });

  it('switches language and locale', async () => {
    await applyLanguage('de_DE');
    expect(currentLanguage()).toBe('de');
    expect(currentLocale()).toBe('de-DE');
    expect(document.documentElement.lang).toBe('de-DE');
    expect(t('files.itemCount', { count: 3 })).toBe('3 Elemente');
    expect(t('schedules.describe.minutes', { count: 1 })).toBe('Jede Minute');
  });

  it('maps Pentaho and browser locales to a supported language', async () => {
    expect(languageOf('de_AT')).toBe('de');
    expect(languageOf('en-GB')).toBe('en');
    expect(languageOf('ja')).toBeNull();
    expect(await applyLanguage('ja_JP')).toBe('en');
    expect(await applyLanguage('en_GB')).toBe('en');
    expect(currentLocale()).toBe('en-GB');
  });
});
