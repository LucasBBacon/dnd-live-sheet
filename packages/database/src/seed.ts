import * as dotenv from "dotenv";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
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
  classMulticlassTraits,
  subclasses,
  subclassLevels,
  subclassProgressions,
  items,
  bundleContents,
} from "./schema/reference.js";
import { ClassMulticlassPrerequisitesSchema } from "@project/shared";
import {
  campaignMembers,
  campaigns,
  characterClasses,
  characters,
  characterTraits,
} from "./schema/operational.js";
import { extractItemsForMigration } from "./itemsExtraction.js";

dotenv.config({ path: "../../.env" });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is missing");

const client = postgres(connectionString);
const db = drizzle(client);

const CORE_PACK_ID = "core_seed_2014";
const CORE_PACK_VERSION = 1;
const CORE_PUBLISHED_AT = new Date();

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

const normalizeMulticlassTraitIds = ({
  classId,
  multiclassTraits,
}: {
  classId: string;
  multiclassTraits: unknown;
}): string[] => {
  if (multiclassTraits === undefined) {
    throw new Error(
      `Core class ${classId} is missing required multiclassTraits field.`,
    );
  }

  if (!Array.isArray(multiclassTraits)) {
    throw new Error(
      `Core class ${classId} is missing required multiclassTraits array.`,
    );
  }

  if (
    multiclassTraits.some(
      (traitId) => typeof traitId !== "string" || traitId.trim().length === 0,
    )
  ) {
    throw new Error(
      `Core class ${classId} has invalid multiclassTraits entries.`,
    );
  }

  const traitIds = multiclassTraits.map((traitId) => traitId.trim());

  return [...new Set(traitIds)];
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

      for (const traitId of cls.multiclassTraits || []) {
        if (typeof traitId === "string") referencedTraitIds.add(traitId);
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
        packId: CORE_PACK_ID,
        packVersion: CORE_PACK_VERSION,
        publishedAt: CORE_PUBLISHED_AT,
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
        packId: CORE_PACK_ID,
        packVersion: CORE_PACK_VERSION,
        publishedAt: CORE_PUBLISHED_AT,
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
        packId: CORE_PACK_ID,
        packVersion: CORE_PACK_VERSION,
        publishedAt: CORE_PUBLISHED_AT,
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
            packId: sql`excluded.pack_id`,
            packVersion: sql`excluded.pack_version`,
            publishedAt: sql`excluded.published_at`,
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
            packId: CORE_PACK_ID,
            packVersion: CORE_PACK_VERSION,
            publishedAt: CORE_PUBLISHED_AT,
          })),
        )
        .onConflictDoUpdate({
          target: subraces.id,
          set: {
            parentRaceId: sql`excluded.parent_race_id`,
            name: sql`excluded.name`,
            lore: sql`excluded.lore`,
            packId: sql`excluded.pack_id`,
            packVersion: sql`excluded.pack_version`,
            publishedAt: sql`excluded.published_at`,
          },
        });

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
      const classRows = rawClasses.map((c: any) => ({
        id: c.id,
        name: c.name,
        hitDie: c.hitDie,
        subclassRequirementLevel: c.subclassInfo?.choiceLevel || 3, // Strict gatekeeper
        startingEquipment: c.startingEquipment || {},
        multiclassPrerequisites: c.multiclassPrerequisites
          ? ClassMulticlassPrerequisitesSchema.parse(c.multiclassPrerequisites)
          : null,
        lore: normalizeLore(c.lore, c.name ?? c.id ?? "Class"),
        packId: CORE_PACK_ID,
        packVersion: CORE_PACK_VERSION,
        publishedAt: CORE_PUBLISHED_AT,
      }));

      const multiclassTraitRows = rawClasses.flatMap((c: any) =>
        normalizeMulticlassTraitIds({
          classId: c.id,
          multiclassTraits: c.multiclassTraits,
        }).map((traitId) => ({
          classId: c.id,
          traitId,
        })),
      );

      await db
        .insert(classes)
        .values(classRows)
        .onConflictDoUpdate({
          target: classes.id,
          set: {
            name: sql`excluded.name`,
            hitDie: sql`excluded.hit_die`,
            subclassRequirementLevel: sql`excluded.subclass_req_level`,
            startingEquipment: sql`excluded.starting_equipment`,
            multiclassPrerequisites: sql`excluded.multiclass_prerequisites`,
            lore: sql`excluded.lore`,
            packId: sql`excluded.pack_id`,
            packVersion: sql`excluded.pack_version`,
            publishedAt: sql`excluded.published_at`,
          },
        });

      // class_multiclass_traits must match classes.json exactly for core classes.
      await db
        .delete(classMulticlassTraits)
        .where(inArray(classMulticlassTraits.classId, classRows.map((c) => c.id)));

      await db
        .insert(classMulticlassTraits)
        .values(multiclassTraitRows)
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
            packId: CORE_PACK_ID,
            packVersion: CORE_PACK_VERSION,
            publishedAt: CORE_PUBLISHED_AT,
          })),
        )
        .onConflictDoUpdate({
          target: subclasses.id,
          set: {
            parentClassId: sql`excluded.parent_class_id`,
            name: sql`excluded.name`,
            lore: sql`excluded.lore`,
            packId: sql`excluded.pack_id`,
            packVersion: sql`excluded.pack_version`,
            publishedAt: sql`excluded.published_at`,
          },
        });

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
            packId: CORE_PACK_ID,
            packVersion: CORE_PACK_VERSION,
            publishedAt: CORE_PUBLISHED_AT,
          })),
        )
        .onConflictDoUpdate({
          target: backgrounds.id,
          set: {
            name: sql`excluded.name`,
            featureName: sql`excluded.feature_name`,
            featureDescription: sql`excluded.feature_description`,
            ideals: sql`excluded.ideals`,
            bonds: sql`excluded.bonds`,
            flaws: sql`excluded.flaws`,
            personalityTraits: sql`excluded.personality_traits`,
            startingEquipment: sql`excluded.starting_equipment`,
            lore: sql`excluded.lore`,
            packId: sql`excluded.pack_id`,
            packVersion: sql`excluded.pack_version`,
            publishedAt: sql`excluded.published_at`,
          },
        });

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
      const extractedItems = extractItemsForMigration(rawItems);
      console.log(
        `Processing ${extractedItems.seedItems.length} Items (from ${rawItems.length} source rows)...`,
      );

      if (extractedItems.diagnostics.duplicateIds.length > 0) {
        console.warn(
          `Detected ${extractedItems.diagnostics.duplicateIds.length} duplicate item IDs in items.json. Keeping first occurrence for each duplicate.`,
        );
      }

      if (extractedItems.diagnostics.missingAmmoItemRefs.length > 0) {
        console.warn(
          `Detected ${extractedItems.diagnostics.missingAmmoItemRefs.length} weapons with missing ammo references.`,
        );
      }

      if (extractedItems.diagnostics.unsupportedWeaponProperties.length > 0) {
        console.warn(
          `Detected ${extractedItems.diagnostics.unsupportedWeaponProperties.length} unsupported weapon property mappings.`,
        );
      }

      await db
        .insert(items)
        .values(
          extractedItems.seedItems.map((item) => ({
            ...item,
            packId: CORE_PACK_ID,
            packVersion: CORE_PACK_VERSION,
            publishedAt: CORE_PUBLISHED_AT,
          })),
        )
        .onConflictDoUpdate({
          target: items.id,
          set: {
            name: sql`excluded.name`,
            weight: sql`excluded.weight`,
            description: sql`excluded.description`,
            itemRule: sql`excluded.item_rule`,
            weaponRule: sql`excluded.weapon_rule`,
            isBundle: sql`excluded.is_bundle`,
            packId: sql`excluded.pack_id`,
            packVersion: sql`excluded.pack_version`,
            publishedAt: sql`excluded.published_at`,
          },
        });

      await db
        .update(classProgressions)
        .set({
          packId: CORE_PACK_ID,
          packVersion: CORE_PACK_VERSION,
          publishedAt: CORE_PUBLISHED_AT,
        })
        .where(eq(classProgressions.sourceType, "core"));


    await db
      .update(traits)
      .set({
        packId: CORE_PACK_ID,
        packVersion: CORE_PACK_VERSION,
        publishedAt: CORE_PUBLISHED_AT,
      })
      .where(eq(traits.sourceType, "core"));

    await db
      .update(feats)
      .set({
        packId: CORE_PACK_ID,
        packVersion: CORE_PACK_VERSION,
        publishedAt: CORE_PUBLISHED_AT,
      })
      .where(eq(feats.sourceType, "core"));

    await db
      .update(races)
      .set({
        packId: CORE_PACK_ID,
        packVersion: CORE_PACK_VERSION,
        publishedAt: CORE_PUBLISHED_AT,
      })
      .where(eq(races.sourceType, "core"));

    await db
      .update(subraces)
      .set({
        packId: CORE_PACK_ID,
        packVersion: CORE_PACK_VERSION,
        publishedAt: CORE_PUBLISHED_AT,
      })
      .where(eq(subraces.sourceType, "core"));

    await db
      .update(classes)
      .set({
        packId: CORE_PACK_ID,
        packVersion: CORE_PACK_VERSION,
        publishedAt: CORE_PUBLISHED_AT,
      })
      .where(eq(classes.sourceType, "core"));

    await db
      .update(subclasses)
      .set({
        packId: CORE_PACK_ID,
        packVersion: CORE_PACK_VERSION,
        publishedAt: CORE_PUBLISHED_AT,
      })
      .where(eq(subclasses.sourceType, "core"));

    await db
      .update(backgrounds)
      .set({
        packId: CORE_PACK_ID,
        packVersion: CORE_PACK_VERSION,
        publishedAt: CORE_PUBLISHED_AT,
      })
      .where(eq(backgrounds.sourceType, "core"));

    await db
      .update(items)
      .set({
        packId: CORE_PACK_ID,
        packVersion: CORE_PACK_VERSION,
        publishedAt: CORE_PUBLISHED_AT,
      })
      .where(eq(items.sourceType, "core"));

    await db
      .update(classProgressions)
      .set({
        packId: CORE_PACK_ID,
        packVersion: CORE_PACK_VERSION,
        publishedAt: CORE_PUBLISHED_AT,
      })
      .where(eq(classProgressions.sourceType, "core"));

    await db
      .update(subclassProgressions)
      .set({
        packId: CORE_PACK_ID,
        packVersion: CORE_PACK_VERSION,
        publishedAt: CORE_PUBLISHED_AT,
      })
      .where(eq(subclassProgressions.sourceType, "core"));
      await db
        .update(subclassProgressions)
        .set({
          packId: CORE_PACK_ID,
          packVersion: CORE_PACK_VERSION,
          publishedAt: CORE_PUBLISHED_AT,
        })
        .where(eq(subclassProgressions.sourceType, "core"));

      // Extract and load bundle relations (BOM)
      console.log(`Resolving Bundle Contents (BOM)...`);
      if (extractedItems.bundleContents.length > 0) {
        await db
          .insert(bundleContents)
          .values(extractedItems.bundleContents)
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

  try {
    const campaignId = "00000000-0000-0000-0000-000000000001";
    const characterId = "00000000-0000-0000-0000-000000000101";

    await db
      .insert(campaigns)
      .values({
        id: campaignId,
        name: "Dev Smoke Campaign",
        createdByUserId: "dev-user-1",
      })
      .onConflictDoNothing({ target: campaigns.id });

    await db
      .insert(campaignMembers)
      .values({
        campaignId,
        userId: "dev-user-1",
        role: "owner",
      })
      .onConflictDoNothing();

    await db
      .insert(characters)
      .values({
        id: characterId,
        campaignId,
        name: "Thoradin",
        level: 1,
        raceId: "race_dwarf",
        subraceId: "subrace_dwarf_hill",
        str: 16,
        dex: 14,
        con: 15,
        int: 8,
        wis: 10,
        cha: 12,
        alignment: "Lawful Good",
        currentHp: 12,
        maxHp: 12,
        temporaryInventory: [],
      })
      .onConflictDoNothing({ target: characters.id });

    await db
      .insert(characterClasses)
      .values({
        characterId,
        classId: "class_fighter",
        classLevel: 1,
      })
      .onConflictDoNothing();

    await db
      .insert(characterTraits)
      .values({
        id: "00000000-0000-0000-0000-000000000201",
        characterId,
        traitId: "trait_fighter_proficiencies",
        source: "class_fighter_level_1",
      })
      .onConflictDoNothing({ target: characterTraits.id });

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
