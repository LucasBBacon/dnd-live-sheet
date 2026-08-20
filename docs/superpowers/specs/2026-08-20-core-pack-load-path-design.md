# The Pack As The Only Source Of Rules

Date: 2026-08-20 (revised 2026-08-21)
Status: Designed, not started
Owner: Claude pair session

## Goal

Make the core rule pack the single source of rules content, and make it reach a
running character. Today nothing loads it, and the rules the application
actually runs on come from two other places entirely.

## The Finding

Chasing how an authored resource would reach `RestEngine.applyRest` ran off the
end of the chain:

- `loadCoreRulePack` is called from tests only.
- Nothing assembles the segment files into a single `CoreRulePack`. There is no
  manifest reader.
- `corePackImporter` and `projectCoreRulePack` are exercised by tests only.
- `/rules/snapshot` serves `traitsById: {}`.
- `seed.ts` fills the `traits` table from `data/traits.json`, which defines
  none of the six barbarian traits. `classes.json` progressions reference them,
  so seeding takes the placeholder branch and writes rows with `effects: []`.

**Barbarian is the pilot for the pack migration.** It was pulled out of the
static dictionaries on purpose - `classDictionary.ts` holds 11 classes with
barbarian deliberately absent, and `barbarianDictionary.ts` is a 0-byte file.
The last step was never built, which is why a barbarian character resolves to
no progression and no trait definitions while the other 11 classes work.

Five already-authored features are dormant because of this: Rage, Reckless
Attack, Fast Movement, Feral Instinct and Brutal Critical. Their rules logic is
real and engine-tested; only delivery is missing.

**Races prove the path works.** `RACE_DICTIONARY` is empty - 0 entries - and
the pack carries all 9 races and 19 subraces. That is what a finished section
looks like.

## The Direction

The static TypeScript dictionaries and the static JSON in
`packages/database/data/` are **not** a layer to be preserved. They are
scaffolding from before packs existed, and they get deleted.

Rules content comes from packs and nothing else. A pack that adds content
layers on top of the PHB 5e 2014 pack. A pack that defines an entirely
different rules system must say so in its own definition, so the standard rules
are never silently consulted underneath it.

This resolves a contradiction the codebase currently carries:

- `corePackImporter.ts` truncates fifteen reference tables and inserts the
  projection: *"The migration is intentionally destructive."* A pack is the
  whole world.
- `ruleLookup.ts`: *"the pack is filled in incrementally, so at any moment some
  content lives in one source and some in the other."* A pack is a layer.

The importer was right about the destination. The resolver was describing the
transition. Once the PHB pack is structurally complete and the legacy sources
are gone, the destructive import is simply correct.

## Content Inventory

What a structurally complete PHB pack needs, and where it can come from:

| source | count | shape | cost |
|---|---|---|---|
| already in the pack | 106 traits, 9 races, 19 subraces, 1 class, 2 subclasses | correct | done |
| `TRAIT_DICTIONARY` | 139 traits | already `TraitDefinition` | **mechanical port** |
| `CLASS_DICTIONARY` | 11 classes | already `ClassDefinition` | **mechanical port** |
| `SUBCLASS_DICTIONARY` | 38 subclasses | already pack-shaped | **mechanical port** |
| `EQUIPMENT_DICTIONARY` | 58 items | already `EquipmentDefinition` | **mechanical port** |
| `FEAT_DICTIONARY` | 4 feats | already pack-shaped | **mechanical port** |
| `BACKGROUND_DICTIONARY` | 4 backgrounds | already pack-shaped | **mechanical port** |
| `RESOURCE_DICTIONARY` | 2 resources | already `ResourceRule` | **mechanical port** |
| `traits.json`, already empty | 87 traits | nothing to carry | stub |
| `traits.json`, legacy-only | 143 traits | old `effects[]` shape | stub |
| `feats.json` beyond the dictionary | up to 4 | old shape | stub |

Note `SUBCLASS_DICTIONARY` carries **38** subclasses against legacy
`subclasses.json`'s 16 — the dictionary is the richer source, so subclasses
port rather than stub and the pack gains content the legacy JSON never had.
`RACE_DICTIONARY` is empty because races are already fully migrated.
`ITEM_DICTIONARY` (58) and `WEAPON_DICTIONARY` (3) are projections of
`EQUIPMENT_DICTIONARY` via `toItemDefinition` / `toWeaponDefinition`, not
separate content, so porting equipment covers all three.

The mechanical ports are a serialization script, not authoring:
`CoreTraitSchema` is `TraitDefinitionSchema.extend({ id, lore, isStartingProficiency })`
over a dictionary already typed `Record<string, TraitDefinition>`, and
`CoreClassSchema` is `ClassDefinitionSchema.extend({ id, lore })` over
`Record<string, ClassDefinition>`. Dictionary ids already satisfy
`CoreRuleIdSchema`'s lowercase snake_case rule.

**Decision: the 143 legacy-only traits are stubbed, not transformed.** Their
rules go dark until each is authored properly. Writing a converter for the old
`effects[]` shape would preserve them, but its fidelity is unknown and any
entry it could not express would become a stub discovered mid-migration. A
marked stub is honest; a half-faithful transform is not.

## Design

### 1. A stub must declare that it is a stub

`TraitImplementationMetadataSchema.mode` is currently
`"engine" | "manual_sheet_helper"`. Neither means *not authored yet*.

Without a third value, a stubbed trait is indistinguishable from a finished
trait that happens to grant nothing - which is exactly the failure this whole
investigation uncovered. `seed.ts` writes `effects: []` placeholders, and that
silence is why five barbarian features looked implemented and were dormant.
Stubbing the rest of the PHB without a marker would reproduce that bug
deliberately, at eleven times the scale.

So `mode` gains `"unimplemented"`. The sheet can then say so, the pack
validator can count what is outstanding, and finishing the PHB becomes a
measurable burndown.

### 2. A pack declares its ruleset and what it extends

```json
{
  "packId": "core_2014",
  "version": 1,
  "ruleset": "dnd_5e_2014",
  "extends": [],
  "owns": ["traits", "races", "subraces", "classes", "subclasses",
           "feats", "backgrounds", "equipment", "resources"],
  "segments": ["races/dwarf.json", "...", "classes/barbarian.json"]
}
```

- `ruleset` stops being `z.literal("dnd_5e_2014")`. The database column is
  already `varchar(100)`; the Zod literal is the only thing preventing another
  system. **Packs whose rulesets differ never compose.** A homebrew system
  declares its own `ruleset` and an empty `extends`, and the standard rules are
  therefore never consulted underneath it.
- `extends` lists the packs this one layers onto, giving supplements an
  explicit base and a deterministic order.
- `owns` names the sections this pack is complete for, so nothing beneath it
  merges there. A supplement owns nothing and adds entries; a standalone
  homebrew system owns everything.
- `segments` is the table of contents. It is assembly metadata and is stripped
  before the pack is parsed, because the pack meta block is `.strict()`.

### 3. Assembly

`assembleCoreRulePack(packDir)` reads the manifest, reads each listed segment,
merges the arrays section by section, and hands the result to the existing
`loadCoreRulePack` validation - which already performs schema *and* semantic
checks: duplicate ids, unknown class references, dangling trait references, and
a `resourceIds` set unioning pack-level resources with trait-granted ones.

The manifest drives the read rather than a directory walk, so a misnamed file
fails loudly instead of becoming silently missing content, and merge order is
authored rather than filesystem-dependent.

### 4. Import stays destructive

Once the PHB pack owns every section and the legacy sources are deleted, the
existing `TRUNCATE`-and-insert importer is correct as written. **No change is
needed.**

The two-mode import - wholesale replacement for owned sections, entity-scoped
replacement for the rest - is what a *second* pack will need, and only then.
Building it now would be building composition machinery with nothing to
compose. The `owns` and `extends` declarations land now so packs are authored
correctly from the start and the contract is fixed; the importer learns to
honour them when a supplement pack actually exists.

### 5. The engine reads the payload; the relation tables are a query model

`projectCoreRulePack` writes `effects: []` into every trait row, with the
comment *"The complete trait AST stays in corePack."* The relation tables exist
for the browse endpoints and the homebrew overlay. The rule ASTs live in
`core_rule_packs.payload`, a `jsonb` column already typed `$type<CoreRulePack>()`.

So `ruleSnapshotCache` - which today hardcodes `traitsById: {}` - populates
`traitsById`, `racesById` and `classesById` **from the payload row**.
`resolveTraitDefinition` and its siblings already prefer snapshot content over
the static dictionaries when present, so no engine change is required.

This is the most confusable part of the design. Reading ASTs from the relation
tables would silently yield traits with no effects.

`RuleSnapshotSchema` is deliberately **not** the vehicle for pack content. Its
`traitsById` parses against a minimal `TraitDefinitionSchema` declared inside
`rules.ts` whose `modifiers` is a flat array, while a real trait's `modifiers`
is `{ fixed, choices }`. The shapes are incompatible, and
`packages/shared/src/index.ts` already documents why the minimal one is kept
unexported. `CoreRulePackSnapshot` carries the correct types and is what
`RuleSnapshotLookup` expects.

## Slices

| | scope | verifiable by |
|---|---|---|
| 1 | `mode: "unimplemented"`, `ruleset` widening, `extends`, `owns` | schema tests; no behaviour change |
| 2 | port the four dictionaries, stub the remainder | the assembled pack validating with every PHB id present |
| 3 | manifest `segments`, the assembler, snapshot serving from the payload | **a barbarian resolving all five features end to end** |
| 4 | run the import, delete the legacy sources | the application running with no dictionary and no `data/*.json` |

Slice 3 is where five features stop being dormant. Slice 4 is where the pack
becomes the only source.

## Risks

**Slice 4 is the dangerous one.** The classes, subclasses, feats, backgrounds
and equipment all port with their real definitions intact, so the regression is
narrower than it first looked: it is confined to the ~230 traits that have no
portable definition. Those go dark until authored. A deliberate, temporary
regression in exchange for one source of truth - and the `"unimplemented"`
marker is what keeps it visible rather than silent.

**`staticReferenceProvider` dies with the dictionaries.** It imports nine of
them (`BACKGROUND`, `CLASS`, `EQUIPMENT`, `FEAT`, `ITEM`, `RACE`, `SUBCLASS`,
`TRAIT`, `WEAPON`), so slice 4 must delete it and make `db` the only reference
source. This matters earlier than it looks: `REFERENCE_SOURCE` defaults to
`"static"`, so **the slice 3 changes are invisible in a default dev server**
until either the variable is set or the default flips.

**Blast radius at slice 3.** The sample-character fixtures include barbarians
who currently resolve to no traits at all. When the pack goes live their sheets
change substantially, and failures beyond the 4 known-red tests should be
expected. That is the pack working, not breaking.

## What This Unblocks

- The five dormant barbarian features.
- The resources migration into `pack.resources` - a section
  `CoreRulePackSchema` already declares and validates, and which is completely
  empty. Moving `RESOURCE_DICTIONARY` there also fixes Relentless Endurance,
  whose resource has no rule today and so is returned untouched by `applyRest`:
  it never resets.
- Relentless Rage, parked in `2026-08-20-relentless-rage-design.md`.
- Supplement and homebrew packs, once the importer learns to honour `extends`
  and `owns`.

## Deferred

- **Two-mode import.** Needed by the second pack, not the first. See section 4.
- **`seed`/`import` ordering.** Moot once slice 4 deletes the reference half of
  the seed. Until then, seed-then-import is the only workable order.
- **A `resources` reference table.** `pack.resources` reaches the runtime
  through the payload; the relation table is only needed when a browse endpoint
  wants to query resources.
