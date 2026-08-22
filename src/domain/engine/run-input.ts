import type { ChiSquareStatus, StarNetAdjustmentConfig, TargetRole } from '@/domain/entities';

/**
 * Resolved run input — the immutable snapshot consumed by any `AdjustmentEngine`
 * (`PROJECT_MAP.md`): corrections are already applied exactly once upstream (T01.4), names
 * are engine names, and nothing here references MSW/IndexedDB/React. The demo Web Worker and
 * the future production `StarNetApiGateway` receive the SAME shape (DEMO-005).
 */
export interface ResolvedRunPoint {
  engineName: string;
  eastingM: number;
  northingM: number;
  heightM: number;
  /** false = held fixed (a fixed anchor/reference component set). */
  free: boolean;
  role: 'station' | TargetRole;
  /** Weak-constraint pseudo-observations (reference sigmas), per component. */
  constraints?: { component: 'e' | 'n' | 'h'; value: number; sigmaM: number }[];
}

/** A point the adjustment holds: fixed outright, or weighted by at least one weak constraint. */
export type HeldPoint = Pick<ResolvedRunPoint, 'free' | 'constraints'>;

/**
 * How many points hold this adjustment — the single definition of `references-available`.
 *
 * It is computed from the engine's *own* input rather than from a parallel walk of the
 * configuration, because every parallel walk drifted: one counted every point carrying a control
 * record, including records whose three components were all `free`, and the Output preview counted
 * every adjusted point, which published 33 references for a network held by three.
 *
 * A held point is what STAR*NET writes as a `C` record with a `!` or a sigma: fixed, or constrained.
 */
export function heldPointCount(points: readonly HeldPoint[]): number {
  return points.filter((point) => !point.free || (point.constraints?.length ?? 0) > 0).length;
}

export interface ResolvedRunObservation {
  /** Raw observation id (traceability to the source, DATA-007 — never mutated). */
  id: string;
  stationEngineName: string;
  targetEngineName: string;
  hzDeg: number;
  vzDeg: number;
  /** FINAL corrected slope distance (output of applyDistanceCorrections). */
  finalSlopeDistanceM: number;
  sigmaHzArcSec: number;
  sigmaVzArcSec: number;
  sigmaSdMm: number;
  sigmaSdPpm: number;
  instrumentHeightM: number;
  targetHeightM: number;
  /** Excluded from the trial (Auto Adjust / Analysis Lab) — the raw data is untouched (ADJ-007). */
  excluded?: boolean;
  /** Scalar components excluded by data snooping; other components of the raw sight remain usable. */
  excludedComponents?: Array<'hz' | 'vz' | 'sd'>;
  /** Never excluded by Auto Adjust. */
  protected?: boolean;
}

export interface ResolvedRunInput {
  processingId: number;
  configVersionId: string;
  outputSlot: string;
  adjustment: StarNetAdjustmentConfig;
  points: ResolvedRunPoint[];
  observations: ResolvedRunObservation[];
  /**
   * Station engine name -> fixed orientation (radians) for the local-anchor datum
   * (INIT-001/002): those stations' orientations are held, not solved.
   */
  fixedOrientationsRad?: Record<string, number>;
}

export interface DiagnosticResidual {
  /** Stable scalar id (`raw observation id:component`) used by Auto Adjust. */
  scalarObservationId: string;
  observationId: string;
  stationEngineName: string;
  targetEngineName: string;
  kind: 'hz' | 'vz' | 'sd' | 'constraint';
  residual: number;
  sigma: number;
  stdResidual: number;
  normalizedResidual: number;
  redundancy: number;
}

export interface DiagnosticPoint {
  engineName: string;
  role: ResolvedRunPoint['role'];
  eastingM: number;
  northingM: number;
  heightM: number;
  sigmaEM: number;
  sigmaNM: number;
  sigmaHM: number;
  ellipseSemiMajorM: number;
  ellipseSemiMinorM: number;
  ellipseOrientationDeg: number;
  observationCount: number;
  /** ADJ-010: single-ray/uncontrolled points are identified as such. */
  singleRay: boolean;
}

export interface AutoAdjustAttempt {
  attempt: number;
  excludedObservationId: string;
  excludedScalarObservationId: string;
  kind: 'hz' | 'vz' | 'sd';
  stdResidual: number;
  reason: string;
  chiSquareStatusAfter: ChiSquareStatus;
}

export interface AdjustmentDiagnostic {
  /** Explicit preview-engine label; never presented as a production STAR*NET result. */
  engineLabel: string;
  ok: boolean;
  failureReason?: string;
  converged: boolean;
  iterations: number;
  observationCount: number;
  constraintCount: number;
  unknownCount: number;
  rank: number;
  rankDeficiency: number;
  deficientUnknowns: string[];
  degreesOfFreedom: number;
  /** Canonical chi-square authority (audit B-04/item 5): not-applicable when dof <= 0. */
  chiSquareStatus: ChiSquareStatus;
  chiSquareLower: number;
  chiSquareUpper: number;
  weightedSSR: number;
  varianceFactor: number;
  maxStdResidual: number;
  points: DiagnosticPoint[];
  residuals: DiagnosticResidual[];
  autoAdjustAttempts: AutoAdjustAttempt[];
  warnings: string[];
}
