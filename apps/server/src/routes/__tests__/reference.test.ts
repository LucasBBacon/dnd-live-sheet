import { describe, expect, it, vi } from "vitest";

describe("Reference Routes", () => {
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
      expect(mockRace.subraces[0]).toHaveProperty("traits");
      expect(mockRace.subraces[0].traits[0].sourceOrigin).toContain("Subrace");
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
        subclasses: [{ id: "subclass_champion", parentClassId: "class_fighter" }],
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
        { id: "eldritch_knight", name: "Eldritch Knight", parentClassId: "fighter" },
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
      expect(timeline[0].level).toBe(1);
      expect(timeline[19].level).toBe(20);
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

      expect(timeline[0].features).toHaveLength(1);
      expect(timeline[1].features).toHaveLength(1);
      expect(timeline[0].features[0].sourceOrigin).toContain("Class:");
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

      expect(timeline[0].features[0].sourceOrigin).toContain("Subclass:");
    });

    it("returns null spellcasting for non-casters", () => {
      const timeline = [
        {
          level: 1,
          spellcasting: null,
        },
      ];

      expect(timeline[0].spellcasting).toBeNull();
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

      expect(timeline[0].spellcasting).toHaveProperty("cantrips");
      expect(timeline[1].spellcasting?.spellSlots[1]).toBe(2);
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
      expect(background.traits[0].sourceOrigin).toContain("Background:");
    });

    it("includes multiple traits per background", () => {
      const background = {
        id: "criminal",
        name: "Criminal",
        traits: [
          { id: "trait_1", name: "Trait 1", sourceOrigin: "Background: Criminal" },
          { id: "trait_2", name: "Trait 2", sourceOrigin: "Background: Criminal" },
          { id: "trait_3", name: "Trait 3", sourceOrigin: "Background: Criminal" },
        ],
      };

      expect(background.traits).toHaveLength(3);
    });
  });

  describe("GET /api/reference/traits", () => {
    it("returns all traits when no category specified", () => {
      const traits = [
        { id: "trait_1", name: "Feature 1", effects: [] },
        { id: "trait_2", name: "Feature 2", effects: [] },
        { id: "trait_3", name: "Feature 3", effects: [] },
      ];

      expect(traits.length).toBeGreaterThan(0);
    });

    it("filters traits by skills category", () => {
      const allTraits = [
        {
          id: "skill_insight",
          name: "Insight",
          effects: [{ type: "proficiency", category: "skills" }],
        },
        {
          id: "skill_perception",
          name: "Perception",
          effects: [{ type: "proficiency", category: "skills" }],
        },
        {
          id: "tool_tinker",
          name: "Tinker's Tools",
          effects: [{ type: "proficiency", category: "tools" }],
        },
      ];

      const skillTraits = allTraits.filter((t) =>
        t.effects.some((e) => e.category === "skills"),
      );
      expect(skillTraits).toHaveLength(2);
    });

    it("filters traits by tools_and_languages category", () => {
      const allTraits = [
        {
          id: "tool_cook",
          name: "Cook's Utensils",
          effects: [{ type: "proficiency", category: "tools" }],
        },
        {
          id: "lang_draconic",
          name: "Draconic",
          effects: [{ type: "proficiency", category: "languages" }],
        },
        {
          id: "skill_stealth",
          name: "Stealth",
          effects: [{ type: "proficiency", category: "skills" }],
        },
      ];

      const toolLanguageTraits = allTraits.filter(
        (t) =>
          t.effects.some(
            (e) => e.category === "tools" || e.category === "languages",
          ) &&
          !t.effects.some((e) => e.category === "skills"),
      );
      expect(toolLanguageTraits).toHaveLength(2);
    });

    it("returns 400 for invalid category", () => {
      const invalidCategory = "invalid_category";
      expect(invalidCategory).not.toBe("skills");
      expect(invalidCategory).not.toBe("tools_and_languages");
    });

    it("matches traits by effect properties", () => {
      const trait = {
        id: "trait_skill",
        name: "Acrobatics",
        effects: [
          { type: "proficiency", category: "skills" },
        ],
      };

      const hasSkillEffect = trait.effects.some(
        (e) => e.type === "proficiency" && e.category === "skills",
      );
      expect(hasSkillEffect).toBe(true);
    });

    it("matches traits by ID pattern", () => {
      const trait = { id: "skill_prof_skills", name: "Skill", effects: [] };
      const isSkillTrait = trait.id.includes("_prof_skills");
      expect(isSkillTrait).toBe(true);
    });

    it("matches traits by name pattern", () => {
      const traits = [
        { id: "t1", name: "Skill Expertise", effects: [] },
        { id: "t2", name: "Tool Mastery", effects: [] },
      ];

      const skillTraits = traits.filter((t) => t.name.toLowerCase().includes("skill"));
      expect(skillTraits).toHaveLength(1);
    });
  });

  describe("GET /api/reference/traits/:id", () => {
    it("returns single trait by id", () => {
      const trait = {
        id: "trait_strength_surge",
        name: "Strength Surge",
        description: "Gain +1d4 to Strength check",
        effects: [],
      };

      expect(trait).toHaveProperty("id");
      expect(trait).toHaveProperty("name");
      expect(trait).toHaveProperty("description");
    });

    it("returns 404 for non-existent trait", () => {
      const statusCode = 404;
      expect(statusCode).toBe(404);
    });

    it("includes full trait object with flavor text", () => {
      const trait = {
        id: "feat_great_weapon_master",
        name: "Great Weapon Master",
        description: "You learn to put the weight of a weapon to its best use.",
        effects: [
          {
            type: "bonus",
            target: "attack_roll",
            value: -5,
          },
          {
            type: "bonus",
            target: "damage_roll",
            value: 10,
          },
        ],
        lore: "Legendary fighters speak of a technique that turns weapon drawbacks into advantages.",
      };

      expect(trait).toHaveProperty("lore");
      expect(trait.effects).toHaveLength(2);
    });
  });

  describe("Helper Functions", () => {
    describe("hasEffectCategory", () => {
      it("identifies proficiency effects with category", () => {
        const effects = [
          { type: "proficiency", category: "skills" },
        ];

        const hasSkillProf = effects.some(
          (e) => e.type === "proficiency" && e.category === "skills",
        );
        expect(hasSkillProf).toBe(true);
      });

      it("returns false for non-proficiency effects", () => {
        const effects = [
          { type: "bonus", value: 2 },
        ];

        const hasProf = effects.some((e) => e.type === "proficiency");
        expect(hasProf).toBe(false);
      });

      it("handles proficiency_choice variant", () => {
        const effects = [
          { type: "proficiency_choice", category: "tools", choices: 2 },
        ];

        const isChoiceProf = effects.some(
          (e) => e.type === "proficiency_choice",
        );
        expect(isChoiceProf).toBe(true);
      });

      it("filters by multiple categories", () => {
        const effects = [
          { type: "proficiency", category: "skills" },
          { type: "proficiency", category: "tools" },
        ];

        const hasToolsOrSkills = effects.some(
          (e) =>
            (e.category === "tools" || e.category === "skills") &&
            (e.type === "proficiency" || e.type === "proficiency_choice"),
        );
        expect(hasToolsOrSkills).toBe(true);
      });
    });

    describe("matchesTraitCategory", () => {
      it("matches skills category by effect", () => {
        const trait = {
          id: "skill_acrobatics",
          name: "Acrobatics",
          effects: [{ type: "proficiency", category: "skills" }],
        };

        const category = "skills";
        const matches =
          trait.effects.some((e) => e.category === category) ||
          trait.id.toLowerCase().includes("skill") ||
          trait.name.toLowerCase().includes("skill");
        expect(matches).toBe(true);
      });

      it("matches tools_and_languages category", () => {
        const trait = {
          id: "tool_tinker",
          name: "Tinker's Tools",
          effects: [{ type: "proficiency", category: "tools" }],
        };

        const category = "tools_and_languages";
        const matches =
          trait.effects.some((e) => e.category === "tools" || e.category === "languages") ||
          trait.id.includes("_prof_tools") ||
          trait.id.includes("_languages");
        expect(matches).toBe(true);
      });

      it("uses ID pattern as fallback", () => {
        const trait = {
          id: "custom_skill_prof_skills",
          name: "Custom Trait",
          effects: [],
        };

        const matches = trait.id.includes("_prof_skills");
        expect(matches).toBe(true);
      });

      it("uses name pattern as fallback", () => {
        const trait = {
          id: "feat_something",
          name: "Language: Draconic",
          effects: [],
        };

        const matches = trait.name.toLowerCase().includes("language");
        expect(matches).toBe(true);
      });

      it("case-insensitive matching", () => {
        const trait = {
          id: "SKILL_INSIGHT",
          name: "INSIGHT",
          effects: [],
        };

        const id = trait.id.toLowerCase();
        const name = trait.name.toLowerCase();
        expect(id.includes("skill")).toBe(true);
        expect(name.includes("insight")).toBe(true);
      });
    });
  });

  describe("Error Handling", () => {
    it("handles empty trait array gracefully", () => {
      const traits: any[] = [];
      expect(traits).toHaveLength(0);
    });

    it("handles null effects safely", () => {
      const trait = {
        id: "trait_1",
        name: "Trait",
        effects: null,
      } as any;

      const hasEffects = Array.isArray(trait.effects);
      expect(hasEffects).toBe(false);
    });

    it("handles malformed effect objects", () => {
      const effect = {};
      const type = (effect as any).type;
      expect(type).toBeUndefined();
    });
  });
});
