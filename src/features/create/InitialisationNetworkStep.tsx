import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { api } from '@/api/client';
import type { CatalogueReference } from '@/demo/catalogue';
import type { WizardDraft } from '@/demo/draft';
import { InitialCoordinatesNetworkView } from '@/features/create/InitialCoordinatesNetworkView';
import { ObservationCycleRangePicker, type ObservationCycles } from '@/features/create/ObservationCycleRangePicker';
import { StatusChip, UnitField } from '@/features/shared/components';
import { useTranslation } from 'react-i18next';

interface CatalogueResponse {
  references: CatalogueReference[];
}

export function InitialisationNetworkStep({
  draft,
  setDraft,
  update,
  onError,
}: {
  draft: WizardDraft;
  setDraft: (draft: WizardDraft) => void;
  update: (patch: Partial<WizardDraft>) => void;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const catalogue = useQuery({
    queryKey: ['catalogue'],
    queryFn: () => api<CatalogueResponse>('GET', '/api/v2/catalogue'),
  });
  const cycles = useQuery({
    queryKey: ['observation-cycles', draft.id, draft.stationCodes[0]],
    queryFn: () => api<ObservationCycles>('GET', `/api/v2/drafts/${draft.id}/observation-cycles`),
    enabled: draft.stationCodes.length > 0,
  });
  const compute = useMutation({
    mutationFn: () => api<WizardDraft['initialisation']['result']>('POST', `/api/v2/drafts/${draft.id}/initialisation/compute`),
    onSuccess: (result) => setDraft({ ...draft, initialisation: { ...draft.initialisation, result } }),
    onError: (error) => onError(String(error)),
  });
  const init = draft.initialisation;
  const normalizedCycleCatalogue = useRef<string>();
  const patchInit = (patch: Partial<WizardDraft['initialisation']>) =>
    update({ initialisation: { ...init, ...patch, result: patch.result ?? undefined } });
  const availableRefs = (catalogue.data?.references ?? []).filter((reference) =>
    draft.targets.some((target) =>
      target.rawTargetName === reference.pointName && draft.stationCodes.includes(target.stationCode),
    ),
  );
  const addReference = (reference: CatalogueReference) => {
    const target = draft.targets.find((item) => item.rawTargetName === reference.pointName);
    if (!target) return;
    patchInit({
      references: [
        ...init.references,
        {
          pointKey: target.engineName,
          eastingM: reference.eastingM,
          northingM: reference.northingM,
          heightM: reference.heightM,
          modeE: 'weak',
          modeN: 'weak',
          modeH: 'weak',
          sigmaM: reference.sigmaM,
          source: t('initialisation.referenceSource', { dataset: reference.datasetId }),
        },
      ],
    });
  };

  useEffect(() => {
    const epochs = cycles.data?.epochs ?? [];
    if (epochs.length === 0) return;
    const catalogueKey = `${cycles.data?.stationCode}|${epochs[0]}|${epochs.at(-1)}`;
    if (normalizedCycleCatalogue.current === catalogueKey) return;
    normalizedCycleCatalogue.current = catalogueKey;

    const fromIsExisting = epochs.includes(init.windowFrom);
    const toIsExisting = epochs.includes(init.windowTo);
    if (fromIsExisting && toIsExisting && init.windowFrom <= init.windowTo) return;

    let normalizedFrom = epochs.find((epoch) => epoch >= init.windowFrom) ?? epochs[0];
    let normalizedTo = [...epochs].reverse().find((epoch) => epoch <= init.windowTo) ?? epochs.at(-1)!;
    if (normalizedFrom > normalizedTo) {
      normalizedFrom = epochs[0];
      normalizedTo = epochs.at(-1)!;
    }
    update({
      initialisation: {
        ...init,
        windowFrom: normalizedFrom,
        windowTo: normalizedTo,
        result: undefined,
      },
    });
  }, [cycles.data?.epochs, cycles.data?.stationCode, init, update]);

  const rangeIsValid = useMemo(() => {
    const epochs = cycles.data?.epochs ?? [];
    return epochs.includes(init.windowFrom) && epochs.includes(init.windowTo) && init.windowFrom <= init.windowTo;
  }, [cycles.data?.epochs, init.windowFrom, init.windowTo]);

  return (
    <Stack spacing={2}>
      <Typography variant="h2">{t('initialisation.title')}</Typography>
      <RadioGroup row value={init.mode} onChange={(event) => patchInit({ mode: event.target.value as typeof init.mode })}>
        <FormControlLabel value="local-anchor" control={<Radio />} label={t('initialisation.localMode')} />
        <FormControlLabel value="known-references" control={<Radio />} label={t('initialisation.knownMode')} />
      </RadioGroup>

      {init.mode === 'local-anchor' ? (
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="anchor-station">{t('initialisation.anchorStation')}</InputLabel>
            <Select labelId="anchor-station" label={t('initialisation.anchorStation')} value={init.anchorStationCode ?? ''} onChange={(event) => patchInit({ anchorStationCode: event.target.value })}>
              {draft.stationCodes.map((stationCode) => <MenuItem key={stationCode} value={stationCode}>{stationCode}</MenuItem>)}
            </Select>
          </FormControl>
          <UnitField label={t('initialisation.easting')} unit="m" value={init.anchorEastingM} onChange={(value) => patchInit({ anchorEastingM: value })} />
          <UnitField label={t('initialisation.northing')} unit="m" value={init.anchorNorthingM} onChange={(value) => patchInit({ anchorNorthingM: value })} />
          <UnitField label={t('initialisation.height')} unit="m" value={init.anchorHeightM} onChange={(value) => patchInit({ anchorHeightM: value })} />
          <UnitField label={t('initialisation.orientation')} unit="°" value={init.anchorOrientationDeg} onChange={(value) => patchInit({ anchorOrientationDeg: value })} step={0.0001} />
          <Chip size="small" label={t('initialisation.localZero')} variant="outlined" />
        </Stack>
      ) : (
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary">
            {t('initialisation.knownHelp')}
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {availableRefs.map((reference) => {
              const engineName = draft.targets.find((target) => target.rawTargetName === reference.pointName)?.engineName;
              const used = init.references.some((item) => item.pointKey === engineName);
              return (
                <Chip
                  key={`${reference.datasetId}-${reference.pointName}`}
                  label={`${reference.pointName} (σ ${(reference.sigmaM * 1000).toFixed(1)} mm)`}
                  color={used ? 'success' : 'default'}
                  onClick={() => !used && addReference(reference)}
                  onDelete={used ? () => patchInit({ references: init.references.filter((item) => item.pointKey !== engineName) }) : undefined}
                />
              );
            })}
          </Stack>
          {init.references.length > 0 && (
            <Typography variant="caption">{t('initialisation.referenceCount', { count: init.references.length })}</Typography>
          )}
        </Stack>
      )}

      {cycles.isLoading && <Typography variant="body2">{t('initialisation.loadingCycles')}</Typography>}
      {cycles.isError && <Alert severity="error">{t('initialisation.cyclesError')}</Alert>}
      {cycles.data && (
        <ObservationCycleRangePicker
          cycles={cycles.data}
          from={init.windowFrom}
          to={init.windowTo}
          onChange={(range) => patchInit({
            ...(range.from ? { windowFrom: range.from } : {}),
            ...(range.to ? { windowTo: range.to } : {}),
          })}
        />
      )}

      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <Button
          variant="contained"
          onClick={() => compute.mutate()}
          disabled={compute.isPending || !rangeIsValid}
          data-testid="compute-initialisation"
        >
          {compute.isPending ? t('initialisation.computing') : t('initialisation.compute')}
        </Button>
        {!rangeIsValid && cycles.data && <Typography variant="caption" color="error">{t('initialisation.invalidRange')}</Typography>}
      </Stack>
      <Alert severity="info" variant="outlined">
        {t('initialisation.periodHelp')}
      </Alert>

      {init.result && (
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" color="info" label={t('initialisation.coveragePairs', { available: init.result.coverage.availableStationTargetPairs, expected: init.result.coverage.expectedStationTargetPairs })} />
            <Chip size="small" color="info" label={t('initialisation.coveragePoints', { available: init.result.coverage.availablePhysicalPoints, expected: init.result.coverage.expectedPhysicalPoints })} />
            <Chip size="small" label={t('initialisation.coverageObservations', { observations: init.result.coverage.observationsUsed, medians: init.result.coverage.representativeCount })} />
            <Chip size="small" label={t('initialisation.retained', { from: init.result.coverage.retainedFrom ?? '—', to: init.result.coverage.retainedTo ?? '—' })} />
          </Stack>
          {init.result.coverage.missingStationTargets.length > 0 && (
            <Alert severity="warning">{t('initialisation.missingPairs', { pairs: init.result.coverage.missingStationTargets.join(', ') })}</Alert>
          )}
          {init.result.failures.map((failure) => (
            <Alert key={failure.subject} severity="error">{failure.reason}</Alert>
          ))}

          {draft.scope === 'network' && <InitialCoordinatesNetworkView draft={draft} />}

          <Stack spacing={0.5}>
            <Typography variant="subtitle2">{t('initialisation.stationSolutions')}</Typography>
            {init.result.stationSolutions.map((station) => (
              <Typography key={station.stationCode} variant="body2">
                <b>{station.stationCode}</b>: {t('initialisation.stationSolution', { easting: station.eastingM.toFixed(4), northing: station.northingM.toFixed(4), height: station.heightM.toFixed(4), orientation: station.orientationDeg.toFixed(4), source: station.source })}
                {station.problems.length > 0 ? ` — ${station.problems.join('; ')}` : ''}
              </Typography>
            ))}
          </Stack>

          <Box sx={{ overflowX: 'auto', maxHeight: 300, overflowY: 'auto' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>{t('initialisation.columns.point')}</TableCell>
                  <TableCell align="right">E (m)</TableCell>
                  <TableCell align="right">N (m)</TableCell>
                  <TableCell align="right">H (m)</TableCell>
                  <TableCell align="right">{t('initialisation.columns.stations')}</TableCell>
                  <TableCell align="right">{t('initialisation.columns.observations')}</TableCell>
                  <TableCell align="right">{t('initialisation.columns.horizontalSpread')}</TableCell>
                  <TableCell align="right">{t('initialisation.columns.verticalSpread')}</TableCell>
                  <TableCell>{t('initialisation.columns.status')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {init.result.coordinates.map((coordinate) => (
                  <TableRow key={coordinate.pointKey} hover>
                    <TableCell>{coordinate.pointKey}</TableCell>
                    <TableCell align="right">{coordinate.eastingM.toFixed(4)}</TableCell>
                    <TableCell align="right">{coordinate.northingM.toFixed(4)}</TableCell>
                    <TableCell align="right">{coordinate.heightM.toFixed(4)}</TableCell>
                    <TableCell align="right">{coordinate.stationCount}</TableCell>
                    <TableCell align="right">{coordinate.observationCount}</TableCell>
                    <TableCell align="right">{(coordinate.horizontalSpreadM * 1000).toFixed(1)}</TableCell>
                    <TableCell align="right">{(coordinate.verticalSpreadM * 1000).toFixed(1)}</TableCell>
                    <TableCell><StatusChip status={coordinate.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Button
            variant="contained"
            color="success"
            disabled={init.result.accepted || init.result.failures.length > 0}
            onClick={() => patchInit({ result: { ...init.result!, accepted: true } })}
            data-testid="use-as-initial"
            sx={{ alignSelf: 'flex-start' }}
          >
            {init.result.accepted ? t('initialisation.accepted') : t('initialisation.use')}
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
