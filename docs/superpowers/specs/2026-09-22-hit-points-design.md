# Hit points — one derived maximum, from a stored base

**Date:** 2026-09-22
**Branch:** `fix/hit-points`
**Backlog items:** #78 (widened: creation writes no hit points, level-up skips
the Constitution modifier, and the engine's derived maximum is never shown).

## Problem

`characters.max_hp` is written three ways and read as a fourth:

1. **Creation writes nothing.** `POST /api/character` inserts no `maxHp` or
   `currentHp`, so both are null; level-up's `maxHp + payload.hpRoll` is then
   `null + n`, which stays null. A character made through the wizard never has
   hit points at all.
2. **Level-up adds the raw roll.** `applyLevelUp` adds `payload.hpRoll` to
   `maxHp` and `currentHp` while every reader treats the column as the final
   maximum, so the Constitution modifier the wizard previews ("Total +CON: 7")
   is lost. Sister Aveline went from 24 to 29 where the wizard promised 31.
3. **The engine's maximum reaches nothing.** `DerivedStatEngine.calculateMaxHp`
   computes base rolled HP + CON x total level + `MAX_HP` modifiers, but the
   server hands it the stored final as its base (`toCharacterSave`'s
   `baseRolledHp`), counting CON twice, and the web store never loads a base at
   all (`baseHpRolled` stays at its default 1). Nothing displays its result
   except a debug line in `TraitWidget`. The pack's three `MAX_HP` traits —
   Dwarven Toughness (+1 per total level), Tough (+2 per total level) and
   Draconic Resilience (+1 per sorcerer level) — reach no sheet, and a
   Constitution increase never raises earlier levels' hit points.

Readers of the column today: the web sheet header, the web store's damage and
heal clamps and long rest, `combatService`'s heal clamp, the socket's long-rest
reset, and the gateway's authoritative runtime context.

## Decisions (owner, 2026-09-22)

1. `characters.max_hp` means **base rolled hit points** — the sum of hit dice
   taken, nothing else. Every displayed or clamping maximum is derived by the
   engine.
2. The ten sample characters keep the hit points they show today: each stored
   value becomes `documented final - final CON x total level`. The derived
   maximum then equals today's number for every sample except Nyx Vale, who
   gains the 1 hit point her Draconic Resilience was always owed.

## Design

### One derivation

`finalMaxHp(save, snapshot)` joins `finalAbilityScores` in
`apps/server/src/services/characterSave.ts`, built the same way: gather the
character's trait modifiers with `gatherSheetModifiers`, then

```ts
DerivedStatEngine.calculateMaxHp(
  save.hp.baseRolledHp,
  conModifier,          // from finalAbilityScores(save, snapshot).con
  { total, classes },   // the same LevelProfile buildLiveSheet builds
  modifiers,
)
```

returning the total. Like `finalAbilityScores` it passes `inventory: []`: no
pack item modifies CON or `MAX_HP`, and its doc comment says an item that did
would have to be passed in. `toCharacterSave` needs no change — it already
feeds the column to the engine as `baseRolledHp`, which stops being a double
count and becomes correct.

Out of scope, recorded instead: `calculateMaxHp` floors the Constitution
contribution at 1 per level, where 5e floors each level's whole gain at 1. The
two differ for a Constitution modifier of zero or below, not just a negative
one, and getting it exact needs per-level rolls the save does not store.

### Writers

- **Creation** (`apps/server/src/routes/character.ts`): `maxHp` = the chosen
  class's full hit die (a cleric's d8 -> 8), 5e's level-1 rule; `currentHp` =
  `finalMaxHp` of the save it just validated, so a new character starts at full
  health with Constitution and any HP trait counted.
- **Level-up** (`apps/server/src/controllers/characterController.ts`):
  `maxHp: maxHp + payload.hpRoll` stays as it is — under the new meaning the
  raw die is exactly what the base grows by. `currentHp` changes from
  `+ payload.hpRoll` to `+ (finalMaxHp(saves.after) - finalMaxHp(saves.before))`,
  computed from the before/after saves `buildLevelUpSaves` already returns. One
  number covers the roll, the Constitution modifier, an ability score increase
  that raises Constitution at that level, and an HP trait the level grants.

### Readers

- **Server:** `combatService`'s heal clamp and the socket's long-rest reset use
  `finalMaxHp` instead of the column. Both already load the character; they gain
  the save and snapshot the helper needs, exactly as `applyLevelUp` builds them.
- **Web:** hydration (`apps/web/src/pages/characterSheetRouteData.ts`) sets
  `baseHpRolled` from the API's `maxHp` — today nothing sets it, which is why
  the client's derived maximum is nonsense. The store's own `maxHp` field is
  removed in favour of one getter, `getMaxHp()`, built like `getSheetModifiers`
  and `getSheetStates`: the sheet header (`DashboardLayout`), the damage and
  heal clamps, the long rest, `RestModal`'s "already at full health" check and
  `TraitWidget`'s debug line all read it. The header then shows the engine's
  number, `MAX_HP` traits included.

### Samples

Each sample's stored `maxHp` becomes `documented final - final CON x total
level`, where the documented final is the value that sample's row carries in
`seedSampleCharacters.ts` today (the final CON after racial bonuses). The arithmetic recovers clean
hit-dice sums, which is the check that the old hand-computed finals were
`base + CON x level`: Sister Aveline 24 - 6 = 18 = 8 + 5 + 5 (cleric d8
averages); Grimnar 55 - 15 = 40 = 12 + 7 x 4 (barbarian d12 averages). Derived
finals then equal today's numbers for every sample but Nyx Vale, who is a
Draconic Bloodline sorcerer 3 and gains +1 (77 -> 78). No sample carries
Dwarven Toughness (Grimnar is a mountain dwarf) or Tough (no sample has
feats).

Nyx gains 1 rather than 3 because the pack authors Draconic Resilience's
`MAX_HP` modifier with `scalingFactor: "class_level"` and no
`scalingClassId`, and `DerivedStatEngine.resolveScaledValue` then falls
through to the flat value. That is a pack gap, not this branch's to fix; it
is recorded below, together with the engine's silent fallback that hides it.

The bases this rule produces, computed with the engine against the shipped
pack: Pip 8, Sister Aveline 18, Grimnar 40, Lyra 38, Vaerix 58, Nyx 55,
Master Ko Shen 63, Thistle 58, Kaelen 101, Dame Sable 124.

## Testing

Test-first.

- **Engine:** `calculateMaxHp` adds a `MAX_HP` modifier to the total (the
  behaviour nothing displayed before).
- **Server:** `finalMaxHp` counts base + CON x total level, and adds Draconic
  Resilience for a Draconic sorcerer; creation stores the class's hit die as
  `maxHp` and a full `currentHp`; a cleric 3 -> 4 that takes an ability score
  increase raising Constitution gains the full derived delta (Sister Aveline
  24 -> 31, not 29); the heal clamp and the long-rest reset stop at the derived
  maximum.
- **Web:** hydration fills `baseHpRolled` from the payload; `getMaxHp` includes
  CON and trait modifiers; damage and heal clamp to it; a long rest restores to
  it.
- **Database:** every sample's derived maximum equals its documented final
  (Nyx Vale's is 78, the rest unchanged).
- Full suite, per-package typecheck and `pnpm check:hygiene`.

### Hand check

Dev servers, local Postgres, samples re-seeded. Sister Aveline levels cleric
4 -> 5 and her maximum rises by the roll plus her Constitution modifier, the
number the wizard promised. A character created through the creation wizard
opens its sheet with real hit points rather than blank. Nyx Vale's sheet
shows 78.

## Docs

`docs/TODO_BACKLOG.md`: close #78, recording that `max_hp` now means base
rolled hit points and that a character stored before this branch reads high by
roughly CON x level until re-seeded (dev data only). Record two new items: the
negative-Constitution floor approximation in `calculateMaxHp`; the note that
an item granting CON or `MAX_HP` would need the inventory passed into
`finalMaxHp`; and Draconic Resilience's unscaled `MAX_HP` modifier, with the
engine fallback that turns a `class_level` modifier carrying no
`scalingClassId` into a flat value with no warning.

## Out of scope

- Temporary hit points, hit dice spending and death saves.
- The negative-Constitution floor (recorded above).
- Any migration of characters stored before this branch beyond re-seeding the
  samples.
