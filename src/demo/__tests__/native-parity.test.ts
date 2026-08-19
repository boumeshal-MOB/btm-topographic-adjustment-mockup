import { beforeEach, describe, expect, it } from 'vitest';
import { createFreshStore, type DemoStore } from '@/demo/store';
import { buildImportPlan } from '@/domain/validation-catalogue/adapter';
import { clearDatabase } from '@/demo/persistence';
import { readDataset, readManifest } from '@/domain/validation-catalogue/__tests__/catalogue-fixtures';

/**
 * The `.dat` handed to the real STAR*NET must be an image of the network the trial solved.
 * Until now it was rebuilt from the *configured* version, so a component freed in the Analysis Lab
 * kept its weight and an excluded sight kept its `DM` row: the native run silently adjusted a
 * different network than the one on screen.
 */
function importDataset(store: DemoStore, datasetId: string) {
  const entry = readManifest().datasets.find((candidate) => candidate.id === datasetId)!;
  const plan = buildImportPlan(readDataset(datasetId), entry.template, { faceReduction: 'none' });
  return store.importValidationDataset(plan, `${datasetId} native parity`);
}

function coordinateRecord(dat: string, engineName: string): string[] {
  const line = dat.split('\n').find((candidate) => candidate.startsWith(`C  ${engineName}  `));
  if (!line) throw new Error(`No C record for ${engineName}`);
  return line.trim().split(/\s+/);
}

function directionRows(dat: string): string[] {
  return dat.split('\n').filter((line) => line.startsWith('DM'));
}

describe('generated .dat mirrors the trial that was solved', () => {
  let store: DemoStore;
  let processingId: number;
  let versionId: string;
  let slot: string;

  beforeEach(() => {
    clearDatabase();
    store = createFreshStore(false);
    const imported = importDataset(store, 'BTM-VAL-041');
    processingId = imported.processing.id;
    versionId = imported.version.id;
    slot = store.availableSlotsForProcessing(processingId)[0];
  });

  const trial = (overrides: object = {}) =>
    store.analysisTrial({ processingId, versionId, slot, ...overrides });

  function fullyWeakReference(): string {
    const point = trial().points.find((candidate) => candidate.role === 'reference'
      && candidate.constraints.filter((constraint) => constraint.mode === 'weak').length === 3);
    if (!point) throw new Error('This dataset has no weakly constrained reference');
    return point.engineName;
  }

  it('writes the configured weights when nothing is overridden', () => {
    const baseline = trial();
    const [, , , , , east, north, height] = coordinateRecord(baseline.previews.dat, fullyWeakReference());
    expect([east, north, height]).toEqual(['0.0015', '0.0015', '0.0015']);
    expect(baseline.previews.error).toBeUndefined();
  });

  it('frees the released component in the native file, not only in the preview engine', () => {
    const engineName = fullyWeakReference();
    const freed = trial({ constraintModeOverrides: { [engineName]: { e: 'free' } } });
    const [, , , , , east, north, height] = coordinateRecord(freed.previews.dat, engineName);
    expect(east).toBe('*');
    expect([north, height]).toEqual(['0.0015', '0.0015']);
    // …and the constraint count of the run agrees with the file.
    expect(freed.diagnostic.constraintCount).toBe(trial().diagnostic.constraintCount - 1);
  });

  it('reports the released component as free in the result tables', () => {
    const engineName = fullyWeakReference();
    const freed = trial({ constraintModeOverrides: { [engineName]: { h: 'free' } } });
    const point = freed.points.find((candidate) => candidate.engineName === engineName)!;
    expect(point.constraints.find((constraint) => constraint.component === 'h')?.mode).toBe('free');
    expect(point.constraints.find((constraint) => constraint.component === 'e')?.mode).toBe('weak');
  });

  it('carries an edited reference sigma into the native file', () => {
    const engineName = fullyWeakReference();
    const edited = trial({ referenceSigmaOverrides: { [engineName]: { e: 0.02 } } });
    expect(coordinateRecord(edited.previews.dat, engineName)[5]).toBe('0.0200');
  });

  it('leaves an excluded sight out of the native file', () => {
    const baseline = trial();
    const excludedId = baseline.observations[0].observationId;
    const target = baseline.observations[0].targetEngineName;
    const station = baseline.observations[0].stationEngineName;
    const reduced = trial({ excludedScalarObservationIds: [excludedId] });

    expect(directionRows(reduced.previews.dat)).toHaveLength(directionRows(baseline.previews.dat).length - 1);
    const remaining = reduced.previews.dat
      .split(`DB  ${station}`)[1]
      .split('DE')[0]
      .split('\n')
      .filter((line) => line.startsWith(`DM  ${target}  `));
    expect(remaining).toHaveLength(0);
    expect(reduced.previews.error).toBeUndefined();
  });

  it('says so when a sight only excludes one component, which a direction set cannot express', () => {
    const baseline = trial();
    const partial = trial({ excludedScalarObservationIds: [`${baseline.observations[0].observationId}:sd`] });
    expect(directionRows(partial.previews.dat)).toHaveLength(directionRows(baseline.previews.dat).length);
    expect(partial.previews.warnings?.join(' ')).toMatch(/complete sight/);
  });

  it('offers no half-valid pair when the network cannot produce a native file', () => {
    const baseline = trial();
    const station = baseline.observations[0].stationEngineName;
    const wholeStation = baseline.observations
      .filter((observation) => observation.stationEngineName === station)
      .map((observation) => observation.observationId);
    const impossible = trial({ excludedScalarObservationIds: wholeStation });
    expect(impossible.previews.error).toMatch(/direction set requires at least two directions/);
    expect(impossible.previews.dat).toBe('');
    expect(impossible.previews.prj).toBe('');
  });
});
