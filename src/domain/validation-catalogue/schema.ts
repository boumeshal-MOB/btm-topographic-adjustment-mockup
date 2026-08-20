import { z } from 'zod';

/**
 * Public contract of the generated validation catalogue
 * (`public/demo-datasets/v1`, VALIDATION.md).
 *
 * The Python generator is the single source of the 100 datasets; this module only *reads* them.
 * Nothing here regenerates, mutates or re-derives scientific content: a shard is parsed, validated
 * and handed to the adapter that converts it to the existing repository contracts.
 *
 * Only the fields the mock-up actually consumes are described. `passthrough()` keeps unknown
 * generator fields instead of silently dropping them, so a future `GENERATOR_VERSION` that adds
 * information does not break loading.
 */

// ---------------------------------------------------------------------------------------
// Shared scalar shapes
// ---------------------------------------------------------------------------------------

export const validationCoordinateSchema = z.object({
  e: z.number(),
  n: z.number(),
  h: z.number(),
});

/** The ten primary scenarios emitted by the generator, plus the clean baseline. */
export const VALIDATION_SCENARIOS = [
  'clean',
  'moved-reference',
  'station-vibration',
  'gross-hz',
  'gross-vz',
  'gross-sd',
  'atmosphere-omitted',
  'curvature-refraction-omitted',
  'horizontal-as-slope',
  'face-i-ii',
] as const;

export type ValidationScenario = (typeof VALIDATION_SCENARIOS)[number];

/**
 * Scenario values are validated as a known enum but tolerated as free strings: a newer generator
 * may add a family, and the browser must degrade to "unknown scenario" rather than fail to load.
 */
export const validationScenarioSchema = z.string();

export const validationTemplateSchema = z.enum(['UK', 'FR']);

// ---------------------------------------------------------------------------------------
// Manifest — the only file loaded up front (56 kB, never bundled)
// ---------------------------------------------------------------------------------------

export const validationManifestEntrySchema = z
  .object({
    id: z.string().regex(/^BTM-VAL-\d{3}$/),
    title: z.string(),
    shard: z.string(),
    template: validationTemplateSchema,
    primaryScenario: validationScenarioSchema,
    secondaryScenario: validationScenarioSchema.nullable(),
    combined: z.boolean(),
    stationCount: z.number().int().min(1).max(5),
    referenceCount: z.number().int().min(0),
    sharedPointCount: z.number().int().min(0),
    observationCount: z.number().int().min(1),
    targetCountByStation: z.record(z.string(), z.number().int().min(0)),
  })
  .passthrough();

export const validationShardIndexSchema = z
  .object({
    file: z.string(),
    datasetCount: z.number().int().min(1),
    firstDatasetId: z.string(),
    lastDatasetId: z.string(),
    bytes: z.number().int().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .passthrough();

export const validationManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatorVersion: z.string(),
    generatedAt: z.string(),
    masterSeed: z.number(),
    classification: z.string(),
    canonicalDatasetId: z.string(),
    datasetCount: z.number().int().min(1),
    scenarioDefinitions: z.record(z.string(), z.string()),
    distribution: z
      .object({
        isolated: z.number().int().min(0),
        combined: z.number().int().min(0),
        primaryScenario: z.record(z.string(), z.number().int().min(0)),
        stationCount: z.record(z.string(), z.number().int().min(0)),
      })
      .passthrough(),
    shards: z.array(validationShardIndexSchema).min(1),
    datasets: z.array(validationManifestEntrySchema).min(1),
  })
  .passthrough();

export type ValidationManifest = z.infer<typeof validationManifestSchema>;
export type ValidationManifestEntry = z.infer<typeof validationManifestEntrySchema>;
export type ValidationShardIndex = z.infer<typeof validationShardIndexSchema>;

// ---------------------------------------------------------------------------------------
// Dataset — loaded one shard at a time, on demand
// ---------------------------------------------------------------------------------------

export const validationEpochSchema = z
  .object({
    kind: z.enum(['baseline', 'incident', 'verification']),
    timestamp: z.string(),
  })
  .passthrough();

export const validationStationSchema = z
  .object({
    id: z.string(),
    stationCode: z.string(),
    coordinates: validationCoordinateSchema,
    orientationDeg: z.number(),
    instrumentHeightM: z.number(),
    instrument: z
      .object({
        manufacturer: z.string(),
        model: z.string(),
        angleSigmaArcSec: z.number().positive(),
        distanceSigmaMm: z.number().positive(),
        distancePpm: z.number().min(0),
      })
      .passthrough(),
  })
  .passthrough();

export const validationPhysicalPointSchema = z
  .object({
    id: z.string(),
    role: z.enum(['reference', 'monitoring', 'shared', 'auxiliary']),
    coordinates: validationCoordinateSchema,
  })
  .passthrough();

export const validationMeasurementSetupSchema = z
  .object({
    id: z.string(),
    stationId: z.string(),
    measurementType: z.enum(['prism', 'reflective-sheet', 'reflectorless']),
    edmMode: z.string(),
    /** Null for reflectorless setups, which have no reflector and no prism constant at all. */
    reflector: z.string().nullable(),
    requiredConstantM: z.number().nullable(),
    alreadyAppliedConstantM: z.number().nullable(),
  })
  .passthrough();

export const validationTargetBindingSchema = z
  .object({
    id: z.string(),
    stationId: z.string(),
    /**
     * The explicit, versioned mapping between a BTM target name and a physical point.
     * Identity is read from THIS field only — never inferred from `rawTargetName` (POINT-001).
     */
    physicalPointId: z.string(),
    rawTargetName: z.string(),
    role: z.enum(['reference', 'monitoring', 'auxiliary']),
    measurementSetupId: z.string(),
    targetHeightM: z.number(),
  })
  .passthrough();

export const validationReferenceConstraintSchema = z
  .object({
    stationId: z.string(),
    physicalPointId: z.string(),
    coordinates: validationCoordinateSchema,
    constraint: z.object({
      e: z.enum(['fixed', 'weak', 'free']),
      n: z.enum(['fixed', 'weak', 'free']),
      h: z.enum(['fixed', 'weak', 'free']),
    }),
    sigmaMm: z.object({ e: z.number(), n: z.number(), h: z.number() }),
  })
  .passthrough();

export const validationInitialCoordinateSchema = z
  .object({
    physicalPointId: z.string(),
    e: z.number(),
    n: z.number(),
    h: z.number(),
    source: z.string(),
  })
  .passthrough();

export const validationEnvironmentReadingSchema = z
  .object({
    stationId: z.string(),
    epoch: z.string(),
    temperatureC: z.number(),
    pressureHPa: z.number(),
    valid: z.boolean(),
  })
  .passthrough();

export const validationConfiguredPolicySchema = z
  .object({
    stationId: z.string(),
    mode: z.enum([
      'already-applied',
      'cycle-temperature-pressure',
      'fixed-temperature-pressure',
      'none',
    ]),
    missingPolicy: z.string(),
    formulaId: z.string(),
  })
  .passthrough();

/** Truth and injected faults are oracle-grade content: blind mode strips them per observation. */
export const validationObservationTruthSchema = z
  .object({
    hzDeg: z.number(),
    vzDeg: z.number(),
    slopeDistanceM: z.number(),
    horizontalDistanceM: z.number(),
  })
  .passthrough();

export const validationObservationSchema = z
  .object({
    id: z.string(),
    stationId: z.string(),
    bindingId: z.string(),
    physicalPointId: z.string(),
    epoch: z.string(),
    epochKind: z.enum(['baseline', 'incident', 'verification']),
    face: z.union([z.literal(1), z.literal(2)]),
    hzDeg: z.number(),
    vzDeg: z.number(),
    storedDistanceM: z.number(),
    /** `horizontal` is a real stored convention, not a defect by itself (CALC-004). */
    storedDistanceKind: z.enum(['slope', 'horizontal']),
    sigmas: z
      .object({
        hzArcSec: z.number().positive(),
        vzArcSec: z.number().positive(),
        distanceMm: z.number().positive(),
        distancePpm: z.number().min(0),
      })
      .passthrough(),
    correctionTrace: z
      .object({
        atmosphericPpmRequired: z.number(),
        curvatureRefractionHeightM: z.number(),
        prismDeltaM: z.number(),
      })
      .passthrough(),
    truth: validationObservationTruthSchema.optional(),
    injectedFaults: z.array(z.string()).optional(),
  })
  .passthrough();

export const validationOracleSchema = z
  .object({
    disclosure: z.string(),
    expectedPrimaryScenario: validationScenarioSchema,
    expectedSecondaryScenario: validationScenarioSchema.nullable(),
    faultPlans: z.record(z.string(), z.unknown()),
    physicalPointTruth: z.array(
      z.object({ id: z.string(), e: z.number(), n: z.number(), h: z.number() }).passthrough(),
    ),
    recommendedAnalysisActions: z.array(
      z.object({ scenario: validationScenarioSchema, action: z.string() }).passthrough(),
    ),
    identityCases: z
      .object({
        confirmedSharedPoints: z.array(
          z
            .object({
              physicalPointId: z.string(),
              memberBindingIds: z.array(z.string()),
              confirmation: z.string(),
            })
            .passthrough(),
        ),
        sameRawNameButDistinctPhysicalPoints: z.array(
          z
            .object({
              rawTargetName: z.string(),
              members: z.array(
                z
                  .object({
                    stationId: z.string(),
                    bindingId: z.string(),
                    physicalPointId: z.string(),
                  })
                  .passthrough(),
              ),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
  })
  .passthrough();

export const validationScenarioDescriptorSchema = z
  .object({
    primary: validationScenarioSchema,
    secondary: validationScenarioSchema.nullable(),
    isCombined: z.boolean(),
  })
  .passthrough();

export const validationDatasetSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^BTM-VAL-\d{3}$/),
    classification: z.string(),
    conventions: z.record(z.string(), z.string()),
    scenario: validationScenarioDescriptorSchema,
    epochs: z.array(validationEpochSchema).min(1),
    stations: z.array(validationStationSchema).min(1).max(5),
    physicalPoints: z.array(validationPhysicalPointSchema).min(1),
    targetBindings: z.array(validationTargetBindingSchema).min(1),
    measurementSetups: z.array(validationMeasurementSetupSchema).min(1),
    referenceConstraints: z.array(validationReferenceConstraintSchema),
    initialCoordinates: z.array(validationInitialCoordinateSchema),
    environmentReadings: z.array(validationEnvironmentReadingSchema),
    configuredPolicies: z.array(validationConfiguredPolicySchema),
    observations: z.array(validationObservationSchema).min(1),
    oracle: validationOracleSchema.optional(),
  })
  .passthrough();

export const validationShardSchema = z
  .object({
    schemaVersion: z.literal(1),
    datasets: z.array(validationDatasetSchema).min(1),
  })
  .passthrough();

export type ValidationDataset = z.infer<typeof validationDatasetSchema>;
export type ValidationShard = z.infer<typeof validationShardSchema>;
export type ValidationObservation = z.infer<typeof validationObservationSchema>;
export type ValidationStation = z.infer<typeof validationStationSchema>;
export type ValidationTargetBinding = z.infer<typeof validationTargetBindingSchema>;
export type ValidationPhysicalPoint = z.infer<typeof validationPhysicalPointSchema>;
export type ValidationReferenceConstraint = z.infer<typeof validationReferenceConstraintSchema>;
export type ValidationMeasurementSetup = z.infer<typeof validationMeasurementSetupSchema>;
export type ValidationOracle = z.infer<typeof validationOracleSchema>;
export type ValidationEpochKind = z.infer<typeof validationEpochSchema>['kind'];
