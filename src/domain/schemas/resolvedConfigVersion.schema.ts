import { z } from 'zod';
import {
  atmosphericModeSchema,
  autoAdjustConfigSchema,
  chiSquareStatusSchema,
  constraintModeSchema,
  geometricRelationshipTypeSchema,
  measurementTypeSchema,
  missingEnvironmentPolicySchema,
  outputPolicySchema,
  runPolicySchema,
  starNetWeightsSchema,
  targetRoleSchema,
} from '@/domain/schemas/common';

/**
 * `ResolvedAdjustmentConfigVersionSchema` (`configs/README.md`): strict — refuses any value
 * still missing before a test run or activation. Unlike `countryPresetSchema`, nothing here is
 * nullable: a resolved version is the immutable snapshot actually used by a run (VER-001).
 */

const environmentalVariableBindingSchema = z.object({
  temperatureVariableId: z.number().int().optional(),
  pressureVariableId: z.number().int().optional(),
  temporalToleranceMinutes: z.number().nonnegative(),
});

const atmosphericPolicySchema = z.object({
  mode: atmosphericModeSchema,
  variables: environmentalVariableBindingSchema.optional(),
  fixedTemperatureC: z.number().optional(),
  fixedPressureHPa: z.number().optional(),
  missingPolicy: missingEnvironmentPolicySchema,
  fallbackTemperatureC: z.number().optional(),
  fallbackPressureHPa: z.number().optional(),
  marksResultProvisional: z.boolean(),
  catchUpOnLateData: z.boolean(),
  formulaId: z.string().min(1),
  formulaVersion: z.number().int().positive(),
});

const stationBindingSchema = z.object({
  stationId: z.number().int(),
  stationCode: z.string().min(1),
  required: z.boolean(),
  instrumentTemplateId: z.string().min(1),
  instrumentHeightM: z.number(),
  atmosphericPolicy: atmosphericPolicySchema,
  defaultMeasurementSetupId: z.string().optional(),
});

const observationVariableBindingSchema = z.object({
  prismSensorId: z.number().int(),
  hzVariableId: z.number().int(),
  vzVariableId: z.number().int(),
  sdVariableId: z.number().int(),
  metadataModeVariableId: z.number().int().optional(),
  metadataReflectorVariableId: z.number().int().optional(),
});

const valueSourceSchema = z.enum([
  'observation-metadata',
  'versioned-mapping',
  'config-override',
  'template',
  'station-fallback',
]);

const resolvedMeasurementSetupSchema = z.object({
  templateId: z.string().optional(),
  measurementType: measurementTypeSchema,
  edmMode: z.string().min(1),
  reflectorTemplateId: z.string().optional(),
  requiredConstantM: z.number().optional(),
  alreadyAppliedConstantM: z.number().optional(),
  prismDeltaM: z.number(),
  targetHeightM: z.number(),
  distanceStdErrMm: z.number().positive(),
  distancePpm: z.number().nonnegative(),
  sourceByField: z.record(z.string(), valueSourceSchema),
});

const targetBindingSchema = z.object({
  id: z.string().min(1),
  stationId: z.number().int(),
  prismSensorId: z.number().int(),
  rawTargetName: z.string().min(1),
  role: targetRoleSchema,
  includeInAdjustment: z.boolean(),
  publishOutput: z.boolean(),
  observationVariables: observationVariableBindingSchema,
  measurementSetup: resolvedMeasurementSetupSchema,
  physicalPointId: z.string().min(1),
  /** ENGINE_NAME_PATTERN mirrored from domain/23 §2 (NAME-004/005); validated fully in T01.7. */
  engineName: z.string().regex(/^[A-Za-z0-9_]{1,15}$/),
  reviewStatus: z.enum(['ok', 'to-review', 'blocking']),
});

const physicalPointSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  engineName: z.string().regex(/^[A-Za-z0-9_]{1,15}$/),
  role: targetRoleSchema,
  memberTargetBindingIds: z.array(z.string().min(1)),
  state: z.enum(['individual', 'shared', 'suggested', 'inconsistent']),
  source: z.enum(['prior-config', 'manual', 'geometry-confirmed', 'default']),
  decision: z
    .object({ by: z.number().int(), at: z.string().datetime(), reason: z.string().min(1) })
    .optional(),
});

const geometricRelationshipSchema = z.object({
  id: z.string().min(1),
  pointAId: z.string().min(1),
  pointBId: z.string().min(1),
  type: geometricRelationshipTypeSchema,
  value: z.record(z.string(), z.number()),
  sigmaM: z.number().positive(),
  frame: z.string().optional(),
  usage: z.enum(['initialisation', 'adjustment', 'check-only']),
  source: z.string().min(1),
  note: z.string().optional(),
});

const referenceConstraintSchema = z.object({
  physicalPointId: z.string().min(1),
  eastingM: z.number(),
  northingM: z.number(),
  heightM: z.number(),
  modeE: constraintModeSchema,
  modeN: constraintModeSchema,
  modeH: constraintModeSchema,
  sigmaEM: z.number().nonnegative().optional(),
  sigmaNM: z.number().nonnegative().optional(),
  sigmaHM: z.number().nonnegative().optional(),
  source: z.string().min(1),
});

const initialCoordinateSchema = z.object({
  physicalPointId: z.string().min(1),
  eastingM: z.number(),
  northingM: z.number(),
  heightM: z.number(),
  stationCount: z.number().int().nonnegative(),
  observationCount: z.number().int().nonnegative(),
  horizontalSpreadM: z.number().nonnegative(),
  verticalSpreadM: z.number().nonnegative(),
  status: z.enum(['known', 'computed', 'review', 'missing']),
});

const initialisationCoverageSchema = z.object({
  availablePhysicalPoints: z.number().int().nonnegative(),
  expectedPhysicalPoints: z.number().int().nonnegative(),
  availableStationTargetPairs: z.number().int().nonnegative(),
  expectedStationTargetPairs: z.number().int().nonnegative(),
  rawObservationCount: z.number().int().nonnegative(),
  representativeCount: z.number().int().nonnegative(),
  missingPairs: z.array(z.object({ stationId: z.number().int(), targetBindingId: z.string().min(1) })),
});

const initialisationConfigSchema = z.object({
  mode: z.enum(['local-anchor', 'known-references']),
  observationWindow: z.object({ from: z.string().datetime(), to: z.string().datetime() }),
  anchor: z
    .object({
      stationId: z.number().int(),
      eastingM: z.number(),
      northingM: z.number(),
      heightM: z.number(),
      orientationDeg: z.number(),
    })
    .optional(),
  references: z.array(referenceConstraintSchema),
  initialCoordinates: z.array(initialCoordinateSchema),
  coverage: initialisationCoverageSchema,
});

const resolvedStarNetAdjustmentConfigSchema = z.object({
  templateId: z.string().min(1),
  templateVersion: z.number().int().positive(),
  adjustmentType: z.literal('3D'),
  linearUnits: z.literal('Meters'),
  angleOutputUnits: z.enum(['DMS', 'Gons']),
  localOrGrid: z.enum(['local', 'grid']),
  coordinateOrder: z.enum(['EN', 'NE']),
  input3dMode: z.literal('Slope/Zenith'),
  scaleFactor: z.number().positive(),
  indexOfRefraction: z.number().nonnegative(),
  earthRadiusM: z.number().positive(),
  convergeLimit: z.number().positive(),
  maximumIterations: z.number().int().positive(),
  chiSquareSignificancePercent: z.number().positive().lt(100),
  performErrorPropagation: z.boolean(),
  ellipseConfidencePercent: z.number().positive().lt(100),
  /** Never nullable here (contrast countryPresetSchema): a resolved version must have it. */
  defaultWeights: starNetWeightsSchema,
  autoAdjust: autoAdjustConfigSchema,
});

export const resolvedAdjustmentConfigVersionSchema = z.object({
  id: z.string().min(1),
  processingId: z.number().int(),
  versionNumber: z.number().int().positive(),
  label: z.string().min(1),
  status: z.enum(['draft', 'active', 'archived']),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime().optional(),
  createdBy: z.number().int(),
  createdAt: z.string().datetime(),
  reason: z.string().min(1),
  usedByRun: z.boolean(),
  countryPreset: z.object({ templateId: z.string().min(1), templateVersion: z.number().int().positive() }),
  stationBindings: z
    .array(stationBindingSchema)
    .min(1)
    .superRefine((bindings, ctx) => {
      // audit item 4 (pass 3): the stationCode<->stationId bridge (station-identity.ts) resolves
      // via `.find()`, which silently picks the first match on a duplicate. A resolved snapshot
      // must reject duplicates outright rather than let that silent first-match behaviour occur.
      const seenIds = new Map<number, number>();
      const seenCodes = new Map<string, number>();
      bindings.forEach((binding, index) => {
        const idFirstIndex = seenIds.get(binding.stationId);
        if (idFirstIndex !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, 'stationId'],
            message: `Duplicate stationId ${binding.stationId} (already used at stationBindings[${idFirstIndex}]); stationId must be unique within a resolved configuration version.`,
          });
        } else {
          seenIds.set(binding.stationId, index);
        }

        const codeFirstIndex = seenCodes.get(binding.stationCode);
        if (codeFirstIndex !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, 'stationCode'],
            message: `Duplicate stationCode "${binding.stationCode}" (already used at stationBindings[${codeFirstIndex}]); stationCode must be unique within a resolved configuration version.`,
          });
        } else {
          seenCodes.set(binding.stationCode, index);
        }
      });
    }),
  targetBindings: z.array(targetBindingSchema),
  physicalPoints: z.array(physicalPointSchema),
  geometricRelationships: z.array(geometricRelationshipSchema),
  initialisation: initialisationConfigSchema,
  adjustment: resolvedStarNetAdjustmentConfigSchema,
  runPolicy: runPolicySchema,
  outputPolicy: outputPolicySchema,
  overriddenFields: z.array(z.string()),
}).superRefine((version, ctx) => {
  const stationIds = new Set(version.stationBindings.map((station) => station.stationId));
  const targetById = new Map<string, (typeof version.targetBindings)[number]>();
  const pointById = new Map<string, (typeof version.physicalPoints)[number]>();
  const engineNames = new Map<string, number>();

  version.targetBindings.forEach((binding, index) => {
    if (targetById.has(binding.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['targetBindings', index, 'id'], message: `Duplicate target binding id ${binding.id}` });
    }
    targetById.set(binding.id, binding);
    if (!stationIds.has(binding.stationId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['targetBindings', index, 'stationId'], message: `Target binding references unknown stationId ${binding.stationId}` });
    }
    const setup = binding.measurementSetup;
    if (setup.measurementType !== 'reflectorless') {
      if (setup.requiredConstantM === undefined || setup.alreadyAppliedConstantM === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['targetBindings', index, 'measurementSetup'], message: 'Prism/sheet constants must be explicitly resolved' });
      } else if (Math.abs(setup.prismDeltaM - (setup.requiredConstantM - setup.alreadyAppliedConstantM)) > 1e-12) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['targetBindings', index, 'measurementSetup', 'prismDeltaM'], message: 'prismDeltaM must equal requiredConstantM − alreadyAppliedConstantM' });
      }
    } else if (Math.abs(setup.prismDeltaM) > 1e-12) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['targetBindings', index, 'measurementSetup', 'prismDeltaM'], message: 'Reflectorless measurements must have prismDeltaM = 0' });
    }
  });

  version.physicalPoints.forEach((point, index) => {
    if (pointById.has(point.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['physicalPoints', index, 'id'], message: `Duplicate physical point id ${point.id}` });
    }
    pointById.set(point.id, point);
    const firstEngineIndex = engineNames.get(point.engineName);
    if (firstEngineIndex !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['physicalPoints', index, 'engineName'], message: `STAR*NET engine name ${point.engineName} is already used by physicalPoints[${firstEngineIndex}]` });
    } else {
      engineNames.set(point.engineName, index);
    }
    const uniqueMembers = new Set(point.memberTargetBindingIds);
    if (uniqueMembers.size !== point.memberTargetBindingIds.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['physicalPoints', index, 'memberTargetBindingIds'], message: 'Physical point members must be unique' });
    }
    for (const memberId of uniqueMembers) {
      const member = targetById.get(memberId);
      if (!member) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['physicalPoints', index, 'memberTargetBindingIds'], message: `Unknown target binding ${memberId}` });
      } else if (member.physicalPointId !== point.id || member.engineName !== point.engineName) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['physicalPoints', index], message: `Target ${memberId} must map back to ${point.id}/${point.engineName}` });
      }
    }
  });

  version.targetBindings.forEach((binding, index) => {
    const point = pointById.get(binding.physicalPointId);
    if (!point) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['targetBindings', index, 'physicalPointId'], message: `Unknown physical point ${binding.physicalPointId}` });
    } else if (!point.memberTargetBindingIds.includes(binding.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['targetBindings', index, 'physicalPointId'], message: `Physical point ${point.id} does not list target ${binding.id}` });
    }
  });

  if (version.validTo && new Date(version.validTo).getTime() <= new Date(version.validFrom).getTime()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['validTo'], message: 'validTo must be later than validFrom' });
  }
  if (new Date(version.initialisation.observationWindow.to).getTime() <= new Date(version.initialisation.observationWindow.from).getTime()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['initialisation', 'observationWindow', 'to'], message: 'Initialisation window end must be later than its start' });
  }
  if (version.initialisation.mode === 'local-anchor' && !version.initialisation.anchor) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['initialisation', 'anchor'], message: 'Local-anchor initialisation requires a fixed station and orientation' });
  }
  version.initialisation.references.forEach((reference, index) => {
    for (const [mode, sigma, component] of [
      [reference.modeE, reference.sigmaEM, 'E'],
      [reference.modeN, reference.sigmaNM, 'N'],
      [reference.modeH, reference.sigmaHM, 'H'],
    ] as const) {
      if (mode === 'weak' && (sigma === undefined || sigma <= 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['initialisation', 'references', index, `sigma${component}M`], message: `Weak ${component} constraint requires a positive sigma` });
      }
    }
  });
});

export type ResolvedAdjustmentConfigVersion = z.infer<typeof resolvedAdjustmentConfigVersionSchema>;

export const adjustmentRunSummarySchema = z.object({
  id: z.string().min(1),
  processingId: z.number().int(),
  configVersionId: z.string().min(1),
  outputSlot: z.string().datetime(),
  trigger: z.enum(['event', 'schedule', 'manual', 'catch-up', 'reprocess', 'test']),
  status: z.enum(['running', 'success', 'provisional', 'failed-qc', 'technical-error']),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
  stationEpochs: z.array(
    z.object({
      stationId: z.number().int(),
      epoch: z.string().datetime().optional(),
      state: z.enum(['fresh', 'reused', 'missing']),
      ageMinutes: z.number().nonnegative().optional(),
    }),
  ),
  autoAdjustAttempts: z.number().int().nonnegative(),
  // Canonical chi-square authority (audit item 5): no independent chi2Passed boolean that could
  // contradict it. The chi2-passed output value is derived via chi2PassedOutputValue.
  chiSquareStatus: chiSquareStatusSchema.optional(),
  varianceFactor: z.number().optional(),
  referencesAvailable: z.number().int().nonnegative().optional(),
  targetAvailabilityPercent: z.number().min(0).max(100).optional(),
  error: z.object({ stage: z.string(), code: z.string(), message: z.string() }).optional(),
});
