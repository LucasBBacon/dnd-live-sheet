import { describe, it, expect, beforeEach } from "vitest";
import { useWizardStore } from "../wizardStore";

describe("Wizard Store State Management", () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useWizardStore.setState({
      currentStep: 5,
      targetLevel: 1,
      characterName: "",
      raceId: null,
      subraceId: null,
      classId: null,
      subclassId: null,
      raceRequiresSubrace: false,
      classSubclassReqLevel: null,
      alignment: "",
      backgroundType: null,
      backgroundId: null,
      customBackground: {
        name: "",
        featureName: "",
        featureDescription: "",
        skillTraitIds: [],
        toolLanguageTraitIds: [],
      },
      personality: {
        traits: "",
        ideals: "",
        bonds: "",
        flaws: "",
      },
    });
  });

  describe("character name", () => {
    it("should set character name", () => {
      useWizardStore.getState().setName("Aragorn");
      expect(useWizardStore.getState().characterName).toBe("Aragorn");
    });

    it("should allow empty name initially", () => {
      expect(useWizardStore.getState().characterName).toBe("");
    });

    it("should allow special characters in name", () => {
      useWizardStore.getState().setName("Ar'thas D'vorn");
      expect(useWizardStore.getState().characterName).toBe("Ar'thas D'vorn");
    });

    it("should allow very long names", () => {
      const longName = "A".repeat(100);
      useWizardStore.getState().setName(longName);
      expect(useWizardStore.getState().characterName).toBe(longName);
    });
  });

  describe("race selection", () => {
    it("should set race without subrace requirement", () => {
      useWizardStore.getState().setRace("human", false);
      expect(useWizardStore.getState().raceId).toBe("human");
      expect(useWizardStore.getState().raceRequiresSubrace).toBe(false);
    });

    it("should set race with subrace requirement", () => {
      useWizardStore.getState().setRace("elf", true);
      expect(useWizardStore.getState().raceId).toBe("elf");
      expect(useWizardStore.getState().raceRequiresSubrace).toBe(true);
    });

    it("should clear subrace when changing race", () => {
      useWizardStore.getState().setSubrace("high_elf");
      expect(useWizardStore.getState().subraceId).toBe("high_elf");

      useWizardStore.getState().setRace("dwarf", false);
      expect(useWizardStore.getState().subraceId).toBeNull();
    });

    it("should set subrace when required", () => {
      useWizardStore.getState().setRace("elf", true);
      useWizardStore.getState().setSubrace("wood_elf");
      expect(useWizardStore.getState().subraceId).toBe("wood_elf");
    });
  });

  describe("class selection", () => {
    it("should set class without subclass requirement", () => {
      useWizardStore.getState().setClass("barbarian", 20);
      expect(useWizardStore.getState().classId).toBe("barbarian");
      expect(useWizardStore.getState().classSubclassReqLevel).toBe(20);
    });

    it("should set class with subclass requirement", () => {
      useWizardStore.getState().setClass("fighter", 3);
      expect(useWizardStore.getState().classId).toBe("fighter");
      expect(useWizardStore.getState().classSubclassReqLevel).toBe(3);
    });

    it("should clear subclass when changing class", () => {
      useWizardStore.getState().setClass("fighter", 3);
      useWizardStore.getState().setSubclass("champion");
      expect(useWizardStore.getState().subclassId).toBe("champion");

      useWizardStore.getState().setClass("rogue", 3);
      expect(useWizardStore.getState().subclassId).toBeNull();
    });

    it("should set subclass when available", () => {
      useWizardStore.getState().setClass("wizard", 2);
      useWizardStore.getState().setSubclass("evocation");
      expect(useWizardStore.getState().subclassId).toBe("evocation");
    });
  });

  describe("ability scores", () => {
    it("should set individual ability score", () => {
      useWizardStore.getState().setBaseAbilityScore("STR", 15);
      expect(useWizardStore.getState().baseAbilityScores.str).toBe(15);
    });

    it("should preserve other scores when updating one", () => {
      useWizardStore.getState().setBaseAbilityScore("STR", 15);
      useWizardStore.getState().setBaseAbilityScore("DEX", 14);
      expect(useWizardStore.getState().baseAbilityScores).toEqual({
        str: 15,
        dex: 14,
        con: 8,
        int: 8,
        wis: 8,
        cha: 8,
      });
    });

    it("should set all ability scores at once", () => {
      const scores = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
      useWizardStore.getState().setAllAbilityScores(scores);
      expect(useWizardStore.getState().baseAbilityScores).toEqual(scores);
    });

    it("should handle minimum ability scores", () => {
      useWizardStore.getState().setBaseAbilityScore("STR", 3);
      expect(useWizardStore.getState().baseAbilityScores.str).toBe(3);
    });

    it("should handle maximum ability scores", () => {
      useWizardStore.getState().setBaseAbilityScore("STR", 18);
      expect(useWizardStore.getState().baseAbilityScores.str).toBe(18);
    });

    it("should allow negative ability scores in state", () => {
      useWizardStore.getState().setBaseAbilityScore("STR", -1);
      expect(useWizardStore.getState().baseAbilityScores.str).toBe(-1);
    });
  });

  describe("generation method", () => {
    it("should set generation method", () => {
      useWizardStore.getState().setGenerationMethod("POINT_BUY");
      expect(useWizardStore.getState().generationMethod).toBe("POINT_BUY");
    });

    it("should reset ability scores when changing method", () => {
      useWizardStore.getState().setAllAbilityScores({
        str: 15,
        dex: 14,
        con: 13,
        int: 12,
        wis: 10,
        cha: 8,
      });
      useWizardStore.getState().setGenerationMethod("MANUAL");
      expect(useWizardStore.getState().baseAbilityScores).toEqual({
        str: 8,
        dex: 8,
        con: 8,
        int: 8,
        wis: 8,
        cha: 8,
      });
    });

    it("should support all generation methods", () => {
      const methods: Array<"STANDARD_ARRAY" | "POINT_BUY" | "MANUAL"> = [
        "STANDARD_ARRAY",
        "POINT_BUY",
        "MANUAL",
      ];
      methods.forEach((method) => {
        useWizardStore.getState().setGenerationMethod(method);
        expect(useWizardStore.getState().generationMethod).toBe(method);
      });
    });
  });

  describe("alignment", () => {
    it("should set alignment", () => {
      useWizardStore.getState().setAlignment("Lawful Good");
      expect(useWizardStore.getState().alignment).toBe("Lawful Good");
    });

    it("should allow any alignment string", () => {
      const alignments = [
        "Lawful Good",
        "Neutral Good",
        "Chaotic Good",
        "Chaotic Evil",
        "Custom Alignment",
      ];
      alignments.forEach((alignment) => {
        useWizardStore.getState().setAlignment(alignment);
        expect(useWizardStore.getState().alignment).toBe(alignment);
      });
    });

    it("should allow empty alignment", () => {
      useWizardStore.getState().setAlignment("");
      expect(useWizardStore.getState().alignment).toBe("");
    });
  });

  describe("background selection", () => {
    it("should set background to PRESET mode", () => {
      useWizardStore.getState().setBackgroundMode("PRESET");
      expect(useWizardStore.getState().backgroundType).toBe("PRESET");
    });

    it("should set background to CUSTOM mode", () => {
      useWizardStore.getState().setBackgroundMode("CUSTOM");
      expect(useWizardStore.getState().backgroundType).toBe("CUSTOM");
    });

    it("should clear background ID when switching modes", () => {
      useWizardStore.getState().setPresetBackground("soldier");
      expect(useWizardStore.getState().backgroundId).toBe("soldier");

      useWizardStore.getState().setBackgroundMode("CUSTOM");
      expect(useWizardStore.getState().backgroundId).toBeNull();
    });

    it("should set preset background ID", () => {
      useWizardStore.getState().setPresetBackground("criminal");
      expect(useWizardStore.getState().backgroundId).toBe("criminal");
    });

    it("should update custom background data", () => {
      const customBg = {
        name: "Noble",
        featureName: "Position of Privilege",
        featureDescription: "Thanks to your noble birth",
        skillTraitIds: ["insight"],
        toolLanguageTraitIds: ["noble"],
      };
      useWizardStore.getState().updateCustomBackground(customBg);
      expect(useWizardStore.getState().customBackground).toEqual(customBg);
    });

    it("should partially update custom background", () => {
      useWizardStore.getState().updateCustomBackground({ name: "Noble" });
      expect(useWizardStore.getState().customBackground.name).toBe("Noble");
      expect(useWizardStore.getState().customBackground.featureName).toBe("");
    });
  });

  describe("personality", () => {
    it("should update personality trait", () => {
      useWizardStore.getState().updatePersonality("traits", "Bold and courageous");
      expect(useWizardStore.getState().personality.traits).toBe("Bold and courageous");
    });

    it("should update personality ideal", () => {
      useWizardStore.getState().updatePersonality("ideals", "Justice above all");
      expect(useWizardStore.getState().personality.ideals).toBe("Justice above all");
    });

    it("should update personality bond", () => {
      useWizardStore.getState().updatePersonality("bonds", "Loyal to friends");
      expect(useWizardStore.getState().personality.bonds).toBe("Loyal to friends");
    });

    it("should update personality flaw", () => {
      useWizardStore.getState().updatePersonality("flaws", "Overly ambitious");
      expect(useWizardStore.getState().personality.flaws).toBe("Overly ambitious");
    });

    it("should preserve other personality fields", () => {
      useWizardStore.getState().updatePersonality("traits", "Bold");
      useWizardStore.getState().updatePersonality("ideals", "Justice");
      expect(useWizardStore.getState().personality.traits).toBe("Bold");
      expect(useWizardStore.getState().personality.ideals).toBe("Justice");
      expect(useWizardStore.getState().personality.bonds).toBe("");
    });
  });

  describe("step progression", () => {
    it("should set current step", () => {
      useWizardStore.getState().setStep(2);
      expect(useWizardStore.getState().currentStep).toBe(2);
    });

    it("should allow step 1", () => {
      useWizardStore.getState().setStep(1);
      expect(useWizardStore.getState().currentStep).toBe(1);
    });

    it("should allow step 5", () => {
      useWizardStore.getState().setStep(5);
      expect(useWizardStore.getState().currentStep).toBe(5);
    });
  });

  describe("canProceed validation", () => {
    it("should allow step 1 with valid character name", () => {
      useWizardStore.getState().setStep(1);
      useWizardStore.getState().setName("Aragorn");
      expect(useWizardStore.getState().canProceed()).toBe(true);
    });

    it("should block step 1 without character name", () => {
      useWizardStore.getState().setStep(1);
      useWizardStore.getState().setName("");
      expect(useWizardStore.getState().canProceed()).toBe(false);
    });

    it("should block step 1 with whitespace-only name", () => {
      useWizardStore.getState().setStep(1);
      useWizardStore.getState().setName("   ");
      expect(useWizardStore.getState().canProceed()).toBe(false);
    });

    it("should allow step 2 with race selection", () => {
      useWizardStore.getState().setStep(2);
      useWizardStore.getState().setRace("human", false);
      expect(useWizardStore.getState().canProceed()).toBe(true);
    });

    it("should block step 2 without race", () => {
      useWizardStore.getState().setStep(2);
      expect(useWizardStore.getState().canProceed()).toBe(false);
    });

    it("should block step 2 when subrace required but not selected", () => {
      useWizardStore.getState().setStep(2);
      useWizardStore.getState().setRace("elf", true);
      expect(useWizardStore.getState().canProceed()).toBe(false);
    });

    it("should allow step 2 when subrace required and selected", () => {
      useWizardStore.getState().setStep(2);
      useWizardStore.getState().setRace("elf", true);
      useWizardStore.getState().setSubrace("high_elf");
      expect(useWizardStore.getState().canProceed()).toBe(true);
    });

    it("should allow step 3 with class selection", () => {
      useWizardStore.getState().setStep(3);
      useWizardStore.getState().setClass("fighter", 20);
      expect(useWizardStore.getState().canProceed()).toBe(true);
    });

    it("should block step 3 without class", () => {
      useWizardStore.getState().setStep(3);
      expect(useWizardStore.getState().canProceed()).toBe(false);
    });

    it("should block step 3 when subclass required but not selected", () => {
      useWizardStore.getState().setStep(3);
      useWizardStore.getState().setClass("fighter", 3);
      useWizardStore.getState()["targetLevel"] = 5;
      expect(useWizardStore.getState().canProceed()).toBe(false);
    });

    it("should allow step 3 when subclass required and selected", () => {
      useWizardStore.getState().setStep(3);
      useWizardStore.getState().setClass("fighter", 3);
      useWizardStore.getState()["targetLevel"] = 5;
      useWizardStore.getState().setSubclass("champion");
      expect(useWizardStore.getState().canProceed()).toBe(true);
    });

    it("should allow step 4 with valid ability scores", () => {
      useWizardStore.getState().setStep(4);
      useWizardStore.getState().setAllAbilityScores({
        str: 15,
        dex: 14,
        con: 13,
        int: 12,
        wis: 10,
        cha: 8,
      });
      expect(useWizardStore.getState().canProceed()).toBe(true);
    });

    it("should block step 4 with score below 3", () => {
      useWizardStore.getState().setStep(4);
      useWizardStore.getState().setBaseAbilityScore("STR", 2);
      expect(useWizardStore.getState().canProceed()).toBe(false);
    });

    it("should block step 4 with score above 18", () => {
      useWizardStore.getState().setStep(4);
      useWizardStore.getState().setBaseAbilityScore("STR", 19);
      expect(useWizardStore.getState().canProceed()).toBe(false);
    });

    it("should allow step 5 with valid background", () => {
      useWizardStore.getState().setStep(5);
      useWizardStore.getState().setAlignment("Lawful Good");
      useWizardStore.getState().setBackgroundMode("PRESET");
      useWizardStore.getState().setPresetBackground("soldier");
      expect(useWizardStore.getState().canProceed()).toBe(true);
    });

    it("should block step 5 without alignment", () => {
      useWizardStore.getState().setStep(5);
      useWizardStore.getState().setBackgroundMode("PRESET");
      useWizardStore.getState().setPresetBackground("soldier");
      expect(useWizardStore.getState().canProceed()).toBe(false);
    });

    it("should block step 5 without background type", () => {
      useWizardStore.getState().setStep(5);
      useWizardStore.getState().setAlignment("Lawful Good");
      expect(useWizardStore.getState().canProceed()).toBe(false);
    });

    it("should block step 5 with PRESET mode but no preset selected", () => {
      useWizardStore.getState().setStep(5);
      useWizardStore.getState().setAlignment("Lawful Good");
      useWizardStore.getState().setBackgroundMode("PRESET");
      expect(useWizardStore.getState().canProceed()).toBe(false);
    });

    it("should block step 5 with CUSTOM mode without required fields", () => {
      useWizardStore.getState().setStep(5);
      useWizardStore.getState().setAlignment("Lawful Good");
      useWizardStore.getState().setBackgroundMode("CUSTOM");
      expect(useWizardStore.getState().canProceed()).toBe(false);
    });

    it("should block step 5 with CUSTOM background without skills", () => {
      useWizardStore.getState().setStep(5);
      useWizardStore.getState().setAlignment("Lawful Good");
      useWizardStore.getState().setBackgroundMode("CUSTOM");
      useWizardStore.getState().updateCustomBackground({
        name: "Noble",
        featureName: "Privilege",
        featureDescription: "Thanks",
        skillTraitIds: ["one"],
        toolLanguageTraitIds: [],
      });
      expect(useWizardStore.getState().canProceed()).toBe(false);
    });

    it("should allow step 5 with valid CUSTOM background", () => {
      useWizardStore.getState().setStep(5);
      useWizardStore.getState().setAlignment("Lawful Good");
      useWizardStore.getState().setBackgroundMode("CUSTOM");
      useWizardStore.getState().updateCustomBackground({
        name: "Noble",
        featureName: "Privilege",
        featureDescription: "Thanks",
        skillTraitIds: ["insight", "deception"],
        toolLanguageTraitIds: ["noble", "merchant"],
      });
      expect(useWizardStore.getState().canProceed()).toBe(true);
    });

    it("should block unknown step", () => {
      useWizardStore.getState().setStep(99);
      expect(useWizardStore.getState().canProceed()).toBe(false);
    });
  });
});
