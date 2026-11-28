import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/render-app';
import { createFixtureRepoSource } from '../../api/mock/repo-fixture';

const REPORTS = '/files?path=/public/Steel Wheels/Reports';

function grid(name: string | RegExp) {
  return screen.getByRole('grid', { name });
}
function rowNames(name: string | RegExp) {
  return within(grid(name))
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('gridcell')[0]!.textContent);
}
function row(gridName: string | RegExp, title: string) {
  return within(grid(gridName)).getByText(title).closest('[role="row"]') as HTMLElement;
}

describe('Move to trash', () => {
  it('moves the selection to trash from the More menu, and Undo puts it back', async () => {
    const user = userEvent.setup();
    await renderApp(REPORTS);
    await screen.findByRole('grid', { name: 'Files in Reports' });

    await user.click(row('Files in Reports', 'Inventory List'));
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Move to trash' }));

    expect(await screen.findByText('Moved "Inventory List" to trash')).toBeInTheDocument();
    await waitFor(() => expect(rowNames('Files in Reports')).not.toContain('Inventory List'));

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(rowNames('Files in Reports')).toContain('Inventory List'));
  });

  it('moves the selected rows with the Delete key', async () => {
    const user = userEvent.setup();
    await renderApp(REPORTS);
    await screen.findByRole('grid', { name: 'Files in Reports' });

    await user.click(row('Files in Reports', 'Top Customers'));
    await user.keyboard('{Delete}');

    expect(await screen.findByText('Moved "Top Customers" to trash')).toBeInTheDocument();
  });

  it('keeps Move to trash disabled with nothing selected', async () => {
    const user = userEvent.setup();
    await renderApp(REPORTS);
    await screen.findByRole('grid', { name: 'Files in Reports' });

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: 'Move to trash' })).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('Trash', () => {
  const withTrash = () =>
    createFixtureRepoSource({
      trash: [
        ['/public/Steel Wheels/Reports/Buyer Report.prpt', '2026-11-20'],
        ['/public/Steel Wheels/Dashboards/Customer Map.wcdf', '2026-11-22'],
      ],
    });

  it('lists deleted items with where they came from, newest first', async () => {
    await renderApp('/files/trash', withTrash());

    expect(await screen.findByRole('grid', { name: 'Items in trash' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Trash' })).toBeInTheDocument();
    expect(rowNames('Items in trash')).toEqual(['Customer Map', 'Buyer Report']);
    expect(within(row('Items in trash', 'Buyer Report')).getByText('Public / Steel Wheels / Reports')).toBeInTheDocument();
    const tree = screen.getByRole('tree', { name: 'Folders' });
    expect(within(tree).getByRole('treeitem', { name: 'Trash', selected: true })).toBeInTheDocument();
  });

  it('restores to the original folder and offers to show it', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp('/files/trash', withTrash());
    await screen.findByRole('grid', { name: 'Items in trash' });

    await user.click(row('Items in trash', 'Buyer Report'));
    await user.click(screen.getByRole('button', { name: 'Restore' }));

    expect(await screen.findByText('Restored "Buyer Report"')).toBeInTheDocument();
    await waitFor(() => expect(rowNames('Items in trash')).toEqual(['Customer Map']));

    await user.click(screen.getByRole('button', { name: 'Show' }));
    expect(await screen.findByRole('grid', { name: 'Files in Reports' })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ path: '/public/Steel Wheels/Reports' });
    expect(rowNames('Files in Reports')).toContain('Buyer Report');
  });

  it('deletes permanently only after confirming', async () => {
    const user = userEvent.setup();
    await renderApp('/files/trash', withTrash());
    await screen.findByRole('grid', { name: 'Items in trash' });

    await user.click(row('Items in trash', 'Customer Map'));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete 1 item permanently?' });
    expect(dialog).toHaveTextContent("This can't be undone.");

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(rowNames('Items in trash')).toContain('Customer Map');

    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(rowNames('Items in trash')).toEqual(['Buyer Report']));
  });

  it('empties the trash and states how many items go', async () => {
    const user = userEvent.setup();
    await renderApp('/files/trash', withTrash());
    await screen.findByRole('grid', { name: 'Items in trash' });

    await user.click(screen.getByRole('button', { name: 'Empty trash' }));
    const dialog = screen.getByRole('dialog', { name: 'Empty the trash?' });
    expect(dialog).toHaveTextContent('All 2 items in the trash will be deleted.');
    await user.click(within(dialog).getByRole('button', { name: 'Empty trash' }));

    expect(await screen.findByText('The trash is empty')).toBeInTheDocument();
  });

  it('offers the home folder when the original folder is read-only', async () => {
    const user = userEvent.setup();
    const source = createFixtureRepoSource({
      readOnlyFolders: ['/public/Steel Wheels/Reports'],
      trash: [['/public/Steel Wheels/Reports/Buyer Report.prpt', '2026-11-20']],
    });
    const { router } = await renderApp('/files/trash', source);
    await screen.findByRole('grid', { name: 'Items in trash' });

    await user.click(row('Items in trash', 'Buyer Report'));
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    const dialog = await screen.findByRole('dialog', { name: 'Restore to your home folder?' });
    await user.click(within(dialog).getByRole('button', { name: 'Restore to home folder' }));

    expect(await screen.findByText('Restored 1 item to your home folder')).toBeInTheDocument();
    await router.navigate({ to: '/files', search: { path: '/home/admin' } });
    expect(await screen.findByRole('grid', { name: /Files in admin/ })).toBeInTheDocument();
    expect(rowNames(/Files in admin/)).toContain('Buyer Report');
  });

  it('asks what to do with name clashes in the home folder', async () => {
    const user = userEvent.setup();
    const source = createFixtureRepoSource({
      readOnlyFolders: ['/public/Steel Wheels/Reports'],
      trash: [['/public/Steel Wheels/Reports/Buyer Report.prpt', '2026-11-20']],
    });
    // The server answers 409 when the home folder already holds the same names.
    await renderApp('/files/trash', {
      ...source,
      restore: async (ids, mode) => (mode === undefined ? 'home-conflict' : source.restore(ids, mode)),
    });
    await screen.findByRole('grid', { name: 'Items in trash' });

    await user.click(row('Items in trash', 'Buyer Report'));
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    const dialog = await screen.findByRole('dialog', { name: 'Some names are already taken' });
    for (const name of ['Skip them', 'Replace', 'Keep both']) {
      expect(within(dialog).getByRole('button', { name })).toBeInTheDocument();
    }
    await user.click(within(dialog).getByRole('button', { name: 'Keep both' }));
    expect(await screen.findByText('Restored 1 item to your home folder')).toBeInTheDocument();
  });
});
