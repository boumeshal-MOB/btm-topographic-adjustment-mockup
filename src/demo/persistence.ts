import type { DemoDatabase } from '@/demo/store';

/**
 * Demo persistence (demo/40 §9): drafts, versions, runs and simulated measures survive a reload
 * via localStorage. A reset returns to the seed. This is demo-only state (DEMO-005) — the
 * production BTM reads/writes PostgreSQL/TimescaleDB behind the same repository interfaces.
 */
const STORAGE_KEY = 'btm-topographic-adjustment.demo.v1';

function storage(): Storage | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined; // e.g. privacy mode / SSR
  }
}

export function loadDatabase(): DemoDatabase | undefined {
  const raw = storage()?.getItem(STORAGE_KEY);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as DemoDatabase;
  } catch {
    return undefined;
  }
}

export function persistDatabase(db: DemoDatabase): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // ignore quota / unavailable storage — the in-memory store still works this session
  }
}

export function clearDatabase(): void {
  storage()?.removeItem(STORAGE_KEY);
}
