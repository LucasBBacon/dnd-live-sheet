# Troubleshooting guide

This guide covers common failure modes observed in the repository and the quickest reliable paths to diagnosis.

## 1) `DATABASE_URL is missing`

Symptoms:

- server startup fails;
- tests importing database client fail early.

Checks:

1. Confirm root `.env` exists.
2. Confirm `DATABASE_URL` is defined.
3. Confirm process is launched from repository context expected by package env loading.

## 2) Scoped reference call returns 401/403

Symptoms:

- `/api/reference/*?campaignId=...` fails with auth or forbidden error.

Checks:

1. Confirm `x-tester-id` is present (local auth mode).
2. Confirm user has campaign membership row.
3. Confirm `characterId` is not passed without `campaignId`.

Remediation:

- add membership in `campaign_members` for local testing;
- use campaign URL parameter in wizard to keep scope coherent.

## 3) Homebrew update does not appear in reference read

Symptoms:

- write succeeds but wizard/live-sheet still shows old data.

Checks:

1. Confirm record is `isPublished = true` when expecting visible reads.
2. Confirm `ownerCampaignId` matches read scope.
3. Confirm `ownerCharacterId` rules align with scoped character context.
4. Confirm `supersedesId` points to intended canonical record.

Notes:

- cache invalidation is version-based; stale snapshot should refresh on next read.

## 4) Character creation rejected with campaign errors

Symptoms:

- `POST /api/character` returns campaign access error.

Checks:

1. If payload contains `campaignId`, user must be campaign member.
2. If payload omits `campaignId`, server auto-provisions or resolves default membership campaign.
3. Verify UUID format for `campaignId`.

## 5) Socket events ignored or emit action errors

Symptoms:

- events are not propagated to other clients;
- `action_error` emits from server.

Checks:

1. Confirm room join payload contains `campaignId`.
2. Confirm socket auth includes `userId`.
3. Confirm user has campaign membership.
4. Confirm event payload `characterId` belongs to joined campaign.
5. Confirm the gateway socket runtime is running and that clients emit `SOCKET_EVENTS.ROOM_JOIN` before scoped mutations.

## 6) Wizard shows incorrect reference data after changing campaign

Symptoms:

- stale options remain after switching campaign context.

Checks:

1. Confirm wizard URL includes `campaignId` query param.
2. Confirm React Query key includes campaign scope (for affected query).
3. Confirm endpoint built with scoped helper, not raw string path.

## 7) Build errors around strict optional types

Symptoms:

- TypeScript errors referencing `exactOptionalPropertyTypes`.

Checks:

1. Avoid passing explicit `undefined` for optional fields unless type allows it.
2. Build update payloads incrementally and only include present fields.
3. For route params, guard and narrow before ORM predicates.

## 8) Server tests fail due to new route imports

Symptoms:

- bootstrap tests fail after adding route modules.

Checks:

1. Ensure route module is mocked in `apps/server/src/__tests__/index.test.ts`.
2. Ensure expected `app.use` call order in assertions includes new route registration.

## Operational commands quick reference

```bash
# full regression
pnpm test:all

# server build
pnpm --filter @project/server build

# inspect current schema visually
pnpm --filter @project/database db:studio

# apply schema changes locally
pnpm --filter @project/database db:push
```

## Incident notes template

When logging an incident, capture:

1. timestamp and environment;
2. failing endpoint or socket event;
3. request scope (`campaignId`, `characterId`, user id);
4. expected behaviour vs observed behaviour;
5. mitigation applied and residual risk.
