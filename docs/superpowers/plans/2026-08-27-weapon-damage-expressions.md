# Weapon Damage Expressions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the pack author weapons that deal flat damage (blowgun, unarmed strike) or no damage at all (net), teach the engine to roll them, give unenforceable weapon rules a channel to the player, and register `equipment/weapons.json` in the core_2014 manifest.

**Architecture:** `damageDice`/`damageType` become optional on `WeaponCapabilitySchema` behind a new `DamageExpressionSchema` primitive that accepts dice or a bare integer; absent means the weapon deals no damage. `DiceEngine.parse` grows a flat-integer branch returning `count: 0`, and the four call sites that assume `count > 0` get guards. A new `specialNote` rides from the weapon block to `ActionResult.notes` for rules this engine cannot enforce.

**Tech Stack:** TypeScript, Zod v4, Vitest, pnpm workspaces, turbo.

**Spec:** `docs/superpowers/specs/2026-08-27-weapon-damage-expressions-design.md`

## Global Constraints

- **Line endings.** Every file this plan touches is CRLF. The Write and Edit tools emit LF and `git diff` will show *nothing* when a CRLF file is silently converted. After editing any file, verify with `node -e "const r=require('fs').readFileSync('<path>','latin1');const nl=r.split('\n').length-1,c=(r.match(/\r\n/g)||[]).length;console.log('CRLF',c,'bareLF',nl-c)"` and confirm `bareLF 0`. The one exception is `packages/database/data/schemas/*.schema.json`, pinned to LF by `.gitattributes` and written only by `schemas:generate` — never hand-edit those.
- **Regenerate after every Zod change that touches pack shape.** Run `pnpm --filter @project/database schemas:generate`. `packSchemas.test.ts` byte-compares regeneration and fails if you skip it.
- **`z.toJSONSchema` silently drops `.refine()`.** It does not throw and emits no `anyOf`/`dependentRequired` substitute. `.regex()` *does* survive as `pattern`. Therefore **every cross-field invariant in this plan needs a Zod-level unit test**; the ajv pass in `packSchemas.test.ts` cannot see them and must never be treated as covering them.
- **Layering.** `packages/shared/src/schemas/primitives/` may import nothing but `zod`. `content/` may import `primitives/`. Never the reverse.
- **Typecheck command.** Use `pnpm --filter @project/<pkg> typecheck`. Do **not** run `tsc -b` in `packages/database` — it emits `.js`/`.d.ts` next to sources and trips `pnpm check:hygiene`.
- **Existing green baseline.** All package suites pass before this work starts. No task may leave a suite red at its commit.

---

### Task 1: `DamageExpressionSchema` primitive

**Files:**
- Create: `packages/shared/src/schemas/primitives/damageExpression.ts`
- Modify: `packages/shared/src/index.ts` (add barrel export, alphabetical among the `primitives/` lines)
- Test: `packages/shared/src/schemas/__tests__/primitives.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `DamageExpressionSchema` (a `ZodString` with `.regex()`), type `DamageExpression = string`. Tasks 5 and 6 apply it to `WeaponCapabilitySchema` fields.

The grammar is deliberately stricter than `DiceEngine.parse`, which strips whitespace and accepts `"2d6 + 3"`. Every one of the 115 authored equipment entries uses an unspaced expression — the distinct set is `1`, `1d4`, `1d6`, `1d8`, `1d10`, `1d12`, `2d6`, plus the `""` this work removes — so rejecting spaces costs nothing and keeps authored data normalized.

- [ ] **Step 1: Write the failing test**

Append to `packages/shared/src/schemas/__tests__/primitives.test.ts`:

```ts
describe("DamageExpressionSchema", () => {
  it("accepts dice, dice with a modifier, and a flat amount", () => {
    expect(DamageExpressionSchema.safeParse("1d8").success).toBe(true);
    expect(DamageExpressionSchema.safeParse("2d6+1").success).toBe(true);
    expect(DamageExpressionSchema.safeParse("2d6-1").success).toBe(true);
    // the blowgun and an unarmed strike deal exactly 1, with no die to roll
    expect(DamageExpressionSchema.safeParse("1").success).toBe(true);
  });

  it("rejects the empty string that stood in for no damage", () => {
    // the net carried damageDice: "" and damageType: "", which no layer caught
    expect(DamageExpressionSchema.safeParse("").success).toBe(false);
  });

  it("rejects malformed expressions", () => {
    expect(DamageExpressionSchema.safeParse("1d").success).toBe(false);
    expect(DamageExpressionSchema.safeParse("d6").success).toBe(false);
    expect(DamageExpressionSchema.safeParse("1d6x2").success).toBe(false);
  });

  it("rejects spaced expressions, which authored weapon data never uses", () => {
    // DiceEngine.parse tolerates "2d6 + 3" at roll time; authored data does not
    expect(DamageExpressionSchema.safeParse("2d6 + 3").success).toBe(false);
  });
});
```

Add the import to the top of that file, beside the existing `DamageTypeSchema` import:

```ts
import { DamageExpressionSchema } from "../primitives/damageExpression.js";
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @project/shared test src/schemas/__tests__/primitives.test.ts
```

Expected: FAIL — cannot resolve `../primitives/damageExpression.js`.

- [ ] **Step 3: Write the primitive**

Create `packages/shared/src/schemas/primitives/damageExpression.ts`:

```ts
import { z } from "zod";

/**
 * A weapon damage expression: dice, or a flat amount.
 *
 * `1d8`, `2d6+1` and a bare `1` are all damage someone meant to deal. A
 * blowgun and an unarmed strike deal exactly 1 with no die to roll, and a net
 * deals none at all - which is spelled by omitting the field, not by an empty
 * string. Before this, `damageDice` was a bare `z.string()`, so `""` validated
 * happily and then threw inside DiceEngine.
 *
 * Stricter than `DiceEngine.parse`, which strips whitespace: authored data is
 * normalized, and every entry in the shipped pack is already unspaced.
 */
export const DamageExpressionSchema = z
  .string()
  .regex(
    /^(\d+d\d+([+-]\d+)?|\d+)$/,
    "must be dice (1d8, 2d6+1) or a flat amount (1)",
  );

export type DamageExpression = z.infer<typeof DamageExpressionSchema>;
```

- [ ] **Step 4: Export it from the package barrel**

In `packages/shared/src/index.ts`, add beside the other `primitives/` exports:

```ts
export * from "./schemas/primitives/damageExpression.js";
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @project/shared test src/schemas/__tests__/primitives.test.ts
```

Expected: PASS.

- [ ] **Step 6: Typecheck and commit**

```bash
pnpm --filter @project/shared typecheck
```

```bash
git add packages/shared/src/schemas/primitives/damageExpression.ts packages/shared/src/index.ts packages/shared/src/schemas/__tests__/primitives.test.ts
git commit -m "feat(shared): add DamageExpressionSchema primitive for dice or flat damage"
```

---

### Task 2: `DiceEngine` flat expression support

**Files:**
- Modify: `packages/engine/src/utils/diceParser.ts:20-33` (`parse`)
- Test: `packages/engine/src/utils/__tests__/diceParser.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `DiceEngine.parse("1")` returns `{ count: 0, sides: 0, modifier: 1 }`. Tasks 3, 5 and 6 depend on `count === 0` being the signal for "flat, no dice". `rollDigital` and `rollMaximized` need no change — both loop `count` times and both already add `modifier` to the total, so they yield `{ total: 1, rolls: [], modifier: 1 }` for free.

- [ ] **Step 1: Write the failing test**

Append to `packages/engine/src/utils/__tests__/diceParser.test.ts`:

```ts
describe("DiceEngine flat damage expressions", () => {
  it("parses a bare integer as a modifier with no dice", () => {
    expect(DiceEngine.parse("1")).toEqual({
      count: 0,
      sides: 0,
      modifier: 1,
    });
  });

  it("rolls a flat expression to its own value with no dice rolled", () => {
    // a blowgun deals 1 piercing; there is nothing to randomize
    expect(DiceEngine.rollDigital("1")).toEqual({
      total: 1,
      rolls: [],
      modifier: 1,
    });
  });

  it("maximizes a flat expression to the same value", () => {
    // a crit doubles damage dice, and flat damage has none
    expect(DiceEngine.rollMaximized("1")).toEqual({
      total: 1,
      rolls: [],
      modifier: 1,
    });
  });

  it("still rejects the empty string", () => {
    expect(() => DiceEngine.parse("")).toThrow("Invalid dice expression");
  });

  it("still rejects malformed expressions", () => {
    expect(() => DiceEngine.parse("d6")).toThrow("Invalid dice expression");
    expect(() => DiceEngine.parse("1d")).toThrow("Invalid dice expression");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @project/engine test src/utils/__tests__/diceParser.test.ts
```

Expected: FAIL — `Invalid dice expression: 1` thrown by the first three tests.

- [ ] **Step 3: Add the flat branch to `parse`**

Replace the body of `parse` in `packages/engine/src/utils/diceParser.ts`:

```ts
  public static parse(expression: string): ParsedDiceExpression {
    const cleanExpr = expression.replace(/\s+/g, "").toLowerCase();

    // flat damage: a blowgun deals 1, an unarmed strike deals 1, and neither
    // rolls anything. Reported as zero dice carrying the whole amount in the
    // modifier, so every caller that loops `count` times rolls nothing and
    // every caller that adds `modifier` still gets the damage.
    const flatMatch = cleanExpr.match(/^(\d+)$/);
    if (flatMatch?.[1]) {
      return {
        count: 0,
        sides: 0,
        modifier: Number.parseInt(flatMatch[1], 10),
      };
    }

    const match = cleanExpr.match(/^(\d+)d(\d+)([+-]\d+)?$/);

    if (!match || !match[1] || !match[2]) {
      throw new Error(`Invalid dice expression: ${expression}`);
    }

    return {
      count: Number.parseInt(match[1], 10),
      sides: Number.parseInt(match[2], 10),
      modifier: match[3] ? Number.parseInt(match[3], 10) : 0,
    };
  }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @project/engine test src/utils/__tests__/diceParser.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the whole engine suite for regressions**

```bash
pnpm --filter @project/engine test
```

Expected: PASS. Nothing authored today is a bare integer, so no existing behavior changes.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/utils/diceParser.ts packages/engine/src/utils/__tests__/diceParser.test.ts
git commit -m "feat(engine): parse flat damage expressions as zero dice plus a modifier"
```

---

### Task 3: Guard the three `count > 0` assumptions in `combat.ts`

**Files:**
- Modify: `packages/engine/src/calculators/combat.ts:272-279` (`doubleSegment`)
- Modify: `packages/engine/src/calculators/combat.ts:320-330` (`add_base_die` branch of `applyCriticalHitModifier`)
- Modify: `packages/engine/src/calculators/combat.ts:365-402` (`formatDamageExpression`)
- Test: `packages/engine/src/calculators/__tests__/criticalDamage.test.ts`

**Interfaces:**
- Consumes: `DiceEngine.parse` returning `count: 0` for flat expressions (Task 2).
- Produces: a damage pool containing a flat segment survives crit doubling, `add_base_die`, and rendering. Task 5 relies on this when a flat weapon reaches `CombatEngine`.

All three sites rebuild an expression from `count` and `sides` and discard `modifier`, so a flat segment becomes `0d0` or `1d0` and the damage is lost. These guards are additive — with no flat data authored yet, every existing test must still pass.

- [ ] **Step 1: Write the failing test**

Append to `packages/engine/src/calculators/__tests__/criticalDamage.test.ts`:

```ts
describe("flat damage segments survive the critical-hit maths", () => {
  it("does not double a flat segment on a critical hit", () => {
    // 5e doubles damage *dice*; a blowgun has none, so a crit is still 1
    const doubled = CombatEngine["doubleSegment"]({
      sourceName: "Blowgun",
      baseDice: "1",
      damageType: "piercing",
      scalingMode: "none",
      levelScaling: [],
    });

    expect(doubled.baseDice).toBe("1");
  });

  it("renders a flat segment as a bonus term rather than 1d0", () => {
    const expression = CombatEngine["formatDamageExpression"](
      [
        {
          sourceName: "Blowgun",
          baseDice: "1",
          damageType: "piercing",
          scalingMode: "none",
          levelScaling: [],
        },
      ],
      3,
    );

    expect(expression).toBe("+4 piercing");
  });

  it("still renders an ordinary dice pool unchanged", () => {
    const expression = CombatEngine["formatDamageExpression"](
      [
        {
          sourceName: "Greatsword",
          baseDice: "2d6",
          damageType: "slashing",
          scalingMode: "none",
          levelScaling: [],
        },
      ],
      4,
    );

    expect(expression).toBe("2d6 +4 slashing");
  });
});
```

Confirm the file's existing imports already bring in `CombatEngine`; if not, add `import { CombatEngine } from "../combat.js";`.

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @project/engine test src/calculators/__tests__/criticalDamage.test.ts
```

Expected: FAIL — `doubleSegment` returns `"0d0"`, and `formatDamageExpression` returns `"0d0 +3 piercing"`.

- [ ] **Step 3: Guard `doubleSegment`**

```ts
  private static doubleSegment(segment: DamageSegment): DamageSegment {
    try {
      const { count, sides } = DiceEngine.parse(segment.baseDice);
      // a flat segment has no dice to double, and rebuilding it from count and
      // sides would discard the modifier that carries its whole damage
      if (count === 0) return segment;
      return { ...segment, baseDice: `${count * 2}d${sides}` };
    } catch {
      return segment;
    }
  }
```

- [ ] **Step 4: Guard the `add_base_die` branch**

Inside `applyCriticalHitModifier`, replace the `try` block:

```ts
      try {
        const { count, sides } = DiceEngine.parse(weaponSegment.baseDice);
        // nothing to grow on a flat segment: `1d0` would be worse than leaving
        // the pool alone
        if (count === 0) return segments;
        return [
          { ...weaponSegment, baseDice: `${count + extraDice}d${sides}` },
          ...segments.slice(1),
        ];
      } catch {
        return segments;
      }
```

- [ ] **Step 5: Teach `formatDamageExpression` about flat segments**

Replace the body of `formatDamageExpression` from `const groups` down to the `return rendered.join(" + ");`:

```ts
    const groups = new Map<string, Map<number, number>>();
    const flatByType = new Map<string, number>();

    for (const segment of segments) {
      let diceBySides = groups.get(segment.damageType);
      if (!diceBySides) {
        diceBySides = new Map<number, number>();
        groups.set(segment.damageType, diceBySides);
      }

      try {
        const { count, sides, modifier } = DiceEngine.parse(segment.baseDice);
        if (count > 0) {
          diceBySides.set(sides, (diceBySides.get(sides) ?? 0) + count);
        }
        // a flat segment carries its whole damage in the modifier
        if (modifier !== 0) {
          flatByType.set(
            segment.damageType,
            (flatByType.get(segment.damageType) ?? 0) + modifier,
          );
        }
      } catch {
        // an unparseable segment contributes no dice rather than corrupting the
        // whole expression
      }
    }

    const rendered = [...groups.entries()]
      // a group with neither dice nor flat damage came from an unparseable
      // segment and has nothing to say
      .filter(
        ([damageType, diceBySides]) =>
          diceBySides.size > 0 || (flatByType.get(damageType) ?? 0) !== 0,
      )
      .map(([damageType, diceBySides], index) => {
        const dice = [...diceBySides.entries()]
          .map(([sides, count]) => `${count}d${sides}`)
          .join(" + ");

        // only the weapon's group carries the flat bonus; a flat segment's own
        // damage joins it rather than pretending to be a die
        const bonusTotal = (index === 0 ? totalDamageBonus : 0) +
          (flatByType.get(damageType) ?? 0);
        const bonus =
          bonusTotal !== 0 ? ` ${bonusTotal > 0 ? "+" : ""}${bonusTotal}` : "";

        return `${dice}${bonus} ${damageType}`.trim();
      });

    return rendered.join(" + ");
```

Note the filter now runs *before* `.map`, so `index === 0` means the first rendered group. With all-parseable segments no group is ever dropped, so this is identical to today's behavior for existing data.

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm --filter @project/engine test src/calculators/__tests__/criticalDamage.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run the whole engine suite for regressions**

```bash
pnpm --filter @project/engine test
```

Expected: PASS — particularly `combat.test.ts`, which asserts rendered damage expressions.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/calculators/combat.ts packages/engine/src/calculators/__tests__/criticalDamage.test.ts
git commit -m "fix(engine): stop flat damage segments becoming 0d0 in crit maths and rendering"
```

---

### Task 4: `specialNote` plumbing, weapon block to `ActionResult`

**Files:**
- Modify: `packages/shared/src/schemas/content/equipment.ts` (`WeaponCapabilitySchema`, add field after `ammoTag`)
- Modify: `packages/shared/src/schemas/content/actions.ts` (`AttackEffectSchema`, add field)
- Modify: `packages/engine/src/pipeline/weaponSynthesizer.ts:71-89`
- Modify: `packages/engine/src/pipeline/actionResolver.ts:48-61` (`ActionResult`), `:415` (attack-case return)
- Test: `packages/engine/src/pipeline/__tests__/weaponSynthesizer.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `WeaponCapability.specialNote?: string`, `AttackEffect.specialNote?: string`, `ActionResult.notes?: string[]`. Task 6 authors the two notes that use this and adds the refine that makes them mandatory.

This task is purely additive — no field becomes optional, nothing breaks. The refine that *requires* a note lands in Task 6, alongside the data that satisfies it; adding it here would make the pack unloadable the moment `weapons.json` is registered.

- [ ] **Step 1: Write the failing test**

Append to `packages/engine/src/pipeline/__tests__/weaponSynthesizer.test.ts`:

```ts
describe("WeaponSynthesizer carries unenforced weapon rules to the player", () => {
  it("puts a weapon's specialNote on the attack effect", () => {
    const net: WeaponView = {
      id: "item_weapon_net",
      name: "Net",
      category: "martial_ranged",
      damageDice: "1d4",
      damageType: "bludgeoning",
      properties: ["special", "thrown"],
      range: 5,
      longRange: 15,
      specialNote: "Target is restrained (Large or smaller).",
    };

    const action = WeaponSynthesizer.generateWeaponAction(net, "DEX");
    if (action.effect.type !== "attack") {
      throw new Error("Expected an attack effect");
    }

    expect(action.effect.specialNote).toBe(
      "Target is restrained (Large or smaller).",
    );
  });

  it("omits specialNote entirely when the weapon has none", () => {
    const club: WeaponView = {
      id: "item_weapon_club",
      name: "Club",
      category: "simple_melee",
      damageDice: "1d4",
      damageType: "bludgeoning",
      properties: ["light"],
      range: 5,
    };

    const action = WeaponSynthesizer.generateWeaponAction(club, "STR");
    if (action.effect.type !== "attack") {
      throw new Error("Expected an attack effect");
    }

    expect("specialNote" in action.effect).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @project/engine test src/pipeline/__tests__/weaponSynthesizer.test.ts
```

Expected: FAIL — `specialNote` is not a property of `WeaponView`, so this is a typecheck failure at the object literal.

- [ ] **Step 3: Add the field to both schemas**

In `packages/shared/src/schemas/content/equipment.ts`, inside `WeaponCapabilitySchema` after `ammoTag`:

```ts
    /**
     * A rule this engine cannot enforce, in words the table can act on.
     *
     * The net restrains its target and the lance is at disadvantage within
     * five feet; neither is representable here, because hostiles exist only as
     * a `targetLabel` string and `apply_effect` writes to the character's own
     * EffectManager. Reporting it is what this codebase already does with
     * surprise and with Disengage, Help and Ready.
     */
    specialNote: z.string().min(1).optional(),
```

In `packages/shared/src/schemas/content/actions.ts`, inside `AttackEffectSchema` after `criticalDamage`:

```ts
  /** Carried through from the weapon so the resolved action can report it. */
  specialNote: z.string().optional(),
```

- [ ] **Step 4: Carry it through the synthesizer**

In `packages/engine/src/pipeline/weaponSynthesizer.ts`, inside the returned `effect` object, after `criticalDamageMaximized`:

```ts
        ...(weapon.specialNote === undefined
          ? {}
          : { specialNote: weapon.specialNote }),
```

- [ ] **Step 5: Add `notes` to `ActionResult` and populate it**

In `packages/engine/src/pipeline/actionResolver.ts`, add to the `ActionResult` interface:

```ts
  /**
   * Rules the engine could not enforce, for the sheet to show the player.
   *
   * On the result rather than on an ActionRollResult because the note belongs
   * to the action: a net has no damage roll to hang one on.
   */
  notes?: string[];
```

Then replace the attack case's return:

```ts
        return {
          ...ok,
          rollResults,
          ...(effect.specialNote === undefined
            ? {}
            : { notes: [effect.specialNote] }),
        };
```

- [ ] **Step 6: Regenerate the pack JSON schema**

`AttackEffectSchema` is reachable from `CoreRulePackSchema` through action grants on traits, so the generated segment schema changes.

```bash
pnpm --filter @project/database schemas:generate
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
pnpm --filter @project/engine test src/pipeline/__tests__/weaponSynthesizer.test.ts
```

Expected: PASS.

```bash
pnpm --filter @project/shared test && pnpm --filter @project/engine test && pnpm --filter @project/database test
```

Expected: PASS, including the regeneration byte-compare in `packSchemas.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/schemas/content/equipment.ts packages/shared/src/schemas/content/actions.ts packages/engine/src/pipeline/weaponSynthesizer.ts packages/engine/src/pipeline/actionResolver.ts packages/engine/src/pipeline/__tests__/weaponSynthesizer.test.ts packages/database/data/schemas/segment.schema.json
git commit -m "feat: carry a weapon's specialNote through to the resolved action"
```

---

### Task 5: Optional damage fields and their consumers

**Files:**
- Modify: `packages/shared/src/schemas/content/equipment.ts` (`WeaponCapabilitySchema`)
- Modify: `packages/engine/src/calculators/combat.ts:640-655`
- Modify: `packages/engine/src/pipeline/weaponSynthesizer.ts:39-42, 80-88`
- Modify: `packages/engine/src/pipeline/actionResolver.ts:390-402, 488-499`
- Test: `packages/shared/src/schemas/__tests__/equipment.test.ts`, `packages/engine/src/pipeline/__tests__/weaponSynthesizer.test.ts`

**Interfaces:**
- Consumes: `DamageExpressionSchema` (Task 1); `count === 0` flat parsing (Task 2); the `combat.ts` guards (Task 3).
- Produces: `WeaponCapability.damageDice?: DamageExpression`, `WeaponCapability.damageType?: DamageType`. A weapon with neither yields `damage: []` from `WeaponSynthesizer` and an empty `damageSegments` from `CombatEngine`.

Making these optional is the one breaking change in the plan: `combat.ts:650` currently writes `baseDice: finalDice ?? weapon.damageDice`, which becomes `string | undefined`. Both refines added here are Zod-only — **the ajv pass will not test them**, which is why Step 1 tests them directly.

- [ ] **Step 1: Write the failing schema tests**

Append to `packages/shared/src/schemas/__tests__/equipment.test.ts`:

```ts
describe("WeaponCapabilitySchema damage is optional but never half-authored", () => {
  // These refines are invisible to packSchemas.test.ts: z.toJSONSchema drops
  // .refine() silently, so Zod is the only layer that enforces them and this
  // is the only place they are covered.

  it("accepts a weapon with no damage at all", () => {
    const parsed = WeaponCapabilitySchema.parse({
      category: "martial_ranged",
      properties: ["special", "thrown"],
      range: 5,
      longRange: 15,
      specialNote: "Target is restrained (Large or smaller).",
    });

    expect(parsed.damageDice).toBeUndefined();
    expect(parsed.damageType).toBeUndefined();
  });

  it("accepts flat damage", () => {
    const parsed = WeaponCapabilitySchema.parse({
      category: "simple_ranged",
      damageDice: "1",
      damageType: "piercing",
      properties: ["ammunition", "loading"],
      range: 25,
      longRange: 100,
    });

    expect(parsed.damageDice).toBe("1");
  });

  it("rejects a damage die with no damage type", () => {
    const result = WeaponCapabilitySchema.safeParse({
      category: "simple_melee",
      damageDice: "1d4",
      properties: [],
      range: 5,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a damage type with no damage die", () => {
    const result = WeaponCapabilitySchema.safeParse({
      category: "simple_melee",
      damageType: "bludgeoning",
      properties: [],
      range: 5,
    });

    expect(result.success).toBe(false);
  });

  it("rejects the empty-string damage the net used to carry", () => {
    const result = WeaponCapabilitySchema.safeParse({
      category: "martial_ranged",
      damageDice: "",
      damageType: "",
      properties: ["special", "thrown"],
      range: 5,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a versatile die with no one-handed die to upgrade from", () => {
    const result = WeaponCapabilitySchema.safeParse({
      category: "martial_melee",
      versatileDamageDice: "1d10",
      properties: ["versatile"],
      range: 5,
    });

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Write the failing synthesizer test**

Append to `packages/engine/src/pipeline/__tests__/weaponSynthesizer.test.ts`:

```ts
describe("WeaponSynthesizer handles weapons that deal no damage", () => {
  it("emits an empty damage pool for a weapon with no damage dice", () => {
    const net: WeaponView = {
      id: "item_weapon_net",
      name: "Net",
      category: "martial_ranged",
      properties: ["special", "thrown"],
      range: 5,
      longRange: 15,
      specialNote: "Target is restrained (Large or smaller).",
    };

    const action = WeaponSynthesizer.generateWeaponAction(net, "DEX");
    if (action.effect.type !== "attack") {
      throw new Error("Expected an attack effect");
    }

    // it still attacks - a net rolls to hit, it just deals nothing
    expect(action.effect.attackType).toBe("ranged_weapon");
    expect(action.effect.damage).toEqual([]);
  });

  it("emits one flat segment for a weapon that deals a fixed amount", () => {
    const blowgun: WeaponView = {
      id: "item_weapon_blowgun",
      name: "Blowgun",
      category: "simple_ranged",
      damageDice: "1",
      damageType: "piercing",
      properties: ["ammunition", "loading"],
      range: 25,
      longRange: 100,
    };

    const action = WeaponSynthesizer.generateWeaponAction(blowgun, "DEX");
    if (action.effect.type !== "attack") {
      throw new Error("Expected an attack effect");
    }

    expect(action.effect.damage).toHaveLength(1);
    expect(action.effect.damage[0]?.baseDice).toBe("1");
    expect(action.effect.damage[0]?.damageType).toBe("piercing");
  });
});
```

- [ ] **Step 3: Run both tests to verify they fail**

```bash
pnpm --filter @project/shared test src/schemas/__tests__/equipment.test.ts
```

Expected: FAIL — the no-damage and flat cases throw (`damageDice` required, `""` accepted today), and the three rejection cases pass wrongly.

```bash
pnpm --filter @project/engine test src/pipeline/__tests__/weaponSynthesizer.test.ts
```

Expected: FAIL — `WeaponView` requires `damageDice`/`damageType`.

- [ ] **Step 4: Make the fields optional and add the two refines**

In `packages/shared/src/schemas/content/equipment.ts`, add the import:

```ts
import { DamageExpressionSchema } from "../primitives/damageExpression.js";
```

Change the three damage fields inside `WeaponCapabilitySchema`:

```ts
    // absent means the weapon deals no damage. A net rolls to hit and deals
    // nothing; it used to say so with `""`, which no layer could catch.
    damageDice: DamageExpressionSchema.optional(),
    versatileDamageDice: DamageExpressionSchema.optional(),
    damageType: DamageTypeSchema.optional(),
```

Then replace the closing `.strict()` with:

```ts
  .strict()
  // Both refines are Zod-only: z.toJSONSchema drops .refine() silently, so the
  // ajv pass in packSchemas.test.ts cannot see them. equipment.test.ts covers
  // them directly.
  .refine(
    (weapon) =>
      (weapon.damageDice === undefined) === (weapon.damageType === undefined),
    {
      message:
        "damageDice and damageType must be authored together, or both omitted for a weapon that deals no damage",
      path: ["damageType"],
    },
  )
  .refine(
    (weapon) =>
      weapon.versatileDamageDice === undefined ||
      weapon.damageDice !== undefined,
    {
      message: "versatileDamageDice requires a one-handed damageDice",
      path: ["versatileDamageDice"],
    },
  );
```

- [ ] **Step 5: Fix the `CombatEngine` damage pool**

In `packages/engine/src/calculators/combat.ts`, replace the `damageSegments` construction:

```ts
    // the weapon's own dice, and the only segment CombatEngine authors: riders
    // reach the roll as their own actions, and join the pool downstream. A
    // weapon with no authored damage - a net - contributes no segment at all,
    // which is what leaves its damage roll unrolled rather than zero.
    const damageSegments: DamageSegment[] =
      finalDice === undefined || weapon.damageType === undefined
        ? []
        : [
            {
              sourceName: weapon.name,
              baseDice: finalDice,
              damageType: weapon.damageType,
              scalingMode: "none",
              levelScaling: [],
            },
          ];
```

`finalDice` already falls back correctly: `isTwoHandedGrip && hasVersatile ? weapon.versatileDamageDice : weapon.damageDice`. The old `finalDice ?? weapon.damageDice` fallback goes away with it. `applyCriticalHitModifier(..., weapon.damageType)` needs no change — its `fallbackDamageType` parameter is already optional.

- [ ] **Step 6: Fix the synthesizer's damage pool**

In `packages/engine/src/pipeline/weaponSynthesizer.ts`, replace the `damage` array inside the returned effect:

```ts
        // a weapon with no authored damage still attacks; it just has nothing
        // to roll. The empty pool is what stops ActionResolver rolling one.
        damage:
          damageDice === undefined || weapon.damageType === undefined
            ? []
            : [
                {
                  sourceName: weapon.name,
                  baseDice: damageDice,
                  damageType: weapon.damageType,
                  scalingMode: "none",
                  levelScaling: [],
                },
              ],
```

- [ ] **Step 7: Collapse the double parse in `ActionResolver`**

In the attack case, replace the per-segment roll block:

```ts
        for (const [index, segment] of resolvedSegments.entries()) {
          const baseDice = segment.baseDice;
          const { sides } = DiceEngine.parse(baseDice);
          const roll =
            segment.maximized ||
            (isCriticalHit && effect.criticalDamageMaximized)
              ? DiceEngine.rollMaximized(baseDice)
              : DiceEngine.rollDigital(baseDice);
          const resolvedRoll = this.resolveTargetRoll(
            roll,
            "DAMAGE_ROLL",
            context,
            resolvedActiveStates,
            sides,
            segment.damageType,
          );
```

And the same in the `damage_rider` case:

```ts
        for (const segment of effect.damage) {
          const baseDice = segment.baseDice;
          const { sides } = DiceEngine.parse(baseDice);
          const roll = segment.maximized
            ? DiceEngine.rollMaximized(baseDice)
            : DiceEngine.rollDigital(baseDice);
          const resolvedRoll = this.resolveTargetRoll(
            roll,
            "DAMAGE_ROLL",
            context,
            activeStates.length > 0
              ? activeStates
              : (context.activeStates ?? []),
            sides,
            segment.damageType,
          );
```

- [ ] **Step 8: Regenerate the pack JSON schema**

```bash
pnpm --filter @project/database schemas:generate
```

Review the diff: `damageDice`, `versatileDamageDice` and `damageType` should leave the `required` list and `damageDice`/`versatileDamageDice` should gain a `pattern`. Neither refine will appear — that is expected and is why Step 1 exists.

- [ ] **Step 9: Run tests to verify they pass**

```bash
pnpm --filter @project/shared test && pnpm --filter @project/engine test && pnpm --filter @project/database test
```

Expected: PASS.

- [ ] **Step 10: Typecheck and commit**

```bash
pnpm --filter @project/shared typecheck && pnpm --filter @project/engine typecheck && pnpm --filter @project/database typecheck
```

```bash
git add packages/shared/src/schemas/content/equipment.ts packages/shared/src/schemas/__tests__/equipment.test.ts packages/engine/src/calculators/combat.ts packages/engine/src/pipeline/weaponSynthesizer.ts packages/engine/src/pipeline/actionResolver.ts packages/engine/src/pipeline/__tests__/weaponSynthesizer.test.ts packages/database/data/schemas/segment.schema.json
git commit -m "feat: let a weapon author no damage, and roll flat damage end to end"
```

---

### Task 6: Author the net and the lance, and require a note for `special`

**Files:**
- Modify: `packages/database/data/packs/core_2014_pack/equipment/weapons.json` (entries `item_weapon_net`, `item_weapon_lance`)
- Modify: `packages/shared/src/schemas/content/equipment.ts` (third refine)
- Modify: `apps/web/src/components/sheet/ItemWidget.tsx:5-11, 63-66`
- Test: `packages/shared/src/schemas/__tests__/equipment.test.ts`, `packages/engine/src/pipeline/__tests__/actionResolver.test.ts`

**Interfaces:**
- Consumes: optional damage fields and `specialNote` (Tasks 4 and 5).
- Produces: pack data that satisfies the `special ⇒ specialNote` refine, so Task 7 can register the segment.

The refine lands here rather than in Task 4 because the lance and the net both carry `special` and neither has a note until this task writes one. Adding it earlier would make the pack unloadable the instant Task 7 registers the file.

`weapons.json` is CRLF with 4-space indent and no trailing newline. Edit it with a Node script that rewrites the two entries and re-serializes, then re-verify endings.

- [ ] **Step 1: Write the failing refine test**

Append to `packages/shared/src/schemas/__tests__/equipment.test.ts`:

```ts
describe("a special weapon must say what is special about it", () => {
  // Zod-only, like the other two refines: invisible to the ajv pass.
  it("rejects the special property with no specialNote", () => {
    const result = WeaponCapabilitySchema.safeParse({
      category: "martial_melee",
      damageDice: "1d12",
      damageType: "piercing",
      properties: ["reach", "special"],
      range: 10,
    });

    expect(result.success).toBe(false);
  });

  it("accepts the special property when a note is authored", () => {
    const result = WeaponCapabilitySchema.safeParse({
      category: "martial_melee",
      damageDice: "1d12",
      damageType: "piercing",
      properties: ["reach", "special"],
      range: 10,
      specialNote:
        "Disadvantage on attacks against targets within 5 feet. Requires two hands to attack while not mounted.",
    });

    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Write the failing resolver test**

Append to `packages/engine/src/pipeline/__tests__/actionResolver.test.ts`, following that file's existing helpers for building an execution context:

```ts
describe("a weapon that deals no damage still resolves", () => {
  it("rolls to hit, rolls no damage, and reports its note", () => {
    const net: WeaponView = {
      id: "item_weapon_net",
      name: "Net",
      category: "martial_ranged",
      properties: ["special", "thrown"],
      range: 5,
      longRange: 15,
      specialNote: "Target is restrained (Large or smaller).",
    };

    const action = WeaponSynthesizer.generateWeaponAction(net, "DEX");
    const result = ActionResolver.execute(
      action,
      { actionId: action.id, activeStates: [] },
      makeContext(),
    );

    expect(result.executed).toBe(true);
    const attackRolls = (result.rollResults ?? []).filter(
      (roll) => roll.target === "ATTACK_ROLL",
    );
    const damageRolls = (result.rollResults ?? []).filter(
      (roll) => roll.target === "DAMAGE_ROLL",
    );

    expect(attackRolls).toHaveLength(1);
    expect(damageRolls).toEqual([]);
    expect(result.notes).toEqual(["Target is restrained (Large or smaller)."]);
  });
});
```

Reuse whatever the file already calls its context builder in place of `makeContext()`, and add imports for `WeaponSynthesizer` and `WeaponView` if absent.

- [ ] **Step 3: Run both tests to verify they fail**

```bash
pnpm --filter @project/shared test src/schemas/__tests__/equipment.test.ts
```

Expected: FAIL on the first case — a `special` weapon with no note is accepted today.

```bash
pnpm --filter @project/engine test src/pipeline/__tests__/actionResolver.test.ts
```

Expected: PASS already, given Tasks 4 and 5. If it fails, fix before continuing — it is the end-to-end check that the whole chain works.

- [ ] **Step 4: Add the third refine**

Chain onto `WeaponCapabilitySchema` after the two refines from Task 5:

```ts
  .refine(
    (weapon) =>
      !weapon.properties.includes("special") ||
      weapon.specialNote !== undefined,
    {
      message:
        "a weapon with the special property must carry a specialNote saying what is special about it",
      path: ["specialNote"],
    },
  );
```

- [ ] **Step 5: Rewrite the two pack entries**

Run this from the repo root. It preserves CRLF, 4-space indent, no trailing newline, and the schema key order established for this file:

```bash
node -e "
const fs=require('fs');
const p='packages/database/data/packs/core_2014_pack/equipment/weapons.json';
const raw=fs.readFileSync(p,'utf8');
const d=JSON.parse(raw);
const find=(id)=>d.equipment.find(e=>e.id===id);

const net=find('item_weapon_net');
delete net.weapon.damageDice;
delete net.weapon.damageType;
net.weapon.specialNote='On a hit, a Large or smaller target is restrained until freed. A creature can use its action to make a DC 10 Strength check, freeing itself or another creature within its reach on a success. Dealing 5 slashing damage to the net (AC 10) also frees the target. No effect on formless creatures or those Huge or larger.';

const lance=find('item_weapon_lance');
lance.weapon.specialNote='Disadvantage on attacks against targets within 5 feet. Requires two hands to attack while not mounted.';

let text=JSON.stringify(d,null,4).replace(/\n/g,'\r\n');
if(raw.endsWith('\r\n')) text+='\r\n';
fs.writeFileSync(p,text,'utf8');
console.log('net.weapon:',JSON.stringify(net.weapon));
console.log('lance.weapon:',JSON.stringify(lance.weapon));
"
```

- [ ] **Step 6: Verify the file's line endings survived**

```bash
node -e "const r=require('fs').readFileSync('packages/database/data/packs/core_2014_pack/equipment/weapons.json','latin1');const nl=r.split('\n').length-1,c=(r.match(/\r\n/g)||[]).length;console.log('CRLF',c,'bareLF',nl-c);"
```

Expected: `bareLF 0`.

- [ ] **Step 7: Stop the web sheet rendering an empty damage cell**

In `apps/web/src/components/sheet/ItemWidget.tsx`, make the local interface match the schema:

```ts
interface WeaponData {
  category: string;
  damageDice?: string;
  damageType?: string;
  properties: string[];
  ammoItemId?: string;
  specialNote?: string;
}
```

Replace the damage cell so a net does not render a blank:

```tsx
      <div>
        <span className="text-gray-500 block text-xs">Damage</span>{" "}
        {weapon.damageDice
          ? `${weapon.damageDice} ${weapon.damageType ?? ""}`.trim()
          : "—"}
      </div>
```

And add the note below the properties block, inside the same wrapper:

```tsx
    {weapon.specialNote && (
      <div className="mt-2">
        <span className="text-gray-500 text-xs block mb-1">Special</span>
        <p className="text-gray-300 text-xs">{weapon.specialNote}</p>
      </div>
    )}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
pnpm --filter @project/shared test && pnpm --filter @project/engine test
```

Expected: PASS.

- [ ] **Step 9: Regenerate, typecheck and commit**

The third refine changes no generated output, but run generation to confirm the byte-compare still holds:

```bash
pnpm --filter @project/database schemas:generate && pnpm --filter @project/database test
```

```bash
pnpm --filter @project/web typecheck
```

```bash
git add packages/shared/src/schemas/content/equipment.ts packages/shared/src/schemas/__tests__/equipment.test.ts packages/database/data/packs/core_2014_pack/equipment/weapons.json packages/engine/src/pipeline/__tests__/actionResolver.test.ts apps/web/src/components/sheet/ItemWidget.tsx
git commit -m "feat(pack): author the net's and lance's special rules, and require them"
```

---

### Task 7: Register `weapons.json` and close the weapon gap ledger

**Files:**
- Modify: `packages/database/data/packs/core_2014_pack/manifest.json` (`segments` array)
- Modify: `packages/database/src/__tests__/equipmentGaps.test.ts:70-81`
- Test: the full workspace suite

**Interfaces:**
- Consumes: everything above. This is the task that first puts `weapons.json` under ajv validation and pack assembly.
- Produces: a core pack whose 37 migrated weapons actually load.

Registering earlier would have failed two ways: the net's `damageType: ""` fails the generated schema, and `equipmentGaps.test.ts` asserts exactly 23 weapons declare a `weapon` gap — a count the migration reduced to zero by filling 22 of them, and this work closed the last by giving the net a real (damage-free) weapon block.

- [ ] **Step 1: Register the segment**

`manifest.json` is CRLF with 4-space indent. Add `"equipment/weapons.json"` after `"equipment/legacy.json"`:

```bash
node -e "
const fs=require('fs');
const p='packages/database/data/packs/core_2014_pack/manifest.json';
const raw=fs.readFileSync(p,'utf8');
const m=JSON.parse(raw);
if(!m.segments.includes('equipment/weapons.json')){
  const at=m.segments.indexOf('equipment/legacy.json');
  m.segments.splice(at+1,0,'equipment/weapons.json');
}
let text=JSON.stringify(m,null,4).replace(/\n/g,'\r\n');
if(raw.endsWith('\r\n')) text+='\r\n';
fs.writeFileSync(p,text,'utf8');
console.log(m.segments.filter(s=>s.startsWith('equipment/')));
"
```

- [ ] **Step 2: Verify line endings and run the pack schema test**

```bash
node -e "const r=require('fs').readFileSync('packages/database/data/packs/core_2014_pack/manifest.json','latin1');const nl=r.split('\n').length-1,c=(r.match(/\r\n/g)||[]).length;console.log('CRLF',c,'bareLF',nl-c);"
```

Expected: `bareLF 0`.

```bash
pnpm --filter @project/database test src/__tests__/packSchemas.test.ts
```

Expected: PASS, now validating one more segment than before.

- [ ] **Step 3: Run the gap ledger test to watch it fail**

```bash
pnpm --filter @project/database test src/__tests__/equipmentGaps.test.ts
```

Expected: FAIL — `expect(withGap("weapon")).toHaveLength(23)` receives 0.

- [ ] **Step 4: Update the gap ledger expectation**

In `packages/database/src/__tests__/equipmentGaps.test.ts`, replace the second `it` block:

```ts
  it("no longer has the weapon gaps of #32, nor the armour gaps of #33", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);

    const withGap = (gap: EquipmentGap) =>
      pack.equipment.filter((item) => item.implementation?.gaps.includes(gap));

    // #32 is closed: the 23 weapons that rolled no attack were migrated into
    // equipment/weapons.json with real weapon blocks. The net was the last of
    // them - it deals no damage by rule, which the schema can now say out loud
    // instead of encoding as "", and its restrain rule reaches the table as a
    // specialNote because this engine has no target to apply it to.
    expect(withGap("weapon")).toEqual([]);
    // #33 is closed: the six AC-less, category-less armours were placeholders
    // shadowing the authored armour table, and went when it was wired in
    expect(withGap("armor_class")).toEqual([]);
    expect(withGap("armor_category")).toEqual([]);
  });
```

The `derivedGaps` helper needs no change: it derives a `weapon` gap from a missing `weapon` block, and the net has one.

- [ ] **Step 5: Run the database suite**

```bash
pnpm --filter @project/database test
```

Expected: PASS.

- [ ] **Step 6: Run the full workspace suite**

```bash
pnpm test:all
```

Expected: PASS, including `pnpm check:hygiene`, which gates mixed line endings and `.gitattributes` violations.

- [ ] **Step 7: Confirm the pack actually carries the weapons**

```bash
node -e "
const {execSync}=require('child_process');
execSync('pnpm --filter @project/database exec tsx -e \"import{assembleCoreRulePack}from\\\"./src/corePackAssembler.js\\\";const p=await assembleCoreRulePack(\\\"data/packs/core_2014_pack\\\");const w=p.equipment.filter(e=>e.type===\\\"weapon\\\");console.log(\\\"weapons:\\\",w.length);console.log(\\\"no-damage:\\\",w.filter(e=>e.weapon&&!e.weapon.damageDice).map(e=>e.id));console.log(\\\"flat:\\\",w.filter(e=>e.weapon&&e.weapon.damageDice===\\\"1\\\").map(e=>e.id));console.log(\\\"notes:\\\",w.filter(e=>e.weapon&&e.weapon.specialNote).map(e=>e.id));\"',{stdio:'inherit'});
"
```

Expected: the no-damage list is `['item_weapon_net']`, the flat list is `['item_weapon_unarmed_strike', 'item_weapon_blowgun']`, and the notes list is `['item_weapon_lance', 'item_weapon_net']`. If the inline `tsx` invocation is awkward in your shell, write the same script to a scratch file and run it with `pnpm --filter @project/database exec tsx <file>`.

- [ ] **Step 8: Commit**

```bash
git add packages/database/data/packs/core_2014_pack/manifest.json packages/database/src/__tests__/equipmentGaps.test.ts
git commit -m "feat(pack): register equipment/weapons.json and close the weapon gap ledger"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| §1 Authoring shape — `DamageExpressionSchema` | 1 |
| §1 Authoring shape — optional fields, `specialNote` | 4, 5 |
| §1 Authoring shape — three refines | 5 (two), 6 (the `special` one) |
| §2 Enforcement split across layers | 1, 5, 6 — every refine has a Zod-level test, stated in each task |
| §3 Dice layer — flat parse | 2 |
| §3 Dice layer — three `count > 0` guards | 3 |
| §4 No-damage attacks | 5 |
| §5 Surfacing the note | 4 |
| §5 Collapse the double parse | 5 |
| §6 Gap ledger | 7 |
| §6 Manifest, last | 7 |
| Data changes — net, lance | 6 |
| CRLF preservation | Global Constraints, and verify steps in 6 and 7 |

**Beyond the spec:** Task 5 also fixes `combat.ts:650`, and Task 6 fixes `apps/web/.../ItemWidget.tsx`. Neither was named in the spec. The first is a typecheck break the optional fields cause directly; the second would render a blank damage cell for the net. Both are consequences of the specified change rather than new scope.

**Placeholder scan:** none. Every code step carries the code. The two places that say "reuse the file's existing helper" (Task 6 Step 2's context builder, Task 3 Step 1's import) name exactly what to look for and what to write if it is absent.

**Type consistency:** `specialNote` is `string` on `WeaponCapability` (`.min(1)`) and on `AttackEffect` (plain optional, since it is copied not authored); `notes` is `string[]` on `ActionResult`. `DamageExpressionSchema` is applied only to `damageDice` and `versatileDamageDice`, never to `DamageSegment.baseDice`, which stays a bare `z.string()` so traits and spells keep their existing latitude.
