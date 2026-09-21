# Sheet Modifiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The live web sheet derives every number from the same modifiers the server uses — trait modifiers with choices, equipment, and live effects — and the sample characters store pre-racial scores so nothing is double-counted (backlog #73).

**Architecture:** A new engine function `gatherSheetModifiers` is the single definition of "the modifiers a sheet applies"; `CharacterEngine.buildLiveSheet` and a new web store getter `getSheetModifiers` both call it, and `useAbilities` reads the getter. The seeder's sample scores drop their racial bonuses, held by a test that the computed final scores are unchanged.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`), Vitest, React + Zustand, Drizzle seeder. pnpm + turbo monorepo.

**Spec:** `docs/superpowers/specs/2026-09-21-sheet-modifiers-design.md`

## Global Constraints

- Branch: `fix/sheet-modifiers`. Commit after every task with `git commit -F <message-file>`; every message ends with a blank line then exactly `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` — never another model name.
- **Line endings.** git normalises endings in this checkout (core.autocrlf=true), so `git show`/`git diff` never reveal a working-tree ending. Measure with `file <path>` or by counting `\r\n` with node before and after every edit, keep each file's ending, and restore with node (CRLF: `split(/\r?\n/).join('\r\n')`; LF: `split(/\r\n/).join('\n')`). Each dispatch states the measured endings of the task's files. New files are CRLF.
- Typecheck is a separate gate: per package `pnpm --filter <pkg> exec tsc --noEmit`, web `pnpm --filter @project/web exec tsc -b`; never through turbo's cache.
- `exactOptionalPropertyTypes` is on: never assign `undefined` to an optional property; use a conditional spread.
- Modifier order returned by `gatherSheetModifiers`, verbatim: trait modifiers, then equipment modifiers, then live effect modifiers.
- Implementers never run migrations or seeders; the controller re-seeds with the owner's permission (Task 4).
- Touch only the files a task lists. A failure in any other file: stop and report NEEDS_CONTEXT.

## File Map

| File | Change | Task |
| --- | --- | --- |
| `packages/engine/src/pipeline/sheetModifiers.ts` | Create: `gatherSheetModifiers` | 1 |
| `packages/engine/src/pipeline/__tests__/sheetModifiers.test.ts` | Create | 1 |
| `packages/engine/src/pipeline/characterEngine.ts` | `buildLiveSheet` calls the gather | 1 |
| `packages/engine/src/index.ts` | Export the module | 1 |
| `apps/web/src/store/characterSheetStore.ts` | `getSheetModifiers` getter | 2 |
| `apps/web/src/store/__tests__/characterSheetStore.test.ts` | Getter tests | 2 |
| `apps/web/src/hooks/useCharacterStats.ts` | `useAbilities` reads the getter | 2 |
| `apps/web/src/hooks/__tests__/useCharacterStats.test.ts` | Mock supplies the getter | 2 |
| `packages/database/src/seedSampleCharacters.ts` | Pre-racial sample scores | 3 |
| `apps/server/src/services/__tests__/sampleCharacterScores.test.ts` | Create: final-scores invariant | 3 |
| `docs/TODO_BACKLOG.md` | #73 closed; feat-trait gap recorded | 4 |

---

### Task 1: One gather in the engine

**Files:**
- Create: `packages/engine/src/pipeline/sheetModifiers.ts`
- Create: `packages/engine/src/pipeline/__tests__/sheetModifiers.test.ts`
- Modify: `packages/engine/src/pipeline/characterEngine.ts` (`buildLiveSheet`)
- Modify: `packages/engine/src/index.ts`

**Interfaces:**
- Produces: `gatherSheetModifiers(input: SheetModifierInput): RuntimeModifier[]` and `interface SheetModifierInput { activeTraits: TraitDefinition[]; selections: Record<string, string[]>; inventory: InventoryInstance[]; effectManager: EffectManager; snapshot?: RuleSnapshotLookup }`, exported from `@project/engine`.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/pipeline/__tests__/sheetModifiers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CharacterSave, RuntimeModifier } from "@project/shared";
import { EffectManager } from "../../calculators/effects.js";
import { CharacterBootstrapper } from "../characterBootstrapper.js";
import { gatherSheetModifiers } from "../sheetModifiers.js";
import { corePackLookup } from "./corePackFixture.js";

const halfElfBard: CharacterSave = {
  attributes: { str: 9, dex: 15, con: 12, int: 12, wis: 10, cha: 16 },
  race: { baseRaceId: "race_half_elf", hasSubraces: false, subraceId: null },
  classes: [{ classId: "class_bard", level: 1, selections: {} }],
  traitSelections: { half_elf_asi_choice: ["DEX", "CON"] },
  hp: { current: 8, temporary: 0, baseRolledHp: 8, hitDiceSpent: {} },
};

const liveBlessing: RuntimeModifier = {
  id: "mod_live",
  target: "ARMOR_CLASS",
  type: "add",
  value: 1,
  scalingFactor: "none",
  requiredStates: [],
  forbiddenStates: [],
  sourceName: "Shield of Faith",
  sourceOrigin: "spell",
  isActive: true,
};

describe("gatherSheetModifiers", () => {
  const gather = (effectManager = new EffectManager()) =>
    gatherSheetModifiers({
      activeTraits: CharacterBootstrapper.compileActiveTraits(
        halfElfBard,
        corePackLookup(),
      ),
      selections: CharacterBootstrapper.resolveSelections(halfElfBard),
      inventory: [
        {
          id: "inv-shield",
          itemId: "item_armor_shield",
          quantity: 1,
          slot: "off_hand",
          isAttuned: false,
        },
      ],
      effectManager,
      snapshot: corePackLookup(),
    });

  it("includes a trait's fixed and chosen ability modifiers", () => {
    const abilityAdds = gather()
      .filter(
        (modifier) =>
          modifier.type === "add" &&
          ["STR", "DEX", "CON", "INT", "WIS", "CHA"].includes(modifier.target),
      )
      .map((modifier) => `${modifier.target}+${modifier.value}`)
      .sort();

    expect(abilityAdds).toEqual(["CHA+2", "CON+1", "DEX+1"]);
  });

  it("includes an equipped item's modifiers", () => {
    expect(
      gather().some(
        (modifier) =>
          modifier.target === "ARMOR_CLASS" && modifier.sourceOrigin === "item",
      ),
    ).toBe(true);
  });

  it("includes live effect modifiers, after traits and equipment", () => {
    const effectManager = new EffectManager();
    effectManager.addEffect({
      instanceId: "effect_1",
      sourceName: "Shield of Faith",
      durationType: "manual",
      durationRemaining: undefined,
      isSelfConcentration: false,
      modifiers: [liveBlessing],
      grantedStates: [],
    });

    const modifiers = gather(effectManager);

    expect(modifiers.at(-1)).toEqual(
      expect.objectContaining({ id: "mod_live", instanceId: "effect_1" }),
    );
  });
});
```

If `ActiveEffect` requires fields this literal lacks, or `InventoryInstance` requires more than these five, add them with neutral values and say so in the report; do not change the assertions. If the shield's modifier does not carry `sourceOrigin: "item"`, assert on the field `InventoryExtractor` actually stamps for items (read `packages/engine/src/pipeline/inventoryExtractor.ts` once) and report it.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @project/engine exec vitest run src/pipeline/__tests__/sheetModifiers.test.ts`
Expected: FAIL — cannot resolve `../sheetModifiers.js`.

- [ ] **Step 3: Implement the gather**

Create `packages/engine/src/pipeline/sheetModifiers.ts`:

```ts
import type {
  InventoryInstance,
  RuntimeModifier,
  TraitDefinition,
} from "@project/shared";
import type { EffectManager } from "../calculators/effects.js";
import type { RuleSnapshotLookup } from "../rules/ruleLookup.js";
import { InventoryExtractor } from "./inventoryExtractor.js";
import { ModifierExtractor } from "./modifierExtractor.js";

export interface SheetModifierInput {
  /** The character's compiled traits (CharacterBootstrapper.compileActiveTraits). */
  activeTraits: TraitDefinition[];
  /** The save's picks, keyed by question (CharacterBootstrapper.resolveSelections). */
  selections: Record<string, string[]>;
  inventory: InventoryInstance[];
  /** Live effects: spells, conditions, anything applied at the table. */
  effectManager: EffectManager;
  snapshot?: RuleSnapshotLookup;
}

/**
 * Every modifier a character sheet applies: its traits' (with the choices
 * made in their choice blocks), its equipment's, and its live effects'.
 *
 * The one definition the server's buildLiveSheet and the web sheet share.
 * The web sheet used to apply only equipment, so racial ability bonuses,
 * fighting styles and live effects never reached it (#73).
 */
export const gatherSheetModifiers = ({
  activeTraits,
  selections,
  inventory,
  effectManager,
  snapshot,
}: SheetModifierInput): RuntimeModifier[] => [
  ...ModifierExtractor.extractModifiers(activeTraits, selections),
  ...InventoryExtractor.extractModifiers(inventory, snapshot),
  ...effectManager.getActiveModifiers(),
];
```

(Adjust import paths/type names to what the engine actually exports if they differ — e.g. `TraitDefinition` may come from `@project/shared` or a local type module; follow `modifierExtractor.ts`'s own imports.)

Add `export * from "./pipeline/sheetModifiers.js";` to `packages/engine/src/index.ts`, beside the other `./pipeline/` exports.

- [ ] **Step 4: `buildLiveSheet` uses it**

In `characterEngine.ts`'s `buildLiveSheet`: import `gatherSheetModifiers` from `./sheetModifiers.js`. Delete the `staticModifiers` declaration (`ModifierExtractor.extractModifiers(activeTraits, selections)`), the `inventoryModifiers` declaration, the `liveModifiers` declaration and the `allModifiers` array literal, and — at the point where `staticModifiers` was declared (after `selections` and `proficiencies` exist) — declare:

```ts
    const allModifiers = gatherSheetModifiers({
      activeTraits,
      selections,
      inventory,
      effectManager,
      ...(options.snapshot !== undefined && { snapshot: options.snapshot }),
    });
```

Every later use of `allModifiers` is unchanged. Remove any import left unused (`ModifierExtractor` or `InventoryExtractor` stay if still used elsewhere in the file).

- [ ] **Step 5: Run the tests; engine suite; typecheck**

Run the focused test — PASS. Run `pnpm --filter @project/engine test` — PASS, including every `characterEngine` test unchanged. `pnpm --filter @project/engine exec tsc --noEmit` — clean.

- [ ] **Step 6: Restore endings, commit**

Message: `feat(engine): gatherSheetModifiers, one definition of a sheet's modifiers (#73)`

---

### Task 2: The web sheet applies the gathered modifiers

**Files:**
- Modify: `apps/web/src/store/characterSheetStore.ts`
- Modify: `apps/web/src/hooks/useCharacterStats.ts` (`useAbilities`)
- Test: `apps/web/src/store/__tests__/characterSheetStore.test.ts`
- Test: `apps/web/src/hooks/__tests__/useCharacterStats.test.ts`

**Interfaces:**
- Consumes: `gatherSheetModifiers` (Task 1) from `@project/engine`.
- Produces: `CharacterSheetState.getSheetModifiers: () => RuntimeModifier[]` — `gatherSheetModifiers` over the store's compiled traits, selections, `inventory`, `runtimeEffects` and `ruleSnapshot`, followed by `activeModifiers`.

- [ ] **Step 1: Write the failing store tests**

In `characterSheetStore.test.ts`, import `AbilityEngine` and `DerivedStatEngine` from `@project/engine` (merge with an existing import), and add:

```ts
describe("getSheetModifiers", () => {
  const init = (overrides: Partial<CharacterSheetState> = {}) =>
    useCharacterSheetStore.getState().initialize({
      id: "char_mods",
      level: 1,
      classLevels: { class_bard: 1 },
      subclassIds: {},
      raceId: "race_half_elf",
      subraceId: null,
      backgroundId: null,
      choices: {
        classSelections: {},
        traitSelections: { half_elf_asi_choice: ["DEX", "CON"] },
      },
      inventory: [],
      resources: [],
      activeModifiers: [],
      activeStates: [],
      ruleSnapshot: packRuleSnapshot(),
      ...overrides,
    });

  it("applies a half-elf's fixed and chosen ability bonuses", () => {
    init();
    const modifiers = useCharacterSheetStore.getState().getSheetModifiers();
    const score = (base: number, stat: "STR" | "DEX" | "CON" | "CHA") =>
      AbilityEngine.calculateScore(base, stat, modifiers, []).score;

    expect(score(16, "CHA")).toBe(18);
    expect(score(15, "DEX")).toBe(16);
    expect(score(12, "CON")).toBe(13);
    expect(score(9, "STR")).toBe(9);
  });

  it("gives an unarmoured barbarian Unarmored Defense", () => {
    init({
      classLevels: { class_barbarian: 1 },
      raceId: "race_human",
      choices: { classSelections: {}, traitSelections: {} },
    });
    const modifiers = useCharacterSheetStore.getState().getSheetModifiers();

    const armorClass = DerivedStatEngine.calculateAC(
      { STR: 3, DEX: 2, CON: 3, INT: 0, WIS: 0, CHA: 0 },
      modifiers,
      [],
    );

    expect(armorClass.total).toBe(15); // 10 + DEX 2 + CON 3
  });

  it("keeps the dev widget's activeModifiers on top", () => {
    const devModifier = {
      id: "dev_mod",
      target: "STR",
      type: "add",
      value: 5,
      scalingFactor: "none",
      requiredStates: [],
      forbiddenStates: [],
      sourceName: "Dev",
      sourceOrigin: "trait",
      isActive: true,
    } as const;
    init({ activeModifiers: [devModifier] });

    expect(useCharacterSheetStore.getState().getSheetModifiers()).toContainEqual(
      devModifier,
    );
  });
});
```

(Use the `CharacterSheetState` type the file already imports, or import it. If `initialize`'s payload rejects a field above, drop only that field and say so.)

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @project/web exec vitest run src/store/__tests__/characterSheetStore.test.ts`
Expected: the three new tests FAIL (`getSheetModifiers is not a function`); all others pass.

- [ ] **Step 3: Add the getter**

In `characterSheetStore.ts`: add `gatherSheetModifiers` to the `@project/engine` import, add to the state interface beside `getActiveTraits`:

```ts
  /**
   * Every modifier the sheet applies - traits with their choices, equipment,
   * live effects - plus the dev TraitWidget's activeModifiers on top. The
   * same gather the server's buildLiveSheet uses (#73).
   */
  getSheetModifiers: () => RuntimeModifier[];
```

and implement it beside `getActiveTraits`:

```ts
    getSheetModifiers: () => {
      const state = get();
      const save = toCharacterSave(state);
      return [
        ...gatherSheetModifiers({
          activeTraits: CharacterBootstrapper.compileActiveTraits(
            save,
            state.ruleSnapshot ?? undefined,
          ),
          selections: CharacterBootstrapper.resolveSelections(save),
          inventory: state.inventory,
          effectManager: state.runtimeEffects ?? new EffectManager(),
          ...(state.ruleSnapshot ? { snapshot: state.ruleSnapshot } : {}),
        }),
        ...state.activeModifiers,
      ];
    },
```

(`RuntimeModifier`, `CharacterBootstrapper` and `EffectManager` are already imported by the store; add any that are not.)

- [ ] **Step 4: Run the store tests — PASS.**

- [ ] **Step 5: `useAbilities` reads the getter**

In `apps/web/src/hooks/useCharacterStats.ts`, rewrite `useAbilities` so `totalMods` comes from the getter and the memo recomputes when any of its inputs change:

```ts
export const useAbilities = () => {
  const baseScores = useCharacterSheetStore((state) => state.baseScores);
  const activeStates = useCharacterSheetStore((state) => state.activeStates);
  const getSheetModifiers = useCharacterSheetStore(
    (state) => state.getSheetModifiers,
  );
  // getSheetModifiers is a stable reference, so subscribe to everything it
  // reads - otherwise the memo below would never recompute (#73)
  const raceId = useCharacterSheetStore((state) => state.raceId);
  const subraceId = useCharacterSheetStore((state) => state.subraceId);
  const backgroundId = useCharacterSheetStore((state) => state.backgroundId);
  const classLevels = useCharacterSheetStore((state) => state.classLevels);
  const subclassIds = useCharacterSheetStore((state) => state.subclassIds);
  const choices = useCharacterSheetStore((state) => state.choices);
  const inventory = useCharacterSheetStore((state) => state.inventory);
  const activeModifiers = useCharacterSheetStore(
    (state) => state.activeModifiers,
  );
  const runtimeEffects = useCharacterSheetStore((state) => state.runtimeEffects);
  const ruleSnapshot = useCharacterSheetStore((state) => state.ruleSnapshot);

  return useMemo(() => {
    const totalMods = getSheetModifiers();

    const finalAbilities = {} as Record<
      Ability,
      { score: number; modifier: number }
    >;

    (Object.keys(baseScores) as Ability[]).forEach((stat) => {
      const derived = AbilityEngine.calculateScore(
        baseScores[stat],
        stat,
        totalMods,
        activeStates,
      );
      finalAbilities[stat] = {
        score: derived.score,
        modifier: derived.modifier,
      };
    });

    return { finalAbilities, totalMods };
  }, [
    baseScores,
    activeStates,
    getSheetModifiers,
    raceId,
    subraceId,
    backgroundId,
    classLevels,
    subclassIds,
    choices,
    inventory,
    activeModifiers,
    runtimeEffects,
    ruleSnapshot,
  ]);
};
```

Keep the existing doc comment, updated to say where the modifiers come from. Remove the `InventoryExtractor` import if nothing else in the file uses it. If `pnpm --filter @project/web lint` reports a hooks-rule problem with the dependency list, report it with the output rather than silencing it.

- [ ] **Step 6: Update the hook tests' store mock**

`useCharacterStats.test.ts` mocks the store with a `mockStoreState` and mocks `InventoryExtractor.extractModifiers`. `useAbilities` no longer extracts equipment itself; it calls `getSheetModifiers()`. Add `getSheetModifiers: () => unknown[]` (plus `raceId`, `subraceId`, `backgroundId`, `subclassIds`, `choices`, `runtimeEffects` with neutral values) to the mock's type and every place the mock state is built. Every existing test that sets `activeModifiers: [...]` to influence the scores must instead (or also) set `getSheetModifiers: () => [...]` with the same modifiers, so each assertion keeps testing what it tested. Remove the now-unused `InventoryExtractor` mock entry if nothing else relies on it. Do not delete or weaken any assertion.

- [ ] **Step 7: Run everything web; typecheck; lint**

Run: `pnpm --filter @project/web exec vitest run src/store src/hooks` — PASS. `pnpm --filter @project/web test` — PASS. `pnpm --filter @project/web exec tsc -b` — clean. `pnpm --filter @project/web lint` — no new warnings in the touched files.

- [ ] **Step 8: Restore endings, commit**

Message: `fix(web): the sheet applies trait, equipment and live-effect modifiers (#73)`

---

### Task 3: The samples store pre-racial scores

**Files:**
- Modify: `packages/database/src/seedSampleCharacters.ts` (each `ROSTER` entry's `str`..`cha`)
- Create: `apps/server/src/services/__tests__/sampleCharacterScores.test.ts`

**Interfaces:**
- Consumes: `gatherSheetModifiers` (Task 1); `toCharacterSave` from `apps/server/src/services/characterSave.ts`; `AbilityEngine`, `CharacterBootstrapper`, `EffectManager` from `@project/engine`; `ROSTER` from `@project/database/src/seedSampleCharacters.js`.

The intended final scores are exactly the samples' stored scores before this task. Racial bonuses (race + subrace fixed, plus Lyra's chosen `half_elf_asi_choice`) are subtracted to get the pre-racial scores; a score at the cap of 20 stays 20 on the sheet either way.

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/services/__tests__/sampleCharacterScores.test.ts`:

```ts
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { assembleCoreRulePack } from "@project/database/pack";
import { ROSTER } from "@project/database/src/seedSampleCharacters.js";
import {
  AbilityEngine,
  CharacterBootstrapper,
  EffectManager,
  gatherSheetModifiers,
} from "@project/engine";
import {
  emptyCharacterChoices,
  toRuleSnapshot,
  type CoreRulePackSnapshot,
} from "@project/shared";
import { toCharacterSave } from "../characterSave.js";

const PACK_DIR = path.join(
  process.cwd(),
  "../../packages/database/data/packs/core_2014_pack",
);

const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;

/**
 * What each sample looks like on the sheet: the scores it stored before the
 * samples moved to pre-racial storage (#73). The stored scores plus the
 * race's bonuses must land exactly here.
 */
const INTENDED_FINAL: Record<string, number[]> = {
  "Pip Underbough": [8, 17, 14, 12, 10, 13],
  "Sister Aveline Cor": [13, 10, 15, 11, 17, 12],
  "Grimnar Stonefist": [18, 14, 17, 8, 12, 10],
  "Lyra Silverstring": [9, 16, 13, 12, 10, 18],
  "Vaerix the Ashen": [18, 10, 16, 10, 12, 16],
  "Nyx Vale": [8, 14, 14, 13, 10, 19],
  "Master Ko Shen": [12, 20, 16, 10, 18, 8],
  "Thistle Quickfoot": [8, 14, 14, 20, 13, 10],
  "Kaelen Duskwarden": [14, 18, 16, 10, 18, 8],
  "Dame Sable Orrin": [20, 14, 20, 10, 12, 14],
};

describe("sample character scores", () => {
  let snapshot: CoreRulePackSnapshot;

  beforeAll(async () => {
    snapshot = toRuleSnapshot(await assembleCoreRulePack(PACK_DIR));
  });

  it("covers every sample", () => {
    expect(ROSTER.map((character) => character.name).sort()).toEqual(
      Object.keys(INTENDED_FINAL).sort(),
    );
  });

  it.each(ROSTER.map((character) => [character.name, character] as const))(
    "%s stores pre-racial scores that reach its intended final scores",
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
      // traits only: equipment (e.g. Grimnar's gauntlets) is not a racial bonus
      const modifiers = gatherSheetModifiers({
        activeTraits: CharacterBootstrapper.compileActiveTraits(save, snapshot),
        selections: CharacterBootstrapper.resolveSelections(save),
        inventory: [],
        effectManager: new EffectManager(),
        snapshot,
      });
      const stored = [
        character.str,
        character.dex,
        character.con,
        character.int,
        character.wis,
        character.cha,
      ];

      const final = ABILITIES.map(
        (ability, index) =>
          AbilityEngine.calculateScore(stored[index]!, ability, modifiers, [])
            .score,
      );

      expect(final).toEqual(INTENDED_FINAL[name]);
    },
  );
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @project/server exec vitest run src/services/__tests__/sampleCharacterScores.test.ts`
Expected: "covers every sample" passes; every sample whose race grants a bonus FAILS (its final exceeds the intended, e.g. Lyra's CHA 20 against 18) — Dame Sable may already pass because her raised scores sit at the cap of 20.

- [ ] **Step 3: Store pre-racial scores**

In `seedSampleCharacters.ts`, change each `ROSTER` entry's `str`, `dex`, `con`, `int`, `wis`, `cha` to these values (checked against the shipped pack's racial modifiers on 2026-09-21; each is the stored score minus that race's, subrace's and chosen bonus):

| id suffix | Name | str | dex | con | int | wis | cha |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 110 | Pip Underbough | 8 | 15 | 14 | 12 | 10 | 12 |
| 111 | Sister Aveline Cor | 12 | 9 | 14 | 10 | 16 | 11 |
| 112 | Grimnar Stonefist | 16 | 14 | 15 | 8 | 12 | 10 |
| 113 | Lyra Silverstring | 9 | 15 | 12 | 12 | 10 | 16 |
| 114 | Vaerix the Ashen | 16 | 10 | 16 | 10 | 12 | 15 |
| 115 | Nyx Vale | 8 | 14 | 14 | 12 | 10 | 17 |
| 116 | Master Ko Shen | 11 | 19 | 15 | 9 | 17 | 7 |
| 117 | Thistle Quickfoot | 8 | 14 | 13 | 18 | 13 | 10 |
| 118 | Kaelen Duskwarden | 14 | 16 | 16 | 10 | 17 | 8 |
| 119 | Dame Sable Orrin | 18 | 14 | 19 | 10 | 12 | 14 |

Change no other field. Add one comment above `ROSTER` (or where the file documents a sample's shape) saying scores are stored **pre-racial**, like character creation stores them, with racial bonuses applied by the sheet (#73). Do not run the seeder.

- [ ] **Step 4: Run to verify it passes; everything; typecheck**

Run the focused test — PASS for all ten. `pnpm test:all` — PASS (the sample-choices invariant too). Typecheck `@project/database` and `@project/server` — clean.

- [ ] **Step 5: Restore endings, commit**

Message: `fix(database): sample characters store pre-racial scores (#73)`

---

### Task 3b: The web sheet gates modifiers on the same base states as the server

Added 2026-09-21 after Task 4's first hand check: with trait modifiers now applied on the web, Sable's and Vaerix's Defense (+1 AC, `requiredStates: ["status_wearing_armor"]`) did not apply, because the web store's `baseStates` is always `[]` and its `activeStates` is only composed on events (actions, HP changes, condition toggles). The server's `buildLiveSheet` builds `baseStates` from trait states (`StateExtractor`), live effect states and equipment states (`InventoryExtractor.extractStates` — `status_wearing_armor`, `status_wearing_<category>_armor`). Without this task an armoured barbarian would wrongly get Unarmored Defense on the sheet (it forbids `status_wearing_armor`).

**Files:**
- Modify: `packages/engine/src/pipeline/sheetModifiers.ts` (add `gatherBaseStates`)
- Modify: `packages/engine/src/pipeline/__tests__/sheetModifiers.test.ts`
- Modify: `packages/engine/src/pipeline/characterEngine.ts` (`buildLiveSheet`'s `baseStates`)
- Modify: `apps/web/src/store/characterSheetStore.ts` (`getSheetStates` getter)
- Modify: `apps/web/src/hooks/useCharacterStats.ts` (`useAbilities` returns the sheet states; `useDerivedStats` and `useSpellcasting` use them)
- Modify: `apps/web/src/hooks/useCombat.ts` (uses them)
- Test: `apps/web/src/store/__tests__/characterSheetStore.test.ts`
- Test (mocks only): `apps/web/src/hooks/__tests__/useCharacterStats.test.ts`, and `apps/web/src/hooks/__tests__/useCombat.test.ts` if its mocks need the new return value

**Interfaces:**
- Produces: `gatherBaseStates(input: SheetStateInput): string[]` with `interface SheetStateInput { activeTraits: TraitDefinition[]; inventory: InventoryInstance[]; effectManager?: EffectManager; snapshot?: RuleSnapshotLookup }` — de-duplicated, in the order trait states, live effect states (only when `effectManager` is given), equipment states — exported from `@project/engine`.
- Produces: `CharacterSheetState.getSheetStates: () => string[]` — the store's `activeStates` plus `gatherBaseStates` over its compiled traits, `inventory` and `ruleSnapshot`, de-duplicated.
- Produces: `useAbilities()` returns `{ finalAbilities, totalMods, activeStates }`, where `activeStates` is `getSheetStates()`.

- [ ] **Step 1: Write the failing tests**

(a) Engine, in `sheetModifiers.test.ts` (import `gatherBaseStates` beside `gatherSheetModifiers`; reuse any literal-shape adjustments Task 1 made for `ActiveEffect`/`InventoryInstance`):

```ts
describe("gatherBaseStates", () => {
  const plate = {
    id: "inv-plate",
    itemId: "item_armor_plate",
    quantity: 1,
    slot: "body",
    isAttuned: false,
  };

  it("includes the states worn armour puts on the sheet", () => {
    const states = gatherBaseStates({
      activeTraits: [],
      inventory: [plate],
      snapshot: corePackLookup(),
    });

    expect(states).toEqual(
      expect.arrayContaining(["status_wearing_armor", "status_wearing_heavy_armor"]),
    );
  });

  it("includes live effect states only when an effect manager is given", () => {
    const effectManager = new EffectManager();
    effectManager.addEffect({
      instanceId: "effect_rage",
      sourceName: "Rage",
      durationType: "manual",
      durationRemaining: undefined,
      isSelfConcentration: false,
      modifiers: [],
      grantedStates: ["status_raging"],
    });

    expect(
      gatherBaseStates({ activeTraits: [], inventory: [], effectManager }),
    ).toContain("status_raging");
    expect(gatherBaseStates({ activeTraits: [], inventory: [] })).not.toContain(
      "status_raging",
    );
  });
});
```

(b) Web store, in `characterSheetStore.test.ts`, inside `describe("getSheetModifiers", ...)` (reuse its `init`):

```ts
  const plate = {
    id: "inv-plate",
    itemId: "item_armor_plate",
    quantity: 1,
    slot: "body",
    isAttuned: false,
  };
  const noAbilityMods = { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 };

  it("applies Defense to a fighter wearing armour", () => {
    init({
      classLevels: { class_fighter: 1 },
      raceId: "race_human",
      choices: {
        classSelections: {
          class_fighter: { fighter_level_1_fighting_style: ["trait_fs_defense"] },
        },
        traitSelections: {},
      },
      inventory: [plate],
    });
    const state = useCharacterSheetStore.getState();

    expect(state.getSheetStates()).toContain("status_wearing_armor");
    expect(
      DerivedStatEngine.calculateAC(
        noAbilityMods,
        state.getSheetModifiers(),
        state.getSheetStates(),
      ).total,
    ).toBe(19); // plate 18 + Defense 1
  });

  it("does not give a barbarian in armour Unarmored Defense", () => {
    init({
      classLevels: { class_barbarian: 1 },
      raceId: "race_human",
      choices: { classSelections: {}, traitSelections: {} },
      inventory: [plate],
    });
    const state = useCharacterSheetStore.getState();

    expect(
      DerivedStatEngine.calculateAC(
        { ...noAbilityMods, DEX: 2, CON: 3 },
        state.getSheetModifiers(),
        state.getSheetStates(),
      ).total,
    ).toBe(18); // plate, not 10 + DEX + CON
  });
```

(If the store's `inventory` type needs more fields than these five, add them with neutral values and report it.)

- [ ] **Step 2: Run to verify they fail** — engine: `gatherBaseStates` not exported; web: `getSheetStates is not a function`.

- [ ] **Step 3: Engine** — in `sheetModifiers.ts` add (importing `StateExtractor` from `./stateExtractor.js`):

```ts
export interface SheetStateInput {
  activeTraits: TraitDefinition[];
  inventory: InventoryInstance[];
  /** Given on the server, where live effects are part of the base states. */
  effectManager?: EffectManager;
  snapshot?: RuleSnapshotLookup;
}

/**
 * The states a character's sheet gates its modifiers on that hold regardless
 * of conditions: those its traits grant, those its live effects grant (when an
 * effect manager is given) and those its worn equipment puts on it, such as
 * status_wearing_armor. The web store composes effect states separately, so it
 * omits the manager; the server's buildLiveSheet passes it (#73).
 */
export const gatherBaseStates = ({
  activeTraits,
  inventory,
  effectManager,
  snapshot,
}: SheetStateInput): string[] =>
  Array.from(
    new Set([
      ...StateExtractor.extractStates(activeTraits),
      ...(effectManager?.getActiveStates() ?? []),
      ...InventoryExtractor.extractStates(inventory, snapshot),
    ]),
  );
```

In `buildLiveSheet`, replace the `baseStates` array literal with the following (same sources, same order — the server's behaviour is unchanged; remove `StateExtractor` from characterEngine's imports only if nothing else there uses it):

```ts
    const baseStates = gatherBaseStates({
      activeTraits,
      inventory,
      effectManager,
      ...(options.snapshot !== undefined && { snapshot: options.snapshot }),
    });
```

- [ ] **Step 4: Web store** — add `gatherBaseStates` to the engine import; add to the state interface beside `getSheetModifiers`:

```ts
  /**
   * The states the sheet's calculators gate on: whatever activeStates the
   * store has composed (conditions, effects, server replies) plus the states
   * the character's traits and worn equipment always put on it. activeStates
   * alone is only composed on events, so worn armour was invisible (#73).
   */
  getSheetStates: () => string[];
```

and implement it beside `getSheetModifiers`:

```ts
    getSheetStates: () => {
      const state = get();
      return Array.from(
        new Set([
          ...state.activeStates,
          ...gatherBaseStates({
            activeTraits: CharacterBootstrapper.compileActiveTraits(
              toCharacterSave(state),
              state.ruleSnapshot ?? undefined,
            ),
            inventory: state.inventory,
            ...(state.ruleSnapshot ? { snapshot: state.ruleSnapshot } : {}),
          }),
        ]),
      );
    },
```

- [ ] **Step 5: Hooks** — in `useAbilities`, select `getSheetStates` from the store, compute `const activeStates = getSheetStates();` inside the memo (it already subscribes to `activeStates` and every trait/inventory input; add `getSheetStates` to the dependency list), use it for `calculateScore`, and return `{ finalAbilities, totalMods, activeStates }`. In `useDerivedStats`, `useSpellcasting` (in `useCharacterStats.ts`) and `useCombat` (`apps/web/src/hooks/useCombat.ts`), take `activeStates` from `useAbilities()`'s return instead of their own `useCharacterSheetStore((state) => state.activeStates)` subscription, and keep passing it wherever they passed it before. Update the hook test mocks so `getSheetStates` (or `useAbilities`'s mocked return) supplies the states each test previously set through `activeStates`, keeping every assertion.

- [ ] **Step 6: Run everything** — `pnpm test:all` PASS; typecheck `@project/engine` (`tsc --noEmit`) and `@project/web` (`tsc -b`); `pnpm --filter @project/web lint` (report new warnings; do not silence).

- [ ] **Step 7: Commit** — `fix: the web sheet gates modifiers on worn equipment and trait states (#73)`

---

### Task 3c: Draconic Resilience applies only unarmoured

**Files:**
- Modify: `packages/database/data/packs/core_2014_pack/traits/ported.json` (`trait_draconic_resilience`)
- Test: `apps/web/src/store/__tests__/characterSheetStore.test.ts`

The pack authors Draconic Resilience's `ARMOR_CLASS` `set_base` 13 with empty `forbiddenStates`, so a draconic sorcerer wearing armour gets 13 + DEX instead of the armour's AC (Nyx: studded leather 12 + DEX 2 = 14, showed 15). The PHB applies it only when not wearing armour — the gate the barbarian's Unarmored Defense already carries.

- [ ] **Step 1: Failing test** — in the `getSheetModifiers` describe block (reuse `init`):

```ts
  it("does not give a draconic sorcerer in armour Draconic Resilience's AC", () => {
    init({
      classLevels: { class_sorcerer: 1 },
      subclassIds: { class_sorcerer: "subclass_sorcerer_draconic" },
      raceId: "race_human",
      choices: {
        classSelections: {
          class_sorcerer: {
            sorcerer_draconic_level_1_ancestor: ["trait_dragon_ancestor_red"],
          },
        },
        traitSelections: {},
      },
      inventory: [
        {
          id: "inv-leather",
          itemId: "item_armor_studded_leather",
          quantity: 1,
          slot: "body",
          isAttuned: false,
        },
      ],
    });
    const state = useCharacterSheetStore.getState();

    expect(
      DerivedStatEngine.calculateAC(
        { STR: 0, DEX: 2, CON: 0, INT: 0, WIS: 0, CHA: 0 },
        state.getSheetModifiers(),
        state.getSheetStates(),
      ).total,
    ).toBe(14); // studded leather 12 + DEX 2, not 13 + DEX 2
  });
```

- [ ] **Step 2: Run to verify it fails** (15, not 14).
- [ ] **Step 3: Fix the pack** — in `ported.json`, on `trait_draconic_resilience`'s `ARMOR_CLASS` modifier only (not its `MAX_HP` one), set `"forbiddenStates": ["status_wearing_armor"]`. Keep the file's 4-space pretty JSON and its working-tree line ending; change nothing else. Run `pnpm --filter @project/database test` — the pack schema, marker and reachability guards must stay green.
- [ ] **Step 4: Run to verify it passes; `pnpm test:all`.**
- [ ] **Step 5: Commit** — `fix(pack): Draconic Resilience applies only when not wearing armour`

---

### Task 4: Hand check, then the backlog

Steps 1–3 need the running app and the owner's database: the controller runs them.

- [ ] **Step 1: Re-seed (owner's permission first)** — `pnpm --filter @project/database db:seed:samples`. No migration in this branch.
- [ ] **Step 2: Hand check against the spec's baseline table** — restart the `server` preview; for Lyra, Sable, Ko Shen, Grimnar, Nyx and Vaerix record scores, HP and AC. Expected: every score unchanged; Grimnar AC 15, Sable 23, Vaerix 20; Ko Shen 15; Nyx AC 14 (HP may show +3). The first run (before Tasks 3b and 3c) found Sable 22, Vaerix 19 and Nyx 15 - see those tasks.
- [ ] **Step 3: Record results for the backlog task.**
- [ ] **Step 4: Update the backlog** — `docs/TODO_BACKLOG.md` (CRLF): mark #73 ✅ closed 2026-09-21 on `fix/sheet-modifiers` in its section and Recommended-sequence row, recording `gatherSheetModifiers`, the hand-check before/after, and that the samples now store pre-racial scores (the server was double-counting them). Add a new numbered item (the next free id) for the feat-trait gap: feat-granted traits are stored as `feat_selection` `character_traits` rows, which never enter the web store's save or the server's (`resolveGrantedTraitIds` reads race, background and classes only), so no feat modifier reaches any sheet. Update the header's test count and branch. Restore CRLF; `pnpm check:hygiene` passes.
- [ ] **Step 5: Commit** — `docs: close #73, record the feat-trait gap`
