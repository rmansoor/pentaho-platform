import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/render-app';
import { createFixtureRepoSource } from '../../api/mock/repo-fixture';

const REPORTS = '/files?path=/public/Steel Wheels/Reports';
const BUYER = '/public/Steel Wheels/Reports/Buyer Report.prpt';

async function openFor(title: string, how: 'share' | 'properties') {
  const user = userEvent.setup();
  await screen.findByRole('grid', { name: 'Files in Reports' });
  await user.click(within(screen.getByRole('grid', { name: 'Files in Reports' })).getByText(title).closest('[role="row"]')!);
  if (how === 'share') {
    await user.click(screen.getByRole('button', { name: 'Share' }));
  } else {
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Properties' }));
  }
  return { user, sheet: await screen.findByRole('dialog', { name: title }) };
}

describe('Properties', () => {
  it('shows file details and the owner from the ACL', async () => {
    await renderApp(REPORTS);
    const { sheet } = await openFor('Buyer Report', 'properties');

    expect(within(sheet).getByRole('tab', { name: 'General', selected: true })).toBeInTheDocument();
    expect(within(sheet).getByText(BUYER)).toBeInTheDocument();
    expect(await within(sheet).findByText('admin')).toBeInTheDocument();
    expect(within(sheet).getByText('60 KB')).toBeInTheDocument();
  });

  it('saves the Hidden flag and leaves Save disabled until something changes', async () => {
    const source = createFixtureRepoSource();
    await renderApp(REPORTS, source);
    const { user, sheet } = await openFor('Buyer Report', 'properties');

    const save = within(sheet).getByRole('button', { name: 'Save' });
    expect(save).toHaveAttribute('aria-disabled', 'true');

    await user.click(await within(sheet).findByRole('checkbox', { name: 'Hidden' }));
    expect(save).toHaveAttribute('aria-disabled', 'false');
    await user.click(save);

    expect(await screen.findByText('Saved changes to "Buyer Report"')).toBeInTheDocument();
    expect(await source.getFlags(BUYER)).toEqual({ hidden: true, schedulable: true });
  });
});

describe('Sharing', () => {
  it('opens on Sharing from the Share button, showing inherited access read-only', async () => {
    await renderApp(REPORTS);
    const { sheet } = await openFor('Buyer Report', 'share');

    expect(within(sheet).getByRole('tab', { name: 'Sharing', selected: true })).toBeInTheDocument();
    const inherit = await within(sheet).findByRole('switch', { name: /Use the folder's permissions/ });
    expect(inherit).toHaveAttribute('aria-checked', 'true');
    expect(within(sheet).getByRole('checkbox', { name: 'Read for Authenticated' })).toBeDisabled();
    expect(within(sheet).getByText('Always has full access')).toBeInTheDocument();
    expect(within(sheet).queryByLabelText('Add a user or role')).not.toBeInTheDocument();
  });

  it('stops inheriting, grants a user Write (which brings Read), and saves', async () => {
    const source = createFixtureRepoSource();
    await renderApp(REPORTS, source);
    const { user, sheet } = await openFor('Buyer Report', 'share');

    await user.click(await within(sheet).findByRole('switch', { name: /Use the folder's permissions/ }));
    const picker = await within(sheet).findByLabelText('Add a user or role');
    await waitFor(() => expect(within(picker).getByRole('option', { name: 'suzy' })).toBeInTheDocument());
    await user.selectOptions(picker, 'user:suzy');
    await user.click(within(sheet).getByRole('button', { name: 'Add' }));

    await user.click(within(sheet).getByRole('checkbox', { name: 'Write for suzy' }));
    expect(within(sheet).getByRole('checkbox', { name: 'Read for suzy' })).toBeChecked();
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Saved changes to "Buyer Report"')).toBeInTheDocument();
    const acl = await source.getAcl(BUYER);
    expect(acl.inheriting).toBe(false);
    const suzy = acl.entries.find((e) => e.recipient === 'suzy');
    expect([...(suzy?.permissions ?? [])]).toEqual(['read', 'write']);
  });

  it('removes an entry and can go back to inheriting', async () => {
    const source = createFixtureRepoSource();
    await renderApp(REPORTS, source);
    const { user, sheet } = await openFor('Buyer Report', 'share');

    const inherit = await within(sheet).findByRole('switch', { name: /Use the folder's permissions/ });
    await user.click(inherit);
    await user.click(within(sheet).getByRole('button', { name: 'Remove Authenticated' }));
    const table = () => within(sheet).getByRole('table', { name: 'Who has access' });
    expect(within(table()).queryByText('Authenticated')).not.toBeInTheDocument();
    // It's offered again in the picker.
    expect(within(within(sheet).getByLabelText('Add a user or role')).getByRole('option', { name: 'Authenticated' })).toBeInTheDocument();

    await user.click(inherit);
    expect(within(table()).getByText('Authenticated')).toBeInTheDocument();
    // Back where it started: nothing to save.
    expect(within(sheet).getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps Share disabled until exactly one item is selected', async () => {
    await renderApp(REPORTS);
    await screen.findByRole('grid', { name: 'Files in Reports' });
    expect(screen.getByRole('button', { name: 'Share' })).toHaveAttribute('aria-disabled', 'true');
  });
});
