import { db } from "@project/database";
import { characterInventory, characters } from "@project/database/src/schema/operational.js";
import { items } from "@project/database/src/schema/reference.js";
import { eq } from "drizzle-orm";

type DevLoadoutItem = {
  itemId: string;
  quantity: number;
  slot: string;
};

const DEV_LOADOUT: DevLoadoutItem[] = [
  { itemId: "item_armor_leather", quantity: 1, slot: "armor" },
  { itemId: "item_weapon_longsword", quantity: 1, slot: "main_hand" },
  { itemId: "item_weapon_longbow", quantity: 1, slot: "backpack" },
  { itemId: "item_torch", quantity: 1, slot: "backpack" },
];

const parseCharacterIdArg = (): string | undefined => {
  const arg = process.argv.find((token) => token.startsWith("--characterId="));
  if (!arg) return process.env.DEV_CHARACTER_ID;
  return arg.split("=")[1];
};

const run = async () => {
  const characterId = parseCharacterIdArg();
  if (!characterId) {
    throw new Error(
      "Missing character id. Use --characterId=<uuid> or set DEV_CHARACTER_ID.",
    );
  }

  const [character] = await db
    .select({ id: characters.id, campaignId: characters.campaignId })
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);

  if (!character) {
    throw new Error(`Character not found: ${characterId}`);
  }

  for (const entry of DEV_LOADOUT) {
    const [item] = await db
      .select({ id: items.id })
      .from(items)
      .where(eq(items.id, entry.itemId))
      .limit(1);

    if (!item) {
      throw new Error(`Required loadout item does not exist: ${entry.itemId}`);
    }
  }

  await db.transaction(async (tx) => {
    // Normalise existing equipment to backpack before applying deterministic dev loadout.
    await tx
      .update(characterInventory)
      .set({ slot: "backpack" })
      .where(eq(characterInventory.characterId, characterId));

    for (const entry of DEV_LOADOUT) {
      await tx
        .insert(characterInventory)
        .values({
          characterId,
          itemId: entry.itemId,
          quantity: entry.quantity,
          slot: entry.slot,
          isAttuned: false,
        })
        .onConflictDoUpdate({
          target: [characterInventory.characterId, characterInventory.itemId],
          set: {
            quantity: entry.quantity,
            slot: entry.slot,
            isAttuned: false,
          },
        });
    }
  });

  const seededRows = await db
    .select({
      itemId: characterInventory.itemId,
      quantity: characterInventory.quantity,
      slot: characterInventory.slot,
    })
    .from(characterInventory)
    .where(eq(characterInventory.characterId, characterId));

  console.log(`Seeded dev inventory for character ${characterId}`);
  console.table(seededRows);
};

run()
  .catch((error) => {
    console.error("Failed to seed dev inventory:", error);
    process.exitCode = 1;
  });
