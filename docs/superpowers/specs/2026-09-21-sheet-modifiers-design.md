# Sheet modifiers — the web sheet uses the same modifiers as the server

**Date:** 2026-09-21
**Branch:** `fix/sheet-modifiers`
**Backlog item:** #73.

## Problem

Everything the web sheet derives — ability scores, max HP, initiative, AC,
skills, saves, attacks per action, combat — reads one list, `totalMods`, which
`useAbilities` (`apps/web/src/hooks/useCharacterStats.ts`) builds as
`[...activeModifiers, ...equipmentMods]`. `activeModifiers` is set only by the
dev-only `TraitWidget` (`/dev/traits`); on the live sheet it is always `[]`.
So the live sheet has:

- **no trait modifiers** — racial ability bonuses fixed and chosen, fighting
  styles such as Defense, the barbarian's Unarmored Defense, Draconic
  Resilience, and every other trait modifier; and
- **no live effect modifiers** from its own `runtimeEffects` `EffectManager`.

The server's `CharacterEngine.buildLiveSheet` gathers all three — trait
modifiers with the save's selections (`ModifierExtractor`), equipment
(`InventoryExtractor`) and live effects (`effectManager.getActiveModifiers()`)
— so the server and the sheet disagree about every derived number.

**A second, hidden defect.** The ten sample characters store *final* scores,
racial bonuses included (e.g. Ko Shen's DEX 20 and Thistle's INT 20 exceed
creation's 18 pre-racial cap; Nyx's tiefling CHA 19 is 17 + 2). Character
creation stores *pre-racial* scores (`wizardStore.ts`: "3-18 pre racial"). The
server, which does apply racial bonuses, therefore already double-counts them
for every sample; the web sheet hid it by applying none.

## Design

### 1. One gather — `@project/engine`

A new module `packages/engine/src/pipeline/sheetModifiers.ts` exports

```ts
gatherSheetModifiers(input: {
  activeTraits: TraitDefinition[];
  selections: Record<string, string[]>;
  inventory: InventoryInstance[];
  effectManager: EffectManager;
  snapshot?: RuleSnapshotLookup;
}): RuntimeModifier[]
```

returning `[...traitModifiers, ...equipmentModifiers, ...liveModifiers]` in that
order — exactly what `buildLiveSheet` assembles today as `allModifiers`.
`buildLiveSheet` calls it instead of assembling the list itself, so the server's
behaviour is unchanged and there is one definition. Exported from the engine's
barrel.

### 2. The web sheet uses it — `@project/web`

- The store gains `getSheetModifiers(): RuntimeModifier[]`:
  `gatherSheetModifiers` over the store's compiled traits
  (`CharacterBootstrapper.compileActiveTraits(toCharacterSave(state), snapshot)`),
  the save's selections (`CharacterBootstrapper.resolveSelections`), the store's
  `inventory`, its `runtimeEffects` (a fresh empty `EffectManager` when null)
  and `ruleSnapshot` — followed by `activeModifiers`, which stays as the dev
  `TraitWidget`'s extra override layer.
- `useAbilities` builds `totalMods` from `getSheetModifiers()` instead of
  `activeModifiers` plus its own equipment extraction, and recomputes when any
  input changes: `baseScores`, `raceId`, `subraceId`, `backgroundId`,
  `classLevels`, `subclassIds`, `choices`, `inventory`, `activeModifiers`,
  `activeStates`, `runtimeEffects`, `ruleSnapshot`. Everything downstream of
  `totalMods` (`useDerivedStats`, `useCombat`) follows unchanged.

### 3. The samples store pre-racial scores

Each sample's stored `str`..`cha` in `seedSampleCharacters.ts` loses its racial
bonuses — the race's and subrace's fixed ability modifiers and the chosen ones
(Lyra's half-elf `half_elf_asi_choice`). The intended *final* scores are exactly
today's stored values; a test holds the final scores computed from the stored
scores and the gathered trait modifiers equal to them. The samples therefore
look the same on the sheet, and the server stops double-counting.

### 4. Base states — added after the first hand check

With trait modifiers applied, the first hand check showed Defense (+1 AC, requires
`status_wearing_armor`) missing for Sable and Vaerix: the web store's `baseStates` is
always `[]` and its `activeStates` is composed only on events, so the trait and
worn-equipment states the server puts in `buildLiveSheet`'s `baseStates` never reach
the web. Left alone, an armoured barbarian would get Unarmored Defense on the sheet.
So the engine also exports `gatherBaseStates` (trait states, live-effect states when
given an effect manager, equipment states), used by `buildLiveSheet` and by a web
store getter `getSheetStates` that the derived-stat hooks gate on. The same check
showed Nyx at AC 15 in studded leather: the pack authors Draconic Resilience's AC 13
with no `forbiddenStates`; it gains `["status_wearing_armor"]`, like Unarmored
Defense.

## Testing

- Engine: `gatherSheetModifiers` returns a trait's fixed and chosen modifiers,
  an equipped item's modifier and a live effect's modifier, in that order;
  `buildLiveSheet`'s existing suite stays green.
- Web store: a half-elf with a stored ASI choice gets CHA +2 and the chosen
  +1s through `getSheetModifiers` and `AbilityEngine.calculateScore`; a
  barbarian's Unarmored Defense reaches `DerivedStatEngine.calculateAC`.
- Web hook: `useAbilities` feeds `getSheetModifiers()` into every score (the
  existing mocked-store tests move from `activeModifiers` to the getter).
- Seeds: for every sample, the computed final scores equal the intended finals.

## Hand check

Baselines recorded on `main` at `fa8e657`, before this branch:

| Sample | Scores STR/DEX/CON/INT/WIS/CHA | HP | AC |
| --- | --- | --- | --- |
| Lyra Silverstring | 9/16/13/12/10/18 | 45/45 | 16 (studded leather 12 + DEX 3 + cloak 1) |
| Dame Sable Orrin | 20/14/20/10/12/14 | 224/224 | 22 (plate 18 + shield 2 + cloak 1 + ring 1) |
| Master Ko Shen | 12/20/16/10/18/8 | 99/99 | 15 (unarmored 10 + DEX 5) |
| Grimnar Stonefist | 19/14/17/8/12/10 (STR from an item) | 22/55 | 12 (unarmored 10 + DEX 2) |
| Nyx Vale | 8/14/14/13/10/19 | 1/77 | 14 (studded leather 12 + DEX 2) |
| Vaerix the Ashen | 18/10/16/10/12/16 | 61/85 | 19 (half plate +1 16 + shield 2 + ring 1) |

Expected after this branch, with the samples migrated to pre-racial scores and
re-seeded: every score unchanged; Grimnar's AC 15 (barbarian Unarmored Defense,
10 + DEX + CON); Sable 23 and Vaerix 20 (Defense, +1 in armour); Ko Shen
unchanged at 15, because `trait_unarmored_defense_monk` is still an
unimplemented stub; Nyx's AC unchanged (Draconic Resilience applies only
unarmoured, and she wears armour), her max HP possibly +3 from its per-level HP
bonus.

## Out of scope

- Feat-granted traits: `feat_selection` `character_traits` rows never reach the
  web store's save, so feat modifiers still miss the sheet. A separate backlog
  item (store-level), recorded by this branch.
- Authoring the monk's Unarmored Defense (part of the #30 burndown).
