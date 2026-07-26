export interface UtcDateTimeParts {
  date: string;
  time: string;
}

/**
 * Converts an ISO timestamp to native input values without applying the browser timezone.
 * Configuration validity is deliberately displayed and compared in UTC.
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
