import z from "zod";
import { AbilityMinimumsSchema } from "../primitives/ability.js";

// #region Item Schemas

/**
 * Which armour table a suit of armour belongs to.
 *
 * Declared, never inferred. "Heavy" is not the same fact as "ignores
 * Dexterity": `maxDexCap: 0` is a *consequence* of the category, so reading it
 * backwards misclassifies any armour whose AC modifiers are not yet authored.
 * Rules that gate on the category — Fast Movement, armour proficiency — need
 * the fact itself.
 *
 * Shields are absent on purpose. A shield is not body armour, and the rules
 * that care about shields ask a different question ("are you wielding one")
 * answered from a different slot.
 */
export const ArmorCategorySchema = z.enum(["light", "medium", "heavy"]);

/**
 * The kind of slot an item occupies — a property of the *definition*.
 * A ring goes in "a ring slot"; it has no opinion about which finger.
 */
export const EquipSlotSchema = z.enum([
  "head",
  "amulet",
  "cloak",
  "body", // worn armor
  "main_hand",
  "off_hand",
  "gloves",
  "ring",
  "boots",
]);

/**
 * How much a container holds.
 *
 * Pounds only. The PHB gives a backpack "1 cubic foot / 30 pounds of gear",
 * a barrel "40 gallons", and a quiver "20 arrows" - three different axes, of
 * which only the first is a weight limit. Volume and item count need their own
 * data and their own rules, so they are absent rather than approximated.
 */
export const ContainerCapacitySchema = z
  .object({
    capacityPounds: z.number(),
  })
  .strict();

/**
 * What an item costs its wearer when they do not meet its requirement.
 *
 * A closed vocabulary, not a free modifier target. The requirement is checked
 * against the *final* ability score, which only exists after the stage-one
 * calculators have run - so a penalty aimed at anything stage one produces
 * would change the score that decided the penalty. Keeping `kind` a literal
 * makes that loop unauthorable rather than merely discouraged.
 */
export const ItemRequirementPenaltySchema = z
  .object({
    kind: z.literal("speed_reduction"),
    feet: z.number().int().min(0),
  })
  .strict();

/**
 * A minimum-ability qualifier on an item, and what going without costs.
 *
 * The PHB's heavy armour Strength entries are the only printed case, but the
 * shape is per-ability because nothing about the rule is Strength-specific.
 * An entry is unmet when *any* of its minimums is unmet, matching how
 * `abilityMinimums` reads everywhere else.
 */
export const ItemRequirementSchema = z
  .object({
    abilityMinimums: AbilityMinimumsSchema,
    unmetPenalty: ItemRequirementPenaltySchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    if (Object.keys(data.abilityMinimums).length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "An item requirement must define at least one ability minimum.",
        path: ["abilityMinimums"],
      });
    }
  });

/**
 * The category vocabulary a starting-equipment grant can name.
 *
 * Membership is declared by the item, never inferred from its id or its name:
 * an arcane focus is one because it carries `category_arcane_focus`, and that
 * tag is the only reason a class grant of "an arcane focus" resolves to it.
 */
export const StartingEquipmentCategoryTagSchema = z.enum([
  "category_weapon_simple",
  "category_weapon_simple_melee",
  "category_weapon_simple_ranged",
  "category_weapon_martial",
  "category_weapon_martial_melee",
  "category_weapon_martial_ranged",
  "category_armor_shield",
  "category_holy_symbol",
  "category_arcane_focus",
  "category_druidic_focus",
  "category_musical_instrument",
  // Six classes grant "an equipment pack" by category, so the seven packs need
  // a tag to be interchangeable through. equipment/packs.json already carried
  // this tag while nothing here declared it, which is why the shipped pack
  // stopped parsing the moment that segment joined the manifest.
  "category_pack",
]);

export const StartingEquipmentGrantSchema = z
  .object({
    kind: z.enum(["item", "category", "money"]),
    refId: z.string(),
    quantity: z.number().int().min(1).default(1),
  })
  .strict();

export const StartingEquipmentChoiceOptionSchema = z
  .object({
    equipmentBundle: z.array(StartingEquipmentGrantSchema).default([]),
  })
  .strict();

export const StartingEquipmentChoiceSchema = z
  .object({
    choose: z.number().int().min(1).default(1),
    options: z.array(StartingEquipmentChoiceOptionSchema).default([]),
  })
  .strict();

export const StartingEquipmentDefinitionSchema = z
  .object({
    given: z.array(StartingEquipmentGrantSchema).default([]),
    choices: z.array(StartingEquipmentChoiceSchema).default([]),
  })
  .strict();

// #endregion

// #region Type Exports

export type ArmorCategory = z.infer<typeof ArmorCategorySchema>;
export type EquipSlot = z.infer<typeof EquipSlotSchema>;
export type ContainerCapacity = z.infer<typeof ContainerCapacitySchema>;
export type ItemRequirementPenalty = z.infer<
  typeof ItemRequirementPenaltySchema
>;
export type ItemRequirement = z.infer<typeof ItemRequirementSchema>;
export type StartingEquipmentCategoryTag = z.infer<
  typeof StartingEquipmentCategoryTagSchema
>;
export type StartingEquipmentGrant = z.infer<
  typeof StartingEquipmentGrantSchema
>;
export type StartingEquipmentChoiceOption = z.infer<
  typeof StartingEquipmentChoiceOptionSchema
>;
export type StartingEquipmentChoice = z.infer<
  typeof StartingEquipmentChoiceSchema
>;
export type StartingEquipmentDefinition = z.infer<
  typeof StartingEquipmentDefinitionSchema
>;

// #endregion
