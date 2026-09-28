# The Third Ten Spells Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author Bane, Bless, Charm Person, Animal Friendship, Daylight, Create Food and Water, Banishment, Confusion, Blight and Cone of Cold as pack data, add a Circle of the Land (Desert) druid to check them on, and record the capabilities the blocked spells need.

**Architecture:** No schema, engine or web change. Each spell moves from `spells/unimplemented.json` to `spells/core.json` through the patch script, in a pattern the last two batches already checked live. A new scenario character and live-check scripts make three of them hand-checkable; the docs record the five capability gaps (#127–#131).

**Tech Stack:** TypeScript, pnpm + turbo monorepo; Zod 4 (`@project/shared`); Vitest; `@project/engine`; Express + socket.io (`apps/server`); React 19 + Zustand (`apps/web`).

**Spec:** `docs/superpowers/specs/2026-09-28-spells-third-ten-design.md`

## Global Constraints

- **Line endings.** Every existing file this plan touches is **CRLF**. Edit and Write emit LF, so after editing restore CRLF on each file you touched:
  ```bash
  node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' <file> <file> ...
  ```
  and measure (grep gives wrong answers for CR in this Git Bash):
  ```bash
  node -e 'for(const f of process.argv.slice(1)){const b=require("fs").readFileSync(f);let cr=0,lf=0,crlf=0;for(let i=0;i<b.length;i++){if(b[i]===13){cr++;if(b[i+1]===10)crlf++;}if(b[i]===10)lf++;}console.log(f,cr===0?"LF":(cr===crlf&&crlf===lf)?"CRLF":"MIXED")}' <file> ...
  ```
  Never use `sed -i`. `pnpm check:hygiene` fails on a mixed file.
- **Pack JSON is edited only through `packages/database/scripts/patchPackSegment.ts`**, run from `packages/database` as `pnpm exec tsx scripts/patchPackSegment.ts <segment> <patch>`. The script preserves each file's line endings. Never hand-edit pack JSON. Write patch files to your own scratch directory (`<scratchpad>` below).
- **Typecheck is a separate gate**, because Vitest ignores type errors. Per package: `pnpm --filter @project/shared typecheck`, `@project/engine`, `@project/database`, `@project/server` (all `tsc --noEmit`), and `pnpm --filter @project/web typecheck` (`tsc -b`). Never run `tsc -b` in `packages/database`.
- **CI has no `DATABASE_URL`.** Run the server and database suites as `DATABASE_URL= pnpm --filter @project/server test` and `DATABASE_URL= pnpm --filter @project/database test`.
- **Engine, database and server tests read the shipped pack** (`corePackLookup()`, `assembleCoreRulePack`), so authoring a spell can change what they see.
- **Rules text.** `fullText` is the SRD 5.1 wording; all ten spells are in the SRD. `shortDescription` and every `tableNote` are original wording, exactly as Task 1 gives them. The owner's `docs/development/spells-definitions.md` is OCR'd PHB text with typos (and Create Food and Water carries two stray sentences from Animate Dead); it is a reference, not the source to paste.
- Prose, comments and docs use British spelling. Identifiers stay exactly as they are.
- Commit messages end with a blank line and then the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Use `git commit -F -` with a heredoc. Branch is `feat/spells-third-ten`. Do not push.
- Touch only the files a task lists. If a test or typecheck fails in any other file, stop and report NEEDS_CONTEXT.
- **Scope.** The ten spells, the fixture and the docs. Building any of #122 or #127–#131 is out of scope.

Design decisions (owner, 2026-09-28) that bind every task:

1. **The ten:** Bane, Bless, Charm Person, Animal Friendship, Banishment, Confusion, Blight, Cone of Cold, Daylight, Create Food and Water.
2. **Live check:** Bless on Sister Aveline Cor (`…0111`, Life cleric 3), Bane on Ursk Gravemaw (`…0123`, Vengeance paladin 5), and a new Circle of the Land (Desert) druid 7 for Blight and Create Food and Water.
3. **Docs:** the guide gains the new examples and a blocked-capabilities list; the backlog records #127–#131.

## File Structure

| File | Change |
| --- | --- |
| `packages/database/data/packs/core_2014_pack/spells/core.json`, `spells/unimplemented.json` | the ten spells (T1) |
| `packages/database/src/__tests__/implementationMarkers.test.ts` | 24 authored ids (T1) |
| `packages/engine/src/pipeline/__tests__/spellSynthesizer.test.ts`, `characterEngine.test.ts`, `characterBootstraper.test.ts` | stub examples move from Bless to Cure Wounds (T1) |
| `packages/database/src/sampleScenarioCharacters.ts`, `seedSampleCharacters.ts` | Ashar Dunewind, a Desert Land druid 7 (T2) |
| `packages/database/src/__tests__/seedSampleCharactersImport.test.ts`, `apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts`, `sampleCharacterScores.test.ts` | roster pins (T2) |
| `docs/development/sample-characters.md` | the druid, and Aveline's and Ursk's spell steps (T2) |
| `docs/architecture/spell-authoring-guide.md`, `docs/TODO_BACKLOG.md` | T3 |

Baseline on `main` at 577a25b: shared 266, engine 1090, database 206, server 545, web 512 — **2619**.

---

### Task 1: Author the ten spells

**Files:**
- Modify (via the patch script only): `packages/database/data/packs/core_2014_pack/spells/core.json`, `spells/unimplemented.json`
- Modify: `packages/database/src/__tests__/implementationMarkers.test.ts` (the test `records which spells carry rules`)
- Modify: `packages/engine/src/pipeline/__tests__/spellSynthesizer.test.ts` (the test `lists a stub the character picked, and makes no action of it`)
- Modify: `packages/engine/src/pipeline/__tests__/characterEngine.test.ts` (the test `lists a stub without offering it as an action`)
- Modify: `packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts` (the test `rejects a High Elf's cantrip the block does not offer, or one too many`)

**Interfaces:**
- Consumes: the pack contract as it stands on `main` (feet/self/touch ranges; round/minute/hour durations; `save`, `macro`, `apply_effect`, `no_effect`).
- Produces: ten authored spells appended to `spells/core.json` in this order — `spell_bane` (1), `spell_bless` (1), `spell_charm_person` (1), `spell_animal_friendship` (1), `spell_daylight` (3), `spell_create_food_and_water` (3), `spell_banishment` (4), `spell_confusion` (4), `spell_blight` (4), `spell_cone_of_cold` (5). Action ids are `action_spell_<name>`.

- [ ] **Step 1: Record the ten as authored, and watch the list fail**

In `packages/database/src/__tests__/implementationMarkers.test.ts`, in the test `records which spells carry rules`, change the comment `// 14 of 111 since feat/spells-first-ten (#31).` to `// 24 of 111 since feat/spells-third-ten (#31).` (keep its second line), and replace the expected array with:

```ts
    ).toEqual([
      "spell_animal_friendship",
      "spell_augury",
      "spell_bane",
      "spell_banishment",
      "spell_bless",
      "spell_blight",
      "spell_burning_hands",
      "spell_charm_person",
      "spell_command",
      "spell_cone_of_cold",
      "spell_confusion",
      "spell_create_food_and_water",
      "spell_dancing_lights",
      "spell_darkness",
      "spell_daylight",
      "spell_eldritch_blast",
      "spell_faerie_fire",
      "spell_hellish_rebuke",
      "spell_identify",
      "spell_minor_illusion",
      "spell_nondetection",
      "spell_speak_with_dead",
      "spell_suggestion",
      "spell_thaumaturgy",
    ]);
```

Run: `DATABASE_URL= pnpm --filter @project/database test -- implementationMarkers`
Expected: FAIL — only fourteen are authored.

- [ ] **Step 2: Write the two patches**

Write `<scratchpad>/third-ten-spells.json` with exactly this content (UTF-8; the en and em dashes are literal):

```json
{
  "upsertSpells": [
    {
      "id": "spell_bane",
      "name": "Bane",
      "level": 1,
      "school": "enchantment",
      "isRitual": false,
      "lore": {
        "shortDescription": "Up to three creatures within 30 feet that fail a Charisma save subtract a d4 from their attack rolls and saving throws. Concentration, up to 1 minute.",
        "fullText": "Up to three creatures of your choice that you can see within range must make Charisma saving throws. Whenever a target that fails this saving throw makes an attack roll or a saving throw before the spell ends, the target must roll a d4 and subtract the number rolled from the attack roll or saving throw.\n\nAt Higher Levels. When you cast this spell using a spell slot of 2nd level or higher, you can target one additional creature for each slot level above 1st."
      },
      "range": { "kind": "feet", "feet": 30 },
      "components": {
        "verbal": true,
        "somatic": true,
        "material": true,
        "materialDescription": "a drop of blood"
      },
      "duration": { "kind": "timed", "amount": 1, "unit": "minute", "concentration": true },
      "action": {
        "id": "action_spell_bane",
        "name": "Bane",
        "activation": "action",
        "tableNote": "Up to three creatures you can see make the save, plus one more for each slot level above 1st. Each that fails subtracts a d4 from every attack roll and saving throw it makes until the spell ends.",
        "effect": {
          "type": "macro",
          "effects": [
            {
              "type": "save",
              "savingThrow": {
                "targetStat": "CHA",
                "dcCalculation": {
                  "base": 8,
                  "scalingStat": "SPELLCASTING_MOD",
                  "includeProficiency": true
                },
                "saveEffect": "negates_effect"
              }
            },
            {
              "type": "apply_effect",
              "effectName": "Bane",
              "durationType": "rounds",
              "durationRounds": 10,
              "isSelfConcentration": true
            }
          ]
        }
      }
    },
    {
      "id": "spell_bless",
      "name": "Bless",
      "level": 1,
      "school": "enchantment",
      "isRitual": false,
      "lore": {
        "shortDescription": "Up to three creatures within 30 feet add a d4 to their attack rolls and saving throws. Concentration, up to 1 minute.",
        "fullText": "You bless up to three creatures of your choice within range. Whenever a target makes an attack roll or a saving throw before the spell ends, the target can roll a d4 and add the number rolled to the attack roll or saving throw.\n\nAt Higher Levels. When you cast this spell using a spell slot of 2nd level or higher, you can target one additional creature for each slot level above 1st."
      },
      "range": { "kind": "feet", "feet": 30 },
      "components": {
        "verbal": true,
        "somatic": true,
        "material": true,
        "materialDescription": "a sprinkling of holy water"
      },
      "duration": { "kind": "timed", "amount": 1, "unit": "minute", "concentration": true },
      "action": {
        "id": "action_spell_bless",
        "name": "Bless",
        "activation": "action",
        "tableNote": "Up to three creatures, plus one more for each slot level above 1st. Each adds a d4 to every attack roll and saving throw it makes until the spell ends. If you blessed yourself, add the d4 to your own rolls: the sheet does not.",
        "effect": {
          "type": "apply_effect",
          "effectName": "Bless",
          "durationType": "rounds",
          "durationRounds": 10,
          "isSelfConcentration": true
        }
      }
    },
    {
      "id": "spell_charm_person",
      "name": "Charm Person",
      "level": 1,
      "school": "enchantment",
      "isRitual": false,
      "lore": {
        "shortDescription": "A humanoid within 30 feet that fails a Wisdom save treats you as a friendly acquaintance for an hour, and knows afterwards that it was charmed.",
        "fullText": "You attempt to charm a humanoid you can see within range. It must make a Wisdom saving throw, and does so with advantage if you or your companions are fighting it. If it fails the saving throw, it is charmed by you until the spell ends or until you or your companions do anything harmful to it. The charmed creature regards you as a friendly acquaintance. When the spell ends, the creature knows it was charmed by you.\n\nAt Higher Levels. When you cast this spell using a spell slot of 2nd level or higher, you can target one additional creature for each slot level above 1st. The creatures must be within 30 feet of each other when you target them."
      },
      "range": { "kind": "feet", "feet": 30 },
      "components": { "verbal": true, "somatic": true, "material": false },
      "duration": { "kind": "timed", "amount": 1, "unit": "hour", "concentration": false },
      "action": {
        "id": "action_spell_charm_person",
        "name": "Charm Person",
        "activation": "action",
        "tableNote": "A humanoid you can see; it makes the save with advantage if you or your companions are fighting it. On a failure it regards you as a friendly acquaintance for the hour, or until you or your companions harm it, and knows afterwards that you charmed it. Each slot level above 1st adds a target; all must be within 30 feet of each other.",
        "effect": {
          "type": "save",
          "savingThrow": {
            "targetStat": "WIS",
            "dcCalculation": {
              "base": 8,
              "scalingStat": "SPELLCASTING_MOD",
              "includeProficiency": true
            },
            "saveEffect": "negates_effect"
          }
        }
      }
    },
    {
      "id": "spell_animal_friendship",
      "name": "Animal Friendship",
      "level": 1,
      "school": "enchantment",
      "isRitual": false,
      "lore": {
        "shortDescription": "A beast within 30 feet that fails a Wisdom save is charmed by you for 24 hours. A beast with an Intelligence of 4 or more is unaffected.",
        "fullText": "This spell lets you convince a beast that you mean it no harm. Choose a beast that you can see within range. It must see and hear you. If the beast's Intelligence is 4 or higher, the spell fails. Otherwise, the beast must succeed on a Wisdom saving throw or be charmed by you for the spell's duration. If you or one of your companions harms the target, the spell ends.\n\nAt Higher Levels. When you cast this spell using a spell slot of 2nd level or higher, you can affect one additional beast for each slot level above 1st."
      },
      "range": { "kind": "feet", "feet": 30 },
      "components": {
        "verbal": true,
        "somatic": true,
        "material": true,
        "materialDescription": "a morsel of food"
      },
      "duration": { "kind": "timed", "amount": 24, "unit": "hour", "concentration": false },
      "action": {
        "id": "action_spell_animal_friendship",
        "name": "Animal Friendship",
        "activation": "action",
        "tableNote": "A beast you can see and that can see and hear you; one with an Intelligence of 4 or more is unaffected. On a failure it is charmed by you for 24 hours, or until you or your companions harm it. Each slot level above 1st adds a beast.",
        "effect": {
          "type": "save",
          "savingThrow": {
            "targetStat": "WIS",
            "dcCalculation": {
              "base": 8,
              "scalingStat": "SPELLCASTING_MOD",
              "includeProficiency": true
            },
            "saveEffect": "negates_effect"
          }
        }
      }
    },
    {
      "id": "spell_daylight",
      "name": "Daylight",
      "level": 3,
      "school": "evocation",
      "isRitual": false,
      "lore": {
        "shortDescription": "A 60-foot-radius sphere of bright light, and dim light 60 feet beyond, for an hour. It dispels darkness from a spell of 3rd level or lower.",
        "fullText": "A 60-foot-radius sphere of light spreads out from a point you choose within range. The sphere is bright light and sheds dim light for an additional 60 feet.\n\nIf you chose a point on an object you are holding or one that isn't being worn or carried, the light shines from the object and moves with it. Completely covering the affected object with an opaque object, such as a bowl or a helm, blocks the light.\n\nIf any of this spell's area overlaps with an area of darkness created by a spell of 3rd level or lower, the spell that created the darkness is dispelled."
      },
      "range": { "kind": "feet", "feet": 60, "area": { "shape": "sphere", "size": 60 } },
      "components": { "verbal": true, "somatic": true, "material": false },
      "duration": { "kind": "timed", "amount": 1, "unit": "hour", "concentration": false },
      "action": {
        "id": "action_spell_daylight",
        "name": "Daylight",
        "activation": "action",
        "tableNote": "Bright light fills a 60-foot-radius sphere, and dim light another 60 feet beyond. Cast on an object you hold or one nobody wears or carries, the light moves with it; covering the object blocks the light. It dispels any darkness created by a spell of 3rd level or lower that overlaps it.",
        "effect": { "type": "no_effect" }
      }
    },
    {
      "id": "spell_create_food_and_water",
      "name": "Create Food and Water",
      "level": 3,
      "school": "conjuration",
      "isRitual": false,
      "lore": {
        "shortDescription": "Enough food and fresh water for fifteen humanoids or five steeds for a day.",
        "fullText": "You create 45 pounds of food and 30 gallons of water on the ground or in containers within range, enough to sustain up to fifteen humanoids or five steeds for 24 hours. The food is bland but nourishing, and spoils if uneaten after 24 hours. The water is clean and doesn't go bad."
      },
      "range": { "kind": "feet", "feet": 30 },
      "components": { "verbal": true, "somatic": true, "material": false },
      "duration": { "kind": "instantaneous" },
      "action": {
        "id": "action_spell_create_food_and_water",
        "name": "Create Food and Water",
        "activation": "action",
        "tableNote": "45 pounds of food and 30 gallons of fresh water appear on the ground or in containers within range: enough for fifteen humanoids or five steeds for 24 hours. The food is bland but nourishing, and spoils if uneaten after 24 hours; the water does not go bad.",
        "effect": { "type": "no_effect" }
      }
    },
    {
      "id": "spell_banishment",
      "name": "Banishment",
      "level": 4,
      "school": "abjuration",
      "isRitual": false,
      "lore": {
        "shortDescription": "A creature within 60 feet that fails a Charisma save is banished: to a harmless demiplane if it belongs here, or home if it doesn't. Concentration, up to 1 minute.",
        "fullText": "You attempt to send one creature that you can see within range to another plane of existence. The target must succeed on a Charisma saving throw or be banished.\n\nIf the target is native to the plane of existence you're on, you banish the target to a harmless demiplane. While there, the target is incapacitated. The target remains there until the spell ends, at which point the target reappears in the space it left or in the nearest unoccupied space if that space is occupied.\n\nIf the target is native to a different plane of existence than the one you're on, the target is banished with a faint popping noise, returning to its home plane. If the spell ends before 1 minute has passed, the target reappears in the space it left or in the nearest unoccupied space if that space is occupied. Otherwise, the target doesn't return.\n\nAt Higher Levels. When you cast this spell using a spell slot of 5th level or higher, you can target one additional creature for each slot level above 4th."
      },
      "range": { "kind": "feet", "feet": 60 },
      "components": {
        "verbal": true,
        "somatic": true,
        "material": true,
        "materialDescription": "an item distasteful to the target"
      },
      "duration": { "kind": "timed", "amount": 1, "unit": "minute", "concentration": true },
      "action": {
        "id": "action_spell_banishment",
        "name": "Banishment",
        "activation": "action",
        "tableNote": "A creature you can see, plus one more for each slot level above 4th. A creature native to this plane is banished to a harmless demiplane, incapacitated, and returns when the spell ends. A creature from another plane returns to its home plane, and does not come back if you concentrate for the full minute.",
        "effect": {
          "type": "macro",
          "effects": [
            {
              "type": "save",
              "savingThrow": {
                "targetStat": "CHA",
                "dcCalculation": {
                  "base": 8,
                  "scalingStat": "SPELLCASTING_MOD",
                  "includeProficiency": true
                },
                "saveEffect": "negates_effect"
              }
            },
            {
              "type": "apply_effect",
              "effectName": "Banishment",
              "durationType": "rounds",
              "durationRounds": 10,
              "isSelfConcentration": true
            }
          ]
        }
      }
    },
    {
      "id": "spell_confusion",
      "name": "Confusion",
      "level": 4,
      "school": "enchantment",
      "isRitual": false,
      "lore": {
        "shortDescription": "Creatures in a 10-foot-radius sphere within 90 feet that fail a Wisdom save lose their reactions and act at random each turn. Concentration, up to 1 minute.",
        "fullText": "This spell assaults and twists creatures' minds, spawning delusions and provoking uncontrolled action. Each creature in a 10-foot-radius sphere centered on a point you choose within range must succeed on a Wisdom saving throw when you cast this spell or be affected by it.\n\nAn affected target can't take reactions and must roll a d10 at the start of each of its turns to determine its behavior for that turn.\n\n- 1: The creature uses all its movement to move in a random direction. To determine the direction, roll a d8 and assign a direction to each die face. The creature doesn't take an action this turn.\n- 2–6: The creature doesn't move or take actions this turn.\n- 7–8: The creature uses its action to make a melee attack against a randomly determined creature within its reach. If there is no creature within its reach, the creature does nothing this turn.\n- 9–10: The creature can act and move normally.\n\nAt the end of each of its turns, an affected target can make a Wisdom saving throw. If it succeeds, this effect ends for that target.\n\nAt Higher Levels. When you cast this spell using a spell slot of 5th level or higher, the radius of the sphere increases by 5 feet for each slot level above 4th."
      },
      "range": { "kind": "feet", "feet": 90, "area": { "shape": "sphere", "size": 10 } },
      "components": {
        "verbal": true,
        "somatic": true,
        "material": true,
        "materialDescription": "three nut shells"
      },
      "duration": { "kind": "timed", "amount": 1, "unit": "minute", "concentration": true },
      "action": {
        "id": "action_spell_confusion",
        "name": "Confusion",
        "activation": "action",
        "tableNote": "Each creature in a 10-foot-radius sphere makes the save; the radius grows 5 feet for each slot level above 4th. An affected creature can't take reactions and rolls a d10 at the start of each of its turns: 1, it uses all its movement to move in a random direction and takes no action; 2–6, it does nothing; 7–8, it makes a melee attack against a random creature within reach; 9–10, it acts normally. At the end of each of its turns it repeats the save, ending the effect on itself on a success.",
        "effect": {
          "type": "macro",
          "effects": [
            {
              "type": "save",
              "savingThrow": {
                "targetStat": "WIS",
                "dcCalculation": {
                  "base": 8,
                  "scalingStat": "SPELLCASTING_MOD",
                  "includeProficiency": true
                },
                "saveEffect": "negates_effect"
              }
            },
            {
              "type": "apply_effect",
              "effectName": "Confusion",
              "durationType": "rounds",
              "durationRounds": 10,
              "isSelfConcentration": true
            }
          ]
        }
      }
    },
    {
      "id": "spell_blight",
      "name": "Blight",
      "level": 4,
      "school": "necromancy",
      "isRitual": false,
      "lore": {
        "shortDescription": "A creature within 30 feet makes a Constitution save against 8d8 necrotic damage, half on a success, and 1d8 more for each slot level above 4th. No effect on undead or constructs.",
        "fullText": "Necromantic energy washes over a creature of your choice that you can see within range, draining moisture and vitality from it. The target must make a Constitution saving throw. The target takes 8d8 necrotic damage on a failed save, or half as much damage on a successful one. This spell has no effect on undead or constructs.\n\nIf you target a plant creature or a magical plant, it makes the saving throw with disadvantage, and the spell deals maximum damage to it.\n\nIf you target a nonmagical plant that isn't a creature, such as a tree or shrub, it doesn't make a saving throw; it simply withers and dies.\n\nAt Higher Levels. When you cast this spell using a spell slot of 5th level or higher, the damage increases by 1d8 for each slot level above 4th."
      },
      "range": { "kind": "feet", "feet": 30 },
      "components": { "verbal": true, "somatic": true, "material": false },
      "duration": { "kind": "instantaneous" },
      "action": {
        "id": "action_spell_blight",
        "name": "Blight",
        "activation": "action",
        "tableNote": "Undead and constructs are unaffected. A plant creature or magical plant makes the save with disadvantage and takes the maximum damage; a nonmagical plant that isn't a creature withers and dies.",
        "effect": {
          "type": "save",
          "savingThrow": {
            "targetStat": "CON",
            "dcCalculation": {
              "base": 8,
              "scalingStat": "SPELLCASTING_MOD",
              "includeProficiency": true
            },
            "saveEffect": "half_damage"
          },
          "damage": [
            {
              "sourceName": "Blight",
              "baseDice": "8d8",
              "damageType": "necrotic",
              "perSlotAbove": "1d8"
            }
          ]
        }
      }
    },
    {
      "id": "spell_cone_of_cold",
      "name": "Cone of Cold",
      "level": 5,
      "school": "evocation",
      "isRitual": false,
      "lore": {
        "shortDescription": "A 60-foot cone of cold: 8d8 cold damage on a failed Constitution save, half on a success, and 1d8 more for each slot level above 5th.",
        "fullText": "A blast of cold air erupts from your hands. Each creature in a 60-foot cone must make a Constitution saving throw. A creature takes 8d8 cold damage on a failed save, or half as much damage on a successful one.\n\nA creature killed by this spell becomes a frozen statue until it thaws.\n\nAt Higher Levels. When you cast this spell using a spell slot of 6th level or higher, the damage increases by 1d8 for each slot level above 5th."
      },
      "range": { "kind": "self", "area": { "shape": "cone", "size": 60 } },
      "components": {
        "verbal": true,
        "somatic": true,
        "material": true,
        "materialDescription": "a small crystal or glass cone"
      },
      "duration": { "kind": "instantaneous" },
      "action": {
        "id": "action_spell_cone_of_cold",
        "name": "Cone of Cold",
        "activation": "action",
        "tableNote": "A creature killed by this spell becomes a frozen statue until it thaws.",
        "effect": {
          "type": "save",
          "savingThrow": {
            "targetStat": "CON",
            "dcCalculation": {
              "base": 8,
              "scalingStat": "SPELLCASTING_MOD",
              "includeProficiency": true
            },
            "saveEffect": "half_damage"
          },
          "damage": [
            {
              "sourceName": "Cone of Cold",
              "baseDice": "8d8",
              "damageType": "cold",
              "perSlotAbove": "1d8"
            }
          ]
        }
      }
    }
  ]
}
```

Write `<scratchpad>/third-ten-stubs.json`:

```json
{
  "deleteSpellIds": [
    "spell_bane",
    "spell_bless",
    "spell_charm_person",
    "spell_animal_friendship",
    "spell_daylight",
    "spell_create_food_and_water",
    "spell_banishment",
    "spell_confusion",
    "spell_blight",
    "spell_cone_of_cold"
  ]
}
```

- [ ] **Step 3: Apply them**

From `packages/database`:

```bash
pnpm exec tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/spells/core.json "<scratchpad>/third-ten-spells.json"
pnpm exec tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/spells/unimplemented.json "<scratchpad>/third-ten-stubs.json"
```

Expected: `patched …` twice. `git diff --stat` shows `core.json` gaining ten spells after Speak with Dead, and `unimplemented.json` losing ten entries and nothing else.

- [ ] **Step 4: Watch the list pass**

Run: `DATABASE_URL= pnpm --filter @project/database test -- implementationMarkers`
Expected: PASS. If pack assembly reports a validation issue instead, it names the spell and the rule (`concentration_mismatch`, `incomplete_spell`, `invalid_upcast`, `spell_hardcodes_caster_value`): fix the patch file and re-apply the upsert (it replaces by id).

- [ ] **Step 5: Move three tests off Bless, which is no longer a stub**

Three engine tests use Bless as "a picked stub". Every remaining stub keeps the placeholder level 0, so a cantrip node takes it; Cure Wounds serves, and stays a stub until healing can be authored (#122).

In `packages/engine/src/pipeline/__tests__/spellSynthesizer.test.ts`, in the test `lists a stub the character picked, and makes no action of it`, replace the comment line `// every stub keeps the placeholder level 0, so a cantrip node takes it` with:

```ts
    // every stub keeps the placeholder level 0, so a cantrip node takes it;
    // Cure Wounds stays a stub until healing can be authored (#122)
```

and change `"spell_bless"` to `"spell_cure_wounds"` in the selections, in `find(result, "spell_bless")`, and `"action_spell_bless"` to `"action_spell_cure_wounds"`. Immediately before the `actionId` assertion, add a line that checks the stub is listed at all, since `find(...)?.actionId` is also undefined when `find` returns nothing:

```ts
    expect(find(result, "spell_cure_wounds")).toBeDefined();
```

In `packages/engine/src/pipeline/__tests__/characterEngine.test.ts`, in the test `lists a stub without offering it as an action`, make the same comment change, and change `"spell_bless"` to `"spell_cure_wounds"` (selections and the `toContain`) and `"action_spell_bless"` to `"action_spell_cure_wounds"`.

In `packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts`, in the test `rejects a High Elf's cantrip the block does not offer, or one too many`, change:

```ts
      high_elf_cantrip: ["spell_thaumaturgy", "spell_bless"],
```

to:

```ts
      high_elf_cantrip: ["spell_thaumaturgy", "spell_cure_wounds"],
```

Leave every other `spell_bless` in these files alone: `spellChoices.test.ts` and the bootstrapper's `rejects every pick on a spell node with nothing to offer` use it as a leveled pick, which is still refused and still known.

- [ ] **Step 6: Run every suite that reads the pack**

```bash
pnpm --filter @project/engine test
DATABASE_URL= pnpm --filter @project/database test
DATABASE_URL= pnpm --filter @project/server test
pnpm --filter @project/web test
pnpm --filter @project/engine typecheck
pnpm --filter @project/database typecheck
```

Expected: engine 1090, database 206, server 545 and web 512, all passing; both typechecks clean. A failure elsewhere means a test depended on one of these ten being a level-0 stub: stop and report NEEDS_CONTEXT with the test's name. Restore and measure CRLF on the four test files.

- [ ] **Step 7: Commit**

```bash
git add packages/database/data/packs/core_2014_pack/spells packages/database/src/__tests__/implementationMarkers.test.ts packages/engine/src/pipeline/__tests__/spellSynthesizer.test.ts packages/engine/src/pipeline/__tests__/characterEngine.test.ts packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts
git commit -F - <<'EOF'
feat(database): author Bane, Bless, Blight, Cone of Cold and six more (#31)

Bane, Bless, Charm Person, Animal Friendship, Daylight, Create Food and
Water, Banishment, Confusion, Blight and Cone of Cold move to
spells/core.json with their SRD 5.1 text, in patterns the last two
batches checked live. Bless is a concentration effect with no modifier:
its d4 is dice, and the table note tells a self-blessed caster to add it.
24 of 111 authored.

Three engine tests that used Bless as a stub cantrip use Cure Wounds,
which stays a stub until healing can be authored (#122).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: A desert druid to check them on

**Files:**
- Modify: `packages/database/src/sampleScenarioCharacters.ts` (a roster entry appended after Cassia Emberlane; the header comment's count)
- Modify: `packages/database/src/seedSampleCharacters.ts` (comments only: the roster counts)
- Modify: `packages/database/src/__tests__/seedSampleCharactersImport.test.ts`
- Modify: `apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts`
- Modify: `apps/server/src/services/__tests__/sampleCharacterScores.test.ts`
- Modify: `docs/development/sample-characters.md`

**Interfaces:**
- Consumes: Task 1's authored Blight (4th level, CON half, 8d8 necrotic) and Create Food and Water (3rd level, `no_effect`); `trait_land_circle_spells_desert` in `traits/ported.json` grants Blur and Silence at druid 3, Create Food and Water and Protection from Energy at 5, and Blight and Hallucinatory Terrain at 7, all `always_prepared`; of the six, only Create Food and Water and Blight are authored, and the other four are stubs whose placeholder level 0 lists them under Cantrips.
- Produces: `00000000-0000-0000-0000-000000000132`, **Ashar Dunewind**, a human Circle of the Land (Desert) druid 7 — stored scores `[10, 13, 13, 11, 15, 9]`, final `[11, 14, 14, 12, 16, 10]`, derived maximum 52 hit points, spell save DC 14.

- [ ] **Step 1: Pin the druid, and watch the pins fail**

In `packages/database/src/__tests__/seedSampleCharactersImport.test.ts`, change `expect(ROSTER).toHaveLength(22);` to `expect(ROSTER).toHaveLength(23);`.

In `apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts`, add after `"Cassia Emberlane": 38,`:

```ts
  // 38 rolled (8, then 5 a level) + CON 14's +2 at each of seven levels
  "Ashar Dunewind": 52,
```

In `apps/server/src/services/__tests__/sampleCharacterScores.test.ts`, add after `"Cassia Emberlane": [10, 12, 14, 13, 16, 15],`:

```ts
  // the human adds +1 to every score
  "Ashar Dunewind": [11, 14, 14, 12, 16, 10],
```

Run: `DATABASE_URL= pnpm --filter @project/database test -- seedSampleCharactersImport` and `DATABASE_URL= pnpm --filter @project/server test -- sampleCharacterScores`
Expected: FAIL — the roster has 22, and the scores test's `covers every sample` finds a name with no character.

- [ ] **Step 2: Add the druid to the roster**

In `packages/database/src/sampleScenarioCharacters.ts`, append to the scenario roster array after Cassia Emberlane's entry (before the closing `];`):

```ts
  {
    id: "00000000-0000-0000-0000-000000000132",
    name: "Ashar Dunewind",
    raceId: "race_human",
    classes: [
      {
        classId: "class_druid",
        classLevel: 7,
        subclassId: "subclass_druid_land",
      },
    ],
    backgroundId: "background_acolyte",
    choices: {
      feats: [],
      classSelections: {
        class_druid: {
          druid_land_level_3_circle_land: ["trait_land_circle_spells_desert"],
        },
      },
      traitSelections: {
        human_language_choice: ["dwarvish"],
        acolyte_languages: ["celestial", "elvish"],
        druid_starting_skills: ["nature", "survival"],
      },
    },
    alignment: "True Neutral",
    // the human's +1 makes WIS 16 (+3); proficiency +3 at level 7 gives a
    // spell save DC of 14
    str: 10,
    dex: 13,
    con: 13,
    int: 11,
    wis: 15,
    cha: 9,
    maxHp: 38,
    currentHp: 52,
    testFocus:
      "Spell casting (#31): Circle of the Land (Desert) spells — Blight from the one 4th-level slot (8d8 necrotic, CON DC 14) and Create Food and Water from a 3rd; the circle's other spells (Blur, Silence, Protection from Energy, Hallucinatory Terrain) are still stubs and list under Cantrips as not yet automated.",
    personalityTraits: "I measure distance in wells, not miles.",
    ideals: "Stewardship. Water taken is water owed.",
    bonds: "The salt flats at Kheret raised me, and I answer when they call.",
    flaws: "I ration everything, including my patience with city folk.",
    traits: [
      {
        traitId: "trait_druid_prof_saving_throw",
        source: "class_druid_level_1",
      },
      { traitId: "trait_druid_prof_armor", source: "class_druid_level_1" },
      { traitId: "trait_druid_prof_weapons", source: "class_druid_level_1" },
      { traitId: "trait_druid_prof_tools", source: "class_druid_level_1" },
      { traitId: "trait_druid_prof_skills", source: "class_druid_level_1" },
      { traitId: "trait_druidic", source: "class_druid_level_1" },
      { traitId: "trait_spellcasting_druid", source: "class_druid_level_1" },
      { traitId: "trait_wild_shape", source: "class_druid_level_2" },
      { traitId: "trait_druid_circle", source: "class_druid_level_2" },
      {
        traitId: "trait_bonus_cantrip_druid_land",
        source: "subclass_druid_land_level_2",
      },
      {
        traitId: "trait_natural_recovery",
        source: "subclass_druid_land_level_2",
      },
      {
        traitId: "trait_wild_shape_improvement",
        source: "class_druid_level_4",
      },
      {
        traitId: "trait_druid_circle_feature",
        source: "class_druid_level_6",
      },
      { traitId: "trait_lands_stride", source: "subclass_druid_land_level_6" },
      { traitId: "race_human_asi", source: "race_human" },
      { traitId: "race_human_languages", source: "race_human" },
      { traitId: "trait_acolyte_prof_skills", source: "background_acolyte" },
      { traitId: "trait_acolyte_languages", source: "background_acolyte" },
    ],
    inventory: [
      { itemId: "item_armor_leather", slot: "body" },
      { itemId: "item_weapon_scimitar", slot: "main_hand" },
      { itemId: "item_armor_shield", slot: "off_hand" },
      // a druidic focus: neither Blight nor Create Food and Water needs a
      // material, so it changes nothing for this batch
      { itemId: "item_focus_sprig_of_mistletoe" },
      { itemId: "item_pack_explorers" },
    ],
    resources: [
      {
        id: "spell_slots_1",
        name: "1st-Level Spell Slots",
        current: 4,
        max: 4,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_2",
        name: "2nd-Level Spell Slots",
        current: 3,
        max: 3,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_3",
        name: "3rd-Level Spell Slots",
        current: 3,
        max: 3,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_4",
        name: "4th-Level Spell Slots",
        current: 1,
        max: 1,
        resetCondition: "long_rest",
      },
      {
        id: "trait_wild_shape",
        name: "Wild Shape",
        current: 2,
        max: 2,
        resetCondition: "short_rest",
      },
      {
        id: "trait_natural_recovery",
        name: "Natural Recovery",
        current: 1,
        max: 1,
        resetCondition: "long_rest",
      },
    ],
  },
```

In the same file's header comment, change the scenario count from twelve to thirteen in both places (`twelve scenario characters` and `These twelve`). In `packages/database/src/seedSampleCharacters.ts`, change `twenty-two` to `twenty-three` and `twelve scenario characters` to `thirteen scenario characters` in its comments. Change nothing else in either file.

- [ ] **Step 3: Watch every roster invariant pass**

```bash
DATABASE_URL= pnpm --filter @project/database test
DATABASE_URL= pnpm --filter @project/server test
pnpm --filter @project/database typecheck
pnpm --filter @project/server typecheck
```

Expected: both suites pass; both typechecks are clean. The server gains three cases (the druid's choices, hit points and scores): 548. If `sampleCharacterChoices` reports an issue for the druid, its message names the node: fix the druid's `choices` (for example, answer a node it names), never the test. If some other invariant fails and the fix isn't obvious from its message, stop and report NEEDS_CONTEXT.

- [ ] **Step 4: Document the druid, and the two existing characters' spell steps**

In `docs/development/sample-characters.md`:

- `Twenty-two fixture characters` → `Twenty-three fixture characters`; `All twenty-two sit` → `All twenty-three sit`; `the twenty-two ids` → `the twenty-three ids`.
- `` (`…0120`–`…0131`) `` → `` (`…0120`–`…0132`) ``.
- Add a table row after Cassia Emberlane's:

  ```markdown
  | [Ashar Dunewind](http://localhost:5173/character/00000000-0000-0000-0000-000000000132) | 7 | Druid 7 (Land: Desert) | 52/52 | Spell casting: circle spells | #31 |
  ```

- `through `…000000000131`` → `through `…000000000132``.
- Recount the **Subclasses** coverage line with the same method as the last batch: distinct pack-authored subclass ids used by `classes[].subclassId` across both roster files, excluding the seed's own stub subclass rows, against the pack's total. Kaelen Duskwarden already reaches Circle of the Land, so expect it to stay at 22 of 40; change the line only if the recount differs, and put the count in your report.
- Under `## Live checks`, add a section before `### Quill Ashgrove — `…0120``:

  ```markdown
  ### Sister Aveline Cor — `…0111`

  A coverage character, scripted for one spell.

  1. **Bless (#31).** The Spells panel lists Bless (Cleric · Slot) with a
     Concentration badge; it is always prepared as a Life domain spell. Cast it
     with a 1st-level slot: no material prompt (her amulet is a holy symbol),
     Active effects shows Bless Concentrating, and the note says to add the d4
     to your own rolls if you blessed yourself. The slot is spent.
  ```

- In Ursk Gravemaw's section, append a step:

  ```markdown
  5. **Bane (#31).** The Spells panel lists Bane (Paladin · Slot), always
     prepared as a Vengeance oath spell. Cast it with a 1st-level slot:
     no material prompt (his emblem is a holy symbol), the results read "Bane:
     CHA save DC 13 · a success negates it", and Active effects shows Bane
     Concentrating. The slot is spent (2 of 4 becomes 1 of 4).
  ```

- Add a section after Cassia Emberlane's:

  ```markdown
  ### Ashar Dunewind — `…0132`

  A Circle of the Land (Desert) druid 7 with every slot full (4/3/3/1).

  1. **The circle spells.** The Spells panel lists Create Food and Water (3rd
     level) and Blight (4th level), each Druid · Slot. The circle's other four
     spells — Blur, Silence, Protection from Energy and Hallucinatory Terrain —
     are still stubs: their level is a placeholder 0, so they sit under Cantrips
     as Druid · At will, marked Not yet automated.
  2. **Blight.** Cast it: the picker offers only "4th level (1 left) · 8d8".
     The results read "Blight: CON save DC 14 · half damage on a success" with
     eight d8 of necrotic damage, and the note says undead and constructs are
     unaffected. The 4th-level slot is spent.
  3. **Create Food and Water.** Cast it with a 3rd-level slot: no material
     prompt, and the note describes the food and water. The slot is spent.
  ```

Restore and measure CRLF on every file this task touched.

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/sampleScenarioCharacters.ts packages/database/src/seedSampleCharacters.ts packages/database/src/__tests__/seedSampleCharactersImport.test.ts apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts apps/server/src/services/__tests__/sampleCharacterScores.test.ts docs/development/sample-characters.md
git commit -F - <<'EOF'
feat(database): Ashar Dunewind, a desert druid to cast Blight on

A Circle of the Land (Desert) druid 7 with every slot full: Blight from
the one 4th-level slot and Create Food and Water from a 3rd, with Blur
still a stub. Aveline's and Ursk's scripts gain Bless and Bane.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: The authoring guide and the backlog

**Files:**
- Modify: `docs/architecture/spell-authoring-guide.md`
- Modify: `docs/TODO_BACKLOG.md`

**Interfaces:** docs only.

- [ ] **Step 1: The authoring guide**

In `docs/architecture/spell-authoring-guide.md`:

1. Replace the opening paragraph's last sentence (`Hellish Rebuke (a reaction cast at a fixed level through Infernal Legacy), Command, Suggestion and Identify (a ritual with a costly component) show the rest. Read them beside this.`) with:

   ```markdown
   Hellish Rebuke (a reaction cast at a fixed level through Infernal Legacy),
   Command, Suggestion, Identify (a ritual with a costly component), Bless (a
   buff the sheet cannot apply to the caster) and Confusion (an upcast that
   grows the area) show the rest. Read them beside this.
   ```

2. In the "Which effect fits which spell" table, change the Example cells:
   - `forces a save for damage` → `Burning Hands, Blight, Cone of Cold`;
   - `forces a save whose failure only the table resolves` → `Command, Charm Person, Animal Friendship`;
   - `forces a save, then lasts` → `Faerie Fire, Suggestion, Bane, Banishment, Confusion`;
   - `does what only the table can see` → `Dancing Lights, Identify, Daylight, Create Food and Water`.

   and add this row after `changes the caster's own numbers while it lasts`:

   ```markdown
   | helps creatures that may include the caster, with dice the sheet cannot add | a concentration `apply_effect` with no modifiers; the `tableNote` tells the player to add the dice to their own rolls if they are a target (#131) | Bless |
   ```

3. In "Scaling", replace the bullet beginning `**Any other upcast**` with:

   ```markdown
   - **Any other upcast** — more targets, more rays, a larger area, a longer duration — is not modelled. Say it in the `tableNote` (Bane's extra targets; Confusion's radius, which the stamped area does not show), or leave the spell a stub.
   ```

4. In "When a capability is missing", add after its paragraph:

   ```markdown
   The capabilities that keep stubs blocked today:

   - **Healing** (#122) — Cure Wounds, Mass Cure Wounds.
   - **An AC floor** (#127) — Barkskin.
   - **A repeat action while concentrating** (#128) — Call Lightning, Cloudkill, Moonbeam, Spiritual Weapon, Flaming Sphere.
   - **A damage type chosen at cast time** (#129) — Destructive Wave.
   - **Weapon damage granted by an effect** (#130) — Crusader's Mantle, Divine Favor, Hunter's Mark.
   - **Dice added to the caster's own rolls by an effect** (#131) — Bless is authored around it, table-resolved.
   ```

- [ ] **Step 2: The backlog**

In `docs/TODO_BACKLOG.md`:

1. **#31's row in Open items (4a)** (it begins `| 31 | Spells marked `unimplemented` | **97 of 111** |`): change `**97 of 111**` to `**87 of 111**`, and in its Notes cell replace `Fourteen authored, in `spells/core.json`: four on `feat/spell-casting` (2026-09-25) — Eldritch Blast, Dancing Lights, Faerie Fire, Burning Hands — and ten on `feat/spells-first-ten` (2026-09-27) — Darkness, Minor Illusion, Thaumaturgy, Hellish Rebuke, Command, Identify, Augury, Suggestion, Nondetection, Speak with Dead. The other 97 are stubs` with:

   ```markdown
   Twenty-four authored, in `spells/core.json`: four on `feat/spell-casting` (2026-09-25) — Eldritch Blast, Dancing Lights, Faerie Fire, Burning Hands — ten on `feat/spells-first-ten` (2026-09-27) — Darkness, Minor Illusion, Thaumaturgy, Hellish Rebuke, Command, Identify, Augury, Suggestion, Nondetection, Speak with Dead — and ten on `feat/spells-third-ten` (2026-09-28) — Bane, Bless, Charm Person, Animal Friendship, Daylight, Create Food and Water, Banishment, Confusion, Blight, Cone of Cold. The other 87 are stubs
   ```

   keeping the rest of the cell. The Item index row for #31 stays `Open`.

2. **Five new items.** Add Item index rows after #126's (`| 126 | A concentration spell whose every target saves still concentrates | Open | Open items |`):

   ```markdown
   | 127 | No AC floor | Open | Open items |
   | 128 | No repeat action while concentrating | Open | Open items |
   | 129 | No damage type chosen at cast time | Open | Open items |
   | 130 | No weapon damage granted by an effect | Open | Open items |
   | 131 | No dice bonus on the caster's own rolls from an effect | Open | Open items |
   ```

   and add these Open items sections after #126's section (which ends `…the player ends it with End Concentration.`), before the next heading:

   ```markdown
   ### #127 — no AC floor

   | # | Item | Notes |
   | --- | --- | --- |
   | 127 | No AC floor | Recorded 2026-09-28 on `feat/spells-third-ten`. See below. |

   Barkskin says the target's AC can't be less than 16. No modifier type sets
   a minimum (`ModifierTypeSchema`, `packages/shared/src/schemas/content/modifiers.ts`),
   and `calculateAC` takes the highest `set_base` and adds to it, so a
   `set_base` of 16 would let Dexterity and shields raise it past the floor.
   Barkskin stays a stub.

   ### #128 — no repeat action while concentrating

   | # | Item | Notes |
   | --- | --- | --- |
   | 128 | No repeat action while concentrating | Recorded 2026-09-28 on `feat/spells-third-ten`. See below. |

   Call Lightning and Cloudkill (and Moonbeam, Spiritual Weapon, Flaming
   Sphere) let the caster repeat part of the spell on later turns while
   concentrating: no slot, the original cast level and DC, and concentration
   does not restart. A spell grants exactly one action. All five stay stubs.

   ### #129 — no damage type chosen at cast time

   | # | Item | Notes |
   | --- | --- | --- |
   | 129 | No damage type chosen at cast time | Recorded 2026-09-28 on `feat/spells-third-ten`. See below. |

   Destructive Wave deals radiant or necrotic damage, the caster's choice.
   `DamageSegment.damageType` is one value, and the cast request carries no
   choice. Destructive Wave stays a stub.

   ### #130 — no weapon damage granted by an effect

   | # | Item | Notes |
   | --- | --- | --- |
   | 130 | No weapon damage granted by an effect | Recorded 2026-09-28 on `feat/spells-third-ten`. See below. |

   Crusader's Mantle, Divine Favor and Hunter's Mark add dice to weapon hits
   while an effect lasts. A weapon attack's damage pool holds only the
   weapon's own segment (`CombatEngine.calculateWeaponAttack`), and a
   modifier's value is a number, not dice. All three stay stubs.

   ### #131 — no dice bonus on the caster's own rolls from an effect

   | # | Item | Notes |
   | --- | --- | --- |
   | 131 | No dice bonus on the caster's own rolls from an effect | Recorded 2026-09-28 on `feat/spells-third-ten`. See below. |

   Bless adds a d4 to its targets' attack rolls and saving throws. A
   modifier's value is a number, and an effect's modifiers always land on the
   caster, who may not be a target. Bless is authored table-resolved: its note
   tells a self-blessed caster to add the d4. Guidance and Resistance will
   meet the same gap.
   ```

- [ ] **Step 3: Check and commit**

Restore and measure CRLF on both files. Run `pnpm check:hygiene`. Read each changed section once more for British spelling and broken table rows.

```bash
git add docs/architecture/spell-authoring-guide.md docs/TODO_BACKLOG.md
git commit -F - <<'EOF'
docs: the third ten in the authoring guide, and the capabilities still missing

The guide gains Bless (a buff the sheet cannot apply to the caster) and
Confusion (an upcast that grows the area) as examples, and lists the
capabilities that keep stubs blocked. The backlog counts 87 of 111 stubs
left and records #127-#131.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Verify the whole branch, and check it live

**Files:** none changed, unless the checks find something. A finding is reported, not silently fixed.

- [ ] **Step 1: Every suite, every typecheck, lint and hygiene**

```bash
pnpm --filter @project/shared test
pnpm --filter @project/engine test
DATABASE_URL= pnpm --filter @project/database test
DATABASE_URL= pnpm --filter @project/server test
pnpm --filter @project/web test
pnpm --filter @project/shared typecheck
pnpm --filter @project/engine typecheck
pnpm --filter @project/database typecheck
pnpm --filter @project/server typecheck
pnpm --filter @project/web typecheck
pnpm lint
pnpm check:hygiene
```

Expected: shared 266, engine 1090, database 206, server 548 and web 512 — **2622** — all passing. Every typecheck is clean; lint shows no warning beyond the three on `main`; hygiene passes. If a total differs, account for every test by name before going on.

- [ ] **Step 2: Import the pack and reseed the samples** — ask the owner first

The import CASCADE-deletes every character in the dev database. Ask before running it. The dev database runs in Docker (container `dnd-postgres`); if a script hits `ECONNREFUSED 5432`, start Docker Desktop, then `docker start dnd-postgres`.

```bash
pnpm --filter @project/database db:import-pack --yes
pnpm --filter @project/database db:seed:samples
```

Expected: the import publishes the pack (Postgres `NOTICE` lines about the cascade are normal), and the seed writes 23 characters. Restart the server afterwards.

- [ ] **Step 3: Check it live**

Run the scripts from `docs/development/sample-characters.md`: Sister Aveline Cor step 1, Ursk Gravemaw step 5, Ashar Dunewind steps 1–3. If the browser pane is hidden, drive the Spells panel by dispatching clicks from a script and read the page text as evidence (see the memory note on hidden browser panes). Record what the sheet showed (DCs, dice counts, slots, prompts). A disagreement with a script is a finding: report it, and do not change code in this task. Reseed afterwards so the characters are fresh.

- [ ] **Step 4: Report**

Summarise the test totals per package, each live check as passed or as a finding with its evidence, and any file whose line endings changed unexpectedly (`git diff --stat main` should list only the files the tasks name).
