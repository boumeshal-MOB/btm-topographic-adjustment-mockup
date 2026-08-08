export type StarNetNativeChiSquareStatus = 'passed' | 'failed' | 'not-found';

export interface StarNetNativeFile {
  extension: string;
  content: string;
}

export interface StarNetRunFlag {
  bit: number;
  key: string;
  message: string;
  fatal: boolean;
}

export interface StarNetRunStatus {
  code: number;
  adjustmentCompleted: boolean;
  converged: boolean;
  chiSquareStatus: StarNetNativeChiSquareStatus;
  chiSquareFailureTail?: 'lower' | 'upper';
  flags: StarNetRunFlag[];
  messages: string[];
}

export interface StarNetNativeCoordinate {
  engineName: string;
  eastingM: number;
  northingM: number;
  heightM: number;
  sigmaEM?: number;
  sigmaNM?: number;
  sigmaHM?: number;
  ellipseSemiMajorM?: number;
  ellipseSemiMinorM?: number;
  ellipseAzimuthDeg?: number;
  verticalConfidenceM?: number;
}

export interface StarNetNativeResidual {
  kind: 'distance' | 'zenith' | 'direction';
  from: string;
  to: string;
  adjusted: string;
  /** Metres for distance; arcseconds for angular observations. */
  residual: number;
  /** Metres for distance; arcseconds for angular observations. */
  standardError: number;
  standardizedResidual: number;
  namesMayBeTruncated: boolean;
}

export interface StarNetListingSummary {
  iterations?: number;
  stationCount?: number;
  observationCount?: number;
  unknownCount?: number;
  degreesOfFreedom?: number;
  weightedSsr?: number;
  varianceFactor?: number;
  totalErrorFactor?: number;
  chiSquareStatus: StarNetNativeChiSquareStatus;
  chiSquareFailureTail?: 'lower' | 'upper';
  chiSquareSignificancePercent?: number;
  totalErrorFactorLower?: number;
  totalErrorFactorUpper?: number;
  elapsed?: string;
  completed: boolean;
  converged: boolean;
  coordinates: StarNetNativeCoordinate[];
  residuals: StarNetNativeResidual[];
}

export interface StarNetNativeOutput {
  completed: boolean;
  converged: boolean;
  chiSquareStatus: StarNetNativeChiSquareStatus;
  chiSquareFailureTail?: 'lower' | 'upper';
  listing?: StarNetListingSummary;
  run?: StarNetRunStatus;
  coordinates: StarNetNativeCoordinate[];
  residuals: StarNetNativeResidual[];
  warnings: string[];
  errors: string[];
}

export interface StarNetConsoleSummary {
  completed: boolean;
  converged: boolean;
  iterations?: number;
  chiSquareStatus: StarNetNativeChiSquareStatus;
  elapsed?: string;
  stationCount?: number;
  observationCount?: number;
  unknownCount?: number;
  degreesOfFreedom?: number;
  weightedSsr?: number;
  varianceFactor?: number;
  totalErrorFactor?: number;
  runStatusCode?: number;
  coordinateCount?: number;
  warningCount?: number;
  errorCount?: number;
}

const RUN_FLAGS: ReadonlyArray<Omit<StarNetRunFlag, 'message'>> = [
  { bit: 0x0001, key: 'run-warnings', fatal: false },
  { bit: 0x0002, key: 'chi-square-lower', fatal: false },
  { bit: 0x0004, key: 'chi-square-upper', fatal: false },
  { bit: 0x0008, key: 'not-converged', fatal: true },
  { bit: 0x0100, key: 'run-errors', fatal: true },
  { bit: 0x0200, key: 'security-key-failure', fatal: true },
  { bit: 0x0400, key: 'project-open-failure', fatal: true },
  { bit: 0x0800, key: 'project-file-errors', fatal: true },
  { bit: 0x1000, key: 'unable-to-start', fatal: true },
  // STAR*NET 14 emits this additional bit although it is absent from the older supplied manual.
  { bit: 0x4000, key: 'adjustment-incomplete', fatal: true },
];

function finiteNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function cleanListing(text: string): string {
  // Native LST files end with a SUB character followed by STAR*NET's binary/index payload.
  return text.split('\x1a', 1)[0].replace(/\f/g, '\n');
}

function section(text: string, title: string, endTitles: string[]): string {
  const start = text.indexOf(title);
  if (start < 0) return '';
  const bodyStart = start + title.length;
  const ends = endTitles
    .map((candidate) => text.indexOf(candidate, bodyStart))
    .filter((index) => index >= 0);
  return text.slice(bodyStart, ends.length > 0 ? Math.min(...ends) : undefined);
}

/** Parses STAR*NET's default Cartesian coordinate output. Coordinate order comes from config. */
export function parseStarNetCoordinateFile(
  text: string,
  coordinateOrder: 'EN' | 'NE' = 'EN',
): StarNetNativeCoordinate[] {
  const coordinates: StarNetNativeCoordinate[] = [];
  for (const line of text.replace(/\r/g, '').split('\n')) {
    if (!line.trim() || /^\s*[#;]/.test(line)) continue;
    const match = line.match(/^\s*(\S+)\s+([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s+([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s+([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(?:\s+.*)?$/i);
    if (!match) continue;
    const first = finiteNumber(match[2]);
    const second = finiteNumber(match[3]);
    const height = finiteNumber(match[4]);
    if (first === undefined || second === undefined || height === undefined) continue;
    coordinates.push({
      engineName: match[1],
      eastingM: coordinateOrder === 'EN' ? first : second,
      northingM: coordinateOrder === 'EN' ? second : first,
      heightM: height,
    });
  }
  return coordinates;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field.trim());
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (field || row.length > 0) {
    row.push(field.trim());
    if (row.some(Boolean)) rows.push(row);
  }
  return rows;
}

function normaliseDumpHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Parses the optional full-precision station-information dump. Unlike `.pts`, DMP columns are
 * explicitly labelled and always identify Northing/Easting, so project coordinate order is not
 * involved. Extra relative-covariance sections are ignored.
 */
export function parseStarNetDumpFile(text: string): StarNetNativeCoordinate[] {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ''));
  if (rows.length < 2) return [];
  const headers = rows[0].map(normaliseDumpHeader);
  const column = (...aliases: string[]): number => headers.findIndex((header) => aliases.includes(header));
  const nameIndex = column('name', 'station', 'stationname');
  const northingIndex = column('northing', 'north');
  const eastingIndex = column('easting', 'east');
  const elevationIndex = column('elevation', 'elev', 'height');
  if ([nameIndex, northingIndex, eastingIndex, elevationIndex].some((index) => index < 0)) return [];
  const sigmaNIndex = column('stddevnorthing', 'northingstddev', 'standarddeviationnorthing');
  const sigmaEIndex = column('stddeveasting', 'eastingstddev', 'standarddeviationeasting');
  const sigmaHIndex = column('stddevelevation', 'elevationstddev', 'standarddeviationelevation', 'stddevheight');
  const coordinates: StarNetNativeCoordinate[] = [];
  for (const row of rows.slice(1)) {
    const engineName = row[nameIndex]?.trim();
    const northingM = finiteNumber(row[northingIndex] ?? '');
    const eastingM = finiteNumber(row[eastingIndex] ?? '');
    const heightM = finiteNumber(row[elevationIndex] ?? '');
    if (!engineName || northingM === undefined || eastingM === undefined || heightM === undefined) continue;
    const sigmaNM = sigmaNIndex >= 0 ? finiteNumber(row[sigmaNIndex] ?? '') : undefined;
    const sigmaEM = sigmaEIndex >= 0 ? finiteNumber(row[sigmaEIndex] ?? '') : undefined;
    const sigmaHM = sigmaHIndex >= 0 ? finiteNumber(row[sigmaHIndex] ?? '') : undefined;
    coordinates.push({
      engineName,
      eastingM,
      northingM,
      heightM,
      ...(sigmaEM !== undefined ? { sigmaEM } : {}),
      ...(sigmaNM !== undefined ? { sigmaNM } : {}),
      ...(sigmaHM !== undefined ? { sigmaHM } : {}),
    });
  }
  return coordinates;
}

function dmsToDegrees(value: string): number | undefined {
  const match = value.match(/^(-?)(\d+)(?:-(\d+))?(?:-(\d+(?:\.\d+)?))?$/);
  if (!match) return undefined;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) + Number(match[3] ?? 0) / 60 + Number(match[4] ?? 0) / 3600);
}

function dmsResidualToArcSeconds(value: string): number | undefined {
  const degrees = dmsToDegrees(value);
  return degrees === undefined ? undefined : degrees * 3600;
}

function gonResidualToArcSeconds(value: string): number | undefined {
  const gons = finiteNumber(value);
  return gons === undefined ? undefined : gons * 3240;
}

function parseListingCoordinates(text: string): StarNetNativeCoordinate[] {
  const body = section(text, 'Adjusted Coordinates (', ['Adjusted Observations and Residuals']);
  if (!body) return [];
  const lines = body.replace(/\r/g, '').split('\n');
  const header = lines.find((line) => /^\s*Station\s+/.test(line));
  const order: 'EN' | 'NE' = header && /\bN\s+E\s+(?:Elev|Height)\b/i.test(header) ? 'NE' : 'EN';
  return parseStarNetCoordinateFile(lines.slice(header ? lines.indexOf(header) + 1 : 0).join('\n'), order);
}

function parseStandardDeviations(text: string): Map<string, [number, number, number]> {
  const body = section(text, 'Station Coordinate Standard Deviations (', ['Station Coordinate Error Ellipses']);
  const values = new Map<string, [number, number, number]>();
  if (!body) return values;
  const lines = body.replace(/\r/g, '').split('\n');
  const header = lines.find((line) => /^\s*Station\s+/.test(line));
  const order: 'EN' | 'NE' = header && /\bN\s+E\s+(?:Elev|Height)\b/i.test(header) ? 'NE' : 'EN';
  for (const line of lines) {
    const match = line.match(/^\s*(\S+)\s+([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s*$/);
    if (!match || match[1] === 'Station') continue;
    const first = Number(match[2]);
    const second = Number(match[3]);
    values.set(match[1], order === 'EN' ? [first, second, Number(match[4])] : [second, first, Number(match[4])]);
  }
  return values;
}

function parseEllipses(text: string): Map<string, [number, number, number, number]> {
  const body = section(text, 'Station Coordinate Error Ellipses (', ['Relative Error Ellipses']);
  const values = new Map<string, [number, number, number, number]>();
  if (!body) return values;
  for (const line of body.replace(/\r/g, '').split('\n')) {
    const match = line.match(/^\s*(\S+)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:-\d+(?:-\d+(?:\.\d+)?)?)?)\s+(\d+(?:\.\d+)?)\s*$/);
    if (!match || match[1] === 'Station') continue;
    const azimuth = dmsToDegrees(match[4]);
    if (azimuth === undefined) continue;
    values.set(match[1], [Number(match[2]), Number(match[3]), azimuth, Number(match[5])]);
  }
  return values;
}

function parseResidualSection(
  text: string,
  title: string,
  endTitles: string[],
  kind: StarNetNativeResidual['kind'],
): StarNetNativeResidual[] {
  const body = section(text, title, endTitles);
  const residuals: StarNetNativeResidual[] = [];
  if (!body) return residuals;
  const usesGons = text.toUpperCase().includes(`${title}GONS`.toUpperCase());
  for (const line of body.replace(/\r/g, '').split('\n')) {
    const tokens = line.trim().split(/\s+/);
    if (tokens.length !== 6 || tokens[0] === 'From' || tokens[0] === 'Set') continue;
    const residual = kind === 'distance'
      ? finiteNumber(tokens[3])
      : usesGons
        ? gonResidualToArcSeconds(tokens[3])
        : dmsResidualToArcSeconds(tokens[3]);
    const nativeStandardError = finiteNumber(tokens[4]);
    // In a GONS project STAR*NET lists angular standard errors in milligons.
    const standardError = nativeStandardError === undefined
      ? undefined
      : kind !== 'distance' && usesGons
        ? nativeStandardError * 3.24
        : nativeStandardError;
    const standardizedResidual = finiteNumber(tokens[5]);
    if (residual === undefined || standardError === undefined || standardizedResidual === undefined) continue;
    residuals.push({
      kind,
      from: tokens[0],
      to: tokens[1],
      adjusted: tokens[2],
      residual,
      standardError,
      standardizedResidual,
      // The default listing has a fixed-width station column and demonstrably truncates names.
      namesMayBeTruncated: true,
    });
  }
  return residuals;
}

export function parseStarNetListing(text: string): StarNetListingSummary {
  const listing = cleanListing(text);
  const number = (pattern: RegExp): number | undefined => {
    const value = listing.match(pattern)?.[1];
    return value === undefined ? undefined : finiteNumber(value);
  };
  const iterations = number(/Iterations\s*=\s*(\d+)/i);
  const stationCount = number(/Number of Stations\s*=\s*(\d+)/i);
  const observationCount = number(/Number of Observations\s*=\s*(\d+)/i);
  const unknownCount = number(/Number of Unknowns\s*=\s*(\d+)/i);
  const degreesOfFreedom = number(/Number of Redundant Obs\s*=\s*(-?\d+)/i);
  const total = listing.match(/^\s*Total\s+(\d+)\s+([0-9.e+-]+)\s+([0-9.e+-]+)\s*$/im);
  const weightedSsr = total ? finiteNumber(total[2]) : undefined;
  const totalErrorFactor = total ? finiteNumber(total[3]) : undefined;
  const significance = number(/Chi-Square Test at\s+([0-9.]+)%\s+Level/i);
  const passed = /Chi-Square Test[^\r\n]*Passed/i.test(listing);
  const upper = /Chi-Square Test[^\r\n]*(?:Exceeded|Failed)[^\r\n]*Upper/i.test(listing);
  const lower = /Chi-Square Test[^\r\n]*(?:Exceeded|Failed)[^\r\n]*Lower/i.test(listing);
  const failed = /Chi-Square Test[^\r\n]*(?:Exceeded|Failed)/i.test(listing);
  const bounds = listing.match(/Lower\/Upper Bounds\s*\(\s*([0-9.e+-]+)\s*\/\s*([0-9.e+-]+)\s*\)/i);
  const coordinates = parseListingCoordinates(listing);
  const deviations = parseStandardDeviations(listing);
  const ellipses = parseEllipses(listing);
  for (const coordinate of coordinates) {
    const sigma = deviations.get(coordinate.engineName);
    if (sigma) [coordinate.sigmaEM, coordinate.sigmaNM, coordinate.sigmaHM] = sigma;
    const ellipse = ellipses.get(coordinate.engineName);
    if (ellipse) {
      [coordinate.ellipseSemiMajorM, coordinate.ellipseSemiMinorM, coordinate.ellipseAzimuthDeg, coordinate.verticalConfidenceM] = ellipse;
    }
  }
  const residuals = [
    ...parseResidualSection(listing, 'Adjusted Distance Observations (', ['Adjusted Zenith Observations'], 'distance'),
    ...parseResidualSection(listing, 'Adjusted Zenith Observations (', ['Adjusted Direction Observations'], 'zenith'),
    ...parseResidualSection(listing, 'Adjusted Direction Observations (', ['Adjusted Bearings'], 'direction'),
  ];
  const notConverged = /(?:did not|has not) converge/i.test(listing);
  return {
    iterations,
    stationCount,
    observationCount,
    unknownCount,
    degreesOfFreedom,
    weightedSsr,
    varianceFactor: totalErrorFactor === undefined ? undefined : totalErrorFactor ** 2,
    totalErrorFactor,
    chiSquareStatus: passed ? 'passed' : failed ? 'failed' : 'not-found',
    chiSquareFailureTail: upper ? 'upper' : lower ? 'lower' : undefined,
    chiSquareSignificancePercent: significance,
    totalErrorFactorLower: bounds ? finiteNumber(bounds[1]) : undefined,
    totalErrorFactorUpper: bounds ? finiteNumber(bounds[2]) : undefined,
    elapsed: listing.match(/Elapsed Time\s*=\s*([0-9:]+)/i)?.[1],
    completed: Boolean(iterations !== undefined && total && coordinates.length > 0),
    converged: Boolean(iterations !== undefined && !notConverged),
    coordinates,
    residuals,
  };
}

export function parseStarNetRunStatus(text: string): StarNetRunStatus | undefined {
  const lines = text.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
  const code = Number(lines[0]);
  if (!Number.isSafeInteger(code) || code < 0) return undefined;
  const messages = lines.slice(1);
  const flags: StarNetRunFlag[] = RUN_FLAGS
    .filter((flag) => (code & flag.bit) !== 0)
    .map((flag) => ({
      ...flag,
      message: messages.find((line) => Number(line.split(/\s+/, 1)[0]) === flag.bit) ?? flag.key,
    }));
  const lower = (code & 0x0002) !== 0;
  const upper = (code & 0x0004) !== 0;
  const fatal = flags.some((flag) => flag.fatal) || code >= 0x0100;
  return {
    code,
    adjustmentCompleted: !fatal,
    converged: !fatal && (code & 0x0008) === 0,
    chiSquareStatus: lower || upper ? 'failed' : 'not-found',
    chiSquareFailureTail: upper ? 'upper' : lower ? 'lower' : undefined,
    flags,
    messages,
  };
}

export function parseStarNetErrorFile(text: string): { warnings: string[]; errors: string[] } {
  const lines = text.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
  const warnings = lines.filter((line) => /^WARNING\b/i.test(line));
  const errors = lines.filter((line) =>
    /^ERROR\b/i.test(line)
    || /Processing Terminated Due to Errors/i.test(line)
    || /Non-Determinant Solution/i.test(line)
    || /Degrees of Freedom are Less than Zero/i.test(line)
    || /Project Options File.*Errors/i.test(line)
    || /Data line too long/i.test(line)
    || /^Unable to\b/i.test(line),
  );
  return { warnings: unique(warnings), errors: unique(errors) };
}

function assertUniqueCoordinateNames(rows: readonly StarNetNativeCoordinate[], source: string): void {
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.engineName)) throw new Error(`Duplicate STAR*NET coordinate ${row.engineName} in ${source}`);
    seen.add(row.engineName);
  }
}

export function parseStarNetNativeOutputs(
  files: readonly StarNetNativeFile[],
  consoleText = '',
  coordinateOrder: 'EN' | 'NE' = 'EN',
): StarNetNativeOutput {
  const byExtension = (extension: string) => files.find((file) => file.extension.toLowerCase() === extension)?.content;
  const listingText = byExtension('.lst');
  const listing = listingText ? parseStarNetListing(listingText) : undefined;
  const runText = byExtension('.run');
  const run = runText ? parseStarNetRunStatus(runText) : undefined;
  const errorText = byExtension('.err');
  const messages = errorText ? parseStarNetErrorFile(errorText) : { warnings: [], errors: [] };
  const ptsText = byExtension('.pts');
  const dumpText = byExtension('.dmp');
  const dumpRows = dumpText ? parseStarNetDumpFile(dumpText) : [];
  const ptsRows = ptsText ? parseStarNetCoordinateFile(ptsText, coordinateOrder) : [];
  const coordinateRows = dumpRows.length > 0
    ? dumpRows
    : ptsRows;
  assertUniqueCoordinateNames(dumpRows, '.dmp');
  assertUniqueCoordinateNames(ptsRows, '.pts');
  const listingByName = new Map(listing?.coordinates.map((row) => [row.engineName, row]));
  const coordinates = (coordinateRows.length > 0 ? coordinateRows : listing?.coordinates ?? []).map((row) => ({
    ...listingByName.get(row.engineName),
    ...row,
  }));
  const combined = `${consoleText}\n${listingText ?? ''}`;
  const consolePassed = /Chi-Square Test[^\r\n]*Passed/i.test(combined);
  const consoleFailed = /Chi-Square Test[^\r\n]*Failed/i.test(combined);
  const chiSquareStatus = listing && listing.chiSquareStatus !== 'not-found'
    ? listing.chiSquareStatus
    : run && run.chiSquareStatus !== 'not-found'
      ? run.chiSquareStatus
      : consolePassed
        ? 'passed'
        : consoleFailed
          ? 'failed'
          : 'not-found';
  const completed = run
    ? run.adjustmentCompleted && (Boolean(listing?.completed) || /Network Processing Completed/i.test(combined))
    : Boolean(listing?.completed) || /Network Processing Completed/i.test(combined);
  const converged = run
    ? run.converged && (Boolean(listing?.converged) || /Solution Has Converged/i.test(combined))
    : Boolean(listing?.converged) || /Solution Has Converged/i.test(combined);
  return {
    completed,
    converged,
    chiSquareStatus,
    chiSquareFailureTail: listing?.chiSquareFailureTail ?? run?.chiSquareFailureTail,
    listing,
    run,
    coordinates,
    residuals: listing?.residuals ?? [],
    warnings: messages.warnings,
    errors: messages.errors,
  };
}

/** UI-oriented summary kept outside the transport-only VM contract used by the Vercel API. */
export function parseStarNetConsoleSummary(result: {
  console: { stdout: string; stderr: string };
  outputFiles: StarNetNativeFile[];
}): StarNetConsoleSummary {
  const consoleText = `${result.console.stdout}\n${result.console.stderr}`;
  const native = parseStarNetNativeOutputs(result.outputFiles, consoleText);
  const listing = native.listing;
  const consoleIterations = consoleText.match(/Solution Has Converged in\s+(\d+)\s+Iterations?/i)?.[1];
  const consoleElapsed = consoleText.match(/Elapsed Time\s*=\s*([0-9:]+)/i)?.[1];
  const values = {
    stationCount: listing?.stationCount,
    observationCount: listing?.observationCount,
    unknownCount: listing?.unknownCount,
    degreesOfFreedom: listing?.degreesOfFreedom,
    weightedSsr: listing?.weightedSsr,
    varianceFactor: listing?.varianceFactor,
    totalErrorFactor: listing?.totalErrorFactor,
    runStatusCode: native.run?.code,
    coordinateCount: native.coordinates.length || undefined,
    warningCount: native.warnings.length || undefined,
    errorCount: native.errors.length || undefined,
  };
  return {
    completed: native.completed,
    converged: native.converged,
    iterations: listing?.iterations ?? (consoleIterations ? Number(consoleIterations) : undefined),
    chiSquareStatus: native.chiSquareStatus,
    elapsed: listing?.elapsed ?? consoleElapsed,
    ...Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)),
  };
}
