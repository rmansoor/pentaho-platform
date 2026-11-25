import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';
import { AppShell } from '../shell/AppShell';
import { AreaPlaceholder } from '../features/placeholder/AreaPlaceholder';

const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
  notFoundComponent: () => (
    <AreaPlaceholder title="Page not found" description="This address doesn't match any part of the console." />
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/home' });
  },
});

function area<TPath extends string>(path: TPath, title: string, description: string) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path,
    component: () => <AreaPlaceholder title={title} description={description} />,
  });
}

const routeTree = rootRoute.addChildren([
  indexRoute,
  area('/home', 'Home', 'Recents, favorites and create actions.'),
  area('/files', 'Files', 'Folder tree, sortable file table, details panel and trash.'),
  area('/schedules', 'Schedules', 'Schedule list, the new-schedule sheet and blockout times.'),
  area('/datasources', 'Data sources', 'JDBC, analysis and metadata sources, and the data source wizard.'),
  area('/admin', 'Administration', 'Users, roles, permissions, mail server and settings.'),
]);

/** The console is served from /pentaho/console/ (vite `base`). */
export const BASEPATH = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, basepath: BASEPATH, history, defaultPreload: 'intent' });
}

export const router = createAppRouter();

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
