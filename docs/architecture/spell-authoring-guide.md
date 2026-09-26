# Spell Authoring Guide

How a spell goes from a stub in `spells/unimplemented.json` to a castable
spell in `spells/core.json`. Eldritch Blast, Dancing Lights, Faerie Fire and
Burning Hands are the worked examples; read them beside this.

The engine interprets the pack; the pack describes the rule. A spell is
authored once, with the numbers that depend on its caster left abstract, and
the spell synthesizer (`packages/engine/src/pipeline/spellSynthesizer.ts`)
fills them in for each character and each source that grants it.

## What a spell record says

| Field | What it holds |
| --- | --- |
| `id`, `name` | Stable id (`spell_<name>`) and display name. |
| `level`, `school`, `isRitual` | The book's values. `level: 0` is a cantrip. |
| `lore` | `shortDescription` (your own words, 280 characters at most) and `fullText` (see Text). |
| `range` | `{ kind: "feet", feet, area? }` or `{ kind: "self", area? }`. `area` is the spell's area, authored once, here. |
| `components` | `verbal`, `somatic`, `material`, and `materialDescription` when `material` is true. `goldCost` and `isConsumed` for a costly component. |
| `duration` | `{ kind: "instantaneous" }` or `{ kind: "timed", amount, unit: "minute", concentration }`. |
| `action` | The action the spell grants. Casting time is its `activation`. Its id is `action_spell_<name>`. |

`touch`, `sight` and `unlimited` ranges, and `round`, `hour` and
`until_dispelled` durations, do not exist yet. The first spell that needs one
adds it to `SpellRangeSchema` or `SpellDurationSchema`; the repo adds no
schema variant before a real rule needs it.

## Which effect fits which spell

| The spell… | Its effect | Example |
| --- | --- | --- |
| makes an attack roll | `attack`, `attackType: "ranged_spell"` or `"melee_spell"`, `attackStat: "SPELLCASTING_MOD"` | Eldritch Blast |
| makes several attack rolls at once | `attack` with `repeat: { label, thresholds }` | Eldritch Blast's beams |
| forces a save for damage | `save` with `damage` and `saveEffect: "half_damage"` or `"no_damage"` | Burning Hands |
| forces a save, then lasts | `macro` of a `save` (`negates_effect`) and a concentration `apply_effect` | Faerie Fire |
| changes the caster's own numbers while it lasts | `apply_effect` with `modifiers` or `states` | — |
| heals | `heal` — a stub until it gains a casting modifier, upcast dice and a target (#122) | — |
| does what only the table can see | a concentration `apply_effect` if it concentrates, `no_effect` otherwise; the rest in a `tableNote` | Dancing Lights |

Author `SPELLCASTING_MOD` for `attackStat` and for a save's
`dcCalculation.scalingStat`.

Never author `attackBonus`, `damageBonus`, `repeatCount`, `savingThrow.dc`,
or a save's `areaOfEffect`: the synthesizer stamps them from the casting
source and the spell's `range`, and pack validation rejects a spell that
authors them (`spell_hardcodes_caster_value`).

The sheet models one character, so a save is the targets' to roll. A `save`
effect reports "DEX save DC 13 · half damage on a success · 15-foot cone" and
rolls its damage once; it never rolls the caster's own save.

## What is resolved when

| When | What | Where |
| --- | --- | --- |
| The sheet is built | casting ability, attack bonus, save DC, area, beam count, damage dice at the character's level, doubled critical dice | `synthesizeSpells` |
| The spell is cast | the slot's level, and the dice `perSlotAbove` adds for it | `settleSpellCast`, then the resolver's `spellCast` context |

## How a spell reaches a character

- **A fixed grant** on a trait (`spells.fixed`), from `unlockLevel` on.
  - `usage` sets the price: `at_will` is free, `resource` spends the named pool, and `always_prepared` spends a slot.
  - `castingStat` sets the ability, and falls back to the granting class's.
- **A stored pick** on a `spell_choice` node. A cantrip is free and a leveled spell spends a slot. The ability is the node's `castingStat`, or the class's.

Each spell is one entry per source. Its action id is
`${spell.action.id}@${sourceKey}`, where the source key is the class id for
a class's own spells and the trait id otherwise (`action_spell_faerie_fire@drow_magic`).

Leveled spell choices offer nothing until #31a gives the pack class spell
lists (`spellOptions`, `packages/engine/src/pipeline/spellChoices.ts`). A new
leveled spell therefore reaches characters only through fixed grants until
then; do not work around this per spell.

## Components

- **Verbal and somatic** are displayed and never gated (#116).
- **Material** requires `materialDescription`, which pack validation checks.
  - A component pouch, or a focus in the casting source's `focusCategories`, covers it silently.
  - Otherwise the sheet asks the player to confirm, and the server refuses an unconfirmed cast.
  - A class declares its foci on its `spellcasting` block; a racial or feat grant has none, so a pouch only.
- **A costly or consumed material** (`goldCost`, `isConsumed`) is not enforced yet (#117). Author it, and say so in the `tableNote`.

## Durations and concentration

A concentration spell's action applies an `apply_effect` with
`isSelfConcentration: true`, `durationType: "rounds"`, and `durationRounds`
equal to the duration in rounds (a minute is 10). Pack validation requires
the two to agree (`concentration_mismatch`). Casting a new concentration spell
ends the old one, and End Concentration ends it at any time.

## Scaling

- **Cantrip damage dice** use a segment's `levelScaling` with `scalingMode: "total_level"` (Fire Bolt: 2d10 at 5, 3d10 at 11, 4d10 at 17).
- **A cantrip's beam count** uses `repeat`, laddered by character level.
- **Upcast damage** uses `perSlotAbove` on a leveled spell's segment: plain dice of the segment's own die size (`invalid_upcast` otherwise).
- **Any other upcast** — more targets, more rays, a longer duration — is not modelled. Say it in the `tableNote`, or leave the spell a stub.

## Text

- `fullText` is the SRD 5.1 wording where the spell is in the SRD; `README.md` carries the CC-BY-4.0 attribution. A spell outside the SRD gets a paraphrase.
- `shortDescription` and `tableNote` are always your own words.
- A `tableNote` is the part of the rule the engine cannot run, in words the table can act on.

## When a capability is missing

If a spell needs something the engine cannot do, leave it a stub and record
the capability in `docs/TODO_BACKLOG.md`. A spell that quietly does part of
what it says is the failure the `unimplemented` marker exists to prevent.

## The workflow

1. **Move the spell.** Write a patch with `upsertSpells` (the authored spell) for `spells/core.json` and `deleteSpellIds` for `spells/unimplemented.json`, and apply each with `pnpm exec tsx scripts/patchPackSegment.ts <segment> <patch>` from `packages/database`. Never hand-edit pack JSON.
2. **Record it.** Add the id to the authored list in `implementationMarkers.test.ts`.
3. **Validate.** Run `DATABASE_URL= pnpm --filter @project/database test`: pack assembly runs every rule above and names the one that fails.
4. **Test anything new.** Add an engine test only when the spell needed a new capability.
5. **Check it live.** Hand-check it on a sample character who has the spell (`docs/development/sample-characters.md`).
