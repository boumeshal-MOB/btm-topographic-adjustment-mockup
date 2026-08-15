import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  FormControl,
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
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { AnalysisTrialResult } from '@/domain/analysis/types';
import type { DiagnosticResidual } from '@/domain/engine/run-input';
import { StatusChip } from '@/features/shared/components';
import type { NetworkSelection } from '@/features/shared/network-selection';

interface AnalysisObservationsPanelProps {
  result: AnalysisTrialResult;
  excluded: Set<string>;
  selection?: NetworkSelection;
  onSelect: (selection: NetworkSelection | undefined) => void;
}

const COMPONENTS = ['hz', 'vz', 'sd'] as const;
type Component = (typeof COMPONENTS)[number];

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
  onSelect,
}: AnalysisObservationsPanelProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [component, setComponent] = useState<'all' | Component>('all');
  const [scope, setScope] = useState<'selection' | 'all'>('selection');

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
  }, [result.observations, search, scope, selectedNames, residualsByScalarId]);

  const scopedToSelection = scope === 'selection' && selection !== undefined;

  return (
    <Stack spacing={1.25}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1}>
        <Box>
          <Typography variant="subtitle1" fontWeight={800}>
            {scopedToSelection && selection
              ? t('analysis.observations.forSelection', {
                  name: selection.kind === 'point'
                    ? selection.engineName
                    : `${selection.stationEngineName} → ${selection.targetEngineName}`,
                })
              : t('analysis.observations.title')}
          </Typography>
          <Typography variant="caption" color="text.secondary">{t('analysis.selection.syncHint')}</Typography>
        </Box>
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
            variant={scope === 'selection' ? 'filled' : 'outlined'}
            clickable
            onClick={() => setScope((current) => (current === 'selection' ? 'all' : 'selection'))}
            label={scope === 'selection' ? t('analysis.observations.scopeSelection') : t('analysis.observations.scopeAll')}
          />
          <Chip size="small" variant="outlined" label={`${rows.length}/${result.observations.length}`} />
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
                const isSelected = selection?.kind === 'sight'
                  && selection.stationEngineName === observation.stationEngineName
                  && selection.targetEngineName === observation.targetEngineName;
                return (
                  <TableRow
                    key={observation.observationId}
                    hover
                    selected={isSelected}
                    sx={{ cursor: 'pointer' }}
                    tabIndex={0}
                    aria-selected={isSelected}
                    onClick={() => onSelect(isSelected ? undefined : {
                      kind: 'sight',
                      stationEngineName: observation.stationEngineName,
                      targetEngineName: observation.targetEngineName,
                    })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelect({
                          kind: 'sight',
                          stationEngineName: observation.stationEngineName,
                          targetEngineName: observation.targetEngineName,
                        });
                      }
                    }}
                    data-testid={`observation-row-${observation.observationId}`}
                  >
                    <TableCell sx={{ minWidth: 220 }}>
                      <Typography variant="body2" fontWeight={700}>
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
                        <TableCell key={kind} align="right" sx={{ minWidth: 170 }}>
                          <Stack spacing={0.2} alignItems="flex-end">
                            <Typography variant="caption" fontFamily="monospace">
                              {value.toFixed(kind === 'sd' ? 4 : 5)}{kind === 'sd' ? ' m' : '°'}
                            </Typography>
                            {isExcluded ? (
                              <Chip size="small" color="warning" variant="outlined" label={t('analysis.observations.excluded')} />
                            ) : residual ? (
                              <Chip
                                size="small"
                                variant="outlined"
                                color={Math.abs(residual.stdResidual) > 3
                                  ? 'error'
                                  : Math.abs(residual.stdResidual) > 2 ? 'warning' : 'default'}
                                label={`|v|/σ ${residual.stdResidual.toFixed(2)}`}
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
  );
}
