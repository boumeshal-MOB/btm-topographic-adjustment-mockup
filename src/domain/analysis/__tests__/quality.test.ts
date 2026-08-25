import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STANDARDISED_DELTA_THRESHOLDS,
  displacementLevel,
  residualLevel,
  standardisedDeltaScore,
  uncertaintyLevel,
} from '@/domain/analysis/quality';

/**
 * The three result families are coloured by different rules on purpose: "how far did it move",
 * "how well is it determined" and "does this measurement agree" are different questions and must
 * not share thresholds.
 */
describe('quality levels', () => {
  const thresholds = DEFAULT_STANDARDISED_DELTA_THRESHOLDS;

  it('grades the standardised correction index at 3σ and 5σ', () => {
    expect(displacementLevel(2.99, thresholds)).toBe('normal');
    expect(displacementLevel(3, thresholds)).toBe('warning');
    expect(displacementLevel(4.99, thresholds)).toBe('warning');
    expect(displacementLevel(5, thresholds)).toBe('critical');
    expect(displacementLevel(-5.5, thresholds)).toBe('critical');
    expect(displacementLevel(undefined, thresholds)).toBeUndefined();
    expect(displacementLevel(Number.NaN, thresholds)).toBeUndefined();
  });

  it('calculates E, N, H, plan and 3D indices from the selected components', () => {
    const delta = { eMm: 3, nMm: 4, hMm: 6 };
    const sigma = { eMm: 1, nMm: 2, hMm: 3 };
    expect(standardisedDeltaScore(delta, sigma, 'e')).toBe(3);
    expect(standardisedDeltaScore(delta, sigma, 'n')).toBe(2);
    expect(standardisedDeltaScore(delta, sigma, 'h')).toBe(2);
    expect(standardisedDeltaScore(delta, sigma, 'plan'))
      .toBeCloseTo(Math.hypot(3, 4) / Math.hypot(1, 2));
    expect(standardisedDeltaScore(delta, sigma, '3d'))
      .toBeCloseTo(Math.hypot(3, 4, 6) / Math.hypot(1, 2, 3));
    expect(standardisedDeltaScore(delta, sigma, 'role')).toBeUndefined();
    expect(standardisedDeltaScore(delta, { ...sigma, hMm: 0 }, '3d')).toBeUndefined();
  });

  it('reproduces the 0.90σ 3D index shown for MP105_1', () => {
    const score = standardisedDeltaScore(
      { eMm: 0.37, nMm: -2.64, hMm: 0.02 },
      { eMm: 2.05, nMm: 1.98, hMm: 0.78 },
      '3d',
    );
    expect(score).toBeCloseTo(0.902, 3);
    expect(displacementLevel(score, thresholds)).toBe('normal');
  });

  it('grades uncertainty on its own scale, not the displacement one', () => {
    expect(uncertaintyLevel(1.9)).toBe('normal');
    expect(uncertaintyLevel(2)).toBe('warning');
    expect(uncertaintyLevel(5)).toBe('critical');
    // Coordinate uncertainty remains in millimetres; correction significance is dimensionless.
    expect(uncertaintyLevel(3)).toBe('warning');
    expect(displacementLevel(3.5, thresholds)).toBe('warning');
    expect(uncertaintyLevel(undefined)).toBeUndefined();
  });

  it('treats a standardized residual beyond three sigma as an outlier', () => {
    expect(residualLevel(1.99)).toBe('normal');
    expect(residualLevel(2)).toBe('warning');
    expect(residualLevel(3)).toBe('warning');
    expect(residualLevel(3.01)).toBe('critical');
    expect(residualLevel(-4)).toBe('critical');
    expect(residualLevel(Number.NaN)).toBeUndefined();
  });
});
