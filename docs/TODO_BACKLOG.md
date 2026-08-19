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

| # | Status | Notes |
| --- | --- | --- |
| 15 | ✅ Resolved | Summon actions now create live actor instances and resolve them through the engine runtime. |
| 16 | ✅ Resolved | Tinker summon actors now surface as tracked runtime actors with player-controlled action availability. |
| 17 | ✅ Resolved | Dismissal and lifecycle handling now flow through the actor runtime and are visible in the live sheet / combat UI. |

The summons vertical is now implemented as an embedded actor model owned by the
character, which is sufficient for the current product scope and leaves the broader
feature work focused on inventory shape and modifier-system expressiveness.

### 2c. Inventory

Both columns are now typed and consumed at runtime. The server inventory sync
includes the full `InventoryInstance` contract.

| # | Status | Notes |
| --- | --- | --- |
| 18 | ✅ Resolved | `startingEquipment` on backgrounds was already typed via `StartingEquipmentDefinition` and seeded through `normalizeStartingEquipment`. |
| 19 | ✅ Resolved | `character_inventory` now carries `custom_name` and `container_id`; server SELECT sites include the full `InventoryInstance` shape. |

### 2d. State-conditional calculations

The generic state-aware infrastructure is now in place; the remaining gap is mostly
about applying it to specific authored rules rather than inventing the mechanism.

| # | Status | Notes |
| --- | --- | --- |
| 20 | ✅ Resolved | Ability caps now consult active states and support higher caps such as barbarian capstone / tome states. |
| 21 | ✅ Resolved | Governing-stat selection now respects active-state overrides such as Hexblade / Shillelagh. |
| 22 | ✅ Resolved | Halfling Lucky now has a concrete authored ability-check path that exercises the reroll logic at runtime. |

### 2e. Modifier-system expressiveness

Both TODOs are self-documenting: the modifier vocabulary cannot express the rule.
Neither is a small fix — they change what a `RuntimeModifier` can address.

| # | Item | Location | Missing concept |
| --- | --- | --- | --- |
| 23 | Fighting Style: Protection | [fightingStyleDictionary.ts:114](packages/engine/src/rules/traits/fightingStyleDictionary.ts:114) | Reactions targeting *another creature's* roll |
| 24 | ✅ Resolved | [fightingStyleDictionary.ts:128](packages/engine/src/rules/traits/fightingStyleDictionary.ts:128) | Implemented via hand-aware damage modifiers and a governing-stat modifier source |

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

1. **2c inventory (#18, #19)** — completed; the remaining feature work now sits in the polish and modifier-system buckets.
2. **P3 remainder (#26, #29)** — the remaining correctness and visual polish items.
3. **2e (#23)** — the remaining deliberate modifier-system redesign, now that the core runtime is in place.
4. **Typecheck / API drift cleanup** — keep this in parallel with the feature work, since it is the broadest remaining quality risk.


---

## Not from TODO comments: engine-API drift

`pnpm typecheck` (added 2026-08-02) currently reports **0 errors** in the workspace
and the package-level typechecks all complete successfully. That means the drift
that was previously surfacing through the repository's strict TypeScript checks has
been cleared for the current state of the codebase.

The remaining risk is now mostly around broader integration coverage rather than
live type errors: `@project/database` and `@project/server` still have tests that
can be flaky when the environment is stateful, so they are worth isolating before
being trusted as a hard gate.

---

## Open — action economy, deferred items

The three action-economy phases are complete (see
`docs/superpowers/plans/2026-08-19-action-economy-phase-{1,2,3}.md`). These were
deliberately left out and are listed so the absence stays deliberate.

| # | Item | Why it was deferred |
| --- | --- | --- |
| A1 | Ready's trigger is not modelled | Needs a player-authored trigger contract; none exists |
| A2 | Hide does not roll Stealth; Search does not roll Perception | No roll-initiating UI for skills anywhere on the sheet |
| A3 | `status_hidden` never clears on its own | Being found is not a turn boundary; only a manual "Stop Hiding" ends it |
| A4 | Dodge's `status_attacks_against_have_disadvantage` is not displayed | The AC widget shows Reckless Attack's advantage mirror but was not extended; small follow-up |
| A5 | No opportunity-attack model | Disengage is therefore `no_effect`; it becomes expressible if they are ever modelled |
| A6 | Two-weapon fighting's main-hand requirement unenforced | Nothing checks that the Attack action was taken with a light weapon |
| A7 | No way to take the Attack action without swinging | Declaration is implicit only |

---

## Open — socket gateway has no test coverage

`apps/server/src/gateway/socket.ts` is the one substantial file in the repo with no
tests at all. There is no socket harness, so every handler in it is unverified
wire code. Nothing in it *decides* anything — the logic it calls out to is unit
tested — but the wiring itself is not: that events are bound to the right names,
that the campaign room is resolved before emitting, that the reply payload is
shaped as the client expects, and that the authoritative runtime is reused rather
than rebuilt per call.

Handlers currently uncovered:

| Handler | Added |
| --- | --- |
| `ROOM_JOIN`, `HP_MODIFIED`, `ITEM_EQUIPPED`, `ITEM_ATTUNED`, `ITEM_CONSUMED`, `INVENTORY_SYNC`, `RESOURCE_CONSUMED`, `REST_COMPLETED`, `ROLL_RESULTS` | pre-existing |
| `ACTION_INTENT` / `ACTION_RESOLVED` | pre-existing, extended in action-economy phase 1 (combat context, `economyPolicy`) and phase 2 (`attacksPerAction`) |
| `TURN_STARTED` / `TURN_ENDED` / `TURN_RESOLVED` | action-economy phase 1 |

Doing this properly means one harness — a fake `Server`/`Socket` pair plus a mocked
`db` — after which each handler is a small test. Worth doing as a single dedicated
pass rather than piecemeal, since the harness is most of the work and every handler
then costs a few lines.

Related: `apps/server/vitest.config.ts` carries `testTimeout: 20000` because these
suites build a real Express app through dynamic imports and the default 5s sat on
the boundary. A harness that avoids the full app import would likely let that go
back down.

---

## Resolved

Item numbers are stable ids — gaps below are intentional, not renumbered.

- **#25 — `classLevels` should come from the class ledger** (`useFeatures.ts`).
  The class ledger already existed and was already hydrated end to end
  (`hydrateCharacterSheet` → `initialize` → `state.classLevels`); the hook was the
  only consumer still carrying a `|| { class_fighter: totalLevel }` fallback. Removed,
  so it now reads the store directly like every other consumer.
