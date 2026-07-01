import { describe, expect, it } from "vitest";
import { characters } from "../schema";
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
  it("defines character table with expected columns and nullability", () => {
    expect(Object.keys(characters)).toEqual(
      expect.arrayContaining([
        "id",
        "userId",
        "totalLevel",
        "currentHp",
        "engineData",
        "flavorData",
        "createdAt",
        "updatedAt",
        "deletedAt",
      ]),
    );

    expect(characters.id.primary).toBe(true);
    expect(characters.userId.notNull).toBe(true);
    expect(characters.engineData.dataType).toBe("json");
    expect(characters.flavorData.dataType).toBe("json");
    expect(characters.deletedAt.notNull).toBe(false);
  });

  it("defines traits and feats with expected core fields", () => {
    expect(traits.id.primary).toBe(true);
    expect(traits.name.notNull).toBe(true);
    expect(traits.effects.dataType).toBe("json");

    expect(feats.id.primary).toBe(true);
    expect(feats.name.notNull).toBe(true);
    expect(feats.category.notNull).toBe(true);
    expect(feats.prerequisites.dataType).toBe("json");
  });

  it("defines race/class/background base entities", () => {
    expect(races.id.primary).toBe(true);
    expect(races.name.notNull).toBe(true);
    expect(races.speed.notNull).toBe(true);

    expect(subraces.parentRaceId.notNull).toBe(true);
    expect(classes.hitDie.notNull).toBe(true);
    expect(backgrounds.featureName.notNull).toBe(true);
    expect(backgrounds.featureDescription.notNull).toBe(true);
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

    expect(subclassLevels.subclassId.notNull).toBe(true);
    expect(subclassProgressions.subclassId.notNull).toBe(true);

    expect(backgroundTraits.backgroundId.notNull).toBe(true);
    expect(backgroundTraits.traitId.notNull).toBe(true);
  });
});
