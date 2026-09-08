import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

// FVD_STA1 uses descriptive MPO column names, but otherwise follows the same Campbell import
// boundary and unchanged French double-face reduction as MF-LA and FVD_STA3.
const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/convert-fvd-sta1.mjs SOURCE.dat');
const source = resolve(input);
const raw = await readFile(source);
if (!raw.toString('utf8', 0, 80).startsWith('"TOA5","FVD_STA1",')) {
  throw new Error('Expected FVD_STA1 TOA5 source');
}

const output = resolve('src/demo/fixtures/fvd-sta1.generated');
execFileSync(process.execPath, ['scripts/convert-mf-la.mjs', output, source], { stdio: 'inherit' });
const manifestPath = resolve(output, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.datasetId = 'FVD-STA1-FR-DAILY-V1';
manifest.stations[0].sourceSha256 = createHash('sha256').update(raw).digest('hex');
manifest.stations[0].headerEnvelopeDecoded = false;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
