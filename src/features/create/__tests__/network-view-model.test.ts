import { describe, expect, it } from 'vitest';
import type { DraftInitialisationResult, WizardDraft } from '@/demo/draft';
import { buildNetworkViewModel, draftPointKeyBySource, networkBounds } from '@/features/create/network-view-model';

function draft(): WizardDraft {
  return {
    id: 'draft-network',
    updatedAt: '2026-07-17T10:00:00.000Z',
    step: 4,
    name: 'Network',
    description: '',
    scope: 'network',
    countryPresetId: 'uk-supplied-hs2-nte',
    validFrom: '2026-07-17T10:00:00.000Z',
    activateAfterCreation: false,
    stationCodes: ['STA', 'STB'],
    stations: [],
    targets: [
      {
        stationCode: 'STA', rawTargetName: 'A1', role: 'monitoring', measurementType: 'prism', edmMode: 'precise-prism',
        requiredConstantM: 0, alreadyAppliedConstantM: 0, targetHeightM: 0, distanceStdErrMm: 1, distancePpm: 1,
        includeInAdjustment: true, publishOutput: true, engineName: 'A1', reviewStatus: 'ok',
      },
      {
        stationCode: 'STB', rawTargetName: 'B1', role: 'monitoring', measurementType: 'prism', edmMode: 'precise-prism',
        requiredConstantM: 0, alreadyAppliedConstantM: 0, targetHeightM: 0, distanceStdErrMm: 1, distancePpm: 1,
        includeInAdjustment: true, publishOutput: true, engineName: 'B1', reviewStatus: 'ok',
      },
      {
        stationCode: 'STA', rawTargetName: 'A2', role: 'monitoring', measurementType: 'prism', edmMode: 'precise-prism',
        requiredConstantM: 0, alreadyAppliedConstantM: 0, targetHeightM: 0, distanceStdErrMm: 1, distancePpm: 1,
        includeInAdjustment: true, publishOutput: true, engineName: 'A2', reviewStatus: 'ok',
      },
    ],
    sharedPoints: [{
      key: 'SP_1',
      members: [
        { stationCode: 'STA', rawTargetName: 'A1' },
        { stationCode: 'STB', rawTargetName: 'B1' },
      ],
      source: 'manual',
    }],
    initialisation: {
      mode: 'local-anchor', anchorStationCode: 'STA', anchorEastingM: 0, anchorNorthingM: 0,
      anchorHeightM: 0, anchorOrientationDeg: 0, windowFrom: '', windowTo: '', references: [],
      enteredCoordinates: [],
    },
    adjustment: {} as WizardDraft['adjustment'],
    weightsRequireValidation: false,
    chiSquareFailurePolicy: 'fail-run',
    testEpochPassed: false,
    runPolicy: {} as WizardDraft['runPolicy'],
    outputPolicy: {} as WizardDraft['outputPolicy'],
  };
}

const result: DraftInitialisationResult = {
  computedAt: '2026-07-17T10:00:00.000Z',
  stationSolutions: [
    { stationCode: 'STA', eastingM: 0, northingM: 0, heightM: 10, orientationDeg: 0, source: 'anchor', problems: [] },
    { stationCode: 'STB', eastingM: 100, northingM: 0, heightM: 11, orientationDeg: 180, source: 'network', problems: [] },
  ],
  coordinates: [
    {
      pointKey: 'A1', eastingM: 50, northingM: 50, heightM: 12, stationCount: 2, observationCount: 4,
      horizontalSpreadM: 0.001, verticalSpreadM: 0.001, status: 'computed',
      perStation: [
        { stationCode: 'STA', eastingM: 50, northingM: 50, heightM: 12, nObs: 2 },
        { stationCode: 'STB', eastingM: 50.001, northingM: 50, heightM: 12.001, nObs: 2 },
      ],
    },
    {
      pointKey: 'A2', eastingM: -20, northingM: 10, heightM: 9, stationCount: 1, observationCount: 2,
      horizontalSpreadM: 0, verticalSpreadM: 0, status: 'computed',
      perStation: [
        { stationCode: 'STA', eastingM: -20, northingM: 10, heightM: 9, nObs: 2 },
      ],
    },
  ],
  coverage: {
    expectedStationTargetPairs: 3, availableStationTargetPairs: 3, missingStationTargets: [],
    expectedPhysicalPoints: 2, availablePhysicalPoints: 2, observationsUsed: 6, representativeCount: 3,
  },
  failures: [],
  accepted: false,
};

describe('network initialisation view model', () => {
  it('maps confirmed shared members to one physical point key', () => {
    const map = draftPointKeyBySource(draft());
    expect(map.get('STA|A1')).toBe('A1');
    expect(map.get('STB|B1')).toBe('A1');
    expect(map.get('STA|A2')).toBe('A2');
  });

  it('links a shared point to both stations and keeps an individual point on its station', () => {
    const model = buildNetworkViewModel(draft(), result);
    const shared = model.nodes.find((node) => node.id === 'point:A1');
    expect(shared?.stationCodes).toEqual(['STA', 'STB']);
    expect(model.links.filter((link) => link.pointNodeId === 'point:A1')).toHaveLength(2);
    expect(model.links.filter((link) => link.pointNodeId === 'point:A2').map((link) => link.stationCode)).toEqual(['STA']);
  });

  it('returns stable non-zero bounds for a flat network', () => {
    const bounds = networkBounds([
      { id: 'a', label: 'a', kind: 'station', eastingM: 2, northingM: 3, heightM: 0, stationCodes: ['STA'] },
    ]);
    expect(bounds.maxEastingM - bounds.minEastingM).toBe(1);
    expect(bounds.maxNorthingM - bounds.minNorthingM).toBe(1);
  });
});
