import { z } from "zod";
import type { CoreRulePack } from "./coreRulePack.js";
import { traitIdOfOption } from "./character.js";
import { StartingEquipmentDefinitionSchema } from "./items.js";

export type CoreRulePackIssueCode =
  | "duplicate_id"
  | "unknown_class_reference"
  | "unknown_equipment_reference"
  | "unknown_feat_reference"
  | "unknown_race_reference"
  | "unknown_resource_reference"
  | "unknown_spell_reference"
  | "unknown_subclass_reference"
  | "unknown_subrace_reference"
  | "unknown_trait_reference"
  | "incompatible_ammunition_reference"
  | "invalid_choice_count"
  | "invalid_progression_order"
  | "missing_subrace"
  | "unexpected_subrace";

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
    if (entry.maxRule.kind === "class_level_thresholds" && !classIds.has(entry.maxRule.classId)) {
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

  return { ok: issues.length === 0, issues };
};
