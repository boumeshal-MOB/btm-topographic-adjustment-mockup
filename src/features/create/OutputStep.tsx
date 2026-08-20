import {
  Alert,
  Chip,
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
import { UnitField } from '@/features/shared/components';

/**
 * Step 8 — the output slots and what each one publishes.
 *
 * The slot grid is UTC and independent of the source epoch: `maxEpochToSlotMinutes` is how far an
 * epoch may sit from a slot before it stops being that slot's answer.
 */
export function OutputStep({ draft, update }: { draft: WizardDraft; update: (p: Partial<WizardDraft>) => void }) {
  const o = draft.outputPolicy;
  const patch = (p: Partial<typeof o>) => update({ outputPolicy: { ...o, ...p } });
  const published = draft.targets.filter((t) => t.publishOutput && t.includeInAdjustment);
  return (
    <Stack spacing={2}>
      <Typography variant="h2">Output</Typography>
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel id="interval">Output interval</InputLabel>
          <Select labelId="interval" label="Output interval" value={o.intervalMinutes} onChange={(e) => patch({ intervalMinutes: Number(e.target.value) })}>
            {[15, 30, 60].map((v) => (
              <MenuItem key={v} value={v}>
                {v} min {v === 30 ? '(:00/:30)' : ''}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <UnitField label="Max epoch→slot" unit="min" value={o.maxEpochToSlotMinutes} onChange={(v) => patch({ maxEpochToSlotMinutes: v })} step={1} width={180} />
        <FormControlLabel control={<Switch checked={o.publishProvisional} onChange={(e) => patch({ publishProvisional: e.target.checked })} />} label="Publish provisional results" />
        <Chip size="small" label="UTC grid alignment" variant="outlined" />
      </Stack>
      <Typography variant="body2">
        Stable variables created ONCE at creation and owned by the processing — a new configuration version never creates new
        variables (OUT-001/002). Recalculation replaces the same (variable, timestamp) by UPSERT (OUT-009).
      </Typography>
      <Alert severity="info">
        {published.length} published target(s) × {o.targetComponents.length} components (Adjusted/Delta/Sigma X·Y·Z, metres) +{' '}
        {o.globalComponents.length} processing-wide variables ({o.globalComponents.join(', ')}) ={' '}
        <b>{published.length * o.targetComponents.length + o.globalComponents.length} variables</b>
      </Alert>
    </Stack>
  );
}

// ------------------------------------------------------------------ step 9: Review & Create
