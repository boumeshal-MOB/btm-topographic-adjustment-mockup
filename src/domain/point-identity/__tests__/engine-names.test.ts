import { describe, expect, it } from 'vitest';
import { assignEngineNames, engineNameIssues, isValidEngineName } from '@/domain/point-identity/engine-names';

describe('engine name validation (NAME-004/005)', () => {
  it('NAME-004 accepts [A-Za-z0-9_] up to 15 characters', () => {
    expect(isValidEngineName('L34RE1100_329')).toBe(true);
    expect(isValidEngineName('PT000001')).toBe(true);
    expect(isValidEngineName('a')).toBe(true);
  });

  it('NAME-005 rejects hyphen, space, comma, =, # and quotes', () => {
    for (const bad of ['A-B', 'A B', 'A,B', 'A=B', 'A#B', "A'B", 'A"B']) {
      expect(isValidEngineName(bad)).toBe(false);
    }
  });

  it('NAME-004 rejects names longer than 15 characters and empty names', () => {
    expect(isValidEngineName('ABCDEFGHIJKLMNOP')).toBe(false);
    expect(isValidEngineName('')).toBe(false);
    expect(engineNameIssues('THIS_IS_TOO_LONG_1234')).toContain('longer than 15 characters');
  });
});

describe('assignEngineNames (NAME-006/008, POINT-003)', () => {
  it('keeps valid Lookup AdjustmentNames unchanged (POINT-003)', () => {
    const result = assignEngineNames([
      { sourceKey: 'S|T1', candidate: 'L34RE1100_329' },
      { sourceKey: 'S|T2', candidate: 'CP_301_34' },
    ]);
    expect(result[0].engineName).toBe('L34RE1100_329');
    expect(result[0].aliased).toBe(false);
    expect(result[1].engineName).toBe('CP_301_34');
  });

  it('NAME-006 collisions get a deterministic neutral alias, stable across runs', () => {
    const entries = [
      { sourceKey: 'S1|A', candidate: 'SAME' },
      { sourceKey: 'S2|A', candidate: 'SAME' },
    ];
    const first = assignEngineNames(entries);
    const second = assignEngineNames(entries);
    expect(first[0].engineName).toBe('SAME');
    expect(first[1].engineName).toMatch(/^PT\d{6}$/);
    expect(first[1].aliased).toBe(true);
    expect(second).toEqual(first); // deterministic
  });

  it('invalid candidates are aliased and NAME-008 keeps the reverse mapping complete', () => {
    const result = assignEngineNames([
      { sourceKey: 'S|bad name', candidate: 'bad name' },
      { sourceKey: 'S|nocand' },
    ]);
    expect(result).toHaveLength(2);
    expect(new Set(result.map((r) => r.engineName)).size).toBe(2);
    expect(result.every((r) => r.sourceKey)).toBe(true);
    expect(result[0].aliased).toBe(true);
  });

  it('NAME-007 generated aliases never use the MPO prefix', () => {
    const result = assignEngineNames([{ sourceKey: 'S|x', candidate: 'invalid name' }]);
    expect(result[0].engineName.startsWith('MPO')).toBe(false);
  });
});
