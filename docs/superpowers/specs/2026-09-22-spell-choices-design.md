# Spell choices — spell picks are choice questions in both wizards

**Date:** 2026-09-22
**Branch:** `feat/spell-choices`
**Backlog items:** #79 (the level-up wizard has no spell step, so a level with
a spell choice cannot be submitted).

## Problems

- **Level-up cannot be submitted.** The resolver
  (`apps/server/src/services/levelUpValidation.ts`) turns every `spell_choice`
  grant, and every trait `spells.choices` block granted at the level, into a
  `spell_selection` decision. `validateLevelUpPayloadFromResolver` rejects the
  level unless `payload.addedSpells` holds at least `quantity` spells, and the
  wizard has no step that fills it. Since `feat/choice-step` it shows
  `SpellChoiceUnsupportedStep` and blocks. Cleric 3 → 4 ("Choose 1 spell(s)
  for Cleric", `cleric_level_4_cantrips`) cannot complete.
- **Spell picks are stored nowhere.** `applyLevelUp` never reads
  `addedSpells`; it is a flat array shared by every spell decision at the
  level, so it could not say which node a spell answers anyway.
  `replacedSpells` is read by nothing at all.
- **The storage already exists, unused.** `knownSpellIds`
  (`packages/engine/src/pipeline/characterBootstrapper.ts`), which invocation
  prerequisites read, and save validation's choice-node loop both read spell
  picks from `classState.selections[nodeId]` — i.e.
  `characters.choices.classSelections[classId][nodeId]`, the map class trait
  picks already travel through (`payload.selectedTraits`).
- **Creation never asks either.** `listChoiceQuestions` skips spell nodes, so a
  wizard's level-1 cantrips and spellbook are never answered; an unanswered
  node is tolerated because `missing_selection` is not a blocking code.
- **The pack has no spell data to pick from.** All 111 spells are stubs whose
  `level` is a placeholder 0 (#31), and no class spell lists exist (#31a,
  Tier 2 item 7). The rule snapshot carries no spells at all.

## Decisions (owner, 2026-09-22)

1. Scope: a real spell pick on today's data — stored per node, asked through a
   picker — rather than only unblocking the level-up or waiting for #31a.
2. Approach: spell picks are **choice questions**. `listChoiceQuestions` asks
   them, so both wizards' existing Choices steps ask them, and the server's
   existing required-answer and lock checks cover them. No separate spell
   step. Consequence accepted: creation asks for, and requires, level-1 spell
   picks too.
3. Level filter: **correct bounds; skip empty.** A cantrip node offers level-0
   spells; any other node offers levels 1 to its `maxSpellLevel`. A spell
   question whose roster is empty is not asked. Today that means cantrip
   questions list all 111 placeholder spells and every leveled node
   (spellbook, spells known) is not asked; once #31a gives spells real levels
   they appear with real options and no code change.

## Design

### Engine

**Snapshot.** `CoreRulePackSnapshot` and `toRuleSnapshot`
(`packages/shared/src/schemas/runtime/ruleSnapshot.ts`) gain
`spellsById: Record<string, CoreRulePack["spells"][number]>`, and the
interface's comment stops saying spells reach the runtime by other routes —
`listChoiceQuestions` now reads them. `RuleSnapshotLookup`
(`packages/engine/src/rules/ruleLookup.ts`) gains an optional `spellsById` and
a `resolveSpellDefinition`. The server rulebook (`packRulebook.ts`, whose
`EMPTY` gains `spellsById: {}`), the server's cached snapshot and the web's
`FullRulesSnapshotResponse` (`Partial<CoreRulePackSnapshot>`) all build from
`toRuleSnapshot`, so all three carry it.

**One roster function.** `spellOptions(node: SpellChoiceNode, snapshot)`
returns the snapshot's spells for a node, in pack order:

- `maxSpellLevel === 0` (a cantrip node): spells of level 0.
- otherwise: spells of level 1 through `maxSpellLevel`.

It does not filter by `listSource` — there are no lists. It is the one place
#31a adds list membership.

**`listChoiceQuestions` asks two new kinds of question.**

- **Class spell node** — a `spell_choice` grant on a class or subclass track
  the class state has unlocked (`unlockedGrants`). `target: "class"`,
  `classId` set, `id` = `nodeId`, answered into
  `classSelections[classId][nodeId]`. Ranked with its class; within the class,
  in unlocked-grant order alongside the class's trait-choice nodes.
- **Trait spell block** — an entry in an active trait's `spells.choices`
  (today only `subrace_elf_high_cantrip`'s `high_elf_cantrip`).
  `target: "trait"`, `id` = `nodeId`, answered into `traitSelections[nodeId]`.
  Ranked with the source that granted the trait.

For both:

- `options` = `spellOptions(node)`, each labelled with the spell's name.
- A question whose `options` is empty is not returned.
- `pickCount` = the node's `pickCount`; `selected` = the stored answer.
- `held` = every spell the character already knows from elsewhere: every fixed
  spell of an active trait, plus every other spell question's picks (this
  question's own picks excluded). The picker disables them as "already known".
  Simplification accepted: 5e lets two classes know the same spell with
  different casting stats; here that counts as held.
- Prompt: `"<source>: choose <n> cantrip(s)"` for a cantrip node,
  `"<source>: choose <n> spell(s) of level 1 to <max>"` otherwise (`"of level 1"`
  when the cap is 1).

**Labels.** `choiceOptionLabel` resolves a spell id to the spell's name,
ahead of the humanised fallback.

**Known spells.** `knownSpellIds` also counts trait spell block picks
(`save.traitSelections[nodeId]` for each active trait's `spells.choices`), so
an invocation prerequisite can be met by one.

### Save validation (`CharacterBootstrapper.collectSaveIssues`)

- **Class spell nodes** get the option checks trait nodes have. The count and
  duplicate checks already run on them; added: a pick not in
  `spellOptions(node)` is `invalid_option`, and a held pick is
  `redundant_selection`.
- **Trait spell blocks** become known blocks — their ids join
  `knownChoiceIds`, so `traitSelections.high_elf_cantrip` is not an
  `orphan_selection` — and get the same count, duplicate, option and held
  checks.
- **An empty roster reports no `missing_selection`.** A spell node or block
  with no options cannot be answered, so it is neither asked nor reported. One
  with options still reports `missing_selection` when unanswered, which stays
  non-blocking (`collectChoiceIssues` excludes it) exactly as today.

### Server

- **Resolver.** `spell_selection` decisions go: `grantDrivenDecisions` stops
  turning `spell_choice` grants into decisions and `traitDrivenDecisions`
  stops turning `spells.choices` into decisions. The `spell_selection` check in
  `validateLevelUpPayloadFromResolver` goes with them, as does the multiclass
  dip's spell skip (and its #79 comments): a wizard dip asks its level-1
  cantrips like any other level-1 question, which matches the multiclass
  rules. `spell_selection` leaves `ResolverDecisionType` and the engine's
  `DecisionType` (`packages/engine/src/types/progression.ts`).
- **Payload.** `LevelUpPayload` (`packages/shared/src/schemas/transport/levelUp.ts`)
  loses `addedSpells` and `replacedSpells`. Spell swapping on level-up becomes
  a backlog item rather than a dead field.
- **Nothing new in `applyLevelUp` or `POST /api/character`.** Spell questions
  come from `listChoiceQuestions`, so level-up's `questionsNewAtLevel`
  required-answer check, the "already answered" lock, creation's "every
  question answered" check and the level-up options' `choiceQuestions` all
  cover them. A cleric 3 → 4 sending
  `selectedTraits: { cleric_level_4_cantrips: [...] }` is validated, merged by
  `buildLevelUpSaves`, and stored in `choices.classSelections.class_cleric`.
  A subclass's spell nodes (Eldritch Knight, Arcane Trickster at level 3) are
  asked once the subclass is named, through the existing refetch.

### Web

- **Level-up wizard.** `levelUpSteps` has no `spell_selection` left to emit.
  `SpellChoiceUnsupportedStep`, `WizardStepRouter`'s `spell_selection` case and
  `isStepComplete`'s `spell_selection` case are deleted. Spell questions show
  in the Choices step, grouped under their source. `levelUpStore` stops sending
  `addedSpells`/`replacedSpells`, and the `refreshChoiceQuestions` comment
  "(its spell picks, #79)" is corrected: a subclass's spell questions arrive in
  `choiceQuestions`.
- **Creation wizard.** No change needed: `ChoicesStepContainer` already runs
  `listChoiceQuestions` on the draft with the fetched snapshot. A cleric is
  asked for 3 cantrips, a High Elf for 1, a wizard for 3 cantrips (its
  spellbook is not asked until #31a); Next stays blocked until they are
  answered.
- **`ChoicePicker`.** A name filter box appears when a question has more than
  12 options. It narrows what is shown, never what is picked: a selected
  option stays visible whatever the filter says. The "n / pickCount" line and
  the "(already known)" marking are unchanged.

## Testing

Test-first, per layer.

- **Shared:** `toRuleSnapshot` carries `spellsById`.
- **Engine:**
  - `spellOptions`: a cantrip node gets level 0 only; a leveled node gets 1
    through its cap (a fixture spell above the cap and a cantrip both
    excluded).
  - `listChoiceQuestions`: a level-1 cleric gets `cleric_level_1_cantrips`
    (`target: "class"`, every level-0 spell in the pack — all 111 today —
    labelled by spell name); a level-1 wizard
    gets its cantrip question and no spellbook question; a High Elf gets
    `high_elf_cantrip` as a `target: "trait"` question ranked with the subrace;
    `held` includes a fixed trait spell and another question's pick but not the
    question's own picks.
  - Save validation: `invalid_option` for a spell not on a node's roster;
    `redundant_selection` for a held pick; `high_elf_cantrip` answered is not
    an orphan, and answered with a non-cantrip is `invalid_option`; an
    empty-roster spell node reports no `missing_selection`.
  - `knownSpellIds` counts a trait spell block pick.
- **Server:**
  - The resolver emits no `spell_selection` decision, including on a dip.
  - Level-up: cleric 3 → 4 without its cantrip is rejected as nothing selected
    for `cleric_level_4_cantrips`; with it, the pick is stored in
    `choices.classSelections.class_cleric`; resending a stored cantrip is
    refused as already answered.
  - Creation: a cleric with no cantrips is rejected.
  - The existing `addedSpells` tests are replaced by the above.
- **Web:** `levelUpSteps` never includes `spell_selection`; the submitted
  payload has no `addedSpells`; `ChoicePicker` shows the filter past 12
  options, filters by name, and keeps a selected option visible when the
  filter excludes it.
- **Sample characters** keep their spell picks unanswered: seeding placeholder
  "cantrips" (Bless, Fireball) would record picks #31a then has to unpick.
  `sampleCharacterChoices.test.ts` already exempts spell nodes from
  `missing_selection`; only its comment changes.
- Full suite, plus `tsc -b` typecheck and `pnpm check:hygiene`, as separate
  gates.

### Hand check

Dev servers and local Postgres, samples re-seeded.

1. Sister Aveline (cleric 3) levels to cleric 4 through the wizard: the Choices
   step asks for 1 cantrip, the filter box narrows the 111, the commit
   succeeds, and the pick is in her `choices.classSelections.class_cleric`.
2. A new cleric made through the creation wizard is asked for 3 cantrips;
   they are stored.
3. A new warlock picks Eldritch Blast at creation, then levels 1 → 2 taking
   Agonizing Blast, and the server accepts it — #81's failing example, which
   works once the prerequisite spell is actually known.

## Docs

- `docs/TODO_BACKLOG.md`: close #79 (the 11g row and its note, with the hand
  check); record new items for spell swapping on level-up and for the sheet
  listing picked spells (`SpellcastingWidget` shows slots only); on #31a, note
  that `spellOptions` is the one place list membership goes; on #67, note that
  Acolyte of Nature can be authored as a trait `spells.choices` block once
  lists exist.

## Out of scope

- Spell data and class spell lists (#31a).
- Answering spell questions left open on existing characters (answer-later on
  the sheet, already out of scope since `feat/choice-step`).
- Spell swapping on level-up.
- The sheet showing known spells.
- #81's filtering of options with unmet prerequisites.
