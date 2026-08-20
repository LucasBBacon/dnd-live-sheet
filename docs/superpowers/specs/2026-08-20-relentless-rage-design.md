# Relentless Rage, and a Resource That Counts Up

Date: 2026-08-20
Status: **Parked** - blocked on the core rule pack having a runtime load path
Owner: Claude pair session

## Goal

Author the barbarian's Relentless Rage:

> Starting at 11th level, your rage can keep you fighting despite grievous
> wounds. If you drop to 0 hit points while you're raging and don't die
> outright, you can make a DC 10 Constitution saving throw. If you succeed, you
> drop to 1 hit point instead. Each time you use this feature after the first,
> the DC increases by 5. When you finish a short or long rest, the DC resets
> to 10.

The interesting part is the scaling: every other scaled rule in this codebase
grows with level, and the vocabulary reflects that - `class_level_thresholds`,
`total_level_thresholds`, `fixed`. Relentless Rage grows with **use**.

## Why This Is Parked

Tracing how an authored resource would reach `RestEngine.applyRest` ran off the
end of the chain. The core rule pack is not loaded at runtime by anything:

- `loadCoreRulePack` is called from tests only.
- Nothing assembles the segment files (`classes/*.json`, `races/*.json`,
  `manifest.json`) into a single `CoreRulePack`. There is no manifest reader.
- `corePackImporter` and `projectCoreRulePack` are exercised by tests only.
- `/rules/snapshot` serves `traitsById: {}`.
- `TRAIT_DICTIONARY` holds race traits, fighting styles, metamagic and
  maneuvers, but no class traits. `barbarianDictionary.ts` is a 0-byte file.
- `seed.ts` fills the `traits` table from `data/traits.json`, which defines
  **none** of the six barbarian traits. `classes.json` progressions reference
  them, so seeding takes the placeholder branch and writes rows with
  `effects: []`.

So Relentless Rage would be authored correctly, validated by the pack schemas,
covered by engine tests, and inert in the running application - exactly the
state Rage, Reckless Attack, Fast Movement, Feral Instinct and Brutal Critical
are already in.

The pack load path became its own project. This spec keeps the design decisions
that were settled first, so the feature can be picked up without re-deriving
them.

## Settled Decisions

### 1. Uses-since-rest is a resource in "uses" mode

`OperationalResource` is `{ id, current }` and nothing more - name, maximum and
reset condition are all resolved from the rules at read time. "Uses since rest"
has that exact shape. Only three behaviours invert:

| | charges | uses |
|---|---|---|
| initial value | max | 0 |
| on rest | set to max | set to 0 |
| on consume | decrement | increment |

So `ResourceRuleSchema` and `ResourceGrantSchema` each gain
`mode: "charges" | "uses"`, **optional**, absent meaning `"charges"`. Optional
rather than defaulted for the reason already recorded on `dieCount`: both
schemas back hand-written typed literals, and a `.default()` makes the field
*required* on the inferred output type.

The DC is then `base + increasePerUse * current`.

Rejected: a countdown resource with an invented maximum. RAW has no cap, any
cap is wrong for some character (a level 20 barbarian with CON 24 still beats
DC 30 on a natural 20), it displays as "3/5" which says nothing about the DC,
and running dry reports `insufficient_resource` rather than a failed save.

### 2. The player opts in; the app rolls

Dropping to 0 while raging lands at 0 HP with no trigger firing. The sheet
offers the save; the player clicks; the engine rolls their Constitution save,
broadcasts it like every other authored roll, applies 1 HP on a success, and
increments the counter either way.

This is why the trait carries **no `TriggerGrant`**. Relentless Endurance
listens for `ON_HP_REDUCED_TO_ZERO` because it is unconditional and has nothing
to decide. Relentless Rage has both a choice and a roll.

Rejected: firing automatically like its sibling. The application would make the
most dramatic roll in the game on the player's behalf and spend the DC
escalation without asking.

### 3. A failed save still counts as a use

"Use this feature" reads as making the save, which is the thing the feature
lets you do. It rarely matters in play - rage ends when you fall unconscious,
so a failure usually locks you out until you rage again.

### 4. The DC lives in the pack, not the engine

`SurpriseEngine`'s constants are not a precedent for this. Those are state
*names* - identifiers the engine must know to reason at all. `10` and `5` are
rules *values*, and the pack is the single source of truth for values.

They are authored on a new `self_save` action effect - a save the character
makes against a stated DC, as distinct from the existing `save` effect, which
is a DC you impose on targets (`base 8 + your stat + proficiency`):

```json
{
  "type": "self_save",
  "ability": "CON",
  "dcRule": {
    "kind": "escalating_per_use",
    "base": 10,
    "increasePerUse": 5,
    "resourceId": "resource_relentless_rage"
  },
  "onSuccess": { "type": "macro", "effects": [ ... ] }
}
```

The vocabulary extends to concentration and death saves when those arrive.

## Shape Once Unblocked

1. **Pack resources.** `CoreRulePackSchema` already carries
   `resources: z.array(ResourceRuleSchema)`, already validated - duplicate ids,
   `maxRule.classId` reference checks, and a `resourceIds` set that unions
   pack-level resources with trait-granted ones to validate `consumeResource`.
   The section is fully wired and completely empty. Moving
   `RESOURCE_DICTIONARY`'s two fighter entries into it also fixes Relentless
   Endurance, whose resource has no rule today and so is returned untouched by
   `applyRest` - it never resets.
2. **`mode: "uses"`** across the shared schemas, the pack JSON schema, the
   database, `ResourceManager` and `restedCharges`.
3. **The `self_save` effect** in the action union and the resolver.
4. **`RelentlessRageEngine.describe`**, a pure reporter modelled on
   `SurpriseEngine`: `{ currentHp, activeStates, usesSinceRest }` in,
   `{ available, dc, summary }` out. Available only at 0 HP with
   `status_raging`.
5. **Pack authoring** on the existing `trait_relentless_rage` placeholder.
6. **Sheet, store and socket** so the counter is authoritative across clients.

## Deliberately Not Modelled

- **"and don't die outright."** Massive-damage instant death does not exist
  anywhere in the engine. Pre-existing, shared with Relentless Endurance.
- **Rage ending when you fall unconscious.** There is no unconscious or dying
  state in the codebase. A failed save leaves the character at 0 and still
  flagged raging, so the sheet keeps offering the now-harder save.

## Related Findings

- HP transition detection (`delta < 0 && previousHp > 0 && targetHp === 0`)
  lives only in the web store's `resolveHealthTransition`, so
  `ON_HP_REDUCED_TO_ZERO` fires in the browser and nowhere else. Relentless
  Endurance is therefore client-only and not authoritative, unlike surprise and
  the turn lifecycle. Not a blocker for this design, which needs no transition
  and no event, but it constrains how the counter is synced.
- The engine does already read current HP: `characterEngine.ts` sets
  `currentHp: save.hp.current` onto the LiveSheet.
