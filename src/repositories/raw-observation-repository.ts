import type { RawObservation } from '@/domain/entities';

export interface RawObservationQuery {
  /** Raw BTM station code (e.g. `NTE_ATS34`), never a numeric id (audit item 3). */
  stationCode: string;
  /** Inclusive. */
  from: string;
  /** Exclusive. */
  to: string;
}

/** Every query is bounded by a time range (DATA-005) — no unbounded scan of `raw_data`. */
export interface RawObservationRepository {
  queryByStationAndWindow(query: RawObservationQuery): Promise<RawObservation[]>;
}
