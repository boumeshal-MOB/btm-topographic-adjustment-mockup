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

export interface StationCycleSelection<T> extends EpochSelection {
  observations: T[];
  sourceFrom?: string;
  sourceTo?: string;
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

/**
 * Selects a whole station acquisition cycle before selecting targets. Observations inside a
 * cycle may have slightly different timestamps, but different station cycles are never mixed.
 * Fresh cycles may straddle the output slot; reused cycles must be in the past.
 */
export function selectStationCycle<T extends { epoch: string; rawTargetName: string }>(
  observations: readonly T[],
  slotIso: string,
  cycleToleranceMinutes: number,
  syncToleranceMinutes: number,
  maxReusedAgeMinutes: number,
  maxEpochToSlotMinutes: number,
): StationCycleSelection<T> {
  if (observations.length === 0) return { state: 'missing', observations: [] };
  const sorted = [...observations].sort((a, b) => new Date(a.epoch).getTime() - new Date(b.epoch).getTime());
  const cycles: T[][] = [];
  for (const observation of sorted) {
    const current = cycles.at(-1);
    if (!current) {
      cycles.push([observation]);
      continue;
    }
    const times = current.map((item) => new Date(item.epoch).getTime()).sort((a, b) => a - b);
    const representative = times[Math.floor((times.length - 1) / 2)];
    if (Math.abs(new Date(observation.epoch).getTime() - representative) <= cycleToleranceMinutes * 60_000) {
      current.push(observation);
    } else {
      cycles.push([observation]);
    }
  }
  const slotMs = new Date(slotIso).getTime();
  const described = cycles.map((source) => {
    const times = source.map((item) => new Date(item.epoch).getTime()).sort((a, b) => a - b);
    return { source, representative: times[Math.floor((times.length - 1) / 2)], from: times[0], to: times.at(-1)! };
  });
  const freshLimit = Math.min(syncToleranceMinutes, maxEpochToSlotMinutes) * 60_000;
  const fresh = described
    .filter((cycle) => Math.abs(cycle.representative - slotMs) <= freshLimit)
    .sort((a, b) => Math.abs(a.representative - slotMs) - Math.abs(b.representative - slotMs) || b.representative - a.representative)[0];
  const reused = described
    .filter((cycle) => cycle.representative <= slotMs && slotMs - cycle.representative <= maxReusedAgeMinutes * 60_000)
    .sort((a, b) => b.representative - a.representative)[0];
  const chosen = fresh ?? reused;
  if (!chosen) return { state: 'missing', observations: [] };
  const byTarget = new Map<string, T>();
  for (const observation of chosen.source) {
    const previous = byTarget.get(observation.rawTargetName);
    if (!previous || new Date(observation.epoch).getTime() > new Date(previous.epoch).getTime()) {
      byTarget.set(observation.rawTargetName, observation);
    }
  }
  return {
    epoch: new Date(chosen.representative).toISOString(),
    state: fresh ? 'fresh' : 'reused',
    ageMinutes: Math.max(0, (slotMs - chosen.representative) / 60_000),
    observations: [...byTarget.values()],
    sourceFrom: new Date(chosen.from).toISOString(),
    sourceTo: new Date(chosen.to).toISOString(),
  };
}
