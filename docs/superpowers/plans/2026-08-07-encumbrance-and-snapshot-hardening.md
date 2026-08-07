# Encumbrance and Snapshot Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the non-web follow-ups left by `2026-08-05-encumbrance-and-speed.md` and `2026-08-06-rule-snapshot-lossless-projection.md` — three real bugs, one structural invariant, and the test coverage that would have caught all four — then give the bundle and container rules real PHB data and an engine that can reason about them.

**Architecture:** Two phases. **Phase 1 (Tasks 1–9)** is nine changes across three packages, ordered *guard before change*: Task 1 pins all five stage-one calculators against the two-stage seam so Task 3 can restructure `buildLiveSheet` safely; Task 2 fixes the encumbrance tier reaching `SpeedEngine` through two channels, which is also what makes Task 3 a clean lift. Tasks 4–5 cover paths a mutation would silently survive; Tasks 6–9 are independent of the engine work and of each other. **Phase 2 (Tasks 10–15)** adds a container capacity to the item contract, authors the PHB containers and equipment packs, builds a pure `ContainerEngine`, and turns the four existing packs into real bundles so the acquisition path that already unpacks them finally has something to unpack.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Zod schemas in `@project/shared`, Vitest, pnpm workspaces + Turborepo, Drizzle ORM.

## Global Constraints

- **Work directly on `main`.** The user asked for this explicitly. Commit after every task; do not open a branch or a worktree.
- **Import specifiers end in `.js`** even when the source file is `.ts`. Every intra-package import in this repo follows this; a bare specifier will not resolve.
- **Comment style:** lowercase inline comments explaining *why*, matching the surrounding files. Do not add JSDoc to every member; match the density of the file being edited.
- **Do not modify `apps/web`.** Explicitly out of scope for this plan.
- **Phase 1 does not touch `EQUIPMENT_DICTIONARY`, `items.json`, or `EQUIPMENT_RESOLUTION_MODE`.** If a Task 1–9 step tempts you to add a catalogue entry, you have misread the task. Phase 2 does add catalogue entries, but only the ones its own tasks name.
- **`EQUIPMENT_RESOLUTION_MODE` stays `"static-only"` throughout.** Flipping it is the catalogue reconciliation spec's job and is not safe yet.
- **Weight is authored in pounds and summed in integer hundredths.** `EQUIPMENT_DICTIONARY` and `items.json` both keep readable pounds (`65`, `0.05`); every accumulation goes through `poundsToHundredths` first. This holds for container capacity too.
- **PHB fidelity is a requirement, not a preference.** Every item Phase 2 authors is from the Player's Handbook equipment tables, at its printed weight. Where the PHB states no weight for a pack line item, the plan says so explicitly and gives the table ruling being used — do not invent others.
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

**Phase 1 — create:**
- `apps/server/src/services/__tests__/ruleSnapshotSeam.test.ts` — the one test that crosses extractor → row → projection with real catalogue data.

**Phase 1 — modify:**
- `packages/engine/src/pipeline/characterEngine.ts` — the `SpeedEngine` call site (Task 2), then the stage-one extraction (Task 3).
- `packages/engine/src/pipeline/__tests__/characterEngine.test.ts` — the seam guard (Task 1), the double-count tests (Task 2), the fallback and `SPEED` integration tests (Tasks 4–5).
- `packages/database/src/itemsExtraction.ts` — negative weight clamp (Task 6).
- `packages/database/src/__tests__/itemsExtraction.test.ts` — cover it.
- `apps/server/src/services/ruleSnapshotProjection.ts` — all-rows-fail threshold (Task 7), identity from the row (Task 8).
- `apps/server/src/services/__tests__/ruleSnapshotProjection.test.ts` — cover both.

**Phase 2 — create:**
- `packages/engine/src/calculators/containers.ts` — `ContainerEngine`, one responsibility: what is inside each container and whether it fits.
- `packages/engine/src/calculators/__tests__/containers.test.ts`
- `packages/engine/src/rules/__tests__/containerDictionary.test.ts` — the authored PHB containers.
- `apps/server/src/utils/__tests__/bundleExpansion.test.ts` — the real catalogue driving the acquisition path.

**Phase 2 — modify:**
- `packages/shared/src/schemas/items.ts` — `ContainerCapacitySchema`, `ItemDefinition.container`, `InventoryInstance.containerId`.
- `packages/shared/src/schemas/equipment.ts` — `EquipmentDefinition.container`.
- `packages/shared/src/schemas/__tests__/equipment.test.ts` — cover the round trip.
- `packages/engine/src/rules/equipmentDictionary.ts` — `toItemDefinition` carries `container`; five authored PHB containers.
- `packages/engine/src/pipeline/characterEngine.ts` — the container report on the live sheet.
- `packages/engine/src/pipeline/__tests__/characterEngine.test.ts` — cover it.
- `packages/engine/src/index.ts` — export `ContainerEngine`.
- `packages/database/data/items.json` — 28 new PHB gear entries, four packs become bundles.
- `packages/database/src/__tests__/itemsExtraction.test.ts` — the pack weight self-check.

Nothing is deleted. `containers.ts` is a new file rather than an addition to `weight.ts` because the two answer different questions — `weight.ts` totals what a character carries, `containers.ts` partitions it — and `weight.ts` is already the unit `encumbrance.ts` depends on.

---

## Phase 1 — Hardening (Tasks 1–9)

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

## Phase 2 — Bundles and containers (Tasks 10–15)

### What is already built, and what is actually missing

Read this before starting Task 10. The previous plan's follow-up #4 said "the acquisition path must expand packs into individual rows," which reads as missing logic. It is not.

**The bundle logic exists and is correct.** [`resolveItemPayload`](apps/server/src/utils/inventory.ts:15) recursively resolves an item or bundle into flat rows, handles bundles containing bundles, and `processStartingEquipment` aggregates duplicates before one batch insert. The `bundle_contents` table exists, `extractItemsForMigration` already emits `ExtractedBundleContent[]`, the seed already inserts them, and `apps/server/src/utils/__tests__/inventory.test.ts` already covers nested expansion against a mocked database.

**What is missing is data.** No item in `items.json` sets `isBundle`, so `bundle_contents` is empty and that machinery never runs on real content. The four equipment packs are opaque single rows carrying an aggregate weight. Phase 2 authors the contents.

**Containers have no containment model, and that is deliberate.** `characterInventory` declares `primaryKey({ columns: [characterId, itemId] })` — one row per item per character — so a character cannot hold two stacks of the same item in two places, and nothing can be *inside* anything at the persistence layer. Phase 2 therefore adds `containerId` to the shared `InventoryInstance` contract and builds a fully tested pure `ContainerEngine` against it, **without a database migration**. The engine becomes correct and provable; wiring it to storage lands with the web migration, which is where the socket payloads change anyway. This is a deliberate authored-ahead-of-consumer channel, listed as such in "What this does not close".

**Only pound capacities are modelled.** The PHB states a pounds-of-gear capacity for the backpack, basket, chest, pouch and sack. Barrels and buckets state gallons; quivers and cases state item counts. Volume and count are different axes needing different data and different rules, and neither is a weight limit — they are named as out of scope rather than approximated.

---

### Task 10: A container capacity on the item contract

`EquipmentDefinition` is the authored source `ItemDefinition` is projected from, and `packages/shared/src/schemas/__tests__/equipment.test.ts` already asserts they stay exact complements — `[...itemKeys, "weapon"].sort()` must equal `equipmentKeys`. That test is why this task adds `container` to *both* schemas in one commit: adding it to one fails that assertion loudly, which is exactly the guard the previous plan's `versatileDamageDice` bug went missing for want of.

**Files:**
- Modify: `packages/shared/src/schemas/items.ts` — `ContainerCapacitySchema`, `ItemDefinitionSchema.container`, `InventoryInstanceSchema.containerId`
- Modify: `packages/shared/src/schemas/equipment.ts` — `EquipmentDefinitionSchema.container`
- Modify: `packages/shared/src/schemas/__tests__/equipment.test.ts` — one round-trip test
- Modify: `packages/engine/src/rules/equipmentDictionary.ts` — `toItemDefinition` carries `container`
- Modify: `packages/engine/src/rules/__tests__/equipmentDictionary.test.ts` — cover the projection

**Interfaces:**
- Consumes: nothing new.
- Produces: `ContainerCapacitySchema` and `type ContainerCapacity = { capacityPounds: number }`, both exported from `@project/shared`; `ItemDefinition.container?: ContainerCapacity`; `EquipmentDefinition.container?: ContainerCapacity`; `InventoryInstance.containerId?: string`. Tasks 11–13 depend on all four names exactly as written.

- [ ] **Step 1: Write the failing test**

In `packages/shared/src/schemas/__tests__/equipment.test.ts`, append this describe block to the end of the file:

```ts
describe("a container carries its capacity through both shapes", () => {
  it("round-trips a pounds-of-gear capacity", () => {
    // both schemas are strict, so an unrecognised `container` key throws here
    // rather than being quietly dropped - which is the failure mode this
    // whole complementary-schema pairing exists to prevent
    const equipment = EquipmentDefinitionSchema.parse({
      id: "item_backpack",
      name: "Backpack",
      type: "gear",
      weight: 5,
      container: { capacityPounds: 30 },
    });

    expect(equipment.container).toEqual({ capacityPounds: 30 });

    const item = ItemDefinitionSchema.parse({
      id: "item_backpack",
      name: "Backpack",
      type: "gear",
      weight: 5,
      container: { capacityPounds: 30 },
    });

    expect(item.container).toEqual({ capacityPounds: 30 });
  });

  it("leaves container absent on an item that is not one", () => {
    const item = ItemDefinitionSchema.parse({
      id: "item_weapon_dagger",
      name: "Dagger",
      type: "weapon",
      weight: 1,
    });

    expect(item.container).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @project/shared exec vitest run src/schemas/__tests__/equipment.test.ts
```

Expected: FAIL — `Unrecognized key: "container"` from both strict schemas.

Note that `pnpm --filter @project/shared exec vitest` exits non-zero because of the 11 pre-existing failures elsewhere in the package. Read the reported results, not the exit code.

- [ ] **Step 3: Add the schema to `items.ts`**

In `packages/shared/src/schemas/items.ts`, insert before `export const ItemDefinitionSchema`:

```ts
/**
 * How much a container holds.
 *
 * Pounds only. The PHB gives a backpack "1 cubic foot / 30 pounds of gear",
 * a barrel "40 gallons", and a quiver "20 arrows" - three different axes, of
 * which only the first is a weight limit. Volume and item count need their own
 * data and their own rules, so they are absent rather than approximated.
 */
export const ContainerCapacitySchema = z
  .object({
    capacityPounds: z.number(),
  })
  .strict();
```

Then add the field to `ItemDefinitionSchema`, after `ammoTag`:

```ts
  // present only on items that hold other items
  container: ContainerCapacitySchema.optional(),
```

And add `containerId` to `InventoryInstanceSchema`, after `slot`:

```ts
  /**
   * The inventory row id of the container this stack is inside, when it is.
   *
   * Optional because most rows are loose in the pack, and because nothing
   * persists it yet: character_inventory keys on (characterId, itemId), so two
   * stacks of the same item cannot exist and real containment needs a
   * migration. ContainerEngine is built and tested against this field so the
   * rule is settled before the storage change lands.
   */
  containerId: z.string().optional(),
```

Finally add the type export beside the others at the bottom of the file:

```ts
export type ContainerCapacity = z.infer<typeof ContainerCapacitySchema>;
```

- [ ] **Step 4: Add the field to `equipment.ts`**

In `packages/shared/src/schemas/equipment.ts`, add the import to the existing `./items.js` import line:

```ts
import { ContainerCapacitySchema, EquipSlotSchema } from "./items.js";
```

Then add the field to `EquipmentDefinitionSchema`, after `ammoTag`:

```ts
    container: ContainerCapacitySchema.optional(),
```

- [ ] **Step 5: Run the shared suite**

```bash
pnpm --filter @project/shared exec vitest run 2>&1 | tail -5
```

Expected: `Tests 149 passed | 11 failed (160)` — the two new tests pass, the pre-existing 11 failures are unchanged, and `"ItemDefinition and EquipmentDefinition stay complementary"` still passes because the field was added to both. If that complementary test is the one failing, you added `container` to only one schema.

- [ ] **Step 6: Write the failing projection test**

In `packages/engine/src/rules/__tests__/equipmentDictionary.test.ts`, append to the end of the file:

```ts
describe("toItemDefinition and container capacity", () => {
  it("carries a container's capacity into the item projection", () => {
    // toItemDefinition enumerates fields rather than spreading, so a new one
    // on EquipmentDefinition does not arrive here on its own
    const item = toItemDefinition({
      id: "item_backpack",
      name: "Backpack",
      type: "gear",
      weight: 5,
      requiresAttunement: false,
      container: { capacityPounds: 30 },
    });

    expect(item.container).toEqual({ capacityPounds: 30 });
  });

  it("leaves container off an item that has none", () => {
    // absent rather than undefined, matching how equipSlot and ammoTag are
    // handled - the dictionary tests assert exact object shapes
    const item = toItemDefinition({
      id: "item_weapon_dagger",
      name: "Dagger",
      type: "weapon",
      weight: 1,
      requiresAttunement: false,
    });

    expect("container" in item).toBe(false);
  });
});
```

If `toItemDefinition` is not already imported at the top of that file, add it:

```ts
import { toItemDefinition } from "../equipmentDictionary.js";
```

- [ ] **Step 7: Run it to verify it fails**

```bash
pnpm --filter @project/engine exec vitest run src/rules/__tests__/equipmentDictionary.test.ts -t "container's capacity"
```

Expected: FAIL — `expected undefined to deeply equal { capacityPounds: 30 }`.

- [ ] **Step 8: Carry `container` through the projection**

In `packages/engine/src/rules/equipmentDictionary.ts`, add one line to `toItemDefinition`'s `base` literal, after the `ammoTag` spread:

```ts
    ...(equipment.container && { container: equipment.container }),
```

- [ ] **Step 9: Run the engine suite**

```bash
pnpm --filter @project/engine exec vitest run 2>&1 | tail -5
```

Expected: `Test Files 27 passed (27)`, `Tests 439 passed (439)` — 437 after Phase 1, plus two.

- [ ] **Step 10: Confirm typechecks did not regress**

```bash
pnpm --filter @project/shared typecheck 2>&1 | grep -c "error TS"
pnpm --filter @project/engine typecheck 2>&1 | grep -c "error TS"
```

Expected: `4` and `25` or fewer.

- [ ] **Step 11: Commit**

```bash
git add packages/shared/src/schemas/items.ts packages/shared/src/schemas/equipment.ts packages/shared/src/schemas/__tests__/equipment.test.ts packages/engine/src/rules/equipmentDictionary.ts packages/engine/src/rules/__tests__/equipmentDictionary.test.ts
git commit -m "feat: give items a container capacity and inventory rows a container id"
```

---

### Task 11: Author the PHB containers

Five containers, chosen because the PHB Adventuring Gear table states a **pounds-of-gear capacity** for exactly these. They go in `EQUIPMENT_DICTIONARY` because `EQUIPMENT_RESOLUTION_MODE` is `"static-only"`, so that dictionary is the only thing `resolveItemDefinition` reads — a container authored solely in `items.json` would be invisible to `ContainerEngine`.

| id | Name | Weight (lb) | Capacity (lb) | PHB capacity text |
| --- | --- | --- | --- | --- |
| `item_backpack` | Backpack | 5 | 30 | 1 cubic foot/30 pounds of gear |
| `item_sack` | Sack | 0.5 | 30 | 1 cubic foot/30 pounds of gear |
| `item_pouch` | Pouch | 1 | 6 | 1/5 cubic foot/6 pounds of gear |
| `item_basket` | Basket | 2 | 40 | 2 cubic feet/40 pounds of gear |
| `item_chest` | Chest | 25 | 300 | 12 cubic feet/300 pounds of gear |

`item_backpack` already exists in `items.json` at 5 lb; the other four do not exist anywhere yet and are added to `items.json` in Task 14. Authoring them here first is deliberate — `ContainerEngine` in Task 12 needs something to resolve.

**Files:**
- Modify: `packages/engine/src/rules/equipmentDictionary.ts` — five entries
- Create: `packages/engine/src/rules/__tests__/containerDictionary.test.ts`

**Interfaces:**
- Consumes: `EquipmentDefinition.container` from Task 10.
- Produces: the ids `item_backpack`, `item_sack`, `item_pouch`, `item_basket`, `item_chest` in `EQUIPMENT_DICTIONARY`, each with `container.capacityPounds`. Tasks 12–13 use `item_backpack` and `item_pouch` by name in their tests.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/rules/__tests__/containerDictionary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EQUIPMENT_DICTIONARY } from "../equipmentDictionary.js";
import { resolveItemDefinition } from "../ruleLookup.js";

/**
 * The PHB states a pounds-of-gear capacity for exactly these five. Barrels and
 * buckets are measured in gallons and quivers in arrows, which are different
 * axes, not weight limits - they are deliberately absent.
 */
const PHB_CONTAINERS: Array<{
  id: string;
  name: string;
  weight: number;
  capacityPounds: number;
}> = [
  { id: "item_backpack", name: "Backpack", weight: 5, capacityPounds: 30 },
  { id: "item_sack", name: "Sack", weight: 0.5, capacityPounds: 30 },
  { id: "item_pouch", name: "Pouch", weight: 1, capacityPounds: 6 },
  { id: "item_basket", name: "Basket", weight: 2, capacityPounds: 40 },
  { id: "item_chest", name: "Chest", weight: 25, capacityPounds: 300 },
];

describe("the authored PHB containers", () => {
  for (const { id, name, weight, capacityPounds } of PHB_CONTAINERS) {
    it(`authors ${name} at its printed weight and capacity`, () => {
      const equipment = EQUIPMENT_DICTIONARY[id];

      expect(equipment).toBeDefined();
      expect(equipment!.name).toBe(name);
      expect(equipment!.weight).toBe(weight);
      expect(equipment!.container).toEqual({ capacityPounds });
    });

    it(`resolves ${name}'s capacity through the lookup the engine uses`, () => {
      // EQUIPMENT_RESOLUTION_MODE is "static-only", so this is the only path
      // ContainerEngine has to a capacity. asserting the dictionary alone
      // would not prove the projection carries it
      expect(resolveItemDefinition(id)?.container).toEqual({ capacityPounds });
    });
  }

  it("gives a non-container no capacity at all", () => {
    expect(resolveItemDefinition("item_weapon_dagger")?.container).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @project/engine exec vitest run src/rules/__tests__/containerDictionary.test.ts
```

Expected: FAIL — ten failures on `expected undefined to be defined`, one pass on the non-container case.

- [ ] **Step 3: Author the five entries**

In `packages/engine/src/rules/equipmentDictionary.ts`, insert these into the `EQUIPMENT_DICTIONARY` literal immediately after the `item_ammo_arrow_plus_one` entry, which is the last one in the object:

```ts
  // PHB containers. capacity is pounds of gear only: the book also gives each
  // a volume, and gives quivers and cases an item count instead, but neither
  // is a weight limit and neither has a rule here yet
  item_backpack: {
    id: "item_backpack",
    name: "Backpack",
    type: "gear",
    weight: 5,
    requiresAttunement: false,
    container: { capacityPounds: 30 },
  },

  item_sack: {
    id: "item_sack",
    name: "Sack",
    type: "gear",
    // the PHB prints 1/2 lb. authored as the decimal because weight is summed
    // in hundredths, so this is exactly 50 and never a rounding argument
    weight: 0.5,
    requiresAttunement: false,
    container: { capacityPounds: 30 },
  },

  item_pouch: {
    id: "item_pouch",
    name: "Pouch",
    type: "gear",
    weight: 1,
    requiresAttunement: false,
    container: { capacityPounds: 6 },
  },

  item_basket: {
    id: "item_basket",
    name: "Basket",
    type: "gear",
    weight: 2,
    requiresAttunement: false,
    container: { capacityPounds: 40 },
  },

  item_chest: {
    id: "item_chest",
    name: "Chest",
    type: "gear",
    weight: 25,
    requiresAttunement: false,
    container: { capacityPounds: 300 },
  },
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @project/engine exec vitest run src/rules/__tests__/containerDictionary.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Run the engine suite**

```bash
pnpm --filter @project/engine exec vitest run 2>&1 | tail -5
```

Expected: `Test Files 28 passed (28)`, `Tests 450 passed (450)` — 439 plus 11.

Watch for a failure in `src/rules/__tests__/equipmentDictionary.test.ts`: if it asserts the dictionary's exact key count or a snapshot of its ids, five new entries will break it. Update that expectation to match rather than removing the entries.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/rules/equipmentDictionary.ts packages/engine/src/rules/__tests__/containerDictionary.test.ts
git commit -m "feat: author the five PHB containers that state a pound capacity"
```

---

### Task 12: ContainerEngine

What is inside each container, and does it fit. Pure, like every other calculator: inventory in, report out, no store and no mutation.

Three rules worth stating before the code, because each is a decision rather than an obvious consequence:

1. **A container does not carry itself.** A backpack's 5 lb is part of what the *character* carries, never part of the 30 lb the backpack holds.
2. **Direct children only.** A pouch inside a backpack contributes its own 1 lb to the backpack, not the 6 lb of coins inside the pouch. Summing the subtree is more correct and needs cycle detection; the one-level rule is a deliberate YAGNI call, named in "What this does not close".
3. **Nothing is enforced.** The report says a container is overloaded. It does not stop it, because 5e has no rule that does — the DM does.

**Files:**
- Create: `packages/engine/src/calculators/containers.ts`
- Create: `packages/engine/src/calculators/__tests__/containers.test.ts`
- Modify: `packages/engine/src/index.ts` — export it

**Interfaces:**
- Consumes: `resolveItemDefinition`, `RuleSnapshotLookup` from `../rules/ruleLookup.js`; `poundsToHundredths` from `./weight.js`; `InventoryInstance` from `@project/shared`.
- Produces: `interface ContainerLoad { instanceId: string; itemId: string; name: string; capacityHundredths: number; carriedHundredths: number; isOverloaded: boolean }`; `interface ContainerReport { containers: ContainerLoad[]; unplacedInstanceIds: string[] }`; `ContainerEngine.report(items: InventoryInstance[], snapshot?: RuleSnapshotLookup): ContainerReport`. Task 13 consumes `ContainerReport` by that exact name.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/calculators/__tests__/containers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { InventoryInstance } from "@project/shared";
import { ContainerEngine } from "../containers.js";
import { poundsToHundredths } from "../weight.js";

const row = (
  overrides: Partial<InventoryInstance> & Pick<InventoryInstance, "id" | "itemId">,
): InventoryInstance => ({
  quantity: 1,
  slot: "backpack",
  isAttuned: false,
  ...overrides,
});

/** A backpack holds 30 lb; plate armour weighs 65; a dagger weighs 1. */
const backpack = () => row({ id: "inv_pack", itemId: "item_backpack" });

describe("ContainerEngine.report", () => {
  it("reports nothing for an empty inventory", () => {
    expect(ContainerEngine.report([])).toEqual({
      containers: [],
      unplacedInstanceIds: [],
    });
  });

  it("reports an empty container at its authored capacity", () => {
    const report = ContainerEngine.report([backpack()]);

    expect(report.containers).toHaveLength(1);
    expect(report.containers[0]).toEqual({
      instanceId: "inv_pack",
      itemId: "item_backpack",
      name: "Backpack",
      capacityHundredths: poundsToHundredths(30),
      carriedHundredths: 0,
      isOverloaded: false,
    });
  });

  it("does not count a container's own weight against itself", () => {
    // the backpack's 5 lb is what the character carries, not what the backpack
    // holds. counting it would make every container start 5 lb down
    const report = ContainerEngine.report([backpack()]);

    expect(report.containers[0]!.carriedHundredths).toBe(0);
  });

  it("counts what is inside it", () => {
    const report = ContainerEngine.report([
      backpack(),
      row({ id: "inv_dagger", itemId: "item_weapon_dagger", containerId: "inv_pack" }),
    ]);

    expect(report.containers[0]!.carriedHundredths).toBe(poundsToHundredths(1));
    expect(report.containers[0]!.isOverloaded).toBe(false);
  });

  it("scales by the quantity in the stack", () => {
    const report = ContainerEngine.report([
      backpack(),
      row({
        id: "inv_arrows",
        itemId: "item_ammo_arrow",
        quantity: 20,
        containerId: "inv_pack",
      }),
    ]);

    // 20 arrows at 0.05 lb, asserted in hundredths so a float implementation
    // cannot launder its own error away
    expect(report.containers[0]!.carriedHundredths).toBe(100);
  });

  it("flags a container carrying more than it holds", () => {
    const report = ContainerEngine.report([
      backpack(),
      row({ id: "inv_plate", itemId: "item_armor_plate", containerId: "inv_pack" }),
    ]);

    expect(report.containers[0]!.carriedHundredths).toBe(poundsToHundredths(65));
    expect(report.containers[0]!.isOverloaded).toBe(true);
  });

  it("treats exactly full as not overloaded", () => {
    // the rule is "holds 30 pounds of gear", so 30 lb on the nose fits. without
    // this a >= regression passes every other test in this file
    const report = ContainerEngine.report([
      backpack(),
      row({
        id: "inv_daggers",
        itemId: "item_weapon_dagger",
        quantity: 30,
        containerId: "inv_pack",
      }),
    ]);

    expect(report.containers[0]!.carriedHundredths).toBe(poundsToHundredths(30));
    expect(report.containers[0]!.isOverloaded).toBe(false);
  });

  it("counts a nested container's own weight but not its contents", () => {
    // a deliberate one-level rule: summing the subtree is more correct and
    // needs cycle detection, and no 5e rule turns on the difference
    const report = ContainerEngine.report([
      backpack(),
      row({ id: "inv_pouch", itemId: "item_pouch", containerId: "inv_pack" }),
      row({
        id: "inv_dagger",
        itemId: "item_weapon_dagger",
        containerId: "inv_pouch",
      }),
    ]);

    const outer = report.containers.find((c) => c.instanceId === "inv_pack")!;
    const inner = report.containers.find((c) => c.instanceId === "inv_pouch")!;

    expect(outer.carriedHundredths).toBe(poundsToHundredths(1)); // the pouch
    expect(inner.carriedHundredths).toBe(poundsToHundredths(1)); // the dagger
  });

  it("reports a row pointing at a container that is not carried", () => {
    const report = ContainerEngine.report([
      row({ id: "inv_dagger", itemId: "item_weapon_dagger", containerId: "inv_gone" }),
    ]);

    expect(report.containers).toEqual([]);
    expect(report.unplacedInstanceIds).toEqual(["inv_dagger"]);
  });

  it("reports a row pointing at something that is not a container", () => {
    const report = ContainerEngine.report([
      row({ id: "inv_sword", itemId: "item_weapon_longsword" }),
      row({ id: "inv_dagger", itemId: "item_weapon_dagger", containerId: "inv_sword" }),
    ]);

    expect(report.unplacedInstanceIds).toEqual(["inv_dagger"]);
  });

  it("reports a row that claims to be inside itself", () => {
    const report = ContainerEngine.report([
      row({ id: "inv_pack", itemId: "item_backpack", containerId: "inv_pack" }),
    ]);

    // the container is still reported, it just holds nothing - a self-reference
    // is bad data, not a reason to drop the row
    expect(report.containers[0]!.carriedHundredths).toBe(0);
    expect(report.unplacedInstanceIds).toEqual(["inv_pack"]);
  });

  it("ignores an item with no rule behind it", () => {
    // a save outlives the homebrew pack that authored its contents
    const report = ContainerEngine.report([
      backpack(),
      row({ id: "inv_ghost", itemId: "item_homebrew_gone", containerId: "inv_pack" }),
    ]);

    expect(report.containers[0]!.carriedHundredths).toBe(0);
    expect(report.unplacedInstanceIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @project/engine exec vitest run src/calculators/__tests__/containers.test.ts
```

Expected: FAIL — `Failed to resolve import "../containers.js"`.

- [ ] **Step 3: Write the calculator**

Create `packages/engine/src/calculators/containers.ts`:

```ts
import type { InventoryInstance } from "@project/shared";
import {
  resolveItemDefinition,
  type RuleSnapshotLookup,
} from "../rules/ruleLookup.js";
import { poundsToHundredths } from "./weight.js";

/** One container the character is carrying, and how full it is. */
export interface ContainerLoad {
  /** The inventory row id of the container itself. */
  instanceId: string;
  itemId: string;
  name: string;
  /** From the item's authored container.capacityPounds. */
  capacityHundredths: number;
  carriedHundredths: number;
  isOverloaded: boolean;
}

export interface ContainerReport {
  containers: ContainerLoad[];
  /**
   * Rows naming a containerId that resolves to nothing usable - a container
   * the character no longer carries, an item that is not a container, or the
   * row itself. Reported rather than dropped: the weight still counts against
   * the character, it is only the placement that is wrong.
   */
  unplacedInstanceIds: string[];
}

/**
 * Partitions a character's inventory across the containers they carry.
 *
 * Deliberately separate from InventoryWeightCalculator, which answers a
 * different question: that one totals everything regardless of where it sits,
 * because 5e counts a worn breastplate and a packed one identically. This one
 * only cares where things sit, and never changes the total.
 *
 * Nothing here is enforced. A container over capacity is reported so a UI can
 * say so; no 5e rule stops a player overfilling a sack, so neither does this.
 */
export class ContainerEngine {
  public static report(
    items: InventoryInstance[],
    snapshot?: RuleSnapshotLookup,
  ): ContainerReport {
    const loads = new Map<string, ContainerLoad>();

    // pass one: every row that is itself a container. done first so pass two
    // can tell an unknown parent from one that appears later in the list
    for (const instance of items) {
      const definition = resolveItemDefinition(instance.itemId, snapshot);
      if (!definition?.container) continue;

      loads.set(instance.id, {
        instanceId: instance.id,
        itemId: instance.itemId,
        name: definition.name,
        capacityHundredths: poundsToHundredths(
          definition.container.capacityPounds,
        ),
        carriedHundredths: 0,
        isOverloaded: false,
      });
    }

    // pass two: place everything that claims a parent
    const unplacedInstanceIds: string[] = [];

    for (const instance of items) {
      if (!instance.containerId) continue;

      // a row cannot be inside itself. bad data rather than a cycle worth
      // detecting, because containment is one level deep by decision
      const parent =
        instance.containerId === instance.id
          ? undefined
          : loads.get(instance.containerId);

      if (!parent) {
        unplacedInstanceIds.push(instance.id);
        continue;
      }

      const definition = resolveItemDefinition(instance.itemId, snapshot);
      // an item with no rule behind it contributes nothing rather than
      // throwing - InventoryExtractor already owns reporting unknown ids
      if (!definition) continue;

      // a nested container contributes its own weight, not its contents':
      // one level deep, so no cycle can form and no recursion is needed
      parent.carriedHundredths +=
        poundsToHundredths(definition.weight) * instance.quantity;
    }

    for (const load of loads.values()) {
      load.isOverloaded = load.carriedHundredths > load.capacityHundredths;
    }

    return { containers: Array.from(loads.values()), unplacedInstanceIds };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @project/engine exec vitest run src/calculators/__tests__/containers.test.ts
```

Expected: PASS, 12 tests.

- [ ] **Step 5: Export it**

In `packages/engine/src/index.ts`, add alongside the other calculator exports:

```ts
export * from "./calculators/containers.js";
```

If that file re-exports calculators through an intermediate barrel rather than directly, follow whichever pattern `speed.js` and `weight.js` already use in it.

- [ ] **Step 6: Run the engine suite**

```bash
pnpm --filter @project/engine exec vitest run 2>&1 | tail -5
```

Expected: `Test Files 29 passed (29)`, `Tests 462 passed (462)` — 450 plus 12.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/calculators/containers.ts packages/engine/src/calculators/__tests__/containers.test.ts packages/engine/src/index.ts
git commit -m "feat: add ContainerEngine reporting per-container load against capacity"
```

---

### Task 13: Put the container report on the live sheet

`ContainerEngine` reads inventory and nothing else — no ability score, no state. It could sit in stage one, but it belongs beside encumbrance in the load region because that is where every other question about what a character is carrying is answered, and grouping them keeps the two-stage seam legible.

**Files:**
- Modify: `packages/engine/src/pipeline/characterEngine.ts` — one import, one field on `LiveCharacterSheet`, one call, one line in the returned object
- Modify: `packages/engine/src/pipeline/__tests__/characterEngine.test.ts` — one describe block

**Interfaces:**
- Consumes: `ContainerEngine.report` and `ContainerReport` from Task 12.
- Produces: `LiveCharacterSheet.containers: ContainerReport`.

- [ ] **Step 1: Write the failing test**

In `packages/engine/src/pipeline/__tests__/characterEngine.test.ts`, append to the end of the file:

```ts
describe("CharacterEngine.buildLiveSheet: containers", () => {
  it("reports no containers for a character carrying none", () => {
    const sheet = buildSheet(halfElfFighter(), [carried("item_armor_plate")]);

    expect(sheet.containers.containers).toEqual([]);
    expect(sheet.containers.unplacedInstanceIds).toEqual([]);
  });

  it("reports a backpack and what is inside it", () => {
    const sheet = buildSheet(halfElfFighter(), [
      { ...carried("item_backpack"), id: "inv_pack" },
      { ...carried("item_weapon_dagger"), containerId: "inv_pack" },
    ]);

    expect(sheet.containers.containers).toHaveLength(1);
    expect(sheet.containers.containers[0]!.carriedHundredths).toBe(100);
    expect(sheet.containers.containers[0]!.isOverloaded).toBe(false);
  });

  it("leaves the carried total alone when items are inside a container", () => {
    // the container report partitions weight, it never changes it: a dagger
    // in a backpack weighs exactly what a dagger in a fist weighs
    const loose = buildSheet(halfElfFighter(), [
      { ...carried("item_backpack"), id: "inv_pack" },
      carried("item_weapon_dagger"),
    ]);
    const packed = buildSheet(halfElfFighter(), [
      { ...carried("item_backpack"), id: "inv_pack" },
      { ...carried("item_weapon_dagger"), containerId: "inv_pack" },
    ]);

    expect(packed.encumbrance.totalWeight).toBe(loose.encumbrance.totalWeight);
    expect(packed.encumbrance.totalWeight).toBe(6); // backpack 5 + dagger 1
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @project/engine exec vitest run src/pipeline/__tests__/characterEngine.test.ts -t "containers"
```

Expected: FAIL — `Cannot read properties of undefined (reading 'containers')`, because `LiveCharacterSheet` has no such field yet.

- [ ] **Step 3: Wire it in**

In `packages/engine/src/pipeline/characterEngine.ts`, add the import beside the other calculator imports:

```ts
import {
  ContainerEngine,
  type ContainerReport,
} from "../calculators/containers.js";
```

Add the field to `LiveCharacterSheet`, immediately after `encumbrance`:

```ts
  /**
   * What sits in each container the character carries, and whether it fits.
   * Partitions the same weight `encumbrance` totals; it never changes it.
   */
  containers: ContainerReport;
```

In the `region Load (stage two)` block, add this immediately after the `EncumbranceEngine.calculate` call:

```ts
    // reads inventory and nothing else, so it has no stake in the two-stage
    // seam - it sits here because this is where carrying is reasoned about
    const containers = ContainerEngine.report(inventory, options.snapshot);
```

And add `containers,` to the returned object, immediately after `encumbrance,`.

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @project/engine exec vitest run src/pipeline/__tests__/characterEngine.test.ts
```

Expected: PASS, 51 tests in the file.

- [ ] **Step 5: Run the engine suite and typecheck**

```bash
pnpm --filter @project/engine exec vitest run 2>&1 | tail -5
```

Expected: `Test Files 29 passed (29)`, `Tests 465 passed (465)`.

```bash
pnpm --filter @project/engine typecheck 2>&1 | grep -c "error TS"
```

Expected: `25` or fewer.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/pipeline/characterEngine.ts packages/engine/src/pipeline/__tests__/characterEngine.test.ts
git commit -m "feat: report container load on the live sheet"
```

---

### Task 14: Author the PHB gear the equipment packs contain

The four packs in `items.json` are opaque rows carrying an aggregate weight. Turning them into bundles (Task 15) needs their contents to exist as items first, and most do not: of the ~30 line items across the four packs, only `item_backpack` and `item_torch` are in the catalogue.

This task adds 28 entries to `items.json`. All weights are the PHB Adventuring Gear, Tools and Clothing table values.

**Files:**
- Modify: `packages/database/data/items.json`
- Modify: `packages/database/src/__tests__/itemsExtraction.test.ts` — one test

**Interfaces:**
- Consumes: nothing. `items.json` is data, and `extractItemsForMigration` already handles every field used here.
- Produces: the 28 ids below, available to Task 15's `bundleContents`.

- [ ] **Step 1: Write the failing test**

In `packages/database/src/__tests__/itemsExtraction.test.ts`, append inside the existing `describe("extractItemsForMigration", ...)` block, before its closing `});`:

```ts
  it("carries every pack line item in the catalogue at its PHB weight", () => {
    // the equipment packs cannot become bundles until their contents exist as
    // items, and a wrong weight here silently changes what a character carries
    const itemsPath = path.resolve(__dirname, "../../data/items.json");
    const result = extractItemsForMigration(
      JSON.parse(readFileSync(itemsPath, "utf-8")),
    );

    const expected: Record<string, number> = {
      item_bedroll: 7,
      item_mess_kit: 1,
      item_tinderbox: 1,
      item_rations: 2,
      item_waterskin: 5,
      item_rope_hempen: 10,
      item_chest: 25,
      item_case_map_or_scroll: 1,
      item_clothes_fine: 6,
      item_ink: 0,
      item_ink_pen: 0,
      item_lamp: 1,
      item_oil_flask: 1,
      item_paper: 0,
      item_perfume: 0,
      item_sealing_wax: 0,
      item_soap: 0,
      item_blanket: 3,
      item_candle: 0,
      item_alms_box: 1,
      item_incense: 0,
      item_censer: 1,
      item_vestments: 4,
      item_clothes_costume: 4,
      item_disguise_kit: 3,
      item_sack: 0.5,
      item_pouch: 1,
      item_basket: 2,
    };

    for (const [id, weight] of Object.entries(expected)) {
      expect(result.itemRulesById[id]?.weight, id).toBe(weight);
    }
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @project/database exec vitest run src/__tests__/itemsExtraction.test.ts -t "pack line item"
```

Expected: FAIL — `expected undefined to be 7` on `item_bedroll`, the first missing id.

- [ ] **Step 3: Add the 28 entries**

Every entry follows this exact shape. This is the template for `item_bedroll`, written in full:

```json
  {
    "id": "item_bedroll",
    "name": "Bedroll",
    "type": "gear",
    "weight": 7,
    "stacking": { "mode": "instance" },
    "lore": {
      "shortDescription": "A padded roll of bedding for sleeping rough.",
      "fullText": "A padded roll of bedding for sleeping rough. Carried strapped to a pack and unrolled at camp."
    },
    "cpCost": 100
  },
```

Add all 28 to the array in `packages/database/data/items.json`, each following that template exactly, substituting the values from this table. Every one of the 28 uses `"type": "gear"` — `normalizeItemType` maps anything that is not armour, a weapon or a consumable to gear anyway, so a "tool" type would change nothing but would disagree with the projection. `cpCost` is in copper pieces, matching how the existing entries store price. Where the table says `stack`, use `{ "mode": "stack", "bundleSize": <n> }`; where it says `instance`, use `{ "mode": "instance" }`. `fullText` may repeat `shortDescription` with a sentence of elaboration, as the template shows.

Five of these — `item_chest`, `item_sack`, `item_pouch`, `item_basket`, and the already-present `item_backpack` — are also authored in `EQUIPMENT_DICTIONARY` by Task 11, deliberately and at identical weights. Under `EQUIPMENT_RESOLUTION_MODE: "static-only"` the dictionary is what the engine reads and `items.json` is what the database seeds, so both need the entry until the catalogue reconciliation spec collapses them. **If you change a weight here, change it there too.**

| id | name | weight | cpCost | stacking | shortDescription |
| --- | --- | --- | --- | --- | --- |
| `item_bedroll` | Bedroll | 7 | 100 | instance | A padded roll of bedding for sleeping rough. |
| `item_mess_kit` | Mess Kit | 1 | 20 | instance | A tin box holding a cup and cutlery that doubles as cookware. |
| `item_tinderbox` | Tinderbox | 1 | 50 | instance | A small container of flint, fire steel and tinder for lighting fires. |
| `item_rations` | Rations (1 day) | 2 | 50 | stack, bundleSize 1 | A day of dry foodstuffs suitable for travel. |
| `item_waterskin` | Waterskin | 5 | 20 | instance | A leather skin holding four pints of liquid. |
| `item_rope_hempen` | Rope, Hempen (50 feet) | 10 | 100 | instance | Fifty feet of hempen rope with 2 hit points, burst DC 17. |
| `item_chest` | Chest | 25 | 500 | instance | A sturdy wooden chest holding 300 pounds of gear. |
| `item_case_map_or_scroll` | Case, Map or Scroll | 1 | 100 | instance | A cylindrical leather case holding ten rolled sheets. |
| `item_clothes_fine` | Clothes, Fine | 6 | 1500 | instance | Well-cut garments suited to courts and formal occasions. |
| `item_ink` | Ink (1 ounce bottle) | 0 | 1000 | instance | A one-ounce bottle of black ink. |
| `item_ink_pen` | Ink Pen | 0 | 2 | instance | A cut quill for writing. |
| `item_lamp` | Lamp | 1 | 50 | instance | A lamp casting bright light in a 15-foot radius, burning oil. |
| `item_oil_flask` | Oil (flask) | 1 | 10 | stack, bundleSize 1 | A flask of oil for a lamp, or thrown as an improvised weapon. |
| `item_paper` | Paper (one sheet) | 0 | 20 | stack, bundleSize 1 | A single sheet of paper. |
| `item_perfume` | Perfume (vial) | 0 | 500 | instance | A vial of scented oil. |
| `item_sealing_wax` | Sealing Wax | 0 | 50 | instance | A stick of wax for sealing letters. |
| `item_soap` | Soap | 0 | 2 | instance | A bar of soap. |
| `item_blanket` | Blanket | 3 | 50 | instance | A heavy woollen blanket. |
| `item_candle` | Candle | 0 | 1 | stack, bundleSize 1 | A candle burning for one hour, shedding bright light in a 5-foot radius. |
| `item_alms_box` | Alms Box | 1 | 0 | instance | A small box for collecting donations. |
| `item_incense` | Incense (block) | 0 | 0 | stack, bundleSize 1 | A block of incense burned during rites. |
| `item_censer` | Censer | 1 | 0 | instance | A pierced metal vessel for burning incense. |
| `item_vestments` | Vestments | 4 | 0 | instance | Ceremonial garments worn during religious rites. |
| `item_clothes_costume` | Clothes, Costume | 4 | 500 | instance | Garments cut for performance and disguise. |
| `item_disguise_kit` | Disguise Kit | 3 | 2500 | instance | Cosmetics, hair dye and props for altering appearance. |
| `item_sack` | Sack | 0.5 | 1 | instance | A cloth sack holding 30 pounds of gear. |
| `item_pouch` | Pouch | 1 | 50 | instance | A belt pouch holding 6 pounds of gear. |
| `item_basket` | Basket | 2 | 40 | instance | A woven basket holding 40 pounds of gear. |

Four of these weights are table rulings rather than printed PHB values, because the PHB lists them only as pack contents and never in an equipment table with a weight: **alms box (1), censer (1), incense (0), vestments (4)**. They are chosen so the Priest's Pack contents sum to the 24 lb the catalogue already authors for it — see Task 15, which asserts exactly that. Do not change them without changing that pack's weight too.

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @project/database exec vitest run src/__tests__/itemsExtraction.test.ts
```

Expected: PASS, 12 tests in the file.

If the suite reports a JSON parse error, the array is malformed — check for a missing or trailing comma at the insertion point.

- [ ] **Step 5: Confirm the catalogue still projects cleanly**

```bash
pnpm --filter @project/server exec vitest run src/services/__tests__/ruleSnapshotSeam.test.ts
```

Expected: FAIL on the first test, and this is the correct failure — Task 9's `expect(extracted.seedItems).toHaveLength(64)` now sees 92. Change that `64` to `92` and update the comment above it to read "92 unique ids across 93 entries: items.json has a known duplicate item_ammo_bolt, which the extractor drops and reports", then re-run.

Expected: PASS, 4 tests. Nothing else in that file hardcodes a count — the `equipmentById` length assertion compares against `extracted.seedItems.length` and needs no change. If a *different* assertion in it fails, one of the 28 new entries is malformed rather than merely new; read the reported id.

- [ ] **Step 6: Run the database and server suites**

```bash
pnpm --filter @project/database exec vitest run 2>&1 | tail -5
pnpm --filter @project/server exec vitest run 2>&1 | tail -5
```

Expected: `Tests 56 passed (56)` for database, `Tests 193 passed (193)` for server — the server count is unchanged, because this task corrected an existing assertion rather than adding a test.

- [ ] **Step 7: Commit**

```bash
git add packages/database/data/items.json packages/database/src/__tests__/itemsExtraction.test.ts apps/server/src/services/__tests__/ruleSnapshotSeam.test.ts
git commit -m "feat: author the PHB gear the equipment packs contain"
```

---

### Task 15: Turn the four equipment packs into bundles

The last piece of data. Setting `isBundle` and `bundleContents` on the four packs makes `extractItemsForMigration` emit `bundle_contents` rows, which the seed already inserts, which `resolveItemPayload` already reads — so a character who picks Explorer's Pack at creation gets eight rows instead of one opaque 59 lb blob.

The strongest guard available is a sum check: a pack's authored weight must equal the sum of its contents. That is what catches a wrong quantity or a mistyped id, and it is how the Entertainer's Pack error below was found.

**PHB pack contents, with each line's weight:**

| Pack | Contents | Sum |
| --- | --- | --- |
| Explorer's (`item_pack_explorers`) | backpack 5, bedroll 7, mess kit 1, tinderbox 1, torch ×10 = 10, rations ×10 = 20, waterskin 5, hempen rope 10 | **59** |
| Diplomat's (`item_pack_diplomats`) | chest 25, map/scroll case ×2 = 2, fine clothes 6, ink 0, ink pen 0, lamp 1, oil flask ×2 = 2, paper ×5 = 0, perfume 0, sealing wax 0, soap 0 | **36** |
| Priest's (`item_pack_priests`) | backpack 5, blanket 3, candle ×10 = 0, tinderbox 1, alms box 1, incense ×2 = 0, censer 1, vestments 4, rations ×2 = 4, waterskin 5 | **24** |
| Entertainer's (`item_pack_entertainers`) | backpack 5, bedroll 7, costume ×2 = 8, candle ×5 = 0, rations ×5 = 10, waterskin 5, disguise kit 3 | **38** |

Explorer's, Diplomat's and Priest's sums match the weights `items.json` already authors exactly. **Entertainer's does not**: the catalogue says 33, and the PHB contents sum to 38. The authored aggregate is wrong and this task corrects it to 38.

**Files:**
- Modify: `packages/database/data/items.json` — four packs
- Modify: `packages/database/src/__tests__/itemsExtraction.test.ts` — the sum check
- Create: `apps/server/src/utils/__tests__/bundleExpansion.test.ts`

**Interfaces:**
- Consumes: the 28 ids from Task 14; `extractItemsForMigration` and its `bundleContents` output; `resolveItemPayload` from `apps/server/src/utils/inventory.ts`.
- Produces: nothing new in code. Four `items.json` entries gain `isBundle: true` and `bundleContents`.

- [ ] **Step 1: Write the failing sum check**

In `packages/database/src/__tests__/itemsExtraction.test.ts`, append inside `describe("extractItemsForMigration", ...)`:

```ts
  it("gives each equipment pack contents that weigh what the pack weighs", () => {
    // the guard that actually catches a mistyped id or a wrong quantity: a
    // pack is a bundle, so its aggregate weight has to be exactly what its
    // contents come to, or expanding it at acquisition changes the load
    const itemsPath = path.resolve(__dirname, "../../data/items.json");
    const result = extractItemsForMigration(
      JSON.parse(readFileSync(itemsPath, "utf-8")),
    );

    const packs = [
      "item_pack_explorers",
      "item_pack_diplomats",
      "item_pack_priests",
      "item_pack_entertainers",
    ];

    for (const packId of packs) {
      const contents = result.bundleContents.filter((c) => c.bundleId === packId);

      expect(contents.length, packId).toBeGreaterThan(0);

      // summed in hundredths for the same reason weight always is: 0.05 lb
      // line items make a float sum disagree with itself
      const contentsHundredths = contents.reduce((total, entry) => {
        const rule = result.itemRulesById[entry.itemId];
        expect(rule, `${packId} -> ${entry.itemId}`).toBeDefined();
        return total + Math.round(rule!.weight * 100) * entry.quantity;
      }, 0);

      expect(contentsHundredths, packId).toBe(
        result.itemRulesById[packId]!.weight * 100,
      );
    }
  });

  it("marks the equipment packs as bundles", () => {
    const itemsPath = path.resolve(__dirname, "../../data/items.json");
    const result = extractItemsForMigration(
      JSON.parse(readFileSync(itemsPath, "utf-8")),
    );

    const explorers = result.seedItems.find(
      (item) => item.id === "item_pack_explorers",
    );

    expect(explorers?.isBundle).toBe(true);
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @project/database exec vitest run src/__tests__/itemsExtraction.test.ts -t "equipment pack"
```

Expected: FAIL — `expected 0 to be greater than 0` for `item_pack_explorers`, because no bundle contents exist yet.

- [ ] **Step 3: Make the four packs bundles**

In `packages/database/data/items.json`, add `"isBundle": true` and a `"bundleContents"` array to each of the four pack entries, keeping every field they already have. Change **only** `item_pack_entertainers`'s `"weight"`, from `33` to `38`.

```json
      "isBundle": true,
      "bundleContents": [
        { "itemId": "item_backpack", "quantity": 1 },
        { "itemId": "item_bedroll", "quantity": 1 },
        { "itemId": "item_mess_kit", "quantity": 1 },
        { "itemId": "item_tinderbox", "quantity": 1 },
        { "itemId": "item_torch", "quantity": 10 },
        { "itemId": "item_rations", "quantity": 10 },
        { "itemId": "item_waterskin", "quantity": 1 },
        { "itemId": "item_rope_hempen", "quantity": 1 }
      ],
```

for `item_pack_explorers`;

```json
      "isBundle": true,
      "bundleContents": [
        { "itemId": "item_chest", "quantity": 1 },
        { "itemId": "item_case_map_or_scroll", "quantity": 2 },
        { "itemId": "item_clothes_fine", "quantity": 1 },
        { "itemId": "item_ink", "quantity": 1 },
        { "itemId": "item_ink_pen", "quantity": 1 },
        { "itemId": "item_lamp", "quantity": 1 },
        { "itemId": "item_oil_flask", "quantity": 2 },
        { "itemId": "item_paper", "quantity": 5 },
        { "itemId": "item_perfume", "quantity": 1 },
        { "itemId": "item_sealing_wax", "quantity": 1 },
        { "itemId": "item_soap", "quantity": 1 }
      ],
```

for `item_pack_diplomats`;

```json
      "isBundle": true,
      "bundleContents": [
        { "itemId": "item_backpack", "quantity": 1 },
        { "itemId": "item_blanket", "quantity": 1 },
        { "itemId": "item_candle", "quantity": 10 },
        { "itemId": "item_tinderbox", "quantity": 1 },
        { "itemId": "item_alms_box", "quantity": 1 },
        { "itemId": "item_incense", "quantity": 2 },
        { "itemId": "item_censer", "quantity": 1 },
        { "itemId": "item_vestments", "quantity": 1 },
        { "itemId": "item_rations", "quantity": 2 },
        { "itemId": "item_waterskin", "quantity": 1 }
      ],
```

for `item_pack_priests`; and

```json
      "isBundle": true,
      "bundleContents": [
        { "itemId": "item_backpack", "quantity": 1 },
        { "itemId": "item_bedroll", "quantity": 1 },
        { "itemId": "item_clothes_costume", "quantity": 2 },
        { "itemId": "item_candle", "quantity": 5 },
        { "itemId": "item_rations", "quantity": 5 },
        { "itemId": "item_waterskin", "quantity": 1 },
        { "itemId": "item_disguise_kit", "quantity": 1 }
      ],
```

for `item_pack_entertainers`.

- [ ] **Step 4: Run the sum check to verify it passes**

```bash
pnpm --filter @project/database exec vitest run src/__tests__/itemsExtraction.test.ts
```

Expected: PASS, 14 tests in the file.

A failure here names the offending pack in its assertion message. Fix the contents or the aggregate weight — do not relax the assertion, because it is the only thing standing between a typo and a character silently gaining or losing pounds at creation.

- [ ] **Step 5: Prove the acquisition path expands a real pack**

Create `apps/server/src/utils/__tests__/bundleExpansion.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { extractItemsForMigration } from "@project/database/src/itemsExtraction.js";
import { resolveItemPayload } from "../inventory";

/**
 * The same mocked-database harness inventory.test.ts uses, driven by the real
 * catalogue instead of hand-built rows.
 *
 * inventory.test.ts already proves resolveItemPayload unpacks nested bundles;
 * what it cannot prove is that the shipped data reaches it in a shape it can
 * unpack. Until this file, no test connected the two.
 */
const { mockEq, mockItemsTable, mockBundleContentsTable } = vi.hoisted(() => ({
  mockEq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  mockItemsTable: { id: "items.id", isBundle: "items.isBundle" },
  mockBundleContentsTable: { bundleId: "bundle_contents.bundle_id" },
}));

let itemRowsById = new Map<string, { id: string; isBundle: boolean }>();
let bundleRowsById = new Map<string, Array<{ itemId: string; quantity: number }>>();

vi.mock("drizzle-orm", () => ({ eq: mockEq }));

vi.mock("@project/database/src/schema/reference.js", () => ({
  items: mockItemsTable,
  bundleContents: mockBundleContentsTable,
}));

vi.mock("@project/database/src/schema/operational.js", () => ({
  characterInventory: { table: "character_inventory" },
}));

vi.mock("@project/database", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn((condition: { value: string }) => {
          if (table === mockItemsTable) {
            const item = itemRowsById.get(condition.value);
            return Promise.resolve(item ? [item] : []);
          }
          if (table === mockBundleContentsTable) {
            return Promise.resolve(bundleRowsById.get(condition.value) ?? []);
          }
          return Promise.resolve([]);
        }),
      })),
    })),
  },
}));

const resolve = createRequire(import.meta.url).resolve;

const rawItems = JSON.parse(
  readFileSync(resolve("@project/database/data/items.json"), "utf-8"),
) as unknown[];

beforeEach(() => {
  const extracted = extractItemsForMigration(rawItems);

  itemRowsById = new Map(
    extracted.seedItems.map((item) => [
      item.id,
      { id: item.id, isBundle: item.isBundle },
    ]),
  );

  bundleRowsById = new Map();
  for (const entry of extracted.bundleContents) {
    const existing = bundleRowsById.get(entry.bundleId) ?? [];
    existing.push({ itemId: entry.itemId, quantity: entry.quantity });
    bundleRowsById.set(entry.bundleId, existing);
  }
});

describe("the shipped catalogue expands through the acquisition path", () => {
  it("unpacks an Explorer's Pack into its eight line items", async () => {
    const resolved = await resolveItemPayload(null, "item_pack_explorers", 1);

    expect(resolved).toEqual(
      expect.arrayContaining([
        { id: "item_backpack", quantity: 1 },
        { id: "item_bedroll", quantity: 1 },
        { id: "item_mess_kit", quantity: 1 },
        { id: "item_tinderbox", quantity: 1 },
        { id: "item_torch", quantity: 10 },
        { id: "item_rations", quantity: 10 },
        { id: "item_waterskin", quantity: 1 },
        { id: "item_rope_hempen", quantity: 1 },
      ]),
    );
    expect(resolved).toHaveLength(8);
    // the pack itself must not survive expansion, or its 59 lb is counted
    // twice - once as the pack and once as everything in it
    expect(resolved.map((r) => r.id)).not.toContain("item_pack_explorers");
  });

  it("multiplies contents when more than one pack is taken", async () => {
    const resolved = await resolveItemPayload(null, "item_pack_priests", 2);
    const candles = resolved.find((r) => r.id === "item_candle");

    expect(candles).toEqual({ id: "item_candle", quantity: 20 });
  });

  it("leaves a non-bundle item alone", async () => {
    expect(await resolveItemPayload(null, "item_armor_plate", 3)).toEqual([
      { id: "item_armor_plate", quantity: 3 },
    ]);
  });
});
```

- [ ] **Step 6: Run it to verify it passes**

```bash
pnpm --filter @project/server exec vitest run src/utils/__tests__/bundleExpansion.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 7: Run every suite**

```bash
pnpm --filter @project/database exec vitest run 2>&1 | tail -5
pnpm --filter @project/server exec vitest run 2>&1 | tail -5
```

Expected: `Test Files 5 passed (5)`, `Tests 58 passed (58)` for database, and `Test Files 15 passed (15)`, `Tests 196 passed (196)` for server.

- [ ] **Step 8: Commit**

```bash
git add packages/database/data/items.json packages/database/src/__tests__/itemsExtraction.test.ts apps/server/src/utils/__tests__/bundleExpansion.test.ts
git commit -m "feat: make the four PHB equipment packs real bundles"
```

---

## Final Verification

- [ ] **Run every suite against the baseline**

```bash
pnpm check:hygiene
```

Expected: **fails**, on `packages/shared/src/schemas/actions.ts` ("Retired duplicate paths reintroduced").

> **Correction, recorded after execution.** This plan originally claimed hygiene was clean at baseline. It was not, and the claim was never measured. The failure is pre-existing and unrelated to this work — `git log bcff1e8..HEAD -- packages/shared/src/schemas/actions.ts` is empty, so none of this plan's commits touched it. Treat it as a known baseline failure, and do not "fix" it here.

```bash
pnpm --filter @project/engine exec vitest run 2>&1 | tail -5
pnpm --filter @project/database exec vitest run 2>&1 | tail -5
pnpm --filter @project/server exec vitest run 2>&1 | tail -5
pnpm --filter @project/shared exec vitest run 2>&1 | tail -5
```

Expected:

| Package | Before | After Phase 1 (Task 9) | After Phase 2 (Task 15) |
| --- | --- | --- | --- |
| engine | 27 files, 423 tests | 27 files, 437 tests | 29 files, **465 tests**, all passing |
| database | 5 files, 54 tests | 5 files, 55 tests | 5 files, **58 tests**, all passing |
| server | 13 files, 186 tests | 14 files, 193 tests | 15 files, **197 tests**, all passing |
| shared | 147 passed / 11 failed | unchanged | **149 passed / 11 failed** |

Shared's **failure count** must be *exactly* unchanged at 11; its passing count rises by the two tests Task 10 adds. A 12th failure there is yours.

Server reaches 197 rather than the 196 the tasks alone produce: the post-review fix wave added one cross-source guard test. See the fix-wave note below.

```bash
pnpm --filter @project/engine typecheck 2>&1 | grep -c "error TS"
pnpm --filter @project/database typecheck 2>&1 | grep -c "error TS"
pnpm --filter @project/server typecheck 2>&1 | grep -c "error TS"
```

Expected: `25`, `17`, `37` or fewer for each.

- [ ] **Confirm the seed still runs end to end**

The bundle data only matters if it reaches the database. If a local Postgres is configured, run the seed and confirm it reports bundle contents:

```bash
pnpm --filter @project/database exec tsx src/seed.ts
```

Expected: `Resolving Bundle Contents (BOM)...` followed by no error, and **36** rows in `bundle_contents` — Explorer's 8, Diplomat's 11, Priest's 10, Entertainer's 7. If no database is available, skip this step and say so in the completion report rather than claiming it passed.

> **Recorded after execution: this step was NOT run.** No local Postgres was reachable. The 36 rows and the two foreign keys on `bundle_contents` have never been exercised against a real database. The final review assessed the residual risk as low — the four pack sums balance, every content id resolves to a real catalogue id, and the acquisition path is proven against the real catalogue through a mocked-DB test — but the seed remains unverified end to end. **Run it, twice, when a database is available:** once to confirm 36 rows, and again to confirm the idempotency fix below actually holds.

- [ ] **Confirm the git history on `main`**

```bash
git log --oneline bcff1e8..HEAD
```

Expected: **19** commits. Fifteen tasks produced seventeen commits — Tasks 9 and 11 each needed a second — and the post-review fix wave added two more. An earlier version of this line expected fifteen, one per task, which a healthy history with fix rounds does not produce.

## Execution record

Executed 2026-08-07 on `main`, 19 commits from `bcff1e8` to `48c1d10`. Every task passed a spec-and-quality review; two needed a fix round. A whole-branch review then found no Critical issues and four Important ones, all fixed in a single wave.

**Three bugs the reviews caught that the tasks did not:**

1. **A commit that failed its own suite.** Task 11's implementer relaxed an invariant test in the working tree but never staged it, so the delivered commit failed five assertions on a clean checkout while the report claimed 450 passing. Verified and fixed in round 1. `git status --short` being empty is now an explicit pre-report check in this repo's task dispatches.
2. **`bundle_contents` seeding was not idempotent.** `seed.ts` inserted with `.onConflictDoNothing()` against a `(bundleId, itemId)` primary key, so an edited content *quantity* would never propagate on a re-seed. Fixed to `.onConflictDoUpdate`. This is the concrete residue of the unrun seed step — it would have surfaced on the second run.
3. **Dropping `activeStates` from `SpeedEngine` also disabled forbidden-state gating.** Task 2 targeted the `requiredStates` double-count and reasoned only about that direction, but the same list drives `forbiddenStates`. A `SPEED` modifier authored `forbiddenStates: ["encumbered"]` now stays active while encumbered. Behaviour was kept; the parameter was renamed `gatingStates` and the trade documented at the call site. **No content authors such a modifier today — this is latent, not live.**

**Plan defects found during execution, corrected above and worth generalising:**

- Two briefs contained code that did not compile against the repo's own settings: assertions indexing a `Record` without `?.` under `noUncheckedIndexedAccess`, and a bare `../inventory` specifier violating this plan's own `.js` Global Constraint. Plan code blocks are copied verbatim, so a plan error reliably becomes a code error.
- Task 10's brief asserted `ItemDefinitionSchema` is `.strict()`. It is not — only `EquipmentDefinitionSchema` is. The false claim was copied into a test comment before being corrected.
- The lesson for the next plan: assert less about code the plan has not actually read.

**Residual follow-ups, none blocking:**

- `ContainerCapacitySchema.capacityPounds` has no `.nonnegative()`. A negative capacity marks a container permanently overloaded — odd next to Task 6, which argued exactly this case for weight.
- The pack sum-check is blind to a wrong quantity on a **zero-weight** line item (paper, ink, candle, incense, perfume, sealing wax, soap), and to a duplicate `itemId` within one bundle — which the composite PK would silently collapse. Its existence assertion also checks `itemRulesById`, which contains the manually-injected `item_ring_of_protection`; pointing it at `seedItems` would make it a real foreign-key guard.
- `container` is a third field that breaks a `snapshot-first` flip, alongside `equipSlot` and modifiers: `items.json` has no `container` and `SourceItem` does not read one, so every seeded container projects with no capacity.
- `ContainerEngine` resolves each row twice (`containers.ts:52` and `:85`); a `Map` built in pass one would remove the double lookup. Irrelevant at inventory scale.
- Duplicate inventory row ids collapse silently in `ContainerEngine` rather than reporting into `unplacedInstanceIds`. Defensive only — `InventoryInstance.id` is contractually unique.

## What this closes

From `2026-08-05-encumbrance-and-speed.md`:

- **#9** — the two-stage seam, now guarded at all five stage-one exits (Task 1) *and* enforced by a function boundary (Task 3). Fully closed, including the extraction the follow-up deferred to the web spec.
- **#10** — all four named gaps: the tier double-count (Task 2), the unknown-race fallbacks (Task 4), the untested `SPEED` modifier path (Task 5), and `itemsExtraction`'s unclamped rule payload (Task 6). Fully closed.

- **#4 (bundles)** — closed as **data**, not logic. The acquisition path already expanded bundles correctly; Tasks 14–15 give it the four PHB packs to expand, and prove it on the shipped catalogue. The corrected Entertainer's Pack weight (33 → 38) is a real bug the sum check found.

From `2026-08-06-rule-snapshot-lossless-projection.md`:

- **#1** — the all-rows-fail threshold (Task 7). Closed.
- **#2** — identity from the row (Task 8). Closed.
- **#4** — one integration test crossing the seam (Task 9). Closed.

New in Phase 2, closing nothing previously named:

- Container capacity exists on the item contract, five PHB containers are authored at their printed weights and capacities, and `ContainerEngine` reports per-container load with a full test suite.

## What this does not close, and why

1. **`apps/web` still runs its own drifted calculator path.** Out of scope by instruction. Encumbrance, speed and the new container report will not appear in the UI until that migration happens, and it is its own spec.
2. **`heavily_encumbered` still imposes no disadvantage.** The state is emitted and nothing consumes it. `rollContextBuilder.ts` treats `has_disadvantage` as a UI toggle id and `ActionResolver` implements only `apply_effect`, so there is no roll layer for the consumer to land in. Blocked on that layer existing, not on this work.
3. **`EQUIPMENT_DICTIONARY` still holds far fewer entries than the catalogue**, and `EQUIPMENT_RESOLUTION_MODE` stays pinned to `"static-only"`. Phase 2 widens the gap rather than closing it: it adds 5 entries to the dictionary and 28 to `items.json`, taking the catalogue to 92 items against 16 authored rules. Flipping the mode today would shadow the curated entries with snapshot entries that have no `equipSlot` and no modifiers, so plate would stop granting AC — a slot problem, not a weight problem. This is the next spec: **EQUIPMENT_DICTIONARY becomes the authoritative rules source, `items.json` narrows to content (lore, cpCost, stacking), and the seed joins the two by id.** Two live bugs found while scoping it are deliberately left for that spec because they are fixed by deleting the code that holds them: `deriveItemModifiers` matches `acApplication === "add"` while `items.json` authors `"bonus"`, so the shield's +2 AC never reaches a seeded snapshot; and `armorProperties.dexModifier` is dropped entirely, so seeded medium and heavy armour carry no `maxDexCap`.
4. **Container capacity is not persisted, so nothing is ever actually inside anything.** `characterInventory` keys on `(characterId, itemId)`, which makes two stacks of one item impossible and containment unrepresentable. `ContainerEngine` is correct and fully tested against `InventoryInstance.containerId`, but no row in the database can set it until that PK is dropped and a `containerId` column added — a migration plus changes to the socket payloads in `apps/server/src/gateway/socket.ts` and the write paths in `routes/character.ts` and `utils/inventory.ts`. **This is the largest authored-but-inert channel in the repo**, and `docs/TODO_BACKLOG.md` already names that category as its P0 risk. It should be the first task of whichever spec owns inventory persistence.
5. **Containment is one level deep.** A pouch inside a backpack contributes its own 1 lb, not the 6 lb inside it. Summing the subtree is more correct and needs cycle detection; no 5e rule turns on the difference, and the one-level rule is tested explicitly so the decision is visible rather than accidental.
6. **Volume and item-count capacities are not modelled.** The PHB measures barrels and buckets in gallons and quivers and cases in item counts. Both are real limits, neither is a weight limit, and each needs its own field and its own rule. `ContainerCapacitySchema` is `.strict()`, so adding either later is a deliberate schema change rather than a silent widening.
7. **Overloading a container has no mechanical consequence.** `isOverloaded` is reported and nothing reads it. That matches 5e, which gives no rule for an overfull sack — the DM does. Do not invent a penalty.
8. **`trait_powerful_build` is authored but ungranted.** No race in `RACE_DICTIONARY` is a Goliath. Content, not code.
9. **`StateExtractor` still has no real-data yield.** ASI levels compile no `trait_choice` node, so no state-bearing trait can be selected into a save. Goes live when ASI/feat selection is built.
10. **Coin weight is still untracked** — there is no currency field on `CharacterSave`. Excluded by decision.
11. **Four pack line-item weights are table rulings, not printed values.** The PHB lists alms box, censer, incense and vestments only as pack contents, never in an equipment table with a weight. Task 14 assigns 1, 1, 0 and 4 because those make the Priest's Pack contents sum to the 24 lb the catalogue already authored — a consistency argument, not a citation. If a source is found, change them and the pack weight together.
12. **`@project/shared`'s 11 failing tests are untouched.** They are stale assertions against schemas that have since grown Zod defaults, and two reference a schema export that no longer exists. Genuinely easy, entirely unrelated, and worth its own small pass.
