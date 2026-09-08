import { describe, expect, it } from 'vitest';
import { demoCatalogue } from '@/demo/catalogue';
import {
  FVD_STA1_METADATA,
  localFvdStationFixture,
  localFvdStationFixtures,
} from '@/demo/local-fvd-station';
import { reduceDoubleFace } from '@/domain/double-face';
import { createFreshStore } from '@/demo/store';

describe('FVD_STA3 uses the existing French station pipeline', () => {
  it('preserves the daily raw table and its missing day', () => {
    const fixture = localFvdStationFixture();
    expect(fixture.rawRows).toHaveLength(143);
    expect(fixture.columns).toHaveLength(960);
    expect(fixture.rawRows.every((row) => row.length === 960)).toBe(true);
    expect(fixture.rawRows[0][0]).toBe('2026-03-01 00:00:00');
    expect(fixture.rawRows.at(-1)?.[0]).toBe('2026-07-22 00:00:00');
    expect(fixture.rawRows.some((row) => row[0] === '2026-06-29 00:00:00')).toBe(false);
    expect(fixture.rawRows.flat().filter((v) => typeof v === 'number' && Number.isNaN(v))).toHaveLength(40368);
    expect(fixture.environment).toHaveLength(143);
  });

  it('uses unchanged double-face reduction, without a new single-face fallback or rejection threshold', () => {
    const fixture = localFvdStationFixture();
    expect(fixture.observations).toHaveLength(15698);
    expect(fixture.blockedObservationCount).toBe(6896);
    expect(fixture.reductionFailures).toEqual({
      missingOrNonFinite: 6896, angleOutOfRange: 0, distanceNotPositive: 0,
    });
    // Keep even the largest face-distance discrepancy: no extra QC threshold was introduced.
    const row = fixture.rawRows.find((row) => row[0] === '2026-06-05 00:00:00')!;
    const value = (name: string) => row[fixture.columns.indexOf(name)] as number;
    const expected = reduceDoubleFace({
      hzFace1: value('HzF1(110)'), vzFace1: value('VtF1(110)'), sdFace1M: value('SDF1(110)'),
      hzFace2: value('HzF2(110)'), vzFace2: value('VtF2(110)'), sdFace2M: value('SDF2(110)'),
    }, 'GON');
    expect(expected.ok).toBe(true);
    if (expected.ok) {
      expect(fixture.observations.find((o) => o.epoch === '2026-06-05T00:00:00.000Z'
        && o.rawTargetName === 'PRISM_110')).toMatchObject(expected.observation);
    }
  });

  it('adds an independent station after the existing stations, with all configured target slots', () => {
    const catalogue = demoCatalogue();
    expect(catalogue.stations.find((station) => station.stationCode === 'FVD_STA3')).toMatchObject({
      stationCode: 'FVD_STA3', stationId: 403, datasetId: 'fvd-sta3-local',
      targetCount: 158, observationCount: 15698, estimatedCycleMinutes: 1440,
    });
    expect(catalogue.targets.filter((t) => t.stationCode === 'FVD_STA3')).toHaveLength(158);
    expect(catalogue.targets.find((t) => t.stationCode === 'FVD_STA3'
      && t.rawTargetName === 'PRISM_158')?.observationCount).toBe(0);
    expect(catalogue.observationsByStation.get('MF_LA_STA1')).toHaveLength(33550);
    expect(catalogue.observationsByStation.get('MF_LA_STA2')).toHaveLength(32070);
    const store = createFreshStore(false);
    const draft = store.createDraft('fr-starnet-monitoring', 'single-station');
    expect(() => store.applyStationSelection(draft, ['FVD_STA3'])).not.toThrow();
  });
});

describe('FVD all-station daily datasets', () => {
  it('adds FVD_STA1 without changing the shared French reduction', () => {
    const fixture = localFvdStationFixtures().find((candidate) => candidate.stationCode === 'FVD_STA1')!;
    expect(fixture.rawRows).toHaveLength(121);
    expect(fixture.columns).toHaveLength(576);
    expect(fixture.rawRows.every((row) => row.length === 576)).toBe(true);
    expect(fixture.rawRows[0][0]).toBe('2026-03-01 23:00:00');
    expect(fixture.rawRows.at(-1)?.[0]).toBe('2026-06-29 23:00:00');
    expect(fixture.environment).toHaveLength(121);
    expect(fixture.observations.length + fixture.blockedObservationCount).toBe(121 * 94);
    expect(fixture.observations.some((observation) => observation.rawTargetName === 'MPO901')).toBe(true);
    expect(FVD_STA1_METADATA.targetNames).toHaveLength(94);
  });

  it('keeps STA3 identities stable, appends STA1 and exposes every daily acquisition', () => {
    const catalogue = demoCatalogue();
    expect(catalogue.stations.slice(-2).map((station) => ({
      stationCode: station.stationCode,
      stationId: station.stationId,
      targetCount: station.targetCount,
    }))).toEqual([
      { stationCode: 'FVD_STA3', stationId: 403, targetCount: 158 },
      { stationCode: 'FVD_STA1', stationId: 404, targetCount: 94 },
    ]);
    expect(catalogue.targets.filter((target) => target.stationCode === 'FVD_STA1')).toHaveLength(94);
    expect(catalogue.rawDataByStation.get('FVD_STA1')?.rawRows).toHaveLength(121);

    const store = createFreshStore(false);
    const draft = store.createDraft('fr-starnet-monitoring', 'single-station');
    store.applyStationSelection(draft, ['FVD_STA1']);
    const slots = store.availableSlotsForDraft(draft);
    expect(slots).toHaveLength(121);
    expect(slots[0]).toBe('2026-03-01T23:00:00.000Z');
    expect(slots.at(-1)).toBe('2026-06-29T23:00:00.000Z');
  });
});
