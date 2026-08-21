import type { DraftReference, WizardDraft } from '@/demo/draft';
import {
  resolveNetworkCoordinates,
  type CoordinateOrigin,
  type NetworkCoordinate,
} from '@/demo/network-coordinates';
import { DATUM_APPROXIMATION_SOURCE, MINIMUM_HELD_REFERENCES, stationPointId } from '@/demo/resolve-run';
import type { ConstraintMode, TargetRole } from '@/domain/entities';

export { MINIMUM_HELD_REFERENCES };

/**
 * The rows of the datum table: every point of the network, with the coordinates the initialisation
 * produced, so a control record can be created without retyping a number the software already knows.
 */
export type Component = 'E' | 'N' | 'H';

export interface DatumRow {
  pointKey: string;
  label: string;
  role: TargetRole | 'station';
  /**
   * `null` when the network has no coordinate for this point yet — the initialisation has not run.
   * It is deliberately not `0`: a zero is a coordinate, and one that reached the STAR*NET `C` line
   * and pinned a whole network to the origin (see `network-coordinates.ts`).
   */
  eastingM: number | null;
  northingM: number | null;
  heightM: number | null;
  /** Which of the three sources answered, or `undefined` when none did. */
  origin?: CoordinateOrigin;
  /** True when the coordinate was declared by the survey rather than computed or typed. */
  known: boolean;
  control?: DraftReference;
}

/** A point and the coordinate it currently has — what a constraint record is written from. */
export interface ConstrainablePoint {
  pointKey: string;
  eastingM: number | null;
  northingM: number | null;
  heightM: number | null;
}

/** True when the network knows where this point is, and can therefore control it. */
export function hasCoordinate(point: Pick<ConstrainablePoint, 'eastingM' | 'northingM' | 'heightM'>): boolean {
  return point.eastingM !== null && point.northingM !== null && point.heightM !== null;
}

/** A control record written by the datum table itself, as opposed to a known survey coordinate. */
export const DATUM_SOURCE = DATUM_APPROXIMATION_SOURCE;

/**
 * The points that give the network its datum: **any sighted target that is constrained or fixed**.
 *
 * Two such points are what a least-squares adjustment needs to have a unique solution. Below that,
 * an infinity of translated and rotated solutions fits the measurements equally well, the normal
 * matrix is rank deficient, and the computation genuinely does not pass — which is why the interface
 * treats it as an error and not as a warning.
 *
 * Neither the *role* of the target nor the *provenance* of its coordinate is part of the test, and
 * that is a deliberate reversal. The rule used to demand two references carrying a coordinate from
 * the survey, on the grounds that constraining a computed approximation pins the network to its own
 * starting point. True — but it also refused a perfectly ordinary local-datum survey: fix a station
 * to compute approximate coordinates, free it again, then constrain two targets. That workflow has a
 * datum and a unique solution; whether its coordinates are absolute is a different question from
 * whether the adjustment can be computed and published.
 *
 * A station is still never counted: it carries the instrument, and a station holding itself controls
 * nothing.
 */
export function heldReferenceKeys(draft: WizardDraft): string[] {
  const targetNames = new Set(draft.targets.map((target) => target.engineName));
  return draft.initialisation.references
    .filter((control) => targetNames.has(control.pointKey)
      && [control.modeE, control.modeN, control.modeH].some((mode) => mode !== 'free'))
    .map((control) => control.pointKey);
}

export const MODE_FIELD = { E: 'modeE', N: 'modeN', H: 'modeH' } as const;
export const SIGMA_FIELD = { E: 'sigmaEM', N: 'sigmaNM', H: 'sigmaHM' } as const;
export const DEFAULT_SIGMA_M = 0.0015;

/**
 * Every point of the network with the coordinates the initialisation produced, so a control row can
 * be created without asking the user to retype a number the software already knows.
 */
export function buildDatumRows(draft: WizardDraft): DatumRow[] {
  const controls = new Map(draft.initialisation.references.map((control) => [control.pointKey, control]));
  const coordinates = resolveNetworkCoordinates(draft);
  const at = (pointKey: string): Pick<DatumRow, 'eastingM' | 'northingM' | 'heightM' | 'origin'> => {
    const coordinate: NetworkCoordinate | undefined = coordinates.get(pointKey);
    return {
      eastingM: coordinate?.eastingM ?? null,
      northingM: coordinate?.northingM ?? null,
      heightM: coordinate?.heightM ?? null,
      origin: coordinate?.origin,
    };
  };

  const stations: DatumRow[] = draft.stationCodes.map((stationCode) => {
    const key = stationPointId(stationCode);
    return {
      pointKey: key,
      label: stationCode,
      role: 'station',
      ...at(key),
      known: false,
      control: controls.get(key),
    };
  });

  const roleOrder: Array<TargetRole> = ['reference', 'monitoring', 'auxiliary'];
  const seen = new Set<string>();
  const points: DatumRow[] = draft.targets
    .filter((target) => draft.stationCodes.includes(target.stationCode))
    .filter((target) => {
      if (seen.has(target.engineName)) return false;
      seen.add(target.engineName);
      return true;
    })
    .map((target) => {
      const resolved = at(target.engineName);
      return {
        pointKey: target.engineName,
        label: target.engineName,
        role: target.role,
        ...resolved,
        known: resolved.origin === 'declared',
        control: controls.get(target.engineName),
      };
    })
    .sort((a, b) => roleOrder.indexOf(a.role as TargetRole) - roleOrder.indexOf(b.role as TargetRole)
      || a.label.localeCompare(b.label, undefined, { numeric: true }));

  return [...stations, ...points];
}

/**
 * Stations free, reference points constrained, everything else free — the datum of a monitoring
 * network, in one gesture.
 *
 * A station is never constrained here: it carries the instrument, not the reference. Whether a
 * reference's coordinate comes from the survey or from the initialisation no longer decides whether
 * it may be constrained — a local-datum survey has nothing else to offer, and refusing it left the
 * button doing nothing at all.
 */
export function recommendedDatum(rows: readonly DatumRow[]): DraftReference[] {
  return rows
    // A point whose coordinate the network does not know cannot control anything: constraining it
    // would write the `C` line the initialisation was supposed to produce.
    .filter((row) => row.role === 'reference' && hasCoordinate(row))
    .map((row) => ({
      pointKey: row.pointKey,
      eastingM: row.eastingM ?? 0,
      northingM: row.northingM ?? 0,
      heightM: row.heightM ?? 0,
      modeE: 'weak' as const,
      modeN: 'weak' as const,
      modeH: 'weak' as const,
      sigmaM: row.control?.sigmaM ?? DEFAULT_SIGMA_M,
      sigmaEM: row.control?.sigmaEM,
      sigmaNM: row.control?.sigmaNM,
      sigmaHM: row.control?.sigmaHM,
      source: row.control?.source ?? 'datum',
    }));
}


/**
 * Setting one component's constraint, as a pure function, because two screens now do it: the
 * reference block of the Targets step and the datum table of the Adjustment step. They write the
 * same records, so they cannot be allowed to write them differently.
 *
 * Freeing the last held component removes the row: a free point keeps no coordinate record, exactly
 * like a `C` line that is simply absent.
 */
export function withConstraintMode(
  controls: readonly DraftReference[],
  point: ConstrainablePoint,
  component: Component,
  mode: ConstraintMode,
): DraftReference[] {
  const existing = controls.find((control) => control.pointKey === point.pointKey);
  // The numbers stamped here are a cache of what `resolveNetworkCoordinates` says today; the run
  // resolution restates them, so a record can never carry a coordinate the network disagrees with.
  const updated: DraftReference = existing
    ? { ...existing, [MODE_FIELD[component]]: mode }
    : {
        pointKey: point.pointKey,
        eastingM: point.eastingM ?? 0,
        northingM: point.northingM ?? 0,
        heightM: point.heightM ?? 0,
        modeE: 'free',
        modeN: 'free',
        modeH: 'free',
        sigmaM: DEFAULT_SIGMA_M,
        source: DATUM_SOURCE,
        [MODE_FIELD[component]]: mode,
      };
  const stillControlled = [updated.modeE, updated.modeN, updated.modeH].some((value) => value !== 'free');
  const others = controls.filter((control) => control.pointKey !== point.pointKey);
  return stillControlled ? [...others, updated] : others;
}

/** Restating one component's declared precision, in millimetres. A free point has none to restate. */
export function withConstraintSigma(
  controls: readonly DraftReference[],
  pointKey: string,
  component: Component,
  sigmaMm: number,
): DraftReference[] {
  return controls.map((control) => control.pointKey === pointKey
    ? { ...control, [SIGMA_FIELD[component]]: sigmaMm / 1000 }
    : control);
}

/** The mode and declared precision of one component, with the record's single sigma as fallback. */
export function componentConstraint(
  control: DraftReference | undefined,
  component: Component,
): { mode: ConstraintMode; sigmaMm: number } {
  return {
    mode: control?.[MODE_FIELD[component]] ?? 'free',
    sigmaMm: (control?.[SIGMA_FIELD[component]] ?? control?.sigmaM ?? DEFAULT_SIGMA_M) * 1000,
  };
}

export const COMPONENTS: readonly Component[] = ['E', 'N', 'H'];

/** True when at least one component of this record is held. */
export function isHeld(control: DraftReference | undefined): boolean {
  if (!control) return false;
  return [control.modeE, control.modeN, control.modeH].some((mode) => mode !== 'free');
}
