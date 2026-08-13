# Architecture Decisions

## 2026-08-13 - Adopt validated core packs as the sole core-rule authoring authority

**Status:** Accepted

**Context:**
- Core rules are currently authored in both static engine dictionaries and JSON files that seed PostgreSQL.
- The default server provider reads the static dictionaries, while the database contains a separately transformed representation of the JSON files.
- The two sources have already diverged, requiring drift tests, placeholders, and transformations that can hide incomplete content.
- Core rules must support relational querying and scoped homebrew overrides, while complex rule expressions must remain practical to author and evolve.

**Decision:**
- Version-controlled, schema-validated core rule packs are the sole authoring authority for the core 2014 compendium.
- PostgreSQL is the transactional runtime authority after a pack has been imported and published. It is also the authority for scoped homebrew and operational data.
- The engine owns rule contracts and deterministic interpretation only. It receives an explicit immutable rule snapshot or repository and does not own an authored core catalogue.
- Core pack imports must validate schema and cross-record semantics before atomically publishing a database projection. Invalid content fails import; the importer must not create placeholder rules or silently repair data.
- Relational tables retain identities, links, publication state, provenance, and query-oriented fields. Complex validated rule ASTs remain structured JSONB payloads where full normalisation would not provide a clear benefit.
- The static provider and authored engine dictionaries are transitional migration material and will be retired after the database-derived snapshot path is complete. The migration is intentionally breaking and will not retain a permanent dual-read fallback.

**Consequences:**
- A core-rule change has one reviewed, version-controlled source and one production projection.
- Database snapshots become reproducible from a known pack version and provide the common input for API responses and engine calculations.
- Pack validation moves content defects to import time, rather than allowing incomplete data to become runtime fallbacks.
- The database schema remains useful for reference resolution and homebrew precedence without turning every rule expression into relational tables.
- Existing dictionaries, static-only lookup modes, extraction heuristics, and parity tests must be replaced or removed during the migration.

**Initial implementation scope (phases 0-6):**
- Document the authority boundary and retirement inventory.
- Define a lossless shared core-pack contract and semantic validation.
- Replace permissive JSON seeding with strict transactional import.
- Build complete database-derived rule snapshots and pass them explicitly to the engine.
- Remove static providers, dictionary fallbacks, and duplicate authored rule data.
- Verify normal workflows, invalid-pack failure behaviour, and scoped homebrew precedence.

## 2026-07-11 - Unify item and weapon authoring with shared-owned contracts

**Status:** Accepted

**Context:**
- The domain model treats weapons as items, but rule authoring and runtime contracts are currently split across item and weapon shapes.
- Weapon contract ownership is duplicated between shared schemas and engine-local types.
- This duplication increases drift risk and makes migration to a single canonical equipment model harder.

**Decision:**
- Shared schemas are the single source of truth for weapon contracts.
- Engine local weapon contract ownership is removed and replaced with shared type consumption.
- Runtime compatibility is maintained by keeping existing item and weapon lookup projections for now.
- A later phase will introduce canonical equipment authoring and derive item and weapon views from it.

**Consequences:**
- Cross-package contracts are owned in one place, reducing type divergence.
- Engine can continue to expose compatibility types while delegating ownership to shared.
- Future work can unify dictionaries without needing another contract migration.

**Initial implementation scope (phases 1-3):**
- Add this ADR entry.
- Centralise weapon schemas in shared.
- Update engine to import weapon definitions from shared and remove duplicated ownership.