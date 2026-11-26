import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/render-app';
import { createFixtureRepoSource } from '../api/mock/repo-fixture';
import { createFixtureSchedulerSource } from '../api/mock/scheduler-fixture';
import { createFixtureDataSourceSource } from '../api/mock/datasource-fixture';
import { createFixtureAdminSource } from '../api/mock/admin-fixture';

const rail = () => screen.getAllByRole('navigation', { name: 'Areas' })[0]!;

describe('Signed-in user', () => {
  it('shows the user in the rail and offers change password and sign out', async () => {
    const user = userEvent.setup();
    await renderApp('/home');

    const account = await within(rail()).findByRole('button', { name: 'Account: admin' });
    expect(account).toHaveTextContent('A');
    await user.click(account);
    expect(screen.getByRole('menuitem', { name: 'Change password' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('changes the user’s own password', async () => {
    const user = userEvent.setup();
    const admin = createFixtureAdminSource();
    await renderApp('/home', createFixtureRepoSource(), createFixtureSchedulerSource(), createFixtureDataSourceSource(), admin);

    await user.click(await within(rail()).findByRole('button', { name: 'Account: admin' }));
    await user.click(screen.getByRole('menuitem', { name: 'Change password' }));
    const dialog = screen.getByRole('dialog', { name: 'Change your password' });
    await user.type(within(dialog).getByLabelText('Current password'), 'password');
    await user.type(within(dialog).getByLabelText('New password'), 'n3w');
    await user.type(within(dialog).getByLabelText('Confirm new password'), 'n3w');
    await user.click(within(dialog).getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Your password has been changed')).toBeInTheDocument();
    expect(admin.passwords.get('admin')).toBe('n3w');
  });

  it('hides Administration from users who are not administrators', async () => {
    await renderApp('/home', createFixtureRepoSource({ administrator: false }));
    await within(rail()).findByRole('button', { name: 'Account: admin' });
    await waitFor(() => expect(within(rail()).queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument());
    expect(within(rail()).getByRole('link', { name: 'Schedules' })).toBeInTheDocument();
  });
});

describe('Command palette', () => {
  const settings = {
    favorites: JSON.stringify([{ fullPath: '/public/Steel Wheels/Dashboards', title: 'Dashboards', lastUse: 0 }]),
  };

  it('opens with Ctrl+K, filters as you type, and runs the chosen command with Enter', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp('/home');

    await user.keyboard('{Control>}k{/Control}');
    const palette = await screen.findByRole('dialog', { name: 'Command palette' });
    await user.type(within(palette).getByRole('combobox', { name: 'Search commands' }), 'sched');
    expect(within(palette).getAllByRole('option').map((o) => o.textContent)).toEqual(['Go to Schedules']);

    await user.keyboard('{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/schedules$/));
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
  });

  it('opens a favorite folder from the search box in the top bar', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp('/home', createFixtureRepoSource({ settings }));

    await user.click(screen.getByRole('button', { name: /Search Helix/ }));
    const palette = await screen.findByRole('dialog', { name: 'Command palette' });
    await user.type(within(palette).getByRole('combobox'), 'dash');
    await user.click(await within(palette).findByRole('option', { name: 'Dashboards' }));

    await waitFor(() => expect(router.state.location.search).toEqual({ path: '/public/Steel Wheels/Dashboards' }));
  });

  it('moves the highlight with the arrow keys and says when nothing matches', async () => {
    const user = userEvent.setup();
    await renderApp('/home');
    await user.keyboard('{Control>}k{/Control}');
    const palette = await screen.findByRole('dialog', { name: 'Command palette' });
    const box = within(palette).getByRole('combobox');

    expect(within(palette).getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(within(palette).getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');

    await user.type(box, 'qqqq');
    expect(within(palette).getByText('No matching commands')).toBeInTheDocument();
  });
});
