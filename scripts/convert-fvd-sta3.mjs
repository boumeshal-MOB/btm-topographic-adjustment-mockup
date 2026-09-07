import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

// Only unwrap the extra CSV envelope on the four header lines. All source data lines are
// passed verbatim to the existing French converter, with exactly its existing sentinel rules.
const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/convert-fvd-sta3.mjs SOURCE.dat');
const raw = await readFile(resolve(input));
const lines = raw.toString('utf8').split(/\r?\n/);
for (let index = 0; index < 4; index += 1) {
  const line = lines[index];
  if (line.startsWith('"') && line.endsWith('"') && line.includes('""')) {
    lines[index] = line.slice(1, -1).replaceAll('""', '"');
  }
}
if (!lines[0].startsWith('TOA5,"FVD_STA3",')) throw new Error('Expected FVD_STA3 TOA5 source');
const temporary = await mkdtemp(join(tmpdir(), 'fvd-sta3-'));
const normalized = join(temporary, basename(input));
await writeFile(normalized, lines.join('\n'));
const output = resolve('src/demo/fixtures/fvd-sta3.generated');
execFileSync(process.execPath, ['scripts/convert-mf-la.mjs', output, normalized], { stdio: 'inherit' });
const manifestPath = join(output, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.datasetId = 'FVD-STA3-FR-DAILY-V1';
manifest.stations[0].sourceSha256 = createHash('sha256').update(raw).digest('hex');
manifest.stations[0].headerEnvelopeDecoded = true;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
