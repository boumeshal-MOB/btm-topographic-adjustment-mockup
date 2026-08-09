import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
          <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 800 }}>{t('analysis.observations.title')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('analysis.observations.description')}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField size="small" label={t('analysis.observations.search')} value={search} onChange={(event) => setSearch(event.target.value)} />
          <Chip size="small" variant={showValues ? 'filled' : 'outlined'} label={t(showValues ? 'analysis.observations.hideValues' : 'analysis.observations.showValues')} onClick={() => setShowValues((value) => !value)} />
          <Chip size="small" variant="outlined" label={t('analysis.observations.sights', { visible: rows.length, total: result.observations.length })} />
        </Stack>
      </Stack>
      <Alert severity="warning" variant="outlined">
        {t('analysis.observations.warning')}
      </Alert>
      <Box sx={{ overflow: 'auto', maxHeight: 560, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
        <Table size="small" stickyHeader aria-label={t('analysis.observations.title')} sx={{ minWidth: showValues ? 1650 : 1250 }}>
          <TableHead>
            <TableRow>
              <TableCell>{t('analysis.observations.stationPoint')}</TableCell>
              <TableCell>{t('analysis.observations.role')}</TableCell>
              <TableCell align="center">{t('analysis.observations.useHz')}<br /><Typography component="span" variant="caption">{t('analysis.observations.hzHelp')}</Typography></TableCell>
              <TableCell align="right">{t('analysis.observations.sigmaHz')}</TableCell>
              {showValues && <TableCell align="right">{t('analysis.observations.valueHz')}</TableCell>}
              <TableCell align="center">{t('analysis.observations.useVz')}<br /><Typography component="span" variant="caption">{t('analysis.observations.vzHelp')}</Typography></TableCell>
              <TableCell align="right">{t('analysis.observations.sigmaVz')}</TableCell>
              {showValues && <TableCell align="right">{t('analysis.observations.valueVz')}</TableCell>}
              <TableCell align="center">{t('analysis.observations.useSd')}<br /><Typography component="span" variant="caption">{t('analysis.observations.sdHelp')}</Typography></TableCell>
              <TableCell align="right">{t('analysis.observations.sigmaSd')}</TableCell>
              <TableCell align="right">{t('analysis.observations.ppmSd')}</TableCell>
              {showValues && <TableCell align="right">{t('analysis.observations.correctedSd')}</TableCell>}
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
                    {observation.sharedPhysicalPoint && <Chip size="small" color="secondary" variant="outlined" label={t('analysis.observations.shared')} sx={{ ml: 0.5 }} />}
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
                          inputProps={{ 'aria-label': t('analysis.observations.ariaUse', {
                            kind: kind === 'sd' ? t('analysis.observations.sdHelp') : kind,
                            station: observation.stationEngineName,
                            point: observation.targetEngineName,
                          }) }}
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
                            ? t('analysis.observations.effective', { value: (sigma * weightMultiplier).toFixed(2), unit: kind === 'sd' ? 'mm' : 'arcsec' })
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
        {t('analysis.observations.footer')}
      </Typography>
    </Stack>
  );
}
