import type { ChiSquareStatus } from '@/domain/entities';

/**
 * `ChiSquareStatus` is the canonical authority for a run's chi-square outcome (audit item 5).
 * These pure helpers derive every dependent value from it, so no contradictory combination can
 * exist (there is no independent `chi2Passed` boolean to disagree with the status).
 */

/**
 * Value published to the global `chi2-passed` output variable (OUT-005), derived from the
 * canonical status:
 * - `passed`         -> 1
 * - `failed`         -> 0
 * - `not-applicable` -> null: with `dof <= 0` the test is not interpretable, so NO fabricated
 *   1/0 is published (audit B-04/item 5). The absence is reflected by target availability and
 *   the run's `not-applicable` status, never by a made-up pass/fail.
 */
export function chi2PassedOutputValue(status: ChiSquareStatus): 1 | 0 | null {
  switch (status) {
    case 'passed':
      return 1;
    case 'failed':
      return 0;
    case 'not-applicable':
      return null;
  }
}

/** True only for a genuine pass; `not-applicable` is never a pass. */
export function isChiSquarePass(status: ChiSquareStatus): boolean {
  return status === 'passed';
}

/** Whether the run may publish a `chi2-passed` value at all (false for `not-applicable`). */
export function publishesChi2Passed(status: ChiSquareStatus): boolean {
  return chi2PassedOutputValue(status) !== null;
}
