import { beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/render-app';
import { LAYOUT_STORAGE_KEY, useLayoutStore } from './layout-store';

async function renderAt(path: string) {
  return (await renderApp(path)).router;
}

function dockedRail() {
  return screen.getAllByRole('navigation', { name: 'Areas' })[0]!;
}

describe('AppShell navigation rail', () => {
  beforeEach(() => {
    useLayoutStore.setState({ railCollapsed: false, drawerOpen: false });
  });

  it('lists every area and marks the current one', async () => {
    await renderAt('/files');
    const rail = dockedRail();
    for (const label of ['Home', 'Files', 'Schedules', 'Data sources', 'Administration']) {
      expect(within(rail).getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(within(rail).getByRole('link', { name: 'Files' })).toHaveAttribute('aria-current', 'page');
  });

  it('redirects the root to Home', async () => {
    const router = await renderAt('/');
    expect(router.state.location.pathname).toMatch(/\/home$/);
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
  });

  it('collapses to an icon rail and keeps labels for screen readers', async () => {
    const user = userEvent.setup();
    await renderAt('/home');
    const rail = dockedRail();

    await user.click(within(rail).getByRole('button', { name: 'Collapse menu' }));

    expect(rail).toHaveAttribute('data-collapsed', 'true');
    const toggle = within(rail).getByRole('button', { name: 'Expand menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Labels remain accessible names when only icons are visible.
    expect(within(rail).getByRole('link', { name: 'Schedules' })).toHaveAttribute('title', 'Schedules');
  });

  it('remembers the collapsed state across reloads', async () => {
    const user = userEvent.setup();
    await renderAt('/home');
    await user.click(within(dockedRail()).getByRole('button', { name: 'Collapse menu' }));

    const saved = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) ?? '{}');
    expect(saved.state).toEqual({ railCollapsed: true });
  });

  it('toggles with Ctrl+B but not while typing', async () => {
    const user = userEvent.setup();
    await renderAt('/home');

    await user.keyboard('{Control>}b{/Control}');
    expect(useLayoutStore.getState().railCollapsed).toBe(true);

    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    await user.keyboard('{Control>}b{/Control}');
    expect(useLayoutStore.getState().railCollapsed).toBe(true);
    input.remove();
  });

  it('opens and closes the drawer on small screens', async () => {
    const user = userEvent.setup();
    await renderAt('/home');

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(useLayoutStore.getState().drawerOpen).toBe(true);

    await user.keyboard('{Escape}');
    expect(useLayoutStore.getState().drawerOpen).toBe(false);
  });
});
