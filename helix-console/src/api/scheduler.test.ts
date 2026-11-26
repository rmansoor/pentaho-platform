import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpSchedulerSource } from './scheduler';

describe('httpSchedulerSource requests', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stub = (body: string) => {
    const calls: Array<{ url: string; accept: string | null }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, accept: new Headers(init?.headers).get('Accept') });
        return new Response(body, { status: 200 });
      }),
    );
    return calls;
  };

  it('asks whether email is set up, as text', async () => {
    const calls = stub('true');
    expect(await httpSchedulerSource.emailConfigured()).toBe(true);
    expect(calls).toEqual([{ url: '/pentaho/api/emailconfig/isValid', accept: 'text/plain' }]);
  });

  it('asks whether a report has parameters, as text', async () => {
    const calls = stub('false');
    expect(await httpSchedulerSource.hasParameters('/public/Steel Wheels/Reports/Product Sales.prpt')).toBe(false);
    expect(calls).toEqual([
      { url: '/pentaho/api/repo/files/%3Apublic%3ASteel%20Wheels%3AReports%3AProduct%20Sales.prpt/parameterizable', accept: 'text/plain' },
    ]);
  });

  it('counts visible inputs for action sequences', async () => {
    stub('<input type="hidden" name="a"><input name="REGION">');
    expect(await httpSchedulerSource.hasParameters('/public/old.xaction')).toBe(true);
  });
});
