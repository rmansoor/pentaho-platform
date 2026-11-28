import { useEffect, useId, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, toast } from '@helix/ui';
import { repoKeys, useRepoSource } from '../../api/repo-context';
import { RESERVED_NAME_CHARACTERS } from '../../api/repo';
import { displayFolder } from './columns';
import { t } from '../../i18n';

export interface NewFolderDialogProps {
  open: boolean;
  /** Folder the new one goes into. */
  parent: string;
  onClose: () => void;
  onCreated?: (path: string) => void;
}

/** Explains a name the repository will refuse, or null when it's fine. */
export function folderNameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return t('files.newFolder.enterName');
  if (trimmed === '.' || trimmed === '..') return t('files.newFolder.reserved');
  const bad = RESERVED_NAME_CHARACTERS.find((c) => trimmed.includes(c));
  if (bad) return bad === '\t' ? t('files.newFolder.noTabs') : t('files.newFolder.badCharacter', { character: bad });
  return null;
}

export function NewFolderDialog({ open, parent, onClose, onCreated }: NewFolderDialogProps) {
  const source = useRepoSource();
  const queryClient = useQueryClient();
  const formId = useId();
  const inputId = useId();
  const [name, setName] = useState('');
  useEffect(() => {
    if (open) setName('');
  }, [open]);

  const create = useMutation({
    mutationFn: (path: string) => source.createFolder(path),
    onSuccess: async (_, path) => {
      await queryClient.invalidateQueries({ queryKey: repoKeys.folder(parent) });
      toast(t('files.newFolder.created', { name: name.trim() }), onCreated ? { action: { label: t('files.open'), onClick: () => onCreated(path) } } : {});
      onClose();
    },
    onError: (e: Error) => toast(e.message, { tone: 'danger' }),
  });

  const problem = folderNameProblem(name);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (problem || create.isPending) return;
    create.mutate(`${parent === '/' ? '' : parent}/${name.trim()}`);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('files.newFolder.title')}
      description={t('files.newFolder.in', { folder: displayFolder(parent) })}
      actions={
        <>
          <Button size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" variant="primary" type="submit" form={formId} aria-disabled={!!problem || create.isPending} title={problem ?? undefined}>
            {t('files.newFolder.create')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-[13px] font-semibold text-fg-soft">
          {t('files.newFolder.name')}
        </label>
        <input
          id={inputId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          className="h-10 rounded-control border border-border-strong bg-surface px-3 text-fg"
        />
        {name && problem && <p className="m-0 text-[13px] text-danger-fg">{problem}</p>}
      </form>
    </Dialog>
  );
}
