import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md';

const base =
  'inline-flex items-center justify-center gap-2 rounded-control font-semibold whitespace-nowrap ' +
  'transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink font-bold hover:bg-accent-hover',
  secondary: 'border border-border-strong bg-surface text-fg hover:bg-accent-soft',
  ghost: 'text-fg-soft hover:bg-accent-soft hover:text-fg',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-[13px]',
  md: 'h-[42px] px-[18px] text-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'icon'> {
  /** Required: icon-only buttons need an accessible name. */
  'aria-label': string;
  children: ReactNode;
}

export function IconButton({ size = 'md', className, ...rest }: IconButtonProps) {
  return (
    <Button
      size={size}
      className={cn(size === 'sm' ? 'w-9 px-0' : 'w-[42px] px-0', className)}
      {...rest}
    />
  );
}
