import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/render-app';
import { createFixtureRepoSource } from '../../api/mock/repo-fixture';
import { createFixtureSchedulerSource } from '../../api/mock/scheduler-fixture';
import { createFixtureDataSourceSource } from '../../api/mock/datasource-fixture';
import { describeConnection } from '../../api/datasources';

const open = () => renderApp('/datasources', createFixtureRepoSource(), createFixtureSchedulerSource(), createFixtureDataSourceSource());
const items = () => within(screen.getByRole('list', { name: 'Data sources' })).getAllByRole('listitem');
const names = () => items().map((li) => li.querySelector('.font-semibold')?.textContent);

describe('Data sources', () => {
  it('lists connections, analysis schemas and metadata models, grouped by type', async () => {
    await open();
    await screen.findByRole('list', { name: 'Data sources' });

    expect(names()).toEqual(['AgileBI', 'SampleData', 'SampleData', 'SteelWheels', 'steel-wheels.xmi']);
    expect(within(items()[1]!).getByText('Database connection · Hypersonic · localhost:9001/SampleData (JNDI)')).toBeInTheDocument();
    expect(within(items()[3]!).getByRole('link', { name: 'Export SteelWheels' })).toHaveAttribute('download');
    // Connections have no export.
    expect(within(items()[0]!).queryByRole('link')).not.toBeInTheDocument();
  });

  it('filters by type with counts, and by search', async () => {
    const user = userEvent.setup();
    await open();
    await screen.findByRole('list', { name: 'Data sources' });

    await user.click(screen.getByRole('button', { name: 'Analysis · 2' }));
    expect(names()).toEqual(['SampleData', 'SteelWheels']);
    await user.click(screen.getByRole('button', { name: 'All' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search data sources' }), 'steel');
    expect(names()).toEqual(['SteelWheels', 'steel-wheels.xmi']);
  });

  it('deletes after a warning about what depends on it', async () => {
    const user = userEvent.setup();
    await open();
    await screen.findByRole('list', { name: 'Data sources' });

    await user.click(screen.getByRole('button', { name: 'Delete AgileBI' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete "AgileBI"?' });
    expect(dialog).toHaveTextContent('will stop working');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Deleted database connection "AgileBI"')).toBeInTheDocument();
    await waitFor(() => expect(names()).not.toContain('AgileBI'));
  });
});

describe('describeConnection', () => {
  it('summarises the live connection JSON', () => {
    expect(
      describeConnection({
        name: 'SampleData',
        accessType: 'JNDI',
        hostname: 'localhost',
        databasePort: '9001',
        databaseName: 'SampleData',
        databaseType: { name: 'Hypersonic', shortName: 'HYPERSONIC' },
      }),
    ).toBe('Hypersonic · localhost:9001/SampleData (JNDI)');
    expect(describeConnection({ name: 'x', accessType: 'NATIVE', databaseType: { shortName: 'POSTGRESQL' } })).toBe('POSTGRESQL');
  });
});
