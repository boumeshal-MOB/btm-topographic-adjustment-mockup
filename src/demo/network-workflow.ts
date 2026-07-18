import type { WizardDraft } from '@/demo/draft';
import type { DemoStore } from '@/demo/store';
import { applyDistanceCorrections } from '@/domain/corrections';
import {
  checkLocalGeometry,
  localPointFromObservation,
  type GeometryCheck,
  type SeedPair,
} from '@/domain/point-identity/local-geometry';
import type { RawObservation } from '@/domain/entities';

export interface DraftObservationCycles {
  stationCode: string;
  epochs: string[];
}

/**
 * The first station is the network timing reference. Returned epochs are real acquisition cycles
 * from the demo raw-data catalogue, never an invented regular calendar grid.
 */
export function observationCyclesForDraft(store: DemoStore, draft: WizardDraft): DraftObservationCycles {
  const stationCode = draft.stationCodes[0] ?? '';
  const epochs = [...new Set((store.catalogue.observationsByStation.get(stationCode) ?? []).map((item) => item.epoch))].sort();
  return { stationCode, epochs };
}

function correctedDistances(
  store: DemoStore,
  draft: WizardDraft,
  observations: RawObservation[],
): Map<string, number> {
  const setupByKey = new Map(draft.targets.map((target) => [
    `${target.stationCode}|${target.rawTargetName}`,
    target,
  ]));
  const policyByStation = new Map(draft.stations.map((station) => [
    station.stationCode,
    station.atmosphericPolicy,
  ]));
  const corrected = new Map<string, number>();

  for (const observation of observations) {
    const target = setupByKey.get(`${observation.stationCode}|${observation.rawTargetName}`);
    const policy = policyByStation.get(observation.stationCode);
    if (!target || !policy) continue;
    const result = applyDistanceCorrections(
      observation,
      {
        measurementType: target.measurementType,
        requiredConstantM: target.requiredConstantM,
        alreadyAppliedConstantM: target.alreadyAppliedConstantM,
        sourceByField: {},
      },
      policy,
      store.catalogue.envByStation.get(observation.stationCode) ?? [],
    );
    corrected.set(observation.id, result.finalSlopeDistanceM);
  }
  return corrected;
}

/** Geometry proposal with user-controlled horizontal/vertical tolerances. */
export function geometryCheckForDraftWithTolerance(
  store: DemoStore,
  draft: WizardDraft,
  stationA: string,
  stationB: string,
  seeds: SeedPair[],
  horizontalToleranceM: number,
  verticalToleranceM: number,
): GeometryCheck {
  const cloud = (stationCode: string) => {
    const station = draft.stations.find((item) => item.stationCode === stationCode);
    const observations = (store.catalogue.observationsByStation.get(stationCode) ?? []).filter(
      (observation) =>
        observation.epoch >= draft.initialisation.windowFrom && observation.epoch <= draft.initialisation.windowTo,
    );
    const corrected = correctedDistances(store, draft, observations);
    const latest = new Map<string, RawObservation>();
    for (const observation of observations) {
      const previous = latest.get(observation.rawTargetName);
      if (!previous || observation.epoch > previous.epoch) latest.set(observation.rawTargetName, observation);
    }
    return [...latest.values()].map((observation) => {
      const target = draft.targets.find(
        (item) => item.stationCode === stationCode && item.rawTargetName === observation.rawTargetName,
      );
      return localPointFromObservation({
        targetKey: observation.rawTargetName,
        hzDeg: observation.hzDeg,
        vzDeg: observation.vzDeg,
        correctedSlopeDistanceM: corrected.get(observation.id) ?? observation.sdM,
        instrumentHeightM: station?.instrumentHeightM ?? 0,
        targetHeightM: target?.targetHeightM ?? 0,
      });
    });
  };

  const safeHorizontal = Math.max(0.001, Math.min(1, horizontalToleranceM));
  const safeVertical = Math.max(0.001, Math.min(1, verticalToleranceM));
  return checkLocalGeometry(cloud(stationA), cloud(stationB), seeds, safeHorizontal, safeVertical);
}
