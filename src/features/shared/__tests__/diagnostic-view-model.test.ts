import { describe, expect, it } from 'vitest';
import type { DiagnosticPoint, DiagnosticResidual } from '@/domain/engine/run-input';
import {
  groupResidualsByTarget,
  residualConstraintComponent,
  residualDisplayValue,
  residualImpactPercent,
  residualPrecisionDisplayValue,
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
  stdResidual: number,
): DiagnosticResidual => ({
  scalarObservationId: `${observationId}:${kind}`,
  observationId,
  stationEngineName: 'STA',
  targetEngineName,
  kind,
  residual: kind === 'sd' ? 0.001 : Math.PI / (180 * 3600),
  sigma: 1,
  stdResidual,
  normalizedResidual: Number.NaN,
  redundancy: 0.5,
});

describe('diagnostic presentation model', () => {
  it('keeps station and reference labels visible in smart mode and reveals monitoring labels when zoomed', () => {
    const points = [point('STA', 'station'), point('REF', 'reference'), point('P1', 'monitoring', 5)];
    expect([...smartLabelNames(points, { zoom: 1, mode: 'smart' })]).toEqual(['STA', 'REF']);
    expect(smartLabelNames(points, { zoom: 2, mode: 'smart' }).has('P1')).toBe(true);
    expect([...smartLabelNames(points, { zoom: 1, mode: 'none', selectedName: 'P1' })]).toEqual(['P1']);
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
    expect(residualDisplayValue(rows[1]).unit).toBe('″');
    expect(residualDisplayValue(rows[1], 'Gons').unit).toBe('mgon');
    expect(residualDisplayValue(rows[1], 'Gons').value).toBeCloseTo(1 / 3.24, 12);
    expect(residualPrecisionDisplayValue(rows[0])).toEqual({ value: 1000, unit: 'mm' });
    expect(residualImpactPercent(rows[0])).toBe(50);
  });

  it('omits zero-redundancy rows because they have no independently observable residual', () => {
    const uncontrolled = { ...residual('single-ray', 'P1', 'hz', 0), redundancy: 0 };
    expect(groupResidualsByTarget([uncontrolled])).toEqual([]);
  });

  it('keeps a reference sight and its coordinate constraint in one identifiable group', () => {
    const groups = groupResidualsByTarget([
      residual('sight-to-ref', 'REF', 'hz', 3.2),
      { ...residual('constraint:REF.e', 'REF', 'constraint', 2.4), stationEngineName: '' },
    ], { points: [point('REF', 'reference')] });

    expect(groups).toHaveLength(1);
    expect(groups[0].targetRole).toBe('reference');
    expect(groups[0].alertLevel).toBe('significant');
    expect(groups[0].residuals.map((row) => row.kind)).toEqual(['constraint', 'hz']);
  });

  it('keeps constraints E/N/H together before sights ordered Hz/Vz/Sd inside each target block', () => {
    const rows = [
      { ...residual('constraint:REF.h', 'REF', 'constraint', 9), stationEngineName: '' },
      residual('sight-sd', 'REF', 'sd', 9),
      { ...residual('constraint:REF.e', 'REF', 'constraint', 1), stationEngineName: '' },
      residual('sight-vz', 'REF', 'vz', 5),
      { ...residual('constraint:REF.n', 'REF', 'constraint', 5), stationEngineName: '' },
      residual('sight-hz', 'REF', 'hz', 1),
    ];

    const ordered = groupResidualsByTarget(rows)[0].residuals;
    expect(ordered.map((row) => row.observationId)).toEqual([
      'constraint:REF.e',
      'constraint:REF.n',
      'constraint:REF.h',
      'sight-hz',
      'sight-vz',
      'sight-sd',
    ]);
    expect(ordered.slice(0, 3).map(residualConstraintComponent)).toEqual(['e', 'n', 'h']);
  });

  it('filters significant references and offers an explicit name sort', () => {
    const points = [point('REF_2', 'reference'), point('REF_10', 'reference'), point('P1', 'monitoring')];
    const rows = [
      residual('ref-10', 'REF_10', 'sd', 3.1),
      residual('ref-2', 'REF_2', 'sd', 3.4),
      residual('monitoring', 'P1', 'sd', 7),
    ];

    const references = groupResidualsByTarget(rows, {
      points,
      role: 'reference',
      alert: 'significant',
      sort: 'target-asc',
    });
    expect(references.map((group) => group.targetEngineName)).toEqual(['REF_2', 'REF_10']);
  });

  it('sorts stations and references before monitoring points', () => {
    expect(sortDiagnosticPoints([
      point('P2', 'monitoring'),
      point('REF', 'reference'),
      point('STA', 'station'),
    ]).map((item) => item.engineName)).toEqual(['STA', 'REF', 'P2']);
  });
});
