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
import {
  createStarNetVmJob,
  parseStarNetConsoleSummary,
  parseStarNetVmResult,
  vmJobId,
  type StarNetExecutionReference,
  type StarNetVmResult,
} from '@/domain/starnet/vm-bridge';
import {
  type EphemeralStarNetServiceConnection,
  type StarNetServiceGatewayRequest,
  type StarNetServiceGatewayResponse,
  type SuccessfulStarNetServiceGatewayResponse,
} from '@/domain/starnet/service-transport';

interface StarNetVmBridgeCardProps {
  run: StarNetExecutionReference;
  previews: { dat: string; snproj: string };
  autoAdjust: AutoAdjustConfig;
  title?: string;
  description?: string;
  persistResult?: boolean;
  onExecutionComplete?: (result: StarNetVmResult) => void;
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
  title = 'Run with STAR*NET 14',
  description = 'Submit this run to the isolated Windows execution service and retrieve the native result automatically.',
  persistResult = true,
  onExecutionComplete,
}: StarNetVmBridgeCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<StarNetVmResult | undefined>(() =>
    persistResult ? loadStoredResult(run) : undefined,
  );
  const [selectedFile, setSelectedFile] = useState('');
  const [connection, setConnection] = useState<EphemeralStarNetServiceConnection>({
    origin: '',
    apiKey: '',
  });
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
    snproj: previews.snproj,
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
      throw new Error(`This result belongs to ${parsed.runId}, not ${run.id}`);
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
    setConnection((current) => ({ ...current, [key]: value }));
    setConnectionOk(false);
    setHostMode(undefined);
  };

  const testConnection = async () => {
    setBusy('test');
    setError(undefined);
    try {
      const response = await callServiceGateway({ action: 'test', connection });
      if (response.action !== 'test') throw new Error('Unexpected gateway response');
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
    if (response.action !== 'result') throw new Error('Unexpected gateway response');
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
    try {
      const submitted = await callServiceGateway({ action: 'submit', connection, job });
      if (submitted.action !== 'submit') throw new Error('Unexpected gateway response');
      setQueuedJobId(submitted.jobId);
      setRemoteLifecycle('queued');
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await pause(2_000);
        if (await retrieveResult(submitted.jobId)) return;
      }
      throw new Error('STAR*NET is still running. Use “Check result” without re-submitting the job.');
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
        setError('The job is still queued or running on the STAR*NET VM.');
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
      if (file.size > 25_000_000) throw new Error('Result package is larger than the 25 MB mock-up limit');
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
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
          </Box>
          {connectionOk && (
            <Chip
              size="small"
              color="success"
              label={`Service ready${hostMode === 'interactive-pilot' ? ' · interactive pilot' : ''}${executionSlots ? ` · ${executionSlots} execution slot${executionSlots > 1 ? 's' : ''}` : ''}`}
            />
          )}
          {queuedJobId && (
            <Chip
              size="small"
              color="info"
              label={remoteLifecycle === 'running' ? 'Running on VM' : 'Queued on VM'}
            />
          )}
        </Stack>

        <Alert severity="info" variant="outlined">
          The access key below remains only in this tab&apos;s memory. It is not saved in the
          processing, browser storage, database, GitHub or Vercel. The service URL must be
          authorised in the Vercel environment.
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
            label="STAR*NET service URL"
            value={connection.origin}
            autoComplete="off"
            placeholder="https://starnet-vm.example.internal"
            onChange={(event) => updateConnection('origin', event.target.value)}
            helperText="HTTPS origin allowlisted in Vercel; no path"
          />
          <TextField
            size="small"
            label="Service access key (not saved)"
            type="password"
            value={connection.apiKey}
            autoComplete="new-password"
            onChange={(event) => updateConnection('apiKey', event.target.value)}
            helperText="Generated during service installation; never persisted by this mock-up"
          />
          <FormControl size="small">
            <InputLabel id="starnet-launch-mode-label">Launch mode</InputLabel>
            <Select
              labelId="starnet-launch-mode-label"
              label="Launch mode"
              value={noGraphics ? 'no-graphics' : 'standard'}
              onChange={(event) => setNoGraphics(event.target.value === 'no-graphics')}
            >
              <MenuItem value="standard">Standard CLI · Typical install</MenuItem>
              <MenuItem value="no-graphics">No Graphics CLI · Custom install</MenuItem>
            </Select>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.4, ml: 1.75 }}>
              Typical installations must use Standard CLI.
            </Typography>
          </FormControl>
        </Box>

        {error && <Alert severity="error" onClose={() => setError(undefined)}>{error}</Alert>}
        {incompatibleStandardService && (
          <Alert severity="warning">
            This endpoint is running as a Windows service. A STAR*NET Typical installation needs
            the interactive pilot host for Standard CLI. Restart the updated START-PILOT package,
            or select No Graphics only if that Custom component is installed.
          </Alert>
        )}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button
            variant="outlined"
            disabled={!completeConnection || Boolean(busy)}
            onClick={testConnection}
            data-testid="test-starnet-connection"
          >
            {busy === 'test' ? 'Testing…' : 'Test service'}
          </Button>
          <Button
            variant="contained"
            disabled={!connectionOk || incompatibleStandardService || Boolean(busy)}
            onClick={runOnVm}
            data-testid="run-real-starnet"
          >
            {busy === 'run' ? 'STAR*NET running…' : 'Run now with STAR*NET'}
          </Button>
          {queuedJobId && (
            <Button variant="outlined" disabled={Boolean(busy)} onClick={checkResult}>
              {busy === 'result' ? 'Checking…' : 'Check result'}
            </Button>
          )}
          <Button
            size="small"
            color="inherit"
            sx={{ ml: { sm: 'auto !important' } }}
            onClick={() => setShowFallback((visible) => !visible)}
          >
            {showFallback ? 'Hide file fallback' : 'File fallback'}
          </Button>
        </Stack>

        <Collapse in={showFallback}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ p: 1.25, bgcolor: 'grey.50', borderRadius: 1 }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
              Diagnostic fallback when the VM is unreachable: exchange the same validated job and result manually.
            </Typography>
            <Button variant="outlined" size="small" onClick={exportJob} data-testid="download-starnet-job">
              Download job
            </Button>
            <Button variant="outlined" size="small" onClick={() => inputRef.current?.click()} data-testid="import-starnet-result">
              Import result
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
                label={`STAR*NET ${result.status}`}
              />
              <Chip size="small" variant="outlined" label={result.starNet.fileVersion ? `v${result.starNet.fileVersion}` : result.starNet.executableName} />
              <Chip size="small" variant="outlined" label={result.starNet.mode === 'auto-adjust' ? 'Auto Adjust' : 'Run'} />
              <Chip size="small" variant="outlined" label={result.starNet.noGraphics ? 'No Graphics' : 'Standard CLI'} />
              <Chip size="small" color={summary.converged ? 'success' : 'warning'} label={summary.converged ? `Converged${summary.iterations ? ` · ${summary.iterations} iter.` : ''}` : 'Convergence not confirmed'} />
              <Chip
                size="small"
                color={summary.chiSquareStatus === 'passed' ? 'success' : summary.chiSquareStatus === 'failed' ? 'error' : 'default'}
                label={`χ² ${summary.chiSquareStatus}`}
              />
              {summary.elapsed && <Chip size="small" variant="outlined" label={`elapsed ${summary.elapsed}`} />}
            </Stack>

            {result.error && <Alert severity="error">{result.error}</Alert>}
            {result.outputFiles.length === 0 ? (
              <Alert severity="warning">No native output file was returned. Review the captured console below.</Alert>
            ) : (
              <FormControl size="small" sx={{ maxWidth: 420 }}>
                <InputLabel id="starnet-output-file">Native output</InputLabel>
                <Select
                  labelId="starnet-output-file"
                  label="Native output"
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
              aria-label="STAR*NET native output"
              sx={{ p: 1.5, bgcolor: 'grey.100', borderRadius: 1, maxHeight: 420, overflow: 'auto', fontSize: 12, m: 0 }}
            >
              {selectedOutput?.content || result.console.stdout || result.console.stderr || 'No textual output.'}
            </Box>
            <Typography variant="caption" color="text.secondary">
              The real VM result is displayed by the mock-up but does not yet overwrite BTM-style demo measures.
            </Typography>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
