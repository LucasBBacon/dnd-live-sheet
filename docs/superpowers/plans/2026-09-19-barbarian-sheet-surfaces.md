# Barbarian Sheet Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the six barbarian traits authored in `46f2136` reach the player on the sheet, fix the three defects that commit carries, and close the barbarian burndown in the docs.

**Architecture:** Two decisions `46f2136` makes inline become exported engine helpers, dynamic-attack eligibility (`pipeline/dynamicWeaponAttacks.ts`) and the self-save DC (`calculators/saveDc.ts`), so the server and the sheet call the same code. The sheet then gains four surfaces, each fed by those helpers or by a pure reporter: Frenzied Strike and Retaliation cards in `useCombat`, suspended conditions in `ConditionsWidget` and the Rules panel, a Relentless Rage line and button on the Rules panel, and uses pools in Class Features.

**Tech Stack:** TypeScript monorepo (pnpm + turbo), Zod schemas in `packages/shared`, pure calculators in `packages/engine`, React + zustand in `apps/web`, vitest everywhere.

Spec: `docs/superpowers/specs/2026-09-19-barbarian-sheet-surfaces-design.md`. Read it first; every decision below is settled there.

## Global Constraints

- Branch is `feat/barbarian-traits`, on top of `ad35a57`. Every task ends with a commit whose message ends with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Line endings are per file.** `core.autocrlf=true`, but files are individually LF or CRLF, and `git diff` cannot show a whole-file conversion. The Edit and Write tools emit LF. After editing a CRLF file, normalise it with `node -e "const fs=require('fs');for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/\r?\n/g,'\r\n'))" <file>...` and confirm with `node -e "for(const p of process.argv.slice(1)){const s=require('fs').readFileSync(p,'latin1');const c=(s.match(/\r\n/g)||[]).length;const l=(s.match(/\n/g)||[]).length;console.log((c===0?'LF':l===c?'CRLF':'MIXED')+'  '+p)}" <file>...`. New files are LF.
  - **CRLF:** `packages/engine/src/pipeline/characterEngine.ts`, `packages/engine/src/pipeline/index.ts`, `packages/engine/src/pipeline/actionResolver.ts`, `packages/engine/src/index.ts`, `packages/shared/src/schemas/content/actions.ts`, `apps/web/src/hooks/useCombat.ts`, `apps/web/src/components/sheet/CombatWidget.tsx`, `apps/web/src/store/characterSheetStore.ts`, `apps/web/src/components/sheet/ConditionsWidget.tsx`, `apps/web/src/hooks/useFeatures.ts`, `apps/web/src/components/sheet/FeaturesWidget.tsx`, and the tests `useCombat.test.ts`, `CombatWidget.test.tsx`, `ConditionsWidget.test.tsx`, `characterSheetStore.test.ts`, `characterEngine.test.ts`, `actionResolver.test.ts`, `barbarianPack.test.ts`, `implementationMarkers.test.ts`, plus `docs/TODO_BACKLOG.md`.
  - **LF:** `packages/engine/src/calculators/tableRules.ts`, `apps/web/src/components/sheet/TableRulesWidget.tsx`, `TableRulesWidget.test.tsx`, `tableRules.test.ts`, and everything under `docs/superpowers/`.
- Pack JSON under `packages/database/data/packs/core_2014_pack/` is CRLF with 4-space indentation, and `classes/barbarian.json` has no trailing newline. Edit it only through `pnpm --filter @project/database exec tsx scripts/patchPackSegment.ts <segment.json> <patch.json>`, whose patch is `{ "upsertTraits"?: TraitJson[], "deleteTraitIds"?: string[] }`. An upsert replaces a whole trait in place, or appends it if absent.
- Typecheck with `pnpm --filter @project/shared typecheck`, `pnpm --filter @project/engine typecheck`, `pnpm --filter @project/database typecheck`, `pnpm --filter @project/server typecheck`, and `npx tsc -b` run from `apps/web`. Never run `tsc -b` inside `packages/database`: it emits `.js` beside every source file and fails hygiene. A bare `tsc --noEmit` in `apps/web` checks nothing.
- No Zod schema changes. The two shared additions are type-only, so `pnpm --filter @project/database schemas:generate` must leave no diff.
- Identifiers are contracts, spelled exactly: `action_frenzied_strike`, `action_retaliation`, `action_frenzied_rage`, `action_relentless_rage`, `resource_relentless_rage`, `trait_relentless_rage`, `trait_berserker_frenzy`, `trait_berserker_mindless_rage`, `trait_berserker_intimidating_presence`, `trait_berserker_retaliation`, `subclass_barbarian_berserker`, `status_raging`, `status_frenzied`. Prose uses British spelling but never alters an id.
- Run the single test file each step names, not a whole suite, until the task's final verification step.

---

## File Structure

**Created**

| File | Responsibility |
| --- | --- |
| `packages/engine/src/pipeline/dynamicWeaponAttacks.ts` | `dynamicAttackApplies` and `dynamicAttackId`: which held weapons a `dynamic_weapon_attack` template offers a swing with, and the id that swing carries. |
| `packages/engine/src/calculators/saveDc.ts` | `resolveSelfSaveDc` and `selfSaveCounterId`: a self-save's DC from its rule and the count so far. |
| `packages/engine/src/calculators/relentlessRage.ts` | `RelentlessRageEngine.describe`: when Relentless Rage's save is on offer, at what DC, and the sentence for the panel. |
| `packages/engine/src/pipeline/__tests__/dynamicWeaponAttacks.test.ts` | The eligibility rules and the id format. |
| `packages/engine/src/calculators/__tests__/saveDc.test.ts` | Fixed and escalating DCs. |
| `packages/engine/src/calculators/__tests__/relentlessRage.test.ts` | Availability, DC and summary. |
| `apps/web/src/hooks/__tests__/useFeatures.test.ts` | Charges and uses pools from the hook. |
| `apps/web/src/components/sheet/__tests__/FeaturesWidget.test.tsx` | A uses row without a Use button; a charges row with one. |

**Modified**

| File | Change |
| --- | --- |
| `packages/shared/src/schemas/content/actions.ts` | Type-only exports `DynamicWeaponAttack` and `SaveDcRule`. |
| `packages/engine/src/pipeline/characterEngine.ts` | The gather drops templates; the synthesis loop calls the helpers. |
| `packages/engine/src/pipeline/index.ts`, `packages/engine/src/index.ts` | Export the new modules. |
| `packages/engine/src/pipeline/actionResolver.ts` | `self_save` calls `resolveSelfSaveDc` and `selfSaveCounterId`. |
| `packages/engine/src/calculators/tableRules.ts` | `"suppression"` and `"reporter"` kinds; the `suspendedConditions` input. |
| `apps/web/src/store/characterSheetStore.ts` | `getSuspendedConditions`; `getCharacterActions` drops templates and `self_save` actions. |
| `apps/web/src/hooks/useCombat.ts` | A card per applicable template per held weapon. |
| `apps/web/src/components/sheet/CombatWidget.tsx` | The activation badge learns `reaction`. |
| `apps/web/src/components/sheet/ConditionsWidget.tsx` | Suspended conditions struck through, with their suppressor named. |
| `apps/web/src/components/sheet/TableRulesWidget.tsx` | Suppression lines; the Relentless Rage line and button. |
| `apps/web/src/hooks/useFeatures.ts`, `apps/web/src/components/sheet/FeaturesWidget.tsx` | Uses pools. |
| Pack: `classes/barbarian.json`, `traits/unimplemented.json` | Relentless Rage resets on `short_rest`; the four Berserker traits move to the class file. |
| `packages/database/src/__tests__/barbarianPack.test.ts`, `implementationMarkers.test.ts` | Pack assertions; the stale count comment. |
| `docs/TODO_BACKLOG.md`, the 2026-09-02 plan and spec | The barbarian burndown closed. |

---

### Task 1: Pack corrections: Relentless Rage resets on either rest, and the Berserker traits move beside the class

**Files:**
- Modify (via script): `packages/database/data/packs/core_2014_pack/classes/barbarian.json`, `packages/database/data/packs/core_2014_pack/traits/unimplemented.json`
- Test: `packages/database/src/__tests__/barbarianPack.test.ts` (append)

**Interfaces:**
- Produces: the four Berserker traits authored in `classes/barbarian.json`, content unchanged; `resource_relentless_rage.resetCondition === "short_rest"`.

- [ ] **Step 1: Write the failing pack tests**

Append to `packages/database/src/__tests__/barbarianPack.test.ts`. The file's `findTrait(id)` already reads `classes/barbarian.json` and throws when the id is absent.

```ts
describe("the Berserker traits live beside the class", () => {
  it.each([
    "trait_berserker_frenzy",
    "trait_berserker_mindless_rage",
    "trait_berserker_intimidating_presence",
    "trait_berserker_retaliation",
  ])("%s is authored in the class segment, in engine mode", (id) => {
    expect(findTrait(id).implementation?.mode).toBe("engine");
  });
});

describe("trait_relentless_rage's counter", () => {
  it("resets on either rest, as the DC does", () => {
    // RAW: "When you finish a short or long rest, the DC resets to 10." In
    // this engine a short_rest pool resets on both rests; a long_rest pool
    // only on the long one, which left the DC escalated after a short rest.
    expect(findTrait("trait_relentless_rage").resources).toEqual([
      expect.objectContaining({
        id: "resource_relentless_rage",
        mode: "uses",
        resetCondition: "short_rest",
      }),
    ]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @project/database exec vitest run src/__tests__/barbarianPack.test.ts`
Expected: FAIL. The four Berserker cases throw `trait 'trait_berserker_frenzy' is not authored in the segment` (and likewise for the other three), and the counter case reports `resetCondition: "long_rest"`.

- [ ] **Step 3: Build the two patches from the current files**

Built from the files themselves, so the four moving traits are copied exactly and Relentless Rage changes only where intended. Run from the repo root in Git Bash:

```bash
SCRATCH="$(cygpath -m "$(mktemp -d)")"
node -e "
const fs = require('fs');
const P = 'packages/database/data/packs/core_2014_pack/';
const out = process.argv[1];
const ids = [
  'trait_berserker_frenzy',
  'trait_berserker_mindless_rage',
  'trait_berserker_intimidating_presence',
  'trait_berserker_retaliation',
];
const unimplemented = JSON.parse(fs.readFileSync(P + 'traits/unimplemented.json', 'utf8'));
const moving = ids.map((id) => {
  const trait = unimplemented.traits.find((t) => t.id === id);
  if (trait === undefined) throw new Error(id + ' is not in traits/unimplemented.json');
  return trait;
});
const barbarian = JSON.parse(fs.readFileSync(P + 'classes/barbarian.json', 'utf8'));
const relentless = barbarian.traits.find((t) => t.id === 'trait_relentless_rage');
if (relentless.resources.length !== 1) throw new Error('expected one pool on Relentless Rage');
relentless.resources[0].resetCondition = 'short_rest';
relentless.implementation.summary = 'A self Constitution save with an escalating DC: 10, plus 5 for each use counted by resource_relentless_rage. That pool is uses-mode and resets on short_rest, which in this engine resets on either rest, as RAW resets the DC after a short or long rest. A success reports one point of healing, which the server writes as HP, and the counter increments on every attempt.';
fs.writeFileSync(out + '/barbarian.json', JSON.stringify({ upsertTraits: [...moving, relentless] }, null, 2));
fs.writeFileSync(out + '/unimplemented.json', JSON.stringify({ deleteTraitIds: ids }, null, 2));
console.log('patches written to ' + out);
" "$SCRATCH"
```

- [ ] **Step 4: Apply them**

```bash
pnpm --filter @project/database exec tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/classes/barbarian.json "$SCRATCH/barbarian.json"
pnpm --filter @project/database exec tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/traits/unimplemented.json "$SCRATCH/unimplemented.json"
```

Then check the result:

```bash
git diff --stat packages/database/data/packs
git diff packages/database/data/packs/core_2014_pack/classes/barbarian.json | grep "^-[^-]"
```

Expected: only `classes/barbarian.json` and `traits/unimplemented.json` changed, and the second command prints exactly two removed lines: Relentless Rage's old `summary` and its `"resetCondition": "long_rest"`. Everything else in that file is added (the four traits, appended at the end of `traits`). Confirm the endings:

```bash
node -e "for(const f of ['classes/barbarian.json','traits/unimplemented.json']){const s=require('fs').readFileSync('packages/database/data/packs/core_2014_pack/'+f,'latin1');const c=(s.match(/\r\n/g)||[]).length;const l=(s.match(/\n/g)||[]).length;console.log(f,'bareLF='+(l-c),'trailingNewline='+s.endsWith('\n'))}"
```

Expected: `bareLF=0` for both; `classes/barbarian.json trailingNewline=false`, `traits/unimplemented.json trailingNewline=true`.

- [ ] **Step 5: Run the pack test, then the database suite**

Run: `pnpm --filter @project/database exec vitest run src/__tests__/barbarianPack.test.ts`
Expected: PASS.
Run: `pnpm --filter @project/database test --run`
Expected: PASS, including `traitReachability`, `tableNotes`, `implementationMarkers` (still `441`, since the moved traits already carried rules) and `corePackAssembler`.

- [ ] **Step 6: Commit**

```bash
git add packages/database/data/packs/core_2014_pack packages/database/src/__tests__/barbarianPack.test.ts
git commit -F - <<'EOF'
fix(pack): Relentless Rage resets on either rest, and the Berserker traits sit beside the class

RAW resets Relentless Rage's DC to 10 after a short or long rest. The
counter was authored long_rest, which this engine resets only on a long
rest, so a short rest left the DC escalated. short_rest resets on both.

The four Berserker traits were authored in engine mode but left in
traits/unimplemented.json. They move to classes/barbarian.json, where
the 2026-09-02 design put them, with their content unchanged.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Dynamic attack eligibility as a shared helper, and no bare templates on the server

**Files:**
- Create: `packages/engine/src/pipeline/dynamicWeaponAttacks.ts`
- Modify: `packages/shared/src/schemas/content/actions.ts` (after `DynamicWeaponAttackSchema`, ~line 238)
- Modify: `packages/engine/src/pipeline/index.ts`
- Modify: `packages/engine/src/pipeline/characterEngine.ts` (the gather at ~453-456, the synthesis loop at ~557-584 and its id line at ~632)
- Test: `packages/engine/src/pipeline/__tests__/dynamicWeaponAttacks.test.ts` (create), `packages/engine/src/pipeline/__tests__/characterEngine.test.ts` (append)

**Interfaces:**
- Produces: `type DynamicWeaponAttack = z.infer<typeof DynamicWeaponAttackSchema>` from `@project/shared`; `dynamicAttackApplies(effect: DynamicWeaponAttack, weapon: WeaponView, activeStates: string[]): boolean` and `dynamicAttackId(templateId: string, instanceId: string): string` from `@project/engine`. Task 3 calls both from `useCombat`.

- [ ] **Step 1: Write the failing helper test**

```ts
// packages/engine/src/pipeline/__tests__/dynamicWeaponAttacks.test.ts
import { describe, expect, it } from "vitest";
import type { DynamicWeaponAttack } from "@project/shared";
import { resolveWeaponDefinition } from "../../rules/ruleLookup.js";
import { corePackLookup } from "./corePackFixture.js";
import {
  dynamicAttackApplies,
  dynamicAttackId,
} from "../dynamicWeaponAttacks.js";

const weapon = (itemId: string) => {
  const view = resolveWeaponDefinition(itemId, corePackLookup());
  if (!view) throw new Error(`${itemId} missing from the shipped pack`);
  return view;
};

/** Frenzied Strike's shape: melee weapons only, gated on the frenzy. */
const template = (
  overrides: Partial<DynamicWeaponAttack> = {},
): DynamicWeaponAttack => ({
  type: "dynamic_weapon_attack",
  requiredStates: [],
  forbiddenStates: [],
  requiredWeaponProperties: [],
  requiredWeaponCategory: ["simple_melee", "martial_melee"],
  ...overrides,
});

describe("dynamicAttackApplies", () => {
  it("offers a swing with a melee weapon while the predicate holds", () => {
    expect(
      dynamicAttackApplies(
        template({ requiredStates: ["status_frenzied"] }),
        weapon("item_weapon_greataxe"),
        ["status_frenzied"],
      ),
    ).toBe(true);
  });

  it("refuses while a required state is absent", () => {
    expect(
      dynamicAttackApplies(
        template({ requiredStates: ["status_frenzied"] }),
        weapon("item_weapon_greataxe"),
        [],
      ),
    ).toBe(false);
  });

  it("refuses while a forbidden state is present", () => {
    expect(
      dynamicAttackApplies(
        template({ forbiddenStates: ["status_wearing_heavy_armor"] }),
        weapon("item_weapon_greataxe"),
        ["status_wearing_heavy_armor"],
      ),
    ).toBe(false);
  });

  it("never offers a ranged weapon, whatever the category filter says", () => {
    expect(
      dynamicAttackApplies(
        template({ requiredWeaponCategory: [] }),
        weapon("item_weapon_longbow"),
        [],
      ),
    ).toBe(false);
  });

  it("requires every listed weapon property", () => {
    // the greataxe is heavy and two-handed, and not light
    expect(
      dynamicAttackApplies(
        template({ requiredWeaponProperties: ["light"] }),
        weapon("item_weapon_greataxe"),
        [],
      ),
    ).toBe(false);
    expect(
      dynamicAttackApplies(
        template({ requiredWeaponProperties: ["heavy"] }),
        weapon("item_weapon_greataxe"),
        [],
      ),
    ).toBe(true);
  });

  it("refuses a melee weapon outside the listed categories", () => {
    expect(
      dynamicAttackApplies(
        template({ requiredWeaponCategory: ["simple_melee"] }),
        weapon("item_weapon_greataxe"),
        [],
      ),
    ).toBe(false);
  });

  it("accepts any melee weapon when the category list is empty", () => {
    expect(
      dynamicAttackApplies(
        template({ requiredWeaponCategory: [] }),
        weapon("item_weapon_greataxe"),
        [],
      ),
    ).toBe(true);
  });
});

describe("dynamicAttackId", () => {
  it("joins the template and the inventory row, as the server resolves it", () => {
    expect(dynamicAttackId("action_frenzied_strike", "inv-1")).toBe(
      "action_frenzied_strike:inv-1",
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @project/engine exec vitest run src/pipeline/__tests__/dynamicWeaponAttacks.test.ts`
Expected: FAIL, cannot resolve `../dynamicWeaponAttacks.js` (and `DynamicWeaponAttack` is not exported from `@project/shared`).

- [ ] **Step 3: Export the type**

In `packages/shared/src/schemas/content/actions.ts`, directly after the closing `});` of `DynamicWeaponAttackSchema`:

```ts

export type DynamicWeaponAttack = z.infer<typeof DynamicWeaponAttackSchema>;
```

Normalise the file to CRLF (Global Constraints).

- [ ] **Step 4: Write the helper**

```ts
// packages/engine/src/pipeline/dynamicWeaponAttacks.ts
import type { DynamicWeaponAttack } from "@project/shared";
import type { WeaponView } from "../rules/equipmentProjection.js";

/**
 * Whether a `dynamic_weapon_attack` template offers a swing with this weapon,
 * right now.
 *
 * Frenzied Strike and Retaliation are "a melee weapon attack", which names no
 * weapon: the swing exists once per held weapon that qualifies. The server
 * synthesises those swings in CharacterEngine's weapon loop and the sheet
 * draws their cards in useCombat. Both ask this one function, so the sheet
 * never offers a swing the server will not resolve.
 *
 * Every rule that offers one says "melee weapon attack", so a ranged weapon is
 * never eligible, whatever the category filter says.
 * @param effect The template the trait authored.
 * @param weapon The held weapon being considered.
 * @param activeStates The character's active states.
 * @returns True when the predicate holds and the weapon passes every filter.
 */
export const dynamicAttackApplies = (
  effect: DynamicWeaponAttack,
  weapon: WeaponView,
  activeStates: string[],
): boolean => {
  if (!effect.requiredStates.every((state) => activeStates.includes(state))) {
    return false;
  }
  if (effect.forbiddenStates.some((state) => activeStates.includes(state))) {
    return false;
  }
  if (weapon.category.includes("ranged")) return false;
  if (
    !effect.requiredWeaponProperties.every((property) =>
      weapon.properties.some((weaponProperty) => weaponProperty === property),
    )
  ) {
    return false;
  }

  return (
    effect.requiredWeaponCategory.length === 0 ||
    effect.requiredWeaponCategory.includes(weapon.category)
  );
};

/**
 * The id of the swing a template offers with one inventory row.
 *
 * The server finds the action it resolves by this id in `liveSheet.actions`,
 * and the sheet sends it in ACTION_INTENT, so it is spelled in one place.
 * @param templateId The trait action carrying the template.
 * @param instanceId The inventory row holding the weapon.
 * @returns `${templateId}:${instanceId}`.
 */
export const dynamicAttackId = (templateId: string, instanceId: string): string =>
  `${templateId}:${instanceId}`;
```

In `packages/engine/src/pipeline/index.ts`, directly after the `export * from "./characterEngine.js";` line:

```ts
export * from "./dynamicWeaponAttacks.js";
```

Normalise `pipeline/index.ts` to CRLF.

- [ ] **Step 5: Run the helper test**

Run: `pnpm --filter @project/engine exec vitest run src/pipeline/__tests__/dynamicWeaponAttacks.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Write the failing pipeline test**

Append to `packages/engine/src/pipeline/__tests__/characterEngine.test.ts` (the file already has `halfElfFighter`, `corePackLookup`, `EffectManager`, `ResourceManager` and `CharacterEngine` in scope):

```ts
describe("CharacterEngine.buildLiveSheet: dynamic templates", () => {
  const berserkerAt = (level: number): CharacterSave =>
    halfElfFighter({
      classes: [
        {
          classId: "class_barbarian",
          level,
          subclassId: "subclass_barbarian_berserker",
          selections: {},
        },
      ],
    });

  const longsword = {
    id: "weapon-1",
    itemId: "item_weapon_longsword",
    quantity: 1,
    slot: "main_hand" as const,
    isAttuned: false,
  };

  it("never lists a bare template, which has no weapon behind it to roll", () => {
    // left in, the template showed as a button that spent the bonus action or
    // the reaction and reached the resolver's default case, doing nothing
    const ids = CharacterEngine.buildLiveSheet(
      berserkerAt(14),
      [],
      new EffectManager(),
      new ResourceManager(),
      { snapshot: corePackLookup() },
    ).actions.map((action) => action.id);

    expect(ids).toContain("action_frenzied_rage");
    expect(ids).not.toContain("action_frenzied_strike");
    expect(ids).not.toContain("action_retaliation");
  });

  it("offers Retaliation as a reaction swing with each held melee weapon", () => {
    const swing = CharacterEngine.buildLiveSheet(
      berserkerAt(14),
      [longsword],
      new EffectManager(),
      new ResourceManager(),
      { snapshot: corePackLookup() },
    ).actions.find((action) => action.id === "action_retaliation:weapon-1");

    expect(swing).toMatchObject({
      name: "Retaliation: Longsword",
      activation: "reaction",
    });
  });
});
```

- [ ] **Step 7: Run it and watch it fail**

Run: `pnpm --filter @project/engine exec vitest run src/pipeline/__tests__/characterEngine.test.ts`
Expected: FAIL on the first test: `action_frenzied_strike` and `action_retaliation` are in the list. The second test already passes; it pins behaviour the refactor must keep.

- [ ] **Step 8: Drop the templates and call the helpers**

In `packages/engine/src/pipeline/characterEngine.ts`, add beside the other `./` pipeline imports:

```ts
import {
  dynamicAttackApplies,
  dynamicAttackId,
} from "./dynamicWeaponAttacks.js";
```

Replace the gather:

```ts
    const actions: ActionGrant[] = [
      ...STANDARD_ACTIONS,
      ...activeTraits.flatMap((t) => t.actions || []),
    ];
```

with:

```ts
    const actions: ActionGrant[] = [
      ...STANDARD_ACTIONS,
      // a dynamic_weapon_attack is a template, not a swing: the loop further
      // down turns it into one concrete attack per held weapon it applies to,
      // and the bare template has nothing to roll. Left in, it showed as a
      // button that spent the activation and reached the resolver's default
      // case.
      ...activeTraits.flatMap((t) =>
        (t.actions || []).filter(
          (action) => action.effect.type !== "dynamic_weapon_attack",
        ),
      ),
    ];
```

Replace the head of the synthesis loop:

```ts
    for (const trait of activeTraits) {
      for (const dynamicAction of trait.actions ?? []) {
        if (dynamicAction.effect.type !== "dynamic_weapon_attack") continue;
        const { requiredStates, forbiddenStates } = dynamicAction.effect;
        if (
          !requiredStates.every((state) => activeStates.includes(state)) ||
          forbiddenStates.some((state) => activeStates.includes(state))
        ) {
          continue;
        }

        for (const instance of inventory) {
          if (instance.slot === "backpack") continue;
          const weapon = resolveWeaponDefinition(instance.itemId, options.snapshot);
          if (!weapon || weapon.category.includes("ranged")) continue;
          if (
            !dynamicAction.effect.requiredWeaponProperties.every((property) =>
              weapon.properties.some((weaponProperty) => weaponProperty === property),
            )
          ) {
            continue;
          }
          if (
            dynamicAction.effect.requiredWeaponCategory.length > 0 &&
            !dynamicAction.effect.requiredWeaponCategory.includes(weapon.category)
          ) {
            continue;
          }
```

with:

```ts
    for (const trait of activeTraits) {
      for (const dynamicAction of trait.actions ?? []) {
        if (dynamicAction.effect.type !== "dynamic_weapon_attack") continue;
        const template = dynamicAction.effect;

        for (const instance of inventory) {
          if (instance.slot === "backpack") continue;
          const weapon = resolveWeaponDefinition(instance.itemId, options.snapshot);
          // the same question useCombat asks before it draws the card, so the
          // sheet offers exactly the swings this synthesises
          if (!weapon || !dynamicAttackApplies(template, weapon, activeStates)) {
            continue;
          }
```

and replace

```ts
          generated.id = `${dynamicAction.id}:${instance.id}`;
```

with

```ts
          generated.id = dynamicAttackId(dynamicAction.id, instance.id);
```

Normalise `characterEngine.ts` to CRLF.

- [ ] **Step 9: Run the tests, the engine suite and both typechecks**

Run: `pnpm --filter @project/engine exec vitest run src/pipeline/__tests__/characterEngine.test.ts src/pipeline/__tests__/dynamicWeaponAttacks.test.ts`
Expected: PASS, including the two existing "Berserker dynamic attacks" tests.
Run: `pnpm --filter @project/engine test --run`
Expected: PASS.
Run: `pnpm --filter @project/shared typecheck && pnpm --filter @project/engine typecheck && pnpm --filter @project/server typecheck`
Expected: clean.
Run: `pnpm --filter @project/database schemas:generate && git status --short packages/database/data/schemas`
Expected: no output from `git status`: the export is type-only.

- [ ] **Step 10: Commit**

```bash
git add packages/shared/src/schemas/content/actions.ts packages/engine/src/pipeline/dynamicWeaponAttacks.ts packages/engine/src/pipeline/__tests__/dynamicWeaponAttacks.test.ts packages/engine/src/pipeline/index.ts packages/engine/src/pipeline/characterEngine.ts packages/engine/src/pipeline/__tests__/characterEngine.test.ts
git commit -F - <<'EOF'
fix(engine): dynamic attack eligibility is one helper, and bare templates leave the action list

The weapon loop's eligibility checks move to dynamicAttackApplies, and
the id format to dynamicAttackId, so the sheet can ask the same
question the server does before it draws a card.

The templates themselves no longer reach liveSheet.actions. They had
nothing to roll: pressing one spent the bonus action or the reaction
and reached the resolver's default case.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Frenzied Strike and Retaliation cards on the sheet

**Files:**
- Modify: `apps/web/src/hooks/useCombat.ts`
- Modify: `apps/web/src/store/characterSheetStore.ts` (`getCharacterActions`, ~line 1245)
- Modify: `apps/web/src/components/sheet/CombatWidget.tsx` (the activation badge, ~lines 519-538)
- Test: `apps/web/src/hooks/__tests__/useCombat.test.ts`, `apps/web/src/components/sheet/__tests__/CombatWidget.test.tsx`, `apps/web/src/store/__tests__/characterSheetStore.test.ts` (append to each)

**Interfaces:**
- Consumes: `dynamicAttackApplies`, `dynamicAttackId` (Task 2); the store's `getActiveTraits` and `subclassIds`.
- Produces: attack cards with `actionId` `${template.id}:${item.id}`, `name` `${template.name}: ${weapon.name}` and the template's `activation`; `getCharacterActions` without `dynamic_weapon_attack` templates (Task 7 extends the same filter).

- [ ] **Step 1: Write the failing hook tests**

In `apps/web/src/hooks/__tests__/useCombat.test.ts`:

1. Add two fields to the `mockStoreState` type, after `activeStates: string[];`:

```ts
  getActiveTraits: () => unknown[];
  subclassIds: Record<string, string | null>;
```

2. In the top-level `beforeEach`, add to the object assigned to `mockStoreState`:

```ts
      getActiveTraits: () => [],
      subclassIds: {},
```

3. Append:

```ts
describe("useCombat and dynamic weapon attacks", () => {
  const packTrait = (id: string) => {
    const trait = packRuleSnapshot().traitsById?.[id];
    if (!trait) throw new Error(`${id} missing from the shipped pack`);
    return trait;
  };

  const hold = (itemId: string) => {
    mockStoreState.inventory = [
      { id: "inv_1", itemId, quantity: 1, slot: "main_hand", isAttuned: false },
    ];
    mockStoreState.proficiencies = {
      martial_melee: "proficient",
      martial_ranged: "proficient",
    };
  };

  beforeEach(() => {
    const traits = [
      packTrait("trait_berserker_frenzy"),
      packTrait("trait_berserker_retaliation"),
    ];
    mockStoreState.getActiveTraits = () => traits;
  });

  it("adds a Frenzied Strike card for a held greataxe while frenzied", () => {
    hold("item_weapon_greataxe");
    mockStoreState.activeStates = ["status_frenzied"];

    const card = useCombat().attacks.find(
      (attack) => attack.actionId === "action_frenzied_strike:inv_1",
    );

    expect(card).toMatchObject({
      name: "Frenzied Strike: Greataxe",
      activation: "bonus_action",
      slot: "main_hand",
    });
  });

  it("adds no Frenzied Strike card once the frenzy is over", () => {
    hold("item_weapon_greataxe");
    mockStoreState.activeStates = [];

    expect(
      useCombat().attacks.some((attack) =>
        String(attack.actionId).startsWith("action_frenzied_strike"),
      ),
    ).toBe(false);
  });

  it("adds no card of either kind for a bow", () => {
    hold("item_weapon_longbow");
    mockStoreState.activeStates = ["status_frenzied"];

    expect(
      useCombat().attacks.filter((attack) =>
        String(attack.actionId).includes(":"),
      ),
    ).toEqual([]);
  });

  it("offers Retaliation as a reaction with the weapon card's own numbers", () => {
    hold("item_weapon_greataxe");
    mockStoreState.activeStates = [];

    const { attacks } = useCombat();
    const own = attacks.find(
      (attack) => attack.actionId === "action_weapon_item_weapon_greataxe",
    );
    const retaliation = attacks.find(
      (attack) => attack.actionId === "action_retaliation:inv_1",
    );

    expect(retaliation).toMatchObject({
      name: "Retaliation: Greataxe",
      activation: "reaction",
      attackBonus: own.attackBonus,
      damageExpression: own.damageExpression,
    });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @project/web exec vitest run src/hooks/__tests__/useCombat.test.ts`
Expected: FAIL. The Frenzied Strike and Retaliation cards are undefined; the existing tests still pass.

- [ ] **Step 3: Add the cards in `useCombat`**

In `apps/web/src/hooks/useCombat.ts`:

1. Extend the `@project/engine` import:

```ts
import {
  CombatEngine,
  dynamicAttackApplies,
  dynamicAttackId,
  resolveWeaponDefinition,
  type Ability,
} from "@project/engine";
```

2. Add two selectors after `const ruleSnapshot = ...`:

```ts
  const getActiveTraits = useCharacterSheetStore((state) => state.getActiveTraits);
  const subclassIds = useCharacterSheetStore((state) => state.subclassIds);
```

3. Inside the `useMemo`, directly after the `const criticalHitModifiers = ...;` statement:

```ts
    // read through the store's compile, the same traits the server
    // synthesises its swings from, so a subclass feature like Frenzy is
    // never missed here
    const dynamicTemplates = getActiveTraits()
      .flatMap((trait) => trait.actions ?? [])
      .filter((action) => action.effect.type === "dynamic_weapon_attack");
```

4. Replace

```ts
        requiresAmmo: !!weaponDef.ammoItemId,
        currentAmmo,
        ammoInventoryId,
      });

      return acc;
```

with

```ts
        requiresAmmo: !!weaponDef.ammoItemId,
        currentAmmo,
        ammoInventoryId,
      });

      // one further card per template that offers a swing with this weapon:
      // the weapon card's own numbers, the template's activation, and the id
      // the server gives the swing it synthesises, so pressing the card
      // resolves it. Only melee weapons qualify, so there is no ammunition.
      for (const template of dynamicTemplates) {
        if (template.effect.type !== "dynamic_weapon_attack") continue;
        if (!dynamicAttackApplies(template.effect, weaponDef, activeStates)) {
          continue;
        }

        acc.push({
          ...derivedAttack,
          name: `${template.name}: ${weaponDef.name}`,
          slot: item.slot,
          activation: template.activation,
          actionId: dynamicAttackId(template.id, item.id),
          requiresAmmo: false,
          currentAmmo: 0,
          ammoInventoryId: null,
        });
      }

      return acc;
```

5. Add `getActiveTraits` and `subclassIds` to the `useMemo` dependency array, after `ruleSnapshot`.

Normalise `useCombat.ts` and `useCombat.test.ts` to CRLF.

- [ ] **Step 4: Run the hook test**

Run: `pnpm --filter @project/web exec vitest run src/hooks/__tests__/useCombat.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing store and badge tests**

Append to `apps/web/src/store/__tests__/characterSheetStore.test.ts`:

```ts
describe("getCharacterActions and dynamic templates", () => {
  it("leaves the Berserker's swing templates to the attack cards", () => {
    useCharacterSheetStore.getState().initialize({
      id: "char_1",
      level: 14,
      classLevels: { class_barbarian: 14 },
      subclassIds: { class_barbarian: "subclass_barbarian_berserker" },
      traitGrants: [],
      raceId: "race_human",
      subraceId: null,
      ruleSnapshot: packRuleSnapshot(),
    });

    const ids = useCharacterSheetStore
      .getState()
      .getCharacterActions()
      .map((action) => action.id);

    expect(ids).toContain("action_frenzied_rage");
    expect(ids).not.toContain("action_frenzied_strike");
    expect(ids).not.toContain("action_retaliation");
  });
});
```

In `apps/web/src/components/sheet/__tests__/CombatWidget.test.tsx`, add `afterEach` to the `vitest` import if absent, then append:

```tsx
describe("CombatWidget activation badge", () => {
  afterEach(() => {
    mocks.attacks.current = null;
  });

  it("labels a reaction swing as a reaction", async () => {
    mocks.attacks.current = [
      {
        weaponId: "item_weapon_longsword",
        name: "Retaliation: Longsword",
        attackBonus: 5,
        rollState: "normal",
        damageBonus: 3,
        damageExpression: "1d8 +3 slashing",
        criticalDamageExpression: "2d8 +3 slashing",
        isProficient: true,
        context: {
          hand: "main_hand",
          attackUsage: "standard",
          isTwoHandedGrip: false,
        },
        breakdown: {
          governingStat: "STR",
          attack: ["STR (+3)", "Proficiency (+2)"],
          damage: ["STR (+3)"],
        },
        slot: "main_hand",
        activation: "reaction",
        actionId: "action_retaliation:inv_1",
        requiresAmmo: false,
        currentAmmo: 0,
        ammoInventoryId: null,
      },
    ];

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<CombatWidget />);
    });

    expect(container.textContent).toContain("REACTION");
  });
});
```

- [ ] **Step 6: Run them and watch them fail**

Run: `pnpm --filter @project/web exec vitest run src/store/__tests__/characterSheetStore.test.ts src/components/sheet/__tests__/CombatWidget.test.tsx`
Expected: FAIL. `action_frenzied_strike` is in the store's list, and the badge reads "ACTION".

- [ ] **Step 7: Filter the templates and teach the badge**

In `apps/web/src/store/characterSheetStore.ts`, replace the return of `getCharacterActions`:

```ts
      return [
        ...STANDARD_ACTIONS,
        ...activeTraits.flatMap((trait) => trait.actions ?? []),
      ];
```

with:

```ts
      return [
        ...STANDARD_ACTIONS,
        ...activeTraits.flatMap((trait) => trait.actions ?? []),
      ].filter(
        // a dynamic_weapon_attack is a template: useCombat draws its concrete
        // swings as attack cards, and the bare template has nothing to roll
        (action) => action.effect.type !== "dynamic_weapon_attack",
      );
```

In `apps/web/src/components/sheet/CombatWidget.tsx`, add beside `PROTECTION_TRAIT_ID`:

```tsx
/** The activation badge on an attack card. Retaliation is the first reaction card. */
const ACTIVATION_BADGE: Record<string, { short: string; long: string }> = {
  action: { short: "ACTION", long: "Action" },
  bonus_action: { short: "BONUS", long: "Bonus action" },
  reaction: { short: "REACTION", long: "Reaction" },
};
```

and in the attack card's ACT block replace

```tsx
                      showTooltip(event, "Action Type", [
                        attack.activation === "bonus_action"
                          ? "Bonus action"
                          : "Action",
                      ])
```

with

```tsx
                      showTooltip(event, "Action Type", [
                        ACTIVATION_BADGE[attack.activation]?.long ?? "Action",
                      ])
```

and

```tsx
                      {attack.activation === "bonus_action"
                        ? "BONUS"
                        : "ACTION"}
```

with

```tsx
                      {ACTIVATION_BADGE[attack.activation]?.short ?? "ACTION"}
```

Normalise the store, the widget and both test files to CRLF.

- [ ] **Step 8: Run the web suites that cover the change, and typecheck**

Run: `pnpm --filter @project/web exec vitest run src/hooks src/store src/components/sheet`
Expected: PASS.
Run from `apps/web`: `npx tsc -b`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/hooks/useCombat.ts apps/web/src/hooks/__tests__/useCombat.test.ts apps/web/src/store/characterSheetStore.ts apps/web/src/store/__tests__/characterSheetStore.test.ts apps/web/src/components/sheet/CombatWidget.tsx apps/web/src/components/sheet/__tests__/CombatWidget.test.tsx
git commit -F - <<'EOF'
feat(web): Frenzied Strike and Retaliation cards on the sheet

useCombat draws one card per template that applies to each held weapon,
asking dynamicAttackApplies as the server does and sending the id the
server gives the swing it synthesises. The bare templates leave the
character-action list, and the badge says REACTION for Retaliation.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Suppression lines from `TableRulesEngine`

**Files:**
- Modify: `packages/engine/src/calculators/tableRules.ts`
- Modify: `apps/web/src/components/sheet/TableRulesWidget.tsx` (`KIND_LABEL` only)
- Test: `packages/engine/src/calculators/__tests__/tableRules.test.ts` (append)

**Interfaces:**
- Consumes: `SuspendedCondition` from `./conditionSuppression.js`.
- Produces: `TableRuleLineKind = "note" | "affinity" | "suppression"`; `TableRulesInput.suspendedConditions?: SuspendedCondition[]`. Task 5 passes the list; Task 6 adds `"reporter"`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/engine/src/calculators/__tests__/tableRules.test.ts` (the file's `helper()` and `resistor()` fixtures are in scope):

```ts
describe("TableRulesEngine.describe: suppressions", () => {
  it("reports each suspended condition by name, with what suspends it", () => {
    expect(
      TableRulesEngine.describe({
        traits: [],
        activeStates: [],
        suspendedConditions: [{ condition: "frightened", source: "Mindless Rage" }],
      }),
    ).toEqual([
      { kind: "suppression", source: "Mindless Rage", text: "Frightened is suspended." },
    ]);
  });

  it("falls back to the id for a condition the map does not name", () => {
    expect(
      TableRulesEngine.describe({
        traits: [],
        activeStates: [],
        suspendedConditions: [{ condition: "not_a_condition", source: "Test" }],
      })[0]?.text,
    ).toBe("not_a_condition is suspended.");
  });

  it("lists suppressions after notes and affinities", () => {
    const lines = TableRulesEngine.describe({
      traits: [resistor(), helper()],
      activeStates: ["status_raging"],
      suspendedConditions: [{ condition: "charmed", source: "Mindless Rage" }],
    });

    expect(lines.map((line) => line.kind)).toEqual(["note", "affinity", "suppression"]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @project/engine exec vitest run src/calculators/__tests__/tableRules.test.ts`
Expected: FAIL. No suppression lines are produced.

- [ ] **Step 3: Add the kind**

In `packages/engine/src/calculators/tableRules.ts`:

1. Replace the imports with:

```ts
import { CONDITION_MAP, type TraitDefinition } from "@project/shared";
import { AffinityEngine } from "./affinities.js";
import type { SuspendedCondition } from "./conditionSuppression.js";
```

2. Add to the module doc comment, after "Both are things the player reads and acts on.":

```ts
 * A suppression line is a condition the player toggled that a trait is
 * holding off, as Mindless Rage holds off frightened while raging.
```

3. Replace `export type TableRuleLineKind = "note" | "affinity";` with:

```ts
export type TableRuleLineKind = "note" | "affinity" | "suppression";
```

4. Add to `TableRulesInput`, after `activeStates: string[];`:

```ts
  /** Toggled conditions a trait is holding off, from suppressConditions. */
  suspendedConditions?: SuspendedCondition[];
```

5. Change the `describe` signature and append the suppression loop before `return lines;`:

```ts
  public static describe({
    traits,
    activeStates,
    suspendedConditions = [],
  }: TableRulesInput): TableRuleLine[] {
```

```ts
    for (const { condition, source } of suspendedConditions) {
      const name = CONDITION_MAP[condition]?.name ?? condition;
      lines.push({ kind: "suppression", source, text: `${name} is suspended.` });
    }
```

In `apps/web/src/components/sheet/TableRulesWidget.tsx`, add the new kind to `KIND_LABEL`, so the web typecheck stays green:

```ts
const KIND_LABEL: Record<TableRuleLine["kind"], string> = {
  note: "Rule",
  affinity: "Damage",
  suppression: "Suspended",
};
```

Both files are LF; leave them LF.

- [ ] **Step 4: Run the test and typecheck**

Run: `pnpm --filter @project/engine exec vitest run src/calculators/__tests__/tableRules.test.ts`
Expected: PASS.
Run: `pnpm --filter @project/engine typecheck`, then from `apps/web`: `npx tsc -b`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/calculators/tableRules.ts packages/engine/src/calculators/__tests__/tableRules.test.ts apps/web/src/components/sheet/TableRulesWidget.tsx
git commit -F - <<'EOF'
feat(engine): TableRulesEngine reports suspended conditions

A suppression line names the condition and the trait holding it off,
listed after notes and affinities.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Suspended conditions on the sheet

**Files:**
- Modify: `apps/web/src/store/characterSheetStore.ts` (state interface after `getActiveTraits`, ~line 699; implementation after `getActiveTraits`, ~line 1237)
- Modify: `apps/web/src/components/sheet/ConditionsWidget.tsx`
- Modify: `apps/web/src/components/sheet/TableRulesWidget.tsx`
- Test: `apps/web/src/store/__tests__/characterSheetStore.test.ts`, `apps/web/src/components/sheet/__tests__/ConditionsWidget.test.tsx`, `apps/web/src/components/sheet/__tests__/TableRulesWidget.test.tsx`

**Interfaces:**
- Consumes: `suppressConditions`, `SuspendedCondition` from `@project/engine`; the store's existing module-level `getConditionSuppressions(state)`; `TableRulesInput.suspendedConditions` (Task 4).
- Produces: store method `getSuspendedConditions: () => SuspendedCondition[]`. Task 7's widget mock carries it.

- [ ] **Step 1: Write the failing store test**

In `apps/web/src/store/__tests__/characterSheetStore.test.ts`, add `EffectManager` to the existing `@project/engine` import at the top if it is not already there, then append:

```ts
describe("getSuspendedConditions", () => {
  const raging = () => {
    const effects = new EffectManager();
    effects.addEffect({
      instanceId: "rage",
      sourceName: "Rage",
      durationType: "manual",
      isSelfConcentration: false,
      modifiers: [],
      grantedStates: ["status_raging"],
    });
    return effects;
  };

  const frightenedBerserker = (runtimeEffects: EffectManager) =>
    useCharacterSheetStore.getState().initialize({
      id: "char_1",
      level: 6,
      classLevels: { class_barbarian: 6 },
      subclassIds: { class_barbarian: "subclass_barbarian_berserker" },
      traitGrants: [],
      raceId: "race_human",
      subraceId: null,
      ruleSnapshot: packRuleSnapshot(),
      activeConditions: ["frightened"],
      baseStates: [],
      runtimeEffects,
    });

  it("suspends frightened while a Mindless Rage berserker rages", () => {
    frightenedBerserker(raging());

    expect(useCharacterSheetStore.getState().getSuspendedConditions()).toEqual([
      {
        condition: "frightened",
        source: packRuleSnapshot().traitsById?.["trait_berserker_mindless_rage"]?.name,
      },
    ]);
  });

  it("suspends nothing while the berserker is not raging", () => {
    frightenedBerserker(new EffectManager());

    expect(useCharacterSheetStore.getState().getSuspendedConditions()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @project/web exec vitest run src/store/__tests__/characterSheetStore.test.ts`
Expected: FAIL, `getSuspendedConditions is not a function`.

- [ ] **Step 3: Add `getSuspendedConditions` to the store**

In `apps/web/src/store/characterSheetStore.ts`:

1. Add `type SuspendedCondition` to the existing `@project/engine` import (the one that already imports `suppressConditions`).

2. In the `CharacterSheetState` interface, directly after `getActiveTraits: () => TraitDefinition[];`:

```ts
  /**
   * Toggled conditions a trait is holding off, and what holds them.
   * composeActiveStates already leaves these out of activeStates; this is the
   * half it computes and discards, for the widgets that have to say so.
   */
  getSuspendedConditions: () => SuspendedCondition[];
```

3. In the implementation, directly after the `getActiveTraits: () => { ... },` block:

```ts
    getSuspendedConditions: () => {
      const state = get();
      // the gates composeActiveStates uses: base states and effect states,
      // never the conditions themselves
      const gatingStates = [
        ...state.baseStates,
        ...(state.runtimeEffects?.getActiveStates() ?? []),
      ];
      return suppressConditions(
        state.activeConditions,
        getConditionSuppressions(state),
        gatingStates,
      ).suspended;
    },
```

Normalise the store and its test to CRLF.

- [ ] **Step 4: Run the store test**

Run: `pnpm --filter @project/web exec vitest run src/store/__tests__/characterSheetStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing widget tests**

In `apps/web/src/components/sheet/__tests__/ConditionsWidget.test.tsx`:

1. Add `beforeEach` to the `vitest` import.

2. Replace the `mocks` and `vi.mock` blocks with:

```tsx
const mocks = vi.hoisted(() => ({
  activeConditions: { current: [] as string[] },
  suspended: { current: [] as Array<{ condition: string; source: string }> },
  toggleCondition: vi.fn(),
}));

vi.mock("../../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      activeConditions: mocks.activeConditions.current,
      activeStates: [],
      getSuspendedConditions: () => mocks.suspended.current,
      toggleCondition: mocks.toggleCondition,
    }),
}));
```

3. Add as the first line inside `describe("ConditionsWidget", () => {`:

```tsx
  beforeEach(() => {
    mocks.suspended.current = [];
  });
```

4. Append inside that `describe`:

```tsx
  it("strikes through a held condition a trait has suspended, and names the trait", async () => {
    mocks.activeConditions.current = ["frightened"];
    mocks.suspended.current = [{ condition: "frightened", source: "Mindless Rage" }];

    const container = await renderWidget();

    const frightened = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Frightened"),
    );

    expect(frightened?.className).toContain("line-through");
    expect(frightened?.getAttribute("title")).toBe("Suspended by Mindless Rage");
    // still held: the condition comes back when the rage ends
    expect(frightened?.getAttribute("aria-pressed")).toBe("true");
  });

  it("leaves a suspended condition clickable, so the player can still clear it", async () => {
    mocks.activeConditions.current = ["frightened"];
    mocks.suspended.current = [{ condition: "frightened", source: "Mindless Rage" }];
    mocks.toggleCondition.mockClear();

    const container = await renderWidget();

    const frightened = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Frightened"),
    );
    await act(async () => {
      frightened?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.toggleCondition).toHaveBeenCalledWith("frightened");
  });
```

In `apps/web/src/components/sheet/__tests__/TableRulesWidget.test.tsx` (LF), replace the `mocks` and `vi.mock` blocks with:

```tsx
const mocks = vi.hoisted(() => ({
  activeStates: { current: [] as string[] },
  traits: { current: [] as unknown[] },
  suspended: { current: [] as Array<{ condition: string; source: string }> },
}));

vi.mock("../../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      activeStates: mocks.activeStates.current,
      activeConditions: [],
      getActiveTraits: () => mocks.traits.current,
      getSuspendedConditions: () => mocks.suspended.current,
      ruleSnapshot: null,
      classLevels: {},
      traitGrants: [],
    }),
}));
```

and append:

```tsx
describe("TableRulesWidget and suspended conditions", () => {
  it("says which condition is suspended, and by what", async () => {
    mocks.traits.current = [];
    mocks.activeStates.current = [];
    mocks.suspended.current = [{ condition: "frightened", source: "Mindless Rage" }];

    const container = await renderWidget();

    expect(container.textContent).toContain("Suspended");
    expect(container.textContent).toContain("Mindless Rage");
    expect(container.textContent).toContain("Frightened is suspended.");

    mocks.suspended.current = [];
  });
});
```

- [ ] **Step 6: Run them and watch them fail**

Run: `pnpm --filter @project/web exec vitest run src/components/sheet/__tests__/ConditionsWidget.test.tsx src/components/sheet/__tests__/TableRulesWidget.test.tsx`
Expected: FAIL. The chip has no `line-through` and keeps the condition's summary as its title; the panel has no suppression line.

- [ ] **Step 7: Render the suspension in both widgets**

Replace `apps/web/src/components/sheet/ConditionsWidget.tsx` with:

```tsx
import { CONDITION_IDS, CONDITION_MAP } from "@project/shared";
import { useCharacterSheetStore } from "../../store/characterSheetStore";

/**
 * A flag board, not a rules engine.
 *
 * Toggling a condition grants its state so authored rules can gate on it -
 * Danger Sense stops applying while you are blinded, deafened, or
 * incapacitated. The condition's own mechanical riders are deliberately not
 * modelled: marking yourself prone does not change your attack rolls here.
 *
 * A condition a trait suspends - frightened while a Mindless Rage berserker
 * rages - stays toggled, so it returns when the rage ends, and is drawn struck
 * through with the trait named.
 */
export const ConditionsWidget = () => {
  const activeConditions = useCharacterSheetStore(
    (state) => state.activeConditions,
  );
  const toggleCondition = useCharacterSheetStore(
    (state) => state.toggleCondition,
  );
  const getSuspendedConditions = useCharacterSheetStore(
    (state) => state.getSuspendedConditions,
  );
  // read so a rage starting or ending re-renders the chips; the suppression
  // reads its gates through the store
  useCharacterSheetStore((state) => state.activeStates);

  const suspendedBy = new Map(
    getSuspendedConditions().map((entry) => [entry.condition, entry.source]),
  );

  return (
    <div className="bg-gray-50 border p-3 rounded mt-2">
      <h3 className="text-xs font-bold uppercase text-gray-600 mb-2">
        Conditions
      </h3>

      <div className="flex flex-wrap gap-1.5">
        {CONDITION_IDS.map((conditionId) => {
          const condition = CONDITION_MAP[conditionId];
          if (!condition) return null;

          const isActive = activeConditions.includes(conditionId);
          const suppressor = suspendedBy.get(conditionId);

          return (
            <button
              key={conditionId}
              type="button"
              aria-pressed={isActive}
              title={suppressor ? `Suspended by ${suppressor}` : condition.summary}
              onClick={() => toggleCondition(conditionId)}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                suppressor
                  ? "border-amber-300 bg-amber-50 text-amber-700 line-through"
                  : isActive
                    ? "border-amber-700 bg-amber-600 text-white"
                    : "border-gray-300 bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              {condition.name}
            </button>
          );
        })}
      </div>
    </div>
  );
};
```

In `apps/web/src/components/sheet/TableRulesWidget.tsx` (LF), add after the `getActiveTraits` selector:

```tsx
  const getSuspendedConditions = useCharacterSheetStore(
    (state) => state.getSuspendedConditions,
  );
```

add after `useCharacterSheetStore((state) => state.traitGrants);`:

```tsx
  useCharacterSheetStore((state) => state.activeConditions);
```

and change the `describe` call to:

```tsx
  const lines = TableRulesEngine.describe({
    traits: getActiveTraits(),
    activeStates,
    suspendedConditions: getSuspendedConditions(),
  });
```

Normalise `ConditionsWidget.tsx` and `ConditionsWidget.test.tsx` to CRLF.

- [ ] **Step 8: Run the web suites that cover the change, and typecheck**

Run: `pnpm --filter @project/web exec vitest run src/store src/components/sheet`
Expected: PASS. If `DashboardLayout.test.tsx` fails, it mocks every widget to null and needs nothing here; investigate rather than editing it.
Run from `apps/web`: `npx tsc -b`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/store/characterSheetStore.ts apps/web/src/store/__tests__/characterSheetStore.test.ts apps/web/src/components/sheet/ConditionsWidget.tsx apps/web/src/components/sheet/__tests__/ConditionsWidget.test.tsx apps/web/src/components/sheet/TableRulesWidget.tsx apps/web/src/components/sheet/__tests__/TableRulesWidget.test.tsx
git commit -F - <<'EOF'
feat(web): a suspended condition shows as suspended

composeActiveStates computed Mindless Rage's suppression and discarded
which conditions it held off. getSuspendedConditions recomputes that
half from the same gates; the Conditions widget strikes the chip through
with the trait named, and the Rules panel says it is suspended.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 6: The self-save DC as one helper, and the Relentless Rage reporter

**Files:**
- Create: `packages/engine/src/calculators/saveDc.ts`, `packages/engine/src/calculators/relentlessRage.ts`
- Modify: `packages/shared/src/schemas/content/actions.ts` (after `SaveDcRuleSchema`, ~line 157)
- Modify: `packages/engine/src/pipeline/actionResolver.ts` (the `self_save` case, ~line 635)
- Modify: `packages/engine/src/calculators/tableRules.ts` (`TableRuleLineKind`)
- Modify: `apps/web/src/components/sheet/TableRulesWidget.tsx` (`KIND_LABEL` only)
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/src/calculators/__tests__/saveDc.test.ts`, `packages/engine/src/calculators/__tests__/relentlessRage.test.ts` (create), `packages/engine/src/pipeline/__tests__/actionResolver.test.ts` (append)

**Interfaces:**
- Produces: `type SaveDcRule` from `@project/shared`; `resolveSelfSaveDc(rule: SaveDcRule, usesSoFar: number): number`, `selfSaveCounterId(rule: SaveDcRule): string | undefined`, `RELENTLESS_RAGE_ACTION_ID`, and `RelentlessRageEngine.describe(input: RelentlessRageInput): RelentlessRageReport` from `@project/engine`, with `RelentlessRageInput = { currentHp: number; activeStates: string[]; action: ActionGrant; usesSinceRest: number }` and `RelentlessRageReport = { available: boolean; dc: number; summary: string }`; `TableRuleLineKind` gains `"reporter"`. Task 7 consumes all of these.

- [ ] **Step 1: Write the failing DC and reporter tests**

```ts
// packages/engine/src/calculators/__tests__/saveDc.test.ts
import { describe, expect, it } from "vitest";
import { resolveSelfSaveDc, selfSaveCounterId } from "../saveDc.js";

const escalating = {
  kind: "escalating_per_use" as const,
  base: 10,
  increasePerUse: 5,
  resourceId: "resource_relentless_rage",
};

describe("resolveSelfSaveDc", () => {
  it("returns a fixed DC whatever the count", () => {
    expect(resolveSelfSaveDc({ kind: "fixed", value: 13 }, 4)).toBe(13);
  });

  it("raises an escalating DC by its step for each use so far", () => {
    expect(resolveSelfSaveDc(escalating, 0)).toBe(10);
    expect(resolveSelfSaveDc(escalating, 1)).toBe(15);
    expect(resolveSelfSaveDc(escalating, 2)).toBe(20);
  });
});

describe("selfSaveCounterId", () => {
  it("names the pool an escalating rule counts", () => {
    expect(selfSaveCounterId(escalating)).toBe("resource_relentless_rage");
  });

  it("names none for a fixed DC", () => {
    expect(selfSaveCounterId({ kind: "fixed", value: 13 })).toBeUndefined();
  });
});
```

```ts
// packages/engine/src/calculators/__tests__/relentlessRage.test.ts
import { describe, expect, it } from "vitest";
import type { ActionGrant } from "@project/shared";
import { corePackLookup } from "../../pipeline/__tests__/corePackFixture.js";
import { RELENTLESS_RAGE_ACTION_ID, RelentlessRageEngine } from "../relentlessRage.js";

const relentlessRage = (): ActionGrant => {
  const action = corePackLookup()
    .traitsById?.["trait_relentless_rage"]?.actions.find(
      (entry) => entry.id === RELENTLESS_RAGE_ACTION_ID,
    );
  if (!action) throw new Error("action_relentless_rage missing from the shipped pack");
  return action;
};

const describeAt = (currentHp: number, activeStates: string[], usesSinceRest = 0) =>
  RelentlessRageEngine.describe({
    currentHp,
    activeStates,
    action: relentlessRage(),
    usesSinceRest,
  });

describe("RelentlessRageEngine.describe", () => {
  it("offers the save at 0 hit points while raging", () => {
    expect(describeAt(0, ["status_raging"])).toMatchObject({ available: true, dc: 10 });
  });

  it("does not offer it above 0 hit points", () => {
    expect(describeAt(1, ["status_raging"]).available).toBe(false);
  });

  it("does not offer it at 0 hit points without rage", () => {
    expect(describeAt(0, []).available).toBe(false);
  });

  it("raises the DC by 5 for each use since the last rest", () => {
    expect(describeAt(0, ["status_raging"], 2).dc).toBe(20);
  });

  it("says what the save is for, in the player's words", () => {
    expect(describeAt(10, [], 1).summary).toBe(
      "Drop to 0 hit points while raging: DC 15 Constitution saving throw to drop to 1 instead.",
    );
  });

  it("refuses an action that is not a self-save", () => {
    expect(() =>
      RelentlessRageEngine.describe({
        currentHp: 0,
        activeStates: [],
        action: {
          id: "action_dodge",
          name: "Dodge",
          activation: "action",
          effect: { type: "no_effect" },
        } as ActionGrant,
        usesSinceRest: 0,
      }),
    ).toThrow("action_dodge is not a self_save action");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @project/engine exec vitest run src/calculators/__tests__/saveDc.test.ts src/calculators/__tests__/relentlessRage.test.ts`
Expected: FAIL, cannot resolve `../saveDc.js` and `../relentlessRage.js`.

- [ ] **Step 3: Export the rule type and write the DC helper**

In `packages/shared/src/schemas/content/actions.ts`, directly after the closing `]);` of `SaveDcRuleSchema`:

```ts

export type SaveDcRule = z.infer<typeof SaveDcRuleSchema>;
```

Normalise it to CRLF.

```ts
// packages/engine/src/calculators/saveDc.ts
import type { SaveDcRule } from "@project/shared";

/**
 * The DC of a self-save, from its rule and how often it has been made since
 * its pool last reset.
 *
 * The resolver rolls against this and the Rules panel reports it, so the DC a
 * player reads is the DC the server rolls against.
 * @param rule The effect's DC rule.
 * @param usesSoFar The count before this attempt.
 * @returns The DC this attempt is made against.
 */
export const resolveSelfSaveDc = (rule: SaveDcRule, usesSoFar: number): number =>
  rule.kind === "fixed" ? rule.value : rule.base + rule.increasePerUse * usesSoFar;

/**
 * The uses pool an escalating rule counts, which is also the pool each
 * attempt increments.
 * @param rule The effect's DC rule.
 * @returns The resource id, or undefined for a fixed DC.
 */
export const selfSaveCounterId = (rule: SaveDcRule): string | undefined =>
  rule.kind === "escalating_per_use" ? rule.resourceId : undefined;
```

- [ ] **Step 4: Write the reporter**

```ts
// packages/engine/src/calculators/relentlessRage.ts
import type { ActionGrant } from "@project/shared";
import { resolveSelfSaveDc } from "./saveDc.js";
import { predicateHolds } from "./tableRules.js";

export const RELENTLESS_RAGE_ACTION_ID = "action_relentless_rage";

/**
 * Full names for the save line. The only other map lives inside
 * SavingThrowsWidget, which the engine cannot import.
 */
const ABILITY_NAME: Record<string, string> = {
  STR: "Strength",
  DEX: "Dexterity",
  CON: "Constitution",
  INT: "Intelligence",
  WIS: "Wisdom",
  CHA: "Charisma",
};

export interface RelentlessRageInput {
  currentHp: number;
  activeStates: string[];
  /** The trait's action. Its effect must be the self_save. */
  action: ActionGrant;
  /** How many times the save has been made since its pool last reset. */
  usesSinceRest: number;
}

export interface RelentlessRageReport {
  /** At 0 hit points with the action's own gate holding: the moment the save exists for. */
  available: boolean;
  dc: number;
  summary: string;
}

/**
 * Relentless Rage for the Rules panel.
 *
 * A reporter beside SurpriseEngine: it says when the save is on offer and at
 * what DC, and applies nothing. The 0 hit point trigger is the one thing it
 * knows that the data cannot say; the raging gate is read from the action, so
 * it is whatever the pack authored. The server resolves the action at any hit
 * points if asked - availability is reported, not enforced.
 */
export class RelentlessRageEngine {
  public static describe({
    currentHp,
    activeStates,
    action,
    usesSinceRest,
  }: RelentlessRageInput): RelentlessRageReport {
    const { effect } = action;
    if (effect.type !== "self_save") {
      throw new Error(`${action.id} is not a self_save action`);
    }

    const dc = resolveSelfSaveDc(effect.dcRule, usesSinceRest);
    const ability = ABILITY_NAME[effect.ability] ?? effect.ability;

    return {
      available: currentHp <= 0 && predicateHolds(effect, activeStates),
      dc,
      summary: `Drop to 0 hit points while raging: DC ${dc} ${ability} saving throw to drop to 1 instead.`,
    };
  }
}
```

In `packages/engine/src/calculators/tableRules.ts`, replace the kind union with:

```ts
/**
 * `reporter` lines are composed by the widget from a trait-specific reporter
 * such as RelentlessRageEngine, whose input (hit points, a resource count) is
 * foreign to this one; describe never emits one.
 */
export type TableRuleLineKind = "note" | "affinity" | "suppression" | "reporter";
```

In `apps/web/src/components/sheet/TableRulesWidget.tsx`, add `reporter: "Reporter",` to `KIND_LABEL`.

In `packages/engine/src/index.ts`, directly after `export * from "./calculators/conditionSuppression.js";`:

```ts
export * from "./calculators/saveDc.js";
export * from "./calculators/relentlessRage.js";
```

Normalise `packages/engine/src/index.ts` to CRLF.

- [ ] **Step 5: Run the two tests**

Run: `pnpm --filter @project/engine exec vitest run src/calculators/__tests__/saveDc.test.ts src/calculators/__tests__/relentlessRage.test.ts`
Expected: PASS (4 and 6 tests).

- [ ] **Step 6: Pin the resolver's self-save behaviour**

`actionResolver.test.ts` has no `self_save` test, so pin the behaviour before refactoring it. Append (the file already imports `ActionResolver`, `EffectManager`, `ResourceManager`, `corePackLookup`, `vi` and `ActionGrant`; add `afterEach` to its `vitest` import if absent):

```ts
describe("ActionResolver self_save (Relentless Rage)", () => {
  const relentlessRage = (): ActionGrant => {
    const action = corePackLookup()
      .traitsById?.["trait_relentless_rage"]?.actions.find(
        (entry) => entry.id === "action_relentless_rage",
      );
    if (!action) throw new Error("action_relentless_rage missing from the shipped pack");
    return action;
  };

  const countedAt = (uses: number) => {
    const resources = new ResourceManager();
    resources.hydrateFromPersisted([
      {
        id: "resource_relentless_rage",
        name: "Relentless Rage Uses",
        maxCharges: 0,
        currentCharges: uses,
        resetOn: "short_rest",
        mode: "uses",
      },
    ]);
    return resources;
  };

  const run = (
    resourceManager: ResourceManager,
    saveModifiers?: Record<"STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA", number>,
  ) =>
    ActionResolver.execute(
      relentlessRage(),
      { actionId: "action_relentless_rage", activeStates: ["status_raging"] },
      {
        effectManager: new EffectManager(),
        resourceManager,
        activeStates: ["status_raging"],
        ...(saveModifiers && { saveModifiers }),
      },
    );

  const count = (resources: ResourceManager) =>
    resources.getRuntimeResources()[0]?.currentCharges;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads the DC from the count so far, then counts this attempt", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999); // a natural 20
    const resources = countedAt(1);

    const result = run(resources);

    expect(result.rollResults?.[0]?.summary).toContain("DC 15");
    expect(count(resources)).toBe(2);
  });

  it("counts a failed attempt too", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // a natural 1
    const resources = countedAt(0);

    const result = run(resources);

    expect(result.rollResults?.[0]?.summary).toContain("failure");
    expect(count(resources)).toBe(1);
  });

  it("reports the healing only on a success", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(run(countedAt(0)).rollResults?.map((roll) => roll.label)).toEqual([
      "Relentless Rage",
    ]);

    vi.spyOn(Math, "random").mockReturnValue(0.999);
    expect(run(countedAt(0)).rollResults?.map((roll) => roll.label)).toEqual([
      "Relentless Rage",
      "Healing",
    ]);
  });

  it("adds the Constitution save modifier the server supplies", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.45); // a 10

    const result = run(countedAt(0), { STR: 0, DEX: 0, CON: 3, INT: 0, WIS: 0, CHA: 0 });

    expect(result.rollResults?.[0]).toMatchObject({ total: 13, modifier: 3 });
  });
});
```

Run: `pnpm --filter @project/engine exec vitest run src/pipeline/__tests__/actionResolver.test.ts`
Expected: PASS. These characterise the current branch; they must still pass after Step 7.

- [ ] **Step 7: Route the resolver through the helper**

In `packages/engine/src/pipeline/actionResolver.ts`, add beside the other `../` imports:

```ts
import { resolveSelfSaveDc, selfSaveCounterId } from "../calculators/saveDc.js";
```

In the `self_save` case, replace

```ts
        const escalatingRule = effect.dcRule.kind === "escalating_per_use"
          ? effect.dcRule
          : undefined;
        const uses = escalatingRule
          ? context.resourceManager.getRuntimeResources().find(
              (resource) => resource.id === escalatingRule.resourceId,
            )?.currentCharges ?? 0
          : 0;
        const dc = effect.dcRule.kind === "fixed"
          ? effect.dcRule.value
          : effect.dcRule.base + effect.dcRule.increasePerUse * uses;
```

with

```ts
        // the count before this attempt sets the DC; the Rules panel reads
        // the same helper, so the DC the player saw is the DC rolled against
        const counterId = selfSaveCounterId(effect.dcRule);
        const uses = counterId
          ? context.resourceManager.getRuntimeResources().find(
              (resource) => resource.id === counterId,
            )?.currentCharges ?? 0
          : 0;
        const dc = resolveSelfSaveDc(effect.dcRule, uses);
```

and replace

```ts
        if (escalatingRule) {
          context.resourceManager.consume(escalatingRule.resourceId, 1);
        }
```

with

```ts
        if (counterId) {
          context.resourceManager.consume(counterId, 1);
        }
```

Normalise `actionResolver.ts` and `actionResolver.test.ts` to CRLF.

- [ ] **Step 8: Run the engine suite and the typechecks**

Run: `pnpm --filter @project/engine exec vitest run src/pipeline/__tests__/actionResolver.test.ts src/calculators/__tests__/tableRules.test.ts`
Expected: PASS.
Run: `pnpm --filter @project/engine test --run`
Expected: PASS.
Run: `pnpm --filter @project/shared typecheck && pnpm --filter @project/engine typecheck && pnpm --filter @project/server typecheck`, then from `apps/web`: `npx tsc -b`
Expected: clean.
Run: `pnpm --filter @project/database schemas:generate && git status --short packages/database/data/schemas`
Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/schemas/content/actions.ts packages/engine/src/calculators/saveDc.ts packages/engine/src/calculators/__tests__/saveDc.test.ts packages/engine/src/calculators/relentlessRage.ts packages/engine/src/calculators/__tests__/relentlessRage.test.ts packages/engine/src/calculators/tableRules.ts packages/engine/src/pipeline/actionResolver.ts packages/engine/src/pipeline/__tests__/actionResolver.test.ts packages/engine/src/index.ts apps/web/src/components/sheet/TableRulesWidget.tsx
git commit -F - <<'EOF'
feat(engine): the self-save DC is one helper, and Relentless Rage has a reporter

resolveSelfSaveDc carries the resolver's inline arithmetic so the Rules
panel can read the DC the server rolls against. RelentlessRageEngine
says when the save is on offer - 0 hit points with the action's own
gate holding - and at what DC. The resolver's self_save behaviour is
pinned by tests it lacked.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Relentless Rage on the Rules panel

**Files:**
- Modify: `apps/web/src/components/sheet/TableRulesWidget.tsx`
- Modify: `apps/web/src/store/characterSheetStore.ts` (the `getCharacterActions` filter from Task 3)
- Test: `apps/web/src/components/sheet/__tests__/TableRulesWidget.test.tsx`, `apps/web/src/store/__tests__/characterSheetStore.test.ts`

**Interfaces:**
- Consumes: `RELENTLESS_RAGE_ACTION_ID`, `RelentlessRageEngine`, `selfSaveCounterId` (Task 6); the store's `currentHp`, `resources`, `executeCharacterAction`, `getSuspendedConditions` (Task 5).
- Produces: the reporter line and the "Make the save" button; `getCharacterActions` without `self_save` actions.

- [ ] **Step 1: Write the failing widget tests**

In `apps/web/src/components/sheet/__tests__/TableRulesWidget.test.tsx` (LF):

1. Add the pack fixture import after the existing imports:

```tsx
import { packRuleSnapshot } from "../../../store/__tests__/packFixture";
```

2. Replace the `mocks` and `vi.mock` blocks with:

```tsx
const mocks = vi.hoisted(() => ({
  activeStates: { current: [] as string[] },
  traits: { current: [] as unknown[] },
  suspended: { current: [] as Array<{ condition: string; source: string }> },
  currentHp: { current: 10 },
  resources: { current: [] as Array<{ id: string; current: number }> },
  executeCharacterAction: vi.fn(),
}));

vi.mock("../../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      activeStates: mocks.activeStates.current,
      activeConditions: [],
      getActiveTraits: () => mocks.traits.current,
      getSuspendedConditions: () => mocks.suspended.current,
      currentHp: mocks.currentHp.current,
      resources: mocks.resources.current,
      executeCharacterAction: mocks.executeCharacterAction,
      ruleSnapshot: null,
      classLevels: {},
      traitGrants: [],
    }),
}));
```

3. Append:

```tsx
describe("TableRulesWidget and Relentless Rage", () => {
  const relentless = () => {
    const trait = packRuleSnapshot().traitsById?.["trait_relentless_rage"];
    if (!trait) throw new Error("trait_relentless_rage missing from the shipped pack");
    return trait;
  };

  const makeTheSave = (container: HTMLElement) =>
    Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Make the save",
    );

  it("reports the save and its current DC whenever the trait is granted", async () => {
    mocks.traits.current = [relentless()];
    mocks.activeStates.current = [];
    mocks.currentHp.current = 10;
    mocks.resources.current = [{ id: "resource_relentless_rage", current: 1 }];

    const container = await renderWidget();

    expect(container.textContent).toContain("Reporter");
    expect(container.textContent).toContain("DC 15 Constitution saving throw");
    expect(makeTheSave(container)).toBeUndefined();
  });

  it("offers the save at 0 hit points while raging", async () => {
    mocks.traits.current = [relentless()];
    mocks.activeStates.current = ["status_raging"];
    mocks.currentHp.current = 0;
    mocks.resources.current = [];

    const container = await renderWidget();

    expect(container.textContent).toContain("DC 10 Constitution saving throw");
    expect(makeTheSave(container)).toBeDefined();
  });

  it("asks the server to resolve the save when pressed", async () => {
    mocks.traits.current = [relentless()];
    mocks.activeStates.current = ["status_raging"];
    mocks.currentHp.current = 0;
    mocks.resources.current = [];
    mocks.executeCharacterAction.mockClear();

    const container = await renderWidget();
    await act(async () => {
      makeTheSave(container)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.executeCharacterAction).toHaveBeenCalledWith("action_relentless_rage");
  });
});
```

Append to `apps/web/src/store/__tests__/characterSheetStore.test.ts`:

```ts
describe("getCharacterActions and self-saves", () => {
  it("leaves Relentless Rage to the Rules panel", () => {
    useCharacterSheetStore.getState().initialize({
      id: "char_1",
      level: 11,
      classLevels: { class_barbarian: 11 },
      subclassIds: { class_barbarian: null },
      traitGrants: [],
      raceId: "race_human",
      subraceId: null,
      ruleSnapshot: packRuleSnapshot(),
    });
    const state = useCharacterSheetStore.getState();

    expect(
      state.getActiveTraits().flatMap((trait) => trait.actions.map((action) => action.id)),
    ).toContain("action_relentless_rage");
    expect(state.getCharacterActions().map((action) => action.id)).not.toContain(
      "action_relentless_rage",
    );
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @project/web exec vitest run src/components/sheet/__tests__/TableRulesWidget.test.tsx src/store/__tests__/characterSheetStore.test.ts`
Expected: FAIL. No reporter line, no button, and `action_relentless_rage` is in `getCharacterActions`.

- [ ] **Step 3: Compose the line and the button**

Replace `apps/web/src/components/sheet/TableRulesWidget.tsx` (LF) with:

```tsx
import {
  RELENTLESS_RAGE_ACTION_ID,
  RelentlessRageEngine,
  TableRulesEngine,
  selfSaveCounterId,
  type TableRuleLine,
} from "@project/engine";
import { useCharacterSheetStore } from "../../store/characterSheetStore";

const KIND_LABEL: Record<TableRuleLine["kind"], string> = {
  note: "Rule",
  affinity: "Damage",
  suppression: "Suspended",
  reporter: "Reporter",
};

/**
 * Rules the engine reports but cannot enforce.
 *
 * Until this existed, a trait marked manual_sheet_helper reached nobody, and
 * Rage's resistances were authored data that no widget read. Every line here
 * comes from an engine reporter; the widget computes nothing itself.
 *
 * Relentless Rage's line is composed here rather than by TableRulesEngine
 * because it needs hit points and the save's counter, which that reporter's
 * input does not carry. Its button fires the action like any other; the
 * server resolves it, writes the healing and counts the attempt.
 */
export const TableRulesWidget = () => {
  const activeStates = useCharacterSheetStore((state) => state.activeStates);
  const getActiveTraits = useCharacterSheetStore((state) => state.getActiveTraits);
  const getSuspendedConditions = useCharacterSheetStore(
    (state) => state.getSuspendedConditions,
  );
  const currentHp = useCharacterSheetStore((state) => state.currentHp);
  const resources = useCharacterSheetStore((state) => state.resources);
  const executeCharacterAction = useCharacterSheetStore(
    (state) => state.executeCharacterAction,
  );
  // read so a snapshot, progression or condition change re-renders the panel;
  // the compile itself reads them through the store
  useCharacterSheetStore((state) => state.ruleSnapshot);
  useCharacterSheetStore((state) => state.classLevels);
  useCharacterSheetStore((state) => state.traitGrants);
  useCharacterSheetStore((state) => state.activeConditions);

  const traits = getActiveTraits();
  const lines: TableRuleLine[] = TableRulesEngine.describe({
    traits,
    activeStates,
    suspendedConditions: getSuspendedConditions(),
  });

  const relentless = traits
    .flatMap((trait) => trait.actions ?? [])
    .find((action) => action.id === RELENTLESS_RAGE_ACTION_ID);
  const relentlessEffect =
    relentless?.effect.type === "self_save" ? relentless.effect : undefined;
  const counterId = relentlessEffect
    ? selfSaveCounterId(relentlessEffect.dcRule)
    : undefined;
  const relentlessReport =
    relentless && relentlessEffect
      ? RelentlessRageEngine.describe({
          currentHp,
          activeStates,
          action: relentless,
          usesSinceRest:
            resources.find((resource) => resource.id === counterId)?.current ?? 0,
        })
      : undefined;

  if (relentless && relentlessReport) {
    lines.push({
      kind: "reporter",
      source: relentless.name,
      text: relentlessReport.summary,
    });
  }

  return (
    <div className="bg-gray-50 border p-3 rounded mt-2">
      <h3 className="text-xs font-bold uppercase text-gray-600 mb-2">
        Rules at the table
      </h3>

      {lines.length === 0 ? (
        <p className="text-xs text-gray-500">Nothing to report.</p>
      ) : (
        <ul className="space-y-2">
          {lines.map((line, index) => (
            <li
              key={`${line.kind}:${line.source}:${index}`}
              className="rounded border border-gray-200 bg-white px-2.5 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] uppercase text-gray-600">
                  {KIND_LABEL[line.kind]}
                </span>
                <span className="text-xs font-semibold text-gray-900">
                  {line.source}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-700">{line.text}</p>
              {line.kind === "reporter" && relentlessReport?.available && (
                <button
                  type="button"
                  onClick={() => executeCharacterAction(RELENTLESS_RAGE_ACTION_ID)}
                  className="mt-2 rounded bg-red-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-800"
                >
                  Make the save
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
```

In `apps/web/src/store/characterSheetStore.ts`, replace the `getCharacterActions` filter from Task 3:

```ts
      ].filter(
        // a dynamic_weapon_attack is a template: useCombat draws its concrete
        // swings as attack cards, and the bare template has nothing to roll
        (action) => action.effect.type !== "dynamic_weapon_attack",
      );
```

with:

```ts
      ].filter(
        // A dynamic_weapon_attack is a template: useCombat draws its concrete
        // swings as attack cards. A self_save answers a moment the Rules panel
        // reports - Relentless Rage at 0 hit points - and lives there, not as
        // a button that can be pressed at full health.
        (action) =>
          action.effect.type !== "dynamic_weapon_attack" &&
          action.effect.type !== "self_save",
      );
```

Normalise the store and its test to CRLF; `TableRulesWidget.tsx` and its test stay LF.

- [ ] **Step 4: Run the web suites that cover the change, and typecheck**

Run: `pnpm --filter @project/web exec vitest run src/store src/components/sheet`
Expected: PASS.
Run from `apps/web`: `npx tsc -b`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/sheet/TableRulesWidget.tsx apps/web/src/components/sheet/__tests__/TableRulesWidget.test.tsx apps/web/src/store/characterSheetStore.ts apps/web/src/store/__tests__/characterSheetStore.test.ts
git commit -F - <<'EOF'
feat(web): Relentless Rage's save on the Rules panel

The panel reports the save and its current DC whenever the trait is
granted, and offers "Make the save" at 0 hit points while raging. The
action leaves the character-action list, where it could be pressed at
full health.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Uses pools in Class Features

**Files:**
- Modify: `apps/web/src/hooks/useFeatures.ts`, `apps/web/src/components/sheet/FeaturesWidget.tsx`
- Test: `apps/web/src/hooks/__tests__/useFeatures.test.ts`, `apps/web/src/components/sheet/__tests__/FeaturesWidget.test.tsx` (create both)

**Interfaces:**
- Produces: `useFeatures(): FeaturePool[]`, `FeaturePool = ChargesFeature | UsesFeature`, `ChargesFeature = { kind: "charges"; id; name; current; max; resetCondition; isDepleted }`, `UsesFeature = { kind: "uses"; id; name; used; resetCondition }`.

- [ ] **Step 1: Write the failing hook test**

```ts
// apps/web/src/hooks/__tests__/useFeatures.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { packRuleSnapshot } from "../../store/__tests__/packFixture";

let mockStoreState: {
  resources: Array<{ id: string; current: number }>;
  level: number;
  classLevels: Record<string, number>;
  ruleSnapshot: unknown;
};

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    // evaluate the memo directly, as useCombat's test does
    useMemo: <T>(factory: () => T) => factory(),
  };
});

vi.mock("../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (selector: (state: typeof mockStoreState) => unknown) =>
    selector(mockStoreState),
}));

import { useFeatures } from "../useFeatures";

describe("useFeatures", () => {
  beforeEach(() => {
    mockStoreState = {
      resources: [],
      level: 11,
      classLevels: { class_barbarian: 11 },
      ruleSnapshot: packRuleSnapshot(),
    };
  });

  it("keeps a charges pool as it was", () => {
    mockStoreState.resources = [{ id: "resource_barbarian_rage", current: 2 }];

    expect(useFeatures()).toEqual([
      {
        kind: "charges",
        id: "resource_barbarian_rage",
        name: "Rage",
        current: 2,
        max: 4,
        resetCondition: "long_rest",
        isDepleted: false,
      },
    ]);
  });

  it("shows a uses pool, which has no maximum, as a count", () => {
    mockStoreState.resources = [{ id: "resource_relentless_rage", current: 2 }];

    expect(useFeatures()).toEqual([
      {
        kind: "uses",
        id: "resource_relentless_rage",
        name: "Relentless Rage Uses",
        used: 2,
        resetCondition: "short_rest",
      },
    ]);
  });

  it("still hides a charges pool the character has no uses of", () => {
    mockStoreState.level = 0;
    mockStoreState.classLevels = {};
    mockStoreState.resources = [{ id: "resource_barbarian_rage", current: 0 }];

    expect(useFeatures()).toEqual([]);
  });
});
```

(`resource_barbarian_rage` is 4 at barbarian levels 6 to 11. `resource_relentless_rage` resets on `short_rest` after Task 1.)

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @project/web exec vitest run src/hooks/__tests__/useFeatures.test.ts`
Expected: FAIL. The charges entry has no `kind`, and the uses pool is missing.

- [ ] **Step 3: Rewrite the hook**

Replace `apps/web/src/hooks/useFeatures.ts` with:

```ts
import { useMemo } from "react";
import { useCharacterSheetStore } from "../store/characterSheetStore";
import { getResourceMaxUses, resolveResourceRule } from "@project/engine";

/** A pool spent down from a maximum and refilled on a rest, like Rage. */
export interface ChargesFeature {
  kind: "charges";
  id: string;
  name: string;
  current: number;
  max: number;
  resetCondition: string;
  isDepleted: boolean;
}

/**
 * A pool counted up from zero and reset on a rest, like Relentless Rage's.
 * It has no maximum: the count is what raises the save's DC.
 */
export interface UsesFeature {
  kind: "uses";
  id: string;
  name: string;
  used: number;
  resetCondition: string;
}

export type FeaturePool = ChargesFeature | UsesFeature;

export const useFeatures = (): FeaturePool[] => {
  const operationalResources = useCharacterSheetStore(
    (state) => state.resources,
  );
  const totalLevel = useCharacterSheetStore((state) => state.level);

  const classLevels = useCharacterSheetStore((state) => state.classLevels);
  const ruleSnapshot = useCharacterSheetStore((state) => state.ruleSnapshot);

  return useMemo(
    () =>
      operationalResources.flatMap((opResource): FeaturePool[] => {
        const definition = resolveResourceRule(
          opResource.id,
          ruleSnapshot ?? undefined,
        );

        // failsafe: if the dictionary lacks the feature, ignore it
        if (!definition) return [];

        // counted, not spent: its maximum is 0 by design, so the guard below
        // hid it, and Relentless Rage's counter never rendered
        if (definition.mode === "uses") {
          return [
            {
              kind: "uses",
              id: opResource.id,
              name: definition.name,
              used: opResource.current,
              resetCondition: definition.resetCondition,
            },
          ];
        }

        const maxUses = getResourceMaxUses(
          definition,
          totalLevel,
          classLevels,
        );

        // failsafe: if character lost levels or doesn't meet requirements, hide it
        if (maxUses <= 0) return [];

        return [
          {
            kind: "charges",
            id: opResource.id,
            name: definition.name,
            current: Math.min(opResource.current, maxUses), // clamp to prevent overflow
            max: maxUses,
            resetCondition: definition.resetCondition,
            isDepleted: opResource.current <= 0,
          },
        ];
      }),
    [operationalResources, totalLevel, classLevels, ruleSnapshot],
  );
};
```

Normalise it to CRLF.

- [ ] **Step 4: Run the hook test**

Run: `pnpm --filter @project/web exec vitest run src/hooks/__tests__/useFeatures.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing widget test**

```tsx
// apps/web/src/components/sheet/__tests__/FeaturesWidget.test.tsx
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import type { FeaturePool } from "../../../hooks/useFeatures";
import { FeaturesWidget } from "../FeaturesWidget";

const mocks = vi.hoisted(() => ({
  features: { current: [] as FeaturePool[] },
  consumeResource: vi.fn(),
}));

vi.mock("../../../hooks/useFeatures", () => ({
  useFeatures: () => mocks.features.current,
}));

vi.mock("../../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ consumeResource: mocks.consumeResource }),
}));

const renderWidget = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<FeaturesWidget />);
  });

  return container;
};

describe("FeaturesWidget", () => {
  it("counts a uses pool and offers no Use button, because the save spends it", async () => {
    mocks.features.current = [
      {
        kind: "uses",
        id: "resource_relentless_rage",
        name: "Relentless Rage Uses",
        used: 1,
        resetCondition: "short_rest",
      },
    ];

    const container = await renderWidget();

    expect(container.textContent).toContain("Relentless Rage Uses");
    expect(container.textContent).toContain("Used 1 since your last rest");
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("says long rest for a uses pool that resets only on one", async () => {
    mocks.features.current = [
      {
        kind: "uses",
        id: "resource_test",
        name: "Test Uses",
        used: 0,
        resetCondition: "long_rest",
      },
    ];

    const container = await renderWidget();

    expect(container.textContent).toContain("Used 0 since your last long rest");
  });

  it("keeps the Use button on a charges pool", async () => {
    mocks.features.current = [
      {
        kind: "charges",
        id: "resource_barbarian_rage",
        name: "Rage",
        current: 2,
        max: 3,
        resetCondition: "long_rest",
        isDepleted: false,
      },
    ];

    const container = await renderWidget();

    expect(container.textContent).toContain("Uses: 2 / 3");
    expect(container.querySelector("button")?.textContent).toBe("Use");
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `pnpm --filter @project/web exec vitest run src/components/sheet/__tests__/FeaturesWidget.test.tsx`
Expected: FAIL. The uses row renders `Uses: undefined / undefined` with a Use button.

- [ ] **Step 7: Render the uses row**

Replace `apps/web/src/components/sheet/FeaturesWidget.tsx` with:

```tsx
import { useFeatures } from "../../hooks/useFeatures";
import { useCharacterSheetStore } from "../../store/characterSheetStore";

/** How a uses pool's count is qualified, by when it resets. */
const SINCE: Record<string, string> = {
  short_rest: "since your last rest",
  long_rest: "since your last long rest",
};

export const FeaturesWidget = () => {
  const features = useFeatures();
  const consumeResource = useCharacterSheetStore(
    (state) => state.consumeResource,
  );

  if (features.length === 0) {
    return null;
  }

  return (
    <div className="bg-white border-2 border-gray-300 p-4 rounded shadow-sm mb-4">
      <h2 className="font-bold border-b-2 border-gray-800 pb-1 mb-3 uppercase">
        Class Features
      </h2>

      <div className="flex flex-col gap-3">
        {features.map((feature) =>
          feature.kind === "uses" ? (
            // a count, not a charge: no Use button, because the action that
            // counts it (Relentless Rage's save) is what spends it
            <div
              key={feature.id}
              className="border border-gray-200 p-2 rounded bg-gray-50"
            >
              <div className="font-bold text-gray-900 text-sm">
                {feature.name}
              </div>
              <div className="text-xs text-gray-500 font-mono">
                Used {feature.used}{" "}
                {SINCE[feature.resetCondition] ?? "since it last reset"}
              </div>
            </div>
          ) : (
            <div
              key={feature.id}
              className="flex justify-between items-center border border-gray-200 p-2 rounded bg-gray-50"
            >
              <div>
                <div className="font-bold text-gray-900 text-sm">
                  {feature.name}
                </div>
                <div className="text-xs text-gray-500 font-mono">
                  Uses: {feature.current} / {feature.max} • Resets:{" "}
                  {feature.resetCondition.replace("_", " ")}
                </div>
              </div>

              <button
                onClick={() => consumeResource(feature.id, 1)}
                disabled={feature.isDepleted}
                className={`px-4 py-1 text-xs uppercase rounded shadow-sm transition-colors ${feature.isDepleted ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}
              >
                {feature.isDepleted ? "Expended" : "Use"}
              </button>
            </div>
          ),
        )}
      </div>
    </div>
  );
};
```

Normalise it to CRLF.

- [ ] **Step 8: Run the web suites that cover the change, and typecheck**

Run: `pnpm --filter @project/web exec vitest run src/hooks src/components/sheet`
Expected: PASS.
Run from `apps/web`: `npx tsc -b`
Expected: clean. If another consumer of `useFeatures` fails to typecheck against the union, narrow it on `kind` there; `grep -rn "useFeatures()" apps/web/src` lists the consumers.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/hooks/useFeatures.ts apps/web/src/hooks/__tests__/useFeatures.test.ts apps/web/src/components/sheet/FeaturesWidget.tsx apps/web/src/components/sheet/__tests__/FeaturesWidget.test.tsx
git commit -F - <<'EOF'
feat(web): uses pools show in Class Features

A uses pool's maximum is 0 by design, and useFeatures hid every pool
with none, so Relentless Rage's counter never rendered. It now shows as
"Used N since your last rest", with no Use button: the save spends it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 9: Close the barbarian burndown, and verify the branch

**Files:**
- Modify: `packages/database/src/__tests__/implementationMarkers.test.ts` (the comment above `441`)
- Modify: `docs/TODO_BACKLOG.md`
- Modify: `docs/superpowers/plans/2026-09-02-barbarian-traits.md` (append), `docs/superpowers/specs/2026-09-02-barbarian-traits-design.md` (status line)

- [ ] **Step 1: The marker comment**

In `packages/database/src/__tests__/implementationMarkers.test.ts`, replace

```ts
    // 447 of 585. The barbarian pass authored Primal Champion, Bear aspect
    // and Eagle totem, then deleted the two obsolete Primal Path signposts.
```

with

```ts
    // 441 of 585. The barbarian is at zero: all 21 of its stubs are authored
    // or, for the two Primal Path signposts, deleted.
```

Normalise it to CRLF.

- [ ] **Step 2: The backlog**

In `docs/TODO_BACKLOG.md`, make four replacements.

(a) In the Tier 1 paragraph, replace

```
and its first class is under way: `feat/barbarian-traits` closed 15 of the barbarian's 21 stubs and built
```

with

```
and its first class is done: `feat/barbarian-traits` closed all 21 of the barbarian's stubs and built
```

(b) Replace the start of the #30 row

```
| 4 | **#30** — reachable trait stubs | **447** | Re-measured 2026-09-02 after the barbarian pass, which closed 15 and deleted the two Primal Path signposts: 462 → 447, of 585 traits rather than 587.
```

with

```
| 4 | **#30** — reachable trait stubs | **441** | Re-measured 2026-09-19 after the barbarian pass closed all 21, two of them by deleting the Primal Path signposts: 462 → 441, of 585 traits rather than 587.
```

(c) Replace `playing what. Only the barbarian row was re-counted on 2026-09-02; the other` with `playing what. Only the barbarian row was re-counted on 2026-09-19; the other`, and the row `| | | **barbarian** | **6** |` with `| | | **barbarian** | **0** |`.

(d) Replace a block of three parts, keeping the line after it. The block starts at the line beginning "Barbarian is the worked example and is now most of the way down." It covers that paragraph, the six-row "Trait | Waiting on" table after it, and the lines "The design for all six is settled in", the spec path, and the line ending "…/plans/2026-09-02-barbarian-traits.md`." It stops before the line beginning "Races are nearly done", which stays. Replace the block with:

```
Barbarian is the worked example, and it is done: all 21 of its stubs closed
on `feat/barbarian-traits`. Slices 1 to 3 built the table-note surface and
closed fifteen: nine sheet helpers carrying table notes, Bear totem's
twelve resistances, Primal Champion, Eagle totem, the Bear aspect, and the
two Primal Path signposts deleted outright. The last six (Frenzy,
Retaliation, Mindless Rage, Indomitable Might, Intimidating Presence and
Relentless Rage) arrived with the engine vocabulary they needed: dynamic
weapon attacks, condition suppression, the `minimum_total` dice rule, the
`save` DC, `self_save` and uses-mode resources. Each reaches the sheet:
attack cards, suspended conditions, a Relentless Rage save on the Rules
panel, and a uses count in Class Features.

The designs are
`docs/superpowers/specs/2026-09-02-barbarian-traits-design.md` and
`docs/superpowers/specs/2026-09-19-barbarian-sheet-surfaces-design.md`.
```

Leave the following `Races are nearly done` sentence as it is. Then normalise the backlog to CRLF:

```bash
node -e "const fs=require('fs');const p='docs/TODO_BACKLOG.md';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/\r?\n/g,'\r\n'))"
```

Check: `grep -n "barbarian" docs/TODO_BACKLOG.md | head -20` shows no remaining "15 of", "447" or "**6**" for the barbarian.

- [ ] **Step 3: The 2026-09-02 plan and spec**

Append to `docs/superpowers/plans/2026-09-02-barbarian-traits.md`:

```md

---

## Closing note (2026-09-19)

This plan carried Slices 1 to 3. Slices 4 to 8 were never written here: they
were implemented by hand, following the design spec directly, and committed as
`46f2136`. The sheet surfaces those slices needed, and three corrections to
that commit, are specified in
`docs/superpowers/specs/2026-09-19-barbarian-sheet-surfaces-design.md` and
planned in `docs/superpowers/plans/2026-09-19-barbarian-sheet-surfaces.md`.
```

In `docs/superpowers/specs/2026-09-02-barbarian-traits-design.md`, replace `Status: approved, ready to plan` with:

```
Status: implemented. Slices 1 to 3 from the plan, 4 to 8 by hand in
`46f2136`; the sheet surfaces follow
`2026-09-19-barbarian-sheet-surfaces-design.md`.
```

Both files are LF.

- [ ] **Step 4: Verify the branch**

Run: `pnpm test:all`
Expected: PASS: hygiene, then all five packages.
Run: `pnpm --filter @project/shared typecheck && pnpm --filter @project/engine typecheck && pnpm --filter @project/database typecheck && pnpm --filter @project/server typecheck`, then from `apps/web`: `npx tsc -b`
Expected: clean.
Run: `pnpm --filter @project/database schemas:generate && git status --short packages/database/data/schemas`
Expected: no output.
Run: `pnpm --filter @project/database db:import-pack` only if a development database is running. If none is, say so in the commit body.

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/__tests__/implementationMarkers.test.ts docs/TODO_BACKLOG.md docs/superpowers/plans/2026-09-02-barbarian-traits.md docs/superpowers/specs/2026-09-02-barbarian-traits-design.md
git commit -F - <<'EOF'
docs: the barbarian burndown is closed

All 21 barbarian stubs are authored or deleted and each reaches the
sheet. #30 re-measured at 441. The 2026-09-02 plan records that Slices 4
to 8 were built by hand, and the marker comment matches its count.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```
