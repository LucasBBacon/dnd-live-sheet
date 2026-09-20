# Spellcasting: Slots, DC and Attack

Date: 2026-09-20
Status: designed
Owner: Claude pair session

## Goal

Give a caster spell slots, a spell save DC and a spell attack bonus. After
this, a level 5 wizard has four first-level slots, three second and two third,
each spendable and refilled on a long rest, with a DC of 8 + proficiency + INT
beside them on the sheet. What each spell *does* is not this slice.

Branch: `feat/spellcasting-slots`, on top of `6eb6bfc`.

## Where this starts

Seven of the twelve classes cannot function. The shipped pack defines ten
resources in total:

```
dragonborn_breath_charge      drow_magic_darkness
drow_magic_faerie_fire        infernal_legacy_darkness
infernal_legacy_hellish_rebuke  resource_barbarian_rage
resource_relentless_endurance   resource_relentless_rage
trait_action_surge              trait_second_wind
```

Not one is a class resource. There is no spell slot anywhere — no table, no
pool, not one `spell_slots_*` id — and the same is true of ki, sorcery points
and pact slots. All ten spellcasting traits are stubs. Backlog item #62.

The progressions already hand a level 1 wizard three cantrips and six
spellbook picks, so the character has spells chosen and nothing to cast them
with.

## Findings that shaped the design

1. **The vocabulary is mostly already there.** `ResourceMaxRule` carries
   `fixed`, `total_level_thresholds` and `class_level_thresholds`;
   `SpellChoiceNode` carries `listSource`, `maxSpellLevel`, `pickCount` and
   `castingStat`; `SpellDefinition` carries `level`, `school`, `isRitual` and
   an action. What is missing is a declaration of *how a class casts* and a
   slot table to read.

2. **Slots need no web work.** `useFeatures` maps every operational resource
   through `resolveResourceRule` and `getResourceMaxUses` and renders whatever
   comes back. Authoring the pools is enough to put them on the sheet.

3. **Two casting classes must not double a pool.**
   `collectGrantedResources` deduplicates by id, last writer wins — it does not
   sum. So a wizard/cleric granting `spell_slots_1` twice collapses to one
   pool, which is exactly right once its maximum is computed from combined
   caster level rather than from either class alone.

4. **All ten spellcasting traits are already wired to the right levels.**
   Bard, cleric, druid, sorcerer, wizard and warlock grant theirs at class
   level 1; paladin and ranger at 2; the Eldritch Knight's and Arcane
   Trickster's hang off their subclass progressions. Nothing needs re-wiring,
   only authoring.

5. **`SPELLCASTING_MOD` is a modifier target nothing reads.** It exists in
   `ModifierTargetSchema` and appears only in the generated JSON schema. This
   slice is what finally gives it a consumer.

6. **The PHB states two different caster-level rules, and they disagree.** See
   decision 2 — this is the part most likely to be implemented wrongly.

## Decisions taken

1. **The class declares how it casts, in two fields.** `ability` and
   `progression`. No `preparation: "prepared" | "known"` yet: nothing in this
   slice reads it, and a field authored before it has a reader is the
   dead-data pattern `ruleSnapshot.ts` warns about in its own docstring. It
   arrives with spell lists.

2. **Caster level branches on how many casting classes there are.** A single
   casting class reads its own table, which for a half-caster is the
   full-caster table at `ceil(level / 2)`; a multiclass caster adds
   `floor(level / 2)` per PHB p.164. Both are correct as written and they
   disagree, so the helper has to know which case it is in.

3. **Pact magic is a separate pool.** It is excluded from the caster-level sum
   entirely, resets on a short rest, and carries a slot *level* as well as a
   slot count.

4. **The DC and attack bonus are per casting class, not per character.** A
   wizard/cleric has an INT DC and a WIS DC; collapsing them to one number
   would be wrong.

5. **One table per progression, not one per class.** The full-caster table is
   authored once and shared by five classes. Five copies of a 9-by-20 table
   would drift, which is the failure #37, #45 and the three hand-copied
   assemblers have each demonstrated.

## Architecture

### 1. `SpellcastingSchema` on the class and the subclass

New in `packages/shared/src/schemas/content/character.ts`:

```ts
export const SpellcastingSchema = z
  .object({
    ability: z.enum(["INT", "WIS", "CHA"]),
    progression: z.enum(["full", "half", "third", "pact"]),
  })
  .strict();
```

Added as `spellcasting: SpellcastingSchema.optional()` to
`ClassDefinitionSchema`, which `CoreClassSchema` extends, and separately to
`CoreSubclassSchema` in `coreRulePack.ts`, which is a standalone `.strict()`
object rather than an extension of a shared definition.

The subclass needs it because the Eldritch Knight and the Arcane Trickster are
casters while fighter and rogue are not. Optional rather than defaulted: a
barbarian has no `spellcasting` block, and that absence is the statement.

### 2. Caster level

New `packages/engine/src/rules/casterLevel.ts`:

```ts
export interface CastingSource {
  classId: string;
  level: number;
  progression: "full" | "half" | "third" | "pact";
}

export const casterLevel = (sources: CastingSource[]): number => { /* below */ };
```

Pact sources are filtered out first — they never contribute. Of what remains:

- **Exactly one source:** `full` gives its level, `half` gives
  `Math.ceil(level / 2)`, `third` gives `Math.ceil(level / 3)`.
- **More than one:** sum of `full` levels, plus `Math.floor(level / 2)` per
  half, plus `Math.floor(level / 3)` per third.

The two branches are not a rounding preference, they are two rules. Check
either against the PHB tables: a lone paladin 5 has four first-level and two
second-level slots, which is the full-caster table at level 3, and
`ceil(5 / 2) = 3`. The multiclass rule on p.164 says to add half your paladin
levels rounded down, so paladin 5 / fighter 1 is caster level 2 and gets
*fewer* slots than paladin 5 alone. Both are what the book says.

An Eldritch Knight 3 is `ceil(3 / 3) = 1`, giving two first-level slots, which
is what the subclass table prints.

### 3. `caster_level_thresholds`

A fourth member of `ResourceMaxRuleSchema`:

```ts
z.object({
  kind: z.literal("caster_level_thresholds"),
  thresholds: z.array(ResourceThresholdSchema).min(1),
}).strict()
```

It carries no `classId`, unlike `class_level_thresholds`, because caster level
is a property of the whole character.

`getResourceMaxUses(rule, totalLevel, classLevels)` gains a fourth parameter,
`casterLevel`, defaulting to `0`. Existing callers keep working and a
`caster_level_thresholds` pool resolves to zero until they pass it — which is
visible rather than wrong, since a pool with a maximum of zero is already
hidden by `useFeatures`'s own guard. The callers that matter —
`characterEngine`, `useFeatures`, the server's resource paths — pass it.

Thresholds resolve through the existing `resolveThresholdValue`, which takes
the last rung whose `minimumLevel` is at or below the level, so every table
below is authored in ascending order.

### 4. The four tables

Authored as pack resources on the traits that grant them. Each entry is
`{ minimumLevel, value }` against **caster level**, not class level.

**Slot casters — everything except pact magic.** One set of pools,
`spell_slots_1` upward, shared by all eight traits that grant them:

| Pool | Thresholds (caster level → slots) |
| --- | --- |
| `spell_slots_1` | 1→2, 2→3, 3→4 |
| `spell_slots_2` | 3→2, 4→3 |
| `spell_slots_3` | 5→2, 6→3 |
| `spell_slots_4` | 7→1, 8→2, 9→3 |
| `spell_slots_5` | 9→1, 10→2, 18→3 |
| `spell_slots_6` | 11→1, 19→2 |
| `spell_slots_7` | 13→1, 20→2 |
| `spell_slots_8` | 15→1 |
| `spell_slots_9` | 17→1 |

All reset on `long_rest`. The thresholds are identical for every progression —
what differs is how high a caster level each can reach, so each grants only the
pools it can ever fill:

| Progression | Grants | Because |
| --- | --- | --- |
| full | `spell_slots_1` … `_9` | level 20 → caster level 20 |
| half | `spell_slots_1` … `_5` | paladin 20 → `ceil(20 / 2)` = 10, and 10 is where fifth-level slots arrive |
| third | `spell_slots_1` … `_4` | Eldritch Knight 20 → `ceil(20 / 3)` = 7, which is where fourth-level slots arrive |

Granting a pool a class can never fill would be harmless — its maximum resolves
to zero and `useFeatures` hides it — but it would also be authoring a rule that
is false, and the two tables above are the PHB's own ceilings.

**Pact magic** — granted by `trait_pact_magic`, keyed on warlock class level
via `class_level_thresholds`, resetting on `short_rest`:

| Pool | Thresholds (warlock level → value) |
| --- | --- |
| `pact_slots` | 1→1, 2→2, 11→3, 17→4 |
| `pact_slot_level` | 1→1, 3→2, 5→3, 7→4, 9→5 |

`pact_slot_level` is a number the sheet reports rather than a pool anything
spends. It is authored as a resource so it travels the same path as the rest
and needs no second mechanism; it is `mode: "uses"`-adjacent in spirit, and
the Testing section covers the risk that it renders as a spendable pool.

### 5. `spellcasting.ts`

New calculator in `packages/engine/src/calculators/`:

```ts
export interface DerivedSpellcasting {
  classId: string;
  ability: Ability;
  modifier: number;
  saveDc: number;        // 8 + proficiency + modifier
  attackBonus: number;   // proficiency + modifier
  /** Warlocks only: the level every pact slot is cast at. */
  pactSlotLevel?: number;
  breakdown: string;
}

export class SpellcastingEngine {
  public static calculate(
    sources: CastingSource[],
    abilityScores: Record<Ability, number>,
    profBonus: number,
    modifiers: RuntimeModifier[],
    activeStates?: string[],
  ): DerivedSpellcasting[];
}
```

One entry per casting class. `SPELLCASTING_MOD` modifiers apply to the
modifier before the DC and attack are derived, which is what gives that target
its first reader.

### 6. The sheet

Slots need no change: `useFeatures` already renders any granted pool, so the
nine appear in the Features widget once authored and materialised. The DC and
attack bonus need one surface beside the other derived numbers — a row per
casting class, since a multiclass caster has more than one.

## Shared changes

| File | Change |
| --- | --- |
| `schemas/content/character.ts` | `SpellcastingSchema`; `spellcasting` on `ClassDefinitionSchema` |
| `schemas/content/coreRulePack.ts` | `spellcasting` on `CoreSubclassSchema` |
| `schemas/content/resources.ts` | `caster_level_thresholds` in `ResourceMaxRuleSchema` |

## Engine changes

| File | Change |
| --- | --- |
| `rules/casterLevel.ts` | new — `CastingSource`, `casterLevel` |
| `utils/resourceRules.ts` | `getResourceMaxUses` gains a `casterLevel` parameter and the new case |
| `calculators/spellcasting.ts` | new — `SpellcastingEngine` |
| `pipeline/characterEngine.ts` | collects casting sources, passes caster level, returns the spellcasting result |

## Data changes

| File | Change |
| --- | --- |
| `classes/{bard,cleric,druid,sorcerer,wizard}.json` | `spellcasting` block; the spellcasting trait authored with the nine pools |
| `classes/{paladin,ranger}.json` | same, `progression: "half"` |
| `classes/warlock.json` | `spellcasting` block `progression: "pact"`; `trait_pact_magic` authored with its two pools |
| `classes/{fighter,rogue}.json` | `spellcasting` on the Eldritch Knight and Arcane Trickster subclasses; their two traits authored |

Ten stubs stop being stubs, so #30 falls from 408 to 398. Pack JSON is edited
only through `packages/database/scripts/patchPackSegment.ts`.

## Testing

**Caster level** is where the rules are, so it gets a table-driven test over
the PHB: a lone paladin at 2, 5 and 9; a lone Eldritch Knight at 3, 4 and 7; a
full caster at 1 and 20; wizard 3 / cleric 3 summing to 6; and the case that
distinguishes the two branches — paladin 5 alone is caster level 3, paladin 5
with any second casting class is caster level 2.

**The tables** get a pack-driven test asserting slot counts for a character at
every level of each progression, read from the shipped pack rather than from
literals, so a mis-authored threshold fails rather than being re-stated in the
test. The wizard 5 row — 4/3/2 — is the one to write first.

**`spellcasting.ts`** covers the DC and attack for each ability, a
`SPELLCASTING_MOD` modifier reaching both numbers, and a wizard/cleric
returning two entries rather than one.

**The sheet** gets an assertion that a level 5 wizard shows nine pools of which
three are non-empty, and that the DC row reads 8 + proficiency + INT.

## Verification

The claim this branch makes is that a caster can cast. It is proved by opening
a level 5 wizard on the running sheet and seeing four first-level slots, three
second, two third, a DC and an attack bonus — not by the tests alone.

`pnpm --filter @project/database db:import-pack` is required before any of the
data is live, and it truncates the reference tables `CASCADE`.

## Known limitations

- **No spell lists, so nothing can be picked.** `level` and `school` are
  placeholders on all 111 spells and no list membership exists, so the
  `spell_choice` nodes the progressions already carry stay unanswerable. The
  slots are spendable; choosing what to spend them on is the next slice.
- **No preparation or known-spell limits.** A prepared caster's daily limit and
  a known caster's list length both need the spell data first.
- **No concentration, upcasting or rituals.**
- **`pact_slot_level` is a number wearing a resource's clothes.** It is
  authored as a pool because that is the path that already exists; if it reads
  badly on the sheet it wants a different home rather than a special case.
- **Ki and sorcery points stay absent.** They are class resources like slots
  and would fit the same shape, but they are not spellcasting and are not in
  this slice.

## Out of scope

- The 111 spell stubs and their `level` / `school` data — that is #31.
- Ki, sorcery points, and the rest of #62's class resources.
- Multiclass spell *preparation* rules.
