import { describe, expect, it } from "vitest";
import { SkillEngine } from "../skills.js";
import type { FixedProficiencyGrant, RuntimeModifier } from "@project/shared";

const makeProf = (
  overrides: Partial<FixedProficiencyGrant>,
): FixedProficiencyGrant => ({
  category: "skills",
  proficiencyId: "stealth",
  level: "proficient",
  requiredStates: [],
  ...overrides,
});

const makeMod = (overrides: Partial<RuntimeModifier>): RuntimeModifier => ({
  id: "mod_1",
  target: "STEALTH_CHECK",
  type: "add",
  value: 0,
  scalingFactor: "none",
  requiredStates: [],
  forbiddenStates: [],
  sourceName: "Test Source",
  sourceOrigin: "item",
  isActive: true,
  ...overrides,
});

describe("SkillEngine.calculateSkill - skill lookup", () => {
  it("throws for an unknown skillId", () => {
    expect(() =>
      SkillEngine.calculateSkill("not_a_real_skill", 10, 2, [], []),
    ).toThrow("Skill definition not found for skillId: not_a_real_skill");
  });

  it("returns the skill's id and name from SKILL_MAP", () => {
    const result = SkillEngine.calculateSkill("perception", 14, 2, [], []);

    expect(result.id).toBe("perception");
    expect(result.name).toBe("Perception");
  });

  it("labels the breakdown with the skill's governing ability, uppercased", () => {
    const strSkill = SkillEngine.calculateSkill("athletics", 10, 2, [], []);
    const wisSkill = SkillEngine.calculateSkill("insight", 10, 2, [], []);

    expect(strSkill.breakdown).toContain("Base STR");
    expect(wisSkill.breakdown).toContain("Base WIS");
  });
});

describe("SkillEngine.calculateSkill - ability modifier baseline", () => {
  it("computes totalModifier from the ability score alone when unproficient with no other modifiers", () => {
    const result = SkillEngine.calculateSkill("stealth", 14, 2, [], []);

    // floor((14-10)/2) = 2
    expect(result.totalModifier).toBe(2);
    expect(result.multiplier).toBe(0);
  });

  it("omits the Proficiency segment from the breakdown entirely when unproficient", () => {
    const result = SkillEngine.calculateSkill("stealth", 14, 3, [], []);

    expect(result.breakdown).toBe("Base DEX (+2)");
  });

  it("shows a plus sign for a positive ability modifier and no sign for zero", () => {
    const positive = SkillEngine.calculateSkill("stealth", 14, 0, [], []);
    const zero = SkillEngine.calculateSkill("stealth", 10, 0, [], []);

    expect(positive.breakdown).toContain("(+2)");
    expect(zero.breakdown).toContain("(0)");
    expect(zero.breakdown).not.toContain("(+0)");
  });

  it("shows a negative ability modifier with its own minus sign, not a doubled one", () => {
    const result = SkillEngine.calculateSkill("stealth", 6, 0, [], []);

    // floor((6-10)/2) = -2
    expect(result.totalModifier).toBe(-2);
    expect(result.breakdown).toBe("Base DEX (-2)");
  });
});

describe("SkillEngine.calculateSkill - proficiency multiplier", () => {
  it("applies a proficient (x1) multiplier to the proficiency bonus", () => {
    const result = SkillEngine.calculateSkill("stealth", 10, 3, [
      makeProf({ level: "proficient" }),
    ], []);

    expect(result.multiplier).toBe(1);
    expect(result.totalModifier).toBe(3); // 0 (ability) + 3 (prof)
  });

  it("applies an expertise (x2) multiplier to the proficiency bonus", () => {
    const result = SkillEngine.calculateSkill("stealth", 10, 3, [
      makeProf({ level: "expertise" }),
    ], []);

    expect(result.multiplier).toBe(2);
    expect(result.totalModifier).toBe(6);
  });

  it("applies a half (x0.5) multiplier and floors the result", () => {
    const result = SkillEngine.calculateSkill("stealth", 10, 3, [
      makeProf({ level: "half" }),
    ], []);

    expect(result.multiplier).toBe(0.5);
    expect(result.totalModifier).toBe(1); // floor(3 * 0.5) = 1
  });

  it("floors a half multiplier down to zero contribution while still showing the x0.5 proficiency line", () => {
    const result = SkillEngine.calculateSkill("stealth", 10, 1, [
      makeProf({ level: "half" }),
    ], []);

    expect(result.multiplier).toBe(0.5);
    expect(result.totalModifier).toBe(0); // floor(1 * 0.5) = 0
    expect(result.breakdown).toBe("Base DEX (0) + Proficiency x0.5 (+0)");
  });

  it("ignores a grant whose category is not 'skills'", () => {
    const result = SkillEngine.calculateSkill("stealth", 10, 3, [
      makeProf({ category: "ability_check", level: "expertise" }),
    ], []);

    expect(result.multiplier).toBe(0);
  });

  it("ignores a grant whose proficiencyId does not match the skillId", () => {
    const result = SkillEngine.calculateSkill("stealth", 10, 3, [
      makeProf({ proficiencyId: "perception", level: "expertise" }),
    ], []);

    expect(result.multiplier).toBe(0);
  });

  it("excludes a grant whose requiredStates are not satisfied", () => {
    const result = SkillEngine.calculateSkill(
      "stealth",
      10,
      3,
      [makeProf({ level: "expertise", requiredStates: ["hidden"] })],
      [],
    );

    expect(result.multiplier).toBe(0);
  });

  it("includes a grant once its requiredStates are satisfied", () => {
    const result = SkillEngine.calculateSkill(
      "stealth",
      10,
      3,
      [makeProf({ level: "expertise", requiredStates: ["hidden"] })],
      [],
      ["hidden"],
    );

    expect(result.multiplier).toBe(2);
  });

  it("uses the highest multiplier among multiple qualifying grants", () => {
    const result = SkillEngine.calculateSkill("stealth", 10, 3, [
      makeProf({ level: "half" }),
      makeProf({ level: "proficient" }),
      makeProf({ level: "expertise" }),
    ], []);

    expect(result.multiplier).toBe(2);
    expect(result.totalModifier).toBe(6);
  });
});

describe("SkillEngine.calculateSkill - flat modifiers", () => {
  it("adds an active modifier targeting this skill's own <SKILL>_CHECK target", () => {
    const result = SkillEngine.calculateSkill(
      "stealth",
      10,
      0,
      [],
      [makeMod({ target: "STEALTH_CHECK", value: 5, sourceName: "Cloak" })],
    );

    expect(result.totalModifier).toBe(5);
  });

  it("adds an active modifier targeting the broad ALL_CHECKS bucket", () => {
    const result = SkillEngine.calculateSkill(
      "stealth",
      10,
      0,
      [],
      [
        makeMod({
          target: "ALL_CHECKS" as RuntimeModifier["target"],
          value: 1,
          sourceName: "Guidance",
        }),
      ],
    );

    expect(result.totalModifier).toBe(1);
  });

  it("ignores an inactive modifier even when the target matches", () => {
    const result = SkillEngine.calculateSkill(
      "stealth",
      10,
      0,
      [],
      [
        makeMod({
          target: "STEALTH_CHECK",
          value: 5,
          sourceName: "Cloak",
          isActive: false,
        }),
      ],
    );

    expect(result.totalModifier).toBe(0);
  });

  it("ignores a modifier whose target does not match this skill or ALL_CHECKS", () => {
    const result = SkillEngine.calculateSkill(
      "stealth",
      10,
      0,
      [],
      [makeMod({ target: "ARMOR_CLASS", value: 5, sourceName: "Shield" })],
    );

    expect(result.totalModifier).toBe(0);
  });

  it("ignores a modifier whose type is not 'add'", () => {
    const result = SkillEngine.calculateSkill(
      "stealth",
      10,
      0,
      [],
      [
        makeMod({
          target: "STEALTH_CHECK",
          type: "advantage",
          value: 5,
          sourceName: "Cloak",
        }),
      ],
    );

    expect(result.totalModifier).toBe(0);
  });

  it("excludes a modifier whose requiredStates are not satisfied", () => {
    const result = SkillEngine.calculateSkill(
      "stealth",
      10,
      0,
      [],
      [
        makeMod({
          target: "STEALTH_CHECK",
          value: 5,
          sourceName: "Conditional Cloak",
          requiredStates: ["hidden_in_shadows"],
        }),
      ],
      [], // activeStates does NOT include "hidden_in_shadows"
    );

    expect(result.totalModifier).toBe(0);
  });

  it("applies a modifier once its requiredStates are satisfied", () => {
    const result = SkillEngine.calculateSkill(
      "stealth",
      10,
      0,
      [],
      [
        makeMod({
          target: "STEALTH_CHECK",
          value: 5,
          sourceName: "Conditional Cloak",
          requiredStates: ["hidden_in_shadows"],
        }),
      ],
      ["hidden_in_shadows"],
    );

    expect(result.totalModifier).toBe(5);
  });

  it("excludes a modifier whose forbiddenStates are currently active", () => {
    const result = SkillEngine.calculateSkill(
      "stealth",
      10,
      0,
      [],
      [
        makeMod({
          target: "STEALTH_CHECK",
          value: 5,
          sourceName: "Cloak",
          forbiddenStates: ["restrained"],
        }),
      ],
      ["restrained"],
    );

    expect(result.totalModifier).toBe(0);
  });

  it("applies a modifier whose forbiddenStates are not currently active", () => {
    const result = SkillEngine.calculateSkill(
      "stealth",
      10,
      0,
      [],
      [
        makeMod({
          target: "STEALTH_CHECK",
          value: 5,
          sourceName: "Cloak",
          forbiddenStates: ["restrained"],
        }),
      ],
      [],
    );

    expect(result.totalModifier).toBe(5);
  });

  it("sums multiple qualifying flat modifiers", () => {
    const result = SkillEngine.calculateSkill(
      "stealth",
      10,
      0,
      [],
      [
        makeMod({ target: "STEALTH_CHECK", value: 2, sourceName: "Cloak" }),
        makeMod({
          target: "ALL_CHECKS" as RuntimeModifier["target"],
          value: 1,
          sourceName: "Guidance",
        }),
      ],
    );

    expect(result.totalModifier).toBe(3);
  });

  it("includes the flat modifier bonus in both totalModifier and the returned breakdown", () => {
    const result = SkillEngine.calculateSkill(
      "stealth",
      14,
      3,
      [makeProf({ level: "proficient" })],
      [makeMod({ target: "STEALTH_CHECK", value: 5, sourceName: "Cloak" })],
    );

    // ability(2) + proficiency(3) + flat mod(5) = 10
    expect(result.totalModifier).toBe(10);
    expect(result.breakdown).toBe(
      "Base DEX (+2) + Proficiency x1 (+3) + Cloak (+5)",
    );
  });
});
