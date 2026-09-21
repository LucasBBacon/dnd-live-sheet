import { asc } from "drizzle-orm";
import { characterClasses } from "@project/database/src/schema/operational.js";

/**
 * The order every character_classes read returns: the order the classes were
 * taken in, with class id breaking ties so the result never depends on how
 * Postgres happens to scan the table.
 *
 * Load-bearing, not cosmetic: the engine grants starting proficiencies - and
 * the choice blocks they carry - to CharacterSave.classes[0] only. Without an
 * order, an UPDATE on a multiclass character's first class could make its
 * second class read as first (#74).
 */
export const classLedgerOrder = [
  asc(characterClasses.position),
  asc(characterClasses.classId),
] as const;
