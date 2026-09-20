import type { CharacterSave, Spellcasting } from "@project/shared";
import type { RuleSnapshotLookup } from "./ruleLookup.js";

/**
 * One class that contributes to how many slots the character has.
 *
 * `startsAtLevel` carries the same number the pack authors on
 * `Spellcasting.startsAtLevel` - the class level at which Spellcasting (or
 * Pact Magic) is actually gained. It travels with the source, rather than
 * living as a second, hardcoded copy of the PHB's per-progression minimums
 * inside this file, so there is exactly one number for "does this class cast
 * yet", wherever it is checked.
 */
export interface CastingSource {
  classId: string;
  level: number;
  progression: Spellcasting["progression"];
  ability: Spellcasting["ability"];
  startsAtLevel: number;
}

/**
 * The PHB states two rules here and they disagree, so the branch is the whole
 * point of this function.
 *
 * A single casting class reads its own class table. The half-caster table is
 * the full-caster table at `ceil(level / 2)`: a paladin 5 has four first-level
 * and two second-level slots, which is a full caster's level 3, and
 * `ceil(5 / 2)` is 3. Thirds work the same way.
 *
 * A multiclass caster instead adds `floor(level / 2)` per half-caster and
 * `floor(level / 3)` per third, per p.164. That is not the same number: a
 * paladin 5 who takes one ranger level drops from caster level 3 to 2 and
 * loses slots. Both readings are what the book says; which applies depends
 * only on how many casting classes there are.
 *
 * Pure level math otherwise, nothing more. Neither row hardcodes a
 * per-progression minimum level - `casterLevel` reads that minimum off each
 * source's own `startsAtLevel` instead (see below), so "half casts from level
 * 2, third from level 3" is authored once, on the pack's
 * `Spellcasting.startsAtLevel`, rather than duplicated here as a second,
 * hardcoded copy per progression.
 */
const CONTRIBUTION: Record<
  Exclude<Spellcasting["progression"], "pact">,
  { alone: (level: number) => number; shared: (level: number) => number }
> = {
  full: { alone: (level) => level, shared: (level) => level },
  half: {
    alone: (level) => Math.ceil(level / 2),
    shared: (level) => Math.floor(level / 2),
  },
  third: {
    alone: (level) => Math.ceil(level / 3),
    shared: (level) => Math.floor(level / 3),
  },
};

/**
 * The level whose row of the slot table this character reads.
 *
 * A source below its own `startsAtLevel` is dropped before anything else
 * happens: it does not contribute, and - just as importantly - it does not
 * count toward whether this is a lone caster (`alone`) or a multiclass one
 * (`shared`). A ranger dipped at level 1 has not gained Spellcasting yet, so
 * a paladin 5 sharing a save with that ranger 1 reads as a lone paladin 5,
 * not as two half-casters splitting the multiclass rule.
 * @param sources Every casting class the character holds.
 * @returns The caster level, or 0 when nothing here grants slots.
 */
export const casterLevel = (sources: CastingSource[]): number => {
  // pact magic is its own pool on its own table and never joins this sum
  const slotted = sources
    .filter(
      (
        source,
      ): source is CastingSource & {
        progression: Exclude<Spellcasting["progression"], "pact">;
      } => source.progression !== "pact",
    )
    .filter((source) => source.level >= source.startsAtLevel);
  if (slotted.length === 0) return 0;

  const rule = slotted.length === 1 ? "alone" : "shared";

  return slotted.reduce(
    (total, source) => total + CONTRIBUTION[source.progression][rule](source.level),
    0,
  );
};

/**
 * The two lookups `collectCastingSources` reads, both keyed by class id and
 * both built from the one place a save keeps them: `save.classes`.
 *
 * Pulled out because the pipeline needs this same shape from two different
 * seams - hydrating the resource manager, and deriving the live sheet's
 * spellcasting entries - and a save's class list is the only source either
 * one should read it from.
 * @param classes A save's classes, in save order.
 * @returns Class id to level, and class id to the subclass chosen for it.
 */
export const classLevelsAndSubclassIds = (
  classes: CharacterSave["classes"],
): {
  classLevels: Record<string, number>;
  subclassIds: Record<string, string | null | undefined>;
} => ({
  classLevels: Object.fromEntries(
    classes.map((classState) => [classState.classId, classState.level]),
  ),
  subclassIds: Object.fromEntries(
    classes.map((classState) => [classState.classId, classState.subclassId]),
  ),
});

/**
 * Which of the character's classes cast, and how.
 *
 * A class's own declaration wins; failing that, the subclass chosen for that
 * class is consulted, which is how the Eldritch Knight and the Arcane Trickster
 * cast while fighter and rogue do not. Either way the level used is the
 * class's - an Eldritch Knight 7 is a third-caster at 7, not at 5.
 *
 * A class or subclass that declares `spellcasting` still does not cast below
 * its own `startsAtLevel`: `class_paladin` and `class_ranger` declare
 * `progression: "half"` on the class itself with no level test of their own,
 * so without this check a level-1 paladin would show a spell save DC and
 * attack bonus a full level before they gain the Spellcasting feature. This
 * is the one place that check belongs - the pack is the only source that
 * knows the threshold, and every source this function emits is trusted as an
 * actual caster by everything downstream.
 * @param classLevels Class id to level.
 * @param subclassIds Class id to the subclass chosen for it, if any.
 * @param snapshot Pack content, when the caller has any loaded.
 * @returns One source per casting class that has actually gained
 * Spellcasting, in no guaranteed order.
 */
export const collectCastingSources = (
  classLevels: Record<string, number>,
  subclassIds: Record<string, string | null | undefined>,
  snapshot?: RuleSnapshotLookup,
): CastingSource[] => {
  const sources: CastingSource[] = [];

  for (const [classId, level] of Object.entries(classLevels)) {
    const fromClass = snapshot?.classesById?.[classId]?.spellcasting;

    const subclassId = subclassIds[classId];
    const fromSubclass = subclassId
      ? snapshot?.subclassesById?.[subclassId]?.spellcasting
      : undefined;

    const spellcasting = fromClass ?? fromSubclass;
    if (!spellcasting) continue;
    if (level < spellcasting.startsAtLevel) continue;

    sources.push({
      classId,
      level,
      progression: spellcasting.progression,
      ability: spellcasting.ability,
      startsAtLevel: spellcasting.startsAtLevel,
    });
  }

  return sources;
};
