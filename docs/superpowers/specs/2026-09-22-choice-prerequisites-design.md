# Choice prerequisites — pickers show which options a character cannot take yet

**Date:** 2026-09-22
**Branch:** `fix/choice-prerequisites`
**Backlog items:** #81 (a choice question offers options whose prerequisites
the character does not meet). #78 (hit points) was scoped out to its own
branch; this one only records what was found about it.

## Problem

`ChoiceQuestion` options carry no prerequisites, so both wizards' pickers
offer every option on a class trait-choice node, and the server then rejects
an unmet pick at submit with `unmet_prerequisite`. A warlock 1 → 2 is offered
Agonizing Blast without knowing Eldritch Blast and gets
`trait_invocation_agonizing_blast needs spell_eldritch_blast`; a Four Elements
monk at 3 is offered disciplines that need monk 6, 11 or 17.

In the pack, 183 options carry prerequisites, all on the warlock's invocation
nodes (levels 2–18) and the Four Elements monk's discipline nodes: 148 level
minimums (counted against the class that grants the choice), 35 required
traits (only the three pact boons) and 21 required spells (only Eldritch
Blast). No option requires another option of its own node.

`unmetPrerequisites` (`packages/engine/src/pipeline/characterBootstrapper.ts`)
already decides this for save validation; nothing shares it with
`listChoiceQuestions`.

## Decisions (owner, 2026-09-22)

1. Scope: #81 only. #78 turned out to be three hit-point faults (below) and
   gets its own branch; this branch records them.
2. An option whose prerequisites are unmet is shown disabled with the reason
   ("Agonizing Blast (needs Eldritch Blast)"), not hidden and not a bare
   "prerequisites not met".

## Design

### Engine

**One prerequisite check, shared.** A new module
`packages/engine/src/pipeline/optionPrerequisites.ts` takes over from the
bootstrapper:

```ts
export type UnmetPrerequisite =
  | { kind: "level"; classId: string; level: number }
  | { kind: "trait"; traitId: string }
  | { kind: "spell"; spellId: string };

export interface PrerequisiteContext {
  classState: ClassState;
  traitIds: Set<string>; // race traits + this class's traits (as today)
  spellIds: Set<string>; // this class's spell picks, fixed spells of those
                         // traits, and every trait spell block's picks
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

The context is built exactly as `collectSaveIssues` builds it today
(`knownSpellIds` moves with it). The bootstrapper formats the results exactly
as today — `needs ${classId} level ${level}`, `needs ${traitId}`,
`needs ${spellId}` — so the server's `unmet_prerequisite` messages do not
change.

**The question carries the reasons.** `ChoiceOption`
(`packages/engine/src/pipeline/choiceQuestions.ts`) gains an optional
`unmet?: string[]`: readable reasons, labelled by name — "needs Eldritch
Blast" (the spell's name), "needs Pact of the Blade" (the trait's name),
"needs Warlock level 5" (the class's name). `classQuestions` fills it for a
class trait-choice node's options from the shared check; the key is omitted
when nothing is unmet, and trait choice blocks (which have no prerequisites)
never carry it. The check runs against the save the question list is built
from: the draft at creation (re-run on every change), the character after the
level at level-up (so Thirsting Blade becomes available exactly at warlock 5).

**One "cannot pick this" helper.** `blockedOptionIds(question): string[]`,
exported from `choiceQuestions.ts`, returns the question's `held` ids plus
every option with `unmet` reasons. The picker and both wizard stores' pruning
use it, so "already known" and "prerequisites not met" behave alike.

### Web

- `ChoicePicker` (`apps/web/src/components/wizard/choices/ChoicePicker.tsx`):
  an option with `unmet` reasons is disabled unless already selected (so a
  stale pick can still be unticked) and reads
  `Agonizing Blast (needs Eldritch Blast)`; several reasons are joined with
  ", ". "(already known)" is unchanged.
- `wizardStore.pruneChoiceAnswers` and `levelUpStore`'s `pruneAnswers` drop
  picks in `blockedOptionIds(question)` rather than `held` alone, so a pick
  whose prerequisite disappears reads as unanswered again.

### Server

No change: the validator already rejects an unmet pick, and the level-up
options endpoint passes the new field through with `choiceQuestions`.

## Testing

Test-first.

- **Engine:**
  - A human warlock 2 with cantrips Minor Illusion and Dancing Lights:
    `warlock_level_2_invocations`' Agonizing Blast option has
    `unmet: ["needs Eldritch Blast"]`; with Eldritch Blast among the cantrips
    it has no `unmet` key.
  - Thirsting Blade at warlock 2 has
    `unmet: ["needs Warlock level 5", "needs Pact of the Blade"]` (level
    first: the order save validation already reports them in).
  - A Four Elements monk 3's `monk_elements_level_3_discipline`: Clench of the
    North Wind has `unmet: ["needs Monk level 6"]`; Fangs of the Fire Snake
    has no `unmet` key.
  - A plain (string) option and a trait choice block's options carry no
    `unmet` key.
  - `blockedOptionIds` returns held and unmet ids together.
  - `unmetPrerequisites` unit tests for each kind; the existing bootstrapper
    prerequisite tests stay green unchanged (the server's messages are
    unchanged).
- **Server:** the level-up options for a warlock 1 → 2 who never learned
  Eldritch Blast mark Agonizing Blast with `needs Eldritch Blast`. The route
  tests' `answerAll` helper skips `blockedOptionIds` rather than `held` alone.
- **Web:** `ChoicePicker` disables an unmet option and shows its reason; a
  selected unmet option stays enabled. Both stores prune an unmet pick.
- Full suite, per-package typecheck and `pnpm check:hygiene`.

### Hand check

Dev servers, local Postgres. A warlock created without Eldritch Blast levels
1 → 2: the invocations question shows Agonizing Blast disabled with
"(needs Eldritch Blast)" and Thirsting Blade with its two reasons; a warlock
with Eldritch Blast can pick Agonizing Blast.

## Docs

`docs/TODO_BACKLOG.md`:

- Close #81.
- Expand #78 into one item covering the three hit-point faults found while
  scoping this branch: (1) character creation writes no hit points
  (`POST /api/character` leaves `maxHp`/`currentHp` null, and level-up's
  `maxHp + hpRoll` stays null); (2) level-up adds the raw roll only, so the
  Constitution modifier is lost; (3) the engine's `calculateMaxHp` (base +
  CON × level + `MAX_HP` modifiers — Dwarven Toughness, Tough, Draconic
  Resilience) is never what the sheet shows: the server feeds it the stored
  final max as its base (double-counting CON), and the web never loads a base
  (it stays 1). The fix needs a decision first: does `max_hp` mean the final
  number (small fix) or the base rolled HP with every displayed and clamping
  max derived by the engine (rules-correct, medium). Add it to the
  Recommended sequence's Tier 1.

## Out of scope

- #78's fix itself.
- Recomputing a level-up question's `unmet` as the player picks within the
  step (no option in the pack depends on another pick at the same level).
- Prerequisites on anything but class trait-choice options (none exist).
