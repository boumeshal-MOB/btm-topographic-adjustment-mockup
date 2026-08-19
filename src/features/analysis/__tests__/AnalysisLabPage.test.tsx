import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import { queryClient } from '@/app/query-client';
import { demoStore } from '@/demo/store';
import i18n from '@/app/i18n';
import AnalysisLabPage from '@/features/analysis/AnalysisLabPage';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';

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

/** The observation table follows the same compact default as the points table. */
async function expandObservationsTable(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('toggle-observations-table').querySelector('input')!);
  return screen.findByRole('table', { name: 'Analysis observations' }, { timeout: 15_000 });
}

describe('Analysis Lab page', () => {
  beforeEach(async () => {
    queryClient.clear();
    demoStore().reset();
    window.localStorage.removeItem('btm-topographic-adjustment-language');
    await i18n.changeLanguage('en');
  });

  it('opens a compact workspace and expands either result table on demand', async () => {
    const processingId = demoStore().listProcessings()[0].id;
    const user = await openBaseline(processingId);

    expect(screen.getByRole('heading', { name: 'Analysis Lab' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Network map with stations, points and error ellipses' })).toBeVisible();
    const rays = screen.getAllByTestId(/^network-ray-/);
    expect(rays.length).toBeGreaterThan(0);
    expect(rays.every((ray) => Number(ray.getAttribute('stroke-opacity')) >= 0.24)).toBe(true);
    expect(screen.getByTestId('analysis-inspector')).toHaveTextContent('Select a station, a point or a sight line');

    // Both heavy tables stay out of the way until they are asked for.
    expect(screen.queryByRole('table', { name: 'Analysis point results' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Analysis observations' })).not.toBeInTheDocument();
    const pointTable = await expandPointsTable(user);
    expect(within(pointTable).getByText(/Control points/)).toBeVisible();
    for (const header of ['Approximate E / N / H', 'Adjusted E / N / H', 'ΔE / ΔN / ΔH / Δ3D', 'σE / σN / σH', 'Ellipse a / b', 'Max |v|/σ']) {
      expect(within(pointTable).getByText(header)).toBeVisible();
    }
    expect(await expandObservationsTable(user)).toBeVisible();
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

    const observationTable = await expandObservationsTable(user);
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

    const observationTable = await expandObservationsTable(user);
    const firstSight = within(observationTable).getAllByRole('row')
      .find((row) => row.getAttribute('data-testid')?.startsWith('observation-row-'))!;
    await user.click(firstSight);

    // editing is a mode: nothing changes until it is applied
    await user.click(screen.getByTestId('sight-observation-edit'));
    const inspector = screen.getByTestId('analysis-inspector');
    const boxes = await within(inspector).findAllByRole('checkbox');
    await user.click(boxes[0]);
    expect(screen.queryByTestId('stale-trial')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('sight-observation-apply'));
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

    const observationTable = await expandObservationsTable(user);
    const firstSight = within(observationTable).getAllByRole('row')
      .find((row) => row.getAttribute('data-testid')?.startsWith('observation-row-'))!;
    await user.click(firstSight);
    await user.click(screen.getByTestId('sight-observation-edit'));
    const inspector = screen.getByTestId('analysis-inspector');
    const boxes = await within(inspector).findAllByRole('checkbox');
    await user.click(boxes[0]);
    await user.click(screen.getByTestId('sight-observation-cancel'));

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

  it('shows an in-page recovery error for an incomplete legacy response instead of crashing', async () => {
    const processingId = demoStore().listProcessings()[0].id;
    server.use(http.get(`/api/v2/topographic-adjustments/${processingId}`, () => HttpResponse.json({
      versions: [],
      variables: [],
      runs: [],
    })));

    renderLab(processingId);

    expect(await screen.findByRole('alert')).toHaveTextContent('incomplete');
    expect(screen.getByRole('link', { name: 'Back to processing' })).toBeVisible();
    expect(screen.queryByText(/Cannot read properties/)).not.toBeInTheDocument();
  });

  it('shows an applied control sigma in magenta in both the inspector and points table', async () => {
    const processingId = demoStore().listProcessings()[0].id;
    const user = await openBaseline(processingId);
    const pointTable = await expandPointsTable(user);
    const heightSigma = [...pointTable.querySelectorAll('[data-testid^="point-constraint-sigma-"][data-testid$="-h"]')]
      .find((value) => value.textContent?.includes('mm'))!;
    const referenceRow = heightSigma.closest('tr')!;
    const engineName = referenceRow.getAttribute('data-testid')!.replace('point-row-', '');

    await user.click(referenceRow);
    expect(await screen.findByTestId('control-constraints-clear')).toBeDisabled();
    expect(screen.getByTestId('observation-precision-clear')).toBeDisabled();
    await user.click(await screen.findByTestId('control-constraints-edit'));
    const sigmaH = screen.getByLabelText('σ H mm');
    await user.clear(sigmaH);
    await user.type(sigmaH, '1');
    await user.click(screen.getByTestId('control-constraints-apply'));

    const inspectorValue = await screen.findByTestId('control-sigma-h');
    const tableValue = screen.getByTestId(`point-constraint-sigma-${engineName}-h`);
    expect(inspectorValue).toHaveTextContent('1.00 mm');
    expect(tableValue).toHaveTextContent('1.0 mm');
    expect(inspectorValue).toHaveStyle({ color: '#C026D3' });
    expect(tableValue).toHaveStyle({ color: '#C026D3' });
    expect(screen.getByTestId('control-constraints-clear')).toBeEnabled();
    expect(screen.getByTestId('observation-precision-clear')).toBeDisabled();
    expect(screen.getByTestId('stale-trial')).toBeVisible();

    await user.click(screen.getByTestId('control-constraints-clear'));
    await waitFor(() => expect(tableValue).not.toHaveStyle({ color: '#C026D3' }));
    expect(screen.getByTestId('control-constraints-clear')).toBeDisabled();
  }, 90_000);

  it('edits and resets observation precision independently with the same section actions', async () => {
    const processingId = demoStore().listProcessings()[0].id;
    const user = await openBaseline(processingId);
    const pointTable = await expandPointsTable(user);
    const referenceRow = [...pointTable.querySelectorAll('[data-testid^="point-constraint-sigma-"][data-testid$="-h"]')]
      .find((value) => value.textContent?.includes('mm'))!.closest('tr')!;

    await user.click(referenceRow);
    const section = await screen.findByTestId('observation-precision-section');
    await user.click(screen.getByTestId('observation-precision-edit'));
    const hzSigma = within(section).getAllByLabelText('Hz ″')[0];
    await user.clear(hzSigma);
    await user.type(hzSigma, '4.25');
    await user.click(screen.getByTestId('observation-precision-apply'));

    const changedValue = section.querySelector('[data-testid$="-sigmaHzArcSec"]')!;
    expect(changedValue).toHaveTextContent('4.25');
    expect(changedValue).toHaveStyle({ color: '#C026D3' });
    expect(screen.getByTestId('observation-precision-clear')).toBeEnabled();
    expect(screen.getByTestId('control-constraints-clear')).toBeDisabled();

    await user.click(screen.getByTestId('observation-precision-clear'));
    await waitFor(() => expect(changedValue).not.toHaveStyle({ color: '#C026D3' }));
    expect(screen.getByTestId('observation-precision-clear')).toBeDisabled();
  }, 90_000);

  it('keeps map controls readable, colours role filters and labels every selected point', async () => {
    const processingId = demoStore().listProcessings()[0].id;
    const user = await openBaseline(processingId);

    expect(screen.getByTestId('delta-threshold-controls')).toBeVisible();
    const referenceFilter = screen.getByTestId('role-filter-reference');
    await user.click(referenceFilter);
    expect(referenceFilter).toHaveAttribute('aria-pressed', 'true');
    expect(referenceFilter).toHaveStyle({ backgroundColor: '#009B55', color: '#fff' });
    expect(screen.getByTestId('legend-station-symbol')).toHaveStyle({ color: '#0067C5' });
    expect(screen.getByTestId('legend-reference-symbol')).toHaveStyle({ color: '#009B55' });
    expect(screen.getByTestId('legend-auxiliary-symbol')).toHaveStyle({ color: '#E66A00' });

    const labels = screen.getByTestId('toggle-map-labels');
    await user.click(labels); // all
    await user.click(labels); // none, except the explicit selection
    const pointButton = screen.getAllByRole('button', { name: /Inspect point/ })[0];
    const engineName = pointButton.getAttribute('aria-label')!.replace('Inspect point ', '');
    await user.click(pointButton);
    expect(await screen.findByTestId(`network-label-${engineName}`)).toBeVisible();
  }, 90_000);

  it('uses Ctrl+click consistently to add and remove point selections', async () => {
    const processingId = demoStore().listProcessings()[0].id;
    const user = await openBaseline(processingId);
    const pointTable = await expandPointsTable(user);
    const rows = within(pointTable).getAllByRole('row')
      .filter((row) => row.getAttribute('data-testid')?.startsWith('point-row-'));

    await user.click(rows[0]);
    await user.keyboard('{Control>}');
    await user.click(rows[1]);
    await user.keyboard('{/Control}');

    expect(rows[0]).toHaveAttribute('aria-selected', 'true');
    expect(rows[1]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('analysis-inspector')).toHaveTextContent('2 selected');
  }, 90_000);
  it('lets the trial be read as the STAR*NET files it generates', async () => {
    // Debugging a native run means reading the exact .dat and .prj it was given.
    const processingId = demoStore().listProcessings()[0].id;
    const user = await openBaseline(processingId);

    await user.click(screen.getByRole('button', { name: /Generated STAR\*NET files/ }));
    const files = await screen.findByTestId('analysis-native-files');
    expect(within(files).getByLabelText('input.dat')).toHaveTextContent(/^# Processing/);
    await user.click(within(files).getByRole('button', { name: 'project.prj' }));
    expect(within(files).getByLabelText('project.prj')).toHaveTextContent('input.dat');
  }, 90_000);
});
