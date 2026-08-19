import z from "zod";
import { AttackTypeSchema } from "./actions.js";

export const CombatTurnOwnerKindSchema = z.enum([
  "player",
  "actor",
  "external",
]);

export const CombatTurnOwnerSchema = z
  .object({
    kind: CombatTurnOwnerKindSchema,
    actorInstanceId: z.string().optional(),
    label: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.kind === "actor" && !value.actorInstanceId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "actor turn owners must include actorInstanceId",
        path: ["actorInstanceId"],
      });
    }

    if (value.kind !== "actor" && value.actorInstanceId !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "only actor turn owners may include actorInstanceId",
        path: ["actorInstanceId"],
      });
    }
  });

export const CombatEconomySchema = z.object({
  actionAvailable: z.boolean().default(true),
  bonusActionAvailable: z.boolean().default(true),
  reactionAvailable: z.boolean().default(true),
  spentActionSourceId: z.string().optional(),
  spentBonusActionSourceId: z.string().optional(),
  spentReactionSourceId: z.string().optional(),
  /**
   * Attacks left in the Attack action's allowance.
   *
   * `null` means the Attack action has not been taken this turn, which is a
   * different thing from having taken it and used every attack (`0`).
   */
  attacksRemaining: z.number().int().min(0).nullable().default(null),
  attackActionSourceId: z.string().optional(),
});

export const CombatTargetRelationshipSchema = z.enum([
  "self",
  "adjacent_ally",
  "ally",
  "owned_actor",
  "external_hostile",
  "unknown",
]);

export const CombatRollKnowledgeSchema = z.enum([
  "unknown",
  "manual_total",
  "single_d20",
  "advantage_pair",
  "disadvantage_pair",
]);

export const CombatRollSnapshotSchema = z.object({
  id: z.string(),
  kind: z.literal("attack"),
  attackType: AttackTypeSchema.optional(),
  relationship: CombatTargetRelationshipSchema.default("unknown"),
  sourceLabel: z.string().optional(),
  targetLabel: z.string().optional(),
  total: z.number().int().optional(),
  modifier: z.number().int().optional(),
  rawRolls: z.array(z.number().int().min(1)).default([]),
  knowledge: CombatRollKnowledgeSchema.default("unknown"),
  hasAdvantage: z.boolean().default(false),
  hasDisadvantage: z.boolean().default(false),
  notes: z.string().optional(),
});

export const CombatEventStatusSchema = z.enum([
  "pending",
  "resolved",
  "dismissed",
]);

export const CombatEventTypeSchema = z.enum([
  "hostile_attack_declared",
  "hostile_roll_recorded",
  "reaction_window_opened",
  "reaction_resolved",
  "turn_started",
  "turn_ended",
]);

export const CombatEventSchema = z.object({
  id: z.string(),
  type: CombatEventTypeSchema,
  status: CombatEventStatusSchema.default("pending"),
  sourceId: z.string().optional(),
  sourceLabel: z.string().optional(),
  targetLabel: z.string().optional(),
  relationship: CombatTargetRelationshipSchema.default("unknown"),
  openedAtRound: z.number().int().min(1).nullable().default(null),
  rollSnapshot: CombatRollSnapshotSchema.optional(),
  reactionSourceId: z.string().optional(),
  summary: z.string().optional(),
});

export const CombatContextSchema = z.object({
  inCombat: z.boolean().default(false),
  roundNumber: z.number().int().min(1).nullable().default(null),
  activeTurnOwner: CombatTurnOwnerSchema.nullable().default(null),
  // derived from the schema rather than written out: a literal default is NOT
  // re-parsed, so every field added to the economy later would be silently
  // missing from a default-constructed context
  economy: CombatEconomySchema.default(CombatEconomySchema.parse({})),
  turnFlags: z.record(z.string(), z.boolean()).default({}),
  pendingEvents: z.array(CombatEventSchema).default([]),
  recentEvents: z.array(CombatEventSchema).default([]),
});

export type CombatTurnOwnerKind = z.infer<typeof CombatTurnOwnerKindSchema>;
export type CombatTurnOwner = z.infer<typeof CombatTurnOwnerSchema>;
export type CombatTurnOwnerInput = z.input<typeof CombatTurnOwnerSchema>;
export type CombatEconomy = z.infer<typeof CombatEconomySchema>;
export type CombatTargetRelationship = z.infer<
  typeof CombatTargetRelationshipSchema
>;
export type CombatRollKnowledge = z.infer<typeof CombatRollKnowledgeSchema>;
export type CombatRollSnapshot = z.infer<typeof CombatRollSnapshotSchema>;
export type CombatRollSnapshotInput = z.input<typeof CombatRollSnapshotSchema>;
export type CombatEventStatus = z.infer<typeof CombatEventStatusSchema>;
export type CombatEventType = z.infer<typeof CombatEventTypeSchema>;
export type CombatEvent = z.infer<typeof CombatEventSchema>;
export type CombatEventInput = z.input<typeof CombatEventSchema>;
export type CombatContext = z.infer<typeof CombatContextSchema>;
