/**
 * React 18 bootstrap — isolated to this file only (protocol §2). Feature code under
 * src/features and src/domain must not call React 18-only runtime APIs so it stays
 * compatible with BTM's React 17 runtime.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { router } from '@/app/router';

async function enableMocking() {
  // The MSW layer IS the mock-up's backend (VALIDATION-DATASETS.md §1): it runs in dev AND in the built
  // Vercel bundle. The real BTM product replaces it with the Fastify API.
  const { worker } = await import('@/mocks/browser');
  await worker.start({ onUnhandledRequest: 'bypass' });
}

void enableMocking().then(() => {
  const container = document.getElementById('root');
  if (!container) throw new Error('Root container missing');

  createRoot(container).render(
    <StrictMode>
      <ErrorBoundary>
        <AppProviders>
          <RouterProvider router={router} />
        </AppProviders>
      </ErrorBoundary>
    </StrictMode>,
  );
});
