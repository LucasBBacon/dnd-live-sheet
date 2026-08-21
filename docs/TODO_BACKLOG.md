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
| 23 | Fighting Style: Protection | `trait_fs_protection` in [traits/ported.json](packages/database/data/packs/core_2014_pack/traits/ported.json) | Reactions targeting *another creature's* roll |
| 24 | ✅ Resolved | `trait_fs_dueling` in the same segment | Implemented via hand-aware damage modifiers and a governing-stat modifier source |

Both locations moved: `fightingStyleDictionary.ts` was deleted in the pack
cutover (P4 below) and the fighting styles are pack content now.

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

Refreshed 2026-08-21, after the pack cutover. The previous list is preserved at
the bottom of this section; every item on it is now either closed or superseded.

The ordering principle is **fix the pipe before filling it**. Several content
gaps below are invisible or worthless until a delivery path above them works,
so authoring first would mean authoring into a hole.

### Tier 1 — broken for players today

| Order | Item | Why first |
| --- | --- | --- |
| 1 | ✅ **Equip slot validation** — see E1 below | **Closed 2026-08-21.** The gateway now decides legality with the engine's `canEquipTo`. Unblocks #32 and #33. |
| 2 | ✅ **S2** — replayed actions arrive in a different shape | **Closed 2026-08-21.** One channel, one shape. Severity was overstated — see the corrected note below. |
| 3 | **S3** — `ROOM_JOIN` has no error path | A cross-campaign id yields no inventory snapshot and no error. Silent. |

### Tier 2 — cheap content that makes existing characters work

| Order | Item | Why here |
| --- | --- | --- |
| 4 | **#33** — 6 armours with no AC modifier | Unblocked: Tier 1 item 1 is closed, so an equipped suit now reaches the AC calculation. |
| 5 | **#32** — 23 weapons with no `weapon` block | A battleaxe that cannot attack. PHB values are well known and the schema already expresses them. |

Worth doing alongside these: give `CoreEquipmentSchema` an `implementation`
marker like traits and spells have. Equipment is the only section that cannot
declare its own gaps, which is precisely how #32 and #33 stayed invisible.

### Tier 3 — free wins

| Order | Item | Why here |
| --- | --- | --- |
| 6 | **#34, #35** — delete the two dead dictionaries | ~900 lines, zero readers, zero risk. |
| 7 | ✅ **#39** — `client.test.ts` cold-import timeout | **Closed 2026-08-21.** Was not a transform cost and did not want a raised timeout — see below. `pnpm test` is green again. |
| 8 | **#4f** — guard the destructive import | It has already destroyed 12 characters once. |

### Tier 4 — debt, before it compounds

| Order | Item | Why here |
| --- | --- | --- |
| 9 | **#37** — three hand-built copies of the equipment/resource projection | They will drift. Cheapest to fix while all three are fresh. |
| 10 | **#36** — `SUMMON_ACTOR_DICTIONARY` into the pack | The last live rules content outside it. |
| 11 | **#40** — restore the node-types guard in web's tsconfig | Small, and it protects a boundary that is easy to erode quietly. |

### Tier 5 — the burndown

| Order | Item | Why here |
| --- | --- | --- |
| 12 | **#30** — 456 unimplemented traits | The largest item and fully parallel. Go class by class, in the order the table actually plays. Barbarian is the worked example to copy. |
| 13 | **#31** — 111 unimplemented spells | Lower than the count suggests: `level` and `school` are placeholders too, so these need real data before they need rules. |

### Tier 6 — design passes, not before Tiers 1-4

| Order | Item | Why last |
| --- | --- | --- |
| 14 | **A1 + A5 + #23 together** | One root, not three items. `EngineEventSchema` cannot express "a creature left my reach", and Protection needs reactions targeting another creature's roll. Deserves its own design pass. |
| 15 | **#41, #42** — two-mode import, honouring `extends` / `owns` | Genuinely blocked until a second pack exists. Building it now is composition machinery with nothing to compose. |
| 16 | **A2b** polish, **A7** close as won't-fix, **#43** when a browse endpoint wants it | Optional or conditional. |

Tiers 1-3 are roughly a day's work and are what turn "structurally complete"
into "actually playable". Tier 6 should not start until 1-4 are done —
reactions are hard enough without a broken equip path underneath them.

### E1 — armour cannot be equipped; seven slots are unreachable ✅

Found 2026-08-21 while ordering this list, **fixed the same day**. This is the
"two equip bugs" the sample characters were already known to expose. The
diagnosis below is kept, with two corrections found while fixing it.

[`isValidTargetSlotForItem`](apps/server/src/gateway/socket.ts:57) returns
`targetSlot === "armor"` for armour, but **`"armor"` is not a member of
`CharacterSlotSchema`** ([items.ts:51](packages/shared/src/schemas/items.ts:51)),
which authors the slot as `"body"`. `payload.targetSlot` reaches the validator
unmapped, so every armour equip throws `Invalid slot 'body' for item '...'`.

Its `itemType` parameter is also typed `"armor" | "weapon" | "consumable" |
"gear"`, and the call site casts to that union. The pack's fifth type,
`"wondrous"`, falls through to `return false` — which is why `head`, `amulet`,
`cloak`, `gloves`, `ring_1`, `ring_2` and `boots` are unreachable for every
item.

The client does not share the restriction: `inventorySlots.test.ts` passes with
`ring_1` and `body`. So the sheet shows a ring equipped and the server refuses
the sync, which makes this a divergence rather than a shared limitation.

**Corrections found while fixing.** The failure was two gates deep, not one:
`EQUIPMENT_SLOTS` in [operational.ts](packages/database/src/schema/operational.ts:173)
was a *second*, hand-maintained slot vocabulary that had drifted from
`CharacterSlotSchema` — it named the body slot `armor` and had no `body` at
all. A client sending `body` was rejected by that set with "Invalid equipment
slot target." and never reached `isValidTargetSlotForItem`, so the error
message quoted above is not the one players actually got. And `"wondrous"`
falling through was not why the seven slots were unreachable: the type-driven
check could not express `head`/`cloak`/`boots` for *any* type.

**Root cause.** The equip-legality model had already moved to the item's
authored `equipSlot` ([`canEquipTo`](packages/engine/src/rules/equipSlots.ts:44)),
and shared, engine and the web store all adopted it. The gateway was never
migrated and kept a private id-prefix copy.

**Fix.**

- `EQUIPMENT_SLOTS` is now `CharacterSlotSchema.options` — a projection, not a
  restatement, so the two lists cannot drift again.
- The gateway calls `canEquipTo`; `inferItemTypeFromId` and
  `isValidTargetSlotForItem` are gone. An item whose `item_rule` is null can no
  longer be worn on the strength of its id prefix, but can still be stowed,
  since the backpack is the null slot.
- The contention sweep uses `slotsConsumedBy`, so a two-handed weapon now frees
  the off hand instead of leaving a shield equipped beside a longbow.
- `ItemEquippedPayload.targetSlot` is typed `CharacterSlot` rather than
  `string`. The bare string was the hole this class of bug flowed through: it
  let a client author a slot the server had never heard of. The gateway still
  validates it at runtime, because a socket payload is untrusted regardless of
  what the type says.
- Both `LEGACY_SLOT_ALIASES` tables are gone, and `seedDevInventory.ts` — the
  last writer of `slot: "armor"`, months after migration
  `0008_slot_body_rename.sql` renamed it — now seeds `body` and is typed
  `CharacterSlot` so it cannot drift again. The pre-migration names are now
  rejected on the wire and degrade to carried on the way into the store, rather
  than being quietly translated.

  Worth recording why the second alias was never legacy: `ring` is a live
  `EquipSlot` — the *definition* kind, authored on real pack items — while
  `ring_1`/`ring_2` are `CharacterSlot` instances. Aliasing one to the other
  conflated the two vocabularies, and hardcoding `ring_1` ignored whether that
  finger was already occupied, which is what `firstFreeSlot` exists for.
- The broadcast now carries the slot that was stored rather than the one that
  arrived. `placeItem` re-checks a broadcast slot and does *not* alias, so
  relaying a legacy name would have silently dropped the update on every other
  sheet.

### E2 — no weapon can be held in the off hand, so two-weapon fighting is unreachable

Found 2026-08-21 while fixing E1. All 26 pack weapons are authored
`equipSlot: "main_hand"`, and `SLOT_INSTANCES.main_hand` is `["main_hand"]`, so
`canEquipTo` refuses any weapon in `off_hand`. Only the shield reaches that slot.

This is a **model gap, not a data gap** — a one-handed weapon can be held in
either hand, so the off hand is a matter of the weapon's properties rather than
a second authored slot. Marking every weapon `equipSlot: "off_hand"` as well
would also let a greatsword be dual-wielded.

Not urgent: the client has enforced this all along, so no character has ever
had an off-hand weapon. Before the pre-fix gateway is missed, note that it
accepted them without checking `light`, so it would have persisted a
dual-wielded maul. Worth a design pass alongside the Tier 6 reaction work,
since two-weapon fighting needs a bonus-action attack to be worth anything.

### Superseded — the previous sequence

Kept so the change of direction is visible rather than silent.

1. ~~**2c inventory (#18, #19)**~~ — closed.
2. ~~**P3 remainder (#26, #29)**~~ — both closed.
3. **2e (#23)** — still open, now folded into Tier 6 item 14 with A1 and A5.
4. ~~**Typecheck / API drift cleanup**~~ — the workspace reports 0 errors and lint is clean.


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
| ~~S2~~ | Replayed actions arrive in a different shape | [socket.ts](apps/server/src/gateway/socket.ts) | **Fixed 2026-08-21.** The replay path now wraps the cached resolution in `{ actorId, data }` exactly as the fresh broadcast does, so `character:action_resolved` carries one shape. It stays sender-only on purpose: the fresh path already reached the room, and re-broadcasting would apply the action to the table twice. **The recorded symptom was wrong** — the client never read `msg.data`. `subscribeToActionResolved` runs every payload through `unwrapServerBroadcastPayload`, whose guard tests for `actorId`, so both shapes already decoded correctly and retries worked. The real cost was a latent trap that fires *only on a retry*, for any future consumer reading `.data` or `actorId`. Note this does **not** retire `MaybeServerBroadcastPayload`: `INVENTORY_SYNC` is also emitted bare, and defensibly so — it answers `ROOM_JOIN` with a snapshot that has no triggering actor. |
| S3 | ROOM_JOIN has no error path | [socket.ts:329](apps/server/src/gateway/socket.ts:329) | The handler has no try/catch, so a `characterId` from another campaign rejects the handler promise. socket.io drops it: the client gets no inventory snapshot and no error. Every other handler emits `action_error` or `error:rollback`. |

Two smaller findings, recorded but lower value:

- `ITEM_ATTUNED` is declared in `SOCKET_EVENTS` and has no server binding at
  all — a client emitting it is talking to nobody.
- `EQUIPMENT_SLOTS` advertises `head`, `cloak`, `boots`, `gloves`, `ring_1`,
  `ring_2` and `amulet`, but `isValidTargetSlotForItem` only ever returns true
  for `backpack`, the two hands and `armor`, so those seven slots are
  unreachable for every item type. **Root cause found 2026-08-21 — see E1 in
  the Recommended sequence.** It is worse than recorded here: `"armor"` is not
  a `CharacterSlot` at all, so no armour can be equipped either. Promoted to
  the top of the sequence; this is no longer a "smaller finding".

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

---

## P4 — Core rule pack cutover fallout (opened 2026-08-21)

The pack is now the only source of rules content: the static dictionaries and
`packages/database/data/*.json` are deleted, and reference data reaches the
database only through `pnpm --filter @project/database db:import-pack`. See
`docs/superpowers/plans/2026-08-20-core-pack-load-path.md`.

The workspace is green (1597 tests, 0 failures; typecheck and lint clean), so
nothing below is breaking a build. These are content gaps and loose ends the
cutover either created or made visible.

### 4a. Authoring burndown — the headline number

| # | Item | Scale | Notes |
| --- | --- | --- | --- |
| 30 | Traits marked `implementation.mode: "unimplemented"` | **456 of 700 (65%)** | They exist so progressions resolve and carry no rules. Fighters, wizards, monks and the rest have structure and no mechanics. Query the pack for the marker to get the current list. |
| 31 | Spells marked `unimplemented` | **111 of 111** | Every spell in the pack is a stub with a `no_effect` action; `level` and `school` are placeholders, which the marker's summary says outright. |

This is the deliberate, accepted trade recorded in the design doc — a marked
stub is honest, a half-faithful transform is not. The marker is what makes it a
measurable burndown rather than the silent `effects: []` placeholders it
replaced.

### 4b. Content the port could not carry

`items.json` authored only `id`, `name`, `type`, `weight`, `lore` and `cpCost`,
so the 57 items ported out of it arrived without their mechanics. Equip slots
and bundle contents were recovered during the cutover; these two were not,
because the data to recover them never existed in that file.

| # | Item | Scale | Notes |
| --- | --- | --- | --- |
| 32 | Ported weapons carry no `weapon` block | **23** | `item_weapon_battleaxe`, `_blowgun`, `_club`, `_crossbow_hand`, `_crossbow_heavy`, `_flail`, `_glaive`, `_greatclub` and 15 more. They equip and weigh correctly and roll no attack. `CoreEquipmentSchema` has nowhere to mark this, unlike traits and spells. |
| 33 | Ported armour carries no AC modifier | **6** | `item_armor_breastplate`, `_chain_shirt`, `_half_plate`, `_hide`, `_ring_mail`, `_splint`. They are wearable and grant nothing. |

Both live in
[equipment/legacy.json](packages/database/data/packs/core_2014_pack/equipment/legacy.json).
Authoring them is the same per-item work as #30, and cheaper — the PHB values
are well known and the schema already expresses them.

### 4c. Rules content still outside the pack

"Packs are the only source" is true for traits, races, classes, subclasses,
feats, backgrounds, equipment, spells and resources. Three files in
`packages/engine/src/rules/` were not part of the migration.

| # | Item | Location | Status |
| --- | --- | --- | --- |
| 34 | `SPELL_DICTIONARY` — 3 spells | [spellDictionary.ts](packages/engine/src/rules/spellDictionary.ts) | **Dead.** Nothing reads it, and the pack carries 111 spell ids it duplicates three of. Delete it, or fold its three authored spells into the pack as the first non-stub spells and then delete it. |
| 35 | `CLASS_STARTING_EQUIPMENT` / `BACKGROUND_STARTING_EQUIPMENT` — 802 lines | [startingEquipmentDictionary.ts](packages/engine/src/rules/startingEquipmentDictionary.ts) | **Dead.** Neither export has a reader anywhere in the workspace. Pack classes and backgrounds carry their own `startingEquipment`, which is what validation checks. |
| 36 | `SUMMON_ACTOR_DICTIONARY` | [summonActorDictionary.ts](packages/engine/src/rules/summonActorDictionary.ts) | **Live** — `characterEngine` and `actionResolver` both resolve blueprints from it. Genuine rules content sitting outside the pack; needs a pack section before the claim is unqualified. |

`proficiencyDictionary.ts` is deliberately excluded: it is a roster of valid
proficiency ids consumed by the extractors and calculators, not authored rules.

### 4d. Loose ends

| # | Item | Notes |
| --- | --- | --- |
| 37 | `toRuleSnapshot` carries only the four id-keyed rulebook maps | Equipment and resources are rebuilt by hand in three places — `ruleSnapshotCache`, the engine's `corePackLookup()` and the web `packFixture`. Three copies of the same projection will drift. Either widen `toRuleSnapshot` or export one shared builder. |
| 38 | `db:push` cannot run non-interactively | drizzle-kit demands a TTY for its data-loss prompt, so the cutover import skipped it. Fine while the schema is stable; a blocker the first time a migration is actually needed in CI. |
| ~~39~~ | `client.test.ts` fails on a cold run | **Fixed 2026-08-21 by stubbing the schema graph, not by raising the timeout.** The recorded mechanism was wrong: transform was only 801ms of the 4.3s. The cost was module *evaluation* — `vi.resetModules()` plus the dynamic `import("../client.js")` force the real schema modules to be re-evaluated on every run, constructing ~40 drizzle tables and, through `operational.js`, all of `@project/shared`'s zod schemas. That left the first test at **3331ms against a 5s default even when run alone**, so it went red under `turbo`'s parallel load and green in isolation — which is exactly why it read as a cold/warm effect. Raising the timeout would have kept a 3.3s test one CPU spike from red. Neither assertion needs the schema's content (the second only asks that drizzle received *an object*), so both modules are now `vi.mock`ed: **3331ms → 49ms**. Verified the stubs did not neuter it by removing the `DATABASE_URL is missing` throw from `client.ts` and confirming the test still fails. |
| 40 | `apps/web/tsconfig.app.json` now includes `node` types | Added for the test fixtures that read the pack off disk. It weakens the guard that kept node APIs out of browser code. A separate tsconfig for `src/**/__tests__` would restore it. |

### 4e. Deferred by the plan, still deferred

| # | Item | Notes |
| --- | --- | --- |
| 41 | Two-mode import | Wholesale replacement for owned sections, entity-scoped for the rest. The importer's `TRUNCATE ... CASCADE` is correct while one pack owns everything; a second pack needs this first. `class_progressions` is keyed `(classId, level, traitId)`, so the unit of replacement is the parent entity, not the row. |
| 42 | Nothing reads `extends`, `owns` or `ruleset` | The declarations landed so packs are authored correctly from the start and the contract is fixed. Composition honours none of them yet. |
| 43 | No `resources` reference table | `pack.resources` reaches the runtime through the payload. Only needed when a browse endpoint wants to query resources. |
| 44 | Relentless Rage | Parked in `docs/superpowers/specs/2026-08-20-relentless-rage-design.md`. Unblocked by the cutover. |

### 4f. Note on the destructive import

`persistCoreRulePack` truncates the reference tables `CASCADE`, which reaches
character data — the cutover removed 12 characters, 184 `character_traits`, 104
inventory rows and 2 `character_custom_traits`. `db:seed:samples` restores the
ten fixture characters; anything hand-made is not recoverable. Worth a
confirmation prompt, or a documented warning on the script, before anyone runs
it against data they care about.
