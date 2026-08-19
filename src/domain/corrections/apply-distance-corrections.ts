import type {
  AtmosphericPolicy,
  DistanceKind,
  RawObservation,
  ResolvedMeasurementSetup,
  ValueSource,
} from '@/domain/entities';
import { resolvePrismDelta } from '@/domain/corrections/prism';
import { resolveAtmosphericPpm, type AtmosphericSource, type EnvironmentReading } from '@/domain/corrections/atmosphere';
import { slopeDistanceFromInput } from '@/domain/corrections/distance-kind';

/**
 * Full, traced distance-correction chain (CORR-001..010; `docs/topographic-adjustment/DOMAIN-ARCHITECTURE-AND-RULES.md
 * §6`): `Sd` is a slope distance (CORR-001). The chain applies the reflector correction once
 * (CORR-003), then — unless already applied by the station — the atmospheric correction
 * (CORR-004), and produces a final slope distance ready for the future `.dat` builder. Every
 * value and its provenance are traceable per observation (CORR-006).
 */
export interface CorrectionTrace {
  observationId: string;
  stationCode: string;
  rawTargetName: string;

  storedSlopeDistanceM: number;
  /** What the stored variable held, and its raw value when a conversion took place (CORR-001). */
  distanceKind: DistanceKind;
  horizontalDistanceM?: number;
  prismDeltaM: number;
  distanceAfterPrismM: number;
  /** Provenance of the constants that produced `prismDeltaM`, copied from the resolved setup (MEAS-005). */
  requiredConstantSource?: ValueSource;
  alreadyAppliedConstantSource?: ValueSource;

  temperatureC?: number;
  pressureHPa?: number;
  atmosphericPpm: number;
  atmosphericScale: number;
  atmosphericSource: AtmosphericSource;
  envAgeMinutes?: number;
  /** Always present and displayable even when no atmospheric correction was computed (CORR-010). */
  formulaId: string;
  formulaVersion: number;

  finalSlopeDistanceM: number;

  /** True when the atmospheric result depends on a fallback/missing-data path (ATMO-006). */
  provisional: boolean;
  /** True only when the missing-T/P policy is `wait-or-fail` with no usable reading (ATMO-002). */
  blocking: boolean;
  /** Passed through from the policy so a later catch-up decision (T04) has the configured intent. */
  catchUpOnLateData: boolean;

  warnings: string[];
}

export interface ApplyDistanceCorrectionsResult {
  finalSlopeDistanceM: number;
  trace: CorrectionTrace;
}

export function applyDistanceCorrections(
  observation: RawObservation,
  setup: Pick<
    ResolvedMeasurementSetup,
    'measurementType' | 'requiredConstantM' | 'alreadyAppliedConstantM' | 'sourceByField' | 'distanceKind'
  >,
  atmosphericPolicy: AtmosphericPolicy,
  env: readonly EnvironmentReading[],
): ApplyDistanceCorrectionsResult {
  // 0. The stored variable may hold a horizontal distance: make it the slope distance the rest of
  //    the chain, the engine and the native file all expect (CORR-001). A sight too close to the
  //    vertical cannot be converted and is reported as blocking rather than approximated.
  const distanceKind = setup.distanceKind ?? 'slope';
  const slope = slopeDistanceFromInput({
    distanceM: observation.sdM,
    zenithDeg: observation.vzDeg,
    kind: distanceKind,
  });
  const storedSlopeDistanceM = slope.ok ? slope.slopeDistanceM : observation.sdM;

  // 1. Reflector correction — applied exactly once, as a differential (CORR-002/003/005/009).
  const prismDeltaM = resolvePrismDelta(setup);
  const distanceAfterPrismM = storedSlopeDistanceM + prismDeltaM;

  // 2. Atmospheric correction — applied after the reflector correction (CORR-004), never
  //    derived into/from `.SCALE` (CORR-007): note this function never touches a
  //    StarNetAdjustmentConfig at all.
  const atmo = resolveAtmosphericPpm(atmosphericPolicy, observation.epoch, env);
  const finalSlopeDistanceM = distanceAfterPrismM * atmo.scale;

  const trace: CorrectionTrace = {
    observationId: observation.id,
    stationCode: observation.stationCode,
    rawTargetName: observation.rawTargetName,

    storedSlopeDistanceM,
    distanceKind,
    ...(slope.ok && slope.converted ? { horizontalDistanceM: observation.sdM } : {}),
    prismDeltaM,
    distanceAfterPrismM,
    requiredConstantSource: setup.sourceByField['requiredConstantM'],
    alreadyAppliedConstantSource: setup.sourceByField['alreadyAppliedConstantM'],

    temperatureC: atmo.temperatureC,
    pressureHPa: atmo.pressureHPa,
    atmosphericPpm: atmo.appliedPpm,
    atmosphericScale: atmo.scale,
    atmosphericSource: atmo.source,
    envAgeMinutes: atmo.ageMinutes,
    formulaId: atmosphericPolicy.formulaId,
    formulaVersion: atmosphericPolicy.formulaVersion,

    finalSlopeDistanceM,

    provisional: atmo.provisional,
    blocking: atmo.blocking || !slope.ok,
    catchUpOnLateData: atmosphericPolicy.catchUpOnLateData,

    warnings: slope.ok ? atmo.warnings : [slope.reason, ...atmo.warnings],
  };

  return { finalSlopeDistanceM, trace };
}
