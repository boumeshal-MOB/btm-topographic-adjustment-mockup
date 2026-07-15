import type { AdjustmentRunSummary } from '@/domain/entities';

export interface RunRepository {
  listByProcessing(processingId: number): Promise<AdjustmentRunSummary[]>;
  get(id: string): Promise<AdjustmentRunSummary | undefined>;
  save(run: AdjustmentRunSummary): Promise<AdjustmentRunSummary>;
}
