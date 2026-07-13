/**
 * Domain contracts (rule PROC-001..003; source `domain/21-CONTRATS-DE-DONNEES.md`).
 *
 * This module is pure TypeScript: no React, no MSW, no IndexedDB, no filesystem access
 * (enforced by the src/domain ESLint boundary). These types are written from
 * `domain/21-CONTRATS-DE-DONNEES.md` directly — never ported from the old StarNet
 * `types/domain.ts`, which must not be reintroduced (`standard/expert` mode,
 * `OutputResultVersion`, `keepAllResultVersions`, `duplicateStrategy: new-version`, a global
 * station EDM/constant used as calculation authority).
 */

// ---------------------------------------------------------------------------------------
// 0. Raw observations (DATA-001..003: read via explicitly mapped BTM variables, never
//    inferred from a name alone)
// ---------------------------------------------------------------------------------------

export interface RawObservation {
  id: string;
  stationId: string;
  rawTargetName: string;
  /** Observation epoch (TIME-001) — never rounded, never replaced by an output slot. */
  epoch: string;
  hzDeg: number;
  vzDeg: number;
  sdM: number;
}

// ---------------------------------------------------------------------------------------
// 1. Processing
// ---------------------------------------------------------------------------------------

export type ProcessingStatus =
  | 'draft'
  | 'waiting_for_data'
  | 'ready'
  | 'running'
  | 'success'
  | 'warning'
  | 'provisional'
  | 'failed_qc'
  | 'technical_error'
  | 'disabled'
  | 'archived';

export interface TopographicAdjustmentProcessing {
  id: number;
  projectId: number;
  type: 'Topographic Adjustment';
  name: string;
  description?: string;
  scope: 'single-station' | 'network';
  active: boolean;
  activeConfigVersionId?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------------------
// 2. Configuration version
// ---------------------------------------------------------------------------------------

export type ConfigStatus = 'draft' | 'active' | 'archived';

export interface TemplateRef {
  templateId: string;
  templateVersion: number;
}

export interface AdjustmentConfigVersion {
  id: string;
  processingId: number;
  versionNumber: number;
  label: string;
  status: ConfigStatus;
  /** Inclusive. */
  validFrom: string;
  /** Exclusive. */
  validTo?: string;
  createdBy: number;
  createdAt: string;
  reason: string;
  usedByRun: boolean;
  countryPreset: TemplateRef;
  stationBindings: StationBinding[];
  targetBindings: TargetBinding[];
  physicalPoints: PhysicalPoint[];
  geometricRelationships: GeometricRelationship[];
  initialisation: InitialisationConfig;
  adjustment: StarNetAdjustmentConfig;
  runPolicy: RunPolicy;
  outputPolicy: OutputPolicy;
  overriddenFields: string[];
}

// ---------------------------------------------------------------------------------------
// 3. Input variables
// ---------------------------------------------------------------------------------------

export interface ObservationVariableBinding {
  prismSensorId: number;
  hzVariableId: number;
  vzVariableId: number;
  sdVariableId: number;
  metadataModeVariableId?: number;
  metadataReflectorVariableId?: number;
}

export interface EnvironmentalVariableBinding {
  temperatureVariableId?: number;
  pressureVariableId?: number;
  temporalToleranceMinutes: number;
}

// ---------------------------------------------------------------------------------------
// 4. Station
// ---------------------------------------------------------------------------------------

export interface StationBinding {
  stationId: number;
  stationCode: string;
  required: boolean;
  instrumentTemplateId: string;
  instrumentHeightM: number;
  atmosphericPolicy: AtmosphericPolicy;
  defaultMeasurementSetupId?: string;
}

export type AtmosphericMode =
  | 'already-applied'
  | 'cycle-temperature-pressure'
  | 'fixed-temperature-pressure'
  | 'none';

export type MissingEnvironmentPolicy =
  | 'wait-or-fail'
  | 'fixed-fallback'
  | 'continue-without-correction'
  | 'assume-already-corrected';

export interface AtmosphericPolicy {
  mode: AtmosphericMode;
  variables?: EnvironmentalVariableBinding;
  fixedTemperatureC?: number;
  fixedPressureHPa?: number;
  missingPolicy: MissingEnvironmentPolicy;
  fallbackTemperatureC?: number;
  fallbackPressureHPa?: number;
  marksResultProvisional: boolean;
  catchUpOnLateData: boolean;
  formulaId: string;
  formulaVersion: number;
}

// ---------------------------------------------------------------------------------------
// 5. Target and measurement setup
// ---------------------------------------------------------------------------------------

export type MeasurementType = 'prism' | 'reflective-sheet' | 'reflectorless';
export type TargetRole = 'reference' | 'monitoring' | 'auxiliary';

export interface TargetBinding {
  id: string;
  stationId: number;
  prismSensorId: number;
  rawTargetName: string;
  role: TargetRole;
  includeInAdjustment: boolean;
  publishOutput: boolean;
  observationVariables: ObservationVariableBinding;
  measurementSetup: ResolvedMeasurementSetup;
  physicalPointId: string;
  engineName: string;
  reviewStatus: 'ok' | 'to-review' | 'blocking';
}

export interface ResolvedMeasurementSetup {
  templateId?: string;
  measurementType: MeasurementType;
  edmMode: string;
  reflectorTemplateId?: string;
  requiredConstantM?: number;
  alreadyAppliedConstantM?: number;
  prismDeltaM: number;
  targetHeightM: number;
  distanceStdErrMm: number;
  distancePpm: number;
  sourceByField: Record<string, ValueSource>;
}

export type ValueSource =
  | 'observation-metadata'
  | 'versioned-mapping'
  | 'config-override'
  | 'template'
  | 'station-fallback';

// ---------------------------------------------------------------------------------------
// 6. Physical points and relationships
// ---------------------------------------------------------------------------------------

export interface PhysicalPoint {
  id: string;
  label: string;
  engineName: string;
  role: TargetRole;
  memberTargetBindingIds: string[];
  state: 'individual' | 'shared' | 'suggested' | 'inconsistent';
  source: 'prior-config' | 'manual' | 'geometry-confirmed' | 'default';
  decision?: {
    by: number;
    at: string;
    reason: string;
  };
}

export type GeometricRelationshipType =
  | 'slope-distance'
  | 'horizontal-distance'
  | 'height-difference'
  | 'azimuth-distance'
  | 'vector-3d';

export interface GeometricRelationship {
  id: string;
  pointAId: string;
  pointBId: string;
  type: GeometricRelationshipType;
  value: Record<string, number>;
  sigmaM: number;
  frame?: string;
  usage: 'initialisation' | 'adjustment' | 'check-only';
  source: string;
  note?: string;
}

// ---------------------------------------------------------------------------------------
// 7. Initialisation
// ---------------------------------------------------------------------------------------

export interface InitialisationConfig {
  mode: 'local-anchor' | 'known-references';
  observationWindow: { from: string; to: string };
  anchor?: {
    stationId: number;
    eastingM: number;
    northingM: number;
    heightM: number;
    orientationDeg: number;
  };
  references: ReferenceConstraint[];
  initialCoordinates: InitialCoordinate[];
  coverage: InitialisationCoverage;
}

export type ConstraintMode = 'fixed' | 'weak' | 'free';

export interface ReferenceConstraint {
  physicalPointId: string;
  eastingM: number;
  northingM: number;
  heightM: number;
  modeE: ConstraintMode;
  modeN: ConstraintMode;
  modeH: ConstraintMode;
  sigmaEM?: number;
  sigmaNM?: number;
  sigmaHM?: number;
  source: string;
}

export interface InitialCoordinate {
  physicalPointId: string;
  eastingM: number;
  northingM: number;
  heightM: number;
  stationCount: number;
  observationCount: number;
  horizontalSpreadM: number;
  verticalSpreadM: number;
  status: 'known' | 'computed' | 'review' | 'missing';
}

export interface InitialisationCoverage {
  availablePhysicalPoints: number;
  expectedPhysicalPoints: number;
  availableStationTargetPairs: number;
  expectedStationTargetPairs: number;
  rawObservationCount: number;
  representativeCount: number;
  missingPairs: Array<{ stationId: number; targetBindingId: string }>;
}

// ---------------------------------------------------------------------------------------
// 8. STAR*NET parameters
// ---------------------------------------------------------------------------------------

export interface StarNetWeights {
  distanceStdErrM: number;
  distancePpm: number;
  angleArcSec: number;
  directionArcSec: number;
  azimuthArcSec: number;
  zenithArcSec: number;
  instrumentCenteringM: number;
  targetCenteringM: number;
  verticalCenteringM: number;
}

export interface AutoAdjustConfig {
  enabled: boolean;
  maxStandardizedResidual: number;
  outliersRemovedPerIteration: number;
  maxIterations: number;
}

export interface StarNetAdjustmentConfig {
  templateId: string;
  templateVersion: number;
  adjustmentType: '3D';
  linearUnits: 'Meters';
  angleOutputUnits: 'DMS' | 'Gons';
  localOrGrid: 'local' | 'grid';
  coordinateOrder: 'EN' | 'NE';
  input3dMode: 'Slope/Zenith';
  scaleFactor: number;
  indexOfRefraction: number;
  earthRadiusM: number;
  /** Unitless STAR*NET convergence threshold — distinct from the demo solver's threshold (ADJ-002). */
  convergeLimit: number;
  maximumIterations: number;
  chiSquareSignificancePercent: number;
  performErrorPropagation: boolean;
  ellipseConfidencePercent: number;
  defaultWeights: StarNetWeights;
  autoAdjust: AutoAdjustConfig;
}

// ---------------------------------------------------------------------------------------
// 9. Run and output
// ---------------------------------------------------------------------------------------

export interface CatchUpPolicy {
  enabled: boolean;
  windowHours: number;
  onLateObservation: boolean;
  onLateEnvironment: boolean;
  maxRecalculationsPerSlot: number;
}

export interface RunPolicy {
  trigger: 'event-driven' | 'schedule' | 'manual';
  scheduleEveryMinutes?: number;
  syncToleranceMinutes: number;
  reuseMissingStation: boolean;
  maxReusedAgeMinutes: number;
  computeWithoutOptionalStations: boolean;
  markReuseProvisional: boolean;
  catchUp: CatchUpPolicy;
}

export type TargetOutputComponent =
  | 'adjusted-x'
  | 'adjusted-y'
  | 'adjusted-z'
  | 'delta-x'
  | 'delta-y'
  | 'delta-z'
  | 'sigma-x'
  | 'sigma-y'
  | 'sigma-z';

export type GlobalOutputComponent =
  | 'chi2-passed'
  | 'variance-factor'
  | 'references-available'
  | 'target-availability'
  | 'provisional-flag'
  | 'quality-code';

export interface OutputPolicy {
  intervalMinutes: number;
  alignment: 'utc-grid';
  maxEpochToSlotMinutes: number;
  publishProvisional: boolean;
  targetComponents: TargetOutputComponent[];
  globalComponents: GlobalOutputComponent[];
}

// ---------------------------------------------------------------------------------------
// 10. Stable output variable mapping
// ---------------------------------------------------------------------------------------

export interface ProcessingOutputVariable {
  processingId: number;
  variableId: number;
  scope: 'target' | 'global';
  prismSensorId?: number;
  component: TargetOutputComponent | GlobalOutputComponent;
}

// ---------------------------------------------------------------------------------------
// 11. Run summary and diagnostic
// ---------------------------------------------------------------------------------------

/**
 * Quality without redundancy (audit B-04). `not-applicable` is returned when `dof <= 0`:
 * a single-ray/exactly-determined epoch is never displayed as `passed`, and is never treated
 * as an ordinary `failed` chi-square either (ADJ-006, ADJ-010).
 */
export type ChiSquareStatus = 'passed' | 'failed' | 'not-applicable';

export interface AdjustmentRunSummary {
  id: string;
  processingId: number;
  configVersionId: string;
  outputSlot: string;
  trigger: 'event' | 'schedule' | 'manual' | 'catch-up' | 'reprocess' | 'test';
  status: 'running' | 'success' | 'provisional' | 'failed-qc' | 'technical-error';
  startedAt: string;
  finishedAt?: string;
  stationEpochs: Array<{
    stationId: number;
    epoch?: string;
    state: 'fresh' | 'reused' | 'missing';
    ageMinutes?: number;
  }>;
  autoAdjustAttempts: number;
  chiSquareStatus?: ChiSquareStatus;
  chi2Passed?: boolean;
  varianceFactor?: number;
  referencesAvailable?: number;
  targetAvailabilityPercent?: number;
  error?: { stage: string; code: string; message: string };
}
