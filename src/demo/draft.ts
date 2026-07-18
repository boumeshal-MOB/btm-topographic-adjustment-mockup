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
  /** EDM program resolved for this station × target setup, never a station-wide value. */
  edmMode: string;
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
