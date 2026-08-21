# Equipment implementation marker

Date: 2026-08-21
Status: approved, ready to implement

## Problem

Equipment is the only pack section that cannot declare its own gaps. Traits carry
`TraitImplementationMetadataSchema` and spells carry a smaller marker of the same
kind, so a stub is distinguishable from a rule that deliberately grants nothing.
`CoreEquipmentSchema` has nowhere to say the equivalent.

That silence is how backlog items #32 and #33 stayed invisible: 23 weapons that
equip and weigh correctly and roll no attack, and 6 armours that can be worn and
grant no AC. Nothing in the data distinguished them from finished items, so the
only way to find them was to go looking.

This change marks the gaps. It does not fill them — #32 and #33 stay open.

## Why not reuse the trait or spell shape

Both existing markers describe a rule that is wholly absent: `mode:
"unimplemented"` means the trait or spell exists only so references resolve.

Equipment's gaps are not wholesale. A battleaxe equips, weighs correctly and
carries its proficiency tags; only its attack is missing. Marking it
"unimplemented" would describe a mostly-working item as a stub, and would say
nothing about *which* facet is absent — so nothing could count the gaps or check
the marker against reality.

The equipment marker therefore names the missing facet instead of declaring a
mode. This is a deliberate divergence from the other two sections.

## Schema

In `packages/shared/src/schemas/coreRulePack.ts`, beside `CoreEquipmentSchema`:

```ts
export const EquipmentGapSchema = z.enum([
  "weapon",
  "armor_class",
  "armor_category",
]);

export const EquipmentImplementationSchema = z
  .object({
    gaps: z.array(EquipmentGapSchema).min(1),
    summary: z.string().min(1),
  })
  .strict();
```

`CoreEquipmentSchema` gains `implementation: EquipmentImplementationSchema.optional()`.

Optional rather than defaulted, for the reason the trait and spell schemas
already record: a `.default()` makes the field required on the inferred output
type, so every authored equipment literal would have to restate it.

`gaps` is `.min(1)` because an empty array would be a third way of saying
"complete", and the absent marker already says that.

The marker lives on `CoreEquipmentSchema` rather than on the shared
`EquipmentDefinitionSchema`. Nothing at runtime reads it yet, and the projection
into `ItemDefinition` should not carry a field no consumer wants. Pushing it
into the runtime later is additive if a UI ever wants to say "this weapon has no
attack authored".

## Derivation rules

The cross-check derives what is actually missing and compares it to what is
declared. These three rules are the source of truth:

| Condition | Gap |
| --- | --- |
| `type: "weapon"` with no `weapon` block | `weapon` |
| `type: "armor"` with no `ARMOR_CLASS` modifier | `armor_class` |
| `type: "armor"`, `equipSlot: "body"`, no `armorCategory` | `armor_category` |

The `equipSlot: "body"` qualifier on the third rule is load-bearing.
`ArmorCategorySchema` documents shields as excluded from the category on
purpose - a shield is not body armour, and the rules that care about shields ask
a different question. Without the qualifier the check would flag
`item_armor_shield` for an absence that is deliberate.

## Cross-check test

One assertion, both directions: for every equipment item in the assembled pack,
derived gaps must equal declared gaps.

- An item with an undeclared gap fails. A new unmarked gap cannot enter quietly.
- An item declaring a gap it no longer has fails. A marker left behind after #32
  or #33 is filled cannot go stale.

This is the part that makes the marker a guard rather than a comment. Worth
stating plainly: no existing test cross-checks the trait or spell markers - they
are sampled by spot-checks - so those markers can drift out of step with their
data. Equipment should not inherit that.

## Data

29 items gain a marker:

| Items | Gaps | Backlog |
| --- | --- | --- |
| 23 weapons | `["weapon"]` | #32 |
| 6 armours | `["armor_class", "armor_category"]` | #33 |

The 6 armours carry **two** gaps each, not one. #33 recorded only the missing AC
modifier; the same six items also have no `armorCategory`, which is what rules
like Fast Movement and armour proficiency gate on. Found while measuring for
this change.

The 5 complete core armours, including the shield, take no marker.

## Out of scope

- Filling the gaps. #32 and #33 stay open; this only makes them declare
  themselves.
- Backfilling a cross-check for the trait and spell markers. Recorded as a
  follow-up rather than bundled here.
- Carrying the marker into `ItemDefinition` and the runtime projection.
