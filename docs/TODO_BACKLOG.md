# TODO Backlog

This backlog has been refreshed to reflect the repo state as of 2026-08-09. Several
of the originally inert seams are now wired end to end, so the remaining work below
focuses on the pieces that still genuinely block the next milestones.

Two `NOTE:` comments in `packages/engine/src/calculators/__tests__/` are
documentation, not work items, and are excluded.

---

## Structural finding (context for several items below)

This was the original blocker, and it has now been cleared: the runtime consumes
these authored channels instead of treating them as dead data.

| Channel | Declared in | Current runtime state |
| --- | --- | --- |
| `triggers` (`listenFor` / `executeAction`) | `packages/shared/src/schemas/triggers.ts` | Consumed by `ActionResolver.dispatchEvent()` |
| `effect.type: "macro"` | `packages/shared/src/schemas/actions.ts` | Executed by `ActionResolver` via nested effect dispatch |
| `criticalHitModifiers` | `packages/shared/src/schemas/traits.ts` | Applied by `CombatEngine` for qualifying critical hits |

The remaining work is therefore less about wiring the bus and more about finishing
feature-specific behavior, inventory shape, and remaining polish.

---

## P0 — Previously inert runtime seams (now resolved)

These gaps were the highest-risk items because they looked complete in the authored
content but were dead at runtime. They are now wired through the engine.

| # | Status | Notes |
| --- | --- | --- |
| 1 | ✅ Resolved | `macro` effects now execute nested effects through `ActionResolver`. |
| 2 | ✅ Resolved | Relentless Endurance uses the trigger dispatch path and consumes its resource correctly. |
| 3 | ✅ Resolved | Savage Attacks now applies critical-hit modifiers via `CombatEngine`. |
| 4 | ✅ Resolved | Character bootstrap hydrates granted states and resources into the live runtime managers. |

No remaining P0 work is left from this original bucket.

---

## P1 — Schema foundations (now largely complete)

These were small, mechanical gaps that were previously papered over with hardcoded
fallbacks. They are now present in the shared schema layer and consumed by the
engine.

| # | Status | Notes |
| --- | --- | --- |
| 5 | ✅ Resolved | Weapon range and long-range values are defined in [weapons.ts](packages/shared/src/schemas/weapons.ts) and consumed by weapon synthesis. |
| 6 | ✅ Resolved | Thrown weapon range now uses the same schema-backed values. |
| 7 | ✅ Resolved | Effect predicates are part of the shared effect schema and are honoured by the runtime. |
| 8 | ✅ Resolved | `SKILL_MAP` now lives in the shared package and is consumed by engine and client code. |

No remaining P1 work is left from the original list.

---

## P2 — Feature verticals

### 2a. Dice & attack resolution (mostly implemented)

The core resolver path for attack, save, and damage-rider effects is now in place,
and the UI now surfaces roll outcomes in the live-sheet experience.

| # | Status | Notes |
| --- | --- | --- |
| 10 | ✅ Resolved | Attack effects now roll and return results through the resolver. |
| 11 | ✅ Resolved | Save effects now roll and return results through the resolver. |
| 12 | ✅ Resolved | Damage-rider effects now roll and return results through the resolver. |
| 13 | ✅ Resolved | Roll results are surfaced in the combat widget and store rather than remaining hidden behind console output. |
| 14 | ✅ Resolved | Rest flow now supports hit-die spend-and-roll interaction. |

The remaining work in this area is now about richer authored-edge cases and deeper
roll/log integration rather than the basic resolver plumbing.

### 2b. Summons

| # | Item | Location |
| --- | --- | --- |
| 15 | `summon` pipeline | [actionResolver.ts:63](packages/engine/src/pipeline/actionResolver.ts:63) |
| 16 | Tinker toy entity tracking | [gnomeDictionary.ts:230](packages/engine/src/rules/traits/gnomeDictionary.ts:230) |
| 17 | Dismantle action on the summoned toy's sheet | [gnomeDictionary.ts:261](packages/engine/src/rules/traits/gnomeDictionary.ts:261) |

Strictly ordered 15 → 16 → 17; the Gnome items are consumers of the pipeline. This
vertical needs a decision first: do summoned actors get their own sheet documents, or
are they embedded state on the owner? That choice drives all three.

### 2c. Inventory

Both columns are untyped `jsonb` placeholders. `pipeline/inventoryBridge.ts` is the
existing seam.

| # | Item | Location |
| --- | --- | --- |
| 18 | `startingEquipment` parsing on backgrounds | [reference.ts:510](packages/database/src/schema/reference.ts:510) |
| 19 | `temporaryInventory` shape on the operational table | [operational.ts:102](packages/database/src/schema/operational.ts:102) |

Do 19 before 18 — the runtime shape should define the parse target, not the reverse.

### 2d. State-conditional calculations

The generic state-aware infrastructure is now in place; the remaining gap is mostly
about applying it to specific authored rules rather than inventing the mechanism.

| # | Status | Notes |
| --- | --- | --- |
| 20 | ✅ Resolved | Ability caps now consult active states and support higher caps such as barbarian capstone / tome states. |
| 21 | ✅ Resolved | Governing-stat selection now respects active-state overrides such as Hexblade / Shillelagh. |
| 22 | ⚠️ Open | Halfling Lucky still needs a concrete authored conditional rule to trigger the reroll logic beyond the generic dice-rule support. |

### 2e. Modifier-system expressiveness

Both TODOs are self-documenting: the modifier vocabulary cannot express the rule.
Neither is a small fix — they change what a `RuntimeModifier` can address.

| # | Item | Location | Missing concept |
| --- | --- | --- | --- |
| 23 | Fighting Style: Protection | [fightingStyleDictionary.ts:114](packages/engine/src/rules/traits/fightingStyleDictionary.ts:114) | Reactions targeting *another creature's* roll |
| 24 | Fighting Style: Two-Weapon Fighting | [fightingStyleDictionary.ts:128](packages/engine/src/rules/traits/fightingStyleDictionary.ts:128) | Which hand made the attack |

---

## P3 — UI wiring & polish

| # | Status | Notes |
| --- | --- | --- |
| 26 | ✅ Resolved | Projected CON modifier now reads the post-ASI state when the wizard shows HP deltas. |
| 27 | ✅ Resolved | Level-up success now closes or resets the wizard flow and shows feedback. |
| 28 | ✅ Resolved | Level-up failures now surface through the wizard feedback banner. |
| 29 | ✅ Resolved | `ArmorClassWidget` now has the styling pass and is rendered as a dedicated sheet card. |

The remaining polish work is now mostly visual or correctness-driven rather than
structural.

---

## Recommended sequence

1. **2b summons (#15–#17)** — this is still the biggest open feature vertical and needs the actor-model decision first.
2. **2c inventory (#19 → #18)** — independent of the above and still worth tackling in parallel.
3. **P3 remainder (#26, #29)** — the remaining correctness and visual polish items.
4. **2e (#23, #24)** — a deliberate modifier-system redesign, now that the core runtime is in place.
5. **Typecheck / API drift cleanup** — keep this in parallel with the feature work, since it is the broadest remaining quality risk.


---

## Not from TODO comments: engine-API drift

`pnpm typecheck` (added 2026-08-02) currently reports **144 errors**. None are marked
with a TODO, so none appear in the tiers above, but they are the largest single
source of latent breakage in the repo — `useCombat` crashing on every equipped weapon
was one of them, found only because a test happened to cover it.

| Package | Errors |
| --- | --- |
| `@project/server` | 50 |
| `@project/engine` | 40 |
| `@project/web` | 37 |
| `@project/database` | 13 |
| `@project/shared` | 4 |

Dominant patterns: call sites still using pre-refactor engine signatures
(`RestEngine.applyRest`, `AbilityEngine.calculateScore` return shape, arity
mismatches in `useCharacterStats`), `TraitDefinition` consumers expecting
`modifiers` to be a flat array when it is `{ fixed, choices }`, and static
dictionary entries missing `requiredStates` / `forbiddenStates`.

Note the per-package `tsc --noEmit` also covers test files and `vitest.config.ts`
under each package's stricter options (`noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`), so its count is higher than what `apps/web`'s
`tsc -b` alone reports.

Separately, `@project/database` and `@project/server` have tests that pass or fail
between identical runs — flaky, likely DB-dependent. Worth isolating before the
suite is trusted as a gate.

---

## Resolved

Item numbers are stable ids — gaps below are intentional, not renumbered.

- **#25 — `classLevels` should come from the class ledger** (`useFeatures.ts`).
  The class ledger already existed and was already hydrated end to end
  (`hydrateCharacterSheet` → `initialize` → `state.classLevels`); the hook was the
  only consumer still carrying a `|| { class_fighter: totalLevel }` fallback. Removed,
  so it now reads the store directly like every other consumer.
