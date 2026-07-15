# Claude Code instructions — BTM Topographic Adjustment mock-up

## Mission

Build a working, modern mock-up that validates the complete user workflow and maximises reusable
code for later BTM integration. The GitHub repository is the source of truth. Vercel is only the
owner-controlled presentation environment.

## Mandatory reading and context economy

NEVER read `src/demo/fixtures/ats34.generated.json` in full (≈1.8 MB, 66k lines). Inspect it
only through targeted commands (`head`, `python -c`, `jq`, grep on `meta`) or through
`src/demo/fixtures/contract.ts`. The same applies to any `*.generated.json` fixture.

At the start of a new session or task:

1. Read `/PROJECT_MAP.md`.
2. When `graphify-out/graph.json` exists, use a scoped Graphify query before Glob/Grep or broad file reads.
   Before the first graph is generated, use the Project Map and only its cited sources.
3. Read only the code and detailed specifications relevant to the requested module.
4. Verify Graphify `INFERRED` relationships against real source files before editing.
5. Never reread the entire specification unless explicitly asked to perform a global audit.

Useful commands:

```text
/graphify query "<specific architecture or behaviour question>"
/graphify explain "<type, component or use case>"
/graphify path "<concept A>" "<concept B>"
```

The authority order in `PROJECT_MAP.md` always overrides generated graph summaries.

## Git autonomy

You are authorised to:

- create appropriately named branches;
- make coherent commits;
- push your branches to GitHub;
- open, update and mark Pull Requests ready for review;
- address review comments and CI failures on your own branches;
- create stacked PRs when useful.

You are not authorised to:

- push directly to `main`;
- merge or close a Pull Request on behalf of the owner;
- deploy to Vercel or any external environment;
- create, reveal or modify GitHub/Vercel secrets;
- delete branches owned by another contributor;
- rewrite shared history;
- make external product decisions not present in the specification.

For stacked PRs, state the base branch, dependencies and merge order in every PR description.

## Functional baseline contract

The initial UK/FR/network vertical slice is merged. Every subsequent PR must keep the complete
nine-step journey and Administration/Analysis surfaces working; do not replace them with a
scaffold. Use the current status and acceptance scope in `PROJECT_MAP.md`.

Do not display controls for deferred features unless they work. A compact message describing a
later capability is preferable to a dead button.

You may make routine technical decisions that comply with the specification without waiting for
approval. Ask only when a missing decision materially changes user behaviour, data semantics,
topographic correctness, security or the future BTM contract.

## Architecture rules

- Keep domain logic pure and independent from React, MSW, IndexedDB and filesystem access.
- Put all I/O behind repository/gateway interfaces.
- Keep DemoRepository and DemoAdjustmentEngine replaceable by BTM adapters.
- Keep reusable feature code compatible with the BTM React 17 runtime.
- Use MUI 5, React Router v6, TanStack Query v5, react-hook-form, Zod and react-i18next.
- Do not introduce Tailwind, feature Redux, Formik, Yup or Axios.
- Do not hardcode business values inside components.
- Parse presets and payloads with schemas.
- Keep units explicit in types, labels, tables and generated previews.

## Product guardrails

- No raw observation upload in the user journey.
- ATS34 is build-time/demo data and single-station only.
- No automatic shared-point mapping from names.
- No global EDM authority when measurement setups vary by target.
- No prefilled known coordinates unless actually provided.
- Use initialisation medians and show coverage/missing pairs.
- Keep source epochs, output slots and config validity separate.
- Never apply prism/atmospheric corrections twice.
- Never use `.SCALE` as the T/P atmospheric correction.
- Never use the Python or browser preview solver as a production/certified STAR*NET replacement.
- Output variables remain stable and recalculation simulates UPSERT.
- Do not add S3, CoMeT or reuse `Theodolite`. The stateless Python Lambda adapter is allowed for
  preparation/initialisation/Analysis calculations; STAR*NET itself stays on Windows.

## Implementation workflow

For each PR:

1. Query Graphify and read the relevant source documents.
2. Post a concise plan in the PR description or progress note.
3. Implement domain rules and unit tests before/with UI.
4. Integrate the vertical user flow through repositories.
5. Test empty/loading/error/success and keyboard use.
6. Run typecheck, targeted tests, E2E and production build.
7. Update affected documentation and `PROJECT_MAP.md` status when the milestone is complete.
8. Run `/graphify . --update` for structural changes.
9. Push and open/update the PR with evidence.

## Model routing

When `/IMPLEMENTATION_PLAN.md` exists and is marked approved, treat it as the execution index:

- a high-capability planning model owns architecture, sequencing, risk analysis and plan updates;
- an economical execution model implements one bounded plan slice at a time;
- the execution model must not redesign the architecture or reread all specifications;
- it reads `PROJECT_MAP.md`, the relevant plan slice, a scoped Graphify result and only the cited files;
- a contradiction between plan and source is escalated instead of silently resolved;
- completed tasks, tests and commit/PR references are checked off in the plan without rewriting its
  architectural decisions.

The complete planner and executor prompts are in
`docs/topographic-adjustment/07-STRATEGIE-MODELES-PLAN-EXECUTION.md`.

## Required PR evidence

Every PR description includes:

- user-visible outcome first;
- scope and intentionally deferred items;
- business rule IDs implemented;
- main files/modules changed;
- tests and exact commands run;
- screenshots or preview instructions for UI changes;
- fixture/simulation disclosures;
- risks, open decisions and dependency/base information.

Do not claim success when typecheck, tests or build failed. Report the exact blocker.

## Graphify lifecycle

When Graphify is available in the development environment:

```bash
uv tool install graphifyy
graphify install --project
```

Build the first graph with `/graphify .`. Commit `graphify-out/GRAPH_REPORT.md` and
`graphify-out/graph.json`. `graph.html` is optional. Do not commit Graphify caches or converted
attachments. Regenerate after structural PRs, not after trivial visual changes.

## Completion boundary

Claude finishes by opening/updating PRs. The repository owner alone merges PRs and deploys to
Vercel. Never continue into a production BTM implementation unless explicitly asked in a separate
phase.
