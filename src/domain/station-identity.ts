import type { StationBinding } from '@/domain/entities';

/**
 * Explicit bridge between the raw BTM station code (e.g. `"NTE_ATS34"`, carried by
 * `RawObservation.stationCode`) and the numeric BTM `stationId` (carried by `StationBinding`)
 * — audit item 3. The mapping is always resolved through `StationBinding.stationCode`, never by
 * coercing a string code into a numeric id or vice versa. Callers use these helpers instead of
 * comparing `stationId` fields of different types.
 */

/** Numeric BTM `stationId` for a raw station code, or `undefined` if the code is not bound. */
export function resolveStationIdByCode(
  stationCode: string,
  bindings: readonly StationBinding[],
): number | undefined {
  return bindings.find((b) => b.stationCode === stationCode)?.stationId;
}

/** Raw station code for a numeric BTM `stationId`, or `undefined` if not bound. */
export function resolveStationCodeById(
  stationId: number,
  bindings: readonly StationBinding[],
): string | undefined {
  return bindings.find((b) => b.stationId === stationId)?.stationCode;
}
