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

        {/* ---- the axis: why each cycle lands where it lands ---------------------------- */}
        <Box sx={{ position: 'relative', height: 26 + model.rows.length * 16, mt: 0.5 }}>
          {/* fresh windows */}
          {model.slots.map((slot) => {
            const slotMs = new Date(slot).getTime();
            const left = percent(slotMs - freshHalfWidth * 60_000);
            const right = percent(slotMs + freshHalfWidth * 60_000);
            return (
              <Box
                key={`window-${slot}`}
                sx={{
                  position: 'absolute',
                  left: `${Math.max(0, left)}%`,
                  width: `${Math.min(100, right) - Math.max(0, left)}%`,
                  top: 0,
                  bottom: 0,
                  bgcolor: 'success.main',
                  opacity: 0.1,
                  borderRadius: 0.5,
                }}
              />
            );
          })}
          {/* the publication grid */}
          {model.slots.map((slot) => (
            <Box key={`slot-${slot}`} sx={{ position: 'absolute', left: `${percent(new Date(slot).getTime())}%`, top: 0, bottom: 0 }}>
              <Box sx={{ position: 'absolute', top: 14, bottom: 0, width: '1px', bgcolor: 'divider' }} />
              <Typography
                variant="caption"
                sx={{ position: 'absolute', top: 0, transform: 'translateX(-50%)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}
              >
                {hhmm(slot)}
              </Typography>
            </Box>
          ))}
          {/* the real acquisition cycles, one lane per station */}
          {model.rows.map((row, index) => (
            <Box key={`lane-${row.stationCode}`} sx={{ position: 'absolute', left: 0, right: 0, top: 20 + index * 16, height: 14 }}>
              <Typography
                variant="caption"
                sx={{ position: 'absolute', left: 0, fontFamily: 'monospace', fontSize: '0.65rem', color: 'text.secondary' }}
              >
                {row.stationCode}
              </Typography>
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
                      transform: 'translateX(-50%)',
                    }}
                  />
                ))}
            </Box>
          ))}
        </Box>

        {/* ---- the grid: the verdict itself ------------------------------------------- */}
        <Box sx={{ overflowX: 'auto' }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: `minmax(72px, auto) repeat(${model.slots.length}, minmax(96px, 1fr))`,
              gap: 0.5,
              minWidth: 420,
            }}
          >
            <Box />
            {model.slots.map((slot) => (
              <Typography key={`head-${slot}`} variant="caption" fontWeight={700} sx={{ fontFamily: 'monospace' }}>
                {hhmm(slot)}
              </Typography>
            ))}
            {model.rows.map((row) => (
              <Box key={`row-${row.stationCode}`} sx={{ display: 'contents' }}>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                  {row.stationCode}
                </Typography>
                {row.verdicts.map((verdict, index) => (
                  <Stack key={`${row.stationCode}-${model.slots[index]}`} direction="row" spacing={0.5} alignItems="center">
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
