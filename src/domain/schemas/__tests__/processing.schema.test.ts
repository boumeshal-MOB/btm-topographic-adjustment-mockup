import { describe, expect, it } from 'vitest';
import type { TopographicAdjustmentProcessing } from '@/domain/entities';
import { processingStatusSchema, topographicAdjustmentProcessingSchema } from '@/domain/schemas/common';

describe('processing status is wired into the processing entity (audit item 8)', () => {
  it('validates a processing that carries a lifecycle status distinct from active', () => {
    const processing: TopographicAdjustmentProcessing = {
      id: 1,
      projectId: 42,
      type: 'Topographic Adjustment',
      name: 'NTE ATS34 single station',
      scope: 'single-station',
      status: 'draft',
      active: false,
      createdAt: '2026-07-14T00:00:00.000Z',
      updatedAt: '2026-07-14T00:00:00.000Z',
    };
    expect(() => topographicAdjustmentProcessingSchema.parse(processing)).not.toThrow();
  });

  it('rejects an unknown status', () => {
    expect(() => processingStatusSchema.parse('not-a-status')).toThrow();
  });

  it('accepts every documented ProcessingStatus value', () => {
    for (const status of [
      'draft',
      'waiting_for_data',
      'ready',
      'running',
      'success',
      'warning',
      'provisional',
      'failed_qc',
      'technical_error',
      'disabled',
      'archived',
    ]) {
      expect(processingStatusSchema.parse(status)).toBe(status);
    }
  });
});
