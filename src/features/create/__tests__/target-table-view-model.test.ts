import { describe, expect, it } from 'vitest';
import type { CatalogueTarget } from '@/demo/catalogue';
import type { DraftReference, WizardDraft } from '@/demo/draft';
import { draftReflectorOptions } from '@/demo/station-precision';
import {
  applyBulkConstraint,
  applyBulkEdit,
  buildTargetTableRows,
  catalogueTargetKey,
  groupTargetRowsByStation,
  paginateTargetRows,
  summarizeTargets,
  targetConstantDeltaMm,
  targetKey,
  valueForNumberInput,
  visibleKeys,
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

/** A draft reduced to what this view model reads: the sights, the stations, the coordinate records. */
function draftWith(
  overrides: { targets?: WizardTarget[]; references?: DraftReference[]; precisionEdited?: boolean } = {},
): WizardDraft {
  const stationCodes = ['STA_01', 'STA_02'];
  return {
    countryPresetId: 'fr-starnet-monitoring',
    stationCodes,
    stations: stationCodes.map((stationCode) => ({
      stationCode,
      required: true,
      instrumentTemplateId: 'topcon-ms05axii',
      instrumentHeightM: 1.5,
      atmosphericPolicy: { mode: 'none' },
      precisionEdited: overrides.precisionEdited ?? false,
    })),
    targets: overrides.targets ?? targets,
    initialisation: { references: overrides.references ?? [] },
  } as unknown as WizardDraft;
}

const reflectors = draftReflectorOptions('fr-starnet-monitoring');

const context = (draft: WizardDraft) => ({ draft, catalogueByKey: catalogue, reflectors });
const noFilter = { search: '', stationCode: 'all' as const, role: 'all' as const, measurementType: 'all' as const };

describe('target table view model', () => {
  it('filters by technical identifiers and returns a stable station/target order', () => {
    const all = buildTargetTableRows(context(draftWith()), noFilter);
    expect(all.map((row) => row.target.rawTargetName)).toEqual(['REF_2', 'P_10']);

    const bySensor = buildTargetTableRows(context(draftWith()), { ...noFilter, search: '10103' });
    expect(bySensor.map((row) => row.target.engineName)).toEqual(['MON_10']);
  });

  it('combines station, role and measurement filters', () => {
    const rows = buildTargetTableRows(context(draftWith()), {
      ...noFilter, stationCode: 'STA_01', role: 'reference', measurementType: 'reflectorless',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].target.rawTargetName).toBe('REF_2');
  });

  it('resolves each sight from its station instrument, and names the source', () => {
    // The FR template states 0.5" and 0.8 mm + 1 ppm for a prism: a sight that says nothing must be
    // weighted with those, and the row must say the number came from the template.
    const rows = buildTargetTableRows(context(draftWith()), noFilter);
    const prism = rows.find((row) => row.target.engineName === 'MON_10')!;
    expect(prism.precision.distanceStdErrMm).toEqual({ value: 0.8, source: 'template' });
    expect(prism.precision.directionArcSec).toEqual({ value: 0.5, source: 'template' });
    expect(prism.overridesPrecision).toBe(false);

    // A reflectorless sight is weighted with the reflectorless figure, not the prism one.
    const sheet = rows.find((row) => row.target.engineName === 'REF_2')!;
    expect(sheet.precision.distanceStdErrMm.value).toBe(1);
  });

  it('marks a sight that restates a standard error, and only that sight', () => {
    const draft = draftWith({
      targets: [{ ...targets[0], distanceStdErrMm: 2.5 }, targets[1]],
    });
    const rows = buildTargetTableRows(context(draft), noFilter);
    const overridden = rows.find((row) => row.target.engineName === 'MON_10')!;
    expect(overridden.precision.distanceStdErrMm).toEqual({ value: 2.5, source: 'sight' });
    expect(overridden.overridesPrecision).toBe(true);
    // The ppm was not restated, so it still follows the instrument.
    expect(overridden.precision.distancePpm.source).toBe('template');
    expect(rows.find((row) => row.target.engineName === 'REF_2')!.overridesPrecision).toBe(false);
  });

  it('matches a sight to the catalogued reflector it actually holds, and says when it does not', () => {
    // FR ships an MPO whose 25.5 mm is already applied in the field.
    const mpo: WizardTarget = { ...targets[0], requiredConstantM: 0.0255, alreadyAppliedConstantM: 0.0255 };
    const [row] = buildTargetTableRows(context(draftWith({ targets: [mpo] })), noFilter);
    expect(row.reflectorId).toBe('fr-mpo-25_5-applied');
    expect(row.constant).toEqual({ kind: 'applied', deltaMm: 0, requiredMm: 25.5 });

    // The UK 30 mm constant does not exist in the FR template: the row says custom rather than
    // claiming a reflector the survey never used.
    const [custom] = buildTargetTableRows(context(draftWith({ targets: [targets[0]] })), noFilter);
    expect(custom.reflectorId).toBe('custom');
    expect(custom.constant.kind).toBe('btm');
    expect(custom.constant.deltaMm).toBeCloseTo(30);
  });

  it('summarises usage, constrained references and overrides', () => {
    const references: DraftReference[] = [{
      pointKey: 'REF_2',
      eastingM: 10, northingM: 20, heightM: 30,
      modeE: 'weak', modeN: 'weak', modeH: 'free',
      sigmaM: 0.001,
      source: 'dataset',
    }];
    expect(summarizeTargets(draftWith({ references }))).toEqual({
      total: 2,
      included: 2,
      published: 1,
      reviewRequired: 1,
      references: 1,
      constrainedReferences: 1,
      overrides: 0,
    });
  });

  it('formats measurement values and keeps reflectorless constants at zero', () => {
    expect(targetConstantDeltaMm(targets[0])).toBeCloseTo(30);
    expect(targetConstantDeltaMm(targets[1])).toBe(0);
    expect(valueForNumberInput(8.9000000001, 1)).toBe(8.9);
    expect(valueForNumberInput(1.23456, 3)).toBe(1.235);
  });

  it('paginates compact rows deterministically', () => {
    const rows = buildTargetTableRows(context(draftWith()), noFilter);
    expect(paginateTargetRows(rows, 0, 1)[0].target.rawTargetName).toBe('REF_2');
    expect(paginateTargetRows(rows, 1, 1)[0].target.rawTargetName).toBe('P_10');
  });

  it('groups the sights by station and puts the references first', () => {
    // A station block is what the native file is made of, and the references are what will carry
    // the datum: a setup is verified against them before anything else.
    const extra: WizardTarget[] = [
      ...targets,
      { ...targets[0], stationCode: 'STA_01', rawTargetName: 'P_01', engineName: 'MON_01' },
      { ...targets[1], stationCode: 'STA_01', rawTargetName: 'REF_1', engineName: 'REF_1' },
    ];
    const groups = groupTargetRowsByStation(buildTargetTableRows(context(draftWith({ targets: extra })), noFilter));

    expect(groups.map((group) => group.stationCode)).toEqual(['STA_01', 'STA_02']);
    expect(groups[0].rows.map((row) => row.target.rawTargetName)).toEqual(['REF_1', 'REF_2', 'P_01']);
    expect(groups[0].byRole.map((group) => group.role)).toEqual(['reference', 'monitoring']);
    // An empty role is not offered as a heading with nothing under it.
    expect(groups[1].byRole.map((group) => group.role)).toEqual(['monitoring']);
  });

  it('writes a bulk edit to the selection only, and leaves blank fields alone', () => {
    const selected = new Set([targetKey(targets[0])]);
    const next = applyBulkEdit(targets, selected, { targetHeightM: 1.234, distanceStdErrMm: 3 }, reflectors);
    expect(next[0].targetHeightM).toBe(1.234);
    expect(next[0].distanceStdErrMm).toBe(3);
    // Untouched fields keep their value, and the unselected sight is returned unchanged.
    expect(next[0].distancePpm).toBeUndefined();
    expect(next[1]).toBe(targets[1]);
  });

  it('sets the reflector and its constant together from the catalogue', () => {
    const selected = new Set([targetKey(targets[0])]);
    const next = applyBulkEdit(targets, selected, { reflectorId: 'fr-mpo-25_5-applied' }, reflectors);
    expect(next[0].measurementSetupId).toBe('fr-mpo-25_5-applied');
    expect(next[0].requiredConstantM).toBeCloseTo(0.0255);
    expect(next[0].alreadyAppliedConstantM).toBeCloseTo(0.0255);
  });

  it('hands the standard errors back to the instrument when asked to follow it', () => {
    const overridden: WizardTarget[] = [{ ...targets[0], distanceStdErrMm: 9, directionStdErrArcSec: 9, distanceKind: 'horizontal' }];
    const next = applyBulkEdit(overridden, new Set([targetKey(overridden[0])]), {
      // A value and "follow the instrument" contradict each other: following wins.
      distanceStdErrMm: 4,
      followInstrument: true,
    }, reflectors);
    expect(next[0].distanceStdErrMm).toBeUndefined();
    expect(next[0].directionStdErrArcSec).toBeUndefined();
    expect(next[0].distanceKind).toBeUndefined();
  });

  it('constrains and frees a whole selection, and frees by removing the record', () => {
    // The caller supplies the coordinates: this function must never invent one. Defaulting to zero
    // wrote records that lied about the point and degenerated the network.
    const points = [
      { pointKey: 'REF_2', eastingM: 10, northingM: 20, heightM: 30 },
      { pointKey: 'MON_10', eastingM: 40, northingM: 50, heightM: 60 },
    ];
    const constrained = applyBulkConstraint([], points, 'weak', 2);
    expect(constrained).toHaveLength(2);
    expect(constrained[0]).toMatchObject({ modeE: 'weak', modeN: 'weak', modeH: 'weak', eastingM: 10 });
    expect(constrained[0].sigmaEM).toBeCloseTo(0.002);

    // A free point keeps no coordinate record at all — freeing is removing the row.
    expect(applyBulkConstraint(constrained, points, 'free')).toEqual([]);
  });

  it('names every visible row so a filtered select-all cannot reach a hidden sight', () => {
    const rows = buildTargetTableRows(context(draftWith()), { ...noFilter, role: 'reference' });
    expect(visibleKeys(rows)).toEqual(['STA_01|REF_2']);
  });
});
