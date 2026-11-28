import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/render-app';
import { createFixtureRepoSource } from '../../api/mock/repo-fixture';
import { interpretImportResponse } from '../../api/repo';

const report = (name: string) => new File(['PK...'], name, { type: 'application/zip' });

async function openUpload(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^New/ }));
  await user.click(screen.getByRole('menuitem', { name: 'Upload files' }));
  return screen.getByRole('dialog', { name: 'Upload files' });
}

describe('Upload', () => {
  it('uploads chosen files into the folder being browsed', async () => {
    const user = userEvent.setup();
    await renderApp('/files?path=/public/Steel Wheels/Reports', createFixtureRepoSource());
    await screen.findByRole('grid', { name: 'Files in Reports' });

    const dialog = await openUpload(user);
    expect(dialog).toHaveTextContent('To Public / Steel Wheels / Reports');
    expect(within(dialog).getByRole('button', { name: 'Upload' })).toHaveAttribute('aria-disabled', 'true');

    await user.upload(within(dialog).getByLabelText(/Drop files here/), [report('Quarterly.prpt'), report('Annual.prpt')]);
    expect(within(within(dialog).getByRole('list', { name: 'Files to upload' })).getAllByRole('listitem')).toHaveLength(2);
    await user.click(within(dialog).getByRole('button', { name: 'Remove Annual.prpt' }));
    await user.click(within(dialog).getByRole('button', { name: 'Upload' }));

    expect(await screen.findByText('Uploaded "Quarterly.prpt"')).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByRole('grid', { name: 'Files in Reports' })).getByText('Quarterly')).toBeInTheDocument());
  });

  it('explains when the server refuses the file type and keeps the dialog open', async () => {
    const user = userEvent.setup();
    await renderApp('/files?path=/public/Steel Wheels/Reports');
    await screen.findByRole('grid', { name: 'Files in Reports' });
    const dialog = await openUpload(user);

    await user.upload(within(dialog).getByLabelText(/Drop files here/), [new File(['hi'], 'notes.txt', { type: 'text/plain' })]);
    await user.click(within(dialog).getByRole('button', { name: 'Upload' }));
    expect(await screen.findByText("That type of file can't be stored in the repository.")).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Upload files' })).toBeInTheDocument();
  });

  it('opens with dropped files when files are dragged onto Files', async () => {
    await renderApp('/files?path=/public/Steel Wheels/Reports');
    const grid = await screen.findByRole('grid', { name: 'Files in Reports' });
    const file = report('Dropped.prpt');
    fireEvent.drop(grid, { dataTransfer: { files: [file], types: ['Files'] } });

    const dialog = await screen.findByRole('dialog', { name: 'Upload files' });
    expect(within(dialog).getByText('Dropped.prpt')).toBeInTheDocument();
  });
});

describe('interpretImportResponse', () => {
  it('reads the 200-for-everything import responses', () => {
    expect(interpretImportResponse('<html><title>Repository Import Log</title>...</html>')).toEqual({ ok: true });
    expect(interpretImportResponse('INVALID_MIME_TYPE').ok).toBe(false);
    expect(interpretImportResponse('<html>java.lang.NullPointerException ...</html>').problem).toMatch(/could not import/);
  });
});
