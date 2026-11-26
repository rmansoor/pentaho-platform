import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eraser } from 'lucide-react';
import { Button, Card, Dialog, toast } from '@helix/ui';
import { schedulerKeys, useJobs, useSchedulerSource } from '../../api/scheduler-context';
import { contentCleanerRequest, findScheduledCleaner } from '../../api/scheduler';
import { useSession } from '../../api/repo-context';
import { formatDateTime } from '../files/format';
import { QueryError } from '../files/QueryError';

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
      toast(`Deleting generated files older than ${days} days`);
    },
    onSettled: refresh,
    onError: (e: Error) => toast(`Couldn't start the clean-up: ${e.message}`, { tone: 'danger' }),
  });

  const turnOn = useMutation({
    mutationFn: () => {
      const [hour, minute] = time.split(':').map(Number) as [number, number];
      const start = new Date();
      start.setDate(start.getDate() + 1);
      return scheduler.createJob(contentCleanerRequest(autoDays, owner, { hour, minute, start }));
    },
    onSuccess: () => toast(`Generated files older than ${autoDays} days will be deleted every day at ${time}`),
    onSettled: refresh,
    onError: (e: Error) => toast(`Couldn't turn on the clean-up: ${e.message}`, { tone: 'danger' }),
  });

  const turnOff = useMutation({
    mutationFn: (id: string) => scheduler.removeJob(id),
    onSuccess: () => toast('Automatic clean-up turned off'),
    onSettled: refresh,
    onError: (e: Error) => toast(`Couldn't turn off the clean-up: ${e.message}`, { tone: 'danger' }),
  });

  if (jobs.isError) return <QueryError error={jobs.error} onRetry={() => void jobs.refetch()} />;

  return (
    <div className="flex max-w-[720px] flex-col gap-5">
      <Card className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="m-0 text-[17px] font-extrabold">Delete generated files</h2>
          <p className="m-0 mt-1 text-fg-muted">Removes output that reports and schedules produced: background runs and scheduled output, not the reports themselves.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label htmlFor={daysId} className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-fg-soft">Older than (days)</span>
            <input id={daysId} type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${inputClass} w-32`} />
          </label>
          <Button size="sm" variant="danger-outline" icon={<Eraser size={15} aria-hidden="true" />} aria-disabled={!(days >= 1)} onClick={() => days >= 1 && setConfirming(true)}>
            Delete now
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="m-0 text-[17px] font-extrabold">Automatic clean-up</h2>
          <p className="m-0 mt-1 text-fg-muted">Runs every day and deletes generated files older than the age you set.</p>
        </div>
        {jobs.isPending ? (
          <p className="m-0 text-fg-muted">Checking…</p>
        ) : scheduled ? (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-card bg-accent-soft px-4 py-3">
            <span className="flex-1">
              <strong>On.</strong> Deletes files older than {scheduled.olderThanDays} days, every day
              {scheduled.job.nextRun ? `; next run ${formatDateTime(scheduled.job.nextRun)}` : ''}.
            </span>
            <Button size="sm" onClick={() => turnOff.mutate(scheduled.job.id)} aria-disabled={turnOff.isPending}>
              Turn off
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <label htmlFor={autoDaysId} className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-fg-soft">Older than (days)</span>
              <input id={autoDaysId} type="number" min={1} value={autoDays} onChange={(e) => setAutoDays(Number(e.target.value))} className={`${inputClass} w-32`} />
            </label>
            <label htmlFor={timeId} className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-fg-soft">Every day at</span>
              <input id={timeId} type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`${inputClass} w-36`} />
            </label>
            <Button size="sm" variant="primary" aria-disabled={!(autoDays >= 1) || turnOn.isPending} onClick={() => autoDays >= 1 && !turnOn.isPending && turnOn.mutate()}>
              Turn on
            </Button>
          </div>
        )}
      </Card>

      <Dialog
        open={confirming}
        onClose={() => !deleteNow.isPending && setConfirming(false)}
        title={`Delete generated files older than ${days} days?`}
        description="Output older than that is removed from every user's folders. This can't be undone."
        actions={
          <>
            <Button size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="danger" aria-disabled={deleteNow.isPending} onClick={() => !deleteNow.isPending && deleteNow.mutate()}>
              {deleteNow.isPending ? 'Starting…' : 'Delete'}
            </Button>
          </>
        }
      />
    </div>
  );
}
