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
