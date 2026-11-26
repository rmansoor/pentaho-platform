import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eraser } from 'lucide-react';
import { Button, Card, Dialog, toast } from '@helix/ui';
import { schedulerKeys, useJobs, useSchedulerSource } from '../../api/scheduler-context';
import { contentCleanerRequest, findScheduledCleaner } from '../../api/scheduler';
import { useSession } from '../../api/repo-context';
import { formatDateTime } from '../files/format';
import { QueryError } from '../files/QueryError';
import { t } from '../../i18n';

const inputClass = 'h-10 rounded-control border border-border-strong bg-surface px-3 text-fg';

/** Settings: clean up generated content (report output, background runs) now or every day. */
export function SettingsTab() {
  const jobs = useJobs();
  const scheduler = useSchedulerSource();
  const session = useSession();
  const queryClient = useQueryClient();
  const daysId = useId();
  const timeId = useId();
  const autoDaysId = useId();
  const [days, setDays] = useState(180);
  const [autoDays, setAutoDays] = useState(180);
  const [time, setTime] = useState('02:00');
  const [confirming, setConfirming] = useState(false);
  const owner = session.data?.userName ?? 'admin';
  const scheduled = jobs.data ? findScheduledCleaner(jobs.data) : null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: schedulerKeys.all });

  const deleteNow = useMutation({
    mutationFn: async () => {
      const id = await scheduler.createJob(contentCleanerRequest(days, owner));
      // The run-once job stays listed as finished and confuses the server's own cleaner lookup.
      await new Promise((r) => setTimeout(r, 1500));
      await scheduler.removeJob(id).catch(() => undefined);
    },
    onSuccess: () => {
      setConfirming(false);
      toast(t('admin.settings.deleting', { count: days }));
    },
    onSettled: refresh,
    onError: (e: Error) => toast(t('admin.settings.startFailed', { message: e.message }), { tone: 'danger' }),
  });

  const turnOn = useMutation({
    mutationFn: () => {
      const [hour, minute] = time.split(':').map(Number) as [number, number];
      const start = new Date();
      start.setDate(start.getDate() + 1);
      return scheduler.createJob(contentCleanerRequest(autoDays, owner, { hour, minute, start }));
    },
    onSuccess: () => toast(t('admin.settings.turnedOn', { count: autoDays, time })),
    onSettled: refresh,
    onError: (e: Error) => toast(t('admin.settings.turnOnFailed', { message: e.message }), { tone: 'danger' }),
  });

  const turnOff = useMutation({
    mutationFn: (id: string) => scheduler.removeJob(id),
    onSuccess: () => toast(t('admin.settings.turnedOff')),
    onSettled: refresh,
    onError: (e: Error) => toast(t('admin.settings.turnOffFailed', { message: e.message }), { tone: 'danger' }),
  });

  if (jobs.isError) return <QueryError error={jobs.error} onRetry={() => void jobs.refetch()} />;

  return (
    <div className="flex max-w-[720px] flex-col gap-5">
      <Card className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="m-0 text-[17px] font-extrabold">{t('admin.settings.deleteTitle')}</h2>
          <p className="m-0 mt-1 text-fg-muted">{t('admin.settings.deleteIntro')}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label htmlFor={daysId} className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-fg-soft">{t('admin.settings.olderThan')}</span>
            <input id={daysId} type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${inputClass} w-32`} />
          </label>
          <Button size="sm" variant="danger-outline" icon={<Eraser size={15} aria-hidden="true" />} aria-disabled={!(days >= 1)} onClick={() => days >= 1 && setConfirming(true)}>
            {t('admin.settings.deleteNow')}
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="m-0 text-[17px] font-extrabold">{t('admin.settings.autoTitle')}</h2>
          <p className="m-0 mt-1 text-fg-muted">{t('admin.settings.autoIntro')}</p>
        </div>
        {jobs.isPending ? (
          <p className="m-0 text-fg-muted">{t('admin.settings.checking')}</p>
        ) : scheduled ? (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-card bg-accent-soft px-4 py-3">
            <span className="flex-1">
              <strong>{t('admin.settings.on')}</strong>{' '}
              {scheduled.job.nextRun
                ? t('admin.settings.onDetailNext', { count: scheduled.olderThanDays, when: formatDateTime(scheduled.job.nextRun) })
                : t('admin.settings.onDetail', { count: scheduled.olderThanDays })}
            </span>
            <Button size="sm" onClick={() => turnOff.mutate(scheduled.job.id)} aria-disabled={turnOff.isPending}>
              {t('admin.settings.turnOff')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <label htmlFor={autoDaysId} className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-fg-soft">{t('admin.settings.olderThan')}</span>
              <input id={autoDaysId} type="number" min={1} value={autoDays} onChange={(e) => setAutoDays(Number(e.target.value))} className={`${inputClass} w-32`} />
            </label>
            <label htmlFor={timeId} className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-fg-soft">{t('admin.settings.everyDayAt')}</span>
              <input id={timeId} type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`${inputClass} w-36`} />
            </label>
            <Button size="sm" variant="primary" aria-disabled={!(autoDays >= 1) || turnOn.isPending} onClick={() => autoDays >= 1 && !turnOn.isPending && turnOn.mutate()}>
              {t('admin.settings.turnOn')}
            </Button>
          </div>
        )}
      </Card>

      <Dialog
        open={confirming}
        onClose={() => !deleteNow.isPending && setConfirming(false)}
        title={t('admin.settings.confirmTitle', { count: days })}
        description={t('admin.settings.confirmDescription')}
        actions={
          <>
            <Button size="sm" onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" variant="danger" aria-disabled={deleteNow.isPending} onClick={() => !deleteNow.isPending && deleteNow.mutate()}>
              {deleteNow.isPending ? t('admin.settings.starting') : t('common.delete')}
            </Button>
          </>
        }
      />
    </div>
  );
}
