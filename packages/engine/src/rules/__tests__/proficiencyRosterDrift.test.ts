import { describe, expect, it } from "vitest";
import { corePackSnapshot } from "../../pipeline/__tests__/corePackFixture.js";

const TRAIT_DICTIONARY = corePackSnapshot().traitsById;
import { listProficiencyOptions } from "../proficiencyDictionary.js";

/**
 * A proficiency id that is not on its category's roster is invisible: the
 * calculators match grants by exact id, so `skill_perception` where the roster
 * says `perception` reads as the character simply not having the proficiency,
 * with nothing anywhere to say so. Both cases below were live bugs found by
 * this check.
 *
 * Categories with no roster yet (tools, weapons, armour) are skipped.
 */
describe("trait proficiency ids stay on their category roster", () => {
  const traits = Object.values(TRAIT_DICTIONARY);

  it("every fixed grant names an id its category knows", () => {
    const offRoster = traits.flatMap((trait) =>
      (trait.proficiencies?.fixed ?? [])
        .filter((grant) => {
          const roster = listProficiencyOptions(grant.category);
          return roster ? !roster.includes(grant.proficiencyId) : false;
        })
        .map((grant) => `${trait.id}: ${grant.category}/${grant.proficiencyId}`),
    );

    expect(offRoster).toEqual([]);
  });

  it("every explicitly listed choice option names an id its category knows", () => {
    const offRoster = traits.flatMap((trait) =>
      (trait.proficiencies?.choices ?? []).flatMap((choice) => {
        const roster = listProficiencyOptions(choice.category);
        if (!roster) return [];

        return (choice.options ?? [])
          .filter((option) => !roster.includes(option))
          .map((option) => `${trait.id}/${choice.id}: ${option}`);
      }),
    );

    expect(offRoster).toEqual([]);
  });
});
