import type { RawObservation } from '@/domain/entities';
import { DEG2RAD, RAD2DEG, azimuth, wrapTwoPi } from '@/domain/math/geometry';
import type { EnvironmentReading } from '@/domain/corrections/atmosphere';

/**
 * `Three-station network playground` — a fully SYNTHETIC, deterministic demo dataset
 * (DEMO-003, demo/40 §6). It is never presented as real BTM data. The generator knows the
 * ground truth so tests can verify behaviour, but the UI must follow the same confirmation
 * workflow as the product: shared points are NOT pre-confirmed in a new draft (POINT-001/011).
 *
 * Scenario coverage (demo/40 §6):
 * - three stations with shifted epochs (:25 / :26 / :32 patterns on a 30-min cycle);
 * - physical points genuinely shared between stations (unconfirmed by default);
 * - homonym target names that are DIFFERENT physical points (CP_1 on SYN_A vs SYN_C);
 * - SYN_C missing two cycles, its data arriving late (catch-up material);
 * - one late T/P reading; one bad observation (gross distance error);
 * - a single-ray target (observed by one station only).
 */

/** Deterministic PRNG (mulberry32) — the fixture must regenerate identically (audit B-02 spirit). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SyntheticStationTruth {
  stationCode: string;
  e: number;
  n: number;
  h: number;
  orientationRad: number;
  instrumentHeightM: number;
  /** minute offsets inside each 30-min cycle (e.g. :25 / :55). */
  minuteOffsets: number[];
}

export interface SyntheticPointTruth {
  /** Physical identity (ground truth — for tests, never auto-confirmed in the UI). */
  physicalKey: string;
  e: number;
  n: number;
  h: number;
  /** stationCode -> raw target name under which this physical point is observed. */
  observedAs: Record<string, string>;
  role: 'reference' | 'monitoring';
}

export const SYNTHETIC_STATIONS: SyntheticStationTruth[] = [
  { stationCode: 'SYN_A', e: 0, n: 0, h: 10, orientationRad: 0.15, instrumentHeightM: 0.2, minuteOffsets: [25, 55] },
  { stationCode: 'SYN_B', e: 180, n: 40, h: 12, orientationRad: -0.4, instrumentHeightM: 0.2, minuteOffsets: [26, 56] },
  { stationCode: 'SYN_C', e: 90, n: 210, h: 8, orientationRad: 1.1, instrumentHeightM: 0.2, minuteOffsets: [2, 32] },
];

export const SYNTHETIC_POINTS: SyntheticPointTruth[] = [
  // References with known coordinates, observed from SYN_A (its datum anchor material)
  { physicalKey: 'REF_100', e: -60, n: 30, h: 11, observedAs: { SYN_A: 'REF_100' }, role: 'reference' },
  { physicalKey: 'REF_101', e: 20, n: -70, h: 9.5, observedAs: { SYN_A: 'REF_101' }, role: 'reference' },
  // Genuinely shared points (different raw names across stations — POINT-002 the other way round)
  { physicalKey: 'SHARED_1', e: 70, n: 60, h: 10.5, observedAs: { SYN_A: 'P_201', SYN_B: 'MB_11', SYN_C: 'TC_31' }, role: 'monitoring' },
  { physicalKey: 'SHARED_2', e: 120, n: 100, h: 11.2, observedAs: { SYN_A: 'P_202', SYN_B: 'MB_12', SYN_C: 'TC_32' }, role: 'monitoring' },
  { physicalKey: 'SHARED_3', e: 40, n: 130, h: 9.8, observedAs: { SYN_A: 'P_203', SYN_B: 'MB_13', SYN_C: 'TC_33' }, role: 'monitoring' },
  { physicalKey: 'SHARED_4', e: 140, n: 170, h: 10.9, observedAs: { SYN_B: 'MB_14', SYN_C: 'TC_34' }, role: 'monitoring' },
  // Homonyms: same raw name "CP_1" from SYN_A and SYN_C but DIFFERENT physical points (POINT-002)
  { physicalKey: 'A_OWN_CP1', e: -30, n: 80, h: 10.1, observedAs: { SYN_A: 'CP_1' }, role: 'monitoring' },
  { physicalKey: 'C_OWN_CP1', e: 150, n: 260, h: 8.4, observedAs: { SYN_C: 'CP_1' }, role: 'monitoring' },
  // Single-ray target (ADJ-010 material)
  { physicalKey: 'B_ONLY_1', e: 240, n: 90, h: 12.6, observedAs: { SYN_B: 'MB_20' }, role: 'monitoring' },
];

export const SYNTHETIC_PERIOD = {
  from: '2025-04-01T06:00:00.000Z',
  to: '2025-04-01T12:00:00.000Z',
};

/** SYN_C emits nothing in these two cycles; its observations arrive late (catch-up scenario). */
export const SYNTHETIC_C_GAP_CYCLES = [4, 5];

export interface SyntheticDataset {
  observations: RawObservation[];
  envReadings: Record<string, EnvironmentReading[]>;
  /** Observations of SYN_C for the gap cycles — "late data" delivered separately. */
  lateObservations: RawObservation[];
  /** The one intentionally corrupted observation id (gross +25 mm distance error). */
  badObservationId: string;
}

export function generateSyntheticNetwork(): SyntheticDataset {
  const rand = mulberry32(20250401);
  const noiseAngleDeg = () => (rand() - 0.5) * 2 * (1.0 / 3600); // ±1 arcsec
  const noiseDistM = () => (rand() - 0.5) * 2 * 0.0006; // ±0.6 mm

  const observations: RawObservation[] = [];
  const lateObservations: RawObservation[] = [];
  const envReadings: Record<string, EnvironmentReading[]> = { SYN_A: [], SYN_B: [], SYN_C: [] };
  let badObservationId = '';

  const start = new Date(SYNTHETIC_PERIOD.from).getTime();
  const cycles = 12; // 6 hours of 30-min cycles
  let record = 1;

  for (let cycle = 0; cycle < cycles; cycle++) {
    const cycleStart = start + cycle * 30 * 60_000;
    for (const station of SYNTHETIC_STATIONS) {
      const isGap = station.stationCode === 'SYN_C' && SYNTHETIC_C_GAP_CYCLES.includes(cycle);
      const minute = station.minuteOffsets[cycle % station.minuteOffsets.length];
      const epochMs = cycleStart + minute * 60_000;
      const epoch = new Date(epochMs).toISOString();

      // T/P per station per cycle; SYN_B's reading of cycle 7 arrives 40 min late (ATMO-005)
      const tpLate = station.stationCode === 'SYN_B' && cycle === 7;
      envReadings[station.stationCode].push({
        epoch: new Date(epochMs + (tpLate ? 40 * 60_000 : -2 * 60_000)).toISOString(),
        temperatureC: 12 + 3 * Math.sin(cycle / 3) + (rand() - 0.5),
        pressureHPa: 1010 + 4 * Math.cos(cycle / 4) + (rand() - 0.5) * 2,
      });

      for (const point of SYNTHETIC_POINTS) {
        const rawName = point.observedAs[station.stationCode];
        if (!rawName) continue;
        const dE = point.e - station.e;
        const dN = point.n - station.n;
        const dH = point.h - (station.h + station.instrumentHeightM);
        const hd = Math.hypot(dE, dN);
        const sd = Math.hypot(hd, dH);
        const az = azimuth({ e: station.e, n: station.n }, { e: point.e, n: point.n });
        const hzDeg = wrapTwoPi(az - station.orientationRad) * RAD2DEG + noiseAngleDeg();
        const vzDeg = Math.atan2(hd, dH) / DEG2RAD + noiseAngleDeg();
        let sdM = sd + noiseDistM();
        const id = `syn-${station.stationCode}-${rawName}-${record}`;
        // one gross error: SYN_B -> MB_12, cycle 9 (+25 mm) — chi-square/Auto Adjust material
        if (station.stationCode === 'SYN_B' && rawName === 'MB_12' && cycle === 9) {
          sdM += 0.025;
          badObservationId = id;
        }
        const observation: RawObservation = {
          id,
          stationCode: station.stationCode,
          rawTargetName: rawName,
          epoch,
          hzDeg,
          vzDeg,
          sdM,
        };
        record += 1;
        if (isGap) lateObservations.push(observation);
        else observations.push(observation);
      }
    }
  }

  return { observations, envReadings, lateObservations, badObservationId };
}

/** Known reference coordinates genuinely provided with the synthetic dataset (INIT-003). */
export const SYNTHETIC_REFERENCES = SYNTHETIC_POINTS.filter((p) => p.role === 'reference').map((p) => ({
  pointName: p.physicalKey,
  eastingM: p.e,
  northingM: p.n,
  heightM: p.h,
  sigmaM: 0.001,
}));
