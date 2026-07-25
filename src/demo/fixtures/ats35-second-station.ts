import type { RawObservation } from '@/domain/entities';
import { DEG2RAD, RAD2DEG, azimuth, wrapTwoPi } from '@/domain/math/geometry';

/**
 * `NTE ATS35` — a second SYNTHETIC UK-style single station (DEMO-003), added purely to give the
 * tests and the demo a second UK dataset alongside the real supplied ATS34. It is deterministic
 * and never presented as real BTM data.
 *
 * Unlike ATS34 (constants already embedded in the workbook) and FR (distances already corrected),
 * ATS35 stores RAW slope distances measured with a Leica round prism whose constant (−34.4 mm)
 * has NOT been applied by the station. It therefore exercises the prism-correction path
 * end to end (required −34.4 mm, already applied 0 → BTM Δ = −34.4 mm, CORR-002), while its
 * atmospheric mode stays `already-applied` so no double correction occurs (CORR-005).
 *
 * This station is synthetic, but its network geometry is not arbitrary: three targets represent
 * the exact same physical monuments as three points measured in the supplied ATS34 dataset.
 * Their BTM names intentionally remain station-specific (`..._34` versus `..._35`) so the demo
 * still exercises explicit, human-confirmed physical-point mapping.
 *
 * Two additional header references carry known coordinates (INIT-003 material). All generated
 * Hz/Vz/Sd observations are derived from the coordinates below, so the shared points close
 * geometrically after the configured prism correction.
 */

export const ATS35_STATION = {
  stationCode: 'NTE_ATS35',
  e: 280520.184,
  n: 288452.736,
  h: 31.184,
  orientationRad: 1.184,
  instrumentHeightM: 1.52,
};

/** Leica round-prism constant carried by every ATS35 target, in metres (−34.4 mm). */
export const ATS35_PRISM_CONSTANT_M = -0.0344;

export const ATS35_POINTS = [
  { name: 'NTE_R21', adjustmentName: 'R21', e: 280535.246, n: 288468.193, h: 32.104, targetHeightM: 0, role: 'reference' as const },
  { name: 'NTE_R22', adjustmentName: 'R22', e: 280476.822, n: 288474.864, h: 30.942, targetHeightM: 0, role: 'reference' as const },
  // Same physical points as ATS34 targets. Coordinates are medians derived from the supplied
  // corrected ATS34 polar observations in its Header datum. The parallel suffix makes pairing easy.
  { name: '360_301_35', adjustmentName: '360_301_35', e: 280669.3901922, n: 288462.1731178, h: 33.0874690, targetHeightM: 0, role: 'monitoring' as const },
  { name: '360_303_35', adjustmentName: '360_303_35', e: 280606.7776066, n: 288476.8808108, h: 32.5616045, targetHeightM: 0, role: 'monitoring' as const },
  { name: '360_304_35', adjustmentName: '360_304_35', e: 280574.6920694, n: 288484.3769530, h: 32.4043165, targetHeightM: 0, role: 'monitoring' as const },
  { name: 'NTE_M31', adjustmentName: 'M31', e: 280548.324, n: 288493.182, h: 31.042, targetHeightM: 0, role: 'monitoring' as const },
  { name: 'NTE_M32', adjustmentName: 'M32', e: 280455.731, n: 288505.487, h: 30.684, targetHeightM: 0, role: 'monitoring' as const },
];

/** Explicit demo mapping. It is test evidence only: the product never confirms it automatically. */
export const ATS35_SHARED_POINT_PAIRS = [
  { ats34: '360_301_34', ats35: '360_301_35' },
  { ats34: '360_303_34', ats35: '360_303_35' },
  { ats34: '360_304_34', ats35: '360_304_35' },
] as const;

// Overlaps ATS34's final observation day so default network synchronisation and test runs work.
export const ATS35_PERIOD = { from: '2025-03-31T00:00:00.000Z', to: '2025-03-31T20:30:00.000Z' };

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

export function generateAts35(): RawObservation[] {
  const rand = mulberry32(20250602);
  const observations: RawObservation[] = [];
  const start = new Date(ATS35_PERIOD.from).getTime();
  let record = 1;
  // 41 cycles of a 30-min cycle, observations at :15 within each cycle.
  for (let cycle = 0; cycle < 41; cycle++) {
    const epoch = new Date(start + cycle * 30 * 60_000 + 15 * 60_000).toISOString();
    for (const point of ATS35_POINTS) {
      const dE = point.e - ATS35_STATION.e;
      const dN = point.n - ATS35_STATION.n;
      const dH = point.h + point.targetHeightM - (ATS35_STATION.h + ATS35_STATION.instrumentHeightM);
      const hd = Math.hypot(dE, dN);
      const trueSd = Math.hypot(hd, dH);
      const az = azimuth({ e: ATS35_STATION.e, n: ATS35_STATION.n }, { e: point.e, n: point.n });
      observations.push({
        id: `ats35-${point.name}-${record}`,
        stationCode: ATS35_STATION.stationCode,
        rawTargetName: point.name,
        epoch,
        hzDeg: wrapTwoPi(az - ATS35_STATION.orientationRad) * RAD2DEG + (rand() - 0.5) * (2 / 3600),
        vzDeg: Math.atan2(hd, dH) / DEG2RAD + (rand() - 0.5) * (2 / 3600),
        // RAW distance: the Leica prism constant is NOT applied yet, so the demo must add it
        // during resolve (required −34.4 mm, already applied 0). Stored = true − constant.
        sdM: trueSd - ATS35_PRISM_CONSTANT_M + (rand() - 0.5) * 0.0008,
      });
      record += 1;
    }
  }
  return observations;
}

/** Per-target Lookup metadata (adjustment name, target height, prism constant) — ATS34-style. */
export const ATS35_LOOKUP = new Map(
  ATS35_POINTS.map((p) => [
    p.name,
    { adjustmentName: p.adjustmentName, targetHeightM: p.targetHeightM, prismConstantM: ATS35_PRISM_CONSTANT_M },
  ]),
);

/** Known reference coordinates genuinely provided with the ATS35 dataset (INIT-003). */
export const ATS35_REFERENCES = ATS35_POINTS.filter((p) => p.role === 'reference').map((p) => ({
  pointName: p.name,
  eastingM: p.e,
  northingM: p.n,
  heightM: p.h,
  sigmaM: 0.0015,
}));
