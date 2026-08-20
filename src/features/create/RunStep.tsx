import {
  Alert,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import type { WizardDraft } from '@/demo/draft';
import { AdvancedSection, UnitField } from '@/features/shared/components';

/**
 * Step 7 — when a run fires, and what it may do with missing or late data.
 *
 * Every option answers a question the field eventually asks: a station is late, a cycle is
 * incomplete, an observation arrives after its slot closed.
 */
export function RunStep({ draft, update }: { draft: WizardDraft; update: (p: Partial<WizardDraft>) => void }) {
  const r = draft.runPolicy;
  const patch = (p: Partial<typeof r>) => update({ runPolicy: { ...r, ...p } });
  return (
    <Stack spacing={2}>
      <Typography variant="h2">Run & synchronisation</Typography>
      <FormControl>
        <Typography variant="body2" fontWeight={600}>
          Trigger
        </Typography>
        <RadioGroup row value={r.trigger} onChange={(e) => patch({ trigger: e.target.value as typeof r.trigger })}>
          <FormControlLabel value="event-driven" control={<Radio />} label="Event-driven (default)" />
          <FormControlLabel value="schedule" control={<Radio />} label="Every X minutes" />
          <FormControlLabel value="manual" control={<Radio />} label="Manual only" />
        </RadioGroup>
      </FormControl>
      {r.trigger === 'schedule' && (
        <UnitField label="Check every" unit="min" value={r.scheduleEveryMinutes ?? 30} onChange={(v) => patch({ scheduleEveryMinutes: v })} step={5} />
      )}
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
        <UnitField label="Sync tolerance" unit="min" value={r.syncToleranceMinutes} onChange={(v) => patch({ syncToleranceMinutes: v })} step={1} />
        <FormControlLabel control={<Switch checked={r.reuseMissingStation} onChange={(e) => patch({ reuseMissingStation: e.target.checked })} />} label="Reuse last epoch when missing" />
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel id="max-age">Max reused age</InputLabel>
          <Select labelId="max-age" label="Max reused age" value={r.maxReusedAgeMinutes} onChange={(e) => patch({ maxReusedAgeMinutes: Number(e.target.value) })}>
            {[30, 45, 60, 90].map((v) => (
              <MenuItem key={v} value={v}>
                {v} min
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControlLabel control={<Switch checked={r.markReuseProvisional} onChange={(e) => patch({ markReuseProvisional: e.target.checked })} />} label="Mark reuse provisional (RUN-005)" />
        <FormControlLabel control={<Switch checked={r.computeWithoutOptionalStations} onChange={(e) => patch({ computeWithoutOptionalStations: e.target.checked })} />} label="Compute without optional stations" />
      </Stack>
      <Alert severity="info" variant="outlined">
        Example: sources at :25/:26/:32 publish the <b>09:30</b> slot when the tolerance allows it — source timestamps stay
        unchanged (TIME-003/004).
      </Alert>
      <AdvancedSection title="Catch-up">
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
          <FormControlLabel control={<Switch checked={r.catchUp.enabled} onChange={(e) => patch({ catchUp: { ...r.catchUp, enabled: e.target.checked } })} />} label="Catch-up enabled" />
          <FormControlLabel control={<Switch checked={r.catchUp.onLateObservation} onChange={(e) => patch({ catchUp: { ...r.catchUp, onLateObservation: e.target.checked } })} />} label="On late observation" />
          <FormControlLabel control={<Switch checked={r.catchUp.onLateEnvironment} onChange={(e) => patch({ catchUp: { ...r.catchUp, onLateEnvironment: e.target.checked } })} />} label="On late T/P" />
          <UnitField label="Window" unit="h" value={r.catchUp.windowHours} onChange={(v) => patch({ catchUp: { ...r.catchUp, windowHours: v } })} step={1} width={130} />
          <TextField size="small" type="number" label="Max recalcs/slot" value={r.catchUp.maxRecalculationsPerSlot} onChange={(e) => patch({ catchUp: { ...r.catchUp, maxRecalculationsPerSlot: Number(e.target.value) } })} sx={{ width: 150 }} />
        </Stack>
        <Typography variant="caption" color="text.secondary">
          A catch-up rewrites the SAME slot by UPSERT with the configuration historically valid at that slot (TIME-008, OUT-009).
        </Typography>
      </AdvancedSection>
    </Stack>
  );
}

// ------------------------------------------------------------------ step 8: Output
