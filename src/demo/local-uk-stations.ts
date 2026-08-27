import manifestJson from '@/demo/fixtures/kh-uk.generated/manifest.json';
import type { EnvironmentReading } from '@/domain/corrections/atmosphere';
import type { RawObservation } from '@/domain/entities';

const shardModules = import.meta.glob('./fixtures/kh-uk.generated/kh*.json', {
  import: 'default',
  eager: true,
}) as Record<string, GeneratedShard>;

type GeneratedObservation = [rawTargetName: string, hzDeg: number, vzDeg: number, sdM: number];

interface GeneratedCycle {
  /** Real StartOfCycle from the source, used as the canonical acquisition epoch. */
  epoch: string;
  environment: [temperatureC: number, pressureHPa: number];
  observations: GeneratedObservation[];
}

interface GeneratedShard {
  stationCode: string;
  cycles: GeneratedCycle[];
}

interface GeneratedManifestStation {
  stationCode: string;
  cycleCount: number;
  observationCount: number;
  targetCount: number;
  environmentCount: number;
  firstEpoch: string;
  lastEpoch: string;
  shardFiles: string[];
}

interface GeneratedManifest {
  schemaVersion: 1;
  datasetId: 'UK-KH-FIELD-STATIONS-V1';
  countryTemplate: 'UK';
  sourceAngleUnit: 'DMS';
  canonicalAngleUnit: 'DEGREES';
  sourceDistanceKind: 'slope';
  cycleEpoch: 'StartOfCycle';
  anonymised: true;
  technicalRecordCount: number;
  stations: GeneratedManifestStation[];
}

export interface LocalUkStationFixture {
  stationCode: string;
  cycles: GeneratedCycle[];
  observations: RawObservation[];
  environment: EnvironmentReading[];
}

const manifest = manifestJson as GeneratedManifest;
const STATION_ID_BY_CODE: Record<string, number> = { KH01: 501, KH02: 502 };

export const LOCAL_UK_STATIONS = manifest.stations.map((station) => ({
  stationId: STATION_ID_BY_CODE[station.stationCode],
  stationCode: station.stationCode,
  cycleCount: station.cycleCount,
  observationCount: station.observationCount,
  targetCount: station.targetCount,
  firstEpoch: station.firstEpoch,
  lastEpoch: station.lastEpoch,
}));

/**
 * Loads the two anonymised UK stations as independent catalogue entries.
 *
 * The source is already one Hz/V/Sd triplet per named target, so no double-face reduction is
 * performed. Every target in a station cycle receives that cycle's real StartOfCycle timestamp;
 * this is the acquisition epoch the wizard and run resolver need, not an invented output slot.
 */
export function localUkStationFixtures(): LocalUkStationFixture[] {
  const cyclesByStation = new Map<string, GeneratedCycle[]>();
  for (const [, shard] of Object.entries(shardModules).sort(([left], [right]) => left.localeCompare(right))) {
    cyclesByStation.set(shard.stationCode, [
      ...(cyclesByStation.get(shard.stationCode) ?? []),
      ...shard.cycles,
    ]);
  }

  return manifest.stations.map((station) => {
    const cycles = cyclesByStation.get(station.stationCode) ?? [];
    const observations = cycles.flatMap((cycle) => cycle.observations.map(([rawTargetName, hzDeg, vzDeg, sdM]) => ({
      id: `${station.stationCode}-${cycle.epoch}-${rawTargetName}`,
      stationCode: station.stationCode,
      rawTargetName,
      epoch: cycle.epoch,
      hzDeg,
      vzDeg,
      sdM,
    })));
    const environment = cycles.map((cycle) => ({
      epoch: cycle.epoch,
      temperatureC: cycle.environment[0],
      pressureHPa: cycle.environment[1],
    }));
    return { stationCode: station.stationCode, cycles, observations, environment };
  });
}
