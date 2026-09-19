# Item Proficiency Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a proficiency grant in the pack resolve against the item it names, guard the vocabulary so it cannot drift again, author the class proficiencies that were never written, and repair the web path so the bonus reaches the sheet.

**Architecture:** An item names its own proficiencies. A weapon's proficiency ids are its item id plus the `categoryTags` it already carries; an armour item's are its id, `category_armor_<armorCategory>`, and any `category_armor_*` tag. One engine module owns those derivations and the match predicate, `combat.ts` calls it, and the existing pack drift guard derives its legal set from the same helper — so a grant cannot pass the guard and fail in combat. The web stops reading a store record that is never populated and calls `ProficiencyExtractor` on the character's traits instead, the same way the server-side engine does.

**Tech Stack:** TypeScript, pnpm workspaces, turbo, Zod schemas in `@project/shared`, Vitest everywhere, React + zustand in `apps/web`, JSON rule packs under `packages/database/data/packs/core_2014_pack`.

**Spec:** `docs/superpowers/specs/2026-09-19-item-proficiency-resolution-design.md`

**Branch:** `feat/item-proficiency`, already created, currently at `9cf8743` (the spec commit).

## Global Constraints

- **Line endings are per-file and git hides conversions.** `core.autocrlf=true` is set, but files are individually LF or CRLF. The Write and Edit tools emit LF. Before committing any file you touched, check it with `file <path>` and restore CRLF if it was CRLF:
  `node -e "const fs=require('fs');for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/\r?\n/g,'\r\n'))" <file>`
- **Pack JSON is edited only through `packages/database/scripts/patchPackSegment.ts`.** The pack files are CRLF with four-space indentation and one has no trailing newline; the script parses and re-prints with the file's own endings. Never edit a pack JSON file with Write or Edit.
- **Never run `tsc -b` in `packages/database`.** Its typecheck is `tsc --noEmit`, run it as `pnpm --filter @project/database typecheck`.
- **Web typecheck is `npx tsc -b` from `apps/web`,** or `pnpm --filter @project/web typecheck`.
- **Baseline:** 1,935 tests green across the five packages at `1a82335`, typecheck green. A task that ends with fewer passing tests than it started with has broken something.
- **Turbo caches a stale success.** When a test run looks suspiciously instant, re-run with `--force` or run the package's vitest directly.
- **Commit after every task.** Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File Structure

**Created:**
- `packages/engine/src/rules/itemProficiency.ts` — the two derivations and the weapon match predicate. Pure, no pack dependency, no I/O.
- `packages/engine/src/rules/__tests__/itemProficiency.test.ts` — unit tests for the derivations.

**Modified — engine:**
- `packages/engine/src/rules/equipmentProjection.ts` — `WeaponView` gains `categoryTags`.
- `packages/engine/src/calculators/combat.ts:549-553` — inline predicate becomes a call.
- `packages/engine/src/rules/__tests__/proficiencyRosterDrift.test.ts` — two new cases.
- `packages/engine/src/calculators/__tests__/combat.test.ts` — real ids, plus the pack-driven acceptance test.
- `packages/engine/src/calculators/__tests__/criticalDamage.test.ts`, `packages/engine/src/pipeline/__tests__/weaponSynthesizer.test.ts`, `packages/engine/src/pipeline/__tests__/actionResolver.test.ts` — literals gain `categoryTags`.

**Modified — database:**
- `packages/database/scripts/patchPackSegment.ts` — two new patch capabilities.
- `packages/database/data/packs/core_2014_pack/classes/*.json`, `races/dwarf.json`, `races/elf.json`, `traits/unimplemented.json` — the data.

**Modified — web:**
- `apps/web/src/store/characterSheetStore.ts` — `getProficiencyGrants()` added, `proficiencies` removed.
- `apps/web/src/hooks/useCombat.ts`, `apps/web/src/hooks/useCharacterStats.ts`, `apps/web/src/components/sheet/TraitWidget.tsx`, `apps/web/src/pages/characterSheetRouteData.ts`.

**Modified — docs:**
- `docs/TODO_BACKLOG.md`, and the spec's Status line.

---

## Task 1: `WeaponView` carries `categoryTags`

**Files:**
- Modify: `packages/engine/src/rules/equipmentProjection.ts:23-38`
- Modify: `packages/engine/src/calculators/__tests__/combat.test.ts:8-19`
- Modify: `packages/engine/src/calculators/__tests__/criticalDamage.test.ts:6-20`
- Modify: `packages/engine/src/pipeline/__tests__/weaponSynthesizer.test.ts` (10 literals)
- Modify: `packages/engine/src/pipeline/__tests__/actionResolver.test.ts:68, 1846`

**Interfaces:**
- Consumes: nothing.
- Produces: `WeaponView` now has `categoryTags: StartingEquipmentCategoryTag[]`, required. Tasks 2, 3, 5 and 10 all rely on it.

This task changes no behaviour. Its whole content is a type widening and the fallout, and the fallout is the point: the twelve hand-built literals are where invented data let the bug live. It comes first because Task 2's module reads `weapon.categoryTags` and cannot compile until the field exists.

- [ ] **Step 1: Widen the projection**

In `packages/engine/src/rules/equipmentProjection.ts`, change the type and the projection:

```ts
export type WeaponView = Pick<
  EquipmentDefinition,
  "id" | "name" | "categoryTags"
> &
  WeaponCapability;

export const toWeaponDefinition = (
  equipment: EquipmentDefinition,
): WeaponView | undefined => {
  if (!equipment.weapon) {
    return undefined;
  }

  return {
    id: equipment.id,
    name: equipment.name,
    // carried so itemProficiency.ts can decide whether a grant covers this
    // weapon without reaching back to the equipment entry
    categoryTags: equipment.categoryTags,
    ...equipment.weapon,
  };
};
```

- [ ] **Step 2: Run the engine typecheck to enumerate the fallout**

Run: `pnpm --filter @project/engine typecheck`
Expected: FAIL, roughly fourteen errors of the form `Property 'categoryTags' is missing in type ... but required in type 'WeaponView'`. Write the list down; it is your worklist for the next step.

- [ ] **Step 3: Give every literal the tags its weapon really has**

Use the real tags for the real weapon each literal names. The pack's six weapon tags are `category_weapon_simple`, `category_weapon_simple_melee`, `category_weapon_simple_ranged`, `category_weapon_martial`, `category_weapon_martial_melee`, `category_weapon_martial_ranged`, and every weapon carries exactly two: the class tag and the class-and-range tag.

In `packages/engine/src/calculators/__tests__/combat.test.ts`, the factory becomes:

```ts
const makeWeapon = (overrides: Partial<WeaponView> = {}): WeaponView => ({
  id: "item_weapon_shortsword",
  name: "Shortsword",
  categoryTags: ["category_weapon_martial", "category_weapon_martial_melee"],
  category: "martial_melee",
  damageDice: "1d6",
  damageType: "piercing",
  properties: [],
  range: 5,
  ...overrides,
});
```

In `packages/engine/src/calculators/__tests__/criticalDamage.test.ts`, apply the same changes to its `makeWeapon` factory: prefix the `id` with `item_`, and add a `categoryTags` line matching its `category`.

In `packages/engine/src/pipeline/__tests__/weaponSynthesizer.test.ts` and `packages/engine/src/pipeline/__tests__/actionResolver.test.ts`, add a `categoryTags` line to each literal matching its own `category` field: a `simple_melee` weapon gets `["category_weapon_simple", "category_weapon_simple_melee"]`, a `martial_ranged` weapon gets `["category_weapon_martial", "category_weapon_martial_ranged"]`, and so on. Leave the `id` fields in those two files alone — they are not proficiency-relevant and changing them would churn unrelated assertions.

- [ ] **Step 4: Typecheck and run the whole engine suite**

Run: `pnpm --filter @project/engine typecheck && pnpm --filter @project/engine test`
Expected: typecheck clean, every test still passing. No assertion should have changed.

- [ ] **Step 5: Check line endings and commit**

```bash
file packages/engine/src/rules/equipmentProjection.ts packages/engine/src/calculators/__tests__/combat.test.ts packages/engine/src/calculators/__tests__/criticalDamage.test.ts packages/engine/src/pipeline/__tests__/weaponSynthesizer.test.ts packages/engine/src/pipeline/__tests__/actionResolver.test.ts
git add packages/engine/src/rules/equipmentProjection.ts packages/engine/src/calculators/__tests__ packages/engine/src/pipeline/__tests__
git commit -m "refactor(engine): the weapon view carries its category tags

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: The derivations and the predicate

**Files:**
- Create: `packages/engine/src/rules/itemProficiency.ts`
- Create: `packages/engine/src/rules/__tests__/itemProficiency.test.ts`
- Modify: `packages/engine/src/index.ts`

**Interfaces:**
- Consumes: `WeaponView` with `categoryTags` from Task 1; `EquipmentDefinition` and `FixedProficiencyGrant` from `@project/shared`.
- Produces: `weaponProficiencyIds(weapon: WeaponView): string[]`, `armorProficiencyIds(item: EquipmentDefinition): string[]`, `isProficientWithWeapon(grants: FixedProficiencyGrant[], weapon: WeaponView): boolean`. Tasks 3, 5 and 10 all import these from `@project/engine`.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/rules/__tests__/itemProficiency.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { EquipmentDefinition } from "@project/shared";
import {
  armorProficiencyIds,
  isProficientWithWeapon,
  weaponProficiencyIds,
} from "../itemProficiency.js";

const armor = (
  overrides: Partial<EquipmentDefinition> = {},
): EquipmentDefinition =>
  ({
    id: "item_armor_plate",
    name: "Plate",
    type: "armor",
    weight: 65,
    armorCategory: "heavy",
    equipSlot: "body",
    requiresAttunement: false,
    categoryTags: [],
    ...overrides,
  }) as EquipmentDefinition;

describe("armorProficiencyIds", () => {
  it("names the item and its armour category", () => {
    expect(armorProficiencyIds(armor())).toEqual([
      "item_armor_plate",
      "category_armor_heavy",
    ]);
  });

  it("names a shield by its tag, which carries no armour category", () => {
    expect(
      armorProficiencyIds(
        armor({
          id: "item_armor_shield",
          name: "Shield",
          armorCategory: undefined,
          categoryTags: ["category_armor_shield"],
        }),
      ),
    ).toEqual(["item_armor_shield", "category_armor_shield"]);
  });

  it("ignores tags from other families", () => {
    expect(
      armorProficiencyIds(
        armor({ categoryTags: ["category_pack", "category_armor_shield"] }),
      ),
    ).toEqual([
      "item_armor_plate",
      "category_armor_heavy",
      "category_armor_shield",
    ]);
  });
});

describe("weaponProficiencyIds", () => {
  it("names the item and every category tag it carries", () => {
    expect(
      weaponProficiencyIds({
        id: "item_weapon_greataxe",
        name: "Greataxe",
        categoryTags: ["category_weapon_martial", "category_weapon_martial_melee"],
        category: "martial_melee",
        damageDice: "1d12",
        damageType: "slashing",
        properties: ["heavy", "two_handed"],
        range: 5,
      }),
    ).toEqual([
      "item_weapon_greataxe",
      "category_weapon_martial",
      "category_weapon_martial_melee",
    ]);
  });
});

describe("isProficientWithWeapon", () => {
  const greataxe = {
    id: "item_weapon_greataxe",
    name: "Greataxe",
    categoryTags: [
      "category_weapon_martial",
      "category_weapon_martial_melee",
    ] as EquipmentDefinition["categoryTags"],
    category: "martial_melee" as const,
    damageDice: "1d12",
    damageType: "slashing" as const,
    properties: ["heavy" as const, "two_handed" as const],
    range: 5,
  };

  it("accepts a category grant", () => {
    expect(
      isProficientWithWeapon(
        [
          {
            category: "weapons",
            proficiencyId: "category_weapon_martial",
            level: "proficient",
            requiredStates: [],
          },
        ],
        greataxe,
      ),
    ).toBe(true);
  });

  it("accepts a grant naming the item itself", () => {
    expect(
      isProficientWithWeapon(
        [
          {
            category: "weapons",
            proficiencyId: "item_weapon_greataxe",
            level: "proficient",
            requiredStates: [],
          },
        ],
        greataxe,
      ),
    ).toBe(true);
  });

  it("rejects the same id under a different proficiency category", () => {
    expect(
      isProficientWithWeapon(
        [
          {
            category: "armor",
            proficiencyId: "category_weapon_martial",
            level: "proficient",
            requiredStates: [],
          },
        ],
        greataxe,
      ),
    ).toBe(false);
  });

  it("rejects the weapon's mechanical category, which is not a proficiency id", () => {
    expect(
      isProficientWithWeapon(
        [
          {
            category: "weapons",
            proficiencyId: "martial_melee",
            level: "proficient",
            requiredStates: [],
          },
        ],
        greataxe,
      ),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @project/engine test src/rules/__tests__/itemProficiency.test.ts`
Expected: FAIL — `Failed to resolve import "../itemProficiency.js"`.

- [ ] **Step 3: Write the implementation**

Create `packages/engine/src/rules/itemProficiency.ts`:

```ts
import type { EquipmentDefinition, FixedProficiencyGrant } from "@project/shared";
import type { WeaponView } from "./equipmentProjection.js";

/**
 * Which proficiency ids cover this item.
 *
 * An item names its own proficiencies. There is no second vocabulary to keep
 * in sync with the catalogue, because the vocabulary *is* the catalogue: a
 * grant is legal exactly when some item answers to it, which is what
 * proficiencyRosterDrift.test.ts asserts over the shipped pack.
 *
 * This is the reason the whole category was dead before. The calculator used
 * to match a grant against `weapon.category` ("martial_melee") or the item id,
 * while the pack authored "martial_weapons" and ten `weapon_*` ids. Zero of
 * the twelve matched anything, and nothing anywhere said so.
 */
export const weaponProficiencyIds = (weapon: WeaponView): string[] => [
  weapon.id,
  ...weapon.categoryTags,
];

/**
 * The armour equivalent.
 *
 * Armour carries its category in `armorCategory` rather than in a tag, except
 * the shield, which has no category and is tagged instead. Both shapes are
 * flattened to one `category_armor_*` family so a grant reads the same either
 * way, which is what closes the `light_armor` / `armor_light` split the pack
 * shipped with.
 *
 * Nothing in the runtime reads armour proficiency - no calculator applies the
 * 5e penalty for wearing armour you are not proficient with. The reader this
 * function exists for is the drift guard, and that is a real reader: it is
 * what stops the split reopening. Do not delete this as dead code.
 */
export const armorProficiencyIds = (item: EquipmentDefinition): string[] => [
  ...new Set([
    item.id,
    ...(item.armorCategory ? [`category_armor_${item.armorCategory}`] : []),
    ...item.categoryTags.filter((tag) => tag.startsWith("category_armor_")),
  ]),
];

/**
 * Whether any of these grants covers this weapon.
 * @param grants Every proficiency the character holds, in every category.
 * @param weapon The weapon being swung.
 * @returns True when a `weapons` grant names an id this weapon answers to.
 */
export const isProficientWithWeapon = (
  grants: FixedProficiencyGrant[],
  weapon: WeaponView,
): boolean => {
  const ids = weaponProficiencyIds(weapon);

  return grants.some(
    (grant) => grant.category === "weapons" && ids.includes(grant.proficiencyId),
  );
};
```

- [ ] **Step 4: Export it from the barrel**

In `packages/engine/src/index.ts`, add a line after `export * from "./rules/equipmentProjection.js";`:

```ts
export * from "./rules/itemProficiency.js";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @project/engine test src/rules/__tests__/itemProficiency.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @project/engine typecheck`
Expected: clean. If `categoryTags` is rejected as an unknown property on the weapon literals, Task 1 was skipped — do it first and return here.

- [ ] **Step 7: Check line endings and commit**

```bash
file packages/engine/src/rules/itemProficiency.ts packages/engine/src/rules/__tests__/itemProficiency.test.ts packages/engine/src/index.ts
git add packages/engine/src/rules/itemProficiency.ts packages/engine/src/rules/__tests__/itemProficiency.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): an item names its own proficiency ids

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

`index.ts` was CRLF or LF before you touched it — restore whichever `file` reported before your edit.

---

## Task 3: `combat.ts` resolves proficiency through the predicate

**Files:**
- Modify: `packages/engine/src/calculators/combat.ts:549-553` and its import block
- Modify: `packages/engine/src/calculators/__tests__/combat.test.ts:33-39, 234-290`

**Interfaces:**
- Consumes: `isProficientWithWeapon` from Task 2, `WeaponView.categoryTags` from Task 1.
- Produces: no new exports. After this task `weapon.category` is no longer a proficiency id anywhere.

- [ ] **Step 1: Rewrite the proficiency tests onto real ids**

In `packages/engine/src/calculators/__tests__/combat.test.ts`, change the `makeProf` default:

```ts
const makeProf = (
  overrides: Partial<FixedProficiencyGrant>,
): FixedProficiencyGrant => ({
  category: "weapons",
  proficiencyId: "category_weapon_martial",
  level: "proficient",
  requiredStates: [],
  ...overrides,
});
```

Then replace the whole `describe("CombatEngine.calculateWeaponAttack - proficiency", ...)` block's first four cases with:

```ts
  it("grants proficiency bonus when a category tag matches", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores(),
      3,
      [makeProf({ proficiencyId: "category_weapon_martial" })],
      [],
    );

    expect(result.isProficient).toBe(true);
    expect(result.attackBonus).toBe(3);
    expect(result.breakdown.attack).toContain("Proficiency (+3)");
  });

  it("grants proficiency bonus when the specific weapon id matches", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({ id: "item_weapon_net" }),
      makeScores(),
      3,
      [makeProf({ proficiencyId: "item_weapon_net" })],
      [],
    );

    expect(result.isProficient).toBe(true);
    expect(result.attackBonus).toBe(3);
  });

  it("does not grant proficiency from a non-weapons category, even with a matching id string", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores(),
      3,
      [makeProf({ category: "armor", proficiencyId: "category_weapon_martial" })],
      [],
    );

    expect(result.isProficient).toBe(false);
    expect(result.attackBonus).toBe(0);
    expect(result.breakdown.attack).not.toContain("Proficiency (+3)");
  });

  it("does not grant proficiency when no proficiency entries match", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({ id: "item_weapon_longsword" }),
      makeScores(),
      3,
      [makeProf({ proficiencyId: "category_weapon_simple" })],
      [],
    );

    expect(result.isProficient).toBe(false);
    expect(result.attackBonus).toBe(0);
  });

  it("does not accept the weapon's mechanical category as a proficiency id", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({ category: "martial_melee" }),
      makeScores(),
      3,
      [makeProf({ proficiencyId: "martial_melee" })],
      [],
    );

    expect(result.isProficient).toBe(false);
    expect(result.attackBonus).toBe(0);
  });
```

The last case is new and is the regression that keeps the old spelling from creeping back.

- [ ] **Step 2: Run the tests to verify the new case fails**

Run: `pnpm --filter @project/engine test src/calculators/__tests__/combat.test.ts`
Expected: FAIL on "does not accept the weapon's mechanical category as a proficiency id" — the current code still matches `weapon.category`, so `isProficient` is `true`. The first four should already pass, because `makeWeapon` now carries real tags and the id branch still works.

- [ ] **Step 3: Replace the inline predicate**

In `packages/engine/src/calculators/combat.ts`, add to the import block near the top:

```ts
import { isProficientWithWeapon } from "../rules/itemProficiency.js";
```

and replace lines 549-553:

```ts
    // 2 - check proficiencies
    const isProficient = proficiencies.some(
      (p) =>
        p.category === "weapons" &&
        (p.proficiencyId === weapon.category || p.proficiencyId === weapon.id),
    );
```

with:

```ts
    // 2 - check proficiencies
    const isProficient = isProficientWithWeapon(proficiencies, weapon);
```

- [ ] **Step 4: Run the engine suite**

Run: `pnpm --filter @project/engine test`
Expected: every test passing, including the new regression case.

- [ ] **Step 5: Check line endings and commit**

```bash
file packages/engine/src/calculators/combat.ts packages/engine/src/calculators/__tests__/combat.test.ts
git add packages/engine/src/calculators/combat.ts packages/engine/src/calculators/__tests__/combat.test.ts
git commit -m "fix(engine): weapon proficiency resolves through the item's own ids

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Respell the twenty grants the pack already has

**Files:**
- Modify: `packages/database/scripts/patchPackSegment.ts`
- Modify: `packages/database/data/packs/core_2014_pack/classes/barbarian.json`
- Modify: `packages/database/data/packs/core_2014_pack/races/dwarf.json`
- Modify: `packages/database/data/packs/core_2014_pack/races/elf.json`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the patch script gains `renameProficiencyIds?: Record<string, Record<string, string>>` — proficiency category, then a table of old id to new id. No later task consumes it.

The fourteen weapon grants live in `trait_barbarian_prof_weapons` (2), `trait_barbarian_mult_prof_weapons` (1), `dwarven_combat_training` (4), `elf_weapon_training` (4) and `drow_weapon_training` (3). The six armour grants live in `trait_barbarian_prof_armor` (3), `trait_barbarian_mult_prof_armor` (1) and `dwarven_armor_training` (2).

- [ ] **Step 1: Add the rename capability to the patch script**

In `packages/database/scripts/patchPackSegment.ts`, extend the `Patch` and `Segment` types and add the pass. The rename is scoped by proficiency category so a value like `shield` can never collide with an id of another kind:

```ts
type ProficiencyHolder = {
  proficiencies?: {
    fixed?: Array<{ category: string; proficiencyId: string }>;
    choices?: Array<{ category: string; options?: string[] }>;
  };
};

type Patch = {
  upsertTraits?: Array<{ id: string } & Record<string, unknown>>;
  deleteTraitIds?: string[];
  /** Class id -> trait ids to strip from every progression row's grants. */
  removeProgressionGrants?: Record<string, string[]>;
  /**
   * Proficiency category -> { old id: new id }. Applied to every trait in the
   * segment, to fixed grants and to choice option lists, and only where the
   * grant's own category matches. Scoped that way because ids are only unique
   * within a category - "shield" is an armour proficiency and could equally be
   * an item id somewhere else.
   */
  renameProficiencyIds?: Record<string, Record<string, string>>;
};
```

and after the `upsertTraits` loop, before the `removeProgressionGrants` loop:

```ts
const renames = patch.renameProficiencyIds ?? {};
let renamed = 0;

for (const trait of (segment.traits ?? []) as Array<ProficiencyHolder>) {
  for (const grant of trait.proficiencies?.fixed ?? []) {
    const next = renames[grant.category]?.[grant.proficiencyId];
    if (next) {
      grant.proficiencyId = next;
      renamed += 1;
    }
  }

  for (const choice of trait.proficiencies?.choices ?? []) {
    const table = renames[choice.category];
    if (!table || !choice.options) continue;
    choice.options = choice.options.map((option) => {
      const next = table[option];
      if (next) renamed += 1;
      return next ?? option;
    });
  }
}

if (Object.keys(renames).length > 0) {
  console.log(`renamed ${renamed} proficiency id(s)`);
}
```

- [ ] **Step 2: Write the patch file**

Write `scratch-rename.json` in your scratchpad directory (not in the repo):

```json
{
  "renameProficiencyIds": {
    "weapons": {
      "simple_weapons": "category_weapon_simple",
      "martial_weapons": "category_weapon_martial",
      "weapon_battleaxe": "item_weapon_battleaxe",
      "weapon_handaxe": "item_weapon_handaxe",
      "weapon_light_hammer": "item_weapon_light_hammer",
      "weapon_warhammer": "item_weapon_warhammer",
      "weapon_longsword": "item_weapon_longsword",
      "weapon_shortsword": "item_weapon_shortsword",
      "weapon_shortbow": "item_weapon_shortbow",
      "weapon_longbow": "item_weapon_longbow",
      "weapon_rapier": "item_weapon_rapier",
      "weapon_crossbow_hand": "item_weapon_crossbow_hand"
    },
    "armor": {
      "light_armor": "category_armor_light",
      "armor_light": "category_armor_light",
      "medium_armor": "category_armor_medium",
      "armor_medium": "category_armor_medium",
      "shield": "category_armor_shield"
    }
  }
}
```

- [ ] **Step 3: Apply it to the three segments**

From `packages/database`:

```bash
npx tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/classes/barbarian.json <scratchpad>/scratch-rename.json
npx tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/races/dwarf.json <scratchpad>/scratch-rename.json
npx tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/races/elf.json <scratchpad>/scratch-rename.json
```

Expected output: `renamed 7`, `renamed 6`, `renamed 7` — twenty in total. If the counts differ, stop and find out why before continuing.

- [ ] **Step 4: Fix the barbarian's skill choice**

The same trait file carries a second defect: `barbarian_starting_skills` has no `chooseAmount`, so the schema default of 1 gives a barbarian one starting skill where the PHB grants two. Write `scratch-barbarian-skills.json` in your scratchpad with the whole trait, `chooseAmount` added:

```json
{
  "upsertTraits": [
    {
      "id": "trait_barbarian_prof_skills",
      "name": "Skill Proficiencies (Barbarian)",
      "lore": { "shortDescription": "placeholder", "fullText": "placeholder" },
      "modifiers": { "fixed": [], "choices": [] },
      "proficiencies": {
        "fixed": [],
        "choices": [
          {
            "id": "barbarian_starting_skills",
            "category": "skills",
            "chooseAmount": 2,
            "options": [
              "animal_handling",
              "athletics",
              "intimidation",
              "nature",
              "perception",
              "survival"
            ],
            "level": "proficient",
            "requiredStates": []
          }
        ]
      },
      "resources": [],
      "triggers": [],
      "diceRules": [],
      "criticalHitModifiers": [],
      "actions": []
    }
  ]
}
```

Apply it:

```bash
npx tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/classes/barbarian.json <scratchpad>/scratch-barbarian-skills.json
```

- [ ] **Step 5: Confirm the pack still assembles and nothing regressed**

```bash
pnpm --filter @project/database test
pnpm --filter @project/engine test
```

Expected: both green. `git diff --stat` should show exactly three pack files changed, and `git diff` should show only `proficiencyId` values and the one added `chooseAmount` line — no reindentation, no line-ending churn. If the diff is the whole file, the patch script was bypassed; revert and redo it.

- [ ] **Step 6: Commit**

```bash
git add packages/database/scripts/patchPackSegment.ts packages/database/data/packs/core_2014_pack
git commit -m "fix(pack): proficiency grants name ids the catalogue answers to

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: The guard

**Files:**
- Modify: `packages/engine/src/rules/__tests__/proficiencyRosterDrift.test.ts`

**Interfaces:**
- Consumes: `weaponProficiencyIds` and `armorProficiencyIds` from Task 2, `corePackEquipment()` from `../../pipeline/__tests__/corePackFixture.js`.
- Produces: nothing importable. From here on, a weapons or armour grant that covers no item in the pack fails a test.

The existing file asserts every grant names an id its category's roster knows, and skips weapons, armour and tools because they have no roster. Weapons and armour now have something better than a roster: the catalogue itself.

- [ ] **Step 1: Add the two cases**

Append to `packages/engine/src/rules/__tests__/proficiencyRosterDrift.test.ts`, and add the imports it needs at the top:

```ts
import { corePackEquipment } from "../../pipeline/__tests__/corePackFixture.js";
import {
  armorProficiencyIds,
  weaponProficiencyIds,
} from "../itemProficiency.js";
```

```ts
/**
 * Weapons and armour have no roster and do not need one: an item names its own
 * proficiency ids, so the legal vocabulary is whatever the catalogue answers
 * to. Asserting coverage rather than membership is deliberately the stronger
 * check - it fails on an id that is spelled plausibly and matches nothing,
 * which is exactly the state the pack shipped in.
 *
 * This derives its verdict from the same helper `combat.ts` matches with, so a
 * grant cannot pass here and fail in play.
 */
describe("weapon and armour grants cover something in the catalogue", () => {
  const traits = Object.values(TRAIT_DICTIONARY);
  const { equipmentById, weaponsById } = corePackEquipment();
  const weapons = Object.values(weaponsById);
  const equipment = Object.values(equipmentById);

  const coversAWeapon = (proficiencyId: string) =>
    weapons.some((weapon) =>
      weaponProficiencyIds(weapon).includes(proficiencyId),
    );

  const coversAnArmor = (proficiencyId: string) =>
    equipment.some((item) => armorProficiencyIds(item).includes(proficiencyId));

  const covers: Record<string, (id: string) => boolean> = {
    weapons: coversAWeapon,
    armor: coversAnArmor,
  };

  it("every fixed weapon or armour grant covers at least one item", () => {
    const uncovered = traits.flatMap((trait) =>
      (trait.proficiencies?.fixed ?? [])
        .filter((grant) => {
          const test = covers[grant.category];
          return test ? !test(grant.proficiencyId) : false;
        })
        .map((grant) => `${trait.id}: ${grant.category}/${grant.proficiencyId}`),
    );

    expect(uncovered).toEqual([]);
  });

  it("every listed weapon or armour choice option covers at least one item", () => {
    const uncovered = traits.flatMap((trait) =>
      (trait.proficiencies?.choices ?? []).flatMap((choice) => {
        const test = covers[choice.category];
        if (!test) return [];

        return (choice.options ?? [])
          .filter((option) => !test(option))
          .map((option) => `${trait.id}/${choice.id}: ${option}`);
      }),
    );

    expect(uncovered).toEqual([]);
  });
});
```

- [ ] **Step 2: Update the file's header comment**

The existing docstring says categories with no roster yet (tools, weapons, armour) are skipped. Change that sentence to:

```
 * Tools and ability checks are skipped: the pack has no tool items, so there
 * is nothing for a tool grant to be checked against. Weapons and armour are
 * covered by the second describe below, which checks coverage against the
 * catalogue instead of membership of a roster.
```

- [ ] **Step 3: Run it and expect green**

Run: `pnpm --filter @project/engine test src/rules/__tests__/proficiencyRosterDrift.test.ts`
Expected: PASS. Task 4 already respelled every grant, so a red result here means Task 4 missed one — read the failure, it names the trait and the id.

- [ ] **Step 4: Sabotage it in both directions**

A guard that has never failed is not known to work. The comparison in `equipmentGaps.test.ts` had a bug on first write that let six mismatches pass, which is why this step is mandatory.

**Sabotage A — an off-vocabulary id must fail.** Temporarily patch the barbarian back to the old spelling:

```bash
cd packages/database
echo '{"renameProficiencyIds":{"weapons":{"category_weapon_simple":"simple_weapons"}}}' > <scratchpad>/sabotage-a.json
npx tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/classes/barbarian.json <scratchpad>/sabotage-a.json
pnpm --filter @project/engine test src/rules/__tests__/proficiencyRosterDrift.test.ts
```

Expected: FAIL, naming `trait_barbarian_prof_weapons: weapons/simple_weapons`. Then reverse it with the opposite rename and confirm green again.

**Sabotage B — a plausible id that covers nothing must fail.** Repeat with `{"weapons":{"category_weapon_simple":"category_weapon_exotic"}}`. Expected: FAIL. Reverse it and confirm green.

Finish with `git diff packages/database` showing no changes. If it shows any, you have not reversed a sabotage.

- [ ] **Step 5: Check line endings and commit**

```bash
file packages/engine/src/rules/__tests__/proficiencyRosterDrift.test.ts
git add packages/engine/src/rules/__tests__/proficiencyRosterDrift.test.ts
git commit -m "test(engine): a proficiency grant must cover something in the catalogue

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Author the class weapon and armour proficiencies

**Files:**
- Modify: `packages/database/scripts/patchPackSegment.ts` (one more capability)
- Modify: `packages/database/data/packs/core_2014_pack/classes/{bard,cleric,druid,fighter,monk,paladin,ranger,rogue,sorcerer,warlock,wizard}.json`
- Modify: `packages/database/data/packs/core_2014_pack/traits/unimplemented.json`

**Interfaces:**
- Consumes: the guard from Task 5, which will judge every trait this task writes.
- Produces: 32 authored traits. No code interface.

Thirty-three stubs exist. Thirty-two are authored; `trait_cleric_mult_prof_weapons` is deleted, because the PHB multiclass table grants a cleric armour and shields and no weapons at all. That deletion also has to remove the id from `cleric.json`'s `multiclassTraitIds`, which the patch script cannot do yet.

The traits move out of `traits/unimplemented.json` and into their class file, following the barbarian, whose proficiency traits live in `classes/barbarian.json`. Most class files have no `traits` array; the script creates one.

- [ ] **Step 1: Add the multiclass-id capability to the patch script**

In `packages/database/scripts/patchPackSegment.ts`, add to `Patch`:

```ts
  /** Class id -> trait ids to strip from that class's multiclassTraitIds. */
  removeMulticlassTraitIds?: Record<string, string[]>;
```

widen `Segment`'s class entry to `{ id: string; progression: Array<{ grants: unknown[] }>; multiclassTraitIds?: string[] }`, and add the pass beside `removeProgressionGrants`:

```ts
for (const [classId, ids] of Object.entries(
  patch.removeMulticlassTraitIds ?? {},
)) {
  const entry = (segment.classes ?? []).find((cls) => cls.id === classId);
  if (!entry) throw new Error(`${segmentPath} has no class '${classId}'`);
  entry.multiclassTraitIds = (entry.multiclassTraitIds ?? []).filter(
    (id) => !ids.includes(id),
  );
}
```

- [ ] **Step 2: Write the authoring driver**

Write `author-proficiencies.mjs` in your scratchpad. It holds the whole table and drives the patch script — the ids below are the deliverable, the driver is just plumbing.

```js
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PACK = "data/packs/core_2014_pack";
const SCRATCH = process.env.SCRATCH ?? ".";

const SIMPLE = "category_weapon_simple";
const MARTIAL = "category_weapon_martial";
const SIMPLE_AND_MARTIAL = [SIMPLE, MARTIAL];
const FINESSE_FOUR = [
  "item_weapon_crossbow_hand",
  "item_weapon_longsword",
  "item_weapon_rapier",
  "item_weapon_shortsword",
];
const ARCANE_FIVE = [
  "item_weapon_dagger",
  "item_weapon_dart",
  "item_weapon_sling",
  "item_weapon_quarterstaff",
  "item_weapon_crossbow_light",
];
const DRUID_TEN = [
  "item_weapon_club",
  "item_weapon_dagger",
  "item_weapon_dart",
  "item_weapon_javelin",
  "item_weapon_mace",
  "item_weapon_quarterstaff",
  "item_weapon_scimitar",
  "item_weapon_sickle",
  "item_weapon_sling",
  "item_weapon_spear",
];
const LIGHT = "category_armor_light";
const MEDIUM = "category_armor_medium";
const HEAVY = "category_armor_heavy";
const SHIELD = "category_armor_shield";

// [trait id, class file, display name, proficiency category, ids, lore]
const TABLE = [
  ["trait_bard_prof_weapons", "bard", "Weapon Proficiency (Bard)", "weapons", [SIMPLE, ...FINESSE_FOUR], "You are proficient with simple weapons, hand crossbows, longswords, rapiers, and shortswords."],
  ["trait_cleric_prof_weapons", "cleric", "Weapon Proficiency (Cleric)", "weapons", [SIMPLE], "You are proficient with all simple weapons."],
  ["trait_druid_prof_weapons", "druid", "Weapon Proficiency (Druid)", "weapons", DRUID_TEN, "You are proficient with clubs, daggers, darts, javelins, maces, quarterstaffs, scimitars, sickles, slings, and spears."],
  ["trait_fighter_prof_weapons", "fighter", "Weapon Proficiency (Fighter)", "weapons", SIMPLE_AND_MARTIAL, "You are proficient with all simple and martial weapons."],
  ["trait_fighter_mult_prof_weapons", "fighter", "Multiclass Weapon Proficiency (Fighter)", "weapons", SIMPLE_AND_MARTIAL, "Multiclassing into fighter grants proficiency with simple and martial weapons."],
  ["trait_monk_prof_weapons", "monk", "Weapon Proficiency (Monk)", "weapons", [SIMPLE, "item_weapon_shortsword"], "You are proficient with simple weapons and shortswords."],
  ["trait_monk_mult_prof_weapons", "monk", "Multiclass Weapon Proficiency (Monk)", "weapons", [SIMPLE, "item_weapon_shortsword"], "Multiclassing into monk grants proficiency with simple weapons and shortswords."],
  ["trait_paladin_prof_weapons", "paladin", "Weapon Proficiency (Paladin)", "weapons", SIMPLE_AND_MARTIAL, "You are proficient with all simple and martial weapons."],
  ["trait_paladin_mult_prof_weapons", "paladin", "Multiclass Weapon Proficiency (Paladin)", "weapons", SIMPLE_AND_MARTIAL, "Multiclassing into paladin grants proficiency with simple and martial weapons."],
  ["trait_ranger_prof_weapons", "ranger", "Weapon Proficiency (Ranger)", "weapons", SIMPLE_AND_MARTIAL, "You are proficient with all simple and martial weapons."],
  ["trait_ranger_mult_prof_weapons", "ranger", "Multiclass Weapon Proficiency (Ranger)", "weapons", SIMPLE_AND_MARTIAL, "Multiclassing into ranger grants proficiency with simple and martial weapons."],
  ["trait_rogue_prof_weapons", "rogue", "Weapon Proficiency (Rogue)", "weapons", [SIMPLE, ...FINESSE_FOUR], "You are proficient with simple weapons, hand crossbows, longswords, rapiers, and shortswords."],
  ["trait_sorcerer_prof_weapons", "sorcerer", "Weapon Proficiency (Sorcerer)", "weapons", ARCANE_FIVE, "You are proficient with daggers, darts, slings, quarterstaffs, and light crossbows."],
  ["trait_warlock_prof_weapons", "warlock", "Weapon Proficiency (Warlock)", "weapons", [SIMPLE], "You are proficient with all simple weapons."],
  ["trait_warlock_mult_prof_weapons", "warlock", "Multiclass Weapon Proficiency (Warlock)", "weapons", [SIMPLE], "Multiclassing into warlock grants proficiency with simple weapons."],
  ["trait_wizard_prof_weapons", "wizard", "Weapon Proficiency (Wizard)", "weapons", ARCANE_FIVE, "You are proficient with daggers, darts, slings, quarterstaffs, and light crossbows."],

  ["trait_bard_prof_armor", "bard", "Armor Proficiency (Bard)", "armor", [LIGHT], "You are proficient with light armor."],
  ["trait_bard_prof_mult_armor", "bard", "Multiclass Armor Proficiency (Bard)", "armor", [LIGHT], "Multiclassing into bard grants proficiency with light armor."],
  ["trait_cleric_prof_armor", "cleric", "Armor Proficiency (Cleric)", "armor", [LIGHT, MEDIUM, SHIELD], "You are proficient with light armor, medium armor, and shields."],
  ["trait_cleric_mult_prof_armor", "cleric", "Multiclass Armor Proficiency (Cleric)", "armor", [LIGHT, MEDIUM, SHIELD], "Multiclassing into cleric grants proficiency with light armor, medium armor, and shields."],
  ["trait_druid_prof_armor", "druid", "Armor Proficiency (Druid)", "armor", [LIGHT, MEDIUM, SHIELD], "You are proficient with light armor, medium armor, and shields. Druids will not wear armor or use shields made of metal; that restriction is a table ruling and is not enforced here."],
  ["trait_druid_mult_prof_armor", "druid", "Multiclass Armor Proficiency (Druid)", "armor", [LIGHT, MEDIUM, SHIELD], "Multiclassing into druid grants proficiency with light armor, medium armor, and shields. The non-metal restriction is not enforced here."],
  ["trait_fighter_prof_armor", "fighter", "Armor Proficiency (Fighter)", "armor", [LIGHT, MEDIUM, HEAVY, SHIELD], "You are proficient with all armor and shields."],
  ["trait_fighter_mult_prof_armor", "fighter", "Multiclass Armor Proficiency (Fighter)", "armor", [LIGHT, MEDIUM, SHIELD], "Multiclassing into fighter grants proficiency with light armor, medium armor, and shields."],
  ["trait_paladin_prof_armor", "paladin", "Armor Proficiency (Paladin)", "armor", [LIGHT, MEDIUM, HEAVY, SHIELD], "You are proficient with all armor and shields."],
  ["trait_paladin_mult_prof_armor", "paladin", "Multiclass Armor Proficiency (Paladin)", "armor", [LIGHT, MEDIUM, HEAVY, SHIELD], "Multiclassing into paladin grants proficiency with all armor and shields."],
  ["trait_ranger_prof_armor", "ranger", "Armor Proficiency (Ranger)", "armor", [LIGHT, MEDIUM, SHIELD], "You are proficient with light armor, medium armor, and shields."],
  ["trait_ranger_mult_prof_armor", "ranger", "Multiclass Armor Proficiency (Ranger)", "armor", [LIGHT, MEDIUM, SHIELD], "Multiclassing into ranger grants proficiency with light armor, medium armor, and shields."],
  ["trait_rogue_prof_armor", "rogue", "Armor Proficiency (Rogue)", "armor", [LIGHT], "You are proficient with light armor."],
  ["trait_rogue_mult_prof_armor", "rogue", "Multiclass Armor Proficiency (Rogue)", "armor", [LIGHT], "Multiclassing into rogue grants proficiency with light armor."],
  ["trait_warlock_prof_armor", "warlock", "Armor Proficiency (Warlock)", "armor", [LIGHT], "You are proficient with light armor."],
  ["trait_warlock_mult_prof_armor", "warlock", "Multiclass Armor Proficiency (Warlock)", "armor", [LIGHT], "Multiclassing into warlock grants proficiency with light armor."],
];

const trait = ([id, , name, category, ids, lore]) => ({
  id,
  name,
  lore: { shortDescription: lore, fullText: lore },
  modifiers: { fixed: [], choices: [] },
  proficiencies: {
    fixed: ids.map((proficiencyId) => ({
      category,
      proficiencyId,
      level: "proficient",
      requiredStates: [],
    })),
    choices: [],
  },
  resources: [],
  triggers: [],
  diceRules: [],
  criticalHitModifiers: [],
  actions: [],
});

const run = (segment, patch, label) => {
  const file = path.join(SCRATCH, `patch-${label}.json`);
  fs.writeFileSync(file, JSON.stringify(patch, null, 2));
  execFileSync("npx", ["tsx", "scripts/patchPackSegment.ts", segment, file], {
    stdio: "inherit",
  });
};

const byClass = {};
for (const row of TABLE) (byClass[row[1]] ??= []).push(trait(row));

for (const [cls, traits] of Object.entries(byClass)) {
  run(`${PACK}/classes/${cls}.json`, { upsertTraits: traits }, cls);
}

run(
  `${PACK}/traits/unimplemented.json`,
  { deleteTraitIds: [...TABLE.map((row) => row[0]), "trait_cleric_mult_prof_weapons"] },
  "unimplemented",
);

run(
  `${PACK}/classes/cleric.json`,
  { removeMulticlassTraitIds: { class_cleric: ["trait_cleric_mult_prof_weapons"] } },
  "cleric-multiclass",
);
```

Note `trait_bard_prof_mult_armor` — the bard's multiclass armour stub is spelled `prof_mult`, not `mult_prof`, unlike every other class. Copy it exactly as written above.

- [ ] **Step 3: Run the driver**

From `packages/database`:

```bash
SCRATCH=<scratchpad> node <scratchpad>/author-proficiencies.mjs
```

Confirm the class id in the last call matches the pack — if the script throws `has no class 'class_cleric'`, read the id out of `cleric.json` and correct it.

- [ ] **Step 4: Verify the counts**

```bash
git diff --stat packages/database/data
```

Expected: twelve pack files changed — eleven class files plus `traits/unimplemented.json`. `unimplemented.json` should have lost 33 traits (336 → 303).

- [ ] **Step 5: Run the full suite**

```bash
pnpm --filter @project/database test
pnpm --filter @project/engine test
```

Expected: green. Three guards are doing real work here and any of them may catch a mistake:
- `proficiencyRosterDrift.test.ts` (Task 5) rejects an id that covers no item — a typo in a `item_weapon_*` id lands here.
- `implementationMarkers.test.ts` cross-checks stub markers against reality — a trait left with an `implementation` block but real rules lands here.
- `traitReachability.test.ts` rejects a trait id referenced by a class but defined nowhere — a missed `deleteTraitIds` or a broken multiclass reference lands here.

Read the failure before changing anything; each names the offending id.

- [ ] **Step 6: Commit**

```bash
git add packages/database/scripts/patchPackSegment.ts packages/database/data/packs/core_2014_pack
git commit -m "feat(pack): every class declares the weapons and armour it is proficient with

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: The store computes proficiency grants from traits

**Files:**
- Modify: `apps/web/src/store/characterSheetStore.ts` (the state interface near line 698, the `getActiveTraits` action near line 1321, the import block)
- Modify: `apps/web/src/store/__tests__/characterSheetStore.test.ts`

**Interfaces:**
- Consumes: `ProficiencyExtractor` and `CharacterBootstrapper` from `@project/engine`, and the module-local `toCharacterSave` helper already used by `getActiveTraits`.
- Produces: `getProficiencyGrants: () => FixedProficiencyGrant[]` on the store. Tasks 8 and 9 call it.

The store declares `proficiencies: Record<string, ProficiencyLevel>` and initialises it to `{}`. Nothing ever writes to it: the API payload is a spread of the `characters` row and that table has no such column. This task adds the real source beside it; Task 9 removes the dead one.

- [ ] **Step 1: Write the failing test**

Add a new describe to `apps/web/src/store/__tests__/characterSheetStore.test.ts`. The file drives the real store through `useCharacterSheetStore.setState`, with `packRuleSnapshot()` from `./packFixture` supplying the whole shipped pack — which is what lets a bare `classLevels` entry compile into real traits, because `compileActiveTraits` resolves a class's `startingProficiencyTraitIds` for you.

```ts
describe("useCharacterSheetStore proficiency grants", () => {
  beforeEach(() => {
    const baseState = useCharacterSheetStore.getState();

    useCharacterSheetStore.setState({
      ...baseState,
      id: "char_prof",
      campaignId: null,
      level: 1,
      classLevels: { class_barbarian: 1 },
      subclassIds: {},
      raceId: "race_human",
      subraceId: null,
      currentHp: 12,
      maxHp: 12,
      baseHpRolled: 12,
      baseScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      traits: [],
      traitGrants: [],
      inventory: [],
      activeModifiers: [],
      resources: [],
      ruleSnapshot: packRuleSnapshot(),
      activeStates: [],
    });
  });

  it("derives proficiency grants from the character's active traits", () => {
    // a level 1 barbarian: trait_barbarian_prof_weapons grants both weapon
    // categories, trait_barbarian_prof_armor grants light, medium and shields,
    // trait_barbarian_prof_saving_throw grants STR and CON
    const grants = useCharacterSheetStore.getState().getProficiencyGrants();
    const idsIn = (category: string) =>
      grants
        .filter((grant) => grant.category === category)
        .map((grant) => grant.proficiencyId);

    expect(idsIn("weapons")).toEqual(
      expect.arrayContaining([
        "category_weapon_simple",
        "category_weapon_martial",
      ]),
    );
    expect(idsIn("armor")).toEqual(
      expect.arrayContaining(["category_armor_shield"]),
    );
    expect(idsIn("saving_throws")).toEqual(
      expect.arrayContaining(["STR", "CON"]),
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @project/web test src/store/__tests__/characterSheetStore.test.ts`
Expected: FAIL — `getProficiencyGrants is not a function`.

- [ ] **Step 3: Add the selector**

In the import block from `@project/engine`, add `ProficiencyExtractor` (it is re-exported through `pipeline/index.ts`). In the imports from `@project/shared`, add `type FixedProficiencyGrant`.

Add to the state interface, beside `getActiveTraits: () => TraitDefinition[];`:

```ts
  /**
   * Every proficiency the character's traits grant, choice blocks resolved.
   *
   * The same call characterEngine.ts makes. The store used to keep a flat
   * `proficiencies` record instead, hydrated from an API field that does not
   * exist - the characters table has no such column - so it was `{}` for every
   * character and no skill, save or attack ever gained a proficiency bonus.
   */
  getProficiencyGrants: () => FixedProficiencyGrant[];
```

And the implementation, beside `getActiveTraits`:

```ts
    getProficiencyGrants: () => {
      const state = get();
      const save = toCharacterSave(state);

      return ProficiencyExtractor.extractProficiencies(
        CharacterBootstrapper.compileActiveTraits(
          save,
          state.ruleSnapshot ?? undefined,
        ),
        CharacterBootstrapper.resolveSelections(save),
      );
    },
```

`compileActiveTraits` is called directly rather than through `get().getActiveTraits()` so both halves read from the same `save` object.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @project/web test src/store/__tests__/characterSheetStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm --filter @project/web typecheck
file apps/web/src/store/characterSheetStore.ts apps/web/src/store/__tests__/characterSheetStore.test.ts
git add apps/web/src/store/characterSheetStore.ts apps/web/src/store/__tests__/characterSheetStore.test.ts
git commit -m "feat(web): the store derives proficiency grants from traits

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: `useCombat` reads the grants

**Files:**
- Modify: `apps/web/src/hooks/useCombat.ts:26, 86-102, 200-215`
- Modify: `apps/web/src/hooks/__tests__/useCombat.test.ts`

**Interfaces:**
- Consumes: `getProficiencyGrants()` from Task 7.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

This file mocks the store wholesale with a `mockStoreState` object rather than driving the real one, so the change is to that object. In the `mockStoreState` type declaration at line 17, replace

```ts
  proficiencies: Record<string, string>;
```

with

```ts
  getProficiencyGrants: () => FixedProficiencyGrant[];
```

importing `type FixedProficiencyGrant` from `@project/shared`, and in the `beforeEach` replace `proficiencies: {},` with `getProficiencyGrants: () => [],`. Add a helper beside the other module-level helpers:

```ts
const weaponGrant = (proficiencyId: string): FixedProficiencyGrant => ({
  category: "weapons",
  proficiencyId,
  level: "proficient",
  requiredStates: [],
});
```

Then add the new test:

```ts
  it("adds the proficiency bonus to a weapon a grant covers", () => {
    mockStoreState.inventory = [
      {
        id: "inv_axe",
        itemId: "item_weapon_greataxe",
        quantity: 1,
        slot: "main_hand",
        isAttuned: false,
      },
    ];
    mockStoreState.getProficiencyGrants = () => [
      weaponGrant("category_weapon_martial"),
    ];

    const { attacks } = useCombat();

    expect(attacks[0].isProficient).toBe(true);
    expect(attacks[0].breakdown.attack).toContain("Proficiency (+2)");
  });
```

Seven existing tests in this file also set the record, at lines 92, 120, 152, 192, 252, 335 and 396. Convert each one in the same pass — leaving them would be a type error, and they are carrying the invented spellings this branch exists to delete:

```ts
mockStoreState.proficiencies = { martial_melee: "proficient" };
// becomes
mockStoreState.getProficiencyGrants = () => [weaponGrant("category_weapon_martial")];

mockStoreState.proficiencies = { simple_melee: "proficient" };
// becomes
mockStoreState.getProficiencyGrants = () => [weaponGrant("category_weapon_simple")];
```

Their assertions (`attackBonus` of 5 for a longsword at STR 16 with a +2 bonus, and so on) must not change. If one of them goes red after the hook is repointed, the weapon it uses is not covered by the category you gave it — check the weapon's real `categoryTags` in `equipment/weapons.json` rather than relaxing the assertion.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @project/web test src/hooks/__tests__/useCombat.test.ts`
Expected: FAIL. The hook still reads `state.proficiencies`, which no longer exists on the mock, so the failure is a `TypeError: Cannot read properties of undefined` from inside the record translation rather than a clean assertion failure. That is the right failure — it names the code Step 3 deletes.

- [ ] **Step 3: Repoint the hook**

Replace the subscription at line 26:

```ts
  const proficiencies = useCharacterSheetStore((state) => state.proficiencies);
```

with:

```ts
  const getProficiencyGrants = useCharacterSheetStore(
    (state) => state.getProficiencyGrants,
  );
```

Inside the `useMemo`, before the `equippedHands.reduce`, add:

```ts
    // every weapons grant the character holds; the engine decides per weapon
    // whether one of them covers it
    const weaponProficiencies = getProficiencyGrants().filter(
      (grant) => grant.category === "weapons",
    );
```

Delete the per-item block that built `weaponProficiencies` from the record (the `// 3 - translate the store's flat proficiency record...` comment and the array expression beneath it, through its `.map(...)`), leaving the `calculateWeaponAttack` call to use the hoisted `weaponProficiencies`. Renumber the remaining step comments so `// 4 - scope modifiers to this weapon` becomes `// 3` and so on.

In the dependency array at the end, replace `proficiencies` with `getProficiencyGrants`.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @project/web test src/hooks/__tests__/useCombat.test.ts`
Expected: PASS, and every pre-existing test in the file still passing.

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm --filter @project/web typecheck
file apps/web/src/hooks/useCombat.ts apps/web/src/hooks/__tests__/useCombat.test.ts
git add apps/web/src/hooks/useCombat.ts apps/web/src/hooks/__tests__/useCombat.test.ts
git commit -m "fix(web): attacks read the proficiencies the character actually has

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Skills, saves and the widget; delete the dead record

**Files:**
- Modify: `apps/web/src/hooks/useCharacterStats.ts:62, 70-77, 124-142, 170-180`
- Modify: `apps/web/src/components/sheet/TraitWidget.tsx:92, 188-196, 370`
- Modify: `apps/web/src/store/characterSheetStore.ts` (remove `proficiencies`)
- Modify: `apps/web/src/pages/characterSheetRouteData.ts:39, 101`
- Modify: `apps/web/src/hooks/__tests__/useCharacterStats.test.ts`, `apps/web/src/hooks/__tests__/useCombat.test.ts`, `apps/web/src/store/__tests__/characterSheetStore.test.ts` (fixtures that set `proficiencies: {}`)

**Interfaces:**
- Consumes: `getProficiencyGrants()` from Task 7.
- Produces: `CharacterSheetState` no longer has `proficiencies`.

`useCharacterStats` carries two workarounds for the empty record — "every key is a skill" at lines 70-77 and "match the id against an ability name" at lines 124-142. Both go: the grants arrive already carrying their category.

- [ ] **Step 1: Write the failing tests**

This file also mocks the store with a `mockStoreState` object. In its type declaration replace `proficiencies: Record<string, string>;` with `getProficiencyGrants: () => FixedProficiencyGrant[];` (importing the type from `@project/shared`), and in every `beforeEach` replace `proficiencies: {},` with `getProficiencyGrants: () => [],`.

`SaveEngine` is not mocked in this file, so the saving-throw test runs the real calculator. `SkillEngine` **is** mocked, with a stub that returns `{ id: "skill_test", totalModifier: 0 }` and ignores its arguments — so it cannot show a proficiency. Widen that stub just enough to report what it was handed:

```ts
    SkillEngine: {
      calculateSkill: (
        skillId: string,
        _score: number,
        _profBonus: number,
        proficiencies: Array<{ category: string; proficiencyId: string }>,
      ) => ({
        id: skillId,
        totalModifier: 0,
        isProficient: proficiencies.some(
          (grant) =>
            grant.category === "skills" && grant.proficiencyId === skillId,
        ),
      }),
    },
```

That keeps the stub cheap while making the thing under test — whether the grants reach the engine with their category intact — visible. Then add the two tests:

```ts
  it("passes skill grants to the skill engine with their category intact", () => {
    mockStoreState.getProficiencyGrants = () => [
      {
        category: "skills",
        proficiencyId: "athletics",
        level: "proficient",
        requiredStates: [],
      },
    ];

    const { skills } = useDerivedStats();

    expect(skills.find((skill) => skill.id === "athletics")?.isProficient).toBe(
      true,
    );
    expect(skills.find((skill) => skill.id === "stealth")?.isProficient).toBe(
      false,
    );
  });

  it("adds proficiency to a saving throw the class grants", () => {
    mockStoreState.getProficiencyGrants = () => [
      {
        category: "saving_throws",
        proficiencyId: "STR",
        level: "proficient",
        requiredStates: [],
      },
    ];

    const { saves } = useDerivedStats();

    expect(saves.STR.isProficient).toBe(true);
    expect(saves.INT.isProficient).toBe(false);
  });
```

`saves` is a record keyed by ability, not an array — the existing "derives a saving throw for every ability" test in this file asserts on `Object.keys(saves)`.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @project/web test src/hooks/__tests__/useCharacterStats.test.ts`
Expected: FAIL. `useDerivedStats` still calls `Object.entries(proficiencies)` on a field the mock no longer carries, so the failure is a `TypeError` naming that line — the line Step 3 deletes.

- [ ] **Step 3: Repoint `useCharacterStats`**

Replace the subscription at line 62 with:

```ts
  const getProficiencyGrants = useCharacterSheetStore(
    (state) => state.getProficiencyGrants,
  );
```

Inside `useDerivedStats`'s `useMemo`, replace the `skillAndInitiativeProficiencies` expression (lines 70-77) with:

```ts
    const grants = getProficiencyGrants();
    const skillAndInitiativeProficiencies = grants.filter(
      (grant) => grant.category === "skills",
    );
```

and replace the `saveProficiencies` block (lines 124-142, comment included) with:

```ts
    const saveProficiencies = grants.filter(
      (grant) => grant.category === "saving_throws",
    );
```

Update the dependency array at the end: `proficiencies` becomes `getProficiencyGrants`. Remove the now-unused `ABILITY_KEYS` only if nothing else in the file uses it — it is also used to build the save score record, so check before deleting.

- [ ] **Step 4: Repoint `TraitWidget`**

Replace its `proficiencies` subscription at line 92 with the same `getProficiencyGrants` subscription, then in `projectedProficiencyCount` (lines 188-196) replace the base entries:

```ts
  const heldProficiencies = useMemo(() => getProficiencyGrants(), [getProficiencyGrants]);

  const projectedProficiencyCount = useMemo(() => {
    const baseEntries = heldProficiencies.map(
      (grant) => `${grant.category}:${grant.proficiencyId}`,
    );
    const gainedEntries = selectedTraitProficiencyGrants.map(
      (grant) => `${grant.category}:${grant.proficiencyId}`,
    );

    return new Set([...baseEntries, ...gainedEntries]).size;
  }, [heldProficiencies, selectedTraitProficiencyGrants]);
```

and at line 370, `Object.keys(proficiencies).length` becomes `heldProficiencies.length`.

- [ ] **Step 5: Delete the dead record**

In `apps/web/src/store/characterSheetStore.ts`, remove the `proficiencies: Record<string, ProficiencyLevel>;` field from the state interface (with its comment) and the `proficiencies: {}` line from the initial state. Remove the `type ProficiencyLevel` import if nothing else in the file uses it.

In `apps/web/src/pages/characterSheetRouteData.ts`, remove `proficiencies?: Record<string, ProficiencyLevel>;` from the payload type and the `proficiencies: character.proficiencies || {},` line from the `initialize` call. Leave the API response shape alone — the server is not changed by this plan.

Remove every `proficiencies: {}` line from the web test fixtures. The typecheck will list them.

- [ ] **Step 6: Run the web suite and typecheck**

```bash
pnpm --filter @project/web typecheck
pnpm --filter @project/web test
```

Expected: both green, with the two new tests passing.

- [ ] **Step 7: Check line endings and commit**

```bash
file apps/web/src/hooks/useCharacterStats.ts apps/web/src/components/sheet/TraitWidget.tsx apps/web/src/store/characterSheetStore.ts apps/web/src/pages/characterSheetRouteData.ts
git add apps/web/src
git commit -m "fix(web): skills and saves read real proficiency grants

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Prove it end to end, then update the docs

**Files:**
- Modify: `packages/engine/src/calculators/__tests__/combat.test.ts` (one new describe)
- Modify: `docs/TODO_BACKLOG.md`
- Modify: `docs/superpowers/specs/2026-09-19-item-proficiency-resolution-design.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the acceptance test and the closing documentation.

- [ ] **Step 1: Write the pack-driven acceptance test**

Add to `packages/engine/src/calculators/__tests__/combat.test.ts`, with the fixture imports it needs:

```ts
import { corePackEquipment, corePackSnapshot } from "../../pipeline/__tests__/corePackFixture.js";
import { ProficiencyExtractor } from "../../pipeline/proficiencyExtractor.js";
import { isProficientWithWeapon } from "../../rules/itemProficiency.js";

/**
 * The end of the bug this branch exists for. Every id here comes from the
 * shipped pack, so a regression in either the vocabulary or the predicate
 * fails this rather than passing against invented data the way the unit tests
 * above used to.
 */
describe("a class's authored proficiencies reach the attack roll", () => {
  const { weaponsById } = corePackEquipment();
  const traits = corePackSnapshot().traitsById;

  const attackWith = (traitIds: string[], weaponId: string) =>
    CombatEngine.calculateWeaponAttack(
      weaponsById[weaponId],
      makeScores(),
      2,
      ProficiencyExtractor.extractProficiencies(
        traitIds.map((id) => traits[id]),
        {},
      ),
      [],
    );

  it("a barbarian is proficient with a greataxe", () => {
    const result = attackWith(
      ["trait_barbarian_prof_weapons"],
      "item_weapon_greataxe",
    );

    expect(result.isProficient).toBe(true);
    expect(result.breakdown.attack).toContain("Proficiency (+2)");
  });

  it("a wizard is not proficient with a greataxe", () => {
    const result = attackWith(
      ["trait_wizard_prof_weapons"],
      "item_weapon_greataxe",
    );

    expect(result.isProficient).toBe(false);
  });

  it("a wizard is proficient with a quarterstaff, which its trait names outright", () => {
    const result = attackWith(
      ["trait_wizard_prof_weapons"],
      "item_weapon_quarterstaff",
    );

    expect(result.isProficient).toBe(true);
  });

  it("a rogue is proficient with a rapier but not a greatsword", () => {
    expect(
      attackWith(["trait_rogue_prof_weapons"], "item_weapon_rapier").isProficient,
    ).toBe(true);
    expect(
      attackWith(["trait_rogue_prof_weapons"], "item_weapon_greatsword")
        .isProficient,
    ).toBe(false);
  });

  it("every class in the pack is proficient with something it can hold", () => {
    const weapons = Object.values(weaponsById);

    const barren = Object.values(corePackSnapshot().classesById)
      .filter((cls) => {
        const grants = ProficiencyExtractor.extractProficiencies(
          (cls.startingProficiencyTraitIds ?? []).map((id) => traits[id]),
          {},
        );

        return !weapons.some((weapon) =>
          isProficientWithWeapon(grants, weapon),
        );
      })
      .map((cls) => cls.id);

    expect(barren).toEqual([]);
  });
});
```

The sweep is what makes this cover all twelve classes rather than the four named above. It deliberately does not restate the PHB table a second time — Task 6 is the single place that table lives, and a copy here would drift from it. What it asserts is the property that matters: no class ends up proficient with nothing, which is the state eleven of them were in before this branch.

- [ ] **Step 2: Run the whole repo**

```bash
pnpm check:hygiene
pnpm --filter @project/shared test
pnpm --filter @project/engine test
pnpm --filter @project/database test
pnpm --filter @project/server test
pnpm --filter @project/web test
pnpm typecheck
```

Expected: all green, and the total test count above the 1,935 baseline. If turbo reports an instant success, re-run that package's vitest directly.

- [ ] **Step 3: Import the pack**

The pack is the only route rules take to the database, so the data changes are not live until it is imported:

```bash
pnpm --filter @project/database db:import-pack
```

This truncates the reference tables `CASCADE` and reaches character data. Run `pnpm --filter @project/database db:seed:samples` afterwards to restore the ten fixture characters. If the developer database holds anything hand-made, say so and let Lucas decide before running it.

- [ ] **Step 4: Update the backlog**

In `docs/TODO_BACKLOG.md`:

- Add a closed entry recording the dead-grant defect: every weapon proficiency grant in the pack named an id no weapon answered to, the engine tests passed against invented ids, and the guard now derives its legal set from the catalogue.
- Record that the web store's `proficiencies` record was never populated, so no skill, save or attack had ever received a proficiency bonus, and that it is gone.
- Correct the stub counts: the 17 weapon and 16 armour stubs are closed, one (`trait_cleric_mult_prof_weapons`) deleted rather than authored. The remaining proficiency stubs are 18 skills and 9 tools.
- Correct the note in section 4c: `proficiencyDictionary.ts` is still the roster for languages and skills, but weapons and armour now resolve against the catalogue and need no roster.
- Mark #24 (fighting styles) as still open — it is currently marked Resolved and is not; `status_wielding_*` has no emitter. Do not fix it here.

- [ ] **Step 5: Close the spec**

In `docs/superpowers/specs/2026-09-19-item-proficiency-resolution-design.md`, change `Status: designed` to `Status: implemented`, and correct any statement the implementation contradicted. Two are known already:

- The spec says 33 stubs are authored. Thirty-two are; `trait_cleric_mult_prof_weapons` is deleted instead.
- The Testing section promises a table-driven test asserting each class is proficient with what the PHB grants it "and nothing more". What was built is narrower on purpose: four named classes checked precisely, plus a sweep asserting no class is left proficient with nothing. Restating the PHB table in a test would duplicate the one in Task 6 and drift from it. Rewrite the sentence to describe what exists.

- [ ] **Step 6: Check line endings and commit**

```bash
file docs/TODO_BACKLOG.md docs/superpowers/specs/2026-09-19-item-proficiency-resolution-design.md packages/engine/src/calculators/__tests__/combat.test.ts
git add docs packages/engine/src/calculators/__tests__/combat.test.ts
git commit -m "docs: proficiency resolves, and the backlog says what was wrong

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verification checklist

Before the branch is considered done:

- [ ] `pnpm typecheck` clean across all five packages.
- [ ] Test count at or above 1,935, with no test skipped to get there.
- [ ] Both guard sabotages performed and reversed, with `git diff packages/database` clean afterwards.
- [ ] `git diff` on the pack files shows only value changes and added traits — no reindentation, no line-ending churn.
- [ ] `file` reports the original line ending for every file the branch touched.
- [ ] A barbarian's attack breakdown on the running sheet shows `Proficiency (+2)`, and a proficient skill shows its bonus. This is the claim the branch makes; check it through the UI, not only through the tests.
