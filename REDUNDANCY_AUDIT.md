# Redundancy Audit (Current State)

Date: 2026-07-05  
Scope: apps + packages in current main working tree  
Focus: repeated definitions, duplicated logic paths, stale/parallel implementations

## Executive Summary

- Confirmed findings: 8
- Likely candidates: 3
- Most critical current issue: duplicate socket pipelines in server with only one wired at runtime
- Most immediate low-risk wins: remove stale test importing deleted hook, remove broken engine type imports, unify proficiency formula

## What Changed Since Last Audit

Resolved from prior report:
- Inventory store dead path removed from web: [apps/web/src/store](apps/web/src/store)
- Hook-based duplicate socket client removed from web runtime (hook file no longer exists): [apps/web/src/hooks](apps/web/src/hooks)
- Shared engine duplicate module set removed (no shared engine folder now): [packages/shared/src](packages/shared/src)

Still active after update:
- Generated server artifacts checked into src
- Multiple duplicate schema/model definitions around modifiers
- Duplicate formulas and parallel server websocket pipelines

## Findings Table

| ID | Confidence | Severity | Category | Summary | Effort | Risk |
|---|---|---|---|---|---|---|
| F1 | Confirmed | Critical | Runtime Duplication | Two server websocket implementations overlap in behavior | M | High |
| F2 | Confirmed | Critical | Source Hygiene | 36 generated artifacts (.js/.d.ts/.map) coexist with TS source under server/src | S | Low |
| F3 | Confirmed | High | Type Path Drift | Engine imports non-existent local type module ../types/engine.js | S | Medium |
| F4 | Confirmed | High | Formula Duplication | Proficiency bonus formula duplicated in two engine calculators | S | Low |
| F5 | Confirmed | High | Schema Duplication | Two incompatible modifier schema systems exist in shared | M | Medium |
| F6 | Confirmed | Medium | Dead Test Path | Web test still imports deleted hook useCharacterSocket | S | Low |
| F7 | Confirmed | Medium | Constant Duplication | STATS/ability generation constants duplicated across wizard components | S | Low |
| F8 | Confirmed | Medium | Type Alias Drift | Wizard uses local Attributes type while rest of app uses Ability | S | Low |
| L1 | Likely | Medium | Architectural Split | gateway/socket.ts appears unused but duplicates live socket responsibilities | M | Medium |
| L2 | Likely | Medium | Domain Coupling | characterSheetStore still combines many concerns into one store | M | Medium |
| L3 | Likely | Low | Validation Duplication | Wizard keeps progression flags that overlap engine-level validation logic | S | Low |

## Detailed Findings

### F1 - Duplicate server websocket pipelines

- Severity: Critical
- Confidence: Confirmed
- Why this is redundant:
  - Two independent websocket handling implementations exist with overlapping mechanics.
  - One path uses action dispatch + service processing, another uses event-specific atomic DB handlers.
- Evidence:
  - Active initialization in app entrypoint: [apps/server/src/index.ts#L11](apps/server/src/index.ts#L11), [apps/server/src/index.ts#L38](apps/server/src/index.ts#L38)
  - Controller pipeline: [apps/server/src/socket/controller.ts#L5](apps/server/src/socket/controller.ts#L5), [apps/server/src/socket/controller.ts#L16](apps/server/src/socket/controller.ts#L16)
  - Gateway pipeline: [apps/server/src/gateway/socket.ts#L18](apps/server/src/gateway/socket.ts#L18), [apps/server/src/gateway/socket.ts#L37](apps/server/src/gateway/socket.ts#L37)
- Recommendation:
  - Keep one websocket pipeline as canonical runtime path.
  - If gateway is future direction, migrate index initialization first, then remove controller implementation.
- Effort/Risk: Medium effort, high risk if migrated without event-compatibility plan.

### F2 - Generated artifacts under server source

- Severity: Critical
- Confidence: Confirmed
- Why this is redundant:
  - Compiled outputs are committed next to source, creating review noise and merge overhead.
- Evidence:
  - Artifact count under src: 36 files in [apps/server/src](apps/server/src)
  - Examples: [apps/server/src/index.js](apps/server/src/index.js), [apps/server/src/index.d.ts](apps/server/src/index.d.ts), [apps/server/src/routes/character.js](apps/server/src/routes/character.js), [apps/server/src/middleware/requireAuth.js](apps/server/src/middleware/requireAuth.js)
- Recommendation:
  - Emit build artifacts to a dedicated output directory and exclude from source tree.
- Effort/Risk: Small effort, low risk.

### F3 - Broken engine type import path

- Severity: High
- Confidence: Confirmed
- Why this is redundant/risky:
  - Code imports a local type module that does not exist, while modifier types are available via shared schemas.
- Evidence:
  - Missing local types file path namespace: [packages/engine/src/types](packages/engine/src/types)
  - Broken imports: [packages/engine/src/calculators/abilities.ts#L2](packages/engine/src/calculators/abilities.ts#L2), [packages/engine/src/pipeline/inventoryBridge.ts#L2](packages/engine/src/pipeline/inventoryBridge.ts#L2)
- Recommendation:
  - Replace with a single exported modifier/runtime type import source and remove dead path assumption.
- Effort/Risk: Small effort, medium risk.

### F4 - Proficiency bonus formula duplicated in engine

- Severity: High
- Confidence: Confirmed
- Why this is redundant:
  - Same formula appears in two calculators.
- Evidence:
  - [packages/engine/src/calculators/abilities.ts#L59](packages/engine/src/calculators/abilities.ts#L59)
  - [packages/engine/src/calculators/derivedStats.ts#L5](packages/engine/src/calculators/derivedStats.ts#L5)
- Recommendation:
  - Keep one canonical implementation and delegate from the other call sites.
- Effort/Risk: Small effort, low risk.

### F5 - Modifier schema duplication and incompatibility in shared

- Severity: High
- Confidence: Confirmed
- Why this is redundant:
  - Legacy character modifier schema and newer runtime/base modifier schema coexist with different fields and semantics.
- Evidence:
  - Legacy schema: [packages/shared/src/schemas/character.ts#L19](packages/shared/src/schemas/character.ts#L19), [packages/shared/src/schemas/character.ts#L33](packages/shared/src/schemas/character.ts#L33)
  - New runtime/base schema: [packages/shared/src/schemas/modifiers.ts#L29](packages/shared/src/schemas/modifiers.ts#L29), [packages/shared/src/schemas/modifiers.ts#L37](packages/shared/src/schemas/modifiers.ts#L37)
  - Legacy schema usage is test-heavy: [packages/shared/src/schemas/__tests__/character.test.ts#L4](packages/shared/src/schemas/__tests__/character.test.ts#L4)
- Recommendation:
  - Pick one canonical modifier schema family and add adapters only at boundaries where unavoidable.
- Effort/Risk: Medium effort, medium risk.

### F6 - Dead web test imports removed hook

- Severity: Medium
- Confidence: Confirmed
- Why this is redundant:
  - Test suite references a hook file that no longer exists.
- Evidence:
  - Stale imports in test: [apps/web/src/hooks/__tests__/useCharacterSocket.test.ts#L44](apps/web/src/hooks/__tests__/useCharacterSocket.test.ts#L44), [apps/web/src/hooks/__tests__/useCharacterSocket.test.ts#L69](apps/web/src/hooks/__tests__/useCharacterSocket.test.ts#L69), [apps/web/src/hooks/__tests__/useCharacterSocket.test.ts#L91](apps/web/src/hooks/__tests__/useCharacterSocket.test.ts#L91)
- Recommendation:
  - Remove this test file or rewrite it to validate the active socket service/provider path.
- Effort/Risk: Small effort, low risk.

### F7 - Duplicated ability constants in wizard UI

- Severity: Medium
- Confidence: Confirmed
- Why this is redundant:
  - Ability stat arrays and rules constants are repeated across components.
- Evidence:
  - [apps/web/src/components/wizard/abilities/ManualRollEngine.tsx#L3](apps/web/src/components/wizard/abilities/ManualRollEngine.tsx#L3)
  - [apps/web/src/components/wizard/abilities/PointBuyCalculator.tsx#L3](apps/web/src/components/wizard/abilities/PointBuyCalculator.tsx#L3), [apps/web/src/components/wizard/abilities/PointBuyCalculator.tsx#L13](apps/web/src/components/wizard/abilities/PointBuyCalculator.tsx#L13)
  - [apps/web/src/components/wizard/abilities/StandardArrayAssigner.tsx#L4](apps/web/src/components/wizard/abilities/StandardArrayAssigner.tsx#L4), [apps/web/src/components/wizard/abilities/StandardArrayAssigner.tsx#L5](apps/web/src/components/wizard/abilities/StandardArrayAssigner.tsx#L5)
- Recommendation:
  - Centralize these constants in shared or a single web-domain constants file.
- Effort/Risk: Small effort, low risk.

### F8 - Ability type naming drift in web

- Severity: Medium
- Confidence: Confirmed
- Why this is redundant:
  - Local Attributes union duplicates core Ability semantics already used elsewhere.
- Evidence:
  - Local type: [apps/web/src/store/wizardStore.ts#L4](apps/web/src/store/wizardStore.ts#L4)
  - Existing Ability usage: [apps/web/src/store/characterSheetStore.ts#L3](apps/web/src/store/characterSheetStore.ts#L3), [apps/web/src/hooks/useCharacterStats.ts#L9](apps/web/src/hooks/useCharacterStats.ts#L9)
- Recommendation:
  - Reuse one Ability type source and keep alias only during migration if needed.
- Effort/Risk: Small effort, low risk.

## Likely Candidates (Needs Team Intent Confirmation)

### L1 - gateway/socket.ts appears unused but duplicates runtime behavior

- Signal:
  - Declared but not referenced elsewhere: [apps/server/src/gateway/socket.ts#L18](apps/server/src/gateway/socket.ts#L18)
  - Search usage: only definition found for initializeWebSocketGateway.
- Recommendation:
  - Confirm intended socket architecture, then delete or wire explicitly.

### L2 - characterSheetStore has broad mixed domain responsibilities

- Signal:
  - Health, progression, inventory, resources, modifiers and socket-emitting actions in one store: [apps/web/src/store/characterSheetStore.ts#L13](apps/web/src/store/characterSheetStore.ts#L13), [apps/web/src/store/characterSheetStore.ts#L57](apps/web/src/store/characterSheetStore.ts#L57)
- Recommendation:
  - Consider domain slices if rerender/test complexity grows.

### L3 - wizard validation metadata overlaps engine progression logic

- Signal:
  - wizard store keeps class/race gating flags: [apps/web/src/store/wizardStore.ts#L20](apps/web/src/store/wizardStore.ts#L20), [apps/web/src/store/wizardStore.ts#L21](apps/web/src/store/wizardStore.ts#L21)
  - level-up flow already uses progression engine checks: [apps/web/src/store/levelUpStore.ts](apps/web/src/store/levelUpStore.ts)
- Recommendation:
  - Reuse progression engine for consistency, keep UI-only flags minimal.

## Updated Priority Roadmap

1. P1 quick fixes
- Remove stale web hook test file.
- Fix engine modifier type imports to a real canonical type path.
- Consolidate proficiency formula implementation.

2. P2 cleanup and consolidation
- Choose one server websocket runtime path.
- Move server build outputs out of src and enforce ignore/build policy.

3. P3 schema/model alignment
- Consolidate modifier schemas and deprecate legacy shape safely.
- Normalize Ability type usage in wizard flow and centralize ability constants.

## Notes

- This report supersedes prior stale references to removed files.
- Recommendations are readability-first and avoid introducing heavy abstraction where a simple consolidation works.
