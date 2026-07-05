# Redundancy Audit

Date: 2026-07-05
Scope: apps, packages (server, web, engine, shared)
Focus: duplicate definitions, repeated logic, and reimplementation opportunities with readability preserved.

## Executive Summary

- Confirmed findings: 8
- Likely candidates: 3
- Most critical area: modifier model/semantics split across engine and shared schemas.
- Most immediate low-risk win: remove or archive dead inventory store path in web.

## Method

- Repo-wide symbol/pattern search for repeated formulas, repeated types, and parallel implementations.
- Direct source validation in affected files.
- Classification by confidence:
  - Confirmed: evidence of active duplication or dead redundant code.
  - Likely candidate: strong signal, but team intent may justify current design.
- Priority balances correctness risk, maintenance burden, and readability impact.

## Findings Table

| ID | Confidence | Severity | Category | Summary | Effort | Risk |
|---|---|---|---|---|---|---|
| F1 | Confirmed | Critical | Domain Model | Modifier definitions diverge between engine and shared schemas | M | Medium |
| F2 | Confirmed | Critical | Formula Duplication | Ability modifier formula implemented in multiple places | S | Low |
| F3 | Confirmed | Critical | Formula Duplication | Proficiency bonus formula implemented in multiple places | S | Low |
| F4 | Confirmed | High | Logic Duplication | AC computation duplicated with incompatible semantics | M | Medium |
| F5 | Confirmed | High | Logic Duplication | Max HP calculation duplicated with differing rule handling | M | Medium |
| F6 | Confirmed | High | Dead/Redundant Path | Web inventory store appears unused outside its own tests | S | Low |
| F7 | Confirmed | High | Integration Pattern | Parallel socket implementations create duplicate connection patterns | M | Medium |
| F8 | Confirmed | Medium | Generated Artifacts | Compiled JS/d.ts artifacts present under server source tree | S | Low |
| L1 | Likely | Medium | Domain Split | Trait effect systems split between engine dictionary and shared schema | L | Medium |
| L2 | Likely | Medium | Constant Duplication | Point-buy and standard-array constants embedded in UI components | S | Low |
| L3 | Likely | Low | Type Duplication | Wizard local Attributes type duplicates engine Ability | S | Low |

## Detailed Findings

### F1 - Modifier definitions diverge between engine and shared schemas

- Confidence: Confirmed
- Severity: Critical
- Why it is redundant/risky:
  - Two definitions represent the same domain concept with incompatible fields and enum semantics.
  - This creates conversion pressure and semantic drift over time.
- Evidence:
  - Engine modifier model: [packages/engine/src/types/engine.ts#L1](packages/engine/src/types/engine.ts#L1), [packages/engine/src/types/engine.ts#L13](packages/engine/src/types/engine.ts#L13), [packages/engine/src/types/engine.ts#L20](packages/engine/src/types/engine.ts#L20)
  - Shared modifier schema: [packages/shared/src/schemas/character.ts#L19](packages/shared/src/schemas/character.ts#L19), [packages/shared/src/schemas/character.ts#L22](packages/shared/src/schemas/character.ts#L22)
  - Active web state uses engine modifier: [apps/web/src/store/characterSheetStore.ts#L34](apps/web/src/store/characterSheetStore.ts#L34)
- Recommendation:
  - Choose a canonical modifier model (recommended: runtime model in engine with explicit boundary adapters in shared/API, or shared canonical with engine re-export).
  - Create one translation module if dual models must remain temporarily.
- Readability impact: Positive if canonical model is documented and centrally exported.
- Effort/Risk: Medium effort, medium risk (touches schema/runtime boundaries).

### F2 - Ability modifier formula duplicated

- Confidence: Confirmed
- Severity: Critical
- Why it is redundant/risky:
  - Same formula appears in both engine and shared utilities, increasing drift risk.
- Evidence:
  - Engine: [packages/engine/src/calculators/abilities.ts#L50](packages/engine/src/calculators/abilities.ts#L50)
  - Shared: [packages/shared/src/engine/core.ts#L7](packages/shared/src/engine/core.ts#L7)
- Recommendation:
  - Keep one implementation in a single canonical package and re-export where needed.
- Readability impact: Positive.
- Effort/Risk: Small effort, low risk.

### F3 - Proficiency bonus formula duplicated

- Confidence: Confirmed
- Severity: Critical
- Why it is redundant/risky:
  - Same formula appears in three active definitions.
- Evidence:
  - Engine ability utility: [packages/engine/src/calculators/abilities.ts#L59](packages/engine/src/calculators/abilities.ts#L59)
  - Engine derived stats: [packages/engine/src/calculators/derivedStats.ts#L83](packages/engine/src/calculators/derivedStats.ts#L83)
  - Shared core: [packages/shared/src/engine/core.ts#L17](packages/shared/src/engine/core.ts#L17)
- Recommendation:
  - Consolidate to one exported function and remove duplicate entry points.
- Readability impact: Positive.
- Effort/Risk: Small effort, low risk.

### F4 - AC calculation duplicated with incompatible semantics

- Confidence: Confirmed
- Severity: High
- Why it is redundant/risky:
  - Different AC pipelines with different assumptions (setters/adders/source dedupe/breakdown vs generic bonus sum).
  - Harder to reason about correctness and expected behavior.
- Evidence:
  - Engine AC with stacking logic: [packages/engine/src/calculators/derivedStats.ts#L14](packages/engine/src/calculators/derivedStats.ts#L14)
  - Shared AC utility: [packages/shared/src/engine/combat.ts#L19](packages/shared/src/engine/combat.ts#L19)
- Recommendation:
  - Consolidate rule logic into one core AC function, with optional breakdown output for UI.
- Readability impact: Positive if options are explicit.
- Effort/Risk: Medium effort, medium risk.

### F5 - Max HP calculation duplicated with differing rule handling

- Confidence: Confirmed
- Severity: High
- Why it is redundant/risky:
  - Two max HP implementations use different assumptions and effect ingestion.
- Evidence:
  - Engine max HP: [packages/engine/src/calculators/derivedStats.ts#L87](packages/engine/src/calculators/derivedStats.ts#L87)
  - Shared max HP: [packages/shared/src/engine/combat.ts#L54](packages/shared/src/engine/combat.ts#L54)
- Recommendation:
  - Define one canonical HP rule path and make alternate call sites delegate to it.
- Readability impact: Positive.
- Effort/Risk: Medium effort, medium risk.

### F6 - Redundant web inventory store appears dead

- Confidence: Confirmed
- Severity: High
- Why it is redundant/risky:
  - Store implementation exists but app usage appears absent outside its own test file.
  - Inventory is actively modeled elsewhere in character sheet store.
- Evidence:
  - Inventory store definition: [apps/web/src/store/inventoryStore.ts#L20](apps/web/src/store/inventoryStore.ts#L20)
  - Inventory state in active character store: [apps/web/src/store/characterSheetStore.ts#L31](apps/web/src/store/characterSheetStore.ts#L31)
  - Usage appears isolated to test file: [apps/web/src/store/__tests__/inventoryStore.test.ts#L2](apps/web/src/store/__tests__/inventoryStore.test.ts#L2)
- Recommendation:
  - Remove or archive the dead store path after team confirmation.
  - If retained for future work, mark explicitly as experimental/deprecated.
- Readability impact: Positive.
- Effort/Risk: Small effort, low risk.

### F7 - Parallel socket implementations in web

- Confidence: Confirmed
- Severity: High
- Why it is redundant/risky:
  - One singleton socket service and one hook-local socket connection pattern coexist.
  - Increases chance of duplicate listeners, inconsistent event contracts, and debugging overhead.
- Evidence:
  - Socket manager singleton: [apps/web/src/services/socketService.ts#L10](apps/web/src/services/socketService.ts#L10), [apps/web/src/services/socketService.ts#L80](apps/web/src/services/socketService.ts#L80)
  - Hook-local socket connection: [apps/web/src/hooks/useCharacterSocket.ts#L6](apps/web/src/hooks/useCharacterSocket.ts#L6), [apps/web/src/hooks/useCharacterSocket.ts#L16](apps/web/src/hooks/useCharacterSocket.ts#L16)
  - Service is actively used by provider/store: [apps/web/src/components/sheet/LiveSheetProvider.tsx#L25](apps/web/src/components/sheet/LiveSheetProvider.tsx#L25), [apps/web/src/store/characterSheetStore.ts#L85](apps/web/src/store/characterSheetStore.ts#L85)
- Recommendation:
  - Standardize on one socket ownership pattern (recommended: single service with typed subscribe/dispatch API).
- Readability impact: Positive.
- Effort/Risk: Medium effort, medium risk.

### F8 - Generated artifacts in server source tree

- Confidence: Confirmed
- Severity: Medium
- Why it is redundant/risky:
  - Build outputs (.js, .d.ts, maps) live alongside TypeScript source under server src.
  - This increases review noise and merge conflict surface.
- Evidence:
  - 36 generated-artifact files under apps/server/src were detected (examples):
    - [apps/server/src/index.js](apps/server/src/index.js)
    - [apps/server/src/index.d.ts](apps/server/src/index.d.ts)
    - [apps/server/src/core/auth/AuthInterface.js](apps/server/src/core/auth/AuthInterface.js)
    - [apps/server/src/routes/character.js](apps/server/src/routes/character.js)
    - [apps/server/src/middleware/requireAuth.js](apps/server/src/middleware/requireAuth.js)
- Recommendation:
  - Emit artifacts to a dedicated build output directory and align ignore rules.
  - If checked in intentionally, document policy and narrow to required artifacts only.
- Readability impact: Positive.
- Effort/Risk: Small effort, low risk.

## Likely Candidates (Require Team Intent Check)

### L1 - Trait effect systems are split across packages

- Signal:
  - Engine trait dictionary model: [packages/engine/src/rules/traitDictionary.ts#L3](packages/engine/src/rules/traitDictionary.ts#L3), [packages/engine/src/rules/traitDictionary.ts#L16](packages/engine/src/rules/traitDictionary.ts#L16)
  - Shared trait effect schema model: [packages/shared/src/schemas/effects.ts#L21](packages/shared/src/schemas/effects.ts#L21), [packages/shared/src/schemas/effects.ts#L58](packages/shared/src/schemas/effects.ts#L58)
- Why likely:
  - Could be intentional separation (runtime rule map vs serialized schema), but shapes are far apart.
- Recommendation:
  - Document explicit ownership and conversion strategy, or unify into one effect vocabulary.
- Effort/Risk: Large effort, medium risk.

### L2 - Point-buy and standard array constants embedded in UI

- Signal:
  - Point-buy costs in component: [apps/web/src/components/wizard/abilities/PointBuyCalculator.tsx#L3](apps/web/src/components/wizard/abilities/PointBuyCalculator.tsx#L3)
  - Standard array in component: [apps/web/src/components/wizard/abilities/StandardArrayAssigner.tsx#L5](apps/web/src/components/wizard/abilities/StandardArrayAssigner.tsx#L5)
- Why likely:
  - May be acceptable UI-local constants, but these are game rules that may deserve centralization.
- Recommendation:
  - Move to shared rules/constants package if validation or server parity is required.
- Effort/Risk: Small effort, low risk.

### L3 - Duplicate local Attributes type in wizard store

- Signal:
  - Local type: [apps/web/src/store/wizardStore.ts#L4](apps/web/src/store/wizardStore.ts#L4)
  - Existing engine ability type is available and used elsewhere.
- Why likely:
  - Low impact duplication but can drift if union expands.
- Recommendation:
  - Reuse exported ability type from engine package for consistency.
- Effort/Risk: Small effort, low risk.

## Modifier-Specific Crosswalk

| Dimension | Engine Runtime | Shared Schema |
|---|---|---|
| Type location | [packages/engine/src/types/engine.ts#L20](packages/engine/src/types/engine.ts#L20) | [packages/shared/src/schemas/character.ts#L19](packages/shared/src/schemas/character.ts#L19) |
| Target style | Strong enum-like union via ModifierTarget | Free-form string target |
| Modifier kind vocabulary | set_base, add, multiplier, advantage, disadvantage | bonus, advantage, disadvantage, resistance, immunity |
| Metadata | sourceName, sourceOrigin, isActive | sourceId (+ optional value) |
| Primary consumer | Engine calculators / web state | Shared schema validation and shared engine utils |

Decision needed: choose canonical semantics first, then refactor formulas and adapters.

## Prioritized Remediation Roadmap

1. Quick wins (low risk)
- Consolidate ability modifier and proficiency bonus formulas into one exported implementation.
- Remove or deprecate dead inventory store path after confirmation.
- Normalize generated artifact policy for server source tree.

2. Mid-scope unification
- Consolidate AC and HP calculation ownership to one canonical path with optional explanation payloads.
- Standardize one socket ownership pattern in web.

3. High-impact domain consolidation
- Resolve modifier model split (canonical schema/runtime + adapters).
- Reconcile trait effect vocabulary between engine runtime dictionary and shared schemas.

## Suggested PR Slicing

- PR A: Formula deduplication (F2, F3)
- PR B: Dead code and artifact hygiene (F6, F8)
- PR C: Socket unification (F7)
- PR D: Combat/derived stat consolidation (F4, F5)
- PR E: Modifier and trait model consolidation (F1, L1)

## Notes and Constraints

- Recommendations intentionally avoid overly clever abstractions; readability-first is preserved.
- Some likely candidates may be intentional architecture boundaries and should be validated with maintainers before removal.
