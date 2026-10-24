import type {
  AdjustOptions,
  AdjustResult,
  AdjustedPointResult,
  EngineConstraint,
  EngineObservation,
  EnginePoint,
  ResidualEntry,
} from '@/domain/math/adjust';
import type { PreviewSolver } from '@/domain/engine/demo-engine-core';

/**
 * Browser adapter of the Rust engine (`packages/rust/topographic-adjustment`). The `.wasm` is the
 * same code as the AWS Lambda, called with the same `btm.topographic-adjustment.v1` event; this
 * file only translates the TypeScript solver contract to that event and back.
 */
export const RUST_ENGINE_LABEL = 'Fast engine (Rust port of the Python model) — not a certified STAR*NET result';
export const RUST_ENGINE_URL = '/engines/btm_topographic_adjustment.wasm';

interface RustExports {
  memory: WebAssembly.Memory;
  alloc(len: number): number;
  dealloc(ptr: number, len: number): void;
  handle_json(ptr: number, len: number): bigint;
  source_hash(): bigint;
}

let exports: RustExports | undefined;

export async function loadRustEngine(source: string | BufferSource = RUST_ENGINE_URL): Promise<void> {
  if (exports) return;
  const bytes = typeof source === 'string' ? await (await fetch(source)).arrayBuffer() : source;
  const { instance } = await WebAssembly.instantiate(bytes);
  exports = instance.exports as unknown as RustExports;
}

/** FNV-1a hash of the crate sources embedded at build time: a stale `.wasm` is detectable. */
export function rustEngineSourceHash(): bigint {
  return BigInt.asUintN(64, requireEngine().source_hash()); // wasm i64 arrives signed
}

function requireEngine(): RustExports {
  if (!exports) throw new Error('Rust engine is not loaded');
  return exports;
}

/** Sends one Lambda event to the WASM module and returns the parsed response. */
export function invokeRustEngine(event: unknown): Record<string, unknown> {
  const engine = requireEngine();
  const request = new TextEncoder().encode(JSON.stringify(event));
  const ptr = engine.alloc(request.length);
  new Uint8Array(engine.memory.buffer, ptr, request.length).set(request);
  const packed = BigInt.asUintN(64, engine.handle_json(ptr, request.length));
  const outPtr = Number(packed >> 32n);
  const outLen = Number(packed & 0xffffffffn);
  const text = new TextDecoder().decode(new Uint8Array(engine.memory.buffer, outPtr, outLen));
  engine.dealloc(outPtr, outLen);
  return JSON.parse(text) as Record<string, unknown>;
}

type Row = Record<string, unknown>;
/** The Rust side writes NaN as JSON null; the TypeScript contract keeps NaN. */
const num = (value: unknown) => (typeof value === 'number' ? value : NaN);

function residualOf(row: Row): ResidualEntry {
  return {
    obsId: String(row.id),
    rawObservationId: String(row.raw_observation_id),
    stationId: String(row.station_id),
    targetId: String(row.target_id),
    kind: row.kind as ResidualEntry['kind'],
    residual: num(row.residual),
    sigma: num(row.sigma),
    stdResidual: num(row.standardized_residual),
    normalizedResidual: num(row.normalized_residual),
    redundancy: num(row.redundancy),
  };
}

function pointOf(row: Row): AdjustedPointResult {
  return {
    id: String(row.id),
    role: row.role as AdjustedPointResult['role'],
    e: num(row.e), n: num(row.n), h: num(row.h),
    sigmaE: num(row.sigma_e), sigmaN: num(row.sigma_n), sigmaH: num(row.sigma_h),
    covEN: num(row.cov_en),
    ellipseSemiMajorM: num(row.ellipse_semi_major_m),
    ellipseSemiMinorM: num(row.ellipse_semi_minor_m),
    ellipseOrientationDeg: num(row.ellipse_orientation_deg),
    nObservations: num(row.observation_count),
  };
}

function rustAdjustNetwork(
  observations: EngineObservation[],
  points: EnginePoint[],
  constraints: EngineConstraint[],
  opts: AdjustOptions,
): AdjustResult {
  if (opts.geometricConstraints?.length) throw new Error('Geometric constraints are not supported by the Rust engine');
  const response = invokeRustEngine({
    contract_version: 'btm.topographic-adjustment.v1',
    operation: 'adjust',
    payload: {
      points: points.map((p) => ({ id: p.id, e: p.e, n: p.n, h: p.h, free: p.free, role: p.role })),
      observations: observations.map((o) => ({
        id: o.id, raw_observation_id: o.rawObservationId, station_id: o.stationId, target_id: o.targetId,
        kind: o.kind, value: o.value, sigma: o.sigma,
        instrument_height_m: o.instrumentHeightM, target_height_m: o.targetHeightM,
      })),
      constraints: constraints.map((c) => ({ point_id: c.pointId, component: c.component, value: c.value, sigma: c.sigma })),
      options: {
        convergence_threshold_m: opts.convergenceThresholdM,
        max_iterations: opts.maxIterations,
        chi_square_significance: opts.chiSquareSignificance,
        confidence_level: opts.confidenceLevel,
        error_propagation: opts.errorPropagation,
        fixed_orientations_rad: Object.fromEntries(opts.fixedOrientations ?? []),
      },
    },
  });
  if (response.statusCode !== 200) {
    throw new Error(String((response.error as Row | undefined)?.message ?? 'Rust engine failed'));
  }
  const r = response.result as Row;
  const residuals = ((r.residuals as Row[] | undefined) ?? []).map(residualOf);
  return {
    ok: r.ok === true,
    failureReason: (r.failure_reason as string | undefined)
      ?? (r.converged === false ? `Adjustment did not converge within ${opts.maxIterations} iterations` : undefined),
    converged: r.converged === true,
    iterations: num(r.iterations ?? 0),
    nObservations: num(r.observation_count),
    nConstraints: num(r.constraint_count),
    nUnknowns: num(r.unknown_count),
    rank: num(r.rank),
    rankDeficiency: num(r.rank_deficiency),
    deficientUnknowns: (r.deficient_unknowns as string[] | undefined) ?? [],
    degreesOfFreedom: num(r.degrees_of_freedom),
    weightedSSR: num(r.weighted_ssr),
    varianceFactor: num(r.variance_factor),
    totalErrorFactor: num(r.total_error_factor),
    errorFactorByType: (r.error_factor_by_type as AdjustResult['errorFactorByType'] | undefined) ?? {},
    chiSquareLower: num(r.chi_square_lower),
    chiSquareUpper: num(r.chi_square_upper),
    chiSquarePassed: r.chi_square_status === 'passed',
    points: ((r.points as Row[] | undefined) ?? []).map(pointOf),
    orientations: ((r.orientations as Row[] | undefined) ?? []).map((o) => ({
      stationId: String(o.station_id), valueRad: num(o.value_rad), sigmaRad: num(o.sigma_rad), fixed: o.fixed === true,
    })),
    residuals,
    maxStdResidual: num(r.max_standardized_residual ?? 0),
    maxStdResidualObs: residuals.find((entry) => entry.obsId === r.max_standardized_residual_id),
  };
}

export const RUST_SOLVER: PreviewSolver = { label: RUST_ENGINE_LABEL, solve: rustAdjustNetwork };

/** Engines that run inside the mock-up's demo backend; `starnet` goes through the Windows service. */
export type InBrowserEngine = 'preview' | 'rust';

export function solverFor(engine: InBrowserEngine | undefined): PreviewSolver | undefined {
  return engine === 'rust' ? RUST_SOLVER : undefined;
}
