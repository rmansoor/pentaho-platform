import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/jetbrains-mono';
import './styles.css';
import { router } from './app/router';
import { AppProviders, createQueryClient } from './app/providers';
import { httpRepoSource } from './api/repo';

// `npm run dev:mock` swaps the server for a sample repository; never part of a production build.
const repoSource =
  import.meta.env.DEV && import.meta.env.VITE_MOCK_API === 'true'
    ? (await import('./api/mock/repo-fixture')).createFixtureRepoSource({ delayMs: 250 })
    : httpRepoSource;

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <AppProviders queryClient={createQueryClient()} repoSource={repoSource}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
