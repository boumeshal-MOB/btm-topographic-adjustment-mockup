import {
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import type { WizardDraft } from '@/demo/draft';
import { OutputVariablesPreview } from '@/features/create/OutputVariablesPreview';
import { RuleExample } from '@/features/shared/RuleExample';
import { UnitField } from '@/features/shared/components';

/**
 * Step 8 — the output slots and what each one publishes.
 *
 * The slot grid is UTC and independent of the source epoch: `maxEpochToSlotMinutes` is how far an
 * epoch may sit from a slot before it stops being that slot's answer. That is the same job as the
 * Run step's sync tolerance, and the resolver takes whichever of the two is tighter — a `min()` in
 * `slots.ts` that used to be invisible and is now stated on both screens.
 */
export function OutputStep({ draft, update }: { draft: WizardDraft; update: (p: Partial<WizardDraft>) => void }) {
  const o = draft.outputPolicy;
  const patch = (p: Partial<typeof o>) => update({ outputPolicy: { ...o, ...p } });
  const tighter = Math.min(o.maxEpochToSlotMinutes, draft.runPolicy.syncToleranceMinutes);
  return (
    <Stack spacing={2}>
      <Stack spacing={0.25}>
        <Typography variant="h2">Output</Typography>
        <Typography variant="body2" color="text.secondary">
          The timestamps this processing writes to, and which results are allowed to reach them.
        </Typography>
      </Stack>

      <Stack spacing={1.25}>
        <RuleExample
          example={(
            <>
              At 30 min, the grid is 09:00, 09:30, 10:00… and a cycle measured at 10:26 publishes under{' '}
              <b>10:30</b>. The grid exists so that a series has regular timestamps, so that several stations share one
              instant to publish, and so that a recalculation can <i>replace</i> a value instead of adding an irregular
              point next to it.
            </>
          )}
        >
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel id="interval">Publish every</InputLabel>
            <Select labelId="interval" label="Publish every" value={o.intervalMinutes} onChange={(e) => patch({ intervalMinutes: Number(e.target.value) })}>
              {[15, 30, 60].map((v) => (
                <MenuItem key={v} value={v}>
                  {v} min {v === 30 ? '(:00/:30)' : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </RuleExample>

        <RuleExample
          example={(
            <>
              This is the same question as the Run step&apos;s <b>max cycle → slot gap</b>, and the resolver uses whichever
              is tighter — currently <b>{tighter} min</b>
              {tighter === o.maxEpochToSlotMinutes && tighter !== draft.runPolicy.syncToleranceMinutes && ' (this one)'}
              {tighter === draft.runPolicy.syncToleranceMinutes && tighter !== o.maxEpochToSlotMinutes && ' (the Run step’s)'}
              . Two fields, one effect: raising only one of them changes nothing.
            </>
          )}
        >
          <UnitField label="Max epoch→slot" unit="min" value={o.maxEpochToSlotMinutes} onChange={(v) => patch({ maxEpochToSlotMinutes: v })} step={1} width={190} />
        </RuleExample>

        <RuleExample
          example={(
            <>
              A run is provisional when a cycle was reused, when a fallback atmosphere was substituted — or when the χ²
              test is <b>not applicable</b> because the network has no redundancy, which is the ordinary situation of a
              point seen by a single sight. Switched off, all of those publish <i>nothing</i>: the run ends{' '}
              <code>provisional</code> with <code>provisional-not-published</code> and the slot stays empty. A gap in a
              series is harder to notice than a flagged value.
            </>
          )}
        >
          <FormControlLabel control={<Switch checked={o.publishProvisional} onChange={(e) => patch({ publishProvisional: e.target.checked })} />} label="Publish provisional results" />
        </RuleExample>
      </Stack>

      <Typography variant="body2">
        Stable variables created ONCE at creation and owned by the processing — a new configuration version never creates new
        variables (OUT-001/002). Recalculation replaces the same (variable, timestamp) by UPSERT (OUT-009).
      </Typography>
      {/* The variables themselves, valued on the cycle the adjustment was built on. A count said how
          many series would exist; it never said whether one of them was two metres out. */}
      <OutputVariablesPreview draft={draft} />
    </Stack>
  );
}

// ------------------------------------------------------------------ step 9: Review & Create
