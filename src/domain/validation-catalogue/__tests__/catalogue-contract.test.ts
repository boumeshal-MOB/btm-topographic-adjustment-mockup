import { describe, expect, it } from 'vitest';
import { VALIDATION_SCENARIOS } from '@/domain/validation-catalogue/schema';
import { readManifest, readShard } from './catalogue-fixtures';

/**
 * Whole-catalogue contract. This is the "domain tests over the entire manifest" half of the test
 * strategy: every dataset is parsed and checked here once, so the E2E layer only has to cover one
 * representative case per defect family instead of a hundred identical journeys.
 */

describe('validation catalogue manifest', () => {
  const manifest = readManifest();

  it('publishes exactly one hundred datasets and a canonical clean network', () => {
    expect(manifest.datasetCount).toBe(100);
    expect(manifest.datasets).toHaveLength(100);
    expect(manifest.canonicalDatasetId).toBe('BTM-VAL-041');
    const canonical = manifest.datasets.find((entry) => entry.id === manifest.canonicalDatasetId);
    expect(canonical?.primaryScenario).toBe('clean');
    expect(canonical?.stationCount).toBeGreaterThan(1);
  });

  it('matches its own declared distribution', () => {
    const byScenario = new Map<string, number>();
    const byStationCount = new Map<string, number>();
    let combined = 0;
    for (const entry of manifest.datasets) {
      byScenario.set(entry.primaryScenario, (byScenario.get(entry.primaryScenario) ?? 0) + 1);
      const key = String(entry.stationCount);
      byStationCount.set(key, (byStationCount.get(key) ?? 0) + 1);
      if (entry.combined) combined += 1;
    }
    expect(Object.fromEntries(byScenario)).toEqual(manifest.distribution.primaryScenario);
    expect(Object.fromEntries(byStationCount)).toEqual(manifest.distribution.stationCount);
    expect(combined).toBe(manifest.distribution.combined);
    expect(manifest.datasets.length - combined).toBe(manifest.distribution.isolated);
  });

  it('covers every scenario family the app knows how to describe', () => {
    const present = new Set(manifest.datasets.map((entry) => entry.primaryScenario));
    for (const scenario of VALIDATION_SCENARIOS) expect(present).toContain(scenario);
    // and no unknown family slipped in without the UI learning to label it
    for (const scenario of present) expect(VALIDATION_SCENARIOS).toContain(scenario);
  });

  it('keeps the combined flag consistent with the secondary scenario', () => {
    for (const entry of manifest.datasets) {
      expect(entry.combined).toBe(entry.secondaryScenario !== null);
      if (entry.secondaryScenario !== null) {
        expect(entry.secondaryScenario).not.toBe(entry.primaryScenario);
      }
    }
  });

  it('declares a shard for every dataset and no empty shard', () => {
    const shardFiles = new Set(manifest.shards.map((shard) => shard.file));
    for (const entry of manifest.datasets) expect(shardFiles).toContain(entry.shard);
    for (const shard of manifest.shards) {
      const members = manifest.datasets.filter((entry) => entry.shard === shard.file);
      expect(members).toHaveLength(shard.datasetCount);
      expect(members.at(0)?.id).toBe(shard.firstDatasetId);
      expect(members.at(-1)?.id).toBe(shard.lastDatasetId);
    }
  });
});

describe('validation catalogue shards', () => {
  const manifest = readManifest();

  it('parses all ten shards and agrees with the manifest for all one hundred datasets', () => {
    const seen = new Set<string>();
    for (const shard of manifest.shards) {
      const datasets = readShard(shard.file);
      expect(datasets).toHaveLength(shard.datasetCount);
      for (const dataset of datasets) {
        seen.add(dataset.id);
        const entry = manifest.datasets.find((candidate) => candidate.id === dataset.id);
        expect(entry, `${dataset.id} is absent from the manifest`).toBeDefined();
        expect(dataset.scenario.primary).toBe(entry!.primaryScenario);
        expect(dataset.scenario.secondary).toBe(entry!.secondaryScenario);
        expect(dataset.scenario.isCombined).toBe(entry!.combined);
        expect(dataset.stations).toHaveLength(entry!.stationCount);
        expect(dataset.observations).toHaveLength(entry!.observationCount);
      }
    }
    expect(seen.size).toBe(100);
  });

  it('never links a shared physical point implicitly and always ships both identity cases in a network', () => {
    for (const shard of manifest.shards) {
      for (const dataset of readShard(shard.file)) {
        // every binding carries an explicit mapping
        for (const binding of dataset.targetBindings) {
          expect(binding.physicalPointId.length).toBeGreaterThan(0);
        }
        const stationsPerPoint = new Map<string, Set<string>>();
        for (const binding of dataset.targetBindings) {
          const stations = stationsPerPoint.get(binding.physicalPointId) ?? new Set<string>();
          stations.add(binding.stationId);
          stationsPerPoint.set(binding.physicalPointId, stations);
        }
        const sharedCount = [...stationsPerPoint.values()].filter((stations) => stations.size > 1).length;
        const entry = manifest.datasets.find((candidate) => candidate.id === dataset.id)!;
        expect(sharedCount, `${dataset.id} shared point count`).toBe(entry.sharedPointCount);
        if (dataset.stations.length === 1) expect(sharedCount).toBe(0);
        else expect(sharedCount).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('keeps every observation attached to a declared binding, station and epoch', () => {
    for (const shard of manifest.shards) {
      for (const dataset of readShard(shard.file)) {
        const bindingIds = new Set(dataset.targetBindings.map((binding) => binding.id));
        const stationIds = new Set(dataset.stations.map((station) => station.id));
        const epochKinds = new Set(dataset.epochs.map((epoch) => epoch.kind));
        for (const observation of dataset.observations) {
          expect(bindingIds).toContain(observation.bindingId);
          expect(stationIds).toContain(observation.stationId);
          expect(epochKinds).toContain(observation.epochKind);
        }
      }
    }
  });
});
