# Item Proficiency Resolution

Date: 2026-09-19
Status: implemented
Owner: Claude pair session

## Goal

Make a proficiency grant in the pack actually resolve against the item it
names, guard the vocabulary so it cannot drift again, and author the class
proficiencies that were never written. After this, a fighter holding a
greataxe adds their proficiency bonus, the sheet shows it, and a grant that
names nothing in the catalogue fails a test instead of failing silently.

Branch: `feat/item-proficiency`, on top of `1a82335`.

## Where this starts

`1a82335` closed the barbarian burndown. 1,935 tests green across the five
packages, typecheck green, 441 of 585 traits rule-free.

Every weapon proficiency grant in the shipped pack is dead, and has been since
the pack cutover. Nothing reports it.

## Findings that shaped the design

1. **No weapon grant in the pack matches any weapon.**
   `combat.ts:549-553` accepts a grant whose `proficiencyId` equals
   `weapon.category` or `weapon.id`. The pack authors `simple_weapons`,
   `martial_weapons` and ten `weapon_*` ids. Weapons carry categories
   `simple_melee | martial_melee | simple_ranged | martial_ranged` and ids
   `item_weapon_*`. **Zero of the twelve authored ids match anything**, and no
   layer between the pack and the calculator normalises them.

2. **The tests agree with the bug.** `combat.test.ts` grants `martial_melee`
   and `simple_melee` - spellings no pack grant uses - against a `makeWeapon`
   factory that defaults to the same. The proficiency branch is covered, and
   covered against data that does not exist.

3. **The guard already exists and deliberately skips this category.**
   `proficiencyRosterDrift.test.ts` asserts every grant names an id its
   category's roster knows, and says in a comment that tools, weapons and
   armour are skipped for want of a roster. It caught two live bugs in the
   categories it does cover. Weapons were simply outside it.

4. **Armour has the same bug one category over, plus a split.** The barbarian
   grants `light_armor` / `medium_armor` / `shield`; the dwarf grants
   `armor_light` / `armor_medium`. Two spellings for one concept in one pack.
   Nothing reads armour proficiency at all, so neither spelling costs anything
   today.

5. **The web sheet's proficiency record is empty for every character.**
   `characterSheetRouteData.ts:101` reads `character.proficiencies || {}` off
   the API payload; the payload is a spread of the `characters` row
   (`character.ts:73`); that table has no such column. So `store.proficiencies`
   is always `{}`, and *every* consumer of it is inert - not only weapon
   proficiency in `useCombat.ts:98` but every skill and every saving throw in
   `useCharacterStats.ts:71`. The live sheet has never added a proficiency
   bonus to anything. Both hooks carry a "recover the category by matching the
   id" workaround for a record that is empty anyway.

6. **Only three of twelve classes have a weapon grant at all.** Barbarian,
   dwarf and elf (plus drow) are authored; 17 weapon and 16 armour stubs sit
   in `traits/unimplemented.json`. Fixing resolution without authoring them
   leaves the headline at "proficiency works for three of twelve".

7. **Tools cannot be derived.** The pack has no tool items - no smith's tools,
   no instruments - so there is nothing for a tool grant to resolve against.
   Tools need a hand-written roster like languages, which is a separate job.

8. **The pack's own `proficiencies` section ships empty.**
   `CoreProficiencySchema`, `PackSectionSchema` and `MERGED_SECTIONS` all
   support it; the core pack authors zero entries and does not own the section.
   The backlog records a deliberate stance that the roster is engine-side, not
   authored rules, so this design does not fill it.

## Decisions taken

1. **An item names its own proficiencies.** The canonical id is what the
   catalogue already says: the category tags a weapon carries, the armour
   category, and the item id. Nothing new to author and nothing to keep in
   sync - the vocabulary *is* the catalogue.

2. **`weapon.category` stops being a match.** One spelling per concept.
   `martial_melee` is the weapon's category, not a proficiency id.

3. **Armour gets the same vocabulary, with the guard as its only reader.**
   The split is closed and cannot reopen. Armour proficiency still changes no
   number; that is stated rather than hidden.

4. **The guard derives its legal set from the same helper combat matches
   with**, so a grant cannot pass the guard and fail in combat. It extends the
   existing drift test rather than starting a new one.

5. **The web derives grants from traits.** `ProficiencyExtractor` is the
   engine's answer and the server already uses it; the store calls the same
   thing. The flat `proficiencies` record and both id-guessing recoveries are
   deleted rather than repaired.

6. **Stubs are authored into their class files**, following the barbarian,
   whose proficiency traits live in `classes/barbarian.json` while `bard.json`
   only references ids it does not define.

7. **Tools and `ability_check` are left alone**, and recorded in the backlog.

## Architecture

### 1. `packages/engine/src/rules/itemProficiency.ts`

New module, pure, no pack dependency. Three exports:

```ts
export const weaponProficiencyIds = (weapon: WeaponView): string[] =>
  [weapon.id, ...weapon.categoryTags];

export const armorProficiencyIds = (item: EquipmentDefinition): string[] => [
  item.id,
  ...(item.armorCategory ? [`category_armor_${item.armorCategory}`] : []),
  ...item.categoryTags.filter((tag) => tag.startsWith("category_armor_")),
];

export const isProficientWithWeapon = (
  grants: FixedProficiencyGrant[],
  weapon: WeaponView,
): boolean => { /* grants.some(weapons && ids.includes(proficiencyId)) */ };
```

Kept apart from `proficiencyDictionary.ts`, which answers a different question:
that file lists what an open choice block may offer, this one decides whether a
grant covers an item.

Armour has no runtime consumer. `armorProficiencyIds` exists for the guard,
which is a real reader - it is what stops the `light_armor` / `armor_light`
split reopening. This is recorded here so the function does not read as dead
code waiting to be deleted.

### 2. `WeaponView` carries `categoryTags`

`equipmentProjection.ts` widens the projection to
`Pick<EquipmentDefinition, "id" | "name" | "categoryTags">`. `categoryTags`
has a schema default, so the inferred type makes it required, which breaks the
twelve hand-built `WeaponView` literals in `weaponSynthesizer.test.ts` and
`actionResolver.test.ts` and the two `makeWeapon` factories in
`combat.test.ts` and `criticalDamage.test.ts`. That breakage is the point:
those factories are exactly where invented ids let the bug pass.

### 3. The pack rewrite

Twenty grants across eight traits. Weapon grants (14, in
`trait_barbarian_prof_weapons`, `trait_barbarian_mult_prof_weapons`,
`dwarven_combat_training`, `elf_weapon_training`, `drow_weapon_training`) and
armour grants (6, in `trait_barbarian_prof_armor`,
`trait_barbarian_mult_prof_armor`, `dwarven_armor_training`).

| authored today | becomes |
| --- | --- |
| `simple_weapons` | `category_weapon_simple` |
| `martial_weapons` | `category_weapon_martial` |
| `weapon_battleaxe` and nine siblings | `item_weapon_battleaxe`, ... |
| `light_armor`, `armor_light` | `category_armor_light` |
| `medium_armor`, `armor_medium` | `category_armor_medium` |
| `shield` | `category_armor_shield` |

All ten item ids were verified to exist in `equipment/weapons.json`, as was
every id the stubs in section 6 will need. Pack JSON is edited only through
`packages/database/scripts/patchPackSegment.ts`.

### 4. The guard

Two cases added to
`packages/engine/src/rules/__tests__/proficiencyRosterDrift.test.ts`, driven by
`corePackEquipment()` and `corePack().equipment`. For weapons and for armour,
each grant must

- name an id in the union of `weaponProficiencyIds` / `armorProficiencyIds`
  over every item in the pack, and
- cover at least one item.

The second condition is what catches a plausible-looking id that happens to
match nothing. Both are sabotage-verified in each direction - an off-vocabulary
grant must fail, and a grant that covers nothing must fail - following the
precedent `equipmentGaps.test.ts` set.

The comment naming the skipped categories is updated: tools and `ability_check`
remain skipped, and the reason is now "no items to derive from" rather than
"no roster yet".

### 5. The web selector

`getProficiencyGrants()` on `characterSheetStore`:

```ts
const save = toCharacterSave(get());
return ProficiencyExtractor.extractProficiencies(
  get().getActiveTraits(),
  CharacterBootstrapper.resolveSelections(save),
);
```

The same call `characterEngine.ts:289` makes. Three consumers repoint:

- `useCombat` filters the grants for `weapons` and hands them to
  `calculateWeaponAttack` unchanged. The record translation at lines 86-102
  goes.
- `useCharacterStats` takes skill and saving-throw grants from the same source.
  Both recoveries - "every key is a skill" and "match the id against an ability
  name" - go.
- `TraitWidget` reads it for its "Proficiencies: N" counter and its
  already-held comparison, which today compare against an empty record.

The `proficiencies` field is then removed from the store, from
`characterSheetRouteData` and from the test fixtures that set it to `{}`. The
API response shape is left alone; it simply stops being read.

### 6. The stubs

The 17 weapon and 16 armour stubs move from `traits/unimplemented.json` into
their class files and are authored against the PHB. Classes whose grant is a
category use the category tag; classes granted a named list use item ids -
the druid's ten, the rogue's and bard's hand crossbow, longsword, rapier and
shortsword, the monk's shortsword, the wizard's and sorcerer's five.

Multiclass (`*_mult_*`) traits are authored against the PHB multiclass table,
which grants less than the starting set. A stub the table grants nothing for is
**deleted rather than authored**, following the Tier 1 pattern.
`trait_cleric_mult_prof_weapons` is the known case: a cleric multiclass gains
armour and shields, no weapons.

`trait_barbarian_prof_skills`' choice block also gains the missing
`chooseAmount: 2`. Without it the schema default of 1 gives a barbarian one
starting skill instead of two.

## Data changes

| File | Change |
| --- | --- |
| `classes/barbarian.json` | 3 weapon + 4 armour grants respelled; `chooseAmount: 2` |
| `races/dwarf.json` | 4 weapon + 2 armour grants respelled |
| `races/elf.json` | 7 weapon grants respelled (elf + drow) |
| `classes/{bard,cleric,druid,fighter,monk,paladin,ranger,rogue,sorcerer,warlock,wizard}.json` | 32 proficiency traits authored, moved in from `traits/unimplemented.json` |
| `traits/unimplemented.json` | 33 removed: 32 into the class files above, one (`trait_cleric_mult_prof_weapons`) deleted outright — the PHB's cleric multiclass table grants no weapons |

## Engine changes

| File | Change |
| --- | --- |
| `rules/itemProficiency.ts` | new |
| `rules/equipmentProjection.ts` | `WeaponView` gains `categoryTags` |
| `calculators/combat.ts` | the inline predicate at 549-553 becomes a call |
| `rules/__tests__/proficiencyRosterDrift.test.ts` | two cases, comment updated |

## Web changes

| File | Change |
| --- | --- |
| `store/characterSheetStore.ts` | `getProficiencyGrants()` added, `proficiencies` removed |
| `hooks/useCombat.ts` | reads the selector, record translation deleted |
| `hooks/useCharacterStats.ts` | reads the selector, both recoveries deleted |
| `components/sheet/TraitWidget.tsx` | reads the selector |
| `pages/characterSheetRouteData.ts` | stops passing `proficiencies` |

## Testing

**Engine.** A new `itemProficiency.test.ts` covers the derivations directly: a
greataxe yields its id and both its tags, a shield yields
`category_armor_shield`, plate yields `category_armor_heavy`. `combat.test.ts`
is rewritten onto real ids, and gains the pair that matters - a barbarian
holding a greataxe adds `Proficiency (+2)`, a wizard holding the same greataxe
does not. What was actually built is narrower than a full table-driven PHB
check, on purpose: four cases across three named classes (barbarian, wizard,
rogue) are checked precisely, against real pack ids, and a fifth sweeps every
class in the pack and asserts none of them is left proficient with nothing it
can hold. Restating the PHB table a second time here would duplicate the one
the class-authoring task already keeps, and a copy drifts.

**Guard.** The two new drift cases, each sabotaged in both directions before
being trusted.

**Web.** The store selector returns real grants for a level 1 barbarian.
`useCombat` shows `Proficiency (+2)` in an attack breakdown.
`useCharacterStats` shows a proficient skill and a proficient saving throw -
both of which are currently impossible.

## Verification

The fix is proved by a number moving, not by tests passing. Before the change,
a barbarian holding any weapon shows an attack breakdown with no `Proficiency`
token; after it, the token is there. The same check on the sheet, through the
UI, is what closes the web half.

Sabotage is required, not optional, on both guard cases - the comparison in
`equipmentGaps.test.ts` had a bug on first write that let six mismatches pass.

## Known limitations

- **Armour proficiency still changes no number.** The vocabulary is correct and
  guarded; no calculator reads it. The 5e penalty for wearing armour you lack
  proficiency with is deliberately not implemented here.
- **The druid's non-metal restriction is not expressible.** A grant says which
  armour category, not what it is made of. The druid gets light and medium
  armour and shields with no material condition, which is over-generous.
- **Tools and `ability_check` stay unguarded**, for want of anything to derive
  a vocabulary from.
- **`listProficiencyOptions("weapons")` still returns `undefined`.** No choice
  block in the pack offers an open weapon pick, so the roster would have no
  caller.
- **`StartingEquipmentCategoryTagSchema` keeps its name** although its values
  are now proficiency ids too. Renaming it reaches the importer and starting
  equipment code, which this branch does not otherwise touch.

## Out of scope

- The 17 skill stubs (not 18 — `trait_barbarian_prof_skills` was already
  authored on `feat/barbarian-traits`, before this branch's baseline, and does
  not belong in the count of what is left). Their consumer already works once
  section 5 lands; they are a separate authoring spec.
- A consumer for armour proficiency.
- A tool roster and the 9 tool stubs.
- Filling the pack's empty `proficiencies` section.
