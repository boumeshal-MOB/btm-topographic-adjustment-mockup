import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Chip,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { api } from '@/api/client';
import type { CatalogueReference, CatalogueStation } from '@/demo/catalogue';
import type { WizardDraft } from '@/demo/draft';
import { UtcDateTimeSelector } from '@/features/create/UtcDateTimeSelector';
import { useTranslation } from 'react-i18next';

interface CatalogueResponse {
  stations: CatalogueStation[];
  references: CatalogueReference[];
  lateDataDelivered: boolean;
}

export function GeneralConfigurationStep({
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
  const queryClient = useQueryClient();
  const catalogue = useQuery({
    queryKey: ['catalogue'],
    queryFn: () => api<CatalogueResponse>('GET', '/api/v2/catalogue'),
  });
  const changePreset = useMutation({
    mutationFn: (presetId: WizardDraft['countryPresetId']) =>
      api<WizardDraft>('POST', `/api/v2/drafts/${draft.id}/preset`, { presetId }),
    onSuccess: (next) => {
      setDraft(next);
      queryClient.setQueryData(['draft', next.id], next);
      void queryClient.invalidateQueries({ queryKey: ['drafts'] });
    },
    onError: (error) => onError(String(error)),
  });

  const summary = useMemo(() => {
    const stations = catalogue.data?.stations.filter((station) => draft.stationCodes.includes(station.stationCode)) ?? [];
    const epochs = stations.flatMap((station) => [station.firstEpoch, station.lastEpoch]).filter(Boolean).sort();
    return {
      observations: stations.reduce((sum, station) => sum + station.observationCount, 0),
      targets: stations.reduce((sum, station) => sum + station.targetCount, 0),
      first: epochs.at(0),
      last: epochs.at(-1),
    };
  }, [catalogue.data?.stations, draft.stationCodes]);

  const validityHelp = draft.editContext ? t('general.validityEditHelp') : t('general.validityCreateHelp');

  return (
    <Stack spacing={2}>
      <Typography variant="h2">{t('general.title')}</Typography>
      <Typography variant="body2" color="text.secondary">
        {t('general.processingType')}
      </Typography>

      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        <TextField
          label={t('general.name')}
          required
          value={draft.name}
          onChange={(event) => update({ name: event.target.value })}
          sx={{ width: 400 }}
          inputProps={{ 'data-testid': 'processing-name' }}
        />
        <TextField
          label={t('general.description')}
          value={draft.description}
          onChange={(event) => update({ description: event.target.value })}
          sx={{ width: 475 }}
        />
      </Stack>

      <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap>
        <FormControl>
          <Typography variant="body2" fontWeight={600}>{t('general.scope')}</Typography>
          <RadioGroup
            row
            value={draft.scope}
            onChange={(event) => update({
              scope: event.target.value as WizardDraft['scope'],
              stationCodes: [],
              stations: [],
              targets: [],
              sharedPoints: [],
            })}
          >
            <FormControlLabel value="single-station" control={<Radio />} label={t('general.singleStation')} />
            <FormControlLabel value="network" control={<Radio />} label={t('general.network')} />
          </RadioGroup>
        </FormControl>

        <FormControl>
          <Typography variant="body2" fontWeight={600}>{t('general.preset')}</Typography>
          <RadioGroup
            row
            value={draft.countryPresetId}
            onChange={(event) => {
              const presetId = event.target.value as WizardDraft['countryPresetId'];
              const shouldChange = draft.stationCodes.length === 0 || window.confirm(
                t('general.changePresetConfirm'),
              );
              if (shouldChange) changePreset.mutate(presetId);
            }}
          >
            <FormControlLabel value="uk-supplied-hs2-nte" control={<Radio />} label={t('general.ukPreset')} />
            <FormControlLabel value="fr-starnet-monitoring" control={<Radio />} label={t('general.frPreset')} />
          </RadioGroup>
        </FormControl>
      </Stack>

      <Stack spacing={1}>
        <Typography variant="subtitle2">{t('general.validFrom')}</Typography>
        <UtcDateTimeSelector
          value={draft.validFrom}
          onChange={(validFrom) => update({ validFrom })}
          helperText={validityHelp}
          required
        />
        {(summary.first || summary.last) && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
            <Typography variant="caption" color="text.secondary">{t('general.suggested')}</Typography>
            {summary.first && <Button size="small" onClick={() => update({ validFrom: summary.first })}>{t('general.firstObservation')}</Button>}
            {summary.last && <Button size="small" onClick={() => update({ validFrom: summary.last })}>{t('general.latestObservation')}</Button>}
          </Stack>
        )}
      </Stack>

      {draft.stationCodes.length > 0 && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip size="small" label={t('common.stationCount', { count: draft.stationCodes.length })} />
          <Chip size="small" label={t('general.rawObservations', { count: summary.observations })} />
          <Chip size="small" label={t('common.targetCount', { count: summary.targets })} />
          <Chip size="small" label={t('general.lastObservation', { date: summary.last ?? '—' })} />
          <Chip size="small" label={t('general.variables', { environment: t('general.environment') })} />
        </Stack>
      )}

      <Alert severity="info" variant="outlined">
        {t('general.presetInfo')}
      </Alert>
    </Stack>
  );
}
