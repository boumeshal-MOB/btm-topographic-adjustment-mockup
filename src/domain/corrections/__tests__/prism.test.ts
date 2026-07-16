import { describe, expect, it } from 'vitest';
import { resolvePrismDelta } from '@/domain/corrections/prism';

describe('resolvePrismDelta — CORR-002 required minus applied', () => {
  it('CORR-002 positive delta: required > applied', () => {
    expect(resolvePrismDelta({ measurementType: 'prism', requiredConstantM: 0.03, alreadyAppliedConstantM: 0.01 })).toBeCloseTo(0.02, 9);
  });

  it('CORR-002 negative delta: required < applied', () => {
    expect(resolvePrismDelta({ measurementType: 'prism', requiredConstantM: 0.01, alreadyAppliedConstantM: 0.03 })).toBeCloseTo(-0.02, 9);
  });

  it('CORR-002 zero delta: required equals applied', () => {
    expect(resolvePrismDelta({ measurementType: 'prism', requiredConstantM: 0.0255, alreadyAppliedConstantM: 0.0255 })).toBeCloseTo(0, 9);
  });

  it('CORR-002 FR MPO: 25.5mm required and already applied -> BTM delta 0.0mm', () => {
    const delta = resolvePrismDelta({ measurementType: 'prism', requiredConstantM: 0.0255, alreadyAppliedConstantM: 0.0255 });
    expect(delta * 1000).toBeCloseTo(0.0, 6);
  });

  it('CORR-002 UK L-bar: 8.9mm required, 0mm applied -> delta +8.9mm', () => {
    const delta = resolvePrismDelta({ measurementType: 'prism', requiredConstantM: 0.0089, alreadyAppliedConstantM: 0 });
    expect(delta * 1000).toBeCloseTo(8.9, 6);
  });

  it('CORR-009/MEAS-008 reflectorless always has prismDelta = 0, ignoring any constant fields', () => {
    expect(resolvePrismDelta({ measurementType: 'reflectorless', requiredConstantM: 0.0255, alreadyAppliedConstantM: 0 })).toBe(0);
    expect(resolvePrismDelta({ measurementType: 'reflectorless' })).toBe(0);
  });

  it('MEAS-007 reflective-sheet uses its own required/applied constants, never hardcoded to a 0mm prism', () => {
    const delta = resolvePrismDelta({ measurementType: 'reflective-sheet', requiredConstantM: 0.005, alreadyAppliedConstantM: 0.002 });
    expect(delta).toBeCloseTo(0.003, 9);
    // Distinct from a prism setup with the same numbers only by measurementType, proving the
    // sheet is computed through its own setup rather than being assimilated to "prism 0mm".
    expect(delta).not.toBe(0);
  });

  it('missing constants block prism/sheet correction instead of silently assuming 0 mm', () => {
    expect(() => resolvePrismDelta({ measurementType: 'prism' })).toThrow(/Unresolved reflector constant/);
  });
});
