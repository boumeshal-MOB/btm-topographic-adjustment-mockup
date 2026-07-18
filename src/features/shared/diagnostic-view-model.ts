import type { DiagnosticPoint, DiagnosticResidual } from '@/domain/engine/run-input';

/** Pure presentation helpers: scientific engine results remain unchanged and fully traceable. */
export type ResidualKindFilter = 'all' | DiagnosticResidual['kind'];

export interface ResidualTargetGroup {
  targetEngineName: string;
  stationEngineNames: string[];
  residuals: DiagnosticResidual[];
  maxStarNetResidual: number;
  maxNormalisedResidual: number;
  meanRedundancy: number;
}

const roleOrder: Record<DiagnosticPoint['role'], number> = {
  station: 0,
  reference: 1,
  monitoring: 2,
  auxiliary: 3,
};

export function sortDiagnosticPoints(points: readonly DiagnosticPoint[]): DiagnosticPoint[] {
  return [...points].sort((a, b) => {
    const roleDelta = (roleOrder[a.role] ?? 99) - (roleOrder[b.role] ?? 99);
    if (roleDelta !== 0) return roleDelta;
    if (a.singleRay !== b.singleRay) return a.singleRay ? 1 : -1;
    return a.engineName.localeCompare(b.engineName, undefined, { numeric: true });
  });
}

export function smartLabelNames(
  points: readonly DiagnosticPoint[],
  options: {
    zoom: number;
    selectedName?: string;
    hoveredName?: string;
    mode: 'smart' | 'all' | 'none';
  },
): Set<string> {
  if (options.mode === 'none') return new Set();
  if (options.mode === 'all') return new Set(points.map((point) => point.engineName));

  const labels = new Set<string>();
  for (const point of points) {
    if (point.role === 'station' || point.role === 'reference') labels.add(point.engineName);
  }
  if (options.selectedName) labels.add(options.selectedName);
  if (options.hoveredName) labels.add(options.hoveredName);

  if (options.zoom >= 1.55) {
    const monitoring = points
      .filter((point) => point.role === 'monitoring' || point.role === 'auxiliary')
      .sort((a, b) => b.observationCount - a.observationCount || a.engineName.localeCompare(b.engineName));
    const limit = options.zoom >= 2.6 ? monitoring.length : Math.min(18, monitoring.length);
    for (const point of monitoring.slice(0, limit)) labels.add(point.engineName);
  }
  return labels;
}

export function groupResidualsByTarget(
  residuals: readonly DiagnosticResidual[],
  options: { kind?: ResidualKindFilter; search?: string } = {},
): ResidualTargetGroup[] {
  const kind = options.kind ?? 'all';
  const search = (options.search ?? '').trim().toLowerCase();
  const filtered = residuals.filter((residual) => {
    if (kind !== 'all' && residual.kind !== kind) return false;
    if (!search) return true;
    return [
      residual.observationId,
      residual.scalarObservationId,
      residual.stationEngineName,
      residual.targetEngineName,
      residual.kind,
    ].some((value) => value.toLowerCase().includes(search));
  });

  const groups = new Map<string, DiagnosticResidual[]>();
  for (const residual of filtered) {
    const key = residual.kind === 'constraint'
      ? `constraint:${residual.targetEngineName}`
      : residual.targetEngineName;
    const rows = groups.get(key) ?? [];
    rows.push(residual);
    groups.set(key, rows);
  }

  return [...groups.entries()]
    .map(([key, rows]) => {
      const sorted = [...rows].sort((a, b) => {
        const aScore = Number.isFinite(a.normalizedResidual) ? a.normalizedResidual : a.stdResidual;
        const bScore = Number.isFinite(b.normalizedResidual) ? b.normalizedResidual : b.stdResidual;
        return bScore - aScore || a.observationId.localeCompare(b.observationId);
      });
      const stationEngineNames = [...new Set(sorted.map((row) => row.stationEngineName).filter(Boolean))].sort();
      const finiteNormalised = sorted.map((row) => row.normalizedResidual).filter(Number.isFinite);
      const redundancies = sorted.map((row) => row.redundancy).filter(Number.isFinite);
      return {
        targetEngineName: key.startsWith('constraint:') ? key.slice('constraint:'.length) : key,
        stationEngineNames,
        residuals: sorted,
        maxStarNetResidual: Math.max(0, ...sorted.map((row) => Math.abs(row.stdResidual))),
        maxNormalisedResidual: finiteNormalised.length > 0 ? Math.max(...finiteNormalised.map(Math.abs)) : Number.NaN,
        meanRedundancy: redundancies.length > 0
          ? redundancies.reduce((sum, value) => sum + value, 0) / redundancies.length
          : Number.NaN,
      } satisfies ResidualTargetGroup;
    })
    .sort((a, b) => {
      const aScore = Number.isFinite(a.maxNormalisedResidual) ? a.maxNormalisedResidual : a.maxStarNetResidual;
      const bScore = Number.isFinite(b.maxNormalisedResidual) ? b.maxNormalisedResidual : b.maxStarNetResidual;
      return bScore - aScore || a.targetEngineName.localeCompare(b.targetEngineName, undefined, { numeric: true });
    });
}

export function residualDisplayValue(residual: DiagnosticResidual): { value: number; unit: 'mm' | 'arcsec' } {
  if (residual.kind === 'sd' || residual.kind === 'constraint') {
    return { value: residual.residual * 1000, unit: 'mm' };
  }
  return { value: (residual.residual * 180 * 3600) / Math.PI, unit: 'arcsec' };
}
