# Starting Equipment Source-of-Truth Implementation

Date: 2026-08-12
Status: In progress
Owner: Copilot pair session

## Goal

Implement a rigid, single source-of-truth flow for starting equipment authoring and resolution, while preserving deterministic behaviour across shared contracts, engine dictionaries, server validation, and web compile paths.

## Pivotal Review Gates

1. Gate 1: Tracker created and implementation slices agreed.
2. Gate 2: Shared resolver contract added and wired into server validation.
3. Gate 3: Web compile flow switched to shared resolver behaviour.
4. Gate 4: Tests green and behavioural caveat coverage confirmed.

I will pause at each gate for your review before proceeding.

## Working Plan

- [x] Step 1: Create working tracker and define review gates.
- [x] Step 2: Add shared canonical category resolver and supporting types.
- [x] Step 3: Replace server-side ad hoc resolution checks with shared resolver.
- [x] Step 4: Align web compile pipeline to resolver output and failure semantics.
- [x] Step 5: Add focused tests for unresolved, ambiguous, and happy-path category grants.
- [x] Step 6: Run targeted test suites and record outcomes.

## Category Migration Path (approved)

Direction: category membership will live on item data as explicit tags, with category identifiers remaining first-class in the starting equipment grants.

Migration rule: no deprecation flag. Perform direct cutover where possible and remove legacy category inference logic as each surface is migrated.

Execution slices:

- [x] Slice A: Extend shared item schema with explicit category tags.
- [x] Slice B: Backfill static equipment dictionary entries with category tags for all currently referenced starting-equipment categories.
- [x] Slice C: Switch shared category matcher to tag-first resolution and remove string-token heuristics for migrated categories.
- [x] Slice D: Align web category option building to shared matcher behaviour after tag migration.
- [x] Slice E: Add migration-focused tests (multi-category item membership, unknown category, missing tag, deterministic ordering).
- [x] Slice F: Run shared, web, and server targeted suites and record outcomes.

## Live Notes

### 2026-08-12 - Step 1 complete

- Created this tracker file.
- Defined four explicit pivotal review gates.
- Next action (pending your review): implement shared canonical category resolver in shared package.

### 2026-08-12 - Step 2 complete

- Added shared starting equipment helpers in packages/shared/src/startingEquipment.ts.
- Added canonical resolution status calculation for unresolved choices and unresolved given category grants.
- Added canonical category matching logic for category ref IDs.
- Added shared tests in packages/shared/src/**tests**/startingEquipment.test.ts.

### 2026-08-12 - Step 3 complete

- Wired character creation route validation to shared resolution status helper.
- Wired inventory category matching and grant resolution checks to shared helpers.
- Added route coverage for unresolved given category grants.
- Updated inventory tests to reflect strict unresolved choice and category rejection semantics.
- Validation runs:
  - pnpm --filter @project/shared test: pass
  - pnpm --filter @project/server test -- src/utils/**tests**/inventory.test.ts: pass
  - pnpm --filter @project/server test -- src/routes/**tests**/character.test.ts: pass

### Gate 2 checkpoint

Gate 2 is now complete: shared resolver contract added and server validation wired.
Paused for review before Step 4 (web compile alignment).

### 2026-08-12 - Plan update accepted

- Added explicit item-category-in-data migration path.
- Confirmed direct cutover approach with no deprecation flag.
- Next implementation focus remains Gate 3, now executed through Slices A-D above.

### 2026-08-12 - Slice A complete

- Added StartingEquipmentCategoryTagSchema to shared item schema vocabulary.
- Added categoryTags on ItemDefinitionSchema with empty-array default.
- Mirrored categoryTags on EquipmentDefinitionSchema to preserve item/equipment complementarity.
- Extended shared schema tests to cover category-tag parsing and default behaviour.
- Validation runs:
  - pnpm --filter @project/shared test: pass
  - pnpm --filter @project/shared typecheck: pass

### Slice A checkpoint

Slice A complete. Paused for review before Slice B static dictionary category-tag backfill.

### 2026-08-12 - Slice B complete

- Backfilled category tags for static placeholder and canonical weapon/shield entries used by current starting-equipment categories.
- Added explicit placeholder entries for currently selected category resolution IDs:
  - item_holy_symbol_amulet
  - item_focus_wand
  - item_focus_druidic_totem
- Switched equipment dictionary construction to schema-normalised seed parsing so non-tagged legacy entries still receive deterministic empty tag arrays.
- Updated item projection to carry categoryTags through to ITEM_DICTIONARY.
- Updated engine and server typed test fixtures to include categoryTags where ItemDefinition literals are hand-authored.
- Validation runs:
  - pnpm --filter @project/engine test: pass
  - pnpm --filter @project/engine typecheck: pass
  - pnpm --filter @project/server typecheck: pass
  - pnpm --filter @project/web typecheck: pass

### Slice B checkpoint

Slice B complete. Paused for review before Slice C shared matcher cutover (tag-first and heuristic removal for migrated categories).

### 2026-08-12 - Slice C complete

- Replaced shared category matcher heuristics with explicit tag-membership matching only.
- Updated shared matcher tests to assert tag-based matching and no implicit fallback.
- Updated server inventory category resolution to pass itemRule.categoryTags into the shared matcher.
- Validation runs:
  - pnpm --filter @project/shared test: pass
  - pnpm --filter @project/shared typecheck: pass
  - pnpm --filter @project/server test -- src/utils/**tests**/inventory.test.ts: pass
  - pnpm --filter @project/server typecheck: pass

### Slice C checkpoint

Slice C complete. Paused for review before Slice D web category option alignment.

### 2026-08-12 - Slice D complete

- Replaced web-local category inference logic with shared tag-based matcher usage in startingEquipment utility code.
- Simplified web snapshot dependency for category option building to itemsById only.
- Added focused web tests for:
  - tag-based category inclusion
  - missing-tag exclusion
  - deterministic name ordering
- Validation runs:
  - pnpm --filter @project/web test -- src/utils/**tests**/startingEquipment.test.ts src/utils/**tests**/compileCharacter.test.ts: pass
  - pnpm --filter @project/web typecheck: pass

### Slice D checkpoint

Slice D complete. Paused for review before Slice E migration-focused test expansion.

### 2026-08-12 - Slice E complete

- Expanded shared matcher tests for:
  - multi-category membership match
  - unknown category rejection
- Expanded server inventory tests for tag-based category resolution:
  - unknown category returns empty payload
  - missing tags return empty payload
  - deterministic tie-break by name/id for matching category candidates

### 2026-08-12 - Slice F complete

- Validation sweep executed across shared, server, and web:
  - pnpm --filter @project/shared test -- src/**tests**/startingEquipment.test.ts: pass
  - pnpm --filter @project/shared typecheck: pass
  - pnpm --filter @project/web test -- src/utils/**tests**/startingEquipment.test.ts src/utils/**tests**/compileCharacter.test.ts: pass
  - pnpm --filter @project/web typecheck: pass
  - pnpm --filter @project/server typecheck: pass
  - pnpm --filter @project/server test -- src/utils/**tests**/inventory.test.ts: pass
  - pnpm --filter @project/server test -- src/routes/**tests**/character.test.ts: pass
- Note: running both server test files in one command can time out due cross-file mocking interaction; isolated runs are green and deterministic.

### Gate 4 checkpoint

Gate 4 complete: migration-focused coverage and targeted validation are green.
Paused for review.

### 2026-08-12 - Post-Gate hardening (combined server test stability)

- Refactored inventory utility tests to avoid global module mocks that leaked across files.
- Converted drizzle mock to a partial mock so non-mocked exports (for example sql) remain available to schema imports.
- Revalidated the previously flaky combined command:
  - pnpm --filter @project/server test -- src/utils/**tests**/inventory.test.ts src/routes/**tests**/character.test.ts: pass
