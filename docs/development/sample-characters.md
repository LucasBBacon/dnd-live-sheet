# Sample characters

Twenty-one fixture characters for exercising the live sheet against a real
database, in two sets:

- **The coverage set** (`…0110`–`…0119`) fills the sheet. Between them the ten
  reach every class, race, equipment slot, reset condition and hit point
  state. They live in `packages/database/src/seedSampleCharacters.ts`.
- **The scenario set** (`…0120`–`…0130`) stages the hand checks a unit test
  cannot reach: a level-up one level away, a divergence that needs two tabs,
  a Tier 2 pass with nothing yet to verify against, or data the UI cannot
  create. Each has a script under [Live checks](#live-checks). They live in
  `packages/database/src/sampleScenarioCharacters.ts`.

All twenty-one sit in the **Dev Smoke Campaign**
(`00000000-0000-0000-0000-000000000001`), owned by `dev-user-1` — the id the
web client sends as `x-tester-id`.

## Running it

```bash
pnpm --filter @project/database db:seed:samples
```

Re-running is safe, and it is also how you reset. Character rows are
upserted, their ledgers are cleared and rewritten, and no character outside
the twenty-one ids is read or modified. A level-up check consumes its staging
character, so re-run the seed before trying it again.

The server serves rules from `core_rule_packs`, not from the pack's JSON, and
caches the snapshot. After a pack change, import it, re-seed, and restart the
server:

```bash
pnpm --filter @project/database db:import-pack --yes
pnpm --filter @project/database db:seed:samples
```

`db:import-pack` truncates with CASCADE, which deletes **every** character —
the samples included, which is why the seed follows it.

## The coverage set

Each is reachable at `http://localhost:5173/character/<id>`.

| Character | Lvl | Build | HP | What it covers |
| --- | --- | --- | --- | --- |
| [Pip Underbough](http://localhost:5173/character/00000000-0000-0000-0000-000000000110) | 1 | Rogue 1 | 10/10 | Floor case: no subclass yet, untouched hit points, sparse slots |
| [Sister Aveline Cor](http://localhost:5173/character/00000000-0000-0000-0000-000000000111) | 3 | Cleric 3 (Life) | 17/24 | Subrace-less race, a fully spent short-rest pool, sword and board |
| [Grimnar Stonefist](http://localhost:5173/character/00000000-0000-0000-0000-000000000112) | 5 | Barbarian 5 (Berserker) | 22/55 | Bloodied below half, attuned gloves, renamed weapon, empty body slot |
| [Lyra Silverstring](http://localhost:5173/character/00000000-0000-0000-0000-000000000113) | 7 | Bard 6 (Lore) / Rogue 1 | 45/45 | Multiclass ledger, attuned cloak, partially spent pool, renamed instrument |
| [Vaerix the Ashen](http://localhost:5173/character/00000000-0000-0000-0000-000000000114) | 9 | Paladin 9 (Devotion) | 61/85 | Two magic items, one very large partial pool, three resources at once |
| [Nyx Vale](http://localhost:5173/character/00000000-0000-0000-0000-000000000115) | 11 | Warlock 8 (Fiend) / Sorcerer 3 (Draconic) | 1/80 | One hit point from death, two drained pools, a container holding stacks |
| [Master Ko Shen](http://localhost:5173/character/00000000-0000-0000-0000-000000000116) | 12 | Monk 12 (Open Hand) | 99/99 | No armour at all, half-spent pool, attuned boots, one unattuned item waiting |
| [Thistle Quickfoot](http://localhost:5173/character/00000000-0000-0000-0000-000000000117) | 14 | Wizard 14 (Evocation) | 52/86 | Custom background, ad-hoc granted traits, a dawn-recharging item pool |
| [Kaelen Duskwarden](http://localhost:5173/character/00000000-0000-0000-0000-000000000118) | 17 | Ranger 12 (Hunter) / Druid 5 (Land) | 0/152 | Downed at zero, high-level multiclass, big ammunition stack |
| [Dame Sable Orrin](http://localhost:5173/character/00000000-0000-0000-0000-000000000119) | 20 | Fighter 20 (Battle Master) | 224/224 | Ceiling case: every slot filled, attunement at the cap of three |

## The scenario set

| Character | Lvl | Build | HP | Kind | Backlog |
| --- | --- | --- | --- | --- | --- |
| [Quill Ashgrove](http://localhost:5173/character/00000000-0000-0000-0000-000000000120) | 2 | Rogue 2 | 17/17 | Level-up staging | #65b, #31a, #66, #70 |
| [Brannoc Hale](http://localhost:5173/character/00000000-0000-0000-0000-000000000121) | 3 | Fighter 3 (Champion) | 31/31 | Level-up staging | #88, #94, #103, #104, #106, #24 |
| [Isolde Varn](http://localhost:5173/character/00000000-0000-0000-0000-000000000122) | 4 | Warlock 4 (Archfey) | 20/31 | Level-up and dip staging | #81, #77, #36, #31b |
| [Ursk Gravemaw](http://localhost:5173/character/00000000-0000-0000-0000-000000000123) | 5 | Paladin 5 (Vengeance) | 6/54 | Two tabs | #92, #93 |
| [Tamsin Burrowdeep](http://localhost:5173/character/00000000-0000-0000-0000-000000000124) | 6 | Barbarian 6 (Totem Warrior) | 30/65 | Two tabs, socket | #76, #97, #99, #101 |
| [Hesk Mossgather](http://localhost:5173/character/00000000-0000-0000-0000-000000000125) | 8 | Druid 8 (Moon) | 41/59 | Wild-shape preview | #62, #80 |
| [Seraphine Dusk](http://localhost:5173/character/00000000-0000-0000-0000-000000000126) | 9 | Wizard 9 (Divination) | 21/29 | Wizard preview | #86, #107, #31a, #83 |
| [Kestrel Vey](http://localhost:5173/character/00000000-0000-0000-0000-000000000127) | 7 | Sorcerer 7 (Wild Magic) | 44/44 | Sorcery-points preview | #62, #31b |
| [Brother Mote](http://localhost:5173/character/00000000-0000-0000-0000-000000000128) | 11 (column: 12) | Cleric 11 (Tempest) | 95/80 | Broken on purpose | #95, #109, #98 |
| [Orrik Stonehide](http://localhost:5173/character/00000000-0000-0000-0000-000000000129) | 13 | Fighter 13 (Rune Knight) | 134/134 | Broken on purpose | #102 |
| [Maren Solace](http://localhost:5173/character/00000000-0000-0000-0000-000000000130) | 3 | Cleric 3 (Light) | 24/24 | Spell casting | #31b, #83 |

Ids run `…000000000110` through `…000000000130`; the last two digits are the
row. HP is current over the derived maximum, as the sheet shows it.

## Coverage, both sets

- **Levels** 1–9, 11–14, 17 and 20.
- **Races** all nine, with and without a subrace — every subrace except eight
  of the ten dragonborn colours — plus a Goliath, which the pack does not
  author.
- **Classes** all twelve; three characters multiclassed.
- **Subclasses** 20 of the pack's 40 (21 once Quill's check takes Arcane
  Trickster), plus a Rune Knight the pack does not author.
- **Feats** Alert (Isolde) and Tough (Ursk).
- **Backgrounds** all four preset rows, all five stubs, and two custom
  backgrounds (Thistle, Hesk).
- **Health** full, lightly wounded, bloodied, 6, 1, 0, and above the maximum.
- **Slots** every one the client knows: `body`, `main_hand`, `off_hand`,
  `head`, `cloak`, `amulet`, `ring_1`, `boots`, `gloves`, `backpack`.
- **Attunement** none, one, two, three, and four against the cap of three.
- **Resources** all five reset conditions — `short_rest`, `long_rest`,
  `long_rest_half`, `dawn`, `never`; partly spent spell slots; pools stored
  with no rule behind them; a pool stored above its maximum.

## Broken on purpose

Two scenario characters hold data the UI cannot create. Do not tidy them.

- **Brother Mote.** `characters.level` is 12 while his class ledger sums to 11
  (the roster's `levelColumn`). His 1st-level slots are stored at 6 of 4, his
  hit points at 95 of 80, and four items are attuned against the cap of
  three.
- **Orrik Stonehide.** A Goliath (`race_goliath`), a Rune Knight
  (`subclass_fighter_rune_knight`) and a Hermit (`background_hermit`) — all
  seed stubs the pack does not author — carrying two magic-item stubs and race
  and subclass traits that resolve to nothing. He declares the
  `unknown_race` and `unknown_subclass` save issues he raises
  (`expectedIssues`), and the invariant tests hold him to exactly those.

## Live checks

Each script names what you see **today** and what a fix should change. When a
fix lands, update its line here in the same branch. Reset a character by
re-running the seed. Stored values can be read with
`GET http://localhost:3000/api/character/<id>` and the header
`x-tester-id: dev-user-1`.

### Quill Ashgrove — `…0120`

1. **Skills.** No skill shows doubled proficiency: Expertise cannot be stored
   yet (#66). *After #66:* two skills at double proficiency.
2. **Attacks.** The Combat widget's attacks carry no Sneak Attack die (the
   rogue pass).
3. **Background.** Folk Hero is a seed stub with no grants; nothing on the
   sheet comes from it (#70).
4. **Level Up → Rogue 3 → Arcane Trickster.** The Choices step asks for three
   Arcane Trickster cantrips and offers all 111 pack spells, because every
   spell is a level-0 placeholder. No spells-known question is asked (#31a).
   *After #31a:* only wizard cantrips are offered, and a spells-known question
   appears.
5. **After submitting.** 1st-level spell slots appear in the Features widget
   and an Arcane Trickster row in the Spellcasting widget. Neither existed at
   rogue 2: the caster level comes from the subclass, a path no web test covers
   (#65b).

### Brannoc Hale — `…0121`

1. **Dueling.** Attack with the longsword: the damage has no +2. Dueling
   requires `status_wielding_one_handed_only`, which nothing emits (#24).
   *After #24:* +2 damage while the off hand is empty.
2. **Dwarven Toughness.** The maximum is 31: 22 rolled, +6 Constitution, +3
   from Dwarven Toughness's +1 per level.
3. **Level Up → Fighter 4 (#88, #103 and #104, regression checks).** Take
   the average, 6, from the hit point step's d10, and take the increase as +1
   CON and +1 STR. The review step asks the server and shows 31 → 44 (+13) —
   the gain the level-up stores, CON 16 raising the three earlier levels
   included. Submit: as the wizard closes, the sheet reads 44/44 with STR 17
   and CON 16, no reload needed. Before #104 it kept the old character until
   a reload; before #103 the increase was never stored at all.
4. **Again, in the same tab (#104, a regression check).** Level Up once more
   → Fighter 5: the wizard asks for total level 5 and the level-up succeeds.
   Before #104 the stale sheet asked for 4 and was refused.
5. **A crafted increase (#106, a regression check).** From the browser
   console, both routes refuse an increase that does not total 2:

   ```js
   const body = { targetClassId: "class_fighter", newTotalLevel: 4, hpRoll: 6,
     asiChoices: [{ stat: "CON", value: 3 }] };
   const post = (path) => fetch(
     `http://localhost:3000/api/character/00000000-0000-0000-0000-000000000121/${path}`,
     { method: "POST", body: JSON.stringify(body),
       headers: { "content-type": "application/json", "x-tester-id": "dev-user-1" } },
   ).then(async (response) => [response.status, (await response.json()).error]);
   await Promise.all([post("level-up/preview"), post("level-up")]);
   ```

   Both answer 400, "Invalid character choices: ability score increases must
   total 2, not 3." Before #106 the level-up stored the +3.
6. **Double submit (#94, a regression check).** Re-seed, repeat step 3, and double-click the final
   submit. If the button disables after one click, send two requests at once
   from the browser console instead:

   ```js
   const body = { targetClassId: "class_fighter", newTotalLevel: 4, hpRoll: 6,
     asiChoices: [{ stat: "CON", value: 1 }, { stat: "STR", value: 1 }] };
   await Promise.all([1, 2].map(() => fetch(
     "http://localhost:3000/api/character/00000000-0000-0000-0000-000000000121/level-up",
     { method: "POST", body: JSON.stringify(body),
       headers: { "content-type": "application/json", "x-tester-id": "dev-user-1" } },
   ).then((response) => response.status)));
   ```

   **Today:** the first succeeds; the second waits for it, then is refused
   (400, "newTotalLevel 4 does not match the class ledger (5)"), so he gains
   one level's hit points.

### Isolde Varn — `…0122`

1. **Alert.** Initiative includes Alert's +5 — the first feat on any sample.
2. **Level Up → Warlock 5.** The Choices step asks for **one** new invocation.
   Voice of the Chain Master is available (she holds Pact of the Chain);
   Thirsting Blade is disabled with "needs Pact of the Blade", and Agonizing
   Blast is available: she knows Eldritch Blast. This is the #81 regression check.
3. **After submitting.** The pact slot level rises to 3rd.
4. **Familiar.** Pact of the Chain summons nothing: the engine knows no
   familiar actor (#36).
5. **Dip menu (#77, a regression check).** Level Up, choose a new class:
   wizard is offered. Her stored Intelligence is 12 and the high elf's +1
   makes 13, the wizard's requirement, so the check passes only when it reads
   final scores; before #77's fix it read the stored 12 and refused. (Charisma
   15 meets the warlock's own requirement.) Cancel without submitting.
6. **Eldritch Blast (#31b).** The Spells panel lists Eldritch Blast (Warlock ·
   At will). Cast it: one attack roll at +4 and a 1d10 force damage roll, both
   labelled Beam 1. After step 2's level-up to 5, a cast rolls Beam 1 and
   Beam 2, each with its own attack. Minor Illusion is listed as not yet
   automated. Dancing Lights (her High Elf cantrip) casts without asking,
   because her component pouch covers it; End Concentration in Active effects
   ends it.

### Ursk Gravemaw — `…0123`

1. **Tough.** The maximum is 54: 34 rolled, +10 Constitution, +10 from Tough.
2. **Two tabs (#92).** Open the sheet in tabs A and B; both show 6/54 and
   Relentless Endurance 1 of 1.
   - In A, take 20 damage: Relentless Endurance fires, and A shows 1 hit point
     with the charge spent. B follows the broadcast to 1; its own charge is
     untouched.
   - In A, take 20 damage again: the charge is spent, so A sends the full
     lethal delta and the server stores 0.
   - Look at B, and do nothing in it. When the server's 0 arrived, B ran its
     own, never-synced Relentless Endurance and shows 1, while A and
     `GET /api/character/…0123` show 0. Taking damage in B now would drop it to
     0 as well and erase the divergence.

   **Today:** the tabs disagree. *After #92:* trigger resolution is
   server-side, and every tab shows the server's answer.
3. **A heal from the stale tab (#93, a regression check).** Heal from B in the
   Combat widget, or drink one of his two Potions of Healing: the heal reaches
   the server raw, and any notice reports what actually applied.
4. **Dip menu.** Level Up, choose a new class: sorcerer, warlock and bard are
   allowed (CHA 14; paladin's own STR 13 and CHA 13 are met), and wizard is
   refused on Intelligence 8. None of his thresholds moves between stored and
   final scores, so this is an observation, not the #77 check — that is
   Isolde's step 5. Cancel without submitting.

### Tamsin Burrowdeep — `…0124`

1. **Eagle Dash (#76).** Rage. Eagle Dash is offered. Equip the plate from the
   backpack into the body slot: Eagle Dash disappears, because
   `status_wearing_heavy_armor` now reaches the sheet's states.
2. **A second tab (#101, a regression check).** Stow the plate again (or
   re-seed) so it starts in the backpack. With tab B open, equip the plate from
   B: tab A's actions update without a reload. Attune the Cloak of Protection
   from B: A's armour class rises by 1.
3. **A crafted intent (#97).** With the plate worn, emit `ACTION_INTENT` for
   `action_eagle_dash` by hand (the payload shape is in
   `apps/server/src/gateway/__tests__/socket.actionIntent.test.ts`, "does not
   allow Eagle Dash while wearing heavy armour"). **Today:** the reply is
   `executed: true`, with nothing applied. *After #97:* a distinct "blocked"
   result.
4. **Dismissing Rage (#99).** Dismiss Rage from the Active Effects widget while
   wearing the plate. It works today, because no authored ender carries a
   state predicate; this is where #99 would show if one ever did.
5. **A heavy weapon on a Small creature.** The maul carries no disadvantage:
   nothing models the rule.

### Hesk Mossgather — `…0125`

1. **Spell slots.** Features shows four slot pools with 2 of 4, 3 of 3, 1 of 3
   and 2 of 2 left — seeded rows, which the sheet shows as stored.
2. **Wild Shape (#62).** Not shown. The stored `trait_wild_shape` row (1 of 2)
   has no rule behind it, and the sheet drops a pool it cannot resolve.
   *After the druid pass:* a two-charge short-rest pool.
3. **Spells.** No spell is listed anywhere — he has picked none; spell
   choices beyond cantrips are not asked until #31a.
4. **The custom background (#80).** "Grove Warden" carries the acolyte's
   two-language block and the soldier's gaming-set block. Neither is ever
   asked — Level Up → Druid 9 and look at the Choices step.

### Seraphine Dusk — `…0126`

1. **The maximum (#86, a regression check).** The sheet shows 29: Constitution
   8 is -1 per level, 38 rolled - 9. Before #86 the engine floored the modifier
   at +1 and showed 47.
2. **Pools.** Five slot pools (3 of 4, 1 of 3, 2 of 3, 3 of 3, 0 of 1); Faerie
   Fire (Drow Magic) spent and Darkness available, both `dawn`. Portent and
   Arcane Recovery are stored but not shown — stubs with no rule.
3. **Drow Magic.** Spend Darkness, then take a short rest: it stays spent.
4. **Spells (#31b, #83).** The Spells panel lists Dancing Lights, Faerie Fire
   and Darkness under Drow Magic. Dancing Lights asks for its material: her
   crystal is a wizard's focus, which does not serve a racial spell. Confirm,
   and Active effects shows it Concentrating. Faerie Fire is refused ("No uses
   left"), since its use is spent. Take a long rest and cast it: the results
   read "Faerie Fire: DEX save DC 12 · a success negates it · 20-foot cube",
   Dancing Lights gives way to Faerie Fire, and End Concentration clears it.
   Darkness is not yet automated.
5. **Race stubs.** Sunlight Sensitivity changes nothing (a race stub, #30).
6. **A low roll (#107, a regression check).** From the browser console, ask
   the preview for a roll of 1 at wizard 10:

   ```js
   await fetch("http://localhost:3000/api/character/00000000-0000-0000-0000-000000000126/level-up/preview",
     { method: "POST",
       body: JSON.stringify({ targetClassId: "class_wizard", hpRoll: 1 }),
       headers: { "content-type": "application/json", "x-tester-id": "dev-user-1" } },
   ).then((response) => response.json());
   ```

   It answers 29 → 30 (+1): the roll is stored as 2, so the level adds the
   rules' minimum of one hit point. Before #107 it answered +0.

### Kestrel Vey — `…0127`

1. **Pools (#62).** Four slot pools (4 of 4, 2 of 3, 1 of 3, 1 of 1) and a spent
   Breath Weapon. Sorcery Points (3 of 7) and Tides of Chaos (0 of 1) are
   stored but not shown: no rule. *After the sorcerer pass:* Sorcery Points
   appear.
2. **Breath Weapon.** A short rest restores it; the silver breath deals cold
   damage.
3. **Stubs.** Wild Magic Surge and Tides of Chaos do nothing yet; Careful and
   Extended Spell are stored in `choices`.
4. **The breath's save (#31b, a regression check).** Using Cold Breath reports
   "Cold Breath: CON save DC 13 · half damage on a success · 15-foot cone" -
   the targets' save, not hers - and rolls 3d6 cold, the dice for level 7.
   Before feat/spell-casting it rolled her own Constitution save and 2d6.

### Brother Mote — `…0128`

1. **The level (#95 and #109, regression checks).** The level column says
   12; the class ledger says Cleric 11, and the sheet shows 11 - the header
   badge reads the ledger. Level Up and submit: it succeeds. The wizard takes
   his total from the ledger and asks for 12, which the server accepts; the
   ledger reaches Cleric 12 and now agrees with the column. Re-seed to
   restore the drift.
2. **An over-maximum pool (#98).** 1st-level slots show 4 of 4, though 6 are
   stored. Spend one: still 4. Spend another: still 4 — two spends the player
   cannot see. *After #98:* a stored total cannot exceed its maximum. A long
   rest resets the pool to 4 of 4 and quietly repairs the setup; re-seed to
   restore it.
3. **Over-maximum hit points.** 95 of 80. The next damage or heal is clamped
   against the maximum (#89).
4. **Four attunements.** Cloak, ring, headband and boots are all attuned
   against a cap of three. Record what the Items widget shows, whether it
   offers a fifth, and what unattuning one then allows.

### Orrik Stonehide — `…0129`

These checks had no known answer when he was written; whatever happens is the
finding. Record it as a backlog item rather than fixing it. The first load, on
2026-09-23, answered two of them.

1. Does the sheet load, and does the room join report an error? **It loads,
   joins the live session, and logs no console errors.**
2. What do the race (Goliath, speed 30) and subclass (Rune Knight) show, given
   the snapshot knows neither? None of his race or subclass traits resolve,
   and the Giant's Might pool he stores has no rule.
3. The Belt of Hill Giant Strength is attuned with no slot to wear it in: does
   Strength read 21? **No — it reads 20, and the Items widget lists the belt
   without its "Attuned" marker (#102).**
4. Level Up: what do the level-up wizard and its dip menu do with a subclass
   the snapshot does not have?

### Maren Solace — `…0130`

1. **Burning Hands (#31b).** The Spells panel lists Burning Hands and Faerie
   Fire (Cleric · Slot), both always prepared through Light Domain Spells.
   Cast Burning Hands: the picker offers "1st level (1 left) · 3d6" and "2nd
   level (2 left) · 4d6". Take the 1st: the results read "Burning Hands: DEX
   save DC 13 · half damage on a success · 15-foot cone" with 3d6 fire.
2. **The spent slot.** Cast again: the 1st level is gone from the picker.
   Take the 2nd: 4d6.
3. **Faerie Fire.** Cast it with the remaining 2nd-level slot: "DEX save DC
   13 · a success negates it · 20-foot cube", and Active effects shows it
   Concentrating. End Concentration clears it.

## Reference stubs

The roster points at content the pack has not reached. Rather than leave the
foreign keys dangling, the seed inserts placeholder rows stamped
`pack_id = 'dev_sample_pack'`:

- **1 race** — Goliath.
- **8 subclasses** — Oath of Devotion, Way of the Open Hand, School of
  Evocation, The Fiend, Hunter, Thief and Draconic Bloodline, which the pack
  now authors (so those seven inserts are no-ops), and Rune Knight, which it
  does not.
- **5 backgrounds** — Sage, Folk Hero, Outlander, Charlatan, Hermit.
- **15 items** — potions, a spell scroll, a wand, `+1` weapon and armour, the
  wondrous items that fill the head, cloak, amulet, ring, gloves and boots
  slots, a Frost Brand greatsword and a Belt of Hill Giant Strength.

Every stub insert is `onConflictDoNothing`: once the real row for an id
exists, it wins and the seed leaves it alone. To list them:

```sql
SELECT id, name FROM items WHERE pack_id = 'dev_sample_pack';
```

## Worth knowing

- **The sheet hides a pool it has no rule for.** `useFeatures`
  (`apps/web/src/hooks/useFeatures.ts`) drops a stored `character_resources`
  row the rule snapshot cannot resolve. Several samples store such pools —
  Wild Shape, Sorcery Points, Tides of Chaos, Portent, Arcane Recovery, Giant's
  Might, Channel Divinity and others — so the passes that author them (#62)
  find state waiting.
- **A seeded pool is what the sheet shows.** The gateway materialises only the
  pools a character is *missing* (`apps/server/src/gateway/socket.ts`), so a
  seeded row keeps its stored charges.
- **Trait ids on `character_traits` are deliberately a mix** of ids the pack
  defines and ids it does not. The column carries no foreign key, and an
  unresolved grant is exactly what the sheet has to survive while the pack is
  incomplete. The background rows among them are inert (#70).
