import { describe, expect, it } from 'vitest';
import type { ChiSquareStatus } from '@/domain/entities';
import { chi2PassedOutputValue, isChiSquarePass, publishesChi2Passed } from '@/domain/chi-square';

/**
 * Minimal in-memory fake conforming to the `replaceMeasure` contract, used only to prove the
 * decision/mutation logic below in a pure test (audit item 1, pass 3). This is NOT the demo
 * repository — T01.9 is not started; only the method surface used by this test is implemented.
 */
function createInMemoryMeasureStore() {
  const store = new Map<string, number>();
  const key = (variableId: number, timestampIso: string) => `${variableId}@${timestampIso}`;
  return {
    replaceMeasure(variableId: number, timestampIso: string, value: number | null): void {
      const k = key(variableId, timestampIso);
      if (value === null) {
        store.delete(k);
      } else {
        store.set(k, value);
      }
    },
    get(variableId: number, timestampIso: string): number | undefined {
      return store.get(key(variableId, timestampIso));
    },
  };
}

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

describe('a recalculation never leaves a stale chi2-passed value (audit item 1, pass 3)', () => {
  const CHI2_PASSED_VARIABLE_ID = 501;
  const SLOT = '2025-03-01T09:30:00.000Z';

  it('clears a previous chi2-passed=1 when the same slot recalculates to not-applicable', () => {
    const store = createInMemoryMeasureStore();

    // Prior run of this slot: chi-square passed, published 1.
    store.replaceMeasure(CHI2_PASSED_VARIABLE_ID, SLOT, chi2PassedOutputValue('passed'));
    expect(store.get(CHI2_PASSED_VARIABLE_ID, SLOT)).toBe(1);

    // Recalculation of the SAME slot now yields not-applicable (e.g. dof <= 0 after a
    // configuration/reference change) — the derived value is null, so replaceMeasure clears it.
    store.replaceMeasure(CHI2_PASSED_VARIABLE_ID, SLOT, chi2PassedOutputValue('not-applicable'));

    // No stale 1 (or fabricated 0) survives: the key holds no value at all.
    expect(store.get(CHI2_PASSED_VARIABLE_ID, SLOT)).toBeUndefined();
  });

  it('clears a previous chi2-passed=0 the same way', () => {
    const store = createInMemoryMeasureStore();
    store.replaceMeasure(CHI2_PASSED_VARIABLE_ID, SLOT, chi2PassedOutputValue('failed'));
    expect(store.get(CHI2_PASSED_VARIABLE_ID, SLOT)).toBe(0);

    store.replaceMeasure(CHI2_PASSED_VARIABLE_ID, SLOT, chi2PassedOutputValue('not-applicable'));
    expect(store.get(CHI2_PASSED_VARIABLE_ID, SLOT)).toBeUndefined();
  });

  it('a not-applicable recalculation is never itself upgraded to passed or failed', () => {
    const store = createInMemoryMeasureStore();
    store.replaceMeasure(CHI2_PASSED_VARIABLE_ID, SLOT, chi2PassedOutputValue('passed'));

    const recalculatedStatus: ChiSquareStatus = 'not-applicable';
    // The only value ever derived and written for a not-applicable recalculation is null/clear —
    // there is no code path that maps not-applicable to 1 or 0.
    expect(chi2PassedOutputValue(recalculatedStatus)).toBeNull();
    store.replaceMeasure(CHI2_PASSED_VARIABLE_ID, SLOT, chi2PassedOutputValue(recalculatedStatus));
    expect(store.get(CHI2_PASSED_VARIABLE_ID, SLOT)).toBeUndefined();
  });

  it('a normal recalculation still UPSERTs (OUT-009): passed then failed replaces to 0', () => {
    const store = createInMemoryMeasureStore();
    store.replaceMeasure(CHI2_PASSED_VARIABLE_ID, SLOT, chi2PassedOutputValue('passed'));
    store.replaceMeasure(CHI2_PASSED_VARIABLE_ID, SLOT, chi2PassedOutputValue('failed'));
    expect(store.get(CHI2_PASSED_VARIABLE_ID, SLOT)).toBe(0);
  });
});
