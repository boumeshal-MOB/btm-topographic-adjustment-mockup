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

  const validityHelp = draft.editContext
    ? 'Start of validity for the new configuration version. This is an activation timestamp, not the observation period used for initial coordinates.'
    : 'Validity of version 1. This is an activation timestamp, not the observation period used for initial coordinates (TIME-005/006).';

  return (
    <Stack spacing={2}>
      <Typography variant="h2">General</Typography>
      <Typography variant="body2" color="text.secondary">
        Processing type: <b>Topographic Adjustment</b> — the BTM project is implicit (no Project field).
      </Typography>

      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        <TextField
          label="Processing name"
          required
          value={draft.name}
          onChange={(event) => update({ name: event.target.value })}
          sx={{ width: 400 }}
          inputProps={{ 'data-testid': 'processing-name' }}
        />
        <TextField
          label="Description"
          value={draft.description}
          onChange={(event) => update({ description: event.target.value })}
          sx={{ width: 475 }}
        />
      </Stack>

      <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap>
        <FormControl>
          <Typography variant="body2" fontWeight={600}>Adjustment scope</Typography>
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
            <FormControlLabel value="single-station" control={<Radio />} label="Single station" />
            <FormControlLabel value="network" control={<Radio />} label="Network (connected)" />
          </RadioGroup>
        </FormControl>

        <FormControl>
          <Typography variant="body2" fontWeight={600}>Country preset (versioned template, not a national standard)</Typography>
          <RadioGroup
            row
            value={draft.countryPresetId}
            onChange={(event) => {
              const presetId = event.target.value as WizardDraft['countryPresetId'];
              const shouldChange = draft.stationCodes.length === 0 || window.confirm(
                'Changing the preset resets station, measurement, initialisation, adjustment, run and output proposals. Continue?',
              );
              if (shouldChange) changePreset.mutate(presetId);
            }}
          >
            <FormControlLabel value="uk-supplied-hs2-nte" control={<Radio />} label="UK — supplied HS2/NTE project" />
            <FormControlLabel value="fr-starnet-monitoring" control={<Radio />} label="FR — STAR*NET monitoring" />
          </RadioGroup>
        </FormControl>
      </Stack>

      <Stack spacing={1}>
        <Typography variant="subtitle2">Configuration valid from</Typography>
        <UtcDateTimeSelector
          value={draft.validFrom}
          onChange={(validFrom) => update({ validFrom })}
          helperText={validityHelp}
          required
        />
        {(summary.first || summary.last) && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
            <Typography variant="caption" color="text.secondary">Suggested from selected station data:</Typography>
            {summary.first && <Button size="small" onClick={() => update({ validFrom: summary.first })}>First observation</Button>}
            {summary.last && <Button size="small" onClick={() => update({ validFrom: summary.last })}>Latest observation</Button>}
          </Stack>
        )}
      </Stack>

      {draft.stationCodes.length > 0 && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip size="small" label={`${draft.stationCodes.length} station(s)`} />
          <Chip size="small" label={`${summary.observations} raw observations`} />
          <Chip size="small" label={`${summary.targets} targets`} />
          <Chip size="small" label={`last observation ${summary.last ?? '—'}`} />
          <Chip size="small" label="variables: Hz, Vz, Sd (+T/P where present)" />
        </Stack>
      )}

      <Alert severity="info" variant="outlined">
        Changing the preset rebuilds editable proposals for the selected BTM stations. It clears confirmed shared points,
        initial coordinates and the test epoch; it never invents database data.
      </Alert>
    </Stack>
  );
}
