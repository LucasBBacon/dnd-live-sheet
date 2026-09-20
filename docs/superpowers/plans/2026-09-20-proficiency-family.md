# Proficiency Family Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author the 36 proficiency stubs the schema can already express, and give tools the roster they never had, so a level 1 rogue is offered four skills from eleven and no proficiency grant in the pack names an id nothing knows.

**Architecture:** Tools get a hand-written dictionary beside languages in `proficiencyDictionary.ts`. That one change makes `listProficiencyOptions("tools")` return a roster, which turns the existing drift guard on for the category with no change to the guard itself — and it goes red immediately on the two tool ids the pack already has wrong. Everything after that is authoring: 36 stubs moved out of `traits/unimplemented.json` into the file that owns them.

**Tech Stack:** TypeScript, pnpm workspaces, turbo, Zod schemas in `@project/shared`, Vitest everywhere, JSON rule packs under `packages/database/data/packs/core_2014_pack`.

**Spec:** `docs/superpowers/specs/2026-09-20-proficiency-family-design.md`

**Branch:** `feat/proficiency-family`, already created, currently at `dd8a247` (the spec commit).

## Global Constraints

- **Line endings are per-file and git hides conversions.** `core.autocrlf=true` is set, but files are individually LF or CRLF, and the Write and Edit tools emit LF. Check every file you touch with `file <path>` before committing and restore CRLF if it was CRLF:
  `node -e "const fs=require('fs');for(const p of process.argv.slice(2))fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/\r?\n/g,'\r\n'))" <file>`
- **Pack JSON is edited only through `packages/database/scripts/patchPackSegment.ts`.** Never with Write or Edit.
- **The patch script cannot round-trip hand-written compact JSON.** It prints with `JSON.stringify(seg, null, 4)`, so a `"maxRule": { "kind": "fixed", "value": 1 }` written on one line expands and churns the diff. Four files are affected — `races/dragonborn.json`, `races/elf.json`, `races/half-orc.json`, `races/tiefling.json` — and **this branch touches none of them**. All fifteen files it does touch were no-op round-tripped on 2026-09-20 and came back byte-identical. If you patch anything outside that list, round-trip it first.
- **Never run `tsc -b` in `packages/database`.** Its typecheck is `pnpm --filter @project/database typecheck`.
- **Baseline:** 2,027 tests green across the five packages, typecheck green.
- **Typecheck is a separate gate from the suites.** A test file can break `tsc` while every suite stays green; run both.
- **Turbo caches a stale success.** If a run looks suspiciously instant, run that package's vitest directly.
- **Commit after every task.** Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File Structure

**Modified — engine:**
- `packages/engine/src/rules/proficiencyDictionary.ts` — `TOOL_DICTIONARY` and the `tools` case. The file's one responsibility is already "the rosters behind an open choice block"; tools join languages and skills there.
- `packages/engine/src/rules/__tests__/proficiencyDictionary.test.ts` — new, covering the roster itself.
- `packages/engine/src/rules/__tests__/proficiencyRosterDrift.test.ts` — the docstring, which currently names tools as roster-less.

**Modified — pack data:**
- `races/gnome.json`, `races/dwarf.json` — the two wrong tool ids.
- `classes/{bard,cleric,druid,fighter,monk,paladin,ranger,rogue,sorcerer,warlock,wizard}.json` — 27 authored traits.
- `backgrounds/core.json` — 9 authored traits.
- `traits/unimplemented.json` — 36 removed.

**Created — scratchpad only, not committed:**
- `authorTraits.mjs` — a driver that takes a table of traits and drives `patchPackSegment.ts` per segment. Written in Task 3, reused by Tasks 4, 5 and 6.

---

## Task 1: The tool roster

**Files:**
- Modify: `packages/engine/src/rules/proficiencyDictionary.ts`
- Create: `packages/engine/src/rules/__tests__/proficiencyDictionary.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `TOOL_DICTIONARY: Record<string, ToolDefinition>` where `ToolDefinition = { id: string; name: string }`, and `listProficiencyOptions("tools")` returning its ids. Tasks 4, 5 and 6 author against those ids; Task 2 depends on the guard this switches on.

This task is expected to **leave the repo red**. Switching the roster on makes `proficiencyRosterDrift.test.ts` fail on two tool ids the pack already has wrong, which is the proof that the roster does something. Task 2 fixes them.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/rules/__tests__/proficiencyDictionary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { listProficiencyOptions, TOOL_DICTIONARY } from "../proficiencyDictionary.js";

describe("TOOL_DICTIONARY", () => {
  it("carries the full PHB list, not only what the pack happens to grant", () => {
    expect(Object.keys(TOOL_DICTIONARY)).toHaveLength(39);
  });

  it("keys every entry by its own id", () => {
    for (const [key, entry] of Object.entries(TOOL_DICTIONARY)) {
      expect(entry.id).toBe(key);
    }
  });

  it("names the artisan's tools the pack already references", () => {
    expect(TOOL_DICTIONARY.smiths_tools?.name).toBe("Smith's Tools");
    expect(TOOL_DICTIONARY.masons_tools?.name).toBe("Mason's Tools");
    expect(TOOL_DICTIONARY.tinkers_tools?.name).toBe("Tinker's Tools");
    expect(TOOL_DICTIONARY.brewers_supplies?.name).toBe("Brewer's Supplies");
  });

  it("holds no category ids, only specific tools", () => {
    // "artisan's tools" is a choice block's option list, never a proficiency
    expect(TOOL_DICTIONARY.artisans_tools).toBeUndefined();
    expect(TOOL_DICTIONARY.gaming_set).toBeUndefined();
    expect(TOOL_DICTIONARY.musical_instrument).toBeUndefined();
  });
});

describe("listProficiencyOptions", () => {
  it("answers for tools now that they have a roster", () => {
    const options = listProficiencyOptions("tools");

    expect(options).toContain("thieves_tools");
    expect(options).toContain("herbalism_kit");
    expect(options).toHaveLength(39);
  });

  it("still answers for languages and skills", () => {
    expect(listProficiencyOptions("languages")).toContain("dwarvish");
    expect(listProficiencyOptions("skills")).toContain("stealth");
  });

  it("returns undefined for a category with no roster", () => {
    expect(listProficiencyOptions("weapons")).toBeUndefined();
    expect(listProficiencyOptions("armor")).toBeUndefined();
    expect(listProficiencyOptions("ability_check")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @project/engine test src/rules/__tests__/proficiencyDictionary.test.ts`
Expected: FAIL — `TOOL_DICTIONARY` is not exported.

- [ ] **Step 3: Add the dictionary**

In `packages/engine/src/rules/proficiencyDictionary.ts`, after the language section:

```ts
export interface ToolDefinition {
  id: string;
  name: string;
}

const tool = (id: string, name: string): ToolDefinition => ({ id, name });

/**
 * Every tool a character can be proficient with.
 *
 * Specific tools only. The PHB never grants "artisan's tools" as a blanket
 * proficiency - it grants "one type of artisan's tools of your choice", which
 * is a choice block whose options are listed. A category id in here would make
 * the wrong thing authorable, and the wrong thing was already authored: the
 * gnome's Tinker granted `artisans_tools` while its own lore says tinker's
 * tools.
 *
 * Tools sit beside languages rather than beside weapons and armour because
 * they are the same shape as languages: a closed set with no catalogue entry
 * behind it. Weapons and armour resolve against the equipment catalogue
 * instead - see itemProficiency.ts.
 */
export const TOOL_DICTIONARY: Record<string, ToolDefinition> = {
  // artisan's tools
  alchemists_supplies: tool("alchemists_supplies", "Alchemist's Supplies"),
  brewers_supplies: tool("brewers_supplies", "Brewer's Supplies"),
  calligraphers_supplies: tool("calligraphers_supplies", "Calligrapher's Supplies"),
  carpenters_tools: tool("carpenters_tools", "Carpenter's Tools"),
  cartographers_tools: tool("cartographers_tools", "Cartographer's Tools"),
  cobblers_tools: tool("cobblers_tools", "Cobbler's Tools"),
  cooks_utensils: tool("cooks_utensils", "Cook's Utensils"),
  glassblowers_tools: tool("glassblowers_tools", "Glassblower's Tools"),
  jewelers_tools: tool("jewelers_tools", "Jeweler's Tools"),
  leatherworkers_tools: tool("leatherworkers_tools", "Leatherworker's Tools"),
  masons_tools: tool("masons_tools", "Mason's Tools"),
  painters_supplies: tool("painters_supplies", "Painter's Supplies"),
  potters_tools: tool("potters_tools", "Potter's Tools"),
  smiths_tools: tool("smiths_tools", "Smith's Tools"),
  tinkers_tools: tool("tinkers_tools", "Tinker's Tools"),
  weavers_tools: tool("weavers_tools", "Weaver's Tools"),
  woodcarvers_tools: tool("woodcarvers_tools", "Woodcarver's Tools"),

  // gaming sets
  dice_set: tool("dice_set", "Dice Set"),
  dragonchess_set: tool("dragonchess_set", "Dragonchess Set"),
  playing_card_set: tool("playing_card_set", "Playing Card Set"),
  three_dragon_ante_set: tool("three_dragon_ante_set", "Three-Dragon Ante Set"),

  // musical instruments
  bagpipes: tool("bagpipes", "Bagpipes"),
  drum: tool("drum", "Drum"),
  dulcimer: tool("dulcimer", "Dulcimer"),
  flute: tool("flute", "Flute"),
  horn: tool("horn", "Horn"),
  lute: tool("lute", "Lute"),
  lyre: tool("lyre", "Lyre"),
  pan_flute: tool("pan_flute", "Pan Flute"),
  shawm: tool("shawm", "Shawm"),
  viol: tool("viol", "Viol"),

  // kits and standalone tools
  disguise_kit: tool("disguise_kit", "Disguise Kit"),
  forgery_kit: tool("forgery_kit", "Forgery Kit"),
  herbalism_kit: tool("herbalism_kit", "Herbalism Kit"),
  navigators_tools: tool("navigators_tools", "Navigator's Tools"),
  poisoners_kit: tool("poisoners_kit", "Poisoner's Kit"),
  thieves_tools: tool("thieves_tools", "Thieves' Tools"),

  // vehicles
  vehicles_land: tool("vehicles_land", "Vehicles (Land)"),
  vehicles_water: tool("vehicles_water", "Vehicles (Water)"),
};
```

and add the case to `listProficiencyOptions`:

```ts
    case "tools":
      return Object.keys(TOOL_DICTIONARY);
```

- [ ] **Step 4: Correct the function's docstring**

`listProficiencyOptions` currently says "Tools, weapons and armour are still enumerated by hand on each choice block; until they have dictionaries of their own...". Replace that sentence with:

```
 * Weapons and armour have no roster here and do not need one: an item names
 * its own proficiency ids, so the catalogue is the vocabulary - see
 * itemProficiency.ts. Tools and languages have no catalogue behind them, so
 * they are enumerated here.
```

- [ ] **Step 5: Run the new test**

Run: `pnpm --filter @project/engine test src/rules/__tests__/proficiencyDictionary.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Watch the guard go red, and record what it caught**

Run: `pnpm --filter @project/engine test src/rules/__tests__/proficiencyRosterDrift.test.ts`

Expected: **FAIL**, naming exactly two grants:

```
tinker: tools/artisans_tools
tool_proficiency/dwarf_artisan_tools: mason_tools
```

This is the deliverable of the task, not an accident. Write both into the task ledger. If it names more than two, read them — an extra name means the roster is missing an entry the pack legitimately uses. If it names none, the `tools` case is not wired up.

- [ ] **Step 7: Commit, red guard and all**

```bash
file packages/engine/src/rules/proficiencyDictionary.ts packages/engine/src/rules/__tests__/proficiencyDictionary.test.ts
git add packages/engine/src/rules
git commit -m "feat(engine): tools get a roster, and the guard catches two bad ids

The drift guard now covers the tools category and fails on the two ids the
pack has wrong. Task 2 fixes them; this commit is deliberately red so the
guard is seen to work before anything depends on it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: The two wrong tool ids

**Files:**
- Modify: `packages/database/data/packs/core_2014_pack/races/gnome.json`
- Modify: `packages/database/data/packs/core_2014_pack/races/dwarf.json`

**Interfaces:**
- Consumes: the roster and the now-red guard from Task 1.
- Produces: a green guard. Every later task depends on it staying green.

The gnome's `tinker` grants `artisans_tools` — a category where a specific tool belongs, and its own lore says "You have proficiency with tinker's tools". The dwarf's choice block offers `mason_tools` beside `smiths_tools` and `brewers_supplies`, the odd one out.

- [ ] **Step 1: Write the patch**

Write `patch-tool-ids.json` in your scratchpad:

```json
{
  "renameProficiencyIds": {
    "tools": {
      "artisans_tools": "tinkers_tools",
      "mason_tools": "masons_tools"
    }
  }
}
```

`renameProficiencyIds` is scoped by proficiency category and rewrites both fixed grants and choice option lists, so one patch covers the fixed grant on the gnome and the option list on the dwarf.

- [ ] **Step 2: Apply it**

From `packages/database`:

```bash
npx tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/races/gnome.json <scratchpad>/patch-tool-ids.json
npx tsx scripts/patchPackSegment.ts data/packs/core_2014_pack/races/dwarf.json <scratchpad>/patch-tool-ids.json
```

Expected: `renamed 1` from each.

- [ ] **Step 3: Check the diff is two lines**

```bash
git diff packages/database/data
```

Expected: exactly two changed lines, one per file. Both files were no-op round-tripped on 2026-09-20 and came back byte-identical, so any reindentation means something else went wrong — revert and investigate rather than hand-editing.

- [ ] **Step 4: Watch the guard go green**

```bash
pnpm --filter @project/engine test src/rules/__tests__/proficiencyRosterDrift.test.ts
pnpm --filter @project/database test
```

Expected: both green. The guard that failed in Task 1 step 6 now passes, and nothing else moved.

- [ ] **Step 5: Sabotage the tools case in both directions**

A guard that has only ever been seen to fail on pre-existing data is not yet known to work on new data.

**A — an off-roster id must fail.** Patch `gnome.json` with `{"renameProficiencyIds":{"tools":{"tinkers_tools":"tinkerers_tools"}}}` and run the drift test. Expected: FAIL naming `tinker: tools/tinkerers_tools`. Reverse it with the opposite rename and confirm green.

**B — a legitimate id must pass.** Patch with `{"renameProficiencyIds":{"tools":{"tinkers_tools":"herbalism_kit"}}}`. Expected: PASS — wrong rules, right vocabulary, which is what this guard is and is not for. Reverse it.

Finish with `git diff packages/database/data` showing only the two intended lines.

- [ ] **Step 6: Commit**

```bash
git add packages/database/data
git commit -m "fix(pack): two tool ids the new roster rejected

The gnome's Tinker granted artisans_tools, a category, where its own lore
says tinker's tools. The dwarf's third artisan option was spelled mason_tools
beside smiths_tools and brewers_supplies.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: The class skill grants

**Files:**
- Modify: `packages/database/data/packs/core_2014_pack/classes/{bard,cleric,druid,fighter,monk,paladin,ranger,rogue,sorcerer,warlock,wizard}.json`
- Modify: `packages/database/data/packs/core_2014_pack/traits/unimplemented.json`
- Create: `<scratchpad>/authorTraits.mjs`

**Interfaces:**
- Consumes: the green guard from Task 2.
- Produces: `authorTraits.mjs`, a driver taking `--table <file>` where the table is a JSON array of `{ traitId, segment, name, lore, proficiencies }`. It upserts each trait into its segment and deletes every `traitId` from `traits/unimplemented.json`. Tasks 4, 5 and 6 reuse it with their own tables.

Thirteen traits: eleven class skill choice blocks and two multiclass ones.

- [ ] **Step 1: Write the driver**

Write `authorTraits.mjs` in your scratchpad:

```js
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PACK = "data/packs/core_2014_pack";
const SCRATCH = process.env.SCRATCH ?? ".";

const tablePath = process.argv[process.argv.indexOf("--table") + 1];
const table = JSON.parse(fs.readFileSync(tablePath, "utf8"));

const trait = (row) => ({
  id: row.traitId,
  name: row.name,
  lore: { shortDescription: row.lore, fullText: row.lore },
  modifiers: { fixed: [], choices: [] },
  proficiencies: {
    fixed: row.proficiencies.fixed ?? [],
    choices: row.proficiencies.choices ?? [],
  },
  resources: [],
  triggers: [],
  diceRules: [],
  criticalHitModifiers: [],
  actions: [],
});

const run = (segment, patch, label) => {
  const file = path.join(SCRATCH, `patch-${label}.json`);
  fs.writeFileSync(file, JSON.stringify(patch, null, 2));
  execFileSync("npx", ["tsx", "scripts/patchPackSegment.ts", segment, file], {
    stdio: "inherit",
  });
};

const bySegment = {};
for (const row of table) (bySegment[row.segment] ??= []).push(trait(row));

for (const [segment, traits] of Object.entries(bySegment)) {
  run(`${PACK}/${segment}`, { upsertTraits: traits }, segment.replace(/[/.]/g, "-"));
}

run(
  `${PACK}/traits/unimplemented.json`,
  { deleteTraitIds: table.map((row) => row.traitId) },
  "unimplemented-" + path.basename(tablePath, ".json"),
);

console.log(`authored ${table.length} traits across ${Object.keys(bySegment).length} segments`);
```

A row's `proficiencies` is passed through untouched, so a table can carry fixed grants, choice blocks or both.

- [ ] **Step 2: Write the skills table**

Write `table-class-skills.json` in your scratchpad. `chooseAmount` is required on every block — the schema defaults it to 1, and the barbarian shipped with one starting skill instead of two because it was omitted.

```json
[
  { "traitId": "trait_bard_prof_skills", "segment": "classes/bard.json", "name": "Skill Proficiencies (Bard)",
    "lore": "You gain proficiency with any three skills of your choice.",
    "proficiencies": { "choices": [ { "id": "bard_starting_skills", "category": "skills", "chooseAmount": 3, "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_cleric_prof_skills", "segment": "classes/cleric.json", "name": "Skill Proficiencies (Cleric)",
    "lore": "You gain proficiency with two skills from History, Insight, Medicine, Persuasion and Religion.",
    "proficiencies": { "choices": [ { "id": "cleric_starting_skills", "category": "skills", "chooseAmount": 2, "options": ["history","insight","medicine","persuasion","religion"], "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_druid_prof_skills", "segment": "classes/druid.json", "name": "Skill Proficiencies (Druid)",
    "lore": "You gain proficiency with two skills from Arcana, Animal Handling, Insight, Medicine, Nature, Perception, Religion and Survival.",
    "proficiencies": { "choices": [ { "id": "druid_starting_skills", "category": "skills", "chooseAmount": 2, "options": ["arcana","animal_handling","insight","medicine","nature","perception","religion","survival"], "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_fighter_prof_skills", "segment": "classes/fighter.json", "name": "Skill Proficiencies (Fighter)",
    "lore": "You gain proficiency with two skills from Acrobatics, Animal Handling, Athletics, History, Insight, Intimidation, Perception and Survival.",
    "proficiencies": { "choices": [ { "id": "fighter_starting_skills", "category": "skills", "chooseAmount": 2, "options": ["acrobatics","animal_handling","athletics","history","insight","intimidation","perception","survival"], "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_monk_prof_skills", "segment": "classes/monk.json", "name": "Skill Proficiencies (Monk)",
    "lore": "You gain proficiency with two skills from Acrobatics, Athletics, History, Insight, Religion and Stealth.",
    "proficiencies": { "choices": [ { "id": "monk_starting_skills", "category": "skills", "chooseAmount": 2, "options": ["acrobatics","athletics","history","insight","religion","stealth"], "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_paladin_prof_skills", "segment": "classes/paladin.json", "name": "Skill Proficiencies (Paladin)",
    "lore": "You gain proficiency with two skills from Athletics, Insight, Intimidation, Medicine, Persuasion and Religion.",
    "proficiencies": { "choices": [ { "id": "paladin_starting_skills", "category": "skills", "chooseAmount": 2, "options": ["athletics","insight","intimidation","medicine","persuasion","religion"], "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_ranger_prof_skills", "segment": "classes/ranger.json", "name": "Skill Proficiencies (Ranger)",
    "lore": "You gain proficiency with three skills from Animal Handling, Athletics, Insight, Investigation, Nature, Perception, Stealth and Survival.",
    "proficiencies": { "choices": [ { "id": "ranger_starting_skills", "category": "skills", "chooseAmount": 3, "options": ["animal_handling","athletics","insight","investigation","nature","perception","stealth","survival"], "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_rogue_prof_skills", "segment": "classes/rogue.json", "name": "Skill Proficiencies (Rogue)",
    "lore": "You gain proficiency with four skills from Acrobatics, Athletics, Deception, Insight, Intimidation, Investigation, Perception, Performance, Persuasion, Sleight of Hand and Stealth.",
    "proficiencies": { "choices": [ { "id": "rogue_starting_skills", "category": "skills", "chooseAmount": 4, "options": ["acrobatics","athletics","deception","insight","intimidation","investigation","perception","performance","persuasion","sleight_of_hand","stealth"], "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_sorcerer_prof_skills", "segment": "classes/sorcerer.json", "name": "Skill Proficiencies (Sorcerer)",
    "lore": "You gain proficiency with two skills from Arcana, Deception, Insight, Intimidation, Persuasion and Religion.",
    "proficiencies": { "choices": [ { "id": "sorcerer_starting_skills", "category": "skills", "chooseAmount": 2, "options": ["arcana","deception","insight","intimidation","persuasion","religion"], "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_warlock_prof_skills", "segment": "classes/warlock.json", "name": "Skill Proficiencies (Warlock)",
    "lore": "You gain proficiency with two skills from Arcana, Deception, History, Intimidation, Investigation, Nature and Religion.",
    "proficiencies": { "choices": [ { "id": "warlock_starting_skills", "category": "skills", "chooseAmount": 2, "options": ["arcana","deception","history","intimidation","investigation","nature","religion"], "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_wizard_prof_skills", "segment": "classes/wizard.json", "name": "Skill Proficiencies (Wizard)",
    "lore": "You gain proficiency with two skills from Arcana, History, Insight, Investigation, Medicine and Religion.",
    "proficiencies": { "choices": [ { "id": "wizard_starting_skills", "category": "skills", "chooseAmount": 2, "options": ["arcana","history","insight","investigation","medicine","religion"], "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_bard_prof_mult_skills", "segment": "classes/bard.json", "name": "Multiclass Skill Proficiency (Bard)",
    "lore": "Multiclassing into bard grants proficiency with one skill of your choice.",
    "proficiencies": { "choices": [ { "id": "bard_multiclass_skill", "category": "skills", "chooseAmount": 1, "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_rogue_mult_prof_skills", "segment": "classes/rogue.json", "name": "Multiclass Skill Proficiency (Rogue)",
    "lore": "Multiclassing into rogue grants proficiency with one skill from the rogue's list.",
    "proficiencies": { "choices": [ { "id": "rogue_multiclass_skill", "category": "skills", "chooseAmount": 1, "options": ["acrobatics","athletics","deception","insight","intimidation","investigation","perception","performance","persuasion","sleight_of_hand","stealth"], "level": "proficient", "requiredStates": [] } ] } }
]
```

The bard's two blocks carry no `options`, which means "anything from this category" — `ProficiencyExtractor.rosterFor` falls back to `listProficiencyOptions("skills")`, the whole of `SKILL_MAP`. That is the rule: the bard picks any three.

- [ ] **Step 3: Run the driver**

From `packages/database`:

```bash
SCRATCH=<scratchpad> node <scratchpad>/authorTraits.mjs --table <scratchpad>/table-class-skills.json
```

Expected: `authored 13 traits across 11 segments`.

- [ ] **Step 4: Write the failing test**

Create `packages/engine/src/rules/__tests__/authoredProficiencies.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { corePackSnapshot } from "../../pipeline/__tests__/corePackFixture.js";
import { ProficiencyExtractor } from "../../pipeline/proficiencyExtractor.js";

const traits = corePackSnapshot().traitsById;

const pending = (traitId: string) =>
  ProficiencyExtractor.listPendingChoices([traits[traitId]!], {})[0];

describe("class skill grants offer the PHB's list", () => {
  it("offers a rogue four picks from eleven skills", () => {
    const choice = pending("trait_rogue_prof_skills");

    expect(choice.chooseAmount).toBe(4);
    expect(choice.availableOptions).toHaveLength(11);
    expect(choice.availableOptions).toContain("sleight_of_hand");
    expect(choice.availableOptions).not.toContain("arcana");
  });

  it("offers a ranger three picks from eight", () => {
    const choice = pending("trait_ranger_prof_skills");

    expect(choice.chooseAmount).toBe(3);
    expect(choice.availableOptions).toHaveLength(8);
  });

  it("offers a bard three picks from every skill there is", () => {
    const choice = pending("trait_bard_prof_skills");

    expect(choice.chooseAmount).toBe(3);
    expect(choice.availableOptions).toHaveLength(18);
  });

  it("offers one pick for each multiclass grant", () => {
    expect(pending("trait_bard_prof_mult_skills").chooseAmount).toBe(1);
    expect(pending("trait_rogue_mult_prof_skills").availableOptions).toHaveLength(11);
  });

  it("leaves no class skill grant carrying the schema's default of one", () => {
    const classSkillTraits = [
      "trait_cleric_prof_skills",
      "trait_druid_prof_skills",
      "trait_fighter_prof_skills",
      "trait_monk_prof_skills",
      "trait_paladin_prof_skills",
      "trait_sorcerer_prof_skills",
      "trait_warlock_prof_skills",
      "trait_wizard_prof_skills",
    ];

    for (const traitId of classSkillTraits) {
      expect(pending(traitId).chooseAmount).toBe(2);
    }
  });
});
```

The last case exists because the barbarian shipped granting one starting skill instead of two, from exactly this omission.

- [ ] **Step 5: Run everything**

```bash
pnpm --filter @project/engine test
pnpm --filter @project/database test
```

Expected: green, including the five new cases. `implementationMarkers.test.ts` and `traitReachability.test.ts` are both doing real work here — a trait left with an `implementation` block, or one deleted while still referenced, lands in one of them.

- [ ] **Step 6: Check the diff and commit**

```bash
git diff --stat packages/database/data
```

Expected: twelve files — eleven classes plus `traits/unimplemented.json`, which should have lost 13 traits.

```bash
git add packages/database/data packages/engine/src/rules/__tests__/authoredProficiencies.test.ts
git commit -m "feat(pack): every class offers its own starting skills

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: The backgrounds

**Files:**
- Modify: `packages/database/data/packs/core_2014_pack/backgrounds/core.json`
- Modify: `packages/database/data/packs/core_2014_pack/traits/unimplemented.json`
- Modify: `packages/engine/src/rules/__tests__/authoredProficiencies.test.ts`

**Interfaces:**
- Consumes: `authorTraits.mjs` from Task 3, invoked as `node authorTraits.mjs --table <file>`; `TOOL_DICTIONARY` ids from Task 1.
- Produces: nine authored traits. No code interface.

`backgrounds/core.json` has no `traits` array today; the patch script creates one with `segment.traits ??= []`, and `MERGED_SECTIONS` already merges traits from any segment, so the four backgrounds and their traits end up in one file.

- [ ] **Step 1: Write the table**

Write `table-backgrounds.json` in your scratchpad — four skill pairs as fixed grants, two language choices, three tool grants:

```json
[
  { "traitId": "trait_acolyte_prof_skills", "segment": "backgrounds/core.json", "name": "Skill Proficiencies (Acolyte)",
    "lore": "You have proficiency with Insight and Religion.",
    "proficiencies": { "fixed": [
      { "category": "skills", "proficiencyId": "insight", "level": "proficient", "requiredStates": [] },
      { "category": "skills", "proficiencyId": "religion", "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_criminal_prof_skills", "segment": "backgrounds/core.json", "name": "Skill Proficiencies (Criminal)",
    "lore": "You have proficiency with Deception and Stealth.",
    "proficiencies": { "fixed": [
      { "category": "skills", "proficiencyId": "deception", "level": "proficient", "requiredStates": [] },
      { "category": "skills", "proficiencyId": "stealth", "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_noble_prof_skills", "segment": "backgrounds/core.json", "name": "Skill Proficiencies (Noble)",
    "lore": "You have proficiency with History and Persuasion.",
    "proficiencies": { "fixed": [
      { "category": "skills", "proficiencyId": "history", "level": "proficient", "requiredStates": [] },
      { "category": "skills", "proficiencyId": "persuasion", "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_soldier_prof_skills", "segment": "backgrounds/core.json", "name": "Skill Proficiencies (Soldier)",
    "lore": "You have proficiency with Athletics and Intimidation.",
    "proficiencies": { "fixed": [
      { "category": "skills", "proficiencyId": "athletics", "level": "proficient", "requiredStates": [] },
      { "category": "skills", "proficiencyId": "intimidation", "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_acolyte_languages", "segment": "backgrounds/core.json", "name": "Languages (Acolyte)",
    "lore": "You know two languages of your choice.",
    "proficiencies": { "choices": [ { "id": "acolyte_languages", "category": "languages", "chooseAmount": 2, "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_noble_languages", "segment": "backgrounds/core.json", "name": "Languages (Noble)",
    "lore": "You know one language of your choice.",
    "proficiencies": { "choices": [ { "id": "noble_language", "category": "languages", "chooseAmount": 1, "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_noble_prof_tools", "segment": "backgrounds/core.json", "name": "Tool Proficiency (Noble)",
    "lore": "You have proficiency with one gaming set of your choice.",
    "proficiencies": { "choices": [ { "id": "noble_gaming_set", "category": "tools", "chooseAmount": 1, "options": ["dice_set","dragonchess_set","playing_card_set","three_dragon_ante_set"], "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_soldier_prof_tools", "segment": "backgrounds/core.json", "name": "Tool Proficiencies (Soldier)",
    "lore": "You have proficiency with one gaming set of your choice, and with land vehicles.",
    "proficiencies": {
      "fixed": [ { "category": "tools", "proficiencyId": "vehicles_land", "level": "proficient", "requiredStates": [] } ],
      "choices": [ { "id": "soldier_gaming_set", "category": "tools", "chooseAmount": 1, "options": ["dice_set","dragonchess_set","playing_card_set","three_dragon_ante_set"], "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_criminal_prof_tools", "segment": "backgrounds/core.json", "name": "Tool Proficiencies (Criminal)",
    "lore": "You have proficiency with one gaming set of your choice, and with thieves' tools.",
    "proficiencies": {
      "fixed": [ { "category": "tools", "proficiencyId": "thieves_tools", "level": "proficient", "requiredStates": [] } ],
      "choices": [ { "id": "criminal_gaming_set", "category": "tools", "chooseAmount": 1, "options": ["dice_set","dragonchess_set","playing_card_set","three_dragon_ante_set"], "level": "proficient", "requiredStates": [] } ] } }
]
```

- [ ] **Step 2: Run the driver**

From `packages/database`:

```bash
SCRATCH=<scratchpad> node <scratchpad>/authorTraits.mjs --table <scratchpad>/table-backgrounds.json
```

Expected: `authored 9 traits across 1 segments`.

- [ ] **Step 3: Write the test**

Add to `packages/engine/src/rules/__tests__/authoredProficiencies.test.ts`:

```ts
describe("backgrounds grant their PHB proficiencies", () => {
  const grantsOf = (traitId: string) =>
    ProficiencyExtractor.extractProficiencies([traits[traitId]!], {});

  const idsIn = (traitId: string, category: string) =>
    grantsOf(traitId)
      .filter((grant) => grant.category === category)
      .map((grant) => grant.proficiencyId)
      .sort();

  it("gives each background its two skills", () => {
    expect(idsIn("trait_acolyte_prof_skills", "skills")).toEqual(["insight", "religion"]);
    expect(idsIn("trait_criminal_prof_skills", "skills")).toEqual(["deception", "stealth"]);
    expect(idsIn("trait_noble_prof_skills", "skills")).toEqual(["history", "persuasion"]);
    expect(idsIn("trait_soldier_prof_skills", "skills")).toEqual(["athletics", "intimidation"]);
  });

  it("owes the acolyte two languages and the noble one", () => {
    expect(pending("trait_acolyte_languages").chooseAmount).toBe(2);
    expect(pending("trait_noble_languages").chooseAmount).toBe(1);
  });

  it("excludes the secret languages from an open pick", () => {
    const options = pending("trait_acolyte_languages").availableOptions;

    expect(options).toContain("dwarvish");
    expect(options).not.toContain("druidic");
    expect(options).not.toContain("thieves_cant");
  });

  it("gives the soldier land vehicles outright and a gaming set to choose", () => {
    expect(idsIn("trait_soldier_prof_tools", "tools")).toEqual(["vehicles_land"]);
    expect(pending("trait_soldier_prof_tools").availableOptions).toHaveLength(4);
  });
});
```

- [ ] **Step 4: Run everything**

```bash
pnpm --filter @project/engine test
pnpm --filter @project/database test
```

Expected: green. The drift guard now covers every one of these tool and language ids.

- [ ] **Step 5: Commit**

```bash
git diff --stat packages/database/data
git add packages/database/data packages/engine/src/rules/__tests__/authoredProficiencies.test.ts
git commit -m "feat(pack): the four backgrounds grant their skills, languages and tools

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: The class tool grants

**Files:**
- Modify: `packages/database/data/packs/core_2014_pack/classes/{bard,druid,monk,rogue}.json`
- Modify: `packages/database/data/packs/core_2014_pack/traits/unimplemented.json`
- Modify: `packages/engine/src/rules/__tests__/authoredProficiencies.test.ts`

**Interfaces:**
- Consumes: `authorTraits.mjs` from Task 3, invoked as `node authorTraits.mjs --table <file>`; `TOOL_DICTIONARY` ids from Task 1.
- Produces: six authored traits.

- [ ] **Step 1: Write the table**

Write `table-class-tools.json` in your scratchpad. The monk's block is the only one spanning two categories of tool, and it does so by listing all 27 ids — the roster holds specific tools only, so "one type of artisan's tools or one musical instrument" is an option list rather than a category reference:

```json
[
  { "traitId": "trait_bard_prof_tools", "segment": "classes/bard.json", "name": "Tool Proficiencies (Bard)",
    "lore": "You have proficiency with three musical instruments of your choice.",
    "proficiencies": { "choices": [ { "id": "bard_starting_instruments", "category": "tools", "chooseAmount": 3, "options": ["bagpipes","drum","dulcimer","flute","horn","lute","lyre","pan_flute","shawm","viol"], "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_bard_prof_mult_tools", "segment": "classes/bard.json", "name": "Multiclass Tool Proficiency (Bard)",
    "lore": "Multiclassing into bard grants proficiency with one musical instrument of your choice.",
    "proficiencies": { "choices": [ { "id": "bard_multiclass_instrument", "category": "tools", "chooseAmount": 1, "options": ["bagpipes","drum","dulcimer","flute","horn","lute","lyre","pan_flute","shawm","viol"], "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_druid_prof_tools", "segment": "classes/druid.json", "name": "Tool Proficiency (Druid)",
    "lore": "You have proficiency with herbalism kits.",
    "proficiencies": { "fixed": [ { "category": "tools", "proficiencyId": "herbalism_kit", "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_monk_prof_tools", "segment": "classes/monk.json", "name": "Tool Proficiency (Monk)",
    "lore": "You have proficiency with one type of artisan's tools or one musical instrument of your choice.",
    "proficiencies": { "choices": [ { "id": "monk_starting_tool", "category": "tools", "chooseAmount": 1, "options": ["alchemists_supplies","brewers_supplies","calligraphers_supplies","carpenters_tools","cartographers_tools","cobblers_tools","cooks_utensils","glassblowers_tools","jewelers_tools","leatherworkers_tools","masons_tools","painters_supplies","potters_tools","smiths_tools","tinkers_tools","weavers_tools","woodcarvers_tools","bagpipes","drum","dulcimer","flute","horn","lute","lyre","pan_flute","shawm","viol"], "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_rogue_prof_tools", "segment": "classes/rogue.json", "name": "Tool Proficiency (Rogue)",
    "lore": "You have proficiency with thieves' tools.",
    "proficiencies": { "fixed": [ { "category": "tools", "proficiencyId": "thieves_tools", "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_rogue_mult_prof_tools", "segment": "classes/rogue.json", "name": "Multiclass Tool Proficiency (Rogue)",
    "lore": "Multiclassing into rogue grants proficiency with thieves' tools.",
    "proficiencies": { "fixed": [ { "category": "tools", "proficiencyId": "thieves_tools", "level": "proficient", "requiredStates": [] } ] } }
]
```

- [ ] **Step 2: Run the driver**

From `packages/database`:

```bash
SCRATCH=<scratchpad> node <scratchpad>/authorTraits.mjs --table <scratchpad>/table-class-tools.json
```

Expected: `authored 6 traits across 4 segments`.

- [ ] **Step 3: Write the test**

Add to `packages/engine/src/rules/__tests__/authoredProficiencies.test.ts`:

```ts
describe("class tool grants", () => {
  it("offers the bard three instruments from ten", () => {
    const choice = pending("trait_bard_prof_tools");

    expect(choice.chooseAmount).toBe(3);
    expect(choice.availableOptions).toHaveLength(10);
    expect(choice.availableOptions).toContain("lute");
  });

  it("offers the monk artisan's tools and instruments together", () => {
    const options = pending("trait_monk_prof_tools").availableOptions!;

    expect(options).toHaveLength(27);
    expect(options).toContain("smiths_tools");
    expect(options).toContain("flute");
    expect(options).not.toContain("thieves_tools");
  });

  it("gives the rogue thieves' tools outright", () => {
    const grants = ProficiencyExtractor.extractProficiencies(
      [traits["trait_rogue_prof_tools"]!],
      {},
    );

    expect(grants).toEqual([
      {
        category: "tools",
        proficiencyId: "thieves_tools",
        level: "proficient",
        requiredStates: [],
      },
    ]);
  });
});
```

- [ ] **Step 4: Run everything and commit**

```bash
pnpm --filter @project/engine test
pnpm --filter @project/database test
git diff --stat packages/database/data
git add packages/database/data packages/engine/src/rules/__tests__/authoredProficiencies.test.ts
git commit -m "feat(pack): bard, druid, monk and rogue get their tools

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: The subclass bonus grants

**Files:**
- Modify: `packages/database/data/packs/core_2014_pack/classes/{bard,cleric,rogue}.json`
- Modify: `packages/database/data/packs/core_2014_pack/traits/unimplemented.json`
- Modify: `packages/engine/src/rules/__tests__/authoredProficiencies.test.ts`

**Interfaces:**
- Consumes: `authorTraits.mjs` from Task 3, invoked as `node authorTraits.mjs --table <file>`; the `category_armor_*` and `category_weapon_*` vocabulary the item-proficiency branch established, which the catalogue-coverage guard checks.
- Produces: eight authored traits. After this, no proficiency stub remains that the schema can express.

- [ ] **Step 1: Write the table**

Write `table-subclass-bonus.json` in your scratchpad:

```json
[
  { "traitId": "trait_cleric_life_prof_bonus", "segment": "classes/cleric.json", "name": "Bonus Proficiency (Life Domain)",
    "lore": "You gain proficiency with heavy armor.",
    "proficiencies": { "fixed": [ { "category": "armor", "proficiencyId": "category_armor_heavy", "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_cleric_war_prof_bonus", "segment": "classes/cleric.json", "name": "Bonus Proficiency (War Domain)",
    "lore": "You gain proficiency with martial weapons and heavy armor.",
    "proficiencies": { "fixed": [
      { "category": "weapons", "proficiencyId": "category_weapon_martial", "level": "proficient", "requiredStates": [] },
      { "category": "armor", "proficiencyId": "category_armor_heavy", "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_cleric_tempest_prof_bonus", "segment": "classes/cleric.json", "name": "Bonus Proficiency (Tempest Domain)",
    "lore": "You gain proficiency with martial weapons and heavy armor.",
    "proficiencies": { "fixed": [
      { "category": "weapons", "proficiencyId": "category_weapon_martial", "level": "proficient", "requiredStates": [] },
      { "category": "armor", "proficiencyId": "category_armor_heavy", "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_cleric_nature_prof_bonus", "segment": "classes/cleric.json", "name": "Acolyte of Nature (Nature Domain)",
    "lore": "You gain proficiency with heavy armor and one skill from Animal Handling, Nature and Survival. The druid cantrip this feature also grants is not yet authored, because spell lists do not exist in the pack.",
    "proficiencies": {
      "fixed": [ { "category": "armor", "proficiencyId": "category_armor_heavy", "level": "proficient", "requiredStates": [] } ],
      "choices": [ { "id": "nature_domain_skill", "category": "skills", "chooseAmount": 1, "options": ["animal_handling","nature","survival"], "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_blessings_of_knowledge", "segment": "classes/cleric.json", "name": "Blessings of Knowledge (Knowledge Domain)",
    "lore": "You learn two languages of your choice, and gain proficiency with two skills from Arcana, History, Nature and Religion. Your proficiency bonus is doubled for any check you make with either skill.",
    "proficiencies": { "choices": [
      { "id": "knowledge_domain_languages", "category": "languages", "chooseAmount": 2, "level": "proficient", "requiredStates": [] },
      { "id": "knowledge_domain_skills", "category": "skills", "chooseAmount": 2, "options": ["arcana","history","nature","religion"], "level": "expertise", "requiredStates": [] } ] } },

  { "traitId": "trait_bard_lore_prof_bonus", "segment": "classes/bard.json", "name": "Bonus Proficiencies (College of Lore)",
    "lore": "You gain proficiency with three skills of your choice.",
    "proficiencies": { "choices": [ { "id": "lore_bonus_skills", "category": "skills", "chooseAmount": 3, "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_bard_valor_bonus_prof", "segment": "classes/bard.json", "name": "Bonus Proficiencies (College of Valor)",
    "lore": "You gain proficiency with medium armor, shields and martial weapons.",
    "proficiencies": { "fixed": [
      { "category": "armor", "proficiencyId": "category_armor_medium", "level": "proficient", "requiredStates": [] },
      { "category": "armor", "proficiencyId": "category_armor_shield", "level": "proficient", "requiredStates": [] },
      { "category": "weapons", "proficiencyId": "category_weapon_martial", "level": "proficient", "requiredStates": [] } ] } },

  { "traitId": "trait_rogue_assassin_bonus_prof", "segment": "classes/rogue.json", "name": "Bonus Proficiencies (Assassin)",
    "lore": "You gain proficiency with the disguise kit and the poisoner's kit.",
    "proficiencies": { "fixed": [
      { "category": "tools", "proficiencyId": "disguise_kit", "level": "proficient", "requiredStates": [] },
      { "category": "tools", "proficiencyId": "poisoners_kit", "level": "proficient", "requiredStates": [] } ] } }
]
```

The Nature Domain's lore says outright that the druid cantrip is missing. That is deliberate: a reader of the sheet sees what the feature should do and what the pack does not yet carry, rather than a feature quietly short of its rules.

- [ ] **Step 2: Run the driver**

From `packages/database`:

```bash
SCRATCH=<scratchpad> node <scratchpad>/authorTraits.mjs --table <scratchpad>/table-subclass-bonus.json
```

Expected: `authored 8 traits across 3 segments`.

- [ ] **Step 3: Write the test**

Add to `packages/engine/src/rules/__tests__/authoredProficiencies.test.ts`:

```ts
describe("subclass bonus proficiencies", () => {
  const grantsOf = (traitId: string) =>
    ProficiencyExtractor.extractProficiencies([traits[traitId]!], {});

  it("gives the War Domain martial weapons and heavy armour", () => {
    expect(grantsOf("trait_cleric_war_prof_bonus").map((g) => g.proficiencyId).sort()).toEqual([
      "category_armor_heavy",
      "category_weapon_martial",
    ]);
  });

  it("gives the College of Valor medium armour, shields and martial weapons", () => {
    expect(
      grantsOf("trait_bard_valor_bonus_prof").map((g) => g.proficiencyId).sort(),
    ).toEqual([
      "category_armor_medium",
      "category_armor_shield",
      "category_weapon_martial",
    ]);
  });

  it("offers the Knowledge Domain two languages and two skills at expertise", () => {
    const choices = ProficiencyExtractor.listPendingChoices(
      [traits["trait_blessings_of_knowledge"]!],
      {},
    );

    const languages = choices.find((choice) => choice.category === "languages")!;
    const skills = choices.find((choice) => choice.category === "skills")!;

    expect(languages.chooseAmount).toBe(2);
    expect(skills.chooseAmount).toBe(2);
    expect(skills.level).toBe("expertise");
    expect(skills.availableOptions).toEqual([
      "arcana",
      "history",
      "nature",
      "religion",
    ]);
  });

  it("gives the Assassin both kits", () => {
    expect(
      grantsOf("trait_rogue_assassin_bonus_prof").map((g) => g.proficiencyId).sort(),
    ).toEqual(["disguise_kit", "poisoners_kit"]);
  });
});

describe("the proficiency family is closed", () => {
  it("leaves only the three stubs the schema cannot express", () => {
    const remaining = Object.values(traits)
      .filter((trait) => trait.implementation?.mode === "unimplemented")
      .filter((trait) =>
        /prof|languages|blessings_of_knowledge/.test(trait.id),
      )
      .map((trait) => trait.id)
      .sort();

    expect(remaining).toEqual([]);
  });
});
```

The last case is the branch's closing assertion. `trait_expertise`, `trait_feat_skilled`, `trait_jack_of_all_trades` and `trait_remarkable_athlete` do not match that pattern and are deliberately not counted — they are recorded as out of scope in the spec.

- [ ] **Step 4: Run everything and commit**

```bash
pnpm --filter @project/engine test
pnpm --filter @project/database test
git diff --stat packages/database/data
git add packages/database/data packages/engine/src/rules/__tests__/authoredProficiencies.test.ts
git commit -m "feat(pack): subclass bonus proficiencies, including Blessings of Knowledge

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Prove it, then update the docs

**Files:**
- Modify: `packages/engine/src/rules/__tests__/proficiencyRosterDrift.test.ts`
- Modify: `docs/TODO_BACKLOG.md`
- Modify: `docs/superpowers/specs/2026-09-20-proficiency-family-design.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the closing record.

- [ ] **Step 1: Correct the guard's docstring**

`proficiencyRosterDrift.test.ts` opens by saying categories with no roster yet — tools, weapons and armour — are skipped. Two of those three are no longer true. Replace that sentence with:

```
 * Every category is now covered. Skills, languages and tools resolve against
 * the rosters in proficiencyDictionary.ts; weapons and armour resolve against
 * the equipment catalogue, in the second describe below. Only ability_check
 * has no roster, and it has one authored grant and no stubs.
```

- [ ] **Step 2: Run the whole repo**

```bash
pnpm check:hygiene
pnpm --filter @project/shared test
pnpm --filter @project/engine test
pnpm --filter @project/database test
pnpm --filter @project/server test
pnpm --filter @project/web test
pnpm typecheck
```

Expected: all green, total above the 2,027 baseline. Typecheck is a separate gate — a test file can break `tsc` while every suite passes.

- [ ] **Step 3: Import the pack**

None of the authored data is live until the pack is imported:

```bash
pnpm --filter @project/database db:import-pack
```

This truncates the reference tables `CASCADE` and reaches character data; `pnpm --filter @project/database db:seed:samples` restores the ten fixture characters. If the developer database holds anything hand-made, say so and let Lucas decide before running it.

- [ ] **Step 4: Look at a rogue**

Open a level 1 rogue in the character builder and confirm four skill picks are offered from eleven options, and that thieves' tools appear without being chosen. Then open an acolyte and confirm two language picks. The tests assert the data; this confirms it reaches a person.

- [ ] **Step 5: Update the backlog**

In `docs/TODO_BACKLOG.md`:

- Correct **8e**, which records the remaining proficiency stubs as "17 skills and 9 tools" and reasons that tools are blocked for want of a catalogue. That reasoning was wrong: languages have no catalogue either, and tools are the language-shaped case. Record that the whole family is closed bar three, and that the count itself was short — `trait_blessings_of_knowledge` was missed because it was found by an id-pattern search rather than by what the trait does.
- Update **#30** in both the Tier 2 row and section 4a: 36 authored, so 398 becomes 362. Re-run the per-class counts rather than subtracting by hand.
- Open a new item for the three stubs the schema cannot express, with the concept each needs: options drawn from proficiencies already held (Expertise), a choice spanning two categories (the Skilled feat), and blanket half-proficiency (Jack of All Trades, Remarkable Athlete).
- Record the two tool ids that were wrong and that the tools category is now guarded.

- [ ] **Step 6: Close the spec**

Set `Status: implemented` on `docs/superpowers/specs/2026-09-20-proficiency-family-design.md`, and correct anything the implementation contradicted.

- [ ] **Step 7: Check line endings and commit**

```bash
file docs/TODO_BACKLOG.md docs/superpowers/specs/2026-09-20-proficiency-family-design.md packages/engine/src/rules/__tests__/proficiencyRosterDrift.test.ts
git add docs packages/engine/src/rules/__tests__/proficiencyRosterDrift.test.ts
git commit -m "docs: the proficiency family is closed bar three

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verification checklist

- [ ] `pnpm typecheck` clean across all five packages, run separately from the suites.
- [ ] Test count at or above 2,027, with nothing skipped to get there.
- [ ] The drift guard was seen red in Task 1 and green in Task 2, and sabotaged both ways in Task 2 step 5.
- [ ] `git diff` on the pack shows only authored traits and two renamed ids — no reindentation, no line-ending churn.
- [ ] `traits/unimplemented.json` lost exactly 36 traits.
- [ ] `file` reports the original line ending for every file the branch touched.
- [ ] A level 1 rogue in the builder is offered four skills from eleven, and an acolyte two languages.
