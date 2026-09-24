import { AbilitySchema, type AbilityKey } from "@project/shared";

/** The highest score an ability score increase may reach. */
const ABILITY_SCORE_CAP = 20;

/** The points one ability score increase grants. */
const ASI_POINTS = 2;

/**
 * Checks the numbers a level-up payload carries before either level-up route
 * uses them (#106).
 *
 * The payload arrives untrusted, so its fields are read as `unknown`. Since
 * #103 an ability score increase is written straight into the character's
 * scores, so a crafted payload would otherwise store nonsense; the preview
 * would answer NaN. Both applyLevelUp and previewLevelUp call this right
 * after loading the character, before any write.
 *
 * An empty or absent `asiChoices` means no increase: whether the level offers
 * one, and whether a feat was taken instead, is validateLevelUpPayloadFromResolver's
 * question, not this one's.
 * @param payload The request's hpRoll and asiChoices, unparsed
 * @param scoresBefore The character's scores before this level - race and
 *   traits, not items (finalAbilityScores), the score the cap of 20 governs
 * @param hitDie The hit die of the class this level is taken in
 * @throws Error("Invalid character choices: …") on the first rule broken
 */
export const checkLevelUpNumbers = ({
  payload,
  scoresBefore,
  hitDie,
}: {
  payload: { hpRoll?: unknown; asiChoices?: unknown };
  scoresBefore: Record<AbilityKey, number>;
  hitDie: number;
}): void => {
  const { hpRoll, asiChoices } = payload;

  if (
    typeof hpRoll !== "number" ||
    !Number.isInteger(hpRoll) ||
    hpRoll < 1 ||
    hpRoll > hitDie
  ) {
    throw new Error(
      `Invalid character choices: hpRoll must be a whole number from 1 to ${hitDie}.`,
    );
  }

  if (
    asiChoices === undefined ||
    asiChoices === null ||
    (Array.isArray(asiChoices) && asiChoices.length === 0)
  ) {
    return;
  }

  if (!Array.isArray(asiChoices) || asiChoices.length > ASI_POINTS) {
    throw new Error(
      "Invalid character choices: asiChoices must list one or two ability score increases.",
    );
  }

  const seen = new Set<string>();
  let total = 0;

  for (const choice of asiChoices as unknown[]) {
    const { stat, value } = (choice ?? {}) as { stat?: unknown; value?: unknown };
    const parsed = AbilitySchema.safeParse(stat);
    if (!parsed.success) {
      throw new Error(
        `Invalid character choices: ${JSON.stringify(stat)} is not an ability.`,
      );
    }
    if (seen.has(parsed.data)) {
      throw new Error(
        `Invalid character choices: ${parsed.data} is increased twice.`,
      );
    }
    seen.add(parsed.data);

    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      throw new Error(
        `Invalid character choices: the increase to ${parsed.data} must be a positive whole number.`,
      );
    }

    const key = parsed.data.toLowerCase() as AbilityKey;
    if (scoresBefore[key] + value > ABILITY_SCORE_CAP) {
      throw new Error(
        `Invalid character choices: ${parsed.data} would rise above ${ABILITY_SCORE_CAP}.`,
      );
    }
    total += value;
  }

  if (total !== ASI_POINTS) {
    throw new Error(
      `Invalid character choices: ability score increases must total ${ASI_POINTS}, not ${total}.`,
    );
  }
};
