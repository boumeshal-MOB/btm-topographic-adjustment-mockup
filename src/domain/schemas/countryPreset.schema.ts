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

/**
 * One reflector of a template's catalogue.
 *
 * A prism, a reflective sheet and a mini prism are the same object with a different constant; only
 * `reflectorless` is genuinely another thing, and it is the only distinction the correction chain
 * makes (`corrections.py` treats prism and reflective-sheet identically). The three-family
 * vocabulary survives here because the generated validation catalogue and the Python core are
 * written in it — it is a data contract, not a product concept.
 */
const measurementSetupSeedSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    measurementType: measurementTypeSchema,
    reflectorTemplateId: z.string().optional(),
    edmMode: z.string().min(1),
    requiredConstantM: z.number().optional(),
    alreadyAppliedConstantM: z.number().optional(),
    prismDeltaM: z.number(),
    distanceState: z.string().min(1),
  })
  .superRefine((setup, ctx) => {
    /**
     * What BTM adds is the difference between what the reflector needs and what the field already
     * applied. The resolved version has always enforced it; the *seed* did not, so a template could
     * declare a reflector whose differential contradicted its own constants and the error surfaced
     * only at version creation — or, worse, as a distance corrected twice. Now that reflectors are
     * created through the interface, the guard belongs where they are written.
     */
    if (setup.measurementType === 'reflectorless') return;
    const required = setup.requiredConstantM ?? 0;
    const applied = setup.alreadyAppliedConstantM ?? 0;
    if (Math.abs(setup.prismDeltaM - (required - applied)) > 1e-12) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['prismDeltaM'],
        message: `Reflector "${setup.label}": prismDeltaM must equal requiredConstantM − alreadyAppliedConstantM`,
      });
    }
  });

const atmosphericPolicySeedSchema = z.object({
  mode: atmosphericModeSchema,
  missingPolicy: missingEnvironmentPolicySchema,
  marksResultProvisional: z.boolean(),
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
