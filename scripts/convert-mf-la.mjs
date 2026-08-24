import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const INVALID_SENTINELS = new Set([-99990, -99995, -99997, -99999]);
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

function measurement(value) {
  const source = value?.trim();
  if (!source || source.toUpperCase() === 'NAN') return null;
  const parsed = Number(source);
  return Number.isFinite(parsed) && !INVALID_SENTINELS.has(parsed) ? parsed : null;
}

function epoch(value) {
  const parsed = new Date(`${value.trim().replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid timestamp: ${value}`);
  return parsed.toISOString();
}

async function convertFile(filePath, outputDir) {
  const raw = await readFile(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 5) throw new Error(`${filePath}: expected a Campbell TOA5 header and data rows`);

  const metadata = csvFields(lines[0]);
  const stationCode = metadata[1]?.trim();
  const headers = csvFields(lines[1]);
  if (!stationCode || headers[0] !== 'TIMESTAMP') throw new Error(`${filePath}: unsupported Campbell header`);

  const column = new Map(headers.map((header, index) => [header, index]));
  const targetCount = headers.filter((header) => /^HzF1\(\d+\)$/.test(header)).length;
  const rows = lines.slice(4).map((line) => {
    const source = csvFields(line);
    const targets = [];
    for (let target = 1; target <= targetCount; target += 1) {
      targets.push([
        measurement(source[column.get(`HzF1(${target})`)]),
        measurement(source[column.get(`VtF1(${target})`)]),
        measurement(source[column.get(`SDF1(${target})`)]),
        measurement(source[column.get(`HzF2(${target})`)]),
        measurement(source[column.get(`VtF2(${target})`)]),
        measurement(source[column.get(`SDF2(${target})`)]),
      ]);
    }
    return [
      epoch(source[0]),
      measurement(source[1]),
      measurement(source[column.get(`${stationCode}_Temperature`)]),
      measurement(source[column.get(`${stationCode}_Pressure`)]),
      targets,
    ];
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
    firstEpoch: rows[0]?.[0] ?? null,
    lastEpoch: rows.at(-1)?.[0] ?? null,
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
  schemaVersion: 1,
  datasetId: 'MF-LA-FR-NETWORK-V1',
  angleUnit: 'GON',
  invalidSentinels: [...INVALID_SENTINELS].sort((a, b) => a - b),
  rowsPreserved: true,
  stations,
}, null, 2)}\n`);
