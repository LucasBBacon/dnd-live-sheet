import { db } from "@project/database";
import { characters } from "@project/database/src/schema.js";
import { eq } from "drizzle-orm";
export const modifyCharacterHp = async (characterId, amount) => {
    // execute within a strict database transaction
    return await db.transaction(async (tx) => {
        // fetch character and LOCK ROW until transaction completes
        const [character] = await tx
            .select()
            .from(characters)
            .where(eq(characters.id, characterId))
            .for("update");
        if (!character) {
            throw new Error(`Character ${characterId} not found`);
        }
        const engineData = character.engineData;
        let { current, temporary, max } = engineData.hp;
        // 5E 2014 hp mechanics
        if (amount < 0) {
            // take damage
            let damage = Math.abs(amount);
            // temp hp absorbs damage first
            if (temporary > 0) {
                const tempDamage = Math.min(temporary, damage);
                temporary -= tempDamage;
                damage -= tempDamage;
            }
            // remaining damage applies to current hp
            current = Math.max(0, current - damage);
            // TODO: add instant death mechanics (massive damage) checks here
        }
        else {
            // healing
            // does not exceed max hp
            current = Math.min(max, current + amount);
        }
        // assign mutated values back to the engineData obj
        engineData.hp = { current, temporary, max };
        // commit updated state
        await tx
            .update(characters)
            .set({
            engineData: engineData,
            currentHp: current, // keep top-level indexed col in sync
            updatedAt: new Date(),
        })
            .where(eq(characters.id, characterId));
        return engineData.hp;
    });
};
//# sourceMappingURL=combatService.js.map