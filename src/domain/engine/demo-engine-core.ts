import type { ChiSquareStatus } from '@/domain/entities';
import { DEG2RAD, normalizeFace } from '@/domain/math/geometry';
import { effectiveTotalStationSigmas } from '@/domain/math/weights';
import {
  adjustNetwork,
  type AdjustResult,
  type EngineConstraint,
  type EngineObservation,
  type EnginePoint,
} from '@/domain/math/adjust';
import type {
  AdjustmentDiagnostic,
  AutoAdjustAttempt,
  DiagnosticPoint,
  DiagnosticResidual,
  ResolvedRunInput,
} from '@/domain/engine/run-input';

/**
 * Pure demo least-squares core behind the `AdjustmentEngine` gateway. Clearly labelled and
 * never a substitute for STAR*NET Ultimate (DEMO-004); its internal convergence threshold is
 * NOT the STAR*NET `convergeLimit` (ADJ-002) and none of its parameters is ever stored in the
 * STAR*NET configuration model (PROC-007).
 */
export const DEMO_ENGINE_LABEL = 'Scientific preview (Python-parity model) — not a certified STAR*NET result';

/** Internal demo threshold (metres); intentionally distinct from adjustment.convergeLimit (ADJ-002). */
const DEMO_CONVERGENCE_M = 1e-6;

function toEngineSystem(input: ResolvedRunInput) {
  const points: EnginePoint[] = input.points.map((p) => ({
    id: p.engineName,
    e: p.eastingM,
    n: p.northingM,
    h: p.heightM,
    free: p.free,
    role: p.role === 'station' ? 'station' : p.role,
  }));
  const constraints: EngineConstraint[] = input.points.flatMap(
    (p) => p.constraints?.map((c) => ({ pointId: p.engineName, component: c.component, value: c.value, sigma: c.sigmaM })) ?? [],
  );
  const observations: EngineObservation[] = input.observations
    .filter((o) => !o.excluded)
    .flatMap((o) => {
      const normalized = normalizeFace(o.hzDeg * DEG2RAD, o.vzDeg * DEG2RAD);
      const weights = input.adjustment.defaultWeights;
      const slope = o.finalSlopeDistanceM;
      const sigmas = effectiveTotalStationSigmas({
        slopeDistanceM: slope,
        zenithRad: normalized.vzRad,
        directionArcSec: o.sigmaHzArcSec,
        zenithArcSec: o.sigmaVzArcSec,
        distanceMm: o.sigmaSdMm,
        distancePpm: o.sigmaSdPpm,
        instrumentCenteringM: weights.instrumentCenteringM,
        targetCenteringM: weights.targetCenteringM,
        verticalCenteringM: weights.verticalCenteringM,
        edmStdErrorModel: input.adjustment.edmStdErrorModel ?? 'additive',
      });
      const base = {
        rawObservationId: o.id,
        stationId: o.stationEngineName,
        targetId: o.targetEngineName,
        instrumentHeightM: o.instrumentHeightM,
        targetHeightM: o.targetHeightM,
        protected: o.protected ?? false,
      };
      const candidates = [
        { ...base, id: `${o.id}:hz`, kind: 'hz' as const, value: normalized.hzRad, sigma: Math.max(1e-9, sigmas.hzRad) },
        { ...base, id: `${o.id}:vz`, kind: 'vz' as const, value: normalized.vzRad, sigma: Math.max(1e-9, sigmas.vzRad) },
        { ...base, id: `${o.id}:sd`, kind: 'sd' as const, value: slope, sigma: Math.max(1e-6, sigmas.sdM) },
      ];
      return candidates.filter((candidate) => !o.excludedComponents?.includes(candidate.kind));
    });
  return { points, constraints, observations };
}

/** Canonical derivation (audit B-04): dof <= 0 is `not-applicable`, never passed/failed. */
function chiSquareStatusOf(result: AdjustResult): ChiSquareStatus {
  if (result.degreesOfFreedom <= 0) return 'not-applicable';
  return result.chiSquarePassed ? 'passed' : 'failed';
}

function toDiagnostic(
  input: ResolvedRunInput,
  result: AdjustResult,
  autoAdjustAttempts: AutoAdjustAttempt[],
  warnings: string[],
): AdjustmentDiagnostic {
  const status = chiSquareStatusOf(result);
  const raysByTarget = new Map<string, Set<string>>();
  const inputPointByName = new Map(input.points.map((point) => [point.engineName, point]));
  for (const o of input.observations) {
    if (o.excluded) continue;
    const set = raysByTarget.get(o.targetEngineName) ?? new Set<string>();
    set.add(o.stationEngineName);
    raysByTarget.set(o.targetEngineName, set);
  }
  const points: DiagnosticPoint[] = result.points.map((p) => ({
    engineName: p.id,
    role: p.role,
    eastingM: p.e,
    northingM: p.n,
    heightM: p.h,
    sigmaEM: p.sigmaE,
    sigmaNM: p.sigmaN,
    sigmaHM: p.sigmaH,
    ellipseSemiMajorM: p.ellipseSemiMajorM,
    ellipseSemiMinorM: p.ellipseSemiMinorM,
    ellipseOrientationDeg: p.ellipseOrientationDeg,
    observationCount: p.nObservations,
    observedByStations: [...(raysByTarget.get(p.id) ?? [])].sort(),
    identityState: inputPointByName.get(p.id)?.identityState,
    singleRay: p.role !== 'station' && (raysByTarget.get(p.id)?.size ?? 0) <= 1,
  }));
  const residuals: DiagnosticResidual[] = result.residuals.map((r) => ({
    scalarObservationId: r.obsId,
    observationId: r.rawObservationId || r.obsId,
    stationEngineName: r.stationId,
    targetEngineName: r.targetId,
    kind: r.kind,
    residual: r.residual,
    sigma: r.sigma,
    stdResidual: r.stdResidual,
    normalizedResidual: r.normalizedResidual,
    redundancy: r.redundancy,
  }));
  const allWarnings = [...warnings];
  if (status === 'not-applicable') {
    allWarnings.push('Not applicable — no redundancy: dof <= 0, the chi-square test is not interpretable (a-priori sigmas shown).');
  }
  return {
    engineLabel: DEMO_ENGINE_LABEL,
    ok: result.ok,
    failureReason: result.failureReason,
    converged: result.converged,
    iterations: result.iterations,
    observationCount: result.nObservations,
    constraintCount: result.nConstraints,
    unknownCount: result.nUnknowns,
    rank: result.rank,
    rankDeficiency: result.rankDeficiency,
    deficientUnknowns: result.deficientUnknowns,
    degreesOfFreedom: result.degreesOfFreedom,
    chiSquareStatus: status,
    chiSquareLower: result.chiSquareLower,
    chiSquareUpper: result.chiSquareUpper,
    weightedSSR: result.weightedSSR,
    varianceFactor: result.varianceFactor,
    maxStdResidual: result.maxStdResidual,
    points,
    residuals,
    autoAdjustAttempts,
    warnings: allWarnings,
  };
}

/** Single adjustment pass on the resolved input. */
export function runDemoAdjustment(input: ResolvedRunInput): AdjustmentDiagnostic {
  const { points, constraints, observations } = toEngineSystem(input);
  const result = adjustNetwork(observations, points, constraints, {
    convergenceThresholdM: DEMO_CONVERGENCE_M,
    maxIterations: input.adjustment.maximumIterations,
    chiSquareSignificance: input.adjustment.chiSquareSignificancePercent / 100,
    confidenceLevel: input.adjustment.ellipseConfidencePercent / 100,
    errorPropagation: input.adjustment.performErrorPropagation,
    fixedOrientations: input.fixedOrientationsRad
      ? new Map(Object.entries(input.fixedOrientationsRad))
      : undefined,
  });
  return toDiagnostic(input, result, [], [
    `Preview uses straight-line local geometry. STAR*NET applies the configured datum scale (${input.adjustment.scaleFactor}), earth curvature and refraction (${input.adjustment.indexOfRefraction}) in the certified Windows run.`,
  ]);
}

/**
 * Chi-square failure handling with STAR*NET-style Auto Adjust (ADJ-007/008): iteratively
 * exclude the worst non-protected observation above `maxStandardizedResidual` from the TRIAL
 * (never from raw data, DATA-007), within the configured limits. Every attempt is traced.
 * Never runs when the test is not interpretable (audit B-04).
 */
export function runDemoAdjustmentWithAutoAdjust(input: ResolvedRunInput): AdjustmentDiagnostic {
  const auto = input.adjustment.autoAdjust;
  let current = runDemoAdjustment(input);
  if (!auto.enabled || current.chiSquareStatus !== 'failed') return current;

  const excluded = new Set(
    input.observations.flatMap((o) => o.excluded
      ? ([`${o.id}:hz`, `${o.id}:vz`, `${o.id}:sd`] as const)
      : (o.excludedComponents ?? []).map((kind) => `${o.id}:${kind}`)),
  );
  const attempts: AutoAdjustAttempt[] = [];
  const protectedIds = new Set(input.observations.filter((o) => o.protected).flatMap((o) => [
    `${o.id}:hz`, `${o.id}:vz`, `${o.id}:sd`,
  ]));

  for (let attempt = 1; attempt <= auto.maxIterations && current.chiSquareStatus === 'failed'; attempt++) {
    // pick the worst scalar residuals above the threshold, non-protected, non-constraint
    const candidates = current.residuals
      .filter((r) => r.kind !== 'constraint' && !protectedIds.has(r.scalarObservationId) && !excluded.has(r.scalarObservationId))
      .filter((r) => r.stdResidual > auto.maxStandardizedResidual)
      .sort((a, b) => b.stdResidual - a.stdResidual)
      .slice(0, Math.max(1, auto.outliersRemovedPerIteration));
    if (candidates.length === 0) break;
    for (const candidate of candidates) excluded.add(candidate.scalarObservationId);
    const trialInput: ResolvedRunInput = {
      ...input,
      observations: input.observations.map((o) => ({
        ...o,
        excludedComponents: (['hz', 'vz', 'sd'] as const).filter((kind) => excluded.has(`${o.id}:${kind}`)),
      })),
    };
    current = runDemoAdjustment(trialInput);
    for (const candidate of candidates) {
      attempts.push({
        attempt,
        excludedObservationId: candidate.observationId,
        excludedScalarObservationId: candidate.scalarObservationId,
        kind: candidate.kind as 'hz' | 'vz' | 'sd',
        stdResidual: candidate.stdResidual,
        reason: `standardized residual ${candidate.stdResidual.toFixed(2)} > ${auto.maxStandardizedResidual}`,
        chiSquareStatusAfter: current.chiSquareStatus,
      });
    }
    if (current.chiSquareStatus === 'not-applicable') break; // exclusions ate the redundancy
  }
  return { ...current, autoAdjustAttempts: attempts };
}
