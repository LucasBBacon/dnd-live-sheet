import type { CharacterEngineData } from "@project/shared";
import * as dotenv from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { characters } from "./schema.js";

dotenv.config({ path: "../../.env" });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is missing");

const client = postgres(connectionString);
const db = drizzle(client);

const seed = async () => {
  console.log("Seeding database...");

  // strictly typed mock engine data
  const mockEngineData: CharacterEngineData = {
    attributes: { str: 16, dex: 14, con: 15, int: 8, wis: 10, cha: 12 },
    race: {
      baseRaceId: "race_dwarf",
      hasSubraces: true,
      subraceId: "subrace_hill_dwarf",
    },
    classes: [
      {
        classId: "class_fighter",
        level: 1,
        subclassRequirementLevel: 3,
        subclassId: null,
      },
    ],
    hp: { max: 12, current: 12, temporary: 0 },
    globalModifiers: [],
  };

  try {
    await db
      .insert(characters)
      .values({
        userId: "dev-user-1",
        totalLevel: 1,
        currentHp: 12,
        engineData: mockEngineData,
        flavorData: {
          name: "Thoradin",
          alignment: "Lawful Good",
          eyeColor: "Brown",
        },
      })
      .onConflictDoNothing();

    console.log("Seeding complete.");
  } catch (err) {
    console.error("Seeding failed:", err);
  } finally {
    process.exit(0);
  }
};

seed();
