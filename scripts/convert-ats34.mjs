#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Development-only converter: turns the real preparation workbook
// "ATS34 Raw Data, Lookup, Header (1).xlsx" into the local demo fixture JSON.
// This script is NEVER part of the product UI - the BTM user never uploads
// or maps a file. It exists so the real supplied dataset can back the mock-up
// (DEMO-001, DATA-006).
//
// Ported (controlled port, audit B-01) from boumeshal-MOB/StarNet
// @ bd4216d5299ff761512e37a04ed46282c0c811bb:scripts/convert-ats34.mjs. Pure column-mapping
// logic lives in scripts/lib/ats34-transform.mjs so it is independently unit-testable; this
// file is I/O glue only, hardened for deterministic regeneration (audit B-02): the workbook's
// SHA-256 hash is the provenance identity, `convertedAt` is a stable value (never `new Date()`
// at run time), and every business-row array is sorted by an explicit deterministic key.
//
// Usage:
//   npm i -D xlsx
//   node scripts/convert-ats34.mjs "tools/demo-source/ATS34-Raw-Data-Lookup-Header.xlsx"
//
// Output: src/demo/fixtures/ats34.generated.json
// ---------------------------------------------------------------------------
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  computeReferences,
  normalizeHeader,
  normalizeLookup,
  normalizeRawObservations,
  runControlChecks,
} from './lib/ats34-transform.mjs';

const require = createRequire(import.meta.url);
const wbPath = process.argv[2] ?? 'tools/demo-source/ATS34-Raw-Data-Lookup-Header.xlsx';
const schemaVersion = 1;

// Stable provenance timestamp (audit B-02): never `new Date()`. Override only via this
// constant when the fixture is intentionally re-cut; a fixed value keeps regeneration
// byte-for-byte identical on the canonical content.
const CONVERTED_AT = '2026-07-13T00:00:00.000Z';

let XLSX;
try {
  XLSX = require('xlsx');
} catch {
  console.error('SheetJS is not installed. Run: npm i -D xlsx');
  process.exit(1);
}

const workbookBuffer = readFileSync(wbPath);
const sourceHash = createHash('sha256').update(workbookBuffer).digest('hex');

const wb = XLSX.read(workbookBuffer, { cellDates: true });
const sheet = (needle) => {
  const found = wb.SheetNames.find((n) => n.toLowerCase().includes(needle.toLowerCase()));
  if (!found) throw new Error(`Sheet "${needle}" not found. Sheets: ${wb.SheetNames.join(', ')}`);
  return XLSX.utils.sheet_to_json(wb.Sheets[found], { defval: null });
};

const warnings = [];

const { rows: rawObservations, skippedCount, issues } = normalizeRawObservations(sheet('Raw'));
if (skippedCount > 0) {
  warnings.push(`${skippedCount} raw rows skipped (missing RTS/Target/Sd)`);
}
// Explicit validation issues (audit item 7): never silently zeroed/emitted. The supplied ATS34
// workbook produces zero issues; a modified workbook that introduced a missing Hz/Vz/Sd, an
// invalid date or a duplicate id would surface here and be excluded, not corrupted.
for (const issue of issues) {
  warnings.push(`row ${issue.id} excluded: ${issue.problems.join(', ')}`);
}
if (issues.length > 0) {
  console.log(`WARNING: ${issues.length} raw observation(s) failed validation and were excluded`);
}

const lookup = normalizeLookup(sheet('Lookup'));
const header = normalizeHeader(sheet('Header'));
const references = computeReferences(header, lookup);

const checks = runControlChecks();
let checksPass = true;
for (const { raw, c, expected, got, pass } of checks) {
  checksPass &&= pass;
  console.log(`check: ${raw} + ${(c * 1000).toFixed(1)}mm = ${got} (expected ${expected}) ${pass ? 'PASS' : 'FAIL'}`);
  if (!pass) warnings.push(`control check failed: ${raw} + ${c} !== ${expected}`);
}

const stations = [...new Set(rawObservations.map((o) => o.stationCode))].sort();
const targetNames = [...new Set(rawObservations.map((o) => o.rawTargetName))].sort();
const prismConstants = [...new Set(lookup.map((l) => l.PrismConstant))].sort((a, b) => a - b);
const epochs = rawObservations.map((o) => o.epoch).sort();

console.log('stations:', stations.join(', '));
console.log('prism constants (m):', prismConstants.join(', '));
console.log(
  `rows: ${rawObservations.length} observations, ${lookup.length} lookup, ${header.length} header`,
);

const fixture = {
  meta: {
    schemaVersion,
    source: wbPath.split('/').pop(),
    sourceSha256: sourceHash,
    convertedAt: CONVERTED_AT,
    stations,
    targetCount: targetNames.length,
    referenceCount: references.length,
    period: { from: epochs[0] ?? null, to: epochs[epochs.length - 1] ?? null },
    prismConstantsM: prismConstants,
    counts: {
      rawObservations: rawObservations.length,
      lookup: lookup.length,
      header: header.length,
    },
    warnings,
  },
  rawObservations,
  lookup,
  header,
};

const out = resolve('src/demo/fixtures/ats34.generated.json');
// Stable key order + trailing newline: byte-identical regeneration is asserted by the
// fixture-contract test (audit B-02).
writeFileSync(out, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`written: ${out} ${checksPass ? '' : '(WARNING: validation checks failed)'}`);
