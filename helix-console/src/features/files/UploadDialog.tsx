import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileUp, X } from 'lucide-react';
import { Button, Checkbox, cn, Dialog, toast } from '@helix/ui';
import { repoKeys, useRepoSource } from '../../api/repo-context';
import { displayFolder } from './columns';
import { formatSize } from './format';
import { t } from '../../i18n';

export interface UploadDialogProps {
  open: boolean;
  folder: string;
  /** Files dropped onto the page, to start with. */
  initialFiles?: File[];
  onClose: () => void;
}

/** Upload files (or a zip of a folder) into a repository folder. */
export function UploadDialog({ open, folder, initialFiles, onClose }: UploadDialogProps) {
  const source = useRepoSource();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [overwrite, setOverwrite] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (open) {
      setFiles(initialFiles ?? []);
      setOverwrite(false);
    }
  }, [open, initialFiles]);

  const add = (list: FileList | File[] | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    setFiles((current) => [...current.filter((f) => !incoming.some((n) => n.name === f.name)), ...incoming]);
  };

  const upload = useMutation({
    mutationFn: () => source.upload(folder, files, overwrite),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast(result.problem ?? t('files.upload.failed'), { tone: 'danger' });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: repoKeys.folder(folder) });
      toast(t('files.upload.done', { count: files.length, name: files[0]!.name }));
      onClose();
    },
    onError: (e: Error) => toast(t('files.upload.failedWith', { message: e.message }), { tone: 'danger' }),
  });

  return (
    <Dialog
      open={open}
      onClose={() => !upload.isPending && onClose()}
      title={t('files.upload.title')}
      description={t('files.upload.to', { folder: displayFolder(folder) })}
      actions={
        <>
          <Button size="sm" onClick={onClose} aria-disabled={upload.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            aria-disabled={!files.length || upload.isPending}
            title={files.length ? undefined : t('files.upload.choose')}
            onClick={() => files.length && !upload.isPending && upload.mutate()}
          >
            {upload.isPending ? t('files.upload.uploading') : t('files.upload.submit', { count: files.length })}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            add(e.dataTransfer.files);
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-1.5 rounded-card border-2 border-dashed px-4 py-6 text-center',
            dragging ? 'border-accent bg-accent-soft' : 'border-border-strong hover:bg-bg',
          )}
        >
          <FileUp size={22} className="text-accent" aria-hidden="true" />
          <span className="font-semibold">{t('files.upload.drop')}</span>
          <span className="text-[12.5px] text-fg-muted">{t('files.upload.zip')}</span>
          <input id={inputId} ref={inputRef} type="file" multiple className="sr-only" onChange={(e) => add(e.target.files)} />
        </label>

        {files.length > 0 && (
          <ul aria-label={t('files.upload.list')} className="m-0 flex max-h-48 list-none flex-col overflow-y-auto p-0">
            {files.map((file) => (
              <li key={file.name} className="flex items-center gap-2 border-t border-divider py-1.5 first:border-t-0">
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="text-[12.5px] text-fg-muted tabular-nums">{formatSize(file.size)}</span>
                <button
                  type="button"
                  aria-label={t('files.upload.removeFile', { name: file.name })}
                  onClick={() => setFiles((list) => list.filter((f) => f !== file))}
                  className="grid size-7 place-items-center rounded-[6px] text-fg-muted hover:bg-bg hover:text-fg"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <Checkbox label={t('files.upload.replace')} checked={overwrite} onChange={setOverwrite} />
      </div>
    </Dialog>
  );
}
