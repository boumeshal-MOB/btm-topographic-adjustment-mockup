import type { CountryPresetSeed } from '@/domain/schemas/countryPreset.schema';

/**
 * A template modified in the catalogue never changes an existing configuration (VER-004): a
 * run always resolves from the `AdjustmentConfigVersion` snapshot, never from the current
 * catalogue state.
 */
export interface TemplateRepository {
  listCountryPresets(): Promise<CountryPresetSeed[]>;
  getCountryPreset(id: string, version: number): Promise<CountryPresetSeed | undefined>;
}
