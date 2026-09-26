# Spell Casting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Eldritch Blast, Dancing Lights, Faerie Fire and Burning Hands castable from the live sheet — the caster's own attack bonus and DC, slot and resource payment with upcasting, material components, concentration — and set the authoring pattern the other 107 spells will follow.

**Architecture:** The pack describes each spell: new `lore`, `range`, `components` and `duration` fields, plus `repeat` and `perSlotAbove` on effects, all held honest by pack validation. A new engine synthesizer (`synthesizeSpells`) turns every spell a character has — fixed trait grants and stored picks — into one `CastableSpell` per source. Each castable spell's resolved action (caster's numbers, character-level scaling, area stamped in) joins `liveSheet.actions`. The server runs one pure check (`settleSpellCast`: slot, charges, materials) before the unchanged `ActionResolver.execute`. The resolver gains beam repeats, upcast dice, target-save reports, macro roll aggregation and an `end_concentration` effect. The web lists spells in a new `SpellsWidget` and casts through the existing `ACTION_INTENT`.

**Tech Stack:** TypeScript, pnpm + turbo monorepo; Zod 4 (`@project/shared`); Vitest; `@project/engine`; Express + socket.io (`apps/server`); React 19 + Zustand (`apps/web`).

**Spec:** `docs/superpowers/specs/2026-09-25-spell-casting-design.md`

## Global Constraints

- **Line endings.** Every existing file this plan touches is **CRLF**, except three that are **LF** and stay LF: `apps/web/src/components/sheet/ActiveEffectsWidget.tsx`, `apps/web/src/components/sheet/__tests__/ActiveEffectsWidget.test.tsx`, and `packages/database/data/schemas/segment.schema.json` (generated, pinned `eol=lf`). Every **new** file is CRLF. Edit and Write emit LF, so after editing restore CRLF on each CRLF file you touched:
  ```bash
  node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' <file> <file> ...
  ```
  and measure (grep gives wrong answers for CR in this Git Bash):
  ```bash
  node -e 'for(const f of process.argv.slice(1)){const b=require("fs").readFileSync(f);let cr=0,lf=0,crlf=0;for(let i=0;i<b.length;i++){if(b[i]===13){cr++;if(b[i+1]===10)crlf++;}if(b[i]===10)lf++;}console.log(f,cr===0?"LF":(cr===crlf&&crlf===lf)?"CRLF":"MIXED")}' <file> ...
  ```
  Never use `sed -i`. `pnpm check:hygiene` fails on a mixed file.
- **Pack JSON is edited only through `packages/database/scripts/patchPackSegment.ts`** (Task 2 extends it). The two exceptions are the new `spells/core.json` skeleton and `manifest.json`'s segment list, which Task 4 writes with the exact node one-liners it gives. Never hand-edit pack JSON.
- **After any change to a shared content schema** (Tasks 1–2), regenerate the pack schemas with `pnpm --filter @project/database schemas:generate`. `packSchemas.test.ts` byte-compares the output.
- **Typecheck is a separate gate**, because Vitest ignores type errors. Per package: `pnpm --filter @project/shared typecheck`, `@project/engine`, `@project/database`, `@project/server` (all `tsc --noEmit`), and `pnpm --filter @project/web typecheck` (`tsc -b`). Never run `tsc -b` in `packages/database`.
- `apps/server`, `packages/engine`, `packages/shared` and `packages/database` compile with **`exactOptionalPropertyTypes`** and **`noUncheckedIndexedAccess`**. Set an optional field with a conditional spread (`...(x !== undefined && { x })`), never `x: undefined`.
- **CI has no `DATABASE_URL`.** Run the server and database suites as `DATABASE_URL= pnpm --filter @project/server test` and `DATABASE_URL= pnpm --filter @project/database test`.
- **Web tests** use Vitest with `createRoot` + `act`. `@testing-library` is **not** installed; follow the sibling test files.
- **Dice in tests** are pinned with `vi.spyOn(Math, "random")`, one call per die, as `actionResolver.test.ts:446-448` does. Where a test only needs how many dice rolled, assert `rolls.length` instead of a total.
- Prose, comments and docs use British spelling. Identifiers stay exactly as they are.
- Commit messages end with a blank line and then the `Co-Authored-By:` trailer your own session's attribution instruction supplies. Use `git commit -F -` with a heredoc. Branch is `feat/spell-casting`. Do not push.
- Touch only the files a task lists. If a test or typecheck fails in any other file, stop and report NEEDS_CONTEXT.
- **Scope.** Build the four spells and the capabilities they need. Everything under the spec's Known limitations is recorded in Task 14, not built.

Design decisions (owner, 2026-09-25) that bind every task:

1. One vertical slice: contract, synthesizer, cast path, the four spells.
2. The fourth spell is Burning Hands.
3. Material components: a pouch or a usable focus covers them silently. Otherwise the player is asked to confirm; the server refuses an unconfirmed cast (`materials_required`).
4. Preparation is not tracked. Every granted or picked spell is listed and castable, and a prepared caster's leveled picks carry a note.
5. Beams roll at once: one cast rolls every beam's attack and damage, labelled `Beam 1`, `Beam 2`, …
6. Narrative spells track only what the sheet can (concentration); the rest is a `tableNote`.
7. Verbal and somatic components are displayed, never gated.
8. **Leveled spell choices stay unasked until #31a.** `spellOptions` returns nothing for a node whose `maxSpellLevel` is above 0 (Task 4). Otherwise every wizard, bard, sorcerer and warlock would be asked to pick leveled spells from exactly Faerie Fire and Burning Hands, and wizard creation would block.
9. **Ending concentration is a standard action** (`action_end_concentration`, with a new `end_concentration` effect), beside `action_end_hiding`. There is no new socket event.

## File Structure

| File | Change |
| --- | --- |
| `packages/shared/src/schemas/content/spells.ts` | `SpellRangeSchema`, `SpellDurationSchema`, `ROUNDS_PER_DURATION_UNIT`; `lore`/`range`/`components`/`duration` on `SpellDefinitionSchema` (T1) |
| `packages/shared/src/schemas/content/actions.ts` | `repeat`/`repeatCount` on attack, `perSlotAbove` on damage segments, `dc` on saves, `EndConcentrationEffectSchema` (T1) |
| `packages/shared/src/schemas/content/character.ts` | `preparation` and `focusCategories` on `SpellcastingSchema` (T2) |
| `packages/shared/src/schemas/content/items.ts` | `category_component_pouch`; `SpellcastingFocusCategorySchema` (T2) |
| `packages/shared/src/schemas/content/resources.ts` | `spellSlot` on `ChargesResourceSchema` (T2) |
| `packages/shared/src/schemas/content/validatePack.ts` | `validateSpells`: four new issue codes (T3) |
| `packages/shared/src/standardActions.ts` | `action_end_concentration` (T7) |
| `packages/shared/src/schemas/transport/socket.ts` | `cast` on `ActionIntentPayload`; `TargetSavePayload`; `targetSaves` on `ActionResolvedPayload` (T10) |
| `packages/database/scripts/patchPackSegment.ts` | `setTraitResourceFields`, `setEquipmentFields`, `upsertSpells`, `deleteSpellIds` (T2) |
| `packages/database/data/packs/core_2014_pack/classes/*.json` (10 files), `equipment/core.json` | spellcasting declarations, slot levels, pouch tag (T2) |
| `packages/database/data/packs/core_2014_pack/spells/core.json` (new), `spells/unimplemented.json`, `manifest.json` | the four spells (T4) |
| `packages/database/data/schemas/segment.schema.json` | regenerated (T1, T2) |
| `packages/engine/src/pipeline/spellChoices.ts` | leveled nodes offer nothing (T4) |
| `packages/engine/src/pipeline/actionScaling.ts` (new) | `resolveSegmentDice`, `resolveActionScaling`, `upcastDice` (T5) |
| `packages/engine/src/pipeline/characterEngine.ts` | trait actions scaled (T5); spells, spell actions and slot pools on the live sheet (T8) |
| `packages/engine/src/pipeline/actionResolver.ts` | repeats, upcasting, target saves (T6); macro aggregation, `end_concentration` (T7) |
| `packages/engine/src/calculators/effects.ts` | `dropConcentration` removes tied actors (T7) |
| `packages/engine/src/calculators/spellcasting.ts` | `numbersFor`; exported `pactSlotLevel` (T8) |
| `packages/engine/src/pipeline/spellSynthesizer.ts` (new) | `synthesizeSpells`, `CastableSpell`, `SlotPool` (T8) |
| `packages/engine/src/pipeline/spellCast.ts` (new) | `materialCoverage`, `settleSpellCast` (T9) |
| `packages/engine/src/calculators/spellbook.ts`, `packages/engine/src/types/spells.ts` | deleted (T8) |
| `packages/engine/src/pipeline/index.ts` | exports (T5, T8, T9) |
| `apps/server/src/gateway/socket.ts` | cast checks before execution; `targetSaves` on the payload (T10) |
| `apps/web/src/store/characterSheetStore.ts` | `castSpell`, `latestTargetSaves`, `lastActionOutcome`, exported `toCharacterSave` (T11) |
| `apps/web/src/hooks/useSpells.ts` (new) | the synthesis for the sheet (T11) |
| `apps/web/src/components/sheet/SpellsWidget.tsx` (new), `DashboardLayout.tsx` | the spell panel (T12) |
| `apps/web/src/components/sheet/CombatWidget.tsx`, `ActiveEffectsWidget.tsx` | target saves, labels, concentration (T13) |
| `packages/database/src/sampleScenarioCharacters.ts`, `seedSampleCharacters.ts` (comments) | Isolde's Eldritch Blast; Maren Solace, a Light cleric (T14) |
| Docs | `docs/development/sample-characters.md` (T14); new `docs/architecture/spell-authoring-guide.md`, `README.md`, `docs/decisions/ARCHITECTURE_DECISIONS.md`, `docs/TODO_BACKLOG.md` (T15) |

## Facts this plan relies on (measured while planning)

- **Baseline** on `397bb8c` (`feat/spell-casting`): **2461** tests — shared 233, engine 1017, database 200, server 527, web 484.
- **Requiring `preparation` and `focusCategories`** on `SpellcastingSchema` breaks exactly one fixture's typecheck: `packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts:940-944`. Every other package typechecks clean (measured by applying the change and reverting it). At runtime, two tests in `spellcastingSchema.test.ts` also move: the one asserting `preparation` is *rejected* as an unknown key, and the one echoing a three-field block.
- **No-op round trips.** Every class file, `equipment/core.json` and `spells/unimplemented.json` survive a no-op pass through `patchPackSegment.ts`'s printer byte for byte. The race files do not, and no task patches a race file.
- **Slot pools** live in trait `resources` inside the class files:
  - `spell_slots_1`–`9`: bard, cleric, druid, sorcerer, wizard
  - `spell_slots_1`–`5`: paladin, ranger
  - `spell_slots_1`–`4`: fighter (Eldritch Knight), rogue (Arcane Trickster)
  - `pact_slots`: warlock
- **Spellcasting blocks** sit on the class for bard, cleric, druid, paladin, ranger, sorcerer, warlock and wizard, and on `subclass_fighter_eldritch_knight` and `subclass_rogue_arcane_trickster`. Their current values:
  - bard CHA full 1; cleric WIS full 1; druid WIS full 1
  - paladin CHA half 2; ranger WIS half 2
  - sorcerer CHA full 1; warlock CHA pact 1; wizard INT full 1
  - Eldritch Knight INT third 3; Arcane Trickster INT third 3
- **How each spell reaches a character:**
  - Eldritch Blast: `warlock_level_1_cantrips` (pickCount 2).
  - Dancing Lights: `drow_magic` (`races/elf.json`), fixed, `castingStat: "CHA"`, `usage: at_will`.
  - Faerie Fire: `drow_magic` with `unlockLevel: 3`, total level, `usage: resource` `drow_magic_faerie_fire` (fixed max 1, `dawn`); and `trait_light_domain_spells` (`traits/ported.json`, granted at `subclass_cleric_light` level 1), `usage: always_prepared`, no `unlockLevel`.
  - Burning Hands: `trait_light_domain_spells`, `always_prepared`, no `unlockLevel`.
  - `trait_archfey_expanded_spells` is a stub and grants nothing.
- **`save` is authored on 11 pack actions:**
  - the ten Dragonborn breath weapons, e.g. `action_black_breath` on trait `subrace_dragonborn_black`: DEX save, CON DC, 2d6 with `levelScaling` 3d6@6, 4d6@11, 5d6@16, `scalingMode: "total_level"`;
  - `action_intimidating_presence` (`classes/barbarian.json`).

  The only test of the old `save` behaviour is `actionResolver.test.ts:743-793`.
- **Leveled spell rosters.** `spellOptions` feeds `listChoiceQuestions` and save validation (`characterBootstrapper.ts:191, 411`). A spell node whose roster is empty is neither asked nor reported unanswered (`characterBootstrapper.ts:193-204, 414-419`), so an empty leveled roster is exactly today's behaviour. Tests asserting a leveled node is not asked (`choiceQuestions.test.ts:210`, `levelUpValidation.test.ts:453`) keep passing only because of decision 8.
- **Standard actions** are pinned by id, never by count: `standardActions.test.ts`, `characterEngine.test.ts:1258-1300`, and `characterSheetStore.test.ts:1282-1320`.
- **The dice parser** (`DiceEngine.parse`) reads a single term, `NdS±k` or a flat number, which is why `perSlotAbove` must be plain dice of the segment's own die size.
- **Sample characters:**
  - **Isolde Varn** (warlock 4, sheet CHA 15, proficiency +2 → spell attack +4, DC 12) carries `item_focus_rod` and `item_gear_component_pouch`; `pact_slots` 1 of 2; `high_elf_cantrip: ["spell_minor_illusion"]`. Her live-check step 2 says Agonizing Blast is disabled with "needs Eldritch Blast"; Task 14 changes that line.
  - **Seraphine Dusk** (drow wizard 9, sheet CHA 11, proficiency +4 → Drow Magic DC 12) carries `item_focus_crystal` and no pouch; `drow_magic_faerie_fire` is stored at 0 of 1.
  - **Kestrel Vey** (sorcerer 7) is a silver dragonborn, so her breath weapon is the live check for the `save` change.
  - **Sister Aveline Cor** (human cleric 3, `…0111`) shows sheet max HP 24 and scores `[13, 10, 15, 11, 17, 12]`. The new Light cleric copies her stats, so both pinned expectations are known.
- **Every test that iterates the sample roster:**
  - `seedSampleCharactersImport.test.ts:27` pins its length (20);
  - `apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts` and `sampleCharacterScores.test.ts` hold one expected value per name;
  - `sampleCharacterChoices.test.ts` requires no undeclared save issues, spell-node `missing_selection` aside;
  - `sampleRosterIds.test.ts` requires every item id to resolve.
- The next free backlog number is **#114**.

---

### Task 1: The spell contract

**Files:**
- Modify: `packages/shared/src/schemas/content/spells.ts`
- Modify: `packages/shared/src/schemas/content/actions.ts`
- Create: `packages/shared/src/schemas/__tests__/spellContract.test.ts`
- Regenerate: `packages/database/data/schemas/segment.schema.json`

**Interfaces:**
- Produces (all exported from `@project/shared`):
  - `SpellRangeSchema` / `SpellRange`: `{ kind: "feet"; feet: number; area?: AreaOfEffect } | { kind: "self"; area?: AreaOfEffect }`
  - `SpellDurationSchema` / `SpellDuration`: `{ kind: "instantaneous" } | { kind: "timed"; amount: number; unit: "minute"; concentration: boolean }`
  - `ROUNDS_PER_DURATION_UNIT: { minute: 10 }`
  - `SpellComponents = z.infer<typeof SpellComponentSchema>`
  - `SpellDefinition` gains optional `lore?: Lore`, `range?: SpellRange`, `components?: SpellComponents`, `duration?: SpellDuration`
  - attack effect gains `repeat?: { label: string; thresholds: Array<{ minimumLevel: number; value: number }> }` and `repeatCount?: number`
  - `DamageSegment` gains `perSlotAbove?: string` (a `DamageExpression`)
  - `savingThrow` gains `dc?: number`
  - `EndConcentrationEffectSchema`: `{ type: "end_concentration" }`, a member of `CoreEffectUnion` and `ActionEffectSchema`
  - types `AreaOfEffect`, `AttackEffect`, `SaveEffect`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/schemas/__tests__/spellContract.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ActionEffectSchema,
  AttackEffectSchema,
  DamageSegmentSchema,
  SaveEffectSchema,
} from "../content/actions.js";
import {
  ROUNDS_PER_DURATION_UNIT,
  SpellDefinitionSchema,
  SpellDurationSchema,
  SpellRangeSchema,
} from "../content/spells.js";

const beamAttack = {
  type: "attack",
  attackType: "ranged_spell",
  attackStat: "SPELLCASTING_MOD",
  range: 120,
  repeat: {
    label: "Beam",
    thresholds: [
      { minimumLevel: 1, value: 1 },
      { minimumLevel: 5, value: 2 },
    ],
  },
  damage: [
    { sourceName: "Eldritch Blast", baseDice: "1d10", damageType: "force" },
  ],
};

const eldritchBlast = {
  id: "spell_eldritch_blast",
  name: "Eldritch Blast",
  level: 0,
  school: "evocation",
  isRitual: false,
  lore: { shortDescription: "A beam of crackling energy." },
  range: { kind: "feet", feet: 120 },
  components: { verbal: true, somatic: true, material: false },
  duration: { kind: "instantaneous" },
  action: {
    id: "action_spell_eldritch_blast",
    name: "Eldritch Blast",
    activation: "action",
    effect: beamAttack,
  },
};

describe("the spell contract", () => {
  it("accepts a spell with its casting metadata", () => {
    const spell = SpellDefinitionSchema.parse(eldritchBlast);

    expect(spell.range).toEqual({ kind: "feet", feet: 120 });
    expect(spell.duration).toEqual({ kind: "instantaneous" });
    expect(spell.components).toMatchObject({
      verbal: true,
      somatic: true,
      material: false,
    });
    expect(spell.lore?.shortDescription).toBe("A beam of crackling energy.");
  });

  it("still accepts a stub that carries none of it", () => {
    expect(() =>
      SpellDefinitionSchema.parse({
        id: "spell_darkness",
        name: "Darkness",
        level: 0,
        school: "evocation",
        isRitual: false,
        action: {
          id: "action_spell_darkness",
          name: "Darkness",
          activation: "action",
          effect: { type: "no_effect" },
        },
        implementation: { mode: "unimplemented", summary: "Awaiting authoring." },
      }),
    ).not.toThrow();
  });

  it("carries a self range with its area", () => {
    expect(
      SpellRangeSchema.parse({ kind: "self", area: { shape: "cone", size: 15 } }),
    ).toEqual({ kind: "self", area: { shape: "cone", size: 15 } });
  });

  // no range kind before a spell needs it
  it("has no touch range yet", () => {
    expect(() => SpellRangeSchema.parse({ kind: "touch" })).toThrow();
  });

  it("requires a timed duration to say whether it is concentration", () => {
    expect(() =>
      SpellDurationSchema.parse({ kind: "timed", amount: 1, unit: "minute" }),
    ).toThrow();
    expect(
      SpellDurationSchema.parse({
        kind: "timed",
        amount: 1,
        unit: "minute",
        concentration: true,
      }),
    ).toEqual({ kind: "timed", amount: 1, unit: "minute", concentration: true });
  });

  it("counts ten rounds to the minute", () => {
    expect(ROUNDS_PER_DURATION_UNIT.minute).toBe(10);
  });

  it("ladders an attack's repeat by level, and needs at least one rung", () => {
    expect(AttackEffectSchema.parse(beamAttack).repeat?.thresholds).toHaveLength(2);
    expect(() =>
      AttackEffectSchema.parse({
        ...beamAttack,
        repeat: { label: "Beam", thresholds: [] },
      }),
    ).toThrow();
  });

  it("accepts dice added per slot level on a damage segment", () => {
    const segment = DamageSegmentSchema.parse({
      sourceName: "Burning Hands",
      baseDice: "3d6",
      damageType: "fire",
      perSlotAbove: "1d6",
    });

    expect(segment.perSlotAbove).toBe("1d6");
    expect(() =>
      DamageSegmentSchema.parse({
        sourceName: "Burning Hands",
        baseDice: "3d6",
        damageType: "fire",
        perSlotAbove: "",
      }),
    ).toThrow();
  });

  it("lets a save carry the DC it was resolved to", () => {
    const save = SaveEffectSchema.parse({
      type: "save",
      savingThrow: {
        targetStat: "DEX",
        dcCalculation: {
          base: 8,
          scalingStat: "SPELLCASTING_MOD",
          includeProficiency: true,
        },
        saveEffect: "half_damage",
        dc: 13,
      },
    });

    expect(save.savingThrow.dc).toBe(13);
  });

  it("has an effect that ends concentration", () => {
    expect(ActionEffectSchema.parse({ type: "end_concentration" })).toEqual({
      type: "end_concentration",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @project/shared test -- spellContract`
Expected: FAIL. `SpellRangeSchema`, `SpellDurationSchema` and `ROUNDS_PER_DURATION_UNIT` are not exported, so the suite errors on import.

- [ ] **Step 3: Add the effect fields in `actions.ts`**

Add to the imports at the top of `packages/shared/src/schemas/content/actions.ts`:

```ts
import { ModifierScalingThresholdSchema } from "../primitives/scaling.js";
```

In `ActionSaveSchema`, after `saveEffect`, add:

```ts
  /**
   * The DC, resolved before the roll by whoever knows the caster: the spell
   * synthesizer stamps a spell's from its casting source. Absent, the resolver
   * computes it from `dcCalculation`, as a breath weapon's is.
   */
  dc: z.number().int().optional(),
```

In `DamageSegmentSchema`, after `levelScaling`, add:

```ts
  /**
   * Dice added once for each slot level a spell is cast above its own, as
   * Burning Hands adds 1d6. Plain dice of the segment's own die size - pack
   * validation holds it to that - because the resolver adds it by count and
   * the dice parser reads one term.
   */
  perSlotAbove: DamageExpressionSchema.optional(),
```

In `AttackEffectSchema`, after `criticalDamage`, add:

```ts
  /**
   * One action that makes several attack rolls, each with its own damage:
   * Eldritch Blast's beams. Laddered by character level, the cantrip rule;
   * the rolls are labelled `${label} 1`, `${label} 2`, and so on.
   */
  repeat: z
    .object({
      label: z.string().min(1),
      thresholds: z.array(ModifierScalingThresholdSchema).min(1),
    })
    .strict()
    .optional(),
  /**
   * `repeat` resolved at the character's level, stamped by the spell
   * synthesizer ahead of the roll the way `attackBonus` is. Absent means one.
   */
  repeatCount: z.number().int().positive().optional(),
```

After `DynamicWeaponAttackSchema` (before `CoreEffectUnion`), add:

```ts
/**
 * Ends whatever the character is concentrating on.
 *
 * Its own effect rather than a `remove_effect`, because concentration is not
 * a tag an author sets: it is `isSelfConcentration` on whichever effect the
 * last concentration spell applied.
 */
export const EndConcentrationEffectSchema = z.object({
  type: z.literal("end_concentration"),
});
```

Add `EndConcentrationEffectSchema,` as the last member of `CoreEffectUnion`'s array.

At the end of the file, beside the other type exports, add:

```ts
export type AreaOfEffect = z.infer<typeof AreaOfEffectSchema>;
export type AttackEffect = z.infer<typeof AttackEffectSchema>;
export type SaveEffect = z.infer<typeof SaveEffectSchema>;
```

- [ ] **Step 4: Add the spell fields in `spells.ts`**

In `packages/shared/src/schemas/content/spells.ts`, change the imports to:

```ts
import z from "zod";
import { ActionGrantSchema, AreaOfEffectSchema } from "./actions.js";
import { ModifierScalingSchema, ModifierTargetSchema } from "./modifiers.js";
import { LoreSchema } from "../primitives/lore.js";
```

After `SpellComponentSchema`, add:

```ts
/**
 * Where a spell reaches. `touch`, `sight` and `unlimited` arrive with the
 * first spell that needs one; the repo adds no variant before a real rule.
 *
 * `area` is the spell's area, authored once, here. The spell synthesizer
 * copies it onto the spell's save, so the save line the table reads names it.
 */
export const SpellRangeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("feet"),
      feet: z.number().int().positive(),
      area: AreaOfEffectSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("self"),
      area: AreaOfEffectSchema.optional(),
    })
    .strict(),
]);

/**
 * How long a spell lasts. `concentration` is display here; the rule itself is
 * the `isSelfConcentration` effect the spell's action applies, and pack
 * validation requires the two to agree.
 */
export const SpellDurationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("instantaneous") }).strict(),
  z
    .object({
      kind: z.literal("timed"),
      amount: z.number().int().positive(),
      unit: z.enum(["minute"]),
      concentration: z.boolean(),
    })
    .strict(),
]);

/** Rounds in one unit of a timed duration: a round is six seconds. */
export const ROUNDS_PER_DURATION_UNIT = { minute: 10 } as const;
```

In `SpellDefinitionSchema`, after `action: ActionGrantSchema,`, add:

```ts
  /**
   * What the table needs to know to cast it. Optional on the schema because a
   * stub carries none of them; pack validation requires all four on every
   * authored spell (validateSpells).
   */
  lore: LoreSchema.optional(),
  range: SpellRangeSchema.optional(),
  components: SpellComponentSchema.optional(),
  duration: SpellDurationSchema.optional(),
```

After `export type SpellDefinition = ...`, add:

```ts
export type SpellRange = z.infer<typeof SpellRangeSchema>;
export type SpellDuration = z.infer<typeof SpellDurationSchema>;
export type SpellComponents = z.infer<typeof SpellComponentSchema>;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @project/shared test -- spellContract`
Expected: PASS (10 tests).

- [ ] **Step 6: Regenerate the pack schemas and run the dependent suites**

```bash
pnpm --filter @project/database schemas:generate
DATABASE_URL= pnpm --filter @project/database test
pnpm --filter @project/shared test
pnpm --filter @project/shared typecheck
pnpm --filter @project/engine typecheck
```

Expected: every suite passes: shared 243, database 200. Both typechecks are clean. `git diff --stat packages/database/data/schemas` shows only `segment.schema.json` changed.

- [ ] **Step 7: Restore line endings, then commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' packages/shared/src/schemas/content/spells.ts packages/shared/src/schemas/content/actions.ts packages/shared/src/schemas/__tests__/spellContract.test.ts
git add packages/shared/src/schemas/content/spells.ts packages/shared/src/schemas/content/actions.ts packages/shared/src/schemas/__tests__/spellContract.test.ts packages/database/data/schemas/segment.schema.json
git commit -F - <<'EOF'
feat(shared): the spell contract carries range, components, duration and lore (#31b)

A spell record gains the four things the table needs to cast it; attack
effects gain a level-laddered repeat (Eldritch Blast's beams), damage
segments gain dice per slot level above, saves gain a resolved DC, and a new
effect ends concentration.

Co-Authored-By: <your session's attribution>
EOF
```

---

### Task 2: How each class casts, and which pools are slots

**Files:**
- Modify: `packages/shared/src/schemas/content/items.ts`
- Modify: `packages/shared/src/schemas/content/character.ts`
- Modify: `packages/shared/src/schemas/content/resources.ts`
- Modify: `packages/shared/src/schemas/__tests__/spellcastingSchema.test.ts`
- Modify: `packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts:940-944`
- Modify: `packages/database/scripts/patchPackSegment.ts`
- Modify (via the patch script only): `packages/database/data/packs/core_2014_pack/classes/{bard,cleric,druid,fighter,paladin,ranger,rogue,sorcerer,warlock,wizard}.json`, `packages/database/data/packs/core_2014_pack/equipment/core.json`
- Create: `packages/database/src/__tests__/spellcastingPack.test.ts`
- Regenerate: `packages/database/data/schemas/segment.schema.json`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `SpellcastingFocusCategorySchema` / `SpellcastingFocusCategory`: `"category_arcane_focus" | "category_druidic_focus" | "category_holy_symbol" | "category_musical_instrument"`
  - `"category_component_pouch"` in `StartingEquipmentCategoryTagSchema`
  - `Spellcasting` gains required `preparation: "prepared" | "known"` and `focusCategories: SpellcastingFocusCategory[]`
  - a charges resource gains optional `spellSlot?: { kind: "level"; level: number } | { kind: "pact" }`
  - patch ops `setTraitResourceFields`, `setEquipmentFields`, `upsertSpells`, `deleteSpellIds`; Task 4 uses the last two.

- [ ] **Step 1: Write the failing pack test**

Create `packages/database/src/__tests__/spellcastingPack.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import path from "node:path";
import { assembleCoreRulePack } from "../corePackAssembler.js";

const SHIPPED_PACK = path.join(process.cwd(), "data/packs/core_2014_pack");

/**
 * How each casting class casts, as the PHB states it (chapter 3), and which
 * pools are spell slots. The schema only requires the fields to exist; this is
 * where their values are checked against the book.
 */
describe("the shipped pack declares how each class casts", () => {
  const EXPECTED: Record<
    string,
    { preparation: string; focusCategories: string[] }
  > = {
    class_bard: {
      preparation: "known",
      focusCategories: ["category_musical_instrument"],
    },
    class_cleric: {
      preparation: "prepared",
      focusCategories: ["category_holy_symbol"],
    },
    class_druid: {
      preparation: "prepared",
      focusCategories: ["category_druidic_focus"],
    },
    class_paladin: {
      preparation: "prepared",
      focusCategories: ["category_holy_symbol"],
    },
    class_ranger: { preparation: "known", focusCategories: [] },
    class_sorcerer: {
      preparation: "known",
      focusCategories: ["category_arcane_focus"],
    },
    class_warlock: {
      preparation: "known",
      focusCategories: ["category_arcane_focus"],
    },
    class_wizard: {
      preparation: "prepared",
      focusCategories: ["category_arcane_focus"],
    },
    subclass_fighter_eldritch_knight: {
      preparation: "known",
      focusCategories: [],
    },
    subclass_rogue_arcane_trickster: {
      preparation: "known",
      focusCategories: [],
    },
  };

  it("states preparation and foci for every caster", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);
    const declared = Object.fromEntries(
      [...pack.classes, ...pack.subclasses].flatMap((entry) =>
        entry.spellcasting
          ? [
              [
                entry.id,
                {
                  preparation: entry.spellcasting.preparation,
                  focusCategories: entry.spellcasting.focusCategories,
                },
              ],
            ]
          : [],
      ),
    );

    expect(declared).toEqual(EXPECTED);
  });

  it("declares every slot pool's level, and marks nothing else a slot", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);
    const pools = [
      ...pack.resources,
      ...pack.traits.flatMap((trait) => trait.resources),
    ];

    // the one place an id is read: a data check that each slot pool
    // declares the level its id already says
    for (const pool of pools) {
      const declared = "spellSlot" in pool ? pool.spellSlot : undefined;
      const idLevel = /^spell_slots_(\d)$/.exec(pool.id)?.[1];

      if (idLevel) {
        expect(declared, pool.id).toEqual({ kind: "level", level: Number(idLevel) });
      } else if (pool.id === "pact_slots") {
        expect(declared, pool.id).toEqual({ kind: "pact" });
      } else {
        expect(declared, pool.id).toBeUndefined();
      }
    }
  });

  it("lets the component pouch stand in for material components", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);
    const pouch = pack.equipment.find(
      (item) => item.id === "item_gear_component_pouch",
    );

    expect(pouch?.categoryTags).toEqual(["category_component_pouch"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `DATABASE_URL= pnpm --filter @project/database test -- spellcastingPack`
Expected: FAIL on all three: `preparation` is undefined, no pool declares `spellSlot`, and the pouch's tags are `[]`.

- [ ] **Step 3: Update the schema test**

In `packages/shared/src/schemas/__tests__/spellcastingSchema.test.ts`, replace the first test (`accepts an ability, a progression and a startsAtLevel`) with:

```ts
  it("accepts an ability, a progression, a start level, preparation and foci", () => {
    const block = {
      ability: "INT",
      progression: "full",
      startsAtLevel: 1,
      preparation: "prepared",
      focusCategories: ["category_arcane_focus"],
    };

    expect(SpellcastingSchema.parse(block)).toEqual(block);
  });

  // required, not defaulted, for the same reason startsAtLevel is: a caster
  // without an answer fails to validate instead of quietly reading as one
  it("rejects a block that does not say how it prepares, or what foci it uses", () => {
    expect(() =>
      SpellcastingSchema.parse({
        ability: "INT",
        progression: "full",
        startsAtLevel: 1,
        focusCategories: [],
      }),
    ).toThrow();
    expect(() =>
      SpellcastingSchema.parse({
        ability: "INT",
        progression: "full",
        startsAtLevel: 1,
        preparation: "known",
      }),
    ).toThrow();
  });

  it("rejects a focus category that is not a spellcasting focus", () => {
    expect(() =>
      SpellcastingSchema.parse({
        ability: "INT",
        progression: "full",
        startsAtLevel: 1,
        preparation: "prepared",
        focusCategories: ["category_weapon_simple"],
      }),
    ).toThrow();
  });
```

Replace the body of `rejects an unknown key, so a typo cannot be authored silently` so that its unknown key is `slotTable: "full"`, and its otherwise-valid block carries `preparation: "prepared", focusCategories: []`. (`preparation` was the key it used; it is now a real field.)

In `describe("a class may declare how it casts")`, replace `carries the block through when present` with:

```ts
  it("carries the block through when present", () => {
    const block = {
      ability: "INT",
      progression: "full",
      startsAtLevel: 1,
      preparation: "prepared",
      focusCategories: ["category_arcane_focus"],
    };

    expect(
      ClassDefinitionSchema.parse({ ...minimalClass, spellcasting: block })
        .spellcasting,
    ).toEqual(block);
  });
```

Add a resource block at the end of the file, and add `ChargesResourceSchema` to its imports (`import { ChargesResourceSchema } from "../content/resources.js";`):

```ts
describe("a charges pool may declare itself a spell slot", () => {
  const pool = {
    id: "spell_slots_3",
    name: "3rd-Level Spell Slots",
    resetCondition: "long_rest",
    maxRule: { kind: "fixed", value: 2 },
  };

  it("carries a slot level, or pact", () => {
    expect(
      ChargesResourceSchema.parse({
        ...pool,
        spellSlot: { kind: "level", level: 3 },
      }).spellSlot,
    ).toEqual({ kind: "level", level: 3 });
    expect(
      ChargesResourceSchema.parse({ ...pool, spellSlot: { kind: "pact" } })
        .spellSlot,
    ).toEqual({ kind: "pact" });
  });

  it("rejects a slot level above 9", () => {
    expect(() =>
      ChargesResourceSchema.parse({
        ...pool,
        spellSlot: { kind: "level", level: 10 },
      }),
    ).toThrow();
  });
});
```

Run: `pnpm --filter @project/shared test -- spellcastingSchema`
Expected: FAIL. The new-field tests fail and the resource tests throw on `spellSlot`.

- [ ] **Step 4: Implement the schema**

In `packages/shared/src/schemas/content/items.ts`, add `"category_component_pouch",` as the last member of `StartingEquipmentCategoryTagSchema`, with this comment above it:

```ts
  // Not a starting-equipment category - classes grant the pouch by id - but
  // the cast path's material check reads these tags too, and a component
  // pouch covers any spell's ordinary material component (spellCast.ts)
```

After `StartingEquipmentCategoryTagSchema`, add:

```ts
/**
 * The categories an item can be a spellcasting focus through. A class names
 * the ones its spells can use; the component pouch is not among them, because
 * it serves every caster.
 */
export const SpellcastingFocusCategorySchema =
  StartingEquipmentCategoryTagSchema.extract([
    "category_arcane_focus",
    "category_druidic_focus",
    "category_holy_symbol",
    "category_musical_instrument",
  ]);

export type SpellcastingFocusCategory = z.infer<
  typeof SpellcastingFocusCategorySchema
>;
```

In `packages/shared/src/schemas/content/character.ts`, change the items import to `import { SpellcastingFocusCategorySchema, StartingEquipmentDefinitionSchema } from "./items.js";`. Then replace `SpellcastingSchema` with:

```ts
export const SpellcastingSchema = z
  .object({
    ability: z.enum(["INT", "WIS", "CHA"]),
    progression: z.enum(["full", "half", "third", "pact"]),
    startsAtLevel: z.number().int().min(1).max(20),
    /**
     * Whether the class prepares its leveled spells each day or knows a fixed
     * list. The spell synthesizer reads it to flag a prepared caster's picks,
     * since preparation itself is not tracked yet.
     */
    preparation: z.enum(["prepared", "known"]),
    /**
     * The foci this class's spells can use in place of material components.
     * Empty is a statement - component pouch only - and is what the ranger,
     * the Eldritch Knight and the Arcane Trickster get.
     */
    focusCategories: z.array(SpellcastingFocusCategorySchema),
  })
  .strict();
```

In `packages/shared/src/schemas/content/resources.ts`, add to `ChargesResourceSchema`'s object, after `mode`:

```ts
    /**
     * Marks the pool as spell slots, and at what level. Declared rather than
     * read off the id, as category tags are: the cast path spends a slot by
     * asking which pools are slots of at least the spell's level. A pact
     * pool's level is the warlock's pact slot level, which rises with
     * warlock level (SpellcastingEngine's pactSlotLevel).
     */
    spellSlot: z
      .discriminatedUnion("kind", [
        z
          .object({
            kind: z.literal("level"),
            level: z.number().int().min(1).max(9),
          })
          .strict(),
        z.object({ kind: z.literal("pact") }).strict(),
      ])
      .optional(),
```

Run: `pnpm --filter @project/shared test -- spellcastingSchema`
Expected: PASS.

- [ ] **Step 5: Teach the patch script four operations**

In `packages/database/scripts/patchPackSegment.ts`, add to `type Patch`:

```ts
  /**
   * Resource id -> fields to set, shallow, on every trait resource in the
   * segment with that id. Slot pools can appear on more than one trait in a
   * segment, and every copy is set. An id that matches nothing is an error.
   */
  setTraitResourceFields?: Record<string, Record<string, unknown>>;
  /** Equipment id -> fields to set on that item, shallow. */
  setEquipmentFields?: Record<string, Record<string, unknown>>;
  /** Spells to insert, or to replace by id. */
  upsertSpells?: Array<{ id: string } & Record<string, unknown>>;
  /** Spell ids to remove. An id the segment lacks is an error. */
  deleteSpellIds?: string[];
```

Replace `type Segment` with:

```ts
type Segment = {
  traits?: Array<{
    id: string;
    resources?: Array<Record<string, unknown> & { id: string }>;
  }>;
  classes?: Array<
    Record<string, unknown> & {
      id: string;
      progression: Array<{ grants: unknown[] }>;
    }
  >;
  subclasses?: Array<Record<string, unknown> & { id: string }>;
  equipment?: Array<Record<string, unknown> & { id: string }>;
  spells?: Array<Record<string, unknown> & { id: string }>;
};
```

Immediately before `const printed = ...`, add:

```ts
for (const [resourceId, fields] of Object.entries(
  patch.setTraitResourceFields ?? {},
)) {
  const matches = (segment.traits ?? []).flatMap((trait) =>
    (trait.resources ?? []).filter((resource) => resource.id === resourceId),
  );
  if (matches.length === 0) {
    throw new Error(`${segmentPath} has no trait resource '${resourceId}'`);
  }
  for (const resource of matches) Object.assign(resource, fields);
}

for (const [equipmentId, fields] of Object.entries(
  patch.setEquipmentFields ?? {},
)) {
  const entry = (segment.equipment ?? []).find(
    (item) => item.id === equipmentId,
  );
  if (!entry) throw new Error(`${segmentPath} has no equipment '${equipmentId}'`);
  Object.assign(entry, fields);
}

for (const id of patch.deleteSpellIds ?? []) {
  const index = (segment.spells ?? []).findIndex((spell) => spell.id === id);
  if (index === -1) {
    throw new Error(`${segmentPath} has no spell '${id}' to delete`);
  }
  segment.spells!.splice(index, 1);
}

for (const spell of patch.upsertSpells ?? []) {
  segment.spells ??= [];
  const index = segment.spells.findIndex((entry) => entry.id === spell.id);
  if (index === -1) segment.spells.push(spell);
  else segment.spells[index] = spell;
}
```

- [ ] **Step 6: Patch the pack**

Write this driver to the scratchpad as `spellcasting-patches.mjs` (it is a one-off tool, not a repo file):

```js
// Writes one patch per segment and applies it with patchPackSegment.ts.
// Run from packages/database.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PACK = "data/packs/core_2014_pack";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spellcasting-patches-"));

const slots = (count) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `spell_slots_${index + 1}`,
      { spellSlot: { kind: "level", level: index + 1 } },
    ]),
  );

const casting = (ability, progression, startsAtLevel, preparation, focusCategories) => ({
  spellcasting: { ability, progression, startsAtLevel, preparation, focusCategories },
});

const patches = {
  "classes/bard.json": {
    setClassFields: { class_bard: casting("CHA", "full", 1, "known", ["category_musical_instrument"]) },
    setTraitResourceFields: slots(9),
  },
  "classes/cleric.json": {
    setClassFields: { class_cleric: casting("WIS", "full", 1, "prepared", ["category_holy_symbol"]) },
    setTraitResourceFields: slots(9),
  },
  "classes/druid.json": {
    setClassFields: { class_druid: casting("WIS", "full", 1, "prepared", ["category_druidic_focus"]) },
    setTraitResourceFields: slots(9),
  },
  "classes/sorcerer.json": {
    setClassFields: { class_sorcerer: casting("CHA", "full", 1, "known", ["category_arcane_focus"]) },
    setTraitResourceFields: slots(9),
  },
  "classes/wizard.json": {
    setClassFields: { class_wizard: casting("INT", "full", 1, "prepared", ["category_arcane_focus"]) },
    setTraitResourceFields: slots(9),
  },
  "classes/paladin.json": {
    setClassFields: { class_paladin: casting("CHA", "half", 2, "prepared", ["category_holy_symbol"]) },
    setTraitResourceFields: slots(5),
  },
  "classes/ranger.json": {
    setClassFields: { class_ranger: casting("WIS", "half", 2, "known", []) },
    setTraitResourceFields: slots(5),
  },
  "classes/fighter.json": {
    setSubclassFields: { subclass_fighter_eldritch_knight: casting("INT", "third", 3, "known", []) },
    setTraitResourceFields: slots(4),
  },
  "classes/rogue.json": {
    setSubclassFields: { subclass_rogue_arcane_trickster: casting("INT", "third", 3, "known", []) },
    setTraitResourceFields: slots(4),
  },
  "classes/warlock.json": {
    setClassFields: { class_warlock: casting("CHA", "pact", 1, "known", ["category_arcane_focus"]) },
    setTraitResourceFields: { pact_slots: { spellSlot: { kind: "pact" } } },
  },
  "equipment/core.json": {
    setEquipmentFields: {
      item_gear_component_pouch: { categoryTags: ["category_component_pouch"] },
    },
  },
};

for (const [segment, patch] of Object.entries(patches)) {
  const patchFile = path.join(dir, segment.replace("/", "_"));
  fs.writeFileSync(patchFile, JSON.stringify(patch));
  execFileSync(
    "pnpm",
    ["exec", "tsx", "scripts/patchPackSegment.ts", `${PACK}/${segment}`, patchFile],
    { stdio: "inherit", shell: true },
  );
}
```

Run it from `packages/database`: `node <scratchpad>/spellcasting-patches.mjs`
Expected: eleven `patched …` lines and no errors.

Then check the diff is only the intended fields:

```bash
git diff --stat packages/database/data/packs
```

Expected: 11 files changed. Every class file gains two lines in its `spellcasting` block plus one `spellSlot` block per slot pool, and `equipment/core.json` changes one line. Spot-check `git diff packages/database/data/packs/core_2014_pack/classes/warlock.json`: `preparation`, `focusCategories`, and `"spellSlot": { "kind": "pact" }` on `pact_slots`, with no reindentation anywhere else.

- [ ] **Step 7: Fix the one fixture the stricter type breaks**

In `packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts`, the `spellcasting` block at lines 940-944 gains the two fields:

```ts
        spellcasting: {
          ability: "INT" as const,
          progression: "full" as const,
          startsAtLevel: 1,
          preparation: "prepared" as const,
          focusCategories: [],
        },
```

- [ ] **Step 8: Regenerate, then run everything this touches**

```bash
pnpm --filter @project/database schemas:generate
pnpm --filter @project/shared test
DATABASE_URL= pnpm --filter @project/database test
pnpm --filter @project/engine test
pnpm --filter @project/shared typecheck
pnpm --filter @project/engine typecheck
pnpm --filter @project/database typecheck
```

Expected: every suite passes: shared 247, database 203, engine 1017. All three typechecks are clean.

- [ ] **Step 9: Restore line endings, then commit**

Restore CRLF on `items.ts`, `character.ts`, `resources.ts`, `spellcastingSchema.test.ts`, `characterBootstraper.test.ts`, `patchPackSegment.ts` and `spellcastingPack.test.ts`. The pack files keep the patch script's endings; measure them to confirm CRLF.

```bash
git add packages/shared/src/schemas/content/items.ts packages/shared/src/schemas/content/character.ts packages/shared/src/schemas/content/resources.ts packages/shared/src/schemas/__tests__/spellcastingSchema.test.ts packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts packages/database/scripts/patchPackSegment.ts packages/database/src/__tests__/spellcastingPack.test.ts packages/database/data/packs/core_2014_pack/classes packages/database/data/packs/core_2014_pack/equipment/core.json packages/database/data/schemas/segment.schema.json
git commit -F - <<'EOF'
feat(pack): each class says how it prepares and what foci it uses; slot pools say their level

SpellcastingSchema gains preparation and focusCategories, required. A
charges pool can declare itself a spell slot of a level, or pact, so the cast
path never matches slot pools by id. The component pouch gains
category_component_pouch. patchPackSegment learns to set trait resource and
equipment fields and to upsert and delete spells.

Co-Authored-By: <your session's attribution>
EOF
```

---

### Task 3: Pack validation keeps spells honest

**Files:**
- Modify: `packages/shared/src/schemas/content/validatePack.ts`
- Modify: `packages/shared/src/schemas/__tests__/coreRulePack.test.ts`

**Interfaces:**
- Consumes: `ROUNDS_PER_DURATION_UNIT`, the Task 1 fields.
- Produces: `CoreRulePackIssueCode` gains `"incomplete_spell" | "concentration_mismatch" | "invalid_upcast" | "spell_hardcodes_caster_value"`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/shared/src/schemas/__tests__/coreRulePack.test.ts`:

```ts
describe("validateCoreRulePack: spells", () => {
  const saveFor = (extra: Record<string, unknown> = {}) => ({
    targetStat: "DEX",
    dcCalculation: {
      base: 8,
      scalingStat: "SPELLCASTING_MOD",
      includeProficiency: true,
    },
    saveEffect: "half_damage",
    ...extra,
  });

  const concentrationEffect = (rounds: number) => ({
    type: "apply_effect",
    effectName: "Test Flame",
    durationType: "rounds",
    durationRounds: rounds,
    isSelfConcentration: true,
  });

  const CONCENTRATION_MINUTE = {
    kind: "timed",
    amount: 1,
    unit: "minute",
    concentration: true,
  };

  const authored = (overrides: Record<string, unknown> = {}) => ({
    id: "spell_test_flame",
    name: "Test Flame",
    level: 1,
    school: "evocation",
    isRitual: false,
    lore: { shortDescription: "A test flame." },
    range: { kind: "self", area: { shape: "cone", size: 15 } },
    components: { verbal: true, somatic: true, material: false },
    duration: { kind: "instantaneous" },
    action: {
      id: "action_spell_test_flame",
      name: "Test Flame",
      activation: "action",
      effect: {
        type: "save",
        savingThrow: saveFor(),
        damage: [
          {
            sourceName: "Test Flame",
            baseDice: "3d6",
            damageType: "fire",
            perSlotAbove: "1d6",
          },
        ],
      },
    },
    ...overrides,
  });

  const withEffect = (effect: unknown, overrides: Record<string, unknown> = {}) =>
    authored({
      action: {
        id: "action_spell_test_flame",
        name: "Test Flame",
        activation: "action",
        effect,
      },
      ...overrides,
    });

  const issuesFor = (spell: unknown) => {
    const source = createValidPack() as unknown as { spells: unknown[] };
    source.spells.push(spell);
    return validateCoreRulePack(CoreRulePackSchema.parse(source)).issues;
  };

  const codesFor = (spell: unknown) => issuesFor(spell).map((issue) => issue.code);

  it("accepts an authored spell with its metadata", () => {
    expect(issuesFor(authored())).toEqual([]);
  });

  it("rejects an authored spell missing its metadata, naming what is missing", () => {
    expect(issuesFor(authored({ lore: undefined, duration: undefined }))).toContainEqual({
      code: "incomplete_spell",
      path: ["spells", 0],
      message: expect.stringContaining("lore, duration"),
    });
  });

  it("rejects a stub that carries metadata", () => {
    expect(
      codesFor(
        withEffect(
          { type: "no_effect" },
          { implementation: { mode: "unimplemented", summary: "Awaiting authoring." } },
        ),
      ),
    ).toContain("incomplete_spell");
  });

  it("rejects a material component nobody named", () => {
    expect(
      codesFor(authored({ components: { verbal: true, material: true } })),
    ).toContain("incomplete_spell");
  });

  it("accepts a concentration duration paired with a concentration effect of its length", () => {
    expect(
      issuesFor(withEffect(concentrationEffect(10), { duration: CONCENTRATION_MINUTE })),
    ).toEqual([]);
  });

  it("finds the concentration effect inside a macro", () => {
    expect(
      issuesFor(
        withEffect(
          {
            type: "macro",
            effects: [
              { type: "save", savingThrow: saveFor({ saveEffect: "negates_effect" }) },
              concentrationEffect(10),
            ],
          },
          { duration: CONCENTRATION_MINUTE },
        ),
      ),
    ).toEqual([]);
  });

  it("rejects a concentration effect whose rounds disagree with the duration", () => {
    expect(
      codesFor(withEffect(concentrationEffect(5), { duration: CONCENTRATION_MINUTE })),
    ).toContain("concentration_mismatch");
  });

  it("rejects a concentration duration with no concentration effect", () => {
    expect(codesFor(authored({ duration: CONCENTRATION_MINUTE }))).toContain(
      "concentration_mismatch",
    );
  });

  it("rejects a concentration effect on a spell that does not concentrate", () => {
    expect(codesFor(withEffect(concentrationEffect(10)))).toContain(
      "concentration_mismatch",
    );
  });

  it("rejects upcast dice on a cantrip", () => {
    expect(codesFor(authored({ level: 0 }))).toContain("invalid_upcast");
  });

  it("rejects upcast dice of another die size", () => {
    expect(
      codesFor(
        withEffect({
          type: "save",
          savingThrow: saveFor(),
          damage: [
            {
              sourceName: "Test Flame",
              baseDice: "3d6",
              damageType: "fire",
              perSlotAbove: "1d8",
            },
          ],
        }),
      ),
    ).toContain("invalid_upcast");
  });

  it("rejects a spell that hard-codes its caster's numbers", () => {
    const resolvedDc = issuesFor(
      withEffect({ type: "save", savingThrow: saveFor({ dc: 15 }) }),
    );
    expect(resolvedDc).toContainEqual(
      expect.objectContaining({
        code: "spell_hardcodes_caster_value",
        message: expect.stringContaining("savingThrow.dc"),
      }),
    );

    expect(
      codesFor(
        withEffect({
          type: "save",
          areaOfEffect: { shape: "cone", size: 15 },
          savingThrow: saveFor(),
        }),
      ),
    ).toContain("spell_hardcodes_caster_value");

    expect(
      codesFor(
        withEffect({
          type: "attack",
          attackType: "ranged_spell",
          attackStat: "SPELLCASTING_MOD",
          attackBonus: 5,
          damage: [{ sourceName: "Test Flame", baseDice: "1d10", damageType: "fire" }],
        }),
      ),
    ).toContain("spell_hardcodes_caster_value");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @project/shared test -- coreRulePack`
Expected: FAIL. Every rejection test fails, because nothing validates spells yet. The two "accepts" tests pass.

- [ ] **Step 3: Implement `validateSpells`**

In `packages/shared/src/schemas/content/validatePack.ts`, add to the imports:

```ts
import { ROUNDS_PER_DURATION_UNIT } from "./spells.js";
```

Add four members to `CoreRulePackIssueCode`, keeping its alphabetical order:

```ts
  | "concentration_mismatch"
  | "incomplete_spell"
  | "invalid_upcast"
  | "spell_hardcodes_caster_value"
```

Before `export const validateCoreRulePack`, add:

```ts
type PackSpell = CoreRulePack["spells"][number];
type SpellEffect = PackSpell["action"]["effect"];

/** An action's effect, and a macro's nested ones beside it. */
const flattenEffects = (effect: SpellEffect): SpellEffect[] =>
  effect.type === "macro" ? [effect, ...effect.effects] : [effect];

const SPELL_METADATA = ["lore", "range", "components", "duration"] as const;

const DICE = /^(\d+)d(\d+)([+-]\d+)?$/;

/**
 * What an authored spell must say, and what it must not.
 *
 * - An authored spell carries lore, range, components and duration; a stub
 *   carries none, since the marker says it is a placeholder.
 * - A material component names its material.
 * - A concentration duration and a concentration effect come together, and
 *   agree on how long.
 * - `perSlotAbove` sits only on a leveled spell, as plain dice of its
 *   segment's own die size - the resolver adds it by count.
 * - A spell never authors a number its caster decides: the synthesizer
 *   stamps attack bonus, DC, beam count and area from the casting source and
 *   the spell's range.
 */
const validateSpells = (
  pack: CoreRulePack,
  issues: CoreRulePackValidationIssue[],
) => {
  pack.spells.forEach((spell, index) => {
    const path: Array<string | number> = ["spells", index];
    const isStub = spell.implementation?.mode === "unimplemented";

    const present = SPELL_METADATA.filter((key) => spell[key] !== undefined);
    const missing = SPELL_METADATA.filter((key) => spell[key] === undefined);
    if (isStub && present.length > 0) {
      issues.push({
        code: "incomplete_spell",
        path,
        message: `Stub spell '${spell.id}' carries ${present.join(", ")}; a stub is a placeholder, and metadata belongs on an authored spell.`,
      });
    }
    if (!isStub && missing.length > 0) {
      issues.push({
        code: "incomplete_spell",
        path,
        message: `Spell '${spell.id}' is authored but has no ${missing.join(", ")}.`,
      });
    }

    if (spell.components?.material && !spell.components.materialDescription) {
      issues.push({
        code: "incomplete_spell",
        path: [...path, "components"],
        message: `Spell '${spell.id}' needs a material component but does not say what it is.`,
      });
    }

    const effects = flattenEffects(spell.action.effect);
    const concentration = effects.flatMap((effect) =>
      effect.type === "apply_effect" && effect.isSelfConcentration ? [effect] : [],
    );
    const duration = spell.duration;
    if (duration !== undefined) {
      const concentrates = duration.kind === "timed" && duration.concentration;
      if (concentrates !== concentration.length > 0) {
        issues.push({
          code: "concentration_mismatch",
          path: [...path, "duration"],
          message: concentrates
            ? `Spell '${spell.id}' lasts with concentration, but its action applies no concentration effect.`
            : `Spell '${spell.id}' applies a concentration effect, but its duration is not concentration.`,
        });
      }
      if (duration.kind === "timed" && concentrates) {
        const rounds = duration.amount * ROUNDS_PER_DURATION_UNIT[duration.unit];
        for (const effect of concentration) {
          if (effect.durationType !== "rounds" || effect.durationRounds !== rounds) {
            issues.push({
              code: "concentration_mismatch",
              path: [...path, "action"],
              message: `Spell '${spell.id}' lasts ${rounds} rounds, but its concentration effect does not.`,
            });
          }
        }
      }
    }

    for (const effect of effects) {
      const segments =
        "damage" in effect && Array.isArray(effect.damage) ? effect.damage : [];
      for (const segment of segments) {
        if (segment.perSlotAbove === undefined) continue;
        if (spell.level === 0) {
          issues.push({
            code: "invalid_upcast",
            path: [...path, "action"],
            message: `Cantrip '${spell.id}' cannot be cast with a slot, so it cannot add dice per slot level.`,
          });
          continue;
        }
        const base = DICE.exec(segment.baseDice);
        const extra = DICE.exec(segment.perSlotAbove);
        if (!base || !extra || extra[3] !== undefined || extra[2] !== base[2]) {
          issues.push({
            code: "invalid_upcast",
            path: [...path, "action"],
            message: `Spell '${spell.id}' adds '${segment.perSlotAbove}' per slot level to '${segment.baseDice}'; it must be plain dice of the same die size.`,
          });
        }
      }

      const hardcoded = [
        effect.type === "attack" && effect.attackBonus !== undefined ? "attackBonus" : undefined,
        effect.type === "attack" && effect.damageBonus !== undefined ? "damageBonus" : undefined,
        effect.type === "attack" && effect.repeatCount !== undefined ? "repeatCount" : undefined,
        effect.type === "save" && effect.savingThrow.dc !== undefined ? "savingThrow.dc" : undefined,
        effect.type === "save" && effect.areaOfEffect !== undefined ? "areaOfEffect" : undefined,
      ].filter((field): field is string => field !== undefined);
      if (hardcoded.length > 0) {
        issues.push({
          code: "spell_hardcodes_caster_value",
          path: [...path, "action"],
          message: `Spell '${spell.id}' authors ${hardcoded.join(", ")}; the spell synthesizer stamps these from the casting source and the spell's range.`,
        });
      }
    }
  });
};
```

In `validateCoreRulePack`, call it immediately after `validateClassScaling(pack, issues);`:

```ts
  validateSpells(pack, issues);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @project/shared test -- coreRulePack`
Expected: PASS.

- [ ] **Step 5: Confirm the shipped pack still validates, and typecheck**

```bash
DATABASE_URL= pnpm --filter @project/database test
pnpm --filter @project/shared test
pnpm --filter @project/shared typecheck
```

Expected: database 203 and shared 259 pass, and the typecheck is clean. The shipped pack has no authored spell yet, and its 111 stubs carry no metadata, so no new issue fires.

- [ ] **Step 6: Restore line endings, then commit**

```bash
git add packages/shared/src/schemas/content/validatePack.ts packages/shared/src/schemas/__tests__/coreRulePack.test.ts
git commit -F - <<'EOF'
feat(shared): pack validation holds an authored spell to its metadata, its concentration and its caster (#31b)

Four codes: incomplete_spell, concentration_mismatch, invalid_upcast and
spell_hardcodes_caster_value. A spell never authors a number its caster
decides; the synthesizer stamps those.

Co-Authored-By: <your session's attribution>
EOF
```

---

### Task 4: Author the four spells, and keep leveled picks unasked

**Files:**
- Modify: `packages/engine/src/pipeline/spellChoices.ts`
- Modify: `packages/engine/src/pipeline/__tests__/spellChoices.test.ts:49-54`
- Modify: `packages/database/src/__tests__/implementationMarkers.test.ts:105-116`
- Create: `packages/database/data/packs/core_2014_pack/spells/core.json`
- Modify (via the patch script only): `packages/database/data/packs/core_2014_pack/spells/unimplemented.json`
- Modify (via the one-liner below only): `packages/database/data/packs/core_2014_pack/manifest.json`

**Interfaces:**
- Consumes: the Task 1 spell fields, the Task 2 patch ops `upsertSpells` and `deleteSpellIds`, and Task 3's validation.
- Produces:
  - `spellOptions(node, snapshot)` returns `[]` whenever `node.maxSpellLevel > 0` (decision 8).
  - the authored spells: `spell_eldritch_blast` (0), `spell_dancing_lights` (0), `spell_faerie_fire` (1) and `spell_burning_hands` (1), all evocation, in `spells/core.json`. Their action ids are unchanged: `action_spell_<name>`.

- [ ] **Step 1: Pin decision 8, and watch it fail**

In `packages/engine/src/pipeline/__tests__/spellChoices.test.ts`, replace the test `offers any other node levels 1 through its cap, and no cantrips` with:

```ts
  // #31a: without class spell lists a leveled node would offer every leveled
  // pack spell whatever the class - a wizard's six-spell spellbook drawn from
  // Faerie Fire and Burning Hands - so it offers nothing until lists exist
  it("offers a leveled node nothing until the pack has class spell lists", () => {
    expect(spellOptions(node(2), { spellsById })).toEqual([]);
  });
```

Run: `pnpm --filter @project/engine test -- spellChoices`
Expected: FAIL. The node offers `first_a` and `second_a`.

- [ ] **Step 2: Implement decision 8**

In `packages/engine/src/pipeline/spellChoices.ts`, replace `spellOptions` and its docstring with:

```ts
/**
 * The spells a spell_choice node offers, in pack order.
 *
 * A cantrip node (maxSpellLevel 0) offers every level-0 spell. It is not
 * filtered by listSource: the pack has no spell lists yet (#31a), and this is
 * the one place list membership goes when it does.
 *
 * A leveled node offers nothing until then. With no list to filter on, it
 * would offer every leveled pack spell whatever the class; since
 * feat/spell-casting gave Faerie Fire and Burning Hands real levels, a new
 * wizard would be asked to fill a six-spell spellbook from those two, and
 * could not finish creation. An empty roster is neither asked
 * (listChoiceQuestions) nor reported unanswered (collectSaveIssues), which is
 * what every character got while every spell was a level-0 placeholder.
 * #31a removes this rule.
 * @param node The spell choice, from a class track or a trait's spells block
 * @param snapshot Pack content, when the caller has any loaded
 * @returns The spells a player may pick for this node
 */
export const spellOptions = (
  node: SpellChoiceNode,
  snapshot?: RuleSnapshotLookup,
): SpellDefinition[] =>
  node.maxSpellLevel > 0
    ? []
    : Object.values(snapshot?.spellsById ?? {}).filter(
        (spell) => spell.level === 0,
      );
```

Run: `pnpm --filter @project/engine test`
Expected: PASS, 1017 tests.

- [ ] **Step 3: Pin the authored spells, and watch it fail**

In `packages/database/src/__tests__/implementationMarkers.test.ts`, replace `keeps the spell section's placeholders as placeholders` with:

```ts
  it("keeps the spell section's placeholders as placeholders", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);
    const stubs = pack.spells.filter((spell) => spell.implementation);

    // The marker's summary says level and school are placeholders too, so the
    // claim is checked on the stubs alone: an authored spell has real ones.
    expect([...new Set(stubs.map((spell) => spell.level))]).toEqual([0]);
    expect([...new Set(stubs.map((spell) => spell.school))]).toEqual([
      "evocation",
    ]);
  });

  it("records which spells carry rules", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);

    // 4 of 111 since feat/spell-casting (#31). Add each spell as it is
    // authored; one leaving this list is a regression.
    expect(
      pack.spells
        .filter((spell) => !spell.implementation)
        .map((spell) => spell.id)
        .sort(),
    ).toEqual([
      "spell_burning_hands",
      "spell_dancing_lights",
      "spell_eldritch_blast",
      "spell_faerie_fire",
    ]);
    expect(pack.spells).toHaveLength(111);
  });
```

Run: `DATABASE_URL= pnpm --filter @project/database test -- implementationMarkers`
Expected: FAIL on `records which spells carry rules`, because no spell is authored.

- [ ] **Step 4: Create the segment and list it in the manifest**

From `packages/database`:

```bash
node -e 'require("fs").writeFileSync("data/packs/core_2014_pack/spells/core.json", ["{", "    \"$schema\": \"../../../schemas/segment.schema.json\",", "    \"spells\": []", "}", ""].join("\r\n"))'
node -e 'const fs=require("fs"),f="data/packs/core_2014_pack/manifest.json";const m=JSON.parse(fs.readFileSync(f,"utf8"));m.segments.splice(m.segments.indexOf("spells/unimplemented.json"),0,"spells/core.json");fs.writeFileSync(f,JSON.stringify(m,null,4).split("\n").join("\r\n")+"\r\n")'
git diff --stat data/packs/core_2014_pack/manifest.json
```

Expected: `manifest.json | 1 +`, a single inserted line `"spells/core.json",` before `"spells/unimplemented.json"`. If the diff shows more than one line, `git checkout -- data/packs/core_2014_pack/manifest.json` and stop: NEEDS_CONTEXT.

- [ ] **Step 5: Write the spells and move them**

Write this to the scratchpad as `four-spells.json`. `lore.fullText` is SRD 5.1 wording (CC-BY-4.0; the attribution lands in Task 15). `shortDescription` and `tableNote` are paraphrase.

```json
{
    "upsertSpells": [
        {
            "id": "spell_eldritch_blast",
            "name": "Eldritch Blast",
            "level": 0,
            "school": "evocation",
            "isRitual": false,
            "lore": {
                "shortDescription": "A ranged spell attack for 1d10 force damage. It fires two beams at 5th level, three at 11th and four at 17th, each with its own attack roll.",
                "fullText": "A beam of crackling energy streaks toward a creature within range. Make a ranged spell attack against the target. On a hit, the target takes 1d10 force damage.\n\nThe spell creates more than one beam when you reach higher levels: two beams at 5th level, three beams at 11th level, and four beams at 17th level. You can direct the beams at the same target or at different ones. Make a separate attack roll for each beam."
            },
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
        },
        {
            "id": "spell_dancing_lights",
            "name": "Dancing Lights",
            "level": 0,
            "school": "evocation",
            "isRitual": false,
            "lore": {
                "shortDescription": "Up to four hovering torch-sized lights, or one glowing Medium form, each shedding dim light in a 10-foot radius. Concentration, up to 1 minute.",
                "fullText": "You create up to four torch-sized lights within range, making them appear as torches, lanterns, or glowing orbs that hover in the air for the duration. You can also combine the four lights into one glowing vaguely humanoid form of Medium size. Whichever form you choose, each light sheds dim light in a 10-foot radius.\n\nAs a bonus action on your turn, you can move the lights up to 60 feet to a new spot within range. A light must be within 20 feet of another light created by this spell, and a light winks out if it exceeds the spell's range."
            },
            "range": { "kind": "feet", "feet": 120 },
            "components": {
                "verbal": true,
                "somatic": true,
                "material": true,
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
        },
        {
            "id": "spell_faerie_fire",
            "name": "Faerie Fire",
            "level": 1,
            "school": "evocation",
            "isRitual": false,
            "lore": {
                "shortDescription": "Creatures in a 20-foot cube that fail a Dexterity save are outlined in light: attacks against them have advantage, and they can't benefit from being invisible. Concentration, up to 1 minute.",
                "fullText": "Each object in a 20-foot cube within range is outlined in blue, green, or violet light (your choice). Any creature in the area when the spell is cast is also outlined in light if it fails a Dexterity saving throw. For the duration, objects and affected creatures shed dim light in a 10-foot radius.\n\nAny attack roll against an affected creature or object has advantage if the attacker can see it, and the affected creature or object can't benefit from being invisible."
            },
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
        },
        {
            "id": "spell_burning_hands",
            "name": "Burning Hands",
            "level": 1,
            "school": "evocation",
            "isRitual": false,
            "lore": {
                "shortDescription": "A 15-foot cone of flame: 3d6 fire damage on a failed Dexterity save, half on a success, and 1d6 more for each slot level above 1st.",
                "fullText": "As you hold your hands with thumbs touching and fingers spread, a thin sheet of flames shoots forth from your outstretched fingertips. Each creature in a 15-foot cone must make a Dexterity saving throw. A creature takes 3d6 fire damage on a failed save, or half as much damage on a successful one.\n\nThe fire ignites any flammable objects in the area that aren't being worn or carried.\n\nAt Higher Levels. When you cast this spell using a spell slot of 2nd level or higher, the damage increases by 1d6 for each slot level above 1st."
            },
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
        }
    ]
}
```

And write this as `four-stubs.json`:

```json
{
    "deleteSpellIds": [
        "spell_eldritch_blast",
        "spell_dancing_lights",
        "spell_faerie_fire",
        "spell_burning_hands"
    ]
}
```

From `packages/database`:

```bash
pnpm exec tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/spells/core.json <scratchpad>/four-spells.json
pnpm exec tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/spells/unimplemented.json <scratchpad>/four-stubs.json
```

Expected: two `patched …` lines. `git diff --stat` shows only deletions in `unimplemented.json`: the four stub objects and nothing reindented.

- [ ] **Step 6: Run the suites**

```bash
DATABASE_URL= pnpm --filter @project/database test
pnpm --filter @project/engine test
DATABASE_URL= pnpm --filter @project/server test
pnpm --filter @project/web test
```

Expected: every suite passes. Database 204 (one test added); engine 1017; server 527; web 484.
- **`packSchemas.test`** validates `spells/core.json` through the manifest.
- **Pack assembly** runs Task 3's rules over the four spells, and a failure there names the rule.
- **Engine, server and web** are unchanged apart from rosters: Eldritch Blast and Dancing Lights stay cantrips, and every leveled roster is empty.

- [ ] **Step 7: Commit**

Measure `spells/core.json`, `spells/unimplemented.json` and `manifest.json` (CRLF), and restore CRLF on `spellChoices.ts`, `spellChoices.test.ts` and `implementationMarkers.test.ts`.

```bash
git add packages/engine/src/pipeline/spellChoices.ts packages/engine/src/pipeline/__tests__/spellChoices.test.ts packages/database/src/__tests__/implementationMarkers.test.ts packages/database/data/packs/core_2014_pack/spells packages/database/data/packs/core_2014_pack/manifest.json
git commit -F - <<'EOF'
feat(pack): author Eldritch Blast, Dancing Lights, Faerie Fire and Burning Hands (#31, #31b)

The first four spells with rules, in a new spells/core.json segment. SRD
5.1 wording for their text. A leveled spell choice offers nothing until #31a
gives the pack class lists: without them every wizard would be asked to fill
a spellbook from Faerie Fire and Burning Hands, which is not a question a
wizard can answer.

Co-Authored-By: <your session's attribution>
EOF
```

---

### Task 5: Damage scales with level on every action

**Files:**
- Create: `packages/engine/src/pipeline/actionScaling.ts`
- Create: `packages/engine/src/pipeline/__tests__/actionScaling.test.ts`
- Modify: `packages/engine/src/pipeline/characterEngine.ts:480-492`
- Modify: `packages/engine/src/pipeline/__tests__/characterEngine.test.ts`
- Modify: `packages/engine/src/pipeline/index.ts`

**Interfaces:**
- Produces (exported from `@project/engine`):
  - `interface ScalingLevels { total: number; classes: Record<string, number> }`
  - `resolveSegmentDice(segment: DamageSegment, levels: ScalingLevels): DamageSegment`
  - `resolveActionScaling(action: ActionGrant, levels: ScalingLevels): ActionGrant`
  - `upcastDice(segment: DamageSegment, spellCast: { spellLevel: number; castLevel: number } | undefined): string`

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/src/pipeline/__tests__/actionScaling.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ActionGrant, DamageSegment } from "@project/shared";
import {
  resolveActionScaling,
  resolveSegmentDice,
  upcastDice,
} from "../actionScaling.js";

const breath: DamageSegment = {
  sourceName: "Black Dragon Breath",
  baseDice: "2d6",
  damageType: "acid",
  scalingMode: "total_level",
  levelScaling: [
    { levelRequired: 6, newDice: "3d6" },
    { levelRequired: 11, newDice: "4d6" },
    { levelRequired: 16, newDice: "5d6" },
  ],
};

const at = (total: number, classes: Record<string, number> = {}) => ({
  total,
  classes,
});

describe("resolveSegmentDice", () => {
  it.each([
    [1, "2d6"],
    [5, "2d6"],
    [6, "3d6"],
    [11, "4d6"],
    [20, "5d6"],
  ])("rolls a level-%i breath as %s", (level, dice) => {
    expect(resolveSegmentDice(breath, at(level)).baseDice).toBe(dice);
  });

  it("reads one class's level for a class-scaled segment", () => {
    const segment: DamageSegment = {
      ...breath,
      scalingMode: "class_level",
      scalingClassId: "class_monk",
    };

    expect(resolveSegmentDice(segment, at(11, { class_monk: 5 })).baseDice).toBe("2d6");
    expect(resolveSegmentDice(segment, at(11, { class_monk: 6 })).baseDice).toBe("3d6");
  });

  it("leaves an unscaled segment exactly as it is", () => {
    const flat: DamageSegment = { ...breath, scalingMode: "none" };

    expect(resolveSegmentDice(flat, at(20))).toBe(flat);
  });

  it("never writes through to the segment it was given", () => {
    resolveSegmentDice(breath, at(20));

    expect(breath.baseDice).toBe("2d6");
  });
});

describe("resolveActionScaling", () => {
  const breathWeapon: ActionGrant = {
    id: "action_black_breath",
    name: "Breath Weapon",
    activation: "action",
    effect: {
      type: "save",
      savingThrow: {
        targetStat: "DEX",
        dcCalculation: { base: 8, scalingStat: "CON", includeProficiency: true },
        saveEffect: "half_damage",
      },
      damage: [breath],
    },
  };

  it("scales a save's damage and leaves the pack's action untouched", () => {
    const resolved = resolveActionScaling(breathWeapon, at(11));

    expect(resolved.effect.type === "save" && resolved.effect.damage?.[0]?.baseDice).toBe("4d6");
    expect(breathWeapon.effect.type === "save" && breathWeapon.effect.damage?.[0]?.baseDice).toBe("2d6");
  });

  it("scales the effects inside a macro", () => {
    if (breathWeapon.effect.type !== "save") throw new Error("expected a save");
    const macro: ActionGrant = {
      ...breathWeapon,
      effect: { type: "macro", effects: [breathWeapon.effect] },
    };
    const resolved = resolveActionScaling(macro, at(16));
    const nested =
      resolved.effect.type === "macro" ? resolved.effect.effects[0] : undefined;

    expect(nested?.type === "save" && nested.damage?.[0]?.baseDice).toBe("5d6");
  });
});

describe("upcastDice", () => {
  const burning: DamageSegment = {
    sourceName: "Burning Hands",
    baseDice: "3d6",
    damageType: "fire",
    scalingMode: "none",
    levelScaling: [],
    perSlotAbove: "1d6",
  };
  const plain: DamageSegment = {
    sourceName: "Burning Hands",
    baseDice: "3d6",
    damageType: "fire",
    scalingMode: "none",
    levelScaling: [],
  };

  it("adds a die per slot level above the spell's own", () => {
    expect(upcastDice(burning, { spellLevel: 1, castLevel: 1 })).toBe("3d6");
    expect(upcastDice(burning, { spellLevel: 1, castLevel: 3 })).toBe("5d6");
  });

  it("keeps a flat modifier", () => {
    expect(upcastDice({ ...burning, baseDice: "3d6+2" }, { spellLevel: 1, castLevel: 2 })).toBe("4d6+2");
  });

  it("adds nothing without a cast, or without dice to add", () => {
    expect(upcastDice(burning, undefined)).toBe("3d6");
    expect(upcastDice(plain, { spellLevel: 1, castLevel: 3 })).toBe("3d6");
  });
});
```

Append to `packages/engine/src/pipeline/__tests__/characterEngine.test.ts`:

```ts
describe("CharacterEngine.buildLiveSheet: trait actions scale with level", () => {
  const dragonborn = (level: number): CharacterSave => ({
    ...halfElfFighter({ traitSelections: {} }),
    race: {
      baseRaceId: "race_dragonborn",
      hasSubraces: true,
      subraceId: "subrace_dragonborn_black",
    },
    classes: [
      {
        classId: "class_fighter",
        level,
        selections: { fighter_level_1_fighting_style: ["trait_fs_defense"] },
      },
    ],
  });

  const breathDice = (level: number) => {
    const action = buildSheet(dragonborn(level)).actions.find(
      (entry) => entry.id === "action_black_breath",
    );
    return action?.effect.type === "save"
      ? action.effect.damage?.[0]?.baseDice
      : undefined;
  };

  it.each([
    [5, "2d6"],
    [6, "3d6"],
    [11, "4d6"],
    [16, "5d6"],
  ])("a level-%i dragonborn breathes %s", (level, dice) => {
    expect(breathDice(level)).toBe(dice);
  });

  it("leaves the pack's breath weapon at its base dice", () => {
    breathDice(16);
    const effect =
      corePackSnapshot().traitsById.subrace_dragonborn_black?.actions?.[0]?.effect;

    expect(effect?.type === "save" && effect.damage?.[0]?.baseDice).toBe("2d6");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @project/engine test -- actionScaling characterEngine`
Expected: FAIL. `actionScaling.js` does not exist, and every dragonborn still breathes 2d6.

- [ ] **Step 3: Implement `actionScaling.ts`**

Create `packages/engine/src/pipeline/actionScaling.ts`:

```ts
import type { ActionGrant, DamageSegment } from "@project/shared";
import { DiceEngine } from "../utils/diceParser.js";

/** The levels a damage segment can scale by: the character's, and each class's. */
export interface ScalingLevels {
  total: number;
  classes: Record<string, number>;
}

/**
 * The dice a segment rolls at these levels.
 *
 * `levelScaling` names the dice from each threshold on; the highest threshold
 * reached wins, and below every one the segment keeps its `baseDice`.
 * `scalingMode` says whose level counts: the character's for `total_level`
 * (a cantrip, a dragonborn's breath), one class's for the class modes.
 *
 * Returns the segment itself when nothing changes, and a copy otherwise:
 * segments come from pack data, which is never written through.
 * @param segment The authored segment
 * @param levels The character's total level and each class's
 * @returns The segment with the dice for these levels
 */
export const resolveSegmentDice = (
  segment: DamageSegment,
  levels: ScalingLevels,
): DamageSegment => {
  if (segment.scalingMode === "none" || segment.levelScaling.length === 0) {
    return segment;
  }

  const level =
    segment.scalingMode === "total_level"
      ? levels.total
      : (levels.classes[segment.scalingClassId ?? ""] ?? 0);

  let dice = segment.baseDice;
  let reached = 0;
  for (const step of segment.levelScaling) {
    if (step.levelRequired <= level && step.levelRequired >= reached) {
      dice = step.newDice;
      reached = step.levelRequired;
    }
  }

  return dice === segment.baseDice ? segment : { ...segment, baseDice: dice };
};

type CoreEffect = Exclude<ActionGrant["effect"], { type: "macro" }>;

const scaleEffect = (effect: CoreEffect, levels: ScalingLevels): CoreEffect => {
  const scale = (segments: DamageSegment[]) =>
    segments.map((segment) => resolveSegmentDice(segment, levels));

  switch (effect.type) {
    case "attack":
      return { ...effect, damage: scale(effect.damage) };
    case "damage_rider":
      return { ...effect, damage: scale(effect.damage) };
    case "save":
      return effect.damage === undefined
        ? effect
        : { ...effect, damage: scale(effect.damage) };
    default:
      return effect;
  }
};

/**
 * An action with every damage segment at the dice for these levels.
 *
 * Resolved when the sheet is built, not when the dice are rolled, for the
 * reason weapons are: the resolver has no levels to read. A dragonborn's
 * breath weapon authors 2d6 with a ladder to 5d6, and until this ran it rolled
 * 2d6 at every level.
 * @param action The authored action
 * @param levels The character's total level and each class's
 * @returns A copy of the action, scaled; the pack's copy is untouched
 */
export const resolveActionScaling = (
  action: ActionGrant,
  levels: ScalingLevels,
): ActionGrant => ({
  ...action,
  effect:
    action.effect.type === "macro"
      ? {
          ...action.effect,
          effects: action.effect.effects.map((nested) =>
            scaleEffect(nested, levels),
          ),
        }
      : scaleEffect(action.effect, levels),
});

/**
 * A segment's dice at the slot it is cast with: `perSlotAbove` added once per
 * slot level above the spell's own (Burning Hands from a 3rd-level slot: 5d6).
 * Pack validation keeps `perSlotAbove` plain dice of the segment's die size,
 * which is what makes adding the counts correct.
 * @param segment The damage segment
 * @param spellCast The spell's level and the slot's, when a slot pays for it
 * @returns The dice expression to roll
 */
export const upcastDice = (
  segment: DamageSegment,
  spellCast: { spellLevel: number; castLevel: number } | undefined,
): string => {
  const levelsAbove = spellCast ? spellCast.castLevel - spellCast.spellLevel : 0;
  if (segment.perSlotAbove === undefined || levelsAbove <= 0) {
    return segment.baseDice;
  }

  const base = DiceEngine.parse(segment.baseDice);
  const extra = DiceEngine.parse(segment.perSlotAbove);
  const count = base.count + extra.count * levelsAbove;
  const modifier =
    base.modifier === 0
      ? ""
      : base.modifier > 0
        ? `+${base.modifier}`
        : `${base.modifier}`;

  return `${count}d${base.sides}${modifier}`;
};
```

- [ ] **Step 4: Scale trait actions on the live sheet**

In `packages/engine/src/pipeline/characterEngine.ts`, add to the imports:

```ts
import { resolveActionScaling } from "./actionScaling.js";
```

In the `// 1 - synthesize actions` region, change the trait-action spread so that each trait action is scaled:

```ts
      ...activeTraits.flatMap((t) =>
        (t.actions || [])
          .filter((action) => action.effect.type !== "dynamic_weapon_attack")
          // every damage die at this character's level: a breath weapon's
          // ladder was authored and never read
          .map((action) =>
            resolveActionScaling(action, { total: totalLevel, classes: classLevels }),
          ),
      ),
```

`totalLevel` and `classLevels` are both already in scope above this region, at lines 347 and 441.

In `packages/engine/src/pipeline/index.ts`, add:

```ts
export * from "./actionScaling.js";
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm --filter @project/engine test
pnpm --filter @project/engine typecheck
```

Expected: engine passes 1035 (13 in `actionScaling.test.ts` plus 5 in `characterEngine.test.ts`), and the typecheck is clean.

- [ ] **Step 6: Restore line endings, then commit**

```bash
git add packages/engine/src/pipeline/actionScaling.ts packages/engine/src/pipeline/__tests__/actionScaling.test.ts packages/engine/src/pipeline/characterEngine.ts packages/engine/src/pipeline/__tests__/characterEngine.test.ts packages/engine/src/pipeline/index.ts
git commit -F - <<'EOF'
fix(engine): damage dice scale with level on every trait action

levelScaling was authored on the ten dragonborn breath weapons and read by
nothing; every breath rolled 2d6. resolveActionScaling resolves it when the
sheet is built, and upcastDice is the cast-time half the spell resolver will
use.

Co-Authored-By: <your session's attribution>
EOF
```

---

### Task 6: The resolver rolls beams, upcasts, and asks targets for their save

**Files:**
- Modify: `packages/engine/src/pipeline/actionResolver.ts`
- Modify: `packages/engine/src/pipeline/__tests__/actionResolver.test.ts:743-793`

**Interfaces:**
- Consumes: `upcastDice` (Task 5); `repeat`/`repeatCount`, `perSlotAbove` and `savingThrow.dc` (Task 1).
- Produces:
  - `export interface TargetSave { ability: Ability; dc: number; onSuccess: "half_damage" | "no_damage" | "negates_effect"; area?: AreaOfEffect; label: string }`
  - `ActionResult.targetSaves?: TargetSave[]`
  - `ActionExecutionContext.spellCast?: { spellLevel: number; castLevel: number }`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/src/pipeline/__tests__/actionResolver.test.ts`, add `corePackSnapshot` to the `./corePackFixture.js` import, and replace the whole `describe("ActionResolver save resolution", …)` block (lines 743-793) with:

```ts
describe("ActionResolver save resolution", () => {
  let effectManager: EffectManager;
  let resourceManager: ResourceManager;

  beforeEach(() => {
    effectManager = new EffectManager();
    resourceManager = new ResourceManager();
  });

  const abilityScores = { STR: 10, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 10 };

  const fireDamage = {
    sourceName: "Test Fire",
    baseDice: "3d6",
    damageType: "fire" as const,
    scalingMode: "none" as const,
    levelScaling: [],
    perSlotAbove: "1d6",
  };

  const fire = (
    options: { dc?: number; damage?: boolean } = {},
  ): ActionGrant => ({
    id: "action_test_fire",
    name: "Test Fire",
    activation: "action",
    effect: {
      type: "save",
      areaOfEffect: { shape: "cone", size: 15 },
      savingThrow: {
        targetStat: "DEX",
        dcCalculation: { base: 8, scalingStat: "CON", includeProficiency: true },
        saveEffect: "half_damage",
        ...(options.dc !== undefined && { dc: options.dc }),
      },
      ...(options.damage !== false && { damage: [fireDamage] }),
    },
  });

  it("asks the targets for a save instead of rolling the caster's own", () => {
    const result = ActionResolver.execute(fire(), payload(), {
      effectManager,
      resourceManager,
      abilityScores,
      proficiencyBonus: 3,
    });

    expect(result.targetSaves).toEqual([
      {
        ability: "DEX",
        dc: 13,
        onSuccess: "half_damage",
        area: { shape: "cone", size: 15 },
        label: "Test Fire",
      },
    ]);
    expect(
      result.rollResults?.some((roll) => roll.target === "SAVING_THROW"),
    ).toBe(false);
  });

  it("uses a DC resolved ahead of the roll", () => {
    const result = ActionResolver.execute(fire({ dc: 15 }), payload(), {
      effectManager,
      resourceManager,
      abilityScores,
      proficiencyBonus: 3,
    });

    expect(result.targetSaves?.[0]?.dc).toBe(15);
  });

  it("rolls the save's damage once", () => {
    const result = ActionResolver.execute(fire(), payload(), {
      effectManager,
      resourceManager,
    });

    expect(result.rollResults).toHaveLength(1);
    expect(result.rollResults?.[0]).toMatchObject({
      target: "DAMAGE_ROLL",
      damageType: "fire",
    });
    expect(result.rollResults?.[0]?.rolls).toHaveLength(3);
  });

  it("adds a die for every slot level above the spell's own", () => {
    const result = ActionResolver.execute(fire(), payload(), {
      effectManager,
      resourceManager,
      spellCast: { spellLevel: 1, castLevel: 3 },
    });

    expect(result.rollResults?.[0]?.rolls).toHaveLength(5);
  });

  it("rolls nothing for a save that deals no damage", () => {
    const result = ActionResolver.execute(fire({ damage: false }), payload(), {
      effectManager,
      resourceManager,
    });

    expect(result.rollResults ?? []).toEqual([]);
    expect(result.targetSaves).toHaveLength(1);
  });

  // it used to roll the barbarian's own Wisdom save against their own DC
  it("asks Intimidating Presence's target for a Wisdom save, and rolls nothing", () => {
    const presence = Object.values(corePackSnapshot().traitsById)
      .flatMap((trait) => trait.actions ?? [])
      .find((action) => action.id === "action_intimidating_presence")!;

    const result = ActionResolver.execute(presence, payload(), {
      effectManager,
      resourceManager,
      abilityScores: { ...abilityScores, CHA: 16 },
      proficiencyBonus: 3,
    });

    expect(result.rollResults ?? []).toEqual([]);
    expect(result.targetSaves).toEqual([
      expect.objectContaining({ ability: "WIS", dc: 14, onSuccess: "negates_effect" }),
    ]);
  });
});

describe("ActionResolver repeated attacks", () => {
  let effectManager: EffectManager;
  let resourceManager: ResourceManager;

  beforeEach(() => {
    effectManager = new EffectManager();
    resourceManager = new ResourceManager();
  });

  const force = (baseDice: string) => ({
    sourceName: "Eldritch Blast",
    baseDice,
    damageType: "force" as const,
    scalingMode: "none" as const,
    levelScaling: [],
  });

  const beams = (count: number): ActionGrant => ({
    id: "action_spell_eldritch_blast@class_warlock",
    name: "Eldritch Blast",
    activation: "action",
    effect: {
      type: "attack",
      attackType: "ranged_spell",
      attackStat: "CHA",
      range: 120,
      attackBonus: 5,
      repeat: {
        label: "Beam",
        thresholds: [
          { minimumLevel: 1, value: 1 },
          { minimumLevel: 5, value: 2 },
        ],
      },
      repeatCount: count,
      damage: [force("1d10")],
      criticalDamage: [force("2d10")],
    },
  });

  it("rolls an attack and its damage for every beam, each labelled", () => {
    const result = ActionResolver.execute(beams(2), payload(), {
      effectManager,
      resourceManager,
    });

    expect(result.rollResults?.map((roll) => [roll.target, roll.label])).toEqual([
      ["ATTACK_ROLL", "Beam 1"],
      ["DAMAGE_ROLL", "Beam 1"],
      ["ATTACK_ROLL", "Beam 2"],
      ["DAMAGE_ROLL", "Beam 2"],
    ]);
  });

  it("checks each beam for a critical hit on its own", () => {
    const random = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.999) // beam 1 attack: 20
      .mockReturnValueOnce(0.5) // beam 1 damage, first of 2d10
      .mockReturnValueOnce(0.5) // beam 1 damage, second of 2d10
      .mockReturnValueOnce(0) // beam 2 attack: 1
      .mockReturnValueOnce(0.5); // beam 2 damage: 1d10

    const result = ActionResolver.execute(beams(2), payload(), {
      effectManager,
      resourceManager,
    });

    expect(
      result.rollResults
        ?.filter((roll) => roll.target === "DAMAGE_ROLL")
        .map((roll) => roll.rolls.length),
    ).toEqual([2, 1]);

    random.mockRestore();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @project/engine test -- actionResolver`
Expected: FAIL. `targetSaves` is undefined, the save still rolls `SAVING_THROW`, and only one attack rolls, with no label. (`spellCast` is also an unknown context key, which only the typecheck notices.)

- [ ] **Step 3: Implement**

In `packages/engine/src/pipeline/actionResolver.ts`:

Extend the imports from `@project/shared` with `type AreaOfEffect, type AttackEffect, type DamageSegment,`, and add:

```ts
import { upcastDice } from "./actionScaling.js";
```

After `ActionRollResult`, add:

```ts
/**
 * A saving throw an action asks of its targets: the ability, the caster's DC,
 * what a success does, and where. The sheet models one character, so the
 * roll belongs to the table; this is what the table needs to make it.
 */
export interface TargetSave {
  ability: Ability;
  dc: number;
  onSuccess: "half_damage" | "no_damage" | "negates_effect";
  area?: AreaOfEffect;
  label: string;
}
```

In `ActionResult`, after `notes`, add:

```ts
  /**
   * Saving throws this action asks of its targets. On the result rather than
   * as an ActionRollResult because nothing was rolled: the DC is the
   * caster's, and the roll belongs to whoever is caught in it.
   */
  targetSaves?: TargetSave[];
```

In `ActionExecutionContext`, after `proficiencyBonus`, add:

```ts
  /**
   * The spell being cast and the slot paying for it. Each damage segment with
   * `perSlotAbove` adds that expression once per level the slot sits above
   * the spell. Absent for anything a slot did not pay for.
   */
  spellCast?: { spellLevel: number; castLevel: number };
```

Add these two private helpers to the class, directly after `resolveTargetRoll`:

```ts
  /**
   * One damage segment, rolled: upcast dice added, maximised when the segment
   * or the critical rule says so, and passed through the character's dice
   * rules.
   */
  private static rollDamageSegment(
    segment: DamageSegment,
    context: ActionExecutionContext,
    activeStates: string[],
    options: { maximize?: boolean; bonus?: number; label?: string } = {},
  ): ActionRollResult {
    const dice = upcastDice(segment, context.spellCast);
    const { sides } = DiceEngine.parse(dice);
    const roll =
      segment.maximized || options.maximize
        ? DiceEngine.rollMaximized(dice)
        : DiceEngine.rollDigital(dice);
    const resolvedRoll = this.resolveTargetRoll(
      roll,
      "DAMAGE_ROLL",
      context,
      activeStates,
      sides,
      segment.damageType,
    );

    return {
      total: resolvedRoll.total + (options.bonus ?? 0),
      rolls: resolvedRoll.rolls,
      modifier: options.bonus !== undefined ? options.bonus : roll.modifier,
      target: "DAMAGE_ROLL",
      damageType: segment.damageType,
      ...(options.label !== undefined && { label: options.label }),
    };
  }

  /**
   * One attack roll and its damage. A critical hit rolls the pool resolved for
   * it ahead of the roll - already doubled, carrying whatever critical-hit
   * modifiers matched - and an action with none falls back to its base dice.
   */
  private static rollAttack(
    effect: AttackEffect,
    context: ActionExecutionContext,
    activeStates: string[],
    label: string | undefined,
  ): ActionRollResult[] {
    const attackBonus = effect.attackBonus ?? 0;
    const damageBonus = effect.damageBonus ?? 0;

    const attackRoll = DiceEngine.rollDigital("1d20");
    const isCriticalHit = attackRoll.rolls[0] === 20;
    const resolvedAttackRoll = this.resolveTargetRoll(
      attackRoll,
      "ATTACK_ROLL",
      context,
      activeStates,
      20,
    );

    const results: ActionRollResult[] = [
      {
        total: resolvedAttackRoll.total + attackBonus,
        rolls: resolvedAttackRoll.rolls,
        modifier: attackBonus,
        target: "ATTACK_ROLL",
        ...(label !== undefined && { label }),
      },
    ];

    const segments =
      isCriticalHit && effect.criticalDamage?.length
        ? effect.criticalDamage
        : effect.damage;

    segments.forEach((segment, index) => {
      results.push(
        this.rollDamageSegment(segment, context, activeStates, {
          ...(isCriticalHit &&
            effect.criticalDamageMaximized === true && { maximize: true }),
          ...(index === 0 && { bonus: damageBonus }),
          ...(label !== undefined && { label }),
        }),
      );
    });

    return results;
  }
```

Replace the whole `case "attack": { … }` block with:

```ts
      case "attack": {
        const resolvedActiveStates =
          activeStates.length > 0 ? activeStates : (context.activeStates ?? []);
        // a repeat rolls whole attacks - Eldritch Blast's beams - each with
        // its own d20, its own critical check and its own damage
        const count = effect.repeatCount ?? 1;
        const rollResults: ActionRollResult[] = [];
        for (let beam = 1; beam <= count; beam += 1) {
          rollResults.push(
            ...this.rollAttack(
              effect,
              context,
              resolvedActiveStates,
              effect.repeat ? `${effect.repeat.label} ${beam}` : undefined,
            ),
          );
        }

        return { ...ok, rollResults };
      }
```

Replace the whole `case "damage_rider": { … }` block with:

```ts
      case "damage_rider": {
        const resolvedActiveStates =
          activeStates.length > 0 ? activeStates : (context.activeStates ?? []);

        return {
          ...ok,
          rollResults: effect.damage.map((segment) =>
            this.rollDamageSegment(segment, context, resolvedActiveStates),
          ),
        };
      }
```

Replace the whole `case "save": { … }` block with:

```ts
      case "save": {
        const resolvedActiveStates =
          activeStates.length > 0 ? activeStates : (context.activeStates ?? []);
        const { targetStat, dcCalculation, saveEffect, dc: resolvedDc } =
          effect.savingThrow;

        // the targets make this save, not the character. It used to roll the
        // character's own save modifier against their own DC - for every
        // breath weapon and for Intimidating Presence - and roll no damage
        const scalingScore =
          context.abilityScores?.[dcCalculation.scalingStat as Ability] ?? 10;
        const dc =
          resolvedDc ??
          dcCalculation.base +
            Math.floor((scalingScore - 10) / 2) +
            (dcCalculation.includeProficiency
              ? (context.proficiencyBonus ?? 0)
              : 0);

        const targetSave: TargetSave = {
          ability: targetStat as Ability,
          dc,
          onSuccess: saveEffect,
          label: action.name,
          ...(effect.areaOfEffect !== undefined && { area: effect.areaOfEffect }),
        };
        const rollResults = (effect.damage ?? []).map((segment) =>
          this.rollDamageSegment(segment, context, resolvedActiveStates),
        );

        return {
          ...ok,
          targetSaves: [targetSave],
          ...(rollResults.length > 0 && { rollResults }),
        };
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @project/engine test
pnpm --filter @project/engine typecheck
DATABASE_URL= pnpm --filter @project/server test
```

Expected:
- Engine passes 1042 and its typecheck is clean.
- Server passes 527: no server test asserts a save's roll, and the gateway still reads `rollResults` only through `"rollResults" in execution`.
- If an existing attack test in `actionResolver.test.ts` fails, compare it against the original `case "attack"` (`git show HEAD:packages/engine/src/pipeline/actionResolver.ts`). The helpers must reproduce it exactly for an action with no `repeat`.

- [ ] **Step 5: Restore line endings, then commit**

```bash
git add packages/engine/src/pipeline/actionResolver.ts packages/engine/src/pipeline/__tests__/actionResolver.test.ts
git commit -F - <<'EOF'
fix(engine): a save asks its targets instead of rolling the caster's own; beams and upcasting

A save effect rolled the character's own save against their own DC and
never rolled its damage - the ten breath weapons and Intimidating Presence.
It now reports a targetSaves entry and rolls its damage once. An attack with
a repeatCount rolls every beam whole, and a spellCast in the context adds
perSlotAbove dice per slot level.

Co-Authored-By: <your session's attribution>
EOF
```

---

### Task 7: Macros keep their rolls; concentration can be ended

**Files:**
- Modify: `packages/engine/src/pipeline/actionResolver.ts`
- Modify: `packages/engine/src/calculators/effects.ts:120-126`
- Modify: `packages/shared/src/standardActions.ts`
- Modify: `packages/engine/src/pipeline/__tests__/actionResolver.test.ts`
- Modify: `packages/engine/src/calculators/__tests__/effects.test.ts`
- Modify: `packages/shared/src/__tests__/standardActions.test.ts`

**Interfaces:**
- Consumes: `EndConcentrationEffectSchema` (Task 1) and `TargetSave` (Task 6).
- Produces:
  - `STANDARD_ACTIONS` gains `{ id: "action_end_concentration", name: "End Concentration", activation: "special", effect: { type: "end_concentration" } }`.
  - a `macro` result carries its nested effects' `rollResults`, `targetSaves` and `notes`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/engine/src/pipeline/__tests__/actionResolver.test.ts`, and add `STANDARD_ACTIONS` to its `@project/shared` import:

```ts
describe("ActionResolver macros and concentration", () => {
  let effectManager: EffectManager;
  let resourceManager: ResourceManager;

  beforeEach(() => {
    effectManager = new EffectManager();
    resourceManager = new ResourceManager();
  });

  const concentrate = (name: string) => ({
    type: "apply_effect" as const,
    effectName: name,
    durationType: "rounds" as const,
    durationRounds: 10,
    isSelfConcentration: true,
    modifiers: [],
    states: [],
    requiredStates: [],
    forbiddenStates: [],
  });

  const faerieFire: ActionGrant = {
    id: "action_spell_faerie_fire@drow_magic",
    name: "Faerie Fire",
    activation: "action",
    tableNote: "Outlined in light.",
    effect: {
      type: "macro",
      effects: [
        {
          type: "save",
          savingThrow: {
            targetStat: "DEX",
            dcCalculation: { base: 8, scalingStat: "CHA", includeProficiency: true },
            saveEffect: "negates_effect",
            dc: 12,
          },
        },
        concentrate("Faerie Fire"),
      ],
    },
  };

  const dancingLights: ActionGrant = {
    id: "action_spell_dancing_lights@drow_magic",
    name: "Dancing Lights",
    activation: "action",
    effect: concentrate("Dancing Lights"),
  };

  const endConcentration = STANDARD_ACTIONS.find(
    (action) => action.id === "action_end_concentration",
  )!;

  it("keeps a macro's nested save and applies its nested effect", () => {
    const result = ActionResolver.execute(faerieFire, payload(), {
      effectManager,
      resourceManager,
    });

    expect(result.targetSaves).toEqual([
      expect.objectContaining({ ability: "DEX", dc: 12, onSuccess: "negates_effect" }),
    ]);
    expect(result.notes).toEqual(["Outlined in light."]);
    expect(effectManager.getActiveEffects()).toEqual([
      expect.objectContaining({ sourceName: "Faerie Fire", isSelfConcentration: true }),
    ]);
  });

  it("ends one concentration spell by casting another", () => {
    const context = { effectManager, resourceManager };
    ActionResolver.execute(dancingLights, payload(), context);
    ActionResolver.execute(faerieFire, payload(), context);

    expect(effectManager.getActiveEffects().map((effect) => effect.sourceName)).toEqual([
      "Faerie Fire",
    ]);
  });

  it("ends concentration on its own, and nothing else", () => {
    effectManager.addEffect({
      instanceId: "effect_rage",
      sourceName: "Rage",
      durationType: "manual",
      isSelfConcentration: false,
      modifiers: [],
      grantedStates: ["status_raging"],
    });
    ActionResolver.execute(dancingLights, payload(), { effectManager, resourceManager });

    const result = ActionResolver.execute(endConcentration, payload(), {
      effectManager,
      resourceManager,
    });

    expect(result.executed).toBe(true);
    expect(effectManager.getActiveEffects().map((effect) => effect.sourceName)).toEqual([
      "Rage",
    ]);
  });
});
```

Append to `packages/engine/src/calculators/__tests__/effects.test.ts`, and import `type ActorInstance` from `@project/shared`:

```ts
describe("dropConcentration", () => {
  it("takes the actors a concentration effect brought with it", () => {
    const manager = new EffectManager();
    const effect = makeEffect({ isSelfConcentration: true });
    const actor: ActorInstance = {
      instanceId: `${effect.instanceId}:actor_steed:0`,
      templateId: "actor_steed",
      displayLabel: "Steed",
      controller: "player",
      lifecycleState: "active",
      currentStates: [],
      availableActions: [],
      statusSummary: "Active steed",
      sourceEffectInstanceId: effect.instanceId,
    };
    manager.addEffect(effect);
    manager.addActor(actor);

    manager.dropConcentration();

    expect(manager.getActiveEffects()).toEqual([]);
    expect(manager.getActiveActors()).toEqual([]);
  });
});
```

(If `ActorInstance` requires a field not listed, copy it from `buildActiveActors` in `characterEngine.ts:182-229`, which builds the same type.)

Append to `packages/shared/src/__tests__/standardActions.test.ts`:

```ts
describe("End Concentration", () => {
  const end = byId("action_end_concentration");

  // "no action required" (PHB p.203): ending concentration costs nothing
  it("is free, and ends concentration", () => {
    expect(end?.activation).toBe("special");
    expect(end?.effect).toEqual({ type: "end_concentration" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @project/engine test -- actionResolver effects
pnpm --filter @project/shared test -- standardActions
```

Expected: FAIL.
- The macro test gets no `targetSaves`.
- `endConcentration` is undefined, so `execute` throws on it.
- `dropConcentration` leaves the actor behind.
- The shared test finds no such action.

- [ ] **Step 3: Implement**

In `packages/engine/src/calculators/effects.ts`, replace `dropConcentration` with:

```ts
  /**
   * Drops whatever the character is concentrating on, and any actor that
   * effect brought with it - as removeEffect does.
   */
  public dropConcentration(): void {
    for (const [id, effect] of this.effects.entries()) {
      if (effect.isSelfConcentration) {
        this.effects.delete(id);
        this.removeActorsForEffect(id);
      }
    }
  }
```

In `packages/engine/src/pipeline/actionResolver.ts`, replace the `case "macro": { … }` block with:

```ts
      case "macro": {
        // a macro is one action, so what its parts produced is the action's:
        // Faerie Fire's save line and its concentration are one cast
        const rollResults: ActionRollResult[] = [];
        const targetSaves: TargetSave[] = [];
        const notes: string[] = [];

        for (const nestedEffect of effect.effects) {
          const nestedResult = this.executeEffect(
            nestedEffect,
            action,
            context,
            activeStates,
          );
          if (!nestedResult.executed) return nestedResult;

          rollResults.push(...(nestedResult.rollResults ?? []));
          targetSaves.push(...(nestedResult.targetSaves ?? []));
          notes.push(...(nestedResult.notes ?? []));
        }

        return {
          ...ok,
          ...(rollResults.length > 0 && { rollResults }),
          ...(targetSaves.length > 0 && { targetSaves }),
          ...(notes.length > 0 && { notes }),
        };
      }
```

and add, directly after the `case "remove_effect": … return ok;` lines:

```ts
      case "end_concentration":
        context.effectManager.dropConcentration();
        return ok;
```

In `packages/shared/src/standardActions.ts`, directly after the `action_end_hiding` entry, add:

```ts
  {
    // "no action required" (PHB p.203). Offered beside the concentration
    // effect in Active effects, the way Stop Hiding is offered beside hidden
    id: "action_end_concentration",
    name: "End Concentration",
    activation: "special",
    effect: { type: "end_concentration" },
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @project/shared test
pnpm --filter @project/engine test
DATABASE_URL= pnpm --filter @project/database test
DATABASE_URL= pnpm --filter @project/server test
pnpm --filter @project/web test
pnpm --filter @project/shared typecheck
pnpm --filter @project/engine typecheck
```

Expected: shared 260, engine 1046, database 204, server 527 and web 484 pass, and both typechecks are clean. `tableNotes.test.ts` walks `STANDARD_ACTIONS` for the states their effects grant; `end_concentration` grants none.

- [ ] **Step 5: Restore line endings, then commit**

```bash
git add packages/engine/src/pipeline/actionResolver.ts packages/engine/src/calculators/effects.ts packages/shared/src/standardActions.ts packages/engine/src/pipeline/__tests__/actionResolver.test.ts packages/engine/src/calculators/__tests__/effects.test.ts packages/shared/src/__tests__/standardActions.test.ts
git commit -F - <<'EOF'
feat(engine): a macro keeps its parts' rolls; End Concentration is a standard action

A macro ran its nested effects and threw away what they rolled, so Faerie
Fire's save would never have reached the sheet. End Concentration is free
and sits beside Stop Hiding; dropConcentration now takes a concentration
effect's actors with it, as removeEffect does.

Co-Authored-By: <your session's attribution>
EOF
```

---

### Task 8: The spell synthesizer puts spells on the live sheet

**Files:**
- Modify: `packages/engine/src/calculators/spellcasting.ts`
- Create: `packages/engine/src/pipeline/spellSynthesizer.ts`
- Create: `packages/engine/src/pipeline/__tests__/spellSynthesizer.test.ts`
- Modify: `packages/engine/src/pipeline/characterEngine.ts`
- Modify: `packages/engine/src/pipeline/__tests__/characterEngine.test.ts`
- Modify: `packages/engine/src/pipeline/index.ts`
- Delete: `packages/engine/src/calculators/spellbook.ts`, `packages/engine/src/types/spells.ts`

**Interfaces:**
- Consumes:
  - Task 1's spell fields
  - Task 2's `Spellcasting.preparation` / `focusCategories` and `spellSlot`
  - Task 5's `resolveSegmentDice` / `ScalingLevels`
  - the existing helpers `spellChoiceEntries`, `classTraitIds`, `raceTraitIds`, `backgroundTraitIds`, `featTraitIds`, `collectCastingSources`, `classLevelsAndSubclassIds` and `CharacterBootstrapper.compileActiveTraits`
- Produces (exported from `@project/engine`):

```ts
export const pactSlotLevel: (warlockLevel: number) => number;            // calculators/spellcasting.ts
SpellcastingEngine.numbersFor(ability, abilityScores, profBonus, modifiers, activeStates?)
  : { modifier: number; saveDc: number; attackBonus: number; breakdown: string };

export type SpellSource =
  | { kind: "class"; classId: string; label: string }
  | { kind: "trait"; traitId: string; label: string };
export type SpellPayment =
  | { kind: "at_will" } | { kind: "slot" } | { kind: "resource"; resourceId: string };
export interface SlotPool { resourceId: string; level: number }
export interface CastableSpell {
  spellId: string; name: string; level: number; school: SpellDefinition["school"];
  lore?: Lore; range?: SpellRange; components?: SpellComponents; duration?: SpellDuration;
  activation: ActionActivation; source: SpellSource;
  ability?: Ability; attackBonus?: number; saveDc?: number;
  payment: SpellPayment; preparationTracked: boolean;
  focusCategories: SpellcastingFocusCategory[]; actionId?: string;
}
export interface SpellSynthesisInput {
  save: CharacterSave; snapshot?: RuleSnapshotLookup;
  abilityScores: Record<Ability, number>; proficiencyBonus: number;
  modifiers: RuntimeModifier[]; activeStates: string[];
}
export interface SpellSynthesis { spells: CastableSpell[]; actions: ActionGrant[]; slotPools: SlotPool[] }
export const synthesizeSpells: (input: SpellSynthesisInput) => SpellSynthesis;
```

- `LiveCharacterSheet` gains `spells: CastableSpell[]` and `slotPools: SlotPool[]`, and its `actions` include every implemented spell's resolved action, id `${spell.action.id}@${sourceKey}`.
- Source keys: a class spell is keyed by the class id (`class_cleric`); anything else by the granting trait's id (`drow_magic`).

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/src/pipeline/__tests__/spellSynthesizer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CharacterSave, RuntimeModifier } from "@project/shared";
import { synthesizeSpells } from "../spellSynthesizer.js";
import { corePackLookup } from "./corePackFixture.js";
import type { Ability } from "../../types/core.js";

const scores = (
  overrides: Partial<Record<Ability, number>> = {},
): Record<Ability, number> => ({
  STR: 10,
  DEX: 10,
  CON: 10,
  INT: 10,
  WIS: 10,
  CHA: 10,
  ...overrides,
});

const save = (overrides: Partial<CharacterSave>): CharacterSave => ({
  attributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  race: { baseRaceId: "race_human", hasSubraces: false, subraceId: null },
  classes: [],
  traitSelections: {},
  feats: [],
  hp: { current: 10, temporary: 0, baseRolledHp: 10, hitDiceSpent: {} },
  ...overrides,
});

const synthesize = (
  character: CharacterSave,
  abilityScores = scores(),
  proficiencyBonus = 2,
  modifiers: RuntimeModifier[] = [],
) =>
  synthesizeSpells({
    save: character,
    snapshot: corePackLookup(),
    abilityScores,
    proficiencyBonus,
    modifiers,
    activeStates: [],
  });

const DROW = {
  baseRaceId: "race_elf",
  hasSubraces: true,
  subraceId: "subrace_elf_dark",
} as const;

const warlock = (level: number) =>
  save({
    classes: [
      {
        classId: "class_warlock",
        level,
        selections: {
          warlock_level_1_cantrips: ["spell_eldritch_blast", "spell_minor_illusion"],
        },
      },
    ],
  });

const drowWizard = (level: number) =>
  save({
    race: DROW,
    classes: [{ classId: "class_wizard", level, selections: {} }],
  });

const lightCleric = (level: number, race: CharacterSave["race"] = save({}).race) =>
  save({
    race,
    classes: [
      {
        classId: "class_cleric",
        level,
        subclassId: "subclass_cleric_light",
        selections: {},
      },
    ],
  });

const find = (
  result: ReturnType<typeof synthesize>,
  spellId: string,
  sourceKey?: string,
) =>
  result.spells.find(
    (spell) =>
      spell.spellId === spellId &&
      (sourceKey === undefined || spell.actionId?.endsWith(`@${sourceKey}`)),
  );

const actionOf = (result: ReturnType<typeof synthesize>, actionId: string) =>
  result.actions.find((action) => action.id === actionId);

describe("synthesizeSpells", () => {
  it("lists a warlock's Eldritch Blast, cast with Charisma", () => {
    const result = synthesize(warlock(4), scores({ CHA: 15 }));

    expect(find(result, "spell_eldritch_blast")).toMatchObject({
      name: "Eldritch Blast",
      level: 0,
      source: { kind: "class", classId: "class_warlock", label: "Warlock" },
      ability: "CHA",
      attackBonus: 4,
      saveDc: 12,
      payment: { kind: "at_will" },
      actionId: "action_spell_eldritch_blast@class_warlock",
      range: { kind: "feet", feet: 120 },
    });
  });

  it.each([
    [4, 1],
    [5, 2],
    [11, 3],
    [17, 4],
  ])("stamps a level-%i warlock's attack bonus and %i beam(s)", (level, beams) => {
    const effect = actionOf(
      synthesize(warlock(level), scores({ CHA: 15 })),
      "action_spell_eldritch_blast@class_warlock",
    )?.effect;

    expect(effect?.type === "attack" && effect.attackBonus).toBe(4);
    expect(effect?.type === "attack" && effect.repeatCount).toBe(beams);
  });

  it("doubles a critical beam's dice", () => {
    const effect = actionOf(
      synthesize(warlock(1)),
      "action_spell_eldritch_blast@class_warlock",
    )?.effect;

    expect(effect?.type === "attack" && effect.criticalDamage?.[0]?.baseDice).toBe("2d10");
  });

  it("lists a stub the character picked, and makes no action of it", () => {
    const result = synthesize(warlock(1));

    expect(find(result, "spell_minor_illusion")?.actionId).toBeUndefined();
    expect(
      result.actions.some((action) => action.id.startsWith("action_spell_minor_illusion")),
    ).toBe(false);
  });

  it("grants a drow Dancing Lights at will with Charisma, and Faerie Fire from third level", () => {
    const second = synthesize(drowWizard(2), scores({ CHA: 11 }));
    const third = synthesize(drowWizard(3), scores({ CHA: 11 }));

    expect(find(second, "spell_dancing_lights")).toMatchObject({
      source: { kind: "trait", traitId: "drow_magic", label: "Drow Magic" },
      ability: "CHA",
      payment: { kind: "at_will" },
      focusCategories: [],
    });
    expect(find(second, "spell_faerie_fire")).toBeUndefined();
    expect(find(third, "spell_faerie_fire")?.payment).toEqual({
      kind: "resource",
      resourceId: "drow_magic_faerie_fire",
    });
    expect(
      actionOf(third, "action_spell_faerie_fire@drow_magic")?.consumesResource,
    ).toBe("drow_magic_faerie_fire");
  });

  it("gives a Light cleric's domain spells to the cleric, paid with slots", () => {
    expect(find(synthesize(lightCleric(1), scores({ WIS: 16 })), "spell_burning_hands")).toMatchObject({
      source: { kind: "class", classId: "class_cleric", label: "Cleric" },
      ability: "WIS",
      saveDc: 13,
      payment: { kind: "slot" },
      preparationTracked: true,
      focusCategories: ["category_holy_symbol"],
    });
  });

  it("stamps Burning Hands' DC, casting ability and area onto its save", () => {
    const effect = actionOf(
      synthesize(lightCleric(1), scores({ WIS: 16 })),
      "action_spell_burning_hands@class_cleric",
    )?.effect;

    expect(effect?.type === "save" && effect.savingThrow.dc).toBe(13);
    expect(effect?.type === "save" && effect.savingThrow.dcCalculation.scalingStat).toBe("WIS");
    expect(effect?.type === "save" && effect.areaOfEffect).toEqual({ shape: "cone", size: 15 });
  });

  it("lists Faerie Fire once for each source that grants it", () => {
    const ids = synthesize(lightCleric(3, DROW))
      .spells.filter((spell) => spell.spellId === "spell_faerie_fire")
      .map((spell) => spell.actionId)
      .sort();

    expect(ids).toEqual([
      "action_spell_faerie_fire@class_cleric",
      "action_spell_faerie_fire@drow_magic",
    ]);
  });

  it("folds a SPELLCASTING_MOD bonus into the numbers", () => {
    const rod: RuntimeModifier = {
      id: "mod_rod",
      target: "SPELLCASTING_MOD",
      type: "add",
      value: 1,
      scalingFactor: "none",
      requiredStates: [],
      forbiddenStates: [],
      sourceName: "Rod of the Pact Keeper",
      sourceOrigin: "item",
      isActive: true,
    };

    expect(
      find(synthesize(warlock(1), scores({ CHA: 15 }), 2, [rod]), "spell_eldritch_blast")?.attackBonus,
    ).toBe(5);
  });

  it("flags a prepared caster's leveled pick, and nobody else's", () => {
    const wizard = synthesize(
      save({
        classes: [
          {
            classId: "class_wizard",
            level: 1,
            selections: { wizard_level_1_spellbook: ["spell_burning_hands"] },
          },
        ],
      }),
    );
    const sorcerer = synthesize(
      save({
        classes: [
          {
            classId: "class_sorcerer",
            level: 1,
            selections: { sorcerer_level_1_spells_known: ["spell_burning_hands"] },
          },
        ],
      }),
    );

    expect(find(wizard, "spell_burning_hands")?.preparationTracked).toBe(false);
    expect(find(sorcerer, "spell_burning_hands")?.preparationTracked).toBe(true);
  });

  it("collects the pools that pay for spells, pact slots at the warlock's slot level", () => {
    expect(synthesize(warlock(5)).slotPools).toEqual([
      { resourceId: "pact_slots", level: 3 },
    ]);
    expect(synthesize(lightCleric(3)).slotPools.map((pool) => pool.level)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  // PHB p.164: pact slots can pay for a spell from any class, and spell slots
  // for a warlock spell; settleSpellCast accepts any pool of a high enough level
  it("gives a warlock/cleric both kinds of pool to pay a cleric spell with", () => {
    const result = synthesize(
      save({
        classes: [
          { classId: "class_warlock", level: 1, selections: {} },
          {
            classId: "class_cleric",
            level: 1,
            subclassId: "subclass_cleric_light",
            selections: {},
          },
        ],
      }),
    );

    expect(find(result, "spell_burning_hands")?.payment).toEqual({ kind: "slot" });
    expect(result.slotPools).toEqual(
      expect.arrayContaining([
        { resourceId: "pact_slots", level: 1 },
        { resourceId: "spell_slots_1", level: 1 },
      ]),
    );
  });

  it("gives a character with no spells nothing", () => {
    expect(
      synthesize(
        save({
          classes: [
            {
              classId: "class_fighter",
              level: 1,
              selections: { fighter_level_1_fighting_style: ["trait_fs_defense"] },
            },
          ],
        }),
      ),
    ).toEqual({ spells: [], actions: [], slotPools: [] });
  });
});
```

Append to `packages/engine/src/pipeline/__tests__/characterEngine.test.ts`:

```ts
describe("CharacterEngine.buildLiveSheet: spells", () => {
  const warlockSheet = () =>
    buildSheet({
      ...halfElfFighter(),
      classes: [
        {
          classId: "class_warlock",
          level: 5,
          selections: {
            warlock_level_1_cantrips: ["spell_eldritch_blast", "spell_minor_illusion"],
          },
        },
      ],
    });

  it("puts a warlock's Eldritch Blast on the sheet, with its castable action", () => {
    const sheet = warlockSheet();

    expect(sheet.spells.map((spell) => spell.spellId)).toContain("spell_eldritch_blast");
    expect(sheet.actions.map((action) => action.id)).toContain(
      "action_spell_eldritch_blast@class_warlock",
    );
    expect(sheet.slotPools).toEqual([{ resourceId: "pact_slots", level: 3 }]);
  });

  it("lists a stub without offering it as an action", () => {
    const sheet = warlockSheet();

    expect(sheet.spells.map((spell) => spell.spellId)).toContain("spell_minor_illusion");
    expect(
      sheet.actions.some((action) => action.id.startsWith("action_spell_minor_illusion")),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @project/engine test -- spellSynthesizer characterEngine`
Expected: FAIL. `spellSynthesizer.js` does not exist, and `sheet.spells` is undefined.

- [ ] **Step 3: Share the numbers in `spellcasting.ts`**

In `packages/engine/src/calculators/spellcasting.ts`, export the pact track:

```ts
export const pactSlotLevel = (warlockLevel: number): number =>
  Math.min(5, Math.ceil(warlockLevel / 2));
```

Replace the body of `SpellcastingEngine` with a shared `numbersFor` and a `calculate` built on it:

```ts
export class SpellcastingEngine {
  /**
   * The spellcasting modifier, save DC and attack bonus for one ability.
   *
   * Every casting source shares it: a class's (calculate, below) and a racial
   * grant's - Drow Magic is cast with Charisma whatever the character's class.
   * Folds in every active SPELLCASTING_MOD bonus either way.
   * @param ability The ability the source casts with
   * @param abilityScores The character's final ability scores
   * @param profBonus The character's proficiency bonus
   * @param modifiers Every active runtime modifier
   * @param activeStates The character's active states, which gate modifiers
   * @returns The modifier, 8 + proficiency + modifier, proficiency + modifier, and a breakdown
   */
  public static numbersFor(
    ability: Ability,
    abilityScores: Record<Ability, number>,
    profBonus: number,
    modifiers: RuntimeModifier[],
    activeStates: string[] = [],
  ): { modifier: number; saveDc: number; attackBonus: number; breakdown: string } {
    // SPELLCASTING_MOD was declared in ModifierTargetSchema and read by nothing
    // until this calculator existed
    const bonuses = modifiers.filter((mod) => {
      if (!mod.isActive) return false;
      if (mod.target !== "SPELLCASTING_MOD" || mod.type !== "add") return false;
      if (mod.forbiddenStates?.some((state) => activeStates.includes(state))) {
        return false;
      }
      return mod.requiredStates
        ? mod.requiredStates.every((state) => activeStates.includes(state))
        : true;
    });

    const abilityMod = AbilityEngine.getModifier(abilityScores[ability]);
    const tokens = [
      `${ability} (${abilityMod >= 0 ? "+" : ""}${abilityMod})`,
      `Proficiency (+${profBonus})`,
    ];

    let total = abilityMod;
    for (const bonus of bonuses) {
      total += bonus.value;
      tokens.push(
        `${bonus.sourceName} (${bonus.value >= 0 ? "+" : ""}${bonus.value})`,
      );
    }

    return {
      modifier: total,
      saveDc: 8 + profBonus + total,
      attackBonus: profBonus + total,
      breakdown: tokens.join(" | "),
    };
  }

  /**
   * The save DC and attack bonus for each class that casts.
   *
   * One entry per class, not one per character: a wizard/cleric has an INT DC
   * and a WIS DC, and collapsing them would report a number that is wrong for
   * half of what they cast.
   * @param sources Every casting class the character holds.
   * @param abilityScores The character's final ability scores.
   * @param profBonus The character's proficiency bonus.
   * @param modifiers Every active runtime modifier.
   * @param activeStates The character's active states, which gate modifiers.
   * @returns One DerivedSpellcasting per source, in the order given.
   */
  public static calculate(
    sources: CastingSource[],
    abilityScores: Record<Ability, number>,
    profBonus: number,
    modifiers: RuntimeModifier[],
    activeStates: string[] = [],
  ): DerivedSpellcasting[] {
    return sources.map((source) => ({
      classId: source.classId,
      ability: source.ability,
      ...this.numbersFor(
        source.ability,
        abilityScores,
        profBonus,
        modifiers,
        activeStates,
      ),
      ...(source.progression === "pact" && {
        pactSlotLevel: pactSlotLevel(source.level),
      }),
    }));
  }
}
```

Run: `pnpm --filter @project/engine test -- spellcasting`
Expected: PASS. `calculate`'s results are unchanged.

- [ ] **Step 4: Write the synthesizer**

Create `packages/engine/src/pipeline/spellSynthesizer.ts`:

```ts
import type {
  ActionActivation,
  ActionGrant,
  CharacterSave,
  DamageSegment,
  Lore,
  RuntimeModifier,
  SpellComponents,
  SpellDefinition,
  SpellDuration,
  SpellRange,
  Spellcasting,
  SpellcastingFocusCategory,
} from "@project/shared";
import type { Ability } from "../types/core.js";
import { SpellcastingEngine, pactSlotLevel } from "../calculators/spellcasting.js";
import {
  classLevelsAndSubclassIds,
  collectCastingSources,
} from "../rules/casterLevel.js";
import {
  resolveClassDefinition,
  resolveSpellDefinition,
  resolveSubclassDefinition,
  resolveTraitDefinition,
  type RuleSnapshotLookup,
} from "../rules/ruleLookup.js";
import { resolveSegmentDice, type ScalingLevels } from "./actionScaling.js";
import { CharacterBootstrapper } from "./characterBootstrapper.js";
import {
  backgroundTraitIds,
  classTraitIds,
  featTraitIds,
  raceTraitIds,
} from "./grantSources.js";
import { spellChoiceEntries } from "./spellChoices.js";

/** Who a spell is cast through, as the sheet labels it. */
export type SpellSource =
  | { kind: "class"; classId: string; label: string }
  | { kind: "trait"; traitId: string; label: string };

/** What casting it costs. A slot's level is chosen when it is cast. */
export type SpellPayment =
  | { kind: "at_will" }
  | { kind: "slot" }
  | { kind: "resource"; resourceId: string };

/** A pool that pays for spells, and the slot level it casts at. */
export interface SlotPool {
  resourceId: string;
  level: number;
}

/**
 * A spell the character has, through one source.
 *
 * One per source rather than one per spell, because the source decides the
 * numbers and the price: a drow Light cleric's Faerie Fire is a Charisma
 * spell once a day through Drow Magic, and a Wisdom spell paid with a slot
 * through the cleric.
 */
export interface CastableSpell {
  spellId: string;
  name: string;
  level: number;
  school: SpellDefinition["school"];
  lore?: Lore;
  range?: SpellRange;
  components?: SpellComponents;
  duration?: SpellDuration;
  activation: ActionActivation;
  source: SpellSource;
  /** Absent only when no casting ability could be found for the source. */
  ability?: Ability;
  attackBonus?: number;
  saveDc?: number;
  payment: SpellPayment;
  /** False for a prepared caster's leveled pick: preparation is not tracked. */
  preparationTracked: boolean;
  /** The foci this source can use. A component pouch always works. */
  focusCategories: SpellcastingFocusCategory[];
  /** The resolved action's id. Absent for a stub: listed, never cast. */
  actionId?: string;
}

export interface SpellSynthesisInput {
  save: CharacterSave;
  snapshot?: RuleSnapshotLookup;
  /** Final ability scores. */
  abilityScores: Record<Ability, number>;
  proficiencyBonus: number;
  /** Every active runtime modifier; SPELLCASTING_MOD bonuses come from here. */
  modifiers: RuntimeModifier[];
  activeStates: string[];
}

export interface SpellSynthesis {
  spells: CastableSpell[];
  /** Every implemented spell's resolved action, one per castable entry. */
  actions: ActionGrant[];
  slotPools: SlotPool[];
}

const ABILITIES: readonly Ability[] = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

const asAbility = (stat: string | undefined): Ability | undefined =>
  ABILITIES.find((ability) => ability === stat);

/** `2d6+1` → `4d6+1`: a critical hit rolls the dice twice, never the modifier. */
const doubleDice = (dice: string): string =>
  dice.replace(/^(\d+)d/, (_, count: string) => `${Number(count) * 2}d`);

/** The value of the highest rung reached, or one below them all. */
const rungAt = (
  thresholds: Array<{ minimumLevel: number; value: number }>,
  level: number,
): number => {
  let best: { minimumLevel: number; value: number } | undefined;
  for (const rung of thresholds) {
    if (rung.minimumLevel <= level && (!best || rung.minimumLevel > best.minimumLevel)) {
      best = rung;
    }
  }
  return best?.value ?? 1;
};

interface CasterNumbers {
  ability: Ability;
  attackBonus: number;
  saveDc: number;
}

type CoreEffect = Exclude<ActionGrant["effect"], { type: "macro" }>;

/**
 * One effect with its caster stamped in, ahead of the roll the way weapons
 * are: attack bonus and beam count on an attack, DC and area on a save, and
 * every damage die at the character's level.
 */
const resolveSpellEffect = (
  effect: CoreEffect,
  numbers: CasterNumbers,
  spell: SpellDefinition,
  levels: ScalingLevels,
): CoreEffect => {
  const scale = (segments: DamageSegment[]) =>
    segments.map((segment) => resolveSegmentDice(segment, levels));

  switch (effect.type) {
    case "attack": {
      const damage = scale(effect.damage);
      return {
        ...effect,
        attackStat: numbers.ability,
        attackBonus: numbers.attackBonus,
        damage,
        // a spell attack has no weapon analysis to resolve its critical pool,
        // so it is doubled here: a critical beam rolls 2d10
        criticalDamage: damage.map((segment) => ({
          ...segment,
          baseDice: doubleDice(segment.baseDice),
          ...(segment.perSlotAbove !== undefined && {
            perSlotAbove: doubleDice(segment.perSlotAbove),
          }),
        })),
        ...(effect.repeat !== undefined && {
          repeatCount: rungAt(effect.repeat.thresholds, levels.total),
        }),
      };
    }
    case "save":
      return {
        ...effect,
        savingThrow: {
          ...effect.savingThrow,
          dcCalculation: {
            ...effect.savingThrow.dcCalculation,
            scalingStat: numbers.ability,
          },
          dc: numbers.saveDc,
        },
        ...(spell.range?.area !== undefined && { areaOfEffect: spell.range.area }),
        ...(effect.damage !== undefined && { damage: scale(effect.damage) }),
      };
    case "damage_rider":
      return { ...effect, damage: scale(effect.damage) };
    default:
      return effect;
  }
};

const resolveSpellAction = (
  spell: SpellDefinition,
  numbers: CasterNumbers,
  levels: ScalingLevels,
  actionId: string,
  payment: SpellPayment,
): ActionGrant => {
  const effect = spell.action.effect;
  return {
    ...spell.action,
    id: actionId,
    effect:
      effect.type === "macro"
        ? {
            ...effect,
            effects: effect.effects.map((nested) =>
              resolveSpellEffect(nested, numbers, spell, levels),
            ),
          }
        : resolveSpellEffect(effect, numbers, spell, levels),
    ...(payment.kind === "resource" && { consumesResource: payment.resourceId }),
  };
};

/**
 * Every spell the character has, as the sheet lists and casts them.
 *
 * Two places grant spells: a trait's fixed `spells` block (Drow Magic, a
 * domain's spells), and the character's stored picks (a warlock's cantrips, a
 * wizard's spellbook). Each spell becomes one entry per source, carrying the
 * source's casting ability, numbers, price and foci. An implemented spell also
 * yields its resolved action - the caster's numbers stamped in, dice at the
 * character's level - under `${spell.action.id}@${sourceKey}`, which is how
 * the server finds it. A stub is listed and never becomes an action.
 * @param input The character, the pack, and the numbers the character casts with
 * @returns The spells, their actions, and the slot pools that pay for them
 */
export const synthesizeSpells = (input: SpellSynthesisInput): SpellSynthesis => {
  const { save, snapshot } = input;
  const { classLevels, subclassIds } = classLevelsAndSubclassIds(save.classes);
  const levels: ScalingLevels = {
    total: save.classes.reduce((sum, classState) => sum + classState.level, 0),
    classes: classLevels,
  };

  /** A class's spellcasting block: its own, or its chosen subclass's. */
  const castingOf = (classId: string): Spellcasting | undefined => {
    const own = resolveClassDefinition(classId, snapshot)?.spellcasting;
    if (own) return own;
    const subclassId = subclassIds[classId];
    return subclassId
      ? resolveSubclassDefinition(subclassId, snapshot)?.spellcasting
      : undefined;
  };

  /** "Cleric", or "Eldritch Knight" where the subclass is what casts. */
  const classSource = (classId: string): SpellSource => {
    const blueprint = resolveClassDefinition(classId, snapshot);
    const subclassId = subclassIds[classId];
    const subclassName =
      !blueprint?.spellcasting && subclassId
        ? resolveSubclassDefinition(subclassId, snapshot)?.name
        : undefined;
    return {
      kind: "class",
      classId,
      label: subclassName ?? blueprint?.name ?? classId,
    };
  };

  // which class, if any, granted each trait: a Light cleric's domain spells
  // are the cleric's, cast with Wisdom and a holy symbol; Drow Magic is
  // nobody's, cast with the Charisma it names and a component pouch
  const traitClass = new Map<string, string | undefined>();
  for (const traitId of [
    ...raceTraitIds(save.race, snapshot),
    ...backgroundTraitIds(save.backgroundId, snapshot),
    ...featTraitIds(save.feats ?? [], snapshot),
  ]) {
    traitClass.set(traitId, undefined);
  }
  save.classes.forEach((classState, index) => {
    for (const traitId of classTraitIds(classState, index === 0, snapshot)) {
      if (!traitClass.has(traitId)) traitClass.set(traitId, classState.classId);
    }
  });

  const spells: CastableSpell[] = [];
  const actions: ActionGrant[] = [];
  const seen = new Set<string>();

  const add = (
    spell: SpellDefinition,
    entry: {
      source: SpellSource;
      sourceKey: string;
      ability: Ability | undefined;
      payment: SpellPayment;
      preparationTracked: boolean;
      focusCategories: SpellcastingFocusCategory[];
    },
  ) => {
    const actionId = `${spell.action.id}@${entry.sourceKey}`;
    if (seen.has(actionId)) return;
    seen.add(actionId);

    const numbers: CasterNumbers | undefined =
      entry.ability === undefined
        ? undefined
        : {
            ability: entry.ability,
            ...SpellcastingEngine.numbersFor(
              entry.ability,
              input.abilityScores,
              input.proficiencyBonus,
              input.modifiers,
              input.activeStates,
            ),
          };
    const castable =
      spell.implementation?.mode !== "unimplemented" && numbers !== undefined;

    if (castable) {
      actions.push(resolveSpellAction(spell, numbers, levels, actionId, entry.payment));
    }

    spells.push({
      spellId: spell.id,
      name: spell.name,
      level: spell.level,
      school: spell.school,
      ...(spell.lore !== undefined && { lore: spell.lore }),
      ...(spell.range !== undefined && { range: spell.range }),
      ...(spell.components !== undefined && { components: spell.components }),
      ...(spell.duration !== undefined && { duration: spell.duration }),
      activation: spell.action.activation,
      source: entry.source,
      ...(numbers !== undefined && {
        ability: numbers.ability,
        attackBonus: numbers.attackBonus,
        saveDc: numbers.saveDc,
      }),
      payment: entry.payment,
      preparationTracked: entry.preparationTracked,
      focusCategories: entry.focusCategories,
      ...(castable && { actionId }),
    });
  };

  // 1 - fixed grants on the character's traits
  for (const [traitId, classId] of traitClass) {
    const trait = resolveTraitDefinition(traitId, snapshot);
    for (const grant of trait?.spells?.fixed ?? []) {
      const reached =
        grant.unlockScaling === "class_level" && classId !== undefined
          ? (classLevels[classId] ?? 0)
          : levels.total;
      if (reached < (grant.unlockLevel ?? 1)) continue;

      const spell = resolveSpellDefinition(grant.spellId, snapshot);
      if (!trait || !spell) continue;

      const casting = classId === undefined ? undefined : castingOf(classId);
      // an always-prepared spell is the class's own spell, cast from its
      // slots; anything else is the trait's, at its own price
      const classOwned =
        grant.usage.kind === "always_prepared" ? classId : undefined;
      const payment: SpellPayment =
        spell.level === 0 || grant.usage.kind === "at_will"
          ? { kind: "at_will" }
          : grant.usage.kind === "resource" && grant.usage.resourceId !== undefined
            ? { kind: "resource", resourceId: grant.usage.resourceId }
            : { kind: "slot" };

      add(spell, {
        source:
          classOwned !== undefined
            ? classSource(classOwned)
            : { kind: "trait", traitId, label: trait.name },
        sourceKey: classOwned ?? traitId,
        ability: asAbility(grant.castingStat) ?? casting?.ability,
        payment,
        preparationTracked: true,
        focusCategories: casting?.focusCategories ?? [],
      });
    }
  }

  // 2 - stored picks, from class tracks and from trait spell blocks
  const activeTraits = CharacterBootstrapper.compileActiveTraits(save, snapshot);
  for (const entry of spellChoiceEntries(save, activeTraits, snapshot)) {
    const classId =
      entry.target === "class" ? entry.classId : traitClass.get(entry.trait.id);
    const casting = classId === undefined ? undefined : castingOf(classId);

    for (const spellId of entry.selected) {
      const spell = resolveSpellDefinition(spellId, snapshot);
      if (!spell) continue;

      add(spell, {
        source:
          entry.target === "class"
            ? classSource(entry.classId)
            : { kind: "trait", traitId: entry.trait.id, label: entry.trait.name },
        sourceKey: entry.target === "class" ? entry.classId : entry.trait.id,
        ability: asAbility(entry.node.castingStat) ?? casting?.ability,
        payment: spell.level === 0 ? { kind: "at_will" } : { kind: "slot" },
        preparationTracked: !(
          entry.target === "class" &&
          casting?.preparation === "prepared" &&
          spell.level > 0
        ),
        focusCategories: casting?.focusCategories ?? [],
      });
    }
  }

  // 3 - the pools that pay: every slot pool a trait grants, at its level
  const pactSource = collectCastingSources(classLevels, subclassIds, snapshot).find(
    (source) => source.progression === "pact",
  );
  const slotPools: SlotPool[] = [];
  const pooled = new Set<string>();
  for (const trait of activeTraits) {
    for (const resource of trait.resources ?? []) {
      if (pooled.has(resource.id)) continue;
      if (!("spellSlot" in resource) || resource.spellSlot === undefined) continue;

      const level =
        resource.spellSlot.kind === "level"
          ? resource.spellSlot.level
          : pactSource
            ? pactSlotLevel(pactSource.level)
            : undefined;
      if (level === undefined) continue;

      pooled.add(resource.id);
      slotPools.push({ resourceId: resource.id, level });
    }
  }

  spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  slotPools.sort((a, b) => a.level - b.level);

  return { spells, actions, slotPools };
};
```

- [ ] **Step 5: Put the synthesis on the live sheet**

In `packages/engine/src/pipeline/characterEngine.ts`:

Add the import:

```ts
import {
  synthesizeSpells,
  type CastableSpell,
  type SlotPool,
} from "./spellSynthesizer.js";
```

In `LiveCharacterSheet`, after `spellcasting`, add:

```ts
  /**
   * Every spell the character has, one entry per source, stubs included - see
   * synthesizeSpells. The implemented ones' resolved actions are in `actions`.
   */
  spells: CastableSpell[];
  /** The spell slot pools the character holds, and the level each casts at. */
  slotPools: SlotPool[];
```

Directly after `const spellcasting = SpellcastingEngine.calculate(…);`, add:

```ts
    // every spell the character has, the caster's numbers stamped in. Stage
    // two for the reason spellcasting is: a SPELLCASTING_MOD bonus can be
    // gated on states
    const spellSynthesis = synthesizeSpells({
      save,
      ...(options.snapshot !== undefined && { snapshot: options.snapshot }),
      abilityScores,
      proficiencyBonus: profBonus,
      modifiers: allModifiers,
      activeStates,
    });
```

In the `actions` array, after the trait actions spread (the one Task 5 changed), add:

```ts
      // a spell's action is keyed by its source, so the server's lookup by
      // id finds exactly the casting the player pressed
      ...spellSynthesis.actions,
```

In the returned object, after `spellcasting,`, add:

```ts
      spells: spellSynthesis.spells,
      slotPools: spellSynthesis.slotPools,
```

Also fix the stale comment above `actions` in `LiveCharacterSheet`: `// executable actions (traits, spells, weapons)` is now true, so leave it.

- [ ] **Step 6: Delete the engine nothing called**

```bash
git rm packages/engine/src/calculators/spellbook.ts packages/engine/src/types/spells.ts
```

In `packages/engine/src/pipeline/index.ts`, add:

```ts
export * from "./spellSynthesizer.js";
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
pnpm --filter @project/engine test
pnpm --filter @project/engine typecheck
DATABASE_URL= pnpm --filter @project/server test
pnpm --filter @project/server typecheck
```

Expected: engine passes 1064 (16 in `spellSynthesizer.test.ts` plus 2 in `characterEngine.test.ts`) and server 527, and both typechecks are clean.

- [ ] **Step 8: Restore line endings, then commit**

```bash
git add packages/engine/src/calculators/spellcasting.ts packages/engine/src/pipeline/spellSynthesizer.ts packages/engine/src/pipeline/__tests__/spellSynthesizer.test.ts packages/engine/src/pipeline/characterEngine.ts packages/engine/src/pipeline/__tests__/characterEngine.test.ts packages/engine/src/pipeline/index.ts
git commit -F - <<'EOF'
feat(engine): the spell synthesizer puts every spell a character has on the live sheet (#83)

One CastableSpell per spell per source - fixed trait grants and stored
picks - with the source's ability, numbers, price and foci. An implemented
spell's action is resolved ahead of the roll, the way weapons are: attack
bonus, DC, beam count, area and doubled critical dice stamped in. The live
sheet gains spells and slotPools. SpellbookEngine, which nothing called, is
gone.

Co-Authored-By: <your session's attribution>
EOF
```

---

### Task 9: The cast checks, as one pure function

**Files:**
- Create: `packages/engine/src/pipeline/spellCast.ts`
- Create: `packages/engine/src/pipeline/__tests__/spellCast.test.ts`
- Modify: `packages/engine/src/pipeline/index.ts`

**Interfaces:**
- Consumes: `CastableSpell` and `SlotPool` (Task 8), and `category_component_pouch` (Task 2).
- Produces (exported from `@project/engine`):

```ts
export const materialCoverage: (
  spell: Pick<CastableSpell, "components" | "focusCategories">,
  inventory: InventoryInstance[],
  snapshot?: RuleSnapshotLookup,
) => { covered: boolean; by?: string };

export type SpellCastRefusal = "slot_required" | "slot_too_low" | "slot_empty" | "materials_required";
export interface SpellCastRequest { slotResourceId?: string; materialsConfirmed?: boolean }
export type SpellCastSettlement =
  | { ok: true; action: ActionGrant; spellCast?: { spellLevel: number; castLevel: number } }
  | { ok: false; reason: SpellCastRefusal; offendingId?: string };
export const settleSpellCast: (input: {
  spell: CastableSpell; action: ActionGrant; request: SpellCastRequest;
  slotPools: SlotPool[]; charges: Array<{ id: string; currentCharges: number }>;
  inventory: InventoryInstance[]; snapshot?: RuleSnapshotLookup;
}) => SpellCastSettlement;
```

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/src/pipeline/__tests__/spellCast.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ActionGrant, InventoryInstance } from "@project/shared";
import { materialCoverage, settleSpellCast } from "../spellCast.js";
import type { CastableSpell } from "../spellSynthesizer.js";
import { corePackLookup } from "./corePackFixture.js";

const carried = (itemId: string): InventoryInstance => ({
  id: `inv_${itemId}`,
  itemId,
  quantity: 1,
  slot: "backpack",
  isAttuned: false,
});

const spell = (overrides: Partial<CastableSpell> = {}): CastableSpell => ({
  spellId: "spell_burning_hands",
  name: "Burning Hands",
  level: 1,
  school: "evocation",
  components: {
    verbal: true,
    somatic: true,
    material: false,
    goldCost: 0,
    isConsumed: false,
  },
  activation: "action",
  source: { kind: "class", classId: "class_cleric", label: "Cleric" },
  ability: "WIS",
  attackBonus: 5,
  saveDc: 13,
  payment: { kind: "slot" },
  preparationTracked: true,
  focusCategories: ["category_holy_symbol"],
  actionId: "action_spell_burning_hands@class_cleric",
  ...overrides,
});

const lights = (focusCategories: CastableSpell["focusCategories"] = []) =>
  spell({
    spellId: "spell_dancing_lights",
    level: 0,
    payment: { kind: "at_will" },
    focusCategories,
    components: {
      verbal: true,
      somatic: true,
      material: true,
      materialDescription: "a bit of phosphorus or wychwood, or a glowworm",
      goldCost: 0,
      isConsumed: false,
    },
  });

const action: ActionGrant = {
  id: "action_spell_burning_hands@class_cleric",
  name: "Burning Hands",
  activation: "action",
  effect: { type: "no_effect" },
};

const slotPools = [
  { resourceId: "spell_slots_1", level: 1 },
  { resourceId: "spell_slots_2", level: 2 },
];

const settle = (
  overrides: Partial<Parameters<typeof settleSpellCast>[0]> = {},
) =>
  settleSpellCast({
    spell: spell(),
    action,
    request: {},
    slotPools,
    charges: [
      { id: "spell_slots_1", currentCharges: 0 },
      { id: "spell_slots_2", currentCharges: 1 },
    ],
    inventory: [],
    snapshot: corePackLookup(),
    ...overrides,
  });

describe("materialCoverage", () => {
  it("covers a spell with no material component", () => {
    expect(materialCoverage(spell(), [])).toEqual({ covered: true });
  });

  it("covers a material component with a component pouch", () => {
    expect(
      materialCoverage(lights(), [carried("item_gear_component_pouch")], corePackLookup()),
    ).toEqual({ covered: true, by: "Component Pouch" });
  });

  it("covers it with a focus the source can use", () => {
    expect(
      materialCoverage(
        lights(["category_arcane_focus"]),
        [carried("item_focus_crystal")],
        corePackLookup(),
      ).covered,
    ).toBe(true);
  });

  // a focus serves its class's spells; Drow Magic is nobody's class
  it("does not cover it with a focus the source cannot use", () => {
    expect(
      materialCoverage(lights([]), [carried("item_focus_crystal")], corePackLookup()),
    ).toEqual({ covered: false });
  });

  it("does not cover it with nothing", () => {
    expect(materialCoverage(lights(), [], corePackLookup())).toEqual({ covered: false });
  });
});

describe("settleSpellCast", () => {
  it("lets an at-will spell through as it is", () => {
    const at = spell({ level: 0, payment: { kind: "at_will" } });

    expect(settle({ spell: at })).toEqual({ ok: true, action });
  });

  it("asks which slot pays for a slot spell", () => {
    expect(settle()).toEqual({ ok: false, reason: "slot_required" });
    expect(settle({ request: { slotResourceId: "spell_slots_7" } })).toEqual({
      ok: false,
      reason: "slot_required",
    });
  });

  it("refuses a slot below the spell's level", () => {
    expect(
      settle({
        spell: spell({ level: 2 }),
        request: { slotResourceId: "spell_slots_1" },
      }),
    ).toEqual({ ok: false, reason: "slot_too_low", offendingId: "spell_slots_1" });
  });

  it("refuses an empty slot", () => {
    expect(settle({ request: { slotResourceId: "spell_slots_1" } })).toEqual({
      ok: false,
      reason: "slot_empty",
      offendingId: "spell_slots_1",
    });
  });

  it("spends the chosen slot through the action, and casts at its level", () => {
    expect(settle({ request: { slotResourceId: "spell_slots_2" } })).toEqual({
      ok: true,
      action: { ...action, consumesResource: "spell_slots_2" },
      spellCast: { spellLevel: 1, castLevel: 2 },
    });
  });

  it("refuses an uncovered material component the player has not confirmed", () => {
    expect(settle({ spell: lights() })).toEqual({
      ok: false,
      reason: "materials_required",
      offendingId: "spell_dancing_lights",
    });
  });

  it("casts it once the player confirms they have the material", () => {
    expect(
      settle({ spell: lights(), request: { materialsConfirmed: true } }).ok,
    ).toBe(true);
  });

  it("asks for the slot before the material", () => {
    expect(
      settle({ spell: { ...lights(), level: 1, payment: { kind: "slot" } } }),
    ).toEqual({ ok: false, reason: "slot_required" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @project/engine test -- spellCast`
Expected: FAIL. `spellCast.js` does not exist.

- [ ] **Step 3: Implement**

Create `packages/engine/src/pipeline/spellCast.ts`:

```ts
import type { ActionGrant, InventoryInstance } from "@project/shared";
import {
  resolveEquipmentDefinition,
  type RuleSnapshotLookup,
} from "../rules/ruleLookup.js";
import type { CastableSpell, SlotPool } from "./spellSynthesizer.js";

/**
 * Whether the character can supply a spell's material component without
 * being asked: a component pouch, or a focus the spell's source can use,
 * anywhere in the inventory. No item can be held in a hand yet, so carried is
 * enough (#121). A spell with no material component is always covered.
 *
 * The sheet asks it to decide whether to prompt; the server asks it to decide
 * whether an unconfirmed cast is refused. One answer for both.
 * @param spell The spell's components and its source's foci
 * @param inventory What the character carries
 * @param snapshot Pack content, where item tags live
 * @returns Whether it is covered, and the item that covers it
 */
export const materialCoverage = (
  spell: Pick<CastableSpell, "components" | "focusCategories">,
  inventory: InventoryInstance[],
  snapshot?: RuleSnapshotLookup,
): { covered: boolean; by?: string } => {
  if (!spell.components?.material) return { covered: true };

  for (const instance of inventory) {
    const definition = resolveEquipmentDefinition(instance.itemId, snapshot);
    const tags: string[] = definition?.categoryTags ?? [];
    if (
      tags.includes("category_component_pouch") ||
      spell.focusCategories.some((category) => tags.includes(category))
    ) {
      return { covered: true, by: definition?.name ?? instance.itemId };
    }
  }

  return { covered: false };
};

export type SpellCastRefusal =
  | "slot_required"
  | "slot_too_low"
  | "slot_empty"
  | "materials_required";

/** What the player chose when they pressed Cast. */
export interface SpellCastRequest {
  slotResourceId?: string;
  materialsConfirmed?: boolean;
}

export type SpellCastSettlement =
  | {
      ok: true;
      action: ActionGrant;
      spellCast?: { spellLevel: number; castLevel: number };
    }
  | { ok: false; reason: SpellCastRefusal; offendingId?: string };

/**
 * Everything a spell needs before it is cast, checked before anything is
 * spent: a slot of at least its level with a charge left, when a slot pays for
 * it; then its material, from a pouch, a usable focus or the player's word.
 *
 * A slot is paid by returning the action with `consumesResource` set to the
 * chosen pool, so ActionResolver's settleCosts spends it with every other
 * cost, all or nothing, and refunds it if something later fails. A resource
 * price (Drow Magic) is already on the action.
 * @param input The spell, its resolved action, the player's request, and the
 *   character's pools, charges and inventory
 * @returns The action to execute and the cast level, or why it cannot be cast
 */
export const settleSpellCast = (input: {
  spell: CastableSpell;
  action: ActionGrant;
  request: SpellCastRequest;
  slotPools: SlotPool[];
  charges: Array<{ id: string; currentCharges: number }>;
  inventory: InventoryInstance[];
  snapshot?: RuleSnapshotLookup;
}): SpellCastSettlement => {
  const { spell, request } = input;
  let action = input.action;
  let spellCast: { spellLevel: number; castLevel: number } | undefined;

  if (spell.payment.kind === "slot") {
    const pool =
      typeof request.slotResourceId === "string"
        ? input.slotPools.find((entry) => entry.resourceId === request.slotResourceId)
        : undefined;
    if (!pool) return { ok: false, reason: "slot_required" };
    if (pool.level < spell.level) {
      return { ok: false, reason: "slot_too_low", offendingId: pool.resourceId };
    }
    const charges =
      input.charges.find((entry) => entry.id === pool.resourceId)?.currentCharges ?? 0;
    if (charges < 1) {
      return { ok: false, reason: "slot_empty", offendingId: pool.resourceId };
    }

    action = { ...action, consumesResource: pool.resourceId };
    spellCast = { spellLevel: spell.level, castLevel: pool.level };
  }

  if (
    !materialCoverage(spell, input.inventory, input.snapshot).covered &&
    request.materialsConfirmed !== true
  ) {
    return { ok: false, reason: "materials_required", offendingId: spell.spellId };
  }

  return spellCast === undefined
    ? { ok: true, action }
    : { ok: true, action, spellCast };
};
```

In `packages/engine/src/pipeline/index.ts`, add:

```ts
export * from "./spellCast.js";
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @project/engine test
pnpm --filter @project/engine typecheck
```

Expected: engine passes 1077 (13 new), and the typecheck is clean.

- [ ] **Step 5: Restore line endings, then commit**

```bash
git add packages/engine/src/pipeline/spellCast.ts packages/engine/src/pipeline/__tests__/spellCast.test.ts packages/engine/src/pipeline/index.ts
git commit -F - <<'EOF'
feat(engine): settleSpellCast checks a spell's slot and material before anything is spent

A slot of at least the spell's level with a charge left, then a pouch, a
focus the source can use, or the player's word. The chosen slot rides in as
the action's consumesResource, so settleCosts pays for it all or nothing.
materialCoverage is the one answer the sheet and the server share.

Co-Authored-By: <your session's attribution>
EOF
```

---

### Task 10: The server casts spells

**Files:**
- Modify: `packages/shared/src/schemas/transport/socket.ts`
- Modify: `apps/server/src/gateway/socket.ts`
- Create: `apps/server/src/gateway/__tests__/socket.spellCast.test.ts`

**Interfaces:**
- Consumes: `settleSpellCast`, `CastableSpell`, `SlotPool` (Tasks 8–9); `liveSheet.spells` and `liveSheet.slotPools`; `ActionResult.targetSaves` (Task 6).
- Produces:
  - `ActionIntentPayload.cast?: { slotResourceId?: string; materialsConfirmed?: boolean }`
  - `export interface TargetSavePayload { ability: string; dc: number; onSuccess: "half_damage" | "no_damage" | "negates_effect"; area?: { shape: string; size: number; secondarySize?: number }; label: string }`
  - `ActionResolvedPayload.targetSaves?: TargetSavePayload[]`
  - refusal reasons on `ACTION_RESOLVED`: `slot_required`, `slot_too_low`, `slot_empty`, `materials_required`

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/gateway/__tests__/socket.spellCast.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { SOCKET_EVENTS } from "@project/shared";
import {
  characterClasses,
  characterInventory,
  characterResources,
  characters,
} from "@project/database/src/schema/operational.js";
import {
  characterRow,
  inventoryRow,
  joinCampaign,
  setupGateway,
  type GatewayHarness,
} from "./socketHarness.js";

/**
 * Casting through ACTION_INTENT, against the real shipped pack: the checks
 * settleSpellCast makes before anything is spent, and what the resolution
 * carries back. A spell's action id is `${action id}@${source}`.
 */
describe("socket gateway - casting a spell", () => {
  let harness: GatewayHarness;
  let request = 0;

  afterEach(() => {
    harness?.restore();
  });

  const cast = (actionId: string, extra: Record<string, unknown> = {}) =>
    harness.emit(SOCKET_EVENTS.ACTION_INTENT, {
      characterId: "char-1",
      requestId: `req-${++request}`,
      actionId,
      source: "character",
      timestamp: Date.now(),
      ...extra,
    });

  const lastResolved = () =>
    (harness.ioEmits.at(-1)?.payload as { data: Record<string, unknown> }).data;

  const chargesOf = (id: string) =>
    (lastResolved()["resources"] as Array<{ id: string; currentCharges: number }>).find(
      (resource) => resource.id === id,
    )?.currentCharges;

  const slot = (id: string, level: number, current: number, max: number) => ({
    id,
    characterId: "char-1",
    name: `Level ${level} slots`,
    current,
    max,
    resetCondition: "long_rest",
  });

  const lightCleric = async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    // stored WIS 16 + the human's 1 = 17 (+3); proficiency +2: DC 13
    harness.db.seed(characters, [
      characterRow({ raceId: "race_human", subraceId: null, wis: 16 }),
    ]);
    harness.db.seed(characterClasses, [
      { classId: "class_cleric", classLevel: 3, subclassId: "subclass_cleric_light" },
    ]);
    harness.db.seed(characterInventory, []);
    harness.db.seed(characterResources, [
      slot("spell_slots_1", 1, 1, 4),
      slot("spell_slots_2", 2, 2, 2),
    ]);
  };

  const drowWizard = async (inventory: unknown[] = [], faerieFire = 1) => {
    harness = await setupGateway();
    await joinCampaign(harness);
    // stored CHA 10 + the drow's 1 = 11 (+0); proficiency +2: DC 10
    harness.db.seed(characters, [
      characterRow({ raceId: "race_elf", subraceId: "subrace_elf_dark", cha: 10 }),
    ]);
    harness.db.seed(characterClasses, [{ classId: "class_wizard", classLevel: 3 }]);
    harness.db.seed(characterInventory, inventory);
    harness.db.seed(characterResources, [
      {
        id: "drow_magic_faerie_fire",
        characterId: "char-1",
        name: "Faerie Fire (Drow Magic)",
        current: faerieFire,
        max: 1,
        resetCondition: "dawn",
      },
    ]);
  };

  it("casts Burning Hands from a 2nd-level slot: 4d6 fire, the targets' DC, the slot spent", async () => {
    await lightCleric();

    await cast("action_spell_burning_hands@class_cleric", {
      cast: { slotResourceId: "spell_slots_2" },
    });
    const resolved = lastResolved();

    expect(resolved["executed"]).toBe(true);
    expect(
      (resolved["rollResults"] as Array<{ rolls: number[] }>)[0]?.rolls,
    ).toHaveLength(4);
    expect(resolved["targetSaves"]).toEqual([
      expect.objectContaining({
        ability: "DEX",
        dc: 13,
        onSuccess: "half_damage",
        area: { shape: "cone", size: 15 },
      }),
    ]);
    expect(chargesOf("spell_slots_2")).toBe(1);
  });

  it("refuses a slot spell cast without a slot, and spends nothing", async () => {
    await lightCleric();

    await cast("action_spell_burning_hands@class_cleric");

    expect(lastResolved()).toMatchObject({ executed: false, reason: "slot_required" });
    expect(chargesOf("spell_slots_1")).toBe(1);
    expect(chargesOf("spell_slots_2")).toBe(2);
  });

  it("refuses a slot with no charges left", async () => {
    await lightCleric();

    await cast("action_spell_burning_hands@class_cleric", {
      cast: { slotResourceId: "spell_slots_1" },
    });
    await cast("action_spell_burning_hands@class_cleric", {
      cast: { slotResourceId: "spell_slots_1" },
    });

    expect(lastResolved()).toMatchObject({ executed: false, reason: "slot_empty" });
  });

  it("asks for Dancing Lights' material when nothing covers it", async () => {
    await drowWizard();

    await cast("action_spell_dancing_lights@drow_magic");

    expect(lastResolved()).toMatchObject({
      executed: false,
      reason: "materials_required",
    });
  });

  it("casts it once the player confirms, and concentrates on it", async () => {
    await drowWizard();

    await cast("action_spell_dancing_lights@drow_magic", {
      cast: { materialsConfirmed: true },
    });

    expect(lastResolved()["executed"]).toBe(true);
    // the list also carries trait states, which are permanent; only the
    // concentration effect is this cast's
    expect(lastResolved()["effects"]).toContainEqual(
      expect.objectContaining({ sourceName: "Dancing Lights", isSelfConcentration: true }),
    );
  });

  it("casts it unasked with a component pouch", async () => {
    await drowWizard([inventoryRow({ itemId: "item_gear_component_pouch" })]);

    await cast("action_spell_dancing_lights@drow_magic");

    expect(lastResolved()["executed"]).toBe(true);
  });

  // a wizard's focus serves wizard spells; Drow Magic is the drow's
  it("does not let a wizard's arcane focus stand in for a racial spell's material", async () => {
    await drowWizard([inventoryRow({ itemId: "item_focus_crystal" })]);

    await cast("action_spell_dancing_lights@drow_magic");

    expect(lastResolved()).toMatchObject({
      executed: false,
      reason: "materials_required",
    });
  });

  it("spends Drow Magic's Faerie Fire, and refuses it once spent", async () => {
    await drowWizard();

    await cast("action_spell_faerie_fire@drow_magic");

    expect(lastResolved()["executed"]).toBe(true);
    expect(lastResolved()["targetSaves"]).toEqual([
      expect.objectContaining({ ability: "DEX", dc: 10, onSuccess: "negates_effect" }),
    ]);
    expect(chargesOf("drow_magic_faerie_fire")).toBe(0);

    await cast("action_spell_faerie_fire@drow_magic");

    expect(lastResolved()).toMatchObject({
      executed: false,
      reason: "insufficient_resource",
    });
  });

  it("ends concentration with the standard action, and the broadcast carries the effects without it", async () => {
    await drowWizard();
    await cast("action_spell_dancing_lights@drow_magic", {
      cast: { materialsConfirmed: true },
    });

    await cast("action_end_concentration");

    expect(lastResolved()["executed"]).toBe(true);
    expect(
      (lastResolved()["effects"] as Array<{ isSelfConcentration: boolean }>).some(
        (effect) => effect.isSelfConcentration,
      ),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `DATABASE_URL= pnpm --filter @project/server test -- socket.spellCast`
Expected: FAIL.
- The Burning Hands cast resolves `executed: true` with no slot spent and 3 dice, because no slot is chosen and nothing checks.
- The refusals do not happen.
- `targetSaves` is absent from the payload.

The last test may already pass, because Task 7 made End Concentration a standard action.

- [ ] **Step 3: Extend the transport types**

In `packages/shared/src/schemas/transport/socket.ts`, add to `ActionIntentPayload`, after `instanceId`:

```ts
  /**
   * What the player chose when casting a spell: the slot pool paying for it,
   * and that they have a material component no pouch or focus covers.
   * Ignored for anything that is not a spell.
   */
  cast?: { slotResourceId?: string; materialsConfirmed?: boolean };
```

After `RollResultPayload`, add:

```ts
/**
 * A saving throw an action asks of its targets - the DC is the caster's, and
 * the roll belongs to the table. Mirrors the engine's TargetSave.
 */
export interface TargetSavePayload {
  ability: string;
  dc: number;
  onSuccess: "half_damage" | "no_damage" | "negates_effect";
  area?: { shape: string; size: number; secondarySize?: number };
  label: string;
}
```

In `ActionResolvedPayload`, after `notes`, add:

```ts
  /** Saving throws the action asks of its targets. Mirrors ActionResult.targetSaves. */
  targetSaves?: TargetSavePayload[];
```

- [ ] **Step 4: Check the cast before executing it**

In `apps/server/src/gateway/socket.ts`:

Add `settleSpellCast`, `type CastableSpell` and `type SlotPool` to the existing `@project/engine` import.

After `let inventory: InventoryInstance[] = [];` in the ACTION_INTENT handler, add:

```ts
          // the castable spell this intent names, when it names one. Its
          // checks run once the snapshot is loaded, below
          let castable: CastableSpell | undefined;
          let slotPools: SlotPool[] = [];
```

In the `payload.source === "character"` branch, after `inventory = resolved.inventory;`, add:

```ts
            castable = resolved.liveSheet.spells.find(
              (spell) => spell.actionId === payload.actionId,
            );
            slotPools = resolved.liveSheet.slotPools;
```

Directly after `const { snapshot } = await getCachedRuleSnapshot();`, add:

```ts
          // A spell is paid for and supplied before anything happens: a slot
          // of at least its level with a charge left, and its material from a
          // pouch, a usable focus or the player's word. A refusal spends
          // nothing and never reaches the resolver. On success the chosen
          // slot rides in as the action's consumesResource, so settleCosts
          // spends it with everything else, all or nothing.
          let spellCast: { spellLevel: number; castLevel: number } | undefined;
          let castRefusal: { reason: string } | undefined;
          if (castable !== undefined && action !== null) {
            const settled = settleSpellCast({
              spell: castable,
              action,
              request: payload.cast ?? {},
              slotPools,
              charges: runtime.resourceManager.getRuntimeResources(),
              inventory,
              snapshot,
            });
            if (settled.ok) {
              action = settled.action;
              spellCast = settled.spellCast;
            } else {
              castRefusal = { reason: settled.reason };
            }
          }
```

Change the `const execution =` expression so that a refusal short-circuits and a cast carries its level:

```ts
          const execution =
            castRefusal !== undefined
              ? { executed: false as const, reason: castRefusal.reason }
              : action !== null
                ? ActionResolver.execute(
                    action,
                    { /* the payload object, unchanged */ },
                    {
                      /* the context object, unchanged, plus: */
                      ...(spellCast !== undefined && { spellCast }),
                    },
                  )
                : { executed: false, reason: "action_not_found" as const };
```

(Keep every existing field of the payload and context objects exactly as they are. The only additions are the `castRefusal` branch and the `spellCast` spread as the context's last entry.)

In `resolvedPayload`, after the `notes` spread, add:

```ts
            ...("targetSaves" in execution &&
              execution.targetSaves !== undefined && {
                targetSaves: execution.targetSaves,
              }),
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
DATABASE_URL= pnpm --filter @project/server test
pnpm --filter @project/server typecheck
pnpm --filter @project/shared typecheck
pnpm --filter @project/web typecheck
```

Expected: server passes 536 (9 new), and all three typechecks are clean.

- [ ] **Step 6: Restore line endings, then commit**

```bash
git add packages/shared/src/schemas/transport/socket.ts apps/server/src/gateway/socket.ts apps/server/src/gateway/__tests__/socket.spellCast.test.ts
git commit -F - <<'EOF'
feat(server): cast a spell through ACTION_INTENT, slot and material checked first (#83)

The intent carries the chosen slot and a materials confirmation; the
gateway runs settleSpellCast before the resolver and refuses with
slot_required, slot_too_low, slot_empty or materials_required, spending
nothing. The resolution carries the targets' saves.

Co-Authored-By: <your session's attribution>
EOF
```

---

### Task 11: The sheet's store casts, and remembers what came back

**Files:**
- Modify: `apps/web/src/store/characterSheetStore.ts`
- Create: `apps/web/src/hooks/useSpells.ts`
- Modify: `apps/web/src/store/__tests__/characterSheetStore.test.ts`
- Create: `apps/web/src/hooks/__tests__/useSpells.test.tsx`

**Interfaces:**
- Consumes: `synthesizeSpells` / `SpellSynthesis` (Task 8); `ActionIntentPayload.cast`, `TargetSavePayload` and `ActionResolvedPayload.targetSaves` (Task 10).
- Produces:
  - store state `latestTargetSaves: TargetSavePayload[]` and `lastActionOutcome: { actionId: string; executed: boolean; reason?: string; economyOverdrawn?: boolean } | null`
  - store action `castSpell(actionId: string, cast?: ActionIntentPayload["cast"]): void`
  - `export const toCharacterSave` from the store module
  - `useSpells(): SpellSynthesis` from `apps/web/src/hooks/useSpells.ts`

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/store/__tests__/characterSheetStore.test.ts`, and add `type ActionResolvedPayload` to its `@project/shared` import:

```ts
describe("useCharacterSheetStore spell casting", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useCharacterSheetStore.setState({
      ...useCharacterSheetStore.getState(),
      id: "char_1",
      classLevels: { class_cleric: 3 },
      subclassIds: { class_cleric: "subclass_cleric_light" },
      raceId: "race_human",
      subraceId: null,
      ruleSnapshot: packRuleSnapshot(),
      latestRollResults: [],
      latestNotes: [],
      latestTargetSaves: [],
      lastActionOutcome: null,
      runtimeEffects: null,
      runtimeResources: null,
      resources: [],
    });
    vi.spyOn(socketService, "emitActionIntent").mockImplementation(() => {});
  });

  const resolution = (
    overrides: Partial<ActionResolvedPayload> = {},
  ): ActionResolvedPayload => ({
    characterId: "char_1",
    requestId: "request_cast",
    actionId: "action_spell_burning_hands@class_cleric",
    source: "character",
    executed: true,
    rollResults: [],
    activeStates: [],
    resources: [],
    effects: [],
    actors: [],
    combatContext: CombatContextSchema.parse({}),
    timestamp: 1,
    ...overrides,
  });

  const burningHandsSave = {
    ability: "DEX",
    dc: 13,
    onSuccess: "half_damage" as const,
    area: { shape: "cone", size: 15 },
    label: "Burning Hands",
  };

  it("casts through the action intent, carrying the player's choices", () => {
    useCharacterSheetStore
      .getState()
      .castSpell("action_spell_burning_hands@class_cleric", {
        slotResourceId: "spell_slots_2",
      });

    expect(socketService.emitActionIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        characterId: "char_1",
        actionId: "action_spell_burning_hands@class_cleric",
        source: "character",
        cast: { slotResourceId: "spell_slots_2" },
      }),
    );
  });

  it("takes the targets' saves and the outcome from each resolution, fresh", () => {
    useCharacterSheetStore
      .getState()
      .syncRemoteActionExecution(
        resolution({ targetSaves: [burningHandsSave] }),
      );
    expect(useCharacterSheetStore.getState().latestTargetSaves).toEqual([
      burningHandsSave,
    ]);

    useCharacterSheetStore
      .getState()
      .syncRemoteActionExecution(
        resolution({ requestId: "request_2", executed: false, reason: "slot_empty" }),
      );

    const state = useCharacterSheetStore.getState();
    expect(state.latestTargetSaves).toEqual([]);
    expect(state.lastActionOutcome).toEqual({
      actionId: "action_spell_burning_hands@class_cleric",
      executed: false,
      reason: "slot_empty",
    });
  });

  it("clears the targets' saves when an unrelated roll is recorded", () => {
    useCharacterSheetStore
      .getState()
      .syncRemoteActionExecution(resolution({ targetSaves: [burningHandsSave] }));
    expect(useCharacterSheetStore.getState().latestTargetSaves).toEqual([
      burningHandsSave,
    ]);

    useCharacterSheetStore.getState().recordRollResult({
      characterId: "char_1",
      rollResults: [
        { total: 12, rolls: [12], modifier: 0, target: "ABILITY_CHECK" },
      ],
      timestamp: 2,
    });

    expect(useCharacterSheetStore.getState().latestTargetSaves).toEqual([]);
  });
});
```

Create `apps/web/src/hooks/__tests__/useSpells.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, useEffect } from "react";
import type { SpellSynthesis } from "@project/engine";
import { emptyCharacterChoices } from "@project/shared";
import { useSpells } from "../useSpells";
import { useCharacterSheetStore } from "../../store/characterSheetStore";
import { packRuleSnapshot } from "../../store/__tests__/packFixture";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let captured: SpellSynthesis | null = null;

const Harness = () => {
  const synthesis = useSpells();
  useEffect(() => {
    captured = synthesis;
  });
  return null;
};

describe("useSpells", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    captured = null;
    useCharacterSheetStore.setState({
      ...useCharacterSheetStore.getState(),
      id: "char_1",
      classLevels: { class_wizard: 3 },
      subclassIds: {},
      raceId: "race_elf",
      subraceId: "subrace_elf_dark",
      backgroundId: null,
      baseScores: { STR: 8, DEX: 14, CON: 10, INT: 16, WIS: 12, CHA: 10 },
      choices: emptyCharacterChoices(),
      ruleSnapshot: packRuleSnapshot(),
      activeConditions: [],
      activeModifiers: [],
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  // CHA 10 + the drow's 1 = 11 (+0); a level-3 proficiency bonus of +2
  it("lists a drow wizard's Drow Magic spells with the sheet's own numbers", async () => {
    await act(async () => {
      root.render(<Harness />);
    });

    expect(
      captured?.spells.find((spell) => spell.spellId === "spell_dancing_lights"),
    ).toMatchObject({
      source: { kind: "trait", label: "Drow Magic" },
      ability: "CHA",
      saveDc: 10,
      payment: { kind: "at_will" },
    });
    expect(captured?.actions.map((action) => action.id)).toContain(
      "action_spell_faerie_fire@drow_magic",
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @project/web test -- characterSheetStore useSpells`
Expected: FAIL. `castSpell` is not a function, `latestTargetSaves` is undefined, and `../useSpells` does not exist.

- [ ] **Step 3: Implement the store**

In `apps/web/src/store/characterSheetStore.ts`:

- Add `type ActionIntentPayload` and `type TargetSavePayload` to the `@project/shared` import.
- Change `const toCharacterSave = (state: CharacterSheetState): CharacterSave => ({` to `export const toCharacterSave = …`, and add above it:

  ```ts
  /**
   * The save the engine reads, built from the sheet's own state. Exported for
   * useSpells, which runs the same synthesis the server's live sheet does.
   */
  ```

- In `CharacterSheetState`, after `latestNotes: string[];`, add:

  ```ts
    /**
     * The saves the last resolved action asked of its targets - Burning Hands'
     * DEX save, its DC and its cone. Decided with latestNotes from the same
     * payload, and cleared by every roll source that clears them.
     */
    latestTargetSaves: TargetSavePayload[];
    /**
     * How the last resolved action came out: whether it ran, and if not, why.
     * The spell panel reads it to say "No slots of that level left" under the
     * spell that was refused. Nothing read `executed` or `reason` before.
     */
    lastActionOutcome: {
      actionId: string;
      executed: boolean;
      reason?: string;
      economyOverdrawn?: boolean;
    } | null;
  ```

- After `executeCharacterAction: (actionId: string) => void;`, add:

  ```ts
    /** Casts a spell: an action intent carrying the slot and materials choices. */
    castSpell: (actionId: string, cast?: ActionIntentPayload["cast"]) => void;
  ```

- In the initial state, beside `latestNotes: [],` (line 943), add `latestTargetSaves: [],` and `lastActionOutcome: null,`.
- Every other `set(...)` that writes `latestNotes: []` (the two HP paths, rest, `dispatchAuthoredEvent` and `recordRollResult`; find them with `grep -n "latestNotes: \[\]" apps/web/src/store/characterSheetStore.ts`) gains `latestTargetSaves: [],` beside it, for the reason its own comment gives for the notes.
- In `syncRemoteActionExecution`'s `set`, after `latestNotes: payload.notes ?? [],`, add:

  ```ts
          latestTargetSaves: payload.targetSaves ?? [],
          lastActionOutcome: {
            actionId: payload.actionId,
            executed: payload.executed,
            ...(payload.reason !== undefined && { reason: payload.reason }),
            ...(payload.economyOverdrawn === true && { economyOverdrawn: true }),
          },
  ```

- After `executeCharacterAction`'s implementation, add:

  ```ts
      castSpell: (actionId, cast) => {
        const state = get();
        if (!state.id) return;

        socketService.emitActionIntent({
          characterId: state.id,
          requestId: crypto.randomUUID(),
          actionId,
          source: "character",
          ...(cast !== undefined && { cast }),
          timestamp: Date.now(),
        });
      },
  ```

- [ ] **Step 4: Implement the hook**

Create `apps/web/src/hooks/useSpells.ts`:

```ts
import { useMemo } from "react";
import {
  synthesizeSpells,
  type Ability,
  type SpellSynthesis,
} from "@project/engine";
import {
  toCharacterSave,
  useCharacterSheetStore,
} from "../store/characterSheetStore";
import { useAbilities, useDerivedStats } from "./useCharacterStats";

/**
 * The character's spells, one entry per source, and the slot pools that pay
 * for them: the synthesis the server's live sheet runs, over the same save,
 * so the spell a row offers is the spell the server finds.
 */
export const useSpells = (): SpellSynthesis => {
  const classLevels = useCharacterSheetStore((state) => state.classLevels);
  const subclassIds = useCharacterSheetStore((state) => state.subclassIds);
  const raceId = useCharacterSheetStore((state) => state.raceId);
  const subraceId = useCharacterSheetStore((state) => state.subraceId);
  const backgroundId = useCharacterSheetStore((state) => state.backgroundId);
  const choices = useCharacterSheetStore((state) => state.choices);
  const ruleSnapshot = useCharacterSheetStore((state) => state.ruleSnapshot);

  const { finalAbilities, totalMods, activeStates } = useAbilities();
  const { profBonus } = useDerivedStats();

  return useMemo(
    () =>
      synthesizeSpells({
        // the save is built from the store's current state; the fields read
        // above are the parts of it that decide what a character can cast
        save: toCharacterSave(useCharacterSheetStore.getState()),
        snapshot: ruleSnapshot ?? undefined,
        abilityScores: Object.fromEntries(
          Object.entries(finalAbilities).map(([ability, derived]) => [
            ability,
            derived.score,
          ]),
        ) as Record<Ability, number>,
        proficiencyBonus: profBonus,
        modifiers: totalMods,
        activeStates,
      }),
    [
      classLevels,
      subclassIds,
      raceId,
      subraceId,
      backgroundId,
      choices,
      ruleSnapshot,
      finalAbilities,
      totalMods,
      activeStates,
      profBonus,
    ],
  );
};
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm --filter @project/web test
pnpm --filter @project/web typecheck
pnpm --filter @project/web lint
```

Expected: web passes 488 (4 new). The typecheck is clean. Lint shows no new warning in `useSpells.ts`; if `react-hooks/exhaustive-deps` flags the dependency list, report it rather than suppress it.

- [ ] **Step 6: Restore line endings, then commit**

```bash
git add apps/web/src/store/characterSheetStore.ts apps/web/src/hooks/useSpells.ts apps/web/src/store/__tests__/characterSheetStore.test.ts apps/web/src/hooks/__tests__/useSpells.test.tsx
git commit -F - <<'EOF'
feat(web): the store casts spells and keeps the targets' saves and each action's outcome

castSpell sends the slot and materials choices on ACTION_INTENT.
latestTargetSaves is decided with latestNotes and cleared where they are;
lastActionOutcome finally reads executed and reason. useSpells runs the
server's synthesis over the sheet's own save.

Co-Authored-By: <your session's attribution>
EOF
```

---

### Task 12: The spell panel

**Files:**
- Create: `apps/web/src/components/sheet/SpellsWidget.tsx`
- Create: `apps/web/src/components/sheet/__tests__/SpellsWidget.test.tsx`
- Modify: `apps/web/src/components/sheet/DashboardLayout.tsx`
- Modify: `apps/web/src/components/sheet/__tests__/DashboardLayout.test.tsx`

**Interfaces:**
- Consumes:
  - `useSpells` (Task 11)
  - store `castSpell`, `lastActionOutcome`, `resources`, `inventory`, `ruleSnapshot` and `runtimeEffects`
  - `materialCoverage` (Task 9) and `upcastDice` (Task 5)
- Produces: `export const SpellsWidget`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/sheet/__tests__/SpellsWidget.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import type { CastableSpell, SlotPool } from "@project/engine";
import type { ActionGrant, InventoryInstance } from "@project/shared";
import { SpellsWidget } from "../SpellsWidget";

const mocks = vi.hoisted(() => ({
  spells: { current: [] as unknown[] },
  actions: { current: [] as unknown[] },
  slotPools: { current: [] as unknown[] },
  resources: { current: [] as unknown[] },
  inventory: { current: [] as unknown[] },
  concentratingOn: { current: null as string | null },
  lastActionOutcome: { current: null as unknown },
  castSpell: vi.fn(),
}));

vi.mock("../../../hooks/useSpells", () => ({
  useSpells: () => ({
    spells: mocks.spells.current,
    actions: mocks.actions.current,
    slotPools: mocks.slotPools.current,
  }),
}));

vi.mock("../../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      resources: mocks.resources.current,
      inventory: mocks.inventory.current,
      ruleSnapshot: {
        equipmentById: {
          item_gear_component_pouch: {
            id: "item_gear_component_pouch",
            name: "Component Pouch",
            categoryTags: ["category_component_pouch"],
          },
        },
      },
      runtimeEffects: {
        getActiveEffects: () =>
          mocks.concentratingOn.current
            ? [{ sourceName: mocks.concentratingOn.current, isSelfConcentration: true }]
            : [],
      },
      castSpell: mocks.castSpell,
      lastActionOutcome: mocks.lastActionOutcome.current,
    }),
}));

const components = (material?: string) => ({
  verbal: true,
  somatic: true,
  material: material !== undefined,
  ...(material !== undefined && { materialDescription: material }),
  goldCost: 0,
  isConsumed: false,
});

const eldritchBlast: CastableSpell = {
  spellId: "spell_eldritch_blast",
  name: "Eldritch Blast",
  level: 0,
  school: "evocation",
  range: { kind: "feet", feet: 120 },
  components: components(),
  duration: { kind: "instantaneous" },
  activation: "action",
  source: { kind: "class", classId: "class_warlock", label: "Warlock" },
  ability: "CHA",
  attackBonus: 4,
  saveDc: 12,
  payment: { kind: "at_will" },
  preparationTracked: true,
  focusCategories: ["category_arcane_focus"],
  actionId: "action_spell_eldritch_blast@class_warlock",
};

const dancingLights: CastableSpell = {
  ...eldritchBlast,
  spellId: "spell_dancing_lights",
  name: "Dancing Lights",
  components: components("a bit of phosphorus or wychwood, or a glowworm"),
  duration: { kind: "timed", amount: 1, unit: "minute", concentration: true },
  source: { kind: "trait", traitId: "drow_magic", label: "Drow Magic" },
  focusCategories: [],
  actionId: "action_spell_dancing_lights@drow_magic",
};

const burningHands: CastableSpell = {
  ...eldritchBlast,
  spellId: "spell_burning_hands",
  name: "Burning Hands",
  level: 1,
  range: { kind: "self", area: { shape: "cone", size: 15 } },
  source: { kind: "class", classId: "class_cleric", label: "Cleric" },
  payment: { kind: "slot" },
  focusCategories: ["category_holy_symbol"],
  actionId: "action_spell_burning_hands@class_cleric",
};

const darkness: CastableSpell = {
  spellId: "spell_darkness",
  name: "Darkness",
  level: 0,
  school: "evocation",
  activation: "action",
  source: { kind: "trait", traitId: "drow_magic", label: "Drow Magic" },
  payment: { kind: "at_will" },
  preparationTracked: true,
  focusCategories: [],
};

const burningHandsAction: ActionGrant = {
  id: "action_spell_burning_hands@class_cleric",
  name: "Burning Hands",
  activation: "action",
  effect: {
    type: "save",
    savingThrow: {
      targetStat: "DEX",
      dcCalculation: { base: 8, scalingStat: "WIS", includeProficiency: true },
      saveEffect: "half_damage",
      dc: 13,
    },
    damage: [
      {
        sourceName: "Burning Hands",
        baseDice: "3d6",
        damageType: "fire",
        scalingMode: "none",
        levelScaling: [],
        perSlotAbove: "1d6",
      },
    ],
  },
};

const pouch: InventoryInstance = {
  id: "inv_pouch",
  itemId: "item_gear_component_pouch",
  quantity: 1,
  slot: "backpack",
  isAttuned: false,
};

const render = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<SpellsWidget />);
  });
  return container;
};

const button = (container: HTMLElement, text: string) =>
  Array.from(container.querySelectorAll("button")).find((entry) =>
    entry.textContent?.startsWith(text),
  );

const click = async (element: Element | undefined) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

describe("SpellsWidget", () => {
  beforeEach(() => {
    mocks.spells.current = [];
    mocks.actions.current = [];
    mocks.slotPools.current = [];
    mocks.resources.current = [];
    mocks.inventory.current = [];
    mocks.concentratingOn.current = null;
    mocks.lastActionOutcome.current = null;
    mocks.castSpell.mockReset();
  });

  it("renders nothing for a character with no spells", async () => {
    expect((await render()).textContent).toBe("");
  });

  it("groups spells by level, each with its source, price and details", async () => {
    mocks.spells.current = [eldritchBlast, burningHands];

    const text = (await render()).textContent;

    expect(text).toContain("Cantrips");
    expect(text).toContain("1st level");
    expect(text).toContain("Warlock · At will");
    expect(text).toContain("Cleric · Slot");
    expect(text).toContain("Self (15-foot cone)");
    expect(text).toContain("120 feet");
  });

  it("lists a stub as not yet automated, with no Cast button", async () => {
    mocks.spells.current = [darkness];

    const container = await render();

    expect(container.textContent).toContain("Not yet automated");
    expect(button(container, "Cast")).toBeUndefined();
  });

  it("notes that preparation is not tracked for a prepared caster's picks", async () => {
    mocks.spells.current = [{ ...burningHands, preparationTracked: false }];

    expect((await render()).textContent).toContain("Preparation isn't tracked");
  });

  it("casts an at-will spell with nothing to ask", async () => {
    mocks.spells.current = [eldritchBlast];
    const container = await render();

    await click(button(container, "Cast"));

    expect(mocks.castSpell).toHaveBeenCalledWith(
      "action_spell_eldritch_blast@class_warlock",
      {},
    );
  });

  it("offers only the slots that can pay, with the dice each one rolls", async () => {
    mocks.spells.current = [burningHands];
    mocks.actions.current = [burningHandsAction];
    mocks.slotPools.current = [
      { resourceId: "spell_slots_1", level: 1 },
      { resourceId: "spell_slots_2", level: 2 },
      { resourceId: "spell_slots_3", level: 3 },
    ] satisfies SlotPool[];
    mocks.resources.current = [
      { id: "spell_slots_1", current: 0 },
      { id: "spell_slots_2", current: 2 },
      { id: "spell_slots_3", current: 1 },
    ];
    const container = await render();

    await click(button(container, "Cast"));

    expect(button(container, "1st level")).toBeUndefined();
    expect(button(container, "2nd level")?.textContent).toBe("2nd level (2 left) · 4d6");
    expect(button(container, "3rd level")?.textContent).toBe("3rd level (1 left) · 5d6");

    await click(button(container, "2nd level"));

    expect(mocks.castSpell).toHaveBeenCalledWith(
      "action_spell_burning_hands@class_cleric",
      { slotResourceId: "spell_slots_2" },
    );
  });

  it("asks for a material nothing covers, and casts once the player confirms", async () => {
    mocks.spells.current = [dancingLights];
    const container = await render();

    await click(button(container, "Cast"));

    expect(container.textContent).toContain(
      "Needs a bit of phosphorus or wychwood, or a glowworm. Do you have it?",
    );
    expect(mocks.castSpell).not.toHaveBeenCalled();

    await click(button(container, "Cast anyway"));

    expect(mocks.castSpell).toHaveBeenCalledWith(
      "action_spell_dancing_lights@drow_magic",
      { materialsConfirmed: true },
    );
  });

  it("casts unasked when a component pouch covers the material", async () => {
    mocks.spells.current = [dancingLights];
    mocks.inventory.current = [pouch];
    const container = await render();

    await click(button(container, "Cast"));

    expect(mocks.castSpell).toHaveBeenCalledWith(
      "action_spell_dancing_lights@drow_magic",
      {},
    );
  });

  it("says why a cast was refused, under the spell it refused", async () => {
    mocks.spells.current = [burningHands];
    mocks.lastActionOutcome.current = {
      actionId: "action_spell_burning_hands@class_cleric",
      executed: false,
      reason: "slot_empty",
    };

    expect((await render()).textContent).toContain("No slots of that level left.");
  });

  it("warns that casting a concentration spell ends the current one", async () => {
    mocks.spells.current = [dancingLights];
    mocks.concentratingOn.current = "Faerie Fire";

    expect((await render()).textContent).toContain("Casting this ends Faerie Fire.");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @project/web test -- SpellsWidget`
Expected: FAIL. `../SpellsWidget` does not exist.

- [ ] **Step 3: Implement the widget**

Create `apps/web/src/components/sheet/SpellsWidget.tsx`:

```tsx
import { useState } from "react";
import {
  materialCoverage,
  upcastDice,
  type CastableSpell,
} from "@project/engine";
import type { ActionGrant } from "@project/shared";
import { useSpells } from "../../hooks/useSpells";
import { useCharacterSheetStore } from "../../store/characterSheetStore";

const LEVEL_HEADINGS = [
  "Cantrips",
  "1st level",
  "2nd level",
  "3rd level",
  "4th level",
  "5th level",
  "6th level",
  "7th level",
  "8th level",
  "9th level",
];

const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

const ACTIVATION: Record<string, string> = {
  action: "1 action",
  bonus_action: "1 bonus action",
  reaction: "1 reaction",
  attack: "1 attack",
  special: "No action",
  minute: "1 minute",
  hour: "1 hour",
  eight_hours: "8 hours",
};

/** What each refusal the server sends means, in the player's terms. */
const REFUSALS: Record<string, string> = {
  slot_required: "Choose a spell slot to cast this with.",
  slot_too_low: "That slot is too low for this spell.",
  slot_empty: "No slots of that level left.",
  materials_required: "This spell needs its material component.",
  insufficient_resource: "No uses left.",
};

const rangeText = (spell: CastableSpell): string | undefined => {
  const range = spell.range;
  if (!range) return undefined;
  const area = range.area
    ? `${range.area.size}-foot ${range.area.shape.replace("_", " ")}`
    : undefined;
  if (range.kind === "self") return area ? `Self (${area})` : "Self";
  return area ? `${range.feet} feet (${area})` : `${range.feet} feet`;
};

const durationText = (spell: CastableSpell): string | undefined => {
  const duration = spell.duration;
  if (!duration) return undefined;
  if (duration.kind === "instantaneous") return "Instantaneous";
  const span = `${duration.amount} ${duration.unit}${duration.amount === 1 ? "" : "s"}`;
  return duration.concentration ? `Concentration, up to ${span}` : span;
};

const componentText = (spell: CastableSpell): string | undefined => {
  const components = spell.components;
  if (!components) return undefined;
  return [
    components.verbal && "V",
    components.somatic && "S",
    components.material && "M",
  ]
    .filter(Boolean)
    .join(", ");
};

/** The dice a slot-paid spell rolls from a slot of this level, for the picker. */
const upcastPreview = (
  action: ActionGrant | undefined,
  spellLevel: number,
  castLevel: number,
): string | undefined => {
  if (!action) return undefined;
  const effects =
    action.effect.type === "macro" ? action.effect.effects : [action.effect];
  for (const effect of effects) {
    if (effect.type !== "save" && effect.type !== "attack") continue;
    const segment = effect.damage?.find((entry) => entry.perSlotAbove !== undefined);
    if (segment) return upcastDice(segment, { spellLevel, castLevel });
  }
  return undefined;
};

const BUTTON =
  "rounded border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100";

/**
 * Every spell the character has, and the way to cast it.
 *
 * One row per spell per source: Faerie Fire through Drow Magic and through the
 * cleric are two rows, because they cost different things. Casting asks only
 * what the rules leave to the player - which slot, and whether they have a
 * material nothing they carry covers - and the server checks both again.
 */
export const SpellsWidget = () => {
  const { spells, actions, slotPools } = useSpells();
  const resources = useCharacterSheetStore((state) => state.resources);
  const inventory = useCharacterSheetStore((state) => state.inventory);
  const ruleSnapshot = useCharacterSheetStore((state) => state.ruleSnapshot);
  const runtimeEffects = useCharacterSheetStore((state) => state.runtimeEffects);
  const castSpell = useCharacterSheetStore((state) => state.castSpell);
  const lastActionOutcome = useCharacterSheetStore(
    (state) => state.lastActionOutcome,
  );

  const [expanded, setExpanded] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{
    actionId: string;
    slotResourceId?: string;
  } | null>(null);

  if (spells.length === 0) return null;

  const charges = (resourceId: string) =>
    resources.find((resource) => resource.id === resourceId)?.current ?? 0;
  const concentratingOn = runtimeEffects
    ?.getActiveEffects()
    .find((effect) => effect.isSelfConcentration)?.sourceName;

  const send = (
    spell: CastableSpell,
    slotResourceId?: string,
    materialsConfirmed = false,
  ) => {
    if (!spell.actionId) return;
    castSpell(spell.actionId, {
      ...(slotResourceId !== undefined && { slotResourceId }),
      ...(materialsConfirmed && { materialsConfirmed: true }),
    });
    setPicking(null);
    setConfirming(null);
  };

  const withMaterials = (spell: CastableSpell, slotResourceId?: string) => {
    if (
      spell.actionId &&
      !materialCoverage(spell, inventory, ruleSnapshot ?? undefined).covered
    ) {
      setPicking(null);
      setConfirming({
        actionId: spell.actionId,
        ...(slotResourceId !== undefined && { slotResourceId }),
      });
      return;
    }
    send(spell, slotResourceId);
  };

  const onCast = (spell: CastableSpell) => {
    if (!spell.actionId) return;
    if (spell.payment.kind === "slot") {
      setPicking(picking === spell.actionId ? null : spell.actionId);
      return;
    }
    withMaterials(spell);
  };

  const levels = [...new Set(spells.map((spell) => spell.level))].sort(
    (a, b) => a - b,
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">
        Spells
      </p>

      <div className="mt-3 space-y-4">
        {levels.map((level) => {
          const group = spells.filter((spell) => spell.level === level);

          return (
            <section key={level}>
              <h4 className="text-xs font-bold uppercase text-slate-600">
                {LEVEL_HEADINGS[level]}
              </h4>
              {group.some((spell) => !spell.preparationTracked) && (
                <p className="mt-1 text-[11px] text-amber-700">
                  {"Preparation isn't tracked; cast only what you prepared today."}
                </p>
              )}

              <ul className="mt-2 space-y-2">
                {group.map((spell) => {
                  const key =
                    spell.actionId ?? `${spell.spellId}@${spell.source.label}`;
                  const action = actions.find((entry) => entry.id === spell.actionId);
                  const coverage = materialCoverage(
                    spell,
                    inventory,
                    ruleSnapshot ?? undefined,
                  );
                  const concentrates =
                    spell.duration?.kind === "timed" && spell.duration.concentration;
                  const details = [
                    ACTIVATION[spell.activation],
                    rangeText(spell),
                    componentText(spell),
                    durationText(spell),
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  const price =
                    spell.payment.kind === "at_will"
                      ? "At will"
                      : spell.payment.kind === "resource"
                        ? `${charges(spell.payment.resourceId)} left`
                        : "Slot";
                  const outcome =
                    lastActionOutcome?.actionId === spell.actionId
                      ? lastActionOutcome
                      : null;
                  const isPicking = picking !== null && picking === spell.actionId;
                  const isConfirming =
                    confirming !== null && confirming.actionId === spell.actionId;
                  const usablePools = slotPools.filter(
                    (pool) => pool.level >= spell.level && charges(pool.resourceId) > 0,
                  );

                  return (
                    <li
                      key={key}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            {spell.name}
                            {concentrates && (
                              <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-700">
                                Concentration
                              </span>
                            )}
                            {!spell.actionId && (
                              <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                                Not yet automated
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500">
                            {spell.source.label} · {price}
                          </p>
                          {details && (
                            <p className="text-[11px] text-slate-500">{details}</p>
                          )}
                        </div>

                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => setExpanded(expanded === key ? null : key)}
                            className={BUTTON}
                          >
                            Details
                          </button>
                          {spell.actionId && (
                            <button
                              type="button"
                              onClick={() => onCast(spell)}
                              className="rounded bg-indigo-700 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-indigo-800"
                            >
                              Cast
                            </button>
                          )}
                        </div>
                      </div>

                      {concentratingOn && concentrates && spell.actionId && (
                        <p className="mt-1 text-[11px] text-indigo-700">
                          Casting this ends {concentratingOn}.
                        </p>
                      )}

                      {isPicking && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {usablePools.length === 0 ? (
                            <p className="text-[11px] text-slate-500">
                              No slots left that can cast this.
                            </p>
                          ) : (
                            usablePools.map((pool) => {
                              const preview = upcastPreview(action, spell.level, pool.level);
                              return (
                                <button
                                  key={pool.resourceId}
                                  type="button"
                                  onClick={() => withMaterials(spell, pool.resourceId)}
                                  className={BUTTON}
                                >
                                  {`${ORDINALS[pool.level]} level (${charges(pool.resourceId)} left)${preview ? ` · ${preview}` : ""}`}
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}

                      {isConfirming && (
                        <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2">
                          <p className="text-[11px] text-amber-800">
                            {`Needs ${spell.components?.materialDescription ?? "a material component"}. Do you have it?`}
                          </p>
                          <div className="mt-1 flex gap-1">
                            <button
                              type="button"
                              onClick={() => send(spell, confirming?.slotResourceId, true)}
                              className={BUTTON}
                            >
                              Cast anyway
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirming(null)}
                              className={BUTTON}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {outcome && !outcome.executed && (
                        <p className="mt-1 text-[11px] text-red-700">
                          {REFUSALS[outcome.reason ?? ""] ?? "The spell was not cast."}
                        </p>
                      )}
                      {outcome?.executed && outcome.economyOverdrawn && (
                        <p className="mt-1 text-[11px] text-amber-700">
                          Your action was already used this turn.
                        </p>
                      )}

                      {expanded === key && (
                        <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                          {spell.actionId ? (
                            <p className="whitespace-pre-line">
                              {spell.lore?.fullText ?? spell.lore?.shortDescription}
                            </p>
                          ) : (
                            <p>
                              {"This spell's rules haven't been authored — resolve it at the table."}
                            </p>
                          )}
                          {spell.components?.material && (
                            <p>
                              {`Material: ${spell.components.materialDescription}. `}
                              {coverage.covered
                                ? `Covered by: ${coverage.by}`
                                : "No pouch or usable focus."}
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Put it on the dashboard**

In `apps/web/src/components/sheet/DashboardLayout.tsx`, import it beside `SpellcastingWidget`:

```tsx
import { SpellsWidget } from "./SpellsWidget";
```

and render it directly after `<SpellcastingWidget />`:

```tsx
          <SpellcastingWidget />

          <SpellsWidget />
```

In `apps/web/src/components/sheet/__tests__/DashboardLayout.test.tsx`, isolate it the way the file isolates its other child widgets, next to the existing `vi.mock` calls:

```tsx
vi.mock("../SpellsWidget", () => ({ SpellsWidget: () => null }));
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm --filter @project/web test
pnpm --filter @project/web typecheck
pnpm --filter @project/web lint
```

Expected: web passes 498 (10 new). The typecheck is clean, and lint adds no new warnings.

- [ ] **Step 6: Restore line endings, then commit**

```bash
git add apps/web/src/components/sheet/SpellsWidget.tsx apps/web/src/components/sheet/__tests__/SpellsWidget.test.tsx apps/web/src/components/sheet/DashboardLayout.tsx apps/web/src/components/sheet/__tests__/DashboardLayout.test.tsx
git commit -F - <<'EOF'
feat(web): a spell panel lists every spell and casts it - slot picker, material prompt, refusals (#83)

One row per spell per source, grouped by level, with its price, range,
components and duration. A slot spell opens a picker of the slots that can
pay and the dice each rolls; an uncovered material asks first; a refusal is
said under the spell it refused. A stub is listed and says it is not yet
automated.

Co-Authored-By: <your session's attribution>
EOF
```

---

### Task 13: The results show the targets' save; concentration can be ended

**Files:**
- Modify: `apps/web/src/components/sheet/CombatWidget.tsx`
- Modify: `apps/web/src/components/sheet/__tests__/CombatWidget.test.tsx`
- Modify: `apps/web/src/components/sheet/ActiveEffectsWidget.tsx` (**LF**; keep it LF)
- Modify: `apps/web/src/components/sheet/__tests__/ActiveEffectsWidget.test.tsx` (**LF**; keep it LF)

**Interfaces:**
- Consumes: store `latestTargetSaves` (Task 11) and the `action_end_concentration` standard action (Task 7).
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/components/sheet/__tests__/CombatWidget.test.tsx`:
- Import `type ActionRollResult` from `@project/engine` and `type TargetSavePayload` from `@project/shared`.
- In `storeState`, change `latestRollResults: [],` to `latestRollResults: [] as ActionRollResult[],`, and add `latestTargetSaves: [] as TargetSavePayload[],` after `latestNotes: [],`.

Then append:

```tsx
describe("CombatWidget: what an action asked of its targets", () => {
  const render = async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<CombatWidget />);
    });
    return container;
  };

  afterEach(() => {
    storeState.latestTargetSaves = [];
    storeState.latestRollResults = [];
  });

  it("shows the targets' save with its DC, what a success does, and the area", async () => {
    storeState.latestTargetSaves = [
      {
        ability: "DEX",
        dc: 13,
        onSuccess: "half_damage",
        area: { shape: "cone", size: 15 },
        label: "Burning Hands",
      },
    ];

    expect((await render()).textContent).toContain(
      "Burning Hands: DEX save DC 13 · half damage on a success · 15-foot cone",
    );
  });

  it("labels each beam's damage", async () => {
    storeState.latestRollResults = [
      { total: 6, rolls: [6], modifier: 0, target: "DAMAGE_ROLL", damageType: "force", label: "Beam 2" },
    ];

    expect((await render()).textContent).toContain("Beam 2 • force");
  });
});
```

Append to `apps/web/src/components/sheet/__tests__/ActiveEffectsWidget.test.tsx`, inside `describe("ActiveEffectsWidget", …)`:

```tsx
  const endConcentration: ActionGrant = {
    id: "action_end_concentration",
    name: "End Concentration",
    activation: "special",
    effect: { type: "end_concentration" },
  };

  it("marks a concentration effect, and offers End Concentration on it", async () => {
    mocks.effects.current = [
      effect({
        sourceName: "Faerie Fire",
        isSelfConcentration: true,
        durationType: "rounds",
        durationRemaining: 10,
        grantedStates: [],
      }),
    ];
    mocks.actions.current = [endConcentration];

    const container = await renderWidget();
    expect(container.textContent).toContain("Concentrating");

    const end = dismissButtons(container).find(
      (button) => button.textContent === "End Concentration",
    );
    await act(async () => {
      end?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.executeCharacterAction).toHaveBeenCalledWith(
      "action_end_concentration",
    );
  });

  it("does not offer End Concentration on an effect that is not concentration", async () => {
    mocks.effects.current = [effect()];
    mocks.actions.current = [endConcentration];

    const container = await renderWidget();

    expect(dismissButtons(container)).toHaveLength(0);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @project/web test -- CombatWidget ActiveEffectsWidget`
Expected: FAIL. No target-save line, the damage subtitle is just `force`, there is no "Concentrating" badge, and no End Concentration button.

- [ ] **Step 3: Implement `CombatWidget`**

In `apps/web/src/components/sheet/CombatWidget.tsx`:

Add `type TargetSavePayload` to its `@project/shared` import (or add the import), and above the component add:

```tsx
const ON_SUCCESS: Record<TargetSavePayload["onSuccess"], string> = {
  half_damage: "half damage on a success",
  no_damage: "no damage on a success",
  negates_effect: "a success negates it",
};

/** "Burning Hands: DEX save DC 13 · half damage on a success · 15-foot cone" */
const targetSaveLine = (save: TargetSavePayload): string =>
  [
    `${save.label}: ${save.ability} save DC ${save.dc}`,
    ON_SUCCESS[save.onSuccess],
    save.area && save.area.shape !== "single_target"
      ? `${save.area.size}-foot ${save.area.shape}`
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
```

Beside `const latestNotes = …` (line 42), add:

```tsx
  const latestTargetSaves = useCharacterSheetStore(
    (state) => state.latestTargetSaves,
  );
```

In the "Latest rolls" subtitle, replace the expression:

```tsx
                      {result.target === "ATTACK_ROLL" && result.label
                        ? `${result.label}${result.summary ? ` • ${result.summary}` : ""}`
                        : result.damageType
                          ? `${result.damageType}`
                          : "authored effect"}
```

with:

```tsx
                      {result.target === "ATTACK_ROLL" && result.label
                        ? `${result.label}${result.summary ? ` • ${result.summary}` : ""}`
                        : result.damageType
                          ? // a beam's damage names its beam, as its attack does
                            `${result.label && !isHeal ? `${result.label} • ` : ""}${result.damageType}`
                          : "authored effect"}
```

Directly before the `{latestNotes.length > 0 && (` block, add:

```tsx
      {latestTargetSaves.length > 0 && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-700">
            Saving throws for the targets
          </div>
          {latestTargetSaves.map((save, index) => (
            <p
              key={`${save.label}-${index}`}
              className="mt-2 text-xs text-indigo-800"
            >
              {targetSaveLine(save)}
            </p>
          ))}
        </div>
      )}
```

- [ ] **Step 4: Implement `ActiveEffectsWidget`**

In `apps/web/src/components/sheet/ActiveEffectsWidget.tsx`, replace `enderFor` with:

```tsx
  const enderFor = (effect: ActiveEffect) => {
    const actions = getCharacterActions();

    // concentration is a flag on whichever effect a spell applied, not a tag,
    // so its ender is found by what it does rather than by what it names
    if (effect.isSelfConcentration) {
      return actions.find((action) => action.effect.type === "end_concentration");
    }
    if (!effect.effectTag) return undefined;

    return actions.find(
      (action) =>
        action.effect.type === "remove_effect" &&
        action.effect.effectTag === effect.effectTag,
    );
  };
```

Change `const ender = enderFor(effect.effectTag);` to `const ender = enderFor(effect);`, and after the effect's name `{effect.sourceName}` add:

```tsx
                      {effect.isSelfConcentration && (
                        <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-700">
                          Concentrating
                        </span>
                      )}
```

Extend the component's docstring paragraph about dismissal with one sentence: "Concentration is ended by End Concentration, whichever spell it came from."

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm --filter @project/web test
pnpm --filter @project/web typecheck
```

Expected: web passes 502 (4 new), and the typecheck is clean.

- [ ] **Step 6: Commit**

Restore CRLF on `CombatWidget.tsx` and `CombatWidget.test.tsx` **only**. The two ActiveEffects files stay LF; measure them to confirm.

```bash
git add apps/web/src/components/sheet/CombatWidget.tsx apps/web/src/components/sheet/__tests__/CombatWidget.test.tsx apps/web/src/components/sheet/ActiveEffectsWidget.tsx apps/web/src/components/sheet/__tests__/ActiveEffectsWidget.test.tsx
git commit -F - <<'EOF'
feat(web): results show the saves an action asks of its targets; concentration can be ended

Burning Hands reads "DEX save DC 13 · half damage on a success · 15-foot
cone" - a save's DC was never shown before. Beam damage names its beam.
Active effects marks the concentration effect and offers End Concentration
on it, whichever spell it came from.

Co-Authored-By: <your session's attribution>
EOF
```

---

### Task 14: Sample characters that cast the four spells

**Files:**
- Modify: `packages/database/src/sampleScenarioCharacters.ts`
- Modify: `packages/database/src/seedSampleCharacters.ts` (header comments only)
- Modify: `packages/database/src/__tests__/seedSampleCharactersImport.test.ts:27`
- Modify: `apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts`
- Modify: `apps/server/src/services/__tests__/sampleCharacterScores.test.ts`
- Modify: `docs/development/sample-characters.md`

**Interfaces:**
- Consumes: the four authored spells (Task 4) and the whole cast path (Tasks 8–13), for the live checks this task scripts.
- Produces:
  - Isolde Varn knows Eldritch Blast and Minor Illusion as warlock cantrips, and Dancing Lights as her High Elf cantrip.
  - Maren Solace, `00000000-0000-0000-0000-000000000130`, is a human Light cleric 3.

- [ ] **Step 1: Pin the new roster, and watch it fail**

- In `packages/database/src/__tests__/seedSampleCharactersImport.test.ts`, change `expect(ROSTER).toHaveLength(20);` to `expect(ROSTER).toHaveLength(21);`.
- In `apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts`, add `"Maren Solace": 24,` after `"Orrik Stonehide": 134,`.
- In `apps/server/src/services/__tests__/sampleCharacterScores.test.ts`, add `"Maren Solace": [13, 10, 15, 11, 17, 12],` after the Orrik Stonehide entry.

Run:

```bash
DATABASE_URL= pnpm --filter @project/database test -- seedSampleCharactersImport
DATABASE_URL= pnpm --filter @project/server test -- sampleCharacter
```

Expected: FAIL. The roster has 20 characters, and the scores test's name list no longer matches the roster.

- [ ] **Step 2: Stage Isolde and add Maren**

In `packages/database/src/sampleScenarioCharacters.ts`, in Isolde Varn's `choices`, change `class_warlock` to:

```ts
        class_warlock: {
          // real warlock cantrips; Eldritch Blast is what #31b's live check
          // casts, one beam at 4 and two after her level-up to 5
          warlock_level_1_cantrips: ["spell_eldritch_blast", "spell_minor_illusion"],
          warlock_level_2_invocations: [
            "trait_invocation_beast_speech",
            "trait_invocation_eldritch_sight",
          ],
          warlock_level_3_pact_boon: ["trait_pact_of_the_chain"],
        },
```

and change her `high_elf_cantrip` line and its comment to:

```ts
        // a wizard cantrip with a material component, which the pouch she
        // carries covers: Dancing Lights casts without asking
        high_elf_cantrip: ["spell_dancing_lights"],
```

Change her `testFocus` to:

```ts
      "Staging: level to 5 for invocation prerequisites against Pact of the Chain (#81) and Eldritch Blast's second beam (#31b); a wizard dip that only final INT allows (#77); Alert reaches initiative; no familiar actor (#36).",
```

Append this character to `SCENARIO_ROSTER`, after Orrik Stonehide:

```ts
  {
    id: "00000000-0000-0000-0000-000000000130",
    name: "Maren Solace",
    raceId: "race_human",
    classes: [
      {
        classId: "class_cleric",
        classLevel: 3,
        subclassId: "subclass_cleric_light",
      },
    ],
    backgroundId: "background_acolyte",
    choices: {
      feats: [],
      classSelections: {},
      traitSelections: {
        human_language_choice: ["celestial"],
        acolyte_languages: ["draconic", "dwarvish"],
        cleric_starting_skills: ["medicine", "persuasion"],
      },
    },
    alignment: "Neutral Good",
    // Sister Aveline's numbers, so both pinned expectations are known: the
    // human's +1 makes WIS 17 (+3), a spell save DC of 13 and +5 to hit
    str: 12,
    dex: 9,
    con: 14,
    int: 10,
    wis: 16,
    cha: 11,
    maxHp: 18,
    currentHp: 24,
    testFocus:
      "Spell casting (#31b, #83): Burning Hands from a 1st- and then a 2nd-level slot (3d6, then 4d6) against WIS DC 13; the spent 1st-level slot leaves the picker; Faerie Fire's concentration ended from Active effects.",
    personalityTraits: "I narrate sunrises to people who did not ask for one.",
    ideals: "Hope. Every dark room has a window someone forgot to open.",
    bonds: "The lighthouse-temple at Greyhaven kept me alive through one long winter.",
    flaws: "I treat every shadow as a problem to solve, including other people's.",
    traits: [
      { traitId: "trait_cleric_prof_armor", source: "class_cleric_level_1" },
      { traitId: "trait_cleric_prof_weapons", source: "class_cleric_level_1" },
      { traitId: "trait_cleric_prof_skills", source: "class_cleric_level_1" },
      {
        traitId: "trait_cleric_prof_saving_throw",
        source: "class_cleric_level_1",
      },
      { traitId: "trait_spellcasting_cleric", source: "class_cleric_level_1" },
      { traitId: "trait_divine_domain", source: "class_cleric_level_1" },
      {
        traitId: "trait_light_domain_spells",
        source: "subclass_cleric_light_level_1",
      },
      {
        traitId: "trait_cleric_light_bonus_cantrip",
        source: "subclass_cleric_light_level_1",
      },
      { traitId: "trait_warding_flare", source: "subclass_cleric_light_level_1" },
      { traitId: "trait_channel_divinity", source: "class_cleric_level_2" },
      { traitId: "trait_divine_domain_feature", source: "class_cleric_level_2" },
      {
        traitId: "trait_cd_radiance_of_the_dawn",
        source: "subclass_cleric_light_level_2",
      },
      { traitId: "trait_human_languages", source: "race_human" },
      { traitId: "trait_acolyte_prof_skills", source: "background_acolyte" },
      { traitId: "trait_acolyte_languages", source: "background_acolyte" },
    ],
    inventory: [
      { itemId: "item_armor_chain_shirt", slot: "body" },
      { itemId: "item_weapon_mace", slot: "main_hand" },
      { itemId: "item_armor_shield", slot: "off_hand" },
      { itemId: "item_focus_emblem" },
      { itemId: "item_pack_priests" },
      { itemId: "item_clothes_vestments" },
    ],
    resources: [
      {
        id: "spell_slots_1",
        name: "1st-Level Spell Slots",
        current: 1,
        max: 4,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_2",
        name: "2nd-Level Spell Slots",
        current: 2,
        max: 2,
        resetCondition: "long_rest",
      },
      {
        id: "trait_channel_divinity",
        name: "Channel Divinity",
        current: 1,
        max: 1,
        resetCondition: "short_rest",
      },
    ],
  },
```

In the file's header comment, change "ten scenario characters" to "eleven scenario characters" and "These ten are each staged" to "These eleven are each staged". In `packages/database/src/seedSampleCharacters.ts`, change "twenty" to "twenty-one" in its header (lines 2 and 16) and in the comment at line 1863; nothing else in that file changes.

- [ ] **Step 3: Run the tests to verify they pass**

```bash
DATABASE_URL= pnpm --filter @project/database test
DATABASE_URL= pnpm --filter @project/server test
pnpm --filter @project/database typecheck
```

Expected: database 204 and server 539 pass (three new per-character cases: choices, hit points, scores), and the typecheck is clean.
- `sampleCharacterChoices.test.ts` accepts Maren: her one unanswered question is `cleric_level_1_cantrips`, a spell node, which the test filters.
- It accepts Isolde's two warlock picks, both level-0 spells on her cantrip node.
- `sampleRosterIds.test.ts` resolves every item id Maren carries.

- [ ] **Step 4: Write the live checks**

In `docs/development/sample-characters.md`:

- Line 3: "Twenty fixture characters" → "Twenty-one fixture characters".
- "**The scenario set** (`…0120`–`…0129`)" → "(`…0120`–`…0130`)".
- "All twenty sit in the **Dev Smoke Campaign**" → "All twenty-one sit in…".
- "Ids run `…000000000110` through `…000000000129`" → "…through `…000000000130`".
- In the scenario table, change Isolde's Backlog cell to `#81, #77, #36, #31b` and Kestrel's to `#62, #31b`, and add this last row:

  ```markdown
  | [Maren Solace](http://localhost:5173/character/00000000-0000-0000-0000-000000000130) | 3 | Cleric 3 (Light) | 24/24 | Spell casting | #31b, #83 |
  ```

- In **Isolde Varn — `…0122`**, step 2, replace `and Agonizing Blast with "needs Eldritch Blast" (spell picks are not stored until #31a)` with `while Agonizing Blast is available: she knows Eldritch Blast`. Then add a step 6:

  ```markdown
  6. **Eldritch Blast (#31b).** The Spells panel lists Eldritch Blast (Warlock ·
     At will). Cast it: one attack roll at +4 and a 1d10 force damage roll, both
     labelled Beam 1. After step 2's level-up to 5, a cast rolls Beam 1 and
     Beam 2, each with its own attack. Minor Illusion is listed as not yet
     automated. Dancing Lights (her High Elf cantrip) casts without asking,
     because her component pouch covers it; End Concentration in Active effects
     ends it.
  ```

- In **Seraphine Dusk — `…0126`**, replace step 4 with:

  ```markdown
  4. **Spells (#31b, #83).** The Spells panel lists Dancing Lights, Faerie Fire
     and Darkness under Drow Magic. Dancing Lights asks for its material: her
     crystal is a wizard's focus, which does not serve a racial spell. Confirm,
     and Active effects shows it Concentrating. Faerie Fire is refused ("No uses
     left"), since its use is spent. Take a long rest and cast it: the results
     read "Faerie Fire: DEX save DC 12 · a success negates it · 20-foot cube",
     Dancing Lights gives way to Faerie Fire, and End Concentration clears it.
     Darkness is not yet automated.
  ```

- In **Kestrel Vey — `…0127`**, add a step 4:

  ```markdown
  4. **The breath's save (#31b, a regression check).** Using Cold Breath reports
     "Cold Breath: CON save DC 13 · half damage on a success · 15-foot cone" -
     the targets' save, not hers - and rolls 3d6 cold, the dice for level 7.
     Before feat/spell-casting it rolled her own Constitution save and 2d6.
  ```

- After Orrik Stonehide's section, add:

  ```markdown
  ### Maren Solace — `…0130`

  1. **Burning Hands (#31b).** The Spells panel lists Burning Hands and Faerie
     Fire (Cleric · Slot), both always prepared through Light Domain Spells.
     Cast Burning Hands: the picker offers "1st level (1 left) · 3d6" and "2nd
     level (2 left) · 4d6". Take the 1st: the results read "Burning Hands: DEX
     save DC 13 · half damage on a success · 15-foot cone" with 3d6 fire.
  2. **The spent slot.** Cast again: the 1st level is gone from the picker.
     Take the 2nd: 4d6.
  3. **Faerie Fire.** Cast it with the remaining 2nd-level slot: "DEX save DC
     13 · a success negates it · 20-foot cube", and Active effects shows it
     Concentrating. End Concentration clears it.
  ```

- [ ] **Step 5: Restore line endings, then commit**

```bash
git add packages/database/src/sampleScenarioCharacters.ts packages/database/src/seedSampleCharacters.ts packages/database/src/__tests__/seedSampleCharactersImport.test.ts apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts apps/server/src/services/__tests__/sampleCharacterScores.test.ts docs/development/sample-characters.md
git commit -F - <<'EOF'
test(database): sample characters that cast the four spells; their live checks (#31b)

Isolde learns Eldritch Blast and Minor Illusion, and takes Dancing Lights
as her High Elf cantrip. Maren Solace, a Light cleric 3, stages Burning
Hands from both slot levels and Faerie Fire's concentration. Seraphine's and
Kestrel's scripts gain Drow Magic and the breath weapon's save.

Co-Authored-By: <your session's attribution>
EOF
```

---

### Task 15: The authoring guide, the attribution, the decision and the backlog

**Files:**
- Create: `docs/architecture/spell-authoring-guide.md`
- Modify: `README.md`
- Modify: `docs/decisions/ARCHITECTURE_DECISIONS.md`
- Modify: `docs/TODO_BACKLOG.md`

**Interfaces:** none. This task is docs only.

- [ ] **Step 1: Write the authoring guide**

Create `docs/architecture/spell-authoring-guide.md` (CRLF):

````markdown
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
| heals | `heal` | — |
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
````

- [ ] **Step 2: Add the attribution**

Append to `README.md`:

```markdown

## Licences and attribution

Spell text in `packages/database/data/packs/core_2014_pack/spells/` includes
material from the System Reference Document 5.1 ("SRD 5.1") by Wizards of
the Coast LLC, available at
https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is
licensed under the Creative Commons Attribution 4.0 International License,
available at https://creativecommons.org/licenses/by/4.0/legalcode.
```

- [ ] **Step 3: Record the decision**

Insert at the top of `docs/decisions/ARCHITECTURE_DECISIONS.md`, directly under `# Architecture Decisions`:

```markdown
## 2026-09-25 - Spells become actions per source, through a synthesizer

**Status:** Accepted

**Context:**
- A spell's numbers depend on who casts it. A drow Light cleric's Faerie Fire
  is a Charisma spell once a day through Drow Magic, and a Wisdom spell paid
  with a slot through the cleric.
- The action resolver has no levels or casting sources to read. Weapons
  already solve this by having their numbers stamped before the roll.
- Until now spell records existed only so references resolved, and nothing
  put a spell on the sheet (#83).

**Decision:**
- The pack authors a spell once, with its caster-dependent numbers abstract:
  `SPELLCASTING_MOD`, a `repeat` ladder, `perSlotAbove`. Pack validation
  forbids it to author what the synthesizer stamps.
- `synthesizeSpells` turns each spell a character has into one entry per
  source - a class, or the trait that grants it - and resolves its action
  ahead of the roll: the source's attack bonus and DC, the area, the beam
  count, the dice at the character's level and the doubled critical dice.
  The action's id is `${spell.action.id}@${sourceKey}`, and it joins the live
  sheet's actions.
- Only the slot level is left for cast time. `settleSpellCast` checks the slot
  and the material before anything is spent, and returns the action with the
  slot as its `consumesResource`, so the resolver's existing all-or-nothing
  settlement pays it.

**Consequences:**
- The server finds a spell by the same lookup as any action, and the web runs
  the same synthesis for its spell panel.
- Most future spells are data. A new capability - a touch range, rituals,
  preparation - extends the synthesizer or the resolver once, never one spell.
- A spell granted twice is listed twice, on purpose.
```

- [ ] **Step 4: Update the backlog**

In `docs/TODO_BACKLOG.md`:

- **Index table.** Change the #83 row's status to `✅ Closed` and its section to `Closed items (11h)`. Add these rows after #113, each `| Open | Open items |`:
  - `| 114 | Spell preparation is not tracked |`
  - `| 115 | Concentration is never checked when the caster takes damage |`
  - `| 116 | Verbal and somatic components are not gated |`
  - `| 117 | Costly and consumed material components are not enforced |`
  - `| 118 | The bonus-action spell rule is not enforced |`
  - `| 119 | Spells cannot be cast as rituals |`
  - `| 120 | The invocations that modify Eldritch Blast are unauthored |`
  - `| 121 | A spellcasting focus need only be carried, not held |`
- **#31's table row.** Change the scale `**111 of 111**` to `**107 of 111**`, and its note to: "Four authored on `feat/spell-casting` (2026-09-25): Eldritch Blast, Dancing Lights, Faerie Fire, Burning Hands, in `spells/core.json`. The other 107 are stubs with a `no_effect` action; their `level` and `school` are placeholders, which the marker's summary says outright. `docs/architecture/spell-authoring-guide.md` is how the rest are authored."
- **#31a.** Append one sentence to its paragraph: "#31a must also remove `spellOptions`' rule that a leveled node offers nothing (`feat/spell-casting`'s decision 8), which exists only because no class list exists to filter on."
- **#83.** Under its heading, append: "**Closed 2026-09-25** by `feat/spell-casting`. `synthesizeSpells` builds every spell a character has from fixed grants and stored picks, one per source. The Spells panel lists them and casts the implemented ones through `ACTION_INTENT`, with a slot picker, a material prompt and refusals. Preparation, which this item's note left for later, is split out as #114."
- **New sections.** After #113's section, add one section per new item in the file's existing shape (`### #114 — …`, a one-row table, one paragraph):
  - **#114** — Every picked spell is castable, and a prepared caster's leveled picks carry a note instead. Needs a prepare/unprepare control and the daily limit (ability modifier + level); clerics, druids and paladins also need #31a's class lists to prepare from.
  - **#115** — Nothing emits a damage-taken event, so the sheet cannot prompt the DC 10-or-half-damage Constitution save that keeps concentration.
  - **#116** — Conditions are client-only and nothing models "cannot speak" or "hands bound"; `components` are displayed, never checked.
  - **#117** — A pouch or focus cannot cover a component with a cost (Revivify's diamond). Nothing checks that the character owns one, or spends it when `isConsumed`.
  - **#118** — Casting a bonus-action spell limits your action to a cantrip that turn (PHB p.202). Not enforced.
  - **#119** — `isRitual` is authored and nothing reads it: no ritual cast (+10 minutes, no slot).
  - **#120** — Agonizing Blast, Repelling Blast and Eldritch Spear are stubs. Agonizing Blast will add CHA to Eldritch Blast's damage segment, the synthesizer's resolved `damageBonus`.
  - **#121** — No item can be held in a hand except weapons and shields (`equipSlots.ts`), so the material check accepts a focus anywhere in the inventory.

- [ ] **Step 5: Commit**

Restore CRLF on `README.md`, `ARCHITECTURE_DECISIONS.md`, `TODO_BACKLOG.md` and the new guide, and measure all four.

```bash
git add docs/architecture/spell-authoring-guide.md README.md docs/decisions/ARCHITECTURE_DECISIONS.md docs/TODO_BACKLOG.md
git commit -F - <<'EOF'
docs: the spell authoring guide, SRD attribution, the synthesizer decision; close #83, record #114-#121

Co-Authored-By: <your session's attribution>
EOF
```

---

### Task 16: Verify the whole branch, and check it live

**Files:** none changed, unless the checks find something. A finding is reported, not silently fixed.

- [ ] **Step 1: Every suite, every typecheck, lint and hygiene**

```bash
pnpm --filter @project/shared test
pnpm --filter @project/engine test
DATABASE_URL= pnpm --filter @project/database test
DATABASE_URL= pnpm --filter @project/server test
pnpm --filter @project/web test
pnpm --filter @project/shared typecheck
pnpm --filter @project/engine typecheck
pnpm --filter @project/database typecheck
pnpm --filter @project/server typecheck
pnpm --filter @project/web typecheck
pnpm lint
pnpm check:hygiene
```

Expected: shared 260, engine 1077, database 204, server 539 and web 502, **2582** in total, all passing. Every typecheck is clean, and lint and hygiene pass. If a total differs, account for every test by name before going on. A turbo cache can replay a stale success, so run the package scripts directly as above.

- [ ] **Step 2: Import the pack and reseed the samples**

The dev database runs in Docker (container `dnd-postgres`). If a script hits `ECONNREFUSED 5432`, start Docker Desktop, then run `docker start dnd-postgres`.

```bash
pnpm --filter @project/database db:import-pack
pnpm --filter @project/database db:seed:samples
```

Expected: the import publishes the pack with no validation issue, and the seed writes 21 characters.

- [ ] **Step 3: Check it live**

Start the server and web app per `docs/development/sample-characters.md` → "Running it", and open each character in the browser pane. Run these scripts from that doc:

- **Isolde Varn**: step 6. Level up to 5 (step 2) only after checking one beam at level 4.
- **Seraphine Dusk**: step 4.
- **Kestrel Vey**: step 4.
- **Maren Solace**: steps 1–3.

For each check, record the numbers the sheet showed (dice counts, DCs, remaining charges) and a screenshot. Any disagreement with the script is a finding: report it with the screenshot, and do not change code in this task.

- [ ] **Step 4: Report**

Summarise:
- the test totals per package;
- each live check, as passed or as a finding with its evidence;
- any file whose line endings changed unexpectedly (`git diff --stat` against `397bb8c` should list only the files the tasks name).
