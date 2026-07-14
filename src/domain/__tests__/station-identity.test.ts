import { describe, expect, it } from 'vitest';
import type { StationBinding } from '@/domain/entities';
import { resolveStationCodeById, resolveStationIdByCode } from '@/domain/station-identity';

const bindings: StationBinding[] = [
  {
    stationId: 101,
    stationCode: 'NTE_ATS34',
    required: true,
    instrumentTemplateId: 'leica-tm50-i',
    instrumentHeightM: 0,
    atmosphericPolicy: {
      mode: 'cycle-temperature-pressure',
      missingPolicy: 'wait-or-fail',
      marksResultProvisional: false,
      catchUpOnLateData: true,
      formulaId: 'standard-ppm-v1',
      formulaVersion: 1,
    },
  },
];

describe('station identity — explicit code↔id mapping (audit item 3)', () => {
  it('resolves the numeric BTM stationId from a raw station code', () => {
    expect(resolveStationIdByCode('NTE_ATS34', bindings)).toBe(101);
  });

  it('resolves the raw station code from a numeric BTM stationId', () => {
    expect(resolveStationCodeById(101, bindings)).toBe('NTE_ATS34');
  });

  it('returns undefined for an unbound code (no implicit string/number join)', () => {
    expect(resolveStationIdByCode('UNKNOWN', bindings)).toBeUndefined();
    expect(resolveStationCodeById(999, bindings)).toBeUndefined();
  });
});
