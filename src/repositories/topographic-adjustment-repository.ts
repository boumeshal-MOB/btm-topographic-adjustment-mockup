import type { TopographicAdjustmentProcessing } from '@/domain/entities';

export interface TopographicAdjustmentRepository {
  list(projectId: number): Promise<TopographicAdjustmentProcessing[]>;
  get(id: number): Promise<TopographicAdjustmentProcessing | undefined>;
  create(
    input: Omit<TopographicAdjustmentProcessing, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<TopographicAdjustmentProcessing>;
}
