import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import { queryClient } from '@/app/query-client';
import { demoStore } from '@/demo/store';
import { stationPointId } from '@/demo/resolve-run';
import WizardPage from '@/features/create/WizardPage';

/**
 * A draft parked on the Adjustment step, with its approximate coordinates accepted.
 *
 * `knownReferences` is how many *known* reference coordinates the Initialisation step brought along
 * — the workbook header ones, weighted. They are what holds the network; the coordinates computed at
 * initialisation are only a starting point.
 */
function draftAtAdjustment(knownReferences = 0) {
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
  draft.step = 5;
  return store.saveDraft(draft);
}

function renderWizard(draftId: string) {
  const router = createMemoryRouter(
    [{ path: '/create/:draftId', element: <WizardPage /> }],
    { initialEntries: [`/create/${draftId}`] },
  );
  return render(<AppProviders><RouterProvider router={router} /></AppProviders>);
}

describe('Adjustment step: the datum of every run', () => {
  beforeEach(() => {
    queryClient.clear();
    demoStore().reset();
  });

  it('renders without writing the draft on mount', async () => {
    /**
     * Materialising the datum from an effect looked convenient and cost an afternoon: `update`
     * is recreated on every render, so the effect ran on every render, wrote the draft, re-rendered,
     * and React eventually threw `Maximum update depth exceeded` — surfacing inside a MUI input, far
     * from the cause. Opening a screen must not modify a configuration; the datum is an explicit act.
     */
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); };

    const draft = draftAtAdjustment();
    renderWizard(draft.id);
    await screen.findByTestId('datum-table', {}, { timeout: 20_000 });

    console.error = original;
    expect(errors.filter((line) => /Maximum update depth/.test(line))).toEqual([]);
    // Nothing was saved by simply arriving on the step.
    expect(demoStore().getDraft(draft.id)?.initialisation.references).toEqual([]);
  }, 40_000);

  it('refuses to invent a datum when no reference has a known coordinate', async () => {
    /**
     * Fixing a station in Initialisation produced approximations for the whole network. Weighting
     * them here would pin the network to its own starting point, so the recommendation has nothing
     * to offer and the wizard says where the missing numbers come from.
     */
    const draft = draftAtAdjustment(0);
    renderWizard(draft.id);
    await screen.findByTestId('datum-table', {}, { timeout: 20_000 });

    expect(screen.getByTestId('nothing-held')).toHaveTextContent(/no datum and no unique solution/);
    expect(screen.getByTestId('nothing-held')).toHaveTextContent(/known coordinate/);
    expect(screen.getByTestId('apply-recommended-datum')).toBeDisabled();
    expect(screen.getByTestId('wizard-next')).toBeDisabled();
  }, 40_000);

  it('holds the network with the known references, and no station, in one click', async () => {
    const user = userEvent.setup();
    const draft = draftAtAdjustment(3);
    renderWizard(draft.id);
    await screen.findByTestId('datum-table', {}, { timeout: 20_000 });

    // The known references arrived weighted from Initialisation: the network is already held.
    await waitFor(() => expect(screen.getByTestId('wizard-next')).toBeEnabled(), { timeout: 15_000 });
    await user.click(screen.getByTestId('apply-recommended-datum'));

    await waitFor(() => {
      const controls = demoStore().getDraft(draft.id)!.initialisation.references;
      expect(controls.length).toBe(3);
      expect(controls.every((control) => control.modeE === 'weak' && control.modeH === 'weak')).toBe(true);
      // A station without a record is a station STAR*NET will solve.
      expect(controls.some((control) => control.pointKey === stationPointId('NTE_ATS34'))).toBe(false);
    }, { timeout: 15_000 });
  }, 60_000);

  it('blocks the wizard again when a single reference is left holding the network', async () => {
    const user = userEvent.setup();
    const draft = draftAtAdjustment(2);
    renderWizard(draft.id);
    await screen.findByTestId('datum-table', {}, { timeout: 20_000 });
    await waitFor(() => expect(screen.getByTestId('wizard-next')).toBeEnabled(), { timeout: 15_000 });

    const released = demoStore().getDraft(draft.id)!.initialisation.references[0].pointKey;
    const row = screen.getByTestId(`datum-row-${released}`);
    for (const component of ['H', 'E', 'N'] as const) {
      await user.click(within(row).getByRole('combobox', { name: `${released} ${component}` }));
      await user.click(screen.getByRole('option', { name: 'Free' }));
    }

    // Freeing the last held component of a point removes its record entirely…
    await waitFor(() => {
      const records = demoStore().getDraft(draft.id)!.initialisation.references;
      expect(records.some((control) => control.pointKey === released)).toBe(false);
    }, { timeout: 15_000 });
    // …and one reference cannot hold a network: a run would publish nothing, so Next closes.
    expect(screen.getByTestId('not-enough-references')).toBeVisible();
    expect(screen.getByTestId('wizard-next')).toBeDisabled();
  }, 90_000);
});

vi.setConfig({ testTimeout: 90_000 });
