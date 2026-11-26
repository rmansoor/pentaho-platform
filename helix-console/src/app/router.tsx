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
import { HomePage } from '../features/home/HomePage';
import { SchedulesPage } from '../features/schedules/SchedulesPage';
import { DataSourcesPage } from '../features/datasources/DataSourcesPage';
import { AdminPage } from '../features/admin/AdminPage';
import { ViewerPage } from '../features/viewer/ViewerPage';
import { ContentPage } from '../features/viewer/ContentPage';
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
        onOpenFile={(file, title) => void navigate({ to: '/view', search: { path: file, title } })}
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

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/home',
  component: function HomeRoute() {
    const navigate = homeRoute.useNavigate();
    return (
      <HomePage
        onOpenFolder={(path) => void navigate({ to: '/files', search: { path } })}
        onOpenFile={(path, title) => void navigate({ to: '/view', search: { path, title } })}
      />
    );
  },
});

const schedulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/schedules',
  component: SchedulesPage,
});

const dataSourcesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/datasources',
  component: DataSourcesPage,
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  component: AdminPage,
});

const viewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/view',
  validateSearch: (search: Record<string, unknown>): { path: string; title?: string } => ({
    path: typeof search.path === 'string' ? normalizePath(search.path) : '/',
    ...(typeof search.title === 'string' && search.title ? { title: search.title } : {}),
  }),
  component: function ViewRoute() {
    const { path, title } = viewRoute.useSearch();
    const navigate = viewRoute.useNavigate();
    return <ViewerPage path={path} title={title} onOpenFolder={(folder) => void navigate({ to: '/files', search: { path: folder } })} />;
  },
});

const contentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/content',
  validateSearch: (search: Record<string, unknown>): { url: string; title?: string } => ({
    url: typeof search.url === 'string' ? search.url : '',
    ...(typeof search.title === 'string' && search.title ? { title: search.title } : {}),
  }),
  component: function ContentRoute() {
    const { url, title } = contentRoute.useSearch();
    return <ContentPage url={url} title={title ?? ''} />;
  },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  homeRoute,
  filesRoute,
  trashRoute,
  schedulesRoute,
  dataSourcesRoute,
  adminRoute,
  viewRoute,
  contentRoute,
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
