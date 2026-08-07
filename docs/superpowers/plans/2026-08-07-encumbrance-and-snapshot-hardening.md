# Encumbrance and Snapshot Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the non-web follow-ups left by `2026-08-05-encumbrance-and-speed.md` and `2026-08-06-rule-snapshot-lossless-projection.md` — three real bugs, one structural invariant, and the test coverage that would have caught all four.

**Architecture:** Nine changes across three packages, ordered *guard before change*. Task 1 pins all five stage-one calculators against the two-stage seam so Task 3 can restructure `buildLiveSheet` safely. Task 2 fixes the encumbrance tier reaching `SpeedEngine` through two channels, which is also what makes Task 3 a clean lift — once `SpeedEngine` takes `baseStates`, the derived state list has exactly one remaining use. Tasks 4–5 cover paths that a mutation would silently survive today. Tasks 6–9 are independent of the engine work and of each other.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Zod schemas in `@project/shared`, Vitest, pnpm workspaces + Turborepo, Drizzle ORM.

## Global Constraints

- **Work directly on `main`.** The user asked for this explicitly. Commit after every task; do not open a branch or a worktree.
- **Import specifiers end in `.js`** even when the source file is `.ts`. Every intra-package import in this repo follows this; a bare specifier will not resolve.
- **Comment style:** lowercase inline comments explaining *why*, matching the surrounding files. Do not add JSDoc to every member; match the density of the file being edited.
- **Do not modify `apps/web`.** Explicitly out of scope for this plan.
- **Do not touch `EQUIPMENT_DICTIONARY`, `items.json`, or `EQUIPMENT_RESOLUTION_MODE`.** The catalogue reconciliation is a separate spec that follows this one. If a task tempts you to add a catalogue entry, you have misread the task.
- **`@project/shared` has 11 pre-existing failing tests. Fixing them is not your job.** They are stale assertions in `character.test.ts` and `rules.test.ts` against schemas that have since grown Zod defaults. Do not "fix" them, and do not report BLOCKED because of them.

### Baseline — measured immediately before this plan, at commit `eec8a91`

| Package | Test files | Tests | Typecheck errors |
| --- | --- | --- | --- |
| `@project/engine` | 27 passed | **423 passed, 0 failed** | 25 |
| `@project/database` | 5 passed | **54 passed, 0 failed** | 17 |
| `@project/server` | 13 passed | **186 passed, 0 failed** | 37 |
| `@project/shared` | 6 passed, 2 failed | 147 passed, **11 failed** | 4 |

Engine, database and server are **fully green** and must stay that way — unlike the previous plan, any failure in those three is yours. The typecheck counts are a baseline, not a clean bill of health: they must not *rise*. Engine's 25 are 22 in test files plus 3 in `derivedStats.ts`; none are in files this plan rewrites.

Reproduce any of these with:

```bash
pnpm --filter @project/engine exec vitest run
```

```bash
pnpm --filter @project/engine typecheck 2>&1 | grep -c "error TS"
```

## File Structure

**Create:**
- `apps/server/src/services/__tests__/ruleSnapshotSeam.test.ts` — the one test that crosses extractor → row → projection with real catalogue data.

**Modify:**
- `packages/engine/src/pipeline/characterEngine.ts` — the `SpeedEngine` call site (Task 2), then the stage-one extraction (Task 3).
- `packages/engine/src/pipeline/__tests__/characterEngine.test.ts` — the seam guard (Task 1), the double-count tests (Task 2), the fallback and `SPEED` integration tests (Tasks 4–5).
- `packages/database/src/itemsExtraction.ts` — negative weight clamp (Task 6).
- `packages/database/src/__tests__/itemsExtraction.test.ts` — cover it.
- `apps/server/src/services/ruleSnapshotProjection.ts` — all-rows-fail threshold (Task 7), identity from the row (Task 8).
- `apps/server/src/services/__tests__/ruleSnapshotProjection.test.ts` — cover both.

Nothing is deleted, and no file crosses 350 lines as a result.

---

### Task 1: Pin every stage-one calculator against the seam

`buildLiveSheet` is a two-stage pipeline. Stage one (abilities, HP, AC, initiative, skills) reads `baseStates`; stage two derives an encumbrance tier from the *final* STR score and appends it, producing `activeStates`. If any stage-one calculator were handed `activeStates`, a modifier gated on `"heavily_encumbered"` could raise STR, which raises capacity, which lowers the tier, which withdraws the bonus — a loop with no fixed point.

Exactly one of the five outputs is currently guarded (`abilities`). The other four have no data dependency pinning them above the seam, so a future edit could move one below it and pass with nothing failing. This task parameterises the guard across all five, and adds a canary per output proving the harness would actually notice a change.

**Files:**
- Modify: `packages/engine/src/pipeline/__tests__/characterEngine.test.ts` — replace the single test `"does not let encumbrance feed back into the ability scores"` with a new `describe` block, and add one helper beside the existing `carried` helper.

**Interfaces:**
- Consumes: `CharacterEngine.buildLiveSheet`, `EffectManager`, `ResourceManager`, and the existing `halfElfFighter` / `carried` fixtures, all already in this file.
- Produces: a file-local helper `effectWith(target, value, requiredStates?, grantedStates?): EffectManager`, used again by Task 2.

**Line numbers in this task refer to the file as it stands at `eec8a91`, before any step below has run.** Locate code by the names quoted, not by counting lines, once you have started editing.

- [ ] **Step 1: Add the `RuntimeModifier` and `LiveCharacterSheet` type imports**

At the top of `packages/engine/src/pipeline/__tests__/characterEngine.test.ts`, extend the existing `@project/shared` type import (lines 2–6) and the `CharacterEngine` import (line 8):

```ts
import type {
  CharacterSave,
  TraitDefinition,
  InventoryInstance,
  RuntimeModifier,
} from "@project/shared";
```

```ts
import {
  CharacterEngine,
  type LiveCharacterSheet,
} from "../characterEngine.js";
```

- [ ] **Step 2: Add the `effectWith` helper**

Insert immediately after the existing `carried` helper (it ends at line 63, just before `describe("CharacterBootstrapper.compileActiveTraits"`):

```ts
/**
 * An EffectManager carrying exactly one modifier, so a test can aim a bonus at
 * one output and gate it on whatever states it likes.
 *
 * requiredStates is what makes a test a seam test: a modifier gated on a state
 * only the *derived* list carries applies if and only if a calculator was
 * handed the wrong list.
 */
const effectWith = (
  target: RuntimeModifier["target"],
  value: number,
  requiredStates: string[] = [],
  grantedStates: string[] = [],
): EffectManager => {
  const manager = new EffectManager();

  manager.addEffect({
    instanceId: "test_effect",
    sourceName: "Test Effect",
    durationType: "manual",
    isSelfConcentration: false,
    grantedStates,
    modifiers: [
      {
        id: "test_modifier",
        sourceName: "Test Effect",
        sourceOrigin: "test",
        target,
        type: "add",
        value,
        scalingFactor: "none",
        requiredStates,
        forbiddenStates: [],
        isActive: true,
      },
    ],
  });

  return manager;
};
```

- [ ] **Step 3: Write the parameterised seam guard**

Delete the whole `it("does not let encumbrance feed back into the ability scores", ...)` test — from its `it(` line through its closing `});`, including the `EffectManager` fixture built inside it — and append this `describe` block to the very end of the file, after the closing `});` of `describe("CharacterEngine.buildLiveSheet: inventory modifiers", ...)`:

```ts
/**
 * The invariant the two-stage pipeline rests on, checked at all five of its
 * exits rather than one.
 *
 * The fixture carries 3 plate (195 lb) with the variant rule on. Its STR 15
 * puts the heavily-encumbered threshold at 150 lb, so the tier is live in
 * every case below - which is what makes the gate a real gate.
 */
describe("CharacterEngine.buildLiveSheet: the stage-one seam", () => {
  const stageOneOutputs: Array<{
    name: string;
    target: RuntimeModifier["target"];
    read: (sheet: LiveCharacterSheet) => number;
  }> = [
    {
      name: "ability scores",
      target: "STR",
      read: (sheet) => sheet.abilities.STR.score,
    },
    { name: "max HP", target: "MAX_HP", read: (sheet) => sheet.maxHp.total },
    {
      name: "armour class",
      target: "ARMOR_CLASS",
      read: (sheet) => sheet.armorClass.total,
    },
    {
      name: "initiative",
      target: "INITIATIVE",
      read: (sheet) => sheet.initiative.total,
    },
    {
      name: "skills",
      target: "STEALTH_CHECK",
      read: (sheet) => sheet.skills.stealth!.totalModifier,
    },
  ];

  const heavyLoad = () => [carried("item_armor_plate", 3)];
  const variantRules = { encumbranceRules: { useVariantEncumbrance: true } };

  const sheetWith = (effects: EffectManager): LiveCharacterSheet =>
    CharacterEngine.buildLiveSheet(
      halfElfFighter(),
      heavyLoad(),
      effects,
      new ResourceManager(),
      variantRules,
    );

  for (const { name, target, read } of stageOneOutputs) {
    it(`does not let a derived state reach ${name}`, () => {
      const control = sheetWith(new EffectManager());
      const gated = sheetWith(effectWith(target, 5, ["heavily_encumbered"]));

      // without these two the case is vacuous: if the tier never fires there
      // is no derived state to leak, and the assertion below proves nothing
      expect(gated.encumbrance.tier).toBe("heavily_encumbered");
      expect(gated.activeStates).toContain("heavily_encumbered");

      expect(read(gated)).toBe(read(control));
    });

    it(`applies the same modifier to ${name} when it is ungated`, () => {
      // the canary for the case above. a typo in `target` or a `read` aimed at
      // the wrong field would make every gated case pass while proving
      // nothing, and this is what catches that
      const control = sheetWith(new EffectManager());
      const ungated = sheetWith(effectWith(target, 5));

      expect(read(ungated)).toBe(read(control) + 5);
    });
  }
});
```

- [ ] **Step 4: Run the suite and confirm all ten pass**

```bash
pnpm --filter @project/engine exec vitest run src/pipeline/__tests__/characterEngine.test.ts
```

Expected: PASS. The file goes from 34 to 43 tests (one deleted, ten added). These are characterisation tests — stage one already reads `baseStates`, so they pass on the first run. That is the point: they are the guard Task 3 refactors under, not a red-green cycle.

If a *gated* case fails, stage one is already leaking derived states and Task 2 is not the only bug. If a *canary* fails, the harness is wrong — check that `target` matches the string the calculator filters on (`STEALTH_CHECK` for a skill, not `STEALTH`).

- [ ] **Step 5: Run the whole engine suite**

```bash
pnpm --filter @project/engine exec vitest run 2>&1 | tail -5
```

Expected: `Test Files 27 passed (27)`, `Tests 432 passed (432)` — 423 baseline, minus the one deleted, plus ten.

- [ ] **Step 6: Confirm typecheck did not regress**

```bash
pnpm --filter @project/engine typecheck 2>&1 | grep -c "error TS"
```

Expected: `25` or fewer. If it rose, find the new error in the full output and fix it — most likely `sheet.skills.stealth` without the `!`, since `noUncheckedIndexedAccess` is on.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/pipeline/__tests__/characterEngine.test.ts
git commit -m "test: pin all five stage-one outputs against the encumbrance seam"
```

---

### Task 2: Stop the encumbrance tier reaching SpeedEngine twice

`buildLiveSheet` passes `activeStates` *and* `encumbrance.tier` to `SpeedEngine.calculateSpeed`. `activeStates` already contains the tier as a string, so the tier arrives through two channels: a `SPEED` modifier gated on `"encumbered"` applies its value, and then `TIER_PENALTY` subtracts 10 on top. A content author writing "-10 ft when encumbered" gets -20.

The fix is to hand `SpeedEngine` `baseStates` for modifier gating and let the tier arrive only as the typed argument — one channel per concern. The cost, accepted deliberately: a `SPEED` modifier can no longer be gated on an encumbrance tier at all. That is the right trade, because encumbrance's effect on speed *is* `TIER_PENALTY`; anything else expressing it is a duplicate.

**Files:**
- Modify: `packages/engine/src/pipeline/characterEngine.ts` — the `SpeedEngine.calculateSpeed` call, in the `region Load (stage two)` block near the end of `buildLiveSheet`
- Modify: `packages/engine/src/pipeline/__tests__/characterEngine.test.ts` — two tests appended to the `"speed and encumbrance"` describe block

**Interfaces:**
- Consumes: `effectWith` from Task 1; `SpeedEngine.calculateSpeed(baseSpeed, modifiers, activeStates?, encumbranceTier?)`, unchanged.
- Produces: no signature changes. `SpeedEngine`'s third parameter now receives `baseStates` at the only call site in the engine.

- [ ] **Step 1: Write the failing test**

Append both tests inside `describe("CharacterEngine.buildLiveSheet: speed and encumbrance", ...)`, immediately before its closing `});` — that is, right after the `"derives capacity from the final STR score, not the saved attribute"` test:

```ts
  it("does not count an encumbrance tier twice against speed", () => {
    // a SPEED modifier gated on the derived tier. before the fix the tier
    // reached SpeedEngine through activeStates *and* as its own argument, so
    // this -10 landed on top of the -10 TIER_PENALTY already applies
    const sheet = CharacterEngine.buildLiveSheet(
      halfElfFighter(),
      [carried("item_armor_plate", 2)], // 130 lb, past the 75 lb threshold
      effectWith("SPEED", -10, ["encumbered"]),
      new ResourceManager(),
      { encumbranceRules: { useVariantEncumbrance: true } },
    );

    expect(sheet.encumbrance.tier).toBe("encumbered");
    // 30 base - 10 tier penalty. not 10
    expect(sheet.speed.total).toBe(20);
  });

  it("still gates a speed modifier on a base state", () => {
    // the other direction: dropping activeStates must not disable state
    // gating for speed altogether, only for the tiers stage two derives
    const sheet = CharacterEngine.buildLiveSheet(
      halfElfFighter(),
      [],
      effectWith("SPEED", 10, ["raging"], ["raging"]),
      new ResourceManager(),
    );

    expect(sheet.baseStates).toContain("raging");
    expect(sheet.speed.total).toBe(40);
  });
```

- [ ] **Step 2: Run the tests to verify the first one fails**

```bash
pnpm --filter @project/engine exec vitest run src/pipeline/__tests__/characterEngine.test.ts -t "encumbrance tier twice"
```

Expected: FAIL — `expected 10 to be 20`. The base 30 has the modifier's -10 applied as a flat adder, then the tier's -10 on top.

```bash
pnpm --filter @project/engine exec vitest run src/pipeline/__tests__/characterEngine.test.ts -t "gates a speed modifier on a base state"
```

Expected: PASS already. It is the regression guard for the fix, not a driver of it.

- [ ] **Step 3: Change the call site**

In `packages/engine/src/pipeline/characterEngine.ts`, replace the `SpeedEngine.calculateSpeed` call in the `region Load (stage two)` block:

```ts
    const speed = SpeedEngine.calculateSpeed(
      race?.speed ?? DEFAULT_WALKING_SPEED,
      allModifiers,
      // baseStates, not activeStates: the tier already arrives below as a
      // typed argument, so letting it in through the state list too would make
      // a SPEED modifier gated on "encumbered" stack on top of TIER_PENALTY -
      // the same ten feet counted twice
      baseStates,
      encumbrance.tier,
    );
```

Leave `activeStates` where it is — it is still built above this call and still returned on the sheet, which is where the roll layer and the UI read it.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @project/engine exec vitest run src/pipeline/__tests__/characterEngine.test.ts
```

Expected: PASS, 45 tests in the file.

- [ ] **Step 5: Run the whole engine suite**

```bash
pnpm --filter @project/engine exec vitest run 2>&1 | tail -5
```

Expected: `Test Files 27 passed (27)`, `Tests 434 passed (434)`.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/pipeline/characterEngine.ts packages/engine/src/pipeline/__tests__/characterEngine.test.ts
git commit -m "fix: stop the encumbrance tier reaching SpeedEngine through two channels"
```

---

### Task 3: Lift stage one into a private static

With Task 2 done, `activeStates` has exactly one use left inside `buildLiveSheet`: the object it returns. That makes the two-stage seam extractable. Today it is a comment and a convention; after this it is a function boundary — stage one's parameter is named `baseStates` and the derived list is not in scope at all.

This is a pure refactor. It adds no tests, because Task 1 added them: ten tests across five outputs are what make moving this code safe.

**Files:**
- Modify: `packages/engine/src/pipeline/characterEngine.ts` — add two module-local interfaces and one private static, and replace the body of the `region Calculations (stage one)` block

**Interfaces:**
- Consumes: `AbilityEngine`, `DerivedStatEngine`, `SkillEngine`, `SKILL_MAP`, all already imported by this file.
- Produces: module-local `interface StageOneInput` and `interface StageOneResult` (not exported); `private static CharacterEngine.computeStageOne(input: StageOneInput): StageOneResult`. Nothing outside this file may reference either.

- [ ] **Step 1: Add the two type imports**

In `packages/engine/src/pipeline/characterEngine.ts`, extend the existing `@project/shared` type import block at the top of the file:

```ts
import type {
  ActionGrant,
  CalculationResult,
  CharacterSave,
  FixedProficiencyGrant,
  InventoryInstance,
  RuntimeModifier,
} from "@project/shared";
```

- [ ] **Step 2: Declare the stage-one interfaces**

Insert immediately before `export interface LiveSheetOptions`, which sits between the import block and `export interface LiveCharacterSheet`:

```ts
/**
 * Everything stage one is allowed to see.
 *
 * Narrow on purpose. The field that matters is baseStates: naming it that,
 * rather than activeStates, is what makes the pipeline's one invariant a
 * signature rather than a comment. A calculator below this line cannot read a
 * state that encumbrance derived, because it is not in scope.
 */
interface StageOneInput {
  attributes: CharacterSave["attributes"];
  classes: CharacterSave["classes"];
  baseRolledHp: number;
  totalLevel: number;
  profBonus: number;
  proficiencies: FixedProficiencyGrant[];
  modifiers: RuntimeModifier[];
  baseStates: string[];
}

/** The five outputs that must be final before encumbrance can be computed. */
interface StageOneResult {
  abilities: Record<Ability, DerivedAbility>;
  maxHp: CalculationResult;
  armorClass: CalculationResult;
  initiative: CalculationResult;
  skills: Record<string, DerivedSkill>;
}
```

- [ ] **Step 3: Add the private static**

Inside `export class CharacterEngine`, add this method after the closing brace of `buildLiveSheet` and before the class's own closing brace:

```ts
  /**
   * Abilities, HP, AC, initiative and skills, from base states only.
   *
   * Split out of buildLiveSheet so the seam is structural: encumbrance runs on
   * the final STR score this produces, and if its verdict could flow back in
   * here, a belt of giant strength would change the capacity that changed the
   * state that changed the score - no fixed point.
   */
  private static computeStageOne({
    attributes,
    classes,
    baseRolledHp,
    totalLevel,
    profBonus,
    proficiencies,
    modifiers,
    baseStates,
  }: StageOneInput): StageOneResult {
    // 1 - ability scores
    const abilities = {} as Record<Ability, DerivedAbility>;
    const abilityKeys: Ability[] = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

    for (const key of abilityKeys) {
      abilities[key] = AbilityEngine.calculateScore(
        attributes[key.toLowerCase() as keyof typeof attributes],
        key,
        modifiers,
        baseStates,
      );
    }

    // 2 - derived stats
    const levelProfile = {
      total: totalLevel,
      classes: classes.reduce(
        (acc, cls) => {
          acc[cls.classId] = cls.level;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };

    const maxHp = DerivedStatEngine.calculateMaxHp(
      // the UI/Bootstrapper calculates the flat base rolled HP during level up
      baseRolledHp,
      abilities.CON.modifier,
      levelProfile,
      modifiers,
      baseStates,
    );

    const armorClass = DerivedStatEngine.calculateAC(
      abilities.DEX.modifier,
      modifiers,
      baseStates,
    );

    const initiative = DerivedStatEngine.calculateInitiative(
      abilities.DEX.modifier,
      profBonus,
      proficiencies,
      modifiers,
      baseStates,
    );

    // 3 - skills
    const skills = {} as Record<string, DerivedSkill>;

    for (const skillId of Object.keys(SKILL_MAP)) {
      const governingStat = SKILL_MAP[skillId]?.ability as Ability;
      skills[skillId] = SkillEngine.calculateSkill(
        skillId,
        abilities[governingStat].score,
        profBonus,
        proficiencies,
        modifiers,
        baseStates,
      );
    }

    return { abilities, maxHp, armorClass, initiative, skills };
  }
```

- [ ] **Step 4: Replace the stage-one block in `buildLiveSheet`**

Delete everything from the `// region Calculations (stage one)` comment through the `// endregion` that closes it — that is the `totalLevel`/`profBonus` lines, the ability loop, the `levelProfile` literal, the three `DerivedStatEngine` calls and the skills loop. Replace the whole region with:

```ts
    // region Calculations (stage one)
    //
    // Everything here reads baseStates. The derived states are not built until
    // the load region below, and computeStageOne cannot see them.

    const totalLevel = save.classes.reduce((sum, cls) => sum + cls.level, 0);
    const profBonus = AbilityEngine.getProficiencyBonus(totalLevel);

    const { abilities, maxHp, armorClass, initiative, skills } =
      this.computeStageOne({
        attributes: save.attributes,
        classes: save.classes,
        baseRolledHp: save.hp.baseRolledHp,
        totalLevel,
        profBonus,
        proficiencies,
        modifiers: allModifiers,
        baseStates,
      });

    // endregion
```

Everything below — the load region, the state synthesis region and the returned snapshot — is unchanged and still refers to `abilities`, `maxHp`, `armorClass`, `initiative`, `skills`, `profBonus` and `totalLevel` by the same names.

- [ ] **Step 5: Run the whole engine suite**

```bash
pnpm --filter @project/engine exec vitest run 2>&1 | tail -5
```

Expected: `Test Files 27 passed (27)`, `Tests 434 passed (434)` — the same 434 as after Task 2. A pure refactor changes no count and no result. Any failure means the lift dropped or reordered something; re-read Step 4 rather than adjusting a test.

- [ ] **Step 6: Confirm typecheck did not regress**

```bash
pnpm --filter @project/engine typecheck 2>&1 | grep -c "error TS"
```

Expected: `25` or fewer.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/pipeline/characterEngine.ts
git commit -m "refactor: make the stage-one seam a function boundary"
```

---

### Task 4: Cover the unknown-race fallbacks

`buildLiveSheet` reads `race?.size ?? "medium"` and `race?.speed ?? DEFAULT_WALKING_SPEED`, because a save can name a race the loaded rulebook no longer has. Neither fallback is covered: delete the speed one and `SpeedEngine` receives `undefined`, returns `NaN`, and the whole suite stays green.

**Files:**
- Modify: `packages/engine/src/pipeline/__tests__/characterEngine.test.ts` — a new `describe` block appended to the end of the file

**Interfaces:**
- Consumes: `halfElfFighter`, `buildSheet` — both already in this file. `DEFAULT_WALKING_SPEED` from `packages/engine/src/rules/raceDictionary.js`.
- Produces: nothing. Tests only.

- [ ] **Step 1: Add the `DEFAULT_WALKING_SPEED` import**

At the top of `packages/engine/src/pipeline/__tests__/characterEngine.test.ts`, after the existing `TRAIT_DICTIONARY` import:

```ts
import { DEFAULT_WALKING_SPEED } from "../../rules/raceDictionary.js";
```

- [ ] **Step 2: Write the failing tests**

Append to the very end of the file:

```ts
/**
 * A save can outlive the pack that authored its race - an imported race pack
 * gets unloaded, or a homebrew id is renamed - so both reads of RACE_DICTIONARY
 * are optional-chained. Neither fallback had a test, and deleting the speed one
 * yields NaN with nothing failing.
 */
describe("CharacterEngine.buildLiveSheet: an unknown race", () => {
  const orphaned = () =>
    halfElfFighter({
      race: {
        baseRaceId: "race_no_longer_loaded",
        hasSubraces: false,
        subraceId: null,
      },
    });

  it("falls back to the default walking speed rather than NaN", () => {
    const speed = buildSheet(orphaned()).speed.total;

    expect(speed).toBe(DEFAULT_WALKING_SPEED);
    // stated separately because it is the specific failure the fallback
    // prevents: an undefined base speed propagates silently through every
    // arithmetic step in SpeedEngine
    expect(Number.isNaN(speed)).toBe(false);
  });

  it("falls back to a medium creature's carrying capacity", () => {
    // STR 15 x 15 x 1. this cannot tell medium from small - 5e gives both the
    // same multiplier - but it does separate either from tiny's 112.5 and
    // large's 450, which is what a broken fallback would produce
    expect(buildSheet(orphaned()).encumbrance.maxCapacity).toBe(225);
  });
});
```

- [ ] **Step 3: Run the tests to verify they pass**

```bash
pnpm --filter @project/engine exec vitest run src/pipeline/__tests__/characterEngine.test.ts
```

Expected: PASS, 47 tests in the file. Like Task 1 these are characterisation tests — the fallbacks work today, and these are what stop a future edit removing them silently.

To confirm the first test is not vacuous, temporarily change `race?.speed ?? DEFAULT_WALKING_SPEED` to `race?.speed as number` in `characterEngine.ts`, re-run, and see it fail with `expected NaN to be 30`. **Revert that edit before continuing.**

- [ ] **Step 4: Run the whole engine suite**

```bash
pnpm --filter @project/engine exec vitest run 2>&1 | tail -5
```

Expected: `Test Files 27 passed (27)`, `Tests 436 passed (436)`.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/pipeline/__tests__/characterEngine.test.ts
git commit -m "test: cover the unknown-race speed and size fallbacks"
```

---

### Task 5: Prove a SPEED modifier reaches the sheet

`SPEED` has been a valid `ModifierTarget` and the wood elf's Fleet of Foot has emitted `set_base 35` since the trait dictionary was written. `SpeedEngine` has fifteen unit tests, and `buildLiveSheet` has tests for the racial base speed and the encumbrance penalties — but nothing proves a `SPEED` modifier authored in a trait dictionary survives extraction and reaches `sheet.speed`. The path was verified by probe when the previous plan landed, and left untested.

**Files:**
- Modify: `packages/engine/src/pipeline/__tests__/characterEngine.test.ts` — a fixture and a `describe` block appended to the end of the file

**Interfaces:**
- Consumes: `buildSheet`; `RACE_DICTIONARY.race_elf.subraces.subrace_elf_wood`, which grants `fleet_of_foot`.
- Produces: a file-local `woodElfFighter()` fixture.

- [ ] **Step 1: Write the failing test**

Append to the very end of the file:

```ts
/**
 * The wood elf is the only content in the repo that authors a SPEED modifier:
 * fleet_of_foot emits set_base 35 against a racial base of 30. Nothing tested
 * that it survives compileActiveTraits -> ModifierExtractor -> SpeedEngine.
 */
const woodElfFighter = (): CharacterSave => ({
  attributes: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
  race: {
    baseRaceId: "race_elf",
    hasSubraces: true,
    subraceId: "subrace_elf_wood",
  },
  classes: [
    {
      classId: "class_fighter",
      level: 1,
      selections: { fighter_level_1_fighting_style: ["trait_fs_defense"] },
    },
  ],
  traitSelections: {},
  hp: { current: 12, temporary: 0, baseRolledHp: 10, hitDiceSpent: {} },
});

describe("CharacterEngine.buildLiveSheet: a trait-authored SPEED modifier", () => {
  it("raises a wood elf's speed to 35 through the whole pipeline", () => {
    const speed = buildSheet(woodElfFighter()).speed;

    expect(speed.total).toBe(35);
    // asserted on the breakdown too, because a bug that ignored the modifier
    // and a bug that read 35 off the race would both satisfy the total alone
    expect(speed.breakdown).toEqual([
      { name: "Base Speed", value: 30 },
      { name: "Fleet of Foot", value: 35 },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

```bash
pnpm --filter @project/engine exec vitest run src/pipeline/__tests__/characterEngine.test.ts -t "wood elf"
```

Expected: PASS, and the file totals 48 tests. `race_elf` is 30 ft, and `fleet_of_foot`'s `set_base 35` beats it.

If the breakdown assertion fails, print the actual array before touching anything — a *different* breakdown means the extractor changed, which is a real finding; a *missing* Fleet of Foot entry means the modifier never arrived.

- [ ] **Step 3: Run the whole engine suite**

```bash
pnpm --filter @project/engine exec vitest run 2>&1 | tail -5
```

Expected: `Test Files 27 passed (27)`, `Tests 437 passed (437)`.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/pipeline/__tests__/characterEngine.test.ts
git commit -m "test: prove a trait-authored SPEED modifier reaches the live sheet"
```

---

### Task 6: Clamp negative weight in the rule payload

`toStoredWeight` floors a negative source weight at zero for the integer column, but the rule payload beside it uses `toNumberOr(item.weight, 0)` with no clamp. A source item authored at `-5` stores `0` in the column and `-5` in `item_rule`, and the engine reads the payload — so a single bad row could reduce a character's carried total, and enough of them make encumbrance negative.

The fix routes both through one helper, so the column and the payload cannot disagree again.

**Files:**
- Modify: `packages/database/src/itemsExtraction.ts` — the `toStoredWeight` helper (in the `#region Constants and Helper Functions` block) and the two places `item.weight` is read inside `extractItemsForMigration`
- Modify: `packages/database/src/__tests__/itemsExtraction.test.ts` — one test

**Interfaces:**
- Consumes: the existing `toNumberOr` helper in the same file.
- Produces: a module-local `toPounds(value: unknown): number`; `toStoredWeight` narrows from `(value: unknown)` to `(pounds: number)`. Neither is exported; `extractItemsForMigration`'s signature and its `ExtractedSeedItem` shape are unchanged.

- [ ] **Step 1: Write the failing test**

In `packages/database/src/__tests__/itemsExtraction.test.ts`, insert immediately after the `it("defaults a weightless source item to zero", ...)` test:

```ts
  it("floors a negative source weight in the payload, not just the column", () => {
    const result = extractItemsForMigration([
      { id: "item_bad_data", name: "Impossible Feather", type: "gear", weight: -5 },
    ]);

    // the column has always clamped. the payload is what the engine reads, and
    // it did not - so a bad row could make a character's pack weigh less
    expect(result.itemRulesById.item_bad_data.weight).toBe(0);
    expect(result.seedItems[0].weight).toBe(0);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @project/database exec vitest run src/__tests__/itemsExtraction.test.ts -t "negative source weight"
```

Expected: FAIL — `expected -5 to be 0` on the `itemRulesById` assertion. The `seedItems` assertion already holds.

- [ ] **Step 3: Route both readings through one helper**

In `packages/database/src/itemsExtraction.ts`, replace the `toStoredWeight` helper:

```ts
/**
 * Authored weight in pounds, floored at zero.
 *
 * A negative weight is bad data, not a discount - and the rule payload is what
 * the engine sums, so clamping only the column let one bad row reduce a
 * character's carried total.
 */
const toPounds = (value: unknown): number => Math.max(0, toNumberOr(value, 0));

// persist as hundredths of a pound in an integer column, matching how the
// engine accumulates weight
const toStoredWeight = (pounds: number): number => Math.round(pounds * 100);
```

Then, inside `extractItemsForMigration`'s `for (const item of dedupedItems)` loop, replace the line `const weight = toStoredWeight(item.weight);` with:

```ts
    const pounds = toPounds(item.weight);
    const weight = toStoredWeight(pounds);
```

and in the `ItemDefinitionSchema.parse({ ... })` call just below it, replace `weight: toNumberOr(item.weight, 0),` with:

```ts
      // pounds, matching how EQUIPMENT_DICTIONARY authors weight. the `weight`
      // column beside this stores the same value in hundredths for integer
      // maths, and both now come from one clamped reading
      weight: pounds,
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @project/database exec vitest run src/__tests__/itemsExtraction.test.ts
```

Expected: PASS, 11 tests in the file. The existing `"keeps the rule payload in pounds while the column stores hundredths"` test still passes: `toPounds(0.05)` is `0.05` and `toStoredWeight(0.05)` is `5`.

- [ ] **Step 5: Run the whole database suite**

```bash
pnpm --filter @project/database exec vitest run 2>&1 | tail -5
```

Expected: `Test Files 5 passed (5)`, `Tests 55 passed (55)`.

- [ ] **Step 6: Confirm typecheck did not regress**

```bash
pnpm --filter @project/database typecheck 2>&1 | grep -c "error TS"
```

Expected: `17` or fewer.

- [ ] **Step 7: Commit**

```bash
git add packages/database/src/itemsExtraction.ts packages/database/src/__tests__/itemsExtraction.test.ts
git commit -m "fix: clamp negative item weight in the rule payload as well as the column"
```

---

### Task 7: Fail loudly when every row's rule payload is broken

`projectEquipmentRows` skips malformed rows and reports their ids, which is right for one bad row: a snapshot that loses a homebrew dagger is better than a server that will not start. But 1-of-65 failing and 65-of-65 failing produce the same `console.warn` and the same HTTP 200 — and 65-of-65 is not bad data, it is a broken contract, a schema change no stored payload satisfies. A snapshot in which nothing resolves silently breaks every character.

**Files:**
- Modify: `apps/server/src/services/ruleSnapshotProjection.ts` — after the `for` loop, before the `return`
- Modify: `apps/server/src/services/__tests__/ruleSnapshotProjection.test.ts` — two tests appended before the closing `});`

**Interfaces:**
- Consumes: nothing new.
- Produces: `projectEquipmentRows` now throws an `Error` when `rows.length > 0` and every row fails to parse. Its return type is unchanged. `ruleSnapshotCache.buildRuleSnapshot` is deliberately **not** modified — the throw propagates, and a request needing a snapshot fails visibly instead of succeeding emptily.

- [ ] **Step 1: Write the failing test**

In `apps/server/src/services/__tests__/ruleSnapshotProjection.test.ts`, insert immediately after the `it("skips and reports a row whose stored rule no longer parses", ...)` test, still inside the `describe("projectEquipmentRows", ...)` block:

```ts
  it("throws when every row fails, because that is a contract break", () => {
    // one bad row is bad data and gets skipped. every row bad is a schema
    // change no stored payload satisfies, and returning empty maps there
    // serves a snapshot in which nothing resolves - a 200 that quietly breaks
    // every character is worse than a failure someone can see
    const broken = (id: string): EquipmentRuleRow =>
      row({
        id,
        itemRule: { ...fullItemRule, id, type: "nonsense" } as
          unknown as ItemDefinition,
      });

    expect(() =>
      projectEquipmentRows([broken("item_a"), broken("item_b")]),
    ).toThrow(/every one of 2 item rows failed to parse/);
  });

  it("still returns empty maps for no rows at all", () => {
    // the threshold must not fire on an empty catalogue: zero of zero rows
    // failing is not a contract break, it is an empty table
    expect(() => projectEquipmentRows([])).not.toThrow();
  });
```

- [ ] **Step 2: Run the tests to verify the first one fails**

```bash
pnpm --filter @project/server exec vitest run src/services/__tests__/ruleSnapshotProjection.test.ts -t "contract break"
```

Expected: FAIL — the function returns empty maps instead of throwing.

- [ ] **Step 3: Add the threshold**

In `apps/server/src/services/ruleSnapshotProjection.ts`, insert immediately after the `for (const row of rows) { ... }` loop and before the `return` statement:

```ts
  // one unparseable row is bad data, handled above. every row unparseable is a
  // different thing entirely - a schema change that no stored payload
  // satisfies - and skipping them all would hand back a snapshot in which
  // nothing resolves. the empty-catalogue case is excluded because zero of
  // zero failing is not a break, it is an empty table
  if (rows.length > 0 && malformedItemIds.length === rows.length) {
    throw new Error(
      `[ruleSnapshotProjection] every one of ${rows.length} item rows failed to parse against EquipmentDefinition; the stored rule payloads and the schema have diverged`,
    );
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @project/server exec vitest run src/services/__tests__/ruleSnapshotProjection.test.ts
```

Expected: PASS, 12 tests in the file. The existing `"returns empty maps for no rows"` and `"skips and reports a row whose stored rule no longer parses"` tests both still pass — the first because of the `rows.length > 0` guard, the second because one of its two rows is good.

- [ ] **Step 5: Run the whole server suite**

```bash
pnpm --filter @project/server exec vitest run 2>&1 | tail -5
```

Expected: `Test Files 13 passed (13)`, `Tests 188 passed (188)`.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/ruleSnapshotProjection.ts apps/server/src/services/__tests__/ruleSnapshotProjection.test.ts
git commit -m "fix: throw from the rule projection when every row fails to parse"
```

---

### Task 8: Source identity from the row, not the payload

`projectEquipmentRows` already takes `weight` from the column rather than the payload, on the argument that the column is authoritative and payloads go stale. The same argument applies to `id` and `name`, and today it is not applied: the maps are keyed by `row.id` but the value's `id` comes from `itemRule.id`. Rename an item without rewriting `item_rule` and `itemsById[x].id !== x`.

**Files:**
- Modify: `apps/server/src/services/ruleSnapshotProjection.ts` — the `EquipmentDefinitionSchema.safeParse` call
- Modify: `apps/server/src/services/__tests__/ruleSnapshotProjection.test.ts` — one test appended before the closing `});`

**Interfaces:**
- Consumes: nothing new.
- Produces: no signature change. For every id in `equipmentById`, `itemsById` and `weaponsById`, the value's `id` now equals its key and its `name` equals the row's `name`.

- [ ] **Step 1: Write the failing test**

Append after the tests added in Task 7, still inside `describe("projectEquipmentRows", ...)`:

```ts
  it("keys identity off the row when the payload has gone stale", () => {
    // the same argument that already governs weight: the columns are what the
    // rest of the system keys on, and item_rule is a copy that an edit to the
    // name column does not rewrite
    const result = projectEquipmentRows([
      row({
        id: "item_armor_plate",
        name: "Plate Armor",
        itemRule: {
          ...fullItemRule,
          id: "item_armour_plate_old_id",
          name: "Platemail",
        },
      }),
    ]);

    const equipment = result.equipmentById.item_armor_plate!;
    expect(equipment.id).toBe("item_armor_plate");
    expect(equipment.name).toBe("Plate Armor");
    expect(result.itemsById.item_armor_plate!.id).toBe("item_armor_plate");
    expect(result.equipmentById.item_armour_plate_old_id).toBeUndefined();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @project/server exec vitest run src/services/__tests__/ruleSnapshotProjection.test.ts -t "stale"
```

Expected: FAIL — `expected 'item_armour_plate_old_id' to be 'item_armor_plate'`.

- [ ] **Step 3: Take identity from the row**

In `apps/server/src/services/ruleSnapshotProjection.ts`, add two lines to the `safeParse` input, after the spread and beside the existing `weight` override:

```ts
    const parsed = EquipmentDefinitionSchema.safeParse({
      ...itemRule,
      // the row is authoritative for identity for the same reason it is for
      // weight below: the columns are what everything else keys on, and a
      // payload written before a rename still carries the old name
      id: row.id,
      name: row.name,
      // the column is the canonical weight. payloads written before the
      // extractor carried weight hold a stale 0, so reading the column heals
      // them without a re-seed
      weight: hundredthsToPounds(row.weight),
      ...(row.weaponRule
        ? { weapon: toWeaponCapability(row.weaponRule) }
        : {}),
    });
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @project/server exec vitest run src/services/__tests__/ruleSnapshotProjection.test.ts
```

Expected: PASS, 13 tests in the file. The existing `"falls back to bare gear when a row has no authored rule"` test still passes — `fallbackItemRule` already read identity from the row, and this change makes the two paths agree.

- [ ] **Step 5: Run the whole server suite**

```bash
pnpm --filter @project/server exec vitest run 2>&1 | tail -5
```

Expected: `Test Files 13 passed (13)`, `Tests 189 passed (189)`.

- [ ] **Step 6: Confirm typecheck did not regress**

```bash
pnpm --filter @project/server typecheck 2>&1 | grep -c "error TS"
```

Expected: `37` or fewer.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/services/ruleSnapshotProjection.ts apps/server/src/services/__tests__/ruleSnapshotProjection.test.ts
git commit -m "fix: key rule snapshot identity off the row instead of the payload"
```

---

### Task 9: One test across the extractor/projection seam

Every test on this path stops at a hand-built fixture, on both sides of the boundary. That is precisely why a missing `versatileDamageDice` survived three task reviews: when a fixture is wrong, both the input and the expectation are wrong together, and the test still passes.

This test uses the real catalogue. It runs `extractItemsForMigration` over `items.json`, maps its output into the row shape the cache reads, and projects it — the seed path and the snapshot path meeting, without a database.

**Files:**
- Create: `apps/server/src/services/__tests__/ruleSnapshotSeam.test.ts`

**Interfaces:**
- Consumes: `extractItemsForMigration` from `@project/database/src/itemsExtraction.js`; `projectEquipmentRows` and `EquipmentRuleRow` from `../ruleSnapshotProjection.js`. Deep imports into `@project/database` are how this repo already reaches its schema — see `ruleSnapshotCache.ts:2`.
- Produces: nothing. Tests only.

- [ ] **Step 1: Write the test file**

Create `apps/server/src/services/__tests__/ruleSnapshotSeam.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { extractItemsForMigration } from "@project/database/src/itemsExtraction.js";
import {
  projectEquipmentRows,
  type EquipmentRuleRow,
} from "../ruleSnapshotProjection.js";

const resolve = createRequire(import.meta.url).resolve;

/**
 * The real catalogue, not a fixture.
 *
 * Every other test on this seam stops at a hand-written literal, which is how
 * a missing versatileDamageDice survived three reviews: when the fixture is
 * wrong, the input and the expectation are wrong together and the test passes
 * anyway. Reading the shipped file is the only thing that catches that.
 */
const rawItems = JSON.parse(
  readFileSync(resolve("@project/database/data/items.json"), "utf-8"),
) as unknown[];

/**
 * The columns the seed writes, in the shape the cache selects them back out.
 * Mapping here rather than mocking Drizzle keeps the test pure while still
 * crossing the boundary that actually loses fields.
 */
const toRuleRows = (
  seedItems: ReturnType<typeof extractItemsForMigration>["seedItems"],
): EquipmentRuleRow[] =>
  seedItems.map((item) => ({
    id: item.id,
    name: item.name,
    weight: item.weight,
    itemRule: item.itemRule,
    weaponRule: item.weaponRule ?? null,
  }));

const project = () => {
  const extracted = extractItemsForMigration(rawItems);

  return {
    extracted,
    projection: projectEquipmentRows(toRuleRows(extracted.seedItems)),
  };
};

describe("the extractor and the rule snapshot projection agree", () => {
  it("carries every catalogue item through without a malformed row", () => {
    const { extracted, projection } = project();

    expect(projection.malformedItemIds).toEqual([]);
    expect(Object.keys(projection.equipmentById)).toHaveLength(
      extracted.seedItems.length,
    );
    // 64 unique ids across 65 entries: items.json has a known duplicate
    // item_ammo_bolt, which the extractor drops and reports
    expect(extracted.seedItems).toHaveLength(64);
  });

  it("keeps armour weight and its AC modifier across the whole path", () => {
    const plate = project().projection.equipmentById.item_armor_plate!;

    expect(plate.weight).toBe(65);
    expect(plate.modifiers).toContainEqual({
      target: "ARMOR_CLASS",
      type: "set_base",
      value: 18,
      scalingFactor: "none",
      requiredStates: [],
      forbiddenStates: [],
    });
  });

  it("keeps a versatile weapon's two-handed die", () => {
    // the exact field that went missing, asserted on real data this time
    const longsword = project().projection.weaponsById.item_weapon_longsword!;

    expect(longsword.versatileDamageDice).toBe("1d10");
    expect(longsword.damageDice).toBe("1d8");
  });

  it("keeps a fractional weight exact through the hundredths round trip", () => {
    // 0.05 lb -> 5 hundredths in the column -> 0.05 lb back out
    expect(project().projection.equipmentById.item_ammo_arrow!.weight).toBe(
      0.05,
    );
  });
});
```

Note what this test deliberately does **not** assert: `equipSlot` and `requiresAttunement` are absent from every projected item, because `items.json` has no such fields. That is a known gap and the subject of the catalogue reconciliation spec, not a bug in this path.

- [ ] **Step 2: Run the test to verify it passes**

```bash
pnpm --filter @project/server exec vitest run src/services/__tests__/ruleSnapshotSeam.test.ts
```

Expected: PASS, 4 tests.

If the module fails to resolve, check the two deep specifiers character by character — `@project/database/src/itemsExtraction.js` and `@project/database/data/items.json`. `@project/database` publishes no `exports` map, so both resolve through the workspace symlink.

- [ ] **Step 3: Run the whole server suite**

```bash
pnpm --filter @project/server exec vitest run 2>&1 | tail -5
```

Expected: `Test Files 14 passed (14)`, `Tests 193 passed (193)`.

- [ ] **Step 4: Confirm typecheck did not regress**

```bash
pnpm --filter @project/server typecheck 2>&1 | grep -c "error TS"
```

Expected: `37` or fewer. `createRequire` and `readFileSync` come from `node:` modules rather than globals, so the server's `"types": []` setting does not affect them; `import.meta.url` is available under `"module": "nodenext"`.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/__tests__/ruleSnapshotSeam.test.ts
git commit -m "test: cross the extractor and projection seam with the real catalogue"
```

---

## Final Verification

- [ ] **Run every suite against the baseline**

```bash
pnpm check:hygiene
```

Expected: clean. No build artefacts (`.js`, `.d.ts`) committed under any `src/`.

```bash
pnpm --filter @project/engine exec vitest run 2>&1 | tail -5
pnpm --filter @project/database exec vitest run 2>&1 | tail -5
pnpm --filter @project/server exec vitest run 2>&1 | tail -5
pnpm --filter @project/shared exec vitest run 2>&1 | tail -5
```

Expected:

| Package | Before | After |
| --- | --- | --- |
| engine | 27 files, 423 tests | 27 files, **437 tests**, all passing |
| database | 5 files, 54 tests | 5 files, **55 tests**, all passing |
| server | 13 files, 186 tests | 14 files, **193 tests**, all passing |
| shared | 11 failed / 158 | **unchanged: 11 failed / 158** |

Shared must be *exactly* unchanged. A 12th failure there is yours.

```bash
pnpm --filter @project/engine typecheck 2>&1 | grep -c "error TS"
pnpm --filter @project/database typecheck 2>&1 | grep -c "error TS"
pnpm --filter @project/server typecheck 2>&1 | grep -c "error TS"
```

Expected: `25`, `17`, `37` or fewer for each.

- [ ] **Confirm the git history reads as nine commits on `main`**

```bash
git log --oneline eec8a91..HEAD
```

Expected: nine commits, one per task, in task order.

## What this closes

From `2026-08-05-encumbrance-and-speed.md`:

- **#9** — the two-stage seam, now guarded at all five stage-one exits (Task 1) *and* enforced by a function boundary (Task 3). Fully closed, including the extraction the follow-up deferred to the web spec.
- **#10** — all four named gaps: the tier double-count (Task 2), the unknown-race fallbacks (Task 4), the untested `SPEED` modifier path (Task 5), and `itemsExtraction`'s unclamped rule payload (Task 6). Fully closed.

From `2026-08-06-rule-snapshot-lossless-projection.md`:

- **#1** — the all-rows-fail threshold (Task 7). Closed.
- **#2** — identity from the row (Task 8). Closed.
- **#4** — one integration test crossing the seam (Task 9). Closed.

## What this does not close, and why

1. **`apps/web` still runs its own drifted calculator path.** Out of scope by instruction. Encumbrance and speed will not appear in the UI until that migration happens, and it is its own spec.
2. **`heavily_encumbered` still imposes no disadvantage.** The state is emitted and nothing consumes it. `rollContextBuilder.ts` treats `has_disadvantage` as a UI toggle id and `ActionResolver` implements only `apply_effect`, so there is no roll layer for the consumer to land in. Blocked on that layer existing, not on this work.
3. **`EQUIPMENT_DICTIONARY` still holds 11 entries against 65 in the catalogue**, and `EQUIPMENT_RESOLUTION_MODE` stays pinned to `"static-only"`. Flipping it today would shadow the 11 curated entries with snapshot entries that have no `equipSlot` and no modifiers, so plate would stop granting AC — a slot problem, not a weight problem. This is the next spec: **EQUIPMENT_DICTIONARY becomes the authoritative rules source, `items.json` narrows to content (lore, cpCost, stacking), and the seed joins the two by id.** Two live bugs found while scoping it are deliberately left for that spec because they are fixed by deleting the code that holds them: `deriveItemModifiers` matches `acApplication === "add"` while `items.json` authors `"bonus"`, so the shield's +2 AC never reaches a seeded snapshot; and `armorProperties.dexModifier` is dropped entirely, so seeded medium and heavy armour carry no `maxDexCap`.
4. **`trait_powerful_build` is authored but ungranted.** No race in `RACE_DICTIONARY` is a Goliath. Content, not code.
5. **`StateExtractor` still has no real-data yield.** ASI levels compile no `trait_choice` node, so no state-bearing trait can be selected into a save. Goes live when ASI/feat selection is built.
6. **Coin weight is still untracked** — there is no currency field on `CharacterSave`. Excluded by decision.
7. **Bundles need no handling.** Investigated and closed: `isBundle` and `bundleContents` appear zero times in `items.json`. The packs are single rows carrying their aggregate weight — Explorer's Pack is one 59 lb row — which is already correct for encumbrance. The previous plan's follow-up #4 described a hazard that no data can reach.
8. **`@project/shared`'s 11 failing tests are untouched.** They are stale assertions against schemas that have since grown Zod defaults, and two reference a schema export that no longer exists. Genuinely easy, entirely unrelated, and worth its own small pass.
