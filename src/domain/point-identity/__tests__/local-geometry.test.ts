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

describe('checkLocalGeometry (POINT-008..011, 32 §6)', () => {
  it('one seed pair is insufficient: relative orientation undetermined (POINT-008)', () => {
    const check = checkLocalGeometry(cloudA, cloudB, [{ aTargetKey: 'A_P1', bTargetKey: 'B_P1' }]);
    expect(check.status).toBe('insufficient');
    expect(check.candidates).toEqual([]);
  });

  it('two seed pairs solve the frame but stay weak (POINT-009)', () => {
    const check = checkLocalGeometry(cloudA, cloudB, [
      { aTargetKey: 'A_P1', bTargetKey: 'B_P1' },
      { aTargetKey: 'A_P2', bTargetKey: 'B_P2' },
    ]);
    expect(check.status).toBe('weak');
    // all four points match after the transform
    expect(check.candidates.length).toBe(4);
    expect(check.message).toContain('no redundancy');
  });

  it('three well-spread seeds allow a robust proposal (POINT-010) with mm-level residuals', () => {
    const check = checkLocalGeometry(cloudA, cloudB, [
      { aTargetKey: 'A_P1', bTargetKey: 'B_P1' },
      { aTargetKey: 'A_P2', bTargetKey: 'B_P2' },
      { aTargetKey: 'A_P3', bTargetKey: 'B_P3' },
    ]);
    expect(check.status).toBe('ready');
    expect(check.candidates.length).toBe(4);
    for (const candidate of check.candidates) {
      expect(candidate.residual3dM).toBeLessThan(0.001);
      expect(candidate.confidence).toBeGreaterThan(0.9);
    }
    // POINT-011: candidates are proposals; nothing in the result marks them confirmed
    expect(check.candidates.every((c) => 'seed' in c && !('confirmed' in c))).toBe(true);
  });

  it('homonym targets representing DIFFERENT physical points do not match (POINT-002)', () => {
    // B_P4 moved far away: same name pattern, different physical point
    const movedB = cloudB.map((p) => (p.targetKey === 'B_P4' ? { ...p, e: p.e + 5 } : p));
    const check = checkLocalGeometry(cloudA, movedB, [
      { aTargetKey: 'A_P1', bTargetKey: 'B_P1' },
      { aTargetKey: 'A_P2', bTargetKey: 'B_P2' },
      { aTargetKey: 'A_P3', bTargetKey: 'B_P3' },
    ]);
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
        ['S1', 'S2'], // 1 shared S1-S2
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
