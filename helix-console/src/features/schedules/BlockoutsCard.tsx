import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, Card, Dialog, IconButton, toast } from '@helix/ui';
import { schedulerKeys, useBlockouts, useJobs, useSchedulerSource } from '../../api/scheduler-context';
import type { ScheduledJob } from '../../api/scheduler';
import { useSession } from '../../api/repo-context';
import { formatDateTime } from '../files/format';
import { BlockoutSheet, type BlockoutTarget } from './BlockoutSheet';
import { t } from '../../i18n';
import { blockoutFormFromJob, conflictsFor, describeBlockout, HORIZON_DAYS, specFromJob, toBlockout } from './blockouts';

/** Blockout times (administrators): when no schedule may run. */
export function BlockoutsCard() {
  const session = useSession();
  const admin = session.data?.isAdministrator === true;
  const blockouts = useBlockouts(admin);
  const jobs = useJobs();
  const source = useSchedulerSource();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<BlockoutTarget | null>(null);
  const [deleting, setDeleting] = useState<ScheduledJob | null>(null);

  const rows = useMemo(
    () =>
      (blockouts.data ?? [])
        .map((job) => {
          const form = blockoutFormFromJob(job);
          const blockout = toBlockout(job);
          // How many schedules it holds back over the horizon.
          const held = blockout
            ? (jobs.data ?? []).filter((j) => {
                const spec = j.state === 'active' ? specFromJob(j) : null;
                return spec ? conflictsFor(spec, [blockout]).blocked > 0 : false;
              }).length
            : 0;
          return { job, text: describeBlockout(form.recurrence, job.trigger.duration ?? 0), timeZone: form.recurrence.timeZone, held };
        })
        .sort((a, b) => (a.job.nextRun?.getTime() ?? Infinity) - (b.job.nextRun?.getTime() ?? Infinity)),
    [blockouts.data, jobs.data],
  );

  const remove = useMutation({
    mutationFn: (job: ScheduledJob) => source.removeJob(job.id),
    onSuccess: () => {
      toast(t('schedules.blockouts.removed'));
      setDeleting(null);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: schedulerKeys.all }),
    onError: (e: Error) => toast(t('schedules.blockouts.removeFailed', { message: e.message }), { tone: 'danger' }),
  });

  // Only administrators can list blockouts; everyone else doesn't see the card.
  if (!admin || blockouts.isError) return null;

  return (
    <Card className="overflow-hidden">
      <section aria-labelledby="blockouts-title">
        <div className="flex flex-wrap items-center gap-3 border-b border-divider px-[18px] py-3.5">
          <div className="min-w-0 flex-1">
            <h2 id="blockouts-title" className="m-0 text-[16px] font-bold">
              {t('schedules.blockouts.title')}
            </h2>
            <p className="m-0 text-[13px] text-fg-muted">{t('schedules.blockouts.intro')}</p>
          </div>
          <Button size="sm" icon={<Plus size={15} aria-hidden="true" />} onClick={() => setEditing({ kind: 'new' })}>
            {t('schedules.blockouts.add')}
          </Button>
        </div>

        {blockouts.isPending ? (
          <p className="m-0 px-[18px] py-6 text-fg-muted">{t('schedules.blockouts.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="m-0 px-[18px] py-6 text-fg-muted">{t('schedules.blockouts.none')}</p>
        ) : (
          <ul aria-label={t('schedules.blockouts.title')} className="m-0 list-none p-0">
            {rows.map(({ job, text, timeZone, held }) => (
              <li key={job.id} className="flex items-center gap-3 border-t border-divider px-[18px] py-2.5 first:border-t-0">
                <span aria-hidden="true" className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-divider text-fg-soft">
                  <Ban size={16} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{text}</span>
                  <span className="truncate text-[12.5px] text-fg-muted">
                    {timeZone.replace(/_/g, ' ')}
                    {job.nextRun ? ` · ${t('schedules.blockouts.next', { when: formatDateTime(job.nextRun) })}` : ''}
                    {held ? ` · ${t('schedules.blockouts.holdsBack', { count: held, weeks: HORIZON_DAYS / 7 })}` : ''}
                  </span>
                </span>
                <IconButton size="sm" variant="ghost" aria-label={t('schedules.blockouts.editNamed', { what: text })} title={t('common.edit')} onClick={() => setEditing({ kind: 'edit', job })}>
                  <Pencil size={16} aria-hidden="true" />
                </IconButton>
                <IconButton
                  size="sm"
                  variant="ghost"
                  aria-label={t('schedules.blockouts.removeNamed', { what: text })}
                  title={t('common.remove')}
                  onClick={() => setDeleting(job)}
                  className="text-danger-fg"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </section>

      <BlockoutSheet target={editing} onClose={() => setEditing(null)} />
      <Dialog
        open={deleting !== null}
        onClose={() => !remove.isPending && setDeleting(null)}
        title={t('schedules.blockouts.removeTitle')}
        description={t('schedules.blockouts.removeDescription')}
        actions={
          <>
            <Button size="sm" onClick={() => setDeleting(null)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" variant="danger" onClick={() => deleting && remove.mutate(deleting)}>
              {t('common.remove')}
            </Button>
          </>
        }
      />
    </Card>
  );
}
