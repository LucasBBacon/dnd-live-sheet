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
});