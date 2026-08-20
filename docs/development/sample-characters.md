# Sample characters

Ten fixture characters for exercising the live sheet against a real database.
They are written by `packages/database/src/seedSampleCharacters.ts` and live in
the existing **Dev Smoke Campaign**
(`00000000-0000-0000-0000-000000000001`), owned by `dev-user-1` — the id the web
client sends as `x-tester-id`.

## Running it

```bash
pnpm --filter @project/database db:seed:samples
```

Re-running is safe. Character rows are upserted, their ledgers are cleared and
rewritten, and no character outside the ten ids below is read or modified.

## Serve them with the database provider

The API defaults to `REFERENCE_SOURCE=static`, which resolves item metadata from
the checked-in static dictionary rather than from PostgreSQL. Under that default
the seeded magic items have no rule behind them and render as bare gear. Start
the server against the database instead:

```bash
REFERENCE_SOURCE=db pnpm --filter @project/server dev
```

With `db` selected the rules snapshot carries all 105 items and 38 weapons,
including every item below with its slot, attunement flag, weight, container
capacity and modifiers.

## The roster

Each is reachable at `http://localhost:5173/character/<id>`.

| Character | Lvl | Build | HP | What it covers |
| --- | --- | --- | --- | --- |
| [Pip Underbough](http://localhost:5173/character/00000000-0000-0000-0000-000000000110) | 1 | Rogue 1 | 10/10 | Floor case: no subclass yet, untouched hit points, sparse slots |
| [Sister Aveline Cor](http://localhost:5173/character/00000000-0000-0000-0000-000000000111) | 3 | Cleric 3 (Life) | 17/24 | Subrace-less race, a fully spent short-rest pool, sword and board |
| [Grimnar Stonefist](http://localhost:5173/character/00000000-0000-0000-0000-000000000112) | 5 | Barbarian 5 (Berserker) | 22/55 | Bloodied below half, attuned gloves, renamed weapon, empty body slot |
| [Lyra Silverstring](http://localhost:5173/character/00000000-0000-0000-0000-000000000113) | 7 | Bard 6 (Lore) / Rogue 1 | 45/45 | Multiclass ledger, attuned cloak, partially spent pool, renamed instrument |
| [Vaerix the Ashen](http://localhost:5173/character/00000000-0000-0000-0000-000000000114) | 9 | Paladin 9 (Devotion) | 61/85 | Two magic items, one very large partial pool, three resources at once |
| [Nyx Vale](http://localhost:5173/character/00000000-0000-0000-0000-000000000115) | 11 | Warlock 8 (Fiend) / Sorcerer 3 (Draconic) | 1/77 | One hit point from death, two drained pools, a container holding stacks |
| [Master Ko Shen](http://localhost:5173/character/00000000-0000-0000-0000-000000000116) | 12 | Monk 12 (Open Hand) | 99/99 | No armour at all, half-spent pool, attuned boots, one unattuned item waiting |
| [Thistle Quickfoot](http://localhost:5173/character/00000000-0000-0000-0000-000000000117) | 14 | Wizard 14 (Evocation) | 52/86 | Custom background, ad-hoc granted traits, a dawn-recharging item pool |
| [Kaelen Duskwarden](http://localhost:5173/character/00000000-0000-0000-0000-000000000118) | 17 | Ranger 12 (Hunter) / Druid 5 (Land) | 0/152 | Downed at zero, high-level multiclass, big ammunition stack |
| [Dame Sable Orrin](http://localhost:5173/character/00000000-0000-0000-0000-000000000119) | 20 | Fighter 20 (Battle Master) | 224/224 | Ceiling case: every slot filled, attunement at the cap of three |

Ids run `…000000000110` through `…000000000119`, so the last digit is the row
number in the table above.

## Coverage

Between them the ten cover:

- **Levels** 1, 3, 5, 7, 9, 11, 12, 14, 17, 20.
- **Races** all nine, with and without a subrace.
- **Classes** ten of the twelve, four of them multiclassed.
- **Backgrounds** all four preset rows plus four stubs, and one custom background
  with `character_custom_traits` grants.
- **Health** full, lightly wounded, bloodied, one hit point, and zero.
- **Slots** every one the client knows: `body`, `main_hand`, `off_hand`, `head`,
  `cloak`, `amulet`, `ring_1`, `boots`, `gloves`, `backpack`.
- **Attunement** none, one, and the cap of three.
- **Resources** all five reset conditions — `short_rest`, `long_rest`,
  `long_rest_half`, `dawn`, `never`.

## Reference stubs

The roster points at content the pack has not reached yet. Rather than leave the
foreign keys dangling, the script inserts placeholder rows stamped
`pack_id = 'dev_sample_pack'`:

- **7 subclasses** — Oath of Devotion, Way of the Open Hand, School of Evocation,
  The Fiend, Hunter, Thief, Draconic Bloodline.
- **4 backgrounds** — Sage, Folk Hero, Outlander, Charlatan.
- **13 items** — potions, a spell scroll, a wand, `+1` weapon and armour, and the
  wondrous items that fill the head, cloak, amulet, ring, gloves and boots slots.

Every stub insert is `onConflictDoNothing`. When you author the real row for one
of these ids, it wins and the script becomes a no-op for that entity. To list or
clear them:

```sql
SELECT id, name FROM items WHERE pack_id = 'dev_sample_pack';
```

Trait ids on `character_traits` are deliberately a mix of ids the compendium
already defines and ids named by convention that it does not. That column carries
no foreign key, and an unresolved grant is exactly what the sheet has to survive
while the pack is incomplete.

## Known gaps this data will surface

These are pre-existing and not caused by the fixture:

- **Slot vocabulary is split.** `character_inventory` and the client use `body`
  for worn armour (migration `0008_slot_body_rename.sql`), but the socket
  gateway still validates against `EQUIPMENT_SLOTS` in
  `packages/database/src/schema/operational.ts`, which lists `armor` and has no
  `body`. Dragging armour onto the body slot round-trips through
  `character:item_equipped` and fails with "Slot contention failure".
- **Only weapons and armour can be equipped at all.**
  `isValidTargetSlotForItem` in `apps/server/src/gateway/socket.ts` returns
  `false` for every other type, so the wondrous items seeded into `head`,
  `cloak`, `amulet`, `ring_1`, `gloves` and `boots` display correctly but cannot
  be moved by the UI.
- **Rests only restore two pools.** `RESOURCE_DICTIONARY` in
  `packages/engine/src/rules/resourceDictionary.ts` defines rules for
  `trait_action_surge` and `trait_second_wind` only; `RestEngine.applyRest`
  leaves a resource with no rule behind it exactly as it is. Rage, Ki, Bardic
  Inspiration and the rest will not refill on a rest until the pack authors them.
