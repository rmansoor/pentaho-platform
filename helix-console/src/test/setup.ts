import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { useToasts } from '@helix/ui';
import { resetCsrfCache } from '../api/http';
import { useBridgeUi } from '../compat/BridgeHost';
import { useLayoutStore } from '../shell/layout-store';

// jsdom has no modal <dialog>; enough of it for open/close and the cancel (Escape) event.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  useToasts.setState({ toasts: [] });
  resetCsrfCache();
  // Module-level stores outlive a test's render; start each test from a clean shell.
  useBridgeUi.setState({ busy: 0, schedule: null, adhoc: null, confirm: null });
  useLayoutStore.setState({ drawerOpen: false, paletteOpen: false });
});
