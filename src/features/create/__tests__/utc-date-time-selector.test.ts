import { describe, expect, it } from 'vitest';
import { combineUtcDateTime, splitUtcDateTime } from '@/features/create/UtcDateTimeSelector';

describe('UTC date and time selector', () => {
  it('splits a stored ISO timestamp without applying the browser timezone', () => {
    expect(splitUtcDateTime('2026-07-18T21:35:00.000Z')).toEqual({
      date: '2026-07-18',
      time: '21:35',
    });
  });

  it('combines calendar and clock values into a canonical UTC timestamp', () => {
    expect(combineUtcDateTime('2026-07-18', '21:35')).toBe('2026-07-18T21:35:00.000Z');
  });

  it('uses midnight when the date is chosen before a time', () => {
    expect(combineUtcDateTime('2026-07-18', '')).toBe('2026-07-18T00:00:00.000Z');
  });

  it('rejects incomplete and impossible dates', () => {
    expect(combineUtcDateTime('', '12:00')).toBe('');
    expect(combineUtcDateTime('2026-02-31', '12:00')).toBe('');
    expect(splitUtcDateTime('not-a-date')).toEqual({ date: '', time: '' });
  });
});
