# Dependency security — `npm audit`

Recorded for PR-01 (audit item 9). Re-run these two commands after any dependency change.
**`npm audit fix --force` was deliberately NOT run** — every fix is a breaking major bump of
dev-only tooling and would change the toolchain outside this bounded task.

## Commands

```bash
npm audit --omit=dev   # production dependencies only (what ships to Vercel)
npm audit --json       # full tree, machine-readable
```

## Result (2026-07-14, this branch)

### Production dependencies — clean

```
npm audit --omit=dev  →  found 0 vulnerabilities
```

Nothing that ships in the browser bundle is affected. The deployed Vercel mock-up carries no
known-vulnerable dependency.

### Full tree (incl. devDependencies) — 6 advisories, all dev-only

| Package | Severity | Direct | Scope | Fix |
|---|---|---|---|---|
| `vitest` | critical | yes | test runner (dev) | `vitest@4` (semver-major) |
| `@vitest/mocker` | moderate | no (via vitest) | test runner (dev) | `vitest@4` |
| `vite-node` | moderate | no (via vitest) | test runner (dev) | `vitest@4` |
| `vite` | high | yes | build/dev server (dev) | `vite@8` (semver-major) |
| `esbuild` | moderate | no (via vite) | build (dev) | `vite@8` |
| `xlsx` | high | yes | build-time converter only (dev) | none available |

## Assessment and decision

- **`vitest` / `vite` / `vite-node` / `@vitest/mocker` / `esbuild`** are test- and build-time
  tooling. They never execute in the shipped application and are not exposed to untrusted input
  in CI (which builds only this repository). The only remediation is a major-version upgrade
  (`vite@8`, `vitest@4`); that is a toolchain migration, out of scope for this correction task
  and to be scheduled deliberately with its own validation.
- **`xlsx`** (SheetJS) is a `devDependency` used solely by `scripts/convert-ats34.mjs` at build
  time to convert the committed ATS34 workbook into the JSON fixture. It never reaches the
  browser bundle (`npm audit --omit=dev` is clean) and only ever processes one input file: a
  versioned, approved development fixture committed to this repository — never supplied by an
  end user and never loaded by the running application (DATA-006). The converter records the
  workbook's SHA-256 hash for provenance/traceability in the generated fixture's `meta` block
  (audit B-02); this is a reproducibility record, not a security control, and is not a claim
  that the input is verified or authenticated against a trusted signature. The
  prototype-pollution / ReDoS advisories require a malicious workbook, which is not a realistic
  threat for a single committed, reviewed development fixture. No upstream fix is available; no
  user-facing exposure exists. The existing deterministic-regeneration test
  (`scripts/__tests__/convert-ats34.integration.test.mjs`) is unchanged and continues to assert
  byte-identical output.

**Net exposure to the deployed application: none.** The advisories are confined to local/CI
tooling. Upgrades are tracked as follow-up, not applied in this bounded task.
