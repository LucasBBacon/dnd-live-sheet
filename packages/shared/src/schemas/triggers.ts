import z from "zod";

export const EngineEventSchema = z.enum([
  "ON_HP_REDUCED_TO_ZERO",
  "ON_ATTACK_HIT",
  "ON_SAVING_THROW_FAILED",
  "ON_START_OF_TURN",
  "ON_END_OF_TURN",
  "ON_SHORT_REST",
  "ON_LONG_REST",
]);

export const TriggerGrantSchema = z.object({
  listenFor: EngineEventSchema,
  // teh specific macro/action the engine runs when this triggers
  executeAction: z.string(), // e.g., "MACRO_DROP_TO_ONE_HP"
  // if provided, the engine will only fire the action if this resource has > 0 charges
  // and will automatically decrement it
  consumeResource: z.string().optional(),
});

export type EngineEvent = z.infer<typeof EngineEventSchema>;
export type TriggerGrant = z.infer<typeof TriggerGrantSchema>;
