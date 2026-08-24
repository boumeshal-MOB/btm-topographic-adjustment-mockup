import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

// Source values that mean "missing measurement" in the supplied French Campbell files.
// Keep both signs of 99990: earlier exports used -99990, while the current import rule also
// explicitly names 99990. JSON cannot encode NaN, so these values are serialised as `null` and
// restored to Number.NaN by the browser-side raw-data loader.
const INVALID_SENTINELS = new Set([99990, -99990, -99995, -99997, -99999]);
const ROWS_PER_SHARD = 10;

function csvFields(line) {
  const fields = [];
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
    } else if (char === ',' && !quoted) {
      fields.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  fields.push(value);
  return fields;
}

function importedCell(value, replacements) {
  const source = value ?? '';
  const trimmed = source.trim();
  if (trimmed.toUpperCase() === 'NAN') {
    replacements.NAN += 1;
    return null;
  }

  // An empty Campbell field stays empty. It is not one of the French NaN sentinels and must not
  // be silently reclassified or removed (the UK import will rely on that distinction later).
  if (trimmed === '') return '';

  const parsed = Number(trimmed);
  if (Number.isFinite(parsed)) {
    if (INVALID_SENTINELS.has(parsed)) {
      replacements[String(parsed)] += 1;
      return null;
    }
    return parsed;
  }

  // Preserve every non-numeric source value verbatim. The converter is an import boundary, not a
  // measurement-processing step.
  return source;
}

function epoch(value) {
  const parsed = new Date(`${value.trim().replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid timestamp: ${value}`);
  return parsed.toISOString();
}

async function convertFile(filePath, outputDir) {
  const raw = await readFile(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  if (lines.length < 5) throw new Error(`${filePath}: expected a Campbell TOA5 header and data rows`);

  const toa5Header = csvFields(lines[0]);
  const stationCode = toa5Header[1]?.trim();
  const headers = csvFields(lines[1]);
  if (!stationCode || headers[0] !== 'TIMESTAMP') throw new Error(`${filePath}: unsupported Campbell header`);

  const fieldTypes = csvFields(lines[2]);
  const units = csvFields(lines[3]);
  if (fieldTypes.length !== headers.length || units.length !== headers.length) {
    throw new Error(`${filePath}: Campbell header rows do not have the same column count`);
  }

  const targetCount = headers.filter((header) => /^HzF1\(\d+\)$/.test(header)).length;
  const replacements = {
    NAN: 0,
    '99990': 0,
    '-99990': 0,
    '-99995': 0,
    '-99997': 0,
    '-99999': 0,
  };
  const rows = lines.slice(4).map((line, rowIndex) => {
    const source = csvFields(line);
    if (source.length !== headers.length) {
      throw new Error(
        `${filePath}: data row ${rowIndex + 1} has ${source.length} columns; expected ${headers.length}`,
      );
    }
    return source.map((value) => importedCell(value, replacements));
  });

  const shardFiles = [];
  for (let offset = 0; offset < rows.length; offset += ROWS_PER_SHARD) {
    const shardNumber = Math.floor(offset / ROWS_PER_SHARD) + 1;
    const fileName = `${stationCode.toLowerCase()}-${String(shardNumber).padStart(3, '0')}.json`;
    const payload = { stationCode, rows: rows.slice(offset, offset + ROWS_PER_SHARD) };
    await writeFile(resolve(outputDir, fileName), `${JSON.stringify(payload)}\n`);
    shardFiles.push(fileName);
  }

  return {
    stationCode,
    targetCount,
    rowCount: rows.length,
    columnCount: headers.length,
    rawFaceSlotCount: rows.length * targetCount * 2,
    firstEpoch: rows[0]?.[0] ? epoch(String(rows[0][0])) : null,
    lastEpoch: rows.at(-1)?.[0] ? epoch(String(rows.at(-1)[0])) : null,
    toa5Header,
    columns: headers,
    fieldTypes,
    units,
    nullReplacements: replacements,
    nullReplacementCount: Object.values(replacements).reduce((sum, count) => sum + count, 0),
    sourceFile: basename(filePath),
    sourceSha256: createHash('sha256').update(raw).digest('hex'),
    shardFiles,
  };
}

const [outputArg, ...inputArgs] = process.argv.slice(2);
if (!outputArg || inputArgs.length === 0) {
  throw new Error('Usage: node scripts/convert-mf-la.mjs OUTPUT_DIR STA1.dat [STA2.dat ...]');
}

const outputDir = resolve(outputArg);
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
const stations = [];
for (const input of inputArgs) stations.push(await convertFile(resolve(input), outputDir));
stations.sort((left, right) => left.stationCode.localeCompare(right.stationCode));
await writeFile(resolve(outputDir, 'manifest.json'), `${JSON.stringify({
  schemaVersion: 2,
  datasetId: 'MF-LA-FR-NETWORK-V1',
  angleUnit: 'GON',
  invalidSentinels: [...INVALID_SENTINELS].sort((a, b) => a - b),
  invalidTextValues: ['NAN'],
  rowsPreserved: true,
  columnsPreserved: true,
  faceReduction: 'none',
  stations,
}, null, 2)}\n`);
