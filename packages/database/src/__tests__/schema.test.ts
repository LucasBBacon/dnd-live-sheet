import { describe, expect, it } from "vitest";
import {
  backgrounds,
  backgroundTraits,
  classes,
  classLevels,
  classProgressions,
  featTraits,
  feats,
  races,
  raceTraits,
  subraces,
  subclassLevels,
  subclassProgressions,
  traits,
} from "../schema/reference";

describe("database schema", () => {
  it("defines traits and feats with expected core fields", () => {
    expect(traits.id.primary).toBe(true);
    expect(traits.name.notNull).toBe(true);
    expect(traits.effects.dataType).toBe("json");
    expect(traits.sourceType.notNull).toBe(true);
    expect(traits.ownerCampaignId.notNull).toBe(false);
    expect(traits.ownerCharacterId.notNull).toBe(false);
    expect(traits.createdByUserId.notNull).toBe(false);
    expect(traits.isPublished.notNull).toBe(true);
    expect(traits.supersedesId.notNull).toBe(false);

    expect(feats.id.primary).toBe(true);
    expect(feats.name.notNull).toBe(true);
    expect(feats.category.notNull).toBe(true);
    expect(feats.prerequisites.dataType).toBe("json");
    expect(feats.sourceType.notNull).toBe(true);
    expect(feats.isPublished.notNull).toBe(true);
  });

  it("defines race/class/background base entities", () => {
    expect(races.id.primary).toBe(true);
    expect(races.name.notNull).toBe(true);
    expect(races.speed.notNull).toBe(true);
    expect(races.sourceType.notNull).toBe(true);
    expect(races.ownerCampaignId.notNull).toBe(false);

    expect(subraces.parentRaceId.notNull).toBe(true);
    expect(subraces.sourceType.notNull).toBe(true);
    expect(classes.hitDie.notNull).toBe(true);
    expect(classes.sourceType.notNull).toBe(true);
    expect(backgrounds.featureName.notNull).toBe(true);
    expect(backgrounds.featureDescription.notNull).toBe(true);
    expect(backgrounds.sourceType.notNull).toBe(true);
  });

  it("defines reference junction/progression tables", () => {
    expect(featTraits.featId.notNull).toBe(true);
    expect(featTraits.traitId.notNull).toBe(true);

    expect(raceTraits.raceId.notNull).toBe(true);
    expect(raceTraits.traitId.notNull).toBe(true);

    expect(classLevels.classId.notNull).toBe(true);
    expect(classLevels.level.notNull).toBe(true);

    expect(classProgressions.classId.notNull).toBe(true);
    expect(classProgressions.traitId.notNull).toBe(true);
    expect(classProgressions.sourceType.notNull).toBe(true);

    expect(subclassLevels.subclassId.notNull).toBe(true);
    expect(subclassProgressions.subclassId.notNull).toBe(true);
    expect(subclassProgressions.sourceType.notNull).toBe(true);

    expect(backgroundTraits.backgroundId.notNull).toBe(true);
    expect(backgroundTraits.traitId.notNull).toBe(true);
  });
});
