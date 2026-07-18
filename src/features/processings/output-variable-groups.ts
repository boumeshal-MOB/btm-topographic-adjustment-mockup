import type { GlobalOutputComponent, TargetOutputComponent } from '@/domain/entities';
import type { StoredVersion, VariableSeries } from '@/features/shared/types';

export type OutputAxis = 'x' | 'y' | 'z';
export type TargetOutputFamilyKey = 'adjusted' | 'delta' | 'sigma';

export interface TargetOutputFamily {
  key: TargetOutputFamilyKey;
  label: string;
  description: string;
  unit: 'm';
  components: Partial<Record<OutputAxis, VariableSeries>>;
}

export interface TargetOutputGroup {
  sensorId: number;
  label: string;
  engineName?: string;
  rawTargetName?: string;
  variables: VariableSeries[];
  families: TargetOutputFamily[];
  latestTimestamp?: string;
  populatedComponents: number;
  totalSamples: number;
}

export interface GlobalOutputGroup {
  key: 'quality' | 'availability' | 'publication';
  label: string;
  variables: VariableSeries[];
}

const targetFamilyMeta: Record<TargetOutputFamilyKey, Omit<TargetOutputFamily, 'components'>> = {
  adjusted: {
    key: 'adjusted',
    label: 'Adjusted coordinates',
    description: 'Final adjusted position for the output slot.',
    unit: 'm',
  },
  delta: {
    key: 'delta',
    label: 'Displacement',
    description: 'Adjusted coordinate minus the initial coordinate of the configuration valid at the slot.',
    unit: 'm',
  },
  sigma: {
    key: 'sigma',
    label: 'Coordinate uncertainty',
    description: 'A-posteriori component uncertainty published with the adjusted point.',
    unit: 'm',
  },
};

const targetFamilyOrder: TargetOutputFamilyKey[] = ['adjusted', 'delta', 'sigma'];
const axisOrder: OutputAxis[] = ['x', 'y', 'z'];

function parseTargetComponent(component: TargetOutputComponent): { family: TargetOutputFamilyKey; axis: OutputAxis } {
  const [family, axis] = component.split('-') as [TargetOutputFamilyKey, OutputAxis];
  return { family, axis };
}

function latestTimestamp(variables: readonly VariableSeries[]): string | undefined {
  return variables
    .map((variable) => variable.series.at(-1)?.timestamp)
    .filter((value): value is string => value !== undefined)
    .sort()
    .at(-1);
}

function targetNamesBySensor(versions: readonly StoredVersion[]): Map<number, { engineName: string; rawTargetName: string }> {
  const result = new Map<number, { engineName: string; rawTargetName: string }>();
  const ordered = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
  for (const version of ordered) {
    for (const binding of version.targetBindings) {
      if (!result.has(binding.prismSensorId)) {
        result.set(binding.prismSensorId, {
          engineName: binding.engineName,
          rawTargetName: binding.rawTargetName,
        });
      }
    }
  }
  return result;
}

export function groupTargetOutputVariables(
  variables: readonly VariableSeries[],
  versions: readonly StoredVersion[],
): TargetOutputGroup[] {
  const names = targetNamesBySensor(versions);
  const bySensor = new Map<number, VariableSeries[]>();
  for (const variable of variables.filter((item) => item.scope === 'target' && item.prismSensorId !== undefined)) {
    const rows = bySensor.get(variable.prismSensorId!) ?? [];
    rows.push(variable);
    bySensor.set(variable.prismSensorId!, rows);
  }

  return [...bySensor.entries()]
    .map(([sensorId, rows]) => {
      const identity = names.get(sensorId);
      const components = new Map<TargetOutputFamilyKey, Partial<Record<OutputAxis, VariableSeries>>>();
      for (const variable of rows) {
        const { family, axis } = parseTargetComponent(variable.component as TargetOutputComponent);
        const familyComponents = components.get(family) ?? {};
        familyComponents[axis] = variable;
        components.set(family, familyComponents);
      }
      const families = targetFamilyOrder.map((family) => ({
        ...targetFamilyMeta[family],
        components: components.get(family) ?? {},
      }));
      const populatedComponents = rows.filter((row) => row.series.length > 0).length;
      return {
        sensorId,
        label: identity?.engineName ?? identity?.rawTargetName ?? `Target ${sensorId}`,
        engineName: identity?.engineName,
        rawTargetName: identity?.rawTargetName,
        variables: [...rows].sort((a, b) => {
          const aParsed = parseTargetComponent(a.component as TargetOutputComponent);
          const bParsed = parseTargetComponent(b.component as TargetOutputComponent);
          return targetFamilyOrder.indexOf(aParsed.family) - targetFamilyOrder.indexOf(bParsed.family)
            || axisOrder.indexOf(aParsed.axis) - axisOrder.indexOf(bParsed.axis);
        }),
        families,
        latestTimestamp: latestTimestamp(rows),
        populatedComponents,
        totalSamples: rows.reduce((sum, row) => sum + row.series.length, 0),
      } satisfies TargetOutputGroup;
    })
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

const globalFamilyByComponent: Record<GlobalOutputComponent, GlobalOutputGroup['key']> = {
  'chi2-passed': 'quality',
  'variance-factor': 'quality',
  'quality-code': 'quality',
  'references-available': 'availability',
  'target-availability': 'availability',
  'provisional-flag': 'publication',
};

const globalLabels: Record<GlobalOutputGroup['key'], string> = {
  quality: 'Adjustment quality',
  availability: 'Network availability',
  publication: 'Publication state',
};

export function groupGlobalOutputVariables(variables: readonly VariableSeries[]): GlobalOutputGroup[] {
  const groups = new Map<GlobalOutputGroup['key'], VariableSeries[]>();
  for (const variable of variables.filter((item) => item.scope === 'global')) {
    const key = globalFamilyByComponent[variable.component as GlobalOutputComponent] ?? 'quality';
    const rows = groups.get(key) ?? [];
    rows.push(variable);
    groups.set(key, rows);
  }
  const order: GlobalOutputGroup['key'][] = ['quality', 'availability', 'publication'];
  return order
    .filter((key) => groups.has(key))
    .map((key) => ({
      key,
      label: globalLabels[key],
      variables: [...(groups.get(key) ?? [])].sort((a, b) => a.component.localeCompare(b.component)),
    }));
}
