import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseStationImportFiles,
  type StationImportSourceFile,
} from '@/domain/station-import';
import { createFreshStore } from '@/demo/store';

function source(name: string, content: string): StationImportSourceFile {
  return { name, content, size: content.length, lastModified: 0 };
}

function csvRow(values: string[]): string {
  return values.map((value) => `"${value.replaceAll('"', '""')}"`).join(',');
}

describe('station file detection and autonomous import', () => {
  it('detects both supplied FVD Campbell variants and keeps every source acquisition', () => {
    const paths = [
      'test-data/source/fvd/FVD_STA1_daily_all.dat',
      'test-data/source/fvd/FVD_STA3_DailyAvg_all.dat',
    ];
    const parsed = parseStationImportFiles(paths.map((path) => source(
      path.split('/').at(-1)!,
      readFileSync(path, 'utf8'),
    )));

    expect(parsed.candidates.map((candidate) => ({
      code: candidate.stationCode,
      format: candidate.detectedFormat,
      acquisitions: candidate.acquisitionEpochs.length,
      targets: candidate.targetNames.length,
    }))).toEqual([
      { code: 'FVD_STA1', format: 'campbell-toa5-double-face', acquisitions: 121, targets: 94 },
      { code: 'FVD_STA3', format: 'campbell-toa5-double-face', acquisitions: 143, targets: 158 },
    ]);
    expect(parsed.candidates.find((candidate) => candidate.stationCode === 'FVD_STA1')?.observations)
      .toHaveLength(6_167);
    expect(parsed.candidates.find((candidate) => candidate.stationCode === 'FVD_STA3')?.observations)
      .toHaveLength(15_698);
  });

  it('detects an explicit Hz/Vz/Sd table and keeps an invalid row epoch without inventing data', () => {
    const parsed = parseStationImportFiles([source('monitoring.csv', [
      'Timestamp,Station,Target,Hz,Vz,Sd,Temperature,Pressure',
      '2026-01-01 00:00:00,NEW_STA,P01,10,95,25.5,12,1013',
      '2026-01-02 00:00:00,NEW_STA,P01,NaN,95,25.5,13,1012',
    ].join('\n'))]);
    const candidate = parsed.candidates[0];
    expect(candidate).toMatchObject({ stationCode: 'NEW_STA', detectedFormat: 'observation-table' });
    expect(candidate.acquisitionEpochs).toHaveLength(2);
    expect(candidate.observations).toHaveLength(1);
    expect(candidate.failures.missingOrNonFinite).toBe(1);

    const store = createFreshStore(false);
    const batch = store.prepareUserStationImport(parsed, {});
    store.attachUserStationImportBatches([batch]);
    const draft = store.createDraft('uk-supplied-hs2-nte', 'single-station');
    store.applyStationSelection(draft, ['NEW_STA']);
    expect(store.availableSlotsForDraft(draft)).toEqual([
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
    ]);
  });

  it('uses a declared table header before row-shape heuristics and rejects mixed angle units', () => {
    const nineColumnTable = parseStationImportFiles([source('nine-columns.csv', [
      'Timestamp,Station,Target,Hz,Vz,Sd,Temperature,Pressure,Comment',
      '2026-01-01 00:00:00,NINE_COL,P01,10,95,25.5,12,1013,valid',
    ].join('\n'))]);
    expect(nineColumnTable.candidates[0]).toMatchObject({
      stationCode: 'NINE_COL',
      detectedFormat: 'observation-table',
      sourceAngleUnit: 'DEGREES',
    });

    expect(() => parseStationImportFiles([source('mixed-units.csv', [
      'Timestamp,Station,Target,Hz_gon,Vz_deg,Sd',
      '2026-01-01 00:00:00,MIXED,P01,10,95,25.5',
    ].join('\n'))])).toThrow(/same angle unit/i);
  });

  it('detects paired UK point/environment files as one station', () => {
    const environment = Array.from({ length: 24 }, () => '');
    environment[0] = '2026-02-01 00:00:00';
    environment[4] = 'UK_NEW';
    environment[7] = '42';
    environment[8] = '1';
    environment[9] = '2026-02-01 00:00:01';
    environment[12] = '0';
    environment[14] = '1';
    const target = Array.from({ length: 9 }, () => '');
    target[0] = '2026-02-01 00:00:02';
    target[2] = 'UK_NEW';
    target[3] = 'P01';
    target[4] = '12.5';
    target[5] = '91.25';
    target[6] = '30.2';
    target[7] = '42';
    const atmosphere = [...target];
    atmosphere[3] = 'Lgr_Environ';
    atmosphere[5] = '18.5';
    atmosphere[6] = '1008.2';

    const parsed = parseStationImportFiles([
      source('site_RTS_Environ.dat', csvRow(environment)),
      source('site_RTS_Points.dat', [csvRow(target), csvRow(atmosphere)].join('\n')),
    ]);
    expect(parsed.candidates[0]).toMatchObject({
      stationCode: 'UK_NEW',
      detectedFormat: 'uk-rts-points-environment',
      suggestedTemplate: 'UK',
      sourceRowCount: 3,
    });
    expect(parsed.candidates[0].observations).toHaveLength(1);
    expect(parsed.candidates[0].environment).toHaveLength(1);
  });
});
