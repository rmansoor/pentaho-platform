import { useEffect, useId, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, Languages, LogOut } from 'lucide-react';
import { Button, cn, Dialog, Menu, toast } from '@helix/ui';
import { useSession } from '../api/repo-context';
import { useAdminSource } from '../api/admin';
import { LOGOUT_URL } from '../api/http';
import { currentLanguage, LANGUAGES, t, type Language } from '../i18n';
import { saveServerLocale } from '../i18n/server';

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
  const [choosingLanguage, setChoosingLanguage] = useState(false);
  const name = session.data?.userName ?? '';
  const languageName = LANGUAGES.find((l) => l.code === currentLanguage())?.name ?? '';

  return (
    <>
      <Menu
        align="start"
        items={[
          {
            label: `${t('shell.account.language')}: ${languageName}`,
            icon: <Languages size={15} aria-hidden="true" />,
            onSelect: () => setChoosingLanguage(true),
          },
          { label: t('shell.account.changePassword'), icon: <KeyRound size={15} aria-hidden="true" />, onSelect: () => setChanging(true), disabled: !name },
          {
            label: t('shell.account.signOut'),
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
            aria-label={name ? t('shell.account.labelNamed', { name }) : t('shell.account.label')}
            title={collapsed ? name : undefined}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-control py-1.5 text-left text-rail-fg-strong hover:bg-rail-hover',
              collapsed ? 'justify-center px-0' : 'px-2',
            )}
          >
            <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-rail-active text-xs font-bold">
              {session.isPending ? '' : initials(name)}
            </span>
            <span className={cn('truncate text-[13px]', collapsed && 'sr-only')}>{name || (session.isError ? t('shell.account.signedOut') : '')}</span>
          </button>
        )}
      />
      <ChangeOwnPasswordDialog open={changing} user={name} onClose={() => setChanging(false)} />
      <LanguageDialog open={choosingLanguage} onClose={() => setChoosingLanguage(false)} />
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
      toast(t('shell.password.changed'));
      onClose();
    },
    onError: (e: Error) => toast(e.message, { tone: 'danger' }),
  });

  const problem = !current
    ? t('shell.password.enterCurrent')
    : !next
      ? t('shell.password.enterNew')
      : next !== confirm
        ? t('shell.password.mismatch')
        : null;
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
      title={t('shell.password.title')}
      actions={
        <>
          <Button size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" variant="primary" type="submit" form={formId} aria-disabled={!!problem || change.isPending} title={problem ?? undefined}>
            {t('shell.password.submit')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-3">
        {field(t('shell.password.current'), current, setCurrent, 'current-password')}
        {field(t('shell.password.new'), next, setNext, 'new-password')}
        {field(t('shell.password.confirm'), confirm, setConfirm, 'new-password')}
      </form>
    </Dialog>
  );
}

/**
 * Choose the console's language. It is saved as the user's Pentaho locale and the page reloads, so
 * report prompts and embedded pages, which the server renders, switch too (PUC does the same).
 */
function LanguageDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [choice, setChoice] = useState<Language>(currentLanguage());
  useEffect(() => {
    if (open) setChoice(currentLanguage());
  }, [open]);
  const apply = useMutation({
    mutationFn: () => saveServerLocale(choice),
    onSuccess: () => {
      toast(t('shell.account.languageChanged', { language: LANGUAGES.find((l) => l.code === choice)?.name ?? choice }));
      window.location.reload();
    },
    onError: (e: Error) => toast(t('shell.account.languageFailed', { message: e.message }), { tone: 'danger' }),
  });
  const unchanged = choice === currentLanguage();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('shell.account.language')}
      description={t('shell.account.languageHint')}
      actions={
        <>
          <Button size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            aria-disabled={unchanged || apply.isPending}
            onClick={() => !unchanged && !apply.isPending && apply.mutate()}
          >
            {t('shell.account.switchLanguage')}
          </Button>
        </>
      }
    >
      <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
        <legend className="sr-only">{t('shell.account.language')}</legend>
        {LANGUAGES.map((l) => (
          <label key={l.code} lang={l.code} className="flex h-10 cursor-pointer items-center gap-3 rounded-control px-2 hover:bg-accent-soft">
            <input type="radio" name="language" value={l.code} checked={choice === l.code} onChange={() => setChoice(l.code)} className="size-4 accent-accent" />
            {l.name}
          </label>
        ))}
      </fieldset>
    </Dialog>
  );
}
