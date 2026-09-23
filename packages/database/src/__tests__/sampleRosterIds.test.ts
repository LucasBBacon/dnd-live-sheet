import { describe, expect, it } from "vitest";
import path from "node:path";
import { assembleCoreRulePackSync } from "../corePackAssembler.js";
import {
  ROSTER,
  SAMPLE_BACKGROUNDS,
  SAMPLE_ITEMS,
  SAMPLE_RACES,
  SAMPLE_SUBCLASSES,
} from "../seedSampleCharacters.js";

const SHIPPED_PACK = path.join(process.cwd(), "data/packs/core_2014_pack");

/**
 * Every id the sample roster names, in the fields that require a real one,
 * must resolve against the pack.
 *
 * `db:seed:samples` had been broken since 2026-09-02 and nobody knew. Commit
 * 08937d9 deleted `trait_extra_language` from the pack; the roster kept naming
 * it in `customTraitIds`, and the seed died on a foreign key the first time
 * anyone re-imported - eighteen days later, and only because an unrelated
 * branch had to import the pack to verify itself. Nothing re-checks the roster
 * against the pack unless a human runs both scripts back to back, so the
 * failure sat there through every green test run in between.
 *
 * What this guard does NOT check is `traits[].traitId`. Those ids are
 * deliberately a mix of ids the compendium defines and ids named by convention
 * that it does not yet, which the seed's own header states in as many words:
 * `character_traits` carries no foreign key, and "an unresolved grant is
 * exactly what the sheet has to survive while the pack is incomplete". Fifty
 * three of them currently resolve to nothing, on purpose. Asserting on them
 * would break that fixture's whole reason for existing.
 *
 * Everything below is a field where an unresolved id is a defect rather than a
 * fixture: the two foreign keys (`customTraitIds` -> traits, `itemId` ->
 * items), and the race, subrace, class, subclass and background ids the seed
 * writes onto the character itself.
 *
 * The roster may name ids the core pack lacks, but only the ones the seed
 * supplies itself as reference stubs - the sample races, subclasses,
 * backgrounds and items. It supplies no trait stubs, so a `customTraitIds`
 * entry has nowhere to come from but the pack.
 */
const pack = assembleCoreRulePackSync(SHIPPED_PACK);

const idsOf = (rows: ReadonlyArray<{ id: string }>) =>
  new Set(rows.map((row) => row.id));

const traitIds = idsOf(pack.traits);
const raceIds = new Set([...idsOf(pack.races), ...idsOf(SAMPLE_RACES)]);
const classIds = idsOf(pack.classes);
const subraceIds = new Set(
  pack.races.flatMap((race) => Object.keys(race.subraces ?? {})),
);
const subclassIds = new Set([
  ...idsOf(pack.subclasses),
  ...idsOf(SAMPLE_SUBCLASSES),
]);
const backgroundIds = new Set([
  ...idsOf(pack.backgrounds),
  ...idsOf(SAMPLE_BACKGROUNDS),
]);
const itemIds = new Set([...idsOf(pack.equipment), ...idsOf(SAMPLE_ITEMS)]);

type Reference = [field: string, id: string];

/**
 * `<character>.<field>: <id>` for every reference that resolves to nothing.
 *
 * Reported as a list rather than one assertion per id so a failure names every
 * broken reference at once - the seed aborts on the first one it hits, which
 * is how a second stale id could hide behind the first.
 */
const dangling = (
  pick: (character: (typeof ROSTER)[number]) => Reference[],
  known: ReadonlySet<string>,
) =>
  ROSTER.flatMap((character) =>
    pick(character)
      .filter(([, id]) => !known.has(id))
      .map(([field, id]) => `${character.name}.${field}: ${id}`),
  );

describe("the sample roster names ids the pack defines", () => {
  it("gives every character its own id", () => {
    // the roster is assembled from two modules, and a repeated id would have
    // the second character silently overwrite the first on every seed
    const ids = ROSTER.map((character) => character.id);

    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
  });

  it("names only real traits where the foreign key demands one", () => {
    expect(
      dangling(
        (character) =>
          (character.customTraitIds ?? []).map((id) => ["customTraitIds", id]),
        traitIds,
      ),
    ).toEqual([]);
  });

  it("names only races and subraces the pack defines", () => {
    expect(
      dangling((character) => [["raceId", character.raceId]], raceIds),
    ).toEqual([]);

    expect(
      dangling(
        (character) =>
          character.subraceId ? [["subraceId", character.subraceId]] : [],
        subraceIds,
      ),
    ).toEqual([]);
  });

  it("names only classes the pack defines, and subclasses it or the seed supplies", () => {
    expect(
      dangling(
        (character) =>
          character.classes.map((entry) => ["classes[].classId", entry.classId]),
        classIds,
      ),
    ).toEqual([]);

    expect(
      dangling(
        (character) =>
          character.classes
            .filter((entry) => entry.subclassId !== undefined)
            .map((entry) => ["classes[].subclassId", entry.subclassId!]),
        subclassIds,
      ),
    ).toEqual([]);
  });

  it("names only backgrounds the pack or the seed supplies", () => {
    expect(
      dangling(
        (character) =>
          character.backgroundId
            ? [["backgroundId", character.backgroundId]]
            : [],
        backgroundIds,
      ),
    ).toEqual([]);
  });

  it("names only items the pack or the seed supplies", () => {
    expect(
      dangling(
        (character) => [
          ...character.inventory.map<Reference>((row) => [
            "inventory[].itemId",
            row.itemId,
          ]),
          ...character.inventory
            .filter((row) => row.insideItemId !== undefined)
            .map<Reference>((row) => [
              "inventory[].insideItemId",
              row.insideItemId!,
            ]),
        ],
        itemIds,
      ),
    ).toEqual([]);
  });
});
