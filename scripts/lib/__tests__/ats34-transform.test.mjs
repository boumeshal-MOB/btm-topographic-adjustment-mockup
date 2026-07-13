import { describe, expect, it } from 'vitest';
import {
  cleanType,
  computeReferences,
  get,
  normalizeHeader,
  normalizeLookup,
  normalizeRawObservations,
  parseConstraint,
  parseCycle,
  runControlChecks,
  toBool,
} from '../ats34-transform.mjs';

describe('get() tolerant column accessor', () => {
  it('matches a trimmed/case-insensitive header, e.g. "StDev (E) " with trailing space', () => {
    const row = { 'StDev (E) ': 0.001 };
    expect(get(row, 'StDev (E)')).toBe(0.001);
  });

  it('returns null when no candidate name matches', () => {
    expect(get({ Foo: 1 }, 'Bar')).toBeNull();
  });
});

describe('normalizeRawObservations — column mapping and note-column tolerance', () => {
  it('reads only the 7 business columns and ignores extra note columns without dropping rows', () => {
    const rawRows = [
      {
        RTS: 'NTE_ATS34',
        Target: 'L34RE1100_329',
        RecordNumber: 1,
        Timestamp: new Date('2025-03-01T00:02:58Z'),
        Hz: 72.40293,
        Vz: 90.57264,
        Sd: 78.41,
        Note1: 'ignored free-text note',
        Note2: null,
      },
    ];
    const { rows, skippedCount } = normalizeRawObservations(rawRows);
    expect(skippedCount).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      stationId: 'NTE_ATS34',
      rawTargetName: 'L34RE1100_329',
      hzDeg: 72.40293,
      vzDeg: 90.57264,
      sdM: 78.41,
    });
    // Note columns must not leak into the normalised business row.
    expect(rows[0]).not.toHaveProperty('Note1');
    expect(rows[0]).not.toHaveProperty('Note2');
  });

  it('skips rows missing RTS/Target/Sd and reports the skipped count', () => {
    const rawRows = [
      { RTS: 'NTE_ATS34', Target: 'A', RecordNumber: 1, Timestamp: new Date(), Hz: 1, Vz: 1, Sd: 1 },
      { RTS: null, Target: 'B', RecordNumber: 2, Timestamp: new Date(), Hz: 1, Vz: 1, Sd: 1 },
      { RTS: 'NTE_ATS34', Target: null, RecordNumber: 3, Timestamp: new Date(), Hz: 1, Vz: 1, Sd: 1 },
      { RTS: 'NTE_ATS34', Target: 'D', RecordNumber: 4, Timestamp: new Date(), Hz: 1, Vz: 1, Sd: null },
    ];
    const { rows, skippedCount } = normalizeRawObservations(rawRows);
    expect(rows).toHaveLength(1);
    expect(skippedCount).toBe(3);
  });

  it('produces a deterministic order regardless of input row order', () => {
    const base = { RTS: 'NTE_ATS34', Timestamp: new Date('2025-03-01T00:00:00Z'), Hz: 1, Vz: 1, Sd: 1 };
    const forward = normalizeRawObservations([
      { ...base, Target: 'A', RecordNumber: 1 },
      { ...base, Target: 'B', RecordNumber: 2 },
    ]).rows;
    const reversed = normalizeRawObservations([
      { ...base, Target: 'B', RecordNumber: 2 },
      { ...base, Target: 'A', RecordNumber: 1 },
    ]).rows;
    expect(forward).toEqual(reversed);
  });
});

describe('normalizeLookup — column mapping', () => {
  it('defaults AdjustmentName/OutputName to TargetName when absent', () => {
    const [row] = normalizeLookup([{ RTS: 'NTE_ATS34', TargetName: 'X', AdjustmentEnabled: true }]);
    expect(row.AdjustmentName).toBe('X');
    expect(row.OutputName).toBe('X');
    expect(row.TargetHeight).toBe(0);
    expect(row.AdjustmentEnabled).toBe(true);
    expect(row.GraphEnabled).toBe(false);
  });

  it('drops rows without a TargetName', () => {
    expect(normalizeLookup([{ RTS: 'NTE_ATS34', TargetName: null }])).toHaveLength(0);
  });
});

describe('normalizeHeader and computeReferences', () => {
  it('parses fixed(!)/free(*)/sigma constraint modes and finds references via Lookup targets', () => {
    const header = normalizeHeader([
      {
        'Point ID': 'NTE_ATS34',
        Easting: 1,
        Northing: 2,
        Height: 3,
        'StDev (E)': 0.1,
        'StDev (N)': 0.1,
        'StDev (H)': '*',
      },
      {
        'Point ID': 'L34RE1100_329',
        Easting: 4,
        Northing: 5,
        Height: 6,
        'StDev (E)': 0.001,
        'StDev (N)': 0.001,
        'StDev (H)': 0.002,
      },
    ]);
    const lookup = normalizeLookup([{ RTS: 'NTE_ATS34', TargetName: 'L34RE1100_329' }]);
    // Sorted by PointId: 'L34RE1100_329' before 'NTE_ATS34'.
    expect(header[0].PointId).toBe('L34RE1100_329');
    expect(header[0].StDevE).toBe(0.001);
    expect(header[0].StDevH).toBe(0.002);
    expect(header[1].PointId).toBe('NTE_ATS34');
    expect(header[1].StDevH).toBe('*');
    expect(computeReferences(header, lookup)).toEqual(['L34RE1100_329']);
  });
});

describe('scalar parsers', () => {
  it('toBool accepts true/1/"yes"/"true"/"1"', () => {
    expect(toBool(true)).toBe(true);
    expect(toBool(1)).toBe(true);
    expect(toBool('yes')).toBe(true);
    expect(toBool('false')).toBe(false);
    expect(toBool(0)).toBe(false);
  });

  it('parseConstraint keeps !/* and coerces any finite number, defaulting to * only for non-numeric input', () => {
    expect(parseConstraint('!')).toBe('!');
    expect(parseConstraint('*')).toBe('*');
    expect(parseConstraint(0.001)).toBe(0.001);
    expect(parseConstraint(-1)).toBe(-1);
    // Number(null) === 0 is finite: ported as-is from the original conversion semantics.
    expect(parseConstraint(null)).toBe(0);
    expect(parseConstraint(undefined)).toBe('*');
    expect(parseConstraint('not-a-number')).toBe('*');
  });

  it('parseCycle converts "YYYYMMDD_HHmm" to ISO', () => {
    expect(parseCycle('20241202_0200')).toBe('2024-12-02T02:00:00.000Z');
  });

  it('cleanType blanks null/empty/-1 sentinel values', () => {
    expect(cleanType(null)).toBe('');
    expect(cleanType('')).toBe('');
    expect(cleanType(-1)).toBe('');
    expect(cleanType('Circular')).toBe('Circular');
  });
});

describe('runControlChecks — UK prism-delta control values', () => {
  it('confirms the three documented control checks pass (78.4100+8.9mm etc.)', () => {
    const results = runControlChecks();
    expect(results.every((r) => r.pass)).toBe(true);
    expect(results.find((r) => r.raw === 78.41)?.got).toBe(78.4189);
  });
});
