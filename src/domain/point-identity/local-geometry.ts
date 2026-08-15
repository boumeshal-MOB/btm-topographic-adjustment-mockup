// Ported (controlled port, audit B-01) from boumeshal-MOB/StarNet
// @ bd4216d5299ff761512e37a04ed46282c0c811bb:src/engine/localGeometry.ts.
// Adapted: input is a pre-computed station-local point cloud (the caller derives it from
// corrected observations via the corrections module), so this module carries no legacy
// Station/StationPrismSetup types. Behaviour and tolerances follow `FRONTEND-AND-ANALYSIS-LAB.md §Common physical
// points`: 1 seed is insufficient, 2 seeds solve the frame without redundancy (`weak`),
// 3+ seeds allow a robust proposal (`ready`) — POINT-008..011.

export interface LocalPoint {
  targetKey: string;
  e: number;
  n: number;
  h: number;
}

export interface SeedPair {
  aTargetKey: string;
  bTargetKey: string;
}

export interface GeometryCandidate {
  aTargetKey: string;
  bTargetKey: string;
  horizontalResidualM: number;
  verticalResidualM: number;
  residual3dM: number;
  confidence: number;
  seed: boolean;
}

export interface GeometryCheck {
  status: 'insufficient' | 'weak' | 'ready';
  message: string;
  candidates: GeometryCandidate[];
  rmsM?: number;
}

/**
 * Compare two station-local point clouds after a rigid yaw + ENH translation. Candidates are
 * geometric PROPOSALS only — they are never auto-confirmed (POINT-011); the caller keeps them
 * unconfirmed until an explicit user action.
 */
export function checkLocalGeometry(
  a: LocalPoint[],
  b: LocalPoint[],
  seeds: SeedPair[],
  horizontalToleranceM = 0.05,
  verticalToleranceM = 0.05,
): GeometryCheck {
  if (seeds.length < 2) {
    return {
      status: 'insufficient',
      message: 'Select at least two common points. One point leaves the relative orientation undetermined.',
      candidates: [],
    };
  }
  const aBy = new Map(a.map((point) => [point.targetKey, point]));
  const bBy = new Map(b.map((point) => [point.targetKey, point]));
  const valid = seeds.flatMap((seed) => {
    const pa = aBy.get(seed.aTargetKey);
    const pb = bBy.get(seed.bTargetKey);
    return pa && pb ? [{ pa, pb }] : [];
  });
  if (valid.length < 2) {
    return { status: 'insufficient', message: 'Two seed pairs with observations are required.', candidates: [] };
  }

  const ca = valid.reduce((s, pair) => ({ e: s.e + pair.pa.e, n: s.n + pair.pa.n, h: s.h + pair.pa.h }), { e: 0, n: 0, h: 0 });
  const cb = valid.reduce((s, pair) => ({ e: s.e + pair.pb.e, n: s.n + pair.pb.n, h: s.h + pair.pb.h }), { e: 0, n: 0, h: 0 });
  for (const c of [ca, cb]) { c.e /= valid.length; c.n /= valid.length; c.h /= valid.length; }
  let dot = 0;
  let cross = 0;
  for (const { pa, pb } of valid) {
    const ae = pa.e - ca.e; const an = pa.n - ca.n;
    const be = pb.e - cb.e; const bn = pb.n - cb.n;
    dot += be * ae + bn * an;
    cross += be * an - bn * ae;
  }
  if (Math.hypot(dot, cross) < 1e-9) {
    return { status: 'insufficient', message: 'The selected points do not define a usable orientation.', candidates: [] };
  }
  const yaw = Math.atan2(cross, dot);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const transform = (point: LocalPoint) => ({
    e: ca.e + cos * (point.e - cb.e) - sin * (point.n - cb.n),
    n: ca.n + sin * (point.e - cb.e) + cos * (point.n - cb.n),
    h: ca.h + point.h - cb.h,
  });

  const candidates: GeometryCandidate[] = [];
  const usedA = new Set<string>();
  const seedKey = new Set(seeds.map((seed) => `${seed.aTargetKey}|${seed.bTargetKey}`));
  for (const pb of b) {
    const pt = transform(pb);
    let best: { pa: LocalPoint; h: number; v: number; d: number } | undefined;
    for (const pa of a) {
      if (usedA.has(pa.targetKey)) continue;
      const h = Math.hypot(pa.e - pt.e, pa.n - pt.n);
      const v = Math.abs(pa.h - pt.h);
      const d = Math.hypot(h, v);
      if (!best || d < best.d) best = { pa, h, v, d };
    }
    if (!best || best.h > horizontalToleranceM || best.v > verticalToleranceM) continue;
    usedA.add(best.pa.targetKey);
    candidates.push({
      aTargetKey: best.pa.targetKey,
      bTargetKey: pb.targetKey,
      horizontalResidualM: best.h,
      verticalResidualM: best.v,
      residual3dM: best.d,
      confidence: Math.max(0, Math.min(1, 1 - Math.max(best.h / horizontalToleranceM, best.v / verticalToleranceM))),
      seed: seedKey.has(`${best.pa.targetKey}|${pb.targetKey}`),
    });
  }
  const rmsM = candidates.length
    ? Math.sqrt(candidates.reduce((sum, item) => sum + item.residual3dM ** 2, 0) / candidates.length)
    : undefined;
  const status = valid.length >= 3 ? 'ready' : 'weak';
  return {
    status,
    message: status === 'ready'
      ? `${candidates.length} geometrically compatible pair(s) found. Review before confirming.`
      : `${candidates.length} pair(s) found, but two seed points provide no redundancy. Add a third well-spread common point if possible.`,
    candidates,
    rmsM,
  };
}

/** Derives a station-local point from one corrected polar observation (frame: hz from local zero). */
export function localPointFromObservation(args: {
  targetKey: string;
  hzDeg: number;
  vzDeg: number;
  correctedSlopeDistanceM: number;
  instrumentHeightM: number;
  targetHeightM: number;
}): LocalPoint {
  const hz = (args.hzDeg * Math.PI) / 180;
  const vz = (args.vzDeg * Math.PI) / 180;
  const horizontal = args.correctedSlopeDistanceM * Math.sin(vz);
  return {
    targetKey: args.targetKey,
    e: horizontal * Math.sin(hz),
    n: horizontal * Math.cos(hz),
    h: args.instrumentHeightM + args.correctedSlopeDistanceM * Math.cos(vz) - args.targetHeightM,
  };
}

export interface ConnectivityPair {
  a: string;
  b: string;
  sharedPoints: number;
  status: 'connected' | 'weak' | 'not-connected';
}

/**
 * Pairwise station connectivity pre-check (PROC-004/005, `FRONTEND-AND-ANALYSIS-LAB.md §7`): with unknown relative
 * orientation one shared point cannot connect two stations (POINT-008), two shared points are
 * the practical minimum but give `weak` geometry (POINT-009), three or more well-distributed
 * points are `connected` (POINT-010). The mathematical rank check remains the final authority
 * (INIT-010).
 */
export function stationConnectivity(
  stationCodes: readonly string[],
  sharedPointStations: readonly (readonly string[])[],
): ConnectivityPair[] {
  const pairs: ConnectivityPair[] = [];
  for (let i = 0; i < stationCodes.length; i++) {
    for (let j = i + 1; j < stationCodes.length; j++) {
      const a = stationCodes[i];
      const b = stationCodes[j];
      const shared = sharedPointStations.filter((codes) => codes.includes(a) && codes.includes(b)).length;
      pairs.push({
        a,
        b,
        sharedPoints: shared,
        status: shared >= 3 ? 'connected' : shared >= 2 ? 'weak' : 'not-connected',
      });
    }
  }
  return pairs;
}
