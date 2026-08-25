import type { DiagnosticPoint, DiagnosticResidual } from '@/domain/engine/run-input';

/** Pure presentation helpers: scientific engine results remain unchanged and fully traceable. */
export type ResidualKindFilter = 'all' | DiagnosticResidual['kind'];
export type ResidualRoleFilter = 'all' | DiagnosticPoint['role'];
export type ResidualAlertFilter = 'all' | 'suspicious' | 'significant';
export type ResidualSort = 'stdres-desc' | 'impact-desc' | 'target-asc';
export type ResidualAlertLevel = 'within-expected' | 'suspicious' | 'significant' | 'not-evaluable';

/** Review thresholds, not automatic rejection limits. A three-sigma row remains a diagnostic. */
export const RESIDUAL_SUSPICIOUS_THRESHOLD = 2;
export const RESIDUAL_SIGNIFICANT_THRESHOLD = 3;
const MIN_EVALUABLE_REDUNDANCY = 1e-6;

export interface ResidualTargetGroup {
  targetEngineName: string;
  targetRole?: DiagnosticPoint['role'];
  stationEngineNames: string[];
  residuals: DiagnosticResidual[];
  maxStdResidual: number;
  maxImpactPercent: number;
  alertLevel: ResidualAlertLevel;
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
  // "No labels" removes ambient labels, but a selected point must remain identifiable.
  if (options.mode === 'none') return new Set(options.selectedName ? [options.selectedName] : []);
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
  options: {
    kind?: ResidualKindFilter;
    search?: string;
    points?: readonly DiagnosticPoint[];
    role?: ResidualRoleFilter;
    alert?: ResidualAlertFilter;
    sort?: ResidualSort;
  } = {},
): ResidualTargetGroup[] {
  const kind = options.kind ?? 'all';
  const role = options.role ?? 'all';
  const alert = options.alert ?? 'all';
  const sort = options.sort ?? 'stdres-desc';
  const search = (options.search ?? '').trim().toLowerCase();
  const roles = new Map((options.points ?? []).map((point) => [point.engineName, point.role]));
  const filtered = residuals.filter((residual) => {
    if (!isResidualEvaluable(residual)) return false;
    if (kind !== 'all' && residual.kind !== kind) return false;
    if (!search) return true;
    return [
      residual.observationId,
      residual.scalarObservationId,
      residual.stationEngineName,
      residual.targetEngineName,
      residual.kind,
      roles.get(residual.targetEngineName) ?? '',
    ].some((value) => value.toLowerCase().includes(search));
  });

  const groups = new Map<string, DiagnosticResidual[]>();
  for (const residual of filtered) {
    // A weak-coordinate constraint and every sight to the same reference belong together: the
    // pattern across those rows is what lets an operator suspect a moved reference.
    const key = residual.targetEngineName || 'datum constraint';
    const rows = groups.get(key) ?? [];
    rows.push(residual);
    groups.set(key, rows);
  }

  const grouped = [...groups.entries()]
    .map(([key, rows]) => {
      const sorted = [...rows].sort((a, b) => {
        return Math.abs(b.stdResidual) - Math.abs(a.stdResidual)
          || residualImpactPercent(b) - residualImpactPercent(a)
          || a.observationId.localeCompare(b.observationId);
      });
      const stationEngineNames = [...new Set(sorted.map((row) => row.stationEngineName).filter(Boolean))].sort();
      const finiteStdResiduals = sorted.map((row) => Math.abs(row.stdResidual)).filter(Number.isFinite);
      const impacts = sorted.map(residualImpactPercent).filter(Number.isFinite);
      const maxStdResidual = finiteStdResiduals.length > 0 ? Math.max(...finiteStdResiduals) : Number.NaN;
      const alertLevel: ResidualAlertLevel = !Number.isFinite(maxStdResidual)
        ? 'not-evaluable'
        : maxStdResidual >= RESIDUAL_SIGNIFICANT_THRESHOLD
          ? 'significant'
          : maxStdResidual > RESIDUAL_SUSPICIOUS_THRESHOLD
            ? 'suspicious'
            : 'within-expected';
      return {
        targetEngineName: key,
        targetRole: roles.get(key),
        stationEngineNames,
        residuals: sorted,
        maxStdResidual,
        maxImpactPercent: impacts.length > 0 ? Math.max(...impacts) : Number.NaN,
        alertLevel,
      } satisfies ResidualTargetGroup;
    })
    .filter((group) => role === 'all' || group.targetRole === role)
    .filter((group) => {
      if (alert === 'significant') return group.alertLevel === 'significant';
      if (alert === 'suspicious') return group.alertLevel === 'suspicious' || group.alertLevel === 'significant';
      return true;
    });

  return grouped.sort((a, b) => {
    if (sort === 'target-asc') {
      return a.targetEngineName.localeCompare(b.targetEngineName, undefined, { numeric: true });
    }
    if (sort === 'impact-desc') {
      const aImpact = Number.isFinite(a.maxImpactPercent) ? a.maxImpactPercent : -1;
      const bImpact = Number.isFinite(b.maxImpactPercent) ? b.maxImpactPercent : -1;
      return bImpact - aImpact
        || a.targetEngineName.localeCompare(b.targetEngineName, undefined, { numeric: true });
    }
    return b.maxStdResidual - a.maxStdResidual
      || a.targetEngineName.localeCompare(b.targetEngineName, undefined, { numeric: true });
  });
}

export type ResidualDisplayUnit = 'mm' | 'mgon' | '″';

export function residualDisplayValue(
  residual: DiagnosticResidual,
  angleOutputUnits: 'DMS' | 'Gons' = 'DMS',
): { value: number; unit: ResidualDisplayUnit } {
  if (residual.kind === 'sd' || residual.kind === 'constraint') {
    return { value: residual.residual * 1000, unit: 'mm' };
  }
  const arcSeconds = (residual.residual * 180 * 3600) / Math.PI;
  return angleOutputUnits === 'Gons'
    ? { value: arcSeconds / 3.24, unit: 'mgon' }
    : { value: arcSeconds, unit: '″' };
}

/** STAR*NET's StdErr rendered in the same unit as the residual beside it. */
export function residualPrecisionDisplayValue(
  residual: DiagnosticResidual,
  angleOutputUnits: 'DMS' | 'Gons' = 'DMS',
): { value: number; unit: ResidualDisplayUnit } {
  if (residual.kind === 'sd' || residual.kind === 'constraint') {
    return { value: residual.sigma * 1000, unit: 'mm' };
  }
  const arcSeconds = (residual.sigma * 180 * 3600) / Math.PI;
  return angleOutputUnits === 'Gons'
    ? { value: arcSeconds / 3.24, unit: 'mgon' }
    : { value: arcSeconds, unit: '″' };
}

/** Percentage of a potential observation error transferred to the adjusted solution: 100 h, h = 1 - r. */
export function residualImpactPercent(residual: DiagnosticResidual): number {
  if (!Number.isFinite(residual.redundancy)) return Number.NaN;
  return Math.min(100, Math.max(0, (1 - residual.redundancy) * 100));
}

/** A zero-redundancy row is exactly absorbed by the solution and has no residual to diagnose. */
export function isResidualEvaluable(residual: DiagnosticResidual): boolean {
  return !Number.isFinite(residual.redundancy) || residual.redundancy > MIN_EVALUABLE_REDUNDANCY;
}
