import { afterEach, describe, expect, it } from 'vitest';
import { clearDatabase, loadDatabase } from '@/demo/persistence';
import { createFreshStore } from '@/demo/store';

afterEach(() => {
  clearDatabase();
  localStorage.clear();
});

describe('demo persistence compatibility', () => {
  it('keeps processings and runs from v1 while dropping incompatible mutable drafts', () => {
    const seeded = createFreshStore().db;
    seeded.drafts.push({
      id: 'obsolete-edit',
      stations: undefined,
    } as never);
    const runCount = seeded.runs.length;
    localStorage.clear();
    localStorage.setItem('btm-topographic-adjustment.demo.v1', JSON.stringify(seeded));

    const migrated = loadDatabase();

    expect(migrated?.processings).toHaveLength(seeded.processings.length);
    expect(migrated?.runs).toHaveLength(runCount);
    expect(migrated?.drafts).toEqual([]);
    expect(migrated?.versions.find((version) => version.status === 'active')?.preflightTestedAt)
      .toBeTruthy();
    expect(localStorage.getItem('btm-topographic-adjustment.demo.v1')).toBeNull();
    expect(localStorage.getItem('btm-topographic-adjustment.demo.v2')).not.toBeNull();
  });
});
