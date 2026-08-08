import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
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
import type { ReprocessPreview, ReprocessResult, StoredVersion } from '@/features/shared/types';
import { StatusChip } from '@/features/shared/components';

export function AnalysisHistoryPanel({
  processingId,
  versions,
  onError,
}: {
  processingId: number;
  versions: StoredVersion[];
  onError: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const usable = versions.filter((version) => version.status !== 'draft');
  const defaultFrom = usable.at(-1)?.validFrom?.slice(0, 16) ?? new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 16);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 16));
  const [forcedVersionId, setForcedVersionId] = useState('');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<ReprocessPreview>();
  const [result, setResult] = useState<ReprocessResult>();
  const iso = (value: string) => new Date(value).toISOString();
  const impact = useMutation({
    mutationFn: () => api<ReprocessPreview>('POST', `/api/v2/topographic-adjustments/${processingId}/reprocess/preview`, {
      from: iso(from),
      to: iso(to),
      forcedVersionId: forcedVersionId || undefined,
    }),
    onSuccess: (value) => { setPreview(value); setResult(undefined); },
    onError: (error) => onError(String(error)),
  });
  const execute = useMutation({
    mutationFn: () => api<ReprocessResult>('POST', `/api/v2/topographic-adjustments/${processingId}/reprocess`, {
      from: iso(from),
      to: iso(to),
      forcedVersionId: forcedVersionId || undefined,
      reason,
    }),
    onSuccess: (value) => {
      setResult(value);
      queryClient.invalidateQueries({ queryKey: ['processing', processingId] });
      queryClient.invalidateQueries({ queryKey: ['measures', processingId] });
    },
    onError: (error) => onError(String(error)),
  });

  return (
    <Stack spacing={1.5}>
      <Box>
        <Typography variant="h2">6. Recalculate a historical period</Typography>
        <Typography variant="body2" color="text.secondary">
          Preview the affected output slots first. Existing values are replaced for the same variable and timestamp; no duplicate output series is created.
        </Typography>
      </Box>
      <Alert severity="info" variant="outlined">
        Recommended: use the configuration version historically valid for each slot. Force one version only for an intentional investigation and document why.
      </Alert>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField size="small" type="datetime-local" label="From" value={from} onChange={(event) => setFrom(event.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField size="small" type="datetime-local" label="To" value={to} onChange={(event) => setTo(event.target.value)} InputLabelProps={{ shrink: true }} />
        <FormControl size="small" sx={{ minWidth: 290 }}>
          <InputLabel id="lab-history-version">Configuration strategy</InputLabel>
          <Select labelId="lab-history-version" label="Configuration strategy" value={forcedVersionId} onChange={(event) => setForcedVersionId(event.target.value)}>
            <MenuItem value="">Use version valid for each slot</MenuItem>
            {usable.map((version) => <MenuItem key={version.id} value={version.id}>Force {version.label}</MenuItem>)}
          </Select>
        </FormControl>
        <Button variant="outlined" disabled={!from || !to || impact.isPending} onClick={() => impact.mutate()} data-testid="lab-history-preview">
          {impact.isPending ? 'Checking…' : 'Preview history run'}
        </Button>
      </Stack>
      {preview && (
        <Stack spacing={1}>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={`${preview.totals.slotCount} slots`} />
            <Chip size="small" color="success" label={`${preview.totals.withConfig} with config`} />
            <Chip size="small" color="info" label={`${preview.totals.withData} with data`} />
            <Chip size="small" color="warning" label={`${preview.totals.measuresToReplace} values replaced`} />
          </Stack>
          <Box sx={{ maxHeight: 260, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
            <Table size="small" stickyHeader aria-label="Analysis historical recalculation preview">
              <TableHead><TableRow><TableCell>Output slot</TableCell><TableCell>Version</TableCell><TableCell>Data</TableCell><TableCell align="right">Existing values</TableCell></TableRow></TableHead>
              <TableBody>
                {preview.slots.map((slot) => (
                  <TableRow key={slot.slot} hover>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{slot.slot}</TableCell>
                    <TableCell>{slot.versionLabel ?? 'No valid version'}</TableCell>
                    <TableCell><StatusChip status={slot.hasData ? 'ready' : 'missing'} /></TableCell>
                    <TableCell align="right">{slot.existingMeasures}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <TextField size="small" label="Reason for recalculation (required)" value={reason} onChange={(event) => setReason(event.target.value)} sx={{ minWidth: 380 }} data-testid="lab-history-reason" />
            <Button color="warning" variant="contained" disabled={!reason.trim() || execute.isPending} onClick={() => execute.mutate()} data-testid="lab-history-run">
              {execute.isPending ? 'Recalculating…' : 'Run historical recalculation'}
            </Button>
          </Stack>
        </Stack>
      )}
      {result && <Alert severity="success">{result.executed} slot(s) recalculated. Open processing runs to inspect each result.</Alert>}
    </Stack>
  );
}
