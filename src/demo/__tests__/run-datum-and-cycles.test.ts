import { beforeEach, describe, expect, it } from 'vitest';
import { clearDatabase } from '@/demo/persistence';
import { createFreshStore, type DemoStore } from '@/demo/store';

/**
 * Two properties of a run that the interface asserts out loud, so they cannot drift.
 *
 * 1. `references-available` counts what actually holds the cycle. It used to count every point that
 *    merely carried a control record — including one whose three components were all `free`, which
 *    is a row in the datum table and not a reference — so the published series disagreed with the
 *    ≥ 2 test running three lines beside it.
 *
 * 2. The coordinates a run adjusts from come from the initialisation and from nothing else. Changing
 *    the output slot changes the observations; it must not change a single coordinate.
 */
describe('what a run takes from the datum, and what it takes from the cycle', () => {
  let store: DemoStore;

  beforeEach(() => {
    clearDatabase();
    store = createFreshStore();
  });

  const seeded = () => {
    const processing = store.listProcessings()[0];
    const bundle = store.getProcessing(processing.id)!;
    const version = bundle.versions.find((item) => item.id === processing.activeConfigVersionId)!;
    return { processingId: processing.id, version, slots: store.availableSlotsForProcessing(processing.id) };
  };

  it('counts only the points that hold the cycle, not the records that exist', () => {
    const { processingId, version, slots } = seeded();
    const slot = slots.at(-1)!;

    const before = store.runSlot(processingId, slot, 'manual');
    expect(before.referencesAvailable).toBeGreaterThanOrEqual(2);

    /**
     * Free one held reference *without* removing its record — exactly the state the datum table
     * shows as a row with three greyed components. The count must drop by one.
     */
    const held = version.initialisation.references.filter((reference) =>
      [reference.modeE, reference.modeN, reference.modeH].some((mode) => mode !== 'free'));
    expect(held.length).toBeGreaterThanOrEqual(3);
    const freed = held[0];
    version.initialisation.references = version.initialisation.references.map((reference) =>
      reference.physicalPointId === freed.physicalPointId
        ? { ...reference, modeE: 'free' as const, modeN: 'free' as const, modeH: 'free' as const }
        : reference);

    const after = store.runSlot(processingId, slot, 'manual');
    expect(after.referencesAvailable).toBe((before.referencesAvailable ?? 0) - 1);
  });

  it('adjusts from the initialisation coordinates, whichever cycle it publishes', () => {
    const { processingId, slots } = seeded();
    expect(slots.length).toBeGreaterThanOrEqual(2);

    const snapshotOf = (slot: string) => {
      const run = store.runSlot(processingId, slot, 'manual');
      const diagnostic = store.getRun(run.id)!.diagnostic!;
      return {
        run,
        // The a-priori coordinates the solver started from, keyed by point.
        initial: new Map(diagnostic.points.map((point) => [point.engineName, point])),
      };
    };

    const first = snapshotOf(slots.at(-1)!);
    const second = snapshotOf(slots.at(-2)!);

    // Different cycles: the observations really did change.
    expect(second.run.outputSlot).not.toBe(first.run.outputSlot);

    /**
     * The version's own initial coordinates are the only source, and they are frozen in the version.
     * So whatever moved between the two runs, it is not the starting point.
     */
    const version = store.getProcessing(processingId)!.versions
      .find((item) => item.id === first.run.configVersionId)!;
    expect(version.initialisation.initialCoordinates.length).toBeGreaterThan(0);
    const secondVersion = store.getProcessing(processingId)!.versions
      .find((item) => item.id === second.run.configVersionId)!;
    expect(secondVersion.initialisation.initialCoordinates).toEqual(version.initialisation.initialCoordinates);
    expect(secondVersion.initialisation.references).toEqual(version.initialisation.references);
  });
});
