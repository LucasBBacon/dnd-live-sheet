# Level-Up Follow-Ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close backlog #104–#109: a level-up refreshes the sheet that made it, both level-up routes check the roll and the ability score increase, a new level always adds at least one hit point, the hit point step waits for the class's own die, pack validation rejects a scaling class the pack does not define, and every web reader takes the level from the class ledger. Record #110 and #111.

**Architecture:** Two server helpers shared by `applyLevelUp` and `previewLevelUp`: `levelUpHitPoints` (the stored roll, lifted, and the gain) in the controller, and `checkLevelUpNumbers` (#106's rules) in a new service module. One shared-package validation rule. Web changes stay local to the component that shows the problem: the wizard invalidates the character query, the hit point step drops its default die, the review step signs the gain, and three readers switch to `ledgerTotalLevel`.

**Tech Stack:** TypeScript, pnpm + turbo monorepo; Vitest (+ supertest in `apps/server`); drizzle-orm; Express; React 19 + Zustand + react-query (`apps/web`); `@project/engine`, `@project/shared`.

**Spec:** `docs/superpowers/specs/2026-09-24-level-up-follow-ups-design.md`

## Global Constraints

- **Line endings.** Every file this plan touches is **CRLF**, and every new file must be CRLF too. Edit and Write emit LF. After editing, restore CRLF on every file you touched:
  ```bash
  node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' <file> <file> ...
  ```
  and measure (grep gives wrong answers for CR in this Git Bash):
  ```bash
  node -e 'for(const f of process.argv.slice(1)){const b=require("fs").readFileSync(f);let cr=0,lf=0,crlf=0;for(let i=0;i<b.length;i++){if(b[i]===13){cr++;if(b[i+1]===10)crlf++;}if(b[i]===10)lf++;}console.log(f,cr===0?"LF":(cr===crlf&&crlf===lf)?"CRLF":"MIXED")}' <file> ...
  ```
  Never use `sed -i`. `pnpm check:hygiene` fails on a mixed file.
- **Typecheck is a separate gate** — Vitest ignores type errors. Per package: `pnpm --filter @project/shared typecheck`, `@project/engine`, `@project/database`, `@project/server` (all `tsc --noEmit`), and `pnpm --filter @project/web typecheck` (`tsc -b`). Never run `tsc -b` in `packages/database`.
- `apps/server`, `packages/engine`, `packages/shared` and `packages/database` compile with **`exactOptionalPropertyTypes`** and **`noUncheckedIndexedAccess`**.
- **CI has no `DATABASE_URL`.** Run server and database suites as `DATABASE_URL= pnpm --filter @project/server test` / `DATABASE_URL= pnpm --filter @project/database test`.
- **Web tests** use Vitest with `createRoot` + `act`; `@testing-library` is **not** installed. Follow the sibling test files' patterns.
- **Fix only #104–#109.** #110 and #111 are recorded, not fixed. Anything else you notice is reported, not fixed.
- Commit messages end with a blank line and then the `Co-Authored-By:` trailer your own session's attribution instruction supplies. Use `git commit -F -` with a heredoc. Branch is `fix/level-up-follow-ups`. Do not push.
- Touch only the files a task lists. A failure in any other file: stop and report NEEDS_CONTEXT.

Design decisions (owner, 2026-09-24) that bind every task:
- #104 refreshes **this tab only**; broadcasting a level-up is #111.
- #107 **lifts the stored roll**: a level-up stores `max(hpRoll, 1 - CON modifier)`, the modifier after this level's own increase with racial and trait modifiers; the preview and the write share it. No schema change.
- #109 switches **all four** readers (proficiency bonus, attacks per action, the header badge, the TraitWidget line) to `ledgerTotalLevel`; the store keeps its `level` field.
- #106's rules live in **one helper both routes call** right after loading the character, before any write; a failure is `Invalid character choices: …` and a 400.

## File Structure

| File | Change |
| --- | --- |
| `apps/server/src/controllers/characterController.ts` | `levelUpHitPoints` replaces `levelUpHitPointGain` (#107); `hitDieOf`; both routes call `checkLevelUpNumbers` (#106) |
| `apps/server/src/services/levelUpNumbers.ts` (new) | `checkLevelUpNumbers` (#106) |
| `packages/shared/src/schemas/content/validatePack.ts` | `unknown_scaling_class` (#108) |
| `apps/web/src/hooks/useCharacterStats.ts` | `useDerivedStats` reads the ledger (#109) |
| `apps/web/src/components/sheet/DashboardLayout.tsx` | Header badge reads the ledger (#109) |
| `apps/web/src/components/sheet/TraitWidget.tsx` | "Level:" line reads the ledger (#109) |
| `apps/web/src/components/wizard/LevelUpWizard.tsx` | Invalidates the character query after a stored level-up (#104) |
| `apps/web/src/components/wizard/steps/HpRollStep.tsx` | No default die (#105) |
| `apps/web/src/components/wizard/steps/ReviewStep.tsx` | Signed hit point gain (#107) |
| Tests | server `controllers/__tests__/levelUpHitPoints.test.ts`, new `services/__tests__/levelUpNumbers.test.ts`, `routes/__tests__/character.test.ts`, `routes/__tests__/levelUpPreview.test.ts`; shared `schemas/__tests__/coreRulePack.test.ts`; web `hooks/__tests__/useCharacterStats.test.ts`, `sheet/__tests__/DashboardLayout.test.tsx`, `sheet/__tests__/TraitWidget.test.tsx`, new `wizard/__tests__/LevelUpWizard.test.tsx`, new `wizard/steps/__tests__/HpRollStep.test.tsx`, `wizard/steps/__tests__/ReviewStep.test.tsx` |
| Docs | `docs/TODO_BACKLOG.md`, `docs/development/sample-characters.md` |

## Facts this plan relies on (measured while planning)

Every change and test below was applied, run, and reverted while planning.

- Baseline on `de0773c`: **2429** tests — shared 232, engine 1017, database 200, server 507, web 473.
- Server, after Task 1: **510**; after Task 2: **525**. The only existing server test that moves is the last branch's duplicate-stat route test (`totals duplicate stats in one ability score increase before writing (#103's guarantee)`), which now gets a 400 — Task 2 replaces it. No other server test sends a roll above its class's hit die or an invalid increase (the route fixtures send 5–7 to d8/d10 classes and 6 to d6 classes).
- Shared after Task 3: **233**. The shipped pack's `scalingClassId`s are `class_barbarian` ×3 and `class_sorcerer` ×1, all defined; database (200) and engine (1017) do not move.
- Web: switching the four readers to the ledger moves **no** existing test. After Task 4: **476**; Task 5: **478**; Task 6: **483**.
- Final: **2458** — shared 233, engine 1017, database 200, server 525, web 483. Typecheck clean in all five packages with every change applied.
- Aveline (the `levelUpHitPoints` test fixture: a human cleric 3, 18 rolled) with a stored CON of 7 (8 as a human, −1) and a roll of 1 stores **2** and gains **1**; with CON 5 (6, −2), stores **3** and gains **1**; with CON 7 plus a +2 CON increase (10, +0), stores **1** and gains **4**.

---

### Task 1: #107 — a level-up stores a lifted roll, so the new level adds at least one hit point

**Files:**
- Modify: `apps/server/src/controllers/characterController.ts`
- Test: `apps/server/src/controllers/__tests__/levelUpHitPoints.test.ts`

**Interfaces:**
- Produces (exported from `characterController.ts`, replacing `levelUpHitPointGain`, which no longer exists):
  ```ts
  export const levelUpHitPoints: (args: {
    saves: Pick<LevelUpSaves<CharacterClassSource>, "before" | "after">;
    payload: Pick<LevelUpPayload, "hpRoll" | "asiChoices">;
    snapshot: RuleSnapshotLookup;
  }) => { storedRoll: number; gain: number };
  ```
  `applyLevelUp` adds `storedRoll` to `max_hp` and `gain` to `current_hp`; `previewLevelUp` returns `gain` as `hitPointGain`.

- [ ] **Step 1: Write the failing tests**

In `apps/server/src/controllers/__tests__/levelUpHitPoints.test.ts`:

Replace `import { levelUpHitPointGain } from "../characterController.js";` with:

```ts
import { levelUpHitPoints } from "../characterController.js";
```

Replace `describe("levelUpHitPointGain", () => {` with `describe("levelUpHitPoints", () => {`.

Replace the first test's assertion:

```ts
      levelUpHitPointGain({
        saves: saves(),
        payload: { hpRoll: 5 },
        snapshot,
      }),
    ).toBe(7);
```

with:

```ts
      levelUpHitPoints({
        saves: saves(),
        payload: { hpRoll: 5 },
        snapshot,
      }),
    ).toEqual({ storedRoll: 5, gain: 7 });
```

Replace the second test's assertion:

```ts
      levelUpHitPointGain({
        saves: saves(),
        payload: { hpRoll: 5, asiChoices: [{ stat: "CON", value: 2 }] },
        snapshot,
      }),
    ).toBe(11);
```

with:

```ts
      levelUpHitPoints({
        saves: saves(),
        payload: { hpRoll: 5, asiChoices: [{ stat: "CON", value: 2 }] },
        snapshot,
      }),
    ).toEqual({ storedRoll: 5, gain: 11 });
```

Then add these after the second test, inside the `describe`:

```ts

  /** Aveline with a lower Constitution score (the row's, before her +1 as a human) */
  const savesWithCon = (con: number) =>
    buildLevelUpSaves({
      character: { ...aveline, con },
      ledger,
      storedChoices: emptyCharacterChoices(),
      targetClassId: "class_cleric",
    });

  it("lifts a low roll so the level still adds one hit point at CON 8 (#107)", () => {
    // CON 8 (-1): 18 - 3 = 15 before. A roll of 1 would add 1 - 1 = 0, so 2
    // is stored: 18 + 2 - 4 = 16 after
    expect(
      levelUpHitPoints({
        saves: savesWithCon(7),
        payload: { hpRoll: 1 },
        snapshot,
      }),
    ).toEqual({ storedRoll: 2, gain: 1 });
  });

  it("lifts by the whole penalty at CON 6 (#107)", () => {
    // CON 6 (-2): 18 - 6 = 12 before; 3 is stored: 18 + 3 - 8 = 13 after
    expect(
      levelUpHitPoints({
        saves: savesWithCon(5),
        payload: { hpRoll: 1 },
        snapshot,
      }),
    ).toEqual({ storedRoll: 3, gain: 1 });
  });

  it("lifts against Constitution after this level's increase (#107)", () => {
    // CON 8 -> 10 with the increase: the modifier is 0, so a roll of 1
    // already adds 1 and nothing is lifted. 15 before; 18 + 1 + 0 = 19 after
    expect(
      levelUpHitPoints({
        saves: savesWithCon(7),
        payload: { hpRoll: 1, asiChoices: [{ stat: "CON", value: 2 }] },
        snapshot,
      }),
    ).toEqual({ storedRoll: 1, gain: 4 });
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `DATABASE_URL= pnpm --filter @project/server exec vitest run src/controllers/__tests__/levelUpHitPoints.test.ts`
Expected: FAIL — all five, `levelUpHitPoints is not a function`.

- [ ] **Step 3: Implement `levelUpHitPoints`**

In `apps/server/src/controllers/characterController.ts`:

Replace `import { CharacterBootstrapper, type RuleSnapshotLookup } from "@project/engine";` with:

```ts
import {
  AbilityEngine,
  CharacterBootstrapper,
  type RuleSnapshotLookup,
} from "@project/engine";
```

In `abilityColumn`'s docstring, replace ` * levelUpHitPointGain and applyLevelUp's write both go through here, so the` with ` * levelUpHitPoints and applyLevelUp's write both go through here, so the`.

Replace the whole `levelUpHitPointGain` block — from its docstring's first line `/**` / ` * The hit points a level-up adds to a character's current total: the` down to and including its closing `};` — with:

```ts
/**
 * What a level-up does to hit points: the roll it stores, and the hit points
 * it adds to the character's current total.
 *
 * The gain is the maximum after this level minus the maximum before it, so
 * the roll, this level's Constitution modifier, an ability score increase
 * taken at this level and any MAX_HP trait it grants all count once, and the
 * wizard's preview and the stored number cannot disagree (#78).
 *
 * The stored roll is lifted to `1 - Constitution modifier` when the roll is
 * lower, so the new level adds at least one hit point at the Constitution it
 * is taken with - the rules' minimum for every level (#107). Rolls are stored
 * as one sum (characters.max_hp), so the minimum cannot be applied per level
 * later. Residual, recorded rather than solved: a later Constitution increase
 * also counts the lift, overstating the maximum by about one hit point per
 * lifted level.
 * @param saves The character before and after this level (buildLevelUpSaves)
 * @param payload The level-up's roll and any ability score increases
 * @param snapshot Pack content
 * @returns The roll to add to max_hp and the hit points to add to current
 */
export const levelUpHitPoints = ({
  saves,
  payload,
  snapshot,
}: {
  saves: Pick<LevelUpSaves<CharacterClassSource>, "before" | "after">;
  payload: Pick<LevelUpPayload, "hpRoll" | "asiChoices">;
  snapshot: RuleSnapshotLookup;
}): { storedRoll: number; gain: number } => {
  const attributes = { ...saves.after.attributes };
  for (const choice of payload.asiChoices ?? []) {
    attributes[abilityColumn(choice.stat)] += choice.value;
  }
  const after = { ...saves.after, attributes };

  // this level's Constitution: after its own increase, with racial and trait
  // modifiers - the modifier finalMaxHp counts for every level
  const conModifier = AbilityEngine.getModifier(
    finalAbilityScores(after, snapshot).con,
  );
  const storedRoll = Math.max(payload.hpRoll, 1 - conModifier);

  const maxAfter = finalMaxHp(
    {
      ...after,
      hp: {
        ...saves.after.hp,
        baseRolledHp: saves.after.hp.baseRolledHp + storedRoll,
      },
    },
    snapshot,
  );

  return {
    storedRoll,
    gain: maxAfter - finalMaxHp(saves.before, snapshot),
  };
};
```

In `applyLevelUp`:
- In the step-6 comment, replace `      // choice while levelUpHitPointGain - which sums every choice into` with `      // choice while levelUpHitPoints - which sums every choice into`.
- Replace `      const gainedHp = levelUpHitPointGain({ saves, payload, snapshot });` with:
  ```ts
      const { storedRoll, gain } = levelUpHitPoints({ saves, payload, snapshot });
  ```
- Replace the two hit point lines of the step-7 write:
  ```ts
          maxHp: sql`COALESCE(${characters.maxHp}, 0) + ${payload.hpRoll}`,
          currentHp: sql`COALESCE(${characters.currentHp}, 0) + ${gainedHp}`,
  ```
  with:
  ```ts
          maxHp: sql`COALESCE(${characters.maxHp}, 0) + ${storedRoll}`,
          currentHp: sql`COALESCE(${characters.currentHp}, 0) + ${gain}`,
  ```

In `previewLevelUp`:
- In its docstring, replace ` * levelUpHitPointGain - so the level-up wizard previews exactly the number` with ` * levelUpHitPoints - so the level-up wizard previews exactly the number`.
- Replace `    const hitPointGain = levelUpHitPointGain({` with `    const { gain: hitPointGain } = levelUpHitPoints({`.

After this step, `grep -n "levelUpHitPointGain" apps/server/src/controllers/characterController.ts` prints nothing. (One test comment in `routes/__tests__/character.test.ts` still names it; Task 2 replaces that test.)

- [ ] **Step 4: Run them and watch them pass; then the suite and typecheck**

Run: `DATABASE_URL= pnpm --filter @project/server exec vitest run src/controllers/__tests__/levelUpHitPoints.test.ts` — 5 passed.
Run: `DATABASE_URL= pnpm --filter @project/server test` — **510** passed.
Run: `pnpm --filter @project/server typecheck` — clean.
Measure both files CRLF.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/controllers/characterController.ts apps/server/src/controllers/__tests__/levelUpHitPoints.test.ts
git commit -F - <<'EOF'
fix(server): a level-up stores a lifted roll, so every level adds a hit point (#107)

Co-Authored-By: <the trailer your session's attribution instruction supplies>
EOF
```

---

### Task 2: #106 — both level-up routes check the roll and the ability score increase

**Files:**
- Create: `apps/server/src/services/levelUpNumbers.ts`
- Create: `apps/server/src/services/__tests__/levelUpNumbers.test.ts`
- Modify: `apps/server/src/controllers/characterController.ts`
- Test: `apps/server/src/routes/__tests__/character.test.ts`, `apps/server/src/routes/__tests__/levelUpPreview.test.ts`

**Interfaces:**
- Consumes: `levelUpHitPoints` (Task 1); `finalAbilityScores` (already imported in the controller from `../services/characterSave.js`).
- Produces:
  ```ts
  // apps/server/src/services/levelUpNumbers.ts
  export const checkLevelUpNumbers: (args: {
    payload: { hpRoll?: unknown; asiChoices?: unknown };
    scoresBefore: Record<AbilityKey, number>;
    hitDie: number;
  }) => void; // throws Error("Invalid character choices: …")
  ```
  and, module-private in the controller, `hitDieOf(snapshot, classId): number`.

`checkLevelUpNumbers` lives in its own module, not `levelUpValidation.ts`, because the route harness in `character.test.ts` mocks `levelUpValidation.js` wholesale; this way the real rules run in every route test.

- [ ] **Step 1: Write the unit tests**

Create `apps/server/src/services/__tests__/levelUpNumbers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkLevelUpNumbers } from "../levelUpNumbers.js";

/** Brannoc Hale's scores before fighter 4: a hill dwarf, CON 13 + 2 */
const scoresBefore = { str: 16, dex: 12, con: 15, int: 10, wis: 13, cha: 8 };

const check =
  (
    payload: { hpRoll?: unknown; asiChoices?: unknown },
    scores: typeof scoresBefore = scoresBefore,
  ) =>
  () =>
    checkLevelUpNumbers({ payload, scoresBefore: scores, hitDie: 10 });

describe("checkLevelUpNumbers (#106)", () => {
  it("accepts a roll within the hit die with no increase", () => {
    expect(check({ hpRoll: 6 })).not.toThrow();
    expect(check({ hpRoll: 6, asiChoices: [] })).not.toThrow();
  });

  it("accepts +2 to one ability, and +1 to each of two", () => {
    expect(check({ hpRoll: 1, asiChoices: [{ stat: "CON", value: 2 }] })).not.toThrow();
    expect(
      check({
        hpRoll: 10,
        asiChoices: [
          { stat: "CON", value: 1 },
          { stat: "STR", value: 1 },
        ],
      }),
    ).not.toThrow();
  });

  it.each([
    ["missing", undefined],
    ["zero", 0],
    ["above the hit die", 11],
    ["fractional", 6.5],
    ["a string", "6"],
  ])("rejects an hpRoll that is %s", (_label, hpRoll) => {
    expect(check({ hpRoll })).toThrow(
      "Invalid character choices: hpRoll must be a whole number from 1 to 10.",
    );
  });

  it("rejects asiChoices that is not a list of one or two", () => {
    const message =
      "Invalid character choices: asiChoices must list one or two ability score increases.";
    expect(check({ hpRoll: 6, asiChoices: { stat: "CON", value: 2 } })).toThrow(message);
    expect(
      check({
        hpRoll: 6,
        asiChoices: [
          { stat: "STR", value: 1 },
          { stat: "DEX", value: 1 },
          { stat: "CON", value: 1 },
        ],
      }),
    ).toThrow(message);
  });

  it("rejects a stat that is not an ability", () => {
    expect(check({ hpRoll: 6, asiChoices: [{ stat: "LUCK", value: 2 }] })).toThrow(
      'Invalid character choices: "LUCK" is not an ability.',
    );
  });

  it("rejects the same stat named twice", () => {
    expect(
      check({
        hpRoll: 6,
        asiChoices: [
          { stat: "CON", value: 1 },
          { stat: "CON", value: 1 },
        ],
      }),
    ).toThrow("Invalid character choices: CON is increased twice.");
  });

  it("rejects an increase that is not a positive whole number", () => {
    expect(
      check({
        hpRoll: 6,
        asiChoices: [
          { stat: "CON", value: 1.5 },
          { stat: "STR", value: 0.5 },
        ],
      }),
    ).toThrow(
      "Invalid character choices: the increase to CON must be a positive whole number.",
    );
  });

  it("rejects increases that do not total 2", () => {
    expect(check({ hpRoll: 6, asiChoices: [{ stat: "CON", value: 3 }] })).toThrow(
      "Invalid character choices: ability score increases must total 2, not 3.",
    );
    expect(check({ hpRoll: 6, asiChoices: [{ stat: "CON", value: 1 }] })).toThrow(
      "Invalid character choices: ability score increases must total 2, not 1.",
    );
  });

  it("rejects an increase that would take a score above 20", () => {
    expect(
      check(
        { hpRoll: 6, asiChoices: [{ stat: "STR", value: 2 }] },
        { ...scoresBefore, str: 19 },
      ),
    ).toThrow("Invalid character choices: STR would rise above 20.");
  });
});
```

- [ ] **Step 2: Write the route tests**

In `apps/server/src/routes/__tests__/character.test.ts`, replace the whole test that begins `    it("totals duplicate stats in one ability score increase before writing (#103's guarantee)", async () => {` — down to and including its closing `    });` — with:

```ts
    it("refuses an ability score increase that names the same stat twice, before writing (#106)", async () => {
      const { applyLevelUp, tx } = await setupLevelUpHarness({});
      const { res, status, json } = createMockResponse();

      await applyLevelUp(
        createLevelUpRequest({
          asiChoices: [
            { stat: "CON", value: 1 },
            { stat: "CON", value: 1 },
          ],
        }),
        res,
      );

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({
        success: false,
        error: "Invalid character choices: CON is increased twice.",
      });
      expect(tx.update).not.toHaveBeenCalled();
      expect(tx.insert).not.toHaveBeenCalled();
    });

    it("refuses a roll above the class's hit die (#106)", async () => {
      const { applyLevelUp, tx } = await setupLevelUpHarness({});
      const { res, status, json } = createMockResponse();

      // the harness levels a fighter, whose hit die is a d10
      await applyLevelUp(createLevelUpRequest({ hpRoll: 11 }), res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({
        success: false,
        error: "Invalid character choices: hpRoll must be a whole number from 1 to 10.",
      });
      expect(tx.update).not.toHaveBeenCalled();
    });
```

In `apps/server/src/routes/__tests__/levelUpPreview.test.ts`, add this test immediately after the test `refuses a roll that is not a number`:

```ts

  it("refuses an increase the level-up would refuse, rather than answering NaN (#106)", async () => {
    const { app } = await setupApp();

    const response = await request(app)
      .post("/api/character/char-1/level-up/preview")
      .send({
        targetClassId: "class_fighter",
        hpRoll: 6,
        asiChoices: [{ stat: "CON", value: 3 }],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      "Invalid character choices: ability score increases must total 2, not 3.",
    );
  });
```

- [ ] **Step 3: Run them and watch them fail**

Run: `DATABASE_URL= pnpm --filter @project/server exec vitest run src/services/__tests__/levelUpNumbers.test.ts src/routes/__tests__/character.test.ts src/routes/__tests__/levelUpPreview.test.ts`
Expected: FAIL — `levelUpNumbers.test.ts` cannot load `../levelUpNumbers.js`; the two new `character.test.ts` tests get 200 where they expect 400; the new preview test gets 200.

- [ ] **Step 4: Write `checkLevelUpNumbers`**

Create `apps/server/src/services/levelUpNumbers.ts`:

```ts
import { AbilitySchema, type AbilityKey } from "@project/shared";

/** The highest score an ability score increase may reach. */
const ABILITY_SCORE_CAP = 20;

/** The points one ability score increase grants. */
const ASI_POINTS = 2;

/**
 * Checks the numbers a level-up payload carries before either level-up route
 * uses them (#106).
 *
 * The payload arrives untrusted, so its fields are read as `unknown`. Since
 * #103 an ability score increase is written straight into the character's
 * scores, so a crafted payload would otherwise store nonsense; the preview
 * would answer NaN. Both applyLevelUp and previewLevelUp call this right
 * after loading the character, before any write.
 *
 * An empty or absent `asiChoices` means no increase: whether the level offers
 * one, and whether a feat was taken instead, is validateLevelUpPayloadFromResolver's
 * question, not this one's.
 * @param payload The request's hpRoll and asiChoices, unparsed
 * @param scoresBefore The character's scores before this level - race and
 *   traits, not items (finalAbilityScores), the score the cap of 20 governs
 * @param hitDie The hit die of the class this level is taken in
 * @throws Error("Invalid character choices: …") on the first rule broken
 */
export const checkLevelUpNumbers = ({
  payload,
  scoresBefore,
  hitDie,
}: {
  payload: { hpRoll?: unknown; asiChoices?: unknown };
  scoresBefore: Record<AbilityKey, number>;
  hitDie: number;
}): void => {
  const { hpRoll, asiChoices } = payload;

  if (
    typeof hpRoll !== "number" ||
    !Number.isInteger(hpRoll) ||
    hpRoll < 1 ||
    hpRoll > hitDie
  ) {
    throw new Error(
      `Invalid character choices: hpRoll must be a whole number from 1 to ${hitDie}.`,
    );
  }

  if (
    asiChoices === undefined ||
    asiChoices === null ||
    (Array.isArray(asiChoices) && asiChoices.length === 0)
  ) {
    return;
  }

  if (!Array.isArray(asiChoices) || asiChoices.length > ASI_POINTS) {
    throw new Error(
      "Invalid character choices: asiChoices must list one or two ability score increases.",
    );
  }

  const seen = new Set<string>();
  let total = 0;

  for (const choice of asiChoices as unknown[]) {
    const { stat, value } = (choice ?? {}) as { stat?: unknown; value?: unknown };
    const parsed = AbilitySchema.safeParse(stat);
    if (!parsed.success) {
      throw new Error(
        `Invalid character choices: ${JSON.stringify(stat)} is not an ability.`,
      );
    }
    if (seen.has(parsed.data)) {
      throw new Error(
        `Invalid character choices: ${parsed.data} is increased twice.`,
      );
    }
    seen.add(parsed.data);

    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      throw new Error(
        `Invalid character choices: the increase to ${parsed.data} must be a positive whole number.`,
      );
    }

    const key = parsed.data.toLowerCase() as AbilityKey;
    if (scoresBefore[key] + value > ABILITY_SCORE_CAP) {
      throw new Error(
        `Invalid character choices: ${parsed.data} would rise above ${ABILITY_SCORE_CAP}.`,
      );
    }
    total += value;
  }

  if (total !== ASI_POINTS) {
    throw new Error(
      `Invalid character choices: ability score increases must total ${ASI_POINTS}, not ${total}.`,
    );
  }
};
```

- [ ] **Step 5: Call it from both routes**

In `apps/server/src/controllers/characterController.ts`:

Replace `import { classLedgerOrder } from "../services/classLedger.js";` with:

```ts
import { classLedgerOrder } from "../services/classLedger.js";
import { checkLevelUpNumbers } from "../services/levelUpNumbers.js";
```

Immediately after `levelUpHitPoints`' closing `};` (Task 1), add:

```ts

/**
 * The hit die of the class a level-up is taken in.
 * @param snapshot Pack content
 * @param classId The level-up's target class
 * @returns The class's hit die
 * @throws Error("Invalid character choices: unknown class …") when the pack
 *   has no such class
 */
const hitDieOf = (snapshot: RuleSnapshotLookup, classId: string): number => {
  const hitDie = snapshot.classesById?.[classId]?.hitDie;
  if (hitDie === undefined) {
    throw new Error(`Invalid character choices: unknown class ${classId}`);
  }
  return hitDie;
};
```

In `applyLevelUp`, directly after the `loadLevelUpSaves(...)` call that ends `        { lock: true },` / `      );`, add (keeping one blank line before the existing `// the new total level comes from the ledger…` comment):

```ts

      // the roll and any ability score increase, checked before anything is
      // written: since #103 an increase is stored as sent (#106)
      checkLevelUpNumbers({
        payload,
        scoresBefore: finalAbilityScores(saves.before, snapshot),
        hitDie: hitDieOf(snapshot, targetClassId),
      });
```

In `applyLevelUp`'s step 6, replace the comment

```ts
      // totalled per column first: two choices naming the same stat (a
      // crafted payload; the wizard cannot produce one) would otherwise
      // overwrite rather than add, so the write would carry only the last
      // choice while levelUpHitPoints - which sums every choice into
      // attributes - counted them all (#103's guarantee)
```

with:

```ts
      // totalled per column first, a guard at the write: checkLevelUpNumbers
      // already refuses a stat named twice (#106), and if one ever got this
      // far, keying by column would let the second overwrite the first while
      // levelUpHitPoints - which sums every choice into attributes - counted
      // both (#103's guarantee)
```

In `previewLevelUp`, replace these docstring lines:

```ts
 * levelUpHitPoints - so the level-up wizard previews exactly the number
 * the write will store, including an ability score increase that raises
 * every earlier level's Constitution contribution (#88). Read-only: no
 * transaction, no lock, and no validation of the draft's choices, which the
 * real submit still performs in full.
```

with:

```ts
 * levelUpHitPoints - so the level-up wizard previews exactly the number the
 * write will store, including an ability score increase that raises every
 * earlier level's Constitution contribution (#88). Read-only: no transaction
 * and no lock. The draft's numbers are checked exactly as the write checks
 * them (#106); its choices are not, which the real submit still does in full.
```

and directly after its `loadLevelUpSaves(...)` call that ends `      { lock: false },` / `    );`, add:

```ts

    checkLevelUpNumbers({
      payload,
      scoresBefore: finalAbilityScores(saves.before, snapshot),
      hitDie: hitDieOf(snapshot, targetClassId),
    });
```

- [ ] **Step 6: Run them and watch them pass; then the suite and typecheck**

Run: `DATABASE_URL= pnpm --filter @project/server exec vitest run src/services/__tests__/levelUpNumbers.test.ts src/routes/__tests__/character.test.ts src/routes/__tests__/levelUpPreview.test.ts` — all pass.
Run: `DATABASE_URL= pnpm --filter @project/server test` — **525** passed.
Run: `pnpm --filter @project/server typecheck` — clean.
Measure all five files CRLF (two of them new).

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/services/levelUpNumbers.ts apps/server/src/services/__tests__/levelUpNumbers.test.ts apps/server/src/controllers/characterController.ts apps/server/src/routes/__tests__/character.test.ts apps/server/src/routes/__tests__/levelUpPreview.test.ts
git commit -F - <<'EOF'
fix(server): both level-up routes check the roll and the ability score increase (#106)

Co-Authored-By: <the trailer your session's attribution instruction supplies>
EOF
```

---

### Task 3: #108 — pack validation rejects a scaling class the pack does not define

**Files:**
- Modify: `packages/shared/src/schemas/content/validatePack.ts`
- Test: `packages/shared/src/schemas/__tests__/coreRulePack.test.ts`

**Interfaces:**
- Produces: `CoreRulePackIssueCode` gains `"unknown_scaling_class"`.

- [ ] **Step 1: Write the failing test**

In `packages/shared/src/schemas/__tests__/coreRulePack.test.ts`, inside `describe("class-level scaling names its class (#87)", …)`, add this immediately before the test `accepts the same modifier once it names its class`:

```ts
  it("rejects a scalingClassId that names no class in the pack (#108)", () => {
    const result = validateCoreRulePack(
      packWithScaledTrait({
        scalingFactor: "class_level",
        scalingClassId: "class_sorceror",
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      code: "unknown_scaling_class",
      path: ["traits", 1, "modifiers", "fixed", 0],
      message:
        "'trait_test_resilience' scales MAX_HP by class 'class_sorceror', which the pack does not define.",
    });
  });

```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @project/shared exec vitest run src/schemas/__tests__/coreRulePack.test.ts`
Expected: FAIL — `expected true to be false` (the pack validates).

- [ ] **Step 3: Implement the rule**

In `packages/shared/src/schemas/content/validatePack.ts`:

In `CoreRulePackIssueCode`, replace `  | "missing_subrace"` with:

```ts
  | "missing_subrace"
  | "unknown_scaling_class"
```

In `validateClassScaling`'s docstring, replace its last two lines

```ts
 * added later is covered without anyone remembering to add it here. The
 * message names the nearest enclosing entity with an id.
 */
```

with:

```ts
 * added later is covered without anyone remembering to add it here. The
 * message names the nearest enclosing entity with an id.
 *
 * A `scalingClassId` must also name a class the pack defines: a mistyped id
 * reads no class level and falls through the same way, silently (#108).
 */
```

At the top of `validateClassScaling`'s body, before `  const visit = (`, add:

```ts
  const classIds = new Set(pack.classes.map((entry) => entry.id));

```

Replace this block inside `visit`:

```ts
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
```

with:

```ts
    const scaling = record.scalingFactor ?? record.scalingMode;
    const target =
      typeof record.target === "string" ? ` ${record.target}` : "";
    const entry = owner ? `'${owner}'` : "An entry";

    if (
      typeof scaling === "string" &&
      CLASS_SCALED.has(scaling) &&
      !record.scalingClassId
    ) {
      issues.push({
        code: "missing_scaling_class",
        path,
        message: `${entry} scales${target} by ${scaling} but names no scalingClassId.`,
      });
    }

    if (
      typeof record.scalingClassId === "string" &&
      record.scalingClassId.length > 0 &&
      !classIds.has(record.scalingClassId)
    ) {
      issues.push({
        code: "unknown_scaling_class",
        path,
        message: `${entry} scales${target} by class '${record.scalingClassId}', which the pack does not define.`,
      });
    }
```

- [ ] **Step 4: Run it and watch it pass; then the suites that validate the shipped pack**

Run: `pnpm --filter @project/shared exec vitest run src/schemas/__tests__/coreRulePack.test.ts` — pass.
Run: `pnpm --filter @project/shared test` — **233** passed.
Run: `DATABASE_URL= pnpm --filter @project/database test` — **200** passed (the shipped pack still validates).
Run: `pnpm --filter @project/shared typecheck` — clean.
Measure both files CRLF.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/content/validatePack.ts packages/shared/src/schemas/__tests__/coreRulePack.test.ts
git commit -F - <<'EOF'
fix(shared): pack validation rejects a scaling class the pack does not define (#108)

Co-Authored-By: <the trailer your session's attribution instruction supplies>
EOF
```

---

### Task 4: #109 — every web reader takes the level from the class ledger

**Files:**
- Modify: `apps/web/src/hooks/useCharacterStats.ts`, `apps/web/src/components/sheet/DashboardLayout.tsx`, `apps/web/src/components/sheet/TraitWidget.tsx`
- Test: `apps/web/src/hooks/__tests__/useCharacterStats.test.ts`, `apps/web/src/components/sheet/__tests__/DashboardLayout.test.tsx`, `apps/web/src/components/sheet/__tests__/TraitWidget.test.tsx`

**Interfaces:**
- Consumes: `ledgerTotalLevel(classLevels: Record<string, number>): number` from `apps/web/src/utils/ledgerLevel.ts` (exists; its docstring already says every web caller reads it — after this task that is true).

- [ ] **Step 1: Write the failing tests**

Append to the end of `apps/web/src/hooks/__tests__/useCharacterStats.test.ts` (after the last `});`, with one blank line before):

```ts
describe("useDerivedStats level (#109)", () => {
  beforeEach(() => {
    mockStoreState = {
      baseScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      activeModifiers: [],
      getSheetModifiers: () => mockStoreState.activeModifiers,
      getSheetStates: () => mockStoreState.activeStates,
      inventory: [],
      activeStates: [],
      ruleSnapshot: null,
      raceId: null,
      subraceId: null,
      backgroundId: null,
      subclassIds: {},
      choices: { classSelections: {}, traitSelections: {} },
      runtimeEffects: null,
      // a row whose level column drifted to 5 while its ledger says
      // barbarian 4: the column would give a +3 proficiency bonus
      level: 5,
      classLevels: { class_barbarian: 4 },
      getProficiencyGrants: () => [],
      baseHpRolled: 1,
    };
  });

  it("takes the proficiency bonus from the class ledger, not the level column", () => {
    const { profBonus } = useDerivedStats();

    expect(profBonus).toBe(2);
  });
});
```

In `apps/web/src/components/sheet/__tests__/DashboardLayout.test.tsx`, inside `describe("DashboardLayout level up", …)`, add after the test `asks for the level after the class ledger's total, not the level column (#95)`:

```ts

  it("shows the class ledger's total in the header, not the level column (#109)", async () => {
    storeState = {
      ...baseStoreState,
      level: 5,
      classLevels: { class_fighter: 3 },
    };

    const { container, root } = await renderDashboard();
    const badge = Array.from(container.querySelectorAll("header span")).find(
      (span) => span.textContent?.startsWith("Lvl"),
    );

    expect(badge?.textContent).toBe("Lvl 3");

    root.unmount();
    container.remove();
  });
```

In `apps/web/src/components/sheet/__tests__/TraitWidget.test.tsx`, inside `describe("TraitWidget held proficiencies", …)`, add after its existing test:

```ts

  it("shows the class ledger's total level, not the level column (#109)", async () => {
    useFakeStore = buildStore();
    // a drifted column; hydration below brings a fighter 1 ledger
    useFakeStore.setState({ level: 5 });
    mocks.queryData.current = { character: { id: "char_1" } };

    const container = await renderWidget();

    expect(container.textContent).toContain("Level: 1");
    expect(container.textContent).not.toContain("Level: 5");
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @project/web exec vitest run src/hooks/__tests__/useCharacterStats.test.ts src/components/sheet/__tests__/DashboardLayout.test.tsx src/components/sheet/__tests__/TraitWidget.test.tsx`
Expected: 3 FAIL — `expected 3 to be 2`; `expected 'Lvl 5' to be 'Lvl 3'`; TraitWidget's text does not contain `Level: 1`.

- [ ] **Step 3: Switch the readers**

In `apps/web/src/hooks/useCharacterStats.ts`:

Replace `import { SKILL_MAP } from "@project/shared";` with:

```ts
import { SKILL_MAP } from "@project/shared";
import { ledgerTotalLevel } from "../utils/ledgerLevel";
```

In `useDerivedStats`, delete the line `  const level = useCharacterSheetStore((state) => state.level);`.

Replace:

```ts
  return useMemo(() => {
    const profBonus = AbilityEngine.getProficiencyBonus(level);
```

with:

```ts
  return useMemo(() => {
    // the class ledger's total, never the level column: the server derives a
    // level-up's expected level and every maximum from the ledger, and the
    // column can drift from it (#90, #109)
    const totalLevel = ledgerTotalLevel(classLevels);
    const profBonus = AbilityEngine.getProficiencyBonus(totalLevel);
```

Delete this block (the inline ledger sum and its comment), including the blank line after it:

```ts
    // the ledger's sum, not level: applyLevelUp writes characters.level
    // straight from the request without checking it against the ledger, so
    // the two can drift. finalMaxHp (server) already derives its total the
    // same way (#78 final review, F2)
    const totalLevel = Object.values(classLevels).reduce(
      (sum, classLevel) => sum + classLevel,
      0,
    );

```

Replace `      { total: level, classes: classLevels },` (in `calculateAttacksPerAction`'s call) with `      { total: totalLevel, classes: classLevels },`.

In the `useMemo` dependency array at the end of `useDerivedStats`, delete the line `    level,`.

In `apps/web/src/components/sheet/DashboardLayout.tsx`, replace `          <span>Lvl {character.level}</span>` with:

```tsx
          <span>Lvl {ledgerTotalLevel(character.classLevels)}</span>
```

(`ledgerTotalLevel` is already imported there.)

In `apps/web/src/components/sheet/TraitWidget.tsx`:

Replace `import { useCharacterSheetStore } from "../../store/characterSheetStore";` with:

```tsx
import { useCharacterSheetStore } from "../../store/characterSheetStore";
import { ledgerTotalLevel } from "../../utils/ledgerLevel";
```

Delete the line `  const level = useCharacterSheetStore((state) => state.level);`.

Replace `              <div>Level: {level}</div>` with:

```tsx
              <div>Level: {ledgerTotalLevel(classLevels)}</div>
```

- [ ] **Step 4: Run them and watch them pass; then the suite and typecheck**

Run the Step 2 command — 23 passed.
Run: `pnpm --filter @project/web test --run` — **476** passed.
Run: `pnpm --filter @project/web typecheck` — clean.
Measure all six files CRLF.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useCharacterStats.ts apps/web/src/components/sheet/DashboardLayout.tsx apps/web/src/components/sheet/TraitWidget.tsx apps/web/src/hooks/__tests__/useCharacterStats.test.ts apps/web/src/components/sheet/__tests__/DashboardLayout.test.tsx apps/web/src/components/sheet/__tests__/TraitWidget.test.tsx
git commit -F - <<'EOF'
fix(web): the proficiency bonus, attacks and level badges read the class ledger (#109)

Co-Authored-By: <the trailer your session's attribution instruction supplies>
EOF
```

---

### Task 5: #104 — a level-up refreshes the sheet that made it

**Files:**
- Modify: `apps/web/src/components/wizard/LevelUpWizard.tsx`
- Create: `apps/web/src/components/wizard/__tests__/LevelUpWizard.test.tsx`

**Interfaces:**
- Consumes: `useQueryClient` from `@tanstack/react-query` (the app is wrapped in `QueryClientProvider` in `apps/web/src/main.tsx`); the sheet's query key is `["character", characterId]` (`apps/web/src/pages/LiveSheetRoute.tsx`), whose effect re-hydrates the store when the refetched data arrives.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/wizard/__tests__/LevelUpWizard.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  validateAndSubmit: vi.fn(),
  cancelLevelUp: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

// one step, already complete: the commit button is on screen at once
vi.mock("../WizardStepRouter", () => ({ WizardStepRouter: () => null }));
vi.mock("../../../utils/wizardValidation", () => ({
  levelUpSteps: () => ["review"],
  isStepComplete: () => true,
}));

vi.mock("../../../store/levelUpStore", () => ({
  useLevelUpStore: () => ({
    isActive: true,
    progressionContext: { decisions: [] },
    draftPayload: { targetClassId: "class_fighter", newTotalLevel: 4 },
    choiceQuestions: [],
    questionsStatus: "ready",
    cancelLevelUp: mocks.cancelLevelUp,
    validateAndSubmit: mocks.validateAndSubmit,
  }),
}));

vi.mock("../../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (selector: (state: { id: string }) => unknown) =>
    selector({ id: "char_1" }),
}));

import { LevelUpWizard } from "../LevelUpWizard";

const render = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<LevelUpWizard />);
  });
  return { container, root };
};

const commit = async (container: HTMLElement) => {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === "COMMIT LEVEL UP",
  );
  await act(async () => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

describe("LevelUpWizard submit (#104)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refetches the character once the level-up is stored", async () => {
    mocks.validateAndSubmit.mockResolvedValueOnce(undefined);
    const { container, root } = await render();

    await commit(container);

    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["character", "char_1"],
    });

    root.unmount();
    container.remove();
  });

  it("refetches nothing when the level-up is refused", async () => {
    mocks.validateAndSubmit.mockRejectedValueOnce(new Error("refused"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const { container, root } = await render();

    await commit(container);

    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
    expect(container.textContent).toContain("refused");

    root.unmount();
    container.remove();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @project/web exec vitest run src/components/wizard/__tests__/LevelUpWizard.test.tsx`
Expected: 1 FAIL — `refetches the character once the level-up is stored`: `invalidateQueries` was never called. (The refusal test already passes.)

- [ ] **Step 3: Invalidate the character query after a stored level-up**

In `apps/web/src/components/wizard/LevelUpWizard.tsx`:

Replace `import { useMemo, useState } from "react";` with:

```tsx
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
```

Replace `import { useLevelUpStore } from "../../store/levelUpStore";` with:

```tsx
import { useLevelUpStore } from "../../store/levelUpStore";
import { useCharacterSheetStore } from "../../store/characterSheetStore";
```

Directly after the `} = useLevelUpStore();` line (the end of the store destructuring at the top of the component), add:

```tsx
  const queryClient = useQueryClient();
  const characterId = useCharacterSheetStore((state) => state.id);
```

In `handleSubmit`, directly after `      await validateAndSubmit();`, add:

```tsx
      // the sheet refetches and re-hydrates from what the server stored - the
      // new level, hit points, scores and grants - so it stops showing the
      // old character, and a second level-up from this tab asks for the
      // right level (#104)
      void queryClient.invalidateQueries({
        queryKey: ["character", characterId],
      });
```

- [ ] **Step 4: Run it and watch it pass; then the suite and typecheck**

Run the Step 2 command — 2 passed.
Run: `pnpm --filter @project/web test --run` — **478** passed.
Run: `pnpm --filter @project/web typecheck` — clean.
Measure both files CRLF.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/wizard/LevelUpWizard.tsx apps/web/src/components/wizard/__tests__/LevelUpWizard.test.tsx
git commit -F - <<'EOF'
fix(web): a level-up refreshes the sheet that made it (#104)

Co-Authored-By: <the trailer your session's attribution instruction supplies>
EOF
```

---

### Task 6: #105 and #107's display — the hit point step waits for the class's die; the review signs the gain

**Files:**
- Modify: `apps/web/src/components/wizard/steps/HpRollStep.tsx`, `apps/web/src/components/wizard/steps/ReviewStep.tsx`
- Create: `apps/web/src/components/wizard/steps/__tests__/HpRollStep.test.tsx`
- Test: `apps/web/src/components/wizard/steps/__tests__/ReviewStep.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/wizard/steps/__tests__/HpRollStep.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { HpRollStep } from "../HpRollStep";
import { useCharacterSheetStore } from "../../../../store/characterSheetStore";
import { useLevelUpStore } from "../../../../store/levelUpStore";

/** What useQuery answers for /reference/classes; each test sets it. */
const query = vi.hoisted(() => ({
  current: { data: undefined as unknown, isError: false },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => query.current,
}));

vi.mock("../../../../hooks/useCharacterStats", () => ({
  useAbilities: () => ({
    finalAbilities: { CON: { score: 15, modifier: 2 } },
  }),
}));

const render = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<HpRollStep />);
  });
  return { container, root };
};

describe("HpRollStep hit die (#105)", () => {
  beforeEach(() => {
    useCharacterSheetStore.setState({ id: "char_1", campaignId: "camp_1" });
    useLevelUpStore.setState({
      draftPayload: {
        characterId: "char_1",
        targetClassId: "class_fighter",
        newTotalLevel: 4,
      },
    });
  });

  it("offers no die while the class list loads", async () => {
    query.current = { data: undefined, isError: false };

    const { container, root } = await render();

    expect(container.textContent).toContain("Loading hit die…");
    expect(container.querySelectorAll("button")).toHaveLength(0);

    root.unmount();
    container.remove();
  });

  it("offers no die when the class list does not have the class", async () => {
    query.current = {
      data: { classes: [{ id: "class_wizard", hitDie: 6 }] },
      isError: false,
    };

    const { container, root } = await render();

    expect(container.textContent).toContain("Hit die unavailable");
    expect(container.querySelectorAll("button")).toHaveLength(0);

    root.unmount();
    container.remove();
  });

  it("offers the class's own die once it is known", async () => {
    query.current = {
      data: { classes: [{ id: "class_fighter", hitDie: 10 }] },
      isError: false,
    };

    const { container, root } = await render();
    const [average, roll] = Array.from(container.querySelectorAll("button"));

    expect(average?.textContent).toContain("Take Average6");
    expect(roll?.textContent).toContain("Roll 1d10");

    root.unmount();
    container.remove();
  });
});
```

In `apps/web/src/components/wizard/steps/__tests__/ReviewStep.test.tsx`, inside `describe("ReviewStep hit point preview (#88)", …)`, add after the test `says the preview is unavailable when the server cannot answer`:

```tsx

  it.each([
    ["no change", 29, 0, "29+0"],
    ["a loss", 28, -1, "28−1"],
  ])("signs %s properly (#107)", async (_label, maxHpAfter, hitPointGain, expected) => {
    vi.mocked(apiClient).mockResolvedValueOnce({
      maxHpBefore: 29,
      maxHpAfter,
      hitPointGain,
    });

    const { container, root } = await render();
    await act(async () => {});

    expect(rowCells(container, "Maximum Hit Points")?.[3]).toBe(expected);

    root.unmount();
    container.remove();
  });
```

The `−` in `"28−1"` is U+2212 MINUS SIGN, not a hyphen.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @project/web exec vitest run src/components/wizard/steps/__tests__/HpRollStep.test.tsx src/components/wizard/steps/__tests__/ReviewStep.test.tsx`
Expected: 3 FAIL — the two HpRollStep "offers no die" tests (the step renders its d8 buttons) and `signs a loss properly (#107)` (`expected '28+-1' to be '28−1'`). The other new cases already pass.

- [ ] **Step 3: Drop the default die**

In `apps/web/src/components/wizard/steps/HpRollStep.tsx`:

Replace `  const { data: classesData } = useQuery<` with `  const { data: classesData, isError } = useQuery<`.

Replace:

```tsx
  // determine die size based on the class being leveled up
  const selectedClass = classesData?.classes.find(
    (cls) => cls.id === draftPayload.targetClassId,
  );
  const hitDieSize = selectedClass?.hitDie ?? 8;
```

with:

```tsx
  // the class being levelled up. No default die: a guessed d8 offered while
  // the class list loads could be taken, and stored for a class that rolls
  // something else (#105)
  const selectedClass = classesData?.classes.find(
    (cls) => cls.id === draftPayload.targetClassId,
  );

  if (!selectedClass) {
    return (
      <div className="flex flex-col h-full">
        <h3 className="text-lg font-bold border-b-2 border-gray-800 pb-2 mb-4 uppercase">
          Hit Points Increase
        </h3>
        <p className="text-sm text-gray-600">
          {classesData || isError ? "Hit die unavailable" : "Loading hit die…"}
        </p>
      </div>
    );
  }

  const hitDieSize = selectedClass.hitDie;
```

Every hook in the component is called above this point, so the early return does not change the hook order.

- [ ] **Step 4: Sign the gain**

In `apps/web/src/components/wizard/steps/ReviewStep.tsx`, immediately before `export const ReviewStep = () => {`, add:

```tsx
/**
 * A change with its sign - "+13", "+0", "−1" - so a gain below zero reads as
 * one, not as "+-1" (#107).
 * @param value The change
 * @returns The change, signed
 */
const signedDelta = (value: number): string =>
  value < 0 ? `−${Math.abs(value)}` : `+${value}`;

```

Replace `              delta: `+${hitPointPreview.hitPointGain}`,` with:

```tsx
              delta: signedDelta(hitPointPreview.hitPointGain),
```

- [ ] **Step 5: Run them and watch them pass; then the suite and typecheck**

Run the Step 2 command — all pass.
Run: `pnpm --filter @project/web test --run` — **483** passed.
Run: `pnpm --filter @project/web typecheck` — clean.
Measure all four files CRLF.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/wizard/steps/HpRollStep.tsx apps/web/src/components/wizard/steps/ReviewStep.tsx apps/web/src/components/wizard/steps/__tests__/HpRollStep.test.tsx apps/web/src/components/wizard/steps/__tests__/ReviewStep.test.tsx
git commit -F - <<'EOF'
fix(web): the hit point step waits for the class's die; the review signs its gain (#105, #107)

Co-Authored-By: <the trailer your session's attribution instruction supplies>
EOF
```

---

### Task 7: Docs — close #104–#109, record #110 and #111, the live checks

**Files:**
- Modify: `docs/TODO_BACKLOG.md`, `docs/development/sample-characters.md`

Both files are CRLF and hold non-ASCII (—, →, …, ✅, −). Apply every edit with a Node script saved as a `.cjs` file (UTF-8): read the file, normalise to LF, replace each anchor (throw if an anchor is missing or appears more than once), write back CRLF. Anchors are quoted below exactly as the files hold them, LF shown. In each fenced block, the text is exact and the fences are not part of it.

- [ ] **Step 1: `docs/TODO_BACKLOG.md` — the status paragraph**

Replace:

```
**Status as of 2026-09-24**, on `main`, after `fix/hp-level-up` merged (#86,
#87, #88, #94 and #95 closed: the one-hit-point-per-level floor applies to
each level's roll and Constitution together, Draconic Resilience scales per
sorcerer level and pack validation rejects class-level scaling that names no
class, the level-up review previews the server's own hit point gain, a
level-up locks the row it reads, and every web caller takes a character's
level from its class ledger; #31a moved ahead of the rogue pass; the live
check found #103, a level-up's ability score increase never stored, and the
branch closed it too; its final review then recorded four more open items,
#106–#109). The workspace is green - **2429 tests**, 0 failures,
and typecheck clean per
```

with:

```
**Status as of 2026-09-24**, on `main`, after `fix/level-up-follow-ups`
merged (#104–#109 closed: a level-up refreshes the sheet that made it, the
hit point step waits for the class's own die, both level-up routes check the
roll and the ability score increase, a new level always adds at least one
hit point, pack validation rejects a scaling class the pack does not define,
and every web reader takes the level from the class ledger; #110 and #111
recorded). Before it, `fix/hp-level-up` closed #86, #87, #88, #94, #95 and
#103 and moved #31a ahead of the rogue pass. The workspace is green -
**2458 tests**, 0 failures, and typecheck clean per
```

- [ ] **Step 2: `docs/TODO_BACKLOG.md` — the index**

Replace each of these six rows

```
| 104 | The sheet shows the old character after its own level-up until the page reloads | Open | Open items |
| 105 | The level-up hit point step offers a d8's average while the class list loads | Open | Open items |
| 106 | The level-up payload is trusted | Open | Open items |
| 107 | A level whose roll plus a negative Constitution modifier is below 1 gains less than 1 hit point | Open | Open items |
| 108 | `validateClassScaling` checks that a class is named, not that it exists | Open | Open items |
| 109 | The sheet's proficiency bonus reads the level column | Open | Open items |
```

with the same row whose last two cells read `| ✅ Closed | Closed items |`, and immediately after the #109 row insert:

```
| 110 | The wizard's ASI step caps and shows scores that include equipment | Open | Open items |
| 111 | A level-up is not broadcast | Open | Open items |
```

- [ ] **Step 3: `docs/TODO_BACKLOG.md` — move #104–#109 to Closed items**

The six sections run consecutively in Open items, from the line
`### #104 — the sheet shows the old character after its own level-up until the page reloads`
up to (not including) the line `### Coverage thresholds`. Cut that whole span out of Open items, and put in its place (so Open items keeps one blank line before `### Coverage thresholds`) the two new open items of Step 4.

Transform each of the six cut sections:
- its `### #NNN — …` heading gains ` ✅` at the end;
- in its one-row table, the Item cell gains a `✅ ` prefix, and the Notes cell's `2026-09-24. See below.` becomes `2026-09-24; closed 2026-09-24. See below.`;
- its closing paragraph (below) is appended after its last paragraph, separated by one blank line.

Insert the six transformed sections, in number order, immediately before the line `### P0 — Previously inert runtime seams (now resolved) ✅` (they follow #103's section), one blank line between sections and one before `### P0`.

Closing paragraphs:

#104:

```
**Closed 2026-09-24** on `fix/level-up-follow-ups`, for the tab that levels
up. `LevelUpWizard` invalidates the `["character", characterId]` query once
the level-up is stored; the route refetches and re-hydrates the store, so the
sheet shows the new level, hit points, scores and grants without a reload,
and a second level-up from the same tab asks for the right level. Other tabs
and viewers still keep the old character until they reload - broadcasting a
level-up is #111.
```

#105:

```
**Closed 2026-09-24** on `fix/level-up-follow-ups`. The step no longer
defaults the die: while `/reference/classes` loads it shows "Loading hit
die…", and if the list lacks the class, "Hit die unavailable" - neither
offers a button, so nothing can be stored for the wrong die.
```

#106:

```
**Closed 2026-09-24** on `fix/level-up-follow-ups`. `checkLevelUpNumbers`
(`apps/server/src/services/levelUpNumbers.ts`) runs in both routes right
after the character is loaded, before any write: `hpRoll` is a whole number
from 1 to the class's hit die; `asiChoices`, unless empty, is one or two
entries, each an `AbilitySchema` stat named once with a positive whole value,
totalling 2, with no score - race and traits, not items - rising above 20.
An unknown target class is refused too. A failure is a 400 naming the broken
rule; the preview answers 400 where it answered NaN. The wizard's own cap
reads a different score - #110.
```

#107:

```
**Closed 2026-09-24** on `fix/level-up-follow-ups`. `levelUpHitPoints`
stores the roll lifted to `1 - Constitution modifier` when it is lower - the
modifier after this level's own increase - so every new level adds at least
one hit point; the preview and the write share it. The review step signs a
gain properly ("+0", "−1") should one ever reach it. **Residual, recorded
rather than solved:** rolls are still stored as one sum, so a later
Constitution increase also counts a lifted level's lift, overstating the
maximum by about one hit point per lifted level; only storing per-level
rolls is exact.
```

#108:

```
**Closed 2026-09-24** on `fix/level-up-follow-ups`. `validateCoreRulePack`
rejects a `scalingClassId` that names no class in the pack
(`unknown_scaling_class`), through the same whole-pack walk as
`missing_scaling_class`. The shipped pack's four ids all resolve.
```

#109:

```
**Closed 2026-09-24** on `fix/level-up-follow-ups`. `useDerivedStats` takes
the proficiency bonus, attacks per action and maximum hit points from
`ledgerTotalLevel`; its inline copy and stale comment are gone. The header
badge and the TraitWidget's "Level:" line read the ledger too (attacks per
action was a fourth reader the record above missed), so no web reader shows
the column and `ledgerLevel.ts`'s docstring holds. The store keeps its
`level` field as loaded.
```

- [ ] **Step 4: `docs/TODO_BACKLOG.md` — #110 and #111 under Open items**

The text that takes the cut span's place in Step 3 (ending with one blank line before `### Coverage thresholds`):

```
### #110 — the wizard's ASI step caps and shows scores that include equipment

| # | Item | Notes |
| --- | --- | --- |
| 110 | The wizard's ASI step caps and shows scores that include equipment | Found while designing `fix/level-up-follow-ups`, 2026-09-24. See below. |

`AsiDistribution`
(`apps/web/src/components/wizard/steps/subcomponents/AsiDistribution.tsx`)
and the review step's ability rows read `useAbilities().finalAbilities`,
which counts equipment and live effects as well as race and traits. The
rules cap an increase against the character's own score, and the server's
check (#106) uses `finalAbilityScores` - race and traits, no items. So an
item that sets a score shows the item's score as the "Base" and stops the
increase at 20 against it: Brother Mote (sample `…0128`) wears a Headband of
Intellect, and his step shows INT 19 and allows only +1 there. The wizard
can never send what the server refuses, only refuse what it would allow.
Fix: have the step read the same race-and-traits scores the server does.

### #111 — a level-up is not broadcast

| # | Item | Notes |
| --- | --- | --- |
| 111 | A level-up is not broadcast | Split from #104 by `fix/level-up-follow-ups`, 2026-09-24. See below. |

The tab that levels up refetches its character (#104); nothing tells any
other. `applyLevelUp` is an HTTP handler with no path to the socket
gateway's rooms (`apps/server/src/gateway/socket.ts` creates the `Server`),
so a second tab on the same character - the two-tab samples, Ursk and
Tamsin - or another player's view keeps the old level, hit points and scores
until it reloads. Its next level-up is refused by #90's check (400) rather
than applied twice, so it fails safe. Fix: give the HTTP layer a way to emit
to `campaign_<id>` after the transaction commits, and have the sheet refetch
its character on that event.

```

- [ ] **Step 5: `docs/development/sample-characters.md` — the roster**

Replace `| 31/31 | Level-up staging | #88, #94, #103, #24 |` with `| 31/31 | Level-up staging | #88, #94, #103, #104, #106, #24 |`.
Replace `| 21/29 | Wizard preview | #86, #31a, #83 |` with `| 21/29 | Wizard preview | #86, #107, #31a, #83 |`.
Replace `| 95/80 | Broken on purpose | #95, #98 |` with `| 95/80 | Broken on purpose | #95, #109, #98 |`.

- [ ] **Step 6: `docs/development/sample-characters.md` — Brannoc**

Replace step 3 under the Brannoc Hale heading:

```
3. **Level Up → Fighter 4 (#88 and #103, regression checks).** Take the
   average, 6, once the hit point step offers a d10 (it shows a d8 while the
   class list loads, #105), and take the increase as +1 CON and +1 STR. The
   review step asks the server and shows 31 → 44 (+13) — the gain the
   level-up stores, CON 16 raising the three earlier levels included. Submit,
   then reload (the sheet keeps the old character until you do, #104): it
   reads 44/44 with STR 17 and CON 16. Before #103 the increase was never
   stored, and the reloaded sheet read 44/40.
4. **Double submit (#94, a regression check).**
```

with:

````
3. **Level Up → Fighter 4 (#88, #103 and #104, regression checks).** Take
   the average, 6, from the hit point step's d10, and take the increase as +1
   CON and +1 STR. The review step asks the server and shows 31 → 44 (+13) —
   the gain the level-up stores, CON 16 raising the three earlier levels
   included. Submit: as the wizard closes, the sheet reads 44/44 with STR 17
   and CON 16, no reload needed. Before #104 it kept the old character until
   a reload; before #103 the increase was never stored at all.
4. **Again, in the same tab (#104, a regression check).** Level Up once more
   → Fighter 5: the wizard asks for total level 5 and the level-up succeeds.
   Before #104 the stale sheet asked for 4 and was refused.
5. **A crafted increase (#106, a regression check).** From the browser
   console, both routes refuse an increase that does not total 2:

   ```js
   const body = { targetClassId: "class_fighter", newTotalLevel: 4, hpRoll: 6,
     asiChoices: [{ stat: "CON", value: 3 }] };
   const post = (path) => fetch(
     `http://localhost:3000/api/character/00000000-0000-0000-0000-000000000121/${path}`,
     { method: "POST", body: JSON.stringify(body),
       headers: { "content-type": "application/json", "x-tester-id": "dev-user-1" } },
   ).then(async (response) => [response.status, (await response.json()).error]);
   await Promise.all([post("level-up/preview"), post("level-up")]);
   ```

   Both answer 400, "Invalid character choices: ability score increases must
   total 2, not 3." Before #106 the level-up stored the +3.
6. **Double submit (#94, a regression check).**
````

- [ ] **Step 7: `docs/development/sample-characters.md` — Seraphine and Mote**

Under the Seraphine Dusk heading, replace

```
5. **Race stubs.** Sunlight Sensitivity changes nothing (a race stub, #30).
```

with:

````
5. **Race stubs.** Sunlight Sensitivity changes nothing (a race stub, #30).
6. **A low roll (#107, a regression check).** From the browser console, ask
   the preview for a roll of 1 at wizard 10:

   ```js
   await fetch("http://localhost:3000/api/character/00000000-0000-0000-0000-000000000126/level-up/preview",
     { method: "POST",
       body: JSON.stringify({ targetClassId: "class_wizard", hpRoll: 1 }),
       headers: { "content-type": "application/json", "x-tester-id": "dev-user-1" } },
   ).then((response) => response.json());
   ```

   It answers 29 → 30 (+1): the roll is stored as 2, so the level adds the
   rules' minimum of one hit point. Before #107 it answered +0.
````

Under the Brother Mote heading, replace step 1:

```
1. **The level (#95, a regression check).** The header reads level 12; the
   class ledger reads Cleric 11. Level Up and submit: it succeeds. The wizard
   takes his total from the ledger and asks for 12, which the server accepts;
   the ledger reaches Cleric 12 and now agrees with the column. Re-seed to
   restore the drift.
```

with:

```
1. **The level (#95 and #109, regression checks).** The level column says
   12; the class ledger says Cleric 11, and the sheet shows 11 - the header
   badge reads the ledger. Level Up and submit: it succeeds. The wizard takes
   his total from the ledger and asks for 12, which the server accepts; the
   ledger reaches Cleric 12 and now agrees with the column. Re-seed to
   restore the drift.
```

- [ ] **Step 8: Verify and commit**

Check the result with `git diff`: only the intended lines change, with no whole-file churn. Measure both files CRLF. `pnpm check:hygiene` passes. `DATABASE_URL= pnpm test:all` is green at **2458** (shared 233, engine 1017, database 200, server 525, web 483).

```bash
git add docs/TODO_BACKLOG.md docs/development/sample-characters.md
git commit -F - <<'EOF'
docs: close #104-#109; record #110 and #111; the live checks for them

Co-Authored-By: <the trailer your session's attribution instruction supplies>
EOF
```

---

### Task 8: Verification — the workspace, then the live samples (controller)

Run by the controller, not a subagent.

- [ ] **Step 1:** `DATABASE_URL= pnpm test:all` green at 2458; `pnpm typecheck --force` 5/5; `pnpm check:hygiene` passes.
- [ ] **Step 2:** The pack is unchanged, so no import is needed. Re-seed the samples (`pnpm --filter @project/database db:seed:samples`) and restart the `server` preview. If Postgres is down, see the dev-DB memory (the `dnd-postgres` container).
- [ ] **Step 3: Hand-check in the browser pane**, following `sample-characters.md`:
  - Brannoc (`…0121`) step 3: the hit point step never offers a fighter a d8; the review shows 31 → 44 (+13); the sheet reads 44/44 as the wizard closes, with no reload.
  - Brannoc step 4: a second level-up in the same tab (fighter 5) succeeds.
  - Brannoc step 5: both routes answer 400 with the "must total 2, not 3" message.
  - Seraphine (`…0126`) step 6: the preview answers 29 → 30 (+1).
  - Brother Mote (`…0128`) step 1: the header badge reads 11.
  - Anything else found is recorded as a backlog item, not fixed.
- [ ] **Step 4:** Re-seed once more, so the samples are back at their staged state.
