import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CLASS_PROGRESSION_DICTIONARY } from "../progressionDictionary";

type ClassSeedRecord = {
  id: string;
  progression: Array<{
    level: number;
    features: string[];
  }>;
};

const currentDir = dirname(fileURLToPath(import.meta.url));
const classesJsonPath = resolve(
  currentDir,
  "../../../../database/data/classes.json",
);

const classSeedData = JSON.parse(
  readFileSync(classesJsonPath, "utf8"),
) as ClassSeedRecord[];

describe("progression dictionary drift safeguards", () => {
  it("keeps fighter level-2 trait parity with DB seed progression", () => {
    const fighterSeed = classSeedData.find((c) => c.id === "class_fighter");
    expect(fighterSeed).toBeDefined();

    const dbLevel2 = fighterSeed!.progression.find((p) => p.level === 2);
    expect(dbLevel2).toBeDefined();

    const engineLevel2 = CLASS_PROGRESSION_DICTIONARY.class_fighter?.[2];
    expect(engineLevel2).toBeDefined();

    expect(dbLevel2!.features).toEqual(
      expect.arrayContaining(engineLevel2!.grantedTraits),
    );
    expect(engineLevel2!.grantedTraits).toContain("trait_action_surge");
  });

  it("preserves level-1 proficiency abstraction semantics", () => {
    const fighterSeed = classSeedData.find((c) => c.id === "class_fighter");
    const dbLevel1 = fighterSeed!.progression.find((p) => p.level === 1);
    const dbFeatures = new Set(dbLevel1!.features);

    const expectedProficiencyTraits = [
      "trait_fighter_prof_saving_throw",
      "trait_fighter_prof_armor",
      "trait_fighter_prof_weapons",
      "trait_fighter_prof_skills",
    ];

    for (const traitId of expectedProficiencyTraits) {
      expect(dbFeatures.has(traitId)).toBe(true);
    }

    const engineLevel1 = CLASS_PROGRESSION_DICTIONARY.class_fighter?.[1];
    expect(engineLevel1?.grantedTraits).toContain("trait_fighter_proficiencies");
  });

  it("preserves decision-to-feature markers for subclass and ASI levels", () => {
    const fighterSeed = classSeedData.find((c) => c.id === "class_fighter");
    const dbLevel3 = fighterSeed!.progression.find((p) => p.level === 3);
    const dbLevel4 = fighterSeed!.progression.find((p) => p.level === 4);

    expect(dbLevel3!.features).toContain("trait_martial_archetype");
    expect(dbLevel4!.features).toContain("trait_ability_score_improvement");

    const level3Decisions = CLASS_PROGRESSION_DICTIONARY.class_fighter?.[3]
      ?.decisions;
    const level4Decisions = CLASS_PROGRESSION_DICTIONARY.class_fighter?.[4]
      ?.decisions;

    expect(level3Decisions?.some((d) => d.type === "subclass")).toBe(true);
    expect(level4Decisions?.some((d) => d.type === "asi_or_feat")).toBe(true);
  });
});

