import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Chip,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { AnalysisTrialResult } from '@/domain/analysis/types';
import { diagnosticWithInitialGeometry } from '@/features/analysis/analysis-view-model';
import { NetworkView, type NetworkDeltaThresholds } from '@/features/shared/components';

interface AnalysisNetworkPanelProps {
  result: AnalysisTrialResult;
  deltaThresholds: NetworkDeltaThresholds;
  onDeltaThresholdsChange: (value: NetworkDeltaThresholds) => void;
}

/** Geometry-only overview; all point values and controls live in the single results table. */
export function AnalysisNetworkPanel({
  result,
  deltaThresholds,
  onDeltaThresholdsChange,
}: AnalysisNetworkPanelProps) {
  const { t } = useTranslation();
  const diagnostic = useMemo(() => diagnosticWithInitialGeometry(result), [result]);
  const sharedNames = result.points.filter((point) => point.identityState === 'shared').map((point) => point.engineName);
  const references = result.points.filter((point) => point.role === 'reference').length;
  const monitoring = result.points.filter((point) => point.role === 'monitoring').length;
  const stations = result.points.filter((point) => point.role === 'station').length;

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1}>
        <Box>
          <Typography variant="h2">{t('analysis.network.title')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('analysis.network.description')}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
          <Chip size="small" label={t('analysis.network.stations', { count: stations })} color="info" />
          <Chip size="small" label={t('analysis.network.references', { count: references })} color="success" />
          <Chip size="small" label={t('analysis.network.shared', { count: sharedNames.length })} color="secondary" variant="outlined" />
          <Chip size="small" label={t('analysis.network.monitoring', { count: monitoring })} />
        </Stack>
      </Stack>

      {!result.diagnostic.ok && (
        <Alert severity="info" variant="outlined">
          {t('analysis.network.noSolution')}
        </Alert>
      )}

      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        {result.stationEpochs.map((station) => (
          <Chip
            key={station.stationCode}
            size="small"
            color={station.state === 'fresh' ? 'success' : station.state === 'reused' ? 'warning' : 'error'}
            variant="outlined"
            label={t('analysis.network.epochState', {
              station: station.stationCode,
              state: t(`enums.status.${station.state}`, { defaultValue: station.state }),
              age: station.ageMinutes !== undefined
                ? t('analysis.network.age', { value: station.ageMinutes.toFixed(0) })
                : '',
            })}
          />
        ))}
      </Stack>
      {result.blocking.map((message) => <Alert key={message} severity="error" variant="outlined">{message}</Alert>)}

      <Paper variant="outlined" sx={{ p: 1.25 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
          <Typography variant="body2" fontWeight={700}>{t('analysis.network.colours')}</Typography>
          <TextField
            size="small"
            type="number"
            label={t('analysis.network.warning')}
            value={deltaThresholds.warningMm}
            onChange={(event) => {
              const warningMm = Math.max(0, Number(event.target.value));
              onDeltaThresholdsChange({ warningMm, criticalMm: Math.max(warningMm, deltaThresholds.criticalMm) });
            }}
            inputProps={{ min: 0, step: 0.1 }}
            sx={{ width: 170 }}
          />
          <TextField
            size="small"
            type="number"
            label={t('analysis.network.critical')}
            value={deltaThresholds.criticalMm}
            onChange={(event) => onDeltaThresholdsChange({
              ...deltaThresholds,
              criticalMm: Math.max(deltaThresholds.warningMm, Number(event.target.value)),
            })}
            inputProps={{ min: deltaThresholds.warningMm, step: 0.1 }}
            sx={{ width: 170 }}
          />
          <Typography variant="caption" color="text.secondary">
            {t('analysis.network.thresholdHelp')}
          </Typography>
        </Stack>
      </Paper>

      <NetworkView
        diagnostic={diagnostic}
        initialPoints={result.points}
        sharedPointNames={sharedNames}
        deltaThresholds={deltaThresholds}
        height={500}
      />
    </Stack>
  );
}
