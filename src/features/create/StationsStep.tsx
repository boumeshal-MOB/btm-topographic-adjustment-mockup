import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Checkbox,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { api } from '@/api/client';
import type { WizardDraft } from '@/demo/draft';
import type { CatalogueReference, CatalogueStation } from '@/demo/catalogue';

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
  const catalogue = useCatalogue();
  const queryClient = useQueryClient();
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
  return (
    <Stack spacing={2}>
      <Typography variant="h2">Stations</Typography>
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
                <TableCell>{s.datasetLabel}</TableCell>
                <TableCell align="right">{s.targetCount}</TableCell>
                <TableCell>{s.lastEpoch}</TableCell>
                <TableCell align="right">{s.estimatedCycleMinutes}</TableCell>
                <TableCell>{s.hasEnvironmentVariables ? `T:${s.temperatureVariableId} P:${s.pressureVariableId}` : 'none'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      {draft.stationCodes.length > 0 && (
        <Alert severity="success">
          {draft.stationCodes.length} station(s) selected · {draft.targets.length} targets proposed for review in step 4.
        </Alert>
      )}
    </Stack>
  );
}

// ------------------------------------------------------------------ step 3: Instruments
