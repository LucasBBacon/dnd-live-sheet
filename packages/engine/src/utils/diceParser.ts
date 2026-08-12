import type { DiceRule, DiceRuleTarget } from "@project/shared";

export interface DiceRuleContext {
  activeStates: string[];
  sides: number;
  rollFn?: (sides: number) => number;
  requiredDamageType?: string;
}

export interface ParsedDiceExpression {
  count: number;
  sides: number;
  modifier: number;
}

/**
 * DiceEngine class provides functionality to parse standard dice notation and execute digital rolls.
 */
export class DiceEngine {
  public static parse(expression: string): ParsedDiceExpression {
    const cleanExpr = expression.replace(/\s+/g, "").toLowerCase();
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

  private static matchesStateRequirements(
    rule: DiceRule,
    activeStates: string[],
    requiredDamageType?: string,
  ): boolean {
    if (
      rule.requiredStates &&
      !rule.requiredStates.every((state) => activeStates.includes(state))
    ) {
      return false;
    }

    if (
      requiredDamageType &&
      rule.requiredDamageType &&
      rule.requiredDamageType !== requiredDamageType
    ) {
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
      return rolls.map((roll) => {
        if (!triggerValues.has(roll)) return roll;
        return context.rollFn ? context.rollFn(context.sides) : roll;
      });
    }

    if (mutator.type === "minimum_value") {
      const floorValue = mutator.floorValue ?? 1;
      return rolls.map((roll) => Math.max(roll, floorValue));
    }

    if (mutator.type === "explode") {
      return rolls.map((roll) => roll);
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
      if (rule.target !== target) continue;
      if (
        !this.matchesStateRequirements(
          rule,
          context.activeStates,
          context.requiredDamageType,
        )
      )
        continue;
      currentRolls = this.applyMutator(currentRolls, rule, context);
    }

    return currentRolls;
  }

  /**
   * Parses standard notation and executes a digital roll.
   * @param expression Standard roll notation (e.g., "2d6 + 3")
   * @returns An object containing the total roll, individual rolls, and modifier
   */
  public static rollDigital(expression: string): {
    total: number;
    rolls: number[];
    modifier: number;
  } {
    const { count, sides, modifier } = this.parse(expression);

    const rolls: number[] = [];
    let sum = 0;

    for (let i = 0; i < count; i++) {
      // 1-indexed random roll
      const result = Math.floor(Math.random() * sides) + 1;
      rolls.push(result);
      sum += result;
    }

    return {
      total: Math.max(0, sum + modifier),
      rolls,
      modifier,
    };
  }

  public static rollMaximized(expression: string): {
    total: number;
    rolls: number[];
    modifier: number;
  } {
    const { count, sides, modifier } = this.parse(expression);
    const rolls = Array.from({ length: count }, () => sides);

    return {
      total: Math.max(0, count * sides + modifier),
      rolls,
      modifier,
    };
  }
}
