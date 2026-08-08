# Python scientific core and BTM handoff

## Outcome

The repository now separates three responsibilities that must not be confused:

1. `packages/python/topographic-adjustment-core` is the canonical, deterministic calculation
   package for corrections, station-cycle synchronisation, initial coordinates, 3D weighted
   least squares and Analysis Lab data snooping.
2. `packages/lambdas/topographic-adjustment` is a thin stateless AWS Lambda boundary prepared
   for BTM. It has no database, file-storage or STAR*NET responsibility.
3. `src/domain` contains the small browser-compatible mirror needed by the static Vercel mock-up.
   Golden-vector tests protect its numerical parity with Python.

Certified final production adjustment remains STAR*NET Ultimate on the licensed Windows server.
Python and TypeScript results must always be labelled as preview/analysis results.

## BTM integration sequence

The future Fastify API should:

1. resolve the processing and the configuration version valid for the requested output slot;
2. load explicit station, prism sensor and Hz/Vz/Sd/T/P mappings from PostgreSQL/TimescaleDB;
3. load `raw_data` and build a versioned, immutable request snapshot;
4. invoke the Python Lambda for validation, cycle selection, distance corrections and optional
   initialisation/Analysis Lab work;
5. for production adjustment, generate `.dat` and `.prj` in an isolated run folder and submit it
   to the Windows STAR*NET worker;
6. parse native STAR*NET outputs, validate rank/convergence/χ² and map engine point names through
   the versioned physical-point mapping;
7. UPSERT stable output variables at `(variable_id, output_timestamp)` and record only run
   diagnostics/provenance in run history;
8. delete the temporary folder after the transaction succeeds. No generated file is a source of truth.

## Lambda contract

The adapter accepts `contract_version = btm.topographic-adjustment.v1` and one operation:

- `correct-distance`;
- `synchronise`;
- `initialise`;
- `prepare-sights`;
- `adjust`;
- `auto-adjust`.

BTM ids and persistence are intentionally absent. The API supplies already-resolved business
identities, and the response is deterministic for the same request. A `request_id` is echoed for
tracing. Input problems return `422`; unexpected engine faults return a non-sensitive `500`.

## Scientific conventions

### Geometry

- coordinates are E/N/H metres;
- azimuth is measured clockwise from North: `atan2(ΔE, ΔN)`;
- Hz and Vz are radians at the Python boundary;
- Vz is a zenith angle;
- face-II pairs are normalised like STAR*NET `.NORMALIZE ON`;
- target and instrument heights are applied to the line of sight.

### Slope-distance corrections

The order is fixed and traced:

```text
prismDelta = requiredConstant - alreadyAppliedConstant
Sd_after_reflector = stored_Sd + prismDelta
Sd_final = Sd_after_reflector * (1 + atmosphericPpm * 1e-6)
```

Reflectorless always has zero prism delta. Prism/sheet constants must be resolved explicitly;
missing constants are blocking rather than silently treated as zero. Atmospheric modes are:
already applied, station-cycle T/P, fixed T/P, or none. Missing/invalid T/P behaviour is a
separate policy. The displayed `standard-dry-air-ppm-v1` equation is versioned and is not claimed
to be a manufacturer-specific model. STAR*NET `.SCALE` remains a separate datum/grid factor.

### Epoch synchronisation

Targets are first grouped into acquisition cycles per station. One whole cycle is selected for
each station/output slot, then one observation per target is retained inside it. This prevents a
synthetic station epoch made from targets belonging to different cycles. Results state `fresh`,
`reused` or `missing`, retain original source timestamps and report target availability.

### Initial coordinates

The selected window is data provenance, not coordinate validity. A representative observation is
the circular median Hz plus median Vz and corrected Sd for each station × physical point.

- local mode fixes one station E/N/H/orientation; `0/0/0/0` is valid;
- known-reference mode uses coordinates genuinely supplied by BTM or an explicit import;
- a connected network propagates through human-confirmed physical points;
- station resection jointly fits directions, zeniths and distances, avoiding the mirror ambiguity
  of distance-only circle intersections;
- two common points can solve the four station unknowns but have weak redundancy; three
  well-spread points are recommended;
- names never prove physical identity.

Coverage, missing station-target pairs, station solution diagnostics and inter-station coordinate
spread are returned for user review before initial coordinates are accepted.

### Weighted least squares

The Python implementation uses a scaled trust-region Gauss-Newton solve with analytic Jacobian,
SVD rank diagnostics and the weighted design matrix for covariance. It adjusts free E/N/H and
one horizontal orientation per non-anchored station.

The preview model is explicit straight-line local geometry. Datum/grid scale, curved-earth
reduction and refraction are passed to the generated STAR*NET configuration and remain certified
STAR*NET responsibilities; the preview never claims to have applied them.

The χ² test is two-sided and only applicable when degrees of freedom are positive. Covariance is
never reduced below a-priori covariance because residuals are unusually small. On an upper-tail
failure it may be inflated by `max(1, varianceFactor)` when error propagation is enabled.

Two residual measures are deliberately distinct:

- STAR*NET standardized residual: `|v| / σ` (used by Auto Adjust);
- data-snooping normalized residual: `|v| / (σ * sqrt(redundancy))`.

Auto Adjust excludes a scalar Hz, Vz or Sd observation from a trial. It does not automatically
discard the other two components of the same raw sight and never mutates `raw_data`.

### Centering and precision

STAR*NET's default EDM model adds distance constant and ppm precision. Root-sum-square is used
only by the explicit `propagated` option / `.EDM PROPAGATE`. Instrument, target and vertical
centering are propagated into Hz/Vz/Sd using the formulas documented by STAR*NET. Zero
measurement sigma, 100% confidence/significance, duplicate ids and inconsistent
target↔physical-point mappings are rejected at the contract boundary.

## Development commands

```bash
npm ci
npm run typecheck
npm run lint
npm run test
npm run test:python
npm run build
npm run test:e2e
```

To build the future Lambda image, use the repository root as context:

```bash
docker build -f packages/lambdas/topographic-adjustment/Dockerfile .
```

## Safe extension rules

- Keep NumPy/SciPy and AWS dependencies out of the Vite browser bundle.
- Add a Python test and a browser parity vector for every new mathematical convention.
- Do not add a second output variable when a processing configuration version changes.
- Never infer variable roles from names; persist explicit BTM variable ids.
- Never infer shared physical points from matching MPO/target names.
- Do not execute STAR*NET beyond the confirmed licensed-seat count; use the Windows service's
  bounded queue, execution slots and mutexes.
- Do not persist generated STAR*NET files as configuration or historical truth.
