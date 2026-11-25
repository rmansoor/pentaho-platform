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
};

/** One folder and its direct children. Shared by the folder tree and the file table. */
export function useFolder(path: string, enabled = true) {
  const source = useContext(RepoSourceContext);
  return useQuery({
    queryKey: repoKeys.folder(path),
    queryFn: ({ signal }) => source.listFolder(path, signal),
    enabled,
  });
}
