# Clamped hit point writes and a derived level total

**Backlog:** #89 (the sheet's own damage and heal writes are never clamped) and
#90 (`newTotalLevel` is written from the request without checking the ledger).

**Goal:** every write of `characters.current_hp` is bounded by the derived
maximum #78 built, and `characters.level` is sourced from the class ledger it
has to agree with.

## The two defects

### #89

`applyHealthDelta` (`apps/web/src/store/characterSheetStore.ts:934`) clamps the
number it displays, through `clampHealth` to `[0, getMaxHp()]`, and then emits
the **raw** delta. The gateway's `HP_MODIFIED` handler
(`apps/server/src/gateway/socket.ts:562`) persists `current_hp + delta` with a
bare SQL update, so nothing clamps the stored value:

- a character at 25/31 drinking a potion for 10 shows 31 and stores **35**;
- a character at 3 hit points taking 20 damage shows 0 and stores **-17**.

Every client agrees, because each one clamps on receive; only the database is
wrong, and only a page load reveals it. The backlog entry recorded this as
diverging "when a client sends a raw delta" - in fact the web sends the raw
delta every time, so the ordinary overheal diverges.

This is the last unclamped hit point write on the server. The item-action heal
path (`socket.ts:920`) already goes through `modifyCharacterHp`, and the long
rest (`socket.ts:1516`) writes a derived maximum.

### #90

`applyLevelUp` (`apps/server/src/controllers/characterController.ts:329`) sets
`characters.level` to the payload's `newTotalLevel` with no comparison against
the class ledger the same transaction just updated. Since #78 the sheet's
maximum hit points and both health clamps derive from a level, so a column that
disagrees with the ledger is visible rather than cosmetic.

## The decision behind the design

The obvious fix for #89 - clamp on the server and let the server declare the
true total - breaks a shipped rules feature.

The half-orc's Relentless Endurance is an `ON_HP_REDUCED_TO_ZERO` trigger: a hit
that would drop the character to 0 leaves them at 1 and spends a charge. That
trigger is dispatched in `resolveHealthTransition`
(`characterSheetStore.ts:536`) and exists **only in the web store**;
`dispatchAuthoredEvent` has no server-side counterpart. A server that clamps the
raw delta would compute 0 for a half-orc at 12 taking 20 damage, broadcast it,
and the client would obey - charge spent, character at 0, and the trigger's own
`previousHp > 0` guard means it cannot fire again.

So the client reports what happened and the server bounds it:

- the **client** owns the rules, because that is where they live, and emits the
  delta that actually applied;
- the **server** owns the bounds, clamping to `[0, derived max]` so a crafted or
  buggy client cannot store nonsense, and asserts the resulting total;
- the **broadcast** carries that total, so a client whose maximum is stale
  corrects itself - but only when its maximum is too *high*. A client whose
  maximum is too *low* has already clamped its own heal before emitting, so
  the broadcast can shrink what it sent but cannot restore what never left
  the browser. See "Recorded, not fixed".

The deeper problem - that the server can bound a hit point total but never
arbitrate one - is recorded, not fixed. See "Recorded, not fixed".

## #89: the design

### The client emits the applied delta

`applyHealthDelta` already computes `appliedHp`: the value after its own clamp
and after any trigger. It emits `appliedHp - previousHp` in place of the raw
`delta`. A half-orc at 12 taking 20 damage with a charge available emits **-11**,
not -20; a character at 25/31 healing 10 emits **+6**, not +10.

`source` and `timestamp` are unchanged. The inbound payload shape does not
change: a client still sends only a delta.

### The server clamps and asserts

The `HP_MODIFIED` handler calls `modifyCharacterHp(payload.characterId,
payload.delta)` (`apps/server/src/services/combatService.ts:12`) in place of its
bare `db.update`. That already opens a transaction, locks the row with
`SELECT ... FOR UPDATE`, derives the maximum through `deriveMaxHp(characterId,
tx)` and clamps: `Math.max(0, ...)` on damage, `Math.min(maxHp, ...)` on healing.
It returns `{ current, temporary, max }`.

The cost is real and accepted: the most travelled write path in the app goes
from one atomic statement to a locked transaction of three. For a table of four
to six players this is immaterial, and it buys the row lock the handler's
existing comment already claimed to want.

`ensureCharacterInSocketCampaign` still runs first, unchanged.

### The broadcast carries the total

A new type in `packages/shared/src/schemas/transport/socket.ts`:

```ts
export interface HpModifiedBroadcast extends HpModifiedPayload {
  currentHp: number;
  maxHp: number;
}
```

Keeping it separate from `HpModifiedPayload` is the point: a client may
*propose* a delta, and only the server *asserts* a total. The inbound handler
keeps taking `HpModifiedPayload`.

The handler emits to the campaign room with `io.to(...)` rather than
`socket.to(...)`, so the sender receives it too. `io.to` is already this file's
idiom for a whole-room broadcast (`socket.ts:870`, `922`, `995`). The wrapper
stays `{ actorId, data }`, which `unwrapServerBroadcastPayload` already handles
generically.

`socketService.subscribeToHpUpdates`
(`apps/web/src/services/socketService.ts:50`) takes `HpModifiedBroadcast` in
place of `HpModifiedPayload`.

### Receivers follow the total

`syncRemoteHealthDelta` (`characterSheetStore.ts:970`) keeps its guard on
`payload.characterId !== state.id` and gains a second: **if
`payload.currentHp === state.currentHp`, return.** It then uses
`payload.currentHp` as the target passed to `resolveHealthTransition`, in place
of re-deriving one with `clampHealth`. The delta it passes is the payload's
applied delta, which the transition uses only to decide whether a trigger fires.

The no-op guard is what protects the sender's own echo. Without it, re-running
the transition on the acting client would recompose its state and reset
`latestRollResults` to an empty array - wiping the roll display the trigger had
just produced. With it, the echo does nothing unless the client is genuinely out
of step, which is the only job it has.

One consequence falls out for free: a second tab viewing the same character can
no longer double-fire the trigger. The transition only dispatches when
`targetHp === 0`, and an authoritative 1 is not 0.

## #90: the design

`applyLevelUp` already reads the ledger at step 2 into `existingClasses`, and a
level-up adds exactly one class level, so the true total is available without a
further query:

```ts
const derivedTotalLevel =
  existingClasses.reduce((total, row) => total + row.classLevel, 0) + 1;
```

If `newTotalLevel` disagrees, throw in the shape the neighbouring locked-answer
checks use - `Invalid character choices: ...` naming both numbers. Every throw in
`applyLevelUp` is already caught and returned as a 400
(`characterController.ts:341`), so no new error plumbing is needed.

The update then writes `level: derivedTotalLevel` in place of
`level: newTotalLevel`.

**The assumption, stated so it can be checked:** creation always inserts a
level-1 `characterClasses` row (`apps/server/src/routes/character.ts:293`), so
the sum is the real total for every character made through the app. A
hand-seeded row with an empty ledger now gets a loud rejection instead of a
silently wrong column, which is the failure mode to prefer.

## Error handling

- A `HP_MODIFIED` failure keeps the existing behaviour: log, and emit
  `error:rollback` to the sender with the original payload. `modifyCharacterHp`
  throws `Character ${id} not found` for a missing row, which takes that path.
- A level-up disagreement throws inside the transaction, so nothing is written
  and the client gets a 400 naming both numbers.

## Testing

- **Gateway** (`apps/server/src/gateway/__tests__/`): `HP_MODIFIED` stores the
  clamped value - a heal past the derived maximum stores the maximum, damage
  past zero stores zero - and the broadcast carries `currentHp` and `maxHp` and
  goes to the whole room rather than all-but-sender. The existing harness
  (`fakeDb.ts`, used by `socket.itemActions.test.ts`) already seeds a character
  and a class ledger.
- **Web store** (`apps/web/src/store/__tests__/characterSheetStore.test.ts`):
  `applyHealthDelta` emits the applied delta, covering both the ordinary
  overheal and the trigger case; `syncRemoteHealthDelta` follows the
  authoritative total, and returns without touching state when that total
  already matches.
- **Level-up** (`apps/server/src/routes/__tests__/levelUp.questions.test.ts`,
  which already drives the route through the fake database and asserts the
  written columns): a payload whose `newTotalLevel` disagrees with the ledger is
  rejected with a 400, and an agreeing one writes the derived number.

## Recorded, not fixed

One new backlog item: **the server clamps hit points without knowing the rules
that govern them.** `ON_HP_REDUCED_TO_ZERO`, its resource spending and
`dispatchAuthoredEvent` live only in the web store, so the server can bound a
hit point total but never arbitrate one - which is why this design has the
client report what happened rather than what it attempted. Moving trigger
resolution server-side is its own branch, and would let the server compute the
true result itself.

A second gap sits next to it, recorded as **#93**: because the client clamps
to `state.getMaxHp()` before it ever emits, a client whose derived maximum is
*below* the server's truncates its own healing, irrecoverably. The broadcast's
asserted total can shrink an overheal the client sent, but it cannot restore
points a stale clamp cut before the delta left the browser - so "a client
whose maximum is stale corrects itself" (see "The decision behind the
design") holds only in that one direction, too-high, and not in the other.
The broadcast already carries `maxHp`, which is what a fix would compare
against the client's own derived maximum to detect the disagreement.

## Out of scope

- Temporary hit points: `modifyCharacterHp` still returns `temporary: 0`.
- The `error:rollback` path's shape.
- #86's Constitution floor, and #91's fake-database coverage gap.
