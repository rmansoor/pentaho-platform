import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { Button, cn, Dialog, toast } from '@helix/ui';
import { useSession } from '../../api/repo-context';
import { schedulerKeys, useSchedulerSource } from '../../api/scheduler-context';
import type { ScheduledJob } from '../../api/scheduler';
import { displayFolder } from '../files/columns';
import {
  buildScheduleRequest,
  describeForm,
  formFromJob,
  newScheduleForm,
  scheduleFormProblem,
  WEEKDAYS,
  type Repeat,
  type ScheduleForm,
} from './schedule-form';

export type ScheduleTarget = { kind: 'new'; file: string; title?: string } | { kind: 'edit'; job: ScheduledJob };

export interface ScheduleSheetProps {
  target: ScheduleTarget | null;
  onClose: () => void;
  onSaved?: () => void;
}

const REPEATS: { value: Repeat; label: string }[] = [
  { value: 'once', label: 'Once' },
  { value: 'minutes', label: 'Every few minutes' },
  { value: 'hours', label: 'Every few hours' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'cron', label: 'Cron expression' },
];

const supportedZones = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    return [];
  }
})();

/** New schedule for a file, or edit an existing one, in a side sheet. */
export function ScheduleSheet({ target, onClose, onSaved }: ScheduleSheetProps) {
  const file = target?.kind === 'new' ? target.file : target?.job.inputFile;
  const title = target?.kind === 'edit' ? `Edit "${target.job.name}"` : 'New schedule';
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
    target.kind === 'edit' ? formFromJob(target.job, home) : newScheduleForm(file, home, new Date(), target.title),
  );
  // The home folder becomes known once the session loads.
  useEffect(() => {
    if (target.kind === 'new' && session.data) setForm((f) => (f.outputFolder.startsWith('/home/') ? { ...f, outputFolder: home } : f));
  }, [session.data, home, target.kind]);

  const set = <K extends keyof ScheduleForm>(key: K, value: ScheduleForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const problem = scheduleFormProblem(form);
  const zones = useMemo(() => (supportedZones.includes(form.timeZone) ? supportedZones : [form.timeZone, ...supportedZones]), [form.timeZone]);

  const save = useMutation({
    mutationFn: () => {
      const request = buildScheduleRequest(form, file, user, target.kind === 'edit' ? target.job.id : undefined);
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

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[13px] font-semibold text-fg-soft">Repeat</legend>
          <div className="flex flex-wrap gap-1.5">
            {REPEATS.map((r) => (
              <label
                key={r.value}
                className={cn(
                  'inline-flex h-9 cursor-pointer items-center rounded-full border px-3.5 text-[13px] font-semibold has-focus-visible:outline-2 has-focus-visible:outline-focus',
                  form.repeat === r.value ? 'border-accent bg-accent text-accent-ink' : 'border-border-strong bg-surface text-fg-soft hover:bg-accent-soft',
                )}
              >
                <input type="radio" name="repeat" value={r.value} checked={form.repeat === r.value} onChange={() => set('repeat', r.value)} className="sr-only" />
                {r.label}
              </label>
            ))}
          </div>
        </fieldset>

        {(form.repeat === 'minutes' || form.repeat === 'hours') && (
          <Field label={form.repeat === 'minutes' ? 'Every how many minutes' : 'Every how many hours'}>
            {(id) => (
              <input
                id={id}
                type="number"
                min={1}
                max={form.repeat === 'minutes' ? 59 : 23}
                value={form.interval}
                onChange={(e) => set('interval', Number(e.target.value))}
                className={cn(inputClass, 'w-28')}
              />
            )}
          </Field>
        )}

        {form.repeat === 'weekly' && (
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 p-0 text-[13px] font-semibold text-fg-soft">On</legend>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => {
                const on = form.weekdays.includes(d.value);
                return (
                  <label
                    key={d.value}
                    className={cn(
                      'inline-flex size-11 cursor-pointer items-center justify-center rounded-full border text-[13px] font-semibold has-focus-visible:outline-2 has-focus-visible:outline-focus',
                      on ? 'border-accent bg-accent-soft text-accent' : 'border-border-strong text-fg-soft hover:bg-accent-soft',
                    )}
                  >
                    <input
                      type="checkbox"
                      aria-label={d.long}
                      checked={on}
                      onChange={(e) => set('weekdays', e.target.checked ? [...form.weekdays, d.value] : form.weekdays.filter((x) => x !== d.value))}
                      className="sr-only"
                    />
                    {d.short}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {form.repeat === 'monthly' && (
          <Field label="Day of the month">
            {(id) => (
              <input id={id} type="number" min={1} max={31} value={form.dayOfMonth} onChange={(e) => set('dayOfMonth', Number(e.target.value))} className={cn(inputClass, 'w-28')} />
            )}
          </Field>
        )}

        {form.repeat === 'cron' && (
          <Field label="Cron expression" hint="Quartz syntax: seconds minutes hours day-of-month month day-of-week [year]. Use numbers for days (1 = Sunday).">
            {(id) => <input id={id} value={form.cron} onChange={(e) => set('cron', e.target.value)} className={cn(inputClass, 'font-mono text-[13px]')} />}
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={form.repeat === 'once' ? 'Date' : 'Starting'}>
            {(id) => <input id={id} type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} className={inputClass} />}
          </Field>
          <Field label={form.repeat === 'minutes' || form.repeat === 'hours' ? 'From' : 'At'}>
            {(id) => <input id={id} type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} className={inputClass} />}
          </Field>
        </div>

        {form.repeat !== 'once' && (
          <Field label="Ending (optional)">
            {(id) => <input id={id} type="date" value={form.endDate} min={form.startDate} onChange={(e) => set('endDate', e.target.value)} className={cn(inputClass, 'w-48')} />}
          </Field>
        )}

        <Field label="Time zone">
          {(id) => (
            <select id={id} value={form.timeZone} onChange={(e) => set('timeZone', e.target.value)} className={inputClass}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          )}
        </Field>

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

const inputClass = 'h-10 w-full rounded-control border border-border-strong bg-surface px-3 text-fg';

function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1.5" aria-describedby={hint ? hintId : undefined}>
      <label htmlFor={id} className="text-[13px] font-semibold text-fg-soft">
        {label}
      </label>
      {children(id)}
      {hint && (
        <p id={hintId} className="m-0 text-[12.5px] text-fg-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
