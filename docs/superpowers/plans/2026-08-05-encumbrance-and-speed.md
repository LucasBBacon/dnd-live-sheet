# Encumbrance and Speed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the character engine a real walking speed, total carried weight, and a carrying-capacity tier that reduces that speed — with the PHB variant encumbrance rules behind a campaign toggle.

**Architecture:** `buildLiveSheet` becomes an explicit two-stage pipeline. Stage one computes abilities, HP, AC, initiative and skills from `baseStates` (trait-granted plus effect-granted). Stage two totals inventory weight, derives an encumbrance tier from the *final* STR score, appends the tier as a state to produce `sheetStates`, and computes speed from that. Encumbrance produces a plain result object and a state string — it never synthesizes RuntimeModifiers, so nothing can loop back into the scores that produced it.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Zod schemas in `@project/shared`, Vitest, pnpm workspaces + Turborepo.

## Global Constraints

- **Import specifiers end in `.js`** even when the source file is `.ts`. Every intra-package import in this repo follows this; a bare specifier will not resolve.
- **Weight is authored in pounds, summed in hundredths.** `EQUIPMENT_DICTIONARY` keeps readable values (`65`, `0.05`). All accumulation happens in integer hundredths of a pound, converted back only at the boundary.
- **Encumbrance never emits RuntimeModifiers.** It returns a result object plus state strings. Do not add `SPEED` modifiers from encumbrance code.
- **Nothing computed in stage one may read `sheetStates`.** Stage one reads `baseStates`. This is the invariant the whole design rests on.
- **Default ruleset is standard 5e.** `useVariantEncumbrance` defaults to `false`. The speed tiers only exist when a campaign opts in; the `over_capacity` ceiling applies under both.
- **Comment style:** lowercase inline comments explaining *why*, matching the surrounding files. Do not add JSDoc to every member; match the density of the file being edited.
- **Do not modify `apps/web`.** The web layer's drifted calculator path (`useCharacterStats.ts`) is explicitly out of scope for this plan.
- **`main` is not green, and fixing it is not your job.** Before this plan started, `pnpm --filter @project/engine typecheck` reported **26 errors** and `@project/shared` had **11 failing tests**. The exact set is recorded in `.superpowers/sdd/2026-08-05-encumbrance-and-speed/baseline.md` — read it before interpreting any suite result. Your gate is **no regressions**: the tests your task adds must pass, and nothing that passed before may start failing. Do not "fix" a baseline failure you did not cause, and do not report BLOCKED because of one. The engine's 4 currently-failing `characterEngine.test.ts` tests come from an uncommitted stub and are resolved by Task 6.
- **Do not attach `trait_powerful_build` to any existing race.** Powerful Build is a Goliath trait and no Goliath race exists here. It is authored and unit-tested, awaiting content.

## File Structure

**Create:**
- `packages/engine/src/rules/creatureSize.ts` — the size ladder and its carrying-capacity multipliers.
- `packages/engine/src/pipeline/stateExtractor.ts` — collects persistent states from traits.
- `packages/engine/src/calculators/speed.ts` — `SpeedEngine`.
- `packages/engine/src/rules/__tests__/creatureSize.test.ts`
- `packages/engine/src/pipeline/__tests__/stateExtractor.test.ts`
- `packages/engine/src/calculators/__tests__/weight.test.ts`
- `packages/engine/src/calculators/__tests__/encumbrance.test.ts`
- `packages/engine/src/calculators/__tests__/speed.test.ts`

**Rewrite (files exist but are uncommitted stubs):**
- `packages/engine/src/calculators/weight.ts`
- `packages/engine/src/calculators/encumbrance.ts`

**Modify:**
- `packages/shared/src/schemas/traits.ts` — add optional `grantedStates`.
- `packages/engine/src/rules/raceDictionary.ts` — widen `size` to `CreatureSize`, export `DEFAULT_WALKING_SPEED`.
- `packages/engine/src/rules/traitDictionary.ts` — author `trait_powerful_build`.
- `packages/engine/src/pipeline/characterEngine.ts` — two-stage pipeline, inventory parameter, speed + encumbrance.
- `packages/engine/src/pipeline/index.ts`, `packages/engine/src/index.ts` — exports.
- `packages/engine/src/pipeline/__tests__/characterEngine.test.ts` — new signature + coverage.
- `packages/database/src/itemsExtraction.ts` — stop dropping item weight from the rule payload.
- `packages/database/src/__tests__/itemsExtraction.test.ts` — cover it.

---

### Task 1: Creature size and carrying-capacity multipliers

Carrying capacity scales with size, and Powerful Build reads the table one row down. Size is flat data on `RaceDefinition`, not a trait or a modifier, so the rule lives beside the other rules dictionaries.

**Files:**
- Create: `packages/engine/src/rules/creatureSize.ts`
- Create: `packages/engine/src/rules/__tests__/creatureSize.test.ts`
- Modify: `packages/engine/src/rules/raceDictionary.ts:21` (the `size` field) and the `RaceDefinition` interface block

**Interfaces:**
- Consumes: nothing.
- Produces: `type CreatureSize = "tiny" | "small" | "medium" | "large" | "huge" | "gargantuan"`; `SIZE_CAPACITY_MULTIPLIER: Record<CreatureSize, number>`; `oneSizeLarger(size: CreatureSize): CreatureSize`; `DEFAULT_WALKING_SPEED: number` (from `raceDictionary.ts`).

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/rules/__tests__/creatureSize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  SIZE_CAPACITY_MULTIPLIER,
  oneSizeLarger,
  type CreatureSize,
} from "../creatureSize.js";

describe("SIZE_CAPACITY_MULTIPLIER", () => {
  it("halves capacity for tiny creatures", () => {
    expect(SIZE_CAPACITY_MULTIPLIER.tiny).toBe(0.5);
  });

  it("treats small and medium identically", () => {
    // 5e only penalises Tiny: a halfling carries as much as a human
    expect(SIZE_CAPACITY_MULTIPLIER.small).toBe(1);
    expect(SIZE_CAPACITY_MULTIPLIER.medium).toBe(1);
  });

  it("doubles for each size above medium", () => {
    expect(SIZE_CAPACITY_MULTIPLIER.large).toBe(2);
    expect(SIZE_CAPACITY_MULTIPLIER.huge).toBe(4);
    expect(SIZE_CAPACITY_MULTIPLIER.gargantuan).toBe(8);
  });
});

describe("oneSizeLarger", () => {
  it("steps up one rung of the ladder", () => {
    expect(oneSizeLarger("medium")).toBe("large");
    expect(oneSizeLarger("tiny")).toBe("small");
  });

  it("stays put at the top rather than falling off", () => {
    expect(oneSizeLarger("gargantuan")).toBe("gargantuan");
  });

  it("covers every size in the union", () => {
    const sizes: CreatureSize[] = [
      "tiny",
      "small",
      "medium",
      "large",
      "huge",
      "gargantuan",
    ];

    for (const size of sizes) {
      expect(SIZE_CAPACITY_MULTIPLIER[size]).toBeGreaterThan(0);
      expect(sizes).toContain(oneSizeLarger(size));
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @project/engine exec vitest run src/rules/__tests__/creatureSize.test.ts
```

Expected: FAIL — `Failed to resolve import "../creatureSize.js"`.

- [ ] **Step 3: Write the implementation**

Create `packages/engine/src/rules/creatureSize.ts`:

```ts
/**
 * Creature size, and what it does to carrying capacity.
 *
 * Size has no trait representation - it is flat data on RaceDefinition - so
 * the rule lives here rather than being derived from a modifier or a state.
 * Nothing in RACE_DICTIONARY is larger than medium yet; the ladder is complete
 * anyway so Powerful Build has somewhere to step up to.
 */
export type CreatureSize =
  | "tiny"
  | "small"
  | "medium"
  | "large"
  | "huge"
  | "gargantuan";

/**
 * PHB: a Tiny creature carries half as much, and each size above Medium
 * doubles. Small and Medium are deliberately identical - only Tiny halves.
 */
export const SIZE_CAPACITY_MULTIPLIER: Record<CreatureSize, number> = {
  tiny: 0.5,
  small: 1,
  medium: 1,
  large: 2,
  huge: 4,
  gargantuan: 8,
};

const SIZE_LADDER: CreatureSize[] = [
  "tiny",
  "small",
  "medium",
  "large",
  "huge",
  "gargantuan",
];

/**
 * The next size up, or the same size when already at the top.
 *
 * Powerful Build does not make a creature larger, it makes it *count* as
 * larger for carrying capacity, which is why this returns a size to read the
 * table at rather than changing anything.
 */
export const oneSizeLarger = (size: CreatureSize): CreatureSize => {
  const index = SIZE_LADDER.indexOf(size);

  return SIZE_LADDER[Math.min(index + 1, SIZE_LADDER.length - 1)]!;
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @project/engine exec vitest run src/rules/__tests__/creatureSize.test.ts
```

Expected: PASS (9 assertions across 6 tests).

- [ ] **Step 5: Widen `RaceDefinition.size` and add the default speed constant**

In `packages/engine/src/rules/raceDictionary.ts`, add the import at the top of the file (after the existing header comment, before `export interface SubraceDefinition`):

```ts
import type { CreatureSize } from "./creatureSize.js";

/**
 * The walking speed a character falls back to when their race id resolves to
 * nothing - a save can outlive the pack that authored its race.
 */
export const DEFAULT_WALKING_SPEED = 30;
```

Then change the `size` field on the `RaceDefinition` interface (currently line 21):

```ts
  size: CreatureSize;
```

No authored race data changes: every entry is already `"small"` or `"medium"`, both of which are members of `CreatureSize`.

- [ ] **Step 6: Verify nothing broke**

```bash
pnpm --filter @project/engine exec vitest run
```

Expected: your 6 new `creatureSize` tests PASS, and the suite total is `4 failed | 359+ passed` — the same 4 `characterEngine.test.ts` failures as the baseline, no more. Widening a type alias cannot change runtime behaviour, so any *new* failure means something else went wrong.

```bash
pnpm --filter @project/engine typecheck 2>&1 | grep -c "error TS"
```

Expected: `26` or fewer. That is the baseline count from `baseline.md`, not a clean bill of health. If it rose, your change introduced an error — find it in the output and fix it.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/rules/creatureSize.ts packages/engine/src/rules/__tests__/creatureSize.test.ts packages/engine/src/rules/raceDictionary.ts
git commit -m "feat: add creature size ladder and carrying capacity multipliers"
```

---

### Task 2: Trait-granted persistent states

Traits can currently only speak through modifiers and proficiencies. A trait like Powerful Build changes a *rule* rather than a number, and has no way to reach a calculator. This adds an optional `grantedStates` to the trait schema and an extractor that collects them.

`grantedStates` must be `.optional()`, not `.default([])` — a defaulted field becomes required on the inferred output type, and every one of the ~150 object literals in `TRAIT_DICTIONARY` would stop compiling. `proficiencies` and `affinities` are `.optional()` for exactly this reason.

**Files:**
- Modify: `packages/shared/src/schemas/traits.ts:27` (after the `modifiers` block)
- Create: `packages/engine/src/pipeline/stateExtractor.ts`
- Create: `packages/engine/src/pipeline/__tests__/stateExtractor.test.ts`
- Modify: `packages/engine/src/rules/traitDictionary.ts` (add `trait_powerful_build`)
- Modify: `packages/engine/src/pipeline/index.ts`

**Interfaces:**
- Consumes: `TraitDefinition` from `@project/shared`.
- Produces: `TraitDefinition.grantedStates?: string[]`; `StateExtractor.extractStates(traits: TraitDefinition[]): string[]`; the trait id `trait_powerful_build` granting the state `"powerful_build"`.

- [ ] **Step 1: Add `grantedStates` to the trait schema**

In `packages/shared/src/schemas/traits.ts`, insert immediately after the `modifiers` block (which ends with `.default({ fixed: [], choices: [] }),`) and before `proficiencies`:

```ts
  /**
   * Persistent flags this trait puts on the character, e.g. "powerful_build".
   *
   * Distinct from ActiveEffect.grantedStates, which are temporary: these hold
   * for as long as the character has the trait, so they belong to the
   * blueprint rather than to the EffectManager.
   *
   * Optional rather than defaulted on purpose - a default would make the field
   * required on the inferred type and every authored trait literal would need
   * to declare it.
   */
  grantedStates: z.array(z.string()).optional(),
```

- [ ] **Step 2: Write the failing test**

Create `packages/engine/src/pipeline/__tests__/stateExtractor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { TraitDefinition } from "@project/shared";
import { StateExtractor } from "../stateExtractor.js";
import { TRAIT_DICTIONARY } from "../../rules/traitDictionary.js";

const trait = (
  id: string,
  grantedStates?: string[],
): TraitDefinition => ({
  id,
  name: id,
  description: "",
  modifiers: { fixed: [], choices: [] },
  ...(grantedStates && { grantedStates }),
  resources: [],
  triggers: [],
  diceRules: [],
  criticalHitModifiers: [],
  actions: [],
});

describe("StateExtractor.extractStates", () => {
  it("returns nothing for a character with no traits", () => {
    expect(StateExtractor.extractStates([])).toEqual([]);
  });

  it("ignores traits that grant no states", () => {
    expect(StateExtractor.extractStates([trait("plain")])).toEqual([]);
  });

  it("collects the states a trait grants", () => {
    const states = StateExtractor.extractStates([
      trait("bulky", ["powerful_build"]),
    ]);

    expect(states).toEqual(["powerful_build"]);
  });

  it("de-duplicates a state two traits both grant", () => {
    const states = StateExtractor.extractStates([
      trait("a", ["amphibious"]),
      trait("b", ["amphibious", "sunlight_sensitive"]),
    ]);

    expect(states).toHaveLength(2);
    expect(states).toContain("amphibious");
    expect(states).toContain("sunlight_sensitive");
  });

  it("reads the authored Powerful Build trait", () => {
    const powerfulBuild = TRAIT_DICTIONARY.trait_powerful_build;

    expect(powerfulBuild).toBeDefined();
    expect(StateExtractor.extractStates([powerfulBuild!])).toEqual([
      "powerful_build",
    ]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @project/engine exec vitest run src/pipeline/__tests__/stateExtractor.test.ts
```

Expected: FAIL — `Failed to resolve import "../stateExtractor.js"`.

- [ ] **Step 4: Write the extractor**

Create `packages/engine/src/pipeline/stateExtractor.ts`:

```ts
import type { TraitDefinition } from "@project/shared";

/**
 * Collects the persistent flags a character's traits carry.
 *
 * Traits could previously only speak through modifiers and proficiencies, so a
 * condition like Powerful Build - which changes a rule rather than a number -
 * had no way to reach the calculators. These states join the EffectManager's
 * temporary ones to form the baseline the stage-one calculators gate on.
 *
 * Deliberately pure and order-preserving, matching ModifierExtractor and
 * ProficiencyExtractor: same traits in, same states out, every time.
 */
export class StateExtractor {
  public static extractStates(traits: TraitDefinition[]): string[] {
    const states = new Set<string>();

    for (const trait of traits) {
      for (const state of trait.grantedStates ?? []) {
        states.add(state);
      }
    }

    return Array.from(states);
  }
}
```

- [ ] **Step 5: Author the Powerful Build trait**

In `packages/engine/src/rules/traitDictionary.ts`, add this entry to the `TRAIT_DICTIONARY` literal immediately after the `feat_alert` entry:

```ts
  trait_powerful_build: {
    id: "trait_powerful_build",
    name: "Powerful Build",
    description:
      "You count as one size larger when determining your carrying capacity and the weight you can push, drag, or lift.",
    modifiers: { fixed: [], choices: [] },
    // the whole trait is this flag: EncumbranceEngine reads the capacity table
    // one row down when it is set. no race grants it yet - it is here for the
    // goliath-shaped hole in RACE_DICTIONARY
    grantedStates: ["powerful_build"],
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
```

- [ ] **Step 6: Export the extractor**

In `packages/engine/src/pipeline/index.ts`, add alongside the other extractor exports:

```ts
export * from "./stateExtractor.js";
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
pnpm --filter @project/shared exec vitest run 2>&1 | tail -5
```

Expected: `2 failed | 5 passed` test files and `11 failed | 143 passed` tests — **exactly** the baseline in `baseline.md`, all in `character.test.ts` and `rules.test.ts`. Neither file touches `traits.ts`. A 12th failure, or a failure in any other file, is yours and must be fixed.

```bash
pnpm --filter @project/engine exec vitest run 2>&1 | tail -5
```

Expected: your 5 new `stateExtractor` tests PASS, and still only the same 4 baseline `characterEngine.test.ts` failures. This is the real check on the schema change: if `grantedStates` had been declared with `.default([])` instead of `.optional()`, the trait dictionary would no longer typecheck and this suite would collapse.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/schemas/traits.ts packages/engine/src/pipeline/stateExtractor.ts packages/engine/src/pipeline/__tests__/stateExtractor.test.ts packages/engine/src/rules/traitDictionary.ts packages/engine/src/pipeline/index.ts
git commit -m "feat: let traits grant persistent states, add Powerful Build"
```

---

### Task 3: Inventory weight totalling

Replaces the uncommitted stub. Two changes of substance beyond wiring: it resolves items through `resolveItemDefinition` so the rule-snapshot and homebrew path works the way it does for every other consumer, and it accumulates in integer hundredths so twenty arrows weigh exactly one pound.

**Files:**
- Rewrite: `packages/engine/src/calculators/weight.ts`
- Create: `packages/engine/src/calculators/__tests__/weight.test.ts`

**Interfaces:**
- Consumes: `resolveItemDefinition`, `RuleSnapshotLookup` from `../rules/ruleLookup.js`; `InventoryInstance` from `@project/shared`.
- Produces: `poundsToHundredths(pounds: number): number`; `hundredthsToPounds(hundredths: number): number`; `InventoryWeightCalculator.totalHundredths(items: InventoryInstance[], snapshot?: RuleSnapshotLookup): number`; `InventoryWeightCalculator.totalPounds(items, snapshot?): number`.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/calculators/__tests__/weight.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { InventoryInstance } from "@project/shared";
import {
  InventoryWeightCalculator,
  hundredthsToPounds,
  poundsToHundredths,
} from "../weight.js";

const row = (
  overrides: Partial<InventoryInstance> & Pick<InventoryInstance, "itemId">,
): InventoryInstance => ({
  id: `inv_${overrides.itemId}`,
  quantity: 1,
  slot: "backpack",
  isAttuned: false,
  ...overrides,
});

describe("pound and hundredth conversion", () => {
  it("round-trips a whole number of pounds", () => {
    expect(poundsToHundredths(65)).toBe(6500);
    expect(hundredthsToPounds(6500)).toBe(65);
  });

  it("rounds a fractional pound to the nearest hundredth", () => {
    expect(poundsToHundredths(0.05)).toBe(5);
  });
});

describe("InventoryWeightCalculator.totalHundredths", () => {
  it("weighs an empty pack as nothing", () => {
    expect(InventoryWeightCalculator.totalHundredths([])).toBe(0);
  });

  it("reads the authored weight of a single item", () => {
    // plate armour is 65 lb in EQUIPMENT_DICTIONARY
    expect(
      InventoryWeightCalculator.totalHundredths([row({ itemId: "item_armor_plate" })]),
    ).toBe(6500);
  });

  it("scales by the quantity in the stack", () => {
    expect(
      InventoryWeightCalculator.totalHundredths([
        row({ itemId: "item_armor_plate", quantity: 3 }),
      ]),
    ).toBe(19500);
  });

  it("counts worn items exactly like carried ones", () => {
    const worn = InventoryWeightCalculator.totalHundredths([
      row({ itemId: "item_armor_plate", slot: "body" }),
    ]);
    const carried = InventoryWeightCalculator.totalHundredths([
      row({ itemId: "item_armor_plate", slot: "backpack" }),
    ]);

    expect(worn).toBe(carried);
  });

  it("contributes nothing for an item with no rule behind it", () => {
    expect(
      InventoryWeightCalculator.totalHundredths([row({ itemId: "item_homebrew_gone" })]),
    ).toBe(0);
  });

  it("sums a mixed pack", () => {
    expect(
      InventoryWeightCalculator.totalHundredths([
        row({ itemId: "item_armor_plate" }), // 65
        row({ itemId: "item_weapon_dagger" }), // 1
        row({ itemId: "item_ammo_arrow", quantity: 20 }), // 0.05 x 20
      ]),
    ).toBe(6700);
  });
});

describe("InventoryWeightCalculator.totalPounds", () => {
  it("keeps the total exact when fractional weights accumulate across rows", () => {
    // twenty separate single-arrow rows, not one stack of twenty. this is the
    // shape that actually breaks under floats: repeated *addition* of 0.05
    // gives 1.0000000000000002, where a single 0.05 * 20 is exactly 1.
    const rows = Array.from({ length: 20 }, (_, index) =>
      row({ id: `inv_arrow_${index}`, itemId: "item_ammo_arrow" }),
    );

    // asserted in hundredths, because dividing by 100 on the way back to
    // pounds would launder the error away and let a float implementation pass
    const hundredths = InventoryWeightCalculator.totalHundredths(rows);

    expect(hundredths).toBe(100);
    expect(Number.isInteger(hundredths)).toBe(true);
    expect(InventoryWeightCalculator.totalPounds(rows)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @project/engine exec vitest run src/calculators/__tests__/weight.test.ts
```

Expected: FAIL — `poundsToHundredths` and `totalHundredths` do not exist (the stub only exports `calculateTotalWeight`).

- [ ] **Step 3: Rewrite the calculator**

Replace the entire contents of `packages/engine/src/calculators/weight.ts`:

```ts
import type { InventoryInstance } from "@project/shared";
import {
  resolveItemDefinition,
  type RuleSnapshotLookup,
} from "../rules/ruleLookup.js";

/**
 * Weight is authored in pounds because that is what a person reads in a
 * rulebook, and summed in hundredths of a pound because floats do not add up:
 * twenty single-arrow rows at 0.05 lb each accumulate to 1.0000000000000002.
 *
 * The items table stores hundredths in an integer column for the same reason,
 * so this is the same unit the database already thinks in.
 */
export const poundsToHundredths = (pounds: number): number =>
  Math.round(pounds * 100);

export const hundredthsToPounds = (hundredths: number): number =>
  hundredths / 100;

/**
 * Totals what a character is carrying.
 *
 * Pure by the same argument as InventoryExtractor: it takes the inventory as
 * an argument rather than reaching into a store, so the engine stays
 * independent of the app hosting it.
 */
export class InventoryWeightCalculator {
  /**
   * Everything the character is carrying, in hundredths of a pound.
   *
   * Slot is deliberately not consulted: worn armour and a wielded sword weigh
   * exactly what they would in the pack, and 5e counts both.
   *
   * An item with no rule behind it contributes nothing rather than throwing -
   * a save outlives the homebrew pack that authored it. InventoryExtractor
   * already owns reporting those ids, so they are not re-reported here.
   */
  public static totalHundredths(
    items: InventoryInstance[],
    snapshot?: RuleSnapshotLookup,
  ): number {
    let total = 0;

    for (const instance of items) {
      const definition = resolveItemDefinition(instance.itemId, snapshot);
      if (!definition) continue;

      total += poundsToHundredths(definition.weight) * instance.quantity;
    }

    return total;
  }

  /** The same total in pounds, for display and for the sheet snapshot. */
  public static totalPounds(
    items: InventoryInstance[],
    snapshot?: RuleSnapshotLookup,
  ): number {
    return hundredthsToPounds(this.totalHundredths(items, snapshot));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @project/engine exec vitest run src/calculators/__tests__/weight.test.ts
```

Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/calculators/weight.ts packages/engine/src/calculators/__tests__/weight.test.ts
git commit -m "feat: total inventory weight in integer hundredths of a pound"
```

---

### Task 4: Encumbrance tiers

Replaces the uncommitted stub. The stub conflated the two 5e rulesets, invented `size_large` and `powerful_build` states that nothing emitted, and synthesized `SPEED` modifiers. This version returns a plain result and a state string, takes size as a parameter rather than sniffing states for it, and puts the variant speed tiers behind a flag.

**Files:**
- Rewrite: `packages/engine/src/calculators/encumbrance.ts`
- Create: `packages/engine/src/calculators/__tests__/encumbrance.test.ts`

**Interfaces:**
- Consumes: `CreatureSize`, `SIZE_CAPACITY_MULTIPLIER`, `oneSizeLarger` from `../rules/creatureSize.js`; `hundredthsToPounds`, `poundsToHundredths` from `./weight.js`.
- Produces: `type EncumbranceTier = "none" | "encumbered" | "heavily_encumbered" | "over_capacity"`; `POWERFUL_BUILD_STATE: string`; `interface EncumbranceRules { useVariantEncumbrance: boolean }`; `DEFAULT_ENCUMBRANCE_RULES: EncumbranceRules`; `interface EncumbranceInput`; `interface EncumbranceResult`; `EncumbranceEngine.calculate(input: EncumbranceInput): EncumbranceResult`.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/calculators/__tests__/encumbrance.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EncumbranceEngine, type EncumbranceInput } from "../encumbrance.js";
import { poundsToHundredths } from "../weight.js";

/**
 * STR 15 is the fixture strength throughout: capacity 225 lb, with the variant
 * thresholds at 75 lb and 150 lb.
 */
const input = (overrides: Partial<EncumbranceInput> = {}): EncumbranceInput => ({
  totalHundredths: 0,
  strScore: 15,
  size: "medium",
  hasPowerfulBuild: false,
  ...overrides,
});

const carrying = (pounds: number) => ({ totalHundredths: poundsToHundredths(pounds) });

describe("EncumbranceEngine.calculate under the standard rule", () => {
  it("reports capacity as STR x 15", () => {
    expect(EncumbranceEngine.calculate(input()).maxCapacity).toBe(225);
  });

  it("stays unencumbered right up to capacity", () => {
    const result = EncumbranceEngine.calculate(input(carrying(225)));

    expect(result.tier).toBe("none");
    expect(result.states).toEqual([]);
  });

  it("ignores the variant speed tiers entirely", () => {
    // 160 lb is past both variant thresholds and means nothing here
    const result = EncumbranceEngine.calculate(input(carrying(160)));

    expect(result.tier).toBe("none");
    expect(result.encumberedThreshold).toBe(0);
    expect(result.heavilyEncumberedThreshold).toBe(0);
  });

  it("flags going over capacity", () => {
    const result = EncumbranceEngine.calculate(input(carrying(226)));

    expect(result.tier).toBe("over_capacity");
    expect(result.states).toEqual(["over_capacity"]);
  });

  it("reports the carried total back in pounds", () => {
    expect(EncumbranceEngine.calculate(input(carrying(12.5))).totalWeight).toBe(12.5);
  });
});

describe("EncumbranceEngine.calculate under the variant rule", () => {
  const variant = { rules: { useVariantEncumbrance: true } };

  it("publishes both speed thresholds", () => {
    const result = EncumbranceEngine.calculate(input(variant));

    expect(result.encumberedThreshold).toBe(75);
    expect(result.heavilyEncumberedThreshold).toBe(150);
  });

  it("stays clear at exactly the encumbered threshold", () => {
    // the rule is "more than", so 75 lb on the nose is still free movement
    const result = EncumbranceEngine.calculate(input({ ...variant, ...carrying(75) }));

    expect(result.tier).toBe("none");
  });

  it("becomes encumbered one pound past the threshold", () => {
    const result = EncumbranceEngine.calculate(input({ ...variant, ...carrying(76) }));

    expect(result.tier).toBe("encumbered");
    expect(result.states).toEqual(["encumbered"]);
  });

  it("stays merely encumbered at exactly the heavily encumbered threshold", () => {
    // the same "more than" rule as the lower threshold: 150 lb on the nose is
    // still only encumbered. without this, a >= regression on the second
    // comparison passes every other test in this file
    const result = EncumbranceEngine.calculate(input({ ...variant, ...carrying(150) }));

    expect(result.tier).toBe("encumbered");
  });

  it("becomes heavily encumbered past STR x 10", () => {
    const result = EncumbranceEngine.calculate(input({ ...variant, ...carrying(151) }));

    expect(result.tier).toBe("heavily_encumbered");
    expect(result.states).toEqual(["heavily_encumbered"]);
  });

  it("still tops out at over capacity", () => {
    const result = EncumbranceEngine.calculate(input({ ...variant, ...carrying(300) }));

    expect(result.tier).toBe("over_capacity");
  });
});

describe("EncumbranceEngine.calculate and creature size", () => {
  it("halves capacity for a tiny creature", () => {
    expect(EncumbranceEngine.calculate(input({ size: "tiny" })).maxCapacity).toBe(112.5);
  });

  it("gives a small creature the same capacity as a medium one", () => {
    expect(EncumbranceEngine.calculate(input({ size: "small" })).maxCapacity).toBe(225);
  });

  it("reads the table one size up with Powerful Build", () => {
    const result = EncumbranceEngine.calculate(input({ hasPowerfulBuild: true }));

    expect(result.maxCapacity).toBe(450);
  });

  it("scales the variant thresholds with Powerful Build too", () => {
    const result = EncumbranceEngine.calculate(
      input({
        hasPowerfulBuild: true,
        rules: { useVariantEncumbrance: true },
        ...carrying(140),
      }),
    );

    // 140 lb would be encumbered at medium, but the threshold is now 150
    expect(result.encumberedThreshold).toBe(150);
    expect(result.tier).toBe("none");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @project/engine exec vitest run src/calculators/__tests__/encumbrance.test.ts
```

Expected: FAIL — `EncumbranceEngine.calculate is not a function` (the stub only has `calculateVariantEncumbrance`).

- [ ] **Step 3: Rewrite the calculator**

Replace the entire contents of `packages/engine/src/calculators/encumbrance.ts`:

```ts
import {
  SIZE_CAPACITY_MULTIPLIER,
  oneSizeLarger,
  type CreatureSize,
} from "../rules/creatureSize.js";
import { hundredthsToPounds, poundsToHundredths } from "./weight.js";

export type EncumbranceTier =
  | "none"
  | "encumbered"
  | "heavily_encumbered"
  | "over_capacity";

/** Granted by trait_powerful_build; read here and nowhere else. */
export const POWERFUL_BUILD_STATE = "powerful_build";

export interface EncumbranceRules {
  /**
   * The PHB's optional variant. Off by default because the standard rule is
   * what a table plays unless it opts in: capacity is a hard ceiling and
   * nothing slows you down until you reach it.
   */
  useVariantEncumbrance: boolean;
}

export const DEFAULT_ENCUMBRANCE_RULES: EncumbranceRules = {
  useVariantEncumbrance: false,
};

export interface EncumbranceInput {
  /** From InventoryWeightCalculator.totalHundredths. */
  totalHundredths: number;
  /** The *final* score, after ASIs and any belt of giant strength. */
  strScore: number;
  size: CreatureSize;
  hasPowerfulBuild: boolean;
  rules?: EncumbranceRules;
}

export interface EncumbranceResult {
  /** Everything carried, in pounds, for display. */
  totalWeight: number;
  /** STR x 15 x size multiplier. The hard ceiling under both rulesets. */
  maxCapacity: number;
  /** STR x 5 x size multiplier. Zero when the variant rule is off. */
  encumberedThreshold: number;
  /** STR x 10 x size multiplier. Zero when the variant rule is off. */
  heavilyEncumberedThreshold: number;
  tier: EncumbranceTier;
  /**
   * The tier as a state string, so the speed calculator and later the roll
   * layer can gate on it the way they gate on any other condition. Empty at
   * "none". Deliberately not RuntimeModifiers: this result is derived from the
   * final STR score, and feeding modifiers back into the pool that produced
   * that score is a loop with no fixed point.
   */
  states: string[];
}

interface Thresholds {
  capacity: number;
  encumbered: number;
  heavilyEncumbered: number;
}

/**
 * Turns what a character is carrying into a carrying-capacity verdict.
 *
 * Takes size as an argument rather than sniffing it out of activeStates: size
 * is flat data on RaceDefinition and no state anywhere carries it, so reading
 * it from states would be reading something nothing writes.
 */
export class EncumbranceEngine {
  public static calculate({
    totalHundredths,
    strScore,
    size,
    hasPowerfulBuild,
    rules = DEFAULT_ENCUMBRANCE_RULES,
  }: EncumbranceInput): EncumbranceResult {
    // Powerful Build does not change the creature's size, only which row of
    // the capacity table it reads
    const effectiveSize = hasPowerfulBuild ? oneSizeLarger(size) : size;
    const multiplier = SIZE_CAPACITY_MULTIPLIER[effectiveSize];

    const thresholds: Thresholds = {
      capacity: strScore * 15 * multiplier,
      encumbered: strScore * 5 * multiplier,
      heavilyEncumbered: strScore * 10 * multiplier,
    };

    const tier = this.resolveTier(totalHundredths, thresholds, rules);

    return {
      totalWeight: hundredthsToPounds(totalHundredths),
      maxCapacity: thresholds.capacity,
      // reported as zero rather than as a number under the standard rule, so a
      // UI cannot draw a bar for a threshold that does nothing
      encumberedThreshold: rules.useVariantEncumbrance ? thresholds.encumbered : 0,
      heavilyEncumberedThreshold: rules.useVariantEncumbrance
        ? thresholds.heavilyEncumbered
        : 0,
      tier,
      states: tier === "none" ? [] : [tier],
    };
  }

  private static resolveTier(
    totalHundredths: number,
    thresholds: Thresholds,
    rules: EncumbranceRules,
  ): EncumbranceTier {
    // comparisons happen in hundredths so a fractional pound never rounds a
    // character across a boundary it has not actually crossed
    if (totalHundredths > poundsToHundredths(thresholds.capacity)) {
      return "over_capacity";
    }

    // the speed tiers are the variant rule's entire contribution, so a table
    // playing standard 5e never sees them
    if (!rules.useVariantEncumbrance) return "none";

    if (totalHundredths > poundsToHundredths(thresholds.heavilyEncumbered)) {
      return "heavily_encumbered";
    }

    if (totalHundredths > poundsToHundredths(thresholds.encumbered)) {
      return "encumbered";
    }

    return "none";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @project/engine exec vitest run src/calculators/__tests__/encumbrance.test.ts
```

Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/calculators/encumbrance.ts packages/engine/src/calculators/__tests__/encumbrance.test.ts
git commit -m "feat: derive encumbrance tiers with a standard/variant ruleset toggle"
```

---

### Task 5: Speed calculator

`SPEED` has been a valid `ModifierTarget` and elven Fleet of Foot has emitted `set_base 35` since the trait dictionary was written, with nothing anywhere consuming either. This is the consumer.

**Files:**
- Create: `packages/engine/src/calculators/speed.ts`
- Create: `packages/engine/src/calculators/__tests__/speed.test.ts`

**Interfaces:**
- Consumes: `EncumbranceTier` from `./encumbrance.js`; `CalculationResult`, `RuntimeModifier` from `@project/shared`.
- Produces: `OVER_CAPACITY_SPEED: number`; `SpeedEngine.calculateSpeed(baseSpeed: number, modifiers: RuntimeModifier[], activeStates?: string[], encumbranceTier?: EncumbranceTier): CalculationResult`.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/calculators/__tests__/speed.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { RuntimeModifier } from "@project/shared";
import { OVER_CAPACITY_SPEED, SpeedEngine } from "../speed.js";

const mod = (overrides: Partial<RuntimeModifier> = {}): RuntimeModifier => ({
  id: "mod_1",
  sourceName: "Test Source",
  sourceOrigin: "trait:test",
  target: "SPEED",
  type: "add",
  value: 0,
  scalingFactor: "none",
  requiredStates: [],
  forbiddenStates: [],
  isActive: true,
  ...overrides,
});

describe("SpeedEngine.calculateSpeed", () => {
  it("returns the racial walking speed when nothing else applies", () => {
    const result = SpeedEngine.calculateSpeed(30, []);

    expect(result.total).toBe(30);
    expect(result.breakdown[0]).toEqual({ name: "Base Speed", value: 30 });
  });

  it("ignores modifiers aimed at another stat", () => {
    const result = SpeedEngine.calculateSpeed(30, [
      mod({ target: "ARMOR_CLASS", value: 5 }),
    ]);

    expect(result.total).toBe(30);
  });

  it("skips a modifier switched off", () => {
    const result = SpeedEngine.calculateSpeed(30, [
      mod({ value: 10, isActive: false }),
    ]);

    expect(result.total).toBe(30);
  });

  it("adds a flat bonus", () => {
    const result = SpeedEngine.calculateSpeed(30, [
      mod({ sourceName: "Longstrider", value: 10 }),
    ]);

    expect(result.total).toBe(40);
  });

  it("takes a set_base override that beats the racial speed", () => {
    const result = SpeedEngine.calculateSpeed(30, [
      mod({ sourceName: "Fleet of Foot", type: "set_base", value: 35 }),
    ]);

    expect(result.total).toBe(35);
  });

  it("ignores a set_base override slower than the racial speed", () => {
    const result = SpeedEngine.calculateSpeed(30, [
      mod({ sourceName: "Slow Boots", type: "set_base", value: 25 }),
    ]);

    expect(result.total).toBe(30);
    expect(result.breakdown).toContainEqual({
      name: "Slow Boots",
      value: "Ignored (Does not stack)",
      isIgnored: true,
    });
  });

  it("keeps only the highest of competing overrides", () => {
    const result = SpeedEngine.calculateSpeed(30, [
      mod({ id: "a", sourceName: "Fleet of Foot", type: "set_base", value: 35 }),
      mod({ id: "b", sourceName: "Lesser Boots", type: "set_base", value: 32 }),
    ]);

    expect(result.total).toBe(35);
    expect(result.breakdown).toContainEqual({
      name: "Lesser Boots",
      value: "Ignored (Does not stack)",
      isIgnored: true,
    });
  });

  it("honours a modifier's required state", () => {
    const gated = mod({ value: 10, requiredStates: ["raging"] });

    expect(SpeedEngine.calculateSpeed(30, [gated]).total).toBe(30);
    expect(SpeedEngine.calculateSpeed(30, [gated], ["raging"]).total).toBe(40);
  });

  it("honours a modifier's forbidden state", () => {
    const gated = mod({ value: 10, forbiddenStates: ["wearing_heavy_armor"] });

    expect(
      SpeedEngine.calculateSpeed(30, [gated], ["wearing_heavy_armor"]).total,
    ).toBe(30);
    // the other direction matters just as much: a filter that dropped every
    // modifier *carrying* a forbidden state, rather than one whose forbidden
    // state is active, would pass the assertion above
    expect(SpeedEngine.calculateSpeed(30, [gated], []).total).toBe(40);
  });

  it("takes 10 feet off when encumbered", () => {
    const result = SpeedEngine.calculateSpeed(30, [], [], "encumbered");

    expect(result.total).toBe(20);
    expect(result.breakdown).toContainEqual({ name: "Encumbered", value: "-10" });
  });

  it("takes 20 feet off when heavily encumbered", () => {
    expect(
      SpeedEngine.calculateSpeed(30, [], [], "heavily_encumbered").total,
    ).toBe(10);
  });

  it("applies a bonus and an encumbrance penalty together", () => {
    const result = SpeedEngine.calculateSpeed(
      30,
      [mod({ sourceName: "Longstrider", value: 10 })],
      [],
      "encumbered",
    );

    // note this cannot prove the penalty lands *after* the bonus - addition
    // and subtraction commute. the multiplier test below is what pins the
    // ordering that actually matters
    expect(result.total).toBe(30); // 30 + 10 - 10
  });

  it("multiplies what you can actually manage, not what you could unloaded", () => {
    const result = SpeedEngine.calculateSpeed(
      30,
      [mod({ sourceName: "Dash", type: "multiplier", value: 2 })],
      [],
      "encumbered",
    );

    expect(result.total).toBe(40); // (30 - 10) x 2
  });

  it("overrides everything when over capacity", () => {
    const result = SpeedEngine.calculateSpeed(
      30,
      [mod({ sourceName: "Longstrider", value: 10 })],
      [],
      "over_capacity",
    );

    expect(result.total).toBe(OVER_CAPACITY_SPEED);
    expect(result.breakdown).toContainEqual({
      name: "Over Capacity",
      value: `Speed set to ${OVER_CAPACITY_SPEED}`,
    });
  });

  it("never goes below zero", () => {
    const result = SpeedEngine.calculateSpeed(
      25,
      [mod({ sourceName: "Web", value: -20 })],
      [],
      "heavily_encumbered",
    );

    expect(result.total).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @project/engine exec vitest run src/calculators/__tests__/speed.test.ts
```

Expected: FAIL — `Failed to resolve import "../speed.js"`.

- [ ] **Step 3: Write the calculator**

Create `packages/engine/src/calculators/speed.ts`:

```ts
import type { CalculationResult, RuntimeModifier } from "@project/shared";
import type { EncumbranceTier } from "./encumbrance.js";

/**
 * What speed drops to once a character is carrying more than they can.
 *
 * RAW simply says you cannot exceed your capacity and stops there, so this is
 * a table ruling written down rather than a rule from the book. It is a named
 * constant so it is obvious where to change it.
 */
export const OVER_CAPACITY_SPEED = 5;

/** over_capacity is an override rather than a penalty, so it subtracts nothing. */
const TIER_PENALTY: Record<EncumbranceTier, number> = {
  none: 0,
  encumbered: 10,
  heavily_encumbered: 20,
  over_capacity: 0,
};

const TIER_LABEL: Record<EncumbranceTier, string> = {
  none: "",
  encumbered: "Encumbered",
  heavily_encumbered: "Heavily Encumbered",
  over_capacity: "Over Capacity",
};

/**
 * Turns a racial walking speed, the modifiers acting on it, and how loaded
 * down the character is into a final speed with a breakdown.
 *
 * Order is load-bearing and matches how a table adjudicates it: establish the
 * base, take the best override, apply flat bonuses, subtract encumbrance, then
 * multiply. Dash doubles the speed you can actually manage while loaded, not
 * the speed you would have had with an empty pack.
 */
export class SpeedEngine {
  public static calculateSpeed(
    baseSpeed: number,
    modifiers: RuntimeModifier[],
    activeStates: string[] = [],
    encumbranceTier: EncumbranceTier = "none",
  ): CalculationResult {
    const breakdown: CalculationResult["breakdown"] = [];

    const validMods = modifiers.filter((m) => {
      if (m.target !== "SPEED" || !m.isActive) {
        return false;
      }
      if (m.forbiddenStates?.some((s) => activeStates.includes(s))) {
        return false;
      }
      return m.requiredStates
        ? m.requiredStates.every((s) => activeStates.includes(s))
        : true;
    });

    // 1 - base walking speed, or the best override on offer. mirrors
    // calculateAC: several ways to set a base do not stack, the highest wins
    let total = baseSpeed;
    breakdown.push({ name: "Base Speed", value: baseSpeed });

    const setters = validMods.filter((m) => m.type === "set_base");

    if (setters.length > 0) {
      const best = setters.reduce((prev, current) =>
        prev.value >= current.value ? prev : current,
      );

      // an override only helps if it beats the speed the race already grants,
      // so 30ft boots do nothing for a 35ft elf
      if (best.value > total) {
        total = best.value;
        breakdown.push({ name: best.sourceName, value: best.value });
      }

      for (const setter of setters) {
        const applied = setter.id === best.id && best.value > baseSpeed;

        if (!applied) {
          breakdown.push({
            name: setter.sourceName,
            value: "Ignored (Does not stack)",
            isIgnored: true,
          });
        }
      }
    }

    // 2 - flat bonuses and penalties
    for (const mod of validMods.filter((m) => m.type === "add")) {
      total += mod.value;
      const sign = mod.value >= 0 ? "+" : "";
      breakdown.push({ name: mod.sourceName, value: `${sign}${mod.value}` });
    }

    // 3 - encumbrance, before multipliers so Dash doubles the loaded speed
    const penalty = TIER_PENALTY[encumbranceTier];

    if (penalty > 0) {
      total -= penalty;
      breakdown.push({
        name: TIER_LABEL[encumbranceTier],
        value: `-${penalty}`,
      });
    }

    // 4 - multipliers (Dash, Haste)
    for (const mod of validMods.filter((m) => m.type === "multiplier")) {
      total *= mod.value;
      breakdown.push({ name: mod.sourceName, value: `x${mod.value}` });
    }

    // 5 - carrying more than you can ends the negotiation
    if (encumbranceTier === "over_capacity") {
      breakdown.push({
        name: TIER_LABEL.over_capacity,
        value: `Speed set to ${OVER_CAPACITY_SPEED}`,
      });

      return { total: OVER_CAPACITY_SPEED, breakdown };
    }

    return { total: Math.max(0, total), breakdown };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @project/engine exec vitest run src/calculators/__tests__/speed.test.ts
```

Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/calculators/speed.ts packages/engine/src/calculators/__tests__/speed.test.ts
git commit -m "feat: add speed calculator consuming SPEED modifiers and encumbrance"
```

---

### Task 6: Wire the two-stage pipeline into `buildLiveSheet`

The integration task. `buildLiveSheet` gains an inventory parameter and an options bag, starts applying inventory modifiers (it currently ignores them entirely — a plate-wearing character comes back with AC 10), and splits into two stages either side of the encumbrance calculation.

**Files:**
- Modify: `packages/engine/src/pipeline/characterEngine.ts` (whole file)
- Modify: `packages/engine/src/index.ts`
- Modify: `packages/engine/src/pipeline/__tests__/characterEngine.test.ts`

**Interfaces:**
- Consumes: everything produced by Tasks 1–5, plus the existing `InventoryExtractor.extractModifiers`.
- Produces: `interface LiveSheetOptions { snapshot?: RuleSnapshotLookup; encumbranceRules?: EncumbranceRules }`; `CharacterEngine.buildLiveSheet(save, inventory, effectManager, resourceManager, options?)`; `LiveCharacterSheet` gains `speed: CalculationResult`, `encumbrance: EncumbranceResult`, `baseStates: string[]`.

- [ ] **Step 1: Update the existing test harness for the new signature**

In `packages/engine/src/pipeline/__tests__/characterEngine.test.ts`, add these imports to the existing import block:

```ts
import type { InventoryInstance } from "@project/shared";
```

Change the `buildSheet` helper (currently at line 36) to:

```ts
const buildSheet = (
  save: CharacterSave,
  inventory: InventoryInstance[] = [],
  options: Parameters<typeof CharacterEngine.buildLiveSheet>[4] = {},
) =>
  CharacterEngine.buildLiveSheet(
    save,
    inventory,
    new EffectManager(),
    new ResourceManager(),
    options,
  );

const carried = (
  itemId: string,
  quantity = 1,
): InventoryInstance => ({
  id: `inv_${itemId}_${quantity}`,
  itemId,
  quantity,
  slot: "backpack",
  isAttuned: false,
});
```

Then update the one direct call inside the `"gates a state-conditional modifier on the live state"` test (around line 343) to pass `[]` as the second argument:

```ts
    const sheet = CharacterEngine.buildLiveSheet(
      halfElfFighter(),
      [],
      armoured,
      new ResourceManager(),
    );
```

- [ ] **Step 2: Write the failing tests**

Append this block to the end of `packages/engine/src/pipeline/__tests__/characterEngine.test.ts`:

```ts
/**
 * The half-elf fighter fixture has STR 15 and no strength modifiers, so
 * capacity is 225 lb, with variant thresholds at 75 lb and 150 lb. Plate
 * armour weighs 65 lb, which makes it a convenient unit of load.
 */
describe("CharacterEngine.buildLiveSheet: speed and encumbrance", () => {
  const variant = { encumbranceRules: { useVariantEncumbrance: true } };

  it("reports the racial walking speed", () => {
    // race_half_elf is 30ft
    expect(buildSheet(halfElfFighter()).speed.total).toBe(30);
  });

  it("weighs the pack and reports capacity", () => {
    const sheet = buildSheet(halfElfFighter(), [carried("item_armor_plate")]);

    expect(sheet.encumbrance.totalWeight).toBe(65);
    expect(sheet.encumbrance.maxCapacity).toBe(225);
  });

  it("leaves a heavy pack alone under the standard rule", () => {
    const sheet = buildSheet(halfElfFighter(), [carried("item_armor_plate", 3)]);

    expect(sheet.encumbrance.totalWeight).toBe(195);
    expect(sheet.encumbrance.tier).toBe("none");
    expect(sheet.speed.total).toBe(30);
  });

  it("slows a loaded character once the variant rule is on", () => {
    const sheet = buildSheet(
      halfElfFighter(),
      [carried("item_armor_plate", 2)], // 130 lb, past the 75 lb threshold
      variant,
    );

    expect(sheet.encumbrance.tier).toBe("encumbered");
    expect(sheet.speed.total).toBe(20);
  });

  it("slows it further past STR x 10", () => {
    const sheet = buildSheet(
      halfElfFighter(),
      [carried("item_armor_plate", 3)], // 195 lb, past the 150 lb threshold
      variant,
    );

    expect(sheet.encumbrance.tier).toBe("heavily_encumbered");
    expect(sheet.speed.total).toBe(10);
  });

  it("caps a character who is over capacity under either rule", () => {
    const sheet = buildSheet(halfElfFighter(), [carried("item_armor_plate", 4)]);

    expect(sheet.encumbrance.tier).toBe("over_capacity");
    expect(sheet.speed.total).toBe(5);
  });

  it("puts the derived tier in activeStates but not in baseStates", () => {
    const sheet = buildSheet(
      halfElfFighter(),
      [carried("item_armor_plate", 2)],
      variant,
    );

    expect(sheet.activeStates).toContain("encumbered");
    expect(sheet.baseStates).not.toContain("encumbered");
  });

  it("does not let encumbrance feed back into the ability scores", () => {
    const light = buildSheet(halfElfFighter(), [], variant);
    const loaded = buildSheet(
      halfElfFighter(),
      [carried("item_armor_plate", 3)],
      variant,
    );

    // the invariant the two-stage split exists to protect
    expect(loaded.abilities.STR.score).toBe(light.abilities.STR.score);
    expect(loaded.maxHp.total).toBe(light.maxHp.total);
  });
});

describe("CharacterEngine.buildLiveSheet: inventory modifiers", () => {
  it("applies the AC of worn armour", () => {
    const sheet = buildSheet(halfElfFighter(), [
      { ...carried("item_armor_plate"), slot: "body" },
    ]);

    // plate sets base AC 18 with no dex, beating the 12 of an unarmoured
    // half-elf with +2 DEX
    expect(sheet.armorClass.total).toBe(18);
  });

  it("leaves armour in the pack out of the maths", () => {
    const sheet = buildSheet(halfElfFighter(), [carried("item_armor_plate")]);

    expect(sheet.armorClass.total).toBe(12);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm --filter @project/engine exec vitest run src/pipeline/__tests__/characterEngine.test.ts
```

Expected: FAIL — `buildLiveSheet` takes 3 arguments, and `sheet.speed` / `sheet.encumbrance` / `sheet.baseStates` do not exist.

- [ ] **Step 4: Rewrite `characterEngine.ts`**

Replace the entire contents of `packages/engine/src/pipeline/characterEngine.ts`:

```ts
import type {
  ActionGrant,
  CalculationResult,
  CharacterSave,
  InventoryInstance,
} from "@project/shared";
import {
  AbilityEngine,
  type DerivedAbility,
} from "../calculators/abilities.js";
import { SKILL_MAP, type Ability } from "../types/core.js";
import { SkillEngine, type DerivedSkill } from "../calculators/skills.js";
import type { EffectManager } from "../calculators/effects.js";
import type { ResourceManager } from "../calculators/resources.js";
import { CharacterBootstrapper } from "./characterBootstraper.js";
import { ModifierExtractor } from "./modifierExtractor.js";
import { ProficiencyExtractor } from "./proficiencyExtractor.js";
import { StateExtractor } from "./stateExtractor.js";
import { InventoryExtractor } from "./inventoryExtractor.js";
import { DerivedStatEngine } from "../calculators/derivedStats.js";
import { SpeedEngine } from "../calculators/speed.js";
import { InventoryWeightCalculator } from "../calculators/weight.js";
import {
  DEFAULT_ENCUMBRANCE_RULES,
  EncumbranceEngine,
  POWERFUL_BUILD_STATE,
  type EncumbranceResult,
  type EncumbranceRules,
} from "../calculators/encumbrance.js";
import {
  DEFAULT_WALKING_SPEED,
  RACE_DICTIONARY,
} from "../rules/raceDictionary.js";
import type { RuleSnapshotLookup } from "../rules/ruleLookup.js";

export interface LiveSheetOptions {
  /** Homebrew and imported rules, when the host app has a snapshot loaded. */
  snapshot?: RuleSnapshotLookup;
  /** Campaign setting. Defaults to standard 5e, where nothing slows you down. */
  encumbranceRules?: EncumbranceRules;
}

export interface LiveCharacterSheet {
  // core stats
  abilities: Record<Ability, DerivedAbility>;
  proficiencyBonus: number;

  // derived combat stats
  maxHp: CalculationResult;
  currentHp: number;
  tempHp: number;
  armorClass: CalculationResult;
  initiative: CalculationResult;
  speed: CalculationResult;

  // skills and saves
  skills: Record<string, DerivedSkill>; // keyed by skillId

  // load
  encumbrance: EncumbranceResult;

  // executable actions (traits, spells, weapons)
  actions: ActionGrant[];

  // current environment
  /**
   * Trait- and effect-granted states: everything true about the character
   * before the load in their pack is known. This is what stage one gates on.
   */
  baseStates: string[];
  /**
   * baseStates plus whatever encumbrance derived. The full picture, and what
   * the UI and the roll layer should read.
   */
  activeStates: string[];
}

export class CharacterEngine {
  public static buildLiveSheet(
    save: CharacterSave,
    inventory: InventoryInstance[],
    effectManager: EffectManager,
    resourceManager: ResourceManager,
    options: LiveSheetOptions = {},
  ): LiveCharacterSheet {
    // region Aggregation and Extraction

    // 1- compile active traits from blueprints
    const activeTraits = CharacterBootstrapper.compileActiveTraits(save);

    // 2 - extract static math and proficiencies
    // both extractors read from the same flattened pick table: trait choice
    // blocks and class progression nodes share one namespace once the traits
    // have been compiled and no longer remember who granted them
    const selections = CharacterBootstrapper.resolveSelections(save);
    const staticModifiers = ModifierExtractor.extractModifiers(
      activeTraits,
      selections,
    );
    const proficiencies = ProficiencyExtractor.extractProficiencies(
      activeTraits,
      selections,
    );

    // 3 - merge static trait math with worn equipment and dynamic live math
    // (spells, conditions)
    const baseStates = Array.from(
      new Set([
        ...StateExtractor.extractStates(activeTraits),
        ...effectManager.getActiveStates(),
      ]),
    );
    const inventoryModifiers = InventoryExtractor.extractModifiers(
      inventory,
      options.snapshot,
    );
    const liveModifiers = effectManager.getActiveModifiers();
    const allModifiers = [
      ...staticModifiers,
      ...inventoryModifiers,
      ...liveModifiers,
    ];

    // endregion

    // region Calculations (stage one)
    //
    // Everything below reads baseStates. Nothing here may read the states
    // encumbrance derives further down - see the note on that region.

    // 1 - base level & proficiency
    const totalLevel = save.classes.reduce((sum, cls) => sum + cls.level, 0);
    const profBonus = AbilityEngine.getProficiencyBonus(totalLevel);

    // 2 - ability scores
    const abilities = {} as Record<Ability, DerivedAbility>;
    const abilityKeys: Ability[] = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

    for (const key of abilityKeys) {
      abilities[key] = AbilityEngine.calculateScore(
        save.attributes[key.toLowerCase() as keyof typeof save.attributes],
        key,
        allModifiers,
        baseStates,
      );
    }

    // 3 - derived stats
    const levelProfile = {
      total: totalLevel,
      classes: save.classes.reduce(
        (acc, cls) => {
          acc[cls.classId] = cls.level;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };

    const maxHp = DerivedStatEngine.calculateMaxHp(
      // the UI/Bootstrapper calculates the flat base rolled HP during level up
      save.hp.baseRolledHp,
      abilities.CON.modifier,
      levelProfile,
      allModifiers,
      baseStates,
    );

    const armorClass = DerivedStatEngine.calculateAC(
      abilities.DEX.modifier,
      allModifiers,
      baseStates,
    );

    const initiative = DerivedStatEngine.calculateInitiative(
      abilities.DEX.modifier,
      profBonus,
      proficiencies,
      allModifiers,
      baseStates,
    );

    // 4  - skills

    const skills = {} as Record<string, DerivedSkill>;
    const skillList = Object.keys(SKILL_MAP);

    for (const skillId of skillList) {
      const governingStat = SKILL_MAP[skillId]?.ability as Ability;
      skills[skillId] = SkillEngine.calculateSkill(
        skillId,
        abilities[governingStat].score,
        profBonus,
        proficiencies,
        allModifiers,
        baseStates,
      );
    }

    // endregion

    // region Load (stage two)
    //
    // The pipeline's one two-phase dependency. Encumbrance needs the *final*
    // STR score, so it cannot run until stage one is done - and its own output
    // must never flow back into stage one, or a belt of giant strength would
    // change the capacity that changed the state that changed the score.
    //
    // The invariant, stated once because everything here rests on it: nothing
    // above this line may read sheetStates.

    const race = RACE_DICTIONARY[save.race.baseRaceId];

    const encumbrance = EncumbranceEngine.calculate({
      totalHundredths: InventoryWeightCalculator.totalHundredths(
        inventory,
        options.snapshot,
      ),
      strScore: abilities.STR.score,
      // a save can name a race the loaded rulebook no longer has; medium is the
      // assumption that changes the least
      size: race?.size ?? "medium",
      hasPowerfulBuild: baseStates.includes(POWERFUL_BUILD_STATE),
      rules: options.encumbranceRules ?? DEFAULT_ENCUMBRANCE_RULES,
    });

    const sheetStates = [...baseStates, ...encumbrance.states];

    const speed = SpeedEngine.calculateSpeed(
      race?.speed ?? DEFAULT_WALKING_SPEED,
      allModifiers,
      sheetStates,
      encumbrance.tier,
    );

    // endregion

    // region State Synthesis

    // 1 - hydrate resources
    // engine extracts ResourceGrants from traits and feeds to manager
    // manager retains current charges, but updates max limits automatically
    const resourceGrants = activeTraits.flatMap((t) => t.resources || []);
    resourceManager.initializeFromGrants(resourceGrants);

    // 2 - synthesize actions
    // aggregate static actions from traits
    const actions: ActionGrant[] = activeTraits.flatMap((t) => t.actions || []);

    // TODO: synthesize weapon actions from the character's inventory (future implementation)

    // endregion

    // region Snapshot

    return {
      abilities,
      proficiencyBonus: profBonus,

      maxHp,
      currentHp: save.hp.current,
      tempHp: save.hp.temporary,
      armorClass,
      initiative,
      speed,

      skills,
      encumbrance,
      actions,
      baseStates,
      activeStates: sheetStates,
    };

    // endregion
  }
}
```

- [ ] **Step 5: Export the new modules**

In `packages/engine/src/index.ts`, add these lines to the calculator export block (after `export * from "./calculators/derivedStats.js";`):

```ts
export * from "./calculators/effects.js";
export * from "./calculators/encumbrance.js";
export * from "./calculators/resources.js";
export * from "./calculators/speed.js";
export * from "./calculators/weight.js";
```

and add to the rules export block:

```ts
export * from "./rules/creatureSize.js";
```

`effects.js` and `resources.js` are included because `buildLiveSheet` now takes an `EffectManager` and a `ResourceManager` as arguments and neither was reachable from the package entry point — a caller outside the engine literally could not construct the arguments.

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm --filter @project/engine exec vitest run 2>&1 | tail -5
```

Expected: **zero failures.** This is the one task that should turn the engine suite fully green: the 4 baseline `characterEngine.test.ts` failures were caused by the uncommitted `calculateTotalWeight()` stub that this task replaces. If any of those 4 still fail, the rewrite is incomplete.

- [ ] **Step 7: Confirm nothing downstream broke**

```bash
pnpm --filter @project/engine typecheck 2>&1 | grep -c "error TS"
```

Expected: `25` or fewer — one *below* the baseline of 25, because this task removes the `characterEngine.ts:128` error the stub introduced. A rise means the new signature broke something.

```bash
pnpm typecheck 2>&1 | grep "error TS" | grep "apps/" | head
```

Expected: whatever it prints, leave alone. `buildLiveSheet` has no callers outside the engine's own tests — `apps/web` uses its own hooks and `apps/server` does not call it — so the signature change is contained. Any `apps/web` error is the pre-existing `useCharacterStats.ts` drift and is **out of scope**: report it in your notes, fix nothing.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/pipeline/characterEngine.ts packages/engine/src/pipeline/__tests__/characterEngine.test.ts packages/engine/src/index.ts
git commit -m "feat: stage the live sheet pipeline around weight, encumbrance and speed"
```

---

### Task 7: Stop dropping item weight from the rule payload

`extractItemsForMigration` parses an `ItemDefinition` from four fields and never passes `weight`, so `ItemDefinitionSchema`'s default fills in `0`. Every rule snapshot built from the database therefore reports every item as weightless. It is masked today only because `EQUIPMENT_RESOLUTION_MODE` is pinned to `"static-only"`; flipping it to `"snapshot-first"` would silently zero the entire feature.

Only `weight` is fixable here — `SourceItem` carries no `equipSlot`, `requiresAttunement` or `ammoTag`, so those fields have nothing to be sourced from and stay as they are.

**Files:**
- Modify: `packages/database/src/itemsExtraction.ts:270-275`
- Modify: `packages/database/src/__tests__/itemsExtraction.test.ts`

**Interfaces:**
- Consumes: the existing `toNumberOr` helper in the same file.
- Produces: no API change. `ItemsExtractionResult.itemRulesById[id].weight` is now the item's weight in pounds.

- [ ] **Step 1: Write the failing test**

Append to the `describe("extractItemsForMigration", ...)` block in `packages/database/src/__tests__/itemsExtraction.test.ts`:

```ts
  it("carries item weight into the rule payload", () => {
    const result = extractItemsForMigration([
      {
        id: "item_armor_plate",
        name: "Plate Armor",
        type: "armor",
        weight: 65,
      },
    ]);

    // the rule payload is what the engine reads; it was being dropped, so
    // every snapshot-resolved item weighed nothing
    expect(result.itemRulesById.item_armor_plate.weight).toBe(65);
  });

  it("keeps the rule payload in pounds while the column stores hundredths", () => {
    const result = extractItemsForMigration([
      {
        id: "item_ammo_arrow",
        name: "Arrow",
        type: "gear",
        weight: 0.05,
      },
    ]);

    expect(result.itemRulesById.item_ammo_arrow.weight).toBe(0.05);
    expect(result.seedItems[0].weight).toBe(5);
  });

  it("defaults a weightless source item to zero", () => {
    const result = extractItemsForMigration([
      { id: "item_note", name: "Scrap of Paper", type: "gear" },
    ]);

    expect(result.itemRulesById.item_note.weight).toBe(0);
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @project/database exec vitest run src/__tests__/itemsExtraction.test.ts
```

Expected: FAIL — `expected 0 to be 65`.

- [ ] **Step 3: Pass the weight through**

In `packages/database/src/itemsExtraction.ts`, change the `ItemDefinitionSchema.parse` call (currently line 270):

```ts
    const itemDefinition = ItemDefinitionSchema.parse({
      id,
      name,
      type,
      // pounds, matching how EQUIPMENT_DICTIONARY authors weight. the `weight`
      // column beside this stores the same value in hundredths for integer
      // maths; the rule payload is what the engine reads, and it was being
      // dropped entirely, so every snapshot-resolved item weighed nothing
      weight: toNumberOr(item.weight, 0),
      modifiers: deriveItemModifiers(item),
    });
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @project/database exec vitest run
```

Expected: PASS. The existing `"adds manual ring of protection rule override"` test already asserts `weight: 0` on a manually-built rule that never flows through this path, so it is unaffected.

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/itemsExtraction.ts packages/database/src/__tests__/itemsExtraction.test.ts
git commit -m "fix: carry item weight into the extracted rule payload"
```

---

## Final Verification

- [ ] **Run the whole workspace against the baseline**

```bash
pnpm check:hygiene
```

Expected: clean. No build artefacts (`.js`, `.d.ts`) committed under any `src/`.

```bash
pnpm --filter @project/engine exec vitest run 2>&1 | tail -5
pnpm --filter @project/database exec vitest run 2>&1 | tail -5
pnpm --filter @project/shared exec vitest run 2>&1 | tail -5
```

Expected: engine **fully green**, database **fully green** (it was 50/50 before and gains 3 tests in Task 7), shared at **exactly its 11 baseline failures** and no more.

```bash
pnpm --filter @project/engine typecheck 2>&1 | grep -c "error TS"
```

Expected: `25` or fewer, per Task 6 Step 7.

Compare anything surprising against `.superpowers/sdd/2026-08-05-encumbrance-and-speed/baseline.md` before treating it as a regression.

## Known Follow-Ups (deliberately out of scope)

These are real and named so they do not get rediscovered as surprises:

1. **`apps/web` still runs its own drifted calculator path.** `useCharacterStats.ts` calls `calculateMaxHp`, `calculateInitiative` and `calculateSkill` with signatures the engine abandoned. Encumbrance and speed are computed by `buildLiveSheet` and will not appear in the UI until the web layer migrates to it. That migration is its own spec.
2. **`heavily_encumbered` imposes disadvantage on STR/DEX/CON checks, saves and attacks.** This plan emits the state; nothing consumes it yet. The consumer belongs in the roll layer alongside `has_disadvantage`, once the web migration gives it somewhere to land.
3. **Coin weight is not tracked.** There is no currency field on `CharacterSave`. Excluded by decision, not oversight.
4. **Bundles are assumed unpacked at acquisition.** The engine has no bundle awareness by design. If a bundle row can reach a character's inventory, its contents weigh nothing — the acquisition path must expand packs into individual rows.
5. **`EQUIPMENT_RESOLUTION_MODE` is still pinned to `"static-only"`, and flipping it is NOT yet safe.** Task 7 fixed only one of the two places that drop item weight. `apps/server/src/services/ruleSnapshotCache.ts` rebuilds each `EquipmentDefinition` field by field and copies only `id`, `name`, `type`, `modifiers` and `weapon` — `weight`, `equipSlot`, `requiresAttunement` and `ammoTag` are all dropped, and `EquipmentDefinitionSchema`'s `.default(0)` swallows the loss silently. **Carry those fields through `ruleSnapshotCache.ts` before anyone flips the mode**, or the flip will appear to work while every snapshot-resolved item weighs nothing.
6. **`trait_powerful_build` is authored but ungranted.** No race in `RACE_DICTIONARY` is a Goliath. It is unit-tested and ready for content; do not staple it to half-orcs to make an integration test easier.
7. **`StateExtractor` has no real-data yield yet.** ASI levels are authored as `{ level: N, grants: [], grantsASI: true }` with no `trait_choice` node, so `unlockedGrants` compiles nothing for them — no feat or state-bearing trait can be selected into a save at all. `trait_powerful_build` is the only trait with `grantedStates`, and no race grants it, so `StateExtractor.extractStates(activeTraits)` returns `[]` for every character buildable today. The wiring is proven by a `spyOn` test; it goes live when ASI/feat selection is built.
8. **Only 11 of 65 catalogue items have authored weights.** `EQUIPMENT_DICTIONARY` holds 11 entries against 65 items in `packages/database/data/items.json`. Under `"static-only"` resolution, a character carrying real catalogue items gets 0 lb for roughly five of every six. The feature is correct and unit-tested but has no data path to a realistic inventory until follow-ups 1 and 5 land.
9. **The two-stage seam is guarded at one of five call sites.** The feedback test covers `calculateScore`; `calculateMaxHp`, `calculateAC`, `calculateInitiative` and the skills loop have no data dependency pinning them above the seam, so a future edit could move one below it and pass the derived states with nothing failing. Cheapest hardening: parameterise the existing feedback test across all five outputs (~15 lines). Then extract stage one into a private static so the derived list is out of scope entirely — best done as the first commit of the web-migration spec, not on top of this branch.
10. **Smaller gaps the final review named:** the unknown-race fallbacks (`race?.size ?? "medium"`, `race?.speed ?? DEFAULT_WALKING_SPEED`) are uncovered — deleting the speed fallback yields `NaN` with no test failing; no integration test proves a `SPEED` modifier reaches the sheet (a wood elf's Fleet of Foot → 35 ft was verified correct by probe, but is untested); the encumbrance tier reaches `SpeedEngine` twice (inside the state list *and* as an explicit argument), so a future `SPEED` modifier gated on `"encumbered"` would double-count against `TIER_PENALTY`; and `itemsExtraction` clamps negative weights for the column but not for the rule payload.
