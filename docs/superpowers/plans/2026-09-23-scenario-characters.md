# Scenario Characters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ten more sample characters (ids `…0120`–`…0129`), each staged for a hand check a unit test cannot reach, seeded beside the existing ten by the same `db:seed:samples`, held to the pack by the same invariant tests, and documented with a live-check script apiece.

**Architecture:** The new ten live in a new module, `packages/database/src/sampleScenarioCharacters.ts`, which imports only *types* from the seeder. The seeder concatenates its own lists with the scenario lists (`ROSTER = [...BASE_ROSTER, ...SCENARIO_ROSTER]`, likewise every stub list), so every importer — the seed itself and four invariant tests — sees twenty characters with no other change. The seeder gains a race-stub insert and two optional character fields: `levelColumn` (Brother Mote's drifted level, #95) and `expectedIssues` (Orrik Stonehide's unknown race and subclass).

**Tech Stack:** TypeScript, pnpm + turbo monorepo; Vitest; drizzle-orm + postgres-js (`packages/database`); `@project/engine` for the invariant tests in `apps/server`.

**Spec:** `docs/superpowers/specs/2026-09-23-scenario-characters-design.md` (read its "Corrections found while planning" section first — four of its live checks changed once the code was read).

## Global Constraints

- **Line endings.** The working tree is CRLF with `core.autocrlf=true`, and git normalises endings, so `git diff`/`git show` cannot reveal them. Edit and Write emit LF. Measured working-tree endings of every file this plan touches:

  | File | Ending |
  | --- | --- |
  | `packages/database/src/seedSampleCharacters.ts` | CRLF |
  | `packages/database/src/sampleScenarioCharacters.ts` (new) | **must be CRLF** |
  | `packages/database/src/__tests__/sampleRosterIds.test.ts` | CRLF |
  | `packages/database/src/__tests__/seedSampleCharactersImport.test.ts` | CRLF |
  | `apps/server/src/services/__tests__/sampleCharacterChoices.test.ts` | CRLF |
  | `apps/server/src/services/__tests__/sampleCharacterScores.test.ts` | CRLF |
  | `apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts` | CRLF |
  | `docs/TODO_BACKLOG.md` | CRLF |
  | `docs/development/sample-characters.md` | **LF — keep it LF** |

  After editing, restore CRLF on every CRLF file you touched (never on `sample-characters.md`):
  ```bash
  node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' <file> <file> ...
  ```
  Measure a file's endings by counting bytes — `grep` gives wrong answers for CR in this Git Bash:
  ```bash
  node -e 'for(const f of process.argv.slice(1)){const b=require("fs").readFileSync(f);let cr=0,lf=0,crlf=0;for(let i=0;i<b.length;i++){if(b[i]===13){cr++;if(b[i+1]===10)crlf++;}if(b[i]===10)lf++;}console.log(f,cr===0?"LF":(cr===crlf&&crlf===lf)?"CRLF":"MIXED")}' <file> ...
  ```
  Do not use `sed -i`. `pnpm check:hygiene` fails on a file with mixed endings.
- **Typecheck is a separate gate.** Vitest does not fail on type errors, and these packages set `noUncheckedIndexedAccess`. Run `pnpm --filter @project/database typecheck` and `pnpm --filter @project/server typecheck` (both are `tsc --noEmit`). **Never run `tsc -b` in `packages/database`** — it writes `.js`/`.d.ts` files into `src/`, which fails hygiene.
- **CI has no `DATABASE_URL`.** Nothing the roster module imports may need one at load. Run the database and server suites as `DATABASE_URL= pnpm --filter @project/database test` and `DATABASE_URL= pnpm --filter @project/server test`.
- **No rules are authored or changed.** Nothing under `packages/database/data/packs/` is touched. A stub row the seed writes is tagged `pack_id = 'dev_sample_pack'` and inserted with `onConflictDoNothing`, like every existing stub.
- **Fix nothing the characters exercise.** If a character exposes a defect, record it; do not fix it on this branch.
- **The original ten are not edited** beyond the renames Task 1 lists (`ROSTER` → `BASE_ROSTER` and the three stub lists).
- Commit messages end with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (use `git commit -F -` with a heredoc). Branch is `feat/scenario-characters`. Do not push.
- Touch only the files a task lists. A failure in any other file: stop and report NEEDS_CONTEXT.

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/database/src/sampleScenarioCharacters.ts` (new) | The ten scenario characters and the four stubs only they need: one race, one subclass, one background, two items. Data only; imports types. |
| `packages/database/src/seedSampleCharacters.ts` | Owns the types, the coverage ten, the combined lists, and every database write. Gains the race-stub insert, `levelColumn` and `expectedIssues`. |
| `packages/database/src/__tests__/sampleRosterIds.test.ts` | Every id the roster names resolves; now also: race stubs count as known, and character ids are unique across both modules. |
| `packages/database/src/__tests__/seedSampleCharactersImport.test.ts` | The roster imports without a database; its length assertion follows the roster. |
| `apps/server/src/services/__tests__/sampleCharacterChoices.test.ts` | Each character raises exactly its `expectedIssues`. |
| `apps/server/src/services/__tests__/sampleCharacterScores.test.ts` | Stored scores reach the intended final scores; ten rows added. |
| `apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts` | The derived maximum each sheet shows; ten rows added. |
| `docs/development/sample-characters.md` | Rewritten for twenty: both rosters, the live-check scripts, corrected stale sections. |
| `docs/TODO_BACKLOG.md` | #70 and Tier 2 row 7a: the stub backgrounds gain users. |

## Facts this plan relies on (verified while planning)

- **A seeded pool is what the sheet shows.** `getAuthoritativeRuntimeContext` (`apps/server/src/gateway/socket.ts:240-253`) inserts only pools that are *missing* from `character_resources`, with `onConflictDoNothing`, and hydrates the runtime from the stored rows. So a seeded `spell_slots_2` at 1 of 3 shows 1 of 3.
- **A stored pool with no rule behind it is not shown at all.** `useFeatures` (`apps/web/src/hooks/useFeatures.ts:67-68`) drops any resource `resolveResourceRule` cannot resolve. Wild Shape, Sorcery Points, Tides of Chaos, Portent, Arcane Recovery and Giant's Might are stored but invisible; the live checks say so.
- **The display clamps to the rules-derived maximum** (`useFeatures.ts:94`), which is what makes a stored `spell_slots_1` of 6 against a maximum of 4 reproduce #98.
- **An unknown race or subclass is reported, not thrown.** `CharacterBootstrapper.collectSaveIssues` returns `unknown_race` and `unknown_subclass` for Orrik; `compileActiveTraits`, `gatherSheetModifiers` and `finalMaxHp` all run.
- Every number below — final scores, derived maxima, zero save issues — was measured by running the scenario module through the same calls the invariant tests make.

---

### Task 1: Seeder plumbing — scenario module, race stubs, `levelColumn`, `expectedIssues`

No new character yet. The roster is still ten at the end of this task; everything that lets the next four tasks add characters by editing one file is in place.

**Files:**
- Create: `packages/database/src/sampleScenarioCharacters.ts`
- Modify: `packages/database/src/seedSampleCharacters.ts`
- Test: `packages/database/src/__tests__/sampleRosterIds.test.ts`, `apps/server/src/services/__tests__/sampleCharacterChoices.test.ts`

**Interfaces:**
- Produces (exported from `seedSampleCharacters.ts`): types `SampleCharacter`, `SampleItem`, `SampleSubclass`, `SampleBackground`, `SampleRace`; values `ROSTER`, `SAMPLE_SUBCLASSES`, `SAMPLE_BACKGROUNDS`, `SAMPLE_ITEMS`, `SAMPLE_RACES`, `SAMPLE_PACK_ID`, `SHEET_URL_BASE`.
- Produces (exported from `sampleScenarioCharacters.ts`): `SCENARIO_ROSTER: SampleCharacter[]`, `SCENARIO_RACES: SampleRace[]`, `SCENARIO_SUBCLASSES: SampleSubclass[]`, `SCENARIO_BACKGROUNDS: SampleBackground[]`, `SCENARIO_ITEMS: SampleItem[]` — all empty after this task.
- `SampleCharacter` gains `levelColumn?: number` and `expectedIssues?: string[]`.

- [ ] **Step 1: Write the failing tests**

In `packages/database/src/__tests__/sampleRosterIds.test.ts`, import `SAMPLE_RACES` alongside the other three lists:

```ts
import {
  ROSTER,
  SAMPLE_BACKGROUNDS,
  SAMPLE_ITEMS,
  SAMPLE_RACES,
  SAMPLE_SUBCLASSES,
} from "../seedSampleCharacters.js";
```

Replace the doc comment's last paragraph (the one beginning "The roster may name ids the core pack lacks") with:

```ts
 * The roster may name ids the core pack lacks, but only the ones the seed
 * supplies itself as reference stubs - the sample races, subclasses,
 * backgrounds and items. It supplies no trait stubs, so a `customTraitIds`
 * entry has nowhere to come from but the pack.
```

Replace `const raceIds = idsOf(pack.races);` with:

```ts
const raceIds = new Set([...idsOf(pack.races), ...idsOf(SAMPLE_RACES)]);
```

Add this test as the first `it` inside the `describe` block:

```ts
  it("gives every character its own id", () => {
    // the roster is assembled from two modules, and a repeated id would have
    // the second character silently overwrite the first on every seed
    const ids = ROSTER.map((character) => character.id);

    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
  });
```

In `apps/server/src/services/__tests__/sampleCharacterChoices.test.ts`, replace the final assertion `expect(issues).toEqual([]);` with:

```ts
      // a character built to be broken declares what it raises; any other
      // issue is a mistake, and so is a declared one that went missing
      const expected = character.expectedIssues ?? [];

      expect(
        issues.filter((issue) => !expected.includes(issue.code)),
      ).toEqual([]);
      expect(issues.map((issue) => issue.code).sort()).toEqual(
        [...expected].sort(),
      );
```

and change the test title from `"%s answers every question the pack offers options for"` to `"%s answers every question the pack offers options for, and raises only the issues it declares"`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `DATABASE_URL= pnpm --filter @project/database exec vitest run src/__tests__/sampleRosterIds.test.ts`
Expected: FAIL — `SAMPLE_RACES` is not exported, so `idsOf(SAMPLE_RACES)` throws `TypeError` at module load.

Run: `pnpm --filter @project/server typecheck`
Expected: FAIL — `Property 'expectedIssues' does not exist on type 'SampleCharacter'`.

- [ ] **Step 3: Create the scenario module**

Create `packages/database/src/sampleScenarioCharacters.ts`:

```ts
/**
 * Development fixture: ten scenario characters, seeded beside the ten in
 * seedSampleCharacters.ts by the same `db:seed:samples`.
 *
 * The first ten are a coverage set - between them they fill every slot,
 * reset condition and hit point state. These ten are each staged for a hand
 * check a unit test cannot reach: a level-up one level away, a divergence
 * that needs two tabs, a Tier 2 pass that has nothing to verify against yet,
 * or data the UI cannot create. docs/development/sample-characters.md holds
 * the script for each one, and every `testFocus` names the backlog items it
 * exercises.
 *
 * Two are broken on purpose. Brother Mote's level column disagrees with his
 * ledger and several of his totals sit above their maxima; Orrik Stonehide's
 * race and subclass are content the pack does not author. Neither is a
 * mistake to tidy up.
 *
 * Ability scores are stored pre-racial (#73) and include every ability score
 * increase already taken. maxHp is base rolled hit points (#78): the first
 * level's full die, then the average after it.
 */
import type {
  SampleBackground,
  SampleCharacter,
  SampleItem,
  SampleRace,
  SampleSubclass,
} from "./seedSampleCharacters.js";

// #region Reference Stubs

const SCENARIO_RACES: SampleRace[] = [];

const SCENARIO_SUBCLASSES: SampleSubclass[] = [];

const SCENARIO_BACKGROUNDS: SampleBackground[] = [];

const SCENARIO_ITEMS: SampleItem[] = [];

// #endregion

// #region Roster

const SCENARIO_ROSTER: SampleCharacter[] = [];

// #endregion

export {
  SCENARIO_BACKGROUNDS,
  SCENARIO_ITEMS,
  SCENARIO_RACES,
  SCENARIO_ROSTER,
  SCENARIO_SUBCLASSES,
};
```

The imports are `import type` only, so there is no runtime import cycle with the seeder, which imports this module's values.

- [ ] **Step 4: Rewire the seeder**

All in `packages/database/src/seedSampleCharacters.ts`.

4a. In the header comment, replace the first line and rule 2:

```ts
 * Development fixture: twenty sample characters on stable URLs - the ten
 * coverage characters below, and the ten scenario characters in
 * sampleScenarioCharacters.ts, each staged for one hand check.
```

```ts
 * 2. Operational writes touch only the twenty fixed ids in ROSTER. Child rows
 *    for those ids are cleared and rewritten so re-running is idempotent; no
 *    other character is read or modified.
```

4b. Imports. Change `import { backgrounds, items, subclasses } from "./schema/reference.js";` to `import { backgrounds, items, races, subclasses } from "./schema/reference.js";` and add, after the `./schema/operational.js` import:

```ts
import {
  SCENARIO_BACKGROUNDS,
  SCENARIO_ITEMS,
  SCENARIO_RACES,
  SCENARIO_ROSTER,
  SCENARIO_SUBCLASSES,
} from "./sampleScenarioCharacters.js";
```

4c. Subclasses. Directly after the line `// #region Reference Stubs - Subclasses` (and its blank line), above the doc comment that begins "Subclasses the roster needs", insert:

```ts
interface SampleSubclass {
  id: string;
  parentClassId: string;
  name: string;
  shortDescription: string;
}

```

Then replace `const SAMPLE_SUBCLASSES = [` with `const BASE_SUBCLASSES: SampleSubclass[] = [` (the doc comment stays attached to it), change that array's closing `] as const;` to `];`, and add directly after it:

```ts

/** Every subclass stub the seed writes: the ones above, then the scenario set's. */
const SAMPLE_SUBCLASSES: SampleSubclass[] = [
  ...BASE_SUBCLASSES,
  ...SCENARIO_SUBCLASSES,
];
```

4d. Backgrounds. Directly after the line `// #region Reference Stubs - Backgrounds` (and its blank line), above the doc comment that begins "Backgrounds beyond the four", insert:

```ts
interface SampleBackground {
  id: string;
  name: string;
  featureName: string;
  featureDescription: string;
  shortDescription: string;
}

```

Then replace `const SAMPLE_BACKGROUNDS = [` with `const BASE_BACKGROUNDS: SampleBackground[] = [`, change that array's closing `] as const;` to `];`, and add directly after it:

```ts

/** Every background stub the seed writes: the ones above, then the scenario set's. */
const SAMPLE_BACKGROUNDS: SampleBackground[] = [
  ...BASE_BACKGROUNDS,
  ...SCENARIO_BACKGROUNDS,
];
```

4e. Races. Immediately after the backgrounds region's `// #endregion`, add a new region:

```ts

// #region Reference Stubs - Races

interface SampleRace {
  id: string;
  name: string;
  speed: number;
  shortDescription: string;
}

/**
 * Races the pack does not author. The coverage ten need none; the scenario
 * set's Orrik Stonehide is a Goliath on purpose, so the sheet meets a race the
 * rule snapshot cannot resolve.
 */
const SAMPLE_RACES: SampleRace[] = [...SCENARIO_RACES];

// #endregion
```

4f. Items. Replace `const SAMPLE_ITEMS: SampleItem[] = [` with `const BASE_ITEMS: SampleItem[] = [`, and directly after that array's closing `];` add:

```ts

/** Every item stub the seed writes: the ones above, then the scenario set's. */
const SAMPLE_ITEMS: SampleItem[] = [...BASE_ITEMS, ...SCENARIO_ITEMS];
```

4g. `SampleCharacter`. Add two fields directly after `choices?: CharacterChoices;`:

```ts
  /**
   * Written to characters.level in place of the ledger sum. Only Brother Mote
   * sets it: a row whose level disagrees with its ledger is what #95 cannot
   * repair, and the UI cannot create one.
   */
  levelColumn?: number;
  /**
   * The save-issue codes this character is built to raise. Only Orrik
   * Stonehide declares any; sampleCharacterChoices.test.ts holds every
   * character to exactly these.
   */
  expectedIssues?: string[];
```

4h. Roster. Replace `const ROSTER: SampleCharacter[] = [` with `const BASE_ROSTER: SampleCharacter[] = [`. Directly after that array's closing `];` — the one immediately above `// #endregion` and `// #region Seeding` — add:

```ts

/** Every character the seed writes: the coverage ten, then the scenario ten. */
const ROSTER: SampleCharacter[] = [...BASE_ROSTER, ...SCENARIO_ROSTER];
```

4i. `seedReferenceStubs`. Insert at the top of the function body, before the subclasses insert:

```ts
  // drizzle refuses an empty values list, and the coverage ten need no race
  if (SAMPLE_RACES.length > 0) {
    await db
      .insert(races)
      .values(
        SAMPLE_RACES.map((race) => ({
          id: race.id,
          name: race.name,
          speed: race.speed,
          requiresSubrace: false,
          lore: { shortDescription: race.shortDescription },
          ...packStamp,
        })),
      )
      .onConflictDoNothing({ target: races.id });
  }

```

4j. `seedCharacter`. Replace `const level = totalLevelOf(character);` with:

```ts
  // the ledger decides, except where a character exists to disagree with it
  const level = character.levelColumn ?? totalLevelOf(character);
```

4k. `run`. Replace the closing message's `` `\nAll ten sit in campaign ${CAMPAIGN_ID}, ...` `` text so it reads the count:

```ts
  console.log(
    `\nAll ${ROSTER.length} sit in campaign ${CAMPAIGN_ID}, owned by '${OWNER_USER_ID}' - the id the web client sends as x-tester-id.`,
  );
```

4l. Exports. Replace the final export block with:

```ts
export {
  ROSTER,
  SAMPLE_BACKGROUNDS,
  SAMPLE_ITEMS,
  SAMPLE_PACK_ID,
  SAMPLE_RACES,
  SAMPLE_SUBCLASSES,
  SHEET_URL_BASE,
};

export type {
  SampleBackground,
  SampleCharacter,
  SampleItem,
  SampleRace,
  SampleSubclass,
};
```

- [ ] **Step 5: Restore line endings**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' packages/database/src/sampleScenarioCharacters.ts packages/database/src/seedSampleCharacters.ts packages/database/src/__tests__/sampleRosterIds.test.ts apps/server/src/services/__tests__/sampleCharacterChoices.test.ts
```

- [ ] **Step 6: Run the tests and both typechecks to verify they pass**

Run: `DATABASE_URL= pnpm --filter @project/database test`
Expected: PASS, including `gives every character its own id` and `seedSampleCharacters import` (still 10).

Run: `DATABASE_URL= pnpm --filter @project/server exec vitest run src/services/__tests__/sampleCharacter`
Expected: PASS — the choices, scores and hit point suites, ten cases each.

Run: `pnpm --filter @project/database typecheck && pnpm --filter @project/server typecheck`
Expected: both exit 0.

Run: `pnpm check:hygiene`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/database/src/sampleScenarioCharacters.ts packages/database/src/seedSampleCharacters.ts packages/database/src/__tests__/sampleRosterIds.test.ts apps/server/src/services/__tests__/sampleCharacterChoices.test.ts
git commit -F - <<'EOF'
feat(database): the sample seed takes a second roster, race stubs and declared issues

The seed now concatenates its coverage ten with a scenario module that is
empty for now, inserts race stubs the same way as every other stub, can
write a level column that disagrees with the ledger (#95), and lets a
character declare the save issues it is built to raise.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: The level-up staging three — Quill Ashgrove, Brannoc Hale, Isolde Varn

**Files:**
- Modify: `packages/database/src/sampleScenarioCharacters.ts`
- Test: `apps/server/src/services/__tests__/sampleCharacterScores.test.ts`, `apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts`, `packages/database/src/__tests__/seedSampleCharactersImport.test.ts`

**Interfaces:**
- Consumes: `SampleCharacter` (Task 1), `SCENARIO_ROSTER` (Task 1).

- [ ] **Step 1: Write the failing tests**

In `sampleCharacterScores.test.ts`, add to the end of `INTENDED_FINAL` (after `"Dame Sable Orrin"`):

```ts
  // the scenario set was authored pre-racial from the start
  "Quill Ashgrove": [8, 16, 14, 15, 12, 10],
  "Brannoc Hale": [16, 12, 15, 10, 13, 8],
  "Isolde Varn": [8, 16, 14, 13, 10, 15],
```

In `sampleCharacterHitPoints.test.ts`, add to the end of `EXPECTED_MAX_HP`:

```ts
  "Quill Ashgrove": 17,
  // Dwarven Toughness: +1 per level
  "Brannoc Hale": 31,
  "Isolde Varn": 31,
```

In `seedSampleCharactersImport.test.ts`, change `expect(ROSTER).toHaveLength(10);` to `expect(ROSTER).toHaveLength(13);`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `DATABASE_URL= pnpm --filter @project/server exec vitest run src/services/__tests__/sampleCharacterScores.test.ts`
Expected: FAIL — `covers every sample`: the table names three characters the roster lacks.

Run: `DATABASE_URL= pnpm --filter @project/database exec vitest run src/__tests__/seedSampleCharactersImport.test.ts`
Expected: FAIL — expected length 13, received 10.

- [ ] **Step 3: Add the three characters**

In `sampleScenarioCharacters.ts`, replace `const SCENARIO_ROSTER: SampleCharacter[] = [];` with:

```ts
const SCENARIO_ROSTER: SampleCharacter[] = [
  {
    id: "00000000-0000-0000-0000-000000000120",
    name: "Quill Ashgrove",
    raceId: "race_gnome",
    subraceId: "subrace_gnome_forest",
    classes: [{ classId: "class_rogue", classLevel: 2 }],
    backgroundId: "background_folk_hero",
    choices: {
      feats: [],
      classSelections: {},
      traitSelections: {
        rogue_starting_skills: [
          "deception",
          "investigation",
          "perception",
          "stealth",
        ],
      },
    },
    alignment: "Neutral Good",
    str: 8,
    dex: 15,
    con: 14,
    int: 13,
    wis: 12,
    cha: 10,
    maxHp: 13,
    currentHp: 17,
    testFocus:
      "Staging: level to 3 for Arcane Trickster (#65b, #31a); Expertise and Sneak Attack absent (#66); Folk Hero grants nothing (#70).",
    personalityTraits:
      "I narrate my own heists under my breath, with footnotes.",
    ideals: "Curiosity. A lock is a question somebody forgot to answer.",
    bonds: "The village that hid me from the reeve still leaves a lamp lit.",
    flaws: "I will open the one door everybody agreed to leave shut.",
    traits: [
      {
        traitId: "trait_rogue_prof_saving_throw",
        source: "class_rogue_level_1",
      },
      { traitId: "trait_rogue_prof_armor", source: "class_rogue_level_1" },
      { traitId: "trait_rogue_prof_weapons", source: "class_rogue_level_1" },
      { traitId: "trait_rogue_prof_tools", source: "class_rogue_level_1" },
      { traitId: "trait_rogue_prof_skills", source: "class_rogue_level_1" },
      { traitId: "trait_expertise", source: "class_rogue_level_1" },
      { traitId: "trait_sneak_attack", source: "class_rogue_level_1" },
      { traitId: "trait_thieves_cant", source: "class_rogue_level_1" },
      { traitId: "trait_cunning_action", source: "class_rogue_level_2" },
      { traitId: "race_gnome_asi", source: "race_gnome" },
      { traitId: "race_gnome_darkvision", source: "race_gnome" },
      { traitId: "gnome_cunning", source: "race_gnome" },
      { traitId: "race_gnome_languages", source: "race_gnome" },
      { traitId: "subrace_gnome_forest_asi", source: "subrace_gnome_forest" },
      { traitId: "natural_illusionist", source: "subrace_gnome_forest" },
      { traitId: "speak_with_small_beasts", source: "subrace_gnome_forest" },
    ],
    inventory: [
      { itemId: "item_armor_leather", slot: "body" },
      { itemId: "item_weapon_shortsword", slot: "main_hand" },
      { itemId: "item_weapon_shortbow" },
      { itemId: "item_ammo_arrow", quantity: 20 },
      { itemId: "item_tool_thieves_tools" },
      { itemId: "item_pack_burglars" },
      { itemId: "item_potion_healing" },
    ],
    resources: [
      {
        id: "resource_hit_dice_d8",
        name: "Hit Dice (d8)",
        current: 2,
        max: 2,
        resetCondition: "long_rest_half",
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000121",
    name: "Brannoc Hale",
    raceId: "race_dwarf",
    subraceId: "subrace_dwarf_hill",
    classes: [
      {
        classId: "class_fighter",
        classLevel: 3,
        subclassId: "subclass_fighter_champion",
      },
    ],
    backgroundId: "background_soldier",
    choices: {
      feats: [],
      classSelections: {
        class_fighter: { fighter_level_1_fighting_style: ["trait_fs_dueling"] },
      },
      traitSelections: {
        dwarf_artisan_tools: ["masons_tools"],
        soldier_gaming_set: ["playing_card_set"],
        fighter_starting_skills: ["perception", "survival"],
      },
    },
    alignment: "Lawful Good",
    str: 16,
    dex: 12,
    con: 13,
    int: 10,
    wis: 12,
    cha: 8,
    maxHp: 22,
    currentHp: 31,
    testFocus:
      "Staging: level to 4 with +1 CON for the review-step gap (#88) and a double-clicked submit (#94); Dueling never applies (#24).",
    personalityTraits: "I count everything twice: exits, coins, friends.",
    ideals: "Responsibility. I do what I said, then I say what I did.",
    bonds: "My company's banner hangs in a hall I have not been back to.",
    flaws: "I take an order from anyone who sounds like a sergeant.",
    traits: [
      {
        traitId: "trait_fighter_prof_saving_throw",
        source: "class_fighter_level_1",
      },
      { traitId: "trait_fighter_prof_armor", source: "class_fighter_level_1" },
      {
        traitId: "trait_fighter_prof_weapons",
        source: "class_fighter_level_1",
      },
      { traitId: "trait_fighter_prof_skills", source: "class_fighter_level_1" },
      { traitId: "trait_second_wind", source: "class_fighter_level_1" },
      { traitId: "trait_action_surge", source: "class_fighter_level_2" },
      { traitId: "trait_martial_archetype", source: "class_fighter_level_3" },
      {
        traitId: "trait_improved_critical",
        source: "subclass_fighter_champion_level_3",
      },
      { traitId: "race_dwarf_asi", source: "race_dwarf" },
      { traitId: "race_dwarf_darkvision", source: "race_dwarf" },
      { traitId: "dwarven_resilience", source: "race_dwarf" },
      { traitId: "dwarven_combat_training", source: "race_dwarf" },
      { traitId: "tool_proficiency", source: "race_dwarf" },
      { traitId: "stonecutting", source: "race_dwarf" },
      { traitId: "race_dwarf_languages", source: "race_dwarf" },
      { traitId: "subrace_dwarf_hill_asi", source: "subrace_dwarf_hill" },
      { traitId: "dwarven_toughness", source: "subrace_dwarf_hill" },
    ],
    inventory: [
      { itemId: "item_armor_chain_mail", slot: "body" },
      // the off hand stays empty: Dueling asks for one weapon and nothing else
      { itemId: "item_weapon_longsword", slot: "main_hand" },
      { itemId: "item_weapon_crossbow_light" },
      { itemId: "item_ammo_bolt", quantity: 20 },
      { itemId: "item_pack_dungeoneers" },
      { itemId: "item_potion_healing" },
    ],
    resources: [
      {
        id: "trait_second_wind",
        name: "Second Wind",
        current: 1,
        max: 1,
        resetCondition: "short_rest",
      },
      {
        id: "trait_action_surge",
        name: "Action Surge",
        current: 1,
        max: 1,
        resetCondition: "short_rest",
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000122",
    name: "Isolde Varn",
    raceId: "race_elf",
    subraceId: "subrace_elf_high",
    classes: [
      {
        classId: "class_warlock",
        classLevel: 4,
        subclassId: "subclass_warlock_archfey",
      },
    ],
    backgroundId: "background_noble",
    choices: {
      // the level-4 increase, taken as a feat: the first on any sample
      feats: ["feat_alert"],
      classSelections: {
        class_warlock: {
          warlock_level_2_invocations: [
            "trait_invocation_beast_speech",
            "trait_invocation_eldritch_sight",
          ],
          warlock_level_3_pact_boon: ["trait_pact_of_the_chain"],
        },
      },
      traitSelections: {
        elf_high_choice_extra_lang: ["sylvan"],
        // a pack spell that stays a wizard cantrip once #31a gives spells levels
        high_elf_cantrip: ["spell_minor_illusion"],
        noble_gaming_set: ["three_dragon_ante_set"],
        noble_language: ["celestial"],
        warlock_starting_skills: ["arcana", "deception"],
      },
    },
    alignment: "Chaotic Neutral",
    str: 8,
    dex: 14,
    con: 14,
    int: 12,
    wis: 10,
    cha: 15,
    maxHp: 23,
    currentHp: 20,
    testFocus:
      "Staging: level to 5 for invocation prerequisites against Pact of the Chain (#81); Alert reaches initiative; no familiar actor (#36).",
    personalityTraits: "I thank the air before I speak to it, and it answers.",
    ideals: "Freedom. A bargain is only as good as the way out of it.",
    bonds: "The Summer Court holds a promise I made at nine years old.",
    flaws: "I cannot refuse a wager, least of all one I should.",
    traits: [
      {
        traitId: "trait_warlock_prof_saving_throw",
        source: "class_warlock_level_1",
      },
      { traitId: "trait_warlock_prof_armor", source: "class_warlock_level_1" },
      {
        traitId: "trait_warlock_prof_weapons",
        source: "class_warlock_level_1",
      },
      { traitId: "trait_warlock_prof_skills", source: "class_warlock_level_1" },
      { traitId: "trait_otherworldly_patron", source: "class_warlock_level_1" },
      { traitId: "trait_pact_magic", source: "class_warlock_level_1" },
      {
        traitId: "trait_archfey_expanded_spells",
        source: "subclass_warlock_archfey_level_1",
      },
      {
        traitId: "trait_fey_presence",
        source: "subclass_warlock_archfey_level_1",
      },
      { traitId: "race_elf_asi", source: "race_elf" },
      { traitId: "race_elf_darkvision", source: "race_elf" },
      { traitId: "keen_senses", source: "race_elf" },
      { traitId: "fey_ancestry", source: "race_elf" },
      { traitId: "trance", source: "race_elf" },
      { traitId: "race_elf_languages", source: "race_elf" },
      { traitId: "subrace_elf_high_asi", source: "subrace_elf_high" },
      { traitId: "elf_weapon_training", source: "subrace_elf_high" },
      { traitId: "subrace_elf_high_cantrip", source: "subrace_elf_high" },
      {
        traitId: "subrace_elf_high_extra_language",
        source: "subrace_elf_high",
      },
    ],
    inventory: [
      { itemId: "item_armor_leather", slot: "body" },
      { itemId: "item_weapon_dagger", slot: "main_hand" },
      { itemId: "item_focus_rod" },
      { itemId: "item_gear_component_pouch" },
      { itemId: "item_clothes_fine" },
      { itemId: "item_ring_signet" },
      { itemId: "item_scroll_pedigree" },
    ],
    resources: [
      {
        id: "pact_slots",
        name: "Pact Magic Slots",
        current: 1,
        max: 2,
        resetCondition: "short_rest",
      },
    ],
  },
];
```

- [ ] **Step 4: Restore line endings**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' packages/database/src/sampleScenarioCharacters.ts apps/server/src/services/__tests__/sampleCharacterScores.test.ts apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts packages/database/src/__tests__/seedSampleCharactersImport.test.ts
```

- [ ] **Step 5: Run the tests and typechecks to verify they pass**

Run: `DATABASE_URL= pnpm --filter @project/database test`
Expected: PASS (roster ids, uniqueness, import length 13).

Run: `DATABASE_URL= pnpm --filter @project/server exec vitest run src/services/__tests__/sampleCharacter`
Expected: PASS — 13 cases per suite; every new character answers every question (zero issues), reaches its final scores and derives its maximum.

Run: `pnpm --filter @project/database typecheck && pnpm --filter @project/server typecheck`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/database/src/sampleScenarioCharacters.ts apps/server/src/services/__tests__/sampleCharacterScores.test.ts apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts packages/database/src/__tests__/seedSampleCharactersImport.test.ts
git commit -F - <<'EOF'
feat(database): three samples staged one level short of a level-up check

Quill Ashgrove (rogue 2, for Arcane Trickster at 3), Brannoc Hale (fighter
3, CON 15, for the ability score increase at 4 - #88, #94) and Isolde Varn
(warlock 4 on Pact of the Chain, for invocation prerequisites at 5 - #81).
Isolde carries Alert, the first feat on any sample.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: The two-tab pair — Ursk Gravemaw, Tamsin Burrowdeep

**Files:**
- Modify: `packages/database/src/sampleScenarioCharacters.ts`
- Test: `apps/server/src/services/__tests__/sampleCharacterScores.test.ts`, `apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts`, `packages/database/src/__tests__/seedSampleCharactersImport.test.ts`

**Interfaces:**
- Consumes: `SampleCharacter`, `SCENARIO_ROSTER` (Task 1); the three entries from Task 2.

- [ ] **Step 1: Write the failing tests**

Add to the end of `INTENDED_FINAL`:

```ts
  "Ursk Gravemaw": [17, 10, 14, 8, 10, 14],
  "Tamsin Burrowdeep": [16, 16, 16, 8, 12, 8],
```

Add to the end of `EXPECTED_MAX_HP`:

```ts
  // Tough: +2 per level
  "Ursk Gravemaw": 54,
  "Tamsin Burrowdeep": 65,
```

Change the import test's `toHaveLength(13)` to `toHaveLength(15)`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `DATABASE_URL= pnpm --filter @project/server exec vitest run src/services/__tests__/sampleCharacterScores.test.ts`
Expected: FAIL — `covers every sample`.

- [ ] **Step 3: Add the two characters**

In `sampleScenarioCharacters.ts`, insert these two entries at the end of `SCENARIO_ROSTER`, after Isolde Varn's closing `},` and before the array's closing `];`:

```ts
  {
    id: "00000000-0000-0000-0000-000000000123",
    name: "Ursk Gravemaw",
    raceId: "race_half_orc",
    classes: [
      {
        classId: "class_paladin",
        classLevel: 5,
        subclassId: "subclass_paladin_vengeance",
      },
    ],
    backgroundId: "background_criminal",
    choices: {
      // the level-4 increase, taken as a feat
      feats: ["feat_tough"],
      classSelections: {
        class_paladin: {
          paladin_level_2_fighting_style: ["trait_fs_great_weapon_fighting"],
        },
      },
      traitSelections: {
        criminal_gaming_set: ["three_dragon_ante_set"],
        paladin_starting_skills: ["athletics", "insight"],
      },
    },
    alignment: "Lawful Neutral",
    str: 15,
    dex: 10,
    con: 13,
    int: 8,
    wis: 10,
    cha: 14,
    maxHp: 34,
    currentHp: 6,
    testFocus:
      "Two tabs: low hit points with Relentless Endurance unspent (#92, #93); Tough per level; the dip menu refuses wizard on INT (#77).",
    personalityTraits: "I apologise to people after I have hit them, sincerely.",
    ideals: "Retribution. The ledger balances, one way or the other.",
    bonds: "The gang that raised me is the first name on my oath's list.",
    flaws: "I remember every slight, and I keep the list in order.",
    traits: [
      {
        traitId: "trait_paladin_prof_saving_throw",
        source: "class_paladin_level_1",
      },
      { traitId: "trait_paladin_prof_armor", source: "class_paladin_level_1" },
      {
        traitId: "trait_paladin_prof_weapons",
        source: "class_paladin_level_1",
      },
      { traitId: "trait_paladin_prof_skills", source: "class_paladin_level_1" },
      { traitId: "trait_divine_sense", source: "class_paladin_level_1" },
      { traitId: "trait_lay_on_hands", source: "class_paladin_level_1" },
      { traitId: "trait_divine_smite", source: "class_paladin_level_2" },
      { traitId: "trait_spellcasting_paladin", source: "class_paladin_level_2" },
      { traitId: "trait_divine_health", source: "class_paladin_level_3" },
      { traitId: "trait_sacred_oath", source: "class_paladin_level_3" },
      { traitId: "trait_extra_attack", source: "class_paladin_level_5" },
      {
        traitId: "trait_vengeance_oath_spells",
        source: "subclass_paladin_vengeance_level_3",
      },
      {
        traitId: "trait_cd_abjure_enemy",
        source: "subclass_paladin_vengeance_level_3",
      },
      {
        traitId: "trait_cd_vow_of_enmity",
        source: "subclass_paladin_vengeance_level_3",
      },
      { traitId: "race_half_orc_asi", source: "race_half_orc" },
      { traitId: "race_half_orc_darkvision", source: "race_half_orc" },
      { traitId: "menacing", source: "race_half_orc" },
      { traitId: "relentless_endurance", source: "race_half_orc" },
      { traitId: "savage_attacks", source: "race_half_orc" },
      { traitId: "race_half_orc_languages", source: "race_half_orc" },
    ],
    inventory: [
      { itemId: "item_armor_chain_mail", slot: "body" },
      { itemId: "item_weapon_greatsword", slot: "main_hand" },
      { itemId: "item_weapon_javelin", quantity: 5 },
      { itemId: "item_focus_emblem" },
      { itemId: "item_pack_explorers" },
      // the pack's potion, which carries a drink action that heals
      { itemId: "item_potion_of_healing", quantity: 2 },
    ],
    resources: [
      {
        // unspent on purpose: #92 needs the charge to fire once in each tab
        id: "resource_relentless_endurance",
        name: "Relentless Endurance Use",
        current: 1,
        max: 1,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_1",
        name: "1st-Level Spell Slots",
        current: 2,
        max: 4,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_2",
        name: "2nd-Level Spell Slots",
        current: 2,
        max: 2,
        resetCondition: "long_rest",
      },
      {
        id: "resource_hit_dice_d10",
        name: "Hit Dice (d10)",
        current: 3,
        max: 5,
        resetCondition: "long_rest_half",
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000124",
    name: "Tamsin Burrowdeep",
    raceId: "race_halfling",
    subraceId: "subrace_halfling_stout",
    classes: [
      {
        classId: "class_barbarian",
        classLevel: 6,
        subclassId: "subclass_barbarian_totem_warrior",
      },
    ],
    backgroundId: "background_outlander",
    choices: {
      feats: [],
      classSelections: {
        class_barbarian: {
          barbarian_totem_level_3_totem_spirit: ["trait_totem_spirit_eagle"],
          barbarian_totem_level_6_aspect: ["trait_aspect_of_the_beast_eagle"],
        },
      },
      traitSelections: {
        barbarian_starting_skills: ["athletics", "perception"],
      },
    },
    alignment: "Chaotic Good",
    str: 16,
    dex: 14,
    con: 15,
    int: 8,
    wis: 12,
    cha: 8,
    maxHp: 47,
    currentHp: 30,
    testFocus:
      "Plate carried, not worn: Eagle Dash gated by heavy armour (#76, #97, #99); a second tab's equip and attune recompose the first (#101).",
    personalityTraits: "I climb whatever is tallest, then report back.",
    ideals: "Freedom. The sky does not ask anyone's leave.",
    bonds: "An eagle took my brother's lamb once. I have been chasing it since.",
    flaws: "I treat every closed door as a personal challenge.",
    traits: [
      {
        traitId: "trait_barbarian_prof_armor",
        source: "class_barbarian_level_1",
      },
      {
        traitId: "trait_barbarian_prof_weapons",
        source: "class_barbarian_level_1",
      },
      {
        traitId: "trait_barbarian_prof_saving_throw",
        source: "class_barbarian_level_1",
      },
      {
        traitId: "trait_barbarian_prof_skills",
        source: "class_barbarian_level_1",
      },
      { traitId: "trait_rage", source: "class_barbarian_level_1" },
      {
        traitId: "trait_unarmored_defense_barbarian",
        source: "class_barbarian_level_1",
      },
      { traitId: "trait_reckless_attack", source: "class_barbarian_level_2" },
      { traitId: "trait_danger_sense", source: "class_barbarian_level_2" },
      { traitId: "trait_extra_attack", source: "class_barbarian_level_5" },
      { traitId: "trait_fast_movement", source: "class_barbarian_level_5" },
      {
        traitId: "trait_spirit_seeker",
        source: "subclass_barbarian_totem_warrior_level_3",
      },
      { traitId: "race_halfling_asi", source: "race_halfling" },
      { traitId: "lucky", source: "race_halfling" },
      { traitId: "brave", source: "race_halfling" },
      { traitId: "halfling_nimbleness", source: "race_halfling" },
      { traitId: "race_halfling_languages", source: "race_halfling" },
      {
        traitId: "subrace_halfling_stout_asi",
        source: "subrace_halfling_stout",
      },
      { traitId: "stout_resilience", source: "subrace_halfling_stout" },
    ],
    inventory: [
      // body slot empty: Unarmoured Defence, and Eagle Dash while raging
      // a heavy weapon on a Small creature, which nothing models
      { itemId: "item_weapon_maul", slot: "main_hand" },
      // carried, not worn: equipping it is the live check
      { itemId: "item_armor_plate" },
      // worn but not attuned: attuning it from a second tab is the #101 check
      { itemId: "item_wondrous_cloak_of_protection", slot: "cloak" },
      { itemId: "item_weapon_javelin", quantity: 4 },
      { itemId: "item_pack_explorers" },
      { itemId: "item_potion_healing" },
    ],
    resources: [
      {
        id: "resource_barbarian_rage",
        name: "Rage",
        current: 2,
        max: 4,
        resetCondition: "long_rest",
      },
      {
        id: "resource_hit_dice_d12",
        name: "Hit Dice (d12)",
        current: 4,
        max: 6,
        resetCondition: "long_rest_half",
      },
    ],
  },
```

- [ ] **Step 4: Restore line endings**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' packages/database/src/sampleScenarioCharacters.ts apps/server/src/services/__tests__/sampleCharacterScores.test.ts apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts packages/database/src/__tests__/seedSampleCharactersImport.test.ts
```

- [ ] **Step 5: Run the tests and typechecks to verify they pass**

Run: `DATABASE_URL= pnpm --filter @project/database test` — PASS (import length 15).
Run: `DATABASE_URL= pnpm --filter @project/server exec vitest run src/services/__tests__/sampleCharacter` — PASS, 15 cases per suite.
Run: `pnpm --filter @project/database typecheck && pnpm --filter @project/server typecheck` — both exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/database/src/sampleScenarioCharacters.ts apps/server/src/services/__tests__/sampleCharacterScores.test.ts apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts packages/database/src/__tests__/seedSampleCharactersImport.test.ts
git commit -F - <<'EOF'
feat(database): two samples staged for two-tab and socket checks

Ursk Gravemaw (half-orc paladin at 6 hit points with Relentless Endurance
unspent - #92, #93 - and Tough) and Tamsin Burrowdeep (Eagle totem
barbarian carrying unworn plate - #76, #97, #99, #101).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: The next-pass previews — Hesk Mossgather, Seraphine Dusk, Kestrel Vey

**Files:**
- Modify: `packages/database/src/sampleScenarioCharacters.ts`
- Test: `apps/server/src/services/__tests__/sampleCharacterScores.test.ts`, `apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts`, `packages/database/src/__tests__/seedSampleCharactersImport.test.ts`

**Interfaces:**
- Consumes: `SampleCharacter`, `SCENARIO_ROSTER` (Task 1); the entries from Tasks 2 and 3.

- [ ] **Step 1: Write the failing tests**

Add to the end of `INTENDED_FINAL`:

```ts
  "Hesk Mossgather": [11, 13, 15, 11, 18, 9],
  "Seraphine Dusk": [8, 16, 8, 18, 12, 11],
  "Kestrel Vey": [10, 14, 14, 10, 12, 18],
```

Add to the end of `EXPECTED_MAX_HP`:

```ts
  "Hesk Mossgather": 59,
  // #86: the rules give 29. CON 8 is -1 per level, and calculateMaxHp floors
  // the modifier at +1, so nine levels come out 18 too high. Fixing #86 turns
  // this red on purpose; update it to 29 then.
  "Seraphine Dusk": 47,
  "Kestrel Vey": 44,
```

Change the import test's `toHaveLength(15)` to `toHaveLength(18)`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `DATABASE_URL= pnpm --filter @project/server exec vitest run src/services/__tests__/sampleCharacterScores.test.ts`
Expected: FAIL — `covers every sample`.

- [ ] **Step 3: Add the three characters**

Insert at the end of `SCENARIO_ROSTER`, after Tamsin Burrowdeep's closing `},`:

```ts
  {
    id: "00000000-0000-0000-0000-000000000125",
    name: "Hesk Mossgather",
    raceId: "race_human",
    classes: [
      {
        classId: "class_druid",
        classLevel: 8,
        subclassId: "subclass_druid_moon",
      },
    ],
    customBackgroundData: {
      name: "Grove Warden",
      featureName: "Standing Stones",
      featureDescription:
        "The keepers of the old groves know your face, and will hide you in the one place their hunters will not follow.",
    },
    // both carry a choice block no question ever asks (#80)
    customTraitIds: ["trait_acolyte_languages", "trait_soldier_prof_tools"],
    choices: {
      feats: [],
      classSelections: {},
      traitSelections: {
        human_language_choice: ["sylvan"],
        druid_starting_skills: ["animal_handling", "nature"],
      },
    },
    alignment: "True Neutral",
    str: 10,
    dex: 12,
    con: 14,
    int: 10,
    wis: 17,
    cha: 8,
    maxHp: 43,
    currentHp: 41,
    testFocus:
      "Wild Shape preview: its pool is stored but has no rule to show it (#62); slots with no spells listed (#83); an unasked custom-background choice (#80).",
    personalityTraits: "I talk to the weather as if it owed me money.",
    ideals: "Balance. The forest takes back what the town forgets it borrowed.",
    bonds: "The oak at Gallowmere is older than the kingdom and I am its keeper.",
    flaws: "I trust a wolf's word over a mayor's.",
    traits: [
      { traitId: "trait_druid_prof_saving_throw", source: "class_druid_level_1" },
      { traitId: "trait_druid_prof_armor", source: "class_druid_level_1" },
      { traitId: "trait_druid_prof_weapons", source: "class_druid_level_1" },
      { traitId: "trait_druid_prof_tools", source: "class_druid_level_1" },
      { traitId: "trait_druid_prof_skills", source: "class_druid_level_1" },
      { traitId: "trait_druidic", source: "class_druid_level_1" },
      { traitId: "trait_spellcasting_druid", source: "class_druid_level_1" },
      { traitId: "trait_wild_shape", source: "class_druid_level_2" },
      { traitId: "trait_druid_circle", source: "class_druid_level_2" },
      {
        traitId: "trait_wild_shape_improvement",
        source: "class_druid_level_4",
      },
      { traitId: "trait_druid_circle_feature", source: "class_druid_level_6" },
      {
        traitId: "trait_combat_wild_shape",
        source: "subclass_druid_moon_level_2",
      },
      { traitId: "trait_wild_form", source: "subclass_druid_moon_level_2" },
      { traitId: "trait_primal_strike", source: "subclass_druid_moon_level_6" },
      { traitId: "race_human_asi", source: "race_human" },
      { traitId: "race_human_languages", source: "race_human" },
    ],
    inventory: [
      { itemId: "item_armor_hide", slot: "body" },
      { itemId: "item_weapon_scimitar", slot: "main_hand" },
      { itemId: "item_armor_shield", slot: "off_hand" },
      { itemId: "item_focus_sprig_of_mistletoe" },
      { itemId: "item_healers_kit" },
      { itemId: "item_pack_explorers" },
    ],
    resources: [
      {
        // no rule behind it yet (#62), so the sheet does not show it
        id: "trait_wild_shape",
        name: "Wild Shape",
        current: 1,
        max: 2,
        resetCondition: "short_rest",
      },
      {
        id: "spell_slots_1",
        name: "1st-Level Spell Slots",
        current: 2,
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
        current: 1,
        max: 3,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_4",
        name: "4th-Level Spell Slots",
        current: 2,
        max: 2,
        resetCondition: "long_rest",
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000126",
    name: "Seraphine Dusk",
    raceId: "race_elf",
    subraceId: "subrace_elf_dark",
    classes: [
      {
        classId: "class_wizard",
        classLevel: 9,
        subclassId: "subclass_wizard_divination",
      },
    ],
    backgroundId: "background_sage",
    choices: {
      feats: [],
      classSelections: {},
      traitSelections: {
        wizard_starting_skills: ["arcana", "history"],
      },
    },
    alignment: "Lawful Neutral",
    str: 8,
    dex: 14,
    con: 8,
    int: 18,
    wis: 12,
    cha: 10,
    maxHp: 38,
    currentHp: 33,
    testFocus:
      "Wizard preview: CON 8 overstates the maximum (#86); a spellbook that lists nothing (#31a, #83); Drow Magic at dawn.",
    personalityTraits:
      "I annotate other people's sentences while they are still saying them.",
    ideals: "Knowledge. The future is only a text nobody has read carefully.",
    bonds: "I stole my first spellbook from a matron who still wants it back.",
    flaws: "I would rather be right in private than useful in public.",
    traits: [
      {
        traitId: "trait_wizard_prof_saving_throw",
        source: "class_wizard_level_1",
      },
      { traitId: "trait_wizard_prof_weapons", source: "class_wizard_level_1" },
      { traitId: "trait_wizard_prof_skills", source: "class_wizard_level_1" },
      { traitId: "trait_spellcasting_wizard", source: "class_wizard_level_1" },
      { traitId: "trait_arcane_recovery", source: "class_wizard_level_1" },
      { traitId: "trait_arcane_tradition", source: "class_wizard_level_2" },
      {
        traitId: "trait_arcane_tradition_feature",
        source: "class_wizard_level_6",
      },
      {
        traitId: "trait_divination_savant",
        source: "subclass_wizard_divination_level_2",
      },
      { traitId: "trait_portent", source: "subclass_wizard_divination_level_2" },
      {
        traitId: "trait_expert_divination",
        source: "subclass_wizard_divination_level_6",
      },
      { traitId: "race_elf_asi", source: "race_elf" },
      { traitId: "race_elf_darkvision", source: "race_elf" },
      { traitId: "keen_senses", source: "race_elf" },
      { traitId: "fey_ancestry", source: "race_elf" },
      { traitId: "trance", source: "race_elf" },
      { traitId: "race_elf_languages", source: "race_elf" },
      { traitId: "subrace_elf_dark_asi", source: "subrace_elf_dark" },
      {
        traitId: "subrace_elf_dark_superior_darkvision",
        source: "subrace_elf_dark",
      },
      { traitId: "sunlight_sensitivity", source: "subrace_elf_dark" },
      { traitId: "drow_magic", source: "subrace_elf_dark" },
      { traitId: "drow_weapon_training", source: "subrace_elf_dark" },
    ],
    inventory: [
      { itemId: "item_robe", slot: "body" },
      { itemId: "item_weapon_crossbow_hand", slot: "main_hand" },
      { itemId: "item_ammo_bolt", quantity: 20 },
      { itemId: "item_magic_item_spellbook" },
      { itemId: "item_focus_crystal" },
      { itemId: "item_pack_scholars" },
      { itemId: "item_ink" },
      { itemId: "item_ink_pen" },
    ],
    resources: [
      {
        id: "drow_magic_faerie_fire",
        name: "Faerie Fire (Drow Magic)",
        current: 0,
        max: 1,
        resetCondition: "dawn",
      },
      {
        id: "drow_magic_darkness",
        name: "Darkness (Drow Magic)",
        current: 1,
        max: 1,
        resetCondition: "dawn",
      },
      {
        // stubs: stored, but with no rule the sheet does not show them (#30)
        id: "trait_portent",
        name: "Portent",
        current: 2,
        max: 2,
        resetCondition: "long_rest",
      },
      {
        id: "trait_arcane_recovery",
        name: "Arcane Recovery",
        current: 1,
        max: 1,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_1",
        name: "1st-Level Spell Slots",
        current: 3,
        max: 4,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_2",
        name: "2nd-Level Spell Slots",
        current: 1,
        max: 3,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_3",
        name: "3rd-Level Spell Slots",
        current: 2,
        max: 3,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_4",
        name: "4th-Level Spell Slots",
        current: 3,
        max: 3,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_5",
        name: "5th-Level Spell Slots",
        current: 0,
        max: 1,
        resetCondition: "long_rest",
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000127",
    name: "Kestrel Vey",
    raceId: "race_dragonborn",
    subraceId: "subrace_dragonborn_silver",
    classes: [
      {
        classId: "class_sorcerer",
        classLevel: 7,
        subclassId: "subclass_sorcerer_wild_magic",
      },
    ],
    backgroundId: "background_charlatan",
    choices: {
      feats: [],
      classSelections: {
        class_sorcerer: {
          sorcerer_level_3_metamagic: [
            "trait_metamagic_careful_spell",
            "trait_metamagic_extended_spell",
          ],
        },
      },
      traitSelections: {
        sorcerer_starting_skills: ["arcana", "persuasion"],
      },
    },
    alignment: "Chaotic Neutral",
    str: 8,
    dex: 14,
    con: 14,
    int: 10,
    wis: 12,
    cha: 17,
    maxHp: 30,
    currentHp: 44,
    testFocus:
      "Sorcery-points preview: the pool is stored but has no rule to show it (#62); Tides of Chaos and Wild Magic Surge stubs; a spent cold breath.",
    personalityTraits: "Things go slightly wrong around me, and I apologise in advance.",
    ideals: "Change. Nothing should stay the shape it was born in.",
    bonds: "My clan sold their silver to pay for my silence. I owe it back.",
    flaws: "I cannot resist finding out what happens if.",
    traits: [
      {
        traitId: "trait_sorcerer_prof_saving_throw",
        source: "class_sorcerer_level_1",
      },
      {
        traitId: "trait_sorcerer_prof_weapons",
        source: "class_sorcerer_level_1",
      },
      {
        traitId: "trait_sorcerer_prof_skills",
        source: "class_sorcerer_level_1",
      },
      {
        traitId: "trait_spellcasting_sorcerer",
        source: "class_sorcerer_level_1",
      },
      { traitId: "trait_sorcerous_origin", source: "class_sorcerer_level_1" },
      { traitId: "trait_font_of_magic", source: "class_sorcerer_level_2" },
      {
        traitId: "trait_sorcerous_origin_feature",
        source: "class_sorcerer_level_6",
      },
      {
        traitId: "trait_wild_magic_surge",
        source: "subclass_sorcerer_wild_magic_level_1",
      },
      {
        traitId: "trait_tides_of_chaos",
        source: "subclass_sorcerer_wild_magic_level_1",
      },
      {
        traitId: "trait_bend_luck",
        source: "subclass_sorcerer_wild_magic_level_6",
      },
      { traitId: "race_dragonborn_asi", source: "race_dragonborn" },
      { traitId: "race_dragonborn_languages", source: "race_dragonborn" },
      {
        traitId: "subrace_dragonborn_silver",
        source: "subrace_dragonborn_silver",
      },
    ],
    inventory: [
      { itemId: "item_weapon_dagger", quantity: 2, slot: "main_hand" },
      { itemId: "item_gear_component_pouch" },
      { itemId: "item_disguise_kit" },
      { itemId: "item_clothes_fine" },
      { itemId: "item_pack_explorers" },
    ],
    resources: [
      {
        // no rule behind it yet (#62), so the sheet does not show it
        id: "trait_font_of_magic",
        name: "Sorcery Points",
        current: 3,
        max: 7,
        resetCondition: "long_rest",
      },
      {
        id: "trait_tides_of_chaos",
        name: "Tides of Chaos",
        current: 0,
        max: 1,
        resetCondition: "long_rest",
      },
      {
        id: "dragonborn_breath_charge",
        name: "Breath Weapon",
        current: 0,
        max: 1,
        resetCondition: "short_rest",
      },
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
        current: 2,
        max: 3,
        resetCondition: "long_rest",
      },
      {
        id: "spell_slots_3",
        name: "3rd-Level Spell Slots",
        current: 1,
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
    ],
  },
```

- [ ] **Step 4: Restore line endings**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' packages/database/src/sampleScenarioCharacters.ts apps/server/src/services/__tests__/sampleCharacterScores.test.ts apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts packages/database/src/__tests__/seedSampleCharactersImport.test.ts
```

- [ ] **Step 5: Run the tests and typechecks to verify they pass**

Run: `DATABASE_URL= pnpm --filter @project/database test` — PASS (import length 18; Hesk's `customTraitIds` resolve against the pack).
Run: `DATABASE_URL= pnpm --filter @project/server exec vitest run src/services/__tests__/sampleCharacter` — PASS, 18 cases per suite.
Run: `pnpm --filter @project/database typecheck && pnpm --filter @project/server typecheck` — both exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/database/src/sampleScenarioCharacters.ts apps/server/src/services/__tests__/sampleCharacterScores.test.ts apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts packages/database/src/__tests__/seedSampleCharactersImport.test.ts
git commit -F - <<'EOF'
feat(database): three samples for the wild shape, wizard and sorcery passes

Hesk Mossgather (Moon druid, custom background with unasked choice blocks
- #62, #80, #83), Seraphine Dusk (drow Divination wizard at CON 8, whose
maximum #86 overstates - pinned with a comment) and Kestrel Vey (Wild Magic
sorcerer - #62). Partly spent spell slots are seeded for the first time.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Broken on purpose — Brother Mote, Orrik Stonehide, and the stubs they need

**Files:**
- Modify: `packages/database/src/sampleScenarioCharacters.ts`
- Test: `apps/server/src/services/__tests__/sampleCharacterScores.test.ts`, `apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts`, `packages/database/src/__tests__/seedSampleCharactersImport.test.ts`, `packages/database/src/__tests__/sampleRosterIds.test.ts`

**Interfaces:**
- Consumes: `SampleCharacter.levelColumn`, `SampleCharacter.expectedIssues`, `SampleRace` and the other stub types (Task 1); the race-stub insert (Task 1 Step 4i).

- [ ] **Step 1: Write the failing tests**

Add to the end of `INTENDED_FINAL`:

```ts
  "Brother Mote": [14, 10, 14, 10, 20, 13],
  // the pack knows no Goliath, so nothing is added to the stored scores
  "Orrik Stonehide": [20, 12, 18, 8, 12, 10],
```

Add to the end of `EXPECTED_MAX_HP`:

```ts
  // his current hit points (95) are stored above this on purpose
  "Brother Mote": 80,
  "Orrik Stonehide": 134,
```

Change the import test's `toHaveLength(18)` to `toHaveLength(20)`.

In `sampleRosterIds.test.ts`'s doc comment, replace the sentence `Fifty three of them currently resolve to nothing, on purpose.` with `More than fifty of them resolve to nothing, on purpose - every Goliath and Rune Knight trait Orrik Stonehide carries among them.`

- [ ] **Step 2: Run the tests to verify they fail**

Run: `DATABASE_URL= pnpm --filter @project/server exec vitest run src/services/__tests__/sampleCharacterScores.test.ts`
Expected: FAIL — `covers every sample`.

- [ ] **Step 3: Author the stubs**

In `sampleScenarioCharacters.ts`, replace the four empty stub declarations (from `const SCENARIO_RACES: SampleRace[] = [];` through `const SCENARIO_ITEMS: SampleItem[] = [];`) with:

```ts
/** A race the pack does not author, so the sheet meets one it cannot resolve. */
const SCENARIO_RACES: SampleRace[] = [
  {
    id: "race_goliath",
    name: "Goliath",
    speed: 30,
    shortDescription:
      "Mountain-born wanderers who keep score of everything, themselves included.",
  },
];

const SCENARIO_SUBCLASSES: SampleSubclass[] = [
  {
    id: "subclass_fighter_rune_knight",
    parentClassId: "class_fighter",
    name: "Rune Knight",
    shortDescription:
      "A fighter who carves giants' runes into their gear and grows to match them.",
  },
];

const SCENARIO_BACKGROUNDS: SampleBackground[] = [
  {
    id: "background_hermit",
    name: "Hermit",
    featureName: "Discovery",
    featureDescription:
      "The quiet of your seclusion gave you access to a unique and powerful discovery.",
    shortDescription: "You lived in seclusion for a formative part of your life.",
  },
];

/**
 * Two magic items the item schema cannot fully express: the greatsword's
 * cold rider is description only, and the belt has no slot to go in, so it
 * sits attuned in the backpack.
 */
const SCENARIO_ITEMS: SampleItem[] = [
  {
    id: "item_weapon_frost_brand_greatsword",
    name: "Frost Brand Greatsword",
    pounds: 6,
    description:
      "A hit deals an extra 1d6 cold damage, and you have resistance to fire damage while you hold it.",
    itemRule: {
      type: "weapon",
      equipSlot: "main_hand",
      requiresAttunement: true,
      categoryTags: ["category_weapon_martial", "category_weapon_martial_melee"],
    },
    weaponRule: {
      category: "martial_melee",
      damageDice: "2d6",
      damageType: "slashing",
      properties: ["heavy", "two_handed"],
      range: 5,
    },
  },
  {
    id: "item_wondrous_belt_of_hill_giant_strength",
    name: "Belt of Hill Giant Strength",
    pounds: 1,
    description:
      "Your Strength score is 21 while you wear this belt, unless it is already higher.",
    itemRule: {
      type: "wondrous",
      requiresAttunement: true,
      categoryTags: [],
      modifiers: [
        { target: "STR", type: "set_base", value: 21, scalingFactor: "none" },
      ],
    },
  },
];
```

- [ ] **Step 4: Add the two characters**

Insert at the end of `SCENARIO_ROSTER`, after Kestrel Vey's closing `},`:

```ts
  {
    id: "00000000-0000-0000-0000-000000000128",
    name: "Brother Mote",
    raceId: "race_half_elf",
    classes: [
      {
        classId: "class_cleric",
        classLevel: 11,
        subclassId: "subclass_cleric_tempest_subclass",
      },
    ],
    // the ledger sums to 11: every level-up is refused (#95)
    levelColumn: 12,
    backgroundId: "background_acolyte",
    choices: {
      feats: [],
      classSelections: {},
      traitSelections: {
        half_elf_asi_choice: ["WIS", "CON"],
        skill_versatility_choice: ["medicine", "perception"],
        half_elf_language_choice: ["dwarvish"],
        acolyte_languages: ["celestial", "infernal"],
        cleric_starting_skills: ["history", "persuasion"],
      },
    },
    alignment: "Lawful Good",
    str: 14,
    dex: 10,
    con: 13,
    int: 10,
    wis: 19,
    cha: 11,
    maxHp: 58,
    // above the derived maximum of 80: the next hit point write clamps it
    currentHp: 95,
    testFocus:
      "Broken on purpose: level column 12 against an 11 ledger (#95), a slot pool above its maximum (#98), hit points above theirs, four attuned items.",
    personalityTraits: "I bless the sick, the storm, and the cook, in that order.",
    ideals: "Faith. The thunder answers; I only have to ask properly.",
    bonds: "The lighthouse temple at Saltmarch keeps my vows in its bell.",
    flaws: "I cannot admit the ledger might be wrong, even when it is.",
    traits: [
      {
        traitId: "trait_cleric_prof_saving_throw",
        source: "class_cleric_level_1",
      },
      { traitId: "trait_cleric_prof_armor", source: "class_cleric_level_1" },
      { traitId: "trait_cleric_prof_weapons", source: "class_cleric_level_1" },
      { traitId: "trait_cleric_prof_skills", source: "class_cleric_level_1" },
      { traitId: "trait_spellcasting_cleric", source: "class_cleric_level_1" },
      { traitId: "trait_divine_domain", source: "class_cleric_level_1" },
      { traitId: "trait_channel_divinity", source: "class_cleric_level_2" },
      {
        traitId: "trait_divine_domain_feature",
        source: "class_cleric_level_2",
      },
      { traitId: "trait_destroy_undead", source: "class_cleric_level_5" },
      { traitId: "trait_divine_intervention", source: "class_cleric_level_10" },
      {
        traitId: "trait_tempest_domain_spells",
        source: "subclass_cleric_tempest_subclass_level_1",
      },
      {
        traitId: "trait_cleric_tempest_prof_bonus",
        source: "subclass_cleric_tempest_subclass_level_1",
      },
      {
        traitId: "trait_wrath_of_the_storm",
        source: "subclass_cleric_tempest_subclass_level_1",
      },
      {
        traitId: "trait_cd_destructive_wrath",
        source: "subclass_cleric_tempest_subclass_level_2",
      },
      {
        traitId: "trait_thunderous_strike",
        source: "subclass_cleric_tempest_subclass_level_6",
      },
      {
        traitId: "trait_divine_strike",
        source: "subclass_cleric_tempest_subclass_level_8",
      },
      { traitId: "race_half_elf_asi", source: "race_half_elf" },
      { traitId: "race_half_elf_darkvision", source: "race_half_elf" },
      { traitId: "fey_ancestry", source: "race_half_elf" },
      { traitId: "skill_versatility", source: "race_half_elf" },
      { traitId: "race_half_elf_languages", source: "race_half_elf" },
    ],
    inventory: [
      { itemId: "item_armor_plate", slot: "body" },
      { itemId: "item_weapon_warhammer", slot: "main_hand" },
      { itemId: "item_armor_shield", slot: "off_hand" },
      // four attuned against a cap of three: the UI cannot make this
      {
        itemId: "item_wondrous_cloak_of_protection",
        slot: "cloak",
        isAttuned: true,
      },
      { itemId: "item_ring_protection", slot: "ring_1", isAttuned: true },
      {
        itemId: "item_wondrous_headband_of_intellect",
        slot: "head",
        isAttuned: true,
      },
      {
        itemId: "item_wondrous_boots_of_elvenkind",
        slot: "boots",
        isAttuned: true,
      },
      { itemId: "item_focus_emblem" },
      { itemId: "item_pack_priests" },
      { itemId: "item_potion_healing", quantity: 2 },
    ],
    resources: [
      {
        // 6 of 4: the sheet clamps the display to 4, so the next two genuine
        // spends move nothing the player can see (#98)
        id: "spell_slots_1",
        name: "1st-Level Spell Slots",
        current: 6,
        max: 4,
        resetCondition: "long_rest",
      },
      {
        id: "resource_hit_dice_d8",
        name: "Hit Dice (d8)",
        current: 11,
        max: 11,
        resetCondition: "long_rest_half",
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000129",
    name: "Orrik Stonehide",
    // neither the race nor the subclass is authored by the pack
    raceId: "race_goliath",
    classes: [
      {
        classId: "class_fighter",
        classLevel: 13,
        subclassId: "subclass_fighter_rune_knight",
      },
    ],
    backgroundId: "background_hermit",
    choices: {
      feats: [],
      classSelections: {
        class_fighter: {
          fighter_level_1_fighting_style: ["trait_fs_great_weapon_fighting"],
        },
      },
      traitSelections: {
        fighter_starting_skills: ["athletics", "survival"],
      },
    },
    expectedIssues: ["unknown_race", "unknown_subclass"],
    alignment: "Lawful Neutral",
    str: 20,
    dex: 12,
    con: 18,
    int: 8,
    wis: 12,
    cha: 10,
    maxHp: 82,
    currentHp: 134,
    testFocus:
      "Unknown content: a race, subclass, background and two items the pack does not author, and race traits that resolve to nothing.",
    personalityTraits: "I keep a tally of every favour, mine and everyone's.",
    ideals: "Fairness. Everyone climbs the same mountain.",
    bonds: "The runes on my sword were carved by a giant who called me small.",
    flaws: "I will turn any task into a contest, and I will win it.",
    traits: [
      {
        traitId: "trait_fighter_prof_saving_throw",
        source: "class_fighter_level_1",
      },
      { traitId: "trait_fighter_prof_armor", source: "class_fighter_level_1" },
      {
        traitId: "trait_fighter_prof_weapons",
        source: "class_fighter_level_1",
      },
      { traitId: "trait_fighter_prof_skills", source: "class_fighter_level_1" },
      { traitId: "trait_second_wind", source: "class_fighter_level_1" },
      { traitId: "trait_action_surge", source: "class_fighter_level_2" },
      { traitId: "trait_martial_archetype", source: "class_fighter_level_3" },
      { traitId: "trait_extra_attack", source: "class_fighter_level_5" },
      {
        traitId: "trait_martial_archetype_feature",
        source: "class_fighter_level_7",
      },
      { traitId: "trait_indomitable", source: "class_fighter_level_9" },
      // none of these resolve: the pack has no Rune Knight and no Goliath
      {
        traitId: "trait_rune_carver",
        source: "subclass_fighter_rune_knight_level_3",
      },
      {
        traitId: "trait_giants_might",
        source: "subclass_fighter_rune_knight_level_3",
      },
      {
        traitId: "trait_runic_shield",
        source: "subclass_fighter_rune_knight_level_7",
      },
      {
        traitId: "trait_great_stature",
        source: "subclass_fighter_rune_knight_level_10",
      },
      { traitId: "trait_stones_endurance", source: "race_goliath" },
      { traitId: "trait_natural_athlete", source: "race_goliath" },
      { traitId: "trait_mountain_born", source: "race_goliath" },
    ],
    inventory: [
      { itemId: "item_armor_splint", slot: "body" },
      {
        itemId: "item_weapon_frost_brand_greatsword",
        slot: "main_hand",
        isAttuned: true,
      },
      // attuned, with no slot to wear it in
      {
        itemId: "item_wondrous_belt_of_hill_giant_strength",
        isAttuned: true,
      },
      { itemId: "item_weapon_javelin", quantity: 4 },
      { itemId: "item_pack_explorers" },
    ],
    resources: [
      {
        id: "trait_second_wind",
        name: "Second Wind",
        current: 0,
        max: 1,
        resetCondition: "short_rest",
      },
      {
        id: "trait_action_surge",
        name: "Action Surge",
        current: 1,
        max: 1,
        resetCondition: "short_rest",
      },
      {
        // a pool whose trait the pack does not author
        id: "trait_giants_might",
        name: "Giant's Might",
        current: 2,
        max: 2,
        resetCondition: "long_rest",
      },
    ],
  },
```

- [ ] **Step 5: Restore line endings**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' packages/database/src/sampleScenarioCharacters.ts apps/server/src/services/__tests__/sampleCharacterScores.test.ts apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts packages/database/src/__tests__/seedSampleCharactersImport.test.ts packages/database/src/__tests__/sampleRosterIds.test.ts
```

- [ ] **Step 6: Run the tests and typechecks to verify they pass**

Run: `DATABASE_URL= pnpm --filter @project/database test`
Expected: PASS — `race_goliath`, `subclass_fighter_rune_knight`, `background_hermit` and both new items resolve as seed-supplied stubs; ids unique; import length 20.

Run: `DATABASE_URL= pnpm --filter @project/server exec vitest run src/services/__tests__/sampleCharacter`
Expected: PASS, 20 cases per suite. Orrik raises exactly `unknown_race` and `unknown_subclass`; Mote raises nothing.

Run: `pnpm --filter @project/database typecheck && pnpm --filter @project/server typecheck` — both exit 0.

**If Orrik's case throws instead** (an engine change since planning makes an unknown race or subclass throw rather than report): do not fix the engine. Record a new backlog item for the throw, and skip Orrik in the affected suite with `it.skipIf` or a filter plus a comment naming that item. Report it in the task summary.

- [ ] **Step 7: Commit**

```bash
git add packages/database/src/sampleScenarioCharacters.ts apps/server/src/services/__tests__/sampleCharacterScores.test.ts apps/server/src/services/__tests__/sampleCharacterHitPoints.test.ts packages/database/src/__tests__/seedSampleCharactersImport.test.ts packages/database/src/__tests__/sampleRosterIds.test.ts
git commit -F - <<'EOF'
feat(database): two samples broken on purpose, and the stubs they need

Brother Mote carries a level column the ledger disagrees with (#95), a
slot pool and hit points above their maxima (#98) and four attunements
against a cap of three. Orrik Stonehide is a Goliath Rune Knight hermit
with two magic items - content the pack does not author - and declares
the unknown_race and unknown_subclass issues he raises.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Documentation — the twenty, their live checks, and #70

**Files:**
- Modify: `docs/development/sample-characters.md` (**LF**; rewrite in full)
- Modify: `docs/TODO_BACKLOG.md` (CRLF)

No test cycle: a documentation task. Its gate is that every character id, number and backlog id in the doc matches the code from Tasks 2–5.

- [ ] **Step 1: Rewrite `docs/development/sample-characters.md`**

Replace the whole file with the content below. It stays LF: write it with the Write tool and do **not** run the CRLF command on it.

````markdown
# Sample characters

Twenty fixture characters for exercising the live sheet against a real
database, in two sets:

- **The coverage set** (`…0110`–`…0119`) fills the sheet. Between them the ten
  reach every class, race, equipment slot, reset condition and hit point
  state. They live in `packages/database/src/seedSampleCharacters.ts`.
- **The scenario set** (`…0120`–`…0129`) stages the hand checks a unit test
  cannot reach: a level-up one level away, a divergence that needs two tabs,
  a Tier 2 pass with nothing yet to verify against, or data the UI cannot
  create. Each has a script under [Live checks](#live-checks). They live in
  `packages/database/src/sampleScenarioCharacters.ts`.

All twenty sit in the **Dev Smoke Campaign**
(`00000000-0000-0000-0000-000000000001`), owned by `dev-user-1` — the id the
web client sends as `x-tester-id`.

## Running it

```bash
pnpm --filter @project/database db:seed:samples
```

Re-running is safe, and it is also how you reset. Character rows are
upserted, their ledgers are cleared and rewritten, and no character outside
the twenty ids is read or modified. A level-up check consumes its staging
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
| [Nyx Vale](http://localhost:5173/character/00000000-0000-0000-0000-000000000115) | 11 | Warlock 8 (Fiend) / Sorcerer 3 (Draconic) | 1/78 | One hit point from death, two drained pools, a container holding stacks |
| [Master Ko Shen](http://localhost:5173/character/00000000-0000-0000-0000-000000000116) | 12 | Monk 12 (Open Hand) | 99/99 | No armour at all, half-spent pool, attuned boots, one unattuned item waiting |
| [Thistle Quickfoot](http://localhost:5173/character/00000000-0000-0000-0000-000000000117) | 14 | Wizard 14 (Evocation) | 52/86 | Custom background, ad-hoc granted traits, a dawn-recharging item pool |
| [Kaelen Duskwarden](http://localhost:5173/character/00000000-0000-0000-0000-000000000118) | 17 | Ranger 12 (Hunter) / Druid 5 (Land) | 0/152 | Downed at zero, high-level multiclass, big ammunition stack |
| [Dame Sable Orrin](http://localhost:5173/character/00000000-0000-0000-0000-000000000119) | 20 | Fighter 20 (Battle Master) | 224/224 | Ceiling case: every slot filled, attunement at the cap of three |

## The scenario set

| Character | Lvl | Build | HP | Kind | Backlog |
| --- | --- | --- | --- | --- | --- |
| [Quill Ashgrove](http://localhost:5173/character/00000000-0000-0000-0000-000000000120) | 2 | Rogue 2 | 17/17 | Level-up staging | #65b, #31a, #66, #70 |
| [Brannoc Hale](http://localhost:5173/character/00000000-0000-0000-0000-000000000121) | 3 | Fighter 3 (Champion) | 31/31 | Level-up staging | #88, #94, #24 |
| [Isolde Varn](http://localhost:5173/character/00000000-0000-0000-0000-000000000122) | 4 | Warlock 4 (Archfey) | 20/31 | Level-up staging | #81, #36 |
| [Ursk Gravemaw](http://localhost:5173/character/00000000-0000-0000-0000-000000000123) | 5 | Paladin 5 (Vengeance) | 6/54 | Two tabs, dip staging | #92, #93, #77 |
| [Tamsin Burrowdeep](http://localhost:5173/character/00000000-0000-0000-0000-000000000124) | 6 | Barbarian 6 (Totem Warrior) | 30/65 | Two tabs, socket | #76, #97, #99, #101 |
| [Hesk Mossgather](http://localhost:5173/character/00000000-0000-0000-0000-000000000125) | 8 | Druid 8 (Moon) | 41/59 | Wild-shape preview | #62, #83, #80 |
| [Seraphine Dusk](http://localhost:5173/character/00000000-0000-0000-0000-000000000126) | 9 | Wizard 9 (Divination) | 33/47 | Wizard preview | #86, #31a, #83 |
| [Kestrel Vey](http://localhost:5173/character/00000000-0000-0000-0000-000000000127) | 7 | Sorcerer 7 (Wild Magic) | 44/44 | Sorcery-points preview | #62 |
| [Brother Mote](http://localhost:5173/character/00000000-0000-0000-0000-000000000128) | 11 (column: 12) | Cleric 11 (Tempest) | 95/80 | Broken on purpose | #95, #98 |
| [Orrik Stonehide](http://localhost:5173/character/00000000-0000-0000-0000-000000000129) | 13 | Fighter 13 (Rune Knight) | 134/134 | Broken on purpose | — |

Ids run `…000000000110` through `…000000000129`; the last two digits are the
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
3. **Level Up → Fighter 4**, taking the increase as +1 CON and +1 STR. Note the
   review step's previewed hit point gain, then submit. The stored gain is at
   least 3 more than the preview (#88): CON 16 also raises the three earlier
   levels by one each. *After #88:* the preview matches.
4. **Double submit (#94).** Re-seed, repeat step 3, and double-click the final
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

   **Today:** both succeed; he is level 4 with two levels' worth of hit points.
   *After #94:* the second is refused.

### Isolde Varn — `…0122`

1. **Alert.** Initiative includes Alert's +5 — the first feat on any sample.
2. **Level Up → Warlock 5.** The Choices step asks for **one** new invocation.
   Voice of the Chain Master is available (she holds Pact of the Chain);
   Thirsting Blade is disabled with "needs Pact of the Blade", and Agonizing
   Blast with "needs Eldritch Blast" (spell picks are not stored until #31a).
   This is the #81 regression check.
3. **After submitting.** The pact slot level rises to 3rd.
4. **Familiar.** Pact of the Chain summons nothing: the engine knows no
   familiar actor (#36).

### Ursk Gravemaw — `…0123`

1. **Tough.** The maximum is 54: 34 rolled, +10 Constitution, +10 from Tough.
2. **Two tabs (#92).** Open the sheet in tabs A and B; both show 6/54 and
   Relentless Endurance 1 of 1.
   - In A, take 20 damage: Relentless Endurance fires, and A shows 1 hit point
     with the charge spent.
   - In A, take 20 damage again: the charge is spent, so A sends the full
     lethal delta and the server stores 0.
   - Look at B. If it still shows more than 0 hit points, take 20 damage
     there: it fires its own, never-synced Relentless Endurance and lands on 1
     while the database and A show 0.

   **Today:** the tabs disagree. *After #92:* trigger resolution is
   server-side, and every tab shows the server's answer.
3. **A heal from the stale tab (#93, a regression check).** Heal from B in the
   Combat widget, or drink one of his two Potions of Healing: the heal reaches
   the server raw, and any notice reports what actually applied.
4. **Dip menu (#77, a regression check).** Level Up, choose a new class:
   sorcerer, warlock and bard are allowed (CHA 14; paladin's own STR 13 and
   CHA 13 are met), wizard is refused on Intelligence 8 — judged on final
   scores. Cancel without submitting.

### Tamsin Burrowdeep — `…0124`

1. **Eagle Dash (#76).** Rage. Eagle Dash is offered. Equip the plate from the
   backpack into the body slot: Eagle Dash disappears, because
   `status_wearing_heavy_armor` now reaches the sheet's states.
2. **A second tab (#101, a regression check).** With tab B open, equip the
   plate from B: tab A's actions update without a reload. Attune the Cloak of
   Protection from B: A's armour class rises by 1.
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
3. **Spells (#83).** No spell is listed anywhere.
4. **The custom background (#80).** "Grove Warden" carries the acolyte's
   two-language block and the soldier's gaming-set block. Neither is ever
   asked — Level Up → Druid 9 and look at the Choices step.

### Seraphine Dusk — `…0126`

1. **The maximum (#86).** The sheet shows 47. The rules give 29: Constitution 8
   is -1 per level, and `calculateMaxHp` floors the modifier at +1, so nine
   levels come out 18 too high. *After #86:* 29, and
   `sampleCharacterHitPoints.test.ts` goes red until its number is updated.
2. **Pools.** Five slot pools (3 of 4, 1 of 3, 2 of 3, 3 of 3, 0 of 1); Faerie
   Fire (Drow Magic) spent and Darkness available, both `dawn`. Portent and
   Arcane Recovery are stored but not shown — stubs with no rule.
3. **Drow Magic.** Spend Darkness, then take a short rest: it stays spent.
4. **Spells (#31a, #83).** The spellbook is an item; nothing lists a spell.
5. **Race stubs.** Sunlight Sensitivity changes nothing (a race stub, #30).

### Kestrel Vey — `…0127`

1. **Pools (#62).** Four slot pools (4 of 4, 2 of 3, 1 of 3, 1 of 1) and a spent
   Breath Weapon. Sorcery Points (3 of 7) and Tides of Chaos (0 of 1) are
   stored but not shown: no rule. *After the sorcerer pass:* Sorcery Points
   appear.
2. **Breath Weapon.** A short rest restores it; the silver breath deals cold
   damage.
3. **Stubs.** Wild Magic Surge and Tides of Chaos do nothing yet; Careful and
   Extended Spell are stored in `choices`.

### Brother Mote — `…0128`

1. **The level (#95).** The header reads level 12; the class ledger reads
   Cleric 11. Level Up and submit: the server refuses it (400), every time, and
   nothing in the UI can repair the row. *After #95:* a reconciliation decides
   the row's level.
2. **An over-maximum pool (#98).** 1st-level slots show 4 of 4, though 6 are
   stored. Spend one: still 4. Spend another: still 4 — two spends the player
   cannot see. *After #98:* a stored total cannot exceed its maximum.
3. **Over-maximum hit points.** 95 of 80. The next damage or heal is clamped
   against the maximum (#89).
4. **Four attunements.** Cloak, ring, headband and boots are all attuned
   against a cap of three. Record what the Items widget shows, whether it
   offers a fifth, and what unattuning one then allows.

### Orrik Stonehide — `…0129`

Nothing here has a known answer; whatever happens is the finding. Record it as
a backlog item rather than fixing it.

1. Does the sheet load, and does the room join report an error?
2. What do the race (Goliath, speed 30) and subclass (Rune Knight) show, given
   the snapshot knows neither? None of his race or subclass traits resolve,
   and the Giant's Might pool he stores has no rule.
3. The Belt of Hill Giant Strength is attuned with no slot to wear it in: does
   Strength read 21?
4. Level Up: what do the level-up wizard and its dip menu do with a subclass
   the snapshot does not have?

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
````

- [ ] **Step 2: Update #70 and Tier 2 row 7a in `docs/TODO_BACKLOG.md`**

In the Recommended sequence's Tier 2 table, row `7a`, replace:

`Three sample characters (Nyx Vale, Master Ko Shen, Kaelen Duskwarden) already reference `background_charlatan`, `background_folk_hero` and `background_outlander`, which the seeder creates but the pack does not author; `background_sage` is a fourth the seeder creates that no sample character uses.`

with:

`Seven sample characters reference a background the seeder creates but the pack does not author: `background_charlatan` (Nyx Vale, Kestrel Vey), `background_folk_hero` (Master Ko Shen, Quill Ashgrove), `background_outlander` (Kaelen Duskwarden, Tamsin Burrowdeep) and `background_sage` (Seraphine Dusk). A fifth stub, `background_hermit`, belongs to Orrik Stonehide, who is broken on purpose and not a candidate for authoring.`

In `### #70`'s second bullet ("**Four backgrounds the pack does not author.**"), replace these wrapped lines:

```
  noble and soldier. Three sample characters — Nyx Vale (charlatan), Master Ko
  Shen (folk hero) and Kaelen Duskwarden (outlander) — reference a background
  the pack has no `backgroundTraitIds` for, so `resolveBackgroundDefinition`
  finds nothing to grant and they correctly receive nothing from their
  background, the same as an unknown id. `background_sage` is a fourth row the
  seeder creates that no sample character uses at all. Four backgrounds to
  author, for the backlog — tracked as Tier 2 item 7a.
```

with:

```
  noble and soldier. Seven sample characters reference a background the pack
  has no `backgroundTraitIds` for — Nyx Vale and Kestrel Vey (charlatan),
  Master Ko Shen and Quill Ashgrove (folk hero), Kaelen Duskwarden and Tamsin
  Burrowdeep (outlander), and Seraphine Dusk (sage) — so
  `resolveBackgroundDefinition` finds nothing to grant and they correctly
  receive nothing from their background, the same as an unknown id. Since
  `feat/scenario-characters` every one of the four has a user; the seeder's
  fifth stub, `background_hermit`, belongs to Orrik Stonehide, who is broken
  on purpose. Four backgrounds to author, for the backlog — tracked as Tier 2
  item 7a.
```

The row 7a text above is one table row on a single line.

- [ ] **Step 3: Restore line endings on the backlog only**

```bash
node -e 'const fs=require("fs");for(const p of process.argv.slice(1))fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r?\n/g,"\r\n"))' docs/TODO_BACKLOG.md
```

Measure both files: `docs/TODO_BACKLOG.md` CRLF, `docs/development/sample-characters.md` LF.

- [ ] **Step 4: Check the doc against the code**

Run: `DATABASE_URL= pnpm --filter @project/database test && pnpm check:hygiene`
Expected: PASS. Then read the scenario-set table against `sampleScenarioCharacters.ts` and the two test tables: every name, id, level, current and maximum hit points matches.

- [ ] **Step 5: Commit**

```bash
git add docs/development/sample-characters.md docs/TODO_BACKLOG.md
git commit -F - <<'EOF'
docs: the twenty sample characters, with a live-check script for each scenario

Rewrites sample-characters.md for both sets. Removes two stale sections:
REFERENCE_SOURCE=static no longer exists, and the known gaps it listed
(E1's equip defects, resourceDictionary.ts) were fixed or deleted.
#70 and Tier 2 row 7a name the stub backgrounds' new users.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Verification — the whole workspace, then the live database (owner go-ahead required)

**Files:** none changed, unless Step 4 records findings in `docs/TODO_BACKLOG.md`.

- [ ] **Step 1: The whole workspace**

Run: `DATABASE_URL= pnpm test:all`
Expected: PASS. The count is the pre-branch baseline plus 31 — one uniqueness test, and ten more cases in each of the choices, scores and hit point suites.

Run: `pnpm typecheck --force`
Expected: every package exits 0. (`--force`: turbo's cache otherwise replays a stale success.)

- [ ] **Step 2: Ask the owner before touching the dev database**

Seeding is additive — it upserts the twenty ids and inserts stubs with `onConflictDoNothing` — but it writes to the owner's database. Ask, and wait for a yes. If the pack has not been imported since the last `db:import-pack`, that command CASCADE-deletes every character; it is not needed for this check and must not be run without asking separately.

- [ ] **Step 3: Seed, serve, and open the ten new sheets**

```bash
pnpm --filter @project/database db:seed:samples
```

Expected: the summary table lists twenty characters, and Brother Mote's row shows `Lvl 11` (the console reads the ledger; the column holds 12).

Start the servers with `preview_start` `server` and then `web` (`.claude/launch.json`). Restart `server` if it was already running — it caches the rule snapshot. Open `http://localhost:5173/character/00000000-0000-0000-0000-00000000012N` for N = 0..9. For each, record whether the sheet loads, whether the room join reports an error, and whether the header's level and hit points match the scenario-set table in `sample-characters.md`. If the browser pane is hidden, see the project memory note on a 0x0 viewport: `resize_window` to 1280x800 first.

Expected: 120–128 load and match. Orrik (129) is the open question — whatever it does is the finding.

- [ ] **Step 4: Record, do not fix**

For anything that fails to load or disagrees with the doc, add a backlog item to `docs/TODO_BACKLOG.md` (next free number, an Item-index row and an Open-items entry in the file's existing shape), restore CRLF on it, and commit:

```bash
git add docs/TODO_BACKLOG.md
git commit -F - <<'EOF'
docs: record what the scenario characters surfaced on first load

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

If nothing failed, there is nothing to commit; say so in the summary.
