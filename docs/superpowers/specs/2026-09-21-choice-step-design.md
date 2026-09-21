# Choice step — players answer choice blocks in both wizards

**Date:** 2026-09-21
**Branch:** `feat/choice-step`
**Backlog items:** #68 (choice half — "Branch B"); the two findings row 5
inherits (custom backgrounds; re-answering). #79 (spells) is out of scope.

## Problems

Storage for choices landed in `characters.choices`
(`{ classSelections, traitSelections, feats }`), but nothing collects answers
from a player:

- **Character creation.** `wizardStore` has no choice state and
  `compileCharacterPayload` never sets `payload.choices`. `POST /api/character`
  validates choices only when they are sent, so today every character is
  created with every question unanswered. The pack has 32 choice blocks a
  character can meet at creation or later: 31 proficiency blocks (6 language
  blocks over the language roster, 7 tool blocks and 14 skill blocks with
  listed options, 4 skill blocks over the skill roster) and the half-elf's
  ability-score block (5 options). Class progression nodes (e.g. a fighting
  style) are questions too; they answer into `classSelections`.
- **Level-up.** The server's level-up options already return every decision
  (`nextLevel.decisions`, including `trait_selection` and `spell_selection`),
  but `levelUpStore.mapServerDecisions` keeps only `subclass` and
  `asi_or_feat`. `WizardStepRouter` has no case for the rest ("Unhandled Step
  Type"), and the wizard never sends `selectedTraits` or `traitSelections`.
- **Missing answers pass.** `CharacterBootstrapper.collectChoiceIssues`
  deliberately excludes `missing_selection`.
- **Re-answering.** `applyLevelUp` merges picks per key, so a level-up can
  silently overwrite an answer given at creation or an earlier level.

## Decisions (owner, 2026-09-21)

1. Scope: choices only. Spells (#79) get their own branch — `addedSpells` is
   validated but stored nowhere, and no endpoint lists a class's spells.
   Custom backgrounds' choice blocks stay deferred.
2. Answers are required: both wizards block progress until every question is
   answered; the server rejects a missing answer at creation (all questions)
   and at level-up (questions new at that level).
3. Answers are locked: a level-up may answer new or still-open questions but
   never re-answer a stored one.
4. One engine function defines "a question"; the web creation wizard runs it
   client-side, the server uses it to enforce 2 and 3.

## Design

### Engine — `listChoiceQuestions(save, snapshot)`

New module `packages/engine/src/pipeline/choiceQuestions.ts`, exported from
`@project/engine`:

```ts
export interface ChoiceOption { id: string; label: string }
export interface ChoiceQuestion {
  id: string;                         // nodeId (class) or block id (trait)
  target: "class" | "trait";          // classSelections vs traitSelections
  classId?: string;                   // set when target is "class"
  source: { kind: "race" | "subrace" | "background" | "class" | "feat"; id: string; name: string };
  prompt: string;                     // e.g. "Choose 2 skills"
  pickCount: number;
  options: ChoiceOption[];
  selected: string[];                 // the save's stored answer, [] if none
  held: string[];                     // options already held at an equal or better level
}
export const listChoiceQuestions: (save: CharacterSave, snapshot: RuleSnapshotLookup) => ChoiceQuestion[];
```

- Class questions: the class progression selection grants the character has
  unlocked, walked the way `collectSaveIssues`'s "choice nodes" region walks
  them (same `pickCount`, same `options` via `traitIdOfOption`). Extract that
  walk into a shared helper rather than duplicating it.
- Trait questions: every proficiency choice block and modifier choice block on
  the character's active traits (race, subrace, background, classes, feats —
  whatever `compileActiveTraits` yields). Proficiency options come from the
  block's own list or the category roster (`listProficiencyOptions`);
  modifier options from the block's `options`.
- Order: race, subrace, background, class (ledger order), feat; within a
  source, authoring order. Traits a subclass track grants are credited to
  their class (the engine merges the two tracks). Spell-choice class nodes
  are not questions here (spells are #79). Deterministic, so the UI is stable.
- Labels: trait options by `traitsById[id].name`; languages and tools by
  `LANGUAGE_DICTIONARY` / `TOOL_DICTIONARY` names; skills by humanising the
  `SKILL_MAP` key; abilities by their full name; otherwise the id humanised (`sleight_of_hand` → "Sleight of hand").
- Options are the block's full roster. `held` lists the options the
  character already holds at an equal or better level from other sources (the
  same rule as `ProficiencyExtractor`'s `isWorthTaking`, excluding the
  question's own answer), so the UI can disable them; validation
  (`redundant_selection`) still refuses such a pick server-side.

### Server — creation

`POST /api/character`: `choices` defaults to `emptyCharacterChoices()` and is
always validated. Issues are `collectChoiceIssues` plus one
`missing_selection` issue per question from `listChoiceQuestions` whose
`selected` is empty. Same 400 `{ error, issues }` shape as today.

### Server — level-up

In `applyLevelUp`, before any write:

- `before = listChoiceQuestions(currentSave)`,
  `after = listChoiceQuestions(nextSave)` where `nextSave` has this level's
  class ledger, subclass and feat applied and the merged choices.
- **Lock:** a payload key (`selectedTraits` node or `traitSelections` block)
  whose question already has a stored answer is rejected:
  `Invalid character choices: <id> already answered`.
- **Required:** every question in `after` whose id is not in `before` must
  have an answer; otherwise the level-up fails the way choice validation
  already does: `Invalid character choices: <trait or class name>: nothing
  selected for <id>` (400). Questions open
  in `before` may be answered now but are not required (older characters with
  gaps can still level up).
- Existing `collectChoiceIssues` validation is unchanged.

### Web — shared picker

`apps/web/src/components/wizard/choices/`:

- `ChoicePicker` — one question: heading (`prompt`, source name), a checkbox
  list of `options`, a "k / N" counter; unchecked boxes disable once k = N;
  `held` options render disabled with "already known".
  Tailwind, matching the level-up wizard's styling.
- `ChoiceQuestionList` — questions grouped under source headings; reports
  `onChange(questionId, selected)` and whether all are complete.

### Web — creation wizard

- New **Choices** step between Background and Finalize (steps become 1–7).
  With no questions it says "Nothing to choose" and Next is enabled.
- It builds the draft `CharacterSave` from `wizardStore` (the same builder
  `compileCharacterPayload` feeds) and calls `listChoiceQuestions` against the
  rule snapshot the wizard already fetches (`/reference/rules/snapshot`).
- `wizardStore.choiceAnswers: Record<questionId, string[]>`; when race,
  subrace, class or background changes, answers whose question no longer
  exists are pruned.
- Next is disabled until every question is answered.
- `compileCharacterPayload` sends `choices` built from the answers
  (`target`/`classId` decide `classSelections` vs `traitSelections`).

### Web — level-up wizard

*Revised after the final review (owner, 2026-09-21): the server sends the
level-up questions, so the wizard and the required check share one
definition.*

- `GET /reference/level-up/options` (with `characterId`) returns
  `choiceQuestions: ChoiceQuestion[]` — `listChoiceQuestions` of the character
  after this level minus the ids present before it. "After" uses the
  requested `subclassId`, else the character's stored subclass for that
  class, and an optional `featId`. Without a character it returns `[]`.
- `applyLevelUp` resolves the payload against the stored subclass when the
  payload names none, so the resolver and the required check see the same
  subclass track.
- `levelUpStore` keeps the server's full `nextLevel.decisions` (subclass,
  ASI/feat, spells) and the `choiceQuestions`; it refetches the questions
  when the draft's `subclassId` or `featId` changes.
- One **Choices** step, always present before Review, renders
  `choiceQuestions` through `ChoiceQuestionList` (labels, full rosters and
  `held` come with them); with none it says "Nothing to choose". Answers go
  to `selectedTraits[id]` for class questions and `traitSelections[id]` for
  trait questions. The resolver's `trait_selection` decisions are no longer
  rendered as their own step.
- A `spell_selection` decision renders a step stating spell picks are not
  supported yet (#79), and blocks submission, instead of "Unhandled Step
  Type".

## Testing

- Engine: `listChoiceQuestions` against the real pack — a human (language
  block), a half-elf (ability-score block, Skill Versatility, language), a
  fighter (fighting-style class node, skill block), an acolyte background
  (languages); order, labels, `selected` from stored choices.
- Server: creation without choices fails with `missing_selection` for each
  question; creation with full answers succeeds; level-up requires a new
  class-node answer, allows answering a previously open question, and rejects
  re-answering a stored one.
- Web: `ChoicePicker` limits and counter; creation step gating and pruning on
  a race change; payload `choices`; level-up store keeps `trait_selection`
  decisions; Choices step fills `selectedTraits` / `traitSelections`; spell
  step blocks submit. `createRoot` + `act`, no testing-library.
- Hand check (owner's permission for the dev database): create a half-elf
  fighter in the running app answering every question and confirm the sheet
  shows the picks; level a sample character through a level with a class-node
  pick.

## Out of scope

- Spells (#79): storage, spell lists, a spell step.
- Custom backgrounds' choice blocks.
- Answering or changing picks after the fact (respec / answer-later on the
  sheet).
