import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import { queryClient } from '@/app/query-client';
import { demoStore } from '@/demo/store';
import { resolveNetworkCoordinates } from '@/demo/network-coordinates';
import { DEFAULT_SIGMA_M } from '@/features/create/datum-view-model';
import WizardPage from '@/features/create/WizardPage';
import type { WizardDraft } from '@/demo/draft';

/**
 * The Adjustment step must *say* that the frame moved, not merely be able to compute it.
 *
 * `constraintFrameShifts` is unit-tested next to the resolver; what this file pins is the last
 * metre — that the screen renders the sentence. The scenario is the one the user reported: compute
 * the initialisation, constrain two targets over those approximations, then change the anchor
 * orientation and recompute. The constraints now hold the network somewhere other than what was on
 * screen when the decision was taken, and the surveyor has to be told.
 */
function constrainTwoTargets(draft: WizardDraft): void {
  const coordinates = resolveNetworkCoordinates(draft);
  draft.initialisation.references = draft.targets
    .map((target) => target.engineName)
    .filter((key) => coordinates.has(key))
    .slice(0, 2)
    .map((pointKey) => {
      const at = coordinates.get(pointKey)!;
      return {
        pointKey,
        eastingM: at.eastingM,
        northingM: at.northingM,
        heightM: at.heightM,
        modeE: 'weak' as const,
        modeN: 'weak' as const,
        modeH: 'weak' as const,
        sigmaM: DEFAULT_SIGMA_M,
        source: 'datum',
      };
    });
}

function draftOnAdjustment(orientationChange: boolean): WizardDraft {
  const store = demoStore();
  const draft = store.createDraft('uk-supplied-hs2-nte', 'single-station');
  store.applyStationSelection(draft, ['NTE_ATS34']);
  draft.initialisation.mode = 'local-anchor';
  draft.initialisation.anchorStationCode = 'NTE_ATS34';
  draft.initialisation.anchorEastingM = 0;
  draft.initialisation.anchorNorthingM = 0;
  draft.initialisation.anchorHeightM = 0;
  draft.initialisation.anchorOrientationDeg = 0;
  draft.initialisation.result = store.computeDraftInitialisation(draft);
  draft.initialisation.result.accepted = true;

  constrainTwoTargets(draft);

  if (orientationChange) {
    draft.initialisation.anchorOrientationDeg = 90;
    draft.initialisation.result = store.computeDraftInitialisation(draft);
    draft.initialisation.result.accepted = true;
  }

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

describe('Adjustment step: the frame moved under the constraints', () => {
  beforeEach(() => {
    queryClient.clear();
    demoStore().reset();
  });

  it('says nothing while the constraints still sit where they were placed', async () => {
    const draft = draftOnAdjustment(false);
    renderWizard(draft.id);
    await screen.findByTestId('edit-datum-in-targets', {}, { timeout: 20_000 });
    expect(screen.queryByTestId('datum-frame-shift')).not.toBeInTheDocument();
  }, 40_000);

  it('states the gap once the orientation has been changed and recomputed', async () => {
    const draft = draftOnAdjustment(true);
    renderWizard(draft.id);
    await screen.findByTestId('edit-datum-in-targets', {}, { timeout: 20_000 });

    const alert = await screen.findByTestId('datum-frame-shift', {}, { timeout: 20_000 });
    // Names the points and quantifies the move: a warning with no number is not actionable.
    expect(alert.textContent).toMatch(/\d+\.\d{3} m/);
  }, 40_000);
});
