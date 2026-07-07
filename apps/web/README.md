# Web client (`@project/web`)

This package contains the React/Vite front-end for:

- Character creation wizard
- Live sheet view
- Socket-powered runtime interactions

## Responsibilities

The web client is responsible for:

1. Collecting and validating user input before API submission.
2. Fetching scoped reference data (`campaignId`/`characterId` aware).
3. Rendering live character state from server-managed data.
4. Emitting runtime socket events using campaign-scoped room identity.

It is **not** the source of truth for reference or operational state.

## Core modules

- `src/components/wizard/*` - multi-step character creation flow
- `src/components/sheet/*` - live sheet UI
- `src/services/socketService.ts` - socket connection and event plumbing
- `src/api/client.ts` - fetch wrapper and scoped endpoint builder
- `src/store/wizardStore.ts` - wizard local state
- `src/store/characterSheetStore.ts` - live sheet interaction state

## Scoped reference access

The wizard now uses `buildScopedReferenceEndpoint(...)` from `src/api/client.ts`.

This ensures:

- campaign context is propagated to reference calls when present;
- query keys include campaign context to prevent stale cross-campaign data reuse;
- optional character scope can be added consistently.

Example:

```ts
buildScopedReferenceEndpoint("/reference/traits", { campaignId }, { category: "skills" });
```

## Wizard campaign context

`CharacterCreationWizard` reads an optional `campaignId` from URL search params:

- `/` -> core-only wizard context
- `/?campaignId=<uuid>` -> campaign-scoped wizard context

Invalid campaign IDs are ignored and treated as core-only.

## Running locally

From repository root:

```bash
pnpm --filter @project/web dev
```

Default URL: `http://localhost:5173`

Ensure server API is running and accessible at `http://localhost:3000/api`.

## Testing and build

```bash
pnpm --filter @project/web test
pnpm --filter @project/web build
```

## Implementation notes for maintainers

1. Keep API interactions in `apiClient` and helper builders. Avoid ad-hoc `fetch` calls.
2. Include scope dimensions in React Query keys whenever a response can vary by campaign/character.
3. Avoid introducing local reference dictionaries; reference data should always come from API-backed resolution.
4. Keep wizard state serialisable and explicit; all server-side identifiers should be tracked as primitives.
