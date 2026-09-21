# Tier 1 — make authored work reach the player

**Date:** 2026-09-21
**Branch:** `fix/tier1-reach-the-player`
**Backlog items:** #64, #63, #68 (fixed half) — Tier 1 items 1-3 of the
2026-09-21 Recommended sequence.

## Why these three together

Each is a place where content or state the pack already carries fails to
reach, or stay on, a player's sheet. None needs new authoring. Each lands
test-first in its own commits: one for #64, two each for #63 and #68.

## #64 — one client origin for Express and the socket gateway

### Problem

`apps/server/src/index.ts:20` configures Express CORS with
`process.env.CLIENT_URL || "http://localhost:5173"`. The Socket.IO server in
`apps/server/src/gateway/socket.ts:494` reads `process.env.CLIENT_URL` with no
fallback. With `CLIENT_URL` unset, REST works and every socket connection is
refused. `360c239` documented the variable in the README; the code still
disagrees with itself.

### Design

- New module `apps/server/src/config/clientOrigin.ts` exporting
  `clientOrigin(): string`, returning `process.env.CLIENT_URL ||
  "http://localhost:5173"`. Read at call time, not at module load, so tests can
  vary the environment.
- `index.ts` and `socket.ts` both call it. The literal default exists in one
  place.

### Tests

- Unit: `clientOrigin()` returns `CLIENT_URL` when set and the localhost
  default when unset.
- Gateway harness: with `CLIENT_URL` unset, the `Server` constructor receives
  `cors.origin === "http://localhost:5173"`.

## #63 — a character's pools exist in the database from join

### What the backlog said, and what is actually true

The backlog recorded that a caster's slots do not appear on the sheet until
the first turn or action event. **That does not reproduce.** Verified
2026-09-21 in the running app with Thistle Quickfoot (wizard 14) and no
`spell_slots_*` rows in `character_resources`: the Features widget shows
4/3/3/3/2/1/1 on first load, because `characterSheetStore.initialize` runs
`materialiseMissingPools` client-side.

The real defect is **persistence**, reproduced in the same session:

| Step | Sheet | `character_resources` |
| --- | --- | --- |
| First load | 1st-level slots 4/4 | no `spell_slots_*` rows |
| "Use" a 1st-level slot | 3/4 | still no rows |
| Reload | **4/4** | still no rows |
| Control: "Begin turn", then "Use" | 3/4 | `spell_slots_1 = 3/4` |

Root cause: the rows are created only inside
`getAuthoritativeRuntimeContext`, which `ROOM_JOIN` never calls. Until a turn
or action event, a pool exists only in the browser. `RESOURCE_CONSUMED`'s
`UPDATE ... WHERE id = resourceId AND character_id = ...` then matches zero
rows, succeeds silently, and **broadcasts the spend to the room** anyway.

### Design

1. **Materialise on join.** In `ROOM_JOIN`'s existing character `try` block,
   after `ensureCharacterInSocketCampaign`, call
   `getAuthoritativeRuntimeContext(characterId)`. Join, turn and action then
   share one materialisation path, so they cannot drift. A failure lands in
   the existing `catch`: the room membership stands and the client receives
   the existing "Character is not available in this campaign." `action_error`.
2. **Make the missing row loud.** `RESOURCE_CONSUMED`'s update gains
   `.returning({ id: characterResources.id })`. When no row matched, the
   handler emits `action_error` to the sender (`event: RESOURCE_CONSUMED`,
   `error: "Unknown resource for this character."`, the payload) and does not
   broadcast.
3. **Tolerate a concurrent materialisation.** A join and a turn event arriving
   together can both compute the same missing pool. The insert in
   `getAuthoritativeRuntimeContext` gains `.onConflictDoNothing()`; the table's
   primary key is `(character_id, id)` (`operational.ts:265`), so the second
   insert is a no-op rather than an error.

### Tests (gateway harness)

- `ROOM_JOIN` with a `characterId` whose traits grant a pool absent from
  `character_resources` inserts it.
- `ROOM_JOIN` still emits `INVENTORY_SYNC` and keeps the room join on a
  character failure (existing tests stay green).
- `RESOURCE_CONSUMED` whose update returns no rows emits `action_error` to the
  sender and nothing to the room.
- `RESOURCE_CONSUMED` whose update matches still broadcasts (existing test).

### Hand check

Delete Thistle's `spell_slots_*` rows, load the sheet, spend a 1st-level slot,
reload: the sheet must show 3/4 and the database `spell_slots_1 = 3/4`.

## #68, fixed half — a background's grants reach the live sheet

### Problem

`characters.background_id` exists and character creation writes it for preset
backgrounds, but `CharacterSaveSchema` has no background, so
`CharacterBootstrapper.resolveGrantedTraitIds` builds a character's traits
from race and classes only. The rule snapshot does not carry backgrounds
either. No background grant reaches `compileActiveTraits`, so no background
skill or tool proficiency reaches the sheet.

### Design — the race pattern, extended by one

1. **Shared.** `CoreRulePackSnapshot` and `toRuleSnapshot` gain
   `backgroundsById`. The comment that deliberately limits the snapshot to what
   the engine reads is updated, not removed: the bootstrapper now reads
   backgrounds, which is exactly its condition. `CharacterSaveSchema` gains
   `backgroundId: z.string().optional()` — optional so existing saves and
   custom-background characters stay valid.
2. **Engine.** `RuleSnapshotLookup` gains `backgroundsById`, with
   `resolveBackgroundDefinition` beside `resolveRaceDefinition`.
   `resolveGrantedTraitIds` appends the background's `backgroundTraitIds`. An
   unknown id grants nothing, exactly as an unknown race does.
3. **Server.** `getAuthoritativeRuntimeContext` also selects
   `characters.backgroundId`; `toCharacterSave` threads it into the save.
4. **Web.** The store gains `backgroundId: string | null`, hydrated from the
   character payload (the route already spreads the whole `characters` row, so
   the value already arrives). The store's `toCharacterSave` threads it. The
   sheet's proficiency consumers go through `compileActiveTraits` and need no
   change.

### What a player will see

Fixed background skills — Criminal: Deception and Stealth; Acolyte: Insight
and Religion; Noble and Soldier likewise — and the fixed tool grants on
Criminal and Soldier. Choice blocks (Acolyte's two languages, Noble's gaming
set, and the like) still grant nothing until #68's choice half builds a
proficiency-choice step.

### Recorded, not fixed

- **The sample seeder writes background traits as `character_traits` rows**
  with `source: "background_<id>"`. Nothing reads them for proficiencies and
  character creation never writes them, so they are inert. Deriving from
  `background_id` is the one real path.
- **Three sample characters have backgrounds the pack does not define.** Nyx
  Vale (charlatan), Master Ko Shen (folk hero) and Kaelen Duskwarden
  (outlander) reference `backgrounds` rows the seeder creates itself; the pack
  authors only acolyte, criminal, noble and soldier. The seeder also creates
  a sage row, which no sample character uses. Those three characters
  correctly receive nothing from their background. Four backgrounds to
  author, for the backlog.

### Tests

- Shared: `toRuleSnapshot` includes `backgroundsById`.
- Engine: a save with `backgroundId: "background_criminal"` resolves
  `trait_criminal_prof_skills` among its granted traits; an unknown background
  id grants nothing; a save with no background is unchanged.
- Server: the authoritative runtime's save carries the character's
  `backgroundId`.
- Web: a store initialised with `backgroundId: "background_criminal"` reports
  a Stealth proficiency grant from `getProficiencyGrants`.

### Hand check

Pip Underbough (criminal) shows Stealth and Deception as proficient.

## Out of scope

- #68's choice half (a proficiency-choice step) and #69 (recording which node
  a trait choice answered) — Tier 1 items 4 and 5.
- Authoring the four missing backgrounds.
- Removing the seeder's inert background rows.

## Done when

All three commits are in, `pnpm test:all` and the per-package typecheck are
green, both hand checks pass in the running app, and the backlog records #64
and #68's fixed half as closed and #63 as closed with its corrected
description.
