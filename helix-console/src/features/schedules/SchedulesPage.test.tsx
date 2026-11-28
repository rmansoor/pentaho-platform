import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/render-app';
import { createFixtureRepoSource } from '../../api/mock/repo-fixture';
import { createFixtureSchedulerSource } from '../../api/mock/scheduler-fixture';
import { describeRecurrence, parseJobsResponse } from '../../api/scheduler';

const open = (scheduler = createFixtureSchedulerSource()) => renderApp('/schedules', createFixtureRepoSource(), scheduler);
const table = () => screen.getByRole('table', { name: 'Schedules' });
const rowFor = (name: string) => within(table()).getByRole('rowheader', { name: new RegExp(name) }).closest('tr')!;
const names = () => within(table()).getAllByRole('rowheader').map((h) => h.querySelector('.font-semibold')?.textContent);

describe('Schedules', () => {
  it('lists schedules by next run with file, recurrence, owner and state', async () => {
    await open();
    await screen.findByRole('table', { name: 'Schedules' });

    expect(names()).toEqual(['Orders refresh', 'Inventory daily', 'Top customers weekly']);
    const inventory = rowFor('Inventory daily');
    expect(within(inventory).getByText(/Every day at/)).toBeInTheDocument();
    expect(within(inventory).getByText('Inventory List · Public / Steel Wheels / Reports')).toBeInTheDocument();
    expect(within(inventory).getByText('Active')).toBeInTheDocument();
    expect(within(rowFor('Orders refresh')).getByText('Every 2 hours')).toBeInTheDocument();
    expect(within(rowFor('Top customers weekly')).getByText('At 07:00 on Monday')).toBeInTheDocument();
    expect(within(rowFor('Top customers weekly')).getByText('Paused')).toBeInTheDocument();
  });

  it('pauses and resumes a schedule', async () => {
    const user = userEvent.setup();
    await open();
    await screen.findByRole('table', { name: 'Schedules' });

    await user.click(screen.getByRole('button', { name: 'Pause Inventory daily' }));
    expect(await screen.findByText('Paused "Inventory daily"')).toBeInTheDocument();
    await waitFor(() => expect(within(rowFor('Inventory daily')).getByText('Paused')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Resume Inventory daily' }));
    await waitFor(() => expect(within(rowFor('Inventory daily')).getByText('Active')).toBeInTheDocument());
  });

  it('runs a schedule now', async () => {
    const user = userEvent.setup();
    const scheduler = createFixtureSchedulerSource();
    await open(scheduler);
    await screen.findByRole('table', { name: 'Schedules' });

    await user.click(screen.getByRole('button', { name: 'Run Orders refresh now' }));
    expect(await screen.findByText('Started "Orders refresh"')).toBeInTheDocument();
    expect(scheduler.runs).toEqual(['pat\tOrders refresh\t3']);
  });

  it('deletes a schedule after confirming', async () => {
    const user = userEvent.setup();
    await open();
    await screen.findByRole('table', { name: 'Schedules' });

    await user.click(screen.getByRole('button', { name: 'Delete Orders refresh' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete "Orders refresh"?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete schedule' }));

    await waitFor(() => expect(names()).toEqual(['Inventory daily', 'Top customers weekly']));
  });

  it('filters by owner, state and search', async () => {
    const user = userEvent.setup();
    await open();
    await screen.findByRole('table', { name: 'Schedules' });

    await user.selectOptions(screen.getByLabelText('Owner'), 'suzy');
    expect(names()).toEqual(['Top customers weekly']);
    await user.selectOptions(screen.getByLabelText('Owner'), '');
    await user.selectOptions(screen.getByLabelText('State'), 'active');
    expect(names()).toEqual(['Orders refresh', 'Inventory daily']);
    await user.type(screen.getByRole('searchbox', { name: 'Search schedules' }), 'ktr');
    expect(names()).toEqual(['Orders refresh']);
    await user.type(screen.getByRole('searchbox', { name: 'Search schedules' }), 'zzz');
    expect(screen.getByText('No schedules match')).toBeInTheDocument();
  });

  it('warns while the scheduler is paused and can start it', async () => {
    const user = userEvent.setup();
    await open(createFixtureSchedulerSource({ status: 'paused' }));

    expect(await screen.findByText(/The scheduler is paused/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start scheduler' }));
    expect(await screen.findByText('Scheduler started')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/The scheduler is paused/)).not.toBeInTheDocument());
  });

  it('shows an empty state when there are no schedules', async () => {
    await open(createFixtureSchedulerSource({ jobs: [] }));
    expect(await screen.findByText('No schedules yet')).toBeInTheDocument();
  });
});

describe('scheduler API parsing', () => {
  it('reads a live 11.1 job: string numbers, jobParams pairs, tab-separated id', () => {
    const [job] = parseJobsResponse({
      job: {
        jobTrigger: {
          '@type': 'simpleJobTrigger',
          startTime: '2026-11-26T06:00:00.000-05:00',
          uiPassParam: 'DAILY',
          repeatCount: '-1',
          repeatInterval: '86400',
          timeZone: 'America/New_York',
        },
        nextRun: '2026-11-26T06:00:00.000-05:00',
        jobId: 'admin\tHelix probe - Inventory\t4151a0a6',
        userName: 'admin',
        jobName: 'Helix probe - Inventory',
        state: 'NORMAL',
        jobParams: {
          jobParams: [
            { name: 'ActionAdapterQuartzJob-StreamProvider-InputFile', value: '/public/Steel Wheels/Reports/Inventory List (report).prpt' },
          ],
        },
      },
    });
    expect(job).toMatchObject({
      id: 'admin\tHelix probe - Inventory\t4151a0a6',
      name: 'Helix probe - Inventory',
      owner: 'admin',
      state: 'active',
      inputFile: '/public/Steel Wheels/Reports/Inventory List (report).prpt',
      trigger: { type: 'simpleJobTrigger', uiPassParam: 'DAILY', timeZone: 'America/New_York' },
    });
    expect(job?.nextRun?.toISOString()).toBe('2026-11-26T11:00:00.000Z');
    expect(job?.recurrence).toMatch(/^Every day at /);
  });

  it('describes run-once, minute and weekly intervals, and falls back to the cron description', () => {
    expect(describeRecurrence({ '@type': 'simpleJobTrigger', uiPassParam: 'RUN_ONCE', repeatCount: '0', startTime: '2026-11-26T06:00:00Z' })).toMatch(/^Once, /);
    expect(describeRecurrence({ '@type': 'simpleJobTrigger', repeatInterval: '900', repeatCount: '-1' })).toBe('Every 15 minutes');
    expect(describeRecurrence({ '@type': 'simpleJobTrigger', repeatInterval: '604800', repeatCount: '-1' })).toBe('Every week');
    expect(describeRecurrence({ '@type': 'complexJobTrigger', cronDescription: 'at 07:00 on Monday' })).toBe('At 07:00 on Monday');
    // Weekly and monthly expressions the console writes are described in words; others shown as cron.
    expect(describeRecurrence({ '@type': 'cronJobTrigger', cronString: '0 0 7 ? * 2-6' })).toBe('Weekdays at 07:00');
    expect(describeRecurrence({ '@type': 'cronJobTrigger', cronString: '0 30 18 ? * 2,4,1 *' })).toBe('Mon, Wed, Sun at 18:30');
    expect(describeRecurrence({ '@type': 'cronJobTrigger', cronString: '0 0 6 15 * ?' })).toBe('Monthly on day 15 at 06:00');
    expect(describeRecurrence({ '@type': 'cronJobTrigger', cronString: '0 0 7 L * ?' })).toBe('Cron: 0 0 7 L * ?');
  });
});
