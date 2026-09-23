# The sheet stops lying quietly

**Backlog:** #71 (the sheet ignores a refused resource spend), #76 (the web
store's composed `activeStates` lacks trait and equipment states) and #93 (a
stale client silently truncates its own healing). S5 is closed with a note.

**Goal:** three places where the sheet shows something untrue and says nothing
about it are fixed, and the one surface it has for saying so stops being the
inventory panel.

## What the three have in common

Each of these is silent. An authored gate does not hold; a spend the server
refused stays spent on screen; a heal loses hit points on the way out. In none
of the three does anything tell the player, and in two of them nothing tells
the developer either.

They are not the same bug. #76 is the sheet disagreeing with *itself* - two
state lists where one is always empty. #71 is the sheet ignoring a refusal.
#93 is the sheet discarding its own rules view's shortfall before the server
ever sees it. What they share is the failure mode, and one piece of machinery:
the sheet's only way to report that something did not take.

## The notice channel

`inventoryError: string | null` is removed. In its place:

```ts
notice: { text: string; tone: "error" | "warning" } | null;
setNotice: (text: string, tone?: "error" | "warning") => void;
dismissNotice: () => void;
```

It renders above the dashboard grid rather than inside the inventory panel.
Everything that writes `inventoryError` today moves onto it, including the two
attunement messages the store raises directly (`must be equipped before you can
attune`, and the attunement-limit message). Two competing surfaces is what
produced #71; there is now one.

A notice stays until the player dismisses it or the next notice replaces it.
No timer: an auto-dismiss would buy nothing here and costs every test that
touches it a fake clock.

**S5 is closed with a note.** Its defect - a whole-sheet condition rendering on
an inventory-scoped banner - is gone, because the banner is gone. Its entry
speculated that the right treatment is page-level, on the grounds that the
route knows it asked for a character in a campaign and was refused. This design
does not do that; it makes the message sheet-level. If a page-level treatment
is still wanted, that is a new item about routing, not about this banner.

## #71: roll back, then say so

The server already answers a spend that matched no `character_resources` row
with `action_error`, carrying `{ event, error, payload }` where the echoed
payload holds `resourceId` and `amount`
(`apps/server/src/gateway/socket.ts`, the `RESOURCE_CONSUMED` handler). The
sheet therefore needs no record of in-flight spends: the refusal carries
everything the rollback needs.

- `SOCKET_EVENTS.RESOURCE_CONSUMED` joins `SHEET_ERROR_EVENTS`
  (`apps/web/src/components/sheet/sheetErrorEvents.ts`), whose doc comment
  already states the policy that an omission fails as silence.
- `SocketActionErrorPayload.payload` is `unknown`
  (`apps/web/src/services/socketService.ts`). The handler narrows it for this
  event, and ignores an echo whose `characterId` is not this sheet's.
- A new store action, `rollbackResourceSpend(resourceId, amount)`, restores the
  charge - the inverse of `consumeResource`'s optimistic decrement, clamped to
  the pool's maximum so a doubled refusal cannot overfill it.
- The notice says the spend did not take.

Reachable today by clicking during page load, before the join's insert lands.

## #76: one composed list

The store carries two state lists. `baseStates` is documented as "worn armour,
encumbrance, and anything the sheet was hydrated with" and the store sets it to
`[]` and never writes it again. `getSheetStates()`, added by #73, derives the
real thing. `composeActiveStates` composes over the empty one, so `activeStates`
never carries an equipment or trait state and every gate reading it passes.

`gatherBaseStates` (`packages/engine/src/pipeline/sheetModifiers.ts`) already
folds trait states, the effect manager's states and inventory states into one
list - exactly what `composeActiveStates` builds by hand from an empty array.

**The fix:** delete the `baseStates` field. One store helper compiles the
character's active traits once and returns both halves of what gating needs:

- the gating states, from `gatherBaseStates({ activeTraits, inventory, effectManager, snapshot })`
- the condition suppressions, from those same compiled traits

`composeActiveStates` and `getSuspendedConditions` both consume it. Compiling
once is not only tidier: `getConditionSuppressions` already calls
`compileActiveTraits`, and `gatherBaseStates` needs the same result, so today
that work would happen twice per health transition.

Every existing reader - `dispatchAuthoredEvent`, `useCheckRoll` and the
`ArmorClassWidget`, `TableRulesWidget`, `TurnControlsWidget` and
`ConditionsWidget` widgets - starts gating correctly without changing a line,
because `activeStates` is finally what its name says.

**`getSheetStates()` stays**, now returning `activeStates` directly. This is not
leftover: `useCharacterStats` subscribes to the *method* because
`composeActiveStates` returns a fresh array on every composition, so
subscribing to the array itself would re-render the derived-stat hooks each
time. The accessor is load-bearing for render behaviour and its doc comment
will say so, or the next reader will delete it as redundant.

## #93: heals go raw

`applyHealthDelta` clamps with `state.getMaxHp()` and emits the post-clamp
delta. When the client's derived maximum is *lower* than the server's - stale
class levels, ability scores or trait view - the heal is cut before it leaves
the browser, and the server can only clamp further, never restore.

The client never needed to clamp a heal. #89 made it report the delta that
applied because a trigger can change what applied - but
`resolveHealthTransition`'s trigger fires only when `delta < 0`
(`shouldDispatchTrigger` requires it). For a positive delta the applied amount
differs from the raw one *only* by the client's own clamp, which the server
does better and now asserts back.

So the emitted delta becomes `delta > 0 ? delta : appliedHp - previousHp`. The
local clamp stays for the optimistic display; the server's asserted total
corrects it, through the path #89 already built.

**The invariant this rests on, written down because it is load-bearing:**
nothing modifies incoming healing. There is no `HEALING_RECEIVED` modifier
target in the pack or in the shared schema, and no state suppresses healing. If
either ever becomes true, a heal's applied amount would differ from its raw
amount for a rules reason and this asymmetry would have to go.

## Testing

- **The Eagle Totem gate, as a regression test.** A raging barbarian in heavy
  armour cannot use `action_eagle_dash`. Its `forbiddenStates` are
  `["status_wearing_heavy_armor"]`, and `trait_totem_spirit_eagle`'s own summary
  in the pack claims the gate holds on the sheet. It does not. This is the test
  that makes #76 real rather than a refactor.
- **A dice rule keyed to an equipment state** now applies, covering the other
  half of #76 that `useCheckRoll` exposed: `DiceEngine.applyDiceRulesToRollResult`
  is handed the same list.
- **A refused spend** restores the charge and raises a notice; an echo for a
  different character is ignored.
- **A heal past the maximum** emits the raw delta, and damage still emits the
  applied one, including when a trigger fires.
- **A room-join error** reaches the sheet notice rather than an inventory
  banner.

Web tests use `createRoot` + `act`; `@testing-library/react` is not installed.
Rules come from `packRuleSnapshot()`.

## Also in scope: the backlog's own bookkeeping

The file contradicts itself in three places, all from recent closures:

- #68 is marked closed in Tier 1 but open in its own entry and in the Item Index.
- #89 and #90 carry closed headings while sitting under `## Open items`; the
  Item Index says they are in "Closed items (11h)".
- The "Suggested first sitting" paragraph recommends four items that are all
  now closed.

## Out of scope

- #92's server-side trigger arbitration, and #94, #95 and #96.
- Any change to what the server stores or to the socket contract.
- A page-level treatment for a refused room join (see the S5 note).
- #44's recorded contradiction, which needs a working-tree check rather than a
  decision here.
