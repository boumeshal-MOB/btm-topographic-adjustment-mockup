import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import { queryClient } from '@/app/query-client';
import { demoStore } from '@/demo/store';
import i18n from '@/app/i18n';
import AnalysisLabPage from '@/features/analysis/AnalysisLabPage';

function renderLab(processingId: number) {
  const router = createMemoryRouter([
    { path: '/processing/topographic-adjustment/:id/analysis', element: <AnalysisLabPage /> },
    { path: '/processing/topographic-adjustment/:id', element: <div>processing</div> },
  ], { initialEntries: [`/processing/topographic-adjustment/${processingId}/analysis`] });
  return render(<AppProviders><RouterProvider router={router} /></AppProviders>);
}

/** Loads the baseline trial and returns the user-event instance. */
async function openBaseline(processingId: number) {
  const user = userEvent.setup();
  renderLab(processingId);
  const load = await screen.findByTestId('load-baseline');
  await waitFor(() => expect(load).toBeEnabled());
  await user.click(load);
  await screen.findByRole('table', { name: 'Analysis point results' }, { timeout: 30_000 });
  return user;
}

describe('Analysis Lab page', () => {
  beforeEach(async () => {
    queryClient.clear();
    demoStore().reset();
    await i18n.changeLanguage('en');
  });

  it('opens the workspace with map, single points table and observation detail together', async () => {
    const processingId = demoStore().listProcessings()[0].id;
    await openBaseline(processingId);

    expect(screen.getByRole('heading', { name: 'Analysis Lab' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Network map with stations, points and error ellipses' })).toBeVisible();

    const pointTable = screen.getByRole('table', { name: 'Analysis point results' });
    expect(within(pointTable).getByText(/Reference points/)).toBeVisible();
    // the single table carries initial, adjusted, deltas, sigmas, ellipse and residual
    for (const header of ['Initial E / N / H', 'Adjusted E / N / H', 'ΔE / ΔN / ΔH / Δ3D', 'σE / σN / σH', 'Ellipse a / b', 'Max |v|/σ']) {
      expect(within(pointTable).getByText(header)).toBeVisible();
    }
    expect(screen.getByRole('table', { name: 'Analysis observations' })).toBeVisible();
    expect(screen.getByTestId('analysis-inspector')).toHaveTextContent('Select a station, a point or a sight line');
  }, 60_000);

  it('drives the inspector and the observation list from a point selected in the table', async () => {
    const processingId = demoStore().listProcessings()[0].id;
    const user = await openBaseline(processingId);

    const pointTable = screen.getByRole('table', { name: 'Analysis point results' });
    const firstRow = within(pointTable).getAllByRole('row')
      .find((row) => row.getAttribute('data-testid')?.startsWith('point-row-'))!;
    const engineName = firstRow.getAttribute('data-testid')!.replace('point-row-', '');

    await user.click(firstRow);

    const inspector = screen.getByTestId('analysis-inspector');
    await waitFor(() => expect(inspector).toHaveTextContent(engineName));
    expect(firstRow).toHaveAttribute('aria-selected', 'true');
    // the observation panel scopes itself to the same object
    expect(screen.getByText(`Observations for ${engineName}`)).toBeVisible();
  }, 60_000);

  it('selects a sight line and shows its Hz, Vz and Sd components with residuals', async () => {
    const processingId = demoStore().listProcessings()[0].id;
    const user = await openBaseline(processingId);

    const observationTable = screen.getByRole('table', { name: 'Analysis observations' });
    const firstSight = within(observationTable).getAllByRole('row')
      .find((row) => row.getAttribute('data-testid')?.startsWith('observation-row-'))!;
    await user.click(firstSight);

    const inspector = screen.getByTestId('analysis-inspector');
    await waitFor(() => expect(inspector).toHaveTextContent('Horizontal direction'));
    expect(inspector).toHaveTextContent('Zenith angle');
    expect(inspector).toHaveTextContent('Slope distance');
    expect(inspector).toHaveTextContent('Standardised');
    expect(firstSight).toHaveAttribute('aria-selected', 'true');
  }, 60_000);

  it('marks the result stale as soon as a parameter changes, and blocks saving until it is rerun', async () => {
    const processingId = demoStore().listProcessings()[0].id;
    const user = await openBaseline(processingId);

    expect(screen.queryByTestId('stale-trial')).not.toBeInTheDocument();

    // exclude one component from the inspector
    const observationTable = screen.getByRole('table', { name: 'Analysis observations' });
    const firstSight = within(observationTable).getAllByRole('row')
      .find((row) => row.getAttribute('data-testid')?.startsWith('observation-row-'))!;
    await user.click(firstSight);
    const inspector = screen.getByTestId('analysis-inspector');
    const includeBoxes = await within(inspector).findAllByRole('checkbox');
    await user.click(includeBoxes[0]);

    expect(await screen.findByTestId('stale-trial')).toBeVisible();
    await user.type(screen.getByTestId('candidate-reason').querySelector('input')!, 'test');
    expect(screen.getByTestId('save-candidate')).toBeDisabled();

    await user.click(screen.getByTestId('run-trial'));
    await waitFor(() => expect(screen.queryByTestId('stale-trial')).not.toBeInTheDocument(), { timeout: 30_000 });
  }, 90_000);

  it('renders the workspace in French', async () => {
    const processingId = demoStore().listProcessings()[0].id;
    await i18n.changeLanguage('fr');
    await openBaseline(processingId);

    expect(screen.getByText('Réseau')).toBeVisible();
    expect(screen.getByTestId('analysis-inspector'))
      .toHaveTextContent('Sélectionnez une station, un point ou une ligne de visée');
    expect(screen.getByTestId('run-trial')).toHaveTextContent("Lancer l'essai");

    await i18n.changeLanguage('en');
  }, 60_000);
});
