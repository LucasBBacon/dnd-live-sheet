# DND Live Sheet

Live character sheet platform for **Dungeons and Dragons 5e (2014 ruleset)**.

This repository is a Turborepo monorepo with a React frontend, Express + Socket.IO backend, shared rules/contracts package, and a Drizzle/Postgres data layer.

## Current Status

Implemented right now:

- Monorepo workspace with Turborepo + pnpm
- Shared Zod schemas and typed game action contracts
- Shared pure rules functions (ability modifier, proficiency, AC, HP calculations)
- Character persistence in Postgres via Drizzle ORM
- One-character-per-user database guardrail (unique index on active `user_id`)
- REST hydration endpoint for current character
- REST flavor-only update endpoint (no mechanical recalculation pipeline)
- Real-time HP modification flow over Socket.IO
- Local mock authentication (`x-tester-id` header)
- Shared package test suite with Vitest
- Character creation wizard (race, subrace, class, subclass, abilities, background, personality steps)
- `POST /api/character` endpoint — validates wizard payload and persists a new character in an atomic transaction
- Reference data API (`/api/reference`) — serves races, subraces, classes, subclasses, backgrounds, and traits from the database
- Zustand-powered wizard store managing multi-step draft state on the client

Not implemented yet:

- Level-up flow
- Full dice system (digital/manual roll pipelines)
- Broader action set beyond `MODIFY_HP`
- Real authentication (currently mock via `x-tester-id` header)

## Monorepo Layout

- `apps/web`: React + Vite client UI
- `apps/server`: Express API + Socket.IO gateway
- `packages/shared`: Zod schemas, action contracts, pure 5e engine functions, tests
- `packages/database`: Drizzle schema/client/config + seed script

## Prerequisites

- Node.js 20+
- pnpm 10+
- PostgreSQL 15+

## Environment Variables

Create a root `.env` file at the repository root.

Required:

- `DATABASE_URL=postgres://user:password@localhost:5432/dnd_live_sheet`

Optional:

- `PORT=3000` for the server
- `CLIENT_URL=http://localhost:5173` for CORS origin allowlist

Notes:

- `packages/database` and `apps/server` both load `../../.env`, so variables should live in the root `.env` file.

## Getting Started

1. Install dependencies:

```bash
pnpm install
```

2. Push schema to your database:

```bash
pnpm --filter @project/database db:push
```

3. Seed a development character (`dev-user-1`):

```bash
pnpm --filter @project/database db:seed
```

4. Start all dev services:

```bash
pnpm dev
```

Default local URLs:

- Web: `http://localhost:5173`
- API/Socket server: `http://localhost:3000`

## Scripts

Root:

- `pnpm dev` -> run all workspace dev tasks via Turbo
- `pnpm build` -> run workspace build tasks
- `pnpm test` -> run shared package tests via Turbo filter
- `pnpm test:shared` -> run `@project/shared` tests directly

Web (`@project/web`):

- `pnpm --filter @project/web dev`
- `pnpm --filter @project/web build`
- `pnpm --filter @project/web lint`
- `pnpm --filter @project/web preview`

Server (`@project/server`):

- `pnpm --filter @project/server dev`
- `pnpm --filter @project/server build`
- `pnpm --filter @project/server start`

Database (`@project/database`):

- `pnpm --filter @project/database db:push`
- `pnpm --filter @project/database db:generate`
- `pnpm --filter @project/database db:studio`
- `pnpm --filter @project/database db:seed`

## API Overview

All routes are protected by mock auth.

Auth requirement for local testing:

- Header: `x-tester-id: dev-user-1`

### Character routes (`/api/character`)

- `GET /api/character`
Returns the active character row for the authenticated user.

- `POST /api/character`
Validates a `CreateCharacterPayloadSchema` payload from the wizard and inserts a new character in an atomic transaction (character row + class associations + custom trait data).

- `PATCH /api/character/flavor`
Validates a partial `CharacterFlavorSchema` payload and merges it into `flavor_data`.
This endpoint intentionally bypasses mechanical recalculation.

### Reference routes (`/api/reference`)

Serves static reference data for the character creation wizard:

- `GET /api/reference/races` — all races with associated traits
- `GET /api/reference/races/:id` — single race with subraces and traits
- `GET /api/reference/classes` — all classes with level progressions
- `GET /api/reference/classes/:id` — single class with subclasses and progressions
- `GET /api/reference/backgrounds` — all backgrounds with associated traits
- `GET /api/reference/backgrounds/:id` — single background with traits
- `GET /api/reference/traits` — all general traits (skill/tool/language proficiencies)

## Socket Events

Client -> server:

- `join_character` with `characterId`
- `dispatch_action` with shared `GameAction` payload

Server -> client:

- `state_updated` with action type when an action is processed
- `action_error` when payload validation or processing fails

Currently supported action type:

- `MODIFY_HP`

## Testing

Run shared tests:

```bash
pnpm test:shared
```

Coverage:

```bash
pnpm --filter @project/shared test:coverage
```

## Architecture Notes

- Shared contracts (`@project/shared`) are used for runtime validation and compile-time typing across web/server/database boundaries.
- Mechanical state is stored in `engine_data` JSONB while flavor state is stored in `flavor_data` JSONB.
- Top-level indexed columns (for example `current_hp`, `total_level`) are denormalized for efficient querying.
- HP updates run in a transaction with row locking to avoid concurrent update races.

## Near-Term Roadmap

- Expand action reducer pipeline beyond HP changes
- Add level-up workflow
- Add full dice roll handling and validation surface
- Replace mock auth with real identity/session auth
- Wire wizard submission to `POST /api/character` and redirect to the live sheet

