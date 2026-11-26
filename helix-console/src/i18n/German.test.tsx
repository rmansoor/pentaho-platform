import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/render-app';
import { createFixtureSchedulerSource } from '../api/mock/scheduler-fixture';
import { createFixtureRepoSource } from '../api/mock/repo-fixture';
import { applyLanguage } from '.';

const saveServerLocale = vi.hoisted(() => vi.fn(async (_language: string) => {}));
vi.mock('./server', () => ({ saveServerLocale, fetchServerLocale: async () => null }));

describe('The console in German', () => {
  beforeEach(() => applyLanguage('de_DE'));
  afterEach(() => applyLanguage('en'));

  it('translates the shell, the page and the sentences built from data', async () => {
    await renderApp('/schedules');
    expect(await screen.findByRole('heading', { level: 1, name: 'Zeitpläne' })).toBeInTheDocument();
    const rail = screen.getByRole('navigation', { name: 'Bereiche' });
    expect(within(rail).getByRole('link', { name: 'Dateien' })).toBeInTheDocument();
    expect(within(rail).getByRole('link', { name: 'Verwaltung' })).toBeInTheDocument();

    const table = await screen.findByRole('table', { name: 'Zeitpläne' });
    expect(within(table).getByRole('columnheader', { name: 'Nächster Lauf' })).toBeInTheDocument();
    // "Every 2 hours" from the fixture's simple trigger, and the state badge.
    const orders = within(table).getByRole('rowheader', { name: /Orders refresh/ }).closest('tr')!;
    expect(orders).toHaveTextContent('Alle 2 Stunden');
    expect(orders).toHaveTextContent('Aktiv');
    expect(screen.getByRole('button', { name: 'Planer anhalten' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sperrzeiten' })).toBeInTheDocument();
  });

  it('describes a new schedule in German with German day names', async () => {
    const user = userEvent.setup();
    await renderApp('/schedules', createFixtureRepoSource(), createFixtureSchedulerSource());
    await user.click(await screen.findByRole('button', { name: 'Inventory daily bearbeiten' }));
    const sheet = await screen.findByRole('dialog', { name: '„Inventory daily“ bearbeiten' });
    await user.click(within(sheet).getByRole('radio', { name: 'Wöchentlich' }));
    await user.click(within(sheet).getByRole('checkbox', { name: 'Mittwoch' }));
    expect(within(sheet).getByRole('status')).toHaveTextContent(/Mo\.?, Di\.?, Do\.? und Fr\.? um 06:00/); // abbreviations depend on the ICU data
    expect(within(sheet).getByRole('button', { name: 'Änderungen speichern' })).toBeInTheDocument();
  });
});

describe('Choosing a language', () => {
  afterEach(() => applyLanguage('en'));

  it('saves the choice as the Pentaho locale and reloads', async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload, assign: vi.fn() });
    try {
      await renderApp('/home');
      await user.click(await screen.findByRole('button', { name: /^Account/ }));
      await user.click(screen.getByRole('menuitem', { name: 'Language: English' }));
      const dialog = screen.getByRole('dialog', { name: 'Language' });
      const apply = within(dialog).getByRole('button', { name: 'Switch language' });
      expect(apply).toHaveAttribute('aria-disabled', 'true');
      await user.click(within(dialog).getByRole('radio', { name: 'Deutsch' }));
      await user.click(apply);
      await vi.waitFor(() => expect(reload).toHaveBeenCalled());
      expect(saveServerLocale).toHaveBeenCalledWith('de');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
