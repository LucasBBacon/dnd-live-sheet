/**
 * Creature size, and what it does to carrying capacity.
 *
 * Size has no trait representation - it is flat data on RaceDefinition - so
 * the rule lives here rather than being derived from a modifier or a state.
 * Nothing in RACE_DICTIONARY is larger than medium yet; the ladder is complete
 * anyway so Powerful Build has somewhere to step up to.
 */
export type CreatureSize =
  | "tiny"
  | "small"
  | "medium"
  | "large"
  | "huge"
  | "gargantuan";

/**
 * PHB: a Tiny creature carries half as much, and each size above Medium
 * doubles. Small and Medium are deliberately identical - only Tiny halves.
 */
export const SIZE_CAPACITY_MULTIPLIER: Record<CreatureSize, number> = {
  tiny: 0.5,
  small: 1,
  medium: 1,
  large: 2,
  huge: 4,
  gargantuan: 8,
};

const SIZE_LADDER: CreatureSize[] = [
  "tiny",
  "small",
  "medium",
  "large",
  "huge",
  "gargantuan",
];

/**
 * The next size up, or the same size when already at the top.
 *
 * Powerful Build does not make a creature larger, it makes it *count* as
 * larger for carrying capacity, which is why this returns a size to read the
 * table at rather than changing anything.
 */
export const oneSizeLarger = (size: CreatureSize): CreatureSize => {
  const index = SIZE_LADDER.indexOf(size);

  return SIZE_LADDER[Math.min(index + 1, SIZE_LADDER.length - 1)]!;
};
