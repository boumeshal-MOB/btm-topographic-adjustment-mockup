import { describe, expect, it } from 'vitest';
import { combineUtcDateTime } from '@/features/create/UtcDateTimeSelector';

describe('configuration validity contract', () => {
  it('keeps configuration validity independent from observation-cycle dates', () => {
    const validFrom = combineUtcDateTime('2027-01-15', '08:45');
    expect(validFrom).toBe('2027-01-15T08:45:00.000Z');
  });
});
