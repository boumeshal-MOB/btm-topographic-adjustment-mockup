import { describe, expect, it } from 'vitest';
import { createFreshStore, type DemoStore } from '@/demo/store';
import type { WizardDraft } from '@/demo/draft';
import {
  ATS35_POINTS,
  ATS35_SHARED_POINT_PAIRS,
} from '@/demo/fixtures/ats35-second-station';

/**
 * Single end-to-end smoke over the whole demo pipeline (kept intentionally small — the domain
 * modules carry the detailed rule tests). Covers: seed (UK processing + runs), UK wizard-path
 * creation with local anchor 0/0/0/0, slot run with UPSERT semantics, reprocess preview,
 * network draft geometry check, FR no-double-correction, catch-up late data.
 */
/**
 * The known reference coordinates of the workbook, weighted as the Adjustment step writes them.
 * A network needs two constrained or fixed points: below that a run publishes nothing.
 */
function holdWithKnownReferences(store: DemoStore, draft: WizardDraft, count: number): void {
  draft.initialisation.references = store.catalogue.references
    .filter((reference) => reference.datasetId === 'ats34')
    .flatMap((reference) => {
      const target = draft.targets.find((item) => item.rawTargetName === reference.pointName);
      return target ? [{
        pointKey: target.engineName,
        eastingM: reference.eastingM,
        northingM: reference.northingM,
        heightM: reference.heightM,
        modeE: 'weak' as const,
        modeN: 'weak' as const,
        modeH: 'weak' as const,
        sigmaM: reference.sigmaM,
        source: 'ATS34 workbook header',
      }] : [];
    })
    .slice(0, count);
}

describe('DemoStore end-to-end smoke', () => {
  it('seeds a UK processing with runs and published measures', () => {
    const store = createFreshStore();
    const processings = store.listProcessings();
    expect(processings.length).toBeGreaterThanOrEqual(1);
    const seeded = processings[0];
    const bundle = store.getProcessing(seeded.id)!;
    expect(bundle.versions[0].status).toBe('active');
    expect(bundle.variables.length).toBeGreaterThan(9);
    expect(bundle.runs.length).toBeGreaterThanOrEqual(1);
    // measures exist and re-running the same slot keeps a single value per key (OUT-009/010)
    const run = bundle.runs[0];
    const before = store.measuresForProcessing(seeded.id).flatMap((v) => v.series).length;
    store.runSlot(seeded.id, run.outputSlot, 'catch-up');
    const after = store.measuresForProcessing(seeded.id).flatMap((v) => v.series).length;
    expect(after).toBe(before); // UPSERT, never a concurrent value
  });

  it('creates a UK single-station processing from a local-anchor 0/0/0/0 draft, held by known references, and runs a slot', () => {
    const store = createFreshStore(false);
    const draft = store.createDraft('uk-supplied-hs2-nte', 'single-station');
    store.applyStationSelection(draft, ['NTE_ATS34']);
    draft.name = 'UK wizard path';
    draft.initialisation.result = store.computeDraftInitialisation(draft);
    expect(draft.initialisation.result.coverage.availableStationTargetPairs).toBeGreaterThan(30);
    expect(draft.initialisation.result.failures).toEqual([]);
    draft.initialisation.result.accepted = true;

    const slots = store.availableSlotsForDraft(draft);
    const test = store.testEpochForDraft(draft, slots[slots.length - 1]);
    expect(test.diagnostic.engineLabel).toContain('Scientific preview');
    expect(test.previews.dat).toContain('DB  NTE_ATS34');
    expect(test.previews.dat).toContain('DN  BTMORI001');
    expect(test.previews.dat).toMatch(/DM\s+\S+\s+\S+\s+\S+\s+\S+\s+\d+\.\d{4}\s+\d+\.\d{6}\s+\d+\.\d{4}\s+/);
    expect(test.previews.prj).toMatch(/^\*STAR\*NET 2/);
    expect(test.previews.prj).toContain('3 "input.dat"');
    draft.testEpochPassed = test.diagnostic.ok;
    /**
     * Fixing the anchor produced the approximate coordinates; publishing needs real references, so
     * the datum weights the known workbook coordinates before the configuration is created.
     *
     * And the initialisation is recomputed from those references. The station is free in the runs now
     * — holding it across every run pinned the network to its own instrument — so the approximations
     * have to be in the same frame as the coordinates that hold them. Constraining real georeferenced
     * points while every other point still sits near a 0/0/0/0 local origin asks the solver to travel
     * tens of kilometres in one adjustment, and it does not converge. That is not a datum, it is two.
     */
    holdWithKnownReferences(store, draft, 3);
    draft.initialisation.mode = 'known-references';
    draft.initialisation.result = store.computeDraftInitialisation(draft);
    draft.initialisation.result.accepted = true;
    store.saveDraft(draft);

    const { processing, version, variables } = store.createProcessing(draft.id, false);
    expect(version.status).toBe('draft');
    expect(variables.filter((v) => v.scope === 'global').length).toBeGreaterThanOrEqual(5);

    store.activateVersion(processing.id, version.id);
    const run = store.runNow(processing.id);
    expect(['success', 'provisional', 'failed-qc']).toContain(run.status);
    // pure radiation from a fixed anchor has no redundancy -> not-applicable is the honest outcome
    if (run.chiSquareStatus === 'not-applicable') {
      const chi2Var = store.getProcessing(processing.id)!.variables.find((v) => v.component === 'chi2-passed')!;
      const series = store.measuresForProcessing(processing.id).find((v) => v.variableId === chi2Var.variableId)!.series;
      expect(series.find((s) => s.timestamp === run.outputSlot)).toBeUndefined(); // no fabricated 1/0
    }
    const preview = store.reprocessPreview(processing.id, version.validFrom, run.outputSlot);
    expect(preview.totals.slotCount).toBeGreaterThan(0);
  });

  it('skips the cycle and publishes nothing with fewer than two constrained points', () => {
    /**
     * One constrained point leaves the normal matrix rank deficient: an infinity of translated and
     * rotated solutions fits the measurements equally well, so there is no unique answer to publish.
     * The honest outcome is to skip the slot rather than fill it with a doubtful value.
     *
     * The provenance of the coordinate is deliberately not part of this test any more — a local-datum
     * survey constrains points whose coordinates were computed, and that is legitimate. What is
     * refused is a count below two, whatever the coordinates came from.
     */
    const store = createFreshStore(false);
    const draft = store.createDraft('uk-supplied-hs2-nte', 'single-station');
    store.applyStationSelection(draft, ['NTE_ATS34']);
    draft.name = 'single reference';
    draft.initialisation.result = store.computeDraftInitialisation(draft);
    draft.initialisation.result.accepted = true;
    holdWithKnownReferences(store, draft, 1);
    draft.testEpochPassed = true;
    store.saveDraft(draft);

    const { processing, version } = store.createProcessing(draft.id, false);
    store.activateVersion(processing.id, version.id);
    const run = store.runNow(processing.id);

    expect(run.status).toBe('technical-error');
    expect(run.error?.stage).toBe('resolve');
    expect(run.error?.message).toMatch(/at least 2/);
    // Nothing reached the output variables: the slot is skipped, not filled with a doubtful value.
    expect(store.measuresForProcessing(processing.id).flatMap((v) => v.series)).toEqual([]);
  });

  it('network draft: geometry check proposes candidates from 2 seeds (weak) and connectivity follows confirmations', () => {
    const store = createFreshStore(false);
    const draft = store.createDraft('uk-supplied-hs2-nte', 'network');
    store.applyStationSelection(draft, ['SYN_A', 'SYN_B', 'SYN_C']);
    const check = store.geometryCheckForDraft(draft, 'SYN_A', 'SYN_B', [
      { aTargetKey: 'P_201', bTargetKey: 'MB_11' },
      { aTargetKey: 'P_202', bTargetKey: 'MB_12' },
    ]);
    expect(check.status).toBe('weak');
    expect(check.candidates.length).toBeGreaterThanOrEqual(3);
    // homonym CP_1 (SYN_A vs SYN_C are different physical points) must never appear as an A/B pair here
    expect(store.connectivityForDraft(draft).every((p) => p.status === 'not-connected')).toBe(true);
    draft.sharedPoints = check.candidates.slice(0, 3).map((c, i) => ({
      key: `SH_${i + 1}`,
      members: [
        { stationCode: 'SYN_A', rawTargetName: c.aTargetKey },
        { stationCode: 'SYN_B', rawTargetName: c.bTargetKey },
      ],
      source: 'geometry-confirmed' as const,
    }));
    const connectivity = store.connectivityForDraft(draft);
    expect(connectivity.find((p) => p.a === 'SYN_A' && p.b === 'SYN_B')?.status).toBe('connected');
  });

  it('FR: already-corrected distances receive no second correction and unresolved weights block activation (D-05)', () => {
    const store = createFreshStore(false);
    const draft = store.createDraft('fr-starnet-monitoring', 'single-station');
    store.applyStationSelection(draft, ['FR_ST01']);
    draft.name = 'FR corrected';
    expect(draft.weightsRequireValidation).toBe(true);
    draft.initialisation.result = store.computeDraftInitialisation(draft);
    draft.initialisation.result.accepted = true;
    draft.testEpochPassed = true;
    store.saveDraft(draft);
    expect(() => store.createProcessing(draft.id, true)).toThrow(/D-05/);

    const slots = store.availableSlotsForDraft(draft);
    const test = store.testEpochForDraft(draft, slots[slots.length - 1]);
    expect(test.correctionSummary.nonZeroPrismDeltas).toBe(0); // MPO 25.5-25.5=0 (CORR-005)
    expect(test.correctionSummary.atmosphericCorrections).toBe(0); // already-applied
  });

  it('ATS35: raw prism distances get the −34.4 mm constant applied exactly once (CORR-002)', () => {
    const store = createFreshStore(false);
    const draft = store.createDraft('uk-supplied-hs2-nte', 'single-station');
    store.applyStationSelection(draft, ['NTE_ATS35']);
    draft.name = 'ATS35 second UK station';
    // every ATS35 target carries a non-zero prism constant not yet applied by the station
    expect(draft.targets.length).toBeGreaterThan(0);
    expect(draft.targets.every((t) => Math.abs(t.requiredConstantM - t.alreadyAppliedConstantM) > 1e-4)).toBe(true);
    draft.initialisation.result = store.computeDraftInitialisation(draft);
    expect(draft.initialisation.result.failures).toEqual([]);
    draft.initialisation.result.accepted = true;
    store.saveDraft(draft);

    const slots = store.availableSlotsForDraft(draft);
    const test = store.testEpochForDraft(draft, slots[slots.length - 1]);
    // the prism delta is applied to every observation of the slot, exactly once
    expect(test.correctionSummary.nonZeroPrismDeltas).toBe(test.correctionSummary.observations);
    expect(test.correctionSummary.observations).toBeGreaterThan(0);
    expect(test.previews.dat).toContain('DB  NTE_ATS35');
  });

  it('changing the preset rebuilds proposals and invalidates derived results', () => {
    const store = createFreshStore(false);
    const draft = store.defaultDraft('uk-supplied-hs2-nte', 'single-station', ['NTE_ATS34']);
    draft.name = 'Preserved name';
    draft.initialisation.result = store.computeDraftInitialisation(draft);
    draft.testEpochPassed = true;

    store.applyPreset(draft, 'fr-starnet-monitoring');

    expect(draft.countryPresetId).toBe('fr-starnet-monitoring');
    expect(draft.name).toBe('Preserved name');
    expect(draft.weightsRequireValidation).toBe(true);
    expect(draft.initialisation.result).toBeUndefined();
    expect(draft.testEpochPassed).toBe(false);
  });

  it('edits a processing through a new version while preserving existing output variable ids', () => {
    const store = createFreshStore(false);
    const originalDraft = store.createDraft('uk-supplied-hs2-nte', 'single-station');
    store.applyStationSelection(originalDraft, ['SYN_A']);
    originalDraft.name = 'Editable processing';
    originalDraft.initialisation.result = store.computeDraftInitialisation(originalDraft);
    originalDraft.initialisation.result.accepted = true;
    store.saveDraft(originalDraft);
    const created = store.createProcessing(originalDraft.id, false);
    const originalVersion = structuredClone(created.version);
    const originalVariableIds = new Map(created.variables.map((variable) => [variable.key, variable.variableId]));

    const editDraft = store.createEditDraft(created.processing.id);
    expect(editDraft.editContext?.baseVersionId).toBe(originalVersion.id);
    store.applyStationSelection(editDraft, ['NTE_ATS35']);
    editDraft.name = 'Editable processing — revised';
    editDraft.initialisation.result = store.computeDraftInitialisation(editDraft);
    editDraft.initialisation.result.accepted = true;
    store.saveDraft(editDraft);

    const edited = store.saveProcessingEdit(created.processing.id, editDraft.id, false);
    const detail = store.getProcessing(created.processing.id)!;
    expect(edited.version.label).toBe('v2');
    expect(detail.processing.name).toBe('Editable processing — revised');
    expect(detail.versions).toHaveLength(2);
    expect(detail.versions[0]).toEqual(originalVersion);
    expect(edited.addedVariables.length).toBeGreaterThan(0);
    for (const [key, variableId] of originalVariableIds) {
      expect(detail.variables.find((variable) => variable.key === key)?.variableId).toBe(variableId);
    }
  });

  it('starts Edit processing from a clean stored configuration instead of reusing a stale edit draft', () => {
    const store = createFreshStore(false);
    const sourceDraft = store.defaultDraft('uk-supplied-hs2-nte', 'single-station', ['NTE_ATS34']);
    sourceDraft.name = 'Clean edit source';
    sourceDraft.initialisation.result = store.computeDraftInitialisation(sourceDraft);
    sourceDraft.initialisation.result.accepted = true;
    sourceDraft.testEpochPassed = true;
    store.saveDraft(sourceDraft);
    const created = store.createProcessing(sourceDraft.id, false);

    const firstEdit = store.createEditDraft(created.processing.id);
    firstEdit.name = 'Unsaved obsolete edit';
    // Simulate an autosaved shape left by an older UI deployment.
    (firstEdit as unknown as { stations?: unknown }).stations = undefined;
    store.saveDraft(firstEdit);

    const cleanEdit = store.createEditDraft(created.processing.id);
    expect(cleanEdit.id).not.toBe(firstEdit.id);
    expect(cleanEdit.name).toBe('Clean edit source');
    expect(Array.isArray(cleanEdit.stations)).toBe(true);
    expect(cleanEdit.stations).toHaveLength(1);
    expect(store.getDraft(firstEdit.id)).toBeUndefined();
  });

  it('does not expose operational slots until a configuration version is active', () => {
    const store = createFreshStore(false);
    const draft = store.defaultDraft('uk-supplied-hs2-nte', 'single-station', ['NTE_ATS34']);
    draft.name = 'Draft lifecycle';
    draft.initialisation.result = store.computeDraftInitialisation(draft);
    draft.initialisation.result.accepted = true;
    draft.testEpochPassed = true;
    store.saveDraft(draft);
    const created = store.createProcessing(draft.id, false);

    expect(store.availableSlotsForProcessing(created.processing.id)).toEqual([]);
    expect(() => store.processingAction(created.processing.id, 'activate')).toThrow(/configuration version/i);

    store.activateVersion(created.processing.id, created.version.id);
    expect(store.availableSlotsForProcessing(created.processing.id).length).toBeGreaterThan(0);
    expect(store.getProcessing(created.processing.id)?.processing).toMatchObject({
      active: true,
      status: 'ready',
      activeConfigVersionId: created.version.id,
    });
  });

  it('rejects direct activation when the immutable configuration snapshot has not passed preflight', () => {
    const store = createFreshStore(false);
    const draft = store.defaultDraft('uk-supplied-hs2-nte', 'single-station', ['NTE_ATS34']);
    draft.name = 'Untested draft';
    draft.initialisation.result = store.computeDraftInitialisation(draft);
    draft.initialisation.result.accepted = true;
    store.saveDraft(draft);
    const created = store.createProcessing(draft.id, false);

    expect(created.version.preflightTestedAt).toBeUndefined();
    expect(() => store.activateVersion(created.processing.id, created.version.id)).toThrow(/preflight/i);
    expect(store.availableSlotsForProcessing(created.processing.id)).toEqual([]);
  });

  it('requires a new preflight after duplicating a version', () => {
    const store = createFreshStore(false);
    const draft = store.defaultDraft('uk-supplied-hs2-nte', 'single-station', ['NTE_ATS34']);
    draft.name = 'Tested source';
    draft.initialisation.result = store.computeDraftInitialisation(draft);
    draft.initialisation.result.accepted = true;
    draft.testEpochPassed = true;
    store.saveDraft(draft);
    const created = store.createProcessing(draft.id, true);

    const duplicate = store.duplicateVersionAsDraft(
      created.processing.id,
      created.version.id,
      'new candidate',
    );

    expect(duplicate.preflightTestedAt).toBeUndefined();
    expect(() => store.activateVersion(created.processing.id, duplicate.id)).toThrow(/preflight/i);
  });

  it('exposes the second UK demo station with deterministic raw-prism observations', () => {
    const store = createFreshStore(false);
    const station = store.catalogue.stations.find((candidate) => candidate.stationCode === 'NTE_ATS35');
    expect(station?.datasetLabel).toContain('second UK station');
    expect(station?.observationCount).toBeGreaterThan(0);
    expect(store.catalogue.targets.some((target) => target.stationCode === 'NTE_ATS35')).toBe(true);
  });

  it('ATS34↔ATS35 exposes three easily recognisable shared physical-point names', () => {
    const ats35Coordinates = new Map(ATS35_POINTS.map((point) => [point.name, point]));

    expect(ATS35_SHARED_POINT_PAIRS).toHaveLength(3);
    for (const pair of ATS35_SHARED_POINT_PAIRS) {
      const b = ats35Coordinates.get(pair.ats35);
      expect(b, `${pair.ats35} must exist in ATS35`).toBeDefined();
      expect(Number.isFinite(b?.e)).toBe(true);
      expect(Number.isFinite(b?.n)).toBe(true);
      expect(Number.isFinite(b?.h)).toBe(true);
      expect(pair.ats35.replace('_35', '_34')).toBe(pair.ats34);
    }
  });

  it('ATS34↔ATS35 seed pairs recover the remaining shared points within survey tolerance', () => {
    const store = createFreshStore(false);
    const draft = store.createDraft('uk-supplied-hs2-nte', 'network');
    store.applyStationSelection(draft, ['NTE_ATS34', 'NTE_ATS35']);
    const seeds = ATS35_SHARED_POINT_PAIRS.slice(0, 2).map((pair) => ({
      aTargetKey: pair.ats34,
      bTargetKey: pair.ats35,
    }));

    const check = store.geometryCheckForDraft(draft, 'NTE_ATS34', 'NTE_ATS35', seeds);
    expect(['ready', 'weak']).toContain(check.status);
    expect(check.candidates).toHaveLength(ATS35_SHARED_POINT_PAIRS.length);
    for (const pair of ATS35_SHARED_POINT_PAIRS) {
      const candidate = check.candidates.find(
        (item) => item.aTargetKey === pair.ats34 && item.bTargetKey === pair.ats35,
      );
      expect(candidate, `${pair.ats34} ↔ ${pair.ats35} must be proposed`).toBeDefined();
      expect(candidate?.horizontalResidualM).toBeLessThan(0.05);
      expect(candidate?.verticalResidualM).toBeLessThan(0.05);
    }
  });

  it('ATS34↔ATS35 initialises and adjusts as one connected network', () => {
    const store = createFreshStore(false);
    const draft = store.createDraft('uk-supplied-hs2-nte', 'network');
    store.applyStationSelection(draft, ['NTE_ATS34', 'NTE_ATS35']);
    draft.sharedPoints = ATS35_SHARED_POINT_PAIRS.map((pair, index) => ({
      key: `UK_SHARED_${index + 1}`,
      members: [
        { stationCode: 'NTE_ATS34', rawTargetName: pair.ats34 },
        { stationCode: 'NTE_ATS35', rawTargetName: pair.ats35 },
      ],
      source: 'geometry-confirmed' as const,
    }));

    expect(store.connectivityForDraft(draft)[0]?.status).toBe('connected');
    draft.initialisation.result = store.computeDraftInitialisation(draft);
    expect(draft.initialisation.result.failures).toEqual([]);
    expect(draft.initialisation.result.stationSolutions.map((station) => station.stationCode)).toEqual(
      expect.arrayContaining(['NTE_ATS34', 'NTE_ATS35']),
    );

    const slots = store.availableSlotsForDraft(draft);
    const test = store.testEpochForDraft(draft, slots[slots.length - 1]);
    expect(test.diagnostic.ok).toBe(true);
    expect(test.previews.dat).toContain('DB  NTE_ATS34');
    expect(test.previews.dat).toContain('DB  NTE_ATS35');
  });

  it('Analysis Lab applies component exclusions, per-target precision and immutable candidate changes', () => {
    const store = createFreshStore();
    const processing = store.listProcessings()[0];
    const detail = store.getProcessing(processing.id)!;
    const version = detail.versions.find((candidate) => candidate.status === 'active')!;
    const slot = store.availableSlotsForProcessing(processing.id).at(-1)!;
    const baseline = store.analysisTrial({ processingId: processing.id, versionId: version.id, slot });
    const sight = baseline.observations[0];
    const reference = baseline.points.find((point) =>
      point.role === 'reference' && point.constraints.some((constraint) => constraint.mode !== 'free'),
    )!;
    const weightedReference = baseline.points.find((point) =>
      point.engineName !== reference.engineName
      && point.role === 'reference'
      && point.constraints.some((constraint) => constraint.mode === 'weak'),
    )!;
    const referenceSigmaE = weightedReference.constraints.find((constraint) => constraint.component === 'e')!.sigmaM!;

    const trial = store.analysisTrial({
      processingId: processing.id,
      versionId: version.id,
      slot,
      excludedScalarObservationIds: [`${sight.observationId}:vz`],
      disabledReferenceKeys: [reference.engineName],
      referenceSigmaOverrides: { [weightedReference.engineName]: { e: referenceSigmaE * 2 } },
      observationOverrides: {
        [sight.observationId]: { sigmaHzArcSec: 0.75, sigmaVzArcSec: 0.9, sigmaSdMm: 2.5, sigmaSdPpm: 1.2 },
      },
      initialCoordinateOverrides: {
        [sight.targetEngineName]: {
          eastingM: baseline.points.find((point) => point.engineName === sight.targetEngineName)!.eastingM + 0.001,
          northingM: baseline.points.find((point) => point.engineName === sight.targetEngineName)!.northingM,
          heightM: baseline.points.find((point) => point.engineName === sight.targetEngineName)!.heightM,
        },
      },
    });

    expect(trial.observations[0].excludedComponents).toContain('vz');
    expect(trial.observations[0].effectivePrecision).toMatchObject({
      sigmaHzArcSec: 0.75,
      sigmaVzArcSec: 0.9,
      sigmaSdMm: 2.5,
      sigmaSdPpm: 1.2,
    });
    expect(trial.points.find((point) => point.engineName === reference.engineName)).toMatchObject({
      role: 'reference',
      fixed: false,
    });
    expect(trial.points.find((point) => point.engineName === weightedReference.engineName)?.constraints.find((constraint) => constraint.component === 'e')?.sigmaM).toBeCloseTo(referenceSigmaE * 2);
    expect(trial.previews.dat).toContain(sight.targetEngineName);
    const previewLines = trial.previews.dat.split('\r\n');
    expect(previewLines.find((line) => line.startsWith(`C  ${reference.engineName}  `))).toMatch(/\*\s+\*\s+\*$/);
    expect(previewLines.find((line) => line.startsWith(`C  ${weightedReference.engineName}  `))).toContain((referenceSigmaE * 2).toFixed(4));
    expect(() => store.analysisTrial({
      processingId: processing.id,
      versionId: version.id,
      slot,
      observationOverrides: { [sight.observationId]: { sigmaSdMm: 0 } },
    })).toThrow(/sigmaSdMm must be greater than 0/);

    const targetKey = `${sight.stationEngineName}|${sight.targetEngineName}`;
    // Candidate coordinates come from a completed solution. This trial intentionally frees
    // control and excludes a component, so use the valid baseline solution for the persistence
    // assertion rather than pretending a failed diagnostic has adjusted coordinates.
    const adjustedTarget = baseline.diagnostic.points.find((point) => point.engineName === sight.targetEngineName)!;
    const candidate = store.saveAnalysisCandidate({
      processingId: processing.id,
      baseVersionId: version.id,
      validFrom: slot,
      reason: 'Validated Lab settings',
      excludedScalarObservationIds: [`${sight.observationId}:vz`],
      disabledReferenceKeys: [reference.engineName],
      referenceSigmaOverrides: { [weightedReference.engineName]: { e: referenceSigmaE * 2 } },
      targetMeasurementPrecision: { [targetKey]: trial.observations[0].effectivePrecision },
      initialCoordinates: {
        [sight.targetEngineName]: {
          eastingM: adjustedTarget.eastingM,
          northingM: adjustedTarget.northingM,
          heightM: adjustedTarget.heightM,
        },
      },
      adjustmentOverrides: { maximumIterations: 17, autoAdjust: { enabled: false } },
    });
    const originalReference = version.initialisation.references.find((item) =>
      item.physicalPointId === reference.physicalPointId || item.physicalPointId === reference.engineName,
    )!;
    const candidateReference = candidate.initialisation.references.find((item) =>
      item.physicalPointId === reference.physicalPointId || item.physicalPointId === reference.engineName,
    )!;
    const weightedCandidateReference = candidate.initialisation.references.find((item) =>
      item.physicalPointId === weightedReference.physicalPointId || item.physicalPointId === weightedReference.engineName,
    )!;
    const targetBinding = candidate.targetBindings.find((binding) => binding.id === sight.targetBindingId)!;
    const targetPhysicalPointId = trial.points.find((point) => point.engineName === sight.targetEngineName)!.physicalPointId;
    const candidateInitial = candidate.initialisation.initialCoordinates.find((coordinate) =>
      coordinate.physicalPointId === targetPhysicalPointId,
    )!;

    expect(candidate.status).toBe('draft');
    expect(candidate.analysisExclusions).toContain(`${sight.observationId}:vz`);
    expect(candidateReference).toMatchObject({ modeE: 'free', modeN: 'free', modeH: 'free' });
    expect(weightedCandidateReference.sigmaEM).toBeCloseTo(referenceSigmaE * 2);
    expect(targetBinding.measurementSetup).toMatchObject({
      directionStdErrArcSec: 0.75,
      zenithStdErrArcSec: 0.9,
      distanceStdErrMm: 2.5,
      distancePpm: 1.2,
    });
    expect(candidateInitial).toMatchObject({
      eastingM: adjustedTarget.eastingM,
      northingM: adjustedTarget.northingM,
      heightM: adjustedTarget.heightM,
    });
    expect(candidate.adjustment.maximumIterations).toBe(17);
    expect(candidate.adjustment.autoAdjust.enabled).toBe(false);
    expect(version.adjustment.autoAdjust.enabled).toBe(true);
    expect(version.initialisation.references.find((item) => item.physicalPointId === originalReference.physicalPointId)).toEqual(originalReference);
  });

  it('delivers late SYN_C data once and bounds catch-up recalculations (RUN-008)', () => {
    const store = createFreshStore(false);
    const first = store.deliverLateData();
    expect(first.delivered).toBeGreaterThan(0);
    expect(store.deliverLateData().delivered).toBe(0); // idempotent
  });
});
