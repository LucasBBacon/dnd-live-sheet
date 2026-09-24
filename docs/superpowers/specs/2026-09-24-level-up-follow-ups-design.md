# Level-up follow-ups — refresh, payload checks, the per-level minimum, the ledger everywhere

**Date:** 2026-09-24
**Branch:** `fix/level-up-follow-ups`
**Backlog items:** #104, #105, #106, #107, #108, #109 — all closed by this
branch. #110 and #111 are recorded by it.

## Problem

Six open items recorded by `fix/hp-level-up` (its live check and its final
review), all in or beside the level-up path it just worked:

1. **#104 — the sheet shows the old character after its own level-up.**
   `levelUpStore.validateAndSubmit` posts the level-up and resets the wizard;
   nothing invalidates the sheet's `["character", characterId]` query
   (`apps/web/src/pages/LiveSheetRoute.tsx`). The sheet keeps the old level,
   hit points, scores and grants until a reload, and a second level-up from
   the same tab is refused: it sends `ledgerTotalLevel + 1` from the stale
   ledger while the server's already stands one higher.
2. **#105 — the hit point step offers a d8 while the class list loads.**
   `HpRollStep` defaults `selectedClass?.hitDie ?? 8`, so for a moment a
   fighter is offered "Take Average 5" and "Roll 1d8", and both buttons work.
3. **#106 — the level-up payload is trusted.** Nothing checks that an
   `asiChoices` stat is an ability, that values are integers, that they total
   2, that a stat appears once, or that a score stays at or below 20; `hpRoll`
   is unbounded. Since #103 the increase is stored, so a crafted payload
   writes nonsense scores; the preview answers NaN in a 200.
4. **#107 — a level can gain less than 1 hit point.** #86 floors the
   rolled-plus-Constitution *sum* at 1 per level; rolls are stored only as a
   sum (`characters.max_hp`). With a negative modifier a low roll adds 0 (CON
   8–9, roll 1) or −1 (CON ≤ 7), and the review shows "+-1".
5. **#108 — `validateClassScaling` checks that a class is named, not that it
   exists.** A mistyped `scalingClassId` contributes nothing, silently.
6. **#109 — the sheet reads the level column.** `useDerivedStats` takes the
   proficiency bonus and `attacksPerAction` from `state.level`, beside an
   inline copy of the ledger sum under a comment false since #90; the
   `DashboardLayout` header and the `TraitWidget` debug line show the column.

## Decisions (owner, 2026-09-24)

1. **#104 refreshes this tab only.** Other tabs and viewers stay stale until
   reloaded (their next level-up is refused by the existing 400); broadcasting
   a level-up becomes **#111**.
2. **#107 lifts the stored roll.** A level-up stores
   `max(hpRoll, 1 − CON modifier)` so the new level adds at least 1 at the
   Constitution it is taken with. No schema change. Residual, recorded: a later
   Constitution increase also counts the lift, overstating by roughly one hit
   point per lifted level.
3. **#109 switches all four readers** — proficiency bonus, attacks per action,
   the header badge and the TraitWidget line — to the class ledger.
4. **One server helper per concern, shared by both routes** (approach A):
   `levelUpHitPoints` for the roll and the gain, `checkLevelUpNumbers` for
   #106's rules.

## Design

### Server — #106 and #107

**`levelUpHitPoints({ saves, payload, snapshot }) → { storedRoll, gain }`**
replaces `levelUpHitPointGain` in
`apps/server/src/controllers/characterController.ts`.

- Builds the character after this level with this level's ASI applied (as
  `levelUpHitPointGain` does now, through `abilityColumn`).
- Reads the final Constitution modifier of that character — after this
  level's ASI, with racial and trait modifiers (`finalAbilityScores`).
- `storedRoll = max(hpRoll, 1 − conModifier)`; with a modifier of 0 or more
  it is the roll.
- `gain` = the final maximum after (base rolled + `storedRoll`) minus the
  final maximum before.
- `applyLevelUp` adds `storedRoll` to `max_hp` and `gain` to `current_hp`;
  `previewLevelUp` returns `gain`. The two still cannot disagree.
- The doc comment states the residual (Decision 2).

**`checkLevelUpNumbers({ payload, scoresBefore, hitDie })`**, a new module
`apps/server/src/services/levelUpNumbers.ts` (not `levelUpValidation.ts`,
which the route harness mocks wholesale). Both handlers call it immediately
after loading the saves and before any write, with
`finalAbilityScores(saves.before, snapshot)` — race and traits, no items,
which is the score the rules cap — and the target class's `hitDie` from
`snapshot.classesById`.

- `hpRoll` is an integer from 1 to the hit die.
- `asiChoices`, when present, is an array of one or two entries; each `stat`
  is one of `AbilitySchema`'s six and appears once; each `value` is a
  positive integer; the values total exactly 2; no resulting score exceeds
  20.
- A failure throws `Invalid character choices: …`; both routes already answer
  400. The preview answers 400 where it answered NaN.
- Unchanged: an ASI only at a level offering one, and not with a feat.

The per-column totalling added by the last branch's final fix wave stays, a
cheap guard at the write, though duplicates are now rejected before it.

### Web — #104, #105, #107's display, #109

- **#104.** `LevelUpWizard.handleSubmit` calls
  `queryClient.invalidateQueries({ queryKey: ["character", characterId] })`
  after `validateAndSubmit` resolves (the id from the sheet store). The route
  refetches and its existing effect re-hydrates the store. A failed submit
  invalidates nothing.
- **#105.** `HpRollStep` has no default die. While `/reference/classes`
  loads it shows "Loading hit die…" with no buttons; loaded without the class,
  "Hit die unavailable" with no buttons (Next stays disabled).
- **#107's display.** `ReviewStep` signs the hit point gain properly —
  "+13", "+0", "−1" — rather than `+${gain}`.
- **#109.** `useDerivedStats` computes the proficiency bonus,
  `attacksPerAction` and `maxHp` from `ledgerTotalLevel(classLevels)`; the
  inline sum and its comment go. The `DashboardLayout` header badge and the
  `TraitWidget` "Level:" line use it too. The store keeps its `level` field as
  loaded; nothing reads it. `ledgerLevel.ts`'s docstring becomes true.

### Shared — #108

`validatePack` gains the issue code `unknown_scaling_class`: any entry whose
`scalingClassId` is not an id in `pack.classes` fails, naming its owner and
the id, through the same whole-pack walk as `missing_scaling_class`.

## Tests

Test-first per slice.

- **`levelUpHitPoints`**: no lift at a modifier of 0 or more; CON 8 with a
  roll of 1 stores 2 and gains 1; CON 6 with a roll of 1 stores 3 and gains
  1; the lift uses Constitution after this level's ASI.
- **`checkLevelUpNumbers`**: one case per rule, plus a valid +2 and a valid
  +1/+1.
- **Routes**: a bad payload is a 400 from both the level-up and the preview;
  the duplicate-stat route test from the last branch now expects the 400.
- **`LevelUpWizard`** (new test file): success invalidates
  `["character", id]`; failure does not.
- **`HpRollStep`** (new test file): loading shows no Take Average; a fighter
  shows a d10 and 6.
- **`ReviewStep`**: a zero and a negative gain render "+0" and "−1".
- **#109**: a drifted fixture (column 5, ledger 4) gets proficiency +2, not
  +3; the header shows 4.
- **#108**: a fixture with `class_sorceror` fails naming its trait; the
  shipped pack passes.

## Docs

- **`docs/TODO_BACKLOG.md`**: close #104–#109 with their fixes; #104's entry
  points the broadcast at #111; #107's records the residual. New open items:
  **#110** — the wizard's ASI step and review rows cap and show against
  `finalAbilities`, which includes equipment, so an item that sets a score
  misstates the base and cuts the cap (the server caps race-and-traits
  scores); **#111** — a level-up is not broadcast, so other tabs and viewers
  stay stale. Index rows, status paragraph and test count.
- **`docs/development/sample-characters.md`**: Brannoc's step 3 reads 44/44
  as soon as the wizard closes; a new step levels him again (fighter 5) in the
  same tab; a #106 console check (`asiChoices: [{ stat: "CON", value: 3 }]` →
  400 from both routes). Mote's step 1: the column still says 12, the sheet
  shows 11 everywhere. Seraphine: a #107 console check — the preview with
  `hpRoll: 1` gains 1.

## Out of scope

- Broadcasting a level-up (#111).
- The wizard's item-inclusive ASI cap (#110).
- Storing per-level rolls.
- Socket payload validation (#96).

## Verification

1. `DATABASE_URL= pnpm test:all` green; `pnpm typecheck --force` 5/5;
   `pnpm check:hygiene` passes.
2. Live, on re-seeded samples with the server restarted (the pack is
   unchanged, so no import): Brannoc levels to 4 and the sheet reads 44/44
   without a reload, then levels to 5 in the same tab; the crafted ASI is
   refused by both routes; the hit point step never offers a fighter a d8;
   Seraphine's preview with a roll of 1 gains 1; Mote's header shows 11.
   Anything else found is recorded, not fixed.
