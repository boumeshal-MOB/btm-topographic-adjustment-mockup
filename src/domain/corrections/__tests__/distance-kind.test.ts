import { describe, expect, it } from 'vitest';
import { slopeDistanceFromInput } from '@/domain/corrections/distance-kind';

describe('slope distance from the stored variable', () => {
  it('passes a slope distance through untouched', () => {
    const result = slopeDistanceFromInput({ distanceM: 13.9355, zenithDeg: 96.26, kind: 'slope' });
    expect(result).toEqual({ ok: true, slopeDistanceM: 13.9355, converted: false });
  });

  it('converts a horizontal distance with the zenith angle', () => {
    // 30 m horizontal on a sight 30° off the horizontal: Sd = 30 / sin(60°) = 34.6410 m
    const result = slopeDistanceFromInput({ distanceM: 30, zenithDeg: 60, kind: 'horizontal' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slopeDistanceM).toBeCloseTo(34.641016, 6);
    expect(result.converted).toBe(true);
  });

  it('leaves a level sight unchanged, because there the two are the same', () => {
    const result = slopeDistanceFromInput({ distanceM: 42.5, zenithDeg: 90, kind: 'horizontal' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slopeDistanceM).toBeCloseTo(42.5, 9);
  });

  it('is symmetric above and below the horizon', () => {
    const up = slopeDistanceFromInput({ distanceM: 30, zenithDeg: 60, kind: 'horizontal' });
    const down = slopeDistanceFromInput({ distanceM: 30, zenithDeg: 120, kind: 'horizontal' });
    expect(up.ok && down.ok).toBe(true);
    if (!up.ok || !down.ok) return;
    expect(up.slopeDistanceM).toBeCloseTo(down.slopeDistanceM, 9);
  });

  it('refuses a sight too close to the vertical instead of inventing a plausible number', () => {
    const result = slopeDistanceFromInput({ distanceM: 0.5, zenithDeg: 178.5, kind: 'horizontal' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/too close to the vertical/);
  });

  it('refuses a horizontal distance without a usable zenith', () => {
    expect(slopeDistanceFromInput({ distanceM: 30, zenithDeg: Number.NaN, kind: 'horizontal' }).ok).toBe(false);
  });

  it('refuses a distance that is not a positive number, whatever the kind', () => {
    expect(slopeDistanceFromInput({ distanceM: 0, zenithDeg: 90, kind: 'slope' }).ok).toBe(false);
    expect(slopeDistanceFromInput({ distanceM: -3, zenithDeg: 90, kind: 'horizontal' }).ok).toBe(false);
  });
});
