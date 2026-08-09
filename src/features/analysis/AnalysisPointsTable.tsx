import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
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
import {
  pointDeltaRows,
  pointDisplayGroup,
  type PointDeltaRow,
} from '@/features/analysis/analysis-view-model';
import { StatusChip, type NetworkDeltaThresholds } from '@/features/shared/components';

interface AnalysisPointsTableProps {
  result: AnalysisTrialResult;
  trialLabel: string;
  deltaThresholds: NetworkDeltaThresholds;
  disabledReferences: Set<string>;
  onToggleReference: (engineName: string) => void;
  coordinateOverrides: Record<string, AnalysisCoordinate>;
  onCoordinateOverride: (engineName: string, value: AnalysisCoordinate) => void;
  referenceSigmaOverrides: Record<string, AnalysisReferenceSigmaOverride>;
  onReferenceSigmaOverride: (engineName: string, value: AnalysisReferenceSigmaOverride) => void;
}

function deltaTone(value: number | undefined, thresholds: NetworkDeltaThresholds): string {
  if (value === undefined) return 'text.secondary';
  if (Math.abs(value) >= thresholds.criticalMm) return 'error.main';
  if (Math.abs(value) >= thresholds.warningMm) return 'warning.main';
  return 'success.main';
}

function CoordinateValues({ coordinate }: { coordinate: AnalysisCoordinate }) {
  return (
    <Stack spacing={0.15} sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
      <Typography variant="caption" component="span">E&nbsp; {coordinate.eastingM.toFixed(4)}</Typography>
      <Typography variant="caption" component="span">N&nbsp; {coordinate.northingM.toFixed(4)}</Typography>
      <Typography variant="caption" component="span">H&nbsp; {coordinate.heightM.toFixed(4)}</Typography>
    </Stack>
  );
}

function coordinateDiffers(left: AnalysisCoordinate, right: AnalysisCoordinate): boolean {
  return Math.abs(left.eastingM - right.eastingM) > 1e-12
    || Math.abs(left.northingM - right.northingM) > 1e-12
    || Math.abs(left.heightM - right.heightM) > 1e-12;
}

function groupRows(rows: PointDeltaRow[]): Array<{ label: string; rows: PointDeltaRow[] }> {
  const groups: Array<{ label: string; rows: PointDeltaRow[] }> = [];
  for (const row of rows) {
    const label = pointDisplayGroup(row.point);
    const current = groups.at(-1);
    if (current?.label === label) current.rows.push(row);
    else groups.push({ label, rows: [row] });
  }
  return groups;
}

/** One point-centric table is the Analysis Lab source of truth for the selected trial. */
export function AnalysisPointsTable({
  result,
  trialLabel,
  deltaThresholds,
  disabledReferences,
  onToggleReference,
  coordinateOverrides,
  onCoordinateOverride,
  referenceSigmaOverrides,
  onReferenceSigmaOverride,
}: AnalysisPointsTableProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [editCoordinates, setEditCoordinates] = useState(false);
  const residualByPoint = useMemo(() => {
    const values = new Map<string, number>();
    for (const residual of result.diagnostic.residuals) {
      if (!residual.targetEngineName || residual.kind === 'constraint') continue;
      values.set(
        residual.targetEngineName,
        Math.max(values.get(residual.targetEngineName) ?? 0, Math.abs(residual.stdResidual)),
      );
    }
    return values;
  }, [result.diagnostic.residuals]);
  const groups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = pointDeltaRows(result).filter((row) => !needle
      || `${row.point.engineName} ${row.point.label} ${row.point.role} ${row.point.observedByStations.join(' ')}`
        .toLowerCase().includes(needle));
    return groupRows(rows);
  }, [result, search]);
  const visibleCount = groups.reduce((total, group) => total + group.rows.length, 0);

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden' }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ md: 'center' }}
        gap={1}
        sx={{ p: 1.25, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Box>
          <Typography variant="subtitle1" fontWeight={800}>{t('analysis.points.title', { trial: trialLabel })}</Typography>
          <Typography variant="caption" color="text.secondary">
            {t('analysis.points.description')}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            size="small"
            label={t('analysis.points.search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            sx={{ width: 190 }}
          />
          <Chip size="small" variant="outlined" label={t('analysis.points.count', { visible: visibleCount, total: result.points.length })} />
          <FormControlLabel
            control={<Switch checked={editCoordinates} onChange={(event) => setEditCoordinates(event.target.checked)} />}
            label={t('analysis.points.edit')}
          />
        </Stack>
      </Stack>

      <Box sx={{ overflow: 'auto', maxHeight: 650 }}>
        <Table size="small" stickyHeader aria-label={t('analysis.points.tableAria')} sx={{ minWidth: 1580 }}>
          <TableHead>
            <TableRow>
              <TableCell>{t('analysis.points.identity')}</TableCell>
              <TableCell>{t('analysis.points.observedFrom')}</TableCell>
              <TableCell>{t('analysis.points.control')}</TableCell>
              <TableCell>{t('analysis.points.initial')}</TableCell>
              <TableCell>{t('analysis.points.adjusted')}</TableCell>
              <TableCell>{t('analysis.points.delta')}</TableCell>
              <TableCell>{t('analysis.points.uncertainty')}</TableCell>
              <TableCell>{t('analysis.points.residual')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {groups.map((group) => [
              <TableRow key={`group-${group.label}`}>
                <TableCell colSpan={8} sx={{ py: 0.55, bgcolor: 'grey.100' }}>
                  <Typography variant="caption" fontWeight={900}>{t(`analysis.points.groups.${group.label}`)} · {group.rows.length}</Typography>
                </TableCell>
              </TableRow>,
              ...group.rows.map((row) => {
                const point = row.point;
                const adjusted = row.adjusted;
                const editedInitial = coordinateOverrides[point.engineName] ?? point;
                const hasPendingCoordinate = coordinateOverrides[point.engineName] !== undefined
                  && coordinateDiffers(editedInitial, point);
                const control = point.constraints.map((constraint) =>
                  `${constraint.component.toUpperCase()}: ${t(`enums.constraint.${constraint.mode}`)}${constraint.sigmaM !== undefined ? ` ${(constraint.sigmaM * 1000).toFixed(1)} mm` : ''}`,
                ).join(' · ');
                const weakConstraints = point.constraints.filter((constraint) => constraint.mode === 'weak');
                const canToggleReference = point.role === 'reference'
                  && (point.constraints.some((constraint) => constraint.mode !== 'free')
                    || disabledReferences.has(point.engineName));
                const maxResidual = residualByPoint.get(point.engineName);
                return (
                  <TableRow key={point.engineName} hover sx={{ verticalAlign: 'top' }}>
                    <TableCell sx={{ minWidth: 220 }}>
                      <Typography variant="body2" fontWeight={800} fontFamily="monospace">{point.engineName}</Typography>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.4 }}>
                        <StatusChip status={point.role} />
                        {point.identityState === 'shared' && (
                          <Chip size="small" color="secondary" variant="outlined" label={t('analysis.points.targetsToPoint', { count: point.memberTargets.length })} />
                        )}
                        {point.fixed && <Chip size="small" variant="outlined" label={t('analysis.points.fixed')} />}
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ minWidth: 145 }}>
                      <Typography variant="body2">{point.observedByStations.join(', ') || '—'}</Typography>
                    </TableCell>
                    <TableCell sx={{ minWidth: 260 }}>
                      <Stack spacing={0.6}>
                        <Typography variant="caption">{control || t(point.fixed ? 'analysis.points.fixedCoordinate' : 'analysis.points.freePoint')}</Typography>
                        {canToggleReference && (
                          <Button
                            size="small"
                            variant="outlined"
                            color={disabledReferences.has(point.engineName) ? 'warning' : 'inherit'}
                            onClick={() => onToggleReference(point.engineName)}
                            sx={{ alignSelf: 'flex-start' }}
                          >
                            {t(disabledReferences.has(point.engineName) ? 'analysis.points.restoreControl' : 'analysis.points.freeNext')}
                          </Button>
                        )}
                        {point.role === 'reference' && weakConstraints.length > 0 && (
                          <Stack direction="row" spacing={0.4} flexWrap="wrap" useFlexGap>
                            {weakConstraints.map((constraint) => (
                              <TextField
                                key={constraint.component}
                                size="small"
                                type="number"
                                label={`σ${constraint.component.toUpperCase()} mm`}
                                value={(referenceSigmaOverrides[point.engineName]?.[constraint.component]
                                  ?? constraint.sigmaM ?? 0) * 1000}
                                onChange={(event) => onReferenceSigmaOverride(point.engineName, {
                                  ...referenceSigmaOverrides[point.engineName],
                                  [constraint.component]: Number(event.target.value) / 1000,
                                })}
                                inputProps={{ min: 0.001, step: 0.1 }}
                                disabled={disabledReferences.has(point.engineName)}
                                sx={{ width: 92 }}
                              />
                            ))}
                          </Stack>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ minWidth: 170 }}>
                      {editCoordinates && !point.fixed ? (
                        <Stack spacing={0.45}>
                          {([
                            ['E', 'eastingM'],
                            ['N', 'northingM'],
                            ['H', 'heightM'],
                          ] as const).map(([label, component]) => (
                            <TextField
                              key={component}
                              size="small"
                              type="number"
                              label={label}
                              value={editedInitial[component]}
                              onChange={(event) => onCoordinateOverride(point.engineName, {
                                ...editedInitial,
                                [component]: Number(event.target.value),
                              })}
                              inputProps={{ step: 0.0001 }}
                              sx={{ width: 145 }}
                            />
                          ))}
                          {hasPendingCoordinate && <Chip size="small" color="warning" variant="outlined" label={t('analysis.points.pendingRerun')} />}
                        </Stack>
                      ) : <CoordinateValues coordinate={point} />}
                    </TableCell>
                    <TableCell sx={{ minWidth: 170 }}>
                      {adjusted ? <CoordinateValues coordinate={adjusted} /> : <Typography variant="caption" color="text.secondary">{t('analysis.points.noSolution')}</Typography>}
                    </TableCell>
                    <TableCell sx={{ minWidth: 155 }}>
                      {adjusted ? (
                        <Stack spacing={0.15} sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                          <Typography variant="caption" component="span">ΔE&nbsp; {row.deltaEMm?.toFixed(2)}</Typography>
                          <Typography variant="caption" component="span">ΔN&nbsp; {row.deltaNMm?.toFixed(2)}</Typography>
                          <Typography variant="caption" component="span">ΔH&nbsp; {row.deltaHMm?.toFixed(2)}</Typography>
                          <Typography variant="caption" component="span" sx={{ color: deltaTone(row.delta3dMm, deltaThresholds), fontWeight: 900 }}>
                            Δ3D {row.delta3dMm?.toFixed(2)}
                          </Typography>
                        </Stack>
                      ) : '—'}
                    </TableCell>
                    <TableCell sx={{ minWidth: 180 }}>
                      {adjusted ? (
                        <Stack spacing={0.2}>
                          <Typography variant="caption" fontFamily="monospace">
                            σE/N/H {(adjusted.sigmaEM * 1000).toFixed(2)} / {(adjusted.sigmaNM * 1000).toFixed(2)} / {(adjusted.sigmaHM * 1000).toFixed(2)} mm
                          </Typography>
                          <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                            a/b/θ {(adjusted.ellipseSemiMajorM * 1000).toFixed(2)} / {(adjusted.ellipseSemiMinorM * 1000).toFixed(2)} / {adjusted.ellipseOrientationDeg.toFixed(1)}°
                          </Typography>
                        </Stack>
                      ) : '—'}
                    </TableCell>
                    <TableCell sx={{ minWidth: 150 }}>
                      <Stack spacing={0.4} alignItems="flex-start">
                        <Chip size="small" variant="outlined" label={t('analysis.points.scalarObs', { count: adjusted?.observationCount ?? 0 })} />
                        {adjusted?.singleRay && <Chip size="small" color="warning" variant="outlined" label={t('analysis.points.oneRay')} />}
                        <Typography variant="caption" color="text.secondary">
                          max |v|/σ {maxResidual !== undefined ? maxResidual.toFixed(2) : '—'}
                        </Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              }),
            ])}
            {visibleCount === 0 && (
              <TableRow><TableCell colSpan={8}><Alert severity="info">{t('analysis.points.noMatch')}</Alert></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}
