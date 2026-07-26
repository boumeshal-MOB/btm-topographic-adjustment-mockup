import type { DemoDatabase } from '@/demo/store';

/**
 * Increment only when persisted demo shapes are no longer safely compatible. The mock-up is not
 * a production database: starting a clean, deterministic fixture is safer than rendering a
 * partially migrated scientific configuration. Drafts, versions, runs and simulated measures
 * otherwise survive reloads via localStorage (DEMO-005).
 */
const STORAGE_KEY = 'btm-topographic-adjustment.demo.v2';
const LEGACY_STORAGE_KEYS = ['btm-topographic-adjustment.demo.v1'];

function storage(): Storage | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined; // e.g. privacy mode / SSR
  }
}

export function loadDatabase(): DemoDatabase | undefined {
  const currentStorage = storage();
  const raw = currentStorage?.getItem(STORAGE_KEY);
  if (!raw) {
    const legacyRaw = LEGACY_STORAGE_KEYS
      .map((key) => ({ key, raw: currentStorage?.getItem(key) }))
      .find((candidate) => candidate.raw);
    if (!legacyRaw?.raw) return undefined;
    try {
      const legacy = JSON.parse(legacyRaw.raw) as DemoDatabase;
      if (
        !Array.isArray(legacy.processings)
        || !Array.isArray(legacy.versions)
        || !Array.isArray(legacy.runs)
      ) {
        return undefined;
      }
      const migrated: DemoDatabase = {
        ...legacy,
        // Draft view-models are the only mutable UI shapes. Rebuild them from immutable versions.
        drafts: [],
        versions: legacy.versions.map((version) => ({
          ...version,
          // Active legacy snapshots necessarily passed the old activation gate.
          preflightTestedAt:
            version.preflightTestedAt
            ?? (version.status === 'active' ? version.createdAt : undefined),
        })),
      };
      currentStorage?.setItem(STORAGE_KEY, JSON.stringify(migrated));
      currentStorage?.removeItem(legacyRaw.key);
      return migrated;
    } catch {
      return undefined;
    }
  }
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
  for (const legacyKey of LEGACY_STORAGE_KEYS) storage()?.removeItem(legacyKey);
}
