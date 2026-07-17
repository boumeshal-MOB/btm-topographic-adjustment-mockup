import { useMemo } from 'react';
import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

export interface ObservationCycles {
  stationCode: string;
  epochs: string[];
}

function dayOf(epoch: string): string {
  return epoch.slice(0, 10);
}

function timeOf(epoch: string): string {
  return epoch.slice(11, 19);
}

function formatEpoch(epoch: string): string {
  return `${dayOf(epoch)} ${timeOf(epoch)} UTC`;
}

function CycleDateTimeField({
  label,
  value,
  epochs,
  boundary,
  onChange,
}: {
  label: string;
  value: string;
  epochs: string[];
  boundary: 'first' | 'last';
  onChange: (value: string) => void;
}) {
  const byDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const epoch of epochs) map.set(dayOf(epoch), [...(map.get(dayOf(epoch)) ?? []), epoch]);
    return map;
  }, [epochs]);
  const dates = [...byDay.keys()].sort();
  const selectedDay = value ? dayOf(value) : dates[boundary === 'first' ? 0 : Math.max(0, dates.length - 1)] ?? '';
  const times = byDay.get(selectedDay) ?? [];
  const valid = epochs.includes(value);

  const chooseDay = (day: string) => {
    const values = byDay.get(day) ?? [];
    const next = boundary === 'first' ? values[0] : values.at(-1);
    if (next) onChange(next);
  };

  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} sx={{ flex: 1 }}>
      <TextField
        size="small"
        type="date"
        label={`${label} date`}
        value={selectedDay}
        onChange={(event) => chooseDay(event.target.value)}
        InputLabelProps={{ shrink: true }}
        inputProps={{ min: dates[0], max: dates.at(-1) }}
        error={Boolean(value) && !valid}
        sx={{ minWidth: 170 }}
      />
      <FormControl size="small" sx={{ minWidth: 180, flex: 1 }} error={Boolean(value) && !valid}>
        <InputLabel id={`${label.replace(/\s/g, '-')}-time`}>{label} cycle time</InputLabel>
        <Select
          labelId={`${label.replace(/\s/g, '-')}-time`}
          label={`${label} cycle time`}
          value={valid ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        >
          {times.map((epoch) => <MenuItem key={epoch} value={epoch}>{timeOf(epoch)} UTC</MenuItem>)}
        </Select>
      </FormControl>
    </Stack>
  );
}

export function ObservationCycleRangePicker({
  cycles,
  from,
  to,
  onChange,
}: {
  cycles: ObservationCycles;
  from: string;
  to: string;
  onChange: (range: { from?: string; to?: string }) => void;
}) {
  const epochs = cycles.epochs;
  const fromValid = epochs.includes(from);
  const toValid = epochs.includes(to);
  const ordered = fromValid && toValid && from <= to;
  const latest = epochs.at(-1);
  const first = epochs[0];

  const useFullRange = () => {
    if (first && latest) onChange({ from: first, to: latest });
  };
  const useLatestDay = () => {
    if (!latest) return;
    const threshold = new Date(new Date(latest).getTime() - 24 * 3600_000).toISOString();
    const start = epochs.find((epoch) => epoch >= threshold) ?? first;
    if (start) onChange({ from: start, to: latest });
  };

  if (epochs.length === 0) {
    return <Alert severity="warning">No observation cycles are available for the reference station.</Alert>;
  }

  return (
    <Box>
      <Stack spacing={1.25}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
          <Box>
            <Typography variant="subtitle2">Observation period</Typography>
            <Typography variant="body2" color="text.secondary">
              Calendar dates and times come from existing acquisition cycles of the first network station: <b>{cycles.stationCode}</b>.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="outlined" onClick={useLatestDay}>Latest 24 h</Button>
            <Button size="small" onClick={useFullRange}>All available</Button>
          </Stack>
        </Stack>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
          <CycleDateTimeField label="From" boundary="first" value={from} epochs={epochs} onChange={(value) => onChange({ from: value })} />
          <CycleDateTimeField label="To" boundary="last" value={to} epochs={epochs} onChange={(value) => onChange({ to: value })} />
        </Stack>
        {!fromValid && <Alert severity="warning">The start value is not an existing {cycles.stationCode} acquisition cycle. Select a listed time.</Alert>}
        {!toValid && <Alert severity="warning">The end value is not an existing {cycles.stationCode} acquisition cycle. Select a listed time.</Alert>}
        {fromValid && toValid && !ordered && <Alert severity="error">The start cycle must be before or equal to the end cycle.</Alert>}
        {ordered && (
          <Typography variant="caption" color="text.secondary">
            Selected: {formatEpoch(from)} → {formatEpoch(to)} · {epochs.filter((epoch) => epoch >= from && epoch <= to).length} reference-station cycle(s)
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
