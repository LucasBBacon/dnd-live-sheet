/**
 * Development database seeding.
 *
 * Reference data no longer arrives here. It used to: this file read
 * data/*.json and wrote the traits, races, classes, subclasses, feats,
 * backgrounds and items tables, and the trait branch of that ETL wrote
 * `effects: []` placeholders for every id the JSON did not define - the
 * silence that left five barbarian features looking implemented while they
 * were dormant.
 *
 * Rules content now comes from packs and nothing else. To populate the
 * reference tables, import a pack:
 *
 *   pnpm --filter @project/database db:import-pack
 *
 * What remains here is operational scaffolding only. The dev characters live
 * in seedSampleCharacters.ts, which brings its own campaign.
 */
import * as dotenv from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { campaignMembers, campaigns } from "./schema/operational.js";

dotenv.config({ path: "../../.env" });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is missing");

const client = postgres(connectionString);
const db = drizzle(client);

const DEV_CAMPAIGN_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Creates the campaign a dev session needs to have somewhere to put a
 * character. Idempotent.
 */
const seed = async () => {
  console.log("Seeding operational data...");

  await db
    .insert(campaigns)
    .values({
      id: DEV_CAMPAIGN_ID,
      name: "Dev Smoke Campaign",
      createdByUserId: "dev-user-1",
    })
    .onConflictDoNothing({ target: campaigns.id });

  await db
    .insert(campaignMembers)
    .values({
      campaignId: DEV_CAMPAIGN_ID,
      userId: "dev-user-1",
      role: "owner",
    })
    .onConflictDoNothing();

  console.log("Seeding complete. Reference data comes from db:import-pack.");
};

const main = async () => {
  try {
    await seed();
  } finally {
    await client.end();
  }
};

main().catch((error) => {
  console.error("Seed script failed:", error);
  process.exit(1);
});
