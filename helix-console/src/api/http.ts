import type { z } from 'zod';
import { t } from '../i18n';

/** Platform REST root. The console is served from /pentaho/console/, the API from /pentaho/api. */
export const API_ROOT: string = import.meta.env.VITE_API_ROOT ?? '/pentaho/api';

/** Signs the session out and returns to the server's login page. */
export const LOGOUT_URL = API_ROOT.replace(/\/api$/, '/Logout');

/** Plugin REST endpoints live under /pentaho/plugin/<id>/api, relative to the same root. */
export const PLUGIN_ROOT = API_ROOT.replace(/\/api$/, '/plugin');

/** Server login page; `?then=` is not supported by the platform, so the console link returns the user manually. */
export const LOGIN_URL = API_ROOT.replace(/\/api$/, '/Login');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get signedOut(): boolean {
    return this.status === 401;
  }

  /** No response at all (server down, proxy target missing) or a gateway error. */
  get unreachable(): boolean {
    return this.status === 0 || this.status === 502 || this.status === 503 || this.status === 504;
  }
}

async function doFetch(url: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError(0, url, t('common.errors.serverUnreachable'));
  }
  // Without a session the server redirects to its login page and fetch follows the redirect,
  // so a signed-out call "succeeds" with HTML. Treat that as 401.
  if (response.redirected && /\/Login\b/i.test(response.url)) {
    throw new ApiError(401, url, t('common.errors.notSignedIn'));
  }
  return response;
}

/** GET a JSON resource and validate it. Same-origin session cookie; no tokens in storage. */
/** Paths are relative to API_ROOT unless already rooted at the API or plugin root. */
/** The web application's root (/pentaho); servlets such as UploadService live directly under it. */
export const CONTEXT_ROOT = API_ROOT.replace(/\/api$/, '');

const resolve = (path: string) =>
  path.startsWith(PLUGIN_ROOT) || path.startsWith(`${API_ROOT}/`) || path.startsWith(`${CONTEXT_ROOT}/`) ? path : `${API_ROOT}${path}`;

export async function getJson<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  const url = resolve(path);
  const response = await doFetch(url, { method: 'GET', headers: { Accept: 'application/json' }, signal });
  if (!response.ok) {
    throw new ApiError(response.status, url, `${response.status} ${response.statusText}`.trim());
  }
  const type = response.headers.get('Content-Type') ?? '';
  if (!type.includes('json')) {
    throw new ApiError(response.status, url, `Expected JSON but got ${type || 'no content type'}.`);
  }
  return schema.parse(await response.json());
}

/** GET a resource and return the response whatever its status, for callers that need its headers or error body. */
export async function getResponse(path: string, signal?: AbortSignal, accept = 'application/json'): Promise<Response> {
  const url = resolve(path);
  const response = await doFetch(url, { method: 'GET', headers: { Accept: accept }, signal });
  if (response.status === 401 || response.status >= 500) {
    throw new ApiError(response.status, url, `${response.status} ${response.statusText}`.trim());
  }
  return response;
}

/** GET a resource as text; '' for 204 No Content. Some endpoints only answer `text/plain`. */
export async function getText(path: string, signal?: AbortSignal, accept = 'application/json'): Promise<string> {
  const url = resolve(path);
  const response = await doFetch(url, { method: 'GET', headers: { Accept: accept }, signal });
  if (!response.ok) {
    throw new ApiError(response.status, url, `${response.status} ${response.statusText}`.trim());
  }
  return response.status === 204 ? '' : response.text();
}

/*
 * CSRF. With the Helix Security Web plugin installed, unsafe requests need a token header.
 * GET /api/csrf/token?url=<absolute target> answers 204 with X-CSRF-HEADER (the header name)
 * and X-CSRF-TOKEN; without the plugin it answers 204 with neither, and nothing is sent.
 * The token is per session, so it is cached and refetched once if the server rejects it.
 */
let csrfCache: Promise<Record<string, string>> | null = null;

async function fetchCsrfHeaders(targetUrl: string): Promise<Record<string, string>> {
  const absolute = new URL(targetUrl, window.location.origin).href;
  const response = await doFetch(`${API_ROOT}/csrf/token?url=${encodeURIComponent(absolute)}`, { method: 'GET' });
  const header = response.headers.get('X-CSRF-HEADER');
  const token = response.headers.get('X-CSRF-TOKEN');
  return response.ok && header && token ? { [header]: token } : {};
}

function csrfHeaders(targetUrl: string, refresh = false): Promise<Record<string, string>> {
  if (refresh || !csrfCache) {
    csrfCache = fetchCsrfHeaders(targetUrl).catch((e: unknown) => {
      csrfCache = null;
      throw e;
    });
  }
  return csrfCache;
}

/** Test seam: forget the cached token. */
export function resetCsrfCache() {
  csrfCache = null;
}

export interface SendOptions {
  /** A FormData body is sent as multipart; the browser sets its Content-Type and boundary. */
  body?: string | FormData | Blob;
  contentType?: string;
  accept?: string;
  /** More request headers, such as If-Match. */
  headers?: Record<string, string>;
}

/**
 * An unsafe request (PUT/POST/DELETE) with the CSRF header. Resolves with the response for any
 * status the caller wants to interpret (the restore endpoint answers 406 and 409 meaningfully);
 * throws ApiError for no response, a signed-out redirect, or a 5xx.
 */
export async function send(
  method: 'PUT' | 'POST' | 'DELETE',
  path: string,
  { body, contentType = 'text/plain', accept, headers }: SendOptions = {},
): Promise<Response> {
  const url = resolve(path);
  const attempt = async (refresh: boolean) =>
    doFetch(url, {
      method,
      body,
      headers: {
        ...(body instanceof FormData ? {} : { 'Content-Type': contentType }),
        ...(accept ? { Accept: accept } : {}),
        ...headers,
        ...(await csrfHeaders(url, refresh)),
      },
    });
  let response = await attempt(false);
  // A stale or missing token is rejected with 403; refetch it once.
  if (response.status === 403) response = await attempt(true);
  if (response.status === 401 || response.status >= 500) {
    throw new ApiError(response.status, url, `${response.status} ${response.statusText}`.trim());
  }
  return response;
}

/** Like `send`, but any non-2xx is an error. */
export async function sendOk(method: 'PUT' | 'POST' | 'DELETE', path: string, options?: SendOptions): Promise<void> {
  const response = await send(method, path, options);
  if (!response.ok) {
    throw new ApiError(response.status, response.url || path, `${response.status} ${response.statusText}`.trim());
  }
}
