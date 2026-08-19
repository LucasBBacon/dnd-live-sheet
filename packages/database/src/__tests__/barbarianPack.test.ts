import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CONDITION_MAP,
  TraitDefinitionSchema,
  type TraitDefinition,
} from "@project/shared";

const SEGMENT_PATH = path.join(
  process.cwd(),
  "data/packs/core_2014_pack/classes/barbarian.json",
);

const segment = JSON.parse(readFileSync(SEGMENT_PATH, "utf8")) as {
  traits: unknown[];
  classes: Array<{
    id: string;
    progression: Array<{ level: number; grants: string[] }>;
  }>;
};

const findTrait = (id: string): TraitDefinition => {
  const raw = segment.traits.find(
    (trait): trait is { id: string } =>
      typeof trait === "object" &&
      trait !== null &&
      (trait as { id?: unknown }).id === id,
  );

  if (!raw) throw new Error(`trait '${id}' is not authored in the segment`);

  return TraitDefinitionSchema.parse(raw);
};

describe("trait_reckless_attack", () => {
  const trait = findTrait("trait_reckless_attack");

  it("is authored as an engine-backed rule", () => {
    expect(trait.implementation?.mode).toBe("engine");
  });

  it("carries real rule text rather than a placeholder", () => {
    expect(trait.lore?.shortDescription).not.toBe("placeholder");
    expect(trait.lore?.shortDescription.length).toBeGreaterThan(20);
  });

  it("grants advantage on attack rolls, not a numeric bonus", () => {
    const [modifier, ...rest] = trait.modifiers.fixed;

    expect(rest).toHaveLength(0);
    expect(modifier?.target).toBe("ATTACK_BONUS");
    expect(modifier?.type).toBe("advantage");
  });

  it("gates that advantage on Strength-based melee attacks while reckless", () => {
    expect(trait.modifiers.fixed[0]?.requiredStates).toEqual([
      "status_reckless_attack",
      "action_melee_attack",
      "action_using_str",
    ]);
  });

  it("costs no action, because the decision rides on an attack you already made", () => {
    const declare = trait.actions.find(
      (action) => action.id === "action_reckless_attack",
    );

    expect(declare?.activation).toBe("special");
  });

  it("applies the self-advantage until the end of the turn it was declared on", () => {
    const declare = trait.actions.find(
      (action) => action.id === "action_reckless_attack",
    );

    if (declare?.effect.type !== "macro") {
      throw new Error("expected a macro effect");
    }

    const selfBuff = declare.effect.effects.find(
      (effect) =>
        effect.type === "apply_effect" &&
        effect.states.includes("status_reckless_attack"),
    );

    expect(selfBuff).toBeDefined();
    if (selfBuff?.type !== "apply_effect") throw new Error("wrong effect type");
    expect(selfBuff.durationType).toBe("turn_end");
    expect(selfBuff.effectTag).toBe("reckless_attack");
  });

  it("leaves you exposed until the start of your next turn", () => {
    const declare = trait.actions.find(
      (action) => action.id === "action_reckless_attack",
    );

    if (declare?.effect.type !== "macro") {
      throw new Error("expected a macro effect");
    }

    const exposure = declare.effect.effects.find(
      (effect) =>
        effect.type === "apply_effect" &&
        effect.states.includes("status_attacks_against_have_advantage"),
    );

    expect(exposure).toBeDefined();
    if (exposure?.type !== "apply_effect") throw new Error("wrong effect type");
    expect(exposure.durationType).toBe("turn_start");
  });

  it("offers an escape hatch that clears both halves of the rule", () => {
    const end = trait.actions.find(
      (action) => action.id === "action_end_reckless_attack",
    );

    if (end?.effect.type !== "macro") {
      throw new Error("expected a macro effect");
    }

    const clearedTags = end.effect.effects.map((effect) =>
      effect.type === "remove_effect" ? effect.effectTag : null,
    );

    expect(clearedTags).toEqual([
      "reckless_attack",
      "reckless_attack_exposed",
    ]);
  });
});

describe("trait_danger_sense", () => {
  const trait = findTrait("trait_danger_sense");

  it("is authored as an engine-backed rule", () => {
    expect(trait.implementation?.mode).toBe("engine");
  });

  it("carries real rule text rather than a placeholder", () => {
    expect(trait.lore?.shortDescription).not.toBe("placeholder");
    expect(trait.lore?.shortDescription.length).toBeGreaterThan(20);
  });

  it("grants advantage on Dexterity saves, not a numeric bonus", () => {
    const [modifier, ...rest] = trait.modifiers.fixed;

    expect(rest).toHaveLength(0);
    expect(modifier?.target).toBe("DEX_SAVE");
    expect(modifier?.type).toBe("advantage");
  });

  it("carries the visibility rider the engine cannot settle", () => {
    expect(trait.modifiers.fixed[0]?.appliesWhen).toContain("see");
  });

  it("is blocked by the three conditions that switch the benefit off", () => {
    expect(trait.modifiers.fixed[0]?.forbiddenStates).toEqual([
      "blinded",
      "deafened",
      "incapacitated",
    ]);
  });

  it("gates only on conditions the engine actually knows", () => {
    for (const state of trait.modifiers.fixed[0]?.forbiddenStates ?? []) {
      expect(CONDITION_MAP[state], state).toBeDefined();
    }
  });

  it("records the same conditions as implementation metadata", () => {
    expect(trait.implementation?.blockedBy).toEqual([
      "blinded",
      "deafened",
      "incapacitated",
    ]);
  });

  it("needs no action, because the benefit is passive", () => {
    expect(trait.actions).toEqual([]);
  });
});

describe("trait_extra_attack", () => {
  const trait = findTrait("trait_extra_attack");
  const modifier = trait.modifiers.fixed[0];

  it("is authored as an engine-backed rule", () => {
    expect(trait.implementation?.mode).toBe("engine");
  });

  it("carries real rule text rather than a placeholder", () => {
    expect(trait.lore?.shortDescription).not.toBe("placeholder");
    expect(trait.lore?.shortDescription.length).toBeGreaterThan(20);
  });

  it("competes for the attack count rather than adding to it", () => {
    expect(trait.modifiers.fixed).toHaveLength(1);
    expect(modifier?.target).toBe("ATTACKS_PER_ACTION");
    expect(modifier?.type).toBe("set_base");
  });

  it("grants a second attack from barbarian level five", () => {
    expect(modifier?.scalingFactor).toBe("class_level_thresholds");
    expect(modifier?.scalingClassId).toBe("class_barbarian");
    expect(modifier?.scalingThresholds).toEqual([
      { minimumLevel: 5, value: 2 },
    ]);
  });

  it("scales against a class the same pack actually defines", () => {
    const classIds = segment.classes.map((entry) => entry.id);

    expect(classIds).toContain(modifier?.scalingClassId);
  });

  it("is granted at the level its own threshold names", () => {
    const barbarian = segment.classes.find(
      (entry) => entry.id === "class_barbarian",
    );

    const grantLevel = barbarian?.progression.find((entry) =>
      entry.grants.includes("trait_extra_attack"),
    )?.level;

    expect(grantLevel).toBe(modifier?.scalingThresholds?.[0]?.minimumLevel);
  });

  it("needs no action, because the benefit is passive", () => {
    expect(trait.actions).toEqual([]);
  });
});
