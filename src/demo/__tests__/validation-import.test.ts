import { beforeEach, describe, expect, it } from 'vitest';
import { createFreshStore, type DemoStore } from '@/demo/store';
import { buildImportPlan, type FaceReductionPolicy } from '@/domain/validation-catalogue/adapter';
import { chiSquareDirection, optimismWarnings } from '@/domain/analysis/quality';
import { clearDatabase } from '@/demo/persistence';
import {
  firstDatasetWithScenario,
  readDataset,
  readManifest,
} from '@/domain/validation-catalogue/__tests__/catalogue-fixtures';

/**
 * End-to-end proof that an imported dataset travels the *existing* pipeline: catalogue → wizard
 * draft → immutable version → slot resolution → adjustment engine → Analysis Lab trial.
 *
 * These are the targeted per-family tests the strategy calls for. The whole-manifest coverage
 * lives in the domain suite; here one representative dataset per defect family is actually solved.
 */

function importDataset(
  store: DemoStore,
  datasetId: string,
  faceReduction: FaceReductionPolicy = 'none',
) {
  const entry = readManifest().datasets.find((candidate) => candidate.id === datasetId);
  if (!entry) throw new Error(`Unknown dataset ${datasetId}`);
  const plan = buildImportPlan(readDataset(datasetId), entry.template, { faceReduction });
  const { processing, version } = store.importValidationDataset(plan, `${datasetId} lab session`);
  return { plan, processing, version, entry };
}

/**
 * Trial on one of the dataset's three epochs.
 *
 * `incident` is the default because that is where the generator injects the fault; a moved
 * reference also stays moved through `verification`, but a gross error or a face pair exists only
 * in the incident cycle. Opening the last slot instead would quietly analyse clean data and make
 * every defect test pass for the wrong reason.
 */
function trialAtEpoch(
  store: DemoStore,
  processingId: number,
  versionId: string,
  epochKind: 'baseline' | 'incident' | 'verification' = 'incident',
) {
  const slots = store.availableSlotsForProcessing(processingId);
  const index = { baseline: 0, incident: 1, verification: 2 }[epochKind];
  const slot = slots[index] ?? slots.at(-1);
  if (!slot) throw new Error('Imported dataset produced no output slot');
  return store.analysisTrial({ processingId, versionId, slot });
}

/** Largest 3D displacement between initial and adjusted coordinates, in millimetres. */
function maxDisplacementMm(trial: ReturnType<DemoStore['analysisTrial']>): number {
  const adjusted = new Map(trial.diagnostic.points.map((point) => [point.engineName, point]));
  let max = 0;
  for (const point of trial.points) {
    const solved = adjusted.get(point.engineName);
    if (!solved) continue;
    max = Math.max(max, Math.hypot(
      (solved.eastingM - point.eastingM) * 1000,
      (solved.northingM - point.northingM) * 1000,
      (solved.heightM - point.heightM) * 1000,
    ));
  }
  return max;
}

describe('importing a validation dataset', () => {
  let store: DemoStore;

  beforeEach(() => {
    clearDatabase();
    store = createFreshStore(false);
  });

  it('creates an active processing whose adjustment converges on the canonical clean network', () => {
    const { processing, version, plan, entry } = importDataset(store, 'BTM-VAL-041');

    expect(processing.scope).toBe('network');
    expect(processing.active).toBe(true);
    expect(version.status).toBe('active');
    expect(version.stationBindings).toHaveLength(entry.stationCount);
    expect(version.targetBindings).toHaveLength(plan.targets.length);

    const trial = trialAtEpoch(store, processing.id, version.id);
    expect(trial.blocking).toEqual([]);
    expect(trial.diagnostic.converged).toBe(true);
    expect(trial.diagnostic.rankDeficiency).toBe(0);
    expect(trial.points.length).toBeGreaterThan(0);
    expect(trial.observations.length).toBeGreaterThan(0);

    // A clean network behaves like noise: nothing stands out and nothing moves.
    expect(trial.diagnostic.maxStdResidual).toBeLessThan(3);
    expect(maxDisplacementMm(trial)).toBeLessThan(3);
    // Its chi-square never fails on the *high* side; it fits at least as well as declared.
    expect(chiSquareDirection(trial.diagnostic)).not.toBe('above');
  });

  it('explains a clean network that fits better than its declared precision', () => {
    const { processing, version } = importDataset(store, 'BTM-VAL-041');
    const trial = trialAtEpoch(store, processing.id, version.id);

    // The generator places reference coordinates exactly on their truth while declaring a
    // 1–1.5 mm sigma, so the weighted residual sum lands below the lower bound. That is a
    // pessimistic-precision statement, not a measurement problem, and the direction says so
    // even though the canonical status can only report "failed".
    expect(trial.diagnostic.degreesOfFreedom).toBeGreaterThan(0);
    expect(trial.diagnostic.varianceFactor).toBeLessThan(1);
    expect(chiSquareDirection(trial.diagnostic)).toBe('below');
    expect(optimismWarnings({
      diagnostic: trial.diagnostic,
      excludedComponentCount: 0,
      freedReferenceCount: 0,
      weightMultiplier: 1,
      totalObservationComponents: trial.observations.length * 3,
    })).toContain('fits-better-than-declared');
  });

  it('resolves each confirmed shared point to a single adjusted unknown', () => {
    const { processing, version, plan } = importDataset(store, 'BTM-VAL-041');
    expect(plan.sharedPoints.length).toBeGreaterThanOrEqual(2);

    for (const shared of plan.sharedPoints) {
      const bindings = version.targetBindings.filter((binding) =>
        shared.members.some((member) =>
          member.rawTargetName === binding.rawTargetName
          && version.stationBindings.find((station) => station.stationId === binding.stationId)?.stationCode === member.stationCode));
      expect(bindings.length).toBe(shared.members.length);
      // one physical point and therefore one engine name for the whole group
      expect(new Set(bindings.map((binding) => binding.physicalPointId)).size).toBe(1);
      expect(new Set(bindings.map((binding) => binding.engineName)).size).toBe(1);
    }

    const trial = trialAtEpoch(store, processing.id, version.id);
    const sharedSnapshots = trial.points.filter((point) => point.identityState === 'shared');
    expect(sharedSnapshots.length).toBe(plan.sharedPoints.length);
    for (const point of sharedSnapshots) {
      expect(point.observedByStations.length).toBeGreaterThan(1);
    }
  });

  it('keeps a reused BTM target name split across stations into distinct points', () => {
    const { version, plan } = importDataset(store, 'BTM-VAL-041');
    expect(plan.identity.homonyms.length).toBeGreaterThan(0);

    for (const homonym of plan.identity.homonyms) {
      const bindings = version.targetBindings.filter(
        (binding) => binding.rawTargetName === homonym.rawTargetName,
      );
      expect(bindings.length).toBe(homonym.members.length);
      // distinct physical points AND distinct engine names — never merged into one unknown
      expect(new Set(bindings.map((binding) => binding.physicalPointId)).size).toBe(bindings.length);
      expect(new Set(bindings.map((binding) => binding.engineName)).size).toBe(bindings.length);
    }
  });

  it('replaces the previous session when the same dataset is imported twice', () => {
    const first = importDataset(store, 'BTM-VAL-041');
    const second = importDataset(store, 'BTM-VAL-041');

    expect(store.listValidationSessions()).toHaveLength(1);
    expect(store.listProcessings().filter((processing) => processing.id === first.processing.id)).toEqual([]);
    expect(store.validationSessionFor(second.processing.id)?.datasetId).toBe('BTM-VAL-041');
  });

  it('records only a pointer to the dataset, never its answer', () => {
    const { processing } = importDataset(store, 'BTM-VAL-001');
    const session = store.validationSessionFor(processing.id)!;
    expect(session.datasetId).toBe('BTM-VAL-001');

    const serialised = JSON.stringify(store.db);
    expect(serialised).not.toContain('moved-reference');
    expect(serialised).not.toContain('faultPlans');
    expect(serialised).not.toContain('injectedFaults');
    expect(serialised).not.toContain('physicalPointTruth');
  });

  it('reports a session as hydrated only while its raw data is in memory', () => {
    const { processing } = importDataset(store, 'BTM-VAL-041');
    const session = store.validationSessionFor(processing.id)!;
    expect(store.validationSessionIsHydrated(session)).toBe(true);

    const reloaded = createFreshStore(false);
    const persisted = reloaded.validationSessionFor(processing.id);
    expect(persisted).toBeDefined();
    expect(reloaded.validationSessionIsHydrated(persisted!)).toBe(false);
  });
});

describe('each defect family reaches the engine', () => {
  let store: DemoStore;

  beforeEach(() => {
    clearDatabase();
    store = createFreshStore(false);
  });

  // One dataset per family. The assertion is deliberately "the defect is observable", not "the
  // solver fails": several families are sub-millimetre by construction and must not be
  // exaggerated into failures just to make a test read well.
  const families = [
    'clean',
    'moved-reference',
    'station-vibration',
    'gross-hz',
    'gross-vz',
    'gross-sd',
    'atmosphere-omitted',
    'curvature-refraction-omitted',
    'horizontal-as-slope',
    'face-i-ii',
  ] as const;

  for (const family of families) {
    it(`solves and diagnoses a ${family} dataset`, () => {
      const dataset = firstDatasetWithScenario(family);
      const { processing, version } = importDataset(store, dataset.id);
      const trial = trialAtEpoch(store, processing.id, version.id);

      expect(trial.blocking).toEqual([]);
      expect(trial.diagnostic.converged).toBe(true);
      expect(trial.diagnostic.rankDeficiency).toBe(0);
      expect(Number.isFinite(trial.diagnostic.maxStdResidual)).toBe(true);
      expect(trial.observations.length).toBeGreaterThan(0);
      // every observation is attributable to a station and a point the table can show
      for (const observation of trial.observations) {
        expect(observation.stationEngineName.length).toBeGreaterThan(0);
        expect(observation.targetEngineName.length).toBeGreaterThan(0);
      }
    });
  }

  /**
   * How a family becomes visible depends on the geometry, not on our preference.
   *
   * A blunder on a redundant sight shows as a standardized residual. The very same blunder on a
   * single-ray point produces *no* residual — there is nothing for it to disagree with — and only
   * moves the coordinate. Both channels are asserted through what the app actually shows, and
   * each is compared against the same dataset's quiet baseline epoch rather than an absolute
   * number, so the test measures the defect and not the network's size.
   */
  const signatures = [
    { family: 'moved-reference', channel: 'residual', threshold: 5 },
    { family: 'station-vibration', channel: 'residual', threshold: 3 },
    { family: 'horizontal-as-slope', channel: 'residual', threshold: 5 },
    { family: 'gross-hz', channel: 'displacement', threshold: 5 },
    { family: 'gross-vz', channel: 'displacement', threshold: 5 },
    { family: 'gross-sd', channel: 'displacement', threshold: 5 },
    { family: 'atmosphere-omitted', channel: 'displacement', threshold: 5 },
  ] as const;

  for (const { family, channel, threshold } of signatures) {
    it(`makes a ${family} defect visible as an outsized ${channel} at the incident epoch`, () => {
      const manifest = readManifest();
      // prefer a network dataset, so redundancy exists wherever the family can produce it
      const entry = manifest.datasets.find(
        (candidate) => candidate.primaryScenario === family && candidate.stationCount >= 3,
      ) ?? manifest.datasets.find((candidate) => candidate.primaryScenario === family)!;
      const { processing, version } = importDataset(store, entry.id);

      const quiet = trialAtEpoch(store, processing.id, version.id, 'baseline');
      const incident = trialAtEpoch(store, processing.id, version.id, 'incident');
      const read = (trial: typeof incident) => channel === 'residual'
        ? trial.diagnostic.maxStdResidual
        : maxDisplacementMm(trial);

      expect(read(quiet)).toBeLessThan(threshold);
      expect(read(incident)).toBeGreaterThan(threshold);
    });
  }

  it('leaves curvature/refraction sub-millimetre instead of exaggerating it', () => {
    // VALIDATION-DATASETS.md is explicit that this effect stays small at catalogue distances.
    // The test guards against "fixing" the import by amplifying a physically small signal.
    const dataset = firstDatasetWithScenario('curvature-refraction-omitted');
    const { processing, version } = importDataset(store, dataset.id);
    const incident = trialAtEpoch(store, processing.id, version.id, 'incident');
    expect(incident.diagnostic.converged).toBe(true);
    expect(maxDisplacementMm(incident)).toBeLessThan(5);
  });

  it('reduces a face pair only when asked, and feeds the same sights either way', () => {
    const dataset = firstDatasetWithScenario('face-i-ii');

    const unreduced = importDataset(store, dataset.id, 'none');
    const unreducedTrial = trialAtEpoch(store, unreduced.processing.id, unreduced.version.id);

    const reducedStore = createFreshStore(false);
    const reduced = importDataset(reducedStore, dataset.id, 'mean-of-faces');
    const reducedTrial = trialAtEpoch(reducedStore, reduced.processing.id, reduced.version.id);

    expect(unreducedTrial.diagnostic.converged).toBe(true);
    expect(reducedTrial.diagnostic.converged).toBe(true);
    expect(reducedTrial.observations).toHaveLength(unreducedTrial.observations.length);
    // The cancelled collimation is about one arcsec, so the effect is real but small: assert the
    // solution actually changed rather than inventing a dramatic threshold it cannot meet.
    expect(reducedTrial.diagnostic.weightedSSR).not.toBe(unreducedTrial.diagnostic.weightedSSR);
  });
});

describe('freeing a control component in a trial', () => {
  let store: DemoStore;

  beforeEach(() => {
    clearDatabase();
    store = createFreshStore(false);
  });

  it('drops that component constraint and changes the solution', () => {
    const { processing, version } = importDataset(store, 'BTM-VAL-041');
    const slots = store.availableSlotsForProcessing(processing.id);
    const slot = slots[1] ?? slots[0];

    const baseline = store.analysisTrial({ processingId: processing.id, versionId: version.id, slot });
    const reference = baseline.points.find((point) => point.role === 'reference'
      && point.constraints.some((constraint) => constraint.mode === 'weak'))!;
    expect(reference).toBeDefined();

    const freedHeight = store.analysisTrial({
      processingId: processing.id,
      versionId: version.id,
      slot,
      constraintModeOverrides: { [reference.engineName]: { h: 'free' } },
    });

    // One fewer constraint equation reaches the engine, so the redundancy drops...
    expect(freedHeight.diagnostic.constraintCount).toBe(baseline.diagnostic.constraintCount - 1);
    expect(freedHeight.diagnostic.degreesOfFreedom).toBe(baseline.diagnostic.degreesOfFreedom - 1);
    // ...and the height of that point is no longer held towards its declared value.
    const before = baseline.diagnostic.points.find((point) => point.engineName === reference.engineName)!;
    const after = freedHeight.diagnostic.points.find((point) => point.engineName === reference.engineName)!;
    expect(after.heightM).not.toBe(before.heightM);
    expect(freedHeight.diagnostic.converged).toBe(true);
  });

  it('leaves the other components constrained', () => {
    const { processing, version } = importDataset(store, 'BTM-VAL-041');
    const slot = store.availableSlotsForProcessing(processing.id)[0];
    const baseline = store.analysisTrial({ processingId: processing.id, versionId: version.id, slot });
    const reference = baseline.points.find((point) => point.role === 'reference'
      && point.constraints.filter((constraint) => constraint.mode === 'weak').length === 3)!;

    const freed = store.analysisTrial({
      processingId: processing.id,
      versionId: version.id,
      slot,
      constraintModeOverrides: { [reference.engineName]: { e: 'free' } },
    });

    // Freeing East must not quietly release North and Height as well.
    expect(freed.diagnostic.constraintCount).toBe(baseline.diagnostic.constraintCount - 1);
  });
});
