import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import {
  Alert,
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
  Box,
} from '@mui/material';
import { api } from '@/api/client';
import { applyWizardDraftPatch, type WizardDraft } from '@/demo/draft';
import { InitialisationNetworkStep } from '@/features/create/InitialisationNetworkStep';
import LegacyWizardPage from '@/features/create/LegacyWizardPage';
import { TargetsAndNetworkStep } from '@/features/create/TargetsAndNetworkStep';

const STEPS = ['General', 'Stations', 'Instruments', 'Targets & Measurements', 'Initialisation', 'Adjustment', 'Run', 'Output', 'Review & Create'];

/**
 * Network-focused shell for steps 4 and 5. Other steps continue to use the consolidated legacy
 * wizard unchanged, which keeps this PR isolated while the two network workflows are redesigned.
 */
export default function WizardPage() {
  const { draftId } = useParams();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<WizardDraft>();
  const [error, setError] = useState<string>();

  const draftQuery = useQuery({
    queryKey: ['draft', draftId],
    queryFn: () => api<WizardDraft>('GET', `/api/v2/drafts/${draftId}`),
    enabled: Boolean(draftId),
  });

  useEffect(() => {
    if (draftQuery.data && !draft) setDraft(draftQuery.data);
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

  if (draft.step !== 3 && draft.step !== 4) return <LegacyWizardPage />;

  const setStep = (next: number) => update({ step: Math.max(0, Math.min(STEPS.length - 1, next)) });

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h1">
            {draft.editContext ? `Edit ${draft.name || 'Topographic Adjustment'}` : 'New Topographic Adjustment'}
          </Typography>
          <Chip size="small" label={`Draft saved ${new Date(draft.updatedAt).toLocaleTimeString()}`} variant="outlined" />
        </Stack>
        <Box sx={{ overflowX: 'auto', pb: 0.5 }}>
          <Stepper nonLinear activeStep={draft.step} alternativeLabel sx={{ minWidth: 900 }}>
            {STEPS.map((label, index) => (
              <Step key={label} completed={index < draft.step}>
                <StepButton onClick={() => setStep(index)}>{label}</StepButton>
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
          {draft.step === 3 && <TargetsAndNetworkStep draft={draft} update={update} onError={setError} />}
          {draft.step === 4 && (
            <InitialisationNetworkStep
              draft={draft}
              setDraft={replaceDraft}
              update={update}
              onError={setError}
            />
          )}
        </Paper>
        <Stack
          direction="row"
          justifyContent="space-between"
          sx={{ position: 'sticky', bottom: 8, zIndex: 2, bgcolor: 'rgba(255,255,255,.94)', backdropFilter: 'blur(8px)', p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
        >
          <Button variant="outlined" onClick={() => setStep(draft.step - 1)}>Back</Button>
          <Button variant="contained" onClick={() => setStep(draft.step + 1)}>Next</Button>
        </Stack>
      </Stack>
    </Container>
  );
}
