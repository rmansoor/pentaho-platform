import type { z } from 'zod';

/** Platform REST root. The console is served from /pentaho/console/, the API from /pentaho/api. */
export const API_ROOT: string = import.meta.env.VITE_API_ROOT ?? '/pentaho/api';

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

/**
 * GET a JSON resource and validate it. Same-origin session cookie; no tokens in storage.
 * The CSRF header for unsafe methods is added when the first mutation lands.
 */
export async function getJson<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  const url = `${API_ROOT}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError(0, url, 'Could not reach the Pentaho Server.');
  }
  if (!response.ok) {
    throw new ApiError(response.status, url, `${response.status} ${response.statusText}`.trim());
  }
  // Without a session the server redirects to its login page and fetch follows the redirect,
  // so a signed-out call "succeeds" with HTML. Treat that as 401.
  const type = response.headers.get('Content-Type') ?? '';
  if (response.redirected && /\/Login\b/i.test(response.url)) {
    throw new ApiError(401, url, 'Not signed in.');
  }
  if (!type.includes('json')) {
    throw new ApiError(response.status, url, `Expected JSON but got ${type || 'no content type'}.`);
  }
  return schema.parse(await response.json());
}
