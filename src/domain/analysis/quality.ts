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
 * itself, so colour reinforces the reading instead of carrying it (PRODUIT-ET-PARCOURS.md
 * §"Le code couleur n'est jamais l'unique signal").
 */
export type QualityLevel = 'normal' | 'warning' | 'critical';

export type DeltaColourMode = 'role' | 'e' | 'n' | 'h' | 'plan' | '3d';

export interface StandardisedDeltaThresholds {
  warningSigma: number;
  criticalSigma: number;
}

/** Shared monitoring rule: review from three times the point precision, critical from five. */
export const DEFAULT_STANDARDISED_DELTA_THRESHOLDS: StandardisedDeltaThresholds = {
  warningSigma: 3,
  criticalSigma: 5,
};

export interface DeltaComponentsMm {
  eMm: number;
  nMm: number;
  hMm: number;
}

export interface SigmaComponentsMm {
  eMm: number;
  nMm: number;
  hMm: number;
}

/**
 * Dimensionless adjustment-correction index for the selected coordinate components. Plan and 3D
 * compare the correction norm with the propagated point-precision norm. This is a diagonal-
 * covariance approximation until the engine exposes the complete covariance matrix.
 */
export function standardisedDeltaScore(
  delta: DeltaComponentsMm | undefined,
  sigma: SigmaComponentsMm | undefined,
  mode: DeltaColourMode,
): number | undefined {
  if (!delta || !sigma || mode === 'role') return undefined;
  const component = (value: number, standardError: number) => {
    if (!Number.isFinite(value) || !Number.isFinite(standardError) || standardError <= 0) return undefined;
    return { value, standardError, score: Math.abs(value) / standardError };
  };
  const e = component(delta.eMm, sigma.eMm);
  const n = component(delta.nMm, sigma.nMm);
  const h = component(delta.hMm, sigma.hMm);
  if (mode === 'e') return e?.score;
  if (mode === 'n') return n?.score;
  if (mode === 'h') return h?.score;
  if (mode === 'plan') {
    return e && n
      ? Math.hypot(e.value, n.value) / Math.hypot(e.standardError, n.standardError)
      : undefined;
  }
  return e && n && h
    ? Math.hypot(e.value, n.value, h.value)
      / Math.hypot(e.standardError, n.standardError, h.standardError)
    : undefined;
}

/** Severity of a dimensionless correction index; warning starts at 3σ, critical beyond 5σ. */
export function displacementLevel(
  standardisedScore: number | undefined,
  thresholds: StandardisedDeltaThresholds,
): QualityLevel | undefined {
  if (standardisedScore === undefined || !Number.isFinite(standardisedScore)) return undefined;
  const value = Math.abs(standardisedScore);
  if (value >= thresholds.criticalSigma) return 'critical';
  if (value >= thresholds.warningSigma) return 'warning';
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
 * (PRODUIT-ET-PARCOURS.md §Trials). Returned as stable keys so the UI translates them.
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
