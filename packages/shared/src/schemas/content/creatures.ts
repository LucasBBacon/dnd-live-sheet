import z from "zod";

export const CreatureTypeSchema = z.enum([
  "aberration",
  "beast",
  "celestial",
  "construct",
  "dragon",
  "elemental",
  "fey",
  "fiend",
  "giant",
  "humanoid",
  "monstrosity",
  "ooze",
  "plant",
  "undead",
]);

export const TargetFilterSchema = z.object({
  targetEntity: z.enum(["self", "creature", "object", "point_in_space"]),
  maxCount: z.number().default(1),

  // if undefined, implies all types valid
  allowedTypes: z.array(CreatureTypeSchema).optional(),

  // explicitly blacklist types (e.g., cure wounds can't target construct / undead)
  forbiddenTypes: z.array(CreatureTypeSchema).default([]),

  requiresVisibility: z.boolean().default(true),
});

export type CreatureType = z.infer<typeof CreatureTypeSchema>;
export type TargetFilter = z.infer<typeof TargetFilterSchema>;
