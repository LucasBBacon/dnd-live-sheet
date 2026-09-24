# Hit points and level-up — the floor, the scaling, the preview, the lock, the ledger

**Date:** 2026-09-23
**Branch:** `fix/hp-level-up`
**Backlog items:** #86, #87, #88, #94, #95 — all closed by this branch.

## Problem

Five open items, all in the hit point and level-up path that `fix/hit-points`
(#78) and `fix/hp-authority` (#89, #90, #93) built. Each was re-checked
against the code at `3fc62d0` before this design:

1. **#86 — the one-hit-point-per-level floor is applied to the wrong thing.**
   `DerivedStatEngine.calculateMaxHp`
   (`packages/engine/src/calculators/derivedStats.ts:48`) computes
   `Math.max(1, conModifier) * levels.total`, flooring the Constitution
   modifier itself at +1. The rule floors each level's *whole* gain — roll
   plus modifier — at 1. Every character with a Constitution modifier of 0 or
   less shows too many hit points: a new CON 10 cleric opens at 9/9, not 8/8,
   and Seraphine Dusk (CON 8, wizard 9) shows 47 where the rules give 29.
2. **#87 — Draconic Resilience does not scale, silently.** Its `MAX_HP`
   modifier (`traits/ported.json`) is authored `scalingFactor: "class_level"`
   with no `scalingClassId`, and `resolveScaledValue` falls through to the flat
   value. A Draconic Bloodline sorcerer gains 1 hit point instead of 1 per
   sorcerer level; Nyx Vale derives 78 where the rules give 80. Nothing warns.
   It is the only such modifier in the pack.
3. **#88 — the level-up review step previews the wrong gain.**
   `ReviewStep.tsx:51` shows `hpRoll + projectedConMod`. The server stores
   `levelUpHitPointGain` — the maximum after the level minus the maximum
   before it — which also counts an ability score increase raising every
   earlier level's Constitution contribution. Brannoc Hale at fighter 3 → 4
   with +1 CON gains at least 3 more than the preview says.
4. **#94 — two concurrent level-ups both apply.** `applyLevelUp` reads the
   character without a row lock. A double-click sends two requests that both
   read a ledger summing 3, both pass #90's check, and both add hit points;
   the class-row write is idempotent, so the character ends at level 4
   carrying two levels of hit points.
5. **#95 — a drifted row can never level up.** Both Level Up entry points
   send `newTotalLevel` from the level *column* (`DashboardLayout.tsx:138`
   `character.level + 1`; `OverviewStep.tsx:109` `state.level + 1`), while
   the server derives the expected level from the class *ledger* and rejects
   a mismatch (#90). A row whose column has drifted from its ledger gets a
   400 on every level-up. The server already writes the column from the
   ledger on success, and the web store's own `getMaxHp` already sums the
   ledger (`characterSheetStore.ts:1589`); only the two callers read the
   column.

## Decisions (owner, 2026-09-23)

1. **#86 floors the total, not the modifier.** Constitution contributes
   `conModifier × total level`, negative included; the rolled-plus-Constitution
   sum is floored at `total level`. No schema change. Per-level rolls are not
   stored, so a single level whose roll plus a negative modifier falls below 1
   is understated by the shortfall — recorded, not solved.
2. **#87 is fixed in the pack and made loud in validation.** The modifier gains
   `scalingClassId: "class_sorcerer"`; `validatePack` rejects any modifier
   scaled by class level that names no class.
3. **#88's preview comes from the server.** A read-only preview endpoint builds
   the same before/after saves `applyLevelUp` builds and returns the
   maximum before, after and the gain. The web never approximates it.
4. **#94 takes a row lock** on the character read in `applyLevelUp`.
5. **#95 is fixed in the callers.** Every web caller derives the total level
   from the class ledger. A drifted row then levels up normally and the
   server's existing write repairs its column. No reconciliation script.
6. **The backlog's Recommended sequence moves #31a ahead of the rogue pass.**
   Since #79 every caster's creation and level-up asks spell questions whose
   options are 111 level-0 placeholders.

## Design

### #86 — `calculateMaxHp`

```
rolledAndCon = baseHpRolled + conModifier × levels.total
total        = max(levels.total, rolledAndCon) + MAX_HP modifiers
```

- The breakdown keeps "Base HP Rolled" and "CON (±m) x Level (L)" (now the
  unfloored `m × L`). When the floor lifts the sum, it adds a line
  **"Minimum 1 HP per level"** with the amount it added.
- `MAX_HP` modifiers — Tough, Dwarven Toughness, Draconic Resilience — are
  added after the floor, unchanged.
- The doc comment states the residual: rolls are stored as a sum, so the floor
  is exact unless one level's roll plus a negative modifier is below 1.

Both sheets and the server read this one function (the web store's
`getMaxHp`, the server's `finalMaxHp`), so no other code changes.

**Moved numbers:** Seraphine 47 → 29. The server's `characterSave.test.ts`
"gives at least one hit point per level…" case (a human Draconic sorcerer 3,
CON +0, base 10) goes 14 → 11 in this slice and 13 after #87. The web store's
test block fixture (base 9, CON +0, level 1, currently a maximum of 10) raises
its `baseHpRolled` to 10 so every case built on a maximum of 10 keeps it; the
"derives the maximum…(#78)" case's comment says why. No sample with a positive
modifier moves.

### #87 — Draconic Resilience and `validatePack`

- **Pack:** `trait_draconic_resilience`'s `MAX_HP` modifier gains
  `"scalingClassId": "class_sorcerer"`, applied through
  `packages/database/scripts/patchPackSegment.ts` (the sanctioned tool;
  `traits/ported.json` is not one of the four files it reformats — confirm with
  a no-op round-trip first).
- **Validation:** `packages/shared/src/schemas/content/validatePack.ts` gains a
  rule: every modifier whose `scalingFactor` is `class_level` or
  `class_level_thresholds` must carry `scalingClassId`. The error names the
  owning entity and the modifier's target. The walk covers every place a
  modifier lives in the pack (trait fixed and choice modifiers, equipment
  modifiers, and any other `modifiers` array the pack schema defines).
- **Moved numbers:** Nyx 78 → 80 (and the comment beside it goes).
- The engine's silent fallback in `resolveScaledValue` stays: the validator is
  where a pack learns about it.

### #88 — the preview endpoint

**Server.**

- `POST /api/character/:characterId/level-up/preview`, in
  `apps/server/src/routes/character.ts` beside the level-up route, with the
  same authentication, 404 and campaign-membership checks.
- Body: the wizard's draft — `targetClassId` and `hpRoll` required;
  `asiChoices`, `featId`, `subclassId`, `selectedTraits`, `traitSelections`
  optional. Anything else is ignored. Missing `targetClassId` or a non-numeric
  `hpRoll` is a 400.
- Response: `{ maxHpBefore, maxHpAfter, hitPointGain }`, where
  `maxHpBefore = finalMaxHp(saves.before, snapshot)` and
  `hitPointGain = levelUpHitPointGain({ saves, payload, snapshot })`
  (`maxHpAfter` is their sum).
- Read-only: no transaction, no lock, no validation of choices — the preview
  answers "what would this draft do to hit points", and the real submit still
  validates everything.
- **One loader.** `applyLevelUp`'s steps 1–2 (character row, class ledger),
  the stored choices, the snapshot and `buildLevelUpSaves` move into one
  function in `characterController.ts` that both handlers call.
  `applyLevelUp` passes its transaction and asks for the row lock (#94); the
  preview passes the pool and does not. `applyLevelUp`'s behaviour is
  otherwise unchanged.

**Web.**

- `levelUpStore` gains the preview's state (`idle | loading | ready | error`
  with the three numbers) and an action that requests it with the current
  draft.
- `ReviewStep` requests it when it opens and again if the roll, ability score
  increases, feat or subclass change while it is open. It shows the server's
  before, after and gain; "Calculating…" while pending; "Hit point preview
  unavailable" on failure — never an approximation.
- `apps/web/src/utils/levelUpReview.ts` (`getProjectedConModifier`) and its
  tests in `apps/web/src/hooks/__tests__/useCharacterStats.test.ts` are
  deleted; it has no other callers.

### #94 — the row lock

`applyLevelUp`'s character select (inside the shared loader, when called with
the lock) ends in `.for("update")`. A second concurrent request blocks until
the first commits, then reads the ledger the first wrote, derives a level one
higher than it sent, and fails #90's check with the existing message.

### #95 — the ledger total

- One exported helper in the web store module returns the total level from a
  `classLevels` ledger. `getMaxHp` uses it in place of its inline sum.
- `DashboardLayout`'s Level Up button, `OverviewStep`'s class switcher and its
  "Total Level" label, and `ReviewStep`'s "Total Character Level" row all use
  it instead of the level column.
- The sheet header still shows `character.level`; changing that is out of
  scope.

## Tests

Test-first per slice. Beyond the moved numbers above:

- **Engine** (`derivedStats.test.ts`): the floor test is rewritten. New cases:
  a zero modifier adds nothing; a negative modifier is floored at 1 per level
  and the breakdown carries the "Minimum 1 HP per level" line; a positive
  modifier is unchanged; `MAX_HP` modifiers add after the floor.
- **Pack validation:** a pack with a `class_level` modifier and no
  `scalingClassId` fails and names the trait; the shipped pack passes.
- **Lock:** the level-up route harness asserts the character read calls
  `.for("update")`, as `combatService.test.ts` does for its HP path.
- **Ledger callers:** the helper; `beginLevelUp` receives ledger + 1 from both
  callers when a fixture's column disagrees with its ledger.
- **Preview:** a level whose ability score increase raises Constitution returns
  the same gain `applyLevelUp` stores for that payload; 400 without a class or
  roll; the level-up route's access checks. `ReviewStep` renders the server's
  numbers, the pending state and the failure state.

## Docs

- **`docs/development/sample-characters.md`:** Seraphine's #86 step (the sheet
  shows 29), Nyx's maximum (80), Brannoc's #88 and #94 steps (now regression
  checks: the preview matches the stored gain; the second request is refused),
  Brother Mote's #95 step (the level-up succeeds and the ledger reaches 12).
- **`docs/TODO_BACKLOG.md`:** #86, #87, #88, #94 and #95 move to Closed items
  with their fixes; #86's entry records the per-level-roll residual. The
  Recommended sequence moves #31a ahead of the rogue pass, with its reason.

## Out of scope

- Storing per-level rolls.
- The sheet header reading the ledger.
- Server-side trigger resolution (#92), socket payload validation (#96), and
  the action/resource items #97–#100.

## Verification

1. `DATABASE_URL= pnpm test:all` green; `pnpm typecheck --force` and
   `pnpm check:hygiene` green.
2. **With the owner's go-ahead** — #87 reaches the running server only through
   `db:import-pack`, which CASCADE-deletes every character — import the pack,
   re-seed the samples, restart the server, then check: Seraphine 29, Nyx 80,
   Brannoc's review preview equals the gain the level-up stores, a second
   concurrent submit is refused, and Brother Mote levels up.
