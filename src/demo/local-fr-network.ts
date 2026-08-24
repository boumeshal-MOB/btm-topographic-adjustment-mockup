import manifestJson from '@/demo/fixtures/mf-la.generated/manifest.json';

/**
 * Generated MF-LA raw fixture, following the same source→generated-data pattern as ATS34.
 *
 * The supplied Campbell `.dat` files stay outside the repository. The converter preserves every
 * source data row and every source column in generated JSON shards. JSON `null` is only the
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

interface GeneratedShard {
  stationCode: string;
  rows: SerializedRow[];
}

interface GeneratedManifestStation {
  stationCode: string;
  targetCount: number;
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

interface GeneratedManifest {
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

/**
 * Loads the complete raw Campbell tables. This deliberately does not produce domain
 * `RawObservation` objects: that contract has no face dimension and would force a premature
 * C1/C2 reduction. The later processing implementation will be responsible for that reduction.
 */
export function localFrNetworkFixtures(): LocalFrStationFixture[] {
  const rowsByStation = new Map<string, SerializedRow[]>();
  for (const [, shard] of Object.entries(shardModules).sort(([left], [right]) => left.localeCompare(right))) {
    rowsByStation.set(shard.stationCode, [...(rowsByStation.get(shard.stationCode) ?? []), ...shard.rows]);
  }

  return manifest.stations.map((station) => ({
    stationCode: station.stationCode,
    toa5Header: [...station.toa5Header],
    columns: [...station.columns],
    fieldTypes: [...station.fieldTypes],
    units: [...station.units],
    rawRows: (rowsByStation.get(station.stationCode) ?? []).map((row) => row.map(restoreNaN)),
  }));
}
