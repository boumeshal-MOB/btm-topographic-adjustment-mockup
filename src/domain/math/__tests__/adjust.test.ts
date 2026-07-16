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
  });
});
