import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  Collapse,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  Switch,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { AnalysisDistanceCorrection, AnalysisTrialResult } from '@/domain/analysis/types';
import type { DiagnosticResidual } from '@/domain/engine/run-input';
import { StatusChip } from '@/features/shared/components';
import { fixed } from '@/features/shared/format';
import {
  isSameSelection,
  type NetworkSelection,
  type NetworkSelectionMode,
} from '@/features/shared/network-selection';

interface AnalysisObservationsPanelProps {
  result: AnalysisTrialResult;
  excluded: Set<string>;
  selection?: NetworkSelection;
  selections?: NetworkSelection[];
  onSelect: (selection: NetworkSelection | undefined, mode?: NetworkSelectionMode) => void;
  /** Sights whose values the user edited but has not recalculated yet. */
  editedObservationIds?: Set<string>;
}

/** Magenta, kept outside the normal/warning/critical scale used for residuals. */
const EDITED_COLOUR = '#C026D3';

const COMPONENTS = ['hz', 'vz', 'sd'] as const;
type Component = (typeof COMPONENTS)[number];

/**
 * Raw beside corrected, with the chain that separates them.
 *
 * Shown only when a correction actually moved the distance: a reflectorless sight with no prism
 * delta and an atmosphere declared already applied has nothing to explain, and a note on every row
 * would bury the ones that matter.
 */
function DistanceCorrectionNote({ correction }: { correction: AnalysisDistanceCorrection }) {
  const { t } = useTranslation();
  const totalMm = (correction.correctedDistanceM - correction.rawDistanceM) * 1000;
  if (Math.abs(totalMm) < 0.05 && !correction.convertedFromHorizontal) return null;
  return (
    <Tooltip
      title={(
        <Stack spacing={0.25} sx={{ py: 0.25 }}>
          <Typography variant="caption">
            {t('analysis.observations.correctionBreakdown', {
              prism: fixed(correction.prismDeltaM * 1000, 1),
              ppm: fixed(correction.atmosphericPpm, 2),
              total: fixed(totalMm, 2),
            })}
          </Typography>
          {correction.convertedFromHorizontal && (
            <Typography variant="caption">{t('analysis.observations.convertedFromHorizontal')}</Typography>
          )}
        </Stack>
      )}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        fontFamily="monospace"
        sx={{ cursor: 'help', textDecorationLine: 'underline', textDecorationStyle: 'dotted' }}
        data-testid={`distance-correction-${correction.rawDistanceM.toFixed(4)}`}
      >
        {t('analysis.observations.rawDistance', { value: fixed(correction.rawDistanceM, 4) })}
      </Typography>
    </Tooltip>
  );
}

/**
 * Observation detail for the current selection.
 *
 * Read-only: a sight is edited in the inspector, on the object it belongs to. This table exists to
 * *find* the sight worth looking at — it sorts by standardized residual so the worst measurement
 * is the first thing on screen — and selecting a row drives the map and the inspector with it.
 */
export function AnalysisObservationsPanel({
  result,
  excluded,
  selection,
  selections = selection ? [selection] : [],
  onSelect,
  editedObservationIds,
}: AnalysisObservationsPanelProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [component, setComponent] = useState<'all' | Component>('all');
  const [scope, setScope] = useState<'selection' | 'all'>('selection');
  const [changedOnly, setChangedOnly] = useState(false);
  const [open, setOpen] = useState(false);

  const residualsByScalarId = useMemo(() => {
    const map = new Map<string, DiagnosticResidual>();
    for (const residual of result.diagnostic.residuals) map.set(residual.scalarObservationId, residual);
    return map;
  }, [result.diagnostic.residuals]);

  const selectedNames = useMemo(() => {
    if (!selection) return undefined;
    if (selection.kind === 'point') return new Set([selection.engineName]);
    return new Set([selection.stationEngineName, selection.targetEngineName]);
  }, [selection]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const scoped = result.observations.filter((observation) => {
      if (changedOnly && !editedObservationIds?.has(observation.observationId)) return false;
      if (scope === 'selection' && selectedNames
        && !selectedNames.has(observation.stationEngineName)
        && !selectedNames.has(observation.targetEngineName)) {
        return false;
      }
      if (!needle) return true;
      return `${observation.stationEngineName} ${observation.targetEngineName} ${observation.observationId}`
        .toLowerCase().includes(needle);
    });
    return scoped
      .map((observation) => {
        const worst = COMPONENTS.reduce((max, kind) => {
          const residual = residualsByScalarId.get(`${observation.observationId}:${kind}`);
          return Math.max(max, Math.abs(residual?.stdResidual ?? 0));
        }, 0);
        return { observation, worst };
      })
      .sort((left, right) => right.worst - left.worst);
  }, [result.observations, search, scope, selectedNames, residualsByScalarId, changedOnly, editedObservationIds]);

  const scopedToSelection = scope === 'selection' && selection !== undefined;

  const title = scopedToSelection && selection
    ? t('analysis.observations.forSelection', {
        name: selection.kind === 'point'
          ? selection.engineName
          : `${selection.stationEngineName} → ${selection.targetEngineName}`,
      })
    : t('analysis.observations.title');

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden' }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ md: 'center' }}
        gap={1}
        sx={{ p: 1.25, bgcolor: 'grey.50', borderBottom: open ? '1px solid' : 'none', borderColor: 'divider' }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <FormControlLabel
            control={<Switch size="small" checked={open} onChange={(event) => setOpen(event.target.checked)} />}
            label={<Typography variant="subtitle1" fontWeight={800}>{title}</Typography>}
            data-testid="toggle-observations-table"
          />
          <Chip size="small" variant="outlined" label={`${rows.length}/${result.observations.length}`} />
        </Stack>
        <Typography variant="caption" color="text.secondary">{t('analysis.selection.multiHint')}</Typography>
      </Stack>

      <Collapse in={open} unmountOnExit>
        <Stack spacing={1.25} sx={{ p: 1.25 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1}>
            <Typography variant="caption" color="text.secondary">{t('analysis.selection.syncHint')}</Typography>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            size="small"
            label={t('analysis.points.search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            sx={{ width: 180 }}
          />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="observation-component">{t('analysis.observations.component')}</InputLabel>
            <Select
              labelId="observation-component"
              label={t('analysis.observations.component')}
              value={component}
              onChange={(event) => setComponent(event.target.value as typeof component)}
            >
              <MenuItem value="all">{t('validation.filters.any')}</MenuItem>
              <MenuItem value="hz">{t('analysis.inspector.componentHz')}</MenuItem>
              <MenuItem value="vz">{t('analysis.inspector.componentVz')}</MenuItem>
              <MenuItem value="sd">{t('analysis.inspector.componentSd')}</MenuItem>
            </Select>
          </FormControl>
          <Chip
            size="small"
            variant={changedOnly ? 'filled' : 'outlined'}
            clickable
            onClick={() => setChangedOnly((current) => !current)}
            label={t('analysis.points.changedOnly', { count: editedObservationIds?.size ?? 0 })}
            sx={changedOnly
              ? { bgcolor: EDITED_COLOUR, color: 'common.white' }
              : { color: EDITED_COLOUR, borderColor: EDITED_COLOUR }}
            data-testid="filter-changed-observations"
          />
          <Chip
            size="small"
            variant={scope === 'selection' ? 'filled' : 'outlined'}
            clickable
            onClick={() => setScope((current) => (current === 'selection' ? 'all' : 'selection'))}
            label={scope === 'selection' ? t('analysis.observations.scopeSelection') : t('analysis.observations.scopeAll')}
          />
        </Stack>
      </Stack>

      {rows.length === 0 ? (
        <Alert severity="info">{t('analysis.observations.empty')}</Alert>
      ) : (
        <Box sx={{ overflow: 'auto', maxHeight: 420, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
          <Table size="small" stickyHeader aria-label="Analysis observations" sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell>{t('analysis.selection.sight')}</TableCell>
                <TableCell>{t('analysis.points.identity')}</TableCell>
                {COMPONENTS.filter((kind) => component === 'all' || component === kind).map((kind) => (
                  <TableCell key={kind} align="right">
                    {kind === 'hz'
                      ? t('analysis.inspector.componentHz')
                      : kind === 'vz' ? t('analysis.inspector.componentVz') : t('analysis.inspector.componentSd')}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(({ observation }) => {
                const rowSelection: NetworkSelection = {
                  kind: 'sight',
                  stationEngineName: observation.stationEngineName,
                  targetEngineName: observation.targetEngineName,
                };
                const isSelected = selections.some((candidate) => isSameSelection(candidate, rowSelection));
                return (
                  <TableRow
                    key={observation.observationId}
                    hover
                    selected={isSelected}
                    sx={{ cursor: 'pointer' }}
                    tabIndex={0}
                    aria-selected={isSelected}
                    onClick={(event) => onSelect(rowSelection, event.ctrlKey ? 'toggle' : 'replace')}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelect(rowSelection, event.ctrlKey ? 'toggle' : 'replace');
                      }
                    }}
                    data-testid={`observation-row-${observation.observationId}`}
                  >
                    <TableCell sx={{ minWidth: 220 }}>
                      <Typography
                        variant="body2"
                        fontWeight={700}
                        sx={editedObservationIds?.has(observation.observationId)
                          ? { color: EDITED_COLOUR }
                          : undefined}
                      >
                        {observation.stationEngineName} → {observation.targetEngineName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                        {observation.observationId}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ minWidth: 120 }}>
                      <Stack direction="row" spacing={0.4} flexWrap="wrap" useFlexGap>
                        <StatusChip status={observation.pointRole} />
                        {observation.sharedPhysicalPoint && (
                          <Chip size="small" color="secondary" variant="outlined" label="shared" />
                        )}
                        {editedObservationIds?.has(observation.observationId) && (
                          <Chip
                            size="small"
                            variant="outlined"
                            label={t('analysis.points.edited')}
                            sx={{ color: EDITED_COLOUR, borderColor: EDITED_COLOUR }}
                          />
                        )}
                      </Stack>
                    </TableCell>
                    {COMPONENTS.filter((kind) => component === 'all' || component === kind).map((kind) => {
                      const scalarId = `${observation.observationId}:${kind}`;
                      const residual = residualsByScalarId.get(scalarId);
                      const isExcluded = excluded.has(scalarId) || observation.excludedComponents.includes(kind);
                      const value = kind === 'hz'
                        ? observation.effectiveValues.hzDeg
                        : kind === 'vz'
                          ? observation.effectiveValues.vzDeg
                          : observation.effectiveValues.finalSlopeDistanceM;
                      return (
                        <TableCell key={kind} align="right" sx={{ minWidth: kind === 'sd' ? 230 : 170 }}>
                          <Stack spacing={0.2} alignItems="flex-end">
                            <Typography variant="caption" fontFamily="monospace">
                              {fixed(value, kind === 'sd' ? 4 : 5)}{kind === 'sd' ? ' m' : '°'}
                            </Typography>
                            {/* A corrected distance cannot be checked on its own: 128.4173 m does not
                                say whether the prism constant was applied once, twice or not at all. */}
                            {kind === 'sd' && observation.distanceCorrection && (
                              <DistanceCorrectionNote correction={observation.distanceCorrection} />
                            )}
                            {isExcluded ? (
                              <Chip size="small" color="warning" variant="outlined" label={t('analysis.observations.excluded')} />
                            ) : residual ? (
                              <Chip
                                size="small"
                                variant="outlined"
                                color={Math.abs(residual.stdResidual) > 3
                                  ? 'error'
                                  : Math.abs(residual.stdResidual) > 2 ? 'warning' : 'default'}
                                label={`|v|/σ ${fixed(residual.stdResidual, 2)}`}
                              />
                            ) : (
                              <Typography variant="caption" color="text.secondary">—</Typography>
                            )}
                          </Stack>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}
        </Stack>
      </Collapse>
    </Box>
  );
}
