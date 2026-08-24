import { describe, expect, it } from 'vitest';
import {
  checkLocalGeometry,
  localPointFromObservation,
  stationConnectivity,
  type LocalPoint,
} from '@/domain/point-identity/local-geometry';

/** Build station-B local points as a rotated+translated copy of station-A truth. */
function rotated(points: LocalPoint[], yawRad: number, te: number, tn: number, th: number): LocalPoint[] {
  const cos = Math.cos(yawRad);
  const sin = Math.sin(yawRad);
  return points.map((p) => ({
    targetKey: p.targetKey.replace('A_', 'B_'),
    e: cos * p.e + sin * p.n + te,
    n: -sin * p.e + cos * p.n + tn,
    h: p.h + th,
  }));
}

const cloudA: LocalPoint[] = [
  { targetKey: 'A_P1', e: 0, n: 100, h: 1 },
  { targetKey: 'A_P2', e: 80, n: 20, h: 2 },
  { targetKey: 'A_P3', e: -50, n: -40, h: 0.5 },
  { targetKey: 'A_P4', e: 30, n: -70, h: 3 },
];
const cloudB = rotated(cloudA, 0.3, 12, -8, 0.7);

const robustSeeds = [
  { aTargetKey: 'A_P1', bTargetKey: 'B_P1' },
  { aTargetKey: 'A_P2', bTargetKey: 'B_P2' },
  { aTargetKey: 'A_P3', bTargetKey: 'B_P3' },
];

describe('checkLocalGeometry (POINT-008..011, 32 §6)', () => {
  it('one seed pair is insufficient: relative orientation undetermined (POINT-008)', () => {
    const check = checkLocalGeometry(cloudA, cloudB, [{ aTargetKey: 'A_P1', bTargetKey: 'B_P1' }]);
    expect(check.status).toBe('insufficient');
    expect(check.candidates).toEqual([]);
    expect(check.diagnostics).toMatchObject({ requestedSeedCount: 1, validSeedCount: 1, stage: 'seed-selection' });
  });

  it('two seed pairs solve the frame but stay weak (POINT-009)', () => {
    const check = checkLocalGeometry(cloudA, cloudB, [
      { aTargetKey: 'A_P1', bTargetKey: 'B_P1' },
      { aTargetKey: 'A_P2', bTargetKey: 'B_P2' },
    ]);
    expect(check.status).toBe('weak');
    expect(check.candidates.length).toBe(4);
    expect(check.message).toContain('no redundancy');
    expect(check.diagnostics).toMatchObject({ stationAPointCount: 4, stationBPointCount: 4, validSeedCount: 2 });
  });

  it('reports when selected seed names do not have processed observations', () => {
    const check = checkLocalGeometry(cloudA, cloudB, [
      { aTargetKey: 'A_P1', bTargetKey: 'B_P1' },
      { aTargetKey: 'A_MISSING', bTargetKey: 'B_P2' },
    ]);

    expect(check.status).toBe('insufficient');
    expect(check.message).toContain('1 of 2');
    expect(check.diagnostics).toMatchObject({ validSeedCount: 1, stage: 'observation-coverage' });
  });

  it('three well-spread seeds allow a robust proposal (POINT-010) with mm-level residuals', () => {
    const check = checkLocalGeometry(cloudA, cloudB, robustSeeds);
    expect(check.status).toBe('ready');
    expect(check.candidates.length).toBe(4);
    for (const candidate of check.candidates) {
      expect(candidate.residual3dM).toBeLessThan(0.001);
      expect(candidate.confidence).toBeGreaterThan(0.9);
    }
    expect(check.candidates.every((candidate) => 'seed' in candidate && !('confirmed' in candidate))).toBe(true);
  });

  it('uses the tolerances supplied by the user to include or reject proposals', () => {
    const offsetB = cloudB.map((point) => point.targetKey === 'B_P4' ? { ...point, e: point.e + 0.08 } : point);
    const tight = checkLocalGeometry(cloudA, offsetB, robustSeeds, 0.05, 0.05);
    const relaxed = checkLocalGeometry(cloudA, offsetB, robustSeeds, 0.10, 0.05);

    expect(tight.candidates.find((candidate) => candidate.bTargetKey === 'B_P4')).toBeUndefined();
    expect(relaxed.candidates.find((candidate) => candidate.bTargetKey === 'B_P4')).toBeDefined();
  });

  it('homonym targets representing DIFFERENT physical points do not match (POINT-002)', () => {
    const movedB = cloudB.map((p) => (p.targetKey === 'B_P4' ? { ...p, e: p.e + 5 } : p));
    const check = checkLocalGeometry(cloudA, movedB, robustSeeds);
    expect(check.candidates.find((c) => c.bTargetKey === 'B_P4')).toBeUndefined();
  });
});

describe('localPointFromObservation', () => {
  it('converts a corrected polar observation into a station-local ENH', () => {
    const p = localPointFromObservation({
      targetKey: 'T',
      hzDeg: 90,
      vzDeg: 90,
      correctedSlopeDistanceM: 100,
      instrumentHeightM: 1.5,
      targetHeightM: 0.5,
    });
    expect(p.e).toBeCloseTo(100, 9);
    expect(p.n).toBeCloseTo(0, 9);
    expect(p.h).toBeCloseTo(1.0, 9);
  });
});

describe('stationConnectivity (PROC-004/005)', () => {
  it('classifies pairs as connected/weak/not-connected from shared confirmed points', () => {
    const pairs = stationConnectivity(
      ['S1', 'S2', 'S3'],
      [
        ['S1', 'S2'],
        ['S1', 'S2'],
        ['S1', 'S2'],
        ['S2', 'S3'],
        ['S2', 'S3'],
      ],
    );
    expect(pairs.find((p) => p.a === 'S1' && p.b === 'S2')?.status).toBe('connected');
    expect(pairs.find((p) => p.a === 'S2' && p.b === 'S3')?.status).toBe('weak');
    expect(pairs.find((p) => p.a === 'S1' && p.b === 'S3')?.status).toBe('not-connected');
  });
});
