import ats34 from '@/demo/fixtures/ats34.generated.json';
import type { Ats34Fixture } from '@/demo/fixtures/contract';
import type { RawObservation } from '@/domain/entities';
import type { EnvironmentReading } from '@/domain/corrections/atmosphere';
import {
  FR_PERIOD,
  FR_REFERENCES,
  FR_STATION,
  generateFrMonitoring,
} from '@/demo/fixtures/fr-monitoring';
import {
  SYNTHETIC_PERIOD,
  SYNTHETIC_REFERENCES,
  SYNTHETIC_STATIONS,
  generateSyntheticNetwork,
} from '@/demo/fixtures/synthetic-network';

/**
 * Demo BTM catalogue — the metadata a real BTM backend would expose (stations, prism sensors,
 * explicitly mapped Hz/Vz/Sd variables, T/P variables, known reference coordinates). The
 * mock-up derives it deterministically from the fixtures at module load; the product never
 * infers a variable's role from its name (DATA-001..004) — the ids below ARE the explicit
 * mapping a user confirms in the wizard.
 */

export interface CatalogueStation {
  stationId: number;
  stationCode: string;
  datasetId: 'ats34' | 'fr' | 'synthetic';
  datasetLabel: string;
  observationCount: number;
  targetCount: number;
  firstEpoch: string;
  lastEpoch: string;
  estimatedCycleMinutes: number;
  hasEnvironmentVariables: boolean;
  temperatureVariableId?: number;
  pressureVariableId?: number;
  /** Approximate station coordinates genuinely provided with the dataset (INIT-003), if any. */
  approxEastingM?: number;
  approxNorthingM?: number;
  approxHeightM?: number;
  /** Instrument height recorded with the dataset (m). */
  defaultInstrumentHeightM: number;
}

export interface CatalogueTarget {
  stationCode: string;
  rawTargetName: string;
  prismSensorId: number;
  hzVariableId: number;
  vzVariableId: number;
  sdVariableId: number;
  observationCount: number;
  /** Lookup metadata when the dataset provides it (ATS34). */
  adjustmentName?: string;
  targetHeightM: number;
  prismConstantM?: number;
  isKnownReference: boolean;
}

export interface CatalogueReference {
  pointName: string;
  eastingM: number;
  northingM: number;
  heightM: number;
  sigmaM: number;
  datasetId: 'ats34' | 'fr' | 'synthetic';
}

export interface DemoCatalogue {
  stations: CatalogueStation[];
  targets: CatalogueTarget[];
  references: CatalogueReference[];
  observationsByStation: Map<string, RawObservation[]>;
  envByStation: Map<string, EnvironmentReading[]>;
  lateObservationsByStation: Map<string, RawObservation[]>;
  badObservationId: string;
}

const typedAts34 = ats34 as unknown as Ats34Fixture;

let counter = 0;
const nextSensorId = () => 1000 + ++counter;

function buildCatalogue(): DemoCatalogue {
  const stations: CatalogueStation[] = [];
  const targets: CatalogueTarget[] = [];
  const references: CatalogueReference[] = [];
  const observationsByStation = new Map<string, RawObservation[]>();
  const envByStation = new Map<string, EnvironmentReading[]>();
  const lateObservationsByStation = new Map<string, RawObservation[]>();

  const registerTargets = (
    stationCode: string,
    observations: RawObservation[],
    referenceNames: Set<string>,
    lookup?: Map<string, { adjustmentName: string; targetHeightM: number; prismConstantM: number }>,
  ) => {
    const byName = new Map<string, number>();
    for (const o of observations) byName.set(o.rawTargetName, (byName.get(o.rawTargetName) ?? 0) + 1);
    for (const [rawTargetName, count] of [...byName.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const sensorId = nextSensorId();
      const meta = lookup?.get(rawTargetName);
      targets.push({
        stationCode,
        rawTargetName,
        prismSensorId: sensorId,
        hzVariableId: sensorId * 10 + 1,
        vzVariableId: sensorId * 10 + 2,
        sdVariableId: sensorId * 10 + 3,
        observationCount: count,
        adjustmentName: meta?.adjustmentName,
        targetHeightM: meta?.targetHeightM ?? 0,
        prismConstantM: meta?.prismConstantM,
        isKnownReference: referenceNames.has(rawTargetName),
      });
    }
  };

  const registerStation = (
    datasetId: CatalogueStation['datasetId'],
    datasetLabel: string,
    stationId: number,
    stationCode: string,
    observations: RawObservation[],
    env: EnvironmentReading[] | undefined,
    cycleMinutes: number,
    approx?: { e: number; n: number; h: number },
    instrumentHeightM = 0,
  ) => {
    const epochs = observations.map((o) => o.epoch).sort();
    stations.push({
      defaultInstrumentHeightM: instrumentHeightM,
      approxEastingM: approx?.e,
      approxNorthingM: approx?.n,
      approxHeightM: approx?.h,
      stationId,
      stationCode,
      datasetId,
      datasetLabel,
      observationCount: observations.length,
      targetCount: new Set(observations.map((o) => o.rawTargetName)).size,
      firstEpoch: epochs[0] ?? '',
      lastEpoch: epochs[epochs.length - 1] ?? '',
      estimatedCycleMinutes: cycleMinutes,
      hasEnvironmentVariables: (env?.length ?? 0) > 0,
      temperatureVariableId: env?.length ? stationId * 100 + 1 : undefined,
      pressureVariableId: env?.length ? stationId * 100 + 2 : undefined,
    });
    observationsByStation.set(stationCode, observations);
    if (env) envByStation.set(stationCode, env);
  };

  // --- ATS34 (real supplied UK dataset; single station, DEMO-001/002) --------------------
  const ats34Refs = new Set(
    typedAts34.header.map((h) => h.PointId).filter((p) => typedAts34.lookup.some((l) => l.TargetName === p)),
  );
  const ats34Lookup = new Map(
    typedAts34.lookup.map((l) => [
      l.TargetName,
      { adjustmentName: l.AdjustmentName, targetHeightM: l.TargetHeight, prismConstantM: l.PrismConstant },
    ]),
  );
  const ats34Observations: RawObservation[] = typedAts34.rawObservations.map((o) => ({
    id: o.id,
    stationCode: o.stationCode,
    rawTargetName: o.rawTargetName,
    epoch: o.epoch,
    hzDeg: o.hzDeg,
    vzDeg: o.vzDeg,
    sdM: o.sdM,
  }));
  const ats34StationHeader = typedAts34.header.find((h) => h.PointId === 'NTE_ATS34');
  registerStation(
    'ats34', 'NTE ATS34 — UK supplied dataset (demo)', 101, 'NTE_ATS34', ats34Observations, undefined, 120,
    ats34StationHeader ? { e: ats34StationHeader.Easting, n: ats34StationHeader.Northing, h: ats34StationHeader.Height } : undefined,
  );
  registerTargets('NTE_ATS34', ats34Observations, ats34Refs, ats34Lookup);
  for (const h of typedAts34.header) {
    if (!ats34Refs.has(h.PointId)) continue;
    references.push({
      pointName: h.PointId,
      eastingM: h.Easting,
      northingM: h.Northing,
      heightM: h.Height,
      sigmaM: typeof h.StDevE === 'number' ? h.StDevE : 0.001,
      datasetId: 'ats34',
    });
  }

  // --- Synthetic three-station network playground (DEMO-003) ----------------------------
  const synthetic = generateSyntheticNetwork();
  const synObsByStation = new Map<string, RawObservation[]>();
  for (const o of synthetic.observations) {
    synObsByStation.set(o.stationCode, [...(synObsByStation.get(o.stationCode) ?? []), o]);
  }
  SYNTHETIC_STATIONS.forEach((station, index) => {
    registerStation(
      'synthetic',
      'Three-station network playground (synthetic demo)',
      301 + index,
      station.stationCode,
      synObsByStation.get(station.stationCode) ?? [],
      synthetic.envReadings[station.stationCode],
      30,
      { e: station.e, n: station.n, h: station.h },
      station.instrumentHeightM,
    );
    const refNames = new Set(SYNTHETIC_REFERENCES.map((r) => r.pointName));
    registerTargets(station.stationCode, synObsByStation.get(station.stationCode) ?? [], refNames);
  });
  for (const r of SYNTHETIC_REFERENCES) references.push({ ...r, datasetId: 'synthetic' });
  const lateByStation = new Map<string, RawObservation[]>();
  for (const o of synthetic.lateObservations) {
    lateByStation.set(o.stationCode, [...(lateByStation.get(o.stationCode) ?? []), o]);
  }
  for (const [code, list] of lateByStation) lateObservationsByStation.set(code, list);

  // --- FR corrected monitoring (synthetic demo, already-corrected distances) -------------
  const frObservations = generateFrMonitoring();
  registerStation(
    'fr', 'FR monitoring — Topcon corrected (synthetic demo)', 201, FR_STATION.stationCode, frObservations, [], 30,
    { e: FR_STATION.e, n: FR_STATION.n, h: FR_STATION.h },
    FR_STATION.instrumentHeightM,
  );
  registerTargets(FR_STATION.stationCode, frObservations, new Set(FR_REFERENCES.map((r) => r.pointName)));
  for (const r of FR_REFERENCES) references.push({ ...r, datasetId: 'fr' });

  return {
    stations,
    targets,
    references,
    observationsByStation,
    envByStation,
    lateObservationsByStation,
    badObservationId: synthetic.badObservationId,
  };
}

let cached: DemoCatalogue | undefined;

/** Deterministic singleton — building it twice yields identical content. */
export function demoCatalogue(): DemoCatalogue {
  if (!cached) {
    counter = 0;
    cached = buildCatalogue();
  }
  return cached;
}

export const DATASET_PERIODS = {
  ats34: { from: typedAts34.meta.period.from ?? '', to: typedAts34.meta.period.to ?? '' },
  synthetic: SYNTHETIC_PERIOD,
  fr: FR_PERIOD,
} as const;
