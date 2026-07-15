import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { api } from '@/api/client';
import { ChiSquareBadge, DiagnosticPanel, StatusChip } from '@/features/shared/components';
import type { RunDetail } from '@/features/shared/types';

/** One run: summary, station epochs, correction proof, diagnostic and STAR*NET previews. */
export default function RunDetailPage() {
  const { id, runId } = useParams();
  const [tab, setTab] = useState<'diagnostic' | 'dat' | 'snproj'>('diagnostic');
  const detail = useQuery({
    queryKey: ['run', runId],
    queryFn: () => api<RunDetail>('GET', `/api/v2/runs/${runId}`),
    enabled: !!runId,
  });
  if (detail.isLoading) {
    return (
      <Container sx={{ py: 4 }}>
        <CircularProgress aria-label="Loading run" />
      </Container>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">Run not found.</Alert>
      </Container>
    );
  }
  const { run, diagnostic, previews, correctionSummary } = detail.data;
  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
          <Typography variant="h1" sx={{ flexGrow: 1 }}>
            Run {run.id}
          </Typography>
          <StatusChip status={run.status} />
          <ChiSquareBadge status={run.chiSquareStatus} />
          <Button size="small" component={RouterLink} to={`/processing/topographic-adjustment/${id}`}>
            Back to processing
          </Button>
        </Stack>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip size="small" label={`slot ${run.outputSlot}`} />
          <Chip size="small" label={`trigger ${run.trigger}`} />
          <Chip size="small" label={`config ${run.configVersionId || '—'}`} />
          <Chip size="small" label={`started ${new Date(run.startedAt).toLocaleString()}`} />
          {run.varianceFactor !== undefined && <Chip size="small" label={`variance factor ${run.varianceFactor.toFixed(3)}`} />}
          {run.targetAvailabilityPercent !== undefined && <Chip size="small" label={`target availability ${run.targetAvailabilityPercent.toFixed(0)}%`} />}
          {run.referencesAvailable !== undefined && <Chip size="small" label={`${run.referencesAvailable} reference(s) available`} />}
          {run.autoAdjustAttempts > 0 && <Chip size="small" color="info" label={`${run.autoAdjustAttempts} Auto Adjust exclusion(s)`} />}
        </Stack>
        {run.error && (
          <Alert severity="error">
            [{run.error.stage}/{run.error.code}] {run.error.message}
          </Alert>
        )}
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {run.stationEpochs.map((s) => (
            <Chip
              key={s.stationId}
              size="small"
              label={`station ${s.stationId}: ${s.state}${s.ageMinutes !== undefined ? ` (${Math.round(s.ageMinutes)} min old)` : ''}`}
              color={s.state === 'fresh' ? 'success' : s.state === 'reused' ? 'warning' : 'error'}
            />
          ))}
          {correctionSummary && (
            <Chip
              size="small"
              variant="outlined"
              label={`corrections: ${correctionSummary.observations} obs · ${correctionSummary.nonZeroPrismDeltas} prism Δ≠0 · ${correctionSummary.atmosphericCorrections} atmospheric`}
            />
          )}
        </Stack>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1}>
            <Stack direction="row" spacing={1}>
              {(['diagnostic', 'dat', 'snproj'] as const).map((t) => (
                <Button key={t} size="small" variant={tab === t ? 'contained' : 'outlined'} onClick={() => setTab(t)} disabled={t !== 'diagnostic' && !previews}>
                  {t === 'diagnostic' ? 'Diagnostic' : t === 'dat' ? '.dat preview' : '.snproj preview'}
                </Button>
              ))}
            </Stack>
            {tab === 'diagnostic' &&
              (diagnostic ? (
                <DiagnosticPanel diagnostic={diagnostic} />
              ) : (
                <Alert severity="info">The diagnostic for this run is no longer retained (only the last 40 are kept in the demo).</Alert>
              ))}
            {tab !== 'diagnostic' && previews && (
              <Box component="pre" sx={{ p: 2, bgcolor: 'grey.100', borderRadius: 1, maxHeight: 420, overflow: 'auto', fontSize: 12 }}>
                {tab === 'dat' ? previews.dat : previews.snproj}
              </Box>
            )}
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
