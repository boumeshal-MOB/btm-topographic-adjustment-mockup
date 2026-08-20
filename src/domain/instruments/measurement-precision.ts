import type { DistanceKind, MeasurementType, StarNetWeights } from '@/domain/entities';

/**
 * One authority for how well a measurement is known, and one chain that says where each number
 * came from.
 *
 * A distance standard error is a property of the **instrument and its reflector** — an EDM does not
 * measure a reflective sheet as well as it measures a circular prism — and an angular standard
 * error is a property of the instrument alone. Neither is a property of the project, so neither
 * belongs in the project-wide `defaultWeights` where they used to live: the wizard seeded every
 * sight from `preset.adjustment.defaultWeights` and the per-family precision the FR template
 * already declared was never read.
 *
 * The chain is short and always visible in the interface:
 *
 * ```
 *   country template  →  instrument of a station  →  this sight
 *   (template)           (instrument)                (sight)
 * ```
 *
 * Each step may restate a value; the last one that did is the value used, and its name is what the
 * interface shows next to it. Nothing is inferred silently.
 */

export const MEASUREMENT_FAMILIES: readonly MeasurementType[] = ['prism', 'reflective-sheet', 'reflectorless'];

/** Where a resolved number was last stated. */
export type PrecisionSource = 'template' | 'instrument' | 'sight';

export interface DistancePrecision {
  /** Constant part of the EDM error, in millimetres. */
  stdErrMm: number;
  /** Proportional part, in parts per million of the distance. */
  ppm: number;
}

/** Everything a station's instrument states about how well it measures. */
export interface InstrumentPrecision {
  /** Horizontal direction standard error, in arc seconds. */
  directionArcSec: number;
  /** Zenith angle standard error, in arc seconds. */
  zenithArcSec: number;
  /** Distance precision per reflector family — an EDM has one figure per family, not one overall. */
  distanceByFamily: Record<MeasurementType, DistancePrecision>;
  /**
   * What the station's stored distance variable holds. STAR*NET reads distances through a single
   * project-level 3D input mode, so a horizontal one is converted at resolve time; the choice
   * describes the data, and the data comes from the station.
   */
  distanceKind: DistanceKind;
}

/** The shape `countryPresetSchema` validates for one instrument template entry. */
export interface InstrumentTemplateSeed {
  id: string;
  manufacturer: string;
  model: string;
  angleAccuracyArcSec?: number;
  measurementFamilies?: Partial<Record<MeasurementType, { distanceStdErrMm: number; distancePpm: number }>>;
}

/**
 * The precision a country template states for one instrument.
 *
 * A template need not state everything: UK's supplied project declares its instrument by name only,
 * and its numbers live in the project weights it was delivered with. The preset weights are
 * therefore the floor of the chain, never a competing authority — they fill a gap, they do not
 * override a template that spoke.
 *
 * `angleAccuracyArcSec` is a manufacturer figure for a *single pointing*. It is used for both the
 * direction and the zenith when the template gives nothing more precise, because that is what the
 * datasheet actually states; a survey that knows better restates it on the station.
 */
export function instrumentPrecisionFromTemplate(
  template: InstrumentTemplateSeed | undefined,
  presetWeights: StarNetWeights | null | undefined,
  fallbackWeights: StarNetWeights,
  distanceKind: DistanceKind = 'slope',
): InstrumentPrecision {
  const weights = presetWeights ?? fallbackWeights;
  const templateDistanceMm = weights.distanceStdErrM * 1000;
  const family = (type: MeasurementType): DistancePrecision => {
    const declared = template?.measurementFamilies?.[type];
    return declared
      ? { stdErrMm: declared.distanceStdErrMm, ppm: declared.distancePpm }
      : { stdErrMm: templateDistanceMm, ppm: weights.distancePpm };
  };
  return {
    directionArcSec: template?.angleAccuracyArcSec ?? weights.directionArcSec,
    zenithArcSec: template?.angleAccuracyArcSec ?? weights.zenithArcSec,
    distanceByFamily: {
      prism: family('prism'),
      'reflective-sheet': family('reflective-sheet'),
      reflectorless: family('reflectorless'),
    },
    distanceKind,
  };
}

/** A value together with the step of the chain that last stated it. */
export interface Sourced<T> {
  value: T;
  source: PrecisionSource;
}

/** What a sight may restate for itself. Absent = the station's instrument answers. */
export interface SightPrecisionOverride {
  measurementType: MeasurementType;
  distanceStdErrMm?: number;
  distancePpm?: number;
  directionStdErrArcSec?: number;
  zenithStdErrArcSec?: number;
  distanceKind?: DistanceKind;
}

export interface ResolvedSightPrecision {
  distanceStdErrMm: Sourced<number>;
  distancePpm: Sourced<number>;
  directionArcSec: Sourced<number>;
  zenithArcSec: Sourced<number>;
  distanceKind: Sourced<DistanceKind>;
}

/**
 * The numbers this sight will be weighted with, and where each one comes from.
 *
 * `instrumentIsTemplateDefault` says whether the station still carries the template's values
 * untouched. It is the difference between "2.5″ because the datasheet says so" and "2.5″ because
 * the surveyor typed it", and the interface shows that difference rather than a bare number.
 */
export function resolveSightPrecision(
  instrument: InstrumentPrecision,
  sight: SightPrecisionOverride,
  instrumentIsTemplateDefault = true,
): ResolvedSightPrecision {
  const stationSource: PrecisionSource = instrumentIsTemplateDefault ? 'template' : 'instrument';
  const family = instrument.distanceByFamily[sight.measurementType];
  const pick = <T>(override: T | undefined, stationValue: T): Sourced<T> =>
    override === undefined ? { value: stationValue, source: stationSource } : { value: override, source: 'sight' };
  return {
    distanceStdErrMm: pick(sight.distanceStdErrMm, family.stdErrMm),
    distancePpm: pick(sight.distancePpm, family.ppm),
    directionArcSec: pick(sight.directionStdErrArcSec, instrument.directionArcSec),
    zenithArcSec: pick(sight.zenithStdErrArcSec, instrument.zenithArcSec),
    distanceKind: pick(sight.distanceKind, instrument.distanceKind),
  };
}

/** True when a sight restates anything at all — what the interface counts as "overrides". */
export function sightOverridesPrecision(sight: SightPrecisionOverride): boolean {
  return sight.distanceStdErrMm !== undefined
    || sight.distancePpm !== undefined
    || sight.directionStdErrArcSec !== undefined
    || sight.zenithStdErrArcSec !== undefined
    || sight.distanceKind !== undefined;
}

/** Two instrument precisions are equal when every number and the distance kind match. */
export function samePrecision(left: InstrumentPrecision, right: InstrumentPrecision): boolean {
  if (left.directionArcSec !== right.directionArcSec) return false;
  if (left.zenithArcSec !== right.zenithArcSec) return false;
  if (left.distanceKind !== right.distanceKind) return false;
  return MEASUREMENT_FAMILIES.every((type) =>
    left.distanceByFamily[type].stdErrMm === right.distanceByFamily[type].stdErrMm
    && left.distanceByFamily[type].ppm === right.distanceByFamily[type].ppm);
}
