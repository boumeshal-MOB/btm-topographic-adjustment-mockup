import type { AdjustmentDiagnostic } from '@/domain/engine/run-input';

/**
 * Derived reading of an adjustment's quality. Everything here is computed from values the engine
 * already publishes — no formula is duplicated and no engine contract changes.
 *
 * The motivating problem: `ChiSquareStatus` is deliberately a three-value canonical authority
 * (`passed` / `failed` / `not-applicable`) because the published `chi2-passed` variable must not
 * grow new states. But "failed" covers two opposite situations, and telling them apart is what
 * makes the result actionable:
 *
 *  - the weighted residual sum sits ABOVE the upper bound — the measurements disagree with each
 *    other more than the declared precision allows. Look for blunders;
 *  - it sits BELOW the lower bound — the adjustment fits far better than declared. The stated
 *    sigmas are pessimistic. Nothing is wrong with the measurements.
 *
 * The second case is the normal outcome on the synthetic validation catalogue, whose reference
 * coordinates sit exactly on their truth while declaring a 1–1.5 mm uncertainty. Reporting that
 * as a plain failure would teach a surveyor to distrust a clean network.
 */

/**
 * Severity used to colour result cells. Three states only, and always paired with the number
 * itself, so colour reinforces the reading instead of carrying it (FRONTEND-AND-ANALYSIS-LAB.md
 * §"Le code couleur n'est jamais l'unique signal").
 */
export type QualityLevel = 'normal' | 'warning' | 'critical';

export interface DisplacementThresholdsMm {
  warningMm: number;
  criticalMm: number;
}

/** Movement between approximate and adjusted coordinates; the user owns these thresholds. */
export function displacementLevel(
  magnitudeMm: number | undefined,
  thresholds: DisplacementThresholdsMm,
): QualityLevel | undefined {
  if (magnitudeMm === undefined || !Number.isFinite(magnitudeMm)) return undefined;
  const value = Math.abs(magnitudeMm);
  if (value > thresholds.criticalMm) return 'critical';
  if (value >= thresholds.warningMm) return 'warning';
  return 'normal';
}

/**
 * Coordinate uncertainty has its own rule: it answers "how well is this point determined",
 * which is a different question from "how far did it move", so it must not borrow the
 * displacement thresholds.
 */
export function uncertaintyLevel(sigmaMm: number | undefined): QualityLevel | undefined {
  if (sigmaMm === undefined || !Number.isFinite(sigmaMm)) return undefined;
  if (sigmaMm >= 5) return 'critical';
  if (sigmaMm >= 2) return 'warning';
  return 'normal';
}

/**
 * Standardized residual. The conventional reading: beyond 3 sigma a measurement is treated as an
 * outlier, and 2 sigma is worth a look.
 */
export function residualLevel(standardisedResidual: number | undefined): QualityLevel | undefined {
  if (standardisedResidual === undefined || !Number.isFinite(standardisedResidual)) return undefined;
  const value = Math.abs(standardisedResidual);
  if (value > 3) return 'critical';
  if (value >= 2) return 'warning';
  return 'normal';
}

export type ChiSquareDirection = 'below' | 'within' | 'above' | 'not-applicable';

export function chiSquareDirection(diagnostic: AdjustmentDiagnostic): ChiSquareDirection {
  if (diagnostic.chiSquareStatus === 'not-applicable' || diagnostic.degreesOfFreedom <= 0) {
    return 'not-applicable';
  }
  const { weightedSSR, chiSquareLower, chiSquareUpper } = diagnostic;
  if (!Number.isFinite(weightedSSR) || !Number.isFinite(chiSquareLower) || !Number.isFinite(chiSquareUpper)) {
    return 'not-applicable';
  }
  if (weightedSSR < chiSquareLower) return 'below';
  if (weightedSSR > chiSquareUpper) return 'above';
  return 'within';
}

/** Reasons a "good" result may be good only because the configuration was loosened. */
export interface OptimismWarningInput {
  diagnostic: AdjustmentDiagnostic;
  excludedComponentCount: number;
  freedReferenceCount: number;
  weightMultiplier: number;
  totalObservationComponents: number;
}

export type OptimismWarning =
  | 'inflated-sigmas'
  | 'many-exclusions'
  | 'freed-references'
  | 'low-redundancy'
  | 'fits-better-than-declared';

/**
 * Flags the ways an adjustment can look acceptable without being trustworthy
 * (FRONTEND-AND-ANALYSIS-LAB.md §Trials). Returned as stable keys so the UI translates them.
 */
export function optimismWarnings(input: OptimismWarningInput): OptimismWarning[] {
  const warnings: OptimismWarning[] = [];
  if (input.weightMultiplier > 1.5) warnings.push('inflated-sigmas');
  if (input.totalObservationComponents > 0
    && input.excludedComponentCount / input.totalObservationComponents > 0.1) {
    warnings.push('many-exclusions');
  }
  if (input.freedReferenceCount > 0) warnings.push('freed-references');
  if (input.diagnostic.degreesOfFreedom > 0 && input.diagnostic.degreesOfFreedom < 3) {
    warnings.push('low-redundancy');
  }
  if (chiSquareDirection(input.diagnostic) === 'below') warnings.push('fits-better-than-declared');
  return warnings;
}
