# Architecture Decisions

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