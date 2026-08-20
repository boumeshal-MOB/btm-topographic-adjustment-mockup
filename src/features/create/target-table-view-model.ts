import type { CatalogueTarget } from '@/demo/catalogue';
import type { DraftReference, DraftTargetConfig, WizardDraft } from '@/demo/draft';
import {
  COMPONENTS,
  DATUM_SOURCE,
  isHeld,
  withConstraintMode,
  withConstraintSigma,
} from '@/features/create/datum-view-model';
import type { ConstraintMode } from '@/domain/entities';
import { targetPrecision } from '@/demo/station-precision';
import {
  sightOverridesPrecision,
  type ResolvedSightPrecision,
} from '@/domain/instruments/measurement-precision';
import {
  constantState,
  matchReflector,
  reflectorPatch,
  type ConstantState,
  type ReflectorOption,
} from '@/domain/instruments/reflector-catalogue';

type WizardTarget = DraftTargetConfig;

export type TargetFilter = 'all' | WizardTarget['role'];
export type MeasurementFilter = 'all' | WizardTarget['measurementType'];

export interface TargetTableFilters {
  search: string;
  stationCode: string;
  role: TargetFilter;
  measurementType: MeasurementFilter;
  /** Only sights that restate a precision or carry a constraint of their own. */
  changedOnly?: boolean;
}

/**
 * One row of the dense table, with everything it displays already resolved.
 *
 * The table renders text, not form controls: a station with a hundred prisms would otherwise mount a
 * thousand inputs, and reading a column would mean reading a thousand boxes. Editing happens on the
 * selection (the bulk bar) or on one sight (the inspector), so a row only has to *say* what it holds
 * — which is why every derived value is computed here rather than inside the render.
 */
export interface TargetTableRow {
  target: WizardTarget;
  index: number;
  catalogue?: CatalogueTarget;
  /** The standard errors this sight will be weighted with, and where each one came from. */
  precision: ResolvedSightPrecision;
  /** True when the sight restates any precision instead of following its instrument. */
  overridesPrecision: boolean;
  /** The catalogued reflector this sight matches, or `custom`. */
  reflectorId: string;
  /** What the row has to say about the prism constant, in one badge. */
  constant: ConstantState;
  /** The coordinate record of this point, when the datum holds it. */
  control?: DraftReference;
  /** True when the coordinate comes from the survey rather than from the initialisation solve. */
  coordinateKnown: boolean;
}

export interface TargetTableSummary {
  total: number;
  included: number;
  published: number;
  reviewRequired: number;
  references: number;
  /**
   * Targets carrying at least one constraint, whatever their role: two of them are what gives the
   * network a unique solution, and the role does not enter that test.
   */
  constrainedReferences: number;
  overrides: number;
}

export function catalogueTargetKey(stationCode: string, rawTargetName: string): string {
  return `${stationCode}|${rawTargetName}`;
}

export function targetKey(target: Pick<WizardTarget, 'stationCode' | 'rawTargetName'>): string {
  return catalogueTargetKey(target.stationCode, target.rawTargetName);
}

export interface TargetRowContext {
  draft: WizardDraft;
  catalogueByKey: ReadonlyMap<string, CatalogueTarget>;
  reflectors: readonly ReflectorOption[];
}

export function buildTargetTableRows(
  { draft, catalogueByKey, reflectors }: TargetRowContext,
  filters: TargetTableFilters,
): TargetTableRow[] {
  const search = filters.search.trim().toLowerCase();
  const controls = new Map(draft.initialisation.references.map((control) => [control.pointKey, control]));

  return draft.targets
    .map((target, index): TargetTableRow => {
      const control = controls.get(target.engineName);
      return {
        target,
        index,
        catalogue: catalogueByKey.get(targetKey(target)),
        precision: targetPrecision(draft, target),
        overridesPrecision: sightOverridesPrecision(target),
        reflectorId: matchReflector(target, reflectors),
        constant: constantState(target),
        control,
        coordinateKnown: Boolean(control && control.source !== DATUM_SOURCE),
      };
    })
    .filter((row) => {
      const { target, catalogue } = row;
      if (filters.stationCode !== 'all' && target.stationCode !== filters.stationCode) return false;
      if (filters.role !== 'all' && target.role !== filters.role) return false;
      if (filters.measurementType !== 'all' && target.measurementType !== filters.measurementType) return false;
      if (filters.changedOnly && !row.overridesPrecision && !isHeld(row.control)) return false;
      if (!search) return true;

      return [
        target.stationCode,
        target.rawTargetName,
        target.engineName,
        target.role,
        target.measurementType,
        target.edmMode,
        catalogue?.prismSensorId,
        catalogue?.hzVariableId,
        catalogue?.vzVariableId,
        catalogue?.sdVariableId,
      ].some((value) => String(value ?? '').toLowerCase().includes(search));
    })
    .sort((a, b) =>
      a.target.stationCode.localeCompare(b.target.stationCode, undefined, { numeric: true })
      || a.target.rawTargetName.localeCompare(b.target.rawTargetName, undefined, { numeric: true }),
    );
}

/**
 * Sights grouped the way STAR*NET reads them, and the way a surveyor checks them.
 *
 * One group per station, because a station block (`DB … DE`) is what the native file is made of, and
 * references first inside each group: they are the points that carry the datum, so they are what a
 * setup is verified against before anything else.
 */
export const ROLE_ORDER: ReadonlyArray<WizardTarget['role']> = ['reference', 'monitoring', 'auxiliary'];

export interface TargetStationGroup {
  stationCode: string;
  rows: TargetTableRow[];
  byRole: Array<{ role: WizardTarget['role']; rows: TargetTableRow[] }>;
}

export function groupTargetRowsByStation(rows: readonly TargetTableRow[]): TargetStationGroup[] {
  const groups = new Map<string, TargetTableRow[]>();
  for (const row of rows) {
    const existing = groups.get(row.target.stationCode);
    if (existing) existing.push(row);
    else groups.set(row.target.stationCode, [row]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([stationCode, stationRows]) => {
      const ordered = [...stationRows].sort((a, b) =>
        ROLE_ORDER.indexOf(a.target.role) - ROLE_ORDER.indexOf(b.target.role)
        || a.target.rawTargetName.localeCompare(b.target.rawTargetName, undefined, { numeric: true }));
      return {
        stationCode,
        rows: ordered,
        byRole: ROLE_ORDER
          .map((role) => ({ role, rows: ordered.filter((row) => row.target.role === role) }))
          .filter((group) => group.rows.length > 0),
      };
    });
}

export function summarizeTargets(draft: WizardDraft): TargetTableSummary {
  const controls = new Map(draft.initialisation.references.map((control) => [control.pointKey, control]));
  const references = draft.targets.filter((target) => target.role === 'reference');
  return {
    total: draft.targets.length,
    included: draft.targets.filter((target) => target.includeInAdjustment).length,
    published: draft.targets.filter((target) => target.publishOutput).length,
    reviewRequired: draft.targets.filter((target) => target.reviewStatus !== 'ok').length,
    references: references.length,
    constrainedReferences: draft.targets.filter((target) => isHeld(controls.get(target.engineName))).length,
    overrides: draft.targets.filter((target) => sightOverridesPrecision(target)).length,
  };
}

export function targetConstantDeltaMm(target: Pick<WizardTarget, 'measurementType' | 'requiredConstantM' | 'alreadyAppliedConstantM'>): number {
  return constantState(target).deltaMm;
}

export function valueForNumberInput(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(decimals));
}

export function paginateTargetRows(rows: readonly TargetTableRow[], page: number, rowsPerPage: number): TargetTableRow[] {
  const safePage = Math.max(0, page);
  const safeRowsPerPage = Math.max(1, rowsPerPage);
  return rows.slice(safePage * safeRowsPerPage, safePage * safeRowsPerPage + safeRowsPerPage);
}

/**
 * What a bulk edit may set. Every field is optional and an absent field is left alone — the bar
 * writes what the surveyor filled in, never a default it invented.
 *
 * `followInstrument` is the one that is not a value: it *removes* the per-sight standard errors so
 * the sights follow their station again. Setting a number and asking to follow the instrument at the
 * same time is contradictory, so `applyBulkEdit` resolves it in favour of following.
 */
export interface TargetBulkEdit {
  role?: WizardTarget['role'];
  reflectorId?: string;
  targetHeightM?: number;
  distanceStdErrMm?: number;
  distancePpm?: number;
  directionStdErrArcSec?: number;
  zenithStdErrArcSec?: number;
  distanceKind?: WizardTarget['distanceKind'];
  includeInAdjustment?: boolean;
  publishOutput?: boolean;
  followInstrument?: boolean;
}

export function bulkEditIsEmpty(edit: TargetBulkEdit): boolean {
  return Object.values(edit).every((value) => value === undefined || value === false);
}

/**
 * Applies one bulk edit to the selected sights and returns the whole target list.
 *
 * Selection is by `stationCode|rawTargetName`, never by row index: filtering and sorting change
 * indices under the user's feet, and a bulk write to the wrong row is invisible until a run fails.
 */
export function applyBulkEdit(
  targets: readonly WizardTarget[],
  selectedKeys: ReadonlySet<string>,
  edit: TargetBulkEdit,
  reflectors: readonly ReflectorOption[],
): WizardTarget[] {
  const reflector = edit.reflectorId
    ? reflectors.find((option) => option.id === edit.reflectorId)
    : undefined;
  return targets.map((target) => {
    if (!selectedKeys.has(targetKey(target))) return target;
    const next: WizardTarget = { ...target };
    if (edit.role !== undefined) next.role = edit.role;
    if (reflector) Object.assign(next, reflectorPatch(reflector));
    if (edit.targetHeightM !== undefined) next.targetHeightM = edit.targetHeightM;
    if (edit.includeInAdjustment !== undefined) next.includeInAdjustment = edit.includeInAdjustment;
    if (edit.publishOutput !== undefined) next.publishOutput = edit.publishOutput;
    if (edit.followInstrument) {
      next.distanceStdErrMm = undefined;
      next.distancePpm = undefined;
      next.directionStdErrArcSec = undefined;
      next.zenithStdErrArcSec = undefined;
      next.distanceKind = undefined;
    } else {
      if (edit.distanceStdErrMm !== undefined) next.distanceStdErrMm = edit.distanceStdErrMm;
      if (edit.distancePpm !== undefined) next.distancePpm = edit.distancePpm;
      if (edit.directionStdErrArcSec !== undefined) next.directionStdErrArcSec = edit.directionStdErrArcSec;
      if (edit.zenithStdErrArcSec !== undefined) next.zenithStdErrArcSec = edit.zenithStdErrArcSec;
      if (edit.distanceKind !== undefined) next.distanceKind = edit.distanceKind;
    }
    return next;
  });
}

/** Keys of every row currently visible — what "select all" means when a filter is on. */
export function visibleKeys(rows: readonly TargetTableRow[]): string[] {
  return rows.map((row) => targetKey(row.target));
}

/** A point to constrain, with the coordinate its record must carry. */
export interface ConstrainedPoint {
  pointKey: string;
  eastingM: number;
  northingM: number;
  heightM: number;
}

/**
 * Constraining, or freeing, every selected point in one gesture — the whole reason this screen can
 * cope with a hundred prisms.
 *
 * The three components move together here: a point constrained on two axes out of three is a real
 * but rare survey, and it stays available one component at a time on the row itself.
 *
 * The caller passes the coordinates: this function must never invent one. Defaulting to zero created
 * records that both lied about the point and degenerated the network.
 */
export function applyBulkConstraint(
  controls: readonly DraftReference[],
  points: readonly ConstrainedPoint[],
  mode: ConstraintMode,
  sigmaMm?: number,
): DraftReference[] {
  let next = [...controls];
  for (const point of points) {
    for (const component of COMPONENTS) {
      next = withConstraintMode(next, point, component, mode);
      if (mode === 'weak' && sigmaMm !== undefined) {
        next = withConstraintSigma(next, point.pointKey, component, sigmaMm);
      }
    }
  }
  return next;
}
