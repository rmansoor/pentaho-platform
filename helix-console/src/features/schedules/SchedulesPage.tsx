import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Pause, Pencil, Play, RefreshCw, Search, Trash2, Zap } from 'lucide-react';
import { Button, Card, cn, Dialog, IconButton, toast } from '@helix/ui';
import { schedulerKeys, useJobs, useSchedulerSource, useSchedulerStatus } from '../../api/scheduler-context';
import { kindOf } from '../../api/repo';
import type { JobState, ScheduledJob } from '../../api/scheduler';
import { FileKindIcon } from '../files/FileKindIcon';
import { QueryError } from '../files/QueryError';
import { formatDateTime } from '../files/format';
import { displayFolder } from '../files/columns';
import { ScheduleSheet } from './ScheduleSheet';

const STATE_LABEL: Record<JobState, string> = {
  active: 'Active',
  paused: 'Paused',
  complete: 'Finished',
  error: 'Error',
  blocked: 'Blocked',
  unknown: 'Unknown',
};

const STATE_TONE: Record<JobState, string> = {
  active: 'bg-success-bg text-success-fg',
  paused: 'bg-divider text-fg-soft',
  complete: 'bg-accent-soft text-accent',
  error: 'bg-danger-bg text-danger-fg',
  blocked: 'bg-danger-bg text-danger-fg',
  unknown: 'bg-divider text-fg-soft',
};

const fileTitle = (path?: string) => {
  if (!path) return '—';
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
};
const folderOf = (path?: string) => (path ? path.slice(0, path.lastIndexOf('/')) : undefined);

/** Schedules: every job the user can see, with run now, pause/resume and delete. */
export function SchedulesPage() {
  const jobs = useJobs();
  const status = useSchedulerStatus();
  const source = useSchedulerSource();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [owner, setOwner] = useState('');
  const [state, setState] = useState<'' | JobState>('');
  const [deleting, setDeleting] = useState<ScheduledJob | null>(null);
  const [editing, setEditing] = useState<ScheduledJob | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: schedulerKeys.all });
  const act = useMutation({
    mutationFn: async ({ job, action }: { job: ScheduledJob; action: 'pause' | 'resume' | 'run' | 'delete' }) => {
      if (action === 'pause') await source.pauseJob(job.id);
      else if (action === 'resume') await source.resumeJob(job.id);
      else if (action === 'run') await source.runNow(job.id);
      else await source.removeJob(job.id);
    },
    onSuccess: (_, { job, action }) => {
      const verb = { pause: 'Paused', resume: 'Resumed', run: 'Started', delete: 'Deleted' }[action];
      toast(`${verb} "${job.name}"`);
      if (action === 'delete') setDeleting(null);
    },
    onSettled: refresh,
    onError: (e: Error) => toast(`Couldn't update the schedule: ${e.message}`, { tone: 'danger' }),
  });

  const setScheduler = useMutation({
    mutationFn: (running: boolean) => source.setStatus(running),
    onSuccess: (_, running) => toast(running ? 'Scheduler started' : 'Scheduler paused; no schedules will run'),
    onSettled: refresh,
    onError: (e: Error) => toast(`Couldn't change the scheduler: ${e.message}`, { tone: 'danger' }),
  });

  const owners = useMemo(() => [...new Set(jobs.data?.map((j) => j.owner))].sort(), [jobs.data]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (jobs.data ?? [])
      .filter((j) => (!owner || j.owner === owner) && (!state || j.state === state))
      .filter((j) => !q || j.name.toLowerCase().includes(q) || (j.inputFile ?? '').toLowerCase().includes(q))
      .sort((a, b) => (a.nextRun?.getTime() ?? Infinity) - (b.nextRun?.getTime() ?? Infinity));
  }, [jobs.data, query, owner, state]);

  const paused = status.data === 'paused' || status.data === 'stopped';
  const busy = act.isPending ? act.variables?.job.id : undefined;

  return (
    <div className="flex flex-col gap-5 pt-1">
      <header className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.02em]">Schedules</h1>
        </div>
        {status.data && (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] font-bold',
                paused ? 'bg-danger-bg text-danger-fg' : 'bg-success-bg text-success-fg',
              )}
            >
              <span aria-hidden="true" className={cn('size-1.5 rounded-full', paused ? 'bg-danger-fg' : 'bg-success-fg')} />
              Scheduler {paused ? 'paused' : 'running'}
            </span>
            <Button
              size="sm"
              icon={paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
              onClick={() => setScheduler.mutate(paused)}
              aria-disabled={setScheduler.isPending}
            >
              {paused ? 'Start scheduler' : 'Pause scheduler'}
            </Button>
          </div>
        )}
      </header>

      {paused && (
        <div role="status" className="rounded-card bg-danger-bg px-[18px] py-3 text-danger-fg">
          <strong>The scheduler is paused.</strong> No schedules will run until it's started again.
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-divider px-[18px] py-3.5">
          <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-control border border-border bg-surface px-3 sm:max-w-[320px]">
            <Search size={15} className="text-fg-muted" aria-hidden="true" />
            <span className="sr-only">Search schedules</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or file"
              className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-muted"
            />
          </label>
          <label className="flex items-center gap-2 text-[13px] text-fg-muted">
            Owner
            <select value={owner} onChange={(e) => setOwner(e.target.value)} className="h-9 rounded-control border border-border-strong bg-surface px-2 text-fg">
              <option value="">Anyone</option>
              {owners.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[13px] text-fg-muted">
            State
            <select
              value={state}
              onChange={(e) => setState(e.target.value as '' | JobState)}
              className="h-9 rounded-control border border-border-strong bg-surface px-2 text-fg"
            >
              <option value="">Any</option>
              {(['active', 'paused', 'complete', 'error'] as const).map((s) => (
                <option key={s} value={s}>
                  {STATE_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex-1" />
          <IconButton size="sm" variant="ghost" aria-label="Refresh" title="Refresh" onClick={() => void refresh()}>
            <RefreshCw size={16} aria-hidden="true" className={jobs.isFetching ? 'animate-spin motion-reduce:animate-none' : undefined} />
          </IconButton>
        </div>

        {jobs.isPending ? (
          <p className="m-0 px-[18px] py-10 text-fg-muted">Loading schedules…</p>
        ) : jobs.isError ? (
          <QueryError error={jobs.error} onRetry={() => void jobs.refetch()} />
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-[18px] py-14 text-center">
            <CalendarClock size={28} className="text-fg-muted" aria-hidden="true" />
            <p className="m-0 font-bold">{jobs.data.length ? 'No schedules match' : 'No schedules yet'}</p>
            <p className="m-0 text-fg-muted">
              {jobs.data.length ? 'Try a different search or filter.' : 'Schedules you create from a report appear here.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-left">
              <caption className="sr-only">Schedules</caption>
              <thead>
                <tr className="text-[12.5px] font-semibold text-fg-muted">
                  <th scope="col" className="px-[18px] py-2.5 font-semibold">Schedule</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Repeats</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Next run</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Last run</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Owner</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">State</th>
                  <th scope="col" className="px-[18px] py-2.5 text-right font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((job) => (
                  <tr key={job.id} className="border-t border-divider align-middle hover:bg-bg">
                    <th scope="row" className="px-[18px] py-2.5 font-normal">
                      <span className="flex min-w-0 items-center gap-3">
                        <FileKindIcon kind={job.inputFile ? kindOf(job.inputFile) : 'file'} />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-semibold">{job.name}</span>
                          <span className="truncate text-[12.5px] text-fg-muted" title={job.inputFile}>
                            {fileTitle(job.inputFile)} · {displayFolder(folderOf(job.inputFile))}
                          </span>
                        </span>
                      </span>
                    </th>
                    <td className="px-3 py-2.5">{job.recurrence}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-fg-soft">{job.state === 'paused' ? '—' : (formatDateTime(job.nextRun) ?? '—')}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-fg-muted">{formatDateTime(job.lastRun) ?? 'Not yet'}</td>
                    <td className="px-3 py-2.5 text-fg-soft">{job.owner}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn('inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-bold', STATE_TONE[job.state])}>
                        {STATE_LABEL[job.state]}
                      </span>
                    </td>
                    <td className="px-[18px] py-2.5">
                      <span className="flex justify-end gap-1">
                        <IconButton
                          size="sm"
                          variant="ghost"
                          aria-label={`Run ${job.name} now`}
                          title="Run now"
                          aria-disabled={busy === job.id}
                          onClick={() => busy !== job.id && act.mutate({ job, action: 'run' })}
                        >
                          <Zap size={16} aria-hidden="true" />
                        </IconButton>
                        {job.state === 'paused' ? (
                          <IconButton
                            size="sm"
                            variant="ghost"
                            aria-label={`Resume ${job.name}`}
                            title="Resume"
                            aria-disabled={busy === job.id}
                            onClick={() => busy !== job.id && act.mutate({ job, action: 'resume' })}
                          >
                            <Play size={16} aria-hidden="true" />
                          </IconButton>
                        ) : (
                          <IconButton
                            size="sm"
                            variant="ghost"
                            aria-label={`Pause ${job.name}`}
                            title="Pause"
                            aria-disabled={busy === job.id || job.state === 'complete'}
                            onClick={() => busy !== job.id && job.state !== 'complete' && act.mutate({ job, action: 'pause' })}
                          >
                            <Pause size={16} aria-hidden="true" />
                          </IconButton>
                        )}
                        <IconButton
                          size="sm"
                          variant="ghost"
                          aria-label={`Edit ${job.name}`}
                          title={job.inputFile ? 'Edit' : "This schedule's file is unknown"}
                          aria-disabled={!job.inputFile}
                          onClick={() => job.inputFile && setEditing(job)}
                        >
                          <Pencil size={16} aria-hidden="true" />
                        </IconButton>
                        <IconButton
                          size="sm"
                          variant="ghost"
                          aria-label={`Delete ${job.name}`}
                          title="Delete"
                          onClick={() => setDeleting(job)}
                          className="text-danger-fg"
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </IconButton>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ScheduleSheet target={editing ? { kind: 'edit', job: editing } : null} onClose={() => setEditing(null)} />
      <Dialog
        open={deleting !== null}
        onClose={() => !act.isPending && setDeleting(null)}
        title={`Delete "${deleting?.name ?? ''}"?`}
        description="The schedule stops and is removed. Output it already produced stays where it is."
        actions={
          <>
            <Button size="sm" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button size="sm" variant="danger" onClick={() => deleting && act.mutate({ job: deleting, action: 'delete' })}>
              Delete schedule
            </Button>
          </>
        }
      />
    </div>
  );
}
