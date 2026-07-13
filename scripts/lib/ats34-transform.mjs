// ---------------------------------------------------------------------------
// Pure transformation functions used by scripts/convert-ats34.mjs. Kept free of
// filesystem/XLSX I/O so they are directly unit-testable (audit B-01/B-02: the
// converter itself is ported from StarNet; these functions are extracted here to make the
// port's column mapping and note-column tolerance independently testable).
// ---------------------------------------------------------------------------

/** Tolerant column accessor: real headers can have trailing spaces, e.g. "StDev (E) ". */
export function get(row, ...names) {
  for (const n of names) {
    if (row[n] !== undefined) return row[n];
    const key = Object.keys(row).find((k) => k.trim().toLowerCase() === n.trim().toLowerCase());
    if (key) return row[key];
  }
  return null;
}

/** "20241202_0200" -> ISO ; also accepts a real Date or an ISO string. */
export function parseCycle(v) {
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  const m = s.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})$/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])).toISOString();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

export function toBool(v) {
  return v === true || v === 1 || ['true', 'yes', '1'].includes(String(v).toLowerCase());
}

/** '*' = free, '!' = fixed, number = constraint sigma (m). -1 / null -> unspecified ('*'). */
export function parseConstraint(v) {
  if (v === '*' || v === '!') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : '*';
}

export function cleanType(v) {
  const n = Number(v);
  return v === null || v === '' || n === -1 ? '' : String(v);
}

/**
 * Normalises Raw Observations rows. Only the 7 business columns (Timestamp, RecordNumber,
 * RTS, Target, Hz, Vz, Sd) are read via `get()`; any extra note columns present in the sheet
 * are never looked up, so they are tolerated without dropping or corrupting the business
 * columns (implementation/32 §2 P1).
 */
export function normalizeRawObservations(rawRows) {
  const rows = rawRows
    .filter((r) => get(r, 'RTS') && get(r, 'Target') && get(r, 'Sd') !== null)
    .map((r, i) => ({
      id: `obs-${get(r, 'RTS')}-${get(r, 'Target')}-${get(r, 'RecordNumber') ?? i}`,
      stationId: String(get(r, 'RTS')),
      rawTargetName: String(get(r, 'Target')),
      epoch: (get(r, 'Timestamp') instanceof Date
        ? get(r, 'Timestamp') : new Date(get(r, 'Timestamp'))).toISOString(),
      recordNumber: Number(get(r, 'RecordNumber') ?? i),
      hzDeg: Number(get(r, 'Hz')),
      vzDeg: Number(get(r, 'Vz')),
      sdM: Number(get(r, 'Sd')),
    }))
    .sort((a, b) => a.recordNumber - b.recordNumber || a.id.localeCompare(b.id));
  return { rows, skippedCount: rawRows.length - rows.length };
}

export function normalizeLookup(lookupRows) {
  return lookupRows
    .filter((r) => get(r, 'TargetName'))
    .map((r) => ({
      RTS: String(get(r, 'RTS')),
      TargetName: String(get(r, 'TargetName')),
      AdjustmentName: String(get(r, 'AdjustmentName') ?? get(r, 'TargetName')),
      OutputName: String(get(r, 'OutputName') ?? get(r, 'TargetName')),
      TargetHeight: Number(get(r, 'TargetHeight') ?? 0),
      PrismConstant: Number(get(r, 'PrismConstant') ?? 0),
      PrismType: cleanType(get(r, 'PrismType')),
      PrismGrade: cleanType(get(r, 'PrismGrade')),
      AdjustmentEnabled: toBool(get(r, 'AdjustmentEnabled')),
      GraphEnabled: toBool(get(r, 'GraphEnabled')),
    }))
    .sort((a, b) => a.RTS.localeCompare(b.RTS) || a.TargetName.localeCompare(b.TargetName));
}

export function normalizeHeader(headerRows) {
  return headerRows
    .filter((r) => get(r, 'Point ID'))
    .map((r) => ({
      UsedFromCycle: parseCycle(get(r, 'Used from cycle')),
      Code: 'C',
      PointId: String(get(r, 'Point ID')),
      Easting: Number(get(r, 'Easting')),
      Northing: Number(get(r, 'Northing')),
      Height: Number(get(r, 'Height')),
      StDevE: parseConstraint(get(r, 'StDev (E)')),
      StDevN: parseConstraint(get(r, 'StDev (N)')),
      StDevH: parseConstraint(get(r, 'StDev (H)')),
    }))
    .sort((a, b) => a.PointId.localeCompare(b.PointId));
}

/** References are Header points that are also observed Lookup targets. */
export function computeReferences(header, lookup) {
  const targetNames = new Set(lookup.map((l) => l.TargetName));
  return header.map((h) => h.PointId).filter((p) => targetNames.has(p));
}

export const CONTROL_CHECKS = [
  { raw: 78.41, c: 0.0089, expected: 78.4189 },
  { raw: 193.582, c: 0.03, expected: 193.612 },
  { raw: 4.2138, c: 0.0089, expected: 4.2227 },
];

export function runControlChecks() {
  return CONTROL_CHECKS.map(({ raw, c, expected }) => {
    const got = Math.round((raw + c) * 1e4) / 1e4;
    return { raw, c, expected, got, pass: Math.abs(got - expected) < 5e-5 };
  });
}
