import { HttpResponse, http, type HttpHandler } from 'msw';
import ukPresetJson from '@/configs/uk-supplied-hs2-nte.v1.json';
import frPresetJson from '@/configs/fr-starnet-monitoring.v1.json';
import { demoStore } from '@/demo/store';
import type { WizardDraft } from '@/demo/draft';

/**
 * Demo API (single path, audit H-02): UI → TanStack Query → fetch → MSW → DemoStore.
 * Endpoints follow the logical surface of `domain/21 §12`, adapted to the mock-up. The future
 * BTM adapter replaces this layer with Fastify without touching domain or components.
 */

type Params = Record<string, string | readonly string[] | undefined>;
const num = (params: Params, key: string) => Number(params[key]);
const str = (params: Params, key: string) => String(params[key] ?? '');

function respond<T>(fn: () => T) {
  try {
    return HttpResponse.json(fn() as object);
  } catch (error) {
    return HttpResponse.json(
      { code: 'demo-error', message: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Unknown ${what}`);
  return value;
}

export const handlers: HttpHandler[] = [
  http.get('/api/v2/catalogue', () =>
    respond(() => ({
      stations: demoStore().catalogue.stations,
      references: demoStore().catalogue.references,
      lateDataDelivered: demoStore().db.lateDataDelivered,
    })),
  ),
  http.get('/api/v2/catalogue/targets/:stationCodes', ({ params }) =>
    respond(() =>
      demoStore().catalogue.targets.filter((t) => str(params, 'stationCodes').split(',').includes(t.stationCode)),
    ),
  ),
  http.get('/api/v2/templates', () => respond(() => [ukPresetJson, frPresetJson])),

  // drafts -------------------------------------------------------------------------------
  http.get('/api/v2/drafts', () => respond(() => demoStore().listDrafts())),
  http.post('/api/v2/drafts', async ({ request }) => {
    const body = (await request.json()) as { presetId: WizardDraft['countryPresetId']; scope: WizardDraft['scope'] };
    return respond(() => demoStore().createDraft(body.presetId, body.scope));
  }),
  http.get('/api/v2/drafts/:id', ({ params }) => respond(() => required(demoStore().getDraft(str(params, 'id')), 'draft'))),
  http.put('/api/v2/drafts/:id', async ({ request }) => {
    const body = (await request.json()) as WizardDraft;
    return respond(() => demoStore().saveDraft(body));
  }),
  http.delete('/api/v2/drafts/:id', ({ params }) =>
    respond(() => {
      demoStore().deleteDraft(str(params, 'id'));
      return { ok: true };
    }),
  ),
  http.post('/api/v2/drafts/:id/preset', async ({ params, request }) => {
    const { presetId } = (await request.json()) as { presetId: WizardDraft['countryPresetId'] };
    return respond(() => {
      const store = demoStore();
      const draft = required(store.getDraft(str(params, 'id')), 'draft');
      return store.saveDraft(store.applyPreset(draft, presetId));
    });
  }),
  http.post('/api/v2/drafts/:id/stations', async ({ params, request }) => {
    const { stationCodes } = (await request.json()) as { stationCodes: string[] };
    return respond(() => {
      const store = demoStore();
      const draft = required(store.getDraft(str(params, 'id')), 'draft');
      return store.saveDraft(store.applyStationSelection(draft, stationCodes));
    });
  }),
  http.post('/api/v2/drafts/:id/initialisation/compute', ({ params }) =>
    respond(() => {
      const store = demoStore();
      const draft = required(store.getDraft(str(params, 'id')), 'draft');
      const result = store.computeDraftInitialisation(draft);
      draft.initialisation.result = result;
      store.saveDraft(draft);
      return result;
    }),
  ),
  http.post('/api/v2/drafts/:id/geometry-check', async ({ params, request }) => {
    const body = (await request.json()) as { stationA: string; stationB: string; seeds: { aTargetKey: string; bTargetKey: string }[] };
    return respond(() => {
      const store = demoStore();
      const draft = required(store.getDraft(str(params, 'id')), 'draft');
      return store.geometryCheckForDraft(draft, body.stationA, body.stationB, body.seeds);
    });
  }),
  http.get('/api/v2/drafts/:id/connectivity', ({ params }) =>
    respond(() => demoStore().connectivityForDraft(required(demoStore().getDraft(str(params, 'id')), 'draft'))),
  ),
  http.get('/api/v2/drafts/:id/slots', ({ params }) =>
    respond(() => demoStore().availableSlotsForDraft(required(demoStore().getDraft(str(params, 'id')), 'draft'))),
  ),
  http.post('/api/v2/drafts/:id/test-epoch', async ({ params, request }) => {
    const { slot } = (await request.json()) as { slot: string };
    return respond(() => {
      const store = demoStore();
      const draft = required(store.getDraft(str(params, 'id')), 'draft');
      const result = store.testEpochForDraft(draft, slot);
      draft.testEpochPassed = result.diagnostic.ok && result.blocking.length === 0;
      store.saveDraft(draft);
      return result;
    });
  }),

  // processings --------------------------------------------------------------------------
  http.get('/api/v2/projects/:projectId/topographic-adjustments', () => respond(() => demoStore().listProcessings())),
  http.post('/api/v2/projects/:projectId/topographic-adjustments', async ({ request }) => {
    const { draftId, activate } = (await request.json()) as { draftId: string; activate: boolean };
    return respond(() => demoStore().createProcessing(draftId, activate));
  }),
  http.get('/api/v2/topographic-adjustments/:id', ({ params }) =>
    respond(() => required(demoStore().getProcessing(num(params, 'id')), 'processing')),
  ),
  http.post('/api/v2/topographic-adjustments/:id/actions', async ({ params, request }) => {
    const { action } = (await request.json()) as { action: 'activate' | 'deactivate' | 'archive' | 'duplicate' };
    return respond(() => demoStore().processingAction(num(params, 'id'), action));
  }),
  http.get('/api/v2/topographic-adjustments/:id/slots', ({ params }) =>
    respond(() => demoStore().availableSlotsForProcessing(num(params, 'id'))),
  ),
  http.post('/api/v2/topographic-adjustments/:id/run', async ({ params, request }) => {
    const { slot } = (await request.json()) as { slot?: string };
    return respond(() => (slot ? demoStore().runSlot(num(params, 'id'), slot, 'manual') : demoStore().runNow(num(params, 'id'))));
  }),
  http.post('/api/v2/topographic-adjustments/:id/catch-up', async ({ params, request }) => {
    const { slot } = (await request.json()) as { slot: string };
    return respond(() => demoStore().runSlot(num(params, 'id'), slot, 'catch-up'));
  }),
  http.post('/api/v2/topographic-adjustments/:id/test-run', async ({ params, request }) => {
    const { versionId, slot } = (await request.json()) as { versionId: string; slot: string };
    return respond(() => demoStore().testEpochForVersion(num(params, 'id'), versionId, slot));
  }),
  http.get('/api/v2/runs/:runId', ({ params }) => respond(() => required(demoStore().getRun(str(params, 'runId')), 'run'))),
  http.get('/api/v2/topographic-adjustments/:id/measures', ({ params }) =>
    respond(() => demoStore().measuresForProcessing(num(params, 'id'))),
  ),

  // versions -----------------------------------------------------------------------------
  http.post('/api/v2/topographic-adjustments/:id/config-versions/:versionId/activate', async ({ params, request }) => {
    const { validFrom } = (await request.json()) as { validFrom?: string };
    return respond(() => demoStore().activateVersion(num(params, 'id'), str(params, 'versionId'), validFrom));
  }),
  http.post('/api/v2/topographic-adjustments/:id/config-versions/:versionId/archive', ({ params }) =>
    respond(() => demoStore().archiveVersion(num(params, 'id'), str(params, 'versionId'))),
  ),
  http.post('/api/v2/topographic-adjustments/:id/config-versions/:versionId/duplicate', async ({ params, request }) => {
    const { reason } = (await request.json()) as { reason: string };
    return respond(() => demoStore().duplicateVersionAsDraft(num(params, 'id'), str(params, 'versionId'), reason));
  }),

  // reprocessing --------------------------------------------------------------------------
  http.post('/api/v2/topographic-adjustments/:id/reprocess/preview', async ({ params, request }) => {
    const body = (await request.json()) as { from: string; to: string; forcedVersionId?: string };
    return respond(() => demoStore().reprocessPreview(num(params, 'id'), body.from, body.to, body.forcedVersionId));
  }),
  http.post('/api/v2/topographic-adjustments/:id/reprocess', async ({ params, request }) => {
    const body = (await request.json()) as { from: string; to: string; reason: string; forcedVersionId?: string };
    return respond(() => demoStore().reprocess(num(params, 'id'), body.from, body.to, body.reason, body.forcedVersionId));
  }),

  // analysis lab ---------------------------------------------------------------------------
  http.post('/api/v2/topographic-adjustments/:id/analysis/trial', async ({ params, request }) => {
    const body = (await request.json()) as {
      versionId: string;
      slot: string;
      excludeObservationIds?: string[];
      disabledReferenceKeys?: string[];
      weightMultiplier?: number;
      useAutoAdjust?: boolean;
    };
    return respond(() => demoStore().analysisTrial({ processingId: num(params, 'id'), ...body }));
  }),
  http.post('/api/v2/topographic-adjustments/:id/analysis/candidate', async ({ params, request }) => {
    const body = (await request.json()) as { baseVersionId: string; reason: string; excludeObservationIds?: string[]; weightMultiplier?: number };
    return respond(() => demoStore().saveAnalysisCandidate({ processingId: num(params, 'id'), ...body }));
  }),

  // demo utilities (developer surface, not in product navigation) -------------------------
  http.get('/api/v2/audit', () => respond(() => demoStore().auditEntries())),
  http.post('/api/v2/demo/late-data', () => respond(() => demoStore().deliverLateData())),
  http.post('/api/v2/demo/reset', () =>
    respond(() => {
      demoStore().reset();
      return { ok: true };
    }),
  ),
];
