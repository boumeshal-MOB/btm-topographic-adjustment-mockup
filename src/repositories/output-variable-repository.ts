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
  /**
   * Replaces the final state of a `(variable_id, timestamp)` key — a recalculation always fully
   * replaces the previous state, never merges with it (OUT-009/010; audit item 1 of this pass).
   *
   * - `value` a finite number: UPSERT that value at the key (OUT-009).
   * - `value: null`: CLEAR/DELETE any existing measure at that key instead of writing one. This
   *   is how a recalculation must handle a `not-applicable` chi-square outcome
   *   (`chi2PassedOutputValue('not-applicable') === null`): if a prior run published
   *   `chi2-passed = 1` or `0` for this slot and the new run is `not-applicable`, no stale 1/0
   *   may survive. Clearing the key is still a replace of the slot's final state, not the
   *   creation of a new variable or a concurrent value (OUT-010) — the key's state simply
   *   becomes "no value", matching the `not-applicable` diagnostic that is separately recorded
   *   on the run summary (`AdjustmentRunSummary.chiSquareStatus`), never silently upgraded to
   *   `passed` or `failed`.
   */
  replaceMeasure(variableId: number, timestampIso: string, value: number | null): Promise<void>;
}
