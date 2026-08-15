import type { EnvironmentReading } from '@/domain/corrections/atmosphere';
import type { AtmosphericMode, ConstraintMode, MeasurementType, RawObservation, TargetRole } from '@/domain/entities';
import { DEG2RAD, RAD2DEG, circularMean, normalizeFace, wrapTwoPi } from '@/domain/math/geometry';
import { datasetIdentity, type DatasetIdentity } from '@/domain/validation-catalogue/identity';
import type {
  ValidationDataset,
  ValidationObservation,
  ValidationTargetBinding,
} from '@/domain/validation-catalogue/schema';

/**
 * Converts a generated validation dataset into the contracts the mock-up already uses
 * (`RawObservation`, catalogue metadata, draft proposals).
 *
 * The rule this module follows: **no parallel scientific path**. Nothing here adjusts, weights or
 * corrects anything — that stays in the validated engines downstream. The adapter only restates
 * dataset facts in the shapes the existing repositories expect, and the mapping is deliberately
 * literal so a defect injected by the generator survives into the app instead of being smoothed
 * away here.
 *
 * The single acquisition-level reduction it performs is the Face I/II pairing described below,
 * because `RawObservation` has no face dimension and BTM's `raw_data` stores measurements that
 * were already reduced upstream. It reuses the validated `normalizeFace`/`circularMean`
 * primitives rather than introducing a formula.
 */

// ---------------------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------------------

/**
 * How Face I/II pairs of one target inside one cycle become a single stored measurement.
 *
 * `none` is the default because it reproduces acquisition that never reduced the pair — which is
 * exactly the `face-i-ii` defect family. Switching to `mean-of-faces` is the corrective action a
 * surveyor takes, and makes the collimation/index error cancel.
 */
export type FaceReductionPolicy = 'none' | 'mean-of-faces';

export interface ValidationImportOptions {
  faceReduction: FaceReductionPolicy;
}

export const DEFAULT_IMPORT_OPTIONS: ValidationImportOptions = { faceReduction: 'none' };

// ---------------------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------------------

export interface ValidationStationPlan {
  stationId: number;
  stationCode: string;
  instrumentHeightM: number;
  approxEastingM: number;
  approxNorthingM: number;
  approxHeightM: number;
  orientationDeg: number;
  atmosphericMode: AtmosphericMode;
  missingPolicy: string;
  formulaId: string;
  hasEnvironmentVariables: boolean;
  angleSigmaArcSec: number;
  distanceSigmaMm: number;
  distancePpm: number;
  instrumentLabel: string;
}

export interface ValidationTargetPlan {
  stationCode: string;
  rawTargetName: string;
  bindingId: string;
  physicalPointId: string;
  role: TargetRole;
  measurementType: MeasurementType;
  edmMode: string;
  reflector: string;
  requiredConstantM: number;
  alreadyAppliedConstantM: number;
  targetHeightM: number;
  distanceStdErrMm: number;
  distancePpm: number;
  prismSensorId: number;
  hzVariableId: number;
  vzVariableId: number;
  sdVariableId: number;
  /** True when the stored distance is horizontal — a convention, surfaced, never auto-converted. */
  storedAsHorizontalDistance: boolean;
}

export interface ValidationReferencePlan {
  physicalPointId: string;
  /** Identifies the target whose engine name will carry the constraint. */
  stationCode: string;
  rawTargetName: string;
  eastingM: number;
  northingM: number;
  heightM: number;
  modeE: ConstraintMode;
  modeN: ConstraintMode;
  modeH: ConstraintMode;
  sigmaM: number;
}

export interface ValidationSharedPointPlan {
  key: string;
  physicalPointId: string;
  members: { stationCode: string; rawTargetName: string }[];
}

export interface ValidationImportPlan {
  datasetId: string;
  presetId: 'uk-supplied-hs2-nte' | 'fr-starnet-monitoring';
  template: 'UK' | 'FR';
  scope: 'single-station' | 'network';
  options: ValidationImportOptions;
  stations: ValidationStationPlan[];
  targets: ValidationTargetPlan[];
  references: ValidationReferencePlan[];
  sharedPoints: ValidationSharedPointPlan[];
  /**
   * Plain records rather than Maps: the plan is a transport contract. It travels
   * UI → API → MSW → DemoStore like every other payload in the mock-up, so it has to survive
   * `JSON.stringify` without a custom serialiser.
   */
  initialCoordinates: Record<string, { eastingM: number; northingM: number; heightM: number }>;
  observationsByStation: Record<string, RawObservation[]>;
  envByStation: Record<string, EnvironmentReading[]>;
  epochs: { kind: string; timestamp: string }[];
  /** Full observation window across the three epochs. */
  window: { from: string; to: string };
  identity: DatasetIdentity;
  /** True when the dataset carries Face II observations, so the option is worth offering. */
  hasFaceTwoObservations: boolean;
  /** Diagnostics about what the conversion had to skip; surfaced, never swallowed. */
  conversionWarnings: string[];
}

// ---------------------------------------------------------------------------------------
// Deterministic id allocation
// ---------------------------------------------------------------------------------------

/**
 * Validation ids live in their own high numeric range so they can never collide with the
 * compatibility fixtures (101/102, 201, 301-303 and their 1000+ sensor ids).
 */
const VALIDATION_STATION_ID_BASE = 900_000;
const VALIDATION_SENSOR_ID_BASE = 2_000_000;

export function datasetOrdinal(datasetId: string): number {
  const match = /^BTM-VAL-(\d{3})$/.exec(datasetId);
  if (!match) throw new Error(`Not a validation dataset id: ${datasetId}`);
  return Number(match[1]);
}

// ---------------------------------------------------------------------------------------
// Face reduction
// ---------------------------------------------------------------------------------------

/**
 * Reduces the observations of one (station, target, cycle) group to a single stored measurement.
 *
 * With `none`, Face II readings are dropped and only Face I is stored: the pair was never reduced,
 * so any collimation/index error stays in the data. With `mean-of-faces`, Face II is normalized to
 * the Face I convention (`.NORMALIZE ON` semantics) and averaged circularly, which cancels it.
 */
export function reduceFaceGroup(
  group: ValidationObservation[],
  policy: FaceReductionPolicy,
): { hzDeg: number; vzDeg: number; distanceM: number; usedFaces: number[] } | undefined {
  if (group.length === 0) return undefined;
  const faceOne = group.filter((observation) => observation.face === 1);

  if (policy === 'none') {
    const chosen = faceOne[0] ?? group[0];
    return {
      hzDeg: chosen.hzDeg,
      vzDeg: chosen.vzDeg,
      distanceM: chosen.storedDistanceM,
      usedFaces: [chosen.face],
    };
  }

  const normalized = group.map((observation) => {
    const { hzRad, vzRad } = normalizeFace(observation.hzDeg * DEG2RAD, observation.vzDeg * DEG2RAD);
    return { hzRad, vzRad, distanceM: observation.storedDistanceM, face: observation.face };
  });
  const hzRad = circularMean(normalized.map((item) => item.hzRad));
  const vzRad = circularMean(normalized.map((item) => item.vzRad));
  if (hzRad === undefined || vzRad === undefined) return undefined;
  return {
    hzDeg: wrapTwoPi(hzRad) * RAD2DEG,
    vzDeg: wrapTwoPi(vzRad) * RAD2DEG,
    distanceM: normalized.reduce((sum, item) => sum + item.distanceM, 0) / normalized.length,
    usedFaces: [...new Set(normalized.map((item) => item.face))].sort(),
  };
}

/**
 * Groups a station's observations into acquisition cycles.
 *
 * The generator emits three cycles per dataset (baseline / incident / verification) whose members
 * are seconds apart, so `epochKind` is the authoritative grouping key — no time heuristic needed.
 */
function groupByCycleAndBinding(
  observations: ValidationObservation[],
): Map<string, ValidationObservation[]> {
  const groups = new Map<string, ValidationObservation[]>();
  for (const observation of observations) {
    const key = `${observation.epochKind}|${observation.bindingId}`;
    const members = groups.get(key) ?? [];
    members.push(observation);
    groups.set(key, members);
  }
  return groups;
}

// ---------------------------------------------------------------------------------------
// Plan construction
// ---------------------------------------------------------------------------------------

const PRESET_BY_TEMPLATE = {
  UK: 'uk-supplied-hs2-nte',
  FR: 'fr-starnet-monitoring',
} as const;

/** Physical point id -> stable, human-usable shared point key. */
function sharedPointKey(physicalPointId: string): string {
  return physicalPointId.replace(/[^A-Za-z0-9_]/g, '_');
}

export function buildImportPlan(
  dataset: ValidationDataset,
  template: 'UK' | 'FR',
  options: ValidationImportOptions = DEFAULT_IMPORT_OPTIONS,
): ValidationImportPlan {
  const ordinal = datasetOrdinal(dataset.id);
  const conversionWarnings: string[] = [];

  const setupById = new Map(dataset.measurementSetups.map((setup) => [setup.id, setup]));
  const bindingById = new Map(dataset.targetBindings.map((binding) => [binding.id, binding]));
  const policyByStation = new Map(dataset.configuredPolicies.map((policy) => [policy.stationId, policy]));

  const envByStationId = new Map<string, EnvironmentReading[]>();
  for (const reading of dataset.environmentReadings) {
    if (!reading.valid) continue;
    const list = envByStationId.get(reading.stationId) ?? [];
    list.push({
      epoch: reading.epoch,
      temperatureC: reading.temperatureC,
      pressureHPa: reading.pressureHPa,
    });
    envByStationId.set(reading.stationId, list);
  }

  // --- stations -------------------------------------------------------------------------
  const stations: ValidationStationPlan[] = dataset.stations.map((station, index) => {
    const policy = policyByStation.get(station.id);
    return {
      stationId: VALIDATION_STATION_ID_BASE + ordinal * 10 + index,
      stationCode: station.stationCode,
      instrumentHeightM: station.instrumentHeightM,
      approxEastingM: station.coordinates.e,
      approxNorthingM: station.coordinates.n,
      approxHeightM: station.coordinates.h,
      orientationDeg: station.orientationDeg,
      atmosphericMode: (policy?.mode ?? 'none') as AtmosphericMode,
      missingPolicy: policy?.missingPolicy ?? 'continue-without-correction',
      formulaId: policy?.formulaId ?? 'standard-dry-air-ppm-v1',
      hasEnvironmentVariables: (envByStationId.get(station.id)?.length ?? 0) > 0,
      angleSigmaArcSec: station.instrument.angleSigmaArcSec,
      distanceSigmaMm: station.instrument.distanceSigmaMm,
      distancePpm: station.instrument.distancePpm,
      instrumentLabel: `${station.instrument.manufacturer} ${station.instrument.model}`,
    };
  });
  const stationPlanById = new Map(dataset.stations.map((station, index) => [station.id, stations[index]]));

  // --- targets --------------------------------------------------------------------------
  const horizontalBindingIds = new Set(
    dataset.observations
      .filter((observation) => observation.storedDistanceKind === 'horizontal')
      .map((observation) => observation.bindingId),
  );

  const targets: ValidationTargetPlan[] = dataset.targetBindings.map((binding, index) => {
    const stationPlan = stationPlanById.get(binding.stationId);
    const setup = setupById.get(binding.measurementSetupId);
    if (!stationPlan) throw new Error(`${dataset.id}: binding ${binding.id} references unknown station ${binding.stationId}`);
    if (!setup) throw new Error(`${dataset.id}: binding ${binding.id} references unknown setup ${binding.measurementSetupId}`);
    const sensorId = VALIDATION_SENSOR_ID_BASE + ordinal * 1_000 + index;
    return {
      stationCode: stationPlan.stationCode,
      rawTargetName: binding.rawTargetName,
      bindingId: binding.id,
      physicalPointId: binding.physicalPointId,
      role: binding.role,
      measurementType: setup.measurementType,
      edmMode: setup.edmMode,
      // A reflectorless setup has no reflector and no constant: the delta is zero by definition
      // (CALC-003), so a missing value is a real zero here, not an unknown to guess later.
      reflector: setup.reflector ?? 'none (reflectorless)',
      requiredConstantM: setup.requiredConstantM ?? 0,
      alreadyAppliedConstantM: setup.alreadyAppliedConstantM ?? 0,
      targetHeightM: binding.targetHeightM,
      distanceStdErrMm: stationPlan.distanceSigmaMm,
      distancePpm: stationPlan.distancePpm,
      prismSensorId: sensorId,
      hzVariableId: sensorId * 10 + 1,
      vzVariableId: sensorId * 10 + 2,
      sdVariableId: sensorId * 10 + 3,
      storedAsHorizontalDistance: horizontalBindingIds.has(binding.id),
    };
  });
  const targetByBindingId = new Map(targets.map((target) => [target.bindingId, target]));

  // --- observations ---------------------------------------------------------------------
  const observationsByStation: Record<string, RawObservation[]> = {};
  const groups = groupByCycleAndBinding(dataset.observations);
  for (const [, group] of groups) {
    const first = group[0];
    const binding = bindingById.get(first.bindingId);
    const stationPlan = stationPlanById.get(first.stationId);
    if (!binding || !stationPlan) {
      conversionWarnings.push(`Observation ${first.id} references an unknown binding or station and was skipped.`);
      continue;
    }
    const reduced = reduceFaceGroup(group, options.faceReduction);
    if (!reduced) {
      conversionWarnings.push(`Observation group ${first.bindingId}/${first.epochKind} could not be reduced and was skipped.`);
      continue;
    }
    // The Face I reading carries the cycle's canonical epoch; a reduced pair keeps the earliest.
    const epoch = group.map((observation) => observation.epoch).sort()[0];
    const list = observationsByStation[stationPlan.stationCode] ?? [];
    list.push({
      id: first.id,
      stationCode: stationPlan.stationCode,
      rawTargetName: binding.rawTargetName,
      epoch,
      hzDeg: reduced.hzDeg,
      vzDeg: reduced.vzDeg,
      sdM: reduced.distanceM,
    });
    observationsByStation[stationPlan.stationCode] = list;
  }
  for (const list of Object.values(observationsByStation)) {
    list.sort((left, right) => left.epoch.localeCompare(right.epoch) || left.rawTargetName.localeCompare(right.rawTargetName));
  }

  // --- references -----------------------------------------------------------------------
  // One constraint per physical point: a shared reference observed from several stations resolves
  // to a single engine unknown, so repeating its constraint per station would double-count it.
  const bindingsByPoint = new Map<string, ValidationTargetBinding[]>();
  for (const binding of dataset.targetBindings) {
    const list = bindingsByPoint.get(binding.physicalPointId) ?? [];
    list.push(binding);
    bindingsByPoint.set(binding.physicalPointId, list);
  }
  const references: ValidationReferencePlan[] = [];
  const seenReferencePoints = new Set<string>();
  for (const constraint of dataset.referenceConstraints) {
    if (seenReferencePoints.has(constraint.physicalPointId)) continue;
    const candidates = bindingsByPoint.get(constraint.physicalPointId) ?? [];
    const binding = candidates.find((item) => item.stationId === constraint.stationId) ?? candidates[0];
    if (!binding) {
      conversionWarnings.push(`Reference ${constraint.physicalPointId} is constrained but never observed; it was skipped.`);
      continue;
    }
    const target = targetByBindingId.get(binding.id);
    if (!target) continue;
    seenReferencePoints.add(constraint.physicalPointId);
    references.push({
      physicalPointId: constraint.physicalPointId,
      stationCode: target.stationCode,
      rawTargetName: target.rawTargetName,
      eastingM: constraint.coordinates.e,
      northingM: constraint.coordinates.n,
      heightM: constraint.coordinates.h,
      modeE: constraint.constraint.e,
      modeN: constraint.constraint.n,
      modeH: constraint.constraint.h,
      // The engine carries one sigma per reference point; the largest component is the safe choice.
      sigmaM: Math.max(constraint.sigmaMm.e, constraint.sigmaMm.n, constraint.sigmaMm.h) / 1000,
    });
  }

  // --- identity -------------------------------------------------------------------------
  const identity = datasetIdentity(dataset);
  const sharedPoints: ValidationSharedPointPlan[] = identity.sharedPoints.map((group) => ({
    key: sharedPointKey(group.physicalPointId),
    physicalPointId: group.physicalPointId,
    members: group.members.map((member) => {
      const target = targetByBindingId.get(member.id);
      return {
        stationCode: target?.stationCode ?? member.stationId,
        rawTargetName: member.rawTargetName,
      };
    }),
  }));

  const initialCoordinates: ValidationImportPlan['initialCoordinates'] = {};
  for (const coordinate of dataset.initialCoordinates) {
    initialCoordinates[coordinate.physicalPointId] = {
      eastingM: coordinate.e,
      northingM: coordinate.n,
      heightM: coordinate.h,
    };
  }

  const envByStation: Record<string, EnvironmentReading[]> = {};
  for (const [stationId, readings] of envByStationId) {
    const stationPlan = stationPlanById.get(stationId);
    if (!stationPlan) continue;
    envByStation[stationPlan.stationCode] = [...readings]
      .sort((left, right) => left.epoch.localeCompare(right.epoch));
  }

  const allEpochs = dataset.observations.map((observation) => observation.epoch).sort();

  return {
    datasetId: dataset.id,
    presetId: PRESET_BY_TEMPLATE[template],
    template,
    scope: dataset.stations.length > 1 ? 'network' : 'single-station',
    options,
    stations,
    targets,
    references,
    sharedPoints,
    initialCoordinates,
    observationsByStation,
    envByStation,
    epochs: dataset.epochs.map((epoch) => ({ kind: epoch.kind, timestamp: epoch.timestamp })),
    window: { from: allEpochs[0] ?? '', to: allEpochs.at(-1) ?? '' },
    identity,
    hasFaceTwoObservations: dataset.observations.some((observation) => observation.face === 2),
    conversionWarnings,
  };
}
