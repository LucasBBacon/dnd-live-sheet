# Barbarian Sheet Surfaces

Date: 2026-09-19
Status: approved, ready to plan
Owner: Claude pair session

## Goal

Make the six barbarian traits authored in `46f2136` reach the player on the
sheet, fix the three defects that commit carries, and close the barbarian
burndown in the docs. After this, a barbarian's every trait is either applied
by a calculator or shown to the player, and the backlog says so.

Branch: `feat/barbarian-traits`, on top of `46f2136`. This builds on
`docs/superpowers/specs/2026-09-02-barbarian-traits-design.md`, whose
decisions stand except where this document says otherwise.

## Where this starts

`46f2136` is Lucas's manual pass over Slices 4 to 8 of the 2026-09-02 design,
committed unmodified as a checkpoint. It added dynamic weapon attacks,
condition suppression, the `minimum_total` dice rule, the `save` DC and
`self_save`, uses-mode resources and server `saveModifiers`, and authored
Frenzy, Retaliation, Mindless Rage, Indomitable Might, Intimidating Presence
and Relentless Rage in engine mode.

At that commit: 1,869 tests green across the five packages, hygiene green,
zero reachable barbarian stubs, 441 of 585 traits rule-free.

## Findings that shaped the design

1. **The sheet never resolves an action.** `executeCharacterAction` emits
   `ACTION_INTENT` and the server resolves it. The server already passes
   `saveModifiers` and `proficiencyBonus` from its live sheet
   (`apps/server/src/gateway/socket.ts:715-727`). The 2026-09-02 spec's "the
   web store does the same" has no web dispatch context to go into, so it is
   dropped.
2. **The sheet never builds a live sheet.** `useCombat` derives its attack
   cards from inventory and `CombatEngine.calculateWeaponAttack` on its own.
   The server's synthesised `template:instance` swings exist only in the
   server's `liveSheet.actions`, so the sheet has no Frenzied Strike or
   Retaliation card.
3. **The bare dynamic templates are live and do nothing.**
   `CharacterEngine.buildLiveSheet` gathers every trait action before it
   synthesises (`characterEngine.ts:453-456`), and the store's
   `getCharacterActions` does the same, so `action_frenzied_strike` and
   `action_retaliation` appear as plain buttons in the Character actions
   panel. Pressing one spends a bonus action or a reaction and reaches the
   resolver's `default` case (`actionResolver.ts:675-676`): nothing happens.
4. **Suppression is computed and thrown away.** `composeActiveStates`
   (`characterSheetStore.ts:296-311`) folds `suppressConditions(...).active`
   into the states and discards `.suspended`. No widget can say a condition
   is suspended, or by what.
5. **Uses pools are invisible.** `getResourceMaxUses` returns 0 for every
   uses pool and `useFeatures` drops any pool whose maximum is at most 0
   (`useFeatures.ts:33`), so Relentless Rage's counter never renders.
6. **Relentless Rage resets on the wrong rest.** `resource_relentless_rage`
   is authored `long_rest`. RAW resets the DC to 10 after a short *or* long
   rest, and in this engine a `short_rest` pool resets on either rest
   (`ResourceManager.tickRest`, `restedCharges`). As authored, a short rest
   leaves the DC escalated.
7. **"Unimplemented" holds implemented traits.** The four Berserker traits
   stayed in `traits/unimplemented.json` in engine mode, where the 2026-09-02
   spec put them in `classes/barbarian.json`.
8. **The server side of Relentless Rage is sound.** Persisted pools carry
   their `mode` from the snapshot (`socket.ts:320`), a successful self-save
   writes HP through its `Healing` result and broadcasts `HP_MODIFIED`
   (`socket.ts:954-967`), and the store adopts the resolution's `resources`
   (`syncRemoteActionExecution`). A button only has to fire the action.

## Decisions taken

1. **Shared pure helpers.** Dynamic-attack eligibility and the self-save DC
   move out of `46f2136`'s inline code into exported engine helpers; the
   engine and the sheet call the same ones, so they cannot disagree about
   which swings exist, what they are called, or what the DC is. Rejected:
   the sheet building a live sheet, which rewrites the web's data flow; and
   web-only copies, which duplicate the eligibility rules, the DC arithmetic
   and the id format.
2. **The three defects are fixed here** (findings 3, 6 and 7), approved as
   corrections to the checkpoint.
3. **Derived store methods, not stored fields.** `getSuspendedConditions`
   follows `getActiveTraits`: computed from state the store already keeps,
   so none of the four `composeActiveStates` call sites change.
4. **One home per action.** A dynamic template lives on the attack cards and
   a `self_save` action on the Rules panel; `getCharacterActions` drops both
   kinds, so neither also sits in the generic list as a button that can be
   pressed out of context.
5. **Relentless Rage availability is reported, not enforced**, as the
   2026-09-02 spec settled. The server resolves the action at any HP.

## Architecture

### 1. Frenzied Strike and Retaliation on the attack cards

New file `packages/engine/src/pipeline/dynamicWeaponAttacks.ts`:

```ts
/** Whether this template offers a swing with this weapon, right now. */
export const dynamicAttackApplies = (
  effect: DynamicWeaponAttack,
  weapon: WeaponView,
  activeStates: string[],
): boolean;

/** The one place the `${template}:${inventoryId}` id format lives. */
export const dynamicAttackId = (templateId: string, instanceId: string): string;
```

`dynamicAttackApplies` carries `46f2136`'s checks from
`characterEngine.ts:559-584` without change in behaviour: the state predicate,
the ranged exclusion, `requiredWeaponProperties`, and `requiredWeaponCategory`
when non-empty. `DynamicWeaponAttack` is a new type-only export beside
`DynamicWeaponAttackSchema` in `packages/shared/src/schemas/content/actions.ts`.
The helpers are exported from the engine index.

`CharacterEngine.buildLiveSheet`:

- the trait-action gather excludes `dynamic_weapon_attack` templates;
- the synthesis loop calls `dynamicAttackApplies` and `dynamicAttackId`
  instead of its inline checks and template literal.

The sheet:

- `useCombat` reads the compiled traits through the store's `getActiveTraits`.
  For each held-weapon card it already builds, it appends one card per active
  template that applies to that weapon: the weapon card's own numbers, name
  `${template.name}: ${weapon.name}`, the template's `activation`, and
  `actionId: dynamicAttackId(template.id, item.id)`. An off-hand weapon's card
  already reflects off-hand rules, matching the context the engine uses for
  it.
- The store's `getCharacterActions` drops `dynamic_weapon_attack` templates.
- `CombatWidget`'s activation badge maps `reaction` to "REACTION" beside the
  existing "BONUS" and "ACTION".

### 2. Mindless Rage on the Conditions widget and the panel

The store gains `getSuspendedConditions: () => SuspendedCondition[]`,
following `getActiveTraits`. It runs `suppressConditions` over
`activeConditions`, with the suppressions from `getConditionSuppressions`
and the gating states `composeActiveStates` uses: the store's `baseStates`
plus `runtimeEffects`' active states. The result is exactly the `.suspended`
that `composeActiveStates` discards today.

`TableRulesEngine`:

- `TableRuleLineKind` gains `"suppression"`;
- `TableRulesInput` gains `suspendedConditions?: SuspendedCondition[]`;
- each suspended condition yields
  `{ kind: "suppression", source, text: "Frightened is suspended." }`, the
  name taken from `CONDITION_MAP` and the id used when a condition has none;
- lines are listed notes, then affinities, then suppressions.

`ConditionsWidget` renders a toggled but suspended condition struck through,
with the title "Suspended by Mindless Rage" (the source's name). It stays
clickable, so the toggle can still be cleared, and the condition returns
when the gate stops holding. `TableRulesWidget` passes the suspended list to
the engine and labels those lines "Suspended".

The server is unchanged: conditions never reach the server's action path,
which the 2026-09-02 spec already records.

### 3. Relentless Rage on the Rules panel

New file `packages/engine/src/calculators/saveDc.ts`:

```ts
export const resolveSelfSaveDc = (rule: SaveDcRule, usesSoFar: number): number;
```

A `fixed` rule returns its `value`; an `escalating_per_use` rule returns
`base + increasePerUse * usesSoFar`. This is the resolver's inline
arithmetic, and the resolver's `self_save` branch calls it. `SaveDcRule` is a
new type-only export beside `SaveDcRuleSchema`.

New file `packages/engine/src/calculators/relentlessRage.ts`:

```ts
export const RELENTLESS_RAGE_ACTION_ID = "action_relentless_rage";

export class RelentlessRageEngine {
  public static describe(input: {
    currentHp: number;
    activeStates: string[];
    action: ActionGrant; // its effect is the self_save
    usesSinceRest: number;
  }): { available: boolean; dc: number; summary: string };
}
```

A class with a static method, like `AffinityEngine` and `TableRulesEngine`
beside it.

- `available` is `currentHp <= 0` and the effect's own predicate holding
  (`predicateHolds` from `tableRules.ts`). The 0 HP trigger is the only
  trait-specific knowledge here, because nothing in the schema can express
  it.
- `dc` is `resolveSelfSaveDc(effect.dcRule, usesSinceRest)`.
- `summary` reads, for example, "Drop to 0 hit points while raging: DC 15
  Constitution saving throw to drop to 1 instead." The ability's full name
  comes from a local `Record<Ability, string>` in the reporter. The only
  existing map lives inside `SavingThrowsWidget.tsx`, which the engine
  cannot import.

`TableRuleLineKind` also gains `"reporter"`. `TableRulesEngine` never emits
one; the widget composes the Relentless Rage line itself, because it needs
current HP and the resource count, which are foreign to the reporter's
`{ traits, activeStates }` input.

`TableRulesWidget`:

- finds `RELENTLESS_RAGE_ACTION_ID` among the active traits' actions, the way
  `CombatWidget` finds `PROTECTION_TRAIT_ID`;
- reads the count from the store's `resources` entry whose id is the
  effect's `dcRule.resourceId`, 0 when absent;
- shows the reporter line, labelled "Reporter", whenever the action is
  present;
- shows a "Make the save" button only while `available`, calling
  `executeCharacterAction(RELENTLESS_RAGE_ACTION_ID)`.

After the save, the resolution payload updates the count and a success's
`HP_MODIFIED` updates HP, so the DC rises and the button goes away without
further wiring.

The store's `getCharacterActions` drops `self_save` actions.

### 4. Uses pools in Class Features

`useFeatures` stops discarding pools with no maximum and returns a
discriminated entry, the mode read from
`ruleSnapshot.resourcesById[id]?.mode`:

```ts
type FeaturePool =
  | { kind: "charges"; id: string; name: string; current: number; max: number;
      resetCondition: string; isDepleted: boolean }
  | { kind: "uses"; id: string; name: string; used: number;
      resetCondition: string };
```

`FeaturesWidget` renders a charges row as it does now. A uses row reads
"Used 1 since your last rest" for `short_rest`, "since your last long rest"
for `long_rest`, and "since it last reset" otherwise, with no Use button:
the save is what spends it. The store's `consumeResource` keeps its charges
semantics; the Use button is its only caller.

### 5. Pack corrections

Through `scripts/patchPackSegment.ts`:

- `resource_relentless_rage.resetCondition` becomes `short_rest`, and the
  trait's `implementation.summary` says the pool resets on either rest.
- `trait_berserker_frenzy`, `trait_berserker_retaliation`,
  `trait_berserker_mindless_rage` and `trait_berserker_intimidating_presence`
  move from `traits/unimplemented.json` to `classes/barbarian.json` with their
  content unchanged: a delete in one segment, an upsert in the other.

## Data changes

- Pack: the two corrections above.
- Shared: two type-only exports, `DynamicWeaponAttack` and `SaveDcRule`. No
  Zod schema changes, so `schemas:generate` must leave no diff.
- No database migration.

## Engine changes

- `pipeline/dynamicWeaponAttacks.ts`, `calculators/saveDc.ts`,
  `calculators/relentlessRage.ts`: new, exported from the index.
- `pipeline/characterEngine.ts`: templates excluded from the gather; the
  synthesis loop calls the helpers.
- `pipeline/actionResolver.ts`: `self_save` calls `resolveSelfSaveDc`.
- `calculators/tableRules.ts`: the `"suppression"` and `"reporter"` kinds and
  the `suspendedConditions` input.

## Web changes

- `store/characterSheetStore.ts`: `getSuspendedConditions`;
  `getCharacterActions` drops `dynamic_weapon_attack` and `self_save`
  actions.
- `hooks/useCombat.ts`: dynamic attack cards.
- `components/sheet/CombatWidget.tsx`: the `reaction` badge.
- `components/sheet/ConditionsWidget.tsx`: suspended rendering.
- `components/sheet/TableRulesWidget.tsx`: the suppression lines, the
  Relentless Rage line and button.
- `hooks/useFeatures.ts`, `components/sheet/FeaturesWidget.tsx`: uses pools.

## Testing

At the narrowest useful level, with both the applying and the blocked case
for every gated rule.

- **Engine**
  - `dynamicWeaponAttacks.test.ts`: applies to a melee weapon while the
    predicate holds; refused when the required state is absent, when a
    forbidden state is present, for a ranged weapon, for a missing property,
    for the wrong category; an empty category list accepts any melee weapon;
    the id format.
  - `characterEngine.test.ts`: no template in `liveSheet.actions`; the
    synthesised swings unchanged.
  - `saveDc.test.ts`: a fixed rule; an escalating rule at 0, 1 and 2 uses.
    The existing `self_save` resolver tests stay green as the regression.
  - `relentlessRage.test.ts`: available at 0 HP while raging; not at 1 HP;
    not at 0 HP without rage; the DC follows the count; the summary.
  - `tableRules.test.ts`: suppression lines, ordered after notes and
    affinities.
- **Web**
  - `useCombat`: a Frenzied Strike card for a held greataxe while frenzied;
    none without frenzy; none for a bow; Retaliation's card carries
    `reaction` and the `template:instance` id.
  - `CombatWidget`: "REACTION".
  - Store: `getCharacterActions` excludes templates and `self_save` actions;
    `getSuspendedConditions` suspends frightened while raging with Mindless
    Rage, and not otherwise.
  - `ConditionsWidget`: a suspended chip is struck through with its title.
  - `TableRulesWidget`: suppression lines; the reporter line; the button only
    while available; pressing it dispatches `action_relentless_rage`.
  - `useFeatures` and `FeaturesWidget`: new test files, since neither has
    one. A uses row reads "Used N since ..." with no Use button; charges rows
    unchanged.
- **Pack**: `barbarianPack.test.ts` finds the four Berserker traits in the
  class segment and asserts Relentless Rage's pool resets on `short_rest`.

## Closure

- `implementationMarkers.test.ts`: the comment above `441` still reads "447
  of 585"; it becomes "441 of 585", with the barbarian at zero.
- `docs/TODO_BACKLOG.md`: #30 447 to 441; the barbarian row 6 to 0; the "six
  remain" table and the sentence claiming Slices 4 to 8 are planned in the
  plan file (they are not) replaced by what happened; the Tier 1 line
  "closed 15 of the barbarian's 21 stubs" brought up to all 21. CRLF
  preserved.
- `docs/superpowers/plans/2026-09-02-barbarian-traits.md`: a closing note
  that Slices 4 to 8 were implemented by hand in `46f2136` rather than from
  this plan, and that the sheet surfaces follow from this spec.
- `docs/superpowers/specs/2026-09-02-barbarian-traits-design.md`: the status
  line records completion and points here.

## Verification

Before the branch is called done:

- `pnpm test:all`, and the five per-package typechecks (`npx tsc -b` from
  `apps/web`; `pnpm --filter @project/database typecheck`, never `tsc -b`
  there).
- `pnpm check:hygiene`, with each file's line endings preserved.
- `pnpm --filter @project/database schemas:generate` with no diff.
- `db:import-pack` against a live database, if one is available; otherwise
  recorded as not run.

## Known limitations

- The sheet and the server each compute a swing's numbers with
  `CombatEngine.calculateWeaponAttack`, as they already do for every weapon
  card. The shared helpers guarantee they agree on which swings exist and
  what they are called, not that two separate calculations agree.
- Relentless Rage's 0 HP trigger is reported, not enforced.
- Suppression applies on the sheet only; conditions never reach the server's
  action path.
- Retaliation's trigger, taking damage from a creature within 5 feet, is the
  player's call. The card spends the reaction like any other.

## Out of scope

- `saveModifiers` on the web: there is no web dispatch context (finding 1).
- The sheet building a live sheet.
- Rebuilt selections credited to every node that offers a trait: already a
  backlog item, and the barbarian's choice nodes are disjoint.
- Rage's automatic ending, exhaustion, reactions to external events.
- The other eleven classes.
