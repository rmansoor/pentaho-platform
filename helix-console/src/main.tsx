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
import { httpDatasetSource } from './api/datasets';
import { applyLanguage } from './i18n';
import { fetchServerLocale } from './i18n/server';

// `npm run dev:mock` swaps the server for sample data; never part of a production build.
const mock = import.meta.env.DEV && import.meta.env.VITE_MOCK_API === 'true';
const repoSource = mock ? (await import('./api/mock/repo-fixture')).createFixtureRepoSource({ delayMs: 250 }) : httpRepoSource;
const schedulerSource = mock ? (await import('./api/mock/scheduler-fixture')).createFixtureSchedulerSource() : httpSchedulerSource;
const dataSourceSource = mock ? (await import('./api/mock/datasource-fixture')).createFixtureDataSourceSource() : httpDataSourceSource;
const datasetSource = mock ? (await import('./api/mock/dataset-fixture')).createFixtureDatasetSource(undefined, { delayMs: 250 }) : httpDatasetSource;
const adminSource = mock ? (await import('./api/mock/admin-fixture')).createFixtureAdminSource() : httpAdminSource;

// The user's Pentaho locale picks the language; without a server (mock mode), the browser's.
await applyLanguage((mock ? null : await fetchServerLocale()) ?? navigator.language);

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <AppProviders queryClient={createQueryClient()} repoSource={repoSource} schedulerSource={schedulerSource} dataSourceSource={dataSourceSource} adminSource={adminSource} datasetSource={datasetSource}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
