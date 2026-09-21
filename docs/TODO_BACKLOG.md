# TODO Backlog

**Status as of 2026-09-21**, on `fix/sheet-modifiers`, after #73
closed. The workspace is green — **2142
tests**, 0 failures, and typecheck clean per package (6f explains why "per
package" matters). Nothing below is breaking a build; these are gaps, debt and
content.

Read [Recommended sequence](#recommended-sequence) first — it was **re-ordered
on 2026-09-21** (see P11 for the findings that drove it). The short version:
the last three branches authored content faster than the product surfaces it,
so the next sitting is about making authored work reach a player, and the
burndown after that is sequenced by *system* rather than by trait count.

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
| 24 | Fighting Style: Dueling | `trait_fs_dueling` in the same segment | Hand-aware damage modifiers and a governing-stat modifier source exist and the trait is authored against them, but nothing emits `status_wielding_one_handed_only` — the gate the trait requires is never satisfied at runtime. Previously marked Resolved in error; reopened here, not fixed. |

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

**Re-ordered 2026-09-21**, after `feat/proficiency-family` merged, by
re-checking every open item against the working tree rather than the page.
The previous ordering principle was "shrink the problem before working it",
and it is spent: #57, #58 and #51 are closed and #30 is an honest count. Two
things the last three branches showed replace it:

1. **Authored content is outrunning what reaches a player.** 28 of the 36
   proficiency traits just authored reach no live sheet (#68); spell slots
   exist but do not appear until the first turn event (#63); and a fresh clone
   cannot open a live session at all without an undocumented env var in the
   code path (#64). Each new branch that authors content widens this gap, so
   it goes first.
2. **A trait is not a unit of work (#62).** The burndown is sequenced by the
   *system* each class pass needs — a resource pool, a schema concept, a data
   type — not by which row has the most stubs.

`🟢` marks an easy win: self-contained, with a test harness already in place.

### Tier 1 — make what is already authored reach the player (days)

| Order | Item | Scale | Why here |
| --- | --- | --- | --- |
| 1 | ✅ **#64** — give the socket gateway's CORS origin a fallback | minutes | **Closed 2026-09-21** on `fix/tier1-reach-the-player`: `clientOrigin()` (`apps/server/src/utils/clientOrigin.ts`) is now the one place the default lives; `index.ts` and `socket.ts` both call it. See 9b. |
| 2 | ✅ **#63** — a character's pools persist and reach the sheet | small | **Closed 2026-09-21** on `fix/tier1-reach-the-player`. Two causes, both fixed, not the recorded "invisible until Begin turn" symptom, which never reproduced: `ROOM_JOIN` now materialises pools through `getAuthoritativeRuntimeContext` and a spend matching no row is refused as an `action_error` instead of silently broadcast; separately, `GET /api/character/:id` now carries the character's persisted `character_resources` rows, so a reload after a spend shows the spent count instead of a rematerialised full pool. See 9a for the reproduction and the corrected diagnosis. |
| 3 | ✅ **#68 (fixed half)** — backgrounds reach the live sheet | small–medium | **Closed 2026-09-21** on `fix/tier1-reach-the-player`: `CharacterSaveSchema` gained `backgroundId`, the bootstrapper resolves a background's granted traits, and the server and web store thread it through. A preset background's fixed skill and tool grants (Criminal's Deception, Stealth and thieves' tools, and the like) now reach the live sheet. The choice half is unchanged — see item 5 below and 10d. |
| 4 | ✅ **#69** — record which node a trait choice answered | medium, needs a decision | **Closed 2026-09-21** on `feat/character-choices`: choices are now stored in `characters.choices`, keyed by the question they answer (`classSelections[classId][nodeId]` for class picks, `traitSelections[blockId]` for trait choice blocks), rather than rebuilt from a flat trait-id set. `CharacterBootstrapper.selectionsFromChosenTraitIds` is deleted. Migration `0014_add_character_choices` exists and has been applied to the dev database. See the "Resolved — #69" section below for the finding that the guessing had been running on nothing. |
| 4a | ✅ **#73** — the web sheet applies no trait modifiers | medium | **Closed 2026-09-21** on `fix/sheet-modifiers`: `gatherSheetModifiers` and `gatherBaseStates` (`packages/engine/src/pipeline/sheetModifiers.ts`) are now the one gather for trait, equipment and live-effect modifiers and states, used by both `buildLiveSheet` and the web store's `getSheetModifiers`/`getSheetStates`; the samples now store pre-racial scores, which also stops the server double-counting the racial bonuses it had been applying to their already-final stored scores; and the pack's Draconic Resilience AC gained `forbiddenStates` so it stops beating armour. The hand check's before/after AC table confirms it. See the "11f. #73" section below. |
| 4b | ✅ **#74** — a multiclass character's first class is whatever order Postgres returns | small–medium | **Closed 2026-09-21** on `fix/class-order`: `character_classes.position` records the order a class was taken, `classLedgerOrder` orders every ledger read, and all writers were updated to keep it. Migration `0015_add_class_position` is applied to the dev database. The hand check reproduced #74's exact failure condition on Lyra Silverstring and the sheet stayed correct. See the "11e. #74" section below. |
| 5 | **#68 (choice half) — Branch B** — a proficiency-choice wizard step, now that storage exists | medium, UI | Storage landed as `feat/character-choices`'s Branch A: `characters.choices` holds a class's `selections` and a trait's `traitSelections`, keyed by the question, but nothing collects them from a player yet. Widened from 21 proficiency blocks to all 31 choice-block traits in the pack — every class's skill picks, background tools and languages, plus the race picks that predate #68: the half-elf's ability-score choice, Skill Versatility and extra language, the human's and high elf's extra language, and the dwarf's artisan's tools. `ProficiencyExtractor.listPendingChoices` has no caller outside tests. Brainstorm the wizard step first; it is the first new UI surface since the barbarian's table notes. Inherits two findings from the same final review, 2026-09-21: a **custom background's choice blocks cannot be answered at creation** — a custom background's traits live outside `CharacterSave` entirely (the gateway included), so Branch B needs a home for them before a custom-background player can answer anything; and **level-up may re-answer a question already answered at creation or an earlier level** — `applyLevelUp`'s merge (#69, hardened by this review) overwrites a stored pick with whatever the payload sends and validates the new value, but nothing stops a later answer from changing an earlier one, so Branch B needs to decide whether re-answering is allowed. |
| 5a | **#71** — the sheet ignores a refused resource spend | small–medium | Found by the final review of `fix/tier1-reach-the-player`, 2026-09-21. `RESOURCE_CONSUMED`'s refusal (item 2's fix) is not in `SHEET_ERROR_EVENTS`, so `consumeResource`'s optimistic decrement never rolls back. Same family as item 2: a spend the server refused should not be the spend the player sees. See P11's 11d. |
| 5b | **#75** — feat-granted traits reach no sheet's modifiers | small–medium | Found while implementing `fix/sheet-modifiers`, 2026-09-21: a feat is stored as a `feat_selection` `character_traits` row, and that row never enters the web store's save or the server's `CharacterBootstrapper.resolveGrantedTraitIds`, which reads a character's race, background and classes only. Same gap #73 closed, one grant source short. See the "11g. #75" section below. |
| 5c | **#76** — the web store's composed `activeStates` still lacks trait and equipment states | small–medium | Found by `fix/sheet-modifiers`'s hand check, 2026-09-21: `composeActiveStates` still composes only over `baseStates`, which the store always sets to `[]`; trigger and dice-rule gating in `dispatchAuthoredEvent`, `useCheckRoll`, and the `ArmorClassWidget`, `TableRulesWidget`, `TurnControlsWidget` and `ConditionsWidget` widgets still read it, even though #73 moved the derived-stat hooks to `getSheetStates()`. If the branch's final review fixes this first, it closes #76 rather than leaving it recorded here. See the "11g. #76" section below. |

### Tier 2 — the burndown, one system per pass

| Order | Item | Scale | Why here |
| --- | --- | --- | --- |
| 6 | **Rogue pass**, with **#66**'s expertise concept | 26 stubs | Smallest remaining row that needs a new *system* rather than just data: Sneak Attack (#62) and Expertise (#66). Settling expertise here also unblocks the bard's copy of it. Follow the barbarian template (design spec → slices → sheet surface). |
| 7 | **#31a** — spell *data*: real `level`, `school` and class spell lists | 111 spells | Slots exist since `feat/spellcasting-slots`, but every spell is level 0 evocation, so a wizard has slots and nothing meaningful to cast. The data pass is mechanical (PHB values) and adds spell lists as a pack concept, which also unblocks **#67**. Rules (#31b) stay a later, per-spell job. |
| 7a | **#70** — author the four missing backgrounds | 4 backgrounds | Same shape as #31a: content authoring, not a new system. Three sample characters (Nyx Vale, Master Ko Shen, Kaelen Duskwarden) already reference `background_charlatan`, `background_folk_hero` and `background_outlander`, which the seeder creates but the pack does not author; `background_sage` is a fourth the seeder creates that no sample character uses. See P11's 11c. |
| 8 | **Next class passes**, each named by its system | see table below | Monk (ki, #62), sorcerer (sorcery points, #62), cleric/paladin (channel divinity, divine smite, #62), druid (wild shape, #62), fighter (after #69; Battle Master is #69's worst case, so the pass verifies it). Pick by who is playing what. |
| 9 | **#36** — `SUMMON_ACTOR_DICTIONARY` into the pack | — | The last rules content outside the pack. Unchanged; still two live readers. Best done alongside the wizard or druid pass, whose summons are its only consumers. |
| — | **#30** — the count itself | **362** | Not an item to "do"; it falls as 6–9 land. Consider #62's option 2 (track blocked-on-a-system stubs separately) the next time it is re-counted. |

### Tier 3 — small loose ends (interleave between passes)

| Order | Item | Why here |
| --- | --- | --- |
| 10 | 🟢 **#65** — six fix-later polish items from the spellcasting review | Each is minutes; (a) is a real lint warning in `RestModal.tsx`. Good warm-up for any session. |
| 11 | ✅ **#54** — confirm `0013_add_reset_conditions.sql` has been applied | **Closed 2026-09-21** — found applied to the dev database while applying `feat/character-choices`'s migration `0014_add_character_choices`; see 6d. |
| 12 | ✅ **Repo hygiene** — branches and worktrees (P11) | **Done 2026-09-21** — see 11b. |
| 13 | **#53** — a unit test for the line-ending check | Needs a root vitest project or a move into a package. |
| 14 | **#52** — 71 LF files against a CRLF tree | One normalising commit, no content change. Do it on a quiet day, not mid-branch. |
| 14a | **#72** — verify whether any gameplay path needs the authoritative runtime's missing rule snapshot | Pre-existing, found by the final review of `fix/tier1-reach-the-player`, 2026-09-21. `getAuthoritativeRuntimeContext` hydrates with no snapshot in either branch, so trait-granted states and grant-derived resources never reach it. Verify-first: check whether anything reachable depends on those states before scoping a fix. See P11's 11d. |

### Tier 4 — design passes

| Order | Item | Why here |
| --- | --- | --- |
| 15 | **#23 + #24 + A1 + A5 + E2 together** | One root: the event vocabulary only models your own turn. #24 (Dueling) joins it because the missing `status_wielding_one_handed_only` emitter is the same "what am I holding" model E2 needs. |
| 16 | **A2b**, **S5** | Both small judgement calls about UI, not defects. |

### Tier 5 — blocked or conditional; do not start

Unchanged from the previous pass: **#41, #42** (need a second pack), **#43**
(needs a browse endpoint over resources), **#38** (`db:push` TTY; `db:migrate`
is the path in use), **#37 remainder** (deliberate), coverage thresholds.

**Suggested first sitting:** Tier 1 items 1–3. Two are one-test fixes in a
harness that already exists, and the third is a schema field plus one
bootstrapper line — together they make every existing caster and every
background visible on the sheet the first time it opens. Then settle #69's
decision before anything writes more trait choices.

The per-class stub table Tier 2 relies on ("Where the remaining stubs sit",
re-counted 2026-09-21) is still current and stays in place below, inside the
superseded sequence's Tier 2 — only the ordering around it is retired.

### Superseded — the 2026-09-02 → 2026-09-21 sequence

Kept so the change of direction is visible. Tiers 1 and 3 of it are closed
(#57, #58, #51, #56); its Tier 2 is carried into the new Tier 2 above,
re-ordered by system; its Tiers 4 and 5 are carried unchanged, with #24 folded
into the design pass.

Re-measured **2026-09-20**, after `feat/item-proficiency` merged. #30 is
**408**, all twelve class rows were re-counted, #52 is **71**, E2 now covers 38
weapons rather than 26, and S6 turned out to have been fixed months ago without
anyone closing it. One new item was opened by the re-count: **8d**, the
dragonborn race, which is missing three signature features that were never
stubs and so were never in #30's number.

Re-measured again **2026-09-20**, on `feat/spellcasting-slots` while it was
still in review, not yet merged. #30 is **398**, all twelve class rows were
re-counted again, and #62 is half-closed — see 8f.

Re-measured again **2026-09-21**, after `feat/proficiency-family` closed. #30
is **362**, all twelve class rows were re-counted again — see 10a. The
proficiency family (8e) is closed bar three stubs the schema cannot express,
across four traits — see #66.

Previously refreshed **2026-09-02**, after the item-actions branch (49 commits)
landed without touching this file. Every item below was re-measured against the
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

**Tier 1 is closed as of 2026-09-02.** It found a live defect on the way — the elf race granted a stub and elves received no languages. **Tier 2 (#30) is now the top of the list**, and its first class is done: `feat/barbarian-traits` closed all 21 of the barbarian's stubs and built the table-note surface, the affinity and table-rule reporters, and the resource-snapshot fixes that the other eleven classes inherit.

| Order | Item | Why first |
| --- | --- | --- |
| 1 | ✅ **#57** — orphan stub traits deleted | **Closed 2026-09-02.** 113 removed. The guard found 114 unreachable, not 112, and **two carried real rules** — see 7d. |
| 2 | ✅ **#58** — reachability guard added | **Closed 2026-09-02.** `collectReferencedTraitIds` in `validatePack.ts` beside the forward checks, eight unit tests (one per reference site), and `traitReachability.test.ts` over the shipped pack. Sabotage-verified. |
| 3 | ✅ **#51** — every rule-free trait now declares itself | **Closed 2026-09-02.** 119 marked; the characterisation test is now the invariant `expect(unmarked).toEqual([])`. Six may deserve `manual_sheet_helper` instead — a ruling worth making, see 7d. |

### Tier 2 — the burndown, which is now the actual work

| Order | Item | Scale | Why here |
| --- | --- | --- | --- |
| 4 | **#30** — reachable trait stubs | **362** | Re-measured 2026-09-21, after `feat/proficiency-family` authored 36 proficiency stubs — 17 skills, 9 tools, 2 languages and 8 subclass bonus grants (including `trait_blessings_of_knowledge`) — each moved out of the segment that carried it as a stub and into the class, subclass or background that owns it: 398 → 362, of 584 traits. Before it, `feat/spellcasting-slots` authored ten spellcasting stubs (the nine slot casters' `trait_spellcasting_*` and the warlock's `trait_pact_magic`), each replacing an `unimplemented` stub of the same id with real resources: 408 → 398. `feat/item-proficiency` before that authored 32 weapon and armour stubs and deleted one: 441 → 408. The barbarian pass before that took 462 → 441, two of those by deleting the Primal Path signposts. The earlier rise from 456 came from marking 119 silent stubs while deleting 113 unreferenced ones, so the number means "granted to a character and does nothing" rather than "tagged by the port". Every one is reachable. Per-class breakdown below, re-counted in full on 2026-09-21. **It is a count, not an estimate — see 8f.** The proficiency family itself is closed bar three stubs the schema cannot express — see 8e and #66. |
| 5 | **#31** — spells | **111 of 111** | Two passes, not one. `level` is `0` for every spell and `school` is `evocation` for every spell, so these need real **data** before they can carry rules — which is why this sits behind #30 despite the smaller number. |
| 6 | **#36** — `SUMMON_ACTOR_DICTIONARY` into the pack | — | The last live rules content outside the pack, two real readers, re-verified 2026-09-02. Until it moves, "packs are the only source of rules" carries an asterisk. |

**Where the remaining stubs sit**, so #30 can be picked up by whoever is
playing what. All twelve rows re-counted 2026-09-21, after
`feat/proficiency-family` — the third full re-count since 2026-09-02, by the
same method as the previous two rather than by subtracting: walk each class's
own progression grants and starting/multiclass trait ids, add every subclass
whose `classId` matches it, and intersect with the trait ids the pack marks
`implementation.mode: "unimplemented"` (see 10a for how). A row is every stub
the class or one of its subclasses references, so each still carries its
subclass signposts:

| Class | Stubs | Class | Stubs |
| --- | --- | --- | --- |
| warlock | 57 | ranger | 27 |
| wizard | 45 | rogue | 26 |
| monk | 44 | paladin | 25 |
| cleric | 36 | druid | 18 |
| fighter | 34 | bard | 15 |
| sorcerer | 30 | **barbarian** | **0** |

Twenty-seven fewer than the previous re-count, spread across eleven of the
twelve classes: `feat/proficiency-family` authored each class's own skill and
tool choice blocks (13 skill picks, 6 tool grants) and every subclass's bonus
proficiency grant (8, including Blessings of Knowledge on the Knowledge
Domain). Barbarian is unchanged at 0 — it closed all of its proficiency stubs
back on `feat/barbarian-traits`.

The rows sum to 357 against 354 distinct traits: the same three-trait overlap
as before (`trait_expertise` on bard/rogue, `trait_timeless_body` on
druid/monk, `trait_lands_stride` on druid/ranger) is untouched by this branch
— `trait_expertise` is one of the three proficiency-family stubs the schema
still cannot express, see #66. A further **8 stubs belong to no class at
all** — 6 race (elf 3, halfling 2, gnome 1) and 2 feats (Mobile, Skilled) —
also untouched. The 9 background stubs that used to sit in this line (noble 3,
acolyte 2, criminal 2, soldier 2) are now authored: `feat/proficiency-family`
closed every one of them, so background-only is 0. 354 + 8 = 362.

Twenty-two of the class stubs are subclass signposts — `trait_divine_domain`,
`trait_bard_college` and their `_feature` twins, one pair per class. They
carry no rules by design; the barbarian pass deleted its two rather than
authoring them, and the same call is available to every other class.

Barbarian is the worked example, and it is done: all 21 of its stubs closed
on `feat/barbarian-traits`. Slices 1 to 3 built the table-note surface and
closed fifteen: nine sheet helpers carrying table notes, Bear totem's
twelve resistances, Primal Champion, Eagle totem, the Bear aspect, and the
two Primal Path signposts deleted outright. The last six (Frenzy,
Retaliation, Mindless Rage, Indomitable Might, Intimidating Presence and
Relentless Rage) arrived with the engine vocabulary they needed: dynamic
weapon attacks, condition suppression, the `minimum_total` dice rule, the
`save` DC, `self_save` and uses-mode resources. Each reaches the sheet:
attack cards, suspended conditions, a Relentless Rage save on the Rules
panel, and a uses count in Class Features.

The designs are
`docs/superpowers/specs/2026-09-02-barbarian-traits-design.md` and
`docs/superpowers/specs/2026-09-19-barbarian-sheet-surfaces-design.md`.

Races hold 6 stubs — Trance, Mask of the Wild and Sunlight Sensitivity on the
elf, Halfling Nimbleness and Naturally Stealthy on the halfling, and Speak with
Small Beasts on the gnome. The ten `trait_dragon_ancestor_*` stubs that share
`races/dragonborn.json` are **not** the dragonborn's: they are the sorcerer's
Draconic Bloodline ancestry, referenced from `classes/sorcerer.json`, and they
count against the sorcerer row. The dragonborn's own ancestry is authored in
full on its ten subraces — resistance, breath charge and a scaling cone. See
8d, which opened that as a defect and withdrew it the same day.

### Tier 3 — small, and each closes a loose end

| Order | Item | Why here |
| --- | --- | --- |
| 7 | ✅ **#56** — pin engine's TypeScript | **Closed 2026-09-20.** Aligned to the workspace rather than frozen at 7.0.2: `packages/engine` now declares `^6.0.3`, the same range `@project/database` and `@project/server` use, and resolves 6.0.3. All five packages typecheck clean on it and the engine's 871 tests pass — the major-version gap cost nothing to close. |
| 8 | 🟢 **#54** — confirm the reset-condition migration ran | `0013_add_reset_conditions.sql` is generated and journalled. Whether it has been applied to a live database cannot be checked from the tree. Until it has, the code accepts `initiative_roll` and `start_of_turn` and the database rejects them. |
| 9 | **#53** — a unit test for the line-ending check | Sabotage-verified but with no permanent test, because nothing owns `scripts/`. Needs a root vitest project or a move into a package; `expectedEnding` and `classifyEndings` are pure and exported ready for it. |
| 10 | **#52** — 71 project-source files are LF against a CRLF tree | Re-counted 2026-09-20 with `pnpm check:hygiene --report-eol`: 371 files reported, 300 of them vendored under `.claude/skills`, `.github/skills`, `.github/agents` and `.github/hooks`, which are not ours to normalise. The 71 that are: docs 19, `packages/engine` 17, `packages/database` 14, `apps/server` 11, `apps/web` 6, `packages/shared` 3, `skills-lock.json` 1. The count has gone **down** from 73, not up — the 80 previously recorded here counted the vendored directories inconsistently. Normalising changes no committed content. Not gated, deliberately — see 6b. |

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

### S6 — `ITEM_ATTUNED` is emitted by the client and bound by nobody ✅

**Closed, recorded 2026-09-20.** The finding below stood open in this file long
after it was fixed. `apps/server/src/gateway/socket.ts:1274` binds the event,
writes `character_inventory` scoped by `character_id` and broadcasts to the
room, and `socket.attunement.test.ts` covers it — its own docstring opens by
quoting this entry's title in the past tense. Nothing re-checked the backlog
when the fix landed, which is the same failure mode as #32 and #33: work
closing an item without closing the item. The record below is left as written.

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

Found 2026-08-21 while fixing E1, re-confirmed 2026-09-20 — the catalogue has
grown to 38 weapons and **every one of them** is still authored
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

## Resolved — #69: a rebuilt selection is credited to every node that offers the trait

Numbered #69 on 2026-09-21 (it had no id until then). Found 2026-09-02 by the review of the barbarian pass, in code that pass merged
rather than wrote. **Closed 2026-09-21** on `feat/character-choices`; see
[the design](superpowers/specs/2026-09-21-character-choices-design.md).

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

**Fixed the honest way.** `characters.choices` (migration
`0014_add_character_choices`, applied to the dev database) stores a
character's choices keyed by the question they answer —
`classSelections[classId][nodeId]` for class progression picks,
`traitSelections[blockId]` for trait choice blocks — so a save's
`selections` are read back rather than rebuilt from a flat trait-id set.
`selectionsFromChosenTraitIds` is deleted, along with both call sites'
`player_choice` filtering. Measured against the dev database while closing
this: it held **no** `player_choice` rows, and no UI ever set
`selectedTraits`, so the guessing function had been running on nothing — no
character's class choice reached its sheet before this branch, and there was
no player data to migrate.

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
| 30 | Traits marked `implementation.mode: "unimplemented"` | **362 of 584** | Re-measured 2026-09-21, after `feat/proficiency-family`. The history: 456 of 700 at the cutover, then 119 silent stubs marked (#51) and 113 unreferenced ones deleted (#57) to give 462 reachable of 587, then 462 → 441 on `feat/barbarian-traits`, 441 → 408 on `feat/item-proficiency`, 408 → 398 on `feat/spellcasting-slots`, and 398 → 362 on `feat/proficiency-family`, which authored 36 stubs across four commits: 13 class skill grants, 9 background traits (4 skill pairs, 2 languages, 3 tool grants — all now in `backgrounds/core.json`), 6 class tool grants and 8 subclass bonus grants (including `trait_blessings_of_knowledge`, missed by 8c and 8e's earlier id-pattern counts — see 8e). Every one moved out of `traits/unimplemented.json` and into the class, subclass or background segment that owns it. Two wrong tool ids were also corrected in place, on the gnome and the dwarf — not stubs, but see 8e for why the same branch found them. `implementationMarkers.test.ts`'s `records how much of the trait section carries no rules` pins 362 of 584. Every one is reachable — the guard added by #58 is what keeps that true. Per-class breakdown in the Recommended sequence, re-run in full on 2026-09-21 — see 10a for the method. |
| 31 | Spells marked `unimplemented` | **111 of 111** | Every spell in the pack is a stub with a `no_effect` action; `level` and `school` are placeholders, which the marker's summary says outright. |

This is the deliberate, accepted trade recorded in the design doc — a marked
stub is honest, a half-faithful transform is not. The marker is what makes it a
measurable burndown rather than the silent `effects: []` placeholders it
replaced.

**`SPELLCASTING_MOD` has a reader for the first time.** It has existed in
`ModifierTargetSchema` since the schema did, reachable by nothing —
`feat/spellcasting-slots`'s `SpellcastingEngine.calculate` in
`packages/engine/src/calculators/spellcasting.ts` is the first code that
reads it, folding any active `SPELLCASTING_MOD` bonus into a casting class's
modifier before deriving its save DC and attack bonus.

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
Since `feat/item-proficiency` (2026-09-20) it is a smaller roster than it was —
weapons and armour resolve against the equipment catalogue itself
(`itemProficiency.ts`) and need no hand-kept list. `proficiencyDictionary.ts`
still is the roster for languages and skills, which have no catalogue to
resolve against.

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
| ~~45~~ | ~~Three independent implementations of "read the manifest, strip assembly-only keys, merge the sections, parse through `CoreRulePackSchema`"~~ | **Closed — see 6e.** Both hand copies now import `assembleCoreRulePackSync` from `@project/database/pack`; re-confirmed 2026-09-21. This row was never struck when 6e recorded the fix. |

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
| 52 | Files pure LF where this checkout's convention is CRLF | **71** in project source | Re-counted 2026-09-20: 17 `apps`, 34 `packages`, 19 `docs`, plus `skills-lock.json`. A further 300 sit in vendored `.claude/` and `.github/`, which are not ours to normalize. |

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

**Closed 2026-09-21.** Found while applying `feat/character-choices`'s
migration `0014_add_character_choices`: `drizzle.__drizzle_migrations` on the
dev database already held id 13 — `0013_add_reset_conditions`, created_at
1787581213539 (2026-08-24) — so this migration has been applied.

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

**Closed 2026-09-20.** The decision the entry asked for was made in favour of
alignment over freezing: `^6.0.3`, matching `@project/database` and
`@project/server`. Pinning 7.0.2 would have stopped the drift while leaving
one package on a different major indefinitely, which is the half of the problem
that actually costs something — an engine-only type error with no obvious
cause. Verified before committing: all five packages typecheck clean and the
engine's 871 tests pass on 6.0.3, so nothing depended on the newer compiler.

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

---

## P8 — Item proficiency resolution (closed 2026-09-20)

`feat/item-proficiency` closed two live defects that had sat underneath the
proficiency system since the pack cutover, and authored the largest remaining
slice of the weapon and armour stubs.

### 8a. #59 — no weapon proficiency grant in the pack matched any weapon

| # | Item | Notes |
| --- | --- | --- |
| 59 | Every weapon proficiency grant named an id no weapon answered to | **Closed 2026-09-20.** |

Every weapon grant in the shipped pack spelled either a category
(`simple_weapons`, `martial_weapons`) or an item id (`weapon_battleaxe`) that
no weapon in the catalogue carried — `combat.ts` matched against
`weapon.category` or `weapon.id`, and neither vocabulary lined up with what
the pack actually authored. `combat.test.ts`'s own proficiency cases granted
the calculator's invented spellings and passed, so the bug was invisible to
its own tests, and `proficiencyRosterDrift.test.ts` said outright in a comment
that weapons and armour were skipped "for want of a roster" — the guard's
blind spot sat exactly where the bug did.

Fixed by giving each item its own vocabulary
([itemProficiency.ts](packages/engine/src/rules/itemProficiency.ts)'s
`weaponProficiencyIds` / `armorProficiencyIds` / `isProficientWithWeapon`,
derived from the catalogue rather than kept by hand) and pointing both
`combat.ts` and the guard at it. The guard now derives its legal set from the
same helper the calculator matches with, so a grant cannot pass one and fail
the other; two new cases require every grant to also cover at least one real
item, both sabotage-verified in each direction.

### 8b. #60 — the web store's `proficiencies` record was never populated

| # | Item | Notes |
| --- | --- | --- |
| 60 | `character.proficiencies` read an API field the `characters` table never had | **Closed 2026-09-20.** |

`characterSheetRouteData.ts` read `character.proficiencies || {}` off a
payload that is a spread of the `characters` row, and that table has no such
column — so `store.proficiencies` was always `{}` for every character, and
every consumer of it was inert: not only weapon proficiency in `useCombat`,
but every skill and every saving throw in `useCharacterStats`. The live sheet
had never added a proficiency bonus to anything. The dead record and the two
id-guessing workarounds built to cope with it being empty are gone;
`getProficiencyGrants()` on `characterSheetStore` now derives grants from the
character's own traits through `ProficiencyExtractor`, the same call the
server already made.

### 8c. Stub counts, corrected

Of the weapon and armour proficiency stubs counted into #30, the **17 weapon
and 16 armour stubs are closed** — moved out of `traits/unimplemented.json`
into their owning class files and authored against the PHB, following the
pattern the barbarian set. One, `trait_cleric_mult_prof_weapons`, is deleted
rather than authored: the PHB's cleric multiclass table grants no weapons,
only armour and shields, so there was nothing to write for it.

The remaining proficiency stubs are **17 skills and 9 tools** in
`traits/unimplemented.json` — not 18 skills, the figure the design spec
carried in from its own scoping. `trait_barbarian_prof_skills` was already
authored on `feat/barbarian-traits`, before this branch's baseline; it should
never have been in the count of what is left. Tools have no items in the
catalogue to resolve against and are out of scope here, same as they were for
#59 — see 4c above for what that leaves `proficiencyDictionary.ts` holding.

### 8d. #61 — withdrawn, and what the check found instead

**Opened and withdrawn on 2026-09-20, within the hour.** Recorded rather than
deleted, because the way it was wrong is worth keeping.

**The claim was:** `race_dragonborn` grants only an ability score increase and
a language, so Draconic Ancestry, Breath Weapon and Damage Resistance are
missing from the pack entirely; and the ten `trait_dragon_ancestor_*` traits
in `races/dragonborn.json` belong to the sorcerer, not the race.

**Both halves are false.** The race declares `hasSubraces: true` and carries ten
subraces, one per colour, each granting its own ancestry trait.
`subrace_dragonborn_red` carries a `fire` resistance affinity, a
`dragonborn_breath_charge` resource resetting on a short rest, and a complete
`action_red_breath` — a 15-foot cone, DEX save against `8 + CON + proficiency`,
half damage on a success, 2d6 scaling to 5d6 at levels 6, 11 and 16. It is more
completely authored than most of the pack. The claim came from reading
`grantedTraitIds` on the race and never walking `subraces`, where every racial
grant past the ASI and languages actually lives.

The ten `trait_dragon_ancestor_*` stubs are a different feature that shares a
colour axis: the **sorcerer's** Draconic Bloodline ancestry, which grants
Draconic literacy and doubled proficiency on Charisma checks with dragons. They
are referenced by `classes/sorcerer.json` and by nothing else, they are counted
against the sorcerer's row, and that attribution was right.

**What the check found instead.** Looking for absences turned up none, and the
structural signals that might have found them do not work here:

- Every one of the twelve classes has all 20 progression rows, and every
  subclass's feature levels match the PHB (Berserker 3/6/10/14, cleric domains
  1/2/6/8/17, wizard schools 2/6/10/14, and so on).
- Twenty-two progression rows grant nothing and no ASI, which looks like a hole
  and is not one: barbarian 6/10/14 are Path feature levels served by the
  subclass, and cleric 3/7/9/13/15, druid 3/5/7/9/11/13/15/17, paladin 9/13/17
  and sorcerer 11/13/15 are levels where the PHB grants only spellcasting
  progression. Twenty-two false positives, no true ones.

An expectation manifest listing each race, class and subclass's PHB features
would find real absences, but it is the burndown written out a second time in
order to measure the burndown. Not worth building. **#61 is closed as
not-a-defect**; the real finding it led to is 8f.

### 8e. Proficiency stubs remaining, recounted

8c above records "17 skills and 9 tools" left. That is the count of stubs whose
ids match `prof_skills` or `prof_tools`, and it misses two more groups in the
same family. The full remainder on 2026-09-20 is **35**:

| Kind | Count | Ids |
| --- | --- | --- |
| skills | 17 | 13 class, 4 background |
| tools | 9 | 5 class, 4 background |
| languages | 2 | `trait_acolyte_languages`, `trait_noble_languages` |
| subclass bonus proficiencies | 7 | `trait_cleric_{war,life,nature,tempest}_prof_bonus`, `trait_bard_lore_prof_bonus`, `trait_bard_valor_bonus_prof`, `trait_rogue_assassin_bonus_prof` |

Skills and languages both have a roster in `proficiencyDictionary.ts` and a
working consumer, so they are authorable today — they are the cheapest
remaining slice of #30. Tools have neither a roster nor any tool item in the
catalogue to resolve against, so they need a decision before they need work.
The seven subclass entries are the domain and college bonus proficiencies,
which grant a mix of armour, weapons and skills and are authorable now that the
armour and weapon vocabulary resolves.

**Both the count and the reasoning above were wrong, corrected on
`feat/proficiency-family`, 2026-09-21.** "Tools have neither a roster nor any
tool item in the catalogue to resolve against, so they need a decision before
they need work" conflated two mechanisms, the same way the item-proficiency
spec once did: weapons and armour resolve against the equipment catalogue,
but **languages and skills resolve against a hand-written roster in
`proficiencyDictionary.ts`, and tools are the same shape as languages** — a
roster, not a catalogue. Languages have no catalogue either and were never
blocked; nothing was blocking tools. `TOOL_DICTIONARY` (39 entries: 17
artisan's tools, 4 gaming sets, 10 musical instruments, 6 kits and standalone
tools, 2 vehicles) now sits beside the language and skill rosters, and
`listProficiencyOptions("tools")` returns it.

Giving tools a roster turned on `proficiencyRosterDrift.test.ts`'s drift guard
for the `tools` category for the first time — it had silently skipped the
category, per that test's own docstring, since #59. The guard went red
immediately, on two ids that were already wrong in the shipped pack: the
gnome's Tinker granted `artisans_tools` (a category id, where a specific tool
belongs — its own lore says tinker's tools) rather than `tinkers_tools`, and
the dwarf's third artisan option was spelled `mason_tools` beside
correctly-spelled `smiths_tools` and `brewers_supplies`, rather than
`masons_tools`. Both fixed in `races/gnome.json` and `races/dwarf.json`; the
guard is green, and it was also sabotaged in both directions (a bad fixed
grant, a bad choice option) to confirm it fails on new data and not only on
the two ids it happened to find. Every category proficiency grant in the pack
now resolves against a real roster or the equipment catalogue — the guard's
own docstring says so as of this branch.

The count above was short too, by one: **36**, not 35.
`trait_blessings_of_knowledge` (the Knowledge Domain's two languages and two
skills at expertise) was missed by both 8c and this section's own table,
because both counted stubs whose id matched a pattern — `prof_skills`,
`prof_tools`, `prof_bonus` — and `trait_blessings_of_knowledge` carries none
of those substrings. Searching by what a trait *does* rather than what it is
called found it; that is a reason to distrust an id-pattern count generally,
not only this one instance of it. The tools row's own class/background split
was wrong too, in both the 35-count table above and originally here: it read
"5 class, 4 background", counted by eye rather than checked against the pack.
Checked directly against `proficiencies.fixed`/`proficiencies.choices` with
`category: "tools"`, the true split is **6 class, 3 background** —
`trait_bard_prof_tools`, `trait_bard_prof_mult_tools`, `trait_druid_prof_tools`,
`trait_monk_prof_tools`, `trait_rogue_prof_tools` and
`trait_rogue_mult_prof_tools` are the six class grants;
`trait_noble_prof_tools`, `trait_soldier_prof_tools` and
`trait_criminal_prof_tools` are the three background grants.
`trait_rogue_assassin_bonus_prof` also grants tools but is a subclass bonus
trait, already in that row below — counting it here too would make the tools
row's own ids sum to more than 9. The corrected breakdown, all closed
2026-09-21, checked the same way for every row rather than assumed:

| Kind | Count | Ids |
| --- | --- | --- |
| skills | 17 | 13 class, 4 background |
| tools | 9 | 6 class, 3 background |
| languages | 2 | `trait_acolyte_languages`, `trait_noble_languages` |
| subclass bonus proficiencies | 8 | `trait_cleric_{war,life,nature,tempest}_prof_bonus`, `trait_bard_lore_prof_bonus`, `trait_bard_valor_bonus_prof`, `trait_rogue_assassin_bonus_prof`, `trait_blessings_of_knowledge` |

17 + 9 + 2 + 8 = 36. **The proficiency family is closed bar three stubs the
schema cannot express, across four traits** — one of them (`trait_expertise`)
is what `trait_blessings_of_knowledge` needed and could not use, since its own
options are a fixed list of four skills rather than "proficiencies you already
hold". See #66.

### 8f. #62 — no class resource exists, and #30 cannot say so

Found 2026-09-20, while checking #61.

| # | Item | Scale | Notes |
| --- | --- | --- | --- |
| 62 | The pack defines 10 resources, none of them a class resource | **21 of ~40** | **Half-closed 2026-09-20.** `feat/spellcasting-slots` authored spell slots, a save DC and a spell attack bonus for every slot caster, and pact slots for the warlock. Ki points and sorcery points do not exist in any form, and the entry stays open for them. |

The complete list of resources the shipped pack defines:

```
dragonborn_breath_charge      drow_magic_darkness
drow_magic_faerie_fire        infernal_legacy_darkness
infernal_legacy_hellish_rebuke  resource_barbarian_rage
resource_relentless_endurance   resource_relentless_rage
trait_action_surge              trait_second_wind
```

There was **no spell slot anywhere** — not a table, not a pool, not a single
`spell_slots_*` id. The same was true of ki points, sorcery points and pact
magic slots. Every one of the ten spellcasting traits was a stub
(`trait_spellcasting_{bard,cleric,druid,paladin,ranger,sorcerer,wizard}`, the
eldritch knight's and arcane trickster's, and `trait_potent_spellcasting`), as
were `trait_ki`, `trait_pact_magic`, `trait_font_of_magic`,
`trait_wild_shape`, `trait_sneak_attack`, `trait_divine_smite` and
`trait_channel_divinity`.

Seven of the twelve classes could not function at all as a result, and the
class progressions already granted `spell_choice` nodes — a wizard picks six
spells into a spellbook at level 1 and had nothing to cast them with.

**Closed for slots, DC and attack — 2026-09-20.** `feat/spellcasting-slots`
authored the nine class spellcasting stubs above
(`trait_spellcasting_{bard,cleric,druid,paladin,ranger,sorcerer,wizard}` and
the eldritch knight's and arcane trickster's) plus `trait_pact_magic` — ten of
the seventeen. Each was deleted from `traits/unimplemented.json` and upserted
with real resources into its own class segment: nine of the pack's eleven new
resources are the `spell_slots_1`..`spell_slots_9` pools (`resetCondition:
long_rest`, a `caster_level_thresholds` max rule keyed to `LevelContext`'s
`casterLevel`), and the other two are the warlock's own `pact_slots` and
`pact_slot_level` on a short-rest table. The pack's resource count moved from
**10 to 21**. `SpellcastingEngine.calculate` reads the slot tables and derives
the save DC and spell attack bonus from `SPELLCASTING_MOD`.

`trait_potent_spellcasting`, `trait_ki`, `trait_font_of_magic`,
`trait_wild_shape`, `trait_sneak_attack`, `trait_divine_smite` and
`trait_channel_divinity` — the other seven — are untouched. Ki points and
sorcery points still do not exist in any form, and #62 stays open for them.

**Why this was a backlog finding and not just another stub.** #30 counted
these as **17**, out of 408 (now 7, out of 398 — see #30 in 4a). That was
arithmetically true and useless as an estimate: `trait_spellcasting_wizard`
was a 20-by-9 slot table, a preparation rule, a save DC and an attack bonus,
and it counted exactly the same as `trait_dragon_ancestor_red`, which is one
resistance and a sentence of lore. **The unit #30 counts is the trait, and a
trait is not a unit of work.**

Two ways to make the number mean something, neither started:

1. **Weight the marker.** `implementation` already carries `mode`, `summary`
   and `blockedBy`; a size band beside them would make the burndown an estimate
   rather than a tally, and it is authored once per stub by whoever marks it.
2. **Track the blocked-on-a-system stubs separately.** The 17 above (now 7)
   were never small jobs waiting their turn, they were one system nobody had
   built. Counting them with the rest hid both numbers — which is exactly what
   closing ten of them this way demonstrated: #30 moved by ten while the
   actual work was two systems (slot casters, pact magic), not ten
   independent stubs.

Neither is urgent on its own for the seven still open. What is worth saying
plainly is that **#30 at 398 is a count, not an estimate**, and the two should
not be confused when sequencing work.

---

## P9 — Findings from a hand-driven check of the spellcasting-slots branch (opened 2026-09-20)

`feat/spellcasting-slots` itself is finished and green (2027 tests, typecheck
clean). Both findings below turned up while checking its work by hand against
a running app and a real database. Neither is caused by this branch — both are
pre-existing — and both are recorded here as follow-up rather than fixed on
the branch.

### 9a. #63 — resource pools are only created lazily, never on join

| # | Item | Notes |
| --- | --- | --- |
| 63 | `character_resources` rows are materialised only inside `getAuthoritativeRuntimeContext`, which `ROOM_JOIN` never calls | Verified 2026-09-20 against a real server and database. |

**Re-diagnosed and closed 2026-09-21** on `fix/tier1-reach-the-player`. The
symptom recorded below — an empty Features widget until the first turn event
— does not reproduce: `characterSheetStore.initialize` runs
`materialiseMissingPools` client-side, so a caster's slots appear on first
load even with no `spell_slots_*` rows in the database. Reproduced instead,
with the same character (Thistle Quickfoot, wizard 14, `00000000-0000-0000-0000-000000000117`):

| Step | Sheet | `character_resources` |
| --- | --- | --- |
| First load | 1st-level slots 4/4 | no `spell_slots_*` rows |
| "Use" a 1st-level slot | 3/4 | still no rows |
| Reload | **4/4** | still no rows |
| Control: "Begin turn", then "Use" | 3/4 | `spell_slots_1 = 3/4` |

The rows were created only inside `getAuthoritativeRuntimeContext`, which
`ROOM_JOIN` never called; until a turn or action event, a pool existed only in
the browser, and `RESOURCE_CONSUMED`'s update matched zero rows, succeeded
silently, and broadcast the spend to the room anyway. Fixed by three changes:
`ROOM_JOIN` now materialises pools through the same
`getAuthoritativeRuntimeContext` path a turn or action event uses (commit
`a9795ed`); a spend matching no row is refused with an `action_error` to the
sender instead of silently broadcast (commit `0c2fea4`); and the insert
tolerates a concurrent materialisation with `.onConflictDoNothing()`.

A second, pre-existing cause turned up in the hand check after those three
landed: with the spend now persisted, a reload still showed the pool back at
full. `GET /api/character/:id` (`fetchCharacterPayload`) never read
`character_resources`, so the web store hydrated `resources: []` and
rematerialised every pool at its maximum regardless of what had been spent.
Fixed as Task 5b (commit `8d9e642`): the payload now carries the character's
persisted resource rows (`id`, `name`, `current`), and the store hydrates from
them before materialising anything the payload lacks.

`collectGrantedResources`'s pools — spell slots, hit dice, Rage, Ki, anything a
character's traits grant — reach `character_resources` only through
`getAuthoritativeRuntimeContext` in
[socket.ts:215](apps/server/src/gateway/socket.ts:215). That function runs on
`ACTION_INTENT`, `TURN_STARTED`, `TURN_ENDED` and `SURPRISE_DECLARED` (the
latter two through the shared `handleTurnIntent` helper) — confirmed by
reading each handler — but **not** on `ROOM_JOIN`, whose handler emits only
`INVENTORY_SYNC` and never calls it.

A character whose pools have never been materialised opens their sheet to an
empty Features widget and a rest modal whose Recovery Manifest reads "No
resources will be recovered during this rest", even though the character
demonstrably has pools. One turn or action event fixes it permanently — every
subsequent load is correct once that first materialisation has happened.

**Evidence**, verified by hand on 2026-09-20 against a real server and
database, with character `00000000-0000-0000-0000-000000000117` (Thistle
Quickfoot, wizard 14): on first load `character_resources` held 3 rows (hit
dice, wand charges, Arcane Recovery) and no `spell_slots_*` rows at all; after
clicking "Begin turn" once it held 12, with `spell_slots_1..9` at
4/3/3/3/2/1/1/0/0 — the correct PHB wizard-14 row. `GET /api/character/:id`
returns no `resources` key, so `character.resources || []` in
[characterSheetRouteData.ts:99](apps/web/src/pages/characterSheetRouteData.ts:99)
falls back to `[]`; the pools reach the client through the socket once they
exist.

Worth recording: this is why #62 (8f) could assume slots would need no web
work to appear on the sheet. They do appear — but only after that first event,
not on join.

### 9b. #64 — the socket gateway's CORS origin has no fallback

| # | Item | Notes |
| --- | --- | --- |
| 64 | `initializeWebSocketGateway`'s `cors.origin` reads `process.env.CLIENT_URL` with no default | Verified 2026-09-20 by adding `CLIENT_URL` to a local `.env`. |

[socket.ts:494](apps/server/src/gateway/socket.ts:494) builds the Socket.IO
server with `cors: { origin: process.env.CLIENT_URL, methods: ["GET", "POST"] }`
— no fallback.
[index.ts:20](apps/server/src/index.ts:20) does the same job for Express with
`cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" })` —
**with** one. `.env` is gitignored and untracked, and the repo carries no
server-side `.env.example` that sets `CLIENT_URL` (only `apps/web/.env.example`
exists), so a fresh clone has nothing establishing the value.

A developer who clones the repo and runs `pnpm dev` gets every `socket.io`
request failing with `net::ERR_FAILED`, so the live session never connects,
while the REST API works fine — a confusing split failure. Verified by hand on
2026-09-20: adding `CLIENT_URL=http://localhost:5173` to `.env` fixed it
immediately.

The obvious fix for whoever picks this up: give the gateway the same fallback
`index.ts` already has, or fail loudly at startup when `CLIENT_URL` is unset
rather than silently refusing every socket connection.

**Closed 2026-09-21** on `fix/tier1-reach-the-player` (commit `c78440e`): a new
`clientOrigin()` in `apps/server/src/utils/clientOrigin.ts` reads
`CLIENT_URL` and falls back to `http://localhost:5173`, read at call time
rather than module load so tests can vary the environment. `index.ts` and
`socket.ts:501` both call it, so the literal default now exists in one place
instead of two that could disagree again.

### 9c. #65 — six small items the branch's own reviews deferred as fix-later

`feat/spellcasting-slots`'s own per-task code reviews raised these as Minor
findings across the branch and deliberately left each one open for the final
whole-branch review to triage as must-fix, fix-later or drop before merge.
That triage's must-fix findings were fixed on the branch and its drops are
gone; these six came back fix-later, from a scratch ledger that would
otherwise not have survived. None blocks anything — they are recorded
together as one item because each is small polish, not a defect.

A seventh item from that same ledger — `slotTables.test.ts` sitting LF while
its siblings in the directory were CRLF — is not included below: as of this
check the file is CRLF like the rest of `packages/engine/src/calculators/__tests__/`,
so that one is already resolved.

| Item | Location | Finding |
| --- | --- | --- |
| a | [RestModal.tsx:101](apps/web/src/components/sheet/modals/RestModal.tsx:101) | The `recoveryPreview` `useMemo` depends on `levels` — built a few lines above from `classLevels`, `subclassIds` and `ruleSnapshot` — but lists those three inputs instead of `levels` itself, a missing-dependency lint warning newly introduced by the level-context refactor. The behaviour is correct, since `levels` is a pure function of the listed deps, but the suppression is implicit. Wrapping `levels`'s construction in its own `useMemo` over the same three deps would satisfy the rule honestly and stop rebuilding the context every render. |
| b | [useFeatures.test.ts](apps/web/src/hooks/__tests__/useFeatures.test.ts) | The mock store's `subclassIds` field exists, but every case in the file leaves it `{}`, and the mock's `level` field is never read by `useFeatures.ts` at all. No web-layer test exercises a subclass changing a caster's level — the Eldritch-Knight-shaped case — so the `subclassIds` → caster-level path is threaded here but only covered by the engine's own tests. |
| c | [patchPackSegment.ts:42](packages/database/scripts/patchPackSegment.ts:42) | The `Segment.classes` shape doesn't declare `multiclassTraitIds?: string[]`, so the pre-existing `removeMulticlassTraitIds` pass casts it inline at [:124](packages/database/scripts/patchPackSegment.ts:124) instead. Restoring `multiclassTraitIds?: string[]` to the intersection would remove the cast. |
| d | [patchPackSegment.ts:132](packages/database/scripts/patchPackSegment.ts:132) | `setClassFields` / `setSubclassFields` apply with `Object.assign(entry, fields)` (also [:142](packages/database/scripts/patchPackSegment.ts:142)), which would silently overwrite `id` or `progression` if a patch ever named them. A key guard rejecting those two names would make a typo'd patch fail loudly instead of corrupting a segment. |
| e | [slotTables.test.ts:77](packages/engine/src/calculators/__tests__/slotTables.test.ts:77) | The Eldritch Knight case asserts only `slots[0]`, so its 4-slot ceiling at level 20 is unchecked, and seven of the nine authored slot tables have no dedicated assertion in this file at all. The final branch reviewer verified out-of-band that all nine are byte-identical for every shared id, so the risk is low today; a structural test asserting that identity would be better than seven more hand-transcribed tables. |
| f | [DashboardLayout.test.tsx](apps/web/src/components/sheet/__tests__/DashboardLayout.test.tsx) | Every other child widget in this suite is isolated with its own `vi.mock` returning a stub; `SpellcastingWidget` — rendered unmocked at [DashboardLayout.tsx:248](apps/web/src/components/sheet/DashboardLayout.tsx:248) — is the one exception, left real with the `useCharacterStats` mock extended with `useSpellcasting: () => []` instead. It works, but breaks the file's isolation convention, and the layout test ends up indirectly exercising the real widget's render logic. `FeaturesWidget`, added later in the same file, does follow the convention, so this is one inconsistent case rather than a pattern. |

---

## P10 — Closing the proficiency family (opened 2026-09-21)

`feat/proficiency-family` closed 2026-09-21: `TOOL_DICTIONARY` gave tools a
roster for the first time, `proficiencyRosterDrift.test.ts` now guards the
`tools` category and caught the two wrong ids recorded in 8e, and the 36
stubs 8e scoped out are authored. #30 falls from 398 to 362 — see the Tier 2
row, 4a and 8e for the numbers and the corrected reasoning. What follows is
the per-class recount and the items the branch opened rather than closed:
three unauthorable stubs (10b), one authored feature with no content to
finish it (10c), and the gap between authored data and what a player can
actually reach (10d).

### 10a. #30's per-class counts, the method behind the 2026-09-21 recount

Re-run in full rather than subtracted by hand, the same way as every previous
recount of this row. The method, scripted against the assembled pack
(`assembleCoreRulePack`, the real assembler — not a hand copy, see #45) rather
than read off the JSON by eye:

1. Collect every trait id the pack marks `implementation.mode: "unimplemented"`
   — 362 of them, wherever in the pack they physically sit (mostly
   `traits/unimplemented.json`, but also `traits/ported.json` and four race
   files — see #51's point that a marker is not tied to a file).
2. For each class, walk its own `progression` grants (including `trait_choice`
   options and their prerequisites), `startingProficiencyTraitIds` and
   `multiclassTraitIds` — the same walk `collectReferencedTraitIds` in
   `validatePack.ts` does for the whole pack, scoped to one class.
3. Add every subclass whose `classId` matches, walking its own `progression`
   the same way, into the same set — a row is the class *and* its subclasses.
4. Intersect each class's reached-trait set with the stub set from step 1 and
   count.
5. Separately, walk `races` (including subraces), `backgrounds` and `feats`
   the same way, to find the stubs no class row reaches at all.

The result matched the previous recount's structure exactly: 354 distinct
class-reachable stubs, the same three traits double-counted across two
classes each, and every one of the 362 accounted for by a class, a race, a
background or a feat, with nothing orphaned. That agreement is what makes the
numbers in the Tier 2 row and section 4a trustworthy rather than merely
computed.

### 10b. #66 — three proficiency-family stubs the schema still cannot express, across four traits

| # | Item | Notes |
| --- | --- | --- |
| 66 | Three schema concepts are missing, and they block four traits, not three | Opened 2026-09-21, on closing `feat/proficiency-family`. |

The design doc's "Out of scope" section named these at design time; this is
the backlog record now that everything else in the family is authored. Each
needs a schema concept `ChoiceProficiencyGrant` does not have today, and
authoring any of them with the current schema would encode the rule wrongly
rather than leave it honestly stubbed:

| Concept | Trait(s) | Where the stub lives | Why the current schema can't say it |
| --- | --- | --- | --- |
| Options drawn from proficiencies already held | `trait_expertise` (bard, rogue) | `traits/unimplemented.json` | Expertise's options are "proficiencies you already hold". `ChoiceProficiencyGrant.options` is a static array; a block with no `options` falls back to the whole skill roster, so a rogue could take expertise in a skill they don't have. `ProficiencyExtractor.isWorthTaking` already compares held levels — half of what this needs — but nothing lets a choice block say its roster is the character's own proficiencies. |
| A choice spanning two categories | `trait_feat_skilled` (the Skilled feat) | `traits/ported.json`, referenced from `feats/core.json` — **not** `unimplemented.json`; it is a ported stub, not an unimplemented one, though it carries the same `implementation.mode: "unimplemented"` marker | The Skilled feat grants three picks spanning skills *or* tools, and a choice block carries exactly one `category`. Splitting it into two blocks would grant three of each instead of three total. |
| Blanket half-proficiency | `trait_jack_of_all_trades` (bard), `trait_remarkable_athlete` (fighter, Champion) | `traits/unimplemented.json` | Half proficiency on every ability check you are *not* already proficient in is a blanket rule over the whole roster, not a grant naming specific ids — there is nothing for a `ChoiceProficiencyGrant` to enumerate. |

**Three concepts, four traits.** Two locations, not one: `trait_expertise`,
`trait_jack_of_all_trades` and `trait_remarkable_athlete` are the three stubs
actually inside `traits/unimplemented.json` — that file's stub count (257
entries) is right to call them three. `trait_feat_skilled` is not among them;
it lives in `traits/ported.json`, which carries 89 stubs of its own — 88 of
them nothing to do with proficiencies, and `trait_feat_mobile` (the Mobile
feat, unrelated to this finding, simply not yet authored) is the only other
proficiency-adjacent one. `trait_feat_skilled` is reached from
`feats/core.json`'s `grantedTraitIds`, not from any class, race or background
walk. Both files mark their stubs the same way
(`implementation.mode: "unimplemented"`), which is why the pack-wide 362 count
already includes all four; only a file-specific count sees three.

Whoever picks this up needs a schema decision before authoring, not more
authoring effort — the same class of problem `trait_ki` and `trait_sneak_attack`
(#62) turned out to be, not a queue of small jobs.

### 10c. #67 — the Nature Domain's druid cantrip has nowhere to go; spell lists don't exist in the pack

| # | Item | Notes |
| --- | --- | --- |
| 67 | Nature Domain's Acolyte of Nature grants a druid cantrip of the player's choice; the pack has no spell lists to draw it from | Opened 2026-09-21, on closing `feat/proficiency-family`, moved out of the trait's own lore text (see below) rather than left there. |

`trait_cleric_nature_prof_bonus` (`classes/cleric.json`) authors the heavy
armour and skill-choice halves of Acolyte of Nature; the druid cantrip half is
blocked on spell lists as a pack concept, which do not exist anywhere in the
pack yet. That is a different and larger gap than #66's three: #66 is missing
`ChoiceProficiencyGrant` concepts, this is a missing content type entirely, so
it does not belong in that table.

Until 2026-09-21 the gap was recorded in the trait's own `lore.shortDescription`
and `lore.fullText` — "The druid cantrip this feature also grants is not yet
authored, because spell lists do not exist in the pack." — which
`ClassDetailView.tsx` renders to players, making an engineering note into
player-facing rules text, and the only trait of 505 whose lore admitted an
unimplemented sub-part. It was also invisible to #30: the trait carries no
`implementation.mode` marker (its armour and skill halves are real), so
nothing counted this. Fixed 2026-09-21 by trimming the lore back to the rules
text the pack actually delivers; this item is where the gap lives now instead.

### 10d. #68 — authored proficiency data has no consumer outside tests, and backgrounds reach no live sheet at all

| # | Item | Notes |
| --- | --- | --- |
| 68 | 28 of the 36 traits `feat/proficiency-family` authored are data with no UI or save-shape to reach a player | Opened 2026-09-21, on closing `feat/proficiency-family`. |

The design doc claimed "skills, languages and tools all already have
consumers; this branch gives them data" (corrected in place, see its Engine
changes section). Verified against the working tree at close:

- **Choice blocks have no consumer.** 21 of the 36 traits this branch
  authored are choice blocks. `ProficiencyExtractor.listPendingChoices` and
  `PendingProficiencyChoice` are referenced only by this branch's own tests
  (`authoredProficiencies.test.ts`, `characterEngine.test.ts`) and by
  `proficiencyExtractor.ts` itself — nothing in `apps/web/src` or the server
  calls or references either. The character-creation wizard has no
  proficiency step to offer a rogue's four-from-eleven or an acolyte's two
  languages.
- **Backgrounds reach no live sheet at all, fixed or chosen.**
  `CharacterSaveSchema` (`packages/shared/src/schemas/runtime/characterSave.ts`)
  has no `background` field, so `CharacterBootstrapper.resolveGrantedTraitIds`
  builds its granted-trait id list from `race` and `classes` only. A
  background's proficiencies — fixed or choice, all four backgrounds this
  branch authored — never enter `compileActiveTraits`.

Net effect: of the 36 traits authored, roughly 8 reach a live sheet today —
the fixed tool/armour/weapon grants hanging off classes and subclasses. The
other ~28 are correct pack data waiting on a UI (a proficiency-choice step in
character creation) and a schema change (a `background` field on
`CharacterSaveSchema`) that this branch did not build, because building them
was never in its scope. Whoever picks up character-creation UI or the
background gap should start here rather than rediscovering it.

**Fixed half closed 2026-09-21** on `fix/tier1-reach-the-player`: a
background's *fixed* grants now reach the live sheet, the way described in
Tier 1 item 3's design (`CharacterSaveSchema.backgroundId`,
`RuleSnapshotLookup.resolveBackgroundDefinition`, and the server and web store
threading the id through). The choice half above — 21 authored choice blocks
with no wizard step to offer them — is unchanged and stays open as Tier 1 item
5.

**Storage for the choice half landed 2026-09-21** on `feat/character-choices`
("Branch A" of a two-branch split): `characters.choices` now stores a
character's choices keyed by the question they answer. The count of
choice-block traits waiting on a wizard step widens from 21 to 31 once the
race picks that predate #68 are counted too — the half-elf's ability-score
choice, Skill Versatility and extra language, the human's and high elf's
extra language, and the dwarf's artisan's tools. The wizard step itself
("Branch B") is unchanged and stays open as Tier 1 item 5.

---

## P11 — Sequencing pass (opened 2026-09-21)

Every open item was re-checked against the working tree at `3315fd9` before
the Recommended sequence was re-ordered. Recorded so the new order's reasons
are checkable.

### 11a. What the re-check found

- **#64 is still open in code.** `360c239` ("mark CLIENT_URL as required")
  changed only `README.md`. `socket.ts:494` still reads
  `process.env.CLIENT_URL` with no default, and there is still no server-side
  `.env.example`. The README note helps a reader; it does not help a fresh
  clone that runs `pnpm dev` without reading it.
- **#63 is unchanged.** `ROOM_JOIN` still never calls
  `getAuthoritativeRuntimeContext`; its callers are still the action and turn
  handlers only.
- **#68's fixed half is smaller than recorded.** 10d frames it as "a schema
  change (a `background` field on `CharacterSaveSchema`)", which is true, but
  the storage and the selection already exist: `characters.background_id`
  (`operational.ts:87`) is a real column with a foreign key, and the wizard
  already picks a background (`wizardStore.ts`, `compileCharacter.ts`,
  `ReviewStepContainer.tsx`). Only the save shape and the bootstrapper need to
  learn about it. No migration.
- **#45 was closed but still listed open** in 5a's table; struck there now.
  6e had recorded the fix.
- **#37's resource half is closed.** `ruleSnapshotCache` now reads resources
  off the shared `toRuleSnapshot` projection ("the server no longer keeps its
  own copy"), and the engine's `packToRuleLookup` builds on the same function.
  What remains is the deliberate equipment remainder already in Tier 5.
- **The selection-credit defect had no number**, which is why it could sit in
  the middle of the page for three weeks while three branches merged past it.
  It is **#69** now, and ordered ahead of any work that writes more trait
  choices.

### 11b. Repo hygiene — branches and worktrees

Three local branches are fully merged into `main` (0 commits ahead) and can be
deleted: `chore/pin-engine-typescript`, `feat/lossless-rule-snapshot`,
`feat/weapon-damage-expressions`.

Two Copilot worktrees under `../copilot-worktrees/dnd-live-sheet/` are from
early July. `lucasbbacon-super-parakeet` is 0 ahead and can go.
`lucasbbacon-split-memory-remediation` (worktree `lucasbbacon-cautious-winner`)
is 2 ahead, 329 behind: a merge commit and `31ada62`, a 15-line stabilisation
of `requireCampaignRole.test.ts`. Worth one look to see whether `main` already
has an equivalent fix before discarding it; both also exist on `origin`.

**Done 2026-09-21, on the owner's instruction.** The three merged branches
are deleted and both worktrees removed. `31ada62` was **not** merged: it
conflicts, because `main` has since rewritten `requireCampaignRole.test.ts` to
mock `campaignAccess` instead of the `db` query chain the commit hoisted, so
its fix targets code that no longer exists (the current test is green). It
survives on `origin/lucasbbacon-split-memory-remediation`. The two local
branches that backed the worktrees are deleted too; both still exist on
`origin`.

### 11c. #70 — the sample seeder's background rows are inert, and it authors backgrounds the pack does not

| # | Item | Notes |
| --- | --- | --- |
| 70 | The sample seeder writes background `character_traits` rows nothing reads, and creates four `backgrounds` rows the pack does not author | Found in Tier 1's #68 hand check, 2026-09-21, recorded rather than fixed — out of scope for `fix/tier1-reach-the-player`. |

Two separate findings from the same file,
[seedSampleCharacters.ts](packages/database/src/seedSampleCharacters.ts):

- **The background `character_traits` rows are inert.** Every sample
  character's seed data includes rows such as `{ traitId:
  "trait_criminal_prof_skills", source: "background_criminal" }` inserted
  straight into `character_traits`. Nothing reads them for proficiencies —
  #68's fixed half derives a character's background grants from
  `characters.background_id` through `CharacterBootstrapper`, not from stored
  `character_traits` rows — and character creation never writes them either.
  Deriving from `background_id` is the one real path; these rows do nothing.
- **Four backgrounds the pack does not author.** The seeder inserts its own
  `backgrounds` rows (`SAMPLE_BACKGROUNDS`) for `background_sage`,
  `background_folk_hero`, `background_outlander` and `background_charlatan`.
  `core_2014_pack`'s `backgrounds/core.json` authors only acolyte, criminal,
  noble and soldier. Three sample characters — Nyx Vale (charlatan), Master Ko
  Shen (folk hero) and Kaelen Duskwarden (outlander) — reference a background
  the pack has no `backgroundTraitIds` for, so `resolveBackgroundDefinition`
  finds nothing to grant and they correctly receive nothing from their
  background, the same as an unknown id. `background_sage` is a fourth row the
  seeder creates that no sample character uses at all. Four backgrounds to
  author, for the backlog — tracked as Tier 2 item 7a.

### 11d. #71 and #72 — found by the final review of `fix/tier1-reach-the-player`

| # | Item | Notes |
| --- | --- | --- |
| 71 | The sheet ignores a refused resource spend | Found by the final review of `fix/tier1-reach-the-player`, 2026-09-21. See below. |
| 72 | The server's authoritative runtime is hydrated without the rule snapshot | Pre-existing, noticed by the same review. See below. |

- **#71 — the sheet ignores a refused resource spend.** Since this branch,
  `RESOURCE_CONSUMED` answers a spend that matched no `character_resources`
  row with `action_error` ("Unknown resource for this character.") and does
  not broadcast. But `SHEET_ERROR_EVENTS`
  (`apps/web/src/components/sheet/sheetErrorEvents.ts`) does not list
  `RESOURCE_CONSUMED`, so the sheet drops the error, and `consumeResource` in
  `apps/web/src/store/characterSheetStore.ts` never rolls back its optimistic
  decrement: the spender sees the spend until reload. Reachable now by a
  click during page load before the join's insert lands, or by client/server
  grant drift. Needs a rollback plus a notice; the inventory-scoped banner
  that `SHEET_ERROR_EVENTS` feeds is the wrong surface (compare S5). The
  server now logs the refusal (#63's follow-up fix).
- **#72 — the server's authoritative runtime is hydrated without the rule
  snapshot.** Pre-existing, noticed by the same review.
  `getAuthoritativeRuntimeContext` in `apps/server/src/gateway/socket.ts`
  calls `CharacterBootstrapper.hydrateRuntimeManagers(save, effectManager,
  resourceManager)` with no snapshot, in both its cached and fresh branches,
  so `compileActiveTraits` resolves no traits there and the cached runtime
  gets no trait-granted states or grant-derived resources; only
  `hydrateFromPersisted` supplies resources. `ROOM_JOIN` now reaches this
  path too. Needs checking whether any gameplay path depends on those states
  before deciding the fix.

### 11e. #74 — a multiclass character's first class is whatever order Postgres returns

Found 2026-09-21 by the final review of `feat/character-choices`.

| # | Item | Notes |
| --- | --- | --- |
| 74 | ✅ A multiclass character's "primary" class is inferred from array order, but `character_classes` records no order and nothing reads it in one | **Closed 2026-09-21** on `fix/class-order`. See below. |

`CharacterBootstrapper`'s `classTraitIds`
(`packages/engine/src/pipeline/characterBootstrapper.ts`) grants a class's
full `startingProficiencyTraitIds` only to `save.classes[0]`; every class
after it gets the reduced `multiclassTraitIds` set instead
(`isPrimary = classState === save.classes[0]`, in effect — the first entry in
the array). `CharacterSave.classes` is built straight from whatever order a
`character_classes` query returns, and that table records no class order or
primary-class marker at all. None of its three readers orders the query:
`getAuthoritativeRuntimeContext` (`apps/server/src/gateway/socket.ts:195`,
called `classRows`), `fetchCharacterPayload`
(`apps/server/src/routes/character.ts:89`, called `classLedger`) and
`applyLevelUp` (`apps/server/src/controllers/characterController.ts:72`,
called `existingClasses`) each run a bare
`.select().from(characterClasses).where(...)`
with no `.orderBy(...)`. A sequential scan over a small table usually returns
rows in insertion order, which is why this has not been seen in practice —
but an `UPDATE` (a level-up on the primary class) writes a new row version,
and Postgres is free to return that version anywhere in a later scan once the
old one is vacuumed. So after a primary-class level-up, a multiclass
character (Lyra, Nyx, Kaelen in the sample data) can have its *second* class
read back as `classes[0]`: the primary class silently drops to the reduced
multiclass grant set, its `*_starting_*` choice-block answers (already stored
under `choices.classSelections`) match nothing offered any more and become
`orphan_selection`, those answers drop off the sheet, and the next level-up
that sends any picks at all is refused by `collectChoiceIssues` for choices
the character can no longer explain.

Fix needs an ordering column (e.g. a `sequence` on `character_classes`) or an
explicit primary-class marker, plus `ORDER BY` in all three readers above.
Small schema change, but every reader has to agree, and Branch B is about to
add a fourth write path (creation-time choice collection) that would
otherwise inherit the same bug — hence landing this first.

**Closed 2026-09-21** on `fix/class-order`. `character_classes` gained a
`position` column recording the order a class was taken, and
`classLedgerOrder` now orders every ledger read — `getAuthoritativeRuntimeContext`
and the `REST_COMPLETED` handler (both in `apps/server/src/gateway/socket.ts`),
`fetchCharacterPayload` (`apps/server/src/routes/character.ts`), `applyLevelUp`
(`apps/server/src/controllers/characterController.ts`) and
`loadCharacterClassLevels`
(`apps/server/src/services/referenceProvider/databaseReferenceProvider.ts`) —
with the writers that populate `character_classes` (creation, level-up and
the sample seeder) updated to keep it. Migration `0015_add_class_position` is
applied to the dev database. The hand check reproduced #74's exact failure
condition on Lyra Silverstring (bard 6 / rogue 1): after an `UPDATE` on her
bard row, an unordered `select` returned `class_rogue, class_bard` — rogue
first, the trap this section describes — while the ordered read still
returned `class_bard, class_rogue`. With the server restarted, Lyra's sheet
loaded correctly: socket joined and synced with no `action_error`, and her
bard starting skills (Performance, Acrobatics, Arcana) remained proficient.

Every row that existed before migration `0015_add_class_position` took the
column's default of 0, so a multiclass character created before the
migration and never re-seeded would have all its classes at position 0 and
fall back to the `class_id` tiebreak, which can be the wrong class. Verified
2026-09-21 by a read-only query against the dev database: it holds no
characters outside the ten samples, and the three multiclass samples (Lyra,
Nyx, Kaelen) each have distinct positions after the re-seed — so no stored
character is affected.

### 11f. #73 — the web sheet applies no trait modifiers

Found while planning `feat/character-choices`, 2026-09-21. `activeModifiers`
was set only by the dev-only `TraitWidget`; `useAbilities`
(`apps/web/src/hooks/useCharacterStats.ts`) added equipment modifiers alone;
the creation wizard stores pre-racial scores (`wizardStore.ts`: "3-18 pre
racial"). So no racial ability bonus, fixed or chosen, reached a live sheet,
while the server's `buildLiveSheet` applied them — the two disagreed.
Verified 2026-09-21: Lyra Silverstring (half-elf, stored CHA 18) showed CHA
18 on the sheet, which hid the disagreement rather than proving it absent.

**Closed 2026-09-21** on `fix/sheet-modifiers`; see
[the design](superpowers/specs/2026-09-21-sheet-modifiers-design.md).
`gatherSheetModifiers` and `gatherBaseStates`
(`packages/engine/src/pipeline/sheetModifiers.ts`) are now the one gather for
trait, equipment and live-effect modifiers and states, used by both
`buildLiveSheet` and the web store, whose `getSheetModifiers` and
`getSheetStates` getters call them and feed the derived-stat hooks. The ten
samples in `seedSampleCharacters.ts` now store pre-racial scores instead of
final scores; this also stops the server double-counting the racial bonuses
it had been applying on top of their already-final stored scores. Draconic
Resilience's AC in the pack
(`packages/database/data/packs/core_2014_pack/traits/ported.json`) gained
`forbiddenStates: ["status_wearing_armor"]`, matching Unarmored Defense,
after the first hand check caught it beating armour it should have yielded
to.

**Hand check** (dev servers + local Postgres, branch at `fe81676`). Every
sample's six ability scores and max HP matched the spec's baseline in both
runs — only AC moved:

| Sample | AC on `main` (baseline) | AC, first run (Tasks 1–3) | AC, final run (after 3b, 3c) |
| --- | --- | --- | --- |
| Lyra | 16 | 16 | 16 |
| Sable | 22 | 22 (Defense missing) | 23 |
| Ko Shen | 15 | 15 | 15 |
| Grimnar | 12 | 15 | 15 |
| Nyx | 14 | 15 (Draconic Resilience beat her armour) | 14 |
| Vaerix | 19 | 19 (Defense missing) | 20 |

The first run's two misses were both traced and fixed before the final run:
Sable and Vaerix were missing Fighting Style: Defense because the web store's
`baseStates` was always `[]` and its `activeStates` composed only on events,
so the worn-equipment state `status_wearing_armor` never reached it — fixed
by `gatherBaseStates` / `getSheetStates` (Task 3b, `cc42b7a`). Nyx's Draconic
Resilience was winning over her studded leather because the pack's copy
carried no `forbiddenStates` — fixed by the Draconic Resilience pack change
above (Task 3c, `fe81676`). After both fixes, the pack was re-imported and
the samples re-seeded, and every AC matched the spec's expected values.

Test totals: shared 227, engine 958, database 198, server 404, web 355 =
**2142**, hygiene passed.

### 11g. #75 and #76 — found while implementing `fix/sheet-modifiers`

| # | Item | Notes |
| --- | --- | --- |
| 75 | Feat-granted traits never reach either sheet's modifiers | Found while designing `fix/sheet-modifiers`, 2026-09-21; recorded as out of scope rather than fixed. See below. |
| 76 | The web store's composed `activeStates` still lacks trait and equipment states, so trigger and dice-rule gating still miss them | Found by `fix/sheet-modifiers`'s hand check, 2026-09-21; recorded rather than fixed. See below. |

- **#75 — feat-granted traits never reach either sheet's modifiers.** A feat
  is stored as a `feat_selection` `character_traits` row. That row never
  enters the web store's save, and the server's
  `CharacterBootstrapper.resolveGrantedTraitIds` reads a character's race,
  background and classes only — no `feat_selection` source. So a feat's
  modifiers, an ability-score increase or any other feat effect, reach
  neither the server's `buildLiveSheet` nor the web store's
  `getSheetModifiers`, the same shape of gap #73 closed for trait, equipment
  and live-effect modifiers, one grant source short. `CharacterSave` itself
  has no feat field, so the fix needs a decision on where a feat pick is
  stored and read from before either side can pick it up.
- **#76 — the web store's composed `activeStates` still lacks trait and
  equipment states.** #73's fix routes the derived-stat hooks through the new
  `getSheetStates()`, but the store's existing `composeActiveStates` still
  composes only over `baseStates`, which the store always sets to `[]` — a
  separate field from the `gatherBaseStates`-backed states `getSheetStates()`
  now returns. Trigger and dice-rule gating still read the empty
  `activeStates`: `dispatchAuthoredEvent`, `useCheckRoll`, and the
  `ArmorClassWidget`, `TableRulesWidget`, `TurnControlsWidget` and
  `ConditionsWidget` widgets. If `fix/sheet-modifiers`'s final review fixes
  this before the branch closes, that review closes #76 rather than leaving
  it recorded here.
