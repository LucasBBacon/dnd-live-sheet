# Barbarian Traits, and Rules the Engine Can Only Report

Date: 2026-09-02
Status: approved, ready to plan
Owner: Claude pair session

## Goal

Close the barbarian's 21 rule-free traits, which is the first cut of backlog
#30 (462 reachable stubs) and the class the backlog names as the worked
example to copy from. Where a trait needs vocabulary the engine lacks, add the
vocabulary as a general mechanic rather than a trait-specific branch, so the
eleven classes behind it inherit the work.

Branch: `feat/barbarian-traits`, off `main`. Every slice lands green.

## The 21 stubs

| Trait | Level | Mode after this pass | Slice |
| --- | --- | --- | --- |
| `trait_primal_path` | 3 | deleted | 3 |
| `trait_primal_path_feature` | 6, 10, 14 | deleted | 3 |
| `trait_relentless_rage` | 11 | engine | 8 |
| `trait_persistent_rage` | 15 | manual_sheet_helper | 1 |
| `trait_indomitable_might` | 18 | engine | 6 |
| `trait_primal_champion` | 20 | engine | 3 |
| `trait_berserker_frenzy` | 3 | engine | 4 |
| `trait_berserker_mindless_rage` | 6 | engine | 5 |
| `trait_berserker_intimidating_presence` | 10 | engine | 7 |
| `trait_berserker_retaliation` | 14 | engine | 4 |
| `trait_spirit_seeker` | 3 | manual_sheet_helper | 1 |
| `trait_totem_spirit_bear` | 3 | engine | 1 |
| `trait_totem_spirit_eagle` | 3 | engine | 3 |
| `trait_totem_spirit_wolf` | 3 | manual_sheet_helper | 1 |
| `trait_aspect_of_the_beast_bear` | 6 | engine | 3 |
| `trait_aspect_of_the_beast_eagle` | 6 | manual_sheet_helper | 1 |
| `trait_aspect_of_the_beast_wolf` | 6 | manual_sheet_helper | 1 |
| `trait_spirit_walker` | 10 | manual_sheet_helper | 1 |
| `trait_totemic_attunement_bear` | 14 | manual_sheet_helper | 1 |
| `trait_totemic_attunement_eagle` | 14 | manual_sheet_helper | 1 |
| `trait_totemic_attunement_wolf` | 14 | manual_sheet_helper | 1 |

## Findings that shaped the design

Four things were true of the working tree on 2026-09-02, and each one would
have made a naively authored trait look finished while doing nothing.

1. **Affinities are inert.** `trait_rage` authors resistance to bludgeoning,
   piercing and slashing while raging, and nothing in engine, server or web
   reads the `affinities` block. Bear totem's resistance would be equally
   invisible.
2. **Helpers are invisible.** The sheet never shows a trait's
   `implementation.summary`, a `manual_sheet_helper`, or a granted state,
   with one hand-coded exception: the Reckless Attack exposure line in the
   AC widget. "Author it as a helper" currently means "author it invisibly".
3. **Trait-granted resources have no rule at runtime.** `toRuleSnapshot`
   carries no resources, and both the server cache and the engine's pack
   lookup build `resourcesById` from `pack.resources` alone, which holds only
   Action Surge and Second Wind. So `resource_barbarian_rage` resolves to no
   rule: `RestEngine.applyRest` leaves it untouched and the Class Features
   panel hides it.
4. **Only the sample seeder writes resource rows.** `character_resources` is
   the durable record, and nothing on the creation or level-up path inserts
   into it. A character that is not one of the ten fixtures has no Rage row,
   so `action_rage` fails `insufficient_resource`.

Findings 3 and 4 are prerequisites for Relentless Rage's counter, and fixing
them fixes Rage itself.

## Decisions taken

1. **A trait is done when its rule reaches the player.** For rules the engine
   cannot enforce, that means a generic "Rules at the table" surface, built
   before the authoring so every helper for every class has a home. Rejected:
   marking helpers now and surfacing them later, which leaves them invisible
   in play; and a hand-coded consumer per state, which has no home for
   roleplay and permission traits.
2. **Relentless Rage executes its parked spec in full.** The 2026-08-20 spec
   was parked on the pack load path, which has since landed. Its settled
   decisions stand, with one adjustment recorded in Section 3.
3. **Persistent Rage is reported, not enforced, and so is Rage's ending.**
   Rage today is a manual-duration effect with no ending rule. Modelling the
   one-minute limit and the early ending would need turn flags the server
   does not record and a conditional trigger the schema does not have.
   Following the Feral Instinct precedent, both rules become riders the
   panel shows, and Persistent Rage suppresses Rage's rider. Rejected:
   modelling the ending in the engine; modelling only the one-minute limit,
   which leaves Persistent Rage with nothing to lift.
4. **Indomitable Might gets a real floor.** A new `minimum_total` dice rule,
   applied after the modifier and scoped to Strength checks, and the sheet's
   check-roll hook starts honouring dice rules, which it never did. Rejected:
   reporting the floor as text.
5. **Mindless Rage gets condition suppression as a contract.** A new
   `conditionSuppressions` trait block, applied where conditions are composed
   into states, so a rule gated on `frightened` stops firing on a raging
   berserker. Rejected: a rider only, which leaves the flags feeding states.
6. **One spec, vertical slices.** This document settles the shared decisions;
   the plan lands each engine piece with its traits and tests, cheap to
   expensive, so traits close continuously. Rejected: foundation first, then
   a single authoring pass; and one spec per trait, which decides the panel
   in isolation.

## Architecture

### 1. Table notes, and the "Rules at the table" panel

A new optional block on `TraitDefinitionSchema`:

```json
"tableNotes": [
  {
    "text": "While raging, your allies have advantage on melee attack rolls against any creature within 5 feet of you that is hostile to you.",
    "requiredStates": ["status_raging"],
    "forbiddenStates": []
  }
]
```

`TableNoteSchema` is `{ text: string (1..240), ...StatePredicateSchema.shape }`.
It is player-facing rule text, distinct from `implementation.summary`, which
stays the maintainer's explanation of how the rule is delivered, and from an
action's `tableNote`, which belongs to one action's execution.

**`TableRulesEngine.describe`** in `packages/engine/src/calculators/tableRules.ts`,
a pure reporter beside `SurpriseEngine`. Input: the character's compiled
traits, active states, and the affinity and suppression reports below.
Output: `TableRuleLine[]`, each `{ kind, source, text }` with `kind` one of
`note`, `affinity`, `suppression`, `reporter`. A note is emitted when its
predicate holds against the active states.

**`AffinityEngine.describe`** in `calculators/affinities.ts`: takes the compiled
traits' `affinities.fixed` and the active states, returns the active grants
grouped by level and source. A source that grants the same level for every
damage type but one collapses to "all damage except psychic". `bypassedBy` is
carried through as text. Choice affinities are out of scope until a trait
authors one.

**`TableRulesWidget`** in `apps/web/src/components/sheet/`, placed in
`DashboardLayout` beside `ConditionsWidget` and `ActiveEffectsWidget`. It
renders the lines grouped by kind, and for Relentless Rage it also renders the
button described in Section 3. It reads the store's compiled traits and
`activeStates`; it computes nothing itself.

Two invariants, as pack tests:

- Every trait with `implementation.mode: "manual_sheet_helper"` carries at
  least one table note. A marker with no note is the invisibility this
  section exists to end.
- Every table note predicate that names a `status_` state names one that
  something emits: a trait's `grantedStates`, an `apply_effect`'s `states`,
  or the engine's own base-state vocabulary (`status_wearing_armor`,
  `status_wearing_heavy_armor`, `status_wearing_light_armor`,
  `status_wielding_two_handed`, `status_wielding_one_handed_only`,
  `status_item_requirement_unmet`). Condition ids gate through `CONDITION_MAP`
  and are checked the same way.

### 2. Resources reach the snapshot, and every character gets a pool row

- `toRuleSnapshot` gains `resourcesById`: the union of `pack.resources` and
  every trait's `resources`, keyed by id. `validateCoreRulePack` already
  builds this union to check `consumeResource`, so the projection reads the
  same set. `ruleSnapshotCache` on the server and `corePackLookup` in the
  engine drop their hand-rolled maps and read this one, which closes part of
  backlog #37.
- `getAuthoritativeRuntimeContext` on the server materialises any pool that
  the character's compiled traits grant but `character_resources` lacks:
  charges pools at their resolved maximum, uses pools at zero. Idempotent by
  construction, so a newly authored resource appears for an existing
  character on next touch. The web store does the same when it hydrates a
  character, so the sheet and the server agree before the first action.
- Consequences that fall out: `applyRest` finds Rage's rule and resets it on
  a long rest; `useFeatures` shows Rage beside Second Wind; a non-fixture
  barbarian can rage.

Persistence is unchanged: `character_resources` stays the durable record and
the existing charges-before diff writes spends back.

### 3. Uses-mode resources, `self_save`, and Relentless Rage

**Resource schema.** `ResourceSchema` becomes a union:

- `ChargesResourceSchema`: today's shape, `.strict()`, plus
  `mode: z.literal("charges").optional()`. Absent means charges, so no
  existing literal changes and the field stays optional on the inferred type.
- `UsesResourceSchema`: `{ id, name, resetCondition, mode: "uses" }`,
  `.strict()`, with no `maxRule`. RAW puts no cap on Relentless Rage and the
  parked spec rejected inventing one.

The three behaviours that invert, everywhere a resource is read:

| | charges | uses |
| --- | --- | --- |
| initial value | max | 0 |
| on the matching rest | set to max | set to 0 |
| on consume | decrement, refuse below 0 | increment, never refuse |

`getResourceMaxUses` returns 0 for a uses resource. `ResourceManager.consume`
increments a uses pool. `restedCharges` and `tickRest` reset a uses pool to 0
on its reset condition. The database row needs no new column: `max` holds 0
and `current` counts up. `useFeatures` reports a uses pool as
`{ kind: "uses", used }` and `FeaturesWidget` prints "Used 2 since rest" with
no Use button, because the save is what spends it.

**The effect.** A new member of `CoreEffectUnion`:

```json
{
  "type": "self_save",
  "ability": "CON",
  "dcRule": {
    "kind": "escalating_per_use",
    "base": 10,
    "increasePerUse": 5,
    "resourceId": "resource_relentless_rage"
  },
  "onSuccess": { "type": "heal", "dice": "1" },
  "requiredStates": ["status_raging"],
  "forbiddenStates": []
}
```

`dcRule` is a discriminated union: `{ kind: "fixed", value }` or
`{ kind: "escalating_per_use", base, increasePerUse, resourceId }`.
`onSuccess` and `onFailure` are optional `CoreEffectUnion` members. The
validator checks that `resourceId` names a known resource and that it is a
uses resource.

The resolver: reads the DC from the rule and the resource's current count,
rolls `1d20` through `resolveTargetRoll` with target `SAVING_THROW` so dice
rules apply, adds the character's save modifier for the named ability, then
increments the counter through `resourceManager.consume` whether or not the
save passed. The increment lives in the effect rather than in
`consumesResource` because costs settle before effects run and the DC must
read the count before this use. On success the nested effect runs; the
server's existing heal path writes the HP and broadcasts `HP_MODIFIED`. The
roll result carries `label: "Relentless Rage"` and a `summary` naming the DC
and the outcome.

**A new resolver input.** `ActionExecutionContext` gains
`saveModifiers?: Record<Ability, number>` and `proficiencyBonus?: number`.
The server's `resolveCharacterAction` already builds a live sheet, so it
passes `liveSheet.saves` and `liveSheet.proficiencyBonus`; the web store does
the same from its own live sheet. Absent, a `self_save` rolls with a +0
modifier and says so in its summary, which is the honest fallback rather than
a refusal.

**The reporter.** `RelentlessRageEngine.describe` in
`calculators/relentlessRage.ts`, modelled on `SurpriseEngine`. Input:
`{ currentHp, activeStates, usesSinceRest, dcRule }`. Output:
`{ available, dc, summary }`. Available only at 0 HP with `status_raging`.
The panel shows the summary line whenever the trait is granted, and shows a
"Make the save" button only while available. The button fires
`action_relentless_rage` like any other action. Availability is reported, not
enforced: the server does not see HP as a state, and the track policy says
not to block, so the resolver runs the effect at any HP if asked.

**Deliberately not modelled**, as in the parked spec: instant death from
massive damage, and rage ending on unconsciousness. A failed save leaves the
character at 0 HP and still raging, and the panel keeps offering the
now-harder save.

### 4. Condition suppression, and a floor on a check's total

**Condition suppression.** A new optional block on `TraitDefinitionSchema`:

```json
"conditionSuppressions": [
  { "condition": "charmed", "requiredStates": ["status_raging"], "forbiddenStates": [] },
  { "condition": "frightened", "requiredStates": ["status_raging"], "forbiddenStates": [] }
]
```

`ConditionSuppressionSchema` is `{ condition: string, ...StatePredicateSchema.shape }`.
The pack validator rejects a `condition` that is not a `CONDITION_MAP` key.

`suppressConditions(conditions, suppressions, gatingStates)` in
`calculators/conditionSuppression.ts` is pure: it returns
`{ active: string[], suspended: Array<{ condition, source }> }`. A condition
is suspended when any suppression for it has a predicate that holds against
the gating states, where the gating states are everything except the
conditions themselves, so a suppression can never gate on the condition it
suppresses.

It runs where conditions are composed into states. Today that is the web
store's `composeActiveStates`; `CharacterEngine.buildLiveSheet` does not
receive conditions and does not change. The store keeps the toggled list
intact, so the condition returns when the rage ends, and exposes the
suspended set. `ConditionsWidget` renders a suspended condition struck
through with its suppressor named, and the panel adds a `suppression` line.

**The minimum-total dice rule.** `RNGMutatorTypeSchema` gains
`minimum_total`, and `RNGMutatorSchema` gains
`floorSource: z.enum(["fixed", "ability_score"]).optional()`. `DiceRuleSchema`
gains `requiredAbility: AbilitySchema.optional()`.

```json
{
  "target": "ABILITY_CHECK",
  "requiredAbility": "STR",
  "requiredStates": [],
  "mutator": { "type": "minimum_total", "floorSource": "ability_score" }
}
```

Unlike the three existing mutators, which reshape the dice before summing,
`minimum_total` applies to the total after the modifier: the total becomes
the greater of itself and the floor. `floorSource: "fixed"` reads
`floorValue`; `ability_score` reads the score of `requiredAbility` from the
context. `DiceRuleContext` gains `ability?: Ability` (the roll's governing
ability) and `abilityScores?: Record<Ability, number>`. A rule with
`requiredAbility` matches only when the context's ability equals it.
`applyDiceRulesToRollResult` reports `flooredBy?: string` so a breakdown can
name the floor when it lifted the total.

Two consumers change:

- `useCheckRoll` on the web gathers the active traits' dice rules and the
  check's ability, and runs the player's die through
  `DiceEngine.applyDiceRulesToRollResult` before recording. `SkillsWidget`
  and `SavingThrowsWidget` pass the ability. This is also what makes Halfling
  Lucky fire from the Skills widget, which it never has.
- The resolver's `ability_check` effect passes the ability when it knows it,
  which today is never, because `AbilityCheckEffectSchema` carries no skill
  (backlog A2b). The plumbing is in place for when it does.

### 5. Dynamic weapon attacks, for Frenzy and Retaliation

`DynamicWeaponAttackSchema` already exists with `requiredWeaponProperties`
and `requiredWeaponCategory`, and nothing consumes it. It gains
`...StatePredicateSchema.shape`.

`CharacterEngine.buildLiveSheet`'s weapon loop is the consumer. For each trait
action whose effect is `dynamic_weapon_attack` and whose predicate holds
against the active states, and for each equipped weapon that passes the
filters, it synthesises a concrete `attack` action through
`WeaponSynthesizer` with:

- id `${action.id}:${instance.id}`, name `${action.name}: ${weapon.name}`;
- the trait action's `activation` and `tableNote`;
- the weapon's resolved attack bonus, damage bonus and critical pool from the
  same `calculateWeaponAttack` call the standard swing uses;
- the melee swing only, for a thrown weapon.

Melee-only rules author `requiredWeaponCategory: ["simple_melee", "martial_melee"]`.
The server's action path resolves these ids the way it resolves synthesised
weapon attacks today, because they arrive through the same `actions` list.

**Frenzy** is a second way into rage rather than a toggle on top of it:

- `action_frenzied_rage`: `bonus_action`, `consumesResource:
  "resource_barbarian_rage"`, one `apply_effect` tagged `rage` with
  `states: ["status_raging", "status_frenzied"]`, `durationType: "manual"`.
  The existing `action_end_rage` removes the `rage` tag and so clears both.
  Its `tableNote`: "When your rage ends, you suffer one level of exhaustion."
- `action_frenzied_strike`: `bonus_action`, `dynamic_weapon_attack` over
  melee weapons, `requiredStates: ["status_frenzied"]`.
- A table note gated on `status_frenzied` repeats the exhaustion cost.

**Retaliation** is `action_retaliation`: `reaction`, `dynamic_weapon_attack`
over melee weapons, `tableNote`: "When you take damage from a creature within
5 feet of you." Reactions to external events are Tier 4 work; the player
presses the card when the trigger happens and the economy tracks the
reaction as it does every other.

Exhaustion stays unmodelled, as `CONDITION_MAP` deliberately records.

### 6. The remaining authoring

- **Primal Champion** (engine). `grantedStates: ["barbarian_capstone"]` plus
  `add` +4 to `STR` and +4 to `CON`. `getStateDrivenAbilityCap` becomes
  per-ability: `barbarian_capstone` lifts the cap to 24 for `STR` and `CON`
  only, matching RAW; `tome`, `ability_cap_24` and `ability_cap_30` keep
  their global meaning.
- **Primal Path and Primal Path Feature** (deleted). Both grants leave the
  barbarian progression and both traits leave `traits/unimplemented.json`.
  `subclassUnlockLevel: 3` carries the choice and the subclass progression
  grants the real features. The other eleven classes carry 36 more of these
  signposts; the backlog records the precedent for their passes.
- **Totem Spirit: Eagle** (engine). `action_eagle_dash`, a `bonus_action`
  whose `apply_effect` mirrors the standard Dash (`SPEED` multiplier 2,
  `status_dashing`, `turn_end`) with `requiredStates: ["status_raging"]` and
  `forbiddenStates: ["status_wearing_heavy_armor"]`. The opportunity-attack
  half is a table note with the same predicate.
- **Totem Spirit: Bear** (engine). Twelve `resistance` affinities, every
  damage type but `psychic`, each `requiredStates: ["status_raging"]`. The
  affinity reporter collapses them to one line.
- **Aspect of the Beast: Bear** (engine). `grantedStates:
  ["carrying_capacity_doubled"]`. `EncumbranceEngine` reads it as a second
  multiplier beside size and Powerful Build, so a small bear-aspect barbarian
  doubles rather than moving one size up. The advantage on Strength checks to
  push, pull, lift or break is a table note.
- **Intimidating Presence** (engine). An `action` whose `save` effect names
  `WIS_SAVE` against `base 8`, `scalingStat: "CHA"`, proficiency included,
  `negates_effect`. With the Section 3 input, the `save` effect reports its
  computed DC as a note ("Wisdom saving throw, DC 15") and stops rolling a
  bare d20 for the character; where a `save` effect carries damage, as the
  dragonborn breath weapons do, it rolls that damage and reports the DC.
  The `tableNote` carries the range, the extension by action on later turns,
  and the 24-hour immunity after a success or an escape.
- **Persistent Rage** (helper). `grantedStates: ["status_persistent_rage"]`
  and a table note: "Your rage ends early only if you fall unconscious or if
  you choose to end it." `trait_rage` gains a table note gated on
  `status_raging` with `forbiddenStates: ["status_persistent_rage"]`: "Your
  rage lasts 1 minute. It ends early if you are knocked unconscious or if
  your turn ends and you have not attacked a hostile creature or taken damage
  since your last turn."
- **Wolf totem spirit, Aspects of Eagle and Wolf, Spirit Seeker, Spirit
  Walker, the three Totemic Attunements** (helpers). Each carries table notes
  gated on `status_raging` where RAW says "while raging", ungated otherwise.
  Wolf attunement is also `action_wolf_attunement_trip`: `bonus_action`,
  `no_effect`, `tableNote` naming the Large-or-smaller and melee-hit
  conditions. The two ritual traits name their spells in text; a ritual usage
  kind on `SpellUsageSchema` belongs to the spells pass, #31.

Every trait gets real `lore.shortDescription` and `lore.fullText`, a precise
`implementation.summary` in the style of the existing barbarian traits, and
`blockedBy` where a state withholds it.

## Data changes

Shared schemas:

- `content/traits.ts`: `TableNoteSchema`, `ConditionSuppressionSchema`,
  optional `tableNotes` and `conditionSuppressions` on `TraitDefinitionSchema`.
- `content/resources.ts`: `ChargesResourceSchema`, `UsesResourceSchema`,
  `ResourceSchema` as their union; `Resource` type follows.
- `content/actions.ts`: `SelfSaveEffectSchema` and `SaveDcRuleSchema` in
  `CoreEffectUnion`; `DynamicWeaponAttackSchema` gains the state predicate.
- `content/dice.ts`: `minimum_total`, `floorSource`, `requiredAbility`.
- `content/validatePack.ts`: condition ids checked against `CONDITION_MAP`;
  `self_save.dcRule.resourceId` checked against the resource union and its
  mode; table-note and suppression predicates checked against the emitted
  state set described in Section 1.
- `runtime/ruleSnapshot.ts`: `resourcesById` on the snapshot and in
  `toRuleSnapshot`.

Generated JSON schemas regenerated with `schemas:generate`. No database
migration: `character_resources` already has the columns a uses pool needs.

Pack:

- `classes/barbarian.json`: the four remaining class traits (Relentless
  Rage, Persistent Rage, Indomitable Might, Primal Champion) authored in
  place, Rage's new note, `trait_primal_path` deleted, and progression rows
  3, 6, 10 and 14 losing their signpost grants.
- `traits/unimplemented.json`: the four Berserker traits, Spirit Seeker and
  Spirit Walker move out as authored traits into `classes/barbarian.json`
  beside the class; `trait_primal_path_feature` is deleted.
- `traits/ported.json`: the nine Totem traits are authored in place.

That accounts for all 21: five in the class file, seven in
`unimplemented.json`, nine in `ported.json`.

## Engine changes

- `calculators/tableRules.ts`, `calculators/affinities.ts`,
  `calculators/conditionSuppression.ts`, `calculators/relentlessRage.ts`: new.
- `calculators/abilities.ts`: per-ability cap lookup.
- `calculators/encumbrance.ts`: `carrying_capacity_doubled`.
- `calculators/resources.ts`, `calculators/rests.ts`, `utils/resourceRules.ts`:
  uses mode.
- `utils/diceParser.ts`: `minimum_total`, ability context, `flooredBy`.
- `pipeline/actionResolver.ts`: `self_save`; `save` reports its DC and rolls
  its damage; `saveModifiers` and `proficiencyBonus` on the context.
- `pipeline/characterEngine.ts`: dynamic weapon attack synthesis in the
  weapon loop.
- `rules/packLookup.ts`, `rules/ruleLookup.ts`: read `resourcesById` from
  the shared projection.

## Server changes

- `gateway/socket.ts`: pool materialisation in `getAuthoritativeRuntimeContext`;
  `saveModifiers` and `proficiencyBonus` passed from the live sheet; the
  self-save success HP write through the existing heal path.
- `services/ruleSnapshotCache.ts`: reads the shared `resourcesById`.

## Web changes

- `components/sheet/TableRulesWidget.tsx`: new, with the Relentless Rage
  button.
- `components/sheet/ConditionsWidget.tsx`: suspended rendering.
- `components/sheet/FeaturesWidget.tsx` and `hooks/useFeatures.ts`: uses mode.
- `hooks/useCheckRoll.ts`, `SkillsWidget.tsx`, `SavingThrowsWidget.tsx`: dice
  rules on sheet checks.
- `store/characterSheetStore.ts`: suppression in `composeActiveStates`, pool
  materialisation on hydrate, `saveModifiers` in the dispatch context, a
  selector for compiled traits and dice rules.

## Slice order

Cheap to expensive, each landing its engine piece, its traits and its tests
together, so the branch is green after every slice:

1. Table notes, the two reporters and the widget. Closes Wolf totem, Aspects
   of Eagle and Wolf, Spirit Seeker, Spirit Walker, the three attunements,
   Persistent Rage and Bear totem, and gives Rage's resistances a home.
2. Resources into the snapshot and pool rows materialised on touch. Fixes
   Rage's reset and display for every character.
3. Pure authoring with existing vocabulary: Primal Champion with the
   per-ability cap, Eagle totem, Aspect of Bear with the capacity state, and
   the signpost deletions.
4. Dynamic weapon attacks: Frenzy and Retaliation.
5. Condition suppression: Mindless Rage.
6. The minimum-total dice rule and dice rules on sheet checks: Indomitable
   Might.
7. Save modifiers into the resolver, the `save` DC fix, Intimidating
   Presence.
8. Uses-mode resources, `self_save`, the reporter and the button: Relentless
   Rage.

## Testing

At the narrowest useful level, per the authoring guide:

- **Schema**: acceptance and rejection for each new block and union member;
  a charges literal without `mode` still parses; a uses resource with a
  `maxRule` is rejected.
- **Engine**: each reporter with the applying and the blocked state;
  `suppressConditions` cannot gate on its own condition; `minimum_total`
  lifts a low total, leaves a high one, and ignores a non-matching ability;
  the synthesiser emits one card per matching weapon and none when the
  predicate fails; `consume` on a uses pool increments and never refuses;
  `restedCharges` zeroes a uses pool; the per-ability cap lifts STR and CON
  and not DEX.
- **Resolver**: `self_save` DC from count, increment on both outcomes,
  `onSuccess` only on success, +0 fallback when no modifiers are supplied;
  `save` reports the DC and rolls damage without a d20.
- **Pack**: a `describe` per trait in `barbarianPack.test.ts` following the
  existing pattern; the two Section 1 invariants; the signposts absent from
  the progression; `implementationMarkers.test.ts` counting zero barbarian
  stubs; `traitReachability.test.ts` still green after the deletions.
- **Server**: pools materialised for a character with no rows and untouched
  for one with rows; the self-save write reaches `characters.currentHp`.
- **Web**: the widget renders notes, affinities and suppressions; the
  Relentless Rage button appears only at 0 HP while raging; `FeaturesWidget`
  shows a uses pool without a Use button; `ConditionsWidget` strikes a
  suspended condition; `useCheckRoll` applies a floor and a reroll.

Both the applying and the blocked condition for every gated rule.

## Verification

Before the branch is called done:

- `pnpm test:all`, and the five per-package typechecks (`tsc -b` for web;
  `tsc --noEmit` for database, never `tsc -b` there).
- `pnpm check:hygiene`, with line endings preserved per file: spec and plan
  files are LF, `TODO_BACKLOG.md` is CRLF, pack JSON is checked before edit.
- `pnpm --filter @project/database schemas:generate` with no diff left
  behind, and `db:import-pack` against a live database.
- The implementation-marker test showing the barbarian at zero stubs, and
  the burndown numbers refreshed in `TODO_BACKLOG.md`.

## Known limitations

- The server's action path composes states from the effect manager alone,
  so a predicate on a condition or a base state does not gate on the server.
  Every predicate in this pass gates on effect-granted states
  (`status_raging`, `status_frenzied`) or on nothing, which is why the
  Relentless Rage HP gate is reported rather than authored.
- `save` DC reporting assumes the target rolls; the sheet still has no
  target model, so "negates" and "half damage" remain the table's business.
- A uses pool with `resetCondition: "short_rest"` resets on both rests, as
  charges do. Relentless Rage wants exactly that.

## Out of scope

Recorded in the backlog rather than lost: the 36 subclass-feature signposts
in the other eleven classes; a ritual usage kind for spell grants (#31);
Rage's automatic ending; exhaustion; conditions reaching the server's action
path; reactions to external events (A1, A5); a sample Totem Warrior fixture.
