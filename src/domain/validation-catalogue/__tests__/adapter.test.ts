import { describe, expect, it } from 'vitest';
import { buildImportPlan, datasetOrdinal, reduceFaceGroup } from '@/domain/validation-catalogue/adapter';
import { datasetIdentity } from '@/domain/validation-catalogue/identity';
import { firstDatasetWithScenario, readDataset, readManifest } from './catalogue-fixtures';

const CANONICAL = 'BTM-VAL-041';

function entryFor(datasetId: string) {
  const entry = readManifest().datasets.find((candidate) => candidate.id === datasetId);
  if (!entry) throw new Error(`Unknown dataset ${datasetId}`);
  return entry;
}

describe('validation dataset adapter', () => {
  it('converts the canonical clean network into the existing catalogue shapes', () => {
    const dataset = readDataset(CANONICAL);
    const entry = entryFor(CANONICAL);
    const plan = buildImportPlan(dataset, entry.template);

    expect(plan.scope).toBe('network');
    expect(plan.presetId).toBe(entry.template === 'UK' ? 'uk-supplied-hs2-nte' : 'fr-starnet-monitoring');
    expect(plan.stations).toHaveLength(entry.stationCount);
    expect(plan.targets).toHaveLength(dataset.targetBindings.length);
    expect(plan.conversionWarnings).toEqual([]);

    // one stored measurement per (binding, cycle) — nothing silently dropped
    const stored = Object.values(plan.observationsByStation).flat();
    expect(stored).toHaveLength(dataset.targetBindings.length * dataset.epochs.length);
    for (const observation of stored) {
      expect(Number.isFinite(observation.hzDeg)).toBe(true);
      expect(Number.isFinite(observation.vzDeg)).toBe(true);
      expect(observation.sdM).toBeGreaterThan(0);
    }
  });

  it('allocates ids that cannot collide with the compatibility fixtures', () => {
    const plan = buildImportPlan(readDataset(CANONICAL), entryFor(CANONICAL).template);
    for (const station of plan.stations) expect(station.stationId).toBeGreaterThan(500_000);
    for (const target of plan.targets) expect(target.prismSensorId).toBeGreaterThan(1_000_000);
    const sensorIds = plan.targets.map((target) => target.prismSensorId);
    expect(new Set(sensorIds).size).toBe(sensorIds.length);
  });

  it('gives every dataset a distinct id range', () => {
    const first = buildImportPlan(readDataset('BTM-VAL-041'), entryFor('BTM-VAL-041').template);
    const second = buildImportPlan(readDataset('BTM-VAL-042'), entryFor('BTM-VAL-042').template);
    const overlap = first.stations
      .map((station) => station.stationId)
      .filter((id) => second.stations.some((station) => station.stationId === id));
    expect(overlap).toEqual([]);
    expect(datasetOrdinal('BTM-VAL-041')).toBe(41);
    expect(() => datasetOrdinal('nope')).toThrow();
  });

  it('carries the configured atmospheric policy through instead of repairing it', () => {
    const dataset = firstDatasetWithScenario('atmosphere-omitted');
    const entry = entryFor(dataset.id);
    const plan = buildImportPlan(dataset, entry.template);
    for (const policy of dataset.configuredPolicies) {
      const station = dataset.stations.find((candidate) => candidate.id === policy.stationId)!;
      const planned = plan.stations.find((candidate) => candidate.stationCode === station.stationCode)!;
      expect(planned.atmosphericMode).toBe(policy.mode);
    }
  });

  it('surfaces a horizontal stored distance as a convention rather than converting it', () => {
    const dataset = firstDatasetWithScenario('horizontal-as-slope');
    const plan = buildImportPlan(dataset, entryFor(dataset.id).template);
    const flagged = plan.targets.filter((target) => target.storedAsHorizontalDistance);
    expect(flagged.length).toBeGreaterThan(0);

    // the stored value is passed through untouched — the defect must reach the engine
    const horizontal = dataset.observations.find((observation) => observation.storedDistanceKind === 'horizontal')!;
    const binding = dataset.targetBindings.find((candidate) => candidate.id === horizontal.bindingId)!;
    const station = dataset.stations.find((candidate) => candidate.id === horizontal.stationId)!;
    const converted = plan.observationsByStation[station.stationCode]
      .find((observation) => observation.id === horizontal.id);
    expect(converted?.rawTargetName).toBe(binding.rawTargetName);
    expect(converted?.sdM).toBe(horizontal.storedDistanceM);
  });

  it('keeps one reference constraint per physical point', () => {
    const dataset = readDataset(CANONICAL);
    const plan = buildImportPlan(dataset, entryFor(CANONICAL).template);
    const pointIds = plan.references.map((reference) => reference.physicalPointId);
    expect(new Set(pointIds).size).toBe(pointIds.length);
    for (const reference of plan.references) {
      expect(reference.sigmaM).toBeGreaterThan(0);
      expect(plan.targets.some((target) =>
        target.stationCode === reference.stationCode && target.rawTargetName === reference.rawTargetName)).toBe(true);
    }
  });
});

describe('face reduction', () => {
  it('keeps only Face I when the pair was never reduced', () => {
    const group = [
      { face: 1, hzDeg: 10, vzDeg: 90, storedDistanceM: 5 },
      { face: 2, hzDeg: 190, vzDeg: 270, storedDistanceM: 5 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any[];
    const reduced = reduceFaceGroup(group, 'none');
    expect(reduced?.hzDeg).toBe(10);
    expect(reduced?.usedFaces).toEqual([1]);
  });

  it('cancels collimation and vertical index errors when both faces are averaged', () => {
    // Horizontal collimation c flips sign between faces: Hz_I = Hz+c, Hz_II = Hz+180-c.
    // The vertical index error i does not: Vz_I = Vz+i, Vz_II = 360-Vz+i.
    // After normalising Face II (Hz-180, 360-Vz) both errors land with opposite signs and cancel.
    const collimationDeg = 0.01;
    const group = [
      { face: 1, hzDeg: 10 + collimationDeg, vzDeg: 90 + collimationDeg, storedDistanceM: 5 },
      { face: 2, hzDeg: 190 - collimationDeg, vzDeg: 270 + collimationDeg, storedDistanceM: 5 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any[];
    const reduced = reduceFaceGroup(group, 'mean-of-faces');
    expect(reduced?.hzDeg).toBeCloseTo(10, 6);
    expect(reduced?.vzDeg).toBeCloseTo(90, 6);
    expect(reduced?.usedFaces).toEqual([1, 2]);
  });

  it('moves a real face-i-ii dataset closer to its truth when the pair is reduced', () => {
    const dataset = firstDatasetWithScenario('face-i-ii');
    const entry = entryFor(dataset.id);

    // pick a binding that actually carries a Face II reading
    const faceTwo = dataset.observations.find((observation) => observation.face === 2)!;
    const group = dataset.observations.filter(
      (observation) => observation.bindingId === faceTwo.bindingId && observation.epochKind === faceTwo.epochKind,
    );
    expect(group.length).toBeGreaterThan(1);
    const truthHz = group[0].truth!.hzDeg;

    const unreduced = reduceFaceGroup(group, 'none')!;
    const reduced = reduceFaceGroup(group, 'mean-of-faces')!;
    const errorUnreduced = Math.abs(unreduced.hzDeg - truthHz);
    const errorReduced = Math.abs(reduced.hzDeg - truthHz);
    expect(errorReduced).toBeLessThan(errorUnreduced);

    // and the whole-dataset plan reflects the same choice
    const planNone = buildImportPlan(dataset, entry.template, { faceReduction: 'none' });
    const planMean = buildImportPlan(dataset, entry.template, { faceReduction: 'mean-of-faces' });
    expect(planNone.hasFaceTwoObservations).toBe(true);
    const count = (plan: typeof planNone) => Object.values(plan.observationsByStation).flat().length;
    // both policies store exactly one measurement per (binding, cycle)
    expect(count(planNone)).toBe(count(planMean));
  });
});

describe('point identity without the oracle', () => {
  it('derives shared points and homonyms from the explicit mapping only', () => {
    const dataset = readDataset(CANONICAL);
    const entry = entryFor(CANONICAL);
    const identity = datasetIdentity(dataset);

    expect(identity.sharedPoints).toHaveLength(entry.sharedPointCount);
    for (const group of identity.sharedPoints) {
      expect(group.stationIds.length).toBeGreaterThan(1);
    }

    // same BTM name reused by several stations for distinct points stays split
    expect(identity.homonyms.length).toBeGreaterThan(0);
    for (const homonym of identity.homonyms) {
      expect(homonym.physicalPointIds.length).toBeGreaterThan(1);
      const shared = identity.sharedPoints.map((group) => group.physicalPointId);
      // a homonym's points are never merged into one shared group
      for (const pointId of homonym.physicalPointIds) {
        const group = identity.sharedPoints.find((candidate) => candidate.physicalPointId === pointId);
        if (group) expect(group.rawTargetNames).not.toEqual([homonym.rawTargetName]);
      }
      expect(new Set(shared).size).toBe(shared.length);
    }
  });

  it('agrees with the oracle it never reads', () => {
    for (const datasetId of ['BTM-VAL-041', 'BTM-VAL-042', 'BTM-VAL-061', 'BTM-VAL-081']) {
      const dataset = readDataset(datasetId);
      const identity = datasetIdentity(dataset);
      const oracleShared = dataset.oracle!.identityCases.confirmedSharedPoints
        .map((group) => group.physicalPointId)
        .sort();
      expect(identity.sharedPoints.map((group) => group.physicalPointId).sort()).toEqual(oracleShared);

      const oracleHomonyms = dataset.oracle!.identityCases.sameRawNameButDistinctPhysicalPoints
        .map((group) => group.rawTargetName)
        .sort();
      expect(identity.homonyms.map((group) => group.rawTargetName).sort()).toEqual(oracleHomonyms);
    }
  });

  it('never reports a shared point for a single-station dataset', () => {
    const singleStation = readManifest().datasets.find((entry) => entry.stationCount === 1)!;
    const identity = datasetIdentity(readDataset(singleStation.id));
    expect(identity.sharedPoints).toEqual([]);
  });
});
