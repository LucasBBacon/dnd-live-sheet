# Danger Sense, Saving Throws and Conditions

Date: 2026-08-19
Status: Complete
Owner: Claude pair session

## Goal

Author `trait_danger_sense` as an engine-backed rule. It was blocked on three pieces of missing infrastructure, all of which this change builds.

## Rule Being Modelled

Barbarian 2, PHB 2014:

> You have advantage on Dexterity saving throws against effects that you can see, such as traps and spells. To gain this benefit, you can't be blinded, deafened, or incapacitated.

## Reframing The Problem

The initial framing was that the condition gates would be straightforward and "effects that you can see" would be the hard part. Exploration inverted that.

"Effects you can see" is a per-roll question the player answers about their own situation — no world model needed. The **conditions** were the hard part, because the project had no conditions system: `CONDITION_ADDED` existed in `socket.ts` with zero implementations, and `incapacitated` / `restrained` appeared only in test fixtures and one legacy dictionary entry. Authoring `forbiddenStates: ["blinded", ...]` would have reproduced the Rage defect fixed in the previous change — rule data that never gates because nothing emits the state.

A third blocker surfaced during exploration: **there was no saving-throw UI at all.** `useDerivedStats` did not compute saves, the store did not hold them, and `calculators/saves.js` was not even exported from the engine index. `SaveEngine` ran server-side inside `buildLiveSheet` and its output never reached the player.

## Design Decisions

**Conditions are vocabulary, not authored content.** `CONDITION_MAP` sits in `packages/shared/src/conditions.ts` beside `SKILL_MAP`. A rulebook adds traits and spells; the set of conditions the engine understands is part of the engine.

**Bare state ids.** `blinded`, not `condition_blinded`. This was forced rather than chosen: Aura of Protection already gates on unprefixed `incapacitated`, so a prefix would have orphaned it.

**Flags only, no mechanical riders.** Toggling `prone` grants the state and nothing else. Modelling each condition's own effects is a large rules subsystem that would have dwarfed this change.

**Exhaustion excluded.** It is a six-level track; representing it as a flag would be wrong rather than merely incomplete.

**`appliesWhen` is reported, never applied.** A modifier carrying it names a rider the engine cannot settle. `SaveEngine` returns it in `conditionalNotes` and keeps it out of both `totalModifier` and `rollState`. Keeping it out of `rollState` is load-bearing: a caveated advantage folded in would cancel a real disadvantage, and a restrained barbarian would silently roll straight.

**The engine still resolves what it can.** The three conditions gate the modifier normally, so the note disappears entirely while any of them is active. Only the visibility half is deferred to the player.

**Conditions compose into `activeStates`.** `composeActiveStates` gained a third source. Every calculator gates on conditions without any of them knowing conditions exist. The three sources are kept separate because their lifetimes differ: base states hold regardless, conditions last until cleared, effects expire on timers.

**The store rejects unknown condition ids**, so a typo produces no state rather than an inert rule.

## Changes

| File | Change |
| --- | --- |
| `packages/shared/src/conditions.ts` | New: `CONDITION_MAP`, `CONDITION_IDS` |
| `packages/shared/src/schemas/modifiers.ts` | `appliesWhen` on `BaseModifierSchema` |
| `packages/engine/src/calculators/saves.ts` | `rollState` with cancel-out; `conditionalNotes` |
| `packages/engine/src/index.ts` | Export `calculators/saves.js` — previously unreachable |
| `apps/web/src/store/characterSheetStore.ts` | `activeConditions`, `toggleCondition`, three-source `composeActiveStates` |
| `apps/web/src/hooks/useCharacterStats.ts` | `saves`, recovering saving-throw proficiencies from the flat record |
| `apps/web/src/components/sheet/SavingThrowsWidget.tsx` | New: saves panel with ADV/DIS badge and footnoted riders |
| `apps/web/src/components/sheet/ConditionsWidget.tsx` | New: condition toggle chips |
| `apps/web/src/components/sheet/DashboardLayout.tsx` | Mounts both widgets |
| `packages/database/data/packs/core_2014_pack/classes/barbarian.json` | Author `trait_danger_sense` |
| `apps/server/vitest.config.ts` | `testTimeout: 20000` — see below |
| `docs/architecture/trait-authoring-guide.md` | Condition states, `appliesWhen` semantics and its limits |

## Test Outcomes

56 new tests, written test-first, each watched failing for the expected reason.

| Suite | Before | After |
| --- | --- | --- |
| `@project/shared` | 141 passed | **150** passed |
| `@project/engine` | 43 failed / 509 passed | 43 failed / **524** passed |
| `@project/database` | 74 passed | **82** passed |
| `@project/server` | 1 failed / 207 passed | 1 failed / 207 passed |
| `@project/web` | 3 failed / 176 passed | 3 failed / **203** passed |

`npx turbo run typecheck` passes across all five packages. `pnpm check:hygiene` passes. Lint is clean on every changed file.

## The Server Timeout Change

`character.test.ts > rejects unresolved starting equipment choices` began failing 3/3 on this branch, against 1/3 at baseline. It was worth running down rather than dismissing as flake.

It is a pure timeout, not an assertion: the test builds a real Express app through dynamic imports, and the first test in the file pays the whole cold-transform cost. At a 20s timeout it passed 3/3 unchanged, confirming latency rather than logic. Adding two modules to the shared/engine import graph pushed a test already sitting on the 5s boundary over it.

Raising `testTimeout` in the server's vitest config fixes the class of problem rather than the one instance. Verified stable at 1 failure across three consecutive full-suite runs afterwards.

## Pre-Existing Failures (Not Caused By This Work)

Verified against a stashed tree:

- **engine, 43 failures** — `unknown_race` / `Unknown race: race_dwarf` from the unfinished race-to-pack migration.
- **web, 3 failures** — half-orc HP triggers and `savage_attacks` critical damage, same root cause.
- **server, 1 failure** — `class_barbarian` multiclass prerequisites, same root cause.

## Follow-Up

- Conditions carry no mechanical riders. Prone, restrained and the rest still need their own effects modelled; that is a rules subsystem deserving its own design pass.
- `appliesWhen` is honoured only by `SaveEngine`. Any other calculator would apply such a modifier unconditionally. Extending it to skills or attacks means teaching those calculators first.
- There is still no roll-initiating affordance for saves or skills; both panels are read-only, consistent with the rest of the sheet.
