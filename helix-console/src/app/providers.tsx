import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../api/http';
import { RepoSourceProvider } from '../api/repo-context';
import { httpRepoSource, type RepoSource } from '../api/repo';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // A 4xx (signed out, forbidden, not found) won't change on retry; network blips might.
        retry: (failures, error) =>
          failures < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
    },
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
