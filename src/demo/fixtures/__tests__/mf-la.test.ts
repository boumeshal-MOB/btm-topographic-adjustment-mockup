import { describe, expect, it } from 'vitest';
import manifest from '@/demo/fixtures/mf-la.generated/manifest.json';
import { demoCatalogue } from '@/demo/catalogue';
import {
  localFrNetworkFixtures,
  reduceMfLaPair,
  type GeneratedTargetPair,
} from '@/demo/local-fr-network';

describe('MF-LA generated field fixture', () => {
  it('preserves every Campbell source row and target position', () => {
    expect(manifest.rowsPreserved).toBe(true);
    expect(manifest.stations.map((station) => ({
      stationCode: station.stationCode,
      rowCount: station.rowCount,
      targetCount: station.targetCount,
    }))).toEqual([
      { stationCode: 'MF_LA_STA1', rowCount: 279, targetCount: 130 },
      { stationCode: 'MF_LA_STA2', rowCount: 280, targetCount: 122 },
    ]);
  });

  it('reduces a valid gon Face I/Face II pair and converts the result to degrees', () => {
    expect(reduceMfLaPair([10, 100, 50, 210, 300, 50])).toEqual({ hzDeg: 9, vzDeg: 90, sdM: 50 });
  });

  it('uses a circular horizontal mean across the 0/400 gon boundary', () => {
    const reduced = reduceMfLaPair([399.99, 100, 25, 200.01, 300, 25]);
    expect(reduced?.hzDeg).toBeCloseTo(0, 8);
  });

  it.each([
    [[null, 100, 50, 210, 300, 50]],
    [[10, 100, 50, null, 300, 50]],
    [[10, 100, 0, 210, 300, 50]],
    [[10, 201, 50, 210, 300, 50]],
  ] as const)('blocks the complete target observation when one component is invalid', (pair) => {
    expect(reduceMfLaPair([...pair] as GeneratedTargetPair)).toBeUndefined();
  });

  it('hydrates both stations with real reduced observations', () => {
    const fixtures = localFrNetworkFixtures();
    expect(fixtures.map((fixture) => fixture.stationCode)).toEqual(['MF_LA_STA1', 'MF_LA_STA2']);
    for (const fixture of fixtures) {
      expect(fixture.observations.length).toBeGreaterThan(30_000);
      expect(fixture.environment.length).toBeGreaterThan(250);
      expect(fixture.blockedObservationCount).toBeGreaterThan(0);
    }
  });

  it('keeps every configured prism in the station catalogue even when all its pairs are blocked', () => {
    const catalogue = demoCatalogue();
    expect(catalogue.stations.find((station) => station.stationCode === 'MF_LA_STA1')?.targetCount).toBe(130);
    expect(catalogue.stations.find((station) => station.stationCode === 'MF_LA_STA2')?.targetCount).toBe(122);
    expect(catalogue.targets.filter((target) => target.stationCode === 'MF_LA_STA1')).toHaveLength(130);
    expect(catalogue.targets.filter((target) => target.stationCode === 'MF_LA_STA2')).toHaveLength(122);
  });
});
