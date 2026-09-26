import type { ActionGrant, DamageSegment } from "@project/shared";
import { DiceEngine } from "../utils/diceParser.js";

/** The levels a damage segment can scale by: the character's, and each class's. */
export interface ScalingLevels {
  total: number;
  classes: Record<string, number>;
}

/**
 * The dice a segment rolls at these levels.
 *
 * `levelScaling` names the dice from each threshold on; the highest threshold
 * reached wins, and below every one the segment keeps its `baseDice`.
 * `scalingMode` says whose level counts: the character's for `total_level`
 * (a cantrip, a dragonborn's breath), one class's for the class modes.
 *
 * Returns the segment itself when nothing changes, and a copy otherwise:
 * segments come from pack data, which is never written through.
 * @param segment The authored segment
 * @param levels The character's total level and each class's
 * @returns The segment with the dice for these levels
 */
export const resolveSegmentDice = (
  segment: DamageSegment,
  levels: ScalingLevels,
): DamageSegment => {
  if (segment.scalingMode === "none" || segment.levelScaling.length === 0) {
    return segment;
  }

  const level =
    segment.scalingMode === "total_level"
      ? levels.total
      : (levels.classes[segment.scalingClassId ?? ""] ?? 0);

  let dice = segment.baseDice;
  let reached = 0;
  for (const step of segment.levelScaling) {
    if (step.levelRequired <= level && step.levelRequired >= reached) {
      dice = step.newDice;
      reached = step.levelRequired;
    }
  }

  return dice === segment.baseDice ? segment : { ...segment, baseDice: dice };
};

type CoreEffect = Exclude<ActionGrant["effect"], { type: "macro" }>;

const scaleEffect = (effect: CoreEffect, levels: ScalingLevels): CoreEffect => {
  const scale = (segments: DamageSegment[]) =>
    segments.map((segment) => resolveSegmentDice(segment, levels));

  switch (effect.type) {
    case "attack":
      return {
        ...effect,
        damage: scale(effect.damage),
        ...(effect.criticalDamage !== undefined && {
          criticalDamage: scale(effect.criticalDamage),
        }),
      };
    case "damage_rider":
      return { ...effect, damage: scale(effect.damage) };
    case "save":
      return effect.damage === undefined
        ? effect
        : { ...effect, damage: scale(effect.damage) };
    default:
      return effect;
  }
};

/**
 * An action with every damage segment at the dice for these levels.
 *
 * Resolved when the sheet is built, not when the dice are rolled, for the
 * reason weapons are: the resolver has no levels to read. A dragonborn's
 * breath weapon authors 2d6 with a ladder to 5d6, and until this ran it rolled
 * 2d6 at every level.
 * @param action The authored action
 * @param levels The character's total level and each class's
 * @returns A copy of the action, scaled; the pack's copy is untouched
 */
export const resolveActionScaling = (
  action: ActionGrant,
  levels: ScalingLevels,
): ActionGrant => ({
  ...action,
  effect:
    action.effect.type === "macro"
      ? {
          ...action.effect,
          effects: action.effect.effects.map((nested) =>
            scaleEffect(nested, levels),
          ),
        }
      : scaleEffect(action.effect, levels),
});

/**
 * A segment's dice at the slot it is cast with: `perSlotAbove` added once per
 * slot level above the spell's own (Burning Hands from a 3rd-level slot: 5d6).
 * Pack validation keeps `perSlotAbove` plain dice of the segment's die size,
 * which is what makes adding the counts correct.
 * @param segment The damage segment
 * @param spellCast The spell's level and the slot's, when a slot pays for it
 * @returns The dice expression to roll
 */
export const upcastDice = (
  segment: DamageSegment,
  spellCast: { spellLevel: number; castLevel: number } | undefined,
): string => {
  const levelsAbove = spellCast ? spellCast.castLevel - spellCast.spellLevel : 0;
  if (segment.perSlotAbove === undefined || levelsAbove <= 0) {
    return segment.baseDice;
  }

  const base = DiceEngine.parse(segment.baseDice);
  const extra = DiceEngine.parse(segment.perSlotAbove);
  const count = base.count + extra.count * levelsAbove;
  const modifier =
    base.modifier === 0
      ? ""
      : base.modifier > 0
        ? `+${base.modifier}`
        : `${base.modifier}`;

  return `${count}d${base.sides}${modifier}`;
};
