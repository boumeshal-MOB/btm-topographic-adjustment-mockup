/**
 * ATS34 fixture contract (rules DEMO-001, DEMO-002, DATA-006; acceptance `implementation/32 §2`).
 * The build/test suite fails if these counters drift without an intentional fixture update.
 */
export interface Ats34RawObservation {
  id: string;
  /** Raw BTM station code (e.g. `NTE_ATS34`), never a numeric id (audit item 3). */
  stationCode: string;
  rawTargetName: string;
  epoch: string;
  recordNumber: number;
  hzDeg: number;
  vzDeg: number;
  sdM: number;
}

export interface Ats34LookupRow {
  RTS: string;
  TargetName: string;
  AdjustmentName: string;
  OutputName: string;
  TargetHeight: number;
  PrismConstant: number;
  PrismType: string;
  PrismGrade: string;
  AdjustmentEnabled: boolean;
  GraphEnabled: boolean;
}

export interface Ats34HeaderRow {
  UsedFromCycle: string;
  Code: 'C';
  PointId: string;
  Easting: number;
  Northing: number;
  Height: number;
  StDevE: number | '*' | '!';
  StDevN: number | '*' | '!';
  StDevH: number | '*' | '!';
}

export interface Ats34FixtureMeta {
  schemaVersion: number;
  source: string;
  sourceSha256: string;
  convertedAt: string;
  stations: string[];
  targetCount: number;
  referenceCount: number;
  period: { from: string | null; to: string | null };
  prismConstantsM: number[];
  counts: { rawObservations: number; lookup: number; header: number };
  warnings: string[];
}

export interface Ats34Fixture {
  meta: Ats34FixtureMeta;
  rawObservations: Ats34RawObservation[];
  lookup: Ats34LookupRow[];
  header: Ats34HeaderRow[];
}

export const ATS34_CONTRACT = {
  rawObservationCount: 6494,
  lookupCount: 43,
  headerCount: 10,
  station: 'NTE_ATS34',
  targetCount: 42,
  referenceCount: 9,
  periodFrom: '2025-03-01T00:02:58.000Z',
  periodTo: '2025-03-31T20:12:32.000Z',
  prismConstantsM: [0, 0.0089, 0.03],
} as const;

export interface FixtureContractViolation {
  field: string;
  expected: unknown;
  actual: unknown;
}

/** Pure check used by tests and, optionally, a future build guard. Never throws. */
export function checkAts34FixtureContract(fixture: Ats34Fixture): FixtureContractViolation[] {
  const violations: FixtureContractViolation[] = [];
  const push = (field: string, expected: unknown, actual: unknown) => {
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      violations.push({ field, expected, actual });
    }
  };

  push('rawObservations.length', ATS34_CONTRACT.rawObservationCount, fixture.rawObservations.length);
  push('lookup.length', ATS34_CONTRACT.lookupCount, fixture.lookup.length);
  push('header.length', ATS34_CONTRACT.headerCount, fixture.header.length);
  push('meta.stations', [ATS34_CONTRACT.station], fixture.meta.stations);
  push('meta.targetCount', ATS34_CONTRACT.targetCount, fixture.meta.targetCount);
  push('meta.referenceCount', ATS34_CONTRACT.referenceCount, fixture.meta.referenceCount);
  push('meta.period.from', ATS34_CONTRACT.periodFrom, fixture.meta.period.from);
  push('meta.period.to', ATS34_CONTRACT.periodTo, fixture.meta.period.to);
  push('meta.prismConstantsM', ATS34_CONTRACT.prismConstantsM, fixture.meta.prismConstantsM);

  return violations;
}

/**
 * Per-observation integrity check applied to ALL rows (audit item 7): every epoch is a valid
 * date, every Hz/Vz/Sd is finite (no silent zero), and every observation id is unique. Returns
 * one string per offending row; an empty array means the whole set is clean.
 */
export function checkAts34RowIntegrity(fixture: Ats34Fixture): string[] {
  const problems: string[] = [];
  const seenIds = new Set<string>();
  for (const o of fixture.rawObservations) {
    if (seenIds.has(o.id)) problems.push(`${o.id}: duplicate observation id`);
    seenIds.add(o.id);
    if (Number.isNaN(new Date(o.epoch).getTime())) problems.push(`${o.id}: invalid epoch`);
    if (!Number.isFinite(o.hzDeg)) problems.push(`${o.id}: non-finite Hz`);
    if (!Number.isFinite(o.vzDeg)) problems.push(`${o.id}: non-finite Vz`);
    if (!Number.isFinite(o.sdM)) problems.push(`${o.id}: non-finite Sd`);
    if (!o.stationCode) problems.push(`${o.id}: missing stationCode`);
  }
  return problems;
}
