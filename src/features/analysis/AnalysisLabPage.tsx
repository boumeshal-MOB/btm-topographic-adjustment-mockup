import { useEffect, useMemo, useState } from 'react';
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

function snapshotLabels(snapshot: TrialSnapshot): string[] {
  const labels: string[] = [];
  if (snapshot.excludedScalarObservationIds.length) labels.push(`${snapshot.excludedScalarObservationIds.length} measurement component(s) excluded`);
  if (snapshot.disabledReferenceKeys.length) labels.push(`${snapshot.disabledReferenceKeys.length} reference(s) freed`);
  if (snapshot.weightMultiplier !== 1) labels.push(`all measurement sigmas ×${snapshot.weightMultiplier}`);
  if (Object.keys(snapshot.observationOverrides).length) labels.push(`${Object.keys(snapshot.observationOverrides).length} sight(s) edited`);
  if (Object.keys(snapshot.initialCoordinateOverrides).length) labels.push(`${Object.keys(snapshot.initialCoordinateOverrides).length} initial coordinate(s) edited`);
  if (Object.keys(snapshot.referenceSigmaOverrides).length) labels.push(`${Object.keys(snapshot.referenceSigmaOverrides).length} reference weight(s) edited`);
  if (Object.keys(snapshot.adjustmentOverrides).length) labels.push('adjustment parameters edited');
  if (snapshot.useAutoAdjust) labels.push('Auto Adjust');
  return labels.length ? labels : ['no overrides'];
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
      const first: Trial = { id: 'baseline', label: 'Trial 0 · baseline', overrides: ['immutable starting point'], snapshot, result };
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
      label: `Trial ${trials.length + 1} · scientific preview`,
      overrides: snapshotLabels(snapshot),
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
      label: `Trial ${trials.length + 1} · STAR*NET 14`,
      overrides: snapshotLabels(snapshot),
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
      if (!current || !activeVersion) throw new Error('Select a completed trial first');
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

  if (detail.isLoading) return <Container sx={{ py: 4 }}><CircularProgress aria-label="Loading Analysis Lab" /></Container>;
  if (detail.isError || !detail.data) return <Container sx={{ py: 4 }}><Alert severity="error">Processing not found.</Alert></Container>;

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} spacing={1}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h1">Analysis Lab</Typography>
            <Typography color="text.secondary">{detail.data.processing.name} · inspect, explain and improve one adjustment without changing raw data</Typography>
          </Box>
          <Button component={RouterLink} to={`/processing/topographic-adjustment/${processingId}`}>Back to processing</Button>
        </Stack>
        <Alert severity="info" variant="outlined">
          Every trial is temporary. Saving creates a new dated draft configuration; it never rewrites a used version or the source observations.
        </Alert>
        {error && <Alert severity="error" onClose={() => setError(undefined)}>{error}</Alert>}

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1.25}>
            <Box>
              <Typography variant="h2">1. Choose what to analyse</Typography>
              <Typography variant="body2" color="text.secondary">Select the configuration rules and the output epoch. The latest active configuration and latest available epoch are selected automatically.</Typography>
            </Box>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
              <FormControl size="small" sx={{ minWidth: 280 }}>
                <InputLabel id="lab-version">Configuration version</InputLabel>
                <Select labelId="lab-version" label="Configuration version" value={versionId} onChange={(event) => setVersionId(event.target.value)}>
                  {versions.map((version) => <MenuItem key={version.id} value={version.id}>{version.label} · {version.status} · from {new Date(version.validFrom).toLocaleString()}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 270 }}>
                <InputLabel id="lab-slot">Epoch / output slot</InputLabel>
                <Select labelId="lab-slot" label="Epoch / output slot" value={slot} onChange={(event) => setSlot(event.target.value)}>
                  {(slots.data ?? []).slice(-96).map((value) => <MenuItem key={value} value={value}>{new Date(value).toLocaleString()}</MenuItem>)}
                </Select>
              </FormControl>
              <Button variant="contained" disabled={!versionId || !slot || loadBaseline.isPending} onClick={() => loadBaseline.mutate()} data-testid="load-baseline">
                {loadBaseline.isPending ? 'Loading network…' : baseline ? 'Reload original epoch' : 'Load data and network'}
              </Button>
            </Stack>
            {activeVersion && <Typography variant="caption" color="text.secondary">Validity: {new Date(activeVersion.validFrom).toLocaleString()} → {activeVersion.validTo ? new Date(activeVersion.validTo).toLocaleString() : 'open end'} · {activeVersion.stationBindings.length} station(s)</Typography>}
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
                  <Typography variant="h2">3. Investigate and run a trial</Typography>
                  <Typography variant="body2" color="text.secondary">Start with geometry, then inspect residuals. Change precision only when it represents the real instrument, target or observation quality.</Typography>
                </Box>
                {quality && <Alert severity={quality.severity}><Typography fontWeight={800}>{quality.title}</Typography><Typography variant="body2">{quality.explanation}</Typography></Alert>}
                <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems={{ lg: 'center' }}>
                  <Box>
                    <Typography variant="body2" fontWeight={800}>Calculation engine</Typography>
                    <ToggleButtonGroup exclusive value={engine} onChange={(_, value: AnalysisEngine | null) => value && setEngine(value)} size="small" aria-label="Analysis calculation engine">
                      <ToggleButton value="scientific-preview">Fast scientific preview</ToggleButton>
                      <ToggleButton value="starnet">Licensed STAR*NET 14</ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                  <TextField
                    size="small"
                    type="number"
                    label="Global sigma multiplier"
                    value={multiplier}
                    onChange={(event) => setMultiplier(Math.max(0.01, Number(event.target.value) || 1))}
                    inputProps={{ min: 0.01, max: 100, step: 0.1 }}
                    helperText="1 = configured precision; >1 gives all measurements less influence"
                    sx={{ width: 290 }}
                  />
                  <FormControlLabel control={<Switch checked={useAutoAdjust} onChange={(event) => setUseAutoAdjust(event.target.checked)} />} label="Try Auto Adjust exclusions" />
                  <Stack direction="row" spacing={1} sx={{ ml: { lg: 'auto' } }}>
                    <Button variant="outlined" onClick={() => restoreEditor(baseline)}>Reset changes</Button>
                    <Button
                      variant="contained"
                      disabled={previewTrial.isPending || prepareNative.isPending}
                      onClick={() => engine === 'starnet' ? prepareNative.mutate() : previewTrial.mutate()}
                      data-testid="run-trial"
                    >
                      {previewTrial.isPending || prepareNative.isPending ? 'Preparing…' : engine === 'starnet' ? 'Prepare STAR*NET trial' : 'Calculate trial'}
                    </Button>
                  </Stack>
                </Stack>

                <AdvancedSection title="Adjustment parameters and global precision">
                  <Stack spacing={1.5}>
                    <Alert severity="info" variant="outlined">Hz and Vz are angular observations. Coordinate-control weights are shown with references on the network; sight-specific weights are shown in the table below.</Alert>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <UnitField label="Default Hz sigma" unit="arcsec" value={effectiveWeight('directionArcSec')} onChange={(value) => setWeight('directionArcSec', value)} step={0.05} />
                      <UnitField label="Default Vz sigma" unit="arcsec" value={effectiveWeight('zenithArcSec')} onChange={(value) => setWeight('zenithArcSec', value)} step={0.05} />
                      <UnitField label="Instrument centring" unit="mm" value={effectiveWeight('instrumentCenteringM') * 1000} onChange={(value) => setWeight('instrumentCenteringM', value / 1000)} step={0.1} />
                      <UnitField label="Target centring" unit="mm" value={effectiveWeight('targetCenteringM') * 1000} onChange={(value) => setWeight('targetCenteringM', value / 1000)} step={0.1} />
                      <UnitField label="Vertical centring" unit="mm" value={effectiveWeight('verticalCenteringM') * 1000} onChange={(value) => setWeight('verticalCenteringM', value / 1000)} step={0.1} />
                      <UnitField label="Chi-square significance" unit="%" value={adjustmentOverrides.chiSquareSignificancePercent ?? activeVersion.adjustment.chiSquareSignificancePercent} onChange={(value) => setAdjustmentOverrides((currentValue) => ({ ...currentValue, chiSquareSignificancePercent: value }))} step={0.1} />
                      <UnitField label="Ellipse confidence" unit="%" value={adjustmentOverrides.ellipseConfidencePercent ?? activeVersion.adjustment.ellipseConfidencePercent} onChange={(value) => setAdjustmentOverrides((currentValue) => ({ ...currentValue, ellipseConfidencePercent: value }))} step={0.1} />
                      <UnitField label="Maximum iterations" unit="" value={adjustmentOverrides.maximumIterations ?? activeVersion.adjustment.maximumIterations} onChange={(value) => setAdjustmentOverrides((currentValue) => ({ ...currentValue, maximumIterations: value }))} step={1} />
                      <UnitField label="Convergence limit" unit="" value={adjustmentOverrides.convergeLimit ?? activeVersion.adjustment.convergeLimit} onChange={(value) => setAdjustmentOverrides((currentValue) => ({ ...currentValue, convergeLimit: value }))} step={0.00001} />
                      <UnitField label="Refraction index" unit="" value={adjustmentOverrides.indexOfRefraction ?? activeVersion.adjustment.indexOfRefraction} onChange={(value) => setAdjustmentOverrides((currentValue) => ({ ...currentValue, indexOfRefraction: value }))} step={0.01} />
                      <UnitField label="Scale factor" unit="" value={adjustmentOverrides.scaleFactor ?? activeVersion.adjustment.scaleFactor} onChange={(value) => setAdjustmentOverrides((currentValue) => ({ ...currentValue, scaleFactor: value }))} step={0.000001} />
                    </Stack>
                  </Stack>
                </AdvancedSection>

                <AdvancedSection title="Observation-level precision, exclusions and measured values">
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
                    title="Run this exact trial with STAR*NET 14"
                    description="The prepared observations, exclusions, weights, coordinates and project options are sent to the isolated Windows service."
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
                  <Typography variant="h2">4. Review the current adjustment</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Choose a completed calculation. The map and the single point table below switch
                    together; selecting a previous trial also restores its parameters for a new run.
                  </Typography>
                </Box>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
                  <FormControl size="small" sx={{ minWidth: 320 }}>
                    <InputLabel id="selected-analysis-trial">Calculation</InputLabel>
                    <Select
                      labelId="selected-analysis-trial"
                      label="Calculation"
                      value={selected}
                      onChange={(event) => selectTrial(Number(event.target.value))}
                    >
                      {allTrials.map((trial, index) => (
                        <MenuItem key={trial.id} value={index}>{trial.label} · {trial.overrides.join(' · ')}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Chip size="small" variant="outlined" label={current.snapshot.engine === 'starnet' ? 'STAR*NET native' : 'scientific preview'} />
                  <StatusChip status={current.result.diagnostic.ok ? 'converged' : 'failed'} />
                  <ChiSquareBadge status={current.result.diagnostic.chiSquareStatus} />
                  <Typography variant="caption" color="text.secondary">{current.overrides.join(' · ')}</Typography>
                </Stack>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 1 }}>
                  {[
                    ['Rank', `${current.result.diagnostic.rank}/${current.result.diagnostic.unknownCount}`],
                    ['Degrees of freedom', String(current.result.diagnostic.degreesOfFreedom)],
                    ['Variance factor', Number.isFinite(current.result.diagnostic.varianceFactor) ? current.result.diagnostic.varianceFactor.toFixed(3) : '—'],
                    ['Max |v|/σ', current.result.diagnostic.maxStdResidual.toFixed(2)],
                    ['Adjusted points', String(current.result.diagnostic.points.length)],
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
                    Parameters or point controls have changed since {current.label}. Run a new
                    adjustment to update every value before saving.
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
                  <Typography variant="h2">5. Save the satisfactory setup as a dated version</Typography>
                  <Typography variant="body2" color="text.secondary">
                    This creates one complete draft from the selected calculation. The original
                    version, historical runs and raw observations remain immutable.
                  </Typography>
                </Box>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
                  <TextField size="small" type="datetime-local" label="Valid from" value={candidateValidFrom} onChange={(event) => setCandidateValidFrom(event.target.value)} InputLabelProps={{ shrink: true }} sx={{ minWidth: 250 }} />
                  <TextField size="small" label="Why is this configuration changing?" value={candidateReason} onChange={(event) => setCandidateReason(event.target.value)} sx={{ flexGrow: 1, minWidth: 320 }} data-testid="candidate-reason" />
                </Stack>
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                  <Chip size="small" color="success" variant="outlined" label={`${current.result.diagnostic.points.filter((point) => !current.result.points.find((item) => item.engineName === point.engineName)?.fixed).length} adjusted free-point coordinates → new initials`} />
                  <Chip size="small" variant="outlined" label="Reference control and E/N/H sigmas" />
                  <Chip size="small" variant="outlined" label={`${current.result.observations.length} station–point precision setup(s)`} />
                  <Chip size="small" variant="outlined" label="Adjustment and Auto Adjust parameters" />
                  <Chip size="small" variant="outlined" label={`${current.snapshot.excludedScalarObservationIds.length} explicit exclusion(s)`} />
                </Stack>
                {current.snapshot.disabledReferenceKeys.length > 0 && <Alert severity="warning">This calculated setup frees {current.snapshot.disabledReferenceKeys.length} reference(s). The new draft preserves that datum change for explicit review before activation.</Alert>}
                {hasEditedMeasuredValues && <Alert severity="info">Edited Hz/Vz/Sd values are diagnostic only and are never written back to raw data or the candidate. Save an exclusion or correct the upstream observation instead.</Alert>}
                {!hasSuccessfulSolution && <Alert severity="error">This calculation cannot be saved: obtain a converged full-rank solution whose χ² is passed or legitimately not applicable.</Alert>}
                {hasPendingChanges && <Alert severity="warning">Unsaved editor changes have not been calculated. Run a new adjustment before creating the version.</Alert>}
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Button
                    variant="contained"
                    disabled={!candidateReason.trim() || !candidateValidFrom || saveCandidate.isPending || hasPendingChanges || !hasSuccessfulSolution}
                    onClick={() => saveCandidate.mutate()}
                    data-testid="save-candidate"
                  >
                    {saveCandidate.isPending ? 'Saving…' : 'Save calculated setup as draft version'}
                  </Button>
                  <Typography variant="caption" color="text.secondary">Based on {current.label}; values become effective only after review and activation.</Typography>
                </Stack>
                {savedVersion && <Alert severity="success">Created {savedVersion.label} as a draft valid from {new Date(savedVersion.validFrom).toLocaleString()}. Review and activate it from Configuration versions.</Alert>}
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
