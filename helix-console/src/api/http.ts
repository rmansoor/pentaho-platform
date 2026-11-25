import type { z } from 'zod';

/** Platform REST root. The console is served from /pentaho/console/, the API from /pentaho/api. */
export const API_ROOT: string = import.meta.env.VITE_API_ROOT ?? '/pentaho/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
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
  return schema.parse(await response.json());
}
