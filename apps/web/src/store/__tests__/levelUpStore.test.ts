import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLevelUpStore } from "../levelUpStore";
import type { ChoiceQuestion } from "@project/engine";
import { apiClient, buildLevelUpOptionsEndpoint } from "../../api/client";

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

    expect(decisions).toHaveLength(4);

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
describe("useLevelUpStore choice questions", () => {
  const question = (
    id: string,
    target: "class" | "trait",
    overrides: Partial<ChoiceQuestion> = {},
  ): ChoiceQuestion => ({
    id,
    target,
    ...(target === "class" ? { classId: "class_fighter" } : {}),
    source: { kind: "class", id: "class_fighter", name: "Fighter" },
    prompt: `Choose for ${id}`,
    pickCount: 1,
    options: [
      { id: "opt_a", label: "A" },
      { id: "opt_b", label: "B" },
    ],
    selected: [],
    held: [],
    ...overrides,
  });

  const optionsResponse = (choiceQuestions: ChoiceQuestion[]) => ({
    subclasses: [{ id: "subclass_fighter_battle_master" }],
    nextLevel: {
      targetLevel: 3,
      isConfigured: true,
      reason: null,
      grantedTraitIds: [],
      decisionTypes: ["subclass"],
      decisions: [
        {
          id: "dec_class_fighter_subclass_3",
          type: "subclass",
          description: "Choose a subclass.",
          isRequired: true,
          quantity: 1,
        },
      ],
    },
    choiceQuestions,
  });

  const begin = async (choiceQuestions: ChoiceQuestion[]) => {
    vi.mocked(apiClient).mockResolvedValueOnce(optionsResponse(choiceQuestions));
    await useLevelUpStore
      .getState()
      .beginLevelUp("character-1", "class_fighter", 2, 3, {
        campaignId: "campaign-1",
      });
  };

  // lets a pending refetch settle
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(() => {
    vi.mocked(apiClient).mockReset();
    vi.mocked(buildLevelUpOptionsEndpoint).mockClear();
    useLevelUpStore.setState({
      isActive: false,
      progressionContext: null,
      draftPayload: {},
      errorMessage: null,
      choiceQuestions: [],
    });
  });

  it("keeps the server's choiceQuestions from the options response", async () => {
    const skills = question("fighter_starting_skills", "trait");
    await begin([skills]);

    expect(useLevelUpStore.getState().choiceQuestions).toEqual([skills]);
  });

  it("refetches the questions with the draft's subclassId once the subclass is picked", async () => {
    await begin([]);
    const maneuvers = question("fighter_bm_level_3_maneuvers", "class", {
      pickCount: 3,
    });
    vi.mocked(apiClient).mockResolvedValueOnce(optionsResponse([maneuvers]));

    useLevelUpStore
      .getState()
      .updateDraft({ subclassId: "subclass_fighter_battle_master" });
    await flush();

    expect(vi.mocked(buildLevelUpOptionsEndpoint)).toHaveBeenLastCalledWith(
      { campaignId: "campaign-1", characterId: "character-1" },
      expect.objectContaining({
        classId: "class_fighter",
        currentClassLevel: 2,
        subclassId: "subclass_fighter_battle_master",
      }),
    );
    expect(useLevelUpStore.getState().choiceQuestions).toEqual([maneuvers]);
  });

  it("refetches with the draft's featId when the feat changes", async () => {
    await begin([]);
    vi.mocked(apiClient).mockResolvedValueOnce(optionsResponse([]));

    useLevelUpStore.getState().updateDraft({ featId: "feat_skilled" });
    await flush();

    expect(vi.mocked(buildLevelUpOptionsEndpoint)).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ featId: "feat_skilled" }),
    );
  });

  it("does not refetch for other draft keys, or for an unchanged subclass", async () => {
    await begin([]);
    vi.mocked(apiClient).mockResolvedValueOnce(optionsResponse([]));
    useLevelUpStore
      .getState()
      .updateDraft({ subclassId: "subclass_fighter_battle_master" });
    await flush();
    const calls = vi.mocked(apiClient).mock.calls.length;

    useLevelUpStore.getState().updateDraft({ hpRoll: 6 });
    useLevelUpStore
      .getState()
      .updateDraft({ subclassId: "subclass_fighter_battle_master" });
    useLevelUpStore
      .getState()
      .updateDraft({ selectedTraits: { some_node: ["opt_a"] } });
    await flush();

    expect(vi.mocked(apiClient).mock.calls.length).toBe(calls);
  });

  it("drops answers to questions the refetch no longer asks", async () => {
    const maneuvers = question("fighter_bm_level_3_maneuvers", "class");
    const skills = question("fighter_starting_skills", "trait");
    await begin([maneuvers, skills]);
    useLevelUpStore.getState().updateDraft({
      selectedTraits: { fighter_bm_level_3_maneuvers: ["opt_a"] },
      traitSelections: { fighter_starting_skills: ["opt_b"] },
    });
    vi.mocked(apiClient).mockResolvedValueOnce(optionsResponse([skills]));

    useLevelUpStore
      .getState()
      .updateDraft({ subclassId: "subclass_fighter_champion" });
    await flush();

    const draft = useLevelUpStore.getState().draftPayload;
    expect(draft.selectedTraits).toEqual({});
    expect(draft.traitSelections).toEqual({ fighter_starting_skills: ["opt_b"] });
  });

  it("drops a pick the refetched question marks unmet", async () => {
    await begin([question("warlock_level_2_invocations", "class")]);
    useLevelUpStore.getState().updateDraft({
      selectedTraits: { warlock_level_2_invocations: ["opt_a"] },
    });
    vi.mocked(apiClient).mockResolvedValueOnce(
      optionsResponse([
        question("warlock_level_2_invocations", "class", {
          options: [
            { id: "opt_a", label: "A", unmet: ["needs Eldritch Blast"] },
            { id: "opt_b", label: "B" },
          ],
        }),
      ]),
    );

    useLevelUpStore.getState().updateDraft({ featId: "feat_alert" });
    await flush();

    expect(useLevelUpStore.getState().draftPayload.selectedTraits).toEqual({
      warlock_level_2_invocations: [],
    });
  });

  it("keeps only the latest refetch when an older one resolves after it", async () => {
    await begin([]);
    let resolveSlow: (value: unknown) => void = () => undefined;
    const slow = new Promise((resolve) => {
      resolveSlow = resolve;
    });
    const newest = question("fighter_bm_level_3_maneuvers", "class");
    vi.mocked(apiClient)
      .mockReturnValueOnce(slow)
      .mockResolvedValueOnce(optionsResponse([newest]));

    useLevelUpStore
      .getState()
      .updateDraft({ subclassId: "subclass_fighter_champion" });
    useLevelUpStore
      .getState()
      .updateDraft({ subclassId: "subclass_fighter_battle_master" });
    await flush();
    resolveSlow(optionsResponse([question("stale_question", "class")]));
    await flush();

    expect(useLevelUpStore.getState().choiceQuestions).toEqual([newest]);
  });
});

describe("useLevelUpStore hit point preview (#88)", () => {
  const draft = {
    characterId: "char_1",
    targetClassId: "class_fighter",
    newTotalLevel: 4,
    hpRoll: 6,
    asiChoices: [{ stat: "CON" as const, value: 1 }],
  };

  beforeEach(() => {
    vi.mocked(apiClient).mockReset();
    useLevelUpStore.setState({
      isActive: true,
      draftPayload: draft,
      hitPointPreview: { status: "idle" },
    });
  });

  it("posts the draft to the preview endpoint and keeps the server's numbers", async () => {
    vi.mocked(apiClient).mockResolvedValueOnce({
      maxHpBefore: 31,
      maxHpAfter: 42,
      hitPointGain: 11,
    });

    await useLevelUpStore.getState().requestHitPointPreview();

    const [endpoint, options] = vi.mocked(apiClient).mock.calls[0]!;
    expect(endpoint).toBe("/character/char_1/level-up/preview");
    expect(options?.method).toBe("POST");
    expect(JSON.parse(options!.body as string)).toEqual({
      targetClassId: "class_fighter",
      hpRoll: 6,
      asiChoices: [{ stat: "CON", value: 1 }],
    });
    expect(useLevelUpStore.getState().hitPointPreview).toEqual({
      status: "ready",
      maxHpBefore: 31,
      maxHpAfter: 42,
      hitPointGain: 11,
    });
  });

  it("records a failed preview as an error, never a guess", async () => {
    vi.mocked(apiClient).mockRejectedValueOnce(new Error("offline"));

    await useLevelUpStore.getState().requestHitPointPreview();

    expect(useLevelUpStore.getState().hitPointPreview).toEqual({
      status: "error",
    });
  });

  it("asks nothing until the draft has a class and a roll", async () => {
    useLevelUpStore.setState({
      draftPayload: { characterId: "char_1", targetClassId: "class_fighter" },
    });

    await useLevelUpStore.getState().requestHitPointPreview();

    expect(apiClient).not.toHaveBeenCalled();
    expect(useLevelUpStore.getState().hitPointPreview).toEqual({
      status: "idle",
    });
  });

  it("keeps only the newest answer when two previews overlap", async () => {
    let answerFirst!: (value: unknown) => void;
    vi.mocked(apiClient)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answerFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ maxHpBefore: 31, maxHpAfter: 44, hitPointGain: 13 });

    const first = useLevelUpStore.getState().requestHitPointPreview();
    await useLevelUpStore.getState().requestHitPointPreview();
    answerFirst({ maxHpBefore: 31, maxHpAfter: 40, hitPointGain: 9 });
    await first;

    expect(useLevelUpStore.getState().hitPointPreview).toEqual({
      status: "ready",
      maxHpBefore: 31,
      maxHpAfter: 44,
      hitPointGain: 13,
    });
  });

  it("drops a stale preview answer if the wizard is cancelled and reopened before it resolves (#88)", async () => {
    let answerFirst!: (value: unknown) => void;
    vi.mocked(apiClient).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answerFirst = resolve;
        }),
    );

    const pending = useLevelUpStore.getState().requestHitPointPreview();
    useLevelUpStore.getState().cancelLevelUp();
    // a new wizard session begins before the stale request resolves
    useLevelUpStore.setState({ isActive: true });

    answerFirst({ maxHpBefore: 31, maxHpAfter: 42, hitPointGain: 11 });
    await pending;

    expect(useLevelUpStore.getState().hitPointPreview).not.toEqual({
      status: "ready",
      maxHpBefore: 31,
      maxHpAfter: 42,
      hitPointGain: 11,
    });
  });
});
