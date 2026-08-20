import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
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
import { api } from '@/api/client';
import type { WizardDraft } from '@/demo/draft';
import { parseStarNetConsoleSummary } from '@/domain/starnet/native-output-parser';
import { nativeFailure } from '@/domain/starnet/native-failure';
import { ephemeralProcessingId } from '@/domain/starnet/vm-bridge';
import { DatumSummary } from '@/features/create/DatumSummary';
import { StationPrecisionEditor } from '@/features/create/StationPrecisionEditor';
import {
  compareTrials,
  restoreTrial,
  trialMetrics,
  trialSnapshot,
  type AdjustmentTrial,
} from '@/features/create/adjustment-trial-model';
import { useStarNetExecution } from '@/features/processings/use-starnet-execution';
import { AdvancedSection, DiagnosticPanel, UnitField } from '@/features/shared/components';
import { NativeFilesPanel } from '@/features/shared/NativeFilesPanel';
import type { TestEpochResult } from '@/features/shared/types';
import { fixed } from '@/features/shared/format';

type Engine = 'preview' | 'starnet';

/**
 * Adjustment — the parameters and the datum that every future run will use.
 *
 * Two things live here and nowhere else: **what the network is held by** (the coordinate records
 * STAR*NET reads, stations included) and the STAR*NET options themselves. The Analysis Lab reuses the
 * same vocabulary later, when a run has to be understood and a new configuration proposed; the
 * decisions themselves are taken here, once, for all the runs of this version.
 *
 * The epoch test drives both engines exactly like the lab's bench: one button, the same result, and
 * the generated files readable next to it.
 */
export function AdjustmentStep({
  draft,
  update,
  setDraft,
  onError,
  onGoToTargets,
}: {
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => void;
  setDraft: (draft: WizardDraft) => void;
  onError: (message: string) => void;
  /** The datum is decided in the Targets step; this is the way back to it. */
  onGoToTargets: () => void;
}) {
  const { t } = useTranslation();
  const adjustment = draft.adjustment;
  const patch = (next: Partial<typeof adjustment>) => update({ adjustment: { ...adjustment, ...next } });
  const patchWeights = (next: Partial<typeof adjustment.defaultWeights>) =>
    patch({ defaultWeights: { ...adjustment.defaultWeights, ...next } });

  const slotsQuery = useQuery({
    queryKey: ['slots', draft.id],
    queryFn: () => api<string[]>('GET', `/api/v2/drafts/${draft.id}/slots`),
  });
  const slots = useMemo(() => slotsQuery.data ?? [], [slotsQuery.data]);
  const [slot, setSlot] = useState('');
  const [engine, setEngine] = useState<Engine>('preview');
  const [result, setResult] = useState<TestEpochResult>();
  const [preparedRunId, setPreparedRunId] = useState('');
  /**
   * Every trial run in this session, newest last. Kept in component state on purpose: a trial is a
   * step in a conversation with the network, not part of the configuration being created, and it must
   * not survive into the immutable version.
   */
  const [trials, setTrials] = useState<AdjustmentTrial[]>([]);

  useEffect(() => {
    if (slot || slots.length === 0) return;
    setSlot(slots.at(-1) ?? '');
  }, [slot, slots]);

  const test = useMutation({
    mutationFn: () => api<TestEpochResult>('POST', `/api/v2/drafts/${draft.id}/test-epoch`, { slot }),
    onError: (error) => onError(String(error)),
  });

  const runReference = {
    id: preparedRunId || `draft-test-${draft.id}`,
    processingId: draft.editContext?.processingId ?? ephemeralProcessingId(draft.id),
    configVersionId: draft.editContext?.baseVersionId ?? `draft-${draft.id}`,
    outputSlot: slot,
  };
  const native = useStarNetExecution({
    run: runReference,
    previews: result?.previews ?? { dat: '', prj: '' },
    autoAdjust: draft.adjustment.autoAdjust,
    persistResult: false,
  });

  const launching = test.isPending || native.busy === 'run' || native.busy === 'test';

  const launch = async () => {
    const prepared = await test.mutateAsync();
    const runId = `draft-test-${draft.id}-${Date.now()}`;
    setResult(prepared);
    setPreparedRunId(runId);
    const previewPassed = prepared.diagnostic.ok && prepared.blocking.length === 0;
    // The trial records the configuration it ran with, so the comparison below is against numbers
    // that actually produced this result and reverting restores them verbatim.
    setTrials((current) => [...current, {
      id: runId,
      label: `${current.length + 1}`,
      slot,
      engine,
      metrics: trialMetrics(draft, prepared.diagnostic, prepared.blocking),
      snapshot: trialSnapshot(draft),
    }]);
    if (engine === 'preview') {
      setDraft({ ...draft, testEpochPassed: previewPassed });
      return;
    }
    if (prepared.previews.error) {
      native.setError(prepared.previews.error);
      return;
    }
    const outcome = await native.runNow({
      autoTest: true,
      previews: prepared.previews,
      run: { ...runReference, id: runId },
    });
    if (!outcome) return;
    const summary = parseStarNetConsoleSummary(outcome);
    setDraft({
      ...draft,
      testEpochPassed: outcome.status === 'succeeded' && summary.completed && summary.converged,
    });
  };

  /** What STAR*NET said if it refused — quoted, never rewritten. */
  const failure = native.result ? nativeFailure(native.result) : undefined;

  const files = result
    ? [
        { name: 'input.dat', content: result.previews.dat },
        { name: 'project.prj', content: result.previews.prj },
        ...(native.result
          ? [
              ...native.result.outputFiles.map((file) => ({ name: file.name, content: file.content, sizeBytes: file.sizeBytes })),
              { name: t('starnetFiles.stdout'), content: native.result.console.stdout },
            ]
          : []),
      ]
    : [];

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h2">{t('wizard.adjustment.title')}</Typography>
        <Typography variant="body2" color="text.secondary">{t('wizard.adjustment.description')}</Typography>
      </Box>

      {draft.weightsRequireValidation && (
        <Alert severity="warning">
          <Stack spacing={0.5}>
            <span>{t('wizard.adjustment.weightsProposal')}</span>
            <FormControlLabel
              control={(
                <Checkbox
                  size="small"
                  onChange={(event) => event.target.checked && update({ weightsRequireValidation: false })}
                />
              )}
              label={t('wizard.adjustment.weightsAccept')}
            />
          </Stack>
        </Alert>
      )}

      <DatumSummary draft={draft} onEditRequested={onGoToTargets} />

      <Divider />

      <Stack spacing={0.25}>
        <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 700 }}>
          {t('wizard.adjustment.sigmaTitle')}
        </Typography>
        <Typography variant="body2" color="text.secondary">{t('wizard.adjustment.sigmaDescription')}</Typography>
      </Stack>
      {/* The same editor the Instruments step mounts, on the same draft: one authority, two places to
          reach it. These used to be buried in this screen's advanced options, in another unit, with
          nothing saying which sight they applied to. */}
      {draft.stations.map((station) => (
        <Box
          key={station.stationCode}
          sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1.25 }}
          data-testid={`adjustment-precision-${station.stationCode}`}
        >
          <Stack spacing={1}>
            <Typography variant="subtitle2" fontFamily="monospace" fontWeight={800}>{station.stationCode}</Typography>
            <StationPrecisionEditor draft={draft} station={station} update={update} dense />
          </Stack>
        </Box>
      ))}

      <Divider />

      <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 700 }}>
        {t('wizard.adjustment.parameters')}
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip size="small" label={`template ${adjustment.templateId} v${adjustment.templateVersion}`} />
        <Chip
          size="small"
          label={`${adjustment.adjustmentType} · ${adjustment.linearUnits} · ${adjustment.angleOutputUnits} · ${adjustment.localOrGrid} · ${adjustment.coordinateOrder} · ${adjustment.input3dMode}`}
        />
      </Stack>
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        <TextField
          size="small"
          label={t('wizard.adjustment.convergeLimit')}
          type="number"
          value={adjustment.convergeLimit}
          onChange={(event) => patch({ convergeLimit: Number(event.target.value) })}
          inputProps={{ step: 0.001 }}
          helperText={t('wizard.adjustment.convergeHelp')}
        />
        <TextField
          size="small"
          label={t('wizard.adjustment.maxIterations')}
          type="number"
          value={adjustment.maximumIterations}
          onChange={(event) => patch({ maximumIterations: Number(event.target.value) })}
        />
        <TextField
          size="small"
          label={t('wizard.adjustment.chiSquare')}
          type="number"
          value={adjustment.chiSquareSignificancePercent}
          onChange={(event) => patch({ chiSquareSignificancePercent: Number(event.target.value) })}
          error={adjustment.chiSquareSignificancePercent <= 0 || adjustment.chiSquareSignificancePercent >= 100}
          inputProps={{ min: 0.001, max: 99.999 }}
        />
        <TextField
          size="small"
          label={t('wizard.adjustment.ellipse')}
          type="number"
          value={adjustment.ellipseConfidencePercent}
          onChange={(event) => patch({ ellipseConfidencePercent: Number(event.target.value) })}
          error={adjustment.ellipseConfidencePercent <= 0 || adjustment.ellipseConfidencePercent >= 100}
          inputProps={{ min: 0.001, max: 99.999 }}
        />
        <FormControlLabel
          control={(
            <Switch
              checked={adjustment.performErrorPropagation}
              onChange={(event) => patch({ performErrorPropagation: event.target.checked })}
            />
          )}
          label={t('wizard.adjustment.errorPropagation')}
        />
      </Stack>
      <FormControl size="small" sx={{ maxWidth: 460 }}>
        <InputLabel id="chi-policy">{t('wizard.adjustment.chiPolicy')}</InputLabel>
        <Select
          labelId="chi-policy"
          label={t('wizard.adjustment.chiPolicy')}
          value={draft.chiSquareFailurePolicy}
          onChange={(event) => update({ chiSquareFailurePolicy: event.target.value as WizardDraft['chiSquareFailurePolicy'] })}
        >
          <MenuItem value="fail-run">{t('wizard.adjustment.chiFail')}</MenuItem>
          <MenuItem value="auto-adjust">{t('wizard.adjustment.chiAuto')}</MenuItem>
          <MenuItem value="publish-failed-qc">{t('wizard.adjustment.chiPublish')}</MenuItem>
        </Select>
      </FormControl>

      <AdvancedSection title={t('wizard.adjustment.advanced')}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <UnitField label="Scale/datum factor" unit="—" value={adjustment.scaleFactor} onChange={(value) => patch({ scaleFactor: value })} step={0.00000001} width={200} />
            <UnitField label="Earth radius" unit="m" value={adjustment.earthRadiusM} onChange={(value) => patch({ earthRadiusM: value })} step={1000} width={200} />
            <UnitField label="Refraction coefficient" unit="—" value={adjustment.indexOfRefraction} onChange={(value) => patch({ indexOfRefraction: value })} step={0.01} width={200} />
          </Stack>
          <Typography variant="caption" color="text.secondary">{t('wizard.adjustment.scaleNote')}</Typography>
          <Typography variant="caption" color="text.secondary">{t('wizard.adjustment.projectDefaultsNote')}</Typography>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <UnitField label="Distance stderr" unit="m" value={adjustment.defaultWeights.distanceStdErrM} onChange={(value) => patchWeights({ distanceStdErrM: value })} step={0.0001} />
            <UnitField label="Distance ppm" unit="ppm" value={adjustment.defaultWeights.distancePpm} onChange={(value) => patchWeights({ distancePpm: value })} step={0.1} />
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel id="edm-error-model">EDM error combination</InputLabel>
              <Select
                labelId="edm-error-model"
                label="EDM error combination"
                value={adjustment.edmStdErrorModel ?? 'additive'}
                onChange={(event) => patch({ edmStdErrorModel: event.target.value as 'additive' | 'propagated' })}
              >
                <MenuItem value="additive">Additive: constant + ppm</MenuItem>
                <MenuItem value="propagated">Propagated: root sum square</MenuItem>
              </Select>
            </FormControl>
            <UnitField label="Angle" unit="arcsec" value={adjustment.defaultWeights.angleArcSec} onChange={(value) => patchWeights({ angleArcSec: value })} step={0.1} />
            <UnitField label="Direction" unit="arcsec" value={adjustment.defaultWeights.directionArcSec} onChange={(value) => patchWeights({ directionArcSec: value })} step={0.1} />
            <UnitField label="Azimuth" unit="arcsec" value={adjustment.defaultWeights.azimuthArcSec} onChange={(value) => patchWeights({ azimuthArcSec: value })} step={0.1} />
            <UnitField label="Zenith" unit="arcsec" value={adjustment.defaultWeights.zenithArcSec} onChange={(value) => patchWeights({ zenithArcSec: value })} step={0.1} />
            <UnitField label="Instr. centering" unit="m" value={adjustment.defaultWeights.instrumentCenteringM} onChange={(value) => patchWeights({ instrumentCenteringM: value })} step={0.0001} />
            <UnitField label="Target centering" unit="m" value={adjustment.defaultWeights.targetCenteringM} onChange={(value) => patchWeights({ targetCenteringM: value })} step={0.0001} />
          </Stack>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
            <FormControlLabel
              control={(
                <Switch
                  checked={adjustment.autoAdjust.enabled}
                  onChange={(event) => patch({ autoAdjust: { ...adjustment.autoAdjust, enabled: event.target.checked } })}
                />
              )}
              label="Auto Adjust available"
            />
            <TextField size="small" label="Max standardized residual" type="number" value={adjustment.autoAdjust.maxStandardizedResidual} onChange={(event) => patch({ autoAdjust: { ...adjustment.autoAdjust, maxStandardizedResidual: Number(event.target.value) } })} />
            <TextField size="small" label="Removed per iteration" type="number" value={adjustment.autoAdjust.outliersRemovedPerIteration} onChange={(event) => patch({ autoAdjust: { ...adjustment.autoAdjust, outliersRemovedPerIteration: Number(event.target.value) } })} />
            <TextField size="small" label="Max Auto Adjust iterations" type="number" value={adjustment.autoAdjust.maxIterations} onChange={(event) => patch({ autoAdjust: { ...adjustment.autoAdjust, maxIterations: Number(event.target.value) } })} helperText="Distinct from solution iterations (ADJ-003)" />
          </Stack>
        </Stack>
      </AdvancedSection>

      <Divider />

      <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 700 }}>
        {t('wizard.adjustment.testTitle')}
      </Typography>
      <Typography variant="body2" color="text.secondary">{t('wizard.adjustment.testDescription')}</Typography>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 260 }}>
          <InputLabel id="test-slot">{t('wizard.adjustment.slot')}</InputLabel>
          <Select
            labelId="test-slot"
            label={t('wizard.adjustment.slot')}
            value={slot}
            onChange={(event) => setSlot(event.target.value)}
            data-testid="test-slot-select"
          >
            {slots.slice(-12).map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 240 }}>
          <InputLabel id="test-engine">{t('analysis.trials.engine')}</InputLabel>
          <Select
            labelId="test-engine"
            label={t('analysis.trials.engine')}
            value={engine}
            onChange={(event) => setEngine(event.target.value as Engine)}
            data-testid="test-engine"
          >
            <MenuItem value="preview">{t('analysis.trials.enginePreview')}</MenuItem>
            <MenuItem value="starnet">{t('analysis.trials.engineStarnet')}</MenuItem>
          </Select>
        </FormControl>
        <Button
          variant="contained"
          disabled={!slot || launching || (engine === 'starnet' && !native.completeConnection)}
          onClick={() => void launch()}
          data-testid="run-test-epoch"
        >
          {launching ? t('wizard.adjustment.testing') : t('wizard.adjustment.test')}
        </Button>
        {draft.testEpochPassed && (
          <Chip color="success" size="small" label={t('wizard.adjustment.testPassed')} />
        )}
      </Stack>

      {engine === 'starnet' && (
        <Stack spacing={1} sx={{ pl: { md: 1 }, borderLeft: { md: '3px solid' }, borderColor: { md: 'divider' } }}>
          {native.connectionOk ? (
            <Chip
              size="small"
              color="success"
              sx={{ alignSelf: 'flex-start' }}
              label={t('analysis.bench.serviceReady', {
                host: native.hostMode === 'interactive-pilot' ? t('analysis.bench.hostPilot') : t('analysis.bench.hostService'),
                slots: native.executionSlots ?? 1,
              })}
            />
          ) : (
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
                <InputLabel id="wizard-launch-mode">{t('analysis.bench.launchMode')}</InputLabel>
                <Select
                  labelId="wizard-launch-mode"
                  label={t('analysis.bench.launchMode')}
                  value={native.launchMode}
                  onChange={(event) => native.setLaunchMode(event.target.value === 'no-graphics' ? 'no-graphics' : 'standard')}
                >
                  <MenuItem value="standard">{t('analysis.bench.launchStandard')}</MenuItem>
                  <MenuItem value="no-graphics">{t('analysis.bench.launchNoGraphics')}</MenuItem>
                </Select>
              </FormControl>
            </Box>
          )}
          {!native.completeConnection && (
            <Alert severity="info" variant="outlined">{t('analysis.bench.connectionRequired')}</Alert>
          )}
          {native.incompatibleStandardService && <Alert severity="warning">{native.incompatibleMessage}</Alert>}
          {native.timings.length > 0 && (
            <Stack direction="row" spacing={1.5} data-testid="starnet-timings">
              {native.timings.map((timing) => (
                <Typography key={timing.step} variant="caption" color="text.secondary">
                  {t(`starnetTiming.${timing.step}`, { defaultValue: timing.step })}
                  {' '}
                  <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                    {fixed(timing.ms / 1000, 2)} s
                  </Box>
                </Typography>
              ))}
            </Stack>
          )}
          {native.error && (
            <Alert severity="error" onClose={() => native.setError(undefined)}>{native.error}</Alert>
          )}
        </Stack>
      )}

      {!slotsQuery.isLoading && slots.length === 0 && (
        <Alert severity="warning">{t('wizard.adjustment.noSlot')}</Alert>
      )}

      {trials.length > 0 && (
        <Stack spacing={0.25}>
          <Typography variant="subtitle2" fontWeight={800}>{t('wizard.adjustment.trialsTitle')}</Typography>
          <Typography variant="caption" color="text.secondary">{t('wizard.adjustment.trialsDescription')}</Typography>
        </Stack>
      )}
      {trials.length > 0 && (
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'auto' }} data-testid="trial-comparison">
          <Table size="small" aria-label={t('wizard.adjustment.trialsTitle')}>
            <TableHead>
              <TableRow sx={{ '& th': { bgcolor: 'grey.50', fontSize: 10.5, fontWeight: 800, py: 0.5, letterSpacing: '.04em', color: 'text.secondary', whiteSpace: 'nowrap' } }}>
                <TableCell>{t('wizard.adjustment.trialLabel')}</TableCell>
                <TableCell>{t('analysis.trials.engine')}</TableCell>
                <TableCell align="right">{t('wizard.adjustment.trialSigma')}</TableCell>
                <TableCell align="right">{t('wizard.adjustment.trialHeld')}</TableCell>
                <TableCell align="right">{t('wizard.adjustment.trialDof')}</TableCell>
                <TableCell align="right">{t('wizard.adjustment.trialVariance')}</TableCell>
                <TableCell align="right">{t('wizard.adjustment.trialResidual')}</TableCell>
                <TableCell>{t('wizard.adjustment.trialChi')}</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {trials.map((trial, index) => {
                const previous = index > 0 ? trials[index - 1].metrics : undefined;
                const trend = previous ? compareTrials(previous, trial.metrics) : undefined;
                const trendColour = (direction: 'better' | 'worse' | 'same' | undefined) =>
                  direction === 'better' ? 'success.dark' : direction === 'worse' ? 'error.main' : undefined;
                return (
                  <TableRow key={trial.id} hover data-testid={`trial-row-${trial.label}`}>
                    <TableCell sx={{ py: 0.3 }}>
                      <Stack direction="row" spacing={0.6} alignItems="center">
                        <Typography variant="caption" fontWeight={800}>#{trial.label}</Typography>
                        <Chip
                          size="small"
                          color={trial.metrics.passed ? 'success' : 'error'}
                          variant="outlined"
                          label={t(trial.metrics.passed ? 'enums.status.passed' : 'enums.status.failed')}
                          sx={{ height: 17, '& .MuiChip-label': { px: 0.5, fontSize: 9.5 } }}
                        />
                        {trial.metrics.overrides > 0 && (
                          <Chip
                            size="small"
                            color="secondary"
                            variant="outlined"
                            label={trial.metrics.overrides}
                            sx={{ height: 17, '& .MuiChip-label': { px: 0.5, fontSize: 9.5 } }}
                          />
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ py: 0.3 }}>
                      <Typography variant="caption">{t(`analysis.trials.engine${trial.engine === 'preview' ? 'Preview' : 'Starnet'}`)}</Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ py: 0.3, fontFamily: 'monospace', fontSize: 11.5 }}>
                      {fixed(trial.metrics.sigmaDistanceMm, 2)} · {fixed(trial.metrics.sigmaDirectionArcSec, 2)}″
                    </TableCell>
                    <TableCell align="right" sx={{ py: 0.3, fontFamily: 'monospace', fontSize: 11.5 }}>{trial.metrics.heldReferences}</TableCell>
                    <TableCell align="right" sx={{ py: 0.3, fontFamily: 'monospace', fontSize: 11.5 }}>{trial.metrics.degreesOfFreedom}</TableCell>
                    <TableCell align="right" sx={{ py: 0.3, fontFamily: 'monospace', fontSize: 11.5, color: trendColour(trend?.varianceFactor), fontWeight: trend?.varianceFactor === 'same' ? 400 : 800 }}>
                      {fixed(trial.metrics.varianceFactor, 3)}
                    </TableCell>
                    <TableCell align="right" sx={{ py: 0.3, fontFamily: 'monospace', fontSize: 11.5, color: trendColour(trend?.maxStdResidual), fontWeight: trend?.maxStdResidual === 'same' ? 400 : 800 }}>
                      {fixed(trial.metrics.maxStdResidual, 2)}
                    </TableCell>
                    <TableCell sx={{ py: 0.3 }}>
                      <Typography variant="caption">{t(`enums.status.${trial.metrics.chiSquareStatus}`, { defaultValue: trial.metrics.chiSquareStatus })}</Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ py: 0.3 }}>
                      <Button
                        size="small"
                        onClick={() => update(restoreTrial(draft, trial))}
                        data-testid={`restore-trial-${trial.label}`}
                      >
                        {t('wizard.adjustment.trialRestore')}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}

      {result && (
        <Stack spacing={1.25}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {result.stationEpochs.map((station) => (
              <Chip
                key={station.stationCode}
                size="small"
                label={`${station.stationCode}: ${station.state}${station.ageMinutes !== undefined ? ` (${Math.round(station.ageMinutes)} min)` : ''}`}
                color={station.state === 'fresh' ? 'success' : station.state === 'reused' ? 'warning' : 'error'}
              />
            ))}
            <Chip
              size="small"
              label={`corrections: ${result.correctionSummary.nonZeroPrismDeltas} prism Δ≠0 · ${result.correctionSummary.atmosphericCorrections} atmospheric`}
            />
          </Stack>
          {result.blocking.map((message) => <Alert key={message} severity="error">{message}</Alert>)}

          {/* STAR*NET's own words, first and verbatim. A licensed engine we do not control has said
              why it refused; paraphrasing it would at best repeat it and at worst contradict it. Our
              explanation goes underneath, and the process detail goes in the tooltip. */}
          {failure && (
            <Alert
              severity="error"
              icon={false}
              data-testid="starnet-failure"
              sx={{ '& .MuiAlert-message': { width: '100%' } }}
            >
              <Stack spacing={0.75}>
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Typography variant="subtitle2" fontWeight={800}>STAR*NET</Typography>
                  <Tooltip
                    title={(
                      <Stack spacing={0.25} sx={{ py: 0.25 }}>
                        <Typography variant="caption">{t(`wizard.adjustment.failureSource.${failure.source}`)}</Typography>
                        {native.result && (
                          <Typography variant="caption">
                            {t('wizard.adjustment.failureDetail', {
                              status: native.result.status,
                              exitCode: native.result.exitCode ?? '—',
                            })}
                          </Typography>
                        )}
                      </Stack>
                    )}
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ cursor: 'help', textDecorationLine: 'underline', textDecorationStyle: 'dotted' }}
                    >
                      {t('wizard.adjustment.failureWhere')}
                    </Typography>
                  </Tooltip>
                </Stack>
                {failure.messages.length > 0 ? (
                  <Box
                    component="pre"
                    sx={{ m: 0, fontFamily: 'monospace', fontSize: 12.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                  >
                    {failure.messages.join('\n')}
                  </Box>
                ) : (
                  <Typography variant="caption">{t('wizard.adjustment.failureSilent')}</Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  {t('wizard.adjustment.failureHint')}
                </Typography>
              </Stack>
            </Alert>
          )}

          <DiagnosticPanel diagnostic={result.diagnostic} warnings={result.warnings} />
          <Tooltip title={t('wizard.adjustment.filesHint')}>
            <Typography variant="subtitle2" fontWeight={800} sx={{ alignSelf: 'flex-start' }}>
              {t('analysis.nativeFiles.title')}
            </Typography>
          </Tooltip>
          <NativeFilesPanel
            files={files}
            error={result.previews.error}
            warnings={result.previews.warnings}
            downloadPrefix={`draft-${draft.id}`}
            testId="wizard-native-files"
          />
        </Stack>
      )}
    </Stack>
  );
}
