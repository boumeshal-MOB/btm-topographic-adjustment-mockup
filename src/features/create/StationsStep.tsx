import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Checkbox,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { WizardDraft } from '@/demo/draft';
import type { CatalogueReference, CatalogueStation } from '@/demo/catalogue';
import { StationImportDialog } from '@/features/create/StationImportDialog';

/**
 * Step 2 — which stations the processing observes.
 *
 * Selecting a station is not a filter: it rebuilds the sight list, the shared points and the
 * initialisation proposal on the draft, because the observation graph changed. That is why this step
 * posts to the API instead of patching the draft locally.
 */
function useCatalogue() {
  return useQuery({
    queryKey: ['catalogue'],
    queryFn: () => api<{ stations: CatalogueStation[]; references: CatalogueReference[]; lateDataDelivered: boolean }>('GET', '/api/v2/catalogue'),
  });
}

export function StationsStep({ draft, setDraft, onError }: { draft: WizardDraft; setDraft: (d: WizardDraft) => void; onError: (m: string) => void }) {
  const { t } = useTranslation();
  const catalogue = useCatalogue();
  const queryClient = useQueryClient();
  const [importedCodes, setImportedCodes] = useState<string[]>([]);
  const select = useMutation({
    mutationFn: (stationCodes: string[]) => api<WizardDraft>('POST', `/api/v2/drafts/${draft.id}/stations`, { stationCodes }),
    onSuccess: (next) => {
      setDraft(next);
      queryClient.invalidateQueries({ queryKey: ['draft', draft.id] });
    },
    onError: (e) => onError(String(e)),
  });
  const toggle = (code: string) => {
    const selected = draft.stationCodes.includes(code)
      ? draft.stationCodes.filter((c) => c !== code)
      : draft.scope === 'single-station'
        ? [code]
        : [...draft.stationCodes, code];
    select.mutate(selected);
  };
  const onImported = (stationCodes: string[]) => {
    setImportedCodes(stationCodes);
    void queryClient.invalidateQueries({ queryKey: ['catalogue'] });
    const selected = draft.scope === 'single-station'
      ? stationCodes.slice(0, 1)
      : [...new Set([...draft.stationCodes, ...stationCodes])];
    select.mutate(selected);
  };
  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap gap={1}>
        <Typography variant="h2">Stations</Typography>
        <StationImportDialog
          existingStationCodes={(catalogue.data?.stations ?? []).map((station) => station.stationCode)}
          currentTemplate={draft.countryPresetId === 'fr-starnet-monitoring' ? 'FR' : 'UK'}
          onImported={onImported}
          onError={onError}
        />
      </Stack>
      <Typography variant="body2" color="text.secondary">
        {draft.scope === 'single-station'
          ? 'Select exactly one station available in BTM.'
          : 'Select at least two stations forming ONE connected network — independent groups belong in separate processings (PROC-004/005).'}
      </Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell />
              <TableCell>Station</TableCell>
              <TableCell>Dataset</TableCell>
              <TableCell align="right">Observed targets</TableCell>
              <TableCell>Last observation</TableCell>
              <TableCell align="right">Cycle (min)</TableCell>
              <TableCell>T/P variables</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(catalogue.data?.stations ?? []).map((s) => (
              <TableRow key={s.stationCode} hover selected={draft.stationCodes.includes(s.stationCode)}>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={draft.stationCodes.includes(s.stationCode)}
                    onChange={() => toggle(s.stationCode)}
                    inputProps={{ 'aria-label': `Select ${s.stationCode}` }}
                  />
                </TableCell>
                <TableCell>{s.stationCode}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                    <span>{s.datasetLabel}</span>
                    {s.userImportId && <Chip size="small" color="secondary" label={t('wizard.stations.import.importedBadge')} />}
                  </Stack>
                  {s.sourceFileNames && (
                    <Typography variant="caption" color="text.secondary">{s.sourceFileNames.join(', ')}</Typography>
                  )}
                </TableCell>
                <TableCell align="right">{s.targetCount}</TableCell>
                <TableCell>{s.lastEpoch}</TableCell>
                <TableCell align="right">{s.estimatedCycleMinutes}</TableCell>
                <TableCell>{s.hasEnvironmentVariables ? `T:${s.temperatureVariableId} P:${s.pressureVariableId}` : 'none'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      {importedCodes.length > 0 && (
        <Alert severity="success" onClose={() => setImportedCodes([])}>
          {t('wizard.stations.import.success', { stations: importedCodes.join(', ') })}
        </Alert>
      )}
      {draft.stationCodes.length > 0 && (
        <Alert severity="success">
          {draft.stationCodes.length} station(s) selected · {draft.targets.length} targets proposed for review in step 4.
        </Alert>
      )}
    </Stack>
  );
}

// ------------------------------------------------------------------ step 3: Instruments
