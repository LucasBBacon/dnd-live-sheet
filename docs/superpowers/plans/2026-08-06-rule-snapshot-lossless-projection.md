# Lossless Rule Snapshot Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `ruleSnapshotCache` silently dropping fields when it rebuilds equipment rules from the database, so that flipping `EQUIPMENT_RESOLUTION_MODE` to `"snapshot-first"` later tells the truth instead of quietly zeroing item weight.

**Architecture:** Replace two hand-rolled, field-by-field reconstructions with spreads validated by a strict schema, and reuse the projection helpers the engine already exports. The lossy logic moves out of the cache into a new pure module that takes rows and returns lookup maps, so it can be tested without a database. Weight is read from the `items.weight` column rather than the stored rule payload, because the column has always been correct while payloads written before the extractor carried weight hold a stale `0`.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Zod 4, Drizzle ORM, Vitest, pnpm workspaces.

## Global Constraints

- **Import specifiers end in `.js`** even when the source file is `.ts`. Every intra-package import in this repo follows this; a bare specifier will not resolve under `nodenext`.
- **`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are both ON** in every package.
- **`verbatimModuleSyntax` is ON** — type-only imports must use `import type`.
- **Comment style:** lowercase inline comments explaining *why*, matching the surrounding file. Do not add JSDoc to every member.
- **Do NOT change `EQUIPMENT_RESOLUTION_MODE`.** It stays pinned to `"static-only"`. Deciding when to flip it needs the DB-driven rules design to exist first, and is explicitly out of scope.
- **Do not modify `apps/web`.**
- **Do not re-seed or migrate data.** The fix must heal stale rows by reading the authoritative column, not by rewriting stored payloads.

## Baseline — what is already broken before you start

Two packages are not green, and fixing them is NOT part of this plan. Read this before interpreting any output:

| Check | State at plan start |
|---|---|
| `@project/server` tests | **176 passing, 0 failing** — clean, so any failure here is yours |
| `@project/server` typecheck | **39 pre-existing errors** — not yours |
| `@project/shared` tests | **11 pre-existing failures**, all in `character.test.ts` and `rules.test.ts` |
| `@project/engine` tests | 422 passing, 0 failing |
| `@project/engine` typecheck | 25 pre-existing errors |
| `@project/database` tests | 53 passing, 0 failing |
| `pnpm check:hygiene` | fails on `packages/shared/src/schemas/actions.ts`, pre-existing |

Your gate throughout is **no regressions**: the tests you add pass, and nothing that passed before starts failing.

## The two bugs being fixed

Both are the same shape — a field that exists on the source type, is never carried across a boundary, and whose absence is masked by a Zod `.default()` so nothing ever throws.

1. **`ruleSnapshotCache.ts` drops `weight`, `equipSlot`, `requiresAttunement` and `ammoTag`.** `buildRuleSnapshot` reconstructs `EquipmentDefinition` by naming fields at [`ruleSnapshotCache.ts:58-76`](../../../apps/server/src/services/ruleSnapshotCache.ts), copying only `id`, `name`, `type`, `modifiers` and `weapon`. It then reconstructs `ItemDefinition` by naming fields again at `:82-92`, copying only `id`, `name`, `type`, `modifiers`. Meanwhile `toItemDefinition` and `toWeaponDefinition` in `packages/engine/src/rules/equipmentDictionary.ts` already perform these projections completely and are exported from `@project/engine`, which this file already imports from.

2. **`WeaponCapabilitySchema` is missing `versatileDamageDice`.** `WeaponDefinitionSchema` has it; `EquipmentDefinition.weapon` (a `WeaponCapability`) does not. Verified empirically — the two shapes are:

   ```
   WeaponDefinition: ammoItemId, ammoTag, category, damageDice, damageType, id, name, properties, versatileDamageDice
   WeaponCapability: ammoItemId, ammoTag, category, damageDice, damageType,         properties
   ```

   So a versatile weapon cannot round-trip through equipment. This one has live consumers: `combat.ts:154-157` and `weaponSynthesizer.ts:33-42` both branch on `versatileDamageDice` to give a versatile weapon its two-handed damage die. A longsword resolved through a snapshot loses its 1d10.

## File Structure

**Create:**
- `packages/shared/src/schemas/__tests__/equipment.test.ts` — guards that `WeaponCapability` and `WeaponDefinition` stay complementary.
- `apps/server/src/services/ruleSnapshotProjection.ts` — pure: item rows in, the three lookup maps out. All the shape logic lives here.
- `apps/server/src/services/__tests__/ruleSnapshotProjection.test.ts`

**Modify:**
- `packages/shared/src/schemas/equipment.ts` — add `versatileDamageDice` to `WeaponCapabilitySchema`.
- `apps/server/src/services/ruleSnapshotCache.ts` — select `items.weight`, delegate to the projection, delete the hand-rolled reconstructions.

The split exists because `ruleSnapshotCache.ts` currently mixes three responsibilities — query, projection, memoization — and only the projection has interesting logic. Separating it is what makes the round-trip test possible without mocking Drizzle.

---

### Task 1: Make `WeaponCapability` a lossless complement of `WeaponDefinition`

**Files:**
- Modify: `packages/shared/src/schemas/equipment.ts` (the `WeaponCapabilitySchema` block, around lines 15-24)
- Create: `packages/shared/src/schemas/__tests__/equipment.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `WeaponCapabilitySchema` gains an optional `versatileDamageDice: string`, making `{ id, name } & WeaponCapability` exactly equal to `WeaponDefinition`. Later tasks rely on this — a destructure-and-rest of a `WeaponDefinition` must parse cleanly as a `WeaponCapability`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/schemas/__tests__/equipment.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { WeaponCapabilitySchema } from "../equipment.js";
import { WeaponDefinitionSchema } from "../weapons.js";

/**
 * EquipmentDefinition carries a weapon as a WeaponCapability, and the engine
 * projects that back out as a WeaponDefinition by adding id and name. If the
 * two shapes ever stop being exact complements, that projection silently
 * loses whichever field drifted - which is how versatileDamageDice went
 * missing from every snapshot-resolved weapon.
 */
describe("WeaponCapability and WeaponDefinition stay complementary", () => {
  it("covers every WeaponDefinition field except id and name", () => {
    const definitionKeys = Object.keys(WeaponDefinitionSchema.shape).sort();
    const capabilityKeys = Object.keys(WeaponCapabilitySchema.shape).sort();

    expect([...capabilityKeys, "id", "name"].sort()).toEqual(definitionKeys);
  });

  it("round-trips a fully-populated weapon through the capability shape", () => {
    const definition = WeaponDefinitionSchema.parse({
      id: "item_weapon_longsword",
      name: "Longsword",
      category: "martial_melee",
      damageDice: "1d8",
      versatileDamageDice: "1d10",
      damageType: "slashing",
      properties: ["versatile"],
      ammoItemId: "item_ammo_arrow",
      ammoTag: "arrow",
    });

    const { id, name, ...capability } = definition;

    // the capability schema is strict, so an unrecognised key throws here
    // rather than being quietly dropped
    const parsed = WeaponCapabilitySchema.parse(capability);

    expect({ id, name, ...parsed }).toEqual(definition);
  });

  it("keeps the versatile damage die a versatile weapon depends on", () => {
    // combat.ts and weaponSynthesizer.ts both branch on this to pick the
    // two-handed damage die, so losing it silently downgrades a longsword
    const parsed = WeaponCapabilitySchema.parse({
      category: "martial_melee",
      damageDice: "1d8",
      versatileDamageDice: "1d10",
      damageType: "slashing",
      properties: ["versatile"],
    });

    expect(parsed.versatileDamageDice).toBe("1d10");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @project/shared exec vitest run src/schemas/__tests__/equipment.test.ts
```

Expected: **all three tests FAIL.** The key-set test reports the arrays differ by `versatileDamageDice`; the other two throw a Zod `unrecognized_keys` error, because `WeaponCapabilitySchema` is `.strict()` and does not know the field.

- [ ] **Step 3: Add the missing field**

In `packages/shared/src/schemas/equipment.ts`, inside the `WeaponCapabilitySchema` object, add `versatileDamageDice` immediately after `damageDice` so the ordering matches `WeaponDefinitionSchema`:

```ts
export const WeaponCapabilitySchema = z
  .object({
    category: WeaponCategorySchema,
    damageDice: z.string(),
    // the two-handed die for a versatile weapon. WeaponDefinition has always
    // had this; without it here, EquipmentDefinition cannot carry a versatile
    // weapon and the projection back out silently downgrades it
    versatileDamageDice: z.string().optional(),
    damageType: DamageTypeSchema,
    properties: z.array(WeaponPropertySchema),
    ammoItemId: z.string().optional(),
    ammoTag: z.string().optional(),
  })
  .strict();
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @project/shared exec vitest run src/schemas/__tests__/equipment.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Confirm no regressions across the packages that consume this schema**

```bash
pnpm --filter @project/shared exec vitest run 2>&1 | tail -5
```

Expected: `11 failed | 146 passed` — the same 11 pre-existing failures in `character.test.ts` and `rules.test.ts`, plus your 3 new passes. A 12th failure is yours.

```bash
pnpm --filter @project/engine exec vitest run 2>&1 | tail -5
```

Expected: **422 passing, 0 failures.** Adding an optional field to a strict schema only widens what it accepts, so nothing that parsed before should stop parsing. If the engine suite breaks, something else was depending on the field being rejected.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas/equipment.ts packages/shared/src/schemas/__tests__/equipment.test.ts
git commit -m "fix: let WeaponCapability carry versatile damage dice"
```

---

### Task 2: Extract a pure, lossless projection module

The whole point of this task is the round-trip test. The implementation is a spread; the test is what stops the next field from going missing.

**Files:**
- Create: `apps/server/src/services/ruleSnapshotProjection.ts`
- Create: `apps/server/src/services/__tests__/ruleSnapshotProjection.test.ts`

**Interfaces:**
- Consumes: `WeaponCapabilitySchema` now carrying `versatileDamageDice` (Task 1). `hundredthsToPounds`, `toItemDefinition`, `toWeaponDefinition` from `@project/engine`. `EquipmentDefinitionSchema`, `ItemDefinitionSchema`, and the types `EquipmentDefinition`, `ItemDefinition`, `WeaponDefinition` from `@project/shared`.
- Produces: `interface EquipmentRuleRow { id: string; name: string; weight: number; itemRule: ItemDefinition | null; weaponRule: WeaponDefinition | null }`; `interface RuleSnapshotProjection { equipmentById: Record<string, EquipmentDefinition>; itemsById: Record<string, ItemDefinition>; weaponsById: Record<string, WeaponDefinition>; malformedItemIds: string[] }`; `projectEquipmentRows(rows: EquipmentRuleRow[]): RuleSnapshotProjection`.

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/services/__tests__/ruleSnapshotProjection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ItemDefinition, WeaponDefinition } from "@project/shared";
import {
  projectEquipmentRows,
  type EquipmentRuleRow,
} from "../ruleSnapshotProjection.js";

/**
 * A rule payload using every field ItemDefinition has. The round-trip test
 * below asserts on this object's own key list rather than a hardcoded one, so
 * adding a field to ItemDefinition makes the test fail until the projection
 * carries it.
 */
const fullItemRule: ItemDefinition = {
  id: "item_armor_plate",
  name: "Plate Armor",
  type: "armor",
  weight: 65,
  equipSlot: "body",
  requiresAttunement: true,
  ammoTag: "bolt",
  modifiers: [
    {
      target: "ARMOR_CLASS",
      type: "set_base",
      value: 18,
      scalingFactor: "none",
      maxDexCap: 0,
      requiredStates: [],
      forbiddenStates: [],
    },
  ],
};

const row = (overrides: Partial<EquipmentRuleRow> = {}): EquipmentRuleRow => ({
  id: "item_armor_plate",
  name: "Plate Armor",
  weight: 6500, // hundredths of a pound
  itemRule: fullItemRule,
  weaponRule: null,
  ...overrides,
});

describe("projectEquipmentRows", () => {
  it("returns empty maps for no rows", () => {
    const result = projectEquipmentRows([]);

    expect(result.equipmentById).toEqual({});
    expect(result.itemsById).toEqual({});
    expect(result.weaponsById).toEqual({});
    expect(result.malformedItemIds).toEqual([]);
  });

  it("carries every authored field through to the equipment map", () => {
    // the guard: asserted against the source object's own keys, so a new
    // ItemDefinition field fails this until the projection carries it
    const equipment = projectEquipmentRows([row()]).equipmentById
      .item_armor_plate;

    expect(equipment).toBeDefined();
    expect(Object.keys(equipment!).sort()).toEqual(
      expect.arrayContaining(Object.keys(fullItemRule).sort()),
    );
  });

  it("carries the individual fields the old reconstruction dropped", () => {
    const equipment = projectEquipmentRows([row()]).equipmentById
      .item_armor_plate!;

    expect(equipment.equipSlot).toBe("body");
    expect(equipment.requiresAttunement).toBe(true);
    expect(equipment.ammoTag).toBe("bolt");
    expect(equipment.modifiers).toEqual(fullItemRule.modifiers);
  });

  it("takes weight from the column and converts it to pounds", () => {
    const equipment = projectEquipmentRows([row({ weight: 6500 })])
      .equipmentById.item_armor_plate!;

    expect(equipment.weight).toBe(65);
  });

  it("prefers the column over a stale zero in the stored rule payload", () => {
    // rule payloads written before the extractor carried weight hold a 0.
    // reading the column heals them without a re-seed, so this is the
    // assertion that distinguishes the two possible sources
    const equipment = projectEquipmentRows([
      row({ weight: 6500, itemRule: { ...fullItemRule, weight: 0 } }),
    ]).equipmentById.item_armor_plate!;

    expect(equipment.weight).toBe(65);
  });

  it("mirrors the same fields into the compatibility item map", () => {
    const item = projectEquipmentRows([row()]).itemsById.item_armor_plate!;

    expect(item.weight).toBe(65);
    expect(item.equipSlot).toBe("body");
    expect(item.requiresAttunement).toBe(true);
    expect(item.ammoTag).toBe("bolt");
  });

  it("round-trips a versatile weapon without losing its two-handed die", () => {
    const weaponRule: WeaponDefinition = {
      id: "item_weapon_longsword",
      name: "Longsword",
      category: "martial_melee",
      damageDice: "1d8",
      versatileDamageDice: "1d10",
      damageType: "slashing",
      properties: ["versatile"],
    };

    const result = projectEquipmentRows([
      row({
        id: "item_weapon_longsword",
        name: "Longsword",
        weight: 300,
        itemRule: {
          id: "item_weapon_longsword",
          name: "Longsword",
          type: "weapon",
          weight: 3,
          requiresAttunement: false,
        },
        weaponRule,
      }),
    ]);

    expect(result.weaponsById.item_weapon_longsword).toEqual(weaponRule);
    expect(result.malformedItemIds).toEqual([]);
  });

  it("leaves non-weapons out of the weapon map", () => {
    expect(projectEquipmentRows([row()]).weaponsById).toEqual({});
  });

  it("falls back to bare gear when a row has no authored rule", () => {
    const result = projectEquipmentRows([
      row({ id: "item_mystery", name: "Mystery Box", itemRule: null, weight: 250 }),
    ]);

    const equipment = result.equipmentById.item_mystery!;
    expect(equipment.type).toBe("gear");
    expect(equipment.name).toBe("Mystery Box");
    expect(equipment.weight).toBe(2.5);
    expect(result.malformedItemIds).toEqual([]);
  });

  it("skips and reports a row whose stored rule no longer parses", () => {
    // a payload written by an older schema version. one bad row must not take
    // the whole snapshot - and therefore the server - down with it
    const result = projectEquipmentRows([
      row(),
      row({
        id: "item_broken",
        itemRule: { ...fullItemRule, id: "item_broken", type: "nonsense" } as
          unknown as ItemDefinition,
      }),
    ]);

    expect(result.malformedItemIds).toEqual(["item_broken"]);
    expect(result.equipmentById.item_broken).toBeUndefined();
    // the good row still made it
    expect(result.equipmentById.item_armor_plate).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @project/server exec vitest run src/services/__tests__/ruleSnapshotProjection.test.ts
```

Expected: FAIL — `Failed to resolve import "../ruleSnapshotProjection.js"`.

- [ ] **Step 3: Write the projection module**

Create `apps/server/src/services/ruleSnapshotProjection.ts`:

```ts
import {
  EquipmentDefinitionSchema,
  ItemDefinitionSchema,
  type EquipmentDefinition,
  type ItemDefinition,
  type WeaponDefinition,
} from "@project/shared";
import {
  hundredthsToPounds,
  toItemDefinition,
  toWeaponDefinition,
} from "@project/engine";

/** One row of the items table, as the snapshot builder reads it. */
export interface EquipmentRuleRow {
  id: string;
  name: string;
  /** hundredths of a pound - the storage-canonical weight */
  weight: number;
  itemRule: ItemDefinition | null;
  weaponRule: WeaponDefinition | null;
}

export interface RuleSnapshotProjection {
  equipmentById: Record<string, EquipmentDefinition>;
  itemsById: Record<string, ItemDefinition>;
  weaponsById: Record<string, WeaponDefinition>;
  /** ids whose stored rule payload no longer parses; skipped, not fatal */
  malformedItemIds: string[];
}

/**
 * A row with no authored rule still has to resolve to something, so it becomes
 * a bare piece of gear rather than vanishing from the snapshot.
 */
const fallbackItemRule = (
  row: Pick<EquipmentRuleRow, "id" | "name">,
): ItemDefinition =>
  ItemDefinitionSchema.parse({ id: row.id, name: row.name, type: "gear" });

/**
 * A WeaponDefinition minus the identity fields EquipmentDefinition already
 * carries. Destructured rather than enumerated so a field added to
 * WeaponDefinition arrives here on its own.
 */
const toWeaponCapability = ({
  id: _id,
  name: _name,
  ...capability
}: WeaponDefinition): EquipmentDefinition["weapon"] => capability;

/**
 * Turns stored item rows into the three lookup maps a rule snapshot exposes.
 *
 * Pure on purpose: the cache owns the query and the memoisation, this owns the
 * shape. That is what lets the round-trip test run without a database, which
 * is the only thing that reliably catches a dropped field.
 *
 * Fields are carried by spreading rather than by naming, so one added to
 * ItemDefinition arrives here automatically. EquipmentDefinitionSchema is
 * strict, so a field it does *not* know about fails loudly instead of being
 * silently dropped - which is exactly how weight, equipSlot, requiresAttunement
 * and ammoTag went missing for as long as they did.
 */
export const projectEquipmentRows = (
  rows: EquipmentRuleRow[],
): RuleSnapshotProjection => {
  const equipmentById: Record<string, EquipmentDefinition> = {};
  const itemsById: Record<string, ItemDefinition> = {};
  const weaponsById: Record<string, WeaponDefinition> = {};
  const malformedItemIds: string[] = [];

  for (const row of rows) {
    const itemRule = row.itemRule ?? fallbackItemRule(row);

    const parsed = EquipmentDefinitionSchema.safeParse({
      ...itemRule,
      // the column is the canonical weight. payloads written before the
      // extractor carried weight hold a stale 0, so reading the column heals
      // them without a re-seed
      weight: hundredthsToPounds(row.weight),
      ...(row.weaponRule
        ? { weapon: toWeaponCapability(row.weaponRule) }
        : {}),
    });

    // one unparseable row must not take the whole snapshot - and with it every
    // request that needs one - down. the id is reported so the caller can log
    // it, and the item resolves to nothing, which InventoryExtractor already
    // surfaces as an unknown id
    if (!parsed.success) {
      malformedItemIds.push(row.id);
      continue;
    }

    const equipment = parsed.data;
    equipmentById[row.id] = equipment;
    itemsById[row.id] = toItemDefinition(equipment);

    const weapon = toWeaponDefinition(equipment);
    if (weapon) weaponsById[row.id] = weapon;
  }

  return { equipmentById, itemsById, weaponsById, malformedItemIds };
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @project/server exec vitest run src/services/__tests__/ruleSnapshotProjection.test.ts
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Prove the round-trip test has teeth**

A test that cannot fail when the behaviour it names is removed is not guarding anything. Verify this one can:

Temporarily replace the `EquipmentDefinitionSchema.safeParse({...})` argument with the old hand-rolled reconstruction:

```ts
    const parsed = EquipmentDefinitionSchema.safeParse({
      id: itemRule.id,
      name: itemRule.name,
      type: itemRule.type ?? "gear",
      ...(itemRule.modifiers ? { modifiers: itemRule.modifiers } : {}),
      ...(row.weaponRule
        ? { weapon: toWeaponCapability(row.weaponRule) }
        : {}),
    });
```

Re-run the test file. Expected: **several tests FAIL**, including "carries every authored field through to the equipment map" and both weight tests. Paste the real failure output into your report. Then restore the spread version and confirm 10/10 pass again.

If the tests do NOT fail under the hand-rolled version, stop and report it — that would mean the guard is worthless and the whole task is pointless.

- [ ] **Step 6: Confirm no regressions**

```bash
pnpm --filter @project/server exec vitest run 2>&1 | tail -5
```

Expected: **186 passing, 0 failures** (176 baseline + your 10). This package was clean before you started, so any failure is yours.

```bash
pnpm --filter @project/server typecheck 2>&1 | grep -c "error TS"
```

Expected: **39 or fewer** — the pre-existing baseline. A rise means your new file has a type error.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/services/ruleSnapshotProjection.ts apps/server/src/services/__tests__/ruleSnapshotProjection.test.ts
git commit -m "feat: add a lossless pure projection for rule snapshot rows"
```

---

### Task 3: Wire the cache to the projection

**Files:**
- Modify: `apps/server/src/services/ruleSnapshotCache.ts` (whole file)

**Interfaces:**
- Consumes: `projectEquipmentRows` and `EquipmentRuleRow` from `./ruleSnapshotProjection.js` (Task 2).
- Produces: no public API change. `getCachedRuleSnapshot()` and `invalidateRuleSnapshotCache()` keep their existing signatures, so no caller needs touching.

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `apps/server/src/services/ruleSnapshotCache.ts`:

```ts
import { db } from "@project/database";
import { items } from "@project/database/src/schema/reference.js";
import { resolveResourceRules } from "@project/engine";
import { RuleSnapshotSchema, type RuleSnapshot } from "@project/shared";
import { and, eq } from "drizzle-orm";
import { getReferenceCacheVersion } from "./referenceCache.js";
import { projectEquipmentRows } from "./ruleSnapshotProjection.js";

type CachedRuleSnapshot = {
  cacheVersion: number;
  loadedAt: number;
  snapshot: Pick<
    RuleSnapshot,
    "equipmentById" | "itemsById" | "weaponsById" | "resourcesById"
  >;
};

let cached: CachedRuleSnapshot | null = null;

const buildRuleSnapshot = async (): Promise<CachedRuleSnapshot> => {
  const ruleRows = await db
    .select({
      id: items.id,
      name: items.name,
      // the storage-canonical weight, in hundredths of a pound. read from the
      // column rather than the rule payload because payloads written before
      // the extractor carried weight hold a stale 0
      weight: items.weight,
      itemRule: items.itemRule,
      weaponRule: items.weaponRule,
    })
    .from(items)
    .where(and(eq(items.sourceType, "core"), eq(items.isPublished, true)));

  const { equipmentById, itemsById, weaponsById, malformedItemIds } =
    projectEquipmentRows(ruleRows);

  // a row we could not parse is dropped rather than fatal, but it must not be
  // silent - an item missing from the snapshot resolves to nothing downstream
  if (malformedItemIds.length > 0) {
    console.warn(
      `[ruleSnapshotCache] skipped ${malformedItemIds.length} item(s) with unparseable rules: ${malformedItemIds.join(", ")}`,
    );
  }

  const cacheVersion = getReferenceCacheVersion();

  const parsedSnapshot = RuleSnapshotSchema.parse({
    equipmentById,
    itemsById,
    weaponsById,
    resourcesById: resolveResourceRules(),
    traitsById: {},
  });

  return {
    cacheVersion,
    loadedAt: Date.now(),
    snapshot: {
      equipmentById: parsedSnapshot.equipmentById,
      itemsById: parsedSnapshot.itemsById,
      weaponsById: parsedSnapshot.weaponsById,
      resourcesById: parsedSnapshot.resourcesById,
    },
  };
};

export const getCachedRuleSnapshot = async (): Promise<CachedRuleSnapshot> => {
  const cacheVersion = getReferenceCacheVersion();
  if (cached && cached.cacheVersion === cacheVersion) {
    return cached;
  }

  const rebuilt = await buildRuleSnapshot();
  cached = rebuilt;
  return rebuilt;
};

export const invalidateRuleSnapshotCache = (): void => {
  cached = null;
};
```

Three things this deletes on purpose: the commented-out "OLD APPROACH" block, which is now two generations stale and preserved in git history; `buildFallbackItemRule`, which moved into the projection module; and both hand-rolled reconstructions.

`console.warn` is the existing convention here — the server uses `console.*` in seventeen places across its controllers, middleware and gateway, and has no logger abstraction. Do not introduce one for this.

- [ ] **Step 2: Verify the file no longer names fields one by one**

```bash
grep -n "itemRule.id\|itemRule.name\|eq.modifiers\|eq.weapon" apps/server/src/services/ruleSnapshotCache.ts
```

Expected: **no output.** Any hit means a reconstruction survived the rewrite and the file can still drop fields.

- [ ] **Step 3: Confirm no regressions**

```bash
pnpm --filter @project/server exec vitest run 2>&1 | tail -5
```

Expected: **186 passing, 0 failures.** No test mocks this module today, so this is confirming the rewrite broke nothing that imports it.

```bash
pnpm --filter @project/server typecheck 2>&1 | grep -c "error TS"
```

Expected: **39 or fewer.** This is the real check on Task 3 — the row type returned by the Drizzle select must satisfy `EquipmentRuleRow`. If `items.itemRule` or `items.weaponRule` types do not line up, it surfaces here.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/services/ruleSnapshotCache.ts
git commit -m "fix: stop the rule snapshot dropping weight and equip metadata"
```

---

## Final Verification

- [ ] **Run every affected package against the baseline**

```bash
pnpm --filter @project/shared exec vitest run 2>&1 | tail -5
pnpm --filter @project/server exec vitest run 2>&1 | tail -5
pnpm --filter @project/engine exec vitest run 2>&1 | tail -5
pnpm --filter @project/database exec vitest run 2>&1 | tail -5
```

Expected: shared at **exactly its 11 pre-existing failures** and no more; server **186 passing, 0 failures**; engine **422 passing, 0 failures**; database **53 passing, 0 failures**.

```bash
pnpm --filter @project/server typecheck 2>&1 | grep -c "error TS"
```

Expected: **39 or fewer.**

- [ ] **Confirm the resolution mode was not touched**

```bash
grep -n "EQUIPMENT_RESOLUTION_MODE" packages/engine/src/rules/ruleLookup.ts
```

Expected: still `"static-only"`. Flipping it is a separate decision and explicitly out of scope for this plan.

## What this does and does not unblock

**Does:** the snapshot path now carries `weight`, `equipSlot`, `requiresAttunement`, `ammoTag` and `versatileDamageDice`. The final review traced the weight path hop by hop — column → `hundredthsToPounds` → strict parse → `toItemDefinition` → `RuleSnapshotSchema.parse` → HTTP → store → `resolveItemDefinition` → `InventoryWeightCalculator` — and confirmed flipping `EQUIPMENT_RESOLUTION_MODE` would now produce correct item weights rather than silently zeroing every one.

**Correction to this plan as originally written.** It claimed `itemsExtraction.ts` could not source `versatileDamageDice` because `SourceItem` has no such field. That was wrong: `items.json` carries `weaponProperties.versatileDamageDice` for six weapons — battleaxe, longsword, quarterstaff, spear, trident and warhammer. The field was missing from `SourceItem` because nobody had added it. Fixed in `dc0fd1f`, which also revealed a live bug: `EQUIPMENT_DICTIONARY.item_weapon_longsword` was flagged `versatile` with no die, so every longsword in the shipping static-only path dealt 1d8 two-handed. The claim holds for `equipSlot` and `requiresAttunement` — both appear zero times in the source data.

**Does not:** make flipping the mode a good idea yet.

1. **Flipping today would make plate armor stop granting AC.** `resolveEquipmentDefinition` prefers the snapshot and only falls back when an id is *absent*. The snapshot has all 65 items, so flipping shadows the 11 curated `EQUIPMENT_DICTIONARY` entries with snapshot entries that have no `equipSlot` and no modifiers. This is the sharpest reason not to flip, and it is not a weight problem.
2. **`EQUIPMENT_DICTIONARY` holds 11 entries against 65 items in the catalogue.** Whichever source is authoritative, one is missing most of the content. That reconciliation is the actual DB-driven-rules project.
3. **`equipSlot` and `requiresAttunement` cannot be seeded at all** — the source format has no such fields. Filling them means extending `items.json`, not changing code.

## Follow-ups named by the final review

1. **Distinguish "a row is bad" from "the contract is broken."** `projectEquipmentRows` skips malformed rows and logs them, so 1-of-65 and 65-of-65 produce the same `console.warn` and the same HTTP 200. A threshold that throws when *every* row fails would catch a schema-contract break, and is testable in the pure module with no database mock.
2. **Source `id` and `name` from the row, not the payload.** `weight` already is, on the argument that the column is authoritative and payloads go stale — the same argument applies to identity. Today `itemsById[x].id !== x` is reachable if a name is updated without rewriting `item_rule`.
3. **Split the typecheck baseline.** The server's 37 errors are 12 production + 25 test. An undifferentiated count is exactly what hid this bug: two of the original 39 were *in the rewritten file* and *were this bug* — line 90's `satisfies ItemDefinition` had been failing all along because the object omitted `weight` and `requiresAttunement`. Worth triaging `rollbackPipeline.ts:820` (a `TS2367` unreachable-branch comparison) and `derivedStats.ts:300-302` (`bestMod` possibly undefined) on their own.
4. **Add one integration test crossing the extractor/database/projection seam.** Every test on this branch stops at a hand-built fixture, which is precisely why the missing `versatileDamageDice` survived three task reviews.
