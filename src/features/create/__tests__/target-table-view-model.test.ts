import { describe, expect, it } from 'vitest';
import type { CatalogueTarget } from '@/demo/catalogue';
import type { WizardDraft } from '@/demo/draft';
import {
  buildTargetTableRows,
  catalogueTargetKey,
  paginateTargetRows,
  summarizeTargets,
  targetConstantDeltaMm,
  valueForNumberInput,
} from '@/features/create/target-table-view-model';

type WizardTarget = WizardDraft['targets'][number];

const targets: WizardTarget[] = [
  {
    stationCode: 'STA_02',
    rawTargetName: 'P_10',
    role: 'monitoring',
    measurementType: 'prism',
    edmMode: 'precise-prism',
    requiredConstantM: 0.03,
    alreadyAppliedConstantM: 0,
    targetHeightM: 0,
    distanceStdErrMm: 1,
    distancePpm: 1,
    includeInAdjustment: true,
    publishOutput: true,
    engineName: 'MON_10',
    reviewStatus: 'ok',
  },
  {
    stationCode: 'STA_01',
    rawTargetName: 'REF_2',
    role: 'reference',
    measurementType: 'reflectorless',
    edmMode: 'fine-non-prism',
    requiredConstantM: 0,
    alreadyAppliedConstantM: 0,
    targetHeightM: 1.5,
    distanceStdErrMm: 2,
    distancePpm: 2,
    includeInAdjustment: true,
    publishOutput: false,
    engineName: 'REF_2',
    reviewStatus: 'to-review',
  },
];

const catalogue = new Map<string, CatalogueTarget>([
  [catalogueTargetKey('STA_02', 'P_10'), {
    stationCode: 'STA_02', rawTargetName: 'P_10', prismSensorId: 1010,
    hzVariableId: 10101, vzVariableId: 10102, sdVariableId: 10103,
  } as CatalogueTarget],
]);

describe('target table view model', () => {
  it('filters by technical identifiers and returns a stable station/target order', () => {
    const all = buildTargetTableRows(targets, catalogue, {
      search: '', stationCode: 'all', role: 'all', measurementType: 'all',
    });
    expect(all.map((row) => row.target.rawTargetName)).toEqual(['REF_2', 'P_10']);

    const bySensor = buildTargetTableRows(targets, catalogue, {
      search: '10103', stationCode: 'all', role: 'all', measurementType: 'all',
    });
    expect(bySensor.map((row) => row.target.engineName)).toEqual(['MON_10']);
  });

  it('combines station, role and measurement filters', () => {
    const rows = buildTargetTableRows(targets, catalogue, {
      search: '', stationCode: 'STA_01', role: 'reference', measurementType: 'reflectorless',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].target.rawTargetName).toBe('REF_2');
  });

  it('summarises usage and review state without losing targets', () => {
    expect(summarizeTargets(targets)).toEqual({
      total: 2,
      included: 2,
      published: 1,
      reviewRequired: 1,
    });
  });

  it('formats measurement values and keeps reflectorless constants at zero', () => {
    expect(targetConstantDeltaMm(targets[0])).toBeCloseTo(30);
    expect(targetConstantDeltaMm(targets[1])).toBe(0);
    expect(valueForNumberInput(8.9000000001, 1)).toBe(8.9);
    expect(valueForNumberInput(1.23456, 3)).toBe(1.235);
  });

  it('paginates compact rows deterministically', () => {
    const rows = buildTargetTableRows(targets, catalogue, {
      search: '', stationCode: 'all', role: 'all', measurementType: 'all',
    });
    expect(paginateTargetRows(rows, 0, 1)[0].target.rawTargetName).toBe('REF_2');
    expect(paginateTargetRows(rows, 1, 1)[0].target.rawTargetName).toBe('P_10');
  });
});
