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

/** Loads the baseline trial; the workspace is ready once the map and the recap are on screen. */
async function openBaseline(processingId: number) {
  const user = userEvent.setup();
  renderLab(processingId);
  const load = await screen.findByTestId('load-baseline');
  await waitFor(() => expect(load).toBeEnabled());
  await user.click(load);
  await screen.findByTestId('run-recap', {}, { timeout: 30_000 });
  return user;
}

/** The points table is collapsed by default; open it when a case needs the numbers. */
async function expandPointsTable(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('toggle-points-table').querySelector('input')!);
  return screen.findByRole('table', { name: 'Analysis point results' }, { timeout: 15_000 });
}

describe('Analysis Lab page', () => {
  beforeEach(async () => {
    queryClient.clear();
    demoStore().reset();
    window.localStorage.removeItem('btm-topographic-adjustment-language');
    await i18n.changeLanguage('en');
  });

  it('opens the workspace with the map, the recap and the observation detail', async () => {
    const processingId = demoStore().listProcessings()[0].id;
    const user = await openBaseline(processingId);

    expect(screen.getByRole('heading', { name: 'Analysis Lab' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Network map with stations, points and error ellipses' })).toBeVisible();
    expect(screen.getByRole('table', { name: 'Analysis observations' })).toBeVisible();
    expect(screen.getByTestId('analysis-inspector')).toHaveTextContent('Select a station, a point or a sight line');

    // the heavy table stays out of the way until it is asked for
    expect(screen.queryByRole('table', { name: 'Analysis point results' })).not.toBeInTheDocument();
    const pointTable = await expandPointsTable(user);
    expect(within(pointTable).getByText(/Control points/)).toBeVisible();
    for (const header of ['Approximate E / N / H', 'Adjusted E / N / H', 'ΔE / ΔN / ΔH / Δ3D', 'σE / σN / σH', 'Ellipse a / b', 'Max |v|/σ']) {
      expect(within(pointTable).getByText(header)).toBeVisible();
    }
  }, 90_000);

  it('drives the inspector and the observation list from a point selected in the table', async () => {
    const processingId = demoStore().listProcessings()[0].id;
    const user = await openBaseline(processingId);
    const pointTable = await expandPointsTable(user);

    const firstRow = within(pointTable).getAllByRole('row')
      .find((row) => row.getAttribute('data-testid')?.startsWith('point-row-'))!;
    const engineName = firstRow.getAttribute('data-testid')!.replace('point-row-', '');
    await user.click(firstRow);

    const inspector = screen.getByTestId('analysis-inspector');
    await waitFor(() => expect(inspector).toHaveTextContent(engineName));
    expect(firstRow).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(`Observations for ${engineName}`)).toBeVisible();
  }, 90_000);

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
  }, 90_000);

  it('will not run a trial while nothing has changed', async () => {
    const processingId = demoStore().listProcessings()[0].id;
    await openBaseline(processingId);

    expect(screen.getByTestId('trial-up-to-date')).toBeVisible();
    expect(screen.getByTestId('run-trial')).toBeDisabled();
    expect(screen.queryByTestId('stale-trial')).not.toBeInTheDocument();
  }, 90_000);

  it('applies an edit explicitly, marks the result stale, then recalculates from the review dialog', async () => {
    const processingId = demoStore().listProcessings()[0].id;
    const user = await openBaseline(processingId);

    const observationTable = screen.getByRole('table', { name: 'Analysis observations' });
    const firstSight = within(observationTable).getAllByRole('row')
      .find((row) => row.getAttribute('data-testid')?.startsWith('observation-row-'))!;
    await user.click(firstSight);

    // editing is a mode: nothing changes until it is applied
    await user.click(screen.getByTestId('inspector-edit'));
    const inspector = screen.getByTestId('analysis-inspector');
    const boxes = await within(inspector).findAllByRole('checkbox');
    await user.click(boxes[0]);
    expect(screen.queryByTestId('stale-trial')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('inspector-apply'));
    expect(await screen.findByTestId('stale-trial')).toBeVisible();
    expect(screen.getByTestId('save-candidate')).toBeDisabled();

    // the run is confirmed against a before → after list
    await user.click(screen.getByTestId('run-trial'));
    expect(await screen.findByRole('heading', { name: /Review this trial/ })).toBeVisible();
    expect(screen.getByText('Measurement component')).toBeVisible();
    await user.type(screen.getByTestId('trial-name').querySelector('input')!, 'Excluded one component');
    await user.click(screen.getByTestId('confirm-run-trial'));

    await waitFor(() => expect(screen.queryByTestId('stale-trial')).not.toBeInTheDocument(), { timeout: 30_000 });
    expect(screen.getByTestId('run-recap')).toBeVisible();
  }, 120_000);

  it('discards an edit that is not applied', async () => {
    const processingId = demoStore().listProcessings()[0].id;
    const user = await openBaseline(processingId);

    const observationTable = screen.getByRole('table', { name: 'Analysis observations' });
    const firstSight = within(observationTable).getAllByRole('row')
      .find((row) => row.getAttribute('data-testid')?.startsWith('observation-row-'))!;
    await user.click(firstSight);
    await user.click(screen.getByTestId('inspector-edit'));
    const inspector = screen.getByTestId('analysis-inspector');
    const boxes = await within(inspector).findAllByRole('checkbox');
    await user.click(boxes[0]);
    await user.click(screen.getByTestId('inspector-cancel'));

    expect(screen.queryByTestId('stale-trial')).not.toBeInTheDocument();
    expect(screen.getByTestId('trial-up-to-date')).toBeVisible();
  }, 90_000);

  it('renders the workspace in French', async () => {
    const processingId = demoStore().listProcessings()[0].id;
    await i18n.changeLanguage('fr');
    await openBaseline(processingId);

    expect(screen.getByText('Plan du réseau')).toBeVisible();
    expect(screen.getByTestId('analysis-inspector'))
      .toHaveTextContent('Sélectionnez une station, un point ou une visée');
    expect(screen.getByTestId('run-trial')).toHaveTextContent("Lancer l'essai");

    await i18n.changeLanguage('en');
  }, 90_000);
});
