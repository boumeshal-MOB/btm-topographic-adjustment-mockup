import type { RawObservation } from '@/domain/entities';
import { DEG2RAD, RAD2DEG, azimuth, wrapTwoPi } from '@/domain/math/geometry';

/**
 * Small SYNTHETIC France monitoring fixture (demo/40 §7 "France corrected"): Topcon MS05AXII
 * style single station whose distances are ALREADY corrected by the station (MPO FR: required
 * +25.5 mm and already applied +25.5 mm → BTM delta 0, atmosphere `already-applied`). It
 * proves the no-double-correction path (CORR-005) end to end. Clearly labelled synthetic demo
 * data (DEMO-003) — not a real French project.
 */

export const FR_STATION = { stationCode: 'FR_ST01', e: 500, n: 800, h: 120, orientationRad: 0.35, instrumentHeightM: 0.15 };

export const FR_POINTS = [
  { name: 'FR_REF01', e: 620, n: 780, h: 121.5, role: 'reference' as const },
  { name: 'FR_REF02', e: 460, n: 930, h: 119.2, role: 'reference' as const },
  { name: 'MPO_001', e: 560, n: 860, h: 120.8, role: 'monitoring' as const },
  { name: 'MPO_002', e: 540, n: 750, h: 119.9, role: 'monitoring' as const },
  { name: 'MPO_003', e: 445, n: 845, h: 120.3, role: 'monitoring' as const },
];

export const FR_PERIOD = { from: '2025-05-01T06:00:00.000Z', to: '2025-05-01T10:00:00.000Z' };

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

export function generateFrMonitoring(): RawObservation[] {
  const rand = mulberry32(20250501);
  const observations: RawObservation[] = [];
  const start = new Date(FR_PERIOD.from).getTime();
  let record = 1;
  for (let cycle = 0; cycle < 8; cycle++) {
    const epoch = new Date(start + cycle * 30 * 60_000 + 10 * 60_000).toISOString();
    for (const point of FR_POINTS) {
      const dE = point.e - FR_STATION.e;
      const dN = point.n - FR_STATION.n;
      const dH = point.h - (FR_STATION.h + FR_STATION.instrumentHeightM);
      const hd = Math.hypot(dE, dN);
      const az = azimuth({ e: FR_STATION.e, n: FR_STATION.n }, { e: point.e, n: point.n });
      observations.push({
        id: `fr-${point.name}-${record}`,
        stationCode: FR_STATION.stationCode,
        rawTargetName: point.name,
        epoch,
        hzDeg: wrapTwoPi(az - FR_STATION.orientationRad) * RAD2DEG + (rand() - 0.5) * (2 / 3600),
        vzDeg: Math.atan2(hd, dH) / DEG2RAD + (rand() - 0.5) * (2 / 3600),
        // stored distance is ALREADY fully corrected (prism + atmosphere) by the station
        sdM: Math.hypot(hd, dH) + (rand() - 0.5) * 0.0008,
      });
      record += 1;
    }
  }
  return observations;
}

export const FR_REFERENCES = FR_POINTS.filter((p) => p.role === 'reference').map((p) => ({
  pointName: p.name,
  eastingM: p.e,
  northingM: p.n,
  heightM: p.h,
  sigmaM: 0.001,
}));
