import { getText, sendOk } from '../api/http';

/** The user's Pentaho locale ("de_DE"), or null when the server can't say (signed out, offline). */
export async function fetchServerLocale(): Promise<string | null> {
  try {
    return (await getText('/system/locale', undefined, 'text/plain')).trim() || null;
  } catch {
    return null;
  }
}

/** Saves the user's language on the server, as PUC's language menu does. */
export function saveServerLocale(language: string): Promise<void> {
  return sendOk('POST', '/system/locale', { body: language, contentType: 'text/plain', accept: 'text/plain' });
}
