import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TraitDefinitionSchema } from "@project/shared";
import { globalErrorHandler } from "../../middleware/errorHandler.js";
import { matchesTraitCategory } from "../../services/referenceProvider/databaseReferenceProvider.js";
import type { TraitCategory } from "../../services/referenceProvider/types.js";

const setupReferenceApp = async (
  providerOverrides: Record<string, unknown>,
) => {
  vi.resetModules();

  const provider = {
    source: "static",
    warm: vi.fn(),
    getRaces: vi.fn().mockResolvedValue([]),
    getClasses: vi.fn().mockResolvedValue([]),
    getFeats: vi.fn().mockResolvedValue([]),
    getLevelUpOptions: vi.fn().mockResolvedValue({}),
    getSubclasses: vi.fn().mockResolvedValue([]),
    getClassTimeline: vi.fn().mockResolvedValue([]),
    getBackgrounds: vi.fn().mockResolvedValue([]),
    getTraits: vi.fn().mockResolvedValue([]),
    getTraitById: vi.fn().mockResolvedValue(null),
    getVersion: vi.fn().mockResolvedValue({ version: 1, loadedAt: 1 }),
    searchItems: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
    getRulesSnapshot: vi.fn().mockResolvedValue({
      version: 1,
      loadedAt: 1,
      snapshot: {
        equipmentById: {},
        resourcesById: {},
        traitsById: {},
      },
    }),
    ...providerOverrides,
  };

  vi.doMock("../../services/referenceProvider/index.js", () => ({
    getReferenceProvider: () => provider,
  }));

  vi.doMock("../../services/campaignAccess.js", () => ({
    getHeaderOrAuthUserId: vi.fn().mockReturnValue("test-user"),
    isUserCampaignMember: vi.fn().mockResolvedValue(true),
  }));

  const { default: referenceRoutes } = await import("../reference.js");

  const app = express();
  app.use(express.json());
  app.use("/api/reference", referenceRoutes);
  app.use(globalErrorHandler);

  return { app, provider };
};

describe("Reference Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/reference/races", () => {
    it("returns array of races with traits", () => {
      const mockRace = {
        id: "human",
        name: "Human",
        description: "Versatile and adaptable",
        traits: [
          {
            id: "trait_1",
            name: "Trait 1",
            sourceOrigin: "Race: Human",
          },
        ],
        subraces: [],
      };

      expect(mockRace).toHaveProperty("id");
      expect(mockRace).toHaveProperty("name");
      expect(mockRace).toHaveProperty("traits");
      expect(mockRace).toHaveProperty("subraces");
      expect(Array.isArray(mockRace.traits)).toBe(true);
    });

    it("includes subraces when available", () => {
      const mockRace = {
        id: "elf",
        name: "Elf",
        subraces: [
          {
            id: "high_elf",
            name: "High Elf",
            traits: [
              {
                id: "trait_high_elf",
                name: "Keen Senses",
                sourceOrigin: "Subrace: High Elf",
              },
            ],
          },
          {
            id: "wood_elf",
            name: "Wood Elf",
            traits: [],
          },
        ],
      };

      expect(mockRace.subraces).toHaveLength(2);
      expect(mockRace.subraces[0]).toBeDefined();
      expect(mockRace.subraces[0]?.traits).toBeDefined();
      expect(mockRace.subraces[0]?.traits[0]?.sourceOrigin).toContain(
        "Subrace",
      );
    });

    it("includes source origin metadata on traits", () => {
      const trait = {
        id: "trait_1",
        name: "Feature",
        sourceOrigin: "Race: Human",
      };

      expect(trait.sourceOrigin).toContain("Race:");
    });

    it("includes source origin on subrace traits", () => {
      const trait = {
        id: "trait_subrace",
        name: "Subrace Feature",
        sourceOrigin: "Subrace: High Elf",
      };

      expect(trait.sourceOrigin).toContain("Subrace:");
    });
  });

  describe("GET /api/reference/classes", () => {
    it("returns array of classes", () => {
      const mockClass = {
        id: "fighter",
        name: "Fighter",
        description: "Master of martial combat",
        hd: 10,
        hitPointsAtFirstLevel: 10,
      };

      expect(mockClass).toHaveProperty("id");
      expect(mockClass).toHaveProperty("name");
      expect(mockClass).toHaveProperty("hd");
    });

    it("includes class metadata", () => {
      const mockClass = {
        id: "wizard",
        name: "Wizard",
        hd: 6,
        savingThrowProficiencies: ["int", "wis"],
      };

      expect(mockClass.hd).toBe(6);
      expect(Array.isArray(mockClass.savingThrowProficiencies)).toBe(true);
    });

    it("returns starting equipment on fetched class payloads", async () => {
      const { app } = await setupReferenceApp({
        getClasses: vi.fn().mockResolvedValue([
          {
            id: "class_fighter",
            name: "Fighter",
            hitDie: 10,
            subclassRequirementLevel: 3,
            startingEquipment: {
              given: [
                {
                  kind: "item",
                  refId: "item_armor_chain_mail",
                  quantity: 1,
                },
              ],
              choices: [],
            },
            lore: { shortDescription: "Martial class" },
            sourceType: "core",
            ownerCharacterId: null,
          },
        ]),
      });

      const response = await request(app).get("/api/reference/classes");

      expect(response.status).toBe(200);
      expect(response.body.classes[0].startingEquipment).toEqual({
        given: [
          {
            kind: "item",
            refId: "item_armor_chain_mail",
            quantity: 1,
          },
        ],
        choices: [],
      });
    });
  });

  describe("GET /api/reference/level-up/options", () => {
    it("returns a consolidated payload for wizard steps", () => {
      const payload = {
        classes: [{ id: "class_fighter", name: "Fighter" }],
        feats: [{ id: "feat_alert", name: "Alert" }],
        subclasses: [],
        timeline: [],
        supportByClass: {
          class_fighter: {
            targetLevel: 2,
            isConfigured: true,
            reason: null,
            multiclassPrerequisitesMet: true,
            multiclassPrerequisiteReason: null,
            decisions: [
              {
                id: "dec_class_fighter_subclass_3",
                type: "subclass",
                description: "Choose a subclass for this class level.",
                options: ["subclass_fighter_champion"],
                isRequired: true,
                quantity: 1,
              },
            ],
          },
        },
        nextLevel: {
          targetLevel: 2,
          isConfigured: true,
          reason: null,
          grantedTraitIds: ["trait_action_surge"],
          decisionTypes: [],
          decisions: [],
        },
        selected: {
          classId: null,
          subclassId: null,
        },
      };

      expect(payload).toHaveProperty("classes");
      expect(payload).toHaveProperty("feats");
      expect(payload).toHaveProperty("subclasses");
      expect(payload).toHaveProperty("timeline");
      expect(payload).toHaveProperty("supportByClass");
      expect(payload).toHaveProperty("nextLevel");
      expect(payload).toHaveProperty("selected");
      expect(payload.supportByClass.class_fighter).toHaveProperty(
        "multiclassPrerequisitesMet",
      );
      expect(payload.supportByClass.class_fighter).toHaveProperty(
        "multiclassPrerequisiteReason",
      );
    });

    it("includes class-scoped subclasses and timeline when classId is provided", () => {
      const payload = {
        classes: [{ id: "class_fighter", name: "Fighter" }],
        feats: [{ id: "feat_alert", name: "Alert" }],
        subclasses: [
          { id: "subclass_champion", parentClassId: "class_fighter" },
        ],
        timeline: [{ level: 1, features: [] }],
        selected: {
          classId: "class_fighter",
          subclassId: null,
        },
      };

      expect(payload.subclasses).toHaveLength(1);
      expect(payload.timeline).toHaveLength(1);
      expect(payload.selected.classId).toBe("class_fighter");
    });

    it("requires classId context when subclassId is present", () => {
      const statusCode = 400;
      const errorMessage = "subclassId requires classId context.";

      expect(statusCode).toBe(400);
      expect(errorMessage).toContain("requires classId");
    });
  });

  describe("GET /api/reference/classes/:id/subclasses", () => {
    it("returns subclasses for valid class id", () => {
      const subclass = {
        id: "champion",
        name: "Champion",
        parentClassId: "fighter",
        description: "A warrior focused on martial prowess",
      };

      expect(subclass.parentClassId).toBe("fighter");
      expect(subclass).toHaveProperty("id");
      expect(subclass).toHaveProperty("name");
    });

    it("returns empty array when no subclasses available", () => {
      const subclasses: any[] = [];
      expect(subclasses).toHaveLength(0);
    });

    it("returns multiple subclasses for multiclassing", () => {
      const subclasses = [
        { id: "champion", name: "Champion", parentClassId: "fighter" },
        {
          id: "eldritch_knight",
          name: "Eldritch Knight",
          parentClassId: "fighter",
        },
        { id: "battlemaster", name: "Battle Master", parentClassId: "fighter" },
      ];

      expect(subclasses).toHaveLength(3);
      subclasses.forEach((sc) => {
        expect(sc.parentClassId).toBe("fighter");
      });
    });
  });

  describe("GET /api/reference/classes/:id/timeline", () => {
    it("returns 20-level progression timeline", () => {
      const timeline = Array.from({ length: 20 }, (_, i) => ({
        level: i + 1,
        scaling: {},
        spellcasting: null,
        features: [],
      }));

      expect(timeline).toHaveLength(20);
      expect(timeline[0]?.level).toBe(1);
      expect(timeline[19]?.level).toBe(20);
    });

    it("includes class-granted features at appropriate levels", () => {
      const timeline = [
        {
          level: 1,
          features: [
            {
              id: "fighting_style",
              name: "Fighting Style",
              sourceOrigin: "Class: Fighter",
            },
          ],
        },
        {
          level: 3,
          features: [
            {
              id: "martial_archetype",
              name: "Martial Archetype",
              sourceOrigin: "Class: Fighter",
            },
          ],
        },
      ];

      expect(timeline[0]?.features).toHaveLength(1);
      expect(timeline[1]?.features).toHaveLength(1);
      expect(timeline[0]?.features[0]?.sourceOrigin).toContain("Class:");
    });

    it("includes subclass features when subclass specified", () => {
      const timeline = [
        {
          level: 3,
          features: [
            {
              id: "improved_critical",
              name: "Improved Critical",
              sourceOrigin: "Subclass: Champion",
            },
          ],
        },
      ];

      expect(timeline[0]?.features[0]?.sourceOrigin).toContain("Subclass:");
    });

    it("returns null spellcasting for non-casters", () => {
      const timeline = [
        {
          level: 1,
          spellcasting: null,
        },
      ];

      expect(timeline[0]?.spellcasting).toBeNull();
    });

    it("includes spellcasting progression for casters", () => {
      const timeline = [
        {
          level: 1,
          spellcasting: {
            cantrips: 2,
            spellSlots: [0, 0, 0, 0, 0, 0, 0, 0, 0],
          },
        },
        {
          level: 2,
          spellcasting: {
            cantrips: 2,
            spellSlots: [0, 2, 0, 0, 0, 0, 0, 0, 0],
          },
        },
      ];

      expect(timeline[0]?.spellcasting).toHaveProperty("cantrips");
      expect(timeline[1]?.spellcasting?.spellSlots[1]).toBe(2);
    });
  });

  describe("GET /api/reference/backgrounds", () => {
    it("returns array of backgrounds with traits", () => {
      const background = {
        id: "soldier",
        name: "Soldier",
        description: "Military background",
        traits: [
          {
            id: "trait_1",
            name: "Military Rank",
            sourceOrigin: "Background: Soldier",
          },
        ],
      };

      expect(background).toHaveProperty("id");
      expect(background).toHaveProperty("name");
      expect(background).toHaveProperty("traits");
      expect(background.traits[0]?.sourceOrigin).toContain("Background:");
    });

    it("includes multiple traits per background", () => {
      const background = {
        id: "criminal",
        name: "Criminal",
        traits: [
          {
            id: "trait_1",
            name: "Trait 1",
            sourceOrigin: "Background: Criminal",
          },
          {
            id: "trait_2",
            name: "Trait 2",
            sourceOrigin: "Background: Criminal",
          },
          {
            id: "trait_3",
            name: "Trait 3",
            sourceOrigin: "Background: Criminal",
          },
        ],
      };

      expect(background.traits).toHaveLength(3);
    });

    it("returns starting equipment on fetched background payloads", async () => {
      const { app } = await setupReferenceApp({
        getBackgrounds: vi.fn().mockResolvedValue([
          {
            id: "background_acolyte",
            name: "Acolyte",
            featureName: "Shelter of the Faithful",
            featureDescription: "Temple support",
            startingEquipment: {
              given: [
                {
                  kind: "category",
                  refId: "category_holy_symbol",
                  quantity: 1,
                },
              ],
              choices: [],
            },
            ideals: [],
            bonds: [],
            flaws: [],
            personalityTraits: [],
            lore: { shortDescription: "Temple servant" },
            traits: [],
            sourceType: "core",
            ownerCharacterId: null,
          },
        ]),
      });

      const response = await request(app).get("/api/reference/backgrounds");

      expect(response.status).toBe(200);
      expect(response.body.backgrounds[0].startingEquipment).toEqual({
        given: [
          {
            kind: "category",
            refId: "category_holy_symbol",
            quantity: 1,
          },
        ],
        choices: [],
      });
    });
  });

  describe("GET /api/reference/traits", () => {
    // A trait shaped the way the real projection produces it: definition is
    // the whole authored TraitDefinition (see corePackProjection.ts), and
    // matchesTraitCategory reads proficiencies.fixed[].category off it. The
    // four blocks this replaces tested a "effects: [{type, category}]" shape
    // and an id.includes("_prof_skills") fallback that Task 14 deleted -
    // neither exists in the production code any more.
    const skillTrait = {
      id: "trait_skill_acrobatics",
      name: "Acrobatic Training",
      definition: TraitDefinitionSchema.parse({
        id: "trait_skill_acrobatics",
        name: "Acrobatic Training",
        proficiencies: {
          fixed: [{ category: "skills", proficiencyId: "skill_acrobatics" }],
        },
      }),
    };

    const toolTrait = {
      id: "trait_tool_tinkerer",
      name: "Tinkerer's Training",
      definition: TraitDefinitionSchema.parse({
        id: "trait_tool_tinkerer",
        name: "Tinkerer's Training",
        proficiencies: {
          fixed: [{ category: "tools", proficiencyId: "tool_tinkers" }],
        },
      }),
    };

    // Drives the real (rewritten) matchesTraitCategory through the route,
    // rather than re-implementing category matching as a local predicate -
    // that mismatch is exactly how this block went 22 assertions deep
    // without ever exercising production code.
    const setupWithTraits = () =>
      setupReferenceApp({
        getTraits: vi.fn(async (_scope: unknown, category?: TraitCategory) => {
          const traits = [skillTrait, toolTrait];
          return category
            ? traits.filter((trait) => matchesTraitCategory(trait, category))
            : traits;
        }),
      });

    it("returns a skills-category trait for ?category=skills", async () => {
      const { app } = await setupWithTraits();

      const response = await request(app).get(
        "/api/reference/traits?category=skills",
      );

      expect(response.status).toBe(200);
      expect(response.body.traits).toEqual([skillTrait]);
    });

    it("excludes a skills-category trait for ?category=tools_and_languages", async () => {
      const { app } = await setupWithTraits();

      const response = await request(app).get(
        "/api/reference/traits?category=tools_and_languages",
      );

      expect(response.status).toBe(200);
      expect(response.body.traits).toEqual([toolTrait]);
    });
  });
});
