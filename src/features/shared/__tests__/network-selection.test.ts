import { describe, expect, it } from 'vitest';
import { updateNetworkSelections, type NetworkSelection } from '@/features/shared/network-selection';

const point = (engineName: string): NetworkSelection => ({ kind: 'point', engineName });
const sight = (stationEngineName: string, targetEngineName: string): NetworkSelection => ({
  kind: 'sight',
  stationEngineName,
  targetEngineName,
});

describe('network selection gesture', () => {
  it('replaces the selection on a normal click', () => {
    expect(updateNetworkSelections([point('A'), point('B')], point('C'))).toEqual([point('C')]);
  });

  it('adds and removes points with Ctrl+click semantics', () => {
    const selected = updateNetworkSelections([point('A')], point('B'), 'toggle');
    expect(selected).toEqual([point('A'), point('B')]);
    expect(updateNetworkSelections(selected, point('A'), 'toggle')).toEqual([point('B')]);
  });

  it('distinguishes two sight lines by both station and target', () => {
    const first = sight('STA1', 'P1');
    const second = sight('STA2', 'P1');
    expect(updateNetworkSelections([first], second, 'toggle')).toEqual([first, second]);
  });

  it('clears every selected object through the explicit clear action', () => {
    expect(updateNetworkSelections([point('A'), sight('STA1', 'P1')], undefined)).toEqual([]);
  });
});
