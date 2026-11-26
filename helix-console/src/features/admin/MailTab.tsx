import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { Button, Card, Checkbox, toast } from '@helix/ui';
import { adminKeys, useAdminSource, useMailConfig, type MailConfig } from '../../api/admin';
import { QueryError } from '../files/QueryError';

const inputClass = 'h-10 w-full rounded-control border border-border-strong bg-surface px-3 text-fg';

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

/** Mail server used for emailed schedule output and test messages. */
export function MailTab() {
  const source = useAdminSource();
  const queryClient = useQueryClient();
  const saved = useMailConfig();
  const [form, setForm] = useState<MailConfig | null>(null);
  const formId = useId();

  useEffect(() => {
    if (saved.data && !form) setForm(structuredClone(saved.data));
  }, [saved.data, form]);

  const save = useMutation({
    mutationFn: (config: MailConfig) => source.setMailConfig(config),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.mail });
      toast('Mail server settings saved');
    },
    onError: (e: Error) => toast(e.message, { tone: 'danger' }),
  });
  const test = useMutation({
    mutationFn: (config: MailConfig) => source.testMail(config),
    onSuccess: (passed) =>
      passed
        ? toast('Test email sent. Check the From address’s inbox.')
        : toast("The test email couldn't be sent. Check the server, port, security and sign-in settings.", { tone: 'danger' }),
    onError: (e: Error) => toast(e.message, { tone: 'danger' }),
  });

  if (saved.isError) return <QueryError error={saved.error} onRetry={() => void saved.refetch()} />;
  if (!form) return <p className="m-0 text-fg-muted">Loading mail settings…</p>;

  const set = <K extends keyof MailConfig>(key: K, value: MailConfig[K]) => setForm({ ...form, [key]: value });
  const problem = !form.smtpHost.trim()
    ? 'Enter the mail server'
    : !(form.smtpPort > 0 && form.smtpPort < 65536)
      ? 'Enter a port between 1 and 65535'
      : !/^\S+@\S+\.\S+$/.test(form.defaultFrom)
        ? 'Enter the address mail is sent from'
        : form.authenticate && !form.userId.trim()
          ? 'Enter the user name for signing in'
          : null;
  const dirty = JSON.stringify(form) !== JSON.stringify(saved.data);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!problem && !save.isPending) save.mutate(form);
  };

  return (
    <Card className="max-w-[720px] p-6">
      <form id={formId} onSubmit={submit} className="flex flex-col gap-5">
        <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
          <Field label="Mail server (SMTP host)">
            {(id) => <input id={id} value={form.smtpHost} onChange={(e) => set('smtpHost', e.target.value)} placeholder="smtp.example.com" className={inputClass} />}
          </Field>
          <Field label="Port">
            {(id) => <input id={id} type="number" value={form.smtpPort} onChange={(e) => set('smtpPort', Number(e.target.value))} className={inputClass} />}
          </Field>
        </div>
        <Field label="Protocol">
          {(id) => (
            <select id={id} value={form.smtpProtocol} onChange={(e) => set('smtpProtocol', e.target.value)} className={`${inputClass} w-48`}>
              <option value="smtp">SMTP</option>
              <option value="smtps">SMTPS</option>
            </select>
          )}
        </Field>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Checkbox label="Use SSL" checked={form.useSsl} onChange={(v) => set('useSsl', v)} />
          <Checkbox label="Use STARTTLS" checked={form.useStartTls} onChange={(v) => set('useStartTls', v)} />
        </div>

        <fieldset className="m-0 flex flex-col gap-3 border-0 border-t border-divider p-0 pt-5">
          <legend className="sr-only">Sign-in</legend>
          <Checkbox label="The server requires signing in" checked={form.authenticate} onChange={(v) => set('authenticate', v)} />
          {form.authenticate && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="User name">
                {(id) => <input id={id} value={form.userId} autoComplete="off" onChange={(e) => set('userId', e.target.value)} className={inputClass} />}
              </Field>
              <Field label="Password">
                {(id) => <input id={id} type="password" value={form.password} autoComplete="new-password" onChange={(e) => set('password', e.target.value)} className={inputClass} />}
              </Field>
            </div>
          )}
        </fieldset>

        <div className="grid grid-cols-2 gap-3 border-t border-divider pt-5">
          <Field label="From address">
            {(id) => <input id={id} type="email" value={form.defaultFrom} onChange={(e) => set('defaultFrom', e.target.value)} className={inputClass} />}
          </Field>
          <Field label="From name">
            {(id) => <input id={id} value={form.fromName} onChange={(e) => set('fromName', e.target.value)} className={inputClass} />}
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-divider pt-5">
          {problem && <span className="mr-auto text-[13px] text-fg-muted">{problem}</span>}
          <Button
            size="sm"
            icon={<Send size={15} aria-hidden="true" />}
            aria-disabled={!!problem || test.isPending}
            title={problem ?? 'Sends a test message to the From address with these settings'}
            onClick={() => !problem && !test.isPending && test.mutate(form)}
          >
            {test.isPending ? 'Sending…' : 'Send test email'}
          </Button>
          <Button size="sm" variant="primary" type="submit" form={formId} aria-disabled={!!problem || !dirty || save.isPending} title={problem ?? (dirty ? undefined : 'No changes to save')}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
