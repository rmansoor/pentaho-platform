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

    // Reports show their own parameter prompt; jsdom can't run it, so stand in for its getParams().
    const frame = (await within(sheet).findByTitle('Report parameters')) as HTMLIFrameElement;
    expect(frame.getAttribute('src')).toBe('/pentaho/api/repos/:public:Steel%20Wheels:Reports:Inventory%20List.prpt/parameterUi');
    (frame.contentWindow as unknown as { getParams: () => object }).getParams = () => ({ LINE: 'Ships', IDS: [1, 2], showParameters: true });

    await user.click(within(sheet).getByRole('switch', { name: /Email the output/ }));
    expect(within(sheet).getByRole('button', { name: 'Create schedule' })).toHaveAttribute('aria-disabled', 'true');
    await user.type(within(sheet).getByLabelText('To'), 'ops@example.com, cfo@example.com');

    await user.click(within(sheet).getByRole('button', { name: 'Create schedule' }));
    expect(await screen.findByText(/Scheduled "Inventory List"/)).toBeInTheDocument();
    const request = scheduler.requests[0] as {
      cronJobTrigger: { cronString: string };
      inputFile: string;
      jobParameters: Array<{ name: string; type: string; stringValue: string[] }>;
    };
    expect(request.cronJobTrigger.cronString).toBe('0 30 7 ? * 2-5');
    expect(request.inputFile).toBe('/public/Steel Wheels/Reports/Inventory List.prpt');
    const byName = Object.fromEntries(request.jobParameters.map((p) => [p.name, p]));
    expect(byName.LINE).toEqual({ name: 'LINE', type: 'string', stringValue: ['Ships'] });
    expect(byName.IDS).toEqual({ name: 'IDS', type: 'number[]', stringValue: ['1', '2'] });
    expect(byName.showParameters?.type).toBe('boolean');
    expect(byName._SCH_EMAIL_TO?.stringValue).toEqual(['ops@example.com, cfo@example.com']);
    expect(byName._SCH_EMAIL_SUBJECT?.stringValue).toEqual(['Inventory List']);
    expect(byName._SCH_EMAIL_ATTACHMENT_NAME?.stringValue).toEqual(['Inventory List']);
    expect(byName['ActionAdapterQuartzJob-ActionUser']?.stringValue).toEqual(['admin']);

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

  it('explains that email needs a mail server when none is set up', async () => {
    const user = userEvent.setup();
    const scheduler = createFixtureSchedulerSource({ jobs: [], emailConfigured: false });
    await renderApp('/files?path=/public/Steel Wheels/Reports', createFixtureRepoSource(), scheduler);
    const grid = await screen.findByRole('grid', { name: 'Files in Reports' });
    await user.click(within(grid).getByText('Inventory List').closest('[role="row"]')!);
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    const sheet = await screen.findByRole('dialog', { name: 'New schedule' });
    await waitFor(() => expect(within(sheet).getByRole('switch', { name: /Email the output/ })).toBeDisabled());
    expect(sheet).toHaveTextContent('Set up a mail server in Administration');
  });
});
