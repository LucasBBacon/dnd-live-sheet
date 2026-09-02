# TODO Backlog

**Status as of 2026-09-02.** The workspace is green — **1779 tests**, 0
failures, lint clean, `check:hygiene` passing, and **typecheck clean across
all five packages** (verified per package, not through turbo — 6f explains why
that distinction matters). Nothing below is breaking a build; these are gaps,
debt and content.

Read [Recommended sequence](#recommended-sequence) first — it is the ordered
list, re-measured against the working tree on 2026-09-02. **Tiers 1-3 of the
previous pass are closed, and so are #32, #33 and #55.** What remains is
mostly the authoring burndown.

Item numbers are stable ids. Gaps in the numbering are intentional, closed
items are struck through rather than deleted, and superseded decisions are kept
with their reasoning visible so a change of direction is never silent.

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

Refreshed **2026-09-02**, after the item-actions branch (49 commits) landed
without touching this file. Every item below was re-measured against the
working tree that day, and three entries changed state as a result.

**Closed since the last pass, by that branch rather than by a backlog run:**
#32 (23 weapons with no `weapon` block) and #33 (6 armours with no AC or
category) are **both done** — every equipment gap marker is gone, the
battleaxe carries real PHB stats, and the breastplate carries `medium` and
AC 14 with a Dex cap of 2. Equipment grew from 57 entries to 171. #55 is
closed too: the `characterEngine.ts(366,66)` error is gone, and all five
packages typecheck clean when checked per package.

The ordering principle has changed again, because the previous two are spent.
"Fix the pipe before filling it" is done. "Silent wrong before loud missing" is
done — the guards are in and green. What is left is overwhelmingly **loud
missing**: 576 of 700 traits and 111 of 111 spells carry no rules. So the
principle for this pass is **shrink the problem before working it**.

That is not a stalling tactic. 112 of those 576 stubs are referenced by
nothing at all, and 23 of them duplicate traits that already work. Deleting
them is a morning's work that makes every subsequent estimate honest, and the
burndown is large enough that an honest estimate is worth having.

`🟢` marks an easy win: self-contained, with a template or a test to prove it.

### Tier 1 — make the burndown honest (hours, not days)

**Tier 1 is closed as of 2026-09-02.** It found a live defect on the way — the elf race granted a stub and elves received no languages. **Tier 2 (#30) is now the top of the list**, and its first class is under way: `feat/barbarian-traits` closed 15 of the barbarian's 21 stubs and built the table-note surface, the affinity and table-rule reporters, and the resource-snapshot fixes that the other eleven classes inherit.

| Order | Item | Why first |
| --- | --- | --- |
| 1 | ✅ **#57** — orphan stub traits deleted | **Closed 2026-09-02.** 113 removed. The guard found 114 unreachable, not 112, and **two carried real rules** — see 7d. |
| 2 | ✅ **#58** — reachability guard added | **Closed 2026-09-02.** `collectReferencedTraitIds` in `validatePack.ts` beside the forward checks, eight unit tests (one per reference site), and `traitReachability.test.ts` over the shipped pack. Sabotage-verified. |
| 3 | ✅ **#51** — every rule-free trait now declares itself | **Closed 2026-09-02.** 119 marked; the characterisation test is now the invariant `expect(unmarked).toEqual([])`. Six may deserve `manual_sheet_helper` instead — a ruling worth making, see 7d. |

### Tier 2 — the burndown, which is now the actual work

| Order | Item | Scale | Why here |
| --- | --- | --- | --- |
| 4 | **#30** — reachable trait stubs | **447** | Re-measured 2026-09-02 after the barbarian pass, which closed 15 and deleted the two Primal Path signposts: 462 → 447, of 585 traits rather than 587. The earlier rise from 456 came from marking 119 silent stubs while deleting 113 unreferenced ones, so the number means "granted to a character and does nothing" rather than "tagged by the port". Every one is reachable. Per-class breakdown below. |
| 5 | **#31** — spells | **111 of 111** | Two passes, not one. `level` is `0` for every spell and `school` is `evocation` for every spell, so these need real **data** before they can carry rules — which is why this sits behind #30 despite the smaller number. |
| 6 | **#36** — `SUMMON_ACTOR_DICTIONARY` into the pack | — | The last live rules content outside the pack, two real readers, re-verified 2026-09-02. Until it moves, "packs are the only source of rules" carries an asterisk. |

**Where the remaining stubs sit**, so #30 can be picked up by whoever is
playing what. Only the barbarian row was re-counted on 2026-09-02; the other
eleven are as measured before that pass and each still carries its subclass
signposts:

| Class | Stubs | Class | Stubs |
| --- | --- | --- | --- |
| warlock | 63 | rogue | 35 |
| monk | 48 | ranger | 33 |
| wizard | 48 | sorcerer | 33 |
| cleric | 47 | paladin | 32 |
| fighter | 41 | bard | 25 |
| | | druid | 24 |
| | | **barbarian** | **6** |

Barbarian is the worked example and is now most of the way down. Fifteen of
its 21 closed on `feat/barbarian-traits`: nine sheet helpers carrying table
notes, Bear totem's twelve resistances, Primal Champion, Eagle totem, the
Bear aspect, and the two Primal Path signposts deleted outright. Six remain,
each waiting on engine vocabulary the branch specified but did not build:

| Trait | Waiting on |
| --- | --- |
| `trait_berserker_frenzy` | dynamic weapon attacks (spec §5) |
| `trait_berserker_retaliation` | dynamic weapon attacks (spec §5) |
| `trait_berserker_mindless_rage` | condition suppression (spec §4) |
| `trait_indomitable_might` | the `minimum_total` dice rule (spec §4) |
| `trait_berserker_intimidating_presence` | save modifiers in the resolver (spec §3) |
| `trait_relentless_rage` | uses-mode resources and `self_save` (spec §3) |

The design for all six is settled in
`docs/superpowers/specs/2026-09-02-barbarian-traits-design.md` and planned as
Slices 4 to 8 in `docs/superpowers/plans/2026-09-02-barbarian-traits.md`.
Races are nearly done — 9 stubs across elf, halfling, gnome and the shared
core file.

### Tier 3 — small, and each closes a loose end

| Order | Item | Why here |
| --- | --- | --- |
| 7 | 🟢 **#56** — pin engine's TypeScript | `packages/engine` declares `"typescript": "latest"` and resolves **7.0.2** while every other package is on 6.0.x. One package compiling on a different major than the rest, movable by any install, with no diff anyone reviews. Pin it or upgrade the workspace — but decide, rather than leave it floating. |
| 8 | 🟢 **#54** — confirm the reset-condition migration ran | `0013_add_reset_conditions.sql` is generated and journalled. Whether it has been applied to a live database cannot be checked from the tree. Until it has, the code accepts `initiative_roll` and `start_of_turn` and the database rejects them. |
| 9 | **#53** — a unit test for the line-ending check | Sabotage-verified but with no permanent test, because nothing owns `scripts/`. Needs a root vitest project or a move into a package; `expectedEnding` and `classifyEndings` are pure and exported ready for it. |
| 10 | **#52** — 80 project-source files are LF against a CRLF tree | Was 73 on 2026-08-24; the item-actions branch added 7 more, which is the argument for doing it rather than watching it grow. Normalising changes no committed content. Not gated, deliberately — see 6b. |

### Tier 4 — design passes

| Order | Item | Why last |
| --- | --- | --- |
| 11 | **#23 + A1 + A5 + E2 together** | One root. `EngineEventSchema` models only what happens to you on your own turn, so Ready, opportunity attacks and Protection are all unexpressible; two-weapon fighting joins them, because an off-hand attack needs a bonus action to be worth anything. `CombatEvent`, `reaction_window_opened` and `spendReaction` already exist, so this extends a vocabulary rather than building a system. |
| 12 | **A2b**, **S5** | Both small judgement calls. `AbilityCheckEffectSchema` is still `{ type }` with no `skillId`, so Hide and Search still do not prompt their own check; S5's right treatment is page-level, which is a UI decision rather than a defect. |

### Tier 5 — blocked or conditional; do not start

| Order | Item | Status |
| --- | --- | --- |
| 13 | **#41, #42** | Blocked until a second pack exists. |
| 14 | **#43** | Conditional on a browse endpoint needing to query resources. |
| 15 | **#38** | `db:push` needs a TTY. #54's migration went through `db:generate` + `db:migrate`, which is the right path anyway, so this reads as less pressing than it did. |
| 16 | **#37** remainder | Deliberate, re-verified 2026-09-02. `ruleSnapshotCache` projects the relational `items` table, not `pack.equipment`; it is not a third copy. |
| 17 | Coverage thresholds | ~49% / ~37% server-wide against a configured 80%. Not usable as a gate until `src/services` and `src/routes` move. |

**Suggested first sitting:** Tier 1 entire — delete the 112 orphans, add the
unreferenced-trait guard, mark what is left. That is a morning, it removes 23
actively misleading duplicates, and it means the number everyone quotes for
#30 is finally the number of traits that actually need rules.

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

### E3 — equipment declares its own gaps ✅

Done 2026-08-21. `CoreEquipmentSchema` now carries an optional
`implementation: { gaps, summary }`, designed in
[the spec](superpowers/specs/2026-08-21-equipment-implementation-marker-design.md).

It deliberately **does not** copy the trait and spell `mode: "unimplemented"`
shape. Those describe a rule that is wholly absent; equipment's gaps are
partial — a battleaxe equips, weighs correctly and carries its proficiency tags,
and only its attack is missing. Naming the missing facet describes that
accurately, and is what makes the gaps countable and checkable.

29 items marked: 23 weapons `["weapon"]`, 6 armours
`["armor_class", "armor_category"]`. No gaps were filled.

The guard is `packages/database/src/__tests__/equipmentGaps.test.ts`, which
derives each item's real gaps from its data and requires them to equal what the
item declares. Both directions fail: an undeclared gap, and a marker left behind
after a gap is filled. Verified by sabotage in each direction rather than
assumed — worth doing, because the comparison had a bug on first write that let
six mismatches pass.

**Follow-up: nothing cross-checked the trait or spell markers.** ✅ **Done
2026-08-24** — `implementationMarkers.test.ts`, built on this test's shape and
sabotage-verified the same way. Every existing assertion on those markers had
been a spot-check, so they could drift out of step with their data exactly the
way the two slot vocabularies did before E1. They had not drifted in the
direction feared; they had drifted in the other one. See #51.

### S5 — a failed room join reports itself on the inventory banner

Found 2026-08-21 while closing S3. `ROOM_JOIN`'s `action_error` now reaches the
sheet, but it arrives through `setInventoryError`, which renders an
inventory-scoped banner. The actual condition is broader: the character could
not be bound to the campaign at all, so the whole sheet is unbacked, not just
the inventory list.

Strictly better than the silence it replaces, and deliberately minimal. The
right treatment is probably page-level — the route knows it asked for a
character in a campaign and got refused — but that is a UI design decision
rather than a defect, so it is recorded rather than guessed at.

### S6 — `ITEM_ATTUNED` is emitted by the client and bound by nobody

Promoted 2026-08-24 from the "two smaller findings" list below, where it was
recorded as "a client emitting it is talking to nobody" and rated lower value.
Re-checking it against the working tree makes it the last Tier-1 defect, so the
severity call is corrected here rather than left standing.

**The event is live on the client, not vestigial.** `characterSheetStore` emits
it from two call sites — [:800](apps/web/src/store/characterSheetStore.ts:800)
when an attunement is formed and
[:836](apps/web/src/store/characterSheetStore.ts:836) when one is broken — and
[LiveSheetProvider.tsx:67](apps/web/src/components/sheet/LiveSheetProvider.tsx:67)
subscribes to a broadcast that never comes.

`apps/server` has no listener at all; `socket.bindings.test.ts` pins the
absence. And `is_attuned` has **no gameplay writer anywhere on the server**:
the column is read on `ROOM_JOIN` and by the character route, and written only
by `seedSampleCharacters` and `seedDevInventory`.

So the full path is: the store applies the change locally, re-checks the
three-item cap, emits — and the change dies on the wire. Three consequences, in
descending order of how quietly they happen:

- **The bonus silently disappears on reload.** `InventoryExtractor` grants
  nothing from an unattuned item, so a Ring of Protection stops contributing
  the moment the sheet rehydrates from the server, with no error and nothing in
  the UI to explain it. The sample fixtures seed nine `isAttuned: true` rows, so
  this is reachable immediately rather than hypothetically.
- **The table never sees it.** Every other inventory mutation reaches the room.
  This one does not, so the other players' sheets show the item unattuned
  forever.
- **The server-side cap does not exist.** The store re-checks
  `ATTUNEMENT_LIMIT` on the broadcast path specifically because a hostile client
  "could push a fourth attunement" — but with no server binding there is no
  server-side enforcement at all, and that comment describes a defence that was
  never built.

Cheap to fix, which is why it leads the sequence rather than sitting with the
content items: `ITEM_EQUIPPED` is a near-identical handler with the same
ownership check, the same `character_inventory` write and the same broadcast
shape, and the gateway harness plus `renderSql` already exist to assert the
write stays scoped by `character_id`.

One decision the fix has to make rather than inherit: whether the server
enforces `ATTUNEMENT_LIMIT` or merely records what it is told. Consistent with
the track-never-block stance taken for A6, recording is defensible — but the
client comment above assumes enforcement, so the two should be made to agree
either way.

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
3. **2e (#23)** — still open, now folded into Tier 6 item 20 with A1 and A5.
4. ~~**Typecheck / API drift cleanup**~~ — the workspace reports 0 errors and lint is clean.

The **2026-08-21 tier list** that sat above E1 was itself retired on
2026-08-24. Of its sixteen entries, three were already ✅ in place (Tier 1),
one was ✅ (#39) and one done ahead of schedule (E3); the rest are carried
into the current tiers, several at a different priority. The two that moved
furthest are recorded where they moved: `ITEM_ATTUNED` up to Tier 1 (S6), and
#46 up from unlisted to Tier 1 item 2. The list is not reproduced here because
every line of it is either a ✅ that lives in its own section or an item with a
current row above.


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
| ~~A7~~ | ~~No way to take the Attack action without swinging~~ | **Closed 2026-08-24 as won't-fix** — see below |

### A2b — actions do not prompt their own check

Now that skills are rollable, Hide could prompt a Stealth roll and Search a
Perception roll instead of leaving the player to click twice.
`AbilityCheckEffectSchema` is `{ type: "ability_check" }` with no fields; giving
it an optional `skillId` and having the resolver surface which check to roll
would close it. Small, and only worth doing if the two-click flow proves
annoying in play.

### A7 — closed as won't-fix ✅

Taking the Attack action *without* attacking has no representation, and giving
it one costs more than it returns. It needs either a new effect type
(`declare_attack_action`) or a special case in the resolver, and the only
scenario it serves is a character with no weapon who wants to open an allowance
they cannot spend — unarmed strikes already work, and they are `attack`
activations like any other. Reopen if a real trait ever keys off "you took the
Attack action" rather than off an attack landing.

**Closed 2026-08-24.** The recommendation had stood since 2026-08-19 with no
counter-example raised against it, and an open item that nobody intends to
do makes the backlog look larger than it is. The reopening condition above is
unchanged and is the whole point of recording it rather than deleting it: if a
trait ever keys off *taking* the Attack action rather than off an attack
landing, this comes back.

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
| ~~S3~~ | ROOM_JOIN has no error path | [socket.ts](apps/server/src/gateway/socket.ts), [sheetErrorEvents.ts](apps/web/src/components/sheet/sheetErrorEvents.ts) | **Fixed 2026-08-21.** The handler now emits `action_error` like every other one. Three things the original note missed: (1) **the unguarded window was wider than the `characterId` branch** — `getCampaignMembershipRole` and the inventory `select` were also awaited outside any try/catch, so a DB fault there was equally silent; both are now covered, and a test drives the inventory read to fail on its own. (2) **State was already partially applied at the throw** — the socket had joined the room and set its context before the character was looked at. Membership was legitimately verified, so the fix reports the character failure and *keeps* the join; tearing it down would drop a player out of a campaign they belong to. A test pins that. (3) **The client filtered `action_error` by event** and listed only three inventory events, so a server-only fix would have stopped the error being silent on the wire while leaving it invisible to the player. The list is now `SHEET_ERROR_EVENTS` in its own module, includes `ROOM_JOIN`, and is named through `SOCKET_EVENTS` instead of loose strings (its own module because `react-refresh/only-export-components` rightly refuses a non-component export from a component file). One message covers "another campaign" and "no such character" — which of the two it was is not the client's business. |

Two smaller findings, recorded but lower value:

- `ITEM_ATTUNED` is declared in `SOCKET_EVENTS` and has no server binding at
  all — a client emitting it is talking to nobody. **Promoted 2026-08-24 to
  S6 above**, and no longer a smaller finding: the client emits it from two
  live call sites, so attunement is lost on reload and never reaches the
  room. This entry is kept for the record.
- `EQUIPMENT_SLOTS` advertises `head`, `cloak`, `boots`, `gloves`, `ring_1`,
  `ring_2` and `amulet`, but `isValidTargetSlotForItem` only ever returns true
  for `backpack`, the two hands and `armor`, so those seven slots are
  unreachable for every item type. **Root cause found 2026-08-21 — see E1 in
  the Recommended sequence.** It is worse than recorded here: `"armor"` is not
  a `CharacterSlot` at all, so no armour can be equipped either. Promoted to
  the top of the sequence; this is no longer a "smaller finding".

---

## Open — a rebuilt selection is credited to every node that offers the trait

Found 2026-09-02 by the review of the barbarian pass, in code that pass merged
rather than wrote.

`CharacterBootstrapper.selectionsFromChosenTraitIds` recovers which
`trait_choice` node a player answered by intersecting each unlocked node's
options with the flat set of `character_traits` rows whose source is
`player_choice`. The row records the trait and nothing else, so when two nodes
offer the same trait id the pick is credited to **both**. 78 trait ids in the
pack are offered by more than one node.

| Case | What happens |
| --- | --- |
| Fighter 1 / Ranger 2 who took `trait_fs_defense` once | Credited to `fighter_level_1_fighting_style` *and* `ranger_level_2_fighting_style` |
| Battle Master 15 | The maneuver nodes at 3, 7, 10 and 15 share an option list, so all nine picks land on all four nodes |

`resolveGrantedTraitIds` dedupes by `Set`, so no modifier is applied twice and
no sheet number is wrong today. What is wrong is the **save**: its `selections`
no longer describe what the player chose, and `collectSaveIssues` will report
`wrong_selection_count` against a save the store itself just built. Both the
server (`getAuthoritativeRuntimeContext`) and the web store rebuild selections
this way, so they agree with each other and are wrong together.

**The barbarian is unaffected** — the three Totem Warrior nodes have disjoint
option sets — which is why the pass that introduced the helper did not see it.

Two ways out: persist the answered `nodeId` on the `character_traits` row (a
migration, and the honest fix), or scope the intersection to the lowest-level
node that offers the id (no migration, wrong for a deliberate retake). Worth
settling before the fighter or the ranger pass, both of which are fighting-style
classes.

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
| 30 | Traits marked `implementation.mode: "unimplemented"` | **456 of 700** — but the workable figure is **464** | Re-measured 2026-09-02. Two corrections in opposite directions. **Up:** 119 further traits carry no rules and no marker (#51), so 576 of 700 are rule-free. **Down:** 112 of those 576 are referenced by nothing at all and should simply be deleted (#57). What is left — traits that are both rule-free and actually reachable — is **464**, and that is the number the burndown should quote. Per-class breakdown in the Recommended sequence. |
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
| ~~32~~ | ~~Ported weapons carry no `weapon` block~~ | — | **Closed by the item-actions branch, confirmed 2026-09-02.** All 23 carry a real `weapon` block; `item_weapon_battleaxe` is `martial_melee`, `1d8`, versatile `1d10`, slashing, range 5. No equipment entry declares a `weapon` gap any more, and `equipmentGaps.test.ts` asserts the list is empty. |
| ~~33~~ | ~~Ported armour carries no AC modifier **or category**~~ | — | **Closed by the item-actions branch, confirmed 2026-09-02.** All 6 carry both facets; `item_armor_breastplate` is `medium` with an `ARMOR_CLASS` `set_base` of 14 and `maxDexCap` 2. Both gap lists assert empty. |

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
| ~~34~~ | ~~`SPELL_DICTIONARY` — 3 spells~~ | — | **Deleted 2026-08-24**, with its one barrel export. Its three authored spells were deliberately *not* folded into the pack first: they would have been the only non-stub spells in a section of 111 stubs, and #31 should settle the section as a whole rather than by exception. |
| ~~35~~ | ~~`CLASS_STARTING_EQUIPMENT` / `BACKGROUND_STARTING_EQUIPMENT` — 802 lines~~ | — | **Deleted 2026-08-24.** Zero readers re-verified first; a pure deletion with nothing to repoint. |
| 36 | `SUMMON_ACTOR_DICTIONARY` | [summonActorDictionary.ts](packages/engine/src/rules/summonActorDictionary.ts) | **Live** — `characterEngine` and `actionResolver` both resolve blueprints from it. Genuine rules content sitting outside the pack; needs a pack section before the claim is unqualified. |

`proficiencyDictionary.ts` is deliberately excluded: it is a roster of valid
proficiency ids consumed by the extractors and calculators, not authored rules.

### 4d. Loose ends

| # | Item | Notes |
| --- | --- | --- |
| 37 | `toRuleSnapshot` carries only the four id-keyed rulebook maps | Equipment and resources are rebuilt by hand in three places — `ruleSnapshotCache`, the engine's `corePackLookup()` and the web `packFixture`. Three copies of the same projection will drift. Either widen `toRuleSnapshot` or export one shared builder. |
| 38 | `db:push` cannot run non-interactively | drizzle-kit demands a TTY for its data-loss prompt, so the cutover import skipped it. Fine while the schema is stable; a blocker the first time a migration is actually needed in CI. |
| ~~39~~ | `client.test.ts` fails on a cold run | **Fixed 2026-08-21 by stubbing the schema graph, not by raising the timeout.** The recorded mechanism was wrong: transform was only 801ms of the 4.3s. The cost was module *evaluation* — `vi.resetModules()` plus the dynamic `import("../client.js")` force the real schema modules to be re-evaluated on every run, constructing ~40 drizzle tables and, through `operational.js`, all of `@project/shared`'s zod schemas. That left the first test at **3331ms against a 5s default even when run alone**, so it went red under `turbo`'s parallel load and green in isolation — which is exactly why it read as a cold/warm effect. Raising the timeout would have kept a 3.3s test one CPU spike from red. Neither assertion needs the schema's content (the second only asks that drizzle received *an object*), so both modules are now `vi.mock`ed: **3331ms → 49ms**. Verified the stubs did not neuter it by removing the `DATABASE_URL is missing` throw from `client.ts` and confirming the test still fails. |
| ~~40~~ | ~~`apps/web/tsconfig.app.json` includes `node` types~~ | **Fixed 2026-08-24.** `tsconfig.app.json` is `["vite/client"]` again and excludes `src/**/__tests__/**/*`; the new `tsconfig.test.json` is the only project granted `node`. Verified both ways: `process.cwd()` in a component fails `tsc -b`, the same call in a test passes. The hole was real and confirmed before the fix — the probe type-checked clean beforehand. |

### 4e. Deferred by the plan, still deferred

| # | Item | Notes |
| --- | --- | --- |
| 41 | Two-mode import | Wholesale replacement for owned sections, entity-scoped for the rest. The importer's `TRUNCATE ... CASCADE` is correct while one pack owns everything; a second pack needs this first. `class_progressions` is keyed `(classId, level, traitId)`, so the unit of replacement is the parent entity, not the row. |
| 42 | Nothing reads `extends`, `owns` or `ruleset` | The declarations landed so packs are authored correctly from the start and the contract is fixed. Composition honours none of them yet. |
| 43 | No `resources` reference table | `pack.resources` reaches the runtime through the payload. Only needed when a browse endpoint wants to query resources. |
| 44 | Relentless Rage | Parked in `docs/superpowers/specs/2026-08-20-relentless-rage-design.md`. Unblocked by the cutover. |

### 4f. Note on the destructive import ✅

`persistCoreRulePack` truncates the reference tables `CASCADE`, which reaches
character data — the cutover removed 12 characters, 184 `character_traits`, 104
inventory rows and 2 `character_custom_traits`. `db:seed:samples` restores the
ten fixture characters; anything hand-made is not recoverable. Worth a
confirmation prompt, or a documented warning on the script, before anyone runs
it against data they care about.

**Closed 2026-08-24.** Both, as it turned out, rather than either: the script
counts the rows the CASCADE will actually take, prints them, and then refuses
unless `--yes` is passed. Counting first is the point — an operator now accepts
or refuses a real number rather than a caveat, and on an empty development
database the warning stays silent instead of crying wolf.

The decision is `parseImportInvocation` in `src/importInvocation.ts` rather than
inline in the script, because `scripts/importPack.ts` imports `client.ts` and so
cannot be exercised without a live `DATABASE_URL`. Six tests cover it, including
the two failure modes that would quietly disarm the guard: a flag read as a
path, and a prefix like `--y` counting as consent.

---

## P5 — Schema layering branch findings (opened 2026-08-23)

Found while executing `docs/superpowers/plans/2026-08-22-schema-layering.md`.

### 5a. Pack assembly is hand-reimplemented three times

| # | Item | Notes |
| --- | --- | --- |
| 45 | Three independent implementations of "read the manifest, strip assembly-only keys, merge the sections, parse through `CoreRulePackSchema`" | **Proven to drift, three times in one branch.** See below. |

The three copies:

| Path | Kind |
| --- | --- |
| `packages/database/src/corePackAssembler.ts` | The real one |
| `packages/engine/src/pipeline/__tests__/corePackFixture.ts` | Hand-copied |
| `apps/web/src/store/__tests__/packFixture.ts` | Hand-copied |

`apps/server/src/services/__tests__/packFixture.ts` is **not** a fourth. It calls
`assembleCoreRulePack()` instead of reimplementing, and it is the only one of the
four that never broke.

**The evidence this is a real cost, not a tidiness complaint.** Adding a single
`"$schema"` key to `manifest.json` — one key, for editor completion — broke both
hand-copied implementations, because each has its own destructuring that has to
strip assembly-only keys before the strict pack envelope sees them. The two
failures were found weeks apart in wall-clock terms and one at a time:

- The engine copy broke 16 suites. Worse, 14 of them threw at *module load*, so
  their tests were never collected at all — the suite reported 533 tests instead
  of 733 rather than reporting failures. Partial breakage shrinks the denominator
  instead of showing red.
- The web copy broke 4 more suites, 65 tests, the same way — and again the total
  silently dropped (266 instead of 284) rather than failing loudly.

**Why the copies exist, which is the part worth fixing.** `@project/database`'s
`package.json` sets `"main": "./src/client.ts"`, which eagerly imports
`drizzle-orm` and `postgres` and calls `dotenv.config()` at module evaluation.
A browser-side or engine-side test cannot import the package normally without
dragging a database driver in. `apps/server` works around this by *deep-importing*
`@project/database/src/corePackAssembler.js` — which works today only because the
build resolves internal paths, and is coupled to file layout rather than to a
stable export.

**Suggested fix.** `assembleCoreRulePack` is already dependency-clean — it imports
only `node:fs/promises`, `node:path` and `@project/shared`. So:

1. Add a DB-free subpath to `packages/database/package.json`'s `exports` map, e.g.
   `"./pack": { "types": "./src/corePackAssembler.ts", "default": "./src/corePackAssembler.ts" }`.
2. Repoint all three fixtures at `@project/database/pack`, deleting the two
   hand-copied implementations and the server's deep import.

One new export plus three file changes. Low risk, and it retires the whole bug
class rather than the current instance of it.

**Do this before the next change to `CoreRulePackSchema.pack` or to
`manifest.json`'s shape** — those are exactly the changes that trip it.

### 5b. Related, already recorded

Item #37 is the same disease in the projection layer rather than the assembly
layer: `ruleSnapshotCache`, the engine's `corePackLookup()` and the web
`packFixture` each rebuild equipment and resources by hand. Both items are
arguments for one shared, DB-free pack module; fixing #45 is the natural place to
absorb #37.

### 5c. Other findings from the same branch

| # | Item | Notes |
| --- | --- | --- |
| ~~46~~ | ~~`rest_condition` Postgres enum is missing two values~~ | **Fixed 2026-08-24.** `restConditionEnum` is now `pgEnum("rest_condition", ResourceResetSchema.options)` rather than a hand-written list — the `EQUIPMENT_SLOTS` treatment, so it is a projection and cannot drift again. Widening the column's inferred type broke nothing, because everything except this enum already worked off the seven-value schema. A **third** restatement turned up while fixing it: `SampleResourceRow.resetCondition` in `seedSampleCharacters.ts` spelled the same five values out again, so the seed could never produce a resource resetting on initiative or start of turn; it now uses the authored `ResourceReset`. Migration generated, not applied — see 6d. |
| ~~49~~ | ~~`importPipeline.ts` re-parses persisted payloads with no error handling~~ | **Fixed 2026-08-24.** The recorded fix — "mirror `parseRollbackRowPayload` across all four sites" — was right for three of them and wrong for the most important one. Apply and publish want a throw that names the row, and they get `parseImportRowPayload`. **Planning does not**: it collects issues, marks the run failed and only then throws, so an exception raised mid-loop escaped all of that, which is exactly why the run recorded nothing. `parseLedgerRow` returns an issue instead, and the existing machinery does the rest. `validateImportRun` was already fine and is untouched; the count was five unprotected sites, not four. |
| ~~50~~ | ~~Rows read from `traits.definition` and `core_rule_packs.payload` are never validated~~ | **Fixed 2026-08-24.** The two halves needed different policies. Traits are many rows, so `filterTraitsByCategory` copies `projectEquipmentRows` exactly — one unparsable row is named and skipped so a browse endpoint stays up, every row failing throws as a schema divergence, and an empty table is not a divergence. The pack payload is a single blob, so `parseStoredPackPayload` has no "skip it" option and throws; `ruleSnapshotCache` now parses once and reads both the snapshot and the resource map off the validated value, since validating one and not the other would have left half the read unchecked. |
| ~~48~~ | ~~**CI never runs the engine test suite**~~ | **Fixed on the schema-layering branch.** `test:all` now chains `@project/engine` between `shared` and `database`, so the Tests gate covers all five packages. Original finding retained below for the record. |
| 48 | **CI never runs the engine test suite** (resolved — see above) | `.github/workflows/ci.yml`'s Tests gate runs `pnpm test:all`, which chains `@project/{shared,database,server,web}` and omits `@project/engine` entirely — 734 tests, the largest suite in the repo. `packages/engine` does have a working `test` script; it is simply not in the chain. This is not theoretical: during the schema-layering branch a change to `manifest.json` broke 16 engine suites, and no CI gate would have caught it. Worse, most of that breakage was *invisible in the totals* — a fixture throwing at module load leaves its tests uncollected, so the suite reports a smaller denominator rather than failures. Fix is one clause in the `test:all` script, or switching the gate to `turbo run test`, which picks up every package with a `test` script. |
| ~~47~~ | ~~No repo safety net catches line-ending corruption~~ | **Fixed 2026-08-24.** `scripts/lineEndings.mjs`, wired into `check:hygiene` so it already gates `build` and `test:all`. It gates on the two unambiguous cases — a file containing both endings, and a file contradicting an explicit `.gitattributes` pin — and reports the platform-dependent third under `--report-eol` rather than gating it. Its first run found **four genuinely corrupted files**, all repaired: `ArmorClassWidget.test.tsx` (46 LF / 69 CRLF), `useCharacterStats.test.ts` (65 LF / 234 CRLF), `combatContext.test.ts` (53 LF / 186 CRLF) and `0010_nullable_subrace.sql` (2 LF / 1 CRLF). The recorded mechanism was understated: this was not only whole-file rewrites but **partial** ones. See #52 and #53. |


---

## P6 — Findings from the Tier 2 pass (opened 2026-08-24)

Both numbered items below were found *by* the guards added in Tier 2, on their
first run, which is the argument for the guards restated as evidence.

### 6a. #51 — 119 traits are rule-free and carry no marker at all

| # | Item | Scale | Notes |
| --- | --- | --- | --- |
| 51 | Traits with no rules and no `implementation` marker | **119** | Invisible to #30's count, and to any query for the marker. |

The cross-check was written to catch a *stale* marker — rules authored, marker
left behind. That direction is clean: zero traits are marked `unimplemented`
while carrying rules, zero claim `engine` delivery with nothing to deliver, and
the spell section is honest in both directions. What it found instead was the
opposite failure, and a larger one.

**576 of 700 traits (82%) carry no rules**, not the 456 (65%) #30 records:
456 marked `unimplemented`, 119 unmarked, and `trait_fs_protection` marked
`manual_sheet_helper` because the modifier vocabulary cannot express it (#23).

The worked example is `trait_dragon_ancestor_black`. Its own lore text names
acid resistance, Draconic literacy and doubled proficiency on Charisma checks
with dragons. It carries none of the three, and — unlike the 456 — says nothing
about carrying none of them. That is precisely the silence
`TraitImplementationMetadataSchema` was written to break: "a trait with no
modifiers is otherwise indistinguishable from one that deliberately grants
nothing".

`implementationMarkers.test.ts` pins the count at 119 and fails if it **rises**,
so a new silent stub cannot be added quietly. Lower it as they are marked.

Closing #51 is mostly mechanical, but each trait needs one judgement first:
rule-free because nobody authored it, or rule-free because it genuinely grants
nothing mechanical? The dragon ancestors answer the first way; some will not.
Worth doing before #30, for the same reason the cross-check came before the
burndown — an unmarked stub is not counted, and what is not counted is not
burned down.

### 6b. #52 — 73 project-source files are LF against a CRLF working tree

| # | Item | Scale | Notes |
| --- | --- | --- | --- |
| 52 | Files pure LF where this checkout's convention is CRLF | **73** in project source | 24 `apps`, 36 `packages`, 17 `docs`, plus `skills-lock.json`. A further ~300 sit in vendored `.claude/` and `.github/skills`, which are not ours to normalize. |

Reported by the #47 check, **deliberately not gated**. A whole file that is pure
LF cannot be told apart from a legitimate checkout made while `core.autocrlf`
was off, and the expectation inverts on a Linux CI runner — so failing on it
would be a platform accident rather than a check. `pnpm check:hygiene
--report-eol` lists them.

Worth knowing even though it is not gated:
`apps/server/src/gateway/__tests__/` alone holds **five LF files beside six
CRLF ones**. That inconsistency inside a single directory is what makes an
editing tool's whole-file rewrite invisible — there is no local convention left
for it to violate.

Normalizing them changes no committed content: with `core.autocrlf=true` git's
clean filter reconciles both sides, which was verified while repairing the four
mixed files (`git diff HEAD` stayed empty afterwards; note that `git status`
still shows ` M` from its stat cache, and `git diff` is the honest answer). It
is still 73 files touched at once, so it is a separate call rather than a
side effect of adding the check.

### 6c. #53 — the line-ending check itself has no unit test

`scripts/lineEndings.mjs` is verified by sabotage rather than by a permanent
test: a file corrupted to mixed endings turned the check red, and so did a file
rewritten against an explicit `eol=lf` pin. Both were reverted.

It has no unit test because there is nowhere to put one. `test:all` chains the
five packages and nothing owns `scripts/`, so a root-level test would not run
in CI. Either add a root vitest project or move the module into a package. Small,
and the check is load-bearing enough now to deserve it — `expectedEnding` and
`classifyEndings` are both pure and exported ready for it.


### 6d. #54 — the reset-condition migration is generated but not applied

`packages/database/drizzle/0013_add_reset_conditions.sql` adds the two missing
enum values and nothing else — confirmed by generating it against an otherwise
in-sync snapshot. It has **not been run**: applying a migration to a live
database is the owner's call, not a side effect of a backlog pass.

```bash
pnpm --filter @project/database db:migrate
```

Two things to know before running it:

- **It needs PostgreSQL 12 or newer.** `migrate.ts` uses drizzle's migrator,
  which wraps each migration in a transaction, and `ALTER TYPE … ADD VALUE`
  inside a transaction is a PG 12+ feature. Nothing in this repo pins a
  Postgres version. PG 12 reached end of life in November 2024, so any current
  install is fine — this is recorded because the failure mode is a confusing
  syntax-level error rather than an obvious version complaint.
- **The migration only adds values; it uses none.** That matters because even
  on PG 12+ a newly added enum value cannot be *used* in the transaction that
  added it. Nothing here does, so it is safe as written — but a future
  migration that adds a value and then inserts a row using it must be split.

Until it runs, the code accepts both new conditions and the database will
reject a write using either. Nothing in the pack authors one yet, so this is
latent rather than live.


### 6e. #45 in hindsight — both copies had already drifted

Recorded because the backlog argued #45 from a *future* risk ("they will
drift") when they already had, in two ways neither copy advertised:

- **Both omitted `proficiencies`.** The real assembler merges ten array
  sections; both copies listed nine. Any proficiency authored into a segment
  was silently dropped from every engine and web fixture.
- **Both skipped semantic validation.** Each called `CoreRulePackSchema.parse`
  directly instead of `parseCoreRulePack`, so neither ran
  `validateCoreRulePack` — id uniqueness and the spell-reference rule. The
  fixtures would have accepted a pack the importer rejects.

Both are gone by construction now. The guard against a third instance is
`corePackAssembler.test.ts`'s "merges every array section the pack schema
declares", which holds `MERGED_SECTIONS` against `CoreRulePackSchema.shape` —
the drift itself, pinned, rather than the symptom.

**One wrinkle the plan did not anticipate.** `assembleCoreRulePack` is async
and the two fixtures are consumed **synchronously in 75 places**, so a
straight repoint would have meant rewriting every call site. Instead the merge,
the assembly-key strip and the validation now live in one internal
`buildCoreRulePack`, with `assembleCoreRulePack` and
`assembleCoreRulePackSync` as thin readers around it. Two ways in, one
implementation, and a test asserts the two produce equal packs.

**A second wrinkle, caught only by `tsc`.** The shared projection was first
typed `RuleSnapshotLookup & { … }`, since that is what the engine consumes.
That type widens every map so it can accept a partial snapshot from any
source, and the web store's own snapshot type is narrower - so the web fixture
stopped typechecking while its **tests still passed**, because vitest does not
typecheck. `PackRuleLookup` is now built on `CoreRulePackSnapshot`, which is
what `toRuleSnapshot` actually returns, and stays assignable to
`RuleSnapshotLookup` where the engine wants it.

Worth remembering as a general point: a green web suite says nothing about
whether `apps/web` compiles. `tsc -b` is a separate gate and the only one
that saw this.


The `exports` map carries `"./src/*": "./src/*"` so the remaining deep
imports (`schema/reference.js`, `schema/operational.js`,
`utils/startingEquipment.js`, `corePackProjection.js`) keep resolving,
including the two `vi.mock` calls that name them. Giving those named subpaths
too is a follow-up, not a blocker.

### 6f. #55 — the engine typecheck was passing without running

`pnpm typecheck` reported "5 successful" on 2026-08-21 and twice on
2026-08-24. It is not currently true: `packages/engine` fails with

```
src/pipeline/characterEngine.ts(366,66): error TS2379: ... not assignable to
parameter of type 'ItemRequirementInput' with 'exactOptionalPropertyTypes: true'
```

**This is pre-existing and not from the #45 work.** Verified by parking every
engine change made here and running `npx tsc --noEmit` directly: the error
persists. It comes from the uncommitted `itemRequirements.ts` /
`characterEngine.ts` work already in the tree, and reproduces under **both**
TypeScript 6.0.3 and 7.0.2, so it is not a compiler-version effect either.

What hid it is turbo's cache: the gate replayed a stored success for an input
set that predated the WIP. Editing engine's `package.json` invalidated the
entry and the error surfaced. The same class of problem as #48 (a gate that
does not run) and as the fixture breakage above (a suite that under-collects) —
a green check that was never computed.

Worth deciding: whether `typecheck` should run with turbo caching at all, or
whether CI should pass `--force`. A cached typecheck is only sound if the task
inputs cover every file it reads, and for a project-wide `tsc` that is easy to
get wrong.

### 6g. #56 — engine's TypeScript floats on `latest`

`packages/engine/package.json` declares `"typescript": "latest"` while every
other package pins `^6.0.3` (web `~6.0.2`). The committed lockfile resolves it
to **7.0.2**, so the engine already compiles on a different major version than
the rest of the workspace, and any `pnpm install` can move it again without a
diff anyone reviews.

Left as-is deliberately: it is committed state, and pinning it is a toolchain
decision rather than a backlog cleanup. Recorded so the next unexplained
engine-only type error has somewhere to start.

---

## P7 — Findings from the 2026-09-02 re-measure (opened 2026-09-02)

The item-actions branch landed 49 commits without touching this file, so this
pass re-measured every open number rather than reading them off the page. Two
were already closed by that branch; two new items came out of the recount.

### 7a. #57 — 112 stub traits are referenced by nothing

| # | Item | Scale | Notes |
| --- | --- | --- | --- |
| 57 | Rule-free traits referenced by no race, class, subclass, background or feat | **112** | Deletable outright. 23 of them duplicate a trait that already works. |

The stated reason stubs exist is that "they exist so progressions can reference
them" — `TraitImplementationMetadataSchema` says so in as many words. For 112
of the 576 rule-free traits that reason does not hold: nothing anywhere in the
pack names them.

**23 are twins of working traits.** The pack carries both `relentless_endurance`
(defined in `races/half-orc.json`, with a resource, a `ON_HP_REDUCED_TO_ZERO`
trigger and a `macro_drop_to_one_hp` action) and `trait_relentless_endurance`
(in `traits/unimplemented.json`, no rules, lore reading "Not yet authored in
the pack"). Half-orc grants the working one. Nothing grants the twin. The same
pairing holds for `lucky`/`trait_lucky`, `savage_attacks`/`trait_savage_attacks`,
and twenty more.

Id uniqueness validation does not catch this, correctly — the ids genuinely
differ. What makes them duplicates is that they describe the same rule, and the
`trait_` prefix is the tell: it is the naming the port applied, sitting beside
the naming the authored content uses.

**Why this is worth an hour before the burndown starts.** It is the difference
between "456 traits need rules" and the truth. It also removes a live trap:
authoring Relentless Endurance's rules onto `trait_relentless_endurance` would
produce a trait that is complete, tested, and reaches no character — and the
marker cross-check would go green while doing it, because a marked stub gaining
rules is exactly what it is looking for.

### 7b. #58 — nothing checks that a trait is reachable

| # | Item | Notes |
| --- | --- | --- |
| 58 | No guard that every trait is referenced | The check that stops #57 recurring. |

Same shape as `equipmentGaps.test.ts` and `implementationMarkers.test.ts`:
derive the referenced set from the data — every `traitId` named by a race,
subrace, class progression, subclass progression, background or feat — and
require every trait in the pack to appear in it.

Do it **with** #57 rather than after, so the deletion has something holding it
down. Expect to allow a small deliberate exception list, or none at all: after
#57 the count should be zero, which is the cheapest possible assertion.

### 7c. What the item-actions branch closed

Recorded because the branch closed backlog items without saying so, and the
next reader deserves to know the page was behind rather than wrong.

- **#32** — all 23 weapons carry a real `weapon` block. `item_weapon_battleaxe`
  is `martial_melee`, `1d8`, versatile `1d10`, slashing, range 5.
- **#33** — all 6 armours carry both facets. `item_armor_breastplate` is
  `medium` with an `ARMOR_CLASS` `set_base` of 14 and `maxDexCap` 2.
- Equipment grew from 57 entries to **171**, and **zero** items now carry an
  `implementation.gaps` marker. `equipmentGaps.test.ts` asserts each gap list
  is empty, so the markers cannot come back unnoticed.
- 14 items carry authored `actions`.

`implementationMarkers.test.ts`'s counts were untouched by all of this: traits
are still 700 with 456 marked, and spells still 111 of 111 — so the branch
moved equipment and nothing else in the burndown.

### 7d. Tier 1 executed — what the reachability guard actually found

Done 2026-09-02. The plan was "delete 112 orphans"; the guard found 114
unreachable traits, and **two of them carried real rules**. Deleting on the
count alone would have destroyed working content, so both were checked before
anything was removed.

**`elf_languages` was a live defect, not an orphan.** Every race defines its
language trait as `race_<race>_languages` in its own file, carrying the actual
proficiencies — dragonborn, dwarf, gnome, half-elf, half-orc, halfling, human
and tiefling all do. The elf's was authored as `elf_languages`, without the
prefix. A stub then took the conventional id in `unimplemented.json`, and
`races/elf.json` granted **the stub**, so elves received no languages at all.

Fixed by renaming the real trait to `race_elf_languages` and deleting the stub
— a one-line change to `elf.json` — which brings elf in line with the other
eight races and leaves the race's existing grant untouched. Pinned by a test
asserting the elf's language trait grants `common` and `elvish`.

**`trait_powerful_build` is a deliberate exception.** It is the only grantor of
the `powerful_build` state, which `encumbrance.ts` reads and documents as read
"here and nowhere else". No core-2014 race has Powerful Build — it is Goliath
content — so the trait is authored, working, engine-supported content waiting
for a race to grant it. Deleting it would remove the only source of a state the
engine explicitly supports. `traitReachability.test.ts` names it in a
`DELIBERATELY_UNREACHABLE` list of one, so anything *else* going unreachable
still fails.

**The other 112 were exactly what they looked like** — rule-free stubs in
`traits/unimplemented.json` that nothing referenced, 27 of them `trait_`-prefixed
twins of a trait that already worked. All deleted, plus the elf stub: 113 rows.

#### The numbers now

| | before | after |
| --- | --- | --- |
| traits in the pack | 700 | **587** |
| rule-free | 576 | **463** |
| marked `unimplemented` (#30) | 456 | **462** |
| rule-free **and unmarked** (#51) | 119 | **0** |
| unreachable | 114 | **1** (documented) |

#30's marked count *rose*, which is the point: 113 stubs left, 119 silent ones
were marked, and the number now means "traits that are granted to a character
and do nothing" rather than "traits the port happened to tag". The workable
burndown is 462 rather than the 464 estimated, and every one of them is
reachable.

> Superseded later the same day by the barbarian pass: 587 traits became 585
> when the two Primal Path signposts were deleted, and the 462 became **447**.
> The table above is the state immediately after #57 and #51, kept as the
> record of that cleanup; Tier 2 carries the current figure.

#### #51's judgement call, made conservatively

The 119 were marked `unimplemented` rather than individually triaged. Six are
arguably finished as written and want `manual_sheet_helper` instead — `trance`,
`mask_of_the_wild`, `naturally_stealthy`, `halfling_nimbleness`,
`speak_with_small_beasts` and possibly `sunlight_sensitivity`, which are
permissions or roleplay rather than modifiers.

`unimplemented` is the safe default of the two: it claims "no rules yet", which
is true of all 119, whereas `manual_sheet_helper` claims "this is finished by
design", which is a decision about the game rather than about the data.
Over-marking creates a little busywork; under-marking hides real work, and the
marker system exists because hiding real work is the more expensive mistake.
**Worth a ruling** — re-marking is a one-line change each and the cross-check
keeps it honest either way.

#### Guards added

- `collectReferencedTraitIds` in `validatePack.ts`, beside the forward
  reference checks it mirrors, with a comment tying the two together — a site
  added to one and forgotten in the other makes live content read as an orphan.
  Eight unit tests, one per reference site, because a missed site is the
  failure that gets content deleted.
- `traitReachability.test.ts` over the shipped pack. Deliberately a test rather
  than a rule in `validateCoreRulePack`: a *library* pack shipping traits for
  campaigns to draw from would be legitimate, and that is a decision about packs
  in general rather than about this one.
- `implementationMarkers.test.ts`'s 119-stub characterisation is now an
  invariant — `expect(unmarked).toEqual([])`.

All three sabotage-verified: an added orphan, a stripped marker and a reverted
elf id each turned the suite red.
