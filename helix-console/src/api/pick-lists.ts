import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { toast } from '@helix/ui';
import { useRepoSource } from './repo-context';
import { kindOf, type FileKind } from './repo';
import { t } from '../i18n';

/*
 * Favorites and recents, stored as per-user settings in the same JSON the GWT console writes
 * (AbstractFilePickList): [{"fullPath": "...", "title": "...", "lastUse": <epoch ms>}]. Sharing
 * the format means both consoles see the same lists during the transition.
 */

export type PickListKey = 'favorites' | 'recent';

export interface PickItem {
  fullPath: string;
  title: string;
  lastUse: number;
  kind: FileKind;
}

/** The GWT console keeps 10 recents. */
export const MAX_RECENTS = 10;

const pickItemSchema = z.object({
  fullPath: z.string(),
  title: z.string().nullish(),
  lastUse: z.union([z.number(), z.string()]).nullish(),
});

/** Parses a stored list; unreadable entries are skipped rather than failing the page. */
export function parsePickList(text: string | null): PickItem[] {
  if (!text) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const parsed = pickItemSchema.safeParse(entry);
    if (!parsed.success) return [];
    const { fullPath, title, lastUse } = parsed.data;
    const name = fullPath.slice(fullPath.lastIndexOf('/') + 1);
    // Folders in a pick list have no extension; treat extensionless names as folders.
    const kind = name.includes('.') ? kindOf(name) : 'folder';
    return [{ fullPath, title: title || name, lastUse: Number(lastUse) || 0, kind }];
  });
}

export function serializePickList(items: PickItem[]): string {
  return JSON.stringify(items.map(({ fullPath, title, lastUse }) => ({ fullPath, title, lastUse })));
}

const pickListKey = (key: PickListKey) => ['user-settings', key] as const;

export function usePickList(key: PickListKey) {
  const source = useRepoSource();
  return useQuery({
    queryKey: pickListKey(key),
    queryFn: async ({ signal }) => parsePickList(await source.getUserSetting(key, signal)),
  });
}

/** Add to or remove from favorites; optimistic, rolled back if the save fails. */
export function useToggleFavorite() {
  const source = useRepoSource();
  const queryClient = useQueryClient();
  const queryKey = pickListKey('favorites');

  return useMutation({
    mutationFn: async ({ path, title, kind }: { path: string; title: string; kind: FileKind }) => {
      const current = parsePickList(await source.getUserSetting('favorites'));
      const exists = current.some((f) => f.fullPath === path);
      const next = exists
        ? current.filter((f) => f.fullPath !== path)
        : [...current, { fullPath: path, title, lastUse: 0, kind }];
      await source.setUserSetting('favorites', serializePickList(next));
      return { next, added: !exists };
    },
    onMutate: async ({ path, title, kind }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PickItem[]>(queryKey);
      if (previous) {
        const exists = previous.some((f) => f.fullPath === path);
        queryClient.setQueryData<PickItem[]>(
          queryKey,
          exists ? previous.filter((f) => f.fullPath !== path) : [...previous, { fullPath: path, title, lastUse: 0, kind }],
        );
      }
      return { previous };
    },
    onSuccess: ({ next, added }, { title }) => {
      queryClient.setQueryData(queryKey, next);
      toast(t(added ? 'common.favoriteAdded' : 'common.favoriteRemoved', { name: title }));
    },
    onError: (e: Error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast(`Couldn't update favorites: ${e.message}`, { tone: 'danger' });
    },
  });
}

/** Records a file as opened; used once the console opens files itself. */
export function recordRecent(items: PickItem[], path: string, title: string, now = Date.now()): PickItem[] {
  const rest = items.filter((i) => i.fullPath !== path);
  return [{ fullPath: path, title, lastUse: now, kind: kindOf(path) }, ...rest].slice(0, MAX_RECENTS);
}
