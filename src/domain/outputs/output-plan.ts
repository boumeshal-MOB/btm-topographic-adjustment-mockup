import type {
  GlobalOutputComponent,
  OutputPolicy,
  StationBinding,
  TargetBinding,
  TargetOutputComponent,
} from '@/domain/entities';

/**
 * Stable output variables (OUT-001..010): variables belong to the processing, are created once
 * per published target/component and per global component, and never depend on the config
 * version (OUT-001/002). This module produces the DEFINITIONS (no variableId — ids are assigned
 * by `OutputVariableRepository.ensure`, audit item 4).
 */
export interface OutputVariableDefinitionPlan {
  scope: 'target' | 'station' | 'global';
  prismSensorId?: number;
  stationId?: number;
  component: TargetOutputComponent | GlobalOutputComponent;
  /** Stable human-readable key used to keep variable identity across versions. */
  key: string;
}

/**
 * Stations are planned alongside the published targets: a station is free during the adjustment — it
 * carries the instrument and is never fixed — so its adjusted position moves from one run to the next
 * exactly like a prism's, and that movement is a series worth publishing. Station variables carry the
 * same nine components and are keyed by `stationId`, which keeps them distinct from a prism sensor id.
 */
export function buildOutputVariablePlan(
  targetBindings: readonly Pick<TargetBinding, 'prismSensorId' | 'publishOutput'>[],
  policy: Pick<OutputPolicy, 'targetComponents' | 'globalComponents'>,
  stationBindings: readonly Pick<StationBinding, 'stationId' | 'stationCode'>[] = [],
): OutputVariableDefinitionPlan[] {
  const plan: OutputVariableDefinitionPlan[] = [];
  const seenSensors = new Set<number>();
  for (const binding of targetBindings) {
    if (!binding.publishOutput || seenSensors.has(binding.prismSensorId)) continue;
    seenSensors.add(binding.prismSensorId);
    for (const component of policy.targetComponents) {
      plan.push({
        scope: 'target',
        prismSensorId: binding.prismSensorId,
        component,
        key: `target:${binding.prismSensorId}:${component}`,
      });
    }
  }
  const seenStations = new Set<number>();
  for (const binding of stationBindings) {
    if (seenStations.has(binding.stationId)) continue;
    seenStations.add(binding.stationId);
    for (const component of policy.targetComponents) {
      plan.push({
        scope: 'station',
        stationId: binding.stationId,
        component,
        key: `station:${binding.stationId}:${component}`,
      });
    }
  }
  for (const component of policy.globalComponents) {
    plan.push({ scope: 'global', component, key: `global:${component}` });
  }
  return plan;
}

/**
 * `Target Availability = observed active output targets / total active output targets × 100`
 * (OUT-006). The denominator is the count of ACTIVE published targets, never the historical
 * total.
 */
export function targetAvailabilityPercent(observedActiveOutputTargets: number, totalActiveOutputTargets: number): number {
  if (totalActiveOutputTargets <= 0) return 0;
  return (observedActiveOutputTargets / totalActiveOutputTargets) * 100;
}

/** `Delta = adjusted − initial coordinate of the version applied at the slot` (OUT-004). */
export function deltaComponent(adjustedM: number, initialOfSlotVersionM: number): number {
  return adjustedM - initialOfSlotVersionM;
}
