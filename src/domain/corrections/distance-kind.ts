import type { DistanceKind } from '@/domain/entities';
import { DEG2RAD } from '@/domain/math/geometry';

/**
 * Conversion of a stored distance into the slope distance the whole chain expects (CORR-001).
 *
 * STAR*NET reads a distance according to its project-level *3D input mode*, not according to a
 * per-record marker: the same `DM` record means slope-or-horizontal depending on one option. So a
 * native file cannot mix both, and the choice is made **on the input** instead — a sight whose
 * variable holds a horizontal distance becomes a slope distance here, exactly, using its zenith.
 */
export type { DistanceKind };

export type SlopeDistanceResult =
  | { ok: true; slopeDistanceM: number; converted: boolean }
  | { ok: false; reason: string };

/**
 * Sd = Hd / sin(zenith): exact geometry, not an approximation.
 *
 * The sight has to be steep enough for the conversion to mean anything. Within a few degrees of the
 * vertical, `sin(zenith)` collapses and the horizontal distance carries almost no information about
 * the slope distance, so the sight is refused instead of being turned into a plausible number.
 */
const MINIMUM_SINE = 0.05; // ~2.87° from the vertical

export function slopeDistanceFromInput({
  distanceM,
  zenithDeg,
  kind,
}: {
  distanceM: number;
  zenithDeg: number;
  kind: DistanceKind;
}): SlopeDistanceResult {
  if (!Number.isFinite(distanceM) || distanceM <= 0) {
    return { ok: false, reason: 'the stored distance is not a positive number' };
  }
  if (kind === 'slope') return { ok: true, slopeDistanceM: distanceM, converted: false };
  if (!Number.isFinite(zenithDeg)) {
    return { ok: false, reason: 'a horizontal distance needs a zenith angle to become a slope distance' };
  }
  const sine = Math.sin(zenithDeg * DEG2RAD);
  if (Math.abs(sine) < MINIMUM_SINE) {
    return {
      ok: false,
      reason: `zenith ${zenithDeg.toFixed(4)}° is too close to the vertical to convert a horizontal distance`,
    };
  }
  return { ok: true, slopeDistanceM: distanceM / sine, converted: true };
}
