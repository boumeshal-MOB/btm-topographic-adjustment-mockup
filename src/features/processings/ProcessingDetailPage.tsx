import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { api } from '@/api/client';
import type { AdjustmentRunSummary } from '@/domain/entities';
import { ChiSquareBadge, DiagnosticPanel, StatusChip } from '@/features/shared/components';
import type {
  ProcessingDetail,
  ReprocessPreview,
  ReprocessResult,
  StoredVersion,
  TestEpochResult,
  VariableSeries,
} from '@/features/shared/types';

/**
 * Administration detail (front/14 §2-§6): overview & runs, configuration version timeline
 * (immutability VER-001/002, no silent overlap), stable output variables with their UPSERTed
 * series (OUT-001/009), and bounded reprocessing with per-slot version resolution (TIME-007/008).
 */
export default function ProcessingDetailPage() {
  const { id } = useParams();
  const processingId = Number(id);
  const [tab, setTab] = useState<'overview' | 'versions' | 'outputs' | 'reprocess'>('overview');
  const [error, setError] = useState<string>();

  const detail = useQuery({
    queryKey: ['processing', processingId],
    queryFn: () => api<ProcessingDetail>('GET', `/api/v2/topographic-adjustments/${processingId}`),
    enabled: Number.isFinite(processingId),
  });

  if (detail.isLoading) {
    return (
      <Container sx={{ py: 4 }}>
        <CircularProgress aria-label="Loading processing" />
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

  const { processing, versions, variables, runs } = detail.data;
  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
          <Typography variant="h1" sx={{ flexGrow: 1 }}>
            {processing.name}
          </Typography>
          <StatusChip status={processing.status} />
          {processing.active ? <Chip size="small" color="success" label="enabled" /> : <Chip size="small" label="disabled" />}
          <Chip size="small" label={processing.scope} variant="outlined" />
          <Button size="small" variant="outlined" component={RouterLink} to={`/processing/topographic-adjustment/${processingId}/analysis`} data-testid="open-analysis-lab">
            Analysis Lab
          </Button>
          <Button size="small" component={RouterLink} to="/">
            All processings
          </Button>
        </Stack>
        {processing.description && (
          <Typography variant="body2" color="text.secondary">
            {processing.description}
          </Typography>
        )}
        {error && (
          <Alert severity="error" onClose={() => setError(undefined)}>
            {error}
          </Alert>
        )}
        <Tabs value={tab} onChange={(_, v) => setTab(v)} aria-label="Processing sections">
          <Tab value="overview" label={`Overview & runs (${runs.length})`} />
          <Tab value="versions" label={`Configuration versions (${versions.length})`} />
          <Tab value="outputs" label={`Output variables (${variables.length})`} />
          <Tab value="reprocess" label="Reprocessing" />
        </Tabs>
        <Paper variant="outlined" sx={{ p: 2 }}>
          {tab === 'overview' && <OverviewTab processingId={processingId} runs={runs} onError={setError} />}
          {tab === 'versions' && <VersionsTab processingId={processingId} versions={versions} onError={setError} />}
          {tab === 'outputs' && <OutputsTab processingId={processingId} />}
          {tab === 'reprocess' && <ReprocessTab processingId={processingId} versions={versions} onError={setError} />}
        </Paper>
      </Stack>
    </Container>
  );
}

// ---------------------------------------------------------------- overview & runs

function OverviewTab({ processingId, runs, onError }: { processingId: number; runs: AdjustmentRunSummary[]; onError: (m: string) => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [slot, setSlot] = useState('');
  const slots = useQuery({
    queryKey: ['processing-slots', processingId],
    queryFn: () => api<string[]>('GET', `/api/v2/topographic-adjustments/${processingId}/slots`),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['processing', processingId] });
  const run = useMutation({
    mutationFn: (body: { slot?: string }) => api<AdjustmentRunSummary>('POST', `/api/v2/topographic-adjustments/${processingId}/run`, body),
    onSuccess: invalidate,
    onError: (e) => onError(String(e)),
  });
  const catchUp = useMutation({
    mutationFn: (body: { slot: string }) => api<AdjustmentRunSummary>('POST', `/api/v2/topographic-adjustments/${processingId}/catch-up`, body),
    onSuccess: invalidate,
    onError: (e) => onError(String(e)),
  });
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Button variant="contained" size="small" onClick={() => run.mutate({})} disabled={run.isPending} data-testid="run-now">
          Run now (latest slot)
        </Button>
        <FormControl size="small" sx={{ minWidth: 240 }}>
          <InputLabel id="run-slot">Output slot</InputLabel>
          <Select labelId="run-slot" label="Output slot" value={slot} onChange={(e) => setSlot(e.target.value)}>
            {(slots.data ?? []).slice(-24).map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button size="small" variant="outlined" disabled={!slot || run.isPending} onClick={() => run.mutate({ slot })}>
          Run this slot
        </Button>
        <Button size="small" variant="outlined" disabled={!slot || catchUp.isPending} onClick={() => catchUp.mutate({ slot })} data-testid="catch-up">
          Catch-up this slot
        </Button>
        <Typography variant="caption" color="text.secondary">
          Catch-up recalculations are bounded per slot (RUN-008) and simulate UPSERT (OUT-009).
        </Typography>
      </Stack>
      {runs.length === 0 ? (
        <Alert severity="info">No run yet — trigger one above.</Alert>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-label="Runs">
            <TableHead>
              <TableRow>
                <TableCell>Started</TableCell>
                <TableCell>Slot</TableCell>
                <TableCell>Trigger</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>χ²</TableCell>
                <TableCell align="right">Variance factor</TableCell>
                <TableCell align="right">Target availability</TableCell>
                <TableCell>Error</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{new Date(r.startedAt).toLocaleString()}</TableCell>
                  <TableCell>{r.outputSlot}</TableCell>
                  <TableCell>{r.trigger}</TableCell>
                  <TableCell>
                    <StatusChip status={r.status} />
                  </TableCell>
                  <TableCell>
                    <ChiSquareBadge status={r.chiSquareStatus} />
                  </TableCell>
                  <TableCell align="right">{r.varianceFactor !== undefined ? r.varianceFactor.toFixed(3) : '—'}</TableCell>
                  <TableCell align="right">{r.targetAvailabilityPercent !== undefined ? `${r.targetAvailabilityPercent.toFixed(0)}%` : '—'}</TableCell>
                  <TableCell sx={{ maxWidth: 280 }}>
                    {r.error ? (
                      <Typography variant="caption" color="error">
                        [{r.error.stage}/{r.error.code}] {r.error.message}
                      </Typography>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => navigate(`/processing/topographic-adjustment/${processingId}/runs/${r.id}`)} data-testid={`open-run-${r.id}`}>
                      Detail
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Stack>
  );
}

// ------------------------------------------------------------------- versions

function VersionsTab({ processingId, versions, onError }: { processingId: number; versions: StoredVersion[]; onError: (m: string) => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [testVersionId, setTestVersionId] = useState('');
  const [testSlot, setTestSlot] = useState('');
  const [testResult, setTestResult] = useState<TestEpochResult>();
  const slots = useQuery({
    queryKey: ['processing-slots', processingId],
    queryFn: () => api<string[]>('GET', `/api/v2/topographic-adjustments/${processingId}/slots`),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['processing', processingId] });
  const activate = useMutation({
    mutationFn: (versionId: string) =>
      api<StoredVersion>('POST', `/api/v2/topographic-adjustments/${processingId}/config-versions/${versionId}/activate`, {}),
    onSuccess: invalidate,
    onError: (e) => onError(String(e)),
  });
  const archive = useMutation({
    mutationFn: (versionId: string) =>
      api<StoredVersion>('POST', `/api/v2/topographic-adjustments/${processingId}/config-versions/${versionId}/archive`, {}),
    onSuccess: invalidate,
    onError: (e) => onError(String(e)),
  });
  const duplicate = useMutation({
    mutationFn: (versionId: string) =>
      api<StoredVersion>('POST', `/api/v2/topographic-adjustments/${processingId}/config-versions/${versionId}/duplicate`, {
        reason: reason || 'Duplicated from administration',
      }),
    onSuccess: invalidate,
    onError: (e) => onError(String(e)),
  });
  const testRun = useMutation({
    mutationFn: () =>
      api<TestEpochResult>('POST', `/api/v2/topographic-adjustments/${processingId}/test-run`, {
        versionId: testVersionId,
        slot: testSlot,
      }),
    onSuccess: setTestResult,
    onError: (e) => onError(String(e)),
  });
  const ordered = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
  return (
    <Stack spacing={2}>
      <Alert severity="info">
        A version used by at least one run is immutable (VER-001/002): evolve it by duplicating it as a new draft version.
        Activating a version closes the previous validity window — no silent overlap.
      </Alert>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" aria-label="Configuration versions">
          <TableHead>
            <TableRow>
              <TableCell>Version</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Valid from</TableCell>
              <TableCell>Valid to (exclusive)</TableCell>
              <TableCell>Used by runs</TableCell>
              <TableCell>Reason</TableCell>
              <TableCell>Overrides</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {ordered.map((v) => (
              <TableRow key={v.id} hover>
                <TableCell>{v.label}</TableCell>
                <TableCell>
                  <StatusChip status={v.status} />
                </TableCell>
                <TableCell>{new Date(v.validFrom).toLocaleString()}</TableCell>
                <TableCell>{v.validTo ? new Date(v.validTo).toLocaleString() : 'open'}</TableCell>
                <TableCell>{v.usedByRun ? <Chip size="small" color="warning" label="immutable" /> : 'no'}</TableCell>
                <TableCell sx={{ maxWidth: 220 }}>{v.reason}</TableCell>
                <TableCell sx={{ maxWidth: 200 }}>
                  {v.overriddenFields.length > 0 ? v.overriddenFields.join('; ') : '—'}
                </TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    {v.status !== 'active' && (
                      <Button size="small" onClick={() => activate.mutate(v.id)} data-testid={`activate-version-${v.label}`}>
                        Activate
                      </Button>
                    )}
                    {v.status === 'active' && (
                      <Button size="small" color="warning" onClick={() => archive.mutate(v.id)}>
                        Archive
                      </Button>
                    )}
                    <Button size="small" onClick={() => duplicate.mutate(v.id)}>
                      Duplicate as draft
                    </Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      <TextField
        size="small"
        label="Duplication reason (recommended)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        sx={{ maxWidth: 420 }}
      />
      <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 600 }}>
        Test a stored version on one slot (never persisted)
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="test-version">Version</InputLabel>
          <Select labelId="test-version" label="Version" value={testVersionId} onChange={(e) => setTestVersionId(e.target.value)}>
            {ordered.map((v) => (
              <MenuItem key={v.id} value={v.id}>
                {v.label} ({v.status})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 240 }}>
          <InputLabel id="test-run-slot">Output slot</InputLabel>
          <Select labelId="test-run-slot" label="Output slot" value={testSlot} onChange={(e) => setTestSlot(e.target.value)}>
            {(slots.data ?? []).slice(-24).map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button size="small" variant="contained" disabled={!testVersionId || !testSlot || testRun.isPending} onClick={() => testRun.mutate()}>
          {testRun.isPending ? 'Running…' : 'Test version on slot'}
        </Button>
      </Stack>
      {testResult && <DiagnosticPanel diagnostic={testResult.diagnostic} warnings={[...testResult.blocking, ...testResult.warnings]} />}
    </Stack>
  );
}

// -------------------------------------------------------------- output variables

function OutputsTab({ processingId }: { processingId: number }) {
  const measures = useQuery({
    queryKey: ['measures', processingId],
    queryFn: () => api<VariableSeries[]>('GET', `/api/v2/topographic-adjustments/${processingId}/measures`),
  });
  if (measures.isLoading) return <CircularProgress aria-label="Loading output variables" />;
  const list = measures.data ?? [];
  const targets = list.filter((v) => v.scope === 'target');
  const globals = list.filter((v) => v.scope === 'global');
  const renderTable = (rows: VariableSeries[], label: string) => (
    <Box sx={{ overflowX: 'auto' }}>
      <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 600, mb: 1 }}>
        {label}
      </Typography>
      <Table size="small" aria-label={label}>
        <TableHead>
          <TableRow>
            <TableCell>Variable key</TableCell>
            <TableCell>Component</TableCell>
            <TableCell align="right">Points in series</TableCell>
            <TableCell>Last timestamp</TableCell>
            <TableCell align="right">Last value</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((v) => {
            const last = v.series.at(-1);
            return (
              <TableRow key={v.variableId} hover>
                <TableCell>{v.key}</TableCell>
                <TableCell>{v.component}</TableCell>
                <TableCell align="right">{v.series.length}</TableCell>
                <TableCell>{last ? last.timestamp : '—'}</TableCell>
                <TableCell align="right">{last ? last.value.toFixed(5) : '—'}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Box>
  );
  return (
    <Stack spacing={3}>
      <Alert severity="info">
        Output variables are created once at processing creation and stay stable across recalculations (OUT-001/002).
        Values in metres; a recalculation replaces the value at the same (variable, timestamp) key (OUT-009).
      </Alert>
      {renderTable(globals, `Global quality variables (${globals.length})`)}
      {renderTable(targets, `Per-target variables (${targets.length})`)}
    </Stack>
  );
}

// ------------------------------------------------------------------ reprocessing

function ReprocessTab({ processingId, versions, onError }: { processingId: number; versions: StoredVersion[]; onError: (m: string) => void }) {
  const queryClient = useQueryClient();
  const usable = versions.filter((v) => v.status !== 'draft');
  const defaultFrom = usable[0]?.validFrom?.slice(0, 16) ?? new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 16);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 16));
  const [forcedVersionId, setForcedVersionId] = useState('');
  const [reprocessReason, setReprocessReason] = useState('');
  const [preview, setPreview] = useState<ReprocessPreview>();
  const [result, setResult] = useState<ReprocessResult>();
  const toIso = (local: string) => new Date(local).toISOString();
  const previewMutation = useMutation({
    mutationFn: () =>
      api<ReprocessPreview>('POST', `/api/v2/topographic-adjustments/${processingId}/reprocess/preview`, {
        from: toIso(from),
        to: toIso(to),
        forcedVersionId: forcedVersionId || undefined,
      }),
    onSuccess: (p) => {
      setPreview(p);
      setResult(undefined);
    },
    onError: (e) => onError(String(e)),
  });
  const execute = useMutation({
    mutationFn: () =>
      api<ReprocessResult>('POST', `/api/v2/topographic-adjustments/${processingId}/reprocess`, {
        from: toIso(from),
        to: toIso(to),
        reason: reprocessReason,
        forcedVersionId: forcedVersionId || undefined,
      }),
    onSuccess: (r) => {
      setResult(r);
      queryClient.invalidateQueries({ queryKey: ['processing', processingId] });
      queryClient.invalidateQueries({ queryKey: ['measures', processingId] });
    },
    onError: (e) => onError(String(e)),
  });
  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Each slot is recalculated with the version valid at that slot (TIME-007/008). Forcing one version for the whole
        window is possible but must be justified. Existing measures are replaced, never duplicated (OUT-009).
      </Alert>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField size="small" type="datetime-local" label="From" value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField size="small" type="datetime-local" label="To" value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} />
        <FormControl size="small" sx={{ minWidth: 260 }}>
          <InputLabel id="forced-version">Forced version (optional)</InputLabel>
          <Select labelId="forced-version" label="Forced version (optional)" value={forcedVersionId} onChange={(e) => setForcedVersionId(e.target.value)}>
            <MenuItem value="">Per-slot resolution (default)</MenuItem>
            {usable.map((v) => (
              <MenuItem key={v.id} value={v.id}>
                {v.label} ({v.status})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button size="small" variant="contained" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending} data-testid="reprocess-preview">
          Preview impact
        </Button>
      </Stack>
      {preview && (
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={`${preview.totals.slotCount} slot(s) in window`} />
            <Chip size="small" label={`${preview.totals.withConfig} with a valid config`} />
            <Chip size="small" label={`${preview.totals.withData} with usable data`} color="info" />
            <Chip size="small" label={`${preview.totals.measuresToReplace} existing measure(s) to replace`} color="warning" />
          </Stack>
          <Box sx={{ maxHeight: 240, overflowY: 'auto' }}>
            <Table size="small" aria-label="Reprocess preview">
              <TableHead>
                <TableRow>
                  <TableCell>Slot</TableCell>
                  <TableCell>Version</TableCell>
                  <TableCell>Has data</TableCell>
                  <TableCell align="right">Existing measures</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {preview.slots.map((s) => (
                  <TableRow key={s.slot}>
                    <TableCell>{s.slot}</TableCell>
                    <TableCell>{s.versionLabel ?? 'no config valid (TIME-007)'}</TableCell>
                    <TableCell>{s.hasData ? 'yes' : 'no'}</TableCell>
                    <TableCell align="right">{s.existingMeasures}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              size="small"
              label="Reason (required)"
              value={reprocessReason}
              onChange={(e) => setReprocessReason(e.target.value)}
              sx={{ minWidth: 320 }}
              data-testid="reprocess-reason"
            />
            <Button size="small" variant="contained" color="warning" disabled={!reprocessReason.trim() || execute.isPending} onClick={() => execute.mutate()} data-testid="reprocess-execute">
              {execute.isPending ? 'Reprocessing…' : 'Execute reprocessing'}
            </Button>
          </Stack>
        </Stack>
      )}
      {result && (
        <Alert severity="success">
          {result.executed} slot(s) reprocessed: {result.runs.map((r) => `${r.slot} → ${r.status}`).join(' · ') || 'nothing to recalculate'}
        </Alert>
      )}
    </Stack>
  );
}
