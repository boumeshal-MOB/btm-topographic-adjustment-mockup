import type { ProcessingOutputVariable } from '@/domain/entities';

/**
 * A variable is created once per target/component regardless of config version changes
 * (OUT-002); this repository never creates a duplicate for the same
 * `(processingId, scope, prismSensorId, component)` key.
 */
export interface OutputVariableRepository {
  listByProcessing(processingId: number): Promise<ProcessingOutputVariable[]>;
  ensure(variables: ProcessingOutputVariable[]): Promise<ProcessingOutputVariable[]>;
  /** Simulates the production UPSERT on `(variable_id, timestamp)` (OUT-009/010). */
  upsertMeasure(variableId: number, timestampIso: string, value: number): Promise<void>;
}
