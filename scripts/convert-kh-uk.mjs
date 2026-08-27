import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_STATIONS = new Set(['KH01', 'KH02']);
const CYCLES_PER_SHARD = 10;

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

function isoEpoch(value) {
  const parsed = new Date(`${value.trim().replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid timestamp: ${value}`);
  return parsed.toISOString();
}

function finiteNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} is not finite: ${value}`);
  return parsed;
}

function stationCode(value) {
  if (!EXPECTED_STATIONS.has(value)) throw new Error(`Unsupported anonymised station code: ${value}`);
  return value;
}

function cycleKey(station, cycleNumber) {
  return `${station}|${cycleNumber}`;
}

async function sourceFiles(sourceDir) {
  const names = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) names.push(path);
    }
  };
  await visit(sourceDir);
  names.sort((left, right) => left.localeCompare(right));
  const points = names.filter((name) => name.endsWith('_RTS_Points.dat'));
  const environment = names.filter((name) => name.endsWith('_RTS_Environ.dat'));
  if (points.length === 0 || environment.length === 0) {
    throw new Error(`${sourceDir}: expected RTS_Points.dat and RTS_Environ.dat files`);
  }
  return { points, environment };
}

async function parseEnvironmentFiles(paths) {
  const cycles = new Map();
  for (const path of paths) {
    const lines = (await readFile(path, 'utf8')).split(/\r?\n/);
    for (const line of lines) {
      if (!line.startsWith('"20')) continue;
      const fields = csvFields(line);
      if (fields.length !== 24) throw new Error(`${basename(path)}: expected 24 environment columns`);
      const station = stationCode(fields[4]);
      const cycleNumber = finiteNumber(fields[7], 'CycleNumber');
      const key = cycleKey(station, cycleNumber);
      if (cycles.has(key)) throw new Error(`${basename(path)}: duplicate environment cycle ${key}`);
      if (fields[12] !== '0') throw new Error(`${basename(path)}: cycle ${key} ended with code ${fields[12]}`);
      if (fields[14] !== '1') throw new Error(`${basename(path)}: cycle ${key} is not the UK DMS source format`);
      cycles.set(key, {
        stationCode: station,
        cycleNumber,
        epoch: isoEpoch(fields[9]),
        expectedObservationCount: finiteNumber(fields[8], 'PtsInThisCycle'),
      });
    }
  }
  return cycles;
}

async function parsePointFiles(paths, cycles) {
  const seenTargets = new Set();
  let technicalRecordCount = 0;
  for (const path of paths) {
    const lines = (await readFile(path, 'utf8')).split(/\r?\n/);
    for (const line of lines) {
      if (!line.startsWith('"20')) continue;
      const fields = csvFields(line);
      if (fields.length !== 9) throw new Error(`${basename(path)}: expected 9 point columns`);
      const station = stationCode(fields[2]);
      const cycleNumber = finiteNumber(fields[7], 'CycleNum');
      const key = cycleKey(station, cycleNumber);
      const cycle = cycles.get(key);
      if (!cycle) throw new Error(`${basename(path)}: point row has no environment cycle ${key}`);
      const pointName = fields[3];

      if (pointName === 'Lgr_Environ') {
        const vz = finiteNumber(fields[5], `${key}/${pointName} temperature`);
        const sdM = finiteNumber(fields[6], `${key}/${pointName} pressure`);
        cycle.environment = { temperatureC: vz, pressureHPa: sdM };
        technicalRecordCount += 1;
        continue;
      }
      if (pointName.startsWith('RTS_')) {
        technicalRecordCount += 1;
        continue;
      }
      const hz = finiteNumber(fields[4], `${key}/${pointName} Hz`);
      const vz = finiteNumber(fields[5], `${key}/${pointName} V`);
      const sdM = finiteNumber(fields[6], `${key}/${pointName} slope distance`);
      if (sdM <= 0) throw new Error(`${key}/${pointName}: slope distance must be positive`);

      const targetKey = `${key}|${pointName}`;
      if (seenTargets.has(targetKey)) throw new Error(`${basename(path)}: duplicate target ${targetKey}`);
      seenTargets.add(targetKey);
      cycle.observations ??= [];
      cycle.observations.push([pointName, hz, vz, sdM]);
    }
  }
  return technicalRecordCount;
}

function validateCycles(cycles) {
  for (const [key, cycle] of cycles) {
    if (!cycle.environment) throw new Error(`${key}: missing Lgr_Environ temperature/pressure`);
    if (!cycle.observations) throw new Error(`${key}: no observations`);
    if (cycle.observations.length !== cycle.expectedObservationCount) {
      throw new Error(
        `${key}: ${cycle.observations.length} observations; expected ${cycle.expectedObservationCount}`,
      );
    }
  }
}

async function writeGeneratedData(outputDir, cycles, technicalRecordCount) {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  const stations = [];
  for (const stationCodeValue of [...EXPECTED_STATIONS].sort()) {
    const stationCycles = [...cycles.values()]
      .filter((cycle) => cycle.stationCode === stationCodeValue)
      .sort((left, right) => left.epoch.localeCompare(right.epoch));
    const targetNames = new Set(stationCycles.flatMap((cycle) => cycle.observations.map((row) => row[0])));
    const shardFiles = [];
    for (let offset = 0; offset < stationCycles.length; offset += CYCLES_PER_SHARD) {
      const shardNumber = Math.floor(offset / CYCLES_PER_SHARD) + 1;
      const fileName = `${stationCodeValue.toLowerCase()}-${String(shardNumber).padStart(3, '0')}.json`;
      const payload = {
        stationCode: stationCodeValue,
        cycles: stationCycles.slice(offset, offset + CYCLES_PER_SHARD).map((cycle) => ({
          epoch: cycle.epoch,
          environment: [cycle.environment.temperatureC, cycle.environment.pressureHPa],
          observations: cycle.observations,
        })),
      };
      await writeFile(resolve(outputDir, fileName), `${JSON.stringify(payload)}\n`);
      shardFiles.push(fileName);
    }
    stations.push({
      stationCode: stationCodeValue,
      cycleCount: stationCycles.length,
      observationCount: stationCycles.reduce((total, cycle) => total + cycle.observations.length, 0),
      targetCount: targetNames.size,
      environmentCount: stationCycles.length,
      firstEpoch: stationCycles[0]?.epoch ?? null,
      lastEpoch: stationCycles.at(-1)?.epoch ?? null,
      shardFiles,
    });
  }

  const manifest = {
    schemaVersion: 1,
    datasetId: 'UK-KH-FIELD-STATIONS-V1',
    countryTemplate: 'UK',
    sourceAngleUnit: 'DMS',
    canonicalAngleUnit: 'DEGREES',
    sourceDistanceKind: 'slope',
    cycleEpoch: 'StartOfCycle',
    anonymised: true,
    technicalRecordCount,
    stations,
  };
  await writeFile(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function convertKhUk(sourceDir, outputDir) {
  const paths = await sourceFiles(resolve(sourceDir));
  const cycles = await parseEnvironmentFiles(paths.environment);
  const technicalRecordCount = await parsePointFiles(paths.points, cycles);
  validateCycles(cycles);
  return writeGeneratedData(resolve(outputDir), cycles, technicalRecordCount);
}

const isCommandLine = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isCommandLine) {
  const [sourceArg, outputArg] = process.argv.slice(2);
  if (!sourceArg || !outputArg) {
    throw new Error('Usage: node scripts/convert-kh-uk.mjs SOURCE_DIR OUTPUT_DIR');
  }
  await convertKhUk(sourceArg, outputArg);
}
