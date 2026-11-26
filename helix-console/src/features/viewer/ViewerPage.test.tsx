import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/render-app';
import { createFixtureRepoSource } from '../../api/mock/repo-fixture';
import { parsePickList } from '../../api/pick-lists';
import { parseOpeners } from '../../api/repo';
import { openUrl } from '../../api/repo';

describe('Viewer', () => {
  it('renders the file with its plugin in one frame and records it in Recent', async () => {
    const source = createFixtureRepoSource();
    await renderApp('/view?path=/public/Steel Wheels/Reports/Product Sales.prpti', source);

    const frame = await screen.findByTitle('Product Sales');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', '/pentaho/api/repos/%3Apublic%3ASteel%20Wheels%3AReports%3AProduct%20Sales.prpti/viewer');
    expect(screen.getByRole('heading', { level: 1, name: 'Product Sales' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open in new window/ })).toHaveAttribute('target', '_blank');

    await waitFor(async () =>
      expect(parsePickList(await source.getUserSetting('recent')).map((r) => r.fullPath)).toEqual([
        '/public/Steel Wheels/Reports/Product Sales.prpti',
      ]),
    );
  });

  it('offers a download for file types no plugin opens', async () => {
    await renderApp('/view?path=/public/notes.txt');
    expect(await screen.findByText('No viewer for .txt files')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute('href', '/pentaho/api/repo/files/%3Apublic%3Anotes.txt/download');
  });

  it('goes back to the folder from the breadcrumb', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp('/view?path=/public/Steel Wheels/Reports/Buyer Report.prpt');
    await user.click(await screen.findByRole('link', { name: 'Public / Steel Wheels / Reports' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ path: '/public/Steel Wheels/Reports' }));
  });
});

describe('parseOpeners', () => {
  it('reads RUN perspectives from the live mantle settings, cleaning stray dots', () => {
    const openers = parseOpeners({
      setting: [
        { name: 'plugin-content-type-0', value: '..xaction' },
        { name: 'plugin-content-type-0-command-0', value: 'RUN' },
        { name: 'plugin-content-type-0-command-perspective-0', value: 'None' },
        { name: 'plugin-content-type-1', value: '.prpt' },
        { name: 'plugin-content-type-1-command-0', value: 'EDIT' },
        { name: 'plugin-content-type-1-command-perspective-0', value: 'editor' },
        { name: 'plugin-content-type-1-command-1', value: 'RUN' },
        { name: 'plugin-content-type-1-command-perspective-1', value: 'viewer' },
        { name: 'plugin-content-type-2', value: '.cda' },
        { name: 'plugin-content-type-2-command-0', value: 'EDIT' },
      ],
    });
    expect(openers).toEqual({ xaction: 'generatedContent', prpt: 'viewer' });
    expect(openUrl('/a b/c.prpt', 'viewer')).toBe('/pentaho/api/repos/%3Aa%20b%3Ac.prpt/viewer');
  });
});
