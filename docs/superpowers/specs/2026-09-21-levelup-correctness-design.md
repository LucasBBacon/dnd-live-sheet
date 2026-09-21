# Level-up correctness — picked feats take effect; prerequisites use final scores

**Date:** 2026-09-21
**Branch:** `fix/levelup-correctness`
**Backlog items:** #75, #77 (and #76's `useCheckRoll` symptom).

## Problems

**#75 — a feat picked at level-up does nothing.** The level-up wizard's
ASI-or-feat step sends `featId`. `applyLevelUp`
(`apps/server/src/controllers/characterController.ts`) resolves the feat's
traits from the `feat_traits` reference table (falling back to a trait with the
feat's id) and writes them as `character_traits` rows with
`source: "feat_selection"`. Neither the server's save nor the web store's
reads those rows — `CharacterBootstrapper.resolveGrantedTraitIds` builds traits
from race, background and classes only — so the feat never reaches either
sheet. An ASI works, because it is written into the stored score columns.

**#77 — prerequisites read pre-racial scores.** Stored ability scores are
pre-racial (character creation, and since `fix/sheet-modifiers` the samples).
Two readers use them where the rules want the character's actual scores:

- Multiclass prerequisites — `validateMulticlassPrerequisites` in
  `applyLevelUp`, and `assessMulticlassPrerequisites` in
  `databaseReferenceProvider`, which decides which classes the level-up wizard
  offers for a dip (via `loadCharacterBaseScores`). Sister Aveline (human,
  stored STR 12, final 13) is now refused a fighter dip that `main` allowed
  before the samples moved to pre-racial storage.
- `useCheckRoll` (`apps/web/src/hooks/useCheckRoll.ts`) passes `baseScores` as
  `abilityScores` to dice rules, so Indomitable Might's floor (the character's
  Strength *score*) uses the pre-racial value; it also gates dice rules on the
  raw composed `activeStates` (#76).

## Design

### #75 — feats live in `choices`, and the bootstrapper grants their traits

1. **Shared.** `CharacterChoicesSchema` gains `feats: z.array(z.string()).default([])`
   — the feats taken, in order. `CharacterSaveSchema` gains
   `feats: z.array(z.string()).default([])`. `CoreRulePackSnapshot` /
   `toRuleSnapshot` gain `featsById`; `packRulebook`'s `EMPTY` gains it too.
2. **Engine.** `RuleSnapshotLookup` gains `featsById`, with
   `resolveFeatDefinition(featId, snapshot)` beside `resolveBackgroundDefinition`.
   `resolveGrantedTraitIds` appends each feat's `grantedTraitIds`; an unknown
   feat grants nothing (as an unknown race or background does).
3. **Save builders.** The server's `toCharacterSave`
   (`apps/server/src/services/characterSave.ts`) and the web store's pass
   `choices.feats` into `save.feats`.
4. **Level-up.** When the payload has `featId`, `applyLevelUp` (inside its
   transaction, before any write) rejects a feat the pack does not define
   (`Invalid character choices: unknown feat <id>`) and a non-repeatable feat
   the character already has (`Invalid character choices: <id> already taken`),
   then appends it to `choices.feats` in the merged choices it already writes.
   It no longer writes `feat_selection` rows, and the `feat_traits` / `traits`
   reference-table lookups that fed them are removed.

### #77 — one helper computes final scores for the server

5. `finalAbilityScores(save, snapshot)` in
   `apps/server/src/services/characterSave.ts` returns `{ str, dex, con, int,
   wis, cha }`: each stored score run through `AbilityEngine.calculateScore`
   with the trait modifiers `gatherSheetModifiers` gathers (no inventory, an
   empty effect manager). It includes racial bonuses, feats and class features;
   it deliberately excludes magic items, because these endpoints do not load
   inventory and item bonuses to prerequisites are a table ruling.
6. `applyLevelUp`'s multiclass check passes `finalAbilityScores` of the
   character's current save (before this level) instead of the stored columns.
7. `databaseReferenceProvider`'s dip preview replaces `loadCharacterBaseScores`
   with a loader that builds the character's save (row, ordered class ledger,
   stored choices) and returns `finalAbilityScores` of it.
8. **Web.** `useCheckRoll` takes `finalAbilities` and `activeStates` from
   `useAbilities()` and passes the final scores as `abilityScores` and the
   sheet states as `activeStates`.

## Testing

- Shared: `choices.feats` and `save.feats` default to `[]`; `toRuleSnapshot`
  keys feats.
- Engine: a save with `feats: ["feat_alert"]` grants `feat_alert`'s traits; an
  unknown feat grants nothing.
- Server: `toCharacterSave` carries feats; level-up with `featId` appends to
  `choices.feats`, writes no `feat_selection` row, rejects an unknown feat and
  a repeat; `finalAbilityScores` gives a human stored STR 12 a final 13; a
  fighter dip from a human with stored STR 12 / final 13 is allowed; the dip
  preview reports it met.
- Web: the store compiles a stored feat's traits; `useCheckRoll` hands dice
  rules the final scores and the sheet states.

## Hand check

Level Sister Aveline (cleric 3) to cleric 4 in the running app, taking Alert:
her initiative on the sheet rises by 5 and `characters.choices.feats` holds
`feat_alert`. The level-up wizard offers her a fighter dip (final STR 13).
Requires the owner's permission to write to the dev database.

## Out of scope

- Branch B (the choice-step UI).
- Skilled's own choice block (#66).
- Magic items in prerequisites.
- The rest of #76 (the store's composed `activeStates`).
