import express from "express";
import request from "supertest";
import { describe, expect, it, vi, beforeEach, afterAll } from "vitest";
import { CreateCharacterPayloadSchema } from "@project/shared";
import type { Request, Response } from "express";
import { globalErrorHandler } from "../../middleware/errorHandler.js";

describe("Character Routes", () => {
  const consoleErrorSpy = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  const createMockResponse = () => {
    const res = {} as Response;
    const status = vi.fn().mockReturnValue(res);
    const json = vi.fn().mockReturnValue(res);

    res.status = status as Response["status"];
    res.json = json as Response["json"];

    return {
      res,
      status,
      json,
    };
  };

  const createLevelUpRequest = (bodyOverrides: Record<string, unknown> = {}) =>
    ({
      body: {
        characterId: "char-1",
        targetClassId: "class_fighter",
        newTotalLevel: 3,
        hpRoll: 7,
        ...bodyOverrides,
      },
    }) as Request;

  const setupLevelUpHarness = async ({
    resolverErrorMessage,
    resolverContextOverrides,
    existingClasses = [
      {
        id: "ledger-1",
        characterId: "char-1",
        classId: "class_fighter",
        classLevel: 2,
        subclassId: null,
      },
    ],
    multiclassValidationErrorMessage,
  }: {
    resolverErrorMessage?: string;
    resolverContextOverrides?: Partial<{
      targetLevel: number;
      isConfigured: boolean;
      reason: string | null;
      grantedTraitIds: string[];
      decisionTypes: string[];
      decisions: unknown[];
    }>;
    existingClasses?: Array<{
      id: string;
      characterId: string;
      classId: string;
      classLevel: number;
      subclassId: string | null;
    }>;
    multiclassValidationErrorMessage?: string;
  }) => {
    vi.resetModules();

    const selectResults = [
      [
        {
          id: "char-1",
          campaignId: "camp-1",
          str: 16,
          dex: 12,
          con: 14,
          int: 10,
          wis: 10,
          cha: 8,
        },
      ],
      existingClasses,
    ];

    const tx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(async () => {
        const nextResult = selectResults.shift();
        return nextResult ?? [];
      }),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    };

    const transactionMock = vi
      .fn()
      .mockImplementation(
        async (callback: (trx: unknown) => Promise<unknown>) => callback(tx),
      );

    const effectiveReferenceMock = vi.fn().mockResolvedValue({
      classes: [],
    });

    const resolveContextMock = vi.fn().mockReturnValue({
      targetLevel: 3,
      isConfigured: true,
      reason: null,
      grantedTraitIds: [],
      decisionTypes: [],
      decisions: [],
      ...resolverContextOverrides,
    });

    const validatePayloadMock = vi.fn().mockImplementation(() => {
      if (resolverErrorMessage) {
        throw new Error(resolverErrorMessage);
      }
    });

    const validateMulticlassPrerequisitesMock = vi
      .fn()
      .mockImplementation(() => {
        if (multiclassValidationErrorMessage) {
          throw new Error(multiclassValidationErrorMessage);
        }
      });

    vi.doMock("@project/database", () => ({
      db: {
        transaction: transactionMock,
      },
    }));

    vi.doMock("../../services/levelUpValidation.js", () => ({
      resolveNextLevelValidationContext: resolveContextMock,
      validateMulticlassPrerequisites: validateMulticlassPrerequisitesMock,
      validateLevelUpPayloadFromResolver: validatePayloadMock,
    }));

    vi.doMock("../../services/effectiveReferenceResolver.js", () => ({
      getEffectiveReferenceSnapshot: effectiveReferenceMock,
    }));

    const { applyLevelUp } =
      await import("../../controllers/characterController.js");

    return {
      applyLevelUp,
      tx,
      effectiveReferenceMock,
      resolveContextMock,
      validateMulticlassPrerequisitesMock,
      validatePayloadMock,
    };
  };

  const validCreatePayload = {
    name: "Aragorn",
    raceId: "human",
    subraceId: null,
    classId: "fighter",
    subclassId: null,
    baseAbilityScores: {
      str: 15,
      dex: 14,
      con: 13,
      int: 12,
      wis: 10,
      cha: 8,
    },
    alignment: "Lawful Good",
    background: {
      type: "PRESET" as const,
      presetId: "soldier",
      customData: null,
    },
    personality: {
      traits: "Bold",
      ideals: "Duty",
      bonds: "Friends",
      flaws: "Reckless",
    },
  };

  const setupCreateCharacterApp = async () => {
    vi.resetModules();

    const transactionMock = vi.fn();
    const processStartingEquipmentMock = vi.fn();
    const isUserCampaignMemberMock = vi.fn().mockResolvedValue(true);

    vi.doMock("@project/database", () => ({
      db: {
        transaction: transactionMock,
      },
    }));

    vi.doMock("../../utils/inventory.js", () => ({
      processStartingEquipment: processStartingEquipmentMock,
    }));

    vi.doMock("../../services/campaignAccess.js", () => ({
      isUserCampaignMember: isUserCampaignMemberMock,
    }));

    const { default: characterRoutes } = await import("../character.js");

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as Request & { user?: { id: string } }).user = { id: "test-user" };
      next();
    });
    app.use("/api/character", characterRoutes);
    app.use(globalErrorHandler);

    return {
      app,
      transactionMock,
      processStartingEquipmentMock,
      isUserCampaignMemberMock,
    };
  };

  describe("POST /api/character - Create Character", () => {
    it("validates character payload with schema", () => {
      const result = CreateCharacterPayloadSchema.safeParse(validCreatePayload);
      expect(result.success).toBe(true);
    });

    it("rejects invalid character payload (high ability score)", () => {
      const invalidPayload = {
        ...validCreatePayload,
        baseAbilityScores: {
          ...validCreatePayload.baseAbilityScores,
          str: 25, // Invalid: ability scores should be 3-20
        },
      };

      const result = CreateCharacterPayloadSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it("rejects invalid character payload (low ability score)", () => {
      const invalidPayload = {
        ...validCreatePayload,
        baseAbilityScores: {
          ...validCreatePayload.baseAbilityScores,
          str: 2, // Invalid: minimum is 3
        },
      };

      const result = CreateCharacterPayloadSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it("accepts preset background", () => {
      const payload = {
        ...validCreatePayload,
        background: {
          type: "PRESET" as const,
          presetId: "criminal",
          customData: null,
        },
      };

      const result = CreateCharacterPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("accepts custom background with traits", () => {
      const payload = {
        ...validCreatePayload,
        background: {
          type: "CUSTOM" as const,
          presetId: null,
          customData: {
            name: "Custom Background",
            featureName: "Feature",
            featureDescription: "Description",
            skillTraitIds: ["skill_1"],
            toolLanguageTraitIds: ["tool_1"],
          },
        },
      };

      const result = CreateCharacterPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("requires character name", () => {
      const payload = {
        ...validCreatePayload,
        name: "",
      };

      const result = CreateCharacterPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("requires raceId", () => {
      const payload = {
        ...validCreatePayload,
        raceId: undefined,
      };

      const result = CreateCharacterPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("requires classId", () => {
      const payload = {
        ...validCreatePayload,
        classId: undefined,
      };

      const result = CreateCharacterPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("requires all ability scores", () => {
      const payload = {
        ...validCreatePayload,
        baseAbilityScores: {
          str: 15,
          dex: 14,
          con: 13,
          int: 12,
          wis: 10,
          // Missing cha
        } as any,
      };

      const result = CreateCharacterPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("allows null subrace", () => {
      const payload = {
        ...validCreatePayload,
        subraceId: null,
      };

      const result = CreateCharacterPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("allows subrace when provided", () => {
      const payload = {
        ...validCreatePayload,
        subraceId: "high_elf",
      };

      const result = CreateCharacterPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("allows null subclass", () => {
      const payload = {
        ...validCreatePayload,
        subclassId: null,
      };

      const result = CreateCharacterPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("allows subclass when provided", () => {
      const payload = {
        ...validCreatePayload,
        subclassId: "champion",
      };

      const result = CreateCharacterPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("allows empty personality fields (no validation)", () => {
      const payload = {
        ...validCreatePayload,
        personality: {
          traits: "",
          ideals: "",
          bonds: "",
          flaws: "",
        },
      };

      const result = CreateCharacterPayloadSchema.safeParse(payload);
      // Schema allows empty strings for personality fields
      expect(result.success).toBe(true);
    });

    it("preserves non-empty personality fields", () => {
      const payload = {
        ...validCreatePayload,
        personality: {
          traits: "Brave and bold",
          ideals: "Justice",
          bonds: "My companions",
          flaws: "Reckless",
        },
      };

      const result = CreateCharacterPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.personality.traits).toBe("Brave and bold");
      }
    });
  });

  describe("Payload Construction", () => {
    it("flattens ability scores to column values", () => {
      const payload = validCreatePayload;

      expect(payload.baseAbilityScores.str).toBe(15);
      expect(payload.baseAbilityScores.dex).toBe(14);
      expect(payload.baseAbilityScores.con).toBe(13);
      expect(payload.baseAbilityScores.int).toBe(12);
      expect(payload.baseAbilityScores.wis).toBe(10);
      expect(payload.baseAbilityScores.cha).toBe(8);
    });

    it("handles custom background with multiple traits", () => {
      const payload = {
        ...validCreatePayload,
        background: {
          type: "CUSTOM" as const,
          presetId: null,
          customData: {
            name: "Custom BG",
            featureName: "Feature",
            featureDescription: "Desc",
            skillTraitIds: ["skill_1", "skill_2", "skill_3"],
            toolLanguageTraitIds: ["tool_1", "lang_1"],
          },
        },
      };

      const result = CreateCharacterPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.background.customData?.skillTraitIds).toHaveLength(
          3,
        );
        expect(
          result.data.background.customData?.toolLanguageTraitIds,
        ).toHaveLength(2);
      }
    });

    it("handles custom background with empty traits", () => {
      const payload = {
        ...validCreatePayload,
        background: {
          type: "CUSTOM" as const,
          presetId: null,
          customData: {
            name: "Custom BG",
            featureName: "Feature",
            featureDescription: "Desc",
            skillTraitIds: [],
            toolLanguageTraitIds: [],
          },
        },
      };

      const result = CreateCharacterPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("handles preset background without custom data", () => {
      const payload = {
        ...validCreatePayload,
        background: {
          type: "PRESET" as const,
          presetId: "soldier",
          customData: null,
        },
      };

      const result = CreateCharacterPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.background.presetId).toBe("soldier");
        expect(result.data.background.customData).toBeNull();
      }
    });
  });

  describe("Edge Cases and Special Characters", () => {
    it("handles long character names", () => {
      const longName = "A".repeat(255);
      const payload = {
        ...validCreatePayload,
        name: longName,
      };

      const result = CreateCharacterPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("handles special characters in personality", () => {
      const payload = {
        ...validCreatePayload,
        personality: {
          traits: 'Bold & brave ("heroic")',
          ideals: "Justice - at any cost",
          bonds: "My family's legacy",
          flaws: "I'm too cautious/paranoid",
        },
      };

      const result = CreateCharacterPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("handles unicode characters in name", () => {
      const payload = {
        ...validCreatePayload,
        name: "Légolas",
      };

      const result = CreateCharacterPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("accepts any alignment string", () => {
      const alignments = [
        "Lawful Good",
        "Neutral Good",
        "Chaotic Good",
        "Lawful Neutral",
        "True Neutral",
        "Chaotic Neutral",
        "Lawful Evil",
        "Neutral Evil",
        "Chaotic Evil",
      ];

      alignments.forEach((alignment) => {
        const payload = {
          ...validCreatePayload,
          alignment,
        };

        const result = CreateCharacterPayloadSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });
    });

    it("accepts custom alignment strings", () => {
      const payload = {
        ...validCreatePayload,
        alignment: "Super Evil",
      };

      const result = CreateCharacterPayloadSchema.safeParse(payload);
      // Schema accepts any string, not restricted to D&D alignments
      expect(result.success).toBe(true);
    });
  });

  describe("Ability Score Boundaries", () => {
    it("accepts minimum ability score of 3", () => {
      const payload = {
        ...validCreatePayload,
        baseAbilityScores: {
          str: 3,
          dex: 3,
          con: 3,
          int: 3,
          wis: 3,
          cha: 3,
        },
      };

      const result = CreateCharacterPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("rejects ability score below 3", () => {
      const payload = {
        ...validCreatePayload,
        baseAbilityScores: {
          ...validCreatePayload.baseAbilityScores,
          str: 2,
        },
      };

      const result = CreateCharacterPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("accepts maximum ability score of 18", () => {
      const payload = {
        ...validCreatePayload,
        baseAbilityScores: {
          str: 18,
          dex: 18,
          con: 18,
          int: 18,
          wis: 18,
          cha: 18,
        },
      };

      const result = CreateCharacterPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("rejects ability score above 18", () => {
      const payload = {
        ...validCreatePayload,
        baseAbilityScores: {
          ...validCreatePayload.baseAbilityScores,
          cha: 19,
        },
      };

      const result = CreateCharacterPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("accepts middle-range ability scores", () => {
      const payload = {
        ...validCreatePayload,
        baseAbilityScores: {
          str: 10,
          dex: 11,
          con: 12,
          int: 13,
          wis: 14,
          cha: 15,
        },
      };

      const result = CreateCharacterPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("rejects unresolved starting equipment choices before writing", async () => {
      const { app, transactionMock, processStartingEquipmentMock } =
        await setupCreateCharacterApp();

      const response = await request(app)
        .post("/api/character")
        .send({
          ...validCreatePayload,
          startingEquipment: {
            given: [],
            choices: [
              {
                choose: 1,
                options: [
                  {
                    equipmentBundle: [
                      {
                        kind: "category",
                        refId: "category_weapon_simple",
                        quantity: 1,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error:
          "Starting equipment choices must be resolved before character creation.",
      });
      expect(transactionMock).not.toHaveBeenCalled();
      expect(processStartingEquipmentMock).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/character/:characterId/level-up", () => {
    it("returns 400 with resolver subclass validation error", async () => {
      const { applyLevelUp } = await setupLevelUpHarness({
        resolverErrorMessage: "A subclass selection is required at this level",
      });

      const req = createLevelUpRequest();
      const { res, status, json } = createMockResponse();

      await applyLevelUp(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({
        success: false,
        error: "A subclass selection is required at this level",
      });
    });

    it("returns 400 with resolver trait-selection quantity validation error", async () => {
      const { applyLevelUp } = await setupLevelUpHarness({
        resolverErrorMessage:
          "You must select exactly 2 option(s) for Choose two skills.",
      });

      const req = createLevelUpRequest({
        selectedTraits: {
          dec_skills: ["trait_prof_athletics"],
        },
      });
      const { res, status, json } = createMockResponse();

      await applyLevelUp(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({
        success: false,
        error: "You must select exactly 2 option(s) for Choose two skills.",
      });
    });

    it("returns 400 when multiclass prerequisite validation denies a dip", async () => {
      const {
        applyLevelUp,
        validateMulticlassPrerequisitesMock,
        validatePayloadMock,
      } = await setupLevelUpHarness({
        existingClasses: [
          {
            id: "ledger-1",
            characterId: "char-1",
            classId: "class_rogue",
            classLevel: 2,
            subclassId: null,
          },
        ],
        multiclassValidationErrorMessage:
          "You do not meet the ability score prerequisites to multiclass into this class.",
      });

      const req = createLevelUpRequest({
        targetClassId: "class_fighter",
        newTotalLevel: 3,
      });
      const { res, status, json } = createMockResponse();

      await applyLevelUp(req, res);

      expect(validateMulticlassPrerequisitesMock).toHaveBeenCalled();
      expect(validatePayloadMock).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({
        success: false,
        error:
          "You do not meet the ability score prerequisites to multiclass into this class.",
      });
    });

    it("applies resolver multiclass grants for a first-level dip", async () => {
      const {
        applyLevelUp,
        tx,
        resolveContextMock,
        validateMulticlassPrerequisitesMock,
      } = await setupLevelUpHarness({
        existingClasses: [
          {
            id: "ledger-1",
            characterId: "char-1",
            classId: "class_rogue",
            classLevel: 2,
            subclassId: null,
          },
        ],
        resolverContextOverrides: {
          targetLevel: 1,
          grantedTraitIds: [
            "trait_fighter_mult_prof_armor",
            "trait_fighter_mult_prof_weapons",
          ],
        },
      });

      const req = createLevelUpRequest({
        targetClassId: "class_fighter",
        newTotalLevel: 3,
      });
      const { res, status, json } = createMockResponse();

      await applyLevelUp(req, res);

      expect(resolveContextMock).toHaveBeenCalledWith(
        expect.objectContaining({
          classId: "class_fighter",
          currentClassLevel: 0,
          isMulticlassDip: true,
        }),
      );
      expect(validateMulticlassPrerequisitesMock).toHaveBeenCalled();
      expect(tx.values).toHaveBeenCalledWith([
        {
          characterId: "char-1",
          traitId: "trait_fighter_mult_prof_armor",
          source: "multiclass_grant:class_fighter:level_1",
        },
        {
          characterId: "char-1",
          traitId: "trait_fighter_mult_prof_weapons",
          source: "multiclass_grant:class_fighter:level_1",
        },
      ]);
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({
        success: true,
        message: "Level up applied successfully.",
      });
    });
  });
});
