import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Checkbox,
  Chip,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { api } from '@/api/client';
import { useTranslation } from 'react-i18next';
import type { CatalogueTarget } from '@/demo/catalogue';
import type { WizardDraft } from '@/demo/draft';
import { NetworkCommonPointsPanel } from '@/features/create/NetworkCommonPointsPanel';
import {
  buildTargetTableRows,
  paginateTargetRows,
  summarizeTargets,
  targetConstantDeltaMm,
  valueForNumberInput,
  type MeasurementFilter,
  type TargetFilter,
} from '@/features/create/target-table-view-model';

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
  const [stationFilter, setStationFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState<TargetFilter>('all');
  const [measurementFilter, setMeasurementFilter] = useState<MeasurementFilter>('all');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(8);

  const patchTarget = (index: number, patch: Partial<WizardDraft['targets'][number]>) => {
    update({ targets: draft.targets.map((target, targetIndex) => targetIndex === index ? { ...target, ...patch } : target) });
  };
  const resetPage = () => setPage(0);
  const stations = useMemo(
    () => [...new Set(draft.targets.map((target) => target.stationCode))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [draft.targets],
  );
  const rows = useMemo(
    () => buildTargetTableRows(draft.targets, infoByKey, {
      search: filter,
      stationCode: stationFilter,
      role: roleFilter,
      measurementType: measurementFilter,
    }),
    [draft.targets, filter, infoByKey, measurementFilter, roleFilter, stationFilter],
  );
  const visibleRows = useMemo(() => paginateTargetRows(rows, page, rowsPerPage), [page, rows, rowsPerPage]);
  const summary = useMemo(() => summarizeTargets(draft.targets), [draft.targets]);
  const maxPage = Math.max(0, Math.ceil(rows.length / rowsPerPage) - 1);

  useEffect(() => {
    if (page > maxPage) setPage(maxPage);
  }, [maxPage, page]);

  return (
    <Stack spacing={1.5}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        justifyContent="space-between"
        alignItems={{ md: 'flex-start' }}
      >
        <Box>
          <Typography variant="h2">{t('targets.title')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('targets.help')}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap justifyContent={{ md: 'flex-end' }}>
          <Chip size="small" label={t('common.targetCount', { count: summary.total })} />
          <Chip size="small" color="info" variant="outlined" label={t('targets.summary.adjusted', { count: summary.included })} />
          <Chip size="small" color="success" variant="outlined" label={t('targets.summary.published', { count: summary.published })} />
          {summary.reviewRequired > 0 && (
            <Chip size="small" color="warning" variant="outlined" label={t('targets.summary.review', { count: summary.reviewRequired })} />
          )}
        </Stack>
      </Stack>

      <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} flexWrap="wrap" useFlexGap>
          <TextField
            size="small"
            label={t('targets.search')}
            placeholder={t('targets.searchPlaceholder')}
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              resetPage();
            }}
            sx={{ minWidth: { xs: '100%', sm: 280 }, flex: { sm: '1 1 300px' } }}
          />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel id="target-station-filter">{t('targets.station')}</InputLabel>
            <Select
              labelId="target-station-filter"
              label={t('targets.station')}
              value={stationFilter}
              onChange={(event) => {
                setStationFilter(event.target.value);
                resetPage();
              }}
            >
              <MenuItem value="all">{t('targets.allStations')}</MenuItem>
              {stations.map((stationCode) => (
                <MenuItem key={stationCode} value={stationCode}>{stationCode}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="target-role-filter">{t('targets.role')}</InputLabel>
            <Select
              labelId="target-role-filter"
              label={t('targets.role')}
              value={roleFilter}
              onChange={(event) => {
                setRoleFilter(event.target.value as TargetFilter);
                resetPage();
              }}
            >
              <MenuItem value="all">{t('targets.allRoles')}</MenuItem>
              <MenuItem value="reference">{t('enums.role.reference')}</MenuItem>
              <MenuItem value="monitoring">{t('enums.role.monitoring')}</MenuItem>
              <MenuItem value="auxiliary">{t('enums.role.auxiliary')}</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="target-measurement-filter">{t('targets.measurement')}</InputLabel>
            <Select
              labelId="target-measurement-filter"
              label={t('targets.measurement')}
              value={measurementFilter}
              onChange={(event) => {
                setMeasurementFilter(event.target.value as MeasurementFilter);
                resetPage();
              }}
            >
              <MenuItem value="all">{t('targets.allTypes')}</MenuItem>
              <MenuItem value="prism">{t('enums.measurement.prism')}</MenuItem>
              <MenuItem value="reflective-sheet">{t('enums.measurement.reflective-sheet')}</MenuItem>
              <MenuItem value="reflectorless">{t('enums.measurement.reflectorless')}</MenuItem>
            </Select>
          </FormControl>
          <Chip size="small" variant="outlined" label={t('targets.visible', { count: rows.length })} />
        </Stack>
      </Paper>

      <Box
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          overflow: 'hidden',
          bgcolor: 'background.paper',
        }}
      >
        <Box sx={{ overflow: 'auto', maxHeight: 680 }}>
          <Table
            size="small"
            stickyHeader
            aria-label={t('targets.tableLabel')}
            data-testid="targets-measurements-table"
            sx={{ minWidth: 1040, tableLayout: 'fixed' }}
          >
            <TableHead>
              <TableRow
                sx={{
                  '& th': {
                    bgcolor: 'grey.100',
                    color: 'text.secondary',
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '.045em',
                    lineHeight: 1.2,
                    py: 1.1,
                    textTransform: 'uppercase',
                  },
                }}
              >
                <TableCell
                  sx={{
                    width: 245,
                    position: 'sticky',
                    left: 0,
                    zIndex: 4,
                    borderRight: '1px solid',
                    borderRightColor: 'divider',
                  }}
                >
                  {t('targets.columns.target')}
                </TableCell>
                <TableCell sx={{ width: 118 }}>{t('targets.columns.usage')}</TableCell>
                <TableCell sx={{ width: 205 }}>{t('targets.columns.identity')}</TableCell>
                <TableCell sx={{ width: 210 }}>{t('targets.columns.setup')}</TableCell>
                <TableCell sx={{ width: 275 }}>{t('targets.columns.correction')}</TableCell>
                <TableCell sx={{ width: 120 }}>{t('targets.columns.height')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleRows.map(({ target, index, catalogue }) => {
                const deltaMm = targetConstantDeltaMm(target);
                const hasCorrection = Math.abs(deltaMm) >= 0.05;
                return (
                  <TableRow
                    key={`${target.stationCode}|${target.rawTargetName}`}
                    hover
                    sx={{
                      opacity: target.includeInAdjustment ? 1 : 0.68,
                      '& td': { py: 1, verticalAlign: 'top' },
                    }}
                  >
                    <TableCell
                      sx={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 2,
                        bgcolor: 'background.paper',
                        borderRight: '1px solid',
                        borderRightColor: 'divider',
                      }}
                    >
                      <Stack spacing={0.35}>
                        <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap" useFlexGap>
                          <Chip size="small" variant="outlined" label={target.stationCode} sx={{ height: 22 }} />
                          <Chip
                            size="small"
                            variant="outlined"
                            color={target.reviewStatus === 'blocking' ? 'error' : target.reviewStatus === 'to-review' ? 'warning' : 'default'}
                            label={target.reviewStatus === 'ok' ? t('targets.ready') : target.reviewStatus === 'to-review' ? t('targets.review') : t('targets.blocking')}
                            sx={{ height: 22 }}
                          />
                        </Stack>
                        <Typography variant="body2" fontWeight={750} noWrap title={target.rawTargetName}>
                          {target.rawTargetName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35 }}>
                          {catalogue ? t('targets.sensor', { id: catalogue.prismSensorId }) : t('targets.sensorLoading')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35 }}>
                          {catalogue
                            ? t('targets.variables', { hz: catalogue.hzVariableId, vz: catalogue.vzVariableId, sd: catalogue.sdVariableId })
                            : t('targets.variablesMissing')}
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
                              inputProps={{ 'aria-label': t('targets.adjustAria', { target: target.rawTargetName }) }}
                            />
                          )}
                          label={t('targets.adjust')}
                          sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: 12.5 } }}
                        />
                        <FormControlLabel
                          control={(
                            <Checkbox
                              size="small"
                              checked={target.publishOutput}
                              onChange={(event) => patchTarget(index, { publishOutput: event.target.checked })}
                              inputProps={{ 'aria-label': t('targets.publishAria', { target: target.rawTargetName }) }}
                            />
                          )}
                          label={t('targets.publish')}
                          sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: 12.5 } }}
                        />
                      </Stack>
                    </TableCell>

                    <TableCell>
                      <Stack spacing={0.75}>
                        <FormControl size="small" fullWidth>
                          <Select
                            value={target.role}
                            onChange={(event) => patchTarget(index, { role: event.target.value as typeof target.role })}
                            inputProps={{ 'aria-label': t('targets.roleAria', { target: target.rawTargetName }) }}
                          >
                            <MenuItem value="reference">{t('enums.role.reference')}</MenuItem>
                            <MenuItem value="monitoring">{t('enums.role.monitoring')}</MenuItem>
                            <MenuItem value="auxiliary">{t('enums.role.auxiliary')}</MenuItem>
                          </Select>
                        </FormControl>
                        <TextField
                          size="small"
                          label={t('targets.engineName')}
                          value={target.engineName}
                          onChange={(event) => patchTarget(index, { engineName: event.target.value })}
                          inputProps={{ 'aria-label': t('targets.engineNameAria', { target: target.rawTargetName }) }}
                        />
                      </Stack>
                    </TableCell>

                    <TableCell>
                      <Stack spacing={0.75}>
                        <FormControl size="small" fullWidth>
                          <Select
                            value={target.measurementType}
                            onChange={(event) => {
                              const measurementType = event.target.value as typeof target.measurementType;
                              patchTarget(index, {
                                measurementType,
                                edmMode: measurementType === 'reflectorless' ? 'fine-non-prism' : 'precise-prism',
                                ...(measurementType === 'reflectorless'
                                  ? { requiredConstantM: 0, alreadyAppliedConstantM: 0 }
                                  : {}),
                              });
                            }}
                            inputProps={{ 'aria-label': t('targets.measurementAria', { target: target.rawTargetName }) }}
                          >
                            <MenuItem value="prism">{t('enums.measurement.prism')}</MenuItem>
                            <MenuItem value="reflective-sheet">{t('enums.measurement.reflective-sheet')}</MenuItem>
                            <MenuItem value="reflectorless">{t('enums.measurement.reflectorless')}</MenuItem>
                          </Select>
                        </FormControl>
                        <FormControl size="small" fullWidth>
                          <Select
                            value={target.edmMode}
                            onChange={(event) => patchTarget(index, { edmMode: event.target.value })}
                            inputProps={{ 'aria-label': t('targets.edmAria', { target: target.rawTargetName }) }}
                          >
                            {target.measurementType === 'reflectorless' ? [
                              <MenuItem key="fine-non-prism" value="fine-non-prism">{t('targets.edm.fine-non-prism')}</MenuItem>,
                              <MenuItem key="standard-non-prism" value="standard-non-prism">{t('targets.edm.standard-non-prism')}</MenuItem>,
                            ] : [
                              <MenuItem key="precise-prism" value="precise-prism">{t('targets.edm.precise-prism')}</MenuItem>,
                              <MenuItem key="fine-prism" value="fine-prism">{t('targets.edm.fine-prism')}</MenuItem>,
                              <MenuItem key="standard-prism" value="standard-prism">{t('targets.edm.standard-prism')}</MenuItem>,
                            ]}
                          </Select>
                        </FormControl>
                      </Stack>
                    </TableCell>

                    <TableCell>
                      {target.measurementType === 'reflectorless' ? (
                        <Stack spacing={0.5} alignItems="flex-start">
                          <Chip size="small" variant="outlined" label={t('targets.notApplicable')} />
                          <Typography variant="caption" color="text.secondary">
                            {t('targets.reflectorlessHelp')}
                          </Typography>
                        </Stack>
                      ) : (
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr .9fr', gap: 0.75, alignItems: 'start' }}>
                          <TextField
                            size="small"
                            type="number"
                            label={t('targets.requiredConstant')}
                            value={valueForNumberInput(target.requiredConstantM * 1000, 1)}
                            onChange={(event) => patchTarget(index, { requiredConstantM: Number(event.target.value) / 1000 })}
                            inputProps={{ step: 0.1, 'aria-label': t('targets.requiredAria', { target: target.rawTargetName }) }}
                          />
                          <TextField
                            size="small"
                            type="number"
                            label={t('targets.appliedConstant')}
                            value={valueForNumberInput(target.alreadyAppliedConstantM * 1000, 1)}
                            onChange={(event) => patchTarget(index, { alreadyAppliedConstantM: Number(event.target.value) / 1000 })}
                            inputProps={{ step: 0.1, 'aria-label': t('targets.appliedAria', { target: target.rawTargetName }) }}
                          />
                          <Stack spacing={0.4} alignItems="flex-start">
                            <Typography variant="caption" color="text.secondary">{t('targets.btmDelta')}</Typography>
                            <Chip
                              size="small"
                              color={hasCorrection ? 'warning' : 'success'}
                              variant={hasCorrection ? 'filled' : 'outlined'}
                              label={`${deltaMm > 0 ? '+' : ''}${deltaMm.toFixed(1)}`}
                            />
                          </Stack>
                        </Box>
                      )}
                    </TableCell>

                    <TableCell>
                      <TextField
                        size="small"
                        type="number"
                        value={valueForNumberInput(target.targetHeightM, 3)}
                        onChange={(event) => patchTarget(index, { targetHeightM: Number(event.target.value) })}
                        inputProps={{ step: 0.001, 'aria-label': t('targets.heightAria', { target: target.rawTargetName }) }}
                        helperText={t('targets.metres')}
                        FormHelperTextProps={{ sx: { mx: 0, mt: 0.35, fontSize: 10.5 } }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              {visibleRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Box sx={{ py: 5, textAlign: 'center' }}>
                      <Typography fontWeight={650}>{t('targets.empty')}</Typography>
                      <Typography variant="body2" color="text.secondary">{t('targets.emptyHelp')}</Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
        <TablePagination
          component="div"
          count={rows.length}
          page={page}
          rowsPerPage={rowsPerPage}
          rowsPerPageOptions={[8, 16, 32]}
          onPageChange={(_, nextPage) => setPage(nextPage)}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(Number(event.target.value));
            setPage(0);
          }}
          labelRowsPerPage={t('targets.perPage')}
          sx={{ borderTop: '1px solid', borderTopColor: 'divider' }}
        />
      </Box>

      <Alert severity="info" variant="outlined" sx={{ py: 0.25 }}>
        <Typography variant="caption">
          {t('targets.correctionHelp')}
        </Typography>
      </Alert>
      {draft.scope === 'network' && <NetworkCommonPointsPanel draft={draft} update={update} onError={onError} />}
    </Stack>
  );
}
