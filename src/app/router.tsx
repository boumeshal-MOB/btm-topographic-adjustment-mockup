import { createBrowserRouter } from 'react-router-dom';
import AppShell from '@/app/AppShell';
import RouteErrorPage from '@/app/RouteErrorPage';

/**
 * Only screens with working functionality are registered here (protocol rule:
 * "no dead primary action"). `/dev/fixtures` is registered but never linked from
 * navigation (FRONTEND-AND-ANALYSIS-LAB.md §11, VALIDATION-DATASETS.md §4).
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import('@/features/processings/ProcessingsPage')).default }),
      },
      {
        // Lazy on purpose: the browser pulls the catalogue manifest and, later, one shard. None
        // of it belongs in the initial bundle.
        path: 'validation-catalogue',
        lazy: async () => ({ Component: (await import('@/features/validation/ValidationCataloguePage')).default }),
      },
      {
        path: 'create/:draftId',
        lazy: async () => ({ Component: (await import('@/features/create/WizardPage')).default }),
      },
      {
        path: 'processing/topographic-adjustment/:id',
        lazy: async () => ({ Component: (await import('@/features/processings/ProcessingDetailPage')).default }),
      },
      {
        path: 'processing/topographic-adjustment/:id/runs/:runId',
        lazy: async () => ({ Component: (await import('@/features/processings/RunDetailPage')).default }),
      },
      {
        path: 'processing/topographic-adjustment/:id/analysis',
        lazy: async () => ({ Component: (await import('@/features/analysis/AnalysisLabPage')).default }),
      },
      {
        path: 'dev/fixtures',
        lazy: async () => ({ Component: (await import('@/app/pages/DevFixtures')).default }),
      },
    ],
  },
]);
