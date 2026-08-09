import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
import { StarNetVmBridgeCard } from '@/features/processings/StarNetVmBridgeCard';
import { ChiSquareBadge, DiagnosticPanel, StatusChip } from '@/features/shared/components';
import type { RunDetail } from '@/features/shared/types';

/** One run: summary, station epochs, correction proof, diagnostic and STAR*NET previews. */
export default function RunDetailPage() {
  const { t, i18n } = useTranslation();
  const { id, runId } = useParams();
  const [tab, setTab] = useState<'diagnostic' | 'dat' | 'prj'>('diagnostic');
  const detail = useQuery({
    queryKey: ['run', runId],
    queryFn: () => api<RunDetail>('GET', `/api/v2/runs/${runId}`),
    enabled: !!runId,
  });
  if (detail.isLoading) {
    return (
      <Container sx={{ py: 4 }}>
        <CircularProgress aria-label={t('runDetail.loading')} />
      </Container>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">{t('runDetail.notFound')}</Alert>
      </Container>
    );
  }
  const { run, diagnostic, previews, correctionSummary, starNetBridge } = detail.data;
  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
          <Typography variant="h1" sx={{ flexGrow: 1 }}>
            {t('runDetail.title', { id: run.id })}
          </Typography>
          <StatusChip status={run.status} />
          <ChiSquareBadge status={run.chiSquareStatus} />
          <Button size="small" component={RouterLink} to={`/processing/topographic-adjustment/${id}`}>
            {t('runDetail.back')}
          </Button>
        </Stack>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip size="small" label={t('runDetail.slot', { slot: run.outputSlot })} />
          <Chip size="small" label={t('runDetail.trigger', { trigger: t(`run.triggers.${run.trigger}`, { defaultValue: run.trigger }) })} />
          <Chip size="small" label={t('runDetail.config', { config: run.configVersionId || '—' })} />
          <Chip size="small" label={t('runDetail.started', { date: new Date(run.startedAt).toLocaleString(i18n.resolvedLanguage) })} />
          {run.varianceFactor !== undefined && <Chip size="small" label={t('runDetail.variance', { value: run.varianceFactor.toFixed(3) })} />}
          {run.targetAvailabilityPercent !== undefined && <Chip size="small" label={t('runDetail.availability', { value: run.targetAvailabilityPercent.toFixed(0) })} />}
          {run.referencesAvailable !== undefined && <Chip size="small" label={t('runDetail.references', { count: run.referencesAvailable })} />}
          {run.autoAdjustAttempts > 0 && <Chip size="small" color="info" label={t('runDetail.autoAdjust', { count: run.autoAdjustAttempts })} />}
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
              label={t('runDetail.stationEpoch', { station: s.stationId, state: t(`enums.freshness.${s.state}`), age: s.ageMinutes !== undefined ? t('runDetail.age', { value: Math.round(s.ageMinutes) }) : '' })}
              color={s.state === 'fresh' ? 'success' : s.state === 'reused' ? 'warning' : 'error'}
            />
          ))}
          {correctionSummary && (
            <Chip
              size="small"
              variant="outlined"
              label={t('runDetail.corrections', { observations: correctionSummary.observations, prism: correctionSummary.nonZeroPrismDeltas, atmosphere: correctionSummary.atmosphericCorrections })}
            />
          )}
        </Stack>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1}>
            <Stack direction="row" spacing={1}>
              {(['diagnostic', 'dat', 'prj'] as const).map((tabKey) => (
                <Button key={tabKey} size="small" variant={tab === tabKey ? 'contained' : 'outlined'} onClick={() => setTab(tabKey)} disabled={tabKey !== 'diagnostic' && !previews}>
                  {t(`adjustment.tabs.${tabKey}`)}
                </Button>
              ))}
            </Stack>
            {tab === 'diagnostic' &&
              (diagnostic ? (
                <DiagnosticPanel diagnostic={diagnostic} />
              ) : (
                <Alert severity="info">{t('runDetail.diagnosticMissing')}</Alert>
              ))}
            {tab !== 'diagnostic' && previews && (
              <Box component="pre" sx={{ p: 2, bgcolor: 'grey.100', borderRadius: 1, maxHeight: 420, overflow: 'auto', fontSize: 12 }}>
                {tab === 'dat' ? previews.dat : previews.prj}
              </Box>
            )}
          </Stack>
        </Paper>
        {previews && starNetBridge && (
          <StarNetVmBridgeCard run={run} previews={previews} autoAdjust={starNetBridge.autoAdjust} />
        )}
      </Stack>
    </Container>
  );
}
