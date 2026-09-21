import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLevelUpStore } from "../levelUpStore";
import { apiClient } from "../../api/client";

vi.mock("../../api/client", () => ({
  apiClient: vi.fn(),
  buildLevelUpOptionsEndpoint: vi.fn(() => "/reference/level-up/options"),
}));

describe("useLevelUpStore", () => {
  beforeEach(() => {
    vi.mocked(apiClient).mockReset();

    useLevelUpStore.setState({
      isActive: false,
      progressionContext: null,
      draftPayload: {},
      errorMessage: null,
    });
  });

  it("preserves the active wizard when server progression is missing", async () => {
    vi.mocked(apiClient)
      .mockResolvedValueOnce({
        subclasses: [],
        nextLevel: {
          targetLevel: 1,
          isConfigured: true,
          reason: null,
          grantedTraitIds: ["trait_second_wind"],
          decisionTypes: [],
        },
      })
      .mockResolvedValueOnce({
        subclasses: [],
        nextLevel: {
          targetLevel: 1,
          isConfigured: false,
          reason: "Level 1 is not configured in class progression data.",
          grantedTraitIds: [],
          decisionTypes: [],
        },
      });

    await useLevelUpStore
      .getState()
      .beginLevelUp("character-1", "class_fighter", 0, 1, {
        campaignId: "campaign-1",
      });

    const previousState = useLevelUpStore.getState();

    await useLevelUpStore
      .getState()
      .beginLevelUp("character-1", "class_rogue", 0, 2, {
        campaignId: "campaign-1",
      });

    const nextState = useLevelUpStore.getState();

    expect(nextState.isActive).toBe(true);
    expect(nextState.progressionContext).toBe(previousState.progressionContext);
    expect(nextState.draftPayload.targetClassId).toBe("class_fighter");
    expect(nextState.errorMessage).toContain("Level 1 is not configured");
  });

  it("short-circuits without API call when pre-resolved support is unsupported", async () => {
    await useLevelUpStore
      .getState()
      .beginLevelUp(
        "character-1",
        "class_rogue",
        0,
        2,
        { campaignId: "campaign-1" },
        {
          targetLevel: 1,
          isConfigured: false,
          reason: "Level 1 is not configured in class progression data.",
        },
      );

    const nextState = useLevelUpStore.getState();

    expect(apiClient).not.toHaveBeenCalled();
    expect(nextState.isActive).toBe(false);
    expect(nextState.errorMessage).toContain("Level 1 is not configured");
  });

  it("submits a draft's traitSelections alongside selectedTraits", async () => {
    vi.mocked(apiClient).mockResolvedValueOnce({ ok: true });

    useLevelUpStore.setState({
      isActive: true,
      progressionContext: {
        classId: "class_rogue",
        level: 1,
        grantedTraits: [],
        decisions: [],
      },
      grantedTraitDetails: [],
      draftPayload: {
        characterId: "character-1",
        targetClassId: "class_rogue",
        newTotalLevel: 2,
        hpRoll: 6,
        selectedTraits: { some_class_node: ["trait_a"] },
        traitSelections: { rogue_multiclass_skill: ["stealth"] },
      },
      errorMessage: null,
    });

    await useLevelUpStore.getState().validateAndSubmit();

    const [endpoint, options] = vi.mocked(apiClient).mock.calls[0]!;
    const submittedBody = JSON.parse(options!.body as string);

    expect(endpoint).toBe("/character/character-1/level-up");
    expect(submittedBody.traitSelections).toEqual({
      rogue_multiclass_skill: ["stealth"],
    });
    expect(submittedBody.selectedTraits).toEqual({ some_class_node: ["trait_a"] });
  });

  it("clears the wizard state after a successful submission", async () => {
    vi.mocked(apiClient).mockResolvedValueOnce({ ok: true });

    useLevelUpStore.setState({
      isActive: true,
      progressionContext: {
        classId: "class_fighter",
        level: 2,
        grantedTraits: [],
        decisions: [],
      },
      grantedTraitDetails: [
        {
          id: "trait_second_wind",
          name: "Second Wind",
          grantSourceType: "class_progression",
        },
      ],
      draftPayload: {
        characterId: "character-1",
        targetClassId: "class_fighter",
        newTotalLevel: 2,
        hpRoll: 6,
      },
      errorMessage: null,
    });

    await useLevelUpStore.getState().validateAndSubmit();

    const nextState = useLevelUpStore.getState();

    expect(nextState.isActive).toBe(false);
    expect(nextState.progressionContext).toBeNull();
    expect(nextState.grantedTraitDetails).toEqual([]);
    expect(nextState.draftPayload).toEqual({});
    expect(nextState.errorMessage).toBeNull();
  });

  it("keeps every decision from nextLevel.decisions, filling subclass options from the response's subclasses", async () => {
    vi.mocked(apiClient).mockResolvedValueOnce({
      subclasses: [{ id: "subclass_thief" }, { id: "subclass_assassin" }],
      nextLevel: {
        targetLevel: 3,
        isConfigured: true,
        reason: null,
        grantedTraitIds: [],
        decisionTypes: ["subclass"],
        decisions: [
          {
            id: "rogue_multiclass_skill",
            type: "trait_selection",
            description: "Choose a bonus skill.",
            options: ["skill_stealth", "skill_deception"],
            isRequired: true,
            quantity: 1,
            source: "trait_choice_block",
          },
          {
            id: "fighter_level_1_fighting_style",
            type: "trait_selection",
            description: "Choose a fighting style.",
            options: ["trait_fs_archery", "trait_fs_defense"],
            isRequired: true,
            quantity: 1,
          },
          {
            id: "node_spell_pick",
            type: "spell_selection",
            description: "Choose a spell.",
            isRequired: true,
            quantity: 2,
          },
          {
            id: "dec_asi",
            type: "asi_or_feat",
            description: "Increase an ability score or choose a feat.",
            isRequired: true,
            quantity: 1,
          },
          {
            id: "dec_subclass",
            type: "subclass",
            description: "Choose a subclass.",
            isRequired: true,
            quantity: 1,
          },
        ],
      },
    });

    await useLevelUpStore
      .getState()
      .beginLevelUp("character-1", "class_rogue", 2, 3, {
        campaignId: "campaign-1",
      });

    const decisions =
      useLevelUpStore.getState().progressionContext?.decisions ?? [];

    expect(decisions).toHaveLength(5);

    expect(decisions.find((d) => d.id === "rogue_multiclass_skill")).toEqual({
      id: "rogue_multiclass_skill",
      type: "trait_selection",
      description: "Choose a bonus skill.",
      options: ["skill_stealth", "skill_deception"],
      isRequired: true,
      quantity: 1,
      source: "trait_choice_block",
    });

    expect(
      decisions.find((d) => d.id === "fighter_level_1_fighting_style"),
    ).toEqual({
      id: "fighter_level_1_fighting_style",
      type: "trait_selection",
      description: "Choose a fighting style.",
      options: ["trait_fs_archery", "trait_fs_defense"],
      isRequired: true,
      quantity: 1,
    });

    expect(decisions.find((d) => d.id === "node_spell_pick")).toEqual({
      id: "node_spell_pick",
      type: "spell_selection",
      description: "Choose a spell.",
      isRequired: true,
      quantity: 2,
    });

    expect(decisions.find((d) => d.id === "dec_asi")).toEqual({
      id: "dec_asi",
      type: "asi_or_feat",
      description: "Increase an ability score or choose a feat.",
      isRequired: true,
      quantity: 1,
    });

    // a subclass decision with no options gets the response's subclasses ids
    expect(decisions.find((d) => d.id === "dec_subclass")).toEqual({
      id: "dec_subclass",
      type: "subclass",
      description: "Choose a subclass.",
      isRequired: true,
      quantity: 1,
      options: ["subclass_thief", "subclass_assassin"],
    });
  });
});