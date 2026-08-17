import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
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
  Tooltip,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type {
  AnalysisAdjustmentOverrides,
  AnalysisCoordinate,
  AnalysisEngine,
  AnalysisObservationOverride,
  AnalysisReferenceSigmaOverride,
  ReferenceConstraintModeOverride,
  AnalysisTrialOverrides,
  AnalysisTrialResult,
} from '@/domain/analysis/types';
import { starNetResultToDiagnostic } from '@/domain/starnet/native-diagnostic';
import type { EphemeralStarNetServiceConnection } from '@/domain/starnet/service-transport';
import type { StarNetVmResult } from '@/domain/starnet/vm-bridge';
import { AnalysisHistoryPanel } from '@/features/analysis/AnalysisHistoryPanel';
import { AnalysisInspector } from '@/features/analysis/AnalysisInspector';
import { AnalysisNetworkPanel } from '@/features/analysis/AnalysisNetworkPanel';
import { AnalysisObservationsPanel } from '@/features/analysis/AnalysisObservationsPanel';
import { describeTrialChanges } from '@/features/analysis/analysis-view-model';
import { AnalysisPointsTable } from '@/features/analysis/AnalysisPointsTable';
import { AnalysisRunRecap } from '@/features/analysis/AnalysisRunRecap';
import { RunTrialDialog } from '@/features/analysis/RunTrialDialog';
import { StarNetVmBridgeCard } from '@/features/processings/StarNetVmBridgeCard';
import { ValidationSessionCard } from '@/features/validation/ValidationSessionCard';
import {
  AdvancedSection,
  ChiSquareBadge,
  StatusChip,
  UnitField,
  type NetworkDeltaThresholds,
} from '@/features/shared/components';
import type { NetworkSelection } from '@/features/shared/network-selection';
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
  constraintModeOverrides: Record<string, ReferenceConstraintModeOverride>;
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
    constraintModeOverrides: {},
    adjustmentOverrides: {},
  };
}

function snapshotFingerprint(snapshot: TrialSnapshot): string {
  return JSON.stringify({
    ...snapshot,
    excludedScalarObservationIds: [...snapshot.excludedScalarObservationIds].sort(),
    disabledReferenceKeys: [...snapshot.disabledReferenceKeys].sort(),
  });
}

/**
 * Analysis Lab.
 *
 * One workspace instead of a stack of numbered forms: the map, the single points table, the
 * observation detail and the inspector all describe the *same* selection of the *same* trial, and
 * they change together. Editing happens on the selected business object; the STAR*NET preview
 * stays a derived, read-only artefact.
 */
export default function AnalysisLabPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const processingId = Number(id);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string>();
  const [versionId, setVersionId] = useState('');
  const [slot, setSlot] = useState('');
  const [baseline, setBaseline] = useState<Trial>();
  const [trials, setTrials] = useState<Trial[]>([]);
  const [selected, setSelected] = useState(0);
  const [selection, setSelection] = useState<NetworkSelection>();
  const [engine, setEngine] = useState<AnalysisEngine>('scientific-preview');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [disabledRefs, setDisabledRefs] = useState<Set<string>>(new Set());
  const [multiplier, setMultiplier] = useState(1);
  const [useAutoAdjust, setUseAutoAdjust] = useState(false);
  const [observationOverrides, setObservationOverrides] = useState<Record<string, AnalysisObservationOverride>>({});
  const [coordinateOverrides, setCoordinateOverrides] = useState<Record<string, AnalysisCoordinate>>({});
  const [referenceSigmaOverrides, setReferenceSigmaOverrides] = useState<Record<string, AnalysisReferenceSigmaOverride>>({});
  const [constraintModeOverrides, setConstraintModeOverrides] = useState<Record<string, ReferenceConstraintModeOverride>>({});
  const [adjustmentOverrides, setAdjustmentOverrides] = useState<AnalysisAdjustmentOverrides>({});
  const [deltaThresholds, setDeltaThresholds] = useState<NetworkDeltaThresholds>({ warningMm: 2, criticalMm: 3 });
  const [pendingNative, setPendingNative] = useState<PendingNativeTrial>();
  const [starNetConnection, setStarNetConnection] = useState<EphemeralStarNetServiceConnection>({ origin: '', apiKey: '' });
  const [candidateReason, setCandidateReason] = useState('');
  const [candidateValidFrom, setCandidateValidFrom] = useState('');
  const [savedVersion, setSavedVersion] = useState<StoredVersion>();
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [trialName, setTrialName] = useState('');

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
    setSelection(undefined);
    setPendingNative(undefined);
    setSavedVersion(undefined);
    if (slot) setCandidateValidFrom(localDateTime(slot));
  }, [versionId, slot]);

  const snapshotLabels = (snapshot: TrialSnapshot): string[] => {
    const labels: string[] = [];
    if (snapshot.excludedScalarObservationIds.length) labels.push(`${snapshot.excludedScalarObservationIds.length} excluded`);
    if (snapshot.disabledReferenceKeys.length) labels.push(`${snapshot.disabledReferenceKeys.length} freed`);
    if (snapshot.weightMultiplier !== 1) labels.push(`σ ×${snapshot.weightMultiplier}`);
    if (Object.keys(snapshot.observationOverrides).length) labels.push(`${Object.keys(snapshot.observationOverrides).length} sights edited`);
    if (Object.keys(snapshot.initialCoordinateOverrides).length) labels.push(`${Object.keys(snapshot.initialCoordinateOverrides).length} initials edited`);
    if (Object.keys(snapshot.referenceSigmaOverrides).length) labels.push(`${Object.keys(snapshot.referenceSigmaOverrides).length} reference weights`);
    if (Object.keys(snapshot.adjustmentOverrides).length) labels.push('adjustment parameters');
    if (snapshot.useAutoAdjust) labels.push('Auto Adjust');
    return labels.length ? labels : [t('analysis.trials.noOverrides')];
  };

  const editorSnapshot = (): TrialSnapshot => ({
    engine,
    excludedScalarObservationIds: [...excluded],
    disabledReferenceKeys: [...disabledRefs],
    weightMultiplier: multiplier,
    useAutoAdjust,
    observationOverrides: structuredClone(observationOverrides),
    initialCoordinateOverrides: structuredClone(coordinateOverrides),
    referenceSigmaOverrides: structuredClone(referenceSigmaOverrides),
    constraintModeOverrides: structuredClone(constraintModeOverrides),
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
    constraintModeOverrides: snapshot.constraintModeOverrides,
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
    setConstraintModeOverrides(structuredClone(trial.snapshot.constraintModeOverrides ?? {}));
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
      const first: Trial = {
        id: 'baseline',
        label: t('analysis.trials.baseline'),
        overrides: [t('analysis.trials.baselineOverride')],
        snapshot,
        result,
      };
      setBaseline(first);
      setTrials([]);
      setSelected(0);
      setSelection(undefined);
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
      label: trialName.trim() || `Trial ${trials.length + 1} · ${t('analysis.trials.enginePreview')}`,
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
      label: trialName.trim() || `Trial ${trials.length + 1} · ${t('analysis.trials.engineStarnet')}`,
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

  // Objects the user changed since the displayed trial was computed. Shown in amber everywhere
  // so an edited number is never mistaken for part of the validated result.
  const editedPointNames = useMemo(() => {
    return new Set<string>([
      ...Object.keys(coordinateOverrides),
      ...Object.keys(referenceSigmaOverrides),
      ...Object.keys(constraintModeOverrides),
    ]);
  }, [coordinateOverrides, referenceSigmaOverrides, constraintModeOverrides]);
  const editedObservationIds = useMemo(
    () => new Set(Object.keys(observationOverrides)),
    [observationOverrides],
  );

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
        constraintModeOverrides: snapshot.constraintModeOverrides,
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

  const setOverride = <T,>(
    setter: Dispatch<SetStateAction<Record<string, T>>>,
  ) => (key: string, value: T | undefined) => setter((previous) => {
    if (value === undefined) {
      const next = { ...previous };
      delete next[key];
      return next;
    }
    return { ...previous, [key]: value };
  });
  const toggleReference = (engineName: string) => setDisabledRefs((previous) => {
    const next = new Set(previous);
    if (next.has(engineName)) next.delete(engineName); else next.add(engineName);
    return next;
  });

  if (detail.isLoading) {
    return <Container sx={{ py: 4 }}><CircularProgress aria-label={t('analysis.title')} /></Container>;
  }
  if (detail.isError || !detail.data) {
    return <Container sx={{ py: 4 }}><Alert severity="error">Processing not found.</Alert></Container>;
  }

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} spacing={1}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h1">{t('analysis.title')}</Typography>
            <Typography color="text.secondary">
              {detail.data.processing.name} · {t('analysis.subtitle')}
            </Typography>
          </Box>
          <Button component={RouterLink} to={`/processing/topographic-adjustment/${processingId}`}>
            {t('analysis.backToProcessing')}
          </Button>
        </Stack>

        <ValidationSessionCard processingId={processingId} />

        <Alert severity="info" variant="outlined">{t('analysis.immutableNotice')}</Alert>
        {error && <Alert severity="error" onClose={() => setError(undefined)}>{error}</Alert>}

        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1} alignItems={{ lg: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 260 }}>
              <InputLabel id="lab-version">{t('analysis.setup.version')}</InputLabel>
              <Select
                labelId="lab-version"
                label={t('analysis.setup.version')}
                value={versionId}
                onChange={(event) => setVersionId(event.target.value)}
              >
                {versions.map((version) => (
                  <MenuItem key={version.id} value={version.id}>
                    {version.label} · {version.status} · {new Date(version.validFrom).toLocaleString()}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 250 }}>
              <InputLabel id="lab-slot">{t('analysis.setup.epoch')}</InputLabel>
              <Select
                labelId="lab-slot"
                label={t('analysis.setup.epoch')}
                value={slot}
                onChange={(event) => setSlot(event.target.value)}
              >
                {(slots.data ?? []).slice(-96).map((value) => (
                  <MenuItem key={value} value={value}>{new Date(value).toLocaleString()}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              disabled={!versionId || !slot || loadBaseline.isPending}
              onClick={() => loadBaseline.mutate()}
              data-testid="load-baseline"
            >
              {loadBaseline.isPending
                ? t('analysis.setup.loading')
                : baseline ? t('analysis.setup.reload') : t('analysis.setup.load')}
            </Button>
            {activeVersion && (
              <Typography variant="caption" color="text.secondary">
                {t('analysis.setup.validity', {
                  from: new Date(activeVersion.validFrom).toLocaleString(),
                  to: activeVersion.validTo
                    ? new Date(activeVersion.validTo).toLocaleString()
                    : t('analysis.setup.openEnd'),
                })}
              </Typography>
            )}
          </Stack>
        </Paper>

        {baseline && current && activeVersion && (
          <>
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Stack spacing={1.25}>
                <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1} alignItems={{ lg: 'center' }}>
                  <FormControl size="small" sx={{ minWidth: 300 }}>
                    <InputLabel id="selected-analysis-trial">{t('analysis.trials.current')}</InputLabel>
                    <Select
                      labelId="selected-analysis-trial"
                      label={t('analysis.trials.current')}
                      value={selected}
                      onChange={(event) => selectTrial(Number(event.target.value))}
                    >
                      {allTrials.map((trial, index) => (
                        <MenuItem key={trial.id} value={index}>
                          {trial.label} · {trial.overrides.join(' · ')}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={current.snapshot.engine === 'starnet'
                      ? t('analysis.trials.engineStarnet')
                      : t('analysis.trials.enginePreview')}
                  />
                  <StatusChip status={current.result.diagnostic.ok ? 'converged' : 'failed'} />
                  <ChiSquareBadge status={current.result.diagnostic.chiSquareStatus} />
                  <Box sx={{ flexGrow: 1 }} />
                  <Button variant="outlined" onClick={() => restoreEditor(baseline)}>
                    {t('analysis.trials.reset')}
                  </Button>
                  {/* Re-running an unchanged snapshot would add a trial identical to the one on
                      screen, so the action stays disabled and says why. */}
                  <Tooltip title={!hasPendingChanges ? t('analysis.trials.upToDate') : ''}>
                    <span>
                      <Button
                        variant="contained"
                        disabled={previewTrial.isPending || prepareNative.isPending || !hasPendingChanges}
                        onClick={() => {
                          setTrialName('');
                          setRunDialogOpen(true);
                        }}
                        data-testid="run-trial"
                      >
                        {previewTrial.isPending || prepareNative.isPending
                          ? t('analysis.trials.running')
                          : t('analysis.trials.run')}
                      </Button>
                    </span>
                  </Tooltip>
                </Stack>

                <AnalysisRunRecap
                  result={current.result}
                  trialLabel={current.label}
                  weightMultiplier={current.snapshot.weightMultiplier}
                  excludedComponentCount={current.snapshot.excludedScalarObservationIds.length}
                  freedReferenceCount={current.snapshot.disabledReferenceKeys.length}
                  stale={hasPendingChanges}
                />
                {!hasPendingChanges && (
                  <Alert severity="success" variant="outlined" data-testid="trial-up-to-date">
                    {t('analysis.trials.upToDate')}
                  </Alert>
                )}
              </Stack>
            </Paper>

            <RunTrialDialog
              open={runDialogOpen}
              changes={current ? describeTrialChanges(current.snapshot, editorSnapshot()) : []}
              trialName={trialName}
              onTrialNameChange={setTrialName}
              engineLabel={engine === 'starnet'
                ? t('analysis.trials.engineStarnet')
                : t('analysis.trials.enginePreview')}
              pending={previewTrial.isPending || prepareNative.isPending}
              onConfirm={() => {
                setRunDialogOpen(false);
                if (engine === 'starnet') prepareNative.mutate();
                else previewTrial.mutate();
              }}
              onCancel={() => setRunDialogOpen(false)}
            />

            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems="flex-start">
              <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 0, width: '100%' }}>
                <AnalysisNetworkPanel
                  result={current.result}
                  deltaThresholds={deltaThresholds}
                  onDeltaThresholdsChange={setDeltaThresholds}
                  selection={selection}
                  onSelect={setSelection}
                />
              </Paper>
              <Paper
                variant="outlined"
                sx={{ width: { xs: '100%', lg: 380 }, flexShrink: 0, position: { lg: 'sticky' }, top: { lg: 16 } }}
              >
                <AnalysisInspector
                  selection={selection}
                  result={current.result}
                  excluded={excluded}
                  onExcludedChange={setExcluded}
                  disabledReferences={disabledRefs}
                  onToggleReference={toggleReference}
                  coordinateOverrides={coordinateOverrides}
                  onCoordinateOverride={setOverride(setCoordinateOverrides)}
                  referenceSigmaOverrides={referenceSigmaOverrides}
                  onReferenceSigmaOverride={setOverride(setReferenceSigmaOverrides)}
                  constraintModeOverrides={constraintModeOverrides}
                  onConstraintModeOverride={setOverride(setConstraintModeOverrides)}
                  observationOverrides={observationOverrides}
                  onObservationOverride={setOverride(setObservationOverrides)}
                  onSelect={setSelection}
                />
              </Paper>
            </Stack>

            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <AnalysisPointsTable
                result={current.result}
                trialLabel={current.label}
                deltaThresholds={deltaThresholds}
                disabledReferences={disabledRefs}
                selection={selection}
                onSelect={setSelection}
                editedPointNames={editedPointNames}
              />
            </Paper>

            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <AnalysisObservationsPanel
                result={current.result}
                excluded={excluded}
                selection={selection}
                onSelect={setSelection}
                editedObservationIds={editedObservationIds}
              />
            </Paper>

            <AdvancedSection title={t('analysis.advanced.title')}>
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems={{ lg: 'center' }}>
                  <Box>
                    <Typography variant="body2" fontWeight={800}>{t('analysis.trials.engine')}</Typography>
                    <ToggleButtonGroup
                      exclusive
                      value={engine}
                      onChange={(_, value: AnalysisEngine | null) => value && setEngine(value)}
                      size="small"
                      aria-label={t('analysis.trials.engine')}
                    >
                      <ToggleButton value="scientific-preview">{t('analysis.trials.enginePreview')}</ToggleButton>
                      <ToggleButton value="starnet">{t('analysis.trials.engineStarnet')}</ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                  <TextField
                    size="small"
                    type="number"
                    label={t('analysis.advanced.multiplier')}
                    value={multiplier}
                    onChange={(event) => setMultiplier(Math.max(0.01, Number(event.target.value) || 1))}
                    inputProps={{ min: 0.01, max: 100, step: 0.1 }}
                    helperText={t('analysis.advanced.multiplierHelp')}
                    sx={{ width: 260 }}
                  />
                  <FormControlLabel
                    control={<Switch checked={useAutoAdjust} onChange={(event) => setUseAutoAdjust(event.target.checked)} />}
                    label={t('analysis.advanced.autoAdjust')}
                  />
                </Stack>
                <Alert severity="info" variant="outlined">{t('analysis.trials.previewNotCertified')}</Alert>
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
            </AdvancedSection>

            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Stack spacing={1.25}>
                <Box>
                  <Typography variant="h2" sx={{ fontSize: '1.05rem' }}>{t('analysis.save.title')}</Typography>
                  <Typography variant="body2" color="text.secondary">{t('analysis.save.description')}</Typography>
                </Box>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
                  <TextField
                    size="small"
                    type="datetime-local"
                    label={t('analysis.save.validFrom')}
                    value={candidateValidFrom}
                    onChange={(event) => setCandidateValidFrom(event.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ minWidth: 240 }}
                  />
                  <TextField
                    size="small"
                    label={t('analysis.save.reason')}
                    value={candidateReason}
                    onChange={(event) => setCandidateReason(event.target.value)}
                    sx={{ flexGrow: 1, minWidth: 300 }}
                    data-testid="candidate-reason"
                  />
                </Stack>
                {current.snapshot.disabledReferenceKeys.length > 0 && (
                  <Alert severity="warning">
                    {t('analysis.save.freedReferences', { count: current.snapshot.disabledReferenceKeys.length })}
                  </Alert>
                )}
                {hasEditedMeasuredValues && <Alert severity="info">{t('analysis.save.editedValuesIgnored')}</Alert>}
                {!hasSuccessfulSolution && <Alert severity="error">{t('analysis.save.blockedQuality')}</Alert>}
                {hasPendingChanges && <Alert severity="warning">{t('analysis.save.blockedStale')}</Alert>}
                <Button
                  variant="contained"
                  sx={{ alignSelf: 'flex-start' }}
                  disabled={!candidateReason.trim() || !candidateValidFrom || saveCandidate.isPending || hasPendingChanges || !hasSuccessfulSolution}
                  onClick={() => saveCandidate.mutate()}
                  data-testid="save-candidate"
                >
                  {saveCandidate.isPending ? t('analysis.save.pending') : t('analysis.save.action')}
                </Button>
                {savedVersion && (
                  <Alert severity="success">
                    {t('analysis.save.success', {
                      label: savedVersion.label,
                      validFrom: new Date(savedVersion.validFrom).toLocaleString(),
                    })}
                  </Alert>
                )}
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <AnalysisHistoryPanel processingId={processingId} versions={versions} onError={setError} />
            </Paper>
          </>
        )}
      </Stack>
    </Container>
  );
}
