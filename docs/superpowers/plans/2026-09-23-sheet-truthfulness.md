# Sheet Truthfulness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three places where the sheet shows something untrue and says nothing are fixed: a refused resource spend rolls back and is reported (#71), the composed `activeStates` finally carries trait and equipment states so authored gates hold (#76), and a heal stops being truncated before it reaches the server (#93). The sheet's one surface for reporting a failure stops being the inventory panel (S5).

**Architecture:** One notice channel replaces `inventoryError`, and a pure `resolveActionError` decides what an `action_error` means so the routing is testable without a socket. The store's dead `baseStates` field is deleted and one helper compiles the character's active traits once, returning both the gating states and the condition suppressions. `getCharacterActions` gains the web app's first state gate on an action, reusing the engine's own predicate rather than re-implementing it. `applyHealthDelta` sends a heal raw, because only damage can carry a trigger.

**Tech Stack:** TypeScript, pnpm + turbo monorepo; Vitest; React 19 + Zustand (`apps/web`); `@project/engine`.

**Spec:** `docs/superpowers/specs/2026-09-23-sheet-truthfulness-design.md`

## Global Constraints

- Line endings: the working tree is CRLF with `core.autocrlf=true`, and git normalises endings, so `git diff`/`git show` cannot reveal them. **Every file this plan touches is CRLF, and any new file must be CRLF too.** Edit/Write emit LF. After editing, restore CRLF on every file you touched:
  ```bash
  node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' <file> <file> ...
  ```
  Do not use `sed -i`. `pnpm check:hygiene` fails on a file with mixed endings.
- Typecheck per package with `pnpm --filter @project/<pkg> typecheck` (`tsc -b` in web). Never trust turbo's cached `pnpm typecheck`. Vitest does not typecheck.
- Web component tests use `createRoot` from `react-dom/client` + `act` from `react`; `@testing-library/react` is not installed.
- Rules come only from the pack: web tests use `packRuleSnapshot()` (`apps/web/src/store/__tests__/packFixture.ts`), engine tests use `corePackLookup()`.
- **Never re-implement a rules calculation.** Where the engine already decides something, export its decision and call it.
- CI has no `.env` and no `DATABASE_URL`: nothing a test imports may require it at load. Run server tests as `DATABASE_URL= pnpm --filter @project/server test`.
- `pnpm test:all` (hygiene + all five packages) and every touched package's typecheck must be green at the end of every task.
- Commit messages end with a blank line then `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` (use `git commit -F -` with a heredoc). Subjects cite (#71), (#76) or (#93). Do not push.
- Touch only the files a task lists. A failure in any other file: stop and report NEEDS_CONTEXT.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `apps/web/src/store/characterSheetStore.ts` | the notice channel; the resource rollback; one composed state list; the action gate; the heal delta | 1–5 |
| `apps/web/src/components/sheet/DashboardLayout.tsx` | renders the notice above the grid rather than inside the inventory panel | 1 |
| `apps/web/src/components/sheet/sheetErrorEvents.ts` | which `action_error`s the sheet acts on, and what each one means | 2 |
| `apps/web/src/components/sheet/LiveSheetProvider.tsx` | routes a resolved action error into the store | 2 |
| `packages/engine/src/pipeline/actionResolver.ts` | exports the state predicate so the sheet can gate on the same rule the server does | 4 |
| `docs/TODO_BACKLOG.md` | close #71, #76, #93 and S5; record the server-side action gate; fix three contradictions | 6 |

---

### Task 1: One notice channel

**Files:**
- Modify: `apps/web/src/store/characterSheetStore.ts` (the `inventoryError` field at 713 and its declaration at 768; the hydration default at 870; `setInventoryError` at 1237; the four writers at 1043, 1093, 1109, 1120, 1129)
- Modify: `apps/web/src/components/sheet/DashboardLayout.tsx` (the store reads at 40-43; the banner at 264-274; the render opening at 117)
- Modify: `apps/web/src/components/sheet/LiveSheetProvider.tsx` (the store read at 33-34; the handler at 94; the dependency at 111)
- Test: `apps/web/src/store/__tests__/inventorySlots.test.ts`
- Test: `apps/web/src/components/sheet/__tests__/DashboardLayout.test.tsx`
- Test: `apps/web/src/store/__tests__/characterSheetStore.test.ts` (one fixture line)

**Interfaces:**
- Produces: `notice: SheetNotice | null`, `setNotice(text: string, tone?: "error" | "warning"): void` and `dismissNotice(): void` on the store, where `SheetNotice` is `{ text: string; tone: "error" | "warning" }`. Task 2 consumes all three.

**Context you need:** `inventoryError` is a single string rendered *inside* the inventory panel, and every socket action error funnels into it — which is what #71 and S5 both call the wrong surface. The store also writes it directly for two attunement messages. Those move too: one channel, or the next failure lands somewhere odd again.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/store/__tests__/inventorySlots.test.ts`, the `describe("toggleAttunement", ...)` block seeds and reads the old field. Change its `beforeEach` line and its helper — **the four assertions that use `errorText()` do not change**:

```ts
    useCharacterSheetStore.setState({ notice: null });
```

```ts
  const errorText = () => useCharacterSheetStore.getState().notice?.text ?? null;
```

In `apps/web/src/components/sheet/__tests__/DashboardLayout.test.tsx`, replace `setInventoryError: vi.fn(),` in the `vi.hoisted` mocks with `dismissNotice: vi.fn(),`; in `MockStoreState` replace `inventoryError: string | null;` with `notice: { text: string; tone: "error" | "warning" } | null;` and `setInventoryError: typeof mocks.setInventoryError;` with `dismissNotice: typeof mocks.dismissNotice;`; and in `baseStoreState` replace `inventoryError: null,` with `notice: null,` and `setInventoryError: mocks.setInventoryError,` with `dismissNotice: mocks.dismissNotice,`.

Then add this test to that file:

```tsx
  it("shows a sheet notice above the grid rather than inside the inventory panel", async () => {
    storeState = {
      ...baseStoreState,
      notice: { text: "Unknown resource for this character.", tone: "error" },
    };

    const { container, root } = await renderDashboard();

    const notice = container.querySelector('[data-testid="sheet-notice"]');
    expect(notice).not.toBeNull();
    expect(notice?.textContent).toContain(
      "Unknown resource for this character.",
    );

    // the inventory panel is a sibling of the notice, not its parent: a
    // failure that is not about inventory must not read as one (#71, S5)
    expect(notice?.closest("section")?.textContent).not.toContain(
      "Inventory Manager",
    );

    root.unmount();
    container.remove();
  });
```

If `storeState` is not reset between tests in that file, add `storeState = baseStoreState;` to its existing `beforeEach` rather than leaving the override to leak.

In `apps/web/src/store/__tests__/characterSheetStore.test.ts`, one fixture at line 47 seeds `inventoryError: null,` — change it to `notice: null,`.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm --filter @project/web test -- inventorySlots DashboardLayout`
Expected: FAIL — `notice` does not exist on the store, and no element carries `data-testid="sheet-notice"`.

- [ ] **Step 3: Add the notice to the store**

In `apps/web/src/store/characterSheetStore.ts`, replace the `inventoryError: string | null;` state field with:

```ts
  /**
   * The sheet's one way of saying that something did not take: a spend the
   * server refused, an attunement the rules forbid, a character that could not
   * be bound to its campaign. It is deliberately not scoped to the inventory -
   * that scoping is what made a refused resource spend invisible (#71, S5).
   */
  notice: SheetNotice | null;
```

and add this type above the state interface:

```ts
export type SheetNotice = {
  text: string;
  tone: "error" | "warning";
};
```

Replace the `setInventoryError: (message: string | null) => void;` declaration with:

```ts
  setNotice: (text: string, tone?: "error" | "warning") => void;
  dismissNotice: () => void;
```

Replace the `setInventoryError` implementation with:

```ts
    setNotice: (text, tone = "error") => {
      set({ notice: { text, tone } });
    },

    dismissNotice: () => {
      set({ notice: null });
    },
```

In the hydration defaults, replace `inventoryError: null,` with `notice: null,`.

At the four writer sites, replace `inventoryError: null,` with `notice: null,` (three of them: the equip site, and the two attunement success sites), and replace the two message writers with the notice shape:

```ts
        set({
          notice: {
            text: `${definition.name} must be equipped before you can attune to it.`,
            tone: "error",
          },
        });
```

```ts
        set({
          notice: {
            text: `Already attuned to ${ATTUNEMENT_LIMIT} items. Break an attunement first.`,
            tone: "error",
          },
        });
```

- [ ] **Step 4: Move the banner out of the inventory panel**

In `apps/web/src/components/sheet/DashboardLayout.tsx`, replace the two store reads:

```tsx
  const notice = useCharacterSheetStore((state) => state.notice);
  const dismissNotice = useCharacterSheetStore((state) => state.dismissNotice);
```

Delete the whole `{inventoryError && ( ... )}` block from the inventory section, and add this immediately after the closing `</header>` tag:

```tsx
      {notice && (
        <div
          data-testid="sheet-notice"
          className={`mb-4 border rounded p-2 flex items-center justify-between gap-3 ${
            notice.tone === "warning"
              ? "bg-amber-50 border-amber-200"
              : "bg-red-50 border-red-200"
          }`}
        >
          <span
            className={`text-xs ${
              notice.tone === "warning" ? "text-amber-800" : "text-red-700"
            }`}
          >
            {notice.text}
          </span>
          <button
            onClick={dismissNotice}
            className="text-xs px-2 py-1 rounded border bg-white hover:bg-gray-100"
          >
            Dismiss
          </button>
        </div>
      )}
```

- [ ] **Step 5: Point the provider at the notice**

In `apps/web/src/components/sheet/LiveSheetProvider.tsx`, replace the `setInventoryError` store read with:

```tsx
  const setNotice = useCharacterSheetStore((state) => state.setNotice);
```

change the handler body's `setInventoryError(payload.error);` to `setNotice(payload.error);`, and change `setInventoryError,` in the effect's dependency array to `setNotice,`.

- [ ] **Step 6: Run the tests and watch them pass**

Run: `pnpm --filter @project/web test -- inventorySlots DashboardLayout characterSheetStore`
Expected: PASS.

- [ ] **Step 7: Run the gates**

```bash
pnpm --filter @project/web test
pnpm --filter @project/web typecheck
pnpm check:hygiene
```

If `tsc -b` reports a remaining reference to `inventoryError` or `setInventoryError` anywhere, fix that reference — the field is gone.

- [ ] **Step 8: Restore CRLF and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' apps/web/src/store/characterSheetStore.ts apps/web/src/components/sheet/DashboardLayout.tsx apps/web/src/components/sheet/LiveSheetProvider.tsx apps/web/src/store/__tests__/inventorySlots.test.ts apps/web/src/store/__tests__/characterSheetStore.test.ts apps/web/src/components/sheet/__tests__/DashboardLayout.test.tsx
pnpm check:hygiene
git add apps/web/src/store/characterSheetStore.ts apps/web/src/components/sheet/DashboardLayout.tsx apps/web/src/components/sheet/LiveSheetProvider.tsx apps/web/src/store/__tests__/inventorySlots.test.ts apps/web/src/store/__tests__/characterSheetStore.test.ts apps/web/src/components/sheet/__tests__/DashboardLayout.test.tsx
git commit -F - <<'EOF'
feat(web): one sheet notice replaces the inventory-scoped banner (#71)

Every failure the sheet reported arrived through inventoryError and
rendered inside the inventory panel, which is why a refused resource spend
had nowhere to go.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: A refused spend rolls back and says so

**Files:**
- Modify: `apps/web/src/components/sheet/sheetErrorEvents.ts`
- Modify: `apps/web/src/components/sheet/LiveSheetProvider.tsx` (the action-error handler)
- Modify: `apps/web/src/store/characterSheetStore.ts` (beside `consumeResource`, around 1241)
- Test: `apps/web/src/components/sheet/__tests__/sheetErrorEvents.test.ts`
- Test: `apps/web/src/store/__tests__/characterSheetStore.test.ts`

**Interfaces:**
- Consumes: `setNotice(text, tone?)` from Task 1.
- Produces: `rollbackResourceSpend(resourceId: string, amount: number): void` on the store, and `resolveActionError(payload): ActionErrorOutcome` from `sheetErrorEvents.ts`.

**Context you need:** the server answers a spend that matched no `character_resources` row with `socket.emit("action_error", { event, error, payload })`, where the echoed `payload` is the original `ResourceConsumedPayload` — it carries `characterId`, `resourceId` and `amount`. So the sheet needs no record of in-flight spends. `SocketActionErrorPayload.payload` is typed `unknown` (`apps/web/src/services/socketService.ts`), so it must be narrowed.

There is **no test harness for `LiveSheetProvider`** — it imports the `socketService` singleton directly and nothing mocks it. Rather than invent one, this task puts the decision in a pure function that both the provider and a test can call.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/components/sheet/__tests__/sheetErrorEvents.test.ts`, add to the existing imports:

```ts
import { resolveActionError, SHEET_ERROR_EVENTS } from "../sheetErrorEvents";
```

and add a new describe block:

```ts
describe("resolveActionError", () => {
  const spend = {
    characterId: "char_1",
    resourceId: "res_ki",
    amount: 2,
    timestamp: 1_700_000_000_000,
  };

  it("ignores an error that names no event", () => {
    expect(resolveActionError({ error: "boom" })).toEqual({ kind: "ignore" });
  });

  it("ignores an event the sheet does not act on", () => {
    expect(
      resolveActionError({
        event: SOCKET_EVENTS.ROLL_RESULTS,
        error: "boom",
      }),
    ).toEqual({ kind: "ignore" });
  });

  it("asks for a rollback when a resource spend was refused", () => {
    expect(
      resolveActionError({
        event: SOCKET_EVENTS.RESOURCE_CONSUMED,
        error: "Unknown resource for this character.",
        payload: spend,
      }),
    ).toEqual({
      kind: "rollback-resource",
      text: "Unknown resource for this character.",
      characterId: "char_1",
      resourceId: "res_ki",
      amount: 2,
    });
  });

  it("falls back to a plain notice when the refusal echoes no usable payload", () => {
    expect(
      resolveActionError({
        event: SOCKET_EVENTS.RESOURCE_CONSUMED,
        error: "Resource async failure. Rolling back state.",
        payload: { characterId: "char_1" },
      }),
    ).toEqual({
      kind: "notice",
      text: "Resource async failure. Rolling back state.",
    });
  });

  it("shows a notice for the events it already showed", () => {
    expect(
      resolveActionError({
        event: SOCKET_EVENTS.ROOM_JOIN,
        error: "Character is not available in this campaign.",
      }),
    ).toEqual({
      kind: "notice",
      text: "Character is not available in this campaign.",
    });
  });
});
```

In `apps/web/src/store/__tests__/characterSheetStore.test.ts`, add a describe block for the rollback:

```ts
describe("rollbackResourceSpend", () => {
  beforeEach(() => {
    useCharacterSheetStore.setState({
      ...useCharacterSheetStore.getState(),
      id: "char_1",
      resources: [
        { id: "res_ki", name: "Ki", current: 1, currentCharges: 1, max: 3 },
      ],
      notice: null,
    } as never);
  });

  it("restores a charge the server refused", () => {
    useCharacterSheetStore.getState().rollbackResourceSpend("res_ki", 2);

    expect(
      useCharacterSheetStore.getState().resources.find((r) => r.id === "res_ki")
        ?.current,
    ).toBe(3);
  });

  it("never restores past the pool's maximum", () => {
    useCharacterSheetStore.getState().rollbackResourceSpend("res_ki", 99);

    expect(
      useCharacterSheetStore.getState().resources.find((r) => r.id === "res_ki")
        ?.current,
    ).toBe(3);
  });

  it("leaves an unknown resource alone", () => {
    useCharacterSheetStore.getState().rollbackResourceSpend("res_absent", 1);

    expect(useCharacterSheetStore.getState().resources).toEqual([
      { id: "res_ki", name: "Ki", current: 1, currentCharges: 1, max: 3 },
    ]);
  });
});
```

If the resource fixture's shape does not match the store's `resources` element type — check `consumeResource` and the `withRuntimeCounts` helper for the real fields — use the shape the store actually holds and keep the same three assertions. Report in your report which shape you used.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm --filter @project/web test -- sheetErrorEvents characterSheetStore`
Expected: FAIL — `resolveActionError` and `rollbackResourceSpend` do not exist.

- [ ] **Step 3: Teach sheetErrorEvents what an error means**

In `apps/web/src/components/sheet/sheetErrorEvents.ts`, add `SOCKET_EVENTS.RESOURCE_CONSUMED,` to the `SHEET_ERROR_EVENTS` array, and append:

```ts
/**
 * What the sheet should do about an `action_error`.
 *
 * A pure decision, kept out of LiveSheetProvider so it can be tested without
 * a socket: the provider imports the socketService singleton directly, so the
 * routing was previously reachable only end to end.
 */
export type ActionErrorOutcome =
  | { kind: "ignore" }
  | { kind: "notice"; text: string }
  | {
      kind: "rollback-resource";
      text: string;
      characterId: string;
      resourceId: string;
      amount: number;
    };

/** The echoed payload a refused RESOURCE_CONSUMED carries back. */
const isRefusedSpend = (
  payload: unknown,
): payload is { characterId: string; resourceId: string; amount: number } => {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Record<string, unknown>;
  return (
    typeof candidate["characterId"] === "string" &&
    typeof candidate["resourceId"] === "string" &&
    typeof candidate["amount"] === "number"
  );
};

/**
 * @param payload The gateway's action_error, whose `event` is optional on the
 *   wire and whose echoed `payload` is untyped
 * @returns What the sheet should do: nothing, show a notice, or put a refused
 *   spend back before showing one (#71)
 */
export const resolveActionError = (payload: {
  event?: string;
  error: string;
  payload?: unknown;
}): ActionErrorOutcome => {
  if (!payload.event || !SHEET_ERROR_EVENTS.includes(payload.event)) {
    return { kind: "ignore" };
  }

  if (
    payload.event === SOCKET_EVENTS.RESOURCE_CONSUMED &&
    isRefusedSpend(payload.payload)
  ) {
    return {
      kind: "rollback-resource",
      text: payload.error,
      characterId: payload.payload.characterId,
      resourceId: payload.payload.resourceId,
      amount: payload.payload.amount,
    };
  }

  return { kind: "notice", text: payload.error };
};
```

Update the file's existing doc comment on `SHEET_ERROR_EVENTS` to mention that `RESOURCE_CONSUMED` is listed because a refused spend must be put back, not only reported.

- [ ] **Step 4: Add the rollback to the store**

In `apps/web/src/store/characterSheetStore.ts`, declare beside `consumeResource`:

```ts
  rollbackResourceSpend: (resourceId: string, amount: number) => void;
```

and implement it directly after `consumeResource`:

```ts
    /**
     * Put back a spend the server refused. consumeResource decrements
     * optimistically and the refusal arrives afterwards, so without this the
     * charge stays spent on screen until a reload (#71). Clamped to the pool's
     * maximum: a refusal that arrives twice must not overfill it.
     */
    rollbackResourceSpend: (resourceId, amount) => {
      const state = get();
      set({
        resources: state.resources.map((res) =>
          res.id === resourceId
            ? { ...res, current: Math.min(res.max ?? res.current + amount, res.current + amount) }
            : res,
        ),
      });
    },
```

If the resource element has no `max` field, use whatever field holds the pool's ceiling; if none exists, clamp is impossible and you should instead restore `current + amount` and say so in your report.

- [ ] **Step 5: Route it in the provider**

In `apps/web/src/components/sheet/LiveSheetProvider.tsx`, add the store read beside `setNotice`:

```tsx
  const rollbackResourceSpend = useCharacterSheetStore(
    (state) => state.rollbackResourceSpend,
  );
```

replace the whole `subscribeToActionErrors` callback body with:

```tsx
    socketService.subscribeToActionErrors((payload) => {
      const outcome = resolveActionError(payload);
      if (outcome.kind === "ignore") return;

      // an echo for another character is not this sheet's to act on
      if (
        outcome.kind === "rollback-resource" &&
        outcome.characterId === characterId
      ) {
        rollbackResourceSpend(outcome.resourceId, outcome.amount);
      }

      setNotice(outcome.text);
    });
```

import `resolveActionError` alongside `SHEET_ERROR_EVENTS` (and drop `SHEET_ERROR_EVENTS` from the import if nothing else in the file uses it), and add `rollbackResourceSpend` to the effect's dependency array.

- [ ] **Step 6: Run the tests and watch them pass**

Run: `pnpm --filter @project/web test -- sheetErrorEvents characterSheetStore`
Expected: PASS.

- [ ] **Step 7: Run the gates**

```bash
pnpm --filter @project/web test
pnpm --filter @project/web typecheck
pnpm check:hygiene
```

- [ ] **Step 8: Restore CRLF and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' apps/web/src/components/sheet/sheetErrorEvents.ts apps/web/src/components/sheet/LiveSheetProvider.tsx apps/web/src/store/characterSheetStore.ts apps/web/src/components/sheet/__tests__/sheetErrorEvents.test.ts apps/web/src/store/__tests__/characterSheetStore.test.ts
pnpm check:hygiene
git add apps/web/src/components/sheet/sheetErrorEvents.ts apps/web/src/components/sheet/LiveSheetProvider.tsx apps/web/src/store/characterSheetStore.ts apps/web/src/components/sheet/__tests__/sheetErrorEvents.test.ts apps/web/src/store/__tests__/characterSheetStore.test.ts
git commit -F - <<'EOF'
fix(web): a refused resource spend is put back and reported (#71)

RESOURCE_CONSUMED was missing from the events the sheet acts on, so a
refusal was received and dropped and the optimistic decrement stood until
a reload.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: One composed state list

**Files:**
- Modify: `apps/web/src/store/characterSheetStore.ts` (`composeActiveStates` at 372; `getConditionSuppressions` below it; the `baseStates` field at 730 and hydration at 874; the five `composeActiveStates` call sites at 482, 528, 1597, 1757, 1795; `getSuspendedConditions` at 1461; `getSheetStates` at 1400)
- Test: `apps/web/src/store/__tests__/characterSheetStore.test.ts`
- Test: `apps/web/src/hooks/__tests__/useCharacterStats.realStore.test.tsx`

**Interfaces:**
- Produces: `activeStates` now carries trait and equipment states. Task 4 gates on it.

**Context you need:** the store carries two state lists. `baseStates` is documented as "worn armour, encumbrance" and is set to `[]` at hydration and never written again. `getSheetStates()` (added by #73) derives the real thing. `composeActiveStates` composes over the empty one, so every gate reading `activeStates` passes. `gatherBaseStates` (`packages/engine/src/pipeline/sheetModifiers.ts`) already folds trait states, the effect manager's states and inventory states into one list — exactly what `composeActiveStates` builds by hand from an empty array.

**Test fixtures that seed the dead field, and must change** — this is expected work, not a surprise:
- `characterSheetStore.test.ts` line ~845 seeds `baseStates: ["status_wearing_armor"]` **with a real value**, for the test `"keeps non-effect states when the server reports an executed action"`. That state must now come from inventory. Give that fixture `inventory: [{ id: "inv-plate", itemId: "item_armor_plate", quantity: 1, slot: "body", isAttuned: false }]` and drop the `baseStates` line. The assertion `expect(state.activeStates).toContain("status_wearing_armor")` stays exactly as it is — it is now proving the new derivation rather than a stored field.
- Six other `baseStates: []` lines in that file and one in `useCharacterStats.realStore.test.tsx` are inert: delete the line.

- [ ] **Step 1: Write the failing test**

In `apps/web/src/store/__tests__/characterSheetStore.test.ts`, add:

```ts
describe("activeStates carries what the character is wearing (#76)", () => {
  it("composes equipment states into activeStates, not only conditions and effects", () => {
    useCharacterSheetStore.getState().initialize({
      id: "char_1",
      level: 3,
      classLevels: { class_barbarian: 3 },
      subclassIds: { class_barbarian: "subclass_barbarian_totem_warrior" },
      choices: {
        classSelections: {
          class_barbarian: {
            barbarian_totem_level_3_totem_spirit: ["trait_totem_spirit_eagle"],
          },
        },
        traitSelections: {},
        feats: [],
      },
      raceId: "race_human",
      subraceId: null,
      inventory: [
        {
          id: "inv-plate",
          itemId: "item_armor_plate",
          quantity: 1,
          slot: "body",
          isAttuned: false,
        },
      ],
      ruleSnapshot: packRuleSnapshot(),
    } as never);

    // plate is armour of category heavy worn in the body slot, which is what
    // InventoryExtractor.extractStates keys on
    expect(useCharacterSheetStore.getState().activeStates).toContain(
      "status_wearing_heavy_armor",
    );
  });

  it("hands the same states to the accessor the derived-stat hooks read", () => {
    useCharacterSheetStore.getState().initialize({
      id: "char_1",
      level: 1,
      classLevels: { class_fighter: 1 },
      raceId: "race_human",
      subraceId: null,
      inventory: [
        {
          id: "inv-plate",
          itemId: "item_armor_plate",
          quantity: 1,
          slot: "body",
          isAttuned: false,
        },
      ],
      ruleSnapshot: packRuleSnapshot(),
    } as never);

    // useCheckRoll hands these to DiceEngine through useAbilities, so a dice
    // rule keyed to worn equipment could never fire while this was empty.
    // useCheckRoll.test.ts pins the other link - that the hook passes the
    // sheet's states rather than the store's raw ones (#76)
    expect(useCharacterSheetStore.getState().getSheetStates()).toContain(
      "status_wearing_heavy_armor",
    );
  });
});
```

If `initialize` does not accept `inventory`, set it with `useCharacterSheetStore.setState({ inventory: [...] })` after initialising and then trigger a recomposition through whichever store action the file's other tests use; say in your report which route you took.

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm --filter @project/web test -- characterSheetStore`
Expected: FAIL — `activeStates` does not contain the state, because it composes over an empty `baseStates`.

- [ ] **Step 3: Compile the traits once, for both gating and suppressions**

In `apps/web/src/store/characterSheetStore.ts`, replace `composeActiveStates` and `getConditionSuppressions` with:

```ts
type ConditionSuppression = {
  condition: string;
  requiredStates: string[];
  forbiddenStates: string[];
  source?: string;
};

/**
 * The two things every gate needs, from one compilation of the character's
 * active traits: the states that gate, and the suppressions that can silence
 * a condition.
 *
 * Compiling once is the point. The pair of helpers this replaced called
 * compileActiveTraits twice for the same state, and one of them composed over
 * a stored `baseStates` field the store set to [] and never wrote again - so
 * no equipment or trait state ever reached a gate (#76).
 * @param state The sheet, for the save the engine compiles from
 * @param effectManager The runtime effects whose states also gate
 * @returns The gating states and the condition suppressions
 */
const sheetGating = (
  state: CharacterSheetState,
  effectManager: EffectManager,
): { gatingStates: string[]; suppressions: ConditionSuppression[] } => {
  if (!state.ruleSnapshot) {
    return { gatingStates: effectManager.getActiveStates(), suppressions: [] };
  }

  const activeTraits = CharacterBootstrapper.compileActiveTraits(
    toCharacterSave(state),
    state.ruleSnapshot,
  );

  return {
    gatingStates: gatherBaseStates({
      activeTraits,
      inventory: state.inventory,
      effectManager,
      snapshot: state.ruleSnapshot,
    }),
    suppressions: activeTraits.flatMap((trait) =>
      (trait.conditionSuppressions ?? []).map((suppression) => ({
        ...suppression,
        requiredStates: suppression.requiredStates ?? [],
        forbiddenStates: suppression.forbiddenStates ?? [],
        source: trait.name,
      })),
    ),
  };
};

/**
 * Rebuilt rather than accumulated on purpose. Folding the effect manager's
 * states into the previous activeStates makes the list monotonic - it can only
 * ever grow - so an effect that expires stays visible forever and a one-turn
 * rule like Reckless Attack never switches off.
 *
 * Composing here means every calculator gates on conditions without any of
 * them knowing conditions exist.
 */
const composeActiveStates = (
  gatingStates: string[],
  activeConditions: string[] | undefined,
  suppressions: ConditionSuppression[],
): string[] => {
  const active = suppressConditions(
    activeConditions ?? [],
    suppressions,
    gatingStates,
  ).active;

  return Array.from(new Set([...gatingStates, ...active]));
};
```

Add `gatherBaseStates` to the existing import from `@project/engine`.

- [ ] **Step 4: Update the five call sites**

Each call site currently passes `state.baseStates` (or `previous.baseStates`) and calls `getConditionSuppressions(...)` separately. Replace each with one `sheetGating` call. The two inside `resolveHealthTransition` and its sibling become:

```ts
  const { gatingStates, suppressions } = sheetGating(state, runtimeEffects);
```

with the composition reading:

```ts
    activeStates: composeActiveStates(
      gatingStates,
      state.activeConditions,
      suppressions,
    ),
```

The two that compose from `previous` become:

```ts
        activeStates: (() => {
          const { gatingStates, suppressions } = sheetGating(
            previous,
            runtimeEffects,
          );
          return composeActiveStates(
            gatingStates,
            previous.activeConditions,
            suppressions,
          );
        })(),
```

and the one in the condition-toggling action becomes:

```ts
        return {
          activeConditions,
          activeStates: (() => {
            const effectManager = state.runtimeEffects ?? new EffectManager();
            const { gatingStates, suppressions } = sheetGating(
              { ...state, activeConditions },
              effectManager,
            );
            return composeActiveStates(
              gatingStates,
              activeConditions,
              suppressions,
            );
          })(),
        };
```

If an immediately-invoked function reads badly at any of these sites, hoist the `sheetGating` call to a `const` above the returned object instead — same result, and say which you did in your report.

- [ ] **Step 5: Update `getSuspendedConditions` and `getSheetStates`, and delete the field**

Replace `getSuspendedConditions`'s body with:

```ts
    getSuspendedConditions: () => {
      const state = get();
      const { gatingStates, suppressions } = sheetGating(
        state,
        state.runtimeEffects ?? new EffectManager(),
      );
      return suppressConditions(
        state.activeConditions,
        suppressions,
        gatingStates,
      ).suspended;
    },
```

Replace `getSheetStates`'s body with:

```ts
    /**
     * The sheet's states. Kept as a method rather than letting callers read
     * `activeStates` directly: useCharacterStats subscribes to this reference
     * because composeActiveStates returns a fresh array on every composition,
     * so subscribing to the array itself re-renders the derived-stat hooks
     * each time. It is a thin read on purpose (#76).
     */
    getSheetStates: () => get().activeStates,
```

Delete the `baseStates: string[];` field and its doc comment, and the `baseStates: [],` hydration default.

- [ ] **Step 6: Update the fixtures that seed the dead field**

Make the two fixture changes named in this task's context block: give the `"keeps non-effect states…"` fixture the plate inventory row in place of its `baseStates: ["status_wearing_armor"]` line, and delete the six other inert `baseStates: []` lines in that file plus the one in `useCharacterStats.realStore.test.tsx`.

- [ ] **Step 7: Run the tests and watch them pass**

Run: `pnpm --filter @project/web test`
Expected: PASS, including `"keeps non-effect states when the server reports an executed action"`, which now proves the derivation rather than a stored field.

If any other test fails, read it before changing it: a failure here may be a real behaviour change worth reporting rather than a fixture to adjust. Report any you had to touch.

- [ ] **Step 8: Run the gates and commit**

```bash
pnpm --filter @project/web test
pnpm --filter @project/web typecheck
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' apps/web/src/store/characterSheetStore.ts apps/web/src/store/__tests__/characterSheetStore.test.ts apps/web/src/hooks/__tests__/useCharacterStats.realStore.test.tsx
pnpm check:hygiene
git add apps/web/src/store/characterSheetStore.ts apps/web/src/store/__tests__/characterSheetStore.test.ts apps/web/src/hooks/__tests__/useCharacterStats.realStore.test.tsx
git commit -F - <<'EOF'
fix(web): activeStates carries trait and equipment states (#76)

The store composed its gating states over a baseStates field it set to []
and never wrote again, so no authored gate keyed to worn equipment or a
trait ever held. One helper now compiles the active traits once and
returns both the gating states and the condition suppressions.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: The sheet stops offering an action its states forbid

**Files:**
- Modify: `packages/engine/src/pipeline/actionResolver.ts` (the `matchesStatePredicate` declaration around line 167)
- Modify: `apps/web/src/store/characterSheetStore.ts` (`getCharacterActions` at 1476)
- Test: `apps/web/src/store/__tests__/characterSheetStore.test.ts`

**Interfaces:**
- Consumes: `activeStates` carrying equipment states, from Task 3.
- Produces: `matchesStatePredicate(effect: ActionGrant["effect"], activeStates: string[]): boolean`, exported from `@project/engine`.

**Context you need:** nothing gates an action on its `forbiddenStates` today. `getCharacterActions` filters out only `dynamic_weapon_attack` and Relentless Rage, and `CombatWidget` renders everything it returns as an enabled button. The server checks, in `ActionResolver.execute`, but is handed `runtime.effectManager.getActiveStates()` — effect states alone — so an equipment state can never block there, and a blocked action returns `executed: true` having applied nothing. That server-side half is **recorded, not fixed**: do not change the gateway.

`matchesStatePredicate` is module-private and non-trivial — it merges top-level `requiredStates`/`forbiddenStates` with a `predicates` group. Export it rather than re-implementing the merge in the store; the global constraints forbid re-implementing a rules decision.

**Expect a visible behaviour change beyond heavy armour:** an action with `requiredStates` now disappears until those states hold. `action_eagle_dash` requires `status_raging`, so it is no longer offered to a barbarian who is not raging. That is the gate working, not a regression.

- [ ] **Step 1: Write the failing test**

In `apps/web/src/store/__tests__/characterSheetStore.test.ts`, add:

```ts
describe("getCharacterActions honours an action's states (#76)", () => {
  const eagleBarbarian = (inventory: unknown[]) => ({
    id: "char_1",
    level: 3,
    classLevels: { class_barbarian: 3 },
    subclassIds: { class_barbarian: "subclass_barbarian_totem_warrior" },
    choices: {
      classSelections: {
        class_barbarian: {
          barbarian_totem_level_3_totem_spirit: ["trait_totem_spirit_eagle"],
        },
      },
      traitSelections: {},
      feats: [],
    },
    raceId: "race_human",
    subraceId: null,
    inventory,
    ruleSnapshot: packRuleSnapshot(),
  });

  const plate = {
    id: "inv-plate",
    itemId: "item_armor_plate",
    quantity: 1,
    slot: "body",
    isAttuned: false,
  };

  const actionIds = () =>
    useCharacterSheetStore
      .getState()
      .getCharacterActions()
      .map((action) => action.id);

  it("does not offer the Eagle Dash while the barbarian is not raging", () => {
    useCharacterSheetStore.getState().initialize(eagleBarbarian([]) as never);

    // action_eagle_dash requires status_raging
    expect(actionIds()).not.toContain("action_eagle_dash");
  });

  it("offers the Eagle Dash to a raging barbarian out of heavy armour", () => {
    useCharacterSheetStore.getState().initialize(eagleBarbarian([]) as never);
    useCharacterSheetStore.setState({
      activeStates: [
        ...useCharacterSheetStore.getState().activeStates,
        "status_raging",
      ],
    });

    expect(actionIds()).toContain("action_eagle_dash");
  });

  it("withholds the Eagle Dash from a raging barbarian in plate", () => {
    useCharacterSheetStore
      .getState()
      .initialize(eagleBarbarian([plate]) as never);
    useCharacterSheetStore.setState({
      activeStates: [
        ...useCharacterSheetStore.getState().activeStates,
        "status_raging",
      ],
    });

    // the pack forbids it on status_wearing_heavy_armor, and the trait's own
    // summary claims this gate holds on the sheet - until now it did not
    expect(useCharacterSheetStore.getState().activeStates).toContain(
      "status_wearing_heavy_armor",
    );
    expect(actionIds()).not.toContain("action_eagle_dash");
  });
});
```

- [ ] **Step 2: Run the test and watch the first and third fail**

Run: `pnpm --filter @project/web test -- characterSheetStore`
Expected: the "not raging" and "in plate" cases FAIL — the action is offered in every state today. The middle case passes already.

- [ ] **Step 3: Export the engine's predicate**

In `packages/engine/src/pipeline/actionResolver.ts`, change the declaration:

```ts
/**
 * Whether an action may be used in these states.
 *
 * Exported because the sheet gates on the same rule: the web app decides
 * whether to offer an action, the resolver decides whether to apply it, and
 * both must agree about what an effect's states mean (#76).
 * @param effect The action's effect, whose predicate may be top level or in a predicates group
 * @param activeStates The states that currently hold
 * @returns True when every required state holds and no forbidden one does
 */
export const matchesStatePredicate = (
```

Leave its body and both existing callers unchanged.

- [ ] **Step 4: Gate the sheet's actions**

In `apps/web/src/store/characterSheetStore.ts`, add `matchesStatePredicate` to the existing import from `@project/engine`, and extend `getCharacterActions`'s filter so the returned expression reads:

```ts
      return [
        ...STANDARD_ACTIONS,
        ...activeTraits.flatMap((trait) => trait.actions ?? []),
      ].filter(
        // A dynamic_weapon_attack is a template: useCombat draws its concrete
        // swings as attack cards. Relentless Rage answers a moment the Rules
        // panel reports - 0 hit points while raging - and lives there, not as
        // a button that can be pressed at full health. Dropped by id, not as
        // every self_save: the panel offers only this one, and any other
        // self-save would otherwise be reachable from nowhere.
        (action) =>
          action.effect.type !== "dynamic_weapon_attack" &&
          action.id !== RELENTLESS_RAGE_ACTION_ID &&
          // An action the character's states forbid was offered as an enabled
          // button that silently did nothing when pressed: the resolver
          // returns executed with no effect applied (#76).
          matchesStatePredicate(action.effect, state.activeStates),
      );
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm --filter @project/web test -- characterSheetStore`
Expected: PASS, all three.

- [ ] **Step 6: Run the gates and commit**

```bash
pnpm --filter @project/web test
pnpm --filter @project/engine test
pnpm --filter @project/engine typecheck
pnpm --filter @project/web typecheck
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' packages/engine/src/pipeline/actionResolver.ts apps/web/src/store/characterSheetStore.ts apps/web/src/store/__tests__/characterSheetStore.test.ts
pnpm check:hygiene
git add packages/engine/src/pipeline/actionResolver.ts apps/web/src/store/characterSheetStore.ts apps/web/src/store/__tests__/characterSheetStore.test.ts
git commit -F - <<'EOF'
fix(web): the sheet stops offering an action its states forbid (#76)

Nothing read an action's forbiddenStates: the web never did, and the
server is handed effect-manager states alone. A raging barbarian in heavy
armour was offered the Eagle Dash button the pack says is blocked, and
pressing it silently did nothing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 5: A heal goes to the server raw

**Files:**
- Modify: `apps/web/src/store/characterSheetStore.ts` (the `socketService.emitHpModification` call inside `applyHealthDelta`)
- Test: `apps/web/src/store/__tests__/characterSheetStore.test.ts` (the `"hp trigger handling"` block)

**Interfaces:**
- Consumes: nothing from earlier tasks.

**Context you need:** `applyHealthDelta` clamps with `state.getMaxHp()` and emits the post-clamp delta. When the client's derived maximum is *lower* than the server's, the heal is cut before it leaves and the server can only clamp further, never restore. #89 made the client report what applied because a trigger can change it — but the trigger fires only when `delta < 0` (`shouldDispatchTrigger` requires it). For a positive delta the applied amount differs from the raw one only by the client's own clamp, which the server does better and asserts back.

The existing test `"emits the delta that actually applied, not the one that was asked for"` asserts a heal of 10 emits 5. **That expectation is what this task reverses**: it becomes 10. The damage tests do not change.

- [ ] **Step 1: Change the failing expectation and watch it fail**

In the `"hp trigger handling"` block, replace the heal test with:

```ts
  it("sends a heal raw and lets the server clamp it", () => {
    const store = useCharacterSheetStore.getState();

    // the fixture derives a maximum of 10 and starts at 5. The sheet still
    // shows 10, but the server is sent the whole 10: only damage can carry a
    // trigger, so a heal's applied amount differs from the raw one by the
    // client's own clamp alone - and the client's maximum may be the stale
    // one (#93)
    store.applyHealthDelta(10, "test");

    expect(useCharacterSheetStore.getState().currentHp).toBe(10);
    expect(socketService.emitHpModification).toHaveBeenCalledWith(
      expect.objectContaining({ characterId: "char_1", delta: 10 }),
    );
  });
```

Leave `"emits the post-trigger delta when Relentless Endurance saves the character"` exactly as it is — it asserts −4 and must keep doing so.

Run: `pnpm --filter @project/web test -- characterSheetStore`
Expected: the heal test FAILS with 5 where 10 was expected; the trigger test still passes.

- [ ] **Step 2: Send a heal raw**

In `applyHealthDelta`, replace the emit's delta line so the call reads:

```ts
      // fire and forget network req. Damage reports what actually applied,
      // because a trigger may have turned a lethal hit into one hit point.
      // A heal is sent raw: no trigger fires on a positive delta, so the only
      // thing the client's clamp adds is its own maximum - which may be stale
      // and lower than the server's, silently losing hit points (#93). The
      // server clamps and asserts the total back, which the sheet follows.
      socketService.emitHpModification({
        characterId: state.id,
        delta: delta > 0 ? delta : appliedHp - previousHp,
        source,
        timestamp: Date.now(),
      });
```

- [ ] **Step 3: Run the tests and watch them pass**

Run: `pnpm --filter @project/web test -- characterSheetStore`
Expected: PASS.

- [ ] **Step 4: Run the gates and commit**

```bash
pnpm --filter @project/web test
pnpm --filter @project/web typecheck
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' apps/web/src/store/characterSheetStore.ts apps/web/src/store/__tests__/characterSheetStore.test.ts
pnpm check:hygiene
git add apps/web/src/store/characterSheetStore.ts apps/web/src/store/__tests__/characterSheetStore.test.ts
git commit -F - <<'EOF'
fix(web): a heal reaches the server raw (#93)

The sheet clamped a heal against its own derived maximum before emitting,
so a client whose rules view was stale and low truncated the heal
irrecoverably. Only damage can carry a trigger, so only damage needs to
report what applied.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Close the items, record the server-side gate, fix the contradictions

**Files:**
- Modify: `docs/TODO_BACKLOG.md`

**Context you need:** the backlog has a master status table and per-item sections. **Follow the exact treatment `### #81` received in this same file** — heading suffixed with ` ✅`, the per-item table's Notes gaining a closing clause, the master table row's status and section columns updated, and a closing paragraph. Read #81's entry first and mirror it. Note that #92's `Item` cells are lowercase where every sibling capitalizes them; capitalize yours.

- [ ] **Step 1: Close #71, #76 and #93**

Mirror #81's shape for each. The closing paragraphs should say, respectively:

- **#71** — closed 2026-09-23 on `fix/sheet-truthfulness`. `RESOURCE_CONSUMED` joined the events the sheet acts on; a pure `resolveActionError` (`sheetErrorEvents.ts`) decides what an `action_error` means, so the routing is testable without a socket; and `rollbackResourceSpend` puts the charge back, clamped to the pool's maximum, before the notice is raised. An echo naming another character is ignored.
- **#76** — closed 2026-09-23 on `fix/sheet-truthfulness`. The `baseStates` field is gone; one helper compiles the character's active traits once and returns both the gating states (through `gatherBaseStates`) and the condition suppressions, so `activeStates` finally carries trait and equipment states. Record what planning found and the entry had wrong: fixing the list was **not sufficient** for the Eagle Totem symptom, because nothing gated an action on its `forbiddenStates` at all — the web never read them and the server is handed effect-manager states alone. `getCharacterActions` now gates on the engine's own `matchesStatePredicate`, so a raging barbarian in plate is not offered the Dash, and an action with `requiredStates` is no longer offered before they hold.
- **#93** — closed 2026-09-23 on `fix/sheet-truthfulness`. A heal is emitted raw and the server clamps it; only damage reports what applied, because only damage can carry a trigger. The invariant this rests on is recorded in the spec: nothing modifies incoming healing.

- [ ] **Step 2: Close S5 with a note**

Mirror #81's shape. The closing paragraph should say: closed 2026-09-23 on `fix/sheet-truthfulness`, because the inventory-scoped banner it complained about no longer exists — the sheet has one notice, rendered above the grid. Note plainly that this is **not** the page-level treatment S5 speculated about; if that is still wanted it is a new item about routing, not about this banner.

- [ ] **Step 3: Record the server-side action gate**

Add a new item **#97** in the format the other current-era open items use (a master status table row in numeric order, and its own `### #97 — ...` entry with a one-row table and prose):

> **#97 — the gateway gates an action on the effect manager's states alone.** `ActionResolver.execute` checks an effect's `requiredStates` and `forbiddenStates` honestly, but `apps/server/src/gateway/socket.ts` hands it `runtime.effectManager.getActiveStates()`, so no state that comes from a trait or from worn equipment can block an action server-side — `status_wearing_heavy_armor` comes from the inventory and is never in that list. A blocked action is not refused either: it returns `executed: true` having applied nothing, so a client that asks anyway is told it worked. #76 stopped the sheet offering a forbidden action; it did not stop a crafted or stale client asking. Fix: compose the action states the gateway passes from the character's full state rather than the effect manager alone, which is the same question as #92 — what the server may know about a character's rules. Found while planning `fix/sheet-truthfulness`.

- [ ] **Step 4: Fix the three contradictions**

- #68 is marked closed in Tier 1 but open in its own entry and in the Item Index. Reconcile them to closed, matching what Tier 1 already records.
- #89 and #90 carry ✅ headings while sitting under `## Open items`; the Item Index says they are in "Closed items (11h)". Move them to the closed section so the index is true.
- The "Suggested first sitting" paragraph recommends four items that are all now closed. Rewrite it to point at what is actually next, or delete it if the Recommended sequence's tiers already say so — say which you did in your report.

- [ ] **Step 5: Verify and commit**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' docs/TODO_BACKLOG.md
pnpm check:hygiene
git add docs/TODO_BACKLOG.md
git commit -F - <<'EOF'
docs: close #71, #76, #93 and S5; record #97

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 7 (controller-run): gates

Not a subagent task. The controller runs `pnpm test:all` and all five package typechecks on the finished branch, confirms lint shows only the two known #65 warnings, and confirms every touched file is CRLF.

## Task 8 (controller-run): hand check

Not a subagent task, and it needs the owner's permission because it touches a running app and a dev database.

1. A barbarian with Totem Spirit (Eagle) is not offered the Eagle Dash button while out of rage, is offered it while raging in light armour, and is not offered it while raging in plate.
2. A resource spend refused by the server puts the charge back on the sheet and shows a notice above the grid, not inside the inventory panel.
3. An attunement the rules forbid shows its message in that same notice.
4. A character at less than full health heals past their maximum: the sheet shows the maximum and the stored row holds the maximum.
