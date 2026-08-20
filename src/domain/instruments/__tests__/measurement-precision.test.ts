import { describe, expect, it } from 'vitest';
import type { StarNetWeights } from '@/domain/entities';
import {
  instrumentPrecisionFromTemplate,
  resolveSightPrecision,
  samePrecision,
  sightOverridesPrecision,
} from '@/domain/instruments/measurement-precision';
import {
  constantState,
  CUSTOM_REFLECTOR_ID,
  matchReflector,
  reflectorOptions,
  reflectorPatch,
} from '@/domain/instruments/reflector-catalogue';

const weights: StarNetWeights = {
  distanceStdErrM: 0.001,
  distancePpm: 1,
  angleArcSec: 1.414,
  directionArcSec: 2.5,
  azimuthArcSec: 1,
  zenithArcSec: 1.5,
  instrumentCenteringM: 0.0008,
  targetCenteringM: 0.0008,
  verticalCenteringM: 0.0005,
};

/** The FR template shape: a datasheet figure and one distance figure per reflector family. */
const topcon = {
  id: 'topcon-ms05axii',
  manufacturer: 'Topcon',
  model: 'MS05AXII',
  angleAccuracyArcSec: 0.5,
  measurementFamilies: {
    prism: { distanceStdErrMm: 0.8, distancePpm: 1 },
    'reflective-sheet': { distanceStdErrMm: 0.5, distancePpm: 1 },
    reflectorless: { distanceStdErrMm: 1, distancePpm: 1 },
  },
};

/** The UK template shape: the instrument is named, its numbers came with the supplied project. */
const leica = { id: 'leica-tm50-i', manufacturer: 'Leica', model: 'TM50 I' };

describe('measurement precision: template → instrument → sight', () => {
  it('reads the per-family figures a template declares', () => {
    const precision = instrumentPrecisionFromTemplate(topcon, weights, weights);
    expect(precision.directionArcSec).toBe(0.5);
    expect(precision.zenithArcSec).toBe(0.5);
    expect(precision.distanceByFamily.prism).toEqual({ stdErrMm: 0.8, ppm: 1 });
    // A sheet is not measured as well as a prism, and the template says so.
    expect(precision.distanceByFamily['reflective-sheet'].stdErrMm).toBe(0.5);
  });

  it('falls back to the delivered project weights when a template declares nothing', () => {
    /**
     * The UK preset is a supplied HS2/NTE project: its numbers are the ones the `.prj` shipped with,
     * so they are the template's own values here. Inventing manufacturer figures instead would
     * silently contradict a delivered project.
     */
    const precision = instrumentPrecisionFromTemplate(leica, weights, weights);
    expect(precision.directionArcSec).toBe(2.5);
    expect(precision.zenithArcSec).toBe(1.5);
    expect(precision.distanceByFamily.prism).toEqual({ stdErrMm: 1, ppm: 1 });
  });

  it('uses the fallback weights only when the preset itself is unresolved', () => {
    // FR ships `defaultWeights: null` — a decision the surveyor still has to make (audit D-05).
    const proposal: StarNetWeights = { ...weights, directionArcSec: 0.5, distanceStdErrM: 0.0008 };
    const precision = instrumentPrecisionFromTemplate(leica, null, proposal);
    expect(precision.directionArcSec).toBe(0.5);
    expect(precision.distanceByFamily.prism.stdErrMm).toBeCloseTo(0.8);
  });

  it('names the step of the chain that produced each number', () => {
    const instrument = instrumentPrecisionFromTemplate(topcon, weights, weights);

    const untouched = resolveSightPrecision(instrument, { measurementType: 'prism' });
    expect(untouched.distanceStdErrMm).toEqual({ value: 0.8, source: 'template' });

    // The same values, but stated by the surveyor on the station: a different answer to "why 0.8?".
    const stated = resolveSightPrecision(instrument, { measurementType: 'prism' }, false);
    expect(stated.distanceStdErrMm).toEqual({ value: 0.8, source: 'instrument' });

    const overridden = resolveSightPrecision(instrument, { measurementType: 'prism', distanceStdErrMm: 3 });
    expect(overridden.distanceStdErrMm).toEqual({ value: 3, source: 'sight' });
    // Only what was restated becomes a sight value; the rest still follows the instrument.
    expect(overridden.distancePpm.source).toBe('template');
  });

  it('counts a sight as overriding only when it restates something', () => {
    expect(sightOverridesPrecision({ measurementType: 'prism' })).toBe(false);
    expect(sightOverridesPrecision({ measurementType: 'prism', distanceKind: 'horizontal' })).toBe(true);
  });

  it('compares two instrument precisions across every family', () => {
    const left = instrumentPrecisionFromTemplate(topcon, weights, weights);
    expect(samePrecision(left, instrumentPrecisionFromTemplate(topcon, weights, weights))).toBe(true);
    expect(samePrecision(left, { ...left, distanceKind: 'horizontal' })).toBe(false);
    expect(samePrecision(left, {
      ...left,
      distanceByFamily: { ...left.distanceByFamily, reflectorless: { stdErrMm: 9, ppm: 1 } },
    })).toBe(false);
  });
});

describe('reflector catalogue: choosing the reflector sets the constant', () => {
  const uk = reflectorOptions([
    { id: 'uk-leica-circular-0', label: 'Leica Circular Prism — +0.0 mm', measurementType: 'prism', edmMode: 'precise-prism', requiredConstantM: 0, alreadyAppliedConstantM: 0 },
    { id: 'uk-lbar-8_9', label: 'L-bar — +8.9 mm', measurementType: 'prism', edmMode: 'precise-prism', requiredConstantM: 0.0089, alreadyAppliedConstantM: 0 },
    { id: 'uk-leica-reflectorless', label: 'Leica reflectorless', measurementType: 'reflectorless', edmMode: 'fine-non-prism' },
  ]);

  it('matches a sight on its numbers, not on the id it happens to store', () => {
    // A sight seeded from the L-bar whose constant was then typed over is no longer an L-bar, and
    // calling it one would hide the edit.
    expect(matchReflector({ measurementType: 'prism', measurementSetupId: 'uk-lbar-8_9', requiredConstantM: 0.0089, alreadyAppliedConstantM: 0 }, uk)).toBe('uk-lbar-8_9');
    expect(matchReflector({ measurementType: 'prism', measurementSetupId: 'uk-lbar-8_9', requiredConstantM: 0.0265, alreadyAppliedConstantM: 0 }, uk)).toBe(CUSTOM_REFLECTOR_ID);
    // A reflectorless sight has no constant to match: its family identifies it.
    expect(matchReflector({ measurementType: 'reflectorless', requiredConstantM: 0, alreadyAppliedConstantM: 0 }, uk)).toBe('uk-leica-reflectorless');
  });

  it('writes the reflector and both constants together, and zeroes them for reflectorless', () => {
    expect(reflectorPatch(uk[1])).toEqual({
      measurementType: 'prism',
      measurementSetupId: 'uk-lbar-8_9',
      requiredConstantM: 0.0089,
      alreadyAppliedConstantM: 0,
    });
    expect(reflectorPatch(uk[2]).requiredConstantM).toBe(0);
  });

  it('says in one badge whether BTM applies the constant, or the field already did', () => {
    // BTM adds the difference.
    expect(constantState({ measurementType: 'prism', requiredConstantM: 0.0089, alreadyAppliedConstantM: 0 }))
      .toEqual({ kind: 'btm', deltaMm: 8.9, requiredMm: 8.9 });
    // FR's MPO: 25.5 mm already applied in the field, so applying it again would double it (CALC-003).
    expect(constantState({ measurementType: 'prism', requiredConstantM: 0.0255, alreadyAppliedConstantM: 0.0255 }))
      .toEqual({ kind: 'applied', deltaMm: 0, requiredMm: 25.5 });
    // A genuine +0.0 reflector, and a reflectorless sight, have nothing to say.
    expect(constantState({ measurementType: 'prism', requiredConstantM: 0, alreadyAppliedConstantM: 0 }).kind).toBe('none');
    expect(constantState({ measurementType: 'reflectorless', requiredConstantM: 0.03, alreadyAppliedConstantM: 0 }).kind).toBe('none');
  });
});
