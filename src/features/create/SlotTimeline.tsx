import { useMemo } from 'react';
import { Alert, Box, Chip, Paper, Stack, Typography } from '@mui/material';
import { nearestSlot, selectStationCycle } from '@/domain/time/slots';
import { fixed } from '@/features/shared/format';

/**
 * What a run actually does with the numbers on this screen, drawn on the real data.
 *
 * The classification is NOT re-implemented here: every verdict comes from `selectStationCycle`,
 * the same function `resolveRunInputForSlot` calls. An explanation that re-derives the rule can
 * drift from it silently; this one cannot, because it *is* the rule.
 *
 * Two views of the same truth, because they answer different questions:
 * - the axis shows *why* — where each acquisition cycle falls against the publication grid;
 * - the grid shows *what* — the verdict per station and per slot, with its age.
 */

const SLOTS_SHOWN = 4;

type CycleState = 'fresh' | 'reused' | 'missing';

interface StationEpochs {
  stationCode: string;
  epochs: string[];
}

interface Verdict {
  state: CycleState;
  epoch?: string;
  ageMinutes?: number;
}

const TONE: Record<CycleState, { colour: string; label: string }> = {
  fresh: { colour: 'success.main', label: 'fresh' },
  reused: { colour: 'warning.main', label: 'reused' },
  missing: { colour: 'error.main', label: 'missing' },
};

function hhmm(iso: string): string {
  return new Date(iso).toISOString().slice(11, 16);
}

export function SlotTimeline({
  stations,
  intervalMinutes,
  syncToleranceMinutes,
  maxReusedAgeMinutes,
  maxEpochToSlotMinutes,
  reuseMissingStation,
}: {
  stations: StationEpochs[];
  intervalMinutes: number;
  syncToleranceMinutes: number;
  maxReusedAgeMinutes: number;
  maxEpochToSlotMinutes: number;
  reuseMissingStation: boolean;
}) {
  /**
   * `resolve-run.ts` collapses the reuse age to the sync tolerance when reuse is off, and caps the
   * fresh window by the Output step's `maxEpochToSlotMinutes`. Both are reproduced here rather than
   * simplified, because a timeline that ignored them would contradict the run it explains.
   */
  const effectiveReuseAge = reuseMissingStation ? maxReusedAgeMinutes : syncToleranceMinutes;
  const freshHalfWidth = Math.min(syncToleranceMinutes, maxEpochToSlotMinutes);

  const model = useMemo(() => {
    const withData = stations.filter((station) => station.epochs.length > 0);
    const allEpochs = withData.flatMap((station) => station.epochs).sort();
    const latest = allEpochs.at(-1);
    if (!latest || intervalMinutes <= 0) return undefined;

    /**
     * `nearestSlot`, not `alignSlot`: the store builds the list of runnable slots by rounding each
     * epoch to its closest grid point (`availableSlots`), so flooring here would show a last column
     * the run never offers — and a 09:59 cycle would read "missing" against a 09:30 slot while the
     * run happily publishes it at 10:00.
     */
    const lastSlotMs = new Date(nearestSlot(latest, intervalMinutes)).getTime();
    const stepMs = intervalMinutes * 60_000;
    const slots = Array.from(
      { length: SLOTS_SHOWN },
      (_, index) => new Date(lastSlotMs - (SLOTS_SHOWN - 1 - index) * stepMs).toISOString(),
    );

    const rows = withData.map((station) => ({
      stationCode: station.stationCode,
      epochs: station.epochs,
      verdicts: slots.map((slot): Verdict => {
        const selection = selectStationCycle(
          station.epochs.map((epoch) => ({ epoch, rawTargetName: station.stationCode })),
          slot,
          syncToleranceMinutes,
          syncToleranceMinutes,
          effectiveReuseAge,
          maxEpochToSlotMinutes,
        );
        return { state: selection.state, epoch: selection.epoch, ageMinutes: selection.ageMinutes };
      }),
    }));

    const fromMs = new Date(slots[0]).getTime() - stepMs / 2;
    const toMs = lastSlotMs + stepMs / 2;
    return { slots, rows, fromMs, toMs, spanMs: toMs - fromMs };
  }, [stations, intervalMinutes, syncToleranceMinutes, effectiveReuseAge, maxEpochToSlotMinutes]);

  if (!model) {
    return (
      <Alert severity="info" variant="outlined">
        Select stations that carry observations to see what a run would do with them.
      </Alert>
    );
  }

  const percent = (ms: number) => ((ms - model.fromMs) / model.spanMs) * 100;
  /** A cycle landing here is fresh for no slot at all — it can only ever be reused. */
  const deadZoneMinutes = intervalMinutes - 2 * freshHalfWidth;

  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap" useFlexGap>
          <Typography variant="body2" fontWeight={700}>
            What a run would do with your data
          </Typography>
          <Typography variant="caption" color="text.secondary">
            publication every {intervalMinutes} min · fresh within ±{freshHalfWidth} min · reuse up to{' '}
            {effectiveReuseAge} min{reuseMissingStation ? '' : ' (reuse off)'}
          </Typography>
        </Stack>

        {/**
          * One geometry for both views. The slots are evenly spaced on a UTC grid, so a CSS grid of
          * equal columns *is* the proportional axis: each slot lands exactly at its column centre.
          * Only the acquisition dots need true positioning, and they get one lane spanning the slot
          * columns. Two separate geometries meant two rows of identical times that read as a bug.
          */}
        <Box sx={{ overflowX: 'auto' }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: `76px repeat(${model.slots.length}, minmax(104px, 1fr))`,
              alignItems: 'center',
              rowGap: 0.5,
              minWidth: 500,
            }}
          >
            {/* the publication grid, labelled once */}
            <Typography variant="caption" color="text.secondary">
              slot
            </Typography>
            {model.slots.map((slot) => (
              <Typography
                key={`head-${slot}`}
                variant="caption"
                fontWeight={700}
                sx={{ fontFamily: 'monospace', textAlign: 'center' }}
              >
                {hhmm(slot)}
              </Typography>
            ))}

            {/* the fresh windows, one per slot column. The gutter states the half-width rather than
                the word "fresh": a row label sharing a word with a verdict reads as the same thing. */}
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', fontFamily: 'monospace' }}>
              ±{freshHalfWidth} min
            </Typography>
            {model.slots.map((slot) => (
              <Box key={`window-${slot}`} sx={{ px: 0.5 }}>
                <Box
                  sx={{
                    height: 8,
                    width: `${Math.min(100, (2 * freshHalfWidth * 100) / intervalMinutes)}%`,
                    mx: 'auto',
                    bgcolor: 'success.main',
                    opacity: 0.28,
                    borderRadius: 4,
                  }}
                />
              </Box>
            ))}

            {/* the real acquisition cycles: one lane per station, positioned in real time */}
            {model.rows.map((row) => (
              <Box key={`lane-${row.stationCode}`} sx={{ display: 'contents' }}>
                <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
                  cycles
                </Typography>
                <Box sx={{ gridColumn: `2 / span ${model.slots.length}`, position: 'relative', height: 12 }}>
                  <Box sx={{ position: 'absolute', left: 0, right: 0, top: 5.5, height: '1px', bgcolor: 'divider' }} />
                  {row.epochs
                    .filter((epoch) => {
                      const ms = new Date(epoch).getTime();
                      return ms >= model.fromMs && ms <= model.toMs;
                    })
                    .map((epoch) => (
                      <Box
                        key={epoch}
                        title={`${row.stationCode} — ${hhmm(epoch)}`}
                        sx={{
                          position: 'absolute',
                          left: `${percent(new Date(epoch).getTime())}%`,
                          top: 3,
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          bgcolor: 'primary.main',
                          opacity: 0.75,
                          transform: 'translateX(-50%)',
                        }}
                      />
                    ))}
                </Box>

                {/* and the verdict this station gets for each slot */}
                <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                  {row.stationCode}
                </Typography>
                {row.verdicts.map((verdict, index) => (
                  <Stack
                    key={`${row.stationCode}-${model.slots[index]}`}
                    direction="row"
                    spacing={0.5}
                    alignItems="center"
                    justifyContent="center"
                    sx={{ pb: 0.75 }}
                  >
                    <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: TONE[verdict.state].colour, flexShrink: 0 }} />
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                      {TONE[verdict.state].label}
                      {verdict.ageMinutes !== undefined && ` · ${fixed(verdict.ageMinutes, 0)} min`}
                    </Typography>
                  </Stack>
                ))}
              </Box>
            ))}
          </Box>
        </Box>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
          {(['fresh', 'reused', 'missing'] as CycleState[]).map((state) => (
            <Stack key={state} direction="row" spacing={0.5} alignItems="center">
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: TONE[state].colour }} />
              <Typography variant="caption" color="text.secondary">
                {state === 'fresh' && 'measured for this slot'}
                {state === 'reused' && 'older cycle republished, result provisional'}
                {state === 'missing' && 'nothing usable for this slot'}
              </Typography>
            </Stack>
          ))}
        </Stack>

        {deadZoneMinutes > 0 && (
          <Alert severity="warning" variant="outlined" sx={{ py: 0 }}>
            <Typography variant="caption">
              A cycle measured in the {deadZoneMinutes}-minute gap between two fresh windows is fresh for{' '}
              <b>no slot at all</b>: it can only be reused, so the result is marked provisional even though it is the most
              recent measurement that exists. Widening the tolerance to {Math.ceil(intervalMinutes / 2)} min closes the gap.
            </Typography>
          </Alert>
        )}

        {freshHalfWidth < syncToleranceMinutes && (
          <Alert severity="info" variant="outlined" sx={{ py: 0 }}>
            <Typography variant="caption">
              The fresh window is {freshHalfWidth} min, not {syncToleranceMinutes} min: the Output step&apos;s{' '}
              <b>max epoch→slot</b> is smaller and the run takes whichever of the two is tighter.
            </Typography>
          </Alert>
        )}

        <Typography variant="caption" color="text.secondary">
          Verdicts come from the same resolver the run uses, on the last {SLOTS_SHOWN} slots that carry data. Source
          timestamps are never rounded — only the publication timestamp sits on the grid.
        </Typography>
        <Stack direction="row" spacing={0.5}>
          <Chip size="small" variant="outlined" label="UTC" />
        </Stack>
      </Stack>
    </Paper>
  );
}
