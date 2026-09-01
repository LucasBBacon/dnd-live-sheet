# Item actions: rules an object carries, and the ones it can only report

Date: 2026-09-01
Status: approved, ready to implement

## Problem

An item cannot carry a rule that the character *does*.

`EquipmentDefinitionSchema` has `modifiers`, so an item can change a number
passively — a Ring of Protection adds 1 to AC. It has no `actions`, so an item
cannot grant something the player takes. `CharacterEngine` builds its action
list from three sources and nothing else:

```ts
// characterEngine.ts:428
const actions: ActionGrant[] = [
  ...STANDARD_ACTIONS,
  ...activeTraits.flatMap((t) => t.actions || []),
];
// ...then weapon attacks, but only for inventory with a hand slot
```

So a vial of acid, whose entire rule is *"make a ranged attack, 2d6 acid"* — a
rule this engine already runs perfectly well for a thrown dagger — has nowhere
to put it. Its rule lives in `lore.fullText` and is read by a human. The "Use 1"
button on the inventory row decrements the stack and does nothing else.

That affects 21 of the 120 non-weapon, non-armour items in the core pack. They
divide by what the engine is actually capable of:

| Tier | Items | Engine can run it |
| --- | --- | --- |
| Throw and roll | acid vial, alchemist's fire, holy water, oil flask | Yes — the same shape as a thrown weapon |
| Affects the character | antitoxin, potion of healing | Antitoxin yes; the potion needs an effect that does not exist |
| Affects someone else | caltrops, ball bearings, hunting trap, basic poison | No |
| Not expressible | crowbar, magnifying glass, portable ram | No |

The last two tiers are not oversights, and this design does not try to close
them:

- **`apply_effect` writes to the character's own `EffectManager`**, and hostiles
  exist only as a `targetLabel` string. Caltrops cannot make a creature save.
- **`SaveEffectSchema` rolls a bare d20 for the character** (`actionResolver.ts:531`).
  It has no way to *report* a DC for someone else to roll against, so
  "DC 15 Dexterity saving throw" can only ever be words.
- **`ModifierTargetSchema` has no generic ability-check target** — only
  `STEALTH_CHECK`. "Advantage on Strength checks where the crowbar's leverage
  can be applied" is not authorable, and arguably should not be: the condition
  is a judgement call, not a state.

This is the same wall the net hit, and `specialNote` is how that was answered.

## Decisions taken

Five questions were settled before this design:

1. **Where item use happens: the inventory row, not the action list.** Items
   stay inventory; the combat action list stays combat. `liveSheet.actions` is
   unchanged by this work.
2. **Using an item spends the action economy.** It routes through
   `ActionResolver` like everything else, under the sheet's existing
   `economyPolicy: "track"` — which warns about an overdraft rather than
   refusing, because tables bend the economy constantly.
3. **Delivery is declared in the authored data and cross-checked by tests**, not
   inferred from whatever the runtime happened to return. Section 5 settles what
   carries that declaration: the effect type itself, rather than a second field
   restating it.
4. **The engine's effect vocabulary grows by one `heal` effect.** The server
   already applies HP deltas (`combatService.ts:33`); the resolver has no way to
   produce one.
5. **Fourteen items get actions.** The six the engine can run, plus the eight
   that genuinely are "you spend an action to do this" but resolve at the table.
   Facts *about* an object — a rope's 2 hit points, a lock's DC 15 — stay as
   lore, because nobody takes an action to have them.

## Architecture

### 1. Authoring shape

`EquipmentDefinitionSchema` gains one field, beside the `modifiers` it already
carries:

```ts
actions: z.array(ActionGrantSchema).default([]),
```

It goes on `EquipmentDefinitionSchema` rather than `CoreEquipmentSchema` because
`importPack.ts:178` projects the base definition wholesale as `itemRule`:

```ts
itemRule: EquipmentDefinitionSchema.omit({ weapon: true }),
```

so item actions reach the engine by the same route modifiers already do, with no
projection change. `lore`, `isBundle` and `implementation` live on
`CoreEquipmentSchema` and are correctly stripped; `actions` must not be, and
putting it on the base is what guarantees that.

The acid vial then authors:

```json
{
  "id": "action_item_acid_vial_throw",
  "name": "Throw Acid",
  "activation": "action",
  "consumesSelf": true,
  "effect": {
    "type": "attack",
    "attackType": "ranged_weapon",
    "attackStat": "DEX",
    "range": 20,
    "damage": [
      { "sourceName": "Acid", "baseDice": "2d6", "damageType": "acid" }
    ]
  }
}
```

### 2. Spending the item itself

`ActionGrantSchema` gains `consumesSelf: z.boolean().default(false)`, alongside
the `consumesAmmo` it already has. The two are kept apart for the reason
`consumesAmmo` and `consumesResource` are: ammunition is a stack the player
picks from, and *self* is the one stack the player has already picked by
pressing Use on that row.

No new inventory machinery. `InventoryLedger` already keys on `instanceId`, and
already documents why it needs no restore counterpart:

> the resolver settles every unpredictable cost before it touches the inventory,
> so a deduction here is always the last thing to happen and never has to be
> unwound.

`consumesSelf` obeys the same ordering: the vial is deducted last, after the
economy and every roll have settled.

### 3. Gathering, without touching the combat list

`CharacterEngine` walks **carried** inventory — not only slotted, since a vial in
your pack is throwable — and emits a second list:

```ts
itemActions: Array<{ instanceId: string; action: ActionGrant }>
```

Keyed by instance rather than by item id, because two stacks of the same item are
two rows on the sheet and Use has to spend the right one.

`liveSheet.actions` is untouched. That is a load-bearing property, not an
incidental one, and it gets its own regression test.

### 4. Execution

The Use button sends `{ instanceId, actionId }`. The server resolves against
`itemActions` — a lookup parallel to the existing one at `socket.ts:301`, not a
change to it — and calls the same `ActionResolver.execute` with the same context.

Everything downstream is reused as-is. `ActionResult` already models all three
things a result needs to carry:

- `rollResults` — what the engine rolled
- `economyOverdrawn` — you had already acted, and we let you anyway
- `notes` — *"Rules the engine could not enforce, for the sheet to show the player"*

Outside combat this degrades on its own: `combatContext` is already optional on
`ActionExecutionContext`, and `settleAttack` returns `{spent: false}` without
one. With no combat running, Use simply rolls.

### 5. How an action declares its delivery

**The effect type is the declaration.** An effect the resolver acts on
(`attack`, `heal`, `apply_effect`) means the engine ran it. `no_effect` means it
did not, and `NoEffectSchema` already says so in as many words:

> Disengage, Help and Ready all spend your action, but what they *do* happens
> between the player and the table.

No `mode` enum is added. An enum beside the effect would restate what the effect
type already says, and would need a test asserting `mode: "engine"` ⟺
`type !== "no_effect"` — a test that exists only to police a redundancy. One
source of truth cannot desynchronise.

**`specialNote` moves up from the effect to the action, as `tableNote`.** Today
it lives on `AttackEffectSchema` alone, so a net can carry one and caltrops
cannot. Lifting it to `ActionGrantSchema` lets any action carry the rules the
engine could not enforce, and *deletes* a special case rather than adding one.
`AttackEffectSchema.specialNote` is removed; `weaponSynthesizer` populates
`tableNote` on the synthesized action instead, and the existing path onward to
`ActionResult.notes` and the sheet's "Special" block is unchanged.

**A refine requires it where it matters.** An action with `no_effect` and no
`tableNote` spends the player's turn and tells them nothing, so it fails to
parse. This is the shape `WeaponCapabilitySchema` already uses:

> a weapon with the special property must carry a specialNote saying what is
> special about it

**This is what makes a half-run rule expressible**, which is the case the whole
design turns on. Alchemist's fire is one action that both rolls and does not:

```json
{
  "activation": "action",
  "consumesSelf": true,
  "effect": { "type": "attack", "damage": [{ "baseDice": "1d4", "damageType": "fire" }] },
  "tableNote": "The target takes 1d4 fire damage at the start of each of its turns until a creature uses its action to make a DC 10 Dexterity check to extinguish the flames."
}
```

The sheet shows the roll it made and the rule the player still owes the DM, side
by side. Neither is disguised as the other.

### 6. The heal effect

One member added to `CoreEffectUnion`:

```ts
export const HealEffectSchema = z.object({
  type: z.literal("heal"),
  dice: DamageExpressionSchema,
});
```

`DamageExpressionSchema` is reused rather than a bare string because it already
parses flat and dice-plus-modifier forms — `"2d4+2"` is exactly what it was
built for in the weapon-damage-expressions work.

The resolver rolls it and returns the total as a roll result. It does **not**
mutate HP: `ActionResolver` returns rolls and never writes character state, and
this design does not make it start. The server applies the total through the
HP-delta path it already owns.

This is not speculative generality. It is the effect every healing spell needs
the moment spells are authored, and the potion is the smallest possible first
caller for it.

## Data changes

Fourteen items gain one action each.

| Item | Effect | Consumes self | Note |
| --- | --- | --- | --- |
| Acid (vial) | attack, 2d6 acid, range 20 | yes | — |
| Alchemist's fire | attack, 1d4 fire, range 20 | yes | ongoing burn, DC 10 Dex to end |
| Holy water | attack, 2d6 radiant, range 20 | yes | only fiends and undead take it |
| Oil (flask) | attack, no damage, range 20 | yes | covered in oil; +5 fire within 1 minute |
| Antitoxin | apply_effect, advantage on `POISON_SAVE` | yes | lasts 1 hour |
| Potion of healing | heal 2d4+2 | yes | — |
| Caltrops | no_effect | yes | DC 15 Dex, 1 piercing, speed −10 |
| Ball bearings | no_effect | yes | DC 10 Dex or prone |
| Poison, basic | no_effect | yes | coats one weapon or 3 pieces of ammunition; DC 10 Con, 1d4 poison |
| Hunting trap | no_effect | no | DC 13 Dex, 1d4 piercing, DC 13 Str to free |
| Healer's kit | no_effect | no | stabilise without a check; ten uses |
| Climber's kit | no_effect | no | anchored; 25 feet either way |
| Portable ram | no_effect | no | +4 on the Strength check; a helper grants advantage |
| Lantern, hooded | no_effect | no | hood lowered: dim light, 5-foot radius |

Basic poison earns its place by the same test as the rest: *"Applying the poison
takes an action."* What happens afterwards — the save, the damage, the minute of
potency — is the target's business and stays in the note.

The oil flask is a useful proof the shape holds: an attack that rolls to hit and
deals no damage, which `WeaponCapabilitySchema` already permits because the net
needed it.

### One lore gap to close first

`item_oil_flask` came through the legacy segment and its `fullText` is a
description, not a rule:

> A flask of oil for a lamp, or thrown as an improvised weapon. Burns for 6
> hours when used to fuel a lamp.

Its actual rules — throw it 20 feet, the target is covered in oil, 5 fire damage
if it takes any fire damage before the oil dries after a minute, or pour it to
cover a 5-foot square that burns for 2 rounds — are nowhere in the pack. The
action cannot be authored from data that is not there, so its lore is completed
in the same change. No other item in the table has this problem.

## Known limitations

Both are recorded rather than worked around.

**The healer's kit's ten uses have nowhere to live.** `ResourceSchema` pools are
per-character; two kits would share one pool, which is wrong in a way that is
worse than not modelling it. The uses go in the `tableNote`. Per-instance charges
are their own feature.

**Antitoxin's one hour does not map to a `durationType`.** The vocabulary offers
rounds and rests, not wall-clock time. It is authored as `manual` with the hour
in the note, so the player clears it themselves. Inventing `rounds: 600` would
be a lie: rounds only tick in combat, and this buff is usually drunk outside it.

## Testing

| Layer | Assertion |
| --- | --- |
| Schema | A `no_effect` action with no `tableNote` fails to parse. |
| Schema | An item action parses with `consumesSelf`, and `AttackEffectSchema` no longer accepts `specialNote`. |
| Pack | Every authored item action's id is unique, and the fourteen items each carry exactly one. |
| Engine | Carried-but-unslotted items produce `itemActions`; slotted weapons still do not appear there. |
| Engine | `liveSheet.actions` is byte-identical before and after the change — item actions do not leak into the combat list. |
| Engine | The vial is deducted exactly once, and only after the economy and rolls have settled. |
| Engine | The heal effect rolls its expression and returns the total as a roll result, mutating no HP. |
| Round-trip | Resolving alchemist's fire returns **both** `rollResults` and `notes`. |

The round-trip test is the one that proves the design: it is the assertion that a
half-run rule reaches the player as both halves.

## Out of scope

- **Hostile modelling.** Nothing here gives the engine a target that can roll a
  save. Every save-based item stays table-facing until it does.
- **Per-instance item charges.** See the healer's kit above.
- **A generic ability-check modifier target.** The crowbar, magnifying glass and
  portable ram want one; adding it is a modifier-vocabulary decision with
  consequences well beyond items.
- **The remaining seven rule-bearing items.** Hempen and silk rope hit points,
  chain hit points, lock and manacle DCs, and the crowbar's and magnifying
  glass's situational advantage stay as lore. They are facts about objects, not
  actions a character takes.
- **Light sources as engine state.** Torches, candles, lamps and lanterns imply a
  lighting model this engine does not have. Only the hooded lantern gets an
  action here, and only because lowering the hood costs an action.
