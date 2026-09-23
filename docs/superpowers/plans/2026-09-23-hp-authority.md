# Hit Point Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every write of `characters.current_hp` is clamped to the maximum the engine derives, every `HP_MODIFIED` broadcast carries the total the server settled on, and `characters.level` is derived from the class ledger rather than copied from the request (backlog #89 and #90).

**Architecture:** The client keeps the rules and reports the delta that actually applied; the server keeps the bounds. The gateway's `HP_MODIFIED` handler goes through `modifyCharacterHp`, which locks the row and clamps to `[0, derived max]`, and both of the gateway's HP emitters then broadcast a new `HpModifiedBroadcast` carrying the resulting total. Receivers follow that total instead of re-deriving one. Separately, `applyLevelUp` derives the new total level by summing the class ledger it already read, and rejects a payload that disagrees.

**Tech Stack:** TypeScript, pnpm + turbo monorepo; Vitest; drizzle (Postgres); socket.io; Express (`apps/server`); React 19 + Zustand (`apps/web`).

**Spec:** `docs/superpowers/specs/2026-09-23-hp-authority-design.md`

## Global Constraints

- Line endings: the working tree is CRLF with `core.autocrlf=true`, and git normalises endings, so `git diff`/`git show` cannot reveal them. **Every file this plan touches is CRLF, and any new file must be CRLF too.** Edit/Write emit LF. After editing, restore CRLF on every file you touched:
  ```bash
  node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' <file> <file> ...
  ```
  Do not use `sed -i`. `pnpm check:hygiene` fails on a file with mixed endings.
- CI has no `.env` and no `DATABASE_URL`: nothing a test imports may require it at load. Run server tests as `DATABASE_URL= pnpm --filter @project/server test`.
- Never run `db:migrate`, `db:seed*`, `db:import-pack` or anything else that writes to a database.
- Typecheck per package with `pnpm --filter @project/<pkg> typecheck` (`tsc -b` in web). Never trust turbo's cached `pnpm typecheck`. Vitest does not typecheck.
- Rules come only from the pack: server tests assemble the real pack through their harness; web tests use `packRuleSnapshot()` (`apps/web/src/store/__tests__/packFixture.ts`).
- **The client owns the rules; the server owns the bounds.** Never re-implement a rules calculation on the server, and never let a client's number reach the database unclamped.
- The derived maximum is always `modifyCharacterHp`/`deriveMaxHp`'s business. Never re-implement `base + CON x level + MAX_HP modifiers` anywhere.
- Verified numbers for the gateway harness, to use verbatim: `characterRow()` is a dwarf with CON 14 and `maxHp: 24` (base rolled). Seeded with a `class_fighter` ledger row at `classLevel: 3`, its **derived maximum is 33**; with no ledger row seeded it is 27. (33 is independently corroborated by the existing heal test in `socket.itemActions.test.ts`, which clamps at 33.) If a run disagrees with these, stop and report NEEDS_CONTEXT rather than editing the number to match.
- Verified numbers for the web store fixture, to use verbatim: the `"hp trigger handling"` fixture is a half-orc with `baseHpRolled: 9`, all ability scores 10 and `classLevels: { class_fighter: 1 }`, so `getMaxHp()` is **10**, and it starts at `currentHp: 5`.
- `pnpm test:all` (hygiene + all five packages) and every touched package's typecheck must be green at the end of every task.
- Commit messages end with a blank line then `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` (use `git commit -F -` with a heredoc). Subjects cite (#89) or (#90). Do not push.
- Touch only the files a task lists. A failure in any other file: stop and report NEEDS_CONTEXT.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `packages/shared/src/schemas/transport/socket.ts` | `HpModifiedBroadcast` — what the server asserts, distinct from what a client proposes | 1 |
| `apps/server/src/gateway/socket.ts` | the `HP_MODIFIED` handler clamps through `modifyCharacterHp`; both HP emitters carry the resulting total | 1 |
| `apps/web/src/store/characterSheetStore.ts` | `applyHealthDelta` emits the applied delta; `syncRemoteHealthDelta` follows the asserted total | 2, 3 |
| `apps/web/src/services/socketService.ts` | carries the broadcast type through to the store | 3 |
| `apps/server/src/controllers/characterController.ts` | the new total level comes from the ledger, and a disagreeing payload is rejected | 4 |
| `docs/TODO_BACKLOG.md` | close #89 and #90; record the server-side-rules gap | 5 |

---

### Task 1: The server clamps and asserts

**Files:**
- Modify: `packages/shared/src/schemas/transport/socket.ts` (after `HpModifiedPayload`, around line 41)
- Modify: `apps/server/src/gateway/socket.ts` (the import list around line 20; the `HP_MODIFIED` handler at 553-581; the item-action heal emitter at 920-933)
- Test: `apps/server/src/gateway/__tests__/socket.broadcasts.test.ts`
- Test: `apps/server/src/gateway/__tests__/socket.itemActions.test.ts`

**Interfaces:**
- Consumes: `modifyCharacterHp(characterId: string, amount: number): Promise<{ current: number; temporary: number; max: number }>` from `apps/server/src/services/combatService.ts`, already imported in `socket.ts`.
- Produces: `HpModifiedBroadcast` (exported from `@project/shared`), which Task 3 consumes on the web.

**Context you need:** `socket.broadcasts.test.ts` currently *pins the behaviour this task changes* — one test asserts the write is a single atomic SQL expression with no preceding SELECT, and another asserts the broadcast excludes the sender. Both premises are deliberately replaced here. The gateway harness records the three emit targets separately (`harness.senderEmits` for `socket.emit`, `harness.roomEmits` for `socket.to(room).emit`, `harness.ioEmits` for `io.to(room).emit`), so a test can prove the sender is now included.

- [ ] **Step 1: Write the failing tests**

In `apps/server/src/gateway/__tests__/socket.broadcasts.test.ts`, add `characterClasses` to the existing import from `@project/database/src/schema/operational.js` so it reads:

```ts
import {
  characterClasses,
  characters,
} from "@project/database/src/schema/operational.js";
```

Replace the file's header comment (lines 12-16) with:

```ts
/**
 * The two relay handlers. HP_MODIFIED persists through modifyCharacterHp, so
 * the stored value is clamped to the derived maximum, and then broadcasts the
 * total it settled on to the whole room *including* the sender - whose own
 * maximum may be stale (#89).
 */
```

Replace the test named `"persists the delta as one atomic expression, not a read-modify-write"` (lines 32-52) and the test named `"broadcasts to the campaign room excluding the sender"` (lines 54-74) with these three:

```ts
  it("clamps a heal to the derived maximum instead of storing what the client asked for", async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow({ currentHp: 31 })]);
    harness.db.seed(characterClasses, [
      { classId: "class_fighter", classLevel: 3 },
    ]);

    await harness.emit(SOCKET_EVENTS.HP_MODIFIED, hpPayload({ delta: 10 }));

    // max_hp holds base rolled hit points (24); the derived maximum for this
    // fixture is 33, so 31 + 10 stores 33 rather than 41 (#89)
    const updates = harness.db.opsFor(characters, "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.set?.["currentHp"]).toBe(33);
  });

  it("clamps damage at zero instead of storing a negative total", async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow({ currentHp: 5 })]);
    harness.db.seed(characterClasses, [
      { classId: "class_fighter", classLevel: 3 },
    ]);

    await harness.emit(SOCKET_EVENTS.HP_MODIFIED, hpPayload({ delta: -30 }));

    const updates = harness.db.opsFor(characters, "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.set?.["currentHp"]).toBe(0);
  });

  it("broadcasts the settled total to the whole room, including the sender", async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterClasses, [
      { classId: "class_fighter", classLevel: 3 },
    ]);
    const payload = hpPayload();

    await harness.emit(SOCKET_EVENTS.HP_MODIFIED, payload);

    // 20 - 5 = 15, against a derived maximum of 33
    expect(harness.ioEmits).toEqual([
      {
        room: "campaign_camp-1",
        event: SOCKET_EVENTS.HP_MODIFIED,
        payload: {
          actorId: harness.socket.id,
          data: { ...payload, currentHp: 15, maxHp: 33 },
        },
      },
    ]);
    // the sender is included now: it may have clamped against a stale
    // maximum, and the asserted total is what corrects it (#89)
    expect(harness.roomEmits).toEqual([]);
    expect(harness.senderEmits).toEqual([]);
  });
```

`renderSql` is no longer used by this file once the atomic-expression test is gone. Delete its import line (`import { renderSql } from "./fakeDb.js";`) — an unused import fails the build.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `DATABASE_URL= pnpm --filter @project/server test -- socket.broadcasts`
Expected: the three new tests FAIL — the clamp tests because the handler writes `current_hp + delta` unclamped (41 and -25), and the broadcast test because `harness.ioEmits` is empty while `harness.roomEmits` holds the event without `currentHp`/`maxHp`.

- [ ] **Step 3: Add the broadcast type**

In `packages/shared/src/schemas/transport/socket.ts`, directly after the `HpModifiedPayload` interface, add:

```ts
/**
 * What the server asserts after a hit point change, as distinct from what a
 * client proposes. A client may only send a delta; only the server, which
 * clamps to the engine's derived maximum, knows the total that resulted (#89).
 */
export interface HpModifiedBroadcast extends HpModifiedPayload {
  currentHp: number;
  maxHp: number;
}
```

- [ ] **Step 4: Route the handler through the clamp**

In `apps/server/src/gateway/socket.ts`, add `type HpModifiedBroadcast,` to the import list from `@project/shared` beside `type HpModifiedPayload,`.

Replace the body of the `HP_MODIFIED` handler between `const campaignId = await ensureCharacterInSocketCampaign(...)` and the `} catch (error) {` line with:

```ts
        // 1 - the client owns the rules and sends the delta that actually
        // applied; the server owns the bounds. modifyCharacterHp locks the
        // row and clamps to [0, derived max], so a stale or crafted client
        // cannot store 35 against a maximum of 31, or a negative total (#89)
        const { current, max } = await modifyCharacterHp(
          payload.characterId,
          payload.delta,
        );

        // 2 - broadcast the total the server settled on, to the whole room
        // including the sender: a client whose derived maximum is stale
        // corrects itself, and every other sheet follows the same number
        io.to(`campaign_${campaignId}`).emit(SOCKET_EVENTS.HP_MODIFIED, {
          actorId: socket.id,
          data: {
            ...payload,
            currentHp: current,
            maxHp: max,
          } satisfies HpModifiedBroadcast,
        });
```

Leave the `catch` block exactly as it is.

- [ ] **Step 5: Make the item-action heal emitter carry the total too**

This is the gateway's *other* `HP_MODIFIED` emitter, and receivers will read the asserted total from both. In the same file, replace:

```ts
                  await modifyCharacterHp(payload.characterId, healRoll.total);
```

with:

```ts
                  const { current, max } = await modifyCharacterHp(
                    payload.characterId,
                    healRoll.total,
                  );
```

and add the two fields to the payload it emits, so the `data` object reads:

```ts
                      data: {
                        characterId: payload.characterId,
                        delta: healRoll.total,
                        source: action.name,
                        timestamp: Date.now(),
                        currentHp: current,
                        maxHp: max,
                      } satisfies HpModifiedBroadcast,
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `DATABASE_URL= pnpm --filter @project/server test -- socket.broadcasts`
Expected: PASS.

- [ ] **Step 7: Extend the item-action heal test**

In `apps/server/src/gateway/__tests__/socket.itemActions.test.ts`, find the test named `"applies a positive HP delta and broadcasts it when the item action heals"`. It already asserts `hpUpdates[0]?.set?.["currentHp"]` is `33` and that `hpEmit` matches on `characterId` and `source`. Extend that `toMatchObject` call's `data` object with the two new fields, so it reads:

```ts
  payload: {
    actorId: harness.socket.id,
    data: {
      characterId: "char-1",
      source: "Drink Potion of Healing",
      currentHp: 33,
      maxHp: 33,
    },
  },
```

Leave the rest of that test unchanged.

- [ ] **Step 8: Run the gates**

Run, and expect all green:
```bash
DATABASE_URL= pnpm --filter @project/server test
pnpm --filter @project/shared test
pnpm --filter @project/shared typecheck
pnpm --filter @project/server typecheck
pnpm check:hygiene
```

- [ ] **Step 9: Restore CRLF and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' packages/shared/src/schemas/transport/socket.ts apps/server/src/gateway/socket.ts apps/server/src/gateway/__tests__/socket.broadcasts.test.ts apps/server/src/gateway/__tests__/socket.itemActions.test.ts
pnpm check:hygiene
git add packages/shared/src/schemas/transport/socket.ts apps/server/src/gateway/socket.ts apps/server/src/gateway/__tests__/socket.broadcasts.test.ts apps/server/src/gateway/__tests__/socket.itemActions.test.ts
git commit -F - <<'EOF'
fix(server): every hit point write is clamped and its total asserted (#89)

The HP_MODIFIED handler wrote current_hp + delta with no clamp, so an
overheal or an overkill stored a number no sheet was showing. It now goes
through modifyCharacterHp, and both HP emitters broadcast the total the
server settled on.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: The client emits the delta that applied

**Files:**
- Modify: `apps/web/src/store/characterSheetStore.ts` (the `socketService.emitHpModification` call inside `applyHealthDelta`, around line 962)
- Test: `apps/web/src/store/__tests__/characterSheetStore.test.ts` (the `describe("useCharacterSheetStore hp trigger handling", ...)` block)

**Interfaces:**
- Consumes: nothing from Task 1. This task is independently green.
- Produces: the emitted `delta` is now the applied one, which is what Task 1's clamp receives in production.

**Context you need:** `applyHealthDelta` already computes `appliedHp` — the value after `clampHealth` and after any `ON_HP_REDUCED_TO_ZERO` trigger (the half-orc's Relentless Endurance turns a drop to zero into 1 and spends a charge). It then emits the *raw* `delta`, which is what makes the database diverge. The test block's `beforeEach` already does `vi.spyOn(socketService, "emitHpModification").mockImplementation(() => {})`, so the spy exists; no test asserts on it yet.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/store/__tests__/characterSheetStore.test.ts`, inside the `"useCharacterSheetStore hp trigger handling"` describe block, add:

```ts
  it("emits the delta that actually applied, not the one that was asked for", () => {
    const store = useCharacterSheetStore.getState();

    // the fixture derives a maximum of 10 and starts at 5, so a heal of 10
    // applies only 5 - and 5 is what the server must store (#89)
    store.applyHealthDelta(10, "test");

    expect(useCharacterSheetStore.getState().currentHp).toBe(10);
    expect(socketService.emitHpModification).toHaveBeenCalledWith(
      expect.objectContaining({ characterId: "char_1", delta: 5 }),
    );
  });

  it("emits the post-trigger delta when Relentless Endurance saves the character", () => {
    const store = useCharacterSheetStore.getState();

    // 5 hit points taking 5 damage would be zero, but the half-orc trigger
    // leaves them at 1 - so what applied was -4, and a raw -5 would store a
    // number this sheet is not showing (#89)
    store.applyHealthDelta(-5, "test");

    expect(useCharacterSheetStore.getState().currentHp).toBe(1);
    expect(socketService.emitHpModification).toHaveBeenCalledWith(
      expect.objectContaining({ delta: -4 }),
    );
  });
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm --filter @project/web test -- characterSheetStore`
Expected: both FAIL, reporting the emitted delta as `10` and `-5` where `5` and `-4` were expected.

- [ ] **Step 3: Emit the applied delta**

In `apps/web/src/store/characterSheetStore.ts`, inside `applyHealthDelta`, replace:

```ts
      // fire and forget network req
      socketService.emitHpModification({
        characterId: state.id,
        delta,
        source,
        timestamp: Date.now(),
      });
```

with:

```ts
      // fire and forget network req. What goes over the wire is the delta
      // that actually applied - after this clamp, and after any trigger that
      // turned a lethal hit into one hit point. The raw delta would make the
      // server store a number no sheet is showing (#89)
      socketService.emitHpModification({
        characterId: state.id,
        delta: appliedHp - previousHp,
        source,
        timestamp: Date.now(),
      });
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm --filter @project/web test -- characterSheetStore`
Expected: PASS.

- [ ] **Step 5: Run the gates**

```bash
pnpm --filter @project/web test
pnpm --filter @project/web typecheck
pnpm check:hygiene
```

- [ ] **Step 6: Restore CRLF and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' apps/web/src/store/characterSheetStore.ts apps/web/src/store/__tests__/characterSheetStore.test.ts
pnpm check:hygiene
git add apps/web/src/store/characterSheetStore.ts apps/web/src/store/__tests__/characterSheetStore.test.ts
git commit -F - <<'EOF'
fix(web): the sheet reports the hit point delta that applied (#89)

applyHealthDelta clamped what it displayed and then emitted the raw
delta, so an overheal or a fired trigger sent the server a number the
sheet was not showing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: The sheet follows the total the server asserted

**Files:**
- Modify: `apps/web/src/store/characterSheetStore.ts` (the `syncRemoteHealthDelta` declaration at line 756; its implementation at 971-1001)
- Modify: `apps/web/src/services/socketService.ts` (`subscribeToHpUpdates`, lines 51-57, and the type import at line 8)
- Test: `apps/web/src/store/__tests__/characterSheetStore.test.ts`

**Interfaces:**
- Consumes: `HpModifiedBroadcast` from `@project/shared` (Task 1).
- Produces: nothing later tasks depend on.

**Context you need:** `apps/web/src/components/sheet/LiveSheetProvider.tsx:54` passes the broadcast straight into `syncRemoteHealthDelta` with an inferred parameter type, so it needs **no edit** — do not touch it. Three existing tests call `syncRemoteHealthDelta` with a payload that has no `currentHp`/`maxHp`; they are updated here, deliberately, because the payload type changes.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/store/__tests__/characterSheetStore.test.ts`, update the three existing `syncRemoteHealthDelta` tests to send the fields the server now asserts. Replace the bodies of their payload objects so they read:

```ts
  it("replays the same trigger when a remote hp update drops the character to zero", () => {
    const store = useCharacterSheetStore.getState();

    store.syncRemoteHealthDelta({
      characterId: "char_1",
      delta: -5,
      source: "test",
      timestamp: Date.now(),
      currentHp: 0,
      maxHp: 10,
    });

    expect(useCharacterSheetStore.getState().currentHp).toBe(1);
    expect(useCharacterSheetStore.getState().activeStates).toContain(
      "drop_to_one_hp",
    );
  });

  it("ignores an hp update addressed to another character, so another player's heal or damage cannot change this sheet's hp", () => {
    const store = useCharacterSheetStore.getState();

    store.syncRemoteHealthDelta({
      characterId: "char_other",
      delta: 100,
      source: "test",
      timestamp: Date.now(),
      currentHp: 100,
      maxHp: 100,
    });

    expect(useCharacterSheetStore.getState().currentHp).toBe(5);
  });

  it("applies an hp update addressed to this character", () => {
    const store = useCharacterSheetStore.getState();

    store.syncRemoteHealthDelta({
      characterId: "char_1",
      delta: 3,
      source: "test",
      timestamp: Date.now(),
      currentHp: 8,
      maxHp: 10,
    });

    expect(useCharacterSheetStore.getState().currentHp).toBe(8);
  });
```

Then add these two new tests in the same block:

```ts
  it("follows the total the server asserted, not the arithmetic of the delta", () => {
    const store = useCharacterSheetStore.getState();

    // 5 + 3 would be 8. The server says 7, and the server is the one that
    // wrote the row - a client whose derived maximum is stale follows it (#89)
    store.syncRemoteHealthDelta({
      characterId: "char_1",
      delta: 3,
      source: "test",
      timestamp: Date.now(),
      currentHp: 7,
      maxHp: 10,
    });

    expect(useCharacterSheetStore.getState().currentHp).toBe(7);
  });

  it("does nothing when the asserted total is the one already shown", () => {
    const store = useCharacterSheetStore.getState();

    // the acting client fires the trigger locally and lands on 1
    store.applyHealthDelta(-5, "test");
    const afterTrigger = useCharacterSheetStore.getState();
    expect(afterTrigger.currentHp).toBe(1);

    // its own echo comes back asserting that same total. Re-running the
    // transition would recompose state and clear the roll display the
    // trigger just produced, so the store must not touch anything (#89)
    store.syncRemoteHealthDelta({
      characterId: "char_1",
      delta: -4,
      source: "test",
      timestamp: Date.now(),
      currentHp: 1,
      maxHp: 10,
    });

    expect(useCharacterSheetStore.getState()).toBe(afterTrigger);
  });
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm --filter @project/web test -- characterSheetStore`
Expected: `"follows the total the server asserted"` FAILS with `8` where `7` was expected, and `"does nothing when the asserted total is the one already shown"` FAILS because the state object is replaced. (The three updated tests pass already — the extra fields are ignored at runtime until Step 3.)

Do not run `typecheck` at this point: `currentHp` and `maxHp` are excess properties on `HpModifiedPayload`, so `tsc` will reject every one of these literals until Step 3 widens the type. Vitest does not typecheck, which is why the runtime failures above are the real signal here.

- [ ] **Step 3: Follow the asserted total**

In `apps/web/src/store/characterSheetStore.ts`:

Change the import of `type HpModifiedPayload` from `@project/shared` (line 53) to `type HpModifiedBroadcast`. Check whether `HpModifiedPayload` is still referenced anywhere else in the file; if it is not, remove it from the import list rather than leaving it unused.

Change the action's declaration (line 756) from:

```ts
  syncRemoteHealthDelta: (payload: HpModifiedPayload) => void;
```

to:

```ts
  syncRemoteHealthDelta: (payload: HpModifiedBroadcast) => void;
```

Then, in the implementation, after the existing `if (payload.characterId !== state.id) return;` guard, add the second guard and switch the target to the asserted total. The three lines that read:

```ts
      const { delta } = payload;
      const previousHp = state.currentHp;
      const nextHp = clampHealth(previousHp, delta, state.getMaxHp());
```

become:

```ts
      // the server asserts the total it stored, and this client may be the
      // one that sent the change. Re-running the transition on a total we
      // already show would recompose state and clear the roll display a
      // trigger just produced, so an echo in agreement is left alone (#89)
      if (payload.currentHp === state.currentHp) return;

      const { delta } = payload;
      const previousHp = state.currentHp;
      // the asserted total, not a second opinion: this client's derived
      // maximum may be stale, and the server wrote the row (#89)
      const nextHp = payload.currentHp;
```

`clampHealth` is still used by `applyHealthDelta`, so leave the helper in place.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm --filter @project/web test -- characterSheetStore`
Expected: PASS, all five.

- [ ] **Step 5: Carry the type through the socket service**

In `apps/web/src/services/socketService.ts`, change the type import on line 8 from `type HpModifiedPayload,` to include `type HpModifiedBroadcast,` (keep `HpModifiedPayload` — `emitHpModification` still takes it, because a client still only proposes a delta), and change `subscribeToHpUpdates` to:

```ts
  public subscribeToHpUpdates(callback: (payload: HpModifiedBroadcast) => void) {
    this.socket?.on(
      SOCKET_EVENTS.HP_MODIFIED,
      (payload: MaybeServerBroadcastPayload<HpModifiedBroadcast>) => {
        callback(unwrapServerBroadcastPayload(payload));
      },
    );
  }
```

- [ ] **Step 6: Run the gates**

```bash
pnpm --filter @project/web test
pnpm --filter @project/web typecheck
pnpm check:hygiene
```

If `tsc -b` reports an error in `LiveSheetProvider.tsx`, stop and report NEEDS_CONTEXT — the plan expects its inferred parameter to flow through unchanged.

- [ ] **Step 7: Restore CRLF and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' apps/web/src/store/characterSheetStore.ts apps/web/src/store/__tests__/characterSheetStore.test.ts apps/web/src/services/socketService.ts
pnpm check:hygiene
git add apps/web/src/store/characterSheetStore.ts apps/web/src/store/__tests__/characterSheetStore.test.ts apps/web/src/services/socketService.ts
git commit -F - <<'EOF'
fix(web): the sheet follows the hit point total the server asserted (#89)

syncRemoteHealthDelta re-derived a total from the delta and its own
maximum. It now takes the one the server stored, and ignores an echo that
agrees with what it already shows.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: The level total comes from the ledger

**Files:**
- Modify: `apps/server/src/controllers/characterController.ts` (after the `existingClasses` read around line 126; the `.set({ level: ... })` at line 328)
- Test: `apps/server/src/routes/__tests__/levelUp.questions.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing later tasks depend on.

**Context you need:** this test file calls `applyLevelUp` directly with a hand-built request through a local `levelUp(body)` helper that returns `{ status, body }`; `setup(characterRow, ledger)` also returns a `sets` array holding every object passed to `.set(...)`. Every existing test already sends a `newTotalLevel` that agrees with its ledger (`[cleric(3)]` with `newTotalLevel: 4`, `[fighter(9, ...)]` with `10`, `[cleric(1)]` with `2`), so this change must not break any of them. A level-up always adds exactly one class level, and creation always inserts a level-1 `characterClasses` row, so summing the ledger and adding one gives the true total.

- [ ] **Step 1: Write the failing tests**

In `apps/server/src/routes/__tests__/levelUp.questions.test.ts`, add:

```ts
  it("rejects a level total that disagrees with the class ledger (#90)", async () => {
    const { options, levelUp } = await setup(humanCleric(), [cleric(3)]);
    const { choiceQuestions } = await options({ classId: "class_cleric" });

    const result = await levelUp({
      targetClassId: "class_cleric",
      newTotalLevel: 7,
      featId: "feat_alert",
      ...answerAll(choiceQuestions),
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe(
      "Invalid character choices: newTotalLevel 7 does not match the class ledger (4)",
    );
  });

  it("writes the level derived from the ledger, not the one the request sent (#90)", async () => {
    const { options, levelUp, sets } = await setup(humanCleric(), [cleric(3)]);
    const { choiceQuestions } = await options({ classId: "class_cleric" });

    const result = await levelUp({
      targetClassId: "class_cleric",
      newTotalLevel: 4,
      featId: "feat_alert",
      ...answerAll(choiceQuestions),
    });

    expect(result.status).toBe(200);
    const written = sets.find(
      (value): value is { level: unknown } =>
        typeof value === "object" && value !== null && "level" in value,
    );
    expect(written).toBeDefined();
    expect(written!.level).toBe(4);
  });
```

- [ ] **Step 2: Run the tests and watch the first fail**

Run: `DATABASE_URL= pnpm --filter @project/server test -- levelUp.questions`
Expected: `"rejects a level total that disagrees with the class ledger"` FAILS with status `200` where `400` was expected. The second test passes already — it pins behaviour that must survive the change.

- [ ] **Step 3: Derive the total and reject a disagreement**

In `apps/server/src/controllers/characterController.ts`, directly after the `existingClasses` select (the block whose comment begins `// 2 - fetch existing class ledger`), add:

```ts
      // the new total level comes from the ledger this transaction is about
      // to extend, never from the request. A level-up adds exactly one class
      // level, and since #78 the sheet's maximum hit points and both health
      // clamps derive from a level - so a column that disagrees with these
      // rows is visible, not cosmetic (#90)
      const derivedTotalLevel =
        existingClasses.reduce((total, row) => total + row.classLevel, 0) + 1;
      if (newTotalLevel !== derivedTotalLevel) {
        throw new Error(
          `Invalid character choices: newTotalLevel ${newTotalLevel} does not match the class ledger (${derivedTotalLevel})`,
        );
      }
```

Then change the update's level line from `level: newTotalLevel,` to:

```ts
          level: derivedTotalLevel,
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `DATABASE_URL= pnpm --filter @project/server test -- levelUp.questions`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 5: Run the gates**

```bash
DATABASE_URL= pnpm --filter @project/server test
pnpm --filter @project/server typecheck
pnpm check:hygiene
```

- [ ] **Step 6: Restore CRLF and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' apps/server/src/controllers/characterController.ts apps/server/src/routes/__tests__/levelUp.questions.test.ts
pnpm check:hygiene
git add apps/server/src/controllers/characterController.ts apps/server/src/routes/__tests__/levelUp.questions.test.ts
git commit -F - <<'EOF'
fix(server): the new level total comes from the class ledger (#90)

applyLevelUp wrote characters.level straight from the request, so the
column could drift from the rows the sheet derives hit points from. It is
now summed from the ledger, and a payload that disagrees is rejected.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Close #89 and #90, record what was found

**Files:**
- Modify: `docs/TODO_BACKLOG.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

**Context you need:** the backlog has a master status table (rows like `| 89 | ... | Open | Open items (11h) |` around line 291) and a per-item section further down (`### #89 — ...`) with its own small table and prose. **Follow the exact treatment `### #81` received in this same file** — heading suffixed with ` ✅`, the per-item table's Notes gaining a closing clause, the master table row's status and section columns updated, and a closing paragraph appended. Read #81's entry first and mirror it.

- [ ] **Step 1: Close #89**

Mirror #81's shape. The closing paragraph should say: closed 2026-09-23 on `fix/hp-authority`; `HP_MODIFIED` now persists through `modifyCharacterHp`, so the stored value is clamped to the derived maximum; both of the gateway's HP emitters broadcast an `HpModifiedBroadcast` carrying the total the server settled on, to the whole room including the sender; and the web now emits the delta that actually applied rather than the raw one, so a clamped heal or a fired Relentless Endurance no longer sends the server a number no sheet is showing. Record the symptom that was corrected in the entry itself: the original note said the database only diverged when a client sent a raw delta, but the web sent the raw delta on every heal and every hit, so an ordinary overheal diverged (25/31 healing 10 stored 35).

- [ ] **Step 2: Close #90**

Mirror #81's shape again. The closing paragraph should say: closed 2026-09-23 on `fix/hp-authority`; `applyLevelUp` derives the new total by summing the class ledger it already read and adding one, writes that, and rejects a payload whose `newTotalLevel` disagrees with a 400 naming both numbers.

- [ ] **Step 3: Record the new item**

Add a new item numbered **#92** in the same section and format the other open items use (a master status table row, and its own `### #92 — ...` entry with a one-row table and prose):

> **#92 — the server clamps hit points without knowing the rules that govern them.** `ON_HP_REDUCED_TO_ZERO`, its resource spending and `dispatchAuthoredEvent` live only in the web store (`apps/web/src/store/characterSheetStore.ts`), so the server can bound a hit point total but never arbitrate one. That is why #89 has the client report the delta that applied rather than the one it attempted: if the server recomputed the total itself it would compute 0 for a half-orc whose Relentless Endurance had just left them at 1, and the client would obey — charge spent, character at 0, and the trigger's own `previousHp > 0` guard means it cannot fire again. Fix: move trigger resolution server-side so the server can compute the true result. Recorded 2026-09-23 while closing #89.

- [ ] **Step 4: Verify and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' docs/TODO_BACKLOG.md
pnpm check:hygiene
git add docs/TODO_BACKLOG.md
git commit -F - <<'EOF'
docs: close #89 and #90; record #92

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 6 (controller-run): gates

Not a subagent task. The controller runs `pnpm test:all` and all five package typechecks on the finished branch, confirms lint shows only the two known #65 warnings, and confirms every touched file is CRLF.

## Task 7 (controller-run): hand check

Not a subagent task, and it needs the owner's permission because it touches a running app and a real database. With the dev server and samples seeded:

1. A character at less than full health drinks a healing potion that would overheal: the sheet shows the maximum, and the stored row holds the maximum rather than a higher number.
2. A character takes more damage than they have hit points: the sheet shows 0 and the row holds 0, not a negative number.
3. A half-orc at low health takes a lethal hit: the sheet shows 1, the charge is spent, and the row holds 1 — not 0.
4. A level-up through the wizard still succeeds, and the stored `level` matches the sum of the character's class rows.
