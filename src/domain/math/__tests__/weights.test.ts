import { describe, expect, it } from 'vitest';
import { ARCSEC2RAD } from '@/domain/math/geometry';
import { distanceMeasurementSigmaM, effectiveTotalStationSigmas } from '@/domain/math/weights';

describe('STAR*NET-compatible total-station weights', () => {
  it('uses STAR*NET ADDITIVE EDM semantics by default', () => {
    expect(distanceMeasurementSigmaM(100, 1, 2)).toBeCloseTo(0.0012, 15);
    expect(distanceMeasurementSigmaM(100, 1, 2, 'propagated')).toBeCloseTo(Math.hypot(0.001, 0.0002), 15);
  });

  it('reproduces the native UK listing standard errors after centering', () => {
    const sigmas = effectiveTotalStationSigmas({
      slopeDistanceM: 78.4189,
      zenithRad: (90 + 34 / 60 + 21.5 / 3600) * Math.PI / 180,
      directionArcSec: 2.5,
      zenithArcSec: 1.5,
      distanceMm: 1,
      distancePpm: 1,
      instrumentCenteringM: 0.0008,
      targetCenteringM: 0.0008,
      verticalCenteringM: 0.0005,
    });

    // The supplied STAR*NET listing rounds these columns to 3.89", 0.0016 m and 2.39".
    expect(sigmas.hzArcSec).toBeCloseTo(3.89, 2);
    expect(sigmas.sdM).toBeCloseTo(0.0016, 4);
    expect(sigmas.vzArcSec).toBeCloseTo(2.39, 2);
    expect(sigmas.hzRad).toBeCloseTo(sigmas.hzArcSec * ARCSEC2RAD, 15);
  });

  it('rejects non-physical or non-finite inputs', () => {
    expect(() => distanceMeasurementSigmaM(0, 1, 1)).toThrow(/greater than zero/);
    expect(() => distanceMeasurementSigmaM(10, -1, 1)).toThrow(/non-negative/);
    expect(() => distanceMeasurementSigmaM(10, 1, 1, 'invalid' as 'additive')).toThrow(/additive or propagated/);
    expect(() => effectiveTotalStationSigmas({
      slopeDistanceM: 10,
      zenithRad: Number.NaN,
      directionArcSec: 1,
      zenithArcSec: 1,
      distanceMm: 1,
      distancePpm: 1,
      instrumentCenteringM: 0,
      targetCenteringM: 0,
      verticalCenteringM: 0,
    })).toThrow(/finite/);
    expect(() => effectiveTotalStationSigmas({
      slopeDistanceM: 10,
      zenithRad: Math.PI / 2,
      directionArcSec: 0,
      zenithArcSec: 0,
      distanceMm: 0,
      distancePpm: 0,
      instrumentCenteringM: 0,
      targetCenteringM: 0,
      verticalCenteringM: 0,
    })).toThrow(/greater than zero/);
  });
});
