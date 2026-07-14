import { describe, expect, it } from 'vitest';
import ukPreset from '@/configs/uk-supplied-hs2-nte.v1.json';
import type { StarNetAdjustmentConfig, StarNetWeights } from '@/domain/entities';
import { DEMO_ENGINE_LABEL, runDemoAdjustment, runDemoAdjustmentWithAutoAdjust } from '@/domain/engine/demo-engine-core';
import type { ResolvedRunInput, ResolvedRunObservation, ResolvedRunPoint } from '@/domain/engine/run-input';

const adjustment: StarNetAdjustmentConfig = {
  ...(ukPreset.adjustment as unknown as StarNetAdjustmentConfig),
  defaultWeights: ukPreset.adjustment.defaultWeights as StarNetWeights,
};

const truth: Record<string, { e: number; n: number; h: number }> = {
  ST0001: { e: 0, n: 0, h: 0 },
  REF001: { e: 100, n: 10, h: 2 },
  REF002: { e: -20, n: 120, h: -1 },
  MON001: { e: 60, n: 80, h: 5 },
  MON002: { e: -40, n: 60, h: 3 },
};

function observation(target: string, overrides: Partial<ResolvedRunObservation> = {}): ResolvedRunObservation {
  const st = truth.ST0001;
  const p = truth[target];
  const dE = p.e - st.e;
  const dN = p.n - st.n;
  const dH = p.h - st.h;
  const hd = Math.hypot(dE, dN);
  return {
    id: `obs-${target}`,
    stationEngineName: 'ST0001',
    targetEngineName: target,
    hzDeg: (Math.atan2(dE, dN) * 180) / Math.PI,
    vzDeg: (Math.atan2(hd, dH) * 180) / Math.PI,
    finalSlopeDistanceM: Math.hypot(hd, dH),
    sigmaHzArcSec: 1.5,
    sigmaVzArcSec: 1.5,
    sigmaSdMm: 1,
    sigmaSdPpm: 1,
    instrumentHeightM: 0,
    targetHeightM: 0,
    ...overrides,
  };
}

const points: ResolvedRunPoint[] = [
  { engineName: 'ST0001', ...toEnh('ST0001'), free: false, role: 'station' },
  { engineName: 'REF001', ...toEnh('REF001'), free: false, role: 'reference' },
  { engineName: 'REF002', ...toEnh('REF002'), free: false, role: 'reference' },
  { engineName: 'MON001', eastingM: truth.MON001.e + 0.3, northingM: truth.MON001.n - 0.2, heightM: truth.MON001.h + 0.1, free: true, role: 'monitoring' },
  { engineName: 'MON002', eastingM: truth.MON002.e - 0.2, northingM: truth.MON002.n + 0.4, heightM: truth.MON002.h - 0.1, free: true, role: 'monitoring' },
];

function toEnh(name: string) {
  return { eastingM: truth[name].e, northingM: truth[name].n, heightM: truth[name].h };
}

const baseInput: ResolvedRunInput = {
  processingId: 1,
  configVersionId: 'cfg-1',
  outputSlot: '2025-03-01T09:30:00.000Z',
  adjustment,
  points,
  observations: ['REF001', 'REF002', 'MON001', 'MON002'].map((t) => observation(t)),
};

describe('runDemoAdjustment (DEMO-004, ADJ-002/004/005/006/010)', () => {
  it('solves the noise-free network, labelled as demo solver', () => {
    const d = runDemoAdjustment(baseInput);
    expect(d.engineLabel).toBe(DEMO_ENGINE_LABEL);
    expect(d.ok).toBe(true);
    expect(d.converged).toBe(true);
    expect(d.rankDeficiency).toBe(0);
    expect(d.degreesOfFreedom).toBeGreaterThan(0);
    const mon = d.points.find((p) => p.engineName === 'MON001')!;
    expect(mon.eastingM).toBeCloseTo(truth.MON001.e, 4);
    expect(mon.heightM).toBeCloseTo(truth.MON001.h, 4);
    expect(mon.singleRay).toBe(true); // one station only observes it (ADJ-010)
  });

  it('audit B-04: dof <= 0 yields chiSquareStatus not-applicable, never passed/failed', () => {
    // a single free point observed once from one station: 3 unknowns, 3 scalar observations
    const input: ResolvedRunInput = {
      ...baseInput,
      points: [points[0], points[3]],
      observations: [observation('MON001')],
    };
    const d = runDemoAdjustment(input);
    expect(d.degreesOfFreedom).toBeLessThanOrEqual(0);
    expect(d.chiSquareStatus).toBe('not-applicable');
    expect(d.warnings.join(' ')).toContain('Not applicable — no redundancy');
  });

  it('reports rank deficiency as a failure, never a published success (ADJ-006)', () => {
    const input: ResolvedRunInput = {
      ...baseInput,
      points: baseInput.points.map((p) => ({ ...p, free: true, constraints: undefined })),
    };
    const d = runDemoAdjustment(input);
    expect(d.ok).toBe(false);
    expect(d.chiSquareStatus).not.toBe('passed');
  });
});

describe('runDemoAdjustmentWithAutoAdjust (ADJ-007/008, DATA-007)', () => {
  it('excludes the worst observation from the trial and traces every attempt', () => {
    // corrupt a distance to a FIXED reference by 30 mm — the error cannot be absorbed by a
    // free point, chi-square fails, Auto Adjust removes that observation from the trial
    const corrupted = baseInput.observations.map((o) =>
      o.id === 'obs-REF001' ? { ...o, finalSlopeDistanceM: o.finalSlopeDistanceM + 0.03 } : o,
    );
    const d = runDemoAdjustmentWithAutoAdjust({ ...baseInput, observations: corrupted });
    expect(d.autoAdjustAttempts.length).toBeGreaterThan(0);
    expect(d.autoAdjustAttempts[0].excludedObservationId).toBe('obs-REF001');
    expect(d.autoAdjustAttempts[0].reason).toContain('standardized residual');
    // the raw input list is untouched (DATA-007): exclusion lives in the trial only
    expect(corrupted.find((o) => o.id === 'obs-REF001')?.excluded).toBeUndefined();
  });

  it('never runs Auto Adjust when the test is not interpretable (audit B-04)', () => {
    const input: ResolvedRunInput = {
      ...baseInput,
      points: [points[0], points[3]],
      observations: [observation('MON001', { finalSlopeDistanceM: 200 })], // grossly wrong but dof<=0
    };
    const d = runDemoAdjustmentWithAutoAdjust(input);
    expect(d.chiSquareStatus).toBe('not-applicable');
    expect(d.autoAdjustAttempts).toEqual([]);
  });

  it('respects protected observations (ADJ-007 guard-rails)', () => {
    const corrupted = baseInput.observations.map((o) =>
      o.id === 'obs-REF001' ? { ...o, finalSlopeDistanceM: o.finalSlopeDistanceM + 0.03, protected: true } : o,
    );
    const d = runDemoAdjustmentWithAutoAdjust({ ...baseInput, observations: corrupted });
    expect(d.autoAdjustAttempts.find((a) => a.excludedObservationId === 'obs-REF001')).toBeUndefined();
  });
});
