import { z } from "zod";
import type { CoreRulePack } from "./coreRulePack.js";
import { traitIdOfOption } from "./character.js";
import { StartingEquipmentDefinitionSchema } from "./items.js";
import { ROUNDS_PER_DURATION_UNIT } from "./spells.js";

export type CoreRulePackIssueCode =
  | "concentration_mismatch"
  | "duplicate_id"
  | "incompatible_ammunition_reference"
  | "incomplete_spell"
  | "invalid_choice_count"
  | "invalid_progression_order"
  | "invalid_upcast"
  | "missing_scaling_class"
  | "missing_subrace"
  | "spell_hardcodes_caster_value"
  | "unexpected_subrace"
  | "unknown_class_reference"
  | "unknown_equipment_reference"
  | "unknown_feat_reference"
  | "unknown_race_reference"
  | "unknown_resource_reference"
  | "unknown_scaling_class"
  | "unknown_spell_reference"
  | "unknown_subclass_reference"
  | "unknown_subrace_reference"
  | "unknown_trait_reference";

export type CoreRulePackValidationIssue = {
  code: CoreRulePackIssueCode;
  path: Array<string | number>;
  message: string;
};

export type CoreRulePackValidationResult = {
  ok: boolean;
  issues: CoreRulePackValidationIssue[];
};

type FeatureGrant = CoreRulePack["classes"][number]["progression"][number]["grants"][number];

const pushReferenceIssue = (
  issues: CoreRulePackValidationIssue[],
  code: Extract<CoreRulePackIssueCode, `unknown_${string}_reference`>,
  path: Array<string | number>,
  id: string,
) => {
  issues.push({
    code,
    path,
    message: `Unknown ${code.slice("unknown_".length, -"_reference".length).replaceAll("_", " ")} '${id}'.`,
  });
};

const validateProgression = (
  progression: Array<{ level: number; grants: FeatureGrant[] }>,
  path: Array<string | number>,
  traitIds: Set<string>,
  spellIds: Set<string>,
  issues: CoreRulePackValidationIssue[],
) => {
  let previousLevel = 0;

  progression.forEach((entry, levelIndex) => {
    const entryPath = [...path, levelIndex];
    if (entry.level <= previousLevel) {
      issues.push({
        code: "invalid_progression_order",
        path: [...entryPath, "level"],
        message: "Progression levels must be strictly ascending without duplicates.",
      });
    }
    previousLevel = entry.level;

    entry.grants.forEach((grant, grantIndex) => {
      const grantPath = [...entryPath, "grants", grantIndex];
      if (typeof grant === "string") {
        if (!traitIds.has(grant)) {
          pushReferenceIssue(
            issues,
            "unknown_trait_reference",
            grantPath,
            grant,
          );
        }
        return;
      }

      if (grant.type === "trait_choice") {
        if (grant.pickCount > grant.options.length) {
          issues.push({
            code: "invalid_choice_count",
            path: [...grantPath, "pickCount"],
            message: "Trait-choice pickCount cannot exceed its option count.",
          });
        }

        grant.options.forEach((option, optionIndex) => {
          const traitId = traitIdOfOption(option);
          if (!traitIds.has(traitId)) {
            pushReferenceIssue(
              issues,
              "unknown_trait_reference",
              [...grantPath, "options", optionIndex],
              traitId,
            );
          }

          if (typeof option !== "string") {
            option.prerequisites.requiredTraitIds?.forEach(
              (requiredTraitId, prerequisiteIndex) => {
                if (!traitIds.has(requiredTraitId)) {
                  pushReferenceIssue(
                    issues,
                    "unknown_trait_reference",
                    [
                      ...grantPath,
                      "options",
                      optionIndex,
                      "prerequisites",
                      "requiredTraitIds",
                      prerequisiteIndex,
                    ],
                    requiredTraitId,
                  );
                }
              },
            );
            option.prerequisites.requiredSpellIds?.forEach(
              (requiredSpellId, prerequisiteIndex) => {
                if (!spellIds.has(requiredSpellId)) {
                  pushReferenceIssue(
                    issues,
                    "unknown_spell_reference",
                    [
                      ...grantPath,
                      "options",
                      optionIndex,
                      "prerequisites",
                      "requiredSpellIds",
                      prerequisiteIndex,
                    ],
                    requiredSpellId,
                  );
                }
              },
            );
          }
        });
      }
    });
  });
};

const validateStartingEquipment = (
  startingEquipment: z.infer<typeof StartingEquipmentDefinitionSchema>,
  path: Array<string | number>,
  equipmentIds: Set<string>,
  issues: CoreRulePackValidationIssue[],
) => {
  const validateGrant = (
    grant: z.infer<typeof StartingEquipmentDefinitionSchema>["given"][number],
    grantPath: Array<string | number>,
  ) => {
    if (grant.kind === "item" && !equipmentIds.has(grant.refId)) {
      pushReferenceIssue(
        issues,
        "unknown_equipment_reference",
        [...grantPath, "refId"],
        grant.refId,
      );
    }
  };

  startingEquipment.given.forEach((grant, grantIndex) =>
    validateGrant(grant, [...path, "given", grantIndex]),
  );
  startingEquipment.choices.forEach((choice, choiceIndex) => {
    if (choice.choose > choice.options.length) {
      issues.push({
        code: "invalid_choice_count",
        path: [...path, "choices", choiceIndex, "choose"],
        message: "Starting-equipment choose count cannot exceed its option count.",
      });
    }
    choice.options.forEach((option, optionIndex) => {
      option.equipmentBundle.forEach((grant, grantIndex) =>
        validateGrant(grant, [
          ...path,
          "choices",
          choiceIndex,
          "options",
          optionIndex,
          "equipmentBundle",
          grantIndex,
        ]),
      );
    });
  });
};

const CLASS_SCALED = new Set(["class_level", "class_level_thresholds"]);

type PackSpell = CoreRulePack["spells"][number];
type SpellEffect = PackSpell["action"]["effect"];

/** An action's effect, and a macro's nested ones beside it. */
const flattenEffects = (effect: SpellEffect): SpellEffect[] =>
  effect.type === "macro" ? [effect, ...effect.effects] : [effect];

const SPELL_METADATA = ["lore", "range", "components", "duration"] as const;

const DICE = /^(\d+)d(\d+)([+-]\d+)?$/;

/**
 * What an authored spell must say, and what it must not.
 *
 * - An authored spell carries lore, range, components and duration; a stub
 *   carries none, since the marker says it is a placeholder.
 * - A material component names its material.
 * - A concentration duration and a concentration effect come together, and
 *   agree on how long.
 * - `perSlotAbove` sits only on a leveled spell, as plain dice of its
 *   segment's own die size - the resolver adds it by count.
 * - A spell never authors a number its caster decides: the synthesizer
 *   stamps attack bonus, DC, beam count and area from the casting source and
 *   the spell's range.
 */
const validateSpells = (
  pack: CoreRulePack,
  issues: CoreRulePackValidationIssue[],
) => {
  pack.spells.forEach((spell, index) => {
    const path: Array<string | number> = ["spells", index];
    const isStub = spell.implementation?.mode === "unimplemented";

    const present = SPELL_METADATA.filter((key) => spell[key] !== undefined);
    const missing = SPELL_METADATA.filter((key) => spell[key] === undefined);
    if (isStub && present.length > 0) {
      issues.push({
        code: "incomplete_spell",
        path,
        message: `Stub spell '${spell.id}' carries ${present.join(", ")}; a stub is a placeholder, and metadata belongs on an authored spell.`,
      });
    }
    if (!isStub && missing.length > 0) {
      issues.push({
        code: "incomplete_spell",
        path,
        message: `Spell '${spell.id}' is authored but has no ${missing.join(", ")}.`,
      });
    }

    if (spell.components?.material && !spell.components.materialDescription) {
      issues.push({
        code: "incomplete_spell",
        path: [...path, "components"],
        message: `Spell '${spell.id}' needs a material component but does not say what it is.`,
      });
    }

    const effects = flattenEffects(spell.action.effect);
    const concentration = effects.flatMap((effect) =>
      effect.type === "apply_effect" && effect.isSelfConcentration ? [effect] : [],
    );
    const duration = spell.duration;
    if (duration !== undefined) {
      const concentrates = duration.kind === "timed" && duration.concentration;
      if (concentrates !== concentration.length > 0) {
        issues.push({
          code: "concentration_mismatch",
          path: [...path, "duration"],
          message: concentrates
            ? `Spell '${spell.id}' lasts with concentration, but its action applies no concentration effect.`
            : `Spell '${spell.id}' applies a concentration effect, but its duration is not concentration.`,
        });
      }
      if (duration.kind === "timed" && concentrates) {
        const rounds = duration.amount * ROUNDS_PER_DURATION_UNIT[duration.unit];
        for (const effect of concentration) {
          if (effect.durationType !== "rounds" || effect.durationRounds !== rounds) {
            issues.push({
              code: "concentration_mismatch",
              path: [...path, "action"],
              message: `Spell '${spell.id}' lasts ${rounds} rounds, but its concentration effect does not.`,
            });
          }
        }
      }
    }

    for (const effect of effects) {
      const segments =
        "damage" in effect && Array.isArray(effect.damage) ? effect.damage : [];
      for (const segment of segments) {
        if (segment.perSlotAbove === undefined) continue;
        if (spell.level === 0) {
          issues.push({
            code: "invalid_upcast",
            path: [...path, "action"],
            message: `Cantrip '${spell.id}' cannot be cast with a slot, so it cannot add dice per slot level.`,
          });
          continue;
        }
        const base = DICE.exec(segment.baseDice);
        const extra = DICE.exec(segment.perSlotAbove);
        if (!base || !extra || extra[3] !== undefined || extra[2] !== base[2]) {
          issues.push({
            code: "invalid_upcast",
            path: [...path, "action"],
            message: `Spell '${spell.id}' adds '${segment.perSlotAbove}' per slot level to '${segment.baseDice}'; it must be plain dice of the same die size.`,
          });
        }
      }

      const hardcoded = [
        effect.type === "attack" && effect.attackBonus !== undefined ? "attackBonus" : undefined,
        effect.type === "attack" && effect.damageBonus !== undefined ? "damageBonus" : undefined,
        effect.type === "attack" && effect.repeatCount !== undefined ? "repeatCount" : undefined,
        effect.type === "save" && effect.savingThrow.dc !== undefined ? "savingThrow.dc" : undefined,
        effect.type === "save" && effect.areaOfEffect !== undefined ? "areaOfEffect" : undefined,
      ].filter((field): field is string => field !== undefined);
      if (hardcoded.length > 0) {
        issues.push({
          code: "spell_hardcodes_caster_value",
          path: [...path, "action"],
          message: `Spell '${spell.id}' authors ${hardcoded.join(", ")}; the spell synthesizer stamps these from the casting source and the spell's range.`,
        });
      }
    }
  });
};

/**
 * An entry scaled by one class's level must say which class.
 *
 * Without `scalingClassId`, `DerivedStatEngine.resolveScaledValue` falls
 * through to the flat value, so a feature meant to grow with its class stops
 * at level one and nothing says so - Draconic Resilience added 1 hit point
 * instead of 1 per sorcerer level (#87). The whole pack is walked rather than
 * a list of known sites: scaling is authored as `scalingFactor` on modifiers
 * and critical-hit dice and as `scalingMode` on damage segments, and a site
 * added later is covered without anyone remembering to add it here. The
 * message names the nearest enclosing entity with an id.
 *
 * A `scalingClassId` must also name a class the pack defines: a mistyped id
 * reads no class level and falls through the same way, silently (#108).
 */
const validateClassScaling = (
  pack: CoreRulePack,
  issues: CoreRulePackValidationIssue[],
) => {
  const classIds = new Set(pack.classes.map((entry) => entry.id));

  const visit = (
    value: unknown,
    path: Array<string | number>,
    ownerId: string | undefined,
  ): void => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, [...path, index], ownerId));
      return;
    }
    if (value === null || typeof value !== "object") return;

    const record = value as Record<string, unknown>;
    const owner = typeof record.id === "string" ? record.id : ownerId;
    const scaling = record.scalingFactor ?? record.scalingMode;
    const target =
      typeof record.target === "string" ? ` ${record.target}` : "";
    const entry = owner ? `'${owner}'` : "An entry";

    if (
      typeof scaling === "string" &&
      CLASS_SCALED.has(scaling) &&
      !record.scalingClassId
    ) {
      issues.push({
        code: "missing_scaling_class",
        path,
        message: `${entry} scales${target} by ${scaling} but names no scalingClassId.`,
      });
    }

    if (
      typeof record.scalingClassId === "string" &&
      record.scalingClassId.length > 0 &&
      !classIds.has(record.scalingClassId)
    ) {
      issues.push({
        code: "unknown_scaling_class",
        path,
        message: `${entry} scales${target} by class '${record.scalingClassId}', which the pack does not define.`,
      });
    }

    for (const [key, child] of Object.entries(record)) {
      visit(child, [...path, key], owner);
    }
  };

  visit(pack, [], undefined);
};

export const validateCoreRulePack = (
  pack: CoreRulePack,
): CoreRulePackValidationResult => {
  const issues: CoreRulePackValidationIssue[] = [];
  /**
   * Ids are unique within a section, not across the pack.
   *
   * This codebase's settled convention is that an entity carries the id of
   * the trait it grants: a resource is 'trait_action_surge' (documented on
   * SocketEvent.resourceId and relied on by the sample-character seed), a
   * dragonborn subrace grants a trait of its own id, and feat_alert grants
   * trait feat_alert. One global id space forbids every one of those pairs,
   * and nothing needs it to: each reference below resolves through a
   * per-section set, so 'unknown trait' and 'unknown resource' are already
   * separate questions.
   *
   * Races and subraces share a section because they resolve through one
   * lookup, so a subrace may not take a race's id or another subrace's.
   */
  const idsBySection = new Map<string, Set<string>>();
  const registerId = (
    section: string,
    id: string,
    path: Array<string | number>,
  ) => {
    const seen = idsBySection.get(section) ?? new Set<string>();
    idsBySection.set(section, seen);

    if (seen.has(id)) {
      issues.push({
        code: "duplicate_id",
        path,
        message: `Duplicate core-rule id '${id}'.`,
      });
      return;
    }
    seen.add(id);
  };

  pack.traits.forEach((entry, index) => registerId("traits", entry.id, ["traits", index, "id"]));
  pack.resources.forEach((entry, index) => registerId("resources", entry.id, ["resources", index, "id"]));
  pack.races.forEach((entry, index) => {
    registerId("races", entry.id, ["races", index, "id"]);
    Object.entries(entry.subraces).forEach(([key, subrace]) =>
      registerId("races", subrace.id, ["races", index, "subraces", key, "id"]),
    );
  });
  pack.classes.forEach((entry, index) => registerId("classes", entry.id, ["classes", index, "id"]));
  pack.subclasses.forEach((entry, index) => registerId("subclasses", entry.id, ["subclasses", index, "id"]));
  pack.feats.forEach((entry, index) => registerId("feats", entry.id, ["feats", index, "id"]));
  pack.backgrounds.forEach((entry, index) => registerId("backgrounds", entry.id, ["backgrounds", index, "id"]));
  pack.equipment.forEach((entry, index) => registerId("equipment", entry.id, ["equipment", index, "id"]));
  pack.spells.forEach((entry, index) => registerId("spells", entry.id, ["spells", index, "id"]));
  pack.proficiencies.forEach((entry, index) => registerId("proficiencies", entry.id, ["proficiencies", index, "id"]));

  const traitIds = new Set(pack.traits.map((entry) => entry.id));
  const resourceIds = new Set([
    ...pack.resources.map((entry) => entry.id),
    ...pack.traits.flatMap((entry) => entry.resources.map((resource) => resource.id)),
  ]);
  const raceIds = new Set(pack.races.map((entry) => entry.id));
  const subraceIds = new Set(
    pack.races.flatMap((entry) =>
      Object.values(entry.subraces).map((subrace) => subrace.id),
    ),
  );
  const classIds = new Set(pack.classes.map((entry) => entry.id));
  const subclassIds = new Set(pack.subclasses.map((entry) => entry.id));
  const featIds = new Set(pack.feats.map((entry) => entry.id));
  const equipmentIds = new Set(pack.equipment.map((entry) => entry.id));
  const spellIds = new Set(pack.spells.map((entry) => entry.id));

  pack.races.forEach((race, raceIndex) => {
    if (race.hasSubraces && Object.keys(race.subraces).length === 0) {
      issues.push({
        code: "missing_subrace",
        path: ["races", raceIndex, "subraces"],
        message: "A race that has subraces must declare at least one subrace.",
      });
    }
    if (!race.hasSubraces && Object.keys(race.subraces).length > 0) {
      issues.push({
        code: "unexpected_subrace",
        path: ["races", raceIndex, "subraces"],
        message: "A race without subraces cannot declare subrace records.",
      });
    }
    [race, ...Object.values(race.subraces)].forEach((record, recordIndex) => {
      record.grantedTraitIds.forEach((traitId, traitIndex) => {
        if (!traitIds.has(traitId)) {
          pushReferenceIssue(
            issues,
            "unknown_trait_reference",
            recordIndex === 0
              ? ["races", raceIndex, "grantedTraitIds", traitIndex]
              : [
                  "races",
                  raceIndex,
                  "subraces",
                  recordIndex - 1,
                  "grantedTraitIds",
                  traitIndex,
                ],
            traitId,
          );
        }
      });
    });
  });

  pack.classes.forEach((entry, index) => {
    entry.startingProficiencyTraitIds.forEach((traitId, traitIndex) => {
      if (!traitIds.has(traitId)) {
        pushReferenceIssue(issues, "unknown_trait_reference", ["classes", index, "startingProficiencyTraitIds", traitIndex], traitId);
      }
    });
    entry.multiclassTraitIds.forEach((traitId, traitIndex) => {
      if (!traitIds.has(traitId)) {
        pushReferenceIssue(issues, "unknown_trait_reference", ["classes", index, "multiclassTraitIds", traitIndex], traitId);
      }
    });
    validateProgression(entry.progression, ["classes", index, "progression"], traitIds, spellIds, issues);
    validateStartingEquipment(entry.startingEquipment, ["classes", index, "startingEquipment"], equipmentIds, issues);
  });

  pack.subclasses.forEach((entry, index) => {
    if (!classIds.has(entry.classId)) {
      pushReferenceIssue(issues, "unknown_class_reference", ["subclasses", index, "classId"], entry.classId);
    }
    validateProgression(entry.progression, ["subclasses", index, "progression"], traitIds, spellIds, issues);
  });

  pack.feats.forEach((entry, index) => {
    entry.grantedTraitIds.forEach((traitId, traitIndex) => {
      if (!traitIds.has(traitId)) {
        pushReferenceIssue(issues, "unknown_trait_reference", ["feats", index, "grantedTraitIds", traitIndex], traitId);
      }
    });
    entry.prerequisites?.requiredClassIds?.forEach((classId, referenceIndex) => {
      if (!classIds.has(classId)) {
        pushReferenceIssue(issues, "unknown_class_reference", ["feats", index, "prerequisites", "requiredClassIds", referenceIndex], classId);
      }
    });
    entry.prerequisites?.requiredSubclassIds?.forEach((subclassId, referenceIndex) => {
      if (!subclassIds.has(subclassId)) {
        pushReferenceIssue(issues, "unknown_subclass_reference", ["feats", index, "prerequisites", "requiredSubclassIds", referenceIndex], subclassId);
      }
    });
    entry.prerequisites?.requiredRaceIds?.forEach((raceId, referenceIndex) => {
      if (!raceIds.has(raceId)) {
        pushReferenceIssue(issues, "unknown_race_reference", ["feats", index, "prerequisites", "requiredRaceIds", referenceIndex], raceId);
      }
    });
    entry.prerequisites?.requiredSubraceIds?.forEach((subraceId, referenceIndex) => {
      if (!subraceIds.has(subraceId)) {
        pushReferenceIssue(issues, "unknown_subrace_reference", ["feats", index, "prerequisites", "requiredSubraceIds", referenceIndex], subraceId);
      }
    });
    entry.prerequisites?.requiredFeatIds?.forEach((featId, referenceIndex) => {
      if (!featIds.has(featId)) {
        pushReferenceIssue(issues, "unknown_feat_reference", ["feats", index, "prerequisites", "requiredFeatIds", referenceIndex], featId);
      }
    });
  });

  pack.backgrounds.forEach((entry, index) => {
    entry.backgroundTraitIds.forEach((traitId, traitIndex) => {
      if (!traitIds.has(traitId)) {
        pushReferenceIssue(issues, "unknown_trait_reference", ["backgrounds", index, "backgroundTraitIds", traitIndex], traitId);
      }
    });
    validateStartingEquipment(entry.startingEquipment, ["backgrounds", index, "startingEquipment"], equipmentIds, issues);
  });

  pack.equipment.forEach((entry, index) => {
    entry.bundleContents.forEach((content, contentIndex) => {
      if (!equipmentIds.has(content.itemId)) {
        pushReferenceIssue(issues, "unknown_equipment_reference", ["equipment", index, "bundleContents", contentIndex, "itemId"], content.itemId);
      }
    });
    if (entry.weapon?.ammoItemId && !equipmentIds.has(entry.weapon.ammoItemId)) {
      pushReferenceIssue(issues, "unknown_equipment_reference", ["equipment", index, "weapon", "ammoItemId"], entry.weapon.ammoItemId);
    }
    if (entry.weapon?.ammoItemId && entry.weapon.ammoTag) {
      const ammunition = pack.equipment.find((item) => item.id === entry.weapon?.ammoItemId);
      if (ammunition?.ammoTag !== entry.weapon.ammoTag) {
        issues.push({
          code: "incompatible_ammunition_reference",
          path: ["equipment", index, "weapon", "ammoItemId"],
          message: `Ammunition '${entry.weapon.ammoItemId}' does not carry ammo tag '${entry.weapon.ammoTag}'.`,
        });
      }
    }
  });

  pack.resources.forEach((entry, index) => {
    if ("maxRule" in entry && entry.maxRule.kind === "class_level_thresholds" && !classIds.has(entry.maxRule.classId)) {
      pushReferenceIssue(issues, "unknown_class_reference", ["resources", index, "maxRule", "classId"], entry.maxRule.classId);
    }
  });

  pack.traits.forEach((entry, index) => {
    entry.spells?.fixed.forEach((grant, grantIndex) => {
      if (!spellIds.has(grant.spellId)) {
        pushReferenceIssue(issues, "unknown_spell_reference", ["traits", index, "spells", "fixed", grantIndex, "spellId"], grant.spellId);
      }
      if (grant.usage.kind === "resource" && !resourceIds.has(grant.usage.resourceId!)) {
        pushReferenceIssue(issues, "unknown_resource_reference", ["traits", index, "spells", "fixed", grantIndex, "usage", "resourceId"], grant.usage.resourceId!);
      }
    });
  });

  validateClassScaling(pack, issues);
  validateSpells(pack, issues);

  return { ok: issues.length === 0, issues };
};

/**
 * Every trait id the pack reaches, from anywhere.
 *
 * The reverse of the reference checks in `validateCoreRulePack`: that asks
 * whether every referenced trait exists, this asks which traits are reached at
 * all. A trait nothing reaches cannot be granted to any character, so it is
 * either content waiting for a progression to name it or - far more often -
 * an orphan the port left behind (#57).
 *
 * **Keep this in step with the trait-reference sites in
 * `validateCoreRulePack`.** They walk the same places for opposite reasons,
 * and a site added there and forgotten here makes live content read as an
 * orphan, which is the reading that gets content deleted.
 */
export const collectReferencedTraitIds = (pack: CoreRulePack): Set<string> => {
  const referenced = new Set<string>();

  const addGrant = (grant: FeatureGrant): void => {
    if (typeof grant === "string") {
      referenced.add(grant);
      return;
    }

    if (grant.type !== "trait_choice") return;

    for (const option of grant.options) {
      referenced.add(traitIdOfOption(option));

      // A prerequisite reaches its trait too: deleting it would break the
      // option that gates on it.
      if (typeof option !== "string") {
        option.prerequisites.requiredTraitIds?.forEach((id) =>
          referenced.add(id),
        );
      }
    }
  };

  for (const race of pack.races) {
    for (const record of [race, ...Object.values(race.subraces)]) {
      record.grantedTraitIds.forEach((id) => referenced.add(id));
    }
  }

  for (const entry of pack.classes) {
    entry.startingProficiencyTraitIds.forEach((id) => referenced.add(id));
    entry.multiclassTraitIds.forEach((id) => referenced.add(id));
    entry.progression.forEach((level) => level.grants.forEach(addGrant));
  }

  for (const entry of pack.subclasses) {
    entry.progression.forEach((level) => level.grants.forEach(addGrant));
  }

  for (const entry of pack.feats) {
    entry.grantedTraitIds.forEach((id) => referenced.add(id));
  }

  for (const entry of pack.backgrounds) {
    entry.backgroundTraitIds.forEach((id) => referenced.add(id));
  }

  return referenced;
};
