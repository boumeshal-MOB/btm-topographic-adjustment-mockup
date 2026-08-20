/**
 * What STAR*NET said when it refused, quoted rather than interpreted.
 *
 * A failed native run used to surface nothing at all in the Adjustment step: the epoch test kept its
 * preview verdict and the licensed engine's own words were buried in the console tab. When STAR*NET
 * says `Data line too long at line 42`, that sentence is the answer — an interpretation written
 * around it is at best a paraphrase and at worst wrong, because the message comes from a version and
 * an edition this repository does not control.
 *
 * So this module only *finds* and *quotes*. It never rewrites, never maps a code to a friendlier
 * sentence, and never hides the original behind a summary.
 */

/** Lines STAR*NET writes when something is wrong, in the order they matter. */
const FAILURE_PATTERNS: readonly RegExp[] = [
  /^.*\b(?:error|fatal)\b.*$/gim,
  /^.*Data line too long.*$/gim,
  /^.*\bcannot\b.*$/gim,
  /^.*\bunable to\b.*$/gim,
  /^.*\bnot found\b.*$/gim,
  /^.*\blicense\b.*$/gim,
  /^.*Solution Does Not Converge.*$/gim,
  /^.*Singular\b.*$/gim,
  /^.*Rank\s+Defic.*$/gim,
];

/** Noise that matches a pattern but says nothing: banners, zero-error tallies, column headers. */
const NOISE = /^\s*(?:0\s+errors?|no errors?|error\s*[:=]\s*0|-+|=+)\s*$/i;

export interface NativeFailure {
  /** STAR*NET's own words, verbatim, newest-first, deduplicated. Never empty when returned. */
  messages: string[];
  /** Where the text came from, so the interface can say so instead of implying we wrote it. */
  source: 'service' | 'listing' | 'console';
}

function harvest(text: string): string[] {
  const found: string[] = [];
  for (const pattern of FAILURE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const line = match[0].trim();
      if (line && !NOISE.test(line) && !found.includes(line)) found.push(line);
    }
  }
  return found;
}

/**
 * The failure to show, or `undefined` when STAR*NET did not complain.
 *
 * The service's own `error` field wins: it is the layer that actually knows the job died, timed out
 * or never started. Otherwise the listing is searched before the console, because `.lst` carries the
 * adjustment's verdict while the console carries the process chatter.
 */
export function nativeFailure(result: {
  status: 'succeeded' | 'failed' | 'timed-out';
  error?: string;
  console: { stdout: string; stderr: string };
  outputFiles: readonly { name: string; content: string }[];
}): NativeFailure | undefined {
  if (result.error && result.error.trim()) {
    return { messages: [result.error.trim()], source: 'service' };
  }

  const listing = result.outputFiles.find((file) => /\.lst$/i.test(file.name));
  const fromListing = listing ? harvest(listing.content) : [];
  if (fromListing.length > 0) return { messages: fromListing.slice(0, 6), source: 'listing' };

  const fromConsole = harvest(`${result.console.stderr}\n${result.console.stdout}`);
  if (fromConsole.length > 0) return { messages: fromConsole.slice(0, 6), source: 'console' };

  // A non-zero status with nothing quotable is itself worth reporting, without inventing a cause.
  if (result.status !== 'succeeded') {
    return { messages: [], source: 'service' };
  }
  return undefined;
}
