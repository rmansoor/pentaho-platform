import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  label?: ReactNode;
  onChange: (checked: boolean) => void;
}

/** Native checkbox in the accent colour; with `label` it renders its own <label>. */
export function Checkbox({ label, onChange, className, ...rest }: CheckboxProps) {
  const input = (
    <input
      type="checkbox"
      onChange={(e) => onChange(e.target.checked)}
      className={cn('size-4 shrink-0 cursor-pointer accent-[var(--hx-accent)] disabled:cursor-not-allowed', !label && className)}
      {...rest}
    />
  );
  if (!label) return input;
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2.5 has-disabled:cursor-not-allowed has-disabled:opacity-60', className)}>
      {input}
      <span>{label}</span>
    </label>
  );
}

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

/** On/off switch (role="switch") with a visible label. */
export function Switch({ checked, onChange, label, description, disabled }: SwitchProps) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3', disabled && 'cursor-not-allowed opacity-60')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors motion-reduce:transition-none',
          checked ? 'bg-accent' : 'bg-border-strong',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none',
            checked && 'translate-x-4',
          )}
        />
      </button>
      <span className="flex flex-col gap-0.5">
        <span className="font-semibold">{label}</span>
        {description && <span className="text-[12.5px] text-fg-muted">{description}</span>}
      </span>
    </label>
  );
}
