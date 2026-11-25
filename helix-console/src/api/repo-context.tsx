import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { httpRepoSource, type RepoSource } from './repo';

const RepoSourceContext = createContext<RepoSource>(httpRepoSource);

export function RepoSourceProvider({ source, children }: { source: RepoSource; children: ReactNode }) {
  return <RepoSourceContext.Provider value={source}>{children}</RepoSourceContext.Provider>;
}

export const repoKeys = {
  all: ['repo'] as const,
  folder: (path: string) => ['repo', 'folder', path] as const,
  trash: ['repo', 'trash'] as const,
  acl: (path: string) => ['repo', 'acl', path] as const,
  flags: (path: string) => ['repo', 'flags', path] as const,
  recipients: ['repo', 'recipients'] as const,
};

export function useRepoSource(): RepoSource {
  return useContext(RepoSourceContext);
}

export function useTrash() {
  const source = useContext(RepoSourceContext);
  return useQuery({ queryKey: repoKeys.trash, queryFn: ({ signal }) => source.listTrash(signal) });
}

/** One folder and its direct children. Shared by the folder tree and the file table. */
export function useFolder(path: string, enabled = true) {
  const source = useContext(RepoSourceContext);
  return useQuery({
    queryKey: repoKeys.folder(path),
    queryFn: ({ signal }) => source.listFolder(path, signal),
    enabled,
  });
}

export function useAcl(path: string) {
  const source = useContext(RepoSourceContext);
  return useQuery({ queryKey: repoKeys.acl(path), queryFn: ({ signal }) => source.getAcl(path, signal) });
}

export function useFlags(path: string) {
  const source = useContext(RepoSourceContext);
  return useQuery({ queryKey: repoKeys.flags(path), queryFn: ({ signal }) => source.getFlags(path, signal) });
}

export function useRecipients(enabled: boolean) {
  const source = useContext(RepoSourceContext);
  return useQuery({
    queryKey: repoKeys.recipients,
    queryFn: ({ signal }) => source.listRecipients(signal),
    enabled,
    staleTime: 5 * 60_000,
  });
}
