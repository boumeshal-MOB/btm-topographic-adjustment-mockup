import type { EnvironmentReading } from '@/domain/corrections/atmosphere';
import { reduceDoubleFace, type SourceAngleUnit } from '@/domain/double-face';
import type { RawObservation } from '@/domain/entities';
import { parseGkaStation } from '@/domain/gka-station-import';

/** Text file selected in the browser. Keeping the content makes the imported source auditable. */
export interface StationImportSourceFile {
  name: string;
  size: number;
  lastModified: number;
  content: string;
}

export type DetectedStationFormat =
  | 'campbell-toa5-double-face'
  | 'uk-rts-points-environment'
  | 'observation-table'
  | 'gka-v40-total-station';

export type SuggestedCountryTemplate = 'FR' | 'UK' | 'REVIEW';

export interface StationImportFailureCounts {
  missingOrNonFinite: number;
  angleOutOfRange: number;
  distanceNotPositive: number;
  malformedRows: number;
}

export interface ParsedStationCandidate {
  /** Station code read from the source. The confirmation screen may replace it explicitly. */
  stationCode: string;
  detectedFormat: DetectedStationFormat;
  suggestedTemplate: SuggestedCountryTemplate;
  sourceAngleUnit: SourceAngleUnit | 'DMS';
  sourceFileNames: string[];
  sourceRowCount: number;
  acquisitionEpochs: string[];
  observations: RawObservation[];
  environment: EnvironmentReading[];
  targetNames: string[];
  failures: StationImportFailureCounts;
  warnings: string[];
}

export interface ParsedStationImportBatch {
  sourceFiles: StationImportSourceFile[];
  candidates: ParsedStationCandidate[];
}

const INVALID_SENTINELS = new Set([99990, -99990, -99995, -99997, -99999]);

function emptyFailures(): StationImportFailureCounts {
  return {
    missingOrNonFinite: 0,
    angleOutOfRange: 0,
    distanceNotPositive: 0,
    malformedRows: 0,
  };
}

/** RFC-4180-style row parser, also used with semicolon and tab delimiters. */
export function delimitedFields(line: string, delimiter = ','): string[] {
  const fields: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      fields.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  fields.push(value);
  return fields;
}

function normaliseHeaderEnvelope(lines: string[]): string[] {
  return lines.map((line, index) => {
    if (index < 4 && line.startsWith('"') && line.endsWith('"') && line.includes('""')
      && delimitedFields(line).length === 1) {
      return line.slice(1, -1).replaceAll('""', '"');
    }
    return line;
  });
}

function textLines(source: StationImportSourceFile): string[] {
  const lines = source.content.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return normaliseHeaderEnvelope(lines);
}

function isoEpoch(value: string): string | undefined {
  const source = value.trim();
  if (!source) return undefined;
  const hasZone = /(?:Z|[+-]\d\d(?::?\d\d)?)$/i.test(source);
  const normalised = source.includes('T') ? source : source.replace(' ', 'T');
  const parsed = new Date(hasZone ? normalised : `${normalised}Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function importedNumber(value: string | undefined): number {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || trimmed.toUpperCase() === 'NAN') return Number.NaN;
  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) && !INVALID_SENTINELS.has(parsed) ? parsed : Number.NaN;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function medianCycleMinutes(epochs: string[]): number {
  const unique = uniqueSorted(epochs).map((epoch) => new Date(epoch).getTime());
  const differences = unique.slice(1)
    .map((time, index) => (time - unique[index]) / 60_000)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  if (differences.length === 0) return 0;
  return Math.max(1, Math.round(differences[Math.floor(differences.length / 2)]));
}

interface CampbellTargetColumns {
  rawTargetName: string;
  hzFace1: string;
  vzFace1: string;
  sdFace1: string;
  hzFace2: string;
  vzFace2: string;
  sdFace2: string;
}

function campbellTargets(stationCode: string, headers: string[]): CampbellTargetColumns[] {
  const indexed = headers.flatMap((header) => {
    const match = header.match(/^HzF1\((\d+)\)$/i);
    if (!match) return [];
    const index = Number(match[1]);
    const actual = (names: string[]) => headers.find((candidate) =>
      names.some((name) => candidate.toLowerCase() === name.toLowerCase())) ?? names[0];
    return [{
      rawTargetName: `PRISM_${String(index).padStart(3, '0')}`,
      hzFace1: actual([`HzF1(${index})`]),
      vzFace1: actual([`VtF1(${index})`, `VzF1(${index})`]),
      sdFace1: actual([`SDF1(${index})`, `SdF1(${index})`]),
      hzFace2: actual([`HzF2(${index})`]),
      vzFace2: actual([`VtF2(${index})`, `VzF2(${index})`]),
      sdFace2: actual([`SDF2(${index})`, `SdF2(${index})`]),
    }];
  });
  if (indexed.length > 0) return indexed;

  const prefix = `${stationCode}_`;
  return headers.flatMap((header) => {
    if (!header.startsWith(prefix) || !/_F1_Hz$/i.test(header)) return [];
    const rawTargetName = header.slice(prefix.length).replace(/_F1_Hz$/i, '');
    const actual = (face: 1 | 2, components: string[]) => {
      const expected = components.map((component) => `${prefix}${rawTargetName}_F${face}_${component}`);
      return headers.find((candidate) => expected.some((name) => candidate.toLowerCase() === name.toLowerCase()))
        ?? expected[0];
    };
    return [{
      rawTargetName,
      hzFace1: actual(1, ['Hz']), vzFace1: actual(1, ['Vt', 'Vz']), sdFace1: actual(1, ['SD', 'Sd']),
      hzFace2: actual(2, ['Hz']), vzFace2: actual(2, ['Vt', 'Vz']), sdFace2: actual(2, ['SD', 'Sd']),
    }];
  });
}

function parseCampbell(source: StationImportSourceFile): ParsedStationCandidate {
  const lines = textLines(source);
  if (lines.length < 5) throw new Error(`${source.name}: Campbell TOA5 header found but no data rows were found.`);
  const toa5 = delimitedFields(lines[0]);
  const stationCode = toa5[1]?.trim();
  const headers = delimitedFields(lines[1]);
  if (toa5[0] !== 'TOA5' || !stationCode || headers[0]?.toUpperCase() !== 'TIMESTAMP') {
    throw new Error(`${source.name}: incomplete Campbell TOA5 header.`);
  }
  const targets = campbellTargets(stationCode, headers);
  if (targets.length === 0) {
    throw new Error(`${source.name}: no complete Face I/Face II target columns could be detected.`);
  }
  const indexByHeader = new Map(headers.map((header, index) => [header.toLowerCase(), index]));
  const missingColumns = targets.flatMap((target) => [
    target.hzFace1, target.vzFace1, target.sdFace1,
    target.hzFace2, target.vzFace2, target.sdFace2,
  ]).filter((header) => !indexByHeader.has(header.toLowerCase()));
  if (missingColumns.length > 0) {
    throw new Error(`${source.name}: incomplete double-face groups (${uniqueSorted(missingColumns).slice(0, 6).join(', ')}).`);
  }

  const temperatureIndex = headers.findIndex((header) => /(?:^|_)temperature$/i.test(header));
  const pressureIndex = headers.findIndex((header) => /(?:^|_)pressure$/i.test(header));
  const observations: RawObservation[] = [];
  const environment: EnvironmentReading[] = [];
  const acquisitionEpochs: string[] = [];
  const failures = emptyFailures();
  const warnings: string[] = [];
  const rows = lines.slice(4).filter((line) => line.trim().length > 0);

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const fields = delimitedFields(rows[rowIndex]);
    const epoch = isoEpoch(fields[0] ?? '');
    if (fields.length !== headers.length || !epoch) {
      failures.malformedRows += 1;
      continue;
    }
    acquisitionEpochs.push(epoch);
    const temperatureC = importedNumber(fields[temperatureIndex]);
    const pressureHPa = importedNumber(fields[pressureIndex]);
    if (Number.isFinite(temperatureC) && Number.isFinite(pressureHPa)) {
      environment.push({ epoch, temperatureC, pressureHPa });
    }

    for (const target of targets) {
      const cell = (header: string) => importedNumber(fields[indexByHeader.get(header.toLowerCase()) ?? -1]);
      const reduced = reduceDoubleFace({
        hzFace1: cell(target.hzFace1), vzFace1: cell(target.vzFace1), sdFace1M: cell(target.sdFace1),
        hzFace2: cell(target.hzFace2), vzFace2: cell(target.vzFace2), sdFace2M: cell(target.sdFace2),
      }, 'GON');
      if (!reduced.ok) {
        if (reduced.reason === 'missing-or-non-finite') failures.missingOrNonFinite += 1;
        if (reduced.reason === 'angle-out-of-range') failures.angleOutOfRange += 1;
        if (reduced.reason === 'distance-not-positive') failures.distanceNotPositive += 1;
        continue;
      }
      observations.push({
        id: `preview-${stationCode}-${epoch}-${target.rawTargetName}-${rowIndex}`,
        stationCode,
        rawTargetName: target.rawTargetName,
        epoch,
        ...reduced.observation,
      });
    }
  }

  if (failures.malformedRows > 0) warnings.push(`${failures.malformedRows} malformed row(s) could not be imported.`);
  const blocked = failures.missingOrNonFinite + failures.angleOutOfRange + failures.distanceNotPositive;
  if (blocked > 0) warnings.push(`${blocked} incomplete or invalid double-face target acquisition(s) remain excluded; no fallback value was created.`);
  if (observations.length === 0) throw new Error(`${source.name}: no valid complete double-face observation was found.`);

  return {
    stationCode,
    detectedFormat: 'campbell-toa5-double-face',
    suggestedTemplate: 'FR',
    sourceAngleUnit: 'GON',
    sourceFileNames: [source.name],
    sourceRowCount: rows.length,
    acquisitionEpochs: uniqueSorted(acquisitionEpochs),
    observations,
    environment,
    targetNames: targets.map((target) => target.rawTargetName),
    failures,
    warnings,
  };
}

function detectDelimiter(line: string): string {
  const candidates = [',', ';', '\t'];
  return candidates
    .map((delimiter) => ({ delimiter, count: delimitedFields(line, delimiter).length }))
    .sort((left, right) => right.count - left.count)[0].delimiter;
}

function normalisedColumn(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function columnIndex(headers: string[], aliases: string[]): number {
  const normalised = headers.map(normalisedColumn);
  return normalised.findIndex((header) => aliases.includes(header));
}

function observationTableHeaders(lines: string[]): string[] | undefined {
  const firstLine = lines.find((line) => line.trim());
  if (!firstLine) return undefined;
  const delimiter = detectDelimiter(firstLine);
  const headers = delimitedFields(firstLine, delimiter);
  const hasObservationColumns = columnIndex(headers, ['timestamp', 'time', 'epoch', 'datetime', 'startofcycle']) >= 0
    && columnIndex(headers, ['target', 'targetname', 'rawtargetname', 'point', 'pointname']) >= 0
    && columnIndex(headers, ['hz', 'hzdeg', 'hzgon', 'horizontalangle', 'horizontalangledeg', 'horizontalanglegon', 'azimuth']) >= 0
    && columnIndex(headers, ['vz', 'vzdeg', 'vzgon', 'vt', 'vtdeg', 'vtgon', 'v', 'verticalangle', 'zenith', 'zenithangle']) >= 0
    && columnIndex(headers, ['sd', 'sdm', 'distance', 'distancem', 'slopedistance', 'slopedistancem']) >= 0;
  return hasObservationColumns ? headers : undefined;
}

function stationFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, '').toUpperCase().replace(/[^A-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'IMPORTED_STATION';
}

function tableCandidate(source: StationImportSourceFile): ParsedStationCandidate[] {
  const lines = textLines(source).filter((line) => line.trim().length > 0);
  if (lines.length < 2) throw new Error(`${source.name}: the observation table is empty.`);
  const delimiter = detectDelimiter(lines[0]);
  const headers = delimitedFields(lines[0], delimiter);
  const timestampIndex = columnIndex(headers, ['timestamp', 'time', 'epoch', 'datetime', 'startofcycle']);
  const stationIndex = columnIndex(headers, ['station', 'stationcode', 'rts', 'instrument']);
  const targetIndex = columnIndex(headers, ['target', 'targetname', 'rawtargetname', 'point', 'pointname']);
  const hzIndex = columnIndex(headers, ['hz', 'hzdeg', 'hzgon', 'horizontalangle', 'horizontalangledeg', 'horizontalanglegon', 'azimuth']);
  const vzIndex = columnIndex(headers, ['vz', 'vzdeg', 'vzgon', 'vt', 'vtdeg', 'vtgon', 'v', 'verticalangle', 'zenith', 'zenithangle']);
  const sdIndex = columnIndex(headers, ['sd', 'sdm', 'distance', 'distancem', 'slopedistance', 'slopedistancem']);
  const temperatureIndex = columnIndex(headers, ['temperature', 'temperaturec', 'temp', 'tempc']);
  const pressureIndex = columnIndex(headers, ['pressure', 'pressurehpa', 'hpa']);
  if ([timestampIndex, targetIndex, hzIndex, vzIndex, sdIndex].some((index) => index < 0)) {
    throw new Error(`${source.name}: expected Timestamp, Target, Hz, Vz and Sd columns.`);
  }
  const hzIsGon = headers[hzIndex].toLowerCase().includes('gon');
  const vzIsGon = headers[vzIndex].toLowerCase().includes('gon');
  if (hzIsGon !== vzIsGon) {
    throw new Error(`${source.name}: Hz and Vz must declare the same angle unit (degrees or gon).`);
  }
  const anglesAreGon = hzIsGon;
  const byStation = new Map<string, ParsedStationCandidate>();
  for (let rowIndex = 1; rowIndex < lines.length; rowIndex += 1) {
    const fields = delimitedFields(lines[rowIndex], delimiter);
    const stationCode = fields[stationIndex]?.trim() || stationFromFileName(source.name);
    const candidate = byStation.get(stationCode) ?? {
      stationCode,
      detectedFormat: 'observation-table' as const,
      // A plain long table declares its angles but not its country/instrument configuration.
      // Gon identifies the FR convention; decimal degrees alone do not justify guessing UK.
      suggestedTemplate: anglesAreGon ? 'FR' as const : 'REVIEW' as const,
      sourceAngleUnit: anglesAreGon ? 'GON' as const : 'DEGREES' as const,
      sourceFileNames: [source.name],
      sourceRowCount: 0,
      acquisitionEpochs: [],
      observations: [],
      environment: [],
      targetNames: [],
      failures: emptyFailures(),
      warnings: [],
    };
    byStation.set(stationCode, candidate);
    candidate.sourceRowCount += 1;
    const epoch = isoEpoch(fields[timestampIndex] ?? '');
    if (epoch) candidate.acquisitionEpochs.push(epoch);
    const rawTargetName = fields[targetIndex]?.trim();
    if (rawTargetName) candidate.targetNames.push(rawTargetName);
    const hzSource = importedNumber(fields[hzIndex]);
    const vzSource = importedNumber(fields[vzIndex]);
    const sdM = importedNumber(fields[sdIndex]);
    if (!epoch || !rawTargetName || !Number.isFinite(hzSource) || !Number.isFinite(vzSource) || !Number.isFinite(sdM)) {
      candidate.failures.missingOrNonFinite += 1;
      continue;
    }
    const hzDeg = anglesAreGon ? hzSource * 0.9 : hzSource;
    const vzDeg = anglesAreGon ? vzSource * 0.9 : vzSource;
    if (hzDeg < 0 || hzDeg > 360 || vzDeg < 0 || vzDeg > 180) {
      candidate.failures.angleOutOfRange += 1;
      continue;
    }
    if (sdM <= 0) {
      candidate.failures.distanceNotPositive += 1;
      continue;
    }
    candidate.observations.push({
      id: `preview-${stationCode}-${epoch}-${rawTargetName}-${rowIndex}`,
      stationCode,
      rawTargetName,
      epoch,
      hzDeg,
      vzDeg,
      sdM,
    });
    const temperatureC = importedNumber(fields[temperatureIndex]);
    const pressureHPa = importedNumber(fields[pressureIndex]);
    if (Number.isFinite(temperatureC) && Number.isFinite(pressureHPa)) {
      candidate.environment.push({ epoch, temperatureC, pressureHPa });
    }
  }

  const candidates = [...byStation.values()];
  for (const candidate of candidates) {
    candidate.acquisitionEpochs = uniqueSorted(candidate.acquisitionEpochs);
    candidate.targetNames = uniqueSorted(candidate.targetNames);
    const invalid = candidate.failures.missingOrNonFinite
      + candidate.failures.angleOutOfRange
      + candidate.failures.distanceNotPositive;
    if (invalid > 0) candidate.warnings.push(`${invalid} invalid observation row(s) were excluded and remain visible in the import summary.`);
    if (candidate.observations.length === 0) throw new Error(`${source.name}: ${candidate.stationCode} has no valid Hz/Vz/Sd observation.`);
  }
  return candidates;
}

type UkFileKind = 'points' | 'environment' | undefined;

function ukFileKind(source: StationImportSourceFile): UkFileKind {
  let points = 0;
  let environment = 0;
  for (const line of textLines(source)) {
    if (!/^"?\d{4}-\d{2}-\d{2}/.test(line.trim())) continue;
    const fields = delimitedFields(line);
    if (fields.length === 9) points += 1;
    if (fields.length === 24) environment += 1;
  }
  if (points > environment && points > 0) return 'points';
  if (environment > 0) return 'environment';
  return undefined;
}

interface UkCycle {
  stationCode: string;
  cycleNumber: string;
  epoch: string;
  expectedObservationCount?: number;
  observations: RawObservation[];
  environment?: EnvironmentReading;
}

function parseUkPairs(sources: StationImportSourceFile[]): ParsedStationCandidate[] {
  const pointSources = sources.filter((source) => ukFileKind(source) === 'points');
  const environmentSources = sources.filter((source) => ukFileKind(source) === 'environment');
  if (pointSources.length === 0 || environmentSources.length === 0) {
    throw new Error('UK RTS import requires both RTS_Points and RTS_Environ files in the same selection.');
  }
  const cycles = new Map<string, UkCycle>();
  const sourceRowsByStation = new Map<string, number>();
  for (const source of environmentSources) {
    for (const line of textLines(source)) {
      if (!/^"?\d{4}-\d{2}-\d{2}/.test(line.trim())) continue;
      const fields = delimitedFields(line);
      if (fields.length !== 24) continue;
      const stationCode = fields[4]?.trim();
      const cycleNumber = fields[7]?.trim();
      const epoch = isoEpoch(fields[9] ?? '');
      if (!stationCode || !cycleNumber || !epoch) continue;
      if (fields[12]?.trim() && fields[12]?.trim() !== '0') {
        throw new Error(`${source.name}: UK cycle ${stationCode}|${cycleNumber} ended with code ${fields[12]}.`);
      }
      if (fields[14]?.trim() && fields[14]?.trim() !== '1') {
        throw new Error(`${source.name}: UK cycle ${stationCode}|${cycleNumber} uses an unsupported angle format.`);
      }
      sourceRowsByStation.set(stationCode, (sourceRowsByStation.get(stationCode) ?? 0) + 1);
      const key = `${stationCode}|${cycleNumber}`;
      if (cycles.has(key)) throw new Error(`${source.name}: duplicate UK cycle ${key}.`);
      cycles.set(key, {
        stationCode,
        cycleNumber,
        epoch,
        expectedObservationCount: Number(fields[8]),
        observations: [],
      });
    }
  }
  if (cycles.size === 0) throw new Error('No valid StartOfCycle row was found in the selected RTS_Environ files.');

  const unmatchedByStation = new Map<string, number>();
  const invalidByStation = new Map<string, { missing: number; distance: number }>();
  const targetNamesByStation = new Map<string, Set<string>>();
  for (const source of pointSources) {
    for (const line of textLines(source)) {
      if (!/^"?\d{4}-\d{2}-\d{2}/.test(line.trim())) continue;
      const fields = delimitedFields(line);
      if (fields.length !== 9) continue;
      const stationCode = fields[2]?.trim();
      const pointName = fields[3]?.trim();
      const cycleNumber = fields[7]?.trim();
      const cycle = cycles.get(`${stationCode}|${cycleNumber}`);
      if (stationCode) sourceRowsByStation.set(stationCode, (sourceRowsByStation.get(stationCode) ?? 0) + 1);
      if (!stationCode || !pointName || !cycle) {
        if (stationCode) unmatchedByStation.set(stationCode, (unmatchedByStation.get(stationCode) ?? 0) + 1);
        continue;
      }
      if (pointName === 'Lgr_Environ') {
        const temperatureC = importedNumber(fields[5]);
        const pressureHPa = importedNumber(fields[6]);
        if (Number.isFinite(temperatureC) && Number.isFinite(pressureHPa)) {
          cycle.environment = { epoch: cycle.epoch, temperatureC, pressureHPa };
        }
        continue;
      }
      if (pointName.startsWith('RTS_')) continue;
      const stationTargets = targetNamesByStation.get(stationCode) ?? new Set<string>();
      stationTargets.add(pointName);
      targetNamesByStation.set(stationCode, stationTargets);
      const hzDeg = importedNumber(fields[4]);
      const vzDeg = importedNumber(fields[5]);
      const sdM = importedNumber(fields[6]);
      if (![hzDeg, vzDeg, sdM].every(Number.isFinite)) {
        const invalid = invalidByStation.get(stationCode) ?? { missing: 0, distance: 0 };
        invalid.missing += 1;
        invalidByStation.set(stationCode, invalid);
        continue;
      }
      if (sdM <= 0) {
        const invalid = invalidByStation.get(stationCode) ?? { missing: 0, distance: 0 };
        invalid.distance += 1;
        invalidByStation.set(stationCode, invalid);
        continue;
      }
      cycle.observations.push({
        id: `preview-${stationCode}-${cycle.epoch}-${pointName}-${cycle.observations.length}`,
        stationCode,
        rawTargetName: pointName,
        epoch: cycle.epoch,
        hzDeg,
        vzDeg,
        sdM,
      });
    }
  }

  const stationCodes = uniqueSorted([...cycles.values()].map((cycle) => cycle.stationCode));
  return stationCodes.map((stationCode) => {
    const stationCycles = [...cycles.values()].filter((cycle) => cycle.stationCode === stationCode);
    const observations = stationCycles.flatMap((cycle) => cycle.observations);
    if (observations.length === 0) throw new Error(`${stationCode}: no valid observation was found in RTS_Points.`);
    const failures = emptyFailures();
    failures.malformedRows = unmatchedByStation.get(stationCode) ?? 0;
    failures.missingOrNonFinite = invalidByStation.get(stationCode)?.missing ?? 0;
    failures.distanceNotPositive = invalidByStation.get(stationCode)?.distance ?? 0;
    const warnings: string[] = [];
    const invalidMeasurements = failures.missingOrNonFinite + failures.distanceNotPositive;
    if (invalidMeasurements > 0) warnings.push(`${invalidMeasurements} invalid point observation(s) were excluded.`);
    const mismatchedCycles = stationCycles.filter((cycle) => Number.isFinite(cycle.expectedObservationCount)
      && cycle.expectedObservationCount !== cycle.observations.length).length;
    if (mismatchedCycles > 0) warnings.push(`${mismatchedCycles} cycle(s) do not match their declared observation count.`);
    const missingEnvironment = stationCycles.filter((cycle) => !cycle.environment).length;
    if (missingEnvironment > 0) warnings.push(`${missingEnvironment} cycle(s) have no valid temperature/pressure pair.`);
    if (failures.malformedRows > 0) warnings.push(`${failures.malformedRows} point row(s) had no matching environment cycle.`);
    return {
      stationCode,
      detectedFormat: 'uk-rts-points-environment',
      suggestedTemplate: 'UK',
      sourceAngleUnit: 'DMS',
      sourceFileNames: sources.map((source) => source.name),
      sourceRowCount: sourceRowsByStation.get(stationCode) ?? stationCycles.length,
      acquisitionEpochs: uniqueSorted(stationCycles.map((cycle) => cycle.epoch)),
      observations,
      environment: stationCycles.flatMap((cycle) => cycle.environment ? [cycle.environment] : []),
      targetNames: uniqueSorted([...(targetNamesByStation.get(stationCode) ?? [])]),
      failures,
      warnings,
    };
  });
}

function mergeCandidates(candidates: ParsedStationCandidate[]): ParsedStationCandidate[] {
  const byCode = new Map<string, ParsedStationCandidate>();
  for (const candidate of candidates) {
    const previous = byCode.get(candidate.stationCode);
    if (!previous) {
      byCode.set(candidate.stationCode, candidate);
      continue;
    }
    if (previous.detectedFormat !== candidate.detectedFormat) {
      throw new Error(`${candidate.stationCode}: files from two incompatible detected formats cannot be merged.`);
    }
    if (previous.sourceAngleUnit !== candidate.sourceAngleUnit) {
      throw new Error(`${candidate.stationCode}: files declaring different angle units cannot be merged.`);
    }
    previous.sourceFileNames = uniqueSorted([...previous.sourceFileNames, ...candidate.sourceFileNames]);
    previous.sourceRowCount += candidate.sourceRowCount;
    previous.acquisitionEpochs = uniqueSorted([...previous.acquisitionEpochs, ...candidate.acquisitionEpochs]);
    previous.observations = [...previous.observations, ...candidate.observations];
    previous.environment = [...previous.environment, ...candidate.environment];
    previous.targetNames = uniqueSorted([...previous.targetNames, ...candidate.targetNames]);
    previous.failures = {
      missingOrNonFinite: previous.failures.missingOrNonFinite + candidate.failures.missingOrNonFinite,
      angleOutOfRange: previous.failures.angleOutOfRange + candidate.failures.angleOutOfRange,
      distanceNotPositive: previous.failures.distanceNotPositive + candidate.failures.distanceNotPositive,
      malformedRows: previous.failures.malformedRows + candidate.failures.malformedRows,
    };
    previous.warnings = [...previous.warnings, ...candidate.warnings];
  }
  return [...byCode.values()].sort((left, right) => left.stationCode.localeCompare(right.stationCode));
}

/**
 * Detects supported station files from their contents, never from the extension alone.
 *
 * Supported inputs intentionally mirror the sources already exercised by the mock-up. Unknown
 * layouts stop at preview; a guessed column mapping is never allowed into the scientific chain.
 */
export function parseStationImportFiles(sourceFiles: StationImportSourceFile[]): ParsedStationImportBatch {
  if (sourceFiles.length === 0) throw new Error('Select at least one station file.');
  const campbell: StationImportSourceFile[] = [];
  const uk: StationImportSourceFile[] = [];
  const tables: StationImportSourceFile[] = [];
  const gka: StationImportSourceFile[] = [];
  const unknown: string[] = [];

  for (const source of sourceFiles) {
    if (source.content.includes('\0')) {
      unknown.push(source.name);
      continue;
    }
    const lines = textLines(source);
    if (delimitedFields(lines[0] ?? '')[0] === 'TOA5') campbell.push(source);
    else if (lines[0]?.trim() === 'Version40') gka.push(source);
    // A header-declared observation table takes precedence over the headerless UK row-shape
    // heuristic. Without this ordering, any ordinary nine-column CSV would look like RTS_Points.
    else if (observationTableHeaders(lines)) tables.push(source);
    else if (ukFileKind(source)) uk.push(source);
    else {
      unknown.push(source.name);
    }
  }
  if (unknown.length > 0) {
    throw new Error(`Unsupported or unrecognised file(s): ${unknown.join(', ')}.`);
  }

  const candidates: ParsedStationCandidate[] = [];
  for (const source of campbell) candidates.push(parseCampbell(source));
  if (uk.length > 0) candidates.push(...parseUkPairs(uk));
  for (const source of tables) candidates.push(...tableCandidate(source));
  for (const source of gka) candidates.push(...parseGkaStation(source));
  const merged = mergeCandidates(candidates);
  if (merged.length === 0) throw new Error('No station could be detected in the selected files.');

  // Expose the detected cycle estimate through a stable warning only when the source has one epoch;
  // callers calculate the same estimate for catalogue metadata without inventing a default.
  for (const candidate of merged) void medianCycleMinutes(candidate.acquisitionEpochs);
  return { sourceFiles, candidates: merged };
}

export function estimatedCycleMinutes(epochs: string[]): number {
  return medianCycleMinutes(epochs);
}
