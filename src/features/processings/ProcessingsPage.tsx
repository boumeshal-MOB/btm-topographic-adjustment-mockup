import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { api } from '@/api/client';
import type { TopographicAdjustmentProcessing } from '@/domain/entities';
import type { WizardDraft } from '@/demo/draft';
import { AdvancedSection, StatusChip } from '@/features/shared/components';
import type { AuditEntry } from '@/features/shared/types';

/**
 * Administration entry point (PRODUIT-ET-PARCOURS.md): processings list, resumable wizard drafts and the
 * demo utilities (late data, reset). Every action shown here works — no dead buttons.
 */
export default function ProcessingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string>();

  const processings = useQuery({
    queryKey: ['processings'],
    queryFn: () => api<TopographicAdjustmentProcessing[]>('GET', '/api/v2/projects/1/topographic-adjustments'),
  });
  const drafts = useQuery({ queryKey: ['drafts'], queryFn: () => api<WizardDraft[]>('GET', '/api/v2/drafts') });
  const catalogue = useQuery({
    queryKey: ['catalogue'],
    queryFn: () => api<{ lateDataDelivered: boolean }>('GET', '/api/v2/catalogue'),
  });
  const audit = useQuery({ queryKey: ['audit'], queryFn: () => api<AuditEntry[]>('GET', '/api/v2/audit') });

  const invalidateAll = () => queryClient.invalidateQueries();

  // Scope and country preset are chosen in wizard step 1 (single source of truth); a new draft
  // starts from a sensible default and the wizard lets the user change both before selecting data.
  const createDraft = useMutation({
    mutationFn: () =>
      api<WizardDraft>('POST', '/api/v2/drafts', { presetId: 'uk-supplied-hs2-nte', scope: 'single-station' }),
    onSuccess: (draft) => navigate(`/create/${draft.id}`),
    onError: (e) => setError(String(e)),
  });
  const deleteDraft = useMutation({
    mutationFn: (id: string) => api<{ ok: boolean }>('DELETE', `/api/v2/drafts/${id}`),
    onSuccess: invalidateAll,
    onError: (e) => setError(String(e)),
  });
  const action = useMutation({
    mutationFn: (args: { id: number; action: 'activate' | 'deactivate' | 'archive' | 'duplicate' }) =>
      api<TopographicAdjustmentProcessing>('POST', `/api/v2/topographic-adjustments/${args.id}/actions`, {
        action: args.action,
      }),
    onSuccess: invalidateAll,
    onError: (e) => setError(String(e)),
  });
  const edit = useMutation({
    mutationFn: (id: number) => api<WizardDraft>('POST', `/api/v2/topographic-adjustments/${id}/edit-draft`, {}),
    onSuccess: (draft) => navigate(`/create/${draft.id}`),
    onError: (e) => setError(String(e)),
  });
  const lateData = useMutation({
    mutationFn: () => api<{ delivered: number }>('POST', '/api/v2/demo/late-data'),
    onSuccess: (r) => {
      setError(undefined);
      invalidateAll();
      if (r.delivered === 0) setError('Late data was already delivered — nothing new to deliver.');
    },
    onError: (e) => setError(String(e)),
  });
  const reset = useMutation({
    mutationFn: () => api<{ ok: boolean }>('POST', '/api/v2/demo/reset'),
    onSuccess: invalidateAll,
    onError: (e) => setError(String(e)),
  });

  if (processings.isLoading || drafts.isLoading) {
    return (
      <Container sx={{ py: 4 }}>
        <CircularProgress aria-label={t('home.loading')} />
      </Container>
    );
  }
  if (processings.isError) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">Could not load processings: {String(processings.error)}</Alert>
      </Container>
    );
  }

  const list = processings.data ?? [];
  const draftList = drafts.data ?? [];

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap gap={1}>
          <Typography variant="h1">{t('home.title')}</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              variant="outlined"
              onClick={() => navigate('/validation-catalogue')}
              data-testid="open-validation-catalogue"
            >
              {t('validation.openFromHome')}
            </Button>
            <Button
              variant="contained"
              onClick={() => createDraft.mutate()}
              disabled={createDraft.isPending}
              data-testid="new-processing"
            >
              {t('home.newProcessing')}
            </Button>
          </Stack>
        </Stack>

        {error && (
          <Alert severity="error" onClose={() => setError(undefined)}>
            {error}
          </Alert>
        )}

        <Paper variant="outlined">
          {list.length === 0 ? (
            <Box p={3}>
              <Alert severity="info">{t('home.empty')}</Alert>
            </Box>
          ) : (
            <Table size="small" aria-label="Processings">
              <TableHead>
                <TableRow>
                  <TableCell>{t('home.name')}</TableCell>
                  <TableCell>{t('home.scope')}</TableCell>
                  <TableCell>{t('home.status')}</TableCell>
                  <TableCell>{t('home.enabled')}</TableCell>
                  <TableCell>{t('home.updated')}</TableCell>
                  <TableCell align="right">{t('home.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {list.map((p) => (
                  <TableRow key={p.id} hover>
                    <TableCell>
                      <Button size="small" onClick={() => navigate(`/processing/topographic-adjustment/${p.id}`)} data-testid={`open-processing-${p.id}`}>
                        {p.name}
                      </Button>
                    </TableCell>
                    <TableCell>{p.scope}</TableCell>
                    <TableCell>
                      <StatusChip status={p.status} />
                    </TableCell>
                    <TableCell>{p.active ? <Chip size="small" color="success" label={t('enums.status.active')} /> : <Chip size="small" label={t('enums.status.disabled')} />}</TableCell>
                    <TableCell>{new Date(p.updatedAt).toLocaleString()}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                        <Button size="small" variant="outlined" onClick={() => edit.mutate(p.id)} data-testid={`edit-processing-${p.id}`}>
                          {t('home.edit')}
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => navigate(`/processing/topographic-adjustment/${p.id}/analysis`)}
                          data-testid={`open-analysis-lab-${p.id}`}
                        >
                          {t('home.analysisLab')}
                        </Button>
                        {p.active ? (
                          <Button size="small" onClick={() => action.mutate({ id: p.id, action: 'deactivate' })}>
                            {t('home.deactivate')}
                          </Button>
                        ) : p.activeConfigVersionId ? (
                          <Button size="small" onClick={() => action.mutate({ id: p.id, action: 'activate' })}>
                            {t('home.enable')}
                          </Button>
                        ) : (
                          <Chip size="small" variant="outlined" label={t('home.configurationNotActive')} />
                        )}
                        <Button size="small" onClick={() => action.mutate({ id: p.id, action: 'duplicate' })}>
                          {t('home.duplicate')}
                        </Button>
                        <Button size="small" color="warning" onClick={() => action.mutate({ id: p.id, action: 'archive' })}>
                          {t('home.archive')}
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>

        {draftList.length > 0 && (
          <Paper variant="outlined">
            <Box px={2} pt={2}>
              <Typography variant="h2">Wizard drafts</Typography>
              <Typography variant="body2" color="text.secondary">
                Drafts survive reloads — resume where you left off.
              </Typography>
            </Box>
            <Table size="small" aria-label="Drafts">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Template</TableCell>
                  <TableCell>Scope</TableCell>
                  <TableCell>Step</TableCell>
                  <TableCell>Updated</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {draftList.map((d) => (
                  <TableRow key={d.id} hover>
                    <TableCell>{d.name || '(untitled)'}</TableCell>
                    <TableCell>{d.countryPresetId === 'uk-supplied-hs2-nte' ? 'UK' : 'France'}</TableCell>
                    <TableCell>{d.scope}</TableCell>
                    <TableCell>{d.step + 1}/9</TableCell>
                    <TableCell>{new Date(d.updatedAt).toLocaleString()}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Button size="small" variant="outlined" onClick={() => navigate(`/create/${d.id}`)} data-testid={`resume-draft-${d.id}`}>
                          Resume
                        </Button>
                        <Button size="small" color="error" onClick={() => deleteDraft.mutate(d.id)}>
                          Delete
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}

        <AdvancedSection title="Demo utilities & audit journal">
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Button
                size="small"
                variant="outlined"
                onClick={() => lateData.mutate()}
                disabled={lateData.isPending || catalogue.data?.lateDataDelivered}
              >
                Deliver late SYN_C data (catch-up material)
              </Button>
              {catalogue.data?.lateDataDelivered && <Chip size="small" color="warning" label="late data delivered" />}
              <Button size="small" color="error" variant="outlined" onClick={() => reset.mutate()} disabled={reset.isPending}>
                Reset demo data
              </Button>
              <Typography variant="caption" color="text.secondary">
                Simulated dataset actions — clearly demo-only (DEMO-004).
              </Typography>
            </Stack>
            <Box sx={{ maxHeight: 260, overflowY: 'auto' }}>
              <Table size="small" aria-label="Audit journal">
                <TableHead>
                  <TableRow>
                    <TableCell>When</TableCell>
                    <TableCell>Action</TableCell>
                    <TableCell>Subject</TableCell>
                    <TableCell>Detail</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {[...(audit.data ?? [])].reverse().slice(0, 50).map((entry, index) => (
                    <TableRow key={`${entry.at}-${index}`}>
                      <TableCell>{new Date(entry.at).toLocaleString()}</TableCell>
                      <TableCell>{entry.action}</TableCell>
                      <TableCell>{entry.subject}</TableCell>
                      <TableCell>{entry.detail}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Stack>
        </AdvancedSection>
      </Stack>
    </Container>
  );
}
