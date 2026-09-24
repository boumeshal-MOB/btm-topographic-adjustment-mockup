import type { ParsedStationCandidate, StationImportSourceFile } from '@/domain/station-import';
import type { RawObservation } from '@/domain/entities';
import { isValidEngineName } from '@/domain/point-identity/engine-names';

// Candidate mapping for the supplied GOCA Version40 / #GOKA11 export. Other GKA
// versions and block types deliberately have no observation mapping here.
interface GkaSight {
  target: string;
  series: string;
  face: 1 | 2;
  sd: number;
  hz: number;
  vz: number;
  line: number;
}

/** Preserve the source prefix while proposing a valid, editable STAR*NET name. */
export function suggestedGkaStationCode(sourceName: string): string {
  const alias = sourceName.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 15);
  if (!isValidEngineName(alias) || !/^[A-Z0-9]/.test(alias)) {
    throw new Error(`Cannot derive a STAR*NET station name from "${sourceName}".`);
  }
  return alias;
}

function numberField(value: string | undefined): number {
  if (!value || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return Number.NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) && ![-99990, -99995, -99997, -99999, 99990].includes(parsed)
    ? parsed : Number.NaN;
}

function epochFromGka(week: string, day: string, seconds: string): string | undefined {
  if (!/^\d+$/.test(week) || !/^\d+$/.test(day)) return undefined;
  const w = Number(week);
  const d = Number(day);
  const s = numberField(seconds);
  if (!Number.isSafeInteger(w) || d < 0 || d > 6 || !Number.isFinite(s) || s < 0 || s >= 86400) return undefined;
  const time = Date.UTC(1980, 0, 6) + ((w * 7 + d) * 86400 + s) * 1000;
  return Number.isFinite(time) && !Number.isNaN(new Date(time).getTime())
    ? new Date(time).toISOString() : undefined;
}

function validSight(sight: GkaSight): boolean {
  return sight.sd > 0 && sight.hz >= 0 && sight.hz < 400
    && sight.vz >= 0 && sight.vz <= 400
    && Number.isFinite(sight.sd) && Number.isFinite(sight.hz) && Number.isFinite(sight.vz);
}

function validFirst(sight: GkaSight): boolean {
  return validSight(sight) && sight.vz <= 200;
}

function singleFace(sight: GkaSight): Pick<RawObservation, 'hzDeg' | 'vzDeg' | 'sdM'> {
  return { hzDeg: sight.hz * 0.9, vzDeg: sight.vz * 0.9, sdM: sight.sd };
}

function pairedFaces(first: GkaSight, second: GkaSight): Pick<RawObservation, 'hzDeg' | 'vzDeg' | 'sdM'> {
  const f2HzOnF1 = ((second.hz - 200) % 400 + 400) % 400;
  const delta = ((f2HzOnF1 - first.hz + 600) % 400) - 200;
  return {
    hzDeg: (((first.hz + delta / 2) % 400 + 400) % 400) * 0.9,
    vzDeg: ((first.vz + (400 - second.vz)) / 2) * 0.9,
    sdM: (first.sd + second.sd) / 2,
  };
}

export function parseGkaStation(source: StationImportSourceFile): ParsedStationCandidate[] {
  const lines = source.content.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines[0]?.trim() !== 'Version40') throw new Error(`${source.name}: only GKA Version40 is mapped.`);
  const candidates = new Map<string, ParsedStationCandidate>();
  let station: ParsedStationCandidate | undefined;
  let groups: Map<string, { first: GkaSight[]; second: GkaSight[] }> | undefined;
  let ended = false;
  let blocks = 0;
  let cycleEpoch: string | undefined;
  let blockSeries: string | undefined;

  const finishBlock = () => {
    if (!station || !groups || !cycleEpoch) throw new Error(`${source.name}: GKA block has no valid first sight timestamp.`);
    let emitted = 0;
    for (const [key, pair] of groups) {
      const count = Math.max(pair.first.length, pair.second.length);
      for (let index = 0; index < count; index += 1) {
        const first = pair.first[index];
        const second = pair.second[index];
        if (!first) {
          station.failures.missingOrNonFinite += 1;
          continue;
        }
        if (!validFirst(first)) {
          station.failures.missingOrNonFinite += 1;
          continue;
        }
        const canPair = second && validSight(second) && second.vz >= 200;
        const values = canPair ? pairedFaces(first, second) : singleFace(first);
        if (!canPair && second) station.failures.missingOrNonFinite += 1;
        station.observations.push({
          id: `preview-gka-${source.name}-${blocks}-${key}-${index}`,
          stationCode: station.stationCode,
          rawTargetName: first.target,
          epoch: cycleEpoch,
          ...values,
        });
        emitted += 1;
        if (!canPair) station.warnings.push(`Face 1 only: ${first.target}, series ${first.series}, line ${first.line}.`);
      }
    }
    if (emitted === 0) throw new Error(`${source.name}: GKA block has no usable observations.`);
    station.acquisitionEpochs.push(cycleEpoch);
    station = undefined;
    groups = undefined;
    cycleEpoch = undefined;
    blockSeries = undefined;
  };

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith(';')) continue;
    if (ended) throw new Error(`${source.name}: content after Ende at line ${index + 1}.`);
    if (line === '#GOKA11') {
      if (groups) throw new Error(`${source.name}: nested GKA block at line ${index + 1}.`);
      groups = new Map();
      station = undefined;
      cycleEpoch = undefined;
      blockSeries = undefined;
      blocks += 1;
      continue;
    }
    if (line === '#END11') {
      finishBlock();
      continue;
    }
    if (line === 'Ende') {
      if (groups) throw new Error(`${source.name}: unclosed GKA block.`);
      ended = true;
      continue;
    }
    if (line.startsWith('#')) throw new Error(`${source.name}: unsupported GKA block at line ${index + 1}.`);
    if (!groups) throw new Error(`${source.name}: observation outside GKA block at line ${index + 1}.`);
    const fields = line.split(',').map((field) => field.trim());
    if (!station) {
      if (fields.length < 10 || !fields[0]) throw new Error(`${source.name}: invalid station header at line ${index + 1}.`);
      const code = fields[0];
      station = candidates.get(code);
      if (!station) {
        station = {
          stationCode: code,
          detectedFormat: 'gka-v40-total-station',
          suggestedTemplate: 'REVIEW',
          sourceAngleUnit: 'GON',
          sourceFileNames: [source.name],
          sourceRowCount: 0,
          acquisitionEpochs: [],
          observations: [],
          environment: [],
          targetNames: [],
          failures: { missingOrNonFinite: 0, angleOutOfRange: 0, distanceNotPositive: 0, malformedRows: 0 },
          warnings: ['GKA Version40/#GOKA11 candidate mapping: distance in m and angles in gon; confirm units, prism corrections and time scale with the exporter. Calendar values are provisionally represented as UTC for this mock-up; no GPS–UTC or local-time correction is applied.'],
        };
        candidates.set(code, station);
      }
      continue;
    }
    station.sourceRowCount += 1;
    if (!cycleEpoch) {
      // The first data row in this block defines its cycle, not the file name or a later prism.
      cycleEpoch = epochFromGka(fields[2] ?? '', fields[3] ?? '', fields[4] ?? '');
      if (!cycleEpoch) throw new Error(`${source.name}: first sight in GKA block has no valid timestamp at line ${index + 1}.`);
    }
    if (fields.length < 15 || !fields[0]) {
      station.failures.malformedRows += 1;
      continue;
    }
    const epoch = epochFromGka(fields[2], fields[3], fields[4]);
    const face = Number(fields[6]);
    const series = fields[5];
    if (!epoch || !series || (face !== 1 && face !== 2)) {
      station.failures.malformedRows += 1;
      continue;
    }
    if (blockSeries && blockSeries !== series) {
      throw new Error(`${source.name}: multiple set numbers in one GKA block at line ${index + 1}.`);
    }
    blockSeries = series;
    station.targetNames.push(fields[0]);
    const sight: GkaSight = {
      target: fields[0], series, face,
      sd: numberField(fields[7]), hz: numberField(fields[10]), vz: numberField(fields[12]),
      line: index + 1,
    };
    const key = `${series}| ${fields[0]}`;
    const group = groups.get(key) ?? { first: [], second: [] };
    (face === 1 ? group.first : group.second).push(sight);
    groups.set(key, group);
  }
  if (groups || !ended || blocks === 0) throw new Error(`${source.name}: incomplete GKA Version40 file.`);
  for (const candidate of candidates.values()) {
    candidate.acquisitionEpochs = [...new Set(candidate.acquisitionEpochs)].sort();
    candidate.targetNames = [...new Set(candidate.targetNames)].sort();
    if (candidate.observations.length === 0) throw new Error(`${source.name}: ${candidate.stationCode} has no usable face 1 observation.`);
    const fallbackCount = candidate.warnings.length - 1;
    candidate.warnings = [candidate.warnings[0],
      ...(fallbackCount ? [`${fallbackCount} face 1 observation(s) were used without a valid face 2.`] : [])];
  }
  return [...candidates.values()];
}
