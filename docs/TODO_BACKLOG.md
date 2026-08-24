# TODO Backlog

**Status as of 2026-08-24.** The workspace is green — 1652 tests, 0 failures,
typecheck and lint clean, `check:hygiene` passing. Nothing below is breaking a
build; these are gaps, debt and content.

Read [Recommended sequence](#recommended-sequence) first — it is the ordered
list, re-verified against the working tree on 2026-08-24, and every other
section is reference material it points into. **Tiers 1 and 2 are closed**;
Tier 3 (#45, absorbing #37) is the top of the list.

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

Refreshed **2026-08-24**. Every item below was re-verified against the working
tree on that date rather than carried forward on trust; two entries changed
severity as a result, and both notes say so. The 2026-08-21 ordering this
replaces has been retired — its closed entries are already marked ✅ in their
own sections, and each of its still-open items carries through to a tier here,
so nothing is dropped silently. See "Superseded" below for the record.

The ordering principle has changed, because the old one has been satisfied.
The previous list said **fix the pipe before filling it**, and that was right:
its Tier 1 is closed, the equip path works, and the pack is the only rules
source. The principle for this pass is **silent wrong before loud missing**.

A battleaxe with no `weapon` block announces itself the first time a player
clicks it. An attunement that never persists, a reset condition the database
cannot store, and a trait query that returns empty instead of erroring do not.
Missing content is findable and countable — that is the entire point of the
`implementation` markers. Silent breakage is neither, and it costs a debugging
session every time it eventually surfaces. So the silent failures go first,
even though the missing content is what is visible on the sheet.

`🟢` marks an **easy win**: self-contained, and with an existing template or a
test that proves it done rather than a judgement call to make.

### Tier 1 — wrong today, and silent about it

**Tier 1 is closed as of 2026-08-24.** Kept with its reasoning visible. **Tier 3 (#45, absorbing #37) is now the top of the list** — Tier 2 is closed too, and the drift it names has cost two debugging sessions already.

| Order | Item | Why first |
| --- | --- | --- |
| 1 | ✅ **`ITEM_ATTUNED` has no server binding** — S6 below | **Closed 2026-08-24.** The gateway binds it, enforces both authored rules inside the transaction, and broadcasts to the room minus sender. Eight tests, each sabotage-verified. The two characterisation tests that pinned the absence were flipped. |
| 2 | ✅ **#46** — `rest_condition` enum | **Closed 2026-08-24.** Not by adding two strings: the enum is now `ResourceResetSchema.options`, a projection like `EQUIPMENT_SLOTS`, so the two cannot drift again. Migration `0013_add_reset_conditions.sql` is generated but **not applied** — see 6d. |
| 3 | ✅ **#50** — read boundaries validated | **Closed 2026-08-24.** Both halves. `filterTraitsByCategory` parses each trait row and follows `projectEquipmentRows`' policy exactly: one bad row is named and skipped, every row bad throws as a schema divergence. `parseStoredPackPayload` guards the single pack payload, where there is no "skip it" option. |
| 4 | ✅ **#49** — staged-row re-parses handled | **Closed 2026-08-24.** Two helpers, because the two phases want different things: `parseImportRowPayload` throws with the row named (apply, publish), and `parseLedgerRow` *returns an issue* (plan) so the failure lands in the machinery that already marks the run failed and records why — which is the half that was actually missing. `validateImportRun` was already fine and is untouched. |

### Tier 2 — free, or nearly
**Tier 2 is closed as of 2026-08-24.** Kept with its reasoning visible, since
two of the items found more than they were scheduled to fix (#51, #52).


Everything in this tier is hours, not days, and most of it is minutes. Worth
clearing in one sitting before starting anything in Tier 3 or below.

| Order | Item | Why here |
| --- | --- | --- |
| 5 | ✅ **#35** — `startingEquipmentDictionary.ts` deleted | **Closed 2026-08-24.** 802 lines, zero readers, nothing to repoint. |
| 6 | ✅ **#34** — `spellDictionary.ts` deleted | **Closed 2026-08-24.** Deleted with its one barrel line. Its three authored spells were *not* folded into the pack first: they would have been the only non-stub spells in a section of 111 stubs, which #31 should settle as a whole rather than by exception. |
| 7 | ✅ **A7** — closed as won't-fix | **Closed 2026-08-24.** The reopening condition is kept. |
| 8 | ✅ **#4f** — destructive import guarded | **Closed 2026-08-24.** `db:import-pack` now counts the character rows the CASCADE will take, prints them, and refuses without `--yes`. The decision is `parseImportInvocation` in `src/`, so it is tested without a database attached; the count and the refusal live in the script. |
| 9 | ✅ **#40** — node-types guard restored | **Closed 2026-08-24.** `tsconfig.app.json` is back to `["vite/client"]` and excludes `src/**/__tests__`; the new `tsconfig.test.json` is the only project granted `node`. Verified in both directions: `process.cwd()` in a component now fails `tsc -b`, and the same call in a test still passes. |
| 10 | ✅ **E3 follow-up** — markers cross-checked | **Closed 2026-08-24.** `implementationMarkers.test.ts`, sabotage-verified. It found more than it was written to check — see #51. |
| 11 | ✅ **#47** — line-ending check added | **Closed 2026-08-24.** It gates on the two unambiguous cases and found four genuinely corrupted files on its first run. The whole-file case turned out to be neither safe to gate nor small — see #52. |

### Tier 3 — stop the drift before it earns a third instance

| Order | Item | Why here |
| --- | --- | --- |
| 12 | **#45** — one DB-free pack export, three fixtures repointed | Proven, not predicted. One key added to `manifest.json` broke both hand-copied assemblers, found weeks apart — and **both times the totals shrank instead of going red**: 533 tests reported instead of 733, then 266 instead of 284. A regression that reduces the denominator is the worst kind to own, because a passing run looks identical to a healthy one. Re-verified 2026-08-24: `packages/database/package.json` still has no `exports` map, and the server fixture still deep-imports `@project/database/src/corePackAssembler.js`. One new export plus three file changes. |
| 13 | **#37** — absorb into #45 | The same disease one layer up, in the projection rather than the assembly. Do not schedule it separately; #45 is the natural place to land both. |

Not higher than Tier 2 only because nothing is broken *right now*. But do it
**before the next change to `CoreRulePackSchema.pack` or to `manifest.json`'s
shape** — those are precisely the changes that trip it, and it has cost two
debugging sessions already.

### Tier 4 — content that makes existing characters work

| Order | Item | Why here |
| --- | --- | --- |
| 14 | 🟢 **#33** — 6 armours with no AC **and** no category | Six items, well-known PHB values, both facets already expressible in the schema, and `equipmentGaps.test.ts` stays red until the declared gaps genuinely close. The smallest content item in the backlog with a real player-visible payoff. Filling only the AC half will not close it, by design. |
| 15 | **#32** — 23 weapons with no `weapon` block | The same shape at four times the volume: a battleaxe that equips, weighs correctly and rolls no attack. Mechanical, parallelisable, and self-checking through the same test. |
| 16 | 🟢 **#44** — Relentless Rage | The design is already written and parked in `docs/superpowers/specs/2026-08-20-relentless-rage-design.md`, and the cutover unblocked it. Executing a finished spec is the cheapest real trait in the backlog. |

### Tier 5 — the burndown

| Order | Item | Why here |
| --- | --- | --- |
| 17 | **#30** — 456 unimplemented traits, 65% of 700 | The largest item and fully parallel. Class by class, in the order the table actually plays; Barbarian is the worked example to copy. Do Tier 2 item 10 first if the remaining count is to mean anything. |
| 18 | **#36** — `SUMMON_ACTOR_DICTIONARY` into the pack | The last live rules content outside the pack — two real readers, re-verified 2026-08-24. Until it moves, "packs are the only source of rules" carries an asterisk. |
| 19 | **#31** — 111 unimplemented spells | Lower than the raw count suggests, and lower than #30: `level` and `school` are placeholders too, so these need real **data** before they can carry rules. Two passes, not one. |

### Tier 6 — design passes, not before Tiers 1-4

| Order | Item | Why last |
| --- | --- | --- |
| 20 | **#23 + A1 + A5 together** | One root, three symptoms. `EngineEventSchema` models seven things that happen to you on your own turn, and neither "a creature left my reach" nor "the condition I readied for occurred" can be expressed. `CombatEvent`, `reaction_window_opened` and `spendReaction` already exist, so this is extending a vocabulary rather than building a reaction system. |
| 21 | **E2** — two-weapon fighting is unreachable | Belongs *with* item 20 rather than after it: an off-hand attack is worthless without a bonus-action attack to spend it on. A model gap, not a data gap — resist fixing it by authoring `off_hand` onto all 26 weapons, which would also let a greatsword be dual-wielded. |
| 22 | **A2b**, **S5** | Both small, and both judgement calls rather than defects. A2b is worth doing only if the two-click check flow proves annoying in play; S5's right treatment is page-level, which is a UI design decision rather than a bug to fix. |

### Tier 7 — blocked or conditional; do not start

| Order | Item | Status |
| --- | --- | --- |
| 23 | **#41, #42** | Genuinely blocked until a second pack exists. Composition machinery with nothing to compose. |
| 24 | **#43** | Conditional — only wanted when a browse endpoint needs to query resources. |
| 25 | **#38** — `db:push` needs a TTY | Recorded as "fine while the schema is stable". **Tier 1 item 2 is a schema change**, so this may stop being theoretical the moment #46 is picked up. Worth knowing before starting item 2, not after. |
| 26 | Coverage thresholds | ~49% statements / ~37% branches server-wide against a configured 80%, held down by `src/services` (~21%) and `src/routes` (~38%). Not usable as a gate until those two move; the gateway pass raised the global number rather than lowering it. |

**Suggested first sitting:** Tier 1 item 1 plus all of Tier 2. That is one
player-facing defect fixed, ~900 lines of dead code gone, two guards restored,
a marker cross-check that makes the burndown measurable, and one item closed as
won't-fix — with nothing in it that needs a design decision first.

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
| 30 | Traits marked `implementation.mode: "unimplemented"` | **456 of 700 (65%)** — but see #51 | They exist so progressions resolve and carry no rules. Fighters, wizards, monks and the rest have structure and no mechanics. Query the pack for the marker to get the current list. **This number understates the work by 119**: a further 119 traits carry no rules and no marker either, so they are absent from this count. The real figure is 576 of 700. |
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
| 32 | Ported weapons carry no `weapon` block | **23** | `item_weapon_battleaxe`, `_blowgun`, `_club`, `_crossbow_hand`, `_crossbow_heavy`, `_flail`, `_glaive`, `_greatclub` and 15 more. They equip and weigh correctly and roll no attack. **Still open, but no longer invisible:** each now declares `implementation.gaps: ["weapon"]`, and `equipmentGaps.test.ts` fails if one stops. |
| 33 | Ported armour carries no AC modifier **or category** | **6** | `item_armor_breastplate`, `_chain_shirt`, `_half_plate`, `_hide`, `_ring_mail`, `_splint`. They are wearable and grant nothing. **Wider than first recorded:** the same six also carry no `armorCategory`, so proficiency and the rules that gate on light/medium/heavy — Fast Movement among them — cannot see them either. Found 2026-08-21 while marking the gaps. Each declares `implementation.gaps: ["armor_class", "armor_category"]`, so filling only the AC half will not close the item. |

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
