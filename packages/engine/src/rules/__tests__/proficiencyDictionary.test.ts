import { describe, expect, it } from "vitest";
import { listProficiencyOptions, TOOL_DICTIONARY } from "../proficiencyDictionary.js";

describe("TOOL_DICTIONARY", () => {
  it("carries the full PHB list, not only what the pack happens to grant", () => {
    expect(Object.keys(TOOL_DICTIONARY)).toHaveLength(39);
  });

  it("keys every entry by its own id", () => {
    for (const [key, entry] of Object.entries(TOOL_DICTIONARY)) {
      expect(entry.id).toBe(key);
    }
  });

  it("names the artisan's tools the pack already references", () => {
    expect(TOOL_DICTIONARY.smiths_tools?.name).toBe("Smith's Tools");
    expect(TOOL_DICTIONARY.masons_tools?.name).toBe("Mason's Tools");
    expect(TOOL_DICTIONARY.tinkers_tools?.name).toBe("Tinker's Tools");
    expect(TOOL_DICTIONARY.brewers_supplies?.name).toBe("Brewer's Supplies");
  });

  it("holds no category ids, only specific tools", () => {
    // "artisan's tools" is a choice block's option list, never a proficiency
    expect(TOOL_DICTIONARY.artisans_tools).toBeUndefined();
    expect(TOOL_DICTIONARY.gaming_set).toBeUndefined();
    expect(TOOL_DICTIONARY.musical_instrument).toBeUndefined();
  });
});

describe("listProficiencyOptions", () => {
  it("answers for tools now that they have a roster", () => {
    const options = listProficiencyOptions("tools");

    expect(options).toContain("thieves_tools");
    expect(options).toContain("herbalism_kit");
    expect(options).toHaveLength(39);
  });

  it("still answers for languages and skills", () => {
    expect(listProficiencyOptions("languages")).toContain("dwarvish");
    expect(listProficiencyOptions("skills")).toContain("stealth");
  });

  it("returns undefined for a category with no roster", () => {
    expect(listProficiencyOptions("weapons")).toBeUndefined();
    expect(listProficiencyOptions("armor")).toBeUndefined();
    expect(listProficiencyOptions("ability_check")).toBeUndefined();
  });
});
