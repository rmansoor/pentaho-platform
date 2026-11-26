import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/render-app';
import { createFixtureRepoSource } from '../../api/mock/repo-fixture';
import { createFixtureSchedulerSource } from '../../api/mock/scheduler-fixture';

describe('Schedule wizard', () => {
  it('schedules a report from Files on weekdays and lists it', async () => {
    const user = userEvent.setup();
    const scheduler = createFixtureSchedulerSource({ jobs: [] });
    const { router } = await renderApp('/files?path=/public/Steel Wheels/Reports', createFixtureRepoSource(), scheduler);
    const grid = await screen.findByRole('grid', { name: 'Files in Reports' });

    const schedule = screen.getByRole('button', { name: 'Schedule' });
    expect(schedule).toHaveAttribute('aria-disabled', 'true');
    await user.click(within(grid).getByText('Inventory List').closest('[role="row"]')!);
    await waitFor(() => expect(schedule).toHaveAttribute('aria-disabled', 'false'));
    await user.click(schedule);

    const sheet = await screen.findByRole('dialog', { name: 'New schedule' });
    expect(within(sheet).getByLabelText('Name')).toHaveValue('Inventory List');
    await waitFor(() => expect(within(sheet).getByLabelText('Save output to')).toHaveValue('/home/admin'));

    await user.click(within(sheet).getByRole('radio', { name: 'Weekly' }));
    expect(within(sheet).getByRole('checkbox', { name: 'Monday' })).toBeChecked();
    await user.click(within(sheet).getByRole('checkbox', { name: 'Friday' }));
    await user.clear(within(sheet).getByLabelText('At'));
    await user.type(within(sheet).getByLabelText('At'), '07:30');
    expect(within(sheet).getByRole('status')).toHaveTextContent('Mon, Tue, Wed, Thu at 07:30');

    await user.click(within(sheet).getByRole('button', { name: 'Create schedule' }));
    expect(await screen.findByText(/Scheduled "Inventory List"/)).toBeInTheDocument();
    const request = scheduler.requests[0] as { cronJobTrigger: { cronString: string }; inputFile: string };
    expect(request.cronJobTrigger.cronString).toBe('0 30 7 ? * 2-5');
    expect(request.inputFile).toBe('/public/Steel Wheels/Reports/Inventory List.prpt');

    await router.navigate({ to: '/schedules' });
    expect(await screen.findByRole('rowheader', { name: /Inventory List/ })).toBeInTheDocument();
  });

  it('does not offer scheduling for folders or unschedulable types', async () => {
    const user = userEvent.setup();
    await renderApp('/files?path=/public/Steel Wheels/Dashboards');
    const grid = await screen.findByRole('grid', { name: 'Files in Dashboards' });
    await user.click(within(grid).getByText('Territory Sales').closest('[role="row"]')!);
    const schedule = screen.getByRole('button', { name: 'Schedule' });
    await waitFor(() => expect(schedule).toHaveAttribute('title', "This type of file can't be scheduled"));
    expect(schedule).toHaveAttribute('aria-disabled', 'true');
  });

  it('edits an existing schedule from the Schedules page, keeping its settings', async () => {
    const user = userEvent.setup();
    const scheduler = createFixtureSchedulerSource();
    await renderApp('/schedules', createFixtureRepoSource(), scheduler);
    await screen.findByRole('table', { name: 'Schedules' });

    await user.click(screen.getByRole('button', { name: 'Edit Orders refresh' }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit "Orders refresh"' });
    expect(within(sheet).getByRole('radio', { name: 'Every few hours' })).toBeChecked();
    expect(within(sheet).getByLabelText('Every how many hours')).toHaveValue(2);

    await user.clear(within(sheet).getByLabelText('Every how many hours'));
    await user.type(within(sheet).getByLabelText('Every how many hours'), '4');
    await user.click(within(sheet).getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Saved "Orders refresh"')).toBeInTheDocument();
    const request = scheduler.requests[0] as { jobId: string; simpleJobTrigger: { repeatInterval: number } };
    expect(request.jobId).toBe('pat\tOrders refresh\t3');
    expect(request.simpleJobTrigger.repeatInterval).toBe(14400);
    expect(await screen.findByText('Every 4 hours')).toBeInTheDocument();
  });

  it('keeps Create disabled and says why until the form is complete', async () => {
    const user = userEvent.setup();
    await renderApp('/view?path=/public/Steel Wheels/Reports/Buyer Report.prpt');
    await user.click(await screen.findByRole('button', { name: 'Schedule' }));
    const sheet = await screen.findByRole('dialog', { name: 'New schedule' });

    await user.clear(within(sheet).getByLabelText('Name'));
    expect(within(sheet).getByText('Give the schedule a name')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Create schedule' })).toHaveAttribute('aria-disabled', 'true');
  });
});
