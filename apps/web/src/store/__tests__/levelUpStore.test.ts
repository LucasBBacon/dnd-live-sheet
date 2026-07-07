import { beforeEach, describe, expect, it } from "vitest";
import { useLevelUpStore } from "../levelUpStore";

describe("useLevelUpStore", () => {
  beforeEach(() => {
    useLevelUpStore.setState({
      isActive: false,
      progressionContext: null,
      draftPayload: {},
      errorMessage: null,
    });
  });

  it("preserves the active wizard when a class progression is missing", () => {
    useLevelUpStore
      .getState()
      .beginLevelUp("character-1", "class_fighter", 0, 1);

    const previousState = useLevelUpStore.getState();

    useLevelUpStore
      .getState()
      .beginLevelUp("character-1", "class_rogue", 0, 2);

    const nextState = useLevelUpStore.getState();

    expect(nextState.isActive).toBe(true);
    expect(nextState.progressionContext).toBe(previousState.progressionContext);
    expect(nextState.draftPayload.targetClassId).toBe("class_fighter");
    expect(nextState.errorMessage).toContain("class_rogue level 1");
  });
});