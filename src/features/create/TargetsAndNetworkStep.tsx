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
          <Typography variant="h2">Targets & measurement setup</Typography>
          <Typography variant="body2" color="text.secondary">
            Review target identity, processing usage and measurement corrections. Technical BTM identifiers remain visible without
            occupying separate columns.
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap justifyContent={{ md: 'flex-end' }}>
          <Chip size="small" label={`${summary.total} targets`} />
          <Chip size="small" color="info" variant="outlined" label={`${summary.included} adjusted`} />
          <Chip size="small" color="success" variant="outlined" label={`${summary.published} published`} />
          {summary.reviewRequired > 0 && (
            <Chip size="small" color="warning" variant="outlined" label={`${summary.reviewRequired} to review`} />
          )}
        </Stack>
      </Stack>

      <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} flexWrap="wrap" useFlexGap>
          <TextField
            size="small"
            label="Search target or BTM ID"
            placeholder="Target, station, engine, sensor, Hz/Vz/Sd…"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              resetPage();
            }}
            sx={{ minWidth: { xs: '100%', sm: 280 }, flex: { sm: '1 1 300px' } }}
          />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel id="target-station-filter">Station</InputLabel>
            <Select
              labelId="target-station-filter"
              label="Station"
              value={stationFilter}
              onChange={(event) => {
                setStationFilter(event.target.value);
                resetPage();
              }}
            >
              <MenuItem value="all">All stations</MenuItem>
              {stations.map((stationCode) => (
                <MenuItem key={stationCode} value={stationCode}>{stationCode}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="target-role-filter">Role</InputLabel>
            <Select
              labelId="target-role-filter"
              label="Role"
              value={roleFilter}
              onChange={(event) => {
                setRoleFilter(event.target.value as TargetFilter);
                resetPage();
              }}
            >
              <MenuItem value="all">All roles</MenuItem>
              <MenuItem value="reference">Reference</MenuItem>
              <MenuItem value="monitoring">Monitoring</MenuItem>
              <MenuItem value="auxiliary">Auxiliary</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="target-measurement-filter">Measurement</InputLabel>
            <Select
              labelId="target-measurement-filter"
              label="Measurement"
              value={measurementFilter}
              onChange={(event) => {
                setMeasurementFilter(event.target.value as MeasurementFilter);
                resetPage();
              }}
            >
              <MenuItem value="all">All types</MenuItem>
              <MenuItem value="prism">Prism</MenuItem>
              <MenuItem value="reflective-sheet">Reflective sheet</MenuItem>
              <MenuItem value="reflectorless">Reflectorless</MenuItem>
            </Select>
          </FormControl>
          <Chip size="small" variant="outlined" label={`${rows.length} visible`} />
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
            aria-label="Target measurement setup"
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
                  Target & source
                </TableCell>
                <TableCell sx={{ width: 118 }}>Usage</TableCell>
                <TableCell sx={{ width: 205 }}>Processing identity</TableCell>
                <TableCell sx={{ width: 210 }}>Measurement setup</TableCell>
                <TableCell sx={{ width: 275 }}>Prism correction · mm</TableCell>
                <TableCell sx={{ width: 120 }}>Target height · m</TableCell>
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
                            label={target.reviewStatus === 'ok' ? 'Ready' : target.reviewStatus === 'to-review' ? 'Review' : 'Blocking'}
                            sx={{ height: 22 }}
                          />
                        </Stack>
                        <Typography variant="body2" fontWeight={750} noWrap title={target.rawTargetName}>
                          {target.rawTargetName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35 }}>
                          {catalogue ? `Sensor ${catalogue.prismSensorId}` : 'Sensor metadata loading…'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35 }}>
                          {catalogue
                            ? `Hz ${catalogue.hzVariableId} · Vz ${catalogue.vzVariableId} · Sd ${catalogue.sdVariableId}`
                            : 'Hz · Vz · Sd identifiers unavailable'}
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
                              inputProps={{ 'aria-label': `Adjust ${target.rawTargetName}` }}
                            />
                          )}
                          label="Adjust"
                          sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: 12.5 } }}
                        />
                        <FormControlLabel
                          control={(
                            <Checkbox
                              size="small"
                              checked={target.publishOutput}
                              onChange={(event) => patchTarget(index, { publishOutput: event.target.checked })}
                              inputProps={{ 'aria-label': `Publish ${target.rawTargetName}` }}
                            />
                          )}
                          label="Publish"
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
                            inputProps={{ 'aria-label': `Role ${target.rawTargetName}` }}
                          >
                            <MenuItem value="reference">Reference</MenuItem>
                            <MenuItem value="monitoring">Monitoring</MenuItem>
                            <MenuItem value="auxiliary">Auxiliary</MenuItem>
                          </Select>
                        </FormControl>
                        <TextField
                          size="small"
                          label="Engine name"
                          value={target.engineName}
                          onChange={(event) => patchTarget(index, { engineName: event.target.value })}
                          inputProps={{ 'aria-label': `Engine name ${target.rawTargetName}` }}
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
                            inputProps={{ 'aria-label': `Measurement type ${target.rawTargetName}` }}
                          >
                            <MenuItem value="prism">Prism</MenuItem>
                            <MenuItem value="reflective-sheet">Reflective sheet</MenuItem>
                            <MenuItem value="reflectorless">Reflectorless</MenuItem>
                          </Select>
                        </FormControl>
                        <FormControl size="small" fullWidth>
                          <Select
                            value={target.edmMode}
                            onChange={(event) => patchTarget(index, { edmMode: event.target.value })}
                            inputProps={{ 'aria-label': `EDM mode ${target.rawTargetName}` }}
                          >
                            {target.measurementType === 'reflectorless' ? [
                              <MenuItem key="fine-non-prism" value="fine-non-prism">Fine · no prism</MenuItem>,
                              <MenuItem key="standard-non-prism" value="standard-non-prism">Standard · no prism</MenuItem>,
                            ] : [
                              <MenuItem key="precise-prism" value="precise-prism">Precise · prism</MenuItem>,
                              <MenuItem key="fine-prism" value="fine-prism">Fine · prism</MenuItem>,
                              <MenuItem key="standard-prism" value="standard-prism">Standard · prism</MenuItem>,
                            ]}
                          </Select>
                        </FormControl>
                      </Stack>
                    </TableCell>

                    <TableCell>
                      {target.measurementType === 'reflectorless' ? (
                        <Stack spacing={0.5} alignItems="flex-start">
                          <Chip size="small" variant="outlined" label="Not applicable" />
                          <Typography variant="caption" color="text.secondary">
                            Reflectorless measurements do not use a prism constant.
                          </Typography>
                        </Stack>
                      ) : (
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr .9fr', gap: 0.75, alignItems: 'start' }}>
                          <TextField
                            size="small"
                            type="number"
                            label="Required"
                            value={valueForNumberInput(target.requiredConstantM * 1000, 1)}
                            onChange={(event) => patchTarget(index, { requiredConstantM: Number(event.target.value) / 1000 })}
                            inputProps={{ step: 0.1, 'aria-label': `Required constant ${target.rawTargetName}` }}
                          />
                          <TextField
                            size="small"
                            type="number"
                            label="Applied"
                            value={valueForNumberInput(target.alreadyAppliedConstantM * 1000, 1)}
                            onChange={(event) => patchTarget(index, { alreadyAppliedConstantM: Number(event.target.value) / 1000 })}
                            inputProps={{ step: 0.1, 'aria-label': `Applied constant ${target.rawTargetName}` }}
                          />
                          <Stack spacing={0.4} alignItems="flex-start">
                            <Typography variant="caption" color="text.secondary">BTM Δ</Typography>
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
                        inputProps={{ step: 0.001, 'aria-label': `Target height ${target.rawTargetName}` }}
                        helperText="metres"
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
                      <Typography fontWeight={650}>No target matches the current filters.</Typography>
                      <Typography variant="body2" color="text.secondary">Clear or broaden the search criteria.</Typography>
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
          labelRowsPerPage="Targets per page"
          sx={{ borderTop: '1px solid', borderTopColor: 'divider' }}
        />
      </Box>

      <Alert severity="info" variant="outlined" sx={{ py: 0.25 }}>
        <Typography variant="caption">
          <b>BTM Δ = required constant − already applied constant.</b> Values are edited in millimetres; target height is edited in
          metres. Reflectorless measurements have no prism constant. Metadata comes from BTM lookup, then the preset, then your
          explicit overrides.
        </Typography>
      </Alert>
      {draft.scope === 'network' && <NetworkCommonPointsPanel draft={draft} update={update} onError={onError} />}
    </Stack>
  );
}
