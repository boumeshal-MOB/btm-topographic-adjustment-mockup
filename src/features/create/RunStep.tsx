import { type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Chip,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { api } from '@/api/client';
import type { DraftObservationCycles } from '@/demo/network-workflow';
import type { WizardDraft } from '@/demo/draft';
import { SlotTimeline } from '@/features/create/SlotTimeline';
import { RuleExample } from '@/features/shared/RuleExample';
import { UnitField } from '@/features/shared/components';

/**
 * Step 7 — when a run fires, and what it may do with missing or late data.
 *
 * Every option here answers a question the field eventually asks: a station is late, a cycle is
 * incomplete, an observation arrives after its slot closed. None of them can be understood from
 * its label alone — "sync tolerance" does not say *what* is synchronised with *what* — so each
 * carries a worked example, and the screen opens on a timeline of the real data (`SlotTimeline`)
 * rather than on a paragraph.
 *
 * The controls are grouped by the object they govern, which is the distinction that was missing:
 * attaching one station's acquisition cycle to a publication slot, deciding what to do when that
 * station delivered nothing, and reopening a slot already published.
 */

function GroupCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 2 }}>
      <Stack spacing={1.25}>
        <Stack spacing={0.25}>
          <Typography variant="h3" sx={{ fontSize: '1rem', fontWeight: 700 }}>
            {title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        </Stack>
        {children}
      </Stack>
    </Paper>
  );
}

export function RunStep({ draft, update }: { draft: WizardDraft; update: (p: Partial<WizardDraft>) => void }) {
  const r = draft.runPolicy;
  const patch = (p: Partial<typeof r>) => update({ runPolicy: { ...r, ...p } });
  const patchCatchUp = (p: Partial<typeof r.catchUp>) => patch({ catchUp: { ...r.catchUp, ...p } });
  const isNetwork = draft.scope === 'network';

  const cycles = useQuery({
    queryKey: ['draft', draft.id, 'observation-cycles'],
    queryFn: () => api<DraftObservationCycles>('GET', `/api/v2/drafts/${draft.id}/observation-cycles`),
    enabled: draft.stationCodes.length > 0,
  });

  const setRequired = (stationCode: string, required: boolean) =>
    update({
      stations: draft.stations.map((station) => (station.stationCode === stationCode ? { ...station, required } : station)),
    });

  return (
    <Stack spacing={2}>
      <Stack spacing={0.25}>
        <Typography variant="h2">Run &amp; synchronisation</Typography>
        <Typography variant="body2" color="text.secondary">
          A station measures when it measures; the processing publishes on a regular UTC grid. Everything on this screen
          decides how the first becomes the second.
        </Typography>
      </Stack>

      {cycles.data && (
        <SlotTimeline
          stations={cycles.data.byStation}
          intervalMinutes={draft.outputPolicy.intervalMinutes}
          syncToleranceMinutes={r.syncToleranceMinutes}
          maxReusedAgeMinutes={r.maxReusedAgeMinutes}
          maxEpochToSlotMinutes={draft.outputPolicy.maxEpochToSlotMinutes}
          reuseMissingStation={r.reuseMissingStation}
        />
      )}

      <GroupCard
        title="Attaching a station cycle to a publication slot"
        subtitle="One station's turn of the instrument, and the grid timestamp it answers for."
      >
        <RuleExample
          example={(
            <>
              A station sights P01 at 09:58, P02 at 09:59 and P03 at 10:01. With 10 min, those three are{' '}
              <b>one turn of the instrument</b>, not three separate measurements — and that turn, dated 09:59, answers the{' '}
              <b>10:00</b> slot because it sits 1 min from it. A turn dated 09:41 is 19 min away: too far to be this
              slot&apos;s answer.
            </>
          )}
        >
          <UnitField
            label="Max gap between a station cycle and the slot"
            unit="min"
            value={r.syncToleranceMinutes}
            onChange={(v) => patch({ syncToleranceMinutes: v })}
            step={1}
            width={290}
          />
        </RuleExample>

        <Alert severity="info" variant="outlined" sx={{ py: 0 }}>
          <Typography variant="caption">
            Source timestamps are never changed (TIME-003/004): sights at :25/:26/:32 publish the <b>09:30</b> slot and
            keep their own times. Only the published value sits on the grid.
          </Typography>
        </Alert>
      </GroupCard>

      <GroupCard
        title="When a station delivered nothing for the slot"
        subtitle={isNetwork
          ? 'Republish its last cycle, or leave it out — and say which stations the network cannot do without.'
          : 'Republish its last cycle, or publish nothing for this slot.'}
      >
        <RuleExample
          example={isNetwork
            ? (
              <>
                The 10:30 slot has fresh cycles from three stations; the fourth last measured at 09:55. Reuse republishes
                that 35-minute-old cycle, so the adjustment mixes two instants — a real movement that happened between
                them lands in the residuals instead of in the coordinates.
              </>
            )
            : (
              <>
                The station last measured at 09:55 and the 10:30 slot is due. Reuse republishes the 09:55 cycle, so the
                series shows a value at 10:30 that is really 35 minutes old. Without reuse, the slot publishes nothing.
              </>
            )}
        >
          <FormControlLabel
            control={<Switch checked={r.reuseMissingStation} onChange={(e) => patch({ reuseMissingStation: e.target.checked })} />}
            label="Reuse its last cycle"
          />
        </RuleExample>

        <RuleExample
          example={(
            <>
              At 45 min, a cycle from 09:45 still answers the 10:30 slot; one from 09:40 does not, and the station counts
              as missing. Switching reuse off collapses this to the {r.syncToleranceMinutes}-minute gap above, which is
              why nothing is ever reused then.
            </>
          )}
        >
          <FormControl size="small" sx={{ minWidth: 210 }} disabled={!r.reuseMissingStation}>
            <InputLabel id="max-age">Reuse a cycle up to</InputLabel>
            <Select
              labelId="max-age"
              label="Reuse a cycle up to"
              value={r.maxReusedAgeMinutes}
              onChange={(e) => patch({ maxReusedAgeMinutes: Number(e.target.value) })}
            >
              {[30, 45, 60, 90].map((v) => (
                <MenuItem key={v} value={v}>
                  {v} min
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </RuleExample>

        <RuleExample
          example={(
            <>
              The 10:30 result was built on a cycle measured at 09:55. Marked provisional, the published value carries{' '}
              <code>provisional-flag = 1</code> and the run is listed as <i>provisional</i> rather than <i>success</i>, so
              a reader can tell a republished value from a measured one.
            </>
          )}
        >
          <FormControlLabel
            control={<Switch checked={r.markReuseProvisional} onChange={(e) => patch({ markReuseProvisional: e.target.checked })} />}
            label="Mark a reused result provisional (RUN-005)"
          />
        </RuleExample>

        {isNetwork && (
          <RuleExample
            example={(
              <>
                Four stations, one of them missing and marked optional. Enabled, the run adjusts on the three that
                answered. Disabled, the slot is skipped entirely (<code>technical-error</code>) rather than published from
                a partial network.
              </>
            )}
          >
            <FormControlLabel
              control={(
                <Switch
                  checked={r.computeWithoutOptionalStations}
                  onChange={(e) => patch({ computeWithoutOptionalStations: e.target.checked })}
                />
              )}
              label="Compute without the optional stations"
            />
          </RuleExample>
        )}

        {isNetwork && draft.stations.length > 0 && (
          <RuleExample
            label="Example"
            example={(
              <>
                A station marked indispensable and missing skips the slot with{' '}
                <i>Required station … has no usable epoch</i> (RUN-006), whatever the switch above says. Mark a station
                optional when the network still holds without it — the adjustment needs at least two constrained
                references, and it is that geometry, not this list, that decides whether the solution means anything.
              </>
            )}
          >
            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="body2" fontWeight={600}>
                Stations the network cannot do without:
              </Typography>
              {draft.stations.map((station) => (
                <Chip
                  key={station.stationCode}
                  size="small"
                  variant={station.required ? 'filled' : 'outlined'}
                  color={station.required ? 'primary' : 'default'}
                  label={`${station.stationCode} · ${station.required ? 'indispensable' : 'optional'}`}
                  onClick={() => setRequired(station.stationCode, !station.required)}
                  data-testid={`station-required-${station.stationCode}`}
                  sx={{ fontFamily: 'monospace' }}
                />
              ))}
            </Stack>
          </RuleExample>
        )}
      </GroupCard>

      <GroupCard
        title="Reopening a slot that was already published"
        subtitle="Late data rewrites the same slot by UPSERT, with the configuration historically valid at it (TIME-008, OUT-009)."
      >
        <RuleExample
          example={(
            <>
              The 10:30 slot was published at 10:35. An observation from that cycle arrives at 11:10: a catch-up
              recomputes 10:30 and replaces the same <code>(variable, timestamp)</code> values. Disabled, 10:30 keeps the
              result it already had and the late observation is never used.
            </>
          )}
        >
          <FormControlLabel
            control={<Switch checked={r.catchUp.enabled} onChange={(e) => patchCatchUp({ enabled: e.target.checked })} />}
            label="Allow catch-up"
          />
        </RuleExample>

        <RuleExample
          example={(
            <>
              At 24 h, a datum arriving on Tuesday can still reopen Monday afternoon, but not last week&apos;s slots. The
              window exists because a published series has already been read and acted upon: rewriting a month-old value
              is a surprise, not a correction.
            </>
          )}
        >
          <UnitField
            label="Reopen a slot for up to"
            unit="h"
            value={r.catchUp.windowHours}
            onChange={(v) => patchCatchUp({ windowHours: v })}
            step={1}
            width={210}
            disabled={!r.catchUp.enabled}
          />
        </RuleExample>

        <RuleExample
          example={(
            <>
              At 3, the 10:30 slot can be rewritten three times; a fourth late datum is refused with{' '}
              <code>max-recalculations</code>. Without a bound, a trickle of late data could keep rewriting the same slot
              indefinitely.
            </>
          )}
        >
          <TextField
            size="small"
            type="number"
            label="Recalculations per slot"
            value={r.catchUp.maxRecalculationsPerSlot}
            onChange={(e) => patchCatchUp({ maxRecalculationsPerSlot: Number(e.target.value) })}
            sx={{ width: 200 }}
            disabled={!r.catchUp.enabled}
          />
        </RuleExample>
      </GroupCard>

      <GroupCard
        title="What starts a run"
        subtitle="Recorded on the configuration, and acted on by the BTM orchestrator — not by this mock-up."
      >
        <FormControl>
          <RadioGroup row value={r.trigger} onChange={(e) => patch({ trigger: e.target.value as typeof r.trigger })}>
            <FormControlLabel value="event-driven" control={<Radio />} label="Event-driven (default)" />
            <FormControlLabel value="schedule" control={<Radio />} label="Every X minutes" />
            <FormControlLabel value="manual" control={<Radio />} label="Manual only" />
          </RadioGroup>
        </FormControl>
        {r.trigger === 'schedule' && (
          <UnitField
            label="Check every"
            unit="min"
            value={r.scheduleEveryMinutes ?? 30}
            onChange={(v) => patch({ scheduleEveryMinutes: v })}
            step={5}
          />
        )}
        <Alert severity="info" variant="outlined" sx={{ py: 0 }}>
          <Typography variant="caption">
            No scheduler runs inside the mock-up: whatever is chosen here, runs are started from the processing page. The
            value is stored on the configuration version so the real orchestrator can honour it.
          </Typography>
        </Alert>
      </GroupCard>
    </Stack>
  );
}

// ------------------------------------------------------------------ step 8: Output
