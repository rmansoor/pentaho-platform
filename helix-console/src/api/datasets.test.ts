import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetError, httpDatasetSource } from './datasets';
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

  it('uploads the file as the body, with its name and the version, and explains a refusal', async () => {
    const calls = serve(
      json({ name: 'Sales', id: 'sales', source: { type: 'FILE', file: { path: 'sales/1.csv', originalName: 'Q1 Sales.csv' } } }, 200, '"3"'),
      json({ code: 'too-large', message: 'The file is larger than 500 MB, the most this server accepts', path: 'file' }, 413),
    );
    const file = new File(['region,units\n'], 'Q1 Sales.csv', { type: 'text/csv' });
    const stored = await httpDatasetSource.uploadFile('sales', '2', file);
    expect(stored.version).toBe('3');
    expect(stored.definition.source?.file?.originalName).toBe('Q1 Sales.csv');
    expect(calls[0]).toMatchObject({ method: 'PUT', url: '/pentaho/plugin/data-access/api/v2/datasets/sales/file?name=Q1%20Sales.csv', body: file });
    expect(calls[0]!.headers).toMatchObject({ 'If-Match': '"2"', 'Content-Type': 'text/csv' });
    await expect(httpDatasetSource.uploadFile('sales', '3', file)).rejects.toMatchObject({ status: 413, code: 'too-large' });
  });
});
