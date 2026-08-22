import { beforeEach, describe, expect, it } from 'vitest';
import { clearDatabase } from '@/demo/persistence';
import { createFreshStore, type DemoStore } from '@/demo/store';
import { PRESETS, isSystemTemplate } from '@/demo/presets';

/**
 * Country templates as data the user owns, rather than two constants compiled into the bundle.
 *
 * The two shipped templates stay read-only and are never persisted: a change to the JSON file has to
 * reach an existing installation, which it cannot do if a copy is frozen in localStorage. Everything
 * else is created by duplicating one — a country template is a coherent set of decisions, and a
 * blank one would be a trap rather than a starting point.
 */
describe('country templates', () => {
  let store: DemoStore;

  beforeEach(() => {
    clearDatabase();
    store = createFreshStore(false);
  });

  it('lists the shipped templates as system, and nothing else at first', () => {
    const templates = store.listTemplates();
    expect(templates.map((template) => template.id).sort())
      .toEqual(['fr-starnet-monitoring', 'uk-supplied-hs2-nte']);
    expect(templates.every((template) => template.isSystem)).toBe(true);
  });

  it('duplicates a template under a readable id and registers it for lookup', () => {
    const created = store.createTemplate({ sourceId: 'fr-starnet-monitoring', label: 'FR — tunnel Lyon' });

    expect(created.id).toBe('fr-tunnel-lyon');
    expect(created.version).toBe(1);
    expect(created.provenance.at(-1)).toContain('Duplicated from');
    // Same decisions as its source, so it is usable immediately.
    expect(created.adjustment.angleOutputUnits).toBe('Gons');
    // …and every lookup by id — station precision, reflector options — now finds it.
    expect(PRESETS['fr-tunnel-lyon']).toBeDefined();
    expect(isSystemTemplate('fr-tunnel-lyon')).toBe(false);
  });

  it('never lets two templates share an id', () => {
    const first = store.createTemplate({ sourceId: 'uk-supplied-hs2-nte', label: 'Projet A' });
    const second = store.createTemplate({ sourceId: 'uk-supplied-hs2-nte', label: 'Projet A' });
    expect(first.id).toBe('projet-a');
    expect(second.id).toBe('projet-a-2');
  });

  it('refuses to edit or delete a shipped template', () => {
    expect(() => store.updateTemplate('uk-supplied-hs2-nte', { label: 'x' })).toThrow(/system template/);
    expect(() => store.deleteTemplate('fr-starnet-monitoring')).toThrow(/system template/);
  });

  it('edits a user template, counts a version, and keeps its id', () => {
    const created = store.createTemplate({ sourceId: 'uk-supplied-hs2-nte', label: 'Projet B' });
    const updated = store.updateTemplate(created.id, {
      adjustment: { ...created.adjustment, indexOfRefraction: 0.2, maximumIterations: 42 },
    });

    expect(updated.id).toBe(created.id); // a version already created points at it
    expect(updated.version).toBe(2);
    expect(updated.adjustment.indexOfRefraction).toBe(0.2);
    expect(PRESETS[created.id].adjustment.maximumIterations).toBe(42);
  });

  it('rejects a template whose values stop being valid', () => {
    const created = store.createTemplate({ sourceId: 'uk-supplied-hs2-nte', label: 'Projet C' });
    expect(() => store.updateTemplate(created.id, {
      adjustment: { ...created.adjustment, scaleFactor: 0 },
    })).toThrow();
  });

  it('keeps a template a draft still points at', () => {
    const created = store.createTemplate({ sourceId: 'uk-supplied-hs2-nte', label: 'Projet D' });
    store.createDraft(created.id, 'single-station');

    expect(store.listTemplates().find((template) => template.id === created.id)?.inUse).toBe(true);
    expect(() => store.deleteTemplate(created.id)).toThrow(/used by a processing or a draft/);
  });

  it('deletes a template nothing points at', () => {
    const created = store.createTemplate({ sourceId: 'uk-supplied-hs2-nte', label: 'Projet E' });
    expect(store.deleteTemplate(created.id)).toEqual({ ok: true });
    expect(PRESETS[created.id]).toBeUndefined();
  });

  it('builds a draft on a user template, precision included', () => {
    const created = store.createTemplate({ sourceId: 'fr-starnet-monitoring', label: 'FR — viaduc' });
    const draft = store.createDraft(created.id, 'single-station');
    store.applyStationSelection(draft, ['FR_ST01']);

    expect(draft.countryPresetId).toBe(created.id);
    // The FR template declares 0.5″ angular accuracy and 0.8 mm on a prism; a duplicate must carry
    // both to the station, which only works if the lookup by id resolves the user template.
    const precision = draft.stations[0]?.precision;
    expect(precision?.directionArcSec).toBe(0.5);
    expect(precision?.distanceByFamily.prism.stdErrMm).toBe(0.8);
  });
});
