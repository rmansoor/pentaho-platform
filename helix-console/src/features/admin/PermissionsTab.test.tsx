import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/render-app';
import { createFixtureRepoSource } from '../../api/mock/repo-fixture';
import { createFixtureSchedulerSource } from '../../api/mock/scheduler-fixture';
import { createFixtureDataSourceSource } from '../../api/mock/datasource-fixture';
import { createFixtureAdminSource } from '../../api/mock/admin-fixture';
import { parseRolePermissions } from '../../api/admin';

describe('Permissions', () => {
  it('shows a roles × permissions matrix, locks immutable roles, and saves one role per change', async () => {
    const user = userEvent.setup();
    const admin = createFixtureAdminSource();
    await renderApp('/admin', createFixtureRepoSource(), createFixtureSchedulerSource(), createFixtureDataSourceSource(), admin);
    await user.click(await screen.findByRole('tab', { name: 'Permissions' }));
    const table = await screen.findByRole('table', { name: 'Permissions by role' });

    expect(within(table).getByRole('columnheader', { name: 'Schedule Content' })).toBeInTheDocument();
    expect(within(table).getByRole('checkbox', { name: 'Administer Security for Administrator' })).toBeDisabled();
    // Roles with no assignment yet still appear, with nothing granted.
    expect(within(table).getByRole('checkbox', { name: 'Read Content for Report Author' })).not.toBeChecked();

    await user.click(within(table).getByRole('checkbox', { name: 'Schedule Content for Business Analyst' }));
    expect(await screen.findByText('Saved permissions for Business Analyst')).toBeInTheDocument();
    const perms = await admin.getRolePermissions();
    expect(perms.roles.find((r) => r.name === 'Business Analyst')?.granted).toEqual(['org.pentaho.security.publish', 'org.pentaho.scheduler.manage']);
    await waitFor(() => expect(within(table).getByRole('checkbox', { name: 'Schedule Content for Business Analyst' })).toBeChecked());
  });

  it('keeps the tabs in order with Mail server last', async () => {
    await renderApp('/admin');
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Users', 'Roles', 'Permissions', 'Settings', 'Mail server']);
  });
});

describe('parseRolePermissions', () => {
  it('reads the live map, single values, and adds roles that have no assignment', () => {
    const parsed = parseRolePermissions(
      {
        assignments: { roleName: 'Authenticated', logicalRoles: 'org.pentaho.repository.read', immutable: false },
        localizedRoleNames: [{ roleName: 'org.pentaho.repository.read', localizedName: 'Read Content' }],
      },
      ['Authenticated', 'Anonymous'],
    );
    expect(parsed.permissions).toEqual([{ id: 'org.pentaho.repository.read', label: 'Read Content' }]);
    expect(parsed.roles).toEqual([
      { name: 'Anonymous', granted: [], immutable: false },
      { name: 'Authenticated', granted: ['org.pentaho.repository.read'], immutable: false },
    ]);
  });
});
