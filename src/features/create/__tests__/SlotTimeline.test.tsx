import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SlotTimeline } from '@/features/create/SlotTimeline';

/**
 * The timeline exists to explain fresh/reused/missing, so what matters is that its verdicts are
 * the resolver's and not a second implementation of the rule. Each case below is built so the
 * expected verdict follows arithmetically from the numbers, and the dead-zone warning is asserted
 * because it is the one consequence of these settings a reader cannot compute at a glance.
 */
describe('slot timeline', () => {
  const base = {
    intervalMinutes: 30,
    syncToleranceMinutes: 10,
    maxReusedAgeMinutes: 45,
    maxEpochToSlotMinutes: 30,
    reuseMissingStation: true,
  };

  it('separates a cycle measured at the slot from one measured well before it', () => {
    render(
      <SlotTimeline
        {...base}
        stations={[
          // 1 min from the 10:00 slot -> fresh; and the latest epoch, so 10:00 is the last column.
          { stationCode: 'SYN_A', epochs: ['2025-06-02T09:59:00.000Z'] },
          // 19 min before 10:00: outside ±10 but inside 45 -> reused.
          { stationCode: 'SYN_C', epochs: ['2025-06-02T09:41:00.000Z'] },
        ]}
      />,
    );

    expect(screen.getByText(/^fresh/)).toBeInTheDocument();
    expect(screen.getByText(/^reused/)).toBeInTheDocument();
  });

  it('calls a station missing once its last cycle is older than the reuse age', () => {
    render(
      <SlotTimeline
        {...base}
        stations={[
          { stationCode: 'SYN_A', epochs: ['2025-06-02T09:59:00.000Z'] },
          // 89 min before the 10:00 slot, and further from every earlier slot shown.
          { stationCode: 'SYN_D', epochs: ['2025-06-02T08:30:00.000Z'] },
        ]}
      />,
    );

    expect(screen.getAllByText(/^missing/).length).toBeGreaterThan(0);
  });

  it('never reuses anything when reuse is switched off', () => {
    render(
      <SlotTimeline
        {...base}
        reuseMissingStation={false}
        stations={[
          { stationCode: 'SYN_A', epochs: ['2025-06-02T09:59:00.000Z'] },
          { stationCode: 'SYN_C', epochs: ['2025-06-02T09:41:00.000Z'] },
        ]}
      />,
    );

    // The reuse age collapses to the sync tolerance, so 09:41 can only be missing.
    expect(screen.queryByText(/^reused/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/^missing/).length).toBeGreaterThan(0);
  });

  it('warns about the gap where a cycle is fresh for no slot at all', () => {
    render(<SlotTimeline {...base} stations={[{ stationCode: 'SYN_A', epochs: ['2025-06-02T09:59:00.000Z'] }]} />);
    // interval 30, fresh half-width 10 -> a 10-minute gap between two fresh windows.
    expect(screen.getByText(/10-minute gap/)).toBeInTheDocument();
  });

  it('says which of the two tolerances is actually in force', () => {
    render(
      <SlotTimeline
        {...base}
        maxEpochToSlotMinutes={4}
        stations={[{ stationCode: 'SYN_A', epochs: ['2025-06-02T09:59:00.000Z'] }]}
      />,
    );
    expect(screen.getByText(/fresh window is 4 min, not 10 min/)).toBeInTheDocument();
  });

  it('asks for data instead of drawing an empty grid', () => {
    render(<SlotTimeline {...base} stations={[{ stationCode: 'SYN_A', epochs: [] }]} />);
    expect(screen.getByText(/Select stations that carry observations/)).toBeInTheDocument();
  });
});
