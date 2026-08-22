import type { AtmosphericPolicy } from '@/domain/entities';

/**
 * Atmospheric EDM correction (ATMO-001..006, CORR-004/005/007/008/010).
 *
 * Formula `standard-ppm-v1` (`docs/topographic-adjustment/DOMAINE-ET-STARNET.md`):
 * `ppm = 281.8 − 0.29065 × P_hPa / (1 + T_C / 273.15)`, `scale = 1 + ppm × 10⁻⁶`.
 * This is a documented demo/reference formula, never presented as an instrument-manufacturer
 * model (CORR-010: it has a stable id/version, `STANDARD_PPM_FORMULA_ID`/`_VERSION`, shown in
 * every trace regardless of whether it was actually applied).
 *
 * This module never reads or writes STAR*NET `.SCALE`/`scaleFactor` (CORR-007): `.SCALE` is a
 * horizontal datum/grid factor applied by the future `.dat` builder, not an atmospheric EDM
 * correction, and no function here accepts or returns a `StarNetAdjustmentConfig`.
 */

export const STANDARD_PPM_FORMULA_ID = 'standard-ppm-v1';
export const STANDARD_PPM_FORMULA_VERSION = 1;

/**
 * The coefficients of `standard-ppm-v1`, named so that a screen can typeset the formula from the
 * same numbers the function computes with.
 *
 * A component that hard-codes `281.8` in its JSX is a second, silent definition of the formula:
 * change the coefficient here and the screen keeps displaying the old one, which is worse than no
 * display at all. Repository rule "no scientific formula inside a React component" (`CLAUDE.md`).
 */
export const STANDARD_PPM_COEFFICIENTS = {
  /** Group refractivity of the reference atmosphere, in ppm. */
  refractivityPpm: 281.8,
  /** Pressure coefficient, ppm per hectopascal. */
  pressurePerHPa: 0.29065,
  /** Absolute-zero offset of the Celsius scale, used as `1 + T / zeroCelsiusK`. */
  zeroCelsiusK: 273.15,
} as const;

export function atmosphericPpm(temperatureC: number, pressureHPa: number): number {
  const { refractivityPpm, pressurePerHPa, zeroCelsiusK } = STANDARD_PPM_COEFFICIENTS;
  return refractivityPpm - (pressurePerHPa * pressureHPa) / (1 + temperatureC / zeroCelsiusK);
}

/**
 * The atmosphere proposed when a station is switched to a fixed or fallback T/P.
 *
 * These are a convention — 12 °C at standard sea-level pressure — not a measurement, which is why
 * they are *written to the configuration* the moment the mode is chosen instead of being shown as a
 * placeholder. A screen that displayed `?? 12` while the policy held `undefined` announced an
 * atmosphere the run did not have: `isValidEnvironmentReading` rejected it, the missing-T/P policy
 * took over, and a `wait-or-fail` station failed the slot with "Configured fixed T/P is missing or
 * invalid" — for a field the user could read on screen.
 */
export const DEFAULT_FIXED_TEMPERATURE_C = 12;
export const DEFAULT_FIXED_PRESSURE_HPA = 1013.25;

/**
 * Fills in whatever the current mode and missing-data policy actually need, leaving everything the
 * user has already stated untouched. Pure, so the wizard can call it from a change handler and a
 * test can assert it without a screen.
 */
export function withAtmosphericDefaults(policy: AtmosphericPolicy): AtmosphericPolicy {
  const next = { ...policy };
  if (next.mode === 'fixed-temperature-pressure') {
    if (next.fixedTemperatureC === undefined) next.fixedTemperatureC = DEFAULT_FIXED_TEMPERATURE_C;
    if (next.fixedPressureHPa === undefined) next.fixedPressureHPa = DEFAULT_FIXED_PRESSURE_HPA;
  }
  const usesEnvironment = next.mode === 'cycle-temperature-pressure' || next.mode === 'fixed-temperature-pressure';
  if (usesEnvironment && next.missingPolicy === 'fixed-fallback') {
    if (next.fallbackTemperatureC === undefined) next.fallbackTemperatureC = DEFAULT_FIXED_TEMPERATURE_C;
    if (next.fallbackPressureHPa === undefined) next.fallbackPressureHPa = DEFAULT_FIXED_PRESSURE_HPA;
  }
  return next;
}

/**
 * What is missing before this policy can correct anything, in words a reviewer can act on.
 *
 * The wizard blocks on these instead of letting the run discover them: an atmosphere the
 * configuration does not hold is a configuration error, and finding it at Review costs a field,
 * while finding it at run time costs a published cycle.
 */
export function atmosphericPolicyIssues(policy: AtmosphericPolicy, stationLabel: string): string[] {
  const issues: string[] = [];
  if (policy.mode === 'fixed-temperature-pressure'
    && !isValidEnvironmentReading(policy.fixedTemperatureC, policy.fixedPressureHPa)) {
    issues.push(
      `Station ${stationLabel} corrects with a fixed atmosphere but no valid temperature/pressure is set`
      + ' (Instruments step): every slot would fail on missing T/P.',
    );
  }
  const usesEnvironment = policy.mode === 'cycle-temperature-pressure' || policy.mode === 'fixed-temperature-pressure';
  if (usesEnvironment && policy.missingPolicy === 'fixed-fallback'
    && !isValidEnvironmentReading(policy.fallbackTemperatureC, policy.fallbackPressureHPa)) {
    issues.push(
      `Station ${stationLabel} falls back to a fixed atmosphere when T/P is missing, but no valid`
      + ' fallback temperature/pressure is set (Instruments step).',
    );
  }
  return issues;
}

/** Physically plausible sensor range — rejects sentinels (e.g. -9999) and non-finite values (ATMO-004). */
export function isValidEnvironmentReading(temperatureC?: number, pressureHPa?: number): boolean {
  return (
    temperatureC !== undefined &&
    pressureHPa !== undefined &&
    Number.isFinite(temperatureC) &&
    Number.isFinite(pressureHPa) &&
    temperatureC >= -80 &&
    temperatureC <= 80 &&
    pressureHPa >= 300 &&
    pressureHPa <= 1200
  );
}

/** A single BTM T/P observation candidate for the cycle-lookup mode. */
export interface EnvironmentReading {
  epoch: string;
  temperatureC: number;
  pressureHPa: number;
}

export type AtmosphericSource =
  | 'already-applied'
  | 'cycle'
  | 'fixed'
  | 'fallback-fixed'
  | 'assumed-already-corrected'
  | 'none'
  | 'missing-blocking';

export interface AtmosphericResolution {
  appliedPpm: number;
  scale: number;
  temperatureC?: number;
  pressureHPa?: number;
  ageMinutes?: number;
  source: AtmosphericSource;
  /** True when the result depends on a fallback/missing-data path (ATMO-006). */
  provisional: boolean;
  /** True only for `wait-or-fail` with no usable T/P: the slot cannot be finalised yet (ATMO-002). */
  blocking: boolean;
  warnings: string[];
}

function toResolution(temperatureC: number, pressureHPa: number, source: AtmosphericSource, extra: Partial<AtmosphericResolution> = {}): AtmosphericResolution {
  const ppm = atmosphericPpm(temperatureC, pressureHPa);
  return {
    appliedPpm: ppm,
    scale: 1 + ppm * 1e-6,
    temperatureC,
    pressureHPa,
    source,
    provisional: false,
    blocking: false,
    warnings: [],
    ...extra,
  };
}

const NO_CORRECTION: Omit<AtmosphericResolution, 'source' | 'provisional' | 'blocking' | 'warnings'> = {
  appliedPpm: 0,
  scale: 1,
};

/** Nearest valid candidate within `toleranceMinutes` of `epoch`, or `undefined` if none qualifies. */
function findNearestValidReading(
  candidates: readonly EnvironmentReading[],
  epoch: string,
  toleranceMinutes: number,
): { reading: EnvironmentReading; ageMinutes: number } | undefined {
  const t0 = new Date(epoch).getTime();
  let best: { reading: EnvironmentReading; ageMinutes: number } | undefined;
  for (const candidate of candidates) {
    if (!isValidEnvironmentReading(candidate.temperatureC, candidate.pressureHPa)) continue;
    const ageMinutes = Math.abs(new Date(candidate.epoch).getTime() - t0) / 60000;
    if (ageMinutes > toleranceMinutes) continue;
    if (!best || ageMinutes < best.ageMinutes) best = { reading: candidate, ageMinutes };
  }
  return best;
}

/**
 * Resolves the missing/invalid-T/P policy (ATMO-002) — the four sub-policies of
 * `MissingEnvironmentPolicy`. Called whenever the primary mode (`cycle` or `fixed`) could not
 * produce a valid reading.
 */
function resolveMissingPolicy(policy: AtmosphericPolicy, reason: string): AtmosphericResolution {
  switch (policy.missingPolicy) {
    case 'fixed-fallback': {
      if (isValidEnvironmentReading(policy.fallbackTemperatureC, policy.fallbackPressureHPa)) {
        return toResolution(policy.fallbackTemperatureC as number, policy.fallbackPressureHPa as number, 'fallback-fixed', {
          provisional: policy.marksResultProvisional,
          warnings: [`${reason}; fixed fallback T/P used`],
        });
      }
      return {
        ...NO_CORRECTION,
        source: 'missing-blocking',
        provisional: true,
        blocking: true,
        warnings: [`${reason}; configured fallback T/P is also missing or invalid`],
      };
    }
    case 'continue-without-correction':
      return {
        ...NO_CORRECTION,
        source: 'none',
        provisional: policy.marksResultProvisional,
        blocking: false,
        warnings: [`${reason}; continuing without atmospheric correction`],
      };
    case 'assume-already-corrected':
      return {
        ...NO_CORRECTION,
        source: 'assumed-already-corrected',
        provisional: policy.marksResultProvisional,
        blocking: false,
        warnings: [`${reason}; distance assumed already corrected`],
      };
    case 'wait-or-fail':
      return {
        ...NO_CORRECTION,
        source: 'missing-blocking',
        provisional: true,
        blocking: true,
        warnings: [`${reason}; slot must wait or fail per configured policy`],
      };
  }
}

/**
 * Resolves the atmospheric ppm/scale to apply for one observation, given the station's
 * `AtmosphericPolicy` and a set of candidate T/P readings (used only by
 * `cycle-temperature-pressure`). Implements the four `AtmosphericMode` values (ATMO-001) and,
 * when T/P is missing/invalid, the four `MissingEnvironmentPolicy` values (ATMO-002).
 */
export function resolveAtmosphericPpm(
  policy: AtmosphericPolicy,
  epoch: string,
  candidates: readonly EnvironmentReading[],
): AtmosphericResolution {
  switch (policy.mode) {
    case 'already-applied':
      // CORR-005: a correction declared already applied by the station is never applied again.
      return { ...NO_CORRECTION, source: 'already-applied', provisional: false, blocking: false, warnings: [] };

    case 'none':
      return { ...NO_CORRECTION, source: 'none', provisional: false, blocking: false, warnings: [] };

    case 'fixed-temperature-pressure':
      if (isValidEnvironmentReading(policy.fixedTemperatureC, policy.fixedPressureHPa)) {
        return toResolution(policy.fixedTemperatureC as number, policy.fixedPressureHPa as number, 'fixed');
      }
      return resolveMissingPolicy(policy, 'Configured fixed T/P is missing or invalid');

    case 'cycle-temperature-pressure': {
      const toleranceMinutes = policy.variables?.temporalToleranceMinutes ?? 0;
      const found = findNearestValidReading(candidates, epoch, toleranceMinutes);
      if (found) {
        return toResolution(found.reading.temperatureC, found.reading.pressureHPa, 'cycle', {
          ageMinutes: found.ageMinutes,
        });
      }
      return resolveMissingPolicy(policy, `No T/P within ${toleranceMinutes} min of the observation epoch`);
    }
  }
}
