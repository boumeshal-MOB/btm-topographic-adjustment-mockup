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
 *
 * Two kinds now coexist:
 *
 * - **system templates**, the two shipped JSON files. Read-only, and never persisted: editing the
 *   file must reach an existing installation, which it cannot do if a copy is frozen in a database;
 * - **user templates**, created by duplicating a system one and stored by the demo store, which
 *   registers them here on load through `registerTemplates`.
 *
 * `PRESETS` stays a plain object looked up by id, because every call site already does exactly that
 * and threading a store through `station-precision.ts` — imported by view models and components —
 * would close the cycle this module exists to avoid.
 */

const SYSTEM_PRESETS: Record<string, CountryPresetSeed> = {
  'uk-supplied-hs2-nte': countryPresetSchema.parse(ukPresetJson),
  'fr-starnet-monitoring': countryPresetSchema.parse(frPresetJson),
};

/** Ids that cannot be edited or deleted: they belong to the repository, not to the database. */
export const SYSTEM_TEMPLATE_IDS = Object.keys(SYSTEM_PRESETS);

export const isSystemTemplate = (id: string): boolean => SYSTEM_TEMPLATE_IDS.includes(id);

export const PRESETS: Record<string, CountryPresetSeed> = { ...SYSTEM_PRESETS };

/**
 * Replaces the user templates known to the registry, leaving the system ones untouched.
 *
 * Called by the store whenever its template list changes, so a lookup by id anywhere in the
 * application sees the same template the store holds.
 */
export function registerTemplates(templates: readonly CountryPresetSeed[]): void {
  for (const id of Object.keys(PRESETS)) {
    if (!isSystemTemplate(id)) delete PRESETS[id];
  }
  for (const template of templates) {
    if (isSystemTemplate(template.id)) continue; // a user template may never shadow a system one
    PRESETS[template.id] = template;
  }
}

/** The system templates, freshly cloned, as the starting point of a duplicate. */
export function systemTemplate(id: string): CountryPresetSeed | undefined {
  const found = SYSTEM_PRESETS[id];
  return found ? structuredClone(found) : undefined;
}

/** Manufacturer-nominal Topcon MS05AXII proposal used when FR weights are unresolved (D-05). */
export const FR_PROPOSED_WEIGHTS: StarNetWeights = {
  distanceStdErrM: 0.0008,
  distancePpm: 1,
  angleArcSec: 0.5,
  directionArcSec: 0.5,
  azimuthArcSec: 0.5,
  instrumentCenteringM: 0.0005,
  targetCenteringM: 0.0005,
  verticalCenteringM: 0.0005,
  zenithArcSec: 0.5,
};
