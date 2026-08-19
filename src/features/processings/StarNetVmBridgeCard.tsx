import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
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
  parseStarNetVmResult,
  vmJobId,
  type StarNetExecutionReference,
  type StarNetVmResult,
} from '@/domain/starnet/vm-bridge';
import type { NativePreviews } from '@/domain/starnet/preview-builder';
import { type EphemeralStarNetServiceConnection } from '@/domain/starnet/service-transport';
import { useStarNetExecution } from '@/features/processings/use-starnet-execution';
import { NativeFilesPanel, type NativeFileEntry } from '@/features/shared/NativeFilesPanel';

interface StarNetVmBridgeCardProps {
  run: StarNetExecutionReference;
  previews: NativePreviews;
  autoAdjust: AutoAdjustConfig;
  title?: string;
  description?: string;
  persistResult?: boolean;
  onExecutionComplete?: (result: StarNetVmResult) => void;
  /** Optional tab-memory connection owner, used by Analysis Lab across several trials. */
  connection?: EphemeralStarNetServiceConnection;
  onConnectionChange?: (connection: EphemeralStarNetServiceConnection) => void;
}

function downloadJson(fileName: string, value: unknown): void {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}
`], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

/**
 * Manual prototype bridge for a stored run: connect, submit, read the native result.
 *
 * The transport itself lives in `useStarNetExecution`, shared with the Analysis Lab bench. The key
 * lives only in that hook's state and is resent to the same-origin Vercel function for each short
 * HTTPS operation; it never enters localStorage.
 */
export function StarNetVmBridgeCard({
  run,
  previews,
  autoAdjust,
  title = 'Run with STAR*NET 14',
  description = 'Submit this run to the isolated Windows execution service and retrieve the native result automatically.',
  persistResult = true,
  onExecutionComplete,
  connection: controlledConnection,
  onConnectionChange,
}: StarNetVmBridgeCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();
  const [showFallback, setShowFallback] = useState(false);
  const execution = useStarNetExecution({
    run,
    previews,
    autoAdjust,
    persistResult,
    onExecutionComplete,
    connection: controlledConnection,
    onConnectionChange,
  });
  const {
    connection,
    updateConnection,
    completeConnection,
    connectionOk,
    executionSlots,
    hostMode,
    launchMode,
    setLaunchMode,
    incompatibleStandardService,
    incompatibleMessage,
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
  } = execution;

  const jobFiles: NativeFileEntry[] = [
    { name: 'input.dat', content: previews.dat },
    { name: 'project.prj', content: previews.prj },
  ];
  const listingFirst = (files: StarNetVmResult['outputFiles']) => [...files].sort((left, right) =>
    Number(right.extension.toLowerCase() === '.lst') - Number(left.extension.toLowerCase() === '.lst'));
  const outputFiles: NativeFileEntry[] = result
    ? [
        ...listingFirst(result.outputFiles).map((file) => ({ name: file.name, content: file.content, sizeBytes: file.sizeBytes })),
        { name: t('starnetFiles.stdout'), content: result.console.stdout },
        { name: t('starnetFiles.stderr'), content: result.console.stderr },
      ]
    : [];

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
              value={launchMode}
              onChange={(event) => setLaunchMode(event.target.value === 'no-graphics' ? 'no-graphics' : 'standard')}
            >
              <MenuItem value="standard">Standard CLI · Typical install</MenuItem>
              <MenuItem value="no-graphics">No Graphics CLI · Custom install</MenuItem>
            </Select>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.4, ml: 1.75 }}>
              Typical installations must use Standard CLI.
            </Typography>
          </FormControl>
        </Box>

        {timings.length > 0 && (
          <Box
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1.25 }}
            data-testid="starnet-timings"
          >
            <Typography variant="subtitle2" fontWeight={800}>{t('starnetTiming.title')}</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 1.5, rowGap: 0.25, mt: 0.5 }}>
              {timings.map((timing) => (
                <Box key={timing.step} sx={{ display: 'contents' }}>
                  <Typography variant="caption" color="text.secondary">
                    {t(`starnetTiming.${timing.step}`, { defaultValue: timing.step })}
                  </Typography>
                  <Typography variant="caption" fontFamily="monospace" fontWeight={timing.step === 'total' ? 800 : 400}>
                    {(timing.ms / 1000).toFixed(2)} s
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {error && <Alert severity="error" onClose={() => setError(undefined)}>{error}</Alert>}
        {filesUnavailable && <Alert severity="error">{t('starnetFiles.blocked')}</Alert>}
        {incompatibleStandardService && (
          <Alert severity="warning">{incompatibleMessage}</Alert>
        )}

        <Box>
          <Typography variant="subtitle2" fontWeight={800}>{t('starnetFiles.jobTitle')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
            {t('starnetFiles.jobDescription')}
          </Typography>
          <NativeFilesPanel
            files={jobFiles}
            error={previews.error}
            warnings={previews.warnings}
            downloadPrefix={vmJobId(run.id)}
            maxHeight={300}
            testId="starnet-job-files"
          />
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button
            variant="outlined"
            disabled={!completeConnection || Boolean(busy)}
            onClick={() => void testConnection()}
            data-testid="test-starnet-connection"
          >
            {busy === 'test' ? 'Testing…' : 'Test service'}
          </Button>
          <Button
            variant="contained"
            disabled={!connectionOk || incompatibleStandardService || filesUnavailable || Boolean(busy)}
            onClick={() => void runNow()}
            data-testid="run-real-starnet"
          >
            {busy === 'run' ? 'STAR*NET running…' : 'Run now with STAR*NET'}
          </Button>
          {queuedJobId && (
            <Button variant="outlined" disabled={Boolean(busy)} onClick={() => void checkResult()}>
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
              {summary.observationCount !== undefined && (
                <Chip size="small" variant="outlined" label={`${summary.observationCount} observations`} />
              )}
              {summary.degreesOfFreedom !== undefined && (
                <Chip size="small" variant="outlined" label={`${summary.degreesOfFreedom} DOF`} />
              )}
              {summary.totalErrorFactor !== undefined && (
                <Chip size="small" variant="outlined" label={`error factor ${summary.totalErrorFactor.toFixed(3)}`} />
              )}
              {summary.coordinateCount !== undefined && (
                <Chip size="small" variant="outlined" label={`${summary.coordinateCount} coordinates`} />
              )}
              {summary.runStatusCode !== undefined && (
                <Chip size="small" variant="outlined" label={`run code ${summary.runStatusCode}`} />
              )}
            </Stack>

            {result.error && <Alert severity="error">{result.error}</Alert>}
            <Box>
              <Typography variant="subtitle2" fontWeight={800}>{t('starnetFiles.outputTitle')}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
                {t('starnetFiles.outputDescription')}
              </Typography>
              <NativeFilesPanel
                files={outputFiles}
                emptyMessage={t('starnetFiles.outputEmpty')}
                downloadPrefix={vmJobId(run.id)}
                maxHeight={420}
                testId="starnet-output-files"
              />
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
