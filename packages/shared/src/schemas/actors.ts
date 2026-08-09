import z from "zod";
import { ActionGrantSchema } from "./actions.js";

export const ActorControllerSchema = z.enum([
  "player",
  "game_master",
  "system",
]);

export const ActorLifecycleStateSchema = z.enum([
  "active",
  "dismissed",
  "expired",
]);

export const ActorCombatProfileSchema = z.object({
  armourClass: z.number().int().optional(),
  hitPoints: z.number().int().optional(),
  speed: z.number().int().optional(),
  size: z.string().optional(),
});

export const ActorControllerRulesSchema = z.object({
  defaultController: ActorControllerSchema.default("system"),
  playerControlled: z.boolean().default(false),
});

export const ActorBlueprintSchema = z.object({
  id: z.string(),
  label: z.string(),
  baseStates: z.array(z.string()).default([]),
  authoredActions: z.array(ActionGrantSchema).default([]),
  combatProfile: ActorCombatProfileSchema.optional(),
  controllerRules: ActorControllerRulesSchema.default({
    defaultController: "system",
    playerControlled: false,
  }),
});

export const ActorInstanceSchema = z.object({
  instanceId: z.string(),
  ownerCharacterId: z.string().optional(),
  templateId: z.string(),
  displayLabel: z.string(),
  controller: ActorControllerSchema,
  lifecycleState: ActorLifecycleStateSchema,
  currentStates: z.array(z.string()).default([]),
  availableActions: z.array(ActionGrantSchema).default([]),
  combatProfile: ActorCombatProfileSchema.optional(),
  statusSummary: z.string().optional(),
  sourceEffectInstanceId: z.string().optional(),
});

export type ActorController = z.infer<typeof ActorControllerSchema>;
export type ActorLifecycleState = z.infer<typeof ActorLifecycleStateSchema>;
export type ActorCombatProfile = z.infer<typeof ActorCombatProfileSchema>;
export type ActorControllerRules = z.infer<typeof ActorControllerRulesSchema>;
export type ActorBlueprint = z.infer<typeof ActorBlueprintSchema>;
export type ActorInstance = z.infer<typeof ActorInstanceSchema>;