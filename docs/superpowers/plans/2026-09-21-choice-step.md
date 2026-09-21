# Choice Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players answer every choice block — class progression picks and trait choice blocks — in the character-creation wizard and the level-up wizard; the server requires new answers and refuses to change stored ones.

**Architecture:** One engine function, `listChoiceQuestions(save, snapshot)`, defines what a question is (id, where its answer is stored, options with labels, what is already held). The web creation wizard runs it client-side on a draft save against the rule snapshot; the server runs it to require answers at creation and for questions new at a level-up, and to lock stored answers. Both wizards render questions with one shared picker. The level-up wizard stops discarding the server's full decision list.

**Tech Stack:** TypeScript, pnpm + turbo monorepo; Vitest; zod (`@project/shared`); `@project/engine`; Express (`apps/server`); React + Zustand + react-query + Tailwind (`apps/web`).

**Spec:** `docs/superpowers/specs/2026-09-21-choice-step-design.md`

## Global Constraints

- Line endings: the working tree is CRLF with `core.autocrlf=true`; git normalises endings, so `git diff`/`git show` cannot reveal them. Measure a file's endings with node before editing (count `\r\n` vs bare `\n`) and keep each file as it was; Edit/Write emit LF — restore CRLF with node `split(/\r?\n/).join('\r\n')`. New files: CRLF unless the directory's neighbours are LF.
- CI has no `.env` and no `DATABASE_URL`: nothing a test imports may require it at load. Run server and database tests also as `DATABASE_URL= pnpm --filter <pkg> test`.
- Never run `db:migrate`, `db:seed*`, `db:import-pack` or anything else that writes to a database. The hand check (Task 7) is run by the controller with the owner's permission.
- Typecheck per package: `npx tsc --noEmit` in `packages/*` and `apps/server`; `npx tsc -b` in `apps/web`. Never trust turbo's typecheck cache.
- Web component tests use `createRoot` from `react-dom/client` + `act` from `react` (see `apps/web/src/components/sheet/__tests__/ArmorClassWidget.test.tsx`); `@testing-library/react` is not installed.
- Rules come only from the pack: engine tests use `corePackLookup()` (`packages/engine/src/pipeline/__tests__/corePackFixture.ts`), web tests `packRuleSnapshot()` (`apps/web/src/store/__tests__/packFixture.ts`), server tests the real assembled pack as `character.choices.test.ts` does.
- Error strings, verbatim: level-up lock `Invalid character choices: <id> already answered`; a missing answer reuses the existing issue message `<name>: nothing selected for <id>`, surfaced at level-up as `Invalid character choices: <messages joined by "; ">` and at creation as the existing 400 `{ error: "Invalid character choices.", issues: [...] }`.
- `pnpm test:all` (hygiene + all five packages) must be green at the end of every task. Do not pass turbo flags such as `--force` to it (they reach vitest).
- Commit messages end with your own session's attribution trailer. Do not push.
- Touch only the files a task lists (plus test files it names). A failure in any other file: stop and report NEEDS_CONTEXT.

---

### Task 1: Engine — `listChoiceQuestions` and `choiceOptionLabel`

**Files:**
- Create: `packages/engine/src/pipeline/choiceQuestions.ts`
- Create: `packages/engine/src/pipeline/grantSources.ts` (helpers moved out of the bootstrapper)
- Modify: `packages/engine/src/pipeline/characterBootstrapper.ts` (import the moved helpers instead of defining them)
- Modify: `packages/engine/src/pipeline/index.ts` (export `choiceQuestions.js`)
- Test: `packages/engine/src/pipeline/__tests__/choiceQuestions.test.ts`

**Interfaces:**
- Produces (from `@project/engine`):

```ts
export interface ChoiceOption { id: string; label: string }
export type ChoiceSourceKind = "race" | "subrace" | "background" | "class" | "feat";
export interface ChoiceQuestion {
  id: string;
  target: "class" | "trait";
  classId?: string;
  source: { kind: ChoiceSourceKind; id: string; name: string };
  prompt: string;
  pickCount: number;
  options: ChoiceOption[];
  selected: string[];
  held: string[];
}
export const listChoiceQuestions: (save: CharacterSave, snapshot?: RuleSnapshotLookup) => ChoiceQuestion[];
export const choiceOptionLabel: (optionId: string, snapshot?: RuleSnapshotLookup) => string;
```

- [ ] **Step 1: Move the grant-source helpers.** Move `isTraitChoice`, `isSpellChoice`, `unlockedGrants`, `classTraitIds`, `raceTraitIds`, `backgroundTraitIds`, `featTraitIds` (and the `ClassState` type alias they use) from `characterBootstrapper.ts` into `grantSources.ts`, exported, unchanged in behaviour. Add `subraceTraitIds(race, snapshot)` returning only the subrace's `grantedTraitIds`, and `baseRaceTraitIds(race, snapshot)` returning only the base race's; keep `raceTraitIds` as their concatenation. Import them back into the bootstrapper. Run `pnpm --filter @project/engine test` — green, no behaviour change. Do not export `grantSources.js` from `pipeline/index.ts` (internal).

- [ ] **Step 2: Failing tests** in `choiceQuestions.test.ts` using `corePackLookup()` and a small `save()` builder (attributes all 10, `hp: { current: 1, temporary: 0, baseRolledHp: 1, hitDiceSpent: {} }`, `feats: []`, `traitSelections: {}`):
  - A human fighter 1 with the acolyte background: questions come out in source order race → background → class; the human's language block has `target: "trait"`, `source.kind: "race"`, `pickCount: 1`, options labelled from `LANGUAGE_DICTIONARY` (e.g. `{ id: "dwarvish", label: "Dwarvish" }`); the fighter's fighting-style node has `target: "class"`, `classId: "class_fighter"`, options labelled by trait name; `selected` is `[]` everywhere.
  - Read the pack to find the real ids first (`packages/database/data/packs/core_2014_pack/`: races, backgrounds, classes, traits) — use the real node and block ids in assertions.
  - A half-elf: its ability-score modifier block appears with `pickCount: 2` and ability options labelled `"Strength"` … `"Wisdom"` (whatever the block offers), plus Skill Versatility and the extra language, all `source.kind` `"race"` or `"subrace"` as the pack grants them.
  - Stored answers come back in `selected` (class node via `classes[0].selections`, trait block via `traitSelections`).
  - `held`: a character whose background already grants a skill that a class skill block offers lists that skill in the class block's `held`, and not its own picks.
  - Spell-choice class nodes are never questions (pick a class whose level-1 track has a `spell_choice` grant if the pack has one; otherwise assert no question has an id of a `spell_choice` node for a wizard 1).
  - `choiceOptionLabel`: trait id → trait name; `"elvish"` → `"Elvish"`; a tool id → its `TOOL_DICTIONARY` name; `"STR"` → `"Strength"`; `"sleight_of_hand"` → `"Sleight of hand"`; an unknown id is humanised the same way.

- [ ] **Step 3: Run them to verify they fail** (`pnpm --filter @project/engine test choiceQuestions`) — module not found.

- [ ] **Step 4: Implement `choiceQuestions.ts`.**

```ts
const ABILITY_NAMES: Record<string, string> = {
  STR: "Strength", DEX: "Dexterity", CON: "Constitution",
  INT: "Intelligence", WIS: "Wisdom", CHA: "Charisma",
};

const humanise = (id: string): string => {
  const words = id.replace(/^(trait|skill|tool|lang)_/, "").split("_").filter(Boolean);
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const choiceOptionLabel = (optionId: string, snapshot?: RuleSnapshotLookup): string =>
  resolveTraitDefinition(optionId, snapshot)?.name ??
  LANGUAGE_DICTIONARY[optionId]?.name ??
  TOOL_DICTIONARY[optionId]?.name ??
  ABILITY_NAMES[optionId] ??
  humanise(optionId);
```

  `listChoiceQuestions(save, snapshot)`:
  1. Source map, in order: `baseRaceTraitIds` → `{ kind: "race", id: baseRaceId, name: race.name }`; `subraceTraitIds` → `"subrace"` (subrace name); `backgroundTraitIds` → `"background"`; for each class in `save.classes` order, `classTraitIds(classState, index === 0)` → `"class"` (class name); `featTraitIds` → `"feat"` (per feat, feat name). The first source to grant a trait id owns it.
  2. Class questions: for each class (ledger order), `unlockedGrants(classState, snapshot).filter(isTraitChoice)` → `{ id: grant.nodeId, target: "class", classId, source: class, prompt: \`${className}: choose ${grant.pickCount} (${humanise(grant.nodeId)})\`, pickCount: grant.pickCount, options: grant.options.map(traitIdOfOption).map(id => ({ id, label: choiceOptionLabel(id, snapshot) })), selected: classState.selections[grant.nodeId] ?? [], held: [] }`.
  3. Trait questions: `const traits = CharacterBootstrapper.compileActiveTraits(save, snapshot)`, `const selections = CharacterBootstrapper.resolveSelections(save)`. For `ProficiencyExtractor.resolveChoices(traits, selections)`: options = the block's own `options` if non-empty, else `listProficiencyOptions(category)`; `held` = options not in `resolution.availableOptions` and not in `resolution.accepted`; prompt `\`${traitName}: choose ${chooseAmount} ${category.replace("_", " ")}\``. For `ModifierExtractor.resolveChoices(traits, selections)`: options = the block's `options`; `held: []`; prompt `\`${traitName}: choose ${chooseAmount}\``. Find each block's definition by walking `traits` (`trait.proficiencies?.choices` / `trait.modifiers?.choices`, matching `choice.id === resolution.choiceId`). `selected` = `save.traitSelections[choiceId] ?? []`. Source = the source map's entry for `resolution.traitId`. `compileActiveTraits` draws only from these same sources, so every trait has one; if a trait somehow has none, skip its questions, and assert in a test that every question returned has a source.
  4. Return class questions and trait questions merged and sorted by source order (race, subrace, background, class in ledger order, feat), keeping authoring order within a source (stable sort on a source rank).

- [ ] **Step 5: Export** from `pipeline/index.ts`: `export * from "./choiceQuestions.js";`. Run the tests to green, then `pnpm test:all`, engine `npx tsc --noEmit`.

- [ ] **Step 6: Commit** — `feat(engine): listChoiceQuestions says what a character must answer (#68)`

---

### Task 2: Server — creation requires every answer

**Files:**
- Modify: `apps/server/src/routes/character.ts` (the `POST /` choices block, ~lines 183–222)
- Test: `apps/server/src/routes/__tests__/character.choices.test.ts`, `apps/server/src/routes/__tests__/character.test.ts` (fixtures only)

**Interfaces:**
- Consumes: `listChoiceQuestions`, `ChoiceQuestion` from `@project/engine` (Task 1).
- Produces: `POST /api/character` rejects any unanswered question with 400 `{ error: "Invalid character choices.", issues: string[] }`.

- [ ] **Step 1: Failing tests** in `character.choices.test.ts` (follow its existing creation tests and mocks):
  - creating a human fighter with **no `choices`** returns 400 and `issues` contains one `"…: nothing selected for <id>"` message per question (assert the human language block's id and the fighter fighting-style node's id appear);
  - the same payload with every question answered (valid picks from the pack) returns 201 and stores those choices;
  - a payload answering all but one question returns 400 naming only that one.

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement.** Always load the snapshot and validate (drop the `if (payload.choices)` guard); build the save once; issues = `CharacterBootstrapper.collectChoiceIssues(save, snapshot)` messages plus, for every `listChoiceQuestions(save, snapshot)` question with `selected.length === 0`, the message `\`${question.source.name}: nothing selected for ${question.id}\``. Return the existing 400 shape when any.

- [ ] **Step 4: Fix fallout.** Existing creation tests in `character.test.ts` / `character.choices.test.ts` that post without choices now get 400: give their payloads complete, valid `choices` (a shared `completeChoicesFor…` fixture in the test file is fine). Do not weaken any assertion; if a test's intent was "creation without choices succeeds", change it to assert the new 400 and say so in the report.

- [ ] **Step 5: Run** server tests (also with `DATABASE_URL=`), `pnpm test:all`, server `npx tsc --noEmit`.

- [ ] **Step 6: Commit** — `fix(server): character creation requires an answer to every choice (#68)`

---

### Task 3: Server — level-up requires new answers and locks stored ones

**Files:**
- Modify: `apps/server/src/controllers/characterController.ts` (`applyLevelUp`, choice section ~lines 92–215)
- Test: `apps/server/src/routes/__tests__/character.choices.test.ts`

**Interfaces:**
- Consumes: `listChoiceQuestions` (Task 1); `toCharacterSave`, `readStoredChoices` (`apps/server/src/services/characterSave.ts`).
- Produces: level-up errors `Invalid character choices: <id> already answered` and `Invalid character choices: <name>: nothing selected for <id>`.

- [ ] **Step 1: Failing tests** in `character.choices.test.ts` using its level-up harnesses (read them first; `setupLevelUp` takes one options object):
  - **lock:** a stored character whose `choices.traitSelections` already answers a block; a level-up payload sending `traitSelections` for that block id → 400, message `Invalid character choices: <blockId> already answered`, nothing written. Same for a stored `classSelections[classId][nodeId]` re-sent in `selectedTraits`.
  - **required:** a level that unlocks a class `trait_choice` node (find one in the pack — e.g. a fighter's archetype-level or a class whose next level grants a pick) sent **without** an answer → 400 with `nothing selected for <nodeId>`. If the resolver's own `validateLevelUpPayloadFromResolver` already rejects this with its own message, assert the request is rejected and nothing is written, and add a second case the resolver does not cover: a feat whose trait carries a choice block (reuse the `withFeatChoiceBlock()` fixture already in the file) taken without answering its block → 400 `nothing selected for <blockId>`.
  - **open question may be answered:** a stored character with an unanswered creation-time block levels up sending an answer for it → 200 and the answer is stored.
  - **open question not required:** the same character levelling up without answering it → 200.

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement**, all before the transaction's first write:
  - Load the snapshot unconditionally (remove the `if (isMulticlassDip || selectedTraits || traitSelections || payload.featId)` guard around `getCachedRuleSnapshot()`; keep the one `loadedSnapshot` narrowing).
  - **Lock** (right after `validateLevelUpPayloadFromResolver`): for each `nodeId` in `selectedTraits`, if `storedChoices.classSelections[targetClassId]?.[nodeId]?.length` → throw `\`Invalid character choices: ${nodeId} already answered\``; for each block id in `traitSelections`, if `storedChoices.traitSelections[id]?.length` → same message with the block id.
  - Build `ledgerAfterLevel` unconditionally (move it out of the `if (selectedTraits || traitSelections || payload.featId)` block) and run choice validation always. After `collectChoiceIssues`, compute `before = listChoiceQuestions(toCharacterSave(character, existingClasses, storedChoices), snapshot)` and `after = listChoiceQuestions(toCharacterSave(character, ledgerAfterLevel, mergedChoices), snapshot)`; `const beforeIds = new Set(before.map(q => q.id))`; missing = `after.filter(q => !beforeIds.has(q.id) && q.selected.length === 0)`; add `\`${q.source.name}: nothing selected for ${q.id}\`` for each to the issue messages, and throw the existing `Invalid character choices: …` error when any.
  - Keep the per-key merge (the lock now guarantees it never overwrites).

- [ ] **Step 4: Fix fallout** in `character.test.ts` level-up tests only if the unconditional snapshot load or new checks break them (their snapshot mock already exists); do not weaken assertions.

- [ ] **Step 5: Run** server tests (also `DATABASE_URL=`), `pnpm test:all`, server typecheck.

- [ ] **Step 6: Commit** — `fix(server): level-up requires new answers and never changes a stored one (#68)`

---

### Task 4: Web — shared choice picker

**Files:**
- Create: `apps/web/src/components/wizard/choices/ChoicePicker.tsx`
- Create: `apps/web/src/components/wizard/choices/ChoiceQuestionList.tsx`
- Test: `apps/web/src/components/wizard/choices/__tests__/ChoicePicker.test.tsx`

**Interfaces:**
- Consumes: `ChoiceQuestion` from `@project/engine`.
- Produces:

```ts
export const ChoicePicker: (props: {
  question: ChoiceQuestion;
  selected: string[];
  onChange: (selected: string[]) => void;
}) => JSX.Element;

export const isQuestionAnswered: (question: ChoiceQuestion, selected: string[] | undefined) => boolean;
// true when selected has exactly question.pickCount entries

export const ChoiceQuestionList: (props: {
  questions: ChoiceQuestion[];
  answers: Record<string, string[]>;
  onChange: (questionId: string, selected: string[]) => void;
}) => JSX.Element;
```

- [ ] **Step 1: Failing tests** (`createRoot` + `act`): a question with `pickCount: 2` and four options renders four checkboxes and a `0 / 2` counter; checking two calls `onChange` with both ids and (re-rendered with them selected) disables the two unchecked boxes and shows `2 / 2`; unchecking re-enables; an option in `held` renders disabled with the text `already known`; `ChoiceQuestionList` groups questions under their `source.name` headings in the given order; `isQuestionAnswered` is true only at exactly `pickCount`.

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement.** `ChoicePicker`: a `<fieldset>` with `<legend>` = `question.prompt`, the counter `{selected.length} / {question.pickCount}`, and one `<label><input type="checkbox" …/> {option.label}</label>` per option; an unchecked box is disabled when `selected.length >= pickCount` or the option is in `held` (append `(already known)` to its label). Toggling adds/removes the id preserving the order clicked. `ChoiceQuestionList`: group consecutive questions by `source.id`, render an `<h3>` with `source.name` then a `ChoicePicker` per question. Tailwind classes matching `AsiFeatStep.tsx` (border, rounded, `font-mono` inherited).

- [ ] **Step 4: Run** web tests, `npx tsc -b` in `apps/web`, web lint (no new warnings), `pnpm test:all`.

- [ ] **Step 5: Commit** — `feat(web): a shared picker for choice questions (#68)`

---

### Task 5: Web — the creation wizard's Choices step

**Files:**
- Create: `apps/web/src/utils/draftSave.ts`
- Create: `apps/web/src/components/wizard/ChoicesStepContainer.tsx`
- Modify: `apps/web/src/store/wizardStore.ts` (answers state and actions)
- Modify: `apps/web/src/utils/compileCharacter.ts` (send `choices`)
- Modify: `apps/web/src/components/wizard/CharacterCreationWizard.tsx` (step list, render the container)
- Modify: `apps/web/src/components/wizard/BackgroundStepContainer.tsx` (Next → step 6, label)
- Modify: `apps/web/src/components/wizard/ReviewStepContainer.tsx` (it becomes step 7; Back → 6)
- Modify: `apps/web/src/api/client.ts` (a full-snapshot response type)
- Test: `apps/web/src/utils/__tests__/draftSave.test.ts`, `apps/web/src/components/wizard/__tests__/ChoicesStepContainer.test.tsx`, and the existing tests for `compileCharacter` / `wizardStore` if present

**Interfaces:**
- Consumes: `listChoiceQuestions`, `ChoiceQuestion` (Task 1); `ChoiceQuestionList`, `isQuestionAnswered` (Task 4).
- Produces:

```ts
// wizardStore
choiceAnswers: Record<string, { target: "class" | "trait"; classId?: string; selected: string[] }>;
setChoiceAnswer: (question: ChoiceQuestion, selected: string[]) => void;
pruneChoiceAnswers: (questionIds: string[]) => void;

// draftSave.ts
export const buildDraftSave: (state: WizardState) => CharacterSave | null; // null until race and class are chosen
export const choicesFromAnswers: (answers: WizardState["choiceAnswers"]) => CharacterChoices;
```

- [ ] **Step 1: Failing tests.**
  - `draftSave.test.ts`: `buildDraftSave` returns `null` without a race or class; otherwise `race: { baseRaceId, subraceId, hasSubraces: raceRequiresSubrace }`, one class `{ classId, level: 1, subclassId? , selections }` whose selections come from `choiceAnswers` entries with `target: "class"` and that `classId`, `backgroundId` only for a PRESET background, `traitSelections` from `target: "trait"` entries, `feats: []`, attributes from `baseAbilityScores` lower-cased. `choicesFromAnswers` splits answers into `classSelections[classId][id]` / `traitSelections[id]`, `feats: []`.
  - `ChoicesStepContainer.test.tsx` (mock `fetchRulesSnapshot` / the query to return `{ snapshot: packRuleSnapshot() }`; set store state directly): for a human fighter it lists the language block and the fighting-style node; Next is disabled until each is answered, then enabled; with a store holding an answer for a question id that is no longer asked, rendering prunes it; a race+class with no questions shows `Nothing to choose` with Next enabled.
  - `compileCharacterPayload` includes `choices` equal to `choicesFromAnswers(state.choiceAnswers)`.

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement.**
  - `client.ts`: add `export type FullRulesSnapshotResponse = { version: number; loadedAt: number; snapshot: RuleSnapshot }` and `fetchFullRulesSnapshot(scope)` using the same endpoint (the server already returns the whole snapshot; the existing narrow type stays for its current callers).
  - `wizardStore`: `choiceAnswers: {}` initially; `setChoiceAnswer(question, selected)` stores `{ target: question.target, classId: question.classId, selected }` under `question.id`; `pruneChoiceAnswers(ids)` keeps only those keys (no state change when nothing is removed, to avoid render loops); `canProceed` case numbers: Background stays 5, add `case 6: return true;` (the Choices container gates its own Next), Finalize becomes 7 — update every `currentStep` case and `setStep` literal accordingly.
  - `ChoicesStepContainer` (active when `currentStep === 6`, same guard pattern as `BackgroundStepContainer`): `useQuery({ queryKey: ["reference", "rules-snapshot-full", campaignId], queryFn: () => fetchFullRulesSnapshot({ campaignId }), staleTime: 30 min, enabled: isActiveStep })`; `const save = buildDraftSave(state)`; `questions = useMemo(() => save && data ? listChoiceQuestions(save, data.snapshot) : [], …)` (answers only fill `selected`; a class `trait_choice` pick can unlock further questions, which is correct and settles because the save is rebuilt from the store on each answer); `useEffect(() => pruneChoiceAnswers(questions.map(q => q.id)), [questions])`; render `<ChoiceQuestionList questions answers={…selected by id} onChange={(id, sel) => setChoiceAnswer(questions.find(q => q.id === id)!, sel)} />` or `Nothing to choose` when empty; Back → 5; Next → 7, disabled unless `questions.every(q => isQuestionAnswered(q, answers[q.id]?.selected))`. Match the container's inline-style look of its neighbours.
  - `CharacterCreationWizard`: steps `{6, "Choices"}`, `{7, "Finalize"}`; render `<ChoicesStepContainer />` between Background and Review.
  - `compileCharacterPayload`: add `choices: choicesFromAnswers(state.choiceAnswers)`.

- [ ] **Step 4: Run** web tests, `tsc -b`, lint, `pnpm test:all`.

- [ ] **Step 5: Commit** — `feat(web): the creation wizard asks every choice question (#68)`

---

### Task 6: Web — the level-up wizard's Choices step

**Files:**
- Modify: `packages/engine/src/types/progression.ts` (`LevelDecision.source?`)
- Modify: `apps/web/src/store/levelUpStore.ts` (read `nextLevel.decisions`)
- Modify: `apps/web/src/components/wizard/LevelUpWizard.tsx` (one step per decision type)
- Modify: `apps/web/src/components/wizard/WizardStepRouter.tsx` (Choices and spell steps)
- Modify: `apps/web/src/utils/wizardValidation.ts` (`isStepComplete` cases)
- Create: `apps/web/src/components/wizard/steps/ChoicesStep.tsx`
- Create: `apps/web/src/components/wizard/steps/SpellChoiceUnsupportedStep.tsx`
- Test: `apps/web/src/store/__tests__/levelUpStore.test.ts` (create if absent), `apps/web/src/utils/__tests__/wizardValidation.test.ts` (create if absent), `apps/web/src/components/wizard/steps/__tests__/ChoicesStep.test.tsx`

**Interfaces:**
- Consumes: `ChoicePicker`, `isQuestionAnswered` (Task 4); `choiceOptionLabel`, `ChoiceQuestion` (Task 1); `fetchFullRulesSnapshot` (Task 5).
- Produces: `LevelDecision.source?: "trait_choice_block"`; `decisionToQuestion(decision: LevelDecision, className: string, snapshot?: RuleSnapshotLookup): ChoiceQuestion` exported from `ChoicesStep.tsx` (target `"trait"` when `source === "trait_choice_block"`, else `"class"` with the level-up's `targetClassId`).

- [ ] **Step 1: Failing tests.**
  - `levelUpStore.test.ts` (mock `apiClient`): a response whose `nextLevel.decisions` holds a `trait_selection` (with `source: "trait_choice_block"`), a `trait_selection` without source, a `spell_selection` and an `asi_or_feat` keeps all four in `progressionContext.decisions` with their ids, options, quantity and source; a `subclass` decision without options gets the response's `subclasses` ids as options.
  - `wizardValidation.test.ts`: `isStepComplete("trait_selection", payload, decisions)` is true only when every `trait_selection` decision has exactly `quantity ?? 1` picks in `payload.traitSelections[id]` (trait block) or `payload.selectedTraits[id]` (otherwise); `isStepComplete("spell_selection", …)` is false.
  - `ChoicesStep.test.tsx`: renders one picker per `trait_selection` decision with labels from `packRuleSnapshot()` (mock the snapshot query); picking writes to `draftPayload.selectedTraits[id]` or `draftPayload.traitSelections[id]` through `updateDraft`, preserving other keys.

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement.**
  - `progression.ts`: add `source?: "trait_choice_block";` to `LevelDecision`; make sure `DecisionType` includes `"trait_selection"` and `"spell_selection"` (add them if missing).
  - `levelUpStore`: type `nextLevel.decisions: Array<LevelDecision>` in `LevelUpOptionsResponse` (keep `decisionTypes` in the type, unused); `progressionContext.decisions = nextLevel.decisions.map(d => d.type === "subclass" && !d.options?.length ? { ...d, options: subclasses.map(s => s.id) } : d)`; fall back to the old `mapServerDecisions(nextLevel.decisionTypes, subclasses)` only when `decisions` is absent. `validateAndSubmit` already sends `selectedTraits` / `traitSelections` from the draft.
  - `LevelUpWizard`: push each decision **type** once, in first-seen order (several `trait_selection` decisions → one step).
  - `WizardStepRouter`: `case "trait_selection": return <ChoicesStep decisions={decisions.filter(d => d.type === "trait_selection")} />;` and `case "spell_selection": return <SpellChoiceUnsupportedStep />;` (text: `Spell choices are not supported by the wizard yet (#79). This level cannot be completed here.`).
  - `ChoicesStep`: loads the full snapshot with `fetchFullRulesSnapshot` (campaign scope from the level-up's context if available, else `{}`), maps decisions with `decisionToQuestion` (`prompt` = `decision.description`, `pickCount` = `quantity ?? 1`, `options` = `(decision.options ?? []).map(id => ({ id, label: choiceOptionLabel(id, snapshot) }))`, `held: []`, `selected` from the draft, `source: { kind: "class", id: targetClassId, name: className }`, where `className` is `snapshot.classesById[targetClassId]?.name ?? targetClassId`), renders `ChoicePicker` per question, and on change calls `updateDraft({ traitSelections: { ...draft.traitSelections, [id]: sel } })` or `updateDraft({ selectedTraits: { ...draft.selectedTraits, [id]: sel } })`.
  - `isStepComplete`: the two new cases as tested.

- [ ] **Step 4: Run** web and engine tests, `tsc -b` (web), engine `tsc --noEmit`, lint, `pnpm test:all`.

- [ ] **Step 5: Commit** — `feat(web): the level-up wizard asks its choice questions (#68)`

---

### Task 7: Hand check, backlog, README

Steps 1–2 need the running app and the owner's database: the controller runs them.

- [ ] **Step 1: Hand check (owner's permission first).** In the running app: create a half-elf fighter with a preset background, answering every question on the Choices step (Next stays disabled until all are answered); the created character's `choices` hold every answer and the sheet shows the picked skills and language. Level a sample character through a level whose decisions include a `trait_selection` and confirm the Choices step appears and the answer is stored. Confirm cleric 3 → 4 shows the #79 spell step and blocks submit. Re-seed the samples afterwards.
- [ ] **Step 2: Record results.**
- [ ] **Step 3: Backlog** — `docs/TODO_BACKLOG.md` (CRLF): row 5 / #68 (choice half) ✅ closed 2026-09-21 on `feat/choice-step` with the hand-check result; the two inherited findings: re-answering closed (locked), custom backgrounds still open (record as its own item if not already); #79 unchanged but note the wizard now names it; header test count and branch. **README** — the level-up and creation descriptions mention that both wizards ask every choice question and that answers are required and locked. `pnpm check:hygiene` passes.
- [ ] **Step 4: Commit** — `docs: close #68's choice half`
