import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
import type {
  ProcessingDetail,
  ReprocessPreview,
  ReprocessResult,
  StoredVersion,
  VariableSeries,
} from '@/features/shared/types';

/**
 * Administration detail (front/14 §2-§6): overview & runs, configuration version timeline,
 * stable output variables grouped for operational review, and bounded reprocessing.
 */
export default function ProcessingDetailPage() {
  const { t } = useTranslation();
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
    queryFn: () => api<ProcessingDetail>('GET', `/api/v2/topographic-adjustments/${processingId}`),
    enabled: Number.isFinite(processingId),
  });

  if (detail.isLoading) {
    return (
      <Container sx={{ py: 4 }}>
        <CircularProgress aria-label={t('administration.loading')} />
      </Container>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">{t('administration.notFound')}</Alert>
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
          {processing.active ? <Chip size="small" color="success" label={t('administration.enabled')} /> : <Chip size="small" label={t('administration.disabled')} />}
          <Chip size="small" label={t(`enums.scope.${processing.scope}`)} variant="outlined" />
          <Button size="small" variant="contained" onClick={() => edit.mutate()} disabled={edit.isPending} data-testid="edit-processing">
            {t('administration.edit')}
          </Button>
          <Button
            size="small"
            variant="outlined"
            component={RouterLink}
            to={`/processing/topographic-adjustment/${processingId}/analysis`}
            data-testid="open-analysis-lab"
          >
            {t('administration.analysis')}
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
          <Tabs value={tab} onChange={(_, value) => setTab(value)} aria-label={t('administration.sections')} sx={{ minWidth: 720 }}>
            <Tab value="overview" label={t('administration.tabs.overview', { count: runs.length })} />
            <Tab value="versions" label={t('administration.tabs.versions', { count: versions.length })} />
            <Tab value="outputs" label={t('administration.tabs.outputs', { count: variables.length })} />
            <Tab value="reprocess" label={t('administration.tabs.reprocess')} />
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
  const { t, i18n } = useTranslation();
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
        <SummaryCard label={t('administration.overview.runs')} value={`${runs.length}`} />
        <SummaryCard label={t('administration.overview.successful')} value={`${successful}`} tone="success" />
        <SummaryCard label={t('administration.overview.provisional')} value={`${provisional}`} tone="warning" />
        <SummaryCard label={t('administration.overview.failed')} value={`${failed}`} tone={failed > 0 ? 'error' : 'default'} />
      </Box>
      {!activeVersion ? (
        <Alert severity="warning" variant="outlined" data-testid="no-active-config">
          {t('administration.overview.noActive')}
        </Alert>
      ) : availableSlots.length === 0 ? (
        <Alert severity="info">
          {t('administration.overview.noAlignedSlot', { version: activeVersion.label })}
        </Alert>
      ) : (
        <Stack spacing={1}>
          <Alert severity="info" variant="outlined">
            {t('administration.overview.simulationHelp')}
          </Alert>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Button
              variant="contained"
              size="small"
              onClick={() => run.mutate({})}
              disabled={run.isPending}
              data-testid="run-now"
            >
              {t('administration.overview.runLatest')}
            </Button>
            <FormControl size="small" sx={{ minWidth: 250 }}>
              <InputLabel id="run-slot">{t('administration.overview.slot')}</InputLabel>
              <Select labelId="run-slot" label={t('administration.overview.slot')} value={slot} onChange={(event) => setSlot(event.target.value)}>
                {availableSlots.slice(-24).map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
              </Select>
            </FormControl>
            <Button size="small" variant="outlined" disabled={!slot || run.isPending} onClick={() => run.mutate({ slot })}>
              {t('administration.overview.runSlot')}
            </Button>
            <Button size="small" variant="outlined" disabled={!slot || catchUp.isPending} onClick={() => catchUp.mutate({ slot })} data-testid="catch-up">
              {t('administration.overview.catchUp')}
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {t('administration.overview.catchUpHelp')}
          </Typography>
        </Stack>
      )}
      {runs.length === 0 ? (
        <Alert severity="info">
          {activeVersion
            ? t('administration.overview.noRunActive')
            : t('administration.overview.noRunInactive')}
        </Alert>
      ) : (
        <Box sx={{ overflow: 'auto', maxHeight: 520, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
          <Table size="small" stickyHeader aria-label={t('administration.overview.table')} sx={{ minWidth: 1050 }}>
            <TableHead>
              <TableRow>
                <TableCell>{t('administration.overview.started')}</TableCell>
                <TableCell>{t('administration.overview.slot')}</TableCell>
                <TableCell>{t('administration.overview.trigger')}</TableCell>
                <TableCell>{t('common.status')}</TableCell>
                <TableCell>χ²</TableCell>
                <TableCell align="right">{t('administration.overview.variance')}</TableCell>
                <TableCell align="right">{t('administration.overview.availability')}</TableCell>
                <TableCell>{t('administration.overview.error')}</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {runs.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>{new Date(item.startedAt).toLocaleString(i18n.resolvedLanguage)}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{item.outputSlot}</TableCell>
                  <TableCell>{item.trigger}</TableCell>
                  <TableCell><StatusChip status={item.status} /></TableCell>
                  <TableCell><ChiSquareBadge status={item.chiSquareStatus} /></TableCell>
                  <TableCell align="right">{item.varianceFactor !== undefined ? item.varianceFactor.toFixed(3) : '—'}</TableCell>
                  <TableCell align="right">{item.targetAvailabilityPercent !== undefined ? `${item.targetAvailabilityPercent.toFixed(0)}%` : '—'}</TableCell>
                  <TableCell sx={{ maxWidth: 300 }}>
                    {item.error ? (
                      <Typography variant="caption" color="error">[{item.error.stage}/{item.error.code}] {item.error.message}</Typography>
                    ) : '—'}
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => navigate(`/processing/topographic-adjustment/${processingId}/runs/${item.id}`)} data-testid={`open-run-${item.id}`}>
                      {t('administration.overview.detail')}
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
  const { t, i18n } = useTranslation();
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
      reason: reason || t('administration.versions.defaultReason'),
    }),
    onSuccess: invalidate,
    onError: (mutationError) => onError(String(mutationError)),
  });
  const ordered = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);

  return (
    <Stack spacing={2}>
      <Alert severity="info">
        {t('administration.versions.help')}
      </Alert>
      <Box sx={{ overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
        <Table size="small" stickyHeader aria-label={t('administration.versions.table')} sx={{ minWidth: 1100 }}>
          <TableHead>
            <TableRow>
              <TableCell>{t('administration.versions.version')}</TableCell>
              <TableCell>{t('common.status')}</TableCell>
              <TableCell>{t('administration.versions.validFrom')}</TableCell>
              <TableCell>{t('administration.versions.validTo')}</TableCell>
              <TableCell>{t('administration.versions.preflight')}</TableCell>
              <TableCell>{t('administration.versions.used')}</TableCell>
              <TableCell>{t('administration.versions.reason')}</TableCell>
              <TableCell>{t('administration.versions.overrides')}</TableCell>
              <TableCell align="right">{t('common.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {ordered.map((version) => (
              <TableRow key={version.id} hover>
                <TableCell sx={{ fontWeight: 700 }}>{version.label}</TableCell>
                <TableCell><StatusChip status={version.status} /></TableCell>
                <TableCell>{new Date(version.validFrom).toLocaleString(i18n.resolvedLanguage)}</TableCell>
                <TableCell>{version.validTo ? new Date(version.validTo).toLocaleString(i18n.resolvedLanguage) : t('administration.versions.open')}</TableCell>
                <TableCell>
                  {version.preflightTestedAt
                    ? <Chip size="small" color="success" label={t('administration.versions.passed')} />
                    : <Chip size="small" variant="outlined" label={t('administration.versions.required')} />}
                </TableCell>
                <TableCell>{version.usedByRun ? <Chip size="small" color="warning" label={t('administration.versions.immutable')} /> : t('common.no')}</TableCell>
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
                        {t('administration.versions.reviewActivate')}
                      </Button>
                    )}
                    {version.status === 'active' && <Button size="small" color="warning" onClick={() => archive.mutate(version.id)}>{t('common.archive')}</Button>}
                    <Button size="small" onClick={() => duplicate.mutate(version.id)}>{t('administration.versions.duplicate')}</Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      <TextField
        size="small"
        label={t('administration.versions.duplicateReason')}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        sx={{ maxWidth: 420 }}
      />
    </Stack>
  );
}

// -------------------------------------------------------------- output variables

function formatGlobalValue(variable: VariableSeries, yes: string, no: string): string {
  const last = variable.series.at(-1);
  if (!last) return '—';
  if (['chi2-passed', 'references-available', 'provisional-flag'].includes(variable.component)) {
    return last.value >= 0.5 ? yes : no;
  }
  if (variable.component === 'target-availability') return `${last.value.toFixed(1)}%`;
  if (variable.component === 'quality-code') return `${Math.round(last.value)}`;
  return last.value.toFixed(4);
}

function TargetComponentCell({ variable, family }: { variable?: VariableSeries; family: TargetOutputFamily }) {
  const { t, i18n } = useTranslation();
  const last = variable?.series.at(-1);
  if (!variable) return <Typography variant="body2" color="text.disabled">{t('administration.outputs.notConfigured')}</Typography>;
  if (!last) {
    return (
      <Stack spacing={0.25}>
        <Typography variant="body2" color="text.secondary">{t('administration.outputs.noData')}</Typography>
        <Typography variant="caption" color="text.disabled">ID {variable.variableId}</Typography>
      </Stack>
    );
  }
  const millimetres = last.value * 1000;
  return (
    <Tooltip title={`${variable.key} · variable ID ${variable.variableId} · ${t('administration.outputs.valueCount', { count: variable.series.length })}`}>
      <Stack spacing={0.15} sx={{ minWidth: 110 }}>
        <Typography variant="body2" fontWeight={700} fontFamily="monospace">{last.value.toFixed(5)} m</Typography>
        {(family.key === 'delta' || family.key === 'sigma') && (
          <Typography variant="caption" color="text.secondary" fontFamily="monospace">{millimetres.toFixed(2)} mm</Typography>
        )}
        <Typography variant="caption" color="text.secondary">{new Date(last.timestamp).toLocaleString(i18n.resolvedLanguage)}</Typography>
        <Typography variant="caption" color="text.disabled">{t('administration.outputs.sampleCount', { count: variable.series.length })}</Typography>
      </Stack>
    </Tooltip>
  );
}

function OutputsTab({ processingId, versions }: { processingId: number; versions: StoredVersion[] }) {
  const { t, i18n } = useTranslation();
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

  if (measures.isLoading) return <CircularProgress aria-label={t('administration.outputs.loading')} />;
  const targetVariables = list.filter((variable) => variable.scope === 'target');
  const globalVariables = list.filter((variable) => variable.scope === 'global');
  const populatedVariables = list.filter((variable) => variable.series.length > 0).length;
  const totalSamples = list.reduce((sum, variable) => sum + variable.series.length, 0);

  return (
    <Stack spacing={2}>
      <Alert severity="info" variant="outlined">
        {t('administration.outputs.stableHelp')}
      </Alert>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1 }}>
        <SummaryCard label={t('administration.outputs.stable')} value={`${list.length}`} />
        <SummaryCard label={t('administration.outputs.targets')} value={`${targetGroups.length}`} />
        <SummaryCard label={t('administration.outputs.populated')} value={`${populatedVariables}/${list.length}`} tone={populatedVariables === list.length ? 'success' : 'warning'} />
        <SummaryCard label={t('administration.outputs.samples')} value={`${totalSamples}`} />
      </Box>

      <Stack spacing={1}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
          <Box>
            <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 800 }}>{t('administration.outputs.globalTitle', { count: globalVariables.length })}</Typography>
            <Typography variant="caption" color="text.secondary">{t('administration.outputs.globalHelp')}</Typography>
          </Box>
        </Stack>
        {globalGroups.length === 0 ? (
          <Alert severity="info">{t('administration.outputs.noGlobal')}</Alert>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
            {globalGroups.map((group) => (
              <Paper key={group.key} variant="outlined" sx={{ p: 1.25, borderRadius: 1.5 }}>
                <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>{t(`administration.outputs.globalGroups.${group.key}`)}</Typography>
                <Stack spacing={0.75}>
                  {group.variables.map((variable) => {
                    const last = variable.series.at(-1);
                    return (
                      <Box key={variable.variableId} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 1, alignItems: 'center', py: 0.5, borderTop: '1px solid', borderColor: 'divider' }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={700}>{t(`administration.outputs.components.${variable.component}`, { defaultValue: variable.component })}</Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>{variable.key}</Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right' }}>
                          <Typography variant="body2" fontWeight={800} fontFamily="monospace">{formatGlobalValue(variable, t('common.yes'), t('common.no'))}</Typography>
                          <Typography variant="caption" color="text.secondary">{last ? new Date(last.timestamp).toLocaleString(i18n.resolvedLanguage) : t('administration.outputs.noValue')}</Typography>
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
            <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 800 }}>{t('administration.outputs.perTarget', { count: targetVariables.length })}</Typography>
            <Typography variant="caption" color="text.secondary">
              {t('administration.outputs.perTargetHelp')}
            </Typography>
          </Box>
          <TextField
            size="small"
            label={t('administration.outputs.find')}
            value={targetSearch}
            onChange={(event) => setTargetSearch(event.target.value)}
            sx={{ minWidth: 240 }}
          />
        </Stack>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
          <Chip size="small" variant="outlined" label={`${filteredTargets.length}/${targetGroups.length} ${t('administration.outputs.targets').toLowerCase()}`} />
          <Chip size="small" variant="outlined" label={t('administration.outputs.familiesCount')} />
          <Chip size="small" variant="outlined" label={t('administration.outputs.axes')} />
          <Chip size="small" variant="outlined" label={t('administration.outputs.units')} />
        </Stack>

        {filteredTargets.length === 0 ? (
          <Alert severity="info">{t('administration.outputs.noMatch')}</Alert>
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
                    {t('administration.outputs.sensor', { id: group.sensorId })}{group.rawTargetName && group.rawTargetName !== group.label ? ` · ${t('administration.outputs.source', { name: group.rawTargetName })}` : ''}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                  <Chip size="small" variant="outlined" label={t('administration.outputs.population', { populated: group.populatedComponents, total: group.variables.length })} />
                  <Chip size="small" variant="outlined" label={t('administration.outputs.sampleCount', { count: group.totalSamples })} />
                  <Chip size="small" variant="outlined" label={group.latestTimestamp ? t('administration.outputs.latest', { date: new Date(group.latestTimestamp).toLocaleString(i18n.resolvedLanguage) }) : t('administration.outputs.noData')} />
                </Stack>
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 1.25 }}>
              <Stack spacing={1.25}>
                <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1.25 }}>
                  <Table size="small" aria-label={t('administration.outputs.table', { target: group.label })} sx={{ minWidth: 760 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ width: 210 }}>{t('administration.outputs.family')}</TableCell>
                        <TableCell>E</TableCell>
                        <TableCell>N</TableCell>
                        <TableCell>H</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {group.families.map((family) => (
                        <TableRow key={family.key} hover>
                          <TableCell>
                            <Typography variant="body2" fontWeight={800}>{t(`administration.outputs.families.${family.key}.label`)}</Typography>
                            <Typography variant="caption" color="text.secondary">{t(`administration.outputs.families.${family.key}.description`)}</Typography>
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
                    <Typography variant="caption" fontWeight={700}>{t('administration.outputs.technical', { count: group.variables.length })}</Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0 }}>
                    <Box sx={{ overflowX: 'auto', maxHeight: 300 }}>
                      <Table size="small" stickyHeader aria-label={t('administration.outputs.technicalTable', { target: group.label })}>
                        <TableHead>
                          <TableRow>
                            <TableCell>ID</TableCell>
                            <TableCell>{t('administration.outputs.key')}</TableCell>
                            <TableCell>{t('administration.outputs.component')}</TableCell>
                            <TableCell align="right">{t('administration.outputs.samples')}</TableCell>
                            <TableCell>{t('administration.outputs.lastTimestamp')}</TableCell>
                            <TableCell align="right">{t('administration.outputs.lastValue')}</TableCell>
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
                                <TableCell>{last ? new Date(last.timestamp).toLocaleString(i18n.resolvedLanguage) : '—'}</TableCell>
                                <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{last ? last.value.toFixed(6) : '—'}</TableCell>
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
  const { t } = useTranslation();
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
        {t('administration.reprocess.help')}
      </Alert>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField size="small" type="datetime-local" label={t('administration.reprocess.from')} value={from} onChange={(event) => setFrom(event.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField size="small" type="datetime-local" label={t('administration.reprocess.to')} value={to} onChange={(event) => setTo(event.target.value)} InputLabelProps={{ shrink: true }} />
        <FormControl size="small" sx={{ minWidth: 270 }}>
          <InputLabel id="forced-version">{t('administration.reprocess.forced')}</InputLabel>
          <Select labelId="forced-version" label={t('administration.reprocess.forced')} value={forcedVersionId} onChange={(event) => setForcedVersionId(event.target.value)}>
            <MenuItem value="">{t('administration.reprocess.perSlot')}</MenuItem>
            {usable.map((version) => <MenuItem key={version.id} value={version.id}>{version.label} ({t(`enums.status.${version.status}`)})</MenuItem>)}
          </Select>
        </FormControl>
        <Button size="small" variant="contained" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending} data-testid="reprocess-preview">
          {t('administration.reprocess.preview')}
        </Button>
      </Stack>
      {preview && (
        <Stack spacing={1.25}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={t('administration.reprocess.slots', { count: preview.totals.slotCount })} />
            <Chip size="small" label={t('administration.reprocess.withConfig', { count: preview.totals.withConfig })} />
            <Chip size="small" label={t('administration.reprocess.withData', { count: preview.totals.withData })} color="info" />
            <Chip size="small" label={t('administration.reprocess.replace', { count: preview.totals.measuresToReplace })} color="warning" />
          </Stack>
          <Box sx={{ maxHeight: 300, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
            <Table size="small" stickyHeader aria-label={t('administration.reprocess.table')}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('administration.overview.slot')}</TableCell>
                  <TableCell>{t('administration.versions.version')}</TableCell>
                  <TableCell>{t('administration.reprocess.hasData')}</TableCell>
                  <TableCell align="right">{t('administration.reprocess.existing')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {preview.slots.map((item) => (
                  <TableRow key={item.slot} hover>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{item.slot}</TableCell>
                    <TableCell>{item.versionLabel ?? t('administration.reprocess.noConfig')}</TableCell>
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
              label={t('administration.reprocess.reason')}
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
              {execute.isPending ? t('administration.reprocess.running') : t('administration.reprocess.execute')}
            </Button>
          </Stack>
        </Stack>
      )}
      {result && (
        <Alert severity="success">
          {t('administration.reprocess.result', { count: result.executed, runs: result.runs.map((item) => `${item.slot} → ${t(`enums.status.${item.status}`, { defaultValue: item.status })}`).join(' · ') || t('administration.reprocess.nothing') })}
        </Alert>
      )}
    </Stack>
  );
}
