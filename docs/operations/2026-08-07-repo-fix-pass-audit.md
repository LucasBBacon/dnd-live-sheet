# Repo Fix-Pass Audit - 2026-08-07

## Status update (implemented)

As of 2026-08-07 (post-remediation), the Phase 1 functional-slate baseline has been restored and validated:

- `pnpm check:hygiene` passes.
- `pnpm -r typecheck` passes across all workspace packages.
- `pnpm test:all` passes:
  - shared: 8 files, 113 tests
  - database: 5 files, 58 tests
  - server: 15 files, 197 tests
  - web: 6 files, 132 tests
- Lint coverage has been expanded beyond web:
  - lint scripts now exist in server/shared/engine/database/web.
  - `pnpm -r lint` passes.
- CI quality gates are now explicit and parallel in `.github/workflows/ci.yml`:
  - Hygiene (`pnpm check:hygiene`)
  - Lint (`pnpm lint`)
  - Typecheck (`pnpm -r typecheck`)
  - Tests (`pnpm test:all`)

Remaining strategic work is now primarily Phase 3 drift reduction and CI policy hardening, rather than baseline break-fix.

## Status update (phase 3 in progress)

Additional progress completed after baseline restoration:

- First Phase 3 web drift slice landed:
  - wizard flow now uses the canonical engine `Ability` type directly instead of a local alias.
  - this reduces local type drift in `apps/web/src/store/wizardStore.ts` and related wizard ability components.
- Node baseline upgraded and aligned:
  - project engines now require Node 24+ (`package.json`).
  - CI uses Node 24 (`.github/workflows/ci.yml`).
  - local version manager baseline added via `.nvmrc` (`24`).
  - README prerequisites updated to Node 24+.

Validation after these changes:

- `pnpm -r lint` passes.
- `pnpm -r typecheck` passes.
- `pnpm --filter @project/web test --run` passes.

## Closure checklist (final)

The original fix-pass action items are now complete:

- [x] Run repository health checks
- [x] Inspect web code for stale patterns
- [x] Rank issues by remediation priority
- [x] Write markdown fix-pass report

## Post-remediation priority slate (current)

With baseline gates restored, these are the next priority issues:

1. **P1 - Web drift slice 2 (domain coupling in sheet store)**
  - `apps/web/src/store/characterSheetStore.ts` still owns broad mixed responsibilities (inventory placement, rules projection, socket writes, and state orchestration).
  - Recommended next move: extract pure derivation helpers and keep the store focused on state transitions + orchestration.

2. **P1 - Web drift slice 3 (trait compilation path hardening)**
  - `apps/web/src/components/sheet/TraitWidget.tsx` performs local trait-to-runtime projection logic that should remain explicitly aligned with shared schema defaults.
  - Recommended next move: move projection into a reusable helper with focused tests for required/forbidden state defaults and id generation stability.

3. **P2 - Cross-package contract test seam (web -> shared/engine)**
  - Add targeted tests around route hydration and derived-stat inputs at:
    - `apps/web/src/pages/characterSheetRouteData.ts`
    - `apps/web/src/hooks/useCharacterStats.ts`
  - Goal: prevent future contract drift when shared/engine schemas evolve.

4. **P2 - Residual architecture debt from redundancy audit**
  - `REDUNDANCY_AUDIT.md` still flags larger cleanup tracks (for example server socket-path consolidation and generated artefact hygiene policy enforcement).
  - Treat these as scheduled follow-on workstreams, not blockers for the current functional baseline.

## Scope and intent

This audit captures the current issues preventing a reliable development baseline across the repository, with priority ranking and remediation guidance.

Goal: reach a functional slate (hygiene clean, typecheck clean, linting enforced, tests stable) before implementing further features.

## What was run

- `pnpm check:hygiene`
- `pnpm -r lint`
- `pnpm -r typecheck`
- `pnpm test:all`
- `pnpm --filter @project/web typecheck`
- `pnpm --filter @project/web test --run`
- `pnpm --filter @project/server typecheck`
- `pnpm --filter @project/shared test --run`
- `pnpm --filter @project/server test --run`
- `pnpm --filter @project/database test --run`
- `pnpm --filter @project/engine test --run`

## Executive summary

- Build and full test pipeline is blocked at hygiene.
- Type safety is not in a shippable state: web and server typechecks fail with significant error counts.
- Shared package has known failing tests (11), so schema contracts are currently unstable.
- Web lint passes, but lint coverage is incomplete across the monorepo (only web has a lint script).
- Runtime tests in server, engine, and database pass, which suggests most critical instability is compile-time/schema-contract drift rather than immediate runtime breakage.

## Priority-ranked issues

| Priority | Area | Issue | Evidence | Impact | Recommended remediation |
| --- | --- | --- | --- | --- | --- |
| P0 | Repo hygiene | Hygiene gate fails due to retired path reintroduced | `scripts/check-source-hygiene.mjs` retired path list includes `packages/shared/src/schemas/actions.ts`; `pnpm check:hygiene` fails on that path | Blocks `build` and `test:all` pipelines immediately | Decide whether `actions.ts` is canonical or truly retired, then align hygiene rule and codebase. If canonical, remove it from retired list; if retired, migrate imports and delete file. |
| P0 | Shared schemas/tests | Shared tests fail (11 failures), including missing schema exports and changed defaults | `pnpm --filter @project/shared test --run` fails; `character.test.ts` references undefined schemas (`ClassProgressionSchema`, `CharacterEngineSchema`, `BaseCharacterSchema`) and equality assertions now mismatch due to defaulted fields | Shared contracts are the foundation for web/server/engine; instability cascades into all packages | Repair shared tests first: update assertions to account for schema defaults and either restore or replace removed schema exports. Treat shared as release-blocking. |
| P0 | Type safety (frontend) | Web typecheck fails with 22 errors, many in core sheet/wizard paths | `pnpm --filter @project/web typecheck` errors in `DashboardLayout.tsx`, `TraitWidget.tsx`, `useCharacterStats.ts`, `characterSheetRouteData.ts` | Frontend cannot be considered stable; refactors are unsafe while compile errors persist | Run a dedicated web type-reconciliation pass against current engine/shared APIs. Fix API drift in trait and stats flows first, then clean remaining implicit-any and snapshot typing errors. |
| P0 | Type safety (backend) | Server typecheck fails with 37 errors | `pnpm --filter @project/server typecheck` shows extension import issues in tests, optional typing issues in import pipeline, and strictness errors | Server package is not in a strict compilable state, increasing regression risk even if runtime tests currently pass | Apply a server strictness pass: (1) fix NodeNext import extensions in tests, (2) resolve exact-optional-property typing in import pipeline, (3) fix rollback never-type branches, (4) update vitest coverage config schema. |
| P1 | Monorepo quality controls | Linting is only configured for web | Search across package manifests: only `apps/web/package.json` has a `lint` script | Non-web packages can accumulate style and correctness issues unseen until typecheck/runtime | Add lint scripts for `apps/server`, `packages/shared`, `packages/engine`, `packages/database`; create a root lint command and enforce in CI with `--max-warnings=0`. |
| P1 | Web architecture drift | Web uses drifted calculator/runtime path versus current engine direction | Existing project plan note states `apps/web` still runs its own drifted calculator path and is out-of-scope in prior spec | Ongoing feature work in web risks compounding divergence from canonical engine behaviour | After typecheck recovery, schedule a focused web alignment pass to consume engine-derived results and reduce duplicated domain logic in web store/hooks. |
| P2 | Pipeline observability | Recursive workspace commands stop on first failure, reducing issue visibility | `pnpm -r typecheck` stops early at first package failure; `test:all` blocked by hygiene before package-level tests | Slower fix cycles; hidden failures emerge late | Add a temporary audit script that runs package checks independently and aggregates status, then revert to strict fail-fast once baseline is green. |

## Detailed findings by package

### apps/web

- Lint: passes (`eslint .`), no reported issues.
- Tests: pass (6 files, 132 tests).
- Typecheck: fails (22 errors).

Most significant web errors:

- API drift with engine/shared types:
  - `TraitBridge` no longer exported from `@project/engine` (`TraitWidget.tsx`).
  - `DerivedAbility`/stat calculator call signatures no longer match expected usage (`useCharacterStats.ts`).
  - `RuleSnapshot` transport shape mismatches strong typing (`characterSheetRouteData.ts`).
- Local type hygiene issues:
  - Implicit `any` callback parameters (`TraitWidget.tsx`).
  - Property assumptions invalid against current types (`DashboardLayout.tsx`, `TraitWidget.tsx`).

Assessment: web remains the largest concentration of functional type breakage, consistent with the expectation of an outdated frontend integration layer.

### apps/server

- Tests: pass (15 files, 197 tests).
- Typecheck: fails (37 errors).

Dominant server typecheck clusters:

- ESM extension compliance in tests under NodeNext module resolution (`.js` extension requirements).
- `exactOptionalPropertyTypes` incompatibilities in import pipeline lore payloads.
- Transaction-vs-database typing mismatch in import pipeline helper signatures.
- A few strict logic narrowing issues in rollback pipeline and engine shared dependencies.
- Vitest coverage config typing mismatch (`lines` property shape).

Assessment: runtime path is presently passing tests, but compile-time discipline has regressed; this is a maintainability and release confidence risk.

### packages/shared

- Tests: fail (11 failed, 149 passed).
- Typecheck: fails (errors include missing exports in tests and vitest config coverage typing mismatch).

Dominant shared failures:

- Tests assert exact object equality where schema defaults now inject fields (`requiredStates`, `forbiddenStates`, `requiresAttunement`, `weight`).
- Tests reference schemas that appear removed/renamed.

Assessment: shared is the contract hub; this is a foundational blocker and should be repaired before broad package cleanups.

### packages/engine and packages/database

- Tests pass (`engine`: 465 tests, `database`: 58 tests).
- Typecheck status was not run in this pass for both packages independently, but transitive errors surfaced via web/server runs (for example in engine files).

Assessment: runtime looks healthy; compile strictness still needs final confirmation once shared/server/web drift is resolved.

## Critical remediation plan (recommended order)

### Phase 1 - Unblock gates (P0 only)

1. Resolve hygiene retired-path contradiction (`actions.ts` decision).
2. Fix shared contract layer:
   - restore/replace missing schema exports used by tests, or update tests to new canonical exports;
   - update equality assertions to match current schema defaulting behaviour.
3. Fix web typecheck against current engine/shared contracts.
4. Fix server typecheck strictness and NodeNext import extensions.

Exit criteria:

- `pnpm check:hygiene` passes.
- `pnpm --filter @project/shared test --run` passes.
- `pnpm --filter @project/web typecheck` passes.
- `pnpm --filter @project/server typecheck` passes.

### Phase 2 - Quality control hardening (P1)

1. Add lint scripts to all packages and root lint orchestration.
2. Standardise lint config and strictness thresholds.
3. Add CI gating for lint + typecheck + hygiene + tests.

Exit criteria:

- `pnpm -r lint` checks all relevant packages (not only web).
- CI fails on any lint/type/hygiene regression.

### Phase 3 - Drift reduction and resilience (P1/P2)

1. Execute web alignment to canonical engine-derived computation paths.
2. Add cross-package contract tests for shared -> engine -> web critical DTOs.
3. Keep temporary issue-aggregation script until two consecutive green runs on main.

Exit criteria:

- No known drift hotspots in web stats/trait/snapshot consumption.
- At least two clean full-repo runs with all gates green.

## Suggested ownership split

- Shared contract rehabilitation: platform/domain owner.
- Web type reconciliation and drift cleanup: frontend owner with engine support.
- Server strict typing and module-resolution cleanup: backend owner.
- Tooling/CI lint hardening: dev experience/tooling owner.

## Risk notes if feature work proceeds before fix pass

- New feature branches will likely stack on unstable contracts, increasing merge conflicts and rework.
- Compile-time breakages can mask real feature defects and slow validation.
- Missing lint gates outside web will continue allowing quality regressions to enter main unnoticed.

## Final recommendation

Do not start new feature implementation yet. Complete Phase 1 fully, then Phase 2 baseline hardening, and only then resume feature delivery.
