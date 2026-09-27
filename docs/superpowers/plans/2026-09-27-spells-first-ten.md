# The First Ten Spells Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author the first ten stubs in `spells/unimplemented.json` (Darkness, Minor Illusion, Thaumaturgy, Hellish Rebuke, Command, Identify, Augury, Suggestion, Nondetection, Speak with Dead), and add what they need: `touch` range, `round`/`hour` durations, a fixed grant's `castAtLevel`, costly materials no pouch covers, and ritual casting.

**Architecture:** The pack contract grows by exactly what these spells use (`touch`, `round`, `hour`, `castAtLevel`, `ritualCasting`), held honest by a new `invalid_cast_level` validation. The spell synthesizer stamps a grant's fixed cast level into the dice and flags which entries can be cast as rituals. `settleSpellCast` refuses a ritual through a source that cannot cast one, skips the slot for one that can, and treats any component with a gold cost as uncovered. The sheet adds a ritual button, cost-aware material prompts and cast-at-level text. The ten spells are pack data.

**Tech Stack:** TypeScript, pnpm + turbo monorepo; Zod 4 (`@project/shared`); Vitest; `@project/engine`; Express + socket.io (`apps/server`); React 19 + Zustand (`apps/web`).

**Spec:** `docs/superpowers/specs/2026-09-27-spells-first-ten-design.md`

## Global Constraints

- **Line endings.** Every existing file this plan touches is **CRLF**, except `packages/database/data/schemas/segment.schema.json`, which is generated and stays **LF**. Every **new** file is CRLF. Edit and Write emit LF, so after editing restore CRLF on each CRLF file you touched:
  ```bash
  node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' <file> <file> ...
  ```
  and measure (grep gives wrong answers for CR in this Git Bash):
  ```bash
  node -e 'for(const f of process.argv.slice(1)){const b=require("fs").readFileSync(f);let cr=0,lf=0,crlf=0;for(let i=0;i<b.length;i++){if(b[i]===13){cr++;if(b[i+1]===10)crlf++;}if(b[i]===10)lf++;}console.log(f,cr===0?"LF":(cr===crlf&&crlf===lf)?"CRLF":"MIXED")}' <file> ...
  ```
  Never use `sed -i`. `pnpm check:hygiene` fails on a mixed file.
- **Pack JSON is edited only through `packages/database/scripts/patchPackSegment.ts`**, run from `packages/database` as `pnpm exec tsx scripts/patchPackSegment.ts <segment> <patch>`. The script preserves each file's line endings. Never hand-edit pack JSON. Write patch files to your scratchpad directory (`<scratchpad>` below).
- **`races/tiefling.json` does not survive a no-op round-trip through the script**: its compact `"maxRule": { ... }` objects expand to multi-line when patched. The owner accepted the same one-time expansion for `elf.json`. Accept it, and say so in the commit body. Every class file round-trips cleanly.
- **After any change to a shared content schema** (Tasks 1–2), regenerate the pack schemas with `pnpm --filter @project/database schemas:generate`. `packSchemas.test.ts` byte-compares the output.
- **Typecheck is a separate gate**, because Vitest ignores type errors. Per package: `pnpm --filter @project/shared typecheck`, `@project/engine`, `@project/database`, `@project/server` (all `tsc --noEmit`), and `pnpm --filter @project/web typecheck` (`tsc -b`). Never run `tsc -b` in `packages/database`.
- `apps/server`, `packages/engine`, `packages/shared` and `packages/database` compile with **`exactOptionalPropertyTypes`** and **`noUncheckedIndexedAccess`**. Set an optional field with a conditional spread (`...(x !== undefined && { x })`), never `x: undefined`.
- **CI has no `DATABASE_URL`.** Run the server and database suites as `DATABASE_URL= pnpm --filter @project/server test` and `DATABASE_URL= pnpm --filter @project/database test`.
- **Web tests** use Vitest with `createRoot` + `act`. `@testing-library` is **not** installed; follow the sibling test files.
- **Engine, database and server tests read the shipped pack** (`corePackLookup()`, `assembleCoreRulePack`). A test that names a spell's level, dice or ritual flag depends on the pack data Task 4 authors; that is why Task 4 comes before the engine tasks.
- **Rules text.** `fullText` is the SRD 5.1 wording, except Hellish Rebuke, which is not in the SRD and gets the paraphrase Task 4 gives. `shortDescription` and every `tableNote` are original wording, exactly as Task 4 gives them.
- Prose, comments and docs use British spelling. Identifiers stay exactly as they are.
- Commit messages end with a blank line and then the `Co-Authored-By:` trailer your own session's attribution instruction supplies. Use `git commit -F -` with a heredoc. Branch is `feat/spells-first-ten`. Do not push.
- Touch only the files a task lists. If a test or typecheck fails in any other file, stop and report NEEDS_CONTEXT.
- **Scope.** Build the ten spells and the capabilities the spec names. Everything under the spec's Known limitations is recorded in Task 9, not built.

Design decisions (owner, 2026-09-27) that bind every task:

1. **Costly materials: always ask.** A component with `goldCost > 0` is never covered by a pouch or focus. The sheet asks on every cast, naming the cost and whether the spell consumes it; the server refuses an unconfirmed cast. The inventory is neither checked nor spent (#117 stays open for that).
2. **Rituals.** A class's spellcasting block declares `ritualCasting`. A ritual spell cast through such a class can be cast as a ritual: no slot, no upcast, and no action, bonus action or reaction spent (it takes ten minutes longer). A trait's spells are never ritual-castable. Closes #119.
3. **One branch, capabilities first**, then the spells as data, then the fixture and docs.
4. **Cast-at-level.** A fixed grant may name the level its spell is cast at; the synthesizer stamps the dice at that level when the sheet is built and drops `perSlotAbove`.

## File Structure

| File | Change |
| --- | --- |
| `packages/shared/src/schemas/content/spells.ts` | `touch` range; `round`/`hour` units; `ROUNDS_PER_DURATION_UNIT`; `castAtLevel` on `FixedSpellGrantSchema` (T1) |
| `packages/shared/src/schemas/content/character.ts` | `ritualCasting` on `SpellcastingSchema` (T2) |
| `packages/shared/src/schemas/content/validatePack.ts` | `invalid_cast_level` (T3) |
| `packages/shared/src/schemas/transport/socket.ts` | `asRitual` on `ActionIntentPayload.cast` (T6) |
| `packages/database/scripts/patchPackSegment.ts` | `setFixedSpellGrantFields` (T3) |
| `packages/database/data/packs/core_2014_pack/classes/*.json` (10 files) | `ritualCasting` (T2) |
| `packages/database/data/packs/core_2014_pack/races/tiefling.json` | `castAtLevel: 2` on Infernal Legacy's Hellish Rebuke (T3) |
| `packages/database/data/packs/core_2014_pack/spells/core.json`, `spells/unimplemented.json` | the ten spells (T4) |
| `packages/database/data/schemas/segment.schema.json` | regenerated (T1, T2) |
| `packages/engine/src/pipeline/spellSynthesizer.ts` | touch-safe area (T1); `castLevel`, `ritual` (T5) |
| `packages/engine/src/pipeline/spellCast.ts` | costly components; `asRitual`; `ritual_not_allowed` (T6) |
| `apps/server/src/gateway/socket.ts` | comment only (T6) |
| `apps/web/src/components/sheet/SpellsWidget.tsx` | `Touch` (T1); ritual button and badge, costly prompts, cast-at-level, radius, refusal (T7) |
| `packages/database/src/sampleScenarioCharacters.ts`, `seedSampleCharacters.ts` | Cassia Emberlane, a tiefling Knowledge cleric 5 (T8) |
| `docs/development/sample-characters.md` | the new character and updated scripts (T8) |
| `docs/architecture/spell-authoring-guide.md`, `docs/TODO_BACKLOG.md` | T9 |

Tests change beside each of these; each task lists its own.

Baseline on `main` at 043b8a1: shared 260, engine 1079, database 205, server 539, web 503 — **2586**.

The spec's §4 asks for a resolver test pinning that a standalone `save` with no `damage` reports its `targetSaves` entry and rolls nothing. It exists already — `packages/engine/src/pipeline/__tests__/actionResolver.test.ts:840`, "rolls nothing for a save that deals no damage" — so no task adds one, and the resolver does not change.

The store needs no change either: `castSpell(actionId, cast?: ActionIntentPayload["cast"])` forwards whatever `cast` carries, so Task 6's `asRitual` reaches the socket through it.

---

### Task 1: Touch range, round and hour durations, and a fixed grant's cast level

**Files:**
- Modify: `packages/shared/src/schemas/content/spells.ts:26-67` and `:141-153`
- Modify: `packages/shared/src/schemas/__tests__/spellContract.test.ts:1-13`, `:89-110`
- Modify: `packages/engine/src/pipeline/spellSynthesizer.ts:170-186`
- Modify: `apps/web/src/components/sheet/SpellsWidget.tsx:46-54`
- Modify: `apps/web/src/components/sheet/__tests__/SpellsWidget.test.tsx` (two tests appended)
- Modify (generated): `packages/database/data/schemas/segment.schema.json`

**Interfaces:**
- Produces:
  - `SpellRange` gains `{ kind: "touch" }`, which has no `area`.
  - `SpellDuration`'s timed `unit` is `"round" | "minute" | "hour"`.
  - `ROUNDS_PER_DURATION_UNIT = { round: 1, minute: 10, hour: 600 }`.
  - `FixedSpellGrant.castAtLevel?: number` (integer 1–9).
  - `areaOf(range: SpellRange | undefined): AreaOfEffect | undefined`, module-private in `spellSynthesizer.ts`.

- [ ] **Step 1: Write the failing shared tests**

In `packages/shared/src/schemas/__tests__/spellContract.test.ts`, add `FixedSpellGrantSchema` to the import from `"../content/spells.js"`:

```ts
import {
  FixedSpellGrantSchema,
  ROUNDS_PER_DURATION_UNIT,
  SpellDefinitionSchema,
  SpellDurationSchema,
  SpellRangeSchema,
} from "../content/spells.js";
```

Replace the test `has no touch range yet` (and its `// no range kind before a spell needs it` comment) with:

```ts
  // Identify and Nondetection: a touch spell has no area
  it("carries a touch range", () => {
    expect(SpellRangeSchema.parse({ kind: "touch" })).toEqual({ kind: "touch" });
    expect(() =>
      SpellRangeSchema.parse({ kind: "touch", area: { shape: "sphere", size: 5 } }),
    ).toThrow();
  });
```

Replace the test `counts ten rounds to the minute` with:

```ts
  it("counts rounds in each duration unit: a round is six seconds", () => {
    expect(ROUNDS_PER_DURATION_UNIT).toEqual({ round: 1, minute: 10, hour: 600 });
  });

  // Command lasts a round; Suggestion and Nondetection, eight hours
  it("lasts rounds and hours as well as minutes, and nothing else", () => {
    for (const unit of ["round", "hour"]) {
      expect(
        SpellDurationSchema.parse({ kind: "timed", amount: 8, unit, concentration: false }),
      ).toEqual({ kind: "timed", amount: 8, unit, concentration: false });
    }
    expect(() =>
      SpellDurationSchema.parse({
        kind: "timed",
        amount: 1,
        unit: "day",
        concentration: false,
      }),
    ).toThrow();
  });

  // Infernal Legacy casts Hellish Rebuke "as a 2nd-level spell"
  it("lets a fixed grant cast its spell at a set level, from 1st to 9th", () => {
    const grant = {
      type: "fixed_spell",
      spellId: "spell_hellish_rebuke",
      castingStat: "CHA",
      unlockLevel: 3,
      usage: { kind: "resource", resourceId: "infernal_legacy_hellish_rebuke" },
    };

    expect(FixedSpellGrantSchema.parse({ ...grant, castAtLevel: 2 }).castAtLevel).toBe(2);
    expect(FixedSpellGrantSchema.parse(grant).castAtLevel).toBeUndefined();
    expect(() => FixedSpellGrantSchema.parse({ ...grant, castAtLevel: 0 })).toThrow();
    expect(() => FixedSpellGrantSchema.parse({ ...grant, castAtLevel: 10 })).toThrow();
  });
```

- [ ] **Step 2: Watch them fail**

Run: `pnpm --filter @project/shared test -- spellContract`
Expected: FAIL — the touch range is rejected, the unit table is `{ minute: 10 }`, `round` and `hour` are rejected, and `castAtLevel` is stripped (undefined).

- [ ] **Step 3: Implement the schema**

In `packages/shared/src/schemas/content/spells.ts`, replace `SpellRangeSchema` and its docstring with:

```ts
/**
 * Where a spell reaches. `sight` and `unlimited` arrive with the first spell
 * that needs one; the repo adds no variant before a real rule.
 *
 * `area` is the spell's area, authored once, here. The spell synthesizer
 * copies it onto the spell's save, so the save line the table reads names it.
 * A touch spell has none.
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
  z.object({ kind: z.literal("touch") }).strict(),
]);
```

In `SpellDurationSchema`, change `unit: z.enum(["minute"]),` to:

```ts
      unit: z.enum(["round", "minute", "hour"]),
```

Replace the `ROUNDS_PER_DURATION_UNIT` line (keep its docstring) with:

```ts
export const ROUNDS_PER_DURATION_UNIT = { round: 1, minute: 10, hour: 600 } as const;
```

In `FixedSpellGrantSchema`, add after `unlockScaling`:

```ts
  /**
   * The level the spell is cast at, when a grant fixes one above the spell's
   * own: Infernal Legacy's Hellish Rebuke is cast "as a 2nd-level spell". Only
   * on a grant that is not slot-paid; a slot picks its own level.
   */
  castAtLevel: z.number().int().min(1).max(9).optional(),
```

- [ ] **Step 4: Watch them pass**

Run: `pnpm --filter @project/shared test -- spellContract`
Expected: PASS.

- [ ] **Step 5: Keep the engine and the sheet compiling**

A touch range has no `area`, so reading `range.area` on the union no longer typechecks.

In `packages/engine/src/pipeline/spellSynthesizer.ts`, add after `rungAt`:

```ts
/** A spell's area, when its range has one: a touch spell's never does. */
const areaOf = (range: SpellRange | undefined) =>
  range !== undefined && range.kind !== "touch" ? range.area : undefined;
```

and replace the `case "save":` block of `resolveSpellEffect` with:

```ts
    case "save": {
      const area = areaOf(spell.range);
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
        ...(area !== undefined && { areaOfEffect: area }),
        ...(effect.damage !== undefined && { damage: scale(effect.damage) }),
      };
    }
```

In `apps/web/src/components/sheet/SpellsWidget.tsx`, in `rangeText`, add after `if (!range) return undefined;`:

```ts
  if (range.kind === "touch") return "Touch";
```

- [ ] **Step 6: Pin the sheet's reading of the new vocabulary**

Append to the `describe("SpellsWidget")` block in `apps/web/src/components/sheet/__tests__/SpellsWidget.test.tsx`:

```ts
  it("reads a touch range as Touch", async () => {
    mocks.spells.current = [{ ...burningHands, range: { kind: "touch" } }];

    expect((await render()).textContent).toContain("1 action · Touch · V, S");
  });

  it("reads round and hour durations", async () => {
    mocks.spells.current = [
      {
        ...burningHands,
        duration: { kind: "timed", amount: 1, unit: "round", concentration: false },
      },
      {
        ...eldritchBlast,
        duration: { kind: "timed", amount: 8, unit: "hour", concentration: true },
      },
    ];
    const text = (await render()).textContent;

    expect(text).toContain("1 round");
    expect(text).toContain("Concentration, up to 8 hours");
  });
```

Run: `pnpm --filter @project/web test -- SpellsWidget`
Expected: PASS. (`durationText` already pluralises any unit; the round and hour test is a pin, not a change.)

- [ ] **Step 7: Regenerate the schemas, and run every gate**

```bash
pnpm --filter @project/database schemas:generate
pnpm --filter @project/shared test
pnpm --filter @project/engine test -- spellSynthesizer
DATABASE_URL= pnpm --filter @project/database test -- packSchemas
pnpm --filter @project/shared typecheck
pnpm --filter @project/engine typecheck
pnpm --filter @project/database typecheck
pnpm --filter @project/server typecheck
pnpm --filter @project/web typecheck
```

Expected: every suite passes (shared 262); every typecheck is clean. `git diff --stat` lists the five source and test files above plus `segment.schema.json`. Restore CRLF on the four CRLF files you edited, and measure them; `segment.schema.json` stays LF.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/schemas/content/spells.ts packages/shared/src/schemas/__tests__/spellContract.test.ts packages/engine/src/pipeline/spellSynthesizer.ts apps/web/src/components/sheet/SpellsWidget.tsx apps/web/src/components/sheet/__tests__/SpellsWidget.test.tsx packages/database/data/schemas/segment.schema.json
git commit -F - <<'EOF'
feat(shared): touch range, round and hour durations, and a grant's cast level

Identify and Nondetection are touch spells, Command lasts a round, and
Suggestion and Nondetection last eight hours. castAtLevel lets a fixed
grant cast its spell above its own level, as Infernal Legacy casts
Hellish Rebuke at 2nd. A touch range has no area, so the synthesizer and
the sheet stop reading one from it.

<your Co-Authored-By trailer>
EOF
```

---

### Task 2: Every caster says whether it casts rituals

**Files:**
- Modify: `packages/shared/src/schemas/content/character.ts:129-147`
- Modify: `packages/shared/src/schemas/__tests__/spellcastingSchema.test.ts`
- Modify: `packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts:940-946`
- Modify: `packages/database/src/__tests__/spellcastingPack.test.ts:12-75`
- Modify (via the patch script only): `packages/database/data/packs/core_2014_pack/classes/{bard,cleric,druid,fighter,paladin,ranger,rogue,sorcerer,warlock,wizard}.json`
- Modify (generated): `packages/database/data/schemas/segment.schema.json`

**Interfaces:**
- Consumes: nothing from Task 1 beyond a clean tree.
- Produces: `Spellcasting.ritualCasting: boolean`, required. `true` on `class_bard`, `class_cleric`, `class_druid` and `class_wizard`; `false` on `class_paladin`, `class_ranger`, `class_sorcerer`, `class_warlock`, `subclass_fighter_eldritch_knight` and `subclass_rogue_arcane_trickster`.

- [ ] **Step 1: Write the failing schema tests**

In `packages/shared/src/schemas/__tests__/spellcastingSchema.test.ts`:

Replace the first test (`accepts an ability, a progression, a start level, preparation and foci`) with:

```ts
  it("accepts an ability, a progression, a start level, preparation, foci and ritual casting", () => {
    const block = {
      ability: "INT",
      progression: "full",
      startsAtLevel: 1,
      preparation: "prepared",
      focusCategories: ["category_arcane_focus"],
      ritualCasting: true,
    };

    expect(SpellcastingSchema.parse(block)).toEqual(block);
  });
```

Add after the test `rejects a block that does not say how it prepares, or what foci it uses`:

```ts
  // required, not defaulted, like preparation: a caster that never says
  // whether it casts rituals fails to validate instead of reading as "no"
  it("rejects a block that does not say whether it casts rituals", () => {
    expect(() =>
      SpellcastingSchema.parse({
        ability: "WIS",
        progression: "full",
        startsAtLevel: 1,
        preparation: "prepared",
        focusCategories: ["category_holy_symbol"],
      }),
    ).toThrow();
  });
```

In the test `rejects an unknown key, so a typo cannot be authored silently`, add `ritualCasting: false,` after `focusCategories: [],`, so the only thing wrong with the block is `slotTable`.

In `describe("a class may declare how it casts")`, test `carries the block through when present`, add `ritualCasting: true,` after the block's `focusCategories` line.

- [ ] **Step 2: Watch them fail**

Run: `pnpm --filter @project/shared test -- spellcastingSchema`
Expected: FAIL — the strict schema rejects `ritualCasting` as an unknown key, and a block without it still parses.

- [ ] **Step 3: Implement the field**

In `packages/shared/src/schemas/content/character.ts`, add to `SpellcastingSchema` after `focusCategories`:

```ts
    /**
     * Whether this class can cast its ritual spells as rituals: no slot, and
     * ten minutes longer. The bard, cleric, druid and wizard can; the
     * warlock's Book of Ancient Secrets is an invocation, not this.
     */
    ritualCasting: z.boolean(),
```

Run: `pnpm --filter @project/shared test -- spellcastingSchema`
Expected: PASS.

- [ ] **Step 4: Pin what the book says each caster does, and watch it fail**

In `packages/database/src/__tests__/spellcastingPack.test.ts`, replace the `EXPECTED` declaration and the test `states preparation and foci for every caster` with:

```ts
  const EXPECTED: Record<
    string,
    { preparation: string; focusCategories: string[]; ritualCasting: boolean }
  > = {
    class_bard: {
      preparation: "known",
      focusCategories: ["category_musical_instrument"],
      ritualCasting: true,
    },
    class_cleric: {
      preparation: "prepared",
      focusCategories: ["category_holy_symbol"],
      ritualCasting: true,
    },
    class_druid: {
      preparation: "prepared",
      focusCategories: ["category_druidic_focus"],
      ritualCasting: true,
    },
    class_paladin: {
      preparation: "prepared",
      focusCategories: ["category_holy_symbol"],
      ritualCasting: false,
    },
    class_ranger: { preparation: "known", focusCategories: [], ritualCasting: false },
    class_sorcerer: {
      preparation: "known",
      focusCategories: ["category_arcane_focus"],
      ritualCasting: false,
    },
    class_warlock: {
      preparation: "known",
      focusCategories: ["category_arcane_focus"],
      ritualCasting: false,
    },
    class_wizard: {
      preparation: "prepared",
      focusCategories: ["category_arcane_focus"],
      ritualCasting: true,
    },
    subclass_fighter_eldritch_knight: {
      preparation: "known",
      focusCategories: [],
      ritualCasting: false,
    },
    subclass_rogue_arcane_trickster: {
      preparation: "known",
      focusCategories: [],
      ritualCasting: false,
    },
  };

  it("states preparation, foci and ritual casting for every caster", async () => {
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
                  ritualCasting: entry.spellcasting.ritualCasting,
                },
              ],
            ]
          : [],
      ),
    );

    expect(declared).toEqual(EXPECTED);
  });
```

Run: `DATABASE_URL= pnpm --filter @project/database test -- spellcastingPack`
Expected: FAIL — the pack no longer validates, because no class declares `ritualCasting`.

- [ ] **Step 5: Declare it on every caster, through the patch script**

Write the ten patch files. Each sets the whole `spellcasting` block (the op is a shallow set), exactly as it stands today plus `ritualCasting` last:

```bash
node -e '
const fs = require("fs");
const dir = process.argv[1];
const blocks = {
  bard: ["setClassFields", "class_bard", { ability: "CHA", progression: "full", startsAtLevel: 1, preparation: "known", focusCategories: ["category_musical_instrument"], ritualCasting: true }],
  cleric: ["setClassFields", "class_cleric", { ability: "WIS", progression: "full", startsAtLevel: 1, preparation: "prepared", focusCategories: ["category_holy_symbol"], ritualCasting: true }],
  druid: ["setClassFields", "class_druid", { ability: "WIS", progression: "full", startsAtLevel: 1, preparation: "prepared", focusCategories: ["category_druidic_focus"], ritualCasting: true }],
  fighter: ["setSubclassFields", "subclass_fighter_eldritch_knight", { ability: "INT", progression: "third", startsAtLevel: 3, preparation: "known", focusCategories: [], ritualCasting: false }],
  paladin: ["setClassFields", "class_paladin", { ability: "CHA", progression: "half", startsAtLevel: 2, preparation: "prepared", focusCategories: ["category_holy_symbol"], ritualCasting: false }],
  ranger: ["setClassFields", "class_ranger", { ability: "WIS", progression: "half", startsAtLevel: 2, preparation: "known", focusCategories: [], ritualCasting: false }],
  rogue: ["setSubclassFields", "subclass_rogue_arcane_trickster", { ability: "INT", progression: "third", startsAtLevel: 3, preparation: "known", focusCategories: [], ritualCasting: false }],
  sorcerer: ["setClassFields", "class_sorcerer", { ability: "CHA", progression: "full", startsAtLevel: 1, preparation: "known", focusCategories: ["category_arcane_focus"], ritualCasting: false }],
  warlock: ["setClassFields", "class_warlock", { ability: "CHA", progression: "pact", startsAtLevel: 1, preparation: "known", focusCategories: ["category_arcane_focus"], ritualCasting: false }],
  wizard: ["setClassFields", "class_wizard", { ability: "INT", progression: "full", startsAtLevel: 1, preparation: "prepared", focusCategories: ["category_arcane_focus"], ritualCasting: true }],
};
for (const [file, [op, id, spellcasting]] of Object.entries(blocks)) {
  fs.writeFileSync(`${dir}/ritual-${file}.json`, JSON.stringify({ [op]: { [id]: { spellcasting } } }));
}
' "<scratchpad>"
```

Then, from `packages/database`:

```bash
for f in bard cleric druid fighter paladin ranger rogue sorcerer warlock wizard; do
  pnpm exec tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/classes/$f.json "<scratchpad>/ritual-$f.json"
done
```

Expected: `patched …` ten times. `git diff --stat -- packages/database/data/packs` shows ten class files with one inserted line each (the `ritualCasting` line), nothing else. If any other line moved, stop and report.

- [ ] **Step 6: Update the engine's hand-built class**

In `packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts`, in the `spellcasting` block at lines 940–946, add after `focusCategories: [],`:

```ts
          ritualCasting: false,
```

- [ ] **Step 7: Regenerate the schemas, and run every gate**

```bash
pnpm --filter @project/database schemas:generate
pnpm --filter @project/shared test
pnpm --filter @project/engine test
DATABASE_URL= pnpm --filter @project/database test
pnpm --filter @project/shared typecheck
pnpm --filter @project/engine typecheck
pnpm --filter @project/database typecheck
pnpm --filter @project/server typecheck
pnpm --filter @project/web typecheck
```

Expected: shared 263 and engine 1079 pass; the database suite passes (205). Every typecheck is clean. Restore and measure CRLF on the three test files and `character.ts`; the class files keep their endings through the script.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/schemas/content/character.ts packages/shared/src/schemas/__tests__/spellcastingSchema.test.ts packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts packages/database/src/__tests__/spellcastingPack.test.ts packages/database/data/packs/core_2014_pack/classes packages/database/data/schemas/segment.schema.json
git commit -F - <<'EOF'
feat(shared): every caster says whether it casts rituals (#119)

SpellcastingSchema gains a required ritualCasting, required for the same
reason preparation is. The bard, cleric, druid and wizard cast rituals
(PHB chapter 3); the paladin, ranger, sorcerer, warlock, Eldritch Knight
and Arcane Trickster do not.

<your Co-Authored-By trailer>
EOF
```

---

### Task 3: A grant's cast level is validated, and Infernal Legacy casts Hellish Rebuke at 2nd

**Files:**
- Modify: `packages/shared/src/schemas/content/validatePack.ts:7-28`, `:476`, `:605-615`
- Modify: `packages/shared/src/schemas/__tests__/coreRulePack.test.ts` (new `describe` appended)
- Modify: `packages/database/scripts/patchPackSegment.ts:43-66`, `:172`
- Modify (via the patch script only): `packages/database/data/packs/core_2014_pack/races/tiefling.json`
- Modify: `packages/database/src/__tests__/spellcastingPack.test.ts` (new `describe` appended)

**Interfaces:**
- Consumes: `FixedSpellGrant.castAtLevel` (Task 1).
- Produces:
  - issue code `invalid_cast_level`, at path `["traits", <i>, "spells", "fixed", <j>, "castAtLevel"]`;
  - patch op `setFixedSpellGrantFields: Record<traitId, Record<spellId, fields>>`;
  - `infernal_legacy`'s `spell_hellish_rebuke` grant carries `castAtLevel: 2`.

- [ ] **Step 1: Write the failing validation tests**

Append to `packages/shared/src/schemas/__tests__/coreRulePack.test.ts`:

```ts
describe("validateCoreRulePack: a grant's cast level", () => {
  const issuesForGrant = (grant: Record<string, unknown>) => {
    const source = createValidPack() as unknown as {
      traits: Array<Record<string, unknown>>;
      spells: unknown[];
    };
    source.spells.push({
      id: "spell_test_rebuke",
      name: "Test Rebuke",
      level: 2,
      school: "evocation",
      action: {
        id: "action_spell_test_rebuke",
        name: "Test Rebuke",
        activation: "reaction",
        effect: { type: "no_effect" },
      },
      implementation: { mode: "unimplemented", summary: "A test stub." },
    });
    source.traits[0]!.spells = {
      fixed: [{ type: "fixed_spell", spellId: "spell_test_rebuke", ...grant }],
      choices: [],
    };
    return validateCoreRulePack(CoreRulePackSchema.parse(source)).issues;
  };

  const RESOURCE = { usage: { kind: "resource", resourceId: "resource_test" } };

  it("accepts a priced grant cast above its spell's level", () => {
    expect(issuesForGrant({ ...RESOURCE, castAtLevel: 3 })).toEqual([]);
  });

  it("rejects a grant cast below its spell's level", () => {
    expect(issuesForGrant({ ...RESOURCE, castAtLevel: 1 })).toContainEqual({
      code: "invalid_cast_level",
      path: ["traits", 0, "spells", "fixed", 0, "castAtLevel"],
      message: expect.stringContaining("below"),
    });
  });

  // a slot chooses an always-prepared spell's level when it is cast
  it("rejects a cast level on an always-prepared grant", () => {
    expect(
      issuesForGrant({ usage: { kind: "always_prepared" }, castAtLevel: 3 }),
    ).toContainEqual({
      code: "invalid_cast_level",
      path: ["traits", 0, "spells", "fixed", 0, "castAtLevel"],
      message: expect.stringContaining("always prepared"),
    });
  });
});
```

Run: `pnpm --filter @project/shared test -- coreRulePack`
Expected: FAIL — the two rejection tests find no `invalid_cast_level` issue. The acceptance test passes already.

- [ ] **Step 2: Implement the check**

In `packages/shared/src/schemas/content/validatePack.ts`, add `| "invalid_cast_level"` to `CoreRulePackIssueCode` between `"incompatible_ammunition_reference"` and `"incomplete_spell"`:

```ts
  | "incompatible_ammunition_reference"
  | "incomplete_spell"
  | "invalid_cast_level"
  | "invalid_choice_count"
```

(The union is alphabetised: `incomplete_spell` < `invalid_cast_level` < `invalid_choice_count`.)

Add beside `const spellIds = new Set(pack.spells.map((entry) => entry.id));`:

```ts
  const spellLevels = new Map(pack.spells.map((entry) => [entry.id, entry.level]));
```

In the `pack.traits.forEach` loop over `entry.spells?.fixed`, add after the `unknown_resource_reference` check:

```ts
      if (grant.castAtLevel !== undefined) {
        const path = ["traits", index, "spells", "fixed", grantIndex, "castAtLevel"];
        const level = spellLevels.get(grant.spellId);
        if (grant.usage.kind === "always_prepared") {
          issues.push({
            code: "invalid_cast_level",
            path,
            message: `Grant of '${grant.spellId}' is always prepared, so the slot it is cast with chooses its level; castAtLevel is for a grant with its own price.`,
          });
        } else if (level !== undefined && grant.castAtLevel < level) {
          issues.push({
            code: "invalid_cast_level",
            path,
            message: `Grant of '${grant.spellId}' casts it at level ${grant.castAtLevel}, below the spell's own level ${level}.`,
          });
        }
      }
```

Run: `pnpm --filter @project/shared test -- coreRulePack`
Expected: PASS.

- [ ] **Step 3: Teach the patch script to set a grant's fields**

In `packages/database/scripts/patchPackSegment.ts`, add to `Patch` after `setTraitResourceFields`:

```ts
  /**
   * Trait id -> spell id -> fields to set, shallow, on that trait's fixed
   * spell grant. A trait or grant that matches nothing is an error.
   */
  setFixedSpellGrantFields?: Record<string, Record<string, Record<string, unknown>>>;
```

In `Segment`, change the `traits` element type to:

```ts
  traits?: Array<{
    id: string;
    resources?: Array<Record<string, unknown> & { id: string }>;
    spells?: { fixed?: Array<Record<string, unknown> & { spellId: string }> };
  }>;
```

Add after the `setTraitResourceFields` loop:

```ts
for (const [traitId, grants] of Object.entries(
  patch.setFixedSpellGrantFields ?? {},
)) {
  const trait = (segment.traits ?? []).find((entry) => entry.id === traitId);
  if (!trait) throw new Error(`${segmentPath} has no trait '${traitId}'`);
  for (const [spellId, fields] of Object.entries(grants)) {
    const grant = (trait.spells?.fixed ?? []).find(
      (entry) => entry.spellId === spellId,
    );
    if (!grant) {
      throw new Error(
        `${segmentPath} trait '${traitId}' grants no fixed spell '${spellId}'`,
      );
    }
    Object.assign(grant, fields);
  }
}
```

- [ ] **Step 4: Pin Infernal Legacy's cast level, and watch it fail**

Append to `packages/database/src/__tests__/spellcastingPack.test.ts`:

```ts
describe("the shipped pack's fixed spell grants", () => {
  // PHB p.43: "you can cast the hellish rebuke spell as a 2nd-level spell"
  it("casts Infernal Legacy's Hellish Rebuke as a 2nd-level spell", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);
    const grant = pack.traits
      .find((trait) => trait.id === "infernal_legacy")
      ?.spells?.fixed.find((entry) => entry.spellId === "spell_hellish_rebuke");

    expect(grant?.castAtLevel).toBe(2);
  });
});
```

Run: `DATABASE_URL= pnpm --filter @project/database test -- spellcastingPack`
Expected: FAIL — `castAtLevel` is undefined.

- [ ] **Step 5: Patch the tiefling**

```bash
node -e 'require("fs").writeFileSync(process.argv[1] + "/infernal-legacy.json", JSON.stringify({ setFixedSpellGrantFields: { infernal_legacy: { spell_hellish_rebuke: { castAtLevel: 2 } } } }))' "<scratchpad>"
```

From `packages/database`:

```bash
pnpm exec tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/races/tiefling.json "<scratchpad>/infernal-legacy.json"
```

Expected: `patched …`. `git diff -- packages/database/data/packs/core_2014_pack/races/tiefling.json` shows one added `"castAtLevel": 2` line on the Hellish Rebuke grant, plus the one-time expansion of compact `"maxRule": { ... }` objects (see Global Constraints) and nothing else.

Run: `DATABASE_URL= pnpm --filter @project/database test -- spellcastingPack`
Expected: PASS.

- [ ] **Step 6: Run every gate**

```bash
pnpm --filter @project/shared test
DATABASE_URL= pnpm --filter @project/database test
pnpm --filter @project/shared typecheck
pnpm --filter @project/database typecheck
```

Expected: shared 266 and database 206 pass; both typechecks are clean. Restore and measure CRLF on the four source and test files you edited; `tiefling.json` keeps its endings through the script.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/schemas/content/validatePack.ts packages/shared/src/schemas/__tests__/coreRulePack.test.ts packages/database/scripts/patchPackSegment.ts packages/database/data/packs/core_2014_pack/races/tiefling.json packages/database/src/__tests__/spellcastingPack.test.ts
git commit -F - <<'EOF'
feat(database): Infernal Legacy casts Hellish Rebuke as a 2nd-level spell

castAtLevel is validated: below the spell's own level, or on an
always-prepared grant whose slot already chooses the level, is
invalid_cast_level. The patch script gains setFixedSpellGrantFields.

races/tiefling.json does not round-trip through the patch script: its
compact maxRule objects expand to multi-line. The owner accepted the same
one-time expansion for elf.json.

<your Co-Authored-By trailer>
EOF
```

---

### Task 4: Author the ten spells

**Files:**
- Modify (via the patch script only): `packages/database/data/packs/core_2014_pack/spells/core.json`, `spells/unimplemented.json`
- Modify: `packages/database/src/__tests__/implementationMarkers.test.ts:118-135`
- Modify: `packages/engine/src/pipeline/__tests__/spellSynthesizer.test.ts:137-144`
- Modify: `packages/engine/src/pipeline/__tests__/characterEngine.test.ts:2064-2071`
- Modify: `packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts:626-628`

**Interfaces:**
- Consumes: `touch`, `round`, `hour` (Task 1); Infernal Legacy's `castAtLevel: 2` (Task 3), which this task's Hellish Rebuke (level 1) satisfies.
- Produces: ten authored spells in `spells/core.json`, appended in this order: `spell_darkness` (2), `spell_minor_illusion` (0), `spell_thaumaturgy` (0), `spell_hellish_rebuke` (1), `spell_command` (1), `spell_identify` (1, ritual), `spell_augury` (2, ritual), `spell_suggestion` (2), `spell_nondetection` (3), `spell_speak_with_dead` (3). Action ids are unchanged: `action_spell_<name>`.

- [ ] **Step 1: Record the ten as authored, and watch the list fail**

In `packages/database/src/__tests__/implementationMarkers.test.ts`, replace the body of `records which spells carry rules` with:

```ts
    const pack = await assembleCoreRulePack(SHIPPED_PACK);

    // 14 of 111 since feat/spells-first-ten (#31). Add each spell as it is
    // authored; one leaving this list is a regression.
    expect(
      pack.spells
        .filter((spell) => !spell.implementation)
        .map((spell) => spell.id)
        .sort(),
    ).toEqual([
      "spell_augury",
      "spell_burning_hands",
      "spell_command",
      "spell_dancing_lights",
      "spell_darkness",
      "spell_eldritch_blast",
      "spell_faerie_fire",
      "spell_hellish_rebuke",
      "spell_identify",
      "spell_minor_illusion",
      "spell_nondetection",
      "spell_speak_with_dead",
      "spell_suggestion",
      "spell_thaumaturgy",
    ]);
    expect(pack.spells).toHaveLength(111);
```

Run: `DATABASE_URL= pnpm --filter @project/database test -- implementationMarkers`
Expected: FAIL — only the four `feat/spell-casting` spells are authored.

- [ ] **Step 2: Write the two patches**

Write `<scratchpad>/ten-spells.json` with exactly this content (UTF-8; the em dashes are literal):

```json
{
  "upsertSpells": [
    {
      "id": "spell_darkness",
      "name": "Darkness",
      "level": 2,
      "school": "evocation",
      "isRitual": false,
      "lore": {
        "shortDescription": "Magical darkness fills a 15-foot-radius sphere within 60 feet. Darkvision can't see through it and nonmagical light can't light it. Concentration, up to 10 minutes.",
        "fullText": "Magical darkness spreads from a point you choose within range to fill a 15-foot-radius sphere for the duration. The darkness spreads around corners. A creature with darkvision can't see through this darkness, and nonmagical light can't illuminate it.\n\nIf the point you choose is on an object you are holding or one that isn't being worn or carried, the darkness emanates from the object and moves with it. Completely covering the source of the darkness with an opaque object, such as a bowl or a helm, blocks the darkness.\n\nIf any of this spell's area overlaps with an area of light created by a spell of 2nd level or lower, the spell that created the light is dispelled."
      },
      "range": { "kind": "feet", "feet": 60, "area": { "shape": "sphere", "size": 15 } },
      "components": {
        "verbal": true,
        "somatic": false,
        "material": true,
        "materialDescription": "bat fur and a drop of pitch or piece of coal"
      },
      "duration": { "kind": "timed", "amount": 10, "unit": "minute", "concentration": true },
      "action": {
        "id": "action_spell_darkness",
        "name": "Darkness",
        "activation": "action",
        "tableNote": "Magical darkness fills a 15-foot-radius sphere and spreads around corners. Darkvision can't see through it and nonmagical light can't light it. Centred on an object you hold or one nobody is wearing or carrying, it moves with the object, and covering the object with something opaque blocks it. Where it overlaps light from a spell of 2nd level or lower, that spell is dispelled.",
        "effect": {
          "type": "apply_effect",
          "effectName": "Darkness",
          "durationType": "rounds",
          "durationRounds": 100,
          "isSelfConcentration": true
        }
      }
    },
    {
      "id": "spell_minor_illusion",
      "name": "Minor Illusion",
      "level": 0,
      "school": "illusion",
      "isRitual": false,
      "lore": {
        "shortDescription": "A sound, or the image of an object no bigger than a 5-foot cube, within 30 feet for 1 minute. An Intelligence (Investigation) check against your spell save DC sees through it.",
        "fullText": "You create a sound or an image of an object within range that lasts for the duration. The illusion also ends if you dismiss it as an action or cast this spell again.\n\nIf you create a sound, its volume can range from a whisper to a scream. It can be your voice, someone else's voice, a lion's roar, a beating of drums, or any other sound you choose. The sound continues unabated throughout the duration, or you can make discrete sounds at different times before the spell ends.\n\nIf you create an image of an object—such as a chair, muddy footprints, or a small chest—it must be no larger than a 5-foot cube. The image can't create sound, light, smell, or any other sensory effect. Physical interaction with the image reveals it to be an illusion, because things can pass through it.\n\nIf a creature uses its action to examine the sound or image, the creature can determine that it is an illusion with a successful Intelligence (Investigation) check against your spell save DC. If a creature discerns the illusion for what it is, the illusion becomes faint to the creature."
      },
      "range": { "kind": "feet", "feet": 30 },
      "components": {
        "verbal": false,
        "somatic": true,
        "material": true,
        "materialDescription": "a bit of fleece"
      },
      "duration": { "kind": "timed", "amount": 1, "unit": "minute", "concentration": false },
      "action": {
        "id": "action_spell_minor_illusion",
        "name": "Minor Illusion",
        "activation": "action",
        "tableNote": "Either a sound (a whisper to a scream, constant or in bursts) or an image of an object no bigger than a 5-foot cube that makes no sound, light or smell. Anything passing through the image reveals it. A creature can use its action to make an Intelligence (Investigation) check against your spell save DC; on a success the illusion turns faint to it. It ends early if you dismiss it as an action or cast the spell again.",
        "effect": { "type": "no_effect" }
      }
    },
    {
      "id": "spell_thaumaturgy",
      "name": "Thaumaturgy",
      "level": 0,
      "school": "transmutation",
      "isRitual": false,
      "lore": {
        "shortDescription": "A minor wonder within 30 feet: a booming voice, flickering flames, harmless tremors, a sudden sound, a door flung open or shut, or strange eyes.",
        "fullText": "You manifest a minor wonder, a sign of supernatural power, within range. You create one of the following magical effects within range:\n\n- Your voice booms up to three times as loud as normal for 1 minute.\n- You cause flames to flicker, brighten, dim, or change color for 1 minute.\n- You cause harmless tremors in the ground for 1 minute.\n- You create an instantaneous sound that originates from a point of your choice within range, such as a rumble of thunder, the cry of a raven, or ominous whispers.\n- You instantaneously cause an unlocked door or window to fly open or slam shut.\n- You alter the appearance of your eyes for 1 minute.\n\nIf you cast this spell multiple times, you can have up to three of its 1-minute effects active at a time, and you can dismiss such an effect as an action."
      },
      "range": { "kind": "feet", "feet": 30 },
      "components": { "verbal": true, "somatic": false, "material": false },
      "duration": { "kind": "timed", "amount": 1, "unit": "minute", "concentration": false },
      "action": {
        "id": "action_spell_thaumaturgy",
        "name": "Thaumaturgy",
        "activation": "action",
        "tableNote": "Pick one: your voice booms three times louder; flames flicker, brighten, dim or change colour; harmless tremors shake the ground; or your eyes change appearance, each for 1 minute. Or, instantly, a sound rings out from a point in range, or an unlocked door or window flies open or slams shut. Up to three 1-minute effects can be active at once; dismiss one as an action.",
        "effect": { "type": "no_effect" }
      }
    },
    {
      "id": "spell_hellish_rebuke",
      "name": "Hellish Rebuke",
      "level": 1,
      "school": "evocation",
      "isRitual": false,
      "lore": {
        "shortDescription": "A reaction when a creature you can see damages you: it makes a Dexterity save against 2d10 fire damage, half on a success, and 1d10 more for each slot level above 1st.",
        "fullText": "Cast as a reaction when a creature you can see within 60 feet of you damages you. You point at that creature, and hellish flames flare around it for a moment. It makes a Dexterity saving throw, taking 2d10 fire damage if it fails, or half as much if it succeeds.\n\nAt Higher Levels. Cast with a spell slot of 2nd level or higher, the damage rises by 1d10 for each slot level above 1st."
      },
      "range": { "kind": "feet", "feet": 60 },
      "components": { "verbal": true, "somatic": true, "material": false },
      "duration": { "kind": "instantaneous" },
      "action": {
        "id": "action_spell_hellish_rebuke",
        "name": "Hellish Rebuke",
        "activation": "reaction",
        "tableNote": "Cast as a reaction when a creature within 60 feet that you can see damages you. That creature makes the save.",
        "effect": {
          "type": "save",
          "savingThrow": {
            "targetStat": "DEX",
            "dcCalculation": {
              "base": 8,
              "scalingStat": "SPELLCASTING_MOD",
              "includeProficiency": true
            },
            "saveEffect": "half_damage"
          },
          "damage": [
            {
              "sourceName": "Hellish Rebuke",
              "baseDice": "2d10",
              "damageType": "fire",
              "perSlotAbove": "1d10"
            }
          ]
        }
      }
    },
    {
      "id": "spell_command",
      "name": "Command",
      "level": 1,
      "school": "enchantment",
      "isRitual": false,
      "lore": {
        "shortDescription": "A one-word command to a creature within 60 feet: on a failed Wisdom save it obeys on its next turn. One more target for each slot level above 1st.",
        "fullText": "You speak a one-word command to a creature you can see within range. The target must succeed on a Wisdom saving throw or follow the command on its next turn. The spell has no effect if the target is undead, if it doesn't understand your language, or if your command is directly harmful to it.\n\nSome typical commands and their effects follow. You might issue a command other than one described here. If you do so, the DM determines how the target behaves. If the target can't follow your command, the spell ends.\n\nApproach. The target moves toward you by the shortest and most direct route, ending its turn if it moves within 5 feet of you.\n\nDrop. The target drops whatever it is holding and then ends its turn.\n\nFlee. The target spends its turn moving away from you by the fastest available means.\n\nGrovel. The target falls prone and then ends its turn.\n\nHalt. The target doesn't move and takes no actions. A flying creature stays aloft, provided that it is able to do so. If it must move to stay aloft, it flies the minimum distance needed to remain in the air.\n\nAt Higher Levels. When you cast this spell using a spell slot of 2nd level or higher, you can affect one additional creature for each slot level above 1st. The creatures must be within 30 feet of each other when you target them."
      },
      "range": { "kind": "feet", "feet": 60 },
      "components": { "verbal": true, "somatic": false, "material": false },
      "duration": { "kind": "timed", "amount": 1, "unit": "round", "concentration": false },
      "action": {
        "id": "action_spell_command",
        "name": "Command",
        "activation": "action",
        "tableNote": "Speak a one-word command. On a failed save the target obeys on its next turn: Approach (it moves to you and stops within 5 feet), Drop (it drops what it holds and ends its turn), Flee (it moves away by the fastest means), Grovel (it falls prone and ends its turn) or Halt (it doesn't move or act). The DM rules on any other command. No effect on undead, on a creature that doesn't understand you, or if the command is directly harmful to it. Each slot level above 1st adds one more target; all must be within 30 feet of each other.",
        "effect": {
          "type": "save",
          "savingThrow": {
            "targetStat": "WIS",
            "dcCalculation": {
              "base": 8,
              "scalingStat": "SPELLCASTING_MOD",
              "includeProficiency": true
            },
            "saveEffect": "negates_effect"
          }
        }
      }
    },
    {
      "id": "spell_identify",
      "name": "Identify",
      "level": 1,
      "school": "divination",
      "isRitual": true,
      "lore": {
        "shortDescription": "Touch an object for a minute to learn its magical properties, attunement and charges, or a creature to learn the spells affecting it. Ritual; needs a pearl worth 100 gp.",
        "fullText": "You choose one object that you must touch throughout the casting of the spell. If it is a magic item or some other magic-imbued object, you learn its properties and how to use them, whether it requires attunement to use, and how many charges it has, if any. You learn whether any spells are affecting the item and what they are. If the item was created by a spell, you learn which spell created it.\n\nIf you instead touch a creature throughout the casting, you learn what spells, if any, are currently affecting it."
      },
      "range": { "kind": "touch" },
      "components": {
        "verbal": true,
        "somatic": true,
        "material": true,
        "materialDescription": "a pearl worth at least 100 gp and an owl feather",
        "goldCost": 100
      },
      "duration": { "kind": "instantaneous" },
      "action": {
        "id": "action_spell_identify",
        "name": "Identify",
        "activation": "minute",
        "tableNote": "Touch an object throughout the casting. If it is magical, the DM tells you its properties and how to use it, whether it needs attunement, how many charges it has, which spells affect it, and which spell created it. Touch a creature instead to learn which spells are affecting it. The pearl isn't consumed.",
        "effect": { "type": "no_effect" }
      }
    },
    {
      "id": "spell_augury",
      "name": "Augury",
      "level": 2,
      "school": "divination",
      "isRitual": true,
      "lore": {
        "shortDescription": "An omen of weal, woe, both or nothing about something you plan to do within 30 minutes. Ritual; needs divining tokens worth 25 gp.",
        "fullText": "By casting gem-inlaid sticks, rolling dragon bones, laying out ornate cards, or employing some other divining tool, you receive an omen from an otherworldly entity about the results of a specific course of action that you plan to take within the next 30 minutes. The DM chooses from the following possible omens:\n\n- Weal, for good results\n- Woe, for bad results\n- Weal and woe, for both good and bad results\n- Nothing, for results that aren't especially good or bad\n\nThe spell doesn't take into account any possible circumstances that might change the outcome, such as the casting of additional spells or the loss or gain of a companion.\n\nIf you cast the spell two or more times before completing your next long rest, there is a cumulative 25 percent chance for each casting after the first that you get a random reading. The DM makes this roll in secret."
      },
      "range": { "kind": "self" },
      "components": {
        "verbal": true,
        "somatic": true,
        "material": true,
        "materialDescription": "specially marked sticks, bones, or similar tokens worth at least 25 gp",
        "goldCost": 25
      },
      "duration": { "kind": "instantaneous" },
      "action": {
        "id": "action_spell_augury",
        "name": "Augury",
        "activation": "minute",
        "tableNote": "Describe something you plan to do within the next 30 minutes; the DM answers weal, woe, weal and woe, or nothing. Later changes, such as new spells or a companion lost or gained, aren't foreseen. Each casting after the first before your next long rest adds a cumulative 25% chance of a random answer, which the DM rolls in secret.",
        "effect": { "type": "no_effect" }
      }
    },
    {
      "id": "spell_suggestion",
      "name": "Suggestion",
      "level": 2,
      "school": "enchantment",
      "isRitual": false,
      "lore": {
        "shortDescription": "A creature within 30 feet that fails a Wisdom save follows a reasonable-sounding suggestion. Concentration, up to 8 hours.",
        "fullText": "You suggest a course of activity (limited to a sentence or two) and magically influence a creature you can see within range that can hear and understand you. Creatures that can't be charmed are immune to this effect. The suggestion must be worded in such a manner as to make the course of action sound reasonable. Asking the creature to stab itself, throw itself onto a spear, immolate itself, or do some other obviously harmful act ends the spell.\n\nThe target must make a Wisdom saving throw. On a failed save, it pursues the course of action you described to the best of its ability. The suggested course of action can continue for the entire duration. If the suggested activity can be completed in a shorter time, the spell ends when the subject finishes what it was asked to do.\n\nYou can also specify conditions that will trigger a special activity during the duration. For example, you might suggest that a knight give her warhorse to the first beggar she meets. If the condition isn't met before the spell expires, the activity isn't performed.\n\nIf you or any of your companions damage the target, the spell ends."
      },
      "range": { "kind": "feet", "feet": 30 },
      "components": {
        "verbal": true,
        "somatic": false,
        "material": true,
        "materialDescription": "a snake's tongue and either a bit of honeycomb or a drop of sweet oil"
      },
      "duration": { "kind": "timed", "amount": 8, "unit": "hour", "concentration": true },
      "action": {
        "id": "action_spell_suggestion",
        "name": "Suggestion",
        "activation": "action",
        "tableNote": "Suggest a reasonable-sounding course of action, in a sentence or two, to a creature that can hear and understand you; creatures that can't be charmed are immune. On a failed save it follows the suggestion for the duration, or until the task is done. An obviously harmful suggestion ends the spell, as does damage from you or your companions. A suggestion can wait on a trigger; if the trigger never comes, nothing happens.",
        "effect": {
          "type": "macro",
          "effects": [
            {
              "type": "save",
              "savingThrow": {
                "targetStat": "WIS",
                "dcCalculation": {
                  "base": 8,
                  "scalingStat": "SPELLCASTING_MOD",
                  "includeProficiency": true
                },
                "saveEffect": "negates_effect"
              }
            },
            {
              "type": "apply_effect",
              "effectName": "Suggestion",
              "durationType": "rounds",
              "durationRounds": 4800,
              "isSelfConcentration": true
            }
          ]
        }
      }
    },
    {
      "id": "spell_nondetection",
      "name": "Nondetection",
      "level": 3,
      "school": "abjuration",
      "isRitual": false,
      "lore": {
        "shortDescription": "For 8 hours, a creature, place or object you touch can't be targeted by divination magic or seen through scrying. Consumes diamond dust worth 25 gp.",
        "fullText": "For the duration, you hide a target that you touch from divination magic. The target can be a willing creature or a place or an object no larger than 10 feet in any dimension. The target can't be targeted by any divination magic or perceived through magical scrying sensors."
      },
      "range": { "kind": "touch" },
      "components": {
        "verbal": true,
        "somatic": true,
        "material": true,
        "materialDescription": "a pinch of diamond dust worth 25 gp sprinkled over the target, which the spell consumes",
        "goldCost": 25,
        "isConsumed": true
      },
      "duration": { "kind": "timed", "amount": 8, "unit": "hour", "concentration": false },
      "action": {
        "id": "action_spell_nondetection",
        "name": "Nondetection",
        "activation": "action",
        "tableNote": "For 8 hours the target — a willing creature, or a place or object no larger than 10 feet in any dimension — can't be targeted by divination magic or perceived through magical scrying sensors. The diamond dust is consumed.",
        "effect": { "type": "no_effect" }
      }
    },
    {
      "id": "spell_speak_with_dead",
      "name": "Speak with Dead",
      "level": 3,
      "school": "necromancy",
      "isRitual": false,
      "lore": {
        "shortDescription": "A corpse within 10 feet answers up to five questions over 10 minutes, knowing only what it knew in life.",
        "fullText": "You grant the semblance of life and intelligence to a corpse of your choice within range, allowing it to answer the questions you pose. The corpse must still have a mouth and can't be undead. The spell fails if the corpse was the target of this spell within the last 10 days.\n\nUntil the spell ends, you can ask the corpse up to five questions. The corpse knows only what it knew in life, including the languages it knew. Answers are usually brief, cryptic, or repetitive, and the corpse is under no compulsion to offer a truthful answer if you are hostile to it or it recognizes you as an enemy. This spell doesn't return the creature's soul to its body, only its animating spirit. Thus, the corpse can't learn new information, doesn't comprehend anything that has happened since it died, and can't speculate about future events."
      },
      "range": { "kind": "feet", "feet": 10 },
      "components": {
        "verbal": true,
        "somatic": true,
        "material": true,
        "materialDescription": "burning incense"
      },
      "duration": { "kind": "timed", "amount": 10, "unit": "minute", "concentration": false },
      "action": {
        "id": "action_spell_speak_with_dead",
        "name": "Speak with Dead",
        "activation": "action",
        "tableNote": "A corpse that still has a mouth and isn't undead answers up to five questions before the spell ends. The spell fails if the corpse was its target in the last 10 days. The corpse knows only what it knew in life, answers briefly, cryptically or repetitively, and needn't tell the truth to someone it sees as an enemy.",
        "effect": { "type": "no_effect" }
      }
    }
  ]
}
```

Note the stub's name was "Speak With Dead"; the authored spell uses the book's "Speak with Dead".

Write `<scratchpad>/ten-stubs.json`:

```json
{
  "deleteSpellIds": [
    "spell_darkness",
    "spell_minor_illusion",
    "spell_thaumaturgy",
    "spell_hellish_rebuke",
    "spell_command",
    "spell_identify",
    "spell_augury",
    "spell_suggestion",
    "spell_nondetection",
    "spell_speak_with_dead"
  ]
}
```

- [ ] **Step 3: Apply them**

From `packages/database`:

```bash
pnpm exec tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/spells/core.json "<scratchpad>/ten-spells.json"
pnpm exec tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/spells/unimplemented.json "<scratchpad>/ten-stubs.json"
```

Expected: `patched …` twice. `spells/core.json` gains ten spells after Burning Hands; `spells/unimplemented.json` loses its first ten entries and nothing else.

- [ ] **Step 4: Watch the list pass**

Run: `DATABASE_URL= pnpm --filter @project/database test -- implementationMarkers`
Expected: PASS. If pack assembly reports a validation issue instead, it names the spell and the rule (`concentration_mismatch`, `incomplete_spell`, …): fix the patch file and re-apply the upsert (it replaces by id).

- [ ] **Step 5: Move three tests off spells that are no longer stubs**

These tests used Minor Illusion as "a picked stub", or Command as "a second cantrip". Minor Illusion is castable now, and Command is a 1st-level spell, so a cantrip node no longer offers it. Every remaining stub keeps the placeholder level 0, so Bless serves as the stub instead.

In `packages/engine/src/pipeline/__tests__/spellSynthesizer.test.ts`, replace the test `lists a stub the character picked, and makes no action of it` with:

```ts
  it("lists a stub the character picked, and makes no action of it", () => {
    // every stub keeps the placeholder level 0, so a cantrip node takes it
    const result = synthesize(
      save({
        classes: [
          {
            classId: "class_warlock",
            level: 1,
            selections: {
              warlock_level_1_cantrips: ["spell_eldritch_blast", "spell_bless"],
            },
          },
        ],
      }),
    );

    expect(find(result, "spell_bless")?.actionId).toBeUndefined();
    expect(
      result.actions.some((action) => action.id.startsWith("action_spell_bless")),
    ).toBe(false);
  });
```

In `packages/engine/src/pipeline/__tests__/characterEngine.test.ts`, replace the test `lists a stub without offering it as an action` with:

```ts
  it("lists a stub without offering it as an action", () => {
    // every stub keeps the placeholder level 0, so a cantrip node takes it
    const sheet = buildSheet({
      ...halfElfFighter(),
      classes: [
        {
          classId: "class_warlock",
          level: 5,
          selections: {
            warlock_level_1_cantrips: ["spell_eldritch_blast", "spell_bless"],
          },
        },
      ],
    });

    expect(sheet.spells.map((spell) => spell.spellId)).toContain("spell_bless");
    expect(
      sheet.actions.some((action) => action.id.startsWith("action_spell_bless")),
    ).toBe(false);
  });
```

In `packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts`, in the test `rejects a High Elf's cantrip the block does not offer, or one too many`, change:

```ts
      high_elf_cantrip: ["spell_thaumaturgy", "spell_command"],
```

to:

```ts
      high_elf_cantrip: ["spell_thaumaturgy", "spell_bless"],
```

(With Command, the node would now also report `invalid_option`, and the test pins one issue.)

- [ ] **Step 6: Run every suite that reads the pack**

```bash
pnpm --filter @project/engine test
DATABASE_URL= pnpm --filter @project/database test
DATABASE_URL= pnpm --filter @project/server test
pnpm --filter @project/web test
pnpm --filter @project/engine typecheck
pnpm --filter @project/database typecheck
```

Expected: engine 1079, database 206, server 539 and web 505, all passing; both typechecks clean. A failure elsewhere means a test depended on one of these ten being a level-0 stub: stop and report NEEDS_CONTEXT with the test's name. Restore and measure CRLF on the four test files.

- [ ] **Step 7: Commit**

```bash
git add packages/database/data/packs/core_2014_pack/spells packages/database/src/__tests__/implementationMarkers.test.ts packages/engine/src/pipeline/__tests__/spellSynthesizer.test.ts packages/engine/src/pipeline/__tests__/characterEngine.test.ts packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts
git commit -F - <<'EOF'
feat(database): author the first ten spell stubs (#31)

Darkness, Minor Illusion, Thaumaturgy, Hellish Rebuke, Command, Identify,
Augury, Suggestion, Nondetection and Speak with Dead move to
spells/core.json with their real level, school, range, components,
duration and action. Rules text is the SRD 5.1 wording, except Hellish
Rebuke, which is not in the SRD and is paraphrased. 14 of 111 authored.

Three tests that used Minor Illusion or Command as a stub cantrip use
Bless, which is still a stub.

<your Co-Authored-By trailer>
EOF
```

---

### Task 5: The synthesizer stamps a fixed cast level, and knows what can be a ritual

**Files:**
- Modify: `packages/engine/src/pipeline/spellSynthesizer.ts`
- Modify: `packages/engine/src/pipeline/__tests__/spellSynthesizer.test.ts`
- Modify: `packages/engine/src/pipeline/__tests__/spellCast.test.ts:15-37` (fixture only)
- Modify: `apps/web/src/components/sheet/__tests__/SpellsWidget.test.tsx:61-111` (fixtures only)

**Interfaces:**
- Consumes: `FixedSpellGrant.castAtLevel` (Task 1); `Spellcasting.ritualCasting` (Task 2); Infernal Legacy's `castAtLevel: 2` (Task 3); the authored spells (Task 4).
- Produces, on `CastableSpell`:
  - `castLevel?: number` — set from a grant's `castAtLevel`;
  - `ritual: boolean` — required.
  - The resolved action of a `castAtLevel` grant carries damage stamped at that level with no `perSlotAbove`: Infernal Legacy's `action_spell_hellish_rebuke@infernal_legacy` rolls `3d10`.

- [ ] **Step 1: Write the failing tests**

In `packages/engine/src/pipeline/__tests__/spellSynthesizer.test.ts`, add after the `lightCleric` helper:

```ts
const TIEFLING = {
  baseRaceId: "race_tiefling",
  hasSubraces: false,
  subraceId: null,
} as const;

const tieflingFighter = (level: number) =>
  save({
    race: TIEFLING,
    classes: [
      {
        classId: "class_fighter",
        level,
        selections: { fighter_level_1_fighting_style: ["trait_fs_defense"] },
      },
    ],
  });

const knowledgeCleric = (level: number) =>
  save({
    classes: [
      {
        classId: "class_cleric",
        level,
        subclassId: "subclass_cleric_knowledge",
        selections: {},
      },
    ],
  });
```

Append to `describe("synthesizeSpells")`:

```ts
  // PHB p.43: Infernal Legacy casts it "as a 2nd-level spell"
  it("casts Infernal Legacy's Hellish Rebuke at 2nd level: 3d10, and no further upcast", () => {
    const result = synthesize(tieflingFighter(3), scores({ CHA: 14 }));

    expect(find(result, "spell_hellish_rebuke")).toMatchObject({
      level: 1,
      castLevel: 2,
      ability: "CHA",
      payment: { kind: "resource", resourceId: "infernal_legacy_hellish_rebuke" },
    });

    const effect = actionOf(result, "action_spell_hellish_rebuke@infernal_legacy")?.effect;
    const damage = effect?.type === "save" ? effect.damage : undefined;
    expect(damage).toEqual([
      expect.objectContaining({ baseDice: "3d10", damageType: "fire" }),
    ]);
    expect(damage?.[0]).not.toHaveProperty("perSlotAbove");
  });

  it("gives a grant with no fixed cast level none", () => {
    expect(
      find(synthesize(drowWizard(3)), "spell_faerie_fire", "drow_magic"),
    ).not.toHaveProperty("castLevel");
  });

  it("lets a Knowledge cleric cast Identify and Augury as rituals, and nothing else", () => {
    const result = synthesize(knowledgeCleric(3), scores({ WIS: 16 }));

    expect(find(result, "spell_identify")?.ritual).toBe(true);
    expect(find(result, "spell_augury")?.ritual).toBe(true);
    expect(find(result, "spell_command")?.ritual).toBe(false);
  });

  it("casts a ritual only through a class that casts rituals", () => {
    const pick = (classId: string, nodeId: string) =>
      synthesize(
        save({
          classes: [{ classId, level: 1, selections: { [nodeId]: ["spell_identify"] } }],
        }),
      );

    expect(
      find(pick("class_wizard", "wizard_level_1_spellbook"), "spell_identify")?.ritual,
    ).toBe(true);
    expect(
      find(pick("class_sorcerer", "sorcerer_level_1_spells_known"), "spell_identify")
        ?.ritual,
    ).toBe(false);
  });

  // a trait's spell is nobody's class: Drow Magic, Infernal Legacy, a feat
  it("never casts a trait's spell as a ritual", () => {
    const result = synthesize(
      save({
        race: {
          baseRaceId: "race_elf",
          hasSubraces: true,
          subraceId: "subrace_elf_high",
        },
        classes: [{ classId: "class_wizard", level: 1, selections: {} }],
        // a pick the High Elf's cantrip block would not offer: the
        // synthesizer lists whatever is stored, which is what this needs
        traitSelections: { high_elf_cantrip: ["spell_identify"] },
      }),
    );

    expect(
      find(result, "spell_identify", "subrace_elf_high_cantrip")?.ritual,
    ).toBe(false);
  });
```

- [ ] **Step 2: Watch them fail**

Run: `pnpm --filter @project/engine test -- spellSynthesizer`
Expected: FAIL — `castLevel` and `ritual` are undefined, and Hellish Rebuke rolls `2d10` with its `perSlotAbove`. (`gives a grant with no fixed cast level none` passes already.)

- [ ] **Step 3: Implement**

In `packages/engine/src/pipeline/spellSynthesizer.ts`:

Change the `actionScaling` import to:

```ts
import {
  resolveSegmentDice,
  upcastDice,
  type ScalingLevels,
} from "./actionScaling.js";
```

In `CastableSpell`, add after `level: number;`:

```ts
  /**
   * The level a grant fixes it to be cast at, above its own: Infernal
   * Legacy's Hellish Rebuke is cast as a 2nd-level spell. Its dice are
   * already stamped at this level.
   */
  castLevel?: number;
```

and after `preparationTracked: boolean;`:

```ts
  /**
   * Whether this source can cast it as a ritual: a ritual spell, through a
   * class whose spellcasting casts rituals. A trait's spell never can.
   */
  ritual: boolean;
```

Add after `areaOf` (Task 1):

```ts
/**
 * A segment cast at the level its grant fixes: the upcast dice folded into
 * its base and nothing left to add, so no slot can upcast it again.
 */
const atCastLevel = (
  segment: DamageSegment,
  spellLevel: number,
  castLevel: number | undefined,
): DamageSegment => {
  if (castLevel === undefined || segment.perSlotAbove === undefined) return segment;
  const stamped: DamageSegment = {
    ...segment,
    baseDice: upcastDice(segment, { spellLevel, castLevel }),
  };
  delete stamped.perSlotAbove;
  return stamped;
};
```

Give `resolveSpellEffect` a fifth parameter and use it in `scale`:

```ts
const resolveSpellEffect = (
  effect: CoreEffect,
  numbers: CasterNumbers,
  spell: SpellDefinition,
  levels: ScalingLevels,
  castLevel: number | undefined,
): CoreEffect => {
  const scale = (segments: DamageSegment[]) =>
    segments.map((segment) =>
      atCastLevel(resolveSegmentDice(segment, levels), spell.level, castLevel),
    );
```

(the rest of `resolveSpellEffect` is unchanged). Update its docstring's first sentence to: `One effect with its caster stamped in, ahead of the roll the way weapons are: attack bonus and beam count on an attack, DC and area on a save, and every damage die at the character's level and at a grant's fixed cast level.`

Replace `resolveSpellAction` with:

```ts
const resolveSpellAction = (
  spell: SpellDefinition,
  numbers: CasterNumbers,
  levels: ScalingLevels,
  actionId: string,
  payment: SpellPayment,
  castLevel: number | undefined,
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
              resolveSpellEffect(nested, numbers, spell, levels, castLevel),
            ),
          }
        : resolveSpellEffect(effect, numbers, spell, levels, castLevel),
    ...(payment.kind === "resource" && { consumesResource: payment.resourceId }),
  };
};
```

In `synthesizeSpells`, add to the `add` function's `entry` parameter type, after `focusCategories`:

```ts
      castAtLevel?: number;
```

Inside `add`, replace the `actions.push(...)` call with:

```ts
      actions.push(
        resolveSpellAction(
          spell,
          numbers,
          levels,
          actionId,
          entry.payment,
          entry.castAtLevel,
        ),
      );
```

and in the `spells.push({...})` object, add after `level: spell.level,`:

```ts
      ...(entry.castAtLevel !== undefined && { castLevel: entry.castAtLevel }),
```

and after `preparationTracked: entry.preparationTracked,`:

```ts
      ritual:
        spell.isRitual &&
        entry.source.kind === "class" &&
        castingOf(entry.source.classId)?.ritualCasting === true,
```

In section `// 1 - fixed grants on the character's traits`, add to the `add(spell, {...})` object after `focusCategories: casting?.focusCategories ?? [],`:

```ts
        ...(grant.castAtLevel !== undefined && { castAtLevel: grant.castAtLevel }),
```

In the `synthesizeSpells` docstring, change `the caster's numbers stamped in, dice at the character's level -` to `the caster's numbers stamped in, dice at the character's level and at any cast level its grant fixes -`.

- [ ] **Step 4: Give the hand-built castable spells the new field**

`ritual` is required, so two test files' `CastableSpell` literals need it.

In `packages/engine/src/pipeline/__tests__/spellCast.test.ts`, in the `spell` fixture, add after `preparationTracked: true,`:

```ts
  ritual: false,
```

In `apps/web/src/components/sheet/__tests__/SpellsWidget.test.tsx`, add `ritual: false,` after `preparationTracked: true,` in `eldritchBlast` and in `darkness`. (`dancingLights` and `burningHands` spread `eldritchBlast`.)

- [ ] **Step 5: Watch them pass, and run every gate**

```bash
pnpm --filter @project/engine test
pnpm --filter @project/web test
DATABASE_URL= pnpm --filter @project/server test
pnpm --filter @project/engine typecheck
pnpm --filter @project/server typecheck
pnpm --filter @project/web typecheck
```

Expected: engine 1084, web 505 and server 539 pass; every typecheck is clean. Restore and measure CRLF on the four files.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/pipeline/spellSynthesizer.ts packages/engine/src/pipeline/__tests__/spellSynthesizer.test.ts packages/engine/src/pipeline/__tests__/spellCast.test.ts apps/web/src/components/sheet/__tests__/SpellsWidget.test.tsx
git commit -F - <<'EOF'
feat(engine): a grant's fixed cast level, and which spells can be rituals

A fixed grant's castAtLevel is stamped into the dice when the sheet is
built, and perSlotAbove is dropped so nothing upcasts it twice: Infernal
Legacy's Hellish Rebuke rolls 3d10. CastableSpell.ritual is true for a
ritual spell through a class whose spellcasting casts rituals, and never
for a trait's spell.

<your Co-Authored-By trailer>
EOF
```

---

### Task 6: Casting a ritual, and components with a cost

**Files:**
- Modify: `packages/engine/src/pipeline/spellCast.ts`
- Modify: `packages/engine/src/pipeline/__tests__/spellCast.test.ts`
- Modify: `packages/shared/src/schemas/transport/socket.ts:169-174`
- Modify: `apps/server/src/gateway/socket.ts:780-785` (comment only)
- Modify: `apps/server/src/gateway/__tests__/socket.spellCast.test.ts`

**Interfaces:**
- Consumes: `CastableSpell.ritual` (Task 5); the authored Identify (Task 4).
- Produces:
  - `SpellCastRequest.asRitual?: boolean`;
  - `SpellCastRefusal` gains `"ritual_not_allowed"`;
  - `ActionIntentPayload.cast` is `{ slotResourceId?: string; materialsConfirmed?: boolean; asRitual?: boolean }`;
  - `materialCoverage` returns `{ covered: false }` for any component with `goldCost > 0`.

- [ ] **Step 1: Write the failing engine tests**

In `packages/engine/src/pipeline/__tests__/spellCast.test.ts`, add after the `lights` fixture:

```ts
const identify = (
  focusCategories: CastableSpell["focusCategories"] = ["category_holy_symbol"],
) =>
  spell({
    spellId: "spell_identify",
    activation: "minute",
    ritual: true,
    focusCategories,
    components: {
      verbal: true,
      somatic: true,
      material: true,
      materialDescription: "a pearl worth at least 100 gp and an owl feather",
      goldCost: 100,
      isConsumed: false,
    },
  });
```

Append to `describe("materialCoverage")`:

```ts
  // PHB p.203: a pouch or focus can't stand in for a component with a cost
  it("never covers a component with a gold cost", () => {
    expect(
      materialCoverage(
        identify(),
        [carried("item_gear_component_pouch"), carried("item_focus_amulet")],
        corePackLookup(),
      ),
    ).toEqual({ covered: false });
  });
```

Append to `describe("settleSpellCast")`:

```ts
  it("casts a ritual without a slot, at its own level, and spends no action on it", () => {
    expect(
      settle({ spell: identify(), request: { asRitual: true, materialsConfirmed: true } }),
    ).toEqual({ ok: true, action: { ...action, activation: "minute" } });
  });

  it("leaves a ritual that already takes minutes as it is", () => {
    const minute: ActionGrant = { ...action, activation: "minute" };

    expect(
      settle({
        spell: identify(),
        action: minute,
        request: { asRitual: true, materialsConfirmed: true },
      }),
    ).toEqual({ ok: true, action: minute });
  });

  it("refuses a ritual cast through a source that cannot cast one", () => {
    expect(settle({ request: { asRitual: true } })).toEqual({
      ok: false,
      reason: "ritual_not_allowed",
      offendingId: "spell_burning_hands",
    });
  });

  it("still asks a ritual for its material", () => {
    expect(settle({ spell: identify(), request: { asRitual: true } })).toEqual({
      ok: false,
      reason: "materials_required",
      offendingId: "spell_identify",
    });
  });

  it("refuses a costly component the player has not confirmed, whatever they carry", () => {
    expect(
      settle({
        spell: identify(),
        request: { slotResourceId: "spell_slots_2" },
        inventory: [carried("item_gear_component_pouch")],
      }),
    ).toEqual({ ok: false, reason: "materials_required", offendingId: "spell_identify" });
  });
```

Run: `pnpm --filter @project/engine test -- spellCast`
Expected: FAIL — the pouch covers the pearl; `asRitual` is ignored, so the ritual asks for a slot (`slot_required`) and Burning Hands is not refused as a ritual. (The engine typechecks `request: { asRitual: true }` only after Step 2; Vitest runs it regardless.)

- [ ] **Step 2: Implement**

In `packages/engine/src/pipeline/spellCast.ts`, change the shared import to:

```ts
import {
  costsCombatEconomy,
  type ActionGrant,
  type InventoryInstance,
} from "@project/shared";
```

In `materialCoverage`, add after `if (!spell.components?.material) return { covered: true };`:

```ts
  // a pouch or focus can't stand in for a component with a cost (PHB p.203):
  // only the player's word supplies it
  if (spell.components.goldCost > 0) return { covered: false };
```

and add to its docstring, after the first paragraph: `A component with a gold cost is never covered: the player is always asked.`

Replace `SpellCastRefusal` and `SpellCastRequest` with:

```ts
export type SpellCastRefusal =
  | "ritual_not_allowed"
  | "slot_required"
  | "slot_too_low"
  | "slot_empty"
  | "materials_required";

/** What the player chose when they pressed Cast. */
export interface SpellCastRequest {
  slotResourceId?: string;
  materialsConfirmed?: boolean;
  /** Cast as a ritual: no slot, and ten minutes longer. */
  asRitual?: boolean;
}
```

In `settleSpellCast`, replace `if (spell.payment.kind === "slot") {` with:

```ts
  if (request.asRitual === true) {
    if (!spell.ritual) {
      return { ok: false, reason: "ritual_not_allowed", offendingId: spell.spellId };
    }
    // ten minutes longer than its casting time, so no action, bonus action
    // or reaction is spent on it; a ritual casts at its own level
    if (costsCombatEconomy(action.activation)) {
      action = { ...action, activation: "minute" };
    }
  } else if (spell.payment.kind === "slot") {
```

(the slot block's body and closing brace are unchanged). Replace the docstring's first paragraph with:

```ts
/**
 * Everything a spell needs before it is cast, checked before anything is
 * spent: a slot of at least its level with a charge left, when a slot pays for
 * it and it is not cast as a ritual; then its material, from a pouch, a usable
 * focus or the player's word - only their word, for a component with a cost.
 *
 * A ritual is refused unless its source can cast one (`spell.ritual`). It
 * spends no slot and casts at the spell's own level, and its action comes back
 * as a `minute` activation, so it spends no action, bonus action or reaction.
 *
```

keeping the rest of the docstring (the `consumesResource` paragraph and the `@param`/`@returns` lines) as it is.

Run: `pnpm --filter @project/engine test -- spellCast`
Expected: PASS.

- [ ] **Step 3: Carry the choice on the intent**

In `packages/shared/src/schemas/transport/socket.ts`, replace the `cast` field and its comment in `ActionIntentPayload` with:

```ts
  /**
   * What the player chose when casting a spell: the slot pool paying for it,
   * or a ritual cast, which needs none; and that they have a material
   * component no pouch or focus covers. Ignored for anything that is not a
   * spell.
   */
  cast?: { slotResourceId?: string; materialsConfirmed?: boolean; asRitual?: boolean };
```

In `apps/server/src/gateway/socket.ts`, replace the first three lines of the comment above `let spellCast`:

```ts
          // A spell is paid for and supplied before anything happens: a slot
          // of at least its level with a charge left, and its material from a
          // pouch, a usable focus or the player's word. A refusal spends
```

with:

```ts
          // A spell is paid for and supplied before anything happens: a slot
          // of at least its level with a charge left (a ritual needs none),
          // and its material from a pouch, a usable focus or the player's
          // word - only their word for one with a cost. A refusal spends
```

The gateway hands `payload.cast` to `settleSpellCast` as it is, so no code changes there.

- [ ] **Step 4: Pin it at the socket**

In `apps/server/src/gateway/__tests__/socket.spellCast.test.ts`, add after the `drowWizard` helper:

```ts
  const knowledgeCleric = async (inventory: Record<string, unknown>[] = []) => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [
      characterRow({ raceId: "race_human", subraceId: null, wis: 16 }),
    ]);
    harness.db.seed(characterClasses, [
      { classId: "class_cleric", classLevel: 1, subclassId: "subclass_cleric_knowledge" },
    ]);
    harness.db.seed(characterInventory, inventory);
    // every slot spent: a ritual needs none
    harness.db.seed(characterResources, [slot("spell_slots_1", 1, 0, 2)]);
  };
```

and append to the `describe`:

```ts
  it("casts Identify as a ritual with every slot spent, and spends none", async () => {
    await knowledgeCleric();

    await cast("action_spell_identify@class_cleric", {
      cast: { asRitual: true, materialsConfirmed: true },
    });

    expect(lastResolved()["executed"]).toBe(true);
    expect(chargesOf("spell_slots_1")).toBe(0);
  });

  it("refuses a ritual cast of a spell that is not a ritual, and spends nothing", async () => {
    await lightCleric();

    await cast("action_spell_burning_hands@class_cleric", { cast: { asRitual: true } });

    expect(lastResolved()).toMatchObject({ executed: false, reason: "ritual_not_allowed" });
    expect(chargesOf("spell_slots_1")).toBe(1);
  });

  // a holy symbol serves the cleric's spells, but not a 100 gp pearl
  it("asks for a costly component even with a holy symbol carried, and casts once confirmed", async () => {
    await knowledgeCleric([inventoryRow({ itemId: "item_focus_amulet" })]);

    await cast("action_spell_identify@class_cleric", { cast: { asRitual: true } });
    expect(lastResolved()).toMatchObject({
      executed: false,
      reason: "materials_required",
    });

    await cast("action_spell_identify@class_cleric", {
      cast: { asRitual: true, materialsConfirmed: true },
    });
    expect(lastResolved()["executed"]).toBe(true);
  });
```

Run: `DATABASE_URL= pnpm --filter @project/server test -- socket.spellCast`
Expected: PASS. (The engine change in Step 2 is what these exercise; the gateway passes `cast` through untouched.)

- [ ] **Step 5: Run every gate**

```bash
pnpm --filter @project/shared test
pnpm --filter @project/engine test
DATABASE_URL= pnpm --filter @project/server test
pnpm --filter @project/web test
pnpm --filter @project/shared typecheck
pnpm --filter @project/engine typecheck
pnpm --filter @project/server typecheck
pnpm --filter @project/web typecheck
```

Expected: shared 266, engine 1090, server 542 and web 505 pass; every typecheck is clean. Restore and measure CRLF on the five files.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/pipeline/spellCast.ts packages/engine/src/pipeline/__tests__/spellCast.test.ts packages/shared/src/schemas/transport/socket.ts apps/server/src/gateway/socket.ts apps/server/src/gateway/__tests__/socket.spellCast.test.ts
git commit -F - <<'EOF'
feat(engine): cast a ritual without a slot, and ask for a costly component

settleSpellCast takes asRitual: refused (ritual_not_allowed) unless the
source can cast rituals, otherwise no slot, no upcast, and a minute
activation so no action is spent. A component with a gold cost is never
covered by a pouch or focus: the player is asked every time (#117, the
pouch half). The intent carries asRitual.

<your Co-Authored-By trailer>
EOF
```

---

### Task 7: The sheet casts rituals, and names a component's cost

**Files:**
- Modify: `apps/web/src/components/sheet/SpellsWidget.tsx`
- Modify: `apps/web/src/components/sheet/__tests__/SpellsWidget.test.tsx`

**Interfaces:**
- Consumes: `CastableSpell.ritual` and `castLevel` (Task 5); `ActionIntentPayload.cast.asRitual` (Task 6), which the store's `castSpell(actionId, cast?: ActionIntentPayload["cast"])` already forwards unchanged; the refusal code `ritual_not_allowed` (Task 6).
- Produces: UI only.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/components/sheet/__tests__/SpellsWidget.test.tsx`, add after the `burningHands` fixture:

```ts
const identify: CastableSpell = {
  ...burningHands,
  spellId: "spell_identify",
  name: "Identify",
  activation: "minute",
  range: { kind: "touch" },
  components: {
    ...components("a pearl worth at least 100 gp and an owl feather"),
    goldCost: 100,
  },
  ritual: true,
  actionId: "action_spell_identify@class_cleric",
};

const nondetection: CastableSpell = {
  ...burningHands,
  spellId: "spell_nondetection",
  name: "Nondetection",
  level: 3,
  components: {
    ...components(
      "a pinch of diamond dust worth 25 gp sprinkled over the target, which the spell consumes",
    ),
    goldCost: 25,
    isConsumed: true,
  },
  actionId: "action_spell_nondetection@class_cleric",
};
```

Append to `describe("SpellsWidget")`:

```ts
  it("offers a ritual cast with every slot spent, and asks for the pearl a pouch can't replace", async () => {
    mocks.spells.current = [identify];
    mocks.slotPools.current = [{ resourceId: "spell_slots_1", level: 1 }] satisfies SlotPool[];
    mocks.resources.current = [{ id: "spell_slots_1", current: 0 }];
    mocks.inventory.current = [pouch];
    const container = await render();

    expect(container.textContent).toContain("Ritual");
    expect(container.textContent).toContain("Cleric · Slot or ritual");

    await click(button(container, "Cast"));

    expect(container.textContent).not.toContain("No slots left that can cast this.");

    await click(button(container, "As a ritual (+10 minutes, no slot)"));

    expect(container.textContent).toContain(
      "Needs a pearl worth at least 100 gp and an owl feather. A pouch or focus can't stand in for a component with a cost. Do you have it?",
    );
    expect(mocks.castSpell).not.toHaveBeenCalled();

    await click(button(container, "Cast anyway"));

    expect(mocks.castSpell).toHaveBeenCalledWith("action_spell_identify@class_cleric", {
      asRitual: true,
      materialsConfirmed: true,
    });
  });

  it("says when no slot can pay for a spell that is not a ritual", async () => {
    mocks.spells.current = [burningHands];
    mocks.slotPools.current = [{ resourceId: "spell_slots_1", level: 1 }] satisfies SlotPool[];
    mocks.resources.current = [{ id: "spell_slots_1", current: 0 }];
    const container = await render();

    await click(button(container, "Cast"));

    expect(container.textContent).toContain("No slots left that can cast this.");
  });

  it("says a costly component is consumed, and that a pouch can't replace it", async () => {
    mocks.spells.current = [nondetection];
    mocks.slotPools.current = [{ resourceId: "spell_slots_3", level: 3 }] satisfies SlotPool[];
    mocks.resources.current = [{ id: "spell_slots_3", current: 2 }];
    mocks.inventory.current = [pouch];
    const container = await render();

    await click(button(container, "Details"));

    expect(container.textContent).toContain(
      "Costs 25 gp, consumed; a pouch or focus can't replace it.",
    );

    await click(button(container, "Cast"));
    await click(button(container, "3rd level"));

    expect(container.textContent).toContain("The spell consumes it. Do you have it?");
    expect(mocks.castSpell).not.toHaveBeenCalled();
  });

  it("says a grant casts its spell at a fixed level", async () => {
    mocks.spells.current = [
      {
        ...burningHands,
        spellId: "spell_hellish_rebuke",
        name: "Hellish Rebuke",
        source: { kind: "trait", traitId: "infernal_legacy", label: "Infernal Legacy" },
        payment: { kind: "resource", resourceId: "infernal_legacy_hellish_rebuke" },
        castLevel: 2,
        focusCategories: [],
        actionId: "action_spell_hellish_rebuke@infernal_legacy",
      },
    ];
    mocks.resources.current = [{ id: "infernal_legacy_hellish_rebuke", current: 1 }];

    expect((await render()).textContent).toContain(
      "Infernal Legacy · 1 left · cast at 2nd level",
    );
  });

  it("reads a sphere's size as its radius", async () => {
    mocks.spells.current = [
      {
        ...burningHands,
        range: { kind: "feet", feet: 60, area: { shape: "sphere", size: 15 } },
      },
    ];

    expect((await render()).textContent).toContain("60 feet (15-foot-radius sphere)");
  });

  it("says why a ritual cast was refused", async () => {
    mocks.spells.current = [burningHands];
    mocks.lastActionOutcome.current = {
      actionId: "action_spell_burning_hands@class_cleric",
      executed: false,
      reason: "ritual_not_allowed",
    };

    expect((await render()).textContent).toContain(
      "This spell can't be cast as a ritual through this source.",
    );
  });
```

- [ ] **Step 2: Watch them fail**

Run: `pnpm --filter @project/web test -- SpellsWidget`
Expected: FAIL — no ritual badge or button, the pouch covers the pearl so no prompt appears, no cast-level text, the sphere reads `15-foot sphere`, and the refusal falls back to "The spell was not cast." (`says when no slot can pay…` passes already.)

- [ ] **Step 3: Implement**

In `apps/web/src/components/sheet/SpellsWidget.tsx`:

Change the shared import to:

```ts
import type { ActionGrant, AreaOfEffect, SpellComponents } from "@project/shared";
```

Add to `REFUSALS`:

```ts
  ritual_not_allowed: "This spell can't be cast as a ritual through this source.",
```

Replace `rangeText` with:

```ts
/** A sphere or cylinder is sized by its radius; the rest by their length. */
const areaText = (area: AreaOfEffect): string =>
  area.shape === "sphere" || area.shape === "cylinder"
    ? `${area.size}-foot-radius ${area.shape}`
    : `${area.size}-foot ${area.shape.replace("_", " ")}`;

const rangeText = (spell: CastableSpell): string | undefined => {
  const range = spell.range;
  if (!range) return undefined;
  if (range.kind === "touch") return "Touch";
  const area = range.area ? areaText(range.area) : undefined;
  if (range.kind === "self") return area ? `Self (${area})` : "Self";
  return area ? `${range.feet} feet (${area})` : `${range.feet} feet`;
};
```

Add after `componentText`:

```ts
/**
 * What the sheet asks before casting with a material nothing covers. A
 * component with a cost is always asked about, and says why.
 */
const materialPrompt = (components: SpellComponents | undefined): string => {
  const needs = `Needs ${components?.materialDescription ?? "a material component"}.`;
  if (!components || components.goldCost <= 0) return `${needs} Do you have it?`;
  return [
    needs,
    "A pouch or focus can't stand in for a component with a cost.",
    ...(components.isConsumed ? ["The spell consumes it."] : []),
    "Do you have it?",
  ].join(" ");
};

/** How the player chose to pay: a slot, or a ritual, or neither. */
type CastChoice = { slotResourceId?: string; asRitual?: boolean };
```

Inside `SpellsWidget`, replace the `confirming` state, `send`, `withMaterials` and `onCast` with:

```ts
  const [confirming, setConfirming] = useState<{
    actionId: string;
    choice: CastChoice;
  } | null>(null);
```

```ts
  const send = (
    spell: CastableSpell,
    choice: CastChoice = {},
    materialsConfirmed = false,
  ) => {
    if (!spell.actionId) return;
    castSpell(spell.actionId, {
      ...(choice.slotResourceId !== undefined && {
        slotResourceId: choice.slotResourceId,
      }),
      ...(choice.asRitual === true && { asRitual: true }),
      ...(materialsConfirmed && { materialsConfirmed: true }),
    });
    setPicking(null);
    setConfirming(null);
  };

  const withMaterials = (spell: CastableSpell, choice: CastChoice = {}) => {
    if (
      spell.actionId &&
      !materialCoverage(spell, inventory, ruleSnapshot ?? undefined).covered
    ) {
      setPicking(null);
      setConfirming({ actionId: spell.actionId, choice });
      return;
    }
    send(spell, choice);
  };

  const onCast = (spell: CastableSpell) => {
    if (!spell.actionId) return;
    if (spell.payment.kind === "slot") {
      setPicking(picking === spell.actionId ? null : spell.actionId);
      return;
    }
    withMaterials(spell);
  };
```

Replace the `price` constant with:

```ts
                  const basePrice =
                    spell.payment.kind === "at_will"
                      ? "At will"
                      : spell.payment.kind === "resource"
                        ? `${charges(spell.payment.resourceId)} left`
                        : spell.ritual
                          ? "Slot or ritual"
                          : "Slot";
                  const price =
                    spell.castLevel !== undefined
                      ? `${basePrice} · cast at ${ORDINALS[spell.castLevel]} level`
                      : basePrice;
```

After the Concentration badge's closing `)}` (inside the spell name `<p>`), add:

```tsx
                            {spell.ritual && (
                              <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                                Ritual
                              </span>
                            )}
```

Replace the `{isPicking && (...)}` block with:

```tsx
                      {isPicking && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {spell.ritual && (
                            <button
                              type="button"
                              onClick={() => withMaterials(spell, { asRitual: true })}
                              className={BUTTON}
                            >
                              As a ritual (+10 minutes, no slot)
                            </button>
                          )}
                          {usablePools.length === 0
                            ? !spell.ritual && (
                                <p className="text-[11px] text-slate-500">
                                  No slots left that can cast this.
                                </p>
                              )
                            : usablePools.map((pool) => {
                                const preview = upcastPreview(
                                  action,
                                  spell.level,
                                  pool.level,
                                );
                                return (
                                  <button
                                    key={pool.resourceId}
                                    type="button"
                                    onClick={() =>
                                      withMaterials(spell, {
                                        slotResourceId: pool.resourceId,
                                      })
                                    }
                                    className={BUTTON}
                                  >
                                    {`${ORDINALS[pool.level]} level (${charges(pool.resourceId)} left)${preview ? ` · ${preview}` : ""}`}
                                  </button>
                                );
                              })}
                        </div>
                      )}
```

In the `{isConfirming && (...)}` block, replace the prompt text expression with:

```tsx
                            {materialPrompt(spell.components)}
```

and the Cast anyway handler with:

```tsx
                              onClick={() => send(spell, confirming?.choice, true)}
```

In the Details block, replace the material paragraph with:

```tsx
                          {spell.components?.material && (
                            <p>
                              {`Material: ${spell.components.materialDescription}. `}
                              {spell.components.goldCost > 0
                                ? `Costs ${spell.components.goldCost} gp${spell.components.isConsumed ? ", consumed" : ""}; a pouch or focus can't replace it.`
                                : coverage.covered
                                  ? `Covered by: ${coverage.by}`
                                  : "No pouch or usable focus."}
                            </p>
                          )}
```

Update the component's docstring's last sentence to: `Casting asks only what the rules leave to the player - which slot or a ritual, and whether they have a material nothing they carry covers, or one with a cost - and the server checks both again.`

- [ ] **Step 4: Watch them pass, and run every gate**

```bash
pnpm --filter @project/web test
pnpm --filter @project/web typecheck
pnpm lint
```

Expected: web 511 passes (505 + 6); the typecheck is clean; lint reports no new warning. The existing tests still pass unchanged: a slot cast still sends exactly `{ slotResourceId }`, an at-will cast `{}`, and a confirmed material `{ materialsConfirmed: true }`. Restore and measure CRLF on both files.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/sheet/SpellsWidget.tsx apps/web/src/components/sheet/__tests__/SpellsWidget.test.tsx
git commit -F - <<'EOF'
feat(web): cast a ritual from the Spells panel, and name a component's cost

A ritual spell gets a Ritual badge, "Slot or ritual" for its price, and
an "As a ritual (+10 minutes, no slot)" button that shows even with every
slot spent. A component with a cost is always asked about, says why, and
says when the spell consumes it. A grant cast at a fixed level says so,
and a sphere or cylinder reads as a radius.

<your Co-Authored-By trailer>
EOF
```

---

### Task 8: A tiefling Knowledge cleric to check them on

**Files:**
- Modify: `packages/database/src/sampleScenarioCharacters.ts` (a roster entry appended after Maren Solace)
- Modify: `packages/database/src/seedSampleCharacters.ts:2`, `:16`, `:1863` (comments: "twenty-one" → "twenty-two")
- Modify: `packages/database/src/__tests__/seedSampleCharactersImport.test.ts:27`
- Modify: `apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts:46`
- Modify: `apps/server/src/services/__tests__/sampleCharacterScores.test.ts:53`
- Modify: `docs/development/sample-characters.md`

**Interfaces:**
- Consumes: everything above; the character exists to check it by hand.
- Produces: `00000000-0000-0000-0000-000000000131`, **Cassia Emberlane**, a tiefling Knowledge Domain cleric 5 — stored scores `[10, 12, 14, 12, 16, 13]`, final `[10, 12, 14, 13, 16, 15]`, derived maximum 38 hit points.

- [ ] **Step 1: Pin her, and watch the pins fail**

In `packages/database/src/__tests__/seedSampleCharactersImport.test.ts`, change `expect(ROSTER).toHaveLength(21);` to `expect(ROSTER).toHaveLength(22);`.

In `apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts`, add after `"Maren Solace": 24,`:

```ts
  // 28 rolled (8, then 5 a level) + CON 14's +2 at each of five levels
  "Cassia Emberlane": 38,
```

In `apps/server/src/services/__tests__/sampleCharacterScores.test.ts`, add after `"Maren Solace": [13, 10, 15, 11, 17, 12],`:

```ts
  // the tiefling adds +1 INT and +2 CHA
  "Cassia Emberlane": [10, 12, 14, 13, 16, 15],
```

Run: `DATABASE_URL= pnpm --filter @project/database test -- seedSampleCharactersImport` and `DATABASE_URL= pnpm --filter @project/server test -- sampleCharacterScores`
Expected: FAIL — the roster has 21, and the scores test's `covers every sample` finds a name with no character.

- [ ] **Step 2: Add her to the roster**

In `packages/database/src/sampleScenarioCharacters.ts`, append to the scenario roster array, after Maren Solace's entry (before the closing `];`):

```ts
  {
    id: "00000000-0000-0000-0000-000000000131",
    name: "Cassia Emberlane",
    raceId: "race_tiefling",
    classes: [
      {
        classId: "class_cleric",
        classLevel: 5,
        subclassId: "subclass_cleric_knowledge",
      },
    ],
    backgroundId: "background_acolyte",
    choices: {
      feats: [],
      classSelections: {},
      traitSelections: {
        acolyte_languages: ["celestial", "draconic"],
        cleric_starting_skills: ["medicine", "persuasion"],
        knowledge_domain_languages: ["dwarvish", "elvish"],
        knowledge_domain_skills: ["arcana", "history"],
      },
    },
    alignment: "Lawful Neutral",
    // the tiefling's +1 INT and +2 CHA make INT 13 and CHA 15 (+2). WIS 16
    // (+3) and proficiency +3 give the cleric's spells DC 14; Infernal
    // Legacy's Charisma spells are DC 13
    str: 10,
    dex: 12,
    con: 14,
    int: 12,
    wis: 16,
    cha: 13,
    maxHp: 28,
    currentHp: 38,
    testFocus:
      "Spell casting (#31, #117, #119): Identify and Augury as rituals with no 1st-level slot left; a holy symbol that covers Speak with Dead's incense but not Identify's pearl; Nondetection's consumed diamond dust; Command's WIS save; Suggestion's concentration handed to Infernal Legacy's Darkness; Hellish Rebuke at 2nd level (3d10).",
    personalityTraits: "I catalogue every door I pass, in case one is ever worth opening twice.",
    ideals: "Knowledge. A secret kept is a question someone else must answer badly.",
    bonds: "The archive at Hollowmere took me in when the village would not.",
    flaws: "I will read a letter that is not addressed to me, and then correct its spelling.",
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
        traitId: "trait_knowledge_domain_spells",
        source: "subclass_cleric_knowledge_level_1",
      },
      {
        traitId: "trait_blessings_of_knowledge",
        source: "subclass_cleric_knowledge_level_1",
      },
      { traitId: "trait_channel_divinity", source: "class_cleric_level_2" },
      { traitId: "trait_divine_domain_feature", source: "class_cleric_level_2" },
      {
        traitId: "trait_cd_knowledge_of_the_ages",
        source: "subclass_cleric_knowledge_level_2",
      },
      { traitId: "trait_destroy_undead", source: "class_cleric_level_5" },
      { traitId: "race_tiefling_asi", source: "race_tiefling" },
      { traitId: "race_tiefling_darkvision", source: "race_tiefling" },
      { traitId: "hellish_resistance", source: "race_tiefling" },
      { traitId: "infernal_legacy", source: "race_tiefling" },
      { traitId: "race_tiefling_languages", source: "race_tiefling" },
      { traitId: "trait_acolyte_prof_skills", source: "background_acolyte" },
      { traitId: "trait_acolyte_languages", source: "background_acolyte" },
    ],
    inventory: [
      { itemId: "item_armor_chain_shirt", slot: "body" },
      { itemId: "item_weapon_mace", slot: "main_hand" },
      { itemId: "item_armor_shield", slot: "off_hand" },
      // a holy symbol: it covers the cleric's ordinary materials, and none
      // with a cost
      { itemId: "item_focus_amulet" },
      { itemId: "item_pack_priests" },
      { itemId: "item_clothes_vestments" },
    ],
    resources: [
      {
        // none left: Identify is cast as a ritual or not at all
        id: "spell_slots_1",
        name: "1st-Level Spell Slots",
        current: 0,
        max: 4,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_2",
        name: "2nd-Level Spell Slots",
        current: 1,
        max: 3,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_3",
        name: "3rd-Level Spell Slots",
        current: 2,
        max: 2,
        resetCondition: "long_rest",
      },
      {
        id: "infernal_legacy_hellish_rebuke",
        name: "Hellish Rebuke (Infernal Legacy)",
        current: 1,
        max: 1,
        resetCondition: "long_rest",
      },
      {
        id: "infernal_legacy_darkness",
        name: "Darkness (Infernal Legacy)",
        current: 1,
        max: 1,
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

In `packages/database/src/seedSampleCharacters.ts`, change "twenty-one" to "twenty-two" in the header comment (line 2), in point 2 (line 16) and at line 1863. Change nothing else in that file.

- [ ] **Step 3: Watch every roster invariant pass**

```bash
DATABASE_URL= pnpm --filter @project/database test
DATABASE_URL= pnpm --filter @project/server test
pnpm --filter @project/database typecheck
pnpm --filter @project/server typecheck
```

Expected: both suites pass; both typechecks are clean. The server gains three cases (her choices, hit points and scores): 545. The database suite may gain per-character cases too; account for each new one by name. If `sampleCharacterChoices` reports an issue for her, the message names the node: fix her `traitSelections`, not the test.

- [ ] **Step 4: Document her**

In `docs/development/sample-characters.md`:

- Line 3: `Twenty-one fixture characters` → `Twenty-two fixture characters`.
- Line 9: `` (`…0120`–`…0130`) `` → `` (`…0120`–`…0131`) ``.
- Line 15: `All twenty-one sit` → `All twenty-two sit`.
- Line 27: `the twenty-one ids` → `the twenty-two ids`.
- Add a table row after Maren Solace's:

  ```markdown
  | [Cassia Emberlane](http://localhost:5173/character/00000000-0000-0000-0000-000000000131) | 5 | Cleric 5 (Knowledge) | 38/38 | Spell casting: rituals, costly components | #31, #117, #119 |
  ```

- `Ids run `…000000000110` through `…000000000130`` → `through `…000000000131``.
- In Isolde Varn's step 6, replace `Minor Illusion is listed as not yet automated.` with `Minor Illusion casts at will; its note says what the illusion can be and that an Investigation check against her spell save DC sees through it.`
- In Seraphine Dusk's step 4, replace `Darkness is not yet automated.` with `Darkness asks for its bat fur (her crystal serves wizard spells, not Drow Magic's), then spends the use and shows Concentrating.`
- Add after Maren Solace's section:

  ```markdown
  ### Cassia Emberlane — `…0131`

  A tiefling Knowledge cleric with no 1st-level slot left, one 2nd and two
  3rd. Her amulet is a holy symbol.

  1. **Identify as a ritual (#119, #117).** The Spells panel lists Identify
     (Cleric · Slot or ritual) with a Ritual badge. Cast: the picker leads with
     "As a ritual (+10 minutes, no slot)". Take it: the sheet asks for "a pearl
     worth at least 100 gp and an owl feather" and says a pouch or focus can't
     stand in, although she carries the amulet. Cast anyway: no slot changes,
     and the note lists what she learns.
  2. **Augury** as a ritual the same way: it asks for its 25 gp tokens.
  3. **Command.** Cast with the 2nd-level slot: "Command: WIS save DC 14 · a
     success negates it", and the note names the five commands and the extra
     target per slot level.
  4. **Suggestion, then Darkness.** Cast Suggestion with a 3rd-level slot:
     Active effects shows it Concentrating. Darkness (Infernal Legacy · 1 left)
     warns "Casting this ends Suggestion", asks for its bat fur (Infernal
     Legacy is no class, so the amulet does not serve it), and takes over the
     concentration.
  5. **Hellish Rebuke.** Its row reads "Infernal Legacy · 1 left · cast at 2nd
     level". Cast: "DEX save DC 13 · half damage on a success" and a 3d10 fire
     roll; the use is spent.
  6. **Nondetection.** Cast with the last 3rd-level slot: the prompt says the
     diamond dust costs 25 gp and "The spell consumes it." Cancel.
  7. **Speak with Dead.** Cast with the same slot: no prompt, because the amulet
     covers burning incense. The slot is spent.
  8. **Thaumaturgy** casts at will through Infernal Legacy, and its note lists
     the six wonders.
  ```

Restore and measure CRLF on every file this task touched.

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/sampleScenarioCharacters.ts packages/database/src/seedSampleCharacters.ts packages/database/src/__tests__/seedSampleCharactersImport.test.ts apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts apps/server/src/services/__tests__/sampleCharacterScores.test.ts docs/development/sample-characters.md
git commit -F - <<'EOF'
feat(database): Cassia Emberlane, a tiefling Knowledge cleric to cast the ten on

Nine of the ten spells reach her: the Knowledge Domain's six, cast with
Wisdom and slots, and Infernal Legacy's three, with Charisma and uses.
No 1st-level slot is left, so Identify is cast as a ritual, and her holy
symbol covers incense but not a 100 gp pearl. Isolde's Minor Illusion and
Seraphine's Darkness scripts now cast them.

<your Co-Authored-By trailer>
EOF
```

---

### Task 9: The authoring guide and the backlog

**Files:**
- Modify: `docs/architecture/spell-authoring-guide.md`
- Modify: `docs/TODO_BACKLOG.md`

**Interfaces:** docs only.

- [ ] **Step 1: The authoring guide**

In `docs/architecture/spell-authoring-guide.md`:

1. Replace the opening's second sentence (`Eldritch Blast, Dancing Lights, Faerie Fire and Burning Hands are the worked examples; read them beside this.`) with:

   ```markdown
   Eldritch Blast, Dancing Lights, Faerie Fire and Burning Hands are the worked
   examples; Hellish Rebuke (a reaction cast at a fixed level through Infernal
   Legacy), Command, Suggestion and Identify (a ritual with a costly component)
   show the rest. Read them beside this.
   ```

2. In the "What a spell record says" table, replace the `range` and `duration` rows with:

   ```markdown
   | `range` | `{ kind: "feet", feet, area? }`, `{ kind: "self", area? }` or `{ kind: "touch" }`. `area` is the spell's area, authored once, here. |
   | `duration` | `{ kind: "instantaneous" }` or `{ kind: "timed", amount, unit, concentration }`, where `unit` is `"round"`, `"minute"` or `"hour"`. |
   ```

3. Replace the paragraph beginning `` `touch`, `sight` and `unlimited` ranges `` with:

   ```markdown
   `sight` and `unlimited` ranges, and `day` and `until_dispelled` durations,
   do not exist yet. The first spell that needs one adds it to
   `SpellRangeSchema` or `SpellDurationSchema`; the repo adds no schema
   variant before a real rule needs it.
   ```

4. In the "Which effect fits which spell" table, add after the `forces a save for damage` row:

   ```markdown
   | forces a save whose failure only the table resolves | `save` with `saveEffect: "negates_effect"` and no `damage`; what failing means goes in the `tableNote` | Command |
   ```

   and change the Example cell of `forces a save, then lasts` to `Faerie Fire, Suggestion`, and of `does what only the table can see` to `Dancing Lights, Identify`.

5. Under "How a spell reaches a character", add a sub-bullet to **A fixed grant**:

   ```markdown
     - `castAtLevel` casts it at a set level above its own (Infernal Legacy's Hellish Rebuke, "as a 2nd-level spell"). The synthesizer stamps the dice at that level and drops `perSlotAbove`. Pack validation rejects one below the spell's level, or on an `always_prepared` grant, whose slot chooses (`invalid_cast_level`).
   ```

6. In "Components", replace the bullet beginning `**A costly or consumed material**` with:

   ```markdown
   - **A costly material** (`goldCost` above 0) is never covered by a pouch or focus: the sheet asks on every cast, names the cost, and says so when `isConsumed`. Owning the item and spending it are not tracked (#117).
   ```

7. In "Durations and concentration", change `equal to the duration in rounds (a minute is 10)` to `equal to the duration in rounds (a round is 1, a minute 10, an hour 600)`, and add a paragraph at the section's end:

   ```markdown
   A duration without concentration is not tracked: the spell's effect is
   `no_effect` (or a `save`), and the `tableNote` says how long it lasts.
   ```

8. Add a section after "Durations and concentration":

   ```markdown
   ## Rituals

   A spell with `isRitual: true` can be cast as a ritual through a class whose
   `spellcasting.ritualCasting` is true: the bard, cleric, druid and wizard.
   The synthesizer marks such an entry `ritual`, and the sheet offers "As a
   ritual (+10 minutes, no slot)" beside the slot picker, even with every slot
   spent.

   A ritual spends no slot and casts at the spell's own level. It takes ten
   minutes longer than its casting time, so it spends no action, bonus action
   or reaction: `settleSpellCast` returns its action as a `minute` activation.
   Its materials are still checked. A trait's spells (Drow Magic, Infernal
   Legacy, a feat) are never ritual-castable, and the server refuses one as
   `ritual_not_allowed`.
   ```

- [ ] **Step 2: The backlog**

In `docs/TODO_BACKLOG.md`:

1. **#31's row in the Item index** stays `Open`. **#31's row in Open items (4a)**: change `**107 of 111**` to `**97 of 111**`, and replace its Notes cell's first sentence (`Four authored on `feat/spell-casting` (2026-09-25): Eldritch Blast, Dancing Lights, Faerie Fire, Burning Hands, in `spells/core.json`. The other 107 are stubs`) with:

   ```markdown
   Fourteen authored, in `spells/core.json`: four on `feat/spell-casting` (2026-09-25) — Eldritch Blast, Dancing Lights, Faerie Fire, Burning Hands — and ten on `feat/spells-first-ten` (2026-09-27) — Darkness, Minor Illusion, Thaumaturgy, Hellish Rebuke, Command, Identify, Augury, Suggestion, Nondetection, Speak with Dead. The other 97 are stubs
   ```

   keeping the rest of the cell.

2. **#117.** In the Item index, change its row to `| 117 | Costly material components are taken on the player's word | Open | Open items |`. In its Open items section, change the heading to `### #117 — costly material components are taken on the player's word`, its table's Item cell to match, and replace the paragraph under the table with:

   ```markdown
   Since `feat/spells-first-ten` a pouch or focus no longer covers a component
   with a cost: the sheet asks on every cast, names the cost, and says when the
   spell consumes it (Identify, Augury, Nondetection). Still open: nothing
   checks that the character owns the component, or spends it when
   `isConsumed`. The pack has no items for gems or diamond dust yet.
   ```

3. **#119 closes.** In the Item index, change its row to `| 119 | Spells cannot be cast as rituals | ✅ Closed | Closed items |`. Move its section from Open items to **Closed items**, placed in number order among the closed sections there (after the highest-numbered closed section below 119), with the heading `### #119 — spells cannot be cast as rituals ✅`, its table row's Item cell as `✅ Spells cannot be cast as rituals`, its Notes cell as `Recorded 2026-09-25 on `feat/spell-casting`; closed 2026-09-27 on `feat/spells-first-ten`. See below.`, the original paragraph kept, and this appended:

   ```markdown
   **Closed 2026-09-27** by `feat/spells-first-ten`. Each class's spellcasting
   block declares `ritualCasting` (the bard, cleric, druid and wizard), the
   synthesizer marks a ritual spell cast through one `ritual`, and the Spells
   panel offers "As a ritual (+10 minutes, no slot)". `settleSpellCast` spends
   no slot, and returns the action as a `minute` activation so no action is
   spent. The warlock's Book of Ancient Secrets is still an unauthored
   invocation.
   ```

4. Record what this branch leaves for later, as new items after the highest-numbered one (#124), each in the Item index as `Open | Open items` and with an Open items section in the file's existing shape (`### #N — title`, a one-row table with `Recorded 2026-09-27 on `feat/spells-first-ten`. See below.`, and a paragraph):

   - **#125 — timed spells without concentration are not tracked.** Minor Illusion (1 minute), Nondetection (8 hours) and Speak with Dead (10 minutes) are `no_effect`; the note says how long they last, and nothing counts it down.
   - **#126 — a concentration spell whose every target saves still concentrates.** Suggestion's and Faerie Fire's macros apply the concentration effect whatever the targets roll; the player ends it with End Concentration.

- [ ] **Step 3: Check and commit**

Restore and measure CRLF on both files. Read each changed section once more for British spelling and broken table rows.

```bash
git add docs/architecture/spell-authoring-guide.md docs/TODO_BACKLOG.md
git commit -F - <<'EOF'
docs: rituals, costly components and cast levels in the authoring guide

The guide gains touch, round and hour, a Rituals section, costly
components and castAtLevel. The backlog counts 97 of 111 stubs left,
closes #119, narrows #117 to owning and spending the component, and
records #125 and #126.

<your Co-Authored-By trailer>
EOF
```

---

### Task 10: Verify the whole branch, and check it live

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

Expected: shared 266, engine 1090, database 206 or more, server 545 and web 511 — about **2618** — all passing. Every typecheck is clean; lint shows no warning beyond the three on `main`; hygiene passes. If a total differs, account for every test by name before going on. A turbo cache can replay a stale success, so run the package scripts directly as above.

- [ ] **Step 2: Import the pack and reseed the samples** — ask the owner first

The import CASCADE-deletes every character in the dev database. Ask before running it.

The dev database runs in Docker (container `dnd-postgres`). If a script hits `ECONNREFUSED 5432`, start Docker Desktop, then run `docker start dnd-postgres`.

```bash
pnpm --filter @project/database db:import-pack --yes
pnpm --filter @project/database db:seed:samples
```

Expected: the import publishes the pack with no validation issue, and the seed writes 22 characters. Restart the server afterwards.

- [ ] **Step 3: Check it live**

Open each character in the browser pane and run its script from `docs/development/sample-characters.md`:

- **Cassia Emberlane**: steps 1–8.
- **Isolde Varn**: step 6 (Minor Illusion only).
- **Seraphine Dusk**: step 4 (Darkness only).

For each, record what the sheet showed (DCs, dice counts, remaining slots and uses, prompts) and take a screenshot. A disagreement with the script is a finding: report it with the screenshot, and do not change code in this task.

- [ ] **Step 4: Report**

Summarise:
- the test totals per package;
- each live check, as passed or as a finding with its evidence;
- any file whose line endings changed unexpectedly (`git diff --stat main` should list only the files the tasks name).
