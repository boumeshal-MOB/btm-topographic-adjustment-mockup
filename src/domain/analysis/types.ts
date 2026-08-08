import type { StarNetWeights } from '@/domain/entities';
import type { AdjustmentDiagnostic, ResolvedRunPoint } from '@/domain/engine/run-input';

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
}

export type AnalysisReferenceSigmaOverride = Partial<Record<'e' | 'n' | 'h', number>>;

/** Trial-only changes. Nothing in this object mutates raw_data. */
export interface AnalysisTrialOverrides {
  excludedScalarObservationIds?: string[];
  disabledReferenceKeys?: string[];
  weightMultiplier?: number;
  useAutoAdjust?: boolean;
  observationOverrides?: Record<string, AnalysisObservationOverride>;
  initialCoordinateOverrides?: Record<string, AnalysisCoordinate>;
  referenceSigmaOverrides?: Record<string, AnalysisReferenceSigmaOverride>;
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
  previews: { dat: string; prj: string };
}

export interface AnalysisCandidateChanges {
  validFrom: string;
  reason: string;
  excludedScalarObservationIds?: string[];
  disabledReferenceKeys?: string[];
  adjustmentOverrides?: AnalysisAdjustmentOverrides;
  initialCoordinates?: Record<string, AnalysisCoordinate>;
  referenceSigmaOverrides?: Record<string, AnalysisReferenceSigmaOverride>;
  targetMeasurementPrecision?: Record<string, AnalysisObservationPrecision>;
}
