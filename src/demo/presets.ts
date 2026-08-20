import ukPresetJson from '@/configs/uk-supplied-hs2-nte.v1.json';
import frPresetJson from '@/configs/fr-starnet-monitoring.v1.json';
import type { StarNetWeights } from '@/domain/entities';
import { countryPresetSchema, type CountryPresetSeed } from '@/domain/schemas/countryPreset.schema';

/**
 * The country templates, parsed once.
 *
 * They live here rather than in the store so that anything needing a template default — the
 * instrument precision of a station, the reflectors a sight may pick — can read one without pulling
 * in the whole demo store, which imports the draft model and would close an import cycle.
 */

const ukPreset = countryPresetSchema.parse(ukPresetJson);
const frPreset = countryPresetSchema.parse(frPresetJson);

export const PRESETS: Record<string, CountryPresetSeed> = {
  'uk-supplied-hs2-nte': ukPreset,
  'fr-starnet-monitoring': frPreset,
};

/** Manufacturer-nominal Topcon MS05AXII proposal used when FR weights are unresolved (D-05). */
export const FR_PROPOSED_WEIGHTS: StarNetWeights = {
  distanceStdErrM: 0.0008,
  distancePpm: 1,
  angleArcSec: 0.5,
  directionArcSec: 0.5,
  azimuthArcSec: 0.5,
  zenithArcSec: 0.5,
  instrumentCenteringM: 0.0005,
  targetCenteringM: 0.0005,
  verticalCenteringM: 0.0005,
};
