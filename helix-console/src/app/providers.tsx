import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RepoSourceProvider } from '../api/repo-context';
import { httpRepoSource, type RepoSource } from '../api/repo';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
  });
}

/** Server state and data sources. Tests and `dev:mock` pass fixture sources here. */
export function AppProviders({
  queryClient,
  repoSource = httpRepoSource,
  children,
}: {
  queryClient: QueryClient;
  repoSource?: RepoSource;
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <RepoSourceProvider source={repoSource}>{children}</RepoSourceProvider>
    </QueryClientProvider>
  );
}
