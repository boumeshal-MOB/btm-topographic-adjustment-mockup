import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { AutoAdjustConfig } from '@/domain/entities';
import { useTranslation } from 'react-i18next';
import {
  createStarNetVmJob,
  parseStarNetVmResult,
  vmJobId,
  type StarNetExecutionReference,
  type StarNetVmResult,
} from '@/domain/starnet/vm-bridge';
import { parseStarNetConsoleSummary } from '@/domain/starnet/native-output-parser';
import {
  type EphemeralStarNetServiceConnection,
  type StarNetServiceGatewayRequest,
  type StarNetServiceGatewayResponse,
  type SuccessfulStarNetServiceGatewayResponse,
} from '@/domain/starnet/service-transport';

interface StarNetVmBridgeCardProps {
  run: StarNetExecutionReference;
  previews: { dat: string; prj: string };
  autoAdjust: AutoAdjustConfig;
  title?: string;
  description?: string;
  persistResult?: boolean;
  onExecutionComplete?: (result: StarNetVmResult) => void;
  /** Optional tab-memory connection owner, used by Analysis Lab across several trials. */
  connection?: EphemeralStarNetServiceConnection;
  onConnectionChange?: (connection: EphemeralStarNetServiceConnection) => void;
}

type BusyAction = 'test' | 'run' | 'result';

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

function downloadJson(fileName: string, value: unknown): void {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
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

function resultBelongsToRun(result: StarNetVmResult, run: StarNetExecutionReference): boolean {
  return result.runId === run.id
    && result.processingId === run.processingId;
}

/**
 * Manual prototype bridge. The service key lives only in React state and is resent to the
 * same-origin Vercel function for each short HTTPS operation. It never enters localStorage.
 */
export function StarNetVmBridgeCard({
  run,
  previews,
  autoAdjust,
  title,
  description,
  persistResult = true,
  onExecutionComplete,
  connection: controlledConnection,
  onConnectionChange,
}: StarNetVmBridgeCardProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<StarNetVmResult | undefined>(() =>
    persistResult ? loadStoredResult(run) : undefined,
  );
  const [selectedFile, setSelectedFile] = useState('');
  const [internalConnection, setInternalConnection] = useState<EphemeralStarNetServiceConnection>({
    origin: '',
    apiKey: '',
  });
  const connection = controlledConnection ?? internalConnection;
  const [busy, setBusy] = useState<BusyAction>();
  const [queuedJobId, setQueuedJobId] = useState<string>();
  const [connectionOk, setConnectionOk] = useState(false);
  const [executionSlots, setExecutionSlots] = useState<number>();
  const [hostMode, setHostMode] = useState<'interactive-pilot' | 'windows-service'>();
  const [remoteLifecycle, setRemoteLifecycle] = useState<'queued' | 'running'>();
  const [error, setError] = useState<string>();
  const [showFallback, setShowFallback] = useState(false);
  const [noGraphics, setNoGraphics] = useState(false);

  const summary = useMemo(() => (result ? parseStarNetConsoleSummary(result) : undefined), [result]);
  const selectedOutput = result?.outputFiles.find((file) => file.name === selectedFile)
    ?? result?.outputFiles.find((file) => file.extension.toLowerCase() === '.lst')
    ?? result?.outputFiles[0];
  const completeConnection = Boolean(connection.origin && connection.apiKey.length >= 24);
  const createAttemptJob = () => createStarNetVmJob({
    run,
    dat: previews.dat,
    prj: previews.prj,
    autoAdjust,
    noGraphics,
    // The VM retains completed job ids briefly. Every click must be a real new execution,
    // including a retry after changing the launch mode.
    jobId: vmJobId(
      run.id,
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    ),
  });

  const storeResult = (parsed: StarNetVmResult) => {
    if (!resultBelongsToRun(parsed, run)) {
      throw new Error(t('starnetBridge.wrongRun', { actual: parsed.runId, expected: run.id }));
    }
    if (persistResult) localStorage.setItem(resultStorageKey(run.id), JSON.stringify(parsed));
    setResult(parsed);
    setSelectedFile(
      parsed.outputFiles.find((item) => item.extension.toLowerCase() === '.lst')?.name
      ?? parsed.outputFiles[0]?.name
      ?? '',
    );
    setQueuedJobId(undefined);
    onExecutionComplete?.(parsed);
  };

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

  const testConnection = async () => {
    setBusy('test');
    setError(undefined);
    try {
      const response = await callServiceGateway({ action: 'test', connection });
      if (response.action !== 'test') throw new Error(t('starnetBridge.unexpected'));
      setConnectionOk(true);
      setExecutionSlots(response.maximumConcurrentExecutions);
      setHostMode(response.hostMode);
    } catch (connectionError) {
      setConnectionOk(false);
      setHostMode(undefined);
      setError(connectionError instanceof Error ? connectionError.message : String(connectionError));
    } finally {
      setBusy(undefined);
    }
  };

  const retrieveResult = async (jobId: string): Promise<boolean> => {
    const response = await callServiceGateway({ action: 'result', connection, jobId });
    if (response.action !== 'result') throw new Error(t('starnetBridge.unexpected'));
    if (response.state === 'pending') {
      setRemoteLifecycle(response.lifecycle);
      return false;
    }
    setRemoteLifecycle(undefined);
    storeResult(parseStarNetVmResult(response.result));
    return true;
  };

  const runOnVm = async () => {
    const job = createAttemptJob();
    setBusy('run');
    setError(undefined);
    // A fresh execution must never display the previous attempt's status while STAR*NET runs.
    // Keep the credentials in memory, but clear stale native results and their file selection.
    setResult(undefined);
    setSelectedFile('');
    setQueuedJobId(undefined);
    setRemoteLifecycle(undefined);
    if (persistResult) localStorage.removeItem(resultStorageKey(run.id));
    try {
      const submitted = await callServiceGateway({ action: 'submit', connection, job });
      if (submitted.action !== 'submit') throw new Error(t('starnetBridge.unexpected'));
      setQueuedJobId(submitted.jobId);
      setRemoteLifecycle('queued');
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await pause(2_000);
        if (await retrieveResult(submitted.jobId)) return;
      }
      throw new Error(t('starnetBridge.stillRunning'));
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
    } finally {
      setBusy(undefined);
    }
  };

  const incompatibleStandardService = connectionOk
    && hostMode === 'windows-service'
    && !noGraphics;

  const checkResult = async () => {
    if (!queuedJobId) return;
    setBusy('result');
    setError(undefined);
    try {
      if (!await retrieveResult(queuedJobId)) {
        setError(t('starnetBridge.queued'));
      }
    } catch (resultError) {
      setError(resultError instanceof Error ? resultError.message : String(resultError));
    } finally {
      setBusy(undefined);
    }
  };

  const exportJob = () => {
    const job = createAttemptJob();
    downloadJson(`${job.jobId}.btmjob.json`, job);
  };

  const importResult = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      if (file.size > 25_000_000) throw new Error(t('starnetBridge.tooLarge'));
      storeResult(parseStarNetVmResult(JSON.parse(await file.text())));
      setError(undefined);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : String(importError));
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, borderRadius: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 800 }}>
              {title ?? t('starnetBridge.title')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {description ?? t('starnetBridge.description')}
            </Typography>
          </Box>
          {connectionOk && (
            <Chip
              size="small"
              color="success"
              label={t('starnetBridge.ready', {
                pilot: hostMode === 'interactive-pilot' ? t('starnetBridge.pilot') : '',
                slots: executionSlots ? t('starnetBridge.slots', { count: executionSlots }) : '',
              })}
            />
          )}
          {queuedJobId && (
            <Chip
              size="small"
              color="info"
              label={remoteLifecycle === 'running' ? t('starnetBridge.runningVm') : t('starnetBridge.queuedVm')}
            />
          )}
        </Stack>

        <Alert severity="info" variant="outlined">
          {t('starnetBridge.security')}
        </Alert>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr 0.9fr' },
            gap: 1.25,
          }}
        >
          <TextField
            size="small"
            label={t('starnetBridge.url')}
            value={connection.origin}
            autoComplete="off"
            placeholder="https://starnet-vm.example.internal"
            onChange={(event) => updateConnection('origin', event.target.value)}
            helperText={t('starnetBridge.urlHelp')}
          />
          <TextField
            size="small"
            label={t('starnetBridge.key')}
            type="password"
            value={connection.apiKey}
            autoComplete="new-password"
            onChange={(event) => updateConnection('apiKey', event.target.value)}
            helperText={t('starnetBridge.keyHelp')}
          />
          <FormControl size="small">
            <InputLabel id="starnet-launch-mode-label">{t('starnetBridge.launchMode')}</InputLabel>
            <Select
              labelId="starnet-launch-mode-label"
              label={t('starnetBridge.launchMode')}
              value={noGraphics ? 'no-graphics' : 'standard'}
              onChange={(event) => setNoGraphics(event.target.value === 'no-graphics')}
            >
              <MenuItem value="standard">{t('starnetBridge.standard')}</MenuItem>
              <MenuItem value="no-graphics">{t('starnetBridge.noGraphics')}</MenuItem>
            </Select>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.4, ml: 1.75 }}>
              {t('starnetBridge.typicalHelp')}
            </Typography>
          </FormControl>
        </Box>

        {error && <Alert severity="error" onClose={() => setError(undefined)}>{error}</Alert>}
        {incompatibleStandardService && (
          <Alert severity="warning">
            {t('starnetBridge.serviceWarning')}
          </Alert>
        )}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button
            variant="outlined"
            disabled={!completeConnection || Boolean(busy)}
            onClick={testConnection}
            data-testid="test-starnet-connection"
          >
            {busy === 'test' ? t('starnetBridge.testing') : t('starnetBridge.test')}
          </Button>
          <Button
            variant="contained"
            disabled={!connectionOk || incompatibleStandardService || Boolean(busy)}
            onClick={runOnVm}
            data-testid="run-real-starnet"
          >
            {busy === 'run' ? t('starnetBridge.running') : t('starnetBridge.run')}
          </Button>
          {queuedJobId && (
            <Button variant="outlined" disabled={Boolean(busy)} onClick={checkResult}>
              {busy === 'result' ? t('starnetBridge.checking') : t('starnetBridge.check')}
            </Button>
          )}
          <Button
            size="small"
            color="inherit"
            sx={{ ml: { sm: 'auto !important' } }}
            onClick={() => setShowFallback((visible) => !visible)}
          >
            {showFallback ? t('starnetBridge.hideFallback') : t('starnetBridge.showFallback')}
          </Button>
        </Stack>

        <Collapse in={showFallback}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ p: 1.25, bgcolor: 'grey.50', borderRadius: 1 }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
              {t('starnetBridge.fallbackHelp')}
            </Typography>
            <Button variant="outlined" size="small" onClick={exportJob} data-testid="download-starnet-job">
              {t('starnetBridge.download')}
            </Button>
            <Button variant="outlined" size="small" onClick={() => inputRef.current?.click()} data-testid="import-starnet-result">
              {t('starnetBridge.import')}
            </Button>
            <input ref={inputRef} type="file" accept=".json,application/json" hidden onChange={importResult} />
          </Stack>
        </Collapse>

        {result && summary && (
          <Stack spacing={1.25}>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              <Chip
                size="small"
                color={result.status === 'succeeded' ? 'success' : 'error'}
                label={t('starnetBridge.resultStatus', { status: t(`enums.status.${result.status}`, { defaultValue: result.status }) })}
              />
              <Chip size="small" variant="outlined" label={result.starNet.fileVersion ? `v${result.starNet.fileVersion}` : result.starNet.executableName} />
              <Chip size="small" variant="outlined" label={result.starNet.mode === 'auto-adjust' ? 'Auto Adjust' : t('starnetBridge.runMode')} />
              <Chip size="small" variant="outlined" label={result.starNet.noGraphics ? 'No Graphics' : 'Standard CLI'} />
              <Chip size="small" color={summary.converged ? 'success' : 'warning'} label={summary.converged ? t('starnetBridge.converged', { iterations: summary.iterations ? t('starnetBridge.iterations', { count: summary.iterations }) : '' }) : t('starnetBridge.notConverged')} />
              <Chip
                size="small"
                color={summary.chiSquareStatus === 'passed' ? 'success' : summary.chiSquareStatus === 'failed' ? 'error' : 'default'}
                label={t('starnetBridge.chi', { status: summary.chiSquareStatus ? t(`enums.status.${summary.chiSquareStatus}`) : '—' })}
              />
              {summary.elapsed && <Chip size="small" variant="outlined" label={t('starnetBridge.elapsed', { value: summary.elapsed })} />}
              {summary.observationCount !== undefined && (
                <Chip size="small" variant="outlined" label={t('starnetBridge.observations', { count: summary.observationCount })} />
              )}
              {summary.degreesOfFreedom !== undefined && (
                <Chip size="small" variant="outlined" label={t('starnetBridge.dof', { count: summary.degreesOfFreedom })} />
              )}
              {summary.totalErrorFactor !== undefined && (
                <Chip size="small" variant="outlined" label={t('starnetBridge.errorFactor', { value: summary.totalErrorFactor.toFixed(3) })} />
              )}
              {summary.coordinateCount !== undefined && (
                <Chip size="small" variant="outlined" label={t('starnetBridge.coordinates', { count: summary.coordinateCount })} />
              )}
              {summary.runStatusCode !== undefined && (
                <Chip size="small" variant="outlined" label={t('starnetBridge.runCode', { code: summary.runStatusCode })} />
              )}
            </Stack>

            {result.error && <Alert severity="error">{result.error}</Alert>}
            {result.outputFiles.length === 0 ? (
              <Alert severity="warning">{t('starnetBridge.noOutput')}</Alert>
            ) : (
              <FormControl size="small" sx={{ maxWidth: 420 }}>
                <InputLabel id="starnet-output-file">{t('starnetBridge.nativeOutput')}</InputLabel>
                <Select
                  labelId="starnet-output-file"
                  label={t('starnetBridge.nativeOutput')}
                  value={selectedOutput?.name ?? ''}
                  onChange={(event) => setSelectedFile(event.target.value)}
                >
                  {result.outputFiles.map((file) => (
                    <MenuItem key={file.name} value={file.name}>
                      {file.name} · {(file.sizeBytes / 1024).toFixed(1)} kB
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <Box
              component="pre"
              aria-label={t('starnetBridge.nativeOutputAria')}
              sx={{ p: 1.5, bgcolor: 'grey.100', borderRadius: 1, maxHeight: 420, overflow: 'auto', fontSize: 12, m: 0 }}
            >
              {selectedOutput?.content || result.console.stdout || result.console.stderr || t('starnetBridge.noText')}
            </Box>
            <Typography variant="caption" color="text.secondary">
              {t('starnetBridge.demoHelp')}
            </Typography>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
