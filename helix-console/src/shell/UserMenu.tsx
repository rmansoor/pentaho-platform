import { useEffect, useId, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, LogOut } from 'lucide-react';
import { Button, cn, Dialog, Menu, toast } from '@helix/ui';
import { useSession } from '../api/repo-context';
import { useAdminSource } from '../api/admin';
import { LOGOUT_URL } from '../api/http';

const initials = (name: string) =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('') || '?';

/** Signed-in user at the foot of the rail: change password, sign out. */
export function UserMenu({ collapsed }: { collapsed: boolean }) {
  const session = useSession();
  const [changing, setChanging] = useState(false);
  const name = session.data?.userName ?? '';

  return (
    <>
      <Menu
        align="start"
        items={[
          { label: 'Change password', icon: <KeyRound size={15} aria-hidden="true" />, onSelect: () => setChanging(true), disabled: !name },
          {
            label: 'Sign out',
            icon: <LogOut size={15} aria-hidden="true" />,
            onSelect: () => {
              window.location.assign(LOGOUT_URL);
            },
          },
        ]}
        trigger={(props) => (
          <button
            type="button"
            {...props}
            aria-label={name ? `Account: ${name}` : 'Account'}
            title={collapsed ? name : undefined}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-control py-1.5 text-left text-rail-fg-strong hover:bg-rail-hover',
              collapsed ? 'justify-center px-0' : 'px-2',
            )}
          >
            <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-rail-active text-xs font-bold">
              {session.isPending ? '' : initials(name)}
            </span>
            <span className={cn('truncate text-[13px]', collapsed && 'sr-only')}>{name || (session.isError ? 'Signed out' : '')}</span>
          </button>
        )}
      />
      <ChangeOwnPasswordDialog open={changing} user={name} onClose={() => setChanging(false)} />
    </>
  );
}

function ChangeOwnPasswordDialog({ open, user, onClose }: { open: boolean; user: string; onClose: () => void }) {
  const admin = useAdminSource();
  const formId = useId();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  useEffect(() => {
    if (open) {
      setCurrent('');
      setNext('');
      setConfirm('');
    }
  }, [open]);

  const change = useMutation({
    mutationFn: () => admin.changeOwnPassword(user, current, next),
    onSuccess: () => {
      toast('Your password has been changed');
      onClose();
    },
    onError: (e: Error) => toast(e.message, { tone: 'danger' }),
  });

  const problem = !current ? 'Enter your current password' : !next ? 'Enter a new password' : next !== confirm ? "The new passwords don't match" : null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!problem && !change.isPending) change.mutate();
  };

  const field = (label: string, value: string, set: (v: string) => void, autoComplete: string) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-fg-soft">{label}</span>
      <input
        type="password"
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => set(e.target.value)}
        className="h-10 rounded-control border border-border-strong bg-surface px-3 text-fg"
      />
    </label>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Change your password"
      actions={
        <>
          <Button size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" type="submit" form={formId} aria-disabled={!!problem || change.isPending} title={problem ?? undefined}>
            Change password
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-3">
        {field('Current password', current, setCurrent, 'current-password')}
        {field('New password', next, setNext, 'new-password')}
        {field('Confirm new password', confirm, setConfirm, 'new-password')}
      </form>
    </Dialog>
  );
}
