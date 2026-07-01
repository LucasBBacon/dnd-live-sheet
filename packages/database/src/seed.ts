import type { CharacterEngineData } from "@project/shared";
import * as dotenv from "dotenv";
import { sql } from "drizzle-orm";
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
  backgrounds,
  backgroundTraits,
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
  items,
  bundleContents,
} from "./schema/reference.js";

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

const traitIdToName = (traitId: string): string =>
  traitId
    .replace(/^trait_/, "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const normalizeLore = (
  lore: unknown,
  fallbackName: string,
): { shortDescription: string; fullText?: string } => {
  if (
    lore &&
    typeof lore === "object" &&
    "shortDescription" in lore &&
    typeof (lore as { shortDescription?: unknown }).shortDescription ===
      "string"
  ) {
    return lore as { shortDescription: string; fullText?: string };
  }

  return {
    shortDescription: `${fallbackName} reference data.`,
    fullText: "",
  };
};

const runMigration = async () => {
  console.log("Initiating Reference Data ETL Pipeline...");

  try {
    // EXTRACT: load raw JSON payloads
    const rawTraits = await loadJsonData<any>("traits.json");
    const rawFeats = await loadJsonData<any>("feats.json");
    const rawRaces = await loadJsonData<any>("races.json");
    const rawSubraces = await loadJsonData<any>("subraces.json");
    const rawClasses = await loadJsonData<any>("classes.json");
    const rawSubclasses = await loadJsonData<any>("subclasses.json");
    const rawBackgrounds = await loadJsonData<any>("backgrounds.json");

    const knownTraitIds = new Set<string>(
      rawTraits
        .map((t: any) => t.id)
        .filter((id: unknown): id is string => typeof id === "string"),
    );

    const referencedTraitIds = new Set<string>();

    for (const feat of rawFeats) {
      for (const traitId of feat.grantedTraits || []) {
        if (typeof traitId === "string") referencedTraitIds.add(traitId);
      }
    }

    for (const race of rawRaces) {
      for (const traitId of race.traits || []) {
        if (typeof traitId === "string") referencedTraitIds.add(traitId);
      }
    }

    for (const subrace of rawSubraces) {
      for (const traitId of subrace.traitsAdded || []) {
        if (typeof traitId === "string") referencedTraitIds.add(traitId);
      }
    }

    for (const cls of rawClasses) {
      for (const progression of cls.progression || []) {
        for (const traitId of progression.features || []) {
          if (typeof traitId === "string") referencedTraitIds.add(traitId);
        }
      }
    }

    for (const subclass of rawSubclasses) {
      for (const progression of subclass.progression || []) {
        for (const traitId of progression.features || []) {
          if (typeof traitId === "string") referencedTraitIds.add(traitId);
        }
      }
    }

    for (const background of rawBackgrounds) {
      for (const traitId of background.backgroundTraits || []) {
        if (typeof traitId === "string") referencedTraitIds.add(traitId);
      }
    }

    const missingTraitRows: Array<{
      id: string;
      name: string;
      lore: { shortDescription: string; fullText?: string };
      effects: unknown[];
      isStartingProficiency: boolean;
    }> = [...referencedTraitIds]
      .filter((traitId) => !knownTraitIds.has(traitId))
      .map((traitId) => ({
        id: traitId,
        name: traitIdToName(traitId),
        lore: {
          shortDescription:
            "Auto-generated placeholder trait from source references.",
          fullText:
            "This trait was generated during seeding because it is referenced by progression or reference data but is missing from traits.json.",
        },
        effects: [],
        isStartingProficiency: false,
      }));

    // LOAD: traits (base entity)
    if (rawTraits.length > 0) {
      console.log(`Processing ${rawTraits.length} Traits...`);

      const mappedTraits = rawTraits.map((t: any) => ({
        id: t.id,
        name: t.name,
        lore: normalizeLore(t.lore, t.name ?? t.id ?? "Trait"),
        effects: t.effects || [],
        isStartingProficiency: t.isStartingProficiency ?? false,
      }));

      await db
        .insert(traits)
        .values(mappedTraits)
        .onConflictDoNothing({ target: traits.id });

      if (missingTraitRows.length > 0) {
        console.warn(
          `Detected ${missingTraitRows.length} missing referenced traits. Creating placeholders to satisfy foreign keys.`,
        );
        await db
          .insert(traits)
          .values(missingTraitRows as any[])
          .onConflictDoNothing({ target: traits.id });
      }
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
        lore: normalizeLore(f.lore, f.name ?? f.id ?? "Feat"),
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

    if (rawRaces.length > 0) {
      console.log(`Processing ${rawRaces.length} Races...`);
      const mappedRaces = rawRaces.map((r: any) => ({
        id: r.id,
        name: r.name,
        speed: normalizeSpeed(r.speed),
        requiresSubrace: !!r.subraceInfo,
        displayLabel: r.subraceInfo?.displayLabel ?? "",
        lore: normalizeLore(r.lore, r.name ?? r.id ?? "Race"),
      }));

      await db
        .insert(races)
        .values(mappedRaces)
        .onConflictDoUpdate({
          target: races.id,
          set: {
            name: sql`excluded.name`,
            speed: sql`excluded.speed`,
            requiresSubrace: sql`excluded.requires_subrace`,
            displayLabel: sql`excluded.display_label`,
            lore: sql`excluded.lore`,
          },
        });

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
            lore: normalizeLore(sr.lore, sr.name ?? sr.id ?? "Subrace"),
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
            lore: normalizeLore(c.lore, c.name ?? c.id ?? "Class"),
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
            lore: normalizeLore(sc.lore, sc.name ?? sc.id ?? "Subclass"),
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

    if (rawBackgrounds.length > 0) {
      console.log(`Processing ${rawBackgrounds.length} Backgrounds...`);

      await db
        .insert(backgrounds)
        .values(
          rawBackgrounds.map((b: any) => ({
            id: b.id,
            name: b.name,
            featureName: b.featureName,
            featureDescription: b.featureDescription,
            ideals: b.ideals || [],
            bonds: b.bonds || [],
            flaws: b.flaws || [],
            personalityTraits: b.personalityTraits || [],
            startingEquipment: b.startingEquipment || {},
            lore: normalizeLore(b.lore, b.name ?? b.id ?? "Background"),
          })),
        )
        .onConflictDoNothing();

      const backgroundTraitsData = rawBackgrounds.flatMap((b: any) =>
        (b.backgroundTraits || []).map((traitId: string) => ({
          backgroundId: b.id,
          traitId,
        })),
      );

      if (backgroundTraitsData.length > 0)
        await db
          .insert(backgroundTraits)
          .values(backgroundTraitsData)
          .onConflictDoNothing();
    }

    // LOAD: ITEMS AND BUNDLES
    const rawItems = await loadJsonData<any>("items.json");

    if (rawItems.length > 0) {
      console.log(`Processing ${rawItems.length} Items...`);

      // Extract and load base items
      const mappedItems = rawItems.map((i: any) => ({
        id: i.id,
        name: i.name,
        weight: i.weight || 0,
        description:
          i.description ||
          i.lore?.shortDescription ||
          "No description available.",
        isBundle: i.isBundle || false,
      }));

      await db
        .insert(items)
        .values(mappedItems)
        .onConflictDoNothing({ target: items.id });

      // Extract and load bundle relations (BOM)
      console.log(`Resolving Bundle Contents (BOM)...`);
      const bomRelations: {
        bundleId: string;
        itemId: string;
        quantity: number;
      }[] = [];

      for (const item of rawItems) {
        if (item.isBundle && Array.isArray(item.bundleContents)) {
          for (const content of item.bundleContents) {
            bomRelations.push({
              bundleId: item.id,
              itemId: content.itemId,
              quantity: content.quantity || 1,
            });
          }
        }
      }

      if (bomRelations.length > 0) {
        await db
          .insert(bundleContents)
          .values(bomRelations)
          .onConflictDoNothing();
      }
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
