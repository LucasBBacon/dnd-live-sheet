# Spell Choices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spell picks become choice questions in both wizards, so a level-up with a spell choice (cleric 3 → 4) can be submitted and the pick is stored per node in `characters.choices` (backlog #79).

**Architecture:** One engine module, `spellChoices.ts`, owns a spell node's roster (`spellOptions`), the list of a character's spell choices (`spellChoiceEntries`) and what the character already knows (`spellsKnownElsewhere`). `listChoiceQuestions` asks spell questions from it, and save validation checks spell picks with it, so the picker and the server can never disagree. The server's existing required-answer and lock checks then cover spells with no new server code; the resolver's `spell_selection` decisions, the wizard's blocking spell step and the dead `addedSpells`/`replacedSpells` fields are removed.

**Tech Stack:** TypeScript, pnpm + turbo monorepo; Vitest; zod (`@project/shared`); `@project/engine`; Express (`apps/server`); React 19 + Zustand + Tailwind (`apps/web`).

**Spec:** `docs/superpowers/specs/2026-09-22-spell-choices-design.md`

## Global Constraints

- Line endings: the working tree is CRLF with `core.autocrlf=true`, and git normalises endings, so `git diff`/`git show` cannot reveal them. **Every file this plan touches is CRLF (measured 2026-09-22), and the two new files must be CRLF too.** Edit/Write emit LF. After editing, restore CRLF on every file you touched:
  ```bash
  node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' <file> <file> ...
  ```
  Do not use `sed -i` (Git Bash's rewrites a CRLF file to LF). `pnpm check:hygiene` fails on a file with mixed endings.
- CI has no `.env` and no `DATABASE_URL`: nothing a test imports may require it at load. Run server tests as `DATABASE_URL= pnpm --filter @project/server test`.
- Never run `db:migrate`, `db:seed*`, `db:import-pack` or anything else that writes to a database. The hand check (Task 9) is run by the controller with the owner's permission.
- Typecheck per package with `pnpm --filter @project/<pkg> typecheck` (`tsc --noEmit` in shared, engine, database and server; `tsc -b` in web). Never trust turbo's cached `pnpm typecheck`. Vitest does not typecheck, so a green suite is not a green typecheck.
- Web component tests use `createRoot` from `react-dom/client` + `act` from `react`; `@testing-library/react` is not installed.
- Rules come only from the pack: engine tests use `corePackLookup()` / `corePackSnapshot()` / `corePack()` (`packages/engine/src/pipeline/__tests__/corePackFixture.ts`); server tests use the real assembled pack, as `character.choices.test.ts` and `levelUp.questions.test.ts` do.
- Every pack spell is a stub whose `level` is a placeholder `0` (#31). A test that depends on "leveled spells offer nothing" builds a cantrips-only lookup, as shown in Tasks 3 and 4, so it keeps holding after #31a gives spells real levels.
- Error strings, verbatim: a missing answer is `<source name>: nothing selected for <id>` (surfaced at level-up as `Invalid character choices: <messages joined by "; ">`, at creation as the 400 `{ error: "Invalid character choices.", issues: [...] }`); the lock is `Invalid character choices: <id> already answered`.
- `pnpm test:all` (hygiene + all five packages) and every package's typecheck must be green at the end of every task. Do not pass turbo flags such as `--force` to `test:all` (they reach vitest).
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Do not push.
- Touch only the files a task lists. A failure in any other file: stop and report NEEDS_CONTEXT.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `packages/shared/src/schemas/runtime/ruleSnapshot.ts` | `CoreRulePackSnapshot.spellsById`, built by `toRuleSnapshot` | 1 |
| `apps/server/src/services/packRulebook.ts` | the empty rulebook gains `spellsById: {}` | 1 |
| `packages/engine/src/rules/ruleLookup.ts` | `RuleSnapshotLookup.spellsById`, `resolveSpellDefinition` | 1 |
| `packages/engine/src/pipeline/spellChoices.ts` (new) | a spell node's roster; a character's spell choices; spells known elsewhere | 2 |
| `packages/engine/src/pipeline/choiceQuestions.ts` | asks class spell nodes and trait spell blocks; labels spells | 3 |
| `packages/engine/src/pipeline/characterBootstrapper.ts` | validates spell picks; trait spell picks count as known | 4 |
| `apps/server/src/services/levelUpValidation.ts` | the resolver stops raising `spell_selection` decisions | 5 |
| `packages/engine/src/types/progression.ts`, `packages/shared/src/schemas/transport/levelUp.ts` | `spell_selection`, `addedSpells`, `replacedSpells` removed | 6 |
| `apps/web/src/utils/wizardValidation.ts`, `apps/web/src/components/wizard/WizardStepRouter.tsx`, `apps/web/src/store/levelUpStore.ts` | the level-up wizard's spell step removed | 6 |
| `apps/web/src/components/wizard/choices/ChoicePicker.tsx` | a name filter for long questions | 7 |
| `docs/TODO_BACKLOG.md` | #79 closed; #82, #83 recorded; #31a, #67, #81 notes | 9 |

---

### Task 1: The rule snapshot carries spells

**Files:**
- Modify: `packages/shared/src/schemas/runtime/ruleSnapshot.ts`
- Modify: `apps/server/src/services/packRulebook.ts:20-28`
- Modify: `packages/engine/src/rules/ruleLookup.ts`
- Test: `packages/shared/src/schemas/__tests__/toRuleSnapshot.test.ts`
- Test: `packages/engine/src/rules/__tests__/ruleLookup.test.ts`

**Interfaces:**
- Produces: `CoreRulePackSnapshot.spellsById: Record<string, CoreRulePack["spells"][number]>` (required); `RuleSnapshotLookup.spellsById?: Record<string, SpellDefinition> | undefined`; `resolveSpellDefinition(spellId: string, snapshot?: RuleSnapshotLookup): SpellDefinition | undefined` exported from `@project/engine`.

- [ ] **Step 1: Write the failing tests**

In `packages/shared/src/schemas/__tests__/toRuleSnapshot.test.ts`, add inside `describe("toRuleSnapshot", ...)`, after the `"keys feats by their id"` test:

```ts
  it("keys spells by their id", () => {
    const snapshot = toRuleSnapshot(
      pack({
        spells: [
          {
            id: "spell_thaumaturgy",
            name: "Thaumaturgy",
            level: 0,
            school: "transmutation",
            isRitual: false,
            action: {
              id: "action_spell_thaumaturgy",
              name: "Thaumaturgy",
              activation: "action",
              effect: { type: "no_effect" },
            },
          },
        ],
      } as never),
    );

    expect(snapshot.spellsById["spell_thaumaturgy"]?.name).toBe("Thaumaturgy");
  });
```

In `packages/engine/src/rules/__tests__/ruleLookup.test.ts`, add `resolveSpellDefinition` to the import from `"../ruleLookup.js"`, add `import type { SpellDefinition } from "@project/shared";` below it, and add inside `describe("ruleLookup", ...)`:

```ts
  it("resolves a spell from spellsById, and nothing without a snapshot", () => {
    const thaumaturgy = {
      id: "spell_thaumaturgy",
      name: "Thaumaturgy",
      level: 0,
      school: "transmutation",
      isRitual: false,
      action: {
        id: "action_spell_thaumaturgy",
        name: "Thaumaturgy",
        activation: "action",
        effect: { type: "no_effect" },
      },
    } as unknown as SpellDefinition;

    expect(
      resolveSpellDefinition("spell_thaumaturgy", {
        spellsById: { spell_thaumaturgy: thaumaturgy },
      })?.name,
    ).toBe("Thaumaturgy");
    expect(resolveSpellDefinition("spell_thaumaturgy")).toBeUndefined();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @project/shared test toRuleSnapshot` and `pnpm --filter @project/engine test ruleLookup`
Expected: the shared test FAILS (`snapshot.spellsById` is undefined → cannot read `spell_thaumaturgy`); the engine test FAILS (`resolveSpellDefinition is not a function`).

- [ ] **Step 3: Implement**

`packages/shared/src/schemas/runtime/ruleSnapshot.ts` — replace the interface's doc comment and add the field after `featsById`:

```ts
/**
 * The rulebook content a loaded pack contributes to the engine's lookups.
 *
 * Deliberately only what the engine resolves by id. Everything else in a pack
 * - proficiencies - reaches the runtime by other routes, and adding them here
 * before anything reads them would be the dead-data pattern this project
 * keeps having to unpick. Backgrounds joined once the bootstrapper began
 * resolving a save's backgroundId; feats joined the same way (#75); spells
 * joined once spell picks became choice questions (#79).
 */
```

```ts
  /**
   * Keyed so a spell choice can list the spells it offers and label them
   * (listChoiceQuestions, #79).
   */
  spellsById: Record<string, CoreRulePack["spells"][number]>;
```

and in `toRuleSnapshot`, after `featsById: byId(pack.feats),`:

```ts
  spellsById: byId(pack.spells),
```

`apps/server/src/services/packRulebook.ts` — in `EMPTY`, after `featsById: {},`:

```ts
  spellsById: {},
```

`packages/engine/src/rules/ruleLookup.ts` — add `SpellDefinition` to the `import type { ... } from "@project/shared"` list; in `RuleSnapshotLookup`, after `featsById`:

```ts
  spellsById?: Record<string, SpellDefinition> | undefined;
```

and at the end of the file:

```ts
/**
 * A spell, from the pack.
 * @param spellId The authored spell id
 * @param snapshot Pack content, when the caller has any loaded
 * @returns The spell definition, or undefined
 */
export const resolveSpellDefinition = (
  spellId: string,
  snapshot?: RuleSnapshotLookup,
): SpellDefinition | undefined => snapshot?.spellsById?.[spellId];
```

- [ ] **Step 4: Run the tests, the suites and the typechecks**

Run: `pnpm --filter @project/shared test toRuleSnapshot`, `pnpm --filter @project/engine test ruleLookup` — both PASS.
Run: `pnpm test:all` — green. Run `pnpm --filter @project/shared typecheck`, `pnpm --filter @project/engine typecheck`, `pnpm --filter @project/server typecheck`, `pnpm --filter @project/web typecheck` — all clean (the web's `FullRulesSnapshotResponse` is `Partial<CoreRulePackSnapshot>`, so it picks the field up with no change).

- [ ] **Step 5: Restore CRLF and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' packages/shared/src/schemas/runtime/ruleSnapshot.ts packages/shared/src/schemas/__tests__/toRuleSnapshot.test.ts apps/server/src/services/packRulebook.ts packages/engine/src/rules/ruleLookup.ts packages/engine/src/rules/__tests__/ruleLookup.test.ts
pnpm check:hygiene
git add packages/shared/src/schemas/runtime/ruleSnapshot.ts packages/shared/src/schemas/__tests__/toRuleSnapshot.test.ts apps/server/src/services/packRulebook.ts packages/engine/src/rules/ruleLookup.ts packages/engine/src/rules/__tests__/ruleLookup.test.ts
git commit -m "feat(shared): the rule snapshot carries spells (#79)" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Engine — a spell node's roster and a character's spell choices

**Files:**
- Create: `packages/engine/src/pipeline/spellChoices.ts`
- Modify: `packages/engine/src/pipeline/index.ts` (export it)
- Test: `packages/engine/src/pipeline/__tests__/spellChoices.test.ts` (create)

**Interfaces:**
- Consumes: `RuleSnapshotLookup.spellsById` (Task 1); `unlockedGrants`, `isSpellChoice` from `./grantSources.js`.
- Produces (from `@project/engine`):

```ts
export const spellOptions: (node: SpellChoiceNode, snapshot?: RuleSnapshotLookup) => SpellDefinition[];
export type SpellChoiceEntry =
  | { target: "class"; classId: string; node: SpellChoiceNode; selected: string[] }
  | { target: "trait"; trait: TraitDefinition; node: SpellChoiceNode; selected: string[] };
export const spellChoiceEntries: (save: CharacterSave, activeTraits: TraitDefinition[], snapshot?: RuleSnapshotLookup) => SpellChoiceEntry[];
export const spellsKnownElsewhere: (entries: SpellChoiceEntry[], activeTraits: TraitDefinition[], nodeId: string) => Set<string>;
```

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/pipeline/__tests__/spellChoices.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type {
  CharacterSave,
  SpellChoiceNode,
  SpellDefinition,
} from "@project/shared";
import { CharacterBootstrapper } from "../characterBootstrapper.js";
import {
  spellChoiceEntries,
  spellOptions,
  spellsKnownElsewhere,
} from "../spellChoices.js";
import { corePack, corePackLookup } from "./corePackFixture.js";

/** a real pack spell, re-levelled - the pack's own levels are all placeholder 0s */
const spell = (id: string, level: number): SpellDefinition => ({
  ...corePack().spells[0]!,
  id,
  name: id,
  level,
});

const node = (maxSpellLevel: number): SpellChoiceNode => ({
  type: "spell_choice",
  nodeId: "test_node",
  listSource: "wizard",
  maxSpellLevel,
  pickCount: 1,
});

const spellsById = Object.fromEntries(
  [
    spell("cantrip_a", 0),
    spell("first_a", 1),
    spell("second_a", 2),
    spell("third_a", 3),
    spell("cantrip_b", 0),
  ].map((entry) => [entry.id, entry]),
);

describe("spellOptions", () => {
  it("offers a cantrip node only level-0 spells, in pack order", () => {
    expect(spellOptions(node(0), { spellsById }).map((s) => s.id)).toEqual([
      "cantrip_a",
      "cantrip_b",
    ]);
  });

  it("offers any other node levels 1 through its cap, and no cantrips", () => {
    expect(spellOptions(node(2), { spellsById }).map((s) => s.id)).toEqual([
      "first_a",
      "second_a",
    ]);
  });

  it("offers nothing without spells to read", () => {
    expect(spellOptions(node(0))).toEqual([]);
  });
});

const attributes = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
const hp = { current: 1, temporary: 0, baseRolledHp: 1, hitDiceSpent: {} };

const save = (overrides: Partial<CharacterSave>): CharacterSave => ({
  attributes,
  race: { baseRaceId: "race_human", hasSubraces: false, subraceId: null },
  classes: [],
  traitSelections: {},
  feats: [],
  hp,
  ...overrides,
});

const snapshot = corePackLookup();

const spellsOf = (characterSave: CharacterSave) => {
  const activeTraits = CharacterBootstrapper.compileActiveTraits(
    characterSave,
    snapshot,
  );
  return {
    activeTraits,
    entries: spellChoiceEntries(characterSave, activeTraits, snapshot),
  };
};

describe("spellChoiceEntries", () => {
  it("lists a class's unlocked spell nodes, then a trait's spell block, each with its stored picks", () => {
    const highElfWizard = save({
      race: {
        baseRaceId: "race_elf",
        hasSubraces: true,
        subraceId: "subrace_elf_high",
      },
      classes: [
        {
          classId: "class_wizard",
          level: 1,
          selections: { wizard_level_1_cantrips: ["spell_dancing_lights"] },
        },
      ],
      traitSelections: { high_elf_cantrip: ["spell_minor_illusion"] },
    });

    const { entries } = spellsOf(highElfWizard);

    expect(
      entries.map((entry) => [entry.target, entry.node.nodeId, entry.selected]),
    ).toEqual([
      ["class", "wizard_level_1_cantrips", ["spell_dancing_lights"]],
      ["class", "wizard_level_1_spellbook", []],
      ["trait", "high_elf_cantrip", ["spell_minor_illusion"]],
    ]);
  });

  it("leaves out spell nodes above the class's level", () => {
    const { entries } = spellsOf(
      save({ classes: [{ classId: "class_cleric", level: 3, selections: {} }] }),
    );

    expect(entries.map((entry) => entry.node.nodeId)).toEqual([
      "cleric_level_1_cantrips",
    ]);
  });
});

describe("spellsKnownElsewhere", () => {
  it("counts every trait's fixed spells and every other choice's picks, but not the choice's own", () => {
    const tieflingWizard = save({
      race: { baseRaceId: "race_tiefling", hasSubraces: false, subraceId: null },
      classes: [
        {
          classId: "class_wizard",
          level: 1,
          selections: {
            wizard_level_1_cantrips: ["spell_dancing_lights"],
            wizard_level_1_spellbook: ["spell_bless"],
          },
        },
      ],
    });
    const { activeTraits, entries } = spellsOf(tieflingWizard);

    const known = spellsKnownElsewhere(
      entries,
      activeTraits,
      "wizard_level_1_cantrips",
    );

    // Infernal Legacy's three fixed spells, and the spellbook's pick
    expect([...known]).toEqual(
      expect.arrayContaining([
        "spell_thaumaturgy",
        "spell_hellish_rebuke",
        "spell_darkness",
        "spell_bless",
      ]),
    );
    expect(known.has("spell_dancing_lights")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @project/engine test spellChoices`
Expected: FAIL — `Failed to resolve import "../spellChoices.js"`.

- [ ] **Step 3: Implement**

Create `packages/engine/src/pipeline/spellChoices.ts`:

```ts
import type {
  CharacterSave,
  SpellChoiceNode,
  SpellDefinition,
  TraitDefinition,
} from "@project/shared";
import type { RuleSnapshotLookup } from "../rules/ruleLookup.js";
import { isSpellChoice, unlockedGrants } from "./grantSources.js";

/**
 * The spells a spell_choice node offers, in pack order: level-0 spells for a
 * cantrip node (maxSpellLevel 0), levels 1 through maxSpellLevel otherwise.
 *
 * Not filtered by listSource: the pack has no spell lists yet (#31a), and
 * this is the one place list membership goes when it does. Until #31a gives
 * spells real levels every pack spell is level 0, so a cantrip node offers
 * all of them and any other node offers none.
 * @param node The spell choice, from a class track or a trait's spells block
 * @param snapshot Pack content, when the caller has any loaded
 * @returns The spells a player may pick for this node
 */
export const spellOptions = (
  node: SpellChoiceNode,
  snapshot?: RuleSnapshotLookup,
): SpellDefinition[] => {
  const spells = Object.values(snapshot?.spellsById ?? {});
  return node.maxSpellLevel === 0
    ? spells.filter((spell) => spell.level === 0)
    : spells.filter(
        (spell) => spell.level >= 1 && spell.level <= node.maxSpellLevel,
      );
};

/**
 * One spell choice a character has, and where its answer is stored: a class
 * track's node answers into that class's selections, a trait's spells block
 * into traitSelections - both keyed by the node's nodeId.
 */
export type SpellChoiceEntry =
  | {
      target: "class";
      classId: string;
      node: SpellChoiceNode;
      selected: string[];
    }
  | {
      target: "trait";
      trait: TraitDefinition;
      node: SpellChoiceNode;
      selected: string[];
    };

/**
 * Every spell choice a character has: each class's unlocked spell_choice
 * nodes, in ledger order and then track order, followed by each active
 * trait's spells block.
 * @param save The character
 * @param activeTraits CharacterBootstrapper.compileActiveTraits(save, snapshot)
 * @param snapshot Pack content, when the caller has any loaded
 * @returns One entry per spell choice, with the picks stored for it
 */
export const spellChoiceEntries = (
  save: CharacterSave,
  activeTraits: TraitDefinition[],
  snapshot?: RuleSnapshotLookup,
): SpellChoiceEntry[] => [
  ...save.classes.flatMap((classState) =>
    unlockedGrants(classState, snapshot)
      .filter(isSpellChoice)
      .map(
        (node): SpellChoiceEntry => ({
          target: "class",
          classId: classState.classId,
          node,
          selected: classState.selections[node.nodeId] ?? [],
        }),
      ),
  ),
  ...activeTraits.flatMap((trait) =>
    (trait.spells?.choices ?? []).map(
      (node): SpellChoiceEntry => ({
        target: "trait",
        trait,
        node,
        selected: save.traitSelections[node.nodeId] ?? [],
      }),
    ),
  ),
];

/**
 * The spells a character already knows from anywhere but one spell choice:
 * every active trait's fixed spells, and every other spell choice's picks.
 * What a picker marks held, and what a pick on that choice buys nothing from.
 * @param entries spellChoiceEntries for the same character
 * @param activeTraits The active traits the entries were built from
 * @param nodeId The spell choice being answered; its own picks do not count
 * @returns The spell ids already known
 */
export const spellsKnownElsewhere = (
  entries: SpellChoiceEntry[],
  activeTraits: TraitDefinition[],
  nodeId: string,
): Set<string> => {
  const known = new Set<string>();
  for (const trait of activeTraits) {
    for (const spell of trait.spells?.fixed ?? []) known.add(spell.spellId);
  }
  for (const entry of entries) {
    if (entry.node.nodeId === nodeId) continue;
    for (const spellId of entry.selected) known.add(spellId);
  }
  return known;
};
```

In `packages/engine/src/pipeline/index.ts`, after `export * from "./choiceQuestions.js";`:

```ts
export * from "./spellChoices.js";
```

- [ ] **Step 4: Run the test, the suite and the typecheck**

Run: `pnpm --filter @project/engine test spellChoices` — PASS (6 tests).
Run: `pnpm test:all` — green. `pnpm --filter @project/engine typecheck` — clean.

- [ ] **Step 5: Restore CRLF and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' packages/engine/src/pipeline/spellChoices.ts packages/engine/src/pipeline/__tests__/spellChoices.test.ts packages/engine/src/pipeline/index.ts
pnpm check:hygiene
git add packages/engine/src/pipeline/spellChoices.ts packages/engine/src/pipeline/__tests__/spellChoices.test.ts packages/engine/src/pipeline/index.ts
git commit -m "feat(engine): a spell node's roster and a character's spell choices (#79)" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `listChoiceQuestions` asks spell questions

**Files:**
- Modify: `packages/engine/src/pipeline/choiceQuestions.ts`
- Test: `packages/engine/src/pipeline/__tests__/choiceQuestions.test.ts`
- Test: `apps/server/src/routes/__tests__/character.choices.test.ts` (a bard's cantrips answered; a cleric's cantrips required)
- Test: `apps/server/src/routes/__tests__/levelUp.questions.test.ts` (a cleric dip asks its cantrips)

**Interfaces:**
- Consumes: `spellOptions`, `spellChoiceEntries`, `spellsKnownElsewhere`, `SpellChoiceEntry` (Task 2); `resolveSpellDefinition` (Task 1).
- Produces: `listChoiceQuestions` returns, beside today's questions, one `ChoiceQuestion` per class spell node (`target: "class"`, `classId` set, `id` = nodeId) and per trait spell block (`target: "trait"`, no `classId`), each with `options` = `spellOptions(node)` labelled by spell name; an empty roster yields no question. Prompts: `"<source name>: choose <n> cantrip(s)"`, else `"<source name>: choose <n> spell(s) of level 1 to <max>"` (`"of level 1"` when the cap is 1); a trait block's prefix is the trait's name. `choiceOptionLabel` labels a spell id by the spell's name.

- [ ] **Step 1: Write the failing engine tests**

In `packages/engine/src/pipeline/__tests__/choiceQuestions.test.ts`:

Change the fixture import to `import { corePack, corePackLookup } from "./corePackFixture.js";`, add `import type { RuleSnapshotLookup } from "../../rules/ruleLookup.js";`, and below `const snapshot = corePackLookup();` add:

```ts
/**
 * The pack with only its level-0 spells. Every pack spell is a placeholder
 * level 0 until #31a, so today this is the whole pack; built explicitly so
 * the tests that need "no spell of level 1 or above" keep meaning that.
 */
const cantripsOnly: RuleSnapshotLookup = {
  ...snapshot,
  spellsById: Object.fromEntries(
    Object.entries(snapshot.spellsById ?? {}).filter(
      ([, spell]) => spell.level === 0,
    ),
  ),
};
```

Replace the whole `it("never returns a question for a spell_choice class node", ...)` test with:

```ts
  it("asks a cleric's level-1 cantrips as a class question listing every level-0 spell", () => {
    const characterSave = save({
      classes: [{ classId: "class_cleric", level: 1, selections: {} }],
    });

    const cantrips = listChoiceQuestions(characterSave, snapshot).find(
      (q) => q.id === "cleric_level_1_cantrips",
    )!;

    expect(cantrips.target).toBe("class");
    expect(cantrips.classId).toBe("class_cleric");
    expect(cantrips.source).toEqual({
      kind: "class",
      id: "class_cleric",
      name: "Cleric",
    });
    expect(cantrips.prompt).toBe("Cleric: choose 3 cantrip(s)");
    expect(cantrips.pickCount).toBe(3);
    expect(cantrips.options).toHaveLength(
      corePack().spells.filter((spell) => spell.level === 0).length,
    );
    expect(cantrips.options).toContainEqual({
      id: "spell_thaumaturgy",
      label: "Thaumaturgy",
    });
    expect(cantrips.selected).toEqual([]);
  });

  it("does not ask a spell node with nothing to offer", () => {
    const characterSave = save({
      classes: [{ classId: "class_wizard", level: 1, selections: {} }],
    });

    const ids = listChoiceQuestions(characterSave, cantripsOnly).map((q) => q.id);

    expect(ids).toContain("wizard_level_1_cantrips");
    expect(ids).not.toContain("wizard_level_1_spellbook");
  });

  it("keeps a class's trait and spell questions in the order its track authors them", () => {
    const characterSave = save({
      classes: [{ classId: "class_warlock", level: 3, selections: {} }],
    });

    const classIds = listChoiceQuestions(characterSave, cantripsOnly)
      .filter((q) => q.target === "class")
      .map((q) => q.id);

    expect(classIds).toEqual([
      "warlock_level_1_cantrips",
      "warlock_level_2_invocations",
      "warlock_level_3_pact_boon",
    ]);
  });

  it("asks a High Elf's cantrip as a trait question sourced from the subrace", () => {
    const characterSave = save({
      race: {
        baseRaceId: "race_elf",
        hasSubraces: true,
        subraceId: "subrace_elf_high",
      },
    });

    const cantrip = listChoiceQuestions(characterSave, snapshot).find(
      (q) => q.id === "high_elf_cantrip",
    )!;

    expect(cantrip.target).toBe("trait");
    expect(cantrip.classId).toBeUndefined();
    expect(cantrip.source.kind).toBe("subrace");
    expect(cantrip.source.id).toBe("subrace_elf_high");
    expect(cantrip.prompt).toBe("(High Elf) Cantrip: choose 1 cantrip(s)");
    expect(cantrip.pickCount).toBe(1);
  });

  it("marks a spell a trait already grants as held, but not the question's own picks", () => {
    const characterSave = save({
      race: { baseRaceId: "race_tiefling", hasSubraces: false, subraceId: null },
      classes: [
        {
          classId: "class_cleric",
          level: 1,
          selections: { cleric_level_1_cantrips: ["spell_minor_illusion"] },
        },
      ],
    });

    const cantrips = listChoiceQuestions(characterSave, snapshot).find(
      (q) => q.id === "cleric_level_1_cantrips",
    )!;

    // Thaumaturgy comes with the tiefling's Infernal Legacy
    expect(cantrips.held).toContain("spell_thaumaturgy");
    expect(cantrips.held).not.toContain("spell_minor_illusion");
    expect(cantrips.selected).toEqual(["spell_minor_illusion"]);
  });

  it("marks another spell question's pick as held", () => {
    const characterSave = save({
      race: {
        baseRaceId: "race_elf",
        hasSubraces: true,
        subraceId: "subrace_elf_high",
      },
      classes: [
        {
          classId: "class_wizard",
          level: 1,
          selections: { wizard_level_1_cantrips: ["spell_dancing_lights"] },
        },
      ],
      traitSelections: { high_elf_cantrip: ["spell_minor_illusion"] },
    });

    const questions = listChoiceQuestions(characterSave, snapshot);

    expect(questions.find((q) => q.id === "high_elf_cantrip")!.held).toContain(
      "spell_dancing_lights",
    );
    expect(
      questions.find((q) => q.id === "wizard_level_1_cantrips")!.held,
    ).toContain("spell_minor_illusion");
  });
```

In `describe("choiceOptionLabel", ...)`, add:

```ts
  it("labels a spell id by its spell name", () => {
    expect(choiceOptionLabel("spell_thaumaturgy", snapshot)).toBe("Thaumaturgy");
  });
```

- [ ] **Step 2: Write the failing server tests**

In `apps/server/src/routes/__tests__/character.choices.test.ts`, inside `describe("POST /api/character choices", ...)`:

Replace the comment above `completeChoicesForLyra` and its `classSelections: {}` line so Lyra answers her bard cantrips:

```ts
  // race_half_elf + background_noble + class_bard ask eight questions at
  // level 1 (half-elf's own three, noble's own two, bard's starting
  // instruments and skills, and bard's two cantrips) - every id below answers
  // one of them, valid picks that avoid anything the character already holds
  // for free
  const completeChoicesForLyra = () => ({
    classSelections: {
      class_bard: {
        bard_level_1_cantrips: ["spell_dancing_lights", "spell_minor_illusion"],
      },
    },
```

(the `traitSelections` and `feats` lines below it stay as they are).

After `completeChoicesForHuman`, add:

```ts
  const cleric = {
    ...human,
    name: "Aveline",
    classId: "class_cleric",
    subclassId: "subclass_cleric_life",
    baseAbilityScores: { str: 12, dex: 9, con: 14, int: 10, wis: 16, cha: 11 },
  };

  // race_human + background_acolyte + class_cleric (Life) ask four questions
  // at level 1: the human's language, the acolyte's two languages, the
  // cleric's starting skills, and the cleric's three cantrips (#79)
  const completeChoicesForCleric = () => ({
    classSelections: {
      class_cleric: {
        cleric_level_1_cantrips: [
          "spell_thaumaturgy",
          "spell_minor_illusion",
          "spell_dancing_lights",
        ],
      },
    },
    traitSelections: {
      human_language_choice: ["elvish"],
      acolyte_languages: ["dwarvish", "giant"],
      cleric_starting_skills: ["history", "medicine"],
    },
    feats: [],
  });
```

and, after the `"creates the character when every question is answered"` test:

```ts
  it("rejects a cleric created without cantrips, naming only that question (#79)", async () => {
    const { app, transaction } = await setupApp();
    const { traitSelections } = completeChoicesForCleric();

    const response = await request(app)
      .post("/api/character")
      .send({ ...cleric, choices: { classSelections: {}, traitSelections, feats: [] } });

    expect(response.status).toBe(400);
    expect(response.body.issues).toEqual([
      "Cleric: nothing selected for cleric_level_1_cantrips",
    ]);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("creates a cleric with three cantrips, stored under the class (#79)", async () => {
    const { app, values } = await setupApp();
    const choices = completeChoicesForCleric();

    const response = await request(app)
      .post("/api/character")
      .send({ ...cleric, choices });

    expect(response.status).toBe(201);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ choices }));
  });
```

In `apps/server/src/routes/__tests__/levelUp.questions.test.ts`, in the `"asks a Knowledge cleric dip for its domain's languages and skills, and accepts the answers"` test, extend the expected ids:

```ts
    expect(ids(choiceQuestions)).toEqual(
      expect.arrayContaining([
        "knowledge_domain_languages",
        "knowledge_domain_skills",
        // a dip into a caster asks its level-1 cantrips like any other
        // level-1 question (#79)
        "cleric_level_1_cantrips",
      ]),
    );
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm --filter @project/engine test choiceQuestions`
Expected: FAIL — the six new spell tests (no `cleric_level_1_cantrips` / `high_elf_cantrip` question; `.find(...)!` is undefined), and `choiceOptionLabel("spell_thaumaturgy")` returns `"Spell thaumaturgy"`.
Run: `DATABASE_URL= pnpm --filter @project/server test character.choices levelUp.questions`
Expected: FAIL — the cleric-without-cantrips test gets 201, and the Knowledge dip's ids lack `cleric_level_1_cantrips`. (The Lyra and "creates a cleric" tests pass already; they turn red only if the implementation asks something they do not answer.)

- [ ] **Step 4: Implement**

In `packages/engine/src/pipeline/choiceQuestions.ts`:

Replace the `import type { CharacterSave } from "@project/shared";` line with:

```ts
import type {
  CharacterSave,
  SpellChoiceNode,
  SpellDefinition,
  TraitDefinition,
} from "@project/shared";
```

add `resolveSpellDefinition,` to the `../rules/ruleLookup.js` import list, replace the `./grantSources.js` import with:

```ts
import {
  backgroundTraitIds,
  baseRaceTraitIds,
  classChoiceNodes,
  classTraitIds,
  featTraitIds,
  isSpellChoice,
  subraceTraitIds,
  unlockedGrants,
} from "./grantSources.js";
```

and add below the `ProficiencyExtractor` import:

```ts
import {
  spellChoiceEntries,
  spellOptions,
  spellsKnownElsewhere,
  type SpellChoiceEntry,
} from "./spellChoices.js";
```

In `choiceOptionLabel`, add the spell lookup directly after the trait lookup, and mention it in the doc comment ("a trait's own name, a spell's name, a language or tool's dictionary name, ..."):

```ts
  resolveTraitDefinition(optionId, snapshot)?.name ??
  resolveSpellDefinition(optionId, snapshot)?.name ??
  LANGUAGE_DICTIONARY[optionId]?.name ??
```

After `optionsOf`, add:

```ts
/** The character's spell choices, and the active traits they were built from. */
interface SpellContext {
  activeTraits: TraitDefinition[];
  entries: SpellChoiceEntry[];
}

/** A spell question's options: each spell, labelled by its name. */
const spellChoiceOptions = (spells: SpellDefinition[]): ChoiceOption[] =>
  spells.map((spell) => ({ id: spell.id, label: spell.name }));

/** What a spell question asks for, after the name of what grants it. */
const spellPrompt = (node: SpellChoiceNode): string =>
  node.maxSpellLevel === 0
    ? `choose ${node.pickCount} cantrip(s)`
    : `choose ${node.pickCount} spell(s) of level ${node.maxSpellLevel === 1 ? "1" : `1 to ${node.maxSpellLevel}`}`;

/** The options of a spell question the character already knows from elsewhere. */
const heldSpells = (
  options: SpellDefinition[],
  spells: SpellContext,
  nodeId: string,
): string[] => {
  const known = spellsKnownElsewhere(spells.entries, spells.activeTraits, nodeId);
  return options.filter((spell) => known.has(spell.id)).map((spell) => spell.id);
};
```

Replace the whole `classQuestions` function (doc comment included) with:

```ts
/**
 * Every class progression choice the character has unlocked - trait_choice
 * and spell_choice nodes alike - one class at a time in ledger order, each
 * class's in the order its tracks author them. A spell node with nothing to
 * offer (no pack spell in its level range yet, #31a) is not asked.
 */
const classQuestions = (
  save: CharacterSave,
  snapshot: RuleSnapshotLookup | undefined,
  rankOf: Map<string, number>,
  spells: SpellContext,
): { question: ChoiceQuestion; rank: number }[] =>
  save.classes.flatMap((classState) => {
    const blueprint = resolveClassDefinition(classState.classId, snapshot);
    const source: ChoiceSource = {
      kind: "class",
      id: classState.classId,
      name: blueprint?.name ?? classState.classId,
    };
    const rank = rankOf.get(`class:${classState.classId}`) ?? Number.MAX_SAFE_INTEGER;
    const traitNodes = new Map(
      classChoiceNodes(classState, snapshot).map((node) => [node.nodeId, node]),
    );

    return unlockedGrants(classState, snapshot).flatMap((grant) => {
      if (typeof grant === "string") return [];

      if (isSpellChoice(grant)) {
        const options = spellOptions(grant, snapshot);
        if (options.length === 0) return [];
        return [
          {
            rank,
            question: {
              id: grant.nodeId,
              target: "class" as const,
              classId: classState.classId,
              source,
              prompt: `${source.name}: ${spellPrompt(grant)}`,
              pickCount: grant.pickCount,
              options: spellChoiceOptions(options),
              selected: classState.selections[grant.nodeId] ?? [],
              held: heldSpells(options, spells, grant.nodeId),
            },
          },
        ];
      }

      const node = traitNodes.get(grant.nodeId);
      if (!node) return [];
      return [
        {
          rank,
          question: {
            id: node.nodeId,
            target: "class" as const,
            classId: classState.classId,
            source,
            prompt: `${source.name}: choose ${node.pickCount} (${humanise(node.nodeId)})`,
            pickCount: node.pickCount,
            options: optionsOf(
              node.options.map((option) => option.id),
              snapshot,
            ),
            selected: classState.selections[node.nodeId] ?? [],
            held: [],
          },
        },
      ];
    });
  });
```

In `traitQuestions`, take the active traits as a parameter instead of compiling them: change its signature to

```ts
const traitQuestions = (
  save: CharacterSave,
  snapshot: RuleSnapshotLookup | undefined,
  traits: TraitDefinition[],
  traitSource: Map<string, ChoiceSource>,
  rankOf: Map<string, number>,
): { question: ChoiceQuestion; rank: number }[] => {
```

and delete its first line, `const traits = CharacterBootstrapper.compileActiveTraits(save, snapshot);` (the rest of the body already reads `traits`).

After `traitQuestions`, add:

```ts
/**
 * The spell choices that live on traits rather than on a class track - a
 * High Elf's cantrip. Ranked with the source that granted the trait; one with
 * nothing to offer is not asked, exactly as for a class spell node.
 */
const traitSpellQuestions = (
  snapshot: RuleSnapshotLookup | undefined,
  traitSource: Map<string, ChoiceSource>,
  rankOf: Map<string, number>,
  spells: SpellContext,
): { question: ChoiceQuestion; rank: number }[] =>
  spells.entries.flatMap((entry) => {
    if (entry.target !== "trait") return [];
    const source = traitSource.get(entry.trait.id);
    const options = spellOptions(entry.node, snapshot);
    if (!source || options.length === 0) return [];

    return [
      {
        rank: rankOf.get(`${source.kind}:${source.id}`) ?? Number.MAX_SAFE_INTEGER,
        question: {
          id: entry.node.nodeId,
          target: "trait" as const,
          source,
          prompt: `${entry.trait.name}: ${spellPrompt(entry.node)}`,
          pickCount: entry.node.pickCount,
          options: spellChoiceOptions(options),
          selected: entry.selected,
          held: heldSpells(options, spells, entry.node.nodeId),
        },
      },
    ];
  });
```

Replace `listChoiceQuestions` (doc comment included) with:

```ts
/**
 * Every question a character must answer to finish assembling their sheet:
 * every class progression trait_choice and spell_choice node, every trait
 * choice block and every trait spell choice, race through feat. A spell
 * choice with nothing to offer is left out (spellOptions).
 *
 * Answered and unanswered questions both come back - a builder that only
 * wants what is left can filter on `selected.length < pickCount` itself; this
 * function's job is only to say what a question is, not whether it is done.
 */
export const listChoiceQuestions = (
  save: CharacterSave,
  snapshot?: RuleSnapshotLookup,
): ChoiceQuestion[] => {
  const { traitSource, rankOf } = buildSourceIndex(save, snapshot);
  const activeTraits = CharacterBootstrapper.compileActiveTraits(save, snapshot);
  const spells: SpellContext = {
    activeTraits,
    entries: spellChoiceEntries(save, activeTraits, snapshot),
  };

  const entries = [
    ...classQuestions(save, snapshot, rankOf, spells),
    ...traitQuestions(save, snapshot, activeTraits, traitSource, rankOf),
    ...traitSpellQuestions(snapshot, traitSource, rankOf, spells),
  ];

  return entries
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.question);
};
```

- [ ] **Step 5: Run the tests, the suites and the typechecks**

Run: `pnpm --filter @project/engine test choiceQuestions` — PASS.
Run: `DATABASE_URL= pnpm --filter @project/server test character.choices levelUp.questions` — PASS. (The existing dip tests answer the new cantrip questions through `answerAll`.)
Run: `pnpm test:all` — green. Typecheck engine, server and web — clean.

- [ ] **Step 6: Restore CRLF and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' packages/engine/src/pipeline/choiceQuestions.ts packages/engine/src/pipeline/__tests__/choiceQuestions.test.ts apps/server/src/routes/__tests__/character.choices.test.ts apps/server/src/routes/__tests__/levelUp.questions.test.ts
pnpm check:hygiene
git add packages/engine/src/pipeline/choiceQuestions.ts packages/engine/src/pipeline/__tests__/choiceQuestions.test.ts apps/server/src/routes/__tests__/character.choices.test.ts apps/server/src/routes/__tests__/levelUp.questions.test.ts
git commit -m "feat(engine): listChoiceQuestions asks spell picks (#79)" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Save validation checks spell picks

**Files:**
- Modify: `packages/engine/src/pipeline/characterBootstrapper.ts`
- Test: `packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts`
- Modify (comment only): `apps/server/src/services/__tests__/sampleCharacterChoices.test.ts:19-23`

**Interfaces:**
- Consumes: `spellOptions`, `spellChoiceEntries`, `spellsKnownElsewhere`, `SpellChoiceEntry` (Task 2).
- Produces: `collectSaveIssues` (and so `collectChoiceIssues`, which every choice-storing endpoint uses) reports, on a class spell node: `invalid_option` for a pick outside `spellOptions`, `redundant_selection` for a pick known elsewhere, and no `missing_selection` when the roster is empty; on a trait spell block (`nodeId` = block id, `traitId` set): `missing_selection` (non-empty roster only), `wrong_selection_count`, `duplicate_selection`, `invalid_option`, `redundant_selection`, and never `orphan_selection`. `knownSpellIds` (invocation prerequisites) counts trait spell block picks.

- [ ] **Step 1: Update the warlock fixture and write the failing tests**

In `packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts`:

Add `import type { CoreRulePackSnapshot } from "@project/shared";` beside the existing `CharacterSave` import (merge into one `import type { CharacterSave, CoreRulePackSnapshot } from "@project/shared";`).

Replace `warlock3` with (its spell picks become pack cantrips; the spells-known nodes offer nothing until #31a and would now be `invalid_option`):

```ts
// cantrips from the pack's roster; the spells-known nodes are left unanswered
// - they offer nothing until #31a gives the pack's spells real levels
const warlock3 = (invocations: string[], boon = "trait_pact_of_the_blade") =>
  warlock(3, {
    warlock_level_1_cantrips: ["spell_eldritch_blast", "spell_minor_illusion"],
    warlock_level_2_invocations: invocations,
    warlock_level_3_pact_boon: [boon],
  });
```

In `"rejects an invocation needing a spell the character does not know"`, change the cantrips to two pack cantrips that are not Eldritch Blast:

```ts
      save.classes[0]!.selections.warlock_level_1_cantrips = [
        "spell_dancing_lights",
        "spell_minor_illusion",
      ];
```

Add a new top-level describe after `describe("CharacterBootstrapper.collectSaveIssues - trait choice blocks", ...)`:

```ts
describe("CharacterBootstrapper.collectSaveIssues - spell choices", () => {
  const issuesAt = (
    save: CharacterSave,
    nodeId: string,
    snapshot: CoreRulePackSnapshot = corePackSnapshot(),
  ) =>
    CharacterBootstrapper.collectSaveIssues(save, snapshot)
      .filter((issue) => issue.nodeId === nodeId)
      .map((issue) => issue.code);

  /**
   * The pack with only its level-0 spells - today the whole pack (#31a), built
   * explicitly so "no spell of level 1 or above" keeps meaning that.
   */
  const cantripsOnly = (): CoreRulePackSnapshot => {
    const snapshot = corePackSnapshot();
    return {
      ...snapshot,
      spellsById: Object.fromEntries(
        Object.entries(snapshot.spellsById).filter(
          ([, spell]) => spell.level === 0,
        ),
      ),
    };
  };

  const human = { baseRaceId: "race_human", hasSubraces: false, subraceId: null };
  const tiefling = { baseRaceId: "race_tiefling", hasSubraces: false, subraceId: null };
  const highElf = { baseRaceId: "race_elf", hasSubraces: true, subraceId: "subrace_elf_high" };
  const cantrips = ["spell_dancing_lights", "spell_minor_illusion", "spell_eldritch_blast"];

  /** a level-1 wizard of the given race, with the given picks */
  const wizard = (
    race: CharacterSave["race"],
    selections: Record<string, string[]>,
    traitSelections: Record<string, string[]> = {},
  ): CharacterSave => ({
    attributes: baseAttributes,
    race,
    classes: [{ classId: "class_wizard", level: 1, selections }],
    traitSelections,
    feats: [],
    hp: baseHp,
  });

  it("accepts cantrips picked from the node's roster", () => {
    const save = wizard(human, { wizard_level_1_cantrips: cantrips });
    expect(issuesAt(save, "wizard_level_1_cantrips")).toEqual([]);
  });

  it("rejects a spell the node does not offer", () => {
    const save = wizard(human, {
      wizard_level_1_cantrips: ["spell_dancing_lights", "spell_minor_illusion", "spell_not_real"],
    });
    expect(issuesAt(save, "wizard_level_1_cantrips")).toEqual(["invalid_option"]);
  });

  it("rejects a pick the character already knows from a trait", () => {
    // Thaumaturgy comes with the tiefling's Infernal Legacy
    const save = wizard(tiefling, {
      wizard_level_1_cantrips: ["spell_thaumaturgy", "spell_minor_illusion", "spell_dancing_lights"],
    });
    expect(issuesAt(save, "wizard_level_1_cantrips")).toEqual(["redundant_selection"]);
  });

  it("reports an unanswered spell node, but not one with nothing to offer", () => {
    const save = wizard(human, {});
    expect(issuesAt(save, "wizard_level_1_cantrips", cantripsOnly())).toEqual(["missing_selection"]);
    expect(issuesAt(save, "wizard_level_1_spellbook", cantripsOnly())).toEqual([]);
  });

  it("rejects every pick on a spell node with nothing to offer", () => {
    const save = wizard(human, {
      wizard_level_1_cantrips: cantrips,
      wizard_level_1_spellbook: [
        "spell_bless",
        "spell_command",
        "spell_identify",
        "spell_augury",
        "spell_suggestion",
        "spell_nondetection",
      ],
    });
    expect(issuesAt(save, "wizard_level_1_spellbook", cantripsOnly())).toEqual(
      Array(6).fill("invalid_option"),
    );
  });

  it("accepts a High Elf's cantrip, which is not an orphan", () => {
    const save = wizard(highElf, { wizard_level_1_cantrips: cantrips }, {
      high_elf_cantrip: ["spell_thaumaturgy"],
    });
    expect(issuesAt(save, "high_elf_cantrip")).toEqual([]);
  });

  it("reports a High Elf's cantrip left unanswered", () => {
    const save = wizard(highElf, { wizard_level_1_cantrips: cantrips });
    expect(issuesAt(save, "high_elf_cantrip")).toEqual(["missing_selection"]);
  });

  it("rejects a High Elf's cantrip the block does not offer, or one too many", () => {
    const notOffered = wizard(highElf, { wizard_level_1_cantrips: cantrips }, {
      high_elf_cantrip: ["spell_not_real"],
    });
    const tooMany = wizard(highElf, { wizard_level_1_cantrips: cantrips }, {
      high_elf_cantrip: ["spell_thaumaturgy", "spell_command"],
    });

    expect(issuesAt(notOffered, "high_elf_cantrip")).toEqual(["invalid_option"]);
    expect(issuesAt(tooMany, "high_elf_cantrip")).toEqual(["wrong_selection_count"]);
  });

  it("rejects a High Elf's cantrip the wizard already picked", () => {
    const save = wizard(highElf, { wizard_level_1_cantrips: cantrips }, {
      high_elf_cantrip: ["spell_dancing_lights"],
    });
    expect(issuesAt(save, "high_elf_cantrip")).toEqual(["redundant_selection"]);
  });

  it("meets an invocation's spell prerequisite with a trait's spell pick", () => {
    const save: CharacterSave = {
      ...warlock3([
        "trait_invocation_agonizing_blast",
        "trait_invocation_devils_sight",
      ]),
      race: highElf,
      traitSelections: {
        high_elf_cantrip: ["spell_eldritch_blast"],
        warlock_starting_skills: ["arcana", "history"],
      },
    };
    save.classes[0]!.selections.warlock_level_1_cantrips = [
      "spell_minor_illusion",
      "spell_dancing_lights",
    ];

    expect(issuesAt(save, "warlock_level_2_invocations")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @project/engine test characterBootstraper`
Expected FAIL, among others: `"rejects a spell the node does not offer"` (`[]` instead of `["invalid_option"]`), `"rejects a pick the character already knows from a trait"`, `"reports an unanswered spell node, but not one with nothing to offer"` (the spellbook reports `missing_selection`), `"accepts a High Elf's cantrip, which is not an orphan"` (`["orphan_selection"]`), and `"meets an invocation's spell prerequisite..."` (`["unmet_prerequisite"]`). The existing warlock tests still pass with the new fixture.

- [ ] **Step 3: Implement**

In `packages/engine/src/pipeline/characterBootstrapper.ts`:

Add below the `./grantSources.js` import:

```ts
import {
  spellChoiceEntries,
  spellOptions,
  spellsKnownElsewhere,
  type SpellChoiceEntry,
} from "./spellChoices.js";
```

Replace `knownSpellIds` with (a trait's own spell pick counts as known):

```ts
const knownSpellIds = (
  classState: ClassState,
  traitIds: Iterable<string>,
  traitSelections: Record<string, string[]>,
  snapshot?: RuleSnapshotLookup,
): Set<string> => {
  const ids = new Set<string>();

  for (const traitId of traitIds) {
    const spells = resolveTraitDefinition(traitId, snapshot)?.spells;
    for (const spell of spells?.fixed ?? []) ids.add(spell.spellId);
    // a trait's own spell pick (a High Elf's cantrip) is known too
    for (const choice of spells?.choices ?? []) {
      for (const id of traitSelections[choice.nodeId] ?? []) ids.add(id);
    }
  }
  for (const grant of unlockedGrants(classState, snapshot)) {
    if (!isSpellChoice(grant)) continue;
    for (const id of classState.selections[grant.nodeId] ?? []) ids.add(id);
  }

  return ids;
};
```

After `rejectionMessage`, add:

```ts
/**
 * The problems with one trait's spell choice - the checks a class spell node
 * gets in collectSaveIssues, keyed by the trait instead of a class. No
 * extractor reads these blocks, so nothing else would check them.
 */
const traitSpellIssues = (
  entry: Extract<SpellChoiceEntry, { target: "trait" }>,
  entries: SpellChoiceEntry[],
  activeTraits: TraitDefinition[],
  snapshot?: RuleSnapshotLookup,
): SaveValidationIssue[] => {
  const { node, trait, selected } = entry;
  const where = { nodeId: node.nodeId, traitId: trait.id };
  const roster = new Set(spellOptions(node, snapshot).map((spell) => spell.id));

  if (selected.length === 0) {
    // nothing to offer: not asked (listChoiceQuestions), so not unanswered
    return roster.size === 0
      ? []
      : [
          {
            ...where,
            code: "missing_selection",
            message: `${trait.name}: nothing selected for ${node.nodeId}`,
          },
        ];
  }

  const issues: SaveValidationIssue[] = [];
  if (selected.length !== node.pickCount) {
    issues.push({
      ...where,
      code: "wrong_selection_count",
      message: `${trait.name}: ${node.nodeId} takes ${node.pickCount} selection(s), got ${selected.length}`,
    });
  }
  if (new Set(selected).size !== selected.length) {
    issues.push({
      ...where,
      code: "duplicate_selection",
      message: `${trait.name}: ${node.nodeId} has the same spell selected twice`,
    });
  }

  const known = spellsKnownElsewhere(entries, activeTraits, node.nodeId);
  for (const spellId of selected) {
    if (!roster.has(spellId)) {
      issues.push({
        ...where,
        code: "invalid_option",
        message: `${trait.name}: ${node.nodeId} does not offer ${spellId}`,
      });
    } else if (known.has(spellId)) {
      issues.push({
        ...where,
        code: "redundant_selection",
        message: `${trait.name}: ${node.nodeId} picked ${spellId}, which this character already knows - the pick buys nothing`,
      });
    }
  }

  return issues;
};
```

In `collectSaveIssues`, directly before `let totalLevel = 0;`, add:

```ts
    // every spell choice the character has, for each one's held check: a
    // spell picked twice across choices, or already granted by a trait, buys
    // nothing
    const activeTraits = CharacterBootstrapper.compileActiveTraits(save, snapshot);
    const spellEntries = spellChoiceEntries(save, activeTraits, snapshot);
```

change the `knownSpellIds` call to

```ts
      const spellIds = knownSpellIds(classState, traitIds, save.traitSelections, snapshot);
```

and in the `for (const grant of grants)` loop, replace everything from `const selected = classState.selections[grant.nodeId];` down to (and including) the lines

```ts
        // a spell_choice can only be checked for shape: there is no spell list
        // data yet to check membership against
        const choiceNode = choiceNodesByNodeId.get(grant.nodeId);
        if (!choiceNode) continue;
```

with:

```ts
        const selected = classState.selections[grant.nodeId];
        const where = { classId: classState.classId, nodeId: grant.nodeId };
        // a spell node offers the pack's spells for its level range
        const spellRoster = isSpellChoice(grant)
          ? new Set(spellOptions(grant, snapshot).map((spell) => spell.id))
          : undefined;

        if (!selected || selected.length === 0) {
          // a spell node with nothing to offer cannot be answered, so it is
          // neither asked (listChoiceQuestions) nor reported unanswered
          if (spellRoster?.size === 0) continue;
          add({
            ...where,
            code: "missing_selection",
            message: `${blueprint.name}: nothing selected for ${grant.nodeId}`,
          });
          continue;
        }

        if (selected.length !== grant.pickCount) {
          add({
            ...where,
            code: "wrong_selection_count",
            message: `${blueprint.name}: ${grant.nodeId} takes ${grant.pickCount} selection(s), got ${selected.length}`,
          });
        }

        if (new Set(selected).size !== selected.length) {
          add({
            ...where,
            code: "duplicate_selection",
            message: `${blueprint.name}: ${grant.nodeId} has the same option selected twice`,
          });
        }

        if (spellRoster) {
          const known = spellsKnownElsewhere(spellEntries, activeTraits, grant.nodeId);
          for (const choice of selected) {
            if (!spellRoster.has(choice)) {
              add({
                ...where,
                code: "invalid_option",
                message: `${blueprint.name}: ${choice} is not an option for ${grant.nodeId}`,
              });
            } else if (known.has(choice)) {
              add({
                ...where,
                code: "redundant_selection",
                message: `${blueprint.name}: ${grant.nodeId} picked ${choice}, which this character already knows - the pick buys nothing`,
              });
            }
          }
          continue;
        }

        const choiceNode = choiceNodesByNodeId.get(grant.nodeId);
        if (!choiceNode) continue;
```

(The `optionsById` / `unmetPrerequisites` block that follows is unchanged.)

In `collectTraitChoiceIssues`, replace

```ts
    const knownChoiceIds = new Set(resolutions.map((r) => r.choiceId));
```

with:

```ts
    // a trait's own spell choice (a High Elf's cantrip): no extractor reads
    // these, so they are checked here - and are known blocks, not orphans
    const spellEntries = spellChoiceEntries(save, activeTraits, snapshot);
    const spellBlockIds: string[] = [];
    for (const entry of spellEntries) {
      if (entry.target !== "trait") continue;
      spellBlockIds.push(entry.node.nodeId);
      issues.push(...traitSpellIssues(entry, spellEntries, activeTraits, snapshot));
    }

    const knownChoiceIds = new Set([
      ...resolutions.map((r) => r.choiceId),
      ...spellBlockIds,
    ]);
```

In `apps/server/src/services/__tests__/sampleCharacterChoices.test.ts`, replace the comment above `spellChoiceNodeIds` with:

```ts
/**
 * The spell_choice nodes a save's classes and subclasses carry. The samples
 * leave them unanswered: every pack spell is a level-0 placeholder until
 * #31a, so the picks a sample could record (Bless as a cantrip) are ones
 * #31a would have to unpick.
 */
```

- [ ] **Step 4: Run the tests, the suites and the typechecks**

Run: `pnpm --filter @project/engine test characterBootstraper` — PASS.
Run: `pnpm test:all` — green (`sampleCharacterChoices.test.ts` still exempts the samples' unanswered spell nodes). Typecheck engine and server — clean.

- [ ] **Step 5: Restore CRLF and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' packages/engine/src/pipeline/characterBootstrapper.ts packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts apps/server/src/services/__tests__/sampleCharacterChoices.test.ts
pnpm check:hygiene
git add packages/engine/src/pipeline/characterBootstrapper.ts packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts apps/server/src/services/__tests__/sampleCharacterChoices.test.ts
git commit -m "feat(engine): save validation checks spell picks (#79)" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The level-up resolver leaves spell picks to the choice questions

**Files:**
- Modify: `apps/server/src/services/levelUpValidation.ts`
- Test: `apps/server/src/services/__tests__/levelUpValidation.test.ts`
- Test: `apps/server/src/routes/__tests__/levelUp.questions.test.ts`

**Interfaces:**
- Produces: `ResolverDecisionType` is `"subclass" | "asi_or_feat" | "trait_selection"`; `resolveNextLevelValidationContext` never raises a decision for a `spell_choice` grant or a trait's `spells.choices`, on a dip or otherwise; `validateLevelUpPayloadFromResolver` no longer reads `payload.addedSpells`. A level's spell picks are then required only through `questionsNewAtLevel` (message `Invalid character choices: <Class>: nothing selected for <nodeId>`) and stored by `buildLevelUpSaves` in `choices.classSelections[classId][nodeId]`.

- [ ] **Step 1: Write the failing tests**

In `apps/server/src/services/__tests__/levelUpValidation.test.ts`:

Delete the whole `it("validates spell_selection quantity", ...)` test. In `"accepts valid payload for combined decision set"`, delete the `addedSpells: ["spell_magic_missile", "spell_shield"],` line and the `dec_spells` decision object (`{ id: "dec_spells", type: "spell_selection", ... }`).

Replace `it("turns a spell_choice node into a spell_selection decision", ...)` with:

```ts
    // spell picks are choice questions (listChoiceQuestions, #79), required
    // and stored like any class node's answer - not resolver decisions
    it("raises no decision for a spell_choice node", () => {
      const context = resolveNextLevelValidationContext({
        classId: "class_wizard",
        currentClassLevel: 0,
      });

      const ids = context.decisions.map((d) => d.id);
      expect(ids).not.toContain("wizard_level_1_cantrips");
      expect(ids).not.toContain("wizard_level_1_spellbook");
    });
```

Replace the comment and test `it("excludes spell_choice decisions from a level-1 dip", ...)` with:

```ts
    it("raises no spell decision on a level-1 dip either", () => {
      const context = resolveNextLevelValidationContext({
        classId: "class_wizard",
        currentClassLevel: 0,
        isMulticlassDip: true,
      });

      expect(context.decisions.map((d) => d.id)).not.toContain(
        "wizard_level_1_cantrips",
      );
    });
```

In `"includes the subclass's level-1 trait_choice decisions on a dip"`, replace its last assertion (`context.decisions.some((d) => d.type === "spell_selection")` … `.toBe(false);`) with:

```ts
      expect(context.decisions.map((d) => d.id)).not.toContain(
        "sorcerer_level_1_cantrips",
      );
```

In `apps/server/src/routes/__tests__/levelUp.questions.test.ts`, after the `fighter` ledger helper, add:

```ts
/** a human Life cleric with the level-1 questions other than cantrips answered */
const humanCleric = (clericPicks: Record<string, string[]> = {}): CharacterRow =>
  character({
    wis: 16,
    choices: {
      classSelections: { class_cleric: clericPicks },
      traitSelections: {
        human_language_choice: ["elvish"],
        cleric_starting_skills: ["history", "medicine"],
      },
      feats: [],
    },
  });

const cleric = (classLevel: number): LedgerRow => ({
  id: "ledger-1",
  characterId: "char-1",
  classId: "class_cleric",
  classLevel,
  subclassId: "subclass_cleric_life",
  position: 0,
});
```

and inside the `describe(...)`, after the Knowledge-cleric-dip test:

```ts
  it("asks a cleric 3 -> 4 for its level-4 cantrip, requires it, and stores the answer (#79)", async () => {
    const { options, levelUp, sets } = await setup(humanCleric(), [cleric(3)]);

    const { choiceQuestions, nextLevel } = await options({ classId: "class_cleric" });
    expect(ids(choiceQuestions)).toEqual(["cleric_level_4_cantrips"]);
    expect(choiceQuestions[0]!.options).toContainEqual({
      id: "spell_thaumaturgy",
      label: "Thaumaturgy",
    });
    // no spell decision left to give the wizard a step that blocks it
    expect(nextLevel.decisions.map((decision) => decision.type)).not.toContain(
      "spell_selection",
    );

    const unanswered = await levelUp({
      targetClassId: "class_cleric",
      newTotalLevel: 4,
      featId: "feat_alert",
    });
    expect(unanswered.status).toBe(400);
    expect(unanswered.body.error).toBe(
      "Invalid character choices: Cleric: nothing selected for cleric_level_4_cantrips",
    );

    const answered = await levelUp({
      targetClassId: "class_cleric",
      newTotalLevel: 4,
      featId: "feat_alert",
      selectedTraits: { cleric_level_4_cantrips: ["spell_thaumaturgy"] },
    });
    expect(answered.status).toBe(200);
    expect(sets).toContainEqual(
      expect.objectContaining({
        choices: expect.objectContaining({
          classSelections: {
            class_cleric: { cleric_level_4_cantrips: ["spell_thaumaturgy"] },
          },
        }),
      }),
    );
  });

  // the lock is generic; this pins that a stored spell answer is covered too
  it("refuses to re-answer a cantrip the character already stored", async () => {
    const { levelUp } = await setup(
      humanCleric({
        cleric_level_1_cantrips: [
          "spell_thaumaturgy",
          "spell_minor_illusion",
          "spell_dancing_lights",
        ],
      }),
      [cleric(1)],
    );

    const result = await levelUp({
      targetClassId: "class_cleric",
      newTotalLevel: 2,
      selectedTraits: {
        cleric_level_1_cantrips: [
          "spell_faerie_fire",
          "spell_minor_illusion",
          "spell_dancing_lights",
        ],
      },
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe(
      "Invalid character choices: cleric_level_1_cantrips already answered",
    );
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `DATABASE_URL= pnpm --filter @project/server test levelUpValidation levelUp.questions`
Expected FAIL: `"raises no decision for a spell_choice node"` (the resolver still raises `wizard_level_1_cantrips`), and the cleric 3 → 4 test (`nextLevel.decisions` holds a `spell_selection`, and the unanswered level-up fails with `You must select exactly 1 spell option(s) for Choose 1 spell(s) for Cleric.`). The lock test passes already.

- [ ] **Step 3: Implement**

In `apps/server/src/services/levelUpValidation.ts`:

Replace `ResolverDecisionType` and its doc comment with:

```ts
/**
 * The decisions a level-up can raise: subclass selection, ability score
 * improvement or feat selection, and trait selection. Spell picks are not
 * among them - they are choice questions (listChoiceQuestions), required and
 * stored like any other answer (#79).
 */
export type ResolverDecisionType =
  | "subclass"
  | "asi_or_feat"
  | "trait_selection";
```

In `traitDrivenDecisions`, replace the doc comment with

```ts
/**
 * Decisions carried by the traits granted at this level: the proficiency
 * choices that live inside a trait rather than on the level track, such as
 * the rogue's Expertise. A trait's spell choice is a choice question instead
 * (listChoiceQuestions, #79).
 */
```

and delete its `for (const choice of trait.spells?.choices ?? []) { ... }` loop.

Replace the body of `grantDrivenDecisions`' loop with:

```ts
  for (const grant of grants) {
    // a spell_choice node is a choice question (listChoiceQuestions),
    // answered through selectedTraits like any class node - not a decision
    if (typeof grant === "string" || grant.type !== "trait_choice") continue;

    decisions.push({
      id: grant.nodeId,
      type: "trait_selection",
      description: `Choose ${grant.pickCount} option(s) for ${sourceName}.`,
      options: grant.options.map(traitIdOfOption),
      isRequired: true,
      quantity: grant.pickCount,
    });
  }
```

In `resolveNextLevelValidationContext`, replace the comment above `if (isMulticlassDip && targetLevel === 1) {` with:

```ts
  // a dip grants the reduced multiclass proficiency set, plus the level's
  // own string feature grants - a fighter dip still gets Fighting Style,
  // which is 5e-correct. Its trait_choice picks become a decision below;
  // its spell picks are choice questions like any other level-1 question
  // (#79).
```

and replace everything from the comment `// a dip offers the class's (and a level-1 subclass's) own level-1` down to the end of the `decisions.push(...traitDrivenDecisions(...).filter(...));` statement with:

```ts
  // a dip offers the class's (and a level-1 subclass's) own level-1
  // trait_choice picks - Fighting Style for a fighter dip, a Draconic
  // sorcerer's ancestor - exactly as a level-1 character gets them
  decisions.push(
    ...grantDrivenDecisions(
      classGrantsAtLevel(blueprint, targetLevel),
      blueprint.name,
    ),
  );

  const subclass = requestedSubclassId
    ? getPackRulebook().subclassesById[requestedSubclassId]
    : undefined;
  if (subclass?.classId === classId) {
    decisions.push(
      ...grantDrivenDecisions(
        subclassGrantsAtLevel(classId, requestedSubclassId, targetLevel),
        subclass.name,
      ),
    );
  }

  decisions.push(
    ...traitDrivenDecisions(grantedTraits.map((trait) => trait.id)),
  );
```

(`isLevelOneDip` and `offered` are gone with it.)

In `validateLevelUpPayloadFromResolver`, delete the `// strict validation: spell selection` block (`if (decision.type === "spell_selection") { ... }`).

- [ ] **Step 4: Run the tests, the suites and the typechecks**

Run: `DATABASE_URL= pnpm --filter @project/server test levelUpValidation levelUp.questions` — PASS.
Run: `pnpm test:all` — green. `pnpm --filter @project/server typecheck` — clean.

- [ ] **Step 5: Restore CRLF and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' apps/server/src/services/levelUpValidation.ts apps/server/src/services/__tests__/levelUpValidation.test.ts apps/server/src/routes/__tests__/levelUp.questions.test.ts
pnpm check:hygiene
git add apps/server/src/services/levelUpValidation.ts apps/server/src/services/__tests__/levelUpValidation.test.ts apps/server/src/routes/__tests__/levelUp.questions.test.ts
git commit -m "fix(server): a level's spell picks are its choice questions, not resolver decisions (#79)" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The level-up wizard drops its spell step; the dead spell fields go

**Files:**
- Modify: `packages/engine/src/types/progression.ts`
- Modify: `packages/shared/src/schemas/transport/levelUp.ts`
- Delete: `apps/web/src/components/wizard/steps/SpellChoiceUnsupportedStep.tsx`
- Modify: `apps/web/src/components/wizard/WizardStepRouter.tsx`
- Modify: `apps/web/src/utils/wizardValidation.ts`
- Modify: `apps/web/src/store/levelUpStore.ts`
- Test: `apps/web/src/utils/__tests__/wizardValidation.test.ts`
- Test: `apps/web/src/store/__tests__/levelUpStore.test.ts`

**Interfaces:**
- Produces: `DecisionType` is `"subclass" | "subrace" | "asi_or_feat" | "trait_selection"`; `LevelUpPayload` has no `addedSpells` or `replacedSpells`. That the wizard never submits them is enforced by the type: `validateAndSubmit` builds a `LevelUpPayload`.

This task is a removal: the failing gate is the typecheck (Step 2), not a new test.

- [ ] **Step 1: Update the web tests to the new shape**

In `apps/web/src/utils/__tests__/wizardValidation.test.ts`, replace the `"keeps subclass, ASI/feat and spell steps, but no step for trait_selection decisions"` test with:

```ts
  it("keeps subclass and ASI/feat steps, but no step for trait_selection decisions", () => {
    expect(
      levelUpSteps([
        decision("subclass"),
        decision("trait_selection", "a"),
        decision("trait_selection", "b"),
        decision("asi_or_feat"),
      ]),
    ).toEqual(["overview", "hp_increase", "subclass", "asi_or_feat", "choices", "review"]);
  });
```

and delete the whole `describe("isStepComplete: spell_selection", ...)` block.

In `apps/web/src/store/__tests__/levelUpStore.test.ts`, in `"keeps every decision from nextLevel.decisions, filling subclass options from the response's subclasses"`: delete the `node_spell_pick` decision from the mocked response, change `expect(decisions).toHaveLength(5);` to `expect(decisions).toHaveLength(4);`, and delete the `expect(decisions.find((d) => d.id === "node_spell_pick")).toEqual({...});` assertion.

- [ ] **Step 2: Remove the types and run the typecheck to see what breaks**

In `packages/engine/src/types/progression.ts`, replace the `DecisionType` doc comment and union with:

```ts
/**
 * The decisions a player can make when leveling up: a subclass, a subrace,
 * an ability score improvement (ASI) or feat, or a trait selection. Spell
 * picks are not level decisions - they are choice questions
 * (listChoiceQuestions), answered like any class or trait pick (#79).
 */
export type DecisionType =
  | "subclass"
  | "subrace"
  | "asi_or_feat"
  | "trait_selection";
```

In `packages/shared/src/schemas/transport/levelUp.ts`, delete the `addedSpells` and `replacedSpells` lines and replace the interface's doc comment with:

```ts
/**
 * Represents the payload for a level-up event in a character's progression.
 * It carries the character's ID, the target class, the new total level, and
 * the choices made at this level: the hit point roll, a subclass, ability
 * score improvements or a feat, and picks. A spell pick is a class or trait
 * pick like any other, keyed by its node, so it travels in selectedTraits or
 * traitSelections (#79).
 */
```

Run: `pnpm --filter @project/web typecheck`
Expected: FAIL — `apps/web/src/store/levelUpStore.ts`: `Property 'addedSpells' does not exist on type 'Partial<LevelUpPayload>'` (and the same for `replacedSpells`).

- [ ] **Step 3: Remove the spell step and the fields from the web**

`apps/web/src/store/levelUpStore.ts` — in `validateAndSubmit`, delete `addedSpells,` and `replacedSpells,` from both the destructuring of `draftPayload` and the `payload` object literal. In `refreshChoiceQuestions`, replace the comment `// the subclass's own decisions (its spell picks, #79) come with it` with:

```ts
        // the subclass's own decisions come with it; its picks, spells
        // included, arrive as choiceQuestions (#79)
```

`apps/web/src/utils/wizardValidation.ts` — change the push comment to `steps.push(decision.type); // 'subclass', 'asi_or_feat'`, and delete the `case "spell_selection":` block (its comment and `return false;`) from `isStepComplete`.

`apps/web/src/components/wizard/WizardStepRouter.tsx` — delete the `import { SpellChoiceUnsupportedStep } from "./steps/SpellChoiceUnsupportedStep";` line and the `case "spell_selection": return <SpellChoiceUnsupportedStep />;` case.

Delete the step:

```bash
git rm apps/web/src/components/wizard/steps/SpellChoiceUnsupportedStep.tsx
```

Check nothing else names it: `git grep -n "SpellChoiceUnsupported\|spell_selection\|addedSpells\|replacedSpells" -- apps packages` — expected: no output.

- [ ] **Step 4: Run the tests and every typecheck**

Run: `pnpm --filter @project/web test wizardValidation levelUpStore` — PASS.
Run: `pnpm test:all` — green. Typecheck shared, engine, server and web — all clean.

- [ ] **Step 5: Restore CRLF and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' packages/engine/src/types/progression.ts packages/shared/src/schemas/transport/levelUp.ts apps/web/src/components/wizard/WizardStepRouter.tsx apps/web/src/utils/wizardValidation.ts apps/web/src/store/levelUpStore.ts apps/web/src/utils/__tests__/wizardValidation.test.ts apps/web/src/store/__tests__/levelUpStore.test.ts
pnpm check:hygiene
git add packages/engine/src/types/progression.ts packages/shared/src/schemas/transport/levelUp.ts apps/web/src/components/wizard/WizardStepRouter.tsx apps/web/src/utils/wizardValidation.ts apps/web/src/store/levelUpStore.ts apps/web/src/utils/__tests__/wizardValidation.test.ts apps/web/src/store/__tests__/levelUpStore.test.ts
git commit -m "refactor(web): the level-up wizard has no spell step; spell picks are choices (#79)" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: The picker filters a long question by name

**Files:**
- Modify: `apps/web/src/components/wizard/choices/ChoicePicker.tsx`
- Test: `apps/web/src/components/wizard/choices/__tests__/ChoicePicker.test.tsx`

**Interfaces:**
- Produces: `ChoicePicker` (same props) renders an `<input type="search">` above the options when `question.options.length > 12`; typing narrows the shown options to labels containing the text, case-insensitively; a selected option is shown whatever the filter says. Both wizards get it through `ChoiceQuestionList`.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/components/wizard/choices/__tests__/ChoicePicker.test.tsx`, after the `checkboxes` helper, add:

```tsx
// React tracks a controlled input's value itself, so a test sets it through
// the native setter and fires "input" for onChange to see the change
const typeInto = async (input: HTMLInputElement, text: string) => {
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setValue.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const optionLabels = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("label")).map(
    (label) => label.textContent,
  );

const filterBox = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>('input[type="search"]');

/** thirteen options - one past the filter threshold */
const spellQuestion = buildQuestion({
  id: "cleric_level_1_cantrips",
  target: "class",
  prompt: "Cleric: choose 3 cantrip(s)",
  pickCount: 3,
  options: [
    "Bless",
    "Burning Hands",
    "Fireball",
    "Fire Shield",
    "Guidance",
    "Light",
    "Mending",
    "Resistance",
    "Sacred Flame",
    "Spare the Dying",
    "Thaumaturgy",
    "Toll the Dead",
    "Word of Radiance",
  ].map((label) => ({
    id: `spell_${label.toLowerCase().replace(/ /g, "_")}`,
    label,
  })),
});
```

and a new describe after `describe("ChoicePicker", ...)`:

```tsx
describe("ChoicePicker's name filter", () => {
  it("is not shown for a question with 12 or fewer options", async () => {
    const { container } = await renderInto(
      <ChoicePicker question={buildQuestion()} selected={[]} onChange={() => {}} />,
    );

    expect(filterBox(container)).toBeNull();
  });

  it("narrows a long question's options by name, ignoring case", async () => {
    const { container } = await renderInto(
      <ChoicePicker question={spellQuestion} selected={[]} onChange={() => {}} />,
    );

    await typeInto(filterBox(container)!, "FIRE");

    expect(optionLabels(container)).toEqual(["Fireball", "Fire Shield"]);
  });

  it("keeps a selected option shown and checked when the filter excludes it", async () => {
    const { container } = await renderInto(
      <ChoicePicker
        question={spellQuestion}
        selected={["spell_bless"]}
        onChange={() => {}}
      />,
    );

    await typeInto(filterBox(container)!, "fire");

    expect(optionLabels(container)).toEqual(["Bless", "Fireball", "Fire Shield"]);
    expect(checkboxes(container)[0].checked).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @project/web test ChoicePicker`
Expected: the first new test PASSES (there is no filter yet); the other two FAIL on `filterBox(container)!` being null.

- [ ] **Step 3: Implement**

Replace `apps/web/src/components/wizard/choices/ChoicePicker.tsx` from `export const ChoicePicker` to the end of the file with (the `isQuestionAnswered` export above it stays as it is; add `import { useState } from "react";` as the file's first import):

```tsx
/**
 * Past this many options a question gets a name filter - a cantrip question
 * lists every cantrip the pack has.
 */
const FILTER_THRESHOLD = 12;

export const ChoicePicker = ({
  question,
  selected,
  onChange,
}: {
  question: ChoiceQuestion;
  selected: string[];
  onChange: (selected: string[]) => void;
}) => {
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();
  // the filter narrows what is shown, never what is picked: a selected
  // option stays shown whatever the filter says
  const shown =
    needle === ""
      ? question.options
      : question.options.filter(
          (option) =>
            selected.includes(option.id) ||
            option.label.toLowerCase().includes(needle),
        );

  const toggle = (optionId: string, checked: boolean) => {
    if (checked) {
      onChange([...selected, optionId]);
    } else {
      onChange(selected.filter((id) => id !== optionId));
    }
  };

  return (
    <fieldset className="border border-gray-300 rounded p-3 mb-3">
      <legend className="text-sm font-bold px-1">{question.prompt}</legend>
      <p className="text-xs text-gray-500 mb-2">
        {selected.length} / {question.pickCount}
      </p>
      {question.options.length > FILTER_THRESHOLD && (
        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter by name"
          aria-label={`Filter: ${question.prompt}`}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm mb-2"
        />
      )}
      <div className="flex flex-col gap-1">
        {shown.map((option) => {
          const isSelected = selected.includes(option.id);
          const isHeld = question.held.includes(option.id);
          const disabled =
            !isSelected &&
            (selected.length >= question.pickCount || isHeld);

          return (
            <label
              key={option.id}
              className="flex items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                checked={isSelected}
                disabled={disabled}
                onChange={(event) => toggle(option.id, event.target.checked)}
              />
              {option.label}
              {isHeld ? " (already known)" : ""}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
};
```

- [ ] **Step 4: Run the tests, the suite, typecheck and lint**

Run: `pnpm --filter @project/web test ChoicePicker` — PASS (all existing ChoicePicker/ChoiceQuestionList tests too).
Run: `pnpm test:all` — green. `pnpm --filter @project/web typecheck` — clean. `pnpm --filter @project/web lint` — no new warnings (only the two long-standing ones, backlog #65).

- [ ] **Step 5: Restore CRLF and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' apps/web/src/components/wizard/choices/ChoicePicker.tsx apps/web/src/components/wizard/choices/__tests__/ChoicePicker.test.tsx
pnpm check:hygiene
git add apps/web/src/components/wizard/choices/ChoicePicker.tsx apps/web/src/components/wizard/choices/__tests__/ChoicePicker.test.tsx
git commit -m "feat(web): the choice picker filters a long question by name (#79)" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Verification gates

**Files:** none (verification only).

- [ ] **Step 1: Run every gate from a clean state**

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

Expected: all green; lint shows only the two long-standing warnings (#65). Record each package's test count from `test:all`'s output: the baseline on `main` was shared 229, engine 974, database 199, server 436, web 428 = 2266. The expected new tests: shared +1, engine +1 (ruleLookup) +6 (spellChoices) +6 (choiceQuestions, net of the one replaced) +1 (choiceOptionLabel) +10 (spell validation), server +2 (creation) −1 (spell quantity) +2 (level-up), web +3 (filter) −1 (spell step). A package whose count moves by something else: find out why before going on.

- [ ] **Step 2: Check the branch holds only this work**

Run: `git status` — clean. `git log --oneline main..HEAD` — the spec, this plan, and Tasks 1–7's seven commits.

---

### Task 9: Hand check and backlog (controller, with the owner's permission)

**Files:**
- Modify: `docs/TODO_BACKLOG.md`

Run by the controller, not a subagent: it uses the dev servers and writes to the local database.

- [ ] **Step 1: Ask the owner before touching the database**, then re-seed the samples: `pnpm --filter @project/database db:seed:samples`. (No `db:import-pack` is needed: the stored pack payload already carries its `spells` section, and `toRuleSnapshot` now reads it.)

- [ ] **Step 2: Hand check in the running app** (`preview_start` with `server`, then `web`):
  1. Sister Aveline (cleric 3): level up to cleric 4 through the wizard, taking a feat. The Choices step asks "Cleric: choose 1 cantrip(s)" with a filter box; typing narrows the list; pick Thaumaturgy; commit succeeds. Her row's `choices.classSelections.class_cleric` holds `{ cleric_level_4_cantrips: ["spell_thaumaturgy"] }`.
  2. Create a human cleric through the creation wizard: the Choices step asks for 3 cantrips and Next stays disabled until they are picked; the created row's `choices.classSelections.class_cleric.cleric_level_1_cantrips` holds them.
  3. Create a warlock picking Eldritch Blast among its cantrips, then level it 1 → 2 taking Agonizing Blast as an invocation: the server accepts it.
  Record what was seen (values and screenshots) for Step 3. Re-seed the samples afterwards.

- [ ] **Step 3: Update `docs/TODO_BACKLOG.md`** (CRLF — restore endings afterwards with the Global Constraints command):
  - In the 11g table, row 79 becomes: `| 79 | ✅ The level-up wizard has no spell step, so a level with a spell choice cannot be submitted | Found by `fix/levelup-correctness`'s hand check, 2026-09-21; closed 2026-09-22 on `feat/spell-choices`: spell picks are choice questions. See below. |`
  - Append to the `#79` bullet:
    ```
      **Closed 2026-09-22** on `feat/spell-choices`. Spell picks are choice
      questions: `listChoiceQuestions` asks one per unlocked class
      `spell_choice` node (stored in `choices.classSelections[classId][nodeId]`,
      sent as `selectedTraits`) and one per trait `spells.choices` block (the
      High Elf cantrip, stored in `traitSelections`), with options from
      `spellOptions` (`packages/engine/src/pipeline/spellChoices.ts`) and spells
      known elsewhere marked held. Both wizards' Choices steps ask them; the
      server's required-answer and lock checks cover them; save validation
      checks each pick's option, held status and count. The resolver's
      `spell_selection` decisions, `SpellChoiceUnsupportedStep` and
      `LevelUpPayload.addedSpells`/`replacedSpells` are gone. Until #31a gives
      spells real levels, a cantrip question lists every pack spell and a
      spellbook or spells-known node has no options and is not asked.
      Hand check: <what Step 2 saw, one sentence per scenario, with the stored
      values>.
    ```
  - Append to the `#81` bullet: `Since `feat/spell-choices` (#79) the warlock's cantrips are asked at creation, so the example only fails when Eldritch Blast was not picked.`
  - In the Tier 2 table, row 7 (#31a), append to its "Why here" cell: `Since `feat/spell-choices` (#79), `spellOptions` (`packages/engine/src/pipeline/spellChoices.ts`) is the one place list membership goes, and once spells have real levels the spellbook and spells-known questions start being asked with no other change.`
  - At the end of section 10c (#67), add a paragraph: `Since `feat/spell-choices` (#79) a trait's `spells.choices` block is asked and stored like any choice question (the High Elf cantrip is one), so the druid cantrip can be authored as a `spell_choice` block on the trait (`listSource: "druid"`, `maxSpellLevel: 0`, `pickCount: 1`) once #31a gives the pack spell lists; authored before that, it would offer every pack spell.`
  - After the `#81` bullet (end of the file), add section 11h:
    ```
    ### 11h. #82 and #83 — found while implementing `feat/spell-choices`

    | # | Item | Notes |
    | --- | --- | --- |
    | 82 | Level-up cannot swap a known spell | Recorded 2026-09-22 when `feat/spell-choices` removed `LevelUpPayload.replacedSpells`, which nothing read. See below. |
    | 83 | The sheet does not list a character's picked spells | Recorded 2026-09-22 on `feat/spell-choices`. See below. |

    - **#82 — level-up cannot swap a known spell.** A bard, ranger, sorcerer
      or warlock (and an Eldritch Knight or Arcane Trickster) may replace one
      known spell on gaining a level. `replacedSpells` was declared on
      `LevelUpPayload` but never read or stored, so `feat/spell-choices`
      removed it rather than keep a dead field. A swap needs a way to say
      which stored pick is replaced, against the lock that refuses to
      re-answer a stored question (`Invalid character choices: <id> already
      answered`). Waits on #31a: until spells have real levels no
      spells-known node is asked at all.
    - **#83 — the sheet does not list picked spells.** Since
      `feat/spell-choices` spell picks are stored in `choices`, and
      `knownSpellIds` reads them for invocation prerequisites, but
      `SpellcastingWidget` shows slots only and no code builds a
      `RuntimeSpellSource` from a save, so `SpellbookEngine` has no caller.
      Best done with or after #31a, when spells have real levels (and #31b,
      real actions).
    ```

- [ ] **Step 4: Restore CRLF, check and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' docs/TODO_BACKLOG.md
pnpm check:hygiene
git add docs/TODO_BACKLOG.md
git commit -m "docs: close #79 (spell picks are choice questions); record #82, #83" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

The backlog's header status paragraph and the baseline test counts are updated on `main` after the merge, as for `feat/choice-step`.
