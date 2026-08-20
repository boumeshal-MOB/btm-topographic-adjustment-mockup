import { describe, expect, it } from 'vitest';
import type { AtmosphericPolicy } from '@/domain/entities';
import {
  STANDARD_PPM_FORMULA_ID,
  STANDARD_PPM_FORMULA_VERSION,
  atmosphericPpm,
  isValidEnvironmentReading,
  resolveAtmosphericPpm,
  type EnvironmentReading,
} from '@/domain/corrections/atmosphere';

const basePolicy: AtmosphericPolicy = {
  mode: 'none',
  missingPolicy: 'continue-without-correction',
  marksResultProvisional: false,
  catchUpOnLateData: true,
  formulaId: STANDARD_PPM_FORMULA_ID,
  formulaVersion: STANDARD_PPM_FORMULA_VERSION,
};

const EPOCH = '2025-03-01T09:30:00.000Z';

describe('atmosphericPpm — DOMAINE-ET-STARNET.md standard-ppm-v1 formula', () => {
  it('is near zero at the reference atmosphere (~12 degC / 1013 hPa)', () => {
    expect(Math.abs(atmosphericPpm(12, 1013.25))).toBeLessThan(1);
  });

  it('warm low-pressure air produces a positive ppm (lengthens the distance)', () => {
    expect(atmosphericPpm(30, 950)).toBeGreaterThan(10);
  });
});

describe('isValidEnvironmentReading — ATMO-004 plausibility bounds', () => {
  it('rejects sentinel/out-of-range values', () => {
    expect(isValidEnvironmentReading(-9999, 1013)).toBe(false);
    expect(isValidEnvironmentReading(15, -1)).toBe(false);
    expect(isValidEnvironmentReading(undefined, 1013)).toBe(false);
    expect(isValidEnvironmentReading(15, undefined)).toBe(false);
    expect(isValidEnvironmentReading(Number.NaN, 1013)).toBe(false);
  });

  it('accepts a plausible reading', () => {
    expect(isValidEnvironmentReading(15, 1013)).toBe(true);
  });
});

describe('resolveAtmosphericPpm — ATMO-001 four atmospheric modes', () => {
  it('CORR-005/ATMO-001 already-applied: no atmospheric correction, never applied twice', () => {
    const result = resolveAtmosphericPpm({ ...basePolicy, mode: 'already-applied' }, EPOCH, []);
    expect(result.source).toBe('already-applied');
    expect(result.appliedPpm).toBe(0);
    expect(result.scale).toBe(1);
    expect(result.blocking).toBe(false);
    expect(result.provisional).toBe(false);
  });

  it('ATMO-001 none: no atmospheric correction regardless of any candidate T/P', () => {
    const candidates: EnvironmentReading[] = [{ epoch: EPOCH, temperatureC: 30, pressureHPa: 950 }];
    const result = resolveAtmosphericPpm({ ...basePolicy, mode: 'none' }, EPOCH, candidates);
    expect(result.source).toBe('none');
    expect(result.appliedPpm).toBe(0);
    expect(result.scale).toBe(1);
  });

  it('ATMO-001 fixed-temperature-pressure: applies the configured fixed T/P via the formula', () => {
    const result = resolveAtmosphericPpm(
      { ...basePolicy, mode: 'fixed-temperature-pressure', fixedTemperatureC: 30, fixedPressureHPa: 950 },
      EPOCH,
      [],
    );
    expect(result.source).toBe('fixed');
    expect(result.appliedPpm).toBeCloseTo(atmosphericPpm(30, 950), 9);
    expect(result.scale).toBeCloseTo(1 + atmosphericPpm(30, 950) * 1e-6, 12);
    expect(result.blocking).toBe(false);
  });

  it('ATMO-001/ATMO-003 cycle-temperature-pressure: picks the nearest valid candidate within tolerance', () => {
    const policy: AtmosphericPolicy = {
      ...basePolicy,
      mode: 'cycle-temperature-pressure',
      variables: { temperatureVariableId: 1, pressureVariableId: 2, temporalToleranceMinutes: 15 },
    };
    const candidates: EnvironmentReading[] = [
      { epoch: '2025-03-01T09:00:00.000Z', temperatureC: 5, pressureHPa: 1000 }, // too old (30 min)
      { epoch: '2025-03-01T09:25:00.000Z', temperatureC: 12, pressureHPa: 1013.25 }, // 5 min, in tolerance
      { epoch: '2025-03-01T09:40:00.000Z', temperatureC: 20, pressureHPa: 1005 }, // 10 min, further than the 5-min one
    ];
    const result = resolveAtmosphericPpm(policy, EPOCH, candidates);
    expect(result.source).toBe('cycle');
    expect(result.temperatureC).toBe(12);
    expect(result.pressureHPa).toBe(1013.25);
    expect(result.ageMinutes).toBeCloseTo(5, 6);
  });

  it('cycle mode ignores an invalid candidate even if it is the closest in time', () => {
    const policy: AtmosphericPolicy = {
      ...basePolicy,
      mode: 'cycle-temperature-pressure',
      missingPolicy: 'continue-without-correction',
      variables: { temporalToleranceMinutes: 15 },
    };
    const candidates: EnvironmentReading[] = [
      { epoch: '2025-03-01T09:29:00.000Z', temperatureC: -9999, pressureHPa: 1013 }, // closest but invalid
      { epoch: '2025-03-01T09:20:00.000Z', temperatureC: 12, pressureHPa: 1013.25 }, // valid, farther
    ];
    const result = resolveAtmosphericPpm(policy, EPOCH, candidates);
    expect(result.source).toBe('cycle');
    expect(result.temperatureC).toBe(12);
  });
});

describe('resolveAtmosphericPpm — ATMO-002 four missing/invalid T/P policies', () => {
  const cyclePolicyMissing: AtmosphericPolicy = {
    ...basePolicy,
    mode: 'cycle-temperature-pressure',
    variables: { temporalToleranceMinutes: 10 },
  };

  it('fixed-fallback: uses the configured fallback T/P and marks provisional per policy', () => {
    const policy: AtmosphericPolicy = {
      ...cyclePolicyMissing,
      missingPolicy: 'fixed-fallback',
      fallbackTemperatureC: 15,
      fallbackPressureHPa: 1015,
      marksResultProvisional: true,
    };
    const result = resolveAtmosphericPpm(policy, EPOCH, []);
    expect(result.source).toBe('fallback-fixed');
    expect(result.appliedPpm).toBeCloseTo(atmosphericPpm(15, 1015), 9);
    expect(result.provisional).toBe(true);
    expect(result.blocking).toBe(false);
  });

  it('fixed-fallback with an invalid fallback itself becomes blocking (no usable value at all)', () => {
    const policy: AtmosphericPolicy = {
      ...cyclePolicyMissing,
      missingPolicy: 'fixed-fallback',
      fallbackTemperatureC: -9999,
      fallbackPressureHPa: 1015,
    };
    const result = resolveAtmosphericPpm(policy, EPOCH, []);
    expect(result.source).toBe('missing-blocking');
    expect(result.blocking).toBe(true);
    expect(result.appliedPpm).toBe(0);
  });

  it('continue-without-correction: no correction applied, provisional follows the policy flag', () => {
    const policy: AtmosphericPolicy = {
      ...cyclePolicyMissing,
      missingPolicy: 'continue-without-correction',
      marksResultProvisional: false,
    };
    const result = resolveAtmosphericPpm(policy, EPOCH, []);
    expect(result.source).toBe('none');
    expect(result.appliedPpm).toBe(0);
    expect(result.scale).toBe(1);
    expect(result.blocking).toBe(false);
    expect(result.provisional).toBe(false);
  });

  it('assume-already-corrected: no correction applied, distinct source from continue-without-correction', () => {
    const policy: AtmosphericPolicy = {
      ...cyclePolicyMissing,
      missingPolicy: 'assume-already-corrected',
      marksResultProvisional: true,
    };
    const result = resolveAtmosphericPpm(policy, EPOCH, []);
    expect(result.source).toBe('assumed-already-corrected');
    expect(result.appliedPpm).toBe(0);
    expect(result.provisional).toBe(true);
  });

  it('wait-or-fail: no correction computed and the result is blocking + provisional', () => {
    const policy: AtmosphericPolicy = { ...cyclePolicyMissing, missingPolicy: 'wait-or-fail' };
    const result = resolveAtmosphericPpm(policy, EPOCH, []);
    expect(result.source).toBe('missing-blocking');
    expect(result.blocking).toBe(true);
    expect(result.provisional).toBe(true);
    expect(result.appliedPpm).toBe(0);
  });

  it('fixed mode with an invalid configured fixed T/P falls through to the missing policy', () => {
    const policy: AtmosphericPolicy = {
      ...basePolicy,
      mode: 'fixed-temperature-pressure',
      fixedTemperatureC: undefined,
      fixedPressureHPa: undefined,
      missingPolicy: 'wait-or-fail',
    };
    const result = resolveAtmosphericPpm(policy, EPOCH, []);
    expect(result.source).toBe('missing-blocking');
    expect(result.blocking).toBe(true);
  });

  it('never fabricates a result for wait-or-fail: appliedPpm/scale are the neutral no-op values', () => {
    const policy: AtmosphericPolicy = { ...cyclePolicyMissing, missingPolicy: 'wait-or-fail' };
    const result = resolveAtmosphericPpm(policy, EPOCH, []);
    expect(result.appliedPpm).toBe(0);
    expect(result.scale).toBe(1);
  });
});
