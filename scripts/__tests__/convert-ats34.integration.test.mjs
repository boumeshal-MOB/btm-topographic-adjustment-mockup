import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workbookPath = resolve('tools/demo-source/ATS34-Raw-Data-Lookup-Header.xlsx');
const outputPath = resolve('src/demo/fixtures/ats34.generated.json');

const hasWorkbook = existsSync(workbookPath);

// audit D-01/B-01: the real supplied workbook is ported into tools/demo-source/. If a future
// checkout is missing it, this test is skipped rather than inventing a fixture.
describe.skipIf(!hasWorkbook)('convert-ats34.mjs deterministic regeneration (audit B-02)', () => {
  it('regenerates a byte-identical canonical fixture on two consecutive runs', () => {
    execFileSync('node', ['scripts/convert-ats34.mjs'], { stdio: 'pipe' });
    const first = createHash('sha256').update(readFileSync(outputPath)).digest('hex');

    execFileSync('node', ['scripts/convert-ats34.mjs'], { stdio: 'pipe' });
    const second = createHash('sha256').update(readFileSync(outputPath)).digest('hex');

    expect(second).toBe(first);
  });

  it('does not vary with execution timestamp (no `new Date()` in provenance)', () => {
    const before = readFileSync(outputPath, 'utf-8');
    execFileSync('node', ['scripts/convert-ats34.mjs'], { stdio: 'pipe' });
    const after = readFileSync(outputPath, 'utf-8');
    expect(after).toBe(before);
    const fixture = JSON.parse(after);
    expect(fixture.meta.convertedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
