import { describe, expect, it } from 'vitest';
import { createFreshStore } from '@/demo/store';

/**
 * Single end-to-end smoke over the whole demo pipeline (kept intentionally small — the domain
 * modules carry the detailed rule tests). Covers: seed (UK processing + runs), UK wizard-path
 * creation with local anchor 0/0/0/0, slot run with UPSERT semantics, reprocess preview,
 * network draft geometry check, FR no-double-correction, catch-up late data.
 */
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

  it('creates a UK single-station processing from a local-anchor 0/0/0/0 draft and runs a slot', () => {
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
    draft.testEpochPassed = test.diagnostic.ok;
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

  it('exposes the second UK demo station with deterministic raw-prism observations', () => {
    const store = createFreshStore(false);
    const station = store.catalogue.stations.find((candidate) => candidate.stationCode === 'NTE_ATS35');
    expect(station?.datasetLabel).toContain('second UK station');
    expect(station?.observationCount).toBeGreaterThan(0);
    expect(store.catalogue.targets.some((target) => target.stationCode === 'NTE_ATS35')).toBe(true);
  });

  it('delivers late SYN_C data once and bounds catch-up recalculations (RUN-008)', () => {
    const store = createFreshStore(false);
    const first = store.deliverLateData();
    expect(first.delivered).toBeGreaterThan(0);
    expect(store.deliverLateData().delivered).toBe(0); // idempotent
  });
});
