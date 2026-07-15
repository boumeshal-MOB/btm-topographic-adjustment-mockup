import { createBrowserRouter } from 'react-router-dom';
import AppShell from '@/app/AppShell';
import DevFixtures from '@/app/pages/DevFixtures';
import ProcessingsPage from '@/features/processings/ProcessingsPage';
import ProcessingDetailPage from '@/features/processings/ProcessingDetailPage';
import RunDetailPage from '@/features/processings/RunDetailPage';
import WizardPage from '@/features/create/WizardPage';
import AnalysisLabPage from '@/features/analysis/AnalysisLabPage';

/**
 * Only screens with working functionality are registered here (protocol rule:
 * "no dead primary action"). `/dev/fixtures` is registered but never linked from
 * navigation (front/10 §11, demo/40 §4).
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <ProcessingsPage /> },
      { path: 'create/:draftId', element: <WizardPage /> },
      { path: 'processing/topographic-adjustment/:id', element: <ProcessingDetailPage /> },
      { path: 'processing/topographic-adjustment/:id/runs/:runId', element: <RunDetailPage /> },
      { path: 'processing/topographic-adjustment/:id/analysis', element: <AnalysisLabPage /> },
      { path: 'dev/fixtures', element: <DevFixtures /> },
    ],
  },
]);
