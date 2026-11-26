import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, PlugZap, XCircle } from 'lucide-react';
import { Button, cn, Dialog, toast } from '@helix/ui';
import {
  connectionBody,
  dataSourceKeys,
  useDatabaseTypes,
  useDataSourceSource,
  type ConnectionForm,
} from '../../api/datasources';
import { QueryError } from '../files/QueryError';

export type ConnectionTarget = { kind: 'new' } | { kind: 'edit'; name: string };

const inputClass = 'h-10 w-full rounded-control border border-border-strong bg-surface px-3 text-fg';

const empty = (): ConnectionForm => ({
  name: '',
  typeShortName: '',
  access: 'NATIVE',
  host: 'localhost',
  port: '',
  database: '',
  username: '',
  password: '',
  raw: {},
});

/** New or edit a database (JDBC) connection, with a server-side connection test. */
export function ConnectionSheet({ target, onClose }: { target: ConnectionTarget | null; onClose: () => void }) {
  return (
    <Dialog
      variant="sheet"
      open={target !== null}
      onClose={onClose}
      title={target?.kind === 'edit' ? `Edit "${target.name}"` : 'New database connection'}
      description="Reports, models and analyses use this to reach the database."
      actions={null}
    >
      {target && <ConnectionBody key={target.kind === 'edit' ? target.name : 'new'} target={target} onClose={onClose} />}
    </Dialog>
  );
}

function ConnectionBody({ target, onClose }: { target: ConnectionTarget; onClose: () => void }) {
  const source = useDataSourceSource();
  const queryClient = useQueryClient();
  const types = useDatabaseTypes();
  const existing = useQuery({
    queryKey: ['datasources', 'connection', target.kind === 'edit' ? target.name : ''],
    queryFn: ({ signal }) => source.getConnection((target as { name: string }).name, signal),
    enabled: target.kind === 'edit',
  });
  const [form, setForm] = useState<ConnectionForm | null>(target.kind === 'new' ? empty() : null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const formId = useId();

  useEffect(() => {
    if (target.kind === 'edit' && existing.data && !form) setForm(existing.data);
  }, [existing.data, form, target.kind]);
  // New connections start on the first type, with its default port.
  useEffect(() => {
    if (form && !form.typeShortName && types.data?.length) {
      const first = types.data.find((t) => t.shortName !== 'GENERIC') ?? types.data[0]!;
      setForm({ ...form, typeShortName: first.shortName, port: first.defaultPort ? String(first.defaultPort) : '' });
    }
  }, [form, types.data]);

  const test = useMutation({
    mutationFn: (body: string) => source.testConnection(body),
    onSuccess: setResult,
    onError: (e: Error) => setResult({ ok: false, message: e.message }),
  });
  const save = useMutation({
    mutationFn: ({ name, body }: { name: string; body: string }) => source.saveConnection(name, body),
    onSuccess: async (_, { name }) => {
      await queryClient.invalidateQueries({ queryKey: dataSourceKeys.all });
      toast(target.kind === 'edit' ? `Saved connection "${name}"` : `Created connection "${name}"`);
      onClose();
    },
    onError: (e: Error) => toast(`Couldn't save: ${e.message}`, { tone: 'danger' }),
  });

  if (existing.isError) return <QueryError error={existing.error} onRetry={() => void existing.refetch()} />;
  if (types.isError) return <QueryError error={types.error} onRetry={() => void types.refetch()} />;
  if (!form || !types.data) return <p className="m-0 text-fg-muted">Loading…</p>;

  const type = types.data.find((t) => t.shortName === form.typeShortName);
  const accessTypes = type?.accessTypes.length ? type.accessTypes : ['NATIVE', 'JNDI'];
  const set = <K extends keyof ConnectionForm>(key: K, value: ConnectionForm[K]) => {
    setForm({ ...form, [key]: value });
    setResult(null);
  };
  const native = form.access === 'NATIVE';
  const problem = !form.name.trim()
    ? 'Give the connection a name'
    : /[/\\:]/.test(form.name)
      ? 'Names can\'t contain "/", "\\" or ":"'
      : native && !form.host.trim()
        ? 'Enter the database server'
        : !form.database.trim()
          ? native
            ? 'Enter the database name'
            : 'Enter the JNDI name'
          : null;
  const body = () => connectionBody(form, types.data);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!problem && !save.isPending) save.mutate({ name: form.name.trim(), body: body() });
  };

  return (
    <div className="flex h-full flex-col">
      <form id={formId} onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Connection name">
          {(id) => <input id={id} value={form.name} disabled={target.kind === 'edit'} onChange={(e) => set('name', e.target.value)} className={inputClass} />}
        </Field>
        <Field label="Database type">
          {(id) => (
            <select
              id={id}
              value={form.typeShortName}
              onChange={(e) => {
                const next = types.data.find((t) => t.shortName === e.target.value);
                setForm({
                  ...form,
                  typeShortName: e.target.value,
                  port: next?.defaultPort ? String(next.defaultPort) : form.port,
                  access: next && !next.accessTypes.includes(form.access) ? (next.accessTypes[0] as 'NATIVE' | 'JNDI') : form.access,
                });
                setResult(null);
              }}
              className={inputClass}
            >
              {types.data.map((t) => (
                <option key={t.shortName} value={t.shortName}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[13px] font-semibold text-fg-soft">Connect using</legend>
          <div className="flex flex-wrap gap-1.5">
            {accessTypes.map((a) => (
              <label
                key={a}
                className={cn(
                  'inline-flex h-9 cursor-pointer items-center rounded-full border px-3.5 text-[13px] font-semibold has-focus-visible:outline-2 has-focus-visible:outline-focus',
                  form.access === a ? 'border-accent bg-accent text-accent-ink' : 'border-border-strong bg-surface text-fg-soft hover:bg-accent-soft',
                )}
              >
                <input type="radio" name="access" value={a} checked={form.access === a} onChange={() => set('access', a as 'NATIVE' | 'JNDI')} className="sr-only" />
                {a === 'NATIVE' ? 'Native (JDBC)' : 'JNDI'}
              </label>
            ))}
          </div>
        </fieldset>

        {native ? (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
              <Field label="Server (host name)">
                {(id) => <input id={id} value={form.host} onChange={(e) => set('host', e.target.value)} className={inputClass} />}
              </Field>
              <Field label="Port">
                {(id) => <input id={id} inputMode="numeric" value={form.port} onChange={(e) => set('port', e.target.value)} className={inputClass} />}
              </Field>
            </div>
            <Field label="Database name">
              {(id) => <input id={id} value={form.database} onChange={(e) => set('database', e.target.value)} className={inputClass} />}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="User name">
                {(id) => <input id={id} value={form.username} autoComplete="off" onChange={(e) => set('username', e.target.value)} className={inputClass} />}
              </Field>
              <Field label="Password" hint={target.kind === 'edit' ? 'Leave blank to keep the saved password.' : undefined}>
                {(id) => <input id={id} type="password" value={form.password} autoComplete="new-password" onChange={(e) => set('password', e.target.value)} className={inputClass} />}
              </Field>
            </div>
          </>
        ) : (
          <Field label="JNDI name" hint="The name of a data source defined in the application server.">
            {(id) => <input id={id} value={form.database} onChange={(e) => set('database', e.target.value)} className={cn(inputClass, 'font-mono text-[13px]')} />}
          </Field>
        )}

        {result && (
          <div
            role="status"
            className={cn('flex items-center gap-3 rounded-card px-4 py-3', result.ok ? 'bg-success-bg text-success-fg' : 'bg-danger-bg text-danger-fg')}
          >
            {result.ok ? <CheckCircle2 size={18} aria-hidden="true" /> : <XCircle size={18} aria-hidden="true" />}
            <span>{result.ok ? result.message : "Couldn't connect. Check the server, port, database name and sign-in details."}</span>
          </div>
        )}
      </form>

      <div className="sticky bottom-0 -mx-6 mt-auto -mb-5 flex items-center justify-end gap-2 border-t border-divider bg-surface px-6 py-4">
        {problem && <span className="mr-auto text-[13px] text-fg-muted">{problem}</span>}
        <Button
          size="sm"
          icon={<PlugZap size={15} aria-hidden="true" />}
          aria-disabled={!!problem || test.isPending}
          onClick={() => !problem && !test.isPending && test.mutate(body())}
        >
          {test.isPending ? 'Testing…' : 'Test connection'}
        </Button>
        <Button size="sm" variant="primary" type="submit" form={formId} aria-disabled={!!problem || save.isPending} title={problem ?? undefined}>
          {save.isPending ? 'Saving…' : target.kind === 'edit' ? 'Save' : 'Create connection'}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-fg-soft">
        {label}
      </label>
      {children(id)}
      {hint && <p className="m-0 text-[12.5px] text-fg-muted">{hint}</p>}
    </div>
  );
}
