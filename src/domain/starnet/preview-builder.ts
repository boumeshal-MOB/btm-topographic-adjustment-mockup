import type { ConstraintMode, StarNetAdjustmentConfig } from '@/domain/entities';
import { effectiveTotalStationSigmas } from '@/domain/math/weights';
import { isValidEngineName } from '@/domain/point-identity/engine-names';
import { serialiseStarNetLines } from '@/domain/starnet/native-text';
import nativeUkProjectTemplate from '@/domain/starnet/uk-native-template.prj?raw';

/**
 * STAR*NET `.dat`/`.prj` PREVIEW builder (`docs/topographic-adjustment/DOMAIN-ARCHITECTURE-AND-RULES.md`).
 * Pure, in-memory, deterministic and filesystem-free. The same generated payload is shown as a
 * preview and can be submitted to the Windows pilot, which materialises it in an isolated
 * workspace before running STAR*NET (VER-005..007).
 *
 * Canonical choices (DOMAIN-ARCHITECTURE-AND-RULES.md §6–8):
 * - slope distances are written ALREADY corrected (prism delta + atmospheric ppm applied by the
 *   corrections module); `.PRISM` is NOT emitted, avoiding any double treatment (CORR-005);
 * - `.SCALE` comes exclusively from the datum `scaleFactor` of the adjustment config and is
 *   never derived from T/P (CORR-007);
 * - point/station names are engine names validated by NAME-004/005; an invalid name aborts the
 *   preview rather than silently emitting a bad file.
 */

export interface DatPoint {
  engineName: string;
  eastingM: number;
  northingM: number;
  heightM: number;
  modeE: ConstraintMode;
  modeN: ConstraintMode;
  modeH: ConstraintMode;
  sigmaEM?: number;
  sigmaNM?: number;
  sigmaHM?: number;
}

export interface DatObservationRow {
  targetEngineName: string;
  hzDeg: number;
  /** FINAL corrected slope distance (output of applyDistanceCorrections). */
  finalSlopeDistanceM: number;
  vzDeg: number;
  targetHeightM: number;
  sigmaHzArcSec?: number;
  sigmaVzArcSec?: number;
  sigmaSdMm?: number;
  sigmaSdPpm?: number;
}

export interface DatStationBlock {
  stationEngineName: string;
  instrumentHeightM: number;
  /**
   * Fixed local-datum orientation, clockwise from North. When present the builder creates one
   * synthetic fixed backsight and a fixed DN reading; this is equivalent to fixing the station
   * orientation without pretending the auxiliary point is a BTM target.
   */
  fixedOrientationDeg?: number;
  rows: DatObservationRow[];
}

export interface StarNetPreviewInput {
  adjustment: StarNetAdjustmentConfig;
  points: DatPoint[];
  blocks: DatStationBlock[];
  /** Comment header lines (job name, slot, provenance). Never data. */
  comments?: string[];
}

export class StarNetPreviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StarNetPreviewError';
  }
}

function num(value: number, decimals: number): string {
  if (!Number.isFinite(value)) throw new StarNetPreviewError('STAR*NET numeric values must be finite');
  return value.toFixed(decimals);
}

function safeComment(value: string, maxLength = 100): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/[\r\n#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** Decimal degrees -> STAR*NET DMS angle string `dd-mm-ss.ss`. */
export function formatDms(deg: number): string {
  const sign = deg < 0 ? '-' : '';
  let abs = Math.abs(deg);
  let d = Math.floor(abs);
  let m = Math.floor((abs - d) * 60);
  let s = ((abs - d) * 60 - m) * 60;
  // carry rounding (e.g. 59.995s -> next minute)
  if (Number(s.toFixed(2)) >= 60) {
    s = 0;
    m += 1;
  }
  if (m >= 60) {
    m = 0;
    d += 1;
  }
  return `${sign}${d}-${String(m).padStart(2, '0')}-${s.toFixed(2).padStart(5, '0')}`;
}

/** Decimal degrees -> gons (grads), 5 decimals. */
export function formatGons(deg: number): string {
  return num((deg * 400) / 360, 5);
}

function formatAngle(deg: number, units: StarNetAdjustmentConfig['angleOutputUnits']): string {
  return units === 'DMS' ? formatDms(deg) : formatGons(deg);
}

/**
 * Domain angular sigmas are always arcseconds. STAR*NET expects arcseconds with DMS input but
 * milligons with GONS input (1 mgon = 3.24 arcseconds).
 */
export function nativeAngularSigma(
  arcSeconds: number,
  units: StarNetAdjustmentConfig['angleOutputUnits'],
): number {
  if (!Number.isFinite(arcSeconds) || arcSeconds < 0) {
    throw new StarNetPreviewError('Angular standard error must be a finite non-negative value');
  }
  return units === 'DMS' ? arcSeconds : arcSeconds / 3.24;
}

function constraintToken(mode: ConstraintMode, sigmaM: number | undefined, pointName: string, component: string): string {
  switch (mode) {
    case 'fixed':
      return '!';
    case 'free':
      return '*';
    case 'weak': {
      if (sigmaM === undefined || !(sigmaM > 0)) {
        throw new StarNetPreviewError(`Point ${pointName}: weak ${component} constraint requires a positive sigma`);
      }
      return num(sigmaM, 4);
    }
  }
}

function assertEngineName(name: string, what: string): void {
  if (!isValidEngineName(name)) {
    throw new StarNetPreviewError(`${what} "${name}" is not a valid STAR*NET engine name (NAME-004/005)`);
  }
}

/** Builds the `.dat` preview text (DOMAIN-ARCHITECTURE-AND-RULES.md §3–6). */
export function buildDatPreview(input: StarNetPreviewInput): string {
  const { adjustment, points, blocks } = input;
  const lines: string[] = [];
  for (const comment of input.comments ?? []) lines.push(`# ${safeComment(comment)}`);
  lines.push('# Generated by BTM Topographic Adjustment');
  lines.push(`# Units: Meters, angles ${adjustment.angleOutputUnits}, order ${adjustment.coordinateOrder}, 3D ${adjustment.input3dMode}`);

  // STAR*NET defaults to ADDITIVE; write the decision explicitly so a project is reproducible.
  lines.push(`.EDM ${adjustment.edmStdErrorModel === 'propagated' ? 'PROPAGATE' : 'ADDITIVE'}`);

  // .SCALE strictly from the datum configuration (CORR-007) — omitted at the neutral value.
  if (adjustment.scaleFactor !== 1) {
    lines.push(`.SCALE ${num(adjustment.scaleFactor, 8)}`);
  }

  const seen = new Set<string>();
  const pointByName = new Map(points.map((point) => [point.engineName, point]));
  for (const point of points) {
    assertEngineName(point.engineName, 'Point');
    if (seen.has(point.engineName)) {
      throw new StarNetPreviewError(`Duplicate engine name "${point.engineName}" in C records (NAME-006/POINT-015)`);
    }
    seen.add(point.engineName);
    const first = adjustment.coordinateOrder === 'EN' ? point.eastingM : point.northingM;
    const second = adjustment.coordinateOrder === 'EN' ? point.northingM : point.eastingM;
    const firstMode = adjustment.coordinateOrder === 'EN' ? point.modeE : point.modeN;
    const secondMode = adjustment.coordinateOrder === 'EN' ? point.modeN : point.modeE;
    const firstSigma = adjustment.coordinateOrder === 'EN' ? point.sigmaEM : point.sigmaNM;
    const secondSigma = adjustment.coordinateOrder === 'EN' ? point.sigmaNM : point.sigmaEM;
    const firstComponent = adjustment.coordinateOrder === 'EN' ? 'E' : 'N';
    const secondComponent = adjustment.coordinateOrder === 'EN' ? 'N' : 'E';
    const tokens = [
      'C',
      point.engineName,
      num(first, 4),
      num(second, 4),
      num(point.heightM, 4),
      constraintToken(firstMode, firstSigma, point.engineName, firstComponent),
      constraintToken(secondMode, secondSigma, point.engineName, secondComponent),
      constraintToken(point.modeH, point.sigmaHM, point.engineName, 'H'),
    ];
    lines.push(tokens.join('  '));
  }

  const fixedOrientationBacksights = new Map<string, { name: string; orientationDeg: number }>();
  for (const [blockIndex, block] of blocks.entries()) {
    if (block.fixedOrientationDeg === undefined) continue;
    if (!Number.isFinite(block.fixedOrientationDeg)) {
      throw new StarNetPreviewError(`Station ${block.stationEngineName}: fixed orientation must be finite`);
    }
    const existing = fixedOrientationBacksights.get(block.stationEngineName);
    if (existing) {
      if (Math.abs(existing.orientationDeg - block.fixedOrientationDeg) > 1e-10) {
        throw new StarNetPreviewError(`Station ${block.stationEngineName}: conflicting fixed orientations in direction sets`);
      }
      continue;
    }
    const station = pointByName.get(block.stationEngineName);
    if (!station) {
      throw new StarNetPreviewError(`Fixed orientation station "${block.stationEngineName}" has no coordinate record`);
    }
    let suffix = blockIndex + 1;
    let backsightName = `BTMORI${String(suffix).padStart(3, '0')}`;
    while (seen.has(backsightName)) {
      suffix += 1;
      backsightName = `BTMORI${String(suffix).padStart(3, '0')}`;
    }
    seen.add(backsightName);
    fixedOrientationBacksights.set(block.stationEngineName, { name: backsightName, orientationDeg: block.fixedOrientationDeg });
    const orientationRad = (block.fixedOrientationDeg * Math.PI) / 180;
    const eastingM = station.eastingM + 1000 * Math.sin(orientationRad);
    const northingM = station.northingM + 1000 * Math.cos(orientationRad);
    const first = adjustment.coordinateOrder === 'EN' ? eastingM : northingM;
    const second = adjustment.coordinateOrder === 'EN' ? northingM : eastingM;
    lines.push(
      ['C', backsightName, num(first, 4), num(second, 4), num(station.heightM, 4), '!', '!', '!'].join('  '),
    );
  }

  for (const block of blocks) {
    assertEngineName(block.stationEngineName, 'Station');
    if (!Number.isFinite(block.instrumentHeightM)) {
      throw new StarNetPreviewError(`Station ${block.stationEngineName}: instrument height must be finite`);
    }
    const fixedBacksight = fixedOrientationBacksights.get(block.stationEngineName)?.name;
    if (block.rows.length + (fixedBacksight ? 1 : 0) < 2) {
      throw new StarNetPreviewError(
        `Station ${block.stationEngineName}: a STAR*NET direction set requires at least two directions`,
      );
    }
    lines.push('');
    lines.push(`DB  ${block.stationEngineName}`);
    if (fixedBacksight) {
      lines.push(['DN', fixedBacksight, formatAngle(0, adjustment.angleOutputUnits), '!'].join('  '));
    }
    for (const row of block.rows) {
      assertEngineName(row.targetEngineName, 'Target');
      const explicitWeightValues = [row.sigmaHzArcSec, row.sigmaVzArcSec, row.sigmaSdMm, row.sigmaSdPpm];
      const hasAnyExplicitWeight = explicitWeightValues.some((value) => value !== undefined);
      if (hasAnyExplicitWeight && explicitWeightValues.some((value) => value === undefined)) {
        throw new StarNetPreviewError(`Target ${row.targetEngineName}: explicit weighting requires Hz, Vz, distance mm and ppm`);
      }
      if (!(row.finalSlopeDistanceM > 0)) {
        throw new StarNetPreviewError(`Target ${row.targetEngineName}: slope distance must be greater than zero`);
      }
      const standardErrors = hasAnyExplicitWeight
        ? (() => {
            const sigmas = effectiveTotalStationSigmas({
              slopeDistanceM: row.finalSlopeDistanceM,
              zenithRad: row.vzDeg * Math.PI / 180,
              directionArcSec: row.sigmaHzArcSec!,
              zenithArcSec: row.sigmaVzArcSec!,
              distanceMm: row.sigmaSdMm!,
              distancePpm: row.sigmaSdPpm!,
              instrumentCenteringM: adjustment.defaultWeights.instrumentCenteringM,
              targetCenteringM: adjustment.defaultWeights.targetCenteringM,
              verticalCenteringM: adjustment.defaultWeights.verticalCenteringM,
              edmStdErrorModel: adjustment.edmStdErrorModel ?? 'additive',
            });
            // Explicit values are TOTAL errors. STAR*NET therefore uses them verbatim and does
            // not add the project centering terms a second time (`.ADDCENTERING` remains OFF).
            return [
              num(nativeAngularSigma(sigmas.hzArcSec, adjustment.angleOutputUnits), 4),
              num(sigmas.sdM, 6),
              num(nativeAngularSigma(sigmas.vzArcSec, adjustment.angleOutputUnits), 4),
            ];
          })()
        : [];
      // DM  TARGET  HZ  SLOPE_DISTANCE  ZENITH  HI/HT (DOMAIN-ARCHITECTURE-AND-RULES.md §4–5: both heights, never a delta)
      lines.push(
        [
          'DM',
          row.targetEngineName,
          formatAngle(row.hzDeg, adjustment.angleOutputUnits),
          num(row.finalSlopeDistanceM, 4),
          formatAngle(row.vzDeg, adjustment.angleOutputUnits),
          ...standardErrors,
          `${num(block.instrumentHeightM, 4)}/${num(row.targetHeightM, 4)}`,
        ].join('  '),
      );
    }
    lines.push('DE');
  }

  return serialiseStarNetLines(lines);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceNativeProjectValue(lines: string[], key: string, value: string | number): void {
  const matcher = new RegExp(`^(${escapeRegExp(key)}\\s+).*$`);
  const matches = lines.flatMap((line, index) => matcher.test(line) ? [index] : []);
  if (matches.length !== 1) {
    throw new StarNetPreviewError(
      `Native STAR*NET project template must contain exactly one "${key}" option; found ${matches.length}`,
    );
  }
  const index = matches[0];
  lines[index] = lines[index].replace(matcher, `$1${String(value)}`);
}

/**
 * Builds the STAR*NET project from the unmodified native `.prj` supplied with the working UK
 * installation. We deliberately do not recreate or shorten STAR*NET's private option schema:
 * only this allow-list of business values and the data-file entry are replaced. Every other
 * section, key, ordering choice and spacer remains the vendor-produced baseline.
 */
export function buildPrjPreview(
  adjustment: StarNetAdjustmentConfig,
  dataFileName = 'input.dat',
): string {
  if (!/^[A-Za-z0-9_.-]+\.dat$/i.test(dataFileName)) {
    throw new StarNetPreviewError(`Unsafe STAR*NET data filename "${dataFileName}"`);
  }
  const w = adjustment.defaultWeights;
  if (!w) {
    throw new StarNetPreviewError('STAR*NET instrument weights must be resolved before generating a native project');
  }
  const lines = nativeUkProjectTemplate.replace(/\r\n|\r/g, '\n').replace(/\n+$/g, '').split('\n');
  const values: Readonly<Record<string, string | number>> = {
    adjustment_type: adjustment.adjustmentType,
    linear_units: adjustment.linearUnits,
    angle_output_units: adjustment.angleOutputUnits,
    local_or_grid_adjustment: adjustment.localOrGrid === 'local' ? 0 : 1,
    coordinate_order: adjustment.coordinateOrder,
    '3D_input_mode': adjustment.input3dMode,
    index_of_refraction: adjustment.indexOfRefraction.toFixed(10),
    earth_radius_meters: adjustment.earthRadiusM.toFixed(10),
    converge_limit: adjustment.convergeLimit.toFixed(10),
    maximum_iterations: adjustment.maximumIterations,
    chi_sqr_percent_significance: adjustment.chiSquareSignificancePercent.toFixed(4),
    perform_error_propagation: adjustment.performErrorPropagation ? 1 : 0,
    ell_percent_confidence: adjustment.ellipseConfidencePercent.toFixed(4),
    distance_std_err: w.distanceStdErrM.toFixed(10),
    edm_ppm: w.distancePpm.toFixed(10),
    angle_std_err: nativeAngularSigma(w.angleArcSec, adjustment.angleOutputUnits).toFixed(10),
    direction_std_err: nativeAngularSigma(w.directionArcSec, adjustment.angleOutputUnits).toFixed(10),
    azimuth_std_err: nativeAngularSigma(w.azimuthArcSec, adjustment.angleOutputUnits).toFixed(10),
    zenith_std_err: nativeAngularSigma(w.zenithArcSec, adjustment.angleOutputUnits).toFixed(10),
    instrument_centering_error: w.instrumentCenteringM.toFixed(10),
    target_centering_error: w.targetCenteringM.toFixed(10),
    vertical_centering_error: w.verticalCenteringM.toFixed(10),
  };
  for (const [key, value] of Object.entries(values)) replaceNativeProjectValue(lines, key, value);

  const dataSection = lines.indexOf('[DataFileList]');
  const nextSection = lines.findIndex((line, index) => index > dataSection && /^\[[^\]]+\]$/.test(line));
  const dataSectionEnd = nextSection === -1 ? lines.length : nextSection;
  const dataEntries = lines.flatMap((line, index) =>
    index > dataSection && index < dataSectionEnd && /^\s*\d+\s+"[^"]+\.dat"\s*$/i.test(line) ? [index] : [],
  );
  if (dataSection === -1 || dataEntries.length !== 1) {
    throw new StarNetPreviewError('Native STAR*NET project template must contain exactly one DAT file entry');
  }
  lines[dataEntries[0]] = `3 "${dataFileName}"`;
  return serialiseStarNetLines(lines);
}
