import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        <Typography variant="h2">{t('analysis.history.title')}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t('analysis.history.description')}
        </Typography>
      </Box>
      <Alert severity="info" variant="outlined">
        {t('analysis.history.recommendation')}
      </Alert>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField size="small" type="datetime-local" label={t('analysis.history.from')} value={from} onChange={(event) => setFrom(event.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField size="small" type="datetime-local" label={t('analysis.history.to')} value={to} onChange={(event) => setTo(event.target.value)} InputLabelProps={{ shrink: true }} />
        <FormControl size="small" sx={{ minWidth: 290 }}>
          <InputLabel id="lab-history-version">{t('analysis.history.strategy')}</InputLabel>
          <Select labelId="lab-history-version" label={t('analysis.history.strategy')} value={forcedVersionId} onChange={(event) => setForcedVersionId(event.target.value)}>
            <MenuItem value="">{t('analysis.history.validVersion')}</MenuItem>
            {usable.map((version) => <MenuItem key={version.id} value={version.id}>{t('analysis.history.force', { label: version.label })}</MenuItem>)}
          </Select>
        </FormControl>
        <Button variant="outlined" disabled={!from || !to || impact.isPending} onClick={() => impact.mutate()} data-testid="lab-history-preview">
          {impact.isPending ? t('analysis.history.checking') : t('analysis.history.preview')}
        </Button>
      </Stack>
      {preview && (
        <Stack spacing={1}>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={t('analysis.history.slots', { count: preview.totals.slotCount })} />
            <Chip size="small" color="success" label={t('analysis.history.withConfig', { count: preview.totals.withConfig })} />
            <Chip size="small" color="info" label={t('analysis.history.withData', { count: preview.totals.withData })} />
            <Chip size="small" color="warning" label={t('analysis.history.replaced', { count: preview.totals.measuresToReplace })} />
          </Stack>
          <Box sx={{ maxHeight: 260, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
            <Table size="small" stickyHeader aria-label={t('analysis.history.preview')}>
              <TableHead><TableRow><TableCell>{t('analysis.history.slot')}</TableCell><TableCell>{t('analysis.history.version')}</TableCell><TableCell>{t('analysis.history.data')}</TableCell><TableCell align="right">{t('analysis.history.existing')}</TableCell></TableRow></TableHead>
              <TableBody>
                {preview.slots.map((slot) => (
                  <TableRow key={slot.slot} hover>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{slot.slot}</TableCell>
                    <TableCell>{slot.versionLabel ?? t('analysis.history.noVersion')}</TableCell>
                    <TableCell><StatusChip status={slot.hasData ? 'ready' : 'missing'} /></TableCell>
                    <TableCell align="right">{slot.existingMeasures}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <TextField size="small" label={t('analysis.history.reason')} value={reason} onChange={(event) => setReason(event.target.value)} sx={{ minWidth: 380 }} data-testid="lab-history-reason" />
            <Button color="warning" variant="contained" disabled={!reason.trim() || execute.isPending} onClick={() => execute.mutate()} data-testid="lab-history-run">
              {execute.isPending ? t('analysis.history.running') : t('analysis.history.run')}
            </Button>
          </Stack>
        </Stack>
      )}
      {result && <Alert severity="success">{t('analysis.history.success', { count: result.executed })}</Alert>}
    </Stack>
  );
}
