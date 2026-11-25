import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@helix/ui';
import { repoKeys, useRepoSource } from '../../api/repo-context';
import type { OverwriteMode, RepoItem } from '../../api/repo';

const count = (n: number, one: string) => (n === 1 ? `1 ${one}` : `${n} ${one}s`);
const what = (items: RepoItem[]) => (items.length === 1 ? `"${items[0]!.title}"` : count(items.length, 'item'));

/** Moving to trash, restoring and deleting, with cache refresh and confirmation toasts. */
export function useTrashActions() {
  const source = useRepoSource();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: repoKeys.all });
  const failed = (verb: string) => (e: Error) => toast(`Couldn't ${verb}: ${e.message}`, { tone: 'danger' });

  const restore = useMutation({
    mutationFn: ({ items, mode }: { items: RepoItem[]; mode?: OverwriteMode }) =>
      source.restore(
        items.map((i) => i.id),
        mode,
      ),
    onSettled: refresh,
    onError: failed('restore'),
  });

  const moveToTrash = useMutation({
    mutationFn: (items: RepoItem[]) => source.moveToTrash(items.map((i) => i.id)),
    onSuccess: async (_, items) => {
      await refresh();
      toast(`Moved ${what(items)} to trash`, {
        action: {
          label: 'Undo',
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
    onError: failed('move to trash'),
  });

  const deletePermanently = useMutation({
    mutationFn: (items: RepoItem[]) => source.deletePermanently(items.map((i) => i.id)),
    onSuccess: (_, items) => toast(`Deleted ${what(items)} permanently`),
    onSettled: refresh,
    onError: failed('delete'),
  });

  return { moveToTrash, restore, deletePermanently };
}
