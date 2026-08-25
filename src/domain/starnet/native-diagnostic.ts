import type { AnalysisPointSnapshot, AnalysisTrialResult } from '@/domain/analysis/types';
import type { ChiSquareStatus } from '@/domain/entities';
import type { AdjustmentDiagnostic, DiagnosticResidual } from '@/domain/engine/run-input';
import {
  parseStarNetNativeOutputs,
  type StarNetNativeResidual,
} from '@/domain/starnet/native-output-parser';
import type { StarNetVmResult } from '@/domain/starnet/vm-bridge';

const ARC_SECONDS_TO_RADIANS = Math.PI / (180 * 3600);

function canonicalChiSquare(
  native: ReturnType<typeof parseStarNetNativeOutputs>,
  degreesOfFreedom: number,
): ChiSquareStatus {
  if (degreesOfFreedom <= 0) return 'not-applicable';
  if (native.chiSquareStatus === 'passed') return 'passed';
  return 'failed';
}

function pointMatch(points: readonly AnalysisPointSnapshot[], value: string): AnalysisPointSnapshot | undefined {
  const exact = points.find((point) => point.engineName === value);
  if (exact) return exact;
  // STAR*NET's default listing can truncate long names. Only accept an unambiguous prefix.
  const candidates = points.filter((point) => point.engineName.startsWith(value) || value.startsWith(point.engineName));
  return candidates.length === 1 ? candidates[0] : undefined;
}

function residualKind(kind: StarNetNativeResidual['kind']): DiagnosticResidual['kind'] {
  if (kind === 'distance') return 'sd';
  if (kind === 'zenith') return 'vz';
  return 'hz';
}

function diagnosticResidual(
  native: StarNetNativeResidual,
  index: number,
  points: readonly AnalysisPointSnapshot[],
  mathematicalResidual?: DiagnosticResidual,
): DiagnosticResidual {
  const kind = residualKind(native.kind);
  const station = pointMatch(points, native.from);
  const target = pointMatch(points, native.to);
  const angular = kind !== 'sd';
  const residual = angular ? native.residual * ARC_SECONDS_TO_RADIANS : native.residual;
  const sigma = angular ? native.standardError * ARC_SECONDS_TO_RADIANS : native.standardError;
  const scalarObservationId = `starnet:${native.from}:${native.to}:${kind}:${index}`;
  return {
    scalarObservationId,
    observationId: scalarObservationId,
    stationEngineName: station?.engineName ?? native.from,
    targetEngineName: target?.engineName ?? native.to,
    kind,
    residual,
    sigma,
    stdResidual: Math.abs(native.standardizedResidual),
    normalizedResidual: Number.NaN,
    // STAR*NET supplies Residual/StdErr/StdRes. The BTM mathematical engine supplies the
    // observation leverage through r, so the shared UI can display impact h = 1 - r.
    redundancy: mathematicalResidual?.redundancy ?? Number.NaN,
  };
}

function residualKey(station: string, target: string, kind: DiagnosticResidual['kind']): string {
  return `${station}\u0000${target}\u0000${kind}`;
}

/**
 * Converts one licensed native result to the diagnostic contract already consumed by the map and
 * tables. Native statistics remain untouched; per-observation impact comes from the mathematical
 * preparation of the same network and is never attributed to STAR*NET.
 */
export function starNetResultToDiagnostic(
  result: StarNetVmResult,
  prepared: Pick<AnalysisTrialResult, 'points' | 'observations'>,
  coordinateOrder: 'EN' | 'NE' = 'EN',
  mathematicalResiduals: readonly DiagnosticResidual[] = [],
): AdjustmentDiagnostic {
  const native = parseStarNetNativeOutputs(
    result.outputFiles,
    `${result.console.stdout}\n${result.console.stderr}`,
    coordinateOrder,
  );
  const listing = native.listing;
  const observationsByPoint = new Map<string, Set<string>>();
  for (const observation of prepared.observations) {
    const stations = observationsByPoint.get(observation.targetEngineName) ?? new Set<string>();
    stations.add(observation.stationEngineName);
    observationsByPoint.set(observation.targetEngineName, stations);
  }
  const points = native.coordinates
    .filter((coordinate) => !coordinate.engineName.startsWith('BTMORI'))
    .map((coordinate) => {
      const source = pointMatch(prepared.points, coordinate.engineName);
      const engineName = source?.engineName ?? coordinate.engineName;
      const stationCount = observationsByPoint.get(engineName)?.size ?? 0;
      return {
        engineName,
        role: source?.role ?? 'auxiliary' as const,
        eastingM: coordinate.eastingM,
        northingM: coordinate.northingM,
        heightM: coordinate.heightM,
        sigmaEM: coordinate.sigmaEM ?? 0,
        sigmaNM: coordinate.sigmaNM ?? 0,
        sigmaHM: coordinate.sigmaHM ?? 0,
        ellipseSemiMajorM: coordinate.ellipseSemiMajorM ?? 0,
        ellipseSemiMinorM: coordinate.ellipseSemiMinorM ?? 0,
        ellipseOrientationDeg: coordinate.ellipseAzimuthDeg ?? 0,
        observationCount: prepared.observations.filter((observation) => observation.targetEngineName === engineName).length * 3,
        observedByStations: source?.observedByStations ?? [...(observationsByPoint.get(engineName) ?? [])].sort(),
        identityState: source?.identityState,
        singleRay: source?.role !== 'station' && stationCount <= 1,
      };
    });
  const mathematicalQueues = new Map<string, DiagnosticResidual[]>();
  for (const residual of mathematicalResiduals) {
    if (residual.kind === 'constraint') continue;
    const key = residualKey(residual.stationEngineName, residual.targetEngineName, residual.kind);
    const queue = mathematicalQueues.get(key) ?? [];
    queue.push(residual);
    mathematicalQueues.set(key, queue);
  }
  let matchedImpacts = 0;
  const residuals = native.residuals.map((residual, index) => {
    const kind = residualKind(residual.kind);
    const station = pointMatch(prepared.points, residual.from)?.engineName ?? residual.from;
    const target = pointMatch(prepared.points, residual.to)?.engineName ?? residual.to;
    const mathematical = mathematicalQueues.get(residualKey(station, target, kind))?.shift();
    if (mathematical && Number.isFinite(mathematical.redundancy)) matchedImpacts += 1;
    return diagnosticResidual(residual, index, prepared.points, mathematical);
  });
  const unknownCount = listing?.unknownCount ?? 0;
  const degreesOfFreedom = listing?.degreesOfFreedom ?? 0;
  const constraintCount = prepared.points.reduce(
    (count, point) => count + (point.fixed ? 3 : point.constraints.filter((constraint) => constraint.mode !== 'free').length),
    0,
  );
  const rank = native.completed && native.converged ? unknownCount : 0;
  const chiSquareStatus = canonicalChiSquare(native, degreesOfFreedom);
  const warnings = [...native.warnings];
  if (native.chiSquareStatus === 'not-found' && degreesOfFreedom > 0) {
    warnings.push('STAR*NET did not expose a readable chi-square outcome in the returned native files.');
  }
  if (listing?.coordinates.some((coordinate) => coordinate.sigmaEM === undefined)) {
    warnings.push('Some STAR*NET coordinate uncertainties were not present in the returned listing/dump.');
  }
  if (matchedImpacts < residuals.length) {
    warnings.push(`Potential impact could not be matched for ${residuals.length - matchedImpacts} STAR*NET residual(s).`);
  }
  const ok = result.status === 'succeeded' && native.completed && native.converged && native.errors.length === 0;
  return {
    engineLabel: `STAR*NET 14 Ultimate — native Windows result${result.starNet.fileVersion ? ` v${result.starNet.fileVersion}` : ''}`,
    ok,
    failureReason: ok ? undefined : result.error ?? native.errors[0] ?? 'STAR*NET did not complete a converged adjustment.',
    converged: native.converged,
    iterations: listing?.iterations ?? 0,
    observationCount: listing?.observationCount ?? prepared.observations.length * 3,
    constraintCount,
    unknownCount,
    rank,
    rankDeficiency: Math.max(0, unknownCount - rank),
    deficientUnknowns: [],
    degreesOfFreedom,
    chiSquareStatus,
    chiSquareLower: Number.NaN,
    chiSquareUpper: Number.NaN,
    weightedSSR: listing?.weightedSsr ?? Number.NaN,
    varianceFactor: listing?.varianceFactor ?? Number.NaN,
    maxStdResidual: residuals.reduce((maximum, residual) => Math.max(maximum, residual.stdResidual), 0),
    points,
    residuals,
    autoAdjustAttempts: [],
    warnings: [...new Set([...warnings, ...native.errors])],
  };
}
