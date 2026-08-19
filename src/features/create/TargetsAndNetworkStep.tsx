import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Checkbox,
  Chip,
  Collapse,
  FormControl,
  FormControlLabel,
  FormHelperText,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
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
} from '@mui/material';
import { api } from '@/api/client';
import type { CatalogueTarget } from '@/demo/catalogue';
import type { WizardDraft } from '@/demo/draft';
import type { ConstraintMode, DistanceKind } from '@/domain/entities';
import { NetworkCommonPointsPanel } from '@/features/create/NetworkCommonPointsPanel';
import {
  buildTargetTableRows,
  groupTargetRowsByStation,
  summarizeTargets,
  targetConstantDeltaMm,
  valueForNumberInput,
  type MeasurementFilter,
  type TargetFilter,
} from '@/features/create/target-table-view-model';

type WizardTarget = WizardDraft['targets'][number];

/**
 * Targets and measurement setup, read the way STAR*NET reads a data file.
 *
 * Sights are grouped **per station** — a station block (`DB … DE`) is the unit of the native file —
 * and the references come first inside each group, because they are the points that will carry the
 * datum. Every column is something the adjustment actually consumes: the reflector constant, the
 * target height, what the stored distance holds, and the standard errors. The EDM program
 * (`precise`/`fine`/`standard` prism) is deliberately absent: no correction, weight or native record
 * derives from it, so offering it as a decision only suggested it mattered.
 *
 * The fixed/weighted/free state is shown here but not edited: it is a datum decision, and the datum
 * lives in the Adjustment step so one screen owns it.
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
  const infoByKey = useMemo(
    () => new Map((targetsQuery.data ?? []).map((target) => [`${target.stationCode}|${target.rawTargetName}`, target])),
    [targetsQuery.data],
  );
  const [filter, setFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState<TargetFilter>('all');
  const [measurementFilter, setMeasurementFilter] = useState<MeasurementFilter>('all');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const patchTarget = (index: number, patch: Partial<WizardTarget>) => {
    update({ targets: draft.targets.map((target, targetIndex) => targetIndex === index ? { ...target, ...patch } : target) });
  };

  const rows = useMemo(
    () => buildTargetTableRows(draft.targets, infoByKey, {
      search: filter,
      stationCode: 'all',
      role: roleFilter,
      measurementType: measurementFilter,
    }),
    [draft.targets, filter, infoByKey, measurementFilter, roleFilter],
  );
  const groups = useMemo(() => groupTargetRowsByStation(rows), [rows]);
  const summary = useMemo(() => summarizeTargets(draft.targets), [draft.targets]);

  /** The datum row this sight's point already has, if the Adjustment step created one. */
  const controlByPoint = useMemo(() => {
    const byKey = new Map<string, ConstraintMode[]>();
    for (const control of draft.initialisation.references) {
      byKey.set(control.pointKey, [control.modeE, control.modeN, control.modeH]);
    }
    return byKey;
  }, [draft.initialisation.references]);

  const datumLabel = (engineName: string): { label: string; colour: 'default' | 'error' | 'warning' | 'success' } => {
    const modes = controlByPoint.get(engineName);
    if (!modes) return { label: t('enums.constraint.free'), colour: 'default' };
    if (modes.every((mode) => mode === 'fixed')) return { label: t('enums.constraint.fixed'), colour: 'error' };
    if (modes.some((mode) => mode === 'weak')) return { label: t('enums.constraint.weak'), colour: 'success' };
    return { label: t('enums.constraint.free'), colour: 'default' };
  };

  const projectDistanceKind: DistanceKind = draft.adjustment.input3dMode?.toLowerCase().includes('horiz')
    ? 'horizontal'
    : 'slope';

  const toggleStation = (stationCode: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(stationCode)) next.delete(stationCode);
    else next.add(stationCode);
    return next;
  });

  const headerCell = { bgcolor: 'grey.100', color: 'text.secondary', fontSize: 11, fontWeight: 800, letterSpacing: '.045em', lineHeight: 1.2, py: 1, textTransform: 'uppercase' as const };

  return (
    <Stack spacing={1.5}>
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
          {summary.reviewRequired > 0 && (
            <Chip size="small" color="warning" variant="outlined" label={t('wizard.targets.countReview', { count: summary.reviewRequired })} />
          )}
        </Stack>
      </Stack>

      <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} flexWrap="wrap" useFlexGap>
          <TextField
            size="small"
            label={t('wizard.targets.search')}
            placeholder={t('wizard.targets.searchPlaceholder')}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            sx={{ minWidth: { xs: '100%', sm: 280 }, flex: { sm: '1 1 300px' } }}
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
          <FormControl size="small" sx={{ minWidth: 170 }}>
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
          <Chip size="small" variant="outlined" label={t('wizard.targets.visible', { count: rows.length })} />
        </Stack>
      </Paper>

      {groups.length === 0 && (
        <Alert severity="info" variant="outlined">{t('wizard.targets.noMatch')}</Alert>
      )}

      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.stationCode);
        const station = draft.stations.find((candidate) => candidate.stationCode === group.stationCode);
        return (
          <Box
            key={group.stationCode}
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden', bgcolor: 'background.paper' }}
            data-testid={`station-group-${group.stationCode}`}
          >
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ px: 1.25, py: 0.75, bgcolor: 'grey.50', borderBottom: isCollapsed ? 'none' : '1px solid', borderBottomColor: 'divider' }}
            >
              <IconButton size="small" onClick={() => toggleStation(group.stationCode)} aria-label={group.stationCode}>
                <Box component="span" aria-hidden sx={{ fontSize: 13 }}>{isCollapsed ? '▸' : '▾'}</Box>
              </IconButton>
              <Typography variant="subtitle2" fontWeight={800} fontFamily="monospace">{group.stationCode}</Typography>
              {station && (
                <Typography variant="caption" color="text.secondary">
                  {t('wizard.targets.instrumentHeight', { value: station.instrumentHeightM.toFixed(4) })}
                </Typography>
              )}
              <Box sx={{ flexGrow: 1 }} />
              {group.byRole.map((roleGroup) => (
                <Chip
                  key={roleGroup.role}
                  size="small"
                  variant="outlined"
                  color={roleGroup.role === 'reference' ? 'primary' : 'default'}
                  label={`${t(`enums.role.${roleGroup.role}`)} · ${roleGroup.rows.length}`}
                />
              ))}
            </Stack>

            <Collapse in={!isCollapsed} unmountOnExit>
              <Box sx={{ overflow: 'auto' }}>
                <Table
                  size="small"
                  aria-label={t('wizard.targets.tableLabel', { station: group.stationCode })}
                  sx={{ minWidth: 1080, tableLayout: 'fixed' }}
                >
                  <TableHead>
                    <TableRow sx={{ '& th': headerCell }}>
                      <TableCell sx={{ width: 200 }}>{t('wizard.targets.columnTarget')}</TableCell>
                      <TableCell sx={{ width: 96 }}>{t('wizard.targets.columnUsage')}</TableCell>
                      <TableCell sx={{ width: 186 }}>{t('wizard.targets.columnIdentity')}</TableCell>
                      <TableCell sx={{ width: 250 }}>{t('wizard.targets.columnReflector')}</TableCell>
                      <TableCell sx={{ width: 186 }}>{t('wizard.targets.columnDistance')}</TableCell>
                      <TableCell sx={{ width: 150 }}>{t('wizard.targets.columnAngles')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {group.byRole.map((roleGroup) => [
                      <TableRow key={`${group.stationCode}-${roleGroup.role}`}>
                        <TableCell colSpan={6} sx={{ py: 0.4, bgcolor: 'grey.50' }}>
                          <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '.05em' }}>
                            {t(`enums.role.${roleGroup.role}`)}
                          </Typography>
                        </TableCell>
                      </TableRow>,
                      ...roleGroup.rows.map(({ target, index, catalogue }) => {
                        const deltaMm = targetConstantDeltaMm(target);
                        const hasCorrection = Math.abs(deltaMm) >= 0.05;
                        const datum = datumLabel(target.engineName);
                        const kind = target.distanceKind ?? projectDistanceKind;
                        return (
                          <TableRow
                            key={`${target.stationCode}|${target.rawTargetName}`}
                            hover
                            data-testid={`target-row-${target.engineName}`}
                            sx={{ opacity: target.includeInAdjustment ? 1 : 0.68, '& td': { py: 1, verticalAlign: 'top' } }}
                          >
                            <TableCell>
                              <Stack spacing={0.35}>
                                <Stack direction="row" spacing={0.6} alignItems="center">
                                  <Typography variant="body2" fontWeight={750} noWrap title={target.rawTargetName}>
                                    {target.rawTargetName}
                                  </Typography>
                                  {target.reviewStatus !== 'ok' && (
                                    <Chip
                                      size="small"
                                      variant="outlined"
                                      color={target.reviewStatus === 'blocking' ? 'error' : 'warning'}
                                      label={t(`wizard.targets.review.${target.reviewStatus === 'blocking' ? 'blocking' : 'toReview'}`)}
                                      sx={{ height: 20 }}
                                    />
                                  )}
                                </Stack>
                                <Typography variant="caption" color="text.secondary">
                                  {catalogue ? t('wizard.targets.sensor', { id: catalogue.prismSensorId }) : t('wizard.targets.sensorLoading')}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {catalogue
                                    ? `Hz ${catalogue.hzVariableId} · Vz ${catalogue.vzVariableId} · Sd ${catalogue.sdVariableId}`
                                    : t('wizard.targets.variablesUnavailable')}
                                </Typography>
                              </Stack>
                            </TableCell>

                            <TableCell>
                              <Stack spacing={0}>
                                <FormControlLabel
                                  control={(
                                    <Checkbox
                                      size="small"
                                      checked={target.includeInAdjustment}
                                      onChange={(event) => patchTarget(index, { includeInAdjustment: event.target.checked })}
                                      inputProps={{ 'aria-label': `${t('wizard.targets.adjust')} ${target.rawTargetName}` }}
                                    />
                                  )}
                                  label={t('wizard.targets.adjust')}
                                  sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: 12.5 } }}
                                />
                                <FormControlLabel
                                  control={(
                                    <Checkbox
                                      size="small"
                                      checked={target.publishOutput}
                                      onChange={(event) => patchTarget(index, { publishOutput: event.target.checked })}
                                      inputProps={{ 'aria-label': `${t('wizard.targets.publish')} ${target.rawTargetName}` }}
                                    />
                                  )}
                                  label={t('wizard.targets.publish')}
                                  sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: 12.5 } }}
                                />
                              </Stack>
                            </TableCell>

                            <TableCell>
                              <Stack spacing={0.75}>
                                <FormControl size="small" fullWidth>
                                  <Select
                                    value={target.role}
                                    onChange={(event) => patchTarget(index, { role: event.target.value as WizardTarget['role'] })}
                                    inputProps={{ 'aria-label': `${t('wizard.targets.role')} ${target.rawTargetName}` }}
                                  >
                                    <MenuItem value="reference">{t('enums.role.reference')}</MenuItem>
                                    <MenuItem value="monitoring">{t('enums.role.monitoring')}</MenuItem>
                                    <MenuItem value="auxiliary">{t('enums.role.auxiliary')}</MenuItem>
                                  </Select>
                                </FormControl>
                                <TextField
                                  size="small"
                                  label={t('wizard.targets.engineName')}
                                  value={target.engineName}
                                  onChange={(event) => patchTarget(index, { engineName: event.target.value })}
                                  inputProps={{ 'aria-label': `${t('wizard.targets.engineName')} ${target.rawTargetName}` }}
                                />
                                <Tooltip title={t('wizard.targets.datumHint')}>
                                  <Chip
                                    size="small"
                                    variant="outlined"
                                    color={datum.colour}
                                    label={`${t('wizard.targets.datum')} · ${datum.label}`}
                                    sx={{ height: 20, alignSelf: 'flex-start' }}
                                  />
                                </Tooltip>
                              </Stack>
                            </TableCell>

                            <TableCell>
                              <Stack spacing={0.75}>
                                <FormControl size="small" fullWidth>
                                  <Select
                                    value={target.measurementType}
                                    onChange={(event) => {
                                      const measurementType = event.target.value as WizardTarget['measurementType'];
                                      patchTarget(index, {
                                        measurementType,
                                        ...(measurementType === 'reflectorless'
                                          ? { requiredConstantM: 0, alreadyAppliedConstantM: 0 }
                                          : {}),
                                      });
                                    }}
                                    inputProps={{ 'aria-label': `${t('wizard.targets.reflector')} ${target.rawTargetName}` }}
                                  >
                                    <MenuItem value="prism">{t('wizard.targets.prism')}</MenuItem>
                                    <MenuItem value="reflective-sheet">{t('wizard.targets.sheet')}</MenuItem>
                                    <MenuItem value="reflectorless">{t('wizard.targets.reflectorless')}</MenuItem>
                                  </Select>
                                </FormControl>
                                {target.measurementType === 'reflectorless' ? (
                                  <Typography variant="caption" color="text.secondary">
                                    {t('wizard.targets.noConstant')}
                                  </Typography>
                                ) : (
                                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 0.75, alignItems: 'center' }}>
                                    <TextField
                                      size="small"
                                      type="number"
                                      label={t('wizard.targets.constantRequired')}
                                      value={valueForNumberInput(target.requiredConstantM * 1000, 1)}
                                      onChange={(event) => patchTarget(index, { requiredConstantM: Number(event.target.value) / 1000 })}
                                      inputProps={{ step: 0.1, 'aria-label': `${t('wizard.targets.constantRequired')} ${target.rawTargetName}` }}
                                    />
                                    <TextField
                                      size="small"
                                      type="number"
                                      label={t('wizard.targets.constantApplied')}
                                      value={valueForNumberInput(target.alreadyAppliedConstantM * 1000, 1)}
                                      onChange={(event) => patchTarget(index, { alreadyAppliedConstantM: Number(event.target.value) / 1000 })}
                                      inputProps={{ step: 0.1, 'aria-label': `${t('wizard.targets.constantApplied')} ${target.rawTargetName}` }}
                                    />
                                    <Chip
                                      size="small"
                                      color={hasCorrection ? 'warning' : 'success'}
                                      variant={hasCorrection ? 'filled' : 'outlined'}
                                      label={`Δ ${deltaMm > 0 ? '+' : ''}${deltaMm.toFixed(1)}`}
                                    />
                                  </Box>
                                )}
                                <TextField
                                  size="small"
                                  type="number"
                                  label={t('wizard.targets.targetHeight')}
                                  value={valueForNumberInput(target.targetHeightM, 4)}
                                  onChange={(event) => patchTarget(index, { targetHeightM: Number(event.target.value) })}
                                  inputProps={{ step: 0.001, 'aria-label': `${t('wizard.targets.targetHeight')} ${target.rawTargetName}` }}
                                  sx={{ maxWidth: 118 }}
                                />
                              </Stack>
                            </TableCell>

                            <TableCell>
                              <Stack spacing={0.75}>
                                <FormControl size="small" fullWidth>
                                  <InputLabel id={`distance-kind-${target.engineName}`}>{t('wizard.targets.distanceKind')}</InputLabel>
                                  <Select
                                    labelId={`distance-kind-${target.engineName}`}
                                    label={t('wizard.targets.distanceKind')}
                                    value={kind}
                                    onChange={(event) => patchTarget(index, { distanceKind: event.target.value as DistanceKind })}
                                  >
                                    <MenuItem value="slope">{t('enums.distanceKind.slope')}</MenuItem>
                                    <MenuItem value="horizontal">{t('enums.distanceKind.horizontal')}</MenuItem>
                                  </Select>
                                  {target.distanceKind === undefined && (
                                    <FormHelperText sx={{ mx: 0 }}>{t('wizard.targets.inheritedFromProject')}</FormHelperText>
                                  )}
                                </FormControl>
                                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75 }}>
                                  <TextField
                                    size="small"
                                    type="number"
                                    label={t('wizard.targets.sigmaDistance')}
                                    value={valueForNumberInput(target.distanceStdErrMm, 2)}
                                    onChange={(event) => patchTarget(index, { distanceStdErrMm: Number(event.target.value) })}
                                    inputProps={{ step: 0.1, min: 0, 'aria-label': `${t('wizard.targets.sigmaDistance')} ${target.rawTargetName}` }}
                                  />
                                  <TextField
                                    size="small"
                                    type="number"
                                    label={t('wizard.targets.sigmaPpm')}
                                    value={valueForNumberInput(target.distancePpm, 2)}
                                    onChange={(event) => patchTarget(index, { distancePpm: Number(event.target.value) })}
                                    inputProps={{ step: 0.1, min: 0, 'aria-label': `${t('wizard.targets.sigmaPpm')} ${target.rawTargetName}` }}
                                  />
                                </Box>
                              </Stack>
                            </TableCell>

                            <TableCell>
                              <Stack spacing={0.75}>
                                <TextField
                                  size="small"
                                  type="number"
                                  label={t('wizard.targets.sigmaHz')}
                                  value={target.directionStdErrArcSec ?? ''}
                                  placeholder={String(draft.adjustment.defaultWeights?.directionArcSec ?? '')}
                                  onChange={(event) => patchTarget(index, {
                                    directionStdErrArcSec: event.target.value === '' ? undefined : Number(event.target.value),
                                  })}
                                  inputProps={{ step: 0.05, min: 0, 'aria-label': `${t('wizard.targets.sigmaHz')} ${target.rawTargetName}` }}
                                />
                                <TextField
                                  size="small"
                                  type="number"
                                  label={t('wizard.targets.sigmaVz')}
                                  value={target.zenithStdErrArcSec ?? ''}
                                  placeholder={String(draft.adjustment.defaultWeights?.zenithArcSec ?? '')}
                                  onChange={(event) => patchTarget(index, {
                                    zenithStdErrArcSec: event.target.value === '' ? undefined : Number(event.target.value),
                                  })}
                                  inputProps={{ step: 0.05, min: 0, 'aria-label': `${t('wizard.targets.sigmaVz')} ${target.rawTargetName}` }}
                                />
                                {(target.directionStdErrArcSec === undefined || target.zenithStdErrArcSec === undefined) && (
                                  <Typography variant="caption" color="text.secondary">
                                    {t('wizard.targets.inheritedFromProject')}
                                  </Typography>
                                )}
                              </Stack>
                            </TableCell>
                          </TableRow>
                        );
                      }),
                    ])}
                  </TableBody>
                </Table>
              </Box>
            </Collapse>
          </Box>
        );
      })}

      <Alert severity="info" variant="outlined" sx={{ py: 0.25 }}>
        <Typography variant="caption">{t('wizard.targets.legend')}</Typography>
      </Alert>
      {draft.scope === 'network' && <NetworkCommonPointsPanel draft={draft} update={update} onError={onError} />}
    </Stack>
  );
}
