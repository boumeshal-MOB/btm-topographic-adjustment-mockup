export const STARNET_NEWLINE = '\r\n';

/** Serialises generated STAR*NET text using the Windows line endings expected by its legacy parser. */
export function serialiseStarNetLines(lines: readonly string[]): string {
  for (const [index, line] of lines.entries()) {
    if (/[\r\n\0]/.test(line)) {
      throw new Error(`STAR*NET line ${index + 1} contains an embedded control character`);
    }
  }
  return `${lines.join(STARNET_NEWLINE)}${STARNET_NEWLINE}`;
}

/** Defensive boundary normalisation for imported/manual jobs before they reach Windows. */
export function normaliseStarNetWindowsText(text: string): string {
  if (text.includes('\0')) throw new Error('STAR*NET text contains a NUL character');
  const lines = text.replace(/\r\n|\r/g, '\n').replace(/\n+$/g, '').split('\n');
  return serialiseStarNetLines(lines);
}

export function hasBareLineFeed(text: string): boolean {
  return /(^|[^\r])\n/.test(text);
}
