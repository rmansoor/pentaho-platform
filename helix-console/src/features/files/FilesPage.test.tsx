import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/render-app';
import { ApiError } from '../../api/http';
import type { RepoSource } from '../../api/repo';
import { createFixtureRepoSource } from '../../api/mock/repo-fixture';

const REPORTS = '/files?path=/public/Steel Wheels/Reports';

function grid() {
  return screen.getByRole('grid', { name: /^Files in/ });
}
function rowNames() {
  return within(grid())
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('gridcell')[0]!.textContent);
}

describe('Files', () => {
  it('shows the folder contents, breadcrumb and title', async () => {
    await renderApp(REPORTS);

    expect(await screen.findByRole('grid', { name: 'Files in Reports' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Reports' })).toBeInTheDocument();
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Steel Wheels' })).toBeInTheDocument();
    expect(within(crumbs).getByText('Reports')).toHaveAttribute('aria-current', 'page');
    expect(rowNames()).toEqual([
      'Buyer Report',
      'Income Statement',
      'Inventory List',
      'Order Status',
      'Product Sales',
      'Top Customers',
    ]);
    expect(screen.getByText('6 items')).toBeInTheDocument();
  });

  it('defaults to Public and lists folders first', async () => {
    await renderApp('/files');
    await screen.findByRole('grid', { name: 'Files in Public' });
    expect(rowNames()).toEqual(['Operations', 'Steel Wheels']);
  });

  it('sorts by a column and flips direction on a second click', async () => {
    const user = userEvent.setup();
    await renderApp(REPORTS);
    await screen.findByRole('grid', { name: 'Files in Reports' });

    const modified = screen.getByRole('columnheader', { name: /Modified/ });
    await user.click(within(modified).getByRole('button'));
    expect(modified).toHaveAttribute('aria-sort', 'descending');
    expect(rowNames()[0]).toBe('Buyer Report');

    await user.click(within(modified).getByRole('button'));
    expect(modified).toHaveAttribute('aria-sort', 'ascending');
    expect(rowNames()[0]).toBe('Order Status');
  });

  it('selects one, toggles with Ctrl, and extends a range with Shift', async () => {
    const user = userEvent.setup();
    await renderApp(REPORTS);
    await screen.findByRole('grid', { name: 'Files in Reports' });
    const rows = within(grid()).getAllByRole('row').slice(1);

    await user.click(rows[0]!);
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    await user.keyboard('{Control>}');
    await user.click(rows[2]!);
    await user.keyboard('{/Control}');
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    await user.keyboard('{Shift>}');
    await user.click(rows[4]!);
    await user.keyboard('{/Shift}');
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    expect(rows[3]).toHaveAttribute('aria-selected', 'true');
  });

  it('opens a folder by double-click and reveals it in the tree', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp('/files?path=/public/Steel Wheels');
    await screen.findByRole('grid', { name: 'Files in Steel Wheels' });

    const row = within(grid()).getByText('Dashboards').closest('[role="row"]')!;
    await user.dblClick(row);

    expect(await screen.findByRole('grid', { name: 'Files in Dashboards' })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ path: '/public/Steel Wheels/Dashboards' });
    const tree = screen.getByRole('tree', { name: 'Folders' });
    expect(within(tree).getByRole('treeitem', { name: 'Dashboards', selected: true })).toBeInTheDocument();
  });

  it('opens a selected file in the viewer, and says why Open is disabled with nothing selected', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp(REPORTS);
    await screen.findByRole('grid', { name: 'Files in Reports' });

    const open = screen.getByRole('button', { name: 'Open' });
    expect(open).toHaveAttribute('aria-disabled', 'true');
    expect(open).toHaveAttribute('title', 'Select one item to open it');

    await user.click(within(grid()).getAllByRole('row')[1]!);
    expect(open).toHaveAttribute('aria-disabled', 'false');
    await user.click(open);
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ path: '/public/Steel Wheels/Reports/Buyer Report.prpt', title: 'Buyer Report' }),
    );
  });

  it('navigates the folder tree with the keyboard', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp('/files?path=/public');
    const tree = await screen.findByRole('tree', { name: 'Folders' });
    await within(tree).findByRole('treeitem', { name: 'Steel Wheels' });

    within(tree).getByRole('treeitem', { name: /^Public/ }).focus();
    await user.keyboard('{ArrowDown}'); // Operations
    await user.keyboard('{ArrowDown}'); // Steel Wheels
    expect(document.activeElement).toHaveAttribute('data-path', '/public/Steel Wheels');

    await user.keyboard('{ArrowRight}');
    expect(await within(tree).findByRole('treeitem', { name: 'Reports' })).toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(router.state.location.search).toEqual({ path: '/public/Steel Wheels' });
  });

  it('explains when the server cannot be reached', async () => {
    const offline: RepoSource = {
      ...createFixtureRepoSource(),
      listFolder: async () => {
        throw new ApiError(0, '/pentaho/api/repo', 'Could not reach the Pentaho Server.');
      },
    };
    await renderApp('/files', offline);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText("Couldn't reach the Pentaho Server")).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
