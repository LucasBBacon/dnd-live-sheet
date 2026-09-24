/**
 * A character's total level, read from its class ledger.
 *
 * The ledger - one level count per class - is what the server derives a
 * level-up's expected total from, and what it writes the level column from
 * on success (#90). The column can drift from it; the ledger cannot. Every
 * web caller that needs a character's total level reads this rather than
 * the column, so a drifted row can still level up and be repaired (#95).
 * @param classLevels Class id -> that class's level
 * @returns The sum of every class's level
 */
export const ledgerTotalLevel = (classLevels: Record<string, number>): number =>
  Object.values(classLevels).reduce((sum, level) => sum + level, 0);
