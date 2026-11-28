import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/render-app';
import { createFixtureRepoSource } from '../../api/mock/repo-fixture';
import { createFixtureSchedulerSource } from '../../api/mock/scheduler-fixture';
import { createFixtureDataSourceSource } from '../../api/mock/datasource-fixture';
import { createFixtureAdminSource } from '../../api/mock/admin-fixture';
import { encodePassword } from '../../api/admin';

function open(admin = createFixtureAdminSource()) {
  return renderApp('/admin', createFixtureRepoSource(), createFixtureSchedulerSource(), createFixtureDataSourceSource(), admin);
}

describe('Administration: users', () => {
  it('lists users and shows the selected user’s roles', async () => {
    await open();
    const list = await screen.findByRole('list', { name: 'Users' });
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual(['admin', 'bob', 'pat', 'suzy', 'tiffany']);
    expect(await screen.findByRole('heading', { level: 2, name: 'admin' })).toBeInTheDocument();
    expect(await screen.findByRole('checkbox', { name: 'Administrator' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Power User' })).not.toBeChecked();
  });

  it('gives and removes a role', async () => {
    const user = userEvent.setup();
    const admin = createFixtureAdminSource();
    await open(admin);
    await user.click(await screen.findByRole('button', { name: 'suzy' }));
    const reportAuthor = await screen.findByRole('checkbox', { name: 'Report Author' });

    await user.click(reportAuthor);
    expect(await screen.findByText('Gave suzy the Report Author role')).toBeInTheDocument();
    expect(await admin.rolesOf('suzy')).toEqual(['Power User', 'Report Author']);

    await user.click(screen.getByRole('checkbox', { name: 'Power User' }));
    await waitFor(async () => expect(await admin.rolesOf('suzy')).toEqual(['Report Author']));
  });

  it('creates a user, checking the passwords match', async () => {
    const user = userEvent.setup();
    const admin = createFixtureAdminSource();
    await open(admin);
    await user.click(await screen.findByRole('button', { name: 'New user' }));
    const dialog = screen.getByRole('dialog', { name: 'New user' });

    await user.type(within(dialog).getByLabelText('User name'), 'carol');
    await user.type(within(dialog).getByLabelText('Password'), 's3cret!');
    await user.type(within(dialog).getByLabelText('Confirm password'), 'other');
    expect(within(dialog).getByText("The passwords don't match")).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Create' })).toHaveAttribute('aria-disabled', 'true');

    await user.clear(within(dialog).getByLabelText('Confirm password'));
    await user.type(within(dialog).getByLabelText('Confirm password'), 's3cret!');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Created user carol')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: 'carol' })).toBeInTheDocument();
    expect(admin.passwords.get('carol')).toBe('s3cret!');
  });

  it('changes a password only with the administrator’s own password', async () => {
    const user = userEvent.setup();
    const admin = createFixtureAdminSource();
    await open(admin);
    await user.click(await screen.findByRole('button', { name: 'bob' }));
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    const dialog = screen.getByRole('dialog', { name: 'Change password for bob' });

    await user.type(within(dialog).getByLabelText('New password'), 'newpass');
    await user.type(within(dialog).getByLabelText('Confirm new password'), 'newpass');
    await user.type(within(dialog).getByLabelText('Your password'), 'wrong');
    await user.click(within(dialog).getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('The administrator password is incorrect.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Change password for bob' })).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText('Your password'));
    await user.type(within(dialog).getByLabelText('Your password'), 'password');
    await user.click(within(dialog).getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Changed the password for bob')).toBeInTheDocument();
    expect(admin.passwords.get('bob')).toBe('newpass');
  });

  it('deletes a user after confirming', async () => {
    const user = userEvent.setup();
    await open();
    await user.click(await screen.findByRole('button', { name: 'tiffany' }));
    await user.click(screen.getByRole('button', { name: 'Delete user' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Delete user tiffany?' })).getByRole('button', { name: 'Delete user' }));

    expect(await screen.findByText('Deleted user tiffany')).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Users' })).queryByRole('button', { name: 'tiffany' })).not.toBeInTheDocument());
  });
});

describe('Administration: roles', () => {
  it('shows members, adds one, and warns before deleting Administrator', async () => {
    const user = userEvent.setup();
    const admin = createFixtureAdminSource();
    await open(admin);
    await user.click(screen.getByRole('tab', { name: 'Roles' }));
    await user.click(await screen.findByRole('button', { name: 'Report Author' }));

    expect(await screen.findByRole('checkbox', { name: 'bob' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'suzy' }));
    expect(await screen.findByText('Added suzy to Report Author')).toBeInTheDocument();
    expect(await admin.membersOf('Report Author')).toEqual(['bob', 'suzy', 'tiffany']);

    await user.click(screen.getByRole('button', { name: 'Administrator' }));
    await user.click(await screen.findByRole('button', { name: 'Delete role' }));
    expect(screen.getByRole('dialog', { name: 'Delete role Administrator?' })).toHaveTextContent('lock everyone out');
  });

  it('creates a role', async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getByRole('tab', { name: 'Roles' }));
    await user.click(await screen.findByRole('button', { name: 'New role' }));
    const dialog = screen.getByRole('dialog', { name: 'New role' });
    await user.type(within(dialog).getByLabelText('Role name'), 'Auditor');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Created role Auditor')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: 'Auditor' })).toBeInTheDocument();
  });
});

describe('encodePassword', () => {
  it('sends passwords as ENC: base64, UTF-8 safe', () => {
    expect(encodePassword('password')).toBe(`ENC:${btoa('password')}`);
    expect(encodePassword('pässwörd')).toBe('ENC:cMOkc3N3w7ZyZA==');
  });
});
