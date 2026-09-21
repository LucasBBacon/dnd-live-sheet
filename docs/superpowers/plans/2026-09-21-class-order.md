# Class Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A character's classes keep the order they were taken in, so `CharacterSave.classes[0]` is always the class the character started in (backlog #74).

**Architecture:** `character_classes` gains a `position` column (0 = creation class, then each dip in order). One exported ordering, `classLedgerOrder`, is spread into every ledger read's `.orderBy()`. Creation, level-up dips and the seeder write `position`.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`), Drizzle ORM + drizzle-kit (Postgres), Express, Socket.IO, Vitest, supertest. pnpm + turbo monorepo.

**Spec:** `docs/superpowers/specs/2026-09-21-class-order-design.md`

## Global Constraints

- Branch: `fix/class-order`. Commit after every task, with `git commit -F <message-file>`. Every message ends with a blank line then exactly `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` — never another model name.
- **Line endings.** This checkout mixes CRLF and LF per file, and git normalises endings (core.autocrlf=true), so `git show`/`git diff` can never reveal a file's working-tree ending. Measure with `file <path>` or by counting `\r\n` with node, before and after every edit, and restore the original ending:
  - to CRLF: `node -e "const fs=require('fs'),f=process.argv[1];fs.writeFileSync(f,fs.readFileSync(f,'utf8').split(/\r?\n/).join('\r\n'))" <path>`
  - to LF: `node -e "const fs=require('fs'),f=process.argv[1];fs.writeFileSync(f,fs.readFileSync(f,'utf8').split(/\r\n/).join('\n'))" <path>`
  - Measured at plan time: `apps/server/src/routes/__tests__/character.test.ts` is **LF**; every other existing file below is CRLF. New source and test files are CRLF. Files drizzle-kit generates under `packages/database/drizzle/` stay LF.
- Typecheck is a separate gate: `pnpm --filter <pkg> exec tsc --noEmit` per package (web: `pnpm --filter @project/web exec tsc -b`), never through turbo's cache.
- The ordering, verbatim: `position` ascending, then `class_id` ascending.
- Implementers generate migrations but never run `db:migrate`, `db:push` or a seeder; the controller applies migrations with the owner's permission (Task 4).
- Touch only the files a task lists. A failure in any other file: stop and report NEEDS_CONTEXT.

## File Map

| File | Change | Task |
| --- | --- | --- |
| `packages/database/src/schema/operational.ts` | `character_classes.position` | 1 |
| `packages/database/drizzle/0015_add_class_position.sql` + `meta/` | Generated | 1 |
| `packages/database/src/__tests__/classPositionColumn.test.ts` | Create | 1 |
| `apps/server/src/services/classLedger.ts` | Create: `classLedgerOrder` | 1 |
| `apps/server/src/services/__tests__/classLedger.test.ts` | Create | 1 |
| `apps/server/src/gateway/socket.ts` | Two ledger reads ordered | 2 |
| `apps/server/src/routes/character.ts` | Payload ledger read ordered (2); creation writes `position` (3) | 2, 3 |
| `apps/server/src/controllers/characterController.ts` | Ledger read ordered (2); dip writes `position` (3) | 2, 3 |
| `apps/server/src/services/referenceProvider/databaseReferenceProvider.ts` | Ledger read ordered | 2 |
| `apps/server/src/gateway/__tests__/socket.rooms.test.ts` | Runtime-context read ordered | 2 |
| `apps/server/src/gateway/__tests__/socket.inventory.test.ts` | Rest-handler read ordered | 2 |
| `apps/server/src/routes/__tests__/character.get.test.ts` | Payload read ordered | 2 |
| `apps/server/src/routes/__tests__/character.choices.test.ts` | Harnesses support `orderBy`; assertions (2, 3) | 2, 3 |
| `apps/server/src/routes/__tests__/character.test.ts` | Level-up harness supports `orderBy` | 2 |
| `packages/database/src/seedSampleCharacters.ts` | Seeder writes `position` | 3 |
| `docs/TODO_BACKLOG.md` | #74 closed | 4 |

---

### Task 1: The `position` column and the one ordering

**Files:**
- Modify: `packages/database/src/schema/operational.ts` (`characterClasses`)
- Generate: `packages/database/drizzle/0015_add_class_position.sql`, `packages/database/drizzle/meta/0015_snapshot.json`, `packages/database/drizzle/meta/_journal.json`
- Create: `packages/database/src/__tests__/classPositionColumn.test.ts`
- Create: `apps/server/src/services/classLedger.ts`
- Create: `apps/server/src/services/__tests__/classLedger.test.ts`

**Interfaces:**
- Produces: `characterClasses.position` — non-null integer, default 0.
- Produces: `classLedgerOrder` from `apps/server/src/services/classLedger.ts` — a readonly tuple `[asc(characterClasses.position), asc(characterClasses.classId)]`, spread into `.orderBy(...classLedgerOrder)`.

- [ ] **Step 1: Write the failing tests**

Create `packages/database/src/__tests__/classPositionColumn.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { characterClasses } from "../schema/operational.js";

describe("character_classes.position", () => {
  it("is a non-null integer defaulting to 0, the class taken at creation", () => {
    const column = getTableConfig(characterClasses).columns.find(
      (candidate) => candidate.name === "position",
    );

    expect(column?.getSQLType()).toBe("integer");
    expect(column?.notNull).toBe(true);
    expect(column?.default).toBe(0);
  });
});
```

Create `apps/server/src/services/__tests__/classLedger.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderSql } from "../../gateway/__tests__/fakeDb.js";
import { classLedgerOrder } from "../classLedger.js";

describe("classLedgerOrder", () => {
  it("orders by position, then class id as a deterministic tiebreak", () => {
    expect(classLedgerOrder.map((part) => renderSql(part).sql)).toEqual([
      '"character_classes"."position" asc',
      '"character_classes"."class_id" asc',
    ]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @project/database exec vitest run src/__tests__/classPositionColumn.test.ts` — Expected: FAIL (no `position` column).
Run: `pnpm --filter @project/server exec vitest run src/services/__tests__/classLedger.test.ts` — Expected: FAIL (cannot resolve `../classLedger.js`).

- [ ] **Step 3: Add the column**

In `operational.ts`, in `characterClasses`'s column object, add after `subclassId`:

```ts
    // the order the classes were taken in: 0 for the class chosen at creation,
    // then each multiclass dip in turn. The engine grants starting
    // proficiencies to the first class only, so this order is load-bearing (#74)
    position: integer("position").notNull().default(0),
```

- [ ] **Step 4: Generate the migration**

Run: `pnpm --filter @project/database db:generate --name add_class_position`
Expected: `packages/database/drizzle/0015_add_class_position.sql` containing exactly
`ALTER TABLE "character_classes" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;`
plus `meta/0015_snapshot.json` and an updated `meta/_journal.json`. Anything else in the SQL, a different number, or a prompt from drizzle-kit: stop and report NEEDS_CONTEXT with the output. Do not hand-edit generated files. Confirm the three are LF.

- [ ] **Step 5: Add the ordering**

Create `apps/server/src/services/classLedger.ts`:

```ts
import { asc } from "drizzle-orm";
import { characterClasses } from "@project/database/src/schema/operational.js";

/**
 * The order every character_classes read returns: the order the classes were
 * taken in, with class id breaking ties so the result never depends on how
 * Postgres happens to scan the table.
 *
 * Load-bearing, not cosmetic: the engine grants starting proficiencies - and
 * the choice blocks they carry - to CharacterSave.classes[0] only. Without an
 * order, an UPDATE on a multiclass character's first class could make its
 * second class read as first (#74).
 */
export const classLedgerOrder = [
  asc(characterClasses.position),
  asc(characterClasses.classId),
] as const;
```

- [ ] **Step 6: Run the tests; suites; typecheck**

Run both focused tests — PASS.
Run: `pnpm --filter @project/database test` and `pnpm --filter @project/server test` — PASS.
Run: `pnpm --filter @project/database exec tsc --noEmit` and `pnpm --filter @project/server exec tsc --noEmit` — clean.

- [ ] **Step 7: Restore endings, commit**

`operational.ts` and the four new source/test files CRLF; generated files LF.

Message: `feat(database): character_classes.position, the order classes were taken in (#74)`

---

### Task 2: Every ledger read is ordered

**Files:**
- Modify: `apps/server/src/gateway/socket.ts` (the ledger read in `getAuthoritativeRuntimeContext`, and the one in the `REST_COMPLETED` handler)
- Modify: `apps/server/src/routes/character.ts` (`fetchCharacterPayload`'s ledger read)
- Modify: `apps/server/src/controllers/characterController.ts` (`applyLevelUp`'s ledger read)
- Modify: `apps/server/src/services/referenceProvider/databaseReferenceProvider.ts` (`loadCharacterClassLevels`)
- Test: `apps/server/src/gateway/__tests__/socket.rooms.test.ts`, `apps/server/src/gateway/__tests__/socket.inventory.test.ts`, `apps/server/src/routes/__tests__/character.get.test.ts`, `apps/server/src/routes/__tests__/character.choices.test.ts`
- Modify (harness only): `apps/server/src/routes/__tests__/character.test.ts` (**LF**)

**Interfaces:**
- Consumes: `classLedgerOrder` (Task 1).
- The gateway's `FakeDb` records each statement's `.orderBy(...)` arguments in `DbOperation.orderBy: unknown[]`; `renderSql(value)` renders one to `{ sql, params }`.

- [ ] **Step 1: Write the failing tests**

The rendered ordering. Define it at module level in both `socket.rooms.test.ts` and `socket.inventory.test.ts` (tests (a) and (b) use it; (c) inlines it):

```ts
const LEDGER_ORDER_SQL = [
  '"character_classes"."position" asc',
  '"character_classes"."class_id" asc',
];
```

(a) `socket.rooms.test.ts` — add `characterClasses` to the operational import if absent, and `renderSql` from `./fakeDb.js` if absent. In the describe block holding "writes the character's missing pools when it joins", add:

```ts
  it("reads the class ledger in the order the classes were taken (#74)", async () => {
    harness = await setupGateway();
    asMember(harness.db);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterInventory, []);
    harness.db.seed(characterResources, []);

    await harness.emit(SOCKET_EVENTS.ROOM_JOIN, {
      campaignId: "camp-1",
      characterId: "char-1",
    });

    const [ledgerRead] = harness.db.opsFor(characterClasses, "select");
    expect(ledgerRead?.orderBy.map((part) => renderSql(part).sql)).toEqual(
      LEDGER_ORDER_SQL,
    );
  });
```

(b) `socket.inventory.test.ts` — in `describe("socket gateway - REST_COMPLETED", ...)`, add (import `characterClasses` if absent):

```ts
  it("reads the class ledger in the order the classes were taken (#74)", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.REST_COMPLETED, {
      characterId: "char-1",
      restType: "long",
    });

    const [ledgerRead] = harness.db.opsFor(characterClasses, "select");
    expect(ledgerRead?.orderBy.map((part) => renderSql(part).sql)).toEqual(
      LEDGER_ORDER_SQL,
    );
  });
```

(c) `character.get.test.ts` — import `characterClasses` alongside the existing operational imports, and add:

```ts
  it("returns the class ledger in the order the classes were taken (#74)", async () => {
    const db = seededDb();
    const app = await setupApp(db);

    await request(app).get("/api/character/char-1");

    const [ledgerRead] = db.opsFor(characterClasses, "select");
    expect(ledgerRead?.orderBy.map((part) => renderSql(part).sql)).toEqual([
      '"character_classes"."position" asc',
      '"character_classes"."class_id" asc',
    ]);
  });
```

(d) `character.choices.test.ts` — both level-up harnesses (`setupLevelUp` and the real-resolver one used by the rogue-dip test) build `tx.where` as `vi.fn().mockImplementation(async () => selectResults.shift() ?? [])`, which cannot chain `.orderBy()`. In each, add `const orderBy = vi.fn();` before `tx`, replace that `where` with:

```ts
      where: vi.fn().mockImplementation(() => {
        const rows = selectResults.shift() ?? [];
        return Object.assign(Promise.resolve(rows), {
          orderBy: (...args: unknown[]) => {
            orderBy(...args);
            return Promise.resolve(rows);
          },
        });
      }),
```

and add `orderBy` to what the harness returns. Import `classLedgerOrder` from `../../services/classLedger.js`, and add to `describe("applyLevelUp choices", ...)`:

```ts
  it("reads the class ledger in the order the classes were taken (#74)", async () => {
    const { applyLevelUp, orderBy } = await setupLevelUp();
    const { res } = response();

    await applyLevelUp(levelUp({}), res);

    expect(orderBy).toHaveBeenCalledWith(...classLedgerOrder);
  });
```

(e) `character.test.ts` (**LF** — keep it LF) — its `setupLevelUpHarness` builds `tx.where` the same way (an async function returning `selectResults.shift() ?? []`). Replace it with the same thenable-plus-`orderBy` shape (no `orderBy` mock needed: `orderBy: () => Promise.resolve(rows)`), so its existing tests keep working once the controller orders its read. Add no new tests there.

- [ ] **Step 2: Run to verify the new tests fail**

Run: `pnpm --filter @project/server exec vitest run src/gateway src/routes`
Expected: the four new tests FAIL (no `orderBy` recorded / `orderBy` not called); every existing test still passes — the harness changes alone must not break anything.

- [ ] **Step 3: Order all five reads**

In each file, import `classLedgerOrder` from the services module (`../services/classLedger.js` from `gateway/`, `routes/` and `controllers/`; `../classLedger.js` from `services/referenceProvider/`), and append `.orderBy(...classLedgerOrder)` to the `character_classes` query, directly after its `.where(...)`:
- `socket.ts` — `getAuthoritativeRuntimeContext`'s `classRows` query, and the `REST_COMPLETED` handler's `classRows` query (inside its transaction, `tx.select(...)`).
- `routes/character.ts` — `fetchCharacterPayload`'s `classLedger` query.
- `controllers/characterController.ts` — `applyLevelUp`'s `existingClasses` query.
- `databaseReferenceProvider.ts` — `loadCharacterClassLevels`'s `classRows` query.

Confirm there are no others: `grep -rn "from(characterClasses)" apps packages --include=*.ts | grep -v __tests__` must list exactly these five, each followed by an `orderBy(...classLedgerOrder)`.

- [ ] **Step 4: Run to verify they pass; suites; typecheck**

Run: `pnpm --filter @project/server exec vitest run src/gateway src/routes` — PASS.
Run: `pnpm --filter @project/server test` — PASS. `pnpm --filter @project/server exec tsc --noEmit` — clean.

- [ ] **Step 5: Restore endings, commit**

All edited files keep their measured endings (`character.test.ts` LF, the rest CRLF).

Message: `fix(server): every class ledger read returns classes in the order taken (#74)`

---

### Task 3: Creation, level-up dips and the seeder write `position`

**Files:**
- Modify: `apps/server/src/routes/character.ts` (`POST /`'s `characterClasses` insert)
- Modify: `apps/server/src/controllers/characterController.ts` (`applyLevelUp`'s dip insert)
- Modify: `packages/database/src/seedSampleCharacters.ts` (`seedCharacter`'s `characterClasses` insert)
- Test: `apps/server/src/routes/__tests__/character.choices.test.ts`

**Interfaces:**
- Consumes: `characterClasses.position` (Task 1); the `existingClasses` rows `applyLevelUp` reads now carry `position: number`.

- [ ] **Step 1: Write the failing tests**

In `character.choices.test.ts`:

(a) in `describe("POST /api/character choices", ...)`:

```ts
  it("records the creation class as the first class taken (#74)", async () => {
    const { app, values } = await setupApp();

    const response = await request(app).post("/api/character").send(lyra);

    expect(response.status).toBe(201);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        classId: "class_bard",
        classLevel: 1,
        position: 0,
      }),
    );
  });
```

(b) the real-resolver rogue-dip harness's existing fighter ledger row: add `position: 0` to it (a stored row always has one now). Then in the rogue-dip test (or a sibling test using the same harness and payload), assert:

```ts
    expect(tx.values).toHaveBeenCalledWith(
      expect.objectContaining({ classId: "class_rogue", position: 1 }),
    );
```

(c) a dip after a gap: using the same harness with the stored fighter row at `position: 2`, the rogue dip inserts `position: 3` (the next place after the highest, not the count of classes). If the harness takes its ledger rows as a parameter, pass them; otherwise add that parameter.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @project/server exec vitest run src/routes/__tests__/character.choices.test.ts`
Expected: the three new assertions FAIL (no `position` written).

- [ ] **Step 3: Write `position`**

`routes/character.ts`, in the `tx.insert(characterClasses).values({ ... })` for the level-1 class, add:

```ts
        // the class chosen at creation is always the first class taken (#74)
        position: 0,
```

`controllers/characterController.ts`, in the dip branch's `tx.insert(characterClasses).values({ ... })`, add:

```ts
          // a dip takes the next place after every class already taken (#74)
          position:
            Math.max(-1, ...existingClasses.map((entry) => entry.position)) + 1,
```

`seedSampleCharacters.ts`, in `seedCharacter`'s `character.classes.map((entry) => ({ ... }))` for `characterClasses`, take the index and write it:

```ts
      character.classes.map((entry, position) => ({
        characterId: character.id,
        classId: entry.classId,
        classLevel: entry.classLevel,
        subclassId: entry.subclassId ?? null,
        // each sample lists its classes primary-first (#74)
        position,
      })),
```

Do not run the seeder.

- [ ] **Step 4: Run to verify they pass; everything; typecheck**

Run the focused file — PASS. Run: `pnpm test:all` — PASS (the sample-choices invariant included). Typecheck `@project/server` and `@project/database` — clean.

- [ ] **Step 5: Restore endings (CRLF), commit**

Message: `fix: creation, level-up dips and the seeder record class order (#74)`

---

### Task 4: Hand check, then the backlog

Steps 1–3 need the running app and the owner's database: the controller runs them.

- [ ] **Step 1: Apply the migration (owner's permission first)**

Ask the owner, then: `pnpm --filter @project/database db:migrate` and `pnpm --filter @project/database db:seed:samples`.

- [ ] **Step 2: Reproduce #74's failure condition and check it no longer fails**

1. `select class_id, position from character_classes where character_id = '00000000-0000-0000-0000-000000000113'` — bard 0, rogue 1.
2. `update character_classes set class_level = class_level where character_id = '00000000-0000-0000-0000-000000000113' and class_id = 'class_bard'`, then an **unordered** `select class_id from character_classes where character_id = ...` — confirm the bard row now comes back last (the exact condition #74 describes).
3. Restart the `server` preview; open Lyra: socket joins without `action_error`, and her bard starting skills (Performance, Acrobatics, Arcana) are proficient.

- [ ] **Step 3: Record results for the backlog task**

- [ ] **Step 4: Update the backlog**

`docs/TODO_BACKLOG.md` (CRLF): mark #74 ✅ closed 2026-09-21 on `fix/class-order` — `character_classes.position`, `classLedgerOrder` in every ledger read, writers updated, migration `0015_add_class_position` applied to the dev database — in its section and its Recommended-sequence row; the header's test count from `pnpm test:all`. Restore CRLF; `pnpm check:hygiene` passes.

- [ ] **Step 5: Commit**

Message: `docs: close #74`
