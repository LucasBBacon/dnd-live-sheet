import type { CharacterEngineData } from "@project/shared";
import * as dotenv from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { characters } from "./schema.js";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  feats,
  featTraits,
  traits,
  featPrerequisiteFeats,
  races,
  raceTraits,
  subraces,
  subraceTraits,
  classes,
  classLevels,
  classProgressions,
  subclasses,
  subclassLevels,
  subclassProgressions,
} from "./reference.js";

dotenv.config({ path: "../../.env" });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is missing");

const client = postgres(connectionString);
const db = drizzle(client);

const loadJsonData = async <T>(filename: string): Promise<T[]> => {
  try {
    const currentFilePath = fileURLToPath(import.meta.url);
    const filePath = path.resolve(
      path.dirname(currentFilePath),
      `../data/${filename}`,
    );
    const fileContent = await fs.readFile(filePath, "utf-8");
    return JSON.parse(fileContent);
  } catch (error) {
    console.warn(`[Warning] Could not load ${filename}. Skipping...`);
    return [];
  }
};

const normalizeSpeed = (speed: unknown): number => {
  if (typeof speed === "number") return speed;
  if (
    speed &&
    typeof speed === "object" &&
    "walk" in speed &&
    typeof (speed as { walk?: unknown }).walk === "number"
  ) {
    return (speed as { walk: number }).walk;
  }
  return 30;
};

const runMigration = async () => {
  console.log("Initiating Reference Data ETL Pipeline...");

  try {
    // EXTRACT: load raw JSON payloads
    const rawTraits = await loadJsonData<any>("traits.json");
    const rawFeats = await loadJsonData<any>("feats.json");

    // LOAD: traits (base entity)
    if (rawTraits.length > 0) {
      console.log(`Processing ${rawTraits.length} Traits...`);

      const mappedTraits = rawTraits.map((t: any) => ({
        id: t.id,
        name: t.name,
        lore: t.lore,
        effects: t.effects || [],
        isStartingProficiency: t.isStartingProficiency ?? false,
      }));

      await db
        .insert(traits)
        .values(mappedTraits)
        .onConflictDoNothing({ target: traits.id });
    }

    // LOAD: feats (base entity)
    if (rawFeats.length > 0) {
      console.log(`Processing ${rawFeats.length} Feats...`);

      const mappedFeats = rawFeats.map((f: any) => ({
        id: f.id,
        name: f.name,
        category: f.category,
        source: f.source || null,
        repeatable: f.repeatable ?? false,
        lore: f.lore,
        prerequisites: f.prerequisites || null,
      }));

      await db
        .insert(feats)
        .values(mappedFeats)
        .onConflictDoNothing({ target: feats.id });

      // TRANSFORM AND LOAD: junction tables
      console.log("Resolving Relational Integrity (junctions)");

      const featTraitsRelations: { featId: string; traitId: string }[] = [];
      const featPrereqRelations: { featId: string; requiredFeatId: string }[] =
        [];

      for (const f of rawFeats) {
        // map granted traits
        if (Array.isArray(f.grantedTraits)) {
          for (const traitId of f.grantedTraits) {
            featTraitsRelations.push({ featId: f.id, traitId });
          }
        }

        // map prerequisite feats
        if (Array.isArray(f.prerequisites?.requiredFeatIds)) {
          for (const reqFeatId of f.prerequisites.requiredFeatIds) {
            featPrereqRelations.push({
              featId: f.id,
              requiredFeatId: reqFeatId,
            });
          }
        }
      }

      if (featTraitsRelations.length > 0) {
        await db
          .insert(featTraits)
          .values(featTraitsRelations)
          .onConflictDoNothing();
      }

      if (featPrereqRelations.length > 0) {
        await db
          .insert(featPrerequisiteFeats)
          .values(featPrereqRelations)
          .onConflictDoNothing();
      }
    }

    // 5. LOAD: Races & Subraces
    const rawRaces = await loadJsonData<any>("races.json");
    const rawSubraces = await loadJsonData<any>("subraces.json");

    if (rawRaces.length > 0) {
      console.log(`Processing ${rawRaces.length} Races...`);
      await db
        .insert(races)
        .values(
          rawRaces.map((r: any) => ({
            id: r.id,
            name: r.name,
            speed: normalizeSpeed(r.speed),
            requiresSubrace: r.requiresSubrace ?? false, // Strict requirement enforcement
            lore: r.lore,
          })),
        )
        .onConflictDoNothing();

      const raceTraitsData = rawRaces.flatMap((r: any) =>
        (r.traits || []).map((traitId: string) => ({ raceId: r.id, traitId })),
      );
      if (raceTraitsData.length > 0)
        await db
          .insert(raceTraits)
          .values(raceTraitsData)
          .onConflictDoNothing();
    }

    if (rawSubraces.length > 0) {
      console.log(`Processing ${rawSubraces.length} Subraces...`);
      await db
        .insert(subraces)
        .values(
          rawSubraces.map((sr: any) => ({
            id: sr.id,
            parentRaceId: sr.parentRaceId,
            name: sr.name,
            lore: sr.lore,
          })),
        )
        .onConflictDoNothing();

      const subraceTraitsData = rawSubraces.flatMap((sr: any) =>
        (sr.traitsAdded || []).map((traitId: string) => ({
          subraceId: sr.id,
          traitId,
        })),
      );
      if (subraceTraitsData.length > 0)
        await db
          .insert(subraceTraits)
          .values(subraceTraitsData)
          .onConflictDoNothing();
    }

    // 6. LOAD: Classes & Subclasses
    const rawClasses = await loadJsonData<any>("classes.json");
    const rawSubclasses = await loadJsonData<any>("subclasses.json");

    if (rawClasses.length > 0) {
      console.log(`Processing ${rawClasses.length} Classes...`);
      await db
        .insert(classes)
        .values(
          rawClasses.map((c: any) => ({
            id: c.id,
            name: c.name,
            hitDie: c.hitDie,
            subclassRequirementLevel: c.subclassInfo?.choiceLevel || 3, // Strict gatekeeper
            startingEquipment: c.startingEquipment || {},
            lore: c.lore,
          })),
        )
        .onConflictDoNothing();

      // Explode Class Progression Arrays
      const classLevelsData: any[] = [];
      const classProgressionsData: any[] = [];

      rawClasses.forEach((c: any) => {
        (c.progression || []).forEach((p: any) => {
          classLevelsData.push({
            classId: c.id,
            level: p.level,
            classSpecificScaling: p.classSpecificScaling || null,
            spellcastingProgression: p.spellcastingProgression || null,
          });

          (p.features || []).forEach((traitId: string) => {
            classProgressionsData.push({
              classId: c.id,
              level: p.level,
              traitId,
            });
          });
        });
      });

      if (classLevelsData.length > 0)
        await db
          .insert(classLevels)
          .values(classLevelsData)
          .onConflictDoNothing();
      if (classProgressionsData.length > 0)
        await db
          .insert(classProgressions)
          .values(classProgressionsData)
          .onConflictDoNothing();
    }

    if (rawSubclasses.length > 0) {
      console.log(`Processing ${rawSubclasses.length} Subclasses...`);
      await db
        .insert(subclasses)
        .values(
          rawSubclasses.map((sc: any) => ({
            id: sc.id,
            parentClassId: sc.parentClassId,
            name: sc.name,
            lore: sc.lore,
          })),
        )
        .onConflictDoNothing();

      // explode subclass progression arrays
      const subclassLevelsData: any[] = [];
      const subclassProgressionsData: any[] = [];

      rawSubclasses.forEach((sc: any) => {
        (sc.progression || []).forEach((p: any) => {
          subclassLevelsData.push({
            subclassId: sc.id,
            level: p.level,
            subclassSpecificScaling: p.subclassSpecificScaling || null,
            bonusSpells: p.bonusSpells || null,
            spellsAddedToList: p.spellsAddedToList || null,
          });

          (p.features || []).forEach((traitId: string) => {
            subclassProgressionsData.push({
              subclassId: sc.id,
              level: p.level,
              traitId,
            });
          });
        });
      });

      // execute remaining insertions
      if (subclassLevelsData.length > 0)
        await db
          .insert(subclassLevels)
          .values(subclassLevelsData)
          .onConflictDoNothing();

      if (subclassProgressionsData.length > 0)
        await db
          .insert(subclassProgressions)
          .values(subclassProgressionsData)
          .onConflictDoNothing();
    }

    console.log("ETL Pipeline Execution Complete");
  } catch (error) {
    console.error("Fatal Pipeline Failure:", error);
    throw error;
  }
};

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
  }
};

const main = async () => {
  try {
    await runMigration();
    await seed();
  } finally {
    await client.end();
  }
};

main().catch((error) => {
  console.error("Seed script failed:", error);
  process.exit(1);
});
