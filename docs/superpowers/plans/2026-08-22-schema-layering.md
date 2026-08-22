# Schema Layering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 15 hand-written, inert JSON schemas with two generated from Zod, then layer `packages/shared/src/schemas` into primitives / content / runtime / transport so the duplicated definitions can be collapsed and cannot recur.

**Architecture:** Generation comes first and becomes the regression detector for everything after it — every later task regenerates, and a byte-diff proves no file move changed a schema shape. The shared package's external surface never changes: `index.ts` stays a flat star-export, so all 131 consumer files are untouched, and the layering is enforced inside the package by eslint.

**Tech Stack:** TypeScript 6, Zod 4.4.3 (`z.toJSONSchema`), vitest 4, drizzle-orm, ajv 8 (new devDependency), tsx, pnpm workspaces, turbo.

Spec: `docs/superpowers/specs/2026-08-22-schema-layering-design.md`
Audit: `docs/architecture/schema-errata.html`

## Global Constraints

- **Repo files use CRLF line endings.** `sed`, `node -e` string replacement and shell heredocs silently fail to match. Use the Edit tool for every change to an existing file.
- **Zod `.default()` makes a field required on the inferred output type.** Existing hand-written typed literals then fail to compile. Use `.optional()` for any new field authored literals should not have to restate. See the comments on `dieCount` and `sourceName` in `packages/shared/src/schemas/dice.ts`.
- **`CoreRulePackSchema` and `CoreRulePackSchema.shape.pack` are both `.strict()`.** Any new key is either declared on the schema or stripped before parsing.
- **No live-database test infrastructure exists.** `packages/database` tests mock `drizzle`. Anything needing a test must be a pure function; only execution touches `db`.
- **Coverage thresholds are 80%** (lines, functions, branches, statements) in both `packages/shared` and `packages/database`. A new source file with no test drags the whole package below the gate.
- **Generation options are fixed:** `{ io: "input", target: "draft-7" }`. Never the defaults.
- **`index.ts` stays a flat star-export.** No task changes an import path outside `packages/shared/src`.
- **Test commands:** `pnpm --filter @project/{shared,database,engine,server} test --run`
- **Typecheck:** `pnpm --filter <pkg> typecheck`, except `apps/web` which needs `tsc -b`.
- **Branch:** all work lands on `schema-layering`.

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `packages/shared/src/schemas/corePackSegment.ts` | The two generation-source schemas derived from `CoreRulePackSchema` |
| `packages/shared/src/schemas/__tests__/corePackSegment.test.ts` | Proves the derivations accept real segments and reject mistyped keys |
| `packages/database/scripts/generateSchemas.ts` | Emits the two JSON schemas; the only writer of `data/schemas/` |
| `packages/database/src/packSchemas.ts` | Pure helper returning the generated schemas, so tests need no file IO ordering |
| `packages/database/src/__tests__/packSchemas.test.ts` | ajv validation of every segment + the no-diff regeneration gate |
| `packages/database/data/schemas/segment.schema.json` | Generated. Never hand-edited |
| `packages/database/data/schemas/manifest.schema.json` | Generated. Never hand-edited |
| `packages/shared/src/schemas/primitives/*.ts` | Layer 0 vocabulary (Tasks 8–9) |

**Deleted**

- All 15 files currently in `packages/database/data/schemas/` (Task 4)
- `packages/shared/src/schemas/rules.ts` (Task 7 removes its duplicates; Task 12 removes the file)

---

## Task 1: Derive the segment and manifest schemas

**Files:**
- Create: `packages/shared/src/schemas/corePackSegment.ts`
- Test: `packages/shared/src/schemas/__tests__/corePackSegment.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `CoreRulePackSchema` from `./coreRulePack.js`
- Produces: `CorePackSegmentSchema`, `CorePackManifestSchema`, and types `CorePackSegment`, `CorePackManifest`. Task 2 imports both schemas by these exact names.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/schemas/__tests__/corePackSegment.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CorePackManifestSchema,
  CorePackSegmentSchema,
} from "../corePackSegment.js";

describe("CorePackSegmentSchema", () => {
  it("accepts a segment carrying one section", () => {
    expect(CorePackSegmentSchema.parse({ traits: [] })).toEqual({ traits: [] });
  });

  it("accepts an empty segment", () => {
    expect(CorePackSegmentSchema.parse({})).toEqual({});
  });

  it("rejects a mistyped section name", () => {
    // the assembler merges a fixed section list, so a typo currently
    // contributes nothing and reports nothing
    expect(CorePackSegmentSchema.safeParse({ trrraits: [] }).success).toBe(
      false,
    );
  });

  it("accepts a $schema key so pack files can point at the generated schema", () => {
    const parsed = CorePackSegmentSchema.parse({
      $schema: "../../schemas/segment.schema.json",
      traits: [],
    });
    expect(parsed.$schema).toBe("../../schemas/segment.schema.json");
  });

  it("does not carry the pack envelope", () => {
    expect(
      CorePackSegmentSchema.safeParse({ pack: { packId: "core_2014" } }).success,
    ).toBe(false);
  });
});

describe("CorePackManifestSchema", () => {
  const manifest = {
    packId: "core_2014",
    version: 1,
    ruleset: "dnd_5e_2014",
    publishedAt: "2026-08-13T00:00:00.000Z",
    extends: [],
    owns: ["traits"],
    segments: ["traits/ported.json"],
  };

  it("accepts the real manifest shape", () => {
    expect(CorePackManifestSchema.parse(manifest).segments).toEqual([
      "traits/ported.json",
    ]);
  });

  it("requires segments", () => {
    const { segments: _omitted, ...withoutSegments } = manifest;
    expect(CorePackManifestSchema.safeParse(withoutSegments).success).toBe(
      false,
    );
  });

  it("accepts a $schema key", () => {
    expect(
      CorePackManifestSchema.parse({
        ...manifest,
        $schema: "../schemas/manifest.schema.json",
      }).$schema,
    ).toBe("../schemas/manifest.schema.json");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @project/shared test --run src/schemas/__tests__/corePackSegment.test.ts`
Expected: FAIL — `Cannot find module '../corePackSegment.js'`

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/schemas/corePackSegment.ts`:

```ts
import { z } from "zod";
import { CoreRulePackSchema } from "./coreRulePack.js";

/**
 * A `$schema` pointer, so a pack file can name the schema that describes it.
 *
 * Declared rather than stripped because both schemas below inherit `.strict()`
 * from CoreRulePackSchema, which would otherwise reject the very key that gives
 * pack authors editor completion.
 */
const SchemaPointerSchema = z.string().optional();

/**
 * One segment file: a subset of a pack's content sections, and no envelope.
 *
 * Derived rather than restated so it cannot drift from the pack schema. The
 * inherited `.strict()` is the point: the assembler merges a fixed section list,
 * so today a segment with a mistyped section name contributes nothing and says
 * nothing about it.
 */
export const CorePackSegmentSchema = CoreRulePackSchema.omit({ pack: true })
  .partial()
  .extend({ $schema: SchemaPointerSchema });

/**
 * The pack's identity block plus the assembly metadata that never reaches the
 * pack itself.
 *
 * `segments` lives here and nowhere else: it tells the assembler what to read,
 * and CoreRulePackSchema.pack is strict, so it must be stripped before parsing.
 */
export const CorePackManifestSchema = CoreRulePackSchema.shape.pack.extend({
  segments: z.array(z.string()),
  $schema: SchemaPointerSchema,
});

export type CorePackSegment = z.infer<typeof CorePackSegmentSchema>;
export type CorePackManifest = z.infer<typeof CorePackManifestSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @project/shared test --run src/schemas/__tests__/corePackSegment.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Export from the barrel**

In `packages/shared/src/index.ts`, add after the `coreRulePack.js` line:

```ts
export * from "./schemas/corePackSegment.js";
```

- [ ] **Step 6: Verify the whole package still passes**

Run: `pnpm --filter @project/shared test --run && pnpm --filter @project/shared typecheck`
Expected: PASS, no new type errors

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/schemas/corePackSegment.ts packages/shared/src/schemas/__tests__/corePackSegment.test.ts packages/shared/src/index.ts
git commit -m "feat: derive segment and manifest schemas from the pack schema"
```

---

## Task 2: Generate the two JSON schemas

**Files:**
- Create: `packages/database/scripts/generateSchemas.ts`
- Create: `packages/database/src/packSchemas.ts`
- Test: `packages/database/src/__tests__/packSchemas.test.ts`
- Modify: `packages/database/package.json`

**Interfaces:**
- Consumes: `CorePackSegmentSchema`, `CorePackManifestSchema` from `@project/shared`
- Produces: `buildPackSchemas(): { segment: object; manifest: object }` from `packages/database/src/packSchemas.ts`, plus `SCHEMA_DIR` and `SCHEMA_FILES`. Tasks 3 and 4 import all three.

The generation logic lives in `src/packSchemas.ts` rather than in the script so the no-diff test can call it without shelling out. The script is a thin writer.

- [ ] **Step 1: Write the failing test**

Create `packages/database/src/__tests__/packSchemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPackSchemas } from "../packSchemas.js";

describe("buildPackSchemas", () => {
  const { segment, manifest } = buildPackSchemas();

  it("emits draft-07, which is what editors support fully", () => {
    expect((segment as { $schema: string }).$schema).toBe(
      "http://json-schema.org/draft-07/schema#",
    );
  });

  it("makes every content section optional on a segment", () => {
    expect((segment as { required?: string[] }).required ?? []).toEqual([]);
  });

  it("covers every content section", () => {
    expect(
      Object.keys((segment as { properties: object }).properties).sort(),
    ).toEqual(
      [
        "$schema",
        "backgrounds",
        "classes",
        "equipment",
        "feats",
        "proficiencies",
        "races",
        "resources",
        "spells",
        "subclasses",
        "traits",
      ].sort(),
    );
  });

  it("requires the manifest to name its segments", () => {
    expect((manifest as { required: string[] }).required).toContain("segments");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @project/database test --run src/__tests__/packSchemas.test.ts`
Expected: FAIL — `Cannot find module '../packSchemas.js'`

- [ ] **Step 3: Write the schema builder**

Create `packages/database/src/packSchemas.ts`:

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  CorePackManifestSchema,
  CorePackSegmentSchema,
} from "@project/shared";

/**
 * Where the generated schemas live, resolved from this file rather than from
 * process.cwd() so the script and the test agree wherever they are run from.
 */
export const SCHEMA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../data/schemas",
);

export const SCHEMA_FILES = {
  segment: "segment.schema.json",
  manifest: "manifest.schema.json",
} as const;

/**
 * `io: "input"` because pack files are authored before defaults are applied,
 * so the input type is what an author actually writes. `target: "draft-7"`
 * because that is the dialect vscode-json-languageservice supports fully, and
 * editor completion for pack authors is a main reason these files exist.
 */
const OPTIONS = { io: "input", target: "draft-7" } as const;

export const buildPackSchemas = (): {
  segment: object;
  manifest: object;
} => ({
  segment: z.toJSONSchema(CorePackSegmentSchema, OPTIONS),
  manifest: z.toJSONSchema(CorePackManifestSchema, OPTIONS),
});

/** Exactly the bytes the generator writes, so the no-diff test can compare. */
export const serialiseSchema = (schema: object): string =>
  `${JSON.stringify(schema, null, 2)}\n`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @project/database test --run src/__tests__/packSchemas.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the generation script**

Create `packages/database/scripts/generateSchemas.ts`:

```ts
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildPackSchemas,
  serialiseSchema,
  SCHEMA_DIR,
  SCHEMA_FILES,
} from "../src/packSchemas.js";

/**
 * Writes the JSON schemas the pack files point at.
 *
 * These files are build outputs. Editing one by hand is what produced the six
 * drift classes this replaces - run this script instead.
 */
const main = async (): Promise<void> => {
  const schemas = buildPackSchemas();

  for (const [key, filename] of Object.entries(SCHEMA_FILES)) {
    const target = path.join(SCHEMA_DIR, filename);
    await writeFile(
      target,
      serialiseSchema(schemas[key as keyof typeof schemas]),
      "utf8",
    );
    console.log(`wrote ${filename}`);
  }
};

await main();
```

- [ ] **Step 6: Add the script entry**

In `packages/database/package.json`, add to `scripts` after `db:import-pack`:

```json
"schemas:generate": "tsx scripts/generateSchemas.ts",
```

- [ ] **Step 7: Generate and inspect**

```bash
pnpm --filter @project/database schemas:generate
```

Expected: `wrote segment.schema.json`, `wrote manifest.schema.json`. Confirm both files exist in `packages/database/data/schemas/` alongside the 15 old ones.

- [ ] **Step 8: Commit**

```bash
git add packages/database/src/packSchemas.ts packages/database/scripts/generateSchemas.ts packages/database/src/__tests__/packSchemas.test.ts packages/database/package.json packages/database/data/schemas/segment.schema.json packages/database/data/schemas/manifest.schema.json
git commit -m "feat: generate pack segment and manifest JSON schemas from zod"
```

---

## Task 3: Validate every pack file against the generated schemas

**Files:**
- Modify: `packages/database/src/__tests__/packSchemas.test.ts`
- Modify: `packages/database/package.json` (add ajv)

**Interfaces:**
- Consumes: `buildPackSchemas`, `SCHEMA_DIR`, `SCHEMA_FILES`, `serialiseSchema` from Task 2
- Produces: nothing new. This task adds guards only.

This is the test that has never existed. It is expected to pass immediately — the pack is already valid, and it was the old schemas that were wrong.

- [ ] **Step 1: Add ajv as a devDependency**

```bash
pnpm --filter @project/database add -D ajv@^8
```

- [ ] **Step 2: Write the failing test**

Append to `packages/database/src/__tests__/packSchemas.test.ts`:

```ts
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import { serialiseSchema, SCHEMA_DIR, SCHEMA_FILES } from "../packSchemas.js";

const PACK_DIR = path.resolve(SCHEMA_DIR, "../packs/core_2014_pack");

const readPackJson = (relativePath: string): unknown =>
  JSON.parse(readFileSync(path.join(PACK_DIR, relativePath), "utf8"));

const manifestFile = readPackJson("manifest.json") as { segments: string[] };

describe("the authored pack validates against its own schemas", () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const { segment, manifest } = buildPackSchemas();
  const validateSegment = ajv.compile(segment);
  const validateManifest = ajv.compile(manifest);

  it("validates the manifest", () => {
    expect(validateManifest(manifestFile)).toBe(true);
  });

  it.each(manifestFile.segments)("validates %s", (relativePath) => {
    const valid = validateSegment(readPackJson(relativePath));
    // surface the actual failures rather than a bare false
    expect(validateSegment.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  });
});

describe("the generated schemas are up to date", () => {
  it.each(Object.entries(SCHEMA_FILES))(
    "%s matches what the generator emits",
    (key, filename) => {
      const onDisk = readFileSync(path.join(SCHEMA_DIR, filename), "utf8");
      const regenerated = serialiseSchema(
        buildPackSchemas()[key as "segment" | "manifest"],
      );
      // if this fails, run: pnpm --filter @project/database schemas:generate
      expect(onDisk).toBe(regenerated);
    },
  );
});

describe("data/schemas holds nothing hand-written", () => {
  it("contains only the generated files", () => {
    expect(readdirSync(SCHEMA_DIR).sort()).toEqual(
      Object.values(SCHEMA_FILES).sort(),
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @project/database test --run src/__tests__/packSchemas.test.ts`
Expected: the segment/manifest/no-diff tests PASS; the last test FAILS — `data/schemas` still holds the 15 hand-written files. That failure is what Task 4 clears.

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/__tests__/packSchemas.test.ts packages/database/package.json pnpm-lock.yaml
git commit -m "test: validate the authored pack against its generated schemas"
```

---

## Task 4: Delete the hand-written schemas and point pack files at the generated ones

**Files:**
- Delete: all 15 `.schema.json` files in `packages/database/data/schemas/` except the two generated ones
- Modify: `packages/database/data/packs/core_2014_pack/manifest.json`
- Modify: the 30 segment files listed in that manifest
- Modify: `packages/database/src/corePackAssembler.ts:56`

**Interfaces:**
- Consumes: the generated schemas from Task 2, the guard from Task 3
- Produces: nothing new.

`equipment/armor.json` is deliberately excluded — it holds a single empty object and is an unfinished scaffold, so it gets no `$schema` key and stays out of the manifest.

- [ ] **Step 1: Delete the hand-written schemas**

```bash
git rm packages/database/data/schemas/actions.schema.json packages/database/data/schemas/affinities.schema.json packages/database/data/schemas/common.schema.json packages/database/data/schemas/corePackSegment.schema.json packages/database/data/schemas/creatures.schema.json packages/database/data/schemas/dice.schema.json packages/database/data/schemas/equipment.schema.json packages/database/data/schemas/modifiers.schema.json packages/database/data/schemas/proficiencies.schema.json packages/database/data/schemas/races.schema.json packages/database/data/schemas/resources.schema.json packages/database/data/schemas/spells.schema.json packages/database/data/schemas/traits.schema.json packages/database/data/schemas/triggers.schema.json packages/database/data/schemas/weapons.schema.json
```

- [ ] **Step 2: Run the guard to verify it now passes**

Run: `pnpm --filter @project/database test --run src/__tests__/packSchemas.test.ts`
Expected: PASS, including `contains only the generated files`

- [ ] **Step 3: Strip `$schema` in the assembler**

The manifest's non-`segments` keys are spread into `packMeta` and parsed by the strict pack envelope, so a `$schema` key would fail validation. Segment `$schema` keys need no handling — the merge loop reads only the known section names.

In `packages/database/src/corePackAssembler.ts`, change line 56 from:

```ts
  const { segments, ...packMeta } = manifest;
```

to:

```ts
  // $schema is an editor pointer, not pack identity. CoreRulePackSchema.pack is
  // strict, so it is stripped here alongside the assembly-only segment list.
  const { segments, $schema: _schemaPointer, ...packMeta } = manifest;
```

- [ ] **Step 4: Add `$schema` to the manifest**

In `packages/database/data/packs/core_2014_pack/manifest.json`, add as the first key:

```json
    "$schema": "../../schemas/manifest.schema.json",
```

- [ ] **Step 5: Add `$schema` to all 30 segment files**

Each segment file gains a first key whose relative path depends on its depth. Every listed segment sits one directory below the pack root (`races/`, `classes/`, `traits/`, `equipment/`, `feats/`, `backgrounds/`, `resources/`, `spells/`), so the pointer is the same for all of them:

```json
    "$schema": "../../../schemas/segment.schema.json",
```

Apply to each of: `races/dragonborn.json`, `races/dwarf.json`, `races/elf.json`, `races/gnome.json`, `races/half-elf.json`, `races/half-orc.json`, `races/halfling.json`, `races/human.json`, `races/tiefling.json`, `classes/barbarian.json`, `classes/bard.json`, `classes/cleric.json`, `classes/druid.json`, `classes/fighter.json`, `classes/monk.json`, `classes/paladin.json`, `classes/ranger.json`, `classes/rogue.json`, `classes/sorcerer.json`, `classes/warlock.json`, `classes/wizard.json`, `traits/ported.json`, `traits/unimplemented.json`, `equipment/core.json`, `equipment/legacy.json`, `feats/core.json`, `feats/unimplemented.json`, `backgrounds/core.json`, `resources/core.json`, `spells/unimplemented.json`.

- [ ] **Step 6: Verify the pack still assembles and everything passes**

Run: `pnpm --filter @project/database test --run`
Expected: PASS — all suites including `corePackAssembler.test.ts`, which proves the `$schema` keys did not break assembly.

- [ ] **Step 7: Commit**

```bash
git add -A packages/database
git commit -m "feat: replace hand-written pack schemas with generated ones"
```

---

## Task 5: One threshold shape

**Files:**
- Create: `packages/shared/src/schemas/primitives/scaling.ts`
- Test: `packages/shared/src/schemas/__tests__/primitives.test.ts`
- Modify: `packages/shared/src/schemas/modifiers.ts:48-53`, `packages/shared/src/schemas/rules.ts:28-33`, `packages/shared/src/schemas/resources.ts:11-33`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `thresholdOf(valueSchema)`, `ModifierScalingThresholdSchema`, `ResourceThresholdSchema`, `ModifierScalingSchema`. Tasks 6 and 9 import these.

Three `{minimumLevel, value}` objects exist today and have already drifted on `positive` vs `nonnegative` and `number` vs `int`. The shape unifies; the value constraint legitimately differs, so it stays per-use.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/schemas/__tests__/primitives.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ModifierScalingThresholdSchema,
  ResourceThresholdSchema,
  thresholdOf,
} from "../primitives/scaling.js";
import { z } from "zod";

describe("thresholdOf", () => {
  it("shares one minimumLevel definition", () => {
    const custom = thresholdOf(z.string());
    expect(custom.parse({ minimumLevel: 3, value: "x" })).toEqual({
      minimumLevel: 3,
      value: "x",
    });
  });

  it("rejects level zero, because levels start at one", () => {
    expect(
      ModifierScalingThresholdSchema.safeParse({ minimumLevel: 0, value: 1 })
        .success,
    ).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(
      ModifierScalingThresholdSchema.safeParse({
        minimumLevel: 1,
        value: 1,
        extra: true,
      }).success,
    ).toBe(false);
  });
});

describe("value constraints stay per-use", () => {
  it("lets a modifier threshold carry a fractional value", () => {
    expect(
      ModifierScalingThresholdSchema.parse({ minimumLevel: 5, value: 1.5 })
        .value,
    ).toBe(1.5);
  });

  it("keeps a resource threshold a non-negative integer", () => {
    expect(
      ResourceThresholdSchema.safeParse({ minimumLevel: 5, value: 1.5 })
        .success,
    ).toBe(false);
    expect(
      ResourceThresholdSchema.safeParse({ minimumLevel: 5, value: -1 }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @project/shared test --run src/schemas/__tests__/primitives.test.ts`
Expected: FAIL — `Cannot find module '../primitives/scaling.js'`

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/schemas/primitives/scaling.ts`:

```ts
import { z } from "zod";

/**
 * How a value grows with level.
 *
 * Lived on modifiers.ts, which meant dice.ts and actions.ts imported the
 * modifier module to describe scaling that has nothing to do with modifiers.
 */
export const ModifierScalingSchema = z.enum([
  "total_level",
  "class_level",
  "class_level_thresholds",
  "none",
]);

/**
 * One rung of a level-gated ladder.
 *
 * The shape is shared; the value constraint is not. A modifier threshold may
 * carry any number, a resource threshold must be a non-negative count, and
 * merging those would have to take the looser of the two and stop rejecting a
 * fractional charge count.
 *
 * `minimumLevel` is `.positive()` because levels start at 1. This tightens the
 * old ResourceThreshold, which allowed 0; no pack file authors 0.
 * @param valueSchema What this ladder's rungs carry
 * @returns A strict {minimumLevel, value} schema
 */
export const thresholdOf = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z
    .object({
      minimumLevel: z.number().int().positive(),
      value: valueSchema,
    })
    .strict();

export const ModifierScalingThresholdSchema = thresholdOf(z.number());
export const ResourceThresholdSchema = thresholdOf(
  z.number().int().nonnegative(),
);

export type ModifierScaling = z.infer<typeof ModifierScalingSchema>;
export type ModifierScalingThreshold = z.infer<
  typeof ModifierScalingThresholdSchema
>;
export type ResourceThreshold = z.infer<typeof ResourceThresholdSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @project/shared test --run src/schemas/__tests__/primitives.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Re-point the three old definitions**

In `packages/shared/src/schemas/modifiers.ts`, delete the local `ModifierScalingSchema` and `ModifierScalingThresholdSchema` declarations and re-export from the primitive:

```ts
export {
  ModifierScalingSchema,
  ModifierScalingThresholdSchema,
  type ModifierScaling,
} from "./primitives/scaling.js";
```

In `packages/shared/src/schemas/rules.ts`, delete the local `ResourceThresholdSchema` declaration and import it:

```ts
import { ResourceThresholdSchema } from "./primitives/scaling.js";
```

In `packages/shared/src/schemas/resources.ts`, replace the inline threshold object inside `ResourceMaxRuleSchema` with `ResourceThresholdSchema`.

- [ ] **Step 6: Verify nothing broke**

Run: `pnpm --filter @project/shared test --run && pnpm --filter @project/shared typecheck && pnpm --filter @project/engine test --run`
Expected: PASS. `packages/engine/src/utils/resourceRules.ts` reads `thresholds` structurally, so it should need no change.

- [ ] **Step 7: Confirm the generated schema is unchanged**

Run: `pnpm --filter @project/database test --run src/__tests__/packSchemas.test.ts`
Expected: PASS. `minimumLevel` tightening from `nonnegative` to `positive` **will** change `segment.schema.json`, so if the no-diff test fails here, regenerate and review the diff:

```bash
pnpm --filter @project/database schemas:generate
git diff packages/database/data/schemas/segment.schema.json
```

The only expected change is `minimum: 0` becoming `exclusiveMinimum: 0` on resource thresholds. Anything else means the refactor changed a shape it should not have.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src packages/database/data/schemas
git commit -m "refactor: one threshold shape with per-use value constraints"
```

---

## Task 6: One resource schema

**Files:**
- Modify: `packages/shared/src/schemas/resources.ts`
- Modify: `packages/shared/src/schemas/rules.ts:20-67`
- Modify: `packages/shared/src/schemas/traits.ts:82`
- Modify: `packages/shared/src/schemas/coreRulePack.ts:11,220`
- Test: `packages/shared/src/schemas/__tests__/rules.test.ts`

**Interfaces:**
- Consumes: `ResourceThresholdSchema` from Task 5
- Produces: `ResourceMaxRuleSchema` (three kinds), `ResourceResetSchema` (seven values), `ResourceSchema`, types `ResourceMaxRule`, `ResourceReset`, `Resource`. Tasks 7 and 10 rely on these names.

Today `resources.ts` and `rules.ts` each export a `ResourceMaxRuleSchema`, and `index.ts` explicitly exports the `rules.ts` one — which shadows the other, making it unreachable through `@project/shared`.

- [ ] **Step 1: Write the failing test**

Add to `packages/shared/src/schemas/__tests__/rules.test.ts`:

```ts
import { ResourceResetSchema, ResourceSchema } from "../resources.js";

describe("one resource schema", () => {
  it("accepts the reset conditions from both former enums", () => {
    for (const reset of [
      "short_rest",
      "long_rest",
      "long_rest_half",
      "dawn",
      "never",
      "initiative_roll",
      "start_of_turn",
    ]) {
      expect(ResourceResetSchema.safeParse(reset).success).toBe(true);
    }
  });

  it("uses resetCondition, the name the pack data authors", () => {
    const parsed = ResourceSchema.parse({
      id: "trait_action_surge",
      name: "Action Surge",
      resetCondition: "short_rest",
      maxRule: { kind: "fixed", value: 1 },
    });
    expect(parsed.resetCondition).toBe("short_rest");
  });

  it("accepts a total_level_thresholds max rule", () => {
    expect(
      ResourceSchema.safeParse({
        id: "r",
        name: "R",
        resetCondition: "long_rest",
        maxRule: {
          kind: "total_level_thresholds",
          thresholds: [{ minimumLevel: 1, value: 1 }],
        },
      }).success,
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @project/shared test --run src/schemas/__tests__/rules.test.ts`
Expected: FAIL — `ResourceSchema` is not exported

- [ ] **Step 3: Rewrite `resources.ts`**

Replace the whole of `packages/shared/src/schemas/resources.ts`:

```ts
import { z } from "zod";
import { ResourceThresholdSchema } from "./primitives/scaling.js";

/**
 * When a resource's charges come back.
 *
 * The union of the two enums this replaces. `RestCondition` (pack resources)
 * had long_rest_half and never; `ResourceReset` (trait resources) had
 * initiative_roll and start_of_turn. Neither contained the other, so a union is
 * the only merge that loses nothing.
 */
export const ResourceResetSchema = z.enum([
  "short_rest",
  "long_rest",
  "long_rest_half",
  "dawn",
  "never",
  "initiative_roll",
  "start_of_turn",
]);

export const ResourceMaxRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fixed"), value: z.number().int().nonnegative() }).strict(),
  z
    .object({
      kind: z.literal("total_level_thresholds"),
      thresholds: z.array(ResourceThresholdSchema).min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("class_level_thresholds"),
      classId: z.string(),
      thresholds: z.array(ResourceThresholdSchema).min(1),
    })
    .strict(),
]);

/**
 * One charge pool, wherever it is authored.
 *
 * Replaces ResourceGrant (on traits, `resetOn`) and ResourceRule (on packs,
 * `resetCondition`). `resetCondition` wins because that is the name every pack
 * file already authors.
 */
export const ResourceSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    resetCondition: ResourceResetSchema,
    maxRule: ResourceMaxRuleSchema,
  })
  .strict();

export type ResourceReset = z.infer<typeof ResourceResetSchema>;
export type ResourceMaxRule = z.infer<typeof ResourceMaxRuleSchema>;
export type Resource = z.infer<typeof ResourceSchema>;
```

- [ ] **Step 4: Point the two consumers at it**

In `packages/shared/src/schemas/traits.ts`, change the import and line 82:

```ts
import { ResourceSchema } from "./resources.js";
// ...
  resources: z.array(ResourceSchema).default([]),
```

In `packages/shared/src/schemas/coreRulePack.ts`, change line 11 and line 220:

```ts
import { ResourceSchema } from "./resources.js";
// ...
    resources: z.array(ResourceSchema).default([]),
```

In `packages/shared/src/schemas/rules.ts`, delete `RestConditionSchema`, `ResourceMaxRuleSchema`, `ResourceRuleSchema` and their type exports, and re-point `RuleSnapshotSchema.resourcesById` at `ResourceSchema`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @project/shared test --run`
Expected: PASS. Any test still referencing `resetOn` or `ResourceGrant` must be updated to `resetCondition` / `ResourceSchema`.

- [ ] **Step 6: Fix the engine consumers**

`packages/engine/src/calculators/resources.ts` reads `grant.resetOn` and takes `ResourceMaxRule`; `packages/engine/src/utils/resourceRules.ts` takes `ResourceRule`. Update both to `resetCondition` and `Resource`.

Run: `pnpm --filter @project/engine test --run && pnpm --filter @project/engine typecheck`
Expected: PASS. The `total_level_thresholds` branch in `resolveMaxCharges` is now genuinely reachable.

- [ ] **Step 7: Regenerate and review**

```bash
pnpm --filter @project/database schemas:generate
git diff packages/database/data/schemas/segment.schema.json
```

Expected diff: the `resources` section gains four reset values and the `total_level_thresholds` variant. Then run `pnpm --filter @project/database test --run` — the pack must still validate, since it already authors `resetCondition`.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src packages/engine/src packages/database/data/schemas
git commit -m "refactor: collapse ResourceGrant and ResourceRule into one schema"
```

---

## Task 7: Remove the duplicate TraitDefinitionSchema and clean the barrel

**Files:**
- Modify: `packages/shared/src/schemas/rules.ts:69-75`
- Modify: `packages/shared/src/index.ts:19-35`

**Interfaces:**
- Consumes: Task 6's `ResourceSchema`
- Produces: `index.ts` with no exception list. Task 12 deletes `rules.ts` entirely.

`rules.ts` declares a minimal `TraitDefinitionSchema` of `{id, name, modifiers}` that collides with the real one in `traits.ts`. The barrel works around this with a hand-written named-export list and a comment explaining the collision. Removing the duplicate lets the barrel go back to a star export — that is the pass signal for this task.

- [ ] **Step 1: Write the failing test**

Add to `packages/shared/src/schemas/__tests__/rules.test.ts`:

```ts
import { TraitDefinitionSchema } from "@project/shared";

describe("one TraitDefinitionSchema reaches consumers", () => {
  it("is the full trait schema, not the minimal RuleSnapshot one", () => {
    const parsed = TraitDefinitionSchema.parse({
      id: "trait_test",
      name: "Test",
      implementation: { mode: "engine", summary: "Grants a state." },
    });
    // the minimal shape has no implementation field and requires modifiers
    expect(parsed.implementation?.mode).toBe("engine");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @project/shared test --run src/schemas/__tests__/rules.test.ts`
Expected: FAIL — the barrel resolves `TraitDefinitionSchema` to the `traits.ts` one already (it is star-exported and `rules.ts` is not), but `RuleSnapshotSchema.traitsById` still uses the minimal one internally. If this test passes immediately, keep it as a regression guard and continue.

- [ ] **Step 3: Point RuleSnapshot at the real schema**

In `packages/shared/src/schemas/rules.ts`, delete the local `TraitDefinitionSchema` declaration and its type export, then import and use the real one:

```ts
import { TraitDefinitionSchema } from "./traits.js";
```

`RuleSnapshotSchema.traitsById` becomes `z.record(z.string(), TraitDefinitionSchema)`.

- [ ] **Step 4: Simplify the barrel**

In `packages/shared/src/index.ts`, replace the whole commented named-export block (lines 19–35) with:

```ts
export * from "./schemas/rules.js";
```

- [ ] **Step 5: Verify the whole workspace**

Run: `pnpm --filter @project/shared test --run && pnpm --filter @project/shared typecheck && pnpm --filter @project/engine test --run && pnpm --filter @project/database test --run && pnpm --filter @project/server test --run`
Expected: PASS. A duplicate-export error here means a collision remains — find and remove it rather than reinstating the exception list.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src
git commit -m "refactor: remove the duplicate TraitDefinitionSchema and the barrel exception list"
```

---

## Task 8: Extract the ability primitive

**Files:**
- Create: `packages/shared/src/schemas/primitives/ability.ts`
- Test: `packages/shared/src/schemas/__tests__/primitives.test.ts` (append)
- Modify: `packages/shared/src/schemas/modifiers.ts:3`, `effects.ts:44,57`, `prerequisites.ts:5-12`, `character.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `AbilitySchema` (uppercase), `AbilityKeySchema` (lowercase), `abilityScoresOf(min, max)`, `AbilityMinimumsSchema`. Task 10 relies on these names.

An ability score is defined seven times in two casings with two different bounds. The enum is the primitive; the bounds belong to their call sites and legitimately differ (1–30 on a save, 3–18 on character creation), so the primitive exposes a bounded-object factory rather than one fixed object.

- [ ] **Step 1: Write the failing test**

Append to `packages/shared/src/schemas/__tests__/primitives.test.ts`:

```ts
import {
  AbilityKeySchema,
  AbilityMinimumsSchema,
  AbilitySchema,
  abilityScoresOf,
} from "../primitives/ability.js";

describe("ability primitive", () => {
  it("exposes both casings over one list", () => {
    expect(AbilitySchema.options).toEqual(["STR", "DEX", "CON", "INT", "WIS", "CHA"]);
    expect(AbilityKeySchema.options).toEqual(["str", "dex", "con", "int", "wis", "cha"]);
  });

  it("builds a bounded score block", () => {
    const rolled = abilityScoresOf(3, 18);
    expect(rolled.safeParse({ str: 18, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }).success).toBe(true);
    expect(rolled.safeParse({ str: 20, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }).success).toBe(false);
  });

  it("keeps every minimum optional", () => {
    expect(AbilityMinimumsSchema.parse({})).toEqual({});
    expect(AbilityMinimumsSchema.parse({ str: 13 }).str).toBe(13);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @project/shared test --run src/schemas/__tests__/primitives.test.ts`
Expected: FAIL — `Cannot find module '../primitives/ability.js'`

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/schemas/primitives/ability.ts`:

```ts
import { z } from "zod";

const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;
const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;

/** Uppercase, as modifier targets and AC formulas spell it. */
export const AbilitySchema = z.enum(ABILITIES);

/** Lowercase, as saves, prerequisites and payloads spell it. */
export const AbilityKeySchema = z.enum(ABILITY_KEYS);

/**
 * A full set of six scores, bounded per call site.
 *
 * The bounds are not a property of an ability: a stored score runs 1-30, a
 * rolled score at character creation runs 3-18. Both were inlined separately,
 * which is how the six keys came to be written out four times.
 * @param min Lowest legal score
 * @param max Highest legal score
 * @returns A strict object of all six abilities
 */
export const abilityScoresOf = (min: number, max: number) =>
  z
    .object(
      Object.fromEntries(
        ABILITY_KEYS.map((key) => [key, z.number().int().min(min).max(max)]),
      ) as Record<(typeof ABILITY_KEYS)[number], z.ZodNumber>,
    )
    .strict();

/** Every ability optional, for prerequisites that gate on a subset. */
export const AbilityMinimumsSchema = z.object(
  Object.fromEntries(
    ABILITY_KEYS.map((key) => [
      key,
      z.number().int().min(1).max(30).optional(),
    ]),
  ) as Record<(typeof ABILITY_KEYS)[number], z.ZodOptional<z.ZodNumber>>,
);

export type Ability = z.infer<typeof AbilitySchema>;
export type AbilityKey = z.infer<typeof AbilityKeySchema>;
export type AbilityMinimums = z.infer<typeof AbilityMinimumsSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @project/shared test --run src/schemas/__tests__/primitives.test.ts`
Expected: PASS

- [ ] **Step 5: Re-point the seven sites**

- `modifiers.ts:3` — delete the private `AbilitySchema`, import from the primitive.
- `effects.ts:44` (`StatModifierEffectSchema.target`) and `:57` (`SpellGrantEffectSchema.spellcastingAbility`) — use `AbilityKeySchema`.
- `prerequisites.ts:5-12` — delete the local `AbilityMinimumsSchema`, re-export from the primitive.
- `character.ts` `CharacterSaveSchema.attributes` — `abilityScoresOf(1, 30)`.
- `character.ts` `CreateCharacterPayloadSchema.baseAbilityScores` — `abilityScoresOf(3, 18)`.

- [ ] **Step 6: Verify**

Run: `pnpm --filter @project/shared test --run && pnpm --filter @project/shared typecheck && pnpm --filter @project/engine test --run && pnpm --filter @project/server test --run`
Expected: PASS

- [ ] **Step 7: Confirm no schema drift**

Run: `pnpm --filter @project/database test --run src/__tests__/packSchemas.test.ts`
Expected: PASS with **no** regeneration needed. This task should change no authored shape; if the no-diff test fails, a bound or casing was changed by accident.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src
git commit -m "refactor: extract the ability primitive"
```

---

## Task 9: Extract the remaining primitives

**Files:**
- Create: `packages/shared/src/schemas/primitives/{ids,statePredicate,damageType,choice}.ts`
- Move: `packages/shared/src/schemas/lore.ts` → `primitives/lore.ts`
- Test: `packages/shared/src/schemas/__tests__/primitives.test.ts` (append)
- Modify: every file that declared one of these inline

**Interfaces:**
- Consumes: nothing
- Produces: `CoreRuleIdSchema`, `StatePredicateSchema`, `DamageTypeSchema`, `choiceOf(optionSchema)`, `LoreSchema`. Task 10 relies on these names.

Four concepts to lift: the `^[a-z0-9_]+$` id regex (copied in `coreRulePack.ts`, `importPack.ts`, `homebrew.ts`), the `requiredStates`/`forbiddenStates` pair (~10 sites), `DamageTypeSchema` (currently inside `affinities.ts`, imported by weapons, actions and dice), and the choice block (six sites, three different count field names).

- [ ] **Step 1: Write the failing test**

Append to `packages/shared/src/schemas/__tests__/primitives.test.ts`:

```ts
import { CoreRuleIdSchema } from "../primitives/ids.js";
import { StatePredicateSchema } from "../primitives/statePredicate.js";
import { DamageTypeSchema } from "../primitives/damageType.js";

describe("id primitive", () => {
  it("accepts snake_case ids and rejects other casings", () => {
    expect(CoreRuleIdSchema.safeParse("trait_action_surge").success).toBe(true);
    expect(CoreRuleIdSchema.safeParse("Trait-Action").success).toBe(false);
    expect(CoreRuleIdSchema.safeParse("ab").success).toBe(false);
  });
});

describe("state predicate primitive", () => {
  it("defaults both lists to empty", () => {
    expect(StatePredicateSchema.parse({})).toEqual({
      requiredStates: [],
      forbiddenStates: [],
    });
  });
});

describe("damage type primitive", () => {
  it("still carries same_as_weapon", () => {
    expect(DamageTypeSchema.safeParse("same_as_weapon").success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @project/shared test --run src/schemas/__tests__/primitives.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Write the primitives**

`packages/shared/src/schemas/primitives/ids.ts`:

```ts
import { z } from "zod";

/**
 * The id format every authored entity uses.
 *
 * Copied verbatim in coreRulePack.ts, importPack.ts and homebrew.ts before this
 * existed, which is three places for one rule to drift.
 */
export const CoreRuleIdSchema = z
  .string()
  .min(3)
  .max(100)
  .regex(/^[a-z0-9_]+$/, "Use lowercase snake_case ids.");

export type CoreRuleId = z.infer<typeof CoreRuleIdSchema>;
```

`packages/shared/src/schemas/primitives/statePredicate.ts`:

```ts
import { z } from "zod";

/**
 * The gate almost every rule carries: states that must hold, states that must
 * not.
 *
 * Declared inline at roughly ten sites before this existed. Both default to
 * empty, so an ungated rule authors nothing.
 */
export const StatePredicateSchema = z.object({
  requiredStates: z.array(z.string()).default([]),
  forbiddenStates: z.array(z.string()).default([]),
});

export type StatePredicate = z.infer<typeof StatePredicateSchema>;
```

`packages/shared/src/schemas/primitives/damageType.ts` holds `DamageTypeSchema` moved verbatim out of `affinities.ts`, with its `same_as_weapon` member intact.

`packages/shared/src/schemas/primitives/choice.ts`:

```ts
import { z } from "zod";
import { CoreRuleIdSchema } from "./ids.js";

/**
 * "Choose N of these."
 *
 * Six variants existed with three names for the count (chooseAmount, pickCount,
 * choose) and two for identity (id, nodeId). This settles on `id` and
 * `pickCount`; the existing field names stay on their own schemas until a
 * consumer migration, so this is the shape new blocks are built from.
 * @param optionSchema What one option looks like
 * @returns A choice block over that option type
 */
export const choiceOf = <T extends z.ZodTypeAny>(optionSchema: T) =>
  z.object({
    id: CoreRuleIdSchema,
    pickCount: z.number().int().min(1).default(1),
    options: z.array(optionSchema),
  });
```

Move `lore.ts` into `primitives/` unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @project/shared test --run src/schemas/__tests__/primitives.test.ts`
Expected: PASS

- [ ] **Step 5: Re-point consumers**

Replace the three id regex copies with `CoreRuleIdSchema`. Re-export `DamageTypeSchema` from `affinities.ts` so its importers keep working. Leave the ~10 state-predicate sites alone for now — folding them in changes authored shapes and belongs with the content split in Task 10, where the regenerated diff can be reviewed section by section.

- [ ] **Step 6: Verify**

Run: `pnpm --filter @project/shared test --run && pnpm --filter @project/shared typecheck && pnpm --filter @project/database test --run`
Expected: PASS, no schema regeneration needed

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src
git commit -m "refactor: extract id, state predicate, damage type and choice primitives"
```

---

## Task 10: Move the content layer

**Files:**
- Move into `packages/shared/src/schemas/content/`: `traits.ts`, `spells.ts`, `equipment.ts`, `items.ts`, `weapons.ts`, `actions.ts`, `modifiers.ts`, `affinities.ts`, `dice.ts`, `triggers.ts`, `resources.ts`, `proficiencies.ts`, `prerequisites.ts`, `creatures.ts`, `character.ts`, `coreRulePack.ts`, `corePackSegment.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: every primitive from Tasks 5, 8, 9
- Produces: the same exports at new paths. `index.ts` absorbs the path change so nothing outside `packages/shared/src` moves.

This is a pure move. The guard is that the regenerated schema is byte-identical.

- [ ] **Step 1: Record the current schema bytes**

```bash
node -e "const fs=require('fs');console.log(fs.statSync('packages/database/data/schemas/segment.schema.json').size)"
```

Note the number. It must be identical after the move.

- [ ] **Step 2: Move the files**

```bash
mkdir -p packages/shared/src/schemas/content
git mv packages/shared/src/schemas/traits.ts packages/shared/src/schemas/content/traits.ts
git mv packages/shared/src/schemas/spells.ts packages/shared/src/schemas/content/spells.ts
git mv packages/shared/src/schemas/equipment.ts packages/shared/src/schemas/content/equipment.ts
git mv packages/shared/src/schemas/items.ts packages/shared/src/schemas/content/items.ts
git mv packages/shared/src/schemas/weapons.ts packages/shared/src/schemas/content/weapons.ts
git mv packages/shared/src/schemas/actions.ts packages/shared/src/schemas/content/actions.ts
git mv packages/shared/src/schemas/modifiers.ts packages/shared/src/schemas/content/modifiers.ts
git mv packages/shared/src/schemas/affinities.ts packages/shared/src/schemas/content/affinities.ts
git mv packages/shared/src/schemas/dice.ts packages/shared/src/schemas/content/dice.ts
git mv packages/shared/src/schemas/triggers.ts packages/shared/src/schemas/content/triggers.ts
git mv packages/shared/src/schemas/resources.ts packages/shared/src/schemas/content/resources.ts
git mv packages/shared/src/schemas/proficiencies.ts packages/shared/src/schemas/content/proficiencies.ts
git mv packages/shared/src/schemas/prerequisites.ts packages/shared/src/schemas/content/prerequisites.ts
git mv packages/shared/src/schemas/creatures.ts packages/shared/src/schemas/content/creatures.ts
git mv packages/shared/src/schemas/character.ts packages/shared/src/schemas/content/character.ts
git mv packages/shared/src/schemas/coreRulePack.ts packages/shared/src/schemas/content/coreRulePack.ts
git mv packages/shared/src/schemas/corePackSegment.ts packages/shared/src/schemas/content/corePackSegment.ts
```

- [ ] **Step 3: Fix the relative imports**

Three mechanical rules, applied to every import in the 17 moved files:

| Import target | Before | After |
|---|---|---|
| Another moved file | `./traits.js` | `./traits.js` (unchanged) |
| A primitive | `./lore.js`, `./primitives/scaling.js` | `../primitives/lore.js`, `../primitives/scaling.js` |
| A not-yet-moved file (`rules.ts`, `actors.ts`, `combatContext.ts`) | `./rules.js` | `../rules.js` (temporary; Task 11 resolves) |

Find every one that needs changing:

```bash
grep -rn "from \"\./" packages/shared/src/schemas/content/
```

Typecheck is the completeness check — it fails on any path left wrong:

```bash
pnpm --filter @project/shared typecheck
```

- [ ] **Step 4: Update the barrel**

In `packages/shared/src/index.ts`, prefix the moved modules with `content/`, e.g.:

```ts
export * from "./schemas/content/actions.js";
export * from "./schemas/content/affinities.js";
```

- [ ] **Step 5: Verify nothing changed but paths**

Run: `pnpm --filter @project/shared test --run && pnpm --filter @project/shared typecheck && pnpm --filter @project/database test --run && pnpm --filter @project/engine test --run && pnpm --filter @project/server test --run`
Expected: PASS, including the no-diff schema test. **A no-diff failure here means the move changed a shape — investigate rather than regenerate.**

- [ ] **Step 6: Confirm the byte count**

```bash
node -e "const fs=require('fs');console.log(fs.statSync('packages/database/data/schemas/segment.schema.json').size)"
```

Expected: identical to Step 1.

- [ ] **Step 7: Commit**

```bash
git add -A packages/shared
git commit -m "refactor: move authored schemas into content/"
```

---

## Task 11: Move the runtime and transport layers

**Files:**
- Move into `runtime/`: `combatContext.ts`, `actors.ts`
- Move into `transport/`: `homebrew.ts`, `importPack.ts`
- Move `packages/shared/src/events/*` into `transport/`
- Split: `packages/shared/src/schemas/content/character.ts` three ways
- Create: `packages/shared/src/schemas/runtime/characterSave.ts`, `packages/shared/src/schemas/transport/createCharacter.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: content and primitives
- Produces: same exports at new paths, plus `CharacterSaveSchema` and `CharacterClassStateSchema` from `runtime/characterSave.ts` and `CreateCharacterPayloadSchema` from `transport/createCharacter.ts`. Task 12 relies on nothing new here.

`rules.ts` is not moved here — Task 12 dissolves it.

`character.ts` is the one file that straddles all three layers, which is why Task 10 moved it into `content/` wholesale and this task finishes the job.

- [ ] **Step 1: Move the files**

```bash
mkdir -p packages/shared/src/schemas/runtime packages/shared/src/schemas/transport
git mv packages/shared/src/schemas/combatContext.ts packages/shared/src/schemas/runtime/combatContext.ts
git mv packages/shared/src/schemas/actors.ts packages/shared/src/schemas/runtime/actors.ts
git mv packages/shared/src/schemas/homebrew.ts packages/shared/src/schemas/transport/homebrew.ts
git mv packages/shared/src/schemas/importPack.ts packages/shared/src/schemas/transport/importPack.ts
git mv packages/shared/src/events/socket.ts packages/shared/src/schemas/transport/socket.ts
git mv packages/shared/src/events/levelUp.ts packages/shared/src/schemas/transport/levelUp.ts
```

- [ ] **Step 2: Split character.ts**

`content/character.ts` currently holds all three layers. Cut it into three files by what each piece describes:

| Stays in `content/character.ts` | To `runtime/characterSave.ts` | To `transport/createCharacter.ts` |
|---|---|---|
| `CharacterFlavorSchema`, `TraitGrantSchema`, `TraitChoicePrerequisiteSchema`, `TraitChoiceOptionSchema`, `TraitChoiceNodeSchema`, `traitIdOfOption`, `FeatureGrantUnion`, `RaceConfigurationSchema`, `ClassLevelFeatureSchema`, `ClassDefinitionSchema`, `BackgroundDefinitionSchema` | `CharacterClassStateSchema`, `CharacterSaveSchema` | `CreateCharacterPayloadSchema` |

`RaceConfigurationSchema` stays in content because `CharacterSaveSchema` imports it and runtime may import content, not the reverse.

- [ ] **Step 3: Fix relative imports and the barrel**

Same three rules as Task 10 Step 3, in the other direction: a moved file reaching content becomes `../content/name.js`, reaching a primitive becomes `../primitives/name.js`. Update the matching `index.ts` lines, adding the two new modules:

```ts
export * from "./schemas/runtime/characterSave.js";
export * from "./schemas/transport/createCharacter.js";
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @project/shared test --run && pnpm --filter @project/shared typecheck && pnpm --filter @project/database test --run && pnpm --filter @project/engine test --run && pnpm --filter @project/server test --run && pnpm --filter @project/web test --run`
Expected: PASS. `apps/web` is included because it consumes the socket events and the character payloads.

- [ ] **Step 5: Confirm no schema drift**

Run: `pnpm --filter @project/database test --run src/__tests__/packSchemas.test.ts`
Expected: PASS with no regeneration. `ClassDefinitionSchema` and `BackgroundDefinitionSchema` are pack content, so a diff here means the split moved something it should not have.

- [ ] **Step 6: Commit**

```bash
git add -A packages/shared
git commit -m "refactor: move runtime and transport schemas into their layers"
```

---

## Task 12: Split coreRulePack.ts and dissolve rules.ts

**Files:**
- Create: `packages/shared/src/schemas/content/validatePack.ts`
- Create: `packages/shared/src/schemas/runtime/ruleSnapshot.ts`
- Modify: `packages/shared/src/schemas/content/coreRulePack.ts`
- Delete: `packages/shared/src/schemas/rules.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: everything from Tasks 10 and 11
- Produces: `validateCoreRulePack`, `CoreRulePackValidationResult`, `CoreRulePackIssueCode` from `content/validatePack.ts`; `RuleSnapshotSchema`, `CoreRulePackSnapshot`, `toRuleSnapshot` from `runtime/ruleSnapshot.ts`. `packages/database/src/corePackLoader.ts` imports `validateCoreRulePack` from `@project/shared` and needs no change.

`coreRulePack.ts` is 680 lines doing three jobs. After this it holds only schema definitions.

- [ ] **Step 1: Move the semantic validator**

Cut everything from `export type CoreRulePackIssueCode` through the end of `validateCoreRulePack` into `content/validatePack.ts`, importing `CoreRulePack`, `StartingEquipmentDefinitionSchema` and `traitIdOfOption` from their content modules. Behaviour does not change.

- [ ] **Step 2: Move the snapshot projection**

Cut `CoreRulePackSnapshot`, `byId` and `toRuleSnapshot` into `runtime/ruleSnapshot.ts`, and move `RuleSnapshotSchema` there from `rules.ts`. Re-point `itemsById`, `resourcesById`, `traitsById`, `weaponsById` at the content schemas.

- [ ] **Step 3: Delete rules.ts**

`rules.ts` should now hold only the weapon re-exports. Delete the file and remove its `index.ts` line; consumers already reach the weapon schemas through the `content/weapons.js` star export.

```bash
git rm packages/shared/src/schemas/rules.ts
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @project/shared test --run && pnpm --filter @project/shared typecheck && pnpm --filter @project/database test --run && pnpm --filter @project/engine test --run && pnpm --filter @project/server test --run`
Expected: PASS, including `toRuleSnapshot.test.ts` and `coreRulePack.test.ts`

- [ ] **Step 5: Commit**

```bash
git add -A packages/shared
git commit -m "refactor: split coreRulePack into schema, validator and projection"
```

---

## Task 13: Enforce the layering with eslint

**Files:**
- Modify: `eslint.config.mjs`

**Interfaces:**
- Consumes: the directory layout from Tasks 10–12
- Produces: a lint failure on any upward import.

- [ ] **Step 1: Add the rules**

In `eslint.config.mjs`, append to the `defineConfig` array, after the existing `**/*.ts` block:

```js
  {
    files: ["packages/shared/src/schemas/primitives/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", {
        patterns: ["**/content/**", "**/runtime/**", "**/transport/**"],
      }],
    },
  },
  {
    files: ["packages/shared/src/schemas/content/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", {
        patterns: ["**/runtime/**", "**/transport/**"],
      }],
    },
  },
```

The typescript-eslint variant, not the base rule — the base rule does not catch `import type`, which is how most of these modules reference each other.

- [ ] **Step 2: Verify the rule passes on clean code**

Run: `pnpm --filter @project/shared lint`
Expected: PASS. A failure names a real upward import left over from Tasks 10–12 — fix the import, do not relax the rule.

- [ ] **Step 3: Verify the rule actually bites**

Temporarily add to `packages/shared/src/schemas/content/traits.ts`:

```ts
import type { CombatContext } from "../runtime/combatContext.js";
```

Run: `pnpm --filter @project/shared lint`
Expected: FAIL naming that import. Then delete the line and confirm the lint passes again.

- [ ] **Step 4: Commit**

```bash
git add eslint.config.mjs
git commit -m "chore: enforce schema layer direction with eslint"
```

---

## Task 14: Homebrew and import author TraitDefinition

**Files:**
- Modify: `packages/shared/src/schemas/transport/homebrew.ts`
- Modify: `packages/shared/src/schemas/transport/importPack.ts:116`
- Delete: `packages/shared/src/schemas/effects.ts`
- Modify: `packages/shared/src/schemas/__tests__/homebrew.test.ts`, `effects.test.ts`, `importPack.test.ts`
- Modify: `apps/server/src/routes/homebrew.ts`, `apps/server/src/services/importPipeline.ts`

**Interfaces:**
- Consumes: `TraitDefinitionSchema` from `content/traits.js`
- Produces: `CreateHomebrewTraitSchema` and `TraitImportDataSchema` carrying a full `TraitDefinition` instead of `TraitEffect[]`. Task 15 relies on this shape reaching the database.

`TraitEffect` is a third trait vocabulary that no pack content uses — `corePackProjection.ts:138` writes `effects: []` for every pack trait. Deleting it makes homebrew as capable as core content.

- [ ] **Step 1: Write the failing test**

Replace the effects assertions in `packages/shared/src/schemas/__tests__/homebrew.test.ts`:

```ts
import { CreateHomebrewTraitSchema } from "../transport/homebrew.js";

describe("homebrew traits speak the core trait vocabulary", () => {
  it("accepts a modifier a core trait could carry", () => {
    const parsed = CreateHomebrewTraitSchema.parse({
      campaignId: "00000000-0000-0000-0000-000000000001",
      id: "hb_stone_skin",
      name: "Stone Skin",
      lore: { shortDescription: "Your hide hardens." },
      definition: {
        id: "hb_stone_skin",
        name: "Stone Skin",
        modifiers: {
          fixed: [{ target: "ARMOR_CLASS", type: "add", value: 1 }],
          choices: [],
        },
      },
    });
    expect(parsed.definition.modifiers.fixed[0]?.target).toBe("ARMOR_CLASS");
  });

  it("accepts a resource, which TraitEffect could never express", () => {
    expect(
      CreateHomebrewTraitSchema.safeParse({
        campaignId: "00000000-0000-0000-0000-000000000001",
        id: "hb_second_breath",
        name: "Second Breath",
        lore: { shortDescription: "Catch your breath." },
        definition: {
          id: "hb_second_breath",
          name: "Second Breath",
          resources: [
            {
              id: "hb_second_breath",
              name: "Second Breath",
              resetCondition: "short_rest",
              maxRule: { kind: "fixed", value: 1 },
            },
          ],
        },
      }).success,
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @project/shared test --run src/schemas/__tests__/homebrew.test.ts`
Expected: FAIL — `definition` is not a recognised key

- [ ] **Step 3: Replace effects with definition**

In `transport/homebrew.ts`, drop the `TraitEffectSchema` import and change both trait payloads:

```ts
import { TraitDefinitionSchema } from "../content/traits.js";
// ...
  definition: TraitDefinitionSchema,          // on Create
  definition: TraitDefinitionSchema.optional(), // on Update
```

In `transport/importPack.ts`, change `TraitImportDataSchema.effects` the same way.

- [ ] **Step 4: Delete effects.ts and its test**

```bash
git rm packages/shared/src/schemas/effects.ts packages/shared/src/schemas/__tests__/effects.test.ts
```

Remove the `effects.js` line from `index.ts`.

- [ ] **Step 5: Update the server**

`apps/server/src/routes/homebrew.ts` and `apps/server/src/services/importPipeline.ts` pass the payload through; change the field they read from `effects` to `definition`.

- [ ] **Step 6: Verify**

Run: `pnpm --filter @project/shared test --run && pnpm --filter @project/server test --run && pnpm --filter @project/server typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A packages/shared apps/server
git commit -m "feat: homebrew and imported traits use the core trait schema"
```

---

## Task 15: Migrate the traits table and drop the string-matching

**Files:**
- Modify: `packages/database/src/schema/reference.ts:139`
- Modify: `packages/database/src/corePackProjection.ts:35-41,134-140`
- Modify: `apps/server/src/services/referenceProvider/databaseReferenceProvider.ts:31-75`
- Test: `packages/database/src/__tests__/corePackProjection.test.ts`

**Interfaces:**
- Consumes: Task 14's `definition` field
- Produces: `traits.definition` column holding a full `TraitDefinition`.

- [ ] **Step 1: Write the failing test**

Add to `packages/database/src/__tests__/corePackProjection.test.ts`:

This file already has a `createPack()` helper that builds a pack through
`CoreRulePackSchema.parse`, and imports `projectCoreRulePack`. Follow both.

```ts
it("carries the whole trait into the database row", () => {
  const pack = CoreRulePackSchema.parse({
    pack: {
      packId: "core_test",
      version: 7,
      ruleset: "dnd_5e_2014",
      publishedAt: "2026-08-13T00:00:00.000Z",
    },
    traits: [
      {
        id: "trait_test",
        name: "Test Trait",
        lore: { shortDescription: "Test trait lore." },
        modifiers: {
          fixed: [{ target: "MAX_HP", type: "add", value: 2 }],
          choices: [],
        },
      },
    ],
  });

  const projection = projectCoreRulePack(pack);

  // effects: [] was a placeholder that made every core trait look empty
  expect(projection.traits[0]?.definition.modifiers.fixed[0]?.target).toBe(
    "MAX_HP",
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @project/database test --run src/__tests__/corePackProjection.test.ts`
Expected: FAIL — `definition` does not exist on the projected row

- [ ] **Step 3: Change the column**

In `packages/database/src/schema/reference.ts`, replace the `effects` column:

```ts
    // the whole authored trait, so a homebrew trait can say everything a core
    // trait can. Previously an `effects` column in a vocabulary no pack used.
    definition: jsonb("definition").$type<TraitDefinition>().notNull(),
```

Update the import from `TraitEffect` to `TraitDefinition`.

- [ ] **Step 4: Change the projection**

In `corePackProjection.ts`, replace `effects: never[]` with `definition: TraitDefinition` in the type, and `effects: []` at line 138 with `definition: trait`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @project/database test --run`
Expected: PASS

- [ ] **Step 6: Replace the string-matching**

In `databaseReferenceProvider.ts`, delete `TraitEffectLike` and `hasEffectCategory` — including its dead `"proficiency_choice"` branch, a type `TraitEffectSchema` never defined — and read the real grants:

```ts
const hasProficiencyCategory = (
  definition: TraitDefinition,
  categories: string[],
): boolean =>
  (definition.proficiencies?.fixed ?? []).some((grant) =>
    categories.includes(grant.category),
  ) ||
  (definition.proficiencies?.choices ?? []).some((choice) =>
    categories.includes(choice.category),
  );
```

`matchesTraitCategory` calls this and drops the `id.includes(...)` / `name.includes(...)` fallbacks.

- [ ] **Step 7: Migrate and reimport**

```bash
pnpm --filter @project/database db:generate
pnpm --filter @project/database db:migrate
pnpm --filter @project/database db:import-pack
```

Expected: migration applies, pack reimports, traits carry full definitions.

- [ ] **Step 8: Verify**

Run: `pnpm --filter @project/database test --run && pnpm --filter @project/server test --run && pnpm --filter @project/server typecheck`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add -A packages/database apps/server
git commit -m "feat: store the whole trait definition and drop the name-matching fallback"
```

---

## Task 16: Retire ItemDefinition and WeaponDefinition

**Files:**
- Modify: `packages/shared/src/schemas/content/items.ts`, `content/weapons.ts`, `content/equipment.ts`
- Modify: `packages/engine/src/rules/equipmentProjection.ts`, `ruleLookup.ts`
- Modify: `packages/shared/src/schemas/runtime/ruleSnapshot.ts`

**Interfaces:**
- Consumes: everything above
- Produces: `EquipmentDefinitionSchema` as the single authored item shape.

This task is explicitly droppable. Roughly 100 non-test references, and the rest of the plan holds its value without it.

- [ ] **Step 1: Decide the tool/loot question**

`ItemTypeSchema` carries `tool` and `loot`; `EquipmentTypeSchema` does not, so they are unauthorable today. Check the authored data:

```bash
grep -o '"type": *"[a-z]*"' packages/database/data/packs/core_2014_pack/equipment/*.json | sed 's/.*: *//' | sort | uniq -c
```

If no item authors them, delete both members. If any does, add them to `EquipmentTypeSchema` instead.

- [ ] **Step 2: Write the failing test**

Add to `packages/shared/src/schemas/__tests__/equipment.test.ts`:

```ts
it("is the only authored item shape", async () => {
  const module = await import("../content/items.js");
  expect("ItemDefinitionSchema" in module).toBe(false);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @project/shared test --run src/schemas/__tests__/equipment.test.ts`
Expected: FAIL — `ItemDefinitionSchema` is still exported

- [ ] **Step 4: Move the runtime-only pieces and delete the rest**

`items.ts` keeps `InventoryInstanceSchema`, `CharacterSlotSchema` and the starting-equipment schemas — move `InventoryInstanceSchema` and `CharacterSlotSchema` to `runtime/inventory.ts`. Delete `ItemDefinitionSchema` and `ItemTypeSchema`; delete `WeaponDefinitionSchema` from `weapons.ts`, keeping `WeaponCategorySchema` and `WeaponPropertySchema`.

Update `equipmentProjection.ts` and `ruleLookup.ts` to work from `EquipmentDefinition` directly, and drop `itemsById` and `weaponsById` from `RuleSnapshotSchema`.

- [ ] **Step 5: Verify**

Run: `pnpm --filter @project/shared test --run && pnpm --filter @project/engine test --run && pnpm --filter @project/database test --run && pnpm --filter @project/server test --run && pnpm --filter @project/web test --run`
Expected: PASS

- [ ] **Step 6: Regenerate and review**

```bash
pnpm --filter @project/database schemas:generate
git diff packages/database/data/schemas/segment.schema.json
```

Expected: no change, unless Step 1 altered `EquipmentTypeSchema`.

- [ ] **Step 7: Commit**

```bash
git add -A packages
git commit -m "refactor: retire ItemDefinition and WeaponDefinition"
```

---

## Definition of Done

Applies whether or not Task 16 is taken:

- [ ] No file under `packages/database/data/schemas/` is hand-written
- [ ] Every manifest-listed pack file declares a `$schema` and validates against it (`equipment/armor.json` excluded — unfinished scaffold)
- [ ] `pnpm --filter @project/database schemas:generate` produces no diff
- [ ] `packages/shared/src/index.ts` star-exports every module, with no exception list
- [ ] `pnpm --filter @project/shared lint` passes with the layering rules
- [ ] `pnpm --filter @project/{shared,database,engine,server} test --run` all pass
- [ ] `pnpm --filter @project/web test --run` passes
- [ ] `tsc -b` passes for `apps/web`
