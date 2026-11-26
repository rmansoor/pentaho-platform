import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/render-app';
import { createFixtureRepoSource } from '../../api/mock/repo-fixture';
import { createFixtureSchedulerSource } from '../../api/mock/scheduler-fixture';
import { createFixtureDataSourceSource } from '../../api/mock/datasource-fixture';
import { connectionBody } from '../../api/datasources';

const open = (ds = createFixtureDataSourceSource()) =>
  renderApp('/datasources', createFixtureRepoSource(), createFixtureSchedulerSource(), ds).then((r) => ({ ...r, ds }));

describe('Database connection editor', () => {
  it('creates a connection after a successful test', async () => {
    const user = userEvent.setup();
    const { ds } = await open();
    await user.click(await screen.findByRole('button', { name: 'New database connection' }));
    const sheet = await screen.findByRole('dialog', { name: 'New database connection' });

    // First non-generic type and its default port.
    await waitFor(() => expect(within(sheet).getByLabelText('Database type')).toHaveValue('HYPERSONIC'));
    expect(within(sheet).getByLabelText('Port')).toHaveValue('9001');
    await user.selectOptions(within(sheet).getByLabelText('Database type'), 'POSTGRESQL');
    expect(within(sheet).getByLabelText('Port')).toHaveValue('5432');

    await user.type(within(sheet).getByLabelText('Connection name'), 'Warehouse');
    await user.clear(within(sheet).getByLabelText('Server (host name)'));
    await user.type(within(sheet).getByLabelText('Server (host name)'), 'db.example.com');
    await user.type(within(sheet).getByLabelText('Database name'), 'dw');
    await user.type(within(sheet).getByLabelText('User name'), 'etl');
    await user.type(within(sheet).getByLabelText('Password'), 's3cret');

    await user.click(within(sheet).getByRole('button', { name: 'Test connection' }));
    expect(await within(sheet).findByText('Connection to database [ dw ] succeeded')).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'Create connection' }));
    expect(await screen.findByText('Created connection "Warehouse"')).toBeInTheDocument();
    expect(ds.saved[0]).toMatchObject({
      name: 'Warehouse',
      accessType: 'NATIVE',
      hostname: 'db.example.com',
      databasePort: '5432',
      databaseName: 'dw',
      username: 'etl',
      password: 's3cret',
      databaseType: { shortName: 'POSTGRESQL', name: 'PostgreSQL' },
    });
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Data sources' })).getByText('Warehouse')).toBeInTheDocument());
  });

  it('says so in words when the test fails', async () => {
    const user = userEvent.setup();
    await open();
    await user.click(await screen.findByRole('button', { name: 'New database connection' }));
    const sheet = await screen.findByRole('dialog', { name: 'New database connection' });
    await user.type(within(sheet).getByLabelText('Connection name'), 'Broken');
    await user.type(within(sheet).getByLabelText('Database name'), 'x');
    await user.click(within(sheet).getByRole('button', { name: 'Test connection' }));
    expect(await within(sheet).findByText(/Couldn't connect/)).toBeInTheDocument();
  });

  it('edits a JNDI connection, keeping fields the form does not show', async () => {
    const user = userEvent.setup();
    const { ds } = await open();
    await user.click(await screen.findByRole('button', { name: 'Edit SampleData' }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit "SampleData"' });

    expect(await within(sheet).findByRole('radio', { name: 'JNDI' })).toBeChecked();
    expect(within(sheet).getByLabelText('JNDI name')).toHaveValue('SampleData');
    expect(within(sheet).getByLabelText('Connection name')).toBeDisabled();
    await user.clear(within(sheet).getByLabelText('JNDI name'));
    await user.type(within(sheet).getByLabelText('JNDI name'), 'SampleDataV2');
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Saved connection "SampleData"')).toBeInTheDocument();
    expect(ds.saved[0]).toMatchObject({ databaseName: 'SampleDataV2', accessType: 'JNDI', attributes: { keep: 'me' }, hostname: '' });
  });

  it('is offered from the New menu too', async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getAllByRole('button', { name: /^New/ }).find((b) => b.getAttribute('aria-haspopup') === 'menu')!);
    await user.click(screen.getByRole('menuitem', { name: 'Database connection' }));
    expect(await screen.findByRole('dialog', { name: 'New database connection' })).toBeInTheDocument();
  });
});

describe('connectionBody', () => {
  it('blanks the password when unchanged so the server keeps the saved one', () => {
    const body = JSON.parse(
      connectionBody(
        { name: 'A', typeShortName: 'POSTGRESQL', access: 'NATIVE', host: 'h', port: '5432', database: 'd', username: 'u', password: '', raw: { id: 'x', extraOptions: { a: '1' } } },
        [{ name: 'PostgreSQL', shortName: 'POSTGRESQL', accessTypes: ['NATIVE'] }],
      ),
    );
    expect(body).toMatchObject({ id: 'x', password: '', extraOptions: { a: '1' }, databaseType: { name: 'PostgreSQL' } });
  });
});
