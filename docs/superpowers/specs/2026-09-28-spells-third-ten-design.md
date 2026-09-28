# The third ten spells — pure data, and the gaps written down

**Date:** 2026-09-28
**Branch:** `feat/spells-third-ten`
**Backlog items:** #31 (spells marked `unimplemented`: 10 more of 111 authored
here, leaving 87); #127–#131 (new: the capabilities the rest are blocked on).

## Goal

Author ten more spell stubs from `spells/unimplemented.json`, chosen from the 25
stubs that `docs/development/spells-definitions.md` now defines: Bane, Bless,
Charm Person, Animal Friendship, Banishment, Confusion, Blight, Cone of Cold,
Daylight, and Create Food and Water. None needs a new schema, engine or web
capability. Record the capabilities the rest of the 25 are blocked on, so the
next batch knows what it would have to build.

## Where this starts

`main` at 577a25b has fourteen authored spells. Their patterns, all checked
live, are in `docs/architecture/spell-authoring-guide.md`:

- a save for half damage, with an area or a single target (Burning Hands,
  Hellish Rebuke);
- a save that negates, and nothing else (Command);
- a macro of a save that negates and a concentration effect (Faerie Fire,
  Suggestion);
- a concentration effect alone (Dancing Lights, Darkness);
- `no_effect` with a table note (Identify, Nondetection, Speak with Dead).

### Choosing the ten

The owner asked for up to ten spells from the stubs the definitions document
covers. 25 qualify. A two-stage analysis (five analysts, then a skeptic per
batch checking each claim against the code) sorted them:

| Group | Spells |
| --- | --- |
| Authorable today, nothing missing | Bane, Charm Person, Animal Friendship, Daylight, Create Food and Water, Arcane Eye, Blight, Cone of Cold, Commune, Commune with Nature |
| Authorable today; a table note covers what the sheet cannot apply to the caster | Bless, Beacon of Hope, Death Ward, Confusion, Control Water, Blink, Banishment, Conjure Elemental, Blur |
| Blocked on a missing capability | Cure Wounds (#122), Barkskin, Call Lightning, Cloudkill, Destructive Wave, Crusader's Mantle |

All 25 definitions are complete in the document.

## Decisions (owner, 2026-09-28)

1. **The ten:** Bane, Bless, Charm Person, Animal Friendship, Banishment,
   Confusion, Blight, Cone of Cold, Daylight, Create Food and Water — pure data,
   mostly combat, and reached at lower levels. Commune, Commune with Nature
   (paladin 17 / druid 9) and Arcane Eye wait.
2. **Live check:** Bless on Sister Aveline Cor (Life cleric), Bane on Ursk
   Gravemaw (Vengeance paladin 5), and a new Circle of the Land (Desert) druid 7
   for Blight and Create Food and Water. The other six rely on tests: every
   effect shape they use was checked live in the last two batches.
3. **Docs:** the authoring guide gains the new worked examples and a list of
   blocked capabilities; the backlog records those capabilities as #127–#131;
   `docs/development/spells-definitions.md` is tracked (committed d469434).

## Design

No schema, engine or web change. The ten are pack data, moved from
`spells/unimplemented.json` to `spells/core.json` with the patch script's
`upsertSpells` and `deleteSpellIds`, exactly as the last two batches did.

### The ten spells

`fullText` is the SRD 5.1 wording; every one of the ten is in the SRD.
`shortDescription` (280 characters at most) and every `tableNote` are original
wording. Every save authors `dcCalculation: { base: 8, scalingStat:
"SPELLCASTING_MOD", includeProficiency: true }`.

| Spell | Level, school | Activation | Range | Components | Duration |
| --- | --- | --- | --- | --- | --- |
| Bane | 1, enchantment | action | feet 30 | V, S, M "a drop of blood" | 1 minute, concentration |
| Bless | 1, enchantment | action | feet 30 | V, S, M "a sprinkling of holy water" | 1 minute, concentration |
| Charm Person | 1, enchantment | action | feet 30 | V, S | 1 hour |
| Animal Friendship | 1, enchantment | action | feet 30 | V, S, M "a morsel of food" | 24 hour |
| Daylight | 3, evocation | action | feet 60, sphere 60 | V, S | 1 hour |
| Create Food and Water | 3, conjuration | action | feet 30 | V, S | instantaneous |
| Banishment | 4, abjuration | action | feet 60 | V, S, M "an item distasteful to the target" | 1 minute, concentration |
| Confusion | 4, enchantment | action | feet 90, sphere 10 | V, S, M "three nut shells" | 1 minute, concentration |
| Blight | 4, necromancy | action | feet 30 | V, S | instantaneous |
| Cone of Cold | 5, evocation | action | self, cone 60 | V, S, M "a small crystal or glass cone" | instantaneous |

No material has a gold cost or is consumed.

| Spell | Effect |
| --- | --- |
| Bane | `macro`: `save` CHA `negates_effect`, then `apply_effect` "Bane", 10 rounds, concentration |
| Bless | `apply_effect` "Bless", 10 rounds, concentration; no modifiers |
| Charm Person | `save` WIS `negates_effect`, no damage |
| Animal Friendship | `save` WIS `negates_effect`, no damage |
| Daylight | `no_effect` |
| Create Food and Water | `no_effect` |
| Banishment | `macro`: `save` CHA `negates_effect`, then `apply_effect` "Banishment", 10 rounds, concentration |
| Confusion | `macro`: `save` WIS `negates_effect`, then `apply_effect` "Confusion", 10 rounds, concentration |
| Blight | `save` CON `half_damage`, `8d8` necrotic, `perSlotAbove: "1d8"` |
| Cone of Cold | `save` CON `half_damage`, `8d8` cold, `perSlotAbove: "1d8"` |

**Bless carries no modifier.** Its d4 is dice, and a modifier's `value` is a
number; and an `apply_effect`'s modifiers always land on the caster, who may
not be a target. So Bless is a concentration effect, and its table note tells
the player to add the d4 to their own attack rolls and saves if they blessed
themselves (#131).

**Confusion's area does not grow.** Each slot level above 4th adds 5 feet to
the sphere's radius. The synthesizer stamps the authored 10-foot radius onto
the save line, so the table note says the radius grows.

Table notes, carrying what the engine does not run:

- **Bane** — Up to three creatures you can see make the save, plus one more for
  each slot level above 1st. Each that fails subtracts a d4 from every attack
  roll and saving throw it makes until the spell ends.
- **Bless** — Up to three creatures, plus one more for each slot level above
  1st. Each adds a d4 to every attack roll and saving throw it makes until the
  spell ends. If you blessed yourself, add the d4 to your own rolls: the sheet
  does not.
- **Charm Person** — A humanoid you can see; it makes the save with advantage
  if you or your companions are fighting it. On a failure it regards you as a
  friendly acquaintance for the hour, or until you or your companions harm it,
  and knows afterwards that you charmed it. Each slot level above 1st adds a
  target; all must be within 30 feet of each other.
- **Animal Friendship** — A beast you can see and that can hear you; one with an
  Intelligence of 4 or more is unaffected. On a failure it is charmed by you for
  24 hours, or until you or your companions harm it. Each slot level above 1st
  adds a beast.
- **Daylight** — Bright light fills a 60-foot-radius sphere, and dim light
  another 60 feet beyond. Cast on an object you hold or one nobody wears or
  carries, the light moves with it; covering the object blocks the light. It
  dispels any darkness created by a spell of 3rd level or lower that overlaps
  it.
- **Create Food and Water** — 45 pounds of food and 30 gallons of fresh water
  appear on the ground or in containers within range: enough for fifteen
  humanoids or five steeds for 24 hours. The food is bland but nourishing, and
  spoils if uneaten after 24 hours; the water does not go bad.
- **Banishment** — A creature you can see; each slot level above 4th adds one,
  all within 30 feet of each other. A creature native to this plane is
  banished to a harmless demiplane, incapacitated, and returns when the spell
  ends. A creature from another plane returns to its home plane, and does not
  come back if you concentrate for the full minute.
- **Confusion** — Each creature in a 10-foot-radius sphere makes the save; the
  radius grows 5 feet for each slot level above 4th. An affected creature can't
  take reactions and rolls a d10 at the start of each of its turns: 1, it moves
  in a random direction; 2–6, it does nothing; 7–8, it makes a melee attack
  against a random creature within reach; 9–10, it acts normally. At the end of
  each of its turns it repeats the save, ending the effect on itself on a
  success.
- **Blight** — Undead and constructs are unaffected. A plant creature makes the
  save with disadvantage and takes the maximum damage; a nonmagical plant that
  isn't a creature withers and dies.
- **Cone of Cold** — A creature killed by this spell becomes a frozen statue
  until it thaws.

### Existing tests that change

- **Three tests use Bless as their example of a stub** — the synthesizer's and
  the character engine's "a picked stub makes no action", and the bootstrapper's
  "one too many High Elf cantrips". Each moves to Cure Wounds, which stays a
  stub until #122 is built, with a comment saying why. Tests that use Bless as a
  leveled spellbook pick (`spellChoices.test.ts`, the bootstrapper's "nothing to
  offer" case) are unaffected: a leveled pick is still refused, and still known.
- **The implementation-marker test** lists 24 authored spell ids.

### The new sample character

`00000000-0000-0000-0000-000000000132`, a Circle of the Land (Desert) druid 7,
added to `packages/database/src/sampleScenarioCharacters.ts` after Cassia
Emberlane. The circle choice (`druid_land_level_3_circle_land:
["trait_land_circle_spells_desert"]`) grants Blur at 3 (still a stub), Create
Food and Water at 5 and Blight at 7. Every slot is full (4/3/3/1), and they
carry a druidic focus. The roster pins go from 22 to 23; the hit-point and
score invariant tests gain the new character.

### Hand check

After `db:import-pack --yes` and `db:seed:samples`:

1. **Sister Aveline Cor** — Bless: Cleric · Slot, Concentration badge; cast with
   a 1st-level slot; Active effects shows Bless Concentrating; the note says to
   add the d4 yourself if blessed.
2. **Ursk Gravemaw** — Bane: "Bane: CHA save DC … · a success negates it" and
   Concentrating; the slot is spent.
3. **The desert druid** — Blight with the 4th-level slot: "Blight: CON save DC …
   · half damage on a success" and eight d8 of necrotic; Create Food and Water
   with a 3rd-level slot casts with no prompt and shows its note; Blur is listed
   as not yet automated.

## Docs

- `docs/architecture/spell-authoring-guide.md` — Bless as the example of a buff
  the sheet cannot apply to the caster (table-resolved, #131); Confusion as the
  example of an upcast that grows the area; Blight and Cone of Cold beside the
  existing damage-save examples; and a "Blocked capabilities" list naming
  #122 and #127–#131, with the stubs each blocks.
- `docs/TODO_BACKLOG.md` — #31 becomes 87 of 111 and names the ten. New open
  items, each in the file's existing shape:
  - **#127 — no AC floor.** Barkskin's "AC can't be less than 16": no modifier
    type sets a minimum (`ModifierTypeSchema`), and `calculateAC` takes the
    highest `set_base` and adds to it.
  - **#128 — no repeat action while concentrating.** Call Lightning and
    Cloudkill (and Moonbeam, Spiritual Weapon, Flaming Sphere) let the caster
    repeat part of the spell on later turns without a slot, at the original
    cast level and DC. A spell grants exactly one action.
  - **#129 — no damage type chosen at cast time.** Destructive Wave's radiant or
    necrotic: `DamageSegment.damageType` is one value, and the cast request
    carries no choice.
  - **#130 — no weapon damage granted by an effect.** Crusader's Mantle, Divine
    Favor and Hunter's Mark add dice to weapon hits while an effect lasts; the
    weapon attack's damage pool holds only the weapon's own segment.
  - **#131 — no dice bonus on the caster's own rolls from an effect.** Bless
    (authored table-resolved here), and later Guidance and Resistance: a
    modifier's value is a number, and an effect cannot tell whether the caster
    is one of its targets.
- `docs/development/sample-characters.md` — the new druid's row and script;
  Aveline's and Ursk's scripts gain their spell steps; counts become
  twenty-three and thirteen, and the subclass coverage line is recounted.

## Testing

- **Database** — the ten ids join the authored list (24 of 111); the assembled
  pack validates (concentration lengths, upcast dice, no hard-coded caster
  values); the roster invariants cover the new druid.
- **Engine, server, web** — no new tests: no code changes. The existing suites
  run against the new pack data, and the three stub-example tests move to Cure
  Wounds.

## Known limitations

- Bless's d4 on the caster's own rolls is the player's to add (#131).
- Confusion's stamped area stays at 10 feet when upcast; the note says so.
- Bane's, Banishment's and Confusion's concentration starts even if every
  target saves (#126).
- Charm Person's hour, Animal Friendship's 24 hours and Daylight's hour are not
  counted down (#125).
- Extra targets from upcasting are the table's to track.

## Out of scope

- Commune, Commune with Nature, Arcane Eye and the rest of the
  authorable-today group.
- Building any of #122 or #127–#131.
- The other 87 stubs.
