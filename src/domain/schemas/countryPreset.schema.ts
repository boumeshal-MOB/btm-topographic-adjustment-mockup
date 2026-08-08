import { z } from 'zod';
import {
  atmosphericModeSchema,
  autoAdjustConfigSchema,
  measurementTypeSchema,
  missingEnvironmentPolicySchema,
  outputPolicySchema,
  runPolicySchema,
  starNetWeightsSchema,
} from '@/domain/schemas/common';

/**
 * `CountryPresetSchema` (`configs/README.md`): lenient — it validates the raw seed shape of
 * `src/configs/*.v1.json`, not a resolved processing. `null` in a seed means "decision
 * required", never zero (e.g. FR `adjustment.defaultWeights`); this schema accepts that null
 * and records it as an explicit unresolved decision rather than inventing a value.
 */
const instrumentTemplateSchema = z
  .object({
    id: z.string().min(1),
    manufacturer: z.string().min(1),
    model: z.string().min(1),
    reviewRequired: z.boolean().optional(),
    angleAccuracyArcSec: z.number().nonnegative().optional(),
    measurementFamilies: z
      .record(
        measurementTypeSchema,
        z.object({ distanceStdErrMm: z.number().positive(), distancePpm: z.number().nonnegative() }),
      )
      .optional(),
  })
  .passthrough();

const measurementSetupSeedSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  measurementType: measurementTypeSchema,
  reflectorTemplateId: z.string().optional(),
  edmMode: z.string().min(1),
  requiredConstantM: z.number().optional(),
  alreadyAppliedConstantM: z.number().optional(),
  prismDeltaM: z.number(),
  distanceState: z.string().min(1),
});

const atmosphericPolicySeedSchema = z.object({
  mode: atmosphericModeSchema,
  missingPolicy: missingEnvironmentPolicySchema,
  marksResultProvisional: z.boolean(),
  catchUpOnLateData: z.boolean(),
  formulaId: z.string().min(1),
  formulaVersion: z.number().int().positive(),
  variableIdsRequiredAtProcessingCreation: z.boolean().optional(),
});

const starNetAdjustmentSeedSchema = z.object({
  templateId: z.string().min(1),
  templateVersion: z.number().int().positive(),
  adjustmentType: z.literal('3D'),
  linearUnits: z.literal('Meters'),
  angleOutputUnits: z.enum(['DMS', 'Gons']),
  localOrGrid: z.enum(['local', 'grid']),
  coordinateOrder: z.enum(['EN', 'NE']),
  input3dMode: z.literal('Slope/Zenith'),
  edmStdErrorModel: z.enum(['additive', 'propagated']).default('additive'),
  scaleFactor: z.number().positive(),
  indexOfRefraction: z.number().nonnegative(),
  earthRadiusM: z.number().positive(),
  convergeLimit: z.number().positive(),
  maximumIterations: z.number().int().positive(),
  chiSquareSignificancePercent: z.number().positive().lt(100),
  performErrorPropagation: z.boolean(),
  ellipseConfidencePercent: z.number().positive().lt(100),
  /** `null` = surveyor validation pending (audit D-05): Review must block activation. */
  defaultWeights: starNetWeightsSchema.nullable(),
  reviewRequiredFields: z.array(z.string()).optional(),
  autoAdjust: autoAdjustConfigSchema,
});

export const countryPresetSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  label: z.string().min(1),
  country: z.enum(['UK', 'FR']),
  kind: z.literal('country-preset'),
  isNationalStandard: z.boolean(),
  provenance: z.array(z.string()),
  instrumentTemplates: z.array(instrumentTemplateSchema).min(1),
  measurementSetups: z.array(measurementSetupSeedSchema).min(1),
  atmosphericPolicy: atmosphericPolicySeedSchema,
  adjustment: starNetAdjustmentSeedSchema,
  runPolicy: runPolicySchema,
  outputPolicy: outputPolicySchema,
});

export type CountryPresetSeed = z.infer<typeof countryPresetSchema>;

/** True when a preset still has an unresolved decision (e.g. FR `defaultWeights: null`). */
export function hasUnresolvedDecision(preset: CountryPresetSeed): boolean {
  return preset.adjustment.defaultWeights === null;
}
