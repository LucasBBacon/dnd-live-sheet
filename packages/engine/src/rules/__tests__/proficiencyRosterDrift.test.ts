import { describe, expect, it } from "vitest";
import {
  corePackEquipment,
  corePackSnapshot,
} from "../../pipeline/__tests__/corePackFixture.js";

const TRAIT_DICTIONARY = corePackSnapshot().traitsById;
import { listProficiencyOptions } from "../proficiencyDictionary.js";
import {
  armorProficiencyIds,
  weaponProficiencyIds,
} from "../itemProficiency.js";

/**
 * A proficiency id that is not on its category's roster is invisible: the
 * calculators match grants by exact id, so `skill_perception` where the roster
 * says `perception` reads as the character simply not having the proficiency,
 * with nothing anywhere to say so. Both cases below were live bugs found by
 * this check.
 *
 * Every category is now covered. Skills, languages and tools resolve against
 * the rosters in proficiencyDictionary.ts; weapons and armour resolve against
 * the equipment catalogue, in the second describe below. Only ability_check
 * has no roster, and it has one authored grant and no stubs.
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

/**
 * Weapons and armour have no roster and do not need one: an item names its own
 * proficiency ids, so the legal vocabulary is whatever the catalogue answers
 * to. Asserting coverage rather than membership is deliberately the stronger
 * check - it fails on an id that is spelled plausibly and matches nothing,
 * which is exactly the state the pack shipped in.
 *
 * This derives its verdict from the same helper `combat.ts` matches with, so a
 * grant cannot pass here and fail in play.
 */
describe("weapon and armour grants cover something in the catalogue", () => {
  const traits = Object.values(TRAIT_DICTIONARY);
  const { equipmentById, weaponsById } = corePackEquipment();
  const weapons = Object.values(weaponsById);
  const equipment = Object.values(equipmentById);

  const coversAWeapon = (proficiencyId: string) =>
    weapons.some((weapon) =>
      weaponProficiencyIds(weapon).includes(proficiencyId),
    );

  const coversAnArmor = (proficiencyId: string) =>
    equipment.some((item) => armorProficiencyIds(item).includes(proficiencyId));

  const covers: Record<string, (id: string) => boolean> = {
    weapons: coversAWeapon,
    armor: coversAnArmor,
  };

  it("every fixed weapon or armour grant covers at least one item", () => {
    const uncovered = traits.flatMap((trait) =>
      (trait.proficiencies?.fixed ?? [])
        .filter((grant) => {
          const test = covers[grant.category];
          return test ? !test(grant.proficiencyId) : false;
        })
        .map((grant) => `${trait.id}: ${grant.category}/${grant.proficiencyId}`),
    );

    expect(uncovered).toEqual([]);
  });

  // The shipped pack has no weapons or armour choice grants today, so this
  // case is a standing guard for when one is added rather than live coverage
  // now - the fixed-grant case above is the one exercising real data.
  it("every listed weapon or armour choice option covers at least one item", () => {
    const uncovered = traits.flatMap((trait) =>
      (trait.proficiencies?.choices ?? []).flatMap((choice) => {
        const test = covers[choice.category];
        if (!test) return [];

        return (choice.options ?? [])
          .filter((option) => !test(option))
          .map((option) => `${trait.id}/${choice.id}: ${option}`);
      }),
    );

    expect(uncovered).toEqual([]);
  });
});
