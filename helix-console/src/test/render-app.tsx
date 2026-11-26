import { act, render } from '@testing-library/react';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { BASEPATH, createAppRouter } from '../app/router';
import { AppProviders, createQueryClient } from '../app/providers';
import { createFixtureRepoSource } from '../api/mock/repo-fixture';
import type { RepoSource } from '../api/repo';
import { createFixtureSchedulerSource } from '../api/mock/scheduler-fixture';
import type { SchedulerSource } from '../api/scheduler';
import { createFixtureDataSourceSource } from '../api/mock/datasource-fixture';
import type { DataSourceSource } from '../api/datasources';
import { createFixtureAdminSource } from '../api/mock/admin-fixture';
import type { AdminSource } from '../api/admin';

/** Renders the whole console at `path` (e.g. "/files?path=/public"), backed by the sample repository. */
export async function renderApp(
  path: string,
  repoSource: RepoSource = createFixtureRepoSource(),
  schedulerSource: SchedulerSource = createFixtureSchedulerSource(),
  dataSourceSource: DataSourceSource = createFixtureDataSourceSource(),
  adminSource: AdminSource = createFixtureAdminSource(),
) {
  const prefix = BASEPATH === '/' ? '' : BASEPATH;
  const history = createMemoryHistory({ initialEntries: [`${prefix}${path}`] });
  const router = createAppRouter(history);
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false, staleTime: Infinity } });
  await act(async () => {
    render(
      <AppProviders queryClient={queryClient} repoSource={repoSource} schedulerSource={schedulerSource} dataSourceSource={dataSourceSource} adminSource={adminSource}>
        <RouterProvider router={router} />
      </AppProviders>,
    );
    await router.load();
  });
  return { router, queryClient };
}
