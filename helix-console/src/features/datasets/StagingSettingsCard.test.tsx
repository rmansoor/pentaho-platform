import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/render-app';
import { createFixtureRepoSource } from '../../api/mock/repo-fixture';
import { createFixtureSchedulerSource } from '../../api/mock/scheduler-fixture';
import { createFixtureDataSourceSource } from '../../api/mock/datasource-fixture';
import { createFixtureAdminSource } from '../../api/mock/admin-fixture';
import { createFixtureDatasetSource } from '../../api/mock/dataset-fixture';

async function openSettings() {
  const user = userEvent.setup();
  const datasets = createFixtureDatasetSource();
  await renderApp('/admin', createFixtureRepoSource(), createFixtureSchedulerSource({ jobs: [] }), createFixtureDataSourceSource(),
    createFixtureAdminSource(), datasets);
  await user.click(await screen.findByRole('tab', { name: 'Settings' }));
  const card = (await screen.findByRole('heading', { name: 'Uploaded files' })).closest('div.flex.flex-col.gap-4') as HTMLElement;
  return { user, datasets, card };
}

describe('Uploaded files setting', () => {
  it('shows the server default and warns that it is the repository database', async () => {
    const { card } = await openSettings();
    const select = await within(card).findByLabelText('Load into connection');
    expect(select).toHaveValue('');
    expect(within(select).getByRole('option', { name: 'Server default (Hibernate)' })).toBeInTheDocument();
    expect(card).toHaveTextContent("Hibernate is the server's own repository database");
  });

  it('saves another connection and schema, and shows what the server refused', async () => {
    const { user, datasets, card } = await openSettings();
    await user.selectOptions(await within(card).findByLabelText('Load into connection'), 'AgileBI');
    await user.type(within(card).getByLabelText('Schema'), 'STAGE');
    expect(card).toHaveTextContent('move to the new connection the next time they are loaded');
    await user.click(within(card).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(datasets.calls).toContain('staging AgileBI STAGE'));
    expect(await screen.findByText('Uploaded files will be loaded into AgileBI')).toBeInTheDocument();

    await user.selectOptions(within(card).getByLabelText('Load into connection'), '');
    await user.clear(within(card).getByLabelText('Schema'));
    await user.click(within(card).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(datasets.calls).toContain('staging - -'));
  });
});
