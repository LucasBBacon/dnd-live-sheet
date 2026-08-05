// #region Resource Types

export interface HitDicePool {
  dieSize: number;
  maxDice: number;
  currentDice: number;
}

/**
 * The persisted half of a resource: which one, and how much is left.
 *
 * Deliberately narrow. Name, maximum and reset condition are all derived from
 * the rule dictionary at read time, so a level up or a rules change updates
 * every character without migrating stored rows.
 */
export interface OperationalResource {
  id: string;
  current: number;
}

// #endregion
