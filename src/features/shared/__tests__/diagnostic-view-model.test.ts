import { describe, expect, it } from 'vitest';
import type { DiagnosticPoint, DiagnosticResidual } from '@/domain/engine/run-input';
import {
  groupResidualsByTarget,
  residualDisplayValue,
  smartLabelNames,
  sortDiagnosticPoints,
} from '@/features/shared/diagnostic-view-model';

const point = (engineName: string, role: DiagnosticPoint['role'], observationCount = 1): DiagnosticPoint => ({
  engineName,
  role,
  eastingM: 0,
  northingM: 0,
  heightM: 0,
  sigmaEM: 0.001,
  sigmaNM: 0.001,
  sigmaHM: 0.001,
  ellipseSemiMajorM: 0.001,
  ellipseSemiMinorM: 0.0005,
  ellipseOrientationDeg: 0,
  observationCount,
  singleRay: false,
});

const residual = (
  observationId: string,
  targetEngineName: string,
  kind: DiagnosticResidual['kind'],
  normalizedResidual: number,
): DiagnosticResidual => ({
  scalarObservationId: `${observationId}:${kind}`,
  observationId,
  stationEngineName: 'STA',
  targetEngineName,
  kind,
  residual: kind === 'sd' ? 0.001 : Math.PI / (180 * 3600),
  sigma: 1,
  stdResidual: normalizedResidual / 2,
  normalizedResidual,
  redundancy: 0.5,
});

describe('diagnostic presentation model', () => {
  it('keeps station and reference labels visible in smart mode and reveals monitoring labels when zoomed', () => {
    const points = [point('STA', 'station'), point('REF', 'reference'), point('P1', 'monitoring', 5)];
    expect([...smartLabelNames(points, { zoom: 1, mode: 'smart' })]).toEqual(['STA', 'REF']);
    expect(smartLabelNames(points, { zoom: 2, mode: 'smart' }).has('P1')).toBe(true);
  });

  it('groups every residual by target without truncating and sorts groups by severity', () => {
    const groups = groupResidualsByTarget([
      residual('o1', 'P1', 'sd', 2),
      residual('o2', 'P1', 'hz', 5),
      residual('o3', 'P2', 'vz', 9),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].targetEngineName).toBe('P2');
    expect(groups[1].residuals).toHaveLength(2);
  });

  it('supports type/search filters and keeps physical units explicit', () => {
    const rows = [residual('distance-1', 'P1', 'sd', 2), residual('angle-1', 'P1', 'hz', 2)];
    expect(groupResidualsByTarget(rows, { kind: 'sd', search: 'distance' })[0].residuals).toHaveLength(1);
    expect(residualDisplayValue(rows[0])).toEqual({ value: 1, unit: 'mm' });
    expect(residualDisplayValue(rows[1]).unit).toBe('arcsec');
  });

  it('sorts stations and references before monitoring points', () => {
    expect(sortDiagnosticPoints([
      point('P2', 'monitoring'),
      point('REF', 'reference'),
      point('STA', 'station'),
    ]).map((item) => item.engineName)).toEqual(['STA', 'REF', 'P2']);
  });
});
