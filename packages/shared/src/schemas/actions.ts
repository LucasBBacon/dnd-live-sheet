import z from "zod";

/**
 * Base structure for all network actions.
 */
const BaseActionSchema = z.object({
  characterId: z.uuid(),
  timestamp: z.number().int(), // for future event sourcing && ordering
});

/**
 * Adjust HP action.
 */
export const ModifyHpActionSchema = BaseActionSchema.extend({
  type: z.literal("MODIFY_HP"),
  payload: z.object({
    amount: z.number().int(), // neg for damage, pos for healing
    isTemporary: z.boolean().default(false),
  }),
});

/**
 * A discriminated union of all possible game actions.
 */
export const GameActionSchema = z.discriminatedUnion("type", [
  ModifyHpActionSchema,
  // TODO: EquipItemAction, CastSpellAction... etc.
]);

export type GameAction = z.infer<typeof GameActionSchema>;
