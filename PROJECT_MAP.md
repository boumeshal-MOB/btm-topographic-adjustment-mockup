# BTM Topographic Adjustment — Project Map

## 1. Purpose

Build a modern, testable GitHub-hosted mock-up of the BTM `Topographic Adjustment` processing.
The owner reviews and merges Pull Requests, then deploys `main` to Vercel. The reusable domain and
frontend will later be integrated into the real BTM monorepo.

## 2. Current status

> **Consolidation (owner decision, 2026-07):** the whole mock-up scope previously split across
> PR-01…PR-06 is delivered in the single branch `feat/pr01-functional-uk-flow` and the single
> Draft PR #4. The former PR boundaries below remain valid as a functional checklist and logical
> execution order only — they must not spawn new branches or PRs.

| Area | Status | Delivered in |
|---|---|---|
| Product specification | Approved baseline | keep aligned with confirmed decisions |
| GitHub repository | Active | PR #4 (Draft) |
| Functional application (UK single-station) | Implemented — wizard, run, outputs, E2E | PR #4 |
| Network workflow (shared points, geometry check, connectivity) | Implemented | PR #4 |
| FR/mixed measurements (no double correction, D-05 weight gate) | Implemented | PR #4 |
| Timing/catch-up/output (slots, reuse, UPSERT, RUN-008 bound) | Implemented | PR #4 |
| Administration/Analysis (versions, reprocessing, Analysis Lab) | Implemented | PR #4 |
| STAR*NET preview/final QA (.dat/.snproj golden tests, E2E) | Implemented | PR #4 |
| Real BTM integration | Out of mock-up scope | developer handoff after mock-up validation |

Update this table only when a milestone is merged or a product decision changes.

## 3. Non-negotiable product decisions

- New BTM processing type: `Topographic Adjustment`; never reuse `Theodolite`.
- One processing represents one station or one connected network.
- Independent station groups require separate processings.
- Production engine: STAR*NET Ultimate only, on a dedicated Windows service.
- Mock-up engine: clearly labelled demo least-squares adapter in a Web Worker.
- Production inputs come from explicitly mapped BTM variables in `raw_data`.
- No raw-observation upload in the product workflow.
- Vercel uses prebuilt demo fixtures; ATS34 is a UK single-station dataset.
- Configurations are versioned and used versions are immutable.
- Output variables belong to the processing and remain stable across config versions.
- Recalculation UPSERTs the same `(variable_id, timestamp)`.
- STAR*NET files are generated per run, parsed, then deleted after successful ingestion.
- No Lambda, S3 or CoMeT for this processing.
- No `standard/expert` role: compact views plus Advanced options for everybody.
- Never apply a distance correction twice.
- Never infer shared physical identity from a target name alone.

## 4. Source authority

1. Confirmed decisions and this Project Map.
2. `docs/topographic-adjustment/domain/20-REGLES-METIER.md`.
3. Native STAR*NET documentation and supplied native files.
4. BTM architecture and accepted ADRs.
5. Machine-readable presets and demo fixture facts.
6. Legacy behaviour.
7. Previous prototype behaviour.

If a Graphify edge or implementation contradicts a higher source, the higher source wins.

## 5. Required technology boundary

### Mock-up

- TypeScript strict;
- React/Vite shell;
- reusable feature compatible with BTM React 17 runtime;
- Material UI 5;
- React Router v6;
- TanStack Query v5;
- react-hook-form + Zod;
- react-i18next;
- MSW;
- Vitest and Playwright.

### Future BTM production

- Fastify TypeScript/Zod API;
- PostgreSQL/TimescaleDB;
- dedicated Windows STAR*NET service;
- stable variables and `measures` UPSERT.

Do not introduce production dependencies into the Vercel mock-up.

## 6. Planned module map

| Concern | Recommended location | Detailed source |
|---|---|---|
| App shell/routes | `src/app/` | `front/10` |
| Creation wizard | `src/features/create/` | `front/11`, `front/12`, `front/13` |
| Administration | `src/features/administration/` | `front/14` |
| Analysis Lab | `src/features/analysis/` | `front/14` |
| Domain types/rules | `src/domain/` | `domain/20`, `domain/21` |
| Time/slots | `src/domain/time/` | rules TIME/RUN |
| Corrections | `src/domain/corrections/` | rules CORR/ATMO, `domain/23` |
| Initialisation | `src/domain/initialisation/` | rules INIT, `front/12` |
| Physical identity | `src/domain/point-identity/` | rules POINT/NAME, `front/12` |
| STAR*NET preview | `src/domain/starnet/` | `domain/23` |
| Repositories | `src/repositories/` | `domain/21` |
| Demo API/fixtures | `src/demo/` | `demo/40` |
| Demo calculation worker | `src/workers/` | implementation reuse strategy |
| Presets | `src/configs/` | `configs/*.json`, `domain/22` |
| Shared test factories/MSW | `src/test/` | BTM ADR-0010 |
| E2E | `e2e/` | acceptance checklist |

The AI may refine locations, but domain/UI/adapters must stay separated.

## 7. Creation workflow

1. General
2. Stations
3. Instruments
4. Targets & Measurements
5. Initialisation
6. Adjustment
7. Run
8. Output
9. Review & Create

Project is implicit. Draft data survives back/forward navigation.

## 8. Main run flow

```text
resolve output slot
→ resolve config version valid at slot
→ select fresh/reused/missing station epochs
→ resolve station-target measurement setups
→ apply prism and atmospheric corrections once
→ build immutable run snapshot
→ generate STAR*NET input
→ execute/parse adjustment adapter
→ validate rank/convergence/chi-square/mapping
→ map physical points back to BTM target outputs
→ UPSERT stable output variables at output slot
```

The Vercel mock-up simulates this flow. It never executes STAR*NET.

## 9. Time model

Never confuse:

- observation epoch: raw source timestamp;
- output slot: publication timestamp such as `:00/:30`;
- initialisation window: observations used to compute approximate coordinates;
- configuration validity: `[validFrom, validTo[`.

Example: station observations at `:25`, `:26`, `:32` can publish the `:30` slot when the configured
tolerance permits it. Source timestamps remain unchanged.

## 10. Measurement model

- Instrument model/height belong to the station configuration.
- EDM, measurement type, reflector, constants, target height and weights resolve per observation or
  `station × target`.
- Supported families: Prism, Reflective sheet, Reflectorless.
- `prismDelta = requiredConstant - alreadyAppliedConstant`.
- `.SCALE` is not the atmospheric correction.
- STAR*NET refraction is separate from EDM T/P correction.

## 11. Physical point model

- Every BTM target is distinct by default.
- Shared points are versioned and human-confirmed.
- One point cannot resolve unknown relative orientation.
- Two separated seeds are the practical minimum and yield weak geometry.
- Three well-distributed seeds are recommended.
- Geometry can propose candidates but never confirm automatically.
- H/V/3D residuals are displayed in millimetres.
- A baseline/vector relates distinct points; it never merges them.

## 12. Initialisation model

Default for a new processing: local anchor station with E/N/H/orientation; `0/0/0/0` is valid.
Known references are optional and must come from real BTM data or explicit coordinate CSV input.

Use medians of Hz/Vz/corrected Sd over the selected window. Display point/pair coverage, missing
targets, retained time range and multi-station dispersion. The window is provenance, not validity.

## 13. Presets

### UK

- supplied HS2/NTE project;
- Leica TM50 I;
- DMS;
- raw Sd with field prism constant 0 mm;
- deltas 0 / +8.9 / +26.5 / +30.0 mm;
- STAR*NET parameters from the supplied `.snproj`.

### France

- Topcon MS05AXII proposed;
- Gons;
- distances and atmosphere considered already corrected by default;
- MPO FR required/applied +25.5 mm, therefore BTM delta 0;
- final project weights/centring require surveyor validation.

## 14. Stable outputs

Per published target: Adjusted X/Y/Z, Delta X/Y/Z, Sigma X/Y/Z.

Processing-wide: Chi2 Passed, Variance Factor, References Available, Target Availability and selected
numeric status flags.

No output variable is recreated when a config version changes.

## 15. Pull Request roadmap

> **Consolidated into PR #4** (owner decision): PR-01…PR-06 below are now a functional
> checklist executed in order inside `feat/pr01-functional-uk-flow`, not separate PRs.

### PR-01 — mandatory functional vertical slice

Branch: `feat/pr01-functional-uk-flow`.

Must deliver a complete UK single-station journey using ATS34: all nine wizard steps, local
initialisation with medians/coverage, demo adjustment test, Run/Output/Review, persisted demo
processing, minimal Administration, unit/E2E tests and Vercel build. No dead buttons.

Detailed sources:

- `docs/topographic-adjustment/front/10-DESIGN-SYSTEM-ET-NAVIGATION.md`;
- `front/11`, the single-station parts of `front/12`, and `front/13`;
- rules PROC, DATA, TIME, MEAS, CORR, ATMO, INIT, ADJ, RUN and OUT;
- `domain/21`, `domain/22`, `demo/40`;
- P0 acceptance criteria applicable to single-station UK.

### Later PRs

- PR-02: network and physical points;
- PR-03: full FR/UK and mixed measurement setups;
- PR-04: synchronization, reuse, catch-up and stable output publication;
- PR-05: versions, complete administration, Analysis Lab and reprocessing;
- PR-06: STAR*NET preview/golden tests, accessibility, performance and final handoff.

Claude may refine later PR boundaries, but cannot downgrade PR-01 to a scaffold.

## 16. Git authority

Claude may autonomously create branches, commit, push, open/update PRs and fix CI on its branches.
Claude may not push to `main`, merge, deploy, or manage secrets. The repository owner merges and
deploys. Stacked PRs must state their base branch and merge order.

## 17. Context navigation

Before code exploration:

1. read this file;
2. run a scoped Graphify query;
3. open only returned code and the detailed sources named here;
4. verify `INFERRED` edges against source;
5. update this map only for architecture/contract/status changes.

## 18. Open production decisions

- exact STAR*NET Ultimate automation interface/version on Windows;
- license concurrency/lock model;
- native output options available in the installed edition;
- production-approved atmospheric formula/ranges;
- FR production weights and centring;
- final SQL normalization/JSONB choice;
- run/Analysis diagnostic retention;
- final BTM metrics/unit catalogue mapping.

These do not block the mock-up and must not be filled with invented values.
