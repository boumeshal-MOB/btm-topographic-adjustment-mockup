# IMPLEMENTATION_PLAN — BTM Topographic Adjustment mock-up

Status: **approved** — plan approved by the merge of PR #2 into `main` on 2026-07-14. The
pre-code audit `/AUDIT-AVANT-CODE-BTM-TOPOGRAPHIC-ADJUSTMENT.md` (2026-07-14) has been applied
(items B-01..B-05, H-01..H-06) via branch `fix/plan-audit-corrections`. Executors must not stop
or replan on account of plan status; structural changes still go through the planning model
(see `CLAUDE.md › Model routing`).

> **Consolidation (owner decision, 2026-07):** all mock-up scope previously split across
> PR-01…PR-06 is delivered in the single branch `feat/pr01-functional-uk-flow` and the single
> Draft PR #4. Every reference to "PR-02…PR-06" in this plan now denotes a logical execution
> phase / functional checklist inside PR #4 — never a new branch or PR.

This file is the execution index. It references business rules; it never replaces them.
Authority order: confirmed decisions and `PROJECT_MAP.md` → `docs/topographic-adjustment/domain/20-REGLES-METIER.md`
→ the other sources listed in `PROJECT_MAP.md §4`. If this plan contradicts a higher source,
stop the task, record the blocker in §14 and escalate; do not silently resolve.

## How to execute this plan (executor protocol)

1. Read `PROJECT_MAP.md`, then only the plan slice you are executing and the files it cites.
2. Before the first Graphify graph exists, do not run graph queries; after it exists, run the
   scoped queries in §11 before opening code.
3. Implement one task at a time: smallest complete vertical behaviour, with its tests.
4. Run the task's verification commands. Check the task box in §14 and add commit evidence.
5. Never redesign the architecture in §2–§3. Never invent a value listed in §12.
6. Commands assume npm scripts defined in T01.1: `npm run typecheck`, `npm run lint`,
   `npm run test` (Vitest), `npm run test:e2e` (Playwright), `npm run build`.
7. **Controlled porting rule (audit B-01).** Proven scientific/domain functions, the ATS34
   fixture pipeline and their tests already exist in `boumeshal-MOB/StarNet` at reference
   commit `bd4216d5299ff761512e37a04ed46282c0c811bb` (64/64 tests passing, Vite build green at
   audit time). Port them — do not rewrite them from scratch, and do not copy the old
   application wholesale. Port an algorithm only after identifying its contract, its tests and
   the adaptations required by the §4 contracts. Never copy the old prototype's pages, forms,
   styles, layout, texts or information architecture. The do-not-reuse list of
   `implementation/30-REUTILISATION-DU-PROTOTYPE.md §3/§6` remains binding.
8. Execute PR-01 in bounded sessions (audit §6): fresh context per session, same branch and PR,
   read only the task slice and its cited sources, run targeted tests per task, run the full
   suite at the end of each session and before marking the PR ready — not after every file.

---

## 1. Goal and non-goals

### Goal

A working, modern, testable Vercel mock-up of the BTM `Topographic Adjustment` processing that
validates the complete user workflow (9-step wizard → test one epoch → create → administer →
analyse → reprocess) and maximises code reusable by the future BTM integration
(`PROJECT_MAP.md §1`, `docs/topographic-adjustment/00-PROJET-GLOBAL.md §1–3`).

### Non-goals (never implement in this repository)

- Real STAR*NET execution, Windows service, Lambda, S3, CoMeT, `Theodolite` reuse (PROC-001,
  PROC-006, `PROJECT_MAP.md §3`).
- Raw-observation upload anywhere in the user journey (DATA-006). Excel conversion is a build
  script only (DEMO-001).
- Writing to a real BTM database; MSW + demo repositories simulate the API
  (`00-PROJET-GLOBAL.md §4`).
- Production values for the open decisions in `PROJECT_MAP.md §18` — they stay open (§12 below).
- Merging PRs or deploying to Vercel — owner only.

---

## 2. Confirmed architecture

Non-negotiable boundaries (source: `CLAUDE.md`, `PROJECT_MAP.md §5`,
`docs/topographic-adjustment/01-PROMPT-MAITRE-MAQUETTE.md › Architecture obligatoire`):

```text
feature UI (React 17-compatible, MUI 5)
  → hooks/use-cases (TanStack Query v5, application services)
    → pure domain + Zod schemas (no React, no MSW, no IndexedDB, no fs)
      → abstract repositories/gateways
        → DemoRepository (MSW + in-memory/IndexedDB)
        → future BTM adapters (contract only)

DemoAdjustmentEngine (Web Worker)          — implements AdjustmentEngine
ProductionAdjustmentGateway (contract only) — never implemented here
```

- TypeScript strict; Vite shell with isolated React 18 bootstrap; feature code must not call
  React 18-only runtime APIs (BTM runs React 17 runtime with React 18 types).
- MUI 5, React Router v6, TanStack Query v5, react-hook-form + Zod, react-i18next (namespace
  `topographicAdjustment`), MSW, Vitest, Playwright.
- Forbidden: Tailwind, Redux, Formik, Yup, Axios in the feature.
- No business value hardcoded in components; every parameter comes from typed, Zod-validated
  presets/configs (`configs/README.md`).
- Units explicit in types, labels, table headers and previews.
- No `standard/expert` role: compact view + `AdvancedSection` for everybody.
- Deferred capabilities show a compact descriptive message, never a dead control.

### Design freedom of the new mock-up (audit §4)

Reuse concerns the **scientific domain, data and tests** — not the old prototype's design. The
new mock-up is a new experience, not a visual reproduction.

Free for the executor (propose a short, compact information-architecture note at the start of
the first big UI session, then implement the retained variant — no need for multiple full
variants):

- visual composition and MUI design system; navigation, grouping and presentation of steps;
- cards, drawers, tables, assistants, network views and visualisations;
- reading order, progressive disclosure, helper texts, summaries, empty states, validation
  feedback, desktop/tablet responsive layout, and reducing clicks/default information density.

The nine functional wizard domains must remain traceable, but they are not a pixel-by-pixel
constraint. Steps may be merged or presented differently only if: (1) no capability disappears;
(2) cognitive load decreases; (3) draft persistence, back-navigation and validations stay
reliable; (4) the PR explains the change and provides a requirement → screen matrix; (5) the
complete UK journey stays E2E-testable.

Not free (design freedom never touches): topographic/statistical rules; the
station/instrument/measurement-setup separation; corrections, units and value sources; the
epoch/slot/validity distinction; physical-point identity and human confirmation; the confirmed
UK/FR templates; version immutability and stable variables; the Demo solver / production
STAR*NET boundary; the contracts reusable by the future BTM development.

Design review rule: the `front/*` documents specify expected information, actions, validations
and UX principles — they are **not** frozen wireframes. Tests must assert accessible behaviour
and user outcomes, never the DOM structure or copy of the old screens.

---

## 3. Repository/module structure

`PROJECT_MAP.md §6` is the authority. Concrete layout to create (executor must not rename
top-level directories without escalation):

```text
src/
  app/                    # shell, routes, providers, theme, i18n bootstrap, Demo data badge
  domain/                 # pure TS + Zod. NO React/MSW/IndexedDB imports (enforced by lint rule)
    entities.ts           # contracts from domain/21 (see §4)
    schemas/              # Zod schemas incl. CountryPresetSchema, ResolvedConfigVersionSchema
    errors.ts             # DomainIssue { ruleId, code, fieldPath, message }
    corrections/          # prism delta, atmospheric ppm, correction trace
    time/                 # slots, config-validity resolution, epoch selection
    initialisation/       # medians, polar→ENH, coverage, anchor
    point-identity/       # engine names, aliasing, physical points, local transforms (PR-02)
    starnet/              # .dat/.prj native-template preview builder (PR-06)
    outputs/              # stable variable mapping, UPSERT-simulation model
  repositories/           # abstract interfaces + types (see §4 list)
  demo/                   # DemoRepository impls, MSW handlers, fixtures, IndexedDB persistence,
                          # seed/reset, developer route data
  workers/                # DemoAdjustmentEngine (Web Worker) behind AdjustmentEngine interface
  configs/                # copied preset seeds (uk-supplied-hs2-nte.v1.json, fr-starnet-monitoring.v1.json)
  features/
    create/               # 9-step wizard (front/11, front/12, front/13)
    administration/       # list, processing admin, run details, reprocessing (front/14)
    analysis/             # Analysis Lab (front/14)
    shared/               # reusable components from front/10 §5 + view-model types
  test/                   # factories, MSW server setup shared by Vitest/Playwright
scripts/
  convert-ats34.mjs       # build-time Excel→JSON converter (T01.2)
e2e/                      # Playwright specs
```

Domain and use-cases never import React. Demo code is never imported by feature/domain code
except through the repository/engine interfaces (DEMO-005).

---

## 4. Domain contracts and invariants

Implement the TypeScript contracts of `docs/topographic-adjustment/domain/21-CONTRATS-DE-DONNEES.md`
verbatim in `src/domain/entities.ts` + `src/domain/schemas/` (do not re-derive them):
`TopographicAdjustmentProcessing`, `AdjustmentConfigVersion`, `ObservationVariableBinding`,
`EnvironmentalVariableBinding`, `StationBinding`, `AtmosphericPolicy`, `TargetBinding`,
`ResolvedMeasurementSetup`, `ValueSource`, `PhysicalPoint`, `GeometricRelationship`,
`InitialisationConfig`, `ReferenceConstraint`, `InitialCoordinate`, `InitialisationCoverage`,
`StarNetAdjustmentConfig`, `StarNetWeights`, `RunPolicy`, `OutputPolicy`,
`ProcessingOutputVariable`, `AdjustmentRunSummary`, and the logical endpoints of `domain/21 §12`
as the MSW route surface.

Do **not** port the old prototype `types/domain.ts`; specifically never reintroduce
`mode: standard|expert`, `keepAllResultVersions`, `duplicateStrategy: new-version`,
`Station.edmMode`/global station constant as calculation authority, or `OutputResultVersion`
(`implementation/30-REUTILISATION-DU-PROTOTYPE.md §3, §6`).

Repository/gateway interfaces to stabilise first (`30 §5`): `TopographicAdjustmentRepository`,
`ConfigurationVersionRepository`, `RawObservationRepository`, `TemplateRepository`,
`OutputVariableRepository`, `RunRepository`, `AdjustmentEngine`
(`testEpoch(input: ResolvedRunInput, signal?): Promise<AdjustmentDiagnostic>`), plus injectable
`Clock` and `IdGenerator`.

Invariants every module must respect (rule IDs are cited per task):

- Time: observation epoch ≠ output slot ≠ config validity `[validFrom, validTo[` ≠
  initialisation window (TIME-001..008).
- Corrections: `prismDelta = requiredConstant − alreadyAppliedConstant` on slope distance, then
  atmospheric ppm, never twice, never via `.SCALE`, refraction separate (CORR-001..010).
- Measurement setups resolved per `station × target`/observation with source per field
  (MEAS-001..010); resolution priority of `domain/22 §2`.
- Point identity: distinct by default, human-confirmed sharing only, engine names
  `^[A-Za-z0-9_]{1,15}$` with deterministic aliases (POINT-*, NAME-001..008).
- Initialisation: local anchor default, `0/0/0/0` valid, medians over window, coverage +
  missing pairs displayed (INIT-001..010).
- Outputs: variables owned by processing, created once, recalculation UPSERTs
  `(variable_id, timestamp)` (OUT-001..010).
- Versions: used versions immutable; edits create drafts (VER-001..004).
- Quality without redundancy (audit B-04): the diagnostic carries
  `type ChiSquareStatus = 'passed' | 'failed' | 'not-applicable'`. When `dof <= 0` the χ² test
  is `not-applicable` — never silently `failed`, never displayed `Passed`; a-priori propagated
  sigmas are kept with their provenance; single-ray/uncontrolled targets are flagged (ADJ-010);
  publication follows an explicit publish-or-block policy; Auto Adjust is never launched when
  the test is not mathematically interpretable (ADJ-006/007).
- Every domain validation error carries `{ ruleId, code, fieldPath, message }`.

---

## 5. Data and fixture strategy

Source: `docs/topographic-adjustment/demo/40-DONNEES-VERCEL.md`.

- **ATS34 (UK, real supplied data)** — converted at build time by `scripts/convert-ats34.mjs`
  from `tools/demo-source/ATS34-Raw-Data-Lookup-Header.xlsx` into a versioned JSON fixture with
  schema version, source hash, conversion date, control statistics, normalised rows and warnings.
  Fixture contract (build fails if violated): 6 494 observations, station `NTE_ATS34`, 42
  observed target names, 43 Lookup rows, 10 Header lines, period 2025-03-01T00:02:58Z →
  2025-03-31T20:12:32Z, prism constants present exactly {0, 0.0089, 0.0300} m, Hz/Vz decimal
  degrees, Sd metres. UI label: `NTE ATS34 — UK supplied dataset (demo)`. No upload control
  anywhere (DEMO-001, DEMO-002, DATA-006). Source assets exist in `boumeshal-MOB/StarNet`
  @ `bd4216d5299ff761512e37a04ed46282c0c811bb`: `data-source/ATS34 Raw Data, Lookup, Header
  (1).xlsx`, `scripts/convert-ats34.mjs`, `src/data/ats34.generated.json` — ported per D-01
  (§12) and T01.2, then hardened to the new fixture contract.
- **Synthetic network fixture** (`Three-station network playground`, PR-02+) — deterministic
  generator, clearly labelled `Synthetic demo`; covers shifted epochs, homonym targets, missing
  station, late T/P, bad observation, version change, single-ray target (DEMO-003; `demo/40 §6`).
- **Small FR corrected fixture** (PR-03) — proves no double correction.
- **Presets** — copy `docs/topographic-adjustment/configs/*.v1.json` to `src/configs/` and parse
  with `CountryPresetSchema`. `null` means "decision required", never zero; FR
  `adjustment.defaultWeights = null` must block activation until resolved (`configs/README.md`).
- **Demo persistence** — IndexedDB/localStorage behind DemoRepository only; simulates production
  invariants (immutability, validity intervals, stable variables, unique UPSERT); reset returns
  to seed (`demo/40 §9`, DEMO-005).
- **Developer route** (outside navigation): fixture provenance, counters, first/last dates,
  `78.4100 + 0.0089` control, demo reset.
- Demo/production boundary: fixture JSON↔`raw_data`, MSW↔Fastify, local repo↔PostgreSQL,
  Web Worker↔Windows STAR*NET service, demo state↔`measures` (`05-GUIDE §10`). Demo solver is
  always labelled `Demo solver — not production/certified` (DEMO-004).

---

## 6. PR dependency graph

```text
PR-plan (this PR, docs only)
  └─ PR-01  feat/pr01-functional-uk-flow        — functional UK single-station vertical slice
       ├─ [Graphify: first graph inside PR-01 after T01.10; update at T01.18 — §11]
       ├─ PR-02  feat/pr02-network-physical-points   — network scope, shared points, synthetic fixture
       │    └─ PR-03  feat/pr03-fr-mixed-measurements — FR preset flow, Prism/Sheet/Reflectorless, T/P policies
       ├─ PR-04  feat/pr04-run-sync-catchup-output   — slots, fresh/reused/missing, catch-up, UPSERT publication
       │    (depends on PR-01 only; rebase on PR-02 if merged first — shared fixtures)
       └─ PR-05  feat/pr05-admin-versions-analysis   — versions, full administration, Analysis Lab, reprocessing
            (depends on PR-02 and PR-04)
            └─ PR-06  feat/pr06-starnet-preview-qa    — .dat/.prj preview + golden tests, a11y, perf, QA, handoff
```

Merge order: 01 → 02 → 03 and/or 04 (parallel allowed) → 05 → 06. Any stacked PR must state
base branch, prerequisites, merge order and rebase instructions in its description
(`CLAUDE.md › Git autonomy`). Claude may refine later boundaries but can never downgrade PR-01
(`PROJECT_MAP.md §15`).

---

## 7. PR-01 detailed vertical slice

Branch `feat/pr01-functional-uk-flow`, title `feat: functional UK single-station adjustment flow`.
Scope contract: `PROJECT_MAP.md §15 PR-01` + `docs/topographic-adjustment/05-GUIDE-GITHUB-CLAUDE-GRAPHIFY.md §5`.
It must deliver the complete working UK single-station journey on ATS34 — all nine wizard steps,
local initialisation with medians/coverage, demo adjustment test, Run/Output/Review, persisted
demo processing, minimal administration, unit/E2E tests, Vercel-ready build, no dead buttons.

Explicitly **not** in PR-01 (defer, with compact messages where a user would look for them):
network/common-points screens, synthetic multi-station fixture, full FR journey, catch-up
execution, historical versions UI, Analysis Lab, `.dat/.snproj` preview, CSV coordinate import.
Graphify: first graph after T01.10 (domain + engine ported), update at the end of PR-01 (§11).

Task format: Result / Files / Key items / Rules / Depends / Tests / Done when / Out of scope /
Read.

### T01.1 — Scaffold, tooling, shell and CI

- Result: `npm run dev` serves an MUI shell with app bar, `Demo data` badge, routes of
  `front/10 §2` (only implemented screens registered), i18n `topographicAdjustment` namespace
  (en complete, fr keys created), theme, error boundary; CI runs typecheck+lint+test+build on PR.
- Files: `package.json`, `tsconfig.json` (strict), `vite.config.ts`, `vitest.config.ts`,
  `playwright.config.ts`, `.github/workflows/ci.yml`, `vercel.json` (SPA rewrite → `/index.html`),
  `src/app/*` (router, providers, theme, i18n), `src/test/setup.ts`, `.github/PULL_REQUEST_TEMPLATE.md`
  (copy from `docs/topographic-adjustment/github-starter/.github/`), `.graphifyignore` (copy from
  starter **and extend per audit B-05** with `docs/topographic-adjustment/`,
  `IMPLEMENTATION_PLAN.md`, `src/demo/fixtures/*.generated.json`, `src/data/*.generated.json`),
  `index.html`.
- Key items: React 18 bootstrap isolated in `src/main.tsx`; QueryClientProvider; MSW worker
  start in dev/test; lint rule forbidding React/MSW/IndexedDB imports under `src/domain/`.
- Rules: DEMO-004 (badge), DEMO-005 (lint boundary), UX `front/10 §2–§6, §10, §11`.
- Depends: —.
- Tests: smoke render of shell; i18n key lookup; CI green.
- Done when: `npm run typecheck && npm run lint && npm run test && npm run build` pass locally
  and in CI; dev server shows shell with Demo badge.
- Out of scope: any wizard step content; Storybook (optional, skip).
- Read: `front/10-DESIGN-SYSTEM-ET-NAVIGATION.md`.

### T01.2 — ATS34 fixture: controlled port + deterministic contract

- Result: converter and fixture **ported from StarNet** (protocol rule 7) then hardened:
  `scripts/convert-ats34.mjs` producing `src/demo/fixtures/ats34.generated.json` with provenance
  block; workbook committed at `tools/demo-source/ATS34-Raw-Data-Lookup-Header.xlsx`; a Vitest
  "fixture contract" suite asserting the §5 counters; developer route `/dev/fixtures` (not in
  navigation) showing provenance/counters/reset.
- Port sources (StarNet @ bd4216d): `scripts/convert-ats34.mjs`, `src/data/ats34.generated.json`,
  `data-source/ATS34 Raw Data, Lookup, Header (1).xlsx`.
- Files: `scripts/convert-ats34.mjs`, `tools/demo-source/ATS34-Raw-Data-Lookup-Header.xlsx`,
  `src/demo/fixtures/ats34.generated.json`, `src/demo/fixtures/contract.ts`,
  `src/features/shared/pages/DevFixtures.tsx` (route registered but not linked), tests.
- Key items: three-sheet validation (Raw Observations A1:I6495, Lookup A1:J44, Header A1:I11),
  date/number normalisation, note columns ignored without dropping the 7 business columns,
  warnings list.
- Determinism (audit B-02): the SHA-256 hash of the workbook is the provenance identity;
  `convertedAt` is a stable metadata value supplied explicitly (or excluded from comparisons) —
  never `new Date()` at run time; business rows sorted by a deterministic key; the contract test
  compares canonical content, hash, counters and warnings; no volatile execution timestamp may
  fail the regeneration diff.
- Rules: DEMO-001, DEMO-002, DATA-006; acceptance `implementation/32 §2` (P0 + P1 converter).
- Depends: T01.1; access to the StarNet reference commit (see D-01 §12 for the access note).
- Tests: fixture contract counters; converter unit tests (column mapping, note-column tolerance,
  deterministic regeneration byte-for-byte on canonical content).
- Done when: `node scripts/convert-ats34.mjs` regenerates an identical canonical JSON and the
  contract suite passes against the real workbook output.
- Out of scope: synthetic network fixture (PR-02); FR fixture (PR-03).
- Read: `demo/40-DONNEES-VERCEL.md §2–4`, `05-GUIDE §3` (workbook location).

### T01.3 — Domain entities, schemas and error model

- Result: pure `src/domain` package exporting all §4 contracts (including `ChiSquareStatus`,
  audit B-04), Zod schemas (`CountryPresetSchema` lenient with `null`=decision-required,
  `ResolvedConfigVersionSchema` strict), and `DomainIssue { ruleId, code, fieldPath, message }`;
  both preset JSONs parse. New contracts are written from `domain/21` — never from the old
  StarNet `types/domain.ts` (§4 forbidden-type list).
- Files: `src/domain/entities.ts`, `src/domain/schemas/*.ts`, `src/domain/errors.ts`,
  `src/configs/uk-supplied-hs2-nte.v1.json`, `src/configs/fr-starnet-monitoring.v1.json`, tests.
- Rules: PROC-001..003, `configs/README.md` resolution pipeline, `domain/21` contracts.
- Depends: T01.1.
- Tests: both seeds parse; FR seed reports `defaultWeights` as unresolved decision; strict schema
  rejects unresolved fields; error objects carry ruleId/fieldPath.
- Done when: `npm run test -- domain/schemas` green; no React import possible (lint).
- Out of scope: functions (next tasks); API adapters.
- Read: `domain/21-CONTRATS-DE-DONNEES.md`, `configs/README.md`.

### T01.4 — Corrections domain module

- Result: pure functions `resolvePrismDelta`, `applyDistanceCorrections(observation, setup,
  atmosphericPolicy, env) → { finalSlopeDistanceM, trace }` where trace records stored value,
  prism delta, T/P, ppm, formula id/version, result and per-field source; formula
  `standard-ppm-v1`: `ppm = 281.8 − 0.29065 × P_hPa / (1 + T_C / 273.15)`,
  `scale = 1 + ppm×10⁻⁶`.
- Port sources (StarNet @ bd4216d, adaptation contract in `30 §2`): `src/engine/corrections.ts`
  — keep the versioned formula, T/P validation, detailed trace and differential computation;
  adapt so authority is `station × cible`, the four atmospheric modes/missing policies are
  explicit, `.SCALE` is never fed by the atmospheric formula, the output feeds the future `.dat`
  builder, and the source of every value is mandatory.
- Files: `src/domain/corrections/*.ts`, tests.
- Rules: CORR-001..010, ATMO-001..006, MEAS-004..008.
- Depends: T01.3.
- Tests (P0 of `32 §4–5`): `required − alreadyApplied` positive/negative/zero; FR MPO
  25.5−25.5=0; UK L-bar 8.9−0=+8.9 mm and 78.4100→78.4189 m before rounding; already-corrected
  distance receives no atmospheric correction; reflectorless always delta 0 and no constant;
  each of the four atmospheric modes + four missing-T/P policies behaves exactly as configured;
  correction never applied twice; `.SCALE` never derived from T/P (no such code path exists —
  assert builder input keeps scaleFactor untouched by env).
- Done when: cited tests green with rule IDs referenced in test names.
- Out of scope: `.dat` writing (PR-06); cycle-T/P variable lookup UI.
- Read: `domain/23-STARNET-IO-ET-CORRECTIONS.md §6–9`, `domain/22 §5`.

### T01.5 — Time and slots domain module

- Result: pure functions `alignSlot`, `listSlots(interval, range)`, `resolveConfigForSlot
  (versions, slot)` honouring `[validFrom, validTo[`, `selectStationEpoch(observations, slot,
  tolerance, maxReusedAge) → { epoch, state: fresh|reused|missing, ageMinutes }` — source
  timestamps never mutated.
- Port sources (StarNet @ bd4216d, per `30 §2`): `src/store/configTimeline.ts` (validity and
  per-slot resolution) and the `slotMs`/`listSlots`/fresh-reused-missing selection logic of
  `src/store/runExecution.ts`, extracted as pure functions with the new §4 types; never port
  `OutputResultVersion` or the old store coupling.
- Files: `src/domain/time/*.ts`, tests.
- Rules: TIME-001..008, RUN-003..006.
- Depends: T01.3.
- Tests: 30-min grid gives `:00/:30`; epochs `:25/:26/:32` publish slot `:30` within tolerance;
  source timestamps unchanged; boundary slot picks the version whose interval contains it
  (inclusive from, exclusive to); beyond max age → missing.
- Done when: tests green; functions consumed later by initialisation window and test-epoch input.
- Out of scope: catch-up execution and reprocessing resolution (PR-04/05).
- Read: `PROJECT_MAP.md §9`, rules TIME/RUN.

### T01.6 — Initialisation domain module

- Result: pure functions: `medianRepresentatives(observations, window)` (median Hz, Vz and
  corrected Sd per `station × target`, using T01.4 corrections), `polarToEnh(anchor,
  representative)`, `computeInitialisation(config, representatives) → { initialCoordinates,
  coverage }` with `InitialisationCoverage` counts and `missingPairs`.
- Port sources (StarNet @ bd4216d): `src/engine/initial.ts` (medians, initial coordinates) and
  `src/engine/geometry.ts` (angles, azimuths, polar→ENH) with their tests, adapted to the new
  BTM IDs/contracts; `src/engine/localGeometry.ts` is ported in PR-02 (T02.2).
- Files: `src/domain/initialisation/*.ts`, tests.
- Rules: INIT-001..010 (multi-station dispersion INIT-007 returns single-station trivially in
  PR-01), TIME-005.
- Depends: T01.4, T01.5.
- Tests (P0 `32 §7`): median used, not first/last; local anchor `0/0/0/0` accepted; coverage
  ratios exact against a fixture subset; missing pairs listed; window is provenance only.
- Done when: computing initialisation over an ATS34 window yields coordinates for observed
  targets and correct coverage numbers in tests.
- Out of scope: known-references CSV import (PR-03); multi-station combination (PR-02).
- Read: `front/12 §Étape 5`, rules INIT.

### T01.7 — Engine names and single-station point identity

- Result: pure functions `validateEngineName` (`^[A-Za-z0-9_]{1,15}$`, forbidden chars list),
  `deriveEngineName(lookupAdjustmentName, fallback)`, `aliasOnCollision → PT000001/ST0001`
  deterministic, and default one-PhysicalPoint-per-target construction for single-station.
- Port sources (StarNet @ bd4216d): the pure functions of `src/engine/pointIdentity.ts`
  (mapping, validation, connectivity) and their tests, adapted to the new contracts; shared
  points seeded from `AdjustmentName` are explicitly not ported (`30 §3`).
- Files: `src/domain/point-identity/engine-names.ts`, `src/domain/point-identity/defaults.ts`,
  tests.
- Rules: POINT-001..003, NAME-001..008 (NAME-007: never generate `MPO` for UK).
- Depends: T01.3.
- Tests: valid Lookup names kept; hyphen/space/comma/`=`/`#`/quotes rejected; >15 chars rejected;
  collision → deterministic neutral alias, stable across runs; reverse mapping complete
  (NAME-008); homonym targets stay distinct points.
- Done when: applying to the 43 ATS34 Lookup rows yields 42–43 valid unique engine names with a
  recorded mapping.
- Out of scope: shared points, transforms, candidates (PR-02).
- Read: rules NAME/POINT, `domain/23 §2`, `front/12 §3 Noms`.

### T01.8 — Outputs domain module

- Result: pure functions `buildOutputVariablePlan(processing, targetBindings, outputPolicy) →
  ProcessingOutputVariable[]` (9 per published target + globals, created once) and
  `upsertMeasure(store, variableId, timestamp, value)` simulation used by the demo repository;
  `targetAvailability = observed active output targets / total active × 100`.
- Porting note: new module written fresh — the StarNet `runExecution.ts` output path is a
  behaviour reference only; its `OutputResultVersion`/`keepAllResultVersions`/
  `duplicateStrategy: new-version` are corrected into a single UPSERT per
  `(variable_id, timestamp)` (`30 §2–3`).
- Files: `src/domain/outputs/*.ts`, tests.
- Rules: OUT-001..010.
- Depends: T01.3.
- Tests (P0 `32 §10`): variables belong to processing; second config version creates zero new
  variables; Delta = adjusted − initial of slot's version; Chi2 Passed is 1/0; recalculation
  UPSERTs same `(variable_id, timestamp)`; unobserved target gets no invented value.
- Done when: tests green; plan output stable (idempotent) for identical inputs.
- Out of scope: actual scheduled publication (PR-04).
- Read: rules OUT, `front/13 §Étape 8`.

### T01.9 — Repository interfaces, DemoRepository, MSW and persistence

- Result: `src/repositories/*` interfaces (§4 list) and `src/demo/*` implementations backed by
  the ATS34 fixture + IndexedDB (drafts, processings, versions, variables, simulated measures);
  MSW handlers exposing the logical endpoints of `domain/21 §12`; seed + reset; shared MSW server
  for Vitest and Playwright.
- Files: `src/repositories/*.ts`, `src/demo/repositories/*.ts`, `src/demo/msw/handlers.ts`,
  `src/demo/persistence/*.ts`, `src/test/msw.ts`, tests.
- Single demo path (audit H-02) — no parallel implementations:
  `UI/TanStack Query → use-case → HTTP repository → fetch → MSW → IndexedDB demo store`.
  The future BTM adapter replaces only the URL/MSW layer (Fastify) without touching domain or
  components. IndexedDB is reached exclusively through the MSW-backed store.
- Rules: DEMO-005, DATA-001/003/005 (bounded queries, explicit variable IDs in bindings),
  VER-001 (used version returned read-only), OUT-009 via T01.8.
- Depends: T01.2 (fixture), T01.3, T01.8.
- Tests: repository CRUD + draft survival; atomic create (processing + version + variables in
  one operation, §T01.16); reset restores seed; MSW handlers serve list/detail/test-run.
- Done when: app boots against MSW with ATS34 visible as demo BTM data; typed errors
  `{code, fieldPath, ruleId}` returned on validation failure.
- Out of scope: network fixture repositories; run scheduling.
- Read: `domain/21 §12`, `demo/40 §1, §9`, `30 §5`.

### T01.10 — DemoAdjustmentEngine in a Web Worker

- Result: `AdjustmentEngine` interface + `BrowserLeastSquaresDemoEngine` running a 3D
  least-squares adjustment in a Web Worker (non-blocking, abortable): builds design matrix from
  resolved observations (Hz/Vz/corrected Sd), solves with rank check, returns
  `AdjustmentDiagnostic` (convergence, iterations, rank, dof, two-sided χ² at configured
  significance, variance factor, per-observation residuals + standardised residuals, coordinates
  + sigmas, ellipse parameters), labelled `Demo solver — not production/certified STAR*NET result`.
- Files: `src/workers/demo-adjustment.worker.ts`, `src/workers/engine.ts`,
  `src/domain/… (math kept pure: linalg/stats under src/domain or src/workers/lib with no I/O)`,
  tests (run solver synchronously in Vitest via the pure core).
- Port sources (StarNet @ bd4216d, per `30 §2` and audit B-01): `src/engine/linalg.ts`
  (pivoted Householder QR, rank detection, covariance, ellipses), `src/engine/stats.ts`
  (χ², quantiles, confidence), `src/engine/adjust.ts` + `src/engine/runner.ts` + Worker glue,
  **with their passing tests** (64/64 at the reference commit). Adapt types to §4 contracts;
  expose only as `DemoAdjustmentEngine` — never replicate its internal parameters into the
  STAR*NET configuration model.
- No-redundancy behaviour (audit B-04): the diagnostic exposes `ChiSquareStatus`; when
  `dof <= 0` return `not-applicable` (never a plain χ² failure, never `passed`), keep a-priori
  propagated sigmas with provenance, flag single-ray/uncontrolled targets (ADJ-010) and mark
  Auto Adjust as non-interpretable for this epoch.
- Rules: DEMO-004, ADJ-002 (demo threshold distinct from STAR*NET convergeLimit), ADJ-004..006,
  ADJ-010, PROC-007 (no demo-solver parameter stored in the STAR*NET config model).
- Depends: T01.4, T01.6 (inputs), T01.3.
- Tests: ported engine suite green after adaptation; synthetic exactly-determined and redundant
  networks converge to known coordinates; rank-deficient input reported, not published as
  success; `dof <= 0` → `not-applicable` with a-priori sigmas; χ² two-sided evaluation; variance
  factor ≈1 on consistent noise; abort works.
- Done when: `testEpoch` on an ATS34 window returns a plausible diagnostic in <2 s for the demo
  set without blocking the UI thread; a targeted high-capability review of the ported solver is
  requested before PR-01 is marked ready (audit §8.7). Generate the **first Graphify graph**
  after this task (see §11).
- Out of scope: Auto Adjust trials (PR-05 Analysis Lab), STAR*NET file preview (PR-06).
- Read: `demo/40 §8`, `30 §2 (adjust/runner guidance)`, rules ADJ.

### T01.11 — Wizard shell + Step 1 General, Step 2 Stations, Step 3 Instruments

- Result: 9-step wizard at `/processing/topographic-adjustment/create` with stepper, sticky
  action bar, draft persistence surviving back/forward + reload, and functional steps 1–3 for
  the UK single-station case: General (no Project field, scope selector, country preset with
  prefill-diff on change, `Configuration valid from`, `Activate after creation` disabled until
  test-epoch success, compact BTM data KPIs), Stations (single table, exactly one selection for
  single-station), Instruments (per-station card: Leica TM50 I template, height 0 default,
  4 atmospheric modes + separate missing-T/P policy, measurement summary counters, advanced
  drawer; **no global EDM control**).
- Files: `src/features/create/wizard/*.tsx`, `src/features/create/steps/{general,stations,
  instruments}/*.tsx`, `src/features/create/draft.ts` (draft store via repository),
  `src/features/shared/components/{UnitField,AdvancedSection,SourceBadge,StationSelectorTable,
  ValidationSummary,…}.tsx`, i18n keys, tests.
- Rules: PROC-002/003, MEAS-001/002, ATMO-001/002, DATA-004, INIT-… deferred to step 5; UX
  `front/10 §3–§9`; validations of `front/11 §Étape 3`.
- Depends: T01.3, T01.9; atmospheric preview uses T01.4.
- Tests (component + unit, P0 `32 §3–5`): no Project field; scope in General; blocked next on
  missing instrument/policy; preset switch shows diff and creates no station/target/coordinate;
  cycle-T/P selectors list only compatible variables and keep IDs; keyboard navigation through
  step 1–3.
- Done when: user reaches step 4 with a persisted draft after a browser reload.
- Out of scope: network branch of General/Stations (message: available in a later milestone —
  but the Network radio may simply be selectable with the multi-select table if trivially
  supported; if not fully working, disable with compact explanatory text rather than a dead
  control); reuse-previous-setup (P1, PR-05).
- Read: `front/11` (whole), `front/10 §5–7`.

### T01.12 — Step 4 Targets & Measurements (single-station)

- Result: compact targets table from ATS34 Lookup (station, BTM target, role, measurement type,
  setup summary, distance correction, initialisation status, include, publish), filters + bulk
  edit toolbar, measurement-setup drawer (type, EDM, reflector, required/already-applied
  constants mm, computed BTM correction read-only, target height, stderr mm + ppm, per-field
  `SourceBadge`), name panel showing source name / physical point label / engine name, **and an
  `Input variables` sub-panel (audit B-03)** showing per BTM target/prism: `hzVariableId`,
  `vzVariableId`, `sdVariableId`, their parent sensor/prism, the mapping source and a
  compatible/missing status. Metadata-based proposals are allowed but stay user-confirmable;
  a variable's role is never deduced from its name alone (DATA-002/003); T/P variables remain in
  the station atmospheric policy (step 3), not here.
- Files: `src/features/create/steps/targets/*.tsx`,
  `src/features/shared/components/{MeasurementSetupTable,BulkEditToolbar,CorrectionTraceDrawer}.tsx`,
  tests.
- Rules: MEAS-003..010, CORR-002/005/006/009, POINT-001/002, NAME-003..006, DATA-001..003,
  DATA-008; UK setups come from the preset's 4 measurement setups (0 / +8.9 / +26.5 / +30.0 mm).
- Depends: T01.4, T01.7, T01.9, T01.11.
- Tests: prism requires reflector; reflectorless hides constants and forces delta 0; sheet is a
  distinct setup, not a 0-mm prism; bulk edit N rows then exceptions; new target defaults
  `to-review`, not silently included; correction column shows `BTM +8.9 mm` for L-bar targets;
  engine-name collision surfaces `blocking` review status; Hz/Vz/Sd bindings are visible,
  editable and confirmable, and a missing/incompatible variable produces a blocking status for
  `include` (B-03).
- Done when: all 42 ATS34 targets configurable and the happy path marks them reviewable/ok.
- Out of scope: common physical points screen (network only, PR-02).
- Read: `front/12 §Étape 4, §3 Noms`, `domain/22 §3`.

### T01.13 — Step 5 Initialisation (local anchor, medians, coverage)

- Result: two mutually exclusive method cards; `No coordinates — fix one station` selected by
  default with anchor station, E/N/H/orientation inputs accepting `0/0/0/0`; observation-window
  picker labelled `Observation window used for initialisation` with the provenance explanation;
  compute action producing per-point coordinates table (E/N/H, source, station count, obs count,
  H/V spread, status) + `InitialisationCoverageCard` (available/expected points and pairs, raw
  obs count, representatives, missing list, retained min/max period); action button
  `Use as initial coordinates`; explicit actionable failures.
- Files: `src/features/create/steps/initialisation/*.tsx`,
  `src/features/shared/components/InitialisationCoverageCard.tsx`, tests.
- Rules: INIT-001..010 (INIT-003: known-reference card offers only genuinely provided data —
  see below; INIT-009 label), TIME-005.
- Depends: T01.6, T01.11, T01.12.
- Known references in PR-01: the ATS34 Header genuinely provides 9 references
  (`L34RE1100_*`, σ 1–2 mm) — the `Use known reference coordinates` card is functional but
  minimal: select among provided references with per-component fixed/weak/free; manual entry
  allowed; CSV import deferred with a compact message (PR-03). No prefilled values beyond the
  genuinely provided set (INIT-003).
- Tests: default mode local-anchor with nothing prefilled; `0/0/0/0` accepted; medians (not
  first/last) drive results; coverage/missing exact; window text present; failure case: target
  without representative observation → actionable error.
- Done when: happy path computes initial coordinates for ATS34 targets in the chosen window and
  stores them in the draft version snapshot (INIT-008).
- Out of scope: CSV import, multi-station dispersion UI, transformation failures (PR-02/03).
- Read: `front/12 §Étape 5`, `demo/40 §2 Header`.

### T01.14 — Step 6 Adjustment + Test one epoch

- Result: compact STAR*NET parameter card loaded from UK preset (3D, Meters, DMS, local, EN,
  Slope/Zenith, scale 1.0, refraction 0.07, earth radius 6 372 000 m, converge 0.01 unitless,
  max iterations 10, χ² 5 %, error propagation on, confidence 95 %), advanced accordion (weights
  1.0 mm + 1.0 ppm, angle 1.414″, direction 2.5″, azimuth 1.0″, zenith 1.5″, centering
  0.8/0.8/0.5 mm; Auto Adjust 3.0/1/20 shown as configuration), χ²-failure policy selector;
  `Test one epoch` panel: pick an available slot, run `AdjustmentEngine` (worker), show sources
  per station, corrections applied, convergence/rank/χ²/variance factor, max residual, residual
  table, ellipses on `NetworkView`, warnings — nothing published, demo-solver label visible.
  `.dat/.snproj` preview area replaced by compact message "STAR*NET file preview arrives in a
  later milestone" (no dead button).
- Files: `src/features/create/steps/adjustment/*.tsx`,
  `src/features/shared/components/{StarNetParameterTable,ChiSquareGauge,ResidualTable,NetworkView,
  ConfidenceEllipseLayer,EpochSelectionSummary}.tsx`, tests.
- Rules: ADJ-001..006, ADJ-003 (solution iterations ≠ Auto Adjust iterations — UK 10 vs 20
  asserted), PROC-007 (no CoMeT/demo-solver fields), CORR-007/008 kept separate, DEMO-004;
  test epoch does not publish (`front/13 §Test one epoch`, `32 §8`).
- No-redundancy display (audit B-04): when the diagnostic returns
  `chiSquare: 'not-applicable'` (`dof <= 0`), show `Not applicable — no redundancy`, never
  `Passed`; display a-priori propagated sigmas with their provenance; flag single-ray targets;
  surface the explicit publish-or-block policy; do not offer Auto Adjust for that epoch.
- Depends: T01.5, T01.10, T01.13.
- Tests: UK preset loads exact values; convergence displayed unitless; no CoMeT field exists;
  Auto Adjust 20 does not overwrite max solution iterations 10; test-epoch run yields diagnostic
  and creates no measure/variable; a `dof <= 0` epoch shows `Not applicable — no redundancy`
  and never `Passed` (B-04).
- Done when: user runs a demo test epoch on ATS34 and reads a full diagnostic without
  publication; `Activate after creation` becomes available in Review after a successful test.
- Out of scope: Auto Adjust execution, χ²-fail trials (PR-05); FR preset flow (PR-03);
  file preview (PR-06).
- Read: `front/13 §Étape 6`, `domain/22 §3`, rules ADJ.

### T01.15 — Step 7 Run + Step 8 Output configuration

- Result: Run step with trigger (event-driven default / every X minutes / manual), sync
  tolerance, reuse policy with max age 30/45/60/custom, provisional marking, catch-up config
  block (stored in `RunPolicy`, defaults from `domain/22 §6`), and the living example block
  (`Output slot 09:30 …`) rendered from the domain time functions; Output step with interval
  30/60/custom, `:00/:30` alignment display, max epoch-to-slot, publish-provisional switch,
  the slot **closure/catch-up delay** field of `front/13 §Étape 8` (when a slot stops accepting
  catch-up and its provisional result becomes final — distinct from the publication interval;
  audit H-05, execution semantics in T04.3), and `OutputVariableMatrix` preview of the stable
  variables that will be created (9 per published target + globals from `domain/22 §7`).
- Files: `src/features/create/steps/{run,output}/*.tsx`,
  `src/features/shared/components/OutputVariableMatrix.tsx`, tests.
- Rules: RUN-001..007 (as configuration semantics), TIME-002/004, OUT-001..006.
- Depends: T01.5, T01.8, T01.11.
- Tests: defaults match `domain/22 §6–7` templates; variable matrix counts = published targets ×
  9 + selected globals; interval change re-renders `:00/:30` grid correctly; policy stored in
  draft snapshot.
- Done when: run/output policies persist in the draft and Review shows them; no execution
  simulation implied.
- Out of scope: actual slot publication, reuse/catch-up execution and previews of recent slots
  (PR-04 — show compact message in the preview area).
- Read: `front/13 §Étapes 7–8`, `domain/22 §6–7`.

### T01.16 — Step 9 Review & Create + atomic creation

- Result: prioritised review (blocking errors → warnings/fallbacks → stations → targets →
  non-zero corrections → initial coordinates/coverage → STAR*NET template + overrides →
  run/sync → output variables → validity/activation), engine-name list with collision blocking,
  actions `Test one epoch`, `Save draft`, `Create inactive`, `Create and activate` (enabled only
  when minimal validations pass and a test epoch succeeded, per `front/11` activation rule);
  creation is atomic in the demo repository: processing + version 1 (status per activation
  choice, `[validFrom, ∞[`) + physical points + stable output variables; failure leaves nothing
  partial.
- Files: `src/features/create/steps/review/*.tsx`, `src/features/create/use-cases/create-processing.ts`,
  tests.
- Rules: PROC-001..003, VER-001, OUT-001/002, NAME collision block (`32 §6`), atomic creation
  (`front/13 §Étape 9`).
- Depends: T01.9, T01.12..T01.15.
- Tests: review orders issues correctly; engine-name collision blocks; create-inactive produces
  a processing readable back with full snapshot; simulated failure mid-create leaves no partial
  processing; second version creation (unit-level) adds no variables (OUT-002 guard).
- Done when: happy path creates the UK processing and redirects to its administration page.
- Out of scope: activation timeline management, version diff UI (PR-05).
- Read: `front/13 §Étape 9`.

### T01.17 — Minimal administration

- Result: processing list (`/processing/topographic-adjustment`) with name/scope/stations/
  version/status columns and `Open`; processing page (`/:id`) with tabs limited to what works:
  Overview (status, scope, station, config summary), Configuration (read-only resolved snapshot
  of version 1 with per-field sources), Output variables (the created stable matrix). Other
  front/14 tabs appear as compact "later milestone" text entries, not clickable dead tabs.
- Files: `src/features/administration/{list,detail}/*.tsx`, tests.
- Rules: VER-001 (read-only used/active version), OUT-001; UX `front/14 §1–2` reduced scope.
- Depends: T01.16.
- Tests: created processing appears in list; reopening shows the exact created snapshot
  (P0 `05-GUIDE §5` reopening criterion); read-only enforcement.
- Done when: E2E can create then reopen the processing and verify its configuration.
- Out of scope: runs list, reprocessing, Analysis Lab, version timeline (PR-04/05).
- Read: `front/14 §1–2`.

### T01.18 — E2E happy path, accessibility pass, build and PR evidence

- Result: Playwright spec driving the full UK journey: open create → steps 1–9 with ATS34 →
  test one epoch → create inactive → reopen from administration; keyboard-only traversal of the
  wizard; axe/a11y smoke on main screens; production build; Graphify graph **updated**
  (`/graphify . --update`; the first graph was generated after T01.10, §11); PR description
  filled from the template with screenshots, rule IDs, commands, fixture disclosure **and the
  requirement → screen matrix** required by the design-freedom rule (§2).
- Files: `e2e/uk-single-station.spec.ts`, `e2e/keyboard.spec.ts`, PR body.
- Rules: `32 §14` P0 (no dead primary action, units visible, AA contrast, keyboard), DoD `05 §5`.
- Depends: all T01.x.
- Tests/commands: `npm run typecheck && npm run lint && npm run test && npm run test:e2e &&
  npm run build`.
- Done when: all commands green in CI; PR `feat: functional UK single-station adjustment flow`
  opened/updated with complete evidence; `PROJECT_MAP.md §2` status update is left to the merge
  commit or a follow-up per its own rule (update only when milestone merged).
- Out of scope: performance virtualisation targets (P1, PR-06).

---

## 8. Later PR plans

Each later PR keeps the same task discipline (result/files/rules/tests/done). Tasks are bounded
here at module level; the executor derives sub-steps without changing architecture.

### PR-02 — network and physical points (`feat/pr02-network-physical-points`)

Sources: `front/12 §Common physical points`, rules POINT/NAME, `demo/40 §6`.
- T02.1 Synthetic three-station fixture generator (deterministic, labelled `Synthetic demo`;
  ground truth kept for tests only) — DEMO-003; scenarios of `demo/40 §6`.
- T02.2 Domain: local clouds from representatives, horizontal transform + 3D translation,
  candidate pairing with H/V/3D residuals (mm), connectivity graph + status
  `Connected/Weak geometry/Not connected` — POINT-008..011, POINT-013/014. Port
  `src/engine/localGeometry.ts` (+ tests) from StarNet @ bd4216d, strengthening H/V tolerances
  per `30 §1`.
- T02.3 Network branch of wizard steps 1–2 (scope Network, ≥2 stations, refuse independent
  components at review) — PROC-004/005, `32 §3`.
- T02.4 Common physical points screen: empty state text, prior-mapping reuse with provenance
  (POINT-007), manual seed pairs (min 2, recommend 3), `Check common points` assistant with
  candidate table (Use checkbox, residuals in headers, confidence, evidence), confirmation flow;
  shared-points table excludes individual targets (POINT-012); geometric relationships table
  (types of `domain/21 §6`) — POINT-001..015, NAME-006.
- T02.5 Multi-station initialisation: estimation combination + H/V dispersion display,
  disconnected/unorientable errors — INIT-007, `front/12 §Étape 5.5`.
- T02.6 E2E: 1 seed blocks / 2 seeds weak / 3 seeds robust; homonyms stay distinct; no automatic
  confirmation — `32 §6` P0 set.
- DoD: network processing creatable end-to-end on the synthetic fixture; Graphify updated.

### PR-03 — full FR/UK and mixed measurement setups (`feat/pr03-fr-mixed-measurements`)

Sources: `domain/22`, `front/11–12`, rules MEAS/CORR/ATMO, `configs/fr-starnet-monitoring.v1.json`.
- T03.1 Small FR corrected fixture (already-applied atmosphere, MPO delta 0) — proves no double
  correction (CORR-005).
- T03.2 FR preset journey: Gons display, refraction 0.13, radius 6 371 000 m, 30 iterations;
  Review blocks activation while `defaultWeights` is null (decision D-05) — `32 §8` P0 FR.
- T03.3 Mixed setups on one station (Prism/Sheet/Reflectorless in same cycle), Topcon per-family
  precisions, EDM-change compatibility check, bulk edit at scale — MEAS-006..010, `32 §4`.
- T03.4 Cycle-T/P mode end-to-end with variable pickers, tolerance, formula display, preview on
  a representative observation; the four missing-T/P policies drive provisional/catch-up flags —
  ATMO-001..006, `front/11 §Étape 3`.
- T03.5 CSV import for known reference coordinates (strict documented format, preview, duplicate/
  unit/value rejection) — `front/12 §Étape 5.1`, `32 §7` P1.
- DoD: FR and mixed scenarios of `demo/40 §7` pass E2E; no double correction anywhere.

### PR-04 — synchronization, reuse, catch-up, stable output publication (`feat/pr04-run-sync-catchup-output`)

Sources: rules RUN/TIME/OUT, `front/13 §Étapes 7–8`, `demo/40 §7`.
- T04.1 Domain run resolver: build `ResolvedRunInput` per slot (config-by-slot, fresh/reused/
  missing epochs, corrections applied once, immutable snapshot) — `PROJECT_MAP.md §8` pipeline.
- T04.2 Simulated run execution + publication in demo repo: UPSERT `(variable_id, timestamp)`,
  global quality variables, provisional flag on reuse/fallback; publication is transactional —
  a simulated mid-publication failure publishes no partial measures (audit H-04, `32 §13`) —
  OUT-003..010, RUN-004/005.
- T04.3 Catch-up + slot closure: late observation/T-P recomputes same slot with historically
  valid config, idempotent, bounded per-slot; implement the explicit closure rule configured in
  T01.15 — when the closure/catch-up delay expires, the slot's provisional result becomes final
  and no further catch-up applies; closure is distinct from the publication interval (audit
  H-05) — TIME-007/008, RUN-008, ATMO-005.
- T04.4 Run preview panel of step 7 (recent slots: state, freshness, expected
  Final/Provisional/Blocked, reason, next action) replacing the PR-01 compact message.
- T04.5 Runs tab in administration + `AdjustmentRunSummary` list/detail (Summary tab only;
  deep tabs in PR-05).
- T04.6 Tests: `:25/:26/:32→:30`; reused→provisional; beyond max age blocks required station;
  optional-station policy; late arrival UPSERTs same slot, no new variable — `32 §9–10` P0.
- DoD: sync scenarios of `demo/40 §7` demonstrable on the synthetic fixture.

### PR-05 — versions, complete administration, Analysis Lab, reprocessing (`feat/pr05-admin-versions-analysis`)

Sources: `front/14`, rules VER, `00-PROJET-GLOBAL.md §17–18`.
- T05.1 Version lifecycle: draft/active/archived, `[validFrom, validTo[` timeline without
  overlap, duplicate-as-draft, activate-from-date, archive, restore-as-draft, resolved-snapshot
  view; used versions immutable — VER-001..004, `32 §11`.
- T05.2 Configuration diff grouped by concern with before/after, unit, source, impact.
- T05.3 Full administration tabs (Overview…Audit per `front/14 §2`), reusing wizard components;
  audit entries for activation/archive/mapping/forced recalculation/template change — VER-010.
  Complete the processing-list actions (audit H-03): `Run now`, `Activate/Deactivate
  processing`, `Duplicate`, `Archive processing`, plus next-action and quality columns/badges
  on the list — `front/14 §1`.
- T05.4 Run details deep tabs: Network, Coordinates, Residuals, Quality, Auto Adjust attempts,
  Input snapshot (reconstructed preview) — `front/14 §4`.
- T05.5 Analysis Lab: session creation, baseline Trial 0 immutable, overrides with base/new/
  unit/justification, run/duplicate/compare trials (χ², variance, max stdres, rank, exclusions,
  ellipses, coordinate changes), anti-manipulation diagnostics (inflated sigmas, too many
  exclusions, low dof, freed references), save candidate as new config version with reason —
  ADJ-007..009, `front/14 §5`, `32 §12`.
- T05.6 Auto Adjust demo implementation inside the engine trials (exclude observations from
  trial only, trace attempt/exclusion/reason/stdres) — DATA-007, ADJ-007/008.
- T05.7 Reprocessing: form (range, per-slot strategy default, forced-version advanced option
  with justification + preview, dry-run/publish), preview (slot count, versions per sub-period,
  gaps, replacements, warnings), publication via UPSERT — TIME-007, `front/14 §6`, `32 §11`.
- T05.8 Templates catalogue screens (country/instrument/measurement/adjustment/run/output);
  template edits never mutate existing configs — VER-004, `front/14 §7`.
- DoD: administration cycle E2E green; historical-version scenario of `demo/40 §7` passes.

### PR-06 — STAR*NET preview, golden tests, accessibility, performance, final QA (`feat/pr06-starnet-preview-qa`)

Sources: `domain/23`, `32 §14–15`, `06-REPRISE-DEVELOPPEUR-BTM.md` (read at execution).
- T06.1 Pure preview builder `src/domain/starnet/`: `.dat` (C lines with !/sigma/* modes, EN/NE
  order, DB/DM/DE blocks, HI/HT, pre-corrected final slope distances, no `.PRISM` by default,
  `.SCALE` only from datum config) and minimal `.snproj` sections; reverse mapping complete —
  NAME-002/003, CORR-007, `domain/23 §2–11`.
- T06.2 Golden tests UK raw and FR corrected + reflectorless + mixed + collision + HI/HT cases —
  `domain/23 §16`, `32 §8` P1.
- T06.3 Test-one-epoch and run-details preview panels replace PR-01/PR-04 compact messages.
- T06.4 Accessibility audit to zero critical issues; large-table virtualisation (1 000 targets
  usable); i18n en/fr completion + placeholder locales — `32 §14`.
- T06.5 Final QA sweep: rule-violation hunt, dead controls, ambiguous units, hardcoded values,
  MSW/API divergences; final report mapping every P0 criterion to a test or UI evidence —
  `32 §15`, `implementation/31 Prompt 11`.
- T06.6 BTM handoff documentation update (`06-REPRISE-DEVELOPPEUR-BTM.md` alignment, replacement
  table of `05-GUIDE §10`), including the Windows-service contract for the licence lock and
  orphan-workspace cleanup with documented test scenarios (audit H-04, RUN-010, `32 §13` P1).
- T06.7 Native STAR*NET output parser (audit H-01): pure, tested parser for the native outputs
  (`.lst`/`.pts`/`.err` listing content) extracting adjusted coordinates and sigmas, ellipses,
  residuals and standardised residuals, χ² and variance factor, convergence/iterations,
  errors/warnings and Auto Adjust exclusions when exposed; never based on the legacy
  `argus_export`/`chisquare_export` custom files; complete reverse mapping
  `engineName → PhysicalPoint → BTM targets`; an unknown or duplicated point name blocks any
  publication — `domain/23 §14`, NAME-008. In the mock-up it parses committed anonymised native
  golden fixtures; STAR*NET is never executed.
- T06.8 Isolation/concurrency contract tests (audit H-04): five processings simultaneously
  using `STA1`/`MPO001` resolve names in isolated workspaces (simulated); no physical-point
  mapping ever crosses a processing; transactional publication never leaves partial measures —
  RUN-009/010, POINT-015, `32 §13` P0.
- DoD: full `32 §15` Definition of Done satisfied, including native-parser golden tests and
  isolation contract tests; final Graphify regeneration.

---

## 9. Task checklist by file/module

| Module / path | Tasks | Notes |
|---|---|---|
| tooling, CI, `src/app/` | T01.1 | shell, routes, i18n, vercel.json |
| `scripts/convert-ats34.mjs`, `src/demo/fixtures/` | T01.2, T02.1, T03.1 | ported from StarNet (B-01), deterministic (B-02) |
| `src/domain/entities.ts`, `schemas/`, `errors.ts` | T01.3 | contracts from domain/21 |
| `src/domain/corrections/` | T01.4, T03.4 | CORR/ATMO |
| `src/domain/time/` | T01.5, T04.1, T04.3 | TIME/RUN |
| `src/domain/initialisation/` | T01.6, T02.5, T03.5 | INIT |
| `src/domain/point-identity/` | T01.7, T02.2, T02.4 | POINT/NAME |
| `src/domain/outputs/` | T01.8, T04.2 | OUT |
| `src/domain/starnet/` | T06.1, T06.2, T06.7, T06.8 | PR-06 only: builder, goldens, native parser, isolation |
| `src/repositories/`, `src/demo/` | T01.9, T04.2, T05.1 | interfaces + demo impls |
| `src/workers/` | T01.10, T05.6 | engine ported from StarNet (B-01), Auto Adjust trials |
| `src/features/create/` steps 1–3 | T01.11, T02.3 | |
| `src/features/create/` step 4 (+ common points) | T01.12, T02.4, T03.3 | |
| `src/features/create/` step 5 | T01.13, T02.5, T03.5 | |
| `src/features/create/` step 6 | T01.14, T03.2 | |
| `src/features/create/` steps 7–8 | T01.15, T04.4 | |
| `src/features/create/` step 9 | T01.16 | atomic create |
| `src/features/administration/` | T01.17, T04.5, T05.1..T05.4, T05.7, T05.8 | |
| `src/features/analysis/` | T05.5 | Analysis Lab |
| `src/features/shared/` | T01.11..T01.15 | components of front/10 §5 |
| `e2e/` | T01.18, T02.6, T03/T04/T05/T06 E2E | happy paths per PR |

---

## 10. Tests mapped to rule IDs

Convention: every domain test name cites its rule ID (e.g. `CORR-002 required minus applied`),
so `32 §15` "rule counters" can be audited by grep. Acceptance criteria source:
`implementation/32-TESTS-CRITERES-ACCEPTATION.md` (P0 unless noted).

| Rule family | Test location | Key P0 assertions (32 §) | PR |
|---|---|---|---|
| PROC | `domain/schemas`, review step tests | scope selection, single network (§3) | 01/02 |
| DATA | fixture contract, MSW handlers | counts/period/constants, no import UI (§2) | 01 |
| TIME | `domain/time` | `:25/:26/:32→:30`, unchanged sources, validity bounds (§9) | 01/04 |
| MEAS | `domain/corrections`, targets step | mixed families, reflectorless, sheet ≠ prism 0 mm (§4); explicit Hz/Vz/Sd bindings (B-03) | 01/03 |
| CORR | `domain/corrections` | ±/0 deltas, FR 0, UK +8.9 → 78.4189, no double corr (§4–5) | 01 |
| ATMO | `domain/corrections`, instruments step | 4 modes, missing policies, `.SCALE` inert to T/P (§5) | 01/03 |
| POINT | `domain/point-identity`, common-points E2E | homonyms distinct, 1/2/3 seeds, no auto-confirm (§6) | 01/02 |
| NAME | `domain/point-identity` | regex, collisions block review, no UK `MPO` (§6) | 01 |
| INIT | `domain/initialisation`, step-5 tests | local-anchor default, 0/0/0/0, medians, coverage (§7) | 01 |
| ADJ | engine tests, adjustment step | UK/FR presets exact, unitless convergence, 10 vs 20 (§8); `dof <= 0` → not-applicable, never Passed (B-04) | 01/03/05 |
| RUN | `domain/time`, run simulation | fresh/reused/missing, provisional, blocking (§9) | 04 |
| OUT | `domain/outputs` | stable variables, Delta semantics, UPSERT (§10) | 01/04 |
| VER | version lifecycle tests | immutability, no overlap, per-slot resolution (§11) | 05 |
| DEMO | fixture + lint boundary tests | labels, single-station limit, no domain I/O (§2) | 01 |
| A11y/UX | Playwright + axe | keyboard path, AA, no dead action, units (§14) | each PR |
| Golden | `domain/starnet` golden files | .dat/.snproj UK/FR (§8 P1); native-output parse-back (H-01) | 06 |
| Isolation | contract tests (`domain/starnet`, outputs) | 5 processings share `STA1/MPO001` isolated, no cross-processing mapping, no partial publication (§13) | 04/06 |

---

## 11. Graphify strategy

Per `CLAUDE.md › Graphify lifecycle` and `05-GUIDE §7`:

- No graph exists before PR-01 code: executors use `PROJECT_MAP.md` + cited sources only.
- **Ignore rules first (audit B-05).** Before the first Graphify run, `.graphifyignore` must
  contain, in addition to the starter entries:

  ```gitignore
  docs/topographic-adjustment/
  IMPLEMENTATION_PLAN.md
  src/demo/fixtures/*.generated.json
  src/data/*.generated.json
  ```

  Keep in the graph: source code, tests, TypeScript contracts and optionally `PROJECT_MAP.md`.
  The specification corpus and the >1 MB ATS34 JSON are already indexed manually by
  `PROJECT_MAP.md` and must not consume graph tokens.
- **First graph after the domain and engine are ported** (end of T01.10, before the large UI
  tasks): `uv tool install graphifyy && graphify install --project`, then `/graphify .`; commit
  `graphify-out/GRAPH_REPORT.md` and `graphify-out/graph.json` (not caches, not `graph.html`).
- Update with `/graphify . --update` at the end of PR-01 (T01.18) and after structural PRs:
  PR-02, PR-04, PR-05, PR-06 (skip pure-visual changes).
- Scoped queries to run before touching code (verify `INFERRED` edges in source before edits):
  - corrections: `/graphify query "where is prismDelta resolved and applied?"`
  - time: `/graphify explain "resolveConfigForSlot"`
  - outputs: `/graphify path "TargetBinding" "ProcessingOutputVariable"`
  - engine: `/graphify explain "AdjustmentEngine"`
  - wizard drafts: `/graphify query "how does the wizard draft persist between steps?"`

---

## 12. Risks and explicit open decisions

Do **not** guess any of these. Record blockers in §14 and continue with independent tasks.

| ID | Item | Impact | Safest mock-up boundary |
|---|---|---|---|
| D-01 | **Resolved (audit B-01)** — ATS34 source assets exist in `boumeshal-MOB/StarNet` @ `bd4216d5299ff761512e37a04ed46282c0c811bb`: `data-source/ATS34 Raw Data, Lookup, Header (1).xlsx`, `scripts/convert-ats34.mjs`, `src/data/ats34.generated.json` | T01.2 ports them instead of rebuilding | Copy the workbook to `tools/demo-source/`, port + harden converter/fixture with B-02 determinism. Practical note: the executor session needs read access to the StarNet reference commit (add the repo to the session, or the owner commits the three assets to a branch here) |
| D-02 | **Resolved (audit B-01)** — the prototype's scientific modules (`geometry`, `linalg`, `stats`, `localGeometry`, `initial`, `pointIdentity`, `adjust`, `runner`, Worker) and their 64 passing tests exist in the same StarNet commit | Porting replaces fresh reimplementation in T01.4–T01.7, T01.10, T02.2 | Controlled porting per executor-protocol rule 7: pure functions and tests only, types adapted to §4; never copy pages/styles/layout/information architecture; do-not-reuse list of `30 §3/§6` stays binding |
| D-03 | TanStack Query v5 officially targets React ≥18 while reusable feature code must stay React 17-runtime compatible (BTM ADR) | BTM transplantation risk, not a mock-up blocker | Keep Query usage inside hooks/use-case layer so an adapter swap is localised; note in handoff docs; do not change mandated stack without owner decision |
| D-04 | Production open decisions of `PROJECT_MAP.md §18` (STAR*NET automation interface, licence lock, native output options, approved atmospheric formula, FR production weights/centring, SQL layout, retention, metrics catalogue) | None for mock-up | Never fill with invented values; `standard-ppm-v1` stays clearly a demo formula (CORR-010) |
| D-05 | FR preset `adjustment.defaultWeights = null` (surveyor validation pending) | FR activation must stay blocked | Review blocks activation until weights are entered by the user (T03.2); never default them |
| D-06 | ATS34 Lookup `GraphEnabled` is false on all rows | Which targets are "published" in demo | User chooses publish explicitly in step 4; no silent reinterpretation of the column (`demo/40 §2`) |
| D-07 | Micro Prism +26.5 mm appears in the UK catalogue but in no ATS34 Lookup row | Fixture tests must not expect it | Offer it in the setup catalogue; never claim it is used by the dataset |
| D-08 | Exact activation semantics for `validTo` of the previous version (`32 §11` P1 "selon la règle décidée") | Version timeline edge | Implement non-overlap + explicit activate-from-date; escalate the atomic-adjustment rule when PR-05 starts if still undecided |
| D-09 | `AdjustmentRunSummary` retention/diagnostic depth in demo | Low | Keep minimal summary per `domain/21 §11`; no coordinate duplication (VER-009) |

---

## 13. Definition of Done

Common to every PR (from `CLAUDE.md`, `32 §15`): typecheck, lint, unit/component tests, targeted
Playwright, production build all green in CI; no dead primary action; units visible; demo data
labelled; PR description follows the repository template with rule IDs, commands, screenshots,
fixture disclosure, dependencies; used spec documents unchanged (docs updated only when behaviour
documented changes); Graphify regenerated when §11 says so; `PROJECT_MAP.md §2` status updated
when (and only when) a milestone merges.

Per PR:

- **PR-plan**: this file exists, complies with `07 §2` structure, contains no invented product
  value; owner review per `07 §4`.
- **PR-01**: complete UK single-station journey on ATS34 (wizard 9 steps → test one epoch →
  create → reopen in administration) with the T01.18 command set green; no dead buttons; SPA
  build deployable on Vercel; minimum tests of `05-GUIDE §5` all present; scientific modules
  ported (not rewritten, not visually copied) per protocol rule 7; requirement → screen matrix
  in the PR description; `ChiSquareStatus` not-applicable behaviour implemented (B-04).
- **PR-02**: network processing creatable on the synthetic fixture; 1/2/3-seed behaviours; no
  automatic point sharing anywhere.
- **PR-03**: FR journey and mixed setups; zero double correction; FR activation blocked while
  weights unresolved.
- **PR-04**: sync/reuse/catch-up scenarios demonstrable; UPSERT semantics proven by tests;
  provisional flags correct.
- **PR-05**: version lifecycle immutable and per-slot resolution correct; Analysis Lab trials +
  anti-manipulation diagnostics; reprocessing dry-run + publish.
- **PR-06**: `32 §15` checklist fully satisfied; native-output parser with golden parse-back
  tests (H-01) and isolation/concurrency contract tests (H-04) green; final P0→evidence report
  committed.

---

## 14. Execution log / checklist

Executors: check boxes, append evidence lines (`date — task — commit/PR — commands run —
result`). Do not rewrite sections 1–13; architectural changes go through the planning model.

### PR-01 — feat/pr01-functional-uk-flow

- [x] T01.1 scaffold/shell/CI — evidence: commit `9900485` on `feat/pr01-functional-uk-flow`
  (Draft PR to open). Vite+TS strict+React 18 isolated bootstrap+MUI 5 (own palette)+Router v6+
  TanStack Query v5+react-i18next (`topographicAdjustment` ns, en/fr)+MSW (empty handlers,
  populated T01.9)+Vitest/Testing Library+Playwright+ESLint flat config with a verified
  `src/domain` React/MSW/IndexedDB import boundary+GitHub Actions CI+`vercel.json` SPA rewrite.
  `.graphifyignore` extended per B-05. Commands: `npm run typecheck && npm run lint &&
  npm run test && npm run test:e2e && npm run build` all green (2 unit tests, 1 e2e test).
- [x] T01.2 ATS34 fixture ported + deterministic (B-01/B-02) — evidence: commit `1729d6b`.
  Ported workbook/converter from `boumeshal-MOB/StarNet@bd4216d` into
  `tools/demo-source/ATS34-Raw-Data-Lookup-Header.xlsx` + `scripts/convert-ats34.mjs` (I/O glue)
  + `scripts/lib/ats34-transform.mjs` (pure, unit-tested column mapping). Fixed a
  reference-count inversion bug found while porting (references are Header points that ARE
  Lookup targets, not points absent from Lookup). Fixture at
  `src/demo/fixtures/ats34.generated.json` matches the contract exactly: 6494 raw observations,
  station `NTE_ATS34`, 42 targets, 43 Lookup rows, 10 Header rows (9 references),
  2025-03-01T00:02:58Z→2025-03-31T20:12:32Z, prism constants {0, 0.0089, 0.03} m. Determinism
  verified: two consecutive `node scripts/convert-ats34.mjs` runs produce a byte-identical file
  (SHA-256 hash equal), asserted by an integration test. `/dev/fixtures` route registered, not
  linked from navigation. 25/25 unit tests green (13 converter unit tests + 8 fixture-contract
  tests + 2 determinism integration tests + 2 shell tests), build and e2e green.
- [x] T01.3 domain entities/schemas — evidence: commit `e69ae87`. `src/domain/entities.ts`
  transcribes all `domain/21` contracts from source (not ported from StarNet's
  `types/domain.ts`) plus `ChiSquareStatus` (audit B-04). `src/domain/errors.ts` defines
  `DomainIssue`. `countryPresetSchema` (lenient) parses both `src/configs/*.v1.json` seeds;
  `resolvedAdjustmentConfigVersionSchema` (strict) rejects unresolved/invalid snapshots. FR seed
  asserted to report `defaultWeights: null` as an unresolved decision (D-05). Repository/gateway
  interfaces added per plan §4 (`TopographicAdjustmentRepository`,
  `ConfigurationVersionRepository`, `RawObservationRepository`, `TemplateRepository`,
  `OutputVariableRepository`, `RunRepository`, `AdjustmentEngine`) plus injectable
  `Clock`/`IdGenerator`; `AdjustmentEngine`'s I/O types left provisional pending T01.4/T01.10.
  `npx vitest run src/domain/schemas` green (8/8); `npx eslint src/domain` clean (0 issues,
  domain-purity boundary re-verified). Full suite 35/35 green, build and e2e green.
- [x] T01.4 corrections — evidence: `src/domain/corrections/{prism,atmosphere,apply-distance-corrections,index}.ts`
  + tests. `resolvePrismDelta` implements CORR-002/009 (reflectorless always 0; reflective-sheet
  uses its own required/applied constants, MEAS-007). `resolveAtmosphericPpm` implements the
  four `AtmosphericMode` values (ATMO-001) and, when T/P is missing/invalid, the four
  `MissingEnvironmentPolicy` values (ATMO-002/003/004/006), formula `standard-ppm-v1`
  (`STANDARD_PPM_FORMULA_ID`/`_VERSION`, CORR-010) ported from
  `boumeshal-MOB/StarNet@bd4216d:src/engine/corrections.ts` and adapted to station×target
  authority and the domain's four-mode/four-policy contracts (no direct port of that file's
  5-variant legacy enums). `applyDistanceCorrections` composes both into a full `CorrectionTrace`
  (stored value, delta, T/P, ppm, formula id/version, per-field source, provisional/blocking
  flags, warnings — CORR-006) and never reads/writes a `StarNetAdjustmentConfig`/`scaleFactor`
  (CORR-007, verified by a dedicated test). Workbook control values verified end-to-end:
  78.4100+8.9mm=78.4189, 193.5820+30.0mm=193.6120, 4.2138+8.9mm=4.2227; FR MPO
  25.5−25.5=0. 34 new tests, full suite 96/96 green; `npx eslint src/domain/corrections` clean
  (0 issues; domain-purity boundary re-verified with a live React-import probe); typecheck,
  build, `CI=1 test:e2e` and plain `test:e2e` all green.
- [x] T01.5 time/slots — evidence: `src/domain/time/slots.ts` (alignSlot/nearestSlot/listSlots,
  resolveConfigForSlot honouring `[validFrom, validTo[`, selectStationEpoch fresh/reused/missing);
  tests `src/domain/time/__tests__/slots.test.ts` (9). Commit `d1c16c8`.
- [x] T01.6 initialisation — evidence: `src/domain/initialisation/initialisation.ts` (median,
  circularMedianDeg, initialisationCoverage, computeInitialCoordinates with fixed local anchor and
  network resection). Ported from StarNet `initial.ts`. Commit `d1c16c8`.
- [x] T01.7 engine names/point defaults — evidence: `src/domain/point-identity/engine-names.ts`
  (`^[A-Za-z0-9_]{1,15}$`, deterministic PT-aliasing on collision) + `local-geometry.ts`; tests
  `engine-names.test.ts` (7), `local-geometry.test.ts` (6). Commit `d1c16c8`.
- [x] T01.8 outputs — evidence: `src/domain/outputs/output-plan.ts` (9 components/target + globals,
  idempotent keys, targetAvailabilityPercent); tests `output-plan.test.ts` (4). Commit `d1c16c8`.
- [x] T01.9 repositories/MSW/persistence — evidence: `src/demo/store.ts`, `src/demo/resolve-run.ts`,
  `src/demo/persistence.ts` (localStorage), `src/mocks/handlers.ts` (`/api/v2/*`), `src/api/client.ts`;
  MSW now runs in dev AND the built bundle (`src/main.tsx`). Commit `3daf89e`.
- [x] T01.10 demo engine ported (B-01/B-04) — evidence: `src/domain/engine/demo-engine-core.ts`
  (runDemoAdjustment + Auto Adjust, canonical χ²), Web Worker `src/workers/*`, solver
  `src/domain/math/adjust.ts` (Gauss-Newton, ported from StarNet @ bd4216d). Commit `7aba451`.
  **Graphify graph NOT generated** in this environment (`uv tool install graphifyy` unavailable);
  `PROJECT_MAP.md` remains the authority. Deferred, not falsely claimed.
- [x] T01.11 wizard steps 1–3 — evidence: `WizardPage.tsx` GeneralStep/StationsStep/InstrumentsStep.
  Commit `7dabf47`; E2E in `e2e/journey.spec.ts`.
- [x] T01.12 step 4 targets — evidence: `TargetsStep` + `CommonPointsPanel` + `ConnectivityBadges`
  (network shared-point confirmation, POINT-011). Commit `7dabf47`.
- [x] T01.13 step 5 initialisation — evidence: `InitialisationStep` (local anchor / known references,
  coverage/missing pairs, accept). Commit `7dabf47`.
- [x] T01.14 step 6 adjustment + test epoch — evidence: `AdjustmentStep` (STAR*NET params, χ² policy,
  Test one epoch → `DiagnosticPanel` + `.dat`/`.snproj` previews). Commit `7dabf47`.
- [x] T01.15 steps 7–8 run/output — evidence: `RunStep`, `OutputStep`. Commit `7dabf47`.
- [x] T01.16 step 9 review/create — evidence: `ReviewStep` (blockers/warnings, create inactive /
  create and activate, atomic creation). Commit `7dabf47`.
- [x] T01.17 minimal administration — evidence: `ProcessingsPage`, `ProcessingDetailPage`
  (runs/versions/outputs/reprocess), `RunDetailPage`. Commit `7dabf47` (+ UX coherence `f37a979`).
- [x] T01.18 E2E/a11y/build + requirement→screen matrix — evidence: `e2e/journey.spec.ts` (4
  journeys) + `e2e/shell.spec.ts`; a11y notes and `docs/topographic-adjustment/10-MATRICE-EXIGENCES-ECRANS.md`.
  Commits `a963030`, and this reconciliation. Graphify update deferred as above.

### PR-02..PR-06 — consolidated into PR #4 (owner decision)

Per §Consolidation at the top of this file, PR-02…PR-06 are logical phases delivered in
`feat/pr01-functional-uk-flow`, not separate branches. Their scope is implemented and validated:

- [x] T02.1–T02.6 network & physical points — `synthetic-network.ts`, `local-geometry.ts`,
  `CommonPointsPanel`, connectivity; store test + `journey.spec.ts` network case. Commits `3daf89e`, `7dabf47`.
- [x] T03.1–T03.5 FR/UK & mixed measurements — `fr-monitoring.ts`, `ats35-second-station.ts`
  (raw-prism UK station), 4 atmospheric modes, D-05 weight gate. Commits `3daf89e`, `f37a979`.
- [x] T04.1–T04.6 run/sync/catch-up/output — `time/slots.ts`, `resolve-run.ts`, `store.runSlot`
  (RUN-008 bound), UPSERT publication, `OverviewTab`. Commits `3daf89e`, `7dabf47`.
- [x] T05.1–T05.8 admin/versions/analysis — `ProcessingDetailPage` (immutable versions, reprocess),
  `AnalysisLabPage` (trials, anti-manipulation, candidate). Commits `7dabf47`, `a963030`.
- [x] T06.1–T06.8 STAR*NET preview/QA — `starnet/preview-builder.ts` + golden tests, E2E, a11y,
  handoff docs (`06`, `08`, `09`). Commits `7aba451`, `a963030`, this reconciliation.

**Real BTM engine note:** the production correction formulas and solver move to Python (lambda);
the pure `src/domain/**` layer is the reference contract to mirror — see
`docs/topographic-adjustment/08-ETAT-IMPLEMENTATION-ET-REPRISE.md §6`.

### Blockers and escalations

- 2026-07-14 — pre-code audit applied (`fix/plan-audit-corrections`): B-01..B-05 and H-06
  incorporated; H-01 added as T06.7; H-02..H-05 recorded in T01.9/T05.3/T04.2–T04.3/T06.8;
  D-01/D-02 resolved by controlled porting from `boumeshal-MOB/StarNet` @ `bd4216d`.
