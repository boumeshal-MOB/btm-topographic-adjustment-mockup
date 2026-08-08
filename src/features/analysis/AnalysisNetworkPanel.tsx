import { useMemo } from 'react';
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
  const diagnostic = useMemo(() => diagnosticWithInitialGeometry(result), [result]);
  const sharedNames = result.points.filter((point) => point.identityState === 'shared').map((point) => point.engineName);
  const references = result.points.filter((point) => point.role === 'reference').length;
  const monitoring = result.points.filter((point) => point.role === 'monitoring').length;
  const stations = result.points.filter((point) => point.role === 'station').length;

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1}>
        <Box>
          <Typography variant="h2">2. Understand the network</Typography>
          <Typography variant="body2" color="text.secondary">
            The map follows the currently selected calculation. Purple double halos identify one
            physical point observed through several BTM targets; displacement colours compare its
            adjusted and initial position.
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
          <Chip size="small" label={`${stations} station(s)`} color="info" />
          <Chip size="small" label={`${references} reference(s)`} color="success" />
          <Chip size="small" label={`${sharedNames.length} shared physical point(s)`} color="secondary" variant="outlined" />
          <Chip size="small" label={`${monitoring} monitored point(s)`} />
        </Stack>
      </Stack>

      {!result.diagnostic.ok && (
        <Alert severity="info" variant="outlined">
          The adjustment has no solution yet, so the initial geometry remains visible. Missing
          control or disconnected stations can therefore be diagnosed without an empty screen.
        </Alert>
      )}

      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        {result.stationEpochs.map((station) => (
          <Chip
            key={station.stationCode}
            size="small"
            color={station.state === 'fresh' ? 'success' : station.state === 'reused' ? 'warning' : 'error'}
            variant="outlined"
            label={`${station.stationCode}: ${station.state}${station.ageMinutes !== undefined ? ` · ${station.ageMinutes.toFixed(0)} min old` : ''}`}
          />
        ))}
      </Stack>
      {result.blocking.map((message) => <Alert key={message} severity="error" variant="outlined">{message}</Alert>)}

      <Paper variant="outlined" sx={{ p: 1.25 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
          <Typography variant="body2" fontWeight={700}>Displacement colours</Typography>
          <TextField
            size="small"
            type="number"
            label="Warning from (mm)"
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
            label="Critical from (mm)"
            value={deltaThresholds.criticalMm}
            onChange={(event) => onDeltaThresholdsChange({
              ...deltaThresholds,
              criticalMm: Math.max(deltaThresholds.warningMm, Number(event.target.value)),
            })}
            inputProps={{ min: deltaThresholds.warningMm, step: 0.1 }}
            sx={{ width: 170 }}
          />
          <Typography variant="caption" color="text.secondary">
            Visual thresholds only; they do not change χ² or publication rules.
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
