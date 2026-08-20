# The Pack As The Only Source Of Rules — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the core rule pack the single source of rules content and make it reach a running character, retiring the static TypeScript dictionaries and `packages/database/data/*.json` entirely.

**Architecture:** The PHB pack is brought to structural completeness — four dictionaries port mechanically because they already hold the pack's own types, and everything else becomes a stub explicitly marked `unimplemented`. The manifest then declares its segments, its ruleset, what it extends and which sections it owns. An assembler merges the segments; the existing destructive importer is correct once the pack owns everything; and the server serves trait, race and class ASTs from `core_rule_packs.payload`.

**Tech Stack:** pnpm monorepo, TypeScript, Zod, Drizzle ORM (postgres), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-20-core-pack-load-path-design.md`

## Global Constraints

- **Repo files use CRLF line endings.** `sed`, `node -e` string replacement and shell heredocs silently fail to match. Use the Edit tool for every change to an existing file.
- **Zod `.default()` makes a field required on the inferred output type.** Existing hand-written typed literals then fail to compile. Use `.optional()` for any new field authored literals should not have to restate, and resolve the absence at the point of use. Established convention — see the comments on `dieCount` and `sourceName` in `packages/shared/src/schemas/dice.ts`.
- **`CoreRulePackSchema.pack` is `.strict()`.** Any new manifest key is either declared on that schema or stripped before parsing.
- **No live-database test infrastructure exists.** `packages/database` tests mock `drizzle`. Anything needing a test must be a pure function; only execution touches `db`.
- **Generated pack content is committed.** The migration scripts are one-shot tools that read dictionaries deleted in Task 6; they are deleted with them.
- **Test commands:** `pnpm --filter @project/{database,shared,engine,server} test`.
- **Typecheck:** `pnpm --filter <pkg> typecheck`, except `apps/web` which needs `tsc -b`.
- **4 tests are known-red before this work starts** (1 server, 3 web). Do not attempt to fix them before Task 5.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `packages/database/scripts/portDictionaries.ts` | One-shot: serialize the four dictionaries into pack segments. Deleted in Task 6. |
| `packages/database/scripts/generateStubs.ts` | One-shot: emit marked stubs for every id with no real definition. Deleted in Task 6. |
| `packages/database/src/corePackAssembler.ts` | Read a manifest, merge the segments it lists, delegate to validation. |
| `packages/database/src/__tests__/corePackAssembler.test.ts` | Assembly against the real pack, plus failure modes. |
| `packages/database/data/packs/core_2014_pack/traits/*.json` | Ported and stubbed trait segments. |
| `packages/database/data/packs/core_2014_pack/classes/*.json` | The 11 ported classes. |
| `packages/database/data/packs/core_2014_pack/equipment/core.json` | 58 ported items plus stubs. |

**Modified**

| File | Change |
|---|---|
| `packages/shared/src/schemas/traits.ts` | `mode` gains `"unimplemented"`. |
| `packages/shared/src/schemas/coreRulePack.ts` | `ruleset` widened; `extends`, `owns`, `PackSectionSchema`. |
| `packages/database/data/packs/core_2014_pack/manifest.json` | `segments`, `extends`, `owns`. |
| `packages/database/data/schemas/corePackSegment.schema.json` | Declares the sections segments carry. |
| `packages/database/src/corePackLoader.ts` | Extract `parseCoreRulePack`, shared with the assembler. |
| `packages/engine/src/pipeline/__tests__/corePackFixture.ts` | Read the manifest's segment list; strip assembly-only keys. |
| `apps/server/src/services/ruleSnapshotCache.ts` | Serve pack content from `core_rule_packs.payload`. |
| `apps/server/src/services/referenceProvider/types.ts` | Widen `RulesSnapshotPayload`. |
| `apps/web/src/store/characterSheetStore.ts` | Widen `SheetRuleSnapshot`. |

**Deleted (Task 6)**

Every static dictionary in `packages/engine/src/rules/` — trait, class, subclass, race, feat, background, item, weapon, equipment and resource — plus the `traits/` and `classes/` directories beneath it; `packages/database/data/*.json`; `apps/server/src/services/referenceProvider/staticReferenceProvider.ts`; the reference half of `seed.ts`; and both migration scripts.

Note `staticReferenceProvider` imports nine of those dictionaries, so it cannot outlive them — and `REFERENCE_SOURCE` defaults to `"static"`, meaning it is what a default dev server is serving from today.

---

### Task 1: A stub can say it is a stub

**Files:**
- Modify: `packages/shared/src/schemas/traits.ts:18-22`
- Test: `packages/shared/src/schemas/__tests__/traits.test.ts`

**Interfaces:**
- Produces: `TraitImplementationMetadataSchema.mode` accepts `"engine" | "manual_sheet_helper" | "unimplemented"`.

- [ ] **Step 1: Write the failing test**

```ts
import { TraitDefinitionSchema } from "../traits.js";

describe("unimplemented traits", () => {
  it("accepts a trait that declares itself unauthored", () => {
    const parsed = TraitDefinitionSchema.parse({
      id: "trait_placeholder",
      name: "Placeholder",
      implementation: {
        mode: "unimplemented",
        summary: "Not yet authored.",
      },
    });

    expect(parsed.implementation?.mode).toBe("unimplemented");
  });

  it("still distinguishes an unauthored trait from an authored one with no modifiers", () => {
    const authored = TraitDefinitionSchema.parse({
      id: "trait_real",
      name: "Real",
      implementation: { mode: "engine", summary: "Grants a state only." },
    });

    expect(authored.implementation?.mode).not.toBe("unimplemented");
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm --filter @project/shared test traits`

Expected: FAIL — `"unimplemented"` is not a valid enum value.

- [ ] **Step 3: Add the value**

In `packages/shared/src/schemas/traits.ts`, replace the `mode` line:

```ts
export const TraitImplementationMetadataSchema = z.object({
  /**
   * How this rule reaches the player.
   *
   * "unimplemented" is not a delivery mode but the absence of one: the trait
   * exists so progressions can reference it and so the pack is structurally
   * complete, and it carries no rules yet. It exists because a trait with no
   * modifiers is otherwise indistinguishable from one that deliberately grants
   * nothing - the silence that left five barbarian features looking
   * implemented while they were dormant.
   */
  mode: z.enum(["engine", "manual_sheet_helper", "unimplemented"]),
  summary: z.string(),
  blockedBy: z.array(z.string()).default([]),
});
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `pnpm --filter @project/shared test traits`

Expected: PASS.

- [ ] **Step 5: Run the full shared and engine suites**

Run: `pnpm --filter @project/shared test && pnpm --filter @project/engine test`

Expected: PASS at existing counts (shared 187, engine 711). Widening an enum breaks nothing.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas/traits.ts packages/shared/src/schemas/__tests__/traits.test.ts
git commit -m "feat: let a trait declare itself unimplemented"
```

---

### Task 2: A pack declares its ruleset, base and owned sections

**Files:**
- Modify: `packages/shared/src/schemas/coreRulePack.ts:118-140`
- Test: `packages/shared/src/schemas/__tests__/coreRulePack.test.ts`

**Interfaces:**
- Produces:
  - `PackSectionSchema` — Zod enum; `type PackSection`.
  - `pack.ruleset: string` (was `z.literal("dnd_5e_2014")`).
  - `pack.extends?: string[]`, `pack.owns?: PackSection[]`.

- [ ] **Step 1: Write the failing test**

```ts
describe("pack composition", () => {
  const meta = {
    packId: "core_2014",
    version: 1,
    ruleset: "dnd_5e_2014",
    publishedAt: "2026-08-13T00:00:00.000Z",
  };

  it("accepts a supplement that names its base and owns nothing", () => {
    const parsed = CoreRulePackSchema.parse({
      pack: { ...meta, packId: "xanathars_2017", extends: ["core_2014"] },
    });

    expect(parsed.pack.extends).toEqual(["core_2014"]);
    expect(parsed.pack.owns).toBeUndefined();
  });

  it("accepts a homebrew system declaring its own ruleset and no base", () => {
    const parsed = CoreRulePackSchema.parse({
      pack: { ...meta, packId: "grimdark_v1", ruleset: "grimdark", extends: [] },
    });

    expect(parsed.pack.ruleset).toBe("grimdark");
    expect(parsed.pack.extends).toEqual([]);
  });

  it("accepts a base pack owning every section", () => {
    const parsed = CoreRulePackSchema.parse({
      pack: { ...meta, owns: ["traits", "classes", "races"] },
    });

    expect(parsed.pack.owns).toContain("classes");
  });

  it("rejects a section name that is not a pack section", () => {
    expect(() =>
      CoreRulePackSchema.parse({ pack: { ...meta, owns: ["monsters"] } }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm --filter @project/shared test coreRulePack`

Expected: FAIL — the meta block is `.strict()`, so `extends` is an unrecognised key; and `ruleset: "grimdark"` fails the literal.

- [ ] **Step 3: Declare the sections**

In `packages/shared/src/schemas/coreRulePack.ts`, add above `CoreRulePackSchema`:

```ts
/**
 * The content sections a pack can claim to be complete for.
 *
 * Wider than CoreRulePackSchema's array fields because ownership is about
 * what a consumer may merge beneath this pack, not about pack arrays:
 * subraces are authored inside their race but are owned on their own terms.
 */
export const PackSectionSchema = z.enum([
  "traits",
  "resources",
  "races",
  "subraces",
  "classes",
  "subclasses",
  "feats",
  "backgrounds",
  "equipment",
  "spells",
  "proficiencies",
]);
```

- [ ] **Step 4: Widen the meta block**

Replace the `pack` object inside `CoreRulePackSchema`:

```ts
    pack: z
      .object({
        packId: CoreRuleIdSchema,
        version: z.number().int().positive(),
        /**
         * The rules system this pack belongs to.
         *
         * No longer a literal: a pack may define an entirely different system,
         * and the database column has always been varchar. Packs whose
         * rulesets differ must never compose - that is what stops a homebrew
         * system silently falling back on the standard rules.
         */
        ruleset: z.string().min(1).max(100),
        publishedAt: z.iso.datetime({ offset: true }),
        contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
        /**
         * Packs this one layers on top of, in precedence order.
         *
         * An empty list means the pack stands alone. Absent means the same,
         * but says nothing deliberate about it.
         */
        extends: z.array(CoreRuleIdSchema).optional(),
        /**
         * Sections this pack is complete for, and therefore authoritative over.
         *
         * Nothing beneath an owned section merges into it. A supplement owns
         * nothing; a standalone system owns everything.
         *
         * Optional rather than defaulted: a `.default()` would make the field
         * required on the inferred output type, forcing every hand-written
         * pack literal in the tests to restate it.
         */
        owns: z.array(PackSectionSchema).optional(),
      })
      .strict(),
```

Add to the type exports at the bottom:

```ts
export type PackSection = z.infer<typeof PackSectionSchema>;
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `pnpm --filter @project/shared test coreRulePack`

Expected: PASS.

- [ ] **Step 6: Confirm nothing depended on the literal**

Run: `pnpm --filter @project/shared typecheck && pnpm --filter @project/database test && pnpm --filter @project/engine test`

Expected: PASS. `ruleset` was stored and never read for gating, so widening it is inert.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/schemas/coreRulePack.ts packages/shared/src/schemas/__tests__/coreRulePack.test.ts
git commit -m "feat: let a pack declare its ruleset, base packs and owned sections"
```

---

### Task 3: Port the four dictionaries into pack segments

The dictionaries already hold the pack's own types, so this is serialization. Segments mirror the dictionary organisation rather than being reorganised by class — reorganising authored content is a separate concern from moving it, and doing both at once makes the diff unreviewable.

**Files:**
- Create: `packages/database/scripts/portDictionaries.ts`
- Create: `packages/database/data/packs/core_2014_pack/traits/*.json` (19 files)
- Create: `packages/database/data/packs/core_2014_pack/classes/*.json` (11 files)
- Create: `packages/database/data/packs/core_2014_pack/equipment/core.json`
- Create: `packages/database/data/packs/core_2014_pack/resources/core.json`

**Interfaces:**
- Consumes: `TRAIT_DICTIONARY`, `CLASS_DICTIONARY`, `EQUIPMENT_DICTIONARY`, `RESOURCE_DICTIONARY` from `@project/engine`; `CoreRulePackSchema` from `@project/shared`.
- Produces: committed segment JSON. No runtime interface.

- [ ] **Step 1: Write the script**

Create `packages/database/scripts/portDictionaries.ts`:

```ts
/**
 * One-shot migration: the static dictionaries, as pack segments.
 *
 * The dictionaries are already typed as the pack's own definitions -
 * TRAIT_DICTIONARY is Record<string, TraitDefinition> and CoreTraitSchema is
 * TraitDefinitionSchema.extend({ id, lore, isStartingProficiency }) - so this
 * serializes rather than converts. Deleted along with the dictionaries.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  TRAIT_DICTIONARY,
  CLASS_DICTIONARY,
  SUBCLASS_DICTIONARY,
  EQUIPMENT_DICTIONARY,
  FEAT_DICTIONARY,
  BACKGROUND_DICTIONARY,
} from "@project/engine";
// RESOURCE_DICTIONARY is not re-exported from the engine index, unlike the
// others. Deep-import it rather than widening the public surface of a package
// whose dictionaries are being deleted anyway.
import { RESOURCE_DICTIONARY } from "@project/engine/src/rules/resourceDictionary.js";

const PACK = path.join(process.cwd(), "data/packs/core_2014_pack");

/** CoreTraitSchema requires lore; dictionary entries may omit it. */
const withLore = <T extends { id: string; name: string; lore?: unknown }>(
  entry: T,
) => ({
  ...entry,
  lore: entry.lore ?? {
    shortDescription: entry.name,
    fullText: entry.name,
  },
});

const write = (relativePath: string, body: unknown): void => {
  const target = path.join(PACK, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(body, null, 4)}\n`, "utf8");
  console.log(`wrote ${relativePath}`);
};

// traits keep their dictionary grouping: moving content and reorganising it
// are separate changes, and doing both at once makes the diff unreviewable
write("traits/ported.json", {
  traits: Object.values(TRAIT_DICTIONARY).map(withLore),
});

// a class segment carries its own subclasses, matching how the authored
// barbarian segment is already organised
for (const definition of Object.values(CLASS_DICTIONARY)) {
  const slug = definition.id.replace(/^class_/, "");
  const subclasses = Object.values(SUBCLASS_DICTIONARY)
    .filter((subclass: any) => subclass.classId === definition.id)
    .map(withLore);

  write(`classes/${slug}.json`, {
    classes: [withLore(definition)],
    ...(subclasses.length > 0 ? { subclasses } : {}),
  });
}

write("equipment/core.json", {
  equipment: Object.values(EQUIPMENT_DICTIONARY).map(withLore),
});

write("feats/core.json", {
  feats: Object.values(FEAT_DICTIONARY).map(withLore),
});

write("backgrounds/core.json", {
  backgrounds: Object.values(BACKGROUND_DICTIONARY).map(withLore),
});

write("resources/core.json", {
  resources: Object.values(RESOURCE_DICTIONARY),
});
```

`SUBCLASS_DICTIONARY` holds **38** subclasses against legacy `subclasses.json`'s 16, so this ports more content than the legacy source ever had. If any subclass has a `classId` matching no ported class — including `class_barbarian`, whose two subclasses are already authored in the pack — it will be dropped by the filter and left dangling. Check the totals in Step 2.

- [ ] **Step 2: Run it**

Run: `pnpm --filter @project/database exec tsx scripts/portDictionaries.ts`

Expected: 16 files written — `traits/ported.json`, 11 class files, `equipment/core.json`, `feats/core.json`, `backgrounds/core.json`, `resources/core.json`.

Two checks before moving on:

1. **`classes/barbarian.json` must be untouched.** `CLASS_DICTIONARY` holds 11 classes with barbarian deliberately absent, so no collision should occur. If that file changes, stop — the dictionary has a barbarian entry it should not have.
2. **Count the subclasses written.** Sum the `subclasses` arrays across the 11 written class files; it should be 38 minus however many belong to `class_barbarian`. Any shortfall beyond that means subclasses were filtered out by a `classId` matching no ported class, and they would be silently lost:

```bash
pnpm --filter @project/database exec tsx -e "import { readFileSync, readdirSync } from 'node:fs'; const d='data/packs/core_2014_pack/classes'; let n=0; for (const f of readdirSync(d)) { if (f==='barbarian.json') continue; n += (JSON.parse(readFileSync(d+'/'+f,'utf8')).subclasses ?? []).length; } console.log('subclasses written:', n);"
```

- [ ] **Step 3: Verify the output parses as pack content**

Run:

```bash
pnpm --filter @project/database exec tsx -e "import { CoreRulePackSchema } from '@project/shared'; import { readFileSync } from 'node:fs'; const t = JSON.parse(readFileSync('data/packs/core_2014_pack/traits/ported.json','utf8')); const r = CoreRulePackSchema.safeParse({ pack: { packId: 'core_2014', version: 1, ruleset: 'dnd_5e_2014', publishedAt: '2026-08-13T00:00:00.000Z' }, ...t }); console.log(r.success ? 'traits OK: ' + r.data.traits.length : JSON.stringify(r.error.issues.slice(0,5), null, 2));"
```

Expected: `traits OK: 139`. Any failure names the exact path — fix the script, not the output.

Repeat for `equipment/core.json` and one class file, substituting the section key.

- [ ] **Step 4: Commit**

```bash
git add packages/database/scripts/portDictionaries.ts packages/database/data/packs/core_2014_pack/
git commit -m "feat: port the static dictionaries into pack segments"
```

---

### Task 4: Stub everything the pack still lacks

After Task 3 the only substantial gap is traits: classes, subclasses, feats, backgrounds and equipment all ported with real definitions.

**Files:**
- Create: `packages/database/scripts/generateStubs.ts`
- Create: `packages/database/data/packs/core_2014_pack/traits/unimplemented.json`
- Create: `packages/database/data/packs/core_2014_pack/feats/unimplemented.json` (only if `feats.json` carries ids the dictionary's 4 do not)

**Interfaces:**
- Consumes: the ported segments from Task 3; `data/*.json` for the id lists.
- Produces: committed stub segments, every entry carrying `implementation.mode: "unimplemented"`.

- [ ] **Step 1: Write the script**

Create `packages/database/scripts/generateStubs.ts`:

```ts
/**
 * One-shot migration: a marked stub for every id with no real definition.
 *
 * Structural completeness is what lets the pack own every section and the
 * legacy sources be deleted. Every entry declares itself unimplemented, so a
 * stub is never mistaken for a rule that deliberately grants nothing.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";

const PACK = path.join(process.cwd(), "data/packs/core_2014_pack");
const DATA = path.join(process.cwd(), "data");

const readJson = (file: string): any =>
  JSON.parse(readFileSync(file, "utf8"));

/** Every id the pack already defines, across every authored segment. */
const authoredIds = (section: string): Set<string> => {
  const ids = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.name === "manifest.json" || !entry.name.endsWith(".json")) {
        continue;
      }
      const segment = readJson(full);
      for (const item of segment[section] ?? []) ids.add(item.id);
      // subclasses and traits also live inside class segments
      for (const cls of segment.classes ?? []) {
        for (const node of cls.progression ?? []) {
          if (section === "traits") {
            for (const granted of node.grants ?? []) ids.add(granted);
          }
        }
      }
    }
  };
  walk(PACK);
  return ids;
};

const titleFrom = (id: string): string =>
  id
    .replace(/^(trait|subclass|feat|background)_/, "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const stubTrait = (id: string) => ({
  id,
  name: titleFrom(id),
  lore: {
    shortDescription: "Not yet authored in the pack.",
    fullText:
      "This trait exists so progressions can reference it. Its rules have not been authored yet.",
  },
  implementation: {
    mode: "unimplemented",
    summary: "Awaiting authoring.",
    blockedBy: [],
  },
});

const write = (relativePath: string, body: unknown): void => {
  const target = path.join(PACK, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(body, null, 4)}\n`, "utf8");
  console.log(`wrote ${relativePath}`);
};

/**
 * Every trait id anything in the pack points at.
 *
 * Derived from references rather than from traits.json, because semantic
 * validation rejects a progression that grants a trait the pack does not
 * define - and the ported class progressions reference ids that legacy
 * traits.json never carried. A stub set built from traits.json alone would
 * leave those dangling.
 */
const referencedTraitIds = (): Set<string> => {
  const ids = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.name === "manifest.json" || !entry.name.endsWith(".json")) {
        continue;
      }
      const segment = readJson(full);

      for (const cls of [
        ...(segment.classes ?? []),
        ...(segment.subclasses ?? []),
      ]) {
        for (const node of cls.progression ?? []) {
          // grants is a union: a plain trait id, a trait_choice node whose
          // options are themselves ids, or a spell_choice node that names no
          // trait at all. traitIdOfOption is the shared helper the engine uses
          for (const grant of node.grants ?? []) {
            if (typeof grant === "string") {
              ids.add(grant);
              continue;
            }
            if (grant.type === "trait_choice") {
              for (const option of grant.options ?? []) {
                ids.add(traitIdOfOption(option));
              }
            }
          }
        }
        for (const granted of cls.multiclassTraitIds ?? []) ids.add(granted);
      }

      for (const race of segment.races ?? []) {
        for (const granted of race.grantedTraitIds ?? []) ids.add(granted);
        for (const subrace of Object.values<any>(race.subraces ?? {})) {
          for (const granted of subrace.grantedTraitIds ?? []) ids.add(granted);
        }
      }

      for (const feat of segment.feats ?? []) {
        for (const granted of feat.grantedTraitIds ?? []) ids.add(granted);
      }
    }
  };
  walk(PACK);
  return ids;
};

const haveTraits = authoredIds("traits");
const legacyIds = readJson(path.join(DATA, "traits.json")).map(
  (t: any) => t.id,
);

// both sources: ids the old data carried, and ids the ported progressions
// point at. the union is what structural completeness actually requires
const needTraits = [
  ...new Set([...legacyIds, ...referencedTraitIds()]),
].filter((id) => !haveTraits.has(id));

write("traits/unimplemented.json", {
  traits: needTraits.map(stubTrait),
});

console.log(`stubbed ${needTraits.length} traits`);
```

Then do the same for feats: compare `feats.json`'s 8 ids against the 4 the dictionary ported, and stub the remainder. Backgrounds need nothing — the dictionary's 4 match `backgrounds.json`'s 4. Subclasses need nothing — the dictionary ported 38 against legacy's 16.

Add `traitIdOfOption` to the imports:

```ts
import { traitIdOfOption } from "@project/shared";
```

Both the pack's own segments and the ported dictionaries use `grants` — `ClassLevelFeatureSchema` defines it and the TS dictionaries are already that type. Only legacy `classes.json` calls the field `features`, and that file is never ported, so no fallback is needed.

- [ ] **Step 2: Run it**

Run: `pnpm --filter @project/database exec tsx scripts/generateStubs.ts`

Expected: roughly 230 traits stubbed — the 87 already-empty plus the 143 legacy-only. A number far above that means `authoredIds` is failing to see the ported segments; a number near zero means it is matching too broadly. Either way, stop and fix the script.

- [ ] **Step 3: Verify every stub declares itself**

Run:

```bash
pnpm --filter @project/database exec tsx -e "import { readFileSync } from 'node:fs'; const s = JSON.parse(readFileSync('data/packs/core_2014_pack/traits/unimplemented.json','utf8')); const bad = s.traits.filter((t) => t.implementation?.mode !== 'unimplemented'); console.log('stubs:', s.traits.length, 'unmarked:', bad.length);"
```

Expected: `unmarked: 0`. Any unmarked stub is the exact bug this task exists to prevent.

- [ ] **Step 4: Commit**

```bash
git add packages/database/scripts/generateStubs.ts packages/database/data/packs/core_2014_pack/
git commit -m "feat: stub every PHB id the pack does not yet define"
```

---

### Task 5: Manifest-driven assembly, and the pack reaching a character

**Files:**
- Modify: `packages/database/data/packs/core_2014_pack/manifest.json`
- Modify: `packages/database/src/corePackLoader.ts`
- Create: `packages/database/src/corePackAssembler.ts`
- Modify: `packages/database/data/schemas/corePackSegment.schema.json`
- Modify: `packages/engine/src/pipeline/__tests__/corePackFixture.ts`
- Modify: `apps/server/src/services/ruleSnapshotCache.ts`
- Modify: `apps/server/src/services/referenceProvider/types.ts:12`
- Modify: `apps/web/src/store/characterSheetStore.ts:85-88`
- Test: `packages/database/src/__tests__/corePackAssembler.test.ts`, `packages/engine/src/pipeline/__tests__/corePackFixture.test.ts`

**Interfaces:**
- Produces:
  - `parseCoreRulePack(source: unknown, label: string): CoreRulePack` from `corePackLoader.ts`.
  - `assembleCoreRulePack(packDir: string): Promise<CoreRulePack>` from `corePackAssembler.ts`.
  - `RulesSnapshotPayload = Pick<RuleSnapshot, "equipmentById" | "itemsById" | "weaponsById" | "resourcesById"> & Partial<CoreRulePackSnapshot>`.

- [ ] **Step 1: Write the failing assembler test**

Create `packages/database/src/__tests__/corePackAssembler.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { assembleCoreRulePack } from "../corePackAssembler.js";

const SHIPPED_PACK = path.join(process.cwd(), "data/packs/core_2014_pack");

describe("assembleCoreRulePack", () => {
  it("merges every segment the manifest lists", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);

    expect(pack.pack.packId).toBe("core_2014");
    expect(pack.classes).toHaveLength(12);
    expect(pack.races).toHaveLength(9);
    expect(pack.traits.length).toBeGreaterThan(400);
  });

  it("keeps assembly metadata out of the strict identity block", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);

    expect(pack.pack).not.toHaveProperty("segments");
  });

  it("names the file when a listed segment is missing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pack-"));
    await writeFile(
      path.join(dir, "manifest.json"),
      JSON.stringify({
        packId: "core_2014",
        version: 1,
        ruleset: "dnd_5e_2014",
        publishedAt: "2026-08-13T00:00:00.000Z",
        segments: ["classes/absent.json"],
      }),
    );

    await expect(assembleCoreRulePack(dir)).rejects.toThrow(
      /classes[/\\]absent\.json/,
    );
  });

  it("rejects a manifest with no segment list", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pack-"));
    await writeFile(
      path.join(dir, "manifest.json"),
      JSON.stringify({
        packId: "core_2014",
        version: 1,
        ruleset: "dnd_5e_2014",
        publishedAt: "2026-08-13T00:00:00.000Z",
      }),
    );

    await expect(assembleCoreRulePack(dir)).rejects.toThrow(/segments/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @project/database test corePackAssembler`

Expected: FAIL — `Cannot find module '../corePackAssembler.js'`.

- [ ] **Step 3: Extract the shared validation path**

In `packages/database/src/corePackLoader.ts`, add above `loadCoreRulePack`:

```ts
/**
 * Schema and semantic validation for a pack already in memory.
 *
 * Split out of loadCoreRulePack so the assembler, which builds a pack from
 * many files, validates through exactly the same path as a single-file load.
 * @param source The candidate pack
 * @param label How to name the source in an error, e.g. a file path
 * @returns The validated pack
 */
export const parseCoreRulePack = (
  source: unknown,
  label: string,
): CoreRulePack => {
  const parsed = CoreRulePackSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
    throw new CoreRulePackLoadError(
      `Core rule pack '${label}' failed schema validation: ${details}`,
    );
  }

  const validation = validateCoreRulePack(parsed.data);
  if (!validation.ok) {
    const details = validation.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new CoreRulePackLoadError(
      `Core rule pack '${label}' failed semantic validation: ${details}`,
    );
  }

  return parsed.data;
};
```

Replace everything after the `JSON.parse` block in `loadCoreRulePack` with:

```ts
  return parseCoreRulePack(source, filePath);
```

- [ ] **Step 4: Write the assembler**

Create `packages/database/src/corePackAssembler.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CoreRulePack } from "@project/shared";
import { CoreRulePackLoadError, parseCoreRulePack } from "./corePackLoader.js";

/**
 * The array sections a segment file may contribute.
 *
 * Mirrors CoreRulePackSchema's array fields. A section missing from a segment
 * contributes nothing, so segments stay small and focused.
 */
const MERGED_SECTIONS = [
  "traits",
  "resources",
  "races",
  "classes",
  "subclasses",
  "feats",
  "backgrounds",
  "equipment",
  "spells",
  "proficiencies",
] as const;

const readJson = async (
  filePath: string,
  label: string,
): Promise<Record<string, unknown>> => {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as Record<
      string,
      unknown
    >;
  } catch (error) {
    throw new CoreRulePackLoadError(`Could not read ${label} '${filePath}'.`, {
      cause: error,
    });
  }
};

/**
 * Every segment the manifest lists, merged into one validated pack.
 *
 * The manifest drives the read rather than a directory walk: a misnamed file
 * then fails loudly instead of becoming silently missing content, and merge
 * order is the authored order rather than whatever the filesystem returns.
 * @param packDir The pack directory, containing manifest.json
 * @returns The assembled pack, schema- and semantically validated
 */
export const assembleCoreRulePack = async (
  packDir: string,
): Promise<CoreRulePack> => {
  const manifestPath = path.join(packDir, "manifest.json");
  const manifest = await readJson(manifestPath, "pack manifest");

  const { segments, ...packMeta } = manifest;

  if (!Array.isArray(segments)) {
    throw new CoreRulePackLoadError(
      `Pack manifest '${manifestPath}' must list its segments under "segments".`,
    );
  }

  const merged: Record<string, unknown[]> = Object.fromEntries(
    MERGED_SECTIONS.map((section) => [section, [] as unknown[]]),
  );

  for (const relativePath of segments) {
    const segment = await readJson(
      path.join(packDir, String(relativePath)),
      "pack segment",
    );

    for (const section of MERGED_SECTIONS) {
      const entries = segment[section];
      if (Array.isArray(entries)) merged[section]!.push(...entries);
    }
  }

  // the manifest is the pack's identity block plus assembly metadata. only the
  // identity half may reach the pack, whose meta schema is strict
  return parseCoreRulePack({ pack: packMeta, ...merged }, manifestPath);
};
```

- [ ] **Step 5: Write the manifest**

Replace `packages/database/data/packs/core_2014_pack/manifest.json` with the identity block, the composition declarations, and every segment produced by Tasks 3 and 4:

```json
{
    "packId": "core_2014",
    "version": 1,
    "ruleset": "dnd_5e_2014",
    "publishedAt": "2026-08-13T00:00:00.000Z",
    "extends": [],
    "owns": [
        "traits", "resources", "races", "subraces", "classes",
        "subclasses", "feats", "backgrounds", "equipment"
    ],
    "segments": [
        "races/dragonborn.json", "races/dwarf.json", "races/elf.json",
        "races/gnome.json", "races/half-elf.json", "races/half-orc.json",
        "races/halfling.json", "races/human.json", "races/tiefling.json",
        "classes/barbarian.json", "classes/bard.json", "classes/cleric.json",
        "classes/druid.json", "classes/fighter.json", "classes/monk.json",
        "classes/paladin.json", "classes/ranger.json", "classes/rogue.json",
        "classes/sorcerer.json", "classes/warlock.json", "classes/wizard.json",
        "traits/ported.json", "traits/unimplemented.json",
        "equipment/core.json", "feats/core.json",
        "backgrounds/core.json", "resources/core.json"
    ]
}
```

Add `feats/unimplemented.json` only if Task 4 produced it. `spells` and `proficiencies` are absent from `owns` because the pack carries none, and claiming them would assert an emptiness that is not true.

The class filenames come from `definition.id.replace(/^class_/, "")` in Task 3 — confirm them against what was actually written rather than trusting this list.

- [ ] **Step 6: Run the assembler test and watch it pass**

Run: `pnpm --filter @project/database test corePackAssembler`

Expected: PASS, 4 tests.

- [ ] **Step 7: Repair the engine fixture, which the manifest change breaks**

`corePackFixture.ts` does `CoreRulePackSchema.parse({ pack: manifest, ... })`, and the manifest now carries `segments`, which the strict meta block rejects. The engine must not import the database package, so it reads the same manifest rather than sharing code.

Replace the body of `corePackSnapshot`:

```ts
export const corePackSnapshot = (): CoreRulePackSnapshot => {
  if (cached) return cached;

  // the manifest is the pack's identity block plus assembly metadata; only the
  // identity half may reach the pack, whose meta schema is strict
  const { segments, ...packMeta } = readSegment("manifest.json") as {
    segments: string[];
  };

  const merged = segments.reduce<Record<string, unknown[]>>(
    (accumulator, segmentPath) => {
      const segment = readSegment(segmentPath);

      for (const key of [
        "traits",
        "races",
        "classes",
        "subclasses",
        "resources",
        "equipment",
        "feats",
        "backgrounds",
      ]) {
        const entries = segment[key];
        if (Array.isArray(entries)) {
          accumulator[key] = [...(accumulator[key] ?? []), ...entries];
        }
      }

      return accumulator;
    },
    {},
  );

  cached = toRuleSnapshot(
    CoreRulePackSchema.parse({ pack: packMeta, ...merged }),
  );
  return cached;
};
```

Delete the now-unused `segmentPaths` function and the `readdirSync` import.

- [ ] **Step 8: Complete the segment JSON schema**

Edit `packages/database/data/schemas/corePackSegment.schema.json` so `properties` declares every section a segment now carries:

```json
    "properties": {
        "traits": { "type": "array", "items": { "$ref": "./traits.schema.json" } },
        "races": { "type": "array", "items": { "$ref": "./races.schema.json" } },
        "resources": { "type": "array", "items": { "$ref": "./resources.schema.json" } },
        "classes": { "type": "array" },
        "subclasses": { "type": "array" },
        "equipment": { "type": "array" },
        "feats": { "type": "array" },
        "backgrounds": { "type": "array" }
    }
```

The untyped arrays have no schema file yet; declaring them as arrays is still stricter than the current silence, which relies on `additionalProperties` being unset.

- [ ] **Step 9: Widen the served snapshot payload**

In `apps/server/src/services/referenceProvider/types.ts`:

```ts
import type { CoreRulePackSnapshot, RuleSnapshot } from "@project/shared";

/**
 * What /rules/snapshot serves.
 *
 * Pack content is typed through CoreRulePackSnapshot rather than RuleSnapshot:
 * RuleSnapshot.traitsById parses against a minimal trait schema whose
 * `modifiers` is a flat array, which is not the shape a real authored trait
 * has. Partial because a database with no imported pack serves neither.
 */
export type RulesSnapshotPayload = Pick<
  RuleSnapshot,
  "equipmentById" | "itemsById" | "weaponsById" | "resourcesById"
> &
  Partial<CoreRulePackSnapshot>;
```

Import and use `RulesSnapshotPayload` for `CachedRuleSnapshot["snapshot"]` in `ruleSnapshotCache.ts` instead of its inline `Pick<...>`.

- [ ] **Step 10: Read the payload in the cache builder**

In `apps/server/src/services/ruleSnapshotCache.ts`, add to the imports:

```ts
import { coreRulePacks } from "@project/database/src/schema/reference.js";
import { toRuleSnapshot } from "@project/shared";
import { desc } from "drizzle-orm";
```

Add before the `RuleSnapshotSchema.parse` call:

```ts
  // the rule ASTs live in the pack payload. the relation tables are a query
  // model for the browse endpoints and store effects: [] by design, so reading
  // traits from there would yield definitions that do nothing
  const [packRow] = await db
    .select({ payload: coreRulePacks.payload })
    .from(coreRulePacks)
    .orderBy(desc(coreRulePacks.version))
    .limit(1);

  const packContent = packRow ? toRuleSnapshot(packRow.payload) : undefined;
```

Extend the returned `snapshot` object:

```ts
    snapshot: {
      equipmentById: parsedSnapshot.equipmentById,
      itemsById: parsedSnapshot.itemsById,
      weaponsById: parsedSnapshot.weaponsById,
      resourcesById: parsedSnapshot.resourcesById,
      ...(packContent ?? {}),
    },
```

Leave `traitsById: {}` in the `RuleSnapshotSchema.parse` call untouched — that parse still covers only equipment, items, weapons and resources.

- [ ] **Step 11: Widen the web snapshot type**

In `apps/web/src/store/characterSheetStore.ts`:

```ts
/**
 * The rule content the sheet hands to the engine.
 *
 * Pack content rides alongside the equipment maps rather than inside
 * RuleSnapshot, because RuleSnapshot.traitsById parses against a minimal trait
 * schema whose `modifiers` is a flat array - not the shape an authored trait
 * has. Partial: a deployment with no imported pack serves none of it.
 */
type SheetRuleSnapshot = Pick<
  RuleSnapshot,
  "equipmentById" | "itemsById" | "weaponsById" | "resourcesById"
> &
  Partial<CoreRulePackSnapshot>;
```

Add `CoreRulePackSnapshot` to the existing `@project/shared` type import.

- [ ] **Step 12: Write the end-to-end test**

Add to `packages/engine/src/pipeline/__tests__/corePackFixture.test.ts`:

```ts
import { CharacterEngine } from "../characterEngine.js";

it("resolves a level 9 barbarian's pack traits end to end", () => {
  const save = {
    ...baseSave(),
    classes: [{ classId: "class_barbarian", level: 9, selections: {} }],
  };

  const sheet = CharacterEngine.buildLiveSheet(save, {
    snapshot: corePackSnapshot(),
  });

  const traitIds = sheet.activeTraits.map((trait) => trait.id);

  expect(traitIds).toContain("trait_rage");
  expect(traitIds).toContain("trait_reckless_attack");
  expect(traitIds).toContain("trait_fast_movement");
  expect(traitIds).toContain("trait_feral_instinct");
  expect(traitIds).toContain("trait_brutal_critical");
});
```

`baseSave()` is whatever minimal `CharacterSave` factory that suite already uses — `characterEngine.test.ts:89` builds the same barbarian shape and is the reference. Copy its construction rather than importing across test files.

This assertion is the point of the whole plan: it fails today because `class_barbarian` exists only in the pack.

- [ ] **Step 13: Run everything**

Run: `pnpm -r test && pnpm --filter @project/web exec tsc -b`

Expected: shared, engine and database green; server and web at no worse than their 4 known-red tests.

- [ ] **Step 14: Know that the server change is invisible by default**

`REFERENCE_SOURCE` defaults to `"static"` (`referenceProvider/index.ts:7`), which routes `/rules/snapshot` through `staticReferenceProvider` and its nine dictionaries — **not** through the `ruleSnapshotCache` this task modified. Verifying against a running server therefore requires:

```bash
REFERENCE_SOURCE=db pnpm --filter @project/server dev
```

Check the boot line `[referenceProvider] Using 'db' provider.` before concluding anything about whether pack content is reaching the client. Do **not** flip the default here — the static provider is still the only thing serving the other 11 classes until Task 6 ports them into the database.

- [ ] **Step 15: Commit**

```bash
git add packages/database/src/corePackAssembler.ts packages/database/src/__tests__/corePackAssembler.test.ts packages/database/src/corePackLoader.ts packages/database/data/packs/core_2014_pack/manifest.json packages/database/data/schemas/corePackSegment.schema.json packages/engine/src/pipeline/__tests__/corePackFixture.ts packages/engine/src/pipeline/__tests__/corePackFixture.test.ts apps/server/src/services/ruleSnapshotCache.ts apps/server/src/services/referenceProvider/types.ts apps/web/src/store/characterSheetStore.ts
git commit -m "feat: assemble the pack from its manifest and serve it to the engine"
```

---

### Task 6: Cut over and delete the legacy sources

**This is the irreversible task.** It removes the working definitions for 11 classes and replaces them with pack content that is structurally complete but substantially stubbed. Fighters, wizards and monks lose real rules until their traits are authored. That is the accepted trade for one source of truth — but confirm it is still what you want before starting, and do it on its own branch.

**Files:**
- Modify: `packages/database/src/seed.ts` (remove the reference-data half)
- Delete: `apps/server/src/services/referenceProvider/staticReferenceProvider.ts`
- Modify: `apps/server/src/services/referenceProvider/index.ts` (`db` becomes the only source)
- Delete: `packages/engine/src/rules/{trait,class,race,equipment,resource}Dictionary.ts`, `packages/engine/src/rules/traits/`, `packages/engine/src/rules/classes/`, and the remaining `{subclass,feat,background,item,weapon}Dictionary` exports
- Delete: `packages/database/data/{traits,classes,subclasses,races,subraces,feats,backgrounds,items}.json`
- Delete: `packages/database/scripts/portDictionaries.ts`, `packages/database/scripts/generateStubs.ts`
- Modify: `packages/engine/src/rules/ruleLookup.ts` (drop the dictionary fallbacks)

- [ ] **Step 1: Import the pack into a real database**

```bash
pnpm --filter @project/database db:push
```

Then:

```bash
pnpm --filter @project/database exec tsx -e "import { assembleCoreRulePack } from './src/corePackAssembler.js'; import { persistCoreRulePack } from './src/corePackImporter.js'; import { db } from './src/client.js'; import { classes, traits } from './src/schema/reference.js'; const pack = await assembleCoreRulePack('data/packs/core_2014_pack'); await persistCoreRulePack(pack); console.log('classes', (await db.select().from(classes)).length); console.log('traits', (await db.select().from(traits)).length); process.exit(0);"
```

Expected: `classes 12` and a trait count matching the assembled pack. The importer's existing `TRUNCATE` is correct here — the pack owns every section it declares, and nothing else should survive.

- [ ] **Step 2: Retire the static reference provider**

`staticReferenceProvider.ts` imports nine dictionaries — `BACKGROUND`, `CLASS`, `EQUIPMENT`, `FEAT`, `ITEM`, `RACE`, `SUBCLASS`, `TRAIT`, `WEAPON` — so it cannot survive their deletion. Delete it, and make `db` the only source:

- Delete `apps/server/src/services/referenceProvider/staticReferenceProvider.ts`.
- In `referenceProvider/index.ts`, set `DEFAULT_SOURCE` to `"db"`, remove the `static` branch from `createProviderForSource`, and remove the `REFERENCE_SOURCE_FALLBACK_ENABLED` path — there is nothing left to fall back to.
- Keep the `[referenceProvider] Using '<source>' provider.` boot line. It has been the single reliable tell for this class of problem and stays useful with one source.

Do this **before** deleting the dictionaries, so the server's compile errors surface as a deliberate removal rather than as fallout.

- [ ] **Step 3: Drop the dictionary fallbacks**

In `packages/engine/src/rules/ruleLookup.ts`, each resolver currently reads `snapshot?.xById?.[id] ?? X_DICTIONARY[id]`. Remove the second half of each, and delete the dictionary imports. Replace the block comment about two live sources — it is no longer true:

```ts
/**
 * A trait, from the pack.
 *
 * The static dictionaries are gone: rules content comes from packs and nothing
 * else. A trait the pack does not define does not exist, and resolving to
 * undefined is the correct answer rather than a gap to paper over.
 */
```

- [ ] **Step 4: Remove the reference half of the seed**

`seed.ts` seeds both reference data and development characters. Delete the reference ETL — including the placeholder-trait branch that started this whole investigation — and keep the operational seeding. Reference data now arrives only through the importer.

- [ ] **Step 5: Delete the dictionaries, the legacy JSON and the migration scripts**

```bash
git rm -r packages/engine/src/rules/traits packages/engine/src/rules/classes
git rm packages/engine/src/rules/traitDictionary.ts packages/engine/src/rules/classDictionary.ts packages/engine/src/rules/raceDictionary.ts packages/engine/src/rules/equipmentDictionary.ts packages/engine/src/rules/resourceDictionary.ts
git rm packages/database/data/traits.json packages/database/data/classes.json packages/database/data/subclasses.json packages/database/data/races.json packages/database/data/subraces.json packages/database/data/feats.json packages/database/data/backgrounds.json packages/database/data/items.json
git rm packages/database/scripts/portDictionaries.ts packages/database/scripts/generateStubs.ts
```

- [ ] **Step 6: Fix the fallout**

Run: `pnpm -r typecheck`

Every import of a deleted dictionary is now a compile error. Each one is either a test that should build its own fixture, or a consumer that should take a snapshot. Work through them; do not reintroduce a dictionary to satisfy one.

- [ ] **Step 7: Run everything and record the new baseline**

Run: `pnpm -r test`

Expect substantial breakage, and triage rather than suppress. A test asserting a fighter gains a real modifier now legitimately fails, because that trait is a stub — update it to assert `implementation.mode === "unimplemented"`, which is the honest new expectation and keeps the burndown visible.

- [ ] **Step 8: Update the baseline memory note**

`baseline-test-failures-race-migration.md` is now entirely wrong. Rewrite it with the post-cutover numbers, and record how many traits carry `mode: "unimplemented"` — that number is the PHB burndown.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat!: make the core rule pack the only source of rules content"
```

---

## Follow-ups

- **Author the stubs.** Roughly 230 traits, 14 subclasses, 12 feats and backgrounds carry `mode: "unimplemented"`. Each is the same per-feature work already being done for barbarian.
- **Two-mode import.** Wholesale replacement for owned sections, entity-scoped for the rest. Needed by the second pack, not the first — see the spec's section 4. `class_progressions` is keyed `(classId, level, traitId)`, so the unit of replacement must be the parent entity, not the row.
- **Honour `extends` and `ruleset` in composition.** The declarations land in Task 2; nothing reads them until a supplement pack exists.
- **Resources into `pack.resources`** — ported in Task 3, which also fixes Relentless Endurance, whose resource has no rule today and so is returned untouched by `applyRest`: it never resets.
- **Relentless Rage**, parked in `docs/superpowers/specs/2026-08-20-relentless-rage-design.md`.
