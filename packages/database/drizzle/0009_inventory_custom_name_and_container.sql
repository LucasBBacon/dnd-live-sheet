-- Adds the two InventoryInstance fields that were present in the shared schema
-- but missing from the database table, so the server-side SELECT can include them.
--
-- custom_name: player-supplied display override for a renamed item.
-- container_id: row id of the containing inventory row when the item is inside
--   another item (e.g., arrows inside a quiver). NULL means loose in the pack.

ALTER TABLE "character_inventory" ADD COLUMN "custom_name" varchar(255);
ALTER TABLE "character_inventory" ADD COLUMN "container_id" uuid;
