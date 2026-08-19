import { beforeEach, describe, expect, it } from 'vitest';
import { createFreshStore, type DemoStore } from '@/demo/store';
import { clearDatabase } from '@/demo/persistence';
import { stationPointId } from '@/demo/resolve-run';
import type { WizardDraft } from '@/demo/draft';

/**
 * The datum of a run is decided in the Adjustment step, not deduced from how the approximate
 * coordinates were obtained.
 *
 * Fixing a station in Initialisation is a *computation device*: it turns observations into
 * approximate coordinates. Keeping that station fixed in every later run made the network its own
 * reference — the references carried no constraint, so nothing was ever controlled. STAR*NET gives a
 * station no special status either: it is a `C` record like any other.
 */
function coordinateRecord(dat: string, engineName: string): string[] {
  const line = dat.split('\n').find((candidate) => candidate.startsWith(`C  ${engineName}  `));
  if (!line) throw new Error(`No C record for ${engineName}`);
  return line.trim().split(/\s+/);
}

function preparedDraft(store: DemoStore): WizardDraft {
  const draft = store.createDraft('uk-supplied-hs2-nte', 'single-station');
  store.applyStationSelection(draft, ['NTE_ATS34']);
  draft.name = 'datum';
  draft.initialisation.result = store.computeDraftInitialisation(draft);
  draft.initialisation.result.accepted = true;
  return draft;
}

/** Three targets promoted to controlled references, as the Adjustment step would write them. */
function controlReferences(draft: WizardDraft, count = 3): string[] {
  const solved = draft.initialisation.result!.coordinates.slice(0, count);
  draft.initialisation.references = solved.map((coordinate) => ({
    pointKey: coordinate.pointKey,
    eastingM: coordinate.eastingM,
    northingM: coordinate.northingM,
    heightM: coordinate.heightM,
    modeE: 'weak' as const,
    modeN: 'weak' as const,
    modeH: 'weak' as const,
    sigmaM: 0.0015,
    sigmaHM: 0.002,
    source: 'test',
  }));
  return solved.map((coordinate) => coordinate.pointKey);
}

describe('the datum comes from the configuration, not from the initialisation mode', () => {
  let store: DemoStore;

  beforeEach(() => {
    clearDatabase();
    store = createFreshStore(false);
  });

  it('keeps the historical result of a version created before the datum moved', () => {
    // No station record at all: the local anchor stays fixed, with its synthetic orientation.
    const draft = preparedDraft(store);
    const test = store.testEpochForDraft(draft, store.availableSlotsForDraft(draft).at(-1)!);

    expect(coordinateRecord(test.previews.dat, 'NTE_ATS34').slice(5)).toEqual(['!', '!', '!']);
    expect(test.previews.dat).toContain('DN  BTMORI001');
  });

  it('frees the station and weights the references when the configuration says so', () => {
    const draft = preparedDraft(store);
    const controlled = controlReferences(draft);
    // "Free the stations, constrain the references", the one-click datum of the Adjustment step.
    draft.initialisation.references.push({
      pointKey: stationPointId('NTE_ATS34'),
      eastingM: 0,
      northingM: 0,
      heightM: 0,
      modeE: 'free',
      modeN: 'free',
      modeH: 'free',
      sigmaM: 0.001,
      source: 'test',
    });

    const test = store.testEpochForDraft(draft, store.availableSlotsForDraft(draft).at(-1)!);

    // The station is no longer held: it is adjusted like the rest of the network.
    expect(coordinateRecord(test.previews.dat, 'NTE_ATS34').slice(5)).toEqual(['*', '*', '*']);
    // …and the control now comes from the references, with their declared precision per component.
    expect(coordinateRecord(test.previews.dat, controlled[0]).slice(5)).toEqual(['0.0015', '0.0015', '0.0020']);
    // No synthetic backsight: the orientation follows from the geometry of the controlled points.
    expect(test.previews.dat).not.toContain('BTMORI');
    expect(test.diagnostic.constraintCount).toBe(controlled.length * 3);
  });

  it('honours a station fixed on purpose, without inventing a second datum', () => {
    const draft = preparedDraft(store);
    controlReferences(draft, 2);
    const station = draft.initialisation.result!.stationSolutions[0];
    draft.initialisation.references.push({
      pointKey: stationPointId('NTE_ATS34'),
      eastingM: station.eastingM,
      northingM: station.northingM,
      heightM: station.heightM,
      modeE: 'fixed',
      modeN: 'fixed',
      modeH: 'fixed',
      sigmaM: 0.001,
      source: 'test',
    });

    const test = store.testEpochForDraft(draft, store.availableSlotsForDraft(draft).at(-1)!);
    expect(coordinateRecord(test.previews.dat, 'NTE_ATS34').slice(5)).toEqual(['!', '!', '!']);
    // Points are controlled, so the orientation is not forced on top of the fixed station.
    expect(test.previews.dat).not.toContain('BTMORI');
  });

  it('refuses a configuration where nothing at all is controlled', () => {
    const draft = preparedDraft(store);
    draft.initialisation.references = [{
      pointKey: stationPointId('NTE_ATS34'),
      eastingM: 0,
      northingM: 0,
      heightM: 0,
      modeE: 'free',
      modeN: 'free',
      modeH: 'free',
      sigmaM: 0.001,
      source: 'test',
    }];

    const test = store.testEpochForDraft(draft, store.availableSlotsForDraft(draft).at(-1)!);
    expect(test.blocking.join(' ')).toMatch(/no datum/);
  });
});
