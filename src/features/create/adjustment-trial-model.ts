import type { DraftReference, DraftStationConfig, DraftTargetConfig, WizardDraft } from '@/demo/draft';
import type { AdjustmentDiagnostic } from '@/domain/engine/run-input';
import type { ChiSquareStatus, StarNetAdjustmentConfig } from '@/domain/entities';
import { heldReferenceKeys } from '@/features/create/datum-view-model';
import { stationInstrumentPrecision } from '@/demo/station-precision';

/**
 * The Analysis Lab's cycle — change something, recompute, compare — inside the wizard.
 *
 * The lab earned that cycle for a reason: a weight or a constraint cannot be judged on its own, only
 * against what it does to the solution. The wizard used to offer a single epoch test whose result
 * replaced the previous one, so the surveyor had to remember the numbers to compare them, and the
 * change that produced them was already gone.
 *
 * A trial therefore records **both sides**: the configuration slice it ran with, verbatim, and what
 * came out. That makes the comparison honest and the revert exact — restoring a trial restores the
 * numbers that produced it, not an approximation of them.
 */

export interface TrialSnapshot {
  adjustment: StarNetAdjustmentConfig;
  stations: DraftStationConfig[];
  targets: DraftTargetConfig[];
  references: DraftReference[];
  chiSquareFailurePolicy: WizardDraft['chiSquareFailurePolicy'];
}

export interface TrialMetrics {
  engineLabel: string;
  passed: boolean;
  converged: boolean;
  degreesOfFreedom: number;
  chiSquareStatus: ChiSquareStatus;
  varianceFactor: number;
  maxStdResidual: number;
  observationCount: number;
  /** References with a known coordinate and a constraint: what actually holds the network. */
  heldReferences: number;
  /** The project's leading standard errors, so a trial says what it was weighted with. */
  sigmaDistanceMm: number;
  sigmaDirectionArcSec: number;
  /** Sights that restate a precision of their own. */
  overrides: number;
}

export interface AdjustmentTrial {
  id: string;
  label: string;
  slot: string;
  engine: 'preview' | 'starnet';
  metrics: TrialMetrics;
  snapshot: TrialSnapshot;
}

export function trialSnapshot(draft: WizardDraft): TrialSnapshot {
  return {
    adjustment: structuredClone(draft.adjustment),
    stations: structuredClone(draft.stations),
    targets: structuredClone(draft.targets),
    references: structuredClone(draft.initialisation.references),
    chiSquareFailurePolicy: draft.chiSquareFailurePolicy,
  };
}

/**
 * What a trial is worth, read from the diagnostic and from the configuration that produced it.
 *
 * The leading sigmas are taken from the *first* station's instrument rather than from the project
 * weights, because that is now where they live; when stations differ, the overrides count is what
 * says so.
 */
export function trialMetrics(draft: WizardDraft, diagnostic: AdjustmentDiagnostic, blocking: readonly string[]): TrialMetrics {
  const station = draft.stations[0];
  const precision = station ? stationInstrumentPrecision(draft, station) : undefined;
  return {
    engineLabel: diagnostic.engineLabel,
    passed: diagnostic.ok && blocking.length === 0,
    converged: diagnostic.converged,
    degreesOfFreedom: diagnostic.degreesOfFreedom,
    chiSquareStatus: diagnostic.chiSquareStatus,
    varianceFactor: diagnostic.varianceFactor,
    maxStdResidual: diagnostic.maxStdResidual,
    observationCount: diagnostic.observationCount,
    heldReferences: heldReferenceKeys(draft).length,
    sigmaDistanceMm: precision?.distanceByFamily.prism.stdErrMm ?? draft.adjustment.defaultWeights.distanceStdErrM * 1000,
    sigmaDirectionArcSec: precision?.directionArcSec ?? draft.adjustment.defaultWeights.directionArcSec,
    overrides: draft.targets.filter((target) =>
      target.distanceStdErrMm !== undefined
      || target.distancePpm !== undefined
      || target.directionStdErrArcSec !== undefined
      || target.zenithStdErrArcSec !== undefined
      || target.distanceKind !== undefined).length,
  };
}

/** Restoring a trial is restoring exactly the slice it ran with — nothing more, nothing less. */
export function restoreTrial(draft: WizardDraft, trial: AdjustmentTrial): Partial<WizardDraft> {
  return {
    adjustment: structuredClone(trial.snapshot.adjustment),
    stations: structuredClone(trial.snapshot.stations),
    targets: structuredClone(trial.snapshot.targets),
    chiSquareFailurePolicy: trial.snapshot.chiSquareFailurePolicy,
    initialisation: { ...draft.initialisation, references: structuredClone(trial.snapshot.references) },
    // The restored configuration is not the one the last test ran on any more.
    testEpochPassed: false,
  };
}

/** The direction a metric moved between two trials, for the compare column. */
export type TrialTrend = 'better' | 'worse' | 'same';

/** Closer to 1 is better for a variance factor; smaller is better for a standardized residual. */
export function compareTrials(previous: TrialMetrics, current: TrialMetrics): {
  varianceFactor: TrialTrend;
  maxStdResidual: TrialTrend;
} {
  const distance = (value: number) => Math.abs(value - 1);
  const trend = (before: number, after: number, tolerance: number): TrialTrend => {
    if (Math.abs(after - before) <= tolerance) return 'same';
    return after < before ? 'better' : 'worse';
  };
  return {
    varianceFactor: trend(distance(previous.varianceFactor), distance(current.varianceFactor), 0.005),
    maxStdResidual: trend(previous.maxStdResidual, current.maxStdResidual, 0.005),
  };
}
