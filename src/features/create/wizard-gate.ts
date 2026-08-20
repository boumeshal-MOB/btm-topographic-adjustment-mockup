import type { WizardDraft } from '@/demo/draft';
import { heldReferenceKeys, MINIMUM_HELD_REFERENCES } from '@/features/create/datum-view-model';

/**
 * What a step must produce before the wizard can move on.
 *
 * Only two gates exist, and both protect a scientific decision from being skipped: the approximate
 * coordinates have to be *accepted* before they become the network's starting point, and a
 * configuration cannot be activated on a test nobody ran. Everything else stays freely navigable —
 * the stepper is non-linear on purpose, because a draft is reviewed back and forth.
 */
export type WizardGateReason = 'initialisation-not-accepted' | 'no-datum' | 'not-enough-references';

export interface WizardGate {
  blocked: boolean;
  reason?: WizardGateReason;
}

export const INITIALISATION_STEP = 4;
export const ADJUSTMENT_STEP = 5;

export function wizardStepGate(draft: WizardDraft, step: number): WizardGate {
  if (step === INITIALISATION_STEP) {
    return draft.initialisation.result?.accepted === true
      ? { blocked: false }
      : { blocked: true, reason: 'initialisation-not-accepted' };
  }
  if (step === ADJUSTMENT_STEP) {
    // A datum row exists only for a controlled point, so "no row at all" means nothing is held.
    const controlled = draft.initialisation.references.some((control) =>
      [control.modeE, control.modeN, control.modeH].some((mode) => mode !== 'free'));
    if (!controlled) return { blocked: true, reason: 'no-datum' };
    // …and what holds it must be references with known coordinates, at least two of them: an
    // approximation computed at initialisation is a starting point, not a control.
    return heldReferenceKeys(draft).length >= MINIMUM_HELD_REFERENCES
      ? { blocked: false }
      : { blocked: true, reason: 'not-enough-references' };
  }
  return { blocked: false };
}
