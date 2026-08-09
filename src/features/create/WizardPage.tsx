import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Step,
  StepButton,
  Stepper,
  Typography,
} from '@mui/material';
import { api } from '@/api/client';
import { applyWizardDraftPatch, type WizardDraft } from '@/demo/draft';
import { GeneralConfigurationStep } from '@/features/create/GeneralConfigurationStep';
import { InitialisationNetworkStep } from '@/features/create/InitialisationNetworkStep';
import {
  AdjustmentStep,
  InstrumentsStep,
  OutputStep,
  ReviewStep,
  RunStep,
  StationsStep,
} from '@/features/create/LegacyWizardPage';
import { TargetsAndNetworkStep } from '@/features/create/TargetsAndNetworkStep';

const STEP_KEYS = ['general', 'stations', 'instruments', 'targets', 'initialisation', 'adjustment', 'run', 'output', 'review'] as const;

/**
 * One state owner for the complete nine-step journey. Individual step components may evolve
 * independently, but they never mount a second editor or poll one another for draft changes.
 */
export default function WizardPage() {
  const { t, i18n } = useTranslation();
  const { draftId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<WizardDraft>();
  const [error, setError] = useState<string>();

  const draftQuery = useQuery({
    queryKey: ['draft', draftId],
    queryFn: () => api<WizardDraft>('GET', `/api/v2/drafts/${draftId}`),
    enabled: Boolean(draftId),
  });

  useEffect(() => {
    const incoming = draftQuery.data;
    if (!incoming) return;
    if (!draft) setDraft(incoming);
  }, [draftQuery.data, draft]);

  const save = useMutation({
    mutationFn: (next: WizardDraft) => api<WizardDraft>('PUT', `/api/v2/drafts/${next.id}`, next),
    onSuccess: (saved) => {
      setDraft(saved);
      queryClient.setQueryData(['draft', saved.id], saved);
      void queryClient.invalidateQueries({ queryKey: ['drafts'] });
      void queryClient.invalidateQueries({ queryKey: ['connectivity'] });
      void queryClient.invalidateQueries({ queryKey: ['observation-cycles', saved.id] });
    },
    onError: (saveError) => setError(String(saveError)),
  });

  const replaceDraft = (next: WizardDraft) => {
    setDraft(next);
    queryClient.setQueryData(['draft', next.id], next);
  };

  const update = (patch: Partial<WizardDraft>) => {
    if (!draft) return;
    const next = applyWizardDraftPatch(draft, patch);
    replaceDraft(next);
    save.mutate(next);
  };

  if (!draft) {
    return (
      <Container sx={{ py: 4 }}>
        {draftQuery.isError ? <Alert severity="error">{t('wizard.draftMissing')}</Alert> : <CircularProgress aria-label={t('wizard.loading')} />}
      </Container>
    );
  }

  const setStep = (next: number) => update({ step: Math.max(0, Math.min(STEP_KEYS.length - 1, next)) });

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h1">
            {draft.editContext
              ? t('wizard.editTitle', { name: draft.name || t('wizard.defaultName') })
              : t('wizard.newTitle')}
          </Typography>
          <Chip
            size="small"
            label={t('wizard.draftSaved', {
              time: new Date(draft.updatedAt).toLocaleTimeString(i18n.resolvedLanguage),
            })}
            variant="outlined"
          />
        </Stack>
        <Box sx={{ overflowX: 'auto', pb: 0.5 }}>
          <Stepper nonLinear activeStep={draft.step} alternativeLabel sx={{ minWidth: 900 }}>
            {STEP_KEYS.map((key, index) => (
              <Step key={key} completed={index < draft.step}>
                <StepButton onClick={() => setStep(index)}>{t(`wizard.steps.${key}`)}</StepButton>
              </Step>
            ))}
          </Stepper>
        </Box>
        {error && <Alert severity="error" onClose={() => setError(undefined)}>{error}</Alert>}
        {draft.editContext && (
          <Alert severity="info" variant="outlined">
            {t('wizard.editingVersion', { version: draft.editContext.baseVersionLabel })}
          </Alert>
        )}
        <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2.5, md: 3 } }}>
          {draft.step === 0 && (
            <GeneralConfigurationStep
              draft={draft}
              setDraft={replaceDraft}
              update={update}
              onError={setError}
            />
          )}
          {draft.step === 1 && (
            <StationsStep draft={draft} setDraft={replaceDraft} onError={setError} />
          )}
          {draft.step === 2 && <InstrumentsStep draft={draft} update={update} />}
          {draft.step === 3 && <TargetsAndNetworkStep draft={draft} update={update} onError={setError} />}
          {draft.step === 4 && (
            <InitialisationNetworkStep
              draft={draft}
              setDraft={replaceDraft}
              update={update}
              onError={setError}
            />
          )}
          {draft.step === 5 && (
            <AdjustmentStep
              draft={draft}
              update={update}
              setDraft={replaceDraft}
              onError={setError}
            />
          )}
          {draft.step === 6 && <RunStep draft={draft} update={update} />}
          {draft.step === 7 && <OutputStep draft={draft} update={update} />}
          {draft.step === 8 && (
            <ReviewStep
              draft={draft}
              onError={setError}
              onCreated={(processingId) => navigate(`/processing/topographic-adjustment/${processingId}`)}
            />
          )}
        </Paper>
        <Stack
          direction="row"
          justifyContent="space-between"
          sx={{
            position: 'sticky',
            bottom: 8,
            zIndex: 2,
            bgcolor: 'rgba(255,255,255,.94)',
            backdropFilter: 'blur(8px)',
            p: 1,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
          }}
        >
          <Button variant="outlined" disabled={draft.step === 0} onClick={() => setStep(draft.step - 1)}>{t('common.back')}</Button>
          <Button
            variant="contained"
            disabled={draft.step === STEP_KEYS.length - 1}
            onClick={() => setStep(draft.step + 1)}
          >
            {t('common.next')}
          </Button>
        </Stack>
      </Stack>
    </Container>
  );
}
