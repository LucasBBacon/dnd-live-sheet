import { describe, it, expect, vi } from "vitest";

// Helper functions from seed.ts (re-implemented for testing)
const normalizeSpeed = (speed: unknown): number => {
  if (typeof speed === "number") return speed;
  if (
    speed &&
    typeof speed === "object" &&
    "walk" in speed &&
    typeof (speed as { walk?: unknown }).walk === "number"
  ) {
    return (speed as { walk: number }).walk;
  }
  return 30;
};

const traitIdToName = (traitId: string): string =>
  traitId
    .replace(/^trait_/, "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const normalizeLore = (
  lore: unknown,
  fallbackName: string,
): { shortDescription: string; fullText?: string } => {
  if (
    lore &&
    typeof lore === "object" &&
    "shortDescription" in lore &&
    typeof (lore as { shortDescription?: unknown }).shortDescription ===
      "string"
  ) {
    return lore as { shortDescription: string; fullText?: string };
  }

  return {
    shortDescription: `${fallbackName} reference data.`,
    fullText: "",
  };
};

const normalizeMulticlassTraitIds = ({
  classId,
  multiclassTraits,
}: {
  classId: string;
  multiclassTraits: unknown;
}): string[] => {
  if (multiclassTraits === undefined) {
    throw new Error(
      `Core class ${classId} is missing required multiclassTraits field.`
    );
  }

  if (!Array.isArray(multiclassTraits)) {
    throw new Error(
      `Core class ${classId} is missing required multiclassTraits array.`
    );
  }

  if (
    multiclassTraits.some(
      (traitId) => typeof traitId !== "string" || traitId.trim().length === 0
    )
  ) {
    throw new Error(
      `Core class ${classId} has invalid multiclassTraits entries.`
    );
  }

  const traitIds = multiclassTraits.map((traitId) => traitId.trim());
  return [...new Set(traitIds)];
};

describe("Seed Helper Functions", () => {
  describe("normalizeSpeed", () => {
    it("should return speed if it's a number", () => {
      expect(normalizeSpeed(30)).toBe(30);
      expect(normalizeSpeed(60)).toBe(60);
      expect(normalizeSpeed(0)).toBe(0);
    });

    it("should extract walk speed from object", () => {
      expect(normalizeSpeed({ walk: 30 })).toBe(30);
      expect(normalizeSpeed({ walk: 60 })).toBe(60);
    });

    it("should ignore other movement types and use walk", () => {
      expect(normalizeSpeed({ walk: 30, swim: 60, fly: 0 })).toBe(30);
    });

    it("should return default 30 if walk is not a number in object", () => {
      expect(normalizeSpeed({ walk: "thirty" })).toBe(30);
      expect(normalizeSpeed({ walk: null })).toBe(30);
    });

    it("should return default 30 for invalid input", () => {
      expect(normalizeSpeed(null)).toBe(30);
      expect(normalizeSpeed(undefined)).toBe(30);
      expect(normalizeSpeed({})).toBe(30);
      expect(normalizeSpeed("30")).toBe(30);
      expect(normalizeSpeed([])).toBe(30);
    });

    it("should handle negative speeds", () => {
      expect(normalizeSpeed(-30)).toBe(-30);
      expect(normalizeSpeed({ walk: -10 })).toBe(-10);
    });

    it("should handle very large speeds", () => {
      expect(normalizeSpeed(999)).toBe(999);
      expect(normalizeSpeed({ walk: 1000 })).toBe(1000);
    });
  });

  describe("traitIdToName", () => {
    it("should convert trait ID to readable name", () => {
      expect(traitIdToName("trait_dwarf_speed")).toBe("Dwarf Speed");
      expect(traitIdToName("trait_elven_accuracy")).toBe("Elven Accuracy");
    });

    it("should handle single word trait IDs", () => {
      expect(traitIdToName("trait_darkvision")).toBe("Darkvision");
      expect(traitIdToName("trait_speed")).toBe("Speed");
    });

    it("should remove trait_ prefix", () => {
      expect(traitIdToName("trait_bold_test")).toContain("Bold");
      expect(traitIdToName("trait_bold_test")).not.toContain("trait_");
    });

    it("should capitalize each word", () => {
      expect(traitIdToName("trait_stone_cunning")).toBe("Stone Cunning");
      expect(traitIdToName("trait_extra_attack")).toBe("Extra Attack");
    });

    it("should handle empty segments", () => {
      expect(traitIdToName("trait__double__underscore")).toBe("Double Underscore");
      expect(traitIdToName("trait_")).toBe("");
    });

    it("should handle trait IDs without prefix", () => {
      const result = traitIdToName("dwarf_speed");
      expect(result).toBe("Dwarf Speed");
    });

    it("should handle complex multi-word traits", () => {
      expect(traitIdToName("trait_gnome_cunning_resistance")).toBe(
        "Gnome Cunning Resistance"
      );
    });
  });

  describe("normalizeLore", () => {
    it("should return lore object if valid", () => {
      const lore = { shortDescription: "A speed trait" };
      const result = normalizeLore(lore, "Speed");
      expect(result).toEqual(lore);
    });

    it("should preserve fullText if present", () => {
      const lore = {
        shortDescription: "A speed trait",
        fullText: "Detailed description",
      };
      const result = normalizeLore(lore, "Speed");
      expect(result).toEqual(lore);
    });

    it("should return fallback lore for null", () => {
      const result = normalizeLore(null, "Trait Name");
      expect(result.shortDescription).toBe("Trait Name reference data.");
      expect(result.fullText).toBe("");
    });

    it("should return fallback lore for undefined", () => {
      const result = normalizeLore(undefined, "Speed");
      expect(result.shortDescription).toBe("Speed reference data.");
    });

    it("should return fallback lore for non-object", () => {
      expect(normalizeLore("string", "Test").shortDescription).toBe(
        "Test reference data."
      );
      expect(normalizeLore(123, "Test").shortDescription).toBe(
        "Test reference data."
      );
    });

    it("should return fallback lore if shortDescription missing", () => {
      const lore = { fullText: "Details" };
      const result = normalizeLore(lore, "Trait");
      expect(result.shortDescription).toBe("Trait reference data.");
    });

    it("should return fallback lore if shortDescription not string", () => {
      const lore = { shortDescription: 123 };
      const result = normalizeLore(lore, "Ability");
      expect(result.shortDescription).toBe("Ability reference data.");
    });

    it("should preserve additional properties beyond shortDescription", () => {
      const lore = {
        shortDescription: "Speed trait",
        fullText: "Full details",
        extra: "ignored",
      };
      const result = normalizeLore(lore, "Speed");
      // Should have shortDescription and fullText but may or may not have extra
      expect(result.shortDescription).toBe("Speed trait");
      expect(result.fullText).toBe("Full details");
    });

    it("should handle empty fallback name", () => {
      const result = normalizeLore(null, "");
      expect(result.shortDescription).toBe(" reference data.");
    });
  });

  describe("seed data transformation edge cases", () => {
    it("should handle trait arrays with mixed types", () => {
      const traitIds: any[] = ["trait_one", null, "trait_two", undefined];
      const filtered = traitIds.filter(
        (id): id is string => typeof id === "string"
      );
      expect(filtered).toHaveLength(2);
      expect(filtered).toEqual(["trait_one", "trait_two"]);
    });

    it("should handle empty arrays", () => {
      const empty: string[] = [];
      expect(empty).toHaveLength(0);
      empty.forEach((trait) => {
        expect(trait).toBeDefined();
      });
    });

    it("should normalize race data correctly", () => {
      const rawRace = {
        id: "race_dwarf",
        name: "Dwarf",
        speed: { walk: 25 },
        subraceInfo: { displayLabel: "Subrace" },
      };

      const normalized = {
        id: rawRace.id,
        name: rawRace.name,
        speed: normalizeSpeed(rawRace.speed),
        requiresSubrace: !!rawRace.subraceInfo,
        displayLabel: rawRace.subraceInfo?.displayLabel ?? "",
      };

      expect(normalized.speed).toBe(25);
      expect(normalized.requiresSubrace).toBe(true);
      expect(normalized.displayLabel).toBe("Subrace");
    });

    it("should handle race without subraceInfo", () => {
      const rawRace = {
        id: "race_human",
        name: "Human",
        speed: 30,
      };

      const normalized = {
        id: rawRace.id,
        name: rawRace.name,
        speed: normalizeSpeed(rawRace.speed),
        requiresSubrace: !!rawRace.subraceInfo,
        displayLabel: rawRace.subraceInfo?.displayLabel ?? "",
      };

      expect(normalized.requiresSubrace).toBe(false);
      expect(normalized.displayLabel).toBe("");
    });

    it("should filter out null/undefined from trait references", () => {
      const feat = {
        id: "feat_test",
        grantedTraits: ["trait_one", null, "trait_two", undefined],
      };

      const validTraits = (feat.grantedTraits || []).filter(
        (t): t is string => typeof t === "string"
      );
      expect(validTraits).toEqual(["trait_one", "trait_two"]);
    });

    it("should handle missing arrays gracefully", () => {
      const race = { id: "race_test", name: "Test" };
      const traits = (race as any).traits || [];
      expect(traits).toEqual([]);
    });

    it("should create placeholder traits for missing referenced traits", () => {
      const referencedTraitIds = new Set(["trait_missing", "trait_also_missing"]);
      const knownTraitIds = new Set<string>();

      const missingTraits = [...referencedTraitIds]
        .filter((traitId) => !knownTraitIds.has(traitId))
        .map((traitId) => ({
          id: traitId,
          name: traitIdToName(traitId),
          lore: {
            shortDescription:
              "Auto-generated placeholder trait from source references.",
          },
          effects: [],
          isStartingProficiency: false,
        }));

      expect(missingTraits).toHaveLength(2);
      expect(missingTraits[0].name).toBe("Missing");
      expect(missingTraits[0].lore.shortDescription).toContain(
        "Auto-generated"
      );
    });

    it("fails when multiclassTraits field is missing", () => {
      expect(() =>
        normalizeMulticlassTraitIds({
          classId: "class_fighter",
          multiclassTraits: undefined,
        })
      ).toThrow("missing required multiclassTraits field");
    });

    it("fails when multiclassTraits contains invalid entries", () => {
      expect(() =>
        normalizeMulticlassTraitIds({
          classId: "class_fighter",
          multiclassTraits: ["trait_ok", "   ", null],
        })
      ).toThrow("invalid multiclassTraits entries");
    });

    it("allows explicit empty multiclassTraits arrays", () => {
      expect(
        normalizeMulticlassTraitIds({
          classId: "class_sorcerer",
          multiclassTraits: [],
        })
      ).toEqual([]);
    });

    it("normalizes and de-duplicates multiclass trait ids", () => {
      expect(
        normalizeMulticlassTraitIds({
          classId: "class_fighter",
          multiclassTraits: [
            " trait_fighter_mult_prof_armor ",
            "trait_fighter_mult_prof_armor",
            "trait_fighter_mult_prof_weapons",
          ],
        })
      ).toEqual([
        "trait_fighter_mult_prof_armor",
        "trait_fighter_mult_prof_weapons",
      ]);
    });
  });
});
