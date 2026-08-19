# Action Economy, Phase 2: The Attack Action

Date: 2026-08-19
Status: Complete
Owner: Claude pair session

## Goal

Model the Attack action as a first-class thing that grants an allowance of attacks, so `ATTACKS_PER_ACTION` finally has something to raise and a weapon swing stops costing a whole action.

## The Defect This Closes

`WeaponSynthesizer` minted one `ActionGrant` per weapon, each stamped `activation: "action"`. A character with a longsword and a shortbow therefore had two "actions", each claiming the whole action, and nothing anywhere represented the Attack action itself. Extra Attack computed a number that nothing consumed.

## Design Decisions

**Implicit declaration, visible state.** Nobody says "I take the Attack action" at a table; they say "I attack". The first swing of a turn takes the Attack action, opens the allowance, and spends one of it. What keeps this rigid rather than magic is that the panel then reads *"Attack action — 1 of 2 used"*: the declaration is inferred from the click, but never hidden.

**A classified activation vocabulary rather than a restructured type.** `"attack"` joins the enum, and `costsCombatEconomy` / `costsAttack` / `isFree` / `isDowntime` become the only sanctioned way to ask what an activation means. A test asserts every member is claimed by exactly one classifier, so a future member cannot fall through a switch unnoticed.

The full discriminated union was considered and rejected: it would rewrite 17 authored entries, every consumer and their tests, mid-migration, for a distinction the classifiers already express. `"special"` was deliberately not renamed to `"free"` — "Special" is legitimate D&D activation vocabulary, and renaming churns authored data for a debatable gain.

**Two-weapon fighting stays a bonus action.** An off-hand swing is genuinely its own bonus action, not one of the Attack action's attacks, and a test pins that it never touches the allowance.

**Attacks refund properly.** A swing that settles and then aborts on a resource cost gives the attack back — and if it was the swing that *took* the Attack action, it untakes it entirely rather than leaving a full allowance the player never earned. No authored rule triggers this today; it was built because "no rule needs it yet" is exactly what was true of `action_melee_attack` before Rage silently broke on it.

## A Zod Trap Found By A Failing Test

The design predicted that `beginTurn`'s object-literal economy reset would drop any new field. The real problem was one level deeper: `CombatEconomySchema.default({ ...literal })` inside `CombatContextSchema` **is not re-parsed**, so `attacksRemaining` was absent from every default-constructed context entirely — not defaulted to `null`, simply missing.

That made `spendAttack` read `undefined`, pass both guards, compute `undefined - 1`, and return `true`. A test caught it as "refuses an attack when no Attack action has been declared" returning `true`; a probe confirmed the schema, not the manager, was at fault.

Both were fixed by deriving the default from the schema — `CombatEconomySchema.default(CombatEconomySchema.parse({}))` — so a future field cannot go missing the same way.

## Changes

| File | Change |
| --- | --- |
| `packages/shared/src/schemas/actions.ts` | `"attack"` activation; `costsCombatEconomy`, `costsAttack`, `isFree`, `isDowntime` |
| `packages/shared/src/schemas/combatContext.ts` | `attacksRemaining`, `attackActionSourceId`; schema-derived economy default |
| `packages/engine/src/calculators/combatContext.ts` | `declareAttackAction`, `spendAttack`, `refundAttack`, `undoAttackAction`; schema-derived turn reset |
| `packages/engine/src/pipeline/actionResolver.ts` | `attacksPerAction` in context; `settleAttack` with implicit declaration; attack refunds; classifiers replace the private `spendsCombatEconomy` |
| `packages/engine/src/pipeline/weaponSynthesizer.ts` | Standard swings cost `"attack"` |
| `packages/engine/src/pipeline/characterEngine.ts` | `LiveCharacterSheet.attacksPerAction` |
| `apps/server/src/gateway/socket.ts` | Passes `attacksPerAction` into the resolver |
| `apps/web/src/components/sheet/CombatWidget.tsx` | Stateful attack-action line; prefix hack replaced by `costsAttack` |

## Tests Updated, Not Deleted

Two pre-existing tests asserted the economy's exact shape and legitimately grew a field: `combatContext.test.ts`'s turn-refresh assertion and the shared `CombatContextSchema` default test. Both now assert `attacksRemaining: null` explicitly, which is the point — a default-constructed context must carry every economy field.

`combatContext.test.ts` was also missing its `beforeEach` import; it ran because vitest globals are enabled, and only `tsc` caught it.

## The Prefix Hack

`!action.id.startsWith("action_weapon_")` is now `!costsAttack(action.activation)`. Worth stating plainly: `getCharacterActions` returns trait actions only, so **that filter was already a no-op** — this is a clarity change, not a bug fix.

## Test Outcomes

45 new tests, written test-first.

| Suite | Before | After |
| --- | --- | --- |
| `@project/shared` | 155 passed | **162** passed |
| `@project/engine` | 43 failed / 561 passed | 43 failed / **594** passed |
| `@project/database` | 89 passed | 89 passed |
| `@project/server` | 1 failed / 217 passed | 1 failed / 217 passed |
| `@project/web` | 3 failed / 219 passed | 3 failed / **223** passed |

Typecheck passes across all five packages, hygiene passes, lint is clean.

## Known Untested Surface

The socket gateway remains wire code with no coverage, and this change added two lines to it (`attacksPerAction` computed and passed through). The behaviour it enables is fully covered at the resolver level; what is unverified is the wiring.

## Pre-Existing Failures

The 47 known-red tests from the unfinished race-to-pack migration, unchanged.

## What Is Still Missing

- **Phase 3 — the standard action vocabulary.** Dash, Dodge, Disengage, Help, Hide, Ready, Search, Use an Object as an `ACTION_MAP` in shared, matching `SKILL_MAP` and `CONDITION_MAP`. Until then, the only way to spend your action is to attack or to use an authored trait action; there is no way to record "I dodged".
- **No Attack action button.** Declaration is implicit only. A character who wants to take the Attack action without swinging (to trigger something else) has no way to say so.
- **Off-hand attacks do not check the main-hand requirement.** Two-weapon fighting requires you to have taken the Attack action with a light weapon; nothing enforces or surfaces that.
