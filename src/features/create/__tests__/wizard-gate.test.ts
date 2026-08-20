import { describe, expect, it } from 'vitest';
import { createFreshStore } from '@/demo/store';
import { stationPointId } from '@/demo/resolve-run';
import type { DraftReference, WizardDraft } from '@/demo/draft';
import {
  ADJUSTMENT_STEP,
  INITIALISATION_STEP,
  wizardStepGate,
} from '@/features/create/wizard-gate';
import { DATUM_SOURCE } from '@/features/create/datum-view-model';

/**
 * What must be true before the wizard moves on.
 *
 * Initialisation exists to *compute* approximate coordinates, so its `Next` waits for those
 * coordinates to be accepted. The adjustment itself needs something else entirely: real references,
 * fixed or weighted, and at least two of them. A coordinate computed at initialisation is a starting
 * point — treating it as a reference would let the network hold itself.
 */
function preparedDraft(): WizardDraft {
  const store = createFreshStore(false);
  const draft = store.createDraft('uk-supplied-hs2-nte', 'single-station');
  store.applyStationSelection(draft, ['NTE_ATS34']);
  draft.initialisation.result = store.computeDraftInitialisation(draft);
  draft.initialisation.result.accepted = true;
  return draft;
}

function control(pointKey: string, source: string): DraftReference {
  return {
    pointKey,
    eastingM: 1000,
    northingM: 2000,
    heightM: 100,
    modeE: 'weak',
    modeN: 'weak',
    modeH: 'weak',
    sigmaM: 0.0015,
    source,
  };
}

function referenceNames(draft: WizardDraft, count: number): string[] {
  return draft.targets
    .filter((target) => target.role === 'reference')
    .map((target) => target.engineName)
    .slice(0, count);
}

describe('wizard gates', () => {
  it('holds Initialisation until the approximate coordinates are accepted', () => {
    const draft = preparedDraft();
    draft.initialisation.result!.accepted = false;
    expect(wizardStepGate(draft, INITIALISATION_STEP)).toEqual({
      blocked: true,
      reason: 'initialisation-not-accepted',
    });

    draft.initialisation.result!.accepted = true;
    expect(wizardStepGate(draft, INITIALISATION_STEP).blocked).toBe(false);
  });

  it('opens the adjustment once two known references hold the network', () => {
    const draft = preparedDraft();
    const [first, second] = referenceNames(draft, 2);
    draft.initialisation.references = [control(first, 'ATS34 workbook header')];
    expect(wizardStepGate(draft, ADJUSTMENT_STEP)).toEqual({
      blocked: true,
      reason: 'not-enough-references',
    });

    draft.initialisation.references.push(control(second, 'ATS34 workbook header'));
    expect(wizardStepGate(draft, ADJUSTMENT_STEP).blocked).toBe(false);
  });

  it('counts a constrained point whose coordinate was computed at initialisation', () => {
    /**
     * This assertion is the reverse of what it once was, and the reversal is a product decision, not
     * a bug fix. The rule used to demand two references carrying a coordinate from the survey, on the
     * grounds that constraining a computed approximation pins the network to its own starting point.
     * True — but it refused an ordinary local-datum survey: fix a station to compute approximate
     * coordinates, free it again, constrain two targets. That network has a datum and a unique
     * solution, and refusing to publish it was the defect.
     *
     * What the threshold protects is solvability, so provenance no longer enters the test; the screen
     * states that the frame is local instead of blocking on it.
     */
    const draft = preparedDraft();
    draft.initialisation.references = referenceNames(draft, 2)
      .map((name) => control(name, DATUM_SOURCE));
    expect(wizardStepGate(draft, ADJUSTMENT_STEP)).toEqual({ blocked: false });
  });

  it('still blocks on a single constrained point, whatever its provenance', () => {
    // One point leaves the normal matrix rank deficient: the computation genuinely cannot pass.
    const draft = preparedDraft();
    draft.initialisation.references = referenceNames(draft, 1)
      .map((name) => control(name, DATUM_SOURCE));
    expect(wizardStepGate(draft, ADJUSTMENT_STEP)).toEqual({
      blocked: true,
      reason: 'not-enough-references',
    });
  });

  it('never counts a constrained station towards the minimum', () => {
    const draft = preparedDraft();
    draft.initialisation.references = [
      control(stationPointId('NTE_ATS34'), 'ATS34 workbook header'),
      control(referenceNames(draft, 1)[0], 'ATS34 workbook header'),
    ];
    expect(wizardStepGate(draft, ADJUSTMENT_STEP)).toEqual({
      blocked: true,
      reason: 'not-enough-references',
    });
  });

  it('reports "no datum" when every record is free, and nothing at all when there is none', () => {
    const draft = preparedDraft();
    expect(wizardStepGate(draft, ADJUSTMENT_STEP)).toEqual({ blocked: true, reason: 'no-datum' });

    const [name] = referenceNames(draft, 1);
    draft.initialisation.references = [
      { ...control(name, 'ATS34 workbook header'), modeE: 'free', modeN: 'free', modeH: 'free' },
    ];
    expect(wizardStepGate(draft, ADJUSTMENT_STEP)).toEqual({ blocked: true, reason: 'no-datum' });
  });

  it('leaves every other step freely navigable', () => {
    const draft = preparedDraft();
    for (const step of [0, 1, 2, 3, 6, 7, 8]) {
      expect(wizardStepGate(draft, step)).toEqual({ blocked: false });
    }
  });
});
