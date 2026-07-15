import { describe, expect, it } from 'vitest';
import { alignSlot, listSlots, nearestSlot, resolveConfigForSlot, selectStationCycle, selectStationEpoch } from '@/domain/time/slots';

describe('slot alignment (TIME-002/004)', () => {
  it('TIME-004 a 30-minute grid publishes at :00/:30', () => {
    expect(alignSlot('2025-03-01T09:31:00.000Z', 30)).toBe('2025-03-01T09:30:00.000Z');
    expect(alignSlot('2025-03-01T09:59:59.000Z', 30)).toBe('2025-03-01T09:30:00.000Z');
    expect(nearestSlot('2025-03-01T09:25:00.000Z', 30)).toBe('2025-03-01T09:30:00.000Z');
    expect(nearestSlot('2025-03-01T09:32:00.000Z', 30)).toBe('2025-03-01T09:30:00.000Z');
  });

  it('lists all slots on the grid inside a range', () => {
    const slots = listSlots('2025-03-01T09:05:00.000Z', '2025-03-01T10:35:00.000Z', 30);
    expect(slots).toEqual([
      '2025-03-01T09:30:00.000Z',
      '2025-03-01T10:00:00.000Z',
      '2025-03-01T10:30:00.000Z',
    ]);
  });
});

describe('selectStationEpoch (RUN-003..005, TIME-001/003)', () => {
  const epochs = ['2025-03-01T09:25:00.000Z', '2025-03-01T09:26:00.000Z', '2025-03-01T08:40:00.000Z'];
  const SLOT = '2025-03-01T09:30:00.000Z';

  it('epochs :25/:26 publish the :30 slot as fresh with unchanged source timestamps (TIME-003)', () => {
    const selection = selectStationEpoch(epochs, SLOT, 10, 45);
    expect(selection.state).toBe('fresh');
    expect(selection.epoch).toBe('2025-03-01T09:26:00.000Z'); // latest, untouched
    expect(selection.ageMinutes).toBeCloseTo(4, 6);
  });

  it('an epoch slightly after the slot but inside the tolerance still belongs to it (:32 → :30)', () => {
    const selection = selectStationEpoch(['2025-03-01T09:32:00.000Z'], SLOT, 10, 45);
    expect(selection.state).toBe('fresh');
    expect(selection.epoch).toBe('2025-03-01T09:32:00.000Z');
  });

  it('an old epoch inside the maximum age is reused (RUN-004)', () => {
    const selection = selectStationEpoch(['2025-03-01T08:50:00.000Z'], SLOT, 10, 45);
    expect(selection.state).toBe('reused');
    expect(selection.ageMinutes).toBeCloseTo(40, 6);
  });

  it('beyond the maximum reused age the station is missing (RUN-006 blocking input)', () => {
    const selection = selectStationEpoch(['2025-03-01T08:00:00.000Z'], SLOT, 10, 45);
    expect(selection.state).toBe('missing');
    expect(selection.epoch).toBeUndefined();
  });
});

describe('selectStationCycle', () => {
  const cycleSlot = '2025-03-01T10:00:00.000Z';
  it('selects one station cycle before choosing target observations', () => {
    const observations = [
      { id: 'old-a', epoch: '2025-03-01T09:30:00.000Z', rawTargetName: 'A' },
      { id: 'old-b', epoch: '2025-03-01T09:31:00.000Z', rawTargetName: 'B' },
      { id: 'new-a', epoch: '2025-03-01T09:58:00.000Z', rawTargetName: 'A' },
      { id: 'new-b', epoch: '2025-03-01T10:02:00.000Z', rawTargetName: 'B' },
    ];
    const selected = selectStationCycle(observations, cycleSlot, 5, 10, 45, 10);
    expect(selected.state).toBe('fresh');
    expect(selected.observations.map((item) => item.id).sort()).toEqual(['new-a', 'new-b']);
    expect(selected.sourceFrom).toBe('2025-03-01T09:58:00.000Z');
    expect(selected.sourceTo).toBe('2025-03-01T10:02:00.000Z');
  });

  it('does not mix independently selected target epochs from different cycles', () => {
    const observations = [
      { id: 'a-new', epoch: '2025-03-01T09:59:00.000Z', rawTargetName: 'A' },
      { id: 'b-old', epoch: '2025-03-01T09:30:00.000Z', rawTargetName: 'B' },
    ];
    const selected = selectStationCycle(observations, cycleSlot, 5, 10, 45, 10);
    expect(selected.observations.map((item) => item.id)).toEqual(['a-new']);
  });
});

describe('resolveConfigForSlot (TIME-006/007/008)', () => {
  const versions = [
    { id: 'v1', status: 'archived' as const, validFrom: '2025-01-01T00:00:00.000Z', validTo: '2025-03-01T00:00:00.000Z' },
    { id: 'v2', status: 'active' as const, validFrom: '2025-03-01T00:00:00.000Z', validTo: undefined },
    { id: 'draft', status: 'draft' as const, validFrom: '2020-01-01T00:00:00.000Z', validTo: undefined },
  ];

  it('picks the version whose [validFrom, validTo[ contains the slot — inclusive from, exclusive to', () => {
    expect(resolveConfigForSlot(versions, '2025-02-28T23:59:59.000Z')?.id).toBe('v1');
    expect(resolveConfigForSlot(versions, '2025-03-01T00:00:00.000Z')?.id).toBe('v2'); // boundary: exclusive for v1
    expect(resolveConfigForSlot(versions, '2025-06-01T00:00:00.000Z')?.id).toBe('v2');
  });

  it('an archived version still resolves for its historical period (TIME-007/008)', () => {
    expect(resolveConfigForSlot(versions, '2025-01-15T12:00:00.000Z')?.id).toBe('v1');
  });

  it('draft versions never resolve', () => {
    expect(resolveConfigForSlot([versions[2]], '2025-01-15T12:00:00.000Z')).toBeUndefined();
  });
});
