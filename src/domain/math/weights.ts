import { ARCSEC2RAD } from '@/domain/math/geometry';

export type EdmStdErrorModel = 'additive' | 'propagated';

export interface TotalStationWeightInput {
  slopeDistanceM: number;
  zenithRad: number;
  directionArcSec: number;
  zenithArcSec: number;
  distanceMm: number;
  distancePpm: number;
  instrumentCenteringM: number;
  targetCenteringM: number;
  verticalCenteringM: number;
  edmStdErrorModel?: EdmStdErrorModel;
}

export interface EffectiveTotalStationSigmas {
  hzRad: number;
  hzArcSec: number;
  vzRad: number;
  vzArcSec: number;
  sdM: number;
  distanceMeasurementM: number;
}

function requireFinite(value: number, field: string): number {
  if (!Number.isFinite(value)) throw new Error(`${field} must be finite`);
  return value;
}

/**
 * Combines the constant and proportional EDM terms using STAR*NET's selected model.
 * STAR*NET defaults to ADDITIVE; PROPAGATED is available through `.EDM PROPAGATE`.
 */
export function distanceMeasurementSigmaM(
  slopeDistanceM: number,
  distanceMm: number,
  distancePpm: number,
  model: EdmStdErrorModel = 'additive',
): number {
  requireFinite(slopeDistanceM, 'slopeDistanceM');
  requireFinite(distanceMm, 'distanceMm');
  requireFinite(distancePpm, 'distancePpm');
  if (slopeDistanceM <= 0) throw new Error('slopeDistanceM must be greater than zero');
  if (distanceMm < 0 || distancePpm < 0) throw new Error('EDM error terms must be non-negative');
  if (model !== 'additive' && model !== 'propagated') throw new Error('EDM model must be additive or propagated');
  const constantM = distanceMm / 1000;
  const proportionalM = slopeDistanceM * distancePpm * 1e-6;
  return model === 'propagated'
    ? Math.hypot(constantM, proportionalM)
    : constantM + proportionalM;
}

/**
 * STAR*NET-compatible effective standard errors for one slope-distance/zenith sight.
 * The returned values already include instrument, target and vertical centering and can
 * therefore be emitted as explicit `DM` standard errors without `.ADDCENTERING ON`.
 */
export function effectiveTotalStationSigmas(input: TotalStationWeightInput): EffectiveTotalStationSigmas {
  const numeric = Object.entries(input).filter(([key]) => key !== 'edmStdErrorModel') as Array<[string, number]>;
  for (const [field, value] of numeric) requireFinite(value, field);
  if (input.slopeDistanceM <= 0) throw new Error('slopeDistanceM must be greater than zero');
  for (const [field, value] of numeric) {
    if (field !== 'zenithRad' && field !== 'slopeDistanceM' && value < 0) {
      throw new Error(`${field} must be non-negative`);
    }
  }

  const slope = input.slopeDistanceM;
  const horizontal = Math.max(1e-9, Math.abs(slope * Math.sin(input.zenithRad)));
  const vertical = slope * Math.cos(input.zenithRad);
  const centering2 = input.instrumentCenteringM ** 2 + input.targetCenteringM ** 2;
  const hzRad = Math.sqrt((input.directionArcSec * ARCSEC2RAD) ** 2 + centering2 / horizontal ** 2);
  const distanceMeasurementM = distanceMeasurementSigmaM(
    slope,
    input.distanceMm,
    input.distancePpm,
    input.edmStdErrorModel,
  );
  const sdM = Math.sqrt(
    distanceMeasurementM ** 2
    + (horizontal / slope) ** 2 * centering2
    + 2 * (vertical / slope) ** 2 * input.verticalCenteringM ** 2,
  );
  const vzRad = Math.sqrt(
    (input.zenithArcSec * ARCSEC2RAD) ** 2
    + (vertical / slope) ** 2 * centering2 / slope ** 2
    + 2 * (horizontal / slope) ** 2 * input.verticalCenteringM ** 2 / slope ** 2,
  );
  if (!(hzRad > 0) || !(vzRad > 0) || !(sdM > 0)) {
    throw new Error('Each effective observation sigma must be greater than zero');
  }

  return {
    hzRad,
    hzArcSec: hzRad / ARCSEC2RAD,
    vzRad,
    vzArcSec: vzRad / ARCSEC2RAD,
    sdM,
    distanceMeasurementM,
  };
}
