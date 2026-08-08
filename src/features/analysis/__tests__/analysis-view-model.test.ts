import { describe, expect, it } from 'vitest';
import type { AnalysisTrialResult } from '@/domain/analysis/types';
import type { AdjustmentDiagnostic } from '@/domain/engine/run-input';
import { diagnosticWithInitialGeometry, plainLanguageQuality, pointDeltaRows } from '@/features/analysis/analysis-view-model';

const failedDiagnostic: AdjustmentDiagnostic = {
  engineLabel: 'Scientific preview',
  ok: false,
  failureReason: 'rank deficient',
  converged: false,
  iterations: 0,
  observationCount: 3,
  constraintCount: 0,
  unknownCount: 4,
  rank: 3,
  rankDeficiency: 1,
  deficientUnknowns: ['P1:E'],
  degreesOfFreedom: -1,
  chiSquareStatus: 'not-applicable',
  chiSquareLower: Number.NaN,
  chiSquareUpper: Number.NaN,
  weightedSSR: Number.NaN,
  varianceFactor: Number.NaN,
  maxStdResidual: 0,
  points: [],
  residuals: [],
  autoAdjustAttempts: [],
  warnings: [],
};

const result: AnalysisTrialResult = {
  diagnostic: failedDiagnostic,
  alerts: [],
  stationEpochs: [],
  baselineObservationCount: 1,
  blocking: [],
  warnings: [],
  points: [{
    engineName: 'P1',
    physicalPointId: 'pp-1',
    label: 'P1',
    role: 'monitoring',
    identityState: 'shared',
    memberTargets: [],
    observedByStations: ['S1'],
    fixed: false,
    constraints: [],
    eastingM: 10,
    northingM: 20,
    heightM: 3,
  }],
  observations: [{
    observationId: 'o1',
    stationEngineName: 'S1',
    targetEngineName: 'P1',
    pointRole: 'monitoring',
    sharedPhysicalPoint: true,
    baseValues: { hzDeg: 10, vzDeg: 90, finalSlopeDistanceM: 20 },
    effectiveValues: { hzDeg: 10, vzDeg: 90, finalSlopeDistanceM: 20 },
    basePrecision: { sigmaHzArcSec: 1, sigmaVzArcSec: 1, sigmaSdMm: 1, sigmaSdPpm: 1 },
    effectivePrecision: { sigmaHzArcSec: 1, sigmaVzArcSec: 1, sigmaSdMm: 1, sigmaSdPpm: 1 },
    excludedComponents: [],
    protected: false,
  }],
  previews: { dat: '', prj: '' },
};

describe('Analysis Lab view model', () => {
  it('keeps initial points visible when a trial has no adjusted solution', () => {
    const display = diagnosticWithInitialGeometry(result);
    expect(display.points).toHaveLength(1);
    expect(display.points[0]).toMatchObject({ engineName: 'P1', eastingM: 10, singleRay: true });
    expect(display.engineLabel).toContain('initial geometry shown');
  });

  it('explains rank failure before suggesting weight changes', () => {
    expect(plainLanguageQuality(failedDiagnostic)).toMatchObject({
      severity: 'error',
      title: 'No unique adjusted solution',
    });
  });

  it('computes millimetre coordinate deltas against the initial geometry', () => {
    const adjusted = {
      ...result,
      diagnostic: {
        ...failedDiagnostic,
        points: [{
          engineName: 'P1', role: 'monitoring' as const,
          eastingM: 10.001, northingM: 19.998, heightM: 3.003,
          sigmaEM: 0, sigmaNM: 0, sigmaHM: 0,
          ellipseSemiMajorM: 0, ellipseSemiMinorM: 0, ellipseOrientationDeg: 0,
          observationCount: 3, singleRay: true,
        }],
      },
    };
    const delta = pointDeltaRows(adjusted)[0];
    expect(delta.deltaEMm).toBeCloseTo(1, 8);
    expect(delta.deltaNMm).toBeCloseTo(-2, 8);
    expect(delta.deltaHMm).toBeCloseTo(3, 8);
    expect(delta.delta3dMm).toBeCloseTo(Math.sqrt(14), 8);
  });
});
