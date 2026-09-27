# The first ten spell stubs — rituals, costly materials, and cast-at-level

**Date:** 2026-09-27
**Branch:** `feat/spells-first-ten`
**Backlog items:** #31 (spells marked `unimplemented`: 10 more of 111 authored
here, leaving 97), #117 (costly materials: the "a pouch covers it" half closes
here), #119 (rituals: closes here).

## Goal

Author the first ten stubs in `spells/unimplemented.json` — Darkness, Minor
Illusion, Thaumaturgy, Hellish Rebuke, Command, Identify, Augury, Suggestion,
Nondetection and Speak with Dead — and add the four capabilities they need
that the pack contract and the engine do not have yet: `touch` range, `round`
and `hour` durations, a fixed grant that casts at a set level, costly material
components, and ritual casting.

The owner supplied the spell definitions in
`docs/development/spells-definitions.md` (untracked; it has OCR typos).

## Where this starts

The spell-casting slice (`feat/spell-casting`, merged at 043b8a1) made four
spells castable and wrote the pattern down in
`docs/architecture/spell-authoring-guide.md`. Most of these ten fit it. What
does not:

- **`SpellRangeSchema`** has `feet` and `self` only. Identify and Nondetection
  are touch spells.
- **`SpellDurationSchema.unit`** is `"minute"` only. Command lasts 1 round;
  Suggestion and Nondetection last 8 hours.
- **`FixedSpellGrantSchema`** cannot say "cast at a set level". Infernal
  Legacy casts Hellish Rebuke "as a 2nd-level spell" (3d10, not 2d10). A
  resource-paid spell today always casts at its own level: `settleSpellCast`
  sets `spellCast` only for a slot.
- **`materialCoverage`** (`packages/engine/src/pipeline/spellCast.ts`) lets a
  component pouch or usable focus cover every material, including one with a
  gold cost. The rules say a pouch or focus cannot stand in for a component
  with a cost (#117). Identify (100 gp), Augury (25 gp) and Nondetection
  (25 gp, consumed) all have one.
- **`isRitual`** is authored and nothing reads it (#119). Identify and Augury
  are rituals; a Knowledge cleric has both always prepared and could cast
  them without a slot.

Where each spell comes from in the pack:

| Spell | Granted by |
| --- | --- |
| Command, Identify | `trait_knowledge_domain_spells` (cleric 1), `always_prepared` |
| Augury, Suggestion | the same trait, cleric 3 |
| Nondetection, Speak with Dead | the same trait, cleric 5 |
| Thaumaturgy | `infernal_legacy` (tiefling), `at_will`, CHA |
| Hellish Rebuke | `infernal_legacy` at level 3, `resource` `infernal_legacy_hellish_rebuke` (long rest), CHA |
| Darkness | `infernal_legacy` at level 5 (long rest); `drow_magic` at 5 (dawn); Land (Swamp) circle spells, `always_prepared` |
| Minor Illusion | `natural_illusionist` (forest gnome), INT; warlock and other class cantrip picks |

## Decisions (owner, 2026-09-27)

1. **Costly materials: always ask.** A component with a gold cost is never
   covered by a pouch or focus. The sheet asks on every cast, naming the cost
   and whether the spell consumes it; the server refuses an unconfirmed cast.
   Owning the item and spending it are not tracked (#117 stays open for that).
2. **Rituals: add ritual casting.** A class's spellcasting block declares
   whether it can cast rituals. A ritual spell cast through such a class can be
   cast as a ritual: no slot, and 10 minutes longer. Closes #119.
3. **Slicing: one branch, capabilities first.** One spec and one plan. The new
   vocabulary lands first, then the ten spells as data, then the fixture and
   docs.
4. **Cast-at-level** (proposed in the design, approved with it): a fixed grant
   may name the level its spell is cast at, and the synthesizer stamps the
   dice at that level when the sheet is built.

## Design

### 1. The pack contract (shared)

**`SpellRangeSchema`** (`packages/shared/src/schemas/content/spells.ts`) gains
a third variant:

```ts
z.object({ kind: z.literal("touch") }).strict(),
```

**`SpellDurationSchema`**'s `unit` becomes `z.enum(["round", "minute", "hour"])`,
and:

```ts
export const ROUNDS_PER_DURATION_UNIT = { round: 1, minute: 10, hour: 600 } as const;
```

`concentration_mismatch` already compares `durationRounds` against
`amount × ROUNDS_PER_DURATION_UNIT[unit]`, so Suggestion's concentration
effect must be 4800 rounds.

**`FixedSpellGrantSchema`** gains:

```ts
/**
 * The level the spell is cast at, when a grant fixes one above the spell's
 * own: Infernal Legacy's Hellish Rebuke is cast "as a 2nd-level spell". Only
 * on a grant that is not slot-paid; a slot picks its own level.
 */
castAtLevel: z.number().int().min(1).max(9).optional(),
```

**`SpellcastingSchema`** (`packages/shared/src/schemas/content/character.ts`)
gains a required field:

```ts
/**
 * Whether this class can cast its ritual spells as rituals: no slot, and ten
 * minutes longer. The bard, cleric, druid and wizard can.
 */
ritualCasting: z.boolean(),
```

| Spellcasting block | `ritualCasting` |
| --- | --- |
| `class_bard`, `class_cleric`, `class_druid`, `class_wizard` | `true` |
| `class_paladin`, `class_ranger`, `class_sorcerer`, `class_warlock` | `false` |
| `subclass_fighter_eldritch_knight`, `subclass_rogue_arcane_trickster` | `false` |

The warlock's Book of Ancient Secrets is an invocation and stays out of scope.

**Pack validation** (`validatePack.ts`) gains the issue code
`invalid_cast_level`, raised on a fixed grant whose `castAtLevel` is below its
spell's `level`, or that sits on an `always_prepared` grant. It joins the
alphabetised issue-code union.

**Patch script** (`packages/database/scripts/patchPackSegment.ts`) gains one
operation, `setFixedSpellGrantFields: Record<traitId, Record<spellId,
fields>>`, a shallow set on a trait's fixed spell grant. An unmatched trait or
grant is an error, as it is for `setTraitResourceFields`. Class and subclass
spellcasting blocks are set with the existing `setClassFields` and
`setSubclassFields`, passing the whole `spellcasting` object.

`races/tiefling.json` is one of the four race files that do not survive a
no-op round-trip through the script: its compact `maxRule` objects expand. The
owner accepted the same expansion for `elf.json`; the commit body says so.

### 2. The spell synthesizer (engine)

`packages/engine/src/pipeline/spellSynthesizer.ts`.

**`CastableSpell`** gains:

```ts
/** Set when a grant fixes the cast level above the spell's own. */
castLevel?: number;
/** Whether this source can cast it as a ritual. */
ritual: boolean;
```

**Cast-at-level.** For a fixed grant with `castAtLevel`, the resolved action's
damage segments are stamped at that level with the existing `upcastDice`
(`actionScaling.ts`), and their `perSlotAbove` is dropped so the dice cannot
be upcast twice. Hellish Rebuke through Infernal Legacy therefore carries
`baseDice: "3d10"`. `castLevel` is copied onto the entry for the sheet.

**Ritual flag.** `ritual` is true when `spell.isRitual` and the entry's source
is a class (`source.kind === "class"`) whose spellcasting block — the class's
own or its casting subclass's, as `castingOf` already resolves — has
`ritualCasting: true`. It is false for every trait source. A Knowledge
cleric's always-prepared Identify and Augury are class-sourced, so both are
ritual-castable.

### 3. Casting (engine)

`packages/engine/src/pipeline/spellCast.ts`.

**`materialCoverage`** returns `{ covered: false }` for a spell whose
`components.goldCost > 0`, before looking at the inventory. The sheet and the
server both call it, so the prompt and the refusal cannot disagree.

**`SpellCastRequest`** gains `asRitual?: boolean`, and `SpellCastRefusal` gains
`"ritual_not_allowed"`.

**`settleSpellCast`**, in order:

1. `asRitual === true` and `!spell.ritual` → refuse `ritual_not_allowed`, with
   `offendingId: spell.spellId`.
2. `asRitual === true` and `spell.ritual` → no slot checks, no
   `consumesResource`, no `spellCast` (a ritual casts at the spell's own
   level). If `costsCombatEconomy(action.activation)`, the action is returned
   with `activation: "minute"`, so a ritual spends no action, bonus action or
   reaction: it takes ten minutes more than its casting time.
3. Otherwise the existing slot checks.
4. The material check, unchanged in form — a ritual still needs its materials.

### 4. Resolver (engine)

No change is designed. Command is the first standalone `save` with no
`damage`; Faerie Fire's damage-free save runs inside a `macro`. A resolver
test pins that a standalone damage-free save reports its `targetSaves` line
and rolls nothing. If it does not, the fix is part of that task.

### 5. The cast intent (shared transport, server)

`ActionIntentPayload.cast` (`packages/shared/src/schemas/transport/socket.ts`)
becomes `{ slotResourceId?: string; materialsConfirmed?: boolean; asRitual?: boolean }`.
The gateway (`apps/server/src/gateway/socket.ts`) already passes
`payload.cast` to `settleSpellCast` and turns a refusal into
`{ executed: false, reason }`; it needs no new logic.

### 6. The sheet (web)

**Store** — `castSpell(actionId, { slotResourceId?, materialsConfirmed?, asRitual? })`
forwards `asRitual` on the intent.

**`SpellsWidget`** (`apps/web/src/components/sheet/SpellsWidget.tsx`):

- A **Ritual** badge beside Concentration when `spell.ritual`.
- The price reads `Slot or ritual` for a ritual-castable slot spell, and gains
  ` · cast at 2nd level` when `castLevel` is set (`1 left · cast at 2nd level`).
- The slot picker opens first with a button **`As a ritual (+10 minutes, no slot)`**
  when `spell.ritual`, then the slot buttons. The ritual button shows even
  when no slot is left, and the "No slots left that can cast this." line
  shows only when there is no ritual button either. It goes through the same
  material check as a slot.
- A costly component's prompt reads:
  `Needs {materialDescription}. A pouch or focus can't stand in for a component with a cost.`
  followed by ` The spell consumes it.` when `isConsumed`, then ` Do you have it?`.
- The Details material line for a costly component reads
  `Material: {materialDescription}. Costs {goldCost} gp{, consumed}; a pouch or focus can't replace it.`
  instead of the covered/uncovered sentence.
- `rangeText` returns `Touch` for a touch spell, and prints a sphere or
  cylinder's size as a radius: `60 feet (15-foot-radius sphere)`.
- `REFUSALS` gains
  `ritual_not_allowed: "This spell can't be cast as a ritual through this source."`
- `durationText` needs no change: `1 round` and `8 hours` already fall out.

After a cast, an action's `tableNote` appears in the combat log, as Dancing
Lights' does. That is where a narrative spell tells the player what it did.

## The ten spells (pack)

Each moves from `spells/unimplemented.json` to `spells/core.json` through
`upsertSpells` and `deleteSpellIds`, and its id joins the authored list in
`implementationMarkers.test.ts`. Action ids stay `action_spell_<name>`.

`fullText` is the SRD 5.1 wording, which also corrects the owner's document
("De", "OM", "V,5"). **Hellish Rebuke is not in the SRD** and gets a
paraphrase. `shortDescription` (280 characters at most) and every `tableNote`
are original wording.

Every save below authors `dcCalculation: { base: 8, scalingStat:
"SPELLCASTING_MOD", includeProficiency: true }`, and nothing hardcodes a
caster value (`spell_hardcodes_caster_value`).

| Spell | Level, school | Activation | Range | Components | Duration |
| --- | --- | --- | --- | --- | --- |
| Darkness | 2, evocation | `action` | feet 60, area sphere 15 | V, M "bat fur and a drop of pitch or piece of coal" | timed 10 minute, concentration |
| Minor Illusion | 0, illusion | `action` | feet 30 | S, M "a bit of fleece" | timed 1 minute |
| Thaumaturgy | 0, transmutation | `action` | feet 30 | V | timed 1 minute |
| Hellish Rebuke | 1, evocation | `reaction` | feet 60 | V, S | instantaneous |
| Command | 1, enchantment | `action` | feet 60 | V | timed 1 round |
| Identify | 1, divination, ritual | `minute` | touch | V, S, M "a pearl worth at least 100 gp and an owl feather", `goldCost: 100` | instantaneous |
| Augury | 2, divination, ritual | `minute` | self | V, S, M "specially marked sticks, bones, or similar tokens worth at least 25 gp", `goldCost: 25` | instantaneous |
| Suggestion | 2, enchantment | `action` | feet 30 | V, M "a snake's tongue and either a bit of honeycomb or a drop of sweet oil" | timed 8 hour, concentration |
| Nondetection | 3, abjuration | `action` | touch | V, S, M "a pinch of diamond dust worth 25 gp sprinkled over the target, which the spell consumes", `goldCost: 25`, `isConsumed: true` | timed 8 hour |
| Speak with Dead | 3, necromancy | `action` | feet 10 | V, S, M "burning incense" | timed 10 minute |

Effects:

| Spell | Effect |
| --- | --- |
| Darkness | `apply_effect` `effectName: "Darkness"`, `durationType: "rounds"`, `durationRounds: 100`, `isSelfConcentration: true` |
| Minor Illusion, Thaumaturgy, Identify, Augury, Nondetection, Speak with Dead | `no_effect` |
| Hellish Rebuke | `save`, `targetStat: "DEX"`, `saveEffect: "half_damage"`, damage `2d10` fire, `perSlotAbove: "1d10"`, `sourceName: "Hellish Rebuke"` |
| Command | `save`, `targetStat: "WIS"`, `saveEffect: "negates_effect"`, no damage |
| Suggestion | `macro` of a `save` (`WIS`, `negates_effect`) and an `apply_effect` `effectName: "Suggestion"`, `durationRounds: 4800`, `isSelfConcentration: true` |

Table notes:

- **Darkness** — Magical darkness fills a 15-foot-radius sphere and spreads
  around corners. Darkvision can't see through it and nonmagical light can't
  light it. Centred on an object you hold or one nobody is wearing or
  carrying, it moves with the object, and covering the object with something
  opaque blocks it. Where it overlaps light from a spell of 2nd level or lower,
  that spell is dispelled.
- **Minor Illusion** — Either a sound (a whisper to a scream, constant or in
  bursts) or an image of an object no bigger than a 5-foot cube that makes no
  sound, light or smell. Anything passing through the image reveals it. A
  creature can use its action to make an Intelligence (Investigation) check
  against your spell save DC; on a success the illusion turns faint to it. It
  ends early if you dismiss it as an action or cast the spell again.
- **Thaumaturgy** — Pick one: your voice booms three times louder; flames
  flicker, brighten, dim or change colour; harmless tremors shake the ground;
  or your eyes change appearance, each for 1 minute. Or, instantly, a sound
  rings out from a point in range, or an unlocked door or window flies open or
  slams shut. Up to three 1-minute effects can be active at once; dismiss one
  as an action.
- **Hellish Rebuke** — Cast as a reaction when a creature within 60 feet that
  you can see damages you. That creature makes the save.
- **Command** — Speak a one-word command. On a failed save the target obeys on
  its next turn: Approach (it moves to you and stops within 5 feet), Drop (it
  drops what it holds and ends its turn), Flee (it moves away by the fastest
  means), Grovel (it falls prone and ends its turn) or Halt (it doesn't move or
  act). The DM rules on any other command. No effect on undead, on a creature
  that doesn't understand you, or if the command is directly harmful to it.
  Each slot level above 1st adds one more target; all must be within 30 feet
  of each other.
- **Identify** — Touch an object throughout the casting. If it is magical, the
  DM tells you its properties and how to use it, whether it needs attunement,
  how many charges it has, which spells affect it, and which spell created it.
  Touch a creature instead to learn which spells are affecting it. The pearl
  isn't consumed.
- **Augury** — Describe something you plan to do within the next 30 minutes;
  the DM answers weal, woe, weal and woe, or nothing. Later changes, such as
  new spells or a companion lost or gained, aren't foreseen. Each casting after
  the first before your next long rest adds a cumulative 25% chance of a random
  answer, which the DM rolls in secret.
- **Suggestion** — Suggest a reasonable-sounding course of action, in a
  sentence or two, to a creature that can hear and understand you; creatures
  that can't be charmed are immune. On a failed save it follows the suggestion
  for the duration, or until the task is done. An obviously harmful suggestion
  ends the spell, as does damage from you or your companions. A suggestion can
  wait on a trigger; if the trigger never comes, nothing happens.
- **Nondetection** — For 8 hours the target — a willing creature, or a place or
  object no larger than 10 feet in any dimension — can't be targeted by
  divination magic or perceived through magical scrying sensors. The diamond
  dust is consumed.
- **Speak with Dead** — A corpse that still has a mouth and isn't undead
  answers up to five questions before the spell ends. The spell fails if the
  corpse was its target in the last 10 days. The corpse knows only what it knew
  in life, answers briefly, cryptically or repetitively, and needn't tell the
  truth to someone it sees as an enemy.

**Infernal Legacy** gets `castAtLevel: 2` on its Hellish Rebuke grant, through
`setFixedSpellGrantFields`.

## Consequences for existing content

- **Minor Illusion stops being the synthesizer test's example stub.**
  `spellSynthesizer.test.ts` asserts Minor Illusion has no `actionId`; that
  assertion moves to a spell that is still a stub.
- **Existing fixture characters gain castable spells.** Isolde's and Quill's
  Minor Illusion, and Seraphine's Drow Magic Darkness, become castable. No
  stored data changes.
- **Every class spellcasting block changes** (`ritualCasting`), so every class
  JSON file and the generated schemas change.
- **`races/tiefling.json`** churns once when patched (see §1).
- **The pack must be re-imported**: `db:import-pack --yes` (which CASCADE
  deletes all characters), then `db:seed:samples`.

## Testing

Each task carries the tests for what it changes.

- **Shared** — the schema accepts `touch`, `round` and `hour`, and rejects an
  unknown unit; `castAtLevel` rejects 0 and 10; `SpellcastingSchema` requires
  `ritualCasting`. Pack validation raises `invalid_cast_level` for
  `castAtLevel` below the spell's level and for `castAtLevel` on an
  `always_prepared` grant, and accepts Infernal Legacy's.
- **Engine**
  - `synthesizeSpells`: a `castAtLevel: 2` grant of a 2d10 + 1d10/level spell
    yields `baseDice: "3d10"` with no `perSlotAbove`, and `castLevel: 2`; a
    ritual spell is `ritual: true` through a `ritualCasting` class,
    `false` through a non-ritual class and through a trait.
  - `materialCoverage`: a `goldCost` component is uncovered even with a pouch
    and a matching focus.
  - `settleSpellCast`: a ritual spends no slot and has no `spellCast`; a
    ritual through a non-ritual source is refused `ritual_not_allowed`; an
    `action`-activation ritual comes back as `minute`; a ritual still refuses
    an unconfirmed uncovered material.
  - `ActionResolver`: a standalone `save` with no damage reports its
    `targetSaves` entry and rolls no damage.
- **Database** — the ten ids join the authored list in
  `implementationMarkers.test.ts`; the assembled pack validates; the roster,
  choices, scores and hit-point tests cover the new fixture character.
- **Server** (`socket.spellCast.test.ts`) — a ritual Identify executes without
  spending a slot; a ritual cast through a trait source is refused; a costly
  material is refused unconfirmed even with a holy symbol carried, and
  executes confirmed.
- **Web** (`SpellsWidget.test.tsx`) — the ritual button shows with every slot
  spent and sends `asRitual`; the costly prompt names the cost and
  consumption; the cast-at-level price text; `Touch` and the radius wording.

### Hand check

A new scenario character, **`…0131`, a tiefling Knowledge Domain cleric 5**,
added to `sampleScenarioCharacters.ts` with a holy symbol, some slots spent,
and both Infernal Legacy charges available. The roster pins go from 21 to 22.
On them, in the browser pane:

1. Command: cast with a 1st-level slot; the log shows the WIS save DC and the
   note. Cast with a 2nd-level slot; the note names the extra target.
2. Identify: cast as a ritual with slots spent — no slot moves, and the
   costly-material prompt appears despite the holy symbol.
3. Augury as a ritual; Suggestion with a slot shows Concentrating, and casting
   Darkness (Infernal Legacy) ends it.
4. Hellish Rebuke (Infernal Legacy): `1 left · cast at 2nd level`, rolls 3d10.
5. Nondetection's prompt says the dust is consumed; Speak with Dead casts with
   no prompt (the holy symbol covers incense).
6. Thaumaturgy at will. Minor Illusion on Isolde; Darkness on Seraphine.

## Docs

- `docs/architecture/spell-authoring-guide.md` — `touch`, `round` and `hour`
  exist (update the "do not exist yet" paragraph); a Rituals subsection
  (`isRitual` plus the class's `ritualCasting`, what a ritual cast does);
  costly materials under Components (always asked, #117 still open for
  ownership and consumption); `castAtLevel` under "How a spell reaches a
  character".
- `docs/TODO_BACKLOG.md` — #119 closes and moves to Closed items with a ✅
  heading, per the file's convention; #117's text narrows to ownership and
  consumption; #31's count becomes 97 of 111.
- `docs/development/sample-characters.md` — the new character's row and
  live-check script.

## Known limitations

- A costly component is taken on the player's word: the inventory is neither
  checked nor spent (#117).
- Non-concentration durations (Minor Illusion, Nondetection, Speak with Dead)
  are not tracked; the note says how long they last.
- Command's extra targets, Minor Illusion's end on recast, Thaumaturgy's
  three-effect limit and Augury's cumulative chance are the table's to track.
- A concentration spell whose save succeeds (Suggestion, Faerie Fire) still
  starts concentration; End Concentration drops it.
- Leveled spells still reach characters only through fixed grants until #31a,
  so a warlock cannot pick Hellish Rebuke or Command yet.
- #123 applies: Suggestion's 4800-round effect survives a long rest.

## Out of scope

- The Book of Ancient Secrets and other ritual grants outside a class's
  spellcasting block.
- Inventory items for costly components (pearls, diamond dust).
- Timers for non-concentration spells.
- The other 97 stubs.
