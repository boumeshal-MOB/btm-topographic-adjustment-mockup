import { beforeEach, describe, expect, it } from 'vitest';
import { clearDatabase } from '@/demo/persistence';
import { createFreshStore, type DemoStore } from '@/demo/store';

/**
 * The `C` records of the STAR*NET input come from the initialisation and from nothing else.
 *
 * The question this answers, asked directly: does changing the measurement cycle change the
 * coordinates the adjustment starts from? It must not. A run resolves observations per slot; the
 * approximate coordinates and the datum are frozen in the configuration version, so two different
 * cycles of the same version hand STAR*NET the same `C` block and differ only in their `M`/`DM`
 * observation lines.
 *
 * Asserted on the generated file rather than on the resolver, because the file is what STAR*NET
 * actually reads — and a regression could just as easily come from the builder as from the resolver.
 */
/** The `C` records, keyed by point name, so two cycles can be compared point by point. */
function coordinateByPoint(dat: string): Map<string, string> {
  return new Map(dat.split('\n')
    .filter((line) => line.startsWith('C '))
    .map((line) => [line.trim().split(/\s+/)[1], line]));
}

function observationLines(dat: string): string[] {
  return dat.split('\n').filter((line) => /^(M|DM|DB|DN)\s/.test(line));
}

describe('the .dat coordinates across cycles', () => {
  let store: DemoStore;

  beforeEach(() => {
    clearDatabase();
    store = createFreshStore();
  });

  it('gives every point the same coordinate whichever cycle is published', () => {
    const processing = store.listProcessings()[0];
    const slots = store.availableSlotsForProcessing(processing.id);
    expect(slots.length).toBeGreaterThanOrEqual(2);

    const previewFor = (slot: string) => {
      const run = store.runSlot(processing.id, slot, 'manual');
      const detail = store.getRun(run.id)!;
      expect(detail.previews?.dat, `slot ${slot} produced no .dat`).toBeTruthy();
      return detail.previews!.dat;
    };

    const first = previewFor(slots.at(-1)!);
    const second = previewFor(slots.at(-2)!);

    const firstPoints = coordinateByPoint(first);
    const secondPoints = coordinateByPoint(second);
    const shared = [...firstPoints.keys()].filter((name) => secondPoints.has(name));
    expect(shared.length).toBeGreaterThan(10);

    // The invariant: the same point gets the same C record, character for character.
    for (const name of shared) {
      expect(secondPoints.get(name), `C record of ${name} changed between cycles`).toBe(firstPoints.get(name));
    }

    /**
     * What legitimately differs is the *set* of points, not their coordinates: a point nobody
     * measured in a cycle is not in that cycle's adjustment, which is also why the reference count
     * is per cycle. Every point present in one file and absent from the other must be unobserved
     * there — never a point that was dropped while its observations were kept.
     */
    const onlyInFirst = [...firstPoints.keys()].filter((name) => !secondPoints.has(name));
    for (const name of onlyInFirst) {
      expect(observationLines(second).some((line) => line.includes(name)), `${name} is absent from the C block but still observed`).toBe(false);
    }

    // …and the two runs really did read different measurements, or the test proves nothing.
    expect(observationLines(second)).not.toEqual(observationLines(first));
  });
});
