import type { ChiSquareStatus } from '@/domain/entities';
import { ARCSEC2RAD, DEG2RAD } from '@/domain/math/geometry';
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
export const DEMO_ENGINE_LABEL = 'Demo solver — not production/certified STAR*NET result';

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
      const sigmaSdM = Math.max(1e-6, o.sigmaSdMm / 1000 + (o.sigmaSdPpm * 1e-6 * o.finalSlopeDistanceM));
      const base = {
        rawObservationId: o.id,
        stationId: o.stationEngineName,
        targetId: o.targetEngineName,
        instrumentHeightM: o.instrumentHeightM,
        targetHeightM: o.targetHeightM,
        protected: o.protected ?? false,
      };
      return [
        { ...base, id: `${o.id}:hz`, kind: 'hz' as const, value: o.hzDeg * DEG2RAD, sigma: Math.max(1e-9, o.sigmaHzArcSec * ARCSEC2RAD) },
        { ...base, id: `${o.id}:vz`, kind: 'vz' as const, value: o.vzDeg * DEG2RAD, sigma: Math.max(1e-9, o.sigmaVzArcSec * ARCSEC2RAD) },
        { ...base, id: `${o.id}:sd`, kind: 'sd' as const, value: o.finalSlopeDistanceM, sigma: sigmaSdM },
      ];
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
    singleRay: p.role !== 'station' && (raysByTarget.get(p.id)?.size ?? 0) <= 1,
  }));
  const residuals: DiagnosticResidual[] = result.residuals.map((r) => ({
    observationId: r.rawObservationId || r.obsId,
    stationEngineName: r.stationId,
    targetEngineName: r.targetId,
    kind: r.kind,
    residual: r.residual,
    sigma: r.sigma,
    stdResidual: r.stdResidual,
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
  return toDiagnostic(input, result, [], []);
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

  const excluded = new Set(input.observations.filter((o) => o.excluded).map((o) => o.id));
  const attempts: AutoAdjustAttempt[] = [];
  const protectedIds = new Set(input.observations.filter((o) => o.protected).map((o) => o.id));

  for (let attempt = 1; attempt <= auto.maxIterations && current.chiSquareStatus === 'failed'; attempt++) {
    // pick the worst scalar residuals above the threshold, non-protected, non-constraint
    const candidates = current.residuals
      .filter((r) => r.kind !== 'constraint' && !protectedIds.has(r.observationId) && !excluded.has(r.observationId))
      .filter((r) => r.stdResidual > auto.maxStandardizedResidual)
      .sort((a, b) => b.stdResidual - a.stdResidual)
      .slice(0, Math.max(1, auto.outliersRemovedPerIteration));
    if (candidates.length === 0) break;
    for (const candidate of candidates) excluded.add(candidate.observationId);
    const trialInput: ResolvedRunInput = {
      ...input,
      observations: input.observations.map((o) => (excluded.has(o.id) ? { ...o, excluded: true } : o)),
    };
    current = runDemoAdjustment(trialInput);
    for (const candidate of candidates) {
      attempts.push({
        attempt,
        excludedObservationId: candidate.observationId,
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
