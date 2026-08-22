# Schema layering and generated pack schemas

Date: 2026-08-22
Status: approved, ready to implement

Audit this design responds to: `docs/architecture/schema-errata.html`

## Problem

Two schema systems describe the same rulebook, and they are sick in opposite ways.

`packages/database/data/schemas/*.json` (15 files) are **inert**. No pack file
declares a `$schema`, no TypeScript imports them, no test asserts them. Validating
the real pack against them under ajv fails **12 of 30 segments** across six drift
classes, and in every case the JSON schema is the wrong side — the pack itself is
valid, and `pnpm --filter @project/database test` passes 84/84.

`packages/shared/src/schemas/*.ts` (22 files) are load-bearing and correct, but sit
flat in one directory with no separation between authored content, engine runtime
state, and wire payloads. Concepts are not merely scattered across those files, they
are independently redefined, and the copies have already drifted:

- Two exports named `ResourceMaxRuleSchema`, two named `TraitDefinitionSchema`.
- Three `{minimumLevel, value}` threshold objects differing on `positive` vs
  `nonnegative` and `number` vs `int`.
- An ability score defined seven times in two casings with two different bounds.
- Equipment defined three times (`items.ts`, `equipment.ts`, `weapons.ts`) plus a
  projection adapter between them.

The two problems share one root cause: **hand-mirroring a schema is a job with no
feedback loop.** The JSON schemas mirror the Zod schemas by eye; the duplicated Zod
definitions mirror each other by eye. Nothing fails when a mirror lags.

## The shape of the fix

Generation replaces the JSON mirroring entirely. Layering makes the Zod duplication
visible enough to collapse and hard enough to recreate.

Neither half is speculative. `z.toJSONSchema` was run against today's unmodified
`CoreRulePackSchema` before this design was written: it emits 69,705 bytes covering
all eleven top-level sections, with no unrepresentable-type errors.

## Architecture

Four layers inside `packages/shared/src/schemas/`, each importing only downward.

| Layer | Holds | May import |
| --- | --- | --- |
| `primitives/` | ability, damageType, coreRuleId, lore, statePredicate, scaling rule + threshold, choice block | nothing |
| `content/` | traits, spells, equipment, classes, races, feats, backgrounds, resources, proficiencies, actions, modifiers, affinities, dice, triggers, the pack envelope, the semantic validator | primitives |
| `runtime/` | RuntimeModifier, InventoryInstance, ActorInstance, CombatContext, CharacterSave, RuleSnapshot | content, primitives |
| `transport/` | socket events, importPack, homebrew payloads, CreateCharacterPayload | content, primitives |

The layer boundary answers questions that are currently unanswerable. Where does
`InventoryInstance` go? Runtime — it never appears in a pack. Does a wire-format
change force a pack version bump? Only if `content/` changed, which the directory
now states.

### The external surface does not change

`index.ts` keeps re-exporting everything flat. All **131** files importing
`@project/shared` (53 of them tests) stay untouched. This is deliberate: the chosen
sequence keeps every step independently verifiable, and rewriting 131 import sites
would put a large mechanical diff in the middle of steps whose correctness needs to
be readable.

Enforcement is internal instead, via `@typescript-eslint/no-restricted-imports` in
the existing root `eslint.config.mjs`:

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

The typescript-eslint variant rather than the base rule, because the base rule does
not catch `import type`, which is how most of these schemas reference each other.

## Generated schemas

Two schemas are generated from Zod and committed. They are build outputs, never
edited by hand.

| Generated file | Source | Validates | Verified output |
| --- | --- | --- | --- |
| `segment.schema.json` | `CoreRulePackSchema.omit({ pack: true }).partial()` | The 30 segment files | 68,619 bytes, `required: []` |
| `manifest.schema.json` | `CoreRulePackSchema.shape.pack.extend({ segments })` | `manifest.json` | 1,180 bytes, 8 properties |

Both derivations were run against the current schemas before this design was written.
Neither throws, and the segment schema was confirmed to accept `{"traits": []}` and
reject a mistyped section key.

A whole-pack `pack.schema.json` is deliberately **not** emitted. Between them these
two cover the entire `CoreRulePackSchema` surface — the segment schema every content
section, the manifest schema the `pack` envelope — so a third file would add no
validation reach and would have no consumer, packs being assembled from segments
rather than loaded as one file. This codebase has repeatedly had to unpick dead data;
a generated artifact nothing reads is exactly that.

Generation uses `target: "draft-7"` rather than the zod default of draft 2020-12.
Draft-07 is what `vscode-json-languageservice` supports fully, and editor
autocomplete for pack authors is a main reason these files exist. It also lets the
ajv test use ajv's default export with no dialect plugin.

### Why a segment schema is needed

The whole-pack schema cannot validate a segment file. A segment carries a subset of
sections and no `pack` key, so every segment would fail on a missing required
property. `corePackSegment.schema.json` exists today for exactly this reason — it is
simply hand-written, and hand-written is the thing being removed.

Deriving it as `.omit({ pack: true }).partial()` keeps it correct by construction.
Because `CoreRulePackSchema` is `.strict()` and both operations preserve strictness,
the derived schema also rejects unknown section keys. That is a real gain: the
assembler merges a fixed list of sections, so a segment with a mistyped section name
currently contributes nothing and says nothing.

### `io: "input"`

Generation uses `{ io: "input" }`. Pack files are authored *before* defaults are
applied, so the input type is what an author actually writes. The output variant
would demand every defaulted field be present — 76,683 bytes describing a shape no
pack file has.

### What generation cannot carry

`superRefine` rules do not survive into JSON Schema, and cross-references —
unknown trait ids, ammunition compatibility, progression ordering, subrace
presence — never could. `validateCoreRulePack` already covers these and keeps
covering them. The division is explicit: **JSON Schema for shape, the semantic
validator for meaning.** Neither is asked to do the other's job.

## Sequence

Six steps. Each ends with the full suite green and is independently revertable.

### Step 1 — Generate the schemas, delete the hand-written ones

Add a generation script, commit the two generated files, delete all 15 hand-written
schemas, and add `"$schema"` to the pack files.

`equipment/armor.json` stays out of the manifest. The audit flagged it as committed
but unlisted; on inspection it holds a single empty object, so it is an unfinished
scaffold rather than orphaned content — adding it to the manifest would fail
`CoreEquipmentSchema` on a missing id, name and lore. It is left exactly as it is,
and gets no `$schema` key, since it does not yet match the segment schema.

### `$schema` must be allowed, and stripped

Adding a `"$schema"` key to pack files collides with strictness in two places, both
of which the generation and load paths must handle:

- The derived segment schema inherits `.strict()`, so it would reject `$schema` as
  an unknown key. Each of the two generation sources is therefore extended with
  `$schema: z.string().optional()` before emitting.
- `assembleCoreRulePack` spreads the manifest's non-`segments` keys into `packMeta`,
  which is parsed by the `.strict()` pack envelope. The assembler must strip
  `$schema` alongside `segments`.

Two new tests: every segment validates against `segment.schema.json` under ajv, and
regenerating produces no diff.

This step alone kills all six drift classes and gives `classes`, `subclasses`,
`feats`, `backgrounds` and `proficiencies` their first schema — today they are bare
`{"type": "array"}` or absent.

**It also becomes the safety net for steps 2–6.** Every later step regenerates; the
no-diff check means an accidental shape change during a file move shows up as a
failing test rather than as silent drift. The refactor gets a regression detector
before the refactor starts, which is why this step moved from last to first.

### Step 2 — Collapse the name collisions

- One `ResourceMaxRuleSchema`. Today `resources.ts` has two kinds and `rules.ts` has
  three; the barrel's explicit export of the latter shadows the former, so
  `resources.ts`'s version is unreachable through `@project/shared`. Keep the
  three-kind version.
- One reset enum, the union of both: `short_rest`, `long_rest`, `long_rest_half`,
  `dawn`, `never`, `initiative_roll`, `start_of_turn`. Neither current enum contains
  the other, so a union is the only merge that loses nothing.
- One resource schema, replacing `ResourceGrant` (`resetOn`) and `ResourceRule`
  (`resetCondition`). Pack data uses `resetCondition`; that name wins.
- Delete the minimal `TraitDefinitionSchema` from `rules.ts`.
- One threshold *shape*, via a `thresholdOf(valueSchema)` helper in
  `primitives/scaling.ts`. `minimumLevel` unifies on `z.number().int().positive()`;
  the value constraint stays per-use, because it legitimately differs —
  `ModifierScalingThreshold` is `thresholdOf(z.number())` and `ResourceThreshold` is
  `thresholdOf(z.number().int().nonnegative())`. Merging the values instead would
  have to take the looser of the two and would stop rejecting a fractional resource
  count.

  `minimumLevel` tightening from `nonnegative` to `positive` is safe: no pack file
  authors `minimumLevel: 0` — the authored values are 1, 2, 3, 5, 6, 7, 9, 11, 12,
  13, 15, 16 and 17.

The pass signal is mechanical: the hand-written exception list in `index.ts` — and
the comment explaining why it exists — can be deleted, and the barrel goes back to
star-exporting everything.

`ResourceManager.resolveMaxCharges` currently handles `total_level_thresholds` but is
only ever called with a shape whose union lacks it. After this step that branch is
either reachable or provably dead; either way it stops being both.

### Step 3 — Extract `primitives/`

Pure moves with re-exports left behind so nothing downstream breaks in this step.
Ability and state predicate first — most sites, most existing drift. The ability
bounds conflict (1–30 on `CharacterSave`, 3–18 on `CreateCharacterPayload`) is
resolved by keeping both as named schemas over one enum: the enum is the primitive,
the bounds belong to the two call sites and legitimately differ.

### Step 4 — Split `content/`, `runtime/`, `transport/`

Mechanical once primitives exist. `coreRulePack.ts` (680 lines) breaks into its three
jobs: schema definitions, the ~350-line semantic validator, and the `toRuleSnapshot`
projection. `rules.ts` disappears — its weapon re-exports become direct imports, its
resource and trait redefinitions were removed in step 2, and `RuleSnapshot` moves to
`runtime/`.

Add the eslint rule at the end of this step, once the layout it describes exists.

### Step 5 — Delete `TraitEffect`

`TraitEffect` is a third trait vocabulary, and a vestigial one.
`corePackProjection.ts:138` writes `effects: []` for every pack trait — typed
`never[]` — so the column is empty for all core content. Only homebrew and legacy
import packs ever populate it, and no web UI writes either.

The consequence is visible at runtime:
`databaseReferenceProvider.matchesTraitCategory` cannot trust the column, so it falls
back to string-matching (`id.includes("_prof_skills")`, `name.includes("skill")`) —
and its `hasEffectCategory` helper tests for a `"proficiency_choice"` effect type
that `TraitEffectSchema` does not define, so that branch is already dead.

Homebrew and import author `TraitDefinition` directly. The `traits.effects` column is
migrated to hold the full definition. `matchesTraitCategory` reads real proficiency
grants and the string-matching goes.

This is the only step touching the database. It is done here rather than earlier
because it is the only step that is cheaper *after* the content layer exists, and
cheapest overall now — nothing in the web app writes homebrew yet.

### Step 6 — Retire `ItemDefinition` and `WeaponDefinition`

`EquipmentDefinition` is already the authored source and already carries every field
of both; `equipmentProjection.ts` exists purely to convert between them. They become
runtime projections at most.

`ItemType` carries `tool` and `loot` that `EquipmentType` lacks, which makes them
unauthorable today. Resolve by adding them to the authored enum or deleting them —
decided against the pack data at the time, not now.

Last, and ~100 non-test references, so it is the one step that can be dropped without
losing the value of the rest.

## Definition of done

Applies whether or not step 6 is taken, since it is explicitly droppable:

- No file under `packages/database/data/schemas/` is hand-written.
- Every pack file the manifest lists declares a `$schema` and validates against it.
  (`equipment/armor.json` is not listed and is excluded.)
- Regeneration produces no diff.
- `index.ts` star-exports every module, with no exception list.
- The eslint layering rule passes.
- shared, database, server and web suites green.

## Testing

| Guard | Introduced | Catches |
| --- | --- | --- |
| ajv: all 30 segments vs `segment.schema.json` | Step 1 | Authored data drifting from the schema |
| Regeneration produces no diff | Step 1 | Schema shape changing unintentionally during any later step |
| `validateCoreRulePack` | Exists | Cross-references, ordering, choice counts |
| shared / database / server / web suites | Exist | Everything else |

The second row is the one the refactor leans on. Steps 3 and 4 are large file moves
whose correctness is otherwise hard to assert; a byte-identical regenerated schema is
strong evidence that a move changed no shape.

## Risks

**Step 5 touches a running database.** Expendable per the project owner, so the
migration is a drizzle migration plus a re-import rather than a careful backfill.

**Step 6 has a large blast radius.** Deferred to last and explicitly droppable.

**`z.toJSONSchema` output churn across zod patch versions** would show up as a
spurious no-diff failure. Acceptable: the failure is loud, the fix is to regenerate
and review the diff, which is the intended workflow anyway.

## Out of scope

- Rewriting the 131 consumer import sites. The flat barrel stays; layering is
  enforced inside the package.
- Filling any authored gap the schemas describe. The equipment `implementation`
  markers, unimplemented traits and unimplemented spells stay exactly as they are.
- Backfilling a cross-check for the trait and spell implementation markers. Recorded
  as a follow-up; only equipment has one today.
- Changing `validateCoreRulePack`'s rules. It moves file, and its behaviour does not
  change.
- Adding pack composition or `extends` resolution. The `owns`/`extends` fields keep
  their current meaning.
