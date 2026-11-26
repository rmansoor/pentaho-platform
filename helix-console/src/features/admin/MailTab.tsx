import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { Button, Card, Checkbox, toast } from '@helix/ui';
import { adminKeys, useAdminSource, useMailConfig, type MailConfig } from '../../api/admin';
import { QueryError } from '../files/QueryError';
import { t } from '../../i18n';

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
      toast(t('admin.mail.saved'));
    },
    onError: (e: Error) => toast(e.message, { tone: 'danger' }),
  });
  const test = useMutation({
    mutationFn: (config: MailConfig) => source.testMail(config),
    onSuccess: (passed) =>
      passed
        ? toast(t('admin.mail.testSent'))
        : toast(t('admin.mail.testFailed'), { tone: 'danger' }),
    onError: (e: Error) => toast(e.message, { tone: 'danger' }),
  });

  if (saved.isError) return <QueryError error={saved.error} onRetry={() => void saved.refetch()} />;
  if (!form) return <p className="m-0 text-fg-muted">{t('admin.mail.loading')}</p>;

  const set = <K extends keyof MailConfig>(key: K, value: MailConfig[K]) => setForm({ ...form, [key]: value });
  const problem = !form.smtpHost.trim()
    ? t('admin.mail.problems.host')
    : !(form.smtpPort > 0 && form.smtpPort < 65536)
      ? t('admin.mail.problems.port')
      : !/^\S+@\S+\.\S+$/.test(form.defaultFrom)
        ? t('admin.mail.problems.from')
        : form.authenticate && !form.userId.trim()
          ? t('admin.mail.problems.user')
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
          <Field label={t('admin.mail.host')}>
            {(id) => <input id={id} value={form.smtpHost} onChange={(e) => set('smtpHost', e.target.value)} placeholder="smtp.example.com" className={inputClass} />}
          </Field>
          <Field label={t('admin.mail.port')}>
            {(id) => <input id={id} type="number" value={form.smtpPort} onChange={(e) => set('smtpPort', Number(e.target.value))} className={inputClass} />}
          </Field>
        </div>
        <Field label={t('admin.mail.protocol')}>
          {(id) => (
            <select id={id} value={form.smtpProtocol} onChange={(e) => set('smtpProtocol', e.target.value)} className={`${inputClass} w-48`}>
              <option value="smtp">SMTP</option>
              <option value="smtps">SMTPS</option>
            </select>
          )}
        </Field>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Checkbox label={t('admin.mail.useSsl')} checked={form.useSsl} onChange={(v) => set('useSsl', v)} />
          <Checkbox label={t('admin.mail.useStartTls')} checked={form.useStartTls} onChange={(v) => set('useStartTls', v)} />
        </div>

        <fieldset className="m-0 flex flex-col gap-3 border-0 border-t border-divider p-0 pt-5">
          <legend className="sr-only">{t('admin.mail.signIn')}</legend>
          <Checkbox label={t('admin.mail.authenticate')} checked={form.authenticate} onChange={(v) => set('authenticate', v)} />
          {form.authenticate && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('admin.mail.user')}>
                {(id) => <input id={id} value={form.userId} autoComplete="off" onChange={(e) => set('userId', e.target.value)} className={inputClass} />}
              </Field>
              <Field label={t('admin.mail.password')}>
                {(id) => <input id={id} type="password" value={form.password} autoComplete="new-password" onChange={(e) => set('password', e.target.value)} className={inputClass} />}
              </Field>
            </div>
          )}
        </fieldset>

        <div className="grid grid-cols-2 gap-3 border-t border-divider pt-5">
          <Field label={t('admin.mail.from')}>
            {(id) => <input id={id} type="email" value={form.defaultFrom} onChange={(e) => set('defaultFrom', e.target.value)} className={inputClass} />}
          </Field>
          <Field label={t('admin.mail.fromName')}>
            {(id) => <input id={id} value={form.fromName} onChange={(e) => set('fromName', e.target.value)} className={inputClass} />}
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-divider pt-5">
          {problem && <span className="mr-auto text-[13px] text-fg-muted">{problem}</span>}
          <Button
            size="sm"
            icon={<Send size={15} aria-hidden="true" />}
            aria-disabled={!!problem || test.isPending}
            title={problem ?? t('admin.mail.testHint')}
            onClick={() => !problem && !test.isPending && test.mutate(form)}
          >
            {test.isPending ? t('admin.mail.sending') : t('admin.mail.sendTest')}
          </Button>
          <Button size="sm" variant="primary" type="submit" form={formId} aria-disabled={!!problem || !dirty || save.isPending} title={problem ?? (dirty ? undefined : t('files.props.noChanges'))}>
            {save.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
