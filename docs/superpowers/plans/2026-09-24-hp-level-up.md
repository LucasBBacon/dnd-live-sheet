# Hit Points and Level-Up Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close backlog #86, #87, #88, #94 and #95: the one-hit-point-per-level floor applies to each level's roll and Constitution together, Draconic Resilience scales and unscaled class-level modifiers fail pack validation, the level-up review previews the server's own hit point gain, a level-up locks the row it reads, and every web caller takes a character's level from its class ledger.

**Architecture:** #86 is one engine function every sheet and the server share. #87 is a pack patch plus a generic `validateCoreRulePack` rule. #94 and #88 share one server loader, `loadLevelUpSaves`, which `applyLevelUp` calls with its transaction and a row lock and a new read-only preview endpoint calls with the pool; the web review step shows the preview's numbers. #95 is a one-line web helper, `ledgerTotalLevel`, used by every caller that used to read the level column.

**Tech Stack:** TypeScript, pnpm + turbo monorepo; Vitest (+ supertest in `apps/server`); drizzle-orm; Express; React 19 + Zustand + react-query (`apps/web`); `@project/engine`, `@project/shared`.

**Spec:** `docs/superpowers/specs/2026-09-23-hp-level-up-design.md`

## Global Constraints

- **Line endings.** Every file this plan touches measured **CRLF** (including `docs/development/sample-characters.md`). Any new file must be CRLF too. Edit and Write emit LF. After editing, restore CRLF on every file you touched:
  ```bash
  node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' <file> <file> ...
  ```
  and measure (grep gives wrong answers for CR in this Git Bash):
  ```bash
  node -e 'for(const f of process.argv.slice(1)){const b=require("fs").readFileSync(f);let cr=0,lf=0,crlf=0;for(let i=0;i<b.length;i++){if(b[i]===13){cr++;if(b[i+1]===10)crlf++;}if(b[i]===10)lf++;}console.log(f,cr===0?"LF":(cr===crlf&&crlf===lf)?"CRLF":"MIXED")}' <file> ...
  ```
  Never use `sed -i`. `pnpm check:hygiene` fails on a mixed file.
- **Typecheck is a separate gate** — Vitest ignores type errors. Per package: `pnpm --filter @project/engine typecheck`, `@project/shared`, `@project/database`, `@project/server` (all `tsc --noEmit`), and `pnpm --filter @project/web typecheck` (`tsc -b`). Never run `tsc -b` in `packages/database`.
- `apps/server`, `packages/engine`, `packages/shared` and `packages/database` compile with **`exactOptionalPropertyTypes`** and **`noUncheckedIndexedAccess`**: an optional property that may receive `undefined` must be typed `?: T | undefined`, or passed by conditional spread.
- **CI has no `DATABASE_URL`.** Run server and database suites as `DATABASE_URL= pnpm --filter @project/server test` / `DATABASE_URL= pnpm --filter @project/database test`.
- **Pack JSON is edited only through `packages/database/scripts/patchPackSegment.ts`**, never by hand.
- **Fix only the five items.** Anything else you notice is reported, not fixed.
- Commit messages end with a blank line and then the `Co-Authored-By:` trailer your own session's attribution instruction supplies. Use `git commit -F -` with a heredoc. Branch is `fix/hp-level-up`. Do not push.
- Touch only the files a task lists. A failure in any other file: stop and report NEEDS_CONTEXT.

## File Structure

| File | Change |
| --- | --- |
| `packages/engine/src/calculators/derivedStats.ts` | `calculateMaxHp`: CON at full value; floor the rolled-plus-CON sum at 1 per level (#86) |
| `packages/shared/src/schemas/content/validatePack.ts` | New `missing_scaling_class` rule over the whole pack (#87) |
| `packages/database/data/packs/core_2014_pack/traits/ported.json` | Draconic Resilience names `class_sorcerer` (#87, via the patch script) |
| `apps/server/src/controllers/characterController.ts` | `loadLevelUpSaves` (shared loader, row lock) and `previewLevelUp` (#94, #88) |
| `apps/server/src/routes/character.ts` | `admitLevelUpRequest` (shared gate) and the preview route (#88) |
| `apps/web/src/utils/ledgerLevel.ts` (new) | `ledgerTotalLevel` (#95) |
| `apps/web/src/store/characterSheetStore.ts` | `getMaxHp` uses `ledgerTotalLevel` |
| `apps/web/src/components/sheet/DashboardLayout.tsx` | Level Up sends ledger + 1 (#95) |
| `apps/web/src/components/wizard/steps/OverviewStep.tsx` | Class switcher and label use the ledger (#95) |
| `apps/web/src/components/wizard/steps/ReviewStep.tsx` | Level row from the ledger (#95); hit points from the server (#88) |
| `apps/web/src/store/levelUpStore.ts` | `hitPointPreview` + `requestHitPointPreview` (#88) |
| `apps/web/src/utils/levelUpReview.ts` | **Deleted** (#88) |
| `packages/database/src/sampleScenarioCharacters.ts` | Seraphine's current hit points 33 → 21 and her `testFocus` (#86) |
| Tests | engine `derivedStats.test.ts`; shared `coreRulePack.test.ts`; server `characterSave.test.ts`, `sampleCharacterHitPoints.test.ts`, `routes/__tests__/character.test.ts`, new `routes/__tests__/levelUpPreview.test.ts`; web `characterSheetStore.test.ts`, `DashboardLayout.test.tsx`, `levelUpStore.test.ts`, `useCharacterStats.test.ts`, new `utils/__tests__/ledgerLevel.test.ts`, new `steps/__tests__/OverviewStep.test.tsx`, new `steps/__tests__/ReviewStep.test.tsx` |
| Docs | `docs/development/sample-characters.md`, `docs/TODO_BACKLOG.md` |

## Facts this plan relies on (measured while planning)

- With #86 applied, **exactly 15** engine tests move (listed in Task 1 with their measured new values), plus **two** server tests and **three** web tests, all named below. With #87 applied on top, exactly one more server test moves (Nyx 78 → 80) and the server `characterSave` case settles at 13. Nothing else in any suite moves.
- `traits/ported.json` round-trips through `patchPackSegment.ts` byte-for-byte **except one line, inside Draconic Resilience itself** (a one-line `forbiddenStates` array the printer expands to three). The #87 patch rewrites that trait anyway, so the file's diff is 4 insertions, 1 deletion, all inside the trait.
- Draconic Resilience is the **only** entry in the pack scaled by class level without a `scalingClassId`, counting both `scalingFactor` (modifiers, critical-hit dice) and `scalingMode` (damage segments).
- For a hill dwarf fighter 3 (Champion, CON 13 stored / 15 final, 22 rolled) levelling to 4 with a roll of 6 and +1 CON +1 STR, `finalMaxHp(before)` is **31** and `levelUpHitPointGain` is **13** (after **44**). The old review preview said +9.

---

### Task 1: #86 — floor the per-level total, not the Constitution modifier

**Files:**
- Modify: `packages/engine/src/calculators/derivedStats.ts` (the head of `calculateMaxHp`, lines 44-55)
- Modify: `packages/database/src/sampleScenarioCharacters.ts` (Seraphine Dusk)
- Test: `packages/engine/src/calculators/__tests__/derivedStats.test.ts`, `apps/server/src/services/__tests__/characterSave.test.ts`, `apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts`, `apps/web/src/store/__tests__/characterSheetStore.test.ts`

**Interfaces:** `DerivedStatEngine.calculateMaxHp(baseHpRolled, conModifier, levels, modifiers, activeStates?)` keeps its signature. Its breakdown gains an optional third line `{ name: "Minimum 1 HP per level", value: "+N" }`.

- [ ] **Step 1: Rewrite the two floor tests in `derivedStats.test.ts`**

Replace the two tests `"floors a negative CON modifier's contribution to a minimum of 1 per level"` and `"treats a zero CON modifier the same as the 1-per-level floor"` (they sit together inside `describe("base HP (rolled HP + CON contribution)")`) with these four:

```ts
    it("counts a negative CON modifier at its full value when the rolls cover it", () => {
      const result = DerivedStatEngine.calculateMaxHp(
        20,
        -2,
        makeLevels({ total: 3 }),
        [],
      );

      // 20 rolled - 6 = 14, well above the 3-hit-point floor (#86)
      expect(result.total).toBe(14);
      expect(result.breakdown).toEqual([
        { name: "Base HP Rolled", value: 20 },
        { name: "CON (-2) x Level (3)", value: -6 },
      ]);
    });

    it("adds nothing for a zero CON modifier", () => {
      const result = DerivedStatEngine.calculateMaxHp(
        20,
        0,
        makeLevels({ total: 4 }),
        [],
      );

      expect(result.total).toBe(20);
      expect(result.breakdown).toEqual([
        { name: "Base HP Rolled", value: 20 },
        { name: "CON (+0) x Level (4)", value: 0 },
      ]);
    });

    it("floors the rolls and CON together at 1 hit point per level", () => {
      // 5e: each level grants at least 1 hit point, roll and modifier
      // together. 4 rolled - 9 = -5; the floor lifts it to 3 (#86)
      const result = DerivedStatEngine.calculateMaxHp(
        4,
        -3,
        makeLevels({ total: 3 }),
        [],
      );

      expect(result.total).toBe(3);
      expect(result.breakdown).toEqual([
        { name: "Base HP Rolled", value: 4 },
        { name: "CON (-3) x Level (3)", value: -9 },
        { name: "Minimum 1 HP per level", value: "+8" },
      ]);
    });

    it("adds MAX_HP modifiers after the floor, not before it", () => {
      // 2 rolled - 4 = -2, floored to 2; Tough's 2 x 2 then adds 4: 6.
      // Adding Tough first would give 2 - 4 + 4 = 2, which the floor keeps
      const result = DerivedStatEngine.calculateMaxHp(
        2,
        -2,
        makeLevels({ total: 2 }),
        [
          makeMod({
            value: 2,
            scalingFactor: "total_level",
            sourceName: "Tough",
          }),
        ],
      );

      expect(result.total).toBe(6);
      expect(result.breakdown).toEqual([
        { name: "Base HP Rolled", value: 2 },
        { name: "CON (-2) x Level (2)", value: -4 },
        { name: "Minimum 1 HP per level", value: "+4" },
        { name: "Tough", value: "+4" },
      ]);
    });
```

- [ ] **Step 2: Move the 13 modifier tests that passed CON +0**

Every one of these passes a CON modifier of 0, which used to be credited with the floor. Change only the expected total (measured by running the suite against the fix):

| Test name | `toBe` old → new |
| --- | --- |
| `ignores modifiers that do not target MAX_HP` | 11 → 10 |
| `ignores inactive MAX_HP modifiers` | 11 → 10 |
| `ignores modifiers whose forbiddenStates are currently active` | 11 → 10 |
| `applies modifiers whose forbiddenStates are not active` | 16 → 15 |
| `excludes modifiers whose requiredStates are not satisfied` | 11 → 10 |
| `includes modifiers whose requiredStates are satisfied` | 16 → 15 |
| `ignores MAX_HP modifiers whose type is not 'add' (e.g. set_base)` | 11 → 10 |
| `adds a flat 'add' modifier with no scaling and records it in the breakdown` | 14 → 13 |
| `renders a negative flat modifier with its minus sign` | 7 → 6 |
| `scales an add modifier by total_level` | 20 → 15 |
| `scales an add modifier by class_level using the matching class` | 24 → 18 |
| `treats an unmatched class_level scalingClassId as zero contribution and omits it from the breakdown` | 16 → 10 |
| `treats class_level scaling without a scalingClassId as an unscaled flat add (current implementation)` | 14 → 13 |

In the `treats an unmatched class_level scalingClassId…` test also change the breakdown entry `{ name: "CON (+0) x Level (6)", value: 6 }` to `{ name: "CON (+0) x Level (6)", value: 0 }`.

- [ ] **Step 3: Run the engine test to verify it fails**

Run: `pnpm --filter @project/engine exec vitest run src/calculators/__tests__/derivedStats.test.ts`
Expected: FAIL — 17 tests (the four new ones and the 13 moved ones), e.g. `expected 11 to be 10`.

- [ ] **Step 4: Implement the floor**

In `packages/engine/src/calculators/derivedStats.ts`, replace:

```ts
    // 5e hp rule: base + (con * level)
    // min 1 hp granted per lvl regardless of negative con mod
    const conContribution = Math.max(1, conModifier) * levels.total;
    let total = baseHpRolled + conContribution;

    breakdown.push({ name: "Base HP Rolled", value: baseHpRolled });
    breakdown.push({
      name: `CON (${conModifier >= 0 ? "+" : ""}${conModifier}) x Level (${levels.total})`,
      value: conContribution,
    });
```

with:

```ts
    // 5e: every level grants its hit die roll plus the CON modifier, and at
    // least 1 hit point counting the two together. Only the sum of the rolls
    // is stored (#78), so the floor is applied to the sum - exact unless a
    // single level's roll plus a negative modifier fell below 1, which this
    // then understates by the shortfall (#86)
    const conContribution = conModifier * levels.total;
    const rolledAndCon = baseHpRolled + conContribution;
    const floorLift = Math.max(0, levels.total - rolledAndCon);
    let total = rolledAndCon + floorLift;

    breakdown.push({ name: "Base HP Rolled", value: baseHpRolled });
    breakdown.push({
      name: `CON (${conModifier >= 0 ? "+" : ""}${conModifier}) x Level (${levels.total})`,
      value: conContribution,
    });
    if (floorLift > 0) {
      breakdown.push({ name: "Minimum 1 HP per level", value: `+${floorLift}` });
    }
```

- [ ] **Step 5: Run the engine test to verify it passes**

Run: `pnpm --filter @project/engine exec vitest run src/calculators/__tests__/derivedStats.test.ts`
Expected: PASS (58 tests).

- [ ] **Step 6: See the pinned numbers outside the engine fail**

Run: `DATABASE_URL= pnpm --filter @project/server exec vitest run src/services/__tests__/characterSave.test.ts src/services/__tests__/sampleCharacterHitPoints.test.ts`
Expected: FAIL — `gives at least one hit point per level when Constitution is not a bonus` (`expected 11 to be 14`) and `Seraphine Dusk derives the maximum their sheet shows` (`expected 29 to be 47`).

Run: `pnpm --filter @project/web exec vitest run src/store/__tests__/characterSheetStore.test.ts`
Expected: FAIL — three tests in `useCharacterSheetStore hp trigger handling` (`expected 9 to be 10`): `derives the maximum from the base, Constitution and trait modifiers (#78)`, `sends a heal raw and lets the server clamp it`, `dispatches rest triggers through the authored runtime path`.

- [ ] **Step 7: Move those pinned numbers**

`apps/server/src/services/__tests__/characterSave.test.ts` — replace:

```ts
  it("gives at least one hit point per level when Constitution is not a bonus", () => {
    // a human Draconic Bloodline sorcerer 3: CON 10 + 1 = 11 (+0), base 10,
    // so three levels grant the 1-per-level floor, and Draconic Resilience
    // adds its own
```

with:

```ts
  it("adds nothing for a Constitution modifier of zero", () => {
    // a human Draconic Bloodline sorcerer 3: CON 10 + 1 = 11 (+0), base 10.
    // A zero modifier adds nothing - the engine used to credit it with the
    // 1-per-level floor (#86) - and Draconic Resilience adds its own
```

and in the same test change `expect(finalMaxHp(save, snapshot)).toBe(14);` to `expect(finalMaxHp(save, snapshot)).toBe(11);`.

`apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts` — replace the header comment's last two lines:

```ts
 * numbers they showed before the change, except Nyx Vale, whose Draconic
 * Resilience never reached a sheet.
```

with:

```ts
 * numbers they showed before the change, except Nyx Vale, whose Draconic
 * Resilience never reached a sheet, and Seraphine Dusk, whose negative
 * Constitution modifier counts since #86.
```

and replace:

```ts
  // #86: the rules give 29. CON 8 is -1 per level, and calculateMaxHp floors
  // the modifier at +1, so nine levels come out 18 too high. Fixing #86 turns
  // this red on purpose; update it to 29 then.
  "Seraphine Dusk": 47,
```

with:

```ts
  // CON 8 is -1 per level: 38 rolled - 9. The engine used to floor the
  // modifier at +1 and show 47 (#86)
  "Seraphine Dusk": 29,
```

`apps/web/src/store/__tests__/characterSheetStore.test.ts` — in the `useCharacterSheetStore hp trigger handling` block's `beforeEach`, replace (the file has a second `baseHpRolled: 9` elsewhere; this anchor is unique):

```ts
      raceId: "race_half_orc",
      subraceId: null,
      currentHp: 5,
      baseHpRolled: 9,
```

with:

```ts
      raceId: "race_half_orc",
      subraceId: null,
      currentHp: 5,
      baseHpRolled: 10,
```

and in `derives the maximum from the base, Constitution and trait modifiers (#78)` replace the comment:

```ts
    // base 9, CON 10 + 1 (half-orc) = 11 (+0), so one level grants the
    // 1-per-level floor: 10
```

with:

```ts
    // base 10, CON 10 + 1 (half-orc) = 11 (+0): a zero modifier adds
    // nothing (#86), so the maximum is the base. Every case in this block
    // is built on a maximum of 10
```

- [ ] **Step 8: Keep Seraphine wounded, not over her new maximum**

Her maximum drops from 47 to 29 while her stored current hit points stay 33. In `packages/database/src/sampleScenarioCharacters.ts`, in Seraphine Dusk's entry (`id: "00000000-0000-0000-0000-000000000126"`), replace `    currentHp: 33,` with `    currentHp: 21,` (the only `currentHp: 33` in the file), and replace her `testFocus` string

```ts
      "Wizard preview: CON 8 overstates the maximum (#86); a spellbook that lists nothing (#31a, #83); Drow Magic at dawn.",
```

with:

```ts
      "Wizard preview: CON 8, a negative modifier the maximum counts (#86); a spellbook that lists nothing (#31a, #83); Drow Magic at dawn.",
```

- [ ] **Step 9: Restore line endings and run everything this task touches**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' packages/engine/src/calculators/derivedStats.ts packages/engine/src/calculators/__tests__/derivedStats.test.ts apps/server/src/services/__tests__/characterSave.test.ts apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts apps/web/src/store/__tests__/characterSheetStore.test.ts packages/database/src/sampleScenarioCharacters.ts
```

Run: `pnpm --filter @project/engine test` — PASS.
Run: `DATABASE_URL= pnpm --filter @project/server test` — PASS (498).
Run: `pnpm --filter @project/web test` — PASS (460).
Run: `DATABASE_URL= pnpm --filter @project/database test` — PASS (200).
Run: `pnpm --filter @project/engine typecheck && pnpm --filter @project/server typecheck && pnpm --filter @project/web typecheck && pnpm --filter @project/database typecheck` — all exit 0.

- [ ] **Step 10: Commit**

```bash
git add packages/engine/src/calculators/derivedStats.ts packages/engine/src/calculators/__tests__/derivedStats.test.ts apps/server/src/services/__tests__/characterSave.test.ts apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts apps/web/src/store/__tests__/characterSheetStore.test.ts packages/database/src/sampleScenarioCharacters.ts
git commit -F - <<'EOF'
fix(engine): floor each level's hit points, not the Constitution modifier (#86)

calculateMaxHp counted a Constitution modifier of zero or below as +1 per
level, so every such character showed too many hit points. It now counts
the modifier at its full value and floors the rolled-plus-Constitution sum
at 1 per level, with a breakdown line when the floor lifts it. Seraphine
Dusk derives 29, not 47; her seeded current hit points drop to 21 so she
stays wounded rather than over her maximum.

Co-Authored-By: <the trailer your session's attribution instruction supplies>
EOF
```

---

### Task 2: #87 — Draconic Resilience names its class, and validation insists

**Files:**
- Modify: `packages/shared/src/schemas/content/validatePack.ts`
- Modify: `packages/database/data/packs/core_2014_pack/traits/ported.json` (through the patch script only)
- Test: `packages/shared/src/schemas/__tests__/coreRulePack.test.ts`, `apps/server/src/services/__tests__/characterSave.test.ts`, `apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts`

**Interfaces:** `CoreRulePackIssueCode` gains `"missing_scaling_class"`.

- [ ] **Step 1: Write the failing validation tests**

In `packages/shared/src/schemas/__tests__/coreRulePack.test.ts`, add to the imports:

```ts
import { BaseModifierSchema } from "../content/modifiers.js";
```

and append at the end of the file:

```ts
describe("class-level scaling names its class (#87)", () => {
  const packWithScaledTrait = (scaling: Record<string, unknown>) => {
    const source = createValidPack();
    source.traits.push({
      ...source.traits[0]!,
      id: "trait_test_resilience",
      name: "Test Resilience",
      modifiers: {
        fixed: [
          BaseModifierSchema.parse({
            target: "MAX_HP",
            type: "add",
            value: 1,
            ...scaling,
          }),
        ],
        choices: [],
      },
    });
    return CoreRulePackSchema.parse(source);
  };

  it("rejects a modifier scaled by class level that names no class", () => {
    const result = validateCoreRulePack(
      packWithScaledTrait({ scalingFactor: "class_level" }),
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      code: "missing_scaling_class",
      path: ["traits", 1, "modifiers", "fixed", 0],
      message: expect.stringContaining("trait_test_resilience"),
    });
  });

  it("accepts the same modifier once it names its class", () => {
    const result = validateCoreRulePack(
      packWithScaledTrait({
        scalingFactor: "class_level",
        scalingClassId: "class_test",
      }),
    );

    expect(result).toEqual({ ok: true, issues: [] });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @project/shared exec vitest run src/schemas/__tests__/coreRulePack.test.ts`
Expected: FAIL — `rejects a modifier scaled by class level that names no class` (`result.ok` is `true`).

- [ ] **Step 3: Implement the rule**

In `packages/shared/src/schemas/content/validatePack.ts`, add `| "missing_scaling_class"` to `CoreRulePackIssueCode` directly above `| "missing_subrace"`. Then add, directly above `export const validateCoreRulePack = (`:

```ts
const CLASS_SCALED = new Set(["class_level", "class_level_thresholds"]);

/**
 * An entry scaled by one class's level must say which class.
 *
 * Without `scalingClassId`, `DerivedStatEngine.resolveScaledValue` falls
 * through to the flat value, so a feature meant to grow with its class stops
 * at level one and nothing says so - Draconic Resilience added 1 hit point
 * instead of 1 per sorcerer level (#87). The whole pack is walked rather than
 * a list of known sites: scaling is authored as `scalingFactor` on modifiers
 * and critical-hit dice and as `scalingMode` on damage segments, and a site
 * added later is covered without anyone remembering to add it here. The
 * message names the nearest enclosing entity with an id.
 */
const validateClassScaling = (
  pack: CoreRulePack,
  issues: CoreRulePackValidationIssue[],
) => {
  const visit = (
    value: unknown,
    path: Array<string | number>,
    ownerId: string | undefined,
  ): void => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, [...path, index], ownerId));
      return;
    }
    if (value === null || typeof value !== "object") return;

    const record = value as Record<string, unknown>;
    const owner = typeof record.id === "string" ? record.id : ownerId;
    const scaling = record.scalingFactor ?? record.scalingMode;

    if (
      typeof scaling === "string" &&
      CLASS_SCALED.has(scaling) &&
      !record.scalingClassId
    ) {
      const target =
        typeof record.target === "string" ? ` ${record.target}` : "";
      issues.push({
        code: "missing_scaling_class",
        path,
        message: `${owner ? `'${owner}'` : "An entry"} scales${target} by ${scaling} but names no scalingClassId.`,
      });
    }

    for (const [key, child] of Object.entries(record)) {
      visit(child, [...path, key], owner);
    }
  };

  visit(pack, [], undefined);
};

```

and in `validateCoreRulePack`, directly above `  return { ok: issues.length === 0, issues };`, add:

```ts
  validateClassScaling(pack, issues);

```

- [ ] **Step 4: Run the shared tests to verify they pass**

Run: `pnpm --filter @project/shared test`
Expected: PASS.

- [ ] **Step 5: See the shipped pack now fail**

Run: `DATABASE_URL= pnpm --filter @project/database test`
Expected: FAIL — the pack loader's semantic validation rejects the shipped pack with a message containing `'trait_draconic_resilience' scales MAX_HP by class_level but names no scalingClassId.`

- [ ] **Step 6: Patch Draconic Resilience**

Write this to `packages/database/draconic-resilience.patch.json` (a temporary file — it is deleted in this step and never committed). It is the trait exactly as it stands in `traits/ported.json`, with one field added — `"scalingClassId": "class_sorcerer"` — keeping the file's key order:

```json
{
  "upsertTraits": [
    {
      "id": "trait_draconic_resilience",
      "name": "Draconic Resilience",
      "modifiers": {
        "fixed": [
          {
            "target": "MAX_HP",
            "type": "add",
            "value": 1,
            "scalingFactor": "class_level",
            "scalingClassId": "class_sorcerer",
            "requiredStates": [],
            "forbiddenStates": []
          },
          {
            "target": "ARMOR_CLASS",
            "type": "set_base",
            "value": 13,
            "scalingFactor": "none",
            "requiredStates": [],
            "forbiddenStates": ["status_wearing_armor"]
          }
        ],
        "choices": []
      },
      "resources": [],
      "triggers": [],
      "diceRules": [],
      "criticalHitModifiers": [],
      "actions": [],
      "lore": {
        "shortDescription": "Draconic Resilience",
        "fullText": "Draconic Resilience"
      }
    }
  ]
}
```

Then:

```bash
cd packages/database && npx tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/traits/ported.json draconic-resilience.patch.json && rm draconic-resilience.patch.json && cd ../..
git diff --stat
```

Expected: `patched data/packs/core_2014_pack/traits/ported.json`; the stat shows only `traits/ported.json | 5 ++++-` (4 insertions, 1 deletion). `git diff` shows the added `"scalingClassId": "class_sorcerer",` line and the same trait's `"forbiddenStates": ["status_wearing_armor"]` expanded to three lines by the script's printer — that line is the only one in the file that does not round-trip, and it is inside the trait being replaced. Anything else in the diff: stop and report. The script writes the file's own CRLF endings; measure it anyway.

- [ ] **Step 7: See the pack load, and the two numbers #87 moves**

Run: `DATABASE_URL= pnpm --filter @project/database test` — PASS (200).
Run: `DATABASE_URL= pnpm --filter @project/server exec vitest run src/services/__tests__/characterSave.test.ts src/services/__tests__/sampleCharacterHitPoints.test.ts`
Expected: FAIL — `adds nothing for a Constitution modifier of zero` (`expected 13 to be 11`) and `Nyx Vale derives the maximum their sheet shows` (`expected 80 to be 78`).

- [ ] **Step 8: Move them**

`apps/server/src/services/__tests__/characterSave.test.ts`, in `adds nothing for a Constitution modifier of zero`, replace:

```ts
    // 1-per-level floor (#86) - and Draconic Resilience adds its own
```

with:

```ts
    // 1-per-level floor (#86) - and Draconic Resilience adds 1 per sorcerer
    // level (#87): 10 + 3
```

and `toBe(11)` with `toBe(13)`.

`apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts`, replace:

```ts
 * numbers they showed before the change, except Nyx Vale, whose Draconic
 * Resilience never reached a sheet, and Seraphine Dusk, whose negative
 * Constitution modifier counts since #86.
```

with:

```ts
 * numbers they showed before the change, except Nyx Vale, whose Draconic
 * Resilience never reached a sheet and scales per sorcerer level since #87,
 * and Seraphine Dusk, whose negative Constitution modifier counts since #86.
```

and `  "Nyx Vale": 78,` with `  "Nyx Vale": 80,`.

- [ ] **Step 9: Restore line endings and verify**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' packages/shared/src/schemas/content/validatePack.ts packages/shared/src/schemas/__tests__/coreRulePack.test.ts apps/server/src/services/__tests__/characterSave.test.ts apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts
```

Measure those four and `packages/database/data/packs/core_2014_pack/traits/ported.json` — all CRLF.

Run: `pnpm --filter @project/shared test`, `DATABASE_URL= pnpm --filter @project/database test`, `pnpm --filter @project/engine test`, `DATABASE_URL= pnpm --filter @project/server test`, `pnpm --filter @project/web test` — all PASS.
Run: `pnpm --filter @project/shared typecheck && pnpm --filter @project/server typecheck` — exit 0.

- [ ] **Step 10: Commit**

```bash
git add packages/shared/src/schemas/content/validatePack.ts packages/shared/src/schemas/__tests__/coreRulePack.test.ts packages/database/data/packs/core_2014_pack/traits/ported.json apps/server/src/services/__tests__/characterSave.test.ts apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts
git commit -F - <<'EOF'
fix: Draconic Resilience scales per sorcerer level, and packs must say which class (#87)

The trait's MAX_HP modifier was scaled by class_level with no class named,
so the engine fell back to a flat +1. It now names class_sorcerer, and
validateCoreRulePack rejects any entry scaled by class level that names no
scalingClassId (missing_scaling_class), walking the whole pack. The patch
script's printer also expanded the same trait's one-line forbiddenStates
array. Nyx Vale derives 80.

Co-Authored-By: <the trailer your session's attribution instruction supplies>
EOF
```

---

### Task 3: #94 — the level-up reads its row FOR UPDATE, through one shared loader

**Files:**
- Modify: `apps/server/src/controllers/characterController.ts`
- Test: `apps/server/src/routes/__tests__/character.test.ts`

**Interfaces:**
- Produces (module-private in `characterController.ts`, used again by Task 5):
  ```ts
  type LevelUpExecutor = Pick<typeof db, "select">;
  interface LevelUpDraft {
    targetClassId: string;
    subclassId?: string | undefined;
    featId?: string | undefined;
    selectedTraits?: Record<string, string[]> | undefined;
    traitSelections?: Record<string, string[]> | undefined;
  }
  const loadLevelUpSaves: (
    executor: LevelUpExecutor,
    characterId: string,
    draft: LevelUpDraft,
    options: { lock: boolean },
  ) => Promise<{ existingClasses; storedChoices; saves }>;
  ```
  It throws `Error("Character not found.")` when the row does not exist.

- [ ] **Step 1: Teach the level-up harness to record row locks, and write the failing test**

In `apps/server/src/routes/__tests__/character.test.ts`, inside `setupLevelUpHarness`, replace:

```ts
    const tx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        const rows = selectResults.shift() ?? [];
        return Object.assign(Promise.resolve(rows), {
          orderBy: () => Promise.resolve(rows),
        });
      }),
```

with:

```ts
    // records the strength of every row lock a read asks for (#94)
    const lockMock = vi.fn();

    const tx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        const rows = selectResults.shift() ?? [];
        return Object.assign(Promise.resolve(rows), {
          orderBy: () => Promise.resolve(rows),
          for: (strength: string) => {
            lockMock(strength);
            return Promise.resolve(rows);
          },
        });
      }),
```

and in the harness's `return { … }` add `lockMock,` after `tx,`.

Then add this test as the last `it` inside `describe("POST /api/character/:characterId/level-up")` (after `applies resolver multiclass grants for a first-level dip`):

```ts
    it("reads the character FOR UPDATE, so a concurrent level-up waits for this one (#94)", async () => {
      const { applyLevelUp, lockMock } = await setupLevelUpHarness({});
      const { res } = createMockResponse();

      await applyLevelUp(createLevelUpRequest(), res);

      // exactly one read takes a lock, and it takes the strength that makes a
      // second level-up wait for this transaction to commit
      expect(lockMock).toHaveBeenCalledTimes(1);
      expect(lockMock).toHaveBeenCalledWith("update");
    });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `DATABASE_URL= pnpm --filter @project/server exec vitest run src/routes/__tests__/character.test.ts`
Expected: FAIL — `reads the character FOR UPDATE…` (`expected "spy" to be called 1 times, but got 0 times`); every other test in the file still passes.

- [ ] **Step 3: Add the loader and use it in `applyLevelUp`**

In `apps/server/src/controllers/characterController.ts`, replace everything from the doc comment `/**\n * Applies a level-up to a character.` down to and including the line `      const { isMulticlassDip, targetClassLevel, targetClassRecord } = saves;` with:

```ts
/** Whatever can `.select()`: the module `db`, or a caller's transaction. */
type LevelUpExecutor = Pick<typeof db, "select">;

/** The draft fields a level-up's saves depend on (#88). */
interface LevelUpDraft {
  targetClassId: string;
  subclassId?: string | undefined;
  featId?: string | undefined;
  selectedTraits?: Record<string, string[]> | undefined;
  traitSelections?: Record<string, string[]> | undefined;
}

/**
 * Reads the character a level-up acts on and builds it before and after.
 *
 * applyLevelUp and previewLevelUp both call this, so the preview measures
 * exactly the saves the write stores (#88). applyLevelUp passes its
 * transaction with `lock: true`: the character row is read FOR UPDATE, so a
 * second concurrent level-up waits for the first to commit, then reads the
 * ledger the first wrote and fails the ledger check rather than adding a
 * second level's hit points (#94). The preview reads from the pool, unlocked.
 * @param executor The database, or the transaction a level-up runs in
 * @param characterId The character to read
 * @param draft The level-up's class, subclass, feat and picks
 * @param options `lock` takes the row lock; only a write should
 * @returns The class ledger, the stored choices, and the saves
 * @throws Error("Character not found.") when no such row exists
 */
const loadLevelUpSaves = async (
  executor: LevelUpExecutor,
  characterId: string,
  draft: LevelUpDraft,
  { lock }: { lock: boolean },
) => {
  const characterRead = executor
    .select()
    .from(characters)
    .where(eq(characters.id, characterId));
  const [character] = lock
    ? await characterRead.for("update")
    : await characterRead;
  if (!character) throw new Error("Character not found.");

  const existingClasses = await executor
    .select()
    .from(characterClasses)
    .where(eq(characterClasses.characterId, characterId))
    .orderBy(...classLedgerOrder);

  const storedChoices = readStoredChoices(character.choices, characterId);

  const saves = buildLevelUpSaves({
    character,
    ledger: existingClasses,
    storedChoices,
    targetClassId: draft.targetClassId,
    subclassId: draft.subclassId,
    featId: draft.featId,
    selectedTraits: draft.selectedTraits,
    traitSelections: draft.traitSelections,
  });

  return { existingClasses, storedChoices, saves };
};

/**
 * Applies a level-up to a character.
 * @param req The incoming request object containing the level-up payload.
 * @param res The response object used to send HTTP responses.
 */
export const applyLevelUp = async (req: Request, res: Response) => {
  const payload: LevelUpPayload = req.body;
  const { characterId, targetClassId, newTotalLevel } = payload;

  try {
    // shape-checked before anything is read or written, so a malformed pick
    // map never reaches a merge or the database
    const selectedTraits = parsePicksShape(payload.selectedTraits, "selectedTraits");
    const traitSelections = parsePicksShape(payload.traitSelections, "traitSelections");

    // resolved before the transaction opens: on a cache miss it queries the
    // module db, which from inside the transaction would take a second
    // connection from the pool (#89 final review, F2). The lock and
    // required-answer checks below (#69) need it for every level-up
    const { snapshot } = await getCachedRuleSnapshot();

    await db.transaction(async (tx) => {
      // 1-2 - the character (locked, #94), its class ledger and stored
      // answers, and the character before and after this level - the same
      // construction the level-up options use to list the questions the
      // wizard asks, so what this level requires is exactly what the wizard
      // offered. The subclass is the payload's, else the one stored for this
      // class (#69)
      const { existingClasses, storedChoices, saves } = await loadLevelUpSaves(
        tx,
        characterId,
        {
          targetClassId,
          subclassId: payload.subclassId,
          featId: payload.featId,
          selectedTraits,
          traitSelections,
        },
        { lock: true },
      );

      // the new total level comes from the ledger this transaction is about
      // to extend, never from the request. A level-up adds exactly one class
      // level, and since #78 the sheet's maximum hit points and both health
      // clamps derive from a level - so a column that disagrees with these
      // rows is visible, not cosmetic (#90)
      const derivedTotalLevel =
        existingClasses.reduce((total, row) => total + row.classLevel, 0) + 1;
      if (newTotalLevel !== derivedTotalLevel) {
        throw new Error(
          `Invalid character choices: newTotalLevel ${newTotalLevel} does not match the class ledger (${derivedTotalLevel})`,
        );
      }

      const { isMulticlassDip, targetClassLevel, targetClassRecord } = saves;
```

Everything after that line (`// 3 - SERVER VALIDATION` onward) is unchanged. It already reads `saves`, `storedChoices`, `existingClasses` and `snapshot` by those names.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `DATABASE_URL= pnpm --filter @project/server exec vitest run src/routes/__tests__/character.test.ts src/routes/__tests__/levelUp.questions.test.ts src/routes/__tests__/character.choices.test.ts src/controllers/__tests__/levelUpHitPoints.test.ts`
Expected: PASS — including the new lock test and every existing level-up test, unchanged.

- [ ] **Step 5: Restore line endings, full server suite, typecheck**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' apps/server/src/controllers/characterController.ts apps/server/src/routes/__tests__/character.test.ts
```

Run: `DATABASE_URL= pnpm --filter @project/server test` — PASS (499).
Run: `pnpm --filter @project/server typecheck` — exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/controllers/characterController.ts apps/server/src/routes/__tests__/character.test.ts
git commit -F - <<'EOF'
fix(server): a level-up reads its character FOR UPDATE (#94)

Two concurrent level-ups both read a ledger summing 3, both passed #90's
check, and both added hit points. The character read now takes a row
lock, so the second waits, reads the ledger the first wrote, and is
refused. The read moves into loadLevelUpSaves, which the hit point preview
(#88) will share, and the rule snapshot is resolved before the transaction
opens (#89 F2).

Co-Authored-By: <the trailer your session's attribution instruction supplies>
EOF
```

---

### Task 4: #95 — every web caller takes the level from the class ledger

**Files:**
- Create: `apps/web/src/utils/ledgerLevel.ts`, `apps/web/src/utils/__tests__/ledgerLevel.test.ts`, `apps/web/src/components/wizard/steps/__tests__/OverviewStep.test.tsx`, `apps/web/src/components/wizard/steps/__tests__/ReviewStep.test.tsx`
- Modify: `apps/web/src/store/characterSheetStore.ts`, `apps/web/src/components/sheet/DashboardLayout.tsx`, `apps/web/src/components/wizard/steps/OverviewStep.tsx`, `apps/web/src/components/wizard/steps/ReviewStep.tsx`
- Test: `apps/web/src/components/sheet/__tests__/DashboardLayout.test.tsx`

**Interfaces:**
- Produces: `ledgerTotalLevel(classLevels: Record<string, number>): number` in `apps/web/src/utils/ledgerLevel.ts`. It lives in its own module, not the store, because `DashboardLayout.test.tsx` mocks the whole store module.
- Produces (Task 6 extends it): `ReviewStep.test.tsx` with its harness (`render`, `rowCells`).

- [ ] **Step 1: Write the helper's failing test**

Create `apps/web/src/utils/__tests__/ledgerLevel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ledgerTotalLevel } from "../ledgerLevel";

describe("ledgerTotalLevel", () => {
  it("sums every class's level", () => {
    expect(ledgerTotalLevel({ class_bard: 6, class_rogue: 1 })).toBe(7);
  });

  it("is 0 for a character with no class yet", () => {
    expect(ledgerTotalLevel({})).toBe(0);
  });
});
```

- [ ] **Step 2: Write the callers' failing tests**

In `apps/web/src/components/sheet/__tests__/DashboardLayout.test.tsx`, append:

```tsx
describe("DashboardLayout level up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState = baseStoreState;
  });

  it("asks for the level after the class ledger's total, not the level column (#95)", async () => {
    // a row whose level column drifted to 5 while its ledger says fighter 3
    storeState = {
      ...baseStoreState,
      level: 5,
      classLevels: { class_fighter: 3 },
    };

    const { container, root } = await renderDashboard();
    const levelUp = findButton(container, "Level Up");
    expect(levelUp).toBeDefined();

    await act(async () => {
      levelUp!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.beginLevelUp).toHaveBeenCalledWith(
      "char_1",
      "class_fighter",
      3,
      4,
      { campaignId: "campaign_1" },
    );

    root.unmount();
    container.remove();
  });
});
```

Create `apps/web/src/components/wizard/steps/__tests__/OverviewStep.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { OverviewStep } from "../OverviewStep";
import { useCharacterSheetStore } from "../../../../store/characterSheetStore";
import { useLevelUpStore } from "../../../../store/levelUpStore";

const optionsData = vi.hoisted(() => ({
  classes: [
    { id: "class_fighter", name: "Fighter" },
    { id: "class_wizard", name: "Wizard" },
  ],
  supportByClass: {
    class_fighter: {
      targetLevel: 4,
      isConfigured: true,
      reason: null,
      multiclassPrerequisitesMet: null,
      multiclassPrerequisiteReason: null,
    },
    class_wizard: {
      targetLevel: 1,
      isConfigured: true,
      reason: null,
      multiclassPrerequisitesMet: true,
      multiclassPrerequisiteReason: null,
    },
  },
  nextLevel: null,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: optionsData, isLoading: false, isError: false }),
}));

const originalBeginLevelUp = useLevelUpStore.getState().beginLevelUp;
const beginLevelUp = vi.fn();

const render = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<OverviewStep />);
  });
  return { container, root };
};

describe("OverviewStep (#95)", () => {
  beforeEach(() => {
    beginLevelUp.mockReset();
    // a row whose level column drifted to 7 while its ledger says fighter 3
    useCharacterSheetStore.setState({
      id: "char_1",
      campaignId: "camp_1",
      level: 7,
      classLevels: { class_fighter: 3 },
    });
    useLevelUpStore.setState({
      beginLevelUp,
      draftPayload: { targetClassId: "class_fighter" },
      progressionContext: null,
      grantedTraitDetails: [],
      errorMessage: null,
    });
  });

  afterEach(() => {
    useLevelUpStore.setState({ beginLevelUp: originalBeginLevelUp });
  });

  it("names the new total level from the class ledger", async () => {
    const { container, root } = await render();

    expect(container.textContent).toContain("Total Level 4");
    expect(container.textContent).not.toContain("Total Level 8");

    root.unmount();
    container.remove();
  });

  it("starts a switched class's level-up at the ledger's total plus one", async () => {
    const { container, root } = await render();
    const select = container.querySelector("select")!;

    await act(async () => {
      select.value = "class_wizard";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(beginLevelUp).toHaveBeenCalledWith(
      "char_1",
      "class_wizard",
      0,
      4,
      { campaignId: "camp_1" },
      optionsData.supportByClass.class_wizard,
    );

    root.unmount();
    container.remove();
  });
});
```

Create `apps/web/src/components/wizard/steps/__tests__/ReviewStep.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ReviewStep } from "../ReviewStep";
import { useCharacterSheetStore } from "../../../../store/characterSheetStore";
import { useLevelUpStore } from "../../../../store/levelUpStore";
import { apiClient } from "../../../../api/client";

vi.mock("../../../../api/client", () => ({
  apiClient: vi.fn(),
  buildLevelUpOptionsEndpoint: vi.fn(),
}));

vi.mock("../../../../hooks/useCharacterStats", () => ({
  useAbilities: () => ({
    finalAbilities: {
      STR: { score: 16, modifier: 3 },
      DEX: { score: 12, modifier: 1 },
      CON: { score: 15, modifier: 2 },
      INT: { score: 10, modifier: 0 },
      WIS: { score: 13, modifier: 1 },
      CHA: { score: 8, modifier: -1 },
    },
  }),
}));

const render = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ReviewStep />);
  });
  return { container, root };
};

/** The text of each cell in the review table row whose first cell is `label`. */
const rowCells = (container: HTMLElement, label: string) => {
  const row = Array.from(container.querySelectorAll("tr")).find(
    (candidate) => candidate.querySelector("td")?.textContent === label,
  );
  return row
    ? Array.from(row.querySelectorAll("td")).map((cell) => cell.textContent ?? "")
    : undefined;
};

describe("ReviewStep level (#95)", () => {
  beforeEach(() => {
    vi.mocked(apiClient).mockReset();
    // a row whose level column drifted to 5 while its ledger says fighter 3
    useCharacterSheetStore.setState({ classLevels: { class_fighter: 3 }, level: 5 });
    useLevelUpStore.setState({
      isActive: true,
      draftPayload: {
        characterId: "char_1",
        targetClassId: "class_fighter",
        newTotalLevel: 4,
      },
      progressionContext: null,
      grantedTraitDetails: [],
    });
  });

  it("shows the current total level from the class ledger, not the level column", async () => {
    const { container, root } = await render();

    expect(rowCells(container, "Total Character Level")?.slice(0, 2)).toEqual([
      "Total Character Level",
      "3",
    ]);

    root.unmount();
    container.remove();
  });
});
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `pnpm --filter @project/web exec vitest run src/utils/__tests__/ledgerLevel.test.ts src/components/sheet/__tests__/DashboardLayout.test.tsx src/components/wizard/steps/__tests__/OverviewStep.test.tsx src/components/wizard/steps/__tests__/ReviewStep.test.tsx`
Expected: FAIL.
- `ledgerLevel.test.ts` cannot resolve `../ledgerLevel`.
- DashboardLayout's new test: `beginLevelUp` is called with `6`, not `4`.
- OverviewStep: "Total Level 8", and `7 + 1`.
- ReviewStep: the level cell is `5`.

- [ ] **Step 4: Implement**

Create `apps/web/src/utils/ledgerLevel.ts`:

```ts
/**
 * A character's total level, read from its class ledger.
 *
 * The ledger - one level count per class - is what the server derives a
 * level-up's expected total from, and what it writes the level column from
 * on success (#90). The column can drift from it; the ledger cannot. Every
 * web caller that needs a character's total level reads this rather than
 * the column, so a drifted row can still level up and be repaired (#95).
 * @param classLevels Class id -> that class's level
 * @returns The sum of every class's level
 */
export const ledgerTotalLevel = (classLevels: Record<string, number>): number =>
  Object.values(classLevels).reduce((sum, level) => sum + level, 0);
```

`apps/web/src/store/characterSheetStore.ts` — add `import { ledgerTotalLevel } from "../utils/ledgerLevel";` beside the other relative imports, and in `getMaxHp` replace:

```ts
      // the ledger's sum, not state.level: the class ledger is the source
      // both sides derive their total from. The server's finalMaxHp sums the
      // same character_classes rows rather than reading characters.level,
      // and since #90 applyLevelUp itself derives the column it writes from
      // that ledger and rejects a request that disagrees with it - so this
      // sum and state.level should always agree, but the ledger is still the
      // authority to read (#78 final review, F2; #90 closed)
      const totalLevel = Object.values(state.classLevels).reduce(
        (sum, level) => sum + level,
        0,
      );
```

with:

```ts
      // the ledger, not state.level: the server's finalMaxHp sums the same
      // character_classes rows, and applyLevelUp writes the column from them
      // (#78 final review, F2; #90; #95)
      const totalLevel = ledgerTotalLevel(state.classLevels);
```

`apps/web/src/components/sheet/DashboardLayout.tsx` — add `import { ledgerTotalLevel } from "../../utils/ledgerLevel";` after the `useLevelUpStore` import, and in the Level Up button's `beginLevelUp(...)` call replace `                character.level + 1,` with:

```tsx
                // the ledger's total, which the server checks this against -
                // a drifted level column would be refused on every try (#95)
                ledgerTotalLevel(character.classLevels) + 1,
```

`apps/web/src/components/wizard/steps/OverviewStep.tsx` — add `import { ledgerTotalLevel } from "../../../utils/ledgerLevel";` after the `useLevelUpStore` import, and replace `  const totalLevel = useCharacterSheetStore((state) => state.level);` with:

```tsx
  // the ledger's total, not the level column: the server checks a
  // level-up against the ledger, and a drifted column would be refused (#95)
  const totalLevel = useCharacterSheetStore((state) =>
    ledgerTotalLevel(state.classLevels),
  );
```

`apps/web/src/components/wizard/steps/ReviewStep.tsx` — add `import { ledgerTotalLevel } from "../../../utils/ledgerLevel";` after the `useLevelUpStore` import, and replace `  const currentTotalLevel = useCharacterSheetStore((state) => state.level);` with:

```tsx
  // the ledger's total, as the level-up itself counts it (#95)
  const currentTotalLevel = useCharacterSheetStore((state) =>
    ledgerTotalLevel(state.classLevels),
  );
```

- [ ] **Step 5: Run the tests to verify they pass**

Run the Step 3 command. Expected: PASS.

- [ ] **Step 6: Restore line endings, full web suite, typecheck**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' apps/web/src/utils/ledgerLevel.ts apps/web/src/utils/__tests__/ledgerLevel.test.ts apps/web/src/store/characterSheetStore.ts apps/web/src/components/sheet/DashboardLayout.tsx apps/web/src/components/sheet/__tests__/DashboardLayout.test.tsx apps/web/src/components/wizard/steps/OverviewStep.tsx apps/web/src/components/wizard/steps/ReviewStep.tsx apps/web/src/components/wizard/steps/__tests__/OverviewStep.test.tsx apps/web/src/components/wizard/steps/__tests__/ReviewStep.test.tsx
```

Run: `pnpm --filter @project/web test` — PASS (460 + 6).
Run: `pnpm --filter @project/web typecheck` — exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/utils/ledgerLevel.ts apps/web/src/utils/__tests__/ledgerLevel.test.ts apps/web/src/store/characterSheetStore.ts apps/web/src/components/sheet/DashboardLayout.tsx apps/web/src/components/sheet/__tests__/DashboardLayout.test.tsx apps/web/src/components/wizard/steps/OverviewStep.tsx apps/web/src/components/wizard/steps/ReviewStep.tsx apps/web/src/components/wizard/steps/__tests__/OverviewStep.test.tsx apps/web/src/components/wizard/steps/__tests__/ReviewStep.test.tsx
git commit -F - <<'EOF'
fix(web): every level-up caller takes the level from the class ledger (#95)

Both Level Up entry points sent newTotalLevel from the level column, which
the server checks against the class ledger, so a row whose column had
drifted was refused forever. DashboardLayout, the wizard's class switcher
and label, and the review step's level row now read ledgerTotalLevel; the
server's existing write repairs a drifted column on the next level-up.

Co-Authored-By: <the trailer your session's attribution instruction supplies>
EOF
```

---

### Task 5: #88 (server) — a read-only hit point preview for a level-up draft

**Files:**
- Modify: `apps/server/src/controllers/characterController.ts`, `apps/server/src/routes/character.ts`
- Create: `apps/server/src/routes/__tests__/levelUpPreview.test.ts`

**Interfaces:**
- Consumes: `loadLevelUpSaves` and `LevelUpDraft` (Task 3); `levelUpHitPointGain`, `parsePicksShape`, `finalMaxHp` (already in the controller).
- Produces: `POST /api/character/:characterId/level-up/preview`.
  - Body: `targetClassId: string` and `hpRoll: number` are required; `asiChoices`, `featId`, `subclassId`, `selectedTraits` and `traitSelections` are optional.
  - `200 { maxHpBefore: number, maxHpAfter: number, hitPointGain: number }`.
  - `400 { success: false, error }`, and the same 401/404/403 as the level-up route.
- Exported: `previewLevelUp(req, res)` from the controller.

- [ ] **Step 1: Write the failing route tests**

Create `apps/server/src/routes/__tests__/levelUpPreview.test.ts`:

```ts
import path from "node:path";
import express, { type Request } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assembleCoreRulePack } from "@project/database/pack";
import { toRuleSnapshot, type CoreRulePackSnapshot } from "@project/shared";
import { FakeDb } from "../../gateway/__tests__/fakeDb.js";
import { globalErrorHandler } from "../../middleware/errorHandler.js";

const PACK_DIR = path.join(
  process.cwd(),
  "../../packages/database/data/packs/core_2014_pack",
);

/**
 * A hill dwarf fighter 3 (Champion): CON 13 stored, 15 with the dwarf's +2,
 * 22 rolled - the sample Brannoc Hale, whose level 4 the review step used to
 * preview wrongly (#88).
 */
const brannoc = {
  id: "char-1",
  campaignId: "camp-1",
  name: "Brannoc Hale",
  level: 3,
  raceId: "race_dwarf",
  subraceId: "subrace_dwarf_hill",
  backgroundId: "background_soldier",
  str: 16,
  dex: 12,
  con: 13,
  int: 10,
  wis: 12,
  cha: 8,
  maxHp: 22,
  currentHp: 31,
  choices: {
    feats: [],
    classSelections: {
      class_fighter: { fighter_level_1_fighting_style: ["trait_fs_dueling"] },
    },
    traitSelections: {
      dwarf_artisan_tools: ["masons_tools"],
      soldier_gaming_set: ["playing_card_set"],
      fighter_starting_skills: ["perception", "survival"],
    },
  },
};

const ledger = [
  {
    id: "ledger-1",
    characterId: "char-1",
    classId: "class_fighter",
    classLevel: 3,
    subclassId: "subclass_fighter_champion",
    position: 0,
  },
];

describe("POST /api/character/:characterId/level-up/preview (#88)", () => {
  const consoleErrorSpy = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
  let snapshot: CoreRulePackSnapshot;

  beforeAll(async () => {
    snapshot = toRuleSnapshot(await assembleCoreRulePack(PACK_DIR));
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  const setupApp = async ({
    rows = [brannoc],
    member = true,
  }: { rows?: Array<Record<string, unknown>>; member?: boolean } = {}) => {
    vi.resetModules();

    const fakeDb = new FakeDb()
      .seed("characters", rows)
      .seed("character_classes", ledger);

    vi.doMock("@project/database", () => ({ db: fakeDb }));
    vi.doMock("../../services/campaignAccess.js", () => ({
      isUserCampaignMember: vi.fn().mockResolvedValue(member),
    }));
    vi.doMock("../../services/ruleSnapshotCache.js", () => ({
      getCachedRuleSnapshot: async () => ({
        cacheVersion: 1,
        loadedAt: 0,
        snapshot,
      }),
      invalidateRuleSnapshotCache: () => undefined,
    }));

    const { default: characterRoutes } = await import("../character.js");

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as Request & { user?: { id: string } }).user = { id: "test-user" };
      next();
    });
    app.use("/api/character", characterRoutes);
    app.use(globalErrorHandler);

    return { app, fakeDb };
  };

  it("previews the gain the level-up stores, counting a Constitution increase's earlier levels", async () => {
    const { app } = await setupApp();

    const response = await request(app)
      .post("/api/character/char-1/level-up/preview")
      .send({
        targetClassId: "class_fighter",
        hpRoll: 6,
        asiChoices: [
          { stat: "CON", value: 1 },
          { stat: "STR", value: 1 },
        ],
      });

    // before: 22 + 2 x 3 + Dwarven Toughness 3 = 31. After: 28 rolled +
    // 3 x 4 (CON 16) + 4 = 44. The old preview said 6 + 3 = 9
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      maxHpBefore: 31,
      maxHpAfter: 44,
      hitPointGain: 13,
    });
  });

  it("reads without opening a transaction", async () => {
    const { app, fakeDb } = await setupApp();

    await request(app)
      .post("/api/character/char-1/level-up/preview")
      .send({ targetClassId: "class_fighter", hpRoll: 6 });

    expect(fakeDb.transaction).not.toHaveBeenCalled();
  });

  it("refuses a draft with no class", async () => {
    const { app } = await setupApp();

    const response = await request(app)
      .post("/api/character/char-1/level-up/preview")
      .send({ hpRoll: 6 });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("targetClassId");
  });

  it("refuses a roll that is not a number", async () => {
    const { app } = await setupApp();

    const response = await request(app)
      .post("/api/character/char-1/level-up/preview")
      .send({ targetClassId: "class_fighter", hpRoll: "6" });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("hpRoll");
  });

  it("returns 404 for a character that does not exist", async () => {
    const { app } = await setupApp({ rows: [] });

    const response = await request(app)
      .post("/api/character/char-1/level-up/preview")
      .send({ targetClassId: "class_fighter", hpRoll: 6 });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Character not found." });
  });

  it("returns 403 to a user outside the character's campaign", async () => {
    const { app } = await setupApp({ member: false });

    const response = await request(app)
      .post("/api/character/char-1/level-up/preview")
      .send({ targetClassId: "class_fighter", hpRoll: 6 });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "Forbidden campaign access." });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `DATABASE_URL= pnpm --filter @project/server exec vitest run src/routes/__tests__/levelUpPreview.test.ts`
Expected: FAIL — every test gets 404 (no such route).

- [ ] **Step 3: Add `previewLevelUp` to the controller**

In `apps/server/src/controllers/characterController.ts`, append after `applyLevelUp`:

```ts
/**
 * What a level-up draft would do to hit points, without applying it.
 *
 * Builds the character before and after through the same loadLevelUpSaves
 * applyLevelUp uses, then measures both with finalMaxHp and
 * levelUpHitPointGain - so the level-up wizard previews exactly the number
 * the write will store, including an ability score increase that raises
 * every earlier level's Constitution contribution (#88). Read-only: no
 * transaction, no lock, and no validation of the draft's choices, which the
 * real submit still performs in full.
 * @param req The request, its body the wizard's draft
 * @param res The response: the maximum before and after, and the gain
 */
export const previewLevelUp = async (req: Request, res: Response) => {
  const payload = req.body as Partial<LevelUpPayload> & { characterId: string };
  const { characterId, targetClassId, hpRoll } = payload;

  if (
    typeof targetClassId !== "string" ||
    targetClassId.length === 0 ||
    typeof hpRoll !== "number" ||
    !Number.isFinite(hpRoll)
  ) {
    return res.status(400).json({
      success: false,
      error: "A hit point preview needs a targetClassId and a numeric hpRoll.",
    });
  }

  try {
    const selectedTraits = parsePicksShape(payload.selectedTraits, "selectedTraits");
    const traitSelections = parsePicksShape(payload.traitSelections, "traitSelections");
    const { snapshot } = await getCachedRuleSnapshot();

    const { saves } = await loadLevelUpSaves(
      db,
      characterId,
      {
        targetClassId,
        subclassId: payload.subclassId,
        featId: payload.featId,
        selectedTraits,
        traitSelections,
      },
      { lock: false },
    );

    const maxHpBefore = finalMaxHp(saves.before, snapshot);
    const hitPointGain = levelUpHitPointGain({
      saves,
      payload: {
        hpRoll,
        ...(payload.asiChoices ? { asiChoices: payload.asiChoices } : {}),
      },
      snapshot,
    });

    return res.status(200).json({
      maxHpBefore,
      maxHpAfter: maxHpBefore + hitPointGain,
      hitPointGain,
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
};
```

- [ ] **Step 4: Share the route gate and add the preview route**

In `apps/server/src/routes/character.ts`:

Change `import { Router, type Router as ExpressRouter } from "express";` to:

```ts
import {
  Router,
  type Request,
  type Response,
  type Router as ExpressRouter,
} from "express";
```

and change `import { applyLevelUp } from "../controllers/characterController.js";` to `import { applyLevelUp, previewLevelUp } from "../controllers/characterController.js";`.

Replace the whole `// #region POST /api/character/:characterId/level-up` region, from its doc comment through its `// #endregion`, with:

```ts
// #region POST /api/character/:characterId/level-up

/**
 * The gate both level-up routes share: an authenticated user, a character
 * that exists, a campaign that user belongs to, and a body that - if it names
 * a character at all - names this one. Sends the refusal itself and returns
 * false when the request may not go on; otherwise stamps the path's id onto
 * the body, where the controllers read it.
 * @param req The request, with the character id in its path
 * @param res The response the refusal is sent on
 * @returns Whether the request may go on to its controller
 */
const admitLevelUpRequest = async (
  req: Request<{ characterId: string }>,
  res: Response,
): Promise<boolean> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized request" });
    return false;
  }

  const characterId = req.params.characterId;
  const [character] = await db
    .select({ id: characters.id, campaignId: characters.campaignId })
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);

  if (!character) {
    res.status(404).json({ error: "Character not found." });
    return false;
  }

  const canAccess = await isUserCampaignMember(userId, character.campaignId);
  if (!canAccess) {
    res.status(403).json({ error: "Forbidden campaign access." });
    return false;
  }

  if (req.body?.characterId && req.body.characterId !== characterId) {
    res.status(400).json({ error: "Character id mismatch in payload." });
    return false;
  }

  req.body = {
    ...req.body,
    characterId,
  };
  return true;
};

/**
 * POST /api/character/:characterId/level-up
 * Applies a validated level-up payload for the requested character.
 * @param characterId - The ID of the character to level up.
 */
router.post("/:characterId/level-up", async (req, res, next) => {
  try {
    if (!(await admitLevelUpRequest(req, res))) return;
    return applyLevelUp(req, res);
  } catch (error) {
    next(error);
  }
});

// #endregion

// #region POST /api/character/:characterId/level-up/preview

/**
 * POST /api/character/:characterId/level-up/preview
 * What a level-up draft would do to hit points, without applying it (#88).
 * @param characterId - The ID of the character the draft levels up.
 */
router.post("/:characterId/level-up/preview", async (req, res, next) => {
  try {
    if (!(await admitLevelUpRequest(req, res))) return;
    return previewLevelUp(req, res);
  } catch (error) {
    next(error);
  }
});

// #endregion
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `DATABASE_URL= pnpm --filter @project/server exec vitest run src/routes/__tests__/levelUpPreview.test.ts src/routes/__tests__/character.test.ts`
Expected: PASS — the six preview tests, and the level-up route's tests unchanged.

- [ ] **Step 6: Restore line endings, full server suite, typecheck**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' apps/server/src/controllers/characterController.ts apps/server/src/routes/character.ts apps/server/src/routes/__tests__/levelUpPreview.test.ts
```

Run: `DATABASE_URL= pnpm --filter @project/server test` — PASS (505).
Run: `pnpm --filter @project/server typecheck` — exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/controllers/characterController.ts apps/server/src/routes/character.ts apps/server/src/routes/__tests__/levelUpPreview.test.ts
git commit -F - <<'EOF'
feat(server): preview a level-up's hit points without applying it (#88)

POST /api/character/:characterId/level-up/preview builds the character
before and after through the same loadLevelUpSaves the level-up uses and
returns the maximum before, after and the gain levelUpHitPointGain stores.
Both level-up routes now share one access gate.

Co-Authored-By: <the trailer your session's attribution instruction supplies>
EOF
```

---

### Task 6: #88 (web) — the review step shows the server's hit points

**Files:**
- Modify: `apps/web/src/store/levelUpStore.ts`, `apps/web/src/components/wizard/steps/ReviewStep.tsx`, `apps/web/src/hooks/__tests__/useCharacterStats.test.ts`
- Delete: `apps/web/src/utils/levelUpReview.ts`
- Test: `apps/web/src/store/__tests__/levelUpStore.test.ts`, `apps/web/src/components/wizard/steps/__tests__/ReviewStep.test.tsx`

**Interfaces:**
- Consumes: the preview endpoint (Task 5); the `ReviewStep.test.tsx` harness (Task 4).
- Produces (on `useLevelUpStore`):
  - `hitPointPreview`, one of `{ status: "idle" }`, `{ status: "loading" }`, `{ status: "ready"; maxHpBefore: number; maxHpAfter: number; hitPointGain: number }` or `{ status: "error" }`.
  - `requestHitPointPreview: () => Promise<void>`.

- [ ] **Step 1: Write the failing store tests**

Append to `apps/web/src/store/__tests__/levelUpStore.test.ts`:

```ts
describe("useLevelUpStore hit point preview (#88)", () => {
  const draft = {
    characterId: "char_1",
    targetClassId: "class_fighter",
    newTotalLevel: 4,
    hpRoll: 6,
    asiChoices: [{ stat: "CON" as const, value: 1 }],
  };

  beforeEach(() => {
    vi.mocked(apiClient).mockReset();
    useLevelUpStore.setState({
      isActive: true,
      draftPayload: draft,
      hitPointPreview: { status: "idle" },
    });
  });

  it("posts the draft to the preview endpoint and keeps the server's numbers", async () => {
    vi.mocked(apiClient).mockResolvedValueOnce({
      maxHpBefore: 31,
      maxHpAfter: 42,
      hitPointGain: 11,
    });

    await useLevelUpStore.getState().requestHitPointPreview();

    const [endpoint, options] = vi.mocked(apiClient).mock.calls[0]!;
    expect(endpoint).toBe("/character/char_1/level-up/preview");
    expect(options?.method).toBe("POST");
    expect(JSON.parse(options!.body as string)).toEqual({
      targetClassId: "class_fighter",
      hpRoll: 6,
      asiChoices: [{ stat: "CON", value: 1 }],
    });
    expect(useLevelUpStore.getState().hitPointPreview).toEqual({
      status: "ready",
      maxHpBefore: 31,
      maxHpAfter: 42,
      hitPointGain: 11,
    });
  });

  it("records a failed preview as an error, never a guess", async () => {
    vi.mocked(apiClient).mockRejectedValueOnce(new Error("offline"));

    await useLevelUpStore.getState().requestHitPointPreview();

    expect(useLevelUpStore.getState().hitPointPreview).toEqual({
      status: "error",
    });
  });

  it("asks nothing until the draft has a class and a roll", async () => {
    useLevelUpStore.setState({
      draftPayload: { characterId: "char_1", targetClassId: "class_fighter" },
    });

    await useLevelUpStore.getState().requestHitPointPreview();

    expect(apiClient).not.toHaveBeenCalled();
    expect(useLevelUpStore.getState().hitPointPreview).toEqual({
      status: "idle",
    });
  });

  it("keeps only the newest answer when two previews overlap", async () => {
    let answerFirst!: (value: unknown) => void;
    vi.mocked(apiClient)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answerFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ maxHpBefore: 31, maxHpAfter: 44, hitPointGain: 13 });

    const first = useLevelUpStore.getState().requestHitPointPreview();
    await useLevelUpStore.getState().requestHitPointPreview();
    answerFirst({ maxHpBefore: 31, maxHpAfter: 40, hitPointGain: 9 });
    await first;

    expect(useLevelUpStore.getState().hitPointPreview).toEqual({
      status: "ready",
      maxHpBefore: 31,
      maxHpAfter: 44,
      hitPointGain: 13,
    });
  });
});
```

- [ ] **Step 2: Write the failing review-step tests**

Append to `apps/web/src/components/wizard/steps/__tests__/ReviewStep.test.tsx`:

```tsx
describe("ReviewStep hit point preview (#88)", () => {
  beforeEach(() => {
    vi.mocked(apiClient).mockReset();
    useCharacterSheetStore.setState({ classLevels: { class_fighter: 3 }, level: 3 });
    useLevelUpStore.setState({
      isActive: true,
      draftPayload: {
        characterId: "char_1",
        targetClassId: "class_fighter",
        newTotalLevel: 4,
        hpRoll: 6,
        asiChoices: [
          { stat: "CON", value: 1 },
          { stat: "STR", value: 1 },
        ],
      },
      progressionContext: null,
      grantedTraitDetails: [],
      hitPointPreview: { status: "idle" },
    });
  });

  it("shows the server's maximum before, after and the gain", async () => {
    vi.mocked(apiClient).mockResolvedValueOnce({
      maxHpBefore: 31,
      maxHpAfter: 44,
      hitPointGain: 13,
    });

    const { container, root } = await render();
    await act(async () => {});

    const cells = rowCells(container, "Maximum Hit Points");
    expect(cells?.[1]).toBe("31");
    expect(cells?.[3]).toBe("44+13");
    expect(vi.mocked(apiClient)).toHaveBeenCalledWith(
      "/character/char_1/level-up/preview",
      expect.objectContaining({ method: "POST" }),
    );

    root.unmount();
    container.remove();
  });

  it("says it is calculating while the preview is pending", async () => {
    vi.mocked(apiClient).mockReturnValueOnce(new Promise(() => {}));

    const { container, root } = await render();

    expect(rowCells(container, "Maximum Hit Points")?.[3]).toBe("Calculating…");

    root.unmount();
    container.remove();
  });

  it("says the preview is unavailable when the server cannot answer", async () => {
    vi.mocked(apiClient).mockRejectedValueOnce(new Error("offline"));

    const { container, root } = await render();
    await act(async () => {});

    expect(rowCells(container, "Maximum Hit Points")?.[3]).toBe(
      "Hit point preview unavailable",
    );

    root.unmount();
    container.remove();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm --filter @project/web exec vitest run src/store/__tests__/levelUpStore.test.ts src/components/wizard/steps/__tests__/ReviewStep.test.tsx`
Expected: FAIL.
- The store tests fail because `requestHitPointPreview` is not a function.
- The review-step tests fail because the Maximum Hit Points row shows the local estimate (`6 + 3`) and the API is never called.

- [ ] **Step 4: Add the preview to the store**

In `apps/web/src/store/levelUpStore.ts`:

Directly below `let latestOptionsRequest = 0;`, add:

```ts

/** What the server says a level-up draft would do to hit points (#88). */
type HitPointPreview =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      maxHpBefore: number;
      maxHpAfter: number;
      hitPointGain: number;
    }
  | { status: "error" };

const IDLE_PREVIEW: HitPointPreview = { status: "idle" };

// every preview request gets a number too; only the newest one's answer lands
let latestHitPointPreview = 0;
```

In `interface LevelUpState`, directly after `  refreshChoiceQuestions: () => Promise<void>;`, add:

```ts
  /** the server's hit point preview for the current draft (#88) */
  hitPointPreview: HitPointPreview;
  /** asks the server what the current draft would do to hit points (#88) */
  requestHitPointPreview: () => Promise<void>;
```

Add `hitPointPreview: IDLE_PREVIEW,` to each of the four `set`/initial-state objects that write `optionsRequest`:
- in the initial state, after `  optionsRequest: null,`
- in `beginLevelUp`'s success `set`, after `optionsRequest: { characterId, classId, currentClassLevel, scope },`
- in `validateAndSubmit`'s reset, after `optionsRequest: null,`
- in `cancelLevelUp`'s reset, after `optionsRequest: null,`

Directly before `  validateAndSubmit: async () => {`, add:

```ts
  requestHitPointPreview: async () => {
    const {
      characterId,
      targetClassId,
      hpRoll,
      asiChoices,
      featId,
      subclassId,
      selectedTraits,
      traitSelections,
    } = get().draftPayload;

    if (!characterId || !targetClassId || !hpRoll) {
      set({ hitPointPreview: IDLE_PREVIEW });
      return;
    }

    const requestId = ++latestHitPointPreview;
    set({ hitPointPreview: { status: "loading" } });

    try {
      const preview = (await apiClient(
        `/character/${characterId}/level-up/preview`,
        {
          method: "POST",
          body: JSON.stringify({
            targetClassId,
            hpRoll,
            asiChoices,
            featId,
            subclassId,
            selectedTraits,
            traitSelections,
          }),
        },
      )) as { maxHpBefore: number; maxHpAfter: number; hitPointGain: number };

      // a newer draft asked again, or the wizard closed: this answer is stale
      if (requestId !== latestHitPointPreview || !get().isActive) return;
      set({
        hitPointPreview: {
          status: "ready",
          maxHpBefore: preview.maxHpBefore,
          maxHpAfter: preview.maxHpAfter,
          hitPointGain: preview.hitPointGain,
        },
      });
    } catch {
      if (requestId !== latestHitPointPreview || !get().isActive) return;
      set({ hitPointPreview: { status: "error" } });
    }
  },

```

- [ ] **Step 5: Show it in the review step, and delete the estimate**

In `apps/web/src/components/wizard/steps/ReviewStep.tsx`:

Change `import { useMemo } from "react";` to `import { useEffect, useMemo } from "react";` and delete the line `import { getProjectedConModifier } from "../../../utils/levelUpReview";`.

Replace:

```tsx
  const { draftPayload, progressionContext, grantedTraitDetails } =
    useLevelUpStore();
```

with:

```tsx
  const {
    draftPayload,
    progressionContext,
    grantedTraitDetails,
    hitPointPreview,
    requestHitPointPreview,
  } = useLevelUpStore();
```

Directly after the `const { finalAbilities } = useAbilities();` line, add:

```tsx

  // the server's answer, not an estimate: an ability score increase that
  // raises Constitution also raises every earlier level, which only the
  // saves the level-up itself builds can see (#88)
  useEffect(() => {
    void requestHitPointPreview();
  }, [
    requestHitPointPreview,
    draftPayload.hpRoll,
    draftPayload.asiChoices,
    draftPayload.featId,
    draftPayload.subclassId,
  ]);
```

Replace the whole `// HIT POINTS` block:

```tsx
    // HIT POINTS
    // note if CON mod increased this lvl the exact projected HP requires full engine exec
    // for clarity, approximate delta visually based on the raw roll + current CON
    if (draftPayload.hpRoll) {
      const projectedConMod = getProjectedConModifier(
        finalAbilities,
        draftPayload.asiChoices,
      );
      const totalHpGain = draftPayload.hpRoll + projectedConMod;
      changes.push({
        category: "Vitals",
        label: "Maximum Hit Points",
        current: currentMaxHp,
        next: currentMaxHp + totalHpGain,
        delta: `+${totalHpGain}`,
      });
    }
```

with:

```tsx
    // HIT POINTS - the server's preview, never an estimate (#88)
    if (draftPayload.hpRoll) {
      changes.push(
        hitPointPreview.status === "ready"
          ? {
              category: "Vitals",
              label: "Maximum Hit Points",
              current: hitPointPreview.maxHpBefore,
              next: hitPointPreview.maxHpAfter,
              delta: `+${hitPointPreview.hitPointGain}`,
            }
          : {
              category: "Vitals",
              label: "Maximum Hit Points",
              current: currentMaxHp,
              next:
                hitPointPreview.status === "error"
                  ? "Hit point preview unavailable"
                  : "Calculating…",
              delta: "",
            },
      );
    }
```

Add `hitPointPreview,` to that `useMemo`'s dependency array (after `draftPayload,`).

In the table row's JSX, replace:

```tsx
                    <span className="text-xs font-black bg-green-100 text-green-800 px-1.5 py-0.5 rounded">
                      {diff.delta}
                    </span>
```

with:

```tsx
                    {diff.delta ? (
                      <span className="text-xs font-black bg-green-100 text-green-800 px-1.5 py-0.5 rounded">
                        {diff.delta}
                      </span>
                    ) : null}
```

Delete `apps/web/src/utils/levelUpReview.ts` (`git rm apps/web/src/utils/levelUpReview.ts`).

In `apps/web/src/hooks/__tests__/useCharacterStats.test.ts`, delete the line `import { getProjectedConModifier } from "../../utils/levelUpReview";` and the whole test `it("projects the Constitution modifier from the current ASI allocation", () => { … });`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @project/web exec vitest run src/store/__tests__/levelUpStore.test.ts src/components/wizard/steps/__tests__/ReviewStep.test.tsx src/hooks/__tests__/useCharacterStats.test.ts`
Expected: PASS.

- [ ] **Step 7: Restore line endings, full web suite, typecheck**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' apps/web/src/store/levelUpStore.ts apps/web/src/store/__tests__/levelUpStore.test.ts apps/web/src/components/wizard/steps/ReviewStep.tsx apps/web/src/components/wizard/steps/__tests__/ReviewStep.test.tsx apps/web/src/hooks/__tests__/useCharacterStats.test.ts
```

Run: `pnpm --filter @project/web test` — PASS (466 + 7 − 1).
Run: `pnpm --filter @project/web typecheck` — exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/store/levelUpStore.ts apps/web/src/store/__tests__/levelUpStore.test.ts apps/web/src/components/wizard/steps/ReviewStep.tsx apps/web/src/components/wizard/steps/__tests__/ReviewStep.test.tsx apps/web/src/hooks/__tests__/useCharacterStats.test.ts apps/web/src/utils/levelUpReview.ts
git commit -F - <<'EOF'
fix(web): the level-up review shows the server's hit point gain (#88)

The review step previewed the roll plus the new Constitution modifier,
missing an increase's effect on every earlier level. It now asks the
preview endpoint and shows the maximum before, after and the gain -
"Calculating..." while pending, "Hit point preview unavailable" on a
failure, never an estimate. getProjectedConModifier is deleted.

Co-Authored-By: <the trailer your session's attribution instruction supplies>
EOF
```

---

### Task 7: Docs — the live checks and the backlog

**Files:**
- Modify: `docs/development/sample-characters.md`, `docs/TODO_BACKLOG.md`

No code; the gate is that every number matches the code from Tasks 1–6.

- [ ] **Step 1: Update `docs/development/sample-characters.md`** (exact replacements; restore CRLF afterwards)

In the coverage table's Nyx Vale row, `| 1/78 |` → `| 1/80 |`.

In the scenario table's Seraphine Dusk row, `| 33/47 |` → `| 21/29 |`.

Brannoc Hale, replace step 3:

```markdown
3. **Level Up → Fighter 4**, taking the increase as +1 CON and +1 STR. Note the
   review step's previewed hit point gain, then submit. The stored gain is at
   least 3 more than the preview (#88): CON 16 also raises the three earlier
   levels by one each. *After #88:* the preview matches.
```

with:

```markdown
3. **Level Up → Fighter 4 (#88, a regression check)**, taking the increase as
   +1 CON and +1 STR with a roll of 6. The review step asks the server and
   shows 31 → 44 (+13) — the gain the level-up stores, CON 16 raising the three
   earlier levels included. Submit: the sheet reads 44/44.
```

Brannoc Hale step 4: replace `4. **Double submit (#94).**` with `4. **Double submit (#94, a regression check).**`, and replace:

```markdown
   **Today:** both succeed; he is level 4 with two levels' worth of hit points.
   *After #94:* the second is refused.
```

with:

```markdown
   **Today:** the first succeeds; the second waits for it, then is refused
   (400, "newTotalLevel 4 does not match the class ledger (5)"), so he gains
   one level's hit points.
```

Seraphine Dusk, replace step 1:

```markdown
1. **The maximum (#86).** The sheet shows 47. The rules give 29: Constitution 8
   is -1 per level, and `calculateMaxHp` floors the modifier at +1, so nine
   levels come out 18 too high. *After #86:* 29, and
   `sampleCharacterHitPoints.test.ts` goes red until its number is updated.
```

with:

```markdown
1. **The maximum (#86, a regression check).** The sheet shows 29: Constitution
   8 is -1 per level, 38 rolled - 9. Before #86 the engine floored the modifier
   at +1 and showed 47.
```

Brother Mote, replace step 1:

```markdown
1. **The level (#95).** The header reads level 12; the class ledger reads
   Cleric 11. Level Up and submit: the server refuses it (400), every time, and
   nothing in the UI can repair the row. *After #95:* a reconciliation decides
   the row's level.
```

with:

```markdown
1. **The level (#95, a regression check).** The header reads level 12; the
   class ledger reads Cleric 11. Level Up and submit: it succeeds. The wizard
   takes his total from the ledger and asks for 12, which the server accepts;
   the ledger reaches Cleric 12 and now agrees with the column. Re-seed to
   restore the drift.
```

- [ ] **Step 2: Count the tests the backlog will cite**

Run: `DATABASE_URL= pnpm test:all`
Expected: PASS. Add up the five `Tests  N passed` lines (shared, engine, database, server, web); call the sum TOTAL.

- [ ] **Step 3: Close the five items in `docs/TODO_BACKLOG.md`**

Run this, replacing `TOTAL` with the number from Step 2 (the script moves the five Open-items entries to the top of Closed items with their closure notes, flips their Item-index rows, rewrites the status paragraph, and adds the Tier 2 re-ordering note; it refuses to run if any anchor is missing):

```bash
node - TOTAL <<'EOF'
const fs = require("fs");
const file = "docs/TODO_BACKLOG.md";
const total = Number(process.argv[2]);
if (!Number.isInteger(total) || total < 2403) throw new Error(`bad total: ${process.argv[2]}`);
const raw = fs.readFileSync(file, "utf8");
if (!raw.includes("\r\n")) throw new Error("expected a CRLF file");
const lines = raw.split("\r\n");
const must = (index, what) => { if (index < 0) throw new Error(`missing anchor: ${what}`); return index; };

const closures = {
  86: "**Closed 2026-09-24** on `fix/hp-level-up`. `calculateMaxHp` counts the Constitution modifier at its full value, negative included, and floors the rolled-plus-Constitution sum at 1 per level, adding a \"Minimum 1 HP per level\" breakdown line when the floor lifts it. The server test moved to 13 (with #87), the web store block's fixture base to 10, and Seraphine Dusk derives 29 (her seeded current hit points dropped from 33 to 21 so she stays wounded rather than over her maximum). **Residual, recorded rather than solved:** rolls are stored as a sum, so a single level whose roll plus a negative modifier fell below 1 is understated by the shortfall; only storing per-level rolls would fix that.",
  87: "**Closed 2026-09-24** on `fix/hp-level-up`. The modifier names `class_sorcerer`, patched with `patchPackSegment.ts` (whose printer also expanded the same trait's one-line `forbiddenStates` array, the only line in `traits/ported.json` that does not round-trip). `validateCoreRulePack` now rejects any entry scaled by `class_level` or `class_level_thresholds` that names no `scalingClassId` (`missing_scaling_class`), walking the whole pack so modifiers, critical-hit dice and damage segments are all covered. Nyx Vale derives 80.",
  88: "**Closed 2026-09-24** on `fix/hp-level-up`. `POST /api/character/:characterId/level-up/preview` returns `{ maxHpBefore, maxHpAfter, hitPointGain }`, built by the same `loadLevelUpSaves` `applyLevelUp` uses, and the review step shows those numbers: \"Calculating…\" while pending and \"Hit point preview unavailable\" on a failure, never an estimate. `getProjectedConModifier` is deleted. Brannoc Hale at fighter 3 → 4 with +1 CON and +1 STR on a roll of 6 previews 31 → 44 (+13); the old preview said +9.",
  94: "**Closed 2026-09-24** on `fix/hp-level-up`. `applyLevelUp` reads the character `FOR UPDATE` through `loadLevelUpSaves`, so a second concurrent level-up waits for the first to commit, then reads the ledger it wrote and fails #90's check. The rule snapshot is now resolved before the transaction opens, per #89's F2.",
  95: "**Closed 2026-09-24** on `fix/hp-level-up`, in the callers rather than with a reconciliation: `DashboardLayout`'s Level Up, `OverviewStep`'s class switcher and label, and `ReviewStep`'s level row take a character's total level from its class ledger (`ledgerTotalLevel`), so a drifted row levels up normally and the server's existing write repairs its column. Brother Mote, the drifted sample, now levels up. The sheet header still shows the column.",
};
const ids = [86, 87, 88, 94, 95];

for (const n of ids) {
  const i = must(lines.findIndex((l) => l.startsWith(`| ${n} | `) && l.endsWith("| Open | Open items (11h) |")), `index row ${n}`);
  lines[i] = lines[i].replace("| Open | Open items (11h) |", "| ✅ Closed | Closed items |");
}

const blocks = [];
for (const n of ids) {
  const start = must(lines.findIndex((l) => l.startsWith(`### #${n} — `)), `entry ${n}`);
  let end = start + 1;
  while (end < lines.length && !/^#{2,3} /.test(lines[end])) end++;
  const block = lines.splice(start, end - start);
  while (block.length > 0 && block[block.length - 1] === "") block.pop();
  block[0] = `${block[0]} ✅`;
  const row = must(block.findIndex((l) => l.startsWith(`| ${n} | `)), `entry ${n} table row`);
  block[row] = block[row].replace(`| ${n} | `, `| ${n} | ✅ `).replace(/ See below\. \|$/, " Closed 2026-09-24. See below. |");
  block.push("", closures[n], "");
  blocks.push(...block);
}

const closedAt = must(lines.findIndex((l) => l.startsWith("### #101 — ")), "### #101");
lines.splice(closedAt, 0, ...blocks);

const tier2 = must(lines.findIndex((l) => l === "### Tier 2 — the burndown, one system per pass"), "Tier 2 heading");
lines.splice(tier2 + 1, 0, "",
  "**Re-ordered 2026-09-24:** order 7, #31a, now comes **before** order 6, the",
  "rogue pass. Since #79 (closed 2026-09-22) every caster's creation and",
  "level-up asks spell questions whose options are the pack's 111 level-0",
  "placeholders - a rogue 3 taking Arcane Trickster is offered Bless as a",
  "cantrip - so seven of the twelve classes have slots and nothing real to",
  "pick, and every stored placeholder pick is one more #31a must clear or",
  "migrate. The order numbers are unchanged because other entries cite them.");

const statusStart = must(lines.findIndex((l) => l.startsWith("**Status as of ")), "status paragraph");
let statusEnd = statusStart;
while (lines[statusEnd] !== "") statusEnd++;
lines.splice(statusStart, statusEnd - statusStart,
  "**Status as of 2026-09-24**, on `main`, after `fix/hp-level-up` merged (#86,",
  "#87, #88, #94 and #95 closed: the one-hit-point-per-level floor applies to",
  "each level's roll and Constitution together, Draconic Resilience scales per",
  "sorcerer level and pack validation rejects class-level scaling that names",
  "no class, the level-up review previews the server's own hit point gain, a",
  "level-up locks the row it reads, and every web caller takes a character's",
  "level from its class ledger; #31a moved ahead of the rogue pass). The",
  `workspace is green - **${total} tests**, 0 failures, and typecheck clean per`,
  "package (6f explains why \"per package\" matters). Nothing below is breaking",
  "a build; these are gaps, debt and content.");

fs.writeFileSync(file, lines.join("\r\n"));
console.log("closed", ids.join(", "));
EOF
```

Expected: `closed 86, 87, 88, 94, 95`. Then check `git diff --stat docs/TODO_BACKLOG.md` (only that file) and read the diff: each of the five entries now sits above `### #101 — ` with a `✅` heading and its closure paragraph, and nothing else in the file moved.

- [ ] **Step 4: Restore and measure line endings**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' docs/development/sample-characters.md docs/TODO_BACKLOG.md
```

Measure both: CRLF. Run `pnpm check:hygiene` — PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/development/sample-characters.md docs/TODO_BACKLOG.md
git commit -F - <<'EOF'
docs: close #86, #87, #88, #94 and #95; #31a before the rogue pass

The live checks those items staged become regression checks, and the
backlog records each fix, #86's per-level-roll residual, and why #31a now
comes before the rogue pass.

Co-Authored-By: <the trailer your session's attribution instruction supplies>
EOF
```

---

### Task 8: Verification — the workspace, then the live database (owner go-ahead required)

Run by the controller, not a subagent, because Step 2 needs the owner.

- [ ] **Step 1:** `DATABASE_URL= pnpm test:all` green; `pnpm typecheck --force` 5/5; `pnpm check:hygiene` passes.
- [ ] **Step 2: Ask the owner.** #87 reaches the running server only through `pnpm --filter @project/database db:import-pack --yes`, which CASCADE-deletes every character. Then run `db:seed:samples` and restart the `server` preview (it caches the snapshot).
- [ ] **Step 3: Hand-check in the browser pane.**
  - Seraphine (`…0126`) shows 21/29 and Nyx (`…0115`) 1/80.
  - Brannoc (`…0121`): Level Up with +1 CON, +1 STR and a roll of 6. The review shows 31 → 44 (+13), and the sheet reads 44/44 afterwards.
  - Re-seed, then send two concurrent level-up requests from the console (the script is in `sample-characters.md`). One succeeds and one returns 400.
  - Brother Mote (`…0128`): Level Up succeeds.
  - Record anything else as a backlog item; do not fix it.

---

## Added 2026-09-24, after Task 8's live check (owner-approved scope)

Task 8's hand check passed every item above and found three older defects.
The owner chose to fix one on this branch and record two:

- **#103 (fixed here, Tasks 9-10).** `applyLevelUp` keys each ability score
  increase by the payload's uppercase stat (`"CON"`); the `characters`
  columns are lowercase (`con`), and Drizzle ignores a `.set()` key that
  names no column. No level-up increase has ever been stored, while
  `levelUpHitPointGain` lowercases the stat and grants the hit points: Brannoc
  levelled with +1 CON/+1 STR kept CON 15/STR 16 and read 44/40 after a reload.
- **#104 (recorded, Task 10).** Nothing refreshes the sheet after its own
  level-up; Brannoc read 31/31 until a reload.
- **#105 (recorded, Task 10).** `HpRollStep` offers a d8 while the class list
  loads.

The Global Constraints bind Tasks 9-11 too, with "Fix only the five items"
read as "the five items and #103".

Measured while planning (the fix and test applied, then reverted): the new
test fails on the current controller with `expected { level: 3, maxHp: SQL{ …(4) }, …(4) } to not have property "CON"`;
with the fix the server suite is **506** green (505 + 1) and
`pnpm --filter @project/server typecheck` is clean. The harness's default
level-up (fighter 2 → 3) returns 200 with `asiChoices` sent, and its
character write is the one `.set()` call whose values carry `choices`.

### Task 9: #103 — a level-up's ability score increase is written to its column

**Files:**
- Modify: `apps/server/src/controllers/characterController.ts`
- Test: `apps/server/src/routes/__tests__/character.test.ts`

- [ ] **Step 1: Write the failing test**

In `apps/server/src/routes/__tests__/character.test.ts`, below the line
`import type { Request, Response } from "express";` add:

```ts
import type { SQL } from "drizzle-orm";
```

Then add this test as the last `it` inside
`describe("POST /api/character/:characterId/level-up")`, after
`reads the character FOR UPDATE, so a concurrent level-up waits for this one (#94)`:

```ts
    it("writes an ability score increase to the column it names (#103)", async () => {
      const { applyLevelUp, tx } = await setupLevelUpHarness({});
      const { res, status } = createMockResponse();

      await applyLevelUp(
        createLevelUpRequest({
          asiChoices: [
            { stat: "CON", value: 1 },
            { stat: "STR", value: 1 },
          ],
        }),
        res,
      );

      // imported after the harness's resetModules, so this is the same table
      // object the controller built its update from
      const { characters } = await import(
        "@project/database/src/schema/operational.js"
      );
      // the character write is the one .set() that carries choices
      const characterWrite = tx.set.mock.calls
        .map(([values]) => values as Record<string, unknown>)
        .find((values) => "choices" in values);

      expect(status).toHaveBeenCalledWith(200);
      // the payload spells the stat "CON" and the column is `con`: keyed by
      // the payload's spelling, Drizzle dropped the increase without a word
      expect(characterWrite).not.toHaveProperty("CON");
      expect(characterWrite).not.toHaveProperty("STR");
      expect((characterWrite?.con as SQL).queryChunks).toContain(characters.con);
      expect((characterWrite?.str as SQL).queryChunks).toContain(characters.str);
    });
```

Do not import `characters` at the top of the file: the harness calls
`vi.resetModules()`, so a top-level import is a different object from the one
the controller uses and `toContain` would compare unequal.

- [ ] **Step 2: Run it and watch it fail**

Run: `DATABASE_URL= pnpm --filter @project/server exec vitest run src/routes/__tests__/character.test.ts -t "column it names"`
Expected: FAIL — `expected { level: 3, maxHp: SQL{ …(4) }, …(4) } to not have property "CON"`.

- [ ] **Step 3: One mapping for the gain and the write**

In `apps/server/src/controllers/characterController.ts`:

Replace `import type { LevelUpPayload } from "@project/shared";` with:

```ts
import type { Ability, AbilityKey, LevelUpPayload } from "@project/shared";
```

Replace `import { eq, sql } from "drizzle-orm";` with:

```ts
import { eq, sql, type SQL } from "drizzle-orm";
```

Immediately above the JSDoc that begins
`/**` / ` * The hit points a level-up adds to a character's current total:`, add:

```ts
/**
 * The characters column an ability score increase writes. The payload spells
 * a stat as AbilitySchema does ("CON"); the column is lowercase (`con`).
 * levelUpHitPointGain and applyLevelUp's write both go through here, so the
 * hit points a level-up grants and the score it stores cannot name different
 * stats (#103).
 * @param stat The payload's stat
 * @returns Its column, which is also its key in a save's attributes
 */
const abilityColumn = (stat: Ability): AbilityKey =>
  stat.toLowerCase() as AbilityKey;
```

In `levelUpHitPointGain`, replace:

```ts
  for (const choice of payload.asiChoices ?? []) {
    const key = choice.stat.toLowerCase() as keyof typeof attributes;
    attributes[key] += choice.value;
  }
```

with:

```ts
  for (const choice of payload.asiChoices ?? []) {
    attributes[abilityColumn(choice.stat)] += choice.value;
  }
```

In `applyLevelUp`, replace:

```ts
      // 6 - apply ASI or Feats
      const asiUpdates: Record<string, unknown> = {};
      if (payload.asiChoices) {
        for (const choice of payload.asiChoices) {
          // dynamically build SQL update for specific stat col
          asiUpdates[choice.stat] =
            sql`${characters[choice.stat as keyof typeof characters]} + ${choice.value}`;
        }
      }
```

with:

```ts
      // 6 - apply ASI or Feats
      // keyed by column, so a key the table does not have is a type error
      // rather than an update Drizzle silently drops (#103)
      const asiUpdates: Partial<Record<AbilityKey, SQL>> = {};
      if (payload.asiChoices) {
        for (const choice of payload.asiChoices) {
          const column = abilityColumn(choice.stat);
          asiUpdates[column] = sql`${characters[column]} + ${choice.value}`;
        }
      }
```

Nothing else in the file changes. Validating a payload's stats or totals is
#96's territory and out of scope.

- [ ] **Step 4: Run it and watch it pass, then the suite and typecheck**

Run: `DATABASE_URL= pnpm --filter @project/server exec vitest run src/routes/__tests__/character.test.ts -t "column it names"` — PASS.
Run: `DATABASE_URL= pnpm --filter @project/server test` — **506** passed.
Run: `pnpm --filter @project/server typecheck` — clean.
Measure both files CRLF.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/controllers/characterController.ts apps/server/src/routes/__tests__/character.test.ts
git commit -m "fix(server): a level-up's ability score increase is written to its column (#103)"
```

### Task 10: Docs — #103 closed, #104 and #105 recorded, Brannoc's check

**Files:**
- Modify: `docs/TODO_BACKLOG.md`
- Modify: `docs/development/sample-characters.md`

Both files are CRLF. Apply every edit with a Node script that reads the file,
normalises to LF, replaces each anchor (throwing if an anchor is missing or
appears more than once), and writes back CRLF. Every anchor below is quoted
exactly as the file holds it (LF shown).

- [ ] **Step 1: `docs/TODO_BACKLOG.md` — the status paragraph**

Replace:

```
level from its class ledger; #31a moved ahead of the rogue pass). The
workspace is green - **2426 tests**, 0 failures, and typecheck clean per
```

with:

```
level from its class ledger; #31a moved ahead of the rogue pass; the live
check found #103, a level-up's ability score increase never stored, and the
branch closed it too). The workspace is green - **2427 tests**, 0 failures,
and typecheck clean per
```

- [ ] **Step 2: `docs/TODO_BACKLOG.md` — three index rows**

Immediately after the line:

```
| 102 | An attuned item with no equip slot applies nothing, and no slot holds a belt | Open | Open items |
```

insert:

```
| 103 | A level-up's ability score increase is never stored | ✅ Closed | Closed items |
| 104 | The sheet shows the old character after its own level-up until the page reloads | Open | Open items |
| 105 | The level-up hit point step offers a d8's average while the class list loads | Open | Open items |
```

- [ ] **Step 3: `docs/TODO_BACKLOG.md` — #104 and #105 under Open items**

Immediately before the line `### Coverage thresholds`, insert (the blank
line at the end separates it from that heading):

```
### #104 — the sheet shows the old character after its own level-up until the page reloads

| # | Item | Notes |
| --- | --- | --- |
| 104 | The sheet shows the old character after its own level-up until the page reloads | Found by the live check of `fix/hp-level-up`, 2026-09-24. See below. |

`validateAndSubmit` (`apps/web/src/store/levelUpStore.ts`) posts the level-up
and resets the wizard; nothing invalidates the sheet's
`["character", characterId]` query (`apps/web/src/pages/LiveSheetRoute.tsx`),
and the server broadcasts nothing for a level-up. After Brannoc Hale
(sample `…0121`) levelled to fighter 4, his sheet still read fighter 3 and
31/31 until the page was reloaded - level, hit points, scores and granted
traits all stale. Fix: invalidate the character query when the level-up
succeeds; other tabs and the rest of the table need a broadcast as well.

### #105 — the level-up hit point step offers a d8's average while the class list loads

| # | Item | Notes |
| --- | --- | --- |
| 105 | The level-up hit point step offers a d8's average while the class list loads | Found by the live check of `fix/hp-level-up`, 2026-09-24. See below. |

`HpRollStep` (`apps/web/src/components/wizard/steps/HpRollStep.tsx`) falls
back to a d8 (`selectedClass?.hitDie ?? 8`) until `/reference/classes`
answers, so for a moment a fighter's step offers "Take Average 5" and
"Roll 1d8". Both buttons work during that moment and store a d8's number for
a d10 class. Fix: hold the step (or show that it is loading) until the class
is known, rather than defaulting the die.

```

- [ ] **Step 4: `docs/TODO_BACKLOG.md` — #103 under Closed items**

Immediately before the line
`### P0 — Previously inert runtime seams (now resolved) ✅`, insert (the blank
line at the end separates it from that heading):

```
### #103 — A level-up's ability score increase is never stored ✅

| # | Item | Notes |
| --- | --- | --- |
| 103 | ✅ A level-up's ability score increase is never stored | Found by the live check of `fix/hp-level-up`, 2026-09-24; closed 2026-09-24. See below. |

`applyLevelUp` (`apps/server/src/controllers/characterController.ts`) keyed
each increase by the payload's stat, which `AbilitySchema` spells in
uppercase (`"CON"`), while the `characters` columns are lowercase (`con`).
Drizzle ignores a `.set()` key that names no column, so every ability score
increase taken at a level-up - since at least `e58e80c` (2026-07-05) - was
dropped without an error. `levelUpHitPointGain` lowercased the stat, so the
hit points counted an increase the row never received: Brannoc Hale (sample
`…0121`) levelled to fighter 4 with +1 CON and +1 STR, gained 13 hit points,
kept CON 15 and STR 16, and read 44/40 after a reload. No test covered the
column write; the route harness's `.set()` mock accepted any key.

**Closed 2026-09-24** on `fix/hp-level-up`. One helper, `abilityColumn`, maps
a stat to its column for both the hit point gain and the write, and the
write's updates are typed by column, so a key the table does not have no
longer compiles. The level-up route test asserts the write names `con` and
`str` and not their uppercase spellings. Characters that levelled with an
increase before the fix keep the scores they had; nothing repairs them.

```

- [ ] **Step 5: `docs/development/sample-characters.md` — Brannoc**

Replace the roster row's tail:

```
| 31/31 | Level-up staging | #88, #94, #24 |
```

with:

```
| 31/31 | Level-up staging | #88, #94, #103, #24 |
```

Replace step 3 under the Brannoc Hale heading:

```
3. **Level Up → Fighter 4 (#88, a regression check)**, taking the increase as
   +1 CON and +1 STR with a roll of 6. The review step asks the server and
   shows 31 → 44 (+13) — the gain the level-up stores, CON 16 raising the three
   earlier levels included. Submit: the sheet reads 44/44.
```

with:

```
3. **Level Up → Fighter 4 (#88 and #103, regression checks).** Take the
   average, 6, once the hit point step offers a d10 (it shows a d8 while the
   class list loads, #105), and take the increase as +1 CON and +1 STR. The
   review step asks the server and shows 31 → 44 (+13) — the gain the
   level-up stores, CON 16 raising the three earlier levels included. Submit,
   then reload (the sheet keeps the old character until you do, #104): it
   reads 44/44 with STR 17 and CON 16. Before #103 the increase was never
   stored, and the reloaded sheet read 44/40.
```

- [ ] **Step 6: Verify and commit**

Measure both files CRLF; `pnpm check:hygiene` passes;
`DATABASE_URL= pnpm test:all` green at **2427** (shared 232, engine 1017,
database 200, server 506, web 472).

```bash
git add docs/TODO_BACKLOG.md docs/development/sample-characters.md
git commit -m "docs: close #103; record #104 and #105; Brannoc's check stores his increase"
```

### Task 11: Verification — Brannoc again (controller)

- [ ] `pnpm typecheck --force` 5/5; `pnpm check:hygiene` passes.
- [ ] Re-seed (`db:seed:samples`; the pack is unchanged since Task 8's import)
  and restart the `server` preview.
- [ ] Brannoc (`…0121`): Level Up as in `sample-characters.md` step 3. The
  review shows 31 → 44 (+13); after a reload the sheet reads 44/44, and
  `GET /api/character/…0121` stores `con` 14 and `str` 17.
- [ ] Re-seed once more so the samples are back at their staged state.
