/**
 * Coordinate import for the Initialisation step.
 *
 * Two deliberately different files, because they answer two different questions:
 *
 *  - `references.csv` — coordinates that are *known*, with the standard errors that say how well.
 *    They are what the network is later controlled against, so a missing sigma is an error.
 *  - `initial.csv` — mere approximations to start the adjustment from. A sigma there would suggest a
 *    control that does not exist, so the column is refused.
 *
 * Coordinates are metres, standard errors millimetres — the unit the whole interface uses for a
 * precision. Both separators (`,` and `;`) and both decimal marks are accepted, because a French
 * spreadsheet exports `;` with commas and an English one `,` with dots. Nothing is applied
 * partially: the caller receives every row error and decides.
 */

export type CoordinateCsvKind = 'references' | 'initial';

export interface ParsedCoordinateRow {
  /** 1-based line number in the file, so an error points at what the user can see. */
  line: number;
  name: string;
  eastingM: number;
  northingM: number;
  heightM: number;
  /** Present for `references` only. */
  sigmaEM?: number;
  sigmaNM?: number;
  sigmaHM?: number;
}

export interface CoordinateCsvError {
  line: number;
  message: string;
}

export interface CoordinateCsvResult {
  kind: CoordinateCsvKind;
  rows: ParsedCoordinateRow[];
  errors: CoordinateCsvError[];
  /** Column separator actually detected, echoed back so the panel can explain what it read. */
  separator: ',' | ';';
}

const HEADER_WORDS = ['name', 'nom', 'point', 'easting', 'northing', 'height', 'sigma', 'e', 'n', 'h'];

function detectSeparator(lines: readonly string[]): ',' | ';' {
  const semicolons = lines.reduce((count, line) => count + (line.split(';').length - 1), 0);
  const commas = lines.reduce((count, line) => count + (line.split(',').length - 1), 0);
  return semicolons >= commas ? ';' : ',';
}

/**
 * A comma can be a separator *or* a decimal mark, never both in one file: the separator is decided
 * first, so `1215,4314` is a number when the separator is `;`.
 */
function parseNumber(raw: string, separator: ',' | ';'): number | undefined {
  const cleaned = raw.trim().replace(/\s/g, '');
  if (!cleaned) return undefined;
  const normalised = separator === ';' ? cleaned.replace(',', '.') : cleaned;
  if (!/^[+-]?\d*\.?\d+(?:[eE][+-]?\d+)?$/.test(normalised)) return undefined;
  const value = Number(normalised);
  return Number.isFinite(value) ? value : undefined;
}

function looksLikeHeader(cells: readonly string[], separator: ',' | ';'): boolean {
  if (parseNumber(cells[1] ?? '', separator) !== undefined) return false;
  return cells.some((cell) => HEADER_WORDS.includes(cell.trim().toLowerCase()));
}

export function parseCoordinateCsv(text: string, kind: CoordinateCsvKind): CoordinateCsvResult {
  const rawLines = text.replace(/\r\n?/g, '\n').split('\n');
  const separator = detectSeparator(rawLines.filter((line) => line.trim().length > 0));
  const rows: ParsedCoordinateRow[] = [];
  const errors: CoordinateCsvError[] = [];
  const seen = new Set<string>();
  const expected = kind === 'references' ? 7 : 4;

  rawLines.forEach((rawLine, index) => {
    const line = index + 1;
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const cells = trimmed.split(separator);
    if (looksLikeHeader(cells, separator)) return;

    if (cells.length < expected) {
      errors.push({
        line,
        message: kind === 'references'
          ? `expected name${separator}E${separator}N${separator}H${separator}sigmaE${separator}sigmaN${separator}sigmaH`
          : `expected name${separator}E${separator}N${separator}H`,
      });
      return;
    }
    if (kind === 'initial' && cells.length > 4 && cells.slice(4).some((cell) => cell.trim().length > 0)) {
      errors.push({ line, message: 'initial coordinates carry no standard error: remove the extra columns' });
      return;
    }

    const name = cells[0].trim();
    if (!name) {
      errors.push({ line, message: 'the point name is empty' });
      return;
    }
    if (seen.has(name)) {
      errors.push({ line, message: `${name} appears twice` });
      return;
    }

    const [eastingM, northingM, heightM] = [1, 2, 3].map((column) => parseNumber(cells[column] ?? '', separator));
    if (eastingM === undefined || northingM === undefined || heightM === undefined) {
      errors.push({ line, message: 'E, N and H must all be numbers in metres' });
      return;
    }

    if (kind === 'initial') {
      seen.add(name);
      rows.push({ line, name, eastingM, northingM, heightM });
      return;
    }

    const sigmasMm = [4, 5, 6].map((column) => parseNumber(cells[column] ?? '', separator));
    if (sigmasMm.some((value) => value === undefined)) {
      errors.push({ line, message: 'a known reference needs its three standard errors, in millimetres' });
      return;
    }
    if (sigmasMm.some((value) => !(value! > 0))) {
      errors.push({ line, message: 'a standard error must be greater than zero' });
      return;
    }
    seen.add(name);
    rows.push({
      line,
      name,
      eastingM,
      northingM,
      heightM,
      sigmaEM: sigmasMm[0]! / 1000,
      sigmaNM: sigmasMm[1]! / 1000,
      sigmaHM: sigmasMm[2]! / 1000,
    });
  });

  return { kind, rows, errors, separator };
}

/** The file the panel offers for download, so the expected shape is never guessed. */
export function coordinateCsvTemplate(kind: CoordinateCsvKind): string {
  return kind === 'references'
    ? [
        '# metres for E/N/H, millimetres for the standard errors',
        'name;E;N;H;sigmaE;sigmaN;sigmaH',
        'REF01;1215.4314;2158.8441;99.5756;1.5;1.5;2.0',
        '',
      ].join('\n')
    : [
        '# metres — approximate coordinates only, no standard error',
        'name;E;N;H',
        'MP103;1233.1471;2122.4965;101.0123',
        '',
      ].join('\n');
}
