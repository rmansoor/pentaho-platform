import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock } from 'lucide-react';
import { Button, cn, Dialog, Switch, toast } from '@helix/ui';
import { ReportParameters, type ReportParametersHandle } from './ReportParameters';
import { Field, inputClass, RecurrenceFields } from './RecurrenceFields';
import { useSession } from '../../api/repo-context';
import { schedulerKeys, useBlockouts, useSchedulerSource } from '../../api/scheduler-context';
import { conflictsFor, describeConflict, specFromRecurrence, toBlockout } from './blockouts';
import type { ScheduledJob } from '../../api/scheduler';
import { displayFolder } from '../files/columns';
import { formatDateTime } from '../files/format';
import {
  buildScheduleRequest,
  buildTrigger,
  describeForm,
  formFromJob,
  newScheduleForm,
  recurrenceProblem,
  scheduleFormProblem,
  type ScheduleEmail,
  type ScheduleForm,
} from './schedule-form';

export type ScheduleTarget =
  /** `once`: "run in background" from plugin content, a single run starting now. */
  | { kind: 'new'; file: string; title?: string; once?: boolean }
  | { kind: 'edit'; job: ScheduledJob };

export interface ScheduleSheetProps {
  target: ScheduleTarget | null;
  onClose: () => void;
  onSaved?: () => void;
}

/** A single run, starting now. */
function runNowForm(form: ScheduleForm): ScheduleForm {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    ...form,
    repeat: 'once',
    startDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    startTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}

/** New schedule for a file, or edit an existing one, in a side sheet. */
export function ScheduleSheet({ target, onClose, onSaved }: ScheduleSheetProps) {
  const file = target?.kind === 'new' ? target.file : target?.job.inputFile;
  const title = target?.kind === 'edit' ? `Edit "${target.job.name}"` : target?.once ? 'Run in background' : 'New schedule';
  return (
    <Dialog
      variant="sheet"
      open={target !== null}
      onClose={onClose}
      title={title}
      description={file ? `${file.slice(file.lastIndexOf('/') + 1)} · ${displayFolder(file.slice(0, file.lastIndexOf('/')))}` : undefined}
      actions={null}
    >
      {target && file && <ScheduleFormBody key={target.kind === 'edit' ? target.job.id : file} target={target} file={file} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function ScheduleFormBody({ target, file, onClose, onSaved }: { target: ScheduleTarget; file: string; onClose: () => void; onSaved?: () => void }) {
  const session = useSession();
  const scheduler = useSchedulerSource();
  const queryClient = useQueryClient();
  const formId = useId();
  const user = session.data?.userName ?? 'admin';
  const home = `/home/${user}`;
  const [form, setForm] = useState<ScheduleForm>(() =>
    target.kind === 'edit'
      ? formFromJob(target.job, home)
      : target.once
        ? runNowForm(newScheduleForm(file, home, new Date(), target.title))
        : newScheduleForm(file, home, new Date(), target.title),
  );
  // The home folder becomes known once the session loads.
  useEffect(() => {
    if (target.kind === 'new' && session.data) setForm((f) => (f.outputFolder.startsWith('/home/') ? { ...f, outputFolder: home } : f));
  }, [session.data, home, target.kind]);

  const set = <K extends keyof ScheduleForm>(key: K, value: ScheduleForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setEmail = <K extends keyof ScheduleEmail>(key: K, value: ScheduleEmail[K]) => setForm((f) => ({ ...f, email: { ...f.email, [key]: value } }));

  const hasParameters = useQuery({
    queryKey: ['scheduler', 'has-parameters', file],
    queryFn: ({ signal }) => scheduler.hasParameters(file, signal),
    staleTime: 60_000,
  });
  const emailReady = useQuery({ queryKey: ['scheduler', 'email-configured'], queryFn: ({ signal }) => scheduler.emailConfigured(signal), staleTime: 60_000 });
  const prompt = useRef<ReportParametersHandle>(null);
  const [parametersComplete, setParametersComplete] = useState(true);
  const onCompleteChange = useCallback((complete: boolean) => setParametersComplete(complete), []);

  /*
   * Blockout conflicts. Administrators can list blockouts, so we count the blocked runs here; for
   * everyone else we ask the server, whose answer is only trusted when it says every run is blocked.
   */
  const admin = session.data?.isAdministrator === true;
  const blockouts = useBlockouts(admin);
  const { repeat, interval, weekdays, dayOfMonth, cron, startDate, startTime, endDate, timeZone } = form;
  const recurrence = useMemo(
    () => ({ repeat, interval, weekdays, dayOfMonth, cron, startDate, startTime, endDate, timeZone }),
    [repeat, interval, weekdays, dayOfMonth, cron, startDate, startTime, endDate, timeZone],
  );
  const conflict = useMemo(() => {
    const spec = blockouts.data?.length ? specFromRecurrence(recurrence) : null;
    return spec ? conflictsFor(spec, blockouts.data!.flatMap((j) => toBlockout(j) ?? [])) : null;
  }, [recurrence, blockouts.data]);
  const serverStatus = useQuery({
    queryKey: ['scheduler', 'block-status', recurrence],
    queryFn: () => scheduler.blockStatus({ jobName: 'check', inputFile: file, timeZone: recurrence.timeZone, ...buildTrigger(recurrence), jobParameters: [] }),
    enabled: session.data?.isAdministrator === false && !recurrenceProblem(recurrence),
    retry: false,
    staleTime: 30_000,
  });
  const neverRuns = conflict ? conflict.runs > 0 && conflict.blocked === conflict.runs : serverStatus.data?.totallyBlocked === true;
  const conflictText = conflict
    ? describeConflict(conflict)
    : neverRuns
      ? 'Every run falls in a blockout time, so this schedule would never run.'
      : null;

  const problem =
    scheduleFormProblem(form) ??
    (hasParameters.data && !parametersComplete ? 'Fill in the required report parameters' : null) ??
    (neverRuns ? 'Change when it runs: it falls in a blockout time' : null);

  const save = useMutation({
    mutationFn: () => {
      let reportParameters: ReturnType<ReportParametersHandle['collect']> = [];
      if (hasParameters.data) {
        reportParameters = prompt.current?.collect() ?? null;
        if (!reportParameters) throw new Error("the report's parameters haven't loaded yet.");
      }
      const request = buildScheduleRequest(form, file, user, target.kind === 'edit' ? target.job.id : undefined, reportParameters);
      return target.kind === 'edit' ? scheduler.updateJob(request) : scheduler.createJob(request);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: schedulerKeys.all });
      toast(target.kind === 'edit' ? `Saved "${form.name.trim()}"` : `Scheduled "${form.name.trim()}" · ${describeForm(form)}`);
      onSaved?.();
      onClose();
    },
    onError: (e: Error) => toast(`Couldn't save the schedule: ${e.message}`, { tone: 'danger' }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!problem && !save.isPending) save.mutate();
  };

  return (
    <div className="flex h-full flex-col">
      <form id={formId} onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Name">
          {(id) => <input id={id} value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} />}
        </Field>
        <Field label="Save output to" hint="A repository folder; the file name is the schedule name plus the run time.">
          {(id) => <input id={id} value={form.outputFolder} onChange={(e) => set('outputFolder', e.target.value)} className={cn(inputClass, 'font-mono text-[13px]')} />}
        </Field>

        <RecurrenceFields value={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />

        {conflictText && (
          <div role="status" className={cn('flex items-start gap-3 rounded-card px-4 py-3', neverRuns ? 'bg-danger-bg text-danger-fg' : 'bg-warning-bg text-warning-fg')}>
            <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              {conflictText}
              {conflict?.firstBlocked && !neverRuns ? ` The first is ${formatDateTime(conflict.firstBlocked)}.` : ''}
              {admin ? ' Blockout times are listed under Schedules.' : ''}
            </span>
          </div>
        )}

        {hasParameters.data && (
          <section aria-labelledby={`${formId}-params`} className="flex flex-col gap-2">
            <h3 id={`${formId}-params`} className="m-0 text-[13px] font-semibold text-fg-soft">
              Report parameters
            </h3>
            <ReportParameters ref={prompt} file={file} saved={form.savedParameters} onCompleteChange={onCompleteChange} />
          </section>
        )}

        <section aria-label="Email" className="flex flex-col gap-4 border-t border-divider pt-5">
          <Switch
            checked={form.email.enabled}
            onChange={(on) => setEmail('enabled', on)}
            disabled={emailReady.data === false && !form.email.enabled}
            label="Email the output"
            description={
              emailReady.data === false
                ? 'Set up a mail server in Administration › Mail server to email output.'
                : 'Each run sends the result as an attachment.'
            }
          />
          {form.email.enabled && (
            <>
              <Field label="To" hint="Separate addresses with commas.">
                {(id) => <input id={id} type="text" inputMode="email" value={form.email.to} onChange={(e) => setEmail('to', e.target.value)} className={inputClass} />}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cc (optional)">
                  {(id) => <input id={id} type="text" inputMode="email" value={form.email.cc} onChange={(e) => setEmail('cc', e.target.value)} className={inputClass} />}
                </Field>
                <Field label="Bcc (optional)">
                  {(id) => <input id={id} type="text" inputMode="email" value={form.email.bcc} onChange={(e) => setEmail('bcc', e.target.value)} className={inputClass} />}
                </Field>
              </div>
              <Field label="Subject">
                {(id) => <input id={id} value={form.email.subject} onChange={(e) => setEmail('subject', e.target.value)} className={inputClass} />}
              </Field>
              <Field label="Message (optional)">
                {(id) => (
                  <textarea
                    id={id}
                    rows={3}
                    value={form.email.message}
                    onChange={(e) => setEmail('message', e.target.value)}
                    className="w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-fg"
                  />
                )}
              </Field>
              <Field label="Attachment name">
                {(id) => <input id={id} value={form.email.attachmentName} onChange={(e) => setEmail('attachmentName', e.target.value)} className={inputClass} />}
              </Field>
            </>
          )}
        </section>

        <div role="status" className="flex items-center gap-3 rounded-card bg-accent-soft px-4 py-3">
          <CalendarClock size={18} className="shrink-0 text-accent" aria-hidden="true" />
          <span>
            <strong>{describeForm(form)}</strong>
            <span className="text-fg-soft">
              {' '}
              · {form.timeZone.replace(/_/g, ' ')}
              {form.endDate && form.repeat !== 'once' ? ` · until ${form.endDate}` : ''}
            </span>
          </span>
        </div>
      </form>

      <div className="sticky bottom-0 -mx-6 mt-auto -mb-5 flex items-center justify-end gap-2 border-t border-divider bg-surface px-6 py-4">
        {problem && <span className="mr-auto text-[13px] text-fg-muted">{problem}</span>}
        <Button size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" type="submit" form={formId} aria-disabled={!!problem || save.isPending} title={problem ?? undefined}>
          {save.isPending ? 'Saving…' : target.kind === 'edit' ? 'Save changes' : 'Create schedule'}
        </Button>
      </div>
    </div>
  );
}
