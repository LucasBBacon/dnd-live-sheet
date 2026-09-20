import type { CharacterSave, Spellcasting } from "@project/shared";
import type { RuleSnapshotLookup } from "./ruleLookup.js";

/** One class that contributes to how many slots the character has. */
export interface CastingSource {
  classId: string;
  level: number;
  progression: Spellcasting["progression"];
  ability: Spellcasting["ability"];
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
 */
const CONTRIBUTION: Record<
  Exclude<Spellcasting["progression"], "pact">,
  { alone: (level: number) => number; shared: (level: number) => number }
> = {
  full: { alone: (level) => level, shared: (level) => level },
  half: {
    // Math.ceil(level / 2) already matches the PHB from level 2 on; below
    // that it would round a level-1 paladin up to caster level 1, granting
    // slots a full level before the class actually has any spellcasting.
    alone: (level) => (level < 2 ? 0 : Math.ceil(level / 2)),
    shared: (level) => Math.floor(level / 2),
  },
  third: {
    // Same shape as half, at the Eldritch Knight/Arcane Trickster threshold:
    // they cast nothing before level 3, but Math.ceil(level / 3) alone would
    // round levels 1-2 up to caster level 1.
    alone: (level) => (level < 3 ? 0 : Math.ceil(level / 3)),
    shared: (level) => Math.floor(level / 3),
  },
};

/**
 * The level whose row of the slot table this character reads.
 * @param sources Every casting class the character holds.
 * @returns The caster level, or 0 when nothing here grants slots.
 */
export const casterLevel = (sources: CastingSource[]): number => {
  // pact magic is its own pool on its own table and never joins this sum
  const slotted = sources.filter(
    (
      source,
    ): source is CastingSource & {
      progression: Exclude<Spellcasting["progression"], "pact">;
    } => source.progression !== "pact",
  );
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
 * @param classLevels Class id to level.
 * @param subclassIds Class id to the subclass chosen for it, if any.
 * @param snapshot Pack content, when the caller has any loaded.
 * @returns One source per casting class, in no guaranteed order.
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

    sources.push({
      classId,
      level,
      progression: spellcasting.progression,
      ability: spellcasting.ability,
    });
  }

  return sources;
};
