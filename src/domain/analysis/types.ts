import type { AutoAdjustConfig, StarNetWeights } from '@/domain/entities';
import type { AdjustmentDiagnostic, ResolvedRunPoint } from '@/domain/engine/run-input';
import type { NativePreviews } from '@/domain/starnet/preview-builder';

export type AnalysisEngine = 'scientific-preview' | 'starnet';

export interface AnalysisCoordinate {
  eastingM: number;
  northingM: number;
  heightM: number;
}

export interface AnalysisObservationValues {
  hzDeg: number;
  vzDeg: number;
  finalSlopeDistanceM: number;
}

export interface AnalysisObservationPrecision {
  sigmaHzArcSec: number;
  sigmaVzArcSec: number;
  sigmaSdMm: number;
  sigmaSdPpm: number;
}

export interface AnalysisObservationOverride
  extends Partial<AnalysisObservationValues>, Partial<AnalysisObservationPrecision> {}

export interface AnalysisAdjustmentOverrides {
  defaultWeights?: Partial<StarNetWeights>;
  convergeLimit?: number;
  maximumIterations?: number;
  chiSquareSignificancePercent?: number;
  ellipseConfidencePercent?: number;
  performErrorPropagation?: boolean;
  scaleFactor?: number;
  indexOfRefraction?: number;
  earthRadiusM?: number;
  autoAdjust?: Partial<AutoAdjustConfig>;
}

export type AnalysisReferenceSigmaOverride = Partial<Record<'e' | 'n' | 'h', number>>;

/**
 * Per-component control of a reference during a trial.
 *
 * Only `weak` and `free` are offered: the engine expresses a weighted constraint per component and
 * a fully fixed point, so "fix this component alone" has no meaning in the resolved run input.
 * Fixing a whole point is a datum decision that belongs to the configuration, not to a trial.
 */
export type ReferenceConstraintMode = 'weak' | 'free';
export type ReferenceConstraintModeOverride = Partial<Record<'e' | 'n' | 'h', ReferenceConstraintMode>>;

/** Trial-only changes. Nothing in this object mutates raw_data. */
export interface AnalysisTrialOverrides {
  excludedScalarObservationIds?: string[];
  disabledReferenceKeys?: string[];
  weightMultiplier?: number;
  useAutoAdjust?: boolean;
  observationOverrides?: Record<string, AnalysisObservationOverride>;
  initialCoordinateOverrides?: Record<string, AnalysisCoordinate>;
  referenceSigmaOverrides?: Record<string, AnalysisReferenceSigmaOverride>;
  /** Frees or re-weights individual components of a reference for this trial only. */
  constraintModeOverrides?: Record<string, ReferenceConstraintModeOverride>;
  adjustmentOverrides?: AnalysisAdjustmentOverrides;
}

export interface AnalysisPointSnapshot extends AnalysisCoordinate {
  engineName: string;
  physicalPointId: string;
  label: string;
  role: ResolvedRunPoint['role'];
  identityState: 'station' | 'individual' | 'shared' | 'suggested' | 'inconsistent';
  memberTargets: Array<{
    bindingId: string;
    stationCode: string;
    rawTargetName: string;
  }>;
  observedByStations: string[];
  fixed: boolean;
  constraints: Array<{
    component: 'e' | 'n' | 'h';
    mode: 'fixed' | 'weak' | 'free';
    sigmaM?: number;
  }>;
}

/**
 * What happened to one measured distance between BTM and the adjustment.
 *
 * A corrected distance on its own cannot be checked: the surveyor sees 128.4173 m and has no way to
 * tell whether the prism constant was applied once, twice or not at all. Carrying the raw value and
 * each step beside it makes the chain auditable on the screen that shows the residual — which is
 * where a suspicious distance is looked at in the first place.
 */
export interface AnalysisDistanceCorrection {
  /** The distance exactly as stored in BTM, before anything was applied. */
  rawDistanceM: number;
  /** True when BTM stored a horizontal distance and it was converted to a slope distance (CORR-001). */
  convertedFromHorizontal: boolean;
  /** Reflector constant applied as a differential: required − already applied (CORR-002/003). */
  prismDeltaM: number;
  /** Atmospheric scale expressed in ppm, and where its temperature/pressure came from. */
  atmosphericPpm: number;
  atmosphericSource: string;
  /** After the reflector constant and the atmosphere: what the adjustment actually weights. */
  correctedDistanceM: number;
}

export interface AnalysisObservationSnapshot {
  observationId: string;
  stationEngineName: string;
  targetEngineName: string;
  targetBindingId?: string;
  pointRole: AnalysisPointSnapshot['role'];
  sharedPhysicalPoint: boolean;
  baseValues: AnalysisObservationValues;
  effectiveValues: AnalysisObservationValues;
  basePrecision: AnalysisObservationPrecision;
  effectivePrecision: AnalysisObservationPrecision;
  excludedComponents: Array<'hz' | 'vz' | 'sd'>;
  protected: boolean;
  /** Absent when no trace was produced for this observation (an override-only row). */
  distanceCorrection?: AnalysisDistanceCorrection;
}

export interface AnalysisTrialResult {
  diagnostic: AdjustmentDiagnostic;
  alerts: string[];
  stationEpochs: Array<{
    stationId: number;
    stationCode: string;
    epoch?: string;
    state: 'fresh' | 'reused' | 'missing';
    ageMinutes?: number;
  }>;
  baselineObservationCount: number;
  blocking: string[];
  warnings: string[];
  points: AnalysisPointSnapshot[];
  observations: AnalysisObservationSnapshot[];
  previews: NativePreviews;
}

export interface AnalysisCandidateChanges {
  validFrom: string;
  reason: string;
  excludedScalarObservationIds?: string[];
  disabledReferenceKeys?: string[];
  adjustmentOverrides?: AnalysisAdjustmentOverrides;
  initialCoordinates?: Record<string, AnalysisCoordinate>;
  referenceSigmaOverrides?: Record<string, AnalysisReferenceSigmaOverride>;
  constraintModeOverrides?: Record<string, ReferenceConstraintModeOverride>;
  targetMeasurementPrecision?: Record<string, AnalysisObservationPrecision>;
}
