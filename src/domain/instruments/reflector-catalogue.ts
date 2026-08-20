import type { MeasurementType } from '@/domain/entities';

/**
 * The reflectors a surveyor may pick, and the constant each one carries.
 *
 * A prism constant is not a number to be typed: it is a property of a catalogued reflector, and the
 * country template already lists them — UK ships a circular prism at +0.0 mm, an L-bar at +8.9 mm, a
 * micro prism at +26.5 mm and a 360 mini at +30.0 mm; FR ships an MPO whose 25.5 mm is *already
 * applied in the field* and a PAV at 0. Choosing the reflector therefore sets the constant, and the
 * hand-typed case survives as one explicit option instead of being the default way in.
 */

export const CUSTOM_REFLECTOR_ID = 'custom';

/** One entry of a country template's `measurementSetups`, as `countryPresetSchema` validates it. */
export interface MeasurementSetupSeed {
  id: string;
  label: string;
  measurementType: MeasurementType;
  reflectorTemplateId?: string;
  edmMode: string;
  requiredConstantM?: number;
  alreadyAppliedConstantM?: number;
}

export interface ReflectorOption {
  id: string;
  label: string;
  measurementType: MeasurementType;
  requiredConstantM: number;
  alreadyAppliedConstantM: number;
  edmMode: string;
}

export function reflectorOptions(setups: readonly MeasurementSetupSeed[]): ReflectorOption[] {
  return setups.map((setup) => ({
    id: setup.id,
    label: setup.label,
    measurementType: setup.measurementType,
    requiredConstantM: setup.requiredConstantM ?? 0,
    alreadyAppliedConstantM: setup.alreadyAppliedConstantM ?? 0,
    edmMode: setup.edmMode,
  }));
}

export interface ReflectorSelection {
  measurementType: MeasurementType;
  measurementSetupId?: string;
  requiredConstantM: number;
  alreadyAppliedConstantM: number;
}

/**
 * Which catalogue entry a sight currently matches, or `custom`.
 *
 * Matched on the *numbers*, not on the stored id: a sight seeded from a setup whose constants were
 * then edited by hand is no longer that reflector, and calling it one would hide the edit. A
 * reflectorless sight has no constant to match, so its family alone identifies it.
 */
export function matchReflector(
  selection: ReflectorSelection,
  options: readonly ReflectorOption[],
): string {
  const sameFamily = options.filter((option) => option.measurementType === selection.measurementType);
  if (selection.measurementType === 'reflectorless') {
    return sameFamily[0]?.id ?? CUSTOM_REFLECTOR_ID;
  }
  const byId = sameFamily.find((option) => option.id === selection.measurementSetupId);
  const matches = (option: ReflectorOption) =>
    Math.abs(option.requiredConstantM - selection.requiredConstantM) < 1e-9
    && Math.abs(option.alreadyAppliedConstantM - selection.alreadyAppliedConstantM) < 1e-9;
  if (byId && matches(byId)) return byId.id;
  return sameFamily.find(matches)?.id ?? CUSTOM_REFLECTOR_ID;
}

/** The patch a reflector choice writes on a sight. `custom` keeps the numbers already there. */
export function reflectorPatch(option: ReflectorOption): ReflectorSelection {
  return {
    measurementType: option.measurementType,
    measurementSetupId: option.id,
    requiredConstantM: option.measurementType === 'reflectorless' ? 0 : option.requiredConstantM,
    alreadyAppliedConstantM: option.measurementType === 'reflectorless' ? 0 : option.alreadyAppliedConstantM,
  };
}

/**
 * What the row has to say about the constant, in as few words as possible.
 *
 * Three states cover every case, and only one number is ever shown:
 * - `none`      — no constant at all (reflectorless, or a genuine +0.0 reflector)
 * - `applied`   — the field already applied it; BTM must not apply it twice
 * - `btm`       — BTM applies the difference, and `deltaMm` is what it adds
 */
export type ConstantStateKind = 'none' | 'applied' | 'btm';

export interface ConstantState {
  kind: ConstantStateKind;
  /** Required − already applied, in millimetres. Signed: a negative value removes length. */
  deltaMm: number;
  /** The constant the reflector needs, in millimetres. */
  requiredMm: number;
}

/** Below this, a constant difference is rounding noise in a millimetre-quoted catalogue. */
const NEGLIGIBLE_MM = 0.05;

export function constantState(selection: ReflectorSelection): ConstantState {
  const requiredMm = selection.measurementType === 'reflectorless' ? 0 : selection.requiredConstantM * 1000;
  const appliedMm = selection.measurementType === 'reflectorless' ? 0 : selection.alreadyAppliedConstantM * 1000;
  const deltaMm = requiredMm - appliedMm;
  if (Math.abs(deltaMm) >= NEGLIGIBLE_MM) return { kind: 'btm', deltaMm, requiredMm };
  if (Math.abs(requiredMm) >= NEGLIGIBLE_MM) return { kind: 'applied', deltaMm: 0, requiredMm };
  return { kind: 'none', deltaMm: 0, requiredMm };
}
