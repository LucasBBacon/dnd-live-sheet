# Action Economy, Phase 3: The Standard Actions

Date: 2026-08-19
Status: Complete
Owner: Claude pair session

## Goal

Give a character the eight actions the 2014 PHB says anyone can take, so "I dodge" is something the sheet can record rather than something only the player remembers.

## The Finding That Shaped It

`SpeedEngine` already applies `multiplier` modifiers, and its own comments name the feature: *"encumbrance, before multipliers so Dash doubles the loaded speed"* and *"multipliers (Dash, Haste), applied last"*. The seam had been built and never used. That turned Dash from speculative work into completing something already waiting, and made a flags-only design the wrong answer.

## Design Decisions

**One rule decided every action's shape:** an action carries an effect only where a state or modifier has a real consumer — a calculator, or a specific piece of UI. Otherwise it costs the action and nothing more.

| Action | Effect | Consumer |
| --- | --- | --- |
| Dash | `SPEED` ×2, `status_dashing`, `turn_end` | `SpeedEngine`'s multiplier branch |
| Dodge | `DEX_SAVE` advantage, `status_dodging` + `status_attacks_against_have_disadvantage`, `turn_start` | `SaveEngine`; the exposure state mirrors Reckless Attack's |
| Hide | `status_hidden`, `manual`, plus a stop action | Outlasts the turn, so it cannot be turn-scoped |
| Disengage, Help, Ready, Search, Use an Object | `no_effect` | — |

Without that rule the obvious move is to give all eight a state, which would have minted five states nothing reads — the dead-data pattern the last several sessions were spent removing.

**`no_effect` as a new effect type.** Four actions genuinely do nothing the engine models. `ability_check` would roll a meaningless bare d20 and `apply_effect` would mint the dead states above, so the honest answer was to make "costs the action, nothing more" representable. Five lines, additive, and it turns out several actions want it.

**The economy names its spender.** `spentActionSourceId` already existed and was already populated; nothing displayed it. The pip now reads *"Action — Dodge"*, looked up against the character's real action list so trait actions are named too and anything unknown falls back to its id. This is the only trace the four plain actions leave, and it is what lets them carry no state.

**Attack is deliberately absent from the list.** It is not a fixed grant — it is taken implicitly by swinging, and its allowance is sized by `ATTACKS_PER_ACTION`. Adding it here would have created a second, competing way to take it.

**Vocabulary, not pack content.** `STANDARD_ACTIONS` sits beside `SKILL_MAP` and `CONDITION_MAP` for the same reason: a rulebook adds traits and spells, but the set of actions the engine understands is part of the engine.

## Changes

| File | Change |
| --- | --- |
| `packages/shared/src/schemas/actions.ts` | `NoEffectSchema`, added to `CoreEffectUnion` |
| `packages/shared/src/standardActions.ts` | New: `STANDARD_ACTIONS`, `STANDARD_ACTION_IDS` |
| `packages/engine/src/pipeline/characterEngine.ts` | Standard actions join `liveSheet.actions` |
| `apps/web/src/store/characterSheetStore.ts` | `getCharacterActions` includes them |
| `apps/web/src/components/sheet/TurnControlsWidget.tsx` | Economy pip names its spender |

## Test Outcomes

36 new tests.

| Suite | Before | After |
| --- | --- | --- |
| `@project/shared` | 164 passed | **181** passed |
| `@project/engine` | 43 failed / 594 passed | 43 failed / **606** passed |
| `@project/database` | 89 passed | 89 passed |
| `@project/server` | 1 failed / 217 passed | unchanged |
| `@project/web` | 3 failed / 223 passed | 3 failed / **229** passed |

Typecheck passes across all five packages, hygiene passes, lint is clean.

**Honesty note on TDD.** Five of the `no_effect` resolver tests and four of the Dash/Dodge integration tests **passed on first run** — they were never red. `executeEffect` ends with `default: return ok`, so `no_effect` was already handled, and effect-borne modifiers already flowed correctly thanks to the Phase-1 stamping fix. Those nine are characterisation tests pinning behaviour that came free, not tests that drove code. The other 27 were watched failing first.

## Not In Scope — For Later

Recorded here at Lucas's request.

1. **Ready's trigger is not modelled.** Ready prepares a reaction against a stated condition. Neither the condition nor the reaction is captured — taking Ready spends your action and does nothing else. Doing it properly needs a player-authored trigger, which no contract supports.

2. **Hide does not roll Stealth.** It grants `status_hidden` but rolls nothing, because there is still no roll-initiating UI for skills. Same for Search and Perception/Investigation. Both would follow naturally from a skill-roll affordance.

3. **`status_hidden` has no automatic end.** Hiding is `manual` with a "Stop Hiding" action, because being found is not a turn boundary. Nothing clears it if the player forgets.

4. **Dodge's disadvantage is display-only.** `status_attacks_against_have_disadvantage` is surfaced but nothing consumes it — the AC widget shows Reckless Attack's advantage mirror but has not been extended to show this one. A small, obvious follow-up.

5. **No opportunity-attack model.** Disengage is `no_effect` because opportunity attacks do not exist in the engine. If they are ever modelled, Disengage becomes expressible.

6. **Help, Search and Use an Object are inert by nature.** They affect an ally's roll, need a skill check, or interact with the world. All three are correct as `no_effect` for a single-character sheet, and are listed only so the absence is deliberate rather than forgotten.

7. **Two-weapon fighting's main-hand requirement is unenforced.** Carried over from Phase 2: TWF requires having taken the Attack action with a light weapon; nothing checks or surfaces it.

8. **Socket gateway remains untested.** See `docs/TODO_BACKLOG.md` — a dedicated pass is planned.

## Pre-Existing Failures

The 47 known-red tests from the unfinished race-to-pack migration, unchanged.
