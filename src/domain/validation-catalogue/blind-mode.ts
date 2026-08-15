import {
  VALIDATION_SCENARIOS,
  type ValidationDataset,
  type ValidationObservation,
  type ValidationOracle,
} from '@/domain/validation-catalogue/schema';

/**
 * Blind mode (VALIDATION-DATASETS.md §"Intégration", FRONTEND-AND-ANALYSIS-LAB.md §"Entrée et mode
 * aveugle"). A synthetic dataset carries its own answer; showing it next to the network turns the
 * lab into a lookup instead of a diagnosis.
 *
 * Redaction is a *data* operation, not a UI flag: the redacted dataset is what the Analysis Lab
 * session receives, so no component can accidentally render the truth. Revealing means asking for
 * the sealed original back, which is an explicit recette action.
 *
 * Four things are oracle-grade and removed together:
 *  - `oracle` — expected scenario, fault plans, point truth and recommended actions;
 *  - `scenario` — the primary/secondary family *is* the answer;
 *  - `title` — the generator writes it as "3-station moved-reference validation case", so the
 *    human-readable label leaks the family just as plainly as the enum;
 *  - per observation, `truth` and `injectedFaults` — which sight carries the fault.
 *
 * Everything else stays, including `targetBindings.physicalPointId`: identity is a configured
 * mapping the surveyor legitimately sees, never part of the answer (see `identity.ts`).
 */

export interface SealedValidationDataset {
  /** Safe to hand to any component while the session is blind. */
  readonly blind: ValidationDataset;
  /** Only reachable through an explicit reveal action. */
  readonly oracle: ValidationOracle | undefined;
  readonly scenario: ValidationDataset['scenario'];
  readonly title: string | undefined;
}

/** Neutral label shown instead of the generator's scenario-bearing title. */
export function blindTitle(datasetId: string, stationCount: number): string {
  return `${datasetId} — ${stationCount}-station validation case`;
}

function redactObservation(observation: ValidationObservation): ValidationObservation {
  if (observation.truth === undefined && observation.injectedFaults === undefined) return observation;
  const redacted: ValidationObservation = { ...observation };
  delete redacted.truth;
  delete redacted.injectedFaults;
  return redacted;
}

/**
 * Splits a dataset into the blind view and its sealed answer.
 *
 * `scenario` is replaced by an `undisclosed` marker rather than deleted so that the schema shape
 * stays stable and a component reading it renders "hidden" instead of crashing.
 */
export function sealDataset(dataset: ValidationDataset): SealedValidationDataset {
  const { oracle, scenario, observations, ...rest } = dataset;
  const title = typeof rest.title === 'string' ? rest.title : undefined;
  const blind: ValidationDataset = {
    ...rest,
    title: blindTitle(dataset.id, dataset.stations.length),
    scenario: { primary: 'undisclosed', secondary: null, isCombined: scenario.isCombined },
    observations: observations.map(redactObservation),
  };
  return { blind, oracle, scenario, title };
}

/** Reassembles the full dataset. Used by the explicit reveal action and by tests. */
export function revealDataset(sealed: SealedValidationDataset, blind: ValidationDataset): ValidationDataset {
  return {
    ...blind,
    title: sealed.title ?? blind.title,
    scenario: sealed.scenario,
    oracle: sealed.oracle,
  };
}

/**
 * True when a dataset still carries answer-grade content. Guards the Analysis Lab session and is
 * asserted in tests so a refactor cannot quietly leak the oracle back into blind mode.
 */
export function containsOracleContent(dataset: ValidationDataset): boolean {
  if (dataset.oracle !== undefined) return true;
  if (dataset.scenario.primary !== 'undisclosed') return true;
  const title = typeof dataset.title === 'string' ? dataset.title : '';
  if (VALIDATION_SCENARIOS.some((scenario) => title.includes(scenario))) return true;
  return dataset.observations.some(
    (observation) => observation.truth !== undefined || observation.injectedFaults !== undefined,
  );
}
