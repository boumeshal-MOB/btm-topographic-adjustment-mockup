/**
 * Pure Face I/Face II reduction for a total-station observation.
 *
 * Source angles may be gon or decimal degrees. DMS is a presentation/serialisation format: a DMS
 * parser must first turn it into decimal degrees, then call this function with `DEGREES`.
 * Successful output is always canonical decimal degrees because the domain `RawObservation`
 * contract and every geometric function use degrees internally.
 */

export type SourceAngleUnit = 'GON' | 'DEGREES';

export interface DoubleFaceInput {
  hzFace1: number;
  vzFace1: number;
  sdFace1M: number;
  hzFace2: number;
  vzFace2: number;
  sdFace2M: number;
}

export interface DoubleFaceDiagnostics {
  /** F2 direction, rotated onto F1, minus F1; expressed in the source angular unit. */
  horizontalClosure: number;
  /** Classical vertical-circle index diagnostic: (Vz1 + Vz2 - fullCircle) / 2. */
  verticalIndexError: number;
  /** Face I minus Face II slope distance, in metres. */
  slopeDistanceDifferenceM: number;
}

export interface ReducedDoubleFaceObservation {
  hzDeg: number;
  vzDeg: number;
  sdM: number;
}

export type DoubleFaceComponent = keyof DoubleFaceInput;

export type DoubleFaceReduction =
  | {
      ok: true;
      observation: ReducedDoubleFaceObservation;
      diagnostics: DoubleFaceDiagnostics;
    }
  | {
      ok: false;
      reason: 'missing-or-non-finite' | 'angle-out-of-range' | 'distance-not-positive';
      invalidComponents: DoubleFaceComponent[];
    };

const COMPONENTS: DoubleFaceComponent[] = [
  'hzFace1',
  'vzFace1',
  'sdFace1M',
  'hzFace2',
  'vzFace2',
  'sdFace2M',
];

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

/** Smallest signed rotation from `from` to `to`, in ]-halfCircle, +halfCircle]. */
function signedAngularDifference(to: number, from: number, fullCircle: number): number {
  const halfCircle = fullCircle / 2;
  const difference = positiveModulo(to - from + halfCircle, fullCircle) - halfCircle;
  return difference === -halfCircle ? halfCircle : difference;
}

function toDegrees(value: number, fullCircle: number): number {
  return value * (360 / fullCircle);
}

/**
 * Reduces one complete double-face observation.
 *
 * Rules:
 * - the six source values are atomic: if one is absent/non-finite, no reduced observation exists;
 * - horizontal F2 is brought onto F1 by subtracting a half-circle, then circularly averaged;
 * - vertical F2 is brought onto F1 by `fullCircle - Vz2`, then arithmetically averaged;
 * - slope distances are arithmetically averaged;
 * - closure values are diagnostics, not import filters. A project QC policy may assess them later.
 */
export function reduceDoubleFace(input: DoubleFaceInput, unit: SourceAngleUnit): DoubleFaceReduction {
  const nonFinite = COMPONENTS.filter((component) => !Number.isFinite(input[component]));
  if (nonFinite.length > 0) {
    return { ok: false, reason: 'missing-or-non-finite', invalidComponents: nonFinite };
  }

  const fullCircle = unit === 'GON' ? 400 : 360;
  const halfCircle = fullCircle / 2;
  const invalidAngles: DoubleFaceComponent[] = [];
  if (input.hzFace1 < 0 || input.hzFace1 > fullCircle) invalidAngles.push('hzFace1');
  if (input.hzFace2 < 0 || input.hzFace2 > fullCircle) invalidAngles.push('hzFace2');
  if (input.vzFace1 < 0 || input.vzFace1 > halfCircle) invalidAngles.push('vzFace1');
  if (input.vzFace2 < halfCircle || input.vzFace2 > fullCircle) invalidAngles.push('vzFace2');
  if (invalidAngles.length > 0) {
    return { ok: false, reason: 'angle-out-of-range', invalidComponents: invalidAngles };
  }

  const invalidDistances: DoubleFaceComponent[] = [];
  if (input.sdFace1M <= 0) invalidDistances.push('sdFace1M');
  if (input.sdFace2M <= 0) invalidDistances.push('sdFace2M');
  if (invalidDistances.length > 0) {
    return { ok: false, reason: 'distance-not-positive', invalidComponents: invalidDistances };
  }

  const hzFace1 = positiveModulo(input.hzFace1, fullCircle);
  const hzFace2OnFace1 = positiveModulo(input.hzFace2 - halfCircle, fullCircle);
  const horizontalClosure = signedAngularDifference(hzFace2OnFace1, hzFace1, fullCircle);
  const reducedHz = positiveModulo(hzFace1 + horizontalClosure / 2, fullCircle);
  const vzFace2OnFace1 = fullCircle - input.vzFace2;
  const reducedVz = (input.vzFace1 + vzFace2OnFace1) / 2;

  return {
    ok: true,
    observation: {
      hzDeg: toDegrees(reducedHz, fullCircle),
      vzDeg: toDegrees(reducedVz, fullCircle),
      sdM: (input.sdFace1M + input.sdFace2M) / 2,
    },
    diagnostics: {
      horizontalClosure,
      verticalIndexError: (input.vzFace1 + input.vzFace2 - fullCircle) / 2,
      slopeDistanceDifferenceM: input.sdFace1M - input.sdFace2M,
    },
  };
}
