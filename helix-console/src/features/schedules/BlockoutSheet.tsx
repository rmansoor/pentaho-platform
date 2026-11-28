import { useId, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, CalendarX2 } from 'lucide-react';
import { Button, cn, Dialog, toast } from '@helix/ui';
import { schedulerKeys, useJobs, useSchedulerSource } from '../../api/scheduler-context';
import type { ScheduledJob } from '../../api/scheduler';
import { inputClass, RecurrenceFields } from './RecurrenceFields';
import {
  blockoutFormFromJob,
  blockoutProblem,
  buildBlockoutRequest,
  conflictsFor,
  describeBlockout,
  durationOf,
  HORIZON_DAYS,
  newBlockoutForm,
  specFromJob,
  specFromRecurrence,
  type BlockoutForm,
} from './blockouts';
import { t } from '../../i18n';

export type BlockoutTarget = { kind: 'new' } | { kind: 'edit'; job: ScheduledJob };

/** New or edit a blockout time, with the schedules it would hold back. */
export function BlockoutSheet({ target, onClose }: { target: BlockoutTarget | null; onClose: () => void }) {
  return (
    <Dialog
      variant="sheet"
      open={target !== null}
      onClose={onClose}
      title={target?.kind === 'edit' ? t('schedules.blockouts.sheetEdit') : t('schedules.blockouts.sheetNew')}
      description={t('schedules.blockouts.sheetDescription')}
      actions={null}
    >
      {target && <BlockoutBody key={target.kind === 'edit' ? target.job.id : 'new'} target={target} onClose={onClose} />}
    </Dialog>
  );
}

function BlockoutBody({ target, onClose }: { target: BlockoutTarget; onClose: () => void }) {
  const scheduler = useSchedulerSource();
  const queryClient = useQueryClient();
  const jobs = useJobs();
  const formId = useId();
  const [form, setForm] = useState<BlockoutForm>(() => (target.kind === 'edit' ? blockoutFormFromJob(target.job) : newBlockoutForm()));
  const problem = blockoutProblem(form);
  const duration = durationOf(form);

  // The schedules this blockout would hold back, and how many of their runs.
  const affected = useMemo(() => {
    const spec = problem ? null : specFromRecurrence(form.recurrence);
    if (!spec || !jobs.data) return null;
    const blockout = { spec, duration };
    return jobs.data
      .filter((j) => j.state === 'active' || j.state === 'blocked')
      .flatMap((job) => {
        const jobSpec = specFromJob(job);
        const c = jobSpec ? conflictsFor(jobSpec, [blockout]) : null;
        return c?.blocked ? [{ job, ...c }] : [];
      })
      .sort((a, b) => b.blocked - a.blocked);
  }, [form, problem, duration, jobs.data]);

  const save = useMutation({
    mutationFn: () => {
      const request = buildBlockoutRequest(form);
      return target.kind === 'edit' ? scheduler.updateBlockout(target.job.id, request) : scheduler.createBlockout(request);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: schedulerKeys.all });
      toast(target.kind === 'edit' ? t('schedules.blockouts.saved') : t('schedules.blockouts.added', { what: describeBlockout(form.recurrence, duration) }));
      onClose();
    },
    onError: (e: Error) => toast(t('schedules.blockouts.saveFailed', { message: e.message }), { tone: 'danger' }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!problem && !save.isPending) save.mutate();
  };
  const setDuration = (key: 'hours' | 'minutes', value: string) => setForm((f) => ({ ...f, [key]: value === '' ? 0 : Number(value) }));

  return (
    <div className="flex h-full flex-col">
      <form id={formId} onSubmit={submit} className="flex flex-col gap-5">
        <RecurrenceFields
          value={form.recurrence}
          onChange={(patch) => setForm((f) => ({ ...f, recurrence: { ...f.recurrence, ...patch } }))}
          labels={{ starting: t('schedules.form.starting'), at: t('schedules.form.from') }}
        />

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[13px] font-semibold text-fg-soft">{t('schedules.blockouts.lasts')}</legend>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                aria-label={t('schedules.blockouts.hours')}
                value={form.hours}
                onChange={(e) => setDuration('hours', e.target.value)}
                className={cn(inputClass, 'w-24')}
              />
              <span className="text-fg-soft">{t('schedules.blockouts.hoursUnit')}</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={59}
                step={5}
                aria-label={t('schedules.blockouts.minutes')}
                value={form.minutes}
                onChange={(e) => setDuration('minutes', e.target.value)}
                className={cn(inputClass, 'w-24')}
              />
              <span className="text-fg-soft">{t('schedules.blockouts.minutesUnit')}</span>
            </label>
          </div>
        </fieldset>

        <div role="status" className="flex flex-col gap-3 rounded-card bg-accent-soft px-4 py-3">
          <span className="flex items-center gap-3">
            <Ban size={18} className="shrink-0 text-accent" aria-hidden="true" />
            <span>
              <strong>{problem ? t('schedules.blockouts.incomplete') : describeBlockout(form.recurrence, duration)}</strong>
              {!problem && <span className="text-fg-soft"> · {form.recurrence.timeZone.replace(/_/g, ' ')}</span>}
            </span>
          </span>
          {affected && (
            <span className="text-[13px] text-fg-soft">
              {affected.length === 0
                ? t('schedules.blockouts.affectsNone', { weeks: HORIZON_DAYS / 7 })
                : t(affected.length > 3 ? 'schedules.blockouts.affectsMore' : 'schedules.blockouts.affects', {
                    weeks: HORIZON_DAYS / 7,
                    more: affected.length - 3,
                    list: affected
                      .slice(0, 3)
                      .map((a) =>
                        a.blocked === a.runs
                          ? t('schedules.blockouts.affectedAll', { name: a.job.name })
                          : t('schedules.blockouts.affectedSome', { count: a.blocked, name: a.job.name }),
                      )
                      .join(', '),
                  })}
            </span>
          )}
        </div>
      </form>

      <div className="sticky bottom-0 -mx-6 mt-auto -mb-5 flex items-center justify-end gap-2 border-t border-divider bg-surface px-6 py-4">
        {problem && <span className="mr-auto text-[13px] text-fg-muted">{problem}</span>}
        <Button size="sm" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          type="submit"
          form={formId}
          icon={<CalendarX2 size={15} aria-hidden="true" />}
          aria-disabled={!!problem || save.isPending}
          title={problem ?? undefined}
        >
          {save.isPending ? t('common.saving') : target.kind === 'edit' ? t('common.saveChanges') : t('schedules.blockouts.addBlockout')}
        </Button>
      </div>
    </div>
  );
}
