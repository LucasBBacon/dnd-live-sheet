import type { Ability, DamageType, DiceRule, DiceRuleTarget } from "@project/shared";

export interface DiceRuleContext {
  activeStates: string[];
  sides: number;
  rollFn?: (sides: number) => number;
  requiredDamageType?: DamageType;
  ability?: Ability;
  abilityScores?: Record<Ability, number>;
}

export interface ParsedDiceExpression {
  count: number;
  sides: number;
  modifier: number;
}

export class DiceEngine {
  public static parse(expression: string): ParsedDiceExpression {
    const cleanExpr = expression.replace(/\s+/g, "").toLowerCase();
    const flatMatch = cleanExpr.match(/^(\d+)$/);
    if (flatMatch?.[1]) {
      return { count: 0, sides: 0, modifier: Number.parseInt(flatMatch[1], 10) };
    }

    const match = cleanExpr.match(/^(\d+)d(\d+)([+-]\d+)?$/);
    if (!match || !match[1] || !match[2]) {
      throw new Error(`Invalid dice expression: ${expression}`);
    }

    return {
      count: Number.parseInt(match[1], 10),
      sides: Number.parseInt(match[2], 10),
      modifier: match[3] ? Number.parseInt(match[3], 10) : 0,
    };
  }

  public static applyDiceRulesToRollResult(
    rollResult: { total: number; rolls: number[]; modifier: number },
    rules: DiceRule[],
    target: DiceRuleTarget,
    context: DiceRuleContext,
  ): { total: number; rolls: number[]; modifier: number; flooredBy?: string } {
    const appliedRolls = this.applyDiceRules(rollResult.rolls, rules, target, context);
    let total = appliedRolls.reduce((sum, value) => sum + value, 0) + rollResult.modifier;
    let flooredBy: string | undefined;

    for (const rule of rules) {
      if (
        rule.target !== target ||
        !this.matchesStateRequirements(rule, context) ||
        rule.mutator.type !== "minimum_total"
      ) continue;

      const floor = rule.mutator.floorSource === "ability_score"
        ? context.abilityScores?.[rule.requiredAbility ?? context.ability ?? "STR"]
        : rule.mutator.floorValue;
      if (floor !== undefined && total < floor) {
        total = floor;
        flooredBy = rule.mutator.floorSource === "ability_score"
          ? `${rule.requiredAbility ?? context.ability ?? "ability"} score`
          : "fixed floor";
      }
    }

    return {
      total: Math.max(0, total),
      rolls: appliedRolls,
      modifier: rollResult.modifier,
      ...(flooredBy !== undefined && { flooredBy }),
    };
  }

  public static applyDiceRulesToExpression(
    expression: string,
    rules: DiceRule[],
    target: DiceRuleTarget,
    context: DiceRuleContext,
  ): { total: number; rolls: number[]; modifier: number; flooredBy?: string } {
    const baseRoll = this.rollDigital(expression);
    return this.applyDiceRulesToRollResult(baseRoll, rules, target, {
      ...context,
      sides: this.parse(expression).sides,
    });
  }

  private static matchesStateRequirements(
    rule: DiceRule,
    context: DiceRuleContext,
  ): boolean {
    if (
      rule.requiredStates &&
      !rule.requiredStates.every((state) => context.activeStates.includes(state))
    ) return false;
    if (
      rule.requiredDamageType &&
      rule.requiredDamageType !== context.requiredDamageType
    ) return false;
    if (rule.requiredAbility !== undefined && rule.requiredAbility !== context.ability) {
      return false;
    }
    return true;
  }

  private static applyMutator(
    rolls: number[],
    rule: DiceRule,
    context: DiceRuleContext,
  ): number[] {
    const mutator = rule.mutator;
    if (mutator.type === "reroll_once") {
      const triggerValues = new Set(mutator.triggerOn ?? []);
      return rolls.map((roll) =>
        triggerValues.has(roll)
          ? context.rollFn
            ? context.rollFn(context.sides)
            : roll
          : roll,
      );
    }
    if (mutator.type === "minimum_value") {
      const floorValue = mutator.floorValue ?? 1;
      return rolls.map((roll) => Math.max(roll, floorValue));
    }
    return rolls;
  }

  public static applyDiceRules(
    rolls: number[],
    rules: DiceRule[],
    target: DiceRuleTarget,
    context: DiceRuleContext,
  ): number[] {
    let currentRolls = [...rolls];
    for (const rule of rules) {
      if (rule.target !== target || !this.matchesStateRequirements(rule, context)) continue;
      currentRolls = this.applyMutator(currentRolls, rule, context);
    }
    return currentRolls;
  }

  public static rollDigital(expression: string): {
    total: number;
    rolls: number[];
    modifier: number;
  } {
    const { count, sides, modifier } = this.parse(expression);
    const rolls: number[] = [];
    let sum = 0;
    for (let i = 0; i < count; i++) {
      const result = Math.floor(Math.random() * sides) + 1;
      rolls.push(result);
      sum += result;
    }
    return { total: Math.max(0, sum + modifier), rolls, modifier };
  }

  public static rollMaximized(expression: string): {
    total: number;
    rolls: number[];
    modifier: number;
  } {
    const { count, sides, modifier } = this.parse(expression);
    const rolls = Array.from({ length: count }, () => sides);
    return { total: Math.max(0, count * sides + modifier), rolls, modifier };
  }
}
