import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
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
import { useTranslation } from 'react-i18next';
import type { AnalysisCoordinate, AnalysisTrialResult } from '@/domain/analysis/types';
import {
  pointDeltaRows,
  pointDisplayGroup,
  type PointDeltaRow,
  type PointDisplayGroup,
} from '@/features/analysis/analysis-view-model';
import { StatusChip, type NetworkDeltaThresholds } from '@/features/shared/components';
import type { NetworkSelection } from '@/features/shared/network-selection';

interface AnalysisPointsTableProps {
  result: AnalysisTrialResult;
  trialLabel: string;
  deltaThresholds: NetworkDeltaThresholds;
  disabledReferences: Set<string>;
  selection?: NetworkSelection;
  onSelect: (selection: NetworkSelection | undefined) => void;
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

function groupRows(rows: PointDeltaRow[]): Array<{ group: PointDisplayGroup; rows: PointDeltaRow[] }> {
  const groups: Array<{ group: PointDisplayGroup; rows: PointDeltaRow[] }> = [];
  for (const row of rows) {
    const group = pointDisplayGroup(row.point);
    const current = groups.at(-1);
    if (current?.group === group) current.rows.push(row);
    else groups.push({ group, rows: [row] });
  }
  return groups;
}

/**
 * The single point-centric table for the selected trial.
 *
 * Read-only by design: a row selects its point and every edit happens in the inspector. Two
 * competing grids of inputs — one here, one per observation — were how the same object ended up
 * editable in two places with different values.
 */
export function AnalysisPointsTable({
  result,
  trialLabel,
  deltaThresholds,
  disabledReferences,
  selection,
  onSelect,
}: AnalysisPointsTableProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

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
  const selectedName = selection?.kind === 'point'
    ? selection.engineName
    : selection?.kind === 'sight' ? selection.targetEngineName : undefined;

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
          <Typography variant="subtitle1" fontWeight={800}>
            {t('analysis.points.title')} · {trialLabel}
          </Typography>
          <Typography variant="caption" color="text.secondary">{t('analysis.selection.syncHint')}</Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            size="small"
            label={t('analysis.points.search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            sx={{ width: 200 }}
          />
          <Chip size="small" variant="outlined" label={`${visibleCount}/${result.points.length}`} />
        </Stack>
      </Stack>

      <Box sx={{ overflow: 'auto', maxHeight: 560 }}>
        <Table size="small" stickyHeader aria-label="Analysis point results" sx={{ minWidth: 1420 }}>
          <TableHead>
            <TableRow>
              <TableCell>{t('analysis.points.identity')}</TableCell>
              <TableCell>{t('analysis.points.observedFrom')}</TableCell>
              <TableCell>{t('analysis.points.control')}</TableCell>
              <TableCell>{t('analysis.points.initialEnh')}</TableCell>
              <TableCell>{t('analysis.points.adjustedEnh')}</TableCell>
              <TableCell>{t('analysis.points.deltas')}</TableCell>
              <TableCell>{t('analysis.points.sigmas')}</TableCell>
              <TableCell>{t('analysis.points.ellipse')}</TableCell>
              <TableCell align="right">{t('analysis.points.maxResidual')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {groups.map((group) => [
              <TableRow key={`group-${group.group}`}>
                <TableCell colSpan={9} sx={{ py: 0.55, bgcolor: 'grey.100' }}>
                  <Typography variant="caption" fontWeight={900}>
                    {t(`analysis.points.group${group.group.charAt(0).toUpperCase()}${group.group.slice(1)}`)} · {group.rows.length}
                  </Typography>
                </TableCell>
              </TableRow>,
              ...group.rows.map((row) => {
                const point = row.point;
                const adjusted = row.adjusted;
                const control = point.constraints.map((constraint) =>
                  `${constraint.component.toUpperCase()}: ${t(`enums.constraint.${constraint.mode}`)}`
                  + `${constraint.sigmaM !== undefined ? ` ${(constraint.sigmaM * 1000).toFixed(1)} mm` : ''}`,
                ).join(' · ');
                const maxResidual = residualByPoint.get(point.engineName);
                const isSelected = selectedName === point.engineName;
                return (
                  <TableRow
                    key={point.engineName}
                    hover
                    selected={isSelected}
                    sx={{ verticalAlign: 'top', cursor: 'pointer' }}
                    onClick={() => onSelect(isSelected ? undefined : { kind: 'point', engineName: point.engineName })}
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelect({ kind: 'point', engineName: point.engineName });
                      }
                    }}
                    aria-selected={isSelected}
                    data-testid={`point-row-${point.engineName}`}
                  >
                    <TableCell sx={{ minWidth: 210 }}>
                      <Typography variant="body2" fontWeight={800} fontFamily="monospace">{point.engineName}</Typography>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.4 }}>
                        <StatusChip status={point.role} />
                        {point.identityState === 'shared' && (
                          <Chip
                            size="small"
                            color="secondary"
                            variant="outlined"
                            label={`${point.memberTargets.length} → 1`}
                          />
                        )}
                        {point.fixed && <Chip size="small" variant="outlined" label={t('analysis.inspector.modeFixed')} />}
                        {disabledReferences.has(point.engineName) && (
                          <Chip size="small" color="warning" variant="outlined" label={t('analysis.inspector.modeFree')} />
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ minWidth: 130 }}>
                      <Typography variant="body2">{point.observedByStations.join(', ') || '—'}</Typography>
                    </TableCell>
                    <TableCell sx={{ minWidth: 190 }}>
                      <Typography variant="caption">
                        {control || (point.fixed ? t('analysis.inspector.modeFixed') : t('analysis.inspector.modeFree'))}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ minWidth: 150 }}><CoordinateValues coordinate={point} /></TableCell>
                    <TableCell sx={{ minWidth: 150 }}>
                      {adjusted
                        ? <CoordinateValues coordinate={adjusted} />
                        : <Typography variant="caption" color="text.secondary">—</Typography>}
                    </TableCell>
                    <TableCell sx={{ minWidth: 140 }}>
                      {adjusted ? (
                        <Stack spacing={0.15} sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                          <Typography variant="caption" component="span">ΔE&nbsp; {row.deltaEMm?.toFixed(2)}</Typography>
                          <Typography variant="caption" component="span">ΔN&nbsp; {row.deltaNMm?.toFixed(2)}</Typography>
                          <Typography variant="caption" component="span">ΔH&nbsp; {row.deltaHMm?.toFixed(2)}</Typography>
                          <Typography
                            variant="caption"
                            component="span"
                            sx={{ color: deltaTone(row.delta3dMm, deltaThresholds), fontWeight: 900 }}
                          >
                            Δ3D {row.delta3dMm?.toFixed(2)}
                          </Typography>
                        </Stack>
                      ) : '—'}
                    </TableCell>
                    <TableCell sx={{ minWidth: 150 }}>
                      {adjusted ? (
                        <Typography variant="caption" fontFamily="monospace">
                          {(adjusted.sigmaEM * 1000).toFixed(2)} / {(adjusted.sigmaNM * 1000).toFixed(2)} / {(adjusted.sigmaHM * 1000).toFixed(2)}
                        </Typography>
                      ) : '—'}
                    </TableCell>
                    <TableCell sx={{ minWidth: 130 }}>
                      {adjusted ? (
                        <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                          {(adjusted.ellipseSemiMajorM * 1000).toFixed(2)} / {(adjusted.ellipseSemiMinorM * 1000).toFixed(2)} / {adjusted.ellipseOrientationDeg.toFixed(0)}°
                        </Typography>
                      ) : '—'}
                    </TableCell>
                    <TableCell align="right" sx={{ minWidth: 110 }}>
                      <Stack spacing={0.4} alignItems="flex-end">
                        <Typography variant="caption" fontFamily="monospace" fontWeight={maxResidual && maxResidual > 3 ? 900 : 400}>
                          {maxResidual !== undefined ? maxResidual.toFixed(2) : '—'}
                        </Typography>
                        <Chip size="small" variant="outlined" label={t('analysis.points.observationCountChip', { count: adjusted?.observationCount ?? 0 })} />
                        {adjusted?.singleRay && (
                          <Chip size="small" color="warning" variant="outlined" label={t('analysis.networkView.oneRayShort')} />
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              }),
            ])}
            {visibleCount === 0 && (
              <TableRow>
                <TableCell colSpan={9}><Alert severity="info">{t('validation.states.empty')}</Alert></TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}
