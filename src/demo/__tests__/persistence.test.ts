import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDatabase, lastPersistResult, loadDatabase, persistDatabase } from '@/demo/persistence';
import type { DemoDatabase } from '@/demo/store';

/**
 * Browser storage is finite and the failure mode was silent: `setItem` threw, nothing said so, and
 * the in-memory store drifted away from disk until a screen failed to reopen on the next visit.
 * These tests pin the two behaviours that prevent it — shrink rather than fail, and say so.
 */

const STORAGE_KEY = 'btm-topographic-adjustment.demo.v2';

function database(runCount: number): DemoDatabase {
  const runs = Array.from({ length: runCount }, (_, index) => ({
    id: `run-${index}`,
    processingId: 1,
    configVersionId: 'cfg-1',
    outputSlot: '2026-01-01T00:00:00.000Z',
    trigger: 'manual' as const,
    status: 'success' as const,
    // ascending, so `run-0` is the oldest and must be the first dropped
    startedAt: new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
    stationEpochs: [],
    autoAdjustAttempts: 0,
  }));
  const diagnostics: DemoDatabase['diagnostics'] = {};
  for (const run of runs) {
    // deliberately bulky, like a real residual set
    diagnostics[run.id] = { residuals: Array.from({ length: 200 }, () => ({ v: 'x'.repeat(40) })) } as never;
  }
  return {
    nextId: 1,
    processings: [],
    versions: [],
    outputVariables: [],
    measures: {},
    runs,
    diagnostics,
    drafts: [],
    audit: [],
    lateDataDelivered: false,
    validationSessions: [],
  };
}

describe('persisting the demo database', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearDatabase();
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps only the most recent run diagnostics, oldest dropped first', () => {
    const result = persistDatabase(database(20));

    expect(result.status).toBe('ok');
    expect(result.droppedDiagnostics).toBe(8);

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!) as DemoDatabase;
    expect(Object.keys(stored.diagnostics)).toHaveLength(12);
    // the run summaries themselves are never dropped — only their derived detail
    expect(stored.runs).toHaveLength(20);
    expect(stored.diagnostics['run-19']).toBeDefined();
    expect(stored.diagnostics['run-0']).toBeUndefined();
  });

  it('shrinks the snapshot instead of failing when storage is full', () => {
    let allowed = 0;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
      // accept only a payload small enough to represent a nearly-full quota
      if (String(value).length > 60_000) throw new DOMException('QuotaExceededError');
      allowed += 1;
      Object.defineProperty(window.localStorage, key, { value, configurable: true, writable: true });
    });

    const result = persistDatabase(database(20));

    expect(setItem).toHaveBeenCalled();
    expect(allowed).toBe(1);
    expect(result.status).toBe('pruned');
    expect(result.droppedDiagnostics).toBeGreaterThan(0);
    expect(lastPersistResult().status).toBe('pruned');
  });

  it('reports failure when even the smallest snapshot will not fit', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    const result = persistDatabase(database(3));

    // The caller can now warn the user; previously this was swallowed and the session silently
    // stopped being saved.
    expect(result.status).toBe('failed');
    expect(lastPersistResult().status).toBe('failed');
  });

  it('rejects a stored snapshot whose collections have the wrong shape', () => {
    // A database written by another version could turn an array into an object, which only
    // surfaced deep inside a screen as "t.find is not a function".
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...database(1),
      processings: { nope: true },
    }));
    expect(loadDatabase()).toBeUndefined();

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...database(1), diagnostics: [] }));
    expect(loadDatabase()).toBeUndefined();

    window.localStorage.setItem(STORAGE_KEY, 'not json at all');
    expect(loadDatabase()).toBeUndefined();
  });

  it('rejects a snapshot whose nested collections have the wrong shape', () => {
    // Checking the top level was not enough: these three passed the old guard and then failed on a
    // run detail with `diagnostic.points.filter is not a function`, inside the recovery page that
    // blames "an older mock-up version" without saying what to do about it.
    const asObject = (values: unknown[]) => Object.fromEntries(values.map((value, index) => [index, value]));

    const withObjectPoints = database(1);
    withObjectPoints.diagnostics['run-0'] = { points: asObject([{ engineName: 'A' }]), residuals: [] } as never;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(withObjectPoints));
    expect(loadDatabase()).toBeUndefined();

    const withObjectEpochs = database(1);
    withObjectEpochs.runs[0] = { ...withObjectEpochs.runs[0], stationEpochs: asObject([{ stationId: 1 }]) } as never;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(withObjectEpochs));
    expect(loadDatabase()).toBeUndefined();

    const withObjectReferences = database(1);
    withObjectReferences.versions = [{
      id: 'cfg-1',
      stationBindings: [],
      targetBindings: [],
      physicalPoints: [],
      initialisation: { references: asObject([{ physicalPointId: 'p1' }]), initialCoordinates: [] },
    }] as never;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(withObjectReferences));
    expect(loadDatabase()).toBeUndefined();
  });

  it('still accepts a snapshot written before a collection existed', () => {
    // `validationSessions` post-dates the v2 key: an older snapshot without it stays loadable.
    const older = database(1) as Partial<DemoDatabase>;
    delete older.validationSessions;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(older));
    expect(loadDatabase()).toBeDefined();
  });

  it('round-trips a healthy database', () => {
    persistDatabase(database(2));
    const loaded = loadDatabase();
    expect(loaded?.runs).toHaveLength(2);
    expect(Object.keys(loaded!.diagnostics)).toHaveLength(2);
  });
});
