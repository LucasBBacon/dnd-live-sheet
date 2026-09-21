# Tier 1 — Reach the Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close backlog #64, #63 and #68's fixed half, so the socket gateway connects on a fresh clone, resource spends persist from the moment a character joins, and a preset background's fixed proficiencies reach the live sheet.

**Architecture:** #64 moves the client-origin default into one helper both servers call. #63 makes `ROOM_JOIN` run the same `getAuthoritativeRuntimeContext` materialisation that turns and actions already run, and makes `RESOURCE_CONSUMED` refuse to broadcast a spend that matched no row. #68 extends the race pattern by one: backgrounds join the rule snapshot, the save gains an optional `backgroundId`, and the bootstrapper appends the background's `backgroundTraitIds`.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`), Zod, Vitest, Socket.IO, Drizzle ORM, Zustand. pnpm + turbo monorepo.

**Spec:** `docs/superpowers/specs/2026-09-21-tier1-reach-the-player-design.md`

## Global Constraints

- Branch: `fix/tier1-reach-the-player`. Commit after every task; end each commit message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Line endings.** This checkout mixes CRLF and LF per file, and the Write/Edit tools and Git Bash's `sed -i` all emit LF. Before editing a file, run `file <path>`. After editing, restore its original ending with the matching command, then re-run `file <path>`:
  - to CRLF: `node -e "const fs=require('fs'),f=process.argv[1];fs.writeFileSync(f,fs.readFileSync(f,'utf8').split(/\r?\n/).join('\r\n'))" <path>`
  - to LF: `node -e "const fs=require('fs'),f=process.argv[1];fs.writeFileSync(f,fs.readFileSync(f,'utf8').split(/\r\n/).join('\n'))" <path>`
  - New files are CRLF.
  - Known at plan time: every file below is CRLF **except** `apps/server/src/gateway/__tests__/socket.rooms.test.ts`, which is LF.
- **Typecheck is a separate gate.** Vitest does not typecheck. Typecheck per package with `pnpm --filter <pkg> exec tsc -b` (web) or `pnpm --filter <pkg> exec tsc --noEmit` (others), never through turbo's cache. Packages: `@project/shared`, `@project/engine`, `@project/database`, `@project/server`, `@project/web`.
- `exactOptionalPropertyTypes` is on: never assign `undefined` to an optional property. Use a conditional spread, `...(value ? { key: value } : {})`.
- Error message for #63's new guard, verbatim: `"Unknown resource for this character."`
- Client-origin default, verbatim: `"http://localhost:5173"`.

## File Map

| File | Change | Task |
| --- | --- | --- |
| `apps/server/src/utils/clientOrigin.ts` | Create: `clientOrigin()` | 1 |
| `apps/server/src/utils/__tests__/clientOrigin.test.ts` | Create | 1 |
| `apps/server/src/index.ts` | Use `clientOrigin()` | 1 |
| `apps/server/src/gateway/socket.ts` | Use `clientOrigin()` (1); guard `RESOURCE_CONSUMED` (2); materialise on join + `onConflictDoNothing` (3); `backgroundId` in save, export `toCharacterSave` (5) | 1, 2, 3, 5 |
| `apps/server/src/gateway/__tests__/socket.rooms.test.ts` | Origin test (1); join materialisation tests (3) | 1, 3 |
| `apps/server/src/gateway/__tests__/socket.inventory.test.ts` | Seed a resource row; missing-row test | 2 |
| `apps/server/src/gateway/__tests__/fakeDb.ts` | Record `onConflictDoNothing` | 3 |
| `packages/shared/src/schemas/runtime/ruleSnapshot.ts` | `backgroundsById` | 4 |
| `packages/shared/src/schemas/runtime/characterSave.ts` | `backgroundId` optional | 4 |
| `packages/shared/src/schemas/__tests__/toRuleSnapshot.test.ts` | Backgrounds keyed | 4 |
| `apps/server/src/services/packRulebook.ts` | `EMPTY.backgroundsById` | 4 |
| `packages/engine/src/rules/ruleLookup.ts` | `backgroundsById`, `resolveBackgroundDefinition` | 4 |
| `packages/engine/src/pipeline/characterBootstrapper.ts` | Background trait ids | 4 |
| `packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts` | Background tests | 4 |
| `apps/server/src/gateway/__tests__/socket.characterSave.test.ts` | Create | 5 |
| `apps/web/src/store/characterSheetStore.ts` | `backgroundId` state + save | 5 |
| `apps/web/src/pages/characterSheetRouteData.ts` | Hydrate `backgroundId` | 5 |
| `apps/web/src/store/__tests__/characterSheetStore.test.ts` | Background proficiency test | 5 |
| `apps/server/src/routes/character.ts` | Payload carries `resources` | 5b |
| `apps/server/src/routes/__tests__/character.get.test.ts` | Create | 5b |
| `docs/TODO_BACKLOG.md` | Close items, record findings | 6 |

---

### Task 1: #64 — one client origin for Express and the socket gateway

**Files:**
- Create: `apps/server/src/utils/clientOrigin.ts`
- Create: `apps/server/src/utils/__tests__/clientOrigin.test.ts`
- Modify: `apps/server/src/index.ts:20`
- Modify: `apps/server/src/gateway/socket.ts:494`
- Test: `apps/server/src/gateway/__tests__/socket.rooms.test.ts`

**Interfaces:**
- Produces: `clientOrigin(): string` from `apps/server/src/utils/clientOrigin.ts`.

- [ ] **Step 1: Write the failing unit test**

Create `apps/server/src/utils/__tests__/clientOrigin.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { clientOrigin } from "../clientOrigin.js";

describe("clientOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns CLIENT_URL when it is set", () => {
    vi.stubEnv("CLIENT_URL", "https://sheet.example.com");
    expect(clientOrigin()).toBe("https://sheet.example.com");
  });

  it("falls back to the Vite dev server when CLIENT_URL is unset", () => {
    vi.stubEnv("CLIENT_URL", "");
    expect(clientOrigin()).toBe("http://localhost:5173");
  });
});
```

- [ ] **Step 2: Write the failing gateway test**

In `apps/server/src/gateway/__tests__/socket.rooms.test.ts` (an **LF** file), add `vi` to the vitest import on line 1 (`import { afterEach, describe, expect, it, vi } from "vitest";`), then add this `describe` block at the end of the file:

```ts
/**
 * Express has always defaulted its CORS origin; the socket server did not, so
 * a clone without CLIENT_URL served REST and refused every socket (#64).
 */
describe("socket gateway - CORS origin", () => {
  let harness: GatewayHarness | undefined;

  afterEach(() => {
    harness?.restore();
    vi.unstubAllEnvs();
  });

  it("falls back to the same origin Express uses when CLIENT_URL is unset", async () => {
    vi.stubEnv("CLIENT_URL", "");
    harness = await setupGateway();

    expect(harness.serverOptions).toEqual(
      expect.objectContaining({
        cors: expect.objectContaining({ origin: "http://localhost:5173" }),
      }),
    );
  });
});
```

Make sure `GatewayHarness` and `setupGateway` are already imported from `./socketHarness.js` at the top of the file (they are used by the existing suites).

- [ ] **Step 3: Run both tests to verify they fail**

Run: `pnpm --filter @project/server exec vitest run src/utils/__tests__/clientOrigin.test.ts src/gateway/__tests__/socket.rooms.test.ts`
Expected: the unit test file fails to resolve `../clientOrigin.js`; the new gateway test fails because `origin` is `""`.

- [ ] **Step 4: Implement the helper**

Create `apps/server/src/utils/clientOrigin.ts`:

```ts
/**
 * The browser origin allowed to reach this server, for Express and Socket.IO
 * alike.
 *
 * One function rather than two copies of the default: the two used to
 * disagree, so a clone without CLIENT_URL got a working REST API and a socket
 * server that refused every connection (#64). Read at call time so tests can
 * vary the environment.
 * @returns CLIENT_URL, or the Vite dev server's origin when it is unset
 */
export const clientOrigin = (): string =>
  process.env.CLIENT_URL || "http://localhost:5173";
```

- [ ] **Step 5: Use it in both servers**

In `apps/server/src/index.ts`, add the import beside the other local imports:

```ts
import { clientOrigin } from "./utils/clientOrigin.js";
```

and replace line 20 with:

```ts
app.use(cors({ origin: clientOrigin() }));
```

In `apps/server/src/gateway/socket.ts`, add `import { clientOrigin } from "../utils/clientOrigin.js";` with the other local imports, and replace line 494 with:

```ts
    cors: { origin: clientOrigin(), methods: ["GET", "POST"] },
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @project/server exec vitest run src/utils/__tests__/clientOrigin.test.ts src/gateway/__tests__/socket.rooms.test.ts`
Expected: PASS, all tests.

- [ ] **Step 7: Restore line endings, typecheck, commit**

Restore endings (CRLF for the two new files, `index.ts` and `socket.ts`; LF for `socket.rooms.test.ts`), then:

Run: `pnpm --filter @project/server exec tsc --noEmit`
Expected: no errors.

```bash
git add apps/server/src/utils/clientOrigin.ts apps/server/src/utils/__tests__/clientOrigin.test.ts apps/server/src/index.ts apps/server/src/gateway/socket.ts apps/server/src/gateway/__tests__/socket.rooms.test.ts
git commit -m "fix(server): one client origin for Express and the socket gateway (#64)"
```

---

### Task 2: #63, part 1 — a spend that matched no row is an error, not a broadcast

**Files:**
- Modify: `apps/server/src/gateway/socket.ts` (the `RESOURCE_CONSUMED` handler, ~line 1428)
- Test: `apps/server/src/gateway/__tests__/socket.inventory.test.ts` (the `socket gateway - RESOURCE_CONSUMED` describe, ~line 296)

**Interfaces:**
- Produces: `RESOURCE_CONSUMED` emits `action_error` `{ event: SOCKET_EVENTS.RESOURCE_CONSUMED, error: "Unknown resource for this character.", payload }` to the sender and nothing to the room when the update returns no rows.

The fake database answers an update's `.returning(...)` with the standing rows seeded for that table, so "a row matched" means "`character_resources` is seeded with at least one row".

- [ ] **Step 1: Seed a row for the existing suite, and write the failing test**

In the `RESOURCE_CONSUMED` describe block, change `ready` so the existing broadcast test still has a row to decrement:

```ts
  const ready = async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterResources, [{ id: "res-1" }]);
  };
```

Then add this test at the end of the same describe block:

```ts
  /**
   * Before the join materialised pools, a spend on a pool that existed only
   * in the browser matched no row, succeeded silently, and was broadcast to
   * the table as if it had happened (#63). Nothing was written, so the spend
   * came back on reload.
   */
  it("reports an error and does not broadcast when no row matched", async () => {
    await ready();
    harness.db.seed(characterResources, []);

    await harness.emit(SOCKET_EVENTS.RESOURCE_CONSUMED, payload);

    expect(harness.roomEmits).toEqual([]);
    expect(harness.senderEmits).toEqual([
      {
        event: "action_error",
        payload: {
          event: SOCKET_EVENTS.RESOURCE_CONSUMED,
          error: "Unknown resource for this character.",
          payload,
        },
      },
    ]);
  });
```

- [ ] **Step 2: Run the suite to verify only the new test fails**

Run: `pnpm --filter @project/server exec vitest run src/gateway/__tests__/socket.inventory.test.ts`
Expected: the new test FAILS (the room receives a broadcast); every other test passes.

- [ ] **Step 3: Implement the guard**

In `socket.ts`'s `RESOURCE_CONSUMED` handler, keep the `const campaignId = await ensureCharacterInSocketCampaign(...)` call at the top of the `try` exactly as it is. Replace everything after it inside the `try` — from `await db.transaction(async (tx) => {` down to the closing `});` of the `socket.to(...).emit(...)` broadcast — with:

```ts
          // decrement resource automatically, prevent neg values
          const consumed = await db.transaction(async (tx) =>
            tx
              .update(characterResources)
              .set({
                current: sql`GREATEST(${characterResources.current} - ${payload.amount}, 0)`,
              })
              .where(
                and(
                  eq(characterResources.id, payload.resourceId),
                  eq(characterResources.characterId, payload.characterId),
                ),
              )
              .returning({ id: characterResources.id }),
          );

          // An update that matched nothing still succeeds. Broadcasting it
          // told the table about a spend the database never recorded (#63).
          if (consumed.length === 0) {
            socket.emit("action_error", {
              event: SOCKET_EVENTS.RESOURCE_CONSUMED,
              error: "Unknown resource for this character.",
              payload,
            });
            return;
          }

          // broadcast to room
          socket
            .to(`campaign_${campaignId}`)
            .emit(SOCKET_EVENTS.RESOURCE_CONSUMED, {
              actorId: socket.id,
              data: payload,
            });
```

- [ ] **Step 4: Run the suite to verify it passes**

Run: `pnpm --filter @project/server exec vitest run src/gateway/__tests__/socket.inventory.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Restore line endings (both CRLF), typecheck, commit**

Run: `pnpm --filter @project/server exec tsc --noEmit`
Expected: no errors.

```bash
git add apps/server/src/gateway/socket.ts apps/server/src/gateway/__tests__/socket.inventory.test.ts
git commit -m "fix(server): refuse to broadcast a resource spend that matched no row (#63)"
```

---

### Task 3: #63, part 2 — materialise a character's pools on join

**Files:**
- Modify: `apps/server/src/gateway/socket.ts` (`ROOM_JOIN` handler ~line 565; the pool insert in `getAuthoritativeRuntimeContext` ~line 301)
- Modify: `apps/server/src/gateway/__tests__/fakeDb.ts`
- Test: `apps/server/src/gateway/__tests__/socket.rooms.test.ts` (**LF**)

**Interfaces:**
- Consumes: `getAuthoritativeRuntimeContext(characterId: string): Promise<AuthoritativeRuntimeContext>` (existing, module-private in `socket.ts`).
- Produces: `DbOperation.onConflict: "nothing" | null` on the fake, set when a statement chains `.onConflictDoNothing()`.

A character with no `character_classes` rows is saved as a level 1 fighter by `toCharacterSave`, and a level 1 fighter's traits grant the `trait_second_wind` pool. That is the pool the join test expects to be inserted.

- [ ] **Step 1: Teach the fake to record `onConflictDoNothing`**

In `fakeDb.ts`, add a field to `DbOperation` after `values`:

```ts
  /** "nothing" once `.onConflictDoNothing()` was chained, otherwise null. */
  onConflict: "nothing" | null;
```

initialise it in `chain` beside `values: undefined,`:

```ts
      onConflict: null,
```

and in `passthrough`, add a branch beside the `values` one:

```ts
        } else if (name === "onConflictDoNothing") {
          op.onConflict = "nothing";
```

- [ ] **Step 2: Write the failing tests**

In `socket.rooms.test.ts`, add `characterResources` to the existing import from `@project/database/src/schema/operational.js`. Then, inside the describe block that holds "pushes an inventory snapshot to the joining client only", add:

```ts
  /**
   * The pools a character's traits grant used to exist only in the browser
   * until a turn or action event, so a spend before then matched no row and
   * was lost on reload (#63). Joining is the first moment the server knows
   * which character a socket plays, so that is where they are written.
   */
  it("writes the character's missing pools when it joins", async () => {
    harness = await setupGateway();
    asMember(harness.db);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterInventory, []);
    harness.db.seed(characterResources, []);

    await harness.emit(SOCKET_EVENTS.ROOM_JOIN, {
      campaignId: "camp-1",
      characterId: "char-1",
    });

    const [insert] = harness.db.opsFor(characterResources, "insert");
    expect(insert?.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "trait_second_wind",
          characterId: "char-1",
        }),
      ]),
    );
    // a turn event arriving alongside the join computes the same pools
    expect(insert?.onConflict).toBe("nothing");
  });

  it("writes nothing when the character already holds every pool", async () => {
    harness = await setupGateway();
    asMember(harness.db);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterInventory, []);
    harness.db.seed(characterResources, [
      {
        id: "trait_second_wind",
        name: "Second Wind",
        current: 1,
        max: 1,
        resetCondition: "short_rest",
      },
    ]);

    await harness.emit(SOCKET_EVENTS.ROOM_JOIN, {
      campaignId: "camp-1",
      characterId: "char-1",
    });

    expect(harness.db.opsFor(characterResources, "insert")).toEqual([]);
  });
```

Also update the existing test "joins the room before resolving the character, not after". Its last line asserts one `characters` select; joining now reads the row twice, once to check the campaign and once to build the runtime. Replace that line with:

```ts
    // once for the campaign check, once to materialise the character's pools
    expect(harness.db.opsFor(characters, "select")).toHaveLength(2);
```

- [ ] **Step 3: Run the suite to verify the new tests fail**

Run: `pnpm --filter @project/server exec vitest run src/gateway/__tests__/socket.rooms.test.ts`
Expected: "writes the character's missing pools when it joins" FAILS (no insert); the updated ordering test FAILS (1 select, not 2); the others pass.

- [ ] **Step 4: Materialise on join**

In `socket.ts`'s `ROOM_JOIN` handler, directly after the `console.log(`Socket ${socket.id} synced inventory for ...`)` call and still inside the same `try`, add:

```ts
            // Pools a character's traits grant exist only in the browser until
            // something writes them, and RESOURCE_CONSUMED can only decrement
            // a row that exists (#63). Turns and actions already materialise
            // through this; the join now does too, so they cannot drift.
            await getAuthoritativeRuntimeContext(characterId);
```

A failure lands in the existing `catch`: the room join stands and the client receives the existing "Character is not available in this campaign." error.

- [ ] **Step 5: Make the pool insert idempotent**

In `getAuthoritativeRuntimeContext`, change the missing-pools insert to:

```ts
  if (missingPools.length > 0) {
    // A join and a turn event can materialise the same pools concurrently;
    // the table's (character_id, id) key makes the second insert a no-op.
    await db
      .insert(characterResources)
      .values(missingPools.map((pool) => ({ ...pool, characterId })))
      .onConflictDoNothing();
  }
```

- [ ] **Step 6: Run the gateway suites to verify they pass**

Run: `pnpm --filter @project/server exec vitest run src/gateway`
Expected: PASS, every gateway suite.

- [ ] **Step 7: Restore line endings, typecheck, commit**

`socket.rooms.test.ts` back to **LF**; `socket.ts` and `fakeDb.ts` to CRLF (check `fakeDb.ts` with `file` first and keep what it had).

Run: `pnpm --filter @project/server exec tsc --noEmit`
Expected: no errors.

```bash
git add apps/server/src/gateway/socket.ts apps/server/src/gateway/__tests__/fakeDb.ts apps/server/src/gateway/__tests__/socket.rooms.test.ts
git commit -m "fix(server): write a character's resource pools when it joins (#63)"
```

---

### Task 4: #68, part 1 — backgrounds in the snapshot, the save and the bootstrapper

**Files:**
- Modify: `packages/shared/src/schemas/runtime/ruleSnapshot.ts`
- Modify: `packages/shared/src/schemas/runtime/characterSave.ts`
- Modify: `apps/server/src/services/packRulebook.ts:20-26`
- Modify: `packages/engine/src/rules/ruleLookup.ts`
- Modify: `packages/engine/src/pipeline/characterBootstrapper.ts` (`raceTraitIds` ~line 182, `resolveGrantedTraitIds` ~line 256)
- Test: `packages/shared/src/schemas/__tests__/toRuleSnapshot.test.ts`
- Test: `packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts`

**Interfaces:**
- Produces: `CoreRulePackSnapshot.backgroundsById: Record<string, CoreRulePack["backgrounds"][number]>` (required; `toRuleSnapshot` fills it).
- Produces: `CharacterSave.backgroundId?: string`.
- Produces: `RuleSnapshotLookup.backgroundsById?: Record<string, BackgroundDefinition> | undefined` and `resolveBackgroundDefinition(backgroundId: string, snapshot?: RuleSnapshotLookup): BackgroundDefinition | undefined` in `packages/engine/src/rules/ruleLookup.ts`.

- [ ] **Step 1: Write the failing shared test**

In `toRuleSnapshot.test.ts`, add inside `describe("toRuleSnapshot", ...)`:

```ts
  it("keys backgrounds by their id", () => {
    const snapshot = toRuleSnapshot(
      pack({
        backgrounds: [
          {
            id: "background_sage",
            name: "Sage",
            featureName: "Researcher",
            featureDescription: "You know where to look.",
            ideals: [],
            bonds: [],
            flaws: [],
            personalityTraits: [],
            backgroundTraitIds: ["trait_sage_prof_skills"],
            startingEquipment: { given: [], choices: [] },
            lore: { shortDescription: "A scholar." },
          },
        ],
      } as never),
    );

    expect(
      snapshot.backgroundsById["background_sage"]?.backgroundTraitIds,
    ).toEqual(["trait_sage_prof_skills"]);
  });
```

- [ ] **Step 2: Write the failing engine tests**

In `characterBootstraper.test.ts`, add inside `describe("CharacterBootstrapper.resolveGrantedTraitIds", ...)`:

```ts
  it("includes the traits a preset background grants", () => {
    const ids = CharacterBootstrapper.resolveGrantedTraitIds(
      { ...fighter(), backgroundId: "background_criminal" },
      corePackSnapshot(),
    );

    expect(ids).toEqual(
      expect.arrayContaining([
        "trait_criminal_prof_skills",
        "trait_criminal_prof_tools",
      ]),
    );
  });

  // three sample characters carry backgrounds the pack does not define
  it("grants nothing for a background the pack does not define", () => {
    const withUnknown = CharacterBootstrapper.resolveGrantedTraitIds(
      { ...fighter(), backgroundId: "background_charlatan" },
      corePackSnapshot(),
    );

    expect(withUnknown).toEqual(
      CharacterBootstrapper.resolveGrantedTraitIds(fighter(), corePackSnapshot()),
    );
  });

  it("carries a background's fixed skills through to proficiency grants", () => {
    const save = { ...fighter(), backgroundId: "background_criminal" };
    const skills = ProficiencyExtractor.extractProficiencies(
      CharacterBootstrapper.compileActiveTraits(save, corePackSnapshot()),
      CharacterBootstrapper.resolveSelections(save),
    )
      .filter((grant) => grant.category === "skills")
      .map((grant) => grant.proficiencyId);

    expect(skills).toEqual(expect.arrayContaining(["deception", "stealth"]));
  });
```

- [ ] **Step 3: Run both to verify they fail**

Run: `pnpm --filter @project/shared exec vitest run src/schemas/__tests__/toRuleSnapshot.test.ts`
Expected: FAIL — `snapshot.backgroundsById` is undefined.

Run: `pnpm --filter @project/engine exec vitest run src/pipeline/__tests__/characterBootstraper.test.ts`
Expected: "includes the traits a preset background grants" and "carries a background's fixed skills..." FAIL; "grants nothing for a background the pack does not define" passes already (it is the guard, and must keep passing).

- [ ] **Step 4: Add backgrounds to the snapshot**

In `ruleSnapshot.ts`, replace the doc comment above `export interface CoreRulePackSnapshot` with:

```ts
/**
 * The rulebook content a loaded pack contributes to the engine's lookups.
 *
 * Deliberately only what the engine resolves by id. Everything else in a pack
 * - feats, spells, proficiencies - reaches the runtime by other routes, and
 * adding them here before anything reads them would be the dead-data pattern
 * this project keeps having to unpick. Backgrounds joined once the
 * bootstrapper began resolving a save's backgroundId.
 */
```

add a field after `subclassesById`:

```ts
  /**
   * Keyed so the bootstrapper can resolve a save's backgroundId to the traits
   * the background grants, the same way it resolves a race.
   */
  backgroundsById: Record<string, CoreRulePack["backgrounds"][number]>;
```

and in `toRuleSnapshot`, after `subclassesById: byId(pack.subclasses),`:

```ts
  backgroundsById: byId(pack.backgrounds),
```

In `apps/server/src/services/packRulebook.ts`, add `backgroundsById: {},` to `EMPTY` after `subclassesById: {},`.

- [ ] **Step 5: Add `backgroundId` to the save**

In `characterSave.ts`, add after the `race` field of `CharacterSaveSchema`:

```ts
  /**
   * The preset background, by id. Optional: a custom background carries its
   * traits as character_custom_traits rows instead, and saves built before
   * backgrounds reached the engine have none.
   */
  backgroundId: z.string().min(1).optional(),
```

- [ ] **Step 6: Resolve backgrounds in the engine**

In `ruleLookup.ts`, add `BackgroundDefinition` to the type import from `@project/shared`, add a field to `RuleSnapshotLookup` after `subclassesById`:

```ts
  backgroundsById?: Record<string, BackgroundDefinition> | undefined;
```

and add after `resolveRaceDefinition`:

```ts
export const resolveBackgroundDefinition = (
  backgroundId: string,
  snapshot?: RuleSnapshotLookup,
): BackgroundDefinition | undefined => snapshot?.backgroundsById?.[backgroundId];
```

In `characterBootstrapper.ts`, add `resolveBackgroundDefinition` to the existing import that brings in `resolveRaceDefinition`, add this function directly after `raceTraitIds`:

```ts
/**
 * The traits a preset background grants. An id the pack does not define
 * grants nothing, exactly as an unknown race does - a rulebook gap, not a
 * broken save.
 */
const backgroundTraitIds = (
  backgroundId: string | undefined,
  snapshot?: RuleSnapshotLookup,
): string[] =>
  backgroundId === undefined
    ? []
    : (resolveBackgroundDefinition(backgroundId, snapshot)?.backgroundTraitIds ??
      []);
```

and in `resolveGrantedTraitIds`, add the background after the race:

```ts
    const ids = [
      ...raceTraitIds(save.race, snapshot),
      ...backgroundTraitIds(save.backgroundId, snapshot),
      ...save.classes.flatMap((classState, index) =>
        classTraitIds(classState, index === 0, snapshot),
      ),
    ];
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @project/shared exec vitest run src/schemas/__tests__/toRuleSnapshot.test.ts`
Expected: PASS.

Run: `pnpm --filter @project/engine exec vitest run src/pipeline/__tests__/characterBootstraper.test.ts`
Expected: PASS.

- [ ] **Step 8: Run every suite the snapshot shape reaches, and typecheck all five packages**

Run: `pnpm test:all`
Expected: PASS. If a suite that pins the snapshot's exact key set fails, it is asserting the old four-plus-resources shape: add `backgroundsById` to its expectation rather than weakening the assertion.

Run each of:
`pnpm --filter @project/shared exec tsc --noEmit`
`pnpm --filter @project/engine exec tsc --noEmit`
`pnpm --filter @project/database exec tsc --noEmit`
`pnpm --filter @project/server exec tsc --noEmit`
`pnpm --filter @project/web exec tsc -b`
Expected: no errors in any. (`backgroundsById` is required on `CoreRulePackSnapshot`, so any other hand-built literal of that type surfaces here. At plan time the only one is `packRulebook.ts`'s `EMPTY`.)

- [ ] **Step 9: Restore line endings (all CRLF) and commit**

```bash
git add packages/shared/src/schemas/runtime/ruleSnapshot.ts packages/shared/src/schemas/runtime/characterSave.ts packages/shared/src/schemas/__tests__/toRuleSnapshot.test.ts apps/server/src/services/packRulebook.ts packages/engine/src/rules/ruleLookup.ts packages/engine/src/pipeline/characterBootstrapper.ts packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts
git commit -m "feat(engine): a save's background grants its traits (#68)"
```

---

### Task 5: #68, part 2 — the server and the sheet pass the background through

**Files:**
- Modify: `apps/server/src/gateway/socket.ts` (`toCharacterSave` ~line 146; the `characters` select in `getAuthoritativeRuntimeContext` ~line 218)
- Create: `apps/server/src/gateway/__tests__/socket.characterSave.test.ts`
- Modify: `apps/web/src/store/characterSheetStore.ts` (state ~line 689, defaults ~line 835, `toCharacterSave` ~line 168, `getConditionSuppressions` ~line 387)
- Modify: `apps/web/src/pages/characterSheetRouteData.ts` (`CharacterSheetPayload`, `hydrateCharacterSheet`)
- Test: `apps/web/src/store/__tests__/characterSheetStore.test.ts` (`describe("useCharacterSheetStore proficiency grants"`, ~line 1615)

**Interfaces:**
- Consumes: `CharacterSave.backgroundId?: string` (Task 4).
- Produces: `export const toCharacterSave` from `apps/server/src/gateway/socket.ts`, whose `character` parameter gains `backgroundId?: string | null`.
- Produces: `CharacterSheetState.backgroundId: string | null`; `CharacterSheetPayload.backgroundId?: string | null`.

- [ ] **Step 1: Write the failing server test**

Create `apps/server/src/gateway/__tests__/socket.characterSave.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import {
  characterRow,
  setupGateway,
  type GatewayHarness,
} from "./socketHarness.js";

/**
 * The authoritative runtime builds its save from the characters row, so a
 * background the row carries must reach the save or its grants never reach
 * the server's live sheet (#68).
 */
describe("socket gateway - toCharacterSave", () => {
  let harness: GatewayHarness | undefined;

  afterEach(() => {
    harness?.restore();
  });

  it("carries the character's background into the save", async () => {
    harness = await setupGateway();
    const { toCharacterSave } = await import("../socket.js");

    const save = toCharacterSave(
      { ...characterRow(), backgroundId: "background_criminal" },
      [],
    );

    expect(save.backgroundId).toBe("background_criminal");
  });

  it("leaves the background off a character that has none", async () => {
    harness = await setupGateway();
    const { toCharacterSave } = await import("../socket.js");

    const save = toCharacterSave({ ...characterRow(), backgroundId: null }, []);

    expect("backgroundId" in save).toBe(false);
  });
});
```

- [ ] **Step 2: Write the failing web test**

In `characterSheetStore.test.ts`, add inside `describe("useCharacterSheetStore proficiency grants", ...)`:

```ts
  it("includes the fixed grants of the character's background", () => {
    useCharacterSheetStore.setState({ backgroundId: "background_criminal" });

    const skills = useCharacterSheetStore
      .getState()
      .getProficiencyGrants()
      .filter((grant) => grant.category === "skills")
      .map((grant) => grant.proficiencyId);

    expect(skills).toEqual(expect.arrayContaining(["deception", "stealth"]));
  });
```

- [ ] **Step 3: Run both to verify they fail**

Run: `pnpm --filter @project/server exec vitest run src/gateway/__tests__/socket.characterSave.test.ts`
Expected: FAIL — `toCharacterSave` is not exported.

Run: `pnpm --filter @project/web exec vitest run src/store/__tests__/characterSheetStore.test.ts`
Expected: the new test FAILS (no `deception`/`stealth`); all others pass.

- [ ] **Step 4: Thread the background through the server**

In `socket.ts`, export `toCharacterSave` (`export const toCharacterSave = (`), add `backgroundId?: string | null;` to its `character` parameter's type after `subraceId`, and add after the `race` block of the returned object:

```ts
  ...(character.backgroundId ? { backgroundId: character.backgroundId } : {}),
```

In `getAuthoritativeRuntimeContext`'s `characters` select, add after `subraceId: characters.subraceId,`:

```ts
      backgroundId: characters.backgroundId,
```

- [ ] **Step 5: Thread the background through the web store and route**

In `characterSheetStore.ts`:
- add to `CharacterSheetState`, after `subraceId: string | null;`:
  ```ts
  /** The preset background, by id; null for none or a custom background. */
  backgroundId: string | null;
  ```
- add `backgroundId: null,` to the store's initial state, after `subraceId: null,`;
- in `toCharacterSave`, after the `race: { ... },` block:
  ```ts
  ...(state.backgroundId ? { backgroundId: state.backgroundId } : {}),
  ```
- add `"backgroundId"` to the `Pick<CharacterSheetState, ...>` list in `getConditionSuppressions`'s parameter type, beside `"subraceId"`.

In `characterSheetRouteData.ts`:
- add to `CharacterSheetPayload`, after `subraceId: string | null;`:
  ```ts
  // the route spreads the whole characters row, so this already arrives
  backgroundId?: string | null;
  ```
- in `hydrateCharacterSheet`'s `initializeStore({ ... })`, after `subraceId: character.subraceId ?? null,`:
  ```ts
    backgroundId: character.backgroundId ?? null,
  ```

- [ ] **Step 6: Run both tests to verify they pass**

Run: `pnpm --filter @project/server exec vitest run src/gateway/__tests__/socket.characterSave.test.ts`
Expected: PASS.

Run: `pnpm --filter @project/web exec vitest run src/store/__tests__/characterSheetStore.test.ts`
Expected: PASS.

- [ ] **Step 7: Full suite and typecheck**

Run: `pnpm test:all`
Expected: PASS.

Run: `pnpm --filter @project/server exec tsc --noEmit` and `pnpm --filter @project/web exec tsc -b`
Expected: no errors. If `tsc -b` reports a web test building `CharacterSheetState` in full without `backgroundId`, add `backgroundId: null` to that literal.

- [ ] **Step 8: Restore line endings (all CRLF) and commit**

```bash
git add apps/server/src/gateway/socket.ts apps/server/src/gateway/__tests__/socket.characterSave.test.ts apps/web/src/store/characterSheetStore.ts apps/web/src/pages/characterSheetRouteData.ts apps/web/src/store/__tests__/characterSheetStore.test.ts
git commit -m "feat: the server and the sheet carry a character's background (#68)"
```

---

### Task 5b: #63, part 3 — the sheet loads a character's persisted pool counts

Added 2026-09-21 after Task 6's hand check: with Tasks 2 and 3 in, a spend persists (`spell_slots_1 = 3/4` in the database), but the sheet still showed 4 / 4 after a reload. `fetchCharacterPayload` in `apps/server/src/routes/character.ts` never reads `character_resources`, so the web store hydrates `resources: []` and `materialiseMissingPools` rebuilds every pool at its maximum. The web side needs no change: `hydrateCharacterSheet` already passes `character.resources || []` into the store, and `initialize` only materialises pools the payload lacks (pinned by the existing store test "keeps a pool the payload already carried, without duplicating it").

**Files:**
- Modify: `apps/server/src/routes/character.ts` (import list ~line 3; `fetchCharacterPayload` ~line 73)
- Create: `apps/server/src/routes/__tests__/character.get.test.ts`

**Interfaces:**
- Consumes: `FakeDb` and `renderSql` from `apps/server/src/gateway/__tests__/fakeDb.ts` (seed rows per table; `opsFor(table, kind)` lists recorded statements; an awaited chain resolves to the seeded rows).
- Produces: `GET /api/character/:characterId` responds `{ character: { ..., resources: Array<{ id: string; name: string; current: number }> } }`.

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/routes/__tests__/character.get.test.ts` (CRLF):

```ts
import express, { type Request } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  characterResources,
  characters,
} from "@project/database/src/schema/operational.js";
import { FakeDb, renderSql } from "../../gateway/__tests__/fakeDb.js";
import { globalErrorHandler } from "../../middleware/errorHandler.js";

/**
 * The sheet hydrates its resource pools from this payload. Without the
 * persisted rows it rebuilt every pool at full, so a spent slot came back on
 * reload even though character_resources held the spend (#63).
 */
describe("GET /api/character/:characterId", () => {
  const setupApp = async (db: FakeDb) => {
    vi.resetModules();
    vi.doMock("@project/database", () => ({ db }));
    vi.doMock("../../services/campaignAccess.js", () => ({
      isUserCampaignMember: vi.fn().mockResolvedValue(true),
    }));

    const { default: characterRoutes } = await import("../character.js");

    const app = express();
    app.use((req, _res, next) => {
      (req as Request & { user?: { id: string } }).user = { id: "user-1" };
      next();
    });
    app.use("/api/character", characterRoutes);
    app.use(globalErrorHandler);
    return app;
  };

  const seededDb = () =>
    new FakeDb()
      .seed(characters, [{ id: "char-1", campaignId: "camp-1" }])
      .seed(characterResources, [
        { id: "spell_slots_1", name: "1st-Level Spell Slots", current: 3 },
      ]);

  it("returns the character's persisted resource counts", async () => {
    const app = await setupApp(seededDb());

    const response = await request(app).get("/api/character/char-1");

    expect(response.status).toBe(200);
    expect(response.body.character.resources).toEqual([
      { id: "spell_slots_1", name: "1st-Level Spell Slots", current: 3 },
    ]);
  });

  it("reads resources for the requested character only", async () => {
    const db = seededDb();
    const app = await setupApp(db);

    await request(app).get("/api/character/char-1");

    const [read] = db.opsFor(characterResources, "select");
    expect(renderSql(read?.where).sql).toContain(
      '"character_resources"."character_id"',
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @project/server exec vitest run src/routes/__tests__/character.get.test.ts`
Expected: both tests FAIL — `resources` is undefined, and no `character_resources` select is recorded.

- [ ] **Step 3: Read the pools in the payload**

In `apps/server/src/routes/character.ts`, add `characterResources` to the import from `@project/database/src/schema/operational.js` (alphabetically, after `characterInventory`). In `fetchCharacterPayload`, after the `inventory` query and before the `return`, add:

```ts
  // The sheet hydrates its pools from these. Without them it rebuilt every
  // pool at full, so a spend RESOURCE_CONSUMED had persisted still came back
  // on reload (#63).
  const resources = await db
    .select({
      id: characterResources.id,
      name: characterResources.name,
      current: characterResources.current,
    })
    .from(characterResources)
    .where(eq(characterResources.characterId, characterId));
```

and add `resources,` to the returned object after `inventory,`.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @project/server exec vitest run src/routes/__tests__/character.get.test.ts`
Expected: PASS, both tests.

- [ ] **Step 5: Full suite, typecheck, line endings, commit**

Run: `pnpm test:all` — expected PASS. Run: `pnpm --filter @project/server exec tsc --noEmit` — expected no errors. Restore CRLF on both files and confirm with `file`.

```bash
git add apps/server/src/routes/character.ts apps/server/src/routes/__tests__/character.get.test.ts
git commit -m "fix(server): the character payload carries persisted pool counts (#63)"
```

---

### Task 6: Hand checks in the running app, then the backlog

**Files:**
- Modify: `docs/TODO_BACKLOG.md` (CRLF)

Prerequisites: Postgres running; dev servers from `.claude/launch.json` (`server` on 3000, `web` on 5173). The scratch script `zzq.mjs` in this session's scratchpad reads Thistle's `character_resources`. Copy it into `packages/database/` to run it (`DOTENV_CONFIG_PATH=../../.env node zzq.mjs`), and delete the copy afterwards.

- [ ] **Step 1: Hand check #63**

1. Delete Thistle's slot rows: `delete from character_resources where character_id = '00000000-0000-0000-0000-000000000117' and id like 'spell_slots_%'`.
2. Restart the `server` preview so the new code and an empty runtime cache are live.
3. Open `http://localhost:5173/character/00000000-0000-0000-0000-000000000117`. Confirm the Features widget shows 1st-level slots at 4 / 4, and that the database now holds `spell_slots_1..9`, **before** anything else is clicked.
4. Click "Use" on the 1st-level slots and reload. Expected: the sheet shows 3 / 4 and the database `spell_slots_1 = 3/4`.

- [ ] **Step 2: Hand check #68**

Open Pip Underbough (`00000000-0000-0000-0000-000000000110`, criminal). Expected: Deception and Stealth are marked proficient in the skills widget, and the thieves' tools grant is present.

- [ ] **Step 3: Hand check #64**

With `CLIENT_URL` temporarily removed from `.env`, restart the `server` preview and load any sheet. Expected: "LIVE SESSION ACTIVE" appears (the socket connects). Restore `.env` afterwards.

- [ ] **Step 4: Update the backlog**

In `docs/TODO_BACKLOG.md`:
- Tier 1 rows 1–3: mark ✅ with the date and branch.
- 9a (#63): add a "Re-diagnosed and closed 2026-09-21" paragraph with the reproduction table from the spec, stating that the display symptom did not reproduce and the real defect was lost spends plus a false broadcast.
- 9b (#64): closed, with the helper's name.
- 10d (#68): the fixed half closed; the choice half stays open as Tier 1 item 5.
- P11: record the two findings from the spec's "Recorded, not fixed" section — the seeder's inert `character_traits` background rows, and the four backgrounds (charlatan, folk hero, outlander, sage) the seeder creates but the pack does not author — as a new numbered item, #70.
- Update the header's test count to the new `pnpm test:all` total.

Restore CRLF and confirm `pnpm check:hygiene` passes.

- [ ] **Step 5: Commit**

```bash
git add docs/TODO_BACKLOG.md
git commit -m "docs: close #63, #64 and #68's fixed half"
```
