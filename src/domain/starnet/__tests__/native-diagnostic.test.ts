import { describe, expect, it } from 'vitest';
import type { AnalysisPointSnapshot, AnalysisObservationSnapshot } from '@/domain/analysis/types';
import { starNetResultToDiagnostic } from '@/domain/starnet/native-diagnostic';
import type { StarNetVmResult } from '@/domain/starnet/vm-bridge';

const listing = `
Iterations = 2
Number of Stations = 2
Number of Observations = 4
Number of Unknowns = 3
Number of Redundant Obs = 1
Total 4 1.000 1.000
The Chi-Square Test at 5.00% Level Passed
Adjusted Coordinates (Meters)
Station E N Elev Description
S1 0.0000 0.0000 0.0000
LONG_POINT_NAME 10.0010 20.0020 3.0030
BTMORI001 0.0000 1000.0000 0.0000
Adjusted Observations and Residuals
Adjusted Distance Observations (Meters)
From To Distance Residual StdErr StdRes
S1 LONG_POINT_N 22.5600 0.0010 0.0020 0.5
Adjusted Zenith Observations (DMS)
From To Zenith Residual StdErr StdRes
S1 LONG_POINT_N 82-20-00.00 -0-00-01.00 2.00 0.5
Adjusted Direction Observations (DMS)
From To Direction Residual StdErr StdRes
Set 1
S1 LONG_POINT_N 63-26-00.00 0-00-02.00 2.00 1.0
Adjusted Bearings
Station Coordinate Standard Deviations (Meters)
Station E N Elev
S1 0.0000 0.0000 0.0000
LONG_POINT_NAME 0.0010 0.0020 0.0030
Station Coordinate Error Ellipses (Meters)
Confidence Region = 95%
Station Semi-Major Semi-Minor Azimuth of Elev
LONG_POINT_NAME 0.0040 0.0020 30-00 0.0060
Relative Error Ellipses
`;

const points: AnalysisPointSnapshot[] = [{
  engineName: 'S1', physicalPointId: 'station:S1', label: 'S1', role: 'station', identityState: 'station',
  memberTargets: [], observedByStations: [], fixed: true,
  constraints: [{ component: 'e', mode: 'fixed' }, { component: 'n', mode: 'fixed' }, { component: 'h', mode: 'fixed' }],
  eastingM: 0, northingM: 0, heightM: 0,
}, {
  engineName: 'LONG_POINT_NAME', physicalPointId: 'pp-1', label: 'Long point', role: 'monitoring', identityState: 'shared',
  memberTargets: [], observedByStations: ['S1'], fixed: false, constraints: [],
  eastingM: 10, northingM: 20, heightM: 3,
}];

const observations: AnalysisObservationSnapshot[] = [{
  observationId: 'raw-1', stationEngineName: 'S1', targetEngineName: 'LONG_POINT_NAME', pointRole: 'monitoring', sharedPhysicalPoint: true,
  baseValues: { hzDeg: 63, vzDeg: 82, finalSlopeDistanceM: 22.56 },
  effectiveValues: { hzDeg: 63, vzDeg: 82, finalSlopeDistanceM: 22.56 },
  basePrecision: { sigmaHzArcSec: 2, sigmaVzArcSec: 2, sigmaSdMm: 2, sigmaSdPpm: 0 },
  effectivePrecision: { sigmaHzArcSec: 2, sigmaVzArcSec: 2, sigmaSdMm: 2, sigmaSdPpm: 0 },
  excludedComponents: [], protected: false,
}];

const nativeResult: StarNetVmResult = {
  kind: 'btm-starnet-result', schemaVersion: 1, jobId: 'btm-analysis-1', processingId: 1, runId: 'analysis-1',
  status: 'succeeded', exitCode: 0, startedAt: '2026-01-01T00:00:00Z', finishedAt: '2026-01-01T00:00:01Z',
  starNet: { executableName: 'StarNet.exe', fileVersion: '14.0', noGraphics: false, mode: 'run' },
  console: { stdout: '', stderr: '' },
  outputFiles: [
    { name: 'input.lst', extension: '.lst', sizeBytes: listing.length, content: listing },
    { name: 'input.pts', extension: '.pts', sizeBytes: 100, content: 'S1 0 0 0\r\nLONG_POINT_NAME 10.001 20.002 3.003\r\nBTMORI001 0 1000 0\r\n' },
    { name: 'input.run', extension: '.run', sizeBytes: 3, content: '0\r\n' },
  ],
};

describe('native STAR*NET diagnostic adapter', () => {
  it('maps native coordinates, ellipses and residuals to the shared Analysis Lab contract', () => {
    const mathematicalResiduals = [
      { kind: 'sd', redundancy: 0.25 },
      { kind: 'vz', redundancy: 0.4 },
      { kind: 'hz', redundancy: 0.1 },
    ].map(({ kind, redundancy }) => ({
      scalarObservationId: `raw-1:${kind}`,
      observationId: 'raw-1',
      stationEngineName: 'S1',
      targetEngineName: 'LONG_POINT_NAME',
      kind: kind as 'sd' | 'vz' | 'hz',
      residual: 0,
      sigma: 1,
      stdResidual: 0,
      normalizedResidual: 0,
      redundancy,
    }));
    const diagnostic = starNetResultToDiagnostic(nativeResult, { points, observations }, 'EN', mathematicalResiduals);
    expect(diagnostic.engineLabel).toContain('STAR*NET 14 Ultimate');
    expect(diagnostic.ok).toBe(true);
    expect(diagnostic.chiSquareStatus).toBe('passed');
    expect(diagnostic.points.map((point) => point.engineName)).toEqual(['S1', 'LONG_POINT_NAME']);
    expect(diagnostic.points[1]).toMatchObject({
      role: 'monitoring', eastingM: 10.001, sigmaEM: 0.001,
      ellipseSemiMajorM: 0.004, ellipseSemiMinorM: 0.002, ellipseOrientationDeg: 30,
    });
    expect(diagnostic.residuals.find((residual) => residual.kind === 'sd')).toMatchObject({
      targetEngineName: 'LONG_POINT_NAME', residual: 0.001, sigma: 0.002, stdResidual: 0.5, redundancy: 0.25,
    });
    expect(diagnostic.residuals.find((residual) => residual.kind === 'hz')?.residual).toBeCloseTo(2 * Math.PI / (180 * 3600), 12);
  });

  it('does not invent a passed chi-square result when STAR*NET has no redundancy', () => {
    const result = structuredClone(nativeResult);
    result.outputFiles[0].content = listing
      .replace('Number of Redundant Obs = 1', 'Number of Redundant Obs = 0')
      .replace('The Chi-Square Test at 5.00% Level Passed', '');
    expect(starNetResultToDiagnostic(result, { points, observations }).chiSquareStatus).toBe('not-applicable');
  });
});
