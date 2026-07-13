import { describe, expect, it } from 'vitest';
import ukPreset from '@/configs/uk-supplied-hs2-nte.v1.json';
import frPreset from '@/configs/fr-starnet-monitoring.v1.json';
import { countryPresetSchema, hasUnresolvedDecision } from '@/domain/schemas/countryPreset.schema';

describe('countryPresetSchema (T01.3)', () => {
  it('parses the UK supplied HS2/NTE seed with all decisions resolved', () => {
    const parsed = countryPresetSchema.parse(ukPreset);
    expect(parsed.country).toBe('UK');
    expect(parsed.adjustment.angleOutputUnits).toBe('DMS');
    expect(parsed.adjustment.indexOfRefraction).toBe(0.07);
    expect(parsed.adjustment.earthRadiusM).toBe(6372000);
    expect(parsed.adjustment.maximumIterations).toBe(10);
    expect(parsed.adjustment.autoAdjust).toEqual({
      enabled: true,
      maxStandardizedResidual: 3.0,
      outliersRemovedPerIteration: 1,
      maxIterations: 20,
    });
    expect(hasUnresolvedDecision(parsed)).toBe(false);
  });

  it('parses the FR STAR*NET monitoring seed and reports defaultWeights as an unresolved decision', () => {
    const parsed = countryPresetSchema.parse(frPreset);
    expect(parsed.country).toBe('FR');
    expect(parsed.adjustment.angleOutputUnits).toBe('Gons');
    expect(parsed.adjustment.defaultWeights).toBeNull();
    expect(parsed.adjustment.reviewRequiredFields).toContain('adjustment.defaultWeights');
    // audit D-05 / configs/README.md: null means "decision required", never zero.
    expect(hasUnresolvedDecision(parsed)).toBe(true);
  });

  it('rejects a preset with an out-of-range chi-square significance', () => {
    const base = ukPreset as { adjustment: Record<string, unknown> };
    const invalid = { ...ukPreset, adjustment: { ...base.adjustment, chiSquareSignificancePercent: 150 } };
    expect(() => countryPresetSchema.parse(invalid)).toThrow();
  });
});
