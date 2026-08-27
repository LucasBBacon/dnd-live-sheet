# Weapon damage expressions: flat, absent, and unenforced rules

Date: 2026-08-27
Status: approved, ready to implement

## Problem

`WeaponCapabilitySchema` can describe exactly one kind of weapon: one that rolls
dice for a damage type. Three weapons in the 2014 core pack are not that weapon.

| Weapon | Real rule | Authored today |
| --- | --- | --- |
| Blowgun | 1 piercing, no dice | `damageDice: "1"` |
| Unarmed strike | 1 bludgeoning, no dice | `damageDice: "1"` |
| Net | no damage at all; restrains on hit | `damageDice: ""`, `damageType: ""` |

Every one of those three values is a lie the schema cannot catch and the engine
cannot read.

`DiceEngine.parse` accepts only `/^(\d+)d(\d+)([+-]\d+)?$/`, so `"1"` and `""`
both throw. `packages/engine/src/calculators/combat.ts` wraps its parses in
`try/catch` and passes unreadable segments through; `actionResolver.ts` does not.
Its attack case calls `rollDigital(baseDice)` and `parse(baseDice).sides`
unguarded, so **equipping any of these three weapons and attacking with it throws
and kills the whole action**, not just its damage.

`damageType: ""` is separately invalid against the generated segment schema —
`""` is not in the `DamageTypeSchema` enum — which is why `equipment/weapons.json`
cannot be registered in the pack manifest as it stands.

The `""` sentinel is also against the grain of this codebase, which has a settled
habit of making absence explicit rather than encoding it as an empty value:
`implementation.gaps` says what an item is missing, `NoEffectSchema` exists so an
action can say it deliberately does nothing, and `CombatContext.surprised`
documents itself as "reported, never enforced".

## Decisions taken

Three questions were settled before this design:

1. **Representation** — optional fields plus a validated expression grammar,
   rather than a nested damage block or a tagged union. Absence of `damageDice`
   means the weapon deals no damage. Smallest data churn, and absence becomes
   real absence.
2. **The net's restraint** — surfaced as authored text on the resolved action,
   not modelled. This engine has no target entity: hostiles exist only as
   `targetLabel: z.string().optional()` on `CombatRollSnapshot`, and
   `apply_effect` writes to the player character's own `EffectManager`. There is
   nothing to apply `restrained` to. Modelling one would be its own project.
3. **Note scope** — a general `specialNote`, required whenever a weapon carries
   the `special` property, rather than a net-specific `onHitNote`. The lance
   carries `special` too (disadvantage within 5 feet, two hands to attack while
   unmounted) and has the same problem: an unenforced rule with no way to tell
   the player.

## Architecture

### 1. Authoring shape

A new primitive beside the other damage primitives:

```ts
export const DamageExpressionSchema = z
  .string()
  .regex(/^(\d+d\d+([+-]\d+)?|\d+)$/);   // "1d8", "2d6+1", or flat "1"
```

`WeaponCapabilitySchema` then becomes:

```ts
damageDice:          DamageExpressionSchema.optional(),  // absent = no damage
versatileDamageDice: DamageExpressionSchema.optional(),
damageType:          DamageTypeSchema.optional(),        // absent = no damage
specialNote:         z.string().min(1).optional(),
```

with three refines:

- `damageDice` and `damageType` are both present or both absent. Half-authored
  damage is the failure this replaces, so it must not be re-expressible.
- `versatileDamageDice` requires `damageDice`. A two-handed die with no
  one-handed die is not a weapon.
- `properties` containing `special` requires `specialNote`. Declaring a weapon
  special without saying what is special about it is the same silent gap that
  `implementation.gaps` exists to prevent.

`specialNote` is appended after `ammoTag`, keeping the block's authored key order
aligned with the schema.

### 2. Enforcement is split across two layers

This is the one non-obvious property of the design, and the tests depend on it.

`z.toJSONSchema(..., { io: "input", target: "draft-7" })` **drops `.refine()`
silently** — it does not throw, and it emits no `anyOf` or `dependentRequired` in
its place. It does carry `.regex()` through as `pattern`. Verified against the
workspace's Zod before this design was written.

So:

| Rule | Zod (pack load) | ajv (`packSchemas.test.ts`) |
| --- | --- | --- |
| `""` / malformed expression | rejected | rejected (`pattern`) |
| both-or-neither damage | rejected | **not checked** |
| `versatile` requires base die | rejected | **not checked** |
| `special` requires a note | rejected | **not checked** |

Zod is the layer that actually parses packs at load, so nothing ships unchecked.
But the ajv test cannot stand in for the refines, and the plan therefore needs
Zod-level unit tests for all three. Regenerating the JSON schema is mandatory
after the Zod change, or the byte-compare in `packSchemas.test.ts` fails.

### 3. Dice layer

`DiceEngine.parse` gains a bare-integer branch returning
`{ count: 0, sides: 0, modifier: N }`. The existing arithmetic in `rollDigital`
and `rollMaximized` then yields `{ total: N, rolls: [], modifier: N }` with no
further change — both loops run zero times and both totals already add
`modifier`. `""` keeps throwing; the regex means no pack can author it.

Three call sites assume `count > 0` and produce corrupt expressions from a flat
segment. Each needs a guard:

| Site | Today, given `"1"` | Fix |
| --- | --- | --- |
| `combat.ts` `doubleSegment` | `"0d0"` — damage lost | `count === 0` returns the segment untouched |
| `combat.ts` `add_base_die` | `"1d0"` | `count === 0` returns the pool unchanged |
| `combat.ts` damage renderer | prints `"1d0"` | flat segments render as a trailing `+N` |

The `doubleSegment` guard is also the correct rule rather than merely a repair: a
critical hit doubles damage *dice*, and flat damage has none. A blowgun crit is
1 + DEX, the same as a hit.

### 4. No-damage attacks

`WeaponSynthesizer.generateWeaponAction` emits `damage: []` when the weapon has
no `damageDice`, instead of unconditionally building one segment.
`AttackEffectSchema.damage` already accepts an empty array, and the resolver's
loop over segments simply does not run — so the net produces an attack roll and
no damage roll. Its `damageBonus`, which the resolver attaches at `index === 0`,
is correctly dropped along with the segment that would have carried it.

### 5. Surfacing the note

`specialNote` reaches `WeaponView` for free — that view is a spread of
`WeaponCapability`. The remaining hops:

- `AttackEffectSchema` gains `specialNote: z.string().optional()`.
- `WeaponSynthesizer` copies it from the weapon onto the effect.
- `ActionResult` gains `notes?: string[]`, which the resolver populates.

`notes` goes on `ActionResult` rather than reusing the `label`/`summary` fields
already on `ActionRollResult` because the note belongs to the action, not to any
one roll — and the net, having no damage roll, has no roll to hang it on.

While in the resolver, the double `DiceEngine.parse(baseDice)` in the attack and
`damage_rider` cases collapses to a single parse whose result is reused. It parses
the same string twice per segment and is a second throw site for no benefit.

### 6. Gap ledger and manifest

`equipmentGaps.test.ts` asserts `withGap("weapon")` has length 23. The migration
into `weapons.json` filled 22 of those 23, and this change fills the last one, so
that becomes `toEqual([])` with a comment recording that issue #32 is closed. The
`derivedGaps` helper needs no change: it derives a `weapon` gap from a missing
`weapon` block, and the net has one.

Registering `equipment/weapons.json` in the manifest is the **final** step. It is
what puts the file under `packSchemas.test.ts` and `equipmentGaps.test.ts`, so
doing it before the schema, engine and data changes land leaves the tree red.

## Data changes

Only two pack entries change. The blowgun and unarmed strike already say `"1"`;
they need the schema to accept it, not new content.

- **net** — drop `damageDice` and `damageType`; add `specialNote` describing the
  restraint, the escape DC, and the size limit.
- **lance** — add `specialNote` describing the 5-foot disadvantage and the
  two-handed requirement while unmounted.

`weapons.json` and the other pack files are CRLF. Edits must preserve per-file
line endings; `packages/database/data/schemas/*.schema.json` is separately pinned
to LF by `.gitattributes` and is written only by `schemas:generate`.

## Testing

- **Dice** — `parse`/`rollDigital`/`rollMaximized` on a flat expression; `""` and
  malformed input still throw.
- **Crit maths** — `doubleSegment` leaves a flat segment alone; `add_base_die`
  leaves a flat pool alone; the renderer prints a flat segment as `+N`.
- **Synthesizer** — a no-damage weapon yields `damage: []`; a flat weapon yields
  one segment carrying `"1"`; `specialNote` reaches the effect.
- **Resolver** — the net resolves, producing an attack roll, no damage roll, and
  a note; the blowgun deals 1 + DEX; a crit on the blowgun still deals 1 + DEX.
- **Schema (Zod, not ajv)** — each of the three refines rejects its violation, and
  `""` is rejected as an expression.
- **Pack** — regenerate the JSON schema and confirm the byte-compare passes; the
  gap ledger reads empty; the full pack assembles with `weapons.json` registered.

## Out of scope

Target modelling — hostile entities with hit points, states, and their own effect
managers — is what modelling the net's restraint mechanically would require. It is
a subsystem, not a rider on this change, and needs its own spec. Until it exists,
`specialNote` is how a rule about a hostile reaches the player, which is the same
answer this codebase already gives for surprise and for Disengage, Help and Ready.
