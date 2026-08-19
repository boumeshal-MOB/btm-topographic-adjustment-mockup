/**
 * Reading aid for the native STAR*NET text files.
 *
 * A `.dat`, a `.prj` and a `.lst` are plain text where a single character decides the outcome: `!`
 * or `*` instead of a sigma changes the datum, one option line in the project changes every weight,
 * and a 400-line listing hides its verdict in the middle. This module turns a file into typed
 * spans so the interface can colour exactly those decisive tokens — and mark the lines worth
 * reading first — without ever altering the text that is copied or downloaded.
 */

export type NativeTokenRole =
  | 'plain'
  | 'comment'
  | 'record'
  | 'name'
  | 'fixed'
  | 'free'
  | 'sigma'
  | 'key'
  | 'value'
  | 'section'
  | 'pass'
  | 'fail'
  | 'warn';

export interface NativeToken {
  text: string;
  role: NativeTokenRole;
}

export interface NativeLine {
  /** 1-based, so the gutter matches what STAR*NET reports in its messages. */
  number: number;
  tokens: NativeToken[];
  /** Carries a decision or a verdict: the "only what matters" filter keeps these. */
  notable: boolean;
}

export type NativeFileKind = 'dat' | 'prj' | 'listing' | 'text';

/** Business values the generator substitutes in the vendor project template. */
export const NATIVE_PROJECT_BUSINESS_KEYS: readonly string[] = [
  'adjustment_type',
  'linear_units',
  'angle_output_units',
  'local_or_grid_adjustment',
  'coordinate_order',
  '3D_input_mode',
  'index_of_refraction',
  'earth_radius_meters',
  'converge_limit',
  'maximum_iterations',
  'chi_sqr_percent_significance',
  'perform_error_propagation',
  'ell_percent_confidence',
  'distance_std_err',
  'edm_ppm',
  'angle_std_err',
  'direction_std_err',
  'azimuth_std_err',
  'zenith_std_err',
  'instrument_centering_error',
  'target_centering_error',
  'vertical_centering_error',
];

const DATA_RECORDS = new Set(['C', 'DB', 'DN', 'DM', 'DE', 'E', 'M']);

export function nativeFileKind(fileName: string): NativeFileKind {
  const extension = fileName.toLowerCase().split('.').pop() ?? '';
  if (extension === 'dat') return 'dat';
  if (extension === 'prj') return 'prj';
  if (['lst', 'err', 'log', 'txt', 'run'].includes(extension)) return 'listing';
  return 'text';
}

/** Splits on whitespace while keeping the separators, so the original columns survive. */
function pieces(line: string): string[] {
  return line.split(/(\s+)/).filter((piece) => piece.length > 0);
}

function constraintRole(token: string): NativeTokenRole {
  if (token === '!') return 'fixed';
  if (token === '*') return 'free';
  return Number.isFinite(Number(token)) ? 'sigma' : 'plain';
}

function datLine(line: string): { tokens: NativeToken[]; notable: boolean } {
  const trimmed = line.trim();
  if (trimmed.startsWith('#')) return { tokens: [{ text: line, role: 'comment' }], notable: false };
  if (!trimmed) return { tokens: [{ text: line, role: 'plain' }], notable: false };

  const parts = pieces(line);
  const words = parts.filter((part) => part.trim().length > 0);
  const record = (words[0] ?? '').toUpperCase();
  const isOption = record.startsWith('.');
  const isRecord = isOption || DATA_RECORDS.has(record);
  // A coordinate record carries the datum decision, and the three trailing standard errors of a
  // measurement record carry its weight. Both are what a surveyor checks first.
  const weightOrdinals = (record === 'C' && words.length >= 8) || (record === 'DM' && words.length >= 9)
    ? [5, 6, 7]
    : [];

  let ordinal = -1;
  const tokens = parts.map((part): NativeToken => {
    if (!part.trim()) return { text: part, role: 'plain' };
    ordinal += 1;
    if (ordinal === 0) return { text: part, role: isRecord ? 'record' : 'plain' };
    if (ordinal === 1 && isRecord && !isOption) return { text: part, role: 'name' };
    if (weightOrdinals.includes(ordinal)) return { text: part, role: constraintRole(part) };
    if (part === '!' || part === '*') return { text: part, role: constraintRole(part) };
    return { text: part, role: isOption ? 'value' : 'plain' };
  });

  return { tokens, notable: isOption || record === 'C' };
}

function prjLine(line: string): { tokens: NativeToken[]; notable: boolean } {
  const trimmed = line.trim();
  if (/^\[[^\]]+\]$/.test(trimmed)) return { tokens: [{ text: line, role: 'section' }], notable: false };
  if (!trimmed) return { tokens: [{ text: line, role: 'plain' }], notable: false };

  const parts = pieces(line);
  const key = parts.find((part) => part.trim().length > 0) ?? '';
  const business = NATIVE_PROJECT_BUSINESS_KEYS.includes(key);
  let ordinal = -1;
  const tokens = parts.map((part): NativeToken => {
    if (!part.trim()) return { text: part, role: 'plain' };
    ordinal += 1;
    if (ordinal === 0) return { text: part, role: business ? 'key' : 'plain' };
    return { text: part, role: business ? 'value' : 'plain' };
  });
  return { tokens, notable: business };
}

/**
 * Order matters. A verdict wins over a metric — one line can name the chi-square test *and* say it
 * failed — but "Total Error Factor" and "Standard Error of Unit Weight" are metrics, not failures,
 * so the failure pattern only accepts `error` where it really reports one.
 */
const LISTING_RULES: Array<{ pattern: RegExp; role: NativeTokenRole }> = [
  {
    pattern: /(does not converge|not converged|\bfailed\b|\berrors?\b\s*[:=]|\berror\b\s+(reading|writing|in|opening)|cannot|aborted|exceeded|no solution|singular)/i,
    role: 'fail',
  },
  { pattern: /(has converged|converged in|\bpassed\b|processing completed)/i, role: 'pass' },
  { pattern: /(warning|caution|single ray|excluded|removed)/i, role: 'warn' },
  {
    pattern: /(error factor|standard error of|degrees of freedom|number of (observations|unknowns)|elapsed|iterations)/i,
    role: 'value',
  },
];

function listingLine(line: string): { tokens: NativeToken[]; notable: boolean } {
  const trimmed = line.trim();
  if (!trimmed) return { tokens: [{ text: line, role: 'plain' }], notable: false };
  if (/^[=\-*_]{4,}$/.test(trimmed)) return { tokens: [{ text: line, role: 'section' }], notable: false };
  const rule = LISTING_RULES.find((candidate) => candidate.pattern.test(line));
  if (rule) return { tokens: [{ text: line, role: rule.role }], notable: true };
  // A residual STAR*NET flagged itself is worth reading even when the wording says nothing.
  const flaggedResidual = /\s(\*{1,2}|!{1,2})\s*$/.test(line) && /-?\d/.test(line);
  return flaggedResidual
    ? { tokens: [{ text: line, role: 'warn' }], notable: true }
    : { tokens: [{ text: line, role: 'plain' }], notable: false };
}

export function highlightNativeText(text: string, kind: NativeFileKind): NativeLine[] {
  return text.replace(/\r\n?/g, '\n').split('\n').map((line, index) => {
    const analysed = kind === 'dat'
      ? datLine(line)
      : kind === 'prj'
        ? prjLine(line)
        : kind === 'listing'
          ? listingLine(line)
          : { tokens: [{ text: line, role: 'plain' as NativeTokenRole }], notable: false };
    return { number: index + 1, tokens: analysed.tokens, notable: analysed.notable };
  });
}

/** True when an "only the lines that matter" filter would actually hide something. */
export function hasNotableLines(lines: readonly NativeLine[]): boolean {
  const notable = lines.filter((line) => line.notable).length;
  return notable > 0 && notable < lines.length;
}
