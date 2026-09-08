import manifestJson from '@/demo/fixtures/mf-la.generated/manifest.json';
import type { EnvironmentReading } from '@/domain/corrections/atmosphere';
import { reduceDoubleFace } from '@/domain/double-face';
import type { RawObservation } from '@/domain/entities';

/**
 * Generated MF-LA raw fixture, following the same source→generated-data pattern as ATS34.
 *
 * Source-file publication is dataset-specific. The converter preserves every source data row and
 * every source column in generated JSON shards. JSON `null` is only the
 * transport representation of the configured French missing-value sentinels; this loader restores
 * it to Number.NaN. No Face I/Face II reduction, angle conversion, validity filtering or row
 * deletion happens at this boundary.
 */
const shardModules = import.meta.glob('./fixtures/mf-la.generated/mf_la_sta*.json', {
  import: 'default',
  eager: true,
}) as Record<string, GeneratedShard>;

type SerializedCell = string | number | null;
export type ImportedRawCell = string | number;
type SerializedRow = SerializedCell[];

export interface GeneratedShard {
  stationCode: string;
  rows: SerializedRow[];
}

interface GeneratedManifestStation {
  stationCode: string;
  targetCount: number;
  /** Source-order target names when the Campbell columns carry explicit names. */
  targetNames?: string[];
  rowCount: number;
  columnCount: number;
  rawFaceSlotCount: number;
  firstEpoch: string;
  lastEpoch: string;
  toa5Header: string[];
  columns: string[];
  fieldTypes: string[];
  units: string[];
  nullReplacementCount: number;
  nullReplacements: Record<string, number>;
  shardFiles: string[];
}

export interface GeneratedManifest {
  schemaVersion: 2;
  datasetId: string;
  angleUnit: 'GON';
  rowsPreserved: true;
  columnsPreserved: true;
  faceReduction: 'none';
  stations: GeneratedManifestStation[];
}

export interface LocalFrStationFixture {
  stationCode: string;
  toa5Header: string[];
  columns: string[];
  fieldTypes: string[];
  units: string[];
  /** All imported Campbell data rows, in source order. Missing sentinels are Number.NaN. */
  rawRows: ImportedRawCell[][];
  /** Canonical observations derived atomically from complete Face I/Face II source sextuplets. */
  observations: RawObservation[];
  environment: EnvironmentReading[];
  blockedObservationCount: number;
  reductionFailures: {
    missingOrNonFinite: number;
    angleOutOfRange: number;
    distanceNotPositive: number;
  };
}

const manifest = manifestJson as GeneratedManifest;
const STATION_ID_BY_CODE: Record<string, number> = {
  MF_LA_STA1: 401,
  MF_LA_STA2: 402,
};

/** Safe catalogue metadata, derived from the generated fixture rather than copied by hand. */
export const LOCAL_FR_NETWORK_STATIONS = manifest.stations.map((station) => ({
  stationId: STATION_ID_BY_CODE[station.stationCode],
  stationCode: station.stationCode,
  targetCount: station.targetCount,
  rowCount: station.rowCount,
  columnCount: station.columnCount,
  rawFaceSlotCount: station.rawFaceSlotCount,
  firstEpoch: station.firstEpoch,
  lastEpoch: station.lastEpoch,
  nullReplacementCount: station.nullReplacementCount,
}));

function restoreNaN(value: SerializedCell): ImportedRawCell {
  return value === null ? Number.NaN : value;
}

function numericCell(row: ImportedRawCell[], index: number | undefined): number {
  if (index === undefined) return Number.NaN;
  const value = row[index];
  return typeof value === 'number' ? value : Number.NaN;
}

function isoEpoch(value: ImportedRawCell): string {
  if (typeof value !== 'string') throw new Error(`MF-LA timestamp is not a string: ${String(value)}`);
  const parsed = new Date(`${value.trim().replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid MF-LA timestamp: ${value}`);
  return parsed.toISOString();
}

interface TargetColumns {
  rawTargetName: string;
  hzFace1: string;
  vzFace1: string;
  sdFace1: string;
  hzFace2: string;
  vzFace2: string;
  sdFace2: string;
}

function targetColumns(station: GeneratedManifestStation): TargetColumns[] {
  const indexed = station.columns.flatMap((header) => {
    const match = header.match(/^HzF1\((\d+)\)$/);
    if (!match) return [];
    const index = Number(match[1]);
    return [{
      rawTargetName: `PRISM_${String(index).padStart(3, '0')}`,
      hzFace1: `HzF1(${index})`, vzFace1: `VtF1(${index})`, sdFace1: `SDF1(${index})`,
      hzFace2: `HzF2(${index})`, vzFace2: `VtF2(${index})`, sdFace2: `SDF2(${index})`,
    }];
  });
  if (indexed.length > 0) return indexed;

  const prefix = `${station.stationCode}_`;
  return station.columns.flatMap((header) => {
    if (!header.startsWith(prefix) || !header.endsWith('_F1_Hz')) return [];
    const rawTargetName = header.slice(prefix.length, -'_F1_Hz'.length);
    const field = (face: 1 | 2, component: 'Hz' | 'Vt' | 'SD') =>
      `${prefix}${rawTargetName}_F${face}_${component}`;
    return [{
      rawTargetName,
      hzFace1: field(1, 'Hz'), vzFace1: field(1, 'Vt'), sdFace1: field(1, 'SD'),
      hzFace2: field(2, 'Hz'), vzFace2: field(2, 'Vt'), sdFace2: field(2, 'SD'),
    }];
  });
}

/**
 * Loads the complete raw Campbell tables and derives the canonical observation layer used by the
 * rest of the mock-up. Raw rows remain untouched and separately available for audit/debugging.
 * A reduced observation exists only when all six Hz/Vz/Sd values are finite and physically valid;
 * incomplete sextuplets remain in `rawRows` but never enter `.dat` generation or geometry.
 */
export function localFrNetworkFixtures(
  sourceManifest: GeneratedManifest = manifest,
  sourceShards: Record<string, GeneratedShard> = shardModules,
): LocalFrStationFixture[] {
  const rowsByStation = new Map<string, SerializedRow[]>();
  for (const [, shard] of Object.entries(sourceShards).sort(([left], [right]) => left.localeCompare(right))) {
    rowsByStation.set(shard.stationCode, [...(rowsByStation.get(shard.stationCode) ?? []), ...shard.rows]);
  }

  return sourceManifest.stations.map((station) => {
    const rawRows = (rowsByStation.get(station.stationCode) ?? []).map((row) => row.map(restoreNaN));
    const column = new Map<string, number>(station.columns.map((name, index) => [name, index]));
    const observations: RawObservation[] = [];
    const environment: EnvironmentReading[] = [];
    const reductionFailures = { missingOrNonFinite: 0, angleOutOfRange: 0, distanceNotPositive: 0 };
    const targets = targetColumns(station);
    if (targets.length !== station.targetCount) {
      throw new Error(`${station.stationCode}: found ${targets.length} target column groups; expected ${station.targetCount}`);
    }
    let blockedObservationCount = 0;

    for (const row of rawRows) {
      const epoch = isoEpoch(row[column.get('TIMESTAMP') ?? 0]);
      const temperatureC = numericCell(row, column.get(`${station.stationCode}_Temperature`));
      const pressureHPa = numericCell(row, column.get(`${station.stationCode}_Pressure`));
      if (Number.isFinite(temperatureC) && Number.isFinite(pressureHPa)) {
        environment.push({ epoch, temperatureC, pressureHPa });
      }

      for (const target of targets) {
        const reduced = reduceDoubleFace({
          hzFace1: numericCell(row, column.get(target.hzFace1)),
          vzFace1: numericCell(row, column.get(target.vzFace1)),
          sdFace1M: numericCell(row, column.get(target.sdFace1)),
          hzFace2: numericCell(row, column.get(target.hzFace2)),
          vzFace2: numericCell(row, column.get(target.vzFace2)),
          sdFace2M: numericCell(row, column.get(target.sdFace2)),
        }, sourceManifest.angleUnit);

        if (!reduced.ok) {
          blockedObservationCount += 1;
          if (reduced.reason === 'missing-or-non-finite') reductionFailures.missingOrNonFinite += 1;
          if (reduced.reason === 'angle-out-of-range') reductionFailures.angleOutOfRange += 1;
          if (reduced.reason === 'distance-not-positive') reductionFailures.distanceNotPositive += 1;
          continue;
        }

        observations.push({
          id: `${station.stationCode}-${epoch}-${target.rawTargetName}-F1F2`,
          stationCode: station.stationCode,
          rawTargetName: target.rawTargetName,
          epoch,
          ...reduced.observation,
        });
      }
    }

    return {
      stationCode: station.stationCode,
      toa5Header: [...station.toa5Header],
      columns: [...station.columns],
      fieldTypes: [...station.fieldTypes],
      units: [...station.units],
      rawRows,
      observations,
      environment,
      blockedObservationCount,
      reductionFailures,
    };
  });
}
