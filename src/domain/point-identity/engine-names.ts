/**
 * STAR*NET engine names (NAME-001..008, POINT-001..003; `DOMAINE-ET-STARNET.md`). The BTM source name is
 * never modified (NAME-001); `physicalPointId` is opaque and never written to the `.dat`
 * (NAME-002); the engine name is versioned and used in `.dat` and native outputs (NAME-003).
 */

export const ENGINE_NAME_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

/** Characters explicitly forbidden by the BTM rule beyond the whitelist (NAME-005). */
const FORBIDDEN = /[-\s,=#'"]/;

export function isValidEngineName(name: string): boolean {
  return ENGINE_NAME_PATTERN.test(name) && !FORBIDDEN.test(name);
}

export function engineNameIssues(name: string): string[] {
  const issues: string[] = [];
  if (name.length === 0) issues.push('empty name');
  if (name.length > 15) issues.push('longer than 15 characters');
  if (FORBIDDEN.test(name)) issues.push('contains a forbidden character (hyphen, space, comma, =, #, quote)');
  if (!issues.length && !ENGINE_NAME_PATTERN.test(name)) issues.push('only A-Z, a-z, 0-9 and _ are allowed');
  return issues;
}

/**
 * Derives a deterministic engine name for a target: the Lookup `AdjustmentName` is reused only
 * when it is valid (POINT-003); otherwise a neutral deterministic alias `PT000001`-style is
 * generated from the caller-supplied ordinal (NAME-006). Collisions are the caller's concern —
 * use `assignEngineNames` for a whole set.
 */
export function deriveEngineName(candidate: string | undefined, ordinal: number, prefix = 'PT'): string {
  if (candidate && isValidEngineName(candidate)) return candidate;
  return `${prefix}${String(ordinal + 1).padStart(6, '0')}`;
}

export interface EngineNameAssignment {
  sourceKey: string;
  engineName: string;
  aliased: boolean;
  issues: string[];
}

/**
 * Assigns unique engine names to an ordered list of `(sourceKey, candidate)` pairs.
 * Invalid candidates and collisions get a deterministic neutral alias (NAME-006), stable across
 * runs because it depends only on the input order. The reverse mapping stays complete
 * (NAME-008): every sourceKey appears exactly once in the result.
 */
export function assignEngineNames(
  entries: readonly { sourceKey: string; candidate?: string }[],
  prefix = 'PT',
): EngineNameAssignment[] {
  const used = new Set<string>();
  return entries.map((entry, index) => {
    const issues = entry.candidate ? engineNameIssues(entry.candidate) : ['no candidate name'];
    let name = entry.candidate && issues.length === 0 ? entry.candidate : deriveEngineName(undefined, index, prefix);
    let aliased = name !== entry.candidate;
    if (used.has(name)) {
      issues.push(`collision with an earlier engine name "${name}"`);
      let ordinal = index;
      do {
        name = deriveEngineName(undefined, ordinal, prefix);
        ordinal += entries.length; // deterministic probe sequence
      } while (used.has(name));
      aliased = true;
    }
    used.add(name);
    return { sourceKey: entry.sourceKey, engineName: name, aliased, issues };
  });
}
// Note (NAME-007): generated aliases always use the neutral `PT`/`ST` prefixes — `MPO` is a
// France-database nomenclature and is never produced by this module for any country.
