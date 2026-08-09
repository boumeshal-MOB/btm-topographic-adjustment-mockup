import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControl,
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
  Typography,
} from '@mui/material';
import { api } from '@/api/client';
import type { WizardDraft } from '@/demo/draft';
import type { GeometryCheck } from '@/domain/point-identity/local-geometry';
import { StatusChip } from '@/features/shared/components';
import { useTranslation } from 'react-i18next';

interface PairRow {
  id: number;
  aTargetKey: string;
  bTargetKey: string;
}

const newPair = (id: number): PairRow => ({ id, aTargetKey: '', bTargetKey: '' });

export function NetworkCommonPointsPanel({
  draft,
  update,
  onError,
}: {
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => void;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [stationA, setStationA] = useState(draft.stationCodes[0] ?? '');
  const [stationB, setStationB] = useState(draft.stationCodes[1] ?? '');
  const [pairs, setPairs] = useState<PairRow[]>([newPair(1), newPair(2)]);
  const [nextPairId, setNextPairId] = useState(3);
  const [horizontalToleranceMm, setHorizontalToleranceMm] = useState(50);
  const [verticalToleranceMm, setVerticalToleranceMm] = useState(50);
  const [check, setCheck] = useState<GeometryCheck>();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const targetsFor = (stationCode: string) =>
    draft.targets
      .filter((target) => target.stationCode === stationCode && target.includeInAdjustment)
      .map((target) => target.rawTargetName)
      .sort((a, b) => a.localeCompare(b));
  const targetsA = targetsFor(stationA);
  const targetsB = targetsFor(stationB);
  const completePairs = pairs.filter((pair) => pair.aTargetKey && pair.bTargetKey);
  const duplicateA = completePairs.length !== new Set(completePairs.map((pair) => pair.aTargetKey)).size;
  const duplicateB = completePairs.length !== new Set(completePairs.map((pair) => pair.bTargetKey)).size;
  const canAnalyse =
    stationA !== stationB &&
    completePairs.length >= 2 &&
    !duplicateA &&
    !duplicateB &&
    horizontalToleranceMm >= 1 &&
    verticalToleranceMm >= 1;

  const runCheck = useMutation({
    mutationFn: () =>
      api<GeometryCheck>('POST', `/api/v2/drafts/${draft.id}/geometry-check`, {
        stationA,
        stationB,
        seeds: completePairs.map(({ aTargetKey, bTargetKey }) => ({ aTargetKey, bTargetKey })),
        horizontalToleranceMm,
        verticalToleranceMm,
      }),
    onSuccess: (result) => {
      setCheck(result);
      setSelected(new Set());
    },
    onError: (error) => onError(String(error)),
  });

  const connectivity = useQuery({
    queryKey: ['connectivity', draft.id, draft.sharedPoints.length],
    queryFn: () => api<{ a: string; b: string; sharedPoints: number; status: string }[]>('GET', `/api/v2/drafts/${draft.id}/connectivity`),
    enabled: draft.scope === 'network',
  });

  const alreadyConfirmed = useMemo(
    () => new Set(
      draft.sharedPoints.flatMap((shared) => {
        const a = shared.members.find((member) => member.stationCode === stationA);
        const b = shared.members.find((member) => member.stationCode === stationB);
        return a && b ? [`${a.rawTargetName}|${b.rawTargetName}`] : [];
      }),
    ),
    [draft.sharedPoints, stationA, stationB],
  );

  const patchPair = (id: number, patch: Partial<PairRow>) => {
    setPairs((current) => current.map((pair) => pair.id === id ? { ...pair, ...patch } : pair));
    setCheck(undefined);
    setSelected(new Set());
  };
  const addPair = () => {
    setPairs((current) => [...current, newPair(nextPairId)]);
    setNextPairId((current) => current + 1);
  };
  const removePair = (id: number) => {
    setPairs((current) => current.length <= 2 ? current : current.filter((pair) => pair.id !== id));
    setCheck(undefined);
    setSelected(new Set());
  };
  const changeStation = (side: 'a' | 'b', stationCode: string) => {
    if (side === 'a') setStationA(stationCode);
    else setStationB(stationCode);
    setPairs([newPair(1), newPair(2)]);
    setNextPairId(3);
    setCheck(undefined);
    setSelected(new Set());
  };

  const confirm = () => {
    const chosen = (check?.candidates ?? []).filter((candidate) =>
      selected.has(`${candidate.aTargetKey}|${candidate.bTargetKey}`),
    );
    const existingKeys = new Set(
      draft.sharedPoints.flatMap((shared) => shared.members.map((member) => `${member.stationCode}|${member.rawTargetName}`)),
    );
    const additions = chosen.filter((candidate) =>
      !existingKeys.has(`${stationA}|${candidate.aTargetKey}`) &&
      !existingKeys.has(`${stationB}|${candidate.bTargetKey}`),
    );
    const nextIndex = draft.sharedPoints.reduce((max, shared) => {
      const numeric = Number(shared.key.match(/(\d+)$/)?.[1] ?? 0);
      return Math.max(max, numeric);
    }, 0) + 1;
    update({
      sharedPoints: [
        ...draft.sharedPoints,
        ...additions.map((candidate, index) => ({
          key: `SP_${nextIndex + index}`,
          members: [
            { stationCode: stationA, rawTargetName: candidate.aTargetKey },
            { stationCode: stationB, rawTargetName: candidate.bTargetKey },
          ],
          source: 'geometry-confirmed' as const,
          confirmedAtStep: 'Targets & Measurements',
        })),
      ],
    });
    setCheck(undefined);
    setSelected(new Set());
    void queryClient.invalidateQueries({ queryKey: ['connectivity'] });
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="common-points-panel">
      <Stack spacing={2}>
        <Box>
          <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 600 }}>
            {t('commonPoints.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('commonPoints.help')}
          </Typography>
        </Box>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="common-station-a">{t('commonPoints.firstStation')}</InputLabel>
            <Select labelId="common-station-a" label={t('commonPoints.firstStation')} value={stationA} onChange={(event) => changeStation('a', event.target.value)}>
              {draft.stationCodes.map((stationCode) => <MenuItem key={stationCode} value={stationCode}>{stationCode}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 220 }} error={stationA === stationB}>
            <InputLabel id="common-station-b">{t('commonPoints.secondStation')}</InputLabel>
            <Select labelId="common-station-b" label={t('commonPoints.secondStation')} value={stationB} onChange={(event) => changeStation('b', event.target.value)}>
              {draft.stationCodes.map((stationCode) => <MenuItem key={stationCode} value={stationCode}>{stationCode}</MenuItem>)}
            </Select>
          </FormControl>
        </Stack>

        {stationA === stationB && <Alert severity="error">{t('commonPoints.differentStations')}</Alert>}

        <Stack spacing={1}>
          {pairs.map((pair, index) => {
            const aUsedElsewhere = new Set(pairs.filter((item) => item.id !== pair.id).map((item) => item.aTargetKey));
            const bUsedElsewhere = new Set(pairs.filter((item) => item.id !== pair.id).map((item) => item.bTargetKey));
            return (
              <Paper key={pair.id} variant="outlined" sx={{ p: 1.25, bgcolor: 'grey.50' }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
                  <Chip size="small" label={`${t('commonPoints.pair', { number: index + 1 })}${index < 2 ? ` · ${t('commonPoints.required')}` : ''}`} color={index < 2 ? 'primary' : 'default'} variant="outlined" />
                  <FormControl size="small" sx={{ minWidth: 260, flex: 1 }}>
                    <InputLabel id={`point-a-${pair.id}`}>{t('commonPoints.stationPoint', { station: stationA })}</InputLabel>
                    <Select
                      labelId={`point-a-${pair.id}`}
                      label={t('commonPoints.stationPoint', { station: stationA })}
                      value={pair.aTargetKey}
                      onChange={(event) => patchPair(pair.id, { aTargetKey: event.target.value })}
                    >
                      {targetsA.map((target) => <MenuItem key={target} value={target} disabled={aUsedElsewhere.has(target)}>{target}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <Typography aria-hidden>↔</Typography>
                  <FormControl size="small" sx={{ minWidth: 260, flex: 1 }}>
                    <InputLabel id={`point-b-${pair.id}`}>{t('commonPoints.equivalent', { station: stationB })}</InputLabel>
                    <Select
                      labelId={`point-b-${pair.id}`}
                      label={t('commonPoints.equivalent', { station: stationB })}
                      value={pair.bTargetKey}
                      onChange={(event) => patchPair(pair.id, { bTargetKey: event.target.value })}
                    >
                      {targetsB.map((target) => <MenuItem key={target} value={target} disabled={bUsedElsewhere.has(target)}>{target}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <Button size="small" color="error" disabled={pairs.length <= 2} onClick={() => removePair(pair.id)}>
                    {t('commonPoints.remove')}
                  </Button>
                </Stack>
              </Paper>
            );
          })}
          <Button variant="outlined" onClick={addPair} sx={{ alignSelf: 'flex-start' }} data-testid="add-common-pair">
            {t('commonPoints.addPair')}
          </Button>
        </Stack>

        {(duplicateA || duplicateB) && <Alert severity="error">{t('commonPoints.duplicate')}</Alert>}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
          <TextField
            size="small"
            type="number"
            label={t('commonPoints.horizontalTolerance')}
            value={horizontalToleranceMm}
            onChange={(event) => setHorizontalToleranceMm(Number(event.target.value))}
            InputProps={{ endAdornment: <Typography variant="caption">mm</Typography> }}
            inputProps={{ min: 1, max: 1000, step: 1 }}
            helperText={t('commonPoints.horizontalHelp')}
          />
          <TextField
            size="small"
            type="number"
            label={t('commonPoints.verticalTolerance')}
            value={verticalToleranceMm}
            onChange={(event) => setVerticalToleranceMm(Number(event.target.value))}
            InputProps={{ endAdornment: <Typography variant="caption">mm</Typography> }}
            inputProps={{ min: 1, max: 1000, step: 1 }}
            helperText={t('commonPoints.verticalHelp')}
          />
          <Button
            variant="contained"
            disabled={!canAnalyse || runCheck.isPending}
            onClick={() => runCheck.mutate()}
            data-testid="analyse-common-points"
          >
            {runCheck.isPending ? t('commonPoints.analysing') : t('commonPoints.analyse')}
          </Button>
        </Stack>

        <Alert severity="info" variant="outlined">
          {t('commonPoints.proposalHelp')}
        </Alert>

        {check && (
          <Stack spacing={1.25}>
            <Alert severity={check.status === 'ready' ? 'success' : check.status === 'weak' ? 'warning' : 'error'}>
              {check.status === 'weak' && <b>{t('commonPoints.weak')}</b>}
              {check.status === 'ready'
                ? t('commonPoints.readyMessage', { count: check.candidates.length })
                : check.status === 'weak'
                  ? t('commonPoints.weakMessage', { count: check.candidates.length })
                  : t('commonPoints.insufficientMessage')}
              {check.rmsM !== undefined && ` ${t('commonPoints.rms', { value: (check.rmsM * 1000).toFixed(1) })}`}
            </Alert>
            {check.candidates.length > 0 && (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('common.confirm')}</TableCell>
                      <TableCell>{stationA}</TableCell>
                      <TableCell>{stationB}</TableCell>
                      <TableCell>{t('commonPoints.source')}</TableCell>
                      <TableCell align="right">{t('commonPoints.horizontalResidual')}</TableCell>
                      <TableCell align="right">{t('commonPoints.verticalResidual')}</TableCell>
                      <TableCell align="right">{t('commonPoints.residual3d')}</TableCell>
                      <TableCell align="right">{t('commonPoints.confidence')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {check.candidates.map((candidate) => {
                      const key = `${candidate.aTargetKey}|${candidate.bTargetKey}`;
                      const isExisting = alreadyConfirmed.has(key);
                      return (
                        <TableRow key={key} selected={selected.has(key)}>
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={selected.has(key) || isExisting}
                              disabled={isExisting}
                              onChange={(event) => {
                                const next = new Set(selected);
                                if (event.target.checked) next.add(key);
                                else next.delete(key);
                                setSelected(next);
                              }}
                              inputProps={{ 'aria-label': t('commonPoints.confirmAria', { a: candidate.aTargetKey, b: candidate.bTargetKey }) }}
                            />
                          </TableCell>
                          <TableCell>{candidate.aTargetKey}</TableCell>
                          <TableCell>{candidate.bTargetKey}</TableCell>
                          <TableCell>{isExisting ? t('commonPoints.alreadyConfirmed') : candidate.seed ? t('commonPoints.manualSeed') : t('commonPoints.geometryProposal')}</TableCell>
                          <TableCell align="right">{(candidate.horizontalResidualM * 1000).toFixed(1)}</TableCell>
                          <TableCell align="right">{(candidate.verticalResidualM * 1000).toFixed(1)}</TableCell>
                          <TableCell align="right">{(candidate.residual3dM * 1000).toFixed(1)}</TableCell>
                          <TableCell align="right">{Math.round(candidate.confidence * 100)}%</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Box>
            )}
            <Button variant="contained" onClick={confirm} disabled={selected.size === 0} sx={{ alignSelf: 'flex-start' }}>
              {t('commonPoints.confirmSelected', { count: selected.size })}
            </Button>
          </Stack>
        )}

        {draft.sharedPoints.length > 0 && (
          <Stack spacing={1}>
            <Typography variant="subtitle2">{t('commonPoints.confirmed')}</Typography>
            {draft.sharedPoints.map((shared) => (
              <Paper key={shared.key} variant="outlined" sx={{ p: 1 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                  <Chip size="small" label={shared.key} color="success" />
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {shared.members.map((member) => `${member.stationCode}/${member.rawTargetName}`).join(' = ')}
                  </Typography>
                  <Chip size="small" label={shared.source} variant="outlined" />
                  <Button size="small" color="error" onClick={() => update({ sharedPoints: draft.sharedPoints.filter((item) => item.key !== shared.key) })}>
                    {t('commonPoints.remove')}
                  </Button>
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}

        {connectivity.data && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {connectivity.data.map((pair) => (
              <Stack key={`${pair.a}-${pair.b}`} direction="row" spacing={0.5} alignItems="center">
                <Typography variant="body2">{pair.a}↔{pair.b} ({t('commonPoints.sharedCount', { count: pair.sharedPoints })})</Typography>
                <StatusChip status={pair.status} />
              </Stack>
            ))}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
