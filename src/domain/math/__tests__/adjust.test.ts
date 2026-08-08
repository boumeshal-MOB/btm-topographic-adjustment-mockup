import { describe, expect, it } from 'vitest';
import { ARCSEC2RAD } from '@/domain/math/geometry';
import { adjustNetwork, type EngineObservation, type EnginePoint } from '@/domain/math/adjust';

/**
 * Small synthetic single-station network: one fixed station, two fixed references, two free
 * monitoring points. Observations generated from the true geometry (no noise) must converge to
 * the true coordinates with variance factor ≈ 0 and pass the rank check.
 */
const truth: Record<string, { e: number; n: number; h: number }> = {
  ST: { e: 0, n: 0, h: 0 },
  R1: { e: 100, n: 0, h: 2 },
  R2: { e: 0, n: 120, h: -1 },
  M1: { e: 60, n: 80, h: 5 },
  M2: { e: -40, n: 60, h: 3 },
};

function syntheticObservations(orientationRad: number): EngineObservation[] {
  const st = truth.ST;
  const out: EngineObservation[] = [];
  for (const [id, p] of Object.entries(truth)) {
    if (id === 'ST') continue;
    const dE = p.e - st.e;
    const dN = p.n - st.n;
    const dH = p.h - st.h;
    const hd = Math.hypot(dE, dN);
    const sd = Math.hypot(hd, dH);
    out.push(
      {
        id: `o-${id}:hz`, rawObservationId: `o-${id}`, stationId: 'ST', targetId: id, kind: 'hz',
        value: Math.atan2(dE, dN) - orientationRad, sigma: 1.5 * ARCSEC2RAD,
        instrumentHeightM: 0, targetHeightM: 0, protected: false,
      },
      {
        id: `o-${id}:vz`, rawObservationId: `o-${id}`, stationId: 'ST', targetId: id, kind: 'vz',
        value: Math.atan2(hd, dH), sigma: 1.5 * ARCSEC2RAD,
        instrumentHeightM: 0, targetHeightM: 0, protected: false,
      },
      {
        id: `o-${id}:sd`, rawObservationId: `o-${id}`, stationId: 'ST', targetId: id, kind: 'sd',
        value: sd, sigma: 0.001, instrumentHeightM: 0, targetHeightM: 0, protected: false,
      },
    );
  }
  return out;
}

const points: EnginePoint[] = [
  { id: 'ST', ...truth.ST, free: false, role: 'station' },
  { id: 'R1', ...truth.R1, free: false, role: 'reference' },
  { id: 'R2', ...truth.R2, free: false, role: 'reference' },
  // start free points away from the truth to prove convergence
  { id: 'M1', e: truth.M1.e + 0.5, n: truth.M1.n - 0.4, h: truth.M1.h + 0.3, free: true, role: 'monitoring' },
  { id: 'M2', e: truth.M2.e - 0.3, n: truth.M2.n + 0.6, h: truth.M2.h - 0.2, free: true, role: 'monitoring' },
];

const opts = {
  convergenceThresholdM: 1e-6,
  maxIterations: 20,
  chiSquareSignificance: 0.05,
  confidenceLevel: 0.95,
  errorPropagation: true,
};

describe('adjustNetwork (ported solver) — ADJ-004/005/006/010', () => {
  it('converges to the true coordinates on a noise-free redundant network', () => {
    const result = adjustNetwork(syntheticObservations(0.1), points, [], opts);
    expect(result.ok).toBe(true);
    expect(result.converged).toBe(true);
    expect(result.rankDeficiency).toBe(0);
    const m1 = result.points.find((p) => p.id === 'M1')!;
    expect(m1.e).toBeCloseTo(truth.M1.e, 5);
    expect(m1.n).toBeCloseTo(truth.M1.n, 5);
    expect(m1.h).toBeCloseTo(truth.M1.h, 5);
    // noise-free: weighted SSR near zero
    expect(result.weightedSSR).toBeLessThan(1e-6);
    expect(result.degreesOfFreedom).toBeGreaterThan(0);
  });

  it('reports rank deficiency instead of publishing success (ADJ-006)', () => {
    // no fixed point at all: free datum -> rank deficient
    const freePoints: EnginePoint[] = points.map((p) => ({ ...p, free: true }));
    const result = adjustNetwork(syntheticObservations(0), freePoints, [], opts);
    expect(result.ok).toBe(false);
    expect(result.failureReason).toMatch(/Rank deficiency|Under-determined/);
  });

  it('propagates sigmas and confidence ellipses for free points (ADJ-005)', () => {
    const result = adjustNetwork(syntheticObservations(0), points, [], opts);
    const m2 = result.points.find((p) => p.id === 'M2')!;
    expect(m2.sigmaE).toBeGreaterThanOrEqual(0);
    expect(m2.ellipseSemiMajorM).toBeGreaterThanOrEqual(m2.ellipseSemiMinorM);
  });

  it('matches the canonical Python golden vector and never shrinks lower-tail covariance', () => {
    const target = { e: 10, n: 20, h: 5 };
    const hz = Math.atan2(target.e, target.n);
    const vz = Math.atan2(Math.hypot(target.e, target.n), target.h);
    const sd = Math.hypot(target.e, target.n, target.h);
    const noises = [0, 0.0002, -0.0001];
    const observations: EngineObservation[] = noises.flatMap((noise, index) => [
      { id: `o${index}:hz`, rawObservationId: `o${index}`, stationId: 'STA', targetId: 'P', kind: 'hz', value: hz + noise / 100, sigma: ARCSEC2RAD, instrumentHeightM: 0, targetHeightM: 0, protected: false },
      { id: `o${index}:vz`, rawObservationId: `o${index}`, stationId: 'STA', targetId: 'P', kind: 'vz', value: vz - noise / 100, sigma: ARCSEC2RAD, instrumentHeightM: 0, targetHeightM: 0, protected: false },
      { id: `o${index}:sd`, rawObservationId: `o${index}`, stationId: 'STA', targetId: 'P', kind: 'sd', value: sd + noise, sigma: 0.001, instrumentHeightM: 0, targetHeightM: 0, protected: false },
    ]);
    const result = adjustNetwork(observations, [
      { id: 'STA', e: 0, n: 0, h: 0, free: false, role: 'station' },
      { id: 'P', e: 9.8, n: 20.2, h: 5.1, free: true, role: 'monitoring' },
    ], [], { ...opts, convergenceThresholdM: 1e-10, maxIterations: 50, fixedOrientations: new Map([['STA', 0]]) });
    const adjusted = result.points.find((point) => point.id === 'P')!;
    expect(adjusted.e).toBeCloseTo(10.000020469177025, 8);
    expect(adjusted.n).toBeCloseTo(20.000024271664387, 8);
    expect(adjusted.h).toBeCloseTo(5.000014727500164, 8);
    expect(result.weightedSSR).toBeCloseTo(0.44375492281189854, 6);
    expect(result.varianceFactor).toBeLessThan(1);
    expect(adjusted.sigmaE).toBeCloseTo(0.00025819613609745875, 8);
    expect(adjusted.sigmaE).toBeGreaterThan(0);
    expect(result.orientations).toEqual([{
      stationId: 'STA',
      valueRad: 0,
      sigmaRad: 0,
      fixed: true,
    }]);
  });

  it('recovers a connected two-station network used by the Python parity suite', () => {
    const networkTruth = {
      STA1: { e: 0, n: 0, h: 0 },
      STA2: { e: 40, n: 5, h: 1 },
      P1: { e: 20, n: 30, h: 2 },
      P2: { e: 55, n: 35, h: 4 },
      P3: { e: 30, n: 65, h: 3 },
    };
    const orientations = { STA1: 0, STA2: 0.25 };
    const observations: EngineObservation[] = [];
    for (const [stationId, stationOrientation] of Object.entries(orientations)) {
      const station = networkTruth[stationId as keyof typeof networkTruth];
      for (const targetId of ['P1', 'P2', 'P3'] as const) {
        const target = networkTruth[targetId];
        const dE = target.e - station.e;
        const dN = target.n - station.n;
        const dH = target.h - station.h;
        const horizontal = Math.hypot(dE, dN);
        const base = { rawObservationId: `${stationId}-${targetId}`, stationId, targetId, instrumentHeightM: 0, targetHeightM: 0, protected: false };
        observations.push(
          { ...base, id: `${base.rawObservationId}:hz`, kind: 'hz', value: Math.atan2(dE, dN) - stationOrientation, sigma: ARCSEC2RAD },
          { ...base, id: `${base.rawObservationId}:vz`, kind: 'vz', value: Math.atan2(horizontal, dH), sigma: ARCSEC2RAD },
          { ...base, id: `${base.rawObservationId}:sd`, kind: 'sd', value: Math.hypot(horizontal, dH), sigma: 0.001 },
        );
      }
    }
    const networkPoints: EnginePoint[] = [
      { id: 'STA1', ...networkTruth.STA1, free: false, role: 'station' },
      { id: 'STA2', e: 39.5, n: 5.4, h: 0.8, free: true, role: 'station' },
      { id: 'P1', e: 19.7, n: 30.2, h: 2.1, free: true, role: 'monitoring' },
      { id: 'P2', e: 55.2, n: 34.8, h: 3.9, free: true, role: 'monitoring' },
      { id: 'P3', e: 30.3, n: 64.7, h: 3.2, free: true, role: 'monitoring' },
    ];
    const result = adjustNetwork(observations, networkPoints, [], {
      ...opts,
      convergenceThresholdM: 1e-10,
      maxIterations: 100,
      fixedOrientations: new Map([['STA1', 0]]),
    });
    expect(result.ok).toBe(true);
    expect(result.degreesOfFreedom).toBeGreaterThan(0);
    for (const point of result.points) {
      const expected = networkTruth[point.id as keyof typeof networkTruth];
      expect(point.e).toBeCloseTo(expected.e, 6);
      expect(point.n).toBeCloseTo(expected.n, 6);
      expect(point.h).toBeCloseTo(expected.h, 6);
    }
    expect(result.orientations.find((row) => row.stationId === 'STA2')?.valueRad).toBeCloseTo(0.25, 7);
  });

  it('rejects ambiguous or non-physical contracts before solving', () => {
    const validObservations = syntheticObservations(0);
    expect(adjustNetwork(validObservations, [points[0], points[0]], [], opts).failureReason).toMatch(/Duplicate point id/);
    expect(adjustNetwork([validObservations[0], validObservations[0]], points, [], opts).failureReason).toMatch(/Duplicate observation id/);
    expect(adjustNetwork([{ ...validObservations[0], sigma: 0 }], points, [], opts).failureReason).toMatch(/sigma must be greater/);
    expect(adjustNetwork(validObservations, points, [{ pointId: 'UNKNOWN', component: 'e', value: 0, sigma: 1 }], opts).failureReason).toMatch(/unknown point/);
    expect(adjustNetwork(validObservations, points, [], { ...opts, chiSquareSignificance: 2 }).failureReason).toMatch(/strictly between/);
  });
});
