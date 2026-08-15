import { runDemoAdjustmentWithAutoAdjust } from '@/domain/engine/demo-engine-core';
import type { ResolvedRunInput } from '@/domain/engine/run-input';

/**
 * Web Worker wrapper around the pure demo engine core (VALIDATION-DATASETS.md §8): keeps the UI thread free.
 * The core is pure; this file is the only place that knows about the worker runtime.
 */
self.onmessage = (event: MessageEvent<{ requestId: number; input: ResolvedRunInput }>) => {
  const { requestId, input } = event.data;
  try {
    const diagnostic = runDemoAdjustmentWithAutoAdjust(input);
    self.postMessage({ requestId, ok: true, diagnostic });
  } catch (error) {
    self.postMessage({ requestId, ok: false, message: error instanceof Error ? error.message : String(error) });
  }
};
