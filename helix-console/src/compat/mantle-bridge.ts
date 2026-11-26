import { t } from '../i18n';
/*
 * Compatibility layer for plugin pages written for the GWT console (Mantle).
 *
 * Plugin content shown in the console's frame calls functions on window.parent / window.top that
 * the GWT console defined (MantleApplication, SolutionBrowserPanel, ...). The new console installs
 * the same names and forwards them. Installed plugins actually call: mantle_addHandler/
 * mantle_removeHandler/mantle_fireEvent ("GenericEvent"), mantle_initialized, executeCommand
 * ("RunInBackgroundCommand"), mantle_openRepositoryFile, mantle_openTab, urlCommand, authenticate,
 * show/hideLoadingIndicator (reporting) and enableContentEdit, setContentEditSelected,
 * mantle_refreshRepository (data-access). Everything else the GWT console exported gets a stub
 * that warns once, so a plugin relying on it fails visibly in QA instead of silently.
 */

export interface MantleEvent {
  eventSubType?: string;
  stringParam?: string;
  [key: string]: unknown;
}

export type MantleHandler = (event: MantleEvent) => void;

export interface HandlerRegistration {
  readonly type: string;
  readonly handler: MantleHandler;
  /** GWT's HandlerRegistration exposes removeHandler(); some pages call it directly. */
  removeHandler(): void;
}

/** What the bridge needs from the console. */
export interface BridgeDeps {
  openFile(path: string, title?: string): void;
  openFolder(path: string): void;
  /** Opens any same-origin URL in the content frame. */
  openUrl(url: string, title: string): void;
  /** Opens the schedule sheet; `once` means "run in background" (one run, now). */
  schedule(path: string, once: boolean): void;
  closeContent(url?: string): void;
  goToArea(area: 'home' | 'files' | 'schedules' | 'admin'): void;
  refreshRepository(): void;
  addFavorite(path: string, title: string): void;
  removeFavorite(path: string): void;
  isSupportedExtension(ext: string): boolean;
  showMessage(title: string, message: string): void;
  confirm(title: string, message: string, ok: string, cancel: string): Promise<boolean>;
  setBusy(busy: boolean): void;
  isSignedIn(): Promise<boolean>;
  signIn(): void;
  changePassword(): void;
  /** The report viewer's feedback screen moving a running report to the background. */
  runAdhocInBackground(solutionPath: string, jobId: string, recalculateFinished: string): void;
  warn(message: string): void;
}

const PERSPECTIVES: Record<string, 'home' | 'files' | 'schedules' | 'admin'> = {
  'home.perspective': 'home',
  'browser.perspective': 'files',
  'opened.perspective': 'files',
  'schedules.perspective': 'schedules',
  'admin.perspective': 'admin',
};

/** Names the GWT console exported that the new console does not implement (yet). */
const UNSUPPORTED = [
  'PluginOptionHelper_hasPlugin',
  'addGlassPaneListener',
  'closeUserDropDownMenu',
  'mantle_activateWaitingSecurityPanel',
  'mantle_buildFavoritesAndRecent',
  'mantle_doesMenuItemExist',
  'mantle_doesToolbarButtonExist',
  'mantle_enableUsersRolesTreeItem',
  'mantle_execute_url_in_new_tab',
  'mantle_isMenuItemEnabled',
  'mantle_isNavigatorShowing',
  'mantle_isToolbarButtonEnabled',
  'mantle_loadOverlay',
  'mantle_notifyGlasspaneListeners',
  'mantle_registerSysAdminPanel',
  'mantle_removeOverlay',
  'mantle_selectAdminCatTreeTreeItem',
  'mantle_setDashboardsFilter',
  'mantle_setMenuBarEnabled',
  'mantle_setMenuItemEnabled',
  'mantle_setNavigatorShowing',
  'mantle_setToolbarButtonEnabled',
  'mantle_showPluginError',
  'openFileDialog',
  'openFileDialogWithPath',
  'registerContentOverlay',
  'removeGlassPaneListenerById',
] as const;

/** Repository path from the forms plugins pass: "/a/b.prpt", ":a:b.prpt" or URL-encoded. */
export function normalizeRepoPath(raw: string): string {
  let path = raw;
  try {
    path = decodeURIComponent(raw);
  } catch {
    // Already decoded.
  }
  if (!path.includes('/') && path.includes(':')) path = path.replace(/:/g, '/');
  return path.startsWith('/') ? path : `/${path}`;
}

/** Builds the window functions. Kept separate from installation so it can be tested directly. */
export function createMantleBridge(deps: BridgeDeps) {
  const handlers = new Set<HandlerRegistration>();
  const warned = new Set<string>();
  const warnOnce = (name: string) => {
    if (warned.has(name)) return;
    warned.add(name);
    deps.warn(`[helix] ${name} is not supported by the Helix console yet; the calling plugin may not work fully.`);
  };
  const editState = { contentEdit: false, contentEditSelected: false, save: false };

  const api = {
    mantle_initialized: true,

    mantle_addHandler(type: string, handler: MantleHandler): HandlerRegistration {
      const registration: HandlerRegistration = {
        type,
        handler,
        removeHandler: () => void handlers.delete(registration),
      };
      handlers.add(registration);
      return registration;
    },
    mantle_removeHandler(registration: HandlerRegistration | null | undefined) {
      if (registration) handlers.delete(registration);
    },
    mantle_fireEvent(type: string, parameterMap: MantleEvent = {}) {
      for (const r of [...handlers]) {
        if (r.type !== type) continue;
        try {
          r.handler(parameterMap);
        } catch (e) {
          deps.warn(`[helix] a ${type} handler failed: ${String(e)}`);
        }
      }
    },

    executeCommand(commandName: string, parameterMap: Record<string, unknown> = {}) {
      const path = typeof parameterMap.solutionPath === 'string' ? normalizeRepoPath(parameterMap.solutionPath) : null;
      switch (commandName) {
        case 'RunInBackgroundCommand':
          if (path) deps.schedule(path, true);
          return;
        case 'NewScheduleCommand':
        case 'ScheduleCommand':
          if (path) deps.schedule(path, false);
          return;
        case 'RefreshRepositoryCommand':
          deps.refreshRepository();
          return;
        case 'ShowBrowserCommand':
          deps.goToArea('files');
          return;
        case 'ChangePasswordCommand':
          deps.changePassword();
          return;
        default:
          warnOnce(`executeCommand("${commandName}")`);
      }
    },

    mantle_openRepositoryFile(pathToFile: string, mode = 'RUN') {
      const path = normalizeRepoPath(pathToFile);
      switch (String(mode).toUpperCase()) {
        case 'SCHEDULE_NEW':
        case 'SCHEDULE_EDIT':
          deps.schedule(path, false);
          return;
        case 'BACKGROUND':
          deps.schedule(path, true);
          return;
        case 'NEWWINDOW':
          window.open(`${window.location.pathname.replace(/\/[^/]*$/, '')}/view?path=${encodeURIComponent(path)}`, '_blank', 'noopener');
          return;
        default:
          deps.openFile(path);
      }
    },
    mantle_openTab(_name: string, title: string, url: string) {
      deps.openUrl(url, title || _name);
    },
    mantle_openNamedFrameTab(name: string, title: string, _frameName: string, url: string) {
      deps.openUrl(url, title || name);
    },
    openURL(name: string, _tooltip: string, url: string) {
      deps.openUrl(url, name);
    },
    urlCommand(url: string, title: string) {
      deps.openUrl(url, title);
    },
    closeTab(url?: string) {
      deps.closeContent(url);
    },
    mantle_setPerspective(perspectiveId: string) {
      const area = PERSPECTIVES[perspectiveId];
      if (area) deps.goToArea(area);
      else warnOnce(`mantle_setPerspective("${perspectiveId}")`);
    },
    mantle_getPerspectives() {
      return Object.keys(PERSPECTIVES);
    },

    mantle_refreshRepository() {
      deps.refreshRepository();
    },
    mantle_addFavorite(pathToFile: string, title: string) {
      const path = normalizeRepoPath(pathToFile);
      deps.addFavorite(path, title || path.slice(path.lastIndexOf('/') + 1));
    },
    mantle_removeFavorite(pathToFile: string) {
      deps.removeFavorite(normalizeRepoPath(pathToFile));
    },
    mantle_isSupportedExtension(extension: string) {
      return deps.isSupportedExtension(String(extension).replace(/^\./, '').toLowerCase());
    },

    // Edit/save state: the GWT toolbar had Edit and Save buttons for plugin content. The Helix
    // viewer has no such toolbar yet, so the state is kept for when it does.
    enableContentEdit(enable: boolean) {
      editState.contentEdit = !!enable;
    },
    setContentEditSelected(selected: boolean) {
      editState.contentEditSelected = !!selected;
    },
    enableSave(enable: boolean) {
      editState.save = !!enable;
    },
    enableSaveForFrame(_id: string, enable: boolean) {
      editState.save = !!enable;
    },
    mantle_setIsRepoDirty(dirty: boolean) {
      if (dirty) deps.refreshRepository();
    },
    mantle_isBrowseRepoDirty() {
      return false;
    },

    showLoadingIndicator() {
      deps.setBusy(true);
    },
    hideLoadingIndicator() {
      deps.setBusy(false);
    },
    mantle_showMessage(title: string, message: string) {
      deps.showMessage(title, message);
    },
    mantle_showConfirmDlg(title: string, message: string, okTxt: string, cancelTxt: string, callback?: { onOk?: () => void; onCancel?: () => void }) {
      void deps.confirm(title, message, okTxt || t('common.ok'), cancelTxt || t('common.cancel')).then((ok) => (ok ? callback?.onOk?.() : callback?.onCancel?.()));
    },

    authenticate(callback?: { loginCallback?: () => void } | (() => void)) {
      void deps.isSignedIn().then((signedIn) => {
        if (!signedIn) {
          deps.signIn();
          return;
        }
        if (typeof callback === 'function') callback();
        else callback?.loginCallback?.();
      });
    },
    mantle_openChangePasswordDialog() {
      deps.changePassword();
    },

    /** Namespace the scheduler plugin's GWT code put on window: pho.runAdhocInBackground(…). */
    pho: {
      runAdhocInBackground(solutionPath: string, jobId: string, recalculateFinished: string) {
        deps.runAdhocInBackground(normalizeRepoPath(solutionPath), jobId, String(recalculateFinished ?? 'false'));
      },
    },

    /** Read-only view of what plugins set, for tests and a future content toolbar. */
    __helixEditState: editState,
  };

  const stubs = Object.fromEntries(UNSUPPORTED.map((name) => [name, () => warnOnce(name)]));
  return { ...stubs, ...api };
}

export type MantleBridge = ReturnType<typeof createMantleBridge>;

/** Installs the bridge on `target` (the console window); returns a function that removes it. */
export function installMantleBridge(target: Window, deps: BridgeDeps): () => void {
  const bridge = createMantleBridge(deps);
  const record = target as unknown as Record<string, unknown>;
  const previous = new Map(Object.keys(bridge).map((k) => [k, record[k]]));
  Object.assign(record, bridge);
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete record[key];
      else record[key] = value;
    }
  };
}
