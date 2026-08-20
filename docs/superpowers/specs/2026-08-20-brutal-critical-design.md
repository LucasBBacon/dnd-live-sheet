# Brutal Critical, and Scaling a Critical-Hit Die

Date: 2026-08-20
Status: Implemented
Owner: Claude pair session

## Goal

Author the barbarian's Brutal Critical:

> Beginning at 9th level, you can roll one additional weapon damage die when
> determining the extra damage for a critical hit with a melee attack. This
> increases to two additional dice at 13th level and three additional dice at
> 17th level.

## What the Pack Already Said

Half-Orc Savage Attacks is the exact precedent - `add_base_die` with
`requiredAttackTypes: ["melee_weapon"]`. Brutal Critical is the same rule with a
count that grows.

The decisive finding was in the progression: the pack **already grants
`trait_brutal_critical` at levels 9, 13 and 17 - the same id, three times.**
`compileActiveTraits` dedupes, so grants two and three were no-ops.

That is a convention, not a mistake. `trait_rage` does the same (granted at 9
and 17) while carrying its real progression in `scalingThresholds` on a
modifier. So the pack's meaning is unambiguous: **re-granting marks "this
improves here", and the modifier carries the scaling.**

That also ruled out the alternative worth considering - three distinct trait ids
each adding one die. It would have worked, because the engine applies each
matching modifier in turn, but it contradicts the authored data and would show
one rulebook feature as three entries on the sheet.

## What Was Missing

`add_base_die` hardcoded exactly one die:

```ts
const { count, sides } = DiceEngine.parse(baseDice);
return `${count + 1}d${sides}`;
```

and `CriticalHitModifierSchema` had no scaling fields at all.

## Design

**`CriticalHitModifierSchema` gains `dieCount` plus the three scaling fields
`BaseModifierSchema` already uses** - `scalingFactor`, `scalingClassId`,
`scalingThresholds` - so a scaling block reads identically wherever it is
authored.

**Both new fields are `.optional()`, not `.default()`.** This is the one place
the design diverged from `BaseModifierSchema`, and deliberately: a `.default()`
makes the field *required* on the inferred output type, which would force every
existing hand-built `CriticalHitModifier` literal - in the static dictionaries
and in three existing tests - to restate a value it does not care about. The
calculator resolves the absence itself, which it has to do regardless for a
literal that was never parsed.

**`calculateWeaponAttack` already received `classLevels`**, threaded in for
Rage's damage bonus, so nothing had to be plumbed. `useCombat` already passes it
too, with a comment about exactly this failure mode.

**The threshold reduce was extracted** into `resolveClassLevelThresholds` at
module scope in `combat.ts`. The damage-bonus path already had it and the
critical path wanted the same eight lines; two copies in one file drift.
`DerivedStatEngine` still carries a third copy - flagged, not touched, since it
is a different file.

**Stacking came free.** The loop applies each matching modifier in turn, so a
half-orc barbarian 17 gets Savage Attacks' die plus Brutal Critical's three, for
four extra dice. RAW-correct, and pinned by a test.

## Two Guards Added Along The Way

Both were found by tests failing, and both concern the same hazard: a
`CriticalHitModifier` can reach the calculator as an unparsed literal, so Zod
defaults cannot be relied on at runtime.

1. `dieCount ?? 1` - without it an absent count produced `NaNd6`, which is worse
   than a wrong number because it silently corrupts the expression.
2. `modifier.requiredAttackTypes?.length` - the function already optional-chained
   `requiredStates` and `forbiddenStates` but not this one, so a literal
   omitting it threw.

## Result

| Suite | Before | After |
| --- | --- | --- |
| `@project/shared` | 187 passed | 187 passed |
| `@project/engine` | 702 passed | **711 passed** |
| `@project/database` | 89 passed | 89 passed |
| `@project/server` | 1 failed / 307 | 1 failed / 307 |
| `@project/web` | 3 failed / 278 | 3 failed / 278 |

Typecheck passes across all five packages, hygiene passes, eslint is clean, and
no prettier drift was added. The four remaining failures are the pre-existing
ones awaiting the server and web pack wiring.

## Follow-Ups

- **`add_specific_die` substitutes instead of appending.** Recorded in
  `TODO_BACKLOG.md`. Unreachable today - nothing authors it - and fixing it needs
  the damage expression to grow beyond a single `NdX` string first.
- **The live sheet does not surface `criticalDamageExpression`.**
  `buildLiveSheet` takes only `criticalDamageMaximized` from the attack
  analysis; the crit expression reaches the player through `useCombat` instead.
  Not a defect, but it is why this trait's pipeline test drives
  `CombatEngine` directly rather than reading a field off the sheet.
- **A third copy of the threshold reduce** lives in `DerivedStatEngine`.
