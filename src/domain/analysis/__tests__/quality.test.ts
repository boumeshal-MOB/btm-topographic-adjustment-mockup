import { describe, expect, it } from 'vitest';
import {
  displacementLevel,
  residualLevel,
  uncertaintyLevel,
} from '@/domain/analysis/quality';

/**
 * The three result families are coloured by different rules on purpose: "how far did it move",
 * "how well is it determined" and "does this measurement agree" are different questions and must
 * not share thresholds.
 */
describe('quality levels', () => {
  const thresholds = { warningMm: 2, criticalMm: 3 };

  it('grades displacement against the thresholds the user controls', () => {
    expect(displacementLevel(1.9, thresholds)).toBe('normal');
    expect(displacementLevel(2, thresholds)).toBe('warning');
    expect(displacementLevel(3, thresholds)).toBe('warning');
    expect(displacementLevel(3.01, thresholds)).toBe('critical');
    // direction is irrelevant: a 3.5 mm move is a 3.5 mm move
    expect(displacementLevel(-3.5, thresholds)).toBe('critical');
    expect(displacementLevel(undefined, thresholds)).toBeUndefined();
    expect(displacementLevel(Number.NaN, thresholds)).toBeUndefined();
  });

  it('grades uncertainty on its own scale, not the displacement one', () => {
    expect(uncertaintyLevel(1.9)).toBe('normal');
    expect(uncertaintyLevel(2)).toBe('warning');
    expect(uncertaintyLevel(5)).toBe('critical');
    // a 3 mm sigma is only a warning, while a 3 mm displacement is already critical
    expect(uncertaintyLevel(3)).toBe('warning');
    expect(displacementLevel(3.5, thresholds)).toBe('critical');
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
