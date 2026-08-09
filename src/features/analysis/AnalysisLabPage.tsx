import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { api } from '@/api/client';
import type {
  AnalysisAdjustmentOverrides,
  AnalysisCoordinate,
  AnalysisEngine,
  AnalysisObservationOverride,
  AnalysisReferenceSigmaOverride,
  AnalysisTrialOverrides,
  AnalysisTrialResult,
} from '@/domain/analysis/types';
import { starNetResultToDiagnostic } from '@/domain/starnet/native-diagnostic';
import type { EphemeralStarNetServiceConnection } from '@/domain/starnet/service-transport';
import type { StarNetVmResult } from '@/domain/starnet/vm-bridge';
import { AnalysisHistoryPanel } from '@/features/analysis/AnalysisHistoryPanel';
import { AnalysisNetworkPanel } from '@/features/analysis/AnalysisNetworkPanel';
import { AnalysisObservationsPanel } from '@/features/analysis/AnalysisObservationsPanel';
import { AnalysisPointsTable } from '@/features/analysis/AnalysisPointsTable';
import { plainLanguageQuality } from '@/features/analysis/analysis-view-model';
import { StarNetVmBridgeCard } from '@/features/processings/StarNetVmBridgeCard';
import {
  AdvancedSection,
  ChiSquareBadge,
  StatusChip,
  UnitField,
  type NetworkDeltaThresholds,
} from '@/features/shared/components';
import type { ProcessingDetail, StoredVersion } from '@/features/shared/types';

interface TrialSnapshot {
  engine: AnalysisEngine;
  excludedScalarObservationIds: string[];
  disabledReferenceKeys: string[];
  weightMultiplier: number;
  useAutoAdjust: boolean;
  observationOverrides: Record<string, AnalysisObservationOverride>;
  initialCoordinateOverrides: Record<string, AnalysisCoordinate>;
  referenceSigmaOverrides: Record<string, AnalysisReferenceSigmaOverride>;
  adjustmentOverrides: AnalysisAdjustmentOverrides;
}

interface Trial {
  id: string;
  label: string;
  overrides: string[];
  snapshot: TrialSnapshot;
  result: AnalysisTrialResult;
}

interface PendingNativeTrial {
  runId: string;
  label: string;
  overrides: string[];
  snapshot: TrialSnapshot;
  prepared: AnalysisTrialResult;
}

function localDateTime(iso: string): string {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function emptySnapshot(autoAdjustEnabled = false): TrialSnapshot {
  return {
    engine: 'scientific-preview',
    excludedScalarObservationIds: [],
    disabledReferenceKeys: [],
    weightMultiplier: 1,
    useAutoAdjust: autoAdjustEnabled,
    observationOverrides: {},
    initialCoordinateOverrides: {},
    referenceSigmaOverrides: {},
    adjustmentOverrides: {},
  };
}

function snapshotLabels(snapshot: TrialSnapshot, t: TFunction): string[] {
  const labels: string[] = [];
  if (snapshot.excludedScalarObservationIds.length) labels.push(t('analysis.trial.excluded', { count: snapshot.excludedScalarObservationIds.length }));
  if (snapshot.disabledReferenceKeys.length) labels.push(t('analysis.trial.freed', { count: snapshot.disabledReferenceKeys.length }));
  if (snapshot.weightMultiplier !== 1) labels.push(t('analysis.trial.multiplier', { value: snapshot.weightMultiplier }));
  if (Object.keys(snapshot.observationOverrides).length) labels.push(t('analysis.trial.sightsEdited', { count: Object.keys(snapshot.observationOverrides).length }));
  if (Object.keys(snapshot.initialCoordinateOverrides).length) labels.push(t('analysis.trial.initialsEdited', { count: Object.keys(snapshot.initialCoordinateOverrides).length }));
  if (Object.keys(snapshot.referenceSigmaOverrides).length) labels.push(t('analysis.trial.controlWeightsEdited', { count: Object.keys(snapshot.referenceSigmaOverrides).length }));
  if (Object.keys(snapshot.adjustmentOverrides).length) labels.push(t('analysis.trial.parametersEdited'));
  if (snapshot.useAutoAdjust) labels.push('Auto Adjust');
  return labels.length ? labels : [t('analysis.trial.noOverrides')];
}

function snapshotFingerprint(snapshot: TrialSnapshot): string {
  return JSON.stringify({
    ...snapshot,
    excludedScalarObservationIds: [...snapshot.excludedScalarObservationIds].sort(),
    disabledReferenceKeys: [...snapshot.disabledReferenceKeys].sort(),
  });
}

/** Guided analysis workspace. Trials are ephemeral; only an explicit dated candidate is persisted. */
export default function AnalysisLabPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const processingId = Number(id);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string>();
  const [versionId, setVersionId] = useState('');
  const [slot, setSlot] = useState('');
  const [baseline, setBaseline] = useState<Trial>();
  const [trials, setTrials] = useState<Trial[]>([]);
  const [selected, setSelected] = useState(0);
  const [engine, setEngine] = useState<AnalysisEngine>('scientific-preview');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [disabledRefs, setDisabledRefs] = useState<Set<string>>(new Set());
  const [multiplier, setMultiplier] = useState(1);
  const [useAutoAdjust, setUseAutoAdjust] = useState(false);
  const [observationOverrides, setObservationOverrides] = useState<Record<string, AnalysisObservationOverride>>({});
  const [coordinateOverrides, setCoordinateOverrides] = useState<Record<string, AnalysisCoordinate>>({});
  const [referenceSigmaOverrides, setReferenceSigmaOverrides] = useState<Record<string, AnalysisReferenceSigmaOverride>>({});
  const [adjustmentOverrides, setAdjustmentOverrides] = useState<AnalysisAdjustmentOverrides>({});
  const [deltaThresholds, setDeltaThresholds] = useState<NetworkDeltaThresholds>({ warningMm: 1, criticalMm: 3 });
  const [pendingNative, setPendingNative] = useState<PendingNativeTrial>();
  const [starNetConnection, setStarNetConnection] = useState<EphemeralStarNetServiceConnection>({ origin: '', apiKey: '' });
  const [candidateReason, setCandidateReason] = useState('');
  const [candidateValidFrom, setCandidateValidFrom] = useState('');
  const [savedVersion, setSavedVersion] = useState<StoredVersion>();

  const detail = useQuery({
    queryKey: ['processing', processingId],
    queryFn: () => api<ProcessingDetail>('GET', `/api/v2/topographic-adjustments/${processingId}`),
    enabled: Number.isFinite(processingId),
  });
  const slots = useQuery({
    queryKey: ['processing-slots', processingId],
    queryFn: () => api<string[]>('GET', `/api/v2/topographic-adjustments/${processingId}/slots`),
    enabled: Number.isFinite(processingId),
  });
  const versions = useMemo(() => detail.data?.versions ?? [], [detail.data?.versions]);
  const activeVersion = versions.find((version) => version.id === versionId);

  useEffect(() => {
    if (versionId || versions.length === 0) return;
    const preferred = versions.find((version) => version.status === 'active')
      ?? versions.filter((version) => version.status !== 'draft').at(-1)
      ?? versions.at(-1);
    if (preferred) setVersionId(preferred.id);
  }, [versionId, versions]);

  useEffect(() => {
    if (!slot && slots.data?.length) setSlot(slots.data.at(-1) ?? '');
  }, [slot, slots.data]);

  useEffect(() => {
    setBaseline(undefined);
    setTrials([]);
    setSelected(0);
    setPendingNative(undefined);
    setSavedVersion(undefined);
    if (slot) setCandidateValidFrom(localDateTime(slot));
  }, [versionId, slot]);

  const editorSnapshot = (): TrialSnapshot => ({
    engine,
    excludedScalarObservationIds: [...excluded],
    disabledReferenceKeys: [...disabledRefs],
    weightMultiplier: multiplier,
    useAutoAdjust,
    observationOverrides: structuredClone(observationOverrides),
    initialCoordinateOverrides: structuredClone(coordinateOverrides),
    referenceSigmaOverrides: structuredClone(referenceSigmaOverrides),
    adjustmentOverrides: structuredClone(adjustmentOverrides),
  });

  const trialPayload = (snapshot: TrialSnapshot): AnalysisTrialOverrides & { versionId: string; slot: string } => ({
    versionId,
    slot,
    excludedScalarObservationIds: snapshot.excludedScalarObservationIds,
    disabledReferenceKeys: snapshot.disabledReferenceKeys,
    weightMultiplier: snapshot.weightMultiplier,
    useAutoAdjust: snapshot.useAutoAdjust,
    observationOverrides: snapshot.observationOverrides,
    initialCoordinateOverrides: snapshot.initialCoordinateOverrides,
    referenceSigmaOverrides: snapshot.referenceSigmaOverrides,
    adjustmentOverrides: snapshot.adjustmentOverrides,
  });

  const callTrial = (snapshot: TrialSnapshot) => api<AnalysisTrialResult>(
    'POST',
    `/api/v2/topographic-adjustments/${processingId}/analysis/trial`,
    trialPayload(snapshot),
  );

  const restoreEditor = (trial: Trial) => {
    setEngine(trial.snapshot.engine);
    setExcluded(new Set(trial.snapshot.excludedScalarObservationIds));
    setDisabledRefs(new Set(trial.snapshot.disabledReferenceKeys));
    setMultiplier(trial.snapshot.weightMultiplier);
    setUseAutoAdjust(trial.snapshot.useAutoAdjust);
    setObservationOverrides(structuredClone(trial.snapshot.observationOverrides));
    setCoordinateOverrides(structuredClone(trial.snapshot.initialCoordinateOverrides));
    setReferenceSigmaOverrides(structuredClone(trial.snapshot.referenceSigmaOverrides));
    setAdjustmentOverrides(structuredClone(trial.snapshot.adjustmentOverrides));
  };

  const selectTrial = (index: number) => {
    const trial = baseline ? [baseline, ...trials][index] : undefined;
    if (!trial) return;
    setSelected(index);
    restoreEditor(trial);
  };

  const appendTrial = (trial: Trial) => {
    setTrials((current) => {
      setSelected(current.length + 1);
      return [...current, trial];
    });
    restoreEditor(trial);
  };

  const loadBaseline = useMutation({
    mutationFn: async () => {
      const snapshot = emptySnapshot(activeVersion?.adjustment.autoAdjust.enabled ?? false);
      return { snapshot, result: await callTrial(snapshot) };
    },
    onSuccess: ({ snapshot, result }) => {
      const first: Trial = { id: 'baseline', label: t('analysis.trial.baseline'), overrides: [t('analysis.trial.baselineChange')], snapshot, result };
      setBaseline(first);
      setTrials([]);
      setSelected(0);
      restoreEditor(first);
      setPendingNative(undefined);
      setSavedVersion(undefined);
    },
    onError: (value) => setError(String(value)),
  });

  const previewTrial = useMutation({
    mutationFn: async () => {
      const snapshot = editorSnapshot();
      const result = await callTrial(snapshot);
      return { snapshot, result };
    },
    onSuccess: ({ snapshot, result }) => appendTrial({
      id: `preview-${Date.now()}`,
      label: t('analysis.trial.preview', { number: trials.length + 1 }),
      overrides: snapshotLabels(snapshot, t),
      snapshot: { ...snapshot, engine: 'scientific-preview' },
      result,
    }),
    onError: (value) => setError(String(value)),
  });

  const prepareNative = useMutation({
    mutationFn: async () => {
      const snapshot = { ...editorSnapshot(), engine: 'starnet' as const };
      const prepared = await callTrial(snapshot);
      return { snapshot, prepared };
    },
    onSuccess: ({ snapshot, prepared }) => setPendingNative({
      runId: `analysis-${processingId}-${Date.now()}`,
      label: t('analysis.trial.native', { number: trials.length + 1 }),
      overrides: snapshotLabels(snapshot, t),
      snapshot,
      prepared,
    }),
    onError: (value) => setError(String(value)),
  });

  const onNativeComplete = (native: StarNetVmResult) => {
    if (!pendingNative || !activeVersion) return;
    const diagnostic = starNetResultToDiagnostic(native, pendingNative.prepared, activeVersion.adjustment.coordinateOrder);
    appendTrial({
      id: pendingNative.runId,
      label: pendingNative.label,
      overrides: pendingNative.overrides,
      snapshot: pendingNative.snapshot,
      result: {
        ...pendingNative.prepared,
        diagnostic,
        alerts: [...pendingNative.prepared.alerts, ...diagnostic.warnings],
      },
    });
    setPendingNative(undefined);
  };

  const allTrials = baseline ? [baseline, ...trials] : [];
  const current = allTrials[selected];
  const quality = current ? plainLanguageQuality(current.result.diagnostic) : undefined;
  const selectedSnapshot = current?.snapshot;
  const hasPendingChanges = Boolean(current
    && snapshotFingerprint(editorSnapshot()) !== snapshotFingerprint(current.snapshot));
  const hasSuccessfulSolution = Boolean(current?.result.diagnostic.ok
    && current.result.diagnostic.converged
    && current.result.diagnostic.rankDeficiency === 0
    && current.result.diagnostic.chiSquareStatus !== 'failed');
  const hasEditedMeasuredValues = Boolean(selectedSnapshot && Object.values(selectedSnapshot.observationOverrides).some((override) =>
    override.hzDeg !== undefined || override.vzDeg !== undefined || override.finalSlopeDistanceM !== undefined,
  ));

  const saveCandidate = useMutation({
    mutationFn: () => {
      if (!current || !activeVersion) throw new Error(t('analysis.trial.selectFirst'));
      const snapshot = current.snapshot;
      const pointsByName = new Map(current.result.points.map((point) => [point.engineName, point]));
      const initialCoordinates = Object.fromEntries(current.result.diagnostic.points
        .filter((point) => !pointsByName.get(point.engineName)?.fixed)
        .map((point) => [point.engineName, {
          eastingM: point.eastingM,
          northingM: point.northingM,
          heightM: point.heightM,
        }]));
      const targetMeasurementPrecision = Object.fromEntries(current.result.observations.map((observation) => [
        `${observation.stationEngineName}|${observation.targetEngineName}`,
        observation.effectivePrecision,
      ]));
      const candidateAdjustment = structuredClone(snapshot.adjustmentOverrides);
      candidateAdjustment.autoAdjust = {
        ...candidateAdjustment.autoAdjust,
        enabled: snapshot.useAutoAdjust,
      };
      return api<StoredVersion>('POST', `/api/v2/topographic-adjustments/${processingId}/analysis/candidate`, {
        baseVersionId: versionId,
        validFrom: new Date(candidateValidFrom).toISOString(),
        reason: candidateReason,
        excludedScalarObservationIds: snapshot.excludedScalarObservationIds,
        disabledReferenceKeys: snapshot.disabledReferenceKeys,
        adjustmentOverrides: candidateAdjustment,
        initialCoordinates,
        referenceSigmaOverrides: snapshot.referenceSigmaOverrides,
        targetMeasurementPrecision,
      });
    },
    onSuccess: (version) => {
      setSavedVersion(version);
      setCandidateReason('');
      queryClient.invalidateQueries({ queryKey: ['processing', processingId] });
    },
    onError: (value) => setError(String(value)),
  });

  const setWeight = (key: keyof NonNullable<AnalysisAdjustmentOverrides['defaultWeights']>, value: number) => {
    setAdjustmentOverrides((currentValue) => ({
      ...currentValue,
      defaultWeights: { ...currentValue.defaultWeights, [key]: value },
    }));
  };
  const effectiveWeight = (key: keyof NonNullable<AnalysisAdjustmentOverrides['defaultWeights']>): number => {
    const override = adjustmentOverrides.defaultWeights?.[key];
    return typeof override === 'number' ? override : activeVersion?.adjustment.defaultWeights[key] ?? 0;
  };

  const locale = i18n.resolvedLanguage === 'fr' ? 'fr-FR' : 'en-GB';
  const formatDate = (value: string) => new Date(value).toLocaleString(locale);

  if (detail.isLoading) return <Container sx={{ py: 4 }}><CircularProgress aria-label={t('analysis.loading')} /></Container>;
  if (detail.isError || !detail.data) return <Container sx={{ py: 4 }}><Alert severity="error">{t('analysis.notFound')}</Alert></Container>;

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} spacing={1}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h1">{t('analysis.title')}</Typography>
            <Typography color="text.secondary">{t('analysis.subtitle', { name: detail.data.processing.name })}</Typography>
          </Box>
          <Button component={RouterLink} to={`/processing/topographic-adjustment/${processingId}`}>{t('analysis.back')}</Button>
        </Stack>
        <Alert severity="info" variant="outlined">
          {t('analysis.temporary')}
        </Alert>
        {error && <Alert severity="error" onClose={() => setError(undefined)}>{error}</Alert>}

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1.25}>
            <Box>
              <Typography variant="h2">{t('analysis.choose.title')}</Typography>
              <Typography variant="body2" color="text.secondary">{t('analysis.choose.description')}</Typography>
            </Box>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
              <FormControl size="small" sx={{ minWidth: 280 }}>
                <InputLabel id="lab-version">{t('analysis.choose.version')}</InputLabel>
                <Select labelId="lab-version" label={t('analysis.choose.version')} value={versionId} onChange={(event) => setVersionId(event.target.value)}>
                  {versions.map((version) => <MenuItem key={version.id} value={version.id}>{version.label} · {t(`enums.status.${version.status}`, { defaultValue: version.status })} · {formatDate(version.validFrom)}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 270 }}>
                <InputLabel id="lab-slot">{t('analysis.choose.slot')}</InputLabel>
                <Select labelId="lab-slot" label={t('analysis.choose.slot')} value={slot} onChange={(event) => setSlot(event.target.value)}>
                  {(slots.data ?? []).slice(-96).map((value) => <MenuItem key={value} value={value}>{formatDate(value)}</MenuItem>)}
                </Select>
              </FormControl>
              <Button variant="contained" disabled={!versionId || !slot || loadBaseline.isPending} onClick={() => loadBaseline.mutate()} data-testid="load-baseline">
                {loadBaseline.isPending ? t('analysis.choose.loading') : baseline ? t('analysis.choose.reload') : t('analysis.choose.load')}
              </Button>
            </Stack>
            {activeVersion && <Typography variant="caption" color="text.secondary">{t('analysis.choose.validity', {
              from: formatDate(activeVersion.validFrom),
              to: activeVersion.validTo ? formatDate(activeVersion.validTo) : t('analysis.choose.openEnd'),
              count: activeVersion.stationBindings.length,
            })}</Typography>}
          </Stack>
        </Paper>

        {baseline && current && activeVersion && (
          <>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <AnalysisNetworkPanel
                result={current.result}
                deltaThresholds={deltaThresholds}
                onDeltaThresholdsChange={setDeltaThresholds}
              />
            </Paper>

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="h2">{t('analysis.editor.title')}</Typography>
                  <Typography variant="body2" color="text.secondary">{t('analysis.editor.description')}</Typography>
                </Box>
                {quality && <Alert severity={quality.severity}><Typography fontWeight={800}>{t(`analysis.quality.${quality.code}Title`)}</Typography><Typography variant="body2">{t(`analysis.quality.${quality.code}`)}</Typography></Alert>}
                <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems={{ lg: 'center' }}>
                  <Box>
                    <Typography variant="body2" fontWeight={800}>{t('analysis.editor.engine')}</Typography>
                    <ToggleButtonGroup exclusive value={engine} onChange={(_, value: AnalysisEngine | null) => value && setEngine(value)} size="small" aria-label={t('analysis.editor.engineAria')}>
                      <ToggleButton value="scientific-preview">{t('analysis.editor.preview')}</ToggleButton>
                      <ToggleButton value="starnet">{t('analysis.editor.starnet')}</ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                  <TextField
                    size="small"
                    type="number"
                    label={t('analysis.editor.multiplier')}
                    value={multiplier}
                    onChange={(event) => setMultiplier(Math.max(0.01, Number(event.target.value) || 1))}
                    inputProps={{ min: 0.01, max: 100, step: 0.1 }}
                    helperText={t('analysis.editor.multiplierHelp')}
                    sx={{ width: 290 }}
                  />
                  <FormControlLabel control={<Switch checked={useAutoAdjust} onChange={(event) => setUseAutoAdjust(event.target.checked)} />} label={t('analysis.editor.autoAdjust')} />
                  <Stack direction="row" spacing={1} sx={{ ml: { lg: 'auto' } }}>
                    <Button variant="outlined" onClick={() => restoreEditor(baseline)}>{t('analysis.editor.reset')}</Button>
                    <Button
                      variant="contained"
                      disabled={previewTrial.isPending || prepareNative.isPending}
                      onClick={() => engine === 'starnet' ? prepareNative.mutate() : previewTrial.mutate()}
                      data-testid="run-trial"
                    >
                      {previewTrial.isPending || prepareNative.isPending ? t('analysis.editor.preparing') : engine === 'starnet' ? t('analysis.editor.prepareNative') : t('analysis.editor.calculate')}
                    </Button>
                  </Stack>
                </Stack>

                <AdvancedSection title={t('analysis.editor.parameters')}>
                  <Stack spacing={1.5}>
                    <Alert severity="info" variant="outlined">{t('analysis.editor.parametersHelp')}</Alert>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <UnitField label={t('analysis.editor.hzSigma')} unit="arcsec" value={effectiveWeight('directionArcSec')} onChange={(value) => setWeight('directionArcSec', value)} step={0.05} />
                      <UnitField label={t('analysis.editor.vzSigma')} unit="arcsec" value={effectiveWeight('zenithArcSec')} onChange={(value) => setWeight('zenithArcSec', value)} step={0.05} />
                      <UnitField label={t('analysis.editor.instrumentCentring')} unit="mm" value={effectiveWeight('instrumentCenteringM') * 1000} onChange={(value) => setWeight('instrumentCenteringM', value / 1000)} step={0.1} />
                      <UnitField label={t('analysis.editor.targetCentring')} unit="mm" value={effectiveWeight('targetCenteringM') * 1000} onChange={(value) => setWeight('targetCenteringM', value / 1000)} step={0.1} />
                      <UnitField label={t('analysis.editor.verticalCentring')} unit="mm" value={effectiveWeight('verticalCenteringM') * 1000} onChange={(value) => setWeight('verticalCenteringM', value / 1000)} step={0.1} />
                      <UnitField label={t('analysis.editor.chiSignificance')} unit="%" value={adjustmentOverrides.chiSquareSignificancePercent ?? activeVersion.adjustment.chiSquareSignificancePercent} onChange={(value) => setAdjustmentOverrides((currentValue) => ({ ...currentValue, chiSquareSignificancePercent: value }))} step={0.1} />
                      <UnitField label={t('analysis.editor.ellipseConfidence')} unit="%" value={adjustmentOverrides.ellipseConfidencePercent ?? activeVersion.adjustment.ellipseConfidencePercent} onChange={(value) => setAdjustmentOverrides((currentValue) => ({ ...currentValue, ellipseConfidencePercent: value }))} step={0.1} />
                      <UnitField label={t('analysis.editor.iterations')} unit="" value={adjustmentOverrides.maximumIterations ?? activeVersion.adjustment.maximumIterations} onChange={(value) => setAdjustmentOverrides((currentValue) => ({ ...currentValue, maximumIterations: value }))} step={1} />
                      <UnitField label={t('analysis.editor.convergence')} unit="" value={adjustmentOverrides.convergeLimit ?? activeVersion.adjustment.convergeLimit} onChange={(value) => setAdjustmentOverrides((currentValue) => ({ ...currentValue, convergeLimit: value }))} step={0.00001} />
                      <UnitField label={t('analysis.editor.refraction')} unit="" value={adjustmentOverrides.indexOfRefraction ?? activeVersion.adjustment.indexOfRefraction} onChange={(value) => setAdjustmentOverrides((currentValue) => ({ ...currentValue, indexOfRefraction: value }))} step={0.01} />
                      <UnitField label={t('analysis.editor.scale')} unit="" value={adjustmentOverrides.scaleFactor ?? activeVersion.adjustment.scaleFactor} onChange={(value) => setAdjustmentOverrides((currentValue) => ({ ...currentValue, scaleFactor: value }))} step={0.000001} />
                    </Stack>
                  </Stack>
                </AdvancedSection>

                <AdvancedSection title={t('analysis.editor.observationsSection')}>
                  <AnalysisObservationsPanel
                    result={current.result}
                    excluded={excluded}
                    onToggleComponent={(scalarId) => setExcluded((previous) => {
                      const next = new Set(previous);
                      if (next.has(scalarId)) next.delete(scalarId); else next.add(scalarId);
                      return next;
                    })}
                    overrides={observationOverrides}
                    onOverride={(observationId, value) => setObservationOverrides((previous) => ({ ...previous, [observationId]: value }))}
                    weightMultiplier={multiplier}
                    defaultHzSigmaArcSec={effectiveWeight('directionArcSec')}
                    defaultVzSigmaArcSec={effectiveWeight('zenithArcSec')}
                  />
                </AdvancedSection>

                {pendingNative && (
                  <StarNetVmBridgeCard
                    key={pendingNative.runId}
                    run={{ id: pendingNative.runId, processingId, configVersionId: versionId, outputSlot: slot }}
                    previews={pendingNative.prepared.previews}
                    autoAdjust={{ ...activeVersion.adjustment.autoAdjust, enabled: pendingNative.snapshot.useAutoAdjust }}
                    title={t('analysis.editor.nativeTitle')}
                    description={t('analysis.editor.nativeDescription')}
                    persistResult={false}
                    onExecutionComplete={onNativeComplete}
                    connection={starNetConnection}
                    onConnectionChange={setStarNetConnection}
                  />
                )}
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="h2">{t('analysis.review.title')}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('analysis.review.description')}
                  </Typography>
                </Box>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
                  <FormControl size="small" sx={{ minWidth: 320 }}>
                    <InputLabel id="selected-analysis-trial">{t('analysis.review.calculation')}</InputLabel>
                    <Select
                      labelId="selected-analysis-trial"
                      label={t('analysis.review.calculation')}
                      value={selected}
                      onChange={(event) => selectTrial(Number(event.target.value))}
                    >
                      {allTrials.map((trial, index) => (
                        <MenuItem key={trial.id} value={index}>{trial.label} · {trial.overrides.join(' · ')}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Chip size="small" variant="outlined" label={t(current.snapshot.engine === 'starnet' ? 'analysis.review.native' : 'analysis.review.preview')} />
                  <StatusChip status={current.result.diagnostic.ok ? 'converged' : 'failed'} />
                  <ChiSquareBadge status={current.result.diagnostic.chiSquareStatus} />
                  <Typography variant="caption" color="text.secondary">{current.overrides.join(' · ')}</Typography>
                </Stack>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 1 }}>
                  {[
                    [t('analysis.review.rank'), `${current.result.diagnostic.rank}/${current.result.diagnostic.unknownCount}`],
                    [t('analysis.review.dof'), String(current.result.diagnostic.degreesOfFreedom)],
                    [t('analysis.review.variance'), Number.isFinite(current.result.diagnostic.varianceFactor) ? current.result.diagnostic.varianceFactor.toFixed(3) : '—'],
                    [t('analysis.review.maxResidual'), current.result.diagnostic.maxStdResidual.toFixed(2)],
                    [t('analysis.review.points'), String(current.result.diagnostic.points.length)],
                  ].map(([label, value]) => (
                    <Paper key={label} variant="outlined" sx={{ p: 1 }}>
                      <Typography variant="caption" color="text.secondary">{label}</Typography>
                      <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 900 }}>{value}</Typography>
                    </Paper>
                  ))}
                </Box>
                {current.result.alerts.map((alert) => <Alert key={alert} severity="warning" variant="outlined">{alert}</Alert>)}
                {current.result.warnings.map((warning) => <Alert key={warning} severity="info" variant="outlined">{warning}</Alert>)}
                {hasPendingChanges && (
                  <Alert severity="info" variant="outlined">
                    {t('analysis.review.pending', { trial: current.label })}
                  </Alert>
                )}
                <AnalysisPointsTable
                  result={current.result}
                  trialLabel={current.label}
                  deltaThresholds={deltaThresholds}
                  disabledReferences={disabledRefs}
                  onToggleReference={(name) => setDisabledRefs((previous) => {
                    const next = new Set(previous);
                    if (next.has(name)) next.delete(name); else next.add(name);
                    return next;
                  })}
                  coordinateOverrides={coordinateOverrides}
                  onCoordinateOverride={(name, value) => setCoordinateOverrides((previous) => ({ ...previous, [name]: value }))}
                  referenceSigmaOverrides={referenceSigmaOverrides}
                  onReferenceSigmaOverride={(name, value) => setReferenceSigmaOverrides((previous) => ({ ...previous, [name]: value }))}
                />
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="h2">{t('analysis.save.title')}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('analysis.save.description')}
                  </Typography>
                </Box>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
                  <TextField size="small" type="datetime-local" label={t('analysis.save.validFrom')} value={candidateValidFrom} onChange={(event) => setCandidateValidFrom(event.target.value)} InputLabelProps={{ shrink: true }} sx={{ minWidth: 250 }} />
                  <TextField size="small" label={t('analysis.save.reason')} value={candidateReason} onChange={(event) => setCandidateReason(event.target.value)} sx={{ flexGrow: 1, minWidth: 320 }} data-testid="candidate-reason" />
                </Stack>
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                  <Chip size="small" color="success" variant="outlined" label={t('analysis.save.newInitials', { count: current.result.diagnostic.points.filter((point) => !current.result.points.find((item) => item.engineName === point.engineName)?.fixed).length })} />
                  <Chip size="small" variant="outlined" label={t('analysis.save.control')} />
                  <Chip size="small" variant="outlined" label={t('analysis.save.precision', { count: current.result.observations.length })} />
                  <Chip size="small" variant="outlined" label={t('analysis.save.parameters')} />
                  <Chip size="small" variant="outlined" label={t('analysis.save.exclusions', { count: current.snapshot.excludedScalarObservationIds.length })} />
                </Stack>
                {current.snapshot.disabledReferenceKeys.length > 0 && <Alert severity="warning">{t('analysis.save.freed', { count: current.snapshot.disabledReferenceKeys.length })}</Alert>}
                {hasEditedMeasuredValues && <Alert severity="info">{t('analysis.save.editedValues')}</Alert>}
                {!hasSuccessfulSolution && <Alert severity="error">{t('analysis.save.invalid')}</Alert>}
                {hasPendingChanges && <Alert severity="warning">{t('analysis.save.pending')}</Alert>}
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Button
                    variant="contained"
                    disabled={!candidateReason.trim() || !candidateValidFrom || saveCandidate.isPending || hasPendingChanges || !hasSuccessfulSolution}
                    onClick={() => saveCandidate.mutate()}
                    data-testid="save-candidate"
                  >
                    {saveCandidate.isPending ? t('analysis.save.saving') : t('analysis.save.action')}
                  </Button>
                  <Typography variant="caption" color="text.secondary">{t('analysis.save.basedOn', { trial: current.label })}</Typography>
                </Stack>
                {savedVersion && <Alert severity="success">{t('analysis.save.success', { label: savedVersion.label, date: formatDate(savedVersion.validFrom) })}</Alert>}
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2 }}>
              <AnalysisHistoryPanel processingId={processingId} versions={versions} onError={setError} />
            </Paper>
          </>
        )}
      </Stack>
    </Container>
  );
}
