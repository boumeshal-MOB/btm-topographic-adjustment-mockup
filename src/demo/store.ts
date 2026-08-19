import ukPresetJson from '@/configs/uk-supplied-hs2-nte.v1.json';
import frPresetJson from '@/configs/fr-starnet-monitoring.v1.json';
import type {
  AdjustmentConfigVersion,
  AdjustmentRunSummary,
  ProcessingOutputVariable,
  RawObservation,
  StarNetAdjustmentConfig,
  StarNetWeights,
  TargetBinding,
  TopographicAdjustmentProcessing,
} from '@/domain/entities';
import { countryPresetSchema, type CountryPresetSeed } from '@/domain/schemas/countryPreset.schema';
import { assignEngineNames } from '@/domain/point-identity/engine-names';
import { checkLocalGeometry, localPointFromObservation, stationConnectivity, type GeometryCheck, type SeedPair } from '@/domain/point-identity/local-geometry';
import { computeInitialCoordinates } from '@/domain/initialisation/initialisation';
import { applyDistanceCorrections } from '@/domain/corrections';
import { alignSlot, listSlots, nearestSlot, resolveConfigForSlot } from '@/domain/time/slots';
import { buildOutputVariablePlan, targetAvailabilityPercent } from '@/domain/outputs/output-plan';
import { chi2PassedOutputValue } from '@/domain/chi-square';
import { DEG2RAD } from '@/domain/math/geometry';
import { runDemoAdjustment, runDemoAdjustmentWithAutoAdjust } from '@/domain/engine/demo-engine-core';
import type { AdjustmentDiagnostic } from '@/domain/engine/run-input';
import type {
  AnalysisAdjustmentOverrides,
  AnalysisCandidateChanges,
  AnalysisObservationSnapshot,
  AnalysisPointSnapshot,
  AnalysisTrialOverrides,
} from '@/domain/analysis/types';
import { CONTROL_COMPONENTS, effectiveControlConstraints } from '@/domain/analysis/control-constraints';
import {
  buildDatPreview,
  buildPrjPreview,
  type NativePreviews,
  type StarNetPreviewInput,
} from '@/domain/starnet/preview-builder';
import { demoCatalogue, mergeCatalogue, type CatalogueFragment, type DemoCatalogue } from '@/demo/catalogue';
import type { FaceReductionPolicy, ValidationImportPlan } from '@/domain/validation-catalogue/adapter';
import { buildVersionFromDraft, resolveRunInputForSlot, type ResolvedSlotRun } from '@/demo/resolve-run';
import type { DraftInitialisationResult, DraftTargetConfig, WizardDraft } from '@/demo/draft';
import { lastPersistResult, loadDatabase, persistDatabase, type PersistResult } from '@/demo/persistence';

/**
 * DemoStore — the mock-up's in-browser "BTM backend" (VALIDATION-DATASETS.md §1/§9): repositories + run
 * simulation behind the MSW HTTP layer. It simulates the production invariants (immutable used
 * versions, `[validFrom, validTo[`, stable output variables, unique UPSERT per
 * `(variable_id, timestamp)`) without ever being one (DEMO-005). A reset returns to the seed.
 */

export type ChiSquareFailurePolicy = 'fail-run' | 'auto-adjust' | 'publish-failed-qc';

export interface StoredVersion extends AdjustmentConfigVersion {
  chiSquareFailurePolicy: ChiSquareFailurePolicy;
  /** Proof that this exact immutable snapshot passed the configuration preflight before activation. */
  preflightTestedAt?: string;
  /** Observation ids excluded by an Analysis Lab candidate (trial exclusions, ADJ-007). */
  analysisExclusions?: string[];
  /** FR weights left unresolved by the preset require explicit confirmation (audit D-05). */
  weightsRequireValidation?: boolean;
}

export interface StoredMeasure {
  variableId: number;
  timestamp: string;
  value: number;
}

export interface AuditEntry {
  at: string;
  action: string;
  subject: string;
  detail: string;
}

/**
 * A processing created from the generated validation catalogue.
 *
 * Only the *pointer* to the dataset is persisted — never its observations (too large for
 * localStorage) and never its oracle (blind mode must survive a reload). The raw data is rebuilt
 * by re-importing the shard at start-up, and the answer is fetched only when explicitly revealed.
 */
export interface ValidationSessionRecord {
  processingId: number;
  datasetId: string;
  template: 'UK' | 'FR';
  faceReduction: FaceReductionPolicy;
  importedAt: string;
  stationCodes: string[];
}

export interface DemoDatabase {
  nextId: number;
  processings: TopographicAdjustmentProcessing[];
  versions: StoredVersion[];
  outputVariables: (ProcessingOutputVariable & { key: string })[];
  /** `${variableId}|${timestamp}` -> value — THE unique final state per key (OUT-009/010). */
  measures: Record<string, number>;
  runs: AdjustmentRunSummary[];
  diagnostics: Record<string, AdjustmentDiagnostic>;
  drafts: WizardDraft[];
  audit: AuditEntry[];
  /** True once the late SYN_C observations have been delivered (catch-up demo). */
  lateDataDelivered: boolean;
  /** Pointers to imported validation datasets; raw data is rebuilt, never persisted. */
  validationSessions: ValidationSessionRecord[];
}

const emptyDatabase = (): DemoDatabase => ({
  nextId: 1,
  processings: [],
  versions: [],
  outputVariables: [],
  measures: {},
  runs: [],
  diagnostics: {},
  drafts: [],
  audit: [],
  lateDataDelivered: false,
  validationSessions: [],
});

const ukPreset = countryPresetSchema.parse(ukPresetJson);
const frPreset = countryPresetSchema.parse(frPresetJson);

export const PRESETS: Record<string, CountryPresetSeed> = {
  'uk-supplied-hs2-nte': ukPreset,
  'fr-starnet-monitoring': frPreset,
};

/** Manufacturer-nominal Topcon MS05AXII proposal used when FR weights are unresolved (D-05). */
const FR_PROPOSED_WEIGHTS: StarNetWeights = {
  distanceStdErrM: 0.0008,
  distancePpm: 1,
  angleArcSec: 0.5,
  directionArcSec: 0.5,
  azimuthArcSec: 0.5,
  zenithArcSec: 0.5,
  instrumentCenteringM: 0.0005,
  targetCenteringM: 0.0005,
  verticalCenteringM: 0.0005,
};

export class DemoStore {
  db: DemoDatabase;
  /**
   * Fixture catalogue, extended in memory by every imported validation dataset. Mutable because a
   * dataset is loaded after start-up; the fixture singleton itself is never modified.
   */
  catalogue: DemoCatalogue;

  constructor(seedExample = true) {
    this.catalogue = demoCatalogue();
    const loaded = loadDatabase();
    this.db = loaded ?? emptyDatabase();
    // Databases persisted before validation sessions existed have no such array.
    if (!Array.isArray(this.db.validationSessions)) this.db.validationSessions = [];
    if (!loaded && seedExample) this.seed();
  }

  private nextId(prefix: string): string {
    return `${prefix}-${this.db.nextId++}`;
  }

  private nextNumericId(): number {
    return this.db.nextId++;
  }

  private now(): string {
    return new Date().toISOString();
  }

  private persist(): void {
    persistDatabase(this.db);
  }

  private auditLog(action: string, subject: string, detail: string): void {
    this.db.audit.unshift({ at: this.now(), action, subject, detail });
    this.db.audit = this.db.audit.slice(0, 200);
  }

  reset(): void {
    this.db = emptyDatabase();
    this.seed();
    this.persist();
  }

  // ------------------------------------------------------------------ drafts

  listDrafts(): WizardDraft[] {
    return this.db.drafts;
  }

  getDraft(id: string): WizardDraft | undefined {
    return this.db.drafts.find((d) => d.id === id);
  }

  createDraft(presetId: WizardDraft['countryPresetId'], scope: WizardDraft['scope']): WizardDraft {
    const draft = this.defaultDraft(presetId, scope);
    this.db.drafts.push(draft);
    this.persist();
    return draft;
  }

  /**
   * Opens an existing processing in the same nine-step editor without mutating its historical
   * configuration. Saving this draft creates the next version (VER-001/002).
   */
  createEditDraft(processingId: number, requestedVersionId?: string): WizardDraft {
    const processing = this.requireProcessing(processingId);
    const versions = this.db.versions.filter((version) => version.processingId === processingId);
    const source = requestedVersionId
      ? this.requireVersion(processingId, requestedVersionId)
      : versions.find((version) => version.id === processing.activeConfigVersionId) ?? versions.at(-1);
    if (!source) throw new Error(`Processing ${processingId} has no configuration version to edit`);

    // "Edit processing" deliberately starts from the stored configuration every time. Reusing a
    // previous autosaved edit draft made the editor inherit obsolete UI shapes after deployments
    // and could reopen half-applied changes. An explicit draft can still be resumed from the
    // Drafts table; this action is the clean-start path requested by the user.
    this.db.drafts = this.db.drafts.filter(
      (draft) => draft.editContext?.processingId !== processingId,
    );

    const presetId = source.countryPreset.templateId as WizardDraft['countryPresetId'];
    if (!(presetId in PRESETS)) throw new Error(`Unsupported country template ${source.countryPreset.templateId}`);
    const stationCodeById = new Map(source.stationBindings.map((station) => [station.stationId, station.stationCode]));
    const bindingById = new Map(source.targetBindings.map((binding) => [binding.id, binding]));
    const pointById = new Map(source.physicalPoints.map((point) => [point.id, point]));
    const now = this.now();
    const draft = this.defaultDraft(presetId, processing.scope);

    draft.editContext = { processingId, baseVersionId: source.id, baseVersionLabel: source.label };
    draft.name = processing.name;
    draft.description = processing.description ?? '';
    draft.validFrom = now;
    draft.activateAfterCreation = false;
    draft.stationCodes = source.stationBindings.map((station) => station.stationCode);
    draft.stations = structuredClone(source.stationBindings).map((station) => ({
      stationCode: station.stationCode,
      required: station.required,
      instrumentTemplateId: station.instrumentTemplateId,
      instrumentHeightM: station.instrumentHeightM,
      atmosphericPolicy: station.atmosphericPolicy,
    }));
    draft.targets = source.targetBindings.map((binding) => ({
      stationCode: stationCodeById.get(binding.stationId) ?? `station-${binding.stationId}`,
      rawTargetName: binding.rawTargetName,
      role: binding.role,
      measurementType: binding.measurementSetup.measurementType,
      edmMode: binding.measurementSetup.edmMode,
      measurementSetupId: binding.measurementSetup.templateId,
      requiredConstantM: binding.measurementSetup.requiredConstantM ?? 0,
      alreadyAppliedConstantM: binding.measurementSetup.alreadyAppliedConstantM ?? 0,
      targetHeightM: binding.measurementSetup.targetHeightM,
      distanceStdErrMm: binding.measurementSetup.distanceStdErrMm,
      distancePpm: binding.measurementSetup.distancePpm,
      includeInAdjustment: binding.includeInAdjustment,
      publishOutput: binding.publishOutput,
      engineName: binding.engineName,
      reviewStatus: binding.reviewStatus,
    }));
    draft.sharedPoints = source.physicalPoints
      .filter((point) => point.state === 'shared')
      .map((point) => ({
        key: point.label,
        members: point.memberTargetBindingIds
          .map((bindingId) => bindingById.get(bindingId))
          .filter((binding): binding is TargetBinding => binding !== undefined)
          .map((binding) => ({
            stationCode: stationCodeById.get(binding.stationId) ?? `station-${binding.stationId}`,
            rawTargetName: binding.rawTargetName,
          })),
        source: 'prior-config' as const,
      }));
    const anchorStationCode = source.initialisation.anchor
      ? stationCodeById.get(source.initialisation.anchor.stationId)
      : undefined;
    draft.initialisation = {
      mode: source.initialisation.mode,
      anchorStationCode,
      anchorEastingM: source.initialisation.anchor?.eastingM ?? 0,
      anchorNorthingM: source.initialisation.anchor?.northingM ?? 0,
      anchorHeightM: source.initialisation.anchor?.heightM ?? 0,
      anchorOrientationDeg: source.initialisation.anchor?.orientationDeg ?? 0,
      windowFrom: source.initialisation.observationWindow.from,
      windowTo: source.initialisation.observationWindow.to,
      enteredCoordinates: [],
      references: source.initialisation.references.map((reference) => ({
        pointKey: pointById.get(reference.physicalPointId)?.engineName ?? reference.physicalPointId,
        eastingM: reference.eastingM,
        northingM: reference.northingM,
        heightM: reference.heightM,
        modeE: reference.modeE,
        modeN: reference.modeN,
        modeH: reference.modeH,
        sigmaM: reference.sigmaEM ?? reference.sigmaNM ?? reference.sigmaHM ?? 0.001,
        source: reference.source,
      })),
    };
    draft.adjustment = structuredClone(source.adjustment);
    draft.runPolicy = structuredClone(source.runPolicy);
    draft.outputPolicy = structuredClone(source.outputPolicy);
    draft.chiSquareFailurePolicy = source.chiSquareFailurePolicy;
    draft.weightsRequireValidation = source.weightsRequireValidation ?? false;
    draft.testEpochPassed = false;

    // Recalculate the editable approximation from the source window. The stored version remains
    // untouched; the user sees a current, reviewable result and must retest before activation.
    const initialisation = this.computeDraftInitialisation(draft);
    initialisation.accepted = initialisation.failures.length === 0;
    draft.initialisation.result = initialisation;
    this.db.drafts.push(draft);
    this.auditLog('open-edit', `processing:${processingId}`, `Opened ${source.label} as editable wizard draft ${draft.id}`);
    this.persist();
    return draft;
  }

  /** Apply a different country preset as a fresh proposal while preserving draft identity/text. */
  applyPreset(draft: WizardDraft, presetId: WizardDraft['countryPresetId']): WizardDraft {
    if (draft.countryPresetId === presetId) return draft;
    const replacement = this.defaultDraft(presetId, draft.scope, draft.stationCodes);
    replacement.id = draft.id;
    replacement.updatedAt = draft.updatedAt;
    replacement.step = draft.step;
    replacement.name = draft.name;
    replacement.description = draft.description;
    replacement.validFrom = draft.validFrom || replacement.validFrom;
    replacement.activateAfterCreation = draft.activateAfterCreation;
    Object.assign(draft, replacement);
    return draft;
  }

  saveDraft(draft: WizardDraft): WizardDraft {
    const index = this.db.drafts.findIndex((d) => d.id === draft.id);
    const next = { ...draft, updatedAt: this.now() };
    if (index >= 0) this.db.drafts[index] = next;
    else this.db.drafts.push(next);
    this.persist();
    return next;
  }

  deleteDraft(id: string): void {
    this.db.drafts = this.db.drafts.filter((d) => d.id !== id);
    this.persist();
  }

  /** Default draft for a preset+scope — proposals only; nothing invented as confirmed data. */
  defaultDraft(presetId: WizardDraft['countryPresetId'], scope: WizardDraft['scope'], stationCodes?: string[]): WizardDraft {
    const preset = PRESETS[presetId];
    const codes = stationCodes ?? [];
    const now = this.now();
    const weightsUnresolved = preset.adjustment.defaultWeights === null;
    const adjustment: StarNetAdjustmentConfig = {
      ...preset.adjustment,
      defaultWeights: preset.adjustment.defaultWeights ?? FR_PROPOSED_WEIGHTS,
    };
    const draft: WizardDraft = {
      id: this.nextId('draft'),
      updatedAt: now,
      step: 0,
      name: '',
      description: '',
      scope,
      countryPresetId: presetId,
      validFrom: '',
      activateAfterCreation: false,
      stationCodes: codes,
      stations: [],
      targets: [],
      sharedPoints: [],
      initialisation: {
        mode: 'local-anchor',
        anchorStationCode: undefined,
        anchorEastingM: 0,
        anchorNorthingM: 0,
        anchorHeightM: 0,
        anchorOrientationDeg: 0,
        windowFrom: '',
        windowTo: '',
        references: [],
        enteredCoordinates: [],
        result: undefined,
      },
      adjustment,
      weightsRequireValidation: weightsUnresolved,
      chiSquareFailurePolicy: 'fail-run',
      testEpochPassed: false,
      runPolicy: preset.runPolicy,
      outputPolicy: preset.outputPolicy,
    };
    if (codes.length > 0) this.applyStationSelection(draft, codes);
    return draft;
  }

  /** (Re)builds station/target proposals after the station selection changed (step 2 → 3/4). */
  applyStationSelection(draft: WizardDraft, stationCodes: string[]): WizardDraft {
    const preset = PRESETS[draft.countryPresetId];
    draft.stationCodes = stationCodes;
    draft.stations = stationCodes.map((code) => {
      const info = this.catalogue.stations.find((s) => s.stationCode === code);
      const hasEnv = info?.hasEnvironmentVariables ?? false;
      const presetMode = preset.atmosphericPolicy.mode;
      // If the preset proposes cycle-T/P but the station has no T/P variables, propose `none`
      // (FRONTEND-AND-ANALYSIS-LAB.md §D) rather than a mode that can never resolve — visible, not silent.
      const mode = presetMode === 'cycle-temperature-pressure' && !hasEnv ? 'none' : presetMode;
      return {
        stationCode: code,
        required: true,
        instrumentTemplateId: preset.instrumentTemplates[0].id,
        instrumentHeightM: info?.defaultInstrumentHeightM ?? 0,
        atmosphericPolicy: {
          mode,
          missingPolicy: preset.atmosphericPolicy.missingPolicy,
          marksResultProvisional: preset.atmosphericPolicy.marksResultProvisional,
          catchUpOnLateData: preset.atmosphericPolicy.catchUpOnLateData,
          formulaId: preset.atmosphericPolicy.formulaId,
          formulaVersion: preset.atmosphericPolicy.formulaVersion,
          variables: hasEnv ? { temporalToleranceMinutes: 15 } : undefined,
        },
      };
    });

    const targets = this.catalogue.targets.filter((t) => stationCodes.includes(t.stationCode));
    const assignments = assignEngineNames(
      targets.map((t) => ({ sourceKey: `${t.stationCode}|${t.rawTargetName}`, candidate: t.adjustmentName ?? t.rawTargetName })),
    );
    const nameBySource = new Map(assignments.map((a) => [a.sourceKey, a]));
    draft.targets = targets.map((t): DraftTargetConfig => {
      const setup = preset.measurementSetups.find(
        (s) => s.measurementType === 'prism' && Math.abs((s.requiredConstantM ?? 0) - (t.prismConstantM ?? 0)) < 1e-9,
      ) ?? preset.measurementSetups[0];
      const assignment = nameBySource.get(`${t.stationCode}|${t.rawTargetName}`)!;
      return {
        stationCode: t.stationCode,
        rawTargetName: t.rawTargetName,
        role: t.isKnownReference ? 'reference' : 'monitoring',
        measurementType: setup.measurementType,
        edmMode: setup.edmMode,
        measurementSetupId: setup.id,
        requiredConstantM: t.prismConstantM ?? setup.requiredConstantM ?? 0,
        alreadyAppliedConstantM: setup.alreadyAppliedConstantM ?? 0,
        targetHeightM: t.targetHeightM,
        distanceStdErrMm: preset.adjustment.defaultWeights
          ? preset.adjustment.defaultWeights.distanceStdErrM * 1000
          : FR_PROPOSED_WEIGHTS.distanceStdErrM * 1000,
        distancePpm: preset.adjustment.defaultWeights?.distancePpm ?? FR_PROPOSED_WEIGHTS.distancePpm,
        includeInAdjustment: true,
        publishOutput: !t.isKnownReference,
        engineName: assignment.engineName,
        reviewStatus: assignment.issues.length > 0 ? 'to-review' : 'ok',
      };
    });

    // The observation graph changed. Relationships and test results from the previous graph
    // must not survive silently.
    draft.sharedPoints = [];
    draft.testEpochPassed = false;

    // default initialisation proposal: anchor = first station, window = last 24 h of data
    const first = this.catalogue.stations.find((s) => s.stationCode === stationCodes[0]);
    if (first) {
      const to = first.lastEpoch;
      const from = new Date(Math.max(new Date(first.firstEpoch).getTime(), new Date(to).getTime() - 24 * 3600_000)).toISOString();
      draft.initialisation.anchorStationCode = stationCodes[0];
      draft.initialisation.windowFrom = from;
      draft.initialisation.windowTo = to;
      draft.validFrom = draft.validFrom || first.firstEpoch;
    }
    draft.initialisation.result = undefined;
    return draft;
  }

  // ------------------------------------------------ initialisation & geometry

  /** Correction map for a set of observations under the draft's setups/policies. */
  private correctionsForDraft(draft: WizardDraft, observations: RawObservation[]): Map<string, number> {
    const setupByKey = new Map(draft.targets.map((t) => [`${t.stationCode}|${t.rawTargetName}`, t]));
    const policyByStation = new Map(draft.stations.map((s) => [s.stationCode, s.atmosphericPolicy]));
    const corrected = new Map<string, number>();
    for (const o of observations) {
      const target = setupByKey.get(`${o.stationCode}|${o.rawTargetName}`);
      const policy = policyByStation.get(o.stationCode);
      if (!target || !policy) continue;
      const { finalSlopeDistanceM } = applyDistanceCorrections(
        o,
        {
          measurementType: target.measurementType,
          requiredConstantM: target.requiredConstantM,
          alreadyAppliedConstantM: target.alreadyAppliedConstantM,
          sourceByField: {},
        },
        policy,
        this.catalogue.envByStation.get(o.stationCode) ?? [],
      );
      corrected.set(o.id, finalSlopeDistanceM);
    }
    return corrected;
  }

  private draftPointKey(draft: WizardDraft): Map<string, string> {
    // `${stationCode}|${rawTargetName}` -> point key (shared engine name or own engine name)
    const map = new Map<string, string>();
    const shared = new Map<string, string>();
    for (const s of draft.sharedPoints) {
      const primary = draft.targets.find(
        (t) => t.stationCode === s.members[0]?.stationCode && t.rawTargetName === s.members[0]?.rawTargetName,
      );
      if (!primary) continue;
      for (const m of s.members) shared.set(`${m.stationCode}|${m.rawTargetName}`, primary.engineName);
    }
    for (const t of draft.targets.filter((t) => t.includeInAdjustment)) {
      const key = `${t.stationCode}|${t.rawTargetName}`;
      map.set(key, shared.get(key) ?? t.engineName);
    }
    return map;
  }

  computeDraftInitialisation(draft: WizardDraft): DraftInitialisationResult {
    const { windowFrom, windowTo } = draft.initialisation;
    const observations = draft.stationCodes.flatMap((code) =>
      (this.catalogue.observationsByStation.get(code) ?? []).filter((o) => o.epoch >= windowFrom && o.epoch <= windowTo),
    );
    const nameMap = this.draftPointKey(draft);
    const included = observations.filter((o) => nameMap.has(`${o.stationCode}|${o.rawTargetName}`));
    const corrected = this.correctionsForDraft(draft, included);
    const targetHeights = new Map<string, number>();
    for (const t of draft.targets) targetHeights.set(nameMap.get(`${t.stationCode}|${t.rawTargetName}`) ?? t.engineName, t.targetHeightM);

    const anchorCode = draft.initialisation.anchorStationCode;
    const isAnchorMode = draft.initialisation.mode === 'local-anchor';
    const stations = draft.stations.map((s) => {
      const info = this.catalogue.stations.find((c) => c.stationCode === s.stationCode);
      const isAnchor = isAnchorMode && s.stationCode === anchorCode;
      return {
        stationCode: s.stationCode,
        instrumentHeightM: s.instrumentHeightM,
        approxE: isAnchor ? draft.initialisation.anchorEastingM : info?.approxEastingM ?? 0,
        approxN: isAnchor ? draft.initialisation.anchorNorthingM : info?.approxNorthingM ?? 0,
        approxH: isAnchor ? draft.initialisation.anchorHeightM : info?.approxHeightM ?? 0,
        coordinatesFixed: isAnchor,
        fixedOrientationRad: isAnchor ? draft.initialisation.anchorOrientationDeg * DEG2RAD : undefined,
      };
    });
    const references = draft.initialisation.references.map((r) => ({
      pointKey: r.pointKey,
      eastingM: r.eastingM,
      northingM: r.northingM,
      heightM: r.heightM,
    }));
    const result = computeInitialCoordinates({
      observations: included,
      correctedDistanceM: corrected,
      stations,
      references,
      nameMap,
      targetHeights,
      referenceKeys: new Set(references.map((r) => r.pointKey)),
      expectedObservationKeys: new Set(nameMap.keys()),
    });
    const computed: DraftInitialisationResult = {
      computedAt: this.now(),
      coordinates: result.provisional.map((p) => ({
        ...p,
        status: p.horizontalSpreadM > 0.02 || p.verticalSpreadM > 0.02 ? 'review' : 'computed',
      })),
      stationSolutions: result.orientations
        .filter((o) => o.orientationRad !== undefined)
        .map((o) => ({
          stationCode: o.stationCode,
          eastingM: o.estimatedE ?? 0,
          northingM: o.estimatedN ?? 0,
          heightM: o.estimatedH ?? 0,
          orientationDeg: (o.orientationRad ?? 0) / DEG2RAD,
          source: o.source ?? 'unknown',
          problems: o.problems,
        })),
      coverage: result.coverage,
      failures: result.failures,
      accepted: false,
    };
    return computed;
  }

  /** `Check common points` (network): local clouds + rigid transform proposals (FRONTEND-AND-ANALYSIS-LAB.md). */
  geometryCheckForDraft(draft: WizardDraft, stationA: string, stationB: string, seeds: SeedPair[]): GeometryCheck {
    const cloud = (code: string) => {
      const station = draft.stations.find((s) => s.stationCode === code);
      const observations = (this.catalogue.observationsByStation.get(code) ?? []).filter(
        (o) => o.epoch >= draft.initialisation.windowFrom && o.epoch <= draft.initialisation.windowTo,
      );
      const corrected = this.correctionsForDraft(draft, observations);
      const latest = new Map<string, RawObservation>();
      for (const o of observations) {
        const previous = latest.get(o.rawTargetName);
        if (!previous || o.epoch > previous.epoch) latest.set(o.rawTargetName, o);
      }
      return [...latest.values()].map((o) => {
        const target = draft.targets.find((t) => t.stationCode === code && t.rawTargetName === o.rawTargetName);
        return localPointFromObservation({
          targetKey: o.rawTargetName,
          hzDeg: o.hzDeg,
          vzDeg: o.vzDeg,
          correctedSlopeDistanceM: corrected.get(o.id) ?? o.sdM,
          instrumentHeightM: station?.instrumentHeightM ?? 0,
          targetHeightM: target?.targetHeightM ?? 0,
        });
      });
    };
    return checkLocalGeometry(cloud(stationA), cloud(stationB), seeds);
  }

  connectivityForDraft(draft: WizardDraft) {
    return stationConnectivity(
      draft.stationCodes,
      draft.sharedPoints.map((s) => s.members.map((m) => m.stationCode)),
    );
  }

  // --------------------------------------------------------------- test epoch

  availableSlotsForDraft(draft: WizardDraft): string[] {
    return this.availableSlots(draft.stationCodes, draft.outputPolicy.intervalMinutes, draft.runPolicy.syncToleranceMinutes);
  }

  private availableSlots(stationCodes: string[], intervalMinutes: number, toleranceMinutes: number): string[] {
    const epochs = stationCodes.flatMap((code) =>
      (this.catalogue.observationsByStation.get(code) ?? []).map((o) => o.epoch),
    );
    if (epochs.length === 0) return [];
    const sorted = epochs.sort();
    const slots = new Set<string>();
    for (const epoch of sorted) slots.add(nearestSlot(epoch, intervalMinutes));
    void toleranceMinutes;
    return [...slots].sort().slice(-48);
  }

  /** Builds an ephemeral version snapshot from the draft to test one epoch (never persisted). */
  private ephemeralVersion(draft: WizardDraft): StoredVersion {
    const version = buildVersionFromDraft({
      draft,
      processingId: 0,
      versionNumber: 0,
      versionId: 'test-epoch',
      createdBy: 1,
      createdAt: this.now(),
      reason: 'Test one epoch (not persisted)',
      catalogue: this.catalogue,
    });
    return { ...version, chiSquareFailurePolicy: draft.chiSquareFailurePolicy, weightsRequireValidation: draft.weightsRequireValidation };
  }

  testEpochForDraft(draft: WizardDraft, slotIso: string) {
    const version = this.ephemeralVersion(draft);
    return this.executeTest(version, slotIso);
  }

  testEpochForVersion(processingId: number, versionId: string, slotIso: string) {
    const version = this.requireVersion(processingId, versionId);
    return this.executeTest(version, slotIso);
  }

  private executeTest(version: StoredVersion, slotIso: string) {
    const resolved = this.resolveSlot(version, slotIso);
    const diagnostic =
      version.chiSquareFailurePolicy === 'auto-adjust'
        ? runDemoAdjustmentWithAutoAdjust(resolved.input)
        : runDemoAdjustment(resolved.input);
    return {
      slot: slotIso,
      diagnostic,
      stationEpochs: resolved.stationEpochs,
      provisional: resolved.provisional,
      blocking: resolved.blocking,
      warnings: resolved.warnings.slice(0, 30),
      correctionSummary: this.correctionSummary(resolved),
      previews: this.previews(version, resolved),
    };
  }

  private correctionSummary(resolved: ResolvedSlotRun) {
    const nonZeroPrism = resolved.correctionTraces.filter((t) => Math.abs(t.prismDeltaM) > 1e-9).length;
    const atmoApplied = resolved.correctionTraces.filter((t) => t.atmosphericSource === 'cycle' || t.atmosphericSource === 'fixed' || t.atmosphericSource === 'fallback-fixed').length;
    return {
      observations: resolved.correctionTraces.length,
      nonZeroPrismDeltas: nonZeroPrism,
      atmosphericCorrections: atmoApplied,
      sampleTraces: resolved.correctionTraces.slice(0, 8),
    };
  }

  /**
   * Native `.dat`/`.prj` for a resolved run.
   *
   * The generated files must be an image of `resolved.input` — the very network the engine solved.
   * Reading the *configured* version instead used to let a component the trial had freed keep its
   * weight in the `.dat`, and excluded sights keep their `DM` row, so a run submitted to the real
   * STAR*NET silently adjusted a different network than the Analysis Lab showed.
   */
  private previews(version: StoredVersion, resolved: ResolvedSlotRun): NativePreviews {
    const referenceByKey = new Map(version.initialisation.references.map((r) => [r.physicalPointId, r]));
    const physicalPointIdByEngineName = new Map(version.physicalPoints.map((point) => [point.engineName, point.id]));
    // An excluded sight is not part of the adjusted network, so it must not reach STAR*NET either.
    const usableObservations = resolved.input.observations.filter((observation) => !observation.excluded);
    const input: StarNetPreviewInput = {
      adjustment: version.adjustment,
      comments: [
        `Processing ${version.processingId} — version ${version.label}`,
        `Output slot ${resolved.input.outputSlot}`,
      ],
      points: resolved.input.points.map((p) => {
        const reference =
          referenceByKey.get(physicalPointIdByEngineName.get(p.engineName) ?? p.engineName)
          ?? referenceByKey.get(p.engineName);
        const constraints = effectiveControlConstraints({
          point: p,
          reference,
          freedReference: Boolean(reference && p.role !== 'reference'),
        });
        return {
          engineName: p.engineName,
          eastingM: p.eastingM,
          northingM: p.northingM,
          heightM: p.heightM,
          modeE: constraints.e.mode,
          modeN: constraints.n.mode,
          modeH: constraints.h.mode,
          sigmaEM: constraints.e.sigmaM,
          sigmaNM: constraints.n.sigmaM,
          sigmaHM: constraints.h.sigmaM,
        };
      }),
      blocks: resolved.input.points
        .filter((p) => p.role === 'station')
        .map((station) => ({
          stationEngineName: station.engineName,
          instrumentHeightM:
            version.stationBindings.find((s) => s.stationCode === station.engineName)?.instrumentHeightM ?? 0,
          fixedOrientationDeg:
            resolved.input.fixedOrientationsRad?.[station.engineName] !== undefined
              ? (resolved.input.fixedOrientationsRad[station.engineName] * 180) / Math.PI
              : undefined,
          rows: usableObservations
            .filter((o) => o.stationEngineName === station.engineName)
            .map((o) => ({
              targetEngineName: o.targetEngineName,
              hzDeg: o.hzDeg,
              finalSlopeDistanceM: o.finalSlopeDistanceM,
              vzDeg: o.vzDeg,
              targetHeightM: o.targetHeightM,
              sigmaHzArcSec: o.sigmaHzArcSec,
              sigmaVzArcSec: o.sigmaVzArcSec,
              sigmaSdMm: o.sigmaSdMm,
              sigmaSdPpm: o.sigmaSdPpm,
            })),
        })),
    };
    // A STAR*NET direction set carries the three components of a sight together, so excluding a
    // single component cannot be expressed in the native file: the run uses the whole sight.
    const partiallyExcluded = usableObservations
      .filter((observation) => (observation.excludedComponents?.length ?? 0) > 0)
      .map((observation) => `${observation.stationEngineName}→${observation.targetEngineName}`);
    const warnings = partiallyExcluded.length > 0
      ? [`${partiallyExcluded.length} sight(s) exclude a single component (${partiallyExcluded.slice(0, 5).join(', ')}`
        + `${partiallyExcluded.length > 5 ? ', …' : ''}). STAR*NET adjusts the complete sight: only the preview engine`
        + ' can drop one component of a direction set.']
      : [];
    try {
      return {
        dat: buildDatPreview(input),
        prj: buildPrjPreview(version.adjustment),
        warnings,
      };
    } catch (error) {
      // No half-valid file is ever handed on: an unusable pair is reported as such so the native
      // run is blocked with the real reason instead of a rejected project file.
      return {
        dat: '',
        prj: '',
        warnings,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private resolveSlot(version: StoredVersion, slotIso: string): ResolvedSlotRun {
    return resolveRunInputForSlot(version, this.catalogueWithLateData(), slotIso, {
      excludedObservationIds: version.analysisExclusions,
    });
  }

  private catalogueWithLateData(): DemoCatalogue {
    if (!this.db.lateDataDelivered) return this.catalogue;
    const merged = new Map(this.catalogue.observationsByStation);
    for (const [code, late] of this.catalogue.lateObservationsByStation) {
      merged.set(code, [...(merged.get(code) ?? []), ...late]);
    }
    return { ...this.catalogue, observationsByStation: merged };
  }

  // ------------------------------------------------------ processing creation

  /** Atomic creation (FRONTEND-AND-ANALYSIS-LAB.md §Étape 9): processing + version 1 + stable output variables. */
  createProcessing(draftId: string, activate: boolean) {
    const draft = this.getDraft(draftId);
    if (!draft) throw new Error(`Unknown draft ${draftId}`);
    if (!draft.name.trim()) throw new Error('Processing name is required');
    if (activate && draft.weightsRequireValidation) {
      throw new Error('FR default weights are manufacturer proposals — confirm them in the Adjustment step before activation (audit D-05)');
    }
    if (activate && !draft.testEpochPassed) {
      throw new Error('Activation requires a successful test of one epoch');
    }
    const collisions = draft.targets.filter((t) => t.reviewStatus === 'blocking');
    if (collisions.length > 0) throw new Error(`Blocking review status on: ${collisions.map((t) => t.rawTargetName).join(', ')}`);

    const processingId = this.nextNumericId();
    const versionId = this.nextId('cfg');
    const version = buildVersionFromDraft({
      draft,
      processingId,
      versionNumber: 1,
      versionId,
      createdBy: 1,
      createdAt: this.now(),
      reason: 'Initial creation',
      catalogue: this.catalogue,
    });
    const stored: StoredVersion = {
      ...version,
      status: activate ? 'active' : 'draft',
      chiSquareFailurePolicy: draft.chiSquareFailurePolicy,
      weightsRequireValidation: draft.weightsRequireValidation,
      preflightTestedAt: draft.testEpochPassed ? this.now() : undefined,
    };
    const processing: TopographicAdjustmentProcessing = {
      id: processingId,
      projectId: 1,
      type: 'Topographic Adjustment',
      name: draft.name,
      description: draft.description || undefined,
      scope: draft.scope,
      status: activate ? 'ready' : 'draft',
      active: activate,
      activeConfigVersionId: activate ? versionId : undefined,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    // stable output variables — created once, never per version (OUT-001/002)
    const plan = buildOutputVariablePlan(version.targetBindings, version.outputPolicy);
    const variables = plan.map((definition) => ({
      processingId,
      variableId: this.nextNumericId(),
      scope: definition.scope,
      prismSensorId: definition.prismSensorId,
      component: definition.component,
      key: definition.key,
    }));

    this.db.processings.push(processing);
    this.db.versions.push(stored);
    this.db.outputVariables.push(...variables);
    this.db.drafts = this.db.drafts.filter((d) => d.id !== draftId);
    this.auditLog('create', `processing:${processingId}`, `Created "${draft.name}" (${draft.scope}, ${draft.countryPresetId}), version v1 ${stored.status}`);
    this.persist();
    return { processing, version: stored, variables };
  }

  /** Save an edit draft as a new immutable configuration version and keep output ids stable. */
  saveProcessingEdit(processingId: number, draftId: string, activate: boolean) {
    const processing = this.requireProcessing(processingId);
    const draft = this.getDraft(draftId);
    if (!draft || draft.editContext?.processingId !== processingId) {
      throw new Error(`Draft ${draftId} is not an edit of processing ${processingId}`);
    }
    if (!draft.name.trim()) throw new Error('Processing name is required');
    if (!draft.initialisation.result?.accepted) throw new Error('Initial coordinates must be computed and accepted');
    if (activate && draft.weightsRequireValidation) {
      throw new Error('FR default weights must be confirmed before activating this version');
    }
    if (activate && !draft.testEpochPassed) {
      throw new Error('Activation requires a successful Test one epoch');
    }
    const collisions = draft.targets.filter((target) => target.reviewStatus === 'blocking');
    if (collisions.length > 0) throw new Error(`Blocking review status on: ${collisions.map((target) => target.rawTargetName).join(', ')}`);

    const versionNumber = Math.max(...this.db.versions.filter((version) => version.processingId === processingId).map((version) => version.versionNumber)) + 1;
    const versionId = this.nextId('cfg');
    const version = buildVersionFromDraft({
      draft,
      processingId,
      versionNumber,
      versionId,
      createdBy: 1,
      createdAt: this.now(),
      reason: `Edited from ${draft.editContext.baseVersionLabel}`,
      catalogue: this.catalogue,
    });
    const stored: StoredVersion = {
      ...version,
      status: 'draft',
      chiSquareFailurePolicy: draft.chiSquareFailurePolicy,
      weightsRequireValidation: draft.weightsRequireValidation,
      preflightTestedAt: draft.testEpochPassed ? this.now() : undefined,
    };
    this.db.versions.push(stored);

    const existingKeys = new Set(this.db.outputVariables.filter((variable) => variable.processingId === processingId).map((variable) => variable.key));
    const addedVariables = buildOutputVariablePlan(stored.targetBindings, stored.outputPolicy)
      .filter((definition) => !existingKeys.has(definition.key))
      .map((definition) => ({
        processingId,
        variableId: this.nextNumericId(),
        scope: definition.scope,
        prismSensorId: definition.prismSensorId,
        component: definition.component,
        key: definition.key,
      }));
    this.db.outputVariables.push(...addedVariables);

    processing.name = draft.name.trim();
    processing.description = draft.description.trim() || undefined;
    processing.scope = draft.scope;
    processing.updatedAt = this.now();
    this.db.drafts = this.db.drafts.filter((candidate) => candidate.id !== draftId);
    this.auditLog(
      'edit',
      `processing:${processingId}`,
      `Saved ${stored.label} from ${draft.editContext.baseVersionLabel}; kept existing output variables and added ${addedVariables.length}`,
    );
    if (activate) this.activateVersion(processingId, stored.id, stored.validFrom);
    else this.persist();
    return { processing, version: stored, addedVariables };
  }

  // ---------------------------------------------------------------- run slots

  listProcessings(): TopographicAdjustmentProcessing[] {
    return this.db.processings.filter((p) => p.status !== 'archived' || p.active);
  }

  getProcessing(id: number) {
    const processing = this.db.processings.find((p) => p.id === id);
    if (!processing) return undefined;
    const versions = this.db.versions.filter((v) => v.processingId === id);
    const variables = this.db.outputVariables.filter((v) => v.processingId === id);
    const runs = this.db.runs.filter((r) => r.processingId === id).slice(-100).reverse();
    return { processing, versions, variables, runs };
  }

  private requireProcessing(id: number): TopographicAdjustmentProcessing {
    const processing = this.db.processings.find((p) => p.id === id);
    if (!processing) throw new Error(`Unknown processing ${id}`);
    return processing;
  }

  private requireVersion(processingId: number, versionId: string): StoredVersion {
    const version = this.db.versions.find((v) => v.processingId === processingId && v.id === versionId);
    if (!version) throw new Error(`Unknown version ${versionId}`);
    return version;
  }

  availableSlotsForProcessing(processingId: number): string[] {
    const versions = this.db.versions.filter((v) => v.processingId === processingId && v.status !== 'draft');
    const version = versions[versions.length - 1];
    if (!version) return [];
    return this.availableSlots(
      version.stationBindings.map((s) => s.stationCode),
      version.outputPolicy.intervalMinutes,
      version.runPolicy.syncToleranceMinutes,
    );
  }

  /** Executes one output slot: resolve → adjust → quality gate → UPSERT publication. */
  runSlot(processingId: number, slotIso: string, trigger: AdjustmentRunSummary['trigger']): AdjustmentRunSummary {
    const processing = this.requireProcessing(processingId);
    const versions = this.db.versions.filter((v) => v.processingId === processingId);
    const slot = alignSlot(slotIso, versions[0]?.outputPolicy.intervalMinutes ?? 30);
    const version = resolveConfigForSlot(versions, slot);
    const startedAt = this.now();
    const runId = this.nextId('run');

    const finish = (summary: Omit<AdjustmentRunSummary, 'id' | 'processingId' | 'outputSlot' | 'trigger' | 'startedAt'>, diagnostic?: AdjustmentDiagnostic) => {
      const run: AdjustmentRunSummary = {
        id: runId,
        processingId,
        outputSlot: slot,
        trigger,
        startedAt,
        ...summary,
        finishedAt: this.now(),
      };
      this.db.runs.push(run);
      if (diagnostic) {
        this.db.diagnostics[runId] = diagnostic;
        const ids = Object.keys(this.db.diagnostics);
        if (ids.length > 40) delete this.db.diagnostics[ids[0]];
      }
      processing.status = run.status === 'success' ? 'success' : run.status === 'provisional' ? 'provisional' : run.status === 'failed-qc' ? 'failed_qc' : run.status === 'technical-error' ? 'technical_error' : processing.status;
      processing.updatedAt = this.now();
      this.persist();
      return run;
    };

    if (!version) {
      return finish({
        configVersionId: '',
        status: 'technical-error',
        stationEpochs: [],
        autoAdjustAttempts: 0,
        error: { stage: 'resolve', code: 'no-config-for-slot', message: `No configuration version is valid at ${slot} (TIME-007)` },
      });
    }

    // catch-up guard (RUN-008): bounded recalculations per slot
    if (trigger === 'catch-up') {
      const previous = this.db.runs.filter((r) => r.processingId === processingId && r.outputSlot === slot && r.trigger === 'catch-up').length;
      if (previous >= version.runPolicy.catchUp.maxRecalculationsPerSlot) {
        return finish({
          configVersionId: version.id,
          status: 'technical-error',
          stationEpochs: [],
          autoAdjustAttempts: 0,
          error: { stage: 'catch-up', code: 'max-recalculations', message: `Catch-up limit ${version.runPolicy.catchUp.maxRecalculationsPerSlot} reached for ${slot} (RUN-008)` },
        });
      }
    }

    const resolved = this.resolveSlot(version, slot);
    const stationEpochs = resolved.stationEpochs.map((s) => ({ stationId: s.stationId, epoch: s.epoch, state: s.state, ageMinutes: s.ageMinutes }));
    if (resolved.blocking.length > 0) {
      return finish({
        configVersionId: version.id,
        status: 'technical-error',
        stationEpochs,
        autoAdjustAttempts: 0,
        error: { stage: 'resolve', code: 'blocked', message: resolved.blocking.join(' | ') },
      });
    }

    const diagnostic =
      version.chiSquareFailurePolicy === 'auto-adjust'
        ? runDemoAdjustmentWithAutoAdjust(resolved.input)
        : runDemoAdjustment(resolved.input);
    version.usedByRun = true; // VER-001: from now on this version is immutable

    if (!diagnostic.ok || !diagnostic.converged) {
      return finish(
        {
          configVersionId: version.id,
          status: 'technical-error',
          stationEpochs,
          autoAdjustAttempts: diagnostic.autoAdjustAttempts.length,
          chiSquareStatus: diagnostic.chiSquareStatus,
          error: { stage: 'adjust', code: diagnostic.ok ? 'not-converged' : 'rank-or-input', message: diagnostic.failureReason ?? 'Solution did not converge (ADJ-006)' },
        },
        diagnostic,
      );
    }

    const chi = diagnostic.chiSquareStatus;
    const policy = version.chiSquareFailurePolicy;
    const publish = chi === 'passed' || chi === 'not-applicable' || (chi === 'failed' && policy === 'publish-failed-qc');
    if (chi === 'failed' && !publish) {
      return finish(
        {
          configVersionId: version.id,
          status: 'failed-qc',
          stationEpochs,
          autoAdjustAttempts: diagnostic.autoAdjustAttempts.length,
          chiSquareStatus: chi,
          varianceFactor: diagnostic.varianceFactor,
          referencesAvailable: resolved.referencesAvailable,
          targetAvailabilityPercent: targetAvailabilityPercent(resolved.observedPublishTargets, resolved.totalPublishTargets),
        },
        diagnostic,
      );
    }

    const provisional = resolved.provisional || chi === 'not-applicable';
    if (provisional && !version.outputPolicy.publishProvisional) {
      return finish(
        {
          configVersionId: version.id,
          status: 'provisional',
          stationEpochs,
          autoAdjustAttempts: diagnostic.autoAdjustAttempts.length,
          chiSquareStatus: chi,
          varianceFactor: diagnostic.varianceFactor,
          referencesAvailable: resolved.referencesAvailable,
          targetAvailabilityPercent: targetAvailabilityPercent(resolved.observedPublishTargets, resolved.totalPublishTargets),
          error: { stage: 'publish', code: 'provisional-not-published', message: 'Provisional result withheld by the output policy' },
        },
        diagnostic,
      );
    }

    this.publishMeasures(version, slot, diagnostic, resolved, provisional);
    this.auditLog('run', `processing:${processingId}`, `${trigger} run ${runId} slot ${slot}: chi² ${chi}, ${resolved.observedPublishTargets}/${resolved.totalPublishTargets} targets`);
    return finish(
      {
        configVersionId: version.id,
        status: chi === 'failed' ? 'failed-qc' : provisional ? 'provisional' : 'success',
        stationEpochs,
        autoAdjustAttempts: diagnostic.autoAdjustAttempts.length,
        chiSquareStatus: chi,
        varianceFactor: Number.isFinite(diagnostic.varianceFactor) ? diagnostic.varianceFactor : undefined,
        referencesAvailable: resolved.referencesAvailable,
        targetAvailabilityPercent: targetAvailabilityPercent(resolved.observedPublishTargets, resolved.totalPublishTargets),
      },
      diagnostic,
    );
  }

  /**
   * Final-state replacement per `(variable_id, timestamp)` (OUT-009/010, audit pass-3 item 1):
   * a numeric value UPSERTs the key; a null (chi² not-applicable) CLEARS any previous value.
   */
  private replaceMeasure(variableId: number, timestamp: string, value: number | null): void {
    const key = `${variableId}|${timestamp}`;
    if (value === null) delete this.db.measures[key];
    else this.db.measures[key] = value;
  }

  private publishMeasures(
    version: StoredVersion,
    slot: string,
    diagnostic: AdjustmentDiagnostic,
    resolved: ResolvedSlotRun,
    provisional: boolean,
  ): void {
    const variables = this.db.outputVariables.filter((v) => v.processingId === version.processingId);
    const bySensorComponent = new Map(variables.filter((v) => v.scope === 'target').map((v) => [`${v.prismSensorId}:${v.component}`, v]));
    const globalByComponent = new Map(variables.filter((v) => v.scope === 'global').map((v) => [v.component, v]));
    const pointByName = new Map(diagnostic.points.map((p) => [p.engineName, p]));
    const initialByPointId = new Map(version.initialisation.initialCoordinates.map((c) => [c.physicalPointId, c]));
    const observedNames = new Set(resolved.input.observations.map((o) => o.targetEngineName));

    for (const physicalPoint of version.physicalPoints) {
      const solved = pointByName.get(physicalPoint.engineName);
      if (!solved || !observedNames.has(physicalPoint.engineName)) continue; // OUT-007: nothing invented
      const initial = initialByPointId.get(physicalPoint.id) ?? initialByPointId.get(physicalPoint.engineName);
      // OUT-008: a shared point publishes to every linked ACTIVE published target
      for (const bindingId of physicalPoint.memberTargetBindingIds) {
        const binding = version.targetBindings.find((b) => b.id === bindingId);
        if (!binding || !binding.publishOutput || !binding.includeInAdjustment) continue;
        const write = (component: string, value: number | null) => {
          const variable = bySensorComponent.get(`${binding.prismSensorId}:${component}`);
          if (variable) this.replaceMeasure(variable.variableId, slot, value);
        };
        write('adjusted-x', solved.eastingM);
        write('adjusted-y', solved.northingM);
        write('adjusted-z', solved.heightM);
        write('delta-x', initial ? solved.eastingM - initial.eastingM : null);
        write('delta-y', initial ? solved.northingM - initial.northingM : null);
        write('delta-z', initial ? solved.heightM - initial.heightM : null);
        write('sigma-x', solved.sigmaEM);
        write('sigma-y', solved.sigmaNM);
        write('sigma-z', solved.sigmaHM);
      }
    }

    const writeGlobal = (component: string, value: number | null) => {
      const variable = globalByComponent.get(component as ProcessingOutputVariable['component']);
      if (variable) this.replaceMeasure(variable.variableId, slot, value);
    };
    writeGlobal('chi2-passed', chi2PassedOutputValue(diagnostic.chiSquareStatus));
    writeGlobal('variance-factor', Number.isFinite(diagnostic.varianceFactor) ? diagnostic.varianceFactor : null);
    writeGlobal('references-available', resolved.referencesAvailable);
    writeGlobal('target-availability', targetAvailabilityPercent(resolved.observedPublishTargets, resolved.totalPublishTargets));
    writeGlobal('provisional-flag', provisional ? 1 : 0);
  }

  runNow(processingId: number): AdjustmentRunSummary {
    const slots = this.availableSlotsForProcessing(processingId);
    const slot = slots[slots.length - 1];
    if (!slot) throw new Error('No slot with usable data');
    return this.runSlot(processingId, slot, 'manual');
  }

  getRun(runId: string) {
    const run = this.db.runs.find((r) => r.id === runId);
    if (!run) return undefined;
    const diagnostic = this.db.diagnostics[runId];
    const version = this.db.versions.find((v) => v.id === run.configVersionId);
    let previews: NativePreviews | undefined;
    let inputSnapshot: ResolvedSlotRun | undefined;
    if (version && run.outputSlot) {
      try {
        inputSnapshot = this.resolveSlot(version, run.outputSlot);
        previews = this.previews(version, inputSnapshot);
      } catch {
        previews = undefined;
      }
    }
    return {
      run,
      diagnostic,
      previews,
      correctionSummary: inputSnapshot ? this.correctionSummary(inputSnapshot) : undefined,
      starNetBridge: version ? { autoAdjust: version.adjustment.autoAdjust } : undefined,
    };
  }

  measuresForProcessing(processingId: number) {
    const variables = this.db.outputVariables.filter((v) => v.processingId === processingId);
    return variables.map((variable) => {
      const series = Object.entries(this.db.measures)
        .filter(([key]) => key.startsWith(`${variable.variableId}|`))
        .map(([key, value]) => ({ timestamp: key.split('|')[1], value }))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      return { ...variable, series };
    });
  }

  // ------------------------------------------------------------- reprocessing

  reprocessPreview(processingId: number, fromIso: string, toIso: string, forcedVersionId?: string) {
    const versions = this.db.versions.filter((v) => v.processingId === processingId);
    const interval = versions[0]?.outputPolicy.intervalMinutes ?? 30;
    const slots = listSlots(fromIso, toIso, interval).slice(0, 300);
    const catalogue = this.catalogueWithLateData();
    const rows = slots.map((slot) => {
      const version = forcedVersionId
        ? versions.find((v) => v.id === forcedVersionId)
        : resolveConfigForSlot(versions, slot);
      let hasData = false;
      if (version) {
        hasData = version.stationBindings.some((s) =>
          (catalogue.observationsByStation.get(s.stationCode) ?? []).some(
            (o) => Math.abs(new Date(o.epoch).getTime() - new Date(slot).getTime()) <= version.runPolicy.maxReusedAgeMinutes * 60_000,
          ),
        );
      }
      const existing = this.db.outputVariables
        .filter((v) => v.processingId === processingId)
        .filter((v) => this.db.measures[`${v.variableId}|${slot}`] !== undefined).length;
      return { slot, versionId: version?.id, versionLabel: version?.label, hasData, existingMeasures: existing };
    });
    return {
      slots: rows,
      totals: {
        slotCount: rows.length,
        withConfig: rows.filter((r) => r.versionId).length,
        withData: rows.filter((r) => r.hasData).length,
        measuresToReplace: rows.reduce((sum, r) => sum + r.existingMeasures, 0),
      },
    };
  }

  reprocess(processingId: number, fromIso: string, toIso: string, reason: string, forcedVersionId?: string) {
    if (!reason.trim()) throw new Error('A reason is required for reprocessing');
    const preview = this.reprocessPreview(processingId, fromIso, toIso, forcedVersionId);
    const results: AdjustmentRunSummary[] = [];
    for (const row of preview.slots) {
      if (!row.versionId || !row.hasData) continue;
      // TIME-007/008: per-slot version unless a forced version was explicitly justified
      results.push(this.runSlot(processingId, row.slot, 'reprocess'));
    }
    this.auditLog('reprocess', `processing:${processingId}`, `${results.length} slot(s) reprocessed (${reason})${forcedVersionId ? `, forced version ${forcedVersionId}` : ''}`);
    this.persist();
    return { executed: results.length, runs: results.map((r) => ({ id: r.id, slot: r.outputSlot, status: r.status })) };
  }

  // ------------------------------------------------------- versions & actions

  activateVersion(processingId: number, versionId: string, validFromIso?: string) {
    const processing = this.requireProcessing(processingId);
    const version = this.requireVersion(processingId, versionId);
    if (!version.preflightTestedAt) {
      throw new Error('Configuration activation requires a successful Adjustment preflight');
    }
    const validFrom = validFromIso ?? version.validFrom;
    for (const other of this.db.versions.filter((v) => v.processingId === processingId && v.id !== versionId)) {
      if (other.status === 'active') {
        other.status = 'archived';
        other.validTo = validFrom; // no silent overlap (FRONTEND-AND-ANALYSIS-LAB.md §3)
      }
    }
    version.status = 'active';
    version.validFrom = validFrom;
    version.validTo = undefined;
    processing.activeConfigVersionId = versionId;
    processing.active = true;
    processing.status = 'ready';
    processing.updatedAt = this.now();
    this.auditLog('activate-version', `processing:${processingId}`, `Version ${version.label} active from ${validFrom} (VER-010)`);
    this.persist();
    return version;
  }

  archiveVersion(processingId: number, versionId: string) {
    const version = this.requireVersion(processingId, versionId);
    if (version.status === 'active') {
      const processing = this.requireProcessing(processingId);
      processing.active = false;
      processing.activeConfigVersionId = undefined;
      processing.status = 'disabled';
    }
    version.status = 'archived';
    version.validTo = version.validTo ?? this.now();
    this.auditLog('archive-version', `processing:${processingId}`, `Version ${version.label} archived (kept for historical slots, VER-003)`);
    this.persist();
    return version;
  }

  duplicateVersionAsDraft(processingId: number, versionId: string, reason: string) {
    const source = this.requireVersion(processingId, versionId);
    const numbers = this.db.versions.filter((v) => v.processingId === processingId).map((v) => v.versionNumber);
    const next: StoredVersion = {
      ...structuredClone(source),
      id: this.nextId('cfg'),
      versionNumber: Math.max(...numbers) + 1,
      label: `v${Math.max(...numbers) + 1}`,
      status: 'draft',
      usedByRun: false,
      preflightTestedAt: undefined,
      validTo: undefined,
      createdAt: this.now(),
      reason: reason || `Duplicated from ${source.label}`,
    };
    this.db.versions.push(next);
    this.auditLog('duplicate-version', `processing:${processingId}`, `${source.label} duplicated as ${next.label} (VER-002: used versions stay immutable)`);
    this.persist();
    return next;
  }

  processingAction(processingId: number, action: 'activate' | 'deactivate' | 'archive' | 'duplicate') {
    const processing = this.requireProcessing(processingId);
    switch (action) {
      case 'activate': {
        if (!processing.activeConfigVersionId) {
          throw new Error('Activate a tested configuration version before enabling this processing');
        }
        processing.active = true;
        processing.status = 'ready';
        break;
      }
      case 'deactivate': {
        processing.active = false;
        processing.status = 'disabled';
        break;
      }
      case 'archive': {
        processing.active = false;
        processing.status = 'archived';
        break;
      }
      case 'duplicate': {
        const copyId = this.nextNumericId();
        const copy: TopographicAdjustmentProcessing = {
          ...processing,
          id: copyId,
          name: `${processing.name} (copy)`,
          status: 'draft',
          active: false,
          activeConfigVersionId: undefined,
          createdAt: this.now(),
          updatedAt: this.now(),
        };
        this.db.processings.push(copy);
        const activeVersion = this.db.versions.find((v) => v.id === processing.activeConfigVersionId) ??
          this.db.versions.filter((v) => v.processingId === processingId).at(-1);
        if (activeVersion) {
          const cloned: StoredVersion = {
            ...structuredClone(activeVersion),
            id: this.nextId('cfg'),
            processingId: copyId,
            versionNumber: 1,
            label: 'v1',
            status: 'draft',
            usedByRun: false,
            preflightTestedAt: undefined,
            validTo: undefined,
            createdAt: this.now(),
            reason: `Duplicated from processing ${processingId}`,
          };
          this.db.versions.push(cloned);
          const plan = buildOutputVariablePlan(cloned.targetBindings, cloned.outputPolicy);
          this.db.outputVariables.push(
            ...plan.map((definition) => ({
              processingId: copyId,
              variableId: this.nextNumericId(),
              scope: definition.scope,
              prismSensorId: definition.prismSensorId,
              component: definition.component,
              key: definition.key,
            })),
          );
        }
        this.auditLog('duplicate', `processing:${processingId}`, `Duplicated as processing ${copyId}`);
        this.persist();
        return this.db.processings.find((p) => p.id === copyId)!;
      }
    }
    processing.updatedAt = this.now();
    this.auditLog(action, `processing:${processingId}`, `Processing ${action}d (VER-010)`);
    this.persist();
    return processing;
  }

  // ------------------------------------------------------------- Analysis Lab

  analysisTrial(args: {
    processingId: number;
    versionId: string;
    slot: string;
  } & AnalysisTrialOverrides) {
    const version = this.requireVersion(args.processingId, args.versionId);
    const resolved = resolveRunInputForSlot(version, this.catalogueWithLateData(), args.slot, {
      excludedObservationIds: version.analysisExclusions,
    });
    const multiplier = args.weightMultiplier ?? 1;
    if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 100) {
      throw new Error('The trial weight multiplier must be greater than 0 and no more than 100');
    }
    const disabled = new Set(args.disabledReferenceKeys ?? []);
    const excluded = new Set(args.excludedScalarObservationIds ?? []);
    const adjustment = this.analysisAdjustment(version.adjustment, args.adjustmentOverrides);
    for (const [observationId, override] of Object.entries(args.observationOverrides ?? {})) {
      for (const key of ['hzDeg', 'vzDeg', 'finalSlopeDistanceM'] as const) {
        if (override[key] !== undefined && !Number.isFinite(override[key])) {
          throw new Error(`${observationId}: ${key} must be a finite number`);
        }
      }
      for (const key of ['sigmaHzArcSec', 'sigmaVzArcSec', 'sigmaSdMm'] as const) {
        if (override[key] !== undefined && !(override[key]! > 0)) {
          throw new Error(`${observationId}: ${key} must be greater than 0`);
        }
      }
      if (override.sigmaSdPpm !== undefined && !(override.sigmaSdPpm >= 0)) {
        throw new Error(`${observationId}: sigmaSdPpm cannot be negative`);
      }
      if (override.finalSlopeDistanceM !== undefined && !(override.finalSlopeDistanceM > 0)) {
        throw new Error(`${observationId}: slope distance must be greater than 0`);
      }
    }
    for (const [engineName, coordinates] of Object.entries(args.initialCoordinateOverrides ?? {})) {
      if (![coordinates.eastingM, coordinates.northingM, coordinates.heightM].every(Number.isFinite)) {
        throw new Error(`${engineName}: initial coordinates must be finite numbers`);
      }
    }
    for (const [engineName, sigmas] of Object.entries(args.referenceSigmaOverrides ?? {})) {
      for (const [component, sigmaM] of Object.entries(sigmas)) {
        if (!(typeof sigmaM === 'number' && Number.isFinite(sigmaM) && sigmaM > 0)) {
          throw new Error(`${engineName}: reference sigma ${component.toUpperCase()} must be greater than 0`);
        }
      }
    }
    const input = {
      ...resolved.input,
      adjustment,
      points: resolved.input.points.map((point) => {
        const coordinates = args.initialCoordinateOverrides?.[point.engineName];
        const referenceSigmas = args.referenceSigmaOverrides?.[point.engineName];
        const modes = args.constraintModeOverrides?.[point.engineName];
        const freed = disabled.has(point.engineName);
        return {
          ...point,
          ...(coordinates ?? {}),
          // Freeing a component means removing its weak constraint: the coordinate is then
          // determined by the observations alone.
          constraints: point.constraints
            ?.filter((constraint) => modes?.[constraint.component] !== 'free')
            .map((constraint) => ({
              ...constraint,
              sigmaM: referenceSigmas?.[constraint.component] ?? constraint.sigmaM,
            })),
          ...(freed ? { free: true, role: 'monitoring' as const, constraints: undefined } : {}),
        };
      }),
      observations: resolved.input.observations.map((o) => ({
        ...o,
        ...(args.observationOverrides?.[o.id] ?? {}),
        sigmaHzArcSec: (
          args.observationOverrides?.[o.id]?.sigmaHzArcSec
          ?? args.adjustmentOverrides?.defaultWeights?.directionArcSec
          ?? o.sigmaHzArcSec
        ) * multiplier,
        sigmaVzArcSec: (
          args.observationOverrides?.[o.id]?.sigmaVzArcSec
          ?? args.adjustmentOverrides?.defaultWeights?.zenithArcSec
          ?? o.sigmaVzArcSec
        ) * multiplier,
        sigmaSdMm: (args.observationOverrides?.[o.id]?.sigmaSdMm ?? o.sigmaSdMm) * multiplier,
        sigmaSdPpm: (args.observationOverrides?.[o.id]?.sigmaSdPpm ?? o.sigmaSdPpm) * multiplier,
        excluded: o.excluded || excluded.has(o.id),
        excludedComponents: (['hz', 'vz', 'sd'] as const).filter(
          (kind) => o.excludedComponents?.includes(kind) || excluded.has(`${o.id}:${kind}`),
        ),
      })),
    };
    const diagnostic = args.useAutoAdjust ? runDemoAdjustmentWithAutoAdjust(input) : runDemoAdjustment(input);

    // Anti-manipulation diagnostics (FRONTEND-AND-ANALYSIS-LAB.md §5): a pass obtained by inflating sigmas or
    // gutting the network is flagged, never silently accepted (ADJ-009).
    const alerts: string[] = [];
    const excludedCount = excluded.size + diagnostic.autoAdjustAttempts.length;
    const totalObs = resolved.input.observations.length || 1;
    if (multiplier > 1.5) alerts.push(`Sigmas inflated ×${multiplier}: a chi-square pass under inflated weights is artificial (ADJ-009)`);
    const inflatedOverrides = Object.values(args.observationOverrides ?? {}).filter((override) =>
      (override.sigmaHzArcSec ?? 0) > version.adjustment.defaultWeights.directionArcSec * 1.5
      || (override.sigmaVzArcSec ?? 0) > version.adjustment.defaultWeights.zenithArcSec * 1.5,
    ).length;
    if (inflatedOverrides > 0) alerts.push(`${inflatedOverrides} sight(s) use angular sigmas more than 1.5× the configured defaults`);
    if (excludedCount / totalObs > 0.15) alerts.push(`${excludedCount}/${totalObs} observations excluded (> 15%): the trial no longer represents the network`);
    if (diagnostic.degreesOfFreedom > 0 && diagnostic.degreesOfFreedom < 5) alerts.push(`Only ${diagnostic.degreesOfFreedom} degrees of freedom: the test has little power`);
    if (disabled.size > 0) alerts.push(`${disabled.size} reference(s) freed: the datum may no longer be controlled`);
    const freedComponents = Object.values(args.constraintModeOverrides ?? {})
      .flatMap((modes) => Object.values(modes))
      .filter((mode) => mode === 'free').length;
    if (freedComponents > 0) {
      alerts.push(`${freedComponents} control component(s) released: the datum is held by fewer constraints (ADJ-009)`);
    }
    const inflatedReferenceSigmas = Object.entries(args.referenceSigmaOverrides ?? {}).filter(([engineName, sigmas]) => {
      const point = resolved.input.points.find((candidate) => candidate.engineName === engineName);
      return Object.entries(sigmas).some(([component, sigmaM]) => {
        const baseSigma = point?.constraints?.find((constraint) => constraint.component === component)?.sigmaM;
        return baseSigma !== undefined && sigmaM !== undefined && sigmaM > baseSigma * 1.5;
      });
    }).length;
    if (inflatedReferenceSigmas > 0) alerts.push(`${inflatedReferenceSigmas} reference(s) use coordinate sigmas more than 1.5× their configured values`);
    if (!diagnostic.ok && diagnostic.rankDeficiency > 0) {
      alerts.push('The geometry is not sufficient for a unique solution. Restore control points or add independent observations before tuning weights.');
    }

    const effectiveResolved: ResolvedSlotRun = { ...resolved, input };
    const points = this.analysisPointSnapshots(version, input.points, input.observations);
    const baseById = new Map(resolved.input.observations.map((observation) => [observation.id, observation]));
    const pointByName = new Map(points.map((point) => [point.engineName, point]));
    const stationIdByCode = new Map(version.stationBindings.map((station) => [station.stationCode, station.stationId]));
    const physicalByEngine = new Map(version.physicalPoints.map((point) => [point.engineName, point]));
    const observations: AnalysisObservationSnapshot[] = input.observations.map((observation) => {
      const base = baseById.get(observation.id) ?? observation;
      const physical = physicalByEngine.get(observation.targetEngineName);
      const stationId = stationIdByCode.get(observation.stationEngineName);
      const targetBinding = version.targetBindings.find((binding) =>
        binding.stationId === stationId && binding.physicalPointId === physical?.id,
      );
      const point = pointByName.get(observation.targetEngineName);
      return {
        observationId: observation.id,
        stationEngineName: observation.stationEngineName,
        targetEngineName: observation.targetEngineName,
        targetBindingId: targetBinding?.id,
        pointRole: point?.role ?? 'auxiliary',
        sharedPhysicalPoint: point?.identityState === 'shared',
        baseValues: {
          hzDeg: base.hzDeg,
          vzDeg: base.vzDeg,
          finalSlopeDistanceM: base.finalSlopeDistanceM,
        },
        effectiveValues: {
          hzDeg: observation.hzDeg,
          vzDeg: observation.vzDeg,
          finalSlopeDistanceM: observation.finalSlopeDistanceM,
        },
        basePrecision: {
          sigmaHzArcSec: base.sigmaHzArcSec,
          sigmaVzArcSec: base.sigmaVzArcSec,
          sigmaSdMm: base.sigmaSdMm,
          sigmaSdPpm: base.sigmaSdPpm,
        },
        effectivePrecision: {
          sigmaHzArcSec: observation.sigmaHzArcSec,
          sigmaVzArcSec: observation.sigmaVzArcSec,
          sigmaSdMm: observation.sigmaSdMm,
          sigmaSdPpm: observation.sigmaSdPpm,
        },
        excludedComponents: observation.excluded
          ? ['hz', 'vz', 'sd']
          : observation.excludedComponents ?? [],
        protected: observation.protected ?? false,
      };
    });

    return {
      diagnostic,
      alerts,
      stationEpochs: resolved.stationEpochs,
      baselineObservationCount: totalObs,
      blocking: resolved.blocking,
      warnings: resolved.warnings,
      points,
      observations,
      previews: this.previews({ ...version, adjustment }, effectiveResolved),
    };
  }

  saveAnalysisCandidate(args: {
    processingId: number;
    baseVersionId: string;
  } & AnalysisCandidateChanges) {
    if (!args.reason.trim()) throw new Error('A justification is required to save an analysis candidate');
    if (!Number.isFinite(new Date(args.validFrom).getTime())) throw new Error('A valid configuration start date is required');
    const draft = this.duplicateVersionAsDraft(args.processingId, args.baseVersionId, args.reason);
    draft.validFrom = new Date(args.validFrom).toISOString();
    draft.adjustment = this.analysisAdjustment(draft.adjustment, args.adjustmentOverrides);
    if (args.adjustmentOverrides && Object.keys(args.adjustmentOverrides).length > 0) {
      draft.overriddenFields = [...draft.overriddenFields, 'Analysis Lab adjustment parameters'];
    }
    if (args.excludedScalarObservationIds?.length) {
      draft.analysisExclusions = [...new Set([...(draft.analysisExclusions ?? []), ...args.excludedScalarObservationIds])];
      draft.overriddenFields = [...draft.overriddenFields, `${args.excludedScalarObservationIds.length} scalar observation exclusion(s)`];
    }
    if (args.disabledReferenceKeys?.length) {
      const physicalIdByEngineName = new Map(
        draft.physicalPoints.map((point) => [point.engineName, point.id]),
      );
      const disabled = new Set(args.disabledReferenceKeys);
      for (const key of args.disabledReferenceKeys) {
        const physicalPointId = physicalIdByEngineName.get(key);
        if (physicalPointId) disabled.add(physicalPointId);
      }
      draft.initialisation.references = draft.initialisation.references.map((reference) =>
        disabled.has(reference.physicalPointId)
          ? { ...reference, modeE: 'free', modeN: 'free', modeH: 'free', sigmaEM: undefined, sigmaNM: undefined, sigmaHM: undefined }
          : reference,
      );
      draft.overriddenFields = [...draft.overriddenFields, `${args.disabledReferenceKeys.length} reference(s) freed`];
    }
    if (args.initialCoordinates && Object.keys(args.initialCoordinates).length > 0) {
      const physicalIdByEngine = new Map(draft.physicalPoints.map((point) => [point.engineName, point.id]));
      const stationCodes = new Set(draft.stationBindings.map((station) => station.stationCode));
      const coordinateById = new Map(draft.initialisation.initialCoordinates.map((coordinate) => [coordinate.physicalPointId, coordinate]));
      for (const [engineName, coordinate] of Object.entries(args.initialCoordinates)) {
        const physicalPointId = stationCodes.has(engineName)
          ? `station:${engineName}`
          : physicalIdByEngine.get(engineName);
        if (!physicalPointId) continue;
        const current = coordinateById.get(physicalPointId);
        coordinateById.set(physicalPointId, {
          physicalPointId,
          eastingM: coordinate.eastingM,
          northingM: coordinate.northingM,
          heightM: coordinate.heightM,
          stationCount: current?.stationCount ?? 1,
          observationCount: current?.observationCount ?? 0,
          horizontalSpreadM: current?.horizontalSpreadM ?? 0,
          verticalSpreadM: current?.verticalSpreadM ?? 0,
          status: 'computed',
        });
      }
      draft.initialisation.initialCoordinates = [...coordinateById.values()];
      draft.overriddenFields = [...draft.overriddenFields, `${Object.keys(args.initialCoordinates).length} updated initial coordinate(s)`];
    }
    if (args.referenceSigmaOverrides && Object.keys(args.referenceSigmaOverrides).length > 0) {
      const referenceSigmaOverrides = args.referenceSigmaOverrides;
      const physicalIdByEngineName = new Map(draft.physicalPoints.map((point) => [point.engineName, point.id]));
      draft.initialisation.references = draft.initialisation.references.map((reference) => {
        const engineName = draft.physicalPoints.find((point) => point.id === reference.physicalPointId)?.engineName
          ?? reference.physicalPointId;
        const sigmas = referenceSigmaOverrides[engineName]
          ?? Object.entries(referenceSigmaOverrides).find(([candidate]) => physicalIdByEngineName.get(candidate) === reference.physicalPointId)?.[1];
        if (!sigmas) return reference;
        return {
          ...reference,
          sigmaEM: reference.modeE === 'weak' ? sigmas.e ?? reference.sigmaEM : reference.sigmaEM,
          sigmaNM: reference.modeN === 'weak' ? sigmas.n ?? reference.sigmaNM : reference.sigmaNM,
          sigmaHM: reference.modeH === 'weak' ? sigmas.h ?? reference.sigmaHM : reference.sigmaHM,
        };
      });
      draft.overriddenFields = [...draft.overriddenFields, `${Object.keys(referenceSigmaOverrides).length} reference precision override(s)`];
    }
    if (args.constraintModeOverrides && Object.keys(args.constraintModeOverrides).length > 0) {
      // A draft reference carries a mode per component, so a trial's per-component decision is
      // recorded faithfully rather than collapsed into "the whole point was freed".
      const constraintModeOverrides = args.constraintModeOverrides;
      draft.initialisation.references = draft.initialisation.references.map((reference) => {
        const engineName = draft.physicalPoints.find((point) => point.id === reference.physicalPointId)?.engineName
          ?? reference.physicalPointId;
        const modes = constraintModeOverrides[engineName];
        if (!modes) return reference;
        return {
          ...reference,
          modeE: modes.e ?? reference.modeE,
          modeN: modes.n ?? reference.modeN,
          modeH: modes.h ?? reference.modeH,
        };
      });
      draft.overriddenFields = [
        ...draft.overriddenFields,
        `${Object.keys(constraintModeOverrides).length} reference constraint change(s)`,
      ];
    }
    if (args.targetMeasurementPrecision && Object.keys(args.targetMeasurementPrecision).length > 0) {
      const stationCodeById = new Map(draft.stationBindings.map((station) => [station.stationId, station.stationCode]));
      const physicalById = new Map(draft.physicalPoints.map((point) => [point.id, point]));
      draft.targetBindings = draft.targetBindings.map((binding) => {
        const key = `${stationCodeById.get(binding.stationId)}|${physicalById.get(binding.physicalPointId)?.engineName}`;
        const precision = args.targetMeasurementPrecision?.[key];
        return precision
          ? {
              ...binding,
              measurementSetup: {
                ...binding.measurementSetup,
                directionStdErrArcSec: precision.sigmaHzArcSec,
                zenithStdErrArcSec: precision.sigmaVzArcSec,
                distanceStdErrMm: precision.sigmaSdMm,
                distancePpm: precision.sigmaSdPpm,
              },
            }
          : binding;
      });
      draft.overriddenFields = [...draft.overriddenFields, `${Object.keys(args.targetMeasurementPrecision).length} target measurement precision override(s)`];
    }
    this.auditLog('analysis-candidate', `processing:${args.processingId}`, `Trial saved as ${draft.label}: ${args.reason}`);
    this.persist();
    return draft;
  }

  private analysisAdjustment(
    base: StarNetAdjustmentConfig,
    overrides?: AnalysisAdjustmentOverrides,
  ): StarNetAdjustmentConfig {
    if (!overrides) return base;
    const next = {
      ...base,
      ...overrides,
      defaultWeights: { ...base.defaultWeights, ...overrides.defaultWeights },
      autoAdjust: { ...base.autoAdjust, ...overrides.autoAdjust },
    };
    if (!(next.chiSquareSignificancePercent > 0 && next.chiSquareSignificancePercent < 100)) {
      throw new Error('χ² significance must be strictly between 0 and 100%');
    }
    if (!(next.ellipseConfidencePercent > 0 && next.ellipseConfidencePercent < 100)) {
      throw new Error('Ellipse confidence must be strictly between 0 and 100%');
    }
    const strictlyPositiveWeights: Array<keyof StarNetWeights> = [
      'distanceStdErrM', 'angleArcSec', 'directionArcSec', 'azimuthArcSec', 'zenithArcSec',
    ];
    for (const key of strictlyPositiveWeights) {
      if (!(Number.isFinite(next.defaultWeights[key]) && next.defaultWeights[key] > 0)) {
        throw new Error(`${key} must be greater than 0`);
      }
    }
    for (const key of ['distancePpm', 'instrumentCenteringM', 'targetCenteringM', 'verticalCenteringM'] as const) {
      if (!(Number.isFinite(next.defaultWeights[key]) && next.defaultWeights[key] >= 0)) {
        throw new Error(`${key} cannot be negative`);
      }
    }
    if (!(Number.isFinite(next.convergeLimit) && next.convergeLimit > 0)) throw new Error('Convergence limit must be greater than 0');
    if (!(Number.isInteger(next.maximumIterations) && next.maximumIterations > 0)) throw new Error('Maximum iterations must be a positive integer');
    if (!(Number.isFinite(next.scaleFactor) && next.scaleFactor > 0)) throw new Error('Scale factor must be greater than 0');
    if (!(Number.isFinite(next.earthRadiusM) && next.earthRadiusM > 0)) throw new Error('Earth radius must be greater than 0');
    if (!Number.isFinite(next.indexOfRefraction)) throw new Error('Refraction index must be finite');
    return next;
  }

  private analysisPointSnapshots(
    version: StoredVersion,
    points: ResolvedSlotRun['input']['points'],
    observations: ResolvedSlotRun['input']['observations'],
  ): AnalysisPointSnapshot[] {
    const stationCodeById = new Map(version.stationBindings.map((station) => [station.stationId, station.stationCode]));
    const bindingById = new Map(version.targetBindings.map((binding) => [binding.id, binding]));
    const physicalByEngine = new Map(version.physicalPoints.map((point) => [point.engineName, point]));
    const referenceByKey = new Map(version.initialisation.references.flatMap((reference) => [
      [reference.physicalPointId, reference] as const,
      ...(version.physicalPoints.find((point) => point.id === reference.physicalPointId)
        ? [[version.physicalPoints.find((point) => point.id === reference.physicalPointId)!.engineName, reference] as const]
        : []),
    ]));
    return points.map((point) => {
      const physical = physicalByEngine.get(point.engineName);
      const reference = referenceByKey.get(physical?.id ?? point.engineName) ?? referenceByKey.get(point.engineName);
      const configuredRole = point.role === 'station'
        ? 'station' as const
        : physical?.role ?? (reference ? 'reference' as const : point.role);
      const freedReference = configuredRole === 'reference' && point.role !== 'reference';
      const memberTargets = (physical?.memberTargetBindingIds ?? [])
        .map((id) => bindingById.get(id))
        .filter((binding): binding is TargetBinding => Boolean(binding))
        .map((binding) => ({
          bindingId: binding.id,
          stationCode: stationCodeById.get(binding.stationId) ?? `${binding.stationId}`,
          rawTargetName: binding.rawTargetName,
        }));
      // Same rule as the generated `.dat`: the tables describe the network the engine received, so
      // a component freed by the trial reads `free` here instead of its configured weight.
      const effective = effectiveControlConstraints({
        point,
        reference: configuredRole === 'station' ? undefined : reference,
        freedReference,
      });
      const constraints = CONTROL_COMPONENTS.map((component) => ({ component, ...effective[component] }));
      return {
        engineName: point.engineName,
        physicalPointId: physical?.id ?? `station:${point.engineName}`,
        label: physical?.label ?? point.engineName,
        role: configuredRole,
        identityState: configuredRole === 'station' ? 'station' : physical?.state ?? 'individual',
        memberTargets,
        observedByStations: [...new Set(observations
          .filter((observation) => observation.targetEngineName === point.engineName)
          .map((observation) => observation.stationEngineName))],
        fixed: !point.free,
        constraints,
        eastingM: point.eastingM,
        northingM: point.northingM,
        heightM: point.heightM,
      };
    });
  }

  // ------------------------------------------------------------------- extras

  deliverLateData(): { delivered: number } {
    if (this.db.lateDataDelivered) return { delivered: 0 };
    this.db.lateDataDelivered = true;
    const delivered = [...this.catalogue.lateObservationsByStation.values()].reduce((sum, list) => sum + list.length, 0);
    this.auditLog('late-data', 'dataset:synthetic', `${delivered} late SYN_C observations delivered (catch-up material, ATMO-005/RUN-008)`);
    this.persist();
    return { delivered };
  }

  auditEntries(): AuditEntry[] {
    return this.db.audit;
  }

  /**
   * Outcome of the last write to browser storage. Surfaced so the interface can warn that work
   * is no longer being saved, instead of the user finding out when a screen fails to reopen.
   */
  storageStatus(): PersistResult {
    return lastPersistResult();
  }

  // ------------------------------------------------------ validation catalogue

  listValidationSessions(): ValidationSessionRecord[] {
    return this.db.validationSessions;
  }

  validationSessionFor(processingId: number): ValidationSessionRecord | undefined {
    return this.db.validationSessions.find((session) => session.processingId === processingId);
  }

  /** True when the session's raw observations are present in memory for this browser session. */
  validationSessionIsHydrated(session: ValidationSessionRecord): boolean {
    return session.stationCodes.every(
      (stationCode) => (this.catalogue.observationsByStation.get(stationCode)?.length ?? 0) > 0,
    );
  }

  /** Extends the in-memory catalogue with a dataset's stations, targets, references and raw data. */
  private mergeValidationPlan(plan: ValidationImportPlan): void {
    const datasetLabel = `${plan.datasetId} — ${plan.template} validation dataset`;
    const fragment: CatalogueFragment = {
      stations: plan.stations.map((station) => ({
        stationId: station.stationId,
        stationCode: station.stationCode,
        datasetId: 'validation',
        datasetLabel,
        observationCount: plan.observationsByStation[station.stationCode]?.length ?? 0,
        targetCount: plan.targets.filter((target) => target.stationCode === station.stationCode).length,
        firstEpoch: plan.window.from,
        lastEpoch: plan.window.to,
        estimatedCycleMinutes: 30,
        hasEnvironmentVariables: station.hasEnvironmentVariables,
        temperatureVariableId: station.hasEnvironmentVariables ? station.stationId * 100 + 1 : undefined,
        pressureVariableId: station.hasEnvironmentVariables ? station.stationId * 100 + 2 : undefined,
        approxEastingM: station.approxEastingM,
        approxNorthingM: station.approxNorthingM,
        approxHeightM: station.approxHeightM,
        defaultInstrumentHeightM: station.instrumentHeightM,
      })),
      targets: plan.targets.map((target) => ({
        stationCode: target.stationCode,
        rawTargetName: target.rawTargetName,
        prismSensorId: target.prismSensorId,
        hzVariableId: target.hzVariableId,
        vzVariableId: target.vzVariableId,
        sdVariableId: target.sdVariableId,
        observationCount: (plan.observationsByStation[target.stationCode] ?? [])
          .filter((observation) => observation.rawTargetName === target.rawTargetName).length,
        // No `adjustmentName`: engine names are derived from the BTM name and de-duplicated, so
        // two stations reusing one name for distinct points never collapse into one unknown.
        targetHeightM: target.targetHeightM,
        prismConstantM: target.requiredConstantM,
        isKnownReference: target.role === 'reference',
      })),
      references: plan.references.map((reference) => ({
        pointName: reference.rawTargetName,
        eastingM: reference.eastingM,
        northingM: reference.northingM,
        heightM: reference.heightM,
        sigmaM: reference.sigmaM,
        datasetId: 'validation' as const,
      })),
      observationsByStation: new Map(Object.entries(plan.observationsByStation)),
      envByStation: new Map(Object.entries(plan.envByStation)),
    };
    this.catalogue = mergeCatalogue(this.catalogue, fragment);
  }

  /** Builds the wizard draft that describes a dataset exactly as the generator configured it. */
  private validationDraft(plan: ValidationImportPlan, title: string): WizardDraft {
    const stationCodes = plan.stations.map((station) => station.stationCode);
    const draft = this.defaultDraft(plan.presetId, plan.scope, stationCodes);
    draft.name = title;
    draft.description = `Imported from the generated validation catalogue (${plan.datasetId}, ${plan.template} template, face reduction: ${plan.options.faceReduction}).`;
    draft.validFrom = plan.window.from;

    const stationPlanByCode = new Map(plan.stations.map((station) => [station.stationCode, station]));
    for (const station of draft.stations) {
      const source = stationPlanByCode.get(station.stationCode);
      if (!source) continue;
      station.instrumentHeightM = source.instrumentHeightM;
      station.atmosphericPolicy = {
        ...station.atmosphericPolicy,
        // The dataset's configured policy IS part of the scenario: an omitted correction must
        // survive the import instead of being repaired here.
        mode: source.atmosphericMode,
        formulaId: source.formulaId,
        variables: source.hasEnvironmentVariables
          ? { ...station.atmosphericPolicy.variables, temporalToleranceMinutes: 15 }
          : undefined,
      };
    }

    const targetPlanByKey = new Map(plan.targets.map((target) => [`${target.stationCode}|${target.rawTargetName}`, target]));
    for (const target of draft.targets) {
      const source = targetPlanByKey.get(`${target.stationCode}|${target.rawTargetName}`);
      if (!source) continue;
      target.role = source.role;
      target.measurementType = source.measurementType;
      target.edmMode = source.edmMode;
      target.measurementSetupId = undefined;
      target.requiredConstantM = source.requiredConstantM;
      target.alreadyAppliedConstantM = source.alreadyAppliedConstantM;
      target.targetHeightM = source.targetHeightM;
      target.distanceStdErrMm = source.distanceStdErrMm;
      target.distancePpm = source.distancePpm;
      target.publishOutput = source.role !== 'reference';
    }

    // Instrument precision comes from the dataset, which is exactly the confirmation the FR
    // preset asks for before activation (audit D-05).
    //
    // Centring is deliberately zero. The generator perturbs each observation with the instrument
    // sigmas below and nothing else, so keeping the preset's 0.5–0.8 mm centring would describe an
    // error the data does not contain: at a 13 m sight, 0.8 mm of centring is ~18" against a 0.5"
    // pointing sigma, which inflates every weight by more than an order of magnitude. The visible
    // symptom is a variance factor near 0.02 and a chi-square that fails on the low side while a
    // 26 mm blunder still shows a standardized residual below 0.2 — the network looks fine and the
    // real error hides. Zero here states the dataset's own error model instead.
    const firstStation = plan.stations[0];
    if (firstStation) {
      draft.adjustment = {
        ...draft.adjustment,
        defaultWeights: {
          ...draft.adjustment.defaultWeights,
          distanceStdErrM: firstStation.distanceSigmaMm / 1000,
          distancePpm: firstStation.distancePpm,
          angleArcSec: firstStation.angleSigmaArcSec,
          directionArcSec: firstStation.angleSigmaArcSec,
          azimuthArcSec: firstStation.angleSigmaArcSec,
          zenithArcSec: firstStation.angleSigmaArcSec,
          instrumentCenteringM: 0,
          targetCenteringM: 0,
          verticalCenteringM: 0,
        },
      };
    }
    draft.weightsRequireValidation = false;

    const engineNameByKey = new Map(draft.targets.map((target) => [`${target.stationCode}|${target.rawTargetName}`, target.engineName]));
    draft.sharedPoints = plan.sharedPoints.map((shared) => ({
      key: shared.key,
      members: shared.members,
      // The dataset's versioned mapping is a prior configuration, not a geometry guess.
      source: 'prior-config' as const,
    }));

    draft.initialisation = {
      ...draft.initialisation,
      mode: 'known-references',
      anchorStationCode: undefined,
      windowFrom: plan.window.from,
      windowTo: plan.window.to,
      references: plan.references.flatMap((reference) => {
        const pointKey = engineNameByKey.get(`${reference.stationCode}|${reference.rawTargetName}`);
        if (!pointKey) return [];
        return [{
          pointKey,
          eastingM: reference.eastingM,
          northingM: reference.northingM,
          heightM: reference.heightM,
          modeE: reference.modeE,
          modeN: reference.modeN,
          modeH: reference.modeH,
          sigmaM: reference.sigmaM,
          source: `${plan.datasetId} reference constraint`,
        }];
      }),
    };
    draft.initialisation.result = this.computeDraftInitialisation(draft);
    draft.initialisation.result.accepted = true;
    // The lab IS the place where this dataset's epoch gets tested; the wizard preflight would
    // only re-run the same adjustment behind a modal.
    draft.testEpochPassed = true;
    draft.chiSquareFailurePolicy = 'publish-failed-qc';
    return draft;
  }

  /**
   * Imports one validation dataset as a real processing so the whole existing pipeline — versions,
   * slots, runs, Analysis Lab — applies to it unchanged. Re-importing the same dataset replaces
   * the previous session instead of accumulating duplicates.
   */
  importValidationDataset(plan: ValidationImportPlan, title: string) {
    const previous = this.db.validationSessions.find((session) => session.datasetId === plan.datasetId);
    if (previous) this.deleteValidationSession(previous.processingId);

    this.mergeValidationPlan(plan);
    const draft = this.validationDraft(plan, title);
    this.db.drafts.push(draft);
    const { processing, version } = this.createProcessing(draft.id, true);

    this.db.validationSessions.push({
      processingId: processing.id,
      datasetId: plan.datasetId,
      template: plan.template,
      faceReduction: plan.options.faceReduction,
      importedAt: this.now(),
      stationCodes: plan.stations.map((station) => station.stationCode),
    });
    for (const slot of this.availableSlotsForProcessing(processing.id)) {
      this.runSlot(processing.id, slot, 'manual');
    }
    this.auditLog(
      'import-validation-dataset',
      `processing:${processing.id}`,
      `Imported ${plan.datasetId} (${plan.template}, ${plan.stations.length} station(s), face reduction ${plan.options.faceReduction})`,
    );
    this.persist();
    return { processing, version };
  }

  /** Removes an imported dataset and everything derived from it. */
  deleteValidationSession(processingId: number): void {
    this.db.validationSessions = this.db.validationSessions.filter((session) => session.processingId !== processingId);
    this.db.processings = this.db.processings.filter((processing) => processing.id !== processingId);
    this.db.versions = this.db.versions.filter((version) => version.processingId !== processingId);
    this.db.runs = this.db.runs.filter((run) => run.processingId !== processingId);
    this.db.outputVariables = this.db.outputVariables.filter((variable) => variable.processingId !== processingId);
    this.db.drafts = this.db.drafts.filter((draft) => draft.editContext?.processingId !== processingId);
    this.persist();
  }

  /** Re-attaches raw data to a session persisted in a previous browser session. */
  rehydrateValidationSession(plan: ValidationImportPlan): void {
    this.mergeValidationPlan(plan);
  }

  // --------------------------------------------------------------------- seed

  /** Seeds one ready-to-explore UK processing so administration/analysis are demonstrable. */
  private seed(): void {
    const draft = this.defaultDraft('uk-supplied-hs2-nte', 'single-station', ['NTE_ATS34']);
    draft.name = 'NTE ATS34 — UK single station (seed demo)';
    draft.description = 'Seeded example on the supplied ATS34 dataset. Known-reference initialisation from the workbook header.';
    draft.chiSquareFailurePolicy = 'auto-adjust';
    // The header genuinely provides reference coordinates (INIT-003): use known-references mode.
    draft.initialisation.mode = 'known-references';
    draft.initialisation.anchorStationCode = undefined;
    draft.initialisation.references = this.catalogue.references
      .filter((r) => r.datasetId === 'ats34')
      .map((r) => {
        const target = draft.targets.find((t) => t.rawTargetName === r.pointName);
        return {
          pointKey: target?.engineName ?? r.pointName,
          eastingM: r.eastingM,
          northingM: r.northingM,
          heightM: r.heightM,
          modeE: 'weak' as const,
          modeN: 'weak' as const,
          modeH: 'weak' as const,
          sigmaM: r.sigmaM,
          source: 'ATS34 workbook header',
        };
      });
    draft.initialisation.result = this.computeDraftInitialisation(draft);
    draft.initialisation.result.accepted = true;
    draft.testEpochPassed = true;
    this.db.drafts.push(draft);
    const { processing } = this.createProcessing(draft.id, true);
    const slots = this.availableSlotsForProcessing(processing.id);
    for (const slot of slots.slice(-2)) this.runSlot(processing.id, slot, 'schedule');
    this.persist();
  }
}

let storeInstance: DemoStore | undefined;

export function demoStore(): DemoStore {
  if (!storeInstance) storeInstance = new DemoStore();
  return storeInstance;
}

/** Test helper: fresh store without persisted state. */
export function createFreshStore(seedExample = true): DemoStore {
  return new DemoStore(seedExample);
}
