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
import { FilesPage } from '../features/files/FilesPage';
import { TrashPage } from '../features/files/TrashPage';
import { DEFAULT_FOLDER, normalizePath } from '../features/files/paths';

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

const filesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/files',
  validateSearch: (search: Record<string, unknown>): { path: string } => ({
    path: typeof search.path === 'string' && search.path.trim() ? normalizePath(search.path) : DEFAULT_FOLDER,
  }),
  component: function FilesRoute() {
    const { path } = filesRoute.useSearch();
    const navigate = filesRoute.useNavigate();
    return (
      <FilesPage
        path={path}
        onNavigate={(next) => void navigate({ search: { path: next } })}
        onOpenTrash={() => void navigate({ to: '/files/trash' })}
      />
    );
  },
});

const trashRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/files/trash',
  component: function TrashRoute() {
    const navigate = trashRoute.useNavigate();
    return <TrashPage onOpenFolder={(path) => void navigate({ to: '/files', search: { path } })} />;
  },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  area('/home', 'Home', 'Recents, favorites and create actions.'),
  filesRoute,
  trashRoute,
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
