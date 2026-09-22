# Choice Prerequisites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Both wizards' pickers show an option whose prerequisites the character does not meet as disabled, with the reason ("Agonizing Blast (needs Eldritch Blast)"), instead of offering it and letting the server reject it at submit (backlog #81).

**Architecture:** The prerequisite check that save validation runs moves out of `CharacterBootstrapper` into one engine module, `optionPrerequisites.ts`, returning structured results. The bootstrapper formats them exactly as before (server messages unchanged); `listChoiceQuestions` labels them by name onto each option (`ChoiceOption.unmet`). One helper, `blockedOptionIds`, says which options a player cannot pick (held or unmet); the picker and both wizard stores use it.

**Tech Stack:** TypeScript, pnpm + turbo monorepo; Vitest; `@project/engine`; Express (`apps/server`); React 19 + Zustand (`apps/web`).

**Spec:** `docs/superpowers/specs/2026-09-22-choice-prerequisites-design.md`

## Global Constraints

- Line endings: the working tree is CRLF with `core.autocrlf=true`, and git normalises endings, so `git diff`/`git show` cannot reveal them. **Every file this plan touches is CRLF (measured 2026-09-22), and the new files must be CRLF too.** Edit/Write emit LF. After editing, restore CRLF on every file you touched:
  ```bash
  node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' <file> <file> ...
  ```
  Do not use `sed -i`. `pnpm check:hygiene` fails on a file with mixed endings.
- CI has no `.env` and no `DATABASE_URL`: nothing a test imports may require it at load. Run server tests as `DATABASE_URL= pnpm --filter @project/server test`.
- Never run `db:migrate`, `db:seed*`, `db:import-pack` or anything else that writes to a database. The hand check (Task 5) is run by the controller with the owner's permission.
- Typecheck per package with `pnpm --filter @project/<pkg> typecheck` (`tsc -b` in web). Never trust turbo's cached `pnpm typecheck`. Vitest does not typecheck.
- Web component tests use `createRoot` from `react-dom/client` + `act` from `react`; `@testing-library/react` is not installed.
- Rules come only from the pack: engine tests use `corePackLookup()` / `corePackSnapshot()` (`packages/engine/src/pipeline/__tests__/corePackFixture.ts`); server tests use the real assembled pack.
- Server messages are unchanged, verbatim: an unmet pick is `unmet_prerequisite` with `<Class name>: <option id> <reasons joined by ", ">`, each reason `needs <classId> level <n>`, `needs <traitId>` or `needs <spellId>`, level first, then traits, then spells.
- Picker reasons, verbatim: `needs <Class name> level <n>`, `needs <trait name>`, `needs <spell name>` (e.g. `needs Warlock level 5`, `needs Pact of the Blade`, `needs Eldritch Blast`), in the same order; shown as `<label> (<reasons joined by ", ">)`.
- `pnpm test:all` (hygiene + all five packages) and every touched package's typecheck must be green at the end of every task. Do not pass turbo flags such as `--force` to `test:all`.
- Commit messages end with a blank line and then `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` (use `git commit -F -` with a heredoc so the trailer is its own paragraph). Subjects cite (#81) only. Do not push.
- Touch only the files a task lists. A failure in any other file: stop and report NEEDS_CONTEXT.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `packages/engine/src/pipeline/optionPrerequisites.ts` (new) | the context an option's prerequisites are checked against, and the structured check | 1 |
| `packages/engine/src/pipeline/characterBootstrapper.ts` | uses the shared check; formats reasons as before | 1 |
| `packages/engine/src/pipeline/choiceQuestions.ts` | `ChoiceOption.unmet`, labelled reasons, `blockedOptionIds` | 2 |
| `apps/web/src/components/wizard/choices/ChoicePicker.tsx` | disables a blocked option, shows unmet reasons | 3 |
| `apps/web/src/store/wizardStore.ts`, `apps/web/src/store/levelUpStore.ts` | prune blocked picks, not only held ones | 3 |
| `docs/TODO_BACKLOG.md` | close #81; expand #78 | 5 |

---

### Task 1: Engine — one prerequisite check, shared

**Files:**
- Create: `packages/engine/src/pipeline/optionPrerequisites.ts`
- Modify: `packages/engine/src/pipeline/index.ts` (export it)
- Modify: `packages/engine/src/pipeline/characterBootstrapper.ts` (use it; delete its local `knownSpellIds` and `unmetPrerequisites`)
- Test: `packages/engine/src/pipeline/__tests__/optionPrerequisites.test.ts` (create)
- Regression: `packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts` (unchanged; must stay green)

**Interfaces:**
- Produces (from `@project/engine`):

```ts
export type UnmetPrerequisite =
  | { kind: "level"; classId: string; level: number }
  | { kind: "trait"; traitId: string }
  | { kind: "spell"; spellId: string };
export interface PrerequisiteContext {
  classState: ClassState;
  traitIds: Set<string>;
  spellIds: Set<string>;
}
export const prerequisiteContext: (
  save: CharacterSave,
  classIndex: number,
  traitSpellPicks: string[],
  snapshot?: RuleSnapshotLookup,
) => PrerequisiteContext;
export const unmetPrerequisites: (
  option: TraitChoiceOption,
  context: PrerequisiteContext,
) => UnmetPrerequisite[];
```

`traitSpellPicks` is every trait spell block's picks: `spellChoiceEntries(save, activeTraits, snapshot).filter((e) => e.target === "trait").flatMap((e) => e.selected)`.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/pipeline/__tests__/optionPrerequisites.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CharacterSave, TraitChoiceOption } from "@project/shared";
import {
  prerequisiteContext,
  unmetPrerequisites,
} from "../optionPrerequisites.js";
import { corePackLookup } from "./corePackFixture.js";

const snapshot = corePackLookup();

const attributes = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
const hp = { current: 1, temporary: 0, baseRolledHp: 1, hitDiceSpent: {} };

/** a human Fiend warlock at the given level with the given class picks */
const warlock = (
  level: number,
  selections: Record<string, string[]>,
): CharacterSave => ({
  attributes,
  race: { baseRaceId: "race_human", hasSubraces: false, subraceId: null },
  classes: [
    {
      classId: "class_warlock",
      level,
      subclassId: "subclass_warlock_fiend",
      selections,
    },
  ],
  traitSelections: {},
  feats: [],
  hp,
});

const agonizingBlast: TraitChoiceOption = {
  traitId: "trait_invocation_agonizing_blast",
  prerequisites: { requiredSpellIds: ["spell_eldritch_blast"] },
};

const thirstingBlade: TraitChoiceOption = {
  traitId: "trait_invocation_thirsting_blade",
  prerequisites: {
    minimumLevel: 5,
    requiredTraitIds: ["trait_pact_of_the_blade"],
  },
};

describe("unmetPrerequisites", () => {
  it("passes a plain option", () => {
    const context = prerequisiteContext(warlock(2, {}), 0, [], snapshot);

    expect(
      unmetPrerequisites("trait_invocation_devils_sight", context),
    ).toEqual([]);
  });

  it("reports a required spell the character does not know", () => {
    const context = prerequisiteContext(
      warlock(2, {
        warlock_level_1_cantrips: ["spell_minor_illusion", "spell_dancing_lights"],
      }),
      0,
      [],
      snapshot,
    );

    expect(unmetPrerequisites(agonizingBlast, context)).toEqual([
      { kind: "spell", spellId: "spell_eldritch_blast" },
    ]);
  });

  it("counts the class's own spell pick as known", () => {
    const context = prerequisiteContext(
      warlock(2, {
        warlock_level_1_cantrips: ["spell_eldritch_blast", "spell_minor_illusion"],
      }),
      0,
      [],
      snapshot,
    );

    expect(unmetPrerequisites(agonizingBlast, context)).toEqual([]);
  });

  it("counts a trait spell block's pick as known", () => {
    const context = prerequisiteContext(
      warlock(2, {}),
      0,
      ["spell_eldritch_blast"],
      snapshot,
    );

    expect(unmetPrerequisites(agonizingBlast, context)).toEqual([]);
  });

  it("reports a level too low and a missing trait, level first", () => {
    const context = prerequisiteContext(warlock(2, {}), 0, [], snapshot);

    expect(unmetPrerequisites(thirstingBlade, context)).toEqual([
      { kind: "level", classId: "class_warlock", level: 5 },
      { kind: "trait", traitId: "trait_pact_of_the_blade" },
    ]);
  });

  it("passes Thirsting Blade once the pact is taken and the level reached", () => {
    const context = prerequisiteContext(
      warlock(5, { warlock_level_3_pact_boon: ["trait_pact_of_the_blade"] }),
      0,
      [],
      snapshot,
    );

    expect(unmetPrerequisites(thirstingBlade, context)).toEqual([]);
  });

  it("checks against the class at the given index", () => {
    const fighterThenWarlock: CharacterSave = {
      ...warlock(2, {}),
      classes: [
        {
          classId: "class_fighter",
          level: 3,
          selections: { fighter_level_1_fighting_style: ["trait_fs_defense"] },
        },
        { classId: "class_warlock", level: 2, selections: {} },
      ],
    };

    const context = prerequisiteContext(fighterThenWarlock, 1, [], snapshot);

    expect(context.classState.classId).toBe("class_warlock");
    expect(unmetPrerequisites(thirstingBlade, context)[0]).toEqual({
      kind: "level",
      classId: "class_warlock",
      level: 5,
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @project/engine test optionPrerequisites`
Expected: FAIL — `Failed to resolve import "../optionPrerequisites.js"`.

- [ ] **Step 3: Implement the module**

Create `packages/engine/src/pipeline/optionPrerequisites.ts`:

```ts
import type { CharacterSave, TraitChoiceOption } from "@project/shared";
import {
  resolveTraitDefinition,
  type RuleSnapshotLookup,
} from "../rules/ruleLookup.js";
import {
  classTraitIds,
  isSpellChoice,
  raceTraitIds,
  unlockedGrants,
  type ClassState,
} from "./grantSources.js";

/** One gate on a trait-choice option that the character does not pass. */
export type UnmetPrerequisite =
  | { kind: "level"; classId: string; level: number }
  | { kind: "trait"; traitId: string }
  | { kind: "spell"; spellId: string };

/**
 * What one class's trait-choice options are checked against: the class's own
 * level, the traits the character has through their race and this class, and
 * the spells they know.
 */
export interface PrerequisiteContext {
  classState: ClassState;
  traitIds: Set<string>;
  spellIds: Set<string>;
}

/** Every fixed spell of the given traits, and the class's own spell picks. */
const knownSpellIds = (
  classState: ClassState,
  traitIds: Iterable<string>,
  snapshot?: RuleSnapshotLookup,
): Set<string> => {
  const ids = new Set<string>();

  for (const traitId of traitIds) {
    const spells = resolveTraitDefinition(traitId, snapshot)?.spells;
    for (const spell of spells?.fixed ?? []) ids.add(spell.spellId);
  }
  for (const grant of unlockedGrants(classState, snapshot)) {
    if (!isSpellChoice(grant)) continue;
    for (const id of classState.selections[grant.nodeId] ?? []) ids.add(id);
  }

  return ids;
};

/**
 * The context one class's trait-choice options are checked against - the one
 * construction save validation and listChoiceQuestions share, so a picker and
 * the server can never disagree about whether an option is available.
 * @param save The character
 * @param classIndex The class's position in save.classes; the first class
 *   grants the full starting proficiency set, a later one the multiclass set
 * @param traitSpellPicks Every trait spell block's picks (a High Elf's cantrip,
 *   a feat's), known wherever they came from
 * @param snapshot Pack content, when the caller has any loaded
 * @returns The class state, and the traits and spells it is checked against
 */
export const prerequisiteContext = (
  save: CharacterSave,
  classIndex: number,
  traitSpellPicks: string[],
  snapshot?: RuleSnapshotLookup,
): PrerequisiteContext => {
  const classState = save.classes[classIndex];
  if (!classState) {
    throw new Error(`No class at index ${classIndex} of the save`);
  }

  const traitIds = new Set([
    ...raceTraitIds(save.race, snapshot),
    ...classTraitIds(classState, classIndex === 0, snapshot),
  ]);

  return {
    classState,
    traitIds,
    spellIds: new Set([
      ...knownSpellIds(classState, traitIds, snapshot),
      ...traitSpellPicks,
    ]),
  };
};

/**
 * The gates an option does not pass: a level too low, then each missing
 * trait, then each unknown spell.
 *
 * Prerequisites are checked against the character as they stand now, not
 * against the level the node first appeared at. That matches how the rules
 * work in practice - a warlock who swaps an invocation on level up is judged
 * on their current pact and level, not on what they had at level 2.
 * @param option A trait-choice option; a bare string has no prerequisites
 * @param context prerequisiteContext for the class the choice belongs to
 * @returns Every unmet prerequisite, empty when the option can be taken
 */
export const unmetPrerequisites = (
  option: TraitChoiceOption,
  context: PrerequisiteContext,
): UnmetPrerequisite[] => {
  if (typeof option === "string") return [];

  const unmet: UnmetPrerequisite[] = [];
  const { minimumLevel, requiredTraitIds, requiredSpellIds } =
    option.prerequisites;
  const { classState, traitIds, spellIds } = context;

  if (minimumLevel !== undefined && classState.level < minimumLevel) {
    unmet.push({ kind: "level", classId: classState.classId, level: minimumLevel });
  }
  for (const traitId of requiredTraitIds ?? []) {
    if (!traitIds.has(traitId)) unmet.push({ kind: "trait", traitId });
  }
  for (const spellId of requiredSpellIds ?? []) {
    if (!spellIds.has(spellId)) unmet.push({ kind: "spell", spellId });
  }

  return unmet;
};
```

In `packages/engine/src/pipeline/index.ts`, after `export * from "./spellChoices.js";`:

```ts
export * from "./optionPrerequisites.js";
```

- [ ] **Step 4: Run the new test**

Run: `pnpm --filter @project/engine test optionPrerequisites` — PASS (7 tests).

- [ ] **Step 5: Make the bootstrapper use it**

In `packages/engine/src/pipeline/characterBootstrapper.ts`:

1. Delete the local `knownSpellIds` function and the local `unmetPrerequisites` function (with its doc comment) — both now live in `optionPrerequisites.ts`.
2. Add the import, below the `./spellChoices.js` import:
   ```ts
   import {
     prerequisiteContext,
     unmetPrerequisites,
     type UnmetPrerequisite,
   } from "./optionPrerequisites.js";
   ```
3. Add, where the deleted `unmetPrerequisites` was:
   ```ts
   /**
    * How an unmet prerequisite reads in a save validation message: by id,
    * because the message is for the API and logs. A picker labels the same
    * result by name (choiceQuestions.ts).
    */
   const describeUnmet = (unmet: UnmetPrerequisite): string => {
     switch (unmet.kind) {
       case "level":
         return `needs ${unmet.classId} level ${unmet.level}`;
       case "trait":
         return `needs ${unmet.traitId}`;
       case "spell":
         return `needs ${unmet.spellId}`;
     }
   };
   ```
4. In `collectSaveIssues`'s class loop, replace
   ```ts
         const traitIds = new Set([
           ...raceTraitIds(save.race, snapshot),
           ...classTraitIds(classState, classIndex === 0, snapshot),
         ]);
         const spellIds = new Set([
           ...knownSpellIds(classState, traitIds, snapshot),
           ...traitSpellPicks,
         ]);
   ```
   with
   ```ts
         const prerequisites = prerequisiteContext(
           save,
           classIndex,
           traitSpellPicks,
           snapshot,
         );
   ```
   and replace
   ```ts
             const unmet = unmetPrerequisites(
               option,
               classState,
               traitIds,
               spellIds,
             );
             if (unmet.length > 0) {
               add({
                 ...where,
                 code: "unmet_prerequisite",
                 message: `${blueprint.name}: ${choice} ${unmet.join(", ")}`,
               });
             }
   ```
   with
   ```ts
             const unmet = unmetPrerequisites(option, prerequisites);
             if (unmet.length > 0) {
               add({
                 ...where,
                 code: "unmet_prerequisite",
                 message: `${blueprint.name}: ${choice} ${unmet.map(describeUnmet).join(", ")}`,
               });
             }
   ```
5. Remove any import the compiler or lint now reports unused (e.g. `TraitChoiceOption`); keep every import still in use (`raceTraitIds` and `classTraitIds` are still used by `resolveGrantedTraitIds`; `isSpellChoice`, `unlockedGrants` and `resolveTraitDefinition` elsewhere).

- [ ] **Step 6: Run the regression suite, the full suite and the typecheck**

Run: `pnpm --filter @project/engine test characterBootstraper optionPrerequisites` — PASS; the existing `prerequisites` tests (Thirsting Blade's "level 5", Book of Ancient Secrets' `trait_pact_of_the_tome`, Agonizing Blast's `spell_eldritch_blast`) and the #79 trait-spell-pick tests pass unchanged, proving the messages did not change.
Run: `pnpm test:all` — green. `pnpm --filter @project/engine typecheck` and `pnpm --filter @project/engine lint` — clean.

- [ ] **Step 7: Restore CRLF and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' packages/engine/src/pipeline/optionPrerequisites.ts packages/engine/src/pipeline/__tests__/optionPrerequisites.test.ts packages/engine/src/pipeline/index.ts packages/engine/src/pipeline/characterBootstrapper.ts
pnpm check:hygiene
git add packages/engine/src/pipeline/optionPrerequisites.ts packages/engine/src/pipeline/__tests__/optionPrerequisites.test.ts packages/engine/src/pipeline/index.ts packages/engine/src/pipeline/characterBootstrapper.ts
git commit -F - <<'EOF'
refactor(engine): one prerequisite check for trait-choice options (#81)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Engine — a question says which options are not available yet

**Files:**
- Modify: `packages/engine/src/pipeline/choiceQuestions.ts`
- Test: `packages/engine/src/pipeline/__tests__/choiceQuestions.test.ts`
- Test: `apps/server/src/routes/__tests__/levelUp.questions.test.ts`

**Interfaces:**
- Consumes: `prerequisiteContext`, `unmetPrerequisites`, `UnmetPrerequisite` (Task 1).
- Produces (from `@project/engine`):
  - `ChoiceOption` gains `unmet?: string[]` — readable reasons (`needs Eldritch Blast`, `needs Pact of the Blade`, `needs Warlock level 5`), level first then traits then spells; the key is absent when the option is available, and only a class trait-choice option ever carries it.
  - `blockedOptionIds(question: Pick<ChoiceQuestion, "held" | "options">): string[]` — the held ids plus every option with `unmet`, without duplicates.

- [ ] **Step 1: Write the failing engine tests**

In `packages/engine/src/pipeline/__tests__/choiceQuestions.test.ts`, change the first import to `import { blockedOptionIds, choiceOptionLabel, listChoiceQuestions, type ChoiceQuestion } from "../choiceQuestions.js";` and add at the end of the file:

```ts
describe("listChoiceQuestions - option prerequisites", () => {
  /** a human Fiend warlock at the given level with these level-1 cantrips */
  const warlockSave = (
    level: number,
    cantrips: string[],
    picks: Record<string, string[]> = {},
  ) =>
    save({
      classes: [
        {
          classId: "class_warlock",
          level,
          subclassId: "subclass_warlock_fiend",
          selections: { warlock_level_1_cantrips: cantrips, ...picks },
        },
      ],
    });

  const optionOf = (
    questions: ChoiceQuestion[],
    questionId: string,
    optionId: string,
  ) =>
    questions
      .find((q) => q.id === questionId)!
      .options.find((o) => o.id === optionId)!;

  it("marks Agonizing Blast for a warlock who does not know Eldritch Blast", () => {
    const questions = listChoiceQuestions(
      warlockSave(2, ["spell_minor_illusion", "spell_dancing_lights"]),
      snapshot,
    );

    expect(
      optionOf(questions, "warlock_level_2_invocations", "trait_invocation_agonizing_blast")
        .unmet,
    ).toEqual(["needs Eldritch Blast"]);
  });

  it("leaves Agonizing Blast available once Eldritch Blast is known", () => {
    const questions = listChoiceQuestions(
      warlockSave(2, ["spell_eldritch_blast", "spell_minor_illusion"]),
      snapshot,
    );

    expect(
      optionOf(questions, "warlock_level_2_invocations", "trait_invocation_agonizing_blast"),
    ).not.toHaveProperty("unmet");
  });

  it("gives Thirsting Blade at warlock 2 both its reasons, level first", () => {
    const questions = listChoiceQuestions(
      warlockSave(2, ["spell_eldritch_blast", "spell_minor_illusion"]),
      snapshot,
    );

    expect(
      optionOf(questions, "warlock_level_2_invocations", "trait_invocation_thirsting_blade")
        .unmet,
    ).toEqual(["needs Warlock level 5", "needs Pact of the Blade"]);
  });

  it("marks a Four Elements monk's higher-level disciplines at monk 3", () => {
    const questions = listChoiceQuestions(
      save({
        classes: [
          {
            classId: "class_monk",
            level: 3,
            subclassId: "subclass_monk_four_elements",
            selections: {},
          },
        ],
      }),
      snapshot,
    );

    expect(
      optionOf(questions, "monk_elements_level_3_discipline", "trait_discipline_clench_of_the_north_wind")
        .unmet,
    ).toEqual(["needs Monk level 6"]);
    expect(
      optionOf(questions, "monk_elements_level_3_discipline", "trait_discipline_fangs_of_the_fire_snake"),
    ).not.toHaveProperty("unmet");
  });

  it("puts no unmet key on a trait choice block's options", () => {
    const questions = listChoiceQuestions(
      save({ backgroundId: "background_acolyte" }),
      snapshot,
    );

    for (const question of questions.filter((q) => q.target === "trait")) {
      for (const option of question.options) {
        expect(option).not.toHaveProperty("unmet");
      }
    }
  });
});

describe("blockedOptionIds", () => {
  it("returns held options and options with unmet prerequisites, once each", () => {
    const question: ChoiceQuestion = {
      id: "warlock_level_2_invocations",
      target: "class",
      classId: "class_warlock",
      source: { kind: "class", id: "class_warlock", name: "Warlock" },
      prompt: "Warlock: choose 2",
      pickCount: 2,
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B", unmet: ["needs Eldritch Blast"] },
        { id: "c", label: "C", unmet: ["needs Warlock level 5"] },
      ],
      selected: [],
      held: ["c", "d"],
    };

    expect([...blockedOptionIds(question)].sort()).toEqual(["b", "c", "d"]);
  });
});
```

- [ ] **Step 2: Write the failing server test**

In `apps/server/src/routes/__tests__/levelUp.questions.test.ts`:

Change the engine type import to `import { blockedOptionIds, type ChoiceQuestion } from "@project/engine";` and, in `answerAll`, replace `.filter((id) => !question.held.includes(id) && !used.has(id))` with

```ts
      .filter((id) => !blockedOptionIds(question).includes(id) && !used.has(id))
```

and update its doc comment's first line to "Answers every question the way the wizard's picker would let a player: the first options that are not blocked (held, or with unmet prerequisites) and not already chosen for another question."

After the `druid` ledger helper, add:

```ts
/** a human Fiend warlock with the level-1 questions other than cantrips answered */
const humanWarlock = (warlockPicks: Record<string, string[]>): CharacterRow =>
  character({
    cha: 16,
    choices: {
      classSelections: { class_warlock: warlockPicks },
      traitSelections: {
        human_language_choice: ["elvish"],
        warlock_starting_skills: ["arcana", "deception"],
      },
      feats: [],
    },
  });

const warlock = (classLevel: number): LedgerRow => ({
  id: "ledger-1",
  characterId: "char-1",
  classId: "class_warlock",
  classLevel,
  subclassId: "subclass_warlock_fiend",
  position: 0,
});
```

and inside the `describe(...)`, after the cleric 3 → 4 test:

```ts
  it("marks Agonizing Blast for a warlock 1 -> 2 who never learned Eldritch Blast, and accepts what the picker allows (#81)", async () => {
    const { options, levelUp } = await setup(
      humanWarlock({
        warlock_level_1_cantrips: ["spell_minor_illusion", "spell_dancing_lights"],
      }),
      [warlock(1)],
    );

    const { choiceQuestions } = await options({ classId: "class_warlock" });
    const invocations = choiceQuestions.find(
      (question) => question.id === "warlock_level_2_invocations",
    );
    expect(
      invocations?.options.find(
        (option) => option.id === "trait_invocation_agonizing_blast",
      )?.unmet,
    ).toEqual(["needs Eldritch Blast"]);

    const result = await levelUp({
      targetClassId: "class_warlock",
      newTotalLevel: 2,
      ...answerAll(choiceQuestions),
    });
    expect(result.status).toBe(200);
  });
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm --filter @project/engine test choiceQuestions`
Expected: FAIL — `blockedOptionIds` is not exported (import error), so the whole file fails to load.
Run: `DATABASE_URL= pnpm --filter @project/server test levelUp.questions`
Expected: FAIL — the same import error (`blockedOptionIds` is not exported from `@project/engine`).

- [ ] **Step 4: Implement**

In `packages/engine/src/pipeline/choiceQuestions.ts`:

Add below the `./spellChoices.js` import:

```ts
import {
  prerequisiteContext,
  unmetPrerequisites,
  type UnmetPrerequisite,
} from "./optionPrerequisites.js";
```

Replace the `ChoiceOption` interface with:

```ts
export interface ChoiceOption {
  id: string;
  label: string;
  /**
   * Why the character cannot take this option yet - "needs Eldritch Blast",
   * "needs Warlock level 5" - from the same check save validation runs.
   * Absent when the option is available; only a class trait-choice option
   * ever carries it.
   */
  unmet?: string[];
}
```

After `choiceOptionLabel`, add:

```ts
/** How an unmet prerequisite reads in a picker: by name, not id. */
const unmetLabel = (
  unmet: UnmetPrerequisite,
  snapshot?: RuleSnapshotLookup,
): string => {
  switch (unmet.kind) {
    case "level":
      return `needs ${resolveClassDefinition(unmet.classId, snapshot)?.name ?? unmet.classId} level ${unmet.level}`;
    case "trait":
      return `needs ${choiceOptionLabel(unmet.traitId, snapshot)}`;
    case "spell":
      return `needs ${choiceOptionLabel(unmet.spellId, snapshot)}`;
  }
};

/**
 * The options of a question a player cannot pick: those already held, and
 * those whose prerequisites are unmet. What a picker disables, and what a
 * wizard drops from an answer it is keeping.
 */
export const blockedOptionIds = (
  question: Pick<ChoiceQuestion, "held" | "options">,
): string[] => [
  ...new Set([
    ...question.held,
    ...question.options
      .filter((option) => option.unmet !== undefined)
      .map((option) => option.id),
  ]),
];
```

In `classQuestions`: change `save.classes.flatMap((classState) => {` to `save.classes.flatMap((classState, classIndex) => {`; directly before that `return save.classes.flatMap(...)` expression, compute the trait spell picks once — turn the arrow body into a block:

```ts
): { question: ChoiceQuestion; rank: number }[] => {
  // every trait spell block's picks count as known for a prerequisite
  // (Agonizing Blast's Eldritch Blast), exactly as save validation counts them
  const traitSpellPicks = spells.entries
    .filter((entry) => entry.target === "trait")
    .flatMap((entry) => entry.selected);

  return save.classes.flatMap((classState, classIndex) => {
```

(close the extra block with `};` after the `flatMap(...)` call's closing `);`). Inside, after `traitNodes`, add:

```ts
    const prerequisites = prerequisiteContext(
      save,
      classIndex,
      traitSpellPicks,
      snapshot,
    );
```

and replace the trait node question's

```ts
            options: optionsOf(
              node.options.map((option) => option.id),
              snapshot,
            ),
```

with

```ts
            options: node.options.map(({ id, option }) => {
              const unmet = unmetPrerequisites(option, prerequisites);
              return {
                id,
                label: choiceOptionLabel(id, snapshot),
                ...(unmet.length > 0
                  ? { unmet: unmet.map((entry) => unmetLabel(entry, snapshot)) }
                  : {}),
              };
            }),
```

Update `classQuestions`' doc comment with one sentence: "An option whose prerequisites the character does not meet carries the reasons in `unmet` (optionPrerequisites.ts)."

- [ ] **Step 5: Run the tests, the suites and the typechecks**

Run: `pnpm --filter @project/engine test choiceQuestions` — PASS.
Run: `DATABASE_URL= pnpm --filter @project/server test levelUp.questions character.choices` — PASS.
Run: `pnpm test:all` — green. Typecheck engine, server and web — clean.

- [ ] **Step 6: Restore CRLF and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' packages/engine/src/pipeline/choiceQuestions.ts packages/engine/src/pipeline/__tests__/choiceQuestions.test.ts apps/server/src/routes/__tests__/levelUp.questions.test.ts
pnpm check:hygiene
git add packages/engine/src/pipeline/choiceQuestions.ts packages/engine/src/pipeline/__tests__/choiceQuestions.test.ts apps/server/src/routes/__tests__/levelUp.questions.test.ts
git commit -F - <<'EOF'
feat(engine): a choice question marks options whose prerequisites are unmet (#81)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Web — the picker disables a blocked option; both wizards prune blocked picks

**Files:**
- Modify: `apps/web/src/components/wizard/choices/ChoicePicker.tsx`
- Modify: `apps/web/src/store/wizardStore.ts`
- Modify: `apps/web/src/store/levelUpStore.ts`
- Test: `apps/web/src/components/wizard/choices/__tests__/ChoicePicker.test.tsx`
- Test: `apps/web/src/store/__tests__/wizardStore.test.ts`
- Test: `apps/web/src/store/__tests__/levelUpStore.test.ts`

**Interfaces:**
- Consumes: `ChoiceOption.unmet`, `blockedOptionIds` (Task 2), from `@project/engine`.
- Produces: `wizardStore.pruneChoiceAnswers(questions: Array<Pick<ChoiceQuestion, "id" | "held" | "options">>)` (was `"id" | "held"`); `ChoicesStepContainer` already passes whole questions, so no caller changes.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/components/wizard/choices/__tests__/ChoicePicker.test.tsx`, add after `describe("ChoicePicker's name filter", ...)`:

```tsx
describe("ChoicePicker - unmet prerequisites", () => {
  const invocations = buildQuestion({
    id: "warlock_level_2_invocations",
    target: "class",
    prompt: "Warlock: choose 2",
    pickCount: 2,
    options: [
      {
        id: "trait_invocation_agonizing_blast",
        label: "Agonizing Blast",
        unmet: ["needs Eldritch Blast"],
      },
      { id: "trait_invocation_armor_of_shadows", label: "Armor of Shadows" },
      {
        id: "trait_invocation_thirsting_blade",
        label: "Thirsting Blade",
        unmet: ["needs Warlock level 5", "needs Pact of the Blade"],
      },
    ],
  });

  it("disables an option with unmet prerequisites and says why", async () => {
    const { container } = await renderInto(
      <ChoicePicker question={invocations} selected={[]} onChange={() => {}} />,
    );

    const boxes = checkboxes(container);
    expect(boxes[0].disabled).toBe(true);
    expect(boxes[1].disabled).toBe(false);
    expect(boxes[2].disabled).toBe(true);
    expect(container.textContent).toContain("Agonizing Blast (needs Eldritch Blast)");
    expect(container.textContent).toContain(
      "Thirsting Blade (needs Warlock level 5, needs Pact of the Blade)",
    );
  });

  it("keeps a selected unmet option enabled so it can be unpicked", async () => {
    const { container } = await renderInto(
      <ChoicePicker
        question={invocations}
        selected={["trait_invocation_agonizing_blast"]}
        onChange={() => {}}
      />,
    );

    expect(checkboxes(container)[0].checked).toBe(true);
    expect(checkboxes(container)[0].disabled).toBe(false);
  });
});
```

In `apps/web/src/store/__tests__/wizardStore.test.ts`: the three existing `pruneChoiceAnswers([...])` calls pass `{ id, held }` objects — add `options: []` to each (`{ id: "keep_me", held: [], options: [] }` twice, `{ id: "fighter_starting_skills", held: ["insight"], options: [] }`), a signature change, not a behaviour change. Then add after `"drops a picked option that has since become held, leaving the rest"`:

```ts
    it("drops a picked option whose prerequisites are unmet, leaving the rest", () => {
      useWizardStore.setState({
        choiceAnswers: {
          warlock_level_2_invocations: {
            target: "class",
            classId: "class_warlock",
            selected: [
              "trait_invocation_agonizing_blast",
              "trait_invocation_armor_of_shadows",
            ],
          },
        },
      });

      useWizardStore.getState().pruneChoiceAnswers([
        {
          id: "warlock_level_2_invocations",
          held: [],
          options: [
            {
              id: "trait_invocation_agonizing_blast",
              label: "Agonizing Blast",
              unmet: ["needs Eldritch Blast"],
            },
            { id: "trait_invocation_armor_of_shadows", label: "Armor of Shadows" },
          ],
        },
      ]);

      expect(useWizardStore.getState().choiceAnswers).toEqual({
        warlock_level_2_invocations: {
          target: "class",
          classId: "class_warlock",
          selected: ["trait_invocation_armor_of_shadows"],
        },
      });
    });
```

In `apps/web/src/store/__tests__/levelUpStore.test.ts`, inside the describe that defines `question`, `begin`, `optionsResponse` and `flush`, after `"drops answers to questions the refetch no longer asks"`:

```ts
  it("drops a pick the refetched question marks unmet", async () => {
    await begin([question("warlock_level_2_invocations", "class")]);
    useLevelUpStore.getState().updateDraft({
      selectedTraits: { warlock_level_2_invocations: ["opt_a"] },
    });
    vi.mocked(apiClient).mockResolvedValueOnce(
      optionsResponse([
        question("warlock_level_2_invocations", "class", {
          options: [
            { id: "opt_a", label: "A", unmet: ["needs Eldritch Blast"] },
            { id: "opt_b", label: "B" },
          ],
        }),
      ]),
    );

    useLevelUpStore.getState().updateDraft({ featId: "feat_alert" });
    await flush();

    expect(useLevelUpStore.getState().draftPayload.selectedTraits).toEqual({
      warlock_level_2_invocations: [],
    });
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @project/web test ChoicePicker wizardStore levelUpStore`
Expected: FAIL — the picker enables the unmet options and shows no reasons; `pruneChoiceAnswers` keeps the unmet pick; the level-up draft keeps `["opt_a"]`.

- [ ] **Step 3: Implement**

`apps/web/src/components/wizard/choices/ChoicePicker.tsx` — change the import to `import { blockedOptionIds, type ChoiceQuestion } from "@project/engine";`. After the `shown` computation add

```tsx
  // held options and options with unmet prerequisites cannot be picked; one
  // that is already selected stays enabled so it can be unpicked
  const blocked = new Set(blockedOptionIds(question));
```

and in the option map replace

```tsx
          const disabled =
            !isSelected &&
            (selected.length >= question.pickCount || isHeld);
```

with

```tsx
          const disabled =
            !isSelected &&
            (selected.length >= question.pickCount || blocked.has(option.id));
```

and

```tsx
              {isHeld ? " (already known)" : ""}
```

with

```tsx
              {isHeld
                ? " (already known)"
                : option.unmet
                  ? ` (${option.unmet.join(", ")})`
                  : ""}
```

`apps/web/src/store/wizardStore.ts` — change its engine import `import type { Ability, ChoiceQuestion } from "@project/engine";` to `import { blockedOptionIds, type Ability, type ChoiceQuestion } from "@project/engine";`. Change the `pruneChoiceAnswers` declaration to

```ts
  /**
   * Keeps only answers to the questions still asked, and drops any picked
   * option a question now blocks - held (a skill the newly chosen background
   * grants) or with unmet prerequisites - so that question reads unanswered
   * again.
   */
  pruneChoiceAnswers: (
    questions: Array<Pick<ChoiceQuestion, "id" | "held" | "options">>,
  ) => void;
```

and in its implementation replace `const heldById = new Map(questions.map((question) => [question.id, question.held]));` with `const blockedById = new Map(questions.map((question) => [question.id, blockedOptionIds(question)]));`, and every later `heldById` with `blockedById`.

`apps/web/src/store/levelUpStore.ts` — import `blockedOptionIds` from `@project/engine` (the file imports only types from it today: change `import type { ChoiceQuestion, ClassProgression, LevelDecision } from "@project/engine";` to `import { blockedOptionIds, type ChoiceQuestion, type ClassProgression, type LevelDecision } from "@project/engine";`). In `pruneAnswers`, replace `picks.filter((pick) => !byId.get(id)!.held.includes(pick))` with `picks.filter((pick) => !blockedOptionIds(byId.get(id)!).includes(pick))`, and update its doc comment's "any pick that is now held" to "any pick the question now blocks (held, or with unmet prerequisites)".

- [ ] **Step 4: Run the tests, the suite, typecheck and lint**

Run: `pnpm --filter @project/web test ChoicePicker wizardStore levelUpStore ChoicesStep` — PASS.
Run: `pnpm test:all` — green. `pnpm --filter @project/web typecheck` — clean. `pnpm --filter @project/web lint` — only the two long-standing warnings (#65).

- [ ] **Step 5: Restore CRLF and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' apps/web/src/components/wizard/choices/ChoicePicker.tsx apps/web/src/store/wizardStore.ts apps/web/src/store/levelUpStore.ts apps/web/src/components/wizard/choices/__tests__/ChoicePicker.test.tsx apps/web/src/store/__tests__/wizardStore.test.ts apps/web/src/store/__tests__/levelUpStore.test.ts
pnpm check:hygiene
git add apps/web/src/components/wizard/choices/ChoicePicker.tsx apps/web/src/store/wizardStore.ts apps/web/src/store/levelUpStore.ts apps/web/src/components/wizard/choices/__tests__/ChoicePicker.test.tsx apps/web/src/store/__tests__/wizardStore.test.ts apps/web/src/store/__tests__/levelUpStore.test.ts
git commit -F - <<'EOF'
feat(web): pickers disable options whose prerequisites are unmet, and say why (#81)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Verification gates

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

Expected: all green; lint shows only the two long-standing warnings (#65). Baseline on `main` (0fc4b46): shared 230, engine 998, database 199, server 443, web 430 = 2300. Expected new tests: engine +7 (optionPrerequisites) +6 (choiceQuestions), server +1, web +2 (ChoicePicker) +1 (wizardStore) +1 (levelUpStore) — 2318. A package whose count moves by something else: find out why.

- [ ] **Step 2:** `git status` is clean; `git log --oneline main..HEAD` shows the spec, this plan and Tasks 1–3's three commits.

---

### Task 5: Hand check and backlog (controller, with the owner's permission)

**Files:**
- Modify: `docs/TODO_BACKLOG.md`

- [ ] **Step 1: Ask the owner before touching the database.** Then, with the dev servers running (`preview_start` `server` and `web`), create a human Fiend warlock through `POST /api/character` (omit `campaignId`; header `x-tester-id: dev-user-1`) with cantrips Minor Illusion and Dancing Lights, and open its level-up wizard for warlock 2. Confirm the Choices step shows "Agonizing Blast (needs Eldritch Blast)" and "Thirsting Blade (needs Warlock level 5, needs Pact of the Blade)" disabled, and that picking two available invocations commits (200). Then confirm a warlock created with Eldritch Blast can pick Agonizing Blast. Record what was seen. Re-seed the samples afterwards (`pnpm --filter @project/database db:seed:samples`). If the browser pane is hidden, see the memory note on hand checks with a hidden pane (set a 1280x800 viewport, retry the first click).

- [ ] **Step 2: Update `docs/TODO_BACKLOG.md`** (CRLF — restore endings afterwards):
  - In the 11g table, row 81 becomes: `| 81 | ✅ A choice question offers options whose prerequisites the character does not meet | Found by the final review of `feat/choice-step`, 2026-09-22; closed 2026-09-22 on `fix/choice-prerequisites`. See below. |`
  - Append to the `#81` bullet:
    ```
      **Closed 2026-09-22** on `fix/choice-prerequisites`. The prerequisite
      check save validation runs now lives in one engine module
      (`packages/engine/src/pipeline/optionPrerequisites.ts`), and
      `listChoiceQuestions` puts its reasons on each option
      (`ChoiceOption.unmet`: "needs Eldritch Blast", "needs Warlock level 5",
      "needs Pact of the Blade"). Both wizards' pickers show such an option
      disabled with its reasons, and both prune a pick whose prerequisite has
      gone (`blockedOptionIds`: held or unmet). Server messages are unchanged.
      Hand check: <what Step 1 saw, one sentence per scenario>.
    ```
  - Replace the 11g table's row 78 with: `| 78 | Hit points: creation writes none, level-up skips the Constitution modifier, and the engine's derived maximum is never shown | Found by `fix/levelup-correctness`'s hand check, 2026-09-21; widened 2026-09-22 while scoping `fix/choice-prerequisites`. Needs a decision first. See below. |`
  - Replace the `#78` bullet with:
    ```
    - **#78 — hit points are stored three inconsistent ways.** Found by
      `fix/levelup-correctness`'s hand check (Sister Aveline, CON +2, went
      from 24 to 29 maximum hit points where the wizard promised 31) and
      widened on 2026-09-22 while scoping `fix/choice-prerequisites`, which
      left it for its own branch:
      1. **Creation writes no hit points.** `POST /api/character` leaves
         `maxHp` and `currentHp` null, and level-up's
         `maxHp + payload.hpRoll` stays null, so a character made through the
         wizard never has hit points.
      2. **Level-up adds the raw roll only.** `applyLevelUp` adds
         `payload.hpRoll` to `maxHp` and `currentHp`, while the stored column
         is read everywhere as the final maximum (the sheet header, the
         server's heal clamp and long rest, the samples' hand-computed
         values), so the Constitution modifier is lost.
      3. **The engine's derived maximum is never what the sheet shows.**
         `DerivedStatEngine.calculateMaxHp` computes base rolled HP +
         CON × level + `MAX_HP` modifiers — Dwarven Toughness, Tough and
         Draconic Resilience, and a Constitution increase applied
         retroactively — but the server feeds it the stored final maximum as
         its base (`toCharacterSave`'s `baseRolledHp`), counting CON twice,
         and the web store never loads a base at all (`baseHpRolled` stays 1),
         so those three traits reach no displayed number.
      The fix needs a decision first: either `max_hp` stays the final number
      (creation writes hit die + CON, level-up adds roll + CON; small, and the
      three traits and retroactive CON stay unapplied), or `max_hp` becomes
      the base rolled HP and every displayed and clamping maximum comes from
      `calculateMaxHp` (rules-correct; touches the sheet, the server's heal
      and long rest, creation, level-up and the samples; medium).
    ```
  - In the Recommended sequence's Tier 1 table, after row 5d, add: `| 5e | **#78** — hit points: creation writes none, level-up skips CON, the engine's derived maximum is never shown | small or medium, needs a decision | Every character made through the wizard has no hit points, and every level-up loses the Constitution modifier — the sheet's most visible number. Decide what `max_hp` means first (final vs. base rolled with a derived maximum); see the #78 bullet in 11g. |`

- [ ] **Step 3: Restore CRLF, check and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' docs/TODO_BACKLOG.md
pnpm check:hygiene
git add docs/TODO_BACKLOG.md
git commit -F - <<'EOF'
docs: close #81; widen #78 to the three hit-point faults

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

After the merge, update the backlog's header status paragraph and the baseline test counts on `main`, as for earlier branches.
