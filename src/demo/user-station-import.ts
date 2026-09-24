import type { CatalogueFragment, CatalogueStation, CatalogueTarget } from '@/demo/catalogue';
import { estimatedCycleMinutes } from '@/domain/station-import';
import type { UserStationImportBatch } from '@/demo/user-station-import-persistence';

const FORMAT_LABELS = {
  'campbell-toa5-double-face': 'Campbell TOA5 · Face I/II',
  'uk-rts-points-environment': 'UK RTS · Points + Environment',
  'observation-table': 'Observation table · Hz/Vz/Sd',
  'gka-v40-total-station': 'GKA Version40 · Total station',
} as const;

function targetSensorId(stationId: number, targetIndex: number): number {
  // User station ids start at 900,000. This disjoint namespace keeps the explicit BTM-like ids
  // stable after reload without sharing the fixture catalogue's module-level counter.
  return stationId * 1_000 + targetIndex + 1;
}

/** Converts persisted browser imports into the same explicit catalogue contract as BTM data. */
export function userStationImportFragment(batches: UserStationImportBatch[]): CatalogueFragment {
  const stations: CatalogueStation[] = [];
  const targets: CatalogueTarget[] = [];
  const observationsByStation = new Map<string, UserStationImportBatch['stations'][number]['observations']>();
  const acquisitionEpochsByStation = new Map<string, string[]>();
  const envByStation = new Map<string, UserStationImportBatch['stations'][number]['environment']>();

  for (const batch of batches) {
    for (const imported of batch.stations) {
      const epochs = [...imported.acquisitionEpochs].sort();
      stations.push({
        stationId: imported.stationId,
        stationCode: imported.stationCode,
        datasetId: 'user-import',
        datasetLabel: `Imported · ${FORMAT_LABELS[imported.detectedFormat]}`,
        observationCount: imported.observations.length,
        targetCount: imported.targetNames.length,
        firstEpoch: epochs[0] ?? '',
        lastEpoch: epochs.at(-1) ?? '',
        estimatedCycleMinutes: estimatedCycleMinutes(epochs),
        hasEnvironmentVariables: imported.environment.length > 0,
        temperatureVariableId: imported.environment.length > 0 ? imported.stationId * 100 + 1 : undefined,
        pressureVariableId: imported.environment.length > 0 ? imported.stationId * 100 + 2 : undefined,
        defaultInstrumentHeightM: 0,
        userImportId: batch.id,
        detectedFormat: imported.detectedFormat,
        sourceFileNames: imported.sourceFileNames,
      });
      observationsByStation.set(imported.stationCode, imported.observations);
      acquisitionEpochsByStation.set(imported.stationCode, epochs);
      envByStation.set(imported.stationCode, imported.environment);

      const observationCounts = new Map<string, number>();
      for (const observation of imported.observations) {
        observationCounts.set(
          observation.rawTargetName,
          (observationCounts.get(observation.rawTargetName) ?? 0) + 1,
        );
      }
      imported.targetNames.forEach((rawTargetName, targetIndex) => {
        const sensorId = targetSensorId(imported.stationId, targetIndex);
        targets.push({
          stationCode: imported.stationCode,
          rawTargetName,
          prismSensorId: sensorId,
          hzVariableId: sensorId * 10 + 1,
          vzVariableId: sensorId * 10 + 2,
          sdVariableId: sensorId * 10 + 3,
          observationCount: observationCounts.get(rawTargetName) ?? 0,
          targetHeightM: 0,
          isKnownReference: false,
        });
      });
    }
  }

  return {
    stations,
    targets,
    references: [],
    observationsByStation,
    acquisitionEpochsByStation,
    envByStation,
  };
}
