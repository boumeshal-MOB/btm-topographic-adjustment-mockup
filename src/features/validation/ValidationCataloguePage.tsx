import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import {
  ValidationCatalogueError,
  loadValidationDataset,
  loadValidationManifest,
  loadedShardFiles,
} from '@/demo/validation-catalogue-gateway';
import {
  buildImportPlan,
  type FaceReductionPolicy,
} from '@/domain/validation-catalogue/adapter';
import { sealDataset } from '@/domain/validation-catalogue/blind-mode';
import type { ValidationManifestEntry } from '@/domain/validation-catalogue/schema';
import type { StoredVersion } from '@/features/shared/types';
import type { TopographicAdjustmentProcessing } from '@/domain/entities';

interface ValidationSessionSummary {
  processingId: number;
  datasetId: string;
  hydrated: boolean;
}

interface Filters {
  search: string;
  stations: string;
  scenario: string;
  template: string;
  composition: string;
}

const EMPTY_FILTERS: Filters = {
  search: '',
  stations: 'any',
  scenario: 'any',
  template: 'any',
  composition: 'any',
};

/**
 * Catalogue browser.
 *
 * Loads the 56 kB manifest only; a 0.3–1.3 MB shard is fetched when a dataset is actually opened,
 * so the 12 MB catalogue never reaches the initial bundle.
 *
 * Blind mode is on by default and is a *data* decision, not a display toggle: the dataset handed
 * to the importer is sealed, so the scenario column and the imported session both stay blind until
 * the answer is deliberately revealed.
 */
export default function ValidationCataloguePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [blind, setBlind] = useState(true);
  const [pending, setPending] = useState<ValidationManifestEntry>();
  const [faceReduction, setFaceReduction] = useState<FaceReductionPolicy>('none');
  const [importError, setImportError] = useState<string>();

  const manifest = useQuery({
    queryKey: ['validation-manifest'],
    queryFn: ({ signal }) => loadValidationManifest(signal),
    staleTime: Infinity,
  });

  const sessions = useQuery({
    queryKey: ['validation-sessions'],
    queryFn: () => api<ValidationSessionSummary[]>('GET', '/api/v2/validation-sessions'),
  });

  const sessionByDataset = useMemo(
    () => new Map((sessions.data ?? []).map((session) => [session.datasetId, session])),
    [sessions.data],
  );

  const scenarios = useMemo(() => {
    const present = new Set((manifest.data?.datasets ?? []).map((entry) => entry.primaryScenario));
    return [...present].sort();
  }, [manifest.data]);

  const rows = useMemo(() => {
    const entries = manifest.data?.datasets ?? [];
    const needle = filters.search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (needle && !entry.id.toLowerCase().includes(needle)) return false;
      if (filters.stations !== 'any' && String(entry.stationCount) !== filters.stations) return false;
      if (filters.scenario !== 'any' && entry.primaryScenario !== filters.scenario) return false;
      if (filters.template !== 'any' && entry.template !== filters.template) return false;
      if (filters.composition === 'isolated' && entry.combined) return false;
      if (filters.composition === 'combined' && !entry.combined) return false;
      return true;
    });
  }, [manifest.data, filters]);

  const importDataset = useMutation({
    mutationFn: async ({ entry, policy }: { entry: ValidationManifestEntry; policy: FaceReductionPolicy }) => {
      const dataset = await loadValidationDataset(entry);
      // Sealing before conversion means no component downstream can render the answer, even by
      // accident: the plan is built from the blind dataset only.
      const usable = blind ? sealDataset(dataset).blind : dataset;
      const plan = buildImportPlan(usable, entry.template, { faceReduction: policy });
      return api<{ processing: TopographicAdjustmentProcessing; version: StoredVersion }>(
        'POST',
        '/api/v2/validation-sessions',
        { plan, title: `${entry.id} · ${entry.stationCount}-station validation case` },
      );
    },
    onSuccess: ({ processing }) => {
      setPending(undefined);
      void queryClient.invalidateQueries({ queryKey: ['validation-sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['processings'] });
      navigate(`/processing/topographic-adjustment/${processing.id}/analysis`);
    },
    onError: (error) => setImportError(errorMessage(error, t)),
  });

  const filtersActive = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  const scenarioLabel = (scenario: string) =>
    t(`validation.scenarios.${scenario}`, { defaultValue: scenario });

  if (manifest.isLoading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Stack spacing={2} alignItems="center">
          <CircularProgress aria-label={t('validation.states.loading')} />
          <Typography color="text.secondary">{t('validation.states.loading')}</Typography>
        </Stack>
      </Container>
    );
  }

  if (manifest.isError || !manifest.data) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert
          severity="error"
          action={<Button onClick={() => void manifest.refetch()}>{t('validation.states.retry')}</Button>}
        >
          <AlertTitle>{t('validation.states.error')}</AlertTitle>
          {errorMessage(manifest.error, t)}
        </Alert>
      </Container>
    );
  }

  const catalogue = manifest.data;

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'flex-start' }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h1">{t('validation.title')}</Typography>
            <Typography color="text.secondary">{t('validation.subtitle')}</Typography>
          </Box>
          {/* The tooltip wraps a plain element: putting it on the control itself replaced the
              switch's accessible name with the whole help sentence. */}
          <Stack alignItems="flex-start">
            <FormControlLabel
              control={(
                <Switch
                  checked={blind}
                  onChange={(event) => setBlind(event.target.checked)}
                  inputProps={{ 'aria-label': t('validation.blind.label') }}
                />
              )}
              label={blind ? t('validation.blind.on') : t('validation.blind.off')}
              data-testid="blind-mode-toggle"
            />
            <Tooltip title={t('validation.blind.help')}>
              <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 340 }}>
                {t('validation.blind.help')}
              </Typography>
            </Tooltip>
          </Stack>
        </Stack>

        <Alert severity="info" variant="outlined">
          {t('validation.classification')}{' '}
          {t('validation.loadedShards', {
            count: loadedShardFiles().length,
            total: catalogue.shards.length,
          })}
        </Alert>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1.5}>
            <Typography variant="h2" sx={{ fontSize: '1rem' }}>{t('validation.filters.title')}</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <TextField
                size="small"
                label={t('validation.search')}
                placeholder={t('validation.searchPlaceholder')}
                value={filters.search}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                sx={{ minWidth: 220 }}
                inputProps={{ 'aria-label': t('validation.search') }}
              />
              <FilterSelect
                label={t('validation.filters.stations')}
                value={filters.stations}
                anyLabel={t('validation.filters.any')}
                options={Object.keys(catalogue.distribution.stationCount).sort().map((value) => ({
                  value,
                  label: value,
                }))}
                onChange={(value) => setFilters((current) => ({ ...current, stations: value }))}
              />
              <FilterSelect
                label={t('validation.filters.scenario')}
                value={filters.scenario}
                anyLabel={t('validation.filters.any')}
                options={scenarios.map((value) => ({ value, label: scenarioLabel(value) }))}
                onChange={(value) => setFilters((current) => ({ ...current, scenario: value }))}
                width={260}
              />
              <FilterSelect
                label={t('validation.filters.template')}
                value={filters.template}
                anyLabel={t('validation.filters.any')}
                options={[{ value: 'UK', label: 'UK' }, { value: 'FR', label: 'FR' }]}
                onChange={(value) => setFilters((current) => ({ ...current, template: value }))}
              />
              <FilterSelect
                label={t('validation.filters.composition')}
                value={filters.composition}
                anyLabel={t('validation.filters.any')}
                options={[
                  { value: 'isolated', label: t('validation.filters.isolated') },
                  { value: 'combined', label: t('validation.filters.combined') },
                ]}
                onChange={(value) => setFilters((current) => ({ ...current, composition: value }))}
                width={230}
              />
              {filtersActive && (
                <Button onClick={() => setFilters(EMPTY_FILTERS)}>{t('validation.filters.reset')}</Button>
              )}
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Chip
                size="small"
                variant="outlined"
                label={t('validation.resultCount', { shown: rows.length, total: catalogue.datasets.length })}
                data-testid="validation-result-count"
              />
              <Typography variant="caption" color="text.secondary">{t('validation.canonicalHint')}</Typography>
            </Stack>
          </Stack>
        </Paper>

        {importError && (
          <Alert severity="error" onClose={() => setImportError(undefined)}>{importError}</Alert>
        )}

        {rows.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 4 }}>
            <Stack spacing={1.5} alignItems="flex-start">
              <Typography>{t('validation.states.empty')}</Typography>
              <Button variant="outlined" onClick={() => setFilters(EMPTY_FILTERS)}>
                {t('validation.states.emptyAction')}
              </Button>
            </Stack>
          </Paper>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 620 }}>
            <Table size="small" stickyHeader aria-label={t('validation.title')}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('validation.columns.id')}</TableCell>
                  <TableCell align="right">{t('validation.columns.stations')}</TableCell>
                  <TableCell align="right">{t('validation.columns.references')}</TableCell>
                  <TableCell align="right">{t('validation.columns.sharedPoints')}</TableCell>
                  <TableCell align="right">{t('validation.columns.observations')}</TableCell>
                  <TableCell>{t('validation.columns.template')}</TableCell>
                  <TableCell>{t('validation.columns.scenario')}</TableCell>
                  <TableCell align="right">{t('validation.columns.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((entry) => {
                  const session = sessionByDataset.get(entry.id);
                  const canonical = entry.id === catalogue.canonicalDatasetId;
                  return (
                    <TableRow key={entry.id} hover data-testid={`validation-row-${entry.id}`}>
                      <TableCell>
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          <Typography variant="body2" fontFamily="monospace" fontWeight={canonical ? 800 : 500}>
                            {entry.id}
                          </Typography>
                          {canonical && <Chip size="small" color="success" variant="outlined" label="reference" />}
                        </Stack>
                      </TableCell>
                      <TableCell align="right">{entry.stationCount}</TableCell>
                      <TableCell align="right">{entry.referenceCount}</TableCell>
                      <TableCell align="right">{entry.sharedPointCount}</TableCell>
                      <TableCell align="right">{entry.observationCount}</TableCell>
                      <TableCell>{entry.template}</TableCell>
                      <TableCell>
                        {blind ? (
                          <Chip size="small" variant="outlined" label={t('validation.blind.hidden')} />
                        ) : (
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                            <Chip size="small" label={scenarioLabel(entry.primaryScenario)} />
                            {entry.secondaryScenario && (
                              <Chip
                                size="small"
                                variant="outlined"
                                label={scenarioLabel(entry.secondaryScenario)}
                              />
                            )}
                          </Stack>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {session ? (
                          <Button
                            size="small"
                            onClick={() => navigate(`/processing/topographic-adjustment/${session.processingId}/analysis`)}
                          >
                            {t('validation.import.openExisting')}
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => {
                              setImportError(undefined);
                              setFaceReduction('none');
                              setPending(entry);
                            }}
                            data-testid={`open-${entry.id}`}
                          >
                            {t('validation.import.action')}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Stack>

      <Dialog open={pending !== undefined} onClose={() => !importDataset.isPending && setPending(undefined)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('validation.import.title', { id: pending?.id ?? '' })}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <DialogContentText>{t('validation.import.description')}</DialogContentText>
            {/* Offered for every dataset: whether a Face II reading exists is itself a hint about
                the scenario, so showing the control only sometimes would leak in blind mode. */}
            <FormControl size="small" fullWidth>
              <InputLabel id="face-reduction">{t('validation.import.faceReduction')}</InputLabel>
              <Select
                labelId="face-reduction"
                label={t('validation.import.faceReduction')}
                value={faceReduction}
                onChange={(event) => setFaceReduction(event.target.value as FaceReductionPolicy)}
              >
                <MenuItem value="none">{t('validation.import.faceReductionNone')}</MenuItem>
                <MenuItem value="mean-of-faces">{t('validation.import.faceReductionMean')}</MenuItem>
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary">
              {t('validation.import.faceReductionHelp')}
            </Typography>
            {importDataset.isPending && (
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={18} />
                <Typography variant="body2">
                  {t('validation.states.loadingDataset', { id: pending?.id ?? '' })}
                </Typography>
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(undefined)} disabled={importDataset.isPending}>
            {t('validation.import.cancel')}
          </Button>
          <Button
            variant="contained"
            disabled={importDataset.isPending || !pending}
            onClick={() => pending && importDataset.mutate({ entry: pending, policy: faceReduction })}
            data-testid="confirm-import"
          >
            {importDataset.isPending ? t('validation.import.pending') : t('validation.import.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

function FilterSelect({
  label,
  value,
  anyLabel,
  options,
  onChange,
  width = 160,
}: {
  label: string;
  value: string;
  anyLabel: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  width?: number;
}) {
  const id = `filter-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <FormControl size="small" sx={{ minWidth: width }}>
      <InputLabel id={id}>{label}</InputLabel>
      <Select labelId={id} label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        <MenuItem value="any">{anyLabel}</MenuItem>
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

/** Turns a gateway failure into an explanation of what to do, not a stack trace. */
function errorMessage(error: unknown, t: (key: string) => string): string {
  if (error instanceof ValidationCatalogueError) {
    if (error.kind === 'network') return t('validation.states.errorNetwork');
    if (error.kind === 'schema') return t('validation.states.errorSchema');
    return t('validation.states.errorNotFound');
  }
  return error instanceof Error ? error.message : String(error);
}
