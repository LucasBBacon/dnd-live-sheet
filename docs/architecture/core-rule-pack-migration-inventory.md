# Core Rule Pack Migration Inventory

## Purpose

This inventory fixes the Phase 0 retirement boundary for the core-rule authority migration. It identifies authored static data that must become validated core-pack content, projections that may remain as pure transforms, and executable logic that remains in the engine.

The completion criterion is that no production path imports an authored static dictionary. Core API responses and engine workflows must use an explicit database-derived rule snapshot after scoped reference resolution.

## Authoring Data To Move Into Core Packs

| Family | Current engine modules | Target pack content |
| --- | --- | --- |
| Classes and class progression | `rules/classDictionary.ts`, `rules/classes/*.ts`, `rules/progressionDictionary.ts` | classes, subclass choice metadata, level progression, grants, choices, spell selections, ASI flags, scaling, multiclass requirements, starting equipment |
| Subclasses | `rules/subclassDictionary.ts`, `rules/classes/*.ts` | subclass identity, parent class, level progression, grants and choices |
| Races and subraces | `rules/raceDictionary.ts` | race and subrace identity, size, speed, grants, subrace requirements and display metadata |
| Traits and feature mechanics | `rules/traitDictionary.ts`, `rules/traits/*.ts` | trait identity, lore, modifiers, affinities, resources, actions, dice rules, triggers, grants and choices |
| Feats | `rules/featDictionary.ts` | feat identity, lore, category, prerequisites and granted traits |
| Backgrounds and starting equipment | `rules/backgroundDictionary.ts`, `rules/startingEquipmentDictionary.ts` | background identity, lore, personality data, grants and starting-equipment rules |
| Equipment, items and weapons | `rules/equipmentDictionary.ts` | canonical equipment records including weight, slots, categories, modifiers, container capacity, ammunition and weapon capabilities |
| Resources | `rules/resourceDictionary.ts` | resource identities, reset conditions and maximum rules |
| Proficiency and spell catalogue data | `rules/proficiencyDictionary.ts`, `rules/spellDictionary.ts` | proficiency definitions and spell catalogue data, provided they are active authored records rather than type constants |

## Projections And Algorithms To Retain

These are not authored core data. They remain only if they accept data explicitly rather than importing a dictionary.

| Area | Required outcome |
| --- | --- |
| Equipment projections | Keep pure equipment-to-item and equipment-to-weapon transforms only if snapshot consumers still need compatibility maps. Move them to the package that owns the projection if the engine no longer needs them. |
| Rule lookup | Replace `rules/ruleLookup.ts` static fallbacks and `EQUIPMENT_RESOLUTION_MODE` with snapshot-required lookup helpers. |
| Calculators and pipelines | Retain deterministic calculators, encumbrance, combat, rest, inventory and live-sheet pipelines. Thread the effective snapshot from the orchestration boundary. |
| Shared schemas | Retain and extend Zod contracts in `@project/shared` as the canonical contract layer for pack input and runtime snapshots. |
| Database cache and resolver | Retain database-backed cache, effective scoped resolver and provider. Extend them until they return the complete snapshot required by the engine. |

## Runtime Paths To Retire

- `apps/server/src/services/referenceProvider/staticReferenceProvider.ts`
- Static-provider selection, `REFERENCE_SOURCE`, and static fallback configuration in `apps/server/src/services/referenceProvider/index.ts`
- Static dictionary exports from `packages/engine/src/index.ts`
- `EQUIPMENT_RESOLUTION_MODE = "static-only"` and every dictionary fallback in `packages/engine/src/rules/ruleLookup.ts`
- `itemsExtraction.ts` inference, manual overrides and permissive diagnostics after canonical equipment records are authored directly
- JSON-versus-dictionary drift tests, dictionary fixtures that stand in for the core catalogue, and comments describing dual authority as an ongoing architecture

## Verification Gates

The migration cannot be considered complete until all of the following hold:

1. The complete checked-in core pack parses and passes semantic validation.
2. Import either publishes the full pack atomically or writes no new core reference data.
3. Every published core record and rule payload can be reconstructed into the validated runtime snapshot.
4. The database reference provider is the only production provider.
5. Engine entry points receive rule data explicitly and do not import core catalogue modules.
6. Scoped homebrew precedence and cache invalidation work against the same database-derived snapshot model.
7. Source hygiene rejects restored static providers and authored static dictionary imports in runtime code.