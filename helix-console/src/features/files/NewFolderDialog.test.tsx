import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/render-app';
import { createFixtureRepoSource } from '../../api/mock/repo-fixture';
import { folderNameProblem } from './NewFolderDialog';

async function openNewFolder(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^New/ }));
  await user.click(screen.getByRole('menuitem', { name: 'New folder' }));
  return screen.getByRole('dialog', { name: 'New folder' });
}

describe('New folder', () => {
  it('creates a folder in the folder being browsed and offers to open it', async () => {
    const user = userEvent.setup();
    const source = createFixtureRepoSource();
    const { router } = await renderApp('/files?path=/public/Steel Wheels', source);
    await screen.findByRole('grid', { name: 'Files in Steel Wheels' });

    const dialog = await openNewFolder(user);
    expect(dialog).toHaveTextContent('In Public / Steel Wheels');
    await user.type(within(dialog).getByLabelText('Name'), 'Quarterly');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    const toastMessage = await screen.findByText('Created folder "Quarterly"');
    await waitFor(() =>
      expect(within(screen.getByRole('grid', { name: 'Files in Steel Wheels' })).getByText('Quarterly')).toBeInTheDocument(),
    );
    await user.click(within(toastMessage.parentElement!).getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ path: '/public/Steel Wheels/Quarterly' }));
  });

  it('refuses reserved characters and reports a name already taken', async () => {
    const user = userEvent.setup();
    await renderApp('/files?path=/public/Steel Wheels');
    await screen.findByRole('grid', { name: 'Files in Steel Wheels' });

    const dialog = await openNewFolder(user);
    const input = within(dialog).getByLabelText('Name');
    await user.type(input, 'a/b');
    expect(within(dialog).getByText('Names can\'t contain "/"')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Create' })).toHaveAttribute('aria-disabled', 'true');

    await user.clear(input);
    await user.type(input, 'Reports');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('A file or folder with that name already exists here.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'New folder' })).toBeInTheDocument();
  });

  it('defaults to the home folder outside Files', async () => {
    const user = userEvent.setup();
    await renderApp('/home');
    await screen.findByRole('navigation', { name: 'Quick actions' });
    // Wait for the session so the target is the user's home folder.
    await screen.findAllByRole('button', { name: 'Account: admin' });
    const dialog = await openNewFolder(user);
    expect(dialog).toHaveTextContent('In Home / admin');
  });
});

describe('folderNameProblem', () => {
  it('flags empty, reserved and tab names', () => {
    expect(folderNameProblem('  ')).toBe('Enter a name');
    expect(folderNameProblem('..')).toBe('That name is reserved');
    expect(folderNameProblem('a\tb')).toBe("Names can't contain tabs");
    expect(folderNameProblem('a\\b')).toBe('Names can\'t contain "\\"');
    expect(folderNameProblem('Q4 (final)')).toBeNull();
  });
});
