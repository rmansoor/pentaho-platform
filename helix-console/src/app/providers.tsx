import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../api/http';
import { RepoSourceProvider } from '../api/repo-context';
import { httpRepoSource, type RepoSource } from '../api/repo';
import { SchedulerSourceProvider } from '../api/scheduler-context';
import { httpSchedulerSource, type SchedulerSource } from '../api/scheduler';
import { DataSourceSourceProvider, httpDataSourceSource, type DataSourceSource } from '../api/datasources';
import { AdminSourceProvider, httpAdminSource, type AdminSource } from '../api/admin';

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
  dataSourceSource = httpDataSourceSource,
  adminSource = httpAdminSource,
  children,
}: {
  queryClient: QueryClient;
  repoSource?: RepoSource;
  schedulerSource?: SchedulerSource;
  dataSourceSource?: DataSourceSource;
  adminSource?: AdminSource;
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <RepoSourceProvider source={repoSource}>
        <SchedulerSourceProvider source={schedulerSource}>
          <DataSourceSourceProvider source={dataSourceSource}>
            <AdminSourceProvider source={adminSource}>{children}</AdminSourceProvider>
          </DataSourceSourceProvider>
        </SchedulerSourceProvider>
      </RepoSourceProvider>
    </QueryClientProvider>
  );
}
