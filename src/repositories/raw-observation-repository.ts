import type { RawObservation } from '@/domain/entities';

export interface RawObservationQuery {
  stationId: string;
  /** Inclusive. */
  from: string;
  /** Exclusive. */
  to: string;
}

/** Every query is bounded by a time range (DATA-005) — no unbounded scan of `raw_data`. */
export interface RawObservationRepository {
  queryByStationAndWindow(query: RawObservationQuery): Promise<RawObservation[]>;
}
