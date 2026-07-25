import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
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

interface StarNetVmBridgeCardProps {
  run: AdjustmentRunSummary;
  previews: { dat: string; snproj: string };
  autoAdjust: AutoAdjustConfig;
}

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

/**
 * File bridge used by the Vercel mock-up to exercise the licensed STAR*NET 14 VM without
 * exposing an FTP/RDP/API credential. It never publishes imported values to demo measures.
 */
export function StarNetVmBridgeCard({ run, previews, autoAdjust }: StarNetVmBridgeCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<StarNetVmResult | undefined>(() => loadStoredResult(run));
  const [selectedFile, setSelectedFile] = useState('');
  const [error, setError] = useState<string>();

  const summary = useMemo(() => (result ? parseStarNetConsoleSummary(result) : undefined), [result]);
  const selectedOutput = result?.outputFiles.find((file) => file.name === selectedFile)
    ?? result?.outputFiles.find((file) => file.extension.toLowerCase() === '.lst')
    ?? result?.outputFiles[0];

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
      const parsed = parseStarNetVmResult(JSON.parse(await file.text()));
      if (parsed.jobId !== vmJobId(run.id) || parsed.runId !== run.id || parsed.processingId !== run.processingId) {
        throw new Error(`This result belongs to ${parsed.runId}, not ${run.id}`);
      }
      localStorage.setItem(resultStorageKey(run.id), JSON.stringify(parsed));
      setResult(parsed);
      setSelectedFile(parsed.outputFiles.find((item) => item.extension.toLowerCase() === '.lst')?.name ?? parsed.outputFiles[0]?.name ?? '');
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
              Real STAR*NET 14 VM bridge
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Exchange one job file and one result file. No server, FTP or licence credential is stored in this browser or repository.
            </Typography>
          </Box>
          <Button variant="contained" size="small" onClick={exportJob} data-testid="download-starnet-job">
            1. Download job
          </Button>
          <Button variant="outlined" size="small" onClick={() => inputRef.current?.click()} data-testid="import-starnet-result">
            2. Import result
          </Button>
          <input ref={inputRef} type="file" accept=".json,application/json" hidden onChange={importResult} />
        </Stack>

        <Alert severity="info" variant="outlined">
          Place the <strong>.btmjob.json</strong> file in the VM queue. The local Windows worker creates a matching
          <strong> .btmresult.json</strong> in the outgoing folder. FTP may transport these files, but remains outside the mock-up.
        </Alert>
        {error && <Alert severity="error" onClose={() => setError(undefined)}>{error}</Alert>}

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
              Imported VM results are retained only in this browser for the mock-up. They do not overwrite BTM-style demo measures.
            </Typography>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
