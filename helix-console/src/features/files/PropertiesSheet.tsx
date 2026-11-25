import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Shield, Users, User, X } from 'lucide-react';
import { Button, Checkbox, Dialog, IconButton, Switch, Tabs, toast } from '@helix/ui';
import { repoKeys, useAcl, useFlags, useRecipients, useRepoSource } from '../../api/repo-context';
import { KIND_LABEL, PERMISSIONS, type AclEntry, type FileAcl, type FileFlags, type Permission, type RepoItem } from '../../api/repo';
import { displayFolder } from './columns';
import { formatDateTime, formatSize } from './format';
import { QueryError } from './QueryError';

export type PropertiesTab = 'general' | 'sharing';

export interface PropertiesSheetProps {
  item: RepoItem | null;
  initialTab?: PropertiesTab;
  onClose: () => void;
}

const PERMISSION_LABEL: Record<Permission, string> = { read: 'Read', write: 'Write', delete: 'Delete', manage: 'Manage' };

/**
 * Ticking a permission ticks the ones it needs (Manage needs Delete, Delete needs Write, Write
 * needs Read); unticking one unticks those that need it. Same rules as the GWT console.
 */
export function togglePermission(current: ReadonlySet<Permission>, permission: Permission, on: boolean): Set<Permission> {
  const index = PERMISSIONS.indexOf(permission);
  const next = new Set(current);
  if (on) PERMISSIONS.slice(0, index + 1).forEach((p) => next.add(p));
  else PERMISSIONS.slice(index).forEach((p) => next.delete(p));
  return next;
}

const cloneAcl = (acl: FileAcl): FileAcl => ({
  ...acl,
  entries: acl.entries.map((e) => ({ ...e, permissions: new Set(e.permissions) })),
});

const sameAcl = (a: FileAcl, b: FileAcl) => {
  if (a.inheriting !== b.inheriting) return false;
  if (a.inheriting) return true;
  const key = (acl: FileAcl) =>
    acl.entries
      .filter((e) => e.modifiable)
      .map((e) => `${e.kind}:${e.recipient}:${PERMISSIONS.filter((p) => e.permissions.has(p)).join('')}`)
      .sort()
      .join('|');
  return key(a) === key(b);
};

/** Properties and Sharing for one file or folder, in a side sheet. */
export function PropertiesSheet({ item, initialTab = 'general', onClose }: PropertiesSheetProps) {
  return (
    <Dialog
      variant="sheet"
      open={item !== null}
      onClose={onClose}
      title={item?.title ?? ''}
      description={item ? `${KIND_LABEL[item.kind]} · ${displayFolder(item.path.slice(0, item.path.lastIndexOf('/')))}` : undefined}
      actions={null}
    >
      {item && <PropertiesBody key={item.id} item={item} initialTab={initialTab} onClose={onClose} />}
    </Dialog>
  );
}

function PropertiesBody({ item, initialTab, onClose }: { item: RepoItem; initialTab: PropertiesTab; onClose: () => void }) {
  const source = useRepoSource();
  const queryClient = useQueryClient();
  const acl = useAcl(item.path);
  const flags = useFlags(item.path);
  const [tab, setTab] = useState<PropertiesTab>(initialTab);
  const [draftFlags, setDraftFlags] = useState<FileFlags | null>(null);
  const [draftAcl, setDraftAcl] = useState<FileAcl | null>(null);

  // Start editing from what the server has, once it arrives.
  useEffect(() => {
    if (flags.data && !draftFlags) setDraftFlags({ ...flags.data });
  }, [flags.data, draftFlags]);
  useEffect(() => {
    if (acl.data && !draftAcl) setDraftAcl(cloneAcl(acl.data));
  }, [acl.data, draftAcl]);

  const flagsDirty = !!(draftFlags && flags.data) && (draftFlags.hidden !== flags.data.hidden || draftFlags.schedulable !== flags.data.schedulable);
  const aclDirty = !!(draftAcl && acl.data) && !sameAcl(draftAcl, acl.data);

  const save = useMutation({
    mutationFn: async () => {
      if (flagsDirty && draftFlags) await source.setFlags(item.path, draftFlags);
      if (aclDirty && draftAcl) await source.setAcl(item.path, draftAcl);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: repoKeys.acl(item.path) }),
        queryClient.invalidateQueries({ queryKey: repoKeys.flags(item.path) }),
        queryClient.invalidateQueries({ queryKey: ['repo', 'folder'] }),
      ]);
      toast(`Saved changes to "${item.title}"`);
      onClose();
    },
    onError: (e: Error) => toast(`Couldn't save: ${e.message}`, { tone: 'danger' }),
  });

  return (
    <div className="flex h-full flex-col gap-5">
      <Tabs
        label="Properties"
        tabs={[
          { id: 'general', label: 'General' },
          { id: 'sharing', label: 'Sharing' },
        ]}
        value={tab}
        onChange={setTab}
      >
        {(current) =>
          current === 'general' ? (
            <GeneralTab item={item} owner={acl.data?.owner} flags={draftFlags} onFlags={setDraftFlags} error={flags.error} onRetry={() => void flags.refetch()} />
          ) : acl.isError ? (
            <QueryError error={acl.error} onRetry={() => void acl.refetch()} />
          ) : !draftAcl ? (
            <p className="m-0 text-fg-muted">Loading permissions…</p>
          ) : (
            <SharingTab item={item} acl={draftAcl} inheritedFrom={acl.data} onChange={setDraftAcl} />
          )
        }
      </Tabs>
      {/* The sheet's own footer is unused so the actions sit inside the form's state. */}
      <div className="sticky bottom-0 -mx-6 mt-auto -mb-5 flex justify-end gap-2 border-t border-divider bg-surface px-6 py-4">
        <Button size="sm" onClick={onClose}>
          {flagsDirty || aclDirty ? 'Cancel' : 'Close'}
        </Button>
        <Button
          size="sm"
          variant="primary"
          aria-disabled={!(flagsDirty || aclDirty) || save.isPending}
          title={flagsDirty || aclDirty ? undefined : 'No changes to save'}
          onClick={() => (flagsDirty || aclDirty) && !save.isPending && save.mutate()}
          className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

function GeneralTab({
  item,
  owner,
  flags,
  onFlags,
  error,
  onRetry,
}: {
  item: RepoItem;
  owner?: string;
  flags: FileFlags | null;
  onFlags: (f: FileFlags) => void;
  error: Error | null;
  onRetry: () => void;
}) {
  const rows: [string, string | undefined][] = [
    ['Name', item.name],
    ['Type', KIND_LABEL[item.kind]],
    ['Location', item.path],
    ['Owner', owner],
    ['Size', item.folder ? undefined : formatSize(item.size)],
    ['Created', formatDateTime(item.created)],
    ['Modified', formatDateTime(item.modified)],
  ];
  return (
    <div className="flex flex-col gap-6">
      <dl className="m-0 grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-3">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-fg-muted">{label}</dt>
              <dd className="m-0 break-words">{value}</dd>
            </div>
          ))}
        {item.description && (
          <div className="contents">
            <dt className="text-fg-muted">Description</dt>
            <dd className="m-0 leading-relaxed">{item.description}</dd>
          </div>
        )}
      </dl>
      <fieldset className="m-0 flex flex-col gap-3 border-0 border-t border-divider p-0 pt-5">
        <legend className="sr-only">Options</legend>
        {error ? (
          <QueryError error={error} onRetry={onRetry} />
        ) : !flags ? (
          <p className="m-0 text-fg-muted">Loading options…</p>
        ) : (
          <>
            <Checkbox
              label="Hidden"
              checked={flags.hidden}
              onChange={(hidden) => onFlags({ ...flags, hidden })}
            />
            {!item.folder && (
              <Checkbox
                label="Allow scheduling"
                checked={flags.schedulable}
                onChange={(schedulable) => onFlags({ ...flags, schedulable })}
              />
            )}
          </>
        )}
      </fieldset>
    </div>
  );
}

function SharingTab({
  item,
  acl,
  inheritedFrom,
  onChange,
}: {
  item: RepoItem;
  acl: FileAcl;
  inheritedFrom?: FileAcl;
  onChange: (acl: FileAcl) => void;
}) {
  const recipients = useRecipients(!acl.inheriting);
  const [adding, setAdding] = useState('');
  const present = new Set(acl.entries.map((e) => `${e.kind}:${e.recipient}`));
  const options = useMemo(
    () => [
      ...(recipients.data?.users ?? []).map((name) => ({ value: `user:${name}`, label: name, group: 'Users' })),
      ...(recipients.data?.roles ?? []).map((name) => ({ value: `role:${name}`, label: name, group: 'Roles' })),
    ].filter((o) => !present.has(o.value)),
    [recipients.data, acl.entries],
  );

  function setInheriting(inheriting: boolean) {
    // Turning inheritance off starts from what was inherited, as the GWT console does.
    const entries = inheriting ? (inheritedFrom?.entries ?? acl.entries) : acl.entries;
    onChange({ ...acl, inheriting, entries: entries.map((e) => ({ ...e, permissions: new Set(e.permissions) })) });
  }

  function updateEntry(entry: AclEntry, permissions: Set<Permission>) {
    onChange({ ...acl, entries: acl.entries.map((e) => (e === entry ? { ...e, permissions } : e)) });
  }

  function add() {
    const [kind, ...rest] = adding.split(':');
    const recipient = rest.join(':');
    if (!recipient) return;
    const entry: AclEntry = { recipient, kind: kind === 'role' ? 'role' : 'user', modifiable: true, permissions: new Set(['read']) };
    // Keep display-only entries (Administrator) last.
    const editable = acl.entries.filter((e) => e.modifiable);
    const fixed = acl.entries.filter((e) => !e.modifiable);
    onChange({ ...acl, entries: [...editable, entry, ...fixed] });
    setAdding('');
  }

  const locked = acl.inheriting;

  return (
    <div className="flex flex-col gap-5">
      <Switch
        checked={acl.inheriting}
        onChange={setInheriting}
        label="Use the folder's permissions"
        description={
          acl.inheriting
            ? `This ${item.folder ? 'folder' : 'file'} has the same access as the folder it's in. Turn this off to set its own.`
            : 'Only the people and roles below have access.'
        }
      />

      <div role="table" aria-label="Who has access" className="flex flex-col">
        <div role="row" className="grid grid-cols-[minmax(0,1fr)_repeat(4,56px)_36px] items-end gap-1 pb-2 text-[12px] font-semibold text-fg-muted">
          <span role="columnheader">Who</span>
          {PERMISSIONS.map((p) => (
            <span key={p} role="columnheader" className="text-center">
              {PERMISSION_LABEL[p]}
            </span>
          ))}
          <span role="columnheader" className="sr-only">
            Remove
          </span>
        </div>
        {acl.entries.map((entry) => {
          const disabled = locked || !entry.modifiable;
          return (
            <div
              key={`${entry.kind}:${entry.recipient}`}
              role="row"
              className="grid grid-cols-[minmax(0,1fr)_repeat(4,56px)_36px] items-center gap-1 border-t border-divider py-2"
            >
              <span role="cell" className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                  {entry.modifiable ? entry.kind === 'role' ? <Users size={14} /> : <User size={14} /> : <Shield size={14} />}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold">{entry.recipient}</span>
                  <span className="text-[12px] text-fg-muted">
                    {entry.modifiable ? (entry.kind === 'role' ? 'Role' : 'User') : 'Always has full access'}
                  </span>
                </span>
              </span>
              {PERMISSIONS.map((p) => (
                <span key={p} role="cell" className="flex justify-center">
                  <Checkbox
                    aria-label={`${PERMISSION_LABEL[p]} for ${entry.recipient}`}
                    checked={entry.permissions.has(p)}
                    disabled={disabled}
                    onChange={(on) => updateEntry(entry, togglePermission(entry.permissions, p, on))}
                  />
                </span>
              ))}
              <span role="cell" className="flex justify-center">
                {!disabled && (
                  <IconButton
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${entry.recipient}`}
                    onClick={() => onChange({ ...acl, entries: acl.entries.filter((e) => e !== entry) })}
                    className="size-8"
                  >
                    <X size={15} aria-hidden="true" />
                  </IconButton>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {!locked && (
        <div className="flex items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-fg-muted">Add a user or role</span>
            <select
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              disabled={!recipients.data}
              className="h-9 rounded-control border border-border-strong bg-surface px-2.5 text-fg"
            >
              <option value="">{recipients.isPending ? 'Loading…' : 'Choose…'}</option>
              {(['Users', 'Roles'] as const).map((group) => (
                <optgroup key={group} label={group}>
                  {options
                    .filter((o) => o.group === group)
                    .map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <Button size="sm" icon={<Plus size={15} aria-hidden="true" />} aria-disabled={!adding} onClick={add} className="aria-disabled:opacity-50">
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
