import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Autocomplete,
  Box,
  Chip,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { api } from '@/api/client';
import type { CatalogueTarget } from '@/demo/catalogue';
import type { DraftTargetConfig, WizardDraft } from '@/demo/draft';
import { draftReflectorOptions, stationInstrumentPrecision } from '@/demo/station-precision';
import type { ConstraintMode } from '@/domain/entities';
import {
  buildDatumRows,
  componentConstraint,
  MINIMUM_HELD_REFERENCES,
  recommendedDatum,
  withConstraintMode,
  withConstraintSigma,
  type Component,
} from '@/features/create/datum-view-model';
import { stationPointId } from '@/demo/resolve-run';
import { NetworkCommonPointsPanel } from '@/features/create/NetworkCommonPointsPanel';
import { TargetBulkBar, type BulkConstraint } from '@/features/create/TargetBulkBar';
import { TargetInspector } from '@/features/create/TargetInspector';
import { TargetsTable } from '@/features/create/TargetsTable';
import {
  applyBulkConstraint,
  applyBulkEdit,
  buildTargetTableRows,
  catalogueTargetKey,
  groupTargetRowsByStation,
  summarizeTargets,
  targetKey,
  visibleKeys,
  type MeasurementFilter,
  type TargetBulkEdit,
  type TargetFilter,
  type TargetTableRow,
} from '@/features/create/target-table-view-model';
import { fixed } from '@/features/shared/format';

/**
 * Targets and measurement setup, read the way STAR*NET reads a data file.
 *
 * The screen was rebuilt around one number: a station can carry a hundred prisms. The previous table
 * put roughly ten form controls on every row, so a station was a wall of boxes that could be neither
 * read nor edited, and the same information appeared three times. It now works the way the Analysis
 * Lab does — a dense table that *states*, a selection that edits many rows at once, and an inspector
 * that edits one sight in full.
 *
 * Two things changed hands with it. Standard errors belong to the station's instrument (step 3), and
 * a sight only restates one when it is genuinely measured differently — the column shows which. And
 * the reference points carry their E/N/H constraints **here**, before the adjustment, instead of
 * being described by an opaque "datum · free" badge nobody could act on.
 */
export function TargetsAndNetworkStep({
  draft,
  update,
  onError,
}: {
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => void;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const targetsQuery = useQuery({
    queryKey: ['targets', draft.stationCodes.join(',')],
    queryFn: () => api<CatalogueTarget[]>('GET', `/api/v2/catalogue/targets/${draft.stationCodes.join(',')}`),
    enabled: draft.stationCodes.length > 0,
  });
  const catalogueByKey = useMemo(
    () => new Map((targetsQuery.data ?? []).map((target) => [catalogueTargetKey(target.stationCode, target.rawTargetName), target])),
    [targetsQuery.data],
  );
  const reflectors = useMemo(() => draftReflectorOptions(draft.countryPresetId), [draft.countryPresetId]);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<TargetFilter>('all');
  const [measurementFilter, setMeasurementFilter] = useState<MeasurementFilter>('all');
  const [changedOnly, setChangedOnly] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [activeKey, setActiveKey] = useState<string | undefined>();
  /** The last row whose checkbox was clicked — the other end of a shift-click range. */
  const [rangeAnchor, setRangeAnchor] = useState<string | undefined>();

  const rows = useMemo(
    () => buildTargetTableRows(
      { draft, catalogueByKey, reflectors },
      { search, stationCode: 'all', role: roleFilter, measurementType: measurementFilter, changedOnly },
    ),
    [draft, catalogueByKey, reflectors, search, roleFilter, measurementFilter, changedOnly],
  );
  const groups = useMemo(() => groupTargetRowsByStation(rows), [rows]);
  const summary = useMemo(() => summarizeTargets(draft), [draft]);
  const activeRow = rows.find((row) => targetKey(row.target) === activeKey);

  const patchTarget = (index: number, patch: Partial<DraftTargetConfig>) => {
    update({ targets: draft.targets.map((target, targetIndex) => targetIndex === index ? { ...target, ...patch } : target) });
  };

  /**
   * The coordinate each point already has, keyed by engine name.
   *
   * Constraining a point has to write the coordinate the Initialisation *computed*, not a zero: a
   * record created at 0/0/0 both lies about the point and degenerates the network, which is how a
   * variance factor became `NaN` and crashed the screen rendering it. `buildDatumRows` is the one
   * place that already resolves this — control record, then computed solution — so it answers here
   * too instead of a second, poorer rule.
   */
  const coordinateByPoint = useMemo(() => new Map(
    buildDatumRows(draft).map((row) => [row.pointKey, row]),
  ), [draft]);

  const pointForConstraint = (engineName: string) => {
    const known = coordinateByPoint.get(engineName);
    return {
      pointKey: engineName,
      eastingM: known?.eastingM ?? 0,
      northingM: known?.northingM ?? 0,
      heightM: known?.heightM ?? 0,
    };
  };

  const setConstraint = (row: TargetTableRow, component: Component, mode: ConstraintMode) => {
    update({
      initialisation: {
        ...draft.initialisation,
        references: withConstraintMode(
          draft.initialisation.references,
          pointForConstraint(row.target.engineName),
          component,
          mode,
        ),
      },
    });
  };

  /** A station's coordinate record, keyed the way the engine keys it. */
  const stationConstraint = (stationCode: string, component: Component) => componentConstraint(
    draft.initialisation.references.find((control) => control.pointKey === stationPointId(stationCode)),
    component,
  );

  const setStationConstraint = (stationCode: string, component: Component, mode: ConstraintMode) => {
    const solution = draft.initialisation.result?.stationSolutions
      .find((candidate) => candidate.stationCode === stationCode);
    update({
      initialisation: {
        ...draft.initialisation,
        references: withConstraintMode(
          draft.initialisation.references,
          {
            pointKey: stationPointId(stationCode),
            eastingM: solution?.eastingM ?? 0,
            northingM: solution?.northingM ?? 0,
            heightM: solution?.heightM ?? 0,
          },
          component,
          mode,
        ),
      },
    });
  };

  const applyRecommendedDatum = () => update({
    initialisation: { ...draft.initialisation, references: recommendedDatum(buildDatumRows(draft)) },
  });

  const setConstraintSigma = (row: TargetTableRow, component: Component, sigmaMm: number) => {
    update({
      initialisation: {
        ...draft.initialisation,
        references: withConstraintSigma(draft.initialisation.references, row.target.engineName, component, sigmaMm),
      },
    });
  };

  /** Rows the selection covers, taken from the full list so a filter change cannot lose them. */
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedKeys.has(targetKey(row.target))),
    [rows, selectedKeys],
  );

  const toggleRow = (key: string, shiftKey: boolean) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      const orderedKeys = visibleKeys(groups.flatMap((group) => group.rows));
      if (shiftKey && rangeAnchor) {
        const from = orderedKeys.indexOf(rangeAnchor);
        const to = orderedKeys.indexOf(key);
        if (from >= 0 && to >= 0) {
          const [start, end] = from <= to ? [from, to] : [to, from];
          // A shift-click extends, it never clears: the anchor's own state decides the whole range.
          const selecting = !current.has(key);
          for (const candidate of orderedKeys.slice(start, end + 1)) {
            if (selecting) next.add(candidate);
            else next.delete(candidate);
          }
          return next;
        }
      }
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setRangeAnchor(key);
  };

  const toggleGroup = (keys: readonly string[], selected: boolean) => setSelectedKeys((current) => {
    const next = new Set(current);
    for (const key of keys) {
      if (selected) next.add(key);
      else next.delete(key);
    }
    return next;
  });

  const applyEdit = (edit: TargetBulkEdit) => {
    update({ targets: applyBulkEdit(draft.targets, selectedKeys, edit, reflectors) });
  };

  const applyConstraint = ({ mode, sigmaMm }: BulkConstraint) => {
    update({
      initialisation: {
        ...draft.initialisation,
        references: applyBulkConstraint(
          draft.initialisation.references,
          selectedRows.map((row) => pointForConstraint(row.target.engineName)),
          mode,
          sigmaMm,
        ),
      },
    });
  };

  const stationSubtitle = (stationCode: string) => {
    const station = draft.stations.find((candidate) => candidate.stationCode === stationCode);
    if (!station) return '';
    const precision = stationInstrumentPrecision(draft, station);
    const prism = precision.distanceByFamily.prism;
    return t('wizard.targets.stationSubtitle', {
      height: fixed(station.instrumentHeightM, 4),
      hz: fixed(precision.directionArcSec, 2),
      vz: fixed(precision.zenithArcSec, 2),
      distance: fixed(prism.stdErrMm, 2),
      ppm: fixed(prism.ppm, 1),
      kind: t(`enums.distanceKindShort.${precision.distanceKind}`),
    });
  };

  return (
    <Stack spacing={1.25}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        justifyContent="space-between"
        alignItems={{ md: 'flex-start' }}
      >
        <Box>
          <Typography variant="h2">{t('wizard.targets.title')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('wizard.targets.description')}</Typography>
        </Box>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap justifyContent={{ md: 'flex-end' }}>
          <Chip size="small" label={t('wizard.targets.countTargets', { count: summary.total })} />
          <Chip size="small" color="info" variant="outlined" label={t('wizard.targets.countAdjusted', { count: summary.included })} />
          <Chip size="small" color="success" variant="outlined" label={t('wizard.targets.countPublished', { count: summary.published })} />
          {/* Red only once there is something to be wrong about. Before the Initialisation has
              produced coordinates, no reference *can* be constrained yet, and an alarming chip on a
              screen where nothing is wrong teaches the surveyor to ignore it. */}
          <Chip
            size="small"
            variant="outlined"
            color={summary.constrainedReferences >= MINIMUM_HELD_REFERENCES
              ? 'success'
              : draft.initialisation.result?.accepted ? 'error' : 'default'}
            label={t('wizard.targets.countConstrained', {
              count: summary.constrainedReferences,
              minimum: MINIMUM_HELD_REFERENCES,
            })}
            data-testid="constrained-reference-count"
          />
          {summary.overrides > 0 && (
            <Chip size="small" color="secondary" variant="outlined" label={t('wizard.targets.countOverrides', { count: summary.overrides })} />
          )}
          {summary.reviewRequired > 0 && (
            <Chip size="small" color="warning" variant="outlined" label={t('wizard.targets.countReview', { count: summary.reviewRequired })} />
          )}
        </Stack>
      </Stack>

      <Paper variant="outlined" sx={{ p: 1, borderRadius: 1.5 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} flexWrap="wrap" useFlexGap>
          {/* Reaching one prism out of a hundred without scrolling, the way the lab's table does it. */}
          <Autocomplete
            size="small"
            options={rows.map((row) => row.target.engineName)}
            value={activeRow?.target.engineName ?? null}
            onChange={(_, value) => {
              const found = rows.find((row) => row.target.engineName === value);
              setActiveKey(found ? targetKey(found.target) : undefined);
            }}
            renderInput={(params) => <TextField {...params} label={t('wizard.targets.jumpTo')} />}
            sx={{ width: 220 }}
            data-testid="target-picker"
          />
          <TextField
            size="small"
            label={t('wizard.targets.search')}
            placeholder={t('wizard.targets.searchPlaceholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            sx={{ minWidth: { xs: '100%', sm: 220 }, flex: { sm: '1 1 220px' } }}
          />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel id="target-role-filter">{t('wizard.targets.role')}</InputLabel>
            <Select
              labelId="target-role-filter"
              label={t('wizard.targets.role')}
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as TargetFilter)}
            >
              <MenuItem value="all">{t('wizard.targets.allRoles')}</MenuItem>
              <MenuItem value="reference">{t('enums.role.reference')}</MenuItem>
              <MenuItem value="monitoring">{t('enums.role.monitoring')}</MenuItem>
              <MenuItem value="auxiliary">{t('enums.role.auxiliary')}</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="target-measurement-filter">{t('wizard.targets.reflector')}</InputLabel>
            <Select
              labelId="target-measurement-filter"
              label={t('wizard.targets.reflector')}
              value={measurementFilter}
              onChange={(event) => setMeasurementFilter(event.target.value as MeasurementFilter)}
            >
              <MenuItem value="all">{t('wizard.targets.allReflectors')}</MenuItem>
              <MenuItem value="prism">{t('wizard.targets.prism')}</MenuItem>
              <MenuItem value="reflective-sheet">{t('wizard.targets.sheet')}</MenuItem>
              <MenuItem value="reflectorless">{t('wizard.targets.reflectorless')}</MenuItem>
            </Select>
          </FormControl>
          <FormControlLabel
            control={<Switch size="small" checked={changedOnly} onChange={(event) => setChangedOnly(event.target.checked)} />}
            label={<Typography variant="caption">{t('wizard.targets.changedOnly')}</Typography>}
            data-testid="filter-changed-only"
          />
          <Chip size="small" variant="outlined" label={t('wizard.targets.visible', { count: rows.length })} />
          <Chip
            size="small"
            variant="outlined"
            label={t('wizard.targets.selectAllVisible')}
            onClick={() => toggleGroup(visibleKeys(rows), true)}
            data-testid="select-all-visible"
          />
          {/* Stations free, known references constrained: the datum of a monitoring network, in one
              click, and the same function the Adjustment step used to offer. */}
          <Chip
            size="small"
            color="primary"
            variant="outlined"
            label={t('wizard.targets.recommendDatum')}
            onClick={applyRecommendedDatum}
            data-testid="apply-recommended-datum"
          />
        </Stack>
      </Paper>

      {selectedKeys.size > 0 && (
        <TargetBulkBar
          count={selectedKeys.size}
          reflectors={reflectors}
          onApply={applyEdit}
          onQuickToggle={(patch) => applyEdit(patch)}
          onConstraint={applyConstraint}
          onClear={() => { setSelectedKeys(new Set()); setRangeAnchor(undefined); }}
        />
      )}

      {groups.length === 0 && (
        <Alert severity="info" variant="outlined">{t('wizard.targets.noMatch')}</Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: activeRow ? 'minmax(0, 1fr) 340px' : 'minmax(0, 1fr)' },
          gap: 1.25,
          alignItems: 'start',
        }}
      >
        <TargetsTable
          groups={groups}
          reflectors={reflectors}
          selectedKeys={selectedKeys}
          activeKey={activeKey}
          stationSubtitle={stationSubtitle}
          onToggleRow={toggleRow}
          onToggleGroup={toggleGroup}
          onActivate={setActiveKey}
          onPatchTarget={patchTarget}
          onConstraint={setConstraint}
          stationConstraint={stationConstraint}
          onStationConstraint={setStationConstraint}
        />
        {activeRow && (
          <TargetInspector
            row={activeRow}
            reflectors={reflectors}
            onPatch={(patch) => patchTarget(activeRow.index, patch)}
            onConstraint={(component, mode) => setConstraint(activeRow, component, mode)}
            onSigma={(component, sigmaMm) => setConstraintSigma(activeRow, component, sigmaMm)}
            onClose={() => setActiveKey(undefined)}
          />
        )}
      </Box>

      <Alert severity="info" variant="outlined" sx={{ py: 0.25 }}>
        <Typography variant="caption">{t('wizard.targets.legend')}</Typography>
      </Alert>
      {draft.scope === 'network' && <NetworkCommonPointsPanel draft={draft} update={update} onError={onError} />}
    </Stack>
  );
}
