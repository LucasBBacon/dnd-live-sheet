/**
 * Wire-shaped race reference fixtures for the character creation wizard.
 *
 * These mirror what `GET /reference/races` actually returns, i.e. the result of
 * `projectCoreRulePack` (packages/database/src/corePackProjection.ts) followed
 * by `DatabaseReferenceProvider.getRaces`, run over the race segments in
 * packages/database/data/packs/core_2014_pack/races/.
 *
 * The pair is deliberate:
 *   - Dwarf exercises the required-subrace path: the wizard cannot proceed
 *     until a subrace is chosen, and the trait list concatenates across two
 *     provenance origins.
 *   - Human exercises the flat path: no subrace section, short trait list.
 *
 * PROVENANCE - read before trusting a field.
 *
 *   Copied verbatim from the pack:
 *     id, name, speed, trait ids, trait names, trait lore, subrace ids/names,
 *     and which traits each race and subrace grants.
 *
 *   Derived exactly as corePackProjection.ts derives it:
 *     requiresSubrace = race.hasSubraces
 *     displayLabel    = race.hasSubraces ? "Subrace" : "Lineage"
 *     sourceOrigin    = `Race: ${race.name}` / `Subrace: ${subrace.name}`
 *
 *   INVENTED - not in the pack, written for these fixtures:
 *     race `lore` and subrace `lore`. No race file in core_2014_pack authors a
 *     `lore` block, so `toLore()` substitutes `{ shortDescription: "" }` for
 *     every race and subrace. Production data is blank here today; these
 *     fixtures fill it in so the components render against realistic text.
 *     Trait `lore`, by contrast, IS authored in the pack and is copied as-is.
 */

// TODO: replace with `import type { RaceDetail } from "@project/shared"` once
// the shared reference-race schema exists. Declared locally for now so this
// file compiles against the codebase as it stands.
export interface RaceLore {
  shortDescription: string;
  fullText?: string;
}

export interface RaceTrait {
  id: string;
  name: string;
  sourceOrigin: string;
  lore: RaceLore;
}

export interface Subrace {
  id: string;
  name: string;
  lore: RaceLore;
  traits: RaceTrait[];
}

export interface RaceDetail {
  id: string;
  name: string;
  displayLabel: string;
  speed: number;
  requiresSubrace: boolean;
  lore: RaceLore;
  traits: RaceTrait[];
  subraces: Subrace[];
}

export type RaceSummary = Pick<
  RaceDetail,
  "id" | "name" | "lore" | "requiresSubrace"
>;

const DWARF: RaceDetail = {
  id: "race_dwarf",
  name: "Dwarf",
  displayLabel: "Subrace",
  speed: 25,
  requiresSubrace: true,
  lore: {
    shortDescription:
      "Stubborn, clan-bound and long-lived, dwarves measure worth in craft and loyalty rather than words.",
    fullText:
      "Dwarves carve their halls into the roots of mountains and hold them for centuries. Their culture prizes the smith, the mason and the oath-keeper; a dwarf's word, once given, is treated as a debt of stone. They are slow to trust outsiders and slower to forgive an injury, but steadfast once a bond is made. Generations spent underground have left them dark-sighted, hardy against poison, and deeply read in the history of worked stone.",
  },
  traits: [
    {
      id: "race_dwarf_asi",
      name: "(Dwarf) Ability Score Increase",
      sourceOrigin: "Race: Dwarf",
      lore: {
        shortDescription: "Your Constitution score increases by 2.",
        fullText: "Your Constitution score increases by 2.",
      },
    },
    {
      id: "race_dwarf_darkvision",
      name: "(Dwarf) Darkvision",
      sourceOrigin: "Race: Dwarf",
      lore: {
        shortDescription:
          "Accustomed to life underground, you have superior vision in dark and dim conditions. You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You can't discern color in darkness, only shades of gray.",
        fullText:
          "Accustomed to life underground, you have superior vision in dark and dim conditions. You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You can't discern color in darkness, only shades of gray.",
      },
    },
    {
      id: "dwarven_resilience",
      name: "Dwarven Resilience",
      sourceOrigin: "Race: Dwarf",
      lore: {
        shortDescription:
          "You have advantage on saving throws against poison, and you have resistance against poison damage.",
        fullText:
          "You have advantage on saving throws against poison, and you have resistance against poison damage.",
      },
    },
    {
      id: "dwarven_combat_training",
      name: "Dwarven Combat Training",
      sourceOrigin: "Race: Dwarf",
      lore: {
        shortDescription:
          "You have proficiency with the battleaxe, handaxe, light hammer, and warhammer.",
        fullText:
          "You have proficiency with the battleaxe, handaxe, light hammer, and warhammer.",
      },
    },
    {
      id: "tool_proficiency",
      name: "Tool Proficiency",
      sourceOrigin: "Race: Dwarf",
      lore: {
        shortDescription:
          "You gain proficiency with the artisan's tools of your choice: smith's tools, brewer's supplies, or mason's tools.",
        fullText:
          "You gain proficiency with the artisan's tools of your choice: smith's tools, brewer's supplies, or mason's tools.",
      },
    },
    {
      id: "stonecutting",
      name: "Stonecutting",
      sourceOrigin: "Race: Dwarf",
      lore: {
        shortDescription:
          "Whenever you make an Intelligence (History) check related to the origin of stonework, you are considered proficient in the History skill and add double your proficiency bonus to the check, instead of your normal proficiency bonus.",
        fullText:
          "Whenever you make an Intelligence (History) check related to the origin of stonework, you are considered proficient in the History skill and add double your proficiency bonus to the check, instead of your normal proficiency bonus.",
      },
    },
    {
      id: "race_dwarf_languages",
      name: "(Dwarf) Languages",
      sourceOrigin: "Race: Dwarf",
      lore: {
        shortDescription:
          "You can speak, read, and write Common and Dwarvish. Dwarvish is full of hard consonants and guttural sounds, and those characteristics spill over into whatever other language a dwarf might speak.",
        fullText:
          "You can speak, read, and write Common and Dwarvish. Dwarvish is full of hard consonants and guttural sounds, and those characteristics spill over into whatever other language a dwarf might speak.",
      },
    },
  ],
  subraces: [
    {
      id: "subrace_dwarf_mountain",
      name: "Mountain Dwarf",
      lore: {
        shortDescription:
          "Raised on high, harsh slopes: stronger than their kin, and trained to bear armor from a young age.",
      },
      traits: [
        {
          id: "subrace_dwarf_mountain_asi",
          name: "(Mountain Dwarf) Ability Score Increase",
          sourceOrigin: "Subrace: Mountain Dwarf",
          lore: {
            shortDescription: "Your Strength score increases by 2.",
            fullText: "Your Strength score increases by 2.",
          },
        },
        {
          id: "dwarven_armor_training",
          name: "Dwarven Armor Training",
          sourceOrigin: "Subrace: Mountain Dwarf",
          lore: {
            shortDescription:
              "You have proficiency with light and medium armor.",
            fullText: "You have proficiency with light and medium armor.",
          },
        },
      ],
    },
    {
      id: "subrace_dwarf_hill",
      name: "Hill Dwarf",
      lore: {
        shortDescription:
          "Keener senses and deeper endurance, with a physical toughness that grows alongside them.",
      },
      traits: [
        {
          id: "subrace_dwarf_hill_asi",
          name: "(Hill Dwarf) Ability Score Increase",
          sourceOrigin: "Subrace: Hill Dwarf",
          lore: {
            shortDescription: "Your Wisdom score increases by 1.",
            fullText: "Your Wisdom score increases by 1.",
          },
        },
        {
          id: "dwarven_toughness",
          name: "Dwarven Toughness",
          sourceOrigin: "Subrace: Hill Dwarf",
          lore: {
            shortDescription:
              "Your hit point maximum increases by 1, and it increases by 1 every time you gain a level.",
            fullText:
              "Your hit point maximum increases by 1, and it increases by 1 every time you gain a level.",
          },
        },
      ],
    },
  ],
};

const HUMAN: RaceDetail = {
  id: "race_human",
  name: "Human",
  displayLabel: "Lineage",
  speed: 30,
  requiresSubrace: false,
  lore: {
    shortDescription:
      "The most adaptable and ambitious of the common peoples, found anywhere worth settling.",
    fullText:
      "Humans lack the long memory of elves and the deep tradition of dwarves, and make up the difference with ambition. In a handful of generations they will found a city, outgrow it, and move on. What they give up in specialisation they gain in breadth: a human begins broad rather than sharp, nudging every ability score upward and picking up whichever language the road happens to demand.",
  },
  traits: [
    {
      id: "race_human_asi",
      name: "(Human) Ability Score Increase",
      sourceOrigin: "Race: Human",
      lore: {
        shortDescription: "Your ability scores each increase by 1.",
        fullText: "Your ability scores each increase by 1.",
      },
    },
    {
      id: "race_human_languages",
      name: "(Human) Languages",
      sourceOrigin: "Race: Human",
      lore: {
        shortDescription:
          "You can speak, read, and write Common and one extra language of your choice.",
        fullText:
          "You can speak, read, and write Common and one extra language of your choice. Humans typically learn the languages of other peoples they deal with, including obscure dialects. They are fond of sprinkling their speech with words borrowed from other tongues: Orc curses, Elvish musical expressions, Dwarvish military phrases, and so on.",
      },
    },
  ],
  subraces: [],
};

/** Keyed by race id, matching the ids the wizard store writes. */
export const RACE_FIXTURES: Record<string, RaceDetail> = {
  race_dwarf: DWARF,
  race_human: HUMAN,
};

/** Same fixtures in the array form `GET /reference/races` returns. */
export const RACE_FIXTURE_LIST: RaceDetail[] = [DWARF, HUMAN];
