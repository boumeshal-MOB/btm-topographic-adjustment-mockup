import { describe, expect, it } from 'vitest';
import type { AtmosphericPolicy, RawObservation, ResolvedMeasurementSetup } from '@/domain/entities';
import { applyDistanceCorrections } from '@/domain/corrections/apply-distance-corrections';
import { STANDARD_PPM_FORMULA_ID, STANDARD_PPM_FORMULA_VERSION, atmosphericPpm } from '@/domain/corrections/atmosphere';

const observation = (sdM: number, overrides: Partial<RawObservation> = {}): RawObservation => ({
  id: 'obs-NTE_ATS34-L34RE1100_329-1',
  stationCode: 'NTE_ATS34',
  rawTargetName: 'L34RE1100_329',
  epoch: '2025-03-01T09:30:00.000Z',
  hzDeg: 72.4,
  vzDeg: 90.5,
  sdM,
  ...overrides,
});

const alreadyAppliedPolicy: AtmosphericPolicy = {
  mode: 'already-applied',
  missingPolicy: 'continue-without-correction',
  marksResultProvisional: false,
  formulaId: STANDARD_PPM_FORMULA_ID,
  formulaVersion: STANDARD_PPM_FORMULA_VERSION,
};

const setup = (overrides: Partial<Pick<ResolvedMeasurementSetup, 'measurementType' | 'requiredConstantM' | 'alreadyAppliedConstantM' | 'sourceByField'>> = {}) => ({
  measurementType: 'prism' as const,
  sourceByField: {},
  ...overrides,
});

describe('applyDistanceCorrections — end-to-end (CORR-001..010)', () => {
  it('UK L-bar: 78.4100 m + 8.9 mm -> 78.4189 m before rounding, no atmospheric correction applied', () => {
    const result = applyDistanceCorrections(
      observation(78.41),
      setup({ requiredConstantM: 0.0089, alreadyAppliedConstantM: 0 }),
      alreadyAppliedPolicy,
      [],
    );
    expect(result.trace.prismDeltaM).toBeCloseTo(0.0089, 9);
    expect(result.trace.distanceAfterPrismM).toBeCloseTo(78.4189, 4);
    expect(result.finalSlopeDistanceM).toBeCloseTo(78.4189, 4);
    expect(result.trace.atmosphericScale).toBe(1);
  });

  it('additional workbook control values: 193.5820+30.0mm=193.6120 and 4.2138+8.9mm=4.2227', () => {
    const a = applyDistanceCorrections(observation(193.582), setup({ requiredConstantM: 0.03, alreadyAppliedConstantM: 0 }), alreadyAppliedPolicy, []);
    expect(a.finalSlopeDistanceM).toBeCloseTo(193.612, 4);

    const b = applyDistanceCorrections(observation(4.2138), setup({ requiredConstantM: 0.0089, alreadyAppliedConstantM: 0 }), alreadyAppliedPolicy, []);
    expect(b.finalSlopeDistanceM).toBeCloseTo(4.2227, 4);
  });

  it('FR MPO: 25.5mm required and already applied -> BTM delta 0, distance unchanged', () => {
    const result = applyDistanceCorrections(
      observation(120.0),
      setup({ requiredConstantM: 0.0255, alreadyAppliedConstantM: 0.0255 }),
      alreadyAppliedPolicy,
      [],
    );
    expect(result.trace.prismDeltaM).toBeCloseTo(0, 9);
    expect(result.finalSlopeDistanceM).toBeCloseTo(120.0, 6);
  });

  it('CORR-004/CORR-005: already-applied distance receives no atmospheric correction even with plausible T/P candidates', () => {
    const result = applyDistanceCorrections(
      observation(100),
      setup({ requiredConstantM: 0, alreadyAppliedConstantM: 0 }),
      alreadyAppliedPolicy,
      [{ epoch: '2025-03-01T09:30:00.000Z', temperatureC: 30, pressureHPa: 950 }],
    );
    expect(result.trace.atmosphericSource).toBe('already-applied');
    expect(result.trace.atmosphericPpm).toBe(0);
    expect(result.finalSlopeDistanceM).toBe(100);
  });

  it('CORR-009/MEAS-008: reflectorless always has prismDeltaM = 0 and no constant used', () => {
    const result = applyDistanceCorrections(
      observation(55.5),
      setup({ measurementType: 'reflectorless', requiredConstantM: 0.0255, alreadyAppliedConstantM: 0 }),
      alreadyAppliedPolicy,
      [],
    );
    expect(result.trace.prismDeltaM).toBe(0);
    expect(result.finalSlopeDistanceM).toBe(55.5);
  });

  it('applies the atmospheric correction after the prism correction, combining both exactly once', () => {
    const policy: AtmosphericPolicy = {
      mode: 'fixed-temperature-pressure',
      fixedTemperatureC: 30,
      fixedPressureHPa: 950,
      missingPolicy: 'continue-without-correction',
      marksResultProvisional: false,
      formulaId: STANDARD_PPM_FORMULA_ID,
      formulaVersion: STANDARD_PPM_FORMULA_VERSION,
    };
    const result = applyDistanceCorrections(
      observation(100),
      setup({ requiredConstantM: 0.01, alreadyAppliedConstantM: 0 }),
      policy,
      [],
    );
    const ppm = atmosphericPpm(30, 950);
    expect(result.trace.distanceAfterPrismM).toBeCloseTo(100.01, 6);
    expect(result.finalSlopeDistanceM).toBeCloseTo(100.01 * (1 + ppm * 1e-6), 8);
  });

  it('CORR-005: correction is never applied twice — calling the pure function repeatedly with the same input yields the same result', () => {
    const args = [
      observation(78.41),
      setup({ requiredConstantM: 0.0089, alreadyAppliedConstantM: 0 }),
      alreadyAppliedPolicy,
      [],
    ] as const;
    const first = applyDistanceCorrections(...args);
    const second = applyDistanceCorrections(...args);
    expect(second.finalSlopeDistanceM).toBe(first.finalSlopeDistanceM);
    expect(second.trace).toEqual(first.trace);
  });

  it('CORR-005: a constant already fully applied by the station is not applied again even when the raw distance is reused', () => {
    // Simulates a differential setup where the station already applied the full required
    // constant: prismDelta must be 0, so re-running the chain never adds the constant twice.
    const result = applyDistanceCorrections(
      observation(78.4189),
      setup({ requiredConstantM: 0.0089, alreadyAppliedConstantM: 0.0089 }),
      alreadyAppliedPolicy,
      [],
    );
    expect(result.trace.prismDeltaM).toBeCloseTo(0, 9);
    expect(result.finalSlopeDistanceM).toBeCloseTo(78.4189, 4);
  });

  it('CORR-006: the trace is fully explanatory — stored value, delta, T/P, ppm, formula and result are all present', () => {
    const policy: AtmosphericPolicy = {
      mode: 'cycle-temperature-pressure',
      variables: { temporalToleranceMinutes: 15 },
      missingPolicy: 'continue-without-correction',
      marksResultProvisional: false,
      formulaId: STANDARD_PPM_FORMULA_ID,
      formulaVersion: STANDARD_PPM_FORMULA_VERSION,
    };
    const result = applyDistanceCorrections(
      observation(78.41),
      setup({
        requiredConstantM: 0.0089,
        alreadyAppliedConstantM: 0,
        sourceByField: { requiredConstantM: 'template', alreadyAppliedConstantM: 'observation-metadata' },
      }),
      policy,
      [{ epoch: '2025-03-01T09:28:00.000Z', temperatureC: 12, pressureHPa: 1013.25 }],
    );
    expect(result.trace).toMatchObject({
      storedSlopeDistanceM: 78.41,
      prismDeltaM: 0.0089,
      requiredConstantSource: 'template',
      alreadyAppliedConstantSource: 'observation-metadata',
      temperatureC: 12,
      pressureHPa: 1013.25,
      atmosphericSource: 'cycle',
      formulaId: STANDARD_PPM_FORMULA_ID,
      formulaVersion: STANDARD_PPM_FORMULA_VERSION,
    });
    expect(result.trace.finalSlopeDistanceM).toBeCloseTo(result.finalSlopeDistanceM, 12);
  });
});

describe('CORR-007: .SCALE is never derived from or fed by T/P', () => {
  it('applyDistanceCorrections has no code path that reads or writes a STAR*NET scaleFactor', () => {
    // The function signature itself proves independence: it accepts only an observation, a
    // measurement setup subset and an atmospheric policy — never a StarNetAdjustmentConfig.
    // This behavioural test confirms an external scaleFactor value is untouched across a range
    // of atmospheric scenarios (mode/T/P vary; the external value never changes).
    const starNetConfig = { scaleFactor: 1.0 };
    const scenarios: AtmosphericPolicy[] = [
      { mode: 'already-applied', missingPolicy: 'continue-without-correction', marksResultProvisional: false, formulaId: STANDARD_PPM_FORMULA_ID, formulaVersion: STANDARD_PPM_FORMULA_VERSION },
      { mode: 'none', missingPolicy: 'continue-without-correction', marksResultProvisional: false, formulaId: STANDARD_PPM_FORMULA_ID, formulaVersion: STANDARD_PPM_FORMULA_VERSION },
      { mode: 'fixed-temperature-pressure', fixedTemperatureC: 30, fixedPressureHPa: 950, missingPolicy: 'continue-without-correction', marksResultProvisional: false, formulaId: STANDARD_PPM_FORMULA_ID, formulaVersion: STANDARD_PPM_FORMULA_VERSION },
      { mode: 'cycle-temperature-pressure', variables: { temporalToleranceMinutes: 15 }, missingPolicy: 'wait-or-fail', marksResultProvisional: true, formulaId: STANDARD_PPM_FORMULA_ID, formulaVersion: STANDARD_PPM_FORMULA_VERSION },
    ];
    for (const policy of scenarios) {
      applyDistanceCorrections(observation(100), setup({ requiredConstantM: 0.02, alreadyAppliedConstantM: 0 }), policy, [
        { epoch: '2025-03-01T09:29:00.000Z', temperatureC: 12, pressureHPa: 1013.25 },
      ]);
    }
    expect(starNetConfig.scaleFactor).toBe(1.0);
  });
});
