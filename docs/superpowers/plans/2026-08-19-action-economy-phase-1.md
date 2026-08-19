# Action Economy, Phase 1: Turns and Economy

Date: 2026-08-19
Status: Complete
Owner: Claude pair session

## Goal

Make turns and the action economy real, as the foundation for modelling the Attack action. Phase 1 of three.

## The Defect This Started From

`ATTACKS_PER_ACTION` landed with nothing to attach to, because the codebase collapses two levels of the 5e action economy into one. `WeaponSynthesizer.generateWeaponAction` mints one `ActionGrant` **per weapon**, each stamped `activation: "action"` — so a character with a longsword and a shortbow has two separate "actions", each claiming the whole action. There is no Attack action object, and no allowance for Extra Attack to raise.

Three symptoms were visible in code:

- weapon actions separated from real actions by the string prefix `action_weapon_`
- `ActionActivationSchema` mixing economy cost with wall-clock time (`minute`, `hour`, `eight_hours`)
- `"special"` used as a catch-all that actually means "costs nothing"

Underneath all of it, the economy was **not running at all**: `beginTurn`/`endTurn` existed on the store but were unreachable from any UI, and the server never passed `combatContext` to `ActionResolver`, so no action ever spent anything.

## A Bug Found And Fixed Along The Way

The turn lifecycle added during the Reckless Attack work had a real defect. The server caches an `EffectManager` per character in `authoritativeRuntimeByCharacter` and nothing ticked it for turns, so:

1. `beginTurn()` expired the effect on the **client's** mirror
2. the next server-resolved action replied with `effects` from the server's **un-ticked** manager
3. `syncRemoteActionExecution` rebuilt the client mirror from that payload — and the expired effect came back

The store tests could not catch it because they exercise the store with no socket round-trip. Moving ownership to the server fixes it by construction: there is no longer a client-side tick for a sync to undo. `resolvePlayerTurn`'s suite carries the regression test.

## Design Decisions

**Track, never block.** Tables bend the economy constantly — a DM grants a free action, a reaction gets retconned. A sheet that refuses becomes one the player fights. `ActionExecutionContext` gained `economyPolicy: "enforce" | "track"`, defaulting to `"enforce"` so every existing caller and test keeps its behaviour unchanged. The socket path passes `"track"`: an action whose activation is already spent runs anyway and comes back flagged `economyOverdrawn`.

Policy belongs to the caller. The resolver reports; it does not decide how strict the table is.

**The server owns turn state.** `CombatContextManager` joins `EffectManager` and `ResourceManager` in the authoritative runtime. Whoever expires an effect has to be whoever the sheet syncs from.

**Expire before dispatching.** Both transitions tick effects before firing their trait event, so a trigger that raises a fresh effect is not swept away by the same tick. This ordering is the reason `TurnLifecycle` exists as one unit rather than two loose functions — it is easy to get wrong in isolation.

**Turn rules live in the engine, not the gateway.** `TurnLifecycle` takes already-compiled triggers and actions rather than a save, so it needs no bootstrapper and no trait dictionary, and is testable as pure turn rules. `resolvePlayerTurn` adds the server's payload shaping. The socket handler is a thin adapter over both.

## Changes

| File | Change |
| --- | --- |
| `packages/shared/src/events/socket.ts` | `TURN_STARTED`/`TURN_ENDED`/`TURN_RESOLVED`; `TurnIntentPayload`, `TurnResolvedPayload`; `combatContext` and `economyOverdrawn` on `ActionResolvedPayload` |
| `packages/engine/src/pipeline/actionResolver.ts` | `EconomyPolicy`; overdraft reporting |
| `packages/engine/src/pipeline/turnLifecycle.ts` | New: `TurnLifecycle.beginPlayerTurn` / `endPlayerTurn` |
| `apps/server/src/services/turnResolution.ts` | New: `resolvePlayerTurn` |
| `apps/server/src/gateway/socket.ts` | `combatContext` in the runtime; turn handlers; `economyPolicy: "track"` on action intents |
| `apps/web/src/services/socketService.ts` | `emitTurnIntent`, `subscribeToTurnResolved` |
| `apps/web/src/store/characterSheetStore.ts` | `beginTurn`/`endTurn` become emitters; `syncRemoteTurnResolution` |
| `apps/web/src/components/sheet/TurnControlsWidget.tsx` | New: turn buttons and economy pips |
| `apps/web/src/components/sheet/LiveSheetProvider.tsx` | Subscribes to turn resolutions |

## Tests Reworked, Not Deleted

Three existing store tests asserted client-side turn behaviour that this change deliberately removes.

- The seven-test `turn lifecycle` block added during the Reckless Attack work was **removed**: it tested local ticking, which no longer exists. Its coverage moved and grew — 17 tests in `turnLifecycle.test.ts`, 10 in `turnResolution.test.ts`, 6 in the store's new `server-owned turns` block.
- `"refreshes the player's reaction economy on turn start and tracks pending combat events"` was **narrowed** to the reaction and event tracking that is still local; the turn-start refresh is now asserted server-side. The `and` in its name was the tell that it was doing two jobs.
- `"dispatches turn and save-failure authored events"` was **narrowed** to the save-failure half.

One of my own new tests was also corrected rather than the code: it asserted `roundNumber` is 1 after `beginCombat()` + first turn, but `combatContext.test.ts:16` already pins that as 2. The test encoded my assumption about `CombatContextManager`'s contract rather than a requirement, so it now asserts the increment instead of an absolute.

## Test Outcomes

53 new tests, written test-first.

| Suite | Before | After |
| --- | --- | --- |
| `@project/shared` | 151 passed | **155** passed |
| `@project/engine` | 43 failed / 537 passed | 43 failed / **561** passed |
| `@project/database` | 89 passed | 89 passed |
| `@project/server` | 1 failed / 207 passed | 1 failed / **217** passed |
| `@project/web` | 3 failed / 211 passed | 3 failed / **219** passed |

Typecheck passes across all five packages, hygiene passes, lint is clean.

## Known Untested Surface

The socket handlers themselves are wire code with no test coverage — the project has no socket gateway harness, and building one is a project in its own right. The handlers were kept as thin as possible for exactly this reason: every decision they delegate to (`resolvePlayerTurn`, `TurnLifecycle`, `ActionResolver`) is unit tested. What is unverified is the wiring itself: that the events are bound, the campaign room is resolved, and the reply is emitted.

## Pre-Existing Failures

The 47 known-red tests from the unfinished race-to-pack migration, unchanged: 43 engine, 3 web, 1 server.

## Next Phases

- **Phase 2 — the Attack action.** Attack becomes declarable and opens `ATTACKS_PER_ACTION` slots; weapon strikes become `activation: "attack"` and consume slots rather than the action. Retires the `action_weapon_` prefix hack, and splits economy cost from wall-clock time in the activation enum now that there is a consumer for the new shape.
- **Phase 3 — the standard action vocabulary.** Dash, Dodge, Disengage, Help, Hide, Ready, Search, Use an Object as an `ACTION_MAP` in shared, the same shape as `SKILL_MAP` and `CONDITION_MAP`. Optional.
