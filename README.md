# DnD Live Sheet

Live character sheet and character builder for **Dungeons & Dragons 5e (2014 rules)**.

This repository is a pnpm + Turborepo monorepo containing:

- `apps/web`: React + Vite client (wizard + live sheet)
- `apps/server`: Express + Socket.IO API/runtime
- `packages/database`: Drizzle schema, client, and seed tooling
- `packages/shared`: shared Zod schemas, API/event contracts
- `packages/engine`: deterministic rules/math engine

## Current architecture in one page

The system follows a **3-layer authority model**:

1. **Core reference layer** (static compendium): canonical core 5e records in PostgreSQL.
2. **Scoped homebrew layer** (mutable reference): campaign and character overrides, also in PostgreSQL.
3. **Operational layer** (live state): transactional character/campaign runtime data.

Reference reads are resolved through precedence:

1. Character-scoped homebrew
2. Campaign-scoped homebrew
3. Core compendium

See `docs/architecture/authority-model.md` for details.

## Documentation map

- `docs/architecture/authority-model.md` - data ownership, precedence, cache design, authorisation model
- `docs/operations/migration-rollout-runbook.md` - migration, rollout, rollback, and release checklist
- `docs/operations/troubleshooting.md` - practical diagnostics and recovery steps
- `apps/web/README.md` - web client architecture and workflow notes

## Prerequisites

- Node.js 20+
- pnpm 10+
- PostgreSQL 15+

## Environment configuration

Create `.env` in repository root:

```env
DATABASE_URL=******localhost:5432/dnd_live_sheet
PORT=3000
CLIENT_URL=http://localhost:5173
```

Notes:

- `DATABASE_URL` is required.
- Web socket client expects `VITE_API_URL` in `apps/web/.env` when needed.

## Quick start

1. Install dependencies:

```bash
pnpm install
```

2. Push schema:

```bash
pnpm --filter @project/database db:push
```

3. Seed core reference data:

```bash
pnpm --filter @project/database db:seed
```

4. Start development:

```bash
pnpm dev
```

Default local endpoints:

- Web: `http://localhost:5173`
- API/socket server: `http://localhost:3000`

## Common scripts

- `pnpm dev` - run workspace development tasks
- `pnpm build` - run workspace builds
- `pnpm test:all` - shared, database, server, and web tests (serial)
- `pnpm test:coverage` - workspace coverage runs

Package-specific examples:

- `pnpm --filter @project/server build`
- `pnpm --filter @project/server test`
- `pnpm --filter @project/server seed:dev-inventory -- --characterId=<uuid>`
- `pnpm --filter @project/web test`
- `pnpm --filter @project/database db:studio`

Dev inventory fixture notes:

- The dev inventory fixture seeds one equipped armour item, one melee weapon, one ranged weapon, and one non-equippable gear item.
- Runtime inventory source of truth is `character_inventory` (operational layer).
- Cached database rule snapshots provide item metadata only and do not own inventory quantities or slot state.

## API summary (current)

Base URL: `http://localhost:3000/api`

### Authentication model (current)

- Character and homebrew routes use middleware auth (`x-tester-id` in local development).
- Reference routes can be called without auth for core-only reads.
- Reference calls with `campaignId` require campaign membership.

### Character routes

- `POST /api/character` - create character transactionally
- `GET /api/character?characterId=<id>` - fetch by query id
- `GET /api/character/:characterId` - fetch by path id

### Reference routes

- `GET /api/reference/races`
- `GET /api/reference/classes`
- `GET /api/reference/classes/:id/subclasses`
- `GET /api/reference/classes/:id/timeline`
- `GET /api/reference/backgrounds`
- `GET /api/reference/traits`
- `GET /api/reference/traits/:id`
- `GET /api/reference/items`
- `GET /api/reference/version`

Optional scoped query parameters:

- `campaignId=<uuid>`
- `characterId=<uuid>` (requires `campaignId`)

### Homebrew routes

- `POST /api/homebrew/traits`
- `PATCH /api/homebrew/traits/:id`
- `POST /api/homebrew/traits/:id/publish`
- `POST /api/homebrew/traits/:id/archive`
- `POST /api/homebrew/items`
- `PATCH /api/homebrew/items/:id`
- `POST /api/homebrew/items/:id/publish`
- `POST /api/homebrew/items/:id/archive`

All homebrew writes require campaign role `owner` or `dm`.

## Sockets

The server now uses a single gateway socket pipeline.

The room-join contract is `RoomJoinPayload` (`campaignId`, optional `characterId`) and campaign membership is enforced before scoped mutations.

## Testing and quality checks

Run full tests:

```bash
pnpm test:all
```

Run server build:

```bash
pnpm --filter @project/server build
```

## Contribution guidance

When adding new behaviour:

1. Keep database as source of truth for reference and operational data.
2. Add schema-level constraints first, then API-level guards.
3. Thread campaign/character scope end-to-end (request, resolver, cache key, client query key).
4. Invalidate targeted cache entries on homebrew mutation lifecycle events.

If you are new to the repository, start with:

1. `docs/architecture/authority-model.md`
2. `docs/operations/migration-rollout-runbook.md`
3. `apps/web/README.md`
