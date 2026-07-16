import { z, type ZodIssue } from 'zod';
import { schemaIssue, type SchemaIssue } from '@/domain/errors';

/**
 * Generic Zod issues are technical shape violations, not business-rule violations, so they map
 * to `SchemaIssue` (no `ruleId`) — see errors.ts (audit item 2). Business rules attach their
 * `ruleId` explicitly at the call site that enforces them, never here.
 */
export function zodIssuesToSchemaIssues(issues: ZodIssue[]): SchemaIssue[] {
  return issues.map((issue) =>
    schemaIssue({
      code: issue.code,
      fieldPath: issue.path.join('.') || '(root)',
      message: issue.message,
    }),
  );
}

export const measurementTypeSchema = z.enum(['prism', 'reflective-sheet', 'reflectorless']);
export const targetRoleSchema = z.enum(['reference', 'monitoring', 'auxiliary']);
export const atmosphericModeSchema = z.enum([
  'already-applied',
  'cycle-temperature-pressure',
  'fixed-temperature-pressure',
  'none',
]);
export const missingEnvironmentPolicySchema = z.enum([
  'wait-or-fail',
  'fixed-fallback',
  'continue-without-correction',
  'assume-already-corrected',
]);
export const constraintModeSchema = z.enum(['fixed', 'weak', 'free']);
export const geometricRelationshipTypeSchema = z.enum([
  'slope-distance',
  'horizontal-distance',
  'height-difference',
  'azimuth-distance',
  'vector-3d',
]);
export const targetOutputComponentSchema = z.enum([
  'adjusted-x',
  'adjusted-y',
  'adjusted-z',
  'delta-x',
  'delta-y',
  'delta-z',
  'sigma-x',
  'sigma-y',
  'sigma-z',
]);
export const globalOutputComponentSchema = z.enum([
  'chi2-passed',
  'variance-factor',
  'references-available',
  'target-availability',
  'provisional-flag',
  'quality-code',
]);
export const chiSquareStatusSchema = z.enum(['passed', 'failed', 'not-applicable']);

/** Processing lifecycle/runtime status (audit item 8) — must stay in sync with `ProcessingStatus`. */
export const processingStatusSchema = z.enum([
  'draft',
  'waiting_for_data',
  'ready',
  'running',
  'success',
  'warning',
  'provisional',
  'failed_qc',
  'technical_error',
  'disabled',
  'archived',
]);

export const topographicAdjustmentProcessingSchema = z.object({
  id: z.number().int(),
  projectId: z.number().int(),
  type: z.literal('Topographic Adjustment'),
  name: z.string().min(1),
  description: z.string().optional(),
  scope: z.enum(['single-station', 'network']),
  status: processingStatusSchema,
  active: z.boolean(),
  activeConfigVersionId: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const starNetWeightsSchema = z.object({
  distanceStdErrM: z.number().positive(),
  distancePpm: z.number().nonnegative(),
  angleArcSec: z.number().positive(),
  directionArcSec: z.number().positive(),
  azimuthArcSec: z.number().positive(),
  zenithArcSec: z.number().positive(),
  instrumentCenteringM: z.number().nonnegative(),
  targetCenteringM: z.number().nonnegative(),
  verticalCenteringM: z.number().nonnegative(),
});

export const autoAdjustConfigSchema = z.object({
  enabled: z.boolean(),
  maxStandardizedResidual: z.number().positive(),
  outliersRemovedPerIteration: z.number().int().nonnegative(),
  maxIterations: z.number().int().nonnegative(),
});

export const catchUpPolicySchema = z.object({
  enabled: z.boolean(),
  windowHours: z.number().nonnegative(),
  onLateObservation: z.boolean(),
  onLateEnvironment: z.boolean(),
  maxRecalculationsPerSlot: z.number().int().nonnegative(),
});

export const runPolicySchema = z.object({
  trigger: z.enum(['event-driven', 'schedule', 'manual']),
  scheduleEveryMinutes: z.number().positive().optional(),
  syncToleranceMinutes: z.number().nonnegative(),
  reuseMissingStation: z.boolean(),
  maxReusedAgeMinutes: z.number().nonnegative(),
  computeWithoutOptionalStations: z.boolean(),
  markReuseProvisional: z.boolean(),
  catchUp: catchUpPolicySchema,
});

export const outputPolicySchema = z.object({
  intervalMinutes: z.number().positive(),
  alignment: z.literal('utc-grid'),
  maxEpochToSlotMinutes: z.number().nonnegative(),
  publishProvisional: z.boolean(),
  targetComponents: z.array(targetOutputComponentSchema),
  globalComponents: z.array(globalOutputComponentSchema),
});
