import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/render-app';
import { createFixtureRepoSource } from '../../api/mock/repo-fixture';
import { createFixtureSchedulerSource } from '../../api/mock/scheduler-fixture';
import { createFixtureDataSourceSource } from '../../api/mock/datasource-fixture';
import { createFixtureAdminSource } from '../../api/mock/admin-fixture';
import { mailConfigBody, mailTestPassed, parseMailConfig } from '../../api/admin';
import { CONTENT_CLEANER, contentCleanerRequest, findScheduledCleaner, parseJobsResponse } from '../../api/scheduler';

async function openTab(tab: 'Mail server' | 'Settings', scheduler = createFixtureSchedulerSource({ jobs: [] }), admin = createFixtureAdminSource()) {
  const user = userEvent.setup();
  await renderApp('/admin', createFixtureRepoSource(), scheduler, createFixtureDataSourceSource(), admin);
  await user.click(await screen.findByRole('tab', { name: tab }));
  return { user, scheduler, admin };
}

describe('Mail server', () => {
  it('saves the settings, keeping fields it does not edit', async () => {
    const { user, admin } = await openTab('Mail server');
    await user.type(await screen.findByLabelText('Mail server (SMTP host)'), 'smtp.example.com');
    await user.clear(screen.getByLabelText('Port'));
    await user.type(screen.getByLabelText('Port'), '587');
    await user.click(screen.getByRole('checkbox', { name: 'Use STARTTLS' }));
    await user.type(screen.getByLabelText('User name'), 'mailer');
    await user.type(screen.getByLabelText('From address'), 'reports@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Mail server settings saved')).toBeInTheDocument();
    expect(admin.savedMail()).toMatchObject({ smtpHost: 'smtp.example.com', smtpPort: 587, useStartTls: true, userId: 'mailer', defaultFrom: 'reports@example.com' });
    expect(admin.savedMail().rest).toMatchObject({ authMechanism: 'XOAUTH2' });
  });

  it('reports a failed test email in words and a passing one', async () => {
    const { user } = await openTab('Mail server');
    await user.type(await screen.findByLabelText('Mail server (SMTP host)'), 'mail.nowhere');
    await user.click(screen.getByRole('checkbox', { name: 'The server requires signing in' }));
    await user.type(screen.getByLabelText('From address'), 'reports@example.com');
    await user.click(screen.getByRole('button', { name: 'Send test email' }));
    expect(await screen.findByText(/test email couldn't be sent/)).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Mail server (SMTP host)'));
    await user.type(screen.getByLabelText('Mail server (SMTP host)'), 'smtp.example.com');
    await user.click(screen.getByRole('button', { name: 'Send test email' }));
    expect(await screen.findByText(/Test email sent/)).toBeInTheDocument();
  });

  it('says what is missing before saving', async () => {
    await openTab('Mail server');
    await screen.findByLabelText('Mail server (SMTP host)');
    expect(screen.getByText('Enter the mail server')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('Settings: generated content', () => {
  it('turns the daily clean-up on and off', async () => {
    const { user, scheduler } = await openTab('Settings');
    await screen.findByRole('button', { name: 'Turn on' });
    // Two "Older than (days)" fields: delete-now first, automatic clean-up second.
    const autoDays = screen.getAllByLabelText('Older than (days)')[1]!;
    await user.clear(autoDays);
    await user.type(autoDays, '30');
    await user.click(screen.getByRole('button', { name: 'Turn on' }));

    expect(await screen.findByText(/older than 30 days will be deleted every day at 02:00/)).toBeInTheDocument();
    expect(await screen.findByText(/Deletes files older than 30 days, every day/)).toBeInTheDocument();
    const req = scheduler.requests[0] as { jobName: string; actionClass: string; simpleJobTrigger: { repeatInterval: number } };
    expect(req).toMatchObject({ jobName: 'GeneratedContentCleaner', actionClass: CONTENT_CLEANER });
    expect(req.simpleJobTrigger.repeatInterval).toBe(86400);

    await user.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(await screen.findByText('Automatic clean-up turned off')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Turn on' })).toBeInTheDocument());
  });

  it('deletes now after confirming, and removes the finished one-off job', async () => {
    const { user, scheduler } = await openTab('Settings');
    await user.click(await screen.findByRole('button', { name: 'Delete now' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete generated files older than 180 days?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Deleting generated files older than 180 days', {}, { timeout: 4000 })).toBeInTheDocument();
    const req = scheduler.requests[0] as { jobParameters: Array<{ name: string; stringValue: string[] }>; simpleJobTrigger: { uiPassParam: string } };
    expect(req.simpleJobTrigger.uiPassParam).toBe('RUN_ONCE');
    expect(req.jobParameters.find((p) => p.name === 'age')?.stringValue).toEqual([String(180 * 86_400_000)]);
    expect(await scheduler.listJobs()).toEqual([]);
  });
});

describe('admin helpers', () => {
  it('round-trips mail config and reads the misspelled success key', () => {
    const config = parseMailConfig({ smtpHost: 'h', smtpPort: '465', useSsl: 'true', authMechanism: 'XOAUTH2', clientId: 'c' });
    expect(config).toMatchObject({ smtpHost: 'h', smtpPort: 465, useSsl: true, rest: { authMechanism: 'XOAUTH2', clientId: 'c' } });
    expect(JSON.parse(mailConfigBody(config))).toMatchObject({ smtpHost: 'h', authMechanism: 'XOAUTH2', clientId: 'c' });
    expect(mailTestPassed('EmailTester.SUCESS')).toBe(true);
    expect(mailTestPassed('EmailTester.SUCCESS')).toBe(true);
    expect(mailTestPassed('EmailTester.FAIL')).toBe(false);
  });

  it('finds the repeating cleaner and ignores finished one-off runs', () => {
    const job = (id: string, state: string, interval: string) => ({
      jobId: id,
      jobName: id,
      state,
      jobTrigger: { '@type': 'simpleJobTrigger', repeatInterval: interval },
      jobParams: { jobParams: [{ name: 'ActionAdapterQuartzJob-ActionClass', value: CONTENT_CLEANER }, { name: 'age', value: String(30 * 86_400_000) }] },
    });
    const jobs = parseJobsResponse({ job: [job('once', 'COMPLETE', '-1'), job('daily', 'NORMAL', '86400')] });
    expect(findScheduledCleaner(jobs)).toMatchObject({ job: { id: 'daily' }, olderThanDays: 30 });
    expect(contentCleanerRequest(1, 'admin').jobParameters[0]).toEqual({ name: 'age', type: 'string', stringValue: ['86400000'] });
  });
});
