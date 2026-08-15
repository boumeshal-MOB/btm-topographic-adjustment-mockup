import type { AdjustmentEngine } from '@/repositories/adjustment-engine';
import type { AdjustmentDiagnostic, ResolvedRunInput } from '@/domain/engine/run-input';
import { runDemoAdjustmentWithAutoAdjust } from '@/domain/engine/demo-engine-core';

/**
 * `BrowserLeastSquaresDemoEngine` — the mock-up implementation of `AdjustmentEngine`
 * (VALIDATION-DATASETS.md §8): runs the pure core in a Web Worker so the UI thread never blocks, supports
 * abort, and falls back to a synchronous run where workers are unavailable (unit tests, SSR).
 * The production `StarNetApiGateway` will implement the same interface server-side.
 */
export class BrowserLeastSquaresDemoEngine implements AdjustmentEngine {
  private worker?: Worker;
  private requestId = 0;

  private ensureWorker(): Worker | undefined {
    if (typeof Worker === 'undefined') return undefined;
    if (!this.worker) {
      this.worker = new Worker(new URL('./demo-adjustment.worker.ts', import.meta.url), { type: 'module' });
    }
    return this.worker;
  }

  async testEpoch(input: ResolvedRunInput, signal?: AbortSignal): Promise<AdjustmentDiagnostic> {
    const worker = this.ensureWorker();
    if (!worker) return runDemoAdjustmentWithAutoAdjust(input);

    const requestId = ++this.requestId;
    return new Promise<AdjustmentDiagnostic>((resolve, reject) => {
      const onMessage = (event: MessageEvent<{ requestId: number; ok: boolean; diagnostic?: AdjustmentDiagnostic; message?: string }>) => {
        if (event.data.requestId !== requestId) return;
        cleanup();
        if (event.data.ok && event.data.diagnostic) resolve(event.data.diagnostic);
        else reject(new Error(event.data.message ?? 'Demo engine failed'));
      };
      const onAbort = () => {
        cleanup();
        // terminate so a long-running solve actually stops; next call restarts the worker
        this.worker?.terminate();
        this.worker = undefined;
        reject(new DOMException('Adjustment aborted', 'AbortError'));
      };
      const cleanup = () => {
        worker.removeEventListener('message', onMessage);
        signal?.removeEventListener('abort', onAbort);
      };
      worker.addEventListener('message', onMessage);
      signal?.addEventListener('abort', onAbort, { once: true });
      worker.postMessage({ requestId, input });
    });
  }
}
