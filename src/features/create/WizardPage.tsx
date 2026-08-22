import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
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
  Tooltip,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import { applyWizardDraftPatch, type WizardDraft } from '@/demo/draft';
import { INITIALISATION_STEP, wizardStepGate } from '@/features/create/wizard-gate';
import { GeneralConfigurationStep } from '@/features/create/GeneralConfigurationStep';
import { InitialisationNetworkStep } from '@/features/create/InitialisationNetworkStep';
import { AdjustmentStep } from '@/features/create/AdjustmentStep';
import { InstrumentsStep } from '@/features/create/InstrumentsStep';
import { OutputStep } from '@/features/create/OutputStep';
import { ReviewStep } from '@/features/create/ReviewStep';
import { RunStep } from '@/features/create/RunStep';
import { StationsStep } from '@/features/create/StationsStep';
import { TargetsAndNetworkStep } from '@/features/create/TargetsAndNetworkStep';

/**
 * The nine intentions of a draft, in order. Keys rather than words: the stepper sits on top of every
 * screen, so an untranslated label there was the most visible English in the French interface.
 *
 * `adjustment` reads "Compensation" in French, not "Ajustement": a least-squares network adjustment
 * is a *compensation* in French surveying, which is also what the application title says.
 */
const STEP_KEYS = [
  'general',
  'stations',
  'instruments',
  'targets',
  'initialisation',
  'adjustment',
  'run',
  'output',
  'review',
] as const;

/**
 * One state owner for the complete nine-step journey. Individual step components may evolve
 * independently, but they never mount a second editor or poll one another for draft changes.
 */
export default function WizardPage() {
  const { t } = useTranslation();
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
        {draftQuery.isError ? <Alert severity="error">Draft not found.</Alert> : <CircularProgress aria-label="Loading draft" />}
      </Container>
    );
  }

  const setStep = (next: number) => update({ step: Math.max(0, Math.min(STEP_KEYS.length - 1, next)) });
  const gate = wizardStepGate(draft, draft.step);

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h1">
            {draft.editContext
              ? t('wizard.editProcessing', { name: draft.name || t('wizard.newProcessing') })
              : t('wizard.newProcessing')}
          </Typography>
          <Chip
            size="small"
            label={t('wizard.draftSaved', { time: new Date(draft.updatedAt).toLocaleTimeString() })}
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
            Editing {draft.editContext.baseVersionLabel}. Its history stays unchanged; saving creates a new configuration version and reuses the processing&apos;s existing output variables.
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
              onGoToTargets={() => setStep(3)}
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
          <Button variant="outlined" disabled={draft.step === 0} onClick={() => setStep(draft.step - 1)}>Back</Button>
          {/**
            * The step's own decision sits next to `Next`, where the user is already looking: accepting
            * the approximate coordinates is what unlocks the rest of the wizard, so the two buttons
            * belong side by side rather than one at the top of a long results table.
            */}
          {draft.step === INITIALISATION_STEP && draft.initialisation.result && (
            <Button
              variant="contained"
              color="success"
              disabled={draft.initialisation.result.accepted || draft.initialisation.result.failures.length > 0}
              onClick={() => update({
                initialisation: {
                  ...draft.initialisation,
                  result: { ...draft.initialisation.result!, accepted: true },
                },
              })}
              data-testid="use-as-initial"
            >
              {draft.initialisation.result.accepted
                ? t('wizard.initialisation.accepted')
                : t('wizard.initialisation.useAsInitial')}
            </Button>
          )}
          <Tooltip title={gate.blocked ? t(`wizard.gate.${gate.reason}`) : ''}>
            <span>
              <Button
                variant="contained"
                disabled={draft.step === STEP_KEYS.length - 1 || gate.blocked}
                onClick={() => setStep(draft.step + 1)}
                data-testid="wizard-next"
              >
                Next
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Stack>
    </Container>
  );
}
