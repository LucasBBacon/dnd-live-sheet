import { describe, expect, it } from "vitest";
import { CombatEngine } from "../combat.js";
import type { Ability } from "../../types/core.js";
import type { WeaponView } from "../../rules/equipmentProjection.js";

const makeWeapon = (
  overrides: Partial<WeaponView> = {},
): WeaponView => ({
  id: "item_weapon_greataxe",
  name: "Greataxe",
  categoryTags: ["category_weapon_martial", "category_weapon_martial_melee"],
  category: "martial_melee",
  damageDice: "1d12",
  damageType: "slashing",
  properties: [],
  range: 5,
  ...overrides,
});

const makeScores = (
  overrides: Partial<Record<Ability, number>> = {},
): Record<Ability, number> => ({
  STR: 10,
  DEX: 10,
  CON: 10,
  INT: 10,
  WIS: 10,
  CHA: 10,
  ...overrides,
});

/** Calls calculateWeaponAttack with the crit-relevant arguments only. */
const critFor = (
  criticalHitModifiers: unknown[],
  weapon: WeaponView = makeWeapon(),
  classLevels: Record<string, number> = {},
) =>
  CombatEngine.calculateWeaponAttack(
    weapon,
    makeScores(),
    0,
    [],
    [],
    [],
    criticalHitModifiers as never,
    true,
    "melee_weapon",
    undefined,
    classLevels,
  );

describe("critical damage - base doubling", () => {
  it("doubles the weapon damage dice on a critical hit", () => {
    expect(critFor([]).criticalDamageExpression).toBe("2d12 slashing");
  });

  it("leaves the non-critical damage expression undoubled", () => {
    const notACrit = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores(),
      0,
      [],
      [],
      [],
      [],
      false,
      "melee_weapon",
    );

    expect(notACrit.damageExpression).toBe("1d12 slashing");
    expect(notACrit.criticalDamageExpression).toBe("2d12 slashing");
  });
});

describe("critical damage - add_base_die", () => {
  it("adds its die on top of the doubled pool", () => {
    const modifier = {
      type: "add_base_die",
      requiredAttackTypes: ["melee_weapon"],
    };

    expect(critFor([modifier]).criticalDamageExpression).toBe("3d12 slashing");
  });

  it("stacks two independent modifiers", () => {
    const savageAttacks = {
      type: "add_base_die",
      requiredAttackTypes: ["melee_weapon"],
    };
    const brutalCritical = {
      type: "add_base_die",
      requiredAttackTypes: ["melee_weapon"],
    };

    expect(
      critFor([savageAttacks, brutalCritical]).criticalDamageExpression,
    ).toBe("4d12 slashing");
  });

  it("contributes nothing when gated on an attack type that does not match", () => {
    const modifier = {
      type: "add_base_die",
      requiredAttackTypes: ["ranged_weapon"],
    };

    expect(critFor([modifier]).criticalDamageExpression).toBe("2d12 slashing");
  });

  it("contributes nothing below its first class level threshold", () => {
    const brutalCritical = {
      type: "add_base_die",
      scalingFactor: "class_level_thresholds",
      scalingClassId: "class_barbarian",
      scalingThresholds: [{ minimumLevel: 9, value: 1 }],
      requiredAttackTypes: ["melee_weapon"],
    };

    expect(
      critFor([brutalCritical], makeWeapon(), { class_barbarian: 8 })
        .criticalDamageExpression,
    ).toBe("2d12 slashing");
  });

  it("adds its resolved threshold count at level", () => {
    const brutalCritical = {
      type: "add_base_die",
      scalingFactor: "class_level_thresholds",
      scalingClassId: "class_barbarian",
      scalingThresholds: [
        { minimumLevel: 9, value: 1 },
        { minimumLevel: 13, value: 2 },
      ],
      requiredAttackTypes: ["melee_weapon"],
    };

    expect(
      critFor([brutalCritical], makeWeapon(), { class_barbarian: 13 })
        .criticalDamageExpression,
    ).toBe("4d12 slashing");
  });
});

describe("critical damage - add_specific_die", () => {
  it("appends its die rather than replacing the weapon dice", () => {
    const modifier = {
      type: "add_specific_die",
      diceToAdd: "1d6",
      damageType: "fire",
      requiredAttackTypes: ["melee_weapon"],
    };

    expect(critFor([modifier]).criticalDamageExpression).toBe(
      "2d12 slashing + 1d6 fire",
    );
  });

  it("inherits the weapon damage type when the modifier does not name one", () => {
    const modifier = {
      type: "add_specific_die",
      diceToAdd: "1d6",
      requiredAttackTypes: ["melee_weapon"],
    };

    const result = critFor([modifier]);

    expect(result.criticalDamage[1]?.damageType).toBe("slashing");
    // one damage type, so both die sizes render under the single group
    expect(result.criticalDamageExpression).toBe("2d12 + 1d6 slashing");
  });

  it("merges into the weapon pool when it inherits the weapon die size", () => {
    const modifier = {
      type: "add_specific_die",
      diceToAdd: "1d12",
      requiredAttackTypes: ["melee_weapon"],
    };

    expect(critFor([modifier]).criticalDamageExpression).toBe("3d12 slashing");
  });

  it("is not itself doubled", () => {
    const modifier = {
      type: "add_specific_die",
      diceToAdd: "2d6",
      damageType: "fire",
      requiredAttackTypes: ["melee_weapon"],
    };

    expect(critFor([modifier]).criticalDamageExpression).toBe(
      "2d12 slashing + 2d6 fire",
    );
  });
});

describe("critical damage - segments", () => {
  it("exposes the weapon dice as a segment", () => {
    expect(critFor([]).criticalDamage).toEqual([
      expect.objectContaining({
        sourceName: "Greataxe",
        baseDice: "2d12",
        damageType: "slashing",
      }),
    ]);
  });

  it("names the granting trait as the source of an appended die", () => {
    const modifier = {
      type: "add_specific_die",
      diceToAdd: "1d6",
      damageType: "fire",
      sourceName: "Flame Tongue",
      requiredAttackTypes: ["melee_weapon"],
    };

    expect(critFor([modifier]).criticalDamage).toEqual([
      expect.objectContaining({ sourceName: "Greataxe", baseDice: "2d12" }),
      expect.objectContaining({
        sourceName: "Flame Tongue",
        baseDice: "1d6",
        damageType: "fire",
      }),
    ]);
  });

  it("marks every critical segment maximized when a maximize_dice modifier matches", () => {
    const modifier = {
      type: "maximize_dice",
      requiredAttackTypes: ["melee_weapon"],
    };

    const segments = critFor([modifier]).criticalDamage;

    expect(segments.every((segment) => segment.maximized)).toBe(true);
  });
});

describe("flat damage survives the critical-hit maths", () => {
  const blowgun = makeWeapon({
    id: "item_weapon_blowgun",
    name: "Blowgun",
    categoryTags: ["category_weapon_simple", "category_weapon_simple_ranged"],
    category: "simple_ranged",
    damageDice: "1",
    damageType: "piercing",
    properties: ["ammunition", "loading"],
    range: 25,
    longRange: 100,
  });

  it("renders flat damage as a bonus term rather than 1d0", () => {
    // makeScores() is all 10s, so the ability modifier is 0 and the only
    // damage in the pool is the blowgun's flat 1
    const attack = CombatEngine.calculateWeaponAttack(
      blowgun,
      makeScores(),
      0,
      [],
      [],
      [],
      [],
      false,
      "ranged_weapon",
    );

    expect(attack.damageExpression).toBe("+1 piercing");
  });

  it("does not double flat damage on a critical hit", () => {
    // 5e doubles damage *dice*; a blowgun has none, so a crit is still 1
    expect(critFor([], blowgun).criticalDamageExpression).toBe("+1 piercing");
  });

  it("still doubles an ordinary dice pool", () => {
    // the guard must not disturb the weapon every other test in this file uses
    expect(critFor([]).criticalDamageExpression).toBe("2d12 slashing");
  });

  it("does not hand the ability bonus to a rider when the weapon's own group is filtered out", () => {
    // "0" parses to zero dice AND a zero modifier, so the weapon's slashing
    // group is empty and gets dropped by the pre-map filter entirely. Before
    // this round's fix, the bonus followed array position after filtering
    // and would have landed on whichever group survived - here, the fire
    // rider added by the critical hit - even though it belongs to slashing.
    const uselessWeapon = makeWeapon({
      name: "Training Weapon",
      damageDice: "0",
      damageType: "slashing",
    });
    const flameRider = {
      type: "add_specific_die",
      diceToAdd: "1d6",
      damageType: "fire",
      requiredAttackTypes: ["melee_weapon"],
    };

    const attack = CombatEngine.calculateWeaponAttack(
      uselessWeapon,
      makeScores({ STR: 14 }), // +2 STR mod, so there is a bonus to misattach
      0,
      [],
      [],
      [],
      [flameRider] as never,
      true,
      "melee_weapon",
    );

    // the +2 belonged to the dropped slashing group; it must not resurface
    // attached to fire
    expect(attack.criticalDamageExpression).toBe("1d6 fire");
  });
});
