import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Checkbox,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type {
  AnalysisObservationOverride,
  AnalysisObservationSnapshot,
  AnalysisTrialResult,
} from '@/domain/analysis/types';
import { StatusChip } from '@/features/shared/components';

interface AnalysisObservationsPanelProps {
  result: AnalysisTrialResult;
  excluded: Set<string>;
  onToggleComponent: (scalarObservationId: string) => void;
  overrides: Record<string, AnalysisObservationOverride>;
  onOverride: (observationId: string, value: AnalysisObservationOverride) => void;
  weightMultiplier: number;
  defaultHzSigmaArcSec?: number;
  defaultVzSigmaArcSec?: number;
}

function numberValue(value: number): string | number {
  return Number.isFinite(value) ? value : '';
}

function effective(
  observation: AnalysisObservationSnapshot,
  override: AnalysisObservationOverride | undefined,
  key: keyof AnalysisObservationOverride,
): number {
  const overridden = override?.[key];
  if (typeof overridden === 'number') return overridden;
  if (key in observation.baseValues) return observation.baseValues[key as keyof typeof observation.baseValues];
  return observation.basePrecision[key as keyof typeof observation.basePrecision];
}

export function AnalysisObservationsPanel({
  result,
  excluded,
  onToggleComponent,
  overrides,
  onOverride,
  weightMultiplier,
  defaultHzSigmaArcSec,
  defaultVzSigmaArcSec,
}: AnalysisObservationsPanelProps) {
  const [search, setSearch] = useState('');
  const [showValues, setShowValues] = useState(false);
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return result.observations;
    return result.observations.filter((observation) =>
      `${observation.stationEngineName} ${observation.targetEngineName} ${observation.observationId}`.toLowerCase().includes(needle),
    );
  }, [result.observations, search]);

  const patch = (observation: AnalysisObservationSnapshot, change: AnalysisObservationOverride) => {
    onOverride(observation.observationId, { ...overrides[observation.observationId], ...change });
  };
  const used = (observation: AnalysisObservationSnapshot, kind: 'hz' | 'vz' | 'sd') =>
    !excluded.has(`${observation.observationId}:${kind}`) && !observation.excludedComponents.includes(kind);

  return (
    <Stack spacing={1.25}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1}>
        <Box>
          <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 800 }}>Measurement precision and use</Typography>
          <Typography variant="body2" color="text.secondary">
            A smaller sigma gives a measurement more influence. A larger sigma gives it less influence. Exclusion and edited values affect this trial only.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField size="small" label="Find station or point" value={search} onChange={(event) => setSearch(event.target.value)} />
          <Chip size="small" variant={showValues ? 'filled' : 'outlined'} label={showValues ? 'Hide measured values' : 'Edit measured values'} onClick={() => setShowValues((value) => !value)} />
          <Chip size="small" variant="outlined" label={`${rows.length}/${result.observations.length} sights`} />
        </Stack>
      </Stack>
      <Alert severity="warning" variant="outlined">
        First inspect missing geometry and large residuals. Inflating sigmas can make χ² pass without improving the observations, and the Lab will flag that situation.
      </Alert>
      <Box sx={{ overflow: 'auto', maxHeight: 560, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
        <Table size="small" stickyHeader aria-label="Analysis measurement precision" sx={{ minWidth: showValues ? 1650 : 1250 }}>
          <TableHead>
            <TableRow>
              <TableCell>Station → point</TableCell>
              <TableCell>Role</TableCell>
              <TableCell align="center">Use Hz<br /><Typography component="span" variant="caption">horizontal direction</Typography></TableCell>
              <TableCell align="right">σ Hz (arcsec)</TableCell>
              {showValues && <TableCell align="right">Hz (deg)</TableCell>}
              <TableCell align="center">Use Vz<br /><Typography component="span" variant="caption">zenith angle</Typography></TableCell>
              <TableCell align="right">σ Vz (arcsec)</TableCell>
              {showValues && <TableCell align="right">Vz (deg)</TableCell>}
              <TableCell align="center">Use Sd<br /><Typography component="span" variant="caption">slope distance</Typography></TableCell>
              <TableCell align="right">σ Sd (mm)</TableCell>
              <TableCell align="right">Sd ppm</TableCell>
              {showValues && <TableCell align="right">Corrected Sd (m)</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((observation) => {
              const override = overrides[observation.observationId];
              const sigmaHz = override?.sigmaHzArcSec ?? defaultHzSigmaArcSec
                ?? effective(observation, override, 'sigmaHzArcSec');
              const sigmaVz = override?.sigmaVzArcSec ?? defaultVzSigmaArcSec
                ?? effective(observation, override, 'sigmaVzArcSec');
              const sigmaSd = effective(observation, override, 'sigmaSdMm');
              const sigmaPpm = effective(observation, override, 'sigmaSdPpm');
              return (
                <TableRow key={observation.observationId} hover>
                  <TableCell sx={{ minWidth: 240 }}>
                    <Typography variant="body2" fontWeight={700}>{observation.stationEngineName} → {observation.targetEngineName}</Typography>
                    <Typography variant="caption" color="text.secondary" fontFamily="monospace">{observation.observationId}</Typography>
                    {observation.sharedPhysicalPoint && <Chip size="small" color="secondary" variant="outlined" label="shared point" sx={{ ml: 0.5 }} />}
                  </TableCell>
                  <TableCell><StatusChip status={observation.pointRole} /></TableCell>
                  {(['hz', 'vz', 'sd'] as const).map((kind) => {
                    const sigmaKey = kind === 'hz' ? 'sigmaHzArcSec' : kind === 'vz' ? 'sigmaVzArcSec' : 'sigmaSdMm';
                    const sigma = kind === 'hz' ? sigmaHz : kind === 'vz' ? sigmaVz : sigmaSd;
                    const valueKey = kind === 'hz' ? 'hzDeg' : kind === 'vz' ? 'vzDeg' : 'finalSlopeDistanceM';
                    const value = effective(observation, override, valueKey);
                    return [
                      <TableCell key={`${kind}-use`} align="center">
                        <Checkbox
                          size="small"
                          checked={used(observation, kind)}
                          disabled={observation.protected}
                          onChange={() => onToggleComponent(`${observation.observationId}:${kind}`)}
                          inputProps={{ 'aria-label': `Use ${kind} ${observation.stationEngineName} ${observation.targetEngineName}` }}
                        />
                      </TableCell>,
                      <TableCell key={`${kind}-sigma`} align="right">
                        <TextField
                          size="small"
                          type="number"
                          value={numberValue(sigma)}
                          onChange={(event) => patch(observation, { [sigmaKey]: Number(event.target.value) })}
                          inputProps={{ min: 0.0001, step: kind === 'sd' ? 0.1 : 0.05 }}
                          sx={{ width: 105 }}
                          helperText={weightMultiplier !== 1
                            ? `effective ${(sigma * weightMultiplier).toFixed(2)} ${kind === 'sd' ? 'mm' : 'arcsec'}`
                            : undefined}
                        />
                      </TableCell>,
                      ...(kind === 'sd'
                        ? [
                            <TableCell key="sd-ppm" align="right">
                              <TextField
                                size="small"
                                type="number"
                                value={numberValue(sigmaPpm)}
                                onChange={(event) => patch(observation, { sigmaSdPpm: Number(event.target.value) })}
                                inputProps={{ min: 0, step: 0.1 }}
                                sx={{ width: 100 }}
                              />
                            </TableCell>,
                          ]
                        : []),
                      ...(showValues
                        ? [
                            <TableCell key={`${kind}-value`} align="right">
                              <TextField
                                size="small"
                                type="number"
                                value={numberValue(value)}
                                onChange={(event) => patch(observation, { [valueKey]: Number(event.target.value) })}
                                inputProps={{ step: kind === 'sd' ? 0.0001 : 0.000001 }}
                                sx={{ width: 125 }}
                              />
                            </TableCell>,
                          ]
                        : []),
                    ];
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
      <Typography variant="caption" color="text.secondary">
        Hz and Vz precision is expressed in arcseconds. Sd precision combines a millimetre constant and ppm term according to the configured EDM model.
      </Typography>
    </Stack>
  );
}
