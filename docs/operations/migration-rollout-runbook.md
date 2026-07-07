# Migration and rollout runbook

## Audience

Maintainers preparing schema, runtime, or rollout changes affecting reference authority, homebrew, or scoped reads.

## Objectives

1. Roll out safely with predictable behaviour.
2. Preserve data integrity through migration.
3. Maintain service availability and rollback readiness.

## Pre-deployment checklist

1. Ensure working tree is clean and branch is up to date.
2. Confirm test suites pass:
   - `pnpm test:all`
   - `pnpm --filter @project/server build`
3. Confirm migration intent:
   - additive vs destructive;
   - data backfill requirements;
   - foreign key impact.
4. Confirm release notes include:
   - behavioural changes;
   - API contract updates;
   - operator actions.

## Database migration workflow

## 1) Generate migration artefacts

```bash
pnpm --filter @project/database db:generate
```

Review generated SQL before applying.

## 2) Apply schema changes

For local/staging exploratory updates:

```bash
pnpm --filter @project/database db:push
```

For tracked migration workflow:

```bash
pnpm --filter @project/database db:migrate
```

## 3) Seed or backfill as needed

```bash
pnpm --filter @project/database db:seed
```

Backfill guidelines:

- preserve existing primary keys;
- avoid lossy transforms;
- produce deterministic values for synthetic ownership rows.

## 4) Post-migration validation

Validate:

- row counts for critical tables;
- expected `NOT NULL` and FK constraints;
- homebrew scope metadata consistency (`sourceType`, ownership columns).

Minimum smoke checks:

1. create character in campaign context;
2. create homebrew trait/item in campaign context;
3. publish homebrew and verify scoped reference read reflects update.

## Rollout sequence

Recommended order:

1. Deploy schema migrations.
2. Deploy server.
3. Deploy web.
4. Run smoke checks.

Reasoning:

- server/web code expects schema availability;
- web scoped calls rely on server resolver behaviour.

## Rollback plan

## Fast rollback (application only)

Use when schema is backwards compatible:

1. redeploy previous server/web image;
2. clear/restart processes to drop stale in-memory caches;
3. run smoke checks.

## Full rollback (schema involved)

Use only when required and tested:

1. stop write traffic if feasible;
2. restore from known-good backup or run vetted down migration;
3. redeploy previous server/web;
4. verify data integrity and API behaviour.

## Risk register for this repository

1. **Scoped cache divergence**
   - Mitigation: versioned scoped snapshots and explicit invalidation on homebrew writes.

2. **Scope authorisation gaps**
   - Mitigation: campaign membership checks on scoped reads and role checks on homebrew writes.

3. **Override precedence regressions**
   - Mitigation: keep precedence logic centralised in resolver service; avoid route-level overrides.

4. **Legacy path reintroduction**
   - Mitigation: remove obsolete endpoint helpers and keep query-building centralised.

## Release checklist template

Use this checklist in each release PR:

1. Schema migration generated and reviewed.
2. Backfill plan documented (or explicit “not required”).
3. Server tests/build green.
4. Web tests/build green.
5. Manual scoped-read/homebrew smoke checks completed.
6. Rollback steps validated for this release.
7. Documentation updated (architecture + operations + troubleshooting).
