# Scenario characters — ten more samples, built for live checks

**Date:** 2026-09-23
**Branch:** `feat/scenario-characters`
**Backlog items exercised:** #24, #31a, #36, #62, #65b, #66, #70, #76, #77,
#80, #81, #83, #86, #88, #92, #93, #94, #95, #97, #98, #99, #101.
No item is closed by this branch; it gives each one a character to check it
against by hand.

## Problem

The ten sample characters (`packages/database/src/seedSampleCharacters.ts`,
ids `…0110`–`…0119`) are a *coverage* set: between them they reach every
class, race, equipment slot, reset condition and hit point state. They were
built to fill the sheet, not to stage a check, so the things a unit test cannot
reach have no character to try them on:

- **Level-up flows** need a character parked one level short of the
  interesting level — an ability score increase that raises Constitution, a
  subclass picked at 3, an invocation with a prerequisite. Driving the wizard
  end to end is a hand check; the first ten sit at levels chosen for coverage.
- **Multi-client behaviour** — two tabs on one character, a crafted socket
  intent — needs a character whose state makes the divergence visible (a
  half-orc at low hit points with Relentless Endurance unspent).
- **The next Tier 2 passes** (rogue, spells, wild shape, sorcery points) each
  need a character to verify against, and today each pass would build one ad
  hoc.
- **States the UI cannot create** — a level column that disagrees with the
  class ledger, a resource stored above its maximum, attunement over the cap,
  content the pack does not author — are exactly what the sheet has to
  survive, and nothing seeds them.

## Decisions (owner, 2026-09-23)

1. **Ten new characters**, balanced across four kinds: level-up staging,
   multi-client / socket, next-pass previews, and deliberately broken data.
2. **A new module, the same seed.** The ten live in
   `packages/database/src/sampleScenarioCharacters.ts`;
   `pnpm --filter @project/database db:seed:samples` seeds all twenty. The
   original ten are not edited.
3. **Live checks are scripts in the doc.** Each new character gets an entry in
   `docs/development/sample-characters.md`: steps, what you see today, what you
   should see once the linked item is fixed, and the backlog ids. The roster
   entry keeps a one-line `testFocus` that names those ids.
4. **Orrik keeps a stub race.** The most severe survival test — a race the
   pack does not author — is in scope, which means the seeder gains a race
   stub path.
5. **The doc's stale "Known gaps" section is corrected** while the doc is
   being rewritten: it still describes the E1 equip defects, fixed 2026-08-21.

## The roster

Ids `00000000-0000-0000-0000-00000000012{0..9}`; the last digit is the row.
All ten join the Dev Smoke Campaign, owned by `dev-user-1`, like the first ten.

| # | Character | Lvl | Build | Race | Background | Kind |
| --- | --- | --- | --- | --- | --- | --- |
| 120 | Quill Ashgrove | 2 | Rogue 2 | Forest gnome | Folk Hero (stub) | Staging, rogue-pass preview |
| 121 | Brannoc Hale | 3 | Fighter 3 (Champion) | Hill dwarf | Soldier | Staging |
| 122 | Isolde Varn | 4 | Warlock 4 (Archfey) | High elf | Noble | Staging |
| 123 | Ursk Gravemaw | 5 | Paladin 5 (Vengeance) | Half-orc | Criminal | Multi-client, dip staging |
| 124 | Tamsin Burrowdeep | 6 | Barbarian 6 (Totem Warrior) | Stout halfling | Outlander (stub) | Multi-client / socket |
| 125 | Hesk Mossgather | 8 | Druid 8 (Moon) | Human | Custom | Wild-shape preview |
| 126 | Seraphine Dusk | 9 | Wizard 9 (Divination) | Dark elf | Sage (stub) | Wizard / spells preview |
| 127 | Kestrel Vey | 7 | Sorcerer 7 (Wild Magic) | Silver dragonborn | Charlatan (stub) | Sorcery-points preview |
| 128 | Brother Mote | 11 (column 12) | Cleric 11 (Tempest) | Half-elf | Acolyte | Broken data |
| 129 | Orrik Stonehide | 13 | Fighter 13 (Rune Knight, stub) | Goliath (stub) | Hermit (stub) | Broken data, unknown content |

Final ability scores below are what the sheet shows. Stored scores are
pre-racial (#73) and include every ability score increase already taken; the
plan derives them from these. Hit point maxima are derived by the engine from
stored base rolled hit points (#78); the plan derives the stored base, taking
average rolls after first level.

### 120 — Quill Ashgrove, Rogue 2 (level-up staging, rogue-pass preview)

- **Final scores:** STR 8, DEX 16, CON 14, INT 15, WIS 12, CHA 10. Full hit
  points.
- **Answers:** the rogue's four starting skills. Nothing else is asked:
  Expertise cannot be stored (#66) and Folk Hero is a stub with no grants
  (#70).
- **Kit:** leather armour (body), shortsword (main hand), shortbow and arrows,
  thieves' tools, burglar's pack.
- **Live checks:**
  - Level to 3 and take Arcane Trickster. Spell slots should appear only once
    the subclass is held — the subclass-derived caster level the web layer has
    no test for (#65b). The Arcane Trickster's cantrip and spells-known
    questions are not asked yet (#31a).
  - No skill shows doubled proficiency (#66); Sneak Attack is not on the attack
    card (rogue pass).
  - Folk Hero grants nothing (#70).

### 121 — Brannoc Hale, Fighter 3 Champion (level-up staging)

- **Final scores:** STR 16, DEX 12, CON 15, INT 10, WIS 13, CHA 8. Full hit
  points. Constitution is odd on purpose, so a +1 at level 4 moves its
  modifier.
- **Answers:** Fighting Style Dueling; the fighter's two skills; the dwarf's
  artisan's tools; the soldier's gaming set.
- **Kit:** chain mail (body), longsword (main hand), off hand deliberately
  empty. Second Wind and Action Surge unspent.
- **Live checks:**
  - Level to 4 with +1 CON, +1 STR. The review step previews
    `hpRoll + projected CON modifier`; the stored gain also raises the three
    earlier levels by one each, so the preview understates it by at least 3
    (#88).
  - Double-click Level Up. Both requests pass the ledger check and the
    character gains two levels of hit points for one level (#94).
  - Attack with the longsword: Dueling's +2 never applies, because nothing
    emits `status_wielding_one_handed_only` (#24).
  - Dwarven Toughness adds 1 per level to the derived maximum.

### 122 — Isolde Varn, Warlock 4 Archfey (level-up staging)

- **Final scores:** STR 8, DEX 16, CON 14, INT 13, WIS 10, CHA 15. Wounded,
  not bloodied.
- **Answers:** Pact of the Chain at 3; two level-2 invocations with no
  prerequisite (not Nyx's pair); the warlock's two skills; the high elf's
  cantrip, answered with a pack spell that stays a wizard cantrip after #31a
  (Minor Illusion), and its language; the noble's gaming set and language. **The level-4
  increase is taken as the Alert feat** — the first feat on any sample.
- **Kit:** leather armour, dagger, arcane focus, component pouch.
- **Live checks:**
  - Level to 5. The new invocation question offers Voice of the Chain Master
    and shows Thirsting Blade disabled as unmet — it needs Pact of the Blade
    (#81, a regression check). The pact slot level rises.
  - Initiative shows Alert's +5.
  - Pact of the Chain summons nothing: the familiar is not an actor the
    engine knows (#36).

### 123 — Ursk Gravemaw, Paladin 5 Vengeance (multi-client, dip staging)

- **Final scores:** STR 17, DEX 10, CON 14, INT 8, WIS 10, CHA 14. Current hit
  points 6. **The level-4 increase is taken as Tough.**
- **Answers:** Fighting Style Great Weapon Fighting; the paladin's two skills;
  the criminal's gaming set.
- **Kit:** chain mail, greatsword. Relentless Endurance **available**, Lay on
  Hands partly spent, Channel Divinity available.
- **Live checks:**
  - Open the sheet in two tabs. Land a lethal hit in tab A (Relentless
    Endurance fires, 1 hit point), then a second lethal hit in tab A (charge
    spent, server stores 0). Tab B still shows more than 0 and holds an
    unspent local charge; the next lethal hit there lands it on 1 while the
    database and tab A show 0 (#92).
  - Heal from the stale tab: the notice reports the delta that applied (#93,
    a regression check).
  - Tough adds 2 per level to the derived maximum.
  - Open the multiclass dip menu: sorcerer, warlock and bard are allowed; wizard
    is refused on Intelligence, judged on final scores (#77).

### 124 — Tamsin Burrowdeep, Barbarian 6 Totem Warrior (multi-client / socket)

- **Final scores:** STR 16, DEX 16, CON 16, INT 8, WIS 12, CHA 8. Bloodied, just
  under half.
- **Answers:** Totem Spirit Eagle at 3, Aspect of the Beast Eagle at 6; the
  barbarian's two skills.
- **Kit:** body slot empty (Unarmoured Defence); maul in the main hand — a heavy
  weapon on a Small creature, which nothing models; **plate armour carried in
  the backpack**. Rage 2 of 4.
- **Live checks:**
  - Rage: Eagle Dash is offered. Equip the plate: it disappears (#76).
  - With two tabs open, equip the plate in tab B: tab A's action list updates.
    Attune an item in tab B: tab A recomposes (#101, a regression check).
  - Emit `ACTION_INTENT` for `action_eagle_dash` while the plate is worn: the
    reply is `executed: true` with nothing applied (#97).
  - Dismiss Rage from the Active Effects widget while wearing the plate. It
    works today, because no authored ender carries a state predicate; this is
    where #99 shows the day one does.

### 125 — Hesk Mossgather, Druid 8 Moon (wild-shape preview)

- **Final scores:** STR 11, DEX 13, CON 15, INT 11, WIS 18, CHA 9. Wounded.
- **Answers:** the human's language; the druid's two skills. **Custom
  background** ("Grove Warden") whose `customTraitIds` include a pack trait
  that carries a choice block.
- **Kit:** hide armour, shield, scimitar, druidic focus, herbalism kit.
  `trait_wild_shape` stored 1 of 2, short rest; spell slots partly spent.
- **Live checks:**
  - Take a short rest: Wild Shape does not refill — no rule sits behind the
    pool (#62).
  - Slots show; no spell is listed (#83).
  - The custom background's choice block is never asked, in any wizard (#80).

### 126 — Seraphine Dusk, Wizard 9 Divination (wizard / spells preview)

- **Final scores:** STR 8, DEX 16, CON 8, INT 18, WIS 12, CHA 11. Wounded.
- **Answers:** the wizard's two skills; Sage is a stub with no grants (#70, its
  first user).
- **Kit:** spellbook, crystal focus, hand crossbow and bolts, robe. Drow Magic:
  Faerie Fire spent, Darkness available (both `dawn`). Portent and Arcane
  Recovery pools stored; spell slots partly spent.
- **Live checks:**
  - The maximum is overstated. Constitution 8 is a -1 modifier, and the
    engine floors it at +1 per level (#86): nine levels, 18 more than the rules
    give. The HP test pins the inflated number with a comment naming #86.
  - Slots show; the spellbook lists nothing (#31a, #83).
  - Portent and Arcane Recovery are stubs; Sunlight Sensitivity is a stub
    (#30's race row).
  - Spend Darkness and rest: Drow Magic returns at dawn, not on a short rest.

### 127 — Kestrel Vey, Sorcerer 7 Wild Magic (sorcery-points preview)

- **Final scores:** STR 10, DEX 14, CON 14, INT 10, WIS 12, CHA 18. Full hit
  points.
- **Answers:** two Metamagic options at 3; the sorcerer's two skills.
- **Kit:** dagger, component pouch, explorer's pack. Sorcery Points 3 of 7
  (`trait_font_of_magic`), Tides of Chaos 0 of 1, the cold breath charge spent;
  spell slots partly spent.
- **Live checks:**
  - Sorcery Points have no rule behind them: a long rest does not restore them
    (#62).
  - Tides of Chaos and Wild Magic Surge are stubs.
  - The breath charge returns on a short rest; its cone deals cold damage.

### 128 — Brother Mote, Cleric 11 Tempest (broken data)

- **Final scores:** STR 14, DEX 10, CON 14, INT 10, WIS 20, CHA 13. **Current
  hit points stored above the derived maximum.**
- **Answers:** the half-elf's ability, skill and language picks; the acolyte's
  languages; the cleric's skills. Valid in every way the invariant tests check
  except the level column.
- **Kit:** plate, warhammer, shield, holy symbol, and **four attuned items**
  against the cap of three — the cloak and ring of protection, the amulet of
  health, the boots of elvenkind, all existing sample items.
- **Broken on purpose:**
  - `characters.level` is 12; the ledger sums to 11. Every level-up returns 400
    with no way to repair it from the UI (#95).
  - Channel Divinity is stored 5 of 2. The display clamps to 2, and the next
    two genuine spends move nothing the player can see (#98).
  - The next hit point write clamps the over-maximum total.
  - The sheet has to show — or refuse — a fourth attunement it cannot have
    created.

### 129 — Orrik Stonehide, Fighter 13 Rune Knight (broken data, unknown content)

- **Final scores:** STR 20, DEX 12, CON 18, INT 8, WIS 12, CHA 10. The pack
  knows no Goliath, so stored and final are equal.
- **Stubs the seed supplies:** `race_goliath` (speed 30),
  `subclass_fighter_rune_knight`, `background_hermit`, and two items — a
  Frost Brand greatsword (attunement, a cold rider the item schema does not
  express, so description only) and a Belt of Hill Giant Strength (attunement,
  STR set to 21, **no equip slot**, so it sits attuned in the backpack).
- **Answers:** Fighting Style Great Weapon Fighting; the fighter's two skills.
  Race and subclass traits (Stone's Endurance, Powerful Build, Rune Carver,
  Giant's Might) are `character_traits` rows that resolve to nothing.
- **Expected save issues:** `unknown_race`, `unknown_subclass`.
- **Live checks:**
  - Does the sheet load, and does `ROOM_JOIN` succeed?
  - What do the level-up wizard and the dip menu do with a subclass the
    snapshot does not have?
  - Does an attuned item with no slot apply its STR modifier?

### What the twenty cover together

- **Levels** 1–9, 11–14, 17, 20.
- **Races** all nine, every subrace but eight of the ten dragonborn colours,
  plus one the pack does not author.
- **Subclasses** 20 of the pack's 40 (21 once Quill takes Arcane Trickster),
  plus one the pack does not author.
- **Feats** Alert and Tough — the first two.
- **Backgrounds** all four preset rows, all five stubs, two custom.
- **Broken states** a drifted level column, an over-maximum resource, an
  over-maximum hit point total, attunement over the cap, unknown race and
  subclass.

## Code

### `packages/database/src/sampleScenarioCharacters.ts` (new)

Exports `SCENARIO_ROSTER` (the ten) and the stubs only they need —
`SCENARIO_RACES`, `SCENARIO_SUBCLASSES`, `SCENARIO_BACKGROUNDS`,
`SCENARIO_ITEMS`. It takes `SampleCharacter` and the stub types with
`import type` from `seedSampleCharacters.ts`, so there is no runtime import
cycle. Brother Mote's attuned items reuse the existing `SAMPLE_ITEMS`.

### `packages/database/src/seedSampleCharacters.ts`

- `ROSTER` becomes `[...BASE_ROSTER, ...SCENARIO_ROSTER]`, the original ten
  unchanged under a new local name. The exported stub lists concatenate the
  same way, so every importer sees twenty characters and every stub.
- **Race stubs.** A `SAMPLE_RACES` list (`id`, `name`, `speed`,
  `requiresSubrace: false`, `lore.shortDescription`) inserted by
  `seedReferenceStubs` with `onConflictDoNothing` and the `dev_sample_pack`
  stamp, like every other stub. Exported.
- **Two optional fields on `SampleCharacter`:**
  - `levelColumn?: number` — written to `characters.level` instead of the
    ledger sum. Exists for #95 only; its doc comment says so.
  - `expectedIssues?: string[]` — the save-issue codes this character is built
    to raise.
- Header comment, console summary and the closing message stop saying "ten".

Re-running the seed resets all twenty. That is how a staging character is
restored after its level-up check.

### Spell slot pools

None of the first ten seeds a `spell_slots_<n>` row, so "partly spent slots"
is new. The plan must confirm a seeded `spell_slots_<n>` row is what the sheet
shows — that the pool materialiser (#63) keeps a seeded row rather than
overwriting it — before relying on it. If it overwrites, the casters seed no
slot rows and the live checks say so.

## Tests

All four iterate `ROSTER`, so they cover the twenty with these changes:

- **`packages/database/src/__tests__/sampleRosterIds.test.ts`** — races include
  `SAMPLE_RACES`; one new assertion that character ids are unique across both
  modules.
- **`apps/server/src/services/__tests__/sampleCharacterChoices.test.ts`** —
  each character raises exactly its `expectedIssues` codes (sorted), nothing
  more and nothing missing. Only Orrik declares any.
- **`apps/server/src/services/__tests__/sampleCharacterScores.test.ts`** and
  **`sampleCharacterHitPoints.test.ts`** — ten new rows each. A number that is
  wrong today because of an open item is pinned with a comment naming it, as
  Nyx's #87 note is: Seraphine's #86-inflated maximum is one. When that item is
  fixed, its branch meets a deliberate red test and updates the number.

**If the engine throws on Orrik** — an unknown race or subclass reaching a
path that assumes it resolves — rather than reporting an issue, that is a
finding: record it in the backlog as a new item, and have the affected test
skip Orrik with a comment naming that item. Do not fix it on this branch.

## Docs

- **`docs/development/sample-characters.md`** — the roster table splits into a
  *coverage set* (the original ten) and a *scenario set* (the new ten); the
  coverage summary covers the twenty; a **Live checks** section holds one
  script per new character (steps, today, after the fix, backlog ids); a note
  that Brother Mote and Orrik are broken on purpose; a note that re-running the
  seed resets them. The stale **Known gaps** section is corrected.
- **`docs/TODO_BACKLOG.md`** — #70's "background_sage is a fourth the seeder
  creates that no sample character uses" gains its first user (Seraphine), and
  Folk Hero, Outlander and Charlatan gain a second each.

## Out of scope

- Fixing any backlog item the characters exercise.
- A per-character reset flag on the seed. The whole seed is idempotent and
  quick.
- Seeding active effects, conditions or temporary hit points: the operational
  schema has no table for them.

## Verification

1. `pnpm --filter @project/database test` and `pnpm --filter @project/server
   test` green; typecheck with `tsc -b` per package.
2. **With the owner's go-ahead**, seed the dev database (additive — it only
   upserts the twenty ids and inserts stubs), start the server, and open each
   of the ten new sheets in the browser pane. Record what fails to load, most
   likely Orrik; do not fix it here.

## Corrections found while planning (2026-09-23)

Reading the code for the implementation plan changed several details above.
The plan (`docs/superpowers/plans/2026-09-23-scenario-characters.md`) and
`docs/development/sample-characters.md` follow this section where the two
disagree.

1. **A stored pool with no rule behind it is hidden, not stale.** `useFeatures`
   (`apps/web/src/hooks/useFeatures.ts`) drops any `character_resources` row
   the rule snapshot cannot resolve. Hesk's Wild Shape, Kestrel's Sorcery
   Points and Tides of Chaos, and Seraphine's Portent and Arcane Recovery are
   stored but not shown; their live checks say "not shown", not "not
   refilled".
2. **Brother Mote's #98 case is a spell slot pool.** Channel Divinity has no
   rule, so a stored 5 of 2 would be hidden rather than frozen. His
   `spell_slots_1` is stored at 6 against a derived maximum of 4 instead.
3. **Mote attunes the Headband of Intellect, not the Amulet of Health.** The
   amulet's CON 19 would lift his maximum above the hit points stored to
   exceed it.
4. **Quill's level-up asks for cantrips.** At rogue 3 with Arcane Trickster the
   Choices step asks for three cantrips and offers all 111 placeholder spells;
   only the spells-known question is missing (#31a).
5. **Isolde's level-5 invocation is a single pick**, and Agonizing Blast also
   shows unmet ("needs Eldritch Blast"), because spell picks are not stored
   until #31a.
6. **Tamsin wears an unattuned Cloak of Protection**, so the two-tab
   attunement check (#101) has something to attune.
7. **Orrik's unresolved race traits** are Stone's Endurance, Natural Athlete
   and Mountain Born. Powerful Build was dropped from the list: the pack
   defines `trait_powerful_build`, so it would resolve.
8. **The doc's "Serve them with the database provider" section is stale too**
   (`REFERENCE_SOURCE=static` no longer exists), and goes with "Known gaps".

Every number in the plan — final scores, derived maxima, zero save issues, and
Orrik's two expected issues — was measured by running the scenario module
through the calls the invariant tests make.
