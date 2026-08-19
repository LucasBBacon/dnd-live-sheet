# Extra Attack and Attacks Per Action

Date: 2026-08-19
Status: Complete
Owner: Claude pair session

## Goal

Author `trait_extra_attack` as an engine-backed rule, and add the one derived value it needs.

## Rule Being Modelled

Barbarian 5, PHB 2014:

> Beginning at 5th level, you can attack twice, instead of once, whenever you take the Attack action on your turn.

Unlike Reckless Attack and Danger Sense, this is an **action-economy** rule rather than a roll modifier.

## What Constrained The Design

Three findings shaped the scope.

**No attacks-per-action concept existed** anywhere — not in `ModifierTargetSchema`, not in the engine, not in `CombatContext`.

**Trait grants are deduped.** `CharacterBootstrapper.resolveGrantedTraitIds` returns `[...new Set(ids)]`, so granting `trait_extra_attack` three times for a fighter collapses to one grant. The count has to come from level scaling, not from counting grants.

**The action economy is not running.** `beginTurn`, `endTurn` and `beginCombat` exist on the store but are unreachable from any UI, and the server never passes `combatContext` to `ActionResolver`, so taking an action never spends it. A "1 of 2 attacks used" counter would have had nothing to decrement it and nothing to reset it.

That last point set the boundary: this change delivers the **count**, not the consumption.

## Design Decisions

**A competing candidate, not an addition.** `ATTACKS_PER_ACTION` uses `set_base` with highest-wins selection, the same pattern `calculateAC` uses for base candidates. This is correctness rather than convenience: Extra Attack explicitly does not stack across classes, so a Fighter 11 / Barbarian 5 attacks three times, not five. Authoring it as `add` would be wrong in a way that only surfaces on a multiclass sheet.

**Base one, from the calculator.** A character who has never heard of Extra Attack still swings once, so the floor belongs to the engine rather than to a trait nobody has.

**A threshold that no barbarian can miss.** The trait is only granted at level 5, so `{ minimumLevel: 5, value: 2 }` looks redundant. It is kept because it makes the fighter's `5→2, 11→3, 20→4` expressible in the identical shape when that class migrates, and because a trait granted early would otherwise silently claim two attacks. A pack test asserts the threshold level matches the level the class progression actually grants the trait at.

**One shared trait, one candidate per class.** `trait_extra_attack` is referenced by six classes. Rather than split it into per-class ids — churn across six dictionaries, the pack, `subclasses.json` and seed tests — the shared trait carries a candidate per class, each with its own `scalingClassId`. Each class's progression is then independently stated and testable, and the competition between candidates produces the correct multiclass answer with no extra machinery. A class whose thresholds are unmet resolves to zero, treated as no candidate rather than a candidate of zero attacks.

**Stated once, not per weapon card.** The panel line reads "Attack action — 2 attacks — Extra Attack". A badge on each attack card would read as "two swings with this weapon", which is wrong; the extra attacks are the player's to split across their weapons.

## Changes

| File | Change |
| --- | --- |
| `packages/shared/src/schemas/modifiers.ts` | `ATTACKS_PER_ACTION` on `ModifierTargetSchema` |
| `packages/engine/src/calculators/derivedStats.ts` | `calculateAttacksPerAction`; extracted `resolveScaledValue` |
| `apps/web/src/hooks/useCharacterStats.ts` | `attacksPerAction` |
| `apps/web/src/components/sheet/CombatWidget.tsx` | Attack-action line, shown only above one attack |
| `packages/database/data/packs/core_2014_pack/classes/barbarian.json` | Author `trait_extra_attack` |
| `docs/architecture/trait-authoring-guide.md` | Competing candidates beyond AC |

## Refactor

Class-level threshold resolution existed inline in `calculateMaxHp` and would have become a second copy in the same file. It is now a private `resolveScaledValue` helper both methods use, so a threshold fix cannot land in only half the calculator. Behaviour is unchanged — the extraction was done after the new tests were green, and the full engine suite held at its known failure count.

`CombatEngine.resolveModifierValue` remains a separate implementation; it also resolves `valueSource` and has a different signature, so folding it in was left alone rather than forced.

## Test Outcomes

29 new tests, written test-first, each watched failing for the expected reason.

| Suite | Before | After |
| --- | --- | --- |
| `@project/shared` | 150 passed | **151** passed |
| `@project/engine` | 43 failed / 524 passed | 43 failed / **537** passed |
| `@project/database` | 82 passed | **89** passed |
| `@project/server` | 1 failed / 207 passed | unchanged |
| `@project/web` | 3 failed / 203 passed | 3 failed / **211** passed |

`npx turbo run typecheck` passes across all five packages. `pnpm check:hygiene` passes. Lint is clean.

## Pre-Existing Failures (Not Caused By This Work)

The 47 known-red tests from the unfinished race-to-pack migration: 43 in engine (`unknown_race`), 3 in web (half-orc traits), 1 in server (`class_barbarian` multiclass prerequisites).

## Follow-Up

- **Action economy is inert.** Turn controls are unreachable from the UI and the server does not pass `combatContext` to `ActionResolver`, so no action is ever spent. Until that is wired, the sheet can say how many attacks you get but not how many remain. This is the natural next piece if attack tracking is wanted.
- **The other five classes.** Fighter, monk, ranger, paladin and bard each need their own `ATTACKS_PER_ACTION` candidate added to the shared trait when they migrate into the pack. The fighter's is the only one with more than one threshold.
- **`classSpecificScaling`.** The legacy `classes.json` encoded `extra_attack_count` on the class progression; the pack schema has no equivalent. That path was considered and rejected in favour of modifiers, but the legacy data still carries the field and will need reconciling when those classes migrate.
