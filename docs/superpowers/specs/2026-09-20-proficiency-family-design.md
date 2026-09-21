# Closing the Proficiency Family

Date: 2026-09-20
Status: implemented
Owner: Claude pair session

**Post-merge correction (2026-09-21):** "offered" below describes the pack
data this branch authored, not an experience a player has today. The rogue's
four-from-eleven and the acolyte's two languages are choice blocks with no UI
to present them; only the fixed grant, "a War Domain cleric wears heavy
armour", is true end to end. See the corrected "No calculator changes"
paragraph under Engine changes for what actually reaches a live sheet.

## Goal

Author every remaining proficiency stub the schema can express, and give tools
the roster they never had. After this, a level 1 rogue is offered four skills
from eleven, an acolyte speaks two languages of their choice, a War Domain
cleric wears heavy armour, and no proficiency grant in the pack names an id
nothing knows.

Branch: `feat/proficiency-family`, on top of `360c239`.

## Where this starts

`8ba584a` merged the spellcasting slots branch. 398 traits are rule-free of
584, and 2,027 tests are green.

Thirty-six of those 398 are proficiency grants: 17 skills, 2 languages, 9
tools and 8 subclass bonus grants. Every one of them is data the schema
already expresses, waiting on nobody.

## Findings that shaped the design

1. **Tools do not need a catalogue, they need a roster.** The earlier reading
   — recorded in the item-proficiency spec and again in backlog 8e — was that
   tools cannot be authored because the pack has no tool items to resolve
   against. That conflated two mechanisms. Weapons and armour resolve against
   the catalogue; **languages and skills resolve against a hand-written
   dictionary in `proficiencyDictionary.ts`**, and tools are the same shape as
   languages. Nothing was blocking them.

2. **The tool vocabulary is already drifting, unguarded.** The gnome's
   `tinker` says in its own lore "You have proficiency with tinker's tools"
   and grants `artisans_tools` — a category id where a specific one belongs,
   and the wrong category. The dwarf offers `smiths_tools`,
   `brewers_supplies` and `mason_tools`, the last inconsistent with its two
   siblings. Four tool ids are authored in the whole pack and two of them are
   wrong, because `listProficiencyOptions("tools")` returns `undefined` and
   `proficiencyRosterDrift.test.ts` skips the category entirely.

3. **An id-pattern search misses members of the family.** Counting stubs whose
   id matches `prof` finds 33 and misses `trait_blessings_of_knowledge`, the
   Knowledge Domain's two languages and two skills at expertise. Searching by
   what a trait *does* rather than what it is called found it. That is a
   reason to distrust the 8e count, not only to correct it.

4. **Three proficiency-family stubs are not expressible and must be excluded.**
   See "Out of scope" — each needs a schema concept that does not exist, and
   authoring them anyway would encode a rule wrongly.

5. **`trait_blessings_of_knowledge` is cleanly expressible where `trait_expertise`
   is not**, though both grant expertise. Knowledge's options are a fixed list
   of four skills; Expertise's options are "proficiencies you already hold",
   which a static `options` array cannot say.

## Decisions taken

1. **Tools get a roster, not a catalogue.** `TOOL_DICTIONARY` beside
   `LANGUAGE_DICTIONARY`, and `listProficiencyOptions("tools")` returns it.
   The drift guard then covers tools with no change to the guard itself — it
   already skips exactly the categories with no roster.

2. **The roster holds specific tools only.** The PHB never grants "artisan's
   tools" as a blanket proficiency; it grants "one type of artisan's tools of
   your choice", which is a choice block. Category grants are authored as
   explicit option lists, as `dwarf_artisan_tools` already does. Adding a
   category mechanism to `ChoiceProficiencyGrant` would be a schema change to
   save about a dozen lines of authoring.

3. **The full PHB roster, not only the ids this branch references.** A roster
   missing an entry rejects legitimate authoring later, and the set is closed.

4. **A stub that cannot be authored correctly stays a stub.** Three are
   excluded with their reasons recorded, rather than authored approximately.

## Architecture

### 1. `TOOL_DICTIONARY`

In `packages/engine/src/rules/proficiencyDictionary.ts`, built like the
language dictionary — a flat record of `{ id, name }` — with 39 entries:

| Group | Count | Ids |
| --- | --- | --- |
| Artisan's tools | 17 | `alchemists_supplies`, `brewers_supplies`, `calligraphers_supplies`, `carpenters_tools`, `cartographers_tools`, `cobblers_tools`, `cooks_utensils`, `glassblowers_tools`, `jewelers_tools`, `leatherworkers_tools`, `masons_tools`, `painters_supplies`, `potters_tools`, `smiths_tools`, `tinkers_tools`, `weavers_tools`, `woodcarvers_tools` |
| Gaming sets | 4 | `dice_set`, `dragonchess_set`, `playing_card_set`, `three_dragon_ante_set` |
| Musical instruments | 10 | `bagpipes`, `drum`, `dulcimer`, `flute`, `horn`, `lute`, `lyre`, `pan_flute`, `shawm`, `viol` |
| Kits and standalone tools | 6 | `disguise_kit`, `forgery_kit`, `herbalism_kit`, `navigators_tools`, `poisoners_kit`, `thieves_tools` |
| Vehicles | 2 | `vehicles_land`, `vehicles_water` |

`listProficiencyOptions` gains a `case "tools"` returning the ids. No grouping
field on the entries: nothing reads one, and the choice blocks carry their own
option lists.

### 2. The two live defects this exposes

The guard goes red before either fix, which is the order to do them in:

| Trait | Authored now | Becomes |
| --- | --- | --- |
| `tinker` (gnome) | `artisans_tools` | `tinkers_tools` |
| `tool_proficiency` (dwarf) | `mason_tools` | `masons_tools` |

### 3. Skills — 17 stubs

Eleven class grants, as choice blocks against the skill roster:

| Trait | Picks | Options |
| --- | --- | --- |
| `trait_bard_prof_skills` | 3 | any skill (no `options`, so the roster answers) |
| `trait_cleric_prof_skills` | 2 | history, insight, medicine, persuasion, religion |
| `trait_druid_prof_skills` | 2 | arcana, animal_handling, insight, medicine, nature, perception, religion, survival |
| `trait_fighter_prof_skills` | 2 | acrobatics, animal_handling, athletics, history, insight, intimidation, perception, survival |
| `trait_monk_prof_skills` | 2 | acrobatics, athletics, history, insight, religion, stealth |
| `trait_paladin_prof_skills` | 2 | athletics, insight, intimidation, medicine, persuasion, religion |
| `trait_ranger_prof_skills` | 3 | animal_handling, athletics, insight, investigation, nature, perception, stealth, survival |
| `trait_rogue_prof_skills` | 4 | acrobatics, athletics, deception, insight, intimidation, investigation, perception, performance, persuasion, sleight_of_hand, stealth |
| `trait_sorcerer_prof_skills` | 2 | arcana, deception, insight, intimidation, persuasion, religion |
| `trait_warlock_prof_skills` | 2 | arcana, deception, history, intimidation, investigation, nature, religion |
| `trait_wizard_prof_skills` | 2 | arcana, history, insight, investigation, medicine, religion |

Two multiclass grants: `trait_bard_prof_mult_skills` takes one of any skill;
`trait_rogue_mult_prof_skills` takes one from the rogue list above.

Four background pairs, as fixed grants: acolyte insight and religion, criminal
deception and stealth, noble history and persuasion, soldier athletics and
intimidation.

### 4. Languages — 2 stubs

`trait_acolyte_languages` chooses two and `trait_noble_languages` chooses one,
both unbounded against the language roster, which already excludes Druidic and
Thieves' Cant as secret.

### 5. Tools — 9 stubs

| Trait | Grant |
| --- | --- |
| `trait_bard_prof_tools` | choose 3 of the 10 instruments |
| `trait_bard_prof_mult_tools` | choose 1 of the 10 instruments |
| `trait_druid_prof_tools` | `herbalism_kit`, fixed |
| `trait_monk_prof_tools` | choose 1 of the 17 artisan's tools and 10 instruments together |
| `trait_rogue_prof_tools` | `thieves_tools`, fixed |
| `trait_rogue_mult_prof_tools` | `thieves_tools`, fixed |
| `trait_noble_prof_tools` | choose 1 of the 4 gaming sets |
| `trait_soldier_prof_tools` | choose 1 gaming set, plus `vehicles_land` fixed |
| `trait_criminal_prof_tools` | choose 1 gaming set, plus `thieves_tools` fixed |

### 6. Subclass bonus grants — 8 stubs

| Trait | Subclass | Grant |
| --- | --- | --- |
| `trait_cleric_life_prof_bonus` | Life | `category_armor_heavy` |
| `trait_cleric_war_prof_bonus` | War | `category_weapon_martial`, `category_armor_heavy` |
| `trait_cleric_tempest_prof_bonus` | Tempest | `category_weapon_martial`, `category_armor_heavy` |
| `trait_cleric_nature_prof_bonus` | Nature | `category_armor_heavy`, plus one of animal_handling, nature, survival |
| `trait_blessings_of_knowledge` | Knowledge | 2 languages of choice, plus 2 of arcana, history, nature, religion at **expertise** |
| `trait_bard_lore_prof_bonus` | College of Lore | choose 3 of any skill |
| `trait_bard_valor_bonus_prof` | College of Valor | `category_armor_medium`, `category_armor_shield`, `category_weapon_martial` |
| `trait_rogue_assassin_bonus_prof` | Assassin | `disguise_kit`, `poisoners_kit`, fixed |

The armour and weapon ids are the vocabulary the item-proficiency branch
established, so these resolve against the catalogue and the existing coverage
guard checks them.

## Data changes

Thirty-six stubs authored, moved from `traits/unimplemented.json` into the
class file that owns them, following the barbarian; the four background traits
go to `backgrounds/core.json`. Two ids corrected in `races/gnome.json` and
`races/dwarf.json`. #30 falls from 398 to 362. Pack JSON is edited only
through `packages/database/scripts/patchPackSegment.ts`.

## Engine changes

| File | Change |
| --- | --- |
| `rules/proficiencyDictionary.ts` | `TOOL_DICTIONARY` and the `tools` case in `listProficiencyOptions` |
| `rules/__tests__/proficiencyRosterDrift.test.ts` | the docstring, which currently names tools as roster-less |

No calculator changes. That is true for fixed grants, which the calculators
already consume through `ProficiencyExtractor.extractProficiencies`; this
branch gives them data. It is not true for choice blocks, which are 21 of the
36 traits authored here: nothing outside this branch's own tests calls
`listPendingChoices` or references `PendingProficiencyChoice` anywhere in
`apps/web/src` or the server, and the character-creation wizard has no
proficiency step. Background proficiencies reach no live sheet at all today,
fixed or chosen - `CharacterSaveSchema`
(`packages/shared/src/schemas/runtime/characterSave.ts`) has no background
field, so `CharacterBootstrapper.resolveGrantedTraitIds` builds its id list
from race and class traits only. In practice, roughly 8 of the 36 traits this
branch authored reach a live sheet today: the fixed tool/armour/weapon grants
hanging off classes and subclasses. The rest is data authored ahead of a UI
that does not exist yet.

## Testing

The drift guard does most of the work the moment the roster exists — every
tool grant must name a roster id, and it fails on `artisans_tools` and
`mason_tools` before they are fixed. Prove that by running it before the fixes
rather than after, and sabotage the tools case in both directions afterwards.

Beyond the guard, a pack-driven suite: each of the four backgrounds grants its
two PHB skills; a level 1 rogue is offered four picks from eleven; the monk's
block offers 27 options spanning artisan's tools and instruments; the acolyte
is owed two languages and the noble one; and a Knowledge Domain cleric's two
skill picks arrive at expertise rather than proficiency.

## Out of scope, with reasons

Three proficiency-family stubs stay stubs because the schema cannot say what
they do, and authoring them approximately would encode a rule wrongly:

- **`trait_expertise`** (bard and rogue). Its options are "proficiencies you
  already hold", and `ChoiceProficiencyGrant.options` is a static array. A
  block with no options falls back to the whole skill roster, so a rogue could
  take expertise in a skill they are not proficient in.
  `ProficiencyExtractor.isWorthTaking` already compares held levels and is
  half of what this needs; the missing half is a way for a block to say its
  roster is the character's own proficiencies.
- **`trait_feat_skilled`**. Three picks spanning skills *or* tools, and a
  choice block carries one category. Splitting it into two blocks would grant
  three of each.
- **`trait_jack_of_all_trades`** and **`trait_remarkable_athlete`**. Half
  proficiency on every check you are *not* proficient in, which is a blanket
  rule rather than a grant naming an id.

Also out of scope: the Nature Domain's druid cantrip, which needs spell lists
that do not exist; Favoured Enemy's language, which is tied to an enemy-type
choice the schema cannot model; and the `ability_check` category, which has
one authored grant and no stubs.
