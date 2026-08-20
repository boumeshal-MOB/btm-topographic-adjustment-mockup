import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import { queryClient } from '@/app/query-client';
import { demoStore } from '@/demo/store';
import WizardPage from '@/features/create/WizardPage';

/**
 * A draft parked on the Adjustment step, with its approximate coordinates accepted.
 *
 * `knownReferences` is how many *known* reference coordinates the Initialisation step brought along
 * — the workbook header ones, constrained. They are what holds the network; the coordinates computed
 * at initialisation are only a starting point.
 */
function draftAtStep(step: number, knownReferences = 0) {
  const store = demoStore();
  const draft = store.createDraft('uk-supplied-hs2-nte', 'single-station');
  store.applyStationSelection(draft, ['NTE_ATS34']);
  draft.initialisation.references = store.catalogue.references
    .filter((reference) => reference.datasetId === 'ats34')
    .flatMap((reference) => {
      const target = draft.targets.find((item) => item.rawTargetName === reference.pointName);
      return target ? [{
        pointKey: target.engineName,
        eastingM: reference.eastingM,
        northingM: reference.northingM,
        heightM: reference.heightM,
        modeE: 'weak' as const,
        modeN: 'weak' as const,
        modeH: 'weak' as const,
        sigmaM: reference.sigmaM,
        source: 'ATS34 workbook header',
      }] : [];
    })
    .slice(0, knownReferences);
  if (knownReferences > 0) {
    draft.initialisation.mode = 'known-references';
    draft.initialisation.anchorStationCode = undefined;
  }
  draft.initialisation.result = store.computeDraftInitialisation(draft);
  draft.initialisation.result.accepted = true;
  draft.step = step;
  return store.saveDraft(draft);
}

function renderWizard(draftId: string) {
  const router = createMemoryRouter(
    [{ path: '/create/:draftId', element: <WizardPage /> }],
    { initialEntries: [`/create/${draftId}`] },
  );
  return render(<AppProviders><RouterProvider router={router} /></AppProviders>);
}

describe('Adjustment step: the verdict on the datum, and what weights the observations', () => {
  beforeEach(() => {
    queryClient.clear();
    demoStore().reset();
  });

  it('renders without writing the draft on mount', async () => {
    /**
     * Materialising the datum from an effect looked convenient and cost an afternoon: `update`
     * is recreated on every render, so the effect ran on every render, wrote the draft, re-rendered,
     * and React eventually threw `Maximum update depth exceeded` — surfacing inside a MUI input, far
     * from the cause. Opening a screen must not modify a configuration.
     */
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); };

    const draft = draftAtStep(5);
    renderWizard(draft.id);
    await screen.findByTestId('edit-datum-in-targets', {}, { timeout: 20_000 });

    console.error = original;
    expect(errors.filter((line) => /Maximum update depth/.test(line))).toEqual([]);
    expect(demoStore().getDraft(draft.id)?.initialisation.references).toEqual([]);
  }, 40_000);

  it('states that nothing holds the network, and keeps the wizard closed', async () => {
    /**
     * The decision moved to the Targets step, but the verdict has to be here: this is the screen
     * that launches a trial, and a trial on an unheld network answers nothing.
     */
    const draft = draftAtStep(5, 0);
    renderWizard(draft.id);
    await screen.findByTestId('edit-datum-in-targets', {}, { timeout: 20_000 });

    expect(screen.getByTestId('nothing-held')).toHaveTextContent(/no datum and no unique solution/);
    expect(screen.getByTestId('wizard-next')).toBeDisabled();
    // Nothing is held, so there is no summary table to show.
    expect(screen.queryByTestId('datum-summary-table')).toBeNull();
  }, 40_000);

  it('opens the wizard once the known references hold it, and lists what holds it', async () => {
    const draft = draftAtStep(5, 3);
    renderWizard(draft.id);
    await screen.findByTestId('datum-summary-table', {}, { timeout: 20_000 });

    await waitFor(() => expect(screen.getByTestId('wizard-next')).toBeEnabled(), { timeout: 15_000 });
    expect(screen.queryByTestId('nothing-held')).toBeNull();
    expect(screen.queryByTestId('not-enough-references')).toBeNull();
  }, 60_000);

  it('shows the measurement standard errors in the open, not buried in advanced options', async () => {
    /**
     * They were in a collapsed accordion, in metres, mixed with the earth radius — which is why the
     * question "where are the measurement precisions?" had no answer. They are the same values the
     * Instruments step owns: one authority, reachable from both screens.
     */
    const draft = draftAtStep(5, 3);
    renderWizard(draft.id);
    const block = await screen.findByTestId('adjustment-precision-NTE_ATS34', {}, { timeout: 20_000 });

    // The UK supplied project states 1.0 mm + 1 ppm for its EDM and 2.5″ for a direction.
    expect(within(block).getByLabelText(/σ Hz/)).toHaveValue(2.5);
    expect(within(block).getByTestId('precision-source-NTE_ATS34')).toHaveTextContent(/country template/);
  }, 40_000);
});

vi.setConfig({ testTimeout: 90_000 });
