import { Alert, Collapse } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { PersistResult } from '@/demo/persistence';

/**
 * Tells the user when their work has stopped being saved.
 *
 * Browser storage is finite: importing enough validation datasets fills it. Previously the write
 * failed silently, so the session kept working until the tab was closed — and the processing being
 * analysed was simply gone on the next visit. Saying it out loud is the difference between a
 * recoverable annoyance and lost work.
 */
export function StorageStatusBanner() {
  const { t } = useTranslation();
  const status = useQuery({
    queryKey: ['storage-status'],
    queryFn: () => api<PersistResult>('GET', '/api/v2/demo/storage'),
    refetchOnWindowFocus: true,
    refetchInterval: 20_000,
  });

  const value = status.data;
  const failed = value?.status === 'failed';
  const pruned = value?.status === 'pruned' && value.droppedDiagnostics > 0;

  return (
    <Collapse in={failed || pruned} unmountOnExit>
      <Alert severity={failed ? 'error' : 'info'} variant="outlined" data-testid="storage-status">
        {failed
          ? t('storage.failed')
          : t('storage.pruned', { count: value?.droppedDiagnostics ?? 0 })}
      </Alert>
    </Collapse>
  );
}
