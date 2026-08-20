import { describe, expect, it } from 'vitest';
import { fixed, isRealNumber, millimetres, NO_VALUE, withUnit } from '@/features/shared/format';

/**
 * The regression this file exists for: a diagnostic that could not be solved reached a component as
 * `null`, and `value.toFixed()` took a whole route down through the error boundary — with the message
 * surfacing three screens away from its cause.
 */
describe('rendering a number that crossed a JSON boundary', () => {
  it('turns the values JSON cannot carry into a dash', () => {
    // `JSON.stringify` has no representation for either, so both arrive as null.
    expect(JSON.parse(JSON.stringify({ v: Number.NaN })).v).toBeNull();
    expect(JSON.parse(JSON.stringify({ v: Number.POSITIVE_INFINITY })).v).toBeNull();

    expect(fixed(null, 3)).toBe(NO_VALUE);
    expect(fixed(undefined, 3)).toBe(NO_VALUE);
    expect(fixed(Number.NaN, 3)).toBe(NO_VALUE);
    expect(fixed(Number.POSITIVE_INFINITY, 3)).toBe(NO_VALUE);
  });

  it('still renders real numbers, zero included', () => {
    expect(fixed(1.08482, 3)).toBe('1.085');
    expect(fixed(0, 2)).toBe('0.00');
    expect(fixed(-2.5, 1)).toBe('-2.5');
  });

  it('shows a missing millimetre value as missing rather than as zero', () => {
    // `(null * 1000).toFixed(2)` reads "0.00" because multiplication coerces null — a silent lie
    // that is worse than the crash, because nobody notices it.
    expect(millimetres(null)).toBe(NO_VALUE);
    expect(millimetres(0.0015)).toBe('1.50');
  });

  it('drops the unit with the value', () => {
    expect(withUnit(null, 2, 'mm')).toBe(NO_VALUE);
    expect(withUnit(1.5, 1, 'mm')).toBe('1.5 mm');
  });

  it('accepts only numbers that can be used arithmetically', () => {
    expect(isRealNumber(0)).toBe(true);
    expect(isRealNumber(null)).toBe(false);
    expect(isRealNumber(undefined)).toBe(false);
    expect(isRealNumber(Number.NaN)).toBe(false);
    expect(isRealNumber('1.5')).toBe(false);
  });
});
