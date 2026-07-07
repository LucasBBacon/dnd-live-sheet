import { describe, expect, it } from "vitest";
import {
  EQUIPMENT_SLOTS,
  campaignMembers,
  campaigns,
  characterClasses,
  characterCustomTraits,
  characterInventory,
  characters,
} from "../schema/operational";

describe("operational schema", () => {
  it("defines core character fields and required constraints", () => {
    expect(Object.keys(characters)).toEqual(
      expect.arrayContaining([
        "id",
        "campaignId",
        "name",
        "raceId",
        "subraceId",
        "alignment",
        "backgroundId",
        "temporaryInventory",
      ]),
    );

    expect(characters.id.primary).toBe(true);
    expect(characters.campaignId.notNull).toBe(true);
    expect(characters.name.notNull).toBe(true);
    expect(characters.raceId.notNull).toBe(true);
    expect(characters.subraceId.notNull).toBe(true);
    expect(characters.customBackgroundData.dataType).toBe("json");
    expect(characters.temporaryInventory.dataType).toBe("json");
  });

  it("defines campaign and membership tables", () => {
    expect(campaigns.id.primary).toBe(true);
    expect(campaigns.name.notNull).toBe(true);
    expect(campaigns.createdByUserId.notNull).toBe(true);

    expect(campaignMembers.campaignId.notNull).toBe(true);
    expect(campaignMembers.userId.notNull).toBe(true);
    expect(campaignMembers.role.notNull).toBe(true);
  });

  it("defines class progression and custom traits tables", () => {
    expect(characterClasses.characterId.notNull).toBe(true);
    expect(characterClasses.classId.notNull).toBe(true);
    expect(characterClasses.classLevel.notNull).toBe(true);

    expect(characterCustomTraits.id.primary).toBe(true);
    expect(characterCustomTraits.characterId.notNull).toBe(true);
    expect(characterCustomTraits.traitId.notNull).toBe(true);
    expect(characterCustomTraits.sourceOrigin.notNull).toBe(true);
  });

  it("defines inventory table with defaults and constraints", () => {
    expect(characterInventory.id.notNull).toBe(true);
    expect(characterInventory.characterId.notNull).toBe(true);
    expect(characterInventory.itemId.notNull).toBe(true);
    expect(characterInventory.quantity.notNull).toBe(true);
    expect(characterInventory.quantity.default).toBe(1);
    expect(characterInventory.slot.default).toBe("backpack");
    expect(characterInventory.isAttuned.default).toBe(false);
  });

  it("exposes all supported equipment slots", () => {
    expect(EQUIPMENT_SLOTS).toEqual([
      "backpack",
      "main_hand",
      "off_hand",
      "armor",
      "head",
      "cloak",
      "ring_1",
      "ring_2",
      "amulet",
      "boots",
      "gloves",
    ]);
  });
});
