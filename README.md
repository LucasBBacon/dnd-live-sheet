# DND Live Sheet

Live character sheet platform for **Dungeons & Dragons 5e (2014 ruleset)**.

This repository is a **pnpm + Turborepo monorepo** with:

- React + Vite web app
- Express + Socket.IO server
- Shared contracts and schemas package
- Dedicated engine package for rules/math
- Drizzle + PostgreSQL data layer

## Current Project State

### Implemented

- Monorepo workspace orchestration with Turbo
- Shared Zod schemas and action contracts in `@project/shared`
- Engine calculators and combat/ability utilities in `@project/engine`
- PostgreSQL persistence with Drizzle ORM in `@project/database`
- Character creation flow in web app (multi-step wizard)
- `POST /api/character` to create a character transactionally
- `GET /api/character` hydration endpoint
- Extensive reference API (`/api/reference/*`) for races/classes/backgrounds/traits/items
- Socket action dispatch pipeline with runtime schema validation
- Mock auth middleware using `x-tester-id`
- Vitest test suites across workspaces

### In Progress / Known Gaps

- Real auth is not integrated yet (currently mock header auth)
- Action surface is currently centered on `MODIFY_HP`
- Level-up and full dice workflows are still pending
- Web app entrypoint currently renders the character creation wizard (live sheet routing is not the default path yet)
- Wizard review submission currently targets `/api/characters` in client code, while server exposes `/api/character`

## Monorepo Layout

```text
apps/
	web/       React + Vite + React Query + Zustand
	server/    Express 5 + Socket.IO API gateway
packages/
	shared/    Zod schemas, shared event constants, action contracts
	engine/    Rules/calculators/pipeline for derived gameplay logic
	database/  Drizzle schema/client/config + seed pipeline + reference JSON data
```

## Tech Stack

- Runtime: Node.js, TypeScript
- Frontend: React 19, Vite, TanStack Query, Zustand
- Backend: Express 5, Socket.IO, Zod
- Data: PostgreSQL, Drizzle ORM, drizzle-kit
- Testing: Vitest (+ coverage via `@vitest/coverage-v8`)
- Build Orchestration: Turborepo

## Prerequisites

- Node.js 20+
- pnpm 10+
- PostgreSQL 15+

## Environment Configuration

Create a root `.env` file:

```env
DATABASE_URL=postgres://user:password@localhost:5432/dnd_live_sheet
PORT=3000
CLIENT_URL=http://localhost:5173
```

Notes:

- `DATABASE_URL` is required.
- `PORT` and `CLIENT_URL` are optional (defaults are used in server code).
- Database package loads env from the repository root using `../../.env`.
- If you wire up the optional web socket service path that expects a Vite env var, set `VITE_API_URL` in `apps/web/.env`.

## Quick Start

1. Install dependencies:

```bash
pnpm install
```

2. Push schema to Postgres:

```bash
pnpm --filter @project/database db:push
```

3. Seed reference data:

```bash
pnpm --filter @project/database db:seed
```

4. Start all dev tasks:

```bash
pnpm dev
```

Default local endpoints:

- Web: `http://localhost:5173`
- API + Socket server: `http://localhost:3000`

## Scripts

### Root

- `pnpm dev` -> run workspace `dev` tasks via Turbo
- `pnpm build` -> run workspace `build` tasks via Turbo
- `pnpm test` -> run workspace `test` tasks via Turbo
- `pnpm test:shared` -> run only `@project/shared` tests
- `pnpm test:all` -> run shared, database, server, and web tests serially
- `pnpm test:coverage` -> run coverage in shared, database, server, and web

### Web (`@project/web`)

- `pnpm --filter @project/web dev`
- `pnpm --filter @project/web build`
- `pnpm --filter @project/web lint`
- `pnpm --filter @project/web preview`
- `pnpm --filter @project/web test`
- `pnpm --filter @project/web test:coverage`

### Server (`@project/server`)

- `pnpm --filter @project/server dev`
- `pnpm --filter @project/server build`
- `pnpm --filter @project/server start`
- `pnpm --filter @project/server test`
- `pnpm --filter @project/server test:coverage`

### Database (`@project/database`)

- `pnpm --filter @project/database db:push`
- `pnpm --filter @project/database db:generate`
- `pnpm --filter @project/database db:migrate`
- `pnpm --filter @project/database db:studio`
- `pnpm --filter @project/database db:seed`
- `pnpm --filter @project/database test`

### Engine (`@project/engine`) and Shared (`@project/shared`)

- `pnpm --filter @project/engine test`
- `pnpm --filter @project/shared test`

## API Surface (Current)

Base URL: `http://localhost:3000/api`

Auth behavior:

- `/api/character/*` uses mock auth middleware.
- `/api/reference/*` is currently public.
- Mock auth header for local dev: `x-tester-id: dev-user-1`

### Character Routes

- `GET /api/character`
	- Returns authenticated user character payload.
- `POST /api/character`
	- Validates `CreateCharacterPayloadSchema`
	- Creates character + class row + custom traits + starting equipment in a transaction
	- Returns `201` with created `characterId`

### Reference Routes

- `GET /api/reference/races`
- `GET /api/reference/classes`
- `GET /api/reference/classes/:id/subclasses`
- `GET /api/reference/classes/:id/timeline?subclassId=...`
- `GET /api/reference/backgrounds`
- `GET /api/reference/traits`
- `GET /api/reference/traits?category=skills|tools_and_languages`
- `GET /api/reference/traits/:id`
- `GET /api/reference/items?q=...&limit=...&offset=...`

## Socket Events (Active Controller)

Client -> server:

- `join_character` with `characterId`
- `dispatch_action` with validated `GameAction`

Server -> client:

- `state_updated` with action type
- `action_error` when validation or processing fails

Currently supported action type:

- `MODIFY_HP`

## Testing

Run the full workspace test suite:

```bash
pnpm test:all
```

Run full coverage:

```bash
pnpm test:coverage
```

Run one package only:

```bash
pnpm --filter @project/server test
```

## Architecture Notes

- `@project/shared` is the contract boundary for schemas and event constants.
- `@project/engine` houses gameplay calculations and reusable combat/stat logic.
- `@project/database` seed process ingests JSON reference files and hydrates relational tables.
- Seeding now auto-generates placeholder traits when source data references missing trait IDs (to preserve foreign-key integrity).
- If local workspace links are stale for `@project/*` packages, rerun:

```bash
corepack pnpm install
```

## Data and Seeding Notes

- Seed data lives in `packages/database/data/*.json`.
- Seed includes ETL-style transform/normalization logic before inserts.
- Race data is upserted (existing rows can be refreshed).
- Trait relationships for classes, subclasses, feats, races, subraces, and backgrounds are resolved through junction tables.

## Near-Term Roadmap

- Finish wizard -> server submission endpoint alignment
- Route successfully created characters into the live sheet experience
- Expand action reducer support beyond HP
- Add real auth/session identity pipeline
- Implement richer dice and level-up systems

