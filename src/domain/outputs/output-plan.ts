import type {
  GlobalOutputComponent,
  OutputPolicy,
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
  scope: 'target' | 'global';
  prismSensorId?: number;
  component: TargetOutputComponent | GlobalOutputComponent;
  /** Stable human-readable key used to keep variable identity across versions. */
  key: string;
}

export function buildOutputVariablePlan(
  targetBindings: readonly Pick<TargetBinding, 'prismSensorId' | 'publishOutput'>[],
  policy: Pick<OutputPolicy, 'targetComponents' | 'globalComponents'>,
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
