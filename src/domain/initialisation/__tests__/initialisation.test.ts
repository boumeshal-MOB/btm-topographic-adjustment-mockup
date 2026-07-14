import { describe, expect, it } from 'vitest';
import type { RawObservation } from '@/domain/entities';
import {
  circularMedianDeg,
  computeInitialCoordinates,
  initialisationCoverage,
  median,
  medianRepresentatives,
  type InitStationInput,
} from '@/domain/initialisation/initialisation';
import { DEG2RAD } from '@/domain/math/geometry';

const obs = (id: string, station: string, target: string, epoch: string, hz: number, vz: number, sd: number): RawObservation => ({
  id, stationCode: station, rawTargetName: target, epoch, hzDeg: hz, vzDeg: vz, sdM: sd,
});

describe('median helpers (INIT-005)', () => {
  it('median is the middle value, not first/last', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('circular median survives the 0/360 wrap', () => {
    expect(circularMedianDeg([359, 0, 1])).toBeCloseTo(0, 6);
  });
});

describe('medianRepresentatives (INIT-005) — median of Hz/Vz/CORRECTED Sd, never first/last', () => {
  it('uses component-wise medians with corrected distances', () => {
    const observations = [
      obs('a', 'ST', 'T1', '2025-03-01T00:00:00Z', 10, 90, 100.0),
      obs('b', 'ST', 'T1', '2025-03-01T01:00:00Z', 12, 91, 100.2),
      obs('c', 'ST', 'T1', '2025-03-01T02:00:00Z', 11, 89, 100.1),
    ];
    const corrected = new Map([
      ['a', 100.0089],
      ['b', 100.2089],
      ['c', 100.1089],
    ]);
    const nameMap = new Map([['ST|T1', 'T1']]);
    const reps = medianRepresentatives(observations, corrected, nameMap);
    const rep = reps.get('ST|T1')!;
    expect(rep.hzDeg).toBeCloseTo(11, 9);
    expect(rep.vzDeg).toBe(90);
    expect(rep.correctedDistanceM).toBeCloseTo(100.1089, 9); // median of corrected, not stored
    expect(rep.nSource).toBe(3);
  });
});

describe('initialisationCoverage (INIT-006)', () => {
  it('reports exact pair/point coverage and lists the missing pairs', () => {
    const observations = [obs('a', 'ST', 'T1', '2025-03-01T00:00:00Z', 10, 90, 50)];
    const expected = new Set(['ST|T1', 'ST|T2']);
    const nameMap = new Map([
      ['ST|T1', 'T1'],
      ['ST|T2', 'T2'],
    ]);
    const coverage = initialisationCoverage(observations, expected, nameMap);
    expect(coverage.expectedStationTargetPairs).toBe(2);
    expect(coverage.availableStationTargetPairs).toBe(1);
    expect(coverage.missingStationTargets).toEqual(['ST|T2']);
    expect(coverage.expectedPhysicalPoints).toBe(2);
    expect(coverage.availablePhysicalPoints).toBe(1);
    expect(coverage.retainedFrom).toBe('2025-03-01T00:00:00Z');
  });
});

describe('computeInitialCoordinates — local anchor 0/0/0/0 (INIT-001/002)', () => {
  // Anchor station at 0/0/0 with orientation 0; two targets radiated from known geometry.
  const anchor: InitStationInput = {
    stationCode: 'ST',
    instrumentHeightM: 0,
    approxE: 0,
    approxN: 0,
    approxH: 0,
    fixedOrientationRad: 0,
  };
  // target truth: T1 at (E=30, N=40, H=2). hd=50, sd=sqrt(50²+2²), vz=atan2(50,2), hz=azimuth=atan2(30,40)
  const hd = 50;
  const dh = 2;
  const sd = Math.hypot(hd, dh);
  const vzDeg = (Math.atan2(hd, dh) * 180) / Math.PI;
  const hzDeg = (Math.atan2(30, 40) * 180) / Math.PI;

  it('accepts 0/0/0/0 and radiates coordinates from window medians', () => {
    const observations = [
      obs('o1', 'ST', 'T1', '2025-03-01T00:00:00Z', hzDeg, vzDeg, sd),
      obs('o2', 'ST', 'T1', '2025-03-01T01:00:00Z', hzDeg, vzDeg, sd),
    ];
    const result = computeInitialCoordinates({
      observations,
      correctedDistanceM: new Map(observations.map((o) => [o.id, o.sdM])),
      stations: [anchor],
      references: [],
      nameMap: new Map([['ST|T1', 'T1']]),
      targetHeights: new Map([['T1', 0]]),
      referenceKeys: new Set(),
    });
    expect(result.failures).toEqual([]);
    const t1 = result.provisional.find((p) => p.pointKey === 'T1')!;
    expect(t1.eastingM).toBeCloseTo(30, 6);
    expect(t1.northingM).toBeCloseTo(40, 6);
    expect(t1.heightM).toBeCloseTo(2, 6);
    expect(t1.observationCount).toBe(2);
    const orientation = result.orientations[0];
    expect(orientation.source).toBe('fixed-anchor');
  });

  it('orients a station from known references (INIT-003: references really provided)', () => {
    // reference R at (100, 0): azimuth = 90°. Observed hz = 40° -> orientation = 50°.
    const refHz = 40;
    const observations = [obs('o1', 'ST', 'R', '2025-03-01T00:00:00Z', refHz, 90, 100)];
    const result = computeInitialCoordinates({
      observations,
      correctedDistanceM: new Map([['o1', 100]]),
      stations: [{ ...anchor, fixedOrientationRad: undefined }],
      references: [{ pointKey: 'R', eastingM: 100, northingM: 0, heightM: 0 }],
      nameMap: new Map([['ST|R', 'R']]),
      targetHeights: new Map([['R', 0]]),
      referenceKeys: new Set(['R']),
    });
    const orientation = result.orientations[0];
    expect(orientation.source).toBe('known-references');
    expect(orientation.orientationRad).toBeCloseTo(50 * DEG2RAD, 6);
    expect(orientation.problems.join(' ')).toContain('Single reference'); // 1 ref: not controlled
  });

  it('fails explicitly when a station cannot be oriented or resected', () => {
    const observations = [obs('o1', 'ST', 'T1', '2025-03-01T00:00:00Z', 10, 90, 50)];
    const result = computeInitialCoordinates({
      observations,
      correctedDistanceM: new Map([['o1', 50]]),
      stations: [{ ...anchor, fixedOrientationRad: undefined }],
      references: [],
      nameMap: new Map([['ST|T1', 'T1']]),
      targetHeights: new Map(),
      referenceKeys: new Set(),
    });
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].reason).toContain('could not be oriented');
  });
});
