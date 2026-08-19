import type { DemoDatabase } from '@/demo/store';

/**
 * Increment only when persisted demo shapes are no longer safely compatible. The mock-up is not
 * a production database: starting a clean, deterministic fixture is safer than rendering a
 * partially migrated scientific configuration. Drafts, versions, runs and simulated measures
 * otherwise survive reloads via localStorage (DEMO-005).
 */
const STORAGE_KEY = 'btm-topographic-adjustment.demo.v2';
const LEGACY_STORAGE_KEYS = ['btm-topographic-adjustment.demo.v1'];

/**
 * Retention for run diagnostics — the open question in VALIDATION-AND-OPEN-DECISIONS.md, answered
 * here for the mock-up.
 *
 * Diagnostics are 57% of the stored database and are dominated by one residual record per scalar
 * observation. Importing a dozen validation datasets used to reach the ~5 MB localStorage quota,
 * at which point `setItem` threw, the failure was swallowed, and the in-memory store silently
 * diverged from disk: the processing you were working on simply did not exist when you came back,
 * and the screen failed to open. Diagnostics are derived data — the run summary carries the
 * verdict — so the newest ones are kept and older runs keep their summary alone.
 */
const MAX_PERSISTED_DIAGNOSTICS = 12;
const FALLBACK_DIAGNOSTIC_LIMITS = [6, 2, 0];

export type PersistStatus = 'ok' | 'pruned' | 'failed' | 'unavailable';

export interface PersistResult {
  status: PersistStatus;
  /** Size actually written, in bytes. */
  bytes: number;
  /** Number of run diagnostics dropped to make the snapshot fit. */
  droppedDiagnostics: number;
}

let lastResult: PersistResult = { status: 'ok', bytes: 0, droppedDiagnostics: 0 };

/** Status of the most recent write, so the interface can say when work is not being saved. */
export function lastPersistResult(): PersistResult {
  return lastResult;
}

function storage(): Storage | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined; // e.g. privacy mode / SSR
  }
}

/** Newest-first run ids, so retention keeps what the user is most likely still looking at. */
function recentRunIds(db: DemoDatabase, limit: number): Set<string> {
  const ordered = [...db.runs].sort((left, right) =>
    (right.startedAt ?? '').localeCompare(left.startedAt ?? ''));
  return new Set(ordered.slice(0, limit).map((run) => run.id));
}

/**
 * The snapshot to write. Everything the product needs to reopen is kept; only derived diagnostics
 * beyond the retention window are dropped, and the run summaries that reference them stay intact.
 */
function snapshotForStorage(db: DemoDatabase, diagnosticLimit: number): {
  snapshot: DemoDatabase;
  dropped: number;
} {
  const keep = recentRunIds(db, diagnosticLimit);
  const diagnostics: DemoDatabase['diagnostics'] = {};
  let dropped = 0;
  for (const [runId, diagnostic] of Object.entries(db.diagnostics)) {
    if (diagnosticLimit > 0 && keep.has(runId)) diagnostics[runId] = diagnostic;
    else dropped += 1;
  }
  return { snapshot: { ...db, diagnostics }, dropped };
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
      if (!isUsableDatabase(legacy)) return undefined;
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
    const parsed = JSON.parse(raw) as DemoDatabase;
    // A snapshot written by another version can be structurally wrong in ways that only surface
    // deep inside a screen (`.find is not a function`). Reject it here and reseed instead.
    return isUsableDatabase(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function hasArrays(value: unknown, keys: readonly string[]): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return keys.every((key) => record[key] === undefined || Array.isArray(record[key]));
}

/**
 * Every collection the store or a screen iterates must have the shape it expects.
 *
 * The top level is not enough: a snapshot written by another build passed this check and then failed
 * deep inside a screen — `diagnostic.points.filter is not a function` on a run detail — because the
 * nested collections were never verified. They are cheap to check and they are what the interface
 * actually walks, so a snapshot that cannot be rendered is rejected here and the fixture is reseeded.
 */
function isUsableDatabase(value: unknown): value is DemoDatabase {
  if (typeof value !== 'object' || value === null) return false;
  const db = value as Record<string, unknown>;
  const arrays = ['processings', 'versions', 'outputVariables', 'runs', 'drafts', 'audit'];
  for (const key of arrays) {
    if (!Array.isArray(db[key])) return false;
  }
  const records = ['measures', 'diagnostics'];
  for (const key of records) {
    if (typeof db[key] !== 'object' || db[key] === null || Array.isArray(db[key])) return false;
  }
  // `validationSessions` post-dates the v2 key, so an older snapshot legitimately has none.
  if (db['validationSessions'] !== undefined && !Array.isArray(db['validationSessions'])) return false;

  const versions = db['versions'] as unknown[];
  const versionCollections = ['stationBindings', 'targetBindings', 'physicalPoints', 'geometricRelationships'];
  for (const version of versions) {
    if (!hasArrays(version, versionCollections)) return false;
    const initialisation = (version as Record<string, unknown>)['initialisation'];
    if (initialisation !== undefined && !hasArrays(initialisation, ['references', 'initialCoordinates'])) {
      return false;
    }
  }
  for (const run of db['runs'] as unknown[]) {
    if (!hasArrays(run, ['stationEpochs'])) return false;
  }
  for (const diagnostic of Object.values(db['diagnostics'] as Record<string, unknown>)) {
    if (!hasArrays(diagnostic, ['points', 'residuals', 'autoAdjustAttempts', 'warnings', 'deficientUnknowns'])) {
      return false;
    }
  }
  return true;
}

/**
 * Writes the snapshot, shrinking it rather than failing silently.
 *
 * Returns the outcome so the interface can tell the user their work is no longer being saved
 * instead of letting them discover it after closing the tab.
 */
export function persistDatabase(db: DemoDatabase): PersistResult {
  const currentStorage = storage();
  if (!currentStorage) {
    lastResult = { status: 'unavailable', bytes: 0, droppedDiagnostics: 0 };
    return lastResult;
  }

  for (const [attempt, limit] of [MAX_PERSISTED_DIAGNOSTICS, ...FALLBACK_DIAGNOSTIC_LIMITS].entries()) {
    const { snapshot, dropped } = snapshotForStorage(db, limit);
    const payload = JSON.stringify(snapshot);
    try {
      currentStorage.setItem(STORAGE_KEY, payload);
      lastResult = {
        status: attempt === 0 ? 'ok' : 'pruned',
        bytes: payload.length,
        droppedDiagnostics: dropped,
      };
      return lastResult;
    } catch {
      // quota exceeded — retry with a shorter retention window
    }
  }

  lastResult = { status: 'failed', bytes: 0, droppedDiagnostics: 0 };
  return lastResult;
}

export function clearDatabase(): void {
  storage()?.removeItem(STORAGE_KEY);
  for (const legacyKey of LEGACY_STORAGE_KEYS) storage()?.removeItem(legacyKey);
  lastResult = { status: 'ok', bytes: 0, droppedDiagnostics: 0 };
}
