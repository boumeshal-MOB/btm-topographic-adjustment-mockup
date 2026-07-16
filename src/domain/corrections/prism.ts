import type { ResolvedMeasurementSetup } from '@/domain/entities';

/**
 * Prism/reflector correction (CORR-001..003, CORR-009, MEAS-007/008).
 *
 * `prismDelta = requiredConstant − alreadyAppliedConstant` (CORR-002) is a differential: it
 * applies only the part of the reflector constant the station has NOT already applied, so a
 * constant already accounted for in the stored `sdM` is never applied a second time (CORR-005).
 *
 * - `reflectorless` measurements never carry a prism constant: delta is always exactly 0
 *   (CORR-009, MEAS-008), regardless of any required/already-applied fields present on the setup.
 * - `reflective-sheet` uses the same required-minus-applied formula as `prism` — it is its own
 *   setup with its own constants, never hardcoded to a "0 mm prism" (MEAS-007).
 */
export function resolvePrismDelta(
  setup: Pick<ResolvedMeasurementSetup, 'measurementType' | 'requiredConstantM' | 'alreadyAppliedConstantM'>,
): number {
  if (setup.measurementType === 'reflectorless') return 0;
  if (setup.requiredConstantM === undefined || setup.alreadyAppliedConstantM === undefined) {
    throw new Error(`Unresolved reflector constant for ${setup.measurementType} measurement`);
  }
  const required = setup.requiredConstantM;
  const applied = setup.alreadyAppliedConstantM;
  return required - applied;
}
