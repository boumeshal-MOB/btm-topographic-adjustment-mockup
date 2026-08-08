import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  Paper,
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
import type {
  AnalysisCoordinate,
  AnalysisReferenceSigmaOverride,
  AnalysisTrialResult,
} from '@/domain/analysis/types';
import { NetworkView, StatusChip, type NetworkDeltaThresholds } from '@/features/shared/components';
import { diagnosticWithInitialGeometry, pointDeltaRows } from '@/features/analysis/analysis-view-model';

interface AnalysisNetworkPanelProps {
  result: AnalysisTrialResult;
  deltaThresholds: NetworkDeltaThresholds;
  onDeltaThresholdsChange: (value: NetworkDeltaThresholds) => void;
  disabledReferences: Set<string>;
  onToggleReference: (engineName: string) => void;
  coordinateOverrides: Record<string, AnalysisCoordinate>;
  onCoordinateOverride: (engineName: string, value: AnalysisCoordinate) => void;
  referenceSigmaOverrides: Record<string, AnalysisReferenceSigmaOverride>;
  onReferenceSigmaOverride: (engineName: string, value: AnalysisReferenceSigmaOverride) => void;
}

function deltaTone(value: number | undefined, thresholds: NetworkDeltaThresholds): string {
  if (value === undefined) return 'text.secondary';
  if (value >= thresholds.criticalMm) return 'error.main';
  if (value >= thresholds.warningMm) return 'warning.main';
  return 'success.main';
}

export function AnalysisNetworkPanel({
  result,
  deltaThresholds,
  onDeltaThresholdsChange,
  disabledReferences,
  onToggleReference,
  coordinateOverrides,
  onCoordinateOverride,
  referenceSigmaOverrides,
  onReferenceSigmaOverride,
}: AnalysisNetworkPanelProps) {
  const [editCoordinates, setEditCoordinates] = useState(false);
  const diagnostic = useMemo(() => diagnosticWithInitialGeometry(result), [result]);
  const rows = useMemo(() => pointDeltaRows(result), [result]);
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
            Shapes identify point roles. Purple double halos identify one physical point observed from several BTM targets.
            Displacement colours compare adjusted and initial coordinates.
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
          <Chip size="small" label={`${stations} station(s)`} color="info" />
          <Chip size="small" label={`${references} reference(s)`} color="success" />
          <Chip size="small" label={`${monitoring} monitored point(s)`} />
          <Chip size="small" label={`${sharedNames.length} shared physical point(s)`} color="secondary" variant="outlined" />
        </Stack>
      </Stack>

      {!result.diagnostic.ok && (
        <Alert severity="info" variant="outlined">
          The adjustment has no solution yet, so the map keeps showing the initial geometry. This makes missing control or disconnected stations visible instead of hiding the network.
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
            onChange={(event) => onDeltaThresholdsChange({ ...deltaThresholds, criticalMm: Math.max(deltaThresholds.warningMm, Number(event.target.value)) })}
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
        height={520}
      />

      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ md: 'center' }}
          gap={1}
          sx={{ p: 1.25, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <Box>
            <Typography variant="subtitle1" fontWeight={800}>Points, control and coordinate changes</Typography>
            <Typography variant="caption" color="text.secondary">
              Reference sigmas are coordinate constraints. Measurement sigmas are edited separately below.
            </Typography>
          </Box>
          <FormControlLabel
            control={<Switch checked={editCoordinates} onChange={(event) => setEditCoordinates(event.target.checked)} />}
            label="Edit initial coordinates for the next trial"
          />
        </Stack>
        <Box sx={{ overflow: 'auto', maxHeight: 480 }}>
          <Table size="small" stickyHeader aria-label="Analysis points and coordinate deltas" sx={{ minWidth: 1250 }}>
            <TableHead>
              <TableRow>
                <TableCell>Point</TableCell>
                <TableCell>Role / identity</TableCell>
                <TableCell>Observed from</TableCell>
                <TableCell>Control</TableCell>
                <TableCell align="right">Initial E (m)</TableCell>
                <TableCell align="right">Initial N (m)</TableCell>
                <TableCell align="right">Initial H (m)</TableCell>
                <TableCell align="right">ΔE (mm)</TableCell>
                <TableCell align="right">ΔN (mm)</TableCell>
                <TableCell align="right">ΔH (mm)</TableCell>
                <TableCell align="right">Δ3D (mm)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const initial = coordinateOverrides[row.point.engineName] ?? row.point;
                const control = row.point.constraints.map((constraint) =>
                  `${constraint.component.toUpperCase()}: ${constraint.mode}${constraint.sigmaM ? ` ${(constraint.sigmaM * 1000).toFixed(1)} mm` : ''}`,
                ).join(' · ');
                return (
                  <TableRow key={row.point.engineName} hover>
                    <TableCell sx={{ fontWeight: 700, fontFamily: 'monospace' }}>{row.point.engineName}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        <StatusChip status={row.point.role} />
                        {row.point.identityState === 'shared' && <Chip size="small" color="secondary" variant="outlined" label={`${row.point.memberTargets.length} BTM targets → one point`} />}
                      </Stack>
                    </TableCell>
                    <TableCell>{row.point.observedByStations.join(', ') || '—'}</TableCell>
                    <TableCell sx={{ minWidth: 220 }}>
                      <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography variant="caption">{control}</Typography>
                        {row.point.role === 'reference'
                          && (row.point.constraints.some((constraint) => constraint.mode !== 'free')
                            || disabledReferences.has(row.point.engineName)) && (
                          <Button
                            size="small"
                            color={disabledReferences.has(row.point.engineName) ? 'warning' : 'inherit'}
                            onClick={() => onToggleReference(row.point.engineName)}
                          >
                            {disabledReferences.has(row.point.engineName) ? 'Restore control' : 'Free in trial'}
                          </Button>
                        )}
                      </Stack>
                      {row.point.role === 'reference' && row.point.constraints.some((constraint) => constraint.mode === 'weak') && (
                        <Stack direction="row" spacing={0.5} sx={{ mt: 0.75 }}>
                          {row.point.constraints.filter((constraint) => constraint.mode === 'weak').map((constraint) => (
                            <TextField
                              key={constraint.component}
                              size="small"
                              type="number"
                              label={`σ${constraint.component.toUpperCase()} (mm)`}
                              value={(referenceSigmaOverrides[row.point.engineName]?.[constraint.component] ?? constraint.sigmaM ?? 0) * 1000}
                              onChange={(event) => onReferenceSigmaOverride(row.point.engineName, {
                                ...referenceSigmaOverrides[row.point.engineName],
                                [constraint.component]: Number(event.target.value) / 1000,
                              })}
                              inputProps={{ min: 0.001, step: 0.1 }}
                              disabled={disabledReferences.has(row.point.engineName)}
                              sx={{ width: 105 }}
                            />
                          ))}
                        </Stack>
                      )}
                    </TableCell>
                    {(['eastingM', 'northingM', 'heightM'] as const).map((component) => (
                      <TableCell key={component} align="right">
                        {editCoordinates && !row.point.fixed ? (
                          <TextField
                            size="small"
                            type="number"
                            value={initial[component]}
                            onChange={(event) => onCoordinateOverride(row.point.engineName, { ...initial, [component]: Number(event.target.value) })}
                            inputProps={{ step: 0.0001 }}
                            sx={{ width: 125 }}
                          />
                        ) : initial[component].toFixed(4)}
                      </TableCell>
                    ))}
                    <TableCell align="right">{row.deltaEMm?.toFixed(2) ?? '—'}</TableCell>
                    <TableCell align="right">{row.deltaNMm?.toFixed(2) ?? '—'}</TableCell>
                    <TableCell align="right">{row.deltaHMm?.toFixed(2) ?? '—'}</TableCell>
                    <TableCell align="right" sx={{ color: deltaTone(row.delta3dMm, deltaThresholds), fontWeight: 800 }}>
                      {row.delta3dMm?.toFixed(2) ?? '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      </Paper>
    </Stack>
  );
}
