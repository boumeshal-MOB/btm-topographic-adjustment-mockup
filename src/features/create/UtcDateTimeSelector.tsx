import { Button, Stack, TextField, Typography } from '@mui/material';

export interface UtcDateTimeParts {
  date: string;
  time: string;
}

/**
 * Converts an ISO timestamp to values understood by native date/time inputs without applying the
 * browser timezone. The editor deliberately displays UTC because configuration validity is stored
 * and compared in UTC.
 */
export function splitUtcDateTime(value: string): UtcDateTimeParts {
  if (!value) return { date: '', time: '' };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: '', time: '' };
  const iso = parsed.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** Builds a canonical ISO UTC timestamp from separate calendar and clock values. */
export function combineUtcDateTime(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const safeTime = /^\d{2}:\d{2}$/.test(time) ? time : '00:00';
  const candidate = `${date}T${safeTime}:00.000Z`;
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return '';
  return parsed.toISOString();
}

export function UtcDateTimeSelector({
  value,
  onChange,
  helperText,
  required = false,
  showNow = true,
}: {
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
  required?: boolean;
  showNow?: boolean;
}) {
  const parts = splitUtcDateTime(value);
  const invalid = Boolean(value) && (!parts.date || !parts.time);

  return (
    <Stack spacing={0.75}>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="flex-start">
        <TextField
          label="Validity date (UTC)"
          type="date"
          required={required}
          value={parts.date}
          onChange={(event) => onChange(combineUtcDateTime(event.target.value, parts.time))}
          InputLabelProps={{ shrink: true }}
          inputProps={{ 'data-testid': 'valid-from-date' }}
          error={invalid}
          sx={{ width: 210 }}
        />
        <TextField
          label="Validity time (UTC)"
          type="time"
          required={required}
          value={parts.time}
          onChange={(event) => onChange(combineUtcDateTime(parts.date, event.target.value))}
          InputLabelProps={{ shrink: true }}
          inputProps={{ step: 60, 'data-testid': 'valid-from-time' }}
          error={invalid}
          disabled={!parts.date}
          sx={{ width: 190 }}
        />
        {showNow && (
          <Button
            variant="outlined"
            onClick={() => {
              const now = new Date();
              now.setUTCSeconds(0, 0);
              onChange(now.toISOString());
            }}
            sx={{ mt: 0.5 }}
          >
            Use current UTC
          </Button>
        )}
      </Stack>
      {helperText && <Typography variant="caption" color={invalid ? 'error' : 'text.secondary'}>{helperText}</Typography>}
    </Stack>
  );
}
