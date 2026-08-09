# TODO Backlog

Triage of every `TODO` comment in the repo (30 as of `066cbeb`, 29 open), grouped by
what actually blocks what rather than by file location. Tiers are ordered so that
finishing a tier removes blockers from the tiers below it.

Two `NOTE:` comments in `packages/engine/src/calculators/__tests__/` are
documentation, not work items, and are excluded.

---

## Structural finding (context for several items below)

Three data channels are declared in the schemas and populated by the trait
dictionaries, but **no engine code reads them**:

| Channel | Declared in | Consumed by |
| --- | --- | --- |
| `triggers` (`listenFor` / `executeAction`) | `packages/shared/src/schemas/triggers.ts` | nothing |
| `effect.type: "macro"` | `packages/shared/src/schemas/actions.ts` | `ActionResolver` case is empty |
| `criticalHitModifiers` | `packages/shared/src/schemas/traits.ts` | nothing outside `traitDictionary` re-export |

This is why the "Conditional events" TODOs on Half-Orc traits exist: the data is
authored correctly, the runtime just never dispatches it. Several P2 items collapse
into "build the event bus" rather than "implement this one trait".

---

## P0 — Traits that are authored but inert

These read as finished features in the dictionaries and in any UI listing them, but
produce no runtime behaviour. Highest risk of being mistaken for done.

| # | Item | Location |
| --- | --- | --- |
| 1 | `macro` action handler — empty switch case, so `MACRO_DROP_TO_ONE_HP` never fires | [actionResolver.ts:68](packages/engine/src/pipeline/actionResolver.ts:68) |
| 2 | Relentless Endurance "conditional events" — declares a trigger nothing listens for | [halfOrcDictionary.ts:88](packages/engine/src/rules/traits/halfOrcDictionary.ts:88) |
| 3 | Savage Attacks "conditional events" — `criticalHitModifiers` has no consumer | [halfOrcDictionary.ts:115](packages/engine/src/rules/traits/halfOrcDictionary.ts:115) |
| 4 | `EffectManager` / `ResourceManager` hydration — bootstrapper validates and builds the sheet but restores no live state | [characterBootstraper.ts:385-386](packages/engine/src/pipeline/characterBootstraper.ts:385) |

**Suggested order:** 4 → 1 → 2 → 3. Hydration first, because a trigger bus that
fires against an unhydrated `ResourceManager` cannot consume charges correctly.

---

## P1 — Schema foundations (small, unblock the tiers below)

Each is a localised schema edit whose absence is currently papered over with a
hardcoded fallback.

| # | Item | Location | Note |
| --- | --- | --- | --- |
| 5 | `WeaponDefinitionSchema` has no range fields; synthesizer hardcodes `80/320` and `5/10` | [weaponSynthesizer.ts:27](packages/engine/src/pipeline/weaponSynthesizer.ts:27) | Add `range` / `longRange` to [weapons.ts](packages/shared/src/schemas/weapons.ts), backfill `weaponDictionary` |
| 6 | Thrown range hardcoded to `20/60` | [weaponSynthesizer.ts:98](packages/engine/src/pipeline/weaponSynthesizer.ts:98) | Same fix as #5 — one schema change closes both |
| 7 | `BaseEffectSchema` predicates (e.g. armor restrictions) | [effects.ts:7](packages/shared/src/schemas/effects.ts:7) | Prerequisite for the conditional-trait items in P2 |
| 8 | `SKILL_MAP` lives in engine but is used by engine + client | [core.ts:10](packages/engine/src/types/core.ts:10) | Pure move to `@project/shared`; no logic change |

**Suggested order:** 5+6 together, then 7, then 8.

---

## P2 — Feature verticals

### 2a. Dice & attack resolution (largest cluster)

`ActionResolver` only implements `apply_effect`. Everything else is a stub, and the
UI has matching stubs waiting on it. `packages/engine/src/utils/diceParser.ts` and
`pipeline/rollContextBuilder.ts` already exist and are the natural starting points.

| # | Item | Location |
| --- | --- | --- |
| 10 | `attack` — dice rolling for attacks | [actionResolver.ts:58](packages/engine/src/pipeline/actionResolver.ts:58) |
| 11 | `save` — saving-throw rolls | [actionResolver.ts:78](packages/engine/src/pipeline/actionResolver.ts:78) |
| 12 | `damage_rider` — damage-over-time application | [actionResolver.ts:73](packages/engine/src/pipeline/actionResolver.ts:73) |
| 13 | Dispatch roll results to the VTT log (currently `console.log`) | [CombatWidget.tsx:39](apps/web/src/components/sheet/CombatWidget.tsx:39) |
| 14 | Hit Dice roll/spend buttons in the rest flow | [RestModal.tsx:128](apps/web/src/components/sheet/modals/RestModal.tsx:128) |

**Suggested order:** 10 → 13 (one end-to-end slice proves the roll → log contract) →
11 → 12 → 14.

### 2b. Summons

| # | Item | Location |
| --- | --- | --- |
| 15 | `summon` pipeline | [actionResolver.ts:63](packages/engine/src/pipeline/actionResolver.ts:63) |
| 16 | Tinker toy entity tracking | [gnomeDictionary.ts:230](packages/engine/src/rules/traits/gnomeDictionary.ts:230) |
| 17 | Dismantle action on the summoned toy's sheet | [gnomeDictionary.ts:261](packages/engine/src/rules/traits/gnomeDictionary.ts:261) |

Strictly ordered 15 → 16 → 17; the Gnome items are consumers of the pipeline. This
vertical needs a decision first: do summoned actors get their own sheet documents, or
are they embedded state on the owner? That choice drives all three.

### 2c. Inventory

Both columns are untyped `jsonb` placeholders. `pipeline/inventoryBridge.ts` is the
existing seam.

| # | Item | Location |
| --- | --- | --- |
| 18 | `startingEquipment` parsing on backgrounds | [reference.ts:510](packages/database/src/schema/reference.ts:510) |
| 19 | `temporaryInventory` shape on the operational table | [operational.ts:102](packages/database/src/schema/operational.ts:102) |

Do 19 before 18 — the runtime shape should define the parse target, not the reverse.

### 2d. State-conditional calculations

Each needs the calculator to consult `activeStates` at a point where it currently
uses a constant. Depends on #7 (predicates) for the cleanest implementation.

| # | Item | Location |
| --- | --- | --- |
| 20 | Ability max cap of 20 — Barbarian capstone / Tomes must raise it | [abilities.ts:52](packages/engine/src/calculators/abilities.ts:52) |
| 21 | Governing-stat override for Hexblade / Shillelagh | [combat.ts:77](packages/engine/src/calculators/combat.ts:77) |
| 22 | Halfling Lucky "conditional measures" | [halflingDictionary.ts:36](packages/engine/src/rules/traits/halflingDictionary.ts:36) |

### 2e. Modifier-system expressiveness

Both TODOs are self-documenting: the modifier vocabulary cannot express the rule.
Neither is a small fix — they change what a `RuntimeModifier` can address.

| # | Item | Location | Missing concept |
| --- | --- | --- | --- |
| 23 | Fighting Style: Protection | [fightingStyleDictionary.ts:114](packages/engine/src/rules/traits/fightingStyleDictionary.ts:114) | Reactions targeting *another creature's* roll |
| 24 | Fighting Style: Two-Weapon Fighting | [fightingStyleDictionary.ts:128](packages/engine/src/rules/traits/fightingStyleDictionary.ts:128) | Which hand made the attack |

---

## P3 — UI wiring & polish

| # | Item | Location | Note |
| --- | --- | --- | --- |
| 26 | Projected CON modifier is read pre-ASI | [ReviewStep.tsx:43](apps/web/src/components/wizard/steps/ReviewStep.tsx:43) | Shows wrong HP delta when the level-up includes a CON increase |
| 27 | Level-up success routing (close, toast) | [LevelUpWizard.tsx:49](apps/web/src/components/wizard/LevelUpWizard.tsx:49) | |
| 28 | Surface level-up errors to the UI (currently `console.error`) | [LevelUpWizard.tsx:52](apps/web/src/components/wizard/LevelUpWizard.tsx:52) | Failures are invisible to the user |
| 29 | `ArmorClassWidget` is unstyled | [ArmorClassWidget.tsx:6](apps/web/src/components/sheet/ArmorClassWidget.tsx:6) | Rest of `apps/web` already uses Tailwind — the "maybe" is settled |

`#26` and `#28` are correctness bugs wearing polish clothing; `#27` and `#29`
are genuine polish.

---

## Recommended sequence

1. **P1 schema work (#5–#8)** — small, mechanical, removes hardcoded constants.
2. **P0 (#4 → #1 → #2 → #3)** — hydration, then the trigger/macro bus.
3. **2a dice pipeline (#10 → #13)** as a single vertical slice, then the rest of 2a.
4. **2c inventory (#19 → #18)** — independent of the above, parallelisable.
5. **2d conditionals (#20–#22)**, now cheap given #7.
6. **2b summons (#15–#17)** — needs the actor-model decision first.
7. **P3 remainder**, then **2e (#23, #24)** as a deliberate modifier-system redesign.


---

## Not from TODO comments: engine-API drift

`pnpm typecheck` (added 2026-08-02) currently reports **144 errors**. None are marked
with a TODO, so none appear in the tiers above, but they are the largest single
source of latent breakage in the repo — `useCombat` crashing on every equipped weapon
was one of them, found only because a test happened to cover it.

| Package | Errors |
| --- | --- |
| `@project/server` | 50 |
| `@project/engine` | 40 |
| `@project/web` | 37 |
| `@project/database` | 13 |
| `@project/shared` | 4 |

Dominant patterns: call sites still using pre-refactor engine signatures
(`RestEngine.applyRest`, `AbilityEngine.calculateScore` return shape, arity
mismatches in `useCharacterStats`), `TraitDefinition` consumers expecting
`modifiers` to be a flat array when it is `{ fixed, choices }`, and static
dictionary entries missing `requiredStates` / `forbiddenStates`.

Note the per-package `tsc --noEmit` also covers test files and `vitest.config.ts`
under each package's stricter options (`noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`), so its count is higher than what `apps/web`'s
`tsc -b` alone reports.

Separately, `@project/database` and `@project/server` have tests that pass or fail
between identical runs — flaky, likely DB-dependent. Worth isolating before the
suite is trusted as a gate.

---

## Resolved

Item numbers are stable ids — gaps below are intentional, not renumbered.

- **#25 — `classLevels` should come from the class ledger** (`useFeatures.ts`).
  The class ledger already existed and was already hydrated end to end
  (`hydrateCharacterSheet` → `initialize` → `state.classLevels`); the hook was the
  only consumer still carrying a `|| { class_fighter: totalLevel }` fallback. Removed,
  so it now reads the store directly like every other consumer.
