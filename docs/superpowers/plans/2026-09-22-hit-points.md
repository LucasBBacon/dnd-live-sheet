# Hit Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `characters.max_hp` stores base rolled hit points, and every displayed or clamping maximum is derived by the engine as base + CON x level + `MAX_HP` modifiers, so creation writes real hit points, a level-up keeps the Constitution modifier the wizard promised, and the pack's HP traits finally reach a sheet (backlog #78).

**Architecture:** One helper, `finalMaxHp(save, snapshot)`, joins `finalAbilityScores` in the server's `characterSave.ts` and wraps `DerivedStatEngine.calculateMaxHp`. A tiny service, `hitPoints.ts`, loads a character and returns that number for the server's heal clamp and long rest. Creation writes the class hit die as the base and a derived full current HP; level-up keeps `max_hp += roll` and moves `current_hp` by the derived difference. On the web, hydration finally fills `baseHpRolled` and one store getter, `getMaxHp()`, replaces the stored `maxHp` field everywhere.

**Tech Stack:** TypeScript, pnpm + turbo monorepo; Vitest; drizzle (Postgres); `@project/engine`; Express (`apps/server`); React 19 + Zustand (`apps/web`).

**Spec:** `docs/superpowers/specs/2026-09-22-hit-points-design.md`

## Global Constraints

- Line endings: the working tree is CRLF with `core.autocrlf=true`, and git normalises endings, so `git diff`/`git show` cannot reveal them. **Every file this plan touches is CRLF, and the new files must be CRLF too.** Edit/Write emit LF. After editing, restore CRLF on every file you touched:
  ```bash
  node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' <file> <file> ...
  ```
  Do not use `sed -i`. `pnpm check:hygiene` fails on a file with mixed endings.
- CI has no `.env` and no `DATABASE_URL`: nothing a test imports may require it at load. Run server tests as `DATABASE_URL= pnpm --filter @project/server test`.
- Never run `db:migrate`, `db:seed*`, `db:import-pack` or anything else that writes to a database. The hand check (Task 7) is run by the controller with the owner's permission.
- Typecheck per package with `pnpm --filter @project/<pkg> typecheck` (`tsc -b` in web). Never trust turbo's cached `pnpm typecheck`. Vitest does not typecheck.
- Web component tests use `createRoot` from `react-dom/client` + `act` from `react`; `@testing-library/react` is not installed.
- Rules come only from the pack: server and database tests assemble the real pack; web tests use `packRuleSnapshot()` (`apps/web/src/store/__tests__/packFixture.ts`).
- The maximum is always `DerivedStatEngine.calculateMaxHp(baseRolledHp, conModifier, levels, modifiers)`: base + `Math.max(1, conModifier) x total level` + every active `MAX_HP` modifier. Never re-implement that arithmetic anywhere else.
- Verified numbers from the shipped pack, to use verbatim: a hill dwarf fighter 1 (CON 14 -> 16, +3) with base 24 derives **28** (Dwarven Toughness adds 1); a human cleric 3 (CON 14 -> 15, +2) with base 18 derives **24**; a human Draconic Bloodline sorcerer 3 (CON 10 -> 11, +0) with base 10 derives **14** (`max(1, 0) x 3` plus Draconic Resilience's flat 1).
- `pnpm test:all` (hygiene + all five packages) and every touched package's typecheck must be green at the end of every task.
- Commit messages end with a blank line then `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` (use `git commit -F -` with a heredoc). Subjects cite (#78). Do not push.
- Touch only the files a task lists. A failure in any other file: stop and report NEEDS_CONTEXT.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `apps/server/src/services/characterSave.ts` | `finalMaxHp(save, snapshot)` — the one derivation | 1 |
| `apps/server/src/routes/character.ts` | creation writes the hit die and a full current HP | 2 |
| `apps/server/src/controllers/characterController.ts` | level-up moves current HP by the derived delta | 2 |
| `apps/server/src/services/hitPoints.ts` (new) | `deriveMaxHp(characterId)` — loads a character, returns the maximum | 3 |
| `apps/server/src/services/combatService.ts`, `apps/server/src/gateway/socket.ts` | heal clamp and long rest use it | 3 |
| `apps/web/src/pages/characterSheetRouteData.ts`, `apps/web/src/store/characterSheetStore.ts` | hydrate `baseHpRolled`; `getMaxHp()` replaces the stored field | 4 |
| `apps/web/src/components/sheet/{DashboardLayout,TraitWidget}.tsx`, `.../modals/RestModal.tsx` | read the derived maximum | 4 |
| `packages/database/src/seedSampleCharacters.ts` | samples store base rolled hit points | 5 |

---

### Task 1: The one derivation

**Files:**
- Modify: `apps/server/src/services/characterSave.ts`
- Test: `apps/server/src/services/__tests__/characterSave.test.ts`
- Test: `packages/engine/src/calculators/__tests__/derivedStats.test.ts`

**Interfaces:**
- Produces: `finalMaxHp(save: CharacterSave, snapshot: RuleSnapshotLookup): number`, exported from `apps/server/src/services/characterSave.ts`.

- [ ] **Step 1: Write the failing tests**

In `packages/engine/src/calculators/__tests__/derivedStats.test.ts`, inside `describe("DerivedStatEngine.calculateMaxHp", ...)`, add (match the file's existing modifier-object shape — copy the fields a neighbouring test's modifier uses, changing `target` to `"MAX_HP"`):

```ts
  it("adds a MAX_HP modifier to the total, scaled by total level", () => {
    const result = DerivedStatEngine.calculateMaxHp(
      20,
      2,
      { total: 3, classes: { class_barbarian: 3 } },
      [
        {
          target: "MAX_HP",
          type: "add",
          value: 1,
          scalingFactor: "total_level",
          isActive: true,
          sourceName: "Dwarven Toughness",
        } as never,
      ],
    );

    expect(result.total).toBe(29);
    expect(result.breakdown).toContainEqual(
      expect.objectContaining({ name: "Dwarven Toughness" }),
    );
  });
```

(20 base + `max(1, 2) x 3` + `1 x 3` = 29.)

In `apps/server/src/services/__tests__/characterSave.test.ts`, add `finalMaxHp` to the import from `"../characterSave.js"` and add a new describe after `describe("finalAbilityScores", ...)`:

```ts
describe("finalMaxHp", () => {
  let snapshot: CoreRulePackSnapshot;

  beforeAll(async () => {
    snapshot = toRuleSnapshot(await assembleCoreRulePack(PACK_DIR));
  });

  it("adds the Constitution modifier for every level, and a trait's own MAX_HP", () => {
    // a hill dwarf fighter 1: CON 14 + 2 = 16 (+3), base 24, and Dwarven
    // Toughness adds 1 per level
    const save = toCharacterSave(row(), fighterLedger);

    expect(finalMaxHp(save, snapshot)).toBe(28);
  });

  it("counts the Constitution modifier for every level of a multi-level class", () => {
    const save = toCharacterSave(
      row({
        raceId: "race_human",
        subraceId: null,
        con: 14,
        currentHp: 18,
        maxHp: 18,
      }),
      [{ classId: "class_cleric", classLevel: 3, subclassId: "subclass_cleric_life" }],
    );

    expect(finalMaxHp(save, snapshot)).toBe(24);
  });

  it("gives at least one hit point per level when Constitution is not a bonus", () => {
    // a human Draconic Bloodline sorcerer 3: CON 10 + 1 = 11 (+0), base 10,
    // so three levels grant the 1-per-level floor, and Draconic Resilience
    // adds its own
    const save = toCharacterSave(
      row({
        raceId: "race_human",
        subraceId: null,
        con: 10,
        currentHp: 10,
        maxHp: 10,
      }),
      [{ classId: "class_sorcerer", classLevel: 3, subclassId: "subclass_sorcerer_draconic" }],
    );

    expect(finalMaxHp(save, snapshot)).toBe(14);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @project/engine test derivedStats`
Expected: FAIL — the new test's expectation is 29 against whatever the modifier shape yields; if the modifier object's fields are wrong for `RuntimeModifier`, fix the fields (not the 29) until it compiles and reports the real number.
Run: `DATABASE_URL= pnpm --filter @project/server test characterSave`
Expected: FAIL — `finalMaxHp is not a function` (it is not exported yet).

- [ ] **Step 3: Implement**

In `apps/server/src/services/characterSave.ts`, add `DerivedStatEngine` to the existing `@project/engine` import list, and add after `finalAbilityScores`:

```ts
/**
 * A character's maximum hit points: the stored base rolled hit points, plus
 * the Constitution modifier for every level, plus every MAX_HP modifier a
 * trait grants (Dwarven Toughness, Tough, Draconic Resilience).
 *
 * The one derivation every clamp and every display reads, so the stored
 * column can mean one thing - the hit dice taken, and nothing else (#78).
 * Magic items are left out exactly as finalAbilityScores leaves them out: no
 * pack item modifies CON or MAX_HP, and an item that did would have to reach
 * this function as inventory.
 * @param save The character
 * @param snapshot Pack content
 * @returns The maximum hit points to show and to clamp against
 */
export const finalMaxHp = (
  save: CharacterSave,
  snapshot: RuleSnapshotLookup,
): number => {
  const modifiers = gatherSheetModifiers({
    activeTraits: CharacterBootstrapper.compileActiveTraits(save, snapshot),
    selections: CharacterBootstrapper.resolveSelections(save),
    inventory: [],
    effectManager: new EffectManager(),
    snapshot,
  });
  const conModifier = AbilityEngine.calculateScore(
    save.attributes.con,
    "CON",
    modifiers,
    [],
  ).modifier;

  return DerivedStatEngine.calculateMaxHp(
    save.hp.baseRolledHp,
    conModifier,
    {
      total: save.classes.reduce((sum, entry) => sum + entry.level, 0),
      classes: Object.fromEntries(
        save.classes.map((entry) => [entry.classId, entry.level]),
      ),
    },
    modifiers,
  ).total;
};
```

- [ ] **Step 4: Run the tests, the suite and the typechecks**

Run: `pnpm --filter @project/engine test derivedStats` and `DATABASE_URL= pnpm --filter @project/server test characterSave` — PASS.
Run: `pnpm test:all` — green. Typecheck engine and server — clean.

- [ ] **Step 5: Restore CRLF and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' apps/server/src/services/characterSave.ts apps/server/src/services/__tests__/characterSave.test.ts packages/engine/src/calculators/__tests__/derivedStats.test.ts
pnpm check:hygiene
git add apps/server/src/services/characterSave.ts apps/server/src/services/__tests__/characterSave.test.ts packages/engine/src/calculators/__tests__/derivedStats.test.ts
git commit -F - <<'EOF'
feat(server): one derivation of a character's maximum hit points (#78)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: The writers — creation and level-up

**Files:**
- Modify: `apps/server/src/routes/character.ts` (the `toCharacterSave` call and the `characters` insert)
- Modify: `apps/server/src/controllers/characterController.ts` (the `characters` update at the end of `applyLevelUp`)
- Test: `apps/server/src/routes/__tests__/character.choices.test.ts`
- Test: `apps/server/src/routes/__tests__/levelUp.questions.test.ts`

**Interfaces:**
- Consumes: `finalMaxHp(save, snapshot)` (Task 1).
- Produces: a created character's row carries `maxHp` = the class's hit die and `currentHp` = its derived maximum; a level-up's row carries `maxHp = COALESCE(max_hp, 0) + hpRoll` and `currentHp = COALESCE(current_hp, 0) + (derived after - derived before)`.

- [ ] **Step 1: Write the failing tests**

In `apps/server/src/routes/__tests__/character.choices.test.ts`, inside `describe("POST /api/character choices", ...)`, after `"creates a cleric with three cantrips, stored under the class (#79)"`:

```ts
  it("stores the class's hit die as the base and full derived hit points (#78)", async () => {
    const { app, values } = await setupApp();

    const response = await request(app)
      .post("/api/character")
      .send({ ...cleric, choices: completeChoicesForCleric() });

    expect(response.status).toBe(201);
    // a cleric's d8 is the base; WIS 16/CON 14 human -> CON 15 (+2), so the
    // derived maximum at level 1 is 8 + 2
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ maxHp: 8, currentHp: 10 }),
    );
  });
```

In `apps/server/src/routes/__tests__/levelUp.questions.test.ts`, after the cleric 3 -> 4 test:

```ts
  it("raises hit points by the roll plus the Constitution modifier (#78)", async () => {
    const { options, levelUp, sets } = await setup(humanCleric(), [cleric(3)]);
    const { choiceQuestions } = await options({ classId: "class_cleric" });

    const result = await levelUp({
      targetClassId: "class_cleric",
      newTotalLevel: 4,
      featId: "feat_alert",
      hpRoll: 5,
      ...answerAll(choiceQuestions),
    });

    expect(result.status).toBe(200);
    // the character row starts at maxHp 30 (the shared fixture), CON 14 -> 15
    // (+2) as a human: the base grows by the roll alone, and current hit
    // points by the roll plus one level's Constitution
    const written = sets.find(
      (value): value is { maxHp: unknown; currentHp: unknown } =>
        typeof value === "object" && value !== null && "maxHp" in value,
    );
    expect(written).toBeDefined();
  });
```

That last assertion is deliberately shallow: `maxHp`/`currentHp` are drizzle `sql` fragments, so the route test can only prove they are written. The arithmetic is proven in Step 2's unit test below.

The arithmetic itself is pinned by a unit test of the exported helper Task 2
adds. Create `apps/server/src/controllers/__tests__/levelUpHitPoints.test.ts`:

```ts
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { assembleCoreRulePack } from "@project/database/pack";
import { toRuleSnapshot, type CoreRulePackSnapshot } from "@project/shared";
import { levelUpHitPointGain } from "../characterController.js";
import { buildLevelUpSaves } from "../../services/characterSave.js";
import { emptyCharacterChoices } from "@project/shared";

const PACK_DIR = path.join(
  process.cwd(),
  "../../packages/database/data/packs/core_2014_pack",
);

/** a human cleric 3 with 18 base rolled hit points and CON 14 (15 as a human) */
const aveline = {
  raceId: "race_human",
  subraceId: null,
  backgroundId: null,
  str: 12,
  dex: 9,
  con: 14,
  int: 10,
  wis: 16,
  cha: 11,
  currentHp: 24,
  maxHp: 18,
};

const ledger = [
  { classId: "class_cleric", classLevel: 3, subclassId: "subclass_cleric_life" },
];

describe("levelUpHitPointGain", () => {
  let snapshot: CoreRulePackSnapshot;

  beforeAll(async () => {
    snapshot = toRuleSnapshot(await assembleCoreRulePack(PACK_DIR));
  });

  const saves = () =>
    buildLevelUpSaves({
      character: aveline,
      ledger,
      storedChoices: emptyCharacterChoices(),
      targetClassId: "class_cleric",
    });

  it("adds the roll and this level's Constitution modifier", () => {
    expect(
      levelUpHitPointGain({
        saves: saves(),
        payload: { hpRoll: 5 },
        snapshot,
      }),
    ).toBe(7);
  });

  it("counts an ability score increase that raises Constitution at this level", () => {
    // CON 14 -> 16 (17 as a human, +3): every level's contribution rises,
    // not just the new one
    expect(
      levelUpHitPointGain({
        saves: saves(),
        payload: { hpRoll: 5, asiChoices: [{ stat: "CON", value: 2 }] },
        snapshot,
      }),
    ).toBe(11);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `DATABASE_URL= pnpm --filter @project/server test character.choices levelUp.questions`
Expected: FAIL — creation records no `maxHp`/`currentHp` at all, and the level-up delta is the raw roll (5), not 7.

- [ ] **Step 3: Implement creation**

In `apps/server/src/routes/character.ts`, before the `toCharacterSave` call, resolve the hit die and fail cleanly without one:

```ts
    // 5e: a character starts with the full hit die of their class, and that
    // is all the column stores - the maximum is derived from it (#78)
    const hitDie = snapshot.classesById?.[payload.classId]?.hitDie;
    if (!hitDie) {
      return res
        .status(400)
        .json({ error: `Unknown class: ${payload.classId}` });
    }
```

then change that call's `currentHp: null, maxHp: null` to `currentHp: null, maxHp: hitDie`, and after the issues check compute the starting hit points:

```ts
    const startingHp = finalMaxHp(save, snapshot);
```

and add to the `characters` insert, beside `choices`:

```ts
        maxHp: hitDie,
        currentHp: startingHp,
```

Import `finalMaxHp` from `../services/characterSave.js` alongside the names that file already imports there.

- [ ] **Step 4: Implement level-up**

In `apps/server/src/controllers/characterController.ts`, add this exported
helper above `applyLevelUp` (it is what the unit test in Step 1 calls):

```ts
/**
 * The hit points a level-up adds to a character's current total: the
 * difference between the maximum after this level and the maximum before it.
 * The roll, this level's Constitution modifier, an ability score increase
 * taken at this level and any MAX_HP trait it grants all count once, so the
 * wizard's preview and the stored number cannot disagree (#78).
 * @param saves The character before and after this level (buildLevelUpSaves)
 * @param payload The level-up's roll and any ability score increases
 * @param snapshot Pack content
 * @returns The hit points to add to current hit points
 */
export const levelUpHitPointGain = ({
  saves,
  payload,
  snapshot,
}: {
  saves: Pick<LevelUpSaves<CharacterClassSource>, "before" | "after">;
  payload: Pick<LevelUpPayload, "hpRoll" | "asiChoices">;
  snapshot: RuleSnapshotLookup;
}): number => {
  const attributes = { ...saves.after.attributes };
  for (const choice of payload.asiChoices ?? []) {
    const key = choice.stat.toLowerCase() as keyof typeof attributes;
    attributes[key] += choice.value;
  }

  const after = finalMaxHp(
    {
      ...saves.after,
      attributes,
      hp: {
        ...saves.after.hp,
        baseRolledHp: saves.after.hp.baseRolledHp + payload.hpRoll,
      },
    },
    snapshot,
  );

  return after - finalMaxHp(saves.before, snapshot);
};
```

then, directly before the final `tx.update(characters)`, add:

```ts
      const gainedHp = levelUpHitPointGain({ saves, payload, snapshot });
```

and change the update's two HP lines to:

```ts
          maxHp: sql`COALESCE(${characters.maxHp}, 0) + ${payload.hpRoll}`,
          currentHp: sql`COALESCE(${characters.currentHp}, 0) + ${gainedHp}`,
```

(`COALESCE` repairs a row stored before this branch, whose columns are null.)
Import `finalMaxHp`, and the types `LevelUpSaves` and `CharacterClassSource`,
from `../services/characterSave.js` beside the names already imported there;
`RuleSnapshotLookup` comes from `@project/engine`.

- [ ] **Step 5: Run the tests, the suite and the typechecks**

Run: `DATABASE_URL= pnpm --filter @project/server test character.choices levelUp.questions` — PASS.
Run: `pnpm test:all` — green. `pnpm --filter @project/server typecheck` — clean.

- [ ] **Step 6: Restore CRLF and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' apps/server/src/routes/character.ts apps/server/src/controllers/characterController.ts apps/server/src/routes/__tests__/character.choices.test.ts apps/server/src/routes/__tests__/levelUp.questions.test.ts
pnpm check:hygiene
git add apps/server/src/routes/character.ts apps/server/src/controllers/characterController.ts apps/server/src/routes/__tests__/character.choices.test.ts apps/server/src/routes/__tests__/levelUp.questions.test.ts
git commit -F - <<'EOF'
fix(server): creation and level-up write real hit points (#78)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: The server's readers — heal clamp and long rest

**Files:**
- Create: `apps/server/src/services/hitPoints.ts`
- Modify: `apps/server/src/services/combatService.ts`
- Modify: `apps/server/src/gateway/socket.ts` (the long-rest reset, around the comment "4 - long rest hp reset")
- Test: `apps/server/src/services/__tests__/combatService.test.ts`
- Test: `apps/server/src/services/__tests__/hitPoints.test.ts` (create)

**Interfaces:**
- Consumes: `finalMaxHp` (Task 1), `toCharacterSave`, `readStoredChoices` (both already in `characterSave.ts`), `classLedgerOrder` (`apps/server/src/services/classLedger.ts`), `getCachedRuleSnapshot` (`apps/server/src/services/ruleSnapshotCache.ts`).
- Produces: `deriveMaxHp(characterId: string): Promise<number>` from `apps/server/src/services/hitPoints.ts`.

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/services/__tests__/hitPoints.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { assembleCoreRulePack } from "@project/database/pack";
import { toRuleSnapshot, type CoreRulePackSnapshot } from "@project/shared";

const PACK_DIR = path.join(
  process.cwd(),
  "../../packages/database/data/packs/core_2014_pack",
);

let snapshot: CoreRulePackSnapshot;

const character = {
  id: "char-1",
  raceId: "race_dwarf",
  subraceId: "subrace_dwarf_hill",
  backgroundId: null,
  str: 16,
  dex: 12,
  con: 14,
  int: 10,
  wis: 10,
  cha: 8,
  currentHp: 20,
  maxHp: 24,
  choices: { classSelections: {}, traitSelections: {}, feats: [] },
};

const ledger = [
  { classId: "class_fighter", classLevel: 1, subclassId: null },
];

const loadModule = async () => {
  vi.resetModules();
  vi.doMock("@project/database", () => ({
    db: {
      select: () => ({
        from: (table: { _: { name: string } } | unknown) => ({
          where: () => {
            const rows =
              JSON.stringify(table).includes("character_classes") ? ledger : [character];
            return Object.assign(Promise.resolve(rows), {
              limit: () => Promise.resolve(rows),
              orderBy: () => Promise.resolve(rows),
            });
          },
        }),
      }),
    },
  }));
  vi.doMock("../ruleSnapshotCache.js", () => ({
    getCachedRuleSnapshot: async () => ({ cacheVersion: 1, loadedAt: 0, snapshot }),
  }));
  return import("../hitPoints.js");
};

describe("deriveMaxHp", () => {
  beforeEach(async () => {
    snapshot = toRuleSnapshot(await assembleCoreRulePack(PACK_DIR));
  });

  it("derives base + Constitution per level + a trait's MAX_HP", async () => {
    const { deriveMaxHp } = await loadModule();

    // hill dwarf fighter 1: base 24, CON 16 (+3), Dwarven Toughness +1
    await expect(deriveMaxHp("char-1")).resolves.toBe(28);
  });
});
```

If the table-name check above does not discriminate the two selects in this codebase's drizzle version, switch to the `getTableName` helper the route tests use (`import { getTableName, type Table } from "drizzle-orm"`, then `getTableName(table) === "character_classes"`), which is the established pattern in `apps/server/src/routes/__tests__/levelUp.questions.test.ts`.

In `apps/server/src/services/__tests__/combatService.test.ts`, add at the top, after the `@project/database` mock:

```ts
vi.mock("../hitPoints.js", () => ({
  deriveMaxHp: vi.fn().mockResolvedValue(100),
}));
```

and add one test at the end of the describe:

```ts
  it("clamps a heal to the derived maximum, not the stored base", async () => {
    const txMock = createMockTransaction(createMockCharacter(90, 40));
    (db.transaction as any).mockImplementation((fn: any) => fn(txMock));

    const hp = await modifyCharacterHp("char123", 25);

    // the row's stored 40 is base rolled hit points; deriveMaxHp says 100
    expect(hp).toEqual({ current: 100, temporary: 0, max: 100 });
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `DATABASE_URL= pnpm --filter @project/server test hitPoints combatService`
Expected: FAIL — `Cannot find module '../hitPoints.js'`, and the new clamp test caps at the row's 40.

- [ ] **Step 3: Implement the service**

Create `apps/server/src/services/hitPoints.ts`:

```ts
import { db } from "@project/database";
import {
  characterClasses,
  characters,
} from "@project/database/src/schema/operational.js";
import { eq } from "drizzle-orm";
import { classLedgerOrder } from "./classLedger.js";
import {
  finalMaxHp,
  readStoredChoices,
  toCharacterSave,
} from "./characterSave.js";
import { getCachedRuleSnapshot } from "./ruleSnapshotCache.js";

/**
 * A stored character's maximum hit points.
 *
 * characters.max_hp holds the base rolled hit points alone, so every clamp
 * and every display has to derive the rest - the Constitution modifier for
 * each level and any MAX_HP trait (#78). This is the one place the server
 * loads a character to do it.
 * @param characterId The character to measure
 * @returns The maximum hit points, or 0 for a character that does not exist
 */
export const deriveMaxHp = async (characterId: string): Promise<number> => {
  const [character] = await db
    .select()
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);
  if (!character) return 0;

  const ledger = await db
    .select({
      classId: characterClasses.classId,
      classLevel: characterClasses.classLevel,
      subclassId: characterClasses.subclassId,
    })
    .from(characterClasses)
    .where(eq(characterClasses.characterId, characterId))
    .orderBy(...classLedgerOrder);

  const { snapshot } = await getCachedRuleSnapshot();

  return finalMaxHp(
    toCharacterSave(
      character,
      ledger,
      readStoredChoices(character.choices, characterId),
    ),
    snapshot,
  );
};
```

- [ ] **Step 4: Implement the two readers**

In `apps/server/src/services/combatService.ts`: import `deriveMaxHp` from `./hitPoints.js`, and inside `modifyCharacterHp`, replace

```ts
    const currentHp = character.currentHp ?? 0;
    const maxHp = character.maxHp ?? currentHp;
```

with

```ts
    const currentHp = character.currentHp ?? 0;
    // the row's max_hp is base rolled hit points; the clamp needs the
    // derived maximum (#78)
    const maxHp = await deriveMaxHp(characterId);
```

The long-rest reset has no unit harness in this repo (the gateway's only
tests are `socket.itemActions.test.ts`), so it is covered by Task 7's hand
check rather than by a new socket test.

In `apps/server/src/gateway/socket.ts`, replace the long-rest reset (the block under "4 - long rest hp reset", whose comment mentions "relying on the UI's maxHp calculation") with:

```ts
            // 4 - long rest hp reset: back to the derived maximum, which the
            // stored base rolled hit points alone cannot give (#78)
            if (payload.restType === "long") {
              const restoredHp = await deriveMaxHp(payload.characterId);
              await tx
                .update(characters)
                .set({ currentHp: restoredHp })
                .where(eq(characters.id, payload.characterId));
            }
```

and import `deriveMaxHp` from `../services/hitPoints.js` beside the existing `modifyCharacterHp` import.

- [ ] **Step 5: Run the tests, the suite and the typecheck**

Run: `DATABASE_URL= pnpm --filter @project/server test hitPoints combatService socket` — PASS.
Run: `pnpm test:all` — green. `pnpm --filter @project/server typecheck` — clean.

- [ ] **Step 6: Restore CRLF and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' apps/server/src/services/hitPoints.ts apps/server/src/services/combatService.ts apps/server/src/gateway/socket.ts apps/server/src/services/__tests__/hitPoints.test.ts apps/server/src/services/__tests__/combatService.test.ts
pnpm check:hygiene
git add apps/server/src/services/hitPoints.ts apps/server/src/services/combatService.ts apps/server/src/gateway/socket.ts apps/server/src/services/__tests__/hitPoints.test.ts apps/server/src/services/__tests__/combatService.test.ts
git commit -F - <<'EOF'
fix(server): the heal clamp and long rest use the derived maximum (#78)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: The web — hydrate the base, derive the maximum

**Files:**
- Modify: `apps/web/src/pages/characterSheetRouteData.ts`
- Modify: `apps/web/src/store/characterSheetStore.ts`
- Modify: `apps/web/src/components/sheet/DashboardLayout.tsx`
- Modify: `apps/web/src/components/sheet/modals/RestModal.tsx`
- Modify: `apps/web/src/components/sheet/TraitWidget.tsx`
- Test: `apps/web/src/store/__tests__/characterSheetStore.test.ts`
- Test: `apps/web/src/pages/__tests__/characterSheetRouteData.test.ts`
- Test: `apps/web/src/components/sheet/__tests__/DashboardLayout.test.tsx`

**Interfaces:**
- Produces: `CharacterSheetState.getMaxHp(): number` — base + CON x level + `MAX_HP` modifiers, from the same inputs `useDerivedStats` uses. `CharacterSheetState.maxHp` is removed; `baseHpRolled` is hydrated from the API's `maxHp`.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/pages/__tests__/characterSheetRouteData.test.ts`, find the assertion block for the hydrated payload (the fixture sets `maxHp: 8`) and add to it:

```ts
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ baseHpRolled: 8 }),
    );
```

If the existing test asserts the whole object rather than with `objectContaining`, add `baseHpRolled: 8` to that expected object and remove `maxHp` from it.

In `apps/web/src/store/__tests__/characterSheetStore.test.ts`, add a test in the file's first describe (the one whose fixture sets `id: "char_1"`, `level: 1`, `race_half_orc`):

```ts
  it("derives the maximum from the base, Constitution and trait modifiers (#78)", () => {
    // base 9, CON 10 + 1 (half-orc) = 11 (+0), so one level grants the
    // 1-per-level floor: 10
    expect(useCharacterSheetStore.getState().getMaxHp()).toBe(10);
  });
```

Then replace the four fixtures' `maxHp` lines with the base that derives the same maximum (delete the `maxHp` key, keep `baseHpRolled`):
- the `char_1` fixture (level 1, `race_half_orc`, CON 10): `baseHpRolled: 9` (was `maxHp: 10, baseHpRolled: 1`)
- the `char_remote` fixture (level 1, `race_human`, CON 10): `baseHpRolled: 9`
- the `char_conditions` fixture (level 2, `race_human`, CON 14): `baseHpRolled: 16`
- the level 5 barbarian fixture (CON 14): `baseHpRolled: 10`

Every existing expectation about clamping stays exactly as it is — that is the point of choosing those bases.

In `apps/web/src/components/sheet/__tests__/DashboardLayout.test.tsx`, replace `maxHp: 10` in `MockStoreState` and `baseStoreState` with `getMaxHp: () => 10`, and add `getMaxHp: () => number;` to the interface in place of `maxHp: number;`.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @project/web test characterSheetStore characterSheetRouteData DashboardLayout`
Expected: FAIL — `getMaxHp is not a function`, hydration passes no `baseHpRolled`, and the store fixtures no longer type-check against a state that still has `maxHp`.

- [ ] **Step 3: Implement the store**

In `apps/web/src/store/characterSheetStore.ts`:

1. Add `AbilityEngine` and `DerivedStatEngine` to the existing `@project/engine` import list.
2. In the state interface, delete `maxHp: number;` and leave `baseHpRolled: number;` in place. Add beside the other getters:
   ```ts
   /**
    * The character's maximum hit points: the stored base rolled hit points
    * plus Constitution for every level and every MAX_HP modifier (#78). The
    * same derivation useDerivedStats runs, for the store's own clamps.
    */
   getMaxHp: () => number;
   ```
3. In the initial state, delete `maxHp: 10,` and change `baseHpRolled: 1,` to `baseHpRolled: 10,` so a store with no character still clamps sanely.
4. Implement the getter beside `getSheetStates`:
   ```ts
   getMaxHp: () => {
     const state = get();
     const modifiers = state.getSheetModifiers();
     const activeStates = state.getSheetStates();
     const con = AbilityEngine.calculateScore(
       state.baseScores.CON,
       "CON",
       modifiers,
       activeStates,
     );

     return DerivedStatEngine.calculateMaxHp(
       state.baseHpRolled,
       con.modifier,
       { total: state.level, classes: state.classLevels },
       modifiers,
       activeStates,
     ).total;
   },
   ```
5. In `applyHealthDelta` and `syncRemoteHealthDelta`, replace `clampHealth(previousHp, delta, state.maxHp)` with `clampHealth(previousHp, delta, state.getMaxHp())`.
6. In the rest action, replace `const updatedHp = restType === "long" ? state.maxHp : state.currentHp;` with `const updatedHp = restType === "long" ? state.getMaxHp() : state.currentHp;`.

- [ ] **Step 4: Implement hydration and the three components**

In `apps/web/src/pages/characterSheetRouteData.ts`, replace `maxHp: character.maxHp,` with:

```ts
    // the column holds base rolled hit points; the maximum is derived (#78)
    baseHpRolled: character.maxHp,
```

In `apps/web/src/components/sheet/DashboardLayout.tsx`, change the vitals line to:

```tsx
              {character.currentHp}/{character.getMaxHp()}
```

In `apps/web/src/components/sheet/modals/RestModal.tsx`, change
`const maxHp = useCharacterSheetStore((state) => state.maxHp);` to
`const maxHp = useCharacterSheetStore((state) => state.getMaxHp());` — the rest of that file is unchanged.

In `apps/web/src/components/sheet/TraitWidget.tsx`, delete the `storedMaxHp` subscription and change its debug line to:

```tsx
                HP: {currentHp} / {maxHp.total}
```

- [ ] **Step 5: Run the tests, the suite, typecheck and lint**

Run: `pnpm --filter @project/web test characterSheetStore characterSheetRouteData DashboardLayout TraitWidget RestModal` — PASS.
Run: `pnpm test:all` — green. `pnpm --filter @project/web typecheck` — clean. `pnpm --filter @project/web lint` — only the two long-standing warnings (#65).

- [ ] **Step 6: Restore CRLF and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' apps/web/src/pages/characterSheetRouteData.ts apps/web/src/store/characterSheetStore.ts apps/web/src/components/sheet/DashboardLayout.tsx apps/web/src/components/sheet/modals/RestModal.tsx apps/web/src/components/sheet/TraitWidget.tsx apps/web/src/store/__tests__/characterSheetStore.test.ts apps/web/src/pages/__tests__/characterSheetRouteData.test.ts apps/web/src/components/sheet/__tests__/DashboardLayout.test.tsx
pnpm check:hygiene
git add apps/web/src/pages/characterSheetRouteData.ts apps/web/src/store/characterSheetStore.ts apps/web/src/components/sheet/DashboardLayout.tsx apps/web/src/components/sheet/modals/RestModal.tsx apps/web/src/components/sheet/TraitWidget.tsx apps/web/src/store/__tests__/characterSheetStore.test.ts apps/web/src/pages/__tests__/characterSheetRouteData.test.ts apps/web/src/components/sheet/__tests__/DashboardLayout.test.tsx
git commit -F - <<'EOF'
fix(web): the sheet shows the derived maximum hit points (#78)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 5: The samples store base rolled hit points

**Files:**
- Modify: `packages/database/src/seedSampleCharacters.ts` (each roster entry's `maxHp`, and the field's comment)
- Test: `apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts` (create)

**Interfaces:**
- Consumes: `finalMaxHp` (Task 1), `toCharacterSave` — both from `apps/server/src/services/characterSave.js`; `ROSTER` from `@project/database/src/seedSampleCharacters.js`, as `sampleCharacterChoices.test.ts` imports it.

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts`:

```ts
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { assembleCoreRulePack } from "@project/database/pack";
import { ROSTER } from "@project/database/src/seedSampleCharacters.js";
import { emptyCharacterChoices, toRuleSnapshot, type CoreRulePackSnapshot } from "@project/shared";
import { finalMaxHp, toCharacterSave } from "../characterSave.js";

const PACK_DIR = path.join(
  process.cwd(),
  "../../packages/database/data/packs/core_2014_pack",
);

/**
 * What each sample's sheet shows. Their stored maxHp is base rolled hit
 * points now (#78), so these are what the engine must derive from it: the
 * numbers they showed before the change, except Nyx Vale, whose Draconic
 * Resilience never reached a sheet.
 */
const EXPECTED_MAX_HP: Record<string, number> = {
  "Pip Underbough": 10,
  "Sister Aveline Cor": 24,
  "Grimnar Stonefist": 55,
  "Lyra Silverstring": 45,
  "Vaerix the Ashen": 85,
  "Nyx Vale": 78,
  "Master Ko Shen": 99,
  "Thistle Quickfoot": 86,
  "Kaelen Duskwarden": 152,
  "Dame Sable Orrin": 224,
};

describe("sample character hit points", () => {
  let snapshot: CoreRulePackSnapshot;

  beforeAll(async () => {
    snapshot = toRuleSnapshot(await assembleCoreRulePack(PACK_DIR));
  });

  it.each(ROSTER.map((character) => [character.name, character] as const))(
    "%s derives the maximum their sheet shows",
    (name, character) => {
      const save = toCharacterSave(
        {
          ...character,
          subraceId: character.subraceId ?? null,
          backgroundId: character.backgroundId ?? null,
        },
        character.classes.map((entry) => ({
          classId: entry.classId,
          classLevel: entry.classLevel,
          subclassId: entry.subclassId ?? null,
        })),
        character.choices ?? emptyCharacterChoices(),
      );

      expect(finalMaxHp(save, snapshot)).toBe(EXPECTED_MAX_HP[name]);
    },
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `DATABASE_URL= pnpm --filter @project/server test sampleCharacterHitPoints`
Expected: FAIL — every sample derives its stored final plus Constitution again (Sister Aveline 30, not 24), because the seeder still stores finals.

- [ ] **Step 3: Implement**

In `packages/database/src/seedSampleCharacters.ts`, set each roster entry's `maxHp` to its base rolled hit points (each was computed with the engine as `stored final - max(1, final CON modifier) x total level`):

| Character | `maxHp` becomes |
| --- | --- |
| Pip Underbough | 8 |
| Sister Aveline Cor | 18 |
| Grimnar Stonefist | 40 |
| Lyra Silverstring | 38 |
| Vaerix the Ashen | 58 |
| Nyx Vale | 55 |
| Master Ko Shen | 63 |
| Thistle Quickfoot | 58 |
| Kaelen Duskwarden | 101 |
| Dame Sable Orrin | 124 |

Leave every `currentHp` exactly as it is — they are current hit points, not maxima, and the samples' "full health" cases (Pip 10/10, Vaerix 45/45, Master Ko Shen 99/99, Dame Sable 224/224) still read as full against the derived maximum.

Change the `maxHp` field's comment in the `SampleCharacter` interface to:

```ts
  /**
   * Base rolled hit points: the hit dice this character has taken, and
   * nothing else. Constitution and any MAX_HP trait are added by the engine
   * when a sheet or a clamp asks for the maximum (#78).
   */
  maxHp: number;
```

- [ ] **Step 4: Run the test, the suite and the typechecks**

Run: `DATABASE_URL= pnpm --filter @project/server test sampleCharacterHitPoints sampleCharacterChoices` — PASS.
Run: `pnpm test:all` — green. Typecheck database and server — clean.

- [ ] **Step 5: Restore CRLF and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' packages/database/src/seedSampleCharacters.ts apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts
pnpm check:hygiene
git add packages/database/src/seedSampleCharacters.ts apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts
git commit -F - <<'EOF'
fix(database): samples store base rolled hit points (#78)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Verification gates

**Files:** none (verification only).

- [ ] **Step 1: Run every gate**

```bash
pnpm test:all
pnpm --filter @project/shared typecheck
pnpm --filter @project/engine typecheck
pnpm --filter @project/database typecheck
pnpm --filter @project/server typecheck
pnpm --filter @project/web typecheck
pnpm lint
DATABASE_URL= pnpm --filter @project/server test
```

Expected: all green; lint shows only the two long-standing warnings (#65). Baseline on `main` (9032441): shared 230, engine 1014, database 199, server 444, web 434 = 2321. This plan adds roughly: engine +1, server +3 (characterSave) +1 (hitPoints) +1 (combatService) +10 (samples, one per character) +1 or +2 (level-up/creation), web +1 (store) — about 2339. A package whose count moves by something very different: find out why.

- [ ] **Step 2:** `git status` is clean; `git log --oneline main..HEAD` shows the spec, the spec correction, this plan and Tasks 1–5's five commits.

---

### Task 7: Hand check and backlog (controller, with the owner's permission)

**Files:**
- Modify: `docs/TODO_BACKLOG.md`

- [ ] **Step 1: Ask the owner before touching the database.** Then re-seed the samples (`pnpm --filter @project/database db:seed:samples`) and start the dev servers (`preview_start` `server`, then `web`).

- [ ] **Step 2: Hand check.**
  1. Nyx Vale's sheet shows 78 as her maximum (the Draconic Resilience point she was owed), and Sister Aveline's shows 24.
  2. Sister Aveline levels cleric 3 → 4 through the wizard, taking a feat with a roll of 5: the review step's promise and the sheet afterwards agree (24 → 31 for the average, or roll + 2 for whatever is rolled), rather than dropping the Constitution modifier.
  3. A cleric created through the creation wizard opens its sheet with hit points rather than blank.
  4. Sister Aveline takes damage and then a long rest: her current hit points return to the derived maximum, not to the stored base.
  Record what was seen, then re-seed the samples again.

- [ ] **Step 3: Update `docs/TODO_BACKLOG.md`** (CRLF; restore endings afterwards):
  - In the 11g table, row 78 becomes: `| 78 | ✅ Hit points: creation writes none, level-up skips the Constitution modifier, and the engine's derived maximum is never shown | Found by `fix/levelup-correctness`'s hand check, 2026-09-21; widened 2026-09-22; closed 2026-09-22 on `fix/hit-points`. See below. |`
  - Append to the `#78` bullet a **Closed 2026-09-22** paragraph: `characters.max_hp` now stores base rolled hit points alone; `finalMaxHp` (`apps/server/src/services/characterSave.ts`) is the one derivation, `deriveMaxHp` (`apps/server/src/services/hitPoints.ts`) is where the server loads a character to run it, creation writes the class hit die plus a derived full current HP, a level-up moves current hit points by the derived difference (roll, Constitution, an increase taken at that level, and any `MAX_HP` trait), and the web hydrates `baseHpRolled` and reads one `getMaxHp()` getter. A character stored before this branch reads high by roughly CON × level until re-seeded (dev data only); `COALESCE` repairs a null column on its next level-up. Then the hand check's observations.
  - Remove the Tier 1 row 5e for #78 (it is closed), leaving the rest of that table as it is.
  - In section 11h, add rows and bullets for two new items, updating the heading to include them:
    - **#86 — `calculateMaxHp` floors Constitution at 1 per level, not the level's whole gain.** 5e grants at least 1 hit point per level counting the roll and the modifier together; the engine floors the Constitution contribution alone (`Math.max(1, conModifier) * levels.total`), so a character with a negative Constitution modifier gets more hit points than the rules give. Getting it exact needs per-level rolls the save does not store. Recorded while closing #78.
    - **#87 — Draconic Resilience's `MAX_HP` modifier does not scale, and the engine says nothing.** The pack authors it `scalingFactor: "class_level"` with no `scalingClassId`, and `DerivedStatEngine.resolveScaledValue` falls through to the flat value, so a Draconic Bloodline sorcerer gains 1 hit point instead of 1 per sorcerer level (Nyx Vale: 78, where the rules give 80). Two fixes: author the `scalingClassId`, and make a `class_level` modifier without one loud rather than silent (a pack-validation rule, or a warning). Recorded while closing #78.

- [ ] **Step 4: Restore CRLF, check and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' docs/TODO_BACKLOG.md
pnpm check:hygiene
git add docs/TODO_BACKLOG.md
git commit -F - <<'EOF'
docs: close #78 (hit points); record #86 and #87

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

After the merge, update the backlog's header status paragraph and the baseline test counts on `main`, as for earlier branches.
