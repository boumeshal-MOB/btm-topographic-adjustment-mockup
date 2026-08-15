import { describe, expect, it } from 'vitest';
import {
  containsOracleContent,
  revealDataset,
  sealDataset,
} from '@/domain/validation-catalogue/blind-mode';
import { datasetIdentity } from '@/domain/validation-catalogue/identity';
import { buildImportPlan } from '@/domain/validation-catalogue/adapter';
import { readDataset, readManifest } from './catalogue-fixtures';

describe('blind mode', () => {
  it('removes every trace of the answer from the dataset the lab receives', () => {
    const dataset = readDataset('BTM-VAL-001');
    expect(containsOracleContent(dataset)).toBe(true);

    const sealed = sealDataset(dataset);
    expect(containsOracleContent(sealed.blind)).toBe(false);
    expect(sealed.blind.oracle).toBeUndefined();
    expect(sealed.blind.scenario.primary).toBe('undisclosed');
    expect(sealed.blind.scenario.secondary).toBeNull();
    for (const observation of sealed.blind.observations) {
      expect(observation.truth).toBeUndefined();
      expect(observation.injectedFaults).toBeUndefined();
    }

    // a blind dataset serialised anywhere cannot leak the scenario name — including through the
    // generator's human-readable title, which spells the family out in words
    const serialised = JSON.stringify(sealed.blind);
    expect(serialised).not.toContain('moved-reference');
    expect(serialised).not.toContain('faultPlans');
    expect(serialised).not.toContain('physicalPointTruth');
    expect(sealed.blind.title).toBe('BTM-VAL-001 — 1-station validation case');
    expect(sealed.title).toContain('moved-reference');
  });

  it('refuses to call a dataset blind while any scenario name survives in its title', () => {
    const dataset = readDataset('BTM-VAL-001');
    const leaking = { ...sealDataset(dataset).blind, title: '1-station moved-reference validation case' };
    expect(containsOracleContent(leaking)).toBe(true);
  });

  it('keeps everything the surveyor legitimately configures', () => {
    const dataset = readDataset('BTM-VAL-041');
    const sealed = sealDataset(dataset);

    expect(sealed.blind.stations).toHaveLength(dataset.stations.length);
    expect(sealed.blind.observations).toHaveLength(dataset.observations.length);
    expect(sealed.blind.referenceConstraints).toEqual(dataset.referenceConstraints);
    expect(sealed.blind.measurementSetups).toEqual(dataset.measurementSetups);
    expect(sealed.blind.initialCoordinates).toEqual(dataset.initialCoordinates);

    // identity survives, because it is configuration and not an answer
    expect(datasetIdentity(sealed.blind)).toEqual(datasetIdentity(dataset));
  });

  it('produces the same import plan blind or revealed', () => {
    const dataset = readDataset('BTM-VAL-041');
    const entry = readManifest().datasets.find((candidate) => candidate.id === dataset.id)!;
    const blindPlan = buildImportPlan(sealDataset(dataset).blind, entry.template);
    const fullPlan = buildImportPlan(dataset, entry.template);

    expect(blindPlan.stations).toEqual(fullPlan.stations);
    expect(blindPlan.targets).toEqual(fullPlan.targets);
    expect(blindPlan.references).toEqual(fullPlan.references);
    expect(blindPlan.sharedPoints).toEqual(fullPlan.sharedPoints);
    expect(blindPlan.observationsByStation).toEqual(fullPlan.observationsByStation);
  });

  it('restores the sealed answer only when explicitly revealed', () => {
    const dataset = readDataset('BTM-VAL-003');
    const sealed = sealDataset(dataset);
    const revealed = revealDataset(sealed, sealed.blind);

    expect(revealed.scenario).toEqual(dataset.scenario);
    expect(revealed.oracle).toEqual(dataset.oracle);
    expect(containsOracleContent(revealed)).toBe(true);
  });

  it('is idempotent, so a double seal cannot resurrect the answer', () => {
    const dataset = readDataset('BTM-VAL-010');
    const once = sealDataset(dataset).blind;
    const twice = sealDataset(once).blind;
    expect(twice).toEqual(once);
    expect(containsOracleContent(twice)).toBe(false);
  });
});
