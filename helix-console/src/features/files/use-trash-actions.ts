import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@helix/ui';
import { repoKeys, useRepoSource } from '../../api/repo-context';
import type { OverwriteMode, RepoItem } from '../../api/repo';
import { t, type MessageKey } from '../../i18n';

const what = (items: RepoItem[]) => ({ count: items.length, name: items[0]?.title ?? '' });

/** Moving to trash, restoring and deleting, with cache refresh and confirmation toasts. */
export function useTrashActions() {
  const source = useRepoSource();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: repoKeys.all });
  const failed = (key: MessageKey) => (e: Error) => toast(t(key, { message: e.message }), { tone: 'danger' });

  const restore = useMutation({
    mutationFn: ({ items, mode }: { items: RepoItem[]; mode?: OverwriteMode }) =>
      source.restore(
        items.map((i) => i.id),
        mode,
      ),
    onSettled: refresh,
    onError: failed('files.actions.restoreFailed'),
  });

  const moveToTrash = useMutation({
    mutationFn: (items: RepoItem[]) => source.moveToTrash(items.map((i) => i.id)),
    onSuccess: async (_, items) => {
      await refresh();
      toast(t('files.actions.movedToTrash', what(items)), {
        action: {
          label: t('files.undo'),
          // The trash knows these files by their ids; look them up so restore gets the trash entries.
          onClick: async () => {
            const trashed = await source.listTrash();
            const ids = new Set(items.map((i) => i.id));
            const back = trashed.filter((t) => ids.has(t.id) || items.some((i) => i.path === `${t.originalFolder}/${t.name}`));
            if (back.length) restore.mutate({ items: back });
          },
        },
      });
    },
    onError: failed('files.actions.trashFailed'),
  });

  const deletePermanently = useMutation({
    mutationFn: (items: RepoItem[]) => source.deletePermanently(items.map((i) => i.id)),
    onSuccess: (_, items) => toast(t('files.actions.deleted', what(items))),
    onSettled: refresh,
    onError: failed('files.actions.deleteFailed'),
  });

  return { moveToTrash, restore, deletePermanently };
}
