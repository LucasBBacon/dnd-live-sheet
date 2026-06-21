# DND Live Sheet

Live character sheet platform for **Dungeons and Dragons 5e (2014 ruleset)**.

This repository is a Turborepo monorepo that will provide:

- A guided character creation wizard
- A level-up progression flow
- A live, reactive character sheet
- Strict 5e (2014) mechanics and validation
- Real-time cascading mechanical updates from player actions
- Flavor field updates that are persisted without triggering recalculations
- Single character per user (initial release constraint)
- Dual dice support: digital rolls and manual physical roll input
- Dice range gating to prevent invalid roll values

## Project Scope

The platform separates **mechanical state** from **flavor state**:

- Mechanical state (stats, classes, equipment, conditions, HP, etc.) drives derived calculations.
- Flavor state (eye color, alignment, backstory, etc.) is saved directly and does not trigger the event cascade.

This allows the app to remain fast and deterministic for gameplay logic while still supporting rich character personalization.

## Core Product Requirements

1. Character creation flow wizard
2. Character level-up flow
3. Live character sheet functionality
4. DND 5e 2014 ruleset applied
5. Automated cascading updates to user actions
6. Flavor actions saved directly with no cascade events
7. One character per user for now (expandable later)
8. Digital dice rolls or manual physical roll inputs
9. Roll validation that enforces expected dice ranges

## Monorepo Structure

- `apps/web`: React + Vite frontend
- `apps/server`: Node/Express backend APIs + realtime entrypoints
- `packages/shared`: Shared Zod contracts, types, and pure 5e rules logic
- `packages/database`: Drizzle schema/client and persistence layer

## Technical Direction

### Rules Engine Philosophy

- Stateless and deterministic pure functions for 5e calculations
- Shared library consumed by both server and client where appropriate
- Validation-first API contracts (Zod) at all trust boundaries

### Flavor vs Mechanical Processing

- Flavor updates are routed through direct persistence endpoints.
- Mechanical actions go through an event pipeline that recomputes derived values and publishes canonical state.

### Dice System

- Digital mode: pseudo-random roll generation per die shape
- Manual mode: user-provided roll payloads for physical dice
- Validation gate: strict integer range enforcement (for example, d20 must be in [1, 20])

## Delivery Roadmap

### Phase 1: Workspace and Data Modeling (Weeks 1-3)
**Objective:** Set up the monorepo architecture and define data boundaries.

- Repository setup with Turborepo workspace:
	- `apps/web` (React/Vite)
	- `apps/server` (Node/Express)
	- `packages/shared` (Zod schemas and core types)
- Database schema (Drizzle + Postgres):
	- Character table and linked mechanical state structures (items, classes, stats)
	- Isolated flavor block (JSONB or explicit columns) for direct, non-cascading updates
- Authentication and guardrails:
	- Simple auth
	- Unique constraint/index on `user_id` in characters to enforce one-character-per-user

### Phase 2: Core Rules Engine and Pure Logic (Weeks 4-6)
**Objective:** Build stateless DND 5e (2014) logic in shared library.

- Pure mechanics functions:
	- Ability modifier from raw score
	- Proficiency bonus from level
	- Baseline unarmored AC calculation: 10 + Dexterity modifier
- Validation contract definitions via Zod:
	- Strict ranges (for example ability score 1-30)
- Dice engine architecture:
	- Digital and manual roll payload support
	- Gatekeeper schema for die-specific range validation

### Phase 3: Backend Infrastructure and Persistent APIs (Weeks 7-9)
**Objective:** Establish secure REST endpoints and data persistence.

- Core endpoints for character fetch and mutation
- Flavor bypass route:
	- `PATCH /api/character/flavor` writes direct flavor updates
	- No real-time mechanical pipeline execution for flavor-only changes
- Seed framework (Drizzle):
	- Standard 2014 SRD references (classes, equipment packs, weapons)

### Phase 4: Frontend Hydration and UI Foundation (Weeks 10-12)
**Objective:** Build visible sheet layout and synchronization layer.

- TanStack Query integration for initial hydration and remote data management
- Zustand store for local UI state and interaction-driven updates
- Flavor interface sections wired to direct API updates
- Validation that flavor edits persist without full mechanical recomputation

### Phase 5: WebSocket Real-Time Action System (Weeks 13-16)
**Objective:** Implement event-driven cascading updates via WebSockets.

- Socket.io bidirectional infrastructure
- Action package emission for gameplay events (example: `EQUIP_ITEM`)
- Backend action processor:
	- Persist action results
	- Re-run shared rules calculations
	- Broadcast confirmed canonical state to connected clients

### Phase 6: Multi-Step Wizards (Weeks 17-20)
**Objective:** Implement stateful creation and progression workflows.

- Character creation wizard:
	- Local staged state for race/class/stats and related selections
	- Final-step payload validation (Zod) and single transactional submit
- Level-up wizard:
	- Sequential level validation (for example 1 -> 2)
	- Feature choice validation against character build constraints

### Phase 7: Telemetry, Bridge, and Launch (Weeks 21+)
**Objective:** Add observability and prepare beta launch.

- Pino JSON logging for action traceability and anomaly detection
- Sentry integration for runtime exception capture
- Docker-based deployment of a single production instance in a UK data center

## Non-Goals for Initial Release

- Multi-character account support
- Full homebrew content system
- Cross-campaign roster management

## Success Criteria

- Character creation and level-up flows complete successfully with strict rules validation
- Mechanical actions produce deterministic cascading sheet updates
- Flavor updates persist instantly with no mechanical recomputation
- Dice workflows reject out-of-range or malformed roll inputs
- One-character-per-user rule is consistently enforced across API and persistence layers

