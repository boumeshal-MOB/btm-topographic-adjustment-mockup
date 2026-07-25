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
import type { AdjustmentRunSummary, AutoAdjustConfig } from '@/domain/entities';
import {
  createStarNetVmJob,
  parseStarNetConsoleSummary,
  parseStarNetVmResult,
  vmJobId,
  type StarNetVmResult,
} from '@/domain/starnet/vm-bridge';
import {
  DEFAULT_EPHEMERAL_FTP_CONNECTION,
  type EphemeralFtpConnection,
  type FtpSecurityMode,
  type StarNetFtpGatewayRequest,
  type StarNetFtpGatewayResponse,
  type SuccessfulStarNetFtpGatewayResponse,
} from '@/domain/starnet/remote-transport';

interface StarNetVmBridgeCardProps {
  run: AdjustmentRunSummary;
  previews: { dat: string; snproj: string };
  autoAdjust: AutoAdjustConfig;
}

type BusyAction = 'test' | 'run' | 'result';

function resultStorageKey(runId: string): string {
  return `btm:starnet-vm-result:${vmJobId(runId)}`;
}

function loadStoredResult(run: AdjustmentRunSummary): StarNetVmResult | undefined {
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

async function callFtpGateway(
  request: StarNetFtpGatewayRequest,
): Promise<SuccessfulStarNetFtpGatewayResponse> {
  const response = await fetch('/api/starnet-ftp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(request),
  });
  const payload = await response.json() as StarNetFtpGatewayResponse;
  if (!payload.ok) throw new Error(payload.message);
  return payload;
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function resultBelongsToRun(result: StarNetVmResult, run: AdjustmentRunSummary): boolean {
  return result.jobId === vmJobId(run.id)
    && result.runId === run.id
    && result.processingId === run.processingId;
}

/**
 * Manual prototype bridge. Connection secrets live only in React state and are resent to the
 * same-origin Vercel function for each short FTPS operation. They never enter localStorage.
 */
export function StarNetVmBridgeCard({ run, previews, autoAdjust }: StarNetVmBridgeCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<StarNetVmResult | undefined>(() => loadStoredResult(run));
  const [selectedFile, setSelectedFile] = useState('');
  const [connection, setConnection] = useState<EphemeralFtpConnection>({
    host: '',
    username: '',
    password: '',
    ...DEFAULT_EPHEMERAL_FTP_CONNECTION,
  });
  const [busy, setBusy] = useState<BusyAction>();
  const [queuedJobId, setQueuedJobId] = useState<string>();
  const [connectionOk, setConnectionOk] = useState(false);
  const [error, setError] = useState<string>();
  const [showFallback, setShowFallback] = useState(false);

  const summary = useMemo(() => (result ? parseStarNetConsoleSummary(result) : undefined), [result]);
  const selectedOutput = result?.outputFiles.find((file) => file.name === selectedFile)
    ?? result?.outputFiles.find((file) => file.extension.toLowerCase() === '.lst')
    ?? result?.outputFiles[0];
  const completeConnection = Boolean(
    connection.host
    && connection.username
    && connection.password
    && connection.incomingDirectory
    && connection.outgoingDirectory,
  );

  const storeResult = (parsed: StarNetVmResult) => {
    if (!resultBelongsToRun(parsed, run)) {
      throw new Error(`This result belongs to ${parsed.runId}, not ${run.id}`);
    }
    localStorage.setItem(resultStorageKey(run.id), JSON.stringify(parsed));
    setResult(parsed);
    setSelectedFile(
      parsed.outputFiles.find((item) => item.extension.toLowerCase() === '.lst')?.name
      ?? parsed.outputFiles[0]?.name
      ?? '',
    );
    setQueuedJobId(undefined);
  };

  const updateConnection = <K extends keyof EphemeralFtpConnection>(
    key: K,
    value: EphemeralFtpConnection[K],
  ) => {
    setConnection((current) => ({ ...current, [key]: value }));
    setConnectionOk(false);
  };

  const testConnection = async () => {
    setBusy('test');
    setError(undefined);
    try {
      const response = await callFtpGateway({ action: 'test', connection });
      if (response.action !== 'test') throw new Error('Unexpected gateway response');
      setConnectionOk(true);
    } catch (connectionError) {
      setConnectionOk(false);
      setError(connectionError instanceof Error ? connectionError.message : String(connectionError));
    } finally {
      setBusy(undefined);
    }
  };

  const retrieveResult = async (jobId: string): Promise<boolean> => {
    const response = await callFtpGateway({ action: 'result', connection, jobId });
    if (response.action !== 'result') throw new Error('Unexpected gateway response');
    if (response.state === 'pending') return false;
    storeResult(parseStarNetVmResult(response.result));
    return true;
  };

  const runOnVm = async () => {
    const job = createStarNetVmJob({ run, dat: previews.dat, snproj: previews.snproj, autoAdjust });
    setBusy('run');
    setError(undefined);
    try {
      const submitted = await callFtpGateway({ action: 'submit', connection, job });
      if (submitted.action !== 'submit') throw new Error('Unexpected gateway response');
      setQueuedJobId(submitted.jobId);
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
    const job = createStarNetVmJob({ run, dat: previews.dat, snproj: previews.snproj, autoAdjust });
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
              Run with STAR*NET 14
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Send this run to the Windows VM through its FTPS queue and retrieve the native result automatically.
            </Typography>
          </Box>
          {connectionOk && <Chip size="small" color="success" label="Connection verified" />}
          {queuedJobId && <Chip size="small" color="info" label="Queued on VM" />}
        </Stack>

        <Alert severity="info" variant="outlined">
          The credentials below remain only in this tab&apos;s memory. They are not saved in the
          processing, browser storage, database, GitHub or Vercel environment.
        </Alert>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '2fr 0.8fr 1.4fr 1.4fr' },
            gap: 1.25,
          }}
        >
          <TextField
            size="small"
            label="FTP/FTPS host"
            value={connection.host}
            autoComplete="off"
            placeholder="starnet.example.internal"
            onChange={(event) => updateConnection('host', event.target.value)}
            helperText="Must be allowlisted in Vercel"
          />
          <TextField
            size="small"
            label="Port"
            type="number"
            value={connection.port}
            onChange={(event) => updateConnection('port', Number(event.target.value))}
            inputProps={{ min: 1, max: 65_535 }}
          />
          <TextField
            size="small"
            label="Dedicated FTP user"
            value={connection.username}
            autoComplete="off"
            onChange={(event) => updateConnection('username', event.target.value)}
          />
          <TextField
            size="small"
            label="Password"
            type="password"
            value={connection.password}
            autoComplete="new-password"
            onChange={(event) => updateConnection('password', event.target.value)}
          />
          <FormControl size="small">
            <InputLabel id="ftp-security-mode">Connection security</InputLabel>
            <Select
              labelId="ftp-security-mode"
              label="Connection security"
              value={connection.security}
              onChange={(event) => {
                const security = event.target.value as FtpSecurityMode;
                setConnection((current) => ({
                  ...current,
                  security,
                  port: security === 'implicit-tls' ? 990 : 21,
                }));
                setConnectionOk(false);
              }}
            >
              <MenuItem value="explicit-tls">FTPS explicit TLS — recommended</MenuItem>
              <MenuItem value="implicit-tls">FTPS implicit TLS</MenuItem>
              <MenuItem value="plain">Plain FTP — local demo only</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="Incoming folder"
            value={connection.incomingDirectory}
            onChange={(event) => updateConnection('incomingDirectory', event.target.value)}
          />
          <TextField
            size="small"
            label="Outgoing folder"
            value={connection.outgoingDirectory}
            onChange={(event) => updateConnection('outgoingDirectory', event.target.value)}
          />
        </Box>

        {connection.security === 'plain' && (
          <Alert severity="warning">
            Plain FTP exposes the password and files in transit. Use it only with the local Docker
            simulator, never between public Vercel and the Windows VM.
          </Alert>
        )}
        {error && <Alert severity="error" onClose={() => setError(undefined)}>{error}</Alert>}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button
            variant="outlined"
            disabled={!completeConnection || Boolean(busy)}
            onClick={testConnection}
            data-testid="test-starnet-connection"
          >
            {busy === 'test' ? 'Testing…' : 'Test connection'}
          </Button>
          <Button
            variant="contained"
            disabled={!completeConnection || Boolean(busy)}
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
