import type { CatalogueTarget } from '@/demo/catalogue';
import type { WizardDraft } from '@/demo/draft';

type WizardTarget = WizardDraft['targets'][number];

export type TargetFilter = 'all' | WizardTarget['role'];
export type MeasurementFilter = 'all' | WizardTarget['measurementType'];

export interface TargetTableFilters {
  search: string;
  stationCode: string;
  role: TargetFilter;
  measurementType: MeasurementFilter;
}

export interface TargetTableRow {
  target: WizardTarget;
  index: number;
  catalogue?: CatalogueTarget;
}

export interface TargetTableSummary {
  total: number;
  included: number;
  published: number;
  reviewRequired: number;
}

export function catalogueTargetKey(stationCode: string, rawTargetName: string): string {
  return `${stationCode}|${rawTargetName}`;
}

export function buildTargetTableRows(
  targets: readonly WizardTarget[],
  catalogueByKey: ReadonlyMap<string, CatalogueTarget>,
  filters: TargetTableFilters,
): TargetTableRow[] {
  const search = filters.search.trim().toLowerCase();

  return targets
    .map((target, index) => ({
      target,
      index,
      catalogue: catalogueByKey.get(catalogueTargetKey(target.stationCode, target.rawTargetName)),
    }))
    .filter((row) => {
      const { target, catalogue } = row;
      if (filters.stationCode !== 'all' && target.stationCode !== filters.stationCode) return false;
      if (filters.role !== 'all' && target.role !== filters.role) return false;
      if (filters.measurementType !== 'all' && target.measurementType !== filters.measurementType) return false;
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

export function summarizeTargets(targets: readonly WizardTarget[]): TargetTableSummary {
  return {
    total: targets.length,
    included: targets.filter((target) => target.includeInAdjustment).length,
    published: targets.filter((target) => target.publishOutput).length,
    reviewRequired: targets.filter((target) => target.reviewStatus !== 'ok').length,
  };
}

export function targetConstantDeltaMm(target: Pick<WizardTarget, 'measurementType' | 'requiredConstantM' | 'alreadyAppliedConstantM'>): number {
  if (target.measurementType === 'reflectorless') return 0;
  return (target.requiredConstantM - target.alreadyAppliedConstantM) * 1000;
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
