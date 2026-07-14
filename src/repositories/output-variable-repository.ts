import type { ProcessingOutputVariable } from '@/domain/entities';

/**
 * The identity of an output variable WITHOUT its `variableId` (audit item 4). The caller — the
 * domain output plan (T01.8) — knows which target/component variables a processing needs, but
 * variable ids are assigned by the persistence layer (the demo repository here, the BTM API in
 * production). It never invents ids.
 */
export type OutputVariableDefinition = Omit<ProcessingOutputVariable, 'variableId'>;

/**
 * A variable is created once per target/component regardless of config version changes
 * (OUT-002); this repository never creates a duplicate for the same
 * `(processingId, scope, prismSensorId, component)` key.
 */
export interface OutputVariableRepository {
  listByProcessing(processingId: number): Promise<ProcessingOutputVariable[]>;
  /**
   * Idempotently ensures the given variable definitions exist and returns the full mapping with
   * assigned `variableId`s. The caller supplies definitions without ids (audit item 4); calling
   * twice with the same definitions returns the same ids and creates nothing new (OUT-002).
   */
  ensure(definitions: OutputVariableDefinition[]): Promise<ProcessingOutputVariable[]>;
  /** Simulates the production UPSERT on `(variable_id, timestamp)` (OUT-009/010). */
  upsertMeasure(variableId: number, timestampIso: string, value: number): Promise<void>;
}
