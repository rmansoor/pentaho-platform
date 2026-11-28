import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/render-app';
import { createFixtureRepoSource } from '../../api/mock/repo-fixture';
import { createFixtureSchedulerSource } from '../../api/mock/scheduler-fixture';
import { createFixtureDataSourceSource } from '../../api/mock/datasource-fixture';
import { createFixtureAdminSource } from '../../api/mock/admin-fixture';
import { createFixtureDatasetSource, type FixtureDatasetSource } from '../../api/mock/dataset-fixture';
import { DatasetError } from '../../api/datasets';

const open = (path: string, datasets: FixtureDatasetSource = createFixtureDatasetSource()) =>
  renderApp(path, createFixtureRepoSource(), createFixtureSchedulerSource(), createFixtureDataSourceSource(), createFixtureAdminSource(), datasets).then(
    (r) => ({ ...r, datasets }),
  );
const items = () => within(screen.getByRole('list', { name: 'Datasets' })).getAllByRole('listitem');

describe('Datasets', () => {
  it('lists datasets with their source and owner, and searches them', async () => {
    const user = userEvent.setup();
    await open('/datasets');
    await screen.findByRole('list', { name: 'Datasets' });

    expect(items()).toHaveLength(2);
    expect(items()[0]).toHaveTextContent('Orders');
    expect(items()[0]).toHaveTextContent('Database tables · Owner: admin');
    expect(items()[1]).toHaveTextContent('File · Owner: suzy');
    await user.type(screen.getByRole('searchbox', { name: 'Search datasets' }), 'suzy');
    expect(items()).toHaveLength(1);
  });

  it('deletes with the version it listed', async () => {
    const user = userEvent.setup();
    const { datasets } = await open('/datasets');
    await screen.findByRole('list', { name: 'Datasets' });

    await user.click(screen.getByRole('button', { name: 'Delete Orders' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete "Orders"?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(items()).toHaveLength(1));
    expect(datasets.calls).toEqual(['delete orders']);
  });

  it('creates a dataset from a CSV file: upload, preview, choose columns, model, then load and publish', async () => {
    const user = userEvent.setup();
    const { datasets, router } = await open('/datasets');
    await user.click(await screen.findByRole('button', { name: 'New dataset' }));
    await screen.findByRole('heading', { name: 'New dataset', level: 1 });

    await user.click(screen.getByRole('button', { name: 'Preview data' }));
    expect(screen.getByText('Give the dataset a name')).toBeInTheDocument();
    expect(screen.getByText('Choose a file')).toBeInTheDocument();
    expect(datasets.calls).toEqual([]);

    await user.type(screen.getByLabelText('Name'), 'Regional sales 2026');
    await user.upload(screen.getByLabelText('CSV file'), new File(['region,units\nEMEA,1\n'], 'Sales 2026.csv', { type: 'text/csv' }));
    await user.selectOptions(screen.getByLabelText('Separator'), 'Comma (,)');
    await user.click(screen.getByRole('button', { name: 'Preview data' }));

    await screen.findByRole('region', { name: 'First rows' });
    expect(datasets.calls).toEqual(['create regional-sales-2026', 'upload regional-sales-2026 Sales 2026.csv', 'sample regional-sales-2026']);
    expect(datasets.stored.get('regional-sales-2026')!.definition.source).toEqual({
      type: 'FILE',
      file: { format: 'CSV', path: 'regional-sales-2026/0000-fixture.csv', originalName: 'Sales 2026.csv', headerRow: true, delimiter: ',' },
    });

    await user.click(screen.getByRole('checkbox', { name: 'Keep month' }));
    await user.type(screen.getByRole('textbox', { name: 'Label for revenue' }), 'Revenue (EUR)');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Type of units' }), 'Decimal');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // The model starts from the suggestion: every kept column a dimension, the numbers also summed.
    expect(screen.getByRole('textbox', { name: 'Name of dimension 1' })).toHaveValue('region');
    expect(screen.getByRole('textbox', { name: 'Name of dimension 3' })).toHaveValue('Revenue (EUR)');
    expect(screen.getByRole('textbox', { name: 'Name of measure 1' })).toHaveValue('units');
    expect(screen.getByRole('textbox', { name: 'Name of measure 2' })).toHaveValue('Revenue (EUR)');
    await user.click(screen.getByRole('button', { name: 'Remove dimension units' }));
    await user.click(screen.getByRole('button', { name: 'Remove dimension Revenue (EUR)' }));
    await user.clear(screen.getByRole('textbox', { name: 'Name of dimension 1' }));
    await user.type(screen.getByRole('textbox', { name: 'Name of dimension 1' }), 'Region');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Total of units' }), 'Average');
    await user.type(screen.getByRole('textbox', { name: 'Format of Revenue (EUR)' }), '#,##0.00');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('3 columns kept of 4')).toBeInTheDocument();
    expect(screen.getByText('1 dimension, 2 measures')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save and publish' }));
    expect(await screen.findByText(/Loaded 2 rows into DS_REGIONAL_SALES_2026_/)).toBeInTheDocument();
    expect(screen.getByText('Published as "Regional sales 2026"')).toBeInTheDocument();
    expect(screen.getByText(/Choose it as a data source in Analyzer, Interactive Reports and Report Designer/)).toBeInTheDocument();
    expect(datasets.calls.slice(3)).toEqual([
      'update regional-sales-2026',
      'start load regional-sales-2026',
      'stage regional-sales-2026',
      'publish regional-sales-2026',
    ]);
    const saved = datasets.stored.get('regional-sales-2026')!.definition;
    expect(saved.columns).toEqual([
      { name: 'region', sourceName: 'region', type: 'STRING' },
      { name: 'units', sourceName: 'units', type: 'DECIMAL' },
      { name: 'revenue', sourceName: 'revenue', type: 'DECIMAL', label: 'Revenue (EUR)' },
    ]);
    expect(saved.model).toEqual({
      dimensions: [{ name: 'Region', levels: ['region'] }],
      measures: [
        { name: 'units', column: 'units', aggregation: 'AVERAGE' },
        { name: 'Revenue (EUR)', column: 'revenue', aggregation: 'SUM', format: '#,##0.00' },
      ],
    });
    expect(saved.source?.file?.stagingTable).toMatch(/^DS_REGIONAL_SALES_2026_/);
    expect(saved.legacy).toEqual({ domainId: 'regional-sales-2026.xmi', modelId: 'MODEL_1', catalogName: 'Regional sales 2026' });

    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/datasets$/));
  });

  it('creates a dataset from a SQL query on a connection, without loading anything', async () => {
    const user = userEvent.setup();
    const { datasets, router } = await open('/datasets/new');
    await user.type(await screen.findByLabelText('Name'), 'Big orders');
    await user.click(screen.getByRole('radio', { name: 'SQL query' }));
    await user.selectOptions(await screen.findByLabelText('Connection'), 'SampleData');
    await user.type(screen.getByLabelText('Query'), 'SELECT * FROM ORDERS');
    await user.click(screen.getByRole('button', { name: 'Preview data' }));

    await screen.findByRole('region', { name: 'First rows' });
    expect(screen.getByText('The source has more rows than shown.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Save without publishing' }));

    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/datasets$/));
    expect(datasets.calls).toEqual(['create big-orders', 'sample big-orders', 'update big-orders']);
    const saved = datasets.stored.get('big-orders')!.definition;
    expect(saved.source).toEqual({ type: 'SQL', connection: 'SampleData', sql: 'SELECT * FROM ORDERS' });
    expect(saved.model?.measures.map((m) => m.column)).toEqual(['ORDERNUMBER', 'AMOUNT']);
  });

  it('says what to fix in the model before going on', async () => {
    const user = userEvent.setup();
    const { datasets } = await open('/datasets/new');
    await user.type(await screen.findByLabelText('Name'), 'Big orders');
    await user.click(screen.getByRole('radio', { name: 'SQL query' }));
    await user.selectOptions(await screen.findByLabelText('Connection'), 'SampleData');
    await user.type(screen.getByLabelText('Query'), 'SELECT * FROM ORDERS');
    await user.click(screen.getByRole('button', { name: 'Preview data' }));
    await screen.findByRole('region', { name: 'First rows' });
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await user.clear(screen.getByRole('textbox', { name: 'Name of dimension 1' }));
    await user.clear(screen.getByRole('textbox', { name: 'Name of dimension 3' }));
    await user.type(screen.getByRole('textbox', { name: 'Name of dimension 3' }), 'orderdate');
    await user.click(screen.getByRole('button', { name: 'Add measure' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Column of 3' }), 'STATUS');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Total of 3' }), 'Sum');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Fix the marked fields to continue.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name of dimension 1' })).toHaveAccessibleDescription('Give it a name');
    expect(screen.getByRole('textbox', { name: 'Name of dimension 2' })).not.toHaveAccessibleDescription();
    expect(screen.getByRole('textbox', { name: 'Name of dimension 3' })).toHaveAccessibleDescription('Another one has this name');
    expect(screen.getByRole('textbox', { name: 'Name of measure 3' })).toHaveAccessibleDescription('Give it a name');
    expect(screen.getByRole('combobox', { name: 'Column of 3' })).toHaveAccessibleDescription('Only numbers can be summed or averaged');

    await user.click(screen.getByRole('button', { name: 'Start from the suggestion' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Save and publish' })).toBeInTheDocument();
    expect(datasets.calls).not.toContain('update big-orders');
  });

  it('shows what the server refused, and keeps the draft to fix', async () => {
    const user = userEvent.setup();
    const datasets = createFixtureDatasetSource();
    datasets.failNextSample = new DatasetError(422, 'validation-failed', 'The source\'s sql must be a query (SELECT, WITH or VALUES)', 'source.sql', [
      { path: 'source.sql', message: 'must be a query (SELECT, WITH or VALUES)' },
    ]);
    await open('/datasets/orders', datasets);

    expect(await screen.findByLabelText('Name')).toHaveValue('Orders');
    expect(await screen.findByRole('checkbox', { name: 'ORDERS' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Preview data' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('must be a query');

    await user.click(screen.getByRole('button', { name: 'Preview data' }));
    await screen.findByRole('region', { name: 'First rows' });
    // Columns chosen before stay chosen; the rest start unticked.
    expect(screen.getByRole('checkbox', { name: 'Keep ORDERNUMBER' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Keep STATUS' })).not.toBeChecked();
  });

  it('picks tables from what the connection lists, and falls back to typing when it cannot list them', async () => {
    const user = userEvent.setup();
    const { datasets } = await open('/datasets/new');
    await user.type(await screen.findByLabelText('Name'), 'Sales');
    await user.click(screen.getByRole('radio', { name: 'Database tables' }));
    expect(screen.getByText('Choose a connection to see its tables.')).toBeInTheDocument();

    await user.selectOptions(await screen.findByLabelText('Connection'), 'SampleData');
    const group = await screen.findByRole('group', { name: 'Tables' });
    expect(within(group).getByText('None selected', { exact: false })).toBeInTheDocument();
    await user.type(within(group).getByRole('searchbox', { name: 'Filter tables' }), 'order');
    expect(within(group).getAllByRole('checkbox').map((c) => c.closest('label')!.textContent)).toEqual(['ORDERDETAILS', 'ORDERS', 'BIG_ORDERSView']);
    await user.click(within(group).getByRole('checkbox', { name: 'ORDERS' }));
    await user.click(within(group).getByRole('checkbox', { name: 'ORDERDETAILS' }));
    expect(within(group).getByText('2 selected', { exact: false })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Preview data' }));
    await screen.findByRole('region', { name: 'First rows' });
    expect(datasets.stored.get('sales')!.definition.source).toEqual({ type: 'TABLES', connection: 'SampleData', tables: ['ORDERS', 'ORDERDETAILS'] });

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.selectOptions(screen.getByLabelText('Connection'), 'AgileBI');
    const typed = await screen.findByRole('textbox', { name: 'Tables' });
    expect(typed).toHaveValue('ORDERS, ORDERDETAILS');
    expect(screen.getByText(/Couldn't list this connection's tables: .*connection "AgileBI" is down\. Type their names instead\./)).toBeInTheDocument();
  });

  it('shows a background load\'s progress, and can stop it', async () => {
    const user = userEvent.setup();
    const datasets = createFixtureDatasetSource();
    datasets.loadSteps = 50;
    await open('/datasets/regional-sales', datasets);
    await user.click(await screen.findByRole('button', { name: 'Preview data' }));
    await screen.findByRole('region', { name: 'First rows' });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Save and publish' }));

    expect(await screen.findByText(/Checked 2,000 rows, loaded 1,000…/, undefined, { timeout: 3000 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stop loading' }));
    expect(await screen.findByText("Loading stopped. The columns are saved; the file wasn't loaded.", undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(datasets.calls).toContain('cancel load regional-sales');
    expect(datasets.calls).not.toContain('stage regional-sales');
    expect(datasets.calls).not.toContain('publish regional-sales');
    expect(screen.getByRole('button', { name: 'Save and publish' })).toBeEnabled();
  });
});
