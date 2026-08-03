-- Renames the body-armor slot from 'armor' to 'body'.
--
-- The old name collided with the item *type* value of the same name, which is
-- what routed rings into the chest slot. Slot legality now comes from each
-- item's authored equipSlot instead of its type.
--
-- 'ring' becomes 'ring_1': a single ring slot became two.
UPDATE "character_inventory" SET "slot" = 'body' WHERE "slot" = 'armor';
UPDATE "character_inventory" SET "slot" = 'ring_1' WHERE "slot" = 'ring';
