import { describe, expect, it } from 'vitest';
import { isProcessingDetail } from '@/features/shared/processing-detail';

describe('processing detail runtime boundary', () => {
  it('rejects a persisted legacy payload with no processing identity', () => {
    expect(isProcessingDetail({ versions: [], variables: [], runs: [] })).toBe(false);
  });

  it('accepts the minimum current processing-detail shape', () => {
    expect(isProcessingDetail({
      processing: { name: 'Adjustment' },
      versions: [],
      variables: [],
      runs: [],
    })).toBe(true);
  });
});
