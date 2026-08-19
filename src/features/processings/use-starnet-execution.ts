import { useMemo, useState } from 'react';
import type { AutoAdjustConfig } from '@/domain/entities';
import { parseStarNetConsoleSummary } from '@/domain/starnet/native-output-parser';
import type { NativePreviews } from '@/domain/starnet/preview-builder';
import {
  type EphemeralStarNetServiceConnection,
  type StarNetServiceGatewayRequest,
  type StarNetServiceGatewayResponse,
  type SuccessfulStarNetServiceGatewayResponse,
} from '@/domain/starnet/service-transport';
import {
  createStarNetVmJob,
  parseStarNetVmResult,
  vmJobId,
  type StarNetExecutionReference,
  type StarNetVmResult,
} from '@/domain/starnet/vm-bridge';

export type StarNetBusyAction = 'test' | 'run' | 'result';
export type StarNetLaunchMode = 'standard' | 'no-graphics';

/**
 * One native attempt. The Analysis Lab prepares its files and its run identity at launch time, so
 * both are passed explicitly instead of being read from a state that has not re-rendered yet.
 */
export interface StarNetAttempt {
  run: StarNetExecutionReference;
  previews: NativePreviews;
}

export interface StarNetTiming {
  step: string;
  ms: number;
}

function resultStorageKey(runId: string): string {
  return `btm:starnet-vm-result:${vmJobId(runId)}`;
}

function loadStoredResult(run: StarNetExecutionReference): StarNetVmResult | undefined {
  try {
    const raw = localStorage.getItem(resultStorageKey(run.id));
    if (!raw) return undefined;
    const result = parseStarNetVmResult(JSON.parse(raw));
    return result.runId === run.id && result.processingId === run.processingId ? result : undefined;
  } catch {
    return undefined;
  }
}

async function callServiceGateway(
  request: StarNetServiceGatewayRequest,
): Promise<SuccessfulStarNetServiceGatewayResponse> {
  const response = await fetch('/api/starnet-service', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(request),
  });
  const payload = await response.json() as StarNetServiceGatewayResponse;
  if (!payload.ok) throw new Error(payload.message);
  return payload;
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * One execution against the licensed Windows service: connection, submission, polling and the
 * native result.
 *
 * The transport lives here rather than in a component because two screens drive the same service
 * with different chrome — the run detail card and the Analysis Lab bench — and a second copy of the
 * polling, the timings and the ownership checks is exactly where the two would drift apart.
 *
 * The access key stays in this hook's state: it is resent to the same-origin gateway for each short
 * operation and never reaches localStorage, the processing or a URL.
 */
export function useStarNetExecution({
  run,
  previews,
  autoAdjust,
  persistResult = true,
  onExecutionComplete,
  connection: controlledConnection,
  onConnectionChange,
}: {
  run: StarNetExecutionReference;
  previews: NativePreviews;
  autoAdjust: AutoAdjustConfig;
  persistResult?: boolean;
  onExecutionComplete?: (result: StarNetVmResult) => void;
  connection?: EphemeralStarNetServiceConnection;
  onConnectionChange?: (connection: EphemeralStarNetServiceConnection) => void;
}) {
  const [internalConnection, setInternalConnection] = useState<EphemeralStarNetServiceConnection>({
    origin: '',
    apiKey: '',
  });
  const connection = controlledConnection ?? internalConnection;
  const [result, setResult] = useState<StarNetVmResult | undefined>(() =>
    persistResult ? loadStoredResult(run) : undefined,
  );
  const [busy, setBusy] = useState<StarNetBusyAction>();
  const [queuedJobId, setQueuedJobId] = useState<string>();
  const [connectionOk, setConnectionOk] = useState(false);
  const [executionSlots, setExecutionSlots] = useState<number>();
  const [hostMode, setHostMode] = useState<'interactive-pilot' | 'windows-service'>();
  const [remoteLifecycle, setRemoteLifecycle] = useState<'queued' | 'running'>();
  /**
   * Wall-clock cost of each stage. The service is remote and the wait is opaque; measuring it is
   * the only way to tell whether a slow run is the network, the queue or STAR*NET itself.
   */
  const [timings, setTimings] = useState<StarNetTiming[]>([]);
  const [error, setError] = useState<string>();
  const [launchMode, setLaunchMode] = useState<StarNetLaunchMode>('standard');

  const noGraphics = launchMode === 'no-graphics';
  const summary = useMemo(() => (result ? parseStarNetConsoleSummary(result) : undefined), [result]);
  const completeConnection = Boolean(connection.origin && connection.apiKey.length >= 24);
  // Without a valid pair there is nothing to run: submitting would only return the gateway's
  // "project must use the native template" rejection, which hides the real cause.
  const filesUnavailable = Boolean(previews.error) || !previews.dat || !previews.prj;

  const updateConnection = <K extends keyof EphemeralStarNetServiceConnection>(
    key: K,
    value: EphemeralStarNetServiceConnection[K],
  ) => {
    const next = { ...connection, [key]: value };
    if (controlledConnection) onConnectionChange?.(next);
    else setInternalConnection(next);
    setConnectionOk(false);
    setHostMode(undefined);
  };

  const storeResult = (parsed: StarNetVmResult, owner: StarNetExecutionReference = run) => {
    if (parsed.runId !== owner.id || parsed.processingId !== owner.processingId) {
      throw new Error(`This result belongs to ${parsed.runId}, not ${owner.id}`);
    }
    if (persistResult) localStorage.setItem(resultStorageKey(owner.id), JSON.stringify(parsed));
    setResult(parsed);
    setQueuedJobId(undefined);
    onExecutionComplete?.(parsed);
  };

  const createAttemptJob = (attempt?: StarNetAttempt) => createStarNetVmJob({
    run: attempt?.run ?? run,
    dat: (attempt?.previews ?? previews).dat,
    prj: (attempt?.previews ?? previews).prj,
    autoAdjust,
    noGraphics,
    // The VM retains completed job ids briefly. Every click must be a real new execution,
    // including a retry after changing the launch mode.
    jobId: vmJobId(
      (attempt?.run ?? run).id,
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    ),
  });

  /** Resolves to the host mode, so a caller can refuse an incompatible launch mode. */
  const testConnection = async (): Promise<'interactive-pilot' | 'windows-service' | undefined> => {
    setBusy('test');
    setError(undefined);
    try {
      const response = await callServiceGateway({ action: 'test', connection });
      if (response.action !== 'test') throw new Error('Unexpected gateway response');
      setConnectionOk(true);
      setExecutionSlots(response.maximumConcurrentExecutions);
      setHostMode(response.hostMode);
      return response.hostMode;
    } catch (connectionError) {
      setConnectionOk(false);
      setHostMode(undefined);
      setError(connectionError instanceof Error ? connectionError.message : String(connectionError));
      return undefined;
    } finally {
      setBusy(undefined);
    }
  };

  const retrieveResult = async (
    jobId: string,
    attempt?: StarNetAttempt,
  ): Promise<StarNetVmResult | undefined> => {
    const response = await callServiceGateway({ action: 'result', connection, jobId });
    if (response.action !== 'result') throw new Error('Unexpected gateway response');
    if (response.state === 'pending') {
      setRemoteLifecycle(response.lifecycle);
      return undefined;
    }
    setRemoteLifecycle(undefined);
    const parsed = parseStarNetVmResult(response.result);
    storeResult(parsed, attempt?.run);
    return parsed;
  };

  const incompatibleStandardService = (mode = hostMode) =>
    mode === 'windows-service' && !noGraphics;

  const INCOMPATIBLE_MESSAGE = 'This endpoint runs as a Windows service. A STAR*NET Typical'
    + ' installation needs the interactive pilot host for Standard CLI. Restart the updated'
    + ' START-PILOT package, or select No Graphics only if that Custom component is installed.';

  /**
   * Runs the job end to end. With `autoTest` the connection is checked first, so one click covers
   * the whole native execution exactly like a preview-engine trial.
   */
  const runNow = async (
    { autoTest = false, ...attempt }: { autoTest?: boolean } & Partial<StarNetAttempt> = {},
  ): Promise<StarNetVmResult | undefined> => {
    const effective: StarNetAttempt | undefined = attempt.previews || attempt.run
      ? { previews: attempt.previews ?? previews, run: attempt.run ?? run }
      : undefined;
    const effectivePreviews = effective?.previews ?? previews;
    if (Boolean(effectivePreviews.error) || !effectivePreviews.dat || !effectivePreviews.prj) return undefined;
    if (autoTest && !connectionOk) {
      const mode = await testConnection();
      // the gateway error is already displayed
      if (mode === undefined && !connectionOk) return undefined;
      if (incompatibleStandardService(mode)) {
        setError(INCOMPATIBLE_MESSAGE);
        return undefined;
      }
    }
    const job = createAttemptJob(effective);
    setBusy('run');
    setError(undefined);
    // A fresh execution must never display the previous attempt's status while STAR*NET runs.
    // Keep the credentials in memory, but clear the stale native result.
    setResult(undefined);
    setQueuedJobId(undefined);
    setRemoteLifecycle(undefined);
    setTimings([]);
    if (persistResult) localStorage.removeItem(resultStorageKey((effective?.run ?? run).id));
    try {
      const startedAt = Date.now();
      const submitted = await callServiceGateway({ action: 'submit', connection, job });
      if (submitted.action !== 'submit') throw new Error('Unexpected gateway response');
      const submittedAt = Date.now();
      setTimings([{ step: 'submit', ms: submittedAt - startedAt }]);
      setQueuedJobId(submitted.jobId);
      setRemoteLifecycle('queued');

      // A short job used to wait a full 2 s before anyone asked whether it had finished. Poll
      // quickly at first and ease off, so a fast run returns fast and a long one stays cheap.
      const backoffMs = [150, 250, 400, 600, 900, 1_300, 2_000];
      for (let poll = 0; poll < 90; poll += 1) {
        await pause(backoffMs[Math.min(poll, backoffMs.length - 1)]);
        const finished = await retrieveResult(submitted.jobId, effective);
        if (finished) {
          const doneAt = Date.now();
          setTimings([
            { step: 'submit', ms: submittedAt - startedAt },
            { step: 'execute', ms: doneAt - submittedAt },
            { step: 'total', ms: doneAt - startedAt },
          ]);
          return finished;
        }
      }
      throw new Error('STAR*NET is still running. Use “Check result” without re-submitting the job.');
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
    } finally {
      setBusy(undefined);
    }
    return undefined;
  };

  const checkResult = async () => {
    if (!queuedJobId) return;
    setBusy('result');
    setError(undefined);
    try {
      if (!await retrieveResult(queuedJobId)) {
        setError('The job is still queued or running on the STAR*NET VM.');
      }
    } catch (resultError) {
      setError(resultError instanceof Error ? resultError.message : String(resultError));
    } finally {
      setBusy(undefined);
    }
  };

  return {
    connection,
    updateConnection,
    completeConnection,
    connectionOk,
    executionSlots,
    hostMode,
    launchMode,
    setLaunchMode,
    noGraphics,
    incompatibleStandardService: incompatibleStandardService(),
    incompatibleMessage: INCOMPATIBLE_MESSAGE,
    filesUnavailable,
    busy,
    queuedJobId,
    remoteLifecycle,
    timings,
    error,
    setError,
    result,
    summary,
    storeResult,
    createAttemptJob,
    testConnection,
    runNow,
    checkResult,
  };
}
