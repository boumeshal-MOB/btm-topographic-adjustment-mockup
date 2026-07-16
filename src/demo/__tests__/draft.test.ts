import { describe, expect, it } from 'vitest';
import { applyWizardDraftPatch, draftEngineNameCollisions, resolveDraftPhysicalIdentities } from '@/demo/draft';
import { createFreshStore } from '@/demo/store';

describe('wizard draft scientific state', () => {
  it('invalidates initial coordinates and the test epoch after an upstream change', () => {
    const store = createFreshStore(false);
    const draft = store.defaultDraft('uk-supplied-hs2-nte', 'single-station', ['NTE_ATS34']);
    draft.initialisation.result = store.computeDraftInitialisation(draft);
    draft.initialisation.result.accepted = true;
    draft.testEpochPassed = true;

    const changed = applyWizardDraftPatch(draft, { targets: draft.targets.map((target) => ({ ...target })) });

    expect(changed.initialisation.result).toBeUndefined();
    expect(changed.testEpochPassed).toBe(false);
  });

  it('keeps scientific results when only navigation or description changes', () => {
    const store = createFreshStore(false);
    const draft = store.defaultDraft('uk-supplied-hs2-nte', 'single-station', ['NTE_ATS34']);
    draft.initialisation.result = store.computeDraftInitialisation(draft);
    draft.testEpochPassed = true;

    const changed = applyWizardDraftPatch(draft, { step: 4, description: 'clearer label' });

    expect(changed.initialisation.result).toBe(draft.initialisation.result);
    expect(changed.testEpochPassed).toBe(true);
  });

  it('allows one engine name inside a confirmed point but rejects it across physical points', () => {
    const store = createFreshStore(false);
    const draft = store.defaultDraft('uk-supplied-hs2-nte', 'network', ['SYN_A', 'SYN_B']);
    const [first, second, third] = draft.targets;
    first.engineName = 'COMMON';
    second.engineName = 'OTHER';
    third.engineName = 'COMMON';
    draft.sharedPoints = [
      {
        key: 'SP_1',
        members: [
          { stationCode: first.stationCode, rawTargetName: first.rawTargetName },
          { stationCode: second.stationCode, rawTargetName: second.rawTargetName },
        ],
        source: 'manual',
      },
    ];

    expect(resolveDraftPhysicalIdentities(draft).identities.find((identity) => identity.physicalKey === 'shared:SP_1')?.members).toHaveLength(2);
    expect(draftEngineNameCollisions(draft)).toContain('COMMON');

    third.engineName = 'UNIQUE';
    expect(draftEngineNameCollisions(draft)).not.toContain('COMMON');
  });
});
