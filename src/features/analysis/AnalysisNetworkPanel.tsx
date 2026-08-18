import { useMemo } from 'react';
import { Alert, Box, Chip, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { AnalysisTrialResult } from '@/domain/analysis/types';
import { diagnosticWithInitialGeometry } from '@/features/analysis/analysis-view-model';
import { NetworkView, type NetworkDeltaThresholds } from '@/features/shared/components';
import type {
  NetworkSelection,
  NetworkSelectionMode,
} from '@/features/shared/network-selection';

interface AnalysisNetworkPanelProps {
  result: AnalysisTrialResult;
  deltaThresholds: NetworkDeltaThresholds;
  onDeltaThresholdsChange: (value: NetworkDeltaThresholds) => void;
  selection?: NetworkSelection;
  selections?: NetworkSelection[];
  onSelect: (selection: NetworkSelection | undefined, mode?: NetworkSelectionMode) => void;
}

/**
 * Map for the selected trial. Selection is driven from outside so the map, the points table and
 * the observation detail always describe the same object; the inspector lives beside it rather
 * than inside it.
 */
export function AnalysisNetworkPanel({
  result,
  deltaThresholds,
  onDeltaThresholdsChange,
  selection,
  selections,
  onSelect,
}: AnalysisNetworkPanelProps) {
  const { t } = useTranslation();
  const diagnostic = useMemo(() => diagnosticWithInitialGeometry(result), [result]);
  const sharedNames = result.points.filter((point) => point.identityState === 'shared').map((point) => point.engineName);
  const references = result.points.filter((point) => point.role === 'reference').length;
  const monitoring = result.points.filter((point) => point.role === 'monitoring').length;
  const stations = result.points.filter((point) => point.role === 'station').length;

  return (
    <Stack spacing={1.25}>
      <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" gap={1}>
        <Box>
          <Typography variant="subtitle1" fontWeight={800}>{t('analysis.map.title')}</Typography>
          <Typography variant="caption" color="text.secondary">{t('analysis.map.legend')}</Typography>
        </Box>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
          <Chip size="small" label={`${stations} ${t('analysis.points.groupStations')}`} color="info" />
          <Chip size="small" label={`${references} ${t('analysis.points.groupReferences')}`} color="success" />
          <Chip
            size="small"
            label={`${sharedNames.length} ${t('analysis.points.groupSharedPoints')}`}
            color="secondary"
            variant="outlined"
          />
          <Chip size="small" label={`${monitoring} ${t('analysis.points.groupMonitoring')}`} />
        </Stack>
      </Stack>

      {!result.diagnostic.ok && (
        <Alert severity="info" variant="outlined">{t('analysis.map.noSolution')}</Alert>
      )}

      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        {result.stationEpochs.map((station) => (
          <Chip
            key={station.stationCode}
            size="small"
            color={station.state === 'fresh' ? 'success' : station.state === 'reused' ? 'warning' : 'error'}
            variant="outlined"
            label={`${station.stationCode}: ${t(`enums.status.${station.state}`, { defaultValue: station.state })}` + `${station.ageMinutes !== undefined ? ` · ${station.ageMinutes.toFixed(0)} min` : ''}`}
          />
        ))}
      </Stack>
      {result.blocking.map((message) => <Alert key={message} severity="error" variant="outlined">{message}</Alert>)}

      <NetworkView
        diagnostic={diagnostic}
        initialPoints={result.points}
        sharedPointNames={sharedNames}
        sightLines={result.observations.map((observation) => ({
          stationEngineName: observation.stationEngineName,
          targetEngineName: observation.targetEngineName,
        }))}
        deltaThresholds={deltaThresholds}
        height={470}
        selection={selection}
        selections={selections}
        onSelectionChange={onSelect}
        showInspector={false}
      />

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        alignItems={{ sm: 'center' }}
        flexWrap="wrap"
        useFlexGap
        sx={{ px: 0.25 }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
          {t('analysis.map.exaggeration')}
        </Typography>
        <TextField
          size="small"
          type="number"
          label={t('analysis.map.deltaWarning')}
          value={deltaThresholds.warningMm}
          onChange={(event) => {
            const warningMm = Math.max(0, Number(event.target.value));
            onDeltaThresholdsChange({ warningMm, criticalMm: Math.max(warningMm, deltaThresholds.criticalMm) });
          }}
          inputProps={{ min: 0, step: 0.1 }}
          sx={{ width: { xs: '100%', sm: 142 } }}
        />
        <TextField
          size="small"
          type="number"
          label={t('analysis.map.deltaCritical')}
          value={deltaThresholds.criticalMm}
          onChange={(event) => onDeltaThresholdsChange({
            ...deltaThresholds,
            criticalMm: Math.max(deltaThresholds.warningMm, Number(event.target.value)),
          })}
          inputProps={{ min: deltaThresholds.warningMm, step: 0.1 }}
          sx={{ width: { xs: '100%', sm: 142 } }}
        />
      </Stack>
    </Stack>
  );
}
