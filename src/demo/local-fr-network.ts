import manifestJson from '@/demo/fixtures/mf-la.generated/manifest.json';
import type { EnvironmentReading } from '@/domain/corrections/atmosphere';
import type { RawObservation } from '@/domain/entities';

/**
 * Generated MF-LA fixture, following the same source→generated-data pattern as ATS34.
 *
 * The private Campbell `.dat` files never enter the repository. `convert-mf-la.mjs` preserves
 * every source row in small generated shards, replacing missing-value sentinels with JSON `null`.
 * The browser consumes those shards, so GitHub previews and deployed builds have real test data.
 */
const shardModules = import.meta.glob('./fixtures/mf-la.generated/mf_la_sta*.json', {
  import: 'default',
  eager: true,
}) as Record<string, GeneratedShard>;

type NullableNumber = number | null;
export type GeneratedTargetPair = [NullableNumber, NullableNumber, NullableNumber, NullableNumber, NullableNumber, NullableNumber];
type GeneratedRow = [string, NullableNumber, NullableNumber, NullableNumber, GeneratedTargetPair[]];

interface GeneratedShard {
  stationCode: string;
  rows: GeneratedRow[];
}

interface GeneratedManifest {
  schemaVersion: number;
  datasetId: string;
  angleUnit: 'GON';
  rowsPreserved: boolean;
  stations: Array<{
    stationCode: string;
    targetCount: number;
    rowCount: number;
    firstEpoch: string;
    lastEpoch: string;
  }>;
}

export interface LocalFrStationFixture {
  stationCode: string;
  observations: RawObservation[];
  environment: EnvironmentReading[];
  blockedObservationCount: number;
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
  firstEpoch: station.firstEpoch,
  lastEpoch: station.lastEpoch,
}));

const FULL_CIRCLE_GON = 400;
const HALF_CIRCLE_GON = 200;

function finite(value: NullableNumber): value is number {
  return value !== null && Number.isFinite(value);
}

function circularMeanGon(first: number, second: number): number {
  const factor = (2 * Math.PI) / FULL_CIRCLE_GON;
  const x = Math.cos(first * factor) + Math.cos(second * factor);
  const y = Math.sin(first * factor) + Math.sin(second * factor);
  const gon = Math.atan2(y, x) / factor;
  return (gon + FULL_CIRCLE_GON) % FULL_CIRCLE_GON;
}

/**
 * Strict atomic Face I/Face II reduction.
 *
 * All six Hz/Vt/Sd values must be present, finite and physically valid; otherwise the complete
 * target observation is blocked — never replaced by one face. Face closure is not an import
 * validity criterion: double-face reduction exists precisely to cancel collimation/index effects,
 * which are surfaced later as QC diagnostics. The returned domain observation is already reduced
 * and converted from gon to degrees.
 */
export function reduceMfLaPair(pair: GeneratedTargetPair): { hzDeg: number; vzDeg: number; sdM: number } | undefined {
  const [hz1, vz1, sd1, hz2, vz2, sd2] = pair;
  if (!finite(hz1) || !finite(vz1) || !finite(sd1) || !finite(hz2) || !finite(vz2) || !finite(sd2)) {
    return undefined;
  }
  if (hz1 < 0 || hz1 >= 400 || hz2 < 0 || hz2 >= 400) return undefined;
  if (vz1 < 0 || vz1 > 200 || vz2 < 200 || vz2 > 400) return undefined;
  if (!(sd1 > 0) || !(sd2 > 0)) return undefined;

  const hz2Normalized = (hz2 - HALF_CIRCLE_GON + FULL_CIRCLE_GON) % FULL_CIRCLE_GON;
  const vz2Normalized = FULL_CIRCLE_GON - vz2;
  return {
    hzDeg: circularMeanGon(hz1, hz2Normalized) * 0.9,
    vzDeg: ((vz1 + vz2Normalized) / 2) * 0.9,
    sdM: (sd1 + sd2) / 2,
  };
}

export function localFrNetworkFixtures(): LocalFrStationFixture[] {
  const rowsByStation = new Map<string, GeneratedRow[]>();
  for (const shard of Object.values(shardModules)) {
    rowsByStation.set(shard.stationCode, [...(rowsByStation.get(shard.stationCode) ?? []), ...shard.rows]);
  }

  return manifest.stations.map((station) => {
    const observations: RawObservation[] = [];
    const environment: EnvironmentReading[] = [];
    let blockedObservationCount = 0;
    const rows = (rowsByStation.get(station.stationCode) ?? []).sort((left, right) => left[0].localeCompare(right[0]));

    for (const [epoch, , temperatureC, pressureHPa, targets] of rows) {
      if (finite(temperatureC) && finite(pressureHPa)) environment.push({ epoch, temperatureC, pressureHPa });
      targets.forEach((pair, index) => {
        const reduced = reduceMfLaPair(pair);
        if (!reduced) {
          blockedObservationCount += 1;
          return;
        }
        observations.push({
          id: `${station.stationCode}-${epoch}-${index + 1}-F1F2`,
          stationCode: station.stationCode,
          rawTargetName: `PRISM_${String(index + 1).padStart(3, '0')}`,
          epoch,
          ...reduced,
        });
      });
    }

    return { stationCode: station.stationCode, observations, environment, blockedObservationCount };
  });
}
