import type { EnvironmentReading } from '@/domain/corrections/atmosphere';
import type { RawObservation } from '@/domain/entities';

/**
 * Optional private MF-LA field fixtures.
 *
 * Vite only includes files that physically exist in `local-test-data/`. That directory is ignored
 * by Git, so the real field files can exercise the mock-up without becoming repository content or
 * part of the normal coding context. A clean clone simply returns no local stations.
 */
const localDatFiles = import.meta.glob('./local-test-data/*.dat', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface LocalFrStationFixture {
  stationCode: string;
  observations: RawObservation[];
  environment: EnvironmentReading[];
}

function csvFields(line: string): string[] {
  const fields: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      fields.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  fields.push(value);
  return fields;
}

function finiteMeasurement(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed !== -99999 ? parsed : undefined;
}

function isoEpoch(value: string): string | undefined {
  const parsed = new Date(`${value.trim().replace(' ', 'T')}Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function parseStation(raw: string): LocalFrStationFixture | undefined {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 5) return undefined;

  const metadata = csvFields(lines[0]);
  const stationCode = metadata[1]?.trim();
  const headers = csvFields(lines[1]);
  if (!stationCode || headers[0] !== 'TIMESTAMP') return undefined;

  const column = new Map(headers.map((header, index) => [header, index]));
  const targetIndexes = headers
    .map((header) => /^HzF1\((\d+)\)$/.exec(header)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number);
  const observations: RawObservation[] = [];
  const environment: EnvironmentReading[] = [];

  for (const line of lines.slice(4)) {
    const row = csvFields(line);
    const epoch = isoEpoch(row[0] ?? '');
    if (!epoch) continue;

    const temperature = finiteMeasurement(row[column.get(`${stationCode}_Temperature`) ?? -1]);
    const pressure = finiteMeasurement(row[column.get(`${stationCode}_Pressure`) ?? -1]);
    if (temperature !== undefined && pressure !== undefined) {
      environment.push({ epoch, temperatureC: temperature, pressureHPa: pressure });
    }

    for (const targetIndex of targetIndexes) {
      for (const face of [1, 2] as const) {
        const hzGon = finiteMeasurement(row[column.get(`HzF${face}(${targetIndex})`) ?? -1]);
        const vzGon = finiteMeasurement(row[column.get(`VtF${face}(${targetIndex})`) ?? -1]);
        const sdM = finiteMeasurement(row[column.get(`SDF${face}(${targetIndex})`) ?? -1]);
        if (hzGon === undefined || vzGon === undefined || sdM === undefined || sdM <= 0) continue;
        observations.push({
          id: `${stationCode}-${epoch}-${targetIndex}-F${face}`,
          stationCode,
          rawTargetName: `PRISM_${String(targetIndex).padStart(3, '0')}`,
          epoch,
          // Campbell files store the two angular components in gon; the domain contract uses degrees.
          hzDeg: hzGon * 0.9,
          vzDeg: vzGon * 0.9,
          sdM,
        });
      }
    }
  }

  return observations.length ? { stationCode, observations, environment } : undefined;
}

export function localFrNetworkFixtures(): LocalFrStationFixture[] {
  return Object.entries(localDatFiles)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, raw]) => parseStation(raw))
    .filter((fixture): fixture is LocalFrStationFixture => fixture !== undefined);
}
