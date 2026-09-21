# Level-up Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A feat picked at level-up takes effect on both sheets (#75), and multiclass prerequisites and dice-rule floors use a character's final ability scores rather than its stored pre-racial ones (#77).

**Architecture:** Feats join `characters.choices` and the engine's save, and the bootstrapper grants their traits exactly as it does a background's. One server helper, `finalAbilityScores`, computes scores with the same engine gather the sheet uses; both prerequisite checks call it. The web's `useCheckRoll` reads final scores and sheet states from `useAbilities`.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`), Zod, Vitest, Express, Drizzle, React + Zustand. pnpm + turbo monorepo.

**Spec:** `docs/superpowers/specs/2026-09-21-levelup-correctness-design.md`

## Global Constraints

- Branch: `fix/levelup-correctness`. Commit after every task with a message file written OUTSIDE the repository and `git commit -F <file>`; every message ends with a blank line then exactly `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` — never another model name. Leave no stray files in the repository.
- **Line endings.** git normalises endings in this checkout (core.autocrlf=true), so `git show`/`git diff` never reveal a working-tree ending. Measure with `file <path>` or by counting `\r\n` with node before and after every edit, keep each file's ending, and restore with node (CRLF: `split(/\r?\n/).join('\r\n')`; LF: `split(/\r\n/).join('\n')`). Each dispatch states the measured endings. New files are CRLF.
- Typecheck is a separate gate: per package `pnpm --filter <pkg> exec tsc --noEmit`, web `pnpm --filter @project/web exec tsc -b`; never through turbo's cache.
- `exactOptionalPropertyTypes` is on: use conditional spreads, never assign `undefined` to an optional property.
- CI has no `DATABASE_URL`: nothing a test imports may require it at module load. Reproduce with `DATABASE_URL= pnpm --filter <pkg> test`.
- Error messages, verbatim: `Invalid character choices: unknown feat <featId>` and `Invalid character choices: <featId> already taken`.
- Implementers never run migrations, seeders or pack imports against a database.
- Touch only the files a task lists. A failure in any other file: stop and report NEEDS_CONTEXT.

## File Map

| File | Change | Task |
| --- | --- | --- |
| `packages/shared/src/schemas/runtime/characterSave.ts` | `choices.feats`, `save.feats` | 1 |
| `packages/shared/src/schemas/runtime/ruleSnapshot.ts` | `featsById` | 1 |
| `packages/shared/src/schemas/__tests__/characterChoices.test.ts`, `toRuleSnapshot.test.ts` | Tests | 1 |
| `apps/server/src/services/packRulebook.ts` | `EMPTY.featsById` | 1 |
| `packages/engine/src/rules/ruleLookup.ts` | `featsById`, `resolveFeatDefinition` | 1 |
| `packages/engine/src/pipeline/characterBootstrapper.ts` | Feat traits granted | 1 |
| `packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts` | Tests | 1 |
| `apps/server/src/services/characterSave.ts` | Pass feats (2); `finalAbilityScores` (3) | 2, 3 |
| `apps/server/src/controllers/characterController.ts` | Feats into choices (2); final-score prerequisite (3) | 2, 3 |
| `apps/server/src/services/referenceProvider/databaseReferenceProvider.ts` | Dip preview on final scores | 3 |
| `apps/server/src/services/__tests__/characterSave.test.ts` | Tests | 2, 3 |
| `apps/server/src/routes/__tests__/character.choices.test.ts` | Level-up tests | 2, 3 |
| `apps/web/src/store/characterSheetStore.ts` | Pass feats | 2 |
| `apps/web/src/store/__tests__/characterSheetStore.test.ts` | Test | 2 |
| `apps/web/src/hooks/useCheckRoll.ts` | Final scores, sheet states | 4 |
| `apps/web/src/hooks/__tests__/useCheckRoll.test.ts` | Test | 4 |
| `docs/TODO_BACKLOG.md` | #75, #77 closed; #76 narrowed | 5 |

---

### Task 1: Feats in the choices, the save and the bootstrapper

**Files:** `packages/shared/src/schemas/runtime/characterSave.ts`, `packages/shared/src/schemas/runtime/ruleSnapshot.ts`, `packages/shared/src/schemas/__tests__/characterChoices.test.ts`, `packages/shared/src/schemas/__tests__/toRuleSnapshot.test.ts`, `apps/server/src/services/packRulebook.ts`, `packages/engine/src/rules/ruleLookup.ts`, `packages/engine/src/pipeline/characterBootstrapper.ts`, `packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts`

**Interfaces:**
- Produces: `CharacterChoices.feats: string[]` (default `[]`); `CharacterSave.feats: string[]` (default `[]`); `CoreRulePackSnapshot.featsById: Record<string, CoreRulePack["feats"][number]>`; `RuleSnapshotLookup.featsById?`; `resolveFeatDefinition(featId: string, snapshot?: RuleSnapshotLookup)` in `packages/engine/src/rules/ruleLookup.ts`.

- [ ] **Step 1: Failing tests**

`characterChoices.test.ts`: extend the "defaults both maps" expectation so `emptyCharacterChoices()` and `CharacterChoicesSchema.parse({})` equal `{ classSelections: {}, traitSelections: {}, feats: [] }`, and add:

```ts
  it("keeps the feats taken, in order", () => {
    expect(
      CharacterChoicesSchema.parse({ feats: ["feat_alert", "feat_tough"] }).feats,
    ).toEqual(["feat_alert", "feat_tough"]);
  });
```

`toRuleSnapshot.test.ts`, inside `describe("toRuleSnapshot")`:

```ts
  it("keys feats by their id", () => {
    const snapshot = toRuleSnapshot(
      pack({
        feats: [
          {
            id: "feat_alert",
            name: "Alert",
            grantedTraitIds: ["feat_alert"],
          },
        ],
      } as never),
    );

    expect(snapshot.featsById["feat_alert"]?.grantedTraitIds).toEqual([
      "feat_alert",
    ]);
  });
```

(Give the feat literal whatever other required fields `FeatDefinitionSchema` demands — read it once in `packages/shared/src/schemas/content/`.)

`characterBootstraper.test.ts`, inside `describe("CharacterBootstrapper.resolveGrantedTraitIds")`:

```ts
  it("includes the traits of every feat taken", () => {
    const ids = CharacterBootstrapper.resolveGrantedTraitIds(
      { ...fighter(), feats: ["feat_alert", "feat_mobile"] },
      corePackSnapshot(),
    );

    expect(ids).toEqual(
      expect.arrayContaining(["feat_alert", "trait_feat_mobile"]),
    );
  });

  it("grants nothing for a feat the pack does not define", () => {
    expect(
      CharacterBootstrapper.resolveGrantedTraitIds(
        { ...fighter(), feats: ["feat_not_real"] },
        corePackSnapshot(),
      ),
    ).toEqual(
      CharacterBootstrapper.resolveGrantedTraitIds(fighter(), corePackSnapshot()),
    );
  });
```

- [ ] **Step 2: Run to verify they fail** (shared: `feats` missing / `featsById` undefined; engine: feat traits absent).

- [ ] **Step 3: Implement**
- `characterSave.ts`: add `feats: z.array(z.string()).default([]),` to `CharacterChoicesSchema` (with a one-line comment: the feats taken, in order, #75), update `emptyCharacterChoices()` to return `feats: []`, and add `feats: z.array(z.string()).default([]),` to `CharacterSaveSchema` after `backgroundId`.
- `ruleSnapshot.ts`: add `featsById: Record<string, CoreRulePack["feats"][number]>;` to `CoreRulePackSnapshot` (comment: keyed so the bootstrapper can grant a save's feats, #75) and `featsById: byId(pack.feats),` to `toRuleSnapshot`. Update the interface's doc comment, which lists feats among the things the snapshot deliberately omits, so it no longer does.
- `packRulebook.ts`: `featsById: {},` in `EMPTY`.
- `ruleLookup.ts`: `featsById?: Record<string, FeatDefinition> | undefined;` on `RuleSnapshotLookup` (import the feat type the shared package exports), and

```ts
export const resolveFeatDefinition = (
  featId: string,
  snapshot?: RuleSnapshotLookup,
): FeatDefinition | undefined => snapshot?.featsById?.[featId];
```

- `characterBootstrapper.ts`: import `resolveFeatDefinition`; beside `backgroundTraitIds` add

```ts
/** The traits of every feat taken. An unknown feat grants nothing (#75). */
const featTraitIds = (
  featIds: string[],
  snapshot?: RuleSnapshotLookup,
): string[] =>
  featIds.flatMap(
    (featId) => resolveFeatDefinition(featId, snapshot)?.grantedTraitIds ?? [],
  );
```

and add `...featTraitIds(save.feats, snapshot),` to `resolveGrantedTraitIds` after the background.

- [ ] **Step 4: Run to verify they pass; `pnpm test:all`; typecheck all five packages.** Any other literal typed `CoreRulePackSnapshot` or building a full `CharacterSave`/`CharacterChoices` that now fails typecheck: add the new field with an empty value and list the file (this is expected fallout, not scope creep).

- [ ] **Step 5: Commit** — `feat: feats live in choices and grant their traits (#75)`

---

### Task 2: Level-up stores the feat in choices; both save builders pass feats

**Files:** `apps/server/src/services/characterSave.ts`, `apps/server/src/controllers/characterController.ts`, `apps/server/src/services/__tests__/characterSave.test.ts`, `apps/server/src/routes/__tests__/character.choices.test.ts`, `apps/web/src/store/characterSheetStore.ts`, `apps/web/src/store/__tests__/characterSheetStore.test.ts`

**Interfaces:** Consumes Task 1's `choices.feats`, `save.feats`, `featsById`.

- [ ] **Step 1: Failing tests**

`characterSave.test.ts` (server):

```ts
  it("carries the feats taken into the save", () => {
    const save = toCharacterSave(row(), fighterLedger, {
      classSelections: {},
      traitSelections: {},
      feats: ["feat_alert"],
    });

    expect(save.feats).toEqual(["feat_alert"]);
  });
```

`character.choices.test.ts`, in `describe("applyLevelUp choices")` (the `setupLevelUp` harness stores a fighter with choices; add `feats: []` to its stored choices if absent):

```ts
  it("stores a picked feat in choices and writes no trait row for it", async () => {
    const { applyLevelUp, tx } = await setupLevelUp();
    const { res, status } = response();

    await applyLevelUp(levelUp({ featId: "feat_alert" }), res);

    expect(status).toHaveBeenCalledWith(200);
    expect(tx.set).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: expect.objectContaining({ feats: ["feat_alert"] }),
      }),
    );
    const rows = tx.values.mock.calls.flatMap(([arg]) =>
      Array.isArray(arg) ? arg : [arg],
    );
    expect(rows).not.toContainEqual(
      expect.objectContaining({ source: "feat_selection" }),
    );
  });

  it("rejects a feat the pack does not define", async () => {
    const { applyLevelUp } = await setupLevelUp();
    const { res, status, json } = response();

    await applyLevelUp(levelUp({ featId: "feat_not_real" }), res);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Invalid character choices: unknown feat feat_not_real",
      }),
    );
  });

  it("rejects a feat the character already has", async () => {
    const { applyLevelUp } = await setupLevelUp({ storedFeats: ["feat_alert"] });
    const { res, status, json } = response();

    await applyLevelUp(levelUp({ featId: "feat_alert" }), res);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Invalid character choices: feat_alert already taken",
      }),
    );
  });
```

(Give `setupLevelUp` an optional `{ storedFeats }` parameter that sets the stored character's `choices.feats`. The harness mocks `levelUpValidation`, so these tests exercise only the controller's feat handling.)

`characterSheetStore.test.ts` (web), in `describe("getSheetModifiers")` (reuse `init`):

```ts
  it("applies a stored feat's traits", () => {
    init({
      classLevels: { class_fighter: 4 },
      raceId: "race_human",
      choices: { classSelections: {}, traitSelections: {}, feats: ["feat_alert"] },
    });

    expect(
      useCharacterSheetStore
        .getState()
        .getActiveTraits()
        .map((trait) => trait.id),
    ).toContain("feat_alert");
  });
```

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement**
- Server `toCharacterSave`: add `feats: choices.feats,` to the returned save.
- Web store `toCharacterSave`: add `feats: state.choices.feats,`.
- `applyLevelUp`: in the ASI/feat block, replace the whole `else if (payload.featId) { ... }` branch (the `featTraits` query, the `traits` fallback, the "no mapped trait grants" error and the `feat_selection` insert) with validation and a merge into the choices the controller already builds and writes:

```ts
      } else if (payload.featId) {
        // a feat is a choice like any other: it lives in choices.feats and the
        // bootstrapper grants its traits. It used to become feat_selection
        // rows that no save ever read, so it did nothing (#75)
        const feat = snapshot.featsById?.[payload.featId];
        if (!feat) {
          throw new Error(`Invalid character choices: unknown feat ${payload.featId}`);
        }
        if (!feat.repeatable && mergedChoices.feats.includes(payload.featId)) {
          throw new Error(`Invalid character choices: ${payload.featId} already taken`);
        }
        mergedChoices = {
          ...mergedChoices,
          feats: [...mergedChoices.feats, payload.featId],
        };
      }
```

  This needs the rule snapshot in that branch: load it with `getCachedRuleSnapshot()` when `payload.featId` is present (the controller already loads it for choice validation — reuse one load; make `mergedChoices` a `let` if it is a `const`). The feat validation must run before any write in the transaction — move the ASI/feat block's feat handling ahead of the class-ledger update if needed, keeping the ASI score update where it is. Remove the now-unused `featTraits`/`traits` imports.
- `mergedChoices` must carry `feats`: the stored choices come from `readStoredChoices`, which now defaults `feats` to `[]`.

- [ ] **Step 4: Run to verify they pass; `pnpm test:all` (and with `DATABASE_URL=` for the server and database packages); typecheck server and web.** The existing level-up tests in `character.test.ts` must still pass; if one asserted the old `feat_selection` rows, that assertion described the defect — report it, change it to assert the new behaviour, and list it.

- [ ] **Step 5: Commit** — `fix: a feat picked at level-up is stored in choices and takes effect (#75)`

---

### Task 3: Prerequisites use final scores

**Files:** `apps/server/src/services/characterSave.ts`, `apps/server/src/controllers/characterController.ts`, `apps/server/src/services/referenceProvider/databaseReferenceProvider.ts`, `apps/server/src/services/__tests__/characterSave.test.ts`, `apps/server/src/routes/__tests__/character.choices.test.ts`

**Interfaces:**
- Produces: `finalAbilityScores(save: CharacterSave, snapshot: RuleSnapshotLookup): { str: number; dex: number; con: number; int: number; wis: number; cha: number }` from `apps/server/src/services/characterSave.ts`.

- [ ] **Step 1: Failing tests**

`characterSave.test.ts`: import `assembleCoreRulePack` / `toRuleSnapshot` the way the server's other pack-driven tests do (`apps/server/src/services/__tests__/sampleCharacterScores.test.ts` shows the pattern), and add:

```ts
describe("finalAbilityScores", () => {
  it("adds racial bonuses to the stored, pre-racial scores", async () => {
    const snapshot = toRuleSnapshot(await assembleCoreRulePack(PACK_DIR));
    const save = toCharacterSave(
      row({ raceId: "race_human", subraceId: null, str: 12, dex: 9, con: 14, int: 10, wis: 16, cha: 11 }),
      [{ classId: "class_cleric", classLevel: 3, subclassId: null }],
    );

    expect(finalAbilityScores(save, snapshot)).toEqual({
      str: 13, dex: 10, con: 15, int: 11, wis: 17, cha: 12,
    });
  });
});
```

`character.choices.test.ts`, using the real-resolver harness (`setupLevelUpWithRealValidation`, the one the rogue-dip test uses — it runs the real `levelUpValidation`): a stored **human cleric 3** with stored STR 12 (final 13) dipping into `class_fighter` returns 200, where STR 13 is the fighter prerequisite. Give the harness whatever parameters it needs to store a human cleric with those scores, and assert the class insert for `class_fighter` happened. It must fail today (400: prerequisite not met).

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement**
- `characterSave.ts`:

```ts
/**
 * A character's actual ability scores: the stored, pre-racial scores plus
 * every trait modifier - racial bonuses, feats, class features - through the
 * same gather the sheet uses. Magic items are deliberately left out: callers
 * here do not load inventory, and whether an item counts toward a
 * prerequisite is a table ruling (#77).
 */
export const finalAbilityScores = (
  save: CharacterSave,
  snapshot: RuleSnapshotLookup,
) => {
  const modifiers = gatherSheetModifiers({
    activeTraits: CharacterBootstrapper.compileActiveTraits(save, snapshot),
    selections: CharacterBootstrapper.resolveSelections(save),
    inventory: [],
    effectManager: new EffectManager(),
    snapshot,
  });
  const score = (base: number, ability: Ability) =>
    AbilityEngine.calculateScore(base, ability, modifiers, []).score;

  return {
    str: score(save.attributes.str, "STR"),
    dex: score(save.attributes.dex, "DEX"),
    con: score(save.attributes.con, "CON"),
    int: score(save.attributes.int, "INT"),
    wis: score(save.attributes.wis, "WIS"),
    cha: score(save.attributes.cha, "CHA"),
  };
};
```

  (Import `AbilityEngine`, `CharacterBootstrapper`, `EffectManager`, `gatherSheetModifiers` and the `Ability` and `RuleSnapshotLookup` types from `@project/engine`.)
- `applyLevelUp`: pass `currentBaseScores: finalAbilityScores(toCharacterSave(character, existingClasses, storedChoices), snapshot)` to `validateMulticlassPrerequisites` — the character as it is *before* this level. Load the snapshot once for the whole handler if it is not already loaded before this point, and read the stored choices before the check (move `readStoredChoices` up if needed).
- `databaseReferenceProvider.ts`: replace `loadCharacterBaseScores` with `loadCharacterFinalScores`, which selects the character's `raceId`, `subraceId`, `backgroundId`, `choices`, the six scores and `currentHp`/`maxHp` (same campaign scoping), its class ledger ordered by `classLedgerOrder` (from `../classLedger.js`), builds the save with `toCharacterSave(row, ledger, readStoredChoices(row.choices, characterId))` and returns `finalAbilityScores(save, snapshot)` (snapshot from `getCachedRuleSnapshot()`), or `null` when there is no character. Use it where `loadCharacterBaseScores` was called; keep the returned shape the dip preview already consumes.

- [ ] **Step 4: Run to verify; `pnpm test:all` (and `DATABASE_URL=` for server); typecheck server.** If `apps/server/src/routes/__tests__/reference.test.ts` covers the dip preview and breaks because its mocks lack the new reads, extend those mocks with the same data and list the change; do not weaken assertions.

- [ ] **Step 5: Commit** — `fix(server): multiclass prerequisites use final ability scores (#77)`

---

### Task 4: `useCheckRoll` uses final scores and sheet states

**Files:** `apps/web/src/hooks/useCheckRoll.ts`, `apps/web/src/hooks/__tests__/useCheckRoll.test.ts`

- [ ] **Step 1: Failing test** — in `useCheckRoll.test.ts`, make the mocked sheet report different final scores from `baseScores` and a sheet state absent from the store's raw `activeStates` (mock `useAbilities` from `../useCharacterStats`, as other hook tests do), and assert `DiceEngine.applyDiceRulesToRollResult` (spy on it) receives the final scores as `abilityScores` (keyed as the dice engine expects — read how `baseScores` is shaped today and keep that shape) and the sheet state in `activeStates`.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement** — `useCheckRoll` calls `useAbilities()`; `abilityScores` becomes the final scores in the same shape `baseScores` had (`Object.fromEntries` over `finalAbilities`, mapping each to `.score`); `activeStates` comes from `useAbilities().activeStates`. Remove the now-unused `baseScores` and raw `activeStates` subscriptions.
- [ ] **Step 4: Run web tests; `tsc -b`; web lint (no new warnings).**
- [ ] **Step 5: Commit** — `fix(web): check rolls use final ability scores and the sheet's states (#77)`

---

### Task 5: Hand check, then the backlog

Steps 1–2 need the running app and the owner's database: the controller runs them.

- [ ] **Step 1: Hand check (owner's permission first)** — re-seed the samples; level Sister Aveline (`00000000-0000-0000-0000-000000000111`, cleric 3) to cleric 4 through the level-up wizard, taking Alert: her initiative rises by 5 and `characters.choices.feats` is `["feat_alert"]`. The wizard's class list offers a fighter dip for her (final STR 13). Re-seed afterwards to restore her.
- [ ] **Step 2: Record results.**
- [ ] **Step 3: Backlog** — `docs/TODO_BACKLOG.md` (CRLF): #75 and #77 ✅ closed 2026-09-21 on `fix/levelup-correctness` in their sections and Recommended-sequence rows, with the hand-check result; #76's `useCheckRoll` symptom marked fixed (the rest of #76 stays open); header test count and branch. `pnpm check:hygiene` passes.
- [ ] **Step 4: Commit** — `docs: close #75 and #77`
