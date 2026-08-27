import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '@/demo/fixtures/kh-uk.generated/manifest.json';
import { demoCatalogue } from '@/demo/catalogue';
import { LOCAL_UK_STATIONS, localUkStationFixtures } from '@/demo/local-uk-stations';
import { createFreshStore } from '@/demo/store';

describe('anonymised KH01/KH02 UK field fixtures', () => {
  it('publishes only the two anonymised station identities and UK/DMS source contract', () => {
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      datasetId: 'UK-KH-FIELD-STATIONS-V1',
      countryTemplate: 'UK',
      sourceAngleUnit: 'DMS',
      canonicalAngleUnit: 'DEGREES',
      sourceDistanceKind: 'slope',
      cycleEpoch: 'StartOfCycle',
      anonymised: true,
      technicalRecordCount: 5_688,
    });
    expect(LOCAL_UK_STATIONS).toEqual([
      {
        stationId: 501,
        stationCode: 'KH01',
        cycleCount: 316,
        observationCount: 55_093,
        targetCount: 194,
        firstEpoch: '2026-08-01T00:00:01.000Z',
        lastEpoch: '2026-08-27T06:00:01.000Z',
      },
      {
        stationId: 502,
        stationCode: 'KH02',
        cycleCount: 316,
        observationCount: 49_039,
        targetCount: 194,
        firstEpoch: '2026-08-01T00:00:01.000Z',
        lastEpoch: '2026-08-27T06:00:01.000Z',
      },
    ]);

    const generatedDir = resolve('src/demo/fixtures/kh-uk.generated');
    const generatedText = readdirSync(generatedDir)
      .map((name) => readFileSync(resolve(generatedDir, name), 'utf8'))
      .join('\n');
    expect(generatedText).not.toMatch(/Kilmuir|05053|KM0545|KM0791/i);
  });

  it('loads every source cycle as direct decimal-degree Hz/Vz/slope observations', () => {
    const fixtures = localUkStationFixtures();
    expect(fixtures.map((fixture) => ({
      stationCode: fixture.stationCode,
      cycles: fixture.cycles.length,
      observations: fixture.observations.length,
      environment: fixture.environment.length,
      targets: new Set(fixture.observations.map((observation) => observation.rawTargetName)).size,
    }))).toEqual([
      { stationCode: 'KH01', cycles: 316, observations: 55_093, environment: 316, targets: 194 },
      { stationCode: 'KH02', cycles: 316, observations: 49_039, environment: 316, targets: 194 },
    ]);

    const kh01 = fixtures[0];
    expect(kh01.environment[0]).toEqual({
      epoch: '2026-08-01T00:00:01.000Z',
      temperatureC: 24.22192,
      pressureHPa: 1019.352,
    });
    expect(kh01.observations[0]).toEqual({
      id: 'KH01-2026-08-01T00:00:01.000Z-RTS1_3601',
      stationCode: 'KH01',
      rawTargetName: 'RTS1_3601',
      epoch: '2026-08-01T00:00:01.000Z',
      hzDeg: 14.60361,
      vzDeg: 98.7325,
      sdM: 25.156,
    });
    for (const fixture of fixtures) {
      expect(fixture.observations.every((observation) =>
        Number.isFinite(observation.hzDeg)
        && Number.isFinite(observation.vzDeg)
        && Number.isFinite(observation.sdM)
        && observation.sdM > 0,
      )).toBe(true);
    }
  });

  it('registers KH01 and KH02 independently in the station catalogue', () => {
    const catalogue = demoCatalogue();
    expect(catalogue.stations.filter((station) => ['KH01', 'KH02'].includes(station.stationCode))).toEqual([
      expect.objectContaining({
        stationId: 501,
        stationCode: 'KH01',
        datasetId: 'uk-field-local',
        datasetLabel: 'UK field observations',
        observationCount: 55_093,
        targetCount: 194,
        estimatedCycleMinutes: 120,
        hasEnvironmentVariables: true,
      }),
      expect.objectContaining({
        stationId: 502,
        stationCode: 'KH02',
        datasetId: 'uk-field-local',
        datasetLabel: 'UK field observations',
        observationCount: 49_039,
        targetCount: 194,
        estimatedCycleMinutes: 120,
        hasEnvironmentVariables: true,
      }),
    ]);
    expect(catalogue.targets.filter((target) => target.stationCode === 'KH01')).toHaveLength(194);
    expect(catalogue.targets.filter((target) => target.stationCode === 'KH02')).toHaveLength(194);
  });

  it('uses the UK template and keeps 360 targets as ordinary monitoring points', () => {
    const store = createFreshStore(false);
    const draft = store.createDraft('uk-supplied-hs2-nte', 'single-station');
    store.applyStationSelection(draft, ['KH01']);

    expect(draft.adjustment.angleOutputUnits).toBe('DMS');
    expect(draft.stations[0]).toMatchObject({
      stationCode: 'KH01',
      instrumentTemplateId: 'leica-tm50-i',
      atmosphericPolicy: { mode: 'cycle-temperature-pressure' },
    });
    expect(draft.targets).toHaveLength(194);
    expect(draft.targets.find((target) => target.rawTargetName === 'RTS1_3601')).toMatchObject({
      role: 'monitoring',
      publishOutput: true,
      measurementSetupId: 'uk-leica-circular-0',
    });
    expect(draft.targets.find((target) => target.rawTargetName === 'RTS1_3602')).toMatchObject({
      role: 'monitoring',
      publishOutput: true,
    });
    expect(draft.targets.find((target) => target.rawTargetName === 'RTS1_REF1')).toMatchObject({
      role: 'reference',
      publishOutput: false,
    });
  });
});
