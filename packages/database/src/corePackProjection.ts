import {
  ItemDefinitionSchema,
  WeaponDefinitionSchema,
  type CoreRulePack,
  type ItemDefinition,
  type WeaponDefinition,
} from "@project/shared";

type CorePackItemRow = {
  id: string;
  name: string;
  weight: number;
  description: string;
  isBundle: boolean;
  itemRule: ItemDefinition;
  weaponRule?: WeaponDefinition | undefined;
};

type Lore = { shortDescription: string; fullText?: string };

const toLore = (
  // races and subraces carry lore optionally while the packs are being filled
  // in, so the projection has to survive its absence rather than assume it
  lore: { shortDescription: string; fullText?: string | undefined } | undefined,
): Lore => {
  if (lore === undefined) return { shortDescription: "" };

  return lore.fullText === undefined
    ? { shortDescription: lore.shortDescription }
    : { shortDescription: lore.shortDescription, fullText: lore.fullText };
};

export type CoreRulePackProjection = {
  corePack: CoreRulePack;
  traits: Array<{
    id: string;
    name: string;
    lore: Lore;
    effects: never[];
    isStartingProficiency: boolean;
  }>;
  feats: Array<{
    id: string;
    name: string;
    category: string;
    source?: string;
    repeatable: boolean;
    lore: Lore;
    prerequisites?: CoreRulePack["feats"][number]["prerequisites"];
  }>;
  featTraits: Array<{ featId: string; traitId: string }>;
  featPrerequisiteFeats: Array<{ featId: string; requiredFeatId: string }>;
  races: Array<{
    id: string;
    name: string;
    speed: number;
    requiresSubrace: boolean;
    displayLabel: string;
    lore: Lore;
  }>;
  raceTraits: Array<{ raceId: string; traitId: string }>;
  subraces: Array<{
    id: string;
    parentRaceId: string;
    name: string;
    lore: Lore;
  }>;
  subraceTraits: Array<{ subraceId: string; traitId: string }>;
  classes: Array<{
    id: string;
    name: string;
    hitDie: number;
    subclassRequirementLevel: number;
    startingEquipment: CoreRulePack["classes"][number]["startingEquipment"];
    multiclassPrerequisites?: CoreRulePack["classes"][number]["multiclassPrerequisites"];
    lore: Lore;
  }>;
  classMulticlassTraits: Array<{ classId: string; traitId: string }>;
  classLevels: Array<{ classId: string; level: number }>;
  classProgressions: Array<{ classId: string; level: number; traitId: string }>;
  subclasses: Array<{
    id: string;
    parentClassId: string;
    name: string;
    lore: Lore;
  }>;
  subclassLevels: Array<{ subclassId: string; level: number }>;
  subclassProgressions: Array<{
    subclassId: string;
    level: number;
    traitId: string;
  }>;
  backgrounds: CoreRulePack["backgrounds"];
  backgroundTraits: Array<{ backgroundId: string; traitId: string }>;
  items: CorePackItemRow[];
  bundleContents: Array<{ bundleId: string; itemId: string; quantity: number }>;
};

const toItemRule = (
  equipment: CoreRulePack["equipment"][number],
): ItemDefinition => {
  const {
    lore: _lore,
    isBundle: _isBundle,
    bundleContents: _bundleContents,
    weapon: _weapon,
    ...item
  } = equipment;
  return ItemDefinitionSchema.parse(item);
};

const toWeaponRule = (
  equipment: CoreRulePack["equipment"][number],
): WeaponDefinition | undefined =>
  equipment.weapon
    ? WeaponDefinitionSchema.parse({
        id: equipment.id,
        name: equipment.name,
        ...equipment.weapon,
      })
    : undefined;

const traitGrantsAtLevel = (
  grants: CoreRulePack["classes"][number]["progression"][number]["grants"],
): string[] =>
  grants.filter((grant): grant is string => typeof grant === "string");

export const projectCoreRulePack = (
  corePack: CoreRulePack,
): CoreRulePackProjection => ({
  corePack,
  traits: corePack.traits.map((trait) => ({
    id: trait.id,
    name: trait.name,
    lore: toLore(trait.lore),
    // The complete trait AST stays in corePack. The legacy relation table only
    // has an effects column until the Phase 3 snapshot reader consumes it.
    effects: [],
    isStartingProficiency: trait.isStartingProficiency,
  })),
  feats: corePack.feats.map((feat) => ({
    id: feat.id,
    name: feat.name,
    category: feat.category,
    ...(feat.source === undefined ? {} : { source: feat.source }),
    repeatable: feat.repeatable,
    lore: toLore(feat.lore),
    ...(feat.prerequisites === undefined
      ? {}
      : { prerequisites: feat.prerequisites }),
  })),
  featTraits: corePack.feats.flatMap((feat) =>
    feat.grantedTraitIds.map((traitId) => ({ featId: feat.id, traitId })),
  ),
  featPrerequisiteFeats: corePack.feats.flatMap((feat) =>
    (feat.prerequisites?.requiredFeatIds ?? []).map((requiredFeatId) => ({
      featId: feat.id,
      requiredFeatId,
    })),
  ),
  races: corePack.races.map((race) => ({
    id: race.id,
    name: race.name,
    speed: race.speed,
    requiresSubrace: race.hasSubraces,
    displayLabel: race.hasSubraces ? "Subrace" : "Lineage",
    lore: toLore(race.lore),
  })),
  raceTraits: corePack.races.flatMap((race) =>
    race.grantedTraitIds.map((traitId) => ({ raceId: race.id, traitId })),
  ),
  subraces: corePack.races.flatMap((race) =>
    Object.values(race.subraces).map((subrace) => ({
      id: subrace.id,
      parentRaceId: race.id,
      name: subrace.name,
      lore: toLore(subrace.lore),
    })),
  ),
  subraceTraits: corePack.races.flatMap((race) =>
    Object.values(race.subraces).flatMap((subrace) =>
      subrace.grantedTraitIds.map((traitId) => ({
        subraceId: subrace.id,
        traitId,
      })),
    ),
  ),
  classes: corePack.classes.map((entry) => ({
    id: entry.id,
    name: entry.name,
    hitDie: entry.hitDie,
    subclassRequirementLevel: entry.subclassUnlockLevel,
    startingEquipment: entry.startingEquipment,
    ...(entry.multiclassPrerequisites === undefined
      ? {}
      : { multiclassPrerequisites: entry.multiclassPrerequisites }),
    lore: toLore(entry.lore),
  })),
  classMulticlassTraits: corePack.classes.flatMap((entry) =>
    entry.multiclassTraitIds.map((traitId) => ({ classId: entry.id, traitId })),
  ),
  classLevels: corePack.classes.flatMap((entry) =>
    entry.progression.map((level) => ({
      classId: entry.id,
      level: level.level,
    })),
  ),
  classProgressions: corePack.classes.flatMap((entry) =>
    entry.progression.flatMap((level) =>
      traitGrantsAtLevel(level.grants).map((traitId) => ({
        classId: entry.id,
        level: level.level,
        traitId,
      })),
    ),
  ),
  subclasses: corePack.subclasses.map((entry) => ({
    id: entry.id,
    parentClassId: entry.classId,
    name: entry.name,
    lore: toLore(entry.lore),
  })),
  subclassLevels: corePack.subclasses.flatMap((entry) =>
    entry.progression.map((level) => ({
      subclassId: entry.id,
      level: level.level,
    })),
  ),
  subclassProgressions: corePack.subclasses.flatMap((entry) =>
    entry.progression.flatMap((level) =>
      traitGrantsAtLevel(level.grants).map((traitId) => ({
        subclassId: entry.id,
        level: level.level,
        traitId,
      })),
    ),
  ),
  backgrounds: corePack.backgrounds,
  backgroundTraits: corePack.backgrounds.flatMap((background) =>
    background.backgroundTraitIds.map((traitId) => ({
      backgroundId: background.id,
      traitId,
    })),
  ),
  items: corePack.equipment.map((equipment) => ({
    id: equipment.id,
    name: equipment.name,
    weight: Math.round(equipment.weight * 100),
    description: equipment.lore.fullText ?? equipment.lore.shortDescription,
    isBundle: equipment.isBundle,
    itemRule: toItemRule(equipment),
    ...(toWeaponRule(equipment) === undefined
      ? {}
      : { weaponRule: toWeaponRule(equipment) }),
  })),
  bundleContents: corePack.equipment.flatMap((equipment) =>
    equipment.bundleContents.map((content) => ({
      bundleId: equipment.id,
      itemId: content.itemId,
      quantity: content.quantity,
    })),
  ),
});
