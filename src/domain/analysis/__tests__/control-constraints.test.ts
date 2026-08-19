import { describe, expect, it } from 'vitest';
import {
  effectiveControlConstraint,
  effectiveControlConstraints,
} from '@/domain/analysis/control-constraints';
import type { ReferenceConstraint } from '@/domain/entities';

const weakReference: Pick<ReferenceConstraint, 'modeE' | 'modeN' | 'modeH'> = {
  modeE: 'weak',
  modeN: 'weak',
  modeH: 'weak',
};

describe('effectiveControlConstraint', () => {
  it('reports weak with the sigma the engine received', () => {
    const result = effectiveControlConstraint({
      point: { free: true, constraints: [{ component: 'e', value: 10, sigmaM: 0.0015 }] },
      component: 'e',
      reference: weakReference,
    });
    expect(result).toEqual({ mode: 'weak', sigmaM: 0.0015 });
  });

  it('reports free when a trial removed the constraint, whatever the configuration declares', () => {
    // The regression this rule exists for: a component freed in the Analysis Lab kept its
    // configured weight in the generated .dat, so STAR*NET adjusted a different network.
    const result = effectiveControlConstraint({
      point: { free: true, constraints: [{ component: 'n', value: 20, sigmaM: 0.0015 }] },
      component: 'e',
      reference: weakReference,
    });
    expect(result).toEqual({ mode: 'free' });
  });

  it('keeps a configured fixed component fixed', () => {
    const result = effectiveControlConstraint({
      point: { free: true, constraints: [] },
      component: 'h',
      reference: { ...weakReference, modeH: 'fixed' },
    });
    expect(result).toEqual({ mode: 'fixed' });
  });

  it('holds every component of a fully fixed point', () => {
    expect(effectiveControlConstraints({ point: { free: false }, reference: weakReference })).toEqual({
      e: { mode: 'fixed' },
      n: { mode: 'fixed' },
      h: { mode: 'fixed' },
    });
  });

  it('frees every component of a released reference', () => {
    expect(effectiveControlConstraints({
      point: { free: true, constraints: [{ component: 'e', value: 10, sigmaM: 0.0015 }] },
      reference: weakReference,
      freedReference: true,
    })).toEqual({ e: { mode: 'free' }, n: { mode: 'free' }, h: { mode: 'free' } });
  });

  it('treats an unconstrained point without a reference as free', () => {
    expect(effectiveControlConstraints({ point: { free: true } })).toEqual({
      e: { mode: 'free' },
      n: { mode: 'free' },
      h: { mode: 'free' },
    });
  });

  it('does not claim a weak constraint the engine never got, even when a sigma is declared', () => {
    // `resolveRunInputForSlot` only emits a weak constraint when the sigma is usable, so a
    // reference declaring `weak` without one is genuinely unconstrained.
    expect(effectiveControlConstraint({
      point: { free: true, constraints: [] },
      component: 'e',
      reference: weakReference,
    })).toEqual({ mode: 'free' });
  });
});
