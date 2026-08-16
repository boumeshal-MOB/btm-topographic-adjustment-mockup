import type { AnalysisPointSnapshot, AnalysisTrialResult } from '@/domain/analysis/types';
import type { AdjustmentDiagnostic, DiagnosticPoint } from '@/domain/engine/run-input';

export interface PointDeltaRow {
  point: AnalysisPointSnapshot;
  adjusted?: DiagnosticPoint;
  deltaEMm?: number;
  deltaNMm?: number;
  deltaHMm?: number;
  delta3dMm?: number;
}

function pointDisplayPriority(point: AnalysisPointSnapshot): number {
  if (point.role === 'reference' && point.identityState === 'shared') return 0;
  if (point.role === 'reference') return 1;
  if (point.identityState === 'shared') return 2;
  if (point.role === 'station') return 3;
  if (point.role === 'monitoring') return 4;
  return 5;
}

export type PointDisplayGroup =
  | 'sharedReferences'
  | 'references'
  | 'sharedPoints'
  | 'stations'
  | 'monitoring'
  | 'auxiliary';

/**
 * Ordering group for the single points table. Returns a stable key rather than a label so the
 * table can translate it — the ordering itself is a domain decision (shared references, then
 * references, then other shared points, then stations, monitoring and auxiliaries).
 */
export function pointDisplayGroup(point: AnalysisPointSnapshot): PointDisplayGroup {
  if (point.role === 'reference' && point.identityState === 'shared') return 'sharedReferences';
  if (point.role === 'reference') return 'references';
  if (point.identityState === 'shared') return 'sharedPoints';
  if (point.role === 'station') return 'stations';
  if (point.role === 'monitoring') return 'monitoring';
  return 'auxiliary';
}

export function diagnosticWithInitialGeometry(result: AnalysisTrialResult): AdjustmentDiagnostic {
  if (result.diagnostic.points.length > 0) return result.diagnostic;
  const observationsByTarget = new Map<string, Set<string>>();
  for (const observation of result.observations) {
    const stations = observationsByTarget.get(observation.targetEngineName) ?? new Set<string>();
    stations.add(observation.stationEngineName);
    observationsByTarget.set(observation.targetEngineName, stations);
  }
  return {
    ...result.diagnostic,
    engineLabel: `${result.diagnostic.engineLabel} · initial geometry shown because no adjusted solution is available`,
    points: result.points.map((point) => ({
      engineName: point.engineName,
      role: point.role,
      eastingM: point.eastingM,
      northingM: point.northingM,
      heightM: point.heightM,
      sigmaEM: 0,
      sigmaNM: 0,
      sigmaHM: 0,
      ellipseSemiMajorM: 0,
      ellipseSemiMinorM: 0,
      ellipseOrientationDeg: 0,
      observationCount: result.observations.filter((observation) => observation.targetEngineName === point.engineName).length * 3,
      singleRay: point.role !== 'station' && (observationsByTarget.get(point.engineName)?.size ?? 0) <= 1,
    })),
    residuals: result.observations.flatMap((observation) =>
      (['hz', 'vz', 'sd'] as const).map((kind) => ({
        scalarObservationId: `${observation.observationId}:${kind}`,
        observationId: observation.observationId,
        stationEngineName: observation.stationEngineName,
        targetEngineName: observation.targetEngineName,
        kind,
        residual: 0,
        sigma: kind === 'hz'
          ? observation.effectivePrecision.sigmaHzArcSec * Math.PI / (180 * 3600)
          : kind === 'vz'
            ? observation.effectivePrecision.sigmaVzArcSec * Math.PI / (180 * 3600)
            : observation.effectivePrecision.sigmaSdMm / 1000,
        stdResidual: 0,
        normalizedResidual: Number.NaN,
        redundancy: Number.NaN,
      }))),
  };
}

export function pointDeltaRows(result: AnalysisTrialResult): PointDeltaRow[] {
  const adjustedByName = new Map(result.diagnostic.points.map((point) => [point.engineName, point]));
  return result.points.map((point) => {
    const adjusted = adjustedByName.get(point.engineName);
    if (!adjusted) return { point };
    const deltaEMm = (adjusted.eastingM - point.eastingM) * 1000;
    const deltaNMm = (adjusted.northingM - point.northingM) * 1000;
    const deltaHMm = (adjusted.heightM - point.heightM) * 1000;
    return {
      point,
      adjusted,
      deltaEMm,
      deltaNMm,
      deltaHMm,
      delta3dMm: Math.hypot(deltaEMm, deltaNMm, deltaHMm),
    };
  }).sort((left, right) => {
    const priority = pointDisplayPriority(left.point) - pointDisplayPriority(right.point);
    return priority || left.point.engineName.localeCompare(right.point.engineName);
  });
}

export function plainLanguageQuality(diagnostic: AdjustmentDiagnostic): {
  severity: 'success' | 'warning' | 'error';
  title: string;
  explanation: string;
} {
  if (!diagnostic.ok || !diagnostic.converged || diagnostic.rankDeficiency > 0) {
    return {
      severity: 'error',
      title: 'No unique adjusted solution',
      explanation: 'The selected epoch does not contain enough independent geometry or control. Fix missing stations/references before changing weights.',
    };
  }
  if (diagnostic.chiSquareStatus === 'failed') {
    return {
      severity: 'warning',
      title: 'Adjustment computed, quality test failed',
      explanation: 'Inspect the largest residuals and measurement precision. Do not increase sigmas only to force the test to pass.',
    };
  }
  if (diagnostic.chiSquareStatus === 'not-applicable') {
    return {
      severity: 'warning',
      title: 'Coordinates computed without redundancy',
      explanation: 'The geometry has no independent check. Coordinates can be inspected, but χ² cannot prove their quality.',
    };
  }
  return {
    severity: 'success',
    title: 'Adjustment and quality test passed',
    explanation: 'Review displacements, ellipses and exclusions before promoting this trial to a dated configuration version.',
  };
}

/**
 * One editable aspect of a trial, expressed as before → after.
 *
 * Used by the confirmation shown before a run: a surveyor should see exactly what they are about
 * to change, in business terms, rather than trusting that the editor kept up with them.
 */
export interface TrialChange {
  /** Stable key so the interface can translate the label. */
  key: string;
  subject?: string;
  before: string;
  after: string;
}

interface TrialSnapshotLike {
  engine: string;
  excludedScalarObservationIds: string[];
  disabledReferenceKeys: string[];
  weightMultiplier: number;
  useAutoAdjust: boolean;
  observationOverrides: Record<string, unknown>;
  initialCoordinateOverrides: Record<string, unknown>;
  referenceSigmaOverrides: Record<string, unknown>;
  /** Compared as a whole, so its concrete shape does not matter here. */
  adjustmentOverrides: object;
}

function names(record: Record<string, unknown>): string[] {
  return Object.keys(record).sort();
}

/** Differences between the trial on screen and what the editor currently holds. */
export function describeTrialChanges(
  base: TrialSnapshotLike,
  next: TrialSnapshotLike,
): TrialChange[] {
  const changes: TrialChange[] = [];

  if (base.engine !== next.engine) {
    changes.push({ key: 'engine', before: base.engine, after: next.engine });
  }
  if (base.weightMultiplier !== next.weightMultiplier) {
    changes.push({
      key: 'weightMultiplier',
      before: `×${base.weightMultiplier}`,
      after: `×${next.weightMultiplier}`,
    });
  }
  if (base.useAutoAdjust !== next.useAutoAdjust) {
    changes.push({ key: 'autoAdjust', before: String(base.useAutoAdjust), after: String(next.useAutoAdjust) });
  }

  const excludedBefore = new Set(base.excludedScalarObservationIds);
  const excludedAfter = new Set(next.excludedScalarObservationIds);
  for (const id of [...excludedAfter].filter((value) => !excludedBefore.has(value)).sort()) {
    changes.push({ key: 'excluded', subject: id, before: 'included', after: 'excluded' });
  }
  for (const id of [...excludedBefore].filter((value) => !excludedAfter.has(value)).sort()) {
    changes.push({ key: 'excluded', subject: id, before: 'excluded', after: 'included' });
  }

  const freedBefore = new Set(base.disabledReferenceKeys);
  const freedAfter = new Set(next.disabledReferenceKeys);
  for (const name of [...freedAfter].filter((value) => !freedBefore.has(value)).sort()) {
    changes.push({ key: 'reference', subject: name, before: 'constrained', after: 'free' });
  }
  for (const name of [...freedBefore].filter((value) => !freedAfter.has(value)).sort()) {
    changes.push({ key: 'reference', subject: name, before: 'free', after: 'constrained' });
  }

  const overrideGroups = [
    ['observation', base.observationOverrides, next.observationOverrides],
    ['initialCoordinate', base.initialCoordinateOverrides, next.initialCoordinateOverrides],
    ['referenceSigma', base.referenceSigmaOverrides, next.referenceSigmaOverrides],
  ] as const;
  for (const [key, before, after] of overrideGroups) {
    for (const subject of names(after)) {
      const previous = before[subject];
      const current = after[subject];
      if (JSON.stringify(previous) === JSON.stringify(current)) continue;
      changes.push({
        key,
        subject,
        before: previous === undefined ? 'configured value' : JSON.stringify(previous),
        after: JSON.stringify(current),
      });
    }
    for (const subject of names(before).filter((name) => !(name in after))) {
      changes.push({ key, subject, before: JSON.stringify(before[subject]), after: 'configured value' });
    }
  }

  if (JSON.stringify(base.adjustmentOverrides) !== JSON.stringify(next.adjustmentOverrides)) {
    changes.push({
      key: 'adjustment',
      before: JSON.stringify(base.adjustmentOverrides),
      after: JSON.stringify(next.adjustmentOverrides),
    });
  }

  return changes;
}
