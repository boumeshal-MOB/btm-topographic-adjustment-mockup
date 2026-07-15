import type { AdjustmentConfigVersion } from '@/domain/entities';

/**
 * A used version is returned read-only (VER-001); editing it creates a new draft rather than
 * mutating the historical object (VER-002).
 */
export interface ConfigurationVersionRepository {
  listByProcessing(processingId: number): Promise<AdjustmentConfigVersion[]>;
  get(id: string): Promise<AdjustmentConfigVersion | undefined>;
  /** Resolves the version valid at a given slot/instant, honouring `[validFrom, validTo[` (TIME-006/007). */
  resolveForSlot(processingId: number, slotIso: string): Promise<AdjustmentConfigVersion | undefined>;
  createDraft(
    input: Omit<AdjustmentConfigVersion, 'id' | 'createdAt' | 'status' | 'usedByRun'>,
  ): Promise<AdjustmentConfigVersion>;
  activate(id: string): Promise<AdjustmentConfigVersion>;
  archive(id: string): Promise<AdjustmentConfigVersion>;
}
