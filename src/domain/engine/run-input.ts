import type { ChiSquareStatus, StarNetAdjustmentConfig, TargetRole } from '@/domain/entities';

/**
 * Resolved run input — the immutable snapshot consumed by any `AdjustmentEngine`
 * (`PROJECT_MAP.md §8`): corrections are already applied exactly once upstream (T01.4), names
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
  observationId: string;
  stationEngineName: string;
  targetEngineName: string;
  kind: 'hz' | 'vz' | 'sd' | 'constraint';
  residual: number;
  sigma: number;
  stdResidual: number;
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
  kind: 'hz' | 'vz' | 'sd';
  stdResidual: number;
  reason: string;
  chiSquareStatusAfter: ChiSquareStatus;
}

export interface AdjustmentDiagnostic {
  /** Always `Demo solver — not production/certified STAR*NET result` in this mock-up (DEMO-004). */
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
