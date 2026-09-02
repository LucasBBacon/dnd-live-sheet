# Barbarian Traits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the barbarian's 21 rule-free traits by giving the engine the vocabulary it lacks (table notes with a sheet panel, condition suppression, a minimum-total dice rule, dynamic weapon attacks, uses-mode resources and a `self_save` effect) and authoring every trait against it.

**Architecture:** Eight vertical slices, cheap to expensive, each landing an engine piece with its traits and tests so the branch is green after every task. Rules the engine cannot enforce reach the player through one new "Rules at the table" panel fed by pure reporters in `packages/engine/src/calculators/`. Trait-granted resources reach the rule snapshot and the server materialises missing pool rows, which is what lets Relentless Rage's counter exist at all.

**Tech Stack:** TypeScript monorepo (pnpm + turbo), Zod schemas in `packages/shared`, pure calculators in `packages/engine`, drizzle/Postgres in `packages/database`, socket.io gateway in `apps/server`, React + zustand in `apps/web`, vitest everywhere.

Spec: `docs/superpowers/specs/2026-09-02-barbarian-traits-design.md`. Read it first; every decision below is settled there.

## Global Constraints

- Branch is `feat/barbarian-traits`. Every task ends with a commit whose message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Pack JSON under `packages/database/data/packs/core_2014_pack/` is CRLF with 4-space indentation, and `classes/barbarian.json` has no trailing newline. Never edit those files with the Edit or Write tools. Use the patch script from Task 2, which preserves both.
- `docs/superpowers/**/*.md` are LF. `docs/TODO_BACKLOG.md` is CRLF; after editing it, run `node -e "const fs=require('fs');const p='docs/TODO_BACKLOG.md';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/\r?\n/g,'\r\n'))"` from the repo root.
- Never run `tsc -b` inside `packages/database` (it emits `.js` beside every source file and fails hygiene). Typecheck commands: `pnpm --filter @project/shared typecheck`, `pnpm --filter @project/engine typecheck`, `pnpm --filter @project/database typecheck`, `pnpm --filter @project/server typecheck`, and for web `npx tsc -b` run from `apps/web`.
- A shared-schema change must be followed by `pnpm --filter @project/database schemas:generate`, and the regenerated files under `packages/database/data/schemas/` committed with it; `packSchemas.test.ts` fails otherwise.
- Identifiers are contracts: `status_raging`, `status_wearing_heavy_armor`, `resource_barbarian_rage`, `class_barbarian` are spelled exactly as they appear here. Prose in `lore` and `implementation.summary` uses British spelling (armour, defence) but never alters an id.
- Every state a table note, effect predicate or affinity gates on must be one the runtime emits. Slice 1 adds a test that enforces this; do not add a `status_` id that nothing grants.
- `implementation.mode` is `engine` only when a calculator applies the rule; `manual_sheet_helper` when the rule is a table note; a helper must carry at least one `tableNotes` entry.
- Run the single test file named in each step, not the whole suite, until the task's final verification step.

---

## File Structure

**Created**

| File | Responsibility |
| --- | --- |
| `packages/database/scripts/patchPackSegment.ts` | Applies a JSON patch (upsert traits, delete traits, remove progression grants) to a pack segment while preserving CRLF, indentation and the trailing-newline state. |
| `packages/engine/src/calculators/affinities.ts` | `AffinityEngine.describe`: active damage affinities from traits and states, collapsed to "all damage except X" where a source covers every type but one. |
| `packages/engine/src/calculators/tableRules.ts` | `TableRulesEngine.describe`: the lines the "Rules at the table" panel shows. |
| `packages/engine/src/calculators/conditionSuppression.ts` | `suppressConditions`: which toggled conditions are suspended by a trait, and by whom. |
| `packages/engine/src/calculators/saveDc.ts` | `resolveSelfSaveDc`: a self-save DC from its rule and the uses so far. |
| `packages/engine/src/calculators/relentlessRage.ts` | `RelentlessRageEngine.describe`: availability, DC and the line for the panel. |
| `packages/engine/src/pipeline/dynamicWeaponAttacks.ts` | Turns a `dynamic_weapon_attack` grant plus an equipped weapon into one concrete attack action. |
| `apps/web/src/components/sheet/TableRulesWidget.tsx` | Renders the reporter lines and the Relentless Rage button. |
| `packages/database/src/__tests__/tableNotes.test.ts` | The two invariants: helpers carry notes; note predicates name emitted states. |

**Modified**

| File | Change |
| --- | --- |
| `packages/shared/src/schemas/content/traits.ts` | `TableNoteSchema`, `ConditionSuppressionSchema`, optional `tableNotes` and `conditionSuppressions`. |
| `packages/shared/src/schemas/content/resources.ts` | `ChargesResourceSchema`, `UsesResourceSchema`, union `ResourceSchema`. |
| `packages/shared/src/schemas/content/actions.ts` | `SelfSaveEffectSchema`, `SaveDcRuleSchema`, state predicate on `DynamicWeaponAttackSchema`, exported effect types. |
| `packages/shared/src/schemas/content/dice.ts` | `minimum_total`, `floorSource`, `requiredAbility`. |
| `packages/shared/src/schemas/content/validatePack.ts` | Condition ids, self-save resource references, note predicate states. |
| `packages/shared/src/schemas/runtime/ruleSnapshot.ts` | `resourcesById` on `CoreRulePackSnapshot` and `toRuleSnapshot`. |
| `packages/engine/src/calculators/abilities.ts` | Per-ability cap states. |
| `packages/engine/src/calculators/encumbrance.ts` | `carrying_capacity_doubled`. |
| `packages/engine/src/calculators/resources.ts`, `rests.ts`, `utils/resourceRules.ts` | Uses mode; `collectGrantedResources`; `materialiseMissingPools`. |
| `packages/engine/src/utils/diceParser.ts` | `minimum_total`, ability context, `flooredBy`. |
| `packages/engine/src/pipeline/actionResolver.ts` | `self_save`; `save` reports its DC and rolls damage; new context inputs. |
| `packages/engine/src/pipeline/characterEngine.ts` | Dynamic weapon attack synthesis; capacity state. |
| `packages/engine/src/pipeline/characterBootstrapper.ts` | `selectionsFromChosenTraitIds`. |
| `packages/engine/src/rules/packLookup.ts` | Reads `resourcesById` from `toRuleSnapshot`. |
| `packages/engine/src/index.ts` | Exports the new calculators and pipeline helper. |
| `apps/server/src/gateway/socket.ts` | Subclass and selections on the save; pool materialisation; resolver inputs; heal generalisation; snapshot passed to `compileActiveTraits`. |
| `apps/server/src/services/ruleSnapshotCache.ts` | Reads the shared `resourcesById`. |
| `apps/server/src/routes/character.ts` | Sheet payload carries `classes` with `subclassId`. |
| `apps/web/src/store/characterSheetStore.ts` | `subclassIds`, `getActiveTraits`, `getDiceRules`, `suspendedConditions`, suppression in `composeActiveStates`, pool materialisation on initialize, template filtering in `getCharacterActions`. |
| `apps/web/src/pages/characterSheetRouteData.ts` | Hydrates `subclassIds`. |
| `apps/web/src/hooks/useCombat.ts` | Dynamic attack cards. |
| `apps/web/src/hooks/useCheckRoll.ts`, `SkillsWidget.tsx`, `SavingThrowsWidget.tsx` | Dice rules on sheet checks. |
| `apps/web/src/hooks/useFeatures.ts`, `FeaturesWidget.tsx` | Uses-mode display. |
| `apps/web/src/components/sheet/ConditionsWidget.tsx` | Suspended rendering. |
| `apps/web/src/components/sheet/DashboardLayout.tsx` | Mounts `TableRulesWidget`. |
| `packages/database/src/__tests__/implementationMarkers.test.ts` | `carriesRules` learns the two new channels; counts refreshed per task. |
| `packages/database/src/__tests__/barbarianPack.test.ts` | One `describe` per authored trait. |
| Pack: `classes/barbarian.json`, `traits/ported.json`, `traits/unimplemented.json` | The 21 traits, Rage's note, Protection's note, the signpost deletions. |

---

## Slice 1: Table notes, the reporters, the panel, and the helper traits

### Task 1: `tableNotes` on the trait schema

**Files:**
- Modify: `packages/shared/src/schemas/content/traits.ts`
- Test: `packages/shared/src/schemas/__tests__/tableNotes.test.ts`
- Regenerate: `packages/database/data/schemas/*.schema.json`

**Interfaces:**
- Produces: `TableNoteSchema`, type `TableNote = { text: string; requiredStates: string[]; forbiddenStates: string[] }`, and `TraitDefinition.tableNotes?: TableNote[]`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/schemas/__tests__/tableNotes.test.ts
import { describe, expect, it } from "vitest";
import { TraitDefinitionSchema } from "../content/traits.js";

const trait = (extra: Record<string, unknown>) => ({
  id: "trait_example",
  name: "Example",
  ...extra,
});

describe("TraitDefinitionSchema.tableNotes", () => {
  it("parses a gated note and defaults the half of the predicate it omits", () => {
    const parsed = TraitDefinitionSchema.parse(
      trait({
        tableNotes: [{ text: "While raging, x.", requiredStates: ["status_raging"] }],
      }),
    );

    expect(parsed.tableNotes).toEqual([
      { text: "While raging, x.", requiredStates: ["status_raging"], forbiddenStates: [] },
    ]);
  });

  it("stays absent when a trait authors none", () => {
    expect(TraitDefinitionSchema.parse(trait({})).tableNotes).toBeUndefined();
  });

  it("rejects an empty note", () => {
    expect(
      TraitDefinitionSchema.safeParse(trait({ tableNotes: [{ text: "" }] })).success,
    ).toBe(false);
  });

  it("rejects a note longer than 240 characters", () => {
    expect(
      TraitDefinitionSchema.safeParse(
        trait({ tableNotes: [{ text: "x".repeat(241) }] }),
      ).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @project/shared exec vitest run src/schemas/__tests__/tableNotes.test.ts`
Expected: FAIL. The first test's `toEqual` fails because `tableNotes` is stripped or the parse rejects an unknown key.

- [ ] **Step 3: Add the schema**

In `packages/shared/src/schemas/content/traits.ts`, add the import and the schema above `TraitDefinitionSchema`:

```ts
import { StatePredicateSchema } from "../primitives/statePredicate.js";

/**
 * Player-facing rule text the engine cannot enforce, shown on the sheet while
 * its predicate holds.
 *
 * Distinct from `implementation.summary`, which explains delivery to a
 * maintainer, and from an action's `tableNote`, which belongs to one action's
 * execution. Wolf totem's "your allies have advantage" lands on rolls this
 * single-character sheet never sees; this is how it reaches the table anyway.
 */
export const TableNoteSchema = z.object({
  text: z.string().min(1).max(240),
  ...StatePredicateSchema.shape,
});

export type TableNote = z.infer<typeof TableNoteSchema>;
```

and the field on `TraitDefinitionSchema`, after `grantedStates`:

```ts
  /**
   * Rules reported at the table rather than applied by a calculator. Optional
   * for the reason `grantedStates` is: a default would make it required on
   * every hand-written trait literal.
   */
  tableNotes: z.array(TableNoteSchema).optional(),
```

- [ ] **Step 4: Run the test and the shared suite**

Run: `pnpm --filter @project/shared exec vitest run src/schemas/__tests__/tableNotes.test.ts`
Expected: PASS (4 tests).
Run: `pnpm --filter @project/shared test --run`
Expected: PASS.

- [ ] **Step 5: Regenerate the JSON schemas and confirm the no-diff test**

Run: `pnpm --filter @project/database schemas:generate`
Run: `pnpm --filter @project/database exec vitest run src/__tests__/packSchemas.test.ts`
Expected: PASS. `git status` shows changed files under `packages/database/data/schemas/`.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas/content/traits.ts packages/shared/src/schemas/__tests__/tableNotes.test.ts packages/database/data/schemas
git commit -m "feat(shared): tableNotes on the trait contract

Player-facing rule text gated on states, for rules the engine can only
report. Distinct from implementation.summary, which is for maintainers.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: A pack-segment patch script that preserves line endings

**Files:**
- Create: `packages/database/scripts/patchPackSegment.ts`

**Interfaces:**
- Produces: CLI `pnpm --filter @project/database exec tsx scripts/patchPackSegment.ts <segment.json> <patch.json>` where the patch is `{ "upsertTraits"?: TraitJson[], "deleteTraitIds"?: string[], "removeProgressionGrants"?: Record<classId, string[]> }`. Every later authoring task uses it.

- [ ] **Step 1: Write the script**

```ts
// packages/database/scripts/patchPackSegment.ts
import fs from "node:fs";

/**
 * Applies a small structural patch to one pack segment.
 *
 * Exists because the pack files are CRLF with four-space indentation, one of
 * them has no trailing newline, and the Edit tool rewrites all of that. Parsing
 * and re-printing with the file's own endings is lossless for every segment
 * (verified by round-tripping each one before this script was written).
 */
type Patch = {
  upsertTraits?: Array<{ id: string } & Record<string, unknown>>;
  deleteTraitIds?: string[];
  /** Class id -> trait ids to strip from every progression row's grants. */
  removeProgressionGrants?: Record<string, string[]>;
};

type Segment = {
  traits?: Array<{ id: string }>;
  classes?: Array<{ id: string; progression: Array<{ grants: unknown[] }> }>;
};

const [segmentPath, patchPath] = process.argv.slice(2);
if (!segmentPath || !patchPath) {
  console.error(
    "usage: tsx scripts/patchPackSegment.ts <segment.json> <patch.json>",
  );
  process.exit(1);
}

const raw = fs.readFileSync(segmentPath, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const trailingEol = raw.endsWith("\n");
const segment = JSON.parse(raw) as Segment;
const patch = JSON.parse(fs.readFileSync(patchPath, "utf8")) as Patch;

for (const id of patch.deleteTraitIds ?? []) {
  const index = (segment.traits ?? []).findIndex((trait) => trait.id === id);
  if (index === -1) {
    throw new Error(`${segmentPath} has no trait '${id}' to delete`);
  }
  segment.traits!.splice(index, 1);
}

for (const trait of patch.upsertTraits ?? []) {
  segment.traits ??= [];
  const index = segment.traits.findIndex((entry) => entry.id === trait.id);
  if (index === -1) segment.traits.push(trait);
  else segment.traits[index] = trait;
}

for (const [classId, ids] of Object.entries(
  patch.removeProgressionGrants ?? {},
)) {
  const entry = (segment.classes ?? []).find((cls) => cls.id === classId);
  if (!entry) throw new Error(`${segmentPath} has no class '${classId}'`);
  for (const level of entry.progression) {
    level.grants = level.grants.filter(
      (grant) => typeof grant !== "string" || !ids.includes(grant),
    );
  }
}

const printed = JSON.stringify(segment, null, 4).split("\n").join(eol);
fs.writeFileSync(segmentPath, trailingEol ? printed + eol : printed);
console.log(`patched ${segmentPath}`);
```

- [ ] **Step 2: Prove it is lossless with an empty patch**

Write `{}` to a scratch file, then from the repo root:

```bash
printf '{}' > "$TMPDIR/empty-patch.json"
pnpm --filter @project/database exec tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/classes/barbarian.json "$TMPDIR/empty-patch.json"
pnpm --filter @project/database exec tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/traits/ported.json "$TMPDIR/empty-patch.json"
pnpm --filter @project/database exec tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/traits/unimplemented.json "$TMPDIR/empty-patch.json"
git status --short packages/database/data/packs
```

Expected: `git status` prints nothing for the pack. If any file shows as modified, stop: the round-trip is not lossless for it and the script must not be used on it.

(`$TMPDIR` is the session scratchpad directory. Use any writable temp path.)

- [ ] **Step 3: Typecheck and hygiene**

Run: `pnpm --filter @project/database typecheck`
Run: `pnpm check:hygiene`
Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/database/scripts/patchPackSegment.ts
git commit -m "chore(database): pack segment patch script that keeps CRLF and indentation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 3: `AffinityEngine`, the first consumer of the affinities block

**Files:**
- Create: `packages/engine/src/calculators/affinities.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/src/calculators/__tests__/affinities.test.ts`

**Interfaces:**
- Produces: `AffinityEngine.describe({ traits, activeStates }): ActiveAffinity[]` with `ActiveAffinity = { level: AffinityLevel; source: string; damageTypes: DamageType[]; bypassedBy: DamageBypass[]; summary: string }`; `REAL_DAMAGE_TYPES`; `listWords(items: string[]): string`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/src/calculators/__tests__/affinities.test.ts
import { describe, expect, it } from "vitest";
import type { TraitDefinition } from "@project/shared";
import { AffinityEngine, REAL_DAMAGE_TYPES, listWords } from "../affinities.js";
import { corePackSnapshot } from "../../pipeline/__tests__/corePackFixture.js";

const rage = (): TraitDefinition => {
  const trait = corePackSnapshot().traitsById["trait_rage"];
  if (!trait) throw new Error("trait_rage missing from the shipped pack");
  return trait;
};

const bearLike = (): TraitDefinition => ({
  id: "trait_test_bear",
  name: "Test Bear",
  modifiers: { fixed: [], choices: [] },
  affinities: {
    fixed: REAL_DAMAGE_TYPES.filter((type) => type !== "psychic").map((type) => ({
      damageType: type,
      level: "resistance" as const,
      bypassedBy: [],
      requiredStates: ["status_raging"],
    })),
    choices: [],
  },
  resources: [],
  triggers: [],
  diceRules: [],
  criticalHitModifiers: [],
  actions: [],
});

describe("AffinityEngine.describe", () => {
  it("reports nothing for Rage while not raging", () => {
    expect(AffinityEngine.describe({ traits: [rage()], activeStates: [] })).toEqual([]);
  });

  it("groups Rage's three resistances into one line while raging", () => {
    const [line, ...rest] = AffinityEngine.describe({
      traits: [rage()],
      activeStates: ["status_raging"],
    });

    expect(rest).toEqual([]);
    expect(line).toMatchObject({ level: "resistance", source: "Rage" });
    expect(line?.damageTypes).toEqual(["bludgeoning", "piercing", "slashing"]);
    expect(line?.summary).toBe("Resistance to bludgeoning, piercing and slashing damage");
  });

  it("collapses every type but one into 'all damage except'", () => {
    const [line] = AffinityEngine.describe({
      traits: [bearLike()],
      activeStates: ["status_raging"],
    });

    expect(line?.summary).toBe("Resistance to all damage except psychic");
  });

  it("keeps Rage and Bear as separate lines because they are separate sources", () => {
    const lines = AffinityEngine.describe({
      traits: [rage(), bearLike()],
      activeStates: ["status_raging"],
    });

    expect(lines.map((line) => line.source)).toEqual(["Rage", "Test Bear"]);
  });
});

describe("listWords", () => {
  it("joins with commas and a final 'and'", () => {
    expect(listWords(["a"])).toBe("a");
    expect(listWords(["a", "b"])).toBe("a and b");
    expect(listWords(["a", "b", "c"])).toBe("a, b and c");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @project/engine exec vitest run src/calculators/__tests__/affinities.test.ts`
Expected: FAIL, cannot resolve `../affinities.js`.

- [ ] **Step 3: Write the calculator**

```ts
// packages/engine/src/calculators/affinities.ts
import {
  DamageTypeSchema,
  type AffinityLevel,
  type DamageBypass,
  type DamageType,
  type TraitDefinition,
} from "@project/shared";

/**
 * What a character currently resists, is immune to, or is vulnerable to.
 *
 * The `affinities` block had been authored on Rage since the pack cutover and
 * read by nothing: no calculator, no widget. This is its first consumer. It
 * reports rather than applies, because the sheet has no incoming-damage path
 * to halve anything on; the player reads the line and halves the hit.
 */

/** Every damage type a creature can actually take. `same_as_weapon` is a rider marker. */
export const REAL_DAMAGE_TYPES: DamageType[] = DamageTypeSchema.options.filter(
  (type) => type !== "same_as_weapon",
);

export interface ActiveAffinity {
  level: AffinityLevel;
  source: string;
  damageTypes: DamageType[];
  bypassedBy: DamageBypass[];
  /** The sentence the panel shows. */
  summary: string;
}

export interface AffinityInput {
  traits: TraitDefinition[];
  activeStates: string[];
}

const LEVEL_LABEL: Record<AffinityLevel, string> = {
  resistance: "Resistance to",
  immunity: "Immunity to",
  vulnerability: "Vulnerability to",
};

export const listWords = (items: string[]): string => {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
};

const humanise = (type: string): string => type.replaceAll("_", " ");

/**
 * "all damage except psychic" rather than twelve names: a source that covers
 * every type but one is describing an exception, not a list.
 */
const describeTypes = (types: DamageType[]): string => {
  const missing = REAL_DAMAGE_TYPES.filter((type) => !types.includes(type));
  if (missing.length === 0) return "all damage";
  if (missing.length === 1) return `all damage except ${humanise(missing[0]!)}`;
  return `${listWords(types.map(humanise))} damage`;
};

export class AffinityEngine {
  public static describe({ traits, activeStates }: AffinityInput): ActiveAffinity[] {
    const groups = new Map<string, ActiveAffinity>();

    for (const trait of traits) {
      for (const grant of trait.affinities?.fixed ?? []) {
        const required = grant.requiredStates ?? [];
        if (!required.every((state) => activeStates.includes(state))) continue;
        if (grant.damageType === "same_as_weapon") continue;

        const bypassedBy = [...(grant.bypassedBy ?? [])].sort();
        const key = `${trait.id}|${grant.level}|${bypassedBy.join(",")}`;
        const group = groups.get(key) ?? {
          level: grant.level,
          source: trait.name,
          damageTypes: [],
          bypassedBy,
          summary: "",
        };
        if (!group.damageTypes.includes(grant.damageType)) {
          group.damageTypes.push(grant.damageType);
        }
        groups.set(key, group);
      }
    }

    return [...groups.values()].map((group) => ({
      ...group,
      summary:
        `${LEVEL_LABEL[group.level]} ${describeTypes(group.damageTypes)}` +
        (group.bypassedBy.length > 0
          ? ` (bypassed by ${listWords(group.bypassedBy)})`
          : ""),
    }));
  }
}
```

Add to `packages/engine/src/index.ts`, after the `surprise.js` export line:

```ts
export * from "./calculators/affinities.js";
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @project/engine exec vitest run src/calculators/__tests__/affinities.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/calculators/affinities.ts packages/engine/src/calculators/__tests__/affinities.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): AffinityEngine reports active damage affinities

The affinities block has been authored on Rage since the cutover and read
by nothing. This is its first consumer: a pure reporter for the sheet.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 4: `TableRulesEngine`, the panel's reporter

**Files:**
- Create: `packages/engine/src/calculators/tableRules.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/src/calculators/__tests__/tableRules.test.ts`

**Interfaces:**
- Consumes: `AffinityEngine.describe` (Task 3).
- Produces: `TableRulesEngine.describe({ traits, activeStates }): TableRuleLine[]`, `TableRuleLine = { kind: TableRuleLineKind; source: string; text: string }`, `TableRuleLineKind = "note" | "affinity"` (Task 20 adds `"suppression"`), and the exported predicate helper `predicateHolds(predicate, activeStates)`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/src/calculators/__tests__/tableRules.test.ts
import { describe, expect, it } from "vitest";
import type { TraitDefinition } from "@project/shared";
import { TableRulesEngine, predicateHolds } from "../tableRules.js";

const helper = (overrides: Partial<TraitDefinition> = {}): TraitDefinition => ({
  id: "trait_test_wolf",
  name: "Totem Spirit: Wolf",
  modifiers: { fixed: [], choices: [] },
  tableNotes: [
    {
      text: "While raging, your friends have advantage.",
      requiredStates: ["status_raging"],
      forbiddenStates: [],
    },
  ],
  resources: [],
  triggers: [],
  diceRules: [],
  criticalHitModifiers: [],
  actions: [],
  ...overrides,
});

const resistor = (): TraitDefinition =>
  helper({
    id: "trait_test_resist",
    name: "Stone Skin",
    tableNotes: [],
    affinities: {
      fixed: [{ damageType: "fire", level: "resistance", bypassedBy: [], requiredStates: [] }],
      choices: [],
    },
  });

describe("TableRulesEngine.describe", () => {
  it("shows a note only while its predicate holds", () => {
    expect(TableRulesEngine.describe({ traits: [helper()], activeStates: [] })).toEqual([]);

    expect(
      TableRulesEngine.describe({ traits: [helper()], activeStates: ["status_raging"] }),
    ).toEqual([
      { kind: "note", source: "Totem Spirit: Wolf", text: "While raging, your friends have advantage." },
    ]);
  });

  it("hides a note when a forbidden state is active", () => {
    const gated = helper({
      tableNotes: [
        { text: "Rage ends early.", requiredStates: ["status_raging"], forbiddenStates: ["status_persistent_rage"] },
      ],
    });

    expect(
      TableRulesEngine.describe({
        traits: [gated],
        activeStates: ["status_raging", "status_persistent_rage"],
      }),
    ).toEqual([]);
  });

  it("adds an affinity line for each active affinity group", () => {
    expect(TableRulesEngine.describe({ traits: [resistor()], activeStates: [] })).toEqual([
      { kind: "affinity", source: "Stone Skin", text: "Resistance to fire damage" },
    ]);
  });

  it("lists notes before affinities", () => {
    const lines = TableRulesEngine.describe({
      traits: [resistor(), helper()],
      activeStates: ["status_raging"],
    });

    expect(lines.map((line) => line.kind)).toEqual(["note", "affinity"]);
  });
});

describe("predicateHolds", () => {
  it("treats a missing predicate half as empty", () => {
    expect(predicateHolds({}, ["anything"])).toBe(true);
    expect(predicateHolds({ requiredStates: ["a"] }, [])).toBe(false);
    expect(predicateHolds({ forbiddenStates: ["a"] }, ["a"])).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @project/engine exec vitest run src/calculators/__tests__/tableRules.test.ts`
Expected: FAIL, cannot resolve `../tableRules.js`.

- [ ] **Step 3: Write the reporter**

```ts
// packages/engine/src/calculators/tableRules.ts
import type { TraitDefinition } from "@project/shared";
import { AffinityEngine } from "./affinities.js";

/**
 * The lines the "Rules at the table" panel shows.
 *
 * A pure reporter beside SurpriseEngine: traits and states in, sentences out.
 * It never applies anything. A note is a rule the engine cannot enforce; an
 * affinity line is a rule the engine has no damage path to apply. Both are
 * things the player reads and acts on.
 */

export type TableRuleLineKind = "note" | "affinity";

export interface TableRuleLine {
  kind: TableRuleLineKind;
  /** The trait the line came from, as the player knows it. */
  source: string;
  text: string;
}

export interface TableRulesInput {
  traits: TraitDefinition[];
  activeStates: string[];
}

export interface StatePredicateLike {
  requiredStates?: string[];
  forbiddenStates?: string[];
}

export const predicateHolds = (
  predicate: StatePredicateLike,
  activeStates: string[],
): boolean =>
  (predicate.requiredStates ?? []).every((state) => activeStates.includes(state)) &&
  !(predicate.forbiddenStates ?? []).some((state) => activeStates.includes(state));

export class TableRulesEngine {
  public static describe({ traits, activeStates }: TableRulesInput): TableRuleLine[] {
    const lines: TableRuleLine[] = [];

    for (const trait of traits) {
      for (const note of trait.tableNotes ?? []) {
        if (!predicateHolds(note, activeStates)) continue;
        lines.push({ kind: "note", source: trait.name, text: note.text });
      }
    }

    for (const affinity of AffinityEngine.describe({ traits, activeStates })) {
      lines.push({ kind: "affinity", source: affinity.source, text: affinity.summary });
    }

    return lines;
  }
}
```

Add to `packages/engine/src/index.ts` after the affinities export:

```ts
export * from "./calculators/tableRules.js";
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @project/engine exec vitest run src/calculators/__tests__/tableRules.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/calculators/tableRules.ts packages/engine/src/calculators/__tests__/tableRules.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): TableRulesEngine reports notes and affinities for the sheet

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 5: The two pack invariants, and Protection's note

**Files:**
- Create: `packages/database/src/__tests__/tableNotes.test.ts`
- Modify: `packages/database/src/__tests__/implementationMarkers.test.ts:30-45` (`carriesRules`) and `:150-160` (counts)
- Modify (via script): `packages/database/data/packs/core_2014_pack/traits/ported.json` (`trait_fs_protection`)

**Interfaces:**
- Produces: the invariant that every `manual_sheet_helper` carries a note, and that every note predicate names an emitted state. Every authoring task after this must satisfy both.

- [ ] **Step 1: Write the failing invariant test**

```ts
// packages/database/src/__tests__/tableNotes.test.ts
import { describe, expect, it } from "vitest";
import path from "node:path";
import { CONDITION_IDS, STANDARD_ACTIONS, type ActionGrant } from "@project/shared";
import { assembleCoreRulePackSync } from "../corePackAssembler.js";

const SHIPPED_PACK = path.join(process.cwd(), "data/packs/core_2014_pack");

/**
 * States the engine derives itself rather than reading from a trait or an
 * effect: worn armour and held weapons from InventoryExtractor, load from
 * EncumbranceEngine, unmet requirements from ItemRequirementEngine.
 */
const ENGINE_BASE_STATES = [
  "status_wearing_armor",
  "status_wearing_light_armor",
  "status_wearing_heavy_armor",
  "status_wielding_two_handed",
  "status_wielding_one_handed_only",
  "status_item_requirement_unmet",
  "encumbered",
  "heavily_encumbered",
  "over_capacity",
];

const statesGrantedByEffect = (effect: ActionGrant["effect"]): string[] => {
  if (effect.type === "apply_effect") return effect.states;
  if (effect.type === "macro") return effect.effects.flatMap(statesGrantedByEffect);
  return [];
};

/**
 * A marker with no note is the invisibility this panel exists to end: a trait
 * marked manual_sheet_helper and carrying no text reaches nobody.
 */
describe("table notes in the shipped pack", () => {
  it("gives every sheet helper at least one note", () => {
    const pack = assembleCoreRulePackSync(SHIPPED_PACK);

    const silentHelpers = pack.traits
      .filter(
        (trait) =>
          trait.implementation?.mode === "manual_sheet_helper" &&
          (trait.tableNotes ?? []).length === 0,
      )
      .map((trait) => trait.id);

    expect(silentHelpers).toEqual([]);
  });

  it("gates every note on a state something actually emits", () => {
    const pack = assembleCoreRulePackSync(SHIPPED_PACK);

    const emitted = new Set<string>([
      ...CONDITION_IDS,
      ...ENGINE_BASE_STATES,
      ...STANDARD_ACTIONS.flatMap((action) => statesGrantedByEffect(action.effect)),
      ...pack.traits.flatMap((trait) => [
        ...(trait.grantedStates ?? []),
        ...trait.actions.flatMap((action) => statesGrantedByEffect(action.effect)),
      ]),
    ]);

    const unknown = pack.traits.flatMap((trait) =>
      (trait.tableNotes ?? []).flatMap((note) =>
        [...note.requiredStates, ...note.forbiddenStates]
          .filter((state) => !emitted.has(state))
          .map((state) => `${trait.id}: ${state}`),
      ),
    );

    expect(unknown).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch the first test fail**

Run: `pnpm --filter @project/database exec vitest run src/__tests__/tableNotes.test.ts`
Expected: the first test FAILS with `["trait_fs_protection"]`, the one helper the pack already carries. The second PASSES (no notes exist yet).

- [ ] **Step 3: Give Protection its note**

Write this patch to a scratch file `protection-patch.json`:

```json
{
  "upsertTraits": [
    {
      "id": "trait_fs_protection",
      "name": "Fighting Style: Protection",
      "lore": {
        "shortDescription": "When a creature you can see attacks a target other than you that is within 5 feet of you, you can use your reaction to impose disadvantage on the attack roll. You must be wielding a shield."
      },
      "implementation": {
        "mode": "manual_sheet_helper",
        "summary": "Phase 1 keeps Protection as a sheet-level reaction helper for tabletop play rather than forcing a target-aware enemy model into the engine.",
        "blockedBy": [
          "other_creature_attack_roll_targeting"
        ]
      },
      "tableNotes": [
        {
          "text": "When a creature you can see attacks a target other than you that is within 5 feet of you, you can use your reaction to impose disadvantage on the attack roll. You must be wielding a shield.",
          "requiredStates": [],
          "forbiddenStates": []
        }
      ],
      "modifiers": {
        "fixed": [],
        "choices": []
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

Run: `pnpm --filter @project/database exec tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/traits/ported.json <path-to>/protection-patch.json`

Run: `git diff --stat packages/database/data/packs` and confirm only `traits/ported.json` changed, by a handful of lines.

- [ ] **Step 4: Teach `carriesRules` the new channel and refresh the count**

In `packages/database/src/__tests__/implementationMarkers.test.ts`, inside `carriesRules`, add one line to the returned expression after `len("grantedStates") > 0 ||`:

```ts
    len("tableNotes") > 0 ||
```

Then in the last test, change the count and its comment:

```ts
    // 462 of 587: 343 marked unimplemented and 119 unmarked. Was 463 until
    // trait_fs_protection gained the table note that makes its helper marker
    // visible, and tableNotes started counting as a rule channel.
    expect(pack.traits.filter((trait) => !carriesRules(trait))).toHaveLength(
      462,
    );
```

- [ ] **Step 5: Run both tests**

Run: `pnpm --filter @project/database exec vitest run src/__tests__/tableNotes.test.ts src/__tests__/implementationMarkers.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/database/src/__tests__/tableNotes.test.ts packages/database/src/__tests__/implementationMarkers.test.ts packages/database/data/packs/core_2014_pack/traits/ported.json
git commit -m "test(database): every sheet helper carries a note, and notes gate on emitted states

Protection was the one helper in the pack, and it had no text for the
panel to show. It has one now.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 6: `getActiveTraits` on the store, and the "Rules at the table" widget

**Files:**
- Modify: `apps/web/src/store/characterSheetStore.ts` (state interface near line 651, implementation near line 1147)
- Create: `apps/web/src/components/sheet/TableRulesWidget.tsx`
- Modify: `apps/web/src/components/sheet/DashboardLayout.tsx:204-205`
- Test: `apps/web/src/components/sheet/__tests__/TableRulesWidget.test.tsx`

**Interfaces:**
- Consumes: `TableRulesEngine.describe` (Task 4).
- Produces: store method `getActiveTraits: () => TraitDefinition[]` (compiles the save against the loaded snapshot; Task 11 makes the save carry the subclass). Task 27 adds the Relentless Rage button to this widget.

- [ ] **Step 1: Write the failing widget test**

```tsx
// apps/web/src/components/sheet/__tests__/TableRulesWidget.test.tsx
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import type { TraitDefinition } from "@project/shared";
import { TableRulesWidget } from "../TableRulesWidget";

const wolf: TraitDefinition = {
  id: "trait_totem_spirit_wolf",
  name: "Totem Spirit: Wolf",
  modifiers: { fixed: [], choices: [] },
  tableNotes: [
    {
      text: "While raging, your friends have advantage on melee attack rolls.",
      requiredStates: ["status_raging"],
      forbiddenStates: [],
    },
  ],
  resources: [],
  triggers: [],
  diceRules: [],
  criticalHitModifiers: [],
  actions: [],
};

const mocks = vi.hoisted(() => ({
  activeStates: { current: [] as string[] },
  traits: { current: [] as unknown[] },
}));

vi.mock("../../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (
    selector: (state: {
      activeStates: string[];
      getActiveTraits: () => unknown[];
      ruleSnapshot: null;
      classLevels: Record<string, number>;
      traitGrants: unknown[];
    }) => unknown,
  ) =>
    selector({
      activeStates: mocks.activeStates.current,
      getActiveTraits: () => mocks.traits.current,
      ruleSnapshot: null,
      classLevels: {},
      traitGrants: [],
    }),
}));

const renderWidget = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<TableRulesWidget />);
  });

  return container;
};

describe("TableRulesWidget", () => {
  it("says nothing is active when no line applies", async () => {
    mocks.traits.current = [wolf];
    mocks.activeStates.current = [];

    const container = await renderWidget();

    expect(container.textContent).toContain("Nothing to report");
    expect(container.textContent).not.toContain("your friends have advantage");
  });

  it("shows a note with its source once the gating state is active", async () => {
    mocks.traits.current = [wolf];
    mocks.activeStates.current = ["status_raging"];

    const container = await renderWidget();

    expect(container.textContent).toContain("Totem Spirit: Wolf");
    expect(container.textContent).toContain("your friends have advantage");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @project/web exec vitest run src/components/sheet/__tests__/TableRulesWidget.test.tsx`
Expected: FAIL, cannot resolve `../TableRulesWidget`.

- [ ] **Step 3: Add `getActiveTraits` to the store**

In the `CharacterSheetState` interface, directly above `getCharacterActions: () => ActionGrant[];`:

```ts
  /**
   * The traits the character actually has, compiled from the save against the
   * loaded pack. The single place the sheet resolves "what do I have" so the
   * panel, the action list and the trigger dispatch cannot disagree.
   */
  getActiveTraits: () => TraitDefinition[];
```

In the store implementation, directly above `getCharacterActions: () => {`:

```ts
    getActiveTraits: () => {
      const state = get();
      return CharacterBootstrapper.compileActiveTraits(
        toCharacterSave(state),
        state.ruleSnapshot ?? undefined,
      );
    },
```

Then replace the body of `getCharacterActions` so it reads through the new method (the hydration call stays, because it is what seeds a fresh manager):

```ts
    getCharacterActions: () => {
      const state = get();
      const nextSave = toCharacterSave(state);
      const runtimeEffects = state.runtimeEffects ?? new EffectManager();
      const runtimeResources = state.runtimeResources ?? new ResourceManager();

      CharacterBootstrapper.hydrateRuntimeManagers(
        nextSave,
        runtimeEffects,
        runtimeResources,
        state.ruleSnapshot ?? undefined,
      );

      const activeTraits = get().getActiveTraits();
      // the standard actions are not granted by anything - Dodge is a rule, not
      // a trait - so they are always present, ahead of what traits add
      return [
        ...STANDARD_ACTIONS,
        ...activeTraits.flatMap((trait) => trait.actions ?? []),
      ];
    },
```

- [ ] **Step 4: Write the widget**

```tsx
// apps/web/src/components/sheet/TableRulesWidget.tsx
import { TableRulesEngine, type TableRuleLine } from "@project/engine";
import { useCharacterSheetStore } from "../../store/characterSheetStore";

const KIND_LABEL: Record<TableRuleLine["kind"], string> = {
  note: "Rule",
  affinity: "Damage",
};

/**
 * Rules the engine reports but cannot enforce.
 *
 * Until this existed, a trait marked manual_sheet_helper reached nobody, and
 * Rage's resistances were authored data that no widget read. Every line here
 * comes from TableRulesEngine; the widget computes nothing itself.
 */
export const TableRulesWidget = () => {
  const activeStates = useCharacterSheetStore((state) => state.activeStates);
  const getActiveTraits = useCharacterSheetStore((state) => state.getActiveTraits);
  // read so a snapshot or progression change re-renders the panel; the
  // compile itself reads them through the store
  useCharacterSheetStore((state) => state.ruleSnapshot);
  useCharacterSheetStore((state) => state.classLevels);
  useCharacterSheetStore((state) => state.traitGrants);

  const lines = TableRulesEngine.describe({
    traits: getActiveTraits(),
    activeStates,
  });

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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
```

Mount it in `DashboardLayout.tsx`: add `import { TableRulesWidget } from "./TableRulesWidget";` beside the other widget imports, and render `<TableRulesWidget />` directly after `<ActiveEffectsWidget />`.

- [ ] **Step 5: Run the widget test, the store tests and the dashboard test**

Run: `pnpm --filter @project/web exec vitest run src/components/sheet/__tests__/TableRulesWidget.test.tsx src/components/sheet/__tests__/DashboardLayout.test.tsx src/store/__tests__/characterSheetStore.test.ts`
Expected: PASS. If `DashboardLayout.test.tsx` mocks the store with an explicit state shape, add `getActiveTraits: () => []` to that mock.

- [ ] **Step 6: Typecheck web**

Run from `apps/web`: `npx tsc -b`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/store/characterSheetStore.ts apps/web/src/components/sheet/TableRulesWidget.tsx apps/web/src/components/sheet/DashboardLayout.tsx apps/web/src/components/sheet/__tests__/TableRulesWidget.test.tsx apps/web/src/components/sheet/__tests__/DashboardLayout.test.tsx
git commit -m "feat(web): the Rules at the table panel

One place for every rule the engine reports rather than enforces, fed by
TableRulesEngine. Adds getActiveTraits to the store so the panel, the
action list and the trigger dispatch compile the same traits.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 7: Author the ten helper-and-affinity traits, and Rage's own note

**Files:**
- Modify (via script): `packages/database/data/packs/core_2014_pack/classes/barbarian.json`, `traits/unimplemented.json`, `traits/ported.json`
- Modify: `packages/database/src/__tests__/barbarianPack.test.ts`, `implementationMarkers.test.ts:150-160`

**Interfaces:**
- Produces: `status_persistent_rage` (granted state), authored `trait_rage` note, and the ten traits: `trait_persistent_rage`, `trait_spirit_seeker`, `trait_spirit_walker` (all three in `classes/barbarian.json`), `trait_totem_spirit_bear`, `trait_totem_spirit_wolf`, `trait_aspect_of_the_beast_eagle`, `trait_aspect_of_the_beast_wolf`, `trait_totemic_attunement_bear`, `trait_totemic_attunement_eagle`, `trait_totemic_attunement_wolf` (all in `traits/ported.json`).

- [ ] **Step 1: Write the failing pack tests**

Append to `packages/database/src/__tests__/barbarianPack.test.ts`. The file's `findTrait` reads `classes/barbarian.json` only; add a second reader for `ported.json` at the top of the file, after `findTrait`:

```ts
const PORTED_PATH = path.join(
  process.cwd(),
  "data/packs/core_2014_pack/traits/ported.json",
);

const portedSegment = JSON.parse(readFileSync(PORTED_PATH, "utf8")) as {
  traits: unknown[];
};

const findPortedTrait = (id: string): TraitDefinition => {
  const raw = portedSegment.traits.find(
    (trait): trait is { id: string } =>
      typeof trait === "object" &&
      trait !== null &&
      (trait as { id?: unknown }).id === id,
  );

  if (!raw) throw new Error(`trait '${id}' is not authored in ported.json`);

  return TraitDefinitionSchema.parse(raw);
};

/** The shape every helper in this pass shares: a marker and at least one gated note. */
const expectHelperWithNotes = (trait: TraitDefinition, gatedOnRage: boolean) => {
  expect(trait.implementation?.mode).toBe("manual_sheet_helper");
  expect(trait.lore?.shortDescription).not.toBe("placeholder");
  expect((trait.tableNotes ?? []).length).toBeGreaterThan(0);
  for (const note of trait.tableNotes ?? []) {
    expect(note.text.length).toBeGreaterThan(20);
    if (gatedOnRage) expect(note.requiredStates).toEqual(["status_raging"]);
  }
};
```

Then the tests:

```ts
describe("trait_rage's ending is reported, not enforced", () => {
  const trait = findTrait("trait_rage");

  it("carries real rule text now", () => {
    expect(trait.lore?.shortDescription).not.toBe("placeholder");
  });

  it("names the one-minute limit and the early ending while raging", () => {
    const note = trait.tableNotes?.[0];
    expect(note?.text).toMatch(/1 minute/);
    expect(note?.text).toMatch(/attacked a hostile creature/);
    expect(note?.requiredStates).toEqual(["status_raging"]);
  });

  it("withdraws that note once Persistent Rage is granted", () => {
    expect(trait.tableNotes?.[0]?.forbiddenStates).toEqual(["status_persistent_rage"]);
  });

  it("keeps its resource, affinities and actions exactly as they were", () => {
    expect(trait.resources.map((resource) => resource.id)).toEqual(["resource_barbarian_rage"]);
    expect(trait.affinities?.fixed.map((grant) => grant.damageType)).toEqual([
      "bludgeoning",
      "piercing",
      "slashing",
    ]);
    expect(trait.actions.map((action) => action.id)).toEqual(["action_rage", "action_end_rage"]);
  });
});

describe("trait_persistent_rage", () => {
  const trait = findTrait("trait_persistent_rage");

  it("is a sheet helper with a raging-gated note", () => {
    expectHelperWithNotes(trait, true);
  });

  it("grants the state Rage's ending note is withdrawn on", () => {
    expect(trait.grantedStates).toEqual(["status_persistent_rage"]);
  });
});

describe("the Totem Warrior helpers", () => {
  it.each([
    ["trait_totem_spirit_wolf", true],
    ["trait_totemic_attunement_bear", true],
    ["trait_totemic_attunement_eagle", true],
    ["trait_totemic_attunement_wolf", true],
    ["trait_aspect_of_the_beast_eagle", false],
    ["trait_aspect_of_the_beast_wolf", false],
  ])("%s is a helper with notes (gated on rage: %s)", (id, gated) => {
    expectHelperWithNotes(findPortedTrait(id), gated);
  });

  it.each(["trait_spirit_seeker", "trait_spirit_walker"])(
    "%s is a ritual helper authored beside the class",
    (id) => {
      const trait = findTrait(id);
      expectHelperWithNotes(trait, false);
      expect(trait.tableNotes?.[0]?.text).toMatch(/ritual/);
    },
  );

  it("gives the wolf attunement a bonus action to knock a creature prone", () => {
    const trait = findPortedTrait("trait_totemic_attunement_wolf");
    const trip = trait.actions.find((action) => action.id === "action_wolf_attunement_trip");

    expect(trip?.activation).toBe("bonus_action");
    expect(trip?.effect.type).toBe("no_effect");
    expect(trip?.tableNote).toMatch(/prone/);
  });
});

describe("trait_totem_spirit_bear", () => {
  const trait = findPortedTrait("trait_totem_spirit_bear");

  it("is engine-backed through the affinity reporter", () => {
    expect(trait.implementation?.mode).toBe("engine");
  });

  it("resists every damage type but psychic, only while raging", () => {
    const types = (trait.affinities?.fixed ?? []).map((grant) => grant.damageType).sort();

    expect(types).toEqual([
      "acid",
      "bludgeoning",
      "cold",
      "fire",
      "force",
      "lightning",
      "necrotic",
      "piercing",
      "poison",
      "radiant",
      "slashing",
      "thunder",
    ]);
    for (const grant of trait.affinities?.fixed ?? []) {
      expect(grant.level).toBe("resistance");
      expect(grant.requiredStates).toEqual(["status_raging"]);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @project/database exec vitest run src/__tests__/barbarianPack.test.ts`
Expected: FAIL. `trait_persistent_rage` parses but its mode is `unimplemented`; `trait_spirit_seeker` is not in the class segment.

- [ ] **Step 3: Patch `classes/barbarian.json`**

Write this patch to `slice1-barbarian-patch.json`. The `trait_rage` entry is the existing trait with real lore, an `implementation` block and one `tableNotes` entry added; its modifiers, affinities, resource and actions are byte-for-byte what the file already holds (copy them from the file rather than retyping, then add the four new keys shown).

```json
{
  "upsertTraits": [
    {
      "id": "trait_rage",
      "name": "Rage",
      "lore": {
        "shortDescription": "On your turn, you can enter a rage as a bonus action. While raging you have advantage on Strength checks and saves, a bonus to melee weapon damage using Strength, and resistance to bludgeoning, piercing and slashing damage.",
        "fullText": "In battle, you fight with primal ferocity. On your turn, you can enter a rage as a bonus action. While raging, you gain the following benefits if you aren't wearing heavy armour: you have advantage on Strength checks and Strength saving throws; when you make a melee weapon attack using Strength, you gain a bonus to the damage roll that increases as you gain levels as a barbarian; you have resistance to bludgeoning, piercing, and slashing damage. If you are able to cast spells, you can't cast them or concentrate on them while raging. Your rage lasts for 1 minute. It ends early if you are knocked unconscious or if your turn ends and you haven't attacked a hostile creature since your last turn or taken damage since then. You can also end your rage on your turn as a bonus action. Once you have raged the number of times shown for your barbarian level in the Rages column of the Barbarian table, you must finish a long rest before you can rage again."
      },
      "isStartingProficiency": false,
      "implementation": {
        "mode": "engine",
        "summary": "The damage bonus is a class_level_thresholds DAMAGE_BONUS gated on status_raging plus the melee and Strength attack-context states; the three resistances are affinities gated on status_raging, surfaced by the affinity reporter; the pool is resource_barbarian_rage. The one-minute limit and the early ending are reported as a table note rather than enforced, because the engine records neither attacks against hostile creatures nor damage taken since the last turn. The heavy-armour clause and the advantage on Strength checks and saves are not modelled.",
        "blockedBy": []
      },
      "tableNotes": [
        {
          "text": "Your rage lasts for 1 minute. It ends early if you are knocked unconscious, or if your turn ends and you have not attacked a hostile creature or taken damage since your last turn. You can end it on your turn as a bonus action.",
          "requiredStates": ["status_raging"],
          "forbiddenStates": ["status_persistent_rage"]
        }
      ],
      "modifiers": {
        "fixed": [
          {
            "target": "DAMAGE_BONUS",
            "type": "add",
            "value": 2,
            "scalingFactor": "class_level_thresholds",
            "scalingClassId": "class_barbarian",
            "scalingThresholds": [
              { "minimumLevel": 1, "value": 2 },
              { "minimumLevel": 9, "value": 3 },
              { "minimumLevel": 16, "value": 4 }
            ],
            "requiredStates": ["status_raging", "action_melee_attack", "action_using_str"],
            "forbiddenStates": []
          }
        ],
        "choices": []
      },
      "affinities": {
        "fixed": [
          { "damageType": "bludgeoning", "level": "resistance", "bypassedBy": [], "requiredStates": ["status_raging"] },
          { "damageType": "piercing", "level": "resistance", "bypassedBy": [], "requiredStates": ["status_raging"] },
          { "damageType": "slashing", "level": "resistance", "bypassedBy": [], "requiredStates": ["status_raging"] }
        ],
        "choices": []
      },
      "resources": [
        {
          "id": "resource_barbarian_rage",
          "name": "Rage",
          "maxRule": {
            "kind": "class_level_thresholds",
            "classId": "class_barbarian",
            "thresholds": [
              { "minimumLevel": 1, "value": 2 },
              { "minimumLevel": 3, "value": 3 },
              { "minimumLevel": 6, "value": 4 },
              { "minimumLevel": 12, "value": 5 },
              { "minimumLevel": 17, "value": 6 }
            ]
          },
          "resetCondition": "long_rest"
        }
      ],
      "triggers": [],
      "diceRules": [],
      "criticalHitModifiers": [],
      "actions": [
        {
          "id": "action_rage",
          "name": "Rage",
          "activation": "bonus_action",
          "consumesResource": "resource_barbarian_rage",
          "effect": {
            "type": "apply_effect",
            "effectName": "Rage",
            "effectTag": "rage",
            "durationType": "manual",
            "isSelfConcentration": false,
            "modifiers": [],
            "states": ["status_raging"]
          }
        },
        {
          "id": "action_end_rage",
          "name": "End Rage",
          "activation": "special",
          "effect": { "type": "remove_effect", "effectTag": "rage" }
        }
      ]
    },
    {
      "id": "trait_persistent_rage",
      "name": "Persistent Rage",
      "lore": {
        "shortDescription": "Your rage ends early only if you fall unconscious or if you choose to end it.",
        "fullText": "Beginning at 15th level, your rage is so fierce that it ends early only if you fall unconscious or if you choose to end it."
      },
      "isStartingProficiency": false,
      "implementation": {
        "mode": "manual_sheet_helper",
        "summary": "Rage's ending is reported rather than enforced, so this trait has nothing engine-side to lift. It grants status_persistent_rage, which withdraws Rage's ending note, and states its own rule while raging. Nothing here changes a number.",
        "blockedBy": []
      },
      "grantedStates": ["status_persistent_rage"],
      "tableNotes": [
        {
          "text": "Your rage ends early only if you fall unconscious or if you choose to end it.",
          "requiredStates": ["status_raging"],
          "forbiddenStates": []
        }
      ],
      "modifiers": { "fixed": [], "choices": [] },
      "resources": [],
      "triggers": [],
      "diceRules": [],
      "criticalHitModifiers": [],
      "actions": []
    },
    {
      "id": "trait_spirit_seeker",
      "name": "Spirit Seeker",
      "lore": {
        "shortDescription": "You can cast beast sense and speak with animals, but only as rituals.",
        "fullText": "Yours is a path that seeks attunement with the natural world, giving you a kinship with beasts. At 3rd level when you adopt this path, you gain the ability to cast the beast sense and speak with animals spells, but only as rituals."
      },
      "isStartingProficiency": false,
      "implementation": {
        "mode": "manual_sheet_helper",
        "summary": "A ritual-only spell grant. SpellUsageSchema has no ritual kind and every spell in the pack is a stub (#31), so the grant is stated as a note and the spells block stays empty until the spells pass settles ritual casting.",
        "blockedBy": []
      },
      "tableNotes": [
        {
          "text": "You can cast beast sense and speak with animals, but only as rituals.",
          "requiredStates": [],
          "forbiddenStates": []
        }
      ],
      "modifiers": { "fixed": [], "choices": [] },
      "resources": [],
      "triggers": [],
      "diceRules": [],
      "criticalHitModifiers": [],
      "actions": []
    },
    {
      "id": "trait_spirit_walker",
      "name": "Spirit Walker",
      "lore": {
        "shortDescription": "You can cast commune with nature, but only as a ritual; a spirit of one of your totem animals conveys the answer.",
        "fullText": "At 10th level, you can cast the commune with nature spell, but only as a ritual. When you do so, a spiritual version of one of the animals you chose for Totem Spirit or Aspect of the Beast appears to you to convey the information you seek."
      },
      "isStartingProficiency": false,
      "implementation": {
        "mode": "manual_sheet_helper",
        "summary": "A ritual-only spell grant, stated as a note for the same reason Spirit Seeker is: no ritual usage kind exists yet and the spell is a stub (#31).",
        "blockedBy": []
      },
      "tableNotes": [
        {
          "text": "You can cast commune with nature, but only as a ritual. A spiritual version of one of your totem animals appears to convey the information you seek.",
          "requiredStates": [],
          "forbiddenStates": []
        }
      ],
      "modifiers": { "fixed": [], "choices": [] },
      "resources": [],
      "triggers": [],
      "diceRules": [],
      "criticalHitModifiers": [],
      "actions": []
    }
  ]
}
```

The `trait_rage` modifiers, affinities, resource and actions above are the file's current content verbatim; only `lore`, `isStartingProficiency`, `implementation` and `tableNotes` are new. Before running the script, confirm that with `git diff` afterwards: the `trait_rage` hunk must add those four keys and change nothing else.

Run: `pnpm --filter @project/database exec tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/classes/barbarian.json <path-to>/slice1-barbarian-patch.json`

- [ ] **Step 4: Move the two spirit traits out of `unimplemented.json`**

Write `slice1-unimplemented-patch.json`:

```json
{ "deleteTraitIds": ["trait_spirit_seeker", "trait_spirit_walker"] }
```

Run: `pnpm --filter @project/database exec tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/traits/unimplemented.json <path-to>/slice1-unimplemented-patch.json`

- [ ] **Step 5: Patch `traits/ported.json` with the seven totem traits**

Write `slice1-ported-patch.json`:

```json
{
  "upsertTraits": [
    {
      "id": "trait_totem_spirit_bear",
      "name": "Totem Spirit: Bear",
      "lore": {
        "shortDescription": "While raging, you have resistance to all damage except psychic damage.",
        "fullText": "While raging, you have resistance to all damage except psychic damage. The spirit of the bear makes you tough enough to stand up to any punishment."
      },
      "isStartingProficiency": false,
      "implementation": {
        "mode": "engine",
        "summary": "Twelve resistance affinities, one per damage type other than psychic, each gated on status_raging. The affinity reporter collapses them to 'all damage except psychic' on the sheet. Authored as twelve entries rather than an 'all' pseudo-type because FixedAffinityGrant names one damage type and the validator can check each one.",
        "blockedBy": []
      },
      "modifiers": { "fixed": [], "choices": [] },
      "affinities": {
        "fixed": [
          { "damageType": "acid", "level": "resistance", "bypassedBy": [], "requiredStates": ["status_raging"] },
          { "damageType": "bludgeoning", "level": "resistance", "bypassedBy": [], "requiredStates": ["status_raging"] },
          { "damageType": "cold", "level": "resistance", "bypassedBy": [], "requiredStates": ["status_raging"] },
          { "damageType": "fire", "level": "resistance", "bypassedBy": [], "requiredStates": ["status_raging"] },
          { "damageType": "force", "level": "resistance", "bypassedBy": [], "requiredStates": ["status_raging"] },
          { "damageType": "lightning", "level": "resistance", "bypassedBy": [], "requiredStates": ["status_raging"] },
          { "damageType": "necrotic", "level": "resistance", "bypassedBy": [], "requiredStates": ["status_raging"] },
          { "damageType": "piercing", "level": "resistance", "bypassedBy": [], "requiredStates": ["status_raging"] },
          { "damageType": "poison", "level": "resistance", "bypassedBy": [], "requiredStates": ["status_raging"] },
          { "damageType": "radiant", "level": "resistance", "bypassedBy": [], "requiredStates": ["status_raging"] },
          { "damageType": "slashing", "level": "resistance", "bypassedBy": [], "requiredStates": ["status_raging"] },
          { "damageType": "thunder", "level": "resistance", "bypassedBy": [], "requiredStates": ["status_raging"] }
        ],
        "choices": []
      },
      "resources": [],
      "triggers": [],
      "diceRules": [],
      "criticalHitModifiers": [],
      "actions": []
    },
    {
      "id": "trait_totem_spirit_wolf",
      "name": "Totem Spirit: Wolf",
      "lore": {
        "shortDescription": "While raging, your friends have advantage on melee attack rolls against any creature within 5 feet of you that is hostile to you.",
        "fullText": "While you're raging, your friends have advantage on melee attack rolls against any creature within 5 feet of you that is hostile to you. The spirit of the wolf makes you a leader of hunters."
      },
      "isStartingProficiency": false,
      "implementation": {
        "mode": "manual_sheet_helper",
        "summary": "The advantage lands on your allies' attack rolls, which this single-character sheet never sees, so the rule is a table note while raging rather than a modifier with no calculator behind it.",
        "blockedBy": []
      },
      "tableNotes": [
        {
          "text": "While raging, your friends have advantage on melee attack rolls against any creature within 5 feet of you that is hostile to you.",
          "requiredStates": ["status_raging"],
          "forbiddenStates": []
        }
      ],
      "modifiers": { "fixed": [], "choices": [] },
      "resources": [],
      "triggers": [],
      "diceRules": [],
      "criticalHitModifiers": [],
      "actions": []
    },
    {
      "id": "trait_aspect_of_the_beast_eagle",
      "name": "Aspect of the Beast: Eagle",
      "lore": {
        "shortDescription": "You gain the eyesight of an eagle: you can see up to a mile away with no difficulty, and dim light does not impose disadvantage on your Wisdom (Perception) checks.",
        "fullText": "You gain the eyesight of an eagle. You can see up to 1 mile away with no difficulty, able to discern even fine details as though looking at something no more than 100 feet away from you. Additionally, dim light doesn't impose disadvantage on your Wisdom (Perception) checks."
      },
      "isStartingProficiency": false,
      "implementation": {
        "mode": "manual_sheet_helper",
        "summary": "Both halves are permissions rather than numbers: sight range is not modelled, and disadvantage from dim light is imposed by the table, not by any state this engine tracks. Two ungated notes.",
        "blockedBy": []
      },
      "tableNotes": [
        {
          "text": "You can see up to 1 mile away with no difficulty, able to discern even fine details as though looking at something no more than 100 feet away.",
          "requiredStates": [],
          "forbiddenStates": []
        },
        {
          "text": "Dim light does not impose disadvantage on your Wisdom (Perception) checks.",
          "requiredStates": [],
          "forbiddenStates": []
        }
      ],
      "modifiers": { "fixed": [], "choices": [] },
      "resources": [],
      "triggers": [],
      "diceRules": [],
      "criticalHitModifiers": [],
      "actions": []
    },
    {
      "id": "trait_aspect_of_the_beast_wolf",
      "name": "Aspect of the Beast: Wolf",
      "lore": {
        "shortDescription": "You gain the hunting sensibilities of a wolf: you can track other creatures while travelling at a fast pace, and move stealthily while travelling at a normal pace.",
        "fullText": "You gain the hunting sensibilities of a wolf. You can track other creatures while traveling at a fast pace, and you can move stealthily while traveling at a normal pace."
      },
      "isStartingProficiency": false,
      "implementation": {
        "mode": "manual_sheet_helper",
        "summary": "Travel pace is not modelled anywhere in the engine, so this is one ungated note.",
        "blockedBy": []
      },
      "tableNotes": [
        {
          "text": "You can track other creatures while travelling at a fast pace, and you can move stealthily while travelling at a normal pace.",
          "requiredStates": [],
          "forbiddenStates": []
        }
      ],
      "modifiers": { "fixed": [], "choices": [] },
      "resources": [],
      "triggers": [],
      "diceRules": [],
      "criticalHitModifiers": [],
      "actions": []
    },
    {
      "id": "trait_totemic_attunement_bear",
      "name": "Totemic Attunement: Bear",
      "lore": {
        "shortDescription": "While raging, any creature within 5 feet of you that is hostile to you has disadvantage on attack rolls against targets other than you or another character with this feature.",
        "fullText": "While you're raging, any creature within 5 feet of you that's hostile to you has disadvantage on attack rolls against targets other than you or another character with this feature. An enemy is immune to this effect if it can't see or hear you or if it can't be frightened."
      },
      "isStartingProficiency": false,
      "implementation": {
        "mode": "manual_sheet_helper",
        "summary": "The disadvantage lands on enemies' attack rolls against other targets, which the sheet never sees. One note while raging, carrying the immunity clause.",
        "blockedBy": []
      },
      "tableNotes": [
        {
          "text": "While raging, any creature within 5 feet of you that is hostile to you has disadvantage on attack rolls against targets other than you or another character with this feature, unless it cannot see or hear you or cannot be frightened.",
          "requiredStates": ["status_raging"],
          "forbiddenStates": []
        }
      ],
      "modifiers": { "fixed": [], "choices": [] },
      "resources": [],
      "triggers": [],
      "diceRules": [],
      "criticalHitModifiers": [],
      "actions": []
    },
    {
      "id": "trait_totemic_attunement_eagle",
      "name": "Totemic Attunement: Eagle",
      "lore": {
        "shortDescription": "While raging, you have a flying speed equal to your current walking speed, in short bursts only; you fall if you end your turn in the air.",
        "fullText": "While raging, you have a flying speed equal to your current walking speed. This benefit works only in short bursts; you fall if you end your turn in the air and nothing else is holding you aloft."
      },
      "isStartingProficiency": false,
      "implementation": {
        "mode": "manual_sheet_helper",
        "summary": "The engine has one SPEED and no flying speed, so the burst of flight is a note while raging rather than a modifier that would add to walking speed.",
        "blockedBy": []
      },
      "tableNotes": [
        {
          "text": "While raging, you have a flying speed equal to your current walking speed. It works only in short bursts: you fall if you end your turn in the air and nothing else is holding you aloft.",
          "requiredStates": ["status_raging"],
          "forbiddenStates": []
        }
      ],
      "modifiers": { "fixed": [], "choices": [] },
      "resources": [],
      "triggers": [],
      "diceRules": [],
      "criticalHitModifiers": [],
      "actions": []
    },
    {
      "id": "trait_totemic_attunement_wolf",
      "name": "Totemic Attunement: Wolf",
      "lore": {
        "shortDescription": "While raging, you can use a bonus action on your turn to knock a Large or smaller creature prone when you hit it with a melee weapon attack.",
        "fullText": "While you're raging, you can use a bonus action on your turn to knock a Large or smaller creature prone when you hit it with melee weapon attack."
      },
      "isStartingProficiency": false,
      "implementation": {
        "mode": "manual_sheet_helper",
        "summary": "The prone condition lands on the target, which the sheet has no model for, so the trip is a bonus action that rolls nothing and carries its rule as a tableNote; the economy tracks the bonus action as it does any other. A note while raging restates the rule beside the card.",
        "blockedBy": []
      },
      "tableNotes": [
        {
          "text": "While raging, when you hit a Large or smaller creature with a melee weapon attack, you can use a bonus action to knock it prone.",
          "requiredStates": ["status_raging"],
          "forbiddenStates": []
        }
      ],
      "modifiers": { "fixed": [], "choices": [] },
      "resources": [],
      "triggers": [],
      "diceRules": [],
      "criticalHitModifiers": [],
      "actions": [
        {
          "id": "action_wolf_attunement_trip",
          "name": "Knock Prone (Wolf Totem)",
          "activation": "bonus_action",
          "tableNote": "Only while raging, and only after you hit a Large or smaller creature with a melee weapon attack this turn. The creature is knocked prone.",
          "effect": { "type": "no_effect" }
        }
      ]
    }
  ]
}
```

Run: `pnpm --filter @project/database exec tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/traits/ported.json <path-to>/slice1-ported-patch.json`

- [ ] **Step 6: Refresh the marker count**

In `implementationMarkers.test.ts`, the last test: change `462` to `452` and the comment to:

```ts
    // 452 of 587. Slice 1 of the barbarian pass authored ten traits: nine
    // sheet helpers carrying table notes and Bear totem's affinities.
```

- [ ] **Step 7: Run the pack suites**

Run: `pnpm --filter @project/database test --run`
Expected: PASS, including `barbarianPack`, `tableNotes`, `implementationMarkers`, `traitReachability`, `corePackAssembler` and `packSchemas`.

- [ ] **Step 8: See it on the sheet**

Run `pnpm --filter @project/database db:import-pack` against the dev database, then open the sample barbarian (`/character/00000000-0000-0000-0000-000000000112`), press Rage, and confirm the panel shows Rage's ending note and "Resistance to bludgeoning, piercing and slashing damage". If no database is available, note that in the commit body and move on; the unit tests are the gate.

- [ ] **Step 9: Commit**

```bash
git add packages/database/data/packs/core_2014_pack packages/database/src/__tests__/barbarianPack.test.ts packages/database/src/__tests__/implementationMarkers.test.ts
git commit -m "feat(pack): author the barbarian's helper traits and Bear totem's resistances

Persistent Rage, the two spirit rituals, Wolf totem, the Eagle and Wolf
aspects and the three attunements as sheet helpers with table notes;
Bear totem as twelve raging-gated affinities. Rage itself gains real
lore and the ending note Persistent Rage withdraws.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Slice 2: Resources reach the snapshot; the save carries subclass and choices; pools exist for every character

### Task 8: `resourcesById` in the shared projection, and the granted-resource helpers

**Files:**
- Modify: `packages/shared/src/schemas/runtime/ruleSnapshot.ts:35-70`
- Modify: `packages/engine/src/rules/packLookup.ts`
- Modify: `apps/server/src/services/ruleSnapshotCache.ts:60-90`
- Modify: `packages/engine/src/utils/resourceRules.ts`
- Test: `packages/engine/src/rules/__tests__/packLookup.test.ts` (create), `packages/engine/src/utils/__tests__/resourceRules.test.ts` (create if absent, else append)

**Interfaces:**
- Produces: `CoreRulePackSnapshot.resourcesById: Record<string, Resource>` filled by `toRuleSnapshot` from `pack.resources` and every trait's `resources`; `collectGrantedResources(traits, snapshot?): Resource[]`; `materialiseMissingPools(existingIds, granted, totalLevel, classLevels): MaterialisedPool[]` with `MaterialisedPool = { id; name; current; max; resetCondition }`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/engine/src/rules/__tests__/packLookup.test.ts
import { describe, expect, it } from "vitest";
import { packToRuleLookup } from "../packLookup.js";
import { corePack } from "../../pipeline/__tests__/corePackFixture.js";

describe("packToRuleLookup.resourcesById", () => {
  it("carries the pack-level resources", () => {
    const lookup = packToRuleLookup(corePack());

    expect(lookup.resourcesById["trait_action_surge"]?.name).toBe("Action Surge");
  });

  it("carries the resources traits grant, which the old projection dropped", () => {
    // Rage's pool lives on trait_rage, not in pack.resources. Without it in
    // the map, applyRest found no rule and never reset it.
    const rage = packToRuleLookup(corePack()).resourcesById["resource_barbarian_rage"];

    expect(rage?.resetCondition).toBe("long_rest");
  });
});
```

```ts
// packages/engine/src/utils/__tests__/resourceRules.test.ts (append, or create with these imports)
import { describe, expect, it } from "vitest";
import {
  collectGrantedResources,
  materialiseMissingPools,
} from "../resourceRules.js";
import { corePackLookup, corePackSnapshot } from "../../pipeline/__tests__/corePackFixture.js";

const traitsNamed = (...ids: string[]) =>
  ids.map((id) => {
    const trait = corePackSnapshot().traitsById[id];
    if (!trait) throw new Error(`${id} missing from the shipped pack`);
    return trait;
  });

describe("collectGrantedResources", () => {
  it("collects a resource authored on the trait itself", () => {
    const granted = collectGrantedResources(traitsNamed("trait_rage"), corePackLookup());

    expect(granted.map((resource) => resource.id)).toEqual(["resource_barbarian_rage"]);
  });

  it("collects a pack-level resource that carries the trait's own id", () => {
    // the codebase convention: trait_action_surge the trait spends
    // trait_action_surge the pool, which lives in pack.resources
    const granted = collectGrantedResources(traitsNamed("trait_action_surge"), corePackLookup());

    expect(granted.map((resource) => resource.id)).toEqual(["trait_action_surge"]);
  });

  it("dedupes a resource granted twice", () => {
    const granted = collectGrantedResources(traitsNamed("trait_rage", "trait_rage"), corePackLookup());

    expect(granted).toHaveLength(1);
  });
});

describe("materialiseMissingPools", () => {
  const rage = collectGrantedResources(traitsNamed("trait_rage"), corePackLookup());

  it("creates a full pool for a granted resource the table lacks", () => {
    expect(materialiseMissingPools([], rage, 3, { class_barbarian: 3 })).toEqual([
      { id: "resource_barbarian_rage", name: "Rage", current: 3, max: 3, resetCondition: "long_rest" },
    ]);
  });

  it("leaves an existing pool alone", () => {
    expect(materialiseMissingPools(["resource_barbarian_rage"], rage, 3, { class_barbarian: 3 })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @project/engine exec vitest run src/rules/__tests__/packLookup.test.ts src/utils/__tests__/resourceRules.test.ts`
Expected: FAIL. `resourcesById["resource_barbarian_rage"]` is undefined; the two helpers do not exist.

- [ ] **Step 3: Widen the shared projection**

In `packages/shared/src/schemas/runtime/ruleSnapshot.ts`, add to the `CoreRulePackSnapshot` interface:

```ts
  /**
   * Every resource a character can hold, keyed by id: the pack's own section
   * plus every pool a trait declares. Trait pools were missing from every
   * hand-built copy of this map, so Rage resolved to no rule at runtime and
   * never reset on a long rest.
   */
  resourcesById: Record<string, Resource>;
```

with `import type { Resource } from "../content/resources.js";` beside the existing `ResourceSchema` import. Then in `toRuleSnapshot`, add:

```ts
  resourcesById: byId([
    ...pack.resources,
    ...pack.traits.flatMap((trait) => trait.resources),
  ]),
```

- [ ] **Step 4: Make the engine and the server read it**

`packages/engine/src/rules/packLookup.ts`: change the type to

```ts
export type PackRuleLookup = CoreRulePackSnapshot & {
  equipmentById: Record<string, EquipmentDefinition>;
  weaponsById: Record<string, WeaponView>;
};
```

and delete the `resourcesById: Object.fromEntries(...)` property from the returned object, since `...toRuleSnapshot(pack)` now supplies it. Remove the now-unused `CoreRulePack["resources"]` reference.

`apps/server/src/services/ruleSnapshotCache.ts`: replace the block that builds `resourcesById` from `packPayload?.resources` with

```ts
  // resources ride on the shared projection now - pack.resources plus every
  // pool a trait declares - so the server no longer keeps its own copy
  const resourcesById = packContent?.resourcesById ?? {};
```

The `RuleSnapshotSchema.parse` and the return below it are unchanged.

- [ ] **Step 5: Add the helpers**

Append to `packages/engine/src/utils/resourceRules.ts`:

```ts
import type { TraitDefinition } from "@project/shared";
import type { RuleSnapshotLookup } from "../rules/ruleLookup.js";

/**
 * The pools a set of traits puts on a character.
 *
 * Two sources, by convention: a pool authored on the trait itself, and a
 * pack-level pool carrying the trait's own id (trait_action_surge grants
 * trait_action_surge). Deduplicated by id, last writer wins.
 */
export const collectGrantedResources = (
  traits: TraitDefinition[],
  snapshot?: RuleSnapshotLookup,
): Resource[] => {
  const byId = new Map<string, Resource>();

  for (const trait of traits) {
    for (const resource of trait.resources ?? []) byId.set(resource.id, resource);

    const packLevel = snapshot?.resourcesById?.[trait.id];
    if (packLevel) byId.set(packLevel.id, packLevel);
  }

  return [...byId.values()];
};

export interface MaterialisedPool {
  id: string;
  name: string;
  current: number;
  max: number;
  resetCondition: Resource["resetCondition"];
}

/**
 * Rows to create for pools the character is granted but does not yet hold.
 *
 * Only the sample seeder ever wrote character_resources; a real character had
 * no Rage row and every rage failed insufficient_resource. Idempotent: an id
 * already present is skipped, so calling this on every touch is safe.
 */
export const materialiseMissingPools = (
  existingIds: Iterable<string>,
  granted: Resource[],
  totalLevel: number,
  classLevels: Record<string, number>,
): MaterialisedPool[] => {
  const existing = new Set(existingIds);

  return granted
    .filter((resource) => !existing.has(resource.id))
    .map((resource) => {
      const max = getResourceMaxUses(resource, totalLevel, classLevels);
      return {
        id: resource.id,
        name: resource.name,
        current: max,
        max,
        resetCondition: resource.resetCondition,
      };
    });
};
```

(The file already imports `Resource` from `@project/shared`; merge the type imports into one statement.)

- [ ] **Step 6: Run the tests, then the three affected packages' suites**

Run: `pnpm --filter @project/engine exec vitest run src/rules/__tests__/packLookup.test.ts src/utils/__tests__/resourceRules.test.ts`
Expected: PASS.
Run: `pnpm --filter @project/shared test --run && pnpm --filter @project/engine test --run && pnpm --filter @project/server test --run`
Expected: PASS. If a web test pins the exact keys of `packToRuleLookup`'s result, it still passes: the key set is unchanged, only its source moved.
Run: `pnpm --filter @project/shared typecheck && pnpm --filter @project/engine typecheck && pnpm --filter @project/server typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/schemas/runtime/ruleSnapshot.ts packages/engine/src/rules/packLookup.ts packages/engine/src/rules/__tests__/packLookup.test.ts packages/engine/src/utils/resourceRules.ts packages/engine/src/utils/__tests__/resourceRules.test.ts apps/server/src/services/ruleSnapshotCache.ts
git commit -m "fix(resources): trait-granted pools reach the rule snapshot

toRuleSnapshot now unions pack.resources with every trait's resources,
and the server cache and engine lookup read that one map instead of
hand-building their own from pack.resources alone. Rage finally has a
rule behind it at runtime. Adds the helpers the server and web need to
materialise missing pool rows.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 9: `selectionsFromChosenTraitIds` on the bootstrapper

**Files:**
- Modify: `packages/engine/src/pipeline/characterBootstrapper.ts` (a new public static after `resolveGrantedTraitIds`)
- Test: `packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts` (append)

**Interfaces:**
- Produces: `CharacterBootstrapper.selectionsFromChosenTraitIds(classes: Array<{ classId: string; level: number; subclassId?: string }>, chosenTraitIds: string[], snapshot?: RuleSnapshotLookup): Record<string, Record<string, string[]>>` keyed by class id, then by `trait_choice` node id.

- [ ] **Step 1: Write the failing test**

Append to `characterBootstraper.test.ts` (import `corePackLookup` from `./corePackFixture.js` if the file does not already):

```ts
describe("CharacterBootstrapper.selectionsFromChosenTraitIds", () => {
  const totem = (level: number) => [
    {
      classId: "class_barbarian",
      level,
      subclassId: "subclass_barbarian_totem_warrior",
    },
  ];

  it("assigns a chosen trait to the subclass node that offers it", () => {
    const selections = CharacterBootstrapper.selectionsFromChosenTraitIds(
      totem(3),
      ["trait_totem_spirit_bear", "trait_fs_defense"],
      corePackLookup(),
    );

    expect(selections).toEqual({
      class_barbarian: {
        barbarian_totem_level_3_totem_spirit: ["trait_totem_spirit_bear"],
      },
    });
  });

  it("ignores a node the character has not reached", () => {
    const selections = CharacterBootstrapper.selectionsFromChosenTraitIds(
      totem(3),
      ["trait_aspect_of_the_beast_bear"],
      corePackLookup(),
    );

    expect(selections).toEqual({ class_barbarian: {} });
  });

  it("returns an empty map for a class without a subclass", () => {
    const selections = CharacterBootstrapper.selectionsFromChosenTraitIds(
      [{ classId: "class_barbarian", level: 3 }],
      ["trait_totem_spirit_bear"],
      corePackLookup(),
    );

    expect(selections).toEqual({ class_barbarian: {} });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @project/engine exec vitest run src/pipeline/__tests__/characterBootstraper.test.ts`
Expected: FAIL, `selectionsFromChosenTraitIds is not a function`.

- [ ] **Step 3: Implement it**

In `characterBootstrapper.ts`, add `traitIdOfOption` to the `@project/shared` import, and this method after `resolveGrantedTraitIds`:

```ts
  /**
   * Rebuilds a save's trait_choice selections from the traits the character
   * was recorded as choosing.
   *
   * The database keeps a chosen trait as a character_traits row with source
   * "player_choice" and nothing else - not which node it answered. Neither the
   * server nor the web store could therefore hand the bootstrapper a save that
   * knew a Totem Warrior's totem. Walking the unlocked nodes and intersecting
   * their options with the chosen ids recovers exactly that.
   */
  public static selectionsFromChosenTraitIds(
    classes: Array<{ classId: string; level: number; subclassId?: string }>,
    chosenTraitIds: string[],
    snapshot?: RuleSnapshotLookup,
  ): Record<string, Record<string, string[]>> {
    const chosen = new Set(chosenTraitIds);
    const byClass: Record<string, Record<string, string[]>> = {};

    for (const entry of classes) {
      const selections: Record<string, string[]> = {};
      const state: ClassState = {
        classId: entry.classId,
        level: entry.level,
        selections: {},
        ...(entry.subclassId !== undefined && { subclassId: entry.subclassId }),
      };

      for (const grant of unlockedGrants(state, snapshot)) {
        if (!isTraitChoice(grant)) continue;
        const picks = grant.options
          .map(traitIdOfOption)
          .filter((id) => chosen.has(id));
        if (picks.length > 0) selections[grant.nodeId] = picks;
      }

      byClass[entry.classId] = selections;
    }

    return byClass;
  }
```

`ClassState`, `unlockedGrants` and `isTraitChoice` are the module's existing private helpers.

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @project/engine exec vitest run src/pipeline/__tests__/characterBootstraper.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/pipeline/characterBootstrapper.ts packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts
git commit -m "feat(engine): rebuild trait_choice selections from chosen trait ids

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 10: The server's runtime save carries subclass and choices, and materialises pools

**Files:**
- Modify: `apps/server/src/gateway/socket.ts` (`toCharacterSave` ~142, `getAuthoritativeRuntimeContext` ~209-300, `resolveCharacterAction` ~380)
- Test: `apps/server/src/gateway/__tests__/socket.actionIntent.test.ts` (append)

**Interfaces:**
- Consumes: `selectionsFromChosenTraitIds` (Task 9), `collectGrantedResources`, `materialiseMissingPools` (Task 8).
- Produces: a runtime save with `subclassId` and per-node `selections`; `character_resources` rows inserted for granted pools the table lacks; `resolveCharacterAction` compiling traits against the snapshot.

- [ ] **Step 1: Write the failing tests**

Append to `socket.actionIntent.test.ts`, inside the top-level `describe`. Add `characterTraits` to the schema import at the top of the file.

```ts
  it("materialises a granted pool the table has no row for", async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterClasses, [
      { classId: "class_barbarian", classLevel: 3, subclassId: null },
    ]);
    harness.db.seed(characterInventory, []);
    harness.db.seed(characterTraits, []);
    harness.db.seed(characterResources, []);

    await harness.emit(
      SOCKET_EVENTS.ACTION_INTENT,
      intent({ actionId: "action_rage" }),
    );

    // Only the sample seeder ever wrote this table. A real barbarian had no
    // Rage row, and every rage failed insufficient_resource.
    const inserts = harness.db.opsFor(characterResources, "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.values).toEqual([
      expect.objectContaining({
        id: "resource_barbarian_rage",
        characterId: "char-1",
        current: 3,
        max: 3,
        resetCondition: "long_rest",
      }),
    ]);
    expect(lastResolved(harness)).toMatchObject({ executed: true });
  });

  it("leaves an existing pool row alone", async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterClasses, [
      { classId: "class_barbarian", classLevel: 3, subclassId: null },
    ]);
    harness.db.seed(characterInventory, []);
    harness.db.seed(characterTraits, []);
    harness.db.seed(characterResources, [
      {
        id: "resource_barbarian_rage",
        characterId: "char-1",
        name: "Rage",
        current: 1,
        max: 3,
        resetCondition: "long_rest",
      },
    ]);

    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, intent());

    expect(harness.db.opsFor(characterResources, "insert")).toEqual([]);
  });
```

Also update the `ready()` helper and every existing `harness.db.seed(characterClasses, ...)` call in this file to seed `characterTraits` as `[]` alongside inventory, because the context now reads that table. (Check `fakeDb.ts`'s read path first: if an unseeded table answers `[]`, the extra seeds are harmless; if it throws, they are required.)

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @project/server exec vitest run src/gateway/__tests__/socket.actionIntent.test.ts`
Expected: the first new test FAILS (no insert, and the rage fails `insufficient_resource`).

- [ ] **Step 3: Carry subclass and choices on the save**

Change `toCharacterSave` in `socket.ts`:

```ts
const toCharacterSave = (
  character: {
    raceId: string;
    subraceId: string | null;
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
    currentHp: number | null;
    maxHp: number | null;
  },
  classes: Array<{ classId: string; classLevel: number; subclassId: string | null }>,
  selectionsByClass: Record<string, Record<string, string[]>> = {},
): CharacterSave => ({
  attributes: {
    str: character.str,
    dex: character.dex,
    con: character.con,
    int: character.int,
    wis: character.wis,
    cha: character.cha,
  },
  race: {
    baseRaceId: character.raceId,
    hasSubraces: character.subraceId !== null,
    subraceId: character.subraceId,
  },
  classes:
    classes.length > 0
      ? classes.map((entry) => ({
          classId: entry.classId,
          level: entry.classLevel,
          ...(entry.subclassId !== null && { subclassId: entry.subclassId }),
          selections: selectionsByClass[entry.classId] ?? {},
        }))
      : [{ classId: "class_fighter", level: 1, selections: {} }],
  traitSelections: {},
  hp: {
    current: character.currentHp ?? character.maxHp ?? 1,
    temporary: 0,
    baseRolledHp: character.maxHp ?? 1,
    hitDiceSpent: {},
  },
});
```

In `getAuthoritativeRuntimeContext`, extend the class query and add the chosen-trait query:

```ts
  const classRows = await db
    .select({
      classId: characterClasses.classId,
      classLevel: characterClasses.classLevel,
      subclassId: characterClasses.subclassId,
    })
    .from(characterClasses)
    .where(eq(characterClasses.characterId, characterId));

  // the chosen traits are rows with source "player_choice" and no record of
  // which node they answered; the bootstrapper recovers that from the pack
  const chosenTraitRows = await db
    .select({
      traitId: characterTraits.traitId,
      source: characterTraits.source,
    })
    .from(characterTraits)
    .where(eq(characterTraits.characterId, characterId));

  const { snapshot } = await getCachedRuleSnapshot();

  const selectionsByClass = CharacterBootstrapper.selectionsFromChosenTraitIds(
    classRows.map((row) => ({
      classId: row.classId,
      level: row.classLevel,
      ...(row.subclassId !== null && { subclassId: row.subclassId }),
    })),
    chosenTraitRows
      .filter((row) => row.source === "player_choice")
      .map((row) => row.traitId),
    snapshot,
  );

  const nextSave = toCharacterSave(character, classRows, selectionsByClass);
```

Then, after `resourceRows` is loaded and before `persistedResources` is built:

```ts
  // pools the traits grant but the table lacks. Only the sample seeder ever
  // wrote character_resources, so a real character had no Rage row at all
  const activeTraits = CharacterBootstrapper.compileActiveTraits(nextSave, snapshot);
  const classLevels = Object.fromEntries(
    classRows.map((row) => [row.classId, row.classLevel]),
  );
  const totalLevel = classRows.reduce((sum, row) => sum + row.classLevel, 0);
  const missingPools = materialiseMissingPools(
    resourceRows.map((row) => row.id),
    collectGrantedResources(activeTraits, snapshot),
    totalLevel,
    classLevels,
  );

  if (missingPools.length > 0) {
    await db
      .insert(characterResources)
      .values(missingPools.map((pool) => ({ ...pool, characterId })));
  }

  const persistedResources = [...resourceRows, ...missingPools].map((row) => ({
    id: row.id,
    name: row.name,
    maxCharges: row.max,
    currentCharges: row.current,
    resetOn: row.resetCondition,
  }));
```

Import `characterTraits` from the operational schema beside `characterResources`, and `collectGrantedResources`, `materialiseMissingPools` from `@project/engine`. Move `nextSave`'s construction above this block (it is used by `compileActiveTraits`), and keep the rest of the function as it is.

Finally, in `resolveCharacterAction`, pass the snapshot:

```ts
  const activeTraits = CharacterBootstrapper.compileActiveTraits(
    runtime.save,
    snapshot,
  );
```

(`snapshot` is already in scope there. Without it no trait resolved, so `diceRules` was always empty on the server.)

- [ ] **Step 4: Run the gateway suites and typecheck**

Run: `pnpm --filter @project/server exec vitest run src/gateway`
Expected: PASS. Existing tests that seed `characterClasses` without `subclassId` still pass because the map treats a missing `subclassId` as `undefined`, which the `!== null` spread skips; if TypeScript objects to `undefined`, add `subclassId: null` to those seeds.
Run: `pnpm --filter @project/server typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/gateway/socket.ts apps/server/src/gateway/__tests__/socket.actionIntent.test.ts
git commit -m "fix(server): the runtime save carries subclass and choices, and missing pools are created

The class ledger's subclassId was never selected and trait_choice
selections were never rebuilt, so no subclass action could resolve.
Pool rows are now materialised on touch, so a character outside the
sample fixtures can rage. compileActiveTraits in the action lookup
finally receives the snapshot, so dice rules reach the server's rolls.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 11: The sheet payload and the web store carry subclass and choices, and materialise pools

**Files:**
- Modify: `apps/server/src/routes/character.ts:112-118` (payload)
- Modify: `apps/web/src/pages/characterSheetRouteData.ts` (payload type, hydrate)
- Modify: `apps/web/src/store/characterSheetStore.ts` (`toCharacterSave` ~157, state interface, defaults, `initialize`)
- Test: `apps/web/src/store/__tests__/characterSheetStore.test.ts` (append)

**Interfaces:**
- Produces: payload field `classes: Array<{ classId; level; subclassId: string | null }>`; store field `subclassIds: Record<string, string | null>`; a store `toCharacterSave` that carries subclass and selections; `initialize` appending missing pools to `resources`.

- [ ] **Step 1: Write the failing store tests**

Append to `characterSheetStore.test.ts`, following the file's existing pattern for resetting and calling `initialize` (it imports `packRuleSnapshot` from `./packFixture`):

```ts
describe("initialize materialises trait-granted pools", () => {
  it("adds Rage for a barbarian whose payload carried no resources", () => {
    useCharacterSheetStore.getState().initialize({
      id: "char_1",
      level: 3,
      classLevels: { class_barbarian: 3 },
      raceId: "race_human",
      subraceId: null,
      resources: [],
      ruleSnapshot: packRuleSnapshot(),
    });

    expect(useCharacterSheetStore.getState().resources).toContainEqual(
      expect.objectContaining({ id: "resource_barbarian_rage", current: 3 }),
    );
  });

  it("keeps a pool the payload already carried, without duplicating it", () => {
    useCharacterSheetStore.getState().initialize({
      id: "char_1",
      level: 3,
      classLevels: { class_barbarian: 3 },
      raceId: "race_human",
      subraceId: null,
      resources: [{ id: "resource_barbarian_rage", current: 1 }],
      ruleSnapshot: packRuleSnapshot(),
    });

    const rage = useCharacterSheetStore
      .getState()
      .resources.filter((resource) => resource.id === "resource_barbarian_rage");
    expect(rage).toHaveLength(1);
    expect(rage[0]?.current).toBe(1);
  });
});

describe("getActiveTraits with a subclass", () => {
  it("compiles the chosen totem from the class ledger and the player's choice", () => {
    useCharacterSheetStore.getState().initialize({
      id: "char_1",
      level: 3,
      classLevels: { class_barbarian: 3 },
      subclassIds: { class_barbarian: "subclass_barbarian_totem_warrior" },
      traitGrants: [
        { id: "grant_1", traitId: "trait_totem_spirit_bear", source: "player_choice" },
      ],
      raceId: "race_human",
      subraceId: null,
      ruleSnapshot: packRuleSnapshot(),
    });

    const ids = useCharacterSheetStore
      .getState()
      .getActiveTraits()
      .map((trait) => trait.id);

    expect(ids).toContain("trait_spirit_seeker");
    expect(ids).toContain("trait_totem_spirit_bear");
    expect(ids).not.toContain("trait_totem_spirit_eagle");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @project/web exec vitest run src/store/__tests__/characterSheetStore.test.ts`
Expected: FAIL. No `resource_barbarian_rage`; `subclassIds` is not a known field; the totem is not compiled.

- [ ] **Step 3: Send `classes` from the route**

In `fetchCharacterPayload` (`apps/server/src/routes/character.ts`), add to the returned object beside `classLevels`:

```ts
    classes: classLedger.map((entry) => ({
      classId: entry.classId,
      level: entry.classLevel,
      subclassId: entry.subclassId ?? null,
    })),
```

- [ ] **Step 4: Hydrate `subclassIds` on the web**

`characterSheetRouteData.ts`: add to `CharacterSheetPayload`:

```ts
  classes?: Array<{ classId: string; level: number; subclassId: string | null }>;
```

and in `hydrateCharacterSheet`, beside `classLevels`:

```ts
    subclassIds: Object.fromEntries(
      (character.classes ?? []).map((entry) => [entry.classId, entry.subclassId]),
    ),
```

`characterSheetStore.ts`: add to the state interface after `classLevels`:

```ts
  /** Subclass per class id, null until chosen. Read by toCharacterSave. */
  subclassIds: Record<string, string | null>;
```

with default `subclassIds: {},` after `classLevels: {},`.

Replace the `classes:` property of `toCharacterSave` with:

```ts
  classes: (() => {
    const entries = Object.entries(state.classLevels);
    if (entries.length === 0) {
      return [{ classId: "class_fighter", level: 1, selections: {} }];
    }

    const classes = entries.map(([classId, level]) => {
      const subclassId = state.subclassIds[classId];
      return {
        classId,
        level,
        ...(subclassId ? { subclassId } : {}),
      };
    });

    // a chosen trait is a grant with source "player_choice"; which node it
    // answered is recovered from the pack
    const selectionsByClass = CharacterBootstrapper.selectionsFromChosenTraitIds(
      classes,
      state.traitGrants
        .filter((grant) => grant.source === "player_choice")
        .map((grant) => grant.traitId),
      state.ruleSnapshot ?? undefined,
    );

    return classes.map((entry) => ({
      ...entry,
      selections: selectionsByClass[entry.classId] ?? {},
    }));
  })(),
```

- [ ] **Step 5: Materialise pools in `initialize`**

Add this helper above the store creation:

```ts
/**
 * The pools the traits grant, appended where the payload carried none.
 *
 * The sheet route never sends resources, so without this a fresh sheet showed
 * no Rage at all. Mirrors the server's materialisation so the two agree
 * before the first action lands.
 */
const withGrantedPools = (state: CharacterSheetState): OperationalResource[] => {
  const snapshot = state.ruleSnapshot ?? undefined;
  if (!snapshot) return state.resources;

  const traits = CharacterBootstrapper.compileActiveTraits(
    toCharacterSave(state),
    snapshot,
  );
  const missing = materialiseMissingPools(
    state.resources.map((resource) => resource.id),
    collectGrantedResources(traits, snapshot),
    state.level,
    state.classLevels,
  );

  return [
    ...state.resources,
    ...missing.map((pool) => ({ id: pool.id, current: pool.current })),
  ];
};
```

and in `initialize`, change the returned object to:

```ts
        const next = { ...state, ...payload };
        return {
          ...next,
          itemActions: computeItemActions(next.inventory, next.ruleSnapshot),
          resources: withGrantedPools(next),
        };
```

Import `collectGrantedResources` and `materialiseMissingPools` from `@project/engine`. `OperationalResource` is already imported.

- [ ] **Step 6: Run the store, hooks and widget suites, then typecheck**

Run: `pnpm --filter @project/web exec vitest run src/store src/hooks src/components/sheet`
Expected: PASS. The Class Features panel test, if one exists, now sees Rage for a barbarian fixture; adjust only an expectation that pinned the absence of trait pools.
Run from `apps/web`: `npx tsc -b`
Expected: clean.
Run: `pnpm --filter @project/server exec vitest run src/routes && pnpm --filter @project/server typecheck`
Expected: PASS and clean.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/routes/character.ts apps/web/src/pages/characterSheetRouteData.ts apps/web/src/store/characterSheetStore.ts apps/web/src/store/__tests__/characterSheetStore.test.ts
git commit -m "fix(web): the sheet's save carries subclass and choices, and shows granted pools

The route now sends each class with its subclassId, the store rebuilds
trait_choice selections from player_choice grants, and initialize appends
any pool the traits grant that the payload lacked. A barbarian's Rage
shows in Class Features for the first time.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Slice 3: Pure authoring with existing vocabulary

### Task 12: Primal Champion, and a per-ability cap

**Files:**
- Modify: `packages/engine/src/calculators/abilities.ts:1-25, 60`
- Modify (via script): `packages/database/data/packs/core_2014_pack/classes/barbarian.json`
- Test: `packages/engine/src/calculators/__tests__/abilities.test.ts` (append), `packages/engine/src/pipeline/__tests__/characterEngine.test.ts` (append), `packages/database/src/__tests__/barbarianPack.test.ts` (append), `implementationMarkers.test.ts` (count)

**Interfaces:**
- Produces: `barbarian_capstone` raises the cap to 24 for `STR` and `CON` only; `trait_primal_champion` authored.

- [ ] **Step 1: Write the failing calculator tests**

Append to `abilities.test.ts`:

```ts
describe("AbilityEngine.calculateScore caps", () => {
  it("lifts Strength to 24 under barbarian_capstone", () => {
    const result = AbilityEngine.calculateScore(
      20,
      "STR",
      [makeMod({ sourceName: "Primal Champion", value: 4 })],
      ["barbarian_capstone"],
    );

    expect(result.score).toBe(24);
  });

  it("leaves Dexterity capped at 20 under barbarian_capstone", () => {
    // RAW raises the maximum for Strength and Constitution only
    const result = AbilityEngine.calculateScore(
      20,
      "DEX",
      [makeMod({ target: "DEX", sourceName: "Manual", value: 4 })],
      ["barbarian_capstone"],
    );

    expect(result.score).toBe(20);
    expect(result.breakdown).toContain("(Capped at 20)");
  });

  it("keeps the global cap states global", () => {
    const result = AbilityEngine.calculateScore(
      20,
      "DEX",
      [makeMod({ target: "DEX", sourceName: "Tome", value: 4 })],
      ["tome"],
    );

    expect(result.score).toBe(24);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @project/engine exec vitest run src/calculators/__tests__/abilities.test.ts`
Expected: the Dexterity test FAILS with 24.

- [ ] **Step 3: Make the cap per-ability**

Replace `getStateDrivenAbilityCap` in `abilities.ts`:

```ts
interface CapRule {
  state: string;
  cap: number;
  /** Absent means the cap applies to every ability. */
  abilities?: Ability[];
}

const CAP_RULES: CapRule[] = [
  // Primal Champion: "your maximum for those scores is now 24" - those two only
  { state: "barbarian_capstone", cap: 24, abilities: ["STR", "CON"] },
  { state: "tome", cap: 24 },
  { state: "ability_cap_24", cap: 24 },
  { state: "ability_cap_30", cap: 30 },
];

/**
 * The highest cap any active state grants for this ability, 20 otherwise.
 */
const getStateDrivenAbilityCap = (
  activeStates: string[] = [],
  target?: Ability,
): number =>
  CAP_RULES.reduce((maxCap, rule) => {
    if (!activeStates.includes(rule.state)) return maxCap;
    if (
      rule.abilities !== undefined &&
      target !== undefined &&
      !rule.abilities.includes(target)
    ) {
      return maxCap;
    }
    return Math.max(maxCap, rule.cap);
  }, 20);
```

and in `calculateScore`, `const maxCap = getStateDrivenAbilityCap(activeStates, target);`.

- [ ] **Step 4: Run the calculator test**

Run: `pnpm --filter @project/engine exec vitest run src/calculators/__tests__/abilities.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing pipeline and pack tests**

Append to `characterEngine.test.ts`:

```ts
describe("CharacterEngine.buildLiveSheet: Primal Champion", () => {
  // half-elf's ASI choice in this fixture adds +1 DEX and +1 CON
  const capstone = (level: number): CharacterSave =>
    halfElfFighter({
      attributes: { str: 20, dex: 20, con: 20, int: 12, wis: 10, cha: 8 },
      classes: [{ classId: "class_barbarian", level, selections: {} }],
    });

  it("raises Strength and Constitution by four, capped at 24", () => {
    const sheet = buildSheet(capstone(20));

    expect(sheet.abilities.STR.score).toBe(24);
    // 20 + 1 + 4 = 25, capped
    expect(sheet.abilities.CON.score).toBe(24);
  });

  it("does not lift the cap for the other scores", () => {
    // 20 + 1 = 21, still capped at 20
    expect(buildSheet(capstone(20)).abilities.DEX.score).toBe(20);
  });

  it("grants nothing at 19th level", () => {
    expect(buildSheet(capstone(19)).abilities.STR.score).toBe(20);
  });
});
```

Append to `barbarianPack.test.ts`:

```ts
describe("trait_primal_champion", () => {
  const trait = findTrait("trait_primal_champion");

  it("is engine-backed with real rule text", () => {
    expect(trait.implementation?.mode).toBe("engine");
    expect(trait.lore?.shortDescription).not.toBe("placeholder");
  });

  it("adds four to Strength and Constitution", () => {
    expect(
      trait.modifiers.fixed.map((modifier) => [modifier.target, modifier.type, modifier.value]),
    ).toEqual([
      ["STR", "add", 4],
      ["CON", "add", 4],
    ]);
  });

  it("grants the cap state the ability calculator reads", () => {
    expect(trait.grantedStates).toEqual(["barbarian_capstone"]);
  });
});
```

- [ ] **Step 6: Author the trait**

Write `primal-champion-patch.json`:

```json
{
  "upsertTraits": [
    {
      "id": "trait_primal_champion",
      "name": "Primal Champion",
      "lore": {
        "shortDescription": "Your Strength and Constitution scores increase by 4, and your maximum for those scores is now 24.",
        "fullText": "At 20th level, you embody the power of the wilds. Your Strength and Constitution scores increase by 4. Your maximum for those scores is now 24."
      },
      "isStartingProficiency": false,
      "implementation": {
        "mode": "engine",
        "summary": "Two flat adds of 4 to STR and CON, plus the barbarian_capstone state, which AbilityEngine reads as a cap of 24 for those two scores only. No scaling: the trait is granted at 20 and cannot be reached earlier.",
        "blockedBy": []
      },
      "grantedStates": ["barbarian_capstone"],
      "modifiers": {
        "fixed": [
          { "target": "STR", "type": "add", "value": 4, "scalingFactor": "none", "requiredStates": [], "forbiddenStates": [] },
          { "target": "CON", "type": "add", "value": 4, "scalingFactor": "none", "requiredStates": [], "forbiddenStates": [] }
        ],
        "choices": []
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

Run: `pnpm --filter @project/database exec tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/classes/barbarian.json <path-to>/primal-champion-patch.json`

In `implementationMarkers.test.ts`, change the count `452` to `451` and its comment to `// 451 of 587. Primal Champion authored.`.

- [ ] **Step 7: Run the three suites**

Run: `pnpm --filter @project/engine exec vitest run src/pipeline/__tests__/characterEngine.test.ts && pnpm --filter @project/database test --run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/calculators/abilities.ts packages/engine/src/calculators/__tests__/abilities.test.ts packages/engine/src/pipeline/__tests__/characterEngine.test.ts packages/database/data/packs/core_2014_pack/classes/barbarian.json packages/database/src/__tests__/barbarianPack.test.ts packages/database/src/__tests__/implementationMarkers.test.ts
git commit -m "feat(pack): Primal Champion, with a cap that lifts Strength and Constitution only

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 13: Aspect of the Beast: Bear, and a doubled carrying capacity

**Files:**
- Modify: `packages/engine/src/calculators/encumbrance.ts`, `packages/engine/src/pipeline/characterEngine.ts:373-380`
- Modify (via script): `traits/ported.json`
- Test: `encumbrance.test.ts`, `characterEngine.test.ts`, `barbarianPack.test.ts`, `implementationMarkers.test.ts` (count)

**Interfaces:**
- Produces: `CARRYING_CAPACITY_DOUBLED_STATE = "carrying_capacity_doubled"`; `EncumbranceInput.hasCarryingCapacityDoubled?: boolean`; the `totemBarbarian(level, selections)` test fixture reused by Tasks 14 and 18.

- [ ] **Step 1: Write the failing calculator tests**

Append to `encumbrance.test.ts`:

```ts
describe("EncumbranceEngine.calculate with a doubled capacity", () => {
  it("doubles every threshold", () => {
    const result = EncumbranceEngine.calculate(
      input({ hasCarryingCapacityDoubled: true, rules: { useVariantEncumbrance: true } }),
    );

    expect(result.maxCapacity).toBe(450);
    expect(result.encumberedThreshold).toBe(150);
    expect(result.heavilyEncumberedThreshold).toBe(300);
  });

  it("stacks with Powerful Build rather than replacing it", () => {
    // medium -> large is x2, doubled again is x4
    const result = EncumbranceEngine.calculate(
      input({ hasCarryingCapacityDoubled: true, hasPowerfulBuild: true }),
    );

    expect(result.maxCapacity).toBe(900);
  });

  it("doubles a small creature's capacity, where Powerful Build would not", () => {
    // small and medium share a multiplier of 1, so one size up changes
    // nothing for a small barbarian; doubling does
    expect(
      EncumbranceEngine.calculate(input({ size: "small", hasPowerfulBuild: true })).maxCapacity,
    ).toBe(225);
    expect(
      EncumbranceEngine.calculate(input({ size: "small", hasCarryingCapacityDoubled: true }))
        .maxCapacity,
    ).toBe(450);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @project/engine exec vitest run src/calculators/__tests__/encumbrance.test.ts`
Expected: FAIL (450 expected, 225 received).

- [ ] **Step 3: Add the multiplier**

In `encumbrance.ts`, after `POWERFUL_BUILD_STATE`:

```ts
/** Granted by Aspect of the Beast: Bear; read here and nowhere else. */
export const CARRYING_CAPACITY_DOUBLED_STATE = "carrying_capacity_doubled";
```

Add to `EncumbranceInput`:

```ts
  /** Aspect of the Beast (Bear). A second multiplier beside size, not a size change. */
  hasCarryingCapacityDoubled?: boolean;
```

In `calculate`, destructure `hasCarryingCapacityDoubled = false` and compute:

```ts
    const multiplier =
      SIZE_CAPACITY_MULTIPLIER[effectiveSize] * (hasCarryingCapacityDoubled ? 2 : 1);
```

In `characterEngine.ts`, in the `EncumbranceEngine.calculate({...})` call, add
`hasCarryingCapacityDoubled: baseStates.includes(CARRYING_CAPACITY_DOUBLED_STATE),`
and import `CARRYING_CAPACITY_DOUBLED_STATE` beside `POWERFUL_BUILD_STATE`.

- [ ] **Step 4: Run the calculator test**

Run: `pnpm --filter @project/engine exec vitest run src/calculators/__tests__/encumbrance.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing pipeline and pack tests**

Append to `characterEngine.test.ts` (this fixture is reused by Tasks 14 and 18):

```ts
/** A Totem Warrior with the given totem picks, for the subclass traits. */
const totemBarbarian = (
  level: number,
  selections: Record<string, string[]>,
): CharacterSave =>
  halfElfFighter({
    classes: [
      {
        classId: "class_barbarian",
        level,
        subclassId: "subclass_barbarian_totem_warrior",
        selections,
      },
    ],
  });

describe("CharacterEngine.buildLiveSheet: Aspect of the Beast (Bear)", () => {
  const picks = {
    barbarian_totem_level_3_totem_spirit: ["trait_totem_spirit_bear"],
    barbarian_totem_level_6_aspect: ["trait_aspect_of_the_beast_bear"],
  };

  it("doubles carrying capacity at 6th level", () => {
    // STR 15 in this fixture: 225 lb, doubled
    expect(buildSheet(totemBarbarian(6, picks)).encumbrance.maxCapacity).toBe(450);
  });

  it("does not before the aspect is chosen", () => {
    expect(buildSheet(totemBarbarian(5, picks)).encumbrance.maxCapacity).toBe(225);
  });
});
```

Append to `barbarianPack.test.ts`:

```ts
describe("trait_aspect_of_the_beast_bear", () => {
  const trait = findPortedTrait("trait_aspect_of_the_beast_bear");

  it("is engine-backed for the capacity and reports the check advantage", () => {
    expect(trait.implementation?.mode).toBe("engine");
    expect(trait.grantedStates).toEqual(["carrying_capacity_doubled"]);
    expect(trait.tableNotes?.[0]?.text).toMatch(/push, pull, lift/);
    expect(trait.tableNotes?.[0]?.requiredStates).toEqual([]);
  });
});
```

- [ ] **Step 6: Author the trait**

Write `aspect-bear-patch.json`:

```json
{
  "upsertTraits": [
    {
      "id": "trait_aspect_of_the_beast_bear",
      "name": "Aspect of the Beast: Bear",
      "lore": {
        "shortDescription": "You gain the might of a bear: your carrying capacity is doubled, and you have advantage on Strength checks made to push, pull, lift or break objects.",
        "fullText": "You gain the might of a bear. Your carrying capacity (including maximum load and maximum lift) is doubled, and you have advantage on Strength checks made to push, pull, lift, or break objects."
      },
      "isStartingProficiency": false,
      "implementation": {
        "mode": "engine",
        "summary": "Grants carrying_capacity_doubled, which EncumbranceEngine applies as a second multiplier beside size and Powerful Build, so a small bear-aspect barbarian doubles rather than moving one size up. The advantage on Strength checks to move objects has no state the engine can gate on, so it is a table note.",
        "blockedBy": []
      },
      "grantedStates": ["carrying_capacity_doubled"],
      "tableNotes": [
        {
          "text": "You have advantage on Strength checks made to push, pull, lift or break objects.",
          "requiredStates": [],
          "forbiddenStates": []
        }
      ],
      "modifiers": { "fixed": [], "choices": [] },
      "resources": [],
      "triggers": [],
      "diceRules": [],
      "criticalHitModifiers": [],
      "actions": []
    }
  ]
}
```

Run: `pnpm --filter @project/database exec tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/traits/ported.json <path-to>/aspect-bear-patch.json`

In `implementationMarkers.test.ts`, `451` becomes `450`, comment `// 450 of 587. Aspect of the Beast (Bear) authored.`.

- [ ] **Step 7: Run the suites**

Run: `pnpm --filter @project/engine test --run && pnpm --filter @project/database test --run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/calculators/encumbrance.ts packages/engine/src/pipeline/characterEngine.ts packages/engine/src/calculators/__tests__/encumbrance.test.ts packages/engine/src/pipeline/__tests__/characterEngine.test.ts packages/database/data/packs/core_2014_pack/traits/ported.json packages/database/src/__tests__/barbarianPack.test.ts packages/database/src/__tests__/implementationMarkers.test.ts
git commit -m "feat(pack): Aspect of the Beast (Bear) doubles carrying capacity

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 14: Totem Spirit: Eagle, a bonus-action Dash while raging

**Files:**
- Modify (via script): `traits/ported.json`
- Test: `barbarianPack.test.ts`, `characterEngine.test.ts`, `actionResolver.test.ts`, `socket.actionIntent.test.ts`, `implementationMarkers.test.ts` (count)

**Interfaces:**
- Produces: `action_eagle_dash` on `trait_totem_spirit_eagle`, an `apply_effect` mirroring the standard Dash, gated on `status_raging` and forbidden under `status_wearing_heavy_armor`.

- [ ] **Step 1: Write the failing tests**

Append to `barbarianPack.test.ts`:

```ts
describe("trait_totem_spirit_eagle", () => {
  const trait = findPortedTrait("trait_totem_spirit_eagle");
  const dash = trait.actions.find((action) => action.id === "action_eagle_dash");

  it("is engine-backed with a raging-gated bonus-action Dash", () => {
    expect(trait.implementation?.mode).toBe("engine");
    expect(dash?.activation).toBe("bonus_action");
    if (dash?.effect.type !== "apply_effect") throw new Error("expected apply_effect");
    expect(dash.effect.requiredStates).toEqual(["status_raging"]);
    expect(dash.effect.forbiddenStates).toEqual(["status_wearing_heavy_armor"]);
    expect(dash.effect.states).toEqual(["status_dashing"]);
    expect(dash.effect.durationType).toBe("turn_end");
    expect(dash.effect.modifiers[0]).toMatchObject({ target: "SPEED", type: "multiplier", value: 2 });
  });

  it("reports the opportunity-attack half as a note with the same gate", () => {
    expect(trait.tableNotes?.[0]?.text).toMatch(/opportunity attack/);
    expect(trait.tableNotes?.[0]?.requiredStates).toEqual(["status_raging"]);
    expect(trait.tableNotes?.[0]?.forbiddenStates).toEqual(["status_wearing_heavy_armor"]);
  });
});
```

Append to `characterEngine.test.ts`:

```ts
describe("CharacterEngine.buildLiveSheet: Totem Spirit (Eagle)", () => {
  const picks = { barbarian_totem_level_3_totem_spirit: ["trait_totem_spirit_eagle"] };

  it("offers the eagle's bonus-action Dash", () => {
    const dash = buildSheet(totemBarbarian(3, picks)).actions.find(
      (action) => action.id === "action_eagle_dash",
    );

    expect(dash?.activation).toBe("bonus_action");
  });

  it("does not offer it to a bear totem", () => {
    const bear = { barbarian_totem_level_3_totem_spirit: ["trait_totem_spirit_bear"] };

    expect(
      buildSheet(totemBarbarian(3, bear)).actions.some((action) => action.id === "action_eagle_dash"),
    ).toBe(false);
  });
});
```

Append to `actionResolver.test.ts` (it already imports `corePackLookup`, `EffectManager`, `ResourceManager`, `ActionResolver`):

```ts
describe("ActionResolver and the eagle totem's Dash", () => {
  const eagleDash = (): ActionGrant => {
    const trait = corePackLookup().traitsById?.["trait_totem_spirit_eagle"];
    const action = trait?.actions.find((entry) => entry.id === "action_eagle_dash");
    if (!action) throw new Error("action_eagle_dash missing from the shipped pack");
    return action;
  };

  it("doubles speed until the end of the turn while raging", () => {
    const effectManager = new EffectManager();

    const result = ActionResolver.execute(eagleDash(), payload(), {
      effectManager,
      resourceManager: new ResourceManager(),
      activeStates: ["status_raging"],
    });

    expect(result.executed).toBe(true);
    expect(effectManager.getActiveStates()).toContain("status_dashing");
  });

  it("applies nothing when the character is not raging", () => {
    const effectManager = new EffectManager();

    ActionResolver.execute(eagleDash(), payload(), {
      effectManager,
      resourceManager: new ResourceManager(),
      activeStates: [],
    });

    expect(effectManager.getActiveStates()).toEqual([]);
  });
});
```

(`payload()` is the file's existing helper returning a `RollContextPayload`; if it takes an action id, pass `"action_eagle_dash"`.)

Append to `socket.actionIntent.test.ts`:

```ts
  it("resolves a subclass action for a Totem Warrior whose totem was a player choice", async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterClasses, [
      {
        classId: "class_barbarian",
        classLevel: 3,
        subclassId: "subclass_barbarian_totem_warrior",
      },
    ]);
    harness.db.seed(characterTraits, [
      { traitId: "trait_totem_spirit_eagle", source: "player_choice" },
    ]);
    harness.db.seed(characterInventory, []);
    harness.db.seed(characterResources, [
      {
        id: "resource_barbarian_rage",
        characterId: "char-1",
        name: "Rage",
        current: 3,
        max: 3,
        resetCondition: "long_rest",
      },
    ]);

    await harness.emit(
      SOCKET_EVENTS.ACTION_INTENT,
      intent({ actionId: "action_rage", requestId: "req-rage" }),
    );
    await harness.emit(
      SOCKET_EVENTS.ACTION_INTENT,
      intent({ actionId: "action_eagle_dash", requestId: "req-dash" }),
    );

    const resolved = lastResolved(harness);
    expect(resolved).toMatchObject({ executed: true, actionId: "action_eagle_dash" });
    expect(resolved["activeStates"]).toContain("status_dashing");
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @project/database exec vitest run src/__tests__/barbarianPack.test.ts`
Expected: FAIL, the eagle trait has no actions.

- [ ] **Step 3: Author the trait**

Write `eagle-patch.json`:

```json
{
  "upsertTraits": [
    {
      "id": "trait_totem_spirit_eagle",
      "name": "Totem Spirit: Eagle",
      "lore": {
        "shortDescription": "While raging and not wearing heavy armour, other creatures have disadvantage on opportunity attack rolls against you, and you can use a bonus action on your turn to Dash.",
        "fullText": "While you're raging and aren't wearing heavy armor, other creatures have disadvantage on opportunity attack rolls against you, and you can use the Dash action as a bonus action on your turn. The spirit of the eagle makes you into a predator who can weave through the fray with ease."
      },
      "isStartingProficiency": false,
      "implementation": {
        "mode": "engine",
        "summary": "The bonus-action Dash is action_eagle_dash: the standard Dash effect (SPEED x2 until the end of the turn, status_dashing) gated on status_raging and forbidden under status_wearing_heavy_armor. The opportunity-attack half lands on other creatures' rolls, so it is a table note with the same gate. The heavy-armour gate holds on the sheet; the server's action path composes states from effects alone, so it does not block there.",
        "blockedBy": ["status_wearing_heavy_armor"]
      },
      "tableNotes": [
        {
          "text": "While raging and not wearing heavy armour, other creatures have disadvantage on opportunity attack rolls against you.",
          "requiredStates": ["status_raging"],
          "forbiddenStates": ["status_wearing_heavy_armor"]
        }
      ],
      "modifiers": { "fixed": [], "choices": [] },
      "resources": [],
      "triggers": [],
      "diceRules": [],
      "criticalHitModifiers": [],
      "actions": [
        {
          "id": "action_eagle_dash",
          "name": "Dash (Eagle Totem)",
          "activation": "bonus_action",
          "effect": {
            "type": "apply_effect",
            "effectName": "Dash",
            "effectTag": "dash",
            "durationType": "turn_end",
            "isSelfConcentration": false,
            "requiredStates": ["status_raging"],
            "forbiddenStates": ["status_wearing_heavy_armor"],
            "states": ["status_dashing"],
            "modifiers": [
              {
                "target": "SPEED",
                "type": "multiplier",
                "value": 2,
                "scalingFactor": "none",
                "requiredStates": [],
                "forbiddenStates": []
              }
            ]
          }
        }
      ]
    }
  ]
}
```

Run: `pnpm --filter @project/database exec tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/traits/ported.json <path-to>/eagle-patch.json`

In `implementationMarkers.test.ts`, `450` becomes `449`, comment `// 449 of 587. Totem Spirit (Eagle) authored.`.

- [ ] **Step 4: Run all four suites**

Run: `pnpm --filter @project/database test --run && pnpm --filter @project/engine test --run && pnpm --filter @project/server exec vitest run src/gateway/__tests__/socket.actionIntent.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/database/data/packs/core_2014_pack/traits/ported.json packages/database/src/__tests__/barbarianPack.test.ts packages/database/src/__tests__/implementationMarkers.test.ts packages/engine/src/pipeline/__tests__/characterEngine.test.ts packages/engine/src/pipeline/__tests__/actionResolver.test.ts apps/server/src/gateway/__tests__/socket.actionIntent.test.ts
git commit -m "feat(pack): Totem Spirit (Eagle) dashes as a bonus action while raging

Also the first end-to-end proof that a subclass action chosen by the
player resolves on the server.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 15: Delete the two Primal Path signposts

**Files:**
- Modify (via script): `classes/barbarian.json`, `traits/unimplemented.json`
- Test: `barbarianPack.test.ts`, `implementationMarkers.test.ts` (counts), `traitReachability.test.ts` (stays green)

- [ ] **Step 1: Write the failing pack test**

Append to `barbarianPack.test.ts`:

```ts
describe("the Primal Path signposts are gone", () => {
  it("grants no signpost trait at any level", () => {
    const barbarian = segment.classes.find((entry) => entry.id === "class_barbarian");
    const granted = barbarian?.progression.flatMap((row) => row.grants) ?? [];

    expect(granted).not.toContain("trait_primal_path");
    expect(granted).not.toContain("trait_primal_path_feature");
  });

  it("no longer authors either trait", () => {
    expect(() => findTrait("trait_primal_path")).toThrow();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @project/database exec vitest run src/__tests__/barbarianPack.test.ts`
Expected: FAIL.

- [ ] **Step 3: Apply the two patches**

`signposts-barbarian-patch.json`:

```json
{
  "deleteTraitIds": ["trait_primal_path"],
  "removeProgressionGrants": {
    "class_barbarian": ["trait_primal_path", "trait_primal_path_feature"]
  }
}
```

`signposts-unimplemented-patch.json`:

```json
{ "deleteTraitIds": ["trait_primal_path_feature"] }
```

Run both:

```bash
pnpm --filter @project/database exec tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/classes/barbarian.json <path-to>/signposts-barbarian-patch.json
pnpm --filter @project/database exec tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/traits/unimplemented.json <path-to>/signposts-unimplemented-patch.json
```

Check with `git diff packages/database/data/packs/core_2014_pack/classes/barbarian.json` that the level 3 row now grants only `trait_rage`, and rows 6, 10 and 14 have empty grants. A progression row with `"grants": []` is valid; the level 4 row already has one.

In `implementationMarkers.test.ts`: `449` becomes `447`, `587` becomes `585`, comment `// 447 of 585. The two Primal Path signposts were deleted: the subclass progression grants the real features.`.

- [ ] **Step 4: Run the database suite**

Run: `pnpm --filter @project/database test --run`
Expected: PASS, `traitReachability` included (nothing new is unreachable).

- [ ] **Step 5: Commit**

```bash
git add packages/database/data/packs/core_2014_pack packages/database/src/__tests__/barbarianPack.test.ts packages/database/src/__tests__/implementationMarkers.test.ts
git commit -m "refactor(pack): delete the Primal Path signposts

subclassUnlockLevel carries the choice and the subclass progression
grants the features, so the two placeholder traits said nothing. The
other eleven classes carry 36 more; recorded in the backlog.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
