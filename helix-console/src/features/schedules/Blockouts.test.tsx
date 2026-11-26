import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/render-app';
import { createFixtureRepoSource } from '../../api/mock/repo-fixture';
import { createFixtureSchedulerSource } from '../../api/mock/scheduler-fixture';
import { browserTimeZone } from './schedule-form';

// Weekdays from 22:00 for 4 hours, in the browser's zone, in the live /blockoutjobs shape.
const WEEKNIGHTS = {
  id: 'admin\tBlockoutAction\t9',
  name: 'BlockoutAction',
  owner: 'admin',
  state: 'NORMAL' as const,
  input: '',
  trigger: {
    '@type': 'complexJobTrigger',
    uiPassParam: 'CRON',
    cronString: '0 0 22 ? * 2-6 *',
    duration: '14400000',
    timeZone: browserTimeZone(),
    startTime: new Date(2026, 0, 1, 22, 0).toISOString(),
  },
};

const openSchedules = (scheduler = createFixtureSchedulerSource({ blockouts: [WEEKNIGHTS] }), administrator = true) =>
  renderApp('/schedules', createFixtureRepoSource({ administrator }), scheduler);

describe('Blockout times', () => {
  it('lists blockouts for administrators, with the schedules they hold back', async () => {
    await openSchedules();
    const list = await screen.findByRole('list', { name: 'Blockout times' });
    const item = within(list).getByRole('listitem');
    expect(item).toHaveTextContent('Weekdays at 22:00 for 4 hours, until 02:00 the next day');
    // "Orders refresh" runs every two hours, so 22:00, 00:00 and 02:00 fall inside it.
    expect(item).toHaveTextContent('holds back 1 schedule in the next 4 weeks');
  });

  it('adds a blockout from the defaults and shows what it would skip', async () => {
    const user = userEvent.setup();
    const scheduler = createFixtureSchedulerSource();
    await openSchedules(scheduler);
    await screen.findByText('No blockout times. Schedules run whenever they\'re due.');

    await user.click(screen.getByRole('button', { name: 'Add blockout time' }));
    const sheet = await screen.findByRole('dialog', { name: 'New blockout time' });
    expect(within(sheet).getByRole('status')).toHaveTextContent('Weekdays at 22:00 for 4 hours, until 02:00 the next day');

    // 05:30–06:30 daily catches "Inventory daily" (06:00) and "Orders refresh" (every 2 hours).
    await user.click(within(sheet).getByRole('radio', { name: 'Daily' }));
    await user.clear(within(sheet).getByLabelText('From'));
    await user.type(within(sheet).getByLabelText('From'), '05:30');
    await user.clear(within(sheet).getByRole('spinbutton', { name: 'Hours' }));
    await user.type(within(sheet).getByRole('spinbutton', { name: 'Hours' }), '1');
    expect(within(sheet).getByRole('status')).toHaveTextContent('Every day at 05:30 for 1 hour, until 06:30');
    expect(within(sheet).getByRole('status')).toHaveTextContent(/skips every run of "Inventory daily", \d+ runs of "Orders refresh"\./);

    await user.click(within(sheet).getByRole('button', { name: 'Add blockout' }));
    expect(await screen.findByText(/Added a blockout/)).toBeInTheDocument();
    expect(scheduler.requests[0]).toMatchObject({ duration: 3_600_000, simpleJobTrigger: { uiPassParam: 'DAILY', startHour: 5, startMin: 30 } });
    const item = await within(screen.getByRole('list', { name: 'Blockout times' })).findByRole('listitem');
    expect(item).toHaveTextContent('holds back 2 schedules');
  });

  it('edits and removes a blockout', async () => {
    const user = userEvent.setup();
    const scheduler = createFixtureSchedulerSource({ blockouts: [WEEKNIGHTS] });
    await openSchedules(scheduler);
    await user.click(await screen.findByRole('button', { name: /^Edit blockout/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit blockout time' });
    expect(within(sheet).getByRole('checkbox', { name: 'Friday' })).toBeChecked();
    await user.click(within(sheet).getByRole('checkbox', { name: 'Friday' }));
    await user.click(within(sheet).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Saved the blockout time')).toBeInTheDocument();
    expect(scheduler.requests[0]).toMatchObject({ cronJobTrigger: { cronString: '0 0 22 ? * 2-5' }, duration: 14_400_000 });

    await user.click(await screen.findByRole('button', { name: /^Remove blockout/ }));
    await user.click(within(screen.getByRole('dialog', { name: 'Remove this blockout time?' })).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('No blockout times. Schedules run whenever they\'re due.')).toBeInTheDocument();
  });

  it('is hidden from people who are not administrators', async () => {
    await openSchedules(createFixtureSchedulerSource({ blockouts: [WEEKNIGHTS], canListBlockouts: false }), false);
    await screen.findByRole('table', { name: 'Schedules' });
    expect(screen.queryByRole('heading', { name: 'Blockout times' })).not.toBeInTheDocument();
  });
});

describe('Schedule wizard and blockouts', () => {
  it('warns when some runs are skipped and refuses a schedule that never runs', async () => {
    const user = userEvent.setup();
    await openSchedules();
    await user.click(await screen.findByRole('button', { name: 'Edit Inventory daily' }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit "Inventory daily"' });
    const warning = () => within(sheet).queryByText(/blockout time.*(skipped|would run)/);
    expect(warning()).not.toBeInTheDocument();

    await user.clear(within(sheet).getByLabelText('At'));
    await user.type(within(sheet).getByLabelText('At'), '23:00');
    await waitFor(() => expect(warning()).toHaveTextContent(/^\d+ of the \d+ runs in the next 4 weeks fall in a blockout time and will be skipped/));
    expect(within(sheet).getByRole('button', { name: 'Save changes' })).toHaveAttribute('aria-disabled', 'false');

    await user.click(within(sheet).getByRole('radio', { name: 'Weekly' }));
    expect(warning()).toHaveTextContent('Every run in the next 4 weeks falls in a blockout time');
    expect(within(sheet).getByRole('button', { name: 'Save changes' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(sheet).getByText('Change when it runs: it falls in a blockout time')).toBeInTheDocument();
  });

  it("asks the server for people who can't list blockouts", async () => {
    const user = userEvent.setup();
    await openSchedules(createFixtureSchedulerSource({ canListBlockouts: false, totallyBlocked: true }), false);
    await user.click(await screen.findByRole('button', { name: 'Edit Inventory daily' }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit "Inventory daily"' });
    expect(await within(sheet).findByText('Every run falls in a blockout time, so this schedule would never run.')).toBeInTheDocument();
  });
});
