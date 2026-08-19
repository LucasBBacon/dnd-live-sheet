export interface ConditionDefinition {
  id: string;
  name: string;
  /** Short player-facing reminder of what the condition does at the table. */
  summary: string;
}

/**
 * The 2014 PHB conditions that are simply on or off.
 *
 * Keyed by the bare state id - `blinded`, not `condition_blinded` - because
 * authored rules already gate on the unprefixed name, and a prefix here would
 * quietly orphan them.
 *
 * These are vocabulary rather than authored content, so they live beside
 * SKILL_MAP instead of in a rule pack: a rulebook can add traits and spells,
 * but the set of conditions the engine understands is part of the engine.
 *
 * Flags only. Toggling `prone` grants the state and nothing else - the
 * mechanical riders each condition carries are not modelled, and belong to a
 * separate rules pass. Traits gate on these states today; nothing derives from
 * them automatically.
 *
 * Exhaustion is deliberately absent. It is a six-level track, and representing
 * it as a flag would be wrong rather than merely incomplete.
 */
export const CONDITION_MAP: Record<string, ConditionDefinition> = {
  blinded: {
    id: "blinded",
    name: "Blinded",
    summary:
      "You cannot see and automatically fail any check requiring sight. Attacks against you have advantage, and yours have disadvantage.",
  },
  charmed: {
    id: "charmed",
    name: "Charmed",
    summary:
      "You cannot attack the charmer or target them with harmful effects, and they have advantage on social checks against you.",
  },
  deafened: {
    id: "deafened",
    name: "Deafened",
    summary:
      "You cannot hear and automatically fail any check requiring hearing.",
  },
  frightened: {
    id: "frightened",
    name: "Frightened",
    summary:
      "You have disadvantage on checks and attacks while the source is in sight, and cannot willingly move closer to it.",
  },
  grappled: {
    id: "grappled",
    name: "Grappled",
    summary:
      "Your speed is zero and you gain no benefit from any bonus to speed.",
  },
  incapacitated: {
    id: "incapacitated",
    name: "Incapacitated",
    summary: "You cannot take actions or reactions.",
  },
  invisible: {
    id: "invisible",
    name: "Invisible",
    summary:
      "You cannot be seen without magic or a special sense. Attacks against you have disadvantage, and yours have advantage.",
  },
  paralyzed: {
    id: "paralyzed",
    name: "Paralyzed",
    summary:
      "You are incapacitated, cannot move or speak, and automatically fail Strength and Dexterity saves. Hits from within 5 feet are critical.",
  },
  petrified: {
    id: "petrified",
    name: "Petrified",
    summary:
      "You are transformed into inanimate substance, incapacitated, and resistant to all damage.",
  },
  poisoned: {
    id: "poisoned",
    name: "Poisoned",
    summary: "You have disadvantage on attack rolls and ability checks.",
  },
  prone: {
    id: "prone",
    name: "Prone",
    summary:
      "You can only crawl, and have disadvantage on attacks. Attacks against you have advantage within 5 feet, disadvantage beyond.",
  },
  restrained: {
    id: "restrained",
    name: "Restrained",
    summary:
      "Your speed is zero, attacks against you have advantage, yours have disadvantage, and you have disadvantage on Dexterity saves.",
  },
  stunned: {
    id: "stunned",
    name: "Stunned",
    summary:
      "You are incapacitated, cannot move, and automatically fail Strength and Dexterity saves.",
  },
  unconscious: {
    id: "unconscious",
    name: "Unconscious",
    summary:
      "You are incapacitated, prone, and unaware of your surroundings. Hits from within 5 feet are critical.",
  },
};

/** Stable display order for the conditions panel. */
export const CONDITION_IDS: string[] = Object.keys(CONDITION_MAP);
