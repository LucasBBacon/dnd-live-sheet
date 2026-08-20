/**
 * Canonical race blueprints.
 *
 * Every trait id below already exists in TRAIT_DICTIONARY, with one exception
 * flagged inline on the human entry.
 *
 * `RaceDefinition` widens the stub that lived in characterBootstrapper.ts:
 * subraces are needed to satisfy RaceConfigurationSchema (hasSubraces /
 * subraceId), and size + speed have no trait representation, so they are stored
 * as flat race data.
 */
import type { CreatureSize } from "./creatureSize.js";

/**
 * The walking speed a character falls back to when their race id resolves to
 * nothing - a save can outlive the pack that authored its race.
 */
export const DEFAULT_WALKING_SPEED = 30;

export interface SubraceDefinition {
  id: string;
  name: string;
  grantedTraitIds: string[];
}

export interface RaceDefinition {
  id: string;
  name: string;
  size: CreatureSize;
  // base walking speed in feet, before traits such as fleet_of_foot override it
  speed: number;
  grantedTraitIds: string[];
  hasSubraces: boolean;
  subraces: Record<string, SubraceDefinition>;
}

export const RACE_DICTIONARY: Record<string, RaceDefinition> = {};

// resolveRaceDefinition now lives in ruleLookup, where it can consult a loaded
// rule pack before falling back to this dictionary.

export const resolveSubraceDefinition = (
  raceId: string,
  subraceId: string,
): SubraceDefinition | undefined =>
  RACE_DICTIONARY[raceId]?.subraces[subraceId];
