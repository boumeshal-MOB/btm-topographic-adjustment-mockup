import type { AdjustmentDiagnostic, ResolvedRunInput } from '@/domain/engine/run-input';

/**
 * Engine gateway (`implementation/30-REUTILISATION-DU-PROTOTYPE.md §2/§5`). The precise
 * `ResolvedRunInput`/`AdjustmentDiagnostic` shapes live in the pure domain
 * (`src/domain/engine/run-input.ts`) so both implementations consume the same contract:
 * - `BrowserLeastSquaresDemoEngine` (src/workers) — the mock-up's Web Worker demo solver;
 * - the future production `StarNetApiGateway` — contract only, never implemented here.
 */
export type { AdjustmentDiagnostic, ResolvedRunInput };

export interface AdjustmentEngine {
  testEpoch(input: ResolvedRunInput, signal?: AbortSignal): Promise<AdjustmentDiagnostic>;
}
