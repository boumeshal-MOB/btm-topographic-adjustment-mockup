import type {
  AtmosphericPolicy,
  ConstraintMode,
  MeasurementType,
  OutputPolicy,
  RunPolicy,
  StarNetAdjustmentConfig,
  TargetRole,
} from '@/domain/entities';
import type { InitialCoverageResult, ProvisionalCoordinateResult } from '@/domain/initialisation/initialisation';

/**
 * Wizard draft — the persisted state of the nine-step creation flow (`PROJECT_MAP.md §7`).
 * Draft data survives back/forward navigation and reloads; it is only turned into an immutable
 * `AdjustmentConfigVersion` at Review & Create.
 */

export interface DraftStationConfig {
  stationCode: string;
  required: boolean;
  instrumentTemplateId: string;
  instrumentHeightM: number;
  atmosphericPolicy: AtmosphericPolicy;
}

export interface DraftTargetConfig {
  stationCode: string;
  rawTargetName: string;
  role: TargetRole;
  measurementType: MeasurementType;
  measurementSetupId?: string;
  requiredConstantM: number;
  alreadyAppliedConstantM: number;
  targetHeightM: number;
  distanceStdErrMm: number;
  distancePpm: number;
  includeInAdjustment: boolean;
  publishOutput: boolean;
  engineName: string;
  reviewStatus: 'ok' | 'to-review' | 'blocking';
}

/** A confirmed shared physical point (network only) — human-confirmed, never automatic (POINT-011). */
export interface DraftSharedPoint {
  key: string;
  members: { stationCode: string; rawTargetName: string }[];
  source: 'manual' | 'geometry-confirmed' | 'prior-config';
  confirmedAtStep?: string;
}

export interface DraftReference {
  pointKey: string;
  eastingM: number;
  northingM: number;
  heightM: number;
  modeE: ConstraintMode;
  modeN: ConstraintMode;
  modeH: ConstraintMode;
  sigmaM: number;
  source: string;
}

export interface DraftInitialisationResult {
  computedAt: string;
  coordinates: (ProvisionalCoordinateResult & { status: 'computed' | 'review' })[];
  stationSolutions: { stationCode: string; eastingM: number; northingM: number; heightM: number; orientationDeg: number; source: string; problems: string[] }[];
  coverage: InitialCoverageResult;
  failures: { subject: string; reason: string }[];
  accepted: boolean;
}

export interface WizardDraft {
  id: string;
  updatedAt: string;
  step: number;

  // 1. General
  name: string;
  description: string;
  scope: 'single-station' | 'network';
  countryPresetId: 'uk-supplied-hs2-nte' | 'fr-starnet-monitoring';
  validFrom: string;
  activateAfterCreation: boolean;

  // 2. Stations
  stationCodes: string[];

  // 3. Instruments
  stations: DraftStationConfig[];

  // 4. Targets & measurements (+ shared physical points for networks)
  targets: DraftTargetConfig[];
  sharedPoints: DraftSharedPoint[];

  // 5. Initialisation
  initialisation: {
    mode: 'local-anchor' | 'known-references';
    anchorStationCode?: string;
    anchorEastingM: number;
    anchorNorthingM: number;
    anchorHeightM: number;
    anchorOrientationDeg: number;
    windowFrom: string;
    windowTo: string;
    references: DraftReference[];
    result?: DraftInitialisationResult;
  };

  // 6. Adjustment
  adjustment: StarNetAdjustmentConfig;
  /**
   * True when the preset left `defaultWeights` unresolved (FR, audit D-05): the values shown
   * are manufacturer nominal PROPOSALS and `Create and activate` stays blocked until the user
   * confirms them in the Adjustment step.
   */
  weightsRequireValidation: boolean;
  chiSquareFailurePolicy: 'fail-run' | 'auto-adjust' | 'publish-failed-qc';
  /** Set after a successful Test one epoch — gates `Create and activate` (front/11 §Étape 1). */
  testEpochPassed: boolean;

  // 7. Run
  runPolicy: RunPolicy;

  // 8. Output
  outputPolicy: OutputPolicy;
}
