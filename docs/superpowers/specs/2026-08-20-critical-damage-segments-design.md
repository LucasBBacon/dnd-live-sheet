# Critical Damage as Segments

Date: 2026-08-20
Status: Approved
Owner: Claude pair session

## Goal

Fix the backlog entry "`add_specific_die` replaces the damage dice instead of
adding to them", and in doing so give critical damage a representation that can
express a mixed-size, mixed-type dice pool.

The reported defect, at [combat.ts:235](../../../packages/engine/src/calculators/combat.ts):

```ts
if (modifier.type === "add_specific_die" && modifier.diceToAdd) {
  return modifier.diceToAdd;   // discards baseDice entirely
}
```

A greataxe's `1d12` critical, plus a `1d6` rider, becomes `1d6`. The name says
"add"; the code substitutes.

## What Investigation Changed

The backlog framed this as a representation problem: `1d12 + 1d6` is not a
single `NdX` string, so "the expression type has to grow before the behaviour
can be corrected." Two findings reframed it.

**The format already exists.** `DamageSegmentSchema` - `{sourceName, baseDice,
damageType, maximized, scaling…}` - is what spells use. `actionResolver` already
loops segments, rolls each independently, and tags each `ActionRollResult` with
its own `damageType`. Critical damage is the last place in the engine flattening
a dice pool to one string. Nothing needs a new grammar.

**Critical dice never reach a real roll.** `applyCriticalHitModifier` is called
from exactly one place, and its output feeds `damageExpression` /
`criticalDamageExpression` - display-only strings consumed by `CombatWidget` and
the socket contract. The path that actually rolls damage is
`actionResolver`, and `AttackEffectSchema` carries only `criticalDamageMaximized`
- no critical dice at all. On a natural 20 the resolver rolls the weapon's base
dice, once, unmodified.

So Brutal Critical's extra dice exist on the sheet display and nowhere in the
live roll. Fixing `add_specific_die` in the calculator alone would correct a
string that no roll consults.

**Base crit doubling is also absent.** `combat.test.ts` pins
`criticalDamageExpression` at `"1d6 piercing"` for a `1d6` weapon. A critical
hit currently means "normal dice, plus whatever modifiers add" - the RAW rule
that damage dice are rolled twice is implemented nowhere, display or roll.

## Decisions

Three decisions were taken during design, all confirmed:

1. **Scope: segments plus the roll path.** Not a display-only fix.
2. **Base crit doubling is in scope, RAW.** Damage dice double on a crit.
3. **Segments are precomputed in `CombatEngine`**, not resolved at roll time.

## Design

### The format

Critical damage becomes `DamageSegment[]`:

```ts
[ { sourceName: "Greataxe",        baseDice: "2d12", damageType: "slashing" },
  { sourceName: "Brutal Critical", baseDice: "1d12", damageType: "slashing" },
  { sourceName: "Divine Smite",    baseDice: "4d8",  damageType: "radiant"  } ]
```

Chosen over growing the string grammar to `"1d12 + 1d6"` because:

- **Damage type is per-segment.** A string cannot say "the 1d12 is slashing, the
  1d6 is fire". Resistance math and every rider the backlog names - Divine
  Smite, Hex, elemental brands - need that. `CriticalHitModifierSchema.damageType`
  already exists and is read by nobody; the intent was always a typed rider.
- **`sourceName` yields the breakdown for free** - "Brutal Critical: 1d12"
  rather than an opaque total.
- **The resolver already speaks it.** No new roll machinery.
- **`maximized` is already per-segment**, so a crit-maximized smite alongside
  normal weapon dice is representable. A whole-expression flag cannot do that.
- **`DiceEngine.parse` is untouched.** Each `baseDice` stays a clean `NdX`. This
  is the real prize: no new parser, no new grammar, no round-trip risk.

`criticalDamageExpression` survives as a *derived* string formatted from the
segments, so `CombatWidget` and the socket's `damageExpression: string` are
unchanged.

### Where segments are computed

`CombatEngine.calculateWeaponAttack` emits both `damage` and `criticalDamage`
segment lists. `weaponSynthesizer` puts both on `AttackEffect`. `actionResolver`
picks the crit list on a natural 20.

Modifier matching - attack type, gating states, class levels - already happens in
`combat.ts` with full context the resolver does not have. Precomputing is also
exactly what `criticalDamageMaximized` already does: a resolved field on the
effect. This follows the existing convention and leaves the resolver dumb.

The alternatives were shipping raw `criticalHitModifiers` on the effect and
applying them at roll time, or having the resolver call back into `CombatEngine`.
Both duplicate the matching logic into the pipeline or require plumbing
`classLevels` and gating states the resolver does not carry.

### Order of operations

1. Clone the base segments, `count *= 2` on each. All of the attack's damage
   dice double, weapon and riders alike.
2. Apply `add_base_die` - increments the count on the weapon segment.
3. Apply `add_specific_die` - appends a **new** segment. It is *not* doubled;
   it is already crit-only extra damage.
4. Apply `maximize_dice` - sets `maximized: true` on the crit segments.

| Case | Base | Crit result |
|---|---|---|
| Greataxe, no traits | `1d12` | `2d12` |
| + Brutal Critical L9 | `1d12` | `3d12` |
| + Savage Attacks too | `1d12` | `4d12` (stack - one modifier each) |
| + Divine Smite 2d8 rider | `1d12`, `2d8` | `3d12` slashing, `4d8` radiant |
| `add_specific_die 1d6` fire | `1d12` | `2d12` slashing + `1d6` fire |

The last row is the reported bug. Today it returns `1d6`, dropping the greataxe.

### Which segment `add_base_die` targets

The weapon segment, which is index 0 - `weaponSynthesizer` always emits it
first. This mirrors the resolver, which already applies the flat `damageBonus`
only at `index === 0`.

**This is the one load-bearing assumption in the design.** It is documented
rather than enforced by a `role` field, on YAGNI grounds: no current authored
content produces a non-weapon segment ahead of the weapon. If pack content ever
does, `add_base_die` silently inflates the wrong die, and a discriminator field
becomes necessary.

### Source attribution

`CriticalHitModifier` has no `sourceName`, and `characterEngine` flat-maps the
modifiers off their traits, dropping trait identity:

```ts
const criticalHitModifiers = activeTraits.flatMap(
  (trait) => trait.criticalHitModifiers ?? [],
);
```

Add an optional `sourceName` to `CriticalHitModifierSchema` and stamp it at that
flat-map, mirroring how blueprint modifiers already get `sourceName` stamped in
`actionResolver`. Optional rather than defaulted, for the reason recorded on
`dieCount`: a `.default()` makes the field required on the inferred output type,
forcing every existing hand-built literal to restate it.

### Display string

`formatDamageExpression` takes segments and groups by damage type, merging
same-size dice within a type:

```
3d12 +4 slashing + 1d6 fire
```

The damage bonus attaches to the weapon group only, matching the resolver's
`index === 0` rule. Single-type attacks format exactly as they do today, so most
existing assertions survive untouched.

### Compatibility

`AttackEffectSchema.criticalDamage` is optional. Absent means fall back to
`damage`, which is today's behaviour, so spells and pack content authored
without crit data keep working.

`criticalDamageMaximized` stays on the `CombatEngine` return value for the UI,
but the resolver stops special-casing it: crit segments carry `maximized`
themselves, which is strictly more expressive.

## Testing

Characterization tests first, on both live paths - `calculateWeaponAttack`'s
crit expression and a forced-crit run through `actionResolver` - so the doubling
change shows up as a reviewable diff rather than a surprise.

Then the table above becomes the case list, plus:

- a crit modifier gated on an attack type it does not match contributes nothing
- a `class_level_thresholds` modifier below its first threshold contributes
  nothing
- `add_specific_die` with no `damageType` inherits the weapon's
- an effect with no `criticalDamage` falls back to `damage`

The 8 existing crit assertions move to doubled values. That is a deliberate RAW
behaviour change, recorded here so the diff is explicable.

## Files

- `packages/shared/src/schemas/dice.ts` - `sourceName` on `CriticalHitModifierSchema`
- `packages/shared/src/schemas/actions.ts` - `criticalDamage` on `AttackEffectSchema`
- `packages/engine/src/calculators/combat.ts` - segment building, doubling,
  modifier application, formatter
- `packages/engine/src/pipeline/characterEngine.ts` - stamp `sourceName`
- `packages/engine/src/pipeline/weaponSynthesizer.ts` - carry crit segments
- `packages/engine/src/pipeline/actionResolver.ts` - roll crit segments on a nat 20

## Out of Scope

- A `role` discriminator on `DamageSegment`. See the index-0 assumption above.
- Retiring `damageExpression: string` from the socket contract in favour of
  structured segments. The derived string keeps that boundary stable; changing
  it is a client-side migration with its own cost.
- Authoring new pack content that uses `add_specific_die`. This work makes it
  expressible; the first rule to use it is separate.
