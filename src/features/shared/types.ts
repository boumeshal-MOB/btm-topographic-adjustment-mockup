/**
 * View-model types shared by the feature screens. They mirror the demo API payloads
 * (produced by `src/demo/store.ts` and served through MSW) so the UI stays decoupled
 * from the store implementation — a real BTM backend only has to honour these shapes.
 */
import type { AdjustmentDiagnostic } from '@/domain/engine/run-input';
import type { CorrectionTrace } from '@/domain/corrections';
import type {
  AdjustmentRunSummary,
  AutoAdjustConfig,
  ProcessingOutputVariable,
  TopographicAdjustmentProcessing,
} from '@/domain/entities';
import type { AuditEntry, StoredVersion } from '@/demo/store';

/** Per-station epoch selection outcome for one output slot (RUN-003..006). */
export interface StationEpochInfo {
  stationId: number;
  stationCode: string;
  epoch?: string;
  state: 'fresh' | 'reused' | 'missing';
  ageMinutes?: number;
}

/** Correction application summary — proves prism/atmospheric corrections ran exactly once. */
export interface CorrectionSummary {
  observations: number;
  nonZeroPrismDeltas: number;
  atmosphericCorrections: number;
  sampleTraces: CorrectionTrace[];
}

/** Result of "Test one epoch" on a draft or a stored config version (never persisted). */
export interface TestEpochResult {
  slot: string;
  diagnostic: AdjustmentDiagnostic;
  stationEpochs: StationEpochInfo[];
  provisional: boolean;
  blocking: string[];
  warnings: string[];
  correctionSummary: CorrectionSummary;
  previews: { dat: string; snproj: string };
}

/** `GET /topographic-adjustments/:id` — processing with versions, stable variables and runs. */
export interface ProcessingDetail {
  processing: TopographicAdjustmentProcessing;
  versions: StoredVersion[];
  variables: (ProcessingOutputVariable & { key: string })[];
  runs: AdjustmentRunSummary[];
}

/** `GET /runs/:runId` — one run with its stored diagnostic and regenerated previews. */
export interface RunDetail {
  run: AdjustmentRunSummary;
  diagnostic?: AdjustmentDiagnostic;
  previews?: { dat: string; snproj: string };
  correctionSummary?: CorrectionSummary;
  starNetBridge?: {
    autoAdjust: AutoAdjustConfig;
  };
}

/** `GET /topographic-adjustments/:id/measures` — one stable variable and its UPSERTed series. */
export type VariableSeries = ProcessingOutputVariable & {
  key: string;
  series: { timestamp: string; value: number }[];
};

/** `POST /topographic-adjustments/:id/reprocess/preview` (TIME-007/008 per-slot resolution). */
export interface ReprocessPreview {
  slots: { slot: string; versionId?: string; versionLabel?: string; hasData: boolean; existingMeasures: number }[];
  totals: { slotCount: number; withConfig: number; withData: number; measuresToReplace: number };
}

export interface ReprocessResult {
  executed: number;
  runs: { id: string; slot: string; status: AdjustmentRunSummary['status'] }[];
}

/** `POST /topographic-adjustments/:id/analysis/trial` — never persisted (ADJ-007/009). */
export interface AnalysisTrialResult {
  diagnostic: AdjustmentDiagnostic;
  alerts: string[];
  stationEpochs: StationEpochInfo[];
  baselineObservationCount: number;
}

export type { AuditEntry, StoredVersion };
