# Class order — a character's classes keep the order they were taken in

**Date:** 2026-09-21
**Branch:** `fix/class-order`
**Backlog item:** #74, which must land before Branch B (the choice-step UI).

## Problem

The engine treats `CharacterSave.classes[0]` as the class a character started
in: `classTraitIds(..., index === 0)` grants only that class its starting
proficiencies, and the choice blocks those proficiencies carry
(`bard_starting_skills`, `fighter_starting_skills`, ...) are only reachable
through it. A multiclass character's other classes get their multiclass grants
instead (`rogue_multiclass_skill`, ...).

`character_classes` records no order. Its primary key is
`(character_id, class_id)` and it has no timestamp, and none of its readers
orders its query. So `classes[0]` is whatever row Postgres returns first — the
physical order of a sequential scan, or `class_id` order if the planner uses
the primary key. An `UPDATE` (every level-up in an existing class) writes a new
row version that a sequential scan returns last.

For the multiclass samples (Lyra bard/rogue, Nyx warlock/sorcerer, Kaelen
ranger/druid) that means: after a level-up in the first class, the second class
reads as first. The stored `*_starting_*` answers become `orphan_selection` and
drop off the sheet, the wrong class's starting proficiencies appear, and the
next level-up that sends any picks is refused, because level-up validates the
whole merged save. Found by the final review of `feat/character-choices`.

## Design

### Storage

`character_classes` gains `position: integer("position").notNull().default(0)`
— 0 for the class taken at creation, then 1, 2, ... for each multiclass dip in
the order taken. One generated migration
(`db:generate --name add_class_position`). Existing rows take the default;
their true order was never recorded, so it cannot be backfilled. The dev
database holds only the ten samples, which the seeder rewrites, and no player
data.

### One ordering, defined once

`apps/server/src/services/classLedger.ts` exports

```ts
export const classLedgerOrder = [
  asc(characterClasses.position),
  asc(characterClasses.classId),
] as const;
```

— position first, `class_id` as a deterministic tiebreak for rows sharing a
position. Every ledger read spreads it: `.orderBy(...classLedgerOrder)`.

### Readers — all five

- `getAuthoritativeRuntimeContext` in `apps/server/src/gateway/socket.ts`
- the `REST_COMPLETED` handler's ledger read in the same file
- `fetchCharacterPayload` in `apps/server/src/routes/character.ts` — the web's
  `classLevels` and `classes` are built from this, in order
- `applyLevelUp` in `apps/server/src/controllers/characterController.ts`
- `loadCharacterClassLevels` in
  `apps/server/src/services/referenceProvider/databaseReferenceProvider.ts`

Only the first, third and fourth depend on order today; ordering the other two
costs a line each and keeps a future change from reintroducing the bug.

### Writers

- **Creation** (`POST /api/character`) inserts its class with `position: 0`.
- **Level-up**, on a multiclass dip, inserts the new class at
  `max(existing positions) + 1`. A level-up in an existing class does not touch
  `position`.
- **The seeder** writes each sample class's index in its `classes` array, which
  already lists the primary class first.

## Testing

- `classLedgerOrder` renders to `"position" asc, "class_id" asc`.
- Each reader's query orders by it: the gateway's fake database records
  `orderBy` (the runtime context through `ROOM_JOIN`, the rest handler through
  `REST_COMPLETED`), as does `character.get.test.ts`'s; the level-up route
  harnesses gain `orderBy` support and assert the ledger read uses it.
- Creation writes `position: 0`; a dip writes the next position after the
  highest existing one.
- The sample-choices invariant keeps passing.

## Hand check

After the migration is applied and the samples re-seeded, a no-op
`UPDATE character_classes SET class_level = class_level` on Lyra's bard row
makes an unordered `SELECT` return it last — the exact failure #74 describes.
Her sheet must still show her bard starting skills (Performance, Acrobatics,
Arcana) and her socket must join without an `action_error`.

## Out of scope

- Reordering classes after the fact (no UI or API does it).
- #73, the web sheet applying trait modifiers — the next branch.
