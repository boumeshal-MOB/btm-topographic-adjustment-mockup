import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
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
  Tooltip,
  Typography,
} from '@mui/material';
import { api } from '@/api/client';
import type { AdjustmentRunSummary, TopographicAdjustmentProcessing } from '@/domain/entities';
import {
  groupGlobalOutputVariables,
  groupTargetOutputVariables,
  type TargetOutputFamily,
} from '@/features/processings/output-variable-groups';
import { ChiSquareBadge, StatusChip } from '@/features/shared/components';
import { isProcessingDetail } from '@/features/shared/processing-detail';
import { fixed, isRealNumber, NO_VALUE } from '@/features/shared/format';
import type {
  ReprocessPreview,
  ReprocessResult,
  StoredVersion,
  VariableSeries,
} from '@/features/shared/types';

/**
 * Administration detail (PRODUIT-ET-PARCOURS.md): overview & runs, configuration version timeline,
 * stable output variables grouped for operational review, and bounded reprocessing.
 */
export default function ProcessingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const processingId = Number(id);
  const [tab, setTab] = useState<'overview' | 'versions' | 'outputs' | 'reprocess'>('overview');
  const [error, setError] = useState<string>();
  const edit = useMutation({
    mutationFn: () => api<{ id: string }>('POST', `/api/v2/topographic-adjustments/${processingId}/edit-draft`, {}),
    onSuccess: (draft) => {
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
      navigate(`/create/${draft.id}`);
    },
    onError: (mutationError) => setError(String(mutationError)),
  });

  const detail = useQuery({
    queryKey: ['processing', processingId],
    queryFn: async () => {
      const response = await api<unknown>('GET', `/api/v2/topographic-adjustments/${processingId}`);
      if (!isProcessingDetail(response)) throw new Error('Processing data is incomplete or incompatible.');
      return response;
    },
    enabled: Number.isFinite(processingId),
    refetchOnWindowFocus: false,
  });

  if (detail.isLoading) {
    return (
      <Container sx={{ py: 4 }}>
        <CircularProgress aria-label="Loading processing" />
      </Container>
    );
  }
  if (detail.isError || !detail.data?.processing) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">
          {detail.error instanceof Error ? detail.error.message : 'Processing not found.'}
        </Alert>
      </Container>
    );
  }

  const { processing, versions, variables, runs } = detail.data;
  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
          <Typography variant="h1" sx={{ flexGrow: 1 }}>
            {processing.name}
          </Typography>
          <StatusChip status={processing.status} />
          {processing.active ? <Chip size="small" color="success" label="enabled" /> : <Chip size="small" label="disabled" />}
          <Chip size="small" label={processing.scope} variant="outlined" />
          <Button size="small" variant="contained" onClick={() => edit.mutate()} disabled={edit.isPending} data-testid="edit-processing">
            Edit processing
          </Button>
          <Button
            size="small"
            variant="outlined"
            component={RouterLink}
            to={`/processing/topographic-adjustment/${processingId}/analysis`}
            data-testid="open-analysis-lab"
          >
            Analysis Lab
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
        <Box sx={{ overflowX: 'auto' }}>
          <Tabs value={tab} onChange={(_, value) => setTab(value)} aria-label="Processing sections" sx={{ minWidth: 720 }}>
            <Tab value="overview" label={`Overview & runs (${runs.length})`} />
            <Tab value="versions" label={`Configuration versions (${versions.length})`} />
            <Tab value="outputs" label={`Output variables (${variables.length})`} />
            <Tab value="reprocess" label="Reprocessing" />
          </Tabs>
        </Box>
        <Paper variant="outlined" sx={{ p: { xs: 1.25, md: 2 }, borderRadius: 2 }}>
          {tab === 'overview' && (
            <OverviewTab
              processing={processing}
              versions={versions}
              runs={runs}
              onError={setError}
            />
          )}
          {tab === 'versions' && <VersionsTab processingId={processingId} versions={versions} onError={setError} />}
          {tab === 'outputs' && <OutputsTab processingId={processingId} versions={versions} />}
          {tab === 'reprocess' && <ReprocessTab processingId={processingId} versions={versions} onError={setError} />}
        </Paper>
      </Stack>
    </Container>
  );
}

// ---------------------------------------------------------------- overview & runs

function OverviewTab({
  processing,
  versions,
  runs,
  onError,
}: {
  processing: TopographicAdjustmentProcessing;
  versions: StoredVersion[];
  runs: AdjustmentRunSummary[];
  onError: (message: string) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const processingId = processing.id;
  const [slot, setSlot] = useState('');
  const slots = useQuery({
    queryKey: ['processing-slots', processingId],
    queryFn: () => api<string[]>('GET', `/api/v2/topographic-adjustments/${processingId}/slots`),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['processing', processingId] });
  const run = useMutation({
    mutationFn: (body: { slot?: string }) => api<AdjustmentRunSummary>('POST', `/api/v2/topographic-adjustments/${processingId}/run`, body),
    onSuccess: invalidate,
    onError: (mutationError) => onError(String(mutationError)),
  });
  const catchUp = useMutation({
    mutationFn: (body: { slot: string }) => api<AdjustmentRunSummary>('POST', `/api/v2/topographic-adjustments/${processingId}/catch-up`, body),
    onSuccess: invalidate,
    onError: (mutationError) => onError(String(mutationError)),
  });
  const successful = runs.filter((item) => item.status === 'success').length;
  const provisional = runs.filter((item) => item.status === 'provisional').length;
  const failed = runs.filter((item) => item.status === 'failed-qc' || item.status === 'technical-error').length;
  const activeVersion = versions.find((version) => version.id === processing.activeConfigVersionId && version.status === 'active');
  const availableSlots = useMemo(() => slots.data ?? [], [slots.data]);

  useEffect(() => {
    if (slot || availableSlots.length === 0) return;
    setSlot(availableSlots.at(-1) ?? '');
  }, [availableSlots, slot]);

  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1 }}>
        <SummaryCard label="Runs" value={`${runs.length}`} />
        <SummaryCard label="Successful" value={`${successful}`} tone="success" />
        <SummaryCard label="Provisional / warning" value={`${provisional}`} tone="warning" />
        <SummaryCard label="Failed" value={`${failed}`} tone={failed > 0 ? 'error' : 'default'} />
      </Box>
      {!activeVersion ? (
        <Alert severity="warning" variant="outlined" data-testid="no-active-config">
          <b>No active configuration: operational slots and runs are unavailable.</b> Open
          <b> Edit processing</b>, validate the configuration in <b>Adjustment</b>, then use
          <b> Save and activate version</b>. A draft processing intentionally publishes nothing.
        </Alert>
      ) : availableSlots.length === 0 ? (
        <Alert severity="info">
          Configuration {activeVersion.label} is active, but no observation cycle can currently be aligned to an output slot.
        </Alert>
      ) : (
        <Stack spacing={1}>
          <Alert severity="info" variant="outlined">
            These buttons exercise the mock BTM orchestration and UPSERT publication. The live
            STAR*NET 14 configuration test is available in <b>Edit processing → Adjustment</b>.
          </Alert>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Button
              variant="contained"
              size="small"
              onClick={() => run.mutate({})}
              disabled={run.isPending}
              data-testid="run-now"
            >
              Simulate manual BTM run (latest slot)
            </Button>
            <FormControl size="small" sx={{ minWidth: 250 }}>
              <InputLabel id="run-slot">Output slot</InputLabel>
              <Select labelId="run-slot" label="Output slot" value={slot} onChange={(event) => setSlot(event.target.value)}>
                {availableSlots.slice(-24).map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
              </Select>
            </FormControl>
            <Button size="small" variant="outlined" disabled={!slot || run.isPending} onClick={() => run.mutate({ slot })}>
              Simulate this slot
            </Button>
            <Button size="small" variant="outlined" disabled={!slot || catchUp.isPending} onClick={() => catchUp.mutate({ slot })} data-testid="catch-up">
              Catch-up this slot
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Catch-up recalculations are bounded per slot and replace existing measures by UPSERT.
          </Typography>
        </Stack>
      )}
      {runs.length === 0 ? (
        <Alert severity="info">
          {activeVersion
            ? 'No run yet — trigger one above.'
            : 'No run exists yet. Activate a tested configuration version before the first execution.'}
        </Alert>
      ) : (
        <Box sx={{ overflow: 'auto', maxHeight: 520, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
          <Table size="small" stickyHeader aria-label="Runs" sx={{ minWidth: 1050 }}>
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
              {runs.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>{new Date(item.startedAt).toLocaleString()}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{item.outputSlot}</TableCell>
                  <TableCell>{item.trigger}</TableCell>
                  <TableCell><StatusChip status={item.status} /></TableCell>
                  <TableCell><ChiSquareBadge status={item.chiSquareStatus} /></TableCell>
                  <TableCell align="right">{fixed(item.varianceFactor, 3)}</TableCell>
                  <TableCell align="right">{isRealNumber(item.targetAvailabilityPercent) ? `${fixed(item.targetAvailabilityPercent, 0)}%` : NO_VALUE}</TableCell>
                  <TableCell sx={{ maxWidth: 300 }}>
                    {item.error ? (
                      <Typography variant="caption" color="error">[{item.error.stage}/{item.error.code}] {item.error.message}</Typography>
                    ) : '—'}
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => navigate(`/processing/topographic-adjustment/${processingId}/runs/${item.id}`)} data-testid={`open-run-${item.id}`}>
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

function VersionsTab({ processingId, versions, onError }: { processingId: number; versions: StoredVersion[]; onError: (message: string) => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['processing', processingId] });
  const openVersion = useMutation({
    mutationFn: (versionId: string) => api<{ id: string }>(
      'POST',
      `/api/v2/topographic-adjustments/${processingId}/edit-draft`,
      { versionId },
    ),
    onSuccess: (draft) => navigate(`/create/${draft.id}`),
    onError: (mutationError) => onError(String(mutationError)),
  });
  const archive = useMutation({
    mutationFn: (versionId: string) => api<StoredVersion>('POST', `/api/v2/topographic-adjustments/${processingId}/config-versions/${versionId}/archive`, {}),
    onSuccess: invalidate,
    onError: (mutationError) => onError(String(mutationError)),
  });
  const duplicate = useMutation({
    mutationFn: (versionId: string) => api<StoredVersion>('POST', `/api/v2/topographic-adjustments/${processingId}/config-versions/${versionId}/duplicate`, {
      reason: reason || 'Duplicated from administration',
    }),
    onSuccess: invalidate,
    onError: (mutationError) => onError(String(mutationError)),
  });
  const ordered = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);

  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Versions used by runs remain immutable. To reuse or change one, open it in the editor:
        the Adjustment step contains the preflight and real STAR*NET test, and Review controls
        activation and its validity date.
      </Alert>
      <Box sx={{ overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
        <Table size="small" stickyHeader aria-label="Configuration versions" sx={{ minWidth: 1100 }}>
          <TableHead>
            <TableRow>
              <TableCell>Version</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Valid from</TableCell>
              <TableCell>Valid to (exclusive)</TableCell>
              <TableCell>Adjustment preflight</TableCell>
              <TableCell>Used by runs</TableCell>
              <TableCell>Reason</TableCell>
              <TableCell>Overrides</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {ordered.map((version) => (
              <TableRow key={version.id} hover>
                <TableCell sx={{ fontWeight: 700 }}>{version.label}</TableCell>
                <TableCell><StatusChip status={version.status} /></TableCell>
                <TableCell>{new Date(version.validFrom).toLocaleString()}</TableCell>
                <TableCell>{version.validTo ? new Date(version.validTo).toLocaleString() : 'open'}</TableCell>
                <TableCell>
                  {version.preflightTestedAt
                    ? <Chip size="small" color="success" label="passed" />
                    : <Chip size="small" variant="outlined" label="required" />}
                </TableCell>
                <TableCell>{version.usedByRun ? <Chip size="small" color="warning" label="immutable" /> : 'no'}</TableCell>
                <TableCell sx={{ maxWidth: 220 }}>{version.reason}</TableCell>
                <TableCell sx={{ maxWidth: 240 }}>{version.overriddenFields.length > 0 ? version.overriddenFields.join('; ') : '—'}</TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    {version.status !== 'active' && (
                      <Button
                        size="small"
                        onClick={() => openVersion.mutate(version.id)}
                        disabled={openVersion.isPending}
                      >
                        Review & activate
                      </Button>
                    )}
                    {version.status === 'active' && <Button size="small" color="warning" onClick={() => archive.mutate(version.id)}>Archive</Button>}
                    <Button size="small" onClick={() => duplicate.mutate(version.id)}>Duplicate as draft</Button>
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
        onChange={(event) => setReason(event.target.value)}
        sx={{ maxWidth: 420 }}
      />
    </Stack>
  );
}

// -------------------------------------------------------------- output variables

function formatGlobalValue(variable: VariableSeries): string {
  const last = variable.series.at(-1);
  if (!last) return '—';
  if (['chi2-passed', 'references-available', 'provisional-flag'].includes(variable.component)) {
    return last.value >= 0.5 ? 'Yes' : 'No';
  }
  if (variable.component === 'target-availability') return isRealNumber(last.value) ? `${fixed(last.value, 1)}%` : NO_VALUE;
  if (variable.component === 'quality-code') return `${Math.round(last.value)}`;
  return fixed(last.value, 4);
}

function TargetComponentCell({ variable, family }: { variable?: VariableSeries; family: TargetOutputFamily }) {
  const last = variable?.series.at(-1);
  if (!variable) return <Typography variant="body2" color="text.disabled">Not configured</Typography>;
  if (!last) {
    return (
      <Stack spacing={0.25}>
        <Typography variant="body2" color="text.secondary">No data</Typography>
        <Typography variant="caption" color="text.disabled">ID {variable.variableId}</Typography>
      </Stack>
    );
  }
  const millimetresValue = isRealNumber(last.value) ? last.value * 1000 : undefined;
  return (
    <Tooltip title={`${variable.key} · variable ID ${variable.variableId} · ${variable.series.length} value(s)`}>
      <Stack spacing={0.15} sx={{ minWidth: 110 }}>
        <Typography variant="body2" fontWeight={700} fontFamily="monospace">{fixed(last.value, 5)} m</Typography>
        {(family.key === 'delta' || family.key === 'sigma') && (
          <Typography variant="caption" color="text.secondary" fontFamily="monospace">{fixed(millimetresValue, 2)} mm</Typography>
        )}
        <Typography variant="caption" color="text.secondary">{new Date(last.timestamp).toLocaleString()}</Typography>
        <Typography variant="caption" color="text.disabled">{variable.series.length} sample(s)</Typography>
      </Stack>
    </Tooltip>
  );
}

function OutputsTab({ processingId, versions }: { processingId: number; versions: StoredVersion[] }) {
  const [targetSearch, setTargetSearch] = useState('');
  const measures = useQuery({
    queryKey: ['measures', processingId],
    queryFn: () => api<VariableSeries[]>('GET', `/api/v2/topographic-adjustments/${processingId}/measures`),
  });
  const list = useMemo(() => measures.data ?? [], [measures.data]);
  const targetGroups = useMemo(() => groupTargetOutputVariables(list, versions), [list, versions]);
  const globalGroups = useMemo(() => groupGlobalOutputVariables(list), [list]);
  const filteredTargets = useMemo(() => {
    const needle = targetSearch.trim().toLowerCase();
    if (!needle) return targetGroups;
    return targetGroups.filter((group) => [group.label, group.engineName, group.rawTargetName, `${group.sensorId}`]
      .filter((value): value is string => value !== undefined)
      .some((value) => value.toLowerCase().includes(needle)));
  }, [targetGroups, targetSearch]);

  if (measures.isLoading) return <CircularProgress aria-label="Loading output variables" />;
  const targetVariables = list.filter((variable) => variable.scope === 'target');
  const globalVariables = list.filter((variable) => variable.scope === 'global');
  const populatedVariables = list.filter((variable) => variable.series.length > 0).length;
  const totalSamples = list.reduce((sum, variable) => sum + variable.series.length, 0);

  return (
    <Stack spacing={2}>
      <Alert severity="info" variant="outlined">
        Output variables are created once at processing creation and remain stable across configuration versions. Recalculation replaces the same variable/timestamp value by UPSERT.
      </Alert>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1 }}>
        <SummaryCard label="Stable variables" value={`${list.length}`} />
        <SummaryCard label="Targets" value={`${targetGroups.length}`} />
        <SummaryCard label="Populated variables" value={`${populatedVariables}/${list.length}`} tone={populatedVariables === list.length ? 'success' : 'warning'} />
        <SummaryCard label="Stored samples" value={`${totalSamples}`} />
      </Box>

      <Stack spacing={1}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
          <Box>
            <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 800 }}>Global quality variables ({globalVariables.length})</Typography>
            <Typography variant="caption" color="text.secondary">Processing-wide quality, availability and publication indicators.</Typography>
          </Box>
        </Stack>
        {globalGroups.length === 0 ? (
          <Alert severity="info">No global output variable configured.</Alert>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
            {globalGroups.map((group) => (
              <Paper key={group.key} variant="outlined" sx={{ p: 1.25, borderRadius: 1.5 }}>
                <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>{group.label}</Typography>
                <Stack spacing={0.75}>
                  {group.variables.map((variable) => {
                    const last = variable.series.at(-1);
                    return (
                      <Box key={variable.variableId} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 1, alignItems: 'center', py: 0.5, borderTop: '1px solid', borderColor: 'divider' }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={700}>{variable.component}</Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>{variable.key}</Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right' }}>
                          <Typography variant="body2" fontWeight={800} fontFamily="monospace">{formatGlobalValue(variable)}</Typography>
                          <Typography variant="caption" color="text.secondary">{last ? new Date(last.timestamp).toLocaleString() : 'no value'}</Typography>
                        </Box>
                      </Box>
                    );
                  })}
                </Stack>
              </Paper>
            ))}
          </Box>
        )}
      </Stack>

      <Divider />

      <Stack spacing={1.25}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} gap={1}>
          <Box>
            <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 800 }}>Per-target variables ({targetVariables.length})</Typography>
            <Typography variant="caption" color="text.secondary">
              Variables are grouped first by physical target, then by adjusted coordinates, displacement and uncertainty on X/Y/Z.
            </Typography>
          </Box>
          <TextField
            size="small"
            label="Find target or sensor"
            value={targetSearch}
            onChange={(event) => setTargetSearch(event.target.value)}
            sx={{ minWidth: 240 }}
          />
        </Stack>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
          <Chip size="small" variant="outlined" label={`${filteredTargets.length}/${targetGroups.length} target(s)`} />
          <Chip size="small" variant="outlined" label="3 scientific families" />
          <Chip size="small" variant="outlined" label="X · Y · Z axes" />
          <Chip size="small" variant="outlined" label="metres stored; mm shown for delta/sigma" />
        </Stack>

        {filteredTargets.length === 0 ? (
          <Alert severity="info">No target matches the current search.</Alert>
        ) : filteredTargets.map((group, index) => (
          <Accordion
            key={group.sensorId}
            defaultExpanded={index === 0 && filteredTargets.length <= 12}
            disableGutters
            variant="outlined"
            sx={{ borderRadius: 1.5, overflow: 'hidden', '&:before': { display: 'none' }, '&.Mui-expanded': { m: 0 } }}
          >
            <AccordionSummary expandIcon={<span aria-hidden>▾</span>} sx={{ bgcolor: 'grey.50', minHeight: 54 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'flex-start', md: 'center' }} spacing={1} sx={{ width: '100%', pr: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" fontWeight={800}>{group.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    sensor {group.sensorId}{group.rawTargetName && group.rawTargetName !== group.label ? ` · source ${group.rawTargetName}` : ''}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                  <Chip size="small" variant="outlined" label={`${group.populatedComponents}/${group.variables.length} populated`} />
                  <Chip size="small" variant="outlined" label={`${group.totalSamples} samples`} />
                  <Chip size="small" variant="outlined" label={group.latestTimestamp ? `latest ${new Date(group.latestTimestamp).toLocaleString()}` : 'no data'} />
                </Stack>
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 1.25 }}>
              <Stack spacing={1.25}>
                <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1.25 }}>
                  <Table size="small" aria-label={`Output variables for ${group.label}`} sx={{ minWidth: 760 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ width: 210 }}>Scientific family</TableCell>
                        <TableCell>X</TableCell>
                        <TableCell>Y</TableCell>
                        <TableCell>Z</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {group.families.map((family) => (
                        <TableRow key={family.key} hover>
                          <TableCell>
                            <Typography variant="body2" fontWeight={800}>{family.label}</Typography>
                            <Typography variant="caption" color="text.secondary">{family.description}</Typography>
                          </TableCell>
                          <TableCell><TargetComponentCell variable={family.components.x} family={family} /></TableCell>
                          <TableCell><TargetComponentCell variable={family.components.y} family={family} /></TableCell>
                          <TableCell><TargetComponentCell variable={family.components.z} family={family} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
                <Accordion disableGutters variant="outlined" sx={{ borderRadius: 1.25, '&:before': { display: 'none' } }}>
                  <AccordionSummary expandIcon={<span aria-hidden>▾</span>}>
                    <Typography variant="caption" fontWeight={700}>Technical variable details ({group.variables.length})</Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0 }}>
                    <Box sx={{ overflowX: 'auto', maxHeight: 300 }}>
                      <Table size="small" stickyHeader aria-label={`Technical variables for ${group.label}`}>
                        <TableHead>
                          <TableRow>
                            <TableCell>ID</TableCell>
                            <TableCell>Variable key</TableCell>
                            <TableCell>Component</TableCell>
                            <TableCell align="right">Samples</TableCell>
                            <TableCell>Last timestamp</TableCell>
                            <TableCell align="right">Last value (m)</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {group.variables.map((variable) => {
                            const last = variable.series.at(-1);
                            return (
                              <TableRow key={variable.variableId} hover>
                                <TableCell>{variable.variableId}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{variable.key}</TableCell>
                                <TableCell>{variable.component}</TableCell>
                                <TableCell align="right">{variable.series.length}</TableCell>
                                <TableCell>{last ? new Date(last.timestamp).toLocaleString() : '—'}</TableCell>
                                <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{fixed(last?.value, 6)}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </Box>
                  </AccordionDetails>
                </Accordion>
              </Stack>
            </AccordionDetails>
          </Accordion>
        ))}
      </Stack>
    </Stack>
  );
}

function SummaryCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' | 'warning' | 'error' }) {
  const borderColor = tone === 'success' ? 'success.main' : tone === 'warning' ? 'warning.main' : tone === 'error' ? 'error.main' : 'divider';
  return (
    <Paper variant="outlined" sx={{ px: 1.25, py: 1, borderRadius: 1.5, borderTopWidth: 3, borderTopColor: borderColor }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h6" fontWeight={800}>{value}</Typography>
    </Paper>
  );
}

// ------------------------------------------------------------------ reprocessing

function ReprocessTab({ processingId, versions, onError }: { processingId: number; versions: StoredVersion[]; onError: (message: string) => void }) {
  const queryClient = useQueryClient();
  const usable = versions.filter((version) => version.status !== 'draft');
  const defaultFrom = usable[0]?.validFrom?.slice(0, 16) ?? new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 16);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 16));
  const [forcedVersionId, setForcedVersionId] = useState('');
  const [reprocessReason, setReprocessReason] = useState('');
  const [preview, setPreview] = useState<ReprocessPreview>();
  const [result, setResult] = useState<ReprocessResult>();
  const toIso = (local: string) => new Date(local).toISOString();
  const previewMutation = useMutation({
    mutationFn: () => api<ReprocessPreview>('POST', `/api/v2/topographic-adjustments/${processingId}/reprocess/preview`, {
      from: toIso(from),
      to: toIso(to),
      forcedVersionId: forcedVersionId || undefined,
    }),
    onSuccess: (nextPreview) => {
      setPreview(nextPreview);
      setResult(undefined);
    },
    onError: (mutationError) => onError(String(mutationError)),
  });
  const execute = useMutation({
    mutationFn: () => api<ReprocessResult>('POST', `/api/v2/topographic-adjustments/${processingId}/reprocess`, {
      from: toIso(from),
      to: toIso(to),
      reason: reprocessReason,
      forcedVersionId: forcedVersionId || undefined,
    }),
    onSuccess: (nextResult) => {
      setResult(nextResult);
      queryClient.invalidateQueries({ queryKey: ['processing', processingId] });
      queryClient.invalidateQueries({ queryKey: ['measures', processingId] });
    },
    onError: (mutationError) => onError(String(mutationError)),
  });

  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Each slot is recalculated with the version valid at that slot. Forcing one version for the whole window is possible but must be justified. Existing measures are replaced, never duplicated.
      </Alert>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField size="small" type="datetime-local" label="From" value={from} onChange={(event) => setFrom(event.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField size="small" type="datetime-local" label="To" value={to} onChange={(event) => setTo(event.target.value)} InputLabelProps={{ shrink: true }} />
        <FormControl size="small" sx={{ minWidth: 270 }}>
          <InputLabel id="forced-version">Forced version (optional)</InputLabel>
          <Select labelId="forced-version" label="Forced version (optional)" value={forcedVersionId} onChange={(event) => setForcedVersionId(event.target.value)}>
            <MenuItem value="">Per-slot resolution (default)</MenuItem>
            {usable.map((version) => <MenuItem key={version.id} value={version.id}>{version.label} ({version.status})</MenuItem>)}
          </Select>
        </FormControl>
        <Button size="small" variant="contained" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending} data-testid="reprocess-preview">
          Preview impact
        </Button>
      </Stack>
      {preview && (
        <Stack spacing={1.25}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={`${preview.totals.slotCount} slot(s) in window`} />
            <Chip size="small" label={`${preview.totals.withConfig} with a valid config`} />
            <Chip size="small" label={`${preview.totals.withData} with usable data`} color="info" />
            <Chip size="small" label={`${preview.totals.measuresToReplace} existing measure(s) to replace`} color="warning" />
          </Stack>
          <Box sx={{ maxHeight: 300, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
            <Table size="small" stickyHeader aria-label="Reprocess preview">
              <TableHead>
                <TableRow>
                  <TableCell>Slot</TableCell>
                  <TableCell>Version</TableCell>
                  <TableCell>Has data</TableCell>
                  <TableCell align="right">Existing measures</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {preview.slots.map((item) => (
                  <TableRow key={item.slot} hover>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{item.slot}</TableCell>
                    <TableCell>{item.versionLabel ?? 'no config valid'}</TableCell>
                    <TableCell><StatusChip status={item.hasData ? 'ready' : 'missing'} /></TableCell>
                    <TableCell align="right">{item.existingMeasures}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <TextField
              size="small"
              label="Reason (required)"
              value={reprocessReason}
              onChange={(event) => setReprocessReason(event.target.value)}
              sx={{ minWidth: 340 }}
              data-testid="reprocess-reason"
            />
            <Button
              size="small"
              variant="contained"
              color="warning"
              disabled={!reprocessReason.trim() || execute.isPending}
              onClick={() => execute.mutate()}
              data-testid="reprocess-execute"
            >
              {execute.isPending ? 'Reprocessing…' : 'Execute reprocessing'}
            </Button>
          </Stack>
        </Stack>
      )}
      {result && (
        <Alert severity="success">
          {result.executed} slot(s) reprocessed: {result.runs.map((item) => `${item.slot} → ${item.status}`).join(' · ') || 'nothing to recalculate'}
        </Alert>
      )}
    </Stack>
  );
}
