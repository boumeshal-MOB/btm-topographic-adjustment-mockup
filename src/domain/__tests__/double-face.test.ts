import { describe, expect, it } from 'vitest';
import { reduceDoubleFace } from '@/domain/double-face';

describe('reduceDoubleFace', () => {
  it('reduces a gon Face I/Face II observation into canonical degrees', () => {
    const result = reduceDoubleFace({
      hzFace1: 10,
      vzFace1: 100,
      sdFace1M: 50,
      hzFace2: 210,
      vzFace2: 300,
      sdFace2M: 50,
    }, 'GON');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.observation).toEqual({ hzDeg: 9, vzDeg: 90, sdM: 50 });
    expect(result.diagnostics).toEqual({
      horizontalClosure: 0,
      verticalIndexError: 0,
      slopeDistanceDifferenceM: 0,
    });
  });

  it('uses a circular mean across the source full-circle boundary', () => {
    const result = reduceDoubleFace({
      hzFace1: 399.99,
      vzFace1: 100,
      sdFace1M: 25,
      hzFace2: 200.01,
      vzFace2: 300,
      sdFace2M: 25,
    }, 'GON');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.observation.hzDeg).toBeCloseTo(0, 10);
  });

  it('supports decimal-degree source observations', () => {
    const result = reduceDoubleFace({
      hzFace1: 100,
      vzFace1: 90,
      sdFace1M: 40,
      hzFace2: 280,
      vzFace2: 270,
      sdFace2M: 42,
    }, 'DEGREES');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.observation).toEqual({ hzDeg: 100, vzDeg: 90, sdM: 41 });
  });

  it('rejects the complete observation when any source component is non-finite', () => {
    const result = reduceDoubleFace({
      hzFace1: 10,
      vzFace1: 100,
      sdFace1M: 50,
      hzFace2: Number.NaN,
      vzFace2: 300,
      sdFace2M: 50,
    }, 'GON');

    expect(result).toEqual({
      ok: false,
      reason: 'missing-or-non-finite',
      invalidComponents: ['hzFace2'],
    });
  });

  it('rejects physically impossible angles and non-positive distances', () => {
    expect(reduceDoubleFace({
      hzFace1: 10,
      vzFace1: 201,
      sdFace1M: 50,
      hzFace2: 210,
      vzFace2: 300,
      sdFace2M: 50,
    }, 'GON')).toEqual({
      ok: false,
      reason: 'angle-out-of-range',
      invalidComponents: ['vzFace1'],
    });

    expect(reduceDoubleFace({
      hzFace1: 10,
      vzFace1: 100,
      sdFace1M: 0,
      hzFace2: 210,
      vzFace2: 300,
      sdFace2M: 50,
    }, 'GON')).toEqual({
      ok: false,
      reason: 'distance-not-positive',
      invalidComponents: ['sdFace1M'],
    });
  });

  it('reports face closures without using an undocumented rejection threshold', () => {
    const result = reduceDoubleFace({
      hzFace1: 10,
      vzFace1: 100,
      sdFace1M: 50,
      hzFace2: 210.02,
      vzFace2: 300.04,
      sdFace2M: 50.004,
    }, 'GON');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.diagnostics.horizontalClosure).toBeCloseTo(0.02, 12);
    expect(result.diagnostics.verticalIndexError).toBeCloseTo(0.02, 12);
    expect(result.diagnostics.slopeDistanceDifferenceM).toBeCloseTo(-0.004, 12);
  });
});
