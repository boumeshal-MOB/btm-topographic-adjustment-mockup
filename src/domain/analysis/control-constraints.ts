import type { ConstraintMode, ReferenceConstraint } from '@/domain/entities';
import type { ResolvedRunPoint } from '@/domain/engine/run-input';

/**
 * One rule for "how is this coordinate held?", shared by every surface that describes a run.
 *
 * The adjustment engine receives a point as a `free` flag plus, per component, at most one weighted
 * constraint. A trial that frees a single component simply removes that constraint, so anything
 * reading the *configured* reference instead of the resolved input describes a different network
 * than the one that was solved — which is exactly how the generated `.dat` kept weighting a
 * component the Analysis Lab had released.
 *
 * Therefore: `weak` means a constraint actually reached the engine; `fixed` comes only from the
 * configuration (the engine expresses it by not letting the coordinate move); everything else is
 * `free`.
 */
export interface EffectiveControlConstraint {
  mode: ConstraintMode;
  sigmaM?: number;
}

export type ControlComponent = 'e' | 'n' | 'h';

export const CONTROL_COMPONENTS: readonly ControlComponent[] = ['e', 'n', 'h'];

function configuredMode(
  reference: Pick<ReferenceConstraint, 'modeE' | 'modeN' | 'modeH'> | undefined,
  component: ControlComponent,
): ConstraintMode | undefined {
  if (!reference) return undefined;
  return component === 'e' ? reference.modeE : component === 'n' ? reference.modeN : reference.modeH;
}

export function effectiveControlConstraint(args: {
  point: Pick<ResolvedRunPoint, 'free' | 'constraints'>;
  component: ControlComponent;
  /** The configured reference for this point, when it has one. */
  reference?: Pick<ReferenceConstraint, 'modeE' | 'modeN' | 'modeH'>;
  /** True when the trial released the whole reference, so no component is controlled any more. */
  freedReference?: boolean;
}): EffectiveControlConstraint {
  const { point, component, reference } = args;
  if (args.freedReference) return { mode: 'free' };
  // A fully fixed point never moves, whatever the components declare.
  if (!point.free) return { mode: 'fixed' };
  if (configuredMode(reference, component) === 'fixed') return { mode: 'fixed' };
  const constraint = point.constraints?.find((candidate) => candidate.component === component);
  if (!constraint) return { mode: 'free' };
  return { mode: 'weak', sigmaM: constraint.sigmaM };
}

export function effectiveControlConstraints(args: {
  point: Pick<ResolvedRunPoint, 'free' | 'constraints'>;
  reference?: Pick<ReferenceConstraint, 'modeE' | 'modeN' | 'modeH'>;
  freedReference?: boolean;
}): Record<ControlComponent, EffectiveControlConstraint> {
  return {
    e: effectiveControlConstraint({ ...args, component: 'e' }),
    n: effectiveControlConstraint({ ...args, component: 'n' }),
    h: effectiveControlConstraint({ ...args, component: 'h' }),
  };
}
