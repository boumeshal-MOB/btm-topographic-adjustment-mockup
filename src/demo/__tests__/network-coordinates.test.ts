import { beforeEach, describe, expect, it } from 'vitest';
import { clearDatabase } from '@/demo/persistence';
import { createFreshStore, type DemoStore } from '@/demo/store';
import {
  DATUM_APPROXIMATION_SOURCE,
  resolveNetworkCoordinates,
  stationPointId,
  withManualCoordinate,
} from '@/demo/network-coordinates';
import { buildDatumRows } from '@/features/create/datum-view-model';
import type { WizardDraft } from '@/demo/draft';

/**
 * The regression this file exists for.
 *
 * Constraining a point at the Targets step — before the initialisation had ever run — created a
 * control record at `0, 0, 0`. Nothing corrected it afterwards, because the read was
 * `control?.eastingM ?? computed?.eastingM` and `0` is not nullish. The zero survived into the `C`
 * line of the STAR*NET input, pinned the network to the origin, and produced the degenerate solution
 * whose `NaN` variance factor crashed the screen three screens away.
 *
 * So the record no longer owns the numbers: it owns the fixed/weak/free decision. The coordinates are
 * resolved, once, from the initialisation.
 */
function draftWithInitialisation(store: DemoStore): WizardDraft {
  const draft = store.createDraft('uk-supplied-hs2-nte', 'single-station');
  store.applyStationSelection(draft, ['NTE_ATS34']);
  draft.initialisation.result = store.computeDraftInitialisation(draft);
  draft.initialisation.result.accepted = true;
  return draft;
}

function coordinateRecord(dat: string, engineName: string): string[] {
  const line = dat.split('\n').find((candidate) => candidate.startsWith(`C  ${engineName}  `));
  if (!line) throw new Error(`No C record for ${engineName}`);
  return line.trim().split(/\s+/);
}

describe('where a point coordinate comes from', () => {
  let store: DemoStore;

  beforeEach(() => {
    clearDatabase();
    store = createFreshStore(false);
  });

  it('has no coordinate at all before the initialisation has run', () => {
    const draft = store.createDraft('uk-supplied-hs2-nte', 'single-station');
    store.applyStationSelection(draft, ['NTE_ATS34']);

    const rows = buildDatumRows(draft);
    expect(rows.length).toBeGreaterThan(0);
    // Not zero. A zero is a coordinate, and this point has none.
    for (const row of rows) {
      expect(row.eastingM).toBeNull();
      expect(row.northingM).toBeNull();
      expect(row.heightM).toBeNull();
      expect(row.origin).toBeUndefined();
    }
  });

  it('reads the computed coordinate even when the control record was written at zero', () => {
    const draft = draftWithInitialisation(store);
    const target = draft.initialisation.result!.coordinates[0]!;
    // Exactly what the Targets step used to write before the initialisation had produced anything.
    draft.initialisation.references = [{
      pointKey: target.pointKey,
      eastingM: 0,
      northingM: 0,
      heightM: 0,
      modeE: 'weak',
      modeN: 'weak',
      modeH: 'weak',
      sigmaM: 0.0015,
      source: DATUM_APPROXIMATION_SOURCE,
    }];

    const row = buildDatumRows(draft).find((candidate) => candidate.pointKey === target.pointKey)!;
    expect(row.eastingM).toBeCloseTo(target.eastingM, 6);
    expect(row.northingM).toBeCloseTo(target.northingM, 6);
    expect(row.origin).toBe('computed');
  });

  it('prefers a coordinate the survey declared over the one the resection computed', () => {
    const draft = draftWithInitialisation(store);
    const target = draft.initialisation.result!.coordinates[0]!;
    draft.initialisation.references = [{
      pointKey: target.pointKey,
      eastingM: 111.111,
      northingM: 222.222,
      heightM: 333.333,
      modeE: 'weak',
      modeN: 'weak',
      modeH: 'weak',
      sigmaM: 0.0015,
      source: 'references.csv',
    }];

    const resolved = resolveNetworkCoordinates(draft).get(target.pointKey)!;
    expect(resolved).toMatchObject({ eastingM: 111.111, northingM: 222.222, origin: 'declared' });
  });

  it('lets a value entered by hand win, and lets it be taken back', () => {
    const draft = draftWithInitialisation(store);
    const target = draft.initialisation.result!.coordinates[0]!;

    draft.initialisation.enteredCoordinates = withManualCoordinate(draft, target.pointKey, {
      eastingM: 999.5,
      northingM: 888.5,
      heightM: 77.5,
    });
    expect(resolveNetworkCoordinates(draft).get(target.pointKey)).toMatchObject({
      eastingM: 999.5,
      origin: 'manual',
    });

    draft.initialisation.enteredCoordinates = [];
    expect(resolveNetworkCoordinates(draft).get(target.pointKey)!.origin).toBe('computed');
  });

  it('keeps an observed point the initialisation never solved, at the origin and with a message', () => {
    /**
     * The point used to be dropped with a warning nobody could act on: the surveyor saw a target
     * measured and absent from the result, with no way to tell why. It now enters the adjustment free
     * at 0/0/0 — the solver has an approximation to iterate from — and the message says where the zero
     * comes from, because a point starting far from its true position may not converge.
     */
    const draft = draftWithInitialisation(store);
    draft.name = 'unsolved point';
    draft.initialisation.references = draft.initialisation.result!.coordinates.slice(0, 3)
      .map((coordinate) => ({
        pointKey: coordinate.pointKey,
        eastingM: coordinate.eastingM,
        northingM: coordinate.northingM,
        heightM: coordinate.heightM,
        modeE: 'weak' as const,
        modeN: 'weak' as const,
        modeH: 'weak' as const,
        sigmaM: 0.0015,
        source: 'test',
      }));
    // Every point but the three controls loses its coordinate, so whichever ones the slot observed
    // are certainly among them.
    const kept = new Set(draft.initialisation.references.map((control) => control.pointKey));
    draft.initialisation.result!.coordinates = draft.initialisation.result!.coordinates
      .filter((coordinate) => kept.has(coordinate.pointKey));

    const test = store.testEpochForDraft(draft, store.availableSlotsForDraft(draft).at(-1)!);

    const unsolved = test.warnings.filter((warning) => warning.includes('free at 0/0/0'));
    expect(unsolved.length).toBeGreaterThan(0);
    const named = unsolved[0]!.split(' ')[1]!;
    expect(kept.has(named)).toBe(false);
    // Present in the input rather than silently absent from it: the sight is written, and the point
    // is there to be adjusted. Whether the solve converges from the origin is the message's point.
    expect(test.previews.dat).toContain(named);
  });

  it('writes the resolved coordinate into the STAR*NET input, never the record zero', () => {
    const draft = draftWithInitialisation(store);
    draft.name = 'coordinates';
    const controlled = draft.initialisation.result!.coordinates.slice(0, 3);
    draft.initialisation.references = [
      ...controlled.map((coordinate) => ({
        pointKey: coordinate.pointKey,
        // Zeros on purpose: this is the state the bug left behind, and the `C` line must not show it.
        eastingM: 0,
        northingM: 0,
        heightM: 0,
        modeE: 'weak' as const,
        modeN: 'weak' as const,
        modeH: 'weak' as const,
        sigmaM: 0.0015,
        source: DATUM_APPROXIMATION_SOURCE,
      })),
      {
        pointKey: stationPointId('NTE_ATS34'),
        eastingM: 0,
        northingM: 0,
        heightM: 0,
        modeE: 'free' as const,
        modeN: 'free' as const,
        modeH: 'free' as const,
        sigmaM: 0.001,
        source: DATUM_APPROXIMATION_SOURCE,
      },
    ];

    const test = store.testEpochForDraft(draft, store.availableSlotsForDraft(draft).at(-1)!);
    const record = coordinateRecord(test.previews.dat, controlled[0]!.pointKey);

    // The template decides whether E or N is written first (`coordinateOrder`), so compare the pair.
    const written = [Number(record[2]), Number(record[3])].sort((a, b) => a - b);
    const expected = [controlled[0]!.eastingM, controlled[0]!.northingM].sort((a, b) => a - b);
    expect(written[0]).toBeCloseTo(expected[0]!, 3);
    expect(written[1]).toBeCloseTo(expected[1]!, 3);
    expect(written.some((value) => value === 0)).toBe(false);
    // Three controlled points and a free station: the network solves instead of degenerating.
    expect(Number.isFinite(test.diagnostic.varianceFactor)).toBe(true);
  });
});
