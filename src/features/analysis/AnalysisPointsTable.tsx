import { useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Chip,
  Collapse,
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
import { useTranslation } from 'react-i18next';
import type {
  AnalysisCoordinate,
  AnalysisReferenceSigmaOverride,
  AnalysisTrialResult,
  ReferenceConstraintModeOverride,
} from '@/domain/analysis/types';
import {
  displacementLevel,
  residualLevel,
  uncertaintyLevel,
  type QualityLevel,
} from '@/domain/analysis/quality';
import {
  pointDeltaRows,
  pointDisplayGroup,
  type PointDeltaRow,
  type PointDisplayGroup,
} from '@/features/analysis/analysis-view-model';
import { StatusChip, type NetworkDeltaThresholds } from '@/features/shared/components';
import type { NetworkSelection, NetworkSelectionMode } from '@/features/shared/network-selection';

interface AnalysisPointsTableProps {
  result: AnalysisTrialResult;
  trialLabel: string;
  deltaThresholds: NetworkDeltaThresholds;
  disabledReferences: Set<string>;
  selection?: NetworkSelection;
  selections?: NetworkSelection[];
  onSelect: (selection: NetworkSelection | undefined, mode?: NetworkSelectionMode) => void;
  /** Engine names whose values the user edited but has not recalculated yet. */
  editedPointNames?: Set<string>;
  referenceSigmaOverrides: Record<string, AnalysisReferenceSigmaOverride>;
  constraintModeOverrides: Record<string, ReferenceConstraintModeOverride>;
}

/** One semantic scale for every result column; never the role colours used on the map. */
const LEVEL_COLOUR: Record<QualityLevel, string> = {
  normal: 'success.dark',
  warning: 'warning.dark',
  critical: 'error.main',
};

/**
 * Magenta marks a value the user changed. It is outside the normal/warning/critical quality
 * scale and outside the amber the theme's secondary colour gives the "shared" chip.
 */
const EDITED_COLOUR = '#C026D3';

function levelSx(level: QualityLevel | undefined, enabled: boolean) {
  if (!enabled || !level) return undefined;
  return { color: LEVEL_COLOUR[level], fontWeight: level === 'normal' ? 500 : 800 };
}

function CoordinateValues({ coordinate }: { coordinate: AnalysisCoordinate }) {
  return (
    <Stack spacing={0.1} sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
      <Typography variant="caption" component="span">E&nbsp;{coordinate.eastingM.toFixed(4)}</Typography>
      <Typography variant="caption" component="span">N&nbsp;{coordinate.northingM.toFixed(4)}</Typography>
      <Typography variant="caption" component="span">H&nbsp;{coordinate.heightM.toFixed(4)}</Typography>
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
 * Read-only: a row selects its point and every edit happens in the inspector. Collapsed by
 * default because the map and the inspector answer most questions; it opens when the surveyor
 * wants the numbers.
 */
export function AnalysisPointsTable({
  result,
  trialLabel,
  deltaThresholds,
  disabledReferences,
  selection,
  selections = selection ? [selection] : [],
  onSelect,
  editedPointNames,
  referenceSigmaOverrides,
  constraintModeOverrides,
}: AnalysisPointsTableProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [colourDisplacements, setColourDisplacements] = useState(true);
  const [colourUncertainties, setColourUncertainties] = useState(true);
  const [colourResiduals, setColourResiduals] = useState(true);
  const [changedOnly, setChangedOnly] = useState(false);

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

  const allRows = useMemo(() => pointDeltaRows(result), [result]);
  const groups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return groupRows(allRows.filter((row) => {
      if (changedOnly && !editedPointNames?.has(row.point.engineName)) return false;
      return !needle
        || `${row.point.engineName} ${row.point.label} ${row.point.role} ${row.point.observedByStations.join(' ')}`
          .toLowerCase().includes(needle);
    }));
  }, [allRows, search, changedOnly, editedPointNames]);

  const visibleCount = groups.reduce((total, group) => total + group.rows.length, 0);
  const selectedName = selection?.kind === 'point'
    ? selection.engineName
    : selection?.kind === 'sight' ? selection.targetEngineName : undefined;
  const selectedPointNames = useMemo(() => new Set(selections.flatMap((candidate) => {
    if (candidate.kind === 'point') return [candidate.engineName];
    return [candidate.targetEngineName];
  })), [selections]);

  const groupLabel = (group: PointDisplayGroup) =>
    t(`analysis.points.group${group.charAt(0).toUpperCase()}${group.slice(1)}`);

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden' }}>
      <Stack
        direction={{ xs: 'column', lg: 'row' }}
        justifyContent="space-between"
        alignItems={{ lg: 'center' }}
        gap={1}
        sx={{ p: 1.25, bgcolor: 'grey.50', borderBottom: open ? '1px solid' : 'none', borderColor: 'divider' }}
      >
        <Stack direction="row" spacing={1.25} alignItems="center">
          <FormControlLabel
            control={<Switch size="small" checked={open} onChange={(event) => setOpen(event.target.checked)} />}
            label={(
              <Typography variant="subtitle1" fontWeight={800}>
                {t('analysis.points.title')} · {trialLabel}
              </Typography>
            )}
            data-testid="toggle-points-table"
          />
          <Chip size="small" variant="outlined" label={`${visibleCount}/${allRows.length}`} />
        </Stack>

        {/* Reaching a point without scrolling: pick it by name, or type to filter the rows. */}
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Autocomplete
            size="small"
            options={allRows.map((row) => row.point.engineName)}
            value={selectedName ?? null}
            onChange={(_, value) => onSelect(value ? { kind: 'point', engineName: value } : undefined, 'replace')}
            renderInput={(params) => <TextField {...params} label={t('analysis.points.jumpTo')} />}
            sx={{ width: 240 }}
            data-testid="point-picker"
          />
          <TextField
            size="small"
            label={t('analysis.points.search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            sx={{ width: 180 }}
          />
        </Stack>
      </Stack>

      <Collapse in={open} unmountOnExit>
        <Stack
          direction="row"
          spacing={1.5}
          flexWrap="wrap"
          useFlexGap
          sx={{ px: 1.25, py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
            {t('analysis.points.colourBy')}
          </Typography>
          {/* Isolating what was changed is how a surveyor checks their own edits before rerunning. */}
          <FormControlLabel
            control={(
              <Switch
                size="small"
                checked={changedOnly}
                onChange={(event) => setChangedOnly(event.target.checked)}
              />
            )}
            label={(
              <Typography variant="caption" sx={{ color: EDITED_COLOUR, fontWeight: 700 }}>
                {t('analysis.points.changedOnly', { count: editedPointNames?.size ?? 0 })}
              </Typography>
            )}
            data-testid="filter-changed-only"
          />
          {([
            ['displacements', colourDisplacements, setColourDisplacements],
            ['uncertainties', colourUncertainties, setColourUncertainties],
            ['residuals', colourResiduals, setColourResiduals],
          ] as const).map(([key, value, set]) => (
            <FormControlLabel
              key={key}
              control={<Switch size="small" checked={value} onChange={(event) => set(event.target.checked)} />}
              label={<Typography variant="caption">{t(`analysis.points.colour${key.charAt(0).toUpperCase()}${key.slice(1)}`)}</Typography>}
              data-testid={`colour-${key}`}
            />
          ))}
        </Stack>

        <Box sx={{ overflow: 'auto', maxHeight: 560 }}>
          <Table size="small" stickyHeader aria-label="Analysis point results" sx={{ minWidth: 1180 }}>
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
                      {groupLabel(group.group)} · {group.rows.length}
                    </Typography>
                  </TableCell>
                </TableRow>,
                ...group.rows.map((row) => {
                  const point = row.point;
                  const adjusted = row.adjusted;
                  const maxResidual = residualByPoint.get(point.engineName);
                  const pointSelection: NetworkSelection = { kind: 'point', engineName: point.engineName };
                  const isSelected = selectedPointNames.has(point.engineName);
                  const edited = editedPointNames?.has(point.engineName) ?? false;
                  const sigmaOverrides = referenceSigmaOverrides[point.engineName];
                  const modeOverrides = constraintModeOverrides[point.engineName];
                  return (
                    <TableRow
                      key={point.engineName}
                      hover
                      selected={isSelected}
                      sx={{ verticalAlign: 'top', cursor: 'pointer' }}
                      onClick={(event) => onSelect(pointSelection, event.ctrlKey ? 'toggle' : 'replace')}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelect(pointSelection, event.ctrlKey ? 'toggle' : 'replace');
                        }
                      }}
                      aria-selected={isSelected}
                      data-testid={`point-row-${point.engineName}`}
                    >
                      <TableCell sx={{ minWidth: 190 }}>
                        <Typography
                          variant="body2"
                          fontWeight={800}
                          fontFamily="monospace"
                          sx={edited ? { color: EDITED_COLOUR } : undefined}
                        >
                          {point.engineName}
                        </Typography>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.4 }}>
                          <StatusChip status={point.role} />
                          {point.identityState === 'shared' && (
                            <Chip size="small" color="secondary" variant="outlined" label={`${point.memberTargets.length} → 1`} />
                          )}
                          {point.fixed && <Chip size="small" variant="outlined" label={t('analysis.inspector.modeFixed')} />}
                          {disabledReferences.has(point.engineName) && (
                            <Chip size="small" color="warning" variant="outlined" label={t('analysis.inspector.modeFree')} />
                          )}
                          {edited && (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={t('analysis.points.edited')}
                              sx={{ color: EDITED_COLOUR, borderColor: EDITED_COLOUR }}
                            />
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ minWidth: 120 }}>
                        <Typography variant="body2">{point.observedByStations.join(', ') || '—'}</Typography>
                      </TableCell>
                      {/* One row per component keeps the constraint column aligned; the joined
                          string used to wrap mid-value and lose the column grid. */}
                      <TableCell sx={{ minWidth: 150 }}>
                        {point.constraints.length === 0 ? (
                          <Typography variant="caption" color="text.secondary">
                            {point.fixed ? t('analysis.inspector.modeFixed') : t('analysis.inspector.modeFree')}
                          </Typography>
                        ) : (
                          <Box sx={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', columnGap: 0.75, rowGap: 0.1 }}>
                            {point.constraints.map((constraint) => {
                              const mode = disabledReferences.has(point.engineName)
                                ? 'free'
                                : modeOverrides?.[constraint.component] ?? constraint.mode;
                              const sigmaM = sigmaOverrides?.[constraint.component] ?? constraint.sigmaM;
                              const modeEdited = disabledReferences.has(point.engineName)
                                || modeOverrides?.[constraint.component] !== undefined;
                              const sigmaEdited = sigmaOverrides?.[constraint.component] !== undefined;
                              return (
                              <Box key={constraint.component} sx={{ display: 'contents' }}>
                                <Typography variant="caption" fontWeight={700}>
                                  {constraint.component.toUpperCase()}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  data-testid={`point-constraint-mode-${point.engineName}-${constraint.component}`}
                                  sx={modeEdited ? { color: EDITED_COLOUR, fontWeight: 800 } : undefined}
                                >
                                  {t(`enums.constraint.${mode}`)}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  fontFamily="monospace"
                                  color={sigmaEdited ? undefined : 'text.secondary'}
                                  data-testid={`point-constraint-sigma-${point.engineName}-${constraint.component}`}
                                  sx={sigmaEdited ? { color: EDITED_COLOUR, fontWeight: 800 } : undefined}
                                >
                                  {mode === 'weak' && sigmaM !== undefined ? `${(sigmaM * 1000).toFixed(1)} mm` : ''}
                                </Typography>
                              </Box>
                              );
                            })}
                          </Box>
                        )}
                      </TableCell>
                      <TableCell sx={{ minWidth: 140 }}><CoordinateValues coordinate={point} /></TableCell>
                      <TableCell sx={{ minWidth: 140 }}>
                        {adjusted ? <CoordinateValues coordinate={adjusted} />
                          : <Typography variant="caption" color="text.secondary">—</Typography>}
                      </TableCell>
                      {/* Δ3D leads: it is the number a surveyor reads first, and stacking it above
                          the components keeps the row narrow. */}
                      <TableCell sx={{ minWidth: 130 }}>
                        {adjusted ? (
                          <Stack spacing={0.1} sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                            <Typography
                              variant="body2"
                              component="span"
                              sx={{ fontWeight: 900, ...levelSx(displacementLevel(row.delta3dMm, deltaThresholds), colourDisplacements) }}
                            >
                              Δ3D {row.delta3dMm?.toFixed(2)}
                            </Typography>
                            <Typography variant="caption" component="span" color="text.secondary">
                              E {row.deltaEMm?.toFixed(2)} · N {row.deltaNMm?.toFixed(2)} · H {row.deltaHMm?.toFixed(2)}
                            </Typography>
                          </Stack>
                        ) : '—'}
                      </TableCell>
                      <TableCell sx={{ minWidth: 130 }}>
                        {adjusted ? (
                          <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 0.6 }}>
                            {([['E', adjusted.sigmaEM], ['N', adjusted.sigmaNM], ['H', adjusted.sigmaHM]] as const).map(([label, value]) => (
                              <Box key={label} sx={{ display: 'contents' }}>
                                <Typography variant="caption" color="text.secondary">σ{label}</Typography>
                                <Typography
                                  variant="caption"
                                  fontFamily="monospace"
                                  sx={levelSx(uncertaintyLevel(value * 1000), colourUncertainties)}
                                >
                                  {(value * 1000).toFixed(2)}
                                </Typography>
                              </Box>
                            ))}
                          </Box>
                        ) : '—'}
                      </TableCell>
                      <TableCell sx={{ minWidth: 120 }}>
                        {adjusted ? (
                          <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 0.6 }}>
                            {([
                              ['a', `${(adjusted.ellipseSemiMajorM * 1000).toFixed(2)}`],
                              ['b', `${(adjusted.ellipseSemiMinorM * 1000).toFixed(2)}`],
                              ['θ', `${adjusted.ellipseOrientationDeg.toFixed(0)}°`],
                            ] as const).map(([label, value]) => (
                              <Box key={label} sx={{ display: 'contents' }}>
                                <Typography variant="caption" color="text.secondary">{label}</Typography>
                                <Typography
                                  variant="caption"
                                  fontFamily="monospace"
                                  sx={label === 'a' ? levelSx(uncertaintyLevel(adjusted.ellipseSemiMajorM * 1000), colourUncertainties) : undefined}
                                >
                                  {value}
                                </Typography>
                              </Box>
                            ))}
                          </Box>
                        ) : '—'}
                      </TableCell>
                      <TableCell align="right" sx={{ minWidth: 100 }}>
                        <Stack spacing={0.4} alignItems="flex-end">
                          <Typography
                            variant="body2"
                            fontFamily="monospace"
                            sx={levelSx(residualLevel(maxResidual), colourResiduals)}
                          >
                            {maxResidual !== undefined ? maxResidual.toFixed(2) : '—'}
                          </Typography>
                          <Chip
                            size="small"
                            variant="outlined"
                            label={t('analysis.points.observationCountChip', { count: adjusted?.observationCount ?? 0 })}
                          />
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
      </Collapse>
    </Box>
  );
}
