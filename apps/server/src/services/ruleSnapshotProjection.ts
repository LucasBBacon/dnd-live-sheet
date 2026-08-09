import {
  EquipmentDefinitionSchema,
  ItemDefinitionSchema,
  type EquipmentDefinition,
  type ItemDefinition,
  type WeaponDefinition,
} from "@project/shared";
import {
  hundredthsToPounds,
  toItemDefinition,
  toWeaponDefinition,
} from "@project/engine";

/** One row of the items table, as the snapshot builder reads it. */
export interface EquipmentRuleRow {
  id: string;
  name: string;
  /** hundredths of a pound - the storage-canonical weight */
  weight: number;
  itemRule: ItemDefinition | null;
  weaponRule: WeaponDefinition | null;
}

export interface RuleSnapshotProjection {
  equipmentById: Record<string, EquipmentDefinition>;
  itemsById: Record<string, ItemDefinition>;
  weaponsById: Record<string, WeaponDefinition>;
  /**
   * ids whose stored rule payload no longer parses. skipped, not fatal - unless
   * every row failed, in which case projectEquipmentRows throws instead of
   * returning this list
   */
  malformedItemIds: string[];
}

/**
 * A row with no authored rule still has to resolve to something, so it becomes
 * a bare piece of gear rather than vanishing from the snapshot.
 */
const fallbackItemRule = (
  row: Pick<EquipmentRuleRow, "id" | "name">,
): ItemDefinition =>
  ItemDefinitionSchema.parse({ id: row.id, name: row.name, type: "gear" });

/**
 * A WeaponDefinition minus the identity fields EquipmentDefinition already
 * carries. Destructured rather than enumerated so a field added to
 * WeaponDefinition arrives here on its own.
 */
const toWeaponCapability = ({
  id: _id,
  name: _name,
  ...capability
}: WeaponDefinition): EquipmentDefinition["weapon"] => capability;

/**
 * Turns stored item rows into the three lookup maps a rule snapshot exposes.
 *
 * Pure on purpose: the cache owns the query and the memoisation, this owns the
 * shape. That is what lets the round-trip test run without a database, which
 * is the only thing that reliably catches a dropped field.
 *
 * Fields are carried by spreading rather than by naming, so one added to
 * ItemDefinition arrives here automatically. EquipmentDefinitionSchema is
 * strict, so a field it does *not* know about fails loudly instead of being
 * silently dropped - which is exactly how weight, equipSlot, requiresAttunement
 * and ammoTag went missing for as long as they did.
 *
 * A single unparsable row is reported via malformedItemIds and otherwise
 * ignored. If every row in a non-empty set fails, that is treated as a
 * schema/data divergence rather than bad data, and this throws instead of
 * returning an empty snapshot; ruleSnapshotCache does not catch it, so it
 * surfaces to the caller as a request failure.
 */
export const projectEquipmentRows = (
  rows: EquipmentRuleRow[],
): RuleSnapshotProjection => {
  const equipmentById: Record<string, EquipmentDefinition> = {};
  const itemsById: Record<string, ItemDefinition> = {};
  const weaponsById: Record<string, WeaponDefinition> = {};
  const malformedItemIds: string[] = [];

  for (const row of rows) {
    const itemRule = row.itemRule ?? fallbackItemRule(row);

    const parsed = EquipmentDefinitionSchema.safeParse({
      ...itemRule,
      // the row is authoritative for identity for the same reason it is for
      // weight below: the columns are what everything else keys on, and a
      // payload written before a rename still carries the old name
      id: row.id,
      name: row.name,
      // the column is the canonical weight. payloads written before the
      // extractor carried weight hold a stale 0, so reading the column heals
      // them without a re-seed
      weight: hundredthsToPounds(row.weight),
      ...(row.weaponRule ? { weapon: toWeaponCapability(row.weaponRule) } : {}),
    });

    // one unparsable row must not take the whole snapshot - and with it every
    // request that needs one - down. the id is reported so the caller can log
    // it, and the item resolves to nothing, which InventoryExtractor already
    // surfaces as an unknown id
    if (!parsed.success) {
      malformedItemIds.push(row.id);
      continue;
    }

    const equipment = parsed.data;
    equipmentById[row.id] = equipment;
    itemsById[row.id] = toItemDefinition(equipment);

    const weapon = toWeaponDefinition(equipment);
    if (weapon) weaponsById[row.id] = weapon;
  }

  // one unparsable row is bad data, handled above. every row unparsable is a
  // different thing entirely - a schema change that no stored payload
  // satisfies - and skipping them all would hand back a snapshot in which
  // nothing resolves. the empty-catalogue case is excluded because zero of
  // zero failing is not a break, it is an empty table
  if (rows.length > 0 && malformedItemIds.length === rows.length) {
    throw new Error(
      `[ruleSnapshotProjection] every one of ${rows.length} item rows failed to parse against EquipmentDefinition; the stored rule payloads and the schema have diverged`,
    );
  }

  return { equipmentById, itemsById, weaponsById, malformedItemIds };
};
