import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline';
export type ButtonSize = 'sm' | 'md';

const base =
  'inline-flex items-center justify-center gap-2 rounded-control font-semibold whitespace-nowrap ' +
  'transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink font-bold hover:bg-accent-hover',
  secondary: 'border border-border-strong bg-surface text-fg hover:bg-accent-soft',
  ghost: 'text-fg-soft hover:bg-accent-soft hover:text-fg',
  danger: 'bg-danger-fg text-white font-bold hover:brightness-110',
  'danger-outline': 'border border-border-strong bg-surface text-danger-fg hover:bg-danger-bg',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-[13px]',
  md: 'h-[42px] px-[18px] text-sm',
};

// Icon-only sizes are separate classes, not overrides: two padding utilities on one element
// resolve by stylesheet order, not by the order they're listed.
const iconSizes: Record<ButtonSize, string> = {
  sm: 'size-9 shrink-0',
  md: 'size-[42px] shrink-0',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  /** Square button holding only an icon. Prefer `IconButton`, which requires a label. */
  iconOnly?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconOnly = false,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], iconOnly ? iconSizes[size] : sizes[size], className)}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'icon' | 'iconOnly'> {
  /** Required: icon-only buttons need an accessible name. */
  'aria-label': string;
  children: ReactNode;
}

export function IconButton(props: IconButtonProps) {
  return <Button {...props} iconOnly />;
}
