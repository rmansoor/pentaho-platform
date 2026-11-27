import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetError, httpDatasetSource, uploadName } from './datasets';
import { resetCsrfCache } from './http';

type Call = { url: string; method: string; headers: Record<string, string>; body?: BodyInit | null };

/** Answers each request with the next response; the CSRF token request gets 204 without a token. */
function serve(...responses: Response[]) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.includes('/csrf/token')) return new Response(null, { status: 204 });
      calls.push({ url, method: init.method ?? 'GET', headers: (init.headers ?? {}) as Record<string, string>, body: init.body });
      return responses.shift()!;
    }),
  );
  return calls;
}
const json = (body: unknown, status = 200, etag?: string) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...(etag ? { ETag: etag } : {}) } });

describe('the datasets API client', () => {
  beforeEach(() => resetCsrfCache());
  afterEach(() => vi.unstubAllGlobals());

  it('reads the version from the ETag and sends it back as If-Match', async () => {
    const calls = serve(json({ name: 'Orders', id: 'orders' }, 200, '"7"'), json({ name: 'Orders 2', id: 'orders' }, 200, 'W/"8"'));
    const stored = await httpDatasetSource.get('orders');
    expect(stored.version).toBe('7');
    const updated = await httpDatasetSource.update('orders', { ...stored.definition, name: 'Orders 2' }, stored.version);
    expect(updated.version).toBe('8');
    expect(calls[1]).toMatchObject({ method: 'PUT', url: '/pentaho/plugin/data-access/api/v2/datasets/orders' });
    expect(calls[1]!.headers['If-Match']).toBe('"7"');
    expect(JSON.parse(String(calls[1]!.body))).toEqual({ name: 'Orders 2', id: 'orders' });
  });

  it('turns the API error body into a DatasetError with every problem', async () => {
    serve(json({ code: 'validation-failed', message: 'The source can\'t be read yet', path: 'source.sql', problems: [{ path: 'source.sql', message: 'is required' }] }, 422));
    const error = await httpDatasetSource.sample('orders').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DatasetError);
    expect(error).toMatchObject({ status: 422, code: 'validation-failed', path: 'source.sql', problems: [{ path: 'source.sql', message: 'is required' }] });
  });

  it('stages with the version and returns the new one', async () => {
    const calls = serve(json({ connection: 'Hibernate', table: 'DS_A_1', rows: 3, columns: [], warnings: [] }, 200, '"9"'));
    const result = await httpDatasetSource.stage('a', '8');
    expect(result).toEqual({ version: '9', table: { connection: 'Hibernate', table: 'DS_A_1', rows: 3, columns: [], warnings: [] } });
    expect(calls[0]).toMatchObject({ method: 'POST', url: '/pentaho/plugin/data-access/api/v2/datasets/a/stage' });
    expect(calls[0]!.headers['If-Match']).toBe('"8"');
  });

  it('uploads as a kept file and checks the servlet answered with its name', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const name = uploadName('Sales 2026.csv', (0.5).toString(36).slice(2, 8));
    const calls = serve(new Response(name, { status: 200 }), new Response('File exceeds the maximum size', { status: 200 }));
    expect(await httpDatasetSource.upload(new File(['a'], 'Sales 2026.csv'))).toBe(name);
    expect(calls[0]!.url).toBe(`/pentaho/UploadService?file_name=${name}&mark_temporary=false`);
    expect((calls[0]!.body as FormData).get('uploadFormElement')).toBeInstanceOf(File);
    await expect(httpDatasetSource.upload(new File(['a'], 'Sales 2026.csv'))).rejects.toThrow('File exceeds the maximum size');
    random.mockRestore();
  });

  it('makes upload names unique and safe as plain file names', () => {
    expect(uploadName('Über Große Sales (2026).CSV', 'k3j9x2')).toBe('uber-gro-e-sales-2026-k3j9x2.csv');
    expect(uploadName('../../etc/passwd', 'x')).toBe('passwd-x.csv');
    expect(uploadName('C:\\Users\\suzy\\q1.txt', 'x')).toBe('q1-x.txt');
    expect(uploadName('.csv', 'x')).toBe('csv-x.csv');
  });
});
