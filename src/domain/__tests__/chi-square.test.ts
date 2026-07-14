import { describe, expect, it } from 'vitest';
import type { ChiSquareStatus } from '@/domain/entities';
import { chi2PassedOutputValue, isChiSquarePass, publishesChi2Passed } from '@/domain/chi-square';

describe('ChiSquareStatus is the canonical authority (audit item 5)', () => {
  it('derives the chi2-passed output value: passed→1, failed→0', () => {
    expect(chi2PassedOutputValue('passed')).toBe(1);
    expect(chi2PassedOutputValue('failed')).toBe(0);
  });

  it('publishes NO fabricated 1/0 for not-applicable (dof <= 0, audit B-04)', () => {
    expect(chi2PassedOutputValue('not-applicable')).toBeNull();
    expect(publishesChi2Passed('not-applicable')).toBe(false);
    expect(publishesChi2Passed('passed')).toBe(true);
    expect(publishesChi2Passed('failed')).toBe(true);
  });

  it('never treats not-applicable as a pass', () => {
    expect(isChiSquarePass('not-applicable')).toBe(false);
    expect(isChiSquarePass('failed')).toBe(false);
    expect(isChiSquarePass('passed')).toBe(true);
  });

  it('covers every status exhaustively (no contradictory combination possible)', () => {
    const all: ChiSquareStatus[] = ['passed', 'failed', 'not-applicable'];
    for (const status of all) {
      const value = chi2PassedOutputValue(status);
      // The derived value and the "is pass" predicate can never disagree.
      expect(isChiSquarePass(status)).toBe(value === 1);
    }
  });
});
