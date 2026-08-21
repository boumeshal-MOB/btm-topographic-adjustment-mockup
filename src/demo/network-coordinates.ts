import type { DraftReference, WizardDraft } from '@/demo/draft';

/** Key helper: physical point id used across bindings, controls and initial coordinates. */
export const stationPointId = (stationCode: string) => `station:${stationCode}`;

/**
 * Provenance written when a point is constrained over a coordinate the initialisation *computed*
 * rather than one the survey supplied. It does not change whether the point counts towards the
 * datum minimum — it only lets a screen say where the number came from.
 */
export const DATUM_APPROXIMATION_SOURCE = 'datum';

/**
 * Where a point's coordinate comes from. The whole network has exactly one answer per point, and
 * every screen reads it here.
 *
 * The reason this module exists: the constraint record used to *carry* the numbers. A constraint
 * placed at the Targets step — before the initialisation had ever run — created a record at
 * `0, 0, 0`, and nothing ever corrected it: `control?.eastingM ?? computed?.eastingM` never falls
 * through, because `0` is not nullish. The zero became permanent, reached the `C` line of the
 * STAR*NET input, and produced a network pinned to the origin.
 *
 * So the record no longer owns coordinates: it owns the fixed/weak/free decision and the declared
 * precision. The numbers are resolved, in this order:
 *
 * 1. `manual` — a coordinate a human gave for this point (typed in the datum table, or imported
 *    from `initial.csv`). A human overrides a computation.
 * 2. `declared` — a survey coordinate declared at the Initialisation step: a known reference from
 *    the dataset or from `references.csv`. This is the real georeferenced value.
 * 3. `computed` — what the initialisation resection produced.
 *
 * A point absent from all three has **no** coordinate. That is a real state — the initialisation has
 * not run — and it is shown as such rather than as a zero.
 */
export type CoordinateOrigin = 'manual' | 'declared' | 'computed';

export interface NetworkCoordinate {
  eastingM: number;
  northingM: number;
  heightM: number;
  origin: CoordinateOrigin;
}

/** True when this control record carries a coordinate declared by the survey. */
export function isDeclaredCoordinate(control: Pick<DraftReference, 'source'>): boolean {
  return control.source !== DATUM_APPROXIMATION_SOURCE;
}

/**
 * Every point of the network with the one coordinate it has, keyed by engine name — stations under
 * `station:<code>`, exactly as the constraint records and the STAR*NET input key them.
 */
export function resolveNetworkCoordinates(draft: WizardDraft): Map<string, NetworkCoordinate> {
  const resolved = new Map<string, NetworkCoordinate>();
  const result = draft.initialisation.result;

  // 3. computed, first in so the two better sources overwrite it.
  for (const coordinate of result?.coordinates ?? []) {
    resolved.set(coordinate.pointKey, {
      eastingM: coordinate.eastingM,
      northingM: coordinate.northingM,
      heightM: coordinate.heightM,
      origin: 'computed',
    });
  }
  for (const solution of result?.stationSolutions ?? []) {
    resolved.set(stationPointId(solution.stationCode), {
      eastingM: solution.eastingM,
      northingM: solution.northingM,
      heightM: solution.heightM,
      origin: 'computed',
    });
  }

  // 2. declared by the survey. `?? []` on both lists: a draft persisted by an older build of the
  // mock-up can legitimately be missing one, and a resolution that throws takes the screen with it.
  for (const control of draft.initialisation.references ?? []) {
    if (!isDeclaredCoordinate(control)) continue;
    resolved.set(control.pointKey, {
      eastingM: control.eastingM,
      northingM: control.northingM,
      heightM: control.heightM,
      origin: 'declared',
    });
  }

  // 1. given by hand.
  for (const entered of draft.initialisation.enteredCoordinates ?? []) {
    resolved.set(entered.pointKey, {
      eastingM: entered.eastingM,
      northingM: entered.northingM,
      heightM: entered.heightM,
      origin: 'manual',
    });
  }

  return resolved;
}

/** The coordinate of one point, or `undefined` when the network does not know it yet. */
export function networkCoordinate(draft: WizardDraft, pointKey: string): NetworkCoordinate | undefined {
  return resolveNetworkCoordinates(draft).get(pointKey);
}

/**
 * Restates a coordinate given by hand. Writing the value a point already has removes the override
 * instead of freezing it: an override that repeats the computation would silently stop following it.
 */
export function withManualCoordinate(
  draft: WizardDraft,
  pointKey: string,
  patch: Partial<Pick<NetworkCoordinate, 'eastingM' | 'northingM' | 'heightM'>>,
): WizardDraft['initialisation']['enteredCoordinates'] {
  const current = networkCoordinate(draft, pointKey);
  const next = {
    pointKey,
    eastingM: patch.eastingM ?? current?.eastingM ?? 0,
    northingM: patch.northingM ?? current?.northingM ?? 0,
    heightM: patch.heightM ?? current?.heightM ?? 0,
    source: 'manual' as const,
  };
  const others = (draft.initialisation.enteredCoordinates ?? []).filter((entry) => entry.pointKey !== pointKey);
  return [...others, next];
}
