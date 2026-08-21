import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  FormControlLabel,
  IconButton,
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
import type { DraftReference, WizardDraft } from '@/demo/draft';
import { CoordinateCsvImport } from '@/features/create/CoordinateCsvImport';
import { InitialCoordinatesNetworkView } from '@/features/create/InitialCoordinatesNetworkView';
import { ObservationCycleRangePicker, type ObservationCycles } from '@/features/create/ObservationCycleRangePicker';
import { StatusChip, UnitField } from '@/features/shared/components';
import { resolveNetworkCoordinates } from '@/demo/network-coordinates';
import { CoordinateOverrideEditor } from '@/features/create/CoordinateOverrideEditor';
import { fixed, millimetres } from '@/features/shared/format';

interface CatalogueResponse {
  references: CatalogueReference[];
}

/**
 * Initialisation — how the *approximate* coordinates are obtained, and nothing else.
 *
 * The coordinates of the monitored points are not known: they are computed from the known references
 * (the default), typed in, imported, or produced by fixing one station to create a purely local
 * frame. All three are computation devices. What a run holds fixed is a datum decision and belongs to
 * the Adjustment step, so a station fixed here is never fixed there by accident.
 *
 * Nothing leaves this step implicitly: the computed coordinates become the network's approximations
 * only when the surveyor accepts them, next to `Next`.
 */
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
  const [manualName, setManualName] = useState('');
  const normalizedCycleCatalogue = useRef<string>();

  const patchInit = (patch: Partial<WizardDraft['initialisation']>) =>
    update({ initialisation: { ...init, ...patch, result: patch.result ?? undefined } });

  const observedEngineNames = useMemo(
    () => [...new Set(draft.targets
      .filter((target) => draft.stationCodes.includes(target.stationCode))
      .map((target) => target.engineName))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [draft.stationCodes, draft.targets],
  );

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
          // Weighted by default: a coordinate declared with a sigma is a control, not a truth.
          modeE: 'weak',
          modeN: 'weak',
          modeH: 'weak',
          sigmaM: reference.sigmaM,
          source: t('wizard.initialisation.sourceDataset', { id: reference.datasetId }),
        },
      ],
    });
  };

  const patchReference = (pointKey: string, patch: Partial<DraftReference>) => patchInit({
    references: init.references.map((reference) =>
      reference.pointKey === pointKey ? { ...reference, ...patch } : reference),
  });

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
      initialisation: { ...init, windowFrom: normalizedFrom, windowTo: normalizedTo, result: undefined },
    });
  }, [cycles.data?.epochs, cycles.data?.stationCode, init, update]);

  /** The coordinate every screen uses, so this table states the value and not just its computation. */
  const coordinates = useMemo(() => resolveNetworkCoordinates(draft), [draft]);
  const [override, setOverride] = useState<{ pointKey: string; anchor: HTMLElement }>();

  const rangeIsValid = useMemo(() => {
    const epochs = cycles.data?.epochs ?? [];
    return epochs.includes(init.windowFrom) && epochs.includes(init.windowTo) && init.windowFrom <= init.windowTo;
  }, [cycles.data?.epochs, init.windowFrom, init.windowTo]);

  const knownReferences = init.references.filter((reference) => reference.pointKey.startsWith('station:') === false);

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h2">{t('wizard.initialisation.title')}</Typography>
        <Typography variant="body2" color="text.secondary">{t('wizard.initialisation.description')}</Typography>
      </Box>

      <RadioGroup
        value={init.mode}
        onChange={(event) => patchInit({ mode: event.target.value as typeof init.mode })}
      >
        <FormControlLabel
          value="known-references"
          control={<Radio size="small" />}
          label={t('wizard.initialisation.modeKnown')}
        />
        <FormControlLabel
          value="entered"
          control={<Radio size="small" />}
          label={t('wizard.initialisation.modeEntered')}
        />
        <FormControlLabel
          value="local-anchor"
          control={<Radio size="small" />}
          label={t('wizard.initialisation.modeLocal')}
        />
      </RadioGroup>

      {init.mode === 'known-references' && (
        <Stack spacing={1.25}>
          <Typography variant="body2" color="text.secondary">{t('wizard.initialisation.knownHelp')}</Typography>
          {availableRefs.length > 0 && (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {availableRefs.map((reference) => {
                const engineName = draft.targets.find((target) => target.rawTargetName === reference.pointName)?.engineName;
                const used = init.references.some((item) => item.pointKey === engineName);
                return (
                  <Chip
                    key={`${reference.datasetId}-${reference.pointName}`}
                    data-testid={`add-reference-${reference.pointName}`}
                    label={`${reference.pointName} (σ ${millimetres(reference.sigmaM, 1)} mm)`}
                    color={used ? 'success' : 'default'}
                    onClick={() => !used && addReference(reference)}
                    onDelete={used
                      ? () => patchInit({ references: init.references.filter((item) => item.pointKey !== engineName) })
                      : undefined}
                  />
                );
              })}
            </Stack>
          )}
          <CoordinateCsvImport
            kind="references"
            testId="references-csv"
            onApply={(parsed) => patchInit({
              references: [
                ...init.references.filter((existing) => !parsed.rows.some((row) => row.name === existing.pointKey)),
                ...parsed.rows.map((row) => ({
                  pointKey: row.name,
                  eastingM: row.eastingM,
                  northingM: row.northingM,
                  heightM: row.heightM,
                  modeE: 'weak' as const,
                  modeN: 'weak' as const,
                  modeH: 'weak' as const,
                  sigmaM: row.sigmaEM ?? 0.0015,
                  sigmaEM: row.sigmaEM,
                  sigmaNM: row.sigmaNM,
                  sigmaHM: row.sigmaHM,
                  source: t('wizard.initialisation.sourceCsv'),
                })),
              ],
            })}
          />
          {knownReferences.length > 0 && (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" aria-label={t('wizard.initialisation.knownTable')}>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('wizard.initialisation.point')}</TableCell>
                    <TableCell align="right">E (m)</TableCell>
                    <TableCell align="right">N (m)</TableCell>
                    <TableCell align="right">H (m)</TableCell>
                    <TableCell align="right">σE (mm)</TableCell>
                    <TableCell align="right">σN (mm)</TableCell>
                    <TableCell align="right">σH (mm)</TableCell>
                    <TableCell>{t('wizard.initialisation.source')}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {knownReferences.map((reference) => (
                    <TableRow key={reference.pointKey} hover data-testid={`known-reference-${reference.pointKey}`}>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{reference.pointKey}</TableCell>
                      {(['eastingM', 'northingM', 'heightM'] as const).map((axis) => (
                        <TableCell key={axis} align="right">
                          <UnitField
                            label=""
                            unit=""
                            value={reference[axis]}
                            step={0.0001}
                            onChange={(value) => patchReference(reference.pointKey, { [axis]: value })}
                          />
                        </TableCell>
                      ))}
                      {([['sigmaEM', 'sigmaM'], ['sigmaNM', 'sigmaM'], ['sigmaHM', 'sigmaM']] as const).map(([axis, fallback]) => (
                        <TableCell key={axis} align="right">
                          <UnitField
                            label=""
                            unit=""
                            value={(reference[axis] ?? reference[fallback]) * 1000}
                            step={0.1}
                            onChange={(value) => patchReference(reference.pointKey, { [axis]: value / 1000 })}
                          />
                        </TableCell>
                      ))}
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">{reference.source}</Typography>
                      </TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          aria-label={`${t('wizard.initialisation.remove')} ${reference.pointKey}`}
                          onClick={() => patchInit({
                            references: init.references.filter((item) => item.pointKey !== reference.pointKey),
                          })}
                        >
                          <Box component="span" aria-hidden sx={{ fontSize: 13 }}>✕</Box>
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </Stack>
      )}

      {init.mode === 'entered' && (
        <Stack spacing={1.25}>
          <Typography variant="body2" color="text.secondary">{t('wizard.initialisation.enteredHelp')}</Typography>
          <CoordinateCsvImport
            kind="initial"
            testId="initial-csv"
            onApply={(parsed) => patchInit({
              enteredCoordinates: [
                ...init.enteredCoordinates.filter((existing) => !parsed.rows.some((row) => row.name === existing.pointKey)),
                ...parsed.rows.map((row) => ({
                  pointKey: row.name,
                  eastingM: row.eastingM,
                  northingM: row.northingM,
                  heightM: row.heightM,
                  source: 'csv' as const,
                })),
              ],
            })}
          />
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel id="entered-point">{t('wizard.initialisation.addPoint')}</InputLabel>
              <Select
                labelId="entered-point"
                label={t('wizard.initialisation.addPoint')}
                value={manualName}
                onChange={(event) => setManualName(event.target.value)}
              >
                {observedEngineNames
                  .filter((name) => !init.enteredCoordinates.some((entry) => entry.pointKey === name))
                  .map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
              </Select>
            </FormControl>
            <Button
              size="small"
              variant="outlined"
              disabled={!manualName}
              onClick={() => {
                patchInit({
                  enteredCoordinates: [
                    ...init.enteredCoordinates,
                    { pointKey: manualName, eastingM: 0, northingM: 0, heightM: 0, source: 'manual' as const },
                  ],
                });
                setManualName('');
              }}
            >
              {t('wizard.initialisation.add')}
            </Button>
            <Typography variant="caption" color="text.secondary">
              {t('wizard.initialisation.enteredCount', {
                entered: init.enteredCoordinates.length,
                observed: observedEngineNames.length,
              })}
            </Typography>
          </Stack>
          {init.enteredCoordinates.length > 0 && (
            <Box sx={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
              <Table size="small" stickyHeader aria-label={t('wizard.initialisation.enteredTable')}>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('wizard.initialisation.point')}</TableCell>
                    <TableCell align="right">E (m)</TableCell>
                    <TableCell align="right">N (m)</TableCell>
                    <TableCell align="right">H (m)</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {init.enteredCoordinates.map((entry) => (
                    <TableRow key={entry.pointKey} hover data-testid={`entered-${entry.pointKey}`}>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{entry.pointKey}</TableCell>
                      {(['eastingM', 'northingM', 'heightM'] as const).map((axis) => (
                        <TableCell key={axis} align="right">
                          <UnitField
                            label=""
                            unit=""
                            value={entry[axis]}
                            step={0.0001}
                            onChange={(value) => patchInit({
                              enteredCoordinates: init.enteredCoordinates.map((candidate) =>
                                candidate.pointKey === entry.pointKey ? { ...candidate, [axis]: value } : candidate),
                            })}
                          />
                        </TableCell>
                      ))}
                      <TableCell>
                        <IconButton
                          size="small"
                          aria-label={`${t('wizard.initialisation.remove')} ${entry.pointKey}`}
                          onClick={() => patchInit({
                            enteredCoordinates: init.enteredCoordinates.filter((candidate) => candidate.pointKey !== entry.pointKey),
                          })}
                        >
                          <Box component="span" aria-hidden sx={{ fontSize: 13 }}>✕</Box>
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </Stack>
      )}

      {init.mode === 'local-anchor' && (
        <Stack spacing={1}>
          <Alert severity="info" variant="outlined">{t('wizard.initialisation.localHelp')}</Alert>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel id="anchor-station">{t('wizard.initialisation.anchorStation')}</InputLabel>
              <Select
                labelId="anchor-station"
                label={t('wizard.initialisation.anchorStation')}
                value={init.anchorStationCode ?? ''}
                onChange={(event) => patchInit({ anchorStationCode: event.target.value })}
              >
                {draft.stationCodes.map((stationCode) => (
                  <MenuItem key={stationCode} value={stationCode}>{stationCode}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <UnitField label="Easting" unit="m" value={init.anchorEastingM} onChange={(value) => patchInit({ anchorEastingM: value })} />
            <UnitField label="Northing" unit="m" value={init.anchorNorthingM} onChange={(value) => patchInit({ anchorNorthingM: value })} />
            <UnitField label="Height" unit="m" value={init.anchorHeightM} onChange={(value) => patchInit({ anchorHeightM: value })} />
            <UnitField label="Orientation" unit="°" value={init.anchorOrientationDeg} onChange={(value) => patchInit({ anchorOrientationDeg: value })} step={0.0001} />
            <Chip size="small" variant="outlined" label={t('wizard.initialisation.zeroIsValid')} />
          </Stack>
        </Stack>
      )}

      {cycles.isLoading && <Typography variant="body2">{t('wizard.initialisation.loadingCycles')}</Typography>}
      {cycles.isError && <Alert severity="error">{t('wizard.initialisation.cyclesError')}</Alert>}
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
          {compute.isPending
            ? t('wizard.initialisation.computing')
            : t(init.mode === 'entered' ? 'wizard.initialisation.check' : 'wizard.initialisation.compute')}
        </Button>
        {!rangeIsValid && cycles.data && (
          <Typography variant="caption" color="error">{t('wizard.initialisation.badRange')}</Typography>
        )}
      </Stack>
      <Alert severity="info" variant="outlined">{t('wizard.initialisation.windowNote')}</Alert>

      {init.result && (
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" color="info" label={`pairs ${init.result.coverage.availableStationTargetPairs}/${init.result.coverage.expectedStationTargetPairs}`} />
            <Chip size="small" color="info" label={`points ${init.result.coverage.availablePhysicalPoints}/${init.result.coverage.expectedPhysicalPoints}`} />
            <Chip size="small" label={`${init.result.coverage.observationsUsed} raw obs · ${init.result.coverage.representativeCount} medians`} />
            <Chip size="small" label={`retained ${init.result.coverage.retainedFrom ?? '—'} → ${init.result.coverage.retainedTo ?? '—'}`} />
          </Stack>
          {init.result.coverage.missingStationTargets.length > 0 && (
            <Alert severity="warning">
              {t('wizard.initialisation.missingPairs', { pairs: init.result.coverage.missingStationTargets.join(', ') })}
            </Alert>
          )}
          {init.result.failures.map((failure) => (
            <Alert key={failure.subject} severity="error">{failure.subject}: {failure.reason}</Alert>
          ))}

          {draft.scope === 'network' && <InitialCoordinatesNetworkView draft={draft} />}

          <Stack spacing={0.5}>
            <Typography variant="subtitle2">{t('wizard.initialisation.stationSolutions')}</Typography>
            {init.result.stationSolutions.map((station) => (
              <Typography key={station.stationCode} variant="body2">
                <b>{station.stationCode}</b>: E {fixed(station.eastingM, 4)} m · N {fixed(station.northingM, 4)} m · H {fixed(station.heightM, 4)} m · orientation {fixed(station.orientationDeg, 4)}° ({station.source})
                {station.problems.length > 0 ? ` — ${station.problems.join('; ')}` : ''}
              </Typography>
            ))}
          </Stack>

          <Box sx={{ overflowX: 'auto', maxHeight: 300, overflowY: 'auto' }}>
            <Table size="small" stickyHeader aria-label={t('wizard.initialisation.resultTable')}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('wizard.initialisation.point')}</TableCell>
                  <TableCell align="right">E (m)</TableCell>
                  <TableCell align="right">N (m)</TableCell>
                  <TableCell align="right">H (m)</TableCell>
                  <TableCell align="right">Stations</TableCell>
                  <TableCell align="right">Obs</TableCell>
                  <TableCell align="right">Spread H (mm)</TableCell>
                  <TableCell align="right">Spread V (mm)</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {init.result.coordinates.map((coordinate) => {
                  // The row states what the network *uses*, which is not always what the resection
                  // produced: a value corrected by hand takes precedence (`network-coordinates.ts`).
                  const used = coordinates.get(coordinate.pointKey);
                  const overridden = used?.origin === 'manual';
                  return (
                  <TableRow
                    key={coordinate.pointKey}
                    hover
                    onClick={(event) => setOverride({ pointKey: coordinate.pointKey, anchor: event.currentTarget })}
                    sx={{ cursor: 'pointer' }}
                    title={t('wizard.datum.editCoordinate')}
                    data-testid={`initial-coordinate-${coordinate.pointKey}`}
                  >
                    <TableCell sx={{ fontFamily: 'monospace' }}>
                      {coordinate.pointKey}
                      {overridden && (
                        <Typography component="span" variant="caption" color="primary.main" sx={{ ml: 0.5, fontWeight: 800 }}>
                          {t('wizard.datum.origin.manual')}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">{fixed(used?.eastingM ?? coordinate.eastingM, 4)}</TableCell>
                    <TableCell align="right">{fixed(used?.northingM ?? coordinate.northingM, 4)}</TableCell>
                    <TableCell align="right">{fixed(used?.heightM ?? coordinate.heightM, 4)}</TableCell>
                    <TableCell align="right">{coordinate.stationCount}</TableCell>
                    <TableCell align="right">{coordinate.observationCount}</TableCell>
                    <TableCell align="right">{millimetres(coordinate.horizontalSpreadM, 1)}</TableCell>
                    <TableCell align="right">{millimetres(coordinate.verticalSpreadM, 1)}</TableCell>
                    <TableCell><StatusChip status={coordinate.status} /></TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        </Stack>
      )}

      <CoordinateOverrideEditor
        draft={draft}
        update={update}
        pointKey={override?.pointKey}
        anchorEl={override?.anchor ?? null}
        onClose={() => setOverride(undefined)}
      />
    </Stack>
  );
}
