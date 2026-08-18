# Trait Authoring Guide

This guide explains how to add a trait as JSON data in a validated rule pack, how the engine consumes that data, and what to do when a mechanic is not currently expressible by the engine.

## Authority and Scope

Core traits are authored in the version-controlled pack files under:

```text
packages/database/data/packs/core_2014_pack/
```

Do not add new core-rule data to the older top-level JSON snapshots or to a static TypeScript dictionary. The pack is validated first, imported into the database, and projected into the rule snapshot consumed by the engine.

The main contracts are defined in:

- `packages/shared/src/schemas/traits.ts`
- `packages/shared/src/schemas/modifiers.ts`
- the schemas for actions, resources, triggers, dice rules, proficiencies, affinities, and spells

The generated JSON schemas in `packages/database/data/schemas/` describe these contracts for external validation and tooling. They are derived artefacts, not a second authoring source.

## The Authoring Workflow

1. Identify the authoritative pack segment and the trait's stable ID.
2. Confirm the mechanic against the shared schemas and existing neighbouring traits.
3. Author the smallest JSON definition that represents the rule.
4. Decide whether the rule is fully engine-backed or needs a sheet helper.
5. Validate the JSON and the complete trait against the live Zod contract.
6. Add focused engine or pack tests for the behaviour.
7. Regenerate the checked-in JSON schemas when a shared contract changes.
8. Run the relevant package tests and source hygiene checks.

A trait should be authored once in the pack. The engine should interpret the resulting data, rather than containing a trait-specific branch such as `if (traitId === ...)`.

## Trait Shape

A normal trait has this overall shape:

```json
{
  "id": "trait_example",
  "name": "Example Trait",
  "lore": {
    "shortDescription": "The concise player-facing rule text.",
    "fullText": "The complete rule text, where useful."
  },
  "isStartingProficiency": false,
  "modifiers": {
    "fixed": [],
    "choices": []
  },
  "grantedStates": [],
  "proficiencies": {
    "fixed": [],
    "choices": []
  },
  "affinities": {
    "fixed": [],
    "choices": []
  },
  "spells": {},
  "implementation": {
    "mode": "engine",
    "summary": "How the engine applies this rule.",
    "blockedBy": []
  },
  "resources": [],
  "triggers": [],
  "diceRules": [],
  "criticalHitModifiers": [],
  "actions": []
}
```

Most fields are optional or default to an empty collection. Include only the fields needed by the rule, while keeping the complete shape when nearby pack data follows that convention.

### Identity and text

- `id` is a stable, globally unique identifier. Treat it as an API key: do not rename it casually.
- `name` is the display name.
- `lore.shortDescription` is concise rule text for lists and summaries.
- `lore.fullText` can contain the complete rule wording.
- Use British spelling in authored prose where the project convention applies. Preserve established identifiers such as `status_wearing_armor` exactly; identifiers are contracts, not prose.

### Implementation metadata

Use `implementation` when the delivery mode needs to be explicit:

```json
"implementation": {
  "mode": "engine",
  "summary": "Adds a +1 bonus to AC while wearing armour.",
  "blockedBy": []
}
```

The available modes are:

- `engine`: the rule is represented by an existing shared contract and is calculated by the engine.
- `manual_sheet_helper`: the rule is surfaced to the sheet or user interface because the engine does not yet have the required semantic capability.

`blockedBy` records conditions that prevent a helper or rule from applying. It is descriptive metadata unless the referenced state is also used by an actual modifier, trigger, action, or calculator path.

Do not claim `engine` support merely because a rule has a number in it. The engine must be able to calculate the rule under all relevant conditions and expose a trustworthy breakdown.

## Choosing the Right Rule Block

### Fixed modifiers

Use `modifiers.fixed` for unconditional or state-gated numeric effects:

```json
"modifiers": {
  "fixed": [
    {
      "target": "ARMOR_CLASS",
      "type": "add",
      "value": 1,
      "scalingFactor": "none",
      "requiredStates": ["status_wearing_armor"],
      "forbiddenStates": []
    }
  ],
  "choices": []
}
```

A modifier contains these main options:

- `target`: the statistic or roll affected, such as `ARMOR_CLASS`, `MAX_HP`, `SPEED`, `STR`, `DEX`, `CON`, a saving throw, or a skill check.
- `type`: currently `set_base`, `add`, `multiplier`, `advantage`, or `disadvantage`.
- `value`: the fixed numeric value. It defaults to `0`, which is useful for value-derived effects that the calculator resolves from other fields.
- `valueSource`: an existing value source for supported contexts, such as an attack ability modifier or governing statistic modifier.
- `scalingFactor`: `none`, `total_level`, `class_level`, or `class_level_thresholds`.
- `scalingClassId` and `scalingThresholds`: supporting data for class-level scaling.
- `maxDexCap`: the Dexterity cap used by AC base calculations, including `0` for heavy armour.
- `requiredStates`: every listed state must be active.
- `forbiddenStates`: none of the listed states may be active.

State names must match the states emitted by the pipeline or effect system. A typo in a state name does not create a new runtime condition; it creates a rule that never gates as intended.

### Choice modifiers

Use `modifiers.choices` when the player chooses one or more targets from an allowed list:

```json
"choices": [
  {
    "id": "example_ability_choice",
    "chooseAmount": 2,
    "options": ["STR", "DEX", "CON", "INT", "WIS", "CHA"],
    "modifierTemplate": {
      "type": "add",
      "value": 1,
      "scalingFactor": "none"
    },
    "allowDuplicates": false
  }
]
```

The character's saved selection is resolved by `ModifierExtractor`. Invalid options, duplicates, and selections beyond `chooseAmount` are rejected. Keep the template generic; formula-bearing choices are not currently a standard authoring path.

### Granted states

Use `grantedStates` for a persistent flag that exists while the character has the trait:

```json
"grantedStates": ["powerful_build"]
```

This is different from temporary states granted by an active effect. A granted state only becomes useful when a calculator, extractor, trigger, or action consumes it.

### Proficiencies, affinities, spells, resources, triggers, dice rules, and actions

Use the dedicated blocks when the trait grants that capability:

- `proficiencies`: fixed or chosen skill, tool, language, weapon, armour, or saving-throw proficiency.
- `affinities`: damage resistance, immunity, vulnerability, or other damage-type relationships.
- `spells`: known or selectable spells, with resource references where applicable.
- `resources`: uses, charges, or rest-reset pools.
- `triggers`: reactive rules evaluated when their triggering condition occurs.
- `diceRules`: dice or roll-specific rules that the existing dice contract supports.
- `criticalHitModifiers`: critical-hit-specific modifications.
- `actions`: proactive capabilities such as attacks, bonus actions, reactions, or resource-consuming actions.

Do not encode a new mechanic into an unrelated block simply because the JSON shape is convenient. If the mechanic does not match the semantics of the block, either use a sheet helper or extend the contract deliberately.

## AC Formula Example

Barbarian Unarmored Defense is represented as a selected AC formula candidate, rather than as two independent AC modifiers:

```json
{
  "target": "ARMOR_CLASS",
  "type": "set_base",
  "value": 10,
  "formula": {
    "kind": "ability_sum",
    "base": 10,
    "abilities": ["DEX", "CON"]
  },
  "scalingFactor": "none",
  "requiredStates": [],
  "forbiddenStates": ["status_wearing_armor"]
}
```

The `formula` is currently available for AC `set_base` candidates and supports:

- `kind: "ability_sum"`
- an integer `base`
- one or more ability references from `STR`, `DEX`, `CON`, `INT`, `WIS`, and `CHA`

At runtime, the engine:

1. Filters inactive modifiers and state-blocked modifiers.
2. Compares valid AC base candidates using their effective totals.
3. Selects one non-stacking base candidate.
4. Applies the selected candidate's formula abilities.
5. Applies compatible flat AC additions, such as a shield or ring of protection.
6. Emits a calculation breakdown for the sheet.

For example, with DEX `+3` and CON `+4`, the formula produces:

```text
Base AC (Unarmored Defense): 10
Dexterity Modifier: +3
Constitution Modifier: +4
Total: 17
```

When `status_wearing_armor` is active, the candidate is filtered out and the equipped armour calculation can win instead.

Do not represent this rule as a conditional `add` of Constitution alongside an unconditional or separately competing base. That could allow Constitution to leak into another AC formula, such as Mage Armor.

## How the Engine Handles Authored Traits

The main runtime flow is:

1. A character references traits through race, class, background, feat, subclass, or saved choices.
2. The bootstrapper resolves those references into trait definitions from the active rule snapshot.
3. `ModifierExtractor` converts fixed and selected trait modifiers into `RuntimeModifier` values and adds source metadata.
4. Other extractors collect proficiencies, persistent states, actions, and related capabilities.
5. Equipped inventory is converted into additional runtime modifiers.
6. `CharacterEngine` calculates final abilities and derived statistics in pipeline order.
7. The relevant calculator filters and interprets the runtime modifiers.
8. The live sheet receives both the result and an explanatory breakdown where the calculator supports one.

This means a JSON trait can only affect a calculation if all of the following are true:

- the trait is actually granted by the character's resolved progression or selection;
- the relevant extractor projects the authored block;
- the target and modifier type are understood by the calculator;
- required and forbidden states are emitted with the same identifiers;
- the calculation occurs in a pipeline stage that can see the required inputs.

## Validation and Testing

At minimum, validate the edited trait object with the live shared schema. A focused validation command can be run from the database package after loading the trait object from its pack segment, for example:

```powershell
pnpm --filter @project/database exec tsx -e "import fs from 'node:fs'; import { TraitDefinitionSchema } from '@project/shared'; const segment = JSON.parse(fs.readFileSync('data/packs/core_2014_pack/classes/barbarian.json', 'utf8')); const find = (value: unknown): unknown[] => Array.isArray(value) ? value.flatMap(find) : value && typeof value === 'object' ? [...(('id' in value && value.id === 'trait_example') ? [value] : []), ...Object.values(value).flatMap(find)] : []; const trait = find(segment)[0]; if (!trait) throw new Error('trait not found'); TraitDefinitionSchema.parse(trait); console.log('trait valid');"
```

Use the repository's pack validation/import workflow when validating a complete segment. Also run:

```powershell
pnpm --filter @project/shared test --run
pnpm --filter @project/engine test --run
pnpm check:hygiene
```

For a new trait, add tests at the narrowest useful level:

- schema test for unusual or new payload shape;
- extractor test when projection or choice resolution is involved;
- calculator test for the mathematical rule and state gates;
- pipeline test proving the trait reaches a live character sheet;
- pack validation test when the change affects authoritative core data.

Test both the applying and blocked conditions. For a conditional rule, a passing test without a state-transition test is incomplete.

## Extending the Engine for a New Mechanic

A mechanic needs engine work when its meaning cannot be represented safely by the existing modifier, state, trigger, action, resource, dice, or proficiency contracts. Examples include a new kind of derived-stat formula, target-aware reactions, concentration interactions, or a rule that depends on multiple entities.

The high-level extension process is:

1. **Describe the rule semantics first.** Write down the inputs, conditions, stacking behaviour, precedence, timing, and expected breakdown. Include edge cases and negative values.
2. **Find the owning abstraction.** Extend the nearest shared schema and calculator or resolver that directly controls the behaviour. Avoid adding a trait-ID special case to a general calculator.
3. **Add a discriminated data contract.** Prefer a structured field such as `formula.kind` or `effect.type` so future variants can be validated without ambiguous combinations of optional fields. Keep the first variant as small as the real rule requires.
4. **Propagate the data losslessly.** Update extractors, runtime types, snapshots, and any choice templates that need to carry the new field. Verify that spread, normalisation, or database projection code does not discard it.
5. **Implement deterministic interpretation.** Add the calculation or resolver logic in the engine. Define how the new mechanic competes or stacks with existing mechanics and how state gating is applied.
6. **Expose explainability.** Add breakdown entries, ignored-candidate reasons, or a structured report when the mechanic affects a user-visible derived value.
7. **Test the contract and behaviour.** Cover schema acceptance/rejection, extraction, positive and blocked cases, competing rules, edge values, and a live pipeline path.
8. **Regenerate and validate artefacts.** Update generated JSON schemas, validate the authoritative pack, run package tests, and run `pnpm check:hygiene`.
9. **Document the architecture decision.** If the extension establishes a reusable engine pattern or changes where rule meaning belongs, propose an entry in `docs/decisions/ARCHITECTURE_DECISIONS.md`.

When a mechanic cannot yet be implemented safely, author it as `manual_sheet_helper` with a precise `implementation.summary` and a `blockedBy` explanation. A helper is a deliberate boundary, not a substitute for silently incorrect engine maths.

## Design Rules of Thumb

- Author core data in `packages/database/data/packs/core_2014_pack/`.
- Reuse existing target, type, state, and calculator semantics where they fit.
- Keep mutually exclusive base calculations as candidates; do not split one formula across unrelated modifiers.
- Use final ability modifiers when a rule refers to an ability modifier, not raw ability scores.
- Keep state identifiers exact and test their runtime emission.
- Prefer a general, validated mechanic contract over a trait-specific engine branch.
- Do not add a new schema variant until a real rule needs it.
- Treat generated schemas and database projections as derived outputs.
- Include tests for both application and suppression of conditional rules.
- Keep engine capability and authored rule data separate: the pack describes the rule, and the engine interprets the contract.
