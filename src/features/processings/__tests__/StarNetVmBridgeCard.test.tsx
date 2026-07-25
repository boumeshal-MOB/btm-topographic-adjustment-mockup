import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdjustmentRunSummary, AutoAdjustConfig } from '@/domain/entities';
import { StarNetVmBridgeCard } from '@/features/processings/StarNetVmBridgeCard';

const run: AdjustmentRunSummary = {
  id: 'run-ephemeral-secret',
  processingId: 42,
  configVersionId: 'cfg-1',
  outputSlot: '2026-07-25T21:00:00.000Z',
  trigger: 'manual',
  startedAt: '2026-07-25T21:00:01.000Z',
  finishedAt: '2026-07-25T21:00:02.000Z',
  status: 'success',
  chiSquareStatus: 'passed',
  stationEpochs: [],
  autoAdjustAttempts: 0,
};

const autoAdjust: AutoAdjustConfig = {
  enabled: false,
  maxStandardizedResidual: 3,
  outliersRemovedPerIteration: 1,
  maxIterations: 20,
};

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
describe('STAR*NET connected VM card', () => {
  it('sends the ephemeral service key to the same-origin gateway without persisting it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        ok: true,
        action: 'test',
        message: 'Connected',
        maximumConcurrentExecutions: 1,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(
      <StarNetVmBridgeCard
        run={run}
        previews={{
          dat: 'C ST0001 0 0 0 ! ! !\n',
          snproj: '*STAR*NET 3\n[DataFileList]\n3 "input.dat"\n',
        }}
        autoAdjust={autoAdjust}
      />,
    );

    await user.type(
      screen.getByLabelText('STAR*NET service URL'),
      'https://starnet.example.internal',
    );
    await user.type(
      screen.getByLabelText('Service access key (not saved)'),
      'one-run-secret-with-24-characters',
    );
    await user.click(screen.getByRole('button', { name: 'Test service' }));

    await waitFor(() => expect(screen.getByText('Service ready · 1 execution slot')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      action: 'test',
      connection: {
        origin: 'https://starnet.example.internal',
        apiKey: 'one-run-secret-with-24-characters',
      },
    });
    expect(localStorage.length).toBe(0);
  });
});
