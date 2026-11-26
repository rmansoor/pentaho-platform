import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { Button, Dialog, toast } from '@helix/ui';
import { repoKeys, useOpeners, useRepoSource } from '../api/repo-context';
import { kindOf } from '../api/repo';
import { parsePickList, serializePickList } from '../api/pick-lists';
import { LOGIN_URL } from '../api/http';
import { ScheduleSheet, type ScheduleTarget } from '../features/schedules/ScheduleSheet';
import { installMantleBridge, type BridgeDeps, type MantleEvent } from './mantle-bridge';
import { scheduleRunningReport } from '../api/reporting';
import { useSession } from '../api/repo-context';
import { displayFolder } from '../features/files/columns';

interface BridgeUi {
  busy: number;
  schedule: ScheduleTarget | null;
  adhoc: { solutionPath: string; jobId: string; recalculateFinished: string } | null;
  confirm: { title: string; message: string; ok: string; cancel: string; resolve: (ok: boolean) => void } | null;
}

export const useBridgeUi = create<BridgeUi>()(() => ({ busy: 0, schedule: null, adhoc: null, confirm: null }));

/** Installs window.mantle_* for plugin content and renders the UI those calls need. */
export function BridgeHost() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const source = useRepoSource();
  const openers = useOpeners();
  const openersRef = useRef(openers.data);
  openersRef.current = openers.data;
  const { busy, schedule, confirm, adhoc } = useBridgeUi();

  useEffect(() => {
    const setFavorites = async (update: (list: ReturnType<typeof parsePickList>) => ReturnType<typeof parsePickList>) => {
      const next = update(parsePickList(await source.getUserSetting('favorites')));
      await source.setUserSetting('favorites', serializePickList(next));
      await queryClient.invalidateQueries({ queryKey: ['user-settings', 'favorites'] });
    };

    const deps: BridgeDeps = {
      openFile: (path, title) => void navigate({ to: '/view', search: { path, ...(title ? { title } : {}) } }),
      openFolder: (path) => void navigate({ to: '/files', search: { path } }),
      openUrl: (url, title) => void navigate({ to: '/content', search: { url, title } }),
      schedule: (path, once) => useBridgeUi.setState({ schedule: { kind: 'new', file: path, once } }),
      closeContent: () => {
        if (/\/(view|content)$/.test(window.location.pathname)) window.history.back();
      },
      goToArea: (area) => void navigate({ to: `/${area}` as '/home' }),
      refreshRepository: () => void queryClient.invalidateQueries({ queryKey: repoKeys.all }),
      addFavorite: (path, title) =>
        void setFavorites((list) => (list.some((f) => f.fullPath === path) ? list : [...list, { fullPath: path, title, lastUse: 0, kind: kindOf(path) }])),
      removeFavorite: (path) => void setFavorites((list) => list.filter((f) => f.fullPath !== path)),
      isSupportedExtension: (ext) => !!openersRef.current?.[ext],
      showMessage: (title, message) => toast(title ? `${title}: ${message}` : message),
      confirm: (title, message, ok, cancel) =>
        new Promise((resolve) => useBridgeUi.setState({ confirm: { title, message, ok, cancel, resolve } })),
      setBusy: (on) => useBridgeUi.setState((s) => ({ busy: Math.max(0, s.busy + (on ? 1 : -1)) })),
      isSignedIn: async () => {
        try {
          await source.getSession();
          return true;
        } catch {
          return false;
        }
      },
      signIn: () => window.location.assign(LOGIN_URL),
      changePassword: () => toast('Change your password from the account menu at the foot of the sidebar.'),
      runAdhocInBackground: (solutionPath, jobId, recalculateFinished) => useBridgeUi.setState({ adhoc: { solutionPath, jobId, recalculateFinished } }),
      warn: (message) => console.warn(message),
    };
    const uninstall = installMantleBridge(window, deps);
    return uninstall;
  }, [navigate, queryClient, source]);

  const answer = (ok: boolean) => {
    confirm?.resolve(ok);
    useBridgeUi.setState({ confirm: null });
  };

  return (
    <>
      {busy > 0 && (
        <div role="progressbar" aria-label="Loading" className="fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-accent-soft">
          <div className="h-full w-1/3 animate-[helix-busy_1.2s_ease-in-out_infinite] bg-accent motion-reduce:animate-none" />
        </div>
      )}
      <Dialog
        open={confirm !== null}
        onClose={() => answer(false)}
        title={confirm?.title ?? ''}
        description={confirm?.message}
        actions={
          <>
            <Button size="sm" onClick={() => answer(false)}>
              {confirm?.cancel ?? 'Cancel'}
            </Button>
            <Button size="sm" variant="primary" onClick={() => answer(true)}>
              {confirm?.ok ?? 'OK'}
            </Button>
          </>
        }
      />
      <ScheduleSheet target={schedule} onClose={() => useBridgeUi.setState({ schedule: null })} />
      <AdhocBackgroundDialog request={adhoc} onDone={() => useBridgeUi.setState({ adhoc: null })} />
    </>
  );
}

const fire = (event: MantleEvent) =>
  (window as unknown as { mantle_fireEvent?: (t: string, e: MantleEvent) => void }).mantle_fireEvent?.('GenericEvent', event);

/**
 * The report viewer asked to move a running report to the background. Same contract as the GWT
 * AdhocRunInBackgroundCommand: GenericEvents locationPromptAttached, then locationPromptOk (output
 * folder) and locationPromptFinish (job uuid), or locationPromptCanceled.
 */
function AdhocBackgroundDialog({ request, onDone }: { request: BridgeUi['adhoc']; onDone: () => void }) {
  const source = useRepoSource();
  const session = useSession();
  const formId = useId();
  const [name, setName] = useState('');
  const [folder, setFolder] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!request) return;
    const file = request.solutionPath.slice(request.solutionPath.lastIndexOf('/') + 1);
    setName(file.replace(/\.[^.]+$/, ''));
    setFolder(session.data ? `/home/${session.data.userName}` : '/public');
    fire({ eventSubType: 'locationPromptAttached' });
  }, [request, session.data]);

  const cancel = () => {
    if (busy) return;
    fire({ eventSubType: 'locationPromptCanceled' });
    onDone();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!request || !name.trim() || !folder.startsWith('/') || busy) return;
    setBusy(true);
    try {
      const folderId = (await source.listFolder(folder)).folder.id;
      fire({ eventSubType: 'locationPromptOk', stringParam: folder });
      const uuid = await scheduleRunningReport(request.jobId, folderId, name.trim(), request.recalculateFinished);
      fire({ eventSubType: 'locationPromptFinish', stringParam: uuid });
      toast(`Running "${name.trim()}" in the background; the output goes to ${displayFolder(folder)}`);
      onDone();
    } catch (error) {
      toast(`Couldn't move the report to the background: ${(error as Error).message}`, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={request !== null}
      onClose={cancel}
      dismissible={!busy}
      title="Run in background"
      description="The report keeps running on the server and is saved when it finishes."
      actions={
        <>
          <Button size="sm" onClick={cancel} aria-disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" type="submit" form={formId} aria-disabled={busy || !name.trim()}>
            {busy ? 'Moving…' : 'Run in background'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-fg-soft">Save as</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="h-10 rounded-control border border-border-strong bg-surface px-3 text-fg" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-fg-soft">In folder</span>
          <input value={folder} onChange={(e) => setFolder(e.target.value)} className="h-10 rounded-control border border-border-strong bg-surface px-3 font-mono text-[13px] text-fg" />
        </label>
      </form>
    </Dialog>
  );
}
