import type { ChiSquareStatus } from '@/domain/entities';

/**
 * Engine gateway (`implementation/30-REUTILISATION-DU-PROTOTYPE.md §2`). `ResolvedRunInput`
 * and `AdjustmentDiagnostic` are intentionally left as provisional shapes here: they are
 * defined precisely once the corrections (T01.4) and demo engine (T01.10) tasks that own their
 * fields land, so this session does not pre-decide that design. `BrowserLeastSquaresDemoEngine`
 * (T01.10) and the future `StarNetApiGateway` (production, out of mock-up scope) both implement
 * this interface.
 */
export interface ResolvedRunInput {
  processingId: number;
  configVersionId: string;
  outputSlot: string;
}

export interface AdjustmentDiagnostic {
  /**
   * Canonical `ChiSquareStatus` from the domain (audit item 2 of this pass): never redeclared
   * as a local union. `not-applicable` when `dof <= 0` — never a plain `passed`/`failed` in that
   * case (audit B-04, ADJ-006/010).
   */
  chiSquareStatus: ChiSquareStatus;
  convergence: number;
  rank: number;
  degreesOfFreedom: number;
  varianceFactor: number;
}

export interface AdjustmentEngine {
  testEpoch(input: ResolvedRunInput, signal?: AbortSignal): Promise<AdjustmentDiagnostic>;
}
