import {
  BACKGROUND_DICTIONARY,
  CLASS_DICTIONARY,
  EQUIPMENT_DICTIONARY,
  FEAT_DICTIONARY,
  ITEM_DICTIONARY,
  RACE_DICTIONARY,
  SUBCLASS_DICTIONARY,
  TRAIT_DICTIONARY,
  WEAPON_DICTIONARY,
  listSubclassesForClass,
  resolveResourceRules,
} from "@project/engine";
import { RuleSnapshotSchema } from "@project/shared";
import { resolveNextLevelValidationContext } from "../levelUpValidation.js";
import type {
  LevelUpOptionsInput,
  ReferenceProvider,
  ScopedContext,
  TraitCategory,
} from "./types.js";

const STATIC_LOADED_AT = Date.now();
const STATIC_VERSION = 1;

const toLore = (summary: string) => ({
  shortDescription: summary,
  fullText: summary,
});

const toTraitRow = (traitId: string, sourceOrigin?: string) => {
  const trait = TRAIT_DICTIONARY[traitId];
  const fallbackName = traitId.replace(/_/g, " ");
  const name = trait?.name ?? fallbackName;
  const summary =
    trait?.lore?.shortDescription ??
    trait?.lore?.fullText ??
    `${name} reference data.`;

  return {
    id: traitId,
    name,
    lore: toLore(summary),
    effects: [],
    isStartingProficiency: false,
    sourceType: "core",
    ownerCharacterId: null,
    ...(sourceOrigin ? { sourceOrigin } : {}),
  };
};

const hasTraitCategoryMatch = (
  trait: { id: string; name: string },
  category: TraitCategory,
) => {
  const id = trait.id.toLowerCase();
  const name = trait.name.toLowerCase();

  if (category === "skills") {
    return id.includes("_prof_skills") || name.includes("skill");
  }

  return (
    id.includes("_prof_tools") ||
    id.includes("_languages") ||
    name.includes("tool") ||
    name.includes("language")
  );
};

const asClassRow = (classDefinition: (typeof CLASS_DICTIONARY)[string]) => ({
  id: classDefinition.id,
  name: classDefinition.name,
  hitDie: classDefinition.hitDie,
  subclassRequirementLevel: classDefinition.subclassUnlockLevel,
  startingEquipment: classDefinition.startingEquipment,
  lore: toLore(`${classDefinition.name} class reference data.`),
  sourceType: "core",
  ownerCharacterId: null,
});

const classTraitIdsAtLevel = (
  classId: string,
  targetLevel: number,
): string[] => {
  const classDefinition = CLASS_DICTIONARY[classId];
  if (!classDefinition) return [];

  const grants =
    classDefinition.progression.find((entry) => entry.level === targetLevel)
      ?.grants ?? [];

  return grants.filter((grant): grant is string => typeof grant === "string");
};

const subclassTraitIdsAtLevel = (
  classId: string,
  subclassId: string | undefined,
  targetLevel: number,
): string[] => {
  if (!subclassId) return [];

  const subclass = SUBCLASS_DICTIONARY[subclassId];
  if (!subclass || subclass.classId !== classId) return [];

  const grants =
    subclass.progression.find((entry) => entry.level === targetLevel)?.grants ??
    [];

  return grants.filter((grant): grant is string => typeof grant === "string");
};

export class StaticReferenceProvider implements ReferenceProvider {
  public readonly source = "static" as const;

  public async warm(): Promise<void> {
    return;
  }

  public async getRaces(_scope: ScopedContext): Promise<unknown[]> {
    return Object.values(RACE_DICTIONARY)
      .map((race) => {
        const raceTraits = race.grantedTraitIds.map((traitId) =>
          toTraitRow(traitId, `Race: ${race.name}`),
        );

        const subraces = Object.values(race.subraces).map((subrace) => ({
          id: subrace.id,
          parentRaceId: race.id,
          name: subrace.name,
          lore: toLore(`${subrace.name} subrace reference data.`),
          sourceType: "core",
          traits: subrace.grantedTraitIds.map((traitId) =>
            toTraitRow(traitId, `Subrace: ${subrace.name}`),
          ),
        }));

        return {
          id: race.id,
          name: race.name,
          speed: race.speed,
          requiresSubrace: race.hasSubraces,
          displayLabel: race.hasSubraces ? "Subrace" : "Lineage",
          lore: toLore(`${race.name} race reference data.`),
          sourceType: "core",
          traits: raceTraits,
          subraces,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  public async getClasses(_scope: ScopedContext): Promise<unknown[]> {
    return Object.values(CLASS_DICTIONARY)
      .map((classDefinition) => asClassRow(classDefinition))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  public async getFeats(_scope: ScopedContext): Promise<unknown[]> {
    return Object.values(FEAT_DICTIONARY)
      .map((feat) => ({
        id: feat.id,
        name: feat.name,
        category: feat.category,
        source: feat.source,
        repeatable: feat.repeatable,
        lore: feat.lore,
        prerequisites: feat.prerequisites ?? null,
        sourceType: "core",
        ownerCharacterId: null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  public async getLevelUpOptions(input: LevelUpOptionsInput): Promise<{
    classes: unknown[];
    feats: unknown[];
    subclasses: unknown[];
    timeline: unknown[];
    nextLevel: unknown | null;
    supportByClass: Record<string, unknown>;
    selected: {
      classId: string | null;
      subclassId: string | null;
    };
  }> {
    const classes = await this.getClasses(input.scope);
    const feats = await this.getFeats(input.scope);

    const subclasses = input.classId
      ? await this.getSubclasses(input.scope, input.classId)
      : [];
    const timeline = input.classId
      ? await this.getClassTimeline(
          input.scope,
          input.classId,
          input.subclassId,
        )
      : [];

    const nextLevel = input.classId
      ? resolveNextLevelValidationContext({
          classId: input.classId,
          currentClassLevel: input.currentClassLevel,
          ...(input.subclassId !== undefined
            ? { requestedSubclassId: input.subclassId }
            : {}),
          isMulticlassDip: false,
        })
      : null;

    const supportByClass = Object.fromEntries(
      (classes as Array<{ id: string }>).map((classRow) => {
        const support = resolveNextLevelValidationContext({
          classId: classRow.id,
          currentClassLevel: 0,
          isMulticlassDip: false,
        });

        return [
          classRow.id,
          {
            ...support,
            multiclassPrerequisitesMet: null,
            multiclassPrerequisiteReason: null,
          },
        ] as const;
      }),
    );

    return {
      classes,
      feats,
      subclasses,
      timeline,
      nextLevel,
      supportByClass,
      selected: {
        classId: input.classId ?? null,
        subclassId: input.subclassId ?? null,
      },
    };
  }

  public async getSubclasses(
    _scope: ScopedContext,
    classId: string,
  ): Promise<unknown[]> {
    return listSubclassesForClass(classId)
      .map((subclass) => ({
        id: subclass.id,
        name: subclass.name,
        parentClassId: subclass.classId,
        sourceType: "core",
        ownerCharacterId: null,
        lore: toLore(`${subclass.name} subclass reference data.`),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  public async getClassTimeline(
    _scope: ScopedContext,
    classId: string,
    requestedSubclassId?: string,
  ): Promise<unknown[]> {
    const classDefinition = CLASS_DICTIONARY[classId];
    if (!classDefinition) {
      return [];
    }

    const validSubclass = requestedSubclassId
      ? SUBCLASS_DICTIONARY[requestedSubclassId]
      : undefined;
    const subclassIsForClass = validSubclass?.classId === classId;

    return Array.from({ length: 20 }, (_, index) => {
      const level = index + 1;

      const classTraits = classTraitIdsAtLevel(classId, level).map((traitId) =>
        toTraitRow(traitId, `Class: ${classDefinition.name}`),
      );

      const subclassTraits = subclassIsForClass
        ? subclassTraitIdsAtLevel(classId, requestedSubclassId, level).map(
            (traitId) => toTraitRow(traitId, `Subclass: ${validSubclass.name}`),
          )
        : [];

      return {
        level,
        scaling: null,
        spellcasting: null,
        features: [...classTraits, ...subclassTraits],
      };
    });
  }

  public async getBackgrounds(_scope: ScopedContext): Promise<unknown[]> {
    return Object.values(BACKGROUND_DICTIONARY)
      .map((background) => ({
        id: background.id,
        name: background.name,
        featureName: background.featureName,
        featureDescription: background.featureDescription,
        startingEquipment: background.startingEquipment,
        ideals: background.ideals,
        bonds: background.bonds,
        flaws: background.flaws,
        personalityTraits: background.personalityTraits,
        lore: background.lore,
        traits: background.backgroundTraitIds.map((traitId) =>
          toTraitRow(traitId, `Background: ${background.name}`),
        ),
        sourceType: "core",
        ownerCharacterId: null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  public async getTraits(
    _scope: ScopedContext,
    category?: TraitCategory,
  ): Promise<unknown[]> {
    const allTraits = Object.values(TRAIT_DICTIONARY).map((trait) =>
      toTraitRow(trait.id),
    );

    if (!category) {
      return allTraits;
    }

    return allTraits.filter((trait) =>
      hasTraitCategoryMatch(
        trait as {
          id: string;
          name: string;
        },
        category,
      ),
    );
  }

  public async getTraitById(
    _scope: ScopedContext,
    traitId: string,
  ): Promise<unknown | null> {
    if (!TRAIT_DICTIONARY[traitId]) {
      return null;
    }

    return toTraitRow(traitId);
  }

  public async getVersion(): Promise<{ version: number; loadedAt: number }> {
    return {
      version: STATIC_VERSION,
      loadedAt: STATIC_LOADED_AT,
    };
  }

  public async searchItems(input: {
    scope: ScopedContext;
    query: string;
    limit: number;
    offset: number;
  }): Promise<{ rows: unknown[]; total: number }> {
    const query = input.query.trim().toLowerCase();

    const all = Object.values(ITEM_DICTIONARY)
      .filter((item) =>
        query ? item.name.toLowerCase().includes(query) : true,
      )
      .map((item) => ({
        id: item.id,
        name: item.name,
        description: "",
        weight: Math.round(item.weight * 100),
        itemRule: item,
        weaponRule: WEAPON_DICTIONARY[item.id] ?? null,
        isBundle: false,
        sourceType: "core",
        ownerCharacterId: null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      rows: all.slice(input.offset, input.offset + input.limit),
      total: all.length,
    };
  }

  public async getRulesSnapshot(_scope: ScopedContext): Promise<{
    version: number;
    loadedAt: number;
    snapshot: any;
  }> {
    const parsedSnapshot = RuleSnapshotSchema.parse({
      equipmentById: EQUIPMENT_DICTIONARY,
      itemsById: ITEM_DICTIONARY,
      weaponsById: WEAPON_DICTIONARY,
      resourcesById: resolveResourceRules(),
      traitsById: {},
    });

    return {
      version: STATIC_VERSION,
      loadedAt: STATIC_LOADED_AT,
      snapshot: {
        equipmentById: parsedSnapshot.equipmentById,
        itemsById: parsedSnapshot.itemsById,
        weaponsById: parsedSnapshot.weaponsById,
        resourcesById: parsedSnapshot.resourcesById,
      },
    };
  }
}
