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
  it('blocks Standard CLI on a non-interactive Windows service host', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        ok: true,
        action: 'test',
        message: 'Connected',
        maximumConcurrentExecutions: 1,
        hostMode: 'windows-service',
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
          prj: '*STAR*NET 2\n[DataFileList]\n3 "input.dat"\n',
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

    await waitFor(() => expect(screen.getByText(/needs the interactive pilot host/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Run now with STAR*NET' })).toBeDisabled();

    await user.click(screen.getByRole('combobox', { name: 'Launch mode' }));
    await user.click(screen.getByRole('option', { name: 'No Graphics CLI · Custom install' }));
    expect(screen.getByRole('button', { name: 'Run now with STAR*NET' })).toBeEnabled();
  });

  it('sends the ephemeral service key to the same-origin gateway without persisting it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        ok: true,
        action: 'test',
        message: 'Connected',
        maximumConcurrentExecutions: 1,
        hostMode: 'interactive-pilot',
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
          prj: '*STAR*NET 2\n[DataFileList]\n3 "input.dat"\n',
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
    expect(screen.getByRole('button', { name: 'Run now with STAR*NET' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Launch mode' })).toHaveTextContent(
      'Standard CLI · Typical install',
    );
    await user.click(screen.getByRole('button', { name: 'Test service' }));

    await waitFor(() => expect(screen.getByText(
      'Service ready · interactive pilot · 1 execution slot',
    )).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Run now with STAR*NET' })).toBeEnabled();
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

  it('submits and retrieves one ephemeral Adjustment test without persisting the native result', async () => {
    const nativeResult = {
      kind: 'btm-starnet-result',
      schemaVersion: 1,
      jobId: 'btm-run-ephemeral-secret',
      processingId: 42,
      runId: 'run-ephemeral-secret',
      status: 'succeeded',
      exitCode: 0,
      startedAt: '2026-07-25T21:00:01.000Z',
      finishedAt: '2026-07-25T21:00:03.000Z',
      starNet: {
        executableName: 'StarNet.exe',
        fileVersion: '14.0',
        noGraphics: false,
        mode: 'run',
      },
      console: {
        stdout: [
          'Solution Has Converged in 3 Iterations',
          'Chi-Square Test at 5.00% Level Passed',
          'Network Processing Completed',
        ].join('\n'),
        stderr: '',
      },
      outputFiles: [{
        name: 'project.lst',
        extension: '.lst',
        sizeBytes: 28,
        content: 'Network Processing Completed',
      }],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        action: 'test',
        message: 'Connected',
        maximumConcurrentExecutions: 1,
        hostMode: 'interactive-pilot',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        action: 'submit',
        jobId: nativeResult.jobId,
        state: 'queued',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        action: 'result',
        jobId: nativeResult.jobId,
        state: 'completed',
        result: nativeResult,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    const completed = vi.fn();
    render(
      <StarNetVmBridgeCard
        run={run}
        previews={{
          dat: 'C ST0001 0 0 0 ! ! !\n',
          prj: '*STAR*NET 2\n[DataFileList]\n3 "input.dat"\n',
        }}
        autoAdjust={autoAdjust}
        persistResult={false}
        onExecutionComplete={completed}
      />,
    );

    await user.type(screen.getByLabelText('STAR*NET service URL'), 'https://starnet.example.internal');
    await user.type(
      screen.getByLabelText('Service access key (not saved)'),
      'one-run-secret-with-24-characters',
    );
    await user.click(screen.getByRole('button', { name: 'Test service' }));
    await waitFor(() => expect(screen.getByText(
      'Service ready · interactive pilot · 1 execution slot',
    )).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Run now with STAR*NET' }));

    await waitFor(
      () => expect(screen.getByText('STAR*NET succeeded')).toBeInTheDocument(),
      { timeout: 5_000 },
    );
    expect(completed).toHaveBeenCalledWith(expect.objectContaining({
      jobId: nativeResult.jobId,
      status: 'succeeded',
    }));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const submitRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const submittedJob = JSON.parse(String(submitRequest.body));
    expect(submittedJob.job.execution.noGraphics).toBe(false);
    expect(submittedJob.job.jobId).toMatch(/^btm-run-ephemeral-secret-/);
    expect(localStorage.length).toBe(0);
  });
  it('shows the exact files it would submit and refuses to run without them', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        ok: true,
        action: 'test',
        message: 'Connected',
        maximumConcurrentExecutions: 1,
        hostMode: 'interactive-pilot',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = render(
      <StarNetVmBridgeCard
        run={run}
        previews={{
          dat: 'C ST0001 0 0 0 ! ! !\n',
          prj: '*STAR*NET 2\n[DataFileList]\n3 "input.dat"\n',
          warnings: ['One sight excludes a single component; STAR*NET adjusts the complete sight.'],
        }}
        autoAdjust={autoAdjust}
      />,
    );
    // What is submitted has to be readable before submitting it.
    expect(screen.getByLabelText('input.dat')).toHaveTextContent('C ST0001');
    expect(screen.getByText(/adjusts the complete sight/)).toBeInTheDocument();
    unmount();

    // A trial whose native pair could not be generated is never sent: the gateway would only
    // answer with a confusing "project must use the native template" rejection.
    const user = userEvent.setup();
    render(
      <StarNetVmBridgeCard
        run={run}
        previews={{ dat: '', prj: '', error: 'a STAR*NET direction set requires at least two directions' }}
        autoAdjust={autoAdjust}
      />,
    );
    await user.type(screen.getByLabelText('STAR*NET service URL'), 'https://starnet.example.internal');
    await user.type(
      screen.getByLabelText('Service access key (not saved)'),
      'one-run-secret-with-24-characters',
    );
    await user.click(screen.getByRole('button', { name: 'Test service' }));
    await waitFor(() => expect(screen.getByText(/Service ready/)).toBeInTheDocument());
    expect(screen.getByText(/at least two directions/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run now with STAR*NET' })).toBeDisabled();
  });
});
