import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import { demoStore } from '@/demo/store';
import AnalysisLabPage from '@/features/analysis/AnalysisLabPage';

function renderLab(processingId: number) {
  const router = createMemoryRouter([
    { path: '/processing/topographic-adjustment/:id/analysis', element: <AnalysisLabPage /> },
    { path: '/processing/topographic-adjustment/:id', element: <div>processing</div> },
  ], { initialEntries: [`/processing/topographic-adjustment/${processingId}/analysis`] });
  return render(<AppProviders><RouterProvider router={router} /></AppProviders>);
}

describe('Analysis Lab page', () => {
  beforeEach(() => demoStore().reset());

  it('auto-selects the active version and latest epoch, then keeps the network visible', async () => {
    const processingId = demoStore().listProcessings()[0].id;
    const user = userEvent.setup();
    renderLab(processingId);

    expect(await screen.findByRole('heading', { name: 'Analysis Lab' })).toBeVisible();
    const load = await screen.findByTestId('load-baseline');
    await waitFor(() => expect(load).toBeEnabled());
    await user.click(load);

    expect(await screen.findByText('All points · Trial 0 · baseline', {}, { timeout: 30_000 })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Network map with stations, points and error ellipses' })).toBeVisible();
    const pointTable = screen.getByRole('table', { name: 'Analysis point results' });
    expect(pointTable).toBeVisible();
    expect(within(pointTable).getByText(/Control points/)).toBeVisible();
    expect(screen.getByText('Observation precision, exclusions and measured values')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Calculate trial' })).toBeVisible();
    expect(screen.getByText('6. Recalculate a historical period')).toBeVisible();
  }, 45_000);
});
