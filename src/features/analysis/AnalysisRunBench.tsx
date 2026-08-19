import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import type { AnalysisEngine, AnalysisTrialResult } from '@/domain/analysis/types';
import type { AutoAdjustConfig } from '@/domain/entities';
import type { NativePreviews } from '@/domain/starnet/preview-builder';
import type { EphemeralStarNetServiceConnection } from '@/domain/starnet/service-transport';
import type { StarNetVmResult } from '@/domain/starnet/vm-bridge';
import type { TrialChange } from '@/features/analysis/analysis-view-model';
import { AnalysisRunRecap } from '@/features/analysis/AnalysisRunRecap';
import { useStarNetExecution } from '@/features/processings/use-starnet-execution';
import { ChiSquareBadge, StatusChip } from '@/features/shared/components';
import { NativeFilesPanel, type NativeFileEntry } from '@/features/shared/NativeFilesPanel';

export interface AnalysisRunBenchProps {
  processingId: number;
  versionId: string;
  slot: string;
  autoAdjust: AutoAdjustConfig;
  trials: Array<{ id: string; label: string; overrides: string[] }>;
  selectedIndex: number;
  onSelectTrial: (index: number) => void;
  onReset: () => void;
  /** The trial currently displayed by the map and the tables. */
  result: AnalysisTrialResult;
  resultLabel: string;
  resultEngine: AnalysisEngine;
  weightMultiplier: number;
  excludedComponentCount: number;
  freedReferenceCount: number;
  /** Native output of the displayed trial, when it was run with STAR*NET. */
  nativeResult?: StarNetVmResult;
  stale: boolean;
  changes: TrialChange[];
  engine: AnalysisEngine;
  onEngineChange: (engine: AnalysisEngine) => void;
  useAutoAdjust: boolean;
  onUseAutoAdjustChange: (value: boolean) => void;
  trialName: string;
  onTrialNameChange: (value: string) => void;
  onRunPreview: () => void;
  previewPending: boolean;
  /** Resolves the exact files and run identity of the attempt about to be submitted. */
  onPrepareNative: () => Promise<{ runId: string; previews: NativePreviews }>;
  preparePending: boolean;
  onNativeComplete: (runId: string, native: StarNetVmResult) => void;
  connection: EphemeralStarNetServiceConnection;
  onConnectionChange: (connection: EphemeralStarNetServiceConnection) => void;
}

/**
 * The run bench: what will run, with which engine, one button, and the result.
 *
 * It sits below the observations so the surveyor edits downwards and launches where the answer
 * appears, without scrolling back to the top. Both engines share the same three steps and the same
 * result strip — the native result is projected onto the same diagnostic contract — so switching
 * from the preview engine to the licensed STAR*NET changes what computes, not how it is driven.
 */
export function AnalysisRunBench({
  processingId,
  versionId,
  slot,
  autoAdjust,
  trials,
  selectedIndex,
  onSelectTrial,
  onReset,
  result,
  resultLabel,
  resultEngine,
  weightMultiplier,
  excludedComponentCount,
  freedReferenceCount,
  nativeResult,
  stale,
  changes,
  engine,
  onEngineChange,
  useAutoAdjust,
  onUseAutoAdjustChange,
  trialName,
  onTrialNameChange,
  onRunPreview,
  previewPending,
  onPrepareNative,
  preparePending,
  onNativeComplete,
  connection,
  onConnectionChange,
}: AnalysisRunBenchProps) {
  const { t } = useTranslation();
  const [editConnection, setEditConnection] = useState(false);
  const native = useStarNetExecution({
    run: { id: `analysis-${processingId}`, processingId, configVersionId: versionId, outputSlot: slot },
    previews: result.previews,
    autoAdjust: { ...autoAdjust, enabled: useAutoAdjust },
    persistResult: false,
    connection,
    onConnectionChange,
  });

  const launching = previewPending || preparePending || native.busy === 'run' || native.busy === 'test';
  const showConnection = editConnection || !native.connectionOk;
  // Only the connection can be missing before a launch. Whether the *files* can be generated is
  // decided by the attempt about to run, not by the trial on screen — otherwise a trial whose
  // previous files failed could never be fixed and re-run.
  const blocked = engine === 'starnet' && !native.completeConnection;

  const launch = async () => {
    if (engine === 'scientific-preview') {
      onRunPreview();
      return;
    }
    // The files of the attempt are prepared first, then handed to the service in the same gesture:
    // one click covers a native run exactly like a preview run.
    const attempt = await onPrepareNative();
    if (attempt.previews.error) {
      native.setError(attempt.previews.error);
      return;
    }
    const outcome = await native.runNow({
      autoTest: true,
      previews: attempt.previews,
      run: {
        id: attempt.runId,
        processingId,
        configVersionId: versionId,
        outputSlot: slot,
      },
    });
    if (outcome) onNativeComplete(attempt.runId, outcome);
  };

  const files: NativeFileEntry[] = [
    { name: 'input.dat', content: result.previews.dat },
    { name: 'project.prj', content: result.previews.prj },
    ...(nativeResult
      ? [
          ...[...nativeResult.outputFiles]
            .sort((left, right) => Number(right.extension.toLowerCase() === '.lst')
              - Number(left.extension.toLowerCase() === '.lst'))
            .map((file) => ({ name: file.name, content: file.content, sizeBytes: file.sizeBytes })),
          { name: t('starnetFiles.stdout'), content: nativeResult.console.stdout },
          { name: t('starnetFiles.stderr'), content: nativeResult.console.stderr },
        ]
      : []),
  ];

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} data-testid="run-bench">
      <Stack spacing={1.25}>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1} alignItems={{ lg: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 300 }}>
            <InputLabel id="selected-analysis-trial">{t('analysis.trials.current')}</InputLabel>
            <Select
              labelId="selected-analysis-trial"
              label={t('analysis.trials.current')}
              value={selectedIndex}
              onChange={(event) => onSelectTrial(Number(event.target.value))}
            >
              {trials.map((trial, index) => (
                <MenuItem key={trial.id} value={index}>
                  {trial.label} · {trial.overrides.join(' · ')}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Chip
            size="small"
            variant="outlined"
            label={resultEngine === 'starnet'
              ? t('analysis.trials.engineStarnet')
              : t('analysis.trials.enginePreview')}
          />
          <StatusChip status={result.diagnostic.ok ? 'converged' : 'failed'} />
          <ChiSquareBadge status={result.diagnostic.chiSquareStatus} />
          <Box sx={{ flexGrow: 1 }} />
          <Button variant="outlined" onClick={onReset}>{t('analysis.trials.reset')}</Button>
        </Stack>

        <Divider />

        <Typography variant="subtitle2" fontWeight={800}>{t('analysis.bench.willRun')}</Typography>
        {changes.length === 0 ? (
          <Alert severity="success" variant="outlined" data-testid="trial-up-to-date">
            {t('analysis.trials.upToDate')}
          </Alert>
        ) : (
          <Stack spacing={0.75}>
            {/* The before → after list is what turns a series of trials into a comparison. It is
                read here, in place, instead of in a modal that has to be dismissed. */}
            <Table size="small" aria-label={t('analysis.runDialog.title')} data-testid="bench-changes">
              <TableHead>
                <TableRow>
                  <TableCell>{t('analysis.runDialog.what')}</TableCell>
                  <TableCell>{t('analysis.runDialog.before')}</TableCell>
                  <TableCell>{t('analysis.runDialog.after')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {changes.map((change, index) => (
                  <TableRow key={`${change.key}-${change.subject ?? index}`}>
                    <TableCell>
                      <Typography variant="body2">
                        {t(`analysis.runDialog.change.${change.key}`, { defaultValue: change.key })}
                      </Typography>
                      {change.subject && (
                        <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                          {change.subject}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" fontFamily="monospace" color="text.secondary">
                        {change.before}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" fontFamily="monospace" fontWeight={700}>
                        {change.after}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TextField
              size="small"
              label={t('analysis.bench.name')}
              value={trialName}
              onChange={(event) => onTrialNameChange(event.target.value)}
              sx={{ maxWidth: 460 }}
              data-testid="trial-name"
            />
          </Stack>
        )}

        <Typography variant="subtitle2" fontWeight={800}>{t('analysis.bench.with')}</Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 280 }}>
            <InputLabel id="bench-engine">{t('analysis.trials.engine')}</InputLabel>
            <Select
              labelId="bench-engine"
              label={t('analysis.trials.engine')}
              value={engine}
              onChange={(event) => onEngineChange(event.target.value as AnalysisEngine)}
              data-testid="bench-engine"
            >
              <MenuItem value="scientific-preview">{t('analysis.trials.enginePreview')}</MenuItem>
              <MenuItem value="starnet">{t('analysis.trials.engineStarnet')}</MenuItem>
            </Select>
          </FormControl>
          <FormControlLabel
            control={(
              <Switch
                checked={useAutoAdjust}
                onChange={(event) => onUseAutoAdjustChange(event.target.checked)}
              />
            )}
            label={t('analysis.advanced.autoAdjust')}
          />
          {engine === 'scientific-preview' && (
            <Typography variant="caption" color="text.secondary">
              {t('analysis.trials.previewNotCertified')}
            </Typography>
          )}
        </Stack>

        {engine === 'starnet' && (
          <Stack spacing={1} sx={{ pl: { md: 1 }, borderLeft: { md: '3px solid' }, borderColor: { md: 'divider' } }}>
            {native.connectionOk && !editConnection ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  size="small"
                  color="success"
                  label={t('analysis.bench.serviceReady', {
                    host: native.hostMode === 'interactive-pilot'
                      ? t('analysis.bench.hostPilot')
                      : t('analysis.bench.hostService'),
                    slots: native.executionSlots ?? 1,
                  })}
                />
                <Button size="small" onClick={() => setEditConnection(true)}>
                  {t('analysis.bench.editConnection')}
                </Button>
              </Stack>
            ) : null}
            {showConnection && (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr 1fr' }, gap: 1 }}>
                <TextField
                  size="small"
                  label={t('analysis.bench.serviceUrl')}
                  value={native.connection.origin}
                  autoComplete="off"
                  placeholder="https://starnet-vm.example.internal"
                  onChange={(event) => native.updateConnection('origin', event.target.value)}
                />
                <TextField
                  size="small"
                  label={t('analysis.bench.serviceKey')}
                  type="password"
                  value={native.connection.apiKey}
                  autoComplete="new-password"
                  onChange={(event) => native.updateConnection('apiKey', event.target.value)}
                  helperText={t('analysis.bench.keyNotice')}
                />
                <FormControl size="small">
                  <InputLabel id="bench-launch-mode">{t('analysis.bench.launchMode')}</InputLabel>
                  <Select
                    labelId="bench-launch-mode"
                    label={t('analysis.bench.launchMode')}
                    value={native.launchMode}
                    onChange={(event) => native.setLaunchMode(event.target.value as 'standard' | 'no-graphics')}
                  >
                    <MenuItem value="standard">{t('analysis.bench.launchStandard')}</MenuItem>
                    <MenuItem value="no-graphics">{t('analysis.bench.launchNoGraphics')}</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            )}
            {native.incompatibleStandardService && (
              <Alert severity="warning">{native.incompatibleMessage}</Alert>
            )}
          </Stack>
        )}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
          <Tooltip title={changes.length === 0 ? t('analysis.trials.upToDate') : ''}>
            <span>
              <Button
                variant="contained"
                size="large"
                disabled={launching || changes.length === 0 || blocked}
                onClick={() => void launch()}
                data-testid="run-trial"
              >
                {launching ? t('analysis.trials.running') : t('analysis.trials.run')}
              </Button>
            </span>
          </Tooltip>
          {native.timings.length > 0 && (
            <Stack direction="row" spacing={1.5} data-testid="starnet-timings">
              {native.timings.map((timing) => (
                <Typography key={timing.step} variant="caption" color="text.secondary">
                  {t(`starnetTiming.${timing.step}`, { defaultValue: timing.step })}
                  {' '}
                  <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                    {(timing.ms / 1000).toFixed(2)} s
                  </Box>
                </Typography>
              ))}
            </Stack>
          )}
          {native.queuedJobId && (
            <Chip
              size="small"
              color="info"
              label={native.remoteLifecycle === 'running'
                ? t('analysis.bench.runningOnVm')
                : t('analysis.bench.queuedOnVm')}
            />
          )}
        </Stack>

        {result.previews.error && <Alert severity="error">{t('starnetFiles.blocked')}</Alert>}
        {engine === 'starnet' && !native.completeConnection && (
          <Alert severity="info" variant="outlined">{t('analysis.bench.connectionRequired')}</Alert>
        )}
        {native.error && (
          <Alert severity="error" onClose={() => native.setError(undefined)}>{native.error}</Alert>
        )}
        {native.queuedJobId && !native.busy && (
          <Button size="small" variant="outlined" sx={{ alignSelf: 'flex-start' }} onClick={() => void native.checkResult()}>
            {t('analysis.bench.checkResult')}
          </Button>
        )}

        <Divider />

        <AnalysisRunRecap
          result={result}
          trialLabel={resultLabel}
          weightMultiplier={weightMultiplier}
          excludedComponentCount={excludedComponentCount}
          freedReferenceCount={freedReferenceCount}
          stale={stale}
        />

        {nativeResult && (
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              color={nativeResult.status === 'succeeded' ? 'success' : 'error'}
              label={`STAR*NET ${nativeResult.status}`}
            />
            <Chip
              size="small"
              variant="outlined"
              label={nativeResult.starNet.fileVersion
                ? `v${nativeResult.starNet.fileVersion}`
                : nativeResult.starNet.executableName}
            />
            <Chip
              size="small"
              variant="outlined"
              label={nativeResult.starNet.mode === 'auto-adjust' ? 'Auto Adjust' : 'Run'}
            />
            <Chip
              size="small"
              variant="outlined"
              label={nativeResult.starNet.noGraphics ? 'No Graphics' : 'Standard CLI'}
            />
          </Stack>
        )}

        <Typography variant="subtitle2" fontWeight={800}>{t('analysis.nativeFiles.title')}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t('analysis.nativeFiles.description')}
        </Typography>
        <NativeFilesPanel
          files={files}
          error={result.previews.error}
          warnings={result.previews.warnings}
          downloadPrefix={`${processingId}-${resultLabel.replace(/[^A-Za-z0-9._-]+/g, '-')}`}
          testId="analysis-native-files"
        />
      </Stack>
    </Paper>
  );
}
