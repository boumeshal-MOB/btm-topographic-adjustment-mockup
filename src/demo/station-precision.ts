import { FR_PROPOSED_WEIGHTS, PRESETS } from '@/demo/presets';
import type { DraftStationConfig, DraftTargetConfig, WizardDraft } from '@/demo/draft';
import type { DistanceKind } from '@/domain/entities';
import {
  instrumentPrecisionFromTemplate,
  resolveSightPrecision,
  type InstrumentPrecision,
  type ResolvedSightPrecision,
} from '@/domain/instruments/measurement-precision';
import { reflectorOptions, type ReflectorOption } from '@/domain/instruments/reflector-catalogue';

/**
 * The bridge between a draft and the precision chain: template → station instrument → sight.
 *
 * Every screen that shows a standard error reads it through here, so the Instruments step, the
 * Targets step and the Adjustment step can never disagree about what a sight will be weighted with.
 */

/** What a country template's 3D input mode means for a station's stored distances. */
function templateDistanceKind(input3dMode: string | undefined): DistanceKind {
  return input3dMode?.toLowerCase().includes('horiz') ? 'horizontal' : 'slope';
}

/** The precision a country template states for one station's instrument. */
export function templateStationPrecision(
  countryPresetId: string,
  instrumentTemplateId: string,
): InstrumentPrecision {
  const preset = PRESETS[countryPresetId];
  const template = preset?.instrumentTemplates.find((candidate) => candidate.id === instrumentTemplateId)
    ?? preset?.instrumentTemplates[0];
  return instrumentPrecisionFromTemplate(
    template,
    preset?.adjustment.defaultWeights,
    FR_PROPOSED_WEIGHTS,
    templateDistanceKind(preset?.adjustment.input3dMode),
  );
}

/** The reflectors this draft's country template offers. */
export function draftReflectorOptions(countryPresetId: string): ReflectorOption[] {
  return reflectorOptions(PRESETS[countryPresetId]?.measurementSetups ?? []);
}

/**
 * The precision in force at a station — its own, or the template's when the station never restated
 * one. A draft written before the precision moved to the station has none, and must keep behaving.
 */
export function stationInstrumentPrecision(
  draft: Pick<WizardDraft, 'countryPresetId'>,
  station: DraftStationConfig,
): InstrumentPrecision {
  return station.precision ?? templateStationPrecision(draft.countryPresetId, station.instrumentTemplateId);
}

/** The numbers one sight will be weighted with, and where each came from. */
export function targetPrecision(
  draft: Pick<WizardDraft, 'countryPresetId' | 'stations'>,
  target: DraftTargetConfig,
): ResolvedSightPrecision {
  const station = draft.stations.find((candidate) => candidate.stationCode === target.stationCode);
  const instrument = station
    ? stationInstrumentPrecision(draft, station)
    : templateStationPrecision(draft.countryPresetId, '');
  return resolveSightPrecision(instrument, target, !(station?.precisionEdited ?? false));
}
