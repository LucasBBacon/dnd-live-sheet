# The Pack Snapshot Reader

Date: 2026-08-19
Status: Slices 1 and 2 complete; server and web wiring outstanding
Owner: Claude pair session

## Goal

Let authored rule packs reach a character. Before this, they could not: three sessions of trait authoring produced content no character could hold.

## What Was Wrong

A probe of the engine's runtime maps:

```
TRAIT_DICTIONARY[trait_reckless_attack]: MISSING
TRAIT_DICTIONARY[trait_danger_sense]:    MISSING
TRAIT_DICTIONARY[trait_extra_attack]:    MISSING
TRAIT_DICTIONARY[trait_rage]:            MISSING
TRAIT_DICTIONARY[trait_second_wind]:     MISSING
races: 0    class_barbarian: absent
```

`compileActiveTraits` reads `TRAIT_DICTIONARY[traitId]` and silently drops what it cannot find. The pack held 106 traits, 9 races and the barbarian; nothing read them.

The 47 red tests carried across the whole session were this, not background noise.

## Design

**Snapshot first, dictionary fallback.** The dictionaries are a bridge for definitions not yet authored into a pack, not a second permanent source. They stay reachable because content is being migrated incrementally, and they are meant to shrink to nothing.

**Three resolvers in `ruleLookup`**, matching the `resolveItemDefinition` pattern already used for items, weapons and resource rules. Two dead dictionary-only resolvers (`resolveRaceDefinition`, `resolveClassDefinition`, zero callers each) were removed rather than left to collide.

**An optional snapshot parameter** on every `CharacterBootstrapper` entry point and on `buildLiveSheet` / `dispatchTraitEvent`. Optional so no existing caller changed behaviour — the same defaulting discipline used for `economyPolicy`.

**`toRuleSnapshot` in shared** turns a validated pack into the three maps. Pure: no file access, no validation, no reshaping.

**Tests supply the real pack.** `corePackFixture.ts` reads the shipped pack from disk, validates it through `CoreRulePackSchema`, and hands the engine suites the same content production will. A hand-written stub would have drifted from what ships; these suites are the only place the engine and the rulebook meet.

## Corrections Made Along The Way

Three things I asserted turned out to be wrong, and are recorded because each changed the work:

1. **"The pack race shape is field-for-field identical to the engine's."** Nearly. I then said subraces were an array needing mapping to a record — also wrong. Packs author subraces **as a record already**, matching the engine exactly. It was `CoreRaceSchema` that declared an array, agreeing with neither. That is why no pack had ever validated.

2. **"The 43 red engine tests are the acceptance criterion."** Only for races. Fighter, monk and the rest have no class features in the pack *or* the dictionary, so those gaps are content work, not something a reader can close.

3. **"Snapshot-with-fallback is the permanent architecture."** Corrected by Lucas: the dictionaries are transitional scaffolding.

## Pack Data Fixed

The shipped pack did not validate against its own schema. Two distinct problems, 18 issues:

- **Six traits had `shortDescription` identical to `fullText`**, running to 1116 characters against a 280 cap. The migration had pasted full rule text into both fields. Genuine summaries were written; `fullText` was left untouched.
- **All nine races failed on `lore` and `subraces`.** `lore` is now optional on races and subraces — descriptive, not mechanical, and the packs are admittedly incomplete. `subraces` is now a record, matching the data and the engine.

`validateCoreRulePack` and `corePackProjection` were updated to iterate subraces as a record and tolerate absent lore.

## Result

| Suite | Before | After |
| --- | --- | --- |
| `@project/shared` | 181 passed | **187** passed |
| `@project/engine` | **43 failed** / 627 passed | **0 failed / 677 passed** |
| `@project/database` | 4 failed / 85 passed | **0 failed / 89 passed** |
| `@project/server` | 1 failed / 302 passed | 1 failed / 302 passed |
| `@project/web` | 3 failed / 264 passed | 3 failed / 264 passed |

**The 47-test baseline is down to 4.** Typecheck passes across all five packages, hygiene passes, lint is clean.

## The Four Remaining

All four need the pack loaded on the server and web, which is the outstanding slice:

| Suite | Test | Needs |
| --- | --- | --- |
| server | `covers every class in the rulebook` | `class_barbarian`, pack-only |
| web | `surfaces critical damage expressions granted by active traits` | `savage_attacks`, a half-orc trait |
| web | `drops a half-orc to one hp…` | `relentless_endurance`, pack-only |
| web | `replays the same trigger…` | as above |

## Outstanding Work

1. **Server loads the pack at boot.** `initialiseRulePack()` beside `initialiseReferenceProvider()`, one process-wide snapshot passed through `getAuthoritativeRuntimeContext`. The disk-reading logic in `corePackFixture.ts` is the shape to promote into production, in `@project/database` where data belongs.
2. **Web ships it.** `RulesSnapshotPayload`'s `Pick` widens to carry the three maps; the store's `ruleSnapshot` type follows; the store passes it into its bootstrapper calls.
3. **Then the dictionaries can start shrinking.** Every class feature currently missing from both sources — Rage aside — is content authoring, tracked separately.
