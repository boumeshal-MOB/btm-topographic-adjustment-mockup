import type { AdjustmentConfigVersion } from '@/domain/entities';

/**
 * Time model (TIME-001..008, RUN-003..006; `PROJECT_MAP.md §9`). Observation epochs are raw
 * source timestamps and are NEVER mutated or rounded here; an output slot is a separate,
 * grid-aligned publication timestamp; configuration validity is `[validFrom, validTo[`.
 */

/** Aligns an instant DOWN to its slot on a UTC grid of `intervalMinutes` (TIME-002/004). */
export function alignSlot(instantIso: string, intervalMinutes: number): string {
  const ms = intervalMinutes * 60_000;
  return new Date(Math.floor(new Date(instantIso).getTime() / ms) * ms).toISOString();
}

/** The nearest slot (up or down) for an instant — e.g. :25/:26/:32 all map to :30 on a 30-min grid. */
export function nearestSlot(instantIso: string, intervalMinutes: number): string {
  const ms = intervalMinutes * 60_000;
  return new Date(Math.round(new Date(instantIso).getTime() / ms) * ms).toISOString();
}

/** All slots on the UTC grid inside `[fromIso, toIso]` (inclusive bounds after alignment). */
export function listSlots(fromIso: string, toIso: string, intervalMinutes: number): string[] {
  const ms = intervalMinutes * 60_000;
  const first = Math.ceil(new Date(fromIso).getTime() / ms) * ms;
  const last = Math.floor(new Date(toIso).getTime() / ms) * ms;
  const out: string[] = [];
  for (let t = first; t <= last; t += ms) out.push(new Date(t).toISOString());
  return out;
}

/**
 * Resolves the configuration version valid at `slotIso`, honouring `[validFrom, validTo[`
 * (TIME-006/007/008): a reprocessing/catch-up selects the version historically valid at the
 * slot, never simply the currently active one. Draft versions never resolve.
 */
export function resolveConfigForSlot<T extends Pick<AdjustmentConfigVersion, 'status' | 'validFrom' | 'validTo'>>(
  versions: readonly T[],
  slotIso: string,
): T | undefined {
  const t = new Date(slotIso).getTime();
  return versions.find((version) => {
    if (version.status === 'draft') return false;
    const from = new Date(version.validFrom).getTime();
    const to = version.validTo ? new Date(version.validTo).getTime() : Infinity;
    return t >= from && t < to;
  });
}

export interface EpochSelection {
  /** The chosen source epoch, untouched (TIME-003) — undefined when state is `missing`. */
  epoch?: string;
  state: 'fresh' | 'reused' | 'missing';
  ageMinutes?: number;
}

/**
 * Selects one station epoch for a slot (RUN-003..005): the latest epoch not after the slot
 * within `syncToleranceMinutes` is `fresh`; otherwise the latest within `maxReusedAgeMinutes`
 * is `reused` (visible, potentially provisional); beyond that the station is `missing`.
 * Source timestamps are returned unchanged (TIME-003).
 */
export function selectStationEpoch(
  epochsIso: readonly string[],
  slotIso: string,
  syncToleranceMinutes: number,
  maxReusedAgeMinutes: number,
): EpochSelection {
  const slotMs = new Date(slotIso).getTime();
  let best: number | undefined;
  for (const iso of epochsIso) {
    const t = new Date(iso).getTime();
    // an epoch slightly after the slot still belongs to it when inside the tolerance
    if (t > slotMs + syncToleranceMinutes * 60_000) continue;
    if (best === undefined || t > best) best = t;
  }
  if (best === undefined) return { state: 'missing' };
  const ageMinutes = Math.max(0, (slotMs - best) / 60_000);
  const epoch = new Date(best).toISOString();
  if (ageMinutes <= syncToleranceMinutes) return { epoch, state: 'fresh', ageMinutes };
  if (ageMinutes <= maxReusedAgeMinutes) return { epoch, state: 'reused', ageMinutes };
  return { state: 'missing' };
}
