import { useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Checkbox,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { api } from '@/api/client';
import { ChiSquareBadge, DiagnosticPanel } from '@/features/shared/components';
import type { AnalysisTrialResult, ProcessingDetail, StoredVersion } from '@/features/shared/types';

interface Trial {
  label: string;
  overrides: string[];
  result: AnalysisTrialResult;
}

/**
 * Analysis Lab (front/14 §5): load one epoch, keep an immutable baseline (Trial 0), experiment
 * with exclusions / freed references / weight multipliers, compare trials, and save a candidate
 * as a NEW draft configuration version with a mandatory justification. Trials never publish
 * anything and never touch raw data (DATA-007, ADJ-007/009).
 */
export default function AnalysisLabPage() {
  const { id } = useParams();
  const processingId = Number(id);
  const [error, setError] = useState<string>();
  const [versionId, setVersionId] = useState('');
  const [slot, setSlot] = useState('');
  const [baseline, setBaseline] = useState<Trial>();
  const [trials, setTrials] = useState<Trial[]>([]);
  const [selected, setSelected] = useState(0); // index into [baseline, ...trials]

  // overrides being edited
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [disabledRefs, setDisabledRefs] = useState<Set<string>>(new Set());
  const [multiplier, setMultiplier] = useState(1);
  const [useAutoAdjust, setUseAutoAdjust] = useState(false);

  // candidate saving
  const [reason, setReason] = useState('');
  const [savedLabel, setSavedLabel] = useState<string>();

  const detail = useQuery({
    queryKey: ['processing', processingId],
    queryFn: () => api<ProcessingDetail>('GET', `/api/v2/topographic-adjustments/${processingId}`),
    enabled: Number.isFinite(processingId),
  });
  const slots = useQuery({
    queryKey: ['processing-slots', processingId],
    queryFn: () => api<string[]>('GET', `/api/v2/topographic-adjustments/${processingId}/slots`),
  });

  const runTrial = (overrides: {
    excludeObservationIds?: string[];
    disabledReferenceKeys?: string[];
    weightMultiplier?: number;
    useAutoAdjust?: boolean;
  }) =>
    api<AnalysisTrialResult>('POST', `/api/v2/topographic-adjustments/${processingId}/analysis/trial`, {
      versionId,
      slot,
      ...overrides,
    });

  const loadBaseline = useMutation({
    mutationFn: () => runTrial({}),
    onSuccess: (result) => {
      setBaseline({ label: 'Trial 0 (baseline — immutable)', overrides: [], result });
      setTrials([]);
      setSelected(0);
      setExcluded(new Set());
      setDisabledRefs(new Set());
      setMultiplier(1);
      setUseAutoAdjust(false);
      setSavedLabel(undefined);
    },
    onError: (e) => setError(String(e)),
  });

  const overrideDescription = useMemo(() => {
    const parts: string[] = [];
    if (excluded.size > 0) parts.push(`${excluded.size} exclusion(s)`);
    if (disabledRefs.size > 0) parts.push(`${disabledRefs.size} reference(s) freed`);
    if (multiplier !== 1) parts.push(`weights ×${multiplier}`);
    if (useAutoAdjust) parts.push('Auto Adjust');
    return parts;
  }, [excluded, disabledRefs, multiplier, useAutoAdjust]);

  const trial = useMutation({
    mutationFn: () =>
      runTrial({
        excludeObservationIds: [...excluded],
        disabledReferenceKeys: [...disabledRefs],
        weightMultiplier: multiplier,
        useAutoAdjust,
      }),
    onSuccess: (result) => {
      const next: Trial = {
        label: `Trial ${trials.length + 1}`,
        overrides: overrideDescription.length > 0 ? overrideDescription : ['no overrides'],
        result,
      };
      setTrials((prev) => [...prev, next]);
      setSelected(trials.length + 1);
    },
    onError: (e) => setError(String(e)),
  });

  const saveCandidate = useMutation({
    mutationFn: () =>
      api<StoredVersion>('POST', `/api/v2/topographic-adjustments/${processingId}/analysis/candidate`, {
        baseVersionId: versionId,
        reason,
        excludeObservationIds: [...excluded],
        weightMultiplier: multiplier !== 1 ? multiplier : undefined,
      }),
    onSuccess: (v) => {
      setSavedLabel(v.label);
      setReason('');
    },
    onError: (e) => setError(String(e)),
  });

  if (detail.isLoading) {
    return (
      <Container sx={{ py: 4 }}>
        <CircularProgress aria-label="Loading Analysis Lab" />
      </Container>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">Processing not found.</Alert>
      </Container>
    );
  }

  const versions = detail.data.versions.filter((v) => v.status !== 'draft');
  const activeVersion = versions.find((v) => v.id === versionId);
  const allTrials = baseline ? [baseline, ...trials] : [];
  const current = allTrials[selected];
  const referenceKeys = activeVersion?.initialisation.references.map((r) => r.physicalPointId) ?? [];
  const baselineResiduals = baseline
    ? [...baseline.result.diagnostic.residuals].filter((r) => r.kind !== 'constraint').sort((a, b) => b.stdResidual - a.stdResidual).slice(0, 20)
    : [];

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
          <Typography variant="h1" sx={{ flexGrow: 1 }}>
            Analysis Lab — {detail.data.processing.name}
          </Typography>
          <Button size="small" component={RouterLink} to={`/processing/topographic-adjustment/${processingId}`}>
            Back to processing
          </Button>
        </Stack>
        <Alert severity="info">
          Nothing here publishes or modifies raw data: trials are computed in memory only. A convincing trial can be saved
          as a NEW draft configuration version, with a mandatory justification (ADJ-007, DATA-007).
        </Alert>
        {error && (
          <Alert severity="error" onClose={() => setError(undefined)}>
            {error}
          </Alert>
        )}

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel id="lab-version">Version</InputLabel>
              <Select labelId="lab-version" label="Version" value={versionId} onChange={(e) => setVersionId(e.target.value)}>
                {versions.map((v) => (
                  <MenuItem key={v.id} value={v.id}>
                    {v.label} ({v.status})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 240 }}>
              <InputLabel id="lab-slot">Epoch / output slot</InputLabel>
              <Select labelId="lab-slot" label="Epoch / output slot" value={slot} onChange={(e) => setSlot(e.target.value)}>
                {(slots.data ?? []).slice(-24).map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button variant="contained" size="small" disabled={!versionId || !slot || loadBaseline.isPending} onClick={() => loadBaseline.mutate()} data-testid="load-baseline">
              {loadBaseline.isPending ? 'Loading…' : 'Load epoch (Trial 0)'}
            </Button>
          </Stack>
        </Paper>

        {baseline && (
          <>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={2}>
                <Typography variant="h2">Overrides for the next trial</Typography>
                <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
                  <TextField
                    size="small"
                    type="number"
                    label="Weight multiplier (×)"
                    value={multiplier}
                    onChange={(e) => setMultiplier(Number(e.target.value) || 1)}
                    inputProps={{ step: 0.1, min: 0.1 }}
                    sx={{ width: 180 }}
                  />
                  <FormControlLabel
                    control={<Switch checked={useAutoAdjust} onChange={(e) => setUseAutoAdjust(e.target.checked)} />}
                    label="Use Auto Adjust (trial-only exclusions)"
                  />
                  <Button variant="contained" size="small" disabled={trial.isPending} onClick={() => trial.mutate()} data-testid="run-trial">
                    {trial.isPending ? 'Running…' : 'Run trial'}
                  </Button>
                </Stack>
                {referenceKeys.length > 0 && (
                  <Stack spacing={0.5}>
                    <Typography variant="body2" fontWeight={600}>
                      References — click to free (removes its constraint in the trial)
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {referenceKeys.map((key) => (
                        <Chip
                          key={key}
                          size="small"
                          label={key}
                          color={disabledRefs.has(key) ? 'warning' : 'success'}
                          variant={disabledRefs.has(key) ? 'filled' : 'outlined'}
                          onClick={() =>
                            setDisabledRefs((prev) => {
                              const next = new Set(prev);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            })
                          }
                        />
                      ))}
                    </Stack>
                  </Stack>
                )}
                <Box sx={{ overflowX: 'auto', maxHeight: 300, overflowY: 'auto' }}>
                  <Table size="small" aria-label="Baseline residuals for exclusion">
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox">Exclude</TableCell>
                        <TableCell>Observation</TableCell>
                        <TableCell>Station</TableCell>
                        <TableCell>Target</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell align="right">Std. residual (baseline)</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {baselineResiduals.map((r) => (
                        <TableRow key={`${r.observationId}-${r.kind}`} hover>
                          <TableCell padding="checkbox">
                            <Checkbox
                              size="small"
                              checked={excluded.has(r.observationId)}
                              onChange={(e) =>
                                setExcluded((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(r.observationId);
                                  else next.delete(r.observationId);
                                  return next;
                                })
                              }
                              inputProps={{ 'aria-label': `Exclude ${r.observationId}` }}
                            />
                          </TableCell>
                          <TableCell>{r.observationId}</TableCell>
                          <TableCell>{r.stationEngineName}</TableCell>
                          <TableCell>{r.targetEngineName}</TableCell>
                          <TableCell>{r.kind}</TableCell>
                          <TableCell align="right">{r.stdResidual.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Typography variant="caption" color="text.secondary">
                    Worst 20 baseline residuals — excluding an observation removes it from the TRIAL only, never from raw
                    data (DATA-007).
                  </Typography>
                </Box>
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={2}>
                <Typography variant="h2">Compare trials</Typography>
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small" aria-label="Trial comparison">
                    <TableHead>
                      <TableRow>
                        <TableCell>Trial</TableCell>
                        <TableCell>Overrides</TableCell>
                        <TableCell>χ²</TableCell>
                        <TableCell align="right">Variance factor</TableCell>
                        <TableCell align="right">dof</TableCell>
                        <TableCell align="right">max |v|/σ√r</TableCell>
                        <TableCell align="right">Alerts</TableCell>
                        <TableCell align="right" />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {allTrials.map((t, index) => (
                        <TableRow key={t.label} hover selected={index === selected}>
                          <TableCell>{t.label}</TableCell>
                          <TableCell>{t.overrides.join(', ') || '—'}</TableCell>
                          <TableCell>
                            <ChiSquareBadge status={t.result.diagnostic.chiSquareStatus} />
                          </TableCell>
                          <TableCell align="right">
                            {Number.isFinite(t.result.diagnostic.varianceFactor) ? t.result.diagnostic.varianceFactor.toFixed(3) : '—'}
                          </TableCell>
                          <TableCell align="right">{t.result.diagnostic.degreesOfFreedom}</TableCell>
                          <TableCell align="right">{t.result.diagnostic.maxStdResidual.toFixed(2)}</TableCell>
                          <TableCell align="right">{t.result.alerts.length}</TableCell>
                          <TableCell align="right">
                            <Button size="small" onClick={() => setSelected(index)}>
                              Inspect
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
                {current && (
                  <Stack spacing={1}>
                    {current.result.alerts.map((a) => (
                      <Alert key={a} severity="warning">
                        {a}
                      </Alert>
                    ))}
                    <DiagnosticPanel diagnostic={current.result.diagnostic} />
                  </Stack>
                )}
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1}>
                <Typography variant="h2">Save current overrides as a candidate version</Typography>
                <Typography variant="body2" color="text.secondary">
                  Creates a NEW draft version of the configuration (the base version stays immutable, VER-002). Freed
                  references are a diagnostic tool only and are not saved.
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <TextField
                    size="small"
                    label="Justification (required)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    sx={{ minWidth: 360 }}
                    data-testid="candidate-reason"
                  />
                  <Button
                    size="small"
                    variant="contained"
                    disabled={!reason.trim() || saveCandidate.isPending || (excluded.size === 0 && multiplier === 1)}
                    onClick={() => saveCandidate.mutate()}
                    data-testid="save-candidate"
                  >
                    Save candidate version
                  </Button>
                  {excluded.size === 0 && multiplier === 1 && (
                    <Typography variant="caption" color="text.secondary">
                      Nothing to save — add exclusions or a weight change first.
                    </Typography>
                  )}
                </Stack>
                {savedLabel && (
                  <Alert severity="success">
                    Saved as draft version {savedLabel}. Review and activate it from the Configuration versions tab.
                  </Alert>
                )}
              </Stack>
            </Paper>
          </>
        )}
      </Stack>
    </Container>
  );
}
