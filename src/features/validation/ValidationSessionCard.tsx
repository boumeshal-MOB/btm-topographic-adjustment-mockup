import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import { loadValidationDataset, loadValidationManifest } from '@/demo/validation-catalogue-gateway';
import { buildImportPlan, type FaceReductionPolicy } from '@/domain/validation-catalogue/adapter';
import type { ValidationOracle } from '@/domain/validation-catalogue/schema';

interface ValidationSessionSummary {
  processingId: number;
  datasetId: string;
  template: 'UK' | 'FR';
  faceReduction: FaceReductionPolicy;
  hydrated: boolean;
}

/**
 * Dataset context inside the Analysis Lab.
 *
 * Two responsibilities that both exist to keep blind mode honest:
 *
 *  - the answer is never persisted, so revealing it means fetching the shard again on demand.
 *    Closing the lab, or reloading the page, returns to blind;
 *  - only a pointer to the dataset survives a reload, so a session whose measurements are gone is
 *    reported as such and offers to rebuild them instead of rendering an empty network.
 */
export function ValidationSessionCard({ processingId }: { processingId: number }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [oracle, setOracle] = useState<ValidationOracle>();
  const [scenario, setScenario] = useState<{ primary: string; secondary: string | null }>();
  const [error, setError] = useState<string>();

  const sessions = useQuery({
    queryKey: ['validation-sessions'],
    queryFn: async () => {
      const response = await api<unknown>('GET', '/api/v2/validation-sessions');
      // Runtime boundary: this card lives inside the Analysis Lab, and a payload of another shape
      // used to throw during render and take the whole workspace — with its trials — down with it.
      if (!Array.isArray(response)) throw new Error('The validation session list has an unexpected shape.');
      return response as ValidationSessionSummary[];
    },
    // A tab returning to the foreground must not replace a valid session with a transient response.
    refetchOnWindowFocus: false,
  });
  const session = sessions.data?.find((candidate) => candidate.processingId === processingId);

  const entryFor = async (datasetId: string) => {
    const manifest = await loadValidationManifest();
    const entry = manifest.datasets.find((candidate) => candidate.id === datasetId);
    if (!entry) throw new Error(`Unknown dataset ${datasetId}`);
    return entry;
  };

  const reveal = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error('No validation session');
      const dataset = await loadValidationDataset(await entryFor(session.datasetId));
      return { oracle: dataset.oracle, scenario: dataset.scenario };
    },
    onSuccess: ({ oracle: revealed, scenario: revealedScenario }) => {
      setOracle(revealed);
      setScenario({ primary: revealedScenario.primary, secondary: revealedScenario.secondary });
    },
    onError: (value) => setError(value instanceof Error ? value.message : String(value)),
  });

  const rehydrate = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error('No validation session');
      const entry = await entryFor(session.datasetId);
      const dataset = await loadValidationDataset(entry);
      const plan = buildImportPlan(dataset, entry.template, { faceReduction: session.faceReduction });
      return api('POST', `/api/v2/validation-sessions/${processingId}/rehydrate`, { plan });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
    onError: (value) => setError(value instanceof Error ? value.message : String(value)),
  });

  if (!session) return null;

  const scenarioLabel = (value: string) => t(`validation.scenarios.${value}`, { defaultValue: value });

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} data-testid="validation-session-card">
      <Stack spacing={1.25}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ flexGrow: 1 }}>
            <Chip size="small" color="secondary" label={t('validation.session.badge')} />
            <Typography variant="subtitle2" fontFamily="monospace">
              {t('validation.session.title', { id: session.datasetId })}
            </Typography>
            <Chip size="small" variant="outlined" label={session.template} />
            <Chip
              size="small"
              variant="outlined"
              label={t('validation.session.faceReductionApplied', {
                policy: session.faceReduction === 'mean-of-faces'
                  ? t('validation.import.faceReductionMean')
                  : t('validation.import.faceReductionNone'),
              })}
            />
          </Stack>
          {oracle ? (
            <Button size="small" onClick={() => { setOracle(undefined); setScenario(undefined); }}>
              {t('validation.blind.hideAction')}
            </Button>
          ) : (
            <Button
              size="small"
              variant="outlined"
              color="warning"
              disabled={reveal.isPending || !session.hydrated}
              onClick={() => reveal.mutate()}
              data-testid="reveal-answer"
            >
              {reveal.isPending ? <CircularProgress size={16} /> : t('validation.blind.revealAction')}
            </Button>
          )}
        </Stack>

        <Typography variant="caption" color="text.secondary">{t('validation.session.epochHint')}</Typography>

        {!session.hydrated && (
          <Alert
            severity="warning"
            action={
              <Button
                size="small"
                disabled={rehydrate.isPending}
                onClick={() => rehydrate.mutate()}
                data-testid="rehydrate-session"
              >
                {rehydrate.isPending ? <CircularProgress size={16} /> : t('validation.session.rehydrate')}
              </Button>
            }
          >
            {t('validation.session.stale')}
          </Alert>
        )}

        {error && <Alert severity="error" onClose={() => setError(undefined)}>{error}</Alert>}

        {oracle && scenario && (
          <Alert severity="warning" variant="outlined" data-testid="revealed-oracle">
            <AlertTitle>{t('validation.blind.revealed')}</AlertTitle>
            <Stack spacing={0.75}>
              <Typography variant="caption">{t('validation.blind.revealWarning')}</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 0.75, alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary">
                  {t('validation.blind.expectedPrimary')}
                </Typography>
                <Typography variant="body2" fontWeight={700}>{scenarioLabel(scenario.primary)}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('validation.blind.expectedSecondary')}
                </Typography>
                <Typography variant="body2">
                  {scenario.secondary ? scenarioLabel(scenario.secondary) : t('validation.blind.none')}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                {t('validation.blind.recommendedActions')}
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {oracle.recommendedAnalysisActions.map((action, index) => (
                  <Chip key={`${action.action}-${index}`} size="small" variant="outlined" label={action.action} />
                ))}
              </Stack>
            </Stack>
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
