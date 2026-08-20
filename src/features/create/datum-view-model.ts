import type { DraftReference, WizardDraft } from '@/demo/draft';
import { DATUM_APPROXIMATION_SOURCE, MINIMUM_HELD_REFERENCES, stationPointId } from '@/demo/resolve-run';
import type { TargetRole } from '@/domain/entities';

export { MINIMUM_HELD_REFERENCES };

/**
 * The rows of the datum table: every point of the network, with the coordinates the initialisation
 * produced, so a control record can be created without retyping a number the software already knows.
 */
export type Component = 'E' | 'N' | 'H';

export interface DatumRow {
  pointKey: string;
  label: string;
  role: TargetRole | 'station';
  eastingM: number;
  northingM: number;
  heightM: number;
  /**
   * True when the coordinates come from the survey — the dataset or `references.csv` — and not from
   * the initialisation computation. Weighting a *computed* coordinate would turn an approximation
   * into an invented control, which the product rules forbid (PRODUCT-AND-WORKFLOW.md §Initialisation).
   */
  known: boolean;
  control?: DraftReference;
}

/** A control record written by the datum table itself, as opposed to a known survey coordinate. */
export const DATUM_SOURCE = DATUM_APPROXIMATION_SOURCE;

/**
 * The references that genuinely hold the network: reference points, whose coordinate comes from the
 * survey, and actually constrained. A station key is never in this set, and neither is a coordinate
 * the initialisation computed — an approximation is a starting point, not a control.
 */
export function heldReferenceKeys(draft: WizardDraft): string[] {
  const referenceNames = new Set(draft.targets
    .filter((target) => target.role === 'reference')
    .map((target) => target.engineName));
  return draft.initialisation.references
    .filter((control) => control.source !== DATUM_SOURCE
      && referenceNames.has(control.pointKey)
      && [control.modeE, control.modeN, control.modeH].some((mode) => mode !== 'free'))
    .map((control) => control.pointKey);
}

export const MODE_FIELD = { E: 'modeE', N: 'modeN', H: 'modeH' } as const;
export const SIGMA_FIELD = { E: 'sigmaEM', N: 'sigmaNM', H: 'sigmaHM' } as const;
export const DEFAULT_SIGMA_M = 0.0015;

/**
 * Every point of the network with the coordinates the initialisation produced, so a control row can
 * be created without asking the user to retype a number the software already knows.
 */
export function buildDatumRows(draft: WizardDraft): DatumRow[] {
  const controls = new Map(draft.initialisation.references.map((control) => [control.pointKey, control]));
  const computed = new Map((draft.initialisation.result?.coordinates ?? []).map((c) => [c.pointKey, c]));
  const stationSolutions = new Map((draft.initialisation.result?.stationSolutions ?? []).map((s) => [s.stationCode, s]));

  const stations: DatumRow[] = draft.stationCodes.map((stationCode) => {
    const key = stationPointId(stationCode);
    const control = controls.get(key);
    const solution = stationSolutions.get(stationCode);
    return {
      pointKey: key,
      label: stationCode,
      role: 'station',
      eastingM: control?.eastingM ?? solution?.eastingM ?? 0,
      northingM: control?.northingM ?? solution?.northingM ?? 0,
      heightM: control?.heightM ?? solution?.heightM ?? 0,
      known: false,
      control,
    };
  });

  const roleOrder: Array<TargetRole> = ['reference', 'monitoring', 'auxiliary'];
  const seen = new Set<string>();
  const points: DatumRow[] = draft.targets
    .filter((target) => draft.stationCodes.includes(target.stationCode))
    .filter((target) => {
      if (seen.has(target.engineName)) return false;
      seen.add(target.engineName);
      return true;
    })
    .map((target) => {
      const control = controls.get(target.engineName);
      const solved = computed.get(target.engineName);
      return {
        pointKey: target.engineName,
        label: target.engineName,
        role: target.role,
        eastingM: control?.eastingM ?? solved?.eastingM ?? 0,
        northingM: control?.northingM ?? solved?.northingM ?? 0,
        heightM: control?.heightM ?? solved?.heightM ?? 0,
        known: Boolean(control && control.source !== DATUM_SOURCE),
        control,
      };
    })
    .sort((a, b) => roleOrder.indexOf(a.role as TargetRole) - roleOrder.indexOf(b.role as TargetRole)
      || a.label.localeCompare(b.label, undefined, { numeric: true }));

  return [...stations, ...points];
}

/**
 * Stations free, **known** references weighted, everything else free — the datum of a monitoring
 * network.
 *
 * A station is never held: it is the instrument, not the reference. And only a coordinate that comes
 * from the survey can carry a weight; weighting a computed approximation would pin the network to its
 * own starting point and call an invention a control.
 */
export function recommendedDatum(rows: readonly DatumRow[]): DraftReference[] {
  return rows
    .filter((row) => row.role === 'reference' && row.known)
    .map((row) => ({
      pointKey: row.pointKey,
      eastingM: row.eastingM,
      northingM: row.northingM,
      heightM: row.heightM,
      modeE: 'weak' as const,
      modeN: 'weak' as const,
      modeH: 'weak' as const,
      sigmaM: row.control?.sigmaM ?? DEFAULT_SIGMA_M,
      sigmaEM: row.control?.sigmaEM,
      sigmaNM: row.control?.sigmaNM,
      sigmaHM: row.control?.sigmaHM,
      source: row.control?.source ?? 'datum',
    }));
}

