import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** One or two sentences: what happens and what it affects. */
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons, primary action last. */
  actions: ReactNode;
  /** Close when Escape is pressed. Off while an action is running. */
  dismissible?: boolean;
  /** `sheet`: a full-height panel on the right, for properties and editors. */
  variant?: 'dialog' | 'sheet';
}

/**
 * Modal dialog on the native <dialog> element: the browser traps focus, makes the page inert,
 * and returns focus to the opener on close.
 */
export function Dialog({ open, onClose, title, description, children, actions, dismissible = true, variant = 'dialog' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      className={cn(
        'border-0 bg-surface p-0 text-fg shadow-overlay backdrop:bg-[rgb(15_18_48/0.45)]',
        variant === 'sheet'
          ? 'mt-0 mr-0 mb-0 ml-auto h-dvh max-h-dvh w-[min(520px,100vw)] rounded-l-card'
          : 'm-auto w-[min(440px,calc(100vw-32px))] rounded-card',
      )}
    >
      {open &&
        (variant === 'sheet' ? (
          <div className="flex h-full flex-col">
            <div className="flex flex-col gap-1 border-b border-divider px-6 pt-6 pb-4">
              <h2 id={titleId} className="m-0 truncate text-lg font-extrabold tracking-[-0.01em]">
                {title}
              </h2>
              {description && (
                <div id={descriptionId} className="truncate text-[13px] text-fg-muted">
                  {description}
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {actions && <div className="flex flex-wrap justify-end gap-2 border-t border-divider px-6 py-4">{actions}</div>}
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-6">
            <h2 id={titleId} className="m-0 text-lg font-extrabold tracking-[-0.01em]">
              {title}
            </h2>
            {description && (
              <div id={descriptionId} className="leading-relaxed text-fg-soft">
                {description}
              </div>
            )}
            {children}
            <div className="mt-2 flex flex-wrap justify-end gap-2">{actions}</div>
          </div>
        ))}
    </dialog>
  );
}
