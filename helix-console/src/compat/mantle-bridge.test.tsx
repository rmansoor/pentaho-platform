import { describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/render-app';
import { createFixtureRepoSource } from '../api/mock/repo-fixture';
import { parsePickList } from '../api/pick-lists';
import { createMantleBridge, normalizeRepoPath, type BridgeDeps } from './mantle-bridge';
import { safeContentUrl } from '../features/viewer/ContentPage';

const deps = (over: Partial<BridgeDeps> = {}): BridgeDeps => ({
  openFile: vi.fn(),
  openFolder: vi.fn(),
  openUrl: vi.fn(),
  schedule: vi.fn(),
  closeContent: vi.fn(),
  goToArea: vi.fn(),
  refreshRepository: vi.fn(),
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
  isSupportedExtension: (ext) => ext === 'prpt',
  showMessage: vi.fn(),
  confirm: vi.fn(async () => true),
  setBusy: vi.fn(),
  isSignedIn: vi.fn(async () => true),
  signIn: vi.fn(),
  changePassword: vi.fn(),
  runAdhocInBackground: vi.fn(),
  warn: vi.fn(),
  ...over,
});

// The window functions as a plugin page sees them.
type Win = Record<string, (...args: unknown[]) => unknown> & { mantle_initialized?: boolean };
const win = () => window as unknown as Win;

describe('createMantleBridge', () => {
  it('delivers GenericEvents to handlers until they are removed, both ways GWT allowed', () => {
    const bridge = createMantleBridge(deps());
    const seen: string[] = [];
    const a = bridge.mantle_addHandler('GenericEvent', (e) => seen.push(`a:${e.eventSubType}`));
    const b = bridge.mantle_addHandler('GenericEvent', (e) => seen.push(`b:${e.eventSubType}`));
    bridge.mantle_addHandler('OtherEvent', () => seen.push('other'));

    bridge.mantle_fireEvent('GenericEvent', { eventSubType: 'tabClosing', stringParam: 'f1' });
    bridge.mantle_removeHandler(a);
    b.removeHandler();
    bridge.mantle_fireEvent('GenericEvent', { eventSubType: 'again' });
    expect(seen).toEqual(['a:tabClosing', 'b:tabClosing']);
  });

  it('maps the report viewer’s calls onto console actions', () => {
    const d = deps();
    const bridge = createMantleBridge(d);
    bridge.executeCommand('RunInBackgroundCommand', { solutionPath: 'public/Steel Wheels/Reports/Sales.prpt' });
    expect(d.schedule).toHaveBeenCalledWith('/public/Steel Wheels/Reports/Sales.prpt', true);
    bridge.mantle_openRepositoryFile('%3Apublic%3AReports%3ASales.prpt', 'SCHEDULE_NEW');
    expect(d.schedule).toHaveBeenLastCalledWith('/public/Reports/Sales.prpt', false);
    bridge.mantle_openTab('t', 'Cache manager', '/pentaho/plugin/cda/api/manageCache');
    expect(d.openUrl).toHaveBeenCalledWith('/pentaho/plugin/cda/api/manageCache', 'Cache manager');
    bridge.mantle_setPerspective('schedules.perspective');
    expect(d.goToArea).toHaveBeenCalledWith('schedules');
    expect(bridge.mantle_isSupportedExtension('.PRPT')).toBe(true);
    expect(bridge.mantle_initialized).toBe(true);
  });

  it('keeps data-access edit state, and refreshes the repository when asked', () => {
    const d = deps();
    const bridge = createMantleBridge(d);
    bridge.enableContentEdit(true);
    bridge.setContentEditSelected(true);
    expect(bridge.__helixEditState).toMatchObject({ contentEdit: true, contentEditSelected: true });
    bridge.mantle_refreshRepository();
    expect(d.refreshRepository).toHaveBeenCalled();
  });

  it('warns once for functions it does not support, instead of failing silently', () => {
    const d = deps();
    const bridge = createMantleBridge(d) as unknown as Win;
    bridge.openFileDialog!();
    bridge.openFileDialog!();
    bridge.executeCommand!('SomeUnknownCommand');
    expect(d.warn).toHaveBeenCalledTimes(2);
    expect(vi.mocked(d.warn).mock.calls[0]![0]).toMatch(/openFileDialog is not supported/);
  });

  it('calls confirm and authenticate callbacks in the GWT shapes', async () => {
    const onOk = vi.fn();
    const loginCallback = vi.fn();
    const bridge = createMantleBridge(deps());
    bridge.mantle_showConfirmDlg('Replace?', 'It exists.', 'Replace', 'Keep', { onOk });
    bridge.authenticate({ loginCallback });
    await waitFor(() => expect(onOk).toHaveBeenCalled());
    expect(loginCallback).toHaveBeenCalled();
  });

  it('normalises the path forms plugins pass', () => {
    expect(normalizeRepoPath(':public:a b:c.prpt')).toBe('/public/a b/c.prpt');
    expect(normalizeRepoPath('%2Fpublic%2Fc.prpt')).toBe('/public/c.prpt');
    expect(normalizeRepoPath('/public/c.prpt')).toBe('/public/c.prpt');
  });

  it('only shows same-origin /pentaho/ content', () => {
    expect(safeContentUrl('/pentaho/plugin/cda/api/x?y=1')).toBe('/pentaho/plugin/cda/api/x?y=1');
    expect(safeContentUrl('https://example.com/pentaho/x')).toBeNull();
    expect(safeContentUrl('/other/app')).toBeNull();
  });
});

describe('Bridge installed in the console', () => {
  it('opens the run-in-background sheet when the report viewer asks', async () => {
    await renderApp('/home');
    await waitFor(() => expect(win().mantle_initialized).toBe(true));

    act(() => {
      win().executeCommand!('RunInBackgroundCommand', { solutionPath: 'public/Steel Wheels/Reports/Top Customers.prpt' });
    });
    const sheet = await screen.findByRole('dialog', { name: 'Run in background' });
    expect(within(sheet).getByRole('radio', { name: 'Once' })).toBeChecked();
    expect(within(sheet).getByLabelText('Name')).toHaveValue('Top Customers');
  });

  it('opens plugin URLs in the content frame and files in the viewer', async () => {
    const { router } = await renderApp('/home');
    await waitFor(() => expect(win().mantle_initialized).toBe(true));

    act(() => void win().mantle_openTab!('cache', 'CDA cache', '/pentaho/plugin/cda/api/manageCache'));
    expect(await screen.findByTitle('CDA cache')).toHaveAttribute('src', '/pentaho/plugin/cda/api/manageCache');

    act(() => void win().mantle_openRepositoryFile!('/public/Steel Wheels/Reports/Buyer Report.prpt', 'RUN'));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ path: '/public/Steel Wheels/Reports/Buyer Report.prpt' }));
  });

  it('fires tabClosing for the frame when content closes', async () => {
    const { router } = await renderApp('/view?path=/public/Steel Wheels/Reports/Buyer Report.prpt');
    const frame = await screen.findByTitle('Buyer Report');
    const events: unknown[] = [];
    win().mantle_addHandler!('GenericEvent', (e: unknown) => events.push(e));

    await act(async () => {
      await router.navigate({ to: '/home' });
    });
    expect(events).toContainEqual({ eventSubType: 'tabClosing', stringParam: frame.id });
  });

  it('adds favorites for plugins and asks the user to confirm on their behalf', async () => {
    const user = userEvent.setup();
    const source = createFixtureRepoSource();
    await renderApp('/home', source);
    await waitFor(() => expect(win().mantle_initialized).toBe(true));

    act(() => void win().mantle_addFavorite!('/public/Steel Wheels/Reports/Top Customers.prpt', 'Top Customers'));
    await waitFor(async () => expect(parsePickList(await source.getUserSetting('favorites')).map((f) => f.title)).toEqual(['Top Customers']));

    const onCancel = vi.fn();
    act(() => void win().mantle_showConfirmDlg!('Discard changes?', 'Your edits will be lost.', 'Discard', 'Keep editing', { onCancel }));
    const dialog = await screen.findByRole('dialog', { name: 'Discard changes?' });
    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('moves a running report to the background with the GWT location-prompt events', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/csrf/token')) return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ uuid: 'bg-123' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    try {
      await renderApp('/home');
      await waitFor(() => expect(win().mantle_initialized).toBe(true));
      const events: Array<{ eventSubType?: string; stringParam?: string }> = [];
      win().mantle_addHandler!('GenericEvent', (e: unknown) => events.push(e as never));

      act(() => {
        (win().pho as unknown as { runAdhocInBackground: (p: string, j: string, r: string) => void }).runAdhocInBackground(
          'public/Steel Wheels/Reports/Buyer Report.prpt',
          'job-1',
          'false',
        );
      });
      const dialog = await screen.findByRole('dialog', { name: 'Run in background' });
      await waitFor(() => expect(within(dialog).getByLabelText('In folder')).toHaveValue('/home/admin'));
      expect(within(dialog).getByLabelText('Save as')).toHaveValue('Buyer Report');
      expect(events[0]).toEqual({ eventSubType: 'locationPromptAttached' });

      await user.click(within(dialog).getByRole('button', { name: 'Run in background' }));
      expect(await screen.findByText(/Running "Buyer Report" in the background/)).toBeInTheDocument();
      expect(events.map((e) => e.eventSubType)).toEqual(['locationPromptAttached', 'locationPromptOk', 'locationPromptFinish']);
      expect(events[1]?.stringParam).toBe('/home/admin');
      expect(events[2]?.stringParam).toBe('bg-123');
      const call = fetchSpy.mock.calls.find(([u]) => String(u).includes('/jobs/job-1/schedule'));
      expect(String(call?.[0])).toContain('folderId=id%3A%2Fhome%2Fadmin');
      expect(String(call?.[0])).toContain('newName=Buyer+Report');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('fires locationPromptCanceled when the user cancels', async () => {
    const user = userEvent.setup();
    await renderApp('/home');
    await waitFor(() => expect(win().mantle_initialized).toBe(true));
    const events: Array<{ eventSubType?: string }> = [];
    win().mantle_addHandler!('GenericEvent', (e: unknown) => events.push(e as never));
    act(() => {
      (win().pho as unknown as { runAdhocInBackground: (p: string, j: string, r: string) => void }).runAdhocInBackground('/public/a.prpt', 'j', 'false');
    });
    const dialog = await screen.findByRole('dialog', { name: 'Run in background' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(events.map((e) => e.eventSubType)).toContain('locationPromptCanceled');
  });
});
