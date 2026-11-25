import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../api/http';
import { RepoSourceProvider } from '../api/repo-context';
import { httpRepoSource, type RepoSource } from '../api/repo';
import { SchedulerSourceProvider } from '../api/scheduler-context';
import { httpSchedulerSource, type SchedulerSource } from '../api/scheduler';

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
  schedulerSource = httpSchedulerSource,
  children,
}: {
  queryClient: QueryClient;
  repoSource?: RepoSource;
  schedulerSource?: SchedulerSource;
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <RepoSourceProvider source={repoSource}>
        <SchedulerSourceProvider source={schedulerSource}>{children}</SchedulerSourceProvider>
      </RepoSourceProvider>
    </QueryClientProvider>
  );
}
