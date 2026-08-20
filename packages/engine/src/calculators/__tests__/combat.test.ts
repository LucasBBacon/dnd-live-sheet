import { describe, expect, it } from "vitest";
import { CombatEngine } from "../combat.js";
import type { Ability } from "../../types/core.js";
import type {
  FixedProficiencyGrant,
  RuntimeModifier,
  WeaponDefinition,
} from "@project/shared";
import type { WeaponAttackContext } from "../../types/combat.js";

const makeWeapon = (
  overrides: Partial<WeaponDefinition> = {},
): WeaponDefinition => ({
  id: "weapon_shortsword",
  name: "Shortsword",
  category: "martial_melee",
  damageDice: "1d6",
  damageType: "piercing",
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

const makeProf = (
  overrides: Partial<FixedProficiencyGrant>,
): FixedProficiencyGrant => ({
  category: "weapons",
  proficiencyId: "martial_melee",
  level: "proficient",
  requiredStates: [],
  ...overrides,
});

const makeMod = (overrides: Partial<RuntimeModifier>): RuntimeModifier => ({
  id: "mod_1",
  target: "ATTACK_BONUS",
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

const makeAttackContext = (
  overrides: Partial<WeaponAttackContext> = {},
): WeaponAttackContext => ({
  hand: "main_hand",
  attackUsage: "standard",
  isTwoHandedGrip: false,
  ...overrides,
});

describe("CombatEngine.calculateWeaponAttack - governing stat", () => {
  it("uses DEX for a finesse weapon when DEX modifier beats STR", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({ properties: ["finesse"] }),
      makeScores({ STR: 10, DEX: 16 }),
      2,
      [],
      [],
    );

    expect(result.breakdown.governingStat).toBe("DEX");
    expect(result.attackBonus).toBe(3);
  });

  it("uses STR for a finesse weapon when STR modifier beats DEX", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({ properties: ["finesse"] }),
      makeScores({ STR: 16, DEX: 10 }),
      2,
      [],
      [],
    );

    expect(result.breakdown.governingStat).toBe("STR");
    expect(result.attackBonus).toBe(3);
  });

  it("favors STR on a finesse tie", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({ properties: ["finesse"] }),
      makeScores({ STR: 14, DEX: 14 }),
      2,
      [],
      [],
    );

    expect(result.breakdown.governingStat).toBe("STR");
    expect(result.attackBonus).toBe(2);
  });

  it("always uses DEX for a ranged weapon even if STR is higher", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({ category: "martial_ranged", properties: [] }),
      makeScores({ STR: 18, DEX: 14 }),
      2,
      [],
      [],
    );

    expect(result.breakdown.governingStat).toBe("DEX");
    expect(result.attackBonus).toBe(2);
  });

  it("uses STR for a non-finesse melee weapon even if DEX is higher", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({ category: "martial_melee", properties: [] }),
      makeScores({ STR: 16, DEX: 20 }),
      2,
      [],
      [],
    );

    expect(result.breakdown.governingStat).toBe("STR");
    expect(result.attackBonus).toBe(3);
  });

  it("uses STR for a thrown melee weapon that lacks finesse", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({
        category: "simple_melee",
        properties: ["thrown"],
      }),
      makeScores({ STR: 14, DEX: 18 }),
      2,
      [],
      [],
    );

    expect(result.breakdown.governingStat).toBe("STR");
    expect(result.attackBonus).toBe(2);
  });

  it("uses CHA for attacks when the Hexblade state is active", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({ category: "martial_melee" }),
      makeScores({ STR: 10, DEX: 10, CHA: 16 }),
      0,
      [],
      [],
      ["hexblade"],
    );

    expect(result.breakdown.governingStat).toBe("CHA");
    expect(result.attackBonus).toBe(3);
  });

  it("uses WIS for attacks when the Shillelagh state is active", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({ category: "martial_melee" }),
      makeScores({ STR: 10, DEX: 10, WIS: 16 }),
      0,
      [],
      [],
      ["shillelagh"],
    );

    expect(result.breakdown.governingStat).toBe("WIS");
    expect(result.attackBonus).toBe(3);
  });

  it("applies a critical-hit modifier only when its required states are active", () => {
    const modifier = {
      type: "add_base_die",
      requiredStates: ["raging"],
      requiredAttackTypes: ["melee_weapon"],
    } as any;

    const inactive = CombatEngine.calculateWeaponAttack(
      makeWeapon({ category: "martial_melee" }),
      makeScores(),
      0,
      [],
      [],
      [],
      [modifier],
      true,
      "melee_weapon",
    );

    const active = CombatEngine.calculateWeaponAttack(
      makeWeapon({ category: "martial_melee" }),
      makeScores(),
      0,
      [],
      [],
      ["raging"],
      [modifier],
      true,
      "melee_weapon",
    );

    expect(inactive.criticalDamageExpression).toBe("1d6 piercing");
    expect(active.criticalDamageExpression).toBe("2d6 piercing");
  });

  it("ignores a critical-hit modifier while one of its forbidden states is active", () => {
    const modifier = {
      type: "add_base_die",
      forbiddenStates: ["prone"],
      requiredAttackTypes: ["melee_weapon"],
    } as any;

    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({ category: "martial_melee" }),
      makeScores(),
      0,
      [],
      [],
      ["prone"],
      [modifier],
      true,
      "melee_weapon",
    );

    expect(result.criticalDamageExpression).toBe("1d6 piercing");
  });
});

describe("CombatEngine.calculateWeaponAttack - proficiency", () => {
  it("grants proficiency bonus when the weapon category matches", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({ category: "martial_melee" }),
      makeScores(),
      3,
      [makeProf({ proficiencyId: "martial_melee" })],
      [],
    );

    expect(result.isProficient).toBe(true);
    expect(result.attackBonus).toBe(3);
    expect(result.breakdown.attack).toContain("Proficiency (+3)");
  });

  it("grants proficiency bonus when the specific weapon id matches", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({ id: "weapon_net", category: "martial_melee" }),
      makeScores(),
      3,
      [makeProf({ proficiencyId: "weapon_net" })],
      [],
    );

    expect(result.isProficient).toBe(true);
    expect(result.attackBonus).toBe(3);
  });

  it("does not grant proficiency from a non-weapons category, even with a matching id string", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({ category: "martial_melee" }),
      makeScores(),
      3,
      [makeProf({ category: "armor", proficiencyId: "martial_melee" })],
      [],
    );

    expect(result.isProficient).toBe(false);
    expect(result.attackBonus).toBe(0);
    expect(result.breakdown.attack).not.toContain("Proficiency (+3)");
  });

  it("does not grant proficiency when no proficiency entries match", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({ id: "weapon_longsword", category: "martial_melee" }),
      makeScores(),
      3,
      [makeProf({ proficiencyId: "simple_melee" })],
      [],
    );

    expect(result.isProficient).toBe(false);
    expect(result.attackBonus).toBe(0);
  });

  it("does not grant proficiency bonus with an empty proficiency list", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores(),
      3,
      [],
      [],
    );

    expect(result.isProficient).toBe(false);
    expect(result.attackBonus).toBe(0);
  });
});

describe("CombatEngine.calculateWeaponAttack - attack modifiers", () => {
  it("adds active ATTACK_BONUS modifiers and records them in the breakdown", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores(),
      0,
      [],
      [makeMod({ sourceName: "Bless", value: 2 })],
      [],
    );

    expect(result.attackBonus).toBe(2);
    expect(result.breakdown.attack).toContain("Bless (+2)");
  });

  it("ignores inactive modifiers", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores(),
      0,
      [],
      [makeMod({ sourceName: "Bless", value: 2, isActive: false })],
      [],
    );

    expect(result.attackBonus).toBe(0);
    expect(result.breakdown.attack).not.toContain("Bless (+2)");
  });

  it("ignores modifiers whose forbiddenStates are active", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores(),
      0,
      [],
      [
        makeMod({
          sourceName: "Steady Aim",
          value: 2,
          forbiddenStates: ["prone"],
        }),
      ],
      ["prone"],
    );

    expect(result.attackBonus).toBe(0);
  });

  it("applies modifiers whose forbiddenStates are not active", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores(),
      0,
      [],
      [
        makeMod({
          sourceName: "Steady Aim",
          value: 2,
          forbiddenStates: ["prone"],
        }),
      ],
      [],
    );

    expect(result.attackBonus).toBe(2);
  });

  it("excludes modifiers whose requiredStates are not satisfied", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores(),
      0,
      [],
      [
        makeMod({
          sourceName: "Bardic Inspiration",
          value: 1,
          requiredStates: ["inspired"],
        }),
      ],
      [],
    );

    expect(result.attackBonus).toBe(0);
  });

  it("includes modifiers whose requiredStates are satisfied", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores(),
      0,
      [],
      [
        makeMod({
          sourceName: "Bardic Inspiration",
          value: 1,
          requiredStates: ["inspired"],
        }),
      ],
      ["inspired"],
    );

    expect(result.attackBonus).toBe(1);
  });

  it("ignores ATTACK_BONUS modifiers whose type is not 'add'", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores(),
      0,
      [],
      [
        makeMod({
          sourceName: "Advantage Source",
          type: "advantage",
          value: 0,
        }),
      ],
      [],
    );

    expect(result.attackBonus).toBe(0);
  });
});

describe("CombatEngine.calculateWeaponAttack - damage bonus and offhand rules", () => {
  it("applies the governing stat bonus to damage by default", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores({ STR: 16 }),
      0,
      [],
      [],
      [],
    );

    expect(result.breakdown.damage).toEqual(["STR (+3)"]);
    expect(result.breakdown.attack).toEqual(["STR (+3)"]);
  });

  it("zeroes a positive stat bonus for an offhand attack without two-weapon fighting style", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores({ STR: 16 }),
      0,
      [],
      [],
      ["offhand_attack"],
    );

    expect(result.breakdown.damage).toEqual(["Offhand Damage (+0)"]);
    expect(result.breakdown.attack).toEqual(["STR (+3)"]);
  });

  it("preserves the stat bonus for an offhand attack with two-weapon fighting style", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores({ STR: 16 }),
      0,
      [],
      [],
      ["offhand_attack", "two_weapon_fighting_style"],
    );

    expect(result.breakdown.damage).toEqual(["STR (+3)"]);
    expect(result.breakdown.attack).toEqual(["STR (+3)"]);
  });

  it("does not zero a non-positive stat bonus on an offhand attack", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores({ STR: 8 }),
      0,
      [],
      [],
      ["offhand_attack"],
    );

    expect(result.breakdown.damage).toEqual(["STR (-1)"]);
    expect(result.breakdown.attack).toEqual(["STR (-1)"]);
  });

  it("uses a governing-stat-derived damage modifier for an offhand attack when the matching state is active", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores({ STR: 16 }),
      0,
      [],
      [
        makeMod({
          target: "DAMAGE_BONUS",
          sourceName: "Two-Weapon Fighting",
          value: 0,
          requiredStates: ["offhand_attack"],
          attackContext: "off_hand",
          valueSource: "attack_ability_modifier",
        } as RuntimeModifier),
      ],
      ["offhand_attack"],
    );

    expect(result.damageExpression).toBe("1d6 +3 piercing");
  });

  it("honours explicit attack context without needing the offhand state", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores({ STR: 16 }),
      0,
      [],
      [
        makeMod({
          target: "DAMAGE_BONUS",
          sourceName: "Two-Weapon Fighting",
          value: 0,
          attackContext: "off_hand",
          valueSource: "attack_ability_modifier",
        } as RuntimeModifier),
      ],
      [],
      [],
      false,
      undefined,
      makeAttackContext({
        hand: "off_hand",
        attackUsage: "two_weapon_bonus",
      }),
    );

    expect(result.context).toMatchObject({
      hand: "off_hand",
      attackUsage: "two_weapon_bonus",
    });
    expect(result.breakdown.damage).toEqual([
      "Offhand Damage (+0)",
      "Two-Weapon Fighting (+3)",
    ]);
    expect(result.damageExpression).toBe("1d6 +3 piercing");
  });

  it("applies hand-specific DAMAGE_BONUS modifiers only to the matching attack context", () => {
    const offhandResult = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores({ STR: 10 }),
      0,
      [],
      [
        makeMod({
          target: "DAMAGE_BONUS",
          sourceName: "Offhand Support",
          value: 2,
          attackContext: "off_hand",
        }),
      ],
      ["offhand_attack"],
    );

    const mainhandResult = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores({ STR: 10 }),
      0,
      [],
      [
        makeMod({
          target: "DAMAGE_BONUS",
          sourceName: "Offhand Support",
          value: 2,
          attackContext: "off_hand",
        }),
      ],
      [],
    );

    expect(offhandResult.damageExpression).toBe("1d6 +2 piercing");
    expect(mainhandResult.damageExpression).toBe("1d6 piercing");
  });

  it("adds active DAMAGE_BONUS modifiers to the total and records them on the damage breakdown", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores(),
      0,
      [],
      [makeMod({ target: "DAMAGE_BONUS", sourceName: "Hex", value: 3 })],
      [],
    );

    expect(result.breakdown.damage).toEqual(["STR (+0)", "Hex (+3)"]);
    expect(result.breakdown.attack).toEqual(["STR (0)"]);
    expect(result.damageExpression).toBe("1d6 +3 piercing");
  });

  it("resolves class-level threshold damage scaling", () => {
    const rageModifier = makeMod({
      target: "DAMAGE_BONUS",
      sourceName: "Rage",
      value: 2,
      scalingFactor: "class_level_thresholds",
      scalingClassId: "class_barbarian",
      scalingThresholds: [
        { minimumLevel: 1, value: 2 },
        { minimumLevel: 9, value: 3 },
        { minimumLevel: 16, value: 4 },
      ],
      requiredStates: ["status_raging"],
    });

    const levelEight = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores(),
      0,
      [],
      [rageModifier],
      ["status_raging"],
      [],
      false,
      undefined,
      undefined,
      { class_barbarian: 8 },
    );
    const levelNine = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores(),
      0,
      [],
      [rageModifier],
      ["status_raging"],
      [],
      false,
      undefined,
      undefined,
      { class_barbarian: 9 },
    );

    expect(levelEight.damageExpression).toBe("1d6 +2 piercing");
    expect(levelNine.damageExpression).toBe("1d6 +3 piercing");
  });

  it("ignores DAMAGE_BONUS modifiers whose type is not 'add'", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores(),
      0,
      [],
      [
        makeMod({
          target: "DAMAGE_BONUS",
          sourceName: "Vulnerable",
          type: "disadvantage",
          value: 5,
        }),
      ],
      [],
    );

    expect(result.damageExpression).toBe("1d6 piercing");
  });
});

describe("CombatEngine.calculateWeaponAttack - damage expression formatting", () => {
  it("omits the bonus number entirely when the total damage bonus is zero", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({ damageDice: "1d8", damageType: "slashing" }),
      makeScores({ STR: 10 }),
      0,
      [],
      [],
      [],
    );

    expect(result.damageExpression).toBe("1d8 slashing");
  });

  it("prefixes a positive damage bonus with a plus sign", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({ damageDice: "1d8", damageType: "slashing" }),
      makeScores({ STR: 16 }),
      0,
      [],
      [],
      [],
    );

    expect(result.damageExpression).toBe("1d8 +3 slashing");
  });

  it("prints a negative damage bonus with its minus sign", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({ damageDice: "1d8", damageType: "slashing" }),
      makeScores({ STR: 6 }),
      0,
      [],
      [],
      [],
    );

    expect(result.damageExpression).toBe("1d8 -2 slashing");
  });
});

describe("CombatEngine.calculateWeaponAttack - versatile dice selection", () => {
  it("uses the versatile dice when two-handed grip is active on a versatile weapon", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({
        damageDice: "1d8",
        versatileDamageDice: "1d10",
        properties: ["versatile"],
      }),
      makeScores(),
      0,
      [],
      [],
      ["two_handed_grip"],
    );

    expect(result.damageExpression).toBe("1d10 piercing");
  });

  it("uses the base dice when two-handed grip is not active on a versatile weapon", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({
        damageDice: "1d8",
        versatileDamageDice: "1d10",
        properties: ["versatile"],
      }),
      makeScores(),
      0,
      [],
      [],
      [],
    );

    expect(result.damageExpression).toBe("1d8 piercing");
  });

  it("uses the base dice when two-handed grip is active but the weapon is not versatile", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({ damageDice: "1d8", properties: [] }),
      makeScores(),
      0,
      [],
      [],
      ["two_handed_grip"],
    );

    expect(result.damageExpression).toBe("1d8 piercing");
  });

  it("uses the base dice when versatile is set but versatileDamageDice is undefined", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({
        damageDice: "1d8",
        properties: ["versatile"],
        versatileDamageDice: undefined,
      }),
      makeScores(),
      0,
      [],
      [],
      ["two_handed_grip"],
    );

    expect(result.damageExpression).toBe("1d8 piercing");
  });
});

describe("CombatEngine.calculateWeaponAttack - critical hit modifiers", () => {
  it("adds an extra base die to the damage expression on a critical hit when the modifier matches the attack type", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({ damageDice: "1d6", damageType: "piercing" }),
      makeScores(),
      0,
      [],
      [],
      [],
      [
        {
          type: "add_base_die",
          requiredAttackTypes: ["melee_weapon"],
          requiredStates: [],
          forbiddenStates: [],
        },
      ],
      true,
    );

    expect(result.damageExpression).toBe("2d6 piercing");
  });

  it("ignores critical hit modifiers whose required attack types do not match", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({ damageDice: "1d6", damageType: "piercing" }),
      makeScores(),
      0,
      [],
      [],
      [],
      [
        {
          type: "add_base_die",
          requiredAttackTypes: ["ranged_weapon"],
          requiredStates: [],
          forbiddenStates: [],
        },
      ],
      true,
    );

    expect(result.damageExpression).toBe("1d6 piercing");
  });

  it("marks critical damage as maximized when the modifier matches", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({ damageDice: "1d6", damageType: "piercing" }),
      makeScores(),
      0,
      [],
      [],
      [],
      [
        {
          type: "maximize_dice",
          requiredAttackTypes: ["melee_weapon"],
          requiredStates: [],
          forbiddenStates: [],
        },
      ],
      true,
    );

    expect(result.criticalDamageExpression).toBe("1d6 piercing");
    expect(result.criticalDamageMaximized).toBe(true);
  });
});

describe("CombatEngine.calculateWeaponAttack - return shape", () => {
  it("passes through weapon id and name", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({ id: "weapon_rapier", name: "Rapier" }),
      makeScores(),
      2,
      [],
      [],
      [],
    );

    expect(result.weaponId).toBe("weapon_rapier");
    expect(result.name).toBe("Rapier");
  });

  it("defaults activeStates to an empty array when omitted", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores(),
      0,
      [],
      [],
    );

    expect(result.breakdown.attack).not.toContain("Offhand Damage (+0)");
  });
});

describe("CombatEngine.calculateWeaponAttack - derived attack context states", () => {
  it("satisfies a melee STR gate without the caller supplying the context states", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores({ STR: 16 }),
      0,
      [],
      [
        makeMod({
          target: "DAMAGE_BONUS",
          sourceName: "Rage",
          value: 2,
          requiredStates: [
            "status_raging",
            "action_melee_attack",
            "action_using_str",
          ],
        }),
      ],
      ["status_raging"],
    );

    expect(result.damageBonus).toBe(5);
    expect(result.breakdown.damage).toContain("Rage (+2)");
  });

  it("blocks a melee gate on a ranged weapon", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({
        id: "weapon_longbow",
        category: "martial_ranged",
        properties: ["range"],
      }),
      makeScores({ STR: 16, DEX: 16 }),
      0,
      [],
      [
        makeMod({
          target: "DAMAGE_BONUS",
          sourceName: "Rage",
          value: 2,
          requiredStates: [
            "status_raging",
            "action_melee_attack",
            "action_using_str",
          ],
        }),
      ],
      ["status_raging"],
    );

    expect(result.damageBonus).toBe(3);
    expect(result.breakdown.damage).not.toContain("Rage (+2)");
  });

  it("blocks a STR gate on a finesse weapon that resolves to DEX", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({ properties: ["finesse"] }),
      makeScores({ STR: 10, DEX: 18 }),
      0,
      [],
      [
        makeMod({
          target: "DAMAGE_BONUS",
          sourceName: "Rage",
          value: 2,
          requiredStates: ["action_melee_attack", "action_using_str"],
        }),
      ],
      [],
    );

    expect(result.breakdown.governingStat).toBe("DEX");
    expect(result.damageBonus).toBe(4);
  });

  it("satisfies a ranged gate on a ranged weapon", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon({
        id: "weapon_longbow",
        category: "martial_ranged",
        properties: ["range"],
      }),
      makeScores({ DEX: 16 }),
      0,
      [],
      [
        makeMod({
          target: "DAMAGE_BONUS",
          sourceName: "Archery Rider",
          value: 1,
          requiredStates: ["action_ranged_attack", "action_using_dex"],
        }),
      ],
      [],
    );

    expect(result.damageBonus).toBe(4);
  });

  it("blocks a modifier forbidden on the derived melee context state", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores({ STR: 16 }),
      0,
      [],
      [
        makeMod({
          target: "DAMAGE_BONUS",
          sourceName: "Ranged Only",
          value: 5,
          forbiddenStates: ["action_melee_attack"],
        }),
      ],
      [],
    );

    expect(result.damageBonus).toBe(3);
  });
});

describe("CombatEngine.calculateWeaponAttack - roll state", () => {
  it("reports a normal roll when no advantage or disadvantage applies", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores(),
      0,
      [],
      [],
      [],
    );

    expect(result.rollState).toBe("normal");
    expect(result.breakdown.attack).toEqual(["STR (0)"]);
  });

  it("reports advantage granted by its source", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores(),
      0,
      [],
      [
        makeMod({
          sourceName: "Reckless Attack",
          type: "advantage",
          requiredStates: ["status_reckless_attack", "action_melee_attack"],
        }),
      ],
      ["status_reckless_attack"],
    );

    expect(result.rollState).toBe("advantage");
    expect(result.breakdown.attack).toContain(
      "Advantage (Granted by Reckless Attack)",
    );
  });

  it("leaves the numeric attack bonus untouched when advantage applies", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores({ STR: 14 }),
      2,
      [makeProf({})],
      [makeMod({ sourceName: "Reckless Attack", type: "advantage" })],
      [],
    );

    expect(result.attackBonus).toBe(4);
  });

  it("reports disadvantage imposed by its source", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores(),
      0,
      [],
      [makeMod({ sourceName: "Prone", type: "disadvantage" })],
      [],
    );

    expect(result.rollState).toBe("disadvantage");
    expect(result.breakdown.attack).toContain(
      "Disadvantage (Imposed by Prone)",
    );
  });

  it("cancels advantage against disadvantage back to a straight roll", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores(),
      0,
      [],
      [
        makeMod({ id: "mod_adv", sourceName: "Reckless Attack", type: "advantage" }),
        makeMod({ id: "mod_dis", sourceName: "Prone", type: "disadvantage" }),
      ],
      [],
    );

    expect(result.rollState).toBe("normal");
    expect(result.breakdown.attack).toContain(
      "Straight Roll (Advantage/Disadvantage cancel out)",
    );
  });

  it("ignores an advantage modifier whose required states are not met", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores(),
      0,
      [],
      [
        makeMod({
          sourceName: "Reckless Attack",
          type: "advantage",
          requiredStates: ["status_reckless_attack"],
        }),
      ],
      [],
    );

    expect(result.rollState).toBe("normal");
  });

  it("ignores an advantage modifier aimed at a target other than ATTACK_BONUS", () => {
    const result = CombatEngine.calculateWeaponAttack(
      makeWeapon(),
      makeScores(),
      0,
      [],
      [makeMod({ target: "STEALTH_CHECK", sourceName: "Cloak", type: "advantage" })],
      [],
    );

    expect(result.rollState).toBe("normal");
  });
});

/**
 * Brutal Critical's shape: one extra die at 9th, two at 13th, three at 17th.
 *
 * The count scales rather than the trait being granted three times - the pack
 * re-grants trait_brutal_critical at each threshold, which dedupes to one
 * instance, exactly as trait_rage does while carrying its real progression in
 * scalingThresholds.
 */
describe("CombatEngine.calculateWeaponAttack - scaled critical dice", () => {
  const brutalCritical = () =>
    ({
      type: "add_base_die",
      scalingFactor: "class_level_thresholds",
      scalingClassId: "class_barbarian",
      scalingThresholds: [
        { minimumLevel: 9, value: 1 },
        { minimumLevel: 13, value: 2 },
        { minimumLevel: 17, value: 3 },
      ],
      requiredAttackTypes: ["melee_weapon"],
    }) as any;

  const critAt = (classLevel: number, modifiers: unknown[]) =>
    CombatEngine.calculateWeaponAttack(
      makeWeapon({ category: "martial_melee" }),
      makeScores(),
      0,
      [],
      [],
      [],
      modifiers as any,
      true,
      "melee_weapon",
      undefined,
      { class_barbarian: classLevel },
    ).criticalDamageExpression;

  it("adds nothing below the first threshold", () => {
    expect(critAt(8, [brutalCritical()])).toBe("1d6 piercing");
  });

  it("adds one die at the first threshold", () => {
    expect(critAt(9, [brutalCritical()])).toBe("2d6 piercing");
  });

  it("adds two dice at the second threshold", () => {
    expect(critAt(13, [brutalCritical()])).toBe("3d6 piercing");
  });

  it("adds three dice at the third threshold", () => {
    expect(critAt(17, [brutalCritical()])).toBe("4d6 piercing");
  });

  it("stacks with an unscaled one-die modifier", () => {
    // a half-orc barbarian 17: Savage Attacks' die plus Brutal Critical's three
    const savageAttacks = {
      type: "add_base_die",
      requiredAttackTypes: ["melee_weapon"],
    };

    expect(critAt(17, [savageAttacks, brutalCritical()])).toBe("5d6 piercing");
  });

  it("honours an explicit dieCount with no scaling at all", () => {
    const flatPair = { type: "add_base_die", dieCount: 2 };

    expect(critAt(1, [flatPair])).toBe("3d6 piercing");
  });
});
