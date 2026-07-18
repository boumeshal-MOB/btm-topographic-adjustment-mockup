import { describe, expect, it } from 'vitest';
import type { StoredVersion, VariableSeries } from '@/features/shared/types';
import {
  groupGlobalOutputVariables,
  groupTargetOutputVariables,
} from '@/features/processings/output-variable-groups';

const targetVariable = (
  variableId: number,
  sensorId: number,
  component: VariableSeries['component'],
  value?: number,
): VariableSeries => ({
  processingId: 1,
  variableId,
  scope: 'target',
  prismSensorId: sensorId,
  component,
  key: `target:${sensorId}:${component}`,
  series: value === undefined ? [] : [{ timestamp: '2026-07-18T12:00:00.000Z', value }],
});

const globalVariable = (variableId: number, component: VariableSeries['component']): VariableSeries => ({
  processingId: 1,
  variableId,
  scope: 'global',
  component,
  key: `global:${component}`,
  series: [{ timestamp: '2026-07-18T12:00:00.000Z', value: 1 }],
});

const versions = [{
  versionNumber: 2,
  targetBindings: [{ prismSensorId: 1018, engineName: 'L_ANL1100_369', rawTargetName: 'L_ANL1100_369' }],
}] as StoredVersion[];

describe('output variable grouping', () => {
  it('groups target components by target and scientific family', () => {
    const groups = groupTargetOutputVariables([
      targetVariable(1, 1018, 'adjusted-x', 1),
      targetVariable(2, 1018, 'adjusted-y', 2),
      targetVariable(3, 1018, 'delta-x', 0.001),
      targetVariable(4, 1018, 'sigma-z'),
    ], versions);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('L_ANL1100_369');
    expect(groups[0].families.find((family) => family.key === 'adjusted')?.components.x?.variableId).toBe(1);
    expect(groups[0].families.find((family) => family.key === 'delta')?.components.x?.variableId).toBe(3);
    expect(groups[0].populatedComponents).toBe(3);
  });

  it('keeps targets separate even when component names are identical', () => {
    const groups = groupTargetOutputVariables([
      targetVariable(1, 1018, 'adjusted-x', 1),
      targetVariable(2, 2020, 'adjusted-x', 2),
    ], versions);
    expect(groups.map((group) => group.sensorId)).toEqual([1018, 2020]);
  });

  it('groups global variables into quality, availability and publication families', () => {
    const groups = groupGlobalOutputVariables([
      globalVariable(1, 'variance-factor'),
      globalVariable(2, 'target-availability'),
      globalVariable(3, 'provisional-flag'),
    ]);
    expect(groups.map((group) => group.key)).toEqual(['quality', 'availability', 'publication']);
  });
});
