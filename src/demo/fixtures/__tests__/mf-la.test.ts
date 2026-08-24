import { describe, expect, it } from 'vitest';
import manifest from '@/demo/fixtures/mf-la.generated/manifest.json';
import { demoCatalogue } from '@/demo/catalogue';
import { localFrNetworkFixtures } from '@/demo/local-fr-network';
import { createFreshStore } from '@/demo/store';

describe('MF-LA generated raw field fixture', () => {
  it('declares that the generated raw storage itself performs no Face I/Face II processing', () => {
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.rowsPreserved).toBe(true);
    expect(manifest.columnsPreserved).toBe(true);
    expect(manifest.faceReduction).toBe('none');
    expect(manifest.angleUnit).toBe('GON');
    expect(manifest.invalidTextValues).toEqual(['NAN']);
    expect(manifest.invalidSentinels).toEqual([-99999, -99997, -99995, -99990, 99990]);
  });

  it('preserves every Campbell source row, column, target and face slot', () => {
    expect(manifest.stations.map((station) => ({
      stationCode: station.stationCode,
      rowCount: station.rowCount,
      columnCount: station.columnCount,
      targetCount: station.targetCount,
      rawFaceSlotCount: station.rawFaceSlotCount,
    }))).toEqual([
      { stationCode: 'MF_LA_STA1', rowCount: 279, columnCount: 792, targetCount: 130, rawFaceSlotCount: 72_540 },
      { stationCode: 'MF_LA_STA2', rowCount: 280, columnCount: 744, targetCount: 122, rawFaceSlotCount: 68_320 },
    ]);
  });

  it('replaces only the configured source sentinels with NaN', () => {
    expect(manifest.stations.map((station) => ({
      stationCode: station.stationCode,
      nullReplacementCount: station.nullReplacementCount,
      nullReplacements: station.nullReplacements,
    }))).toEqual([
      {
        stationCode: 'MF_LA_STA1',
        nullReplacementCount: 9_192,
        nullReplacements: { 99990: 0, NAN: 0, '-99990': 0, '-99995': 552, '-99997': 0, '-99999': 8_640 },
      },
      {
        stationCode: 'MF_LA_STA2',
        nullReplacementCount: 7_233,
        nullReplacements: { 99990: 0, NAN: 0, '-99990': 0, '-99995': 150, '-99997': 0, '-99999': 7_083 },
      },
    ]);

    const fixtures = localFrNetworkFixtures();
    for (const fixture of fixtures) {
      const metadata = manifest.stations.find((station) => station.stationCode === fixture.stationCode)!;
      const nanCount = fixture.rawRows.reduce(
        (total, row) => total + row.filter((value) => typeof value === 'number' && Number.isNaN(value)).length,
        0,
      );
      expect(nanCount).toBe(metadata.nullReplacementCount);
    }
  });

  it('loads the full raw tables and keeps F1 and F2 in separate columns', () => {
    const fixtures = localFrNetworkFixtures();
    expect(fixtures.map((fixture) => fixture.stationCode)).toEqual(['MF_LA_STA1', 'MF_LA_STA2']);

    for (const fixture of fixtures) {
      const metadata = manifest.stations.find((station) => station.stationCode === fixture.stationCode)!;
      expect(fixture.rawRows).toHaveLength(metadata.rowCount);
      expect(fixture.columns).toHaveLength(metadata.columnCount);
      expect(fixture.rawRows.every((row) => row.length === metadata.columnCount)).toBe(true);
      expect(fixture.columns).toContain('HzF1(1)');
      expect(fixture.columns).toContain('VtF1(1)');
      expect(fixture.columns).toContain('SDF1(1)');
      expect(fixture.columns).toContain('HzF2(1)');
      expect(fixture.columns).toContain('VtF2(1)');
      expect(fixture.columns).toContain('SDF2(1)');
    }

    const sta1 = fixtures[0];
    expect(sta1.rawRows[0][sta1.columns.indexOf('HzF1(1)')]).toBe(177.9264);
    expect(Number.isNaN(sta1.rawRows[0][sta1.columns.indexOf('HzF1(5)')] as number)).toBe(true);
  });

  it('derives only complete Face I/Face II observations without changing the raw tables', () => {
    const fixtures = localFrNetworkFixtures();
    expect(fixtures.map((fixture) => ({
      stationCode: fixture.stationCode,
      observationCount: fixture.observations.length,
      blockedObservationCount: fixture.blockedObservationCount,
      reductionFailures: fixture.reductionFailures,
      environmentCount: fixture.environment.length,
    }))).toEqual([
      {
        stationCode: 'MF_LA_STA1',
        observationCount: 33_550,
        blockedObservationCount: 2_720,
        reductionFailures: { missingOrNonFinite: 2_720, angleOutOfRange: 0, distanceNotPositive: 0 },
        environmentCount: 279,
      },
      {
        stationCode: 'MF_LA_STA2',
        observationCount: 32_070,
        blockedObservationCount: 2_090,
        reductionFailures: { missingOrNonFinite: 2_090, angleOutOfRange: 0, distanceNotPositive: 0 },
        environmentCount: 280,
      },
    ]);

    for (const fixture of fixtures) {
      expect(fixture.observations.every((observation) =>
        Number.isFinite(observation.hzDeg) &&
        Number.isFinite(observation.vzDeg) &&
        Number.isFinite(observation.sdM),
      )).toBe(true);
    }
  });

  it('lists both stations, all configured prisms and the reduced observation layer', () => {
    const catalogue = demoCatalogue();
    expect(catalogue.stations.find((station) => station.stationCode === 'MF_LA_STA1')?.targetCount).toBe(130);
    expect(catalogue.stations.find((station) => station.stationCode === 'MF_LA_STA2')?.targetCount).toBe(122);
    expect(catalogue.targets.filter((target) => target.stationCode === 'MF_LA_STA1')).toHaveLength(130);
    expect(catalogue.targets.filter((target) => target.stationCode === 'MF_LA_STA2')).toHaveLength(122);
    expect(catalogue.observationsByStation.get('MF_LA_STA1')).toHaveLength(33_550);
    expect(catalogue.observationsByStation.get('MF_LA_STA2')).toHaveLength(32_070);
    expect(catalogue.rawDataByStation.get('MF_LA_STA1')?.rawRows).toHaveLength(279);
    expect(catalogue.rawDataByStation.get('MF_LA_STA2')?.rawRows).toHaveLength(280);
  });

  it('provides processed observations for the two MF-LA seed pairs used by the common-point panel', () => {
    const store = createFreshStore(false);
    const draft = store.createDraft('fr-starnet-monitoring', 'network');
    store.applyStationSelection(draft, ['MF_LA_STA1', 'MF_LA_STA2']);

    const check = store.geometryCheckForDraft(draft, 'MF_LA_STA1', 'MF_LA_STA2', [
      { aTargetKey: 'PRISM_066', bTargetKey: 'PRISM_004' },
      { aTargetKey: 'PRISM_050', bTargetKey: 'PRISM_005' },
    ]);

    expect(check.status).toBe('weak');
    expect(check.diagnostics.validSeedCount).toBe(2);
    expect(check.diagnostics.stationAPointCount).toBeGreaterThan(0);
    expect(check.diagnostics.stationBPointCount).toBeGreaterThan(0);
    expect(check.message).not.toContain('processed observations in the selected initialisation window');
  });
});
