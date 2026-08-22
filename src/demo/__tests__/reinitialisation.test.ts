import { beforeEach, describe, expect, it } from 'vitest';
import { clearDatabase } from '@/demo/persistence';
import { createFreshStore, type DemoStore } from '@/demo/store';
import { resolveNetworkCoordinates } from '@/demo/network-coordinates';
import { buildVersionFromDraft } from '@/demo/resolve-run';
import { constraintFrameShifts, DEFAULT_SIGMA_M } from '@/features/create/datum-view-model';
import type { WizardDraft } from '@/demo/draft';

/**
 * Changing the anchor orientation and recomputing the initialisation.
 *
 * The bug: constraining a target at the Targets step writes a control record stamped
 * `source: 'datum'` carrying a *copy* of the coordinate it was placed over. That record was then fed
 * back into `computeDraftInitialisation` as a known reference, and `computeInitialCoordinates` skips
 * known references — "references are already known". So the second run produced no coordinate at all
 * for exactly the points the user had constrained: the datum table showed `—`, and the station
 * orientation was resected from the stale numbers of the previous frame.
 *
 * Freeing the constraints by hand was never the answer. A datum decision must not become an input to
 * the approximation it constrains.
 */
function localAnchorDraft(store: DemoStore, orientationDeg: number): WizardDraft {
  const draft = store.createDraft('uk-supplied-hs2-nte', 'single-station');
  store.applyStationSelection(draft, ['NTE_ATS34']);
  draft.initialisation.mode = 'local-anchor';
  draft.initialisation.anchorStationCode = 'NTE_ATS34';
  draft.initialisation.anchorEastingM = 0;
  draft.initialisation.anchorNorthingM = 0;
  draft.initialisation.anchorHeightM = 0;
  draft.initialisation.anchorOrientationDeg = orientationDeg;
  draft.initialisation.result = store.computeDraftInitialisation(draft);
  draft.initialisation.result.accepted = true;
  return draft;
}

/** Constrains two targets the way the Targets step does: a datum-sourced record, no known survey. */
function constrainTwoTargets(draft: WizardDraft): string[] {
  const coordinates = resolveNetworkCoordinates(draft);
  const keys = draft.targets
    .map((target) => target.engineName)
    .filter((key) => coordinates.has(key))
    .slice(0, 2);
  draft.initialisation.references = keys.map((pointKey) => {
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
  return keys;
}

describe('recomputing the initialisation after changing the orientation', () => {
  let store: DemoStore;

  beforeEach(() => {
    clearDatabase();
    store = createFreshStore(false);
  });

  it('still produces a coordinate for the points that are constrained', () => {
    const draft = localAnchorDraft(store, 0);
    const constrained = constrainTwoTargets(draft);
    expect(constrained.length).toBe(2);

    // The user changes the orientation and recomputes, without touching the constraints.
    draft.initialisation.anchorOrientationDeg = 90;
    draft.initialisation.result = store.computeDraftInitialisation(draft);

    const after = resolveNetworkCoordinates(draft);
    for (const key of constrained) {
      const at = after.get(key);
      expect(at, `${key} must still have a coordinate after re-initialising`).toBeDefined();
      expect(at?.origin).toBe('computed');
    }
  });

  it('rotates the constrained points with the network instead of leaving them behind', () => {
    const draft = localAnchorDraft(store, 0);
    const constrained = constrainTwoTargets(draft);
    const before = resolveNetworkCoordinates(draft);

    draft.initialisation.anchorOrientationDeg = 90;
    draft.initialisation.result = store.computeDraftInitialisation(draft);
    const after = resolveNetworkCoordinates(draft);

    // A 90° change of orientation cannot leave a radiated point where it was.
    const moved = constrained.filter((key) => {
      const a = before.get(key)!;
      const b = after.get(key)!;
      return Math.hypot(b.eastingM - a.eastingM, b.northingM - a.northingM) > 1;
    });
    expect(moved.length).toBe(constrained.length);
  });

  it('says so, once the constraints no longer sit where they were placed', () => {
    const draft = localAnchorDraft(store, 0);
    constrainTwoTargets(draft);
    expect(constraintFrameShifts(draft)).toEqual([]);

    draft.initialisation.anchorOrientationDeg = 90;
    draft.initialisation.result = store.computeDraftInitialisation(draft);

    const shifts = constraintFrameShifts(draft);
    expect(shifts.length).toBeGreaterThan(0);
    expect(shifts[0].gapM).toBeGreaterThan(0.05);
  });

  /**
   * The dangerous half of the bug: the screen said "unknown" while the run used the coordinate of
   * the previous orientation, because the version fell back to the record's own cache.
   */
  it('never carries a coordinate the network cannot resolve', () => {
    const draft = localAnchorDraft(store, 0);
    constrainTwoTargets(draft);
    // A constraint on a point the initialisation knows nothing about: a stale record.
    draft.initialisation.references = [
      ...draft.initialisation.references,
      {
        pointKey: 'GHOST_POINT',
        eastingM: 123456,
        northingM: 654321,
        heightM: 42,
        modeE: 'fixed',
        modeN: 'fixed',
        modeH: 'fixed',
        sigmaM: DEFAULT_SIGMA_M,
        source: 'datum',
      },
    ];

    const version = buildVersionFromDraft({
      draft,
      processingId: 1,
      versionNumber: 1,
      versionId: 'v1',
      createdBy: 1,
      createdAt: '2025-06-02T10:00:00.000Z',
      reason: 'test',
      catalogue: store.catalogue,
    });
    const keys = version.initialisation.references.map((reference) => reference.physicalPointId);
    expect(keys).not.toContain('GHOST_POINT');
    // …and the constraints the network *can* place are still there.
    expect(keys.length).toBe(2);
  });
});
