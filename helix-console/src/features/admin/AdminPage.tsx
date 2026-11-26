import { useEffect, useId, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, Shield, Trash2, User, Users } from 'lucide-react';
import { Button, Card, Checkbox, cn, Dialog, Tabs, toast } from '@helix/ui';
import { adminKeys, useAdminSource, useMembersOf, useRoles, useRolesOf, useUsers } from '../../api/admin';
import { QueryError } from '../files/QueryError';
import { MailTab } from './MailTab';
import { PermissionsTab } from './PermissionsTab';
import { SettingsTab } from './SettingsTab';
import { t } from '../../i18n';

type Tab = 'users' | 'roles' | 'permissions' | 'settings' | 'mail';

/** Administration: users, roles, role permissions, settings and the mail server. */
export function AdminPage() {
  const [tab, setTab] = useState<Tab>('users');
  return (
    <div className="flex flex-col gap-5 pt-1">
      <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.02em]">{t('admin.title')}</h1>
      <Tabs
        label={t('admin.title')}
        tabs={[
          { id: 'users', label: t('admin.tabs.users') },
          { id: 'roles', label: t('admin.tabs.roles') },
          { id: 'permissions', label: t('admin.tabs.permissions') },
          { id: 'settings', label: t('admin.tabs.settings') },
          { id: 'mail', label: t('admin.tabs.mail') },
        ]}
        value={tab}
        onChange={setTab}
      >
        {(current) =>
          current === 'users' ? (
            <UsersTab />
          ) : current === 'roles' ? (
            <RolesTab />
          ) : current === 'permissions' ? (
            <PermissionsTab />
          ) : current === 'settings' ? (
            <SettingsTab />
          ) : (
            <MailTab />
          )
        }
      </Tabs>
    </div>
  );
}

function useAdminMutation<T>(fn: (vars: T) => Promise<void>, success: (vars: T) => string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_, vars) => toast(success(vars)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.all }),
    onError: (e: Error) => toast(e.message, { tone: 'danger' }),
  });
}

function MasterList({
  label,
  icon,
  items,
  selected,
  onSelect,
}: {
  label: string;
  icon: 'user' | 'role';
  items: string[];
  selected: string | null;
  onSelect: (item: string) => void;
}) {
  return (
    <ul aria-label={label} className="m-0 flex list-none flex-col gap-0.5 p-0">
      {items.map((item) => (
        <li key={item}>
          <button
            type="button"
            aria-current={item === selected ? 'true' : undefined}
            onClick={() => onSelect(item)}
            className={cn(
              'flex h-10 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left',
              item === selected ? 'bg-accent-soft font-bold text-accent' : 'hover:bg-bg',
            )}
          >
            {icon === 'user' ? <User size={15} aria-hidden="true" /> : <Users size={15} aria-hidden="true" />}
            <span className="truncate">{item}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function UsersTab() {
  const source = useAdminSource();
  const users = useUsers();
  const roles = useRoles();
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'new' | 'delete' | 'password' | null>(null);
  const userRoles = useRolesOf(selected);

  useEffect(() => {
    if (users.data && (!selected || !users.data.includes(selected))) setSelected(users.data[0] ?? null);
  }, [users.data, selected]);

  const toggleRole = useAdminMutation(
    ({ role, on }: { role: string; on: boolean }) => (on ? source.assignRoles(selected!, [role]) : source.removeRoles(selected!, [role])),
    ({ role, on }) => t(on ? 'admin.users.gaveRole' : 'admin.users.removedRole', { user: selected ?? '', role }),
  );
  const create = useAdminMutation(
    ({ name, password }: { name: string; password: string }) => source.createUser(name, password),
    ({ name }) => t('admin.users.created', { name }),
  );
  const remove = useAdminMutation((name: string) => source.deleteUsers([name]), (name) => t('admin.users.deleted', { name }));
  const password = useAdminMutation(
    ({ pw, adminPw }: { pw: string; adminPw: string }) => source.setPassword(selected!, pw, adminPw),
    () => t('admin.users.passwordChanged', { name: selected ?? '' }),
  );

  if (users.isError) return <QueryError error={users.error} onRetry={() => void users.refetch()} />;

  return (
    <div className="flex flex-wrap items-start gap-5">
      <Card className="flex max-w-full flex-[1_1_220px] flex-col gap-2 p-3 md:max-w-[280px]">
        <Button size="sm" variant="primary" icon={<Plus size={15} aria-hidden="true" />} onClick={() => setDialog('new')}>
          {t('admin.users.new')}
        </Button>
        {users.isPending ? <p className="m-0 p-2 text-fg-muted">{t('common.loading')}</p> : <MasterList label={t('admin.users.list')} icon="user" items={users.data} selected={selected} onSelect={setSelected} />}
      </Card>

      {selected && (
        <Card className="flex min-w-0 flex-[999_1_420px] flex-col gap-5 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 min-w-0 flex-1 truncate text-xl font-extrabold">{selected}</h2>
            <Button size="sm" icon={<KeyRound size={15} aria-hidden="true" />} onClick={() => setDialog('password')}>
              {t('admin.dialog.changePassword')}
            </Button>
            <Button size="sm" variant="danger-outline" icon={<Trash2 size={15} aria-hidden="true" />} onClick={() => setDialog('delete')}>
              {t('admin.users.delete')}
            </Button>
          </div>
          <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
            <legend className="mb-2.5 p-0 text-[13px] font-semibold text-fg-muted">{t('admin.users.roles')}</legend>
            {userRoles.isPending || roles.isPending ? (
              <p className="m-0 text-fg-muted">{t('admin.users.loadingRoles')}</p>
            ) : (
              roles.data?.map((role) => (
                <Checkbox
                  key={role}
                  label={role}
                  checked={userRoles.data?.includes(role) ?? false}
                  disabled={toggleRole.isPending}
                  onChange={(on) => toggleRole.mutate({ role, on })}
                />
              ))
            )}
          </fieldset>
        </Card>
      )}

      <NewNameDialog
        open={dialog === 'new'}
        title={t('admin.users.new')}
        nameLabel={t('admin.users.nameLabel')}
        nameMissing={t('admin.users.enterName')}
        withPassword
        onClose={() => setDialog(null)}
        onSubmit={(name, pw) => create.mutateAsync({ name, password: pw ?? '' }).then(() => setSelected(name))}
      />
      <Dialog
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        title={t('admin.users.deleteTitle', { name: selected ?? '' })}
        description={t('admin.users.deleteDescription')}
        actions={
          <>
            <Button size="sm" onClick={() => setDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" variant="danger" onClick={() => selected && remove.mutate(selected, { onSuccess: () => setDialog(null) })}>
              {t('admin.users.delete')}
            </Button>
          </>
        }
      />
      <PasswordDialog
        open={dialog === 'password'}
        user={selected ?? ''}
        onClose={() => setDialog(null)}
        onSubmit={(pw, adminPw) => password.mutateAsync({ pw, adminPw })}
      />
    </div>
  );
}

function RolesTab() {
  const source = useAdminSource();
  const roles = useRoles();
  const users = useUsers();
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'new' | 'delete' | null>(null);
  const members = useMembersOf(selected);

  useEffect(() => {
    if (roles.data && (!selected || !roles.data.includes(selected))) setSelected(roles.data[0] ?? null);
  }, [roles.data, selected]);

  const toggleMember = useAdminMutation(
    ({ user, on }: { user: string; on: boolean }) => (on ? source.assignRoles(user, [selected!]) : source.removeRoles(user, [selected!])),
    ({ user, on }) => t(on ? 'admin.roles.added' : 'admin.roles.removed', { user, role: selected ?? '' }),
  );
  const create = useAdminMutation((name: string) => source.createRole(name), (name) => t('admin.roles.created', { name }));
  const remove = useAdminMutation((name: string) => source.deleteRoles([name]), (name) => t('admin.roles.deleted', { name }));

  if (roles.isError) return <QueryError error={roles.error} onRetry={() => void roles.refetch()} />;

  return (
    <div className="flex flex-wrap items-start gap-5">
      <Card className="flex max-w-full flex-[1_1_220px] flex-col gap-2 p-3 md:max-w-[280px]">
        <Button size="sm" variant="primary" icon={<Plus size={15} aria-hidden="true" />} onClick={() => setDialog('new')}>
          {t('admin.roles.new')}
        </Button>
        {roles.isPending ? <p className="m-0 p-2 text-fg-muted">{t('common.loading')}</p> : <MasterList label={t('admin.roles.list')} icon="role" items={roles.data} selected={selected} onSelect={setSelected} />}
      </Card>

      {selected && (
        <Card className="flex min-w-0 flex-[999_1_420px] flex-col gap-5 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 flex min-w-0 flex-1 items-center gap-2 truncate text-xl font-extrabold">
              {selected === 'Administrator' && <Shield size={18} className="text-accent" aria-hidden="true" />}
              {selected}
            </h2>
            <Button size="sm" variant="danger-outline" icon={<Trash2 size={15} aria-hidden="true" />} onClick={() => setDialog('delete')}>
              {t('admin.roles.delete')}
            </Button>
          </div>
          <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
            <legend className="mb-2.5 p-0 text-[13px] font-semibold text-fg-muted">{t('admin.roles.members')}</legend>
            {members.isPending || users.isPending ? (
              <p className="m-0 text-fg-muted">{t('admin.roles.loadingMembers')}</p>
            ) : (
              users.data?.map((user) => (
                <Checkbox
                  key={user}
                  label={user}
                  checked={members.data?.includes(user) ?? false}
                  disabled={toggleMember.isPending}
                  onChange={(on) => toggleMember.mutate({ user, on })}
                />
              ))
            )}
          </fieldset>
        </Card>
      )}

      <NewNameDialog
        open={dialog === 'new'}
        title={t('admin.roles.new')}
        nameLabel={t('admin.roles.nameLabel')}
        nameMissing={t('admin.roles.enterName')}
        onClose={() => setDialog(null)}
        onSubmit={(name) => create.mutateAsync(name).then(() => setSelected(name))}
      />
      <Dialog
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        title={t('admin.roles.deleteTitle', { name: selected ?? '' })}
        description={
          selected === 'Administrator'
            ? t('admin.roles.deleteAdministrator')
            : t('admin.roles.deleteDescription')
        }
        actions={
          <>
            <Button size="sm" onClick={() => setDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" variant="danger" onClick={() => selected && remove.mutate(selected, { onSuccess: () => setDialog(null) })}>
              {t('admin.roles.delete')}
            </Button>
          </>
        }
      />
    </div>
  );
}

function Field({ label, type = 'text', value, onChange, autoComplete }: { label: string; type?: string; value: string; onChange: (v: string) => void; autoComplete?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-fg-soft">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-control border border-border-strong bg-surface px-3 text-fg"
      />
    </div>
  );
}

function NewNameDialog({
  open,
  title,
  nameLabel,
  nameMissing,
  withPassword,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  nameLabel: string;
  /** Shown while the name is empty. */
  nameMissing: string;
  withPassword?: boolean;
  onClose: () => void;
  onSubmit: (name: string, password?: string) => Promise<unknown>;
}) {
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const formId = useId();
  useEffect(() => {
    if (open) {
      setName('');
      setPw('');
      setConfirm('');
    }
  }, [open]);

  const problem = !name.trim()
    ? nameMissing
    : withPassword && !pw
      ? t('admin.dialog.enterPassword')
      : withPassword && pw !== confirm
        ? t('admin.dialog.mismatch')
        : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (problem || busy) return;
    setBusy(true);
    try {
      await onSubmit(name.trim(), withPassword ? pw : undefined);
      onClose();
    } catch {
      // The toast already says why; keep the dialog open to fix it.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      actions={
        <>
          <Button size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" variant="primary" type="submit" form={formId} aria-disabled={!!problem || busy} title={problem ?? undefined}>
            {t('admin.dialog.create')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-3">
        <Field label={nameLabel} value={name} onChange={setName} autoComplete="off" />
        {withPassword && (
          <>
            <Field label={t('admin.dialog.password')} type="password" value={pw} onChange={setPw} autoComplete="new-password" />
            <Field label={t('admin.dialog.confirmPassword')} type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          </>
        )}
        {problem && name && <p className="m-0 text-[13px] text-fg-muted">{problem}</p>}
      </form>
    </Dialog>
  );
}

function PasswordDialog({
  open,
  user,
  onClose,
  onSubmit,
}: {
  open: boolean;
  user: string;
  onClose: () => void;
  onSubmit: (password: string, administratorPassword: string) => Promise<unknown>;
}) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [adminPw, setAdminPw] = useState('');
  const [busy, setBusy] = useState(false);
  const formId = useId();
  useEffect(() => {
    if (open) {
      setPw('');
      setConfirm('');
      setAdminPw('');
    }
  }, [open]);
  const problem = !pw ? t('admin.dialog.enterNewPassword') : pw !== confirm ? t('admin.dialog.mismatch') : !adminPw ? t('admin.dialog.enterYourPassword') : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (problem || busy) return;
    setBusy(true);
    try {
      await onSubmit(pw, adminPw);
      onClose();
    } catch {
      // Toast explains (e.g. wrong administrator password).
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('admin.dialog.passwordTitle', { name: user })}
      description={t('admin.dialog.passwordDescription')}
      actions={
        <>
          <Button size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" variant="primary" type="submit" form={formId} aria-disabled={!!problem || busy} title={problem ?? undefined}>
            {t('admin.dialog.changePassword')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-3">
        <Field label={t('admin.dialog.newPassword')} type="password" value={pw} onChange={setPw} autoComplete="new-password" />
        <Field label={t('admin.dialog.confirmNewPassword')} type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        <Field label={t('admin.dialog.yourPassword')} type="password" value={adminPw} onChange={setAdminPw} autoComplete="current-password" />
      </form>
    </Dialog>
  );
}
