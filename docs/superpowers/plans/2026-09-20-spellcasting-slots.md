# Spellcasting Slots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a caster spell slots, a spell save DC and a spell attack bonus, so a level 5 wizard has four first-level slots, three second and two third, spendable and refilled on a long rest, with the DC beside them on the sheet.

**Architecture:** The class (or subclass, for the Eldritch Knight and Arcane Trickster) declares a casting ability and a progression. A pure helper turns those declarations plus the character's class levels into a single caster level, branching on whether one casting class is present or several, because the PHB states two different rules there. A new `caster_level_thresholds` resource max rule reads that number, so one authored slot table serves every slot caster. A new calculator derives the DC and attack bonus per casting class.

**Tech Stack:** TypeScript, pnpm workspaces, turbo, Zod schemas in `@project/shared`, Vitest everywhere, React + zustand in `apps/web`, JSON rule packs under `packages/database/data/packs/core_2014_pack`.

**Spec:** `docs/superpowers/specs/2026-09-20-spellcasting-slots-design.md`

**Branch:** `feat/spellcasting-slots`, already created, currently at `20c5e48` (the spec commit). It is stacked on `chore/pin-engine-typescript`, which is not yet merged to `main`.

## Global Constraints

- **Line endings are per-file and git hides conversions.** `core.autocrlf=true` is set, but files are individually LF or CRLF, and the Write and Edit tools emit LF. Check every file you touch with `file <path>` before committing and restore CRLF if it was CRLF:
  `node -e "const fs=require('fs');for(const p of process.argv.slice(2))fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/\r?\n/g,'\r\n'))" <file>`
- **Pack JSON is edited only through `packages/database/scripts/patchPackSegment.ts`.** The pack files are CRLF with four-space indentation and one has no trailing newline; the script parses and re-prints with the file's own endings. Never edit a pack JSON file with Write or Edit.
- **The JSON schemas under `packages/database/data/schemas/` are generated.** After any change to a Zod schema in `@project/shared`, run `pnpm --filter @project/database schemas:generate` or `packSchemas.test.ts`'s ajv pass will reject the newly authored data.
- **Never run `tsc -b` in `packages/database`.** Its typecheck is `pnpm --filter @project/database typecheck`.
- **Web typecheck is `pnpm --filter @project/web typecheck`** (`tsc -b`).
- **Baseline:** 1,961 tests green across the five packages, typecheck green on TypeScript 6.0.3 in every package.
- **Turbo caches a stale success.** If a test run looks suspiciously instant, run the package's vitest directly.
- **Commit after every task.** Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## Deviation from the spec, decided before writing this plan

The spec's §3 says `getResourceMaxUses` "gains a fourth parameter, `casterLevel`, defaulting to `0`", so existing callers keep working. **Do not do that.** There are six production call sites, and a default of zero means any site that is not updated silently resolves every slot pool to zero — a wizard whose slots quietly vanish on a rest, with nothing failing. That is the exact failure this codebase keeps unpicking.

Task 3 instead collapses `totalLevel` and `classLevels` into one required `LevelContext` argument that also carries `casterLevel`. The compiler then lists every call site, and there is no way to forget one. Task 9 corrects the spec to match.

---

## File Structure

**Created:**
- `packages/engine/src/rules/casterLevel.ts` — `CastingSource`, `collectCastingSources`, `casterLevel`. Pure; the PHB's two rules live here and nowhere else.
- `packages/engine/src/rules/__tests__/casterLevel.test.ts`
- `packages/engine/src/calculators/spellcasting.ts` — `SpellcastingEngine`, per casting class.
- `packages/engine/src/calculators/__tests__/spellcasting.test.ts`
- `packages/engine/src/calculators/__tests__/slotTables.test.ts` — pack-driven, asserts the authored tables against the PHB.
- `apps/web/src/components/sheet/SpellcastingWidget.tsx`
- `apps/web/src/components/sheet/__tests__/SpellcastingWidget.test.tsx`

**Modified — shared:**
- `schemas/content/character.ts` — `SpellcastingSchema`, and `spellcasting` on `ClassDefinitionSchema`.
- `schemas/content/coreRulePack.ts` — `spellcasting` on `CoreSubclassSchema`.
- `schemas/content/resources.ts` — `caster_level_thresholds` in `ResourceMaxRuleSchema`.

**Modified — engine:**
- `utils/resourceRules.ts` — `LevelContext`, `buildLevelContext`, and the new max-rule case.
- `calculators/rests.ts` — `applyRest` takes a `LevelContext`.
- `pipeline/characterEngine.ts` — collects casting sources, puts `spellcasting` on `LiveCharacterSheet`.

**Modified — database:**
- `scripts/patchPackSegment.ts` — two new patch capabilities.
- `data/packs/core_2014_pack/classes/*.json` — the declarations and the authored traits.

**Modified — web and server:**
- `store/characterSheetStore.ts`, `hooks/useFeatures.ts`, `hooks/useCharacterStats.ts`, `components/sheet/modals/RestModal.tsx`, `components/sheet/DashboardLayout.tsx`, `apps/server/src/gateway/socket.ts`.

---

## Task 1: The class declares how it casts

**Files:**
- Modify: `packages/shared/src/schemas/content/character.ts`
- Modify: `packages/shared/src/schemas/content/coreRulePack.ts:49-57`
- Create: `packages/shared/src/schemas/__tests__/spellcastingSchema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `SpellcastingSchema`, `type Spellcasting = { ability: "INT" | "WIS" | "CHA"; progression: "full" | "half" | "third" | "pact" }`, and an optional `spellcasting` field on `ClassDefinitionSchema` and `CoreSubclassSchema`. Tasks 2, 4 and 5 all rely on it.

Nothing reads the field until Task 2. That gap is one task wide and deliberate; the alternative is one unreviewable commit.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/schemas/__tests__/spellcastingSchema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ClassDefinitionSchema, SpellcastingSchema } from "../content/character.js";

const minimalClass = {
  id: "class_wizard",
  name: "Wizard",
  hitDie: 6,
  subclassUnlockLevel: 2,
  progression: [],
};

describe("SpellcastingSchema", () => {
  it("accepts an ability and a progression", () => {
    expect(
      SpellcastingSchema.parse({ ability: "INT", progression: "full" }),
    ).toEqual({ ability: "INT", progression: "full" });
  });

  it("rejects a non-casting ability", () => {
    expect(() =>
      SpellcastingSchema.parse({ ability: "STR", progression: "full" }),
    ).toThrow();
  });

  it("rejects an unknown progression", () => {
    expect(() =>
      SpellcastingSchema.parse({ ability: "INT", progression: "quarter" }),
    ).toThrow();
  });

  it("rejects an unknown key, so a typo cannot be authored silently", () => {
    expect(() =>
      SpellcastingSchema.parse({
        ability: "INT",
        progression: "full",
        preparation: "prepared",
      }),
    ).toThrow();
  });
});

describe("a class may declare how it casts", () => {
  it("accepts a class with no spellcasting block", () => {
    expect(ClassDefinitionSchema.parse(minimalClass).spellcasting).toBeUndefined();
  });

  it("carries the block through when present", () => {
    const parsed = ClassDefinitionSchema.parse({
      ...minimalClass,
      spellcasting: { ability: "INT", progression: "full" },
    });

    expect(parsed.spellcasting).toEqual({ ability: "INT", progression: "full" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @project/shared test src/schemas/__tests__/spellcastingSchema.test.ts`
Expected: FAIL — `SpellcastingSchema` is not exported.

- [ ] **Step 3: Add the schema**

In `packages/shared/src/schemas/content/character.ts`, above `ClassDefinitionSchema`:

```ts
/**
 * How a class casts, for the classes that cast.
 *
 * Two fields, not three. A `preparation: "prepared" | "known"` belongs here
 * eventually and is deliberately absent: nothing reads it until spell lists
 * exist, and a field authored before it has a reader is the dead-data pattern
 * ruleSnapshot.ts warns about in its own docstring.
 *
 * `progression` drives caster level, which is what the slot tables read. Pact
 * magic is listed here but never contributes to that sum - it is its own pool
 * on its own table, which is what the PHB means by keeping it separate.
 */
export const SpellcastingSchema = z
  .object({
    ability: z.enum(["INT", "WIS", "CHA"]),
    progression: z.enum(["full", "half", "third", "pact"]),
  })
  .strict();

export type Spellcasting = z.infer<typeof SpellcastingSchema>;
```

Then add to `ClassDefinitionSchema`, after `multiclassPrerequisites`:

```ts
  // absent on a class that does not cast, which is the statement
  spellcasting: SpellcastingSchema.optional(),
```

- [ ] **Step 4: Add it to the subclass**

`CoreSubclassSchema` in `packages/shared/src/schemas/content/coreRulePack.ts` is a standalone `.strict()` object rather than an extension of a shared definition, so it needs the field separately. Import `SpellcastingSchema` from `./character.js` and add, after `progression`:

```ts
    // the Eldritch Knight and the Arcane Trickster cast; fighter and rogue do not
    spellcasting: SpellcastingSchema.optional(),
```

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm --filter @project/shared test src/schemas/__tests__/spellcastingSchema.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Regenerate the JSON schemas**

Run: `pnpm --filter @project/database schemas:generate`
Then: `pnpm --filter @project/database test src/__tests__/packSchemas.test.ts`
Expected: PASS. `git diff --stat packages/database/data/schemas` should show `segment.schema.json` changed — that file is generated, and Task 4 cannot author the new field until it has been.

- [ ] **Step 7: Check line endings and commit**

```bash
file packages/shared/src/schemas/content/character.ts packages/shared/src/schemas/content/coreRulePack.ts packages/database/data/schemas/segment.schema.json
git add packages/shared/src packages/database/data/schemas
git commit -m "feat(shared): a class can declare how it casts

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Caster level

**Files:**
- Create: `packages/engine/src/rules/casterLevel.ts`
- Create: `packages/engine/src/rules/__tests__/casterLevel.test.ts`
- Modify: `packages/engine/src/index.ts`

**Interfaces:**
- Consumes: `Spellcasting` from Task 1; `RuleSnapshotLookup` from `./ruleLookup.js`, which already carries `classesById: Record<string, ClassDefinition>` and `subclassesById`.
- Produces:
  - `interface CastingSource { classId: string; level: number; progression: Spellcasting["progression"]; ability: Spellcasting["ability"] }`
  - `collectCastingSources(classLevels: Record<string, number>, subclassIds: Record<string, string | null | undefined>, snapshot?: RuleSnapshotLookup): CastingSource[]`
  - `casterLevel(sources: CastingSource[]): number`

  Tasks 3, 6 and 7 all import these from `@project/engine`.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/rules/__tests__/casterLevel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { casterLevel, collectCastingSources, type CastingSource } from "../casterLevel.js";

const source = (
  classId: string,
  level: number,
  progression: CastingSource["progression"],
): CastingSource => ({ classId, level, progression, ability: "INT" });

describe("casterLevel - a single casting class reads its own table", () => {
  it("is zero for a character that casts nothing", () => {
    expect(casterLevel([])).toBe(0);
  });

  it("gives a full caster its own level", () => {
    expect(casterLevel([source("class_wizard", 1, "full")])).toBe(1);
    expect(casterLevel([source("class_wizard", 20, "full")])).toBe(20);
  });

  // a lone paladin's table is the full-caster table read at ceil(level / 2):
  // paladin 5 has four first-level and two second-level slots, which is what a
  // full caster has at level 3
  it("rounds a lone half-caster up", () => {
    expect(casterLevel([source("class_paladin", 2, "half")])).toBe(1);
    expect(casterLevel([source("class_paladin", 5, "half")])).toBe(3);
    expect(casterLevel([source("class_paladin", 9, "half")])).toBe(5);
    expect(casterLevel([source("class_paladin", 20, "half")])).toBe(10);
  });

  it("rounds a lone third-caster up", () => {
    expect(casterLevel([source("class_fighter", 3, "third")])).toBe(1);
    expect(casterLevel([source("class_fighter", 4, "third")])).toBe(2);
    expect(casterLevel([source("class_fighter", 7, "third")])).toBe(3);
    expect(casterLevel([source("class_fighter", 20, "third")])).toBe(7);
  });
});

describe("casterLevel - several casting classes use the multiclass rule", () => {
  it("adds full levels outright", () => {
    expect(
      casterLevel([
        source("class_wizard", 3, "full"),
        source("class_cleric", 3, "full"),
      ]),
    ).toBe(6);
  });

  // PHB p.164 rounds each contribution down, and the two rules genuinely
  // disagree: one ranger level costs this paladin a caster level
  it("rounds each half-caster down, which can lower the total", () => {
    expect(casterLevel([source("class_paladin", 5, "half")])).toBe(3);
    expect(
      casterLevel([
        source("class_paladin", 5, "half"),
        source("class_ranger", 1, "half"),
      ]),
    ).toBe(2);
  });

  it("rounds a third-caster down alongside another caster", () => {
    expect(
      casterLevel([
        source("class_fighter", 7, "third"),
        source("class_wizard", 1, "full"),
      ]),
    ).toBe(3);
  });
});

describe("casterLevel - pact magic never contributes", () => {
  it("is zero for a warlock alone", () => {
    expect(casterLevel([source("class_warlock", 5, "pact")])).toBe(0);
  });

  it("leaves a single other caster counted as a single caster", () => {
    expect(
      casterLevel([
        source("class_warlock", 5, "pact"),
        source("class_paladin", 5, "half"),
      ]),
    ).toBe(3);
  });
});

describe("collectCastingSources", () => {
  const snapshot = {
    classesById: {
      class_wizard: {
        id: "class_wizard",
        spellcasting: { ability: "INT" as const, progression: "full" as const },
      },
      class_fighter: { id: "class_fighter" },
      class_barbarian: { id: "class_barbarian" },
    },
    subclassesById: {
      subclass_fighter_eldritch_knight: {
        id: "subclass_fighter_eldritch_knight",
        spellcasting: { ability: "INT" as const, progression: "third" as const },
      },
    },
  } as never;

  it("reads the class's own declaration", () => {
    expect(
      collectCastingSources({ class_wizard: 5 }, {}, snapshot),
    ).toEqual([
      { classId: "class_wizard", level: 5, progression: "full", ability: "INT" },
    ]);
  });

  it("falls back to the subclass, at the class's level", () => {
    expect(
      collectCastingSources(
        { class_fighter: 7 },
        { class_fighter: "subclass_fighter_eldritch_knight" },
        snapshot,
      ),
    ).toEqual([
      { classId: "class_fighter", level: 7, progression: "third", ability: "INT" },
    ]);
  });

  it("ignores a class that declares nothing", () => {
    expect(collectCastingSources({ class_barbarian: 5 }, {}, snapshot)).toEqual([]);
  });

  it("ignores a fighter with no subclass chosen", () => {
    expect(collectCastingSources({ class_fighter: 2 }, {}, snapshot)).toEqual([]);
  });

  it("returns nothing without a snapshot", () => {
    expect(collectCastingSources({ class_wizard: 5 }, {})).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @project/engine test src/rules/__tests__/casterLevel.test.ts`
Expected: FAIL — `Failed to resolve import "../casterLevel.js"`.

- [ ] **Step 3: Write the implementation**

Create `packages/engine/src/rules/casterLevel.ts`:

```ts
import type { Spellcasting } from "@project/shared";
import type { RuleSnapshotLookup } from "./ruleLookup.js";

/** One class that contributes to how many slots the character has. */
export interface CastingSource {
  classId: string;
  level: number;
  progression: Spellcasting["progression"];
  ability: Spellcasting["ability"];
}

/**
 * The PHB states two rules here and they disagree, so the branch is the whole
 * point of this function.
 *
 * A single casting class reads its own class table. The half-caster table is
 * the full-caster table at `ceil(level / 2)`: a paladin 5 has four first-level
 * and two second-level slots, which is a full caster's level 3, and
 * `ceil(5 / 2)` is 3. Thirds work the same way.
 *
 * A multiclass caster instead adds `floor(level / 2)` per half-caster and
 * `floor(level / 3)` per third, per p.164. That is not the same number: a
 * paladin 5 who takes one ranger level drops from caster level 3 to 2 and
 * loses slots. Both readings are what the book says; which applies depends
 * only on how many casting classes there are.
 */
const CONTRIBUTION: Record<
  Exclude<Spellcasting["progression"], "pact">,
  { alone: (level: number) => number; shared: (level: number) => number }
> = {
  full: { alone: (level) => level, shared: (level) => level },
  half: {
    alone: (level) => Math.ceil(level / 2),
    shared: (level) => Math.floor(level / 2),
  },
  third: {
    alone: (level) => Math.ceil(level / 3),
    shared: (level) => Math.floor(level / 3),
  },
};

/**
 * The level whose row of the slot table this character reads.
 * @param sources Every casting class the character holds.
 * @returns The caster level, or 0 when nothing here grants slots.
 */
export const casterLevel = (sources: CastingSource[]): number => {
  // pact magic is its own pool on its own table and never joins this sum
  const slotted = sources.filter((source) => source.progression !== "pact");
  if (slotted.length === 0) return 0;

  const rule = slotted.length === 1 ? "alone" : "shared";

  return slotted.reduce(
    (total, source) => total + CONTRIBUTION[source.progression][rule](source.level),
    0,
  );
};

/**
 * Which of the character's classes cast, and how.
 *
 * A class's own declaration wins; failing that, the subclass chosen for that
 * class is consulted, which is how the Eldritch Knight and the Arcane Trickster
 * cast while fighter and rogue do not. Either way the level used is the
 * class's - an Eldritch Knight 7 is a third-caster at 7, not at 5.
 * @param classLevels Class id to level.
 * @param subclassIds Class id to the subclass chosen for it, if any.
 * @param snapshot Pack content, when the caller has any loaded.
 * @returns One source per casting class, in no guaranteed order.
 */
export const collectCastingSources = (
  classLevels: Record<string, number>,
  subclassIds: Record<string, string | null | undefined>,
  snapshot?: RuleSnapshotLookup,
): CastingSource[] => {
  const sources: CastingSource[] = [];

  for (const [classId, level] of Object.entries(classLevels)) {
    const fromClass = snapshot?.classesById?.[classId]?.spellcasting;

    const subclassId = subclassIds[classId];
    const fromSubclass = subclassId
      ? snapshot?.subclassesById?.[subclassId]?.spellcasting
      : undefined;

    const spellcasting = fromClass ?? fromSubclass;
    if (!spellcasting) continue;

    sources.push({
      classId,
      level,
      progression: spellcasting.progression,
      ability: spellcasting.ability,
    });
  }

  return sources;
};
```

- [ ] **Step 4: Export it from the barrel**

In `packages/engine/src/index.ts`, beside the other `./rules/` lines:

```ts
export * from "./rules/casterLevel.js";
```

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm --filter @project/engine test src/rules/__tests__/casterLevel.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 6: Typecheck and commit**

```bash
pnpm --filter @project/engine typecheck
file packages/engine/src/rules/casterLevel.ts packages/engine/src/rules/__tests__/casterLevel.test.ts packages/engine/src/index.ts
git add packages/engine/src
git commit -m "feat(engine): caster level, and the two PHB rules that disagree

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: `caster_level_thresholds`, and one level context

**Files:**
- Modify: `packages/shared/src/schemas/content/resources.ts:22-36`
- Modify: `packages/engine/src/utils/resourceRules.ts`
- Modify: `packages/engine/src/calculators/rests.ts:109-135`
- Modify: `packages/engine/src/utils/__tests__/resourceRules.test.ts`, `packages/engine/src/calculators/__tests__/applyRest.test.ts`
- Modify: `apps/server/src/gateway/socket.ts:291, 1507`
- Modify: `apps/web/src/store/characterSheetStore.ts:307, 881, 1283`
- Modify: `apps/web/src/hooks/useFeatures.ts:64`
- Modify: `apps/web/src/components/sheet/modals/RestModal.tsx:60, 81, 157`

**Interfaces:**
- Consumes: `casterLevel` and `collectCastingSources` from Task 2.
- Produces:
  - `interface LevelContext { totalLevel: number; classLevels: Record<string, number>; casterLevel: number }`
  - `buildLevelContext(classLevels: Record<string, number>, subclassIds?: Record<string, string | null | undefined>, snapshot?: RuleSnapshotLookup): LevelContext`
  - `getResourceMaxUses(rule: Resource, levels: LevelContext): number`
  - `materialiseMissingPools(existingIds: Iterable<string>, granted: Resource[], levels: LevelContext): MaterialisedPool[]`
  - `RestEngine.applyRest(resources: OperationalResource[], restType: "short" | "long", levels: LevelContext, snapshot?: RuleSnapshotLookup): OperationalResource[]`

  Tasks 4, 5, 7 and 8 all depend on these signatures.

Read the deviation note near the top of this plan before starting: the spec proposes an optional fourth parameter and this task deliberately does something else.

- [ ] **Step 1: Write the failing test**

Add to `packages/engine/src/utils/__tests__/resourceRules.test.ts`:

```ts
describe("caster_level_thresholds", () => {
  const slots = {
    id: "spell_slots_3",
    name: "3rd-Level Slots",
    resetCondition: "long_rest" as const,
    maxRule: {
      kind: "caster_level_thresholds" as const,
      thresholds: [
        { minimumLevel: 5, value: 2 },
        { minimumLevel: 6, value: 3 },
      ],
    },
  };

  it("reads caster level, not total level", () => {
    // a paladin 9 is caster level 5: two third-level slots, though their
    // character level is 9 and their class level is 9
    expect(
      getResourceMaxUses(slots, {
        totalLevel: 9,
        classLevels: { class_paladin: 9 },
        casterLevel: 5,
      }),
    ).toBe(2);
  });

  it("is zero below the first rung", () => {
    expect(
      getResourceMaxUses(slots, {
        totalLevel: 4,
        classLevels: { class_wizard: 4 },
        casterLevel: 4,
      }),
    ).toBe(0);
  });
});

describe("buildLevelContext", () => {
  const snapshot = {
    classesById: {
      class_wizard: {
        id: "class_wizard",
        spellcasting: { ability: "INT", progression: "full" },
      },
      class_barbarian: { id: "class_barbarian" },
    },
    subclassesById: {},
  } as never;

  it("totals the levels and derives caster level", () => {
    expect(
      buildLevelContext({ class_wizard: 3, class_barbarian: 2 }, {}, snapshot),
    ).toEqual({
      totalLevel: 5,
      classLevels: { class_wizard: 3, class_barbarian: 2 },
      casterLevel: 3,
    });
  });

  it("reports caster level zero for a character that casts nothing", () => {
    expect(buildLevelContext({ class_barbarian: 5 }, {}, snapshot).casterLevel).toBe(0);
  });
});
```

Import `buildLevelContext` alongside the existing imports in that file.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @project/engine test src/utils/__tests__/resourceRules.test.ts`
Expected: FAIL — `buildLevelContext` is not exported, and the `caster_level_thresholds` literal does not typecheck.

- [ ] **Step 3: Add the schema member**

In `packages/shared/src/schemas/content/resources.ts`, add a fourth member to `ResourceMaxRuleSchema`:

```ts
  z
    .object({
      kind: z.literal("caster_level_thresholds"),
      thresholds: z.array(ResourceThresholdSchema).min(1),
    })
    .strict(),
```

It carries no `classId`, unlike `class_level_thresholds`, because caster level is a property of the whole character rather than of one class.

- [ ] **Step 4: Rewrite the resource utilities around a level context**

In `packages/engine/src/utils/resourceRules.ts`, add the imports and the context, and change the two exported functions:

```ts
import { casterLevel, collectCastingSources } from "../rules/casterLevel.js";

/**
 * Every level a resource rule can be measured against, in one argument.
 *
 * Three separate parameters were threaded through six call sites before
 * caster level existed. A fourth, optional and defaulting to zero, would have
 * let any site that forgot it resolve every spell slot pool to zero - a wizard
 * whose slots quietly vanish, with nothing failing. One required argument puts
 * that on the compiler instead.
 */
export interface LevelContext {
  totalLevel: number;
  classLevels: Record<string, number>;
  /** 0 when the character casts nothing that uses slots. */
  casterLevel: number;
}

/**
 * The level context for a character, derived from what they have taken.
 * @param classLevels Class id to level.
 * @param subclassIds Class id to the subclass chosen for it, if any.
 * @param snapshot Pack content, when the caller has any loaded.
 * @returns totalLevel, classLevels and casterLevel together.
 */
export const buildLevelContext = (
  classLevels: Record<string, number>,
  subclassIds: Record<string, string | null | undefined> = {},
  snapshot?: RuleSnapshotLookup,
): LevelContext => ({
  totalLevel: Object.values(classLevels).reduce((sum, level) => sum + level, 0),
  classLevels,
  casterLevel: casterLevel(
    collectCastingSources(classLevels, subclassIds, snapshot),
  ),
});

export const getResourceMaxUses = (
  rule: Resource,
  levels: LevelContext,
): number => {
  if (rule.mode === "uses") return 0;
  switch (rule.maxRule.kind) {
    case "fixed":
      return rule.maxRule.value;
    case "total_level_thresholds":
      return resolveThresholdValue(rule.maxRule.thresholds, levels.totalLevel);
    case "class_level_thresholds": {
      const currentLevel = levels.classLevels[rule.maxRule.classId] ?? 0;
      return resolveThresholdValue(rule.maxRule.thresholds, currentLevel);
    }
    case "caster_level_thresholds":
      return resolveThresholdValue(rule.maxRule.thresholds, levels.casterLevel);
  }
};
```

and change `materialiseMissingPools`'s signature from `(existingIds, granted, totalLevel, classLevels)` to `(existingIds, granted, levels: LevelContext)`, passing `levels` straight to `getResourceMaxUses`.

- [ ] **Step 5: Let the compiler list the call sites**

Run: `pnpm --filter @project/engine typecheck && pnpm --filter @project/web typecheck && pnpm --filter @project/server typecheck`

Expected: FAIL, naming these and nothing else. Work through them:

- `packages/engine/src/calculators/rests.ts:109` — `applyRest(resources, restType, totalLevel, classLevels, snapshot?)` becomes `applyRest(resources, restType, levels: LevelContext, snapshot?)`, and line 124 passes `levels`.
- `apps/server/src/gateway/socket.ts:291` — it already builds `classLevels` and `totalLevel` from `classRows`, and has `nextSave` and `snapshot` in scope. Delete the `totalLevel` line and replace both arguments with one context:

  ```ts
  const levels = buildLevelContext(
    classLevels,
    Object.fromEntries(
      nextSave.classes.map((entry) => [entry.classId, entry.subclassId]),
    ),
    snapshot,
  );
  ```
- `apps/server/src/gateway/socket.ts:1507` — pass the same `levels` to `applyRest`.
- `apps/web/src/store/characterSheetStore.ts:307, 881, 1283` — the store holds `classLevels`, `subclassIds` and `ruleSnapshot`, so each becomes `buildLevelContext(classLevels, subclassIds, snapshot ?? undefined)`.
- `apps/web/src/hooks/useFeatures.ts:64` — add a `subclassIds` selector beside the existing `classLevels` one and build the context inside the `useMemo`, adding it to the dependency array.
- `apps/web/src/components/sheet/modals/RestModal.tsx:60, 81, 157` — add a `subclassIds` selector beside the existing `classLevels` one at line 22, build the context once near the top of the component, and pass it to all three calls.

- [ ] **Step 6: Fix the two engine test files**

`resourceRules.test.ts:41,47` call `materialiseMissingPools([], rage, 3, { class_barbarian: 3 })`; the third and fourth arguments become one context:

```ts
materialiseMissingPools([], rage, {
  totalLevel: 3,
  classLevels: { class_barbarian: 3 },
  casterLevel: 0,
})
```

`applyRest.test.ts:32,85` call `RestEngine.applyRest(resources, type, 5, {}, snapshot)`; the `5, {}` becomes `{ totalLevel: 5, classLevels: {}, casterLevel: 0 }`.

`apps/web/src/hooks/__tests__/useFeatures.test.ts` mocks the store with a `mockStoreState` holding `resources`, `level`, `classLevels` and `ruleSnapshot`. The hook now also selects `subclassIds`, so add `subclassIds: Record<string, string | null>` to that type and `subclassIds: {}` to the `beforeEach`, or every case reads `undefined` and throws inside `collectCastingSources`. `RestModal`'s and the store's own suites need the same field wherever they build a fake state.

- [ ] **Step 7: Run everything**

```bash
pnpm --filter @project/shared test
pnpm --filter @project/engine test
pnpm --filter @project/server test
pnpm --filter @project/web test
pnpm typecheck
```

Expected: all green. No assertion should have changed value — this task moves arguments around and adds one case.

- [ ] **Step 8: Check line endings and commit**

```bash
file packages/shared/src/schemas/content/resources.ts packages/engine/src/utils/resourceRules.ts packages/engine/src/calculators/rests.ts apps/server/src/gateway/socket.ts apps/web/src/hooks/useFeatures.ts apps/web/src/components/sheet/modals/RestModal.tsx apps/web/src/store/characterSheetStore.ts
git add packages apps
git commit -m "refactor(engine): resource maxima read one level context

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: The slot tables

**Files:**
- Modify: `packages/database/scripts/patchPackSegment.ts`
- Modify: `packages/database/data/packs/core_2014_pack/classes/{bard,cleric,druid,sorcerer,wizard,paladin,ranger,fighter,rogue}.json`
- Create: `packages/engine/src/calculators/__tests__/slotTables.test.ts`

**Interfaces:**
- Consumes: the schema from Task 1, `caster_level_thresholds` and `buildLevelContext` from Task 3.
- Produces: eight authored traits and nine class or subclass declarations. No code interface.

The thresholds below are against **caster level**, and `resolveThresholdValue` takes the last rung at or below the level, so every list is ascending.

- [ ] **Step 1: Give the patch script the two capabilities it lacks**

`patchPackSegment.ts` can upsert traits, delete traits, strip progression grants and strip multiclass trait ids. It cannot set a field on a class or a subclass, which this task needs. Add to `Patch`:

```ts
  /** Class id -> fields to set on that class, shallow. */
  setClassFields?: Record<string, Record<string, unknown>>;
  /** Subclass id -> fields to set on that subclass, shallow. */
  setSubclassFields?: Record<string, Record<string, unknown>>;
```

widen `Segment` to `{ traits?: Array<{ id: string }>; classes?: Array<Record<string, unknown> & { id: string; progression: Array<{ grants: unknown[] }> }>; subclasses?: Array<Record<string, unknown> & { id: string }> }`, and add the two passes beside the existing ones:

```ts
for (const [classId, fields] of Object.entries(patch.setClassFields ?? {})) {
  const entry = (segment.classes ?? []).find((cls) => cls.id === classId);
  if (!entry) throw new Error(`${segmentPath} has no class '${classId}'`);
  Object.assign(entry, fields);
}

for (const [subclassId, fields] of Object.entries(patch.setSubclassFields ?? {})) {
  const entry = (segment.subclasses ?? []).find((sub) => sub.id === subclassId);
  if (!entry) throw new Error(`${segmentPath} has no subclass '${subclassId}'`);
  Object.assign(entry, fields);
}
```

- [ ] **Step 2: Write the authoring driver**

Write `author-slots.mjs` in your scratchpad. The tables are the deliverable; the driver is plumbing.

```js
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PACK = "data/packs/core_2014_pack";
const SCRATCH = process.env.SCRATCH ?? ".";

const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

// caster level -> slots, per slot level. PHB full-caster table.
const SLOTS = {
  1: [[1, 2], [2, 3], [3, 4]],
  2: [[3, 2], [4, 3]],
  3: [[5, 2], [6, 3]],
  4: [[7, 1], [8, 2], [9, 3]],
  5: [[9, 1], [10, 2], [18, 3]],
  6: [[11, 1], [19, 2]],
  7: [[13, 1], [20, 2]],
  8: [[15, 1]],
  9: [[17, 1]],
};

// how high each progression can ever reach, so no class grants a pool it can
// never fill: a paladin 20 is caster level 10, an Eldritch Knight 20 is 7
const TOP_SLOT = { full: 9, half: 5, third: 4 };

const slotResources = (progression) =>
  Array.from({ length: TOP_SLOT[progression] }, (_, index) => {
    const slotLevel = index + 1;
    return {
      id: `spell_slots_${slotLevel}`,
      name: `${ORDINAL[slotLevel]}-Level Spell Slots`,
      resetCondition: "long_rest",
      maxRule: {
        kind: "caster_level_thresholds",
        thresholds: SLOTS[slotLevel].map(([minimumLevel, value]) => ({
          minimumLevel,
          value,
        })),
      },
    };
  });

const trait = (id, name, progression, lore) => ({
  id,
  name,
  lore: { shortDescription: lore, fullText: lore },
  modifiers: { fixed: [], choices: [] },
  proficiencies: { fixed: [], choices: [] },
  resources: slotResources(progression),
  triggers: [],
  diceRules: [],
  criticalHitModifiers: [],
  actions: [],
});

// [file, trait id, display name, ability, progression, owner kind, owner id]
const TABLE = [
  ["bard", "trait_spellcasting_bard", "Spellcasting (Bard)", "CHA", "full", "class", "class_bard"],
  ["cleric", "trait_spellcasting_cleric", "Spellcasting (Cleric)", "WIS", "full", "class", "class_cleric"],
  ["druid", "trait_spellcasting_druid", "Spellcasting (Druid)", "WIS", "full", "class", "class_druid"],
  ["sorcerer", "trait_spellcasting_sorcerer", "Spellcasting (Sorcerer)", "CHA", "full", "class", "class_sorcerer"],
  ["wizard", "trait_spellcasting_wizard", "Spellcasting (Wizard)", "INT", "full", "class", "class_wizard"],
  ["paladin", "trait_spellcasting_paladin", "Spellcasting (Paladin)", "CHA", "half", "class", "class_paladin"],
  ["ranger", "trait_spellcasting_ranger", "Spellcasting (Ranger)", "WIS", "half", "class", "class_ranger"],
  ["fighter", "trait_fighter_eldritch_knight_spellcasting", "Spellcasting (Eldritch Knight)", "INT", "third", "subclass", "subclass_fighter_eldritch_knight"],
  ["rogue", "trait_rogue_arcane_trickster_spellcasting", "Spellcasting (Arcane Trickster)", "INT", "third", "subclass", "subclass_rogue_arcane_trickster"],
];

const run = (segment, patch, label) => {
  const file = path.join(SCRATCH, `patch-${label}.json`);
  fs.writeFileSync(file, JSON.stringify(patch, null, 2));
  execFileSync("npx", ["tsx", "scripts/patchPackSegment.ts", segment, file], {
    stdio: "inherit",
  });
};

for (const [file, id, name, ability, progression, kind, ownerId] of TABLE) {
  const lore = `You can cast spells, using ${ability === "INT" ? "Intelligence" : ability === "WIS" ? "Wisdom" : "Charisma"} as your spellcasting ability. Your spell slots are shown beside your other resources.`;
  const patch = { upsertTraits: [trait(id, name, progression, lore)] };
  const declaration = { spellcasting: { ability, progression } };
  if (kind === "class") patch.setClassFields = { [ownerId]: declaration };
  else patch.setSubclassFields = { [ownerId]: declaration };
  run(`${PACK}/classes/${file}.json`, patch, file);
}
```

- [ ] **Step 3: Run the driver**

From `packages/database`:

```bash
SCRATCH=<scratchpad> node <scratchpad>/author-slots.mjs
```

- [ ] **Step 4: Check the diff is surgical**

```bash
git diff --stat packages/database/data
```

Expected: nine class files changed. `git diff` should show only the nine replaced traits and nine added `spellcasting` blocks — no reindentation and no line-ending churn. If a whole file re-prints, the patch script was bypassed; revert and redo.

- [ ] **Step 5: Write the pack-driven table test**

Create `packages/engine/src/calculators/__tests__/slotTables.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { corePackSnapshot } from "../../pipeline/__tests__/corePackFixture.js";
import {
  buildLevelContext,
  collectGrantedResources,
  getResourceMaxUses,
} from "../../utils/resourceRules.js";

/**
 * The PHB tables, read out of the shipped pack rather than restated here.
 * A mis-authored threshold fails this; it cannot be papered over by writing
 * the same mistake into the expectation.
 */
const snapshot = corePackSnapshot();

const slotsFor = (
  traitId: string,
  classId: string,
  level: number,
  subclassId?: string,
): number[] => {
  const trait = snapshot.traitsById[traitId];
  const granted = collectGrantedResources([trait], { resourcesById: {} });
  const levels = buildLevelContext(
    { [classId]: level },
    subclassId ? { [classId]: subclassId } : {},
    { classesById: snapshot.classesById, subclassesById: snapshot.subclassesById },
  );

  return Array.from({ length: 9 }, (_, index) => {
    const pool = granted.find((entry) => entry.id === `spell_slots_${index + 1}`);
    return pool ? getResourceMaxUses(pool, levels) : 0;
  });
};

describe("the authored slot tables match the PHB", () => {
  it("a wizard 5 has 4/3/2", () => {
    expect(slotsFor("trait_spellcasting_wizard", "class_wizard", 5)).toEqual([
      4, 3, 2, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it("a wizard 1 has two first-level slots and nothing else", () => {
    expect(slotsFor("trait_spellcasting_wizard", "class_wizard", 1)).toEqual([
      2, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it("a wizard 20 has 4/3/3/3/3/2/2/1/1", () => {
    expect(slotsFor("trait_spellcasting_wizard", "class_wizard", 20)).toEqual([
      4, 3, 3, 3, 3, 2, 2, 1, 1,
    ]);
  });

  it("a paladin 5 has 4/2, which is a full caster's level 3", () => {
    expect(slotsFor("trait_spellcasting_paladin", "class_paladin", 5)).toEqual([
      4, 2, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it("a paladin 20 tops out at two fifth-level slots", () => {
    expect(slotsFor("trait_spellcasting_paladin", "class_paladin", 20)).toEqual([
      4, 3, 3, 3, 2, 0, 0, 0, 0,
    ]);
  });

  it("a paladin 1 has no slots at all", () => {
    expect(slotsFor("trait_spellcasting_paladin", "class_paladin", 1)).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it("an eldritch knight 3 has two first-level slots", () => {
    const slots = slotsFor(
      "trait_fighter_eldritch_knight_spellcasting",
      "class_fighter",
      3,
      "subclass_fighter_eldritch_knight",
    );

    expect(slots[0]).toBe(2);
  });

  it("an eldritch knight with no subclass chosen has none", () => {
    expect(
      slotsFor("trait_fighter_eldritch_knight_spellcasting", "class_fighter", 3),
    ).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});
```

The last case is the reason `slotsFor` takes a subclass id at all: a fighter who has not chosen the Eldritch Knight declares no spellcasting, so `buildLevelContext` returns caster level 0 and every pool resolves to nothing.

- [ ] **Step 6: Run it**

Run: `pnpm --filter @project/engine test src/calculators/__tests__/slotTables.test.ts`
Expected: PASS, 8 tests. A failure here names the slot level and the expected count — read it against the table in step 2 before changing anything.

- [ ] **Step 7: Run the database suite and commit**

```bash
pnpm --filter @project/database test
pnpm --filter @project/engine test
file packages/database/scripts/patchPackSegment.ts
git add packages/database packages/engine/src/calculators/__tests__/slotTables.test.ts
git commit -m "feat(pack): slot casters declare how they cast, and get slots

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Pact magic

**Files:**
- Modify: `packages/database/data/packs/core_2014_pack/classes/warlock.json`
- Modify: `packages/engine/src/calculators/__tests__/slotTables.test.ts`

**Interfaces:**
- Consumes: the patch script capabilities from Task 4.
- Produces: `pact_slots` and `pact_slot_level` resources on `trait_pact_magic`, and `spellcasting: { ability: "CHA", progression: "pact" }` on `class_warlock`.

Pact magic uses `class_level_thresholds` on warlock level, not caster level — it is deliberately outside the shared table.

- [ ] **Step 1: Write the failing test**

Add to `packages/engine/src/calculators/__tests__/slotTables.test.ts`:

```ts
describe("pact magic is its own table", () => {
  const pactPool = (poolId: string, level: number): number => {
    const trait = snapshot.traitsById["trait_pact_magic"];
    const granted = collectGrantedResources([trait], { resourcesById: {} });
    const pool = granted.find((entry) => entry.id === poolId);
    if (!pool) throw new Error(`trait_pact_magic grants no ${poolId}`);

    return getResourceMaxUses(
      pool,
      buildLevelContext({ class_warlock: level }, {}, {
        classesById: snapshot.classesById,
        subclassesById: snapshot.subclassesById,
      }),
    );
  };

  it("gives one slot at 1, two at 2, three at 11 and four at 17", () => {
    expect(pactPool("pact_slots", 1)).toBe(1);
    expect(pactPool("pact_slots", 2)).toBe(2);
    expect(pactPool("pact_slots", 10)).toBe(2);
    expect(pactPool("pact_slots", 11)).toBe(3);
    expect(pactPool("pact_slots", 17)).toBe(4);
  });

  it("raises the slot level every two warlock levels to a cap of five", () => {
    expect(pactPool("pact_slot_level", 1)).toBe(1);
    expect(pactPool("pact_slot_level", 3)).toBe(2);
    expect(pactPool("pact_slot_level", 5)).toBe(3);
    expect(pactPool("pact_slot_level", 7)).toBe(4);
    expect(pactPool("pact_slot_level", 9)).toBe(5);
    expect(pactPool("pact_slot_level", 20)).toBe(5);
  });

  it("does not contribute to caster level", () => {
    expect(
      buildLevelContext({ class_warlock: 20 }, {}, {
        classesById: snapshot.classesById,
        subclassesById: snapshot.subclassesById,
      }).casterLevel,
    ).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @project/engine test src/calculators/__tests__/slotTables.test.ts`
Expected: FAIL — `trait_pact_magic grants no pact_slots`.

- [ ] **Step 3: Author it**

Write `patch-warlock.json` in your scratchpad and apply it from `packages/database` with `npx tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/classes/warlock.json <scratchpad>/patch-warlock.json`:

```json
{
  "setClassFields": {
    "class_warlock": { "spellcasting": { "ability": "CHA", "progression": "pact" } }
  },
  "upsertTraits": [
    {
      "id": "trait_pact_magic",
      "name": "Pact Magic",
      "lore": {
        "shortDescription": "Your patron grants you a small number of spell slots that all come back on a short rest, and every one of them is cast at the same level.",
        "fullText": "Your patron grants you a small number of spell slots that all come back on a short rest, and every one of them is cast at the same level. Pact magic is separate from other spellcasting: a warlock's levels never combine with another class's to determine slots."
      },
      "modifiers": { "fixed": [], "choices": [] },
      "proficiencies": { "fixed": [], "choices": [] },
      "resources": [
        {
          "id": "pact_slots",
          "name": "Pact Magic Slots",
          "resetCondition": "short_rest",
          "maxRule": {
            "kind": "class_level_thresholds",
            "classId": "class_warlock",
            "thresholds": [
              { "minimumLevel": 1, "value": 1 },
              { "minimumLevel": 2, "value": 2 },
              { "minimumLevel": 11, "value": 3 },
              { "minimumLevel": 17, "value": 4 }
            ]
          }
        },
        {
          "id": "pact_slot_level",
          "name": "Pact Slot Level",
          "resetCondition": "never",
          "maxRule": {
            "kind": "class_level_thresholds",
            "classId": "class_warlock",
            "thresholds": [
              { "minimumLevel": 1, "value": 1 },
              { "minimumLevel": 3, "value": 2 },
              { "minimumLevel": 5, "value": 3 },
              { "minimumLevel": 7, "value": 4 },
              { "minimumLevel": 9, "value": 5 }
            ]
          }
        }
      ],
      "triggers": [],
      "diceRules": [],
      "criticalHitModifiers": [],
      "actions": []
    }
  ]
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @project/engine test src/calculators/__tests__/slotTables.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Look at how `pact_slot_level` renders, and say what you saw**

It is a number wearing a resource's clothes — `resetCondition: "never"` and a maximum that rises with level. `useFeatures` will render it as a charges pool reading "5 / 5", which is not wrong but may read oddly beside four real slots. Task 8 decides whether to filter it out of the Features widget; note here in the task ledger which way it looked, so that decision is made from having seen it rather than guessed.

- [ ] **Step 6: Commit**

```bash
pnpm --filter @project/database test
git add packages/database/data packages/engine/src/calculators/__tests__/slotTables.test.ts
git commit -m "feat(pack): pact magic, on its own table

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: The save DC and the attack bonus

**Files:**
- Create: `packages/engine/src/calculators/spellcasting.ts`
- Create: `packages/engine/src/calculators/__tests__/spellcasting.test.ts`
- Modify: `packages/engine/src/index.ts`

**Interfaces:**
- Consumes: `CastingSource` from Task 2.
- Produces:
  - `interface DerivedSpellcasting { classId: string; ability: Ability; modifier: number; saveDc: number; attackBonus: number; pactSlotLevel?: number; breakdown: string }`
  - `SpellcastingEngine.calculate(sources: CastingSource[], abilityScores: Record<Ability, number>, profBonus: number, modifiers: RuntimeModifier[], activeStates?: string[]): DerivedSpellcasting[]`

  Tasks 7 and 8 consume both.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/calculators/__tests__/spellcasting.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { RuntimeModifier } from "@project/shared";
import type { CastingSource } from "../../rules/casterLevel.js";
import type { Ability } from "../../types/core.js";
import { SpellcastingEngine } from "../spellcasting.js";

const scores: Record<Ability, number> = {
  STR: 10,
  DEX: 10,
  CON: 10,
  INT: 18,
  WIS: 14,
  CHA: 8,
};

const wizard: CastingSource = {
  classId: "class_wizard",
  level: 5,
  progression: "full",
  ability: "INT",
};

const cleric: CastingSource = {
  classId: "class_cleric",
  level: 3,
  progression: "full",
  ability: "WIS",
};

const modifier = (overrides: Partial<RuntimeModifier>): RuntimeModifier => ({
  id: "mod_1",
  target: "SPELLCASTING_MOD",
  type: "add",
  value: 1,
  scalingFactor: "none",
  requiredStates: [],
  forbiddenStates: [],
  sourceName: "Test Source",
  sourceOrigin: "item",
  isActive: true,
  ...overrides,
});

describe("SpellcastingEngine.calculate", () => {
  it("derives the DC and the attack bonus from the class's own ability", () => {
    const [result] = SpellcastingEngine.calculate([wizard], scores, 3, []);

    expect(result.ability).toBe("INT");
    expect(result.modifier).toBe(4);
    expect(result.saveDc).toBe(15); // 8 + 3 + 4
    expect(result.attackBonus).toBe(7); // 3 + 4
    expect(result.breakdown).toContain("INT (+4)");
  });

  it("returns one entry per casting class, each on its own ability", () => {
    const results = SpellcastingEngine.calculate([wizard, cleric], scores, 3, []);

    expect(results).toHaveLength(2);
    expect(results.find((r) => r.classId === "class_cleric")?.saveDc).toBe(13);
    expect(results.find((r) => r.classId === "class_wizard")?.saveDc).toBe(15);
  });

  it("applies a SPELLCASTING_MOD modifier to both numbers", () => {
    const [result] = SpellcastingEngine.calculate([wizard], scores, 3, [
      modifier({ sourceName: "Rod of the Pact Keeper" }),
    ]);

    expect(result.saveDc).toBe(16);
    expect(result.attackBonus).toBe(8);
    expect(result.breakdown).toContain("Rod of the Pact Keeper (+1)");
  });

  it("ignores a modifier whose required state is not active", () => {
    const [result] = SpellcastingEngine.calculate(
      [wizard],
      scores,
      3,
      [modifier({ requiredStates: ["raging"] })],
      [],
    );

    expect(result.saveDc).toBe(15);
  });

  it("ignores an inactive modifier", () => {
    const [result] = SpellcastingEngine.calculate([wizard], scores, 3, [
      modifier({ isActive: false }),
    ]);

    expect(result.saveDc).toBe(15);
  });

  it("reports the pact slot level for a warlock and omits it otherwise", () => {
    const [pact] = SpellcastingEngine.calculate(
      [{ classId: "class_warlock", level: 9, progression: "pact", ability: "CHA" }],
      scores,
      3,
      [],
    );

    expect(pact.pactSlotLevel).toBe(5);
    expect(
      SpellcastingEngine.calculate([wizard], scores, 3, [])[0].pactSlotLevel,
    ).toBeUndefined();
  });

  it("returns nothing for a character that casts nothing", () => {
    expect(SpellcastingEngine.calculate([], scores, 3, [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @project/engine test src/calculators/__tests__/spellcasting.test.ts`
Expected: FAIL — `Failed to resolve import "../spellcasting.js"`.

- [ ] **Step 3: Write the implementation**

Create `packages/engine/src/calculators/spellcasting.ts`:

```ts
import type { RuntimeModifier } from "@project/shared";
import type { CastingSource } from "../rules/casterLevel.js";
import type { Ability } from "../types/core.js";
import { AbilityEngine } from "./abilities.js";

/** The two numbers a caster needs, for one of their casting classes. */
export interface DerivedSpellcasting {
  classId: string;
  ability: Ability;
  modifier: number;
  /** 8 + proficiency + modifier. */
  saveDc: number;
  /** proficiency + modifier. */
  attackBonus: number;
  /** Warlocks only: the level every pact slot is cast at. */
  pactSlotLevel?: number;
  breakdown: string;
}

/**
 * The PHB's pact slot level track, which rises every second warlock level and
 * stops at five. Authored in the pack as `pact_slot_level` for the sheet to
 * show beside the pool; repeated here because this result is what the roll
 * layer reads, and it should not have to resolve a resource to answer "what
 * level does this warlock cast at".
 */
const pactSlotLevel = (warlockLevel: number): number =>
  Math.min(5, Math.ceil(warlockLevel / 2));

export class SpellcastingEngine {
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

    return sources.map((source) => {
      const abilityMod = AbilityEngine.getModifier(abilityScores[source.ability]);
      const tokens = [
        `${source.ability} (${abilityMod >= 0 ? "+" : ""}${abilityMod})`,
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
        classId: source.classId,
        ability: source.ability,
        modifier: total,
        saveDc: 8 + profBonus + total,
        attackBonus: profBonus + total,
        ...(source.progression === "pact" && {
          pactSlotLevel: pactSlotLevel(source.level),
        }),
        breakdown: tokens.join(" | "),
      };
    });
  }
}
```

- [ ] **Step 4: Export it and run the test**

Add `export * from "./calculators/spellcasting.js";` to `packages/engine/src/index.ts`.

Run: `pnpm --filter @project/engine test src/calculators/__tests__/spellcasting.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm --filter @project/engine typecheck
file packages/engine/src/calculators/spellcasting.ts packages/engine/src/index.ts
git add packages/engine/src
git commit -m "feat(engine): spell save DC and attack bonus, per casting class

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: The live sheet carries it

**Files:**
- Modify: `packages/engine/src/pipeline/characterEngine.ts:110-167` and its compute body
- Modify: `packages/engine/src/pipeline/__tests__/characterEngine.test.ts`

**Interfaces:**
- Consumes: `collectCastingSources` from Task 2, `SpellcastingEngine` and `DerivedSpellcasting` from Task 6.
- Produces: `LiveCharacterSheet.spellcasting: DerivedSpellcasting[]`. The server hands this to clients; Task 8's web hook computes its own rather than consuming it, the same way `useDerivedStats` already does.

- [ ] **Step 1: Write the failing test**

Add to `packages/engine/src/pipeline/__tests__/characterEngine.test.ts`. That file already has a `buildSheet(save, inventory?, options?)` helper that loads the shipped pack through `corePackLookup()`, and a `halfElfBarbarian(level)` save builder; add one more save builder beside them:

```ts
const humanWizard = (level: number): CharacterSave => ({
  attributes: { str: 10, dex: 10, con: 10, int: 16, wis: 10, cha: 10 },
  race: { baseRaceId: "race_human", hasSubraces: false, subraceId: null },
  classes: [{ classId: "class_wizard", level, selections: {} }],
  traitSelections: {},
  hp: { current: 10, temporary: 0, baseRolledHp: 6, hitDiceSpent: {} },
});
```

and the two cases, in the existing `describe("CharacterEngine.buildLiveSheet", ...)`:

```ts
  it("puts a wizard's spell save DC and attack bonus on the live sheet", () => {
    const sheet = buildSheet(humanWizard(5));
    const wizard = sheet.spellcasting.find(
      (entry) => entry.classId === "class_wizard",
    );

    // proficiency is +3 at level 5, and INT 16 is +3
    expect(wizard?.ability).toBe("INT");
    expect(wizard?.saveDc).toBe(14);
    expect(wizard?.attackBonus).toBe(6);
  });

  it("gives a barbarian no spellcasting entries at all", () => {
    expect(buildSheet(halfElfBarbarian(5)).spellcasting).toEqual([]);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @project/engine test src/pipeline/__tests__/characterEngine.test.ts`
Expected: FAIL — `spellcasting` is not a property of the result.

- [ ] **Step 3: Add the field and compute it**

In `LiveCharacterSheet`, after `saves`:

```ts
  /**
   * The save DC and attack bonus for each class that casts, empty for a
   * character that casts nothing. One entry per class, because a wizard/cleric
   * has two of each and one number would be wrong for half their spells.
   */
  spellcasting: DerivedSpellcasting[];
```

In the compute body, beside where saves are derived, and using the `selections`/`classLevels` already in scope:

```ts
    const castingSources = collectCastingSources(
      classLevels,
      subclassIds,
      options.snapshot,
    );
    const spellcasting = SpellcastingEngine.calculate(
      castingSources,
      finalScores,
      proficiencyBonus,
      modifiers,
      activeStates,
    );
```

then add `spellcasting` to the returned object. Use whatever the surrounding code already calls the final ability score record and the modifier list — do not introduce new names for them.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @project/engine test`
Expected: all green, including the two new cases.

- [ ] **Step 5: Typecheck across the workspace**

Run: `pnpm typecheck`
Expected: clean. Adding a required field to `LiveCharacterSheet` breaks any hand-built literal of that type; the compiler names them, and each should be given `spellcasting: []`.

- [ ] **Step 6: Commit**

```bash
file packages/engine/src/pipeline/characterEngine.ts
git add packages/engine/src apps
git commit -m "feat(engine): the live sheet carries spellcasting

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: The sheet

**Files:**
- Create: `apps/web/src/components/sheet/SpellcastingWidget.tsx`
- Create: `apps/web/src/components/sheet/__tests__/SpellcastingWidget.test.tsx`
- Modify: `apps/web/src/hooks/useCharacterStats.ts`
- Modify: `apps/web/src/components/sheet/DashboardLayout.tsx:19, 246`

**Interfaces:**
- Consumes: `SpellcastingEngine`, `DerivedSpellcasting`, `collectCastingSources` from `@project/engine`; `getProficiencyGrants` and the store's `classLevels`, `subclassIds`, `ruleSnapshot`.
- Produces: `useSpellcasting(): DerivedSpellcasting[]` exported from `useCharacterStats.ts`, and `<SpellcastingWidget />`.

Slots need no work here — `useFeatures` already renders every granted pool, so authoring them in Tasks 4 and 5 put them on the sheet. This task adds the two numbers and confirms the slots really do appear.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/sheet/__tests__/SpellcastingWidget.test.tsx`. This repo does **not** use `@testing-library/react`; widget suites render with `createRoot` and `act` and assert on `container.textContent`, and they hoist their mocks with `vi.hoisted`. `SavingThrowsWidget.test.tsx` in the same directory is the model.

```tsx
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import type { DerivedSpellcasting } from "@project/engine";
import { SpellcastingWidget } from "../SpellcastingWidget";

const mocks = vi.hoisted(() => ({
  entries: { current: [] as DerivedSpellcasting[] },
}));

vi.mock("../../../hooks/useCharacterStats", () => ({
  useSpellcasting: () => mocks.entries.current,
}));

const entry = (
  overrides: Partial<DerivedSpellcasting> = {},
): DerivedSpellcasting => ({
  classId: "class_wizard",
  ability: "INT",
  modifier: 4,
  saveDc: 15,
  attackBonus: 7,
  breakdown: "INT (+4) | Proficiency (+3)",
  ...overrides,
});

const renderWidget = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<SpellcastingWidget />);
  });

  return container;
};

describe("SpellcastingWidget", () => {
  it("shows the save DC and the attack bonus", async () => {
    mocks.entries.current = [entry()];

    const container = await renderWidget();

    expect(container.textContent).toContain("15");
    expect(container.textContent).toContain("+7");
    expect(container.textContent).toContain("Wizard");
  });

  it("shows a row per casting class rather than collapsing them", async () => {
    mocks.entries.current = [
      entry(),
      entry({
        classId: "class_cleric",
        ability: "WIS",
        modifier: 2,
        saveDc: 13,
        attackBonus: 5,
      }),
    ];

    const container = await renderWidget();

    expect(container.textContent).toContain("15");
    expect(container.textContent).toContain("13");
    expect(container.textContent).toContain("Cleric");
  });

  it("reports the pact slot level for a warlock", async () => {
    mocks.entries.current = [
      entry({ classId: "class_warlock", ability: "CHA", pactSlotLevel: 5 }),
    ];

    const container = await renderWidget();

    expect(container.textContent).toContain("pact slots cast at level 5");
  });

  it("renders nothing at all for a character that casts nothing", async () => {
    mocks.entries.current = [];

    const container = await renderWidget();

    expect(container.textContent).toBe("");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @project/web test src/components/sheet/__tests__/SpellcastingWidget.test.tsx`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Add the hook**

In `apps/web/src/hooks/useCharacterStats.ts`, beside `useDerivedStats`:

```ts
/**
 * The save DC and attack bonus for each class the character casts with.
 * Empty for a character that casts nothing, which is what lets the widget
 * render nothing at all rather than an empty panel.
 */
export const useSpellcasting = (): DerivedSpellcasting[] => {
  const classLevels = useCharacterSheetStore((state) => state.classLevels);
  const subclassIds = useCharacterSheetStore((state) => state.subclassIds);
  const ruleSnapshot = useCharacterSheetStore((state) => state.ruleSnapshot);
  const activeStates = useCharacterSheetStore((state) => state.activeStates);

  const { finalAbilities, totalMods } = useAbilities();
  const { profBonus } = useDerivedStats();

  return useMemo(() => {
    const sources = collectCastingSources(
      classLevels,
      subclassIds,
      ruleSnapshot ?? undefined,
    );

    return SpellcastingEngine.calculate(
      sources,
      Object.fromEntries(
        Object.entries(finalAbilities).map(([ability, derived]) => [
          ability,
          derived.score,
        ]),
      ) as Record<Ability, number>,
      profBonus,
      totalMods,
      activeStates,
    );
  }, [
    classLevels,
    subclassIds,
    ruleSnapshot,
    finalAbilities,
    profBonus,
    totalMods,
    activeStates,
  ]);
};
```

adding `SpellcastingEngine`, `collectCastingSources` and `type DerivedSpellcasting` to the `@project/engine` import block.

- [ ] **Step 4: Write the widget**

Create `apps/web/src/components/sheet/SpellcastingWidget.tsx`, following the card shape `ArmorClassWidget.tsx` uses — a rounded panel with a heading and a boxed number:

```tsx
import { useSpellcasting } from "../../hooks/useCharacterStats";

const CLASS_LABEL: Record<string, string> = {
  class_bard: "Bard",
  class_cleric: "Cleric",
  class_druid: "Druid",
  class_fighter: "Eldritch Knight",
  class_paladin: "Paladin",
  class_ranger: "Ranger",
  class_rogue: "Arcane Trickster",
  class_sorcerer: "Sorcerer",
  class_warlock: "Warlock",
  class_wizard: "Wizard",
};

/**
 * The two numbers every caster needs, one row per casting class.
 *
 * A wizard/cleric has an INT DC and a WIS DC; showing one would be wrong for
 * half of what they cast, so the rows are not collapsed.
 */
export const SpellcastingWidget = () => {
  const entries = useSpellcasting();

  if (entries.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">
        Spellcasting
      </p>

      <div className="mt-3 space-y-2">
        {entries.map((entry) => (
          <div
            key={entry.classId}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
            title={entry.breakdown}
          >
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {CLASS_LABEL[entry.classId] ?? entry.classId}
              </p>
              <p className="text-xs text-slate-500">
                {entry.ability}
                {entry.pactSlotLevel !== undefined &&
                  ` · pact slots cast at level ${entry.pactSlotLevel}`}
              </p>
            </div>

            <div className="flex gap-4 text-center">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  Save DC
                </p>
                <p className="text-lg font-semibold text-slate-900">
                  {entry.saveDc}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  Attack
                </p>
                <p className="text-lg font-semibold text-slate-900">
                  +{entry.attackBonus}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 5: Place it on the dashboard**

In `apps/web/src/components/sheet/DashboardLayout.tsx`, import it beside the other widget imports and render `<SpellcastingWidget />` immediately before `<SavingThrowsWidget />` at line 246. It returns `null` for a non-caster, so no layout branch is needed.

- [ ] **Step 6: Run the web suite**

```bash
pnpm --filter @project/web test
pnpm --filter @project/web typecheck
```

Expected: both green, with the three new cases passing.

- [ ] **Step 7: Assert the slots really do reach the sheet**

The claim that slots need no web work is worth one test rather than one
sentence. Add to `apps/web/src/hooks/__tests__/useFeatures.test.ts`:

```ts
  it("shows a level 5 wizard only the slot pools they can fill", () => {
    mockStoreState.level = 5;
    mockStoreState.classLevels = { class_wizard: 5 };
    mockStoreState.subclassIds = {};
    mockStoreState.resources = [
      { id: "spell_slots_1", current: 4 },
      { id: "spell_slots_2", current: 3 },
      { id: "spell_slots_3", current: 2 },
      { id: "spell_slots_4", current: 0 },
    ];

    const pools = useFeatures();

    // the fourth-level pool has a maximum of zero at caster level 5 and the
    // hook's own guard drops it
    expect(pools.map((pool) => pool.id)).toEqual([
      "spell_slots_1",
      "spell_slots_2",
      "spell_slots_3",
    ]);
    expect(pools[0]).toMatchObject({ kind: "charges", max: 4 });
    expect(pools[2]).toMatchObject({ kind: "charges", max: 2 });
  });
```

Run: `pnpm --filter @project/web test src/hooks/__tests__/useFeatures.test.ts`
Expected: PASS. A failure here means Task 4's authoring or Task 3's threading is wrong, not the widget.

- [ ] **Step 8: Decide the `pact_slot_level` question**

Task 5 step 5 recorded how `pact_slot_level` reads in the Features widget. If it reads as a spendable pool and that is confusing, filter it there — in `useFeatures`, skip the id and let the widget above report the level instead. If it reads fine, leave it. Either way write one sentence in the ledger saying which and why; do not leave it undecided.

- [ ] **Step 9: Check line endings and commit**

```bash
file apps/web/src/components/sheet/SpellcastingWidget.tsx apps/web/src/hooks/useCharacterStats.ts apps/web/src/components/sheet/DashboardLayout.tsx
git add apps/web/src
git commit -m "feat(web): the sheet shows a caster's DC and attack bonus

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Prove it, then update the docs

**Files:**
- Modify: `docs/TODO_BACKLOG.md`
- Modify: `docs/superpowers/specs/2026-09-20-spellcasting-slots-design.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the closing record.

- [ ] **Step 1: Run the whole repo**

```bash
pnpm check:hygiene
pnpm --filter @project/shared test
pnpm --filter @project/engine test
pnpm --filter @project/database test
pnpm --filter @project/server test
pnpm --filter @project/web test
pnpm typecheck
```

Expected: all green, total above the 1,961 baseline. If turbo reports an instant success, run that package's vitest directly.

- [ ] **Step 2: Import the pack**

The pack is the only route rules take to the database, so none of Tasks 4 and 5 is live until:

```bash
pnpm --filter @project/database db:import-pack
```

This truncates the reference tables `CASCADE` and reaches character data; `pnpm --filter @project/database db:seed:samples` restores the ten fixture characters. If the developer database holds anything hand-made, say so and let Lucas decide before running it.

- [ ] **Step 3: Look at a wizard**

Start the app, open a level 5 wizard and confirm: four first-level slots, three second, two third, each spendable; a save DC of 8 + proficiency + INT; a spell attack bonus. Then take a long rest and confirm the slots come back. This is the claim the branch makes and the tests do not make it for you.

- [ ] **Step 4: Update the backlog**

In `docs/TODO_BACKLOG.md`:

- Close the spellcasting half of **#62** (section 8f): slots, DC and attack now exist; ki and sorcery points do not and the entry stays open for them. Record that the pack's resource count went from 10 to 21 — nine slot pools, two pact pools.
- Update **#30** in both the Tier 2 row and section 4a: ten stubs authored, so 408 becomes 398. Re-run the per-class counts rather than subtracting by hand.
- Note under 4a that `SPELLCASTING_MOD` has a reader for the first time.

- [ ] **Step 5: Correct the spec**

In `docs/superpowers/specs/2026-09-20-spellcasting-slots-design.md`, set `Status: implemented` and fix the one thing the implementation did differently: §3 says `getResourceMaxUses` gains an optional fourth `casterLevel` parameter defaulting to zero. It does not — Task 3 replaced `totalLevel` and `classLevels` with a single required `LevelContext`, because a silent default would let any un-updated call site resolve every slot pool to zero. Rewrite that paragraph to describe what exists and why.

- [ ] **Step 6: Check line endings and commit**

```bash
file docs/TODO_BACKLOG.md docs/superpowers/specs/2026-09-20-spellcasting-slots-design.md
git add docs
git commit -m "docs: casters have slots, and the backlog says so

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verification checklist

- [ ] `pnpm typecheck` clean across all five packages.
- [ ] Test count at or above 1,961, with nothing skipped to get there.
- [ ] `git diff` on the pack files shows only the authored traits and the `spellcasting` blocks — no reindentation, no line-ending churn.
- [ ] `file` reports the original line ending for every file the branch touched.
- [ ] `segment.schema.json` regenerated, and `packSchemas.test.ts` green against the newly authored data.
- [ ] A level 5 wizard on the running sheet shows 4/3/2 slots, a save DC and an attack bonus, and a long rest refills them.
- [ ] The `pact_slot_level` question from Task 5 step 5 is decided in the ledger, either way.
