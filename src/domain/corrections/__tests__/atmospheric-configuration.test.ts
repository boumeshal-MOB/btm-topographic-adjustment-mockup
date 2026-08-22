import { describe, expect, it } from 'vitest';
import type { AtmosphericPolicy } from '@/domain/entities';
import {
  DEFAULT_FIXED_PRESSURE_HPA,
  DEFAULT_FIXED_TEMPERATURE_C,
  atmosphericPolicyIssues,
  resolveAtmosphericPpm,
  withAtmosphericDefaults,
} from '@/domain/corrections/atmosphere';

/**
 * The bug these cover: the Instruments screen rendered `?? 12` and `?? 1013.25` over a policy that
 * held `undefined`, so a station switched to a fixed atmosphere *looked* configured and every slot
 * failed with "Configured fixed T/P is missing or invalid". A default a user can read has to be a
 * default the run has.
 */
const policy = (over: Partial<AtmosphericPolicy> = {}): AtmosphericPolicy => ({
  mode: 'fixed-temperature-pressure',
  missingPolicy: 'wait-or-fail',
  marksResultProvisional: false,
  formulaId: 'standard-ppm-v1',
  formulaVersion: 1,
  ...over,
});

describe('atmospheric configuration', () => {
  it('writes the proposed atmosphere when the mode needs one', () => {
    const seeded = withAtmosphericDefaults(policy());
    expect(seeded.fixedTemperatureC).toBe(DEFAULT_FIXED_TEMPERATURE_C);
    expect(seeded.fixedPressureHPa).toBe(DEFAULT_FIXED_PRESSURE_HPA);
  });

  it('never overwrites a value the user stated', () => {
    const seeded = withAtmosphericDefaults(policy({ fixedTemperatureC: 30, fixedPressureHPa: 950 }));
    expect(seeded.fixedTemperatureC).toBe(30);
    expect(seeded.fixedPressureHPa).toBe(950);
  });

  it('writes a fallback atmosphere only when the missing-data policy uses one', () => {
    const withFallback = withAtmosphericDefaults(policy({ missingPolicy: 'fixed-fallback' }));
    expect(withFallback.fallbackTemperatureC).toBe(DEFAULT_FIXED_TEMPERATURE_C);

    const without = withAtmosphericDefaults(policy({ missingPolicy: 'continue-without-correction' }));
    expect(without.fallbackTemperatureC).toBeUndefined();
  });

  it('seeds nothing for a mode that reads no atmosphere', () => {
    const seeded = withAtmosphericDefaults(policy({ mode: 'already-applied' }));
    expect(seeded.fixedTemperatureC).toBeUndefined();
    expect(seeded.fixedPressureHPa).toBeUndefined();
  });

  it('reports a fixed mode with no atmosphere as a configuration error', () => {
    expect(atmosphericPolicyIssues(policy(), 'SYN_A')).toHaveLength(1);
    expect(atmosphericPolicyIssues(policy(), 'SYN_A')[0]).toContain('SYN_A');
    expect(atmosphericPolicyIssues(withAtmosphericDefaults(policy()), 'SYN_A')).toEqual([]);
  });

  it('reports a fallback policy with no fallback atmosphere', () => {
    const cleared = policy({
      mode: 'cycle-temperature-pressure',
      missingPolicy: 'fixed-fallback',
      variables: { temporalToleranceMinutes: 15 },
    });
    expect(atmosphericPolicyIssues(cleared, 'SYN_B')).toHaveLength(1);
    expect(atmosphericPolicyIssues(withAtmosphericDefaults(cleared), 'SYN_B')).toEqual([]);
  });

  /**
   * The end of the chain, asserted so the fix cannot be undone without a red test: an unseeded
   * fixed policy really did block, and a seeded one really does correct.
   */
  it('is the difference between a blocked slot and an applied correction', () => {
    const unseeded = resolveAtmosphericPpm(policy(), '2025-06-02T10:00:00.000Z', []);
    expect(unseeded.blocking).toBe(true);
    expect(unseeded.warnings.join(' ')).toContain('missing or invalid');

    const seeded = resolveAtmosphericPpm(withAtmosphericDefaults(policy()), '2025-06-02T10:00:00.000Z', []);
    expect(seeded.blocking).toBe(false);
    expect(seeded.source).toBe('fixed');
    expect(seeded.temperatureC).toBe(DEFAULT_FIXED_TEMPERATURE_C);
  });
});
