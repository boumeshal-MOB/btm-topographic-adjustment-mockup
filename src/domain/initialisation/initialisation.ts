// Ported (controlled port, audit B-01) from boumeshal-MOB/StarNet
// @ bd4216d5299ff761512e37a04ed46282c0c811bb:src/engine/initial.ts. Adapted to the new
// contracts: raw observations carry `stationCode` (never a numeric id), corrected distances
// come from the corrections module (T01.4), and the legacy Station/ReferencePoint types are
// replaced by small explicit inputs. The observation window is provenance only, never validity
// (TIME-005/INIT-005..010).

import type { RawObservation } from '@/domain/entities';
import { DEG2RAD, azimuth, circularMean, circularSpread, polarToEnh, wrapPi } from '@/domain/math/geometry';

export interface InitStationInput {
  stationCode: string;
  instrumentHeightM: number;
  /** Approximate/anchor coordinates. `0/0/0` is valid for a local frame (INIT-002). */
  approxE: number;
  approxN: number;
  approxH: number;
  /** Fixed orientation in radians — only for the local-anchor mode (INIT-001/002). */
  fixedOrientationRad?: number;
}

export interface InitReferenceInput {
  /** Engine/physical point name the reference is known under. */
  pointKey: string;
  eastingM: number;
  northingM: number;
  heightM: number;
}

export interface InitialComputationInput {
  /** Raw observations already filtered to the observation window (provenance only, TIME-005). */
  observations: RawObservation[];
  /** observation id -> corrected slope distance (from applyDistanceCorrections, CORR-006). */
  correctedDistanceM: Map<string, number>;
  stations: InitStationInput[];
  references: InitReferenceInput[];
  /** `${stationCode}|${rawTargetName}` -> resolved point key (physical identity, POINT-004). */
  nameMap: Map<string, string>;
  /** point key -> target height (m). */
  targetHeights: Map<string, number>;
  /** point keys treated as known references. */
  referenceKeys: Set<string>;
  /** `${stationCode}|${rawTargetName}` keys expected in the sample (coverage denominator). */
  expectedObservationKeys?: Set<string>;
}

export interface StationOrientationResult {
  stationCode: string;
  orientationRad?: number;
  nReferencesUsed: number;
  spreadRad: number;
  referencesUsed: string[];
  problems: string[];
  source?: 'known-references' | 'fixed-anchor' | 'network-resection';
  estimatedE?: number;
  estimatedN?: number;
  estimatedH?: number;
}

export interface ProvisionalCoordinateResult {
  pointKey: string;
  eastingM: number;
  northingM: number;
  heightM: number;
  stationCount: number;
  observationCount: number;
  horizontalSpreadM: number;
  verticalSpreadM: number;
  perStation: { stationCode: string; eastingM: number; northingM: number; heightM: number; nObs: number }[];
}

export interface InitialCoverageResult {
  observationsUsed: number;
  representativeCount: number;
  expectedStationTargetPairs: number;
  availableStationTargetPairs: number;
  expectedPhysicalPoints: number;
  availablePhysicalPoints: number;
  missingStationTargets: string[];
  /** Actual min/max epochs of the retained observations (provenance display). */
  retainedFrom?: string;
  retainedTo?: string;
}

export interface InitialComputationResult {
  orientations: StationOrientationResult[];
  provisional: ProvisionalCoordinateResult[];
  failures: { subject: string; reason: string }[];
  coverage: InitialCoverageResult;
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Median of angles in degrees, robust to the 0/360 wrap (INIT-005). */
export function circularMedianDeg(values: number[]): number {
  if (values.length === 0) return NaN;
  const radians = values.map((value) => value * DEG2RAD);
  const centre = circularMean(radians) ?? radians[0];
  const unwrapped = radians.map((value) => centre + wrapPi(value - centre));
  const result = (median(unwrapped) * 180) / Math.PI;
  return ((result % 360) + 360) % 360;
}

export function initialisationCoverage(
  observations: RawObservation[],
  expectedKeys: Set<string>,
  nameMap: Map<string, string>,
): InitialCoverageResult {
  const availableKeys = new Set(observations.map((o) => `${o.stationCode}|${o.rawTargetName}`));
  const expectedPoints = new Set([...expectedKeys].map((key) => nameMap.get(key) ?? key));
  const availablePoints = new Set(
    [...availableKeys].filter((key) => expectedKeys.has(key)).map((key) => nameMap.get(key) ?? key),
  );
  const availablePairs = [...expectedKeys].filter((key) => availableKeys.has(key)).length;
  const epochs = observations.map((o) => o.epoch).sort();
  return {
    observationsUsed: observations.length,
    representativeCount: availablePairs,
    expectedStationTargetPairs: expectedKeys.size,
    availableStationTargetPairs: availablePairs,
    expectedPhysicalPoints: expectedPoints.size,
    availablePhysicalPoints: availablePoints.size,
    missingStationTargets: [...expectedKeys].filter((key) => !availableKeys.has(key)),
    retainedFrom: epochs[0],
    retainedTo: epochs[epochs.length - 1],
  };
}

interface Representative {
  hzDeg: number;
  vzDeg: number;
  correctedDistanceM: number;
  nSource: number;
}

/**
 * One robust representative per station×point from component-wise medians of Hz, Vz and the
 * CORRECTED slope distance over the window (INIT-005) — never the first or last measurement.
 */
export function medianRepresentatives(
  observations: RawObservation[],
  correctedDistanceM: Map<string, number>,
  nameMap: Map<string, string>,
): Map<string, Representative> {
  const grouped = new Map<string, RawObservation[]>();
  for (const o of observations) {
    const pointKey = nameMap.get(`${o.stationCode}|${o.rawTargetName}`) ?? o.rawTargetName;
    const key = `${o.stationCode}|${pointKey}`;
    grouped.set(key, [...(grouped.get(key) ?? []), o]);
  }
  const out = new Map<string, Representative>();
  for (const [key, source] of grouped) {
    out.set(key, {
      hzDeg: circularMedianDeg(source.map((o) => o.hzDeg)),
      vzDeg: median(source.map((o) => o.vzDeg)),
      correctedDistanceM: median(source.map((o) => correctedDistanceM.get(o.id) ?? o.sdM)),
      nSource: source.length,
    });
  }
  return out;
}

export function computeInitialCoordinates(input: InitialComputationInput): InitialComputationResult {
  const { observations, correctedDistanceM, stations, references, nameMap, targetHeights, referenceKeys } = input;
  const refByKey = new Map(references.map((r) => [r.pointKey, r]));
  const stationByCode = new Map(stations.map((s) => [s.stationCode, s]));
  const stationCoordinates = new Map(stations.map((s) => [s.stationCode, { e: s.approxE, n: s.approxN, h: s.approxH }]));

  const byStationTarget = medianRepresentatives(observations, correctedDistanceM, nameMap);
  const expectedKeys = input.expectedObservationKeys ?? new Set(nameMap.keys());
  const coverage = initialisationCoverage(observations, expectedKeys, nameMap);

  // --- station orientations from references or fixed anchors
  const orientations: StationOrientationResult[] = [];
  const orientationByStation = new Map<string, number>();
  for (const st of stations) {
    const fixed = st.fixedOrientationRad;
    const angles: number[] = [];
    const weights: number[] = [];
    const used: string[] = [];
    const problems: string[] = [];
    for (const [key, representative] of byStationTarget) {
      const [code, pointKey] = key.split('|');
      if (code !== st.stationCode) continue;
      if (!referenceKeys.has(pointKey)) continue;
      const ref = refByKey.get(pointKey);
      if (!ref) {
        problems.push(`Reference ${pointKey} has no known coordinates`);
        continue;
      }
      const az = azimuth({ e: st.approxE, n: st.approxN }, { e: ref.eastingM, n: ref.northingM });
      angles.push(wrapPi(az - representative.hzDeg * DEG2RAD));
      weights.push(Math.max(1, representative.correctedDistanceM)); // longer rays orient better
      used.push(pointKey);
    }
    const mean = fixed ?? circularMean(angles, weights);
    const spread = mean === undefined ? 0 : circularSpread(angles, mean);
    if (fixed !== undefined) problems.push('Orientation fixed for local-datum initialisation');
    else if (mean === undefined) problems.push('No reference observed from this station: trying network resection');
    else if (angles.length < 2) problems.push('Single reference used: orientation not controlled');
    orientations.push({
      stationCode: st.stationCode,
      orientationRad: mean,
      nReferencesUsed: angles.length,
      spreadRad: spread,
      referencesUsed: used,
      problems,
      source: fixed !== undefined ? 'fixed-anchor' : mean !== undefined ? 'known-references' : undefined,
      estimatedE: st.approxE,
      estimatedN: st.approxN,
      estimatedH: st.approxH,
    });
    if (mean !== undefined) orientationByStation.set(st.stationCode, mean);
  }

  // --- polar -> ENH per station, then combine (with resection propagation for networks)
  interface Estimate { stationCode: string; e: number; n: number; h: number; nObs: number }
  const estimates = new Map<string, Estimate[]>();
  const failures: { subject: string; reason: string }[] = [];

  const radiated = new Set<string>();
  const radiateStation = (code: string) => {
    if (radiated.has(code)) return;
    const st = stationByCode.get(code);
    const origin = stationCoordinates.get(code);
    const orientation = orientationByStation.get(code);
    if (!st || !origin || orientation === undefined) return;
    for (const [key, representative] of byStationTarget) {
      const [obsStation, pointKey] = key.split('|');
      if (obsStation !== code) continue;
      const enh = polarToEnh({
        station: origin,
        instrumentHeightM: st.instrumentHeightM,
        targetHeightM: targetHeights.get(pointKey) ?? 0,
        slopeDistanceM: representative.correctedDistanceM,
        hzRad: representative.hzDeg * DEG2RAD,
        vzRad: representative.vzDeg * DEG2RAD,
        orientationRad: orientation,
      });
      const list = estimates.get(pointKey) ?? [];
      list.push({ stationCode: code, ...enh, nObs: representative.nSource });
      estimates.set(pointKey, list);
    }
    radiated.add(code);
  };
  for (const code of orientationByStation.keys()) radiateStation(code);

  // Propagate a local datum through shared physical points (network resection).
  const knownCoordinates = () => {
    const known = new Map<string, { e: number; n: number; h: number }>();
    for (const ref of references) known.set(ref.pointKey, { e: ref.eastingM, n: ref.northingM, h: ref.heightM });
    for (const [name, list] of estimates) {
      if (known.has(name)) continue;
      known.set(name, {
        e: median(list.map((item) => item.e)),
        n: median(list.map((item) => item.n)),
        h: median(list.map((item) => item.h)),
      });
    }
    return known;
  };

  for (let pass = 0; pass < stations.length; pass++) {
    let progressed = false;
    const known = knownCoordinates();
    for (const st of stations) {
      if (orientationByStation.has(st.stationCode)) continue;
      const ties: ResectionTie[] = [];
      for (const [key, representative] of byStationTarget) {
        const [code, pointKey] = key.split('|');
        if (code !== st.stationCode) continue;
        const target = known.get(pointKey);
        if (!target) continue;
        const sd = representative.correctedDistanceM;
        const vzRad = representative.vzDeg * DEG2RAD;
        ties.push({
          key: pointKey,
          target,
          hzRad: representative.hzDeg * DEG2RAD,
          horizontalM: Math.abs(sd * Math.sin(vzRad)),
          stationHeightM: target.h - st.instrumentHeightM - sd * Math.cos(vzRad) + (targetHeights.get(pointKey) ?? 0),
        });
      }
      const solution = resectStation(ties, { e: st.approxE, n: st.approxN });
      if (!solution) continue;
      stationCoordinates.set(st.stationCode, { e: solution.e, n: solution.n, h: solution.h });
      orientationByStation.set(st.stationCode, solution.orientationRad);
      const record = orientations.find((item) => item.stationCode === st.stationCode)!;
      record.orientationRad = solution.orientationRad;
      record.nReferencesUsed = ties.length;
      record.referencesUsed = ties.map((tie) => tie.key);
      record.spreadRad = solution.orientationSpreadRad;
      record.problems = ties.length < 3 ? ['Network resection uses only two common points'] : [];
      record.source = 'network-resection';
      record.estimatedE = solution.e;
      record.estimatedN = solution.n;
      record.estimatedH = solution.h;
      radiateStation(st.stationCode);
      progressed = true;
    }
    if (!progressed) break;
  }

  for (const st of stations.filter((station) => !orientationByStation.has(station.stationCode))) {
    failures.push({
      subject: st.stationCode,
      reason: `Station ${st.stationCode} could not be oriented or resected: provide coordinates/references or two common points`,
    });
  }

  const provisional: ProvisionalCoordinateResult[] = [];
  for (const [pointKey, list] of estimates) {
    if (referenceKeys.has(pointKey)) continue; // references are already known (INIT-003)
    const e = median(list.map((item) => item.e));
    const n = median(list.map((item) => item.n));
    const h = median(list.map((item) => item.h));
    let spreadH = 0;
    let spreadV = 0;
    for (const x of list) {
      spreadH = Math.max(spreadH, Math.hypot(x.e - e, x.n - n));
      spreadV = Math.max(spreadV, Math.abs(x.h - h));
    }
    provisional.push({
      pointKey,
      eastingM: e,
      northingM: n,
      heightM: h,
      stationCount: new Set(list.map((x) => x.stationCode)).size,
      observationCount: list.reduce((sum, item) => sum + item.nObs, 0),
      horizontalSpreadM: spreadH,
      verticalSpreadM: spreadV,
      perStation: list.map((x) => ({ stationCode: x.stationCode, eastingM: x.e, northingM: x.n, heightM: x.h, nObs: x.nObs })),
    });
  }

  return { orientations, provisional, failures, coverage };
}

interface ResectionTie {
  key: string;
  target: { e: number; n: number; h: number };
  hzRad: number;
  horizontalM: number;
  stationHeightM: number;
}

function resectStation(
  ties: ResectionTie[],
  approximate: { e: number; n: number },
): { e: number; n: number; h: number; orientationRad: number; orientationSpreadRad: number } | undefined {
  if (ties.length < 2) return undefined;
  const candidates: { e: number; n: number }[] = [];
  for (let i = 0; i < ties.length; i++) {
    for (let j = i + 1; j < ties.length; j++) {
      candidates.push(...circleIntersections(ties[i].target, ties[i].horizontalM, ties[j].target, ties[j].horizontalM));
    }
  }
  if (candidates.length === 0) return undefined;
  const score = (candidate: { e: number; n: number }) =>
    ties.reduce((sum, tie) => {
      const residual = Math.hypot(candidate.e - tie.target.e, candidate.n - tie.target.n) - tie.horizontalM;
      return sum + residual * residual;
    }, 0) + 1e-10 * Math.hypot(candidate.e - approximate.e, candidate.n - approximate.n) ** 2;
  const best = candidates.sort((a, b) => score(a) - score(b))[0];
  const angles = ties.map((tie) => wrapPi(azimuth(best, tie.target) - tie.hzRad));
  const orientationRad = circularMean(angles);
  if (orientationRad === undefined) return undefined;
  return {
    ...best,
    h: ties.reduce((sum, tie) => sum + tie.stationHeightM, 0) / ties.length,
    orientationRad,
    orientationSpreadRad: circularSpread(angles, orientationRad),
  };
}

function circleIntersections(
  a: { e: number; n: number },
  ra: number,
  b: { e: number; n: number },
  rb: number,
): { e: number; n: number }[] {
  const de = b.e - a.e;
  const dn = b.n - a.n;
  const d = Math.hypot(de, dn);
  if (d < 1e-9 || d > ra + rb + 0.05 || d < Math.abs(ra - rb) - 0.05) return [];
  const x = (ra * ra - rb * rb + d * d) / (2 * d);
  const h2 = Math.max(0, ra * ra - x * x);
  const h = Math.sqrt(h2);
  const e0 = a.e + (x * de) / d;
  const n0 = a.n + (x * dn) / d;
  const pe = -dn / d;
  const pn = de / d;
  return h < 1e-9
    ? [{ e: e0, n: n0 }]
    : [
        { e: e0 + h * pe, n: n0 + h * pn },
        { e: e0 - h * pe, n: n0 - h * pn },
      ];
}
