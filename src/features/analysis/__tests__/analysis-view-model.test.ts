import { describe, expect, it } from 'vitest';
import type { AnalysisTrialResult } from '@/domain/analysis/types';
import type { AdjustmentDiagnostic } from '@/domain/engine/run-input';
import {
  describeTrialChanges,
  diagnosticWithInitialGeometry,
  plainLanguageQuality,
  pointDeltaRows,
} from '@/features/analysis/analysis-view-model';

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

  it('puts shared references, references and shared points before ordinary points', () => {
    const base = result.points[0];
    const ordered = pointDeltaRows({
      ...result,
      points: [
        { ...base, engineName: 'MON', physicalPointId: 'mon', role: 'monitoring', identityState: 'individual' },
        { ...base, engineName: 'STA', physicalPointId: 'sta', role: 'station', identityState: 'station' },
        { ...base, engineName: 'REF', physicalPointId: 'ref', role: 'reference', identityState: 'individual' },
        { ...base, engineName: 'SHARED', physicalPointId: 'shared', role: 'monitoring', identityState: 'shared' },
        { ...base, engineName: 'SHARED_REF', physicalPointId: 'shared-ref', role: 'reference', identityState: 'shared' },
      ],
    }).map((row) => row.point.engineName);

    expect(ordered).toEqual(['SHARED_REF', 'REF', 'SHARED', 'STA', 'MON']);
  });
});

describe('describing what a run will change', () => {
  const base = {
    engine: 'scientific-preview',
    excludedScalarObservationIds: [],
    disabledReferenceKeys: [],
    weightMultiplier: 1,
    useAutoAdjust: false,
    observationOverrides: {},
    initialCoordinateOverrides: {},
    referenceSigmaOverrides: {},
    adjustmentOverrides: {},
  };

  it('reports nothing when the editor matches the trial on screen', () => {
    // This is what keeps the lab from stacking identical trials.
    expect(describeTrialChanges(base, { ...base })).toEqual([]);
  });

  it('reports each change as before → after', () => {
    const changes = describeTrialChanges(base, {
      ...base,
      weightMultiplier: 2,
      excludedScalarObservationIds: ['obs-1:hz'],
      disabledReferenceKeys: ['REF01'],
      referenceSigmaOverrides: { REF01: { e: 0.002 } },
    });

    expect(changes).toEqual(expect.arrayContaining([
      { key: 'weightMultiplier', before: '×1', after: '×2' },
      { key: 'excluded', subject: 'obs-1:hz', before: 'included', after: 'excluded' },
      { key: 'reference', subject: 'REF01', before: 'constrained', after: 'free' },
    ]));
    expect(changes.some((change) => change.key === 'referenceSigma' && change.subject === 'REF01')).toBe(true);
  });

  it('reports an edit that is being removed as well as one being added', () => {
    const withOverride = { ...base, observationOverrides: { 'obs-1': { sigmaHzArcSec: 3 } } };
    const cleared = describeTrialChanges(withOverride, base);
    expect(cleared).toEqual([
      { key: 'observation', subject: 'obs-1', before: '{"sigmaHzArcSec":3}', after: 'configured value' },
    ]);
  });
});
