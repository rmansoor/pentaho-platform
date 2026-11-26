import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/render-app';
import { createFixtureRepoSource } from '../../api/mock/repo-fixture';
import { parsePickList, recordRecent, serializePickList } from '../../api/pick-lists';
import { timeAgo } from './HomePage';

const now = Date.now();
const settings = {
  favorites: JSON.stringify([
    { fullPath: '/public/Steel Wheels/Reports/Buyer Report.prpt', title: 'Buyer Report', lastUse: 0 },
    { fullPath: '/public/Steel Wheels/Dashboards', title: 'Dashboards', lastUse: 0 },
  ]),
  recent: JSON.stringify([
    { fullPath: '/public/Steel Wheels/Reports/Inventory List.prpt', title: 'Inventory List', lastUse: now - 2 * 3_600_000 },
  ]),
};

describe('Home', () => {
  it('shows quick actions, favorites and recents', async () => {
    await renderApp('/home', createFixtureRepoSource({ settings }));

    const quick = screen.getByRole('navigation', { name: 'Quick actions' });
    for (const name of [/Browse files/, /Schedules/, /Data sources/, /Trash/]) {
      expect(within(quick).getByRole('link', { name })).toBeInTheDocument();
    }
    const favorites = await screen.findByRole('list', { name: 'Favorites' });
    expect(within(favorites).getByText('Buyer Report')).toBeInTheDocument();
    expect(within(favorites).getByText('Report · Public / Steel Wheels / Reports')).toBeInTheDocument();
    expect(within(favorites).getByText('Folder · Public / Steel Wheels')).toBeInTheDocument();

    const recent = screen.getByRole('list', { name: 'Recent' });
    expect(within(recent).getByText(/2 hours ago/)).toBeInTheDocument();
  });

  it('says what to do when the lists are empty', async () => {
    await renderApp('/home');
    expect(await screen.findByText('Star a file or folder in Files to keep it here.')).toBeInTheDocument();
    expect(screen.getByText('Files you open appear here.')).toBeInTheDocument();
  });

  it('opens a favorite file in the viewer and a favorite folder in Files', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp('/home', createFixtureRepoSource({ settings }));
    const favorites = await screen.findByRole('list', { name: 'Favorites' });

    await user.click(within(favorites).getByRole('button', { name: /^Buyer Report/ }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/view$/));
    expect(router.state.location.search).toEqual({ path: '/public/Steel Wheels/Reports/Buyer Report.prpt', title: 'Buyer Report' });

    await router.navigate({ to: '/home' });
    await user.click(within(await screen.findByRole('list', { name: 'Favorites' })).getByRole('button', { name: /^Dashboards/ }));
    expect(await screen.findByRole('grid', { name: 'Files in Dashboards' })).toBeInTheDocument();
  });

  it('unstars a favorite and saves the list in the GWT format', async () => {
    const user = userEvent.setup();
    const source = createFixtureRepoSource({ settings });
    await renderApp('/home', source);
    const favorites = await screen.findByRole('list', { name: 'Favorites' });

    await user.click(within(favorites).getByRole('button', { name: 'Remove Dashboards from favorites' }));
    expect(await screen.findByText('Removed "Dashboards" from favorites')).toBeInTheDocument();
    await waitFor(() => expect(within(favorites).queryByText('Dashboards')).not.toBeInTheDocument());
    expect(JSON.parse((await source.getUserSetting('favorites'))!)).toEqual([
      { fullPath: '/public/Steel Wheels/Reports/Buyer Report.prpt', title: 'Buyer Report', lastUse: 0 },
    ]);
  });
});

describe('Favorites from Files', () => {
  it('adds the selected item from the More menu and the menu then offers removal', async () => {
    const user = userEvent.setup();
    const source = createFixtureRepoSource();
    await renderApp('/files?path=/public/Steel Wheels/Reports', source);
    const grid = await screen.findByRole('grid', { name: 'Files in Reports' });

    await user.click(within(grid).getByText('Top Customers').closest('[role="row"]')!);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Add to favorites' }));

    expect(await screen.findByText('Added "Top Customers" to favorites')).toBeInTheDocument();
    expect(parsePickList(await source.getUserSetting('favorites')).map((f) => f.title)).toEqual(['Top Customers']);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: 'Remove from favorites' })).toBeInTheDocument();
  });
});

describe('pick lists', () => {
  it('skips unreadable entries and tolerates bad JSON', () => {
    expect(parsePickList('not json')).toEqual([]);
    expect(parsePickList(JSON.stringify([{ nope: 1 }, { fullPath: '/a/b.prpt' }]))).toEqual([
      { fullPath: '/a/b.prpt', title: 'b.prpt', lastUse: 0, kind: 'report' },
    ]);
  });

  it('keeps the 10 most recent, newest first, without duplicates', () => {
    let list = parsePickList(serializePickList([]));
    for (let i = 0; i < 12; i++) list = recordRecent(list, `/r/${i}.prpt`, `R${i}`, i);
    list = recordRecent(list, '/r/5.prpt', 'R5', 100);
    expect(list).toHaveLength(10);
    expect(list[0]?.fullPath).toBe('/r/5.prpt');
    expect(new Set(list.map((l) => l.fullPath)).size).toBe(10);
  });

  it('formats relative times', () => {
    const t = Date.parse('2026-11-25T12:00:00Z');
    expect(timeAgo(t - 30_000, t)).toBe('just now');
    expect(timeAgo(t - 5 * 60_000, t)).toMatch(/5 minutes ago/);
    expect(timeAgo(t - 86_400_000, t)).toMatch(/yesterday|1 day ago/);
  });
});
