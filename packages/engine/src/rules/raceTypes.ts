import type { CreatureSize } from "./creatureSize.js";

/**
 * The shape the engine reads a race in.
 *
 * Subraces are needed to satisfy RaceConfigurationSchema (hasSubraces /
 * subraceId), and size and speed have no trait representation, so they are
 * carried as flat race data.
 *
 * These types outlived RACE_DICTIONARY, which was already `{}` - all nine
 * races moved into the core pack, and the pack is now the only source. What
 * remains here is the contract a pack's race must satisfy, not content.
 */
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

/**
 * The walking speed a character falls back to when their race id resolves to
 * nothing - a save can outlive the pack that authored its race.
 */
export const DEFAULT_WALKING_SPEED = 30;
