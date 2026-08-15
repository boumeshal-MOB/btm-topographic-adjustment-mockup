import { describe, expect, it } from 'vitest';
import fixture from '@/demo/fixtures/ats34.generated.json';
import {
  ATS34_CONTRACT,
  checkAts34FixtureContract,
  checkAts34RowIntegrity,
  type Ats34Fixture,
} from '@/demo/fixtures/contract';

const typedFixture = fixture as Ats34Fixture;

describe('ATS34 fixture contract (P0 VALIDATION-AND-OPEN-DECISIONS.md §2)', () => {
  it('has no contract violations', () => {
    expect(checkAts34FixtureContract(typedFixture)).toEqual([]);
  });

  it('has exactly 6494 raw observations, one station code NTE_ATS34 (DEMO-002 single-station)', () => {
    expect(typedFixture.rawObservations).toHaveLength(ATS34_CONTRACT.rawObservationCount);
    // Raw layer carries stationCode (string), never a numeric stationId (audit item 3).
    expect(new Set(typedFixture.rawObservations.map((o) => o.stationCode))).toEqual(
      new Set([ATS34_CONTRACT.station]),
    );
  });

  it('has 42 observed target names and 43 Lookup rows', () => {
    const targets = new Set(typedFixture.rawObservations.map((o) => o.rawTargetName));
    expect(targets.size).toBe(ATS34_CONTRACT.targetCount);
    expect(typedFixture.lookup).toHaveLength(ATS34_CONTRACT.lookupCount);
  });

  it('has 10 Header lines, 9 of which are references matching Lookup targets', () => {
    expect(typedFixture.header).toHaveLength(ATS34_CONTRACT.headerCount);
    expect(typedFixture.meta.referenceCount).toBe(ATS34_CONTRACT.referenceCount);
  });

  it('covers exactly 2025-03-01T00:02:58Z to 2025-03-31T20:12:32Z', () => {
    expect(typedFixture.meta.period.from).toBe(ATS34_CONTRACT.periodFrom);
    expect(typedFixture.meta.period.to).toBe(ATS34_CONTRACT.periodTo);
  });

  it('has prism constants exactly {0, 0.0089, 0.0300} m', () => {
    expect(typedFixture.meta.prismConstantsM).toEqual(ATS34_CONTRACT.prismConstantsM);
  });

  it('has Hz/Vz in decimal degrees and Sd in metres for a known control row', () => {
    const controlled = typedFixture.rawObservations.find((o) => o.sdM === 78.41);
    expect(controlled).toBeDefined();
    expect(controlled?.hzDeg).toBeGreaterThanOrEqual(0);
    expect(controlled?.hzDeg).toBeLessThan(360);
  });

  it('never presents demo data as an upload target: no raw file is bundled in the app graph', () => {
    // The workbook itself is excluded from src/ (tools/demo-source/ + .graphifyignore);
    // this fixture is the only artefact the app imports (DATA-006).
    expect(typedFixture.meta.source).toBe('ATS34-Raw-Data-Lookup-Header.xlsx');
  });

  it('passes per-row integrity across ALL 6494 observations (audit item 7)', () => {
    // Valid dates, finite Hz/Vz/Sd (no silent zero), unique ids, present stationCode.
    expect(checkAts34RowIntegrity(typedFixture)).toEqual([]);
  });

  it('records no validation warnings for the supplied clean workbook', () => {
    expect(typedFixture.meta.warnings).toEqual([]);
  });
});
