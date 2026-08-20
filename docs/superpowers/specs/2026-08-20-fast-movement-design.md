# Fast Movement, and the Armour Category It Needed

Date: 2026-08-20
Status: Implemented
Owner: Claude pair session

## Goal

Author the barbarian's Fast Movement: *"Starting at 5th level, your speed
increases by 10 feet while you aren't wearing heavy armor."*

## What Was Actually Missing

The modifier is six lines. The blocker was that **this system had no concept of
armour category.** Nothing anywhere declared an item light, medium or heavy:

- `baseStates` emitted `status_wearing_armor` for *any* body-slot item, without
  consulting the item's type.
- The only implicit signal for "heavy" was `maxDexCap: 0` on an AC modifier,
  carried by exactly one item — `item_armor_plate`.
- Armour proficiency ids (`light_armor`, `medium_armor`) are free-form strings
  on a `z.string()` field, checked by nothing.

Inferring heavy from `maxDexCap: 0` would have produced a wrong answer that
looked right: `item_armor_chain_mail` is heavy armour in the PHB but is a
`createPlaceholderEquipment` stub with no modifiers, so it would have read as
not-heavy and quietly paid out the +10.

## Design

**Declare the category, never infer it.** `ArmorCategorySchema` is
`"light" | "medium" | "heavy"`, optional on `ItemDefinitionSchema`. Heavy is not
the same fact as "ignores Dexterity" — `maxDexCap: 0` is a *consequence* of the
category, and reading a consequence backwards misclassifies any armour whose
modifiers are not yet authored.

Shields are deliberately not in the enum. A shield is not body armour, and the
rules that care about shields ask a different question — "are you wielding one"
— answered from a different slot. Monk's Unarmored Movement will need that; it
is not this trait's problem.

**States move behind an extractor.** `InventoryExtractor.extractStates` mirrors
the `extractModifiers` beside it, so item-definition resolution lives in one
place and the emission site in `characterEngine` becomes one line instead of
three. It emits `status_wearing_armor` for a body-slot item whose definition is
`type: "armor"`, plus `status_wearing_<category>_armor` where a category is
declared.

All three categories are emitted, not just heavy. It is the same loop, and a
taxonomy with one member invites the next author to guess.

**The level gate is the progression grant**, not a scaling threshold — matching
Danger Sense. A Barbarian 4 / Fighter 4 never receives the trait, so a threshold
would restate what the grant already settles.

## Corrections Made Along The Way

1. **"The robe bug is live."** It was latent. All four body-slot items in the
   dictionary were armour, and equipment resolution runs in `static-only` mode,
   so no snapshot could inject a counter-example. The bug was real but
   unreachable — and untestable until `item_robe` existed.

2. **`item_robe` as `type: "gear"`.** An existing invariant test — *gear items
   are carried but not worn* — rejected it, correctly. A robe is `wondrous`, the
   same category as the ring of protection, whose comment already reads "worn,
   but not armor". The test caught a genuine miscategorisation.

## Deliberately Not Done

**Chain mail, splint, ring mail and the other placeholder armours were left
alone.** They carry no `type`, no `equipSlot` and no modifiers, so they cannot
be equipped at all. The hazard used to argue against inference is neutralised by
their inertness, not by anything this change did. Authoring them properly means
AC values, Dex caps, stealth disadvantage and Strength requirements — pack
content on the incremental list, not part of this trait.

Consequently `armorCategory` is currently declared on four items: padded,
leather and studded leather (light), and plate (heavy). No medium armour is
declared anywhere yet, so `status_wearing_medium_armor` has no way to fire.

## Files Changed

| File | Change |
| --- | --- |
| `shared/schemas/items.ts` | `ArmorCategorySchema`; `armorCategory` on `ItemDefinitionSchema` |
| `shared/schemas/equipment.ts` | `armorCategory` on the strict `EquipmentDefinitionSchema` |
| `engine/rules/equipmentDictionary.ts` | forward the field in `toItemDefinition`; backfill four armours; add `item_robe` |
| `engine/pipeline/inventoryExtractor.ts` | `extractStates` |
| `engine/pipeline/characterEngine.ts` | emission site delegates to it |
| `database/data/packs/.../barbarian.json` | `trait_fast_movement` authored |

## Result

| Suite | Before | After |
| --- | --- | --- |
| `@project/shared` | 187 passed | 187 passed |
| `@project/engine` | 677 passed | **687 passed** |
| `@project/database` | 89 passed | 89 passed |
| `@project/server` | 1 failed / 302 | 1 failed / 302 |
| `@project/web` | 3 failed / 264 | 3 failed / 264 |

The four remaining failures are the pre-existing ones awaiting the server and
web pack wiring; none are new. Typecheck passes across all five packages,
hygiene passes, eslint is clean.

## Follow-Ups

- **Medium armour has no representative.** Scale mail, chain shirt, half plate
  and breastplate are all placeholders. Until one is authored, the medium branch
  of the taxonomy is untested by construction.
- **Armour proficiency is still unchecked.** `proficiencyId` remains a free
  string, and nothing compares a worn item's category against what the character
  is proficient in. `armorCategory` is the half of that comparison that now
  exists.
- **Stealth disadvantage is authored per-item.** With a declared category it
  could become a rule about heavy and medium armour rather than a modifier
  repeated on each entry.
