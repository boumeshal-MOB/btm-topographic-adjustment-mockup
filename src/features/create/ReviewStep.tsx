import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Stack,
  Typography,
} from '@mui/material';
import { api } from '@/api/client';
import { draftEngineNameCollisions, resolveDraftPhysicalIdentities, type WizardDraft } from '@/demo/draft';
import { millimetres } from '@/features/shared/format';

/**
 * Step 9 — the last screen before an immutable configuration version exists.
 *
 * Creating without activating is a real case (a processing prepared ahead of the survey), so the two
 * actions are two buttons rather than a checkbox on one.
 */
export function ReviewStep({ draft, onError, onCreated }: { draft: WizardDraft; onError: (m: string) => void; onCreated: (id: number) => void }) {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: (activate: boolean) =>
      draft.editContext
        ? api<{ processing: { id: number } }>('PUT', `/api/v2/topographic-adjustments/${draft.editContext.processingId}`, {
            draftId: draft.id,
            activate,
          })
        : api<{ processing: { id: number } }>('POST', '/api/v2/projects/1/topographic-adjustments', { draftId: draft.id, activate }),
    onSuccess: (result) => {
      queryClient.invalidateQueries();
      onCreated(result.processing.id);
    },
    onError: (e) => onError(String(e)),
  });
  const blockers: string[] = [];
  if (!draft.name.trim()) blockers.push('Processing name is required (step 1).');
  if (draft.stationCodes.length === 0) blockers.push('Select at least one station (step 2).');
  if (draft.scope === 'network' && draft.stationCodes.length < 2) blockers.push('A network needs at least two stations (PROC-004).');
  if (!draft.initialisation.result?.accepted) blockers.push('Compute and accept initial coordinates (step 5).');
  const physicalIdentities = resolveDraftPhysicalIdentities(draft);
  const engineNames = physicalIdentities.identities.map((identity) => identity.engineName);
  const collisions = draftEngineNameCollisions(draft);
  if (collisions.length > 0) blockers.push(`Engine name collision across physical points: ${collisions.join(', ')} (NAME-006 blocks Review).`);
  if (physicalIdentities.duplicateMembers.length > 0) {
    blockers.push(`Targets assigned to more than one shared point: ${physicalIdentities.duplicateMembers.join(', ')}.`);
  }
  const warnings: string[] = [];
  if (draft.weightsRequireValidation) warnings.push('FR weights are manufacturer proposals — activation blocked until validated (D-05).');
  if (!draft.testEpochPassed) {
    warnings.push('No successful adjustment preparation test yet — “Create and activate” stays disabled.');
  }
  const nonZero = draft.targets.filter((t) => t.measurementType !== 'reflectorless' && Math.abs(t.requiredConstantM - t.alreadyAppliedConstantM) > 1e-9);
  return (
    <Stack spacing={2}>
      <Typography variant="h2">{draft.editContext ? 'Review & Save' : 'Review & Create'}</Typography>
      {blockers.map((b) => (
        <Alert key={b} severity="error">
          {b}
        </Alert>
      ))}
      {warnings.map((w) => (
        <Alert key={w} severity="warning">
          {w}
        </Alert>
      ))}
      <Stack spacing={0.5}>
        <Typography variant="body2">
          <b>{draft.name || '(unnamed)'}</b> — {draft.scope}, preset {draft.countryPresetId}, valid from {draft.validFrom}
        </Typography>
        <Typography variant="body2">
          Stations: {draft.stationCodes.join(', ')} · {draft.targets.filter((t) => t.includeInAdjustment).length} targets included ·{' '}
          {draft.targets.filter((t) => t.publishOutput).length} published · {draft.sharedPoints.length} confirmed shared point(s)
        </Typography>
        <Typography variant="body2">
          Non-zero corrections: {nonZero.length} target(s) ({[...new Set(nonZero.map((t) => `${millimetres(t.requiredConstantM - t.alreadyAppliedConstantM, 1)} mm`))].join(', ') || '—'})
        </Typography>
        <Typography variant="body2">
          Initialisation: {draft.initialisation.mode} · coverage{' '}
          {draft.initialisation.result
            ? `${draft.initialisation.result.coverage.availableStationTargetPairs}/${draft.initialisation.result.coverage.expectedStationTargetPairs} pairs`
            : '—'}
        </Typography>
        <Typography variant="body2">
          STAR*NET: {draft.adjustment.angleOutputUnits}, refraction {draft.adjustment.indexOfRefraction}, radius {draft.adjustment.earthRadiusM} m, converge{' '}
          {draft.adjustment.convergeLimit} (unitless), {draft.adjustment.maximumIterations} it., χ² {draft.adjustment.chiSquareSignificancePercent}% — on failure:{' '}
          {draft.chiSquareFailurePolicy}
        </Typography>
        <Typography variant="body2">
          Run: {draft.runPolicy.trigger}, tolerance {draft.runPolicy.syncToleranceMinutes} min, reuse ≤ {draft.runPolicy.maxReusedAgeMinutes} min · Output every{' '}
          {draft.outputPolicy.intervalMinutes} min
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Engine names written to the .dat: {engineNames.slice(0, 10).join(', ')}
          {engineNames.length > 10 ? ` … (+${engineNames.length - 10})` : ''}
        </Typography>
      </Stack>
      <Stack direction="row" spacing={2}>
        <Button variant="outlined" disabled={blockers.length > 0 || create.isPending} onClick={() => create.mutate(false)} data-testid="create-inactive">
          {draft.editContext ? 'Save as draft version' : 'Create inactive'}
        </Button>
        <Button
          variant="contained"
          color="success"
          disabled={blockers.length > 0 || !draft.testEpochPassed || draft.weightsRequireValidation || create.isPending}
          onClick={() => create.mutate(true)}
          data-testid="create-activate"
        >
          {draft.editContext ? 'Save and activate version' : 'Create and activate'}
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {draft.editContext
          ? 'The source version remains immutable. Existing output variable IDs are preserved; only missing mappings for newly published targets are added.'
          : 'Creation is atomic: processing + version 1 + physical point mappings + stable output variables — nothing partial on failure.'}
      </Typography>
    </Stack>
  );
}
