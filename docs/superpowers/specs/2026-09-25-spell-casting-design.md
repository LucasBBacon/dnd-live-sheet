# Spell casting — four spells, and the pattern for the other 107

**Date:** 2026-09-25
**Branch:** `feat/spell-casting`
**Backlog items:** #31 (spells marked `unimplemented`: 4 of 111 authored here),
#31b (spell *rules*, whose first four this is), #83 (the sheet does not list a
character's picked spells — its core closes here).

## Goal

Make Eldritch Blast, Dancing Lights, Faerie Fire and Burning Hands castable
from the live sheet, with correct numbers, payment, components and
concentration — and in doing so settle how every later spell is authored, so
that the remaining 107 are mostly data.

## Where this starts

Nothing in the runtime turns a spell into something the sheet can cast.
Authoring a spell's `action` today changes nothing the player can press.

- **Spells never reach an action list.** `CharacterEngine.buildLiveSheet`
  builds `actions` from standard actions, trait actions and weapons
  (`packages/engine/src/pipeline/characterEngine.ts`); no spell is added.
  `SpellbookEngine.getCastableSpells`
  (`packages/engine/src/calculators/spellbook.ts`) clones a spell's action and
  substitutes `SPELLCASTING_MOD`, but has no caller and is not exported.
  `FixedSpellGrant.castingStat`, `unlockLevel` and `usage` are read by nothing
  at runtime. There is no Cast button and no spell list on the sheet (#83).
- **The spell record carries no casting metadata.** `SpellDefinitionSchema`
  has `id`, `name`, `level`, `school`, `isRitual`, `action` and the
  `implementation` marker. `SpellComponentSchema` exists in the same file and
  is referenced nowhere.
- **The resolver would roll these spells wrong**
  (`packages/engine/src/pipeline/actionResolver.ts`):
  - `attack` rolls `1d20 + (effect.attackBonus ?? 0)` and never reads
    `attackStat`. Weapons work only because `buildLiveSheet` stamps
    `attackBonus` ahead of time; a spell attack would roll at +0.
  - `save` rolls d20 plus the **caster's own** save modifier for `targetStat`,
    never judges it, never rolls damage, and ignores `areaOfEffect` and
    `saveEffect`. Its DC, reported only in `summary`, is never displayed.
  - `DamageSegment.levelScaling` is never evaluated; every segment rolls its
    `baseDice`.
  - `macro` runs its nested effects and discards their `rollResults`.
  - Nothing supports upcasting. `RollContextPayload.consumedSlotId` is never
    read.
- **Concentration is half there.** `apply_effect` copies
  `isSelfConcentration` onto the effect, and `EffectManager.addEffect` drops
  the previous concentration effect first
  (`packages/engine/src/calculators/effects.ts`). But `dropConcentration` does
  not remove the actors tied to the dropped effect, the sheet shows no
  concentration indicator, and nothing can end concentration except an
  authored `remove_effect`.
- **Components are unmodelled.** Foci exist and are tagged
  `category_arcane_focus`, `category_druidic_focus` and
  `category_holy_symbol` (`equipment/core.json`, `gear.json`, `legacy.json`)
  for starting-equipment grants; `item_gear_component_pouch` carries no tag.
  Nothing reads the tags as "can be used as a focus".
- **Slot pools are identified only by id.** `spell_slots_1`..`spell_slots_9`
  and `pact_slots` are ordinary charge pools; the pact slot level is the
  `pact_slot_level` resource, which `SpellcastingEngine` re-derives as
  `pactSlotLevel`.
- **Refusals never reach the player.** Nothing in `apps/web/src` reads
  `ActionResult.executed`, `reason` or `economyOverdrawn`.
- **`save` is already authored on eleven pack actions:** the ten Dragonborn
  breath weapons (`races/dragonborn.json`) and the Berserker's Intimidating
  Presence (`classes/barbarian.json`). All eleven currently roll the
  character's own save, and the breath weapons never roll their damage.

Where each spell comes from:

| Spell | Granted by | Payment today |
| --- | --- | --- |
| Eldritch Blast | a warlock cantrip pick | at will |
| Dancing Lights | `drow_magic` (`races/elf.json`), `usage: at_will`, `castingStat: CHA` | at will |
| Faerie Fire | `drow_magic` at total level 3, `usage: resource` (`drow_magic_faerie_fire`); `trait_light_domain_spells`, `usage: always_prepared` | resource; slot |
| Burning Hands | `trait_light_domain_spells`, `usage: always_prepared` | slot |

`trait_archfey_expanded_spells` is still a stub, so it grants nothing. No
sample character stores a pick of any of the four spells.

## Decisions (owner, 2026-09-25)

1. **Scope: one vertical slice.** Extend the spell contract, synthesize
   castable spell actions onto the sheet, add exactly the capabilities these
   four spells need, and author the four.
2. **The fourth spell is Burning Hands.** It exercises what the first three do
   not: slot payment, upcasting and save damage. Its shape is also Fireball's,
   Thunderwave's, Cone of Cold's and Lightning Bolt's.
3. **Material components: ask, then allow.** A component pouch, or a focus the
   casting source can use, covers a material component silently. Without
   either, the cast prompts the player to confirm they have the material; the
   server refuses an unconfirmed cast.
4. **Preparation: list everything and flag it.** Every spell the character has
   by grant or pick is listed and castable; a prepared caster's picks carry a
   note that preparation is not tracked. Preparation becomes its own backlog
   item.
5. **Multiple beams roll at once.** One cast rolls every beam's attack and
   damage, labelled Beam 1, Beam 2, …; the player assigns them at the table.
6. **Narrative spells tell the player.** Where the sheet cannot model the
   world (Dancing Lights), the spell's effect is only what the sheet *can*
   track — here, concentration — and the rest is a `tableNote`.
7. **Verbal and somatic components are displayed, not gated.** Conditions are
   client-only and nothing models "cannot speak".
8. **Leveled spell choices stay unasked until #31a.** Found while planning:
   `spellOptions` offers every pack spell of a node's level range, whatever
   the class, because the pack has no class spell lists. While every spell
   was a level-0 placeholder, leveled nodes offered nothing and were skipped.
   Giving Faerie Fire and Burning Hands real levels would make every leveled
   node offer exactly those two, and a new wizard could not fill a six-spell
   spellbook from them — creation would block. So a leveled node offers
   nothing until #31a gives the pack class lists, which is what every
   character gets today. The four spells need no pick: Faerie Fire and
   Burning Hands arrive by fixed grant, the other two are cantrips.
9. **Ending concentration is a standard action.** Found while planning:
   `action_end_concentration` beside `action_end_hiding`, backed by a new
   `end_concentration` effect, rides the existing `ACTION_INTENT` path. A new
   socket event would have duplicated that plumbing for the same broadcast.

## Design

### 1. The spell contract (shared)

`SpellDefinitionSchema` (`packages/shared/src/schemas/content/spells.ts`)
gains four optional fields. Casting time is `action.activation` and is not
repeated.

```ts
export const SpellRangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("feet"), feet: z.number().int().positive(), area: AreaOfEffectSchema.optional() }).strict(),
  z.object({ kind: z.literal("self"), area: AreaOfEffectSchema.optional() }).strict(),
]);

export const SpellDurationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("instantaneous") }).strict(),
  z.object({
    kind: z.literal("timed"),
    amount: z.number().int().positive(),
    unit: z.enum(["minute"]),
    concentration: z.boolean(),
  }).strict(),
]);

// on SpellDefinitionSchema
lore: LoreSchema.optional(),
range: SpellRangeSchema.optional(),
components: SpellComponentSchema.optional(),
duration: SpellDurationSchema.optional(),
```

- `touch`, `sight` and `unlimited` ranges, and `round`, `hour` and
  `until_dispelled` durations, are added with the first spell that needs them.
  The repo's rule is no schema variant before a real rule.
- The spell's area is authored **once**, on `range.area`. It is display data,
  and the synthesizer copies it onto the spell's save effect (section 3).
- `SpellComponentSchema` is reused as it stands: `verbal`, `somatic`,
  `material`, `materialDescription`, `goldCost`, `isConsumed`.

Two effect additions (`packages/shared/src/schemas/content/actions.ts`):

- **`AttackEffectSchema.repeat`** — `{ label: string, thresholds:
  ModifierScalingThreshold[] }`, laddered by **character level** (the cantrip
  rule). The synthesizer resolves it into **`repeatCount`**, a resolved
  number beside it, in the same way `criticalDamage` is resolved ahead of the
  roll.
- **`DamageSegmentSchema.perSlotAbove`** — a `DamageExpression` added once per
  slot level above the spell's level.

One resolved field on the save:

- **`ActionSaveSchema.dc`** — optional. When present the resolver uses it;
  otherwise it computes from `dcCalculation` as today, which trait actions
  such as breath weapons keep doing.

**Pack validation** (`packages/shared/src/schemas/content/validatePack.ts`):

- A spell without the `unimplemented` marker must carry `lore`, `range`,
  `components` and `duration`. A stub carries none of them. (#31a may relax
  the second half if its data pass wants to fill metadata ahead of rules.)
- `duration.concentration` is true exactly when the action — top level or
  inside a `macro` — has an `apply_effect` with `isSelfConcentration`, and
  that effect's `durationType: "rounds"` has `durationRounds` equal to the
  duration in rounds (1 minute = 10).
- `components.material` requires `materialDescription`.
- `perSlotAbove` is rejected on a cantrip.
- A spell's action must not author the fields the synthesizer stamps:
  `attackBonus`, `damageBonus`, `repeatCount`, `savingThrow.dc` and a save's
  `areaOfEffect`. A spell that hard-codes its own numbers would ignore its
  caster.

Authored spells live in a new segment, `spells/core.json`, added to the
manifest beside `spells/unimplemented.json` — the split `feats/` already uses.

### 2. Slot pools, focus categories and preparation (shared and pack)

**Slot pools declare their level.** `ChargesResourceSchema`
(`packages/shared/src/schemas/content/resources.ts`) gains:

```ts
spellSlot: z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("level"), level: z.number().int().min(1).max(9) }).strict(),
  z.object({ kind: z.literal("pact") }).strict(),
]).optional(),
```

Authored on `spell_slots_1`..`spell_slots_9` in every class that grants them,
and on `pact_slots`. A pact pool's level is `SpellcastingEngine`'s
`pactSlotLevel`. Nothing matches slot pools by id. This follows the rule
`items.ts` already states for category tags: membership is declared, never
inferred from an id.

**The class says how it casts, two fields more.** `SpellcastingSchema`
(`packages/shared/src/schemas/content/character.ts`) gains two required
fields:

- `preparation: "prepared" | "known"` — prepared for wizard, cleric, druid and
  paladin; known for bard, sorcerer, warlock, ranger, Eldritch Knight and
  Arcane Trickster. The slots spec deferred this field until something read
  it; the prepared-caster note is that reader.
- `focusCategories` — the focus tags this class's spells can use:
  - wizard, sorcerer, warlock: `category_arcane_focus`
  - cleric, paladin: `category_holy_symbol`
  - druid: `category_druidic_focus`
  - bard: `category_musical_instrument`
  - ranger, Eldritch Knight, Arcane Trickster: `[]`, so pouch only

  Its element schema is `SpellcastingFocusCategorySchema`, the four focus
  members extracted from `StartingEquipmentCategoryTagSchema`.

**The component pouch gets a tag.** `category_component_pouch` joins
`StartingEquipmentCategoryTagSchema` and `item_gear_component_pouch`. The
schema's docstring gains a sentence: these tags are also read by the cast
path's material check.

### 3. The spell synthesizer (engine)

A new `packages/engine/src/pipeline/spellSynthesizer.ts`, beside
`weaponSynthesizer.ts`, produces the character's castable spells. It replaces
`SpellbookEngine`, which is deleted along with `types/spells.ts`, the
`RuntimeSpellSource` type only it used.

**Sources:**

1. **Fixed grants on the character's traits** (`spells.fixed`), once
   `unlockLevel` is reached on `unlockScaling`.
   - Ability: the grant's `castingStat`, else the granting class's
     `spellcasting.ability`.
   - Payment from `usage`: `at_will` → none; `resource` → that pool, set as
     the action's `consumesResource`, cast at the spell's own level;
     `always_prepared` → a slot.
   - Focus categories: the granting class's; a racial or feat grant has none.
2. **Stored spell picks** — `choices.classSelections[classId][nodeId]` for
   class nodes and `choices.traitSelections[nodeId]` for trait nodes (the
   High Elf cantrip).
   - Ability: the node's `castingStat`, else the owning class's.
   - Payment: a cantrip → none; a leveled spell → a slot.
   - `preparationTracked: false` when the owning class has
     `preparation: "prepared"`.

One castable entry is produced per spell **per source**. A drow Light cleric
has Faerie Fire twice: "Drow Magic" (once per day) and "Cleric" (slot). Each
entry's action id is `${spell.action.id}@${sourceKey}` — for example
`action_spell_faerie_fire@drow_magic` and
`action_spell_faerie_fire@class_cleric`.

**Resolved when the sheet is built** (the weapon precedent):

- `attackBonus` on an `attack`: the source's spell attack bonus — the class's
  `DerivedSpellcasting.attackBonus`, which includes `SPELLCASTING_MOD`
  bonuses, or the same formula with `castingStat` for a racial grant.
- `savingThrow.dc` on a `save`: the source's save DC, the same way.
- `areaOfEffect` on a `save`: copied from `range.area`.
- `repeatCount`: `repeat.thresholds` at the character's total level.
- `baseDice` on every damage segment with `levelScaling`: the dice for the
  current level, at total level or `scalingClassId`'s level per
  `scalingMode`. The same helper is applied to **trait actions** in
  `buildLiveSheet`, so the Dragonborn breath weapons scale once `save` rolls
  their damage.

Only the slot level is left for cast time.

**Output**, on the live sheet:

```ts
interface CastableSpell {
  spellId: string;
  name: string;
  level: number;
  school: SpellSchool;
  lore?: Lore;
  range?: SpellRange;
  components?: SpellComponents;
  duration?: SpellDuration;
  activation: ActionActivation;
  source: { kind: "class"; classId: string; label: string }
        | { kind: "trait"; traitId: string; label: string };
  ability: Ability;
  attackBonus: number;
  saveDc: number;
  payment: { kind: "at_will" } | { kind: "slot" } | { kind: "resource"; resourceId: string };
  preparationTracked: boolean;
  focusCategories: SpellcastingFocusCategory[];
  /** Absent for a stub: listed, never castable. */
  actionId?: string;
}
```

- `liveSheet.spells: CastableSpell[]` — every spell, stubs included.
- `liveSheet.actions` gains each implemented spell's resolved action under its
  per-source id, so the server's existing action lookup finds it unchanged.
- `liveSheet.slotPools: { resourceId: string; level: number }[]` — every slot
  pool the character holds and its level, read by the web's slot picker and
  the server's payment check alike.

### 4. Resolver changes (engine)

In `ActionResolver` (`packages/engine/src/pipeline/actionResolver.ts`):

1. **`attack` with `repeatCount`** rolls that many attack-and-damage pairs,
   each with its own critical check, labelled `${repeat.label} ${n}`. Without
   it, one pair as today.
2. **`save` reports rather than rolls.** It stops rolling the caster's save.
   It adds a `targetSaves` entry to the result —
   `{ ability, dc, onSuccess: "half_damage" | "no_damage" | "negates_effect",
   area?, label }` — and, if the effect has damage, rolls it once. It lives on
   `ActionResult` rather than as an `ActionRollResult` because nothing was
   rolled, the same reasoning `notes` gives.
3. **`macro`** returns its nested effects' `rollResults`, `targetSaves` and
   `notes`, concatenated in order, instead of discarding them.
4. **`spellCast: { spellLevel, castLevel }`** joins the execution context.
   Each segment with `perSlotAbove` adds that expression
   `castLevel − spellLevel` times. Absent, nothing is added.
5. **`EffectManager.dropConcentration`** also removes the actors tied to each
   dropped effect, as `removeEffect` already does.
6. **A new `end_concentration` effect** calls `dropConcentration()`. It backs
   one new standard action, `action_end_concentration` ("End
   Concentration", `activation: "special"`), beside the existing
   `action_end_hiding`. That is the precedent: a free standard action whose
   effect ends another effect, which `ActiveEffectsWidget` already finds and
   offers as that effect's ender.

**`settleSpellCast`** (`packages/engine/src/pipeline/spellCast.ts`) holds the
cast checks of section 5 as a pure function, so they are unit-testable
without a socket. Its refusals are a `SpellCastRefusal`: `slot_required`,
`slot_too_low`, `slot_empty` and `materials_required`. Payment by slot needs no
change to `settleCosts`: `settleSpellCast` returns the spell's action with
`consumesResource` set to the chosen pool, so the existing all-or-nothing
spend, and its refunds, pay for it.

### 5. The cast intent (server)

`ACTION_INTENT` (`packages/shared/src/schemas/transport/socket.ts`) gains an
optional `cast: { slotResourceId?: string; materialsConfirmed?: boolean }`.
`ActionResolvedPayload` gains `targetSaves`.

For an action id that belongs to a castable spell, the socket gateway
(`apps/server/src/gateway/socket.ts`) checks everything before anything is
spent. A failure returns `executed: false` with its reason:

1. **Payment.**
   - At will: nothing.
   - Resource: the existing `consumesResource` path, which already refuses an
     empty pool.
   - Slot: `cast.slotResourceId` is required (`slot_required`). It must be in
     `liveSheet.slotPools` at or above the spell's level (`slot_too_low`),
     with a charge left (`slot_empty`). Its level becomes `castLevel`. Any
     qualifying pool is accepted, pact slots included, which is PHB p.164's
     multiclass rule. The slot is spent in the same resource write-back every
     other cost uses.
2. **Materials**, when `components.material` is true. The check passes if the
   character's inventory holds an item tagged `category_component_pouch`, or
   one tagged with one of the source's `focusCategories`. Otherwise it passes
   only with `cast.materialsConfirmed`; else `materials_required`. "Holds"
   means anywhere in the inventory: no item can be held in a hand yet.
3. **Execution** through `ActionResolver.execute` with `spellCast`, then the
   existing persistence and `ACTION_RESOLVED` broadcast.

Ending concentration needs no server change. `action_end_concentration` is a
standard action, so it is already in `liveSheet.actions`, resolves through
`ACTION_INTENT` like Dodge, and `ACTION_RESOLVED` carries the effects without
the dropped one.

### 6. The sheet (web)

**`SpellsWidget`**, a new dashboard widget beside `SpellcastingWidget` (which
keeps DC, attack bonus and slots):

- Sections: Cantrips, 1st, 2nd, …
- Each row: name; source label; payment chip ("At will", "1/day · 1 left",
  "Slot"); casting time; range, with the area ("Self (15-foot cone)"); V/S/M;
  a concentration badge and the duration.
- Expanded: `lore.fullText`; the material description; "Covered by:
  Component pouch" or "No pouch or usable focus".
- Prepared casters: a note above their picks — "Preparation isn't tracked;
  cast only what you prepared today."
- Stubs: listed with a "Not yet automated" badge and no Cast button; expanded,
  "This spell's rules haven't been authored — resolve it at the table."

**Casting:**

- A slot-paid spell opens an inline picker of `slotPools` at or above the
  spell's level that have charges, with counts. Each choice previews its
  upcast damage (Burning Hands at 2nd: 4d6).
- An uncovered material opens a confirmation quoting `materialDescription`.
  Confirming sends `materialsConfirmed: true`; cancelling sends nothing.
- A concentration spell, while another concentration effect is active, reads
  "Casting this ends Faerie Fire".
- A refusal renders inline under the row, one message per reason ("No
  1st-level slots left"). `economyOverdrawn` renders as "Your action was
  already used this turn".

**Results** stay in `CombatWidget`'s "Latest rolls", the one results
surface:

- Each `targetSaves` entry renders as a line — "Targets: DEX save DC 13 · half
  damage on a success · 15-foot cone".
- Repeated attacks render with their labels (Beam 1, Beam 2).
- Notes keep rendering under "Rules the engine could not run".

**Concentration:** `ActiveEffectsWidget` marks the concentration effect
"Concentrating", and offers `action_end_concentration` as its ender — the
**End Concentration** button — the same way it offers Stop Hiding for the
hidden effect.

### 7. The four spells (pack)

Each moves from `spells/unimplemented.json` to `spells/core.json` with its
real level and school and no marker. `lore.fullText` is SRD 5.1 wording
(CC-BY-4.0); `shortDescription` and `tableNote` are paraphrase.

**Eldritch Blast** — cantrip, evocation.

```json
"range": { "kind": "feet", "feet": 120 },
"components": { "verbal": true, "somatic": true, "material": false },
"duration": { "kind": "instantaneous" },
"action": {
  "id": "action_spell_eldritch_blast",
  "name": "Eldritch Blast",
  "activation": "action",
  "effect": {
    "type": "attack",
    "attackType": "ranged_spell",
    "attackStat": "SPELLCASTING_MOD",
    "range": 120,
    "repeat": {
      "label": "Beam",
      "thresholds": [
        { "minimumLevel": 1, "value": 1 },
        { "minimumLevel": 5, "value": 2 },
        { "minimumLevel": 11, "value": 3 },
        { "minimumLevel": 17, "value": 4 }
      ]
    },
    "damage": [
      { "sourceName": "Eldritch Blast", "baseDice": "1d10", "damageType": "force" }
    ]
  }
}
```

**Dancing Lights** — cantrip, evocation.

```json
"range": { "kind": "feet", "feet": 120 },
"components": {
  "verbal": true, "somatic": true, "material": true,
  "materialDescription": "a bit of phosphorus or wychwood, or a glowworm"
},
"duration": { "kind": "timed", "amount": 1, "unit": "minute", "concentration": true },
"action": {
  "id": "action_spell_dancing_lights",
  "name": "Dancing Lights",
  "activation": "action",
  "tableNote": "Up to four torch-sized lights (torches, lanterns or glowing orbs), or one glowing Medium humanoid form; each sheds dim light in a 10-foot radius. As a bonus action you can move them up to 60 feet. Each light must stay within 20 feet of another, and winks out beyond the spell's range.",
  "effect": {
    "type": "apply_effect",
    "effectName": "Dancing Lights",
    "durationType": "rounds",
    "durationRounds": 10,
    "isSelfConcentration": true
  }
}
```

**Faerie Fire** — 1st level, evocation.

```json
"range": { "kind": "feet", "feet": 60, "area": { "shape": "cube", "size": 20 } },
"components": { "verbal": true, "somatic": false, "material": false },
"duration": { "kind": "timed", "amount": 1, "unit": "minute", "concentration": true },
"action": {
  "id": "action_spell_faerie_fire",
  "name": "Faerie Fire",
  "activation": "action",
  "tableNote": "Objects in the area, and creatures that fail, are outlined in light and shed dim light in a 10-foot radius. Attack rolls against an outlined target have advantage if the attacker can see it, and it can't benefit from being invisible.",
  "effect": {
    "type": "macro",
    "effects": [
      {
        "type": "save",
        "savingThrow": {
          "targetStat": "DEX",
          "dcCalculation": { "base": 8, "scalingStat": "SPELLCASTING_MOD", "includeProficiency": true },
          "saveEffect": "negates_effect"
        }
      },
      {
        "type": "apply_effect",
        "effectName": "Faerie Fire",
        "durationType": "rounds",
        "durationRounds": 10,
        "isSelfConcentration": true
      }
    ]
  }
}
```

**Burning Hands** — 1st level, evocation.

```json
"range": { "kind": "self", "area": { "shape": "cone", "size": 15 } },
"components": { "verbal": true, "somatic": true, "material": false },
"duration": { "kind": "instantaneous" },
"action": {
  "id": "action_spell_burning_hands",
  "name": "Burning Hands",
  "activation": "action",
  "tableNote": "The fire ignites flammable objects in the area that aren't being worn or carried.",
  "effect": {
    "type": "save",
    "savingThrow": {
      "targetStat": "DEX",
      "dcCalculation": { "base": 8, "scalingStat": "SPELLCASTING_MOD", "includeProficiency": true },
      "saveEffect": "half_damage"
    },
    "damage": [
      { "sourceName": "Burning Hands", "baseDice": "3d6", "damageType": "fire", "perSlotAbove": "1d6" }
    ]
  }
}
```

Two rules consequences, both correct per the PHB:

- A drow casting Dancing Lights through Drow Magic cannot use a class focus.
  Only a component pouch covers it; otherwise the material prompt appears.
- Faerie Fire through Drow Magic is always cast at 1st level and spends
  `drow_magic_faerie_fire`, never a slot.

## Consequences for existing content

- **Breath weapons** (ten, `races/dragonborn.json`) stop rolling the
  character's own DEX or CON save. They report the DC to the targets, and roll
  their damage at the dice for the character's level (2d6, 3d6 at 6, 4d6 at
  11, 5d6 at 16).
- **Intimidating Presence** (`classes/barbarian.json`) stops rolling the
  barbarian's own WIS save and reports the DC.
- **Stored placeholder picks.** No sample character stores one of the four
  spells. A dev character that stored Faerie Fire or Burning Hands as a
  "cantrip" becomes off-roster, as #31a warned; the synthesizer still lists
  it, as a 1st-level spell paid with a slot.
- **`implementationMarkers.test.ts`** pins 107 of 111 spells as stubs, and
  scopes its placeholder pin (level 0, evocation) to stubs only.
- **`spellOptions`** (`packages/engine/src/pipeline/spellChoices.ts`) returns
  nothing for a leveled node (decision 8), so no wizard, bard, sorcerer or
  warlock is asked a question they cannot answer. Cantrip nodes are
  unchanged: Eldritch Blast and Dancing Lights stay cantrips.
- **A critical beam** doubles its dice. A spell attack has no weapon
  analysis to resolve `criticalDamage` for it, so the synthesizer stamps the
  doubled pool (Eldritch Blast: 2d10), with `perSlotAbove` doubled too.

## Testing

**shared**

- Schema acceptance and rejection for `range`, `duration`, `repeat`,
  `perSlotAbove`, `ActionSaveSchema.dc`, `spellSlot`, `preparation` and
  `focusCategories`.
- `validatePack`: an authored spell missing metadata is rejected; a stub
  carrying metadata is rejected; a concentration duration with no
  concentration effect, and the reverse, is rejected; a round count that
  disagrees with the duration is rejected; `material` without a description is
  rejected; `perSlotAbove` on a cantrip is rejected; each stamped field
  authored on a spell action is rejected.

**engine**

- Synthesizer: a fixed grant reaches the list at its unlock level and not
  before; `castingStat` beats the class ability; each `usage` maps to its
  payment; a pick's ability comes from its node or class; the same spell from
  two sources yields two entries with distinct ids; a stub is listed but adds
  no action; a prepared caster's pick has `preparationTracked: false`; attack
  bonus and DC match `SpellcastingEngine`, including a `SPELLCASTING_MOD`
  bonus; `repeatCount` at levels 4, 5, 11 and 17; `slotPools` includes the
  pact pool at its level.
- Resolver: Eldritch Blast at level 5 returns two labelled attack-and-damage
  pairs; `save` returns a `targetSaves` entry and no `SAVING_THROW` roll;
  Burning Hands at `castLevel` 1 rolls 3d6 and at 3 rolls 5d6; a macro
  returns its nested save and effect; Faerie Fire's concentration replaces
  Dancing Lights'; `dropConcentration` removes a tied actor.
- Regressions: a Dragonborn at level 11 rolls 4d6 breath damage and no save;
  Intimidating Presence rolls nothing.
- Pipeline: a live warlock sheet lists Eldritch Blast with its resolved
  action; a live drow sheet lists Dancing Lights, and Faerie Fire only from
  level 3.

**server**

- A slot cast without `slotResourceId`, with a pool below the spell's level,
  and with an empty pool, each refused with its reason and nothing spent.
- A 2nd-level slot spends that pool and rolls the upcast dice.
- A multiclass warlock/cleric can pay Burning Hands with a pact slot.
- Dancing Lights with no pouch and no confirmation is refused
  (`materials_required`); with confirmation it resolves; with a pouch it
  resolves unconfirmed. A drow wizard's arcane focus does not cover it.
- Faerie Fire through Drow Magic spends `drow_magic_faerie_fire`, and is
  refused when the pool is empty.
- `action_end_concentration` drops the effect, and `ACTION_RESOLVED` carries
  the effects without it.

**web**

- `SpellsWidget`: grouping by level, source labels, payment chips, the stub
  badge and missing Cast button, the prepared-caster note.
- The slot picker lists only qualifying pools with charges, and previews
  upcast dice.
- The material prompt appears only when uncovered, and confirming sends the
  flag.
- Refusal and overdraft messages render.
- `CombatWidget` renders a `targetSaves` line and beam labels.
- `ActiveEffectsWidget` shows "Concentrating" and End concentration emits the
  event.

Full `pnpm test` and `tsc -b` both green; the pack imports.

### Hand check

In the browser pane, against the dev database:

- **Isolde Varn** (warlock, Archfey), staged with Eldritch Blast as a warlock
  cantrip pick: one beam at level 4; two after levelling to 5, each with its
  own attack and damage roll, at her CHA attack bonus.
- **Seraphine Dusk** (drow wizard 9): Dancing Lights prompts for its material
  unless she carries a pouch, and shows "Concentrating"; Faerie Fire ends it,
  reports "Targets: DEX save DC 12" (CHA 10, proficiency +4) and spends Drow
  Magic's use; a second cast is refused; End concentration clears it.
- **A Light Domain cleric at level 3**, staged for the check: Burning Hands
  with a 1st-level slot rolls 3d6 and with a 2nd-level slot 4d6, reporting
  the WIS DC; an empty pool is refused on the sheet.

The plan decides whether the cleric is created through the wizard or added to
the scenario fixture.

## Docs

- **`docs/architecture/spell-authoring-guide.md`**, new — the playbook for the
  other 107 spells:
  - the record shape, and which effect fits which spell: attack cantrip,
    save damage, concentration buff, or narrative as `tableNote`;
  - what the synthesizer resolves at build time, and what is left to cast
    time;
  - the validation rules;
  - the text policy: SRD 5.1 wording with attribution where a spell is in the
    SRD, paraphrase otherwise;
  - when a spell needs a capability the engine lacks, it stays a stub and the
    capability is recorded in the backlog.
- **`README.md`** gains the CC-BY-4.0 attribution for SRD 5.1 text.
- **`docs/decisions/ARCHITECTURE_DECISIONS.md`**: spells become actions per
  source through the synthesizer, which stamps the caster's numbers before the
  roll.
- **`docs/TODO_BACKLOG.md`**: #83's core closes (preparation stays open as a
  new item); #31 goes to 107 of 111; the new items below are recorded.

## Known limitations

- **Preparation** is not tracked; a prepared caster's picks are all castable,
  with a note.
- **No concentration save** on taking damage: nothing emits a damage-taken
  event.
- **Verbal and somatic components** are not gated.
- **Costly or consumed materials** are not enforced — none of the four has
  one, and a pouch cannot cover them.
- **The bonus-action spell rule** (only a cantrip with your action after a
  bonus-action spell) is not enforced.
- **Rituals** cannot be cast as rituals.
- **Effects are not persisted.** A server restart, or 45 idle minutes, loses
  an active concentration effect, as it does every effect today.
- **Invocations that modify Eldritch Blast** (Agonizing Blast, Repelling
  Blast, Eldritch Spear) remain unauthored. Agonizing Blast will attach to
  its damage segment.
- **A focus need only be carried**, not held.

## Out of scope

- The other 107 spells, and #31a's level, school and class-list data for
  them.
- Everything under Known limitations.
- Targets and other creatures: the sheet still models one character.
