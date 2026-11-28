import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/** Atlas content card: white surface, 14 px radius, soft layered shadow. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-card bg-surface shadow-card', className)} {...rest} />;
}
