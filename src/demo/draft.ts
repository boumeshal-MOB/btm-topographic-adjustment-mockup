import type {
  AtmosphericPolicy,
  ChiSquareStatus,
  ConstraintMode,
  MeasurementType,
  OutputPolicy,
  RunPolicy,
  StarNetAdjustmentConfig,
  TargetRole,
} from '@/domain/entities';
import type { DistanceKind } from '@/domain/corrections/distance-kind';
import type { InstrumentPrecision } from '@/domain/instruments/measurement-precision';
import type { InitialCoverageResult, ProvisionalCoordinateResult } from '@/domain/initialisation/initialisation';

/**
 * Wizard draft — the persisted state of the nine-step creation flow (`PROJECT_MAP.md`).
 * Draft data survives back/forward navigation and reloads; it is only turned into an immutable
 * `AdjustmentConfigVersion` at Review & Create.
 */

export interface DraftStationConfig {
  stationCode: string;
  required: boolean;
  instrumentTemplateId: string;
  instrumentHeightM: number;
  atmosphericPolicy: AtmosphericPolicy;
  /**
   * How well this station measures, and what its stored distance holds.
   *
   * A distance standard error belongs to the instrument and its reflector, and an angular one to
   * the instrument alone — never to the project. Seeded from the country template's instrument
   * entry; absent on a draft written before this moved here, in which case the template answers
   * again (`stationInstrumentPrecision`).
   */
  precision?: InstrumentPrecision;
  /** True once the surveyor restated a precision here: the number is theirs, not the template's. */
  precisionEdited?: boolean;
}

export interface DraftTargetConfig {
  stationCode: string;
  rawTargetName: string;
  role: TargetRole;
  measurementType: MeasurementType;
  /**
   * EDM program of this station × target setup (`precise-prism`, `fine-prism`…). Inherited metadata
   * kept for traceability: no correction, weight or native record derives from it, so the interface
   * no longer offers it as a decision.
   */
  edmMode: string;
  measurementSetupId?: string;
  requiredConstantM: number;
  alreadyAppliedConstantM: number;
  targetHeightM: number;
  /**
   * What the stored distance variable holds. STAR*NET reads a distance through its project-level 3D
   * input mode, so a horizontal one is converted to the slope distance at resolve time rather than
   * changing the native record. Absent = whatever the station's instrument declares.
   */
  distanceKind?: DistanceKind;
  /**
   * Per-sight precision. Absent — the normal case — means the station's instrument answers; a
   * value here is an explicit statement that *this* sight is measured differently.
   */
  distanceStdErrMm?: number;
  distancePpm?: number;
  directionStdErrArcSec?: number;
  zenithStdErrArcSec?: number;
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

/**
 * One coordinate record of the network — the exact contents of a STAR*NET `C` line.
 *
 * It covers **any** engine point, stations included (`pointKey` is then `station:<code>`), because
 * STAR*NET gives a station no special status: a station is fixed, weighted or free like any other
 * point. A row exists only for a *controlled* point; a free point needs none, and freeing a point is
 * therefore removing its row.
 *
 * The numbers (coordinates and declared precision) are owned by the Initialisation step, the
 * fixed/weak/free decision by the Adjustment step. Both write here, so the datum can never drift
 * from the coordinates it constrains.
 */
export interface DraftReference {
  pointKey: string;
  eastingM: number;
  northingM: number;
  heightM: number;
  modeE: ConstraintMode;
  modeN: ConstraintMode;
  modeH: ConstraintMode;
  /** Declared precision when a single value covers the three components. */
  sigmaM: number;
  /** Per-component precision, when the survey declares three different ones. */
  sigmaEM?: number;
  sigmaNM?: number;
  sigmaHM?: number;
  source: string;
}

/** A coordinate typed in or imported from `initial.csv`: an approximation, never a control. */
export interface DraftInitialCoordinate {
  pointKey: string;
  eastingM: number;
  northingM: number;
  heightM: number;
  source: 'manual' | 'csv';
}

export interface DraftInitialisationResult {
  computedAt: string;
  coordinates: (ProvisionalCoordinateResult & { status: 'computed' | 'review' })[];
  stationSolutions: { stationCode: string; eastingM: number; northingM: number; heightM: number; orientationDeg: number; source: string; problems: string[] }[];
  coverage: InitialCoverageResult;
  failures: { subject: string; reason: string }[];
  accepted: boolean;
}

/** One adjusted point of the trial: what the nine output components of that point would carry. */
export interface DraftTestEpochPoint {
  engineName: string;
  eastingM: number;
  northingM: number;
  heightM: number;
  sigmaEM: number;
  sigmaNM: number;
  sigmaHM: number;
}

export interface DraftTestEpoch {
  slot: string;
  provisional: boolean;
  varianceFactor: number;
  chiSquareStatus: ChiSquareStatus;
  points: DraftTestEpochPoint[];
}

export interface WizardDraft {
  id: string;
  updatedAt: string;
  step: number;

  /** Present only when the wizard edits an existing processing through a new config version. */
  editContext?: {
    processingId: number;
    baseVersionId: string;
    baseVersionLabel: string;
  };

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

  /**
   * 5. Initialisation — how the *approximate* coordinates are obtained. Fixing a station here is a
   * computation device, not a datum: the datum of every future run is decided in Adjustment.
   */
  initialisation: {
    mode: 'known-references' | 'entered' | 'local-anchor';
    anchorStationCode?: string;
    anchorEastingM: number;
    anchorNorthingM: number;
    anchorHeightM: number;
    anchorOrientationDeg: number;
    windowFrom: string;
    windowTo: string;
    /** Coordinate records: known references, and the datum rows the Adjustment step maintains. */
    references: DraftReference[];
    /** Typed in or imported approximations, used by the `entered` mode. */
    enteredCoordinates: DraftInitialCoordinate[];
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
  /** Set after a successful Adjustment preflight — gates `Create and activate`. */
  testEpochPassed: boolean;
  /**
   * What the last trial produced, kept so the Output step can state the variables this processing
   * will create with the numbers of the cycle the adjustment was built on — rather than a count.
   *
   * A projection, not the diagnostic: the residuals and the native files are a conversation with the
   * network, they have no place in the configuration being created. Cleared with `testEpochPassed`
   * whenever the configuration stops describing them.
   */
  testEpoch?: DraftTestEpoch;

  // 7. Run
  runPolicy: RunPolicy;

  // 8. Output
  outputPolicy: OutputPolicy;
}

const INITIALISATION_INPUT_KEYS = new Set<keyof WizardDraft>([
  'countryPresetId',
  'scope',
  'stationCodes',
  'stations',
  'targets',
  'sharedPoints',
]);

const TEST_EPOCH_INPUT_KEYS = new Set<keyof WizardDraft>([
  ...INITIALISATION_INPUT_KEYS,
  'initialisation',
  'adjustment',
  'weightsRequireValidation',
  'chiSquareFailurePolicy',
  'runPolicy',
  'outputPolicy',
]);

/**
 * Applies an editor patch while invalidating scientific results that no longer describe the
 * configuration. Navigation and descriptive fields intentionally keep the current results.
 */
export function applyWizardDraftPatch(draft: WizardDraft, patch: Partial<WizardDraft>): WizardDraft {
  const changedKeys = Object.keys(patch) as (keyof WizardDraft)[];
  const invalidatesInitialisation = changedKeys.some((key) => INITIALISATION_INPUT_KEYS.has(key));
  const invalidatesTestEpoch = changedKeys.some((key) => TEST_EPOCH_INPUT_KEYS.has(key));
  const next: WizardDraft = { ...draft, ...patch };
  if (invalidatesInitialisation) {
    next.initialisation = { ...next.initialisation, result: undefined };
  }
  if (invalidatesTestEpoch && patch.testEpochPassed === undefined) {
    next.testEpochPassed = false;
    // The trial's numbers described the previous configuration; keeping them would let the Output
    // step state variables computed from a cycle this draft no longer describes.
    next.testEpoch = undefined;
  }
  return next;
}

export interface DraftPhysicalIdentity {
  physicalKey: string;
  engineName: string;
  members: string[];
}

/** Resolve the draft's effective physical points exactly as Review/Create will do. */
export function resolveDraftPhysicalIdentities(draft: WizardDraft): {
  identities: DraftPhysicalIdentity[];
  duplicateMembers: string[];
} {
  const targetsBySource = new Map(draft.targets.map((target) => [`${target.stationCode}|${target.rawTargetName}`, target]));
  const assigned = new Map<string, string>();
  const duplicateMembers = new Set<string>();
  const identities: DraftPhysicalIdentity[] = [];

  for (const shared of draft.sharedPoints) {
    const members = shared.members
      .map((member) => `${member.stationCode}|${member.rawTargetName}`)
      .filter((sourceKey) => targetsBySource.has(sourceKey));
    if (members.length === 0) continue;
    for (const sourceKey of members) {
      if (assigned.has(sourceKey)) duplicateMembers.add(sourceKey);
      assigned.set(sourceKey, shared.key);
    }
    identities.push({
      physicalKey: `shared:${shared.key}`,
      engineName: targetsBySource.get(members[0])!.engineName,
      members,
    });
  }

  for (const [sourceKey, target] of targetsBySource) {
    if (assigned.has(sourceKey)) continue;
    identities.push({ physicalKey: `individual:${sourceKey}`, engineName: target.engineName, members: [sourceKey] });
  }
  return { identities, duplicateMembers: [...duplicateMembers].sort() };
}

/** Duplicate names are valid inside one confirmed point, but never across physical points. */
export function draftEngineNameCollisions(draft: WizardDraft): string[] {
  const { identities } = resolveDraftPhysicalIdentities(draft);
  const firstOwner = new Map<string, string>();
  const collisions = new Set<string>();
  for (const identity of identities) {
    const owner = firstOwner.get(identity.engineName);
    if (owner !== undefined && owner !== identity.physicalKey) collisions.add(identity.engineName);
    else firstOwner.set(identity.engineName, identity.physicalKey);
  }
  return [...collisions].sort();
}
