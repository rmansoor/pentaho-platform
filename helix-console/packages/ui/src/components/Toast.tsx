import { useEffect } from 'react';
import { create } from 'zustand';
import { X } from 'lucide-react';
import { cn } from '../lib/cn';

export interface Toast {
  id: number;
  message: string;
  tone?: 'default' | 'danger';
  action?: { label: string; onClick: () => void };
}

interface ToastState {
  toasts: Toast[];
  show: (toast: Omit<Toast, 'id'>) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  show: (toast) => {
    const id = nextId++;
    // At most three on screen; the oldest goes first.
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...toast, id }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Shows a short confirmation. Returns the toast id. */
export function toast(message: string, options: Omit<Toast, 'id' | 'message'> = {}): number {
  return useToasts.getState().show({ message, ...options });
}

const DURATION_MS = 6000;

function ToastItem({ t, dismissLabel }: { t: Toast; dismissLabel: string }) {
  const dismiss = useToasts((s) => s.dismiss);
  useEffect(() => {
    const timer = setTimeout(() => dismiss(t.id), DURATION_MS);
    return () => clearTimeout(timer);
  }, [t.id, dismiss]);

  return (
    <div
      className={cn(
        'pointer-events-auto flex min-h-11 items-center gap-3 rounded-[12px] py-1.5 pr-1.5 pl-4 text-[13.5px] shadow-overlay',
        t.tone === 'danger' ? 'bg-danger-fg text-white' : 'bg-rail text-rail-fg-strong',
      )}
    >
      <span className="flex-1">{t.message}</span>
      {t.action && (
        <button
          type="button"
          onClick={() => {
            t.action?.onClick();
            dismiss(t.id);
          }}
          className="h-8 rounded-[8px] px-2.5 font-bold text-rail-mark hover:bg-rail-hover"
        >
          {t.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label={dismissLabel}
        onClick={() => dismiss(t.id)}
        className="grid size-8 place-items-center rounded-[8px] hover:bg-rail-hover"
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Mount once in the shell. Announced politely to screen readers. */
/** `dismissLabel` is the close button's accessible name, in the app's language. */
export function Toaster({ dismissLabel = 'Dismiss' }: { dismissLabel?: string }) {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} dismissLabel={dismissLabel} />
      ))}
    </div>
  );
}
