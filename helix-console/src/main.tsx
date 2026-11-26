import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/jetbrains-mono';
import './styles.css';
import { router } from './app/router';
import { AppProviders, createQueryClient } from './app/providers';
import { httpRepoSource } from './api/repo';
import { httpSchedulerSource } from './api/scheduler';
import { httpDataSourceSource } from './api/datasources';
import { httpAdminSource } from './api/admin';

// `npm run dev:mock` swaps the server for sample data; never part of a production build.
const mock = import.meta.env.DEV && import.meta.env.VITE_MOCK_API === 'true';
const repoSource = mock ? (await import('./api/mock/repo-fixture')).createFixtureRepoSource({ delayMs: 250 }) : httpRepoSource;
const schedulerSource = mock ? (await import('./api/mock/scheduler-fixture')).createFixtureSchedulerSource() : httpSchedulerSource;
const dataSourceSource = mock ? (await import('./api/mock/datasource-fixture')).createFixtureDataSourceSource() : httpDataSourceSource;
const adminSource = mock ? (await import('./api/mock/admin-fixture')).createFixtureAdminSource() : httpAdminSource;

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <AppProviders queryClient={createQueryClient()} repoSource={repoSource} schedulerSource={schedulerSource} dataSourceSource={dataSourceSource} adminSource={adminSource}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
