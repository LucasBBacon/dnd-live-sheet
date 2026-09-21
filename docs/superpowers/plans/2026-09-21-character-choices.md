# Character Choices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store every character's choices keyed by the question they answer, in a `characters.choices` column that the server, the web sheet, character creation, level-up and the sample seeder all read and write — closing #69 and giving the 31 choice-block traits somewhere to live.

**Architecture:** One zod shape, `CharacterChoicesSchema` (`classSelections` by class then node; `traitSelections` by choice-block id), mirrors the two maps `CharacterSave` already consumes. The server's save builder moves out of the socket gateway into `apps/server/src/services/characterSave.ts` so the gateway, creation and level-up share it. Writes are validated by a new engine method, `CharacterBootstrapper.collectChoiceIssues`, which is `collectSaveIssues` limited to choice codes and ignoring unanswered questions.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`), Zod, Drizzle ORM + drizzle-kit (Postgres), Express, Socket.IO, Vitest, supertest, Zustand. pnpm + turbo monorepo.

**Spec:** `docs/superpowers/specs/2026-09-21-character-choices-design.md`

## Global Constraints

- Branch: `feat/character-choices`. Commit after every task. Every commit message ends with a blank line then exactly `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` — never another model name. Commit with `git commit -F <message-file>`.
- **Line endings.** This checkout mixes CRLF and LF per file; the Write/Edit tools and Git Bash's `sed -i` emit LF. Run `file <path>` before editing and restore the original ending afterwards:
  - to CRLF: `node -e "const fs=require('fs'),f=process.argv[1];fs.writeFileSync(f,fs.readFileSync(f,'utf8').split(/\r?\n/).join('\r\n'))" <path>`
  - to LF: `node -e "const fs=require('fs'),f=process.argv[1];fs.writeFileSync(f,fs.readFileSync(f,'utf8').split(/\r\n/).join('\n'))" <path>`
  - Every existing file this plan edits is CRLF. New source and test files are CRLF. Files drizzle-kit generates under `packages/database/drizzle/` stay **LF**, like their siblings.
- **Typecheck is a separate gate.** Vitest does not typecheck. Per package: `pnpm --filter <pkg> exec tsc --noEmit`, except web: `pnpm --filter @project/web exec tsc -b`. Never through turbo's cache.
- `exactOptionalPropertyTypes` is on: never assign `undefined` to an optional property; use a conditional spread.
- Choice codes, verbatim, that block a write: `wrong_selection_count`, `invalid_option`, `duplicate_selection`, `unmet_prerequisite`, `orphan_selection`, `redundant_selection`. `missing_selection` never blocks a write.
- Creation's 400 body, verbatim: `{ error: "Invalid character choices.", issues: string[] }` (each issue's `message`).
- Level-up's thrown error message starts, verbatim: `Invalid character choices: ` followed by the issue messages joined with `; `.
- A stored `choices` value that fails to parse is logged with `console.error` naming the character id and treated as empty — never thrown.
- The dev database's migration is applied only by the controller, with the owner's permission (Task 9). Implementers generate migrations; they never run `db:migrate`, `db:push` or any seeder against a database.

## File Map

| File | Change | Task |
| --- | --- | --- |
| `packages/shared/src/schemas/runtime/characterSave.ts` | `CharacterChoicesSchema`, `CharacterChoices`, `emptyCharacterChoices` | 1 |
| `packages/shared/src/schemas/transport/createCharacter.ts` | `choices` optional | 1 |
| `packages/shared/src/schemas/transport/levelUp.ts` | `selectedTraits` record; `traitSelections` | 1 |
| `packages/shared/src/schemas/__tests__/characterChoices.test.ts` | Create | 1 |
| `packages/engine/src/pipeline/characterBootstrapper.ts` | `collectChoiceIssues` (2); delete `selectionsFromChosenTraitIds` (8) | 2, 8 |
| `packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts` | Choice-issue and ASI tests (2); delete the guessing tests (8) | 2, 8 |
| `packages/database/src/schema/operational.ts` | `characters.choices` | 3 |
| `packages/database/drizzle/0014_add_character_choices.sql` + `meta/` | Generated | 3 |
| `packages/database/src/__tests__/characterChoicesColumn.test.ts` | Create | 3 |
| `apps/server/src/services/characterSave.ts` | Create: `toCharacterSave`, `readStoredChoices` | 4 |
| `apps/server/src/services/__tests__/characterSave.test.ts` | Create (absorbs the gateway's save test) | 4 |
| `apps/server/src/gateway/socket.ts` | Read choices; drop the guessing | 4 |
| `apps/server/src/gateway/__tests__/socket.characterSave.test.ts` | Delete (moved) | 4 |
| `apps/server/src/gateway/__tests__/socket.actionIntent.test.ts` | Totem tests seed `choices` | 4 |
| `apps/server/src/routes/character.ts` | Creation validates and stores choices | 5 |
| `apps/server/src/routes/__tests__/character.choices.test.ts` | Create (creation 5, level-up 6) | 5, 6 |
| `apps/server/src/controllers/characterController.ts` | Level-up merges and validates choices | 6 |
| `packages/database/src/seedSampleCharacters.ts` | Every sample's choices | 7 |
| `apps/server/src/services/__tests__/sampleCharacterChoices.test.ts` | Create: the zero-issues invariant | 7 |
| `apps/web/src/store/characterSheetStore.ts` | `choices` state, save builder | 8 |
| `apps/web/src/pages/characterSheetRouteData.ts` | Hydrate `choices` | 8 |
| `apps/web/src/pages/__tests__/characterSheetRouteData.test.ts` | Create | 8 |
| `apps/web/src/store/__tests__/characterSheetStore.test.ts` | Totem test uses `choices`; skill-choice test | 8 |
| `docs/TODO_BACKLOG.md` | #69 closed, #73 opened, Tier 1 regrouped | 9 |

---

### Task 1: The choices shape and the two payloads

**Files:**
- Modify: `packages/shared/src/schemas/runtime/characterSave.ts`
- Modify: `packages/shared/src/schemas/transport/createCharacter.ts`
- Modify: `packages/shared/src/schemas/transport/levelUp.ts`
- Create: `packages/shared/src/schemas/__tests__/characterChoices.test.ts`

**Interfaces:**
- Produces (exported from `@project/shared` via the existing `export *` of `characterSave.js`): `CharacterChoicesSchema`, `type CharacterChoices = { classSelections: Record<string, Record<string, string[]>>; traitSelections: Record<string, string[]> }`, `emptyCharacterChoices(): CharacterChoices`.
- Produces: `CreateCharacterPayload.choices?: CharacterChoices`; `LevelUpPayload.selectedTraits?: Record<string, string[]>` (nodeId -> picks); `LevelUpPayload.traitSelections?: Record<string, string[]>`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/schemas/__tests__/characterChoices.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CharacterChoicesSchema,
  emptyCharacterChoices,
} from "../runtime/characterSave.js";
import { CreateCharacterPayloadSchema } from "../transport/createCharacter.js";

describe("CharacterChoicesSchema", () => {
  it("parses class selections by class then node, and trait selections by block", () => {
    const choices = {
      classSelections: {
        class_fighter: { fighter_level_1_fighting_style: ["trait_fs_defense"] },
      },
      traitSelections: { fighter_starting_skills: ["athletics", "perception"] },
    };

    expect(CharacterChoicesSchema.parse(choices)).toEqual(choices);
  });

  it("defaults both maps, so an empty stored value is a valid one", () => {
    expect(CharacterChoicesSchema.parse({})).toEqual(emptyCharacterChoices());
    expect(emptyCharacterChoices()).toEqual({
      classSelections: {},
      traitSelections: {},
    });
  });

  it("rejects a class selection that is not a map of picks", () => {
    expect(
      CharacterChoicesSchema.safeParse({ classSelections: { class_fighter: "x" } })
        .success,
    ).toBe(false);
  });
});

describe("CreateCharacterPayloadSchema choices", () => {
  const payload = {
    name: "Lyra",
    raceId: "race_half_elf",
    subraceId: null,
    classId: "class_bard",
    subclassId: null,
    baseAbilityScores: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 15 },
    alignment: "Chaotic Good",
    background: { type: "PRESET", presetId: "background_noble", customData: null },
    personality: { traits: "", ideals: "", bonds: "", flaws: "" },
  };

  it("accepts a payload without choices", () => {
    expect(CreateCharacterPayloadSchema.parse(payload).choices).toBeUndefined();
  });

  it("carries choices when they are sent", () => {
    const choices = {
      classSelections: {},
      traitSelections: { half_elf_asi_choice: ["DEX", "CON"] },
    };

    expect(
      CreateCharacterPayloadSchema.parse({ ...payload, choices }).choices,
    ).toEqual(choices);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @project/shared exec vitest run src/schemas/__tests__/characterChoices.test.ts`
Expected: FAIL — `CharacterChoicesSchema` / `emptyCharacterChoices` are not exported.

- [ ] **Step 3: Add the shape**

In `packages/shared/src/schemas/runtime/characterSave.ts`, directly above `export const CharacterSaveSchema`, add:

```ts
/**
 * Every answer a character has given, keyed by the question it answers.
 *
 * The two maps CharacterSave consumes, stored as-is: class progression picks
 * by class and then by the grant's nodeId, and trait choice-block picks by the
 * block's id. Persisting the question with the answer is the point - the
 * database used to keep chosen traits as bare rows and guess the node back,
 * crediting a pick to every node that offered it (#69).
 */
export const CharacterChoicesSchema = z.object({
  classSelections: z
    .record(z.string(), z.record(z.string(), z.array(z.string())))
    .default({}),
  traitSelections: z.record(z.string(), z.array(z.string())).default({}),
});

export type CharacterChoices = z.infer<typeof CharacterChoicesSchema>;

/** A character that has not answered anything yet. */
export const emptyCharacterChoices = (): CharacterChoices => ({
  classSelections: {},
  traitSelections: {},
});
```

- [ ] **Step 4: Add `choices` to the creation payload**

In `packages/shared/src/schemas/transport/createCharacter.ts`, add the import:

```ts
import { CharacterChoicesSchema } from "../runtime/characterSave.js";
```

and add this field to `CreateCharacterPayloadSchema`, after `startingEquipment`:

```ts
  // the answers to the questions level 1 asks - class picks by node, trait
  // choice-block picks by block id; omitted until the wizard asks them
  choices: CharacterChoicesSchema.optional(),
```

- [ ] **Step 5: Key level-up's picks by node**

In `packages/shared/src/schemas/transport/levelUp.ts`, replace the `selectedTraits?: string[];` line with:

```ts
  // class progression picks made at this level, keyed by the grant's nodeId
  selectedTraits?: Record<string, string[]>;
  // trait choice-block picks that arrive with this level, keyed by block id
  traitSelections?: Record<string, string[]>;
```

- [ ] **Step 6: Run the test to verify it passes, and typecheck**

Run: `pnpm --filter @project/shared exec vitest run src/schemas/__tests__/characterChoices.test.ts`
Expected: PASS.

Run: `pnpm --filter @project/shared exec tsc --noEmit`, `pnpm --filter @project/server exec tsc --noEmit`, `pnpm --filter @project/web exec tsc -b`
Expected: no errors. (`selectedTraits` changing type touches `apps/server/src/controllers/characterController.ts`, whose `Object.values(payload.selectedTraits).flat()` still typechecks, and `apps/web/src/store/levelUpStore.ts`, which only passes the field through. If either fails, report it rather than changing behaviour — Task 6 rewrites the controller's use.)

- [ ] **Step 7: Restore endings (CRLF), commit**

```bash
git add packages/shared/src/schemas/runtime/characterSave.ts packages/shared/src/schemas/transport/createCharacter.ts packages/shared/src/schemas/transport/levelUp.ts packages/shared/src/schemas/__tests__/characterChoices.test.ts
git commit -F <message-file>   # "feat(shared): a character's choices, keyed by the question they answer"
```

---

### Task 2: `collectChoiceIssues`, and proof a stored ASI choice takes effect

**Files:**
- Modify: `packages/engine/src/pipeline/characterBootstrapper.ts` (beside `collectSaveIssues`)
- Test: `packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts`

**Interfaces:**
- Produces: `CharacterBootstrapper.collectChoiceIssues(save: CharacterSave, snapshot?: RuleSnapshotLookup): SaveValidationIssue[]` — `collectSaveIssues` filtered to the six choice codes in Global Constraints.

The test file's `fighter(overrides)` fixture builds a level 1 hill-dwarf fighter whose `selections` answer `fighter_level_1_fighting_style` with `trait_fs_defense` and whose `traitSelections` answer `dwarf_artisan_tools` and `fighter_starting_skills`; `overrides` replace fields of its single class entry. `corePackSnapshot()` is the shipped pack.

- [ ] **Step 1: Write the failing tests**

Add `import { ModifierExtractor } from "../modifierExtractor.js";` to the imports, and append:

```ts
describe("CharacterBootstrapper.collectChoiceIssues", () => {
  const codes = (save: CharacterSave) =>
    CharacterBootstrapper.collectChoiceIssues(save, corePackSnapshot()).map(
      (issue) => issue.code,
    );

  it("reports nothing for a save whose picks are all valid", () => {
    expect(codes(fighter())).toEqual([]);
  });

  // until the wizard asks a question, leaving it unanswered is expected
  it("does not report a question that has not been answered yet", () => {
    const save = fighter({ selections: {} });

    expect(
      CharacterBootstrapper.collectSaveIssues(save, corePackSnapshot()).map(
        (issue) => issue.code,
      ),
    ).toContain("missing_selection");
    expect(codes(save)).toEqual([]);
  });

  it("reports an option the question does not offer", () => {
    const save = fighter({
      selections: { fighter_level_1_fighting_style: ["trait_fs_not_real"] },
    });

    expect(codes(save)).toContain("invalid_option");
  });

  it("reports a trait choice block given the wrong number of picks", () => {
    const save = {
      ...fighter(),
      traitSelections: {
        ...fighter().traitSelections,
        fighter_starting_skills: ["athletics"],
      },
    };

    expect(codes(save)).toContain("wrong_selection_count");
  });

  it("leaves issues that are not about choices to collectSaveIssues", () => {
    const save = {
      ...fighter(),
      race: { baseRaceId: "race_not_real", hasSubraces: false, subraceId: null },
    };

    expect(
      CharacterBootstrapper.collectSaveIssues(save, corePackSnapshot()).map(
        (issue) => issue.code,
      ),
    ).toContain("unknown_race");
    expect(codes(save)).not.toContain("unknown_race");
  });
});

describe("a stored trait selection reaches the modifiers", () => {
  it("turns a half-elf's ability score choice into +1 on each chosen ability", () => {
    const save: CharacterSave = {
      ...fighter(),
      race: { baseRaceId: "race_half_elf", hasSubraces: false, subraceId: null },
      traitSelections: { half_elf_asi_choice: ["DEX", "CON"] },
    };

    const plusOnes = ModifierExtractor.extractModifiers(
      CharacterBootstrapper.compileActiveTraits(save, corePackSnapshot()),
      CharacterBootstrapper.resolveSelections(save),
    ).filter(
      (modifier) =>
        modifier.type === "add" &&
        modifier.value === 1 &&
        ["STR", "DEX", "CON", "INT", "WIS"].includes(modifier.target),
    );

    expect(plusOnes.map((modifier) => modifier.target).sort()).toEqual([
      "CON",
      "DEX",
    ]);
  });
});
```

- [ ] **Step 2: Run to verify the choice-issue tests fail**

Run: `pnpm --filter @project/engine exec vitest run src/pipeline/__tests__/characterBootstraper.test.ts`
Expected: the `collectChoiceIssues` tests FAIL (`collectChoiceIssues is not a function`). The ASI test already passes — it pins existing extractor behaviour that stored choices now feed; keep it. If `codes(fighter())` is not `[]`, the fixture itself carries an invalid pick: stop and report NEEDS_CONTEXT with the codes.

- [ ] **Step 3: Implement**

In `characterBootstrapper.ts`, add near the top-level constants (after the `SaveValidationIssue` interface):

```ts
/**
 * The issues that mean a stored answer is wrong. missing_selection is not
 * among them: an unanswered question is expected until the UI asks it.
 */
const CHOICE_ISSUE_CODES: ReadonlySet<SaveValidationCode> = new Set([
  "wrong_selection_count",
  "invalid_option",
  "duplicate_selection",
  "unmet_prerequisite",
  "orphan_selection",
  "redundant_selection",
]);
```

and add this method to `CharacterBootstrapper`, directly after `collectSaveIssues`:

```ts
  /**
   * The choice problems in a save, for the endpoints that store choices.
   *
   * collectSaveIssues judges the whole save; a write only needs to know
   * whether the answers it is storing are valid, so everything else - and an
   * unanswered question - is left out.
   */
  public static collectChoiceIssues(
    save: CharacterSave,
    snapshot?: RuleSnapshotLookup,
  ): SaveValidationIssue[] {
    return CharacterBootstrapper.collectSaveIssues(save, snapshot).filter(
      (issue) => CHOICE_ISSUE_CODES.has(issue.code),
    );
  }
```

- [ ] **Step 4: Run to verify they pass; engine suite; typecheck**

Run: `pnpm --filter @project/engine exec vitest run src/pipeline/__tests__/characterBootstraper.test.ts` — PASS.
Run: `pnpm --filter @project/engine test` — PASS. `pnpm --filter @project/engine exec tsc --noEmit` — clean.

- [ ] **Step 5: Restore endings (CRLF), commit**

```bash
git add packages/engine/src/pipeline/characterBootstrapper.ts packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts
git commit -F <message-file>   # "feat(engine): collectChoiceIssues, the choice half of save validation"
```

---

### Task 3: The `characters.choices` column

**Files:**
- Modify: `packages/database/src/schema/operational.ts` (the `characters` table, after `customBackgroundData`)
- Generate: `packages/database/drizzle/0014_add_character_choices.sql`, `packages/database/drizzle/meta/0014_snapshot.json`, `packages/database/drizzle/meta/_journal.json`
- Create: `packages/database/src/__tests__/characterChoicesColumn.test.ts`

**Interfaces:**
- Consumes: `type CharacterChoices` from `@project/shared` (Task 1).
- Produces: `characters.choices` — non-null `jsonb`, typed `CharacterChoices`, default `{ classSelections: {}, traitSelections: {} }`.

- [ ] **Step 1: Write the failing test**

Create `packages/database/src/__tests__/characterChoicesColumn.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { characters } from "../schema/operational.js";

describe("characters.choices", () => {
  it("is a non-null jsonb column defaulting to two empty maps", () => {
    const column = getTableConfig(characters).columns.find(
      (candidate) => candidate.name === "choices",
    );

    expect(column?.getSQLType()).toBe("jsonb");
    expect(column?.notNull).toBe(true);
    expect(column?.default).toEqual({ classSelections: {}, traitSelections: {} });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @project/database exec vitest run src/__tests__/characterChoicesColumn.test.ts`
Expected: FAIL — no `choices` column.

- [ ] **Step 3: Add the column**

In `operational.ts`, add `type CharacterChoices` to the existing import from `@project/shared`, and add after the `customBackgroundData` column:

```ts
  // every answer the character has given, keyed by the question it answers -
  // class picks by class and node, trait choice-block picks by block (#69)
  choices: jsonb("choices")
    .$type<CharacterChoices>()
    .notNull()
    .default({ classSelections: {}, traitSelections: {} }),
```

- [ ] **Step 4: Generate the migration**

Run: `pnpm --filter @project/database db:generate --name add_character_choices`
Expected: a new `packages/database/drizzle/0014_add_character_choices.sql` containing exactly one statement, of the form
`ALTER TABLE "characters" ADD COLUMN "choices" jsonb DEFAULT '{"classSelections":{},"traitSelections":{}}'::jsonb NOT NULL;`
plus `meta/0014_snapshot.json` and an updated `meta/_journal.json`. If the SQL contains anything else, or drizzle-kit prompts, stop and report NEEDS_CONTEXT with its output. Do **not** run `db:migrate`. Confirm the three generated files are LF (`grep -c $'\r' <file>` prints 0).

- [ ] **Step 5: Run the test; database suite; typecheck**

Run: `pnpm --filter @project/database exec vitest run src/__tests__/characterChoicesColumn.test.ts` — PASS.
Run: `pnpm --filter @project/database test` — PASS. `pnpm --filter @project/database exec tsc --noEmit` — clean.

- [ ] **Step 6: Restore endings, commit**

`operational.ts` and the new test are CRLF; the generated files stay LF.

```bash
git add packages/database/src/schema/operational.ts packages/database/src/__tests__/characterChoicesColumn.test.ts packages/database/drizzle/0014_add_character_choices.sql packages/database/drizzle/meta/0014_snapshot.json packages/database/drizzle/meta/_journal.json
git commit -F <message-file>   # "feat(database): characters.choices, keyed by the question each pick answers"
```

---

### Task 4: One save builder, and the gateway reads stored choices

**Files:**
- Create: `apps/server/src/services/characterSave.ts`
- Create: `apps/server/src/services/__tests__/characterSave.test.ts`
- Modify: `apps/server/src/gateway/socket.ts` (`toCharacterSave` removed; `getAuthoritativeRuntimeContext`)
- Delete: `apps/server/src/gateway/__tests__/socket.characterSave.test.ts`
- Modify: `apps/server/src/gateway/__tests__/socket.actionIntent.test.ts` (the two Totem Warrior tests)

**Interfaces:**
- Consumes: `CharacterChoicesSchema`, `emptyCharacterChoices`, `type CharacterChoices`, `type CharacterSave` from `@project/shared`; `characters.choices` (Task 3).
- Produces, from `apps/server/src/services/characterSave.ts`:
  - `interface CharacterSaveSource { raceId: string; subraceId: string | null; backgroundId?: string | null; str: number; dex: number; con: number; int: number; wis: number; cha: number; currentHp: number | null; maxHp: number | null }`
  - `interface CharacterClassSource { classId: string; classLevel: number; subclassId: string | null }`
  - `toCharacterSave(character: CharacterSaveSource, classes: CharacterClassSource[], choices?: CharacterChoices): CharacterSave`
  - `readStoredChoices(value: unknown, characterId: string): CharacterChoices`

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/services/__tests__/characterSave.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { readStoredChoices, toCharacterSave } from "../characterSave.js";

const row = (overrides: Record<string, unknown> = {}) => ({
  raceId: "race_dwarf",
  subraceId: "subrace_dwarf_hill",
  str: 16,
  dex: 12,
  con: 14,
  int: 10,
  wis: 10,
  cha: 8,
  currentHp: 20,
  maxHp: 24,
  ...overrides,
});

const fighterLedger = [
  { classId: "class_fighter", classLevel: 1, subclassId: null },
];

describe("toCharacterSave", () => {
  it("carries the character's background into the save", () => {
    const save = toCharacterSave(
      row({ backgroundId: "background_criminal" }),
      fighterLedger,
    );

    expect(save.backgroundId).toBe("background_criminal");
  });

  it("leaves the background off a character that has none", () => {
    const save = toCharacterSave(row({ backgroundId: null }), fighterLedger);

    expect("backgroundId" in save).toBe(false);
  });

  it("answers each class's questions from the stored choices", () => {
    const save = toCharacterSave(row(), fighterLedger, {
      classSelections: {
        class_fighter: { fighter_level_1_fighting_style: ["trait_fs_defense"] },
      },
      traitSelections: { fighter_starting_skills: ["athletics", "perception"] },
    });

    expect(save.classes[0]?.selections).toEqual({
      fighter_level_1_fighting_style: ["trait_fs_defense"],
    });
    expect(save.traitSelections).toEqual({
      fighter_starting_skills: ["athletics", "perception"],
    });
  });

  it("gives a class with no stored answers an empty selection map", () => {
    const save = toCharacterSave(row(), fighterLedger);

    expect(save.classes[0]?.selections).toEqual({});
    expect(save.traitSelections).toEqual({});
  });
});

describe("readStoredChoices", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a valid stored value as parsed", () => {
    const stored = {
      classSelections: {},
      traitSelections: { half_elf_asi_choice: ["DEX", "CON"] },
    };

    expect(readStoredChoices(stored, "char-1")).toEqual(stored);
  });

  it("treats a missing value as no answers", () => {
    expect(readStoredChoices(undefined, "char-1")).toEqual({
      classSelections: {},
      traitSelections: {},
    });
  });

  // one bad row must not block a player's join
  it("logs a corrupt value against the character and treats it as empty", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(readStoredChoices({ classSelections: "nope" }, "char-9")).toEqual({
      classSelections: {},
      traitSelections: {},
    });
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("char-9"),
      expect.anything(),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @project/server exec vitest run src/services/__tests__/characterSave.test.ts`
Expected: FAIL — cannot resolve `../characterSave.js`.

- [ ] **Step 3: Create the service**

Create `apps/server/src/services/characterSave.ts`:

```ts
import {
  CharacterChoicesSchema,
  emptyCharacterChoices,
  type CharacterChoices,
  type CharacterSave,
} from "@project/shared";

/** The columns of a characters row that a save is built from. */
export interface CharacterSaveSource {
  raceId: string;
  subraceId: string | null;
  backgroundId?: string | null;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  currentHp: number | null;
  maxHp: number | null;
}

/** A character_classes ledger row, as the save builder reads it. */
export interface CharacterClassSource {
  classId: string;
  classLevel: number;
  subclassId: string | null;
}

/**
 * The engine's save for a stored character.
 *
 * The one builder the gateway, character creation and level-up share, so the
 * three cannot disagree about what a character is. Its choices come from
 * characters.choices, keyed by the question each answers.
 */
export const toCharacterSave = (
  character: CharacterSaveSource,
  classes: CharacterClassSource[],
  choices: CharacterChoices = emptyCharacterChoices(),
): CharacterSave => ({
  attributes: {
    str: character.str,
    dex: character.dex,
    con: character.con,
    int: character.int,
    wis: character.wis,
    cha: character.cha,
  },
  race: {
    baseRaceId: character.raceId,
    hasSubraces: character.subraceId !== null,
    subraceId: character.subraceId,
  },
  ...(character.backgroundId ? { backgroundId: character.backgroundId } : {}),
  classes:
    classes.length > 0
      ? classes.map((entry) => ({
          classId: entry.classId,
          level: entry.classLevel,
          ...(entry.subclassId !== null && { subclassId: entry.subclassId }),
          selections: choices.classSelections[entry.classId] ?? {},
        }))
      : [{ classId: "class_fighter", level: 1, selections: {} }],
  traitSelections: choices.traitSelections,
  hp: {
    current: character.currentHp ?? character.maxHp ?? 1,
    temporary: 0,
    baseRolledHp: character.maxHp ?? 1,
    hitDiceSpent: {},
  },
});

/**
 * A character's stored choices, validated.
 *
 * A value that fails to parse is logged against the character and read as no
 * answers: one corrupt row should cost that character its picks, not stop the
 * player joining the table.
 */
export const readStoredChoices = (
  value: unknown,
  characterId: string,
): CharacterChoices => {
  const parsed = CharacterChoicesSchema.safeParse(value ?? {});
  if (parsed.success) return parsed.data;

  console.error(
    `Stored choices for character ${characterId} failed to parse; treating them as empty.`,
    parsed.error.issues,
  );
  return emptyCharacterChoices();
};
```

- [ ] **Step 4: Run the service test to verify it passes**

Run: `pnpm --filter @project/server exec vitest run src/services/__tests__/characterSave.test.ts` — PASS.

- [ ] **Step 5: Convert the Totem Warrior gateway tests (failing first)**

In `apps/server/src/gateway/__tests__/socket.actionIntent.test.ts`, the tests "resolves a subclass action for a Totem Warrior whose totem was a player choice" and "does not allow Eagle Dash while wearing heavy armour" seed the totem as a `player_choice` trait row. In each, delete the `harness.db.seed(characterTraits, [ ... "player_choice" ... ]);` call and replace `harness.db.seed(characters, [characterRow()]);` with:

```ts
    harness.db.seed(characters, [
      characterRow({
        choices: {
          classSelections: {
            class_barbarian: {
              barbarian_totem_level_3_totem_spirit: ["trait_totem_spirit_eagle"],
            },
          },
          traitSelections: {},
        },
      }),
    ]);
```

If `characterTraits` is then unused in that file, remove it from the import.

Run: `pnpm --filter @project/server exec vitest run src/gateway/__tests__/socket.actionIntent.test.ts`
Expected: the first test FAILS (Eagle Dash no longer resolves: the gateway still guesses from trait rows, which are gone). The heavy-armour test may pass either way; it guards the other direction.

- [ ] **Step 6: Point the gateway at the service and the stored choices**

In `apps/server/src/gateway/socket.ts`:
1. Delete the whole `export const toCharacterSave = (...) => ({ ... });` block.
2. Add `import { readStoredChoices, toCharacterSave } from "../services/characterSave.js";` beside the other `../services/` imports.
3. In `getAuthoritativeRuntimeContext`'s `characters` select, add `choices: characters.choices,` after `backgroundId: characters.backgroundId,`.
4. Delete the `chosenTraitRows` query and its comment, and the `selectionsByClass` block, and replace the `const nextSave = toCharacterSave(character, classRows, selectionsByClass);` line with:

```ts
  const nextSave = toCharacterSave(
    character,
    classRows,
    readStoredChoices(character.choices, characterId),
  );
```

Keep `const { snapshot } = await getCachedRuleSnapshot();` — later code in the function uses it. Remove `characterTraits` from the operational import if nothing else in `socket.ts` uses it (`grep -n characterTraits apps/server/src/gateway/socket.ts`).

5. Delete `apps/server/src/gateway/__tests__/socket.characterSave.test.ts` — its two tests now live in `services/__tests__/characterSave.test.ts`.

- [ ] **Step 7: Run the gateway suites and the server suite; typecheck**

Run: `pnpm --filter @project/server exec vitest run src/gateway src/services/__tests__/characterSave.test.ts` — PASS, including both Totem Warrior tests.
Run: `pnpm --filter @project/server test` — PASS. `pnpm --filter @project/server exec tsc --noEmit` — clean.

- [ ] **Step 8: Restore endings (CRLF), commit**

```bash
git add apps/server/src/services/characterSave.ts apps/server/src/services/__tests__/characterSave.test.ts apps/server/src/gateway/socket.ts apps/server/src/gateway/__tests__/socket.actionIntent.test.ts
git rm apps/server/src/gateway/__tests__/socket.characterSave.test.ts
git commit -F <message-file>   # "feat(server): the gateway builds a character's save from its stored choices (#69)"
```

---

### Task 5: Character creation validates and stores choices

**Files:**
- Modify: `apps/server/src/routes/character.ts` (`POST /`)
- Create: `apps/server/src/routes/__tests__/character.choices.test.ts`

**Interfaces:**
- Consumes: `CreateCharacterPayload.choices` (Task 1); `CharacterBootstrapper.collectChoiceIssues` (Task 2); `characters.choices` (Task 3); `toCharacterSave` (Task 4); `getCachedRuleSnapshot` from `apps/server/src/services/ruleSnapshotCache.ts` (returns `{ snapshot }`).
- Produces: `POST /api/character` stores `choices` (or `{ classSelections: {}, traitSelections: {} }` when omitted), and answers invalid choices with 400 `{ error: "Invalid character choices.", issues: string[] }` before any write.

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/routes/__tests__/character.choices.test.ts`:

```ts
import express, { type Request } from "express";
import path from "node:path";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { assembleCoreRulePack } from "@project/database/pack";
import { toRuleSnapshot, type CoreRulePackSnapshot } from "@project/shared";
import { globalErrorHandler } from "../../middleware/errorHandler.js";

const PACK_DIR = path.join(
  process.cwd(),
  "../../packages/database/data/packs/core_2014_pack",
);

let snapshot: CoreRulePackSnapshot;

beforeAll(async () => {
  snapshot = toRuleSnapshot(await assembleCoreRulePack(PACK_DIR));
});

const mockRuleSnapshot = () => {
  vi.doMock("../../services/ruleSnapshotCache.js", () => ({
    getCachedRuleSnapshot: async () => ({
      cacheVersion: 1,
      loadedAt: 0,
      snapshot,
    }),
    invalidateRuleSnapshotCache: () => undefined,
  }));
};

describe("POST /api/character choices", () => {
  const setupApp = async () => {
    vi.resetModules();
    const values = vi.fn().mockResolvedValue(undefined);
    const tx = { insert: vi.fn(() => ({ values })) };
    const transaction = vi.fn(
      async (callback: (trx: unknown) => Promise<unknown>) => callback(tx),
    );

    vi.doMock("@project/database", () => ({ db: { transaction } }));
    vi.doMock("../../utils/inventory.js", () => ({
      processStartingEquipment: vi.fn(),
    }));
    vi.doMock("../../services/campaignAccess.js", () => ({
      isUserCampaignMember: vi.fn().mockResolvedValue(true),
    }));
    mockRuleSnapshot();

    const { default: characterRoutes } = await import("../character.js");
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as Request & { user?: { id: string } }).user = { id: "user-1" };
      next();
    });
    app.use("/api/character", characterRoutes);
    app.use(globalErrorHandler);
    return { app, transaction, values };
  };

  const lyra = {
    campaignId: "7a0c5bb8-0dc5-4c39-a58f-8f7baae6f27f",
    name: "Lyra",
    raceId: "race_half_elf",
    subraceId: null,
    classId: "class_bard",
    subclassId: null,
    baseAbilityScores: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 15 },
    alignment: "Chaotic Good",
    background: {
      type: "PRESET",
      presetId: "background_noble",
      customData: null,
    },
    personality: { traits: "", ideals: "", bonds: "", flaws: "" },
  };

  it("stores valid choices with the character", async () => {
    const { app, values } = await setupApp();
    const choices = {
      classSelections: {},
      traitSelections: {
        half_elf_asi_choice: ["DEX", "CON"],
        skill_versatility_choice: ["perception", "insight"],
      },
    };

    const response = await request(app)
      .post("/api/character")
      .send({ ...lyra, choices });

    expect(response.status).toBe(201);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ choices }));
  });

  it("stores no answers when the payload sends no choices", async () => {
    const { app, values } = await setupApp();

    const response = await request(app).post("/api/character").send(lyra);

    expect(response.status).toBe(201);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: { classSelections: {}, traitSelections: {} },
      }),
    );
  });

  it("rejects an option the question does not offer, before writing", async () => {
    const { app, transaction } = await setupApp();

    const response = await request(app)
      .post("/api/character")
      .send({
        ...lyra,
        choices: {
          classSelections: {},
          traitSelections: { skill_versatility_choice: ["not_a_skill", "insight"] },
        },
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid character choices.");
    expect(response.body.issues).toEqual(
      expect.arrayContaining([expect.stringContaining("not_a_skill")]),
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects a choice block given the wrong number of picks", async () => {
    const { app, transaction } = await setupApp();

    const response = await request(app)
      .post("/api/character")
      .send({
        ...lyra,
        choices: {
          classSelections: {},
          traitSelections: { half_elf_asi_choice: ["DEX"] },
        },
      });

    expect(response.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @project/server exec vitest run src/routes/__tests__/character.choices.test.ts`
Expected: FAIL — the two storage tests find no `choices` in the inserted values; the two rejection tests get 201.

- [ ] **Step 3: Implement**

In `apps/server/src/routes/character.ts`:
- add `emptyCharacterChoices` to the existing import from `@project/shared`;
- add `import { CharacterBootstrapper } from "@project/engine";`, `import { getCachedRuleSnapshot } from "../services/ruleSnapshotCache.js";` and `import { toCharacterSave } from "../services/characterSave.js";`.

In `router.post("/", ...)`, after the `equipmentResolutionStatus` check and before `const newCharacterId = uuidv4();`, add:

```ts
    // the answers are stored keyed by the question they answer, so a wrong
    // one is refused here rather than silently ignored on every sheet load
    const choices = payload.choices ?? emptyCharacterChoices();
    if (payload.choices) {
      const { snapshot } = await getCachedRuleSnapshot();
      const issues = CharacterBootstrapper.collectChoiceIssues(
        toCharacterSave(
          {
            raceId: payload.raceId,
            subraceId: payload.subraceId,
            backgroundId:
              payload.background.type === "PRESET"
                ? payload.background.presetId
                : null,
            ...payload.baseAbilityScores,
            currentHp: null,
            maxHp: null,
          },
          [
            {
              classId: payload.classId,
              classLevel: 1,
              subclassId: payload.subclassId,
            },
          ],
          choices,
        ),
        snapshot,
      );

      if (issues.length > 0) {
        return res.status(400).json({
          error: "Invalid character choices.",
          issues: issues.map((issue) => issue.message),
        });
      }
    }
```

and in the `tx.insert(characters).values({ ... })` object, add after `customBackgroundData`:

```ts
        choices,
```

- [ ] **Step 4: Run to verify they pass; the route suites; typecheck**

Run: `pnpm --filter @project/server exec vitest run src/routes` — PASS (the existing `character.test.ts` creation tests send no `choices`, so they never load the snapshot).
Run: `pnpm --filter @project/server exec tsc --noEmit` — clean.

- [ ] **Step 5: Restore endings (CRLF), commit**

```bash
git add apps/server/src/routes/character.ts apps/server/src/routes/__tests__/character.choices.test.ts
git commit -F <message-file>   # "feat(server): character creation validates and stores choices"
```

---

### Task 6: Level-up keeps the question with the answer

**Files:**
- Modify: `apps/server/src/controllers/characterController.ts` (`applyLevelUp`)
- Test: `apps/server/src/routes/__tests__/character.choices.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `LevelUpPayload.selectedTraits: Record<string, string[]>` and `.traitSelections` (Task 1); `collectChoiceIssues` (Task 2); `characters.choices` (Task 3); `toCharacterSave`, `readStoredChoices` (Task 4).
- Produces: level-up merges `selectedTraits` into `choices.classSelections[targetClassId]` and `traitSelections` into `choices.traitSelections`, validates when either was sent, writes `choices` in its final `characters` update, and no longer writes `player_choice` trait rows.

- [ ] **Step 1: Write the failing tests**

Append to `apps/server/src/routes/__tests__/character.choices.test.ts`:

```ts
describe("applyLevelUp choices", () => {
  const storedFighter = {
    id: "char-1",
    campaignId: "camp-1",
    raceId: "race_human",
    subraceId: null,
    backgroundId: null,
    str: 16,
    dex: 12,
    con: 14,
    int: 10,
    wis: 10,
    cha: 8,
    currentHp: 20,
    maxHp: 20,
    choices: {
      classSelections: {
        class_fighter: { fighter_level_1_fighting_style: ["trait_fs_defense"] },
      },
      traitSelections: { fighter_starting_skills: ["athletics", "perception"] },
    },
  };

  const setupLevelUp = async () => {
    vi.resetModules();
    const selectResults: unknown[][] = [
      [storedFighter],
      [
        {
          id: "ledger-1",
          characterId: "char-1",
          classId: "class_fighter",
          classLevel: 2,
          subclassId: null,
        },
      ],
    ];
    const tx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(async () => selectResults.shift() ?? []),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    };

    vi.doMock("@project/database", () => ({
      db: {
        transaction: vi.fn(
          async (callback: (trx: unknown) => Promise<unknown>) => callback(tx),
        ),
      },
    }));
    vi.doMock("../../services/levelUpValidation.js", () => ({
      resolveNextLevelValidationContext: vi.fn().mockReturnValue({
        targetLevel: 3,
        isConfigured: true,
        reason: null,
        grantedTraitIds: [],
        decisionTypes: [],
        decisions: [],
      }),
      validateMulticlassPrerequisites: vi.fn(),
      validateLevelUpPayloadFromResolver: vi.fn(),
    }));
    vi.doMock("../../services/effectiveReferenceResolver.js", () => ({
      getEffectiveReferenceSnapshot: vi.fn().mockResolvedValue({ classes: [] }),
    }));
    mockRuleSnapshot();

    const { applyLevelUp } = await import(
      "../../controllers/characterController.js"
    );
    return { applyLevelUp, tx };
  };

  const levelUp = (body: Record<string, unknown>) =>
    ({
      body: {
        characterId: "char-1",
        targetClassId: "class_fighter",
        newTotalLevel: 3,
        hpRoll: 7,
        subclassId: "subclass_fighter_battle_master",
        ...body,
      },
    }) as Request;

  const response = () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    return { res: { status, json } as unknown as express.Response, status, json };
  };

  const maneuvers = [
    "trait_maneuver_precision_attack",
    "trait_maneuver_riposte",
    "trait_maneuver_trip_attack",
  ];

  it("merges this level's picks into the stored choices, keyed by node", async () => {
    const { applyLevelUp, tx } = await setupLevelUp();
    const { res, status } = response();

    await applyLevelUp(
      levelUp({ selectedTraits: { fighter_bm_level_3_maneuvers: maneuvers } }),
      res,
    );

    expect(status).toHaveBeenCalledWith(200);
    expect(tx.set).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: {
          classSelections: {
            class_fighter: {
              fighter_level_1_fighting_style: ["trait_fs_defense"],
              fighter_bm_level_3_maneuvers: maneuvers,
            },
          },
          traitSelections: { fighter_starting_skills: ["athletics", "perception"] },
        },
      }),
    );
  });

  it("no longer writes the picks as player_choice trait rows", async () => {
    const { applyLevelUp, tx } = await setupLevelUp();
    const { res } = response();

    await applyLevelUp(
      levelUp({ selectedTraits: { fighter_bm_level_3_maneuvers: maneuvers } }),
      res,
    );

    const rows = tx.values.mock.calls.flatMap(([arg]) =>
      Array.isArray(arg) ? arg : [arg],
    );
    expect(rows).not.toContainEqual(
      expect.objectContaining({ source: "player_choice" }),
    );
  });

  it("rejects a trait selection the character is not offered", async () => {
    const { applyLevelUp } = await setupLevelUp();
    const { res, status, json } = response();

    await applyLevelUp(
      levelUp({ traitSelections: { fighter_starting_skills: ["arcana", "history"] } }),
      res,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringMatching(/^Invalid character choices: .*arcana/),
      }),
    );
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @project/server exec vitest run src/routes/__tests__/character.choices.test.ts`
Expected: the three `applyLevelUp choices` tests FAIL (no `choices` in `set`; a `player_choice` row written; the invalid selection returns 200). Task 5's tests still pass.

- [ ] **Step 3: Implement**

In `apps/server/src/controllers/characterController.ts`:
- change the type import to `import type { CharacterChoices, LevelUpPayload } from "@project/shared";`
- add `import { CharacterBootstrapper } from "@project/engine";`, `import { getCachedRuleSnapshot } from "../services/ruleSnapshotCache.js";` and `import { readStoredChoices, toCharacterSave } from "../services/characterSave.js";`.

Directly after the `validateLevelUpPayloadFromResolver({ payload, context: resolverContext });` call, add:

```ts
      // the character's answers after this level: the stored ones plus this
      // payload's, each keyed by the question it answers (#69)
      const storedChoices = readStoredChoices(character.choices, characterId);
      const mergedChoices: CharacterChoices = {
        classSelections: {
          ...storedChoices.classSelections,
          [targetClassId]: {
            ...(storedChoices.classSelections[targetClassId] ?? {}),
            ...(payload.selectedTraits ?? {}),
          },
        },
        traitSelections: {
          ...storedChoices.traitSelections,
          ...(payload.traitSelections ?? {}),
        },
      };

      if (payload.selectedTraits || payload.traitSelections) {
        const ledgerAfterLevel = existingClasses.map((entry) => ({
          classId: entry.classId,
          classLevel:
            entry.classId === targetClassId ? targetClassLevel : entry.classLevel,
          subclassId:
            entry.classId === targetClassId
              ? (payload.subclassId ?? entry.subclassId)
              : entry.subclassId,
        }));
        if (!targetClassRecord) {
          ledgerAfterLevel.push({
            classId: targetClassId,
            classLevel: targetClassLevel,
            subclassId: payload.subclassId ?? null,
          });
        }

        const { snapshot } = await getCachedRuleSnapshot();
        const issues = CharacterBootstrapper.collectChoiceIssues(
          toCharacterSave(character, ledgerAfterLevel, mergedChoices),
          snapshot,
        );
        if (issues.length > 0) {
          throw new Error(
            `Invalid character choices: ${issues.map((issue) => issue.message).join("; ")}`,
          );
        }
      }
```

Delete the whole `// append manually selected traits` block (the `if (payload.selectedTraits) { Object.values(...).flat().forEach(... source: "player_choice" ...) }`).

In step 7's `tx.update(characters).set({ ... })`, add `choices: mergedChoices,` after `...asiUpdates,`.

- [ ] **Step 4: Run to verify they pass; server suite; typecheck**

Run: `pnpm --filter @project/server exec vitest run src/routes` — PASS, including every existing test in `character.test.ts`.
Run: `pnpm --filter @project/server test` — PASS. `pnpm --filter @project/server exec tsc --noEmit` — clean.

- [ ] **Step 5: Restore endings (CRLF), commit**

```bash
git add apps/server/src/controllers/characterController.ts apps/server/src/routes/__tests__/character.choices.test.ts
git commit -F <message-file>   # "feat(server): level-up keeps the question with the answer (#69)"
```

---

### Task 7: Every sample character answers its questions

**Files:**
- Modify: `packages/database/src/seedSampleCharacters.ts` (`SampleCharacter`, each `ROSTER` entry, `seedCharacter`'s `columns`)
- Create: `apps/server/src/services/__tests__/sampleCharacterChoices.test.ts`

**Interfaces:**
- Consumes: `type CharacterChoices`, `emptyCharacterChoices`, `toRuleSnapshot`, `type CoreRulePackSnapshot`, `type CharacterSave` from `@project/shared`; `CharacterBootstrapper.collectSaveIssues` from `@project/engine`; `toCharacterSave` (Task 4); `ROSTER` from `@project/database/src/seedSampleCharacters.js`.
- Produces: `SampleCharacter.choices?: CharacterChoices`, written to `characters.choices` by the seeder.

The invariant lives in `apps/server` because `@project/database` does not depend on `@project/engine`.

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/services/__tests__/sampleCharacterChoices.test.ts`:

```ts
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { assembleCoreRulePack } from "@project/database/pack";
import { ROSTER } from "@project/database/src/seedSampleCharacters.js";
import { CharacterBootstrapper } from "@project/engine";
import {
  emptyCharacterChoices,
  toRuleSnapshot,
  type CharacterSave,
  type CoreRulePackSnapshot,
} from "@project/shared";
import { toCharacterSave } from "../characterSave.js";

const PACK_DIR = path.join(
  process.cwd(),
  "../../packages/database/data/packs/core_2014_pack",
);

/**
 * The spell_choice nodes a save's classes and subclasses carry. They list no
 * options until spell lists exist in the pack (#31, #67), so there is nothing
 * valid to seed for them.
 */
const spellChoiceNodeIds = (
  snapshot: CoreRulePackSnapshot,
  save: CharacterSave,
): Set<string> => {
  const ids = new Set<string>();
  for (const entry of save.classes) {
    const rows = [
      ...(snapshot.classesById[entry.classId]?.progression ?? []),
      ...(entry.subclassId
        ? (snapshot.subclassesById[entry.subclassId]?.progression ?? [])
        : []),
    ];
    for (const row of rows) {
      for (const grant of row.grants) {
        if (typeof grant !== "string" && grant.type === "spell_choice") {
          ids.add(grant.nodeId);
        }
      }
    }
  }
  return ids;
};

describe("sample character choices", () => {
  let snapshot: CoreRulePackSnapshot;

  beforeAll(async () => {
    snapshot = toRuleSnapshot(await assembleCoreRulePack(PACK_DIR));
  });

  it.each(ROSTER.map((character) => [character.name, character] as const))(
    "%s answers every question the pack offers options for",
    (_name, character) => {
      const save = toCharacterSave(
        {
          ...character,
          subraceId: character.subraceId ?? null,
          backgroundId: character.backgroundId ?? null,
        },
        character.classes.map((entry) => ({
          classId: entry.classId,
          classLevel: entry.classLevel,
          subclassId: entry.subclassId ?? null,
        })),
        character.choices ?? emptyCharacterChoices(),
      );
      const spellNodes = spellChoiceNodeIds(snapshot, save);

      const issues = CharacterBootstrapper.collectSaveIssues(
        save,
        snapshot,
      ).filter(
        (issue) =>
          !(
            issue.code === "missing_selection" &&
            issue.nodeId !== undefined &&
            spellNodes.has(issue.nodeId)
          ),
      );

      expect(issues).toEqual([]);
    },
  );
});
```

If the pack's progression types make `row.grants` / `grant.type` / `grant.nodeId` need different property access, adapt the access and keep the logic; report the change.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @project/server exec vitest run src/services/__tests__/sampleCharacterChoices.test.ts`
Expected: FAIL for all ten samples (every one has unanswered non-spell questions; Thistle Quickfoot's only one is `wizard_starting_skills`).

- [ ] **Step 3: Give the seeder a `choices` field**

In `packages/database/src/seedSampleCharacters.ts`:
- add `CharacterChoices` to the existing type import from `@project/shared`, and `emptyCharacterChoices` as a value import from `@project/shared`;
- add to `interface SampleCharacter`, after `customTraitIds?`:

```ts
  /**
   * The answers to every question the character's progression and traits ask
   * that the pack lists options for - spell_choice nodes have none until spell
   * lists exist (#31, #67). sampleCharacterChoices.test.ts holds this to zero
   * validation issues.
   */
  choices?: CharacterChoices;
```

- in `seedCharacter`'s `columns` object, add after `customBackgroundData`:

```ts
    choices: character.choices ?? emptyCharacterChoices(),
```

- [ ] **Step 4: Author each sample's choices**

Add a `choices` property to each `ROSTER` entry, matched by `id`. Every value below was checked against the shipped pack's options on 2026-09-21, and within a character no skill, language or tool is picked twice:

```ts
// 00000000-0000-0000-0000-000000000110 Pip Underbough
choices: {
  classSelections: {},
  traitSelections: {
    criminal_gaming_set: ["dice_set"],
    rogue_starting_skills: ["acrobatics", "investigation", "perception", "sleight_of_hand"],
  },
},

// 00000000-0000-0000-0000-000000000111 Sister Aveline Cor
choices: {
  classSelections: {},
  traitSelections: {
    human_language_choice: ["celestial"],
    acolyte_languages: ["draconic", "dwarvish"],
    cleric_starting_skills: ["medicine", "persuasion"],
  },
},

// 00000000-0000-0000-0000-000000000112 Grimnar Stonefist
choices: {
  classSelections: {},
  traitSelections: {
    dwarf_artisan_tools: ["smiths_tools"],
    soldier_gaming_set: ["dice_set"],
    barbarian_starting_skills: ["perception", "survival"],
  },
},

// 00000000-0000-0000-0000-000000000113 Lyra Silverstring
choices: {
  classSelections: {},
  traitSelections: {
    half_elf_asi_choice: ["DEX", "CON"],
    skill_versatility_choice: ["perception", "insight"],
    half_elf_language_choice: ["sylvan"],
    noble_gaming_set: ["playing_card_set"],
    noble_language: ["draconic"],
    bard_starting_instruments: ["lute", "flute", "viol"],
    bard_starting_skills: ["performance", "acrobatics", "arcana"],
    lore_bonus_skills: ["investigation", "medicine", "nature"],
    rogue_multiclass_skill: ["stealth"],
  },
},

// 00000000-0000-0000-0000-000000000114 Vaerix the Ashen
choices: {
  classSelections: {
    class_paladin: { paladin_level_2_fighting_style: ["trait_fs_defense"] },
  },
  traitSelections: {
    noble_gaming_set: ["dragonchess_set"],
    noble_language: ["elvish"],
    paladin_starting_skills: ["athletics", "religion"],
  },
},

// 00000000-0000-0000-0000-000000000115 Nyx Vale
choices: {
  classSelections: {
    class_warlock: {
      warlock_level_2_invocations: ["trait_invocation_armor_of_shadows", "trait_invocation_devils_sight"],
      warlock_level_3_pact_boon: ["trait_pact_of_the_tome"],
      warlock_level_5_invocations: ["trait_invocation_beguiling_influence"],
      warlock_level_7_invocations: ["trait_invocation_mask_of_many_faces"],
    },
    class_sorcerer: {
      sorcerer_level_3_metamagic: ["trait_metamagic_quickened_spell", "trait_metamagic_twinned_spell"],
      sorcerer_draconic_level_1_ancestor: ["trait_dragon_ancestor_red"],
    },
  },
  traitSelections: {
    warlock_starting_skills: ["arcana", "intimidation"],
  },
},

// 00000000-0000-0000-0000-000000000116 Master Ko Shen
choices: {
  classSelections: {},
  traitSelections: {
    human_language_choice: ["elvish"],
    monk_starting_tool: ["calligraphers_supplies"],
    monk_starting_skills: ["acrobatics", "insight"],
  },
},

// 00000000-0000-0000-0000-000000000117 Thistle Quickfoot
choices: {
  classSelections: {},
  traitSelections: {
    wizard_starting_skills: ["arcana", "investigation"],
  },
},

// 00000000-0000-0000-0000-000000000118 Kaelen Duskwarden
choices: {
  classSelections: {
    class_ranger: {
      ranger_level_2_fighting_style: ["trait_fs_archery"],
      ranger_hunter_level_3_prey: ["trait_hunters_prey_colossus_slayer"],
      ranger_hunter_level_7_defensive_tactics: ["trait_defensive_tactics_escape_the_horde"],
      ranger_hunter_level_11_multiattack: ["trait_multiattack_volley"],
    },
    class_druid: {
      druid_land_level_3_circle_land: ["trait_land_circle_spells_forest"],
    },
  },
  traitSelections: {
    ranger_starting_skills: ["nature", "stealth", "survival"],
  },
},

// 00000000-0000-0000-0000-000000000119 Dame Sable Orrin
choices: {
  classSelections: {
    class_fighter: {
      fighter_level_1_fighting_style: ["trait_fs_defense"],
      fighter_bm_level_3_maneuvers: ["trait_maneuver_precision_attack", "trait_maneuver_riposte", "trait_maneuver_trip_attack"],
      fighter_bm_level_7_maneuvers: ["trait_maneuver_parry", "trait_maneuver_rally"],
      fighter_bm_level_10_maneuvers: ["trait_maneuver_menacing_attack", "trait_maneuver_pushing_attack"],
      fighter_bm_level_15_maneuvers: ["trait_maneuver_disarming_attack", "trait_maneuver_goading_attack"],
    },
  },
  traitSelections: {
    soldier_gaming_set: ["playing_card_set"],
    fighter_starting_skills: ["history", "perception"],
  },
},
```

Format these like the surrounding file (its indentation and line wrapping). Do not change any other field of any sample, and do not run the seeder.

- [ ] **Step 5: Run the invariant; resolve anything it surfaces**

Run: `pnpm --filter @project/server exec vitest run src/services/__tests__/sampleCharacterChoices.test.ts`
Expected: PASS for all ten.

If a sample still reports an issue, it will be one of two kinds; fix it and record it in your report:
- A **new question** that a pick above unlocked (for example a pact boon or circle that offers its own choice): answer it with a valid option the issue's message names, or — if it is a `spell_choice` node — confirm the test already excludes it.
- An **`unmet_prerequisite`** or **`redundant_selection`** on a pick above: replace that pick with another option of the same question that has no prerequisite and is not already held, and name the swap.

Never weaken the test to make a sample pass.

- [ ] **Step 6: Full suites and typecheck**

Run: `pnpm test:all` — PASS. `pnpm --filter @project/database exec tsc --noEmit` and `pnpm --filter @project/server exec tsc --noEmit` — clean.

- [ ] **Step 7: Restore endings (CRLF), commit**

```bash
git add packages/database/src/seedSampleCharacters.ts apps/server/src/services/__tests__/sampleCharacterChoices.test.ts
git commit -F <message-file>   # "feat(database): every sample character answers its questions"
```

---

### Task 8: The sheet reads stored choices, and the guessing is deleted

**Files:**
- Modify: `apps/web/src/store/characterSheetStore.ts`
- Modify: `apps/web/src/pages/characterSheetRouteData.ts`
- Create: `apps/web/src/pages/__tests__/characterSheetRouteData.test.ts`
- Modify: `apps/web/src/store/__tests__/characterSheetStore.test.ts`
- Modify: `packages/engine/src/pipeline/characterBootstrapper.ts` (delete `selectionsFromChosenTraitIds`)
- Modify: `packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts` (delete its describe block)

**Interfaces:**
- Consumes: `CharacterChoicesSchema`, `emptyCharacterChoices`, `type CharacterChoices` from `@project/shared` (Task 1).
- Produces: `CharacterSheetState.choices: CharacterChoices`; `CharacterSheetPayload.choices?: unknown`; `hydrateCharacterSheet` passes parsed `choices` to `initialize`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/pages/__tests__/characterSheetRouteData.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hydrateCharacterSheet,
  type CharacterSheetPayload,
} from "../characterSheetRouteData";

const payload = (
  overrides: Partial<CharacterSheetPayload> = {},
): CharacterSheetPayload => ({
  id: "char-1",
  campaignId: "camp-1",
  level: 1,
  classLevels: { class_bard: 1 },
  raceId: "race_half_elf",
  subraceId: null,
  str: 8,
  dex: 14,
  con: 12,
  int: 10,
  wis: 10,
  cha: 15,
  inventory: [],
  currentHp: 8,
  maxHp: 8,
  ...overrides,
});

describe("hydrateCharacterSheet", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hands the store the character's stored choices", () => {
    const initialize = vi.fn();
    const choices = {
      classSelections: {},
      traitSelections: { skill_versatility_choice: ["perception", "insight"] },
    };

    hydrateCharacterSheet(initialize, payload({ choices }));

    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ choices }));
  });

  it("hands the store no answers when the stored value is corrupt", () => {
    const initialize = vi.fn();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    hydrateCharacterSheet(initialize, payload({ choices: { classSelections: "x" } }));

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: { classSelections: {}, traitSelections: {} },
      }),
    );
    expect(error).toHaveBeenCalled();
  });

  it("hands the store the background and the persisted pool counts", () => {
    const initialize = vi.fn();

    hydrateCharacterSheet(
      initialize,
      payload({
        backgroundId: "background_noble",
        resources: [{ id: "spell_slots_1", current: 3 }],
      }),
    );

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        backgroundId: "background_noble",
        resources: [{ id: "spell_slots_1", current: 3 }],
      }),
    );
  });
});
```

In `apps/web/src/store/__tests__/characterSheetStore.test.ts`:
- in `describe("getActiveTraits with a subclass")`, replace the `traitGrants: [ { id: "grant_1", traitId: "trait_totem_spirit_bear", source: "player_choice" } ],` entry with:

```ts
      choices: {
        classSelections: {
          class_barbarian: {
            barbarian_totem_level_3_totem_spirit: ["trait_totem_spirit_bear"],
          },
        },
        traitSelections: {},
      },
```

- inside `describe("useCharacterSheetStore proficiency grants", ...)`, add:

```ts
  it("includes the skills the character chose", () => {
    useCharacterSheetStore.setState({
      raceId: "race_half_elf",
      choices: {
        classSelections: {},
        traitSelections: { skill_versatility_choice: ["perception", "insight"] },
      },
    });

    const skills = useCharacterSheetStore
      .getState()
      .getProficiencyGrants()
      .filter((grant) => grant.category === "skills")
      .map((grant) => grant.proficiencyId);

    expect(skills).toEqual(expect.arrayContaining(["perception", "insight"]));
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @project/web exec vitest run src/pages/__tests__/characterSheetRouteData.test.ts src/store/__tests__/characterSheetStore.test.ts`
Expected: the two choices hydration tests, the totem test and the chosen-skills test FAIL. The background-and-resources hydration test passes already (it pins earlier behaviour).

- [ ] **Step 3: The store reads stored choices**

In `apps/web/src/store/characterSheetStore.ts`:
- add `emptyCharacterChoices` and `type CharacterChoices` to the imports from `@project/shared`;
- add to `CharacterSheetState`, after `backgroundId: string | null;`:

```ts
  /** Every answer the character has given, keyed by the question it answers. */
  choices: CharacterChoices;
```

- add `choices: emptyCharacterChoices(),` to the initial state after `backgroundId: null,`;
- in `toCharacterSave`, replace each class entry's `selections: CharacterBootstrapper.selectionsFromChosenTraitIds(...)[classId] ?? {},` with:

```ts
          selections: state.choices.classSelections[classId] ?? {},
```

  and replace `traitSelections: {},` with `traitSelections: state.choices.traitSelections,`;
- add `"choices"` to the `Pick<CharacterSheetState, ...>` list in `getConditionSuppressions`'s parameter type.

- [ ] **Step 4: Hydrate `choices`**

In `apps/web/src/pages/characterSheetRouteData.ts`:
- add `import { CharacterChoicesSchema, emptyCharacterChoices } from "@project/shared";` (merge with an existing `@project/shared` import if there is one);
- add to `CharacterSheetPayload`, after `backgroundId?: string | null;`:

```ts
  // characters.choices, straight off the row; parsed at this boundary
  choices?: unknown;
```

- in `hydrateCharacterSheet`, before `initializeStore({`, add:

```ts
  const storedChoices = CharacterChoicesSchema.safeParse(character.choices ?? {});
  if (!storedChoices.success) {
    console.error(
      `Stored choices for character ${character.id} failed to parse; treating them as empty.`,
      storedChoices.error.issues,
    );
  }
```

  and inside the `initializeStore({ ... })` object, after `backgroundId: ...`:

```ts
    choices: storedChoices.success ? storedChoices.data : emptyCharacterChoices(),
```

- [ ] **Step 5: Delete the guessing**

With the last caller gone, delete `CharacterBootstrapper.selectionsFromChosenTraitIds` (method and its doc comment) from `packages/engine/src/pipeline/characterBootstrapper.ts`, and its `describe("CharacterBootstrapper.selectionsFromChosenTraitIds", ...)` block from `characterBootstraper.test.ts`. Then confirm nothing references it:

Run: `grep -rn "selectionsFromChosenTraitIds" apps packages --include=*.ts --include=*.tsx`
Expected: no output. Also remove any import the deletion leaves unused (the method's local helpers, if only it used them).

- [ ] **Step 6: Run everything; typecheck all five**

Run: `pnpm --filter @project/web exec vitest run src/pages/__tests__/characterSheetRouteData.test.ts src/store/__tests__/characterSheetStore.test.ts` — PASS.
Run: `pnpm test:all` — PASS.
Typecheck each: `pnpm --filter @project/shared exec tsc --noEmit`, `pnpm --filter @project/engine exec tsc --noEmit`, `pnpm --filter @project/database exec tsc --noEmit`, `pnpm --filter @project/server exec tsc --noEmit`, `pnpm --filter @project/web exec tsc -b` — all clean. If `tsc -b` finds a web test that builds a full `CharacterSheetState` without `choices`, add `choices: { classSelections: {}, traitSelections: {} }` to it and list the file.

- [ ] **Step 7: Restore endings (CRLF), commit**

```bash
git add apps/web/src/store/characterSheetStore.ts apps/web/src/pages/characterSheetRouteData.ts apps/web/src/pages/__tests__/characterSheetRouteData.test.ts apps/web/src/store/__tests__/characterSheetStore.test.ts packages/engine/src/pipeline/characterBootstrapper.ts packages/engine/src/pipeline/__tests__/characterBootstraper.test.ts
git commit -F <message-file>   # "feat(web): the sheet reads stored choices; the node guessing is gone (#69)"
```

---

### Task 9: Hand check, then the backlog

**Files:**
- Modify: `docs/TODO_BACKLOG.md` (CRLF)

Steps 1–3 need the running app and the owner's database, so the controller runs them, not a subagent.

- [ ] **Step 1: Apply the migration (owner's permission first)**

Ask the owner before running: `pnpm --filter @project/database db:migrate`. It adds one column with a default, and needs no data change. Then re-seed the samples: `pnpm --filter @project/database db:seed:samples`.

- [ ] **Step 2: Hand check in the running app**

1. Every sample's `characters.choices` is non-empty and matches Task 7's data (one query over the ten ids).
2. Restart the `server` preview. Open Lyra Silverstring (`00000000-0000-0000-0000-000000000113`): Perception, Insight, Performance, Acrobatics, Arcana, Investigation, Medicine, Nature and Stealth are proficient (`data-proficient="true"`), besides the noble's fixed History and Persuasion.
3. Open Dame Sable Orrin (`00000000-0000-0000-0000-000000000119`) and confirm the socket joins without an `action_error` (her choices parse and her save builds on the server).

- [ ] **Step 3: Record results for the backlog task**

Write the results (pass or fail per check, with evidence) to the SDD workspace so the backlog implementer can cite them.

- [ ] **Step 4: Update the backlog**

In `docs/TODO_BACKLOG.md`, matching its voice and conventions (closed items marked ✅ with date and branch, corrected diagnoses kept visible, stable ids):
- **#69**: closed 2026-09-21 on `feat/character-choices` — choices are stored in `characters.choices` keyed by the question; `selectionsFromChosenTraitIds` is deleted. Note the finding that the dev database held no `player_choice` rows and no UI ever sent `selectedTraits`, so the guessing had been running on nothing.
- **Tier 1 items 4 and 5** (Recommended sequence): item 4 ✅; item 5 (#68's choice half) re-described as Branch B — the wizard UI, now that storage exists — and widened from 21 proficiency blocks to all 31 choice-block traits, naming the race ones (half-elf ASI, Skill Versatility, extra languages, the dwarf's tools).
- **New #73**: the web sheet applies no trait modifiers. `activeModifiers` is set only by the dev-only `TraitWidget`; `useAbilities` in `apps/web/src/hooks/useCharacterStats.ts` adds equipment modifiers alone; the creation wizard stores pre-racial scores (`wizardStore.ts`: "3-18 pre racial"). So no racial ability bonus, fixed or chosen, reaches a live sheet, while the server's `buildLiveSheet` applies them — the two disagree. Verified 2026-09-21: Lyra Silverstring (half-elf, stored CHA 18) shows CHA 18 on the sheet. Add it to the Recommended sequence as the next branch, ahead of item 5.
- Header: the test count from `pnpm test:all` on this branch.

Restore CRLF, run `pnpm check:hygiene` (must pass).

- [ ] **Step 5: Commit**

```bash
git add docs/TODO_BACKLOG.md
git commit -F <message-file>   # "docs: close #69 and record #73"
```
