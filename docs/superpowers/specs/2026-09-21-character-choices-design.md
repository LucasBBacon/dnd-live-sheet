# Character choices — stored, keyed by the question they answer

**Date:** 2026-09-21
**Branch:** `feat/character-choices`
**Backlog items:** #69 (closed by this branch); the storage half of #68's
choice half (Tier 1 item 5). This is "Branch A" of the two-branch split agreed
on 2026-09-21; Branch B is the wizard UI that collects the picks.

## Problem

The engine's save format already records a character's choices keyed by the
question they answer, in two maps:

- `CharacterSave.classes[].selections` — class progression picks (a fighting
  style, a totem, maneuvers), keyed by the progression grant's `nodeId`.
- `CharacterSave.traitSelections` — picks inside a trait's own choice blocks
  (skills, tools, languages, the half-elf's +1/+1), keyed by the block's id.

Nothing stores either map.

- **Class picks.** Level-up receives `selectedTraits` keyed by node, and
  `characterController.applyLevelUp` discards the key with
  `Object.values(...).flat()`, writing each pick as a `character_traits` row
  with `source: "player_choice"`. Server and web then guess the node back with
  `CharacterBootstrapper.selectionsFromChosenTraitIds`, which credits a pick to
  every node offering that trait (#69). Creation collects no class picks at all.
- **Trait-choice picks.** Both `toCharacterSave` builders hard-code
  `traitSelections: {}`. 31 traits in the pack carry choice blocks — every
  class's skill picks, background tools and languages, and race picks that
  predate #68: the half-elf's ability-score choice, Skill Versatility and extra
  language, the human's and high elf's extra language, the dwarf's artisan's
  tools, and subclass bonus picks such as Blessings of Knowledge. None of them
  reaches any live sheet.

Measured against the dev database on 2026-09-21: it holds only the ten sample
characters and **no** `player_choice` rows. No UI sets `selectedTraits`. So
the guessing function currently runs on nothing, no character's class choice
reaches its sheet, and there is no player data to migrate — only the seeder.

## Design

### 1. Shape — `@project/shared`

A new schema beside `CharacterSaveSchema`:

```ts
export const CharacterChoicesSchema = z.object({
  // classId -> nodeId -> picked option ids
  classSelections: z
    .record(z.string(), z.record(z.string(), z.array(z.string())))
    .default({}),
  // trait choice block id -> picked option ids
  traitSelections: z.record(z.string(), z.array(z.string())).default({}),
});
export type CharacterChoices = z.infer<typeof CharacterChoicesSchema>;
```

It mirrors exactly what `CharacterSave` consumes. `CharacterSaveSchema` is
unchanged.

### 2. Storage — `@project/database`

`characters.choices`: `jsonb("choices").$type<CharacterChoices>().notNull()
.default({})`, via one generated migration
(`pnpm --filter @project/database db:generate`). Adding a column with a
default needs no backfill. The migration is applied to a database only by its
owner (`db:migrate`), as with #54.

### 3. Reading

- **Server.** `getAuthoritativeRuntimeContext` selects `characters.choices` and
  parses it with `CharacterChoicesSchema.safeParse`. A value that fails to parse
  is logged with the character id (`console.error`) and treated as empty, so
  one bad row cannot block a player's join. `toCharacterSave` takes the parsed
  choices and fills each class's `selections` from
  `classSelections[classId]` and `traitSelections` from `traitSelections`.
- **Web.** `fetchCharacterPayload` already spreads the whole `characters` row,
  so `choices` arrives unchanged. `CharacterSheetPayload` gains `choices?`;
  `hydrateCharacterSheet` parses it the same way (empty on failure). The store
  gains `choices: CharacterChoices`, and its `toCharacterSave` reads from it.
- **Removed.** `CharacterBootstrapper.selectionsFromChosenTraitIds` and its
  tests, and both call sites' `player_choice` filtering. This closes #69.

### 4. Writing

Creation and level-up both need to build a save, and the only server builder,
`toCharacterSave`, lives in the socket gateway. It moves, unchanged apart from
the choices parameter, to `apps/server/src/services/characterSave.ts`, and the
gateway, the creation route and the level-up controller all import it from
there — one builder, so the three cannot disagree about a save.

A new engine method, `CharacterBootstrapper.collectChoiceIssues(save,
snapshot)`, beside `collectSaveIssues`, returns
`CharacterBootstrapper.collectSaveIssues(save, snapshot)` filtered to the
choice codes — `wrong_selection_count`, `invalid_option`,
`duplicate_selection`, `unmet_prerequisite`, `orphan_selection`,
`redundant_selection` — deliberately **excluding** `missing_selection`: until
Branch B builds the UI, an unanswered question is expected, not an error.

- **Creation.** `CreateCharacterPayloadSchema` gains
  `choices: CharacterChoicesSchema.optional()`. `POST /api/character` builds
  the new character's level-1 save with those choices, runs
  `collectChoiceIssues`, and responds 400 listing every issue if there are any;
  otherwise it writes `choices` with the character row.
- **Level-up.** `LevelUpPayload.selectedTraits` becomes
  `Record<string, string[]>` (nodeId -> picks) — the shape
  `getSelectedTraitsForDecision` already accepts. The payload gains
  `traitSelections?: Record<string, string[]>` for choice blocks that arrive
  with the new level. Inside the existing transaction the controller reads the
  character's `choices`, merges `selectedTraits` into
  `classSelections[targetClassId]` and `traitSelections` into
  `traitSelections`, runs `collectChoiceIssues` against the post-level save,
  and writes the merged value. It **stops writing `player_choice`** trait rows:
  the engine derives chosen traits from selections.

### 5. Seeder

Every sample character in `seedSampleCharacters.ts` gets the `choices` its
progression and traits ask for — fighting styles, maneuvers, class, background
and race skill and tool picks, languages, the half-elf's ASI, subclass bonus
picks. A test asserts that each sample's save yields **zero**
`collectSaveIssues`, `missing_selection` included, so the fixture cannot drift
out of step with the pack — with one exception: `missing_selection` on a
`spell_choice` node. Every caster has those (cantrips, spells known, the
wizard's spellbook), and they list no options because spell lists do not exist
in the pack yet (#31, #67), so there is nothing valid to seed. The test names
the exception rather than filtering all `missing_selection`.

Measured 2026-09-21 by building each sample's save against the shipped pack:
the ten samples have 94 unanswered questions, 49 of them `spell_choice` nodes
and 45 answerable ones — fighting styles, maneuvers, invocations, a pact boon,
metamagic, a draconic ancestor, hunter and circle picks, and every class,
background and race skill, tool, language and ASI block.

### 6. Testing

- Shared: `CharacterChoicesSchema` parses, and defaults both maps.
- Server: `toCharacterSave` fills class `selections` and `traitSelections`
  from choices; a corrupt stored value is logged and treated as empty.
- Creation route: valid choices are stored; an invalid option and a wrong count
  are rejected with 400; omitted choices store `{}`.
- Level-up: node-keyed picks and trait selections merge into existing choices;
  no `player_choice` row is written; an invalid pick is rejected.
- Engine: a stored half-elf ASI choice produces +1 modifiers on the two
  chosen abilities (through `ModifierExtractor` with the save's selections).
- Web: a store holding skill choices reports the chosen proficiencies, and
  `hydrateCharacterSheet` maps `choices` (and a corrupt value to empty).
- Seeder: the zero-issues invariant over all ten samples.

### Hand check

After the migration is applied to the dev database and the samples re-seeded:
every sample's `characters.choices` holds its picks, and Lyra Silverstring
(half-elf, Lore bard / rogue) shows her chosen skills — Skill Versatility,
bard and Lore bonus picks — as proficient on the sheet.

Her +1/+1 is **not** a hand check for this branch. Found while planning: the
web sheet applies no trait modifiers at all — `activeModifiers` is set only by
the dev-only `TraitWidget`, and `useAbilities` adds equipment modifiers alone
— so no racial ability bonus, fixed or chosen, reaches a live sheet, while the
server's `buildLiveSheet` does apply them. Recorded as #73, the next branch
after this one.

## Out of scope

- Any wizard UI for making choices — Branch B.
- #73, the web sheet applying trait modifiers (racial ASIs included).
- #71 (the sheet ignores a refused resource spend).
- Feat traits written as `feat_selection` rows, a separate path.
- Removing the seeder's inert `character_traits` rows for class and background
  grants (#70's first half).
