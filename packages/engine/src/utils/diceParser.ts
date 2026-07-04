/**
 * DiceEngine class provides functionality to parse standard dice notation and execute digital rolls.
 */
export class DiceEngine {

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
    // strip whitespace and force lowercase
    const cleanExpr = expression.replace(/\s+/g, "").toLowerCase();

    // regex to match XdY + Z or XdY - Z
    const match = cleanExpr.match(/^(\d+)d(\d+)([+-]\d+)?$/);

    if (!match) throw new Error(`Invalid dice expression: ${expression}`);

    const countRaw = match[1];
    const sidesRaw = match[2];
    const modifierRaw = match[3];

    if (!countRaw || !sidesRaw)
      throw new Error(`Invalid dice expression groups: ${expression}`);

    const count = parseInt(countRaw, 10);
    const sides = parseInt(sidesRaw, 10);
    const modifier = modifierRaw ? parseInt(modifierRaw, 10) : 0;

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
}
