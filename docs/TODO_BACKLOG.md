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

| # | Item | Status |
| --- | --- | --- |
| A1 | Ready's trigger is not modelled | **Open** — see "reactions and external events" below |
| ~~A2~~ | ~~No roll-initiating UI for skills~~ | **Closed 2026-08-19.** `useCheckRoll` asks for a d20 through the existing roll interceptor and files the result; `SkillsWidget` (extracted from `DashboardLayout`) and `SavingThrowsWidget` both use it. Hide and Search still do not *prompt* their own check — see A2b. |
| ~~A3~~ | ~~`status_hidden` never clears~~ | **Closed 2026-08-19** by the active-effects panel: dismissal runs the authored "end" action, so Stop Hiding is a button. |
| ~~A4~~ | ~~Dodge's disadvantage not displayed~~ | **Closed 2026-08-19.** The AC widget now reports both mirrors, and shows both at once when both apply rather than resolving a rule the DM owns. |
| A5 | No opportunity-attack model | **Open** — see "reactions and external events" below |
| ~~A6~~ | ~~Two-weapon fighting's main-hand requirement~~ | **Closed 2026-08-19** as a warning, not enforcement: the off-hand attack card says it needs the Attack action first while `attacksRemaining` is null. Consistent with track-never-block. |
| A7 | No way to take the Attack action without swinging | **Recommend closing as won't-fix** — see below |

### A2b — actions do not prompt their own check

Now that skills are rollable, Hide could prompt a Stealth roll and Search a
Perception roll instead of leaving the player to click twice.
`AbilityCheckEffectSchema` is `{ type: "ability_check" }` with no fields; giving
it an optional `skillId` and having the resolver surface which check to roll
would close it. Small, and only worth doing if the two-click flow proves
annoying in play.

### A7 — recommend closing as won't-fix

Taking the Attack action *without* attacking has no representation, and giving
it one costs more than it returns. It needs either a new effect type
(`declare_attack_action`) or a special case in the resolver, and the only
scenario it serves is a character with no weapon who wants to open an allowance
they cannot spend — unarmed strikes already work, and they are `attack`
activations like any other. Reopen if a real trait ever keys off "you took the
Attack action" rather than off an attack landing.

### Reactions and external events (A1, A5)

These two share one root and should be designed together rather than
piecemeal. `EngineEventSchema` models seven things that happen *to you on your
own turn*; neither "a creature left my reach" nor "the condition I readied for
occurred" can be expressed. The groundwork is better than it looks —
`CombatEvent`, `reaction_window_opened` and `spendReaction` already exist and
Protection uses them end to end — so the work is extending the event
vocabulary and letting a player author a trigger, not building a reaction
system from nothing. Worth its own design pass.

---

## Open — defects found by the socket gateway test pass

Three defects surfaced when the gateway was first put under test on 2026-08-19.
All three are pinned by passing characterisation tests, so each fix has a test
to flip rather than a test to write.

| # | Item | Location | Effect |
| --- | --- | --- | --- |
| ~~S1~~ | ~~Rest zeroes short-rest resources~~ | — | **Fixed 2026-08-19.** The handler now reads `character_classes` inside its own transaction and passes the real ledger and total level to `RestEngine.applyRest`. Investigation found the defect was wider than first recorded: `restedCharges` returns `maxUses` for a `short_rest` resource on *either* kind of rest, so long rests drained them too, and `total_level_thresholds` resources were pinned to their level-1 value rather than zeroed. Four tests replace the characterisation test. |
| S2 | Replayed actions arrive in a different shape | [socket.ts:480](apps/server/src/gateway/socket.ts:480) | The fresh path emits `{ actorId, data }` via `io.to(room)`; the `requestId` replay path emits the bare payload via `socket.emit`. Both land on `character:action_resolved`, so a client reading `msg.data` gets `undefined` for every retried request. |
| S3 | ROOM_JOIN has no error path | [socket.ts:329](apps/server/src/gateway/socket.ts:329) | The handler has no try/catch, so a `characterId` from another campaign rejects the handler promise. socket.io drops it: the client gets no inventory snapshot and no error. Every other handler emits `action_error` or `error:rollback`. |

Two smaller findings, recorded but lower value:

- `ITEM_ATTUNED` is declared in `SOCKET_EVENTS` and has no server binding at
  all — a client emitting it is talking to nobody.
- `EQUIPMENT_SLOTS` advertises `head`, `cloak`, `boots`, `gloves`, `ring_1`,
  `ring_2` and `amulet`, but `isValidTargetSlotForItem` only ever returns true
  for `backpack`, the two hands and `armor`, so those seven slots are
  unreachable for every item type.

---

## Resolved — `add_specific_die` replaces the damage dice instead of adding to them

Found 2026-08-20 while implementing Brutal Critical. **Fixed 2026-08-20**; see
[the design](superpowers/specs/2026-08-20-critical-damage-segments-design.md).

The original entry judged this a representation problem — `1d12 + 1d6` could not
be written as one `NdX` string, so "the expression type has to grow." It did not
have to grow: `DamageSegment[]`, the shape spells already use and
`ActionResolver` already rolls, expresses a mixed-size *and* mixed-type pool with
per-segment source attribution. `DiceEngine.parse` was left untouched.

Investigation found the defect was wider than recorded. Two further gaps, both
fixed here:

- **Critical dice never reached a roll.** `applyCriticalHitModifier` fed only
  `damageExpression` / `criticalDamageExpression`, which are display strings.
  `AttackEffectSchema` carried no critical dice at all, so on a natural 20 the
  resolver rolled the weapon's base dice once, unmodified. Brutal Critical
  existed on the sheet and nowhere in the live roll.
- **Base crit doubling was absent.** A critical hit meant "normal dice plus
  whatever modifiers add". Damage dice now double, RAW, before any modifier
  applies; the 8 crit assertions that pinned the old values were updated.

`CombatEngine` now resolves a `criticalDamage` pool ahead of the roll and
`CharacterEngine` stamps it on the synthesized action, guarded so a thrown
weapon's ranged swing does not inherit a melee-only rule's dice.

**One load-bearing assumption**, documented rather than enforced: `add_base_die`
grows segment zero, which `WeaponSynthesizer` guarantees is the weapon. If pack
content ever puts a rider ahead of the weapon, that inflates the wrong die and
`DamageSegment` needs a role discriminator.

---

## Resolved — socket gateway test coverage

Done on 2026-08-19. `apps/server/src/gateway/socket.ts` went from no tests at
all to **97.7% lines / 77.9% branches** across 82 tests in 7 files.

The harness is `src/gateway/__tests__/socketHarness.ts` plus `fakeDb.ts`. Only
two modules are replaced — `socket.io` and `@project/database`. The engine and
`campaignAccess` run for real, so `ROOM_JOIN` exercises the actual membership
check and `ACTION_INTENT` resolves genuine action-economy grants rather than
fixtures.

Two things the harness makes assertable that a round-trip test would not:

- **The three emit targets stay distinct.** `socket.emit` (sender only),
  `socket.to(room).emit` (room minus sender) and `io.to(room).emit` (room
  including sender) are recorded separately. The gateway uses all three
  deliberately and collapsing them would hide a real class of bug.
- **Writes are checked as SQL.** `renderSql` runs a captured `set`/`where`
  through `PgDialect`, so a test can prove the hp delta is
  `"characters"."current_hp" + $1` rather than a read-modify-write, and that the
  equip sweep still carries its `character_id` boundary.

Every assertion was mutation-tested: nine deliberate defects were injected into
`socket.ts` and each one turned the suite red. One early TTL assertion survived
its mutation, was found vacuous, and was rewritten to assert on effect count
instead of on `activeStates` (which dedupes).

Still uncovered, both needing engine fixtures that do not exist while the
core-pack migration is in flight: the `source: "actor"` happy path (needs a live
summon actor) and the optional roll-result fields (needs an action that rolls).

The backlog previously listed `ITEM_ATTUNED` and `INVENTORY_SYNC` as handlers
needing coverage. Neither is an inbound handler: `INVENTORY_SYNC` is emit-only,
pushed to the joining client during `ROOM_JOIN`, and `ITEM_ATTUNED` is unbound
(see S-findings above). The eleven real bindings are `ROOM_JOIN`, `HP_MODIFIED`,
`ROLL_RESULTS`, `ACTION_INTENT`, `TURN_STARTED`, `TURN_ENDED`, `ITEM_EQUIPPED`,
`ITEM_CONSUMED`, `RESOURCE_CONSUMED`, `REST_COMPLETED` and `disconnect`.

`apps/server/vitest.config.ts` keeps `testTimeout: 20000`. The note that a
harness avoiding the full app import would let it drop was about these tests —
which now run in ~1.5s a file — but the *route* tests still build a real Express
app through dynamic imports and still need the headroom. Lowering it is a
separate call.

One thing worth knowing before trusting `pnpm test:coverage` as a gate: the
configured 80% thresholds are not currently met workspace-wide and were not met
before this pass either. Server-wide coverage is ~49% statements / ~37%
branches, held down by `src/services` (~21%) and `src/routes` (~38%). The
gateway is now among the better-covered areas and raised the global number
rather than lowering it.

---

## Resolved

Item numbers are stable ids — gaps below are intentional, not renumbered.

- **#25 — `classLevels` should come from the class ledger** (`useFeatures.ts`).
  The class ledger already existed and was already hydrated end to end
  (`hydrateCharacterSheet` → `initialize` → `state.classLevels`); the hook was the
  only consumer still carrying a `|| { class_fighter: totalLevel }` fallback. Removed,
  so it now reads the store directly like every other consumer.
