# Reckless Attack and Attack Context States

Date: 2026-08-18
Status: Complete
Owner: Claude pair session

## Goal

Author `trait_reckless_attack` in the core 2014 pack as a fully engine-backed rule, and add the engine capabilities the rule needs. Two of those capabilities were missing in ways that also left Rage's damage bonus inert, so the same work revives an existing trait.

## Rule Being Modelled

Barbarian 2, PHB 2014:

> When you make your first attack on your turn, you can decide to attack recklessly. Doing so gives you advantage on melee weapon attack rolls using Strength during this turn, but attack rolls against you have advantage until your next turn.

The two halves expire at different moments, and only the first is a roll this sheet makes.

## What Was Missing

1. `CombatEngine.calculateWeaponAttack` filtered for `ATTACK_BONUS` + `add` only, so `type: "advantage"` on an attack was silently dropped. `DerivedStatEngine` and `SkillEngine` already implemented the pattern.
2. `action_melee_attack` and `action_using_str` were used as `requiredStates` by Rage and by the two-handed fighting style, but nothing in the engine ever emitted them. **Rage's damage bonus was dead data.**
3. `EffectManager.tickTurnStart` / `tickTurnEnd` were never called outside tests, so no timed effect could expire on the live sheet.
4. The sheet store composed `activeStates` by unioning onto the previous value, making the list monotonic — a state could enter but never leave.

Two further defects were found during design and folded into this work:

5. `ActionResolver` cloned authored `BaseModifier`s into `ActiveEffect.modifiers` without `id`, `sourceName`, `sourceOrigin`, or `isActive`. Every such modifier was then discarded by the calculators' `!isActive` guard, and any that survived attributed itself to `undefined`.
6. `useCombat` omitted the `classLevels` argument, so `class_level_thresholds` scaling resolved to 0 in the web attack panel.

## Design Decisions

**Advantage lives on the trait, not the effect.** `ModifierExtractor` stamps source metadata onto trait modifiers; `apply_effect` modifiers are cloned raw. Authoring the advantage as a trait-level fixed modifier gated on `status_reckless_attack` gives a correct breakdown and matches how Rage authors its damage bonus. (Defect 5 is fixed regardless, but the authoring choice stands on its own.)

**Attack context states are derived, not supplied.** Only `calculateWeaponAttack` knows which weapon and which ability resolved. It derives `action_melee_attack` / `action_ranged_attack` and `action_using_<stat>` locally and merges them into that call's gating list. They never reach the character's `activeStates`, because "currently making a melee attack" is not true of the character between attacks.

This also gets the Strength gate right for free: a barbarian wielding a rapier with Dexterity ≥ Strength emits `action_using_dex`, so Reckless Attack correctly declines to apply.

**Two effects, two durations.** A `macro` applies self-advantage with `durationType: "turn_end"` and the exposure with `durationType: "turn_start"`. Collapsing them into one `turn_start` effect would grant advantage on opportunity attacks made during another creature's turn, which RAW does not.

**Expiry ticks before dispatch.** `beginTurn` and `endTurn` tick the effect manager before firing `ON_START_OF_TURN` / `ON_END_OF_TURN`, so a trigger that raises a fresh effect is not swept away by the same tick.

**`baseStates` separates the two sources of truth.** The store now holds what is true of the character independently of any effect, and `activeStates` is rebuilt as `baseStates ∪ effect states` rather than accumulated. Without this, expiry is invisible.

**The exposure half is a sheet warning, not a calculation.** Attack rolls against the character belong to the DM. There is no roll for the engine to modify, so the rule is surfaced as `status_attacks_against_have_advantage` with a warning beside Armour Class. Adding a modifier target for it would create a contract with no calculator behind it.

**An escape hatch was included deliberately.** `action_end_reckless_attack` clears both tags. RAW you cannot take back the exposure; this exists for misclicks, and mirrors Rage's existing `action_end_rage`.

## Changes

| File | Change |
| --- | --- |
| `packages/engine/src/calculators/combat.ts` | Derive attack context states; resolve `rollState` on `DerivedAttack`; gate critical-hit modifiers on the same list |
| `packages/engine/src/pipeline/actionResolver.ts` | Stamp identity fields onto `apply_effect` modifiers (defect 5) |
| `packages/database/data/packs/core_2014_pack/classes/barbarian.json` | Author `trait_reckless_attack` |
| `apps/web/src/store/characterSheetStore.ts` | Add `baseStates`; `composeActiveStates`; tick turn start/end |
| `apps/web/src/hooks/useCombat.ts` | Pass `classLevels` (defect 6) |
| `apps/web/src/components/sheet/ArmorClassWidget.tsx` | Exposure warning |
| `apps/web/src/components/sheet/CombatWidget.tsx` | ADV/DIS badge on attack cards |
| `docs/architecture/trait-authoring-guide.md` | Document attack context states, advantage authoring, and effect durations |

## Test Outcomes

Written test-first throughout; every test was watched failing for the expected reason before implementation.

| Suite | Before | After |
| --- | --- | --- |
| `@project/engine` | 43 failed / 492 passed | 43 failed / 509 passed |
| `@project/shared` | 141 passed | 141 passed |
| `@project/database` | 4 failed / 15 passed (targeted) | same 4 / +8 passed |
| `@project/server` | 1 failed / 207 passed | unchanged |
| `@project/web` | 3 failed / 160 passed | 3 failed / 176 passed |

`pnpm check:hygiene` passes. Web typechecks clean. Engine typecheck error count is unchanged at 130.

## Pre-Existing Failures (Not Caused By This Work)

Confirmed by running each suite against a stashed tree:

- **engine, 43 failures** in `characterBootstraper.test.ts` and `characterEngine.test.ts`, dominated by `unknown_race` and `Unknown race: race_dwarf` — the in-flight race-to-pack migration.
- **web, 2 failures** in `characterSheetStore.test.ts` half-orc HP triggers, same root cause.
- **web, 1 failure** in `useCombat.test.ts` `savage_attacks` critical damage — trait id not resolving post-migration.
- **database, 3 failures** in `corePackProjection.test.ts` (`ZodError` on fixture packs) and 1 in `itemsExtraction.test.ts` (ring of protection override).
- **server, 1 failure** in `levelUpValidation.test.ts` multiclass prerequisites for `class_barbarian`.

Because the pipeline-level tests live in a file that is already red for unrelated reasons, coverage for this trait sits at the calculator, store, and pack levels.

## Follow-Up

The trait cannot be exercised end-to-end through `characterEngine.test.ts` until the race migration lands and that suite is green again. A pipeline test proving Reckless Attack reaches a live sheet should be added at that point.
